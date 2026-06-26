import { computed, ref } from 'vue';
import { buildDefaultAgentWorldbookControl_ACU } from '../../shared/defaults';
import type { AgentWorldbookControlMode_ACU, AgentWorldbookControlSnapshot_ACU } from '../../data/models/settings-model';
import { settings_ACU } from '../../service/runtime/state-manager';
import { saveSettings_ACU } from '../../service/settings/settings-service';
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
    snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
  }

  async function setMode(next: AgentWorldbookControlMode_ACU): Promise<void> {
    const control = ensureAgentControl_ACU();
    control.mode = next;
    control.enabled = next !== 'disabled';
    saveSettings_ACU();
    await refresh();
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
        const text = result.failed > 0
          ? plotCopy.agentControl.takeover.partial(result.disabled, result.failed)
          : plotCopy.agentControl.takeover.success(result.disabled);
        if (result.failed > 0) toast.warning(text, { muteable: false });
        else toast.success(text, { muteable: false });
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
        toast.success(plotCopy.agentControl.restore.success(result.restored, result.skipped), { muteable: false });
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
    isAgentMode,
    snapshotEntryCount,
    apiPresetOptions,
    refresh,
    setMode,
    setAgentApiPreset,
    setAgentSkillApiPreset,
    takeover,
    restore,
    skillifyAll,
  };
}
