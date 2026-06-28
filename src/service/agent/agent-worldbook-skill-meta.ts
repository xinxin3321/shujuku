import type { WorldbookSkillMeta_ACU, WorldbookSkillMetaUpdatedBy_ACU } from '../../data/models/settings-model';
import { getLorebookEntries_ACU, setLorebookEntries_ACU } from '../../data/gateways/worldbook-gateway';
export type { WorldbookSkillMeta_ACU, WorldbookSkillMetaUpdatedBy_ACU } from '../../data/models/settings-model';

export const ACU_SKILL_META_START_ACU = 'ACU_SKILL_META_START';
export const ACU_SKILL_META_END_ACU = 'ACU_SKILL_META_END';

const SKILL_META_BLOCK_PATTERN_ACU = /\n?<!--\s*ACU_SKILL_META_START\s*\n([\s\S]*?)\nACU_SKILL_META_END\s*-->\n?/g;

export interface WorldbookSkillMetaSaveResult_ACU {
  updated: boolean;
  reason?: string;
  entry?: Record<string, any>;
}

function normalizeCommentText_ACU(comment: unknown): string {
  return typeof comment === 'string' ? comment : '';
}

function normalizeSkillMetaText_ACU(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSkillMetaTk_ACU(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

function isValidUpdatedBy_ACU(value: unknown): value is WorldbookSkillMetaUpdatedBy_ACU {
  return value === 'manual' || value === 'agent-skillify';
}

export function stripWorldbookSkillMetaBlock_ACU(comment: unknown): string {
  return normalizeCommentText_ACU(comment)
    .replace(SKILL_META_BLOCK_PATTERN_ACU, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseWorldbookSkillMetaFromComment_ACU(comment: unknown): WorldbookSkillMeta_ACU | null {
  const text = normalizeCommentText_ACU(comment);
  const pattern = new RegExp(SKILL_META_BLOCK_PATTERN_ACU.source, 'g');
  const match = pattern.exec(text);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    if (raw.version !== 1) return null;
    const updatedBy = isValidUpdatedBy_ACU(raw.updatedBy) ? raw.updatedBy : 'manual';
    return {
      version: 1,
      description: normalizeSkillMetaText_ACU(raw.description),
      triggerWhen: normalizeSkillMetaText_ACU(raw.triggerWhen),
      tk: normalizeSkillMetaTk_ACU(raw.tk),
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
      updatedBy,
    };
  } catch {
    return null;
  }
}

export function normalizeWorldbookSkillMetaDraft_ACU(
  draft: Partial<WorldbookSkillMeta_ACU>,
  updatedBy: WorldbookSkillMetaUpdatedBy_ACU = 'manual',
  now = Date.now(),
): WorldbookSkillMeta_ACU {
  return {
    version: 1,
    description: normalizeSkillMetaText_ACU(draft.description),
    triggerWhen: normalizeSkillMetaText_ACU(draft.triggerWhen),
    tk: normalizeSkillMetaTk_ACU(draft.tk),
    updatedAt: Number.isFinite(Number(draft.updatedAt)) && Number(draft.updatedAt) > 0 ? Number(draft.updatedAt) : now,
    updatedBy: isValidUpdatedBy_ACU(draft.updatedBy) ? draft.updatedBy : updatedBy,
  };
}


export function buildWorldbookSkillMetaComment_ACU(comment: unknown, metaDraft: Partial<WorldbookSkillMeta_ACU>): string {
  const meta = normalizeWorldbookSkillMetaDraft_ACU(metaDraft);
  const baseComment = stripWorldbookSkillMetaBlock_ACU(comment);
  if (!meta.description && !meta.triggerWhen) return baseComment;

  const metaJson = JSON.stringify(meta);
  const metaBlock = `<!-- ${ACU_SKILL_META_START_ACU}\n${metaJson}\n${ACU_SKILL_META_END_ACU} -->`;
  return [baseComment, metaBlock].filter(Boolean).join('\n\n');
}

export function findWorldbookEntryByUid_ACU(entries: Record<string, any>[], uid: string | number): Record<string, any> | null {
  return entries.find(entry => entry?.uid === uid || String(entry?.uid) === String(uid)) || null;
}

function validateWorldbookSkillMetaTarget_ACU(bookName: string, uid: string | number | null | undefined): string | null {
  if (!bookName || !bookName.trim()) return '世界书名称为空';
  if (uid === null || uid === undefined || uid === '') return '世界书条目 uid 为空';
  return null;
}

export async function saveWorldbookEntrySkillMeta_ACU(
  bookName: string,
  uid: string | number,
  metaDraft: Partial<WorldbookSkillMeta_ACU>,
  updatedBy: WorldbookSkillMetaUpdatedBy_ACU = 'manual',
): Promise<WorldbookSkillMetaSaveResult_ACU> {
  const targetError = validateWorldbookSkillMetaTarget_ACU(bookName, uid);
  if (targetError) return { updated: false, reason: targetError };

  const entries = await getLorebookEntries_ACU(bookName);
  const entry = findWorldbookEntryByUid_ACU(entries, uid);
  if (!entry) return { updated: false, reason: '未找到世界书条目' };

  const meta = normalizeWorldbookSkillMetaDraft_ACU(metaDraft, updatedBy);
  const nextComment = buildWorldbookSkillMetaComment_ACU(entry.comment, meta);
  if (nextComment === normalizeCommentText_ACU(entry.comment)) {
    return { updated: false, reason: '世界书 Skill 元数据未变化', entry };
  }

  await setLorebookEntries_ACU(bookName, [{ uid: entry.uid, comment: nextComment }]);
  return { updated: true, entry: { ...entry, comment: nextComment } };
}

export async function deleteWorldbookEntrySkillMeta_ACU(
  bookName: string,
  uid: string | number,
): Promise<WorldbookSkillMetaSaveResult_ACU> {
  const targetError = validateWorldbookSkillMetaTarget_ACU(bookName, uid);
  if (targetError) return { updated: false, reason: targetError };

  const entries = await getLorebookEntries_ACU(bookName);
  const entry = findWorldbookEntryByUid_ACU(entries, uid);
  if (!entry) return { updated: false, reason: '未找到世界书条目' };

  const currentComment = normalizeCommentText_ACU(entry.comment);
  const nextComment = stripWorldbookSkillMetaBlock_ACU(currentComment);
  if (nextComment === currentComment) {
    return { updated: false, reason: '世界书条目没有 Skill 元数据', entry };
  }

  await setLorebookEntries_ACU(bookName, [{ uid: entry.uid, comment: nextComment }]);
  return { updated: true, entry: { ...entry, comment: nextComment } };
}
