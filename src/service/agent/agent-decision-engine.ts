import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { getLorebookEntries_ACU } from '../../data/gateways/worldbook-gateway';
import { normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU, logWarn_ACU } from '../../shared/utils';
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
  tableFillGreenlights: AgentWorldbookRef_ACU[];
  finalGenerationGreenlights: AgentWorldbookRef_ACU[];
  effectiveTasks: any[];
}

interface AgentWorldbookSummary_ACU extends AgentWorldbookRef_ACU {
  comment: string;
  keys: string[];
  description: string;
  triggerWhen: string;
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
  return collectRecentAiLayerPairs_ACU(messages, layerLimit)
    .map((pair, index) => {
      const lines = [`【最近上下文 AI层 ${index + 1}】`];
      const userText = getMessageText_ACU(pair.user);
      if (userText) lines.push(`${getMessageSpeaker_ACU(pair.user, '用户')}: ${userText}`);
      const userPlot = getPlotTextFromMessage_ACU(pair.user);
      if (userPlot) lines.push(`剧情推进记录: ${userPlot}`);
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
    tableFillGreenlights: [],
    finalGenerationGreenlights: [],
    effectiveTasks,
  };
}

function isAgentModeEnabled_ACU(plotSettings: Record<string, any>): boolean {
  const control = plotSettings?.agentWorldbookControl || {};
  return control.enabled === true && control.mode === 'agent';
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
      allowedKeys.add(refKey_ACU(bookName, uid));
      const entry = (entries || []).find(item => String(item?.uid) === String(uid));
      if (!entry) continue;
      const comment = String(entry.comment || entry.name || '');
      const meta = parseWorldbookSkillMetaFromComment_ACU(comment);
      summaries.push({
        bookName,
        uid,
        comment,
        keys: getWorldbookEntryKeywordsForSkillify_ACU(entry),
        description: meta?.description || '',
        triggerWhen: meta?.triggerWhen || '',
      });
    }
  }

  if (allowedKeys.size > 0) {
    return { summaries, allowedKeys };
  }

  const bookNames = await resolvePlotWorldbookSkillifyBookNames_ACU();
  const candidates = await collectWorldbookSkillifyCandidates_ACU(bookNames, { maxEntries: contextSettings.decisionWorldbookCandidateLimit });
  for (const candidate of candidates) {
    allowedKeys.add(refKey_ACU(candidate.bookName, candidate.uid));
    summaries.push({
      bookName: candidate.bookName,
      uid: candidate.uid,
      comment: candidate.comment,
      keys: candidate.keys,
      description: candidate.existingSkillMeta?.description || '',
      triggerWhen: candidate.existingSkillMeta?.triggerWhen || '',
    });
  }

  return { summaries, allowedKeys };
}


