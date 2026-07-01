import type {
  AgentWorldbookCardConfigMeta_ACU,
  AgentWorldbookControl_ACU,
  AgentWorldbookStateIdentity_ACU,
  AgentWorldbookControlMode_ACU,
  AgentWorldbookControlSnapshot_ACU,
  AgentWorldbookControlSnapshotEntry_ACU,
  AgentPlotExecutionMode_ACU,
  AgentWorldbookStateMeta_ACU,
} from '../../data/models/settings-model';
import {
  createLorebookEntries_ACU,
  deleteLorebookEntries_ACU,
  getCharLorebooks_ACU,
  getCurrentCharPrimaryLorebook_ACU,
  getLorebookEntries_ACU,
  setLorebookEntries_ACU,
} from '../../data/gateways/worldbook-gateway';
import {
  buildDefaultAgentWorldbookControl_ACU,
  buildDefaultAgentWorldbookControlSnapshot_ACU,
} from '../../shared/defaults';
import { settings_ACU } from '../runtime/state-manager';
import {
  getDefaultAgentDecisionPromptSegments_ACU,
  getDefaultAgentSkillifyPromptSegments_ACU,
  normalizeAgentContextSettings_ACU,
  normalizeEditablePromptSegments_ACU,
} from './agent-prompt-template';

export const AGENT_WORLDBOOK_CONFIG_COMMENT_ACU = 'TavernDB-ACU-AgentWorldbookConfig';

export type AgentWorldbookConfigSource_ACU = 'worldbook' | 'legacy_settings' | 'default';

interface ParsedAgentWorldbookStateMeta_ACU {
  control: Partial<AgentWorldbookControl_ACU>;
  snapshot: AgentWorldbookControlSnapshot_ACU;
  identity?: AgentWorldbookStateIdentity_ACU;
  updatedAt: number;
  legacy: boolean;
}

interface AgentWorldbookStateEntryCandidate_ACU {
  entry: any;
  meta: ParsedAgentWorldbookStateMeta_ACU;
  score: number;
  legacyCommentMatch: boolean;
}

export interface AgentWorldbookControlReadResult_ACU {
  control: AgentWorldbookControl_ACU;
  source: AgentWorldbookConfigSource_ACU;
  bookName: string;
  entryUid?: string | number;
  duplicateCount: number;
  writableBookName: string;
  reason?: string;
}

export interface AgentWorldbookStateReadResult_ACU extends AgentWorldbookControlReadResult_ACU {
  snapshot: AgentWorldbookControlSnapshot_ACU;
}

export interface AgentWorldbookStateWriteResult_ACU extends AgentWorldbookControlWriteResult_ACU {
  snapshot: AgentWorldbookControlSnapshot_ACU;
}

export interface AgentWorldbookControlWriteResult_ACU {
  updated: boolean;
  bookName: string;
  entryUid?: string | number;
  reason?: string;
  control: AgentWorldbookControl_ACU;
}

function cloneDefaultAgentControl_ACU(): AgentWorldbookControl_ACU {
  return JSON.parse(JSON.stringify(buildDefaultAgentWorldbookControl_ACU())) as AgentWorldbookControl_ACU;
}

function cloneDefaultAgentSnapshot_ACU(): AgentWorldbookControlSnapshot_ACU {
  return JSON.parse(JSON.stringify(buildDefaultAgentWorldbookControlSnapshot_ACU())) as AgentWorldbookControlSnapshot_ACU;
}

function normalizeBookNameList_ACU(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const name = String(item || '').trim();
    if (name && !result.includes(name)) result.push(name);
  }
  return result;
}

function normalizeMode_ACU(value: unknown): AgentWorldbookControlMode_ACU {
  return value === 'passive' || value === 'agent' ? value : 'disabled';
}

function normalizeExecutionMode_ACU(value: unknown): AgentPlotExecutionMode_ACU {
  return value === 'sequential' ? 'sequential' : 'concurrent';
}

function normalizePositiveInt_ACU(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  const base = Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  return Math.max(min, Math.min(max, base));
}

function normalizeControlPatch_ACU(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}


