import { callAIWithPreset_ACU } from '../ai/api-call';
import { settings_ACU } from '../runtime/state-manager';
import { getCharLorebooks_ACU } from '../worldbook/worldbook-service';
import { getLorebookEntriesByNames_ACU } from '../worldbook/pipeline';
import { estimateTextTk_ACU, normalizeTkBudgetNumber_ACU } from '../../shared/token-estimate';
import {
  parseWorldbookSkillMetaFromComment_ACU,
  saveWorldbookEntrySkillMeta_ACU,
  stripWorldbookSkillMetaBlock_ACU,
  type WorldbookSkillMeta_ACU,
} from './agent-worldbook-skill-meta';
import {
  getDefaultAgentSkillifyPromptSegments_ACU,
  normalizeAgentContextSettings_ACU,
  renderAgentPromptSegments_ACU,
} from './agent-prompt-template';

export interface AgentSkillifyWorldbookEntrySummary_ACU {
  bookName: string;
  uid: string | number;
  comment: string;
  content: string;
  keys: string[];
  existingSkillMeta: WorldbookSkillMeta_ACU | null;
  tk: number;
}

export type AgentSkillifyEntryStatus_ACU = 'updated' | 'skipped' | 'failed';

export interface AgentSkillifyEntryResult_ACU {
  status: AgentSkillifyEntryStatus_ACU;
  bookName: string;
  uid: string | number;
  reason?: string;
  meta?: Pick<WorldbookSkillMeta_ACU, 'description' | 'triggerWhen' | 'tk'>;
}

export interface AgentSkillifyRunResult_ACU {
  totalCandidates: number;
  updated: number;
  skipped: number;
  failed: number;
  results: AgentSkillifyEntryResult_ACU[];
}

export interface AgentSkillifyOptions_ACU {
  presetName?: string;
  overwriteManual?: boolean;
  maxEntries?: number;
  maxConcurrency?: number;
}

function normalizeStringArray_ACU(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean);
  return [];
}

export function getWorldbookEntryKeywordsForSkillify_ACU(entry: Record<string, any>): string[] {
  return [...new Set([...normalizeStringArray_ACU(entry?.keys), ...normalizeStringArray_ACU(entry?.key)])];
}

const DATABASE_GENERATED_WORLDBOOK_COMMENT_PREFIXES_ACU = [
  'TavernDB-ACU-',
  '重要人物条目',
  '总结条目',
  '小总结条目',
  'TavernDB-ACU-AgentWorldbookSnapshot',
];

const AGENT_MANAGED_WORLDBOOK_COMMENT_PREFIXES_ACU = [
  'TavernDB-ACU-AgentGreenlight',
];

function normalizeGeneratedWorldbookComment_ACU(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^ACU-\[[^\]]+\]-/, '')
    .replace(/^外部导入-/, '');
}

export function isDatabaseGeneratedWorldbookEntryForAgent_ACU(entry: Record<string, any>): boolean {
  const normalizedComment = normalizeGeneratedWorldbookComment_ACU(entry?.comment || entry?.name);
  if (!normalizedComment) return false;
  if (AGENT_MANAGED_WORLDBOOK_COMMENT_PREFIXES_ACU.some(prefix => normalizedComment.startsWith(prefix))) return false;
  return DATABASE_GENERATED_WORLDBOOK_COMMENT_PREFIXES_ACU.some(prefix => normalizedComment.startsWith(prefix));
}

export function isWorldbookEntrySkillifyCandidate_ACU(entry: Record<string, any>): boolean {
  if (!entry || entry.enabled === false) return false;
  if (String(entry.type || '').toLowerCase() === 'constant') return false;
  if (isDatabaseGeneratedWorldbookEntryForAgent_ACU(entry)) return false;
  return getWorldbookEntryKeywordsForSkillify_ACU(entry).length > 0;
}

export async function resolvePlotWorldbookSkillifyBookNames_ACU(): Promise<string[]> {
  const cfg = (settings_ACU.plotSettings as any)?.plotWorldbookConfig || {};
  if (cfg.source === 'manual') return normalizeStringArray_ACU(cfg.manualSelection);

  const names: string[] = [];
  const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
  if (charLorebooks?.primary) names.push(String(charLorebooks.primary));
  if (Array.isArray(charLorebooks?.additional)) names.push(...charLorebooks.additional.map(String));
  return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}


