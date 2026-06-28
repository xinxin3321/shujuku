import type {
  AgentWorldbookControlSnapshot_ACU,
  AgentWorldbookControlSnapshotEntry_ACU,
} from '../../data/models/settings-model';
import {
  deleteLorebookEntries_ACU,
  getLorebookEntries_ACU,
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


export const AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU = 'TavernDB-ACU-AgentWorldbookSnapshot';
export const AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU = 'TavernDB-ACU-AgentFinalGenerationGreenlights';


function normalizeBookNamesForTakeover_ACU(bookNames: unknown): string[] {
  if (!Array.isArray(bookNames)) return [];
  return [...new Set(bookNames.map(name => String(name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

export async function refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU(): Promise<AgentWorldbookControlSnapshot_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const snapshot = buildInactiveSnapshot_ACU(selectionSignature);
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

export async function writeFinalGenerationGreenlights_ACU(greenlights: unknown): Promise<boolean> {
  void greenlights;
  await clearFinalGenerationGreenlights_ACU();
  return false;
}

export async function readFinalGenerationGreenlights_ACU(): Promise<Array<{ bookName: string; uid: string | number; reason?: string }>> {
  return [];
}

export async function clearFinalGenerationGreenlights_ACU(): Promise<number> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  return deleteInternalEntriesByComment_ACU(resolvedBookNames, AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU);
}

export async function takeoverWorldbookGreenlights_ACU(): Promise<AgentWorldbookTakeoverResult_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const snapshot = buildInactiveSnapshot_ACU(selectionSignature);
  setPlotAgentWorldbookSnapshot_ACU(snapshot);

  if (resolvedBookNames.length === 0) {
    return {
      updated: false,
      reason: 'empty_scope',
      bookNames: resolvedBookNames,
      selectionSignature,
      totalCandidates: 0,
      disabled: 0,
      failed: 0,
      snapshot,
      updates: [],
    };
  }

  const { snapshotBooks, updates } = await collectTakeoverCandidates_ACU(resolvedBookNames);
  const totalCandidates = updates.length || Object.values(snapshotBooks || {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0);

  return {
    updated: true,
    reason: 'runtime_filter_only',
    bookNames: resolvedBookNames,
    selectionSignature,
    totalCandidates,
    disabled: 0,
    failed: 0,
    snapshot,
    updates,
  };
}

export async function restoreWorldbookGreenlights_ACU(): Promise<AgentWorldbookRestoreResult_ACU> {
  const resolvedBookNames = await resolveTakeoverBookNames_ACU();
  const selectionSignature = buildWorldbookSelectionSignature_ACU(resolvedBookNames);
  const deletedFinalGreenlights = await deleteInternalEntriesByComment_ACU(resolvedBookNames, AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU);
  const deletedSnapshots = await deleteInternalEntriesByComment_ACU(resolvedBookNames, AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU);
  const cleaned = deletedFinalGreenlights + deletedSnapshots;
  setPlotAgentWorldbookSnapshot_ACU(buildInactiveSnapshot_ACU(selectionSignature));

  return {
    updated: cleaned > 0,
    reason: cleaned > 0 ? 'legacy_artifacts_cleaned' : 'runtime_filter_only',
    bookNames: resolvedBookNames,
    selectionSignature,
    restored: 0,
    skipped: 0,
    failed: 0,
    updates: [],
  };
}