function normalizeAgentWorldbookControlForCardConfig_ACU(value: unknown): AgentWorldbookControl_ACU {
  const defaults = cloneDefaultAgentControl_ACU();
  const source = normalizeControlPatch_ACU(value);
  const mode = normalizeMode_ACU(source.mode);
  const agentPlotExecutionMode = normalizeExecutionMode_ACU(source.agentPlotExecutionMode);
  const contextSettings = normalizeAgentContextSettings_ACU(source.contextSettings);
  const maxEntriesPerChannel = normalizeControlPatch_ACU(source.maxEntriesPerChannel);

  return {
    ...defaults,
    enabled: mode !== 'disabled',
    mode,
    agentPlotExecutionMode,
    scopeMode: 'follow_worldbook_page_selection',
    agentApiPreset: typeof source.agentApiPreset === 'string' ? source.agentApiPreset.trim() : defaults.agentApiPreset,
    agentSkillApiPreset: typeof source.agentSkillApiPreset === 'string' ? source.agentSkillApiPreset.trim() : defaults.agentSkillApiPreset,
    skillMetadataPolicy: 'comment_block',
    managedEntryPrefix: typeof source.managedEntryPrefix === 'string' && source.managedEntryPrefix.trim()
      ? source.managedEntryPrefix.trim()
      : defaults.managedEntryPrefix,
    finalInjectionMode: 'prompt_template',
    restoreOnDisable: source.restoreOnDisable !== false,
    maxSkillifyConcurrency: normalizePositiveInt_ACU(source.maxSkillifyConcurrency, defaults.maxSkillifyConcurrency, 1, 5),
    contextSettings,
    contextSettingsConfigured: source.contextSettingsConfigured === true,
    agentDecisionPromptSegments: normalizeEditablePromptSegments_ACU(
      source.agentDecisionPromptSegments,
      getDefaultAgentDecisionPromptSegments_ACU(),
    ),
    agentSkillifyPromptSegments: normalizeEditablePromptSegments_ACU(
      source.agentSkillifyPromptSegments,
      getDefaultAgentSkillifyPromptSegments_ACU(),
    ),
    maxEntriesPerChannel: {
      plot: normalizePositiveInt_ACU(maxEntriesPerChannel.plot, defaults.maxEntriesPerChannel.plot, 1, 200),
      tableFill: normalizePositiveInt_ACU(maxEntriesPerChannel.tableFill, defaults.maxEntriesPerChannel.tableFill, 1, 200),
      finalGeneration: normalizePositiveInt_ACU(maxEntriesPerChannel.finalGeneration, defaults.maxEntriesPerChannel.finalGeneration, 1, 200),
    },
  };
}

function normalizeSnapshotKeys_ACU(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(key => String(key || '').trim()).filter(Boolean);
}

function hasValidWorldbookUid_ACU(uid: unknown): uid is string | number {
  return uid !== null && uid !== undefined && String(uid).trim() !== '';
}

function isSameWorldbookUid_ACU(left: unknown, right: unknown): boolean {
  return hasValidWorldbookUid_ACU(left) && hasValidWorldbookUid_ACU(right) && String(left) === String(right);
}

function normalizeSnapshotEntry_ACU(value: unknown): AgentWorldbookControlSnapshotEntry_ACU | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!hasValidWorldbookUid_ACU(source.uid)) return null;
  const previousType = source.previousType === undefined || source.previousType === null ? undefined : String(source.previousType);
  const commentHash = typeof source.commentHash === 'string' && source.commentHash.trim() ? source.commentHash.trim() : undefined;
  return {
    uid: source.uid,
    previousEnabled: source.previousEnabled !== false,
    previousKeys: normalizeSnapshotKeys_ACU(source.previousKeys),
    previousType,
    commentHash,
  };
}

function normalizeAgentWorldbookSnapshotForCardState_ACU(value: unknown): AgentWorldbookControlSnapshot_ACU {
  const defaults = cloneDefaultAgentSnapshot_ACU();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const source = value as Record<string, unknown>;
  const booksSource = source.books && typeof source.books === 'object' && !Array.isArray(source.books)
    ? source.books as Record<string, unknown>
    : {};
  const books: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]> = {};
  for (const [rawBookName, rawEntries] of Object.entries(booksSource)) {
    const bookName = String(rawBookName || '').trim();
    if (!bookName || !Array.isArray(rawEntries)) continue;
    const entries = rawEntries
      .map(entry => normalizeSnapshotEntry_ACU(entry))
      .filter(Boolean) as AgentWorldbookControlSnapshotEntry_ACU[];
    if (entries.length > 0) books[bookName] = entries;
  }
  return {
    active: source.active === true,
    selectionSignature: typeof source.selectionSignature === 'string' ? source.selectionSignature.trim() : defaults.selectionSignature,
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : defaults.createdAt,
    books,
  };
}

