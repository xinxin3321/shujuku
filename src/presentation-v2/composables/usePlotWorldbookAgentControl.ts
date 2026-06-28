import { computed, ref } from 'vue';
import {
  AGENT_CONTEXT_SETTINGS_LIMITS_ACU,
  buildDefaultAgentWorldbookControl_ACU,
} from '../../shared/defaults';
import type {
  AgentContextSettings_ACU,
  AgentWorldbookControlMode_ACU,
  AgentWorldbookControlSnapshot_ACU,
  PromptSegment_ACU,
} from '../../data/models/settings-model';
import { settings_ACU, _set_pendingFinalGenerationGreenlights_ACU } from '../../service/runtime/state-manager';
import { saveSettings_ACU } from '../../service/settings/settings-service';
import {
  clonePromptSegments_ACU,
  getDefaultAgentDecisionPromptSegments_ACU,
  getDefaultAgentSkillifyPromptSegments_ACU,
  normalizeAgentContextSettings_ACU,
  normalizeEditablePromptSegments_ACU,
} from '../../service/agent/agent-prompt-template';
import {
  getPlotAgentWorldbookSnapshot_ACU,
  refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU,
  restoreWorldbookGreenlights_ACU,
  takeoverWorldbookGreenlights_ACU,
} from '../../service/agent/agent-worldbook-takeover';
import { skillifyCurrentPlotWorldbookSelection_ACU } from '../../service/agent/agent-skillify-service';
import { plotCopy } from '../copy/plot-copy';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';

export type AgentWorldbookBusyAction = 'takeover' | 'restore' | 'skillify' | null;

interface AgentApiPresetOption {
  value: string;
  label: string;
}

export type AgentPromptKind_ACU = 'decision' | 'skillify';
export type AgentContextSettingKey_ACU = keyof AgentContextSettings_ACU;

function ensureAgentControl_ACU(): Record<string, any> {
  if (!settings_ACU.plotSettings || typeof settings_ACU.plotSettings!== 'object') settings_ACU.plotSettings = {} as any;
  const plot = settings_ACU.plotSettings as Record<string, any>;
  if (!plot.agentWorldbookControl || typeof plot.agentWorldbookControl !== 'object') {
    plot.agentWorldbookControl = buildDefaultAgentWorldbookControl_ACU();
  }
  const control = plot.agentWorldbookControl as Record<string, any>;
  if (!['disabled', 'passive', 'agent'].includes(String(control.mode))) control.mode = 'disabled';
  control.enabled = control.mode !== 'disabled';
  return control;
}

function getPromptFallback_ACU(kind: AgentPromptKind_ACU): PromptSegment_ACU[] {
  return kind === 'decision' ? getDefaultAgentDecisionPromptSegments_ACU() : getDefaultAgentSkillifyPromptSegments_ACU();
}

function readPromptSegments_ACU(control: Record<string, any>, kind: AgentPromptKind_ACU): PromptSegment_ACU[] {
  const key = kind === 'decision' ? 'agentDecisionPromptSegments' : 'agentSkillifyPromptSegments';
  return normalizeEditablePromptSegments_ACU(control[key], getPromptFallback_ACU(kind));
}

function writePromptSegments_ACU(control: Record<string, any>, kind: AgentPromptKind_ACU, segments: PromptSegment_ACU[]): void {
  const key = kind === 'decision' ? 'agentDecisionPromptSegments' : 'agentSkillifyPromptSegments';
  control[key] = normalizeEditablePromptSegments_ACU(segments, getPromptFallback_ACU(kind));
}

function cloneContextSettings_ACU(value: AgentContextSettings_ACU): AgentContextSettings_ACU {
  return { ...(value as unknown as Record<string, number>) } as unknown as AgentContextSettings_ACU;
}

function normalizeContextPatch_ACU(
  current: AgentContextSettings_ACU,
  key: AgentContextSettingKey_ACU,
  rawValue: unknown,
): AgentContextSettings_ACU | null {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw)) return null;
  return normalizeAgentContextSettings_ACU({
    ...(current as unknown as Record<string, number>),
    [key]: Math.trunc(raw),
  });
}

