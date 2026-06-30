import type {
  AgentWorldbookCardConfigMeta_ACU,
  AgentWorldbookControl_ACU,
  AgentWorldbookControlMode_ACU,
  AgentPlotExecutionMode_ACU,
} from '../../data/models/settings-model';
import {
  createLorebookEntries_ACU,
  getCharLorebooks_ACU,
  getCurrentCharPrimaryLorebook_ACU,
  getLorebookEntries_ACU,
  setLorebookEntries_ACU,
} from '../../data/gateways/worldbook-gateway';
import {
  buildDefaultAgentWorldbookControl_ACU,
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

export interface AgentWorldbookControlReadResult_ACU {
  control: AgentWorldbookControl_ACU;
  source: AgentWorldbookConfigSource_ACU;
  bookName: string;
  entryUid?: string | number;
  duplicateCount: number;
  writableBookName: string;
  reason?: string;
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

function buildAgentWorldbookCardConfigMeta_ACU(control: AgentWorldbookControl_ACU): AgentWorldbookCardConfigMeta_ACU {
  return {
    version: 1,
    kind: 'agent_worldbook_config',
    updatedAt: Date.now(),
    control,
  };
}

function parseAgentWorldbookCardConfigMeta_ACU(value: unknown): AgentWorldbookCardConfigMeta_ACU | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw.version !== 1 || raw.kind !== 'agent_worldbook_config') return null;
    return {
      version: 1,
      kind: 'agent_worldbook_config',
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
      control: normalizeControlPatch_ACU(raw.control) as Partial<AgentWorldbookControl_ACU>,
    };
  } catch {
    return null;
  }
}

function findAgentConfigEntries_ACU(entries: any[]): any[] {
  return (Array.isArray(entries) ? entries : [])
    .filter(entry => String(entry?.comment || '').trim() === AGENT_WORLDBOOK_CONFIG_COMMENT_ACU);
}

function buildConfigEntryPayload_ACU(control: AgentWorldbookControl_ACU, existing?: Record<string, any>): Record<string, any> {
  return {
    ...(existing || {}),
    comment: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU,
    content: JSON.stringify(buildAgentWorldbookCardConfigMeta_ACU(control), null, 2),
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
}> {
  const entries = await getLorebookEntries_ACU(bookName);
  const configEntries = findAgentConfigEntries_ACU(entries);
  for (const entry of configEntries) {
    const meta = parseAgentWorldbookCardConfigMeta_ACU(entry?.content);
    if (!meta) continue;
    return {
      bookName,
      entry,
      duplicateCount: Math.max(0, configEntries.length - 1),
      control: normalizeAgentWorldbookControlForCardConfig_ACU(meta.control),
    };
  }
  return { bookName, entry: null, duplicateCount: Math.max(0, configEntries.length - 1), control: null };
}

export async function readAgentWorldbookControlFromWorldbooks_ACU(): Promise<AgentWorldbookControlReadResult_ACU> {
  const writableBookName = await resolveAgentWorldbookConfigHostBook_ACU();
  const bookNames = await resolveAgentWorldbookConfigBookNames_ACU();
  const scanBookNames = normalizeBookNameList_ACU(writableBookName ? [writableBookName, ...bookNames] : bookNames);

  for (const bookName of scanBookNames) {
    const result = await readWorldbookConfigEntry_ACU(bookName);
    if (!result.control) continue;
    return {
      control: result.control,
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
      source: 'legacy_settings',
      bookName: '',
      duplicateCount: 0,
      writableBookName,
      reason: 'legacy_settings_fallback',
    };
  }

  return {
    control: cloneDefaultAgentControl_ACU(),
    source: 'default',
    bookName: '',
    duplicateCount: 0,
    writableBookName,
    reason: writableBookName ? 'worldbook_config_not_found' : 'no_config_host_book',
  };
}

export async function writeAgentWorldbookControlToWorldbook_ACU(
  controlPatch: Partial<AgentWorldbookControl_ACU>,
): Promise<AgentWorldbookControlWriteResult_ACU> {
  const hostBookName = await resolveAgentWorldbookConfigHostBook_ACU();
  const current = await readAgentWorldbookControlFromWorldbooks_ACU();
  const nextControl = normalizeAgentWorldbookControlForCardConfig_ACU({
    ...current.control,
    ...normalizeControlPatch_ACU(controlPatch),
  });

  if (!hostBookName) {
    return {
      updated: false,
      bookName: '',
      reason: 'no_config_host_book',
      control: nextControl,
    };
  }

  const entries = await getLorebookEntries_ACU(hostBookName);
  const existing = findAgentConfigEntries_ACU(entries)[0];
  const nextEntry = buildConfigEntryPayload_ACU(nextControl, existing);
  if (existing?.uid !== null && existing?.uid !== undefined) {
    await setLorebookEntries_ACU(hostBookName, [{ ...nextEntry, uid: existing.uid }]);
    return { updated: true, bookName: hostBookName, entryUid: existing.uid, control: nextControl };
  }

  await createLorebookEntries_ACU(hostBookName, [nextEntry]);
  return { updated: true, bookName: hostBookName, control: nextControl };
}

export { normalizeAgentWorldbookControlForCardConfig_ACU };