function normalizeAgentWorldbookStateIdentity_ACU(value: unknown): AgentWorldbookStateIdentity_ACU | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const marker = typeof source.marker === 'string' && source.marker.trim()
    ? source.marker.trim()
    : '';
  if (marker !== AGENT_WORLDBOOK_CONFIG_COMMENT_ACU) return undefined;
  const stateEntryUid = hasValidWorldbookUid_ACU(source.stateEntryUid) ? source.stateEntryUid : undefined;
  const hostBookName = typeof source.hostBookName === 'string' && source.hostBookName.trim()
    ? source.hostBookName.trim()
    : undefined;
  return { marker, ...(stateEntryUid !== undefined ? { stateEntryUid } : {}), ...(hostBookName ? { hostBookName } : {}) };
}

function buildAgentWorldbookStateIdentity_ACU(hostBookName: string, stateEntryUid?: string | number): AgentWorldbookStateIdentity_ACU {
  return {
    marker: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU,
    ...(hasValidWorldbookUid_ACU(stateEntryUid) ? { stateEntryUid } : {}),
    ...(hostBookName.trim() ? { hostBookName: hostBookName.trim() } : {}),
  };
}

function buildAgentWorldbookStateMeta_ACU(control: AgentWorldbookControl_ACU, snapshot: AgentWorldbookControlSnapshot_ACU, identity?: AgentWorldbookStateIdentity_ACU): AgentWorldbookStateMeta_ACU {
  return {
    version: 2,
    kind: 'agent_worldbook_state',
    updatedAt: Date.now(),
    ...(identity ? { identity } : {}),
    control,
    snapshot,
  };
}

function parseAgentWorldbookStateMeta_ACU(value: unknown): ParsedAgentWorldbookStateMeta_ACU | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw.version === 2 && raw.kind === 'agent_worldbook_state') {
      return {
        updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
        identity: normalizeAgentWorldbookStateIdentity_ACU(raw.identity),
        control: normalizeControlPatch_ACU(raw.control) as Partial<AgentWorldbookControl_ACU>,
        snapshot: normalizeAgentWorldbookSnapshotForCardState_ACU(raw.snapshot),
        legacy: false,
      };
    }
    if (raw.version !== 1 || raw.kind !== 'agent_worldbook_config') return null;
    const legacyMeta: AgentWorldbookCardConfigMeta_ACU = {
      version: 1,
      kind: 'agent_worldbook_config',
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
      control: normalizeControlPatch_ACU(raw.control) as Partial<AgentWorldbookControl_ACU>,
    };
    return {
      updatedAt: legacyMeta.updatedAt,
      control: legacyMeta.control,
      snapshot: cloneDefaultAgentSnapshot_ACU(),
      legacy: true,
    };
  } catch {
    return null;
  }
}

function findAgentConfigEntries_ACU(entries: any[]): any[] {
  return (Array.isArray(entries) ? entries : [])
    .filter(entry => String(entry?.comment || '').trim() === AGENT_WORLDBOOK_CONFIG_COMMENT_ACU);
}

function buildAgentStateEntryCandidates_ACU(entries: any[], hostBookName: string): AgentWorldbookStateEntryCandidate_ACU[] {
  const result: AgentWorldbookStateEntryCandidate_ACU[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const meta = parseAgentWorldbookStateMeta_ACU(entry?.content);
    const legacyCommentMatch = String(entry?.comment || '').trim() === AGENT_WORLDBOOK_CONFIG_COMMENT_ACU;
    if (!meta && !legacyCommentMatch) continue;
    if (!meta) continue;

    let score = 10;
    if (!meta.legacy) score += 20;
    if (legacyCommentMatch) score += 5;
    if (meta.identity?.hostBookName && meta.identity.hostBookName === hostBookName) score += 30;
    if (isSameWorldbookUid_ACU(meta.identity?.stateEntryUid, entry?.uid)) score += 50;
    if (meta.identity && !isSameWorldbookUid_ACU(meta.identity.stateEntryUid, entry?.uid) && hasValidWorldbookUid_ACU(meta.identity.stateEntryUid)) score -= 40;
    result.push({ entry, meta, score, legacyCommentMatch });
  }
  return result.sort((left, right) => right.score - left.score || Number(right.meta.updatedAt || 0) - Number(left.meta.updatedAt || 0));
}

