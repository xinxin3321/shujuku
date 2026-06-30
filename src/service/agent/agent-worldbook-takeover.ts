import type {
  AgentWorldbookControlSnapshot_ACU,
  AgentWorldbookControlSnapshotEntry_ACU,
} from '../../data/models/settings-model';
import {
  deleteLorebookEntries_ACU,
  getLorebookEntries_ACU,
  setLorebookEntries_ACU,
} from '../../data/gateways/worldbook-gateway';
import { persistTavernSettings_ACU } from '../../data/storage/tavern-storage';
import { hashUserInput_ACU, logWarn_ACU } from '../../shared/utils';
import { settings_ACU } from '../runtime/state-manager';
import {
  getWorldbookEntryKeywordsForSkillify_ACU,
  isWorldbookEntrySkillifyCandidate_ACU,
  resolvePlotWorldbookSkillifyBookNames_ACU,
} from './agent-skillify-service';
import {
  resolveAgentWorldbookFilterAvailability_ACU,
  type WorldbookSkillMetaReadResult_ACU,
} from './agent-worldbook-skill-meta';

export interface AgentWorldbookTakeoverEntryUpdate_ACU {
  bookName: string;
  uid: string | number;
}

export interface AgentWorldbookFinalGreenlightRef_ACU {
  bookName: string;
  uid: string | number;
  reason?: string;
}

export interface AgentWorldbookTakeoverResult_ACU {
  updated: boolean;
  reason?: string;
  bookNames: string[];
  selectionSignature: string;
  totalCandidates: number;
  disabled: number;
  failed: number;
  snapshot: AgentWorldbookControlSnapshot_ACU;
  updates: AgentWorldbookTakeoverEntryUpdate_ACU[];
}

export interface AgentWorldbookRestoreResult_ACU {
  updated: boolean;
  reason?: string;
  bookNames: string[];
  selectionSignature: string;
  restored: number;
  skipped: number;
  failed: number;
  updates: AgentWorldbookTakeoverEntryUpdate_ACU[];
}


export const AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU = 'TavernDB-ACU-AgentWorldbookSnapshot';
export const AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU = 'TavernDB-ACU-AgentFinalGenerationGreenlights';
const AGENT_TAKEOVER_META_START_ACU = 'ACU_AGENT_WORLDBOOK_TAKEOVER_META_START';
const AGENT_TAKEOVER_META_END_ACU = 'ACU_AGENT_WORLDBOOK_TAKEOVER_META_END';
const AGENT_TAKEOVER_META_PATTERN_ACU = /\n?<!--\s*ACU_AGENT_WORLDBOOK_TAKEOVER_META_START\s*\n([\s\S]*?)\nACU_AGENT_WORLDBOOK_TAKEOVER_META_END\s*-->\n?/g;

interface AgentWorldbookTakeoverMeta_ACU {
  version: 1;
  kind: 'agent_worldbook_takeover';
  selectionSignature: string;
  createdAt: number;
  previousEnabled: boolean;
  previousKeys?: string[];
  previousType?: string;
  commentHash?: string;
}

