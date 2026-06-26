import { callAIWithPreset_ACU } from '../ai/api-call';
import { settings_ACU } from '../runtime/state-manager';
import { getCharLorebooks_ACU } from '../worldbook/worldbook-service';
import { getLorebookEntriesByNames_ACU } from '../worldbook/pipeline';
import {
  parseWorldbookSkillMetaFromComment_ACU,
  saveWorldbookEntrySkillMeta_ACU,
  type WorldbookSkillMeta_ACU,
} from './agent-worldbook-skill-meta';

export interface AgentSkillifyWorldbookEntrySummary_ACU {
  bookName: string;
  uid: string | number;
  comment: string;
  keys: string[];
  contentPreview: string;
  existingSkillMeta: WorldbookSkillMeta_ACU | null;
}

export type AgentSkillifyEntryStatus_ACU = 'updated' | 'skipped' | 'failed';

export interface AgentSkillifyEntryResult_ACU {
  status: AgentSkillifyEntryStatus_ACU;
  bookName: string;
  uid: string | number;
  reason?: string;
  meta?: Pick<WorldbookSkillMeta_ACU, 'description' | 'triggerWhen'>;
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
  contentPreviewLimit?: number;
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

function clipText_ACU(value: unknown, limit: number): string {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[已截断 ${text.length - limit} 字]`;
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
  contentPreviewLimit: number,
): AgentSkillifyWorldbookEntrySummary_ACU {
  const comment = String(entry?.comment || entry?.name || '').trim();
  return {
    bookName,
    uid: entry.uid,
    comment,
    keys: getWorldbookEntryKeywordsForSkillify_ACU(entry),
    contentPreview: clipText_ACU(entry?.content, contentPreviewLimit),
    existingSkillMeta: parseWorldbookSkillMetaFromComment_ACU(comment),
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
  return [
    {
      role: 'system',
      content: [
        '你是 SillyTavern 世界书条目的 Skill 元数据生成器。',
        '根据条目名称、关键词和内容预览，生成用于 Agent 判断是否触发该条目的描述和触发时机。',
        '只返回严格 JSON 对象，不要 Markdown，不要解释。',
        'JSON 结构：{"description":"...","triggerWhen":"..."}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `世界书: ${summary.bookName}`,
        `条目 uid: ${summary.uid}`,
        `条目名称/备注: ${summary.comment || '（空）'}`,
        `关键词: ${summary.keys.join('、') || '（空）'}`,
        '内容预览:',
        summary.contentPreview || '（空）',
      ].join('\n'),
    },
  ];
}

function extractJsonObjectText_ACU(text: string): string | null {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}


export function parseAgentSkillifyResponse_ACU(responseText: string): Pick<WorldbookSkillMeta_ACU, 'description' | 'triggerWhen'> | null {
  const jsonText = extractJsonObjectText_ACU(responseText);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
    const triggerWhen = typeof parsed.triggerWhen === 'string' ? parsed.triggerWhen.trim() : '';
    if (!description && !triggerWhen) return null;
    return { description, triggerWhen };
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

  const meta = parseAgentSkillifyResponse_ACU(response);
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
  const contentPreviewLimit = Math.max(200, options.contentPreviewLimit ?? 1200);
  const entriesMap = await getLorebookEntriesByNames_ACU(bookNames);
  const summaries: AgentSkillifyWorldbookEntrySummary_ACU[] = [];

  for (const bookName of [...new Set(bookNames.map(name => String(name || '').trim()).filter(Boolean))]) {
    const entries = Array.isArray(entriesMap[bookName]) ? entriesMap[bookName] : [];
    for (const entry of entries) {
      if (!isWorldbookEntrySkillifyCandidate_ACU(entry)) continue;
      summaries.push(buildEntrySummary_ACU(bookName, entry, contentPreviewLimit));
    }
  }

  const maxEntries = Number.isFinite(Number(options.maxEntries)) && Number(options.maxEntries) > 0
    ? Number(options.maxEntries)
    : summaries.length;
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