function buildEntrySummary_ACU(
  bookName: string,
  entry: Record<string, any>,
): AgentSkillifyWorldbookEntrySummary_ACU {
  const rawComment = String(entry?.comment || entry?.name || '').trim();
  const strippedComment = stripWorldbookSkillMetaBlock_ACU(rawComment);
  const comment = strippedComment || String(entry?.name || '').trim();
  const content = String(entry?.content || '').trim();
  const existingSkillMeta = parseWorldbookSkillMetaFromComment_ACU(rawComment);
  const estimatedTk = estimateTextTk_ACU(content || comment);
  const existingTk = Number(existingSkillMeta?.tk);
  return {
    bookName,
    uid: entry.uid,
    comment,
    content,
    keys: getWorldbookEntryKeywordsForSkillify_ACU(entry),
    existingSkillMeta,
    tk: Number.isFinite(existingTk) && existingTk > 0 ? Math.trunc(existingTk) : estimatedTk,
  };
}

export function shouldSkipSkillifyEntry_ACU(
  summary: AgentSkillifyWorldbookEntrySummary_ACU,
  options: AgentSkillifyOptions_ACU = {},
): string | null {
  const existing = summary.existingSkillMeta;
  if (!existing) return null;
  const hasExistingText = !!(existing.description || existing.triggerWhen);
  if (existing.updatedBy === 'manual' && hasExistingText && options.overwriteManual !== true) {
    return '已存在用户手动编辑的 Skill 元数据';
  }
  return null;
}

export function buildWorldbookSkillifyPrompt_ACU(summary: AgentSkillifyWorldbookEntrySummary_ACU): Array<{ role: string; content: string }> {
  const control = (settings_ACU.plotSettings as any)?.agentWorldbookControl || {};
  const placeholders = {
    'agent.skillify.bookName': summary.bookName,
    'agent.skillify.uid': summary.uid,
    'agent.skillify.comment': summary.comment || '（空）',
    'agent.skillify.content': summary.content || '（空）',
    'agent.skillify.keysText': summary.keys.join('、') || '（空）',
    'agent.skillify.tk': summary.tk,
    'agent.skillify.contentPreview': summary.content || '（空）',
    'agent.skillify.existingSkillMetaJson': summary.existingSkillMeta || {},
    'agent.skillify.outputSchemaJson': { description: '...', triggerWhen: '...', tk: 0 },
  };
  const messages = renderAgentPromptSegments_ACU(
    control.agentSkillifyPromptSegments || getDefaultAgentSkillifyPromptSegments_ACU(),
    placeholders,
  );
  return messages.length > 0
    ? messages
    : renderAgentPromptSegments_ACU(getDefaultAgentSkillifyPromptSegments_ACU(), placeholders);
}

function extractJsonObjectText_ACU(text: string): string | null {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}


export function parseAgentSkillifyResponse_ACU(responseText: string, fallbackTk = 0): Pick<WorldbookSkillMeta_ACU, 'description' | 'triggerWhen' | 'tk'> | null {
  const jsonText = extractJsonObjectText_ACU(responseText);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const triggerWhen = typeof parsed.triggerWhen === 'string' ? parsed.triggerWhen.trim() : '';
    const tk = normalizeTkBudgetNumber_ACU(parsed.tk, fallbackTk);
    if (!description && !triggerWhen) return null;
    return { description, triggerWhen, tk };
  } catch {
    return null;
  }
}