function movePromptSegment_ACU(segments: PromptSegment_ACU[], index: number, delta: -1 | 1): PromptSegment_ACU[] {
  const target = index + delta;
  if (index < 0 || index >= segments.length || target < 0 || target >= segments.length) return segments;
  const next = clonePromptSegments_ACU(segments);
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function countSnapshotEntries(snapshot: AgentWorldbookControlSnapshot_ACU): number {
  return Object.values(snapshot.books || {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0);
}

function getAgentApiPresetOptions_ACU(): AgentApiPresetOption[] {
  const seen = new Set<string>();
  const options: AgentApiPresetOption[] = [{
    value: '',
    label: plotCopy.agentControl.apiPresets.followCurrentLabel,
  }];
  const presets = Array.isArray(settings_ACU.apiPresets) ? settings_ACU.apiPresets : [];
  for (const preset of presets) {
    const name = typeof preset?.name === 'string' ? preset.name.trim() : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({ value: name, label: name });
  }
  return options;
}

function normalizeAgentApiPreset_ACU(value: unknown): string {
  const name = String(value || '').trim();
  if (!name) return '';
  return getAgentApiPresetOptions_ACU().some(option => option.value === name) ? name : '';
}

export function usePlotWorldbookAgentControl() {
  const toast = useToastStore();
  const dialog = useDialogStore();
  const mode = ref<AgentWorldbookControlMode_ACU>('disabled');
  const agentApiPreset = ref('');
  const agentSkillApiPreset = ref('');
  const snapshot = ref<AgentWorldbookControlSnapshot_ACU>(getPlotAgentWorldbookSnapshot_ACU());
  const busy = ref<AgentWorldbookBusyAction>(null);
  const contextSettings = ref<AgentContextSettings_ACU>(normalizeAgentContextSettings_ACU(undefined));
  const agentDecisionPromptSegments = ref<PromptSegment_ACU[]>(getDefaultAgentDecisionPromptSegments_ACU());
  const agentSkillifyPromptSegments = ref<PromptSegment_ACU[]>(getDefaultAgentSkillifyPromptSegments_ACU());

  const isAgentMode = computed(() => mode.value === 'agent');
  const snapshotEntryCount = computed(() => countSnapshotEntries(snapshot.value));
  const apiPresetOptions = computed<AgentApiPresetOption[]>(getAgentApiPresetOptions_ACU);

  async function refresh(): Promise<void> {
    const control = ensureAgentControl_ACU();
    const nextAgentApiPreset = normalizeAgentApiPreset_ACU(control.agentApiPreset);
    const nextAgentSkillApiPreset = normalizeAgentApiPreset_ACU(control.agentSkillApiPreset);
    const shouldSave = control.agentApiPreset !== nextAgentApiPreset || control.agentSkillApiPreset !== nextAgentSkillApiPreset;
    control.agentApiPreset = nextAgentApiPreset;
    control.agentSkillApiPreset = nextAgentSkillApiPreset;
    if (shouldSave) saveSettings_ACU();
    mode.value = control.mode as AgentWorldbookControlMode_ACU;
    agentApiPreset.value = nextAgentApiPreset;
    agentSkillApiPreset.value = nextAgentSkillApiPreset;
    contextSettings.value = cloneContextSettings_ACU(normalizeAgentContextSettings_ACU(control.contextSettings));
    agentDecisionPromptSegments.value = clonePromptSegments_ACU(readPromptSegments_ACU(control, 'decision'));
    agentSkillifyPromptSegments.value = clonePromptSegments_ACU(readPromptSegments_ACU(control, 'skillify'));
    snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
  }

  async function setMode(next: AgentWorldbookControlMode_ACU): Promise<void> {
    const control = ensureAgentControl_ACU();
    control.mode = next;
    control.enabled = next !== 'disabled';
    saveSettings_ACU();
    await refresh();
    if (next === 'agent') {
      busy.value = 'takeover';
      try {
        const result = await takeoverWorldbookGreenlights_ACU();
        await refresh();
        if (result.updated) {
          toast.success(plotCopy.agentControl.takeover.success(), { muteable: false });
        } else {
          const message = plotCopy.agentControl.takeover.reasons[result.reason || ''] || plotCopy.agentControl.takeover.noop;
          toast.warning(message, { muteable: false });
        }
      } catch (e: any) {
        toast.error(`${plotCopy.agentControl.takeover.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      } finally {
        busy.value = null;
      }
      return;
    }
    if (next === 'disabled') {
      _set_pendingFinalGenerationGreenlights_ACU([]);
      busy.value = 'restore';
      try {
        const result = await restoreWorldbookGreenlights_ACU();
        await refresh();
        if (result.updated) {
          toast.success(plotCopy.agentControl.restore.success(), { muteable: false });
        } else {
          const message = plotCopy.agentControl.restore.reasons[result.reason || ''] || plotCopy.agentControl.restore.noop;
          toast.info(message, { muteable: false });
        }
      } catch (e: any) {
        toast.error(`${plotCopy.agentControl.restore.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      } finally {
        busy.value = null;
      }
      return;
    }
    toast.info(plotCopy.agentControl.modeChanged[next], { muteable: false });
  }

  async function setAgentApiPreset(next: string): Promise<void> {
    const control = ensureAgentControl_ACU();
    control.agentApiPreset = normalizeAgentApiPreset_ACU(next);
    saveSettings_ACU();
    await refresh();
  }

  async function setAgentSkillApiPreset(next: string): Promise<void> {
    const control = ensureAgentControl_ACU();
    control.agentSkillApiPreset = normalizeAgentApiPreset_ACU(next);
    saveSettings_ACU();
    await refresh();
  }

  async function setContextSetting(key: AgentContextSettingKey_ACU, value: unknown): Promise<boolean> {
    const next = normalizeContextPatch_ACU(contextSettings.value, key, value);
    if (!next) return false;
    const control = ensureAgentControl_ACU();
    control.contextSettings = next;
    control.contextSettingsConfigured = true;
    saveSettings_ACU();
    await refresh();
    return true;
  }

  async function resetContextSettings(): Promise<void> {
    const control = ensureAgentControl_ACU();
    control.contextSettings = normalizeAgentContextSettings_ACU(undefined);
    control.contextSettingsConfigured = true;
    saveSettings_ACU();
    await refresh();
  }

  async function setPromptSegments(kind: AgentPromptKind_ACU, segments: PromptSegment_ACU[]): Promise<void> {
    const control = ensureAgentControl_ACU();
    writePromptSegments_ACU(control, kind, segments);
    saveSettings_ACU();
    await refresh();
  }

  async function resetPromptSegments(kind: AgentPromptKind_ACU): Promise<void> {
    await setPromptSegments(kind, getPromptFallback_ACU(kind));
  }

  async function addPromptSegment(kind: AgentPromptKind_ACU, position: 'top' | 'bottom'): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    const next = clonePromptSegments_ACU(current);
    const segment: PromptSegment_ACU = { role: 'user', content: '', deletable: true };
    if (position === 'top') next.unshift(segment);
    else next.push(segment);
    await setPromptSegments(kind, next);
  }

  async function updatePromptSegment(
    kind: AgentPromptKind_ACU,
    index: number,
    patch: Partial<PromptSegment_ACU>,
  ): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    if (index < 0 || index >= current.length) return;
    const next = clonePromptSegments_ACU(current);
    next[index] = { ...next[index], ...patch };
    await setPromptSegments(kind, next);
  }

  async function deletePromptSegment(kind: AgentPromptKind_ACU, index: number): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    if (index < 0 || index >= current.length || current[index]?.deletable === false) return;
    const next = clonePromptSegments_ACU(current);
    next.splice(index, 1);
    await setPromptSegments(kind, next);
  }

  async function movePromptSegment(kind: AgentPromptKind_ACU, index: number, delta: -1 | 1): Promise<void> {
    const current = kind === 'decision' ? agentDecisionPromptSegments.value : agentSkillifyPromptSegments.value;
    await setPromptSegments(kind, movePromptSegment_ACU(current, index, delta));
  }

  async function takeover(): Promise<boolean> {
    await refresh();
    if (!isAgentMode.value) {
      toast.warning(plotCopy.agentControl.takeover.modeRequired, { muteable: false });
      return false;
    }
    const confirmed = await dialog.confirm({ ...plotCopy.agentControl.takeover.confirm, confirmVariant: 'danger' });
    if (!confirmed) return false;
    busy.value = 'takeover';
    try {
      const result = await takeoverWorldbookGreenlights_ACU();
      await refresh();
      if (result.updated) {
        toast.success(plotCopy.agentControl.takeover.success(), { muteable: false });
        return true;
      }
      const message = plotCopy.agentControl.takeover.reasons[result.reason || ''] || plotCopy.agentControl.takeover.noop;
      toast.warning(message, { muteable: false });
      return false;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.takeover.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function restore(): Promise<boolean> {
    const confirmed = await dialog.confirm(plotCopy.agentControl.restore.confirm);
    if (!confirmed) return false;
    busy.value = 'restore';
    try {
      const result = await restoreWorldbookGreenlights_ACU();
      await refresh();
      if (result.updated) {
        toast.success(plotCopy.agentControl.restore.success(), { muteable: false });
        return true;
      }
      const message = plotCopy.agentControl.restore.reasons[result.reason || ''] || plotCopy.agentControl.restore.noop;
      toast.warning(message, { muteable: false });
      return false;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.restore.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function skillifyAll(): Promise<boolean> {
    await refresh();
    const confirmed = await dialog.confirm(plotCopy.agentControl.skillify.confirm);
    if (!confirmed) return false;
    busy.value = 'skillify';
    try {
      const control = ensureAgentControl_ACU();
      const result = await skillifyCurrentPlotWorldbookSelection_ACU({
        presetName: String(control.agentSkillApiPreset || ''),
        overwriteManual: false,
      });
      if (result.totalCandidates === 0) {
        toast.warning(plotCopy.agentControl.skillify.noCandidates, { muteable: false });
        return false;
      }
      const text = result.failed > 0
        ? plotCopy.agentControl.skillify.partial(result.updated, result.skipped, result.failed)
        : plotCopy.agentControl.skillify.success(result.updated, result.skipped);
      if (result.failed > 0) toast.warning(text, { muteable: false });
      else toast.success(text, { muteable: false });
      return result.updated > 0;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.skillify.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  void refresh();

  return {
    mode,
    agentApiPreset,
    agentSkillApiPreset,
    snapshot,
    busy,
    contextSettings,
    contextSettingsLimits: AGENT_CONTEXT_SETTINGS_LIMITS_ACU,
    agentDecisionPromptSegments,
    agentSkillifyPromptSegments,
    isAgentMode,
    snapshotEntryCount,
    apiPresetOptions,
    refresh,
    setMode,
    setAgentApiPreset,
    setAgentSkillApiPreset,
    takeover,
    setContextSetting,
    resetContextSettings,
    setPromptSegments,
    resetPromptSegments,
    addPromptSegment,
    updatePromptSegment,
    deletePromptSegment,
    movePromptSegment,
    restore,
    skillifyAll,
  };
}
