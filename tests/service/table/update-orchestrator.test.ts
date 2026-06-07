/**
 * tests/service/table/update-orchestrator.test.ts
 * 表格更新编排器单元测试
 *
 * 策略：
 * - resolveUpdateMode_ACU / loadBatchBaseData_ACU / buildBatchMergeBase_ACU 是纯/浅依赖函数，直接测试
 * - processUpdatesBatch_ACU / executeCardUpdateCore_ACU / orchestrateManualUpdate_ACU 通过 mock 回调测试编排逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureStableRowIdsForSheetContent_ACU } from '../../../src/service/template/chat-scope';

// ═══════════════════════════════════════════════════════════════
// Mock 设置
// ═══════════════════════════════════════════════════════════════

vi.mock('../../../src/shared/utils', () => ({
  logDebug_ACU: vi.fn(),
  logWarn_ACU: vi.fn(),
  logError_ACU: vi.fn(),
  isSummaryOrOutlineTable_ACU: vi.fn(() => false),
  parseTableTemplateJson_ACU: vi.fn(() => ({
    mate: { type: 'acu' },
    sheet_0: { name: '测试表', updateConfig: { groupId: 0 } },
  })),
}));

vi.mock('../../../src/shared/env', () => ({
  topLevelWindow_ACU: {},
}));

let mockSettings: any = {
  autoUpdateEnabled: true,
  apiMode: 'custom',
  apiConfig: { useMainApi: true, url: '', model: '' },
  tavernProfile: '',
  autoUpdateThreshold: 3,
  updateBatchSize: 2,
  skipUpdateFloors: 0,
  tableMaxRetries: 3,
  autoUpdateTokenThreshold: 0,
  toastMuteEnabled: false,
  dataIsolationEnabled: false,
  dataIsolationCode: '',
  tableApiPresetOverridesByName: {},
};

let mockCurrentJsonTableData: any = null;
let mockIsAutoUpdating = false;
let mockWasStopped = false;
let mockCoreApisReady = true;

vi.mock('../../../src/service/runtime/state-manager', () => ({
  get settings_ACU() { return mockSettings; },
  get currentJsonTableData_ACU() { return mockCurrentJsonTableData; },
  get currentChatFileIdentifier_ACU() { return 'test-chat'; },
  get isAutoUpdatingCard_ACU() { return mockIsAutoUpdating; },
  get wasStoppedByUser_ACU() { return mockWasStopped; },
  get coreApisAreReady_ACU() { return mockCoreApisReady; },
  _set_isAutoUpdatingCard_ACU: vi.fn((v: any) => { mockIsAutoUpdating = v; }),
  _set_wasStoppedByUser_ACU: vi.fn(),
  _set_manualExtraHint_ACU: vi.fn(),
  _set_currentJsonTableData_ACU: vi.fn((v: any) => { mockCurrentJsonTableData = v; }),
  abortAllActiveRequests_ACU: vi.fn(),
  getCurrentIsolationKey_ACU: vi.fn(() => ''),
}));

const mockCallCustomOpenAI = vi.fn();
const mockParseAndApplyTableEdits = vi.fn();
const mockParseAndApplyTableEditsToData = vi.fn();
const mockApplySqlEditsToTableDataSnapshot = vi.fn();
const mockPrepareAIInput = vi.fn();

vi.mock('../../../src/service/ai/prompt-builder', () => ({
  callCustomOpenAI_ACU: (...args: any[]) => mockCallCustomOpenAI(...args),
  parseAndApplyTableEdits_ACU: (...args: any[]) => mockParseAndApplyTableEdits(...args),
  parseAndApplyTableEditsToData_ACU: (...args: any[]) => {
    const impl = mockParseAndApplyTableEditsToData.getMockImplementation();
    return impl ? mockParseAndApplyTableEditsToData(...args) : mockParseAndApplyTableEdits(...args);
  },
  prepareAIInput_ACU: (...args: any[]) => mockPrepareAIInput(...args),
}));

const { mockChatArrayForSeedStage, mockGetChatArray_ACU } = vi.hoisted(() => {
  const chatArray: any[] = [];
  return {
    mockChatArrayForSeedStage: chatArray,
    mockGetChatArray_ACU: vi.fn(() => chatArray),
  };
});
vi.mock('../../../src/service/chat/chat-service', () => ({
  getChatArray_ACU: mockGetChatArray_ACU,
  clearTableDataAtFloors_ACU: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../src/service/summary/merge-logic', () => ({
  checkAutoMergeTrigger_ACU: vi.fn(() => ({ shouldTrigger: false })),
  prepareAutoMergeBatches_ACU: vi.fn(),
  executeAutoMergeBatch_ACU: vi.fn(),
  finalizeAutoMerge_ACU: vi.fn(),
}));

vi.mock('../../../src/service/template/chat-scope', () => ({
  getChatSheetGuideDataForIsolationKey_ACU: vi.fn(() => null),
  getEffectiveSeedRowsForSheet_ACU: vi.fn(() => []),
  shouldUseInitialSeedRows_ACU: vi.fn(() => {
    const chat = mockGetChatArray_ACU();
    return Array.isArray(chat) && chat.filter((m: any) => m && m.is_user).length === 1 && !chat.some((m: any) => m && !m.is_user && m.mes !== '开场白');
  }),
  ensureStableRowIdsForSheetContent_ACU: vi.fn((content: any) => {
    if (!Array.isArray(content) || content.length === 0) return [];
    const header = Array.isArray(content[0]) ? [...content[0]] : ['row_id'];
    const rows = content.slice(1).map((row: any) => Array.isArray(row) ? [...row] : []);
    const seen = new Set<string>();
    let nextId = 1;
    return [header, ...rows.map((row: any) => {
      let value = row[0] == null || String(row[0]).trim() === '' || seen.has(String(row[0]).trim()) ? '' : String(row[0]).trim();
      if (!value) {
        while (seen.has(String(nextId))) nextId += 1;
        value = String(nextId++);
      }
      seen.add(value);
      row[0] = value;
      return row;
    })];
  }),
  getSortedSheetKeys_ACU: vi.fn((data: any) => data ? Object.keys(data).filter((k: string) => k.startsWith('sheet_')) : []),
  buildGuidedBaseDataFromSheetGuide_ACU: vi.fn(),
}));

const mockUpdateReadableLorebookEntry = vi.fn();
vi.mock('../../../src/service/worldbook/pipeline', () => ({
  loadAllChatMessages_ACU: vi.fn(),
  updateReadableLorebookEntry_ACU: (...args: any[]) => mockUpdateReadableLorebookEntry(...args),
}));

const mockCheckIfFirstTimeInit = vi.fn().mockResolvedValue(false);
const mockSaveIndependentTable = vi.fn().mockResolvedValue({ saved: true });
const mockPersistTablesToChatMessage = vi.fn().mockResolvedValue({ saved: true, messageIndex: 0 });

vi.mock('../../../src/service/table/table-service', () => ({
  checkIfFirstTimeInit_ACU: (...args: any[]) => mockCheckIfFirstTimeInit(...args),
  persistTablesToChatMessage_ACU: (...args: any[]) => mockPersistTablesToChatMessage(...args),
  saveIndependentTableToChatHistory_ACU: (...args: any[]) => mockSaveIndependentTable(...args),
}));

vi.mock('../../../src/service/table/storage-mode', () => {
  const isSqliteMode = vi.fn(() => false);
  return {
    isSqliteMode,
    getCurrentStorageMode: vi.fn(() => isSqliteMode() ? 'sqlite' : 'native'),
  };
});

vi.mock('../../../src/service/table/sql-table-service', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applySqlEditsToTableDataSnapshot_ACU: (...args: any[]) => {
      const impl = mockApplySqlEditsToTableDataSnapshot.getMockImplementation();
      return impl ? mockApplySqlEditsToTableDataSnapshot(...args) : actual.applySqlEditsToTableDataSnapshot_ACU(...args);
    },
  };
});

const mockRunTableUpdateApplyWithScopeLock = vi.fn(async (_scopeKey: string, fn: any) => await fn());
const mockBuildTableUpdateApplyScopeKey = vi.fn(() => 'test-scope');
vi.mock('../../../src/service/table/table-update-queue', () => ({
  runTableUpdateApplyWithScopeLock_ACU: (...args: any[]) => mockRunTableUpdateApplyWithScopeLock(...args),
  buildTableUpdateApplyScopeKey_ACU: (...args: any[]) => mockBuildTableUpdateApplyScopeKey(...args),
}));

const mockRunTableWriteTransaction = vi.fn(async (options: any, task: any) => task({
  transactionId: 'tx-test',
  chatKey: 'test-chat',
  isolationKey: '',
  source: options.source,
  baseRevision: null,
  writeSet: options.writeSet,
  runCommit: async (commitTask: any) => commitTask(),
}, options.initialData ? JSON.parse(JSON.stringify(options.initialData)) : mockCurrentJsonTableData));
vi.mock('../../../src/service/table/table-write-transaction', () => ({
  captureTableRuntimeRevisionForWriteSet_ACU: vi.fn(() => 'runtime-test-revision'),
  runTableWriteTransaction_ACU: (...args: any[]) => mockRunTableWriteTransaction(...args),
}));

const mockEnqueueSummaryVectorIndexFlush = vi.fn().mockResolvedValue({ queued: true, scopeKey: 'test-scope' });
vi.mock('../../../src/service/vector/summary-vector-index-flush-queue', () => ({ enqueueSummaryVectorIndexFlush_ACU: (...args: any[]) => mockEnqueueSummaryVectorIndexFlush(...args) }));

vi.mock('../../../src/service/settings/settings-readers', () => ({
  getCurrentWorldbookConfig_ACU: vi.fn(() => ({ summaryVectorIndexModeEnabled: true })),
}));

vi.mock('../../../src/service/settings/settings-service', () => ({
  applyTemplateScopeForCurrentChat_ACU: vi.fn(),
}));

import {
  resolveUpdateMode_ACU,
  loadBatchBaseData_ACU,
  buildBatchMergeBase_ACU,
  processUpdatesBatch_ACU,
  executeCardUpdateCore_ACU,
  orchestrateManualUpdate_ACU,
  collectGroupFillResponse_ACU,
  applyUnifiedGroupFillResponses_ACU,
  processGroupedRuntimeChunk_ACU,
  type CardUpdateResult,
  type CardUpdateProgressEvent,
} from '../../../src/service/table/update-orchestrator';

beforeEach(() => {
  mockChatArrayForSeedStage.length = 0;
  mockGetChatArray_ACU.mockImplementation(() => mockChatArrayForSeedStage);
});

// ═══════════════════════════════════════════════════════════════
// resolveUpdateMode_ACU
// ═══════════════════════════════════════════════════════════════
describe('resolveUpdateMode_ACU', () => {
  it('auto_unified 直接返回', () => {
    expect(resolveUpdateMode_ACU('auto_unified')).toBe('auto_unified');
  });

  it('manual_unified 直接返回', () => {
    expect(resolveUpdateMode_ACU('manual_unified')).toBe('manual_unified');
  });

  it('full 直接返回', () => {
    expect(resolveUpdateMode_ACU('full')).toBe('full');
  });

  it('auto_summary_silent 直接返回', () => {
    expect(resolveUpdateMode_ACU('auto_summary_silent')).toBe('auto_summary_silent');
  });

  it('manual_summary 返回 manual_summary', () => {
    expect(resolveUpdateMode_ACU('manual_summary')).toBe('manual_summary');
  });

  it('manual_independent 返回 manual_independent', () => {
    expect(resolveUpdateMode_ACU('manual_independent')).toBe('manual_independent');
  });

  it('manual 前缀默认返回 manual_standard', () => {
    expect(resolveUpdateMode_ACU('manual')).toBe('manual_standard');
    expect(resolveUpdateMode_ACU('manual_other')).toBe('manual_standard');
  });

  it('auto 模式带 summary 返回 auto_summary', () => {
    expect(resolveUpdateMode_ACU('auto_summary')).toBe('auto_summary');
    expect(resolveUpdateMode_ACU('summary')).toBe('auto_summary');
  });

  it('auto 模式默认返回 auto_standard', () => {
    expect(resolveUpdateMode_ACU('auto')).toBe('auto_standard');
    expect(resolveUpdateMode_ACU('auto_standard')).toBe('auto_standard');
  });

  it('空字符串返回 auto_standard', () => {
    expect(resolveUpdateMode_ACU('')).toBe('auto_standard');
  });

  it('未知模式返回 auto_standard', () => {
    expect(resolveUpdateMode_ACU('unknown')).toBe('auto_standard');
  });
});

// ═══════════════════════════════════════════════════════════════
// loadBatchBaseData_ACU
// ═══════════════════════════════════════════════════════════════
describe('loadBatchBaseData_ACU', () => {
  it('从新版存储格式加载数据', () => {
    const chatHistory = [
      { is_user: true },
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            independentData: {
              sheet_0: { name: '测试表', content: [['row_id'], ['1']] },
            },
            modifiedKeys: ['sheet_0'],
            updateGroupKeys: [],
          },
        },
      },
      { is_user: true },
      { is_user: false }, // 当前批次的第一条消息
    ];

    const mergedBatchData: Record<string, any> = {
      sheet_0: { name: '空表', content: [['row_id']] },
    };

    const result = loadBatchBaseData_ACU(chatHistory, 3, '', ['sheet_0'], mergedBatchData);
    expect(result.foundCount).toBe(1);
    expect(result.totalCount).toBe(1);
    expect(mergedBatchData.sheet_0.content).toEqual([['row_id'], ['1']]);
  });

  it('从旧版存储格式加载数据', () => {
    const chatHistory = [
      { is_user: true },
      {
        is_user: false,
        TavernDB_ACU_IndependentData: {
          sheet_0: { name: '测试表', content: [['row_id'], ['1']] },
        },
      },
      { is_user: true },
      { is_user: false },
    ];

    const mergedBatchData: Record<string, any> = {
      sheet_0: { name: '空表', content: [['row_id']] },
    };

    const result = loadBatchBaseData_ACU(chatHistory, 3, '', ['sheet_0'], mergedBatchData);
    expect(result.foundCount).toBe(1);
  });

  it('空聊天记录返回全部未找到', () => {
    const mergedBatchData: Record<string, any> = {
      sheet_0: { name: '空表' },
    };
    const result = loadBatchBaseData_ACU([], 0, '', ['sheet_0'], mergedBatchData);
    expect(result.foundCount).toBe(0);
    expect(result.totalCount).toBe(1);
  });

  it('跳过 user 消息', () => {
    const chatHistory = [
      { is_user: true, TavernDB_ACU_IndependentData: { sheet_0: { name: '不应该被读取' } } },
      { is_user: false },
    ];

    const mergedBatchData: Record<string, any> = {
      sheet_0: { name: '空表' },
    };

    const result = loadBatchBaseData_ACU(chatHistory, 1, '', ['sheet_0'], mergedBatchData);
    expect(result.foundCount).toBe(0);
  });

  it('找到所有表后提前退出（从后往前搜索，取最近的）', () => {
    const chatHistory = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            independentData: { sheet_0: { name: '更旧的表0' } },
            modifiedKeys: [],
            updateGroupKeys: [],
          },
        },
      },
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            independentData: { sheet_0: { name: '较新的表0' } },
            modifiedKeys: [],
            updateGroupKeys: [],
          },
        },
      },
      { is_user: false }, // 当前批次的第一条消息
    ];

    const mergedBatchData: Record<string, any> = {
      sheet_0: { name: '空表' },
    };

    loadBatchBaseData_ACU(chatHistory, 2, '', ['sheet_0'], mergedBatchData);
    expect(mergedBatchData.sheet_0.name).toBe('较新的表0');
  });

  it('隔离标签匹配', () => {
    const chatHistory = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          'tag_A': {
            independentData: { sheet_0: { name: '标签A的数据' } },
            modifiedKeys: [],
            updateGroupKeys: [],
          },
          'tag_B': {
            independentData: { sheet_0: { name: '标签B的数据' } },
            modifiedKeys: [],
            updateGroupKeys: [],
          },
        },
      },
      { is_user: false },
    ];

    const mergedBatchData: Record<string, any> = {
      sheet_0: { name: '空表' },
    };

    loadBatchBaseData_ACU(chatHistory, 1, 'tag_A', ['sheet_0'], mergedBatchData);
    expect(mergedBatchData.sheet_0.name).toBe('标签A的数据');
  });

  it('叠加历史 delta 后会稳定化 mergedBatchData 的 row_id', () => {
    const chatHistory = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            independentData: {
              sheet_0: { name: 'checkpoint表', content: [['row_id', '名称'], ['base', '旧苹果']] },
            },
            modifiedKeys: ['sheet_0'],
            updateGroupKeys: [],
            _acu_storage_mode: 'checkpoint',
          },
        },
      },
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            independentData: {},
            incrementalData: {
              sheet_0: { sheetUid: 'sheet_0', rowDeltas: [{ row_id: '', op: 'upsert', cells: ['', '坏行'] }] },
            },
            modifiedKeys: ['sheet_0'],
            updateGroupKeys: [],
            _acu_storage_mode: 'delta',
          },
        },
      },
      { is_user: false },
    ];
    const mergedBatchData: Record<string, any> = { sheet_0: { name: '空表', content: [['row_id', '名称']] } };
    loadBatchBaseData_ACU(chatHistory, 2, '', ['sheet_0'], mergedBatchData);
    expect(vi.mocked(ensureStableRowIdsForSheetContent_ACU)).toHaveBeenCalled();
    expect(mergedBatchData.sheet_0.content).toEqual([['row_id', '名称'], ['base', '旧苹果'], ['1', '坏行']]);
  });
});

// ═══════════════════════════════════════════════════════════════
// buildBatchMergeBase_ACU
// ═══════════════════════════════════════════════════════════════
describe('buildBatchMergeBase_ACU', () => {
  it('无 guide 时使用模板', () => {
    const result = buildBatchMergeBase_ACU(1);
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();
  });

  it('有 guide 时使用 guide', async () => {
    const { getChatSheetGuideDataForIsolationKey_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue({
      sheet_0: { name: '引导数据' },
    });
    const { buildGuidedBaseDataFromSheetGuide_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(buildGuidedBaseDataFromSheetGuide_ACU).mockReturnValue({
      sheet_0: { name: '从引导构建的数据' },
    });

    const result = buildBatchMergeBase_ACU(1);
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// processUpdatesBatch_ACU（适配新返回值类型）
// ═══════════════════════════════════════════════════════════════
describe('processUpdatesBatch_ACU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAutoUpdating = false;
    mockSettings = {
      ...mockSettings,
      autoUpdateThreshold: 3,
      updateBatchSize: 2,
      autoUpdateTokenThreshold: 0,
      toastMuteEnabled: false,
    };
  });

  it('空索引列表返回 success: true', async () => {
    const result = await processUpdatesBatch_ACU([], 'auto_standard', {}, vi.fn());
    expect(result.success).toBe(true);
  });

  it('执行更新回调成功时返回 success: true', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true, modifiedKeys: ['sheet_0'] } as CardUpdateResult);
    mockCurrentJsonTableData = { sheet_0: { name: '测试' } };

    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: '这是AI回复' },
    ]);

    const result = await processUpdatesBatch_ACU([1], 'auto_standard', {}, mockExecute);
    expect(result.success).toBe(true);
    expect(mockExecute).toHaveBeenCalled();
  });

  it('更新失败时返回 success: false 和 error', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: false, modifiedKeys: [], error: '更新失败' } as CardUpdateResult);
    mockCurrentJsonTableData = { sheet_0: { name: '测试' } };

    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: '这是AI回复' },
    ]);

    const result = await processUpdatesBatch_ACU([1], 'auto_standard', {}, mockExecute);
    expect(result.success).toBe(false);
    expect(result.failedBatch).toBe(1);
  });

  it('AI 回复过短时跳过（auto 模式）', async () => {
    mockSettings.autoUpdateTokenThreshold = 1000;
    const mockExecute = vi.fn().mockResolvedValue({ success: true, modifiedKeys: [] } as CardUpdateResult);
    mockCurrentJsonTableData = { sheet_0: { name: '测试' } };

    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: '短' },
    ]);

    const result = await processUpdatesBatch_ACU([1], 'auto_standard', {}, mockExecute);
    expect(result.success).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('构建合并基底失败时返回 error', async () => {
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { getChatSheetGuideDataForIsolationKey_ACU } = await import('../../../src/service/template/chat-scope');
    // 确保走 template 分支（guide 返回 null），然后 template 解析抛异常
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue(null);
    vi.mocked(parseTableTemplateJson_ACU).mockImplementationOnce(() => { throw new Error('模板解析失败'); });

    const mockExecute = vi.fn().mockResolvedValue({ success: true, modifiedKeys: [] });
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: '这是AI回复' },
    ]);

    const result = await processUpdatesBatch_ACU([1], 'auto_standard', {}, mockExecute);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('执行更新时传入基于批次历史数据的 batchBaseSnapshot 深拷贝', async () => {
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValueOnce({
      sheet_0: { name: '背包物品表', content: [['row_id', '物品名']] },
      sheet_1: { name: '纪要表', content: [['row_id', '事件']] },
    });
    mockCurrentJsonTableData = {
      sheet_0: { name: '背包物品表', content: [['row_id', '物品名']] },
      sheet_1: { name: '纪要表', content: [['row_id', '事件']] },
    };

    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true, mes: '用户0' },
      {
        is_user: false,
        mes: 'AI0',
        TavernDB_ACU_IsolatedData: {
          '': {
            independentData: {
              sheet_0: { name: '背包物品表', content: [['row_id', '物品名'], ['1', '铁剑']] },
              sheet_1: { name: '纪要表', content: [['row_id', '事件'], ['1', '旧事件']] },
            },
          },
        },
      },
      { is_user: true, mes: '用户1' },
      { is_user: false, mes: '这是AI回复' },
    ]);
    const mockExecute = vi.fn().mockResolvedValue({ success: true, modifiedKeys: ['sheet_1'] } as CardUpdateResult);

    const result = await processUpdatesBatch_ACU([3], 'auto_standard', { targetSheetKeys: ['sheet_1'], requestOptions: { tableApiPreset: 'preset' } }, mockExecute);

    expect(result.success).toBe(true);
    const progressContext = mockExecute.mock.calls[0][6];
    expect(progressContext.batchBaseSnapshot.sheet_0.content[1][1]).toBe('铁剑');
    expect(progressContext.batchBaseSnapshot.sheet_1.content[1][1]).toBe('旧事件');
    expect(progressContext.batchBaseSnapshot).not.toBe(mockCurrentJsonTableData);
  });
});

// ═══════════════════════════════════════════════════════════════
// executeCardUpdateCore_ACU
// ═══════════════════════════════════════════════════════════════
describe('executeCardUpdateCore_ACU', () => {
  beforeEach(async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { disposeStorageProvider } = await import('../../../src/service/table/table-storage-strategy');
    vi.mocked(isSqliteMode).mockReturnValue(false);
    disposeStorageProvider();
    vi.clearAllMocks();
    mockParseAndApplyTableEdits.mockReset();
    mockParseAndApplyTableEditsToData.mockReset();
    mockApplySqlEditsToTableDataSnapshot.mockReset();
    mockWasStopped = false;
    mockSettings = {
      ...mockSettings,
      tableMaxRetries: 3,
      autoUpdateTokenThreshold: 0,
      importPromptExcludeImportedWorldbookEntries: true,
    };
    mockCurrentJsonTableData = { sheet_0: { name: '测试表', content: [['row_id'], ['1']] } };
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: true, messageIndex: 0 });
  });

  it('正常流程：AI 返回有效响应，解析成功，保存成功', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: ['sheet_0'] });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const abortController = new AbortController();
    const progressEvents: CardUpdateProgressEvent[] = [];

    const result = await executeCardUpdateCore_ACU(
      [{ is_user: false, mes: 'AI回复' }],
      0, false, 'auto_standard', false,
      ['sheet_0'], null, abortController,
      (event) => progressEvents.push(event)
    );

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0']);
    expect(result.aborted).toBeUndefined();
    // 验证进度事件序列
    const phases = progressEvents.map(e => e.phase);
    expect(phases).toContain('preparing');
    expect(phases).toContain('calling_ai');
    expect(phases).toContain('parsing');
    expect(phases).toContain('saving');
    expect(phases).toContain('complete');
  });

  it('将目标表转换为 sheet 级 writeSet，并把 transactionContext 传给持久化', async () => {
    const txCtx = {
      transactionId: 'tx-ai-sheet-1',
      chatKey: 'test-chat',
      isolationKey: '',
      source: 'group_fill',
      baseRevision: 'rev-base',
      writeSet: [{ kind: 'sheet' as const, sheetKey: 'sheet_1' }],
      runCommit: async (commitTask: any) => commitTask(),
    };
    mockCurrentJsonTableData = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', '旧A']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', '旧B']] },
    };
    mockRunTableWriteTransaction.mockImplementationOnce(async (options: any, task: any) => {
      expect(options.writeSet).toEqual([{ kind: 'sheet', sheetKey: 'sheet_1' }]);
      return task(txCtx, JSON.parse(JSON.stringify(options.initialData)));
    });
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEditsToData.mockImplementation((_aiResponse: string, tableData: any) => {
      tableData.sheet_1.content.push(['2', '新B']);
      return { success: true, modifiedKeys: ['sheet_1'] };
    });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);

    const result = await executeCardUpdateCore_ACU(
      [{ is_user: false, mes: 'AI回复' }],
      0, false, 'auto_standard', false,
      ['sheet_1'], null, new AbortController()
    );

    expect(result.success).toBe(true);
    expect(mockRunTableWriteTransaction).toHaveBeenCalledWith(expect.objectContaining({
      source: 'group_fill',
      writeSet: [{ kind: 'sheet', sheetKey: 'sheet_1' }],
    }), expect.any(Function));
    const persistOptions = mockPersistTablesToChatMessage.mock.calls[0][0];
    expect(persistOptions.transactionContext).toBe(txCtx);
    expect(persistOptions.tableData.sheet_1.content).toContainEqual(['2', '新B']);
    expect(mockCurrentJsonTableData.sheet_0.content).toEqual([['row_id', '值'], ['1', '旧A']]);
  });

  it('AI 返回后在同 scope 锁内恢复 batchBaseSnapshot，避免保存被其他组污染', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockImplementation(async () => {
      mockCurrentJsonTableData = {
        mate: { type: 'acu', version: 1 },
          sheet_0: { name: '背包物品表', content: [['row_id', '物品名'], ['1', '被污染的铁剑']] },
        sheet_1: { name: '纪要表', content: [['row_id', '事件'], ['1', '被其他组污染']] },
      };
      return '<tableEdit>有效内容</tableEdit>';
    });
    mockParseAndApplyTableEditsToData.mockImplementation((_aiResponse: string, tableData: any) => {
      expect(tableData.sheet_0.content[1][1]).toBe('铁剑');
      expect(tableData.sheet_1.content[1][1]).toBe('旧事件');
      tableData.sheet_1 = { name: '纪要表', content: [['row_id', '事件'], ['1', '本组新事件']] };
      return { success: true, modifiedKeys: ['sheet_1'] };
    });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);

    let savedSnapshot: any = null;
    mockPersistTablesToChatMessage.mockImplementation(async (options: any) => {
      savedSnapshot = JSON.parse(JSON.stringify(options.tableData));
      return { saved: true, messageIndex: 0 };
    });

    const result = await executeCardUpdateCore_ACU(
      [{ is_user: false, mes: 'AI回复' }],
      0, false, 'auto_standard', false,
      ['sheet_1'], null, new AbortController(),
      {
        batchBaseSnapshot: {
          mate: { type: 'acu', version: 1 },
          sheet_0: { name: '背包物品表', content: [['row_id', '物品名'], ['1', '铁剑']] },
          sheet_1: { name: '纪要表', content: [['row_id', '事件'], ['1', '旧事件']] },
        },
      }
    );

    expect(result.success).toBe(true);
    expect(savedSnapshot.sheet_0.content[1][1]).toBe('铁剑');
    expect(savedSnapshot.sheet_1.content[1][1]).toBe('本组新事件');
  });


  it('prepareAIInput 返回 null 时返回错误', async () => {
    mockPrepareAIInput.mockResolvedValue(null);

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      null, null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法准备AI输入');
  });

  it('AI 响应无 tableEdit 标签时重试并最终失败', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('无效的AI响应，没有标签');
    mockSettings.tableMaxRetries = 1; // 只重试1次，加快测试

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      null, null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('1 次尝试后仍失败');
  });

  it('AI 回复过短时重试并最终失败', async () => {
    mockSettings.autoUpdateTokenThreshold = 100;
    mockSettings.tableMaxRetries = 1;
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('短');

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      null, null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('AI回复过短');
  });

  it('用户中止时返回 aborted', async () => {
    mockWasStopped = true;
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      null, null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
  });

  it('AbortError 时返回 aborted', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      null, null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
  });

  it('保存失败时返回错误', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: ['sheet_0'] });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: false, error: 'save failed' });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('save failed');
  });

  it('无实质数据改动但 targetSheetKeys 非空时记录填表尝试但不推进 changed tracking', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>   </tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: [] });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
    );

    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetMessageIndex: 0,
      targetSheetKeys: [],
      updateGroupKeys: ['sheet_0'],
      trackingSheetKeys: [],
      source: 'group_fill',
    }));
  });

  it('目标表参与本轮但仅部分表有实质修改时，只按实质修改表推进 tracking', async () => {
    mockCurrentJsonTableData = {
      sheet_0: { name: '表A', content: [['row_id'], ['1']] },
      sheet_1: { name: '表B', content: [['row_id'], ['1']] },
    };
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>部分更新</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: ['sheet_0'] });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      ['sheet_0', 'sheet_1'], null, new AbortController()
    );

    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetMessageIndex: 0,
      targetSheetKeys: ['sheet_0'],
      updateGroupKeys: ['sheet_0', 'sheet_1'],
      trackingSheetKeys: ['sheet_0'],
      source: 'group_fill',
    }));
  });

  it('import 模式不保存到聊天记录', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: ['sheet_0'] });

    const progressEvents: CardUpdateProgressEvent[] = [];

    const result = await executeCardUpdateCore_ACU(
      [], 0, true, 'auto_standard', false,
      null, null, new AbortController(),
      (event) => progressEvents.push(event)
    );

    expect(result.success).toBe(true);
    expect(mockSaveIndependentTable).not.toHaveBeenCalled();
    expect(progressEvents.map(e => e.phase)).toContain('chunk_done');
  });

  it('无 onProgress 回调时不报错', async () => {
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: ['sheet_0'] });
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
      // 不传 onProgress
    );

    expect(result.success).toBe(true);
  });

  it('解析失败时重试并最终失败', async () => {
    mockSettings.tableMaxRetries = 1;
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: false, modifiedKeys: [] });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      null, null, new AbortController()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('解析或应用AI更新时出错');
  });

  it('首次初始化时保存所有表，但只追踪实质修改表', async () => {
    mockCurrentJsonTableData = {
      sheet_0: { name: '测试表A', content: [['row_id'], ['1']] },
      sheet_1: { name: '测试表B', content: [['row_id'], ['1']] },
    };

    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>有效内容</tableEdit>');
    mockParseAndApplyTableEdits.mockReturnValue({ success: true, modifiedKeys: ['sheet_0'] });
    mockCheckIfFirstTimeInit.mockResolvedValue(true);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValueOnce({
      sheet_0: { name: '测试表A', content: [['row_id'], ['种子行A']] },
      sheet_1: { name: '测试表B', content: [['row_id'], ['种子行B']] },
    });

    const result = await executeCardUpdateCore_ACU(
      [], 0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
    );

    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetMessageIndex: 0,
      targetSheetKeys: ['sheet_0', 'sheet_1'],
      updateGroupKeys: ['sheet_0'],
      trackingSheetKeys: ['sheet_0'],
      source: 'group_fill',
    }));
  });
});

// ═══════════════════════════════════════════════════════════════
// orchestrateManualUpdate_ACU
// ═══════════════════════════════════════════════════════════════
describe('orchestrateManualUpdate_ACU', () => {
  const mockProcessBatch = vi.fn();
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    vi.clearAllMocks();
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '测试表', updateConfig: { groupId: 0 }, content: [['row_id', '值']] },
    });

    vi.mocked(isSqliteMode).mockReturnValue(false);
    mockIsAutoUpdating = false;
    mockCoreApisReady = true;
    mockCurrentJsonTableData = { sheet_0: { name: '测试表', updateConfig: {}, content: [['row_id', '值']] } };
    mockSettings = {
      ...mockSettings,
      apiMode: 'custom',
      apiConfig: { useMainApi: true, url: '', model: '' },
      autoUpdateThreshold: 3,
      updateBatchSize: 3,
      skipUpdateFloors: 0,
    };
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockUpdateReadableLorebookEntry.mockResolvedValue(undefined);
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: true, messageIndex: 3 });
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('sheet_0')) {
        if (tableData.sheet_0) tableData.sheet_0.content.push(['2', '来自A']);
        return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
      }
      if (aiResponse.includes('sheet_1')) {
        if (tableData.sheet_1) tableData.sheet_1.content.push(['2', '来自B']);
        return { success: true, modifiedKeys: ['sheet_1'], appliedEdits: 1 };
      }
      return { success: false, modifiedKeys: [], appliedEdits: 0 };
    });
  });

  it('正在更新中时返回错误', async () => {
    mockIsAutoUpdating = true;
    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('正在进行中');
  });

  it('API 未就绪时返回错误', async () => {
    mockCoreApisReady = false;
    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API未就绪');
  });

  it('API 未配置时返回错误', async () => {
    mockSettings.apiMode = 'custom';
    mockSettings.apiConfig = { useMainApi: false, url: '', model: '' };
    mockSettings.tavernProfile = '';
    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API未配置');
  });

  it('数据库未加载时返回错误', async () => {
    mockCurrentJsonTableData = null;
    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('数据库未加载');
  });

  it('聊天记录为空时返回错误', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([]);

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('聊天记录为空');
  });

  it('无 AI 回复时返回错误', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: true },
    ]);

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('尚未检测到AI回复');
  });

  it('未选择表格时返回错误', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false },
    ]);

    const result = await orchestrateManualUpdate_ACU([], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('未选择');
  });

  it('正常流程：processBatch 成功，返回 success', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复1' },
      { is_user: true },
      { is_user: false, mes: 'AI回复2' },
    ]);

    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);
    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
  });

  it('预清空时只按选中表调用清理', async () => {
    const { getChatArray_ACU, clearTableDataAtFloors_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复1' },
      { is_user: true },
      { is_user: false, mes: 'AI回复2' },
    ]);
    mockCurrentJsonTableData = {
      sheet_0: { name: '测试表A', updateConfig: {} },
      sheet_1: { name: '测试表B', updateConfig: {} },
    };
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData, { clearBeforeUpdate: true });
    expect(result.success).toBe(true);
    expect(clearTableDataAtFloors_ACU).toHaveBeenCalled();
    expect(vi.mocked(clearTableDataAtFloors_ACU).mock.calls[0][1]).toEqual(['sheet_0']);
  });

  it('processBatch 失败时返回错误', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);

    mockSettings.tableMaxRetries = 1;
    mockCallCustomOpenAI.mockResolvedValue('无效响应');

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('尝试后仍失败');
  });

  it('自动合并触发成功时返回 autoMergeTriggered', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);

    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    const { checkAutoMergeTrigger_ACU, prepareAutoMergeBatches_ACU, executeAutoMergeBatch_ACU, finalizeAutoMerge_ACU } = await import('../../../src/service/summary/merge-logic');
    vi.mocked(checkAutoMergeTrigger_ACU).mockReturnValue({ shouldTrigger: true, mergeCount: 5 });
    vi.mocked(prepareAutoMergeBatches_ACU).mockReturnValue({ batches: [{ startIndex: 0, endIndex: 5 }] } as any);
    vi.mocked(executeAutoMergeBatch_ACU).mockResolvedValue({ accumulatedSummary: ['合并结果'] } as any);
    vi.mocked(finalizeAutoMerge_ACU).mockResolvedValue(undefined);

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], mockProcessBatch, mockRefreshData);
    expect(result.success).toBe(true);
    expect(result.autoMergeTriggered).toBe(true);
    expect(result.autoMergeSuccess).toBe(true);
  });

  it('finally 块中清理 manualExtraHint 和 isAutoUpdating', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);

    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);

    const { _set_manualExtraHint_ACU, _set_isAutoUpdatingCard_ACU } = await import('../../../src/service/runtime/state-manager');
    expect(_set_manualExtraHint_ACU).toHaveBeenCalledWith('');
    expect(_set_isAutoUpdatingCard_ACU).toHaveBeenCalledWith(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// executeCardUpdateCore_ACU — SQL 错误反馈重试逻辑
// ═══════════════════════════════════════════════════════════════
describe('executeCardUpdateCore_ACU — SQL 错误反馈重试', () => {
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseAndApplyTableEdits.mockReset();
    mockParseAndApplyTableEditsToData.mockReset();
    mockApplySqlEditsToTableDataSnapshot.mockReset();
    setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: any) => { callback(); return 0 as any; });
    mockWasStopped = false;
    mockSettings = {
      ...mockSettings,
      tableMaxRetries: 3,
      autoUpdateTokenThreshold: 0,
      importPromptExcludeImportedWorldbookEntries: true,
    };
    mockCurrentJsonTableData = { sheet_0: { name: '测试表', content: [['row_id'], ['1']] } };
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: true, messageIndex: 0 });
    mockApplySqlEditsToTableDataSnapshot.mockImplementation(() => mockParseAndApplyTableEdits());
  });

  afterEach(() => {
    mockApplySqlEditsToTableDataSnapshot.mockReset();
    setTimeoutSpy.mockRestore();
  });

  it('SQL 模式下 parseAndApplyTableEdits 抛错时，错误信息注入到 tableDataText', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);

    mockPrepareAIInput.mockResolvedValue({ tableDataText: '原始数据' });
    mockCurrentJsonTableData = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'test', name: '测试表', sourceData: { ddl: 'CREATE TABLE test (row_id INTEGER PRIMARY KEY);' }, content: [['row_id']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    };

    let callCount = 0;
    mockCallCustomOpenAI.mockImplementation(async (dynamicContent: any) => {
      callCount++;
      if (callCount === 1) {
        return '<tableEdit>INSERT INTO invalid_table VALUES (1);</tableEdit>';
      }
      if (callCount === 2) {
        expect(dynamicContent.tableDataText).toContain('SQL_ERROR_FEEDBACK');
        expect(dynamicContent.tableDataText).toContain('no such table');
        expect(dynamicContent.tableDataText).toContain('SQL执行错误，请修正后重新输出');
        return '<tableEdit>INSERT INTO test VALUES (1);</tableEdit>';
      }
      return '<tableEdit>ok</tableEdit>';
    });

    mockParseAndApplyTableEdits
      .mockImplementationOnce(() => { throw new Error('SQL 语法错误: no such table'); })
      .mockReturnValueOnce({ success: true, modifiedKeys: ['sheet_0'] });

    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    // 启动但不 await，让 fake timer 推进
    const resultPromise = executeCardUpdateCore_ACU(
      [{ is_user: false, mes: 'AI回复' }],
      0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
    );

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);

    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('非 SQL 模式下错误不注入 SQL_ERROR_FEEDBACK', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(false);

    mockPrepareAIInput.mockResolvedValue({ tableDataText: '原始数据' });

    let capturedTableDataText = '';
    mockCallCustomOpenAI.mockImplementation(async (dynamicContent: any) => {
      capturedTableDataText = dynamicContent.tableDataText;
      return '<tableEdit>有效内容</tableEdit>';
    });

    mockParseAndApplyTableEdits
      .mockImplementationOnce(() => { throw new Error('解析错误'); })
      .mockReturnValueOnce({ success: true, modifiedKeys: ['sheet_0'] });

    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const resultPromise = executeCardUpdateCore_ACU(
      [{ is_user: false, mes: 'AI回复' }],
      0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
    );

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(capturedTableDataText).not.toContain('SQL_ERROR_FEEDBACK');
  });

  it('SQL 模式下多次重试时错误信息被替换（不累积）', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    mockSettings.tableMaxRetries = 3;

    mockPrepareAIInput.mockResolvedValue({ tableDataText: '原始数据' });
    mockCurrentJsonTableData = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 't', name: '测试表', sourceData: { ddl: 'CREATE TABLE t (row_id INTEGER PRIMARY KEY);' }, content: [['row_id']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    };

    let callCount = 0;
    const capturedTableDataTexts: string[] = [];
    mockCallCustomOpenAI.mockImplementation(async (dynamicContent: any) => {
      callCount++;
      capturedTableDataTexts.push(dynamicContent.tableDataText);
      if (callCount === 1) return '<tableEdit>INSERT INTO missing VALUES (1);</tableEdit>';
      if (callCount === 2) return '<tableEdit>INSERT INTO t (missing_col) VALUES (1);</tableEdit>';
      return '<tableEdit>INSERT INTO t VALUES (1);</tableEdit>';
    });

    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    mockSaveIndependentTable.mockResolvedValue({ saved: true });

    const resultPromise = executeCardUpdateCore_ACU(
      [{ is_user: false, mes: 'AI回复' }],
      0, false, 'auto_standard', false,
      ['sheet_0'], null, new AbortController()
    );

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(callCount).toBe(3);

    // 第二次调用时应包含第一次的错误信息
    expect(capturedTableDataTexts[1]).toContain('no such table');
    // 第三次调用时应包含第二次的错误信息（替换了第一次的）
    expect(capturedTableDataTexts[2]).toContain('missing_col');
    // 第三次不应包含第一次的错误信息（被替换了）
    expect(capturedTableDataTexts[2]).not.toContain('no such table');

    vi.mocked(isSqliteMode).mockReturnValue(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 表级 API 预设覆盖决议（orchestrateManualUpdate_ACU）
// ═══════════════════════════════════════════════════════════════
describe('orchestrateManualUpdate_ACU — 表级 API 预设覆盖', () => {
  const mockProcessBatch = vi.fn();
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    vi.clearAllMocks();
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '测试表', updateConfig: { groupId: 0 }, content: [['row_id', '值']] },
    });

    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockUpdateReadableLorebookEntry.mockResolvedValue(undefined);
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: true, messageIndex: 3 });
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('sheet_0')) {
        if (tableData.sheet_0) tableData.sheet_0.content.push(['2', '来自A']);
        return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
      }
      if (aiResponse.includes('sheet_1')) {
        if (tableData.sheet_1) tableData.sheet_1.content.push(['2', '来自B']);
        return { success: true, modifiedKeys: ['sheet_1'], appliedEdits: 1 };
      }
      return { success: false, modifiedKeys: [], appliedEdits: 0 };
    });
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(false);
    mockIsAutoUpdating = false;
    mockCoreApisReady = true;
    mockCurrentJsonTableData = { sheet_0: { name: '纪要表', updateConfig: {}, content: [['row_id', '值']] } };
    mockSettings = {
      ...mockSettings,
      apiMode: 'custom',
      apiConfig: { useMainApi: true, url: '', model: '' },
      autoUpdateThreshold: 3,
      updateBatchSize: 3,
      skipUpdateFloors: 0,
      tableApiPresetOverridesByName: {},
    };
  });

  it('表有覆盖预设时，requestOptions 携带 tableApiPreset', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    // parseTableTemplateJson_ACU mock 返回 { sheet_0: { name: '测试表' } }
    mockSettings.tableApiPresetOverridesByName = { '测试表': 'special-preset' };

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);
    expect(result.success).toBe(true);

    // 验证 callCustomOpenAI 被调用时携带了 requestOptions.tableApiPreset
    const openAICall = mockCallCustomOpenAI.mock.calls[0];
    const requestOptions = openAICall[2]; // 第三参 = requestOptions
    expect(requestOptions).toBeDefined();
    expect(requestOptions.tableApiPreset).toBe('special-preset');
  });

  it('表无覆盖预设时，requestOptions 为 null', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    mockSettings.tableApiPresetOverridesByName = {};

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);
    expect(result.success).toBe(true);

    const openAICall = mockCallCustomOpenAI.mock.calls[0];
    const requestOptions = openAICall[2];
    expect(requestOptions).toBeNull();
  });

  it('表名为空时忽略覆盖', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');
    mockCurrentJsonTableData = { sheet_0: { name: '', updateConfig: {} } };

    mockSettings.tableApiPresetOverridesByName = { '': 'should-not-apply' };

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);
    expect(result.success).toBe(true);

    const openAICall = mockCallCustomOpenAI.mock.calls[0];
    const requestOptions = openAICall[2];
    expect(requestOptions).toBeNull();
  });

  it('表名有空格时进行标准化匹配', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    vi.mocked(getChatArray_ACU).mockReturnValue([
      { is_user: true },
      { is_user: false, mes: 'AI回复' },
    ]);
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    // parseTableTemplateJson_ACU mock 返回 { sheet_0: { name: '测试表' } }
    // 设置 mockCurrentJsonTableData 的 name 带空格并不影响决议，
    // 因为决议用的是 parseTableTemplateJson_ACU 的返回值
    mockSettings.tableApiPresetOverridesByName = { '测试表': 'trimmed-preset' };

    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), mockRefreshData);
    expect(result.success).toBe(true);

    const openAICall = mockCallCustomOpenAI.mock.calls[0];
    const requestOptions = openAICall[2];
    expect(requestOptions.tableApiPreset).toBe('trimmed-preset');
  });
});

describe('collectGroupFillResponse_ACU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWasStopped = false;
    mockSettings = {
      ...mockSettings,
      tableMaxRetries: 2,
      autoUpdateTokenThreshold: 0,
      importPromptExcludeImportedWorldbookEntries: true,
    };
    mockCurrentJsonTableData = {
      sheet_0: { name: '全局表', content: [['row_id'], ['global']] },
    };
  });

  const createJob = () => ({
    groupKey: 'g0',
    groupId: 0,
    batchNumber: 1,
    targetSheetKeys: ['sheet_0'],
    messagesForContext: [{ is_user: false, mes: 'AI回复' }],
    saveTargetIndex: 0,
    updateMode: 'auto_standard',
    isImportMode: false,
    requestOptions: null,
    baseSnapshot: {
      sheet_0: { name: '快照表', content: [['row_id'], ['snapshot']] },
    },
  });

  it('显式 baseSnapshot 传给 prepareAIInput_ACU，且 collect 阶段不触发 parse/save', async () => {
    const job = createJob();
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>insertRow(0,{"0":"x"})</tableEdit>');

    const result = await collectGroupFillResponse_ACU(job);

    expect(result.success).toBe(true);
    expect(result.job).toBe(job);
    expect(mockPrepareAIInput).toHaveBeenCalledWith(
      job.messagesForContext,
      job.updateMode,
      job.targetSheetKeys,
      expect.objectContaining({
        tableData: job.baseSnapshot,
        excludeImportTaggedWorldbookEntries: false,
      })
    );
    expect(mockParseAndApplyTableEdits).not.toHaveBeenCalled();
    expect(mockSaveIndependentTable).not.toHaveBeenCalled();
    expect(mockRunTableUpdateApplyWithScopeLock).not.toHaveBeenCalled();
    expect(mockEnqueueSummaryVectorIndexFlush).not.toHaveBeenCalled();
  });

  it('AI 响应缺少完整 tableEdit 标签时按重试次数失败', async () => {
    const job = createJob();
    mockSettings.tableMaxRetries = 1;
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI.mockResolvedValue('无效响应');

    const result = await collectGroupFillResponse_ACU(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain('1 次尝试后仍失败');
    expect(mockCallCustomOpenAI).toHaveBeenCalledTimes(1);
    expect(mockParseAndApplyTableEdits).not.toHaveBeenCalled();
    expect(mockSaveIndependentTable).not.toHaveBeenCalled();
  });

  it('SQL 模式下携带上轮错误反馈时，将 SQL_ERROR_FEEDBACK 注入到 prompt', async () => {
    const job = createJob();
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '原始数据' });
    mockCallCustomOpenAI.mockImplementation(async (dynamicContent: any) => {
      expect(dynamicContent.tableDataText).toContain('SQL_ERROR_FEEDBACK');
      expect(dynamicContent.tableDataText).toContain('no such table');
      return '<tableEdit>INSERT INTO test VALUES (1);</tableEdit>';
    });

    const result = await collectGroupFillResponse_ACU(job, { lastSqlError: 'no such table' });

    expect(result.success).toBe(true);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('prepareAIInput 返回 null 时直接失败', async () => {
    const job = createJob();
    mockPrepareAIInput.mockResolvedValue(null);

    const result = await collectGroupFillResponse_ACU(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法准备AI输入');
    expect(mockCallCustomOpenAI).not.toHaveBeenCalled();
  });
});

describe('applyUnifiedGroupFillResponses_ACU', () => {
  beforeEach(async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { disposeStorageProvider } = await import('../../../src/service/table/table-storage-strategy');
    disposeStorageProvider();
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    vi.mocked(isSqliteMode).mockReturnValue(false);
    vi.clearAllMocks();
    mockSettings = {
      ...mockSettings,
      summaryVectorIndexModeEnabled: true,
    };
    mockCurrentJsonTableData = {
      sheet_0: { name: '全局污染表', content: [['row_id', '值'], ['1', 'global']] },
      sheet_1: { name: '全局污染表2', content: [['row_id', '值'], ['1', 'global-2']] },
    };
    mockUpdateReadableLorebookEntry.mockResolvedValue(undefined);
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: true, messageIndex: 3 });
    mockGetChatArray_ACU.mockImplementation(() => mockChatArrayForSeedStage);
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('sheet_0')) {
        tableData.sheet_0.content.push(['2', '来自A']);
        return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
      }
      if (aiResponse.includes('sheet_1')) {
        tableData.sheet_1.content.push(['2', '来自B']);
        return { success: true, modifiedKeys: ['sheet_1'], appliedEdits: 1 };
      }
      return { success: false, modifiedKeys: [], appliedEdits: 0 };
    });
  });

  it('按稳定顺序基于 baseSnapshot 合并响应，仅显式保存一次并触发一次 flush', async () => {
    const baseSnapshot = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_1</tableEdit>', tableEditText: 'sheet_1', job: { groupKey: 'b', groupId: 2, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_0</tableEdit>', tableEditText: 'sheet_0', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys.sort()).toEqual(['sheet_0', 'sheet_1']);
    expect(mockParseAndApplyTableEditsToData.mock.calls.map(call => call[0])).toEqual(['<tableEdit>sheet_0</tableEdit>', '<tableEdit>sheet_1</tableEdit>']);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetMessageIndex: 3,
      targetSheetKeys: ['sheet_0', 'sheet_1'],
      updateGroupKeys: ['sheet_0', 'sheet_1'],
      trackingSheetKeys: ['sheet_0', 'sheet_1'],
      tableData: expect.objectContaining({
        sheet_0: expect.objectContaining({ content: [['row_id', '值'], ['1', 'base-a'], ['2', '来自A']] }),
        sheet_1: expect.objectContaining({ content: [['row_id', '值'], ['1', 'base-b'], ['2', '来自B']] }),
      }),
    }));
    expect(mockSaveIndependentTable).not.toHaveBeenCalled();
    expect(mockRunTableUpdateApplyWithScopeLock).not.toHaveBeenCalled();
    expect(mockEnqueueSummaryVectorIndexFlush).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSummaryVectorIndexFlush).toHaveBeenCalledWith(expect.objectContaining({ targetMessageIndex: 3, mode: 'sync', reason: 'unified_group_fill_complete' }));
    expect(mockUpdateReadableLorebookEntry).toHaveBeenCalledTimes(1);
    expect(baseSnapshot.sheet_0.content).toEqual([['row_id', '值'], ['1', 'base-a']]);
    expect(baseSnapshot.sheet_1.content).toEqual([['row_id', '值'], ['1', 'base-b']]);
  });

  it('首次填表时 unified 路径保存全量表，但只追踪实质修改表', async () => {
    mockCheckIfFirstTimeInit.mockResolvedValue(true);
    const baseSnapshot = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_0</tableEdit>', tableEditText: 'sheet_0', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0']);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetSheetKeys: ['sheet_0', 'sheet_1'],
      updateGroupKeys: ['sheet_0'],
      trackingSheetKeys: ['sheet_0'],
      tableData: expect.objectContaining({
        sheet_0: expect.objectContaining({ content: [['row_id', '值'], ['1', 'base-a'], ['2', '来自A']] }),
        sheet_1: expect.objectContaining({ content: [['row_id', '值'], ['1', 'base-b']] }),
      }),
    }));
  });

  it('unified 中存在 no-op group 时仍整体成功但只追踪实质修改表', async () => {
    const baseSnapshot = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('sheet_0')) {
        tableData.sheet_0.content.push(['2', '来自A']);
        return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
      }
      return { success: true, modifiedKeys: [], appliedEdits: 0 };
    });
    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_0</tableEdit>', tableEditText: 'sheet_0', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_1</tableEdit>', tableEditText: 'sheet_1', job: { groupKey: 'b', groupId: 2, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0']);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetSheetKeys: ['sheet_0'],
      updateGroupKeys: ['sheet_0', 'sheet_1'],
      trackingSheetKeys: ['sheet_0'],
    }));
  });

  it('SQL 模式下基于显式 baseSnapshot 顺序统一提交，不污染全局 currentJsonTableData', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    const inventoryDDL = `CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);`;
    const questDDL = `CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);`;
    const baseSnapshot = {
      mate: { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: inventoryDDL }, content: [['row_id', 'value'], ['1', 'base-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: questDDL }, content: [['row_id', 'value'], ['1', 'base-b']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO quest_log VALUES (2, 'sql-b');</tableEdit>", tableEditText: "INSERT INTO quest_log VALUES (2, 'sql-b');", job: { groupKey: 'b', groupId: 2, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>", tableEditText: "INSERT INTO inventory VALUES (2, 'sql-a');", job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0', 'sheet_1']);
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    const savedData = mockPersistTablesToChatMessage.mock.calls[0][0].tableData;
    expect(savedData.sheet_0.content).toEqual([['row_id', 'value'], ['1', 'base-a'], ['2', 'sql-a']]);
    expect(savedData.sheet_1.content).toEqual([['row_id', 'value'], ['1', 'base-b'], ['2', 'sql-b']]);
    expect(mockCurrentJsonTableData.sheet_0.content).toEqual([['row_id', 'value'], ['1', 'base-a'], ['2', 'sql-a']]);
    expect(mockCurrentJsonTableData.sheet_1.content).toEqual([['row_id', 'value'], ['1', 'base-b'], ['2', 'sql-b']]);
    expect(mockPersistTablesToChatMessage.mock.calls[0][0].operations).toEqual([
      { kind: 'sql_batch', statements: ["INSERT INTO inventory VALUES (2, 'sql-a')"] },
      { kind: 'sql_batch', statements: ["INSERT INTO quest_log VALUES (2, 'sql-b')"] },
    ]);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('SQL 模式统一提交失败时返回 SQL 错误且不保存', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    const inventoryDDL = `CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);`;
    const baseSnapshot = {
      mate: { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: inventoryDDL }, content: [['row_id', 'value'], ['1', 'base-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>UPDATE inventory SET missing_col = 1 WHERE row_id = 1;</tableEdit>', tableEditText: 'UPDATE inventory SET missing_col = 1 WHERE row_id = 1;', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(false);
    expect(result.error).toContain('group a SQL 执行失败');
    expect(result.error).toContain('missing_col');
    expect(mockPersistTablesToChatMessage).not.toHaveBeenCalled();
    expect(mockUpdateReadableLorebookEntry).not.toHaveBeenCalled();
    expect(mockEnqueueSummaryVectorIndexFlush).not.toHaveBeenCalled();
    expect(mockCurrentJsonTableData.sheet_0.content).toEqual([['row_id', 'value'], ['1', 'base-a']]);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('SQL 模式下模板基础数据与 AI INSERT 主键冲突时返回真实 SQL 错误且不保存', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    mockChatArrayForSeedStage.push({ is_user: false, mes: '开场白' }, { is_user: true, mes: '第一条用户消息' });
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue(null);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['1', 'tpl-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any);
    vi.mocked(getEffectiveSeedRowsForSheet_ACU).mockReturnValue([['1', 'tpl-a']] as any);

    const baseSnapshot = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO inventory VALUES (1, 'sql-conflict');</tableEdit>", tableEditText: "INSERT INTO inventory VALUES (1, 'sql-conflict');", job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(false);
    const normalizedError = String(result.error).toLowerCase();
    expect(normalizedError).toContain('group a');
    expect(normalizedError).toMatch(/unique|constraint|primary/);
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    expect(mockPersistTablesToChatMessage).not.toHaveBeenCalled();
    expect(mockUpdateReadableLorebookEntry).not.toHaveBeenCalled();
    expect(mockEnqueueSummaryVectorIndexFlush).not.toHaveBeenCalled();
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('parser 返回越权 modifiedKeys 时直接失败且不保存', async () => {
    const baseSnapshot = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    mockParseAndApplyTableEditsToData.mockImplementationOnce((_aiResponse: string, tableData: any) => {
      tableData.sheet_1.content.push(['2', '越权写入']);
      return { success: true, modifiedKeys: ['sheet_1'], appliedEdits: 1 };
    });

    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_0</tableEdit>', tableEditText: 'sheet_0', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(false);
    expect(result.error).toContain('越权修改');
    expect(mockPersistTablesToChatMessage).not.toHaveBeenCalled();
    expect(mockEnqueueSummaryVectorIndexFlush).not.toHaveBeenCalled();
    expect(mockUpdateReadableLorebookEntry).not.toHaveBeenCalled();
  });

  it('使用真实 native DSL parser 时，统一提交基于显式 baseSnapshot 而不是全局污染数据', async () => {
    const actualParser = await vi.importActual<typeof import('../../../src/service/ai/prompt-builder/table-edit-parser')>('../../../src/service/ai/prompt-builder/table-edit-parser');
    mockParseAndApplyTableEditsToData.mockImplementation((...args: any[]) => actualParser.parseAndApplyTableEditsToData_ACU(...args));
    const baseSnapshot = {
      sheet_0: { uid: 'sheet_0', name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { uid: 'sheet_1', name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>insertRow(0,{"0":"真实A"})</tableEdit>', tableEditText: 'insertRow(0,{"0":"真实A"})', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
      { success: true, attempt: 1, aiResponse: '<tableEdit>insertRow(1,{"0":"真实B"})</tableEdit>', tableEditText: 'insertRow(1,{"0":"真实B"})', job: { groupKey: 'b', groupId: 2, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    const savedData = mockPersistTablesToChatMessage.mock.calls[0][0].tableData;
    expect(savedData.sheet_0.content[1][1]).toBe('base-a');
    expect(savedData.sheet_0.content[2][1]).toBe('真实A');
    expect(savedData.sheet_1.content[1][1]).toBe('base-b');
    expect(savedData.sheet_1.content[2][1]).toBe('真实B');
    expect(savedData.sheet_0.content[1][1]).not.toBe('global');
    expect(savedData.sheet_1.content[1][1]).not.toBe('global-2');
  });

  it('collect 真实产物可直接进入 unified apply，不需要手工补 job', async () => {
    const actualParser = await vi.importActual<typeof import('../../../src/service/ai/prompt-builder/table-edit-parser')>('../../../src/service/ai/prompt-builder/table-edit-parser');
    mockParseAndApplyTableEditsToData.mockImplementation((...args: any[]) => actualParser.parseAndApplyTableEditsToData_ACU(...args));
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockCallCustomOpenAI
      .mockResolvedValueOnce('<tableEdit>insertRow(0,{"0":"collectA"})</tableEdit>')
      .mockResolvedValueOnce('<tableEdit>insertRow(1,{"0":"collectB"})</tableEdit>');

    const baseSnapshot = {
      sheet_0: { uid: 'sheet_0', name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { uid: 'sheet_1', name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    const jobA = { groupKey: 'a', groupId: 1, batchNumber: 1, targetSheetKeys: ['sheet_0'], messagesForContext: [{ is_user: false, mes: 'AI回复A' }], saveTargetIndex: 3, updateMode: 'auto_standard', requestOptions: null, baseSnapshot, isImportMode: false };
    const jobB = { groupKey: 'b', groupId: 2, batchNumber: 1, targetSheetKeys: ['sheet_1'], messagesForContext: [{ is_user: false, mes: 'AI回复B' }], saveTargetIndex: 3, updateMode: 'auto_standard', requestOptions: null, baseSnapshot, isImportMode: false };

    const responseA = await collectGroupFillResponse_ACU(jobA);
    const responseB = await collectGroupFillResponse_ACU(jobB);
    const result = await applyUnifiedGroupFillResponses_ACU([responseB, responseA], baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(responseA.job).toBe(jobA);
    expect(responseB.job).toBe(jobB);
    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    const savedData = mockPersistTablesToChatMessage.mock.calls[0][0].tableData;
    expect(savedData.sheet_0.content[2][1]).toBe('collectA');
    expect(savedData.sheet_1.content[2][1]).toBe('collectB');
    expect(savedData.sheet_0.content[1][1]).toBe('base-a');
    expect(savedData.sheet_1.content[1][1]).toBe('base-b');
  });

  it('targetSheetKeys 重叠时直接失败，不解析不保存不触发 flush', async () => {
    const baseSnapshot = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
    };
    const responses = [
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_0</tableEdit>', tableEditText: 'sheet_0', job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
      { success: true, attempt: 1, aiResponse: '<tableEdit>sheet_0 again</tableEdit>', tableEditText: 'sheet_0 again', job: { groupKey: 'b', groupId: 2, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(false);
    expect(result.error).toContain('targetSheetKeys');
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    expect(mockPersistTablesToChatMessage).not.toHaveBeenCalled();
    expect(mockSaveIndependentTable).not.toHaveBeenCalled();
    expect(mockEnqueueSummaryVectorIndexFlush).not.toHaveBeenCalled();
    expect(mockUpdateReadableLorebookEntry).not.toHaveBeenCalled();
  });

  it('SQL 模式下部分表无反馈时，仍用模板结构与基础数据初始化缺失表', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    mockChatArrayForSeedStage.push({ is_user: false, mes: '开场白' }, { is_user: true, mes: '第一条用户消息' });
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue(null);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['1', 'tpl-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: 'CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['1', 'tpl-b']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any);
    vi.mocked(getEffectiveSeedRowsForSheet_ACU).mockImplementation((sheetKey: string) => sheetKey === 'sheet_1' ? [['1', 'tpl-b']] : []);

    const baseSnapshot = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>", tableEditText: "INSERT INTO inventory VALUES (2, 'sql-a');", job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0', 'sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0']);
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    const savePayload = mockPersistTablesToChatMessage.mock.calls[0][0];
    expect(savePayload.targetSheetKeys).toEqual(['sheet_0', 'sheet_1']);
    expect(savePayload.tableData.sheet_0.content).toEqual([['row_id', 'value'], ['2', 'sql-a']]);
    expect(savePayload.tableData.sheet_1.content).toEqual([['row_id', 'value'], ['1', 'tpl-b']]);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('SQL 模式下模板无基础数据时，缺失表仍以表头空表落盘', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue(null);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: 'CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any);
    vi.mocked(getEffectiveSeedRowsForSheet_ACU).mockReturnValue([] as any);

    const baseSnapshot = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>", tableEditText: "INSERT INTO inventory VALUES (2, 'sql-a');", job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0', 'sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0']);
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    const savePayload = mockPersistTablesToChatMessage.mock.calls[0][0];
    expect(savePayload.targetSheetKeys).toEqual(['sheet_0', 'sheet_1']);
    expect(savePayload.tableData.sheet_1.content).toEqual([['row_id', 'value']]);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('SQL 模式下已有运行数据的表不重复灌入模板基础数据，也不扩大 targetSheetKeys', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue(null);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['1', 'tpl-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: 'CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['1', 'tpl-b']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any);
    vi.mocked(getEffectiveSeedRowsForSheet_ACU).mockImplementation((sheetKey: string) => sheetKey === 'sheet_1' ? [['1', 'tpl-b']] : []);

    const baseSnapshot = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: 'CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['9', 'existing-b']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>", tableEditText: "INSERT INTO inventory VALUES (2, 'sql-a');", job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0', 'sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    expect(result.modifiedKeys).toEqual(['sheet_0']);
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    const savePayload = mockPersistTablesToChatMessage.mock.calls[0][0];
    expect(savePayload.targetSheetKeys).toEqual(['sheet_0']);
    expect(savePayload.tableData.sheet_1.content).toEqual([['row_id', 'value'], ['9', 'existing-b']]);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('SQL 模式下缺失表 seedRows 的 row_id 会在首次初始化时稳定化后再落盘', async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU } = await import('../../../src/service/template/chat-scope');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    mockChatArrayForSeedStage.push({ is_user: false, mes: '开场白' }, { is_user: true, mes: '第一条用户消息' });
    vi.mocked(getChatSheetGuideDataForIsolationKey_ACU).mockReturnValue(null);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value'], ['1', 'tpl-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: 'CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any);
    vi.mocked(getEffectiveSeedRowsForSheet_ACU).mockImplementation((sheetKey: string) => sheetKey === 'sheet_1' ? [[null, 'tpl-b'], ['', 'tpl-c']] as any : []);

    const baseSnapshot = {
      mate: { type: 'acu', version: 1 },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);' }, content: [['row_id', 'value']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any;
    const responses = [
      { success: true, attempt: 1, aiResponse: "<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>", tableEditText: "INSERT INTO inventory VALUES (2, 'sql-a');", job: { groupKey: 'a', groupId: 1, batchNumber: 1, saveTargetIndex: 3, targetSheetKeys: ['sheet_0', 'sheet_1'], updateMode: 'auto_standard', requestOptions: null, messagesForContext: [], baseSnapshot, isImportMode: false } },
    ];

    mockCurrentJsonTableData = JSON.parse(JSON.stringify(baseSnapshot));
    const result = await applyUnifiedGroupFillResponses_ACU(responses as any, baseSnapshot, { saveTargetIndex: 3, updateMode: 'auto_standard', isImportMode: false });

    expect(result.success).toBe(true);
    const savePayload = mockPersistTablesToChatMessage.mock.calls[0][0];
    expect(savePayload.targetSheetKeys).toEqual(['sheet_0', 'sheet_1']);
    expect(savePayload.tableData.sheet_1.content).toEqual([['row_id', 'value'], ['1', 'tpl-b'], ['2', 'tpl-c']]);
    expect(baseSnapshot.sheet_0.content).toEqual([['row_id', 'value']]);
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });
});

describe('processGroupedRuntimeChunk_ACU', () => {
  beforeEach(async () => {
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    const { disposeStorageProvider } = await import('../../../src/service/table/table-storage-strategy');
    disposeStorageProvider();
    mockCheckIfFirstTimeInit.mockResolvedValue(false);
    vi.mocked(isSqliteMode).mockReturnValue(false);
    vi.clearAllMocks();
    mockSettings = {
      ...mockSettings,
      autoUpdateTokenThreshold: 0,
      updateBatchSize: 2,
      tableMaxRetries: 1,
      tableApiPresetOverridesByName: {},
    };
    mockCurrentJsonTableData = {
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    };
    mockPrepareAIInput.mockResolvedValue({ tableDataText: '模拟数据' });
    mockUpdateReadableLorebookEntry.mockResolvedValue(undefined);
    mockPersistTablesToChatMessage.mockResolvedValue({ saved: true, messageIndex: 3 });
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('sheet_0')) {
        tableData.sheet_0.content.push(['2', '来自A']);
        return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
      }
      if (aiResponse.includes('sheet_1')) {
        tableData.sheet_1.content.push(['2', '来自B']);
        return { success: true, modifiedKeys: ['sheet_1'], appliedEdits: 1 };
      }
      return { success: false, modifiedKeys: [], appliedEdits: 0 };
    });
  });

  it('空分组直接成功且不调用 AI', async () => {
    const result = await processGroupedRuntimeChunk_ACU([], 'manual_independent');
    expect(result).toEqual({ success: true, failedGroups: [] });
    expect(mockPrepareAIInput).not.toHaveBeenCalled();
    expect(mockCallCustomOpenAI).not.toHaveBeenCalled();
  });

  it('同一 bucket 的多组只统一提交一次', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    } as any);
    mockCallCustomOpenAI
      .mockResolvedValueOnce('<tableEdit>sheet_0</tableEdit>')
      .mockResolvedValueOnce('<tableEdit>sheet_1</tableEdit>');

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
      { key: 'group_b', groupId: 1, indices: [1], batchSize: 2, sheetKeys: ['sheet_1'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdateReadableLorebookEntry).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSummaryVectorIndexFlush).toHaveBeenCalledTimes(1);
  });

  it('grouped 手动路径会向 onProgress 转发 AI 调用进度', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
    } as any);
    mockCallCustomOpenAI.mockResolvedValueOnce('<tableEdit>sheet_0</tableEdit>');
    const onProgress = vi.fn();

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
    ], 'manual_independent', { onProgress });

    expect(result.success).toBe(true);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'calling_ai',
      attempt: 1,
      maxRetries: 1,
      currentBatch: 1,
      totalBatches: 1,
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'saving',
      currentBatch: 1,
      totalBatches: 1,
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'complete',
      currentBatch: 1,
      totalBatches: 1,
    }));
  });

  it('连续 bucket 使用运行时快照作为下一次 prompt 基底，不从聊天历史回放', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const chat = [
      { is_user: true, mes: 'u1' },
      { is_user: false, mes: 'a1' },
      { is_user: true, mes: 'u2' },
      { is_user: false, mes: 'a2' },
    ];
    vi.mocked(getChatArray_ACU).mockReturnValue(chat as any);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '纪要表', content: [['row_id', '内容']] },
    } as any);
    const promptBaseRows: any[][][] = [];
    mockPrepareAIInput.mockImplementation(async (_messages: any, _mode: string, _keys: string[] | null, options: any) => {
      promptBaseRows.push(JSON.parse(JSON.stringify(options.tableData.sheet_0.content)));
      return { tableDataText: '模拟数据' };
    });
    mockCallCustomOpenAI
      .mockResolvedValueOnce('<tableEdit>第一层纪要</tableEdit>')
      .mockResolvedValueOnce('<tableEdit>第二层纪要</tableEdit>');
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('第一层纪要')) {
        tableData.sheet_0.content.push(['AM0001', '第一层纪要']);
      } else if (aiResponse.includes('第二层纪要')) {
        tableData.sheet_0.content.push(['AM0002', '第二层纪要']);
      }
      return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
    });
    mockPersistTablesToChatMessage.mockImplementation(async (options: any) => {
      const target = chat[options.targetMessageIndex] as any;
      target.TavernDB_ACU_IsolatedData = {
        '': {
          independentData: JSON.parse(JSON.stringify(options.tableData)),
          modifiedKeys: options.trackingSheetKeys || [],
          updateGroupKeys: options.updateGroupKeys || [],
          _acu_storage_mode: 'checkpoint',
        },
      };
      return { saved: true, messageIndex: options.targetMessageIndex };
    });

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'summary', groupId: 0, indices: [1, 3], batchSize: 1, sheetKeys: ['sheet_0'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(promptBaseRows).toHaveLength(2);
    expect(promptBaseRows[0]).toEqual([['row_id', '值'], ['1', 'base-a']]);
    expect(promptBaseRows[1]).toEqual([['row_id', '值'], ['1', 'base-a'], ['AM0001', '第一层纪要']]);
  });

  it('SQL 模式下不再早退，而是完成 grouped 统一提交', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    const inventoryDDL = `CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);`;
    const questDDL = `CREATE TABLE quest_log (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);`;
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: inventoryDDL }, content: [['row_id', 'value'], ['1', 'base-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
      sheet_1: { uid: 'quest_log', name: '表B', sourceData: { ddl: questDDL }, content: [['row_id', 'value'], ['1', 'base-b']], updateConfig: {}, exportConfig: {}, orderNo: 1 },
    } as any);
    mockCurrentJsonTableData = JSON.parse(JSON.stringify(vi.mocked(parseTableTemplateJson_ACU).getMockImplementation()?.() || {}));
    mockCallCustomOpenAI
      .mockResolvedValueOnce("<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>")
      .mockResolvedValueOnce("<tableEdit>INSERT INTO quest_log VALUES (2, 'sql-b');</tableEdit>");

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
      { key: 'group_b', groupId: 1, indices: [1], batchSize: 2, sheetKeys: ['sheet_1'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(result.failedGroups).toEqual([]);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
    vi.mocked(isSqliteMode).mockReturnValue(false);
  });

  it('前一组失败时不吞掉后续 bucket 的成功写盘', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复1' }, { is_user: true }, { is_user: false, mes: 'AI回复2' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    } as any);
    mockCallCustomOpenAI
      .mockResolvedValueOnce('无效响应')
      .mockResolvedValueOnce('<tableEdit>sheet_1</tableEdit>');

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 1, sheetKeys: ['sheet_0'], requestOptions: null },
      { key: 'group_b', groupId: 1, indices: [3], batchSize: 1, sheetKeys: ['sheet_1'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(false);
    expect(result.failedGroups).toContain('group_a');
    expect(result.failedGroups).not.toContain('group_b');
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
  });

  it('统一提交失败后会把错误反馈注入下一轮 prompt 并重试成功', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
    } as any);
    mockSettings.tableMaxRetries = 2;

    const capturedTableDataTexts: string[] = [];
    mockPrepareAIInput.mockImplementation(async () => ({ tableDataText: '模拟数据' }));
    mockCallCustomOpenAI.mockImplementation(async (dynamicContent: any) => {
      capturedTableDataTexts.push(dynamicContent.tableDataText);
      return '<tableEdit>sheet_0</tableEdit>';
    });

    let parseAttempt = 0;
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      parseAttempt++;
      if (parseAttempt === 1) {
        return { success: false, modifiedKeys: [], appliedEdits: 0 };
      }
      tableData.sheet_0.content.push(['2', '来自A']);
      return { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 };
    });

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(capturedTableDataTexts).toHaveLength(2);
    expect(capturedTableDataTexts[1]).toContain('UNIFIED_GROUP_ERROR_FEEDBACK');
    expect(capturedTableDataTexts[1]).toContain('group group_a 解析或应用失败');
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
  });

  it('统一提交持续失败到耗尽重试时整 bucket 失败且不落盘', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    } as any);
    mockSettings.tableMaxRetries = 2;
    mockCallCustomOpenAI
      .mockResolvedValue('<tableEdit>sheet_0</tableEdit>')
      .mockResolvedValue('<tableEdit>sheet_1</tableEdit>');
    mockParseAndApplyTableEditsToData.mockReturnValue({ success: false, modifiedKeys: [], appliedEdits: 0 });

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
      { key: 'group_b', groupId: 1, indices: [1], batchSize: 2, sheetKeys: ['sheet_1'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(false);
    expect(result.failedGroups).toEqual(expect.arrayContaining(['group_a', 'group_b']));
    expect(result.error).toContain('统一提交在 2 次尝试后仍失败');
    expect(mockPersistTablesToChatMessage).not.toHaveBeenCalled();
    expect(mockCallCustomOpenAI).toHaveBeenCalledTimes(4);
  });

  it('空 tableEdit 视为合法无更新且不重试同 bucket 的其他组', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    } as any);
    mockSettings.tableMaxRetries = 2;
    mockCallCustomOpenAI
      .mockResolvedValueOnce('<tableEdit>   </tableEdit>')
      .mockResolvedValueOnce('<tableEdit>sheet_1</tableEdit>');
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      if (aiResponse.includes('sheet_1')) {
        tableData.sheet_1.content.push(['2', '来自B']);
        return { success: true, modifiedKeys: ['sheet_1'], appliedEdits: 1 };
      }
      return { success: true, modifiedKeys: [], appliedEdits: 0 };
    });

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
      { key: 'group_b', groupId: 1, indices: [1], batchSize: 2, sheetKeys: ['sheet_1'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(result.failedGroups).toEqual([]);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetSheetKeys: ['sheet_1'],
      updateGroupKeys: ['sheet_0', 'sheet_1'],
      trackingSheetKeys: ['sheet_1'],
      targetMessageIndex: 1,
    }));
    expect(mockCallCustomOpenAI).toHaveBeenCalledTimes(2);
  });


  it('首次初始化时 grouped 主路径全量保存但只追踪实质修改表', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    mockCheckIfFirstTimeInit.mockResolvedValue(true);
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    } as any);
    mockSettings.tableMaxRetries = 2;
    mockCallCustomOpenAI.mockResolvedValueOnce('<tableEdit>sheet_0</tableEdit>');
    mockParseAndApplyTableEditsToData.mockImplementation((aiResponse: string, tableData: any) => {
      tableData.sheet_0.content.push(['2', '来自A']);
      return aiResponse.includes('sheet_0')
        ? { success: true, modifiedKeys: ['sheet_0'], appliedEdits: 1 }
        : { success: false, modifiedKeys: [], appliedEdits: 0 };
    });

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 1, sheetKeys: ['sheet_0'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetSheetKeys: ['sheet_0', 'sheet_1'],
      updateGroupKeys: ['sheet_0'],
      trackingSheetKeys: ['sheet_0'],
    }));
  });

  it('非空 tableEdit 未形成实质性操作时仍视为成功但不登记参与表', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu' },
      sheet_0: { name: '表A', content: [['row_id', '值'], ['1', 'base-a']] },
      sheet_1: { name: '表B', content: [['row_id', '值'], ['1', 'base-b']] },
    } as any);
    mockSettings.tableMaxRetries = 2;

    const capturedTableDataTexts: string[] = [];
    mockPrepareAIInput.mockImplementation(async () => ({ tableDataText: '模拟数据' }));
    mockCallCustomOpenAI.mockImplementation(async (dynamicContent: any) => {
      capturedTableDataTexts.push(dynamicContent.tableDataText);
      return dynamicContent.tableDataText.includes('sheet_1') ? '<tableEdit>sheet_1</tableEdit>' : '<tableEdit>sheet_0</tableEdit>';
    });
    mockParseAndApplyTableEditsToData.mockReturnValue({ success: true, modifiedKeys: [], appliedEdits: 0 });

    const result = await processGroupedRuntimeChunk_ACU([
      { key: 'group_a', groupId: 0, indices: [1], batchSize: 2, sheetKeys: ['sheet_0'], requestOptions: null },
      { key: 'group_b', groupId: 1, indices: [1], batchSize: 2, sheetKeys: ['sheet_1'], requestOptions: null },
    ], 'manual_independent');

    expect(result.success).toBe(true);
    expect(result.failedGroups).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(capturedTableDataTexts).toHaveLength(2);
    expect(capturedTableDataTexts[0]).not.toContain('UNIFIED_GROUP_ERROR_FEEDBACK');
    expect(capturedTableDataTexts[1]).not.toContain('UNIFIED_GROUP_ERROR_FEEDBACK');
    expect(mockCallCustomOpenAI).toHaveBeenCalledTimes(2);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetSheetKeys: [],
      updateGroupKeys: ['sheet_0', 'sheet_1'],
      trackingSheetKeys: [],
    }));
  });


  it('manual native 路径走 grouped helper 而不是 legacy processBatch', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(false);
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    mockCallCustomOpenAI.mockResolvedValue('<tableEdit>sheet_0</tableEdit>');

    const legacyProcessBatch = vi.fn().mockResolvedValue({ success: true });
    const refreshData = vi.fn().mockResolvedValue(undefined);
    const result = await orchestrateManualUpdate_ACU(['sheet_0'], legacyProcessBatch, refreshData);

    expect(result.success).toBe(true);
    expect(legacyProcessBatch).not.toHaveBeenCalled();
    expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
  });

  it('manual native 路径在 grouped helper 失败时返回失败且不落盘', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(false);
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    mockSettings.tableMaxRetries = 1;
    mockCallCustomOpenAI.mockResolvedValue('无效响应');

    const refreshData = vi.fn().mockResolvedValue(undefined);
    const result = await orchestrateManualUpdate_ACU(['sheet_0'], vi.fn().mockResolvedValue({ success: true }), refreshData);

    expect(result.success).toBe(false);
    expect(result.error).toContain('填表在 1 次尝试后仍失败');
    expect(mockPersistTablesToChatMessage).not.toHaveBeenCalled();
    expect(refreshData).toHaveBeenCalled();
  });

  it('manual SQL 路径走 grouped unified helper 而不是 legacy processBatch', async () => {
    const { getChatArray_ACU } = await import('../../../src/service/chat/chat-service');
    const { parseTableTemplateJson_ACU } = await import('../../../src/shared/utils');
    const { isSqliteMode } = await import('../../../src/service/table/storage-mode');
    vi.mocked(isSqliteMode).mockReturnValue(true);
    const inventoryDDL = `CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, value TEXT NOT NULL);`;
    vi.mocked(getChatArray_ACU).mockReturnValue([{ is_user: true }, { is_user: false, mes: 'AI回复' }]);
    vi.mocked(parseTableTemplateJson_ACU).mockReturnValue({
      mate: { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } },
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: inventoryDDL }, content: [['row_id', 'value'], ['1', 'base-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any);
    mockCurrentJsonTableData = {
      sheet_0: { uid: 'inventory', name: '表A', sourceData: { ddl: inventoryDDL }, content: [['row_id', 'value'], ['1', 'base-a']], updateConfig: {}, exportConfig: {}, orderNo: 0 },
    } as any;
    mockCallCustomOpenAI.mockResolvedValueOnce("<tableEdit>INSERT INTO inventory VALUES (2, 'sql-a');</tableEdit>");

    const legacyProcessBatch = vi.fn().mockResolvedValue({ success: true });
    const refreshData = vi.fn().mockResolvedValue(undefined);

    try {
      const result = await orchestrateManualUpdate_ACU(['sheet_0'], legacyProcessBatch, refreshData);

      expect(result.success).toBe(true);
      expect(legacyProcessBatch).not.toHaveBeenCalled();
      expect(mockPersistTablesToChatMessage).toHaveBeenCalledTimes(1);
      expect(mockParseAndApplyTableEditsToData).not.toHaveBeenCalled();
      const savedData = mockPersistTablesToChatMessage.mock.calls[0][0].tableData;
      expect(savedData.sheet_0.content).toEqual([['row_id', 'value'], ['1', 'base-a'], ['2', 'sql-a']]);
    } finally {
      vi.mocked(isSqliteMode).mockReturnValue(false);
    }
  });
});
