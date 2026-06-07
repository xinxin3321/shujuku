import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  currentJsonTableData_ACU,
  settings_ACU,
  abortAllActiveRequests_ACU,
  _set_isAutoUpdatingCard_ACU,
  _set_manualExtraHint_ACU,
  _set_wasStoppedByUser_ACU,
} from '../../service/runtime/state-manager';
import { saveSettings_ACU } from '../../service/settings/settings-service';
import { getCurrentWorldbookConfig_ACU } from '../../service/settings/settings-readers';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import {
  executeCardUpdateCore_ACU,
  orchestrateManualUpdate_ACU,
  processUpdatesBatch_ACU,
  type BatchUpdateProgressContext,
  type CardUpdateProgressEvent,
} from '../../service/table/update-orchestrator';
import { refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';

type MessageKind = 'info' | 'success' | 'warning' | 'error';

export interface ManualUpdateState {
  selectedManualTableKeys: Ref<string[]>;
  manualContextDepth: Ref<number>;
  manualBatchSize: Ref<number>;
  manualExtraHint: Ref<string>;
  manualUpdateBusy: Ref<boolean>;
  sheetKeys: ComputedRef<string[]>;
  sheetNames: ComputedRef<Record<string, string>>;
  vectorIndexWarning: ComputedRef<boolean>;
  refresh: () => void;
  setManualContextDepth: (value: number | string) => void;
  setManualBatchSize: (value: number | string) => void;
  setManualSelectedKeys: (keys: string[]) => void;
  selectAllManualTables: () => void;
  selectNoManualTables: () => void;
  runManualUpdate: () => Promise<void>;
}

function currentSheetKeys(): string[] {
  try {
    return getSortedSheetKeys_ACU(currentJsonTableData_ACU || {});
  } catch {
    return [];
  }
}

function resolveManualSelection(keys: string[]): string[] {
  if (!keys.length) return [];
  const saved = Array.isArray(settings_ACU.manualSelectedTables) ? settings_ACU.manualSelectedTables : [];
  if (settings_ACU.hasManualSelection !== true) return keys.slice();
  const valid = new Set(keys);
  return saved.filter((key: string) => valid.has(key));
}

function saveManualSelection(keys: string[]): void {
  const valid = new Set(currentSheetKeys());
  settings_ACU.manualSelectedTables = keys.filter(key => valid.has(key));
  settings_ACU.hasManualSelection = true;
  saveSettings_ACU();
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function resolveManualContextDepth(): number {
  const fallback = normalizeNonNegativeInteger(settings_ACU.autoUpdateThreshold, 3);
  return settings_ACU.manualUpdateContextDepth == null
    ? fallback
    : normalizeNonNegativeInteger(settings_ACU.manualUpdateContextDepth, fallback);
}

function resolveManualBatchSize(): number {
  const fallback = 3;
  return settings_ACU.manualUpdateBatchSize == null
    ? fallback
    : normalizePositiveInteger(settings_ACU.manualUpdateBatchSize, fallback);
}

function applyManualSettingsForOrchestrator(): () => void {
  const previousAutoUpdateThreshold = settings_ACU.autoUpdateThreshold;
  const previousUpdateBatchSize = settings_ACU.updateBatchSize;

  // orchestrateManualUpdate_ACU still reads the legacy automatic settings.
  // Keep the temporary bridge local to this UI action so the independent
  // manual fields do not persist back into automatic update configuration.
  settings_ACU.autoUpdateThreshold = manualDepthForOrchestrator_ACU(
    settings_ACU.manualUpdateContextDepth,
    previousAutoUpdateThreshold,
  );
  settings_ACU.updateBatchSize = normalizePositiveInteger(
    settings_ACU.manualUpdateBatchSize,
    normalizePositiveInteger(previousUpdateBatchSize, 3),
  );

  return () => {
    settings_ACU.autoUpdateThreshold = previousAutoUpdateThreshold;
    settings_ACU.updateBatchSize = previousUpdateBatchSize;
  };
}

function manualDepthForOrchestrator_ACU(
  manualDepth: unknown,
  fallbackDepth: unknown,
): number {
  const fallback = normalizeNonNegativeInteger(fallbackDepth, 3);
  return manualDepth == null
    ? fallback
    : normalizeNonNegativeInteger(manualDepth, fallback);
}

function progressLabel(event: CardUpdateProgressEvent): string {
  const prefix = event.currentBatch && event.totalBatches
    ? `批次 ${event.currentBatch}/${event.totalBatches} · `
    : '';
  if (event.message && event.phase !== 'retry' && event.phase !== 'error') {
    return `${prefix}${normalizeManualProgressMessage(event.message)}`;
  }
  switch (event.phase) {
    case 'preparing': return `${prefix}准备上下文`;
    case 'calling_ai': return `${prefix}调用 AI${event.attempt ? `（第 ${event.attempt}/${event.maxRetries || '?'} 次尝试）` : ''}`;
    case 'parsing': return `${prefix}解析填表结果`;
    case 'saving': return `${prefix}保存表格数据`;
    case 'retry': return `${prefix}重试中${event.message ? `:${event.message}` : ''}`;
    case 'complete': return `${prefix}完成`;
    case 'chunk_done': return `${prefix}分块完成`;
    case 'error': return `${prefix}出错${event.message ? `:${event.message}` : ''}`;
    default: return prefix || '处理中';
  }
}

function normalizeManualProgressMessage(message: string): string {
  return message
    .split(' AI 响应').join('手动填表结果')
    .split('AI 响应').join('手动填表结果');
}

export function useManualUpdate(): ManualUpdateState {
  const dialogStore = useDialogStore();
  const toast = useToastStore();
  const selectedManualTableKeys = ref<string[]>(resolveManualSelection(currentSheetKeys()));
  const manualContextDepth = ref(resolveManualContextDepth());
  const manualBatchSize = ref(resolveManualBatchSize());
  const manualExtraHint = ref('');
  const manualUpdateBusy = ref(false);
  const refreshTick = ref(0);
  let progressToastId: string | null = null;
  let abortRequested = false;

  function progressToastOptions() {
    return {
      durationMs: 0,
      muteable: false,
      dismissible: false,
      action: abortRequested
        ? undefined
        : {
            label: '终止',
            variant: 'danger' as const,
            dismissOnClick: false,
            onClick: requestAbort,
          },
    };
  }

  function notifyProgress(text: string): void {
    if (progressToastId && toast.update(progressToastId, 'info', text, progressToastOptions())) {
      return;
    }
    progressToastId = toast.info(text, progressToastOptions());
  }

  function finishToast(kind: MessageKind, text: string): void {
    if (progressToastId) {
      if (toast.update(progressToastId, kind, text, { muteable: false })) {
        progressToastId = null;
        return;
      }
      progressToastId = null;
    }
    toast[kind](text, { muteable: false });
  }

  function requestAbort(): void {
    if (abortRequested) return;
    abortRequested = true;
    _set_wasStoppedByUser_ACU(true);
    abortAllActiveRequests_ACU();
    _set_isAutoUpdatingCard_ACU(false);
    if (progressToastId) {
      toast.update(progressToastId, 'warning', '手动填表已终止，正在停止当前任务与后续批次...', {
        durationMs: 0,
        muteable: false,
        dismissible: false,
      });
    } else {
      toast.warning('手动填表已终止，正在停止当前任务与后续批次...', {
        durationMs: 0,
        muteable: false,
        dismissible: false,
      });
    }
  }

  const sheetKeys = computed(() => {
    void refreshTick.value;
    return currentSheetKeys();
  });

  const sheetNames = computed<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    for (const key of sheetKeys.value) {
      names[key] = String(currentJsonTableData_ACU?.[key]?.name || key);
    }
    return names;
  });

  const vectorIndexWarning = computed<boolean>(() => {
    void refreshTick.value;
    try {
      return getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true;
    } catch {
      return false;
    }
  });

  function refresh(): void {
    selectedManualTableKeys.value = resolveManualSelection(currentSheetKeys());
    manualContextDepth.value = resolveManualContextDepth();
    manualBatchSize.value = resolveManualBatchSize();
    refreshTick.value++;
  }

  function setManualContextDepth(value: number | string): void {
    const normalized = normalizeNonNegativeInteger(value, manualContextDepth.value);
    manualContextDepth.value = normalized;
    settings_ACU.manualUpdateContextDepth = normalized;
    saveSettings_ACU();
  }

  function setManualBatchSize(value: number | string): void {
    const normalized = normalizePositiveInteger(value, manualBatchSize.value);
    manualBatchSize.value = normalized;
    settings_ACU.manualUpdateBatchSize = normalized;
    saveSettings_ACU();
  }

  function setManualSelectedKeys(keys: string[]): void {
    selectedManualTableKeys.value = keys.slice();
    saveManualSelection(selectedManualTableKeys.value);
    refreshTick.value++;
  }

  function selectAllManualTables(): void {
    setManualSelectedKeys(sheetKeys.value);
  }

  function selectNoManualTables(): void {
    setManualSelectedKeys([]);
  }

  async function runManualUpdate(): Promise<void> {
    if (manualUpdateBusy.value) return;
    if (!selectedManualTableKeys.value.length) {
      toast.warning('未选择需要手动填表的表格。');
      return;
    }

    const confirmed = await dialogStore.confirm({
      title: '执行手动填表',
      message: '即将执行手动填表。\n\n为确保填表成功，系统将先清除本次涉及楼层中当前选中表格的数据，再进行新的数据填写。\n此操作可防止 SQL 严格填表逻辑因旧数据残留导致写入失败。\n\n如果不想清空旧数据，可以选择取消。',
      confirmLabel: '确认并继续',
      cancelLabel: '取消',
    });
    if (!confirmed) return;
    const clearBeforeUpdate = true;

    manualUpdateBusy.value = true;
    progressToastId = null;
    abortRequested = false;
    _set_wasStoppedByUser_ACU(false);
    notifyProgress('手动填表开始。');
    const extra = manualExtraHint.value.trim();
    if (extra) _set_manualExtraHint_ACU(`以下为用户的额外填表要求,请严格遵守:\n${extra}`);
    const handleProgress = (event: CardUpdateProgressEvent) => {
      notifyProgress(progressLabel(event));
    };

    const runProcessBatch = (indices: number[], mode: string, options: any) =>
      processUpdatesBatch_ACU(indices, mode, options, (
        messagesToUse: any[],
        saveTargetIndex: number,
        updateMode: string,
        isSilentMode: boolean,
        targetSheetKeys: string[] | null,
        requestOptions: Record<string, any> | null,
        progressContext: BatchUpdateProgressContext,
      ) => executeCardUpdateCore_ACU(
        messagesToUse,
        saveTargetIndex,
        false,
        updateMode,
        isSilentMode,
        targetSheetKeys,
        requestOptions,
        new AbortController(),
        progressContext,
        handleProgress,
      ));

    try {
      const restoreAutoUpdateSettings = applyManualSettingsForOrchestrator();
      let result: Awaited<ReturnType<typeof orchestrateManualUpdate_ACU>>;
      try {
        result = await orchestrateManualUpdate_ACU(
          selectedManualTableKeys.value,
          runProcessBatch,
          async () => { await refreshMergedDataAndNotify_ACU(); },
          { clearBeforeUpdate, onProgress: handleProgress },
        );
      } finally {
        restoreAutoUpdateSettings();
      }
      finishToast(
        result.success ? 'success' : (abortRequested || result.error?.includes('终止') ? 'warning' : 'error'),
        result.success
          ? (result.autoMergeTriggered
              ? `手动填表完成;自动合并总结${result.autoMergeSuccess ? '已完成' : '未完成'}。`
              : '手动填表完成。')
          : (abortRequested ? '手动填表任务已由用户终止。' : (result.error || '手动填表失败。')),
      );
    } catch (error: any) {
      finishToast('error', error?.message || '手动填表执行异常。');
    } finally {
      manualUpdateBusy.value = false;
      refresh();
    }
  }

  return {
    selectedManualTableKeys,
    manualContextDepth,
    manualBatchSize,
    manualExtraHint,
    manualUpdateBusy,
    sheetKeys,
    sheetNames,
    vectorIndexWarning,
    refresh,
    setManualContextDepth,
    setManualBatchSize,
    setManualSelectedKeys,
    selectAllManualTables,
    selectNoManualTables,
    runManualUpdate,
  };
}