async function skillifySingleEntry_ACU(
  summary: AgentSkillifyWorldbookEntrySummary_ACU,
  options: AgentSkillifyOptions_ACU,
): Promise<AgentSkillifyEntryResult_ACU> {
  const skipReason = shouldSkipSkillifyEntry_ACU(summary, options);
  if (skipReason) {
    return { status: 'skipped', bookName: summary.bookName, uid: summary.uid, reason: skipReason };
  }

  const presetName = options.presetName ?? (settings_ACU.plotSettings as any)?.agentWorldbookControl?.agentSkillApiPreset ?? '';
  const response = await callAIWithPreset_ACU(buildWorldbookSkillifyPrompt_ACU(summary), presetName);
  if (!response) {
    return { status: 'failed', bookName: summary.bookName, uid: summary.uid, reason: 'AI 未返回内容' };
  }

  const meta = parseAgentSkillifyResponse_ACU(response, summary.tk);
  if (!meta) {
    return { status: 'failed', bookName: summary.bookName, uid: summary.uid, reason: 'AI 返回不是有效 Skill JSON' };
  }

  const saveResult = await saveWorldbookEntrySkillMeta_ACU(summary.bookName, summary.uid, meta, 'agent-skillify');
  if (!saveResult.updated && saveResult.reason && saveResult.reason !== '世界书 Skill 元数据未变化') {
    return { status: 'failed', bookName: summary.bookName, uid: summary.uid, reason: saveResult.reason, meta };
  }

  return { status: saveResult.updated ? 'updated' : 'skipped', bookName: summary.bookName, uid: summary.uid, reason: saveResult.reason, meta };
}

async function runWithConcurrency_ACU<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}


function summarizeRunResults_ACU(results: AgentSkillifyEntryResult_ACU[]): AgentSkillifyRunResult_ACU {
  return {
    totalCandidates: results.length,
    updated: results.filter(result => result.status === 'updated').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    failed: results.filter(result => result.status === 'failed').length,
    results,
  };
}

export async function collectWorldbookSkillifyCandidates_ACU(
  bookNames: string[],
  options: AgentSkillifyOptions_ACU = {},
): Promise<AgentSkillifyWorldbookEntrySummary_ACU[]> {
  const contextSettings = normalizeAgentContextSettings_ACU((settings_ACU.plotSettings as any)?.agentWorldbookControl?.contextSettings);
  const entriesMap = await getLorebookEntriesByNames_ACU(bookNames);
  const summaries: AgentSkillifyWorldbookEntrySummary_ACU[] = [];

  for (const bookName of [...new Set(bookNames.map(name => String(name || '').trim()).filter(Boolean))]) {
    const entries = Array.isArray(entriesMap[bookName]) ? entriesMap[bookName] : [];
    for (const entry of entries) {
      if (!isWorldbookEntrySkillifyCandidate_ACU(entry)) continue;
      summaries.push(buildEntrySummary_ACU(bookName, entry));
    }
  }

  const maxEntries = Number.isFinite(Number(options.maxEntries)) && Number(options.maxEntries) > 0
    ? Number(options.maxEntries)
    : contextSettings.skillifyMaxEntries;
  return summaries.slice(0, maxEntries);
}

export async function skillifyWorldbookEntries_ACU(
  bookNames: string[],
  options: AgentSkillifyOptions_ACU = {},
): Promise<AgentSkillifyRunResult_ACU> {
  const candidates = await collectWorldbookSkillifyCandidates_ACU(bookNames, options);
  if (candidates.length === 0) return summarizeRunResults_ACU([]);

  const configuredConcurrency = Number.isFinite(Number(options.maxConcurrency)) && Number(options.maxConcurrency) > 0
    ? Number(options.maxConcurrency)
    : (Number((settings_ACU.plotSettings as any)?.agentWorldbookControl?.maxSkillifyConcurrency) || 1);
  const concurrency = Math.max(1, Math.min(configuredConcurrency, 5));
  const results = await runWithConcurrency_ACU(candidates, concurrency, summary => skillifySingleEntry_ACU(summary, options));
  return summarizeRunResults_ACU(results);
}

export async function skillifyCurrentPlotWorldbookSelection_ACU(
  options: AgentSkillifyOptions_ACU = {},
): Promise<AgentSkillifyRunResult_ACU> {
  const bookNames = await resolvePlotWorldbookSkillifyBookNames_ACU();
  if (bookNames.length === 0) return summarizeRunResults_ACU([]);
  return skillifyWorldbookEntries_ACU(bookNames, options);
}