function normalizeBookNamesForTakeover_ACU(bookNames: unknown): string[] {
  if (!Array.isArray(bookNames)) return [];
  return [...new Set(bookNames.map(name => String(name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeCommentText_ACU(comment: unknown): string {
  return typeof comment === 'string' ? comment : '';
}

function hasValidWorldbookUid_ACU(uid: unknown): uid is string | number {
  return uid !== null && uid !== undefined && String(uid).trim() !== '';
}

async function deleteInternalEntryByComment_ACU(bookName: string, comment: string): Promise<boolean> {
  const entries = await getLorebookEntries_ACU(bookName);
  const matched = (entries || []).filter(entry => String(entry?.comment || '').trim() === comment && hasValidWorldbookUid_ACU(entry?.uid));
  if (matched.length === 0) return false;
  await deleteLorebookEntries_ACU(bookName, matched.map(entry => entry.uid));
  return true;
}

async function deleteInternalEntriesByComment_ACU(bookNames: string[], comment: string): Promise<number> {
  let deleted = 0;
  for (const bookName of normalizeBookNamesForTakeover_ACU(bookNames)) {
    if (await deleteInternalEntryByComment_ACU(bookName, comment)) deleted += 1;
  }
  return deleted;
}

function normalizeAgentWorldbookRefs_ACU(greenlights: unknown): AgentWorldbookFinalGreenlightRef_ACU[] {
  if (!Array.isArray(greenlights)) return [];
  const normalized: AgentWorldbookFinalGreenlightRef_ACU[] = [];
  const seen = new Set<string>();

  for (const ref of greenlights) {
    if (!ref || typeof ref !== 'object') continue;
    const bookName = String((ref as any).bookName || '').trim();
    const uid = (ref as any).uid;
    if (!bookName || !hasValidWorldbookUid_ACU(uid)) continue;
    const key = `${bookName}\u0000${String(uid).trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reason = String((ref as any).reason || '').trim();
    normalized.push(reason ? { bookName, uid, reason } : { bookName, uid });
  }

  return normalized;
}

function buildSnapshotUidSetByBook_ACU(snapshot: AgentWorldbookControlSnapshot_ACU): Map<string, Set<string>> {
  const uidSetByBook = new Map<string, Set<string>>();
  if (snapshot.active !== true) return uidSetByBook;

  for (const [bookName, entries] of Object.entries(snapshot.books || {})) {
    const normalizedBookName = String(bookName || '').trim();
    if (!normalizedBookName || !Array.isArray(entries)) continue;
    const uidSet = new Set<string>();
    for (const entry of entries) {
      if (!hasValidWorldbookUid_ACU(entry?.uid)) continue;
      uidSet.add(String(entry.uid));
    }
    if (uidSet.size > 0) uidSetByBook.set(normalizedBookName, uidSet);
  }

  return uidSetByBook;
}

function buildAllowedFinalGreenlightKeySet_ACU(greenlights: AgentWorldbookFinalGreenlightRef_ACU[], snapshotUidSetByBook: Map<string, Set<string>>): Set<string> {
  const allowed = new Set<string>();
  for (const ref of greenlights) {
    const bookName = String(ref.bookName || '').trim();
    const uid = String(ref.uid).trim();
    if (!snapshotUidSetByBook.get(bookName)?.has(uid)) continue;
    allowed.add(`${bookName}\u0000${uid}`);
  }
  return allowed;
}

function isFinalGenerationBlueLightEntry_ACU(entry: Record<string, any>): boolean {
  return entry?.enabled !== false
    && String(entry?.type || '').trim().toLowerCase() === 'constant'
    && Array.isArray(entry?.keys)
    && entry.keys.length === 0;
}

function buildFinalGreenlightKey_ACU(bookName: string, uid: unknown): string {
  return `${String(bookName || '').trim()}\u0000${String(uid ?? '').trim()}`;
}

function buildSkillMetaUidSetByBook_ACU(skillMetas: WorldbookSkillMetaReadResult_ACU[]): Map<string, Set<string>> {
  const uidSetByBook = new Map<string, Set<string>>();
  for (const meta of Array.isArray(skillMetas) ? skillMetas : []) {
    const bookName = String(meta?.bookName || '').trim();
    if (!bookName || !hasValidWorldbookUid_ACU(meta?.uid)) continue;
    if (!uidSetByBook.has(bookName)) uidSetByBook.set(bookName, new Set());
    uidSetByBook.get(bookName)!.add(String(meta.uid));
  }
  return uidSetByBook;
}

async function patchSnapshotEntries_ACU(snapshotUidSetByBook: Map<string, Set<string>>, buildPatch: (bookName: string, entry: Record<string, any>) => Record<string, any> | null): Promise<number> {
  let patched = 0;
  for (const [bookName, uidSet] of snapshotUidSetByBook.entries()) {
    const entries = await getLorebookEntries_ACU(bookName);
    const patches = (entries || [])
      .filter(entry => uidSet.has(String(entry?.uid)))
      .map(entry => buildPatch(bookName, entry))
      .filter(Boolean) as Record<string, any>[];
    if (patches.length === 0) continue;
    await setLorebookEntries_ACU(bookName, patches);
    patched += patches.length;
  }
  return patched;
}

export function buildWorldbookSelectionSignature_ACU(bookNames: string[]): string {
  const normalized = normalizeBookNamesForTakeover_ACU(bookNames);
  return hashUserInput_ACU(JSON.stringify({ scope: 'agent-worldbook-takeover', books: normalized }));
}

function buildActiveSnapshot_ACU(selectionSignature: string, books: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]>): AgentWorldbookControlSnapshot_ACU {
  return { active: true, selectionSignature, createdAt: Date.now(), books };
}

function buildInactiveSnapshot_ACU(selectionSignature = ''): AgentWorldbookControlSnapshot_ACU {
  return { active: false, selectionSignature, createdAt: 0, books: {} };
}

let cachedPlotAgentWorldbookSnapshot_ACU: AgentWorldbookControlSnapshot_ACU = buildInactiveSnapshot_ACU();

function stripTakeoverMetaBlock_ACU(comment: unknown): string {
  return normalizeCommentText_ACU(comment)
    .replace(AGENT_TAKEOVER_META_PATTERN_ACU, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTakeoverMetaFromComment_ACU(comment: unknown): AgentWorldbookTakeoverMeta_ACU | null {
  const text = normalizeCommentText_ACU(comment);
  const pattern = new RegExp(AGENT_TAKEOVER_META_PATTERN_ACU.source, 'g');
  const match = pattern.exec(text);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    if (raw.version !== 1 || raw.kind !== 'agent_worldbook_takeover') return null;
    const selectionSignature = String(raw.selectionSignature || '').trim();
    if (!selectionSignature) return null;
    const previousKeys = Array.isArray(raw.previousKeys) ? raw.previousKeys.map(key => String(key || '').trim()).filter(Boolean) : [];
    const previousType = raw.previousType === undefined || raw.previousType === null ? undefined : String(raw.previousType);
    const commentHash = String(raw.commentHash || '').trim();
    return {
      version: 1,
      kind: 'agent_worldbook_takeover',
      selectionSignature,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : 0,
      previousEnabled: raw.previousEnabled !== false,
      previousKeys,
      previousType,
      commentHash: commentHash || undefined,
    };
  } catch {
    return null;
  }
}

function buildTakeoverMetaComment_ACU(comment: unknown, selectionSignature: string, createdAt: number, snapshotEntry: AgentWorldbookControlSnapshotEntry_ACU): string {
  const baseComment = stripTakeoverMetaBlock_ACU(comment);
  const meta: AgentWorldbookTakeoverMeta_ACU = {
    version: 1,
    kind: 'agent_worldbook_takeover',
    selectionSignature,
    createdAt,
    previousEnabled: snapshotEntry.previousEnabled !== false,
    previousKeys: Array.isArray(snapshotEntry.previousKeys) ? snapshotEntry.previousKeys : [],
    previousType: snapshotEntry.previousType,
    commentHash: snapshotEntry.commentHash,
  };
  const metaBlock = `<!-- ${AGENT_TAKEOVER_META_START_ACU}\n${JSON.stringify(meta)}\n${AGENT_TAKEOVER_META_END_ACU} -->`;
  return [baseComment, metaBlock].filter(Boolean).join('\n\n');
}

function getLegacyPlotAgentWorldbookSnapshot_ACU(): AgentWorldbookControlSnapshot_ACU {
  const snapshot = (settings_ACU.plotSettings as any)?.agentWorldbookControlSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return buildInactiveSnapshot_ACU();
  return {
    active: snapshot.active === true,
    selectionSignature: String(snapshot.selectionSignature || ''),
    createdAt: Number(snapshot.createdAt || 0),
    books: snapshot.books && typeof snapshot.books === 'object' ? snapshot.books : {},
  };
}

function clearLegacyPlotAgentWorldbookSnapshot_ACU(): boolean {
  if (!settings_ACU.plotSettings || typeof settings_ACU.plotSettings !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(settings_ACU.plotSettings, 'agentWorldbookControlSnapshot')) return false;
  delete (settings_ACU.plotSettings as any).agentWorldbookControlSnapshot;
  persistTavernSettings_ACU();
  return true;
}

export function getPlotAgentWorldbookSnapshot_ACU(): AgentWorldbookControlSnapshot_ACU {
  return cachedPlotAgentWorldbookSnapshot_ACU;
}

export function setPlotAgentWorldbookSnapshot_ACU(snapshot: AgentWorldbookControlSnapshot_ACU): void {
  cachedPlotAgentWorldbookSnapshot_ACU = snapshot;
}

export async function refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU(): Promise<AgentWorldbookControlSnapshot_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const snapshotBooks: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]> = {};
  let createdAt = 0;
  for (const bookName of resolvedBookNames) {
    const entries = await getLorebookEntries_ACU(bookName);
    const bookSnapshot: AgentWorldbookControlSnapshotEntry_ACU[] = [];
    for (const entry of entries || []) {
      if (!hasValidWorldbookUid_ACU(entry?.uid)) continue;
      const meta = parseTakeoverMetaFromComment_ACU(entry?.comment);
      if (!meta || meta.selectionSignature !== selectionSignature) continue;
      bookSnapshot.push({
        uid: entry.uid,
        previousEnabled: meta.previousEnabled !== false,
        previousKeys: Array.isArray(meta.previousKeys) ? meta.previousKeys : [],
        previousType: meta.previousType,
        commentHash: meta.commentHash,
      });
      createdAt = Math.max(createdAt, meta.createdAt || 0);
    }
    if (bookSnapshot.length > 0) snapshotBooks[bookName] = bookSnapshot;
  }
  const snapshot = Object.keys(snapshotBooks).length > 0
    ? { active: true, selectionSignature, createdAt: createdAt || Date.now(), books: snapshotBooks }
    : buildInactiveSnapshot_ACU(selectionSignature);
  setPlotAgentWorldbookSnapshot_ACU(snapshot);
  return snapshot;
}

export function isWorldbookTakeoverActive_ACU(): boolean {
  return getPlotAgentWorldbookSnapshot_ACU().active === true;
}

async function resolveTakeoverBookNames_ACU(): Promise<string[]> {
  return normalizeBookNamesForTakeover_ACU(await resolvePlotWorldbookSkillifyBookNames_ACU());
}

function buildSnapshotEntry_ACU(entry: Record<string, any>): AgentWorldbookControlSnapshotEntry_ACU | null {
  if (!hasValidWorldbookUid_ACU(entry?.uid)) return null;
  const previousType = entry?.type === undefined || entry?.type === null ? undefined : String(entry.type);
  const comment = stripTakeoverMetaBlock_ACU(entry?.comment);
  return {
    uid: entry.uid,
    previousEnabled: entry.enabled !== false,
    previousKeys: getWorldbookEntryKeywordsForSkillify_ACU(entry),
    previousType,
    commentHash: hashUserInput_ACU(comment),
  };
}

async function collectTakeoverCandidates_ACU(bookNames: string[], allowedUidSetByBook?: Map<string, Set<string>>): Promise<{
  snapshotBooks: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]>;
  updates: AgentWorldbookTakeoverEntryUpdate_ACU[];
}> {
  const snapshotBooks: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]> = {};
  const updates: AgentWorldbookTakeoverEntryUpdate_ACU[] = [];

  for (const bookName of bookNames) {
    const entries = await getLorebookEntries_ACU(bookName);
    const bookSnapshot: AgentWorldbookControlSnapshotEntry_ACU[] = [];
    const allowedUidSet = allowedUidSetByBook?.get(bookName);
    for (const entry of entries || []) {
      if (!isWorldbookEntrySkillifyCandidate_ACU(entry)) continue;
      if (allowedUidSet && !allowedUidSet.has(String(entry?.uid))) continue;
      const snapshotEntry = buildSnapshotEntry_ACU(entry);
      if (!snapshotEntry) continue;
      bookSnapshot.push(snapshotEntry);
      updates.push({ bookName, uid: snapshotEntry.uid });
    }
    if (bookSnapshot.length > 0) snapshotBooks[bookName] = bookSnapshot;
  }

  return { snapshotBooks, updates };
}

async function disableTakeoverCandidates_ACU(
  snapshotBooks: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]>,
  selectionSignature: string,
  createdAt: number,
): Promise<{ disabled: number; failed: number }> {
  const updatesByBook = new Map<string, Set<string>>();
  const snapshotEntryByBookAndUid = new Map<string, Map<string, AgentWorldbookControlSnapshotEntry_ACU>>();
  for (const [bookName, snapshotEntries] of Object.entries(snapshotBooks || {})) {
    if (!bookName) continue;
    const uidMap = new Map<string, AgentWorldbookControlSnapshotEntry_ACU>();
    for (const snapshotEntry of Array.isArray(snapshotEntries) ? snapshotEntries : []) {
      if (!hasValidWorldbookUid_ACU(snapshotEntry?.uid)) continue;
      uidMap.set(String(snapshotEntry.uid), snapshotEntry);
    }
    if (uidMap.size === 0) continue;
    if (!updatesByBook.has(bookName)) updatesByBook.set(bookName, new Set());
    for (const uid of uidMap.keys()) updatesByBook.get(bookName)!.add(uid);
    snapshotEntryByBookAndUid.set(bookName, uidMap);
  }

  let disabled = 0;
  let failed = 0;
  for (const [bookName, uidSet] of updatesByBook.entries()) {
    try {
      const entries = await getLorebookEntries_ACU(bookName);
      const patchEntries = (entries || [])
        .filter(entry => uidSet.has(String(entry?.uid)))
        .map(entry => {
          const snapshotEntry = snapshotEntryByBookAndUid.get(bookName)?.get(String(entry?.uid));
          if (!snapshotEntry) return null;
          return { uid: entry.uid, enabled: false, comment: buildTakeoverMetaComment_ACU(entry?.comment, selectionSignature, createdAt, snapshotEntry) };
        })
        .filter(Boolean) as Record<string, any>[];
      if (patchEntries.length === 0) continue;
      await setLorebookEntries_ACU(bookName, patchEntries);
      disabled += patchEntries.length;
    } catch (error) {
      failed += uidSet.size;
    }
  }
  return { disabled, failed };
}

async function restoreSnapshotEntries_ACU(snapshot: AgentWorldbookControlSnapshot_ACU): Promise<{ restored: number; skipped: number; failed: number }> {
  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const [bookName, snapshotEntries] of Object.entries(snapshot.books || {})) {
    const normalizedBookName = String(bookName || '').trim();
    const entriesToRestore = Array.isArray(snapshotEntries) ? snapshotEntries : [];
    if (!normalizedBookName || entriesToRestore.length === 0) continue;
    try {
      const currentEntries = await getLorebookEntries_ACU(normalizedBookName);
      const currentByUid = new Map((currentEntries || []).map(entry => [String(entry?.uid), entry]));
      const patches: any[] = [];
      let restoredInBook = 0;
      for (const snapshotEntry of entriesToRestore) {
        if (!hasValidWorldbookUid_ACU(snapshotEntry?.uid)) {
          logWarn_ACU(
            `[Agent世界书] 跳过恢复世界书条目：${normalizedBookName} 中存在无效 uid。`,
            snapshotEntry?.uid,
          );
          skipped += 1;
          continue;
        }
        const currentEntry = currentByUid.get(String(snapshotEntry.uid));
        if (!currentEntry) {
          logWarn_ACU(`[Agent世界书] 跳过恢复世界书条目：${normalizedBookName}#${snapshotEntry.uid} 当前条目不存在。`);
          skipped += 1;
          continue;
        }
        const currentComment = typeof currentEntry.comment === 'string' ? currentEntry.comment : '';
        const strippedComment = stripTakeoverMetaBlock_ACU(currentComment);
        if (snapshotEntry.commentHash && hashUserInput_ACU(strippedComment) !== snapshotEntry.commentHash) {
          logWarn_ACU(
            `[Agent世界书] 跳过恢复世界书条目：${normalizedBookName}#${snapshotEntry.uid} comment 已变化，避免覆盖用户修改。`,
          );
          if (strippedComment !== currentComment) patches.push({ uid: snapshotEntry.uid, comment: strippedComment });
          skipped += 1;
          continue;
        }
        patches.push({
          uid: snapshotEntry.uid,
          comment: strippedComment,
          enabled: snapshotEntry.previousEnabled !== false,
          keys: Array.isArray(snapshotEntry.previousKeys) ? snapshotEntry.previousKeys : [],
          type: snapshotEntry.previousType,
        });
        restoredInBook += 1;
      }
      if (patches.length > 0) {
        await setLorebookEntries_ACU(normalizedBookName, patches);
        restored += restoredInBook;
      }
    } catch (error) {
      logWarn_ACU(`[Agent世界书] 恢复世界书条目失败：${normalizedBookName}`, error);
      failed += entriesToRestore.length;
    }
  }

  return { restored, skipped, failed };
}

export async function writeFinalGenerationGreenlights_ACU(greenlights: unknown): Promise<boolean> {
  const snapshot = getPlotAgentWorldbookSnapshot_ACU();
  const snapshotUidSetByBook = buildSnapshotUidSetByBook_ACU(snapshot);
  if (snapshotUidSetByBook.size === 0) return false;

  const normalizedGreenlights = normalizeAgentWorldbookRefs_ACU(greenlights);
  const allowedKeySet = buildAllowedFinalGreenlightKeySet_ACU(normalizedGreenlights, snapshotUidSetByBook);

  const patched = await patchSnapshotEntries_ACU(snapshotUidSetByBook, (bookName, entry) => {
    if (!hasValidWorldbookUid_ACU(entry?.uid)) return null;
    const isAllowed = allowedKeySet.has(buildFinalGreenlightKey_ACU(bookName, entry.uid));
    if (isAllowed) {
      if (entry.enabled !== false && String(entry.type || '').toLowerCase() === 'constant' && Array.isArray(entry.keys) && entry.keys.length === 0) {
        return null;
      }
      return { uid: entry.uid, enabled: true, type: 'constant', keys: [] };
    }
    if (entry.enabled === false) return null;
    return { uid: entry.uid, enabled: false };
  });

  return patched > 0;
}

export async function readFinalGenerationGreenlights_ACU(): Promise<AgentWorldbookFinalGreenlightRef_ACU[]> {
  const snapshot = getPlotAgentWorldbookSnapshot_ACU();
  const snapshotUidSetByBook = buildSnapshotUidSetByBook_ACU(snapshot);
  const greenlights: AgentWorldbookFinalGreenlightRef_ACU[] = [];
  const seen = new Set<string>();

  for (const [bookName, uidSet] of snapshotUidSetByBook.entries()) {
    const entries = await getLorebookEntries_ACU(bookName);
    for (const entry of entries || []) {
      if (!hasValidWorldbookUid_ACU(entry?.uid) || !uidSet.has(String(entry.uid)) || !isFinalGenerationBlueLightEntry_ACU(entry)) continue;
      const key = buildFinalGreenlightKey_ACU(bookName, entry.uid);
      if (seen.has(key)) continue;
      seen.add(key);
      greenlights.push({ bookName, uid: entry.uid });
    }
  }

  return greenlights;
}

export async function clearFinalGenerationGreenlights_ACU(): Promise<number> {
  const snapshot = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
  const snapshotUidSetByBook = buildSnapshotUidSetByBook_ACU(snapshot);
  const patched = await patchSnapshotEntries_ACU(snapshotUidSetByBook, (_bookName, entry) => {
    if (!isFinalGenerationBlueLightEntry_ACU(entry)) return null;
    return { uid: entry.uid, enabled: false };
  });
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const deletedLegacyEntries = await deleteInternalEntriesByComment_ACU(resolvedBookNames, AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU);
  return patched + deletedLegacyEntries;
}

export async function takeoverWorldbookGreenlights_ACU(): Promise<AgentWorldbookTakeoverResult_ACU> {
  const availability = await resolveAgentWorldbookFilterAvailability_ACU();
  const resolvedBookNames = availability.bookNames;
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);

  if (!availability.available) {
    const snapshot = buildInactiveSnapshot_ACU(selectionSignature);
    setPlotAgentWorldbookSnapshot_ACU(snapshot);
    return {
      updated: false,
      reason: availability.reason,
      bookNames: resolvedBookNames,
      selectionSignature,
      totalCandidates: 0,
      disabled: 0,
      failed: 0,
      snapshot,
      updates: [],
    };
  }

  const allowedUidSetByBook = buildSkillMetaUidSetByBook_ACU(availability.skillMetas);
  const { snapshotBooks, updates } = await collectTakeoverCandidates_ACU(resolvedBookNames, allowedUidSetByBook);
  const totalCandidates = updates.length || Object.values(snapshotBooks || {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0);
  const existingSnapshot = getPlotAgentWorldbookSnapshot_ACU();
  const shouldKeepExistingActiveSnapshot = totalCandidates === 0 && existingSnapshot.active === true && existingSnapshot.selectionSignature === selectionSignature;
  const snapshot = totalCandidates > 0
    ? buildActiveSnapshot_ACU(selectionSignature, snapshotBooks)
    : (shouldKeepExistingActiveSnapshot ? existingSnapshot : buildInactiveSnapshot_ACU(selectionSignature));
  const { disabled, failed } = totalCandidates > 0
    ? await disableTakeoverCandidates_ACU(snapshotBooks, selectionSignature, snapshot.createdAt)
    : { disabled: 0, failed: 0 };
  setPlotAgentWorldbookSnapshot_ACU(snapshot);

  return {
    updated: disabled > 0 || failed > 0,
    reason: totalCandidates > 0
      ? 'native_worldbook_trigger_disabled'
      : (shouldKeepExistingActiveSnapshot ? 'native_worldbook_trigger_already_disabled' : 'empty_candidates'),
    bookNames: resolvedBookNames,
    selectionSignature,
    totalCandidates,
    disabled,
    failed,
    snapshot,
    updates,
  };
}

export async function restoreWorldbookGreenlights_ACU(): Promise<AgentWorldbookRestoreResult_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const worldbookSnapshot = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
  const legacySnapshot = getLegacyPlotAgentWorldbookSnapshot_ACU();
  const shouldUseWorldbookSnapshot = worldbookSnapshot.active === true && worldbookSnapshot.selectionSignature === selectionSignature;
  const shouldUseLegacySnapshot = !shouldUseWorldbookSnapshot && legacySnapshot.active === true && legacySnapshot.selectionSignature === selectionSignature;
  const snapshot = shouldUseWorldbookSnapshot
    ? worldbookSnapshot
    : (shouldUseLegacySnapshot ? legacySnapshot : worldbookSnapshot);
  const shouldRestoreSnapshot = snapshot.active === true && snapshot.selectionSignature === selectionSignature;
  const restoreResult = shouldRestoreSnapshot
    ? await restoreSnapshotEntries_ACU(snapshot)
    : { restored: 0, skipped: 0, failed: 0 };
  const deletedFinalGreenlights = await deleteInternalEntriesByComment_ACU(resolvedBookNames, AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU);
  const deletedSnapshots = await deleteInternalEntriesByComment_ACU(resolvedBookNames, AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU);
  const legacySnapshotCleared = shouldUseLegacySnapshot && clearLegacyPlotAgentWorldbookSnapshot_ACU() ? 1 : 0;
  const cleaned = deletedFinalGreenlights + deletedSnapshots + legacySnapshotCleared;
  const changed = restoreResult.restored + restoreResult.failed + cleaned;
  setPlotAgentWorldbookSnapshot_ACU(buildInactiveSnapshot_ACU(selectionSignature));

  return {
    updated: changed > 0,
    reason: restoreResult.restored > 0
      ? 'native_worldbook_trigger_restored'
      : (restoreResult.skipped > 0
        ? 'native_worldbook_trigger_restore_skipped'
        : (cleaned > 0 ? 'legacy_artifacts_cleaned' : 'no_active_snapshot')),
    bookNames: resolvedBookNames,
    selectionSignature,
    restored: restoreResult.restored,
    skipped: restoreResult.skipped,
    failed: restoreResult.failed,
    updates: [],
  };
}
