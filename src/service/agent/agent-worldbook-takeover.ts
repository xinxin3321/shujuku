import type {
  AgentWorldbookControlSnapshot_ACU,
  AgentWorldbookControlSnapshotEntry_ACU,
} from '../../data/models/settings-model';
import {
  getLorebookEntries_ACU,
  isWorldbookEntryUpdateApiAvailable_ACU,
  setLorebookEntries_ACU,
} from '../../data/gateways/worldbook-gateway';
import { persistTavernSettings_ACU } from '../../data/storage/tavern-storage';
import { hashUserInput_ACU } from '../../shared/utils';
import { settings_ACU } from '../runtime/state-manager';
import {
  getWorldbookEntryKeywordsForSkillify_ACU,
  isWorldbookEntrySkillifyCandidate_ACU,
  resolvePlotWorldbookSkillifyBookNames_ACU,
} from './agent-skillify-service';

export interface AgentWorldbookTakeoverEntryUpdate_ACU {
  bookName: string;
  uid: string | number;
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

function normalizeBookNamesForTakeover_ACU(bookNames: unknown): string[] {
  if (!Array.isArray(bookNames)) return [];
  return [...new Set(bookNames.map(name => String(name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function hasValidWorldbookUid_ACU(uid: unknown): uid is string | number {
  return uid !== null && uid !== undefined && String(uid).trim() !== '';
}

function sameWorldbookUid_ACU(a: unknown, b: unknown): boolean {
  return String(a) === String(b);
}

export function buildWorldbookSelectionSignature_ACU(bookNames: string[]): string {
  const normalized = normalizeBookNamesForTakeover_ACU(bookNames);
  return hashUserInput_ACU(JSON.stringify({ scope: 'agent-worldbook-takeover', books: normalized }));
}

function buildInactiveSnapshot_ACU(selectionSignature = ''): AgentWorldbookControlSnapshot_ACU {
  return { active: false, selectionSignature, createdAt: 0, books: {} };
}

function ensurePlotSettingsContainer_ACU(): Record<string, any> {
  if (!settings_ACU.plotSettings || typeof settings_ACU.plotSettings !== 'object') {
    settings_ACU.plotSettings = {};
  }
  return settings_ACU.plotSettings as Record<string, any>;
}

export function getPlotAgentWorldbookSnapshot_ACU(): AgentWorldbookControlSnapshot_ACU {
  const snapshot = (settings_ACU.plotSettings as any)?.agentWorldbookControlSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return buildInactiveSnapshot_ACU();
  return {
    active: snapshot.active === true,
    selectionSignature: String(snapshot.selectionSignature || ''),
    createdAt: Number(snapshot.createdAt || 0),
    books: snapshot.books && typeof snapshot.books === 'object' ? snapshot.books : {},
  };
}

export function setPlotAgentWorldbookSnapshot_ACU(snapshot: AgentWorldbookControlSnapshot_ACU): void {
  const plotSettings = ensurePlotSettingsContainer_ACU();
  plotSettings.agentWorldbookControlSnapshot = snapshot;
  persistTavernSettings_ACU();
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
  const comment = typeof entry?.comment === 'string' ? entry.comment : '';
  return {
    uid: entry.uid,
    previousEnabled: entry.enabled !== false,
    previousKeys: getWorldbookEntryKeywordsForSkillify_ACU(entry),
    previousType,
    commentHash: hashUserInput_ACU(comment),
  };
}

async function collectTakeoverCandidates_ACU(bookNames: string[]): Promise<{
  snapshotBooks: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]>;
  updates: AgentWorldbookTakeoverEntryUpdate_ACU[];
}> {
  const snapshotBooks: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]> = {};
  const updates: AgentWorldbookTakeoverEntryUpdate_ACU[] = [];

  for (const bookName of bookNames) {
    const entries = await getLorebookEntries_ACU(bookName);
    const bookSnapshot: AgentWorldbookControlSnapshotEntry_ACU[] = [];
    for (const entry of entries || []) {
      if (!isWorldbookEntrySkillifyCandidate_ACU(entry)) continue;
      const snapshotEntry = buildSnapshotEntry_ACU(entry);
      if (!snapshotEntry) continue;
      bookSnapshot.push(snapshotEntry);
      updates.push({ bookName, uid: snapshotEntry.uid });
    }
    if (bookSnapshot.length > 0) snapshotBooks[bookName] = bookSnapshot;
  }

  return { snapshotBooks, updates };
}

export async function takeoverWorldbookGreenlights_ACU(): Promise<AgentWorldbookTakeoverResult_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const currentSnapshot = getPlotAgentWorldbookSnapshot_ACU();

  if (resolvedBookNames.length === 0) {
    return {
      updated: false,
      reason: 'empty_scope',
      bookNames: resolvedBookNames,
      selectionSignature,
      totalCandidates: 0,
      disabled: 0,
      failed: 0,
      snapshot: currentSnapshot,
      updates: [],
    };
  }

  if (!isWorldbookEntryUpdateApiAvailable_ACU()) {
    return {
      updated: false,
      reason: 'worldbook_api_unavailable',
      bookNames: resolvedBookNames,
      selectionSignature,
      totalCandidates: 0,
      disabled: 0,
      failed: 0,
      snapshot: currentSnapshot,
      updates: [],
    };
  }

  if (currentSnapshot.active) {
    return {
      updated: false,
      reason: currentSnapshot.selectionSignature === selectionSignature ? 'existing_active_snapshot' : 'snapshot_scope_mismatch',
      bookNames: resolvedBookNames,
      selectionSignature,
      totalCandidates: Object.values(currentSnapshot.books || {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0),
      disabled: 0,
      failed: 0,
      snapshot: currentSnapshot,
      updates: [],
    };
  }

  const { snapshotBooks, updates } = await collectTakeoverCandidates_ACU(resolvedBookNames);
  if (updates.length === 0) {
    return {
      updated: false,
      reason: 'no_candidates',
      bookNames: resolvedBookNames,
      selectionSignature,
      totalCandidates: 0,
      disabled: 0,
      failed: 0,
      snapshot: currentSnapshot,
      updates: [],
    };
  }

  const snapshot: AgentWorldbookControlSnapshot_ACU = {
    active: true,
    selectionSignature,
    createdAt: Date.now(),
    books: snapshotBooks,
  };

  setPlotAgentWorldbookSnapshot_ACU(snapshot);

  let disabled = 0;
  let failed = 0;
  for (const bookName of Object.keys(snapshotBooks)) {
    const entries = snapshotBooks[bookName] || [];
    if (entries.length === 0) continue;
    try {
      await setLorebookEntries_ACU(bookName, entries.map(entry => ({ uid: entry.uid, enabled: false })));
      disabled += entries.length;
    } catch (error) {
      failed += entries.length;
    }
  }

  return {
    updated: true,
    reason: failed > 0 ? 'snapshot_saved_with_disable_failures' : undefined,
    bookNames: resolvedBookNames,
    selectionSignature,
    totalCandidates: updates.length,
    disabled,
    failed,
    snapshot,
    updates,
  };
}

export async function restoreWorldbookGreenlights_ACU(): Promise<AgentWorldbookRestoreResult_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const snapshot = getPlotAgentWorldbookSnapshot_ACU();

  if (!snapshot.active) {
    return { updated: false, reason: 'no_active_snapshot', bookNames: resolvedBookNames, selectionSignature, restored: 0, skipped: 0, failed: 0, updates: [] };
  }
  if (snapshot.selectionSignature !== selectionSignature) {
    return { updated: false, reason: 'selection_signature_mismatch', bookNames: resolvedBookNames, selectionSignature, restored: 0, skipped: 0, failed: 0, updates: [] };
  }
  if (!isWorldbookEntryUpdateApiAvailable_ACU()) {
    return { updated: false, reason: 'worldbook_api_unavailable', bookNames: resolvedBookNames, selectionSignature, restored: 0, skipped: 0, failed: 0, updates: [] };
  }

  let restored = 0;
  let skipped = 0;
  let failed = 0;
  const updates: AgentWorldbookTakeoverEntryUpdate_ACU[] = [];

  for (const [bookName, snapshotEntries] of Object.entries(snapshot.books || {})) {
    const entries = Array.isArray(snapshotEntries) ? snapshotEntries.filter(entry => hasValidWorldbookUid_ACU(entry?.uid)) : [];
    if (entries.length === 0) continue;
    try {
      const currentEntries = await getLorebookEntries_ACU(bookName);
      const existingEntries = entries.filter(snapshotEntry => (currentEntries || []).some(entry => sameWorldbookUid_ACU(entry?.uid, snapshotEntry.uid)));
      skipped += entries.length - existingEntries.length;
      if (existingEntries.length === 0) continue;
      await setLorebookEntries_ACU(bookName, existingEntries.map(entry => ({ uid: entry.uid, enabled: entry.previousEnabled !== false })));
      restored += existingEntries.length;
      updates.push(...existingEntries.map(entry => ({ bookName, uid: entry.uid })));
    } catch (error) {
      failed += entries.length;
    }
  }

  if (failed === 0) {
    setPlotAgentWorldbookSnapshot_ACU(buildInactiveSnapshot_ACU(selectionSignature));
  }

  return {
    updated: failed === 0,
    reason: failed > 0 ? 'restore_failures_snapshot_kept' : undefined,
    bookNames: resolvedBookNames,
    selectionSignature,
    restored,
    skipped,
    failed,
    updates,
  };
}
