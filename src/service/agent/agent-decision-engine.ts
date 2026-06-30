import type { AgentWorldbookControl_ACU } from '../../data/models/settings-model';
import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { getLorebookEntries_ACU } from '../../data/gateways/worldbook-gateway';
import { normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU, logWarn_ACU } from '../../shared/utils';
import { estimateTextTk_ACU, normalizeTkBudgetNumber_ACU } from '../../shared/token-estimate';
import { callAIWithPreset_ACU } from '../ai/api-call';
import { normalizePlotTask_ACU } from '../plot/plot-logic';
import { refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU } from './agent-worldbook-takeover';
import { parseWorldbookSkillMetaFromComment_ACU } from './agent-worldbook-skill-meta';
import {
  getDefaultAgentDecisionPromptSegments_ACU,
  normalizeAgentContextSettings_ACU,
  renderAgentPromptSegments_ACU,
} from './agent-prompt-template';
import {
  collectWorldbookSkillifyCandidates_ACU,
  getWorldbookEntryKeywordsForSkillify_ACU,
  resolvePlotWorldbookSkillifyBookNames_ACU,
} from './agent-skillify-service';

export interface AgentWorldbookRef_ACU {
  bookName: string;
  uid: string | number;
  reason?: string;
  index?: number;
  tk?: number;
}

export interface AgentTaskPlanItem_ACU {
  taskId: string;
  run: boolean;
  effectiveStage: number;
  effectiveOrder: number;
  mode?: string;
  reason?: string;
}

export interface AgentDecisionResult_ACU {
  active: boolean;
  fallbackReason?: string;
  rawResponse?: string;
  taskPlan: AgentTaskPlanItem_ACU[];
  plotGreenlights: Record<string, AgentWorldbookRef_ACU[]>;
  finalGenerationGreenlights: AgentWorldbookRef_ACU[];
  effectiveTasks: any[];
}

interface AgentWorldbookSummary_ACU extends AgentWorldbookRef_ACU {
  comment: string;
  keys: string[];
  description: string;
  triggerWhen: string;
  tk: number;
}


function normalizeId_ACU(value: unknown): string {
  return String(value || '').trim();
}

function refKey_ACU(bookName: string, uid: string | number): string {
  return `${bookName}\u0000${String(uid)}`;
}

type AgentContextMessage_ACU = Record<string, any>;

function getMessageText_ACU(message: AgentContextMessage_ACU | null | undefined): string {
  if (!message) return '';
  return String(message.mes ?? message.message ?? message.content ?? '').trim();
}

function getMessageSpeaker_ACU(message: AgentContextMessage_ACU | null | undefined, fallback: string): string {
  const name = String(message?.name || '').trim();
  return name || fallback;
}

