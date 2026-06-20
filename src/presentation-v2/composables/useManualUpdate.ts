import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  currentJsonTableData_ACU,
  settings_ACU,
  abortAllActiveRequests_ACU,
  _set_isAutoUpdatingCard_ACU,
  _set_manualExtraHint_ACU,
  _set_wasStoppedByUser_ACU,
  getCurrentIsolationKey_ACU,
} from '../../service/runtime/state-manager';
import { getChatArray_ACU } from '../../service/chat/chat-service';
import { saveSettings_ACU } from '../../service/settings/settings-service';
import { getCurrentWorldbookConfig_ACU } from '../../service/settings/settings-readers';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import { collectV2CheckpointFloorsFromChat_ACU } from '../../service/table/table-history';
import {
  executeCardUpdateCore_ACU,
  orchestrateManualUpdate_ACU,
  processUpdatesBatch_ACU,
  type BatchUpdateProgressContext,
  type CardUpdateProgressEvent,
} from '../../service/table/update-orchestrator';
import { refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { topLevelWindow_ACU } from '../../shared/env';
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
  checkpointFloorsLabel: ComputedRef<string>;
  manualRefillRangeLabel: ComputedRef<string>;
  checkpointRiskMessage: ComputedRef<string>;
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

interface ManualRefillRangeSummary {
  indices: number[];
  startAiFloor: number;
  endAiFloor: number;
}

function resolveManualRefillRangeSummary_ACU(manualDepth: number): ManualRefillRangeSummary | null {
  const chat = getChatArray_ACU();
  if (!Array.isArray(chat) || chat.length === 0) return null;
  const aiItems = chat
    .map((msg: any, index: number) => (msg && !msg.is_user ? { index, aiFloor: 0 } : null))
    .filter((item): item is { index: number; aiFloor: number } => item !== null);
  aiItems.forEach((item, idx) => { item.aiFloor = idx + 1; });
  const skip = normalizeNonNegativeInteger(settings_ACU.skipUpdateFloors, 0);
  const effectiveAiItems = skip > 0 ? aiItems.slice(0, -skip) : aiItems.slice();
  const contextItems = manualDepth > 0 ? effectiveAiItems.slice(-manualDepth) : effectiveAiItems;
  if (!contextItems.length) return null;
  return {
    indices: contextItems.map(item => item.index),
    startAiFloor: contextItems[0].aiFloor,
    endAiFloor: contextItems[contextItems.length - 1].aiFloor,
  };
}

function formatAiFloorRange_ACU(startAiFloor: number, endAiFloor: number): string {
  return startAiFloor === endAiFloor
    ? `AI 第 ${startAiFloor} 层`
    : `AI 第 ${startAiFloor}~${endAiFloor} 层`;
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

  const checkpointFloors = computed(() => {
    void refreshTick.value;
    try {
      return collectV2CheckpointFloorsFromChat_ACU(getChatArray_ACU(), getCurrentIsolationKey_ACU());
    } catch {
      return [];
    }
  });

  const checkpointFloorsLabel = computed<string>(() => {
    const floors = checkpointFloors.value.map(item => item.aiFloor);
    return floors.length > 0
      ? floors.map(floor => `AI 第 ${floor} 层`).join('、')
      : '当前隔离标签暂无 full checkpoint';
  });

  const manualRefillRange = computed<ManualRefillRangeSummary | null>(() => {
    void refreshTick.value;
    try {
      return resolveManualRefillRangeSummary_ACU(manualContextDepth.value);
    } catch {
      return null;
    }
  });

  const manualRefillRangeLabel = computed<string>(() => {
    const range = manualRefillRange.value;
    return range
      ? formatAiFloorRange_ACU(range.startAiFloor, range.endAiFloor)
      : '暂无可重填 AI 楼层';
  });

  const checkpointRiskMessage = computed<string>(() => {
    const checkpoints = checkpointFloors.value;
    const range = manualRefillRange.value;
    if (checkpoints.length === 0 || !range) return '';
    const checkpointIndexSet = new Set(range.indices);
    const coveredCheckpoints = checkpoints.filter(item => checkpointIndexSet.has(item.messageIndex));
    if (coveredCheckpoints.length !== checkpoints.length) return '';
    const coveredFloors = coveredCheckpoints.map(item => `AI 第 ${item.aiFloor} 层`).join('、');
    return `危险：当前聊天的所有 full checkpoint 都在即将执行的重填范围内（${coveredFloors}）。确认执行后，重填起点前将没有可回放 checkpoint，选中表的本次内存重建基底可能只能从表头空基底开始；这不会删除聊天记录中的旧表格数据。是否是预期行为？`;
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
      message: `即将执行手动填表。\n\n当前 full checkpoint：${checkpointFloorsLabel.value}\n本次重填范围：${manualRefillRangeLabel.value}\n\n系统会在内存中按当前上下文和批处理设置重填当前选中的表，全部成功后才写入新的完整 checkpoint。\n如果重填起点之前找不到可回放的 checkpoint，选中表的本次内存重建基底会从表头空基底开始；未选中的表会保持当前最新数据。\n\n失败、终止或从中断处继续时，都不会清空聊天记录中的旧表格数据。`,
      dangerMessage: checkpointRiskMessage.value || undefined,
      confirmLabel: '确认并继续',
      cancelLabel: '取消',
      confirmVariant: checkpointRiskMessage.value ? 'danger' : undefined,
    });
    if (!confirmed) return;
    // 兼容沿用 clearBeforeUpdate 参数名；service 层实际执行事务式重填，不会预清空聊天记录。
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
      if (event.phase === 'complete') {
        try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI?._notifyTableUpdate?.(); } catch (_) {}
        refreshTick.value++;
      }
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
    checkpointFloorsLabel,
    manualRefillRangeLabel,
    checkpointRiskMessage,
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
