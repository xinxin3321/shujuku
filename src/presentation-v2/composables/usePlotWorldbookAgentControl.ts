import { computed, ref } from 'vue';
import { AGENT_CONTEXT_SETTINGS_LIMITS_ACU } from '../../shared/defaults';
import type {
  AgentContextSettings_ACU,
  AgentPlotExecutionMode_ACU,
  AgentWorldbookControl_ACU,
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
import {
  skillifyCurrentPlotWorldbookSelection_ACU,
  type AgentSkillifyProgressEvent_ACU,
  type AgentSkillifySelectedEntry_ACU,
} from '../../service/agent/agent-skillify-service';
import {
  clearWorldbookSkillMetaBlocks_ACU,
  resolveAgentWorldbookFilterAvailability_ACU,
} from '../../service/agent/agent-worldbook-skill-meta';
import {
  readAgentWorldbookControlFromWorldbooks_ACU,
  writeAgentWorldbookControlToWorldbook_ACU,
  type AgentWorldbookConfigSource_ACU,
  type AgentWorldbookControlWriteResult_ACU,
} from '../../service/agent/agent-worldbook-config-meta';
import { plotCopy } from '../copy/plot-copy';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';

export type AgentWorldbookBusyAction = 'restore' | 'skillify' | 'clearSkillMeta' | null;

interface AgentApiPresetOption {
  value: string;
  label: string;
}

export type AgentPromptKind_ACU = 'decision' | 'skillify';
export type AgentContextSettingKey_ACU = keyof AgentContextSettings_ACU;
export type AgentPlotExecutionModeSetting_ACU = AgentPlotExecutionMode_ACU;

const MAX_SKILLIFY_CONCURRENCY_LIMIT_ACU = { min: 1, max: 5 };

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

function normalizeMaxSkillifyConcurrency_ACU(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const truncated = Math.trunc(raw);
  return Math.max(MAX_SKILLIFY_CONCURRENCY_LIMIT_ACU.min, Math.min(MAX_SKILLIFY_CONCURRENCY_LIMIT_ACU.max, truncated));
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

function disableLegacyAgentWorldbookControl_ACU(options: { clearSnapshot?: boolean } = {}): void {
  const plotSettings = settings_ACU.plotSettings as Record<string, any> | undefined;
  if (!plotSettings || typeof plotSettings !== 'object') return;
  let changed = false;
  const legacyControl = plotSettings.agentWorldbookControl;
  if (legacyControl && typeof legacyControl === 'object' && !Array.isArray(legacyControl)) {
    if (legacyControl.mode !== 'disabled' || legacyControl.enabled !== false) {
      legacyControl.mode = 'disabled';
      legacyControl.enabled = false;
      changed = true;
    }
  }
  if (options.clearSnapshot === true && Object.prototype.hasOwnProperty.call(plotSettings, 'agentWorldbookControlSnapshot')) {
    delete plotSettings.agentWorldbookControlSnapshot;
    changed = true;
  }
  if (changed) saveSettings_ACU();
}

export function usePlotWorldbookAgentControl() {
  const toast = useToastStore();
  const dialog = useDialogStore();
  const mode = ref<AgentWorldbookControlMode_ACU>('disabled');
  const agentPlotExecutionMode = ref<AgentPlotExecutionMode_ACU>('concurrent');
  const agentApiPreset = ref('');
  const agentSkillApiPreset = ref('');
  const maxSkillifyConcurrency = ref(3);
  const snapshot = ref<AgentWorldbookControlSnapshot_ACU>(getPlotAgentWorldbookSnapshot_ACU());
  const busy = ref<AgentWorldbookBusyAction>(null);
  const configSource = ref<AgentWorldbookConfigSource_ACU>('default');
  const configBookName = ref('');
  const writableConfigBookName = ref('');
  const configReason = ref('');
  const contextSettings = ref<AgentContextSettings_ACU>(normalizeAgentContextSettings_ACU(undefined));
  const agentDecisionPromptSegments = ref<PromptSegment_ACU[]>(getDefaultAgentDecisionPromptSegments_ACU());
  const agentSkillifyPromptSegments = ref<PromptSegment_ACU[]>(getDefaultAgentSkillifyPromptSegments_ACU());

  const isAgentMode = computed(() => mode.value === 'agent');
  const snapshotEntryCount = computed(() => countSnapshotEntries(snapshot.value));
  const apiPresetOptions = computed<AgentApiPresetOption[]>(getAgentApiPresetOptions_ACU);
  const configStatusText = computed(() => plotCopy.agentControl.config.status({
    source: configSource.value,
    bookName: configBookName.value,
    writableBookName: writableConfigBookName.value,
    reason: configReason.value,
  }));

  function applyControlToRefs(control: AgentWorldbookControl_ACU): void {
    mode.value = control.mode;
    agentPlotExecutionMode.value = control.agentPlotExecutionMode;
    agentApiPreset.value = normalizeAgentApiPreset_ACU(control.agentApiPreset);
    agentSkillApiPreset.value = normalizeAgentApiPreset_ACU(control.agentSkillApiPreset);
    maxSkillifyConcurrency.value = normalizeMaxSkillifyConcurrency_ACU(control.maxSkillifyConcurrency) ?? 3;
    contextSettings.value = cloneContextSettings_ACU(normalizeAgentContextSettings_ACU(control.contextSettings));
    agentDecisionPromptSegments.value = clonePromptSegments_ACU(readPromptSegments_ACU(control as unknown as Record<string, any>, 'decision'));
    agentSkillifyPromptSegments.value = clonePromptSegments_ACU(readPromptSegments_ACU(control as unknown as Record<string, any>, 'skillify'));
  }

  async function refresh(): Promise<void> {
    const result = await readAgentWorldbookControlFromWorldbooks_ACU();
    configSource.value = result.source;
    configBookName.value = result.bookName || '';
    writableConfigBookName.value = result.writableBookName || '';
    configReason.value = result.reason || '';
    applyControlToRefs(result.control);
    snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
  }

  async function writeControlPatch(patch: Partial<AgentWorldbookControl_ACU>): Promise<AgentWorldbookControlWriteResult_ACU | null> {
    const result = await writeAgentWorldbookControlToWorldbook_ACU(patch);
    if (!result.updated) {
      toast.error(plotCopy.agentControl.config.saveFailed(result.reason || 'unknown'), { muteable: false });
      applyControlToRefs(result.control);
      return null;
    }
    await refresh();
    return result;
  }

  async function setMode(next: AgentWorldbookControlMode_ACU): Promise<void> {
    const saved = await writeControlPatch({ mode: next, enabled: next !== 'disabled' });
    if (!saved) return;
    if (next === 'agent') {
      try {
        const takeoverResult = await takeoverWorldbookGreenlights_ACU();
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        if (takeoverResult.failed > 0 || snapshot.value.active !== true) {
          toast.warning(`Agent 世界书已切换为接管模式，但物理接管未完全完成：${takeoverResult.reason || 'unknown'}`, { muteable: false });
          return;
        }
      } catch (error: any) {
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        toast.warning(`Agent 世界书已切换为接管模式，但物理接管失败：${error?.message || '未知错误'}`, { muteable: false });
        return;
      }
      toast.info(plotCopy.agentControl.modeChanged.agent, { muteable: false });
      return;
    }
    if (next === 'disabled') {
      try {
        _set_pendingFinalGenerationGreenlights_ACU([]);
        disableLegacyAgentWorldbookControl_ACU();
        const restoreResult = await restoreWorldbookGreenlights_ACU({ cleanupMode: 'restore_only' });
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        if (restoreResult.skipped > 0 || restoreResult.failed > 0) {
          const message = plotCopy.agentControl.restore.reasons[restoreResult.reason || ''] || `Agent 世界书已关闭，但恢复受控条目未完全完成：${restoreResult.reason || 'unknown'}`;
          toast.warning(message, { muteable: false });
          return;
        }
        toast.info(plotCopy.agentControl.modeChanged.disabled, { muteable: false });
        return;
      } catch (error: any) {
        snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
        toast.warning(`Agent 世界书已关闭，但恢复受控条目失败：${error?.message || '未知错误'}`, { muteable: false });
        return;
      }
    }
    toast.info(plotCopy.agentControl.modeChanged[next], { muteable: false });
  }

  async function setAgentPlotExecutionMode(next: AgentPlotExecutionMode_ACU): Promise<void> {
    await writeControlPatch({ agentPlotExecutionMode: next === 'concurrent' ? 'concurrent' : 'sequential' });
  }

  async function setAgentApiPreset(next: string): Promise<void> {
    await writeControlPatch({ agentApiPreset: normalizeAgentApiPreset_ACU(next) });
  }

  async function setAgentSkillApiPreset(next: string): Promise<void> {
    await writeControlPatch({ agentSkillApiPreset: normalizeAgentApiPreset_ACU(next) });
  }

  async function setMaxSkillifyConcurrency(value: unknown): Promise<boolean> {
    const next = normalizeMaxSkillifyConcurrency_ACU(value);
    if (next === null) return false;
    return Boolean(await writeControlPatch({ maxSkillifyConcurrency: next }));
  }

  async function setContextSetting(key: AgentContextSettingKey_ACU, value: unknown): Promise<boolean> {
    const next = normalizeContextPatch_ACU(contextSettings.value, key, value);
    if (!next) return false;
    return Boolean(await writeControlPatch({ contextSettings: next, contextSettingsConfigured: true }));
  }

  async function resetContextSettings(): Promise<void> {
    await writeControlPatch({
      contextSettings: normalizeAgentContextSettings_ACU(undefined),
      contextSettingsConfigured: true,
    });
  }

  async function setPromptSegments(kind: AgentPromptKind_ACU, segments: PromptSegment_ACU[]): Promise<void> {
    const control = {
      agentDecisionPromptSegments: agentDecisionPromptSegments.value,
      agentSkillifyPromptSegments: agentSkillifyPromptSegments.value,
    } as Record<string, any>;
    writePromptSegments_ACU(control, kind, segments);
    const key = kind === 'decision' ? 'agentDecisionPromptSegments' : 'agentSkillifyPromptSegments';
    await writeControlPatch({ [key]: control[key] } as Partial<AgentWorldbookControl_ACU>);
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

  async function restore(): Promise<boolean> {
    const confirmed = await dialog.confirm(plotCopy.agentControl.restore.confirm);
    if (!confirmed) return false;
    busy.value = 'restore';
    try {
      _set_pendingFinalGenerationGreenlights_ACU([]);
      const saved = await writeControlPatch({ mode: 'disabled', enabled: false });
      disableLegacyAgentWorldbookControl_ACU();
      if (!saved) return false;
      const result = await restoreWorldbookGreenlights_ACU({ cleanupMode: 'full' });
      disableLegacyAgentWorldbookControl_ACU({ clearSnapshot: result.updated && result.skipped === 0 && result.failed === 0 });
      await refresh();
      const message = plotCopy.agentControl.restore.reasons[result.reason || ''] || plotCopy.agentControl.restore.noop;
      if (result.skipped > 0 || result.failed > 0) {
        toast.warning(message, { muteable: false });
        return false;
      }
      if (result.updated) {
        toast.success(plotCopy.agentControl.restore.success(), { muteable: false });
        return true;
      }
      toast.info(message, { muteable: false });
      return true;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.restore.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function syncAgentWorldbookTakeoverAfterSkillChange(): Promise<boolean> {
    try {
      await refresh();
      if (!isAgentMode.value) return false;
      const takeoverResult = await takeoverWorldbookGreenlights_ACU();
      snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
      if (takeoverResult.failed > 0) {
        toast.warning(`Skill 元数据已更新，但 Agent 世界书接管同步未完全完成：${takeoverResult.reason || 'unknown'}`, { muteable: false });
      }
      return true;
    } catch (error: any) {
      try { snapshot.value = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU(); } catch {}
      toast.warning(`Skill 元数据已更新，但 Agent 世界书接管同步失败：${error?.message || '未知错误'}`, { muteable: false });
      return false;
    }
  }

  async function skillifyAll(): Promise<boolean> {
    return runSkillifyWithOptions_ACU();
  }

  async function runSkillifyWithOptions_ACU(optionsPatch: { selectedEntries?: AgentSkillifySelectedEntry_ACU[] } = {}): Promise<boolean> {
    await refresh();
    const confirmed = await dialog.confirm(plotCopy.agentControl.skillify.confirm);
    if (!confirmed) return false;
    busy.value = 'skillify';
    let progressToastId: string | null = null;
    try {
      const progressOptions = { durationMs: 0, muteable: false, dismissible: false };
      const formatProgressText = (event: AgentSkillifyProgressEvent_ACU): string => {
        if (event.phase === 'collecting') return '正在扫描当前世界书范围内可 Skill 化的条目...';
        if (event.phase === 'processing') return `正在 Skill 化世界书条目：0/${event.total}`;
        if (event.phase === 'retry') {
          const target = [event.bookName, event.uid !== undefined ? `#${event.uid}` : ''].filter(Boolean).join(' ');
          return `Skill 化重试中：${target || '当前条目'}，第 ${event.attempt || 1}/${event.maxAttempts || 1} 次尝试失败（${event.message || 'AI 返回无效'}）。`;
        }
        if (event.phase === 'saving') {
          const target = [event.bookName, event.uid !== undefined ? `#${event.uid}` : ''].filter(Boolean).join(' ');
          return `正在保存 Skill 元数据：${target || '当前条目'}。`;
        }
        if (event.phase === 'entry_done') {
          return `正在 Skill 化世界书条目：${event.current}/${event.total}，更新 ${event.updated}，跳过 ${event.skipped}，失败 ${event.failed}。`;
        }
        if (event.phase === 'complete') {
          return `Skill 化处理完成：${event.current}/${event.total}，更新 ${event.updated}，跳过 ${event.skipped}，失败 ${event.failed}。`;
        }
        return '正在 Skill 化世界书条目...';
      };
      const notifyProgress = (event: AgentSkillifyProgressEvent_ACU): void => {
        const text = formatProgressText(event);
        if (progressToastId && toast.update(progressToastId, 'info', text, progressOptions)) return;
        progressToastId = toast.info(text, progressOptions);
      };
      const result = await skillifyCurrentPlotWorldbookSelection_ACU({
        presetName: agentSkillApiPreset.value,
        overwriteManual: false,
        maxAiRetries: contextSettings.value.agentAiMaxRetries,
        maxConcurrency: maxSkillifyConcurrency.value,
        ...optionsPatch,
        onProgress: notifyProgress,
      });
      if (result.totalCandidates === 0) {
        if (!progressToastId || !toast.update(progressToastId, 'warning', plotCopy.agentControl.skillify.noCandidates, { muteable: false })) {
          toast.warning(plotCopy.agentControl.skillify.noCandidates, { muteable: false });
        }
        return false;
      }
      const text = result.failed > 0
        ? plotCopy.agentControl.skillify.partial(result.updated, result.skipped, result.failed)
        : plotCopy.agentControl.skillify.success(result.updated, result.skipped);
      const toastUpdated = progressToastId && toast.update(progressToastId, result.failed > 0 ? 'warning' : 'success', text, { muteable: false });
      if (!toastUpdated) {
        if (result.failed > 0) toast.warning(text, { muteable: false });
        else toast.success(text, { muteable: false });
      }

      const updated = result.updated > 0;
      if (updated) {
        await syncAgentWorldbookTakeoverAfterSkillChange();
      }
      return updated;
    } catch (e: any) {
      const errorText = `${plotCopy.agentControl.skillify.error}${e?.message ? `：${e.message}` : ''}`;
      if (!progressToastId || !toast.update(progressToastId, 'error', errorText, { muteable: false })) {
        toast.error(errorText, { muteable: false });
      }
      return false;
    } finally {
      busy.value = null;
    }
  }

  async function skillifySelected(selectedEntries: AgentSkillifySelectedEntry_ACU[]): Promise<boolean> {
    if (!Array.isArray(selectedEntries) || selectedEntries.length === 0) {
      toast.warning(plotCopy.agentControl.skillify.noSelection, { muteable: false });
      return false;
    }
    return runSkillifyWithOptions_ACU({ selectedEntries });
  }

  async function clearSkillMeta(): Promise<boolean> {
    const confirmed = await dialog.confirm({ ...plotCopy.agentControl.clearSkillMeta.confirm, confirmVariant: 'danger' });
    if (!confirmed) return false;
    busy.value = 'clearSkillMeta';
    try {
      const availability = await resolveAgentWorldbookFilterAvailability_ACU();
      configSource.value = availability.configSource;
      configBookName.value = availability.configBookName;
      writableConfigBookName.value = availability.writableBookName;
      configReason.value = availability.reason;
      applyControlToRefs(availability.control);

      const result = await clearWorldbookSkillMetaBlocks_ACU(availability.bookNames);
      const nextAvailability = await resolveAgentWorldbookFilterAvailability_ACU();
      configSource.value = nextAvailability.configSource;
      configBookName.value = nextAvailability.configBookName;
      writableConfigBookName.value = nextAvailability.writableBookName;
      configReason.value = nextAvailability.reason;
      applyControlToRefs(nextAvailability.control);

      if (result.failed > 0) {
        toast.warning(plotCopy.agentControl.clearSkillMeta.partial(result.cleared, result.skipped, result.failed), { muteable: false });
        return result.cleared > 0;
      }
      if (result.cleared > 0) {
        toast.success(plotCopy.agentControl.clearSkillMeta.success(result.cleared), { muteable: false });
        return true;
      }
      toast.info(plotCopy.agentControl.clearSkillMeta.noop, { muteable: false });
      return false;
    } catch (e: any) {
      toast.error(`${plotCopy.agentControl.clearSkillMeta.error}${e?.message ? `：${e.message}` : ''}`, { muteable: false });
      return false;
    } finally {
      busy.value = null;
    }
  }

  void refresh();

  return {
    mode,
    agentPlotExecutionMode,
    agentApiPreset,
    agentSkillApiPreset,
    maxSkillifyConcurrency,
    snapshot,
    busy,
    configSource,
    configBookName,
    writableConfigBookName,
    configStatusText,
    contextSettings,
    contextSettingsLimits: AGENT_CONTEXT_SETTINGS_LIMITS_ACU,
    maxSkillifyConcurrencyLimits: MAX_SKILLIFY_CONCURRENCY_LIMIT_ACU,
    agentDecisionPromptSegments,
    agentSkillifyPromptSegments,
    isAgentMode,
    snapshotEntryCount,
    apiPresetOptions,
    refresh,
    setMode,
    setAgentPlotExecutionMode,
    setAgentApiPreset,
    setAgentSkillApiPreset,
    setMaxSkillifyConcurrency,
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
    skillifySelected,
    syncAgentWorldbookTakeoverAfterSkillChange,
    clearSkillMeta,
  };
}