function normalizeWorldbookRefs_ACU(value: unknown, allowedKeys: Set<string>): AgentWorldbookRef_ACU[] {
  if (!Array.isArray(value)) return [];
  const refs: AgentWorldbookRef_ACU[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const bookName = String((item as any)?.bookName || '').trim();
    const uid = (item as any)?.uid;
    if (!bookName || uid === null || uid === undefined || String(uid).trim() === '') continue;
    const key = refKey_ACU(bookName, uid);
    if (!allowedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    refs.push({ bookName, uid, reason: String((item as any)?.reason || '').trim() });
  }
  return refs;
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

function normalizeTaskPlan_ACU(rawPlan: unknown, enabledTasks: any[]): { plan: AgentTaskPlanItem_ACU[]; effectiveTasks: any[]; reason?: string } {
  if (!Array.isArray(rawPlan)) return { plan: [], effectiveTasks: enabledTasks, reason: 'missing_task_plan' };
  const normalizedTasks = enabledTasks.map((task, index) => normalizePlotTask_ACU(task, { index, fallbackTask: task }));
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

  if (plan.length === 0) return { plan: [], effectiveTasks: enabledTasks, reason: 'no_valid_task_plan_items' };
  if (selectedIds.size > 0 && hasDependencyCycle_ACU(selectedIds, tasksById)) {
    return { plan: [], effectiveTasks: enabledTasks, reason: 'task_dependency_cycle' };
  }
  return { plan, effectiveTasks };
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
  }).filter(task => task.agentControl?.selectable !== false);

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
    'agent.worldbookEntriesJson': params.worldbookSummaries.slice(0, params.contextSettings.decisionWorldbookCandidateLimit),
    'agent.maxEntriesPerChannelJson': control.maxEntriesPerChannel || {},
    'agent.outputSchemaJson': {
      taskPlan: [{ taskId: '...', run: true, effectiveStage: 1, effectiveOrder: 0, mode: 'sequential', reason: '...' }],
      plotGreenlights: { taskId: [{ bookName: '...', uid: 1, reason: '...' }] },
      tableFillGreenlights: [{ bookName: '...', uid: 1, reason: '...' }],
      finalGenerationGreenlights: [{ bookName: '...', uid: 1, reason: '...' }],
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

function normalizePlotGreenlights_ACU(raw: unknown, allowedKeys: Set<string>, enabledTaskIds: Set<string>): Record<string, AgentWorldbookRef_ACU[]> {
  const result: Record<string, AgentWorldbookRef_ACU[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [taskIdRaw, refs] of Object.entries(raw as Record<string, unknown>)) {
    const taskId = normalizeId_ACU(taskIdRaw);
    if (!enabledTaskIds.has(taskId)) continue;
    const normalizedRefs = normalizeWorldbookRefs_ACU(refs, allowedKeys);
    if (normalizedRefs.length > 0) result[taskId] = normalizedRefs;
  }
  return result;
}

export async function runAgentDecisionForPlot_ACU(params: {
  plotSettings: Record<string, any>;
  userMessage: string;
  sharedContext: Record<string, any>;
  enabledTasks: any[];
  requireTaskPlan?: boolean;
}): Promise<AgentDecisionResult_ACU> {
  const originalTasks = Array.isArray(params.enabledTasks) ? params.enabledTasks : [];
  try {
    if (!isAgentModeEnabled_ACU(params.plotSettings)) return emptyDecision_ACU(originalTasks, 'agent_mode_disabled');

    const control = params.plotSettings?.agentWorldbookControl || {};
    const contextSettings = normalizeAgentContextSettings_ACU(control.contextSettings);
    const { summaries, allowedKeys } = await collectWorldbookSummariesFromSnapshot_ACU(contextSettings);
    if (allowedKeys.size === 0) return emptyDecision_ACU(originalTasks, 'empty_worldbook_scope');

    const presetName = String(control.agentApiPreset || '').trim();
    const messages = buildAgentDecisionPrompt_ACU({
      plotSettings: params.plotSettings,
      userMessage: params.userMessage,
      sharedContext: params.sharedContext,
      enabledTasks: originalTasks,
      worldbookSummaries: summaries,
      contextSettings,
    });
    const rawResponse = await callAIWithPreset_ACU(messages, presetName);
    if (!rawResponse) return emptyDecision_ACU(originalTasks, 'empty_agent_response');

    const parsed = parseAgentDecisionResponse_ACU(rawResponse);
    if (!parsed || parsed.fallbackMode === true) return emptyDecision_ACU(originalTasks, parsed?.reason || 'invalid_agent_response');

    const normalizedPlan = normalizeTaskPlan_ACU(parsed.taskPlan, originalTasks);
    if (normalizedPlan.reason && params.requireTaskPlan !== false) return emptyDecision_ACU(originalTasks, normalizedPlan.reason);
    const effectivePlan = normalizedPlan.reason
      ? { plan: [] as AgentTaskPlanItem_ACU[], effectiveTasks: originalTasks }
      : normalizedPlan;

    const enabledTaskIds = new Set(originalTasks
      .map((task, index) => normalizePlotTask_ACU(task, { index, fallbackTask: task }))
      .filter(task => task.agentControl?.selectable !== false)
      .map(task => task.id)
      .filter(Boolean));
    const plotGreenlights = normalizePlotGreenlights_ACU(parsed.plotGreenlights, allowedKeys, enabledTaskIds);
    const tableFillGreenlights = normalizeWorldbookRefs_ACU(parsed.tableFillGreenlights, allowedKeys);
    const finalGenerationGreenlights = normalizeWorldbookRefs_ACU(parsed.finalGenerationGreenlights, allowedKeys);

    return {
      active: true,
      rawResponse,
      taskPlan: effectivePlan.plan,
      plotGreenlights,
      tableFillGreenlights,
      finalGenerationGreenlights,
      effectiveTasks: effectivePlan.effectiveTasks,
    };
  } catch (error) {
    logWarn_ACU('[Agent决策] 决策失败，回退原剧情推进逻辑:', error);
    return emptyDecision_ACU(originalTasks, 'agent_decision_error');
  }
}