function findAgentStateEntry_ACU(entries: any[], hostBookName: string): {
  entry: any | null;
  meta: ParsedAgentWorldbookStateMeta_ACU | null;
  duplicateCount: number;
} {
  const candidates = buildAgentStateEntryCandidates_ACU(entries, hostBookName);
  const selected = candidates[0];
  return {
    entry: selected?.entry || null,
    meta: selected?.meta || null,
    duplicateCount: Math.max(0, candidates.length - (selected ? 1 : 0)),
  };
}

function findCreatedAgentStateEntry_ACU(entries: any[], hostBookName: string, createdAfter: number): any | null {
  const candidates = buildAgentStateEntryCandidates_ACU(entries, hostBookName)
    .filter(candidate => candidate.entry?.uid !== null && candidate.entry?.uid !== undefined);
  return candidates.find(candidate => Number(candidate.meta.updatedAt || 0) >= createdAfter)?.entry
    || candidates[0]?.entry
    || null;
}

function buildConfigEntryPayload_ACU(
  control: AgentWorldbookControl_ACU,
  snapshot: AgentWorldbookControlSnapshot_ACU,
  hostBookName: string,
  existing?: Record<string, any>,
  stateEntryUid?: string | number,
): Record<string, any> {
  const resolvedUid = hasValidWorldbookUid_ACU(stateEntryUid) ? stateEntryUid : existing?.uid;
  const identity = buildAgentWorldbookStateIdentity_ACU(hostBookName, resolvedUid);
  return {
    ...(existing || {}),
    comment: typeof existing?.comment === 'string' && existing.comment.trim() ? existing.comment : AGENT_WORLDBOOK_CONFIG_COMMENT_ACU,
    content: JSON.stringify(buildAgentWorldbookStateMeta_ACU(control, snapshot, identity), null, 2),
    keys: Array.isArray(existing?.keys) ? existing.keys : [],
    enabled: false,
    type: 'keyword',
    order: Number.isFinite(Number(existing?.order)) ? Number(existing.order) : 10000,
    prevent_recursion: true,
  };
}


async function resolveCurrentCharPrimaryBookName_ACU(): Promise<string> {
  try {
    const primary = await getCurrentCharPrimaryLorebook_ACU();
    return String(primary || '').trim();
  } catch {
    return '';
  }
}

function getPlotWorldbookConfig_ACU(): Record<string, any> {
  const plotSettings = settings_ACU.plotSettings && typeof settings_ACU.plotSettings === 'object'
    ? settings_ACU.plotSettings as Record<string, any>
    : {};
  const cfg = plotSettings.plotWorldbookConfig;
  return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
}

function getManualPlotWorldbookNames_ACU(): string[] {
  const cfg = getPlotWorldbookConfig_ACU();
  return normalizeBookNameList_ACU(cfg.manualSelection);
}

export async function resolveAgentWorldbookConfigBookNames_ACU(): Promise<string[]> {
  const cfg = getPlotWorldbookConfig_ACU();
  if (cfg.source === 'manual') return getManualPlotWorldbookNames_ACU();

  const names: string[] = [];
  try {
    const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
    const primary = String(charLorebooks?.primary || '').trim();
    if (primary) names.push(primary);
    names.push(...normalizeBookNameList_ACU(charLorebooks?.additional));
  } catch {
    const primary = await resolveCurrentCharPrimaryBookName_ACU();
    if (primary) names.push(primary);
  }
  return normalizeBookNameList_ACU(names);
}

export async function resolveAgentWorldbookConfigHostBook_ACU(): Promise<string> {
  const primary = await resolveCurrentCharPrimaryBookName_ACU();
  if (primary) return primary;

  const cfg = getPlotWorldbookConfig_ACU();
  if (cfg.source === 'manual') {
    return getManualPlotWorldbookNames_ACU()[0] || '';
  }
  return '';
}

