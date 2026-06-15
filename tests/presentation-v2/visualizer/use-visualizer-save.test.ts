/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const runtimeMock = vi.hoisted(() => {
  let currentData: Record<string, any> = {};
  return {
    get currentJsonTableData_ACU() {
      return currentData;
    },
    getCurrentData: () => currentData,
    resetCurrentData: () => {
      currentData = {};
    },
    _set_currentJsonTableData_ACU: vi.fn((next: Record<string, any>) => {
      currentData = next;
    }),
    getCurrentIsolationKey_ACU: vi.fn(() => 'iso-test'),
    settings_ACU: {},
  };
});

const serviceMock = vi.hoisted(() => ({
  getChatArray_ACU: vi.fn(() => [{ mes: 'ai message' }]),
  saveChatToHost_ACU: vi.fn(async () => undefined),
  applySpecialIndexSequenceToSummaryTables_ACU: vi.fn(),
  getTableLocksForSheet_ACU: vi.fn(() => ({ rows: new Set<number>(), cols: new Set<number>(), cells: new Set<string>() })),
  saveTableLocksForSheet_ACU: vi.fn(),
  setSpecialIndexLockEnabled_ACU: vi.fn(),
  getCurrentWorldbookConfig_ACU: vi.fn(() => ({ summaryVectorIndexModeEnabled: false })),
  saveIndependentTableToChatHistory_ACU: vi.fn(async () => undefined),
  runTableUpdateCommit_ACU: vi.fn(async (options: any, apply: any) => {
    const workingData = options.initialData ? JSON.parse(JSON.stringify(options.initialData)) : runtimeMock.getCurrentData();
    const applied = await apply({ transactionContext: { runCommit: async (task: any) => task() }, workingData });
    if (applied.tableData) runtimeMock._set_currentJsonTableData_ACU(applied.tableData);
    return { success: applied.success !== false, value: applied.value, tableData: applied.tableData, saved: true };
  }),
  getLatestAiMessageIndexFromChat_ACU: vi.fn(() => 0),
  getLatestTableAppendMessageIndexFromChat_ACU: vi.fn(() => 0),
  resolveTableHistoryStateFromChat_ACU: vi.fn(() => ({
    latestDataMessageIndex: -1,
    latestAiMessageIndex: 0,
    latestDataAiFloor: 0,
  })),
  isSqliteMode: vi.fn(() => false),
  reloadStorageProvider: vi.fn(async () => undefined),
  applyTemplateScopeForCurrentChat_ACU: vi.fn(() => ({ mode: 'chat_override' })),
  buildChatSheetGuideDataFromData_ACU: vi.fn((data: Record<string, any>) => data),
  getChatSheetGuideDataForIsolationKey_ACU: vi.fn(() => null),
  getSortedSheetKeys_ACU: vi.fn((data: Record<string, any>) =>
    Object.keys(data || {}).filter(key => key.startsWith('sheet_')),
  ),
  materializeDataFromSheetGuide_ACU: vi.fn((data: Record<string, any>) => data),
  sanitizeTemplateSnapshotForChat_ACU: vi.fn(() => ({ templateStr: '{"mate":{"type":"chatSheets","version":1}}' })),
  setChatSheetGuideDataForIsolationKey_ACU: vi.fn(),
  applyTemplatePresetToCurrent_ACU: vi.fn(async () => true),
  resolveActiveTemplatePresetName_ACU: vi.fn(() => '现有预设'),
  upsertTemplatePreset_ACU: vi.fn(() => true),
  getGlobalInjectionConfigFromData_ACU: vi.fn(() => ({})),
  purgeSheetKeysFromChatHistoryHard_ACU: vi.fn(async () => ({ changed: true })),
  refreshMergedDataAndNotify_ACU: vi.fn(async () => undefined),
  enqueueSummaryVectorIndexFlush_ACU: vi.fn(async () => undefined),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/service/runtime/state-manager', () => runtimeMock);
vi.mock('../../../src/service/chat/chat-service', () => ({
  getChatArray_ACU: serviceMock.getChatArray_ACU,
  saveChatToHost_ACU: serviceMock.saveChatToHost_ACU,
}));
vi.mock('../../../src/service/runtime/helpers-remaining', () => ({
  applySpecialIndexSequenceToSummaryTables_ACU: serviceMock.applySpecialIndexSequenceToSummaryTables_ACU,
  getTableLocksForSheet_ACU: serviceMock.getTableLocksForSheet_ACU,
  saveTableLocksForSheet_ACU: serviceMock.saveTableLocksForSheet_ACU,
  setSpecialIndexLockEnabled_ACU: serviceMock.setSpecialIndexLockEnabled_ACU,
}));
vi.mock('../../../src/service/settings/settings-readers', () => ({
  getCurrentWorldbookConfig_ACU: serviceMock.getCurrentWorldbookConfig_ACU,
}));
vi.mock('../../../src/service/table/table-service', () => ({
  saveIndependentTableToChatHistory_ACU: serviceMock.saveIndependentTableToChatHistory_ACU,
}));
vi.mock('../../../src/service/table/table-update-commit', () => ({
  runTableUpdateCommit_ACU: serviceMock.runTableUpdateCommit_ACU,
}));
vi.mock('../../../src/service/table/table-history', () => ({
  getLatestAiMessageIndexFromChat_ACU: serviceMock.getLatestAiMessageIndexFromChat_ACU,
  getLatestTableAppendMessageIndexFromChat_ACU: serviceMock.getLatestTableAppendMessageIndexFromChat_ACU,
  resolveTableHistoryStateFromChat_ACU: serviceMock.resolveTableHistoryStateFromChat_ACU,
}));
vi.mock('../../../src/service/table/storage-mode', () => ({
  isSqliteMode: serviceMock.isSqliteMode,
}));
vi.mock('../../../src/service/settings/settings-service', () => ({
  applyTemplateScopeForCurrentChat_ACU: serviceMock.applyTemplateScopeForCurrentChat_ACU,
}));
vi.mock('../../../src/service/table/table-storage-strategy', () => ({
  reloadStorageProvider: serviceMock.reloadStorageProvider,
}));
vi.mock('../../../src/service/template/chat-scope', () => ({
  buildChatSheetGuideDataFromData_ACU: serviceMock.buildChatSheetGuideDataFromData_ACU,
  getChatSheetGuideDataForIsolationKey_ACU: serviceMock.getChatSheetGuideDataForIsolationKey_ACU,
  getSortedSheetKeys_ACU: serviceMock.getSortedSheetKeys_ACU,
  materializeDataFromSheetGuide_ACU: serviceMock.materializeDataFromSheetGuide_ACU,
  sanitizeTemplateSnapshotForChat_ACU: serviceMock.sanitizeTemplateSnapshotForChat_ACU,
  setChatSheetGuideDataForIsolationKey_ACU: serviceMock.setChatSheetGuideDataForIsolationKey_ACU,
}));
vi.mock('../../../src/service/template/template-preset-service', () => ({
  applyTemplatePresetToCurrent_ACU: serviceMock.applyTemplatePresetToCurrent_ACU,
  resolveActiveTemplatePresetName_ACU: serviceMock.resolveActiveTemplatePresetName_ACU,
  upsertTemplatePreset_ACU: serviceMock.upsertTemplatePreset_ACU,
}));
vi.mock('../../../src/service/worldbook/injection-engine', () => ({
  getGlobalInjectionConfigFromData_ACU: serviceMock.getGlobalInjectionConfigFromData_ACU,
  purgeSheetKeysFromChatHistoryHard_ACU: serviceMock.purgeSheetKeysFromChatHistoryHard_ACU,
}));
vi.mock('../../../src/service/worldbook/pipeline', () => ({
  refreshMergedDataAndNotify_ACU: serviceMock.refreshMergedDataAndNotify_ACU,
}));
vi.mock('../../../src/service/vector/summary-vector-index-flush-queue', () => ({
  enqueueSummaryVectorIndexFlush_ACU: serviceMock.enqueueSummaryVectorIndexFlush_ACU,
}));
vi.mock('../../../src/presentation-v2/stores/toast-store', () => ({
  useToastStore: () => toastMock,
}));

function sheet(name = '角色状态') {
  return {
    uid: 'sheet_test_vz2',
    name,
    orderNo: 0,
    content: [[null, '姓名', '状态'], ['1', 'A', '平静']],
  };
}

describe('useVisualizerSave', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    runtimeMock.resetCurrentData();
    vi.clearAllMocks();
  });

  it('保存数据到当前消息会提交数据增量并清理 dirty', async () => {
    const { useVisualizerStore } = await import('../../../src/presentation-v2/stores/visualizer-store');
    const { useVisualizerSave } = await import('../../../src/presentation-v2/composables/visualizer/useVisualizerSave');
    const store = useVisualizerStore();
    const initialData = {
      mate: { type: 'chatSheets', version: 1 },
      sheet_test_vz2: sheet(),
    };
    store.loadSnapshot(initialData, ['sheet_test_vz2']);
    runtimeMock._set_currentJsonTableData_ACU(JSON.parse(JSON.stringify(initialData)));
    runtimeMock._set_currentJsonTableData_ACU.mockClear();
    store.updateCell(0, 1, '紧张');

    const saved = await useVisualizerSave().saveToChat();

    expect(saved).toBe(true);
    expect(runtimeMock._set_currentJsonTableData_ACU).toHaveBeenCalledTimes(1);
    expect(runtimeMock.getCurrentData().sheet_test_vz2.content[1][2]).toBe('紧张');
    expect(serviceMock.runTableUpdateCommit_ACU).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual_crud',
      reason: 'visualizer_save_native_batch',
      targetSheetKeys: ['sheet_test_vz2'],
    }), expect.any(Function));
    expect(store.dirty).toBe(false);
    expect(store.lastSavedTarget).toBe('data');
  });

  it('保存到全局模板被取消时不写入聊天、不清理 dirty', async () => {
    const { useVisualizerStore } = await import('../../../src/presentation-v2/stores/visualizer-store');
    const { useVisualizerSave } = await import('../../../src/presentation-v2/composables/visualizer/useVisualizerSave');
    const store = useVisualizerStore();
    store.loadSnapshot({
      mate: { type: 'chatSheets', version: 1 },
      sheet_test_vz2: sheet('取消测试表'),
    }, ['sheet_test_vz2']);
    store.setDirty(true);

    const saved = await useVisualizerSave({
      confirmOverwriteGlobalPreset: vi.fn(async () => false),
    }).saveToGlobal();

    expect(saved).toBe(false);
    expect(runtimeMock._set_currentJsonTableData_ACU).not.toHaveBeenCalled();
    expect(serviceMock.upsertTemplatePreset_ACU).not.toHaveBeenCalled();
    expect(serviceMock.saveIndependentTableToChatHistory_ACU).not.toHaveBeenCalled();
    expect(store.dirty).toBe(true);
    expect(store.lastSavedTarget).toBeNull();
  });

  it('保存模板到全局确认后会写入预设并清理 dirty', async () => {
    const { useVisualizerStore } = await import('../../../src/presentation-v2/stores/visualizer-store');
    const { useVisualizerSave } = await import('../../../src/presentation-v2/composables/visualizer/useVisualizerSave');
    const store = useVisualizerStore();
    store.loadSnapshot({
      mate: { type: 'chatSheets', version: 1 },
      sheet_test_vz2: sheet('确认测试表'),
    }, ['sheet_test_vz2']);
    store.setDirty(true);

    const saved = await useVisualizerSave({
      confirmOverwriteGlobalPreset: vi.fn(async () => true),
    }).saveToGlobal();

    expect(saved).toBe(true);
    expect(serviceMock.upsertTemplatePreset_ACU).toHaveBeenCalledWith('现有预设', expect.any(String));
    expect(serviceMock.applyTemplatePresetToCurrent_ACU).toHaveBeenCalledWith('现有预设', expect.objectContaining({
      source: 'visualizer_v2_save_to_global',
      updateGlobal: true,
      save: true,
      persistChatScope: false,
    }));
    expect(serviceMock.runTableUpdateCommit_ACU).not.toHaveBeenCalled();
    expect(store.dirty).toBe(false);
    expect(store.lastSavedTarget).toBe('template-global');
  });

  it('保存独立导出位置时用本次草稿同步聊天指导表', async () => {
    const { useVisualizerStore } = await import('../../../src/presentation-v2/stores/visualizer-store');
    const { useVisualizerSave } = await import('../../../src/presentation-v2/composables/visualizer/useVisualizerSave');
    const store = useVisualizerStore();
    store.loadSnapshot({
      mate: { type: 'chatSheets', version: 1 },
      sheet_test_vz2: {
        ...sheet('独立导出表'),
        exportConfig: {
          enabled: true,
          entryPlacement: { position: 'at_depth_as_system', depth: 2, order: 10000 },
        },
      },
    }, ['sheet_test_vz2']);
    store.currentSheet.exportConfig.entryPlacement = {
      position: 'at_depth_as_system',
      depth: 7,
      order: 12345,
    };
    store.setDirty(true);

    const saved = await useVisualizerSave().saveTemplateToCurrentChat();

    expect(saved).toBe(true);
    expect(runtimeMock.getCurrentData().sheet_test_vz2.exportConfig.entryPlacement).toEqual({
      position: 'at_depth_as_system',
      depth: 7,
      order: 12345,
    });
    expect(serviceMock.buildChatSheetGuideDataFromData_ACU).toHaveBeenCalledWith(
      expect.objectContaining({
        sheet_test_vz2: expect.objectContaining({
          exportConfig: expect.objectContaining({
            entryPlacement: { position: 'at_depth_as_system', depth: 7, order: 12345 },
          }),
        }),
      }),
      expect.objectContaining({
        orderedKeys: ['sheet_test_vz2'],
      }),
    );
  });

  it('保存模板到当前聊天会写入聊天模板快照并刷新运行时结构', async () => {
    const { useVisualizerStore } = await import('../../../src/presentation-v2/stores/visualizer-store');
    const { useVisualizerSave } = await import('../../../src/presentation-v2/composables/visualizer/useVisualizerSave');
    const store = useVisualizerStore();
    store.loadSnapshot({
      mate: { type: 'chatSheets', version: 1 },
      sheet_test_vz2: sheet('旧表名'),
    }, ['sheet_test_vz2']);
    store.currentSheet.name = '新表名';
    store.setDirty(true);

    const saved = await useVisualizerSave().saveTemplateToCurrentChat();

    expect(saved).toBe(true);
    expect(serviceMock.setChatSheetGuideDataForIsolationKey_ACU).toHaveBeenCalledWith(
      'iso-test',
      expect.any(Object),
      expect.objectContaining({ syncTemplateScope: true }),
    );
    expect(serviceMock.applyTemplateScopeForCurrentChat_ACU).toHaveBeenCalled();
    expect(runtimeMock._set_currentJsonTableData_ACU).toHaveBeenCalledWith(expect.objectContaining({
      sheet_test_vz2: expect.objectContaining({ name: '新表名' }),
    }));
    expect(store.lastSavedTarget).toBe('template-chat');
  });

  it('保存时提交 AI 助手暂存的锁变化并在成功后清空队列', async () => {
    const { useVisualizerStore } = await import('../../../src/presentation-v2/stores/visualizer-store');
    const { useVisualizerSave } = await import('../../../src/presentation-v2/composables/visualizer/useVisualizerSave');
    const store = useVisualizerStore();
    store.loadSnapshot({
      mate: { type: 'chatSheets', version: 1 },
      sheet_test_vz2: sheet(),
    }, ['sheet_test_vz2']);
    store.queueLockChanges([
      {
        sheetKey: 'sheet_test_vz2',
        rows: [{ rowIndex: 0, locked: true }],
        columns: [{ colIndex: 1, locked: true }],
        cells: [{ rowIndex: 0, colIndex: 1, locked: false }],
        specialIndexLocked: false,
      },
    ]);

    const saved = await useVisualizerSave().saveTemplateToCurrentChat();

    expect(saved).toBe(true);
    expect(serviceMock.saveTableLocksForSheet_ACU).toHaveBeenCalledTimes(1);
    expect(serviceMock.saveTableLocksForSheet_ACU).toHaveBeenCalledWith(
      'sheet_test_vz2',
      expect.objectContaining({
        rows: expect.any(Set),
        cols: expect.any(Set),
        cells: expect.any(Set),
      }),
    );
    expect(serviceMock.setSpecialIndexLockEnabled_ACU).toHaveBeenCalledWith('sheet_test_vz2', false);
    expect(store.pendingLockChanges).toEqual([]);
  });
});