function getPlotTextFromMessage_ACU(message: AgentContextMessage_ACU | null | undefined): string {
  if (!message) return '';
  const directPlot = typeof message.qrf_plot === 'string' ? message.qrf_plot.trim() : '';
  if (directPlot) return directPlot;
  const taskPlots = message.qrf_plot_tasks;
  if (!taskPlots || typeof taskPlots !== 'object' || Array.isArray(taskPlots)) return '';
  return Object.entries(taskPlots)
    .map(([taskId, content]) => {
      const text = typeof content === 'string' ? content.trim() : '';
      return text ? `【${taskId}】\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function normalizeMessageArray_ACU(value: unknown): AgentContextMessage_ACU[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as AgentContextMessage_ACU[] : [];
}

function resolveAgentContextMessages_ACU(sharedContext: Record<string, any>, key: string): AgentContextMessage_ACU[] {
  if (sharedContext && Object.prototype.hasOwnProperty.call(sharedContext, key)) {
    return normalizeMessageArray_ACU(sharedContext[key]);
  }
  const fallbackMessages = normalizeMessageArray_ACU(sharedContext?.recentContextMessages);
  if (fallbackMessages.length > 0) return fallbackMessages;
  try {
    return normalizeMessageArray_ACU(getChatArray_ACU());
  } catch {
    return [];
  }
}

function collectRecentAiLayerPairs_ACU(
  messages: AgentContextMessage_ACU[],
  layerLimit: number,
): Array<{ user?: AgentContextMessage_ACU; ai: AgentContextMessage_ACU }> {
  const limit = normalizePositiveInteger_ACU(layerLimit, 1);
  const pairs: Array<{ user?: AgentContextMessage_ACU; ai: AgentContextMessage_ACU }> = [];
  for (let i = messages.length - 1; i >= 0 && pairs.length < limit; i--) {
    const ai = messages[i];
    if (!ai || ai.is_user || ai._qrf_from_planning) continue;
    const previous = i > 0 && messages[i - 1]?.is_user ? messages[i - 1] : undefined;
    pairs.unshift({ user: previous, ai });
  }
  return pairs;
}

function formatRecentContextByAiLayers_ACU(messages: AgentContextMessage_ACU[], layerLimit: number): string {
  const pairs = collectRecentAiLayerPairs_ACU(messages, layerLimit);
  return pairs
    .map((pair, index) => {
      const isLatestLayer = index === pairs.length - 1;
      const lines = [`【最近上下文 AI层 ${index + 1}】`];
      if (isLatestLayer) {
        const userText = getMessageText_ACU(pair.user);
        if (userText) lines.push(`${getMessageSpeaker_ACU(pair.user, '用户')}: ${userText}`);
        const userPlot = getPlotTextFromMessage_ACU(pair.user);
        if (userPlot) lines.push(`剧情推进记录: ${userPlot}`);
      }
      const aiText = getMessageText_ACU(pair.ai);
      if (aiText) lines.push(`${getMessageSpeaker_ACU(pair.ai, 'AI')}: ${aiText}`);
      return lines.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function resolveLegacyPreviousPlotPlaceholder_ACU(recentContext: string, legacyPlotContent: unknown): string {
  if (recentContext) return recentContext;
  return String(legacyPlotContent || '').trim();
}

function extractJsonObjectText_ACU(text: string): string | null {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function emptyDecision_ACU(effectiveTasks: any[], fallbackReason: string): AgentDecisionResult_ACU {
  return {
    active: false,
    fallbackReason,
    taskPlan: [],
    plotGreenlights: {},
    finalGenerationGreenlights: [],
    effectiveTasks,
  };
}

function isAgentModeEnabled_ACU(control: AgentWorldbookControl_ACU | null): boolean {
  return control.enabled === true && control.mode === 'agent';
}

function resolveResolvedAgentWorldbookControl_ACU(params: {
  agentWorldbookControl?: AgentWorldbookControl_ACU | null;
  sharedContext?: Record<string, any>;
}): AgentWorldbookControl_ACU | null {
  const direct = params.agentWorldbookControl;
  if (direct && typeof direct === 'object') return direct;
  const fromContext = params.sharedContext?.agentWorldbookControl;
  return fromContext && typeof fromContext === 'object' ? fromContext as AgentWorldbookControl_ACU : null;
}

function parseAgentDecisionResponse_ACU(responseText: string): any | null {
  const jsonText = extractJsonObjectText_ACU(responseText);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function resolveWorldbookEntryTk_ACU(entry: Record<string, any>, meta: ReturnType<typeof parseWorldbookSkillMetaFromComment_ACU>, comment: string): number {
  const metaTk = Number(meta?.tk);
  if (Number.isFinite(metaTk) && metaTk > 0) return Math.trunc(metaTk);
  return estimateTextTk_ACU(entry?.content || comment);
}

function hasUsableWorldbookSkillMeta_ACU(meta: ReturnType<typeof parseWorldbookSkillMetaFromComment_ACU>): boolean {
  return !!meta && (!!String(meta.description || '').trim() || !!String(meta.triggerWhen || '').trim());
}

async function collectWorldbookSummariesFromSnapshot_ACU(
  contextSettings: ReturnType<typeof normalizeAgentContextSettings_ACU>,
): Promise<{ summaries: AgentWorldbookSummary_ACU[]; allowedKeys: Set<string> }> {
  const snapshot = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
  const summaries: AgentWorldbookSummary_ACU[] = [];
  const allowedKeys = new Set<string>();

  for (const [bookName, snapshotEntries] of Object.entries(snapshot.books || {})) {
    const entries = await getLorebookEntries_ACU(bookName);
    const list = Array.isArray(snapshotEntries) ? snapshotEntries : [];
    for (const snapshotEntry of list) {
      const uid = snapshotEntry?.uid;
      if (uid === null || uid === undefined || String(uid).trim() === '') continue;
      const entry = (entries || []).find(item => String(item?.uid) === String(uid));
      if (!entry) continue;
      const comment = String(entry.comment || entry.name || '');
      const meta = parseWorldbookSkillMetaFromComment_ACU(comment);
      if (!hasUsableWorldbookSkillMeta_ACU(meta)) continue;
      allowedKeys.add(refKey_ACU(bookName, uid));
      const index = summaries.length + 1;
      summaries.push({
        bookName,
        uid,
        index,
        comment,
        keys: getWorldbookEntryKeywordsForSkillify_ACU(entry),
        description: meta?.description || '',
        triggerWhen: meta?.triggerWhen || '',
        tk: resolveWorldbookEntryTk_ACU(entry, meta, comment),
      });
    }
  }

  if (allowedKeys.size > 0) {
    return { summaries, allowedKeys };
  }

  const bookNames = await resolvePlotWorldbookSkillifyBookNames_ACU();
  const candidates = await collectWorldbookSkillifyCandidates_ACU(bookNames, { maxEntries: contextSettings.decisionWorldbookCandidateLimit });
  for (const candidate of candidates) {
    const meta = candidate.existingSkillMeta;
    if (!hasUsableWorldbookSkillMeta_ACU(meta)) continue;
    allowedKeys.add(refKey_ACU(candidate.bookName, candidate.uid));
    const index = summaries.length + 1;
    summaries.push({
      bookName: candidate.bookName,
      uid: candidate.uid,
      index,
      comment: candidate.comment,
      keys: candidate.keys,
      description: meta?.description || '',
      triggerWhen: meta?.triggerWhen || '',
      tk: candidate.tk,
    });
  }

  return { summaries, allowedKeys };
}

function formatWorldbookPromptEntries_ACU(
  summaries: AgentWorldbookSummary_ACU[],
  limit: number,
): Array<Pick<AgentWorldbookSummary_ACU, 'index' | 'bookName' | 'uid' | 'description' | 'triggerWhen' | 'tk'> & { tokenEstimate: number; tokenDescription: string }> {
  return summaries.slice(0, limit).map((summary, index) => ({
    index: summary.index || index + 1,
    bookName: summary.bookName,
    uid: summary.uid,
    description: summary.description || '',
    triggerWhen: summary.triggerWhen || '',
    tk: summary.tk,
    tokenEstimate: summary.tk,
    tokenDescription: `预计消耗 ${summary.tk} Token；tk 是兼容字段，与 tokenEstimate 含义相同`,
  }));
}


function trimGreenlightReason_ACU(value: unknown): string {
  const reason = String(value || '').trim();
  return reason.length > 120 ? `${reason.slice(0, 120)}…` : reason;
}

function findWorldbookSummaryByIndex_ACU(index: unknown, summaries: AgentWorldbookSummary_ACU[]): AgentWorldbookSummary_ACU | null {
  const rawIndex = Number(index);
  if (!Number.isFinite(rawIndex) || rawIndex <= 0) return null;
  const normalizedIndex = Math.trunc(rawIndex);
  return summaries.find(summary => summary.index === normalizedIndex) || summaries[normalizedIndex - 1] || null;
}

function pushWorldbookRef_ACU(
  refs: AgentWorldbookRef_ACU[],
  seen: Set<string>,
  allowedKeys: Set<string>,
  bookName: string,
  uid: string | number,
  reason: unknown,
): void {
  if (!bookName || uid === null || uid === undefined || String(uid).trim() === '') return;
  const key = refKey_ACU(bookName, uid);
  if (!allowedKeys.has(key) || seen.has(key)) return;
  seen.add(key);
  refs.push({ bookName, uid, reason: trimGreenlightReason_ACU(reason) });
}

function normalizeIndexedWorldbookRefs_ACU(
  item: unknown,
  summaries: AgentWorldbookSummary_ACU[],
  allowedKeys: Set<string>,
  refs: AgentWorldbookRef_ACU[],
  seen: Set<string>,
): boolean {
  if (typeof item === 'number' || typeof item === 'string') {
    const summary = findWorldbookSummaryByIndex_ACU(item, summaries);
    if (!summary) return true;
    pushWorldbookRef_ACU(refs, seen, allowedKeys, summary.bookName, summary.uid, '');
    return true;
  }
  if (!item || typeof item !== 'object') return false;
  const raw = item as Record<string, unknown>;
  if (Array.isArray(raw.entries)) {
    for (const index of raw.entries) {
      const summary = findWorldbookSummaryByIndex_ACU(index, summaries);
      if (summary) pushWorldbookRef_ACU(refs, seen, allowedKeys, summary.bookName, summary.uid, raw.reason);
    }
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'index')) {
    const summary = findWorldbookSummaryByIndex_ACU(raw.index, summaries);
    if (summary) pushWorldbookRef_ACU(refs, seen, allowedKeys, summary.bookName, summary.uid, raw.reason);
    return true;
  }
  return false;
}

function normalizeWorldbookRefs_ACU(value: unknown, allowedKeys: Set<string>, summaries: AgentWorldbookSummary_ACU[]): AgentWorldbookRef_ACU[] {
  if (!Array.isArray(value)) return [];
  const refs: AgentWorldbookRef_ACU[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (normalizeIndexedWorldbookRefs_ACU(item, summaries, allowedKeys, refs, seen)) continue;
    const bookName = String((item as any)?.bookName || '').trim();
    const uid = (item as any)?.uid;
    pushWorldbookRef_ACU(refs, seen, allowedKeys, bookName, uid, (item as any)?.reason);
  }
  return refs;
}

function applyGreenlightTkBudget_ACU(refs: AgentWorldbookRef_ACU[], summaries: AgentWorldbookSummary_ACU[], maxBudget: number, maxEntries?: unknown): AgentWorldbookRef_ACU[] {
  const entryLimit = normalizePositiveInteger_ACU(maxEntries, refs.length || 1);
  const tkLimit = normalizeTkBudgetNumber_ACU(maxBudget, 0);
  const tkByRef = new Map(summaries.map(summary => [refKey_ACU(summary.bookName, summary.uid), summary.tk]));
  const selected: AgentWorldbookRef_ACU[] = [];
  let usedTk = 0;
  for (const ref of refs) {
    if (selected.length >= entryLimit) break;
    const tk = normalizeTkBudgetNumber_ACU(tkByRef.get(refKey_ACU(ref.bookName, ref.uid)), 0);
    if (tkLimit > 0 && usedTk + tk > tkLimit) continue;
    usedTk += tk;
    selected.push({ bookName: ref.bookName, uid: ref.uid, reason: ref.reason });
  }
  return selected;
}

function shouldSendPlotTaskToAgent_ACU(task: any): boolean {
  if (task?.agentControl?.selectable === false) return false;
  const description = String(task?.description || '').trim();
  const triggerWhen = String(task?.triggerWhen || '').trim();
  return !!(description || triggerWhen);
}

function hasDependencyCycle_ACU(taskIds: Set<string>, tasksById: Map<string, any>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (visited.has(taskId)) return false;
    if (visiting.has(taskId)) return true;
    visiting.add(taskId);
    const deps = Array.isArray(tasksById.get(taskId)?.agentControl?.dependsOnTaskIds)
      ? tasksById.get(taskId).agentControl.dependsOnTaskIds
      : [];
    for (const dep of deps) {
      const depId = normalizeId_ACU(dep);
      if (taskIds.has(depId) && visit(depId)) return true;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  };
  return Array.from(taskIds).some(visit);
}

function sortEffectiveTasks_ACU(tasks: any[]): any[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const leftStage = normalizePositiveInteger_ACU(left.task?.stage, 1);
      const rightStage = normalizePositiveInteger_ACU(right.task?.stage, 1);
      if (leftStage !== rightStage) return leftStage - rightStage;
      const leftOrder = normalizeNonNegativeInteger_ACU(left.task?.order, 0);
      const rightOrder = normalizeNonNegativeInteger_ACU(right.task?.order, 0);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.index - right.index;
    })
    .map(item => item.task);
}

function normalizeTaskPlan_ACU(rawPlan: unknown, enabledTasks: any[], userOrderedTasks: any[] = []): { plan: AgentTaskPlanItem_ACU[]; effectiveTasks: any[]; reason?: string } {
  const normalizedTasks = enabledTasks.map((task, index) => normalizePlotTask_ACU(task, { index, fallbackTask: task }));
  const normalizedUserOrderedTasks = userOrderedTasks.map((task, index) => normalizePlotTask_ACU(task, { index, fallbackTask: task }));
  if (!Array.isArray(rawPlan)) {
    if (normalizedTasks.length === 0 && normalizedUserOrderedTasks.length > 0) {
      return { plan: [], effectiveTasks: sortEffectiveTasks_ACU(normalizedUserOrderedTasks) };
    }
    if (normalizedTasks.length === 0) return { plan: [], effectiveTasks: [] };
    return { plan: [], effectiveTasks: enabledTasks, reason: 'missing_task_plan' };
  }
  const tasksById = new Map(normalizedTasks.map(task => [String(task.id), task]));
  const plan: AgentTaskPlanItem_ACU[] = [];
  const effectiveTasks: any[] = [];
  const selectedIds = new Set<string>();

  for (const item of rawPlan) {
    const taskId = normalizeId_ACU((item as any)?.taskId);
    const sourceTask = tasksById.get(taskId);
    if (!sourceTask) continue;
    if (sourceTask.agentControl?.selectable === false) {
      plan.push({ taskId, run: false, effectiveStage: sourceTask.stage || 1, effectiveOrder: sourceTask.order || 0, mode: String((item as any)?.mode || '').trim(), reason: 'task_not_selectable' });
      continue;
    }
    const run = (item as any)?.run !== false;
    const effectiveStage = normalizePositiveInteger_ACU((item as any)?.effectiveStage, sourceTask.stage || 1);
    const effectiveOrder = normalizeNonNegativeInteger_ACU((item as any)?.effectiveOrder, sourceTask.order || 0);
    plan.push({ taskId, run, effectiveStage, effectiveOrder, mode: String((item as any)?.mode || '').trim(), reason: String((item as any)?.reason || '').trim() });
    if (run) {
      selectedIds.add(taskId);
      effectiveTasks.push({ ...sourceTask, stage: effectiveStage, order: effectiveOrder, __agentEffective: true });
    }
  }

  const effectiveIds = new Set(effectiveTasks.map(task => String(task.id)));
  for (const task of normalizedUserOrderedTasks) {
    if (!task.id || effectiveIds.has(String(task.id))) continue;
    effectiveIds.add(String(task.id));
    effectiveTasks.push(task);
  }

  if (plan.length === 0) {
    if (effectiveTasks.length > 0) return { plan: [], effectiveTasks: sortEffectiveTasks_ACU(effectiveTasks) };
    if (normalizedTasks.length === 0) return { plan: [], effectiveTasks: [] };
    return { plan: [], effectiveTasks: enabledTasks, reason: 'no_valid_task_plan_items' };
  }
  if (selectedIds.size > 0 && hasDependencyCycle_ACU(selectedIds, tasksById)) {
    return { plan: [], effectiveTasks: enabledTasks, reason: 'task_dependency_cycle' };
  }
  return { plan, effectiveTasks: sortEffectiveTasks_ACU(effectiveTasks) };
}


function buildAgentDecisionPrompt_ACU(params: {
  plotSettings: Record<string, any>;
  userMessage: string;
  sharedContext: Record<string, any>;
  enabledTasks: any[];
  worldbookSummaries: AgentWorldbookSummary_ACU[];
  contextSettings: ReturnType<typeof normalizeAgentContextSettings_ACU>;
}): Array<{ role: string; content: string }> {
  const taskSummaries = params.enabledTasks.map((task, index) => {
    const normalized = normalizePlotTask_ACU(task, { index, fallbackTask: task });
    return {
      taskId: normalized.id,
      name: normalized.name,
      stage: normalized.stage,
      order: normalized.order,
      description: normalized.description || '',
      triggerWhen: normalized.triggerWhen || '',
      agentControl: normalized.agentControl || {},
    };
  }).filter(task => shouldSendPlotTaskToAgent_ACU(task));

  const control = params.plotSettings?.agentWorldbookControl || {};
  const recentContextMessages = resolveAgentContextMessages_ACU(params.sharedContext, 'recentContextMessages');
  const recentContext = formatRecentContextByAiLayers_ACU(recentContextMessages, params.contextSettings.decisionRecentContextCharLimit)
    || String(params.sharedContext?.seedContentForConditional || '').trim();
  const previousPlot = resolveLegacyPreviousPlotPlaceholder_ACU(recentContext, params.sharedContext?.lastPlotContent);

  const placeholders = {
    'agent.userMessage': params.userMessage || '',
    'agent.previousPlot': previousPlot,
    'agent.recentContext': recentContext,
    'agent.tasksJson': taskSummaries,
    'agent.worldbookEntriesJson': formatWorldbookPromptEntries_ACU(params.worldbookSummaries, params.contextSettings.decisionWorldbookCandidateLimit),
    'agent.maxEntriesPerChannelJson': control.maxEntriesPerChannel || {},
    'agent.greenlightTkBudgetJson': {
      unit: 'Token',
      min: params.contextSettings.greenlightMinTkBudget,
      max: params.contextSettings.greenlightMaxTkBudget,
      selectionRule: '每个通道和每个任务必须优先选择相关条目；相关条目足够时尽可能超过 min；相关条目总 Token 不足 min 时全选相关条目；任何情况下不得超过 max；不得为凑 min 选择无关条目。',
    },
    'agent.outputSchemaJson': {
      taskPlan: [{ taskId: '...', run: true, effectiveStage: 1, effectiveOrder: 0, mode: 'sequential', reason: '...' }],
      plotGreenlights: { taskId: [{ entries: [1, 2], reason: '每个编号一句话说明；也兼容旧 bookName/uid 格式' }] },
      finalGenerationGreenlights: [{ entries: [1], reason: '一句话说明；也兼容旧 bookName/uid 格式' }],
      fallbackMode: false,
      reason: '...',
    },
  };
  const messages = renderAgentPromptSegments_ACU(
    control.agentDecisionPromptSegments || getDefaultAgentDecisionPromptSegments_ACU(),
    placeholders,
  );

  return messages.length > 0
    ? messages
    : renderAgentPromptSegments_ACU(getDefaultAgentDecisionPromptSegments_ACU(), placeholders);
}

function normalizePlotGreenlights_ACU(
  raw: unknown,
  allowedKeys: Set<string>,
  enabledTaskIds: Set<string>,
  summaries: AgentWorldbookSummary_ACU[],
  maxBudget: number,
  maxEntriesPerChannel: Record<string, unknown>,
): Record<string, AgentWorldbookRef_ACU[]> {
  const result: Record<string, AgentWorldbookRef_ACU[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [taskIdRaw, refs] of Object.entries(raw as Record<string, unknown>)) {
    const taskId = normalizeId_ACU(taskIdRaw);
    if (!enabledTaskIds.has(taskId)) continue;
    const normalizedRefs = applyGreenlightTkBudget_ACU(normalizeWorldbookRefs_ACU(refs, allowedKeys, summaries), summaries, maxBudget, maxEntriesPerChannel.plot);
    if (normalizedRefs.length > 0) result[taskId] = normalizedRefs;
  }
  return result;
}

export async function runAgentDecisionForPlot_ACU(params: {
  plotSettings: Record<string, any>;
  agentWorldbookControl?: AgentWorldbookControl_ACU | null;
  userMessage: string;
  sharedContext: Record<string, any>;
  enabledTasks: any[];
  requireTaskPlan?: boolean;
}): Promise<AgentDecisionResult_ACU> {
  const originalTasks = Array.isArray(params.enabledTasks) ? params.enabledTasks : [];
  try {
    const control = resolveResolvedAgentWorldbookControl_ACU(params);
    if (!isAgentModeEnabled_ACU(control)) return emptyDecision_ACU(originalTasks, 'agent_mode_disabled');

    const effectivePlotSettings = { ...params.plotSettings, agentWorldbookControl: control };
    const contextSettings = normalizeAgentContextSettings_ACU(control.contextSettings);
    const maxAiAttempts = Math.max(1, Math.min(10, Math.trunc(Number(contextSettings.agentAiMaxRetries) || 1)));
    const { summaries, allowedKeys } = await collectWorldbookSummariesFromSnapshot_ACU(contextSettings);
    if (allowedKeys.size === 0) return emptyDecision_ACU(originalTasks, 'empty_worldbook_scope');
    const agentDecidableTasks = originalTasks.filter(task => shouldSendPlotTaskToAgent_ACU(normalizePlotTask_ACU(task, { fallbackTask: task })));
    const userOrderedTasks = originalTasks.filter(task => !shouldSendPlotTaskToAgent_ACU(normalizePlotTask_ACU(task, { fallbackTask: task })) && task?.agentControl?.selectable !== false);

    const presetName = String(control.agentApiPreset || '').trim();
    let rawResponse = '';
    let parsed: ReturnType<typeof parseAgentDecisionResponse_ACU> = null;
    let lastFailureReason = 'empty_agent_response';
    for (let attempt = 1; attempt <= maxAiAttempts; attempt++) {
      const messages = buildAgentDecisionPrompt_ACU({
        plotSettings: effectivePlotSettings,
        userMessage: params.userMessage,
        sharedContext: params.sharedContext,
        enabledTasks: agentDecidableTasks,
        worldbookSummaries: summaries,
        contextSettings,
      });
      rawResponse = await callAIWithPreset_ACU(messages, presetName);
      if (!rawResponse) {
        lastFailureReason = 'empty_agent_response';
        continue;
      }
      parsed = parseAgentDecisionResponse_ACU(rawResponse);
      if (parsed && parsed.fallbackMode !== true) break;
      lastFailureReason = parsed?.reason || 'invalid_agent_response';
      parsed = null;
    }
    if (!rawResponse) return emptyDecision_ACU(originalTasks, 'empty_agent_response');
    if (!parsed) return emptyDecision_ACU(originalTasks, lastFailureReason);

    const normalizedPlan = params.requireTaskPlan === false
      ? { plan: [] as AgentTaskPlanItem_ACU[], effectiveTasks: originalTasks }
      : normalizeTaskPlan_ACU(parsed.taskPlan, agentDecidableTasks, userOrderedTasks);
    if (normalizedPlan.reason) return emptyDecision_ACU(originalTasks, normalizedPlan.reason);
    const effectivePlan = normalizedPlan.reason
      ? { plan: [] as AgentTaskPlanItem_ACU[], effectiveTasks: originalTasks }
      : normalizedPlan;

    const enabledTaskIds = new Set(agentDecidableTasks
      .map((task, index) => normalizePlotTask_ACU(task, { index, fallbackTask: task }))
      .filter(task => task.agentControl?.selectable !== false)
      .map(task => task.id)
      .filter(Boolean));
    const maxEntriesPerChannel: AgentWorldbookControl_ACU['maxEntriesPerChannel'] = control?.maxEntriesPerChannel || {
      plot: 0,
      tableFill: 0,
      finalGeneration: 0,
    };
    const plotGreenlights = normalizePlotGreenlights_ACU(parsed.plotGreenlights, allowedKeys, enabledTaskIds, summaries, contextSettings.greenlightMaxTkBudget, maxEntriesPerChannel);
    const finalGenerationGreenlights = applyGreenlightTkBudget_ACU(normalizeWorldbookRefs_ACU(parsed.finalGenerationGreenlights, allowedKeys, summaries), summaries, contextSettings.greenlightMaxTkBudget, maxEntriesPerChannel.finalGeneration);

    return {
      active: true,
      rawResponse,
      taskPlan: effectivePlan.plan,
      plotGreenlights,
      finalGenerationGreenlights,
      effectiveTasks: effectivePlan.effectiveTasks,
    };
  } catch (error) {
    logWarn_ACU('[Agent决策] 决策失败，回退原剧情推进逻辑:', error);
    return emptyDecision_ACU(originalTasks, 'agent_decision_error');
  }
}