function getLegacyAgentWorldbookControl_ACU(): AgentWorldbookControl_ACU | null {
  const plotSettings = settings_ACU.plotSettings && typeof settings_ACU.plotSettings === 'object'
    ? settings_ACU.plotSettings as Record<string, any>
    : {};
  const legacy = plotSettings.agentWorldbookControl;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return null;
  return normalizeAgentWorldbookControlForCardConfig_ACU(legacy);
}

async function readWorldbookConfigEntry_ACU(bookName: string): Promise<{
  bookName: string;
  entry: any | null;
  duplicateCount: number;
  control: AgentWorldbookControl_ACU | null;
  snapshot: AgentWorldbookControlSnapshot_ACU | null;
}> {
  const entries = await getLorebookEntries_ACU(bookName);
  const result = findAgentStateEntry_ACU(entries, bookName);
  if (!result.entry || !result.meta) return { bookName, entry: null, duplicateCount: result.duplicateCount, control: null, snapshot: null };
  return {
    bookName,
    entry: result.entry,
    duplicateCount: result.duplicateCount,
    control: normalizeAgentWorldbookControlForCardConfig_ACU(result.meta.control),
    snapshot: normalizeAgentWorldbookSnapshotForCardState_ACU(result.meta.snapshot),
  };
}

export async function readAgentWorldbookStateFromWorldbooks_ACU(): Promise<AgentWorldbookStateReadResult_ACU> {
  const writableBookName = await resolveAgentWorldbookConfigHostBook_ACU();
  const bookNames = await resolveAgentWorldbookConfigBookNames_ACU();
  const scanBookNames = normalizeBookNameList_ACU(writableBookName ? [writableBookName, ...bookNames] : bookNames);

  for (const bookName of scanBookNames) {
    const result = await readWorldbookConfigEntry_ACU(bookName);
    if (!result.control) continue;
    return {
      control: result.control,
      snapshot: result.snapshot || cloneDefaultAgentSnapshot_ACU(),
      source: 'worldbook',
      bookName: result.bookName,
      entryUid: result.entry?.uid,
      duplicateCount: result.duplicateCount,
      writableBookName,
    };
  }

  const legacy = getLegacyAgentWorldbookControl_ACU();
  if (legacy) {
    return {
      control: legacy,
      snapshot: cloneDefaultAgentSnapshot_ACU(),
      source: 'legacy_settings',
      bookName: '',
      duplicateCount: 0,
      writableBookName,
      reason: 'legacy_settings_fallback',
    };
  }

  return {
    control: cloneDefaultAgentControl_ACU(),
    snapshot: cloneDefaultAgentSnapshot_ACU(),
    source: 'default',
    bookName: '',
    duplicateCount: 0,
    writableBookName,
    reason: writableBookName ? 'worldbook_config_not_found' : 'no_config_host_book',
  };
}

export async function readAgentWorldbookControlFromWorldbooks_ACU(): Promise<AgentWorldbookControlReadResult_ACU> {
  const state = await readAgentWorldbookStateFromWorldbooks_ACU();
  return {
    control: state.control,
    source: state.source,
    bookName: state.bookName,
    entryUid: state.entryUid,
    duplicateCount: state.duplicateCount,
    writableBookName: state.writableBookName,
    reason: state.reason,
  };
}

export async function writeAgentWorldbookStateToWorldbook_ACU(patch: {
  control?: Partial<AgentWorldbookControl_ACU>;
  snapshot?: AgentWorldbookControlSnapshot_ACU;
}): Promise<AgentWorldbookStateWriteResult_ACU> {
  const hostBookName = await resolveAgentWorldbookConfigHostBook_ACU();
  const current = await readAgentWorldbookStateFromWorldbooks_ACU();
  const nextControl = normalizeAgentWorldbookControlForCardConfig_ACU({
    ...current.control,
    ...normalizeControlPatch_ACU(patch?.control),
  });
  const nextSnapshot = patch?.snapshot === undefined
    ? normalizeAgentWorldbookSnapshotForCardState_ACU(current.snapshot)
    : normalizeAgentWorldbookSnapshotForCardState_ACU(patch.snapshot);

  if (!hostBookName) {
    return {
      updated: false,
      bookName: '',
      reason: 'no_config_host_book',
      control: nextControl,
      snapshot: nextSnapshot,
    };
  }

  const entries = await getLorebookEntries_ACU(hostBookName);
  const currentEntryUid = current.bookName === hostBookName ? current.entryUid : undefined;
  const existingByUid = hasValidWorldbookUid_ACU(currentEntryUid)
    ? entries.find(entry => isSameWorldbookUid_ACU(entry?.uid, currentEntryUid))
    : undefined;
  const existing = existingByUid || findAgentStateEntry_ACU(entries, hostBookName).entry;
  const nextEntry = buildConfigEntryPayload_ACU(nextControl, nextSnapshot, hostBookName, existing || undefined, existing?.uid);
  if (existing?.uid !== null && existing?.uid !== undefined) {
    await setLorebookEntries_ACU(hostBookName, [{ ...nextEntry, uid: existing.uid }]);
    return { updated: true, bookName: hostBookName, entryUid: existing.uid, control: nextControl, snapshot: nextSnapshot };
  }

  const createdAfter = Date.now();
  await createLorebookEntries_ACU(hostBookName, [nextEntry]);
  const refreshedEntries = await getLorebookEntries_ACU(hostBookName);
  const created = findCreatedAgentStateEntry_ACU(refreshedEntries, hostBookName, createdAfter);
  if (created?.uid !== null && created?.uid !== undefined) {
    const backfilledEntry = buildConfigEntryPayload_ACU(nextControl, nextSnapshot, hostBookName, created, created.uid);
    await setLorebookEntries_ACU(hostBookName, [{ ...backfilledEntry, uid: created.uid }]);
    return { updated: true, bookName: hostBookName, entryUid: created.uid, control: nextControl, snapshot: nextSnapshot };
  }
  return { updated: true, bookName: hostBookName, reason: 'state_entry_uid_unresolved', control: nextControl, snapshot: nextSnapshot };
}

export async function writeAgentWorldbookControlToWorldbook_ACU(
  controlPatch: Partial<AgentWorldbookControl_ACU>,
): Promise<AgentWorldbookControlWriteResult_ACU> {
  const result = await writeAgentWorldbookStateToWorldbook_ACU({ control: controlPatch });
  return {
    updated: result.updated,
    bookName: result.bookName,
    entryUid: result.entryUid,
    reason: result.reason,
    control: result.control,
  };
}

async function resolveAgentWorldbookStateCleanupBookNames_ACU(explicitBookName: string): Promise<string[]> {
  if (explicitBookName) return [explicitBookName];

  const names: string[] = [
    await resolveAgentWorldbookConfigHostBook_ACU(),
    ...(await resolveAgentWorldbookConfigBookNames_ACU()),
    ...getManualPlotWorldbookNames_ACU(),
  ];

  try {
    const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
    const primary = String(charLorebooks?.primary || '').trim();
    if (primary) names.push(primary);
    names.push(...normalizeBookNameList_ACU(charLorebooks?.additional));
  } catch {
    // Cleanup must remain best-effort across host/config changes; existing host/config names above are still valid.
  }

  return normalizeBookNameList_ACU(names);
}

export async function deleteAgentWorldbookStateEntry_ACU(bookName?: string): Promise<number> {
  const explicitBookName = String(bookName || '').trim();
  const scanBookNames = await resolveAgentWorldbookStateCleanupBookNames_ACU(explicitBookName);
  let deleted = 0;
  for (const targetBookName of scanBookNames) {
    const entries = await getLorebookEntries_ACU(targetBookName);
    const candidates = buildAgentStateEntryCandidates_ACU(entries, targetBookName)
      .map(candidate => candidate.entry)
      .filter(entry => entry?.uid !== null && entry?.uid !== undefined);
    const legacyCommentMatches = findAgentConfigEntries_ACU(entries)
      .filter(entry => entry?.uid !== null && entry?.uid !== undefined);
    const matchedByUid = new Map<string, any>();
    for (const entry of [...candidates, ...legacyCommentMatches]) {
      if (!hasValidWorldbookUid_ACU(entry?.uid)) continue;
      matchedByUid.set(String(entry.uid), entry);
    }
    const matched = Array.from(matchedByUid.values());
    if (matched.length === 0) continue;
    await deleteLorebookEntries_ACU(targetBookName, matched.map(entry => entry.uid));
    deleted += matched.length;
  }
  return deleted;
}

export { normalizeAgentWorldbookControlForCardConfig_ACU, normalizeAgentWorldbookSnapshotForCardState_ACU };
