/**
 * tests/service/runtime/helpers-remaining.test.ts
 * 辅助函数集入口文件 单元测试（handleChatCompletionReady_ACU）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockSettings,
  mockCurrentJsonTableData,
  mockLogDebug,
  mockParseRandomTags,
  mockReplaceRandomVariables,
  mockPendingFinalGenerationGreenlightsRef,
  mockSetPendingFinalGenerationGreenlights,
  mockParseCalcTags,
  mockParseMaxTags,
  mockParseMinTags,
  mockReplaceCalcVariables,
  mockReplaceMaxVariables,
  mockReplaceMinVariables,
  mockParseIfBlockRecursive,
  mockGetLatestAIMessageContent,
  mockGetPlotFromHistory,
  mockGetWorldbookContentForPlot,
  mockGetAgentGreenlightWorldbookEntriesForPlot,
} = vi.hoisted(() => {
  const mockPendingFinalGenerationGreenlightsRef = { value: [] as any[] };
  return {
    mockSettings: { promptTemplateSettings: { enabled: true, maxNestingDepth: 10, debugMode: false } } as any,
    mockCurrentJsonTableData: { sheet_0: { name: '表', content: [['row_id']] } } as any,
    mockLogDebug: vi.fn(),
    mockParseRandomTags: vi.fn((s: string) => s),
    mockReplaceRandomVariables: vi.fn((s: string) => s),
    mockPendingFinalGenerationGreenlightsRef,
    mockSetPendingFinalGenerationGreenlights: vi.fn((value: any) => {
      mockPendingFinalGenerationGreenlightsRef.value = Array.isArray(value) ? value : [];
    }),
    mockParseCalcTags: vi.fn((s: string) => s),
    mockParseMaxTags: vi.fn((s: string) => s),
    mockParseMinTags: vi.fn((s: string) => s),
    mockReplaceCalcVariables: vi.fn((s: string) => s),
    mockReplaceMaxVariables: vi.fn((s: string) => s),
    mockReplaceMinVariables: vi.fn((s: string) => s),
    mockParseIfBlockRecursive: vi.fn((s: string) => s),
    mockGetLatestAIMessageContent: vi.fn(() => ''),
    mockGetPlotFromHistory: vi.fn(() => null),
    mockGetWorldbookContentForPlot: vi.fn(),
    mockGetAgentGreenlightWorldbookEntriesForPlot: vi.fn(),
  };
});

vi.mock('../../../src/service/runtime/state-manager', () => ({
  get settings_ACU() { return mockSettings; },
  get currentJsonTableData_ACU() { return mockCurrentJsonTableData; },
  get pendingFinalGenerationGreenlights_ACU() { return mockPendingFinalGenerationGreenlightsRef.value; },
  _set_pendingFinalGenerationGreenlights_ACU: mockSetPendingFinalGenerationGreenlights,
}));

vi.mock('../../../src/shared/utils', () => ({
  logDebug_ACU: mockLogDebug,
}));

vi.mock('../../../src/service/runtime/template-vars', () => ({
  parseRandomTags_ACU: mockParseRandomTags,
  replaceRandomVariables_ACU: mockReplaceRandomVariables,
  parseCalcTags_ACU: mockParseCalcTags,
  parseMaxTags_ACU: mockParseMaxTags,
  parseMinTags_ACU: mockParseMinTags,
  replaceCalcVariables_ACU: mockReplaceCalcVariables,
  replaceMaxVariables_ACU: mockReplaceMaxVariables,
  replaceMinVariables_ACU: mockReplaceMinVariables,
  parseIfBlockRecursive_ACU: mockParseIfBlockRecursive,
  parseIfBlocksInContent_ACU: vi.fn(),
  getLatestAIMessageContent_ACU: mockGetLatestAIMessageContent,
  replaceDbSqlVariables: vi.fn((s: string) => s),
}));

vi.mock('../../../src/service/runtime/plot-runtime', () => ({
  formatOutlineTableForPlot_ACU: vi.fn(),
  formatSummaryIndexForPlot_ACU: vi.fn(),
  loadPresetAndCleanCharacterData_ACU: vi.fn(),
  getPlotFromHistory_ACU: mockGetPlotFromHistory,
  runOptimizationLogic_ACU: vi.fn(),
  getWorldbookContentForPlot_ACU: mockGetWorldbookContentForPlot,
  getAgentGreenlightWorldbookEntriesForPlot_ACU: mockGetAgentGreenlightWorldbookEntriesForPlot,
}));

vi.mock('../../../src/service/runtime/helpers-context-tags', () => ({
  getDefaultPlotContextExtractRules_ACU: vi.fn(),
  getDefaultPlotContextExcludeRules_ACU: vi.fn(),
  applyExcludeRulesToText_ACU: vi.fn(),
  applyContextTagFilters_ACU: vi.fn(),
}));

vi.mock('../../../src/service/runtime/helpers-table-lock', () => ({
  getTableLocksForSheet_ACU: vi.fn(),
  saveTableLocksForSheet_ACU: vi.fn(),
  toggleRowLock_ACU: vi.fn(),
  toggleColLock_ACU: vi.fn(),
  toggleCellLock_ACU: vi.fn(),
  isSpecialIndexLockEnabled_ACU: vi.fn(),
  setSpecialIndexLockEnabled_ACU: vi.fn(),
  getSummaryIndexColumnIndex_ACU: vi.fn(),
  formatSummaryIndexCode_ACU: vi.fn(),
  applySummaryIndexSequenceToTable_ACU: vi.fn(),
  applySpecialIndexSequenceToSummaryTables_ACU: vi.fn(),
}));

vi.mock('../../../src/service/runtime/helpers-data-merge', () => ({
  mergeAllIndependentTables_ACU: vi.fn(),
  formatJsonToReadable_ACU: vi.fn(),
  shouldSuppressWorldbookInjection_ACU: vi.fn(),
  maybeLiftWorldbookSuppression_ACU: vi.fn(),
  fillFirstLayerWithTemplateData_ACU: vi.fn(),
  getEffectiveAutoUpdateThreshold_ACU: vi.fn(),
  isNewChatGreetingStage_ACU: vi.fn(),
  isSingleAiNoUserChat_ACU: vi.fn(),
  buildTemplateBaseStateDataForLocalStorage_ACU: vi.fn(),
  seedGreetingLocalDataFromTemplate_ACU: vi.fn(),
  parseReadableToJson_ACU: vi.fn(),
  GREETING_LOCAL_BASE_STATE_MARKER_ACU: '__GREETING_LOCAL_BASE_STATE__',
}));

import { handleChatCompletionReady_ACU } from '../../../src/service/runtime/helpers-remaining';

beforeEach(() => {
  vi.clearAllMocks();
  mockParseRandomTags.mockImplementation((s: string) => s);
  mockReplaceRandomVariables.mockImplementation((s: string) => s);
  mockParseCalcTags.mockImplementation((s: string) => s);
  mockParseMaxTags.mockImplementation((s: string) => s);
  mockParseMinTags.mockImplementation((s: string) => s);
  mockReplaceCalcVariables.mockImplementation((s: string) => s);
  mockReplaceMaxVariables.mockImplementation((s: string) => s);
  mockReplaceMinVariables.mockImplementation((s: string) => s);
  mockParseIfBlockRecursive.mockImplementation((s: string) => s);
  mockGetPlotFromHistory.mockReturnValue(null);
  mockSettings.promptTemplateSettings = { enabled: true, maxNestingDepth: 10, debugMode: false };
  mockPendingFinalGenerationGreenlightsRef.value = [];
  mockGetWorldbookContentForPlot.mockResolvedValue('');
  mockGetAgentGreenlightWorldbookEntriesForPlot.mockResolvedValue([]);
});

describe('handleChatCompletionReady_ACU', () => {
  it('功能未启用时跳过处理', async () => {
    mockSettings.promptTemplateSettings = { enabled: false };
    const data = { messages: [{ content: '{{random}}' }] };
    await handleChatCompletionReady_ACU(data);
    expect(mockParseRandomTags).not.toHaveBeenCalled();
  });

  it('settings 为 null 时跳过处理', async () => {
    mockSettings.promptTemplateSettings = null;
    const data = { messages: [{ content: '{{random}}' }] };
    await handleChatCompletionReady_ACU(data);
    expect(mockParseRandomTags).not.toHaveBeenCalled();
  });

  it('data 为 null 时跳过处理', async () => {
    await handleChatCompletionReady_ACU(null);
    expect(mockParseRandomTags).not.toHaveBeenCalled();
  });

  it('data.messages 不是数组时跳过处理', async () => {
    await handleChatCompletionReady_ACU({ messages: 'not array' });
    expect(mockParseRandomTags).not.toHaveBeenCalled();
  });

  it('处理字符串类型的 message.content', async () => {
    mockParseRandomTags.mockReturnValue('processed');
    mockReplaceRandomVariables.mockReturnValue('processed');
    mockParseCalcTags.mockReturnValue('processed');
    mockParseMaxTags.mockReturnValue('processed');
    mockParseMinTags.mockReturnValue('processed');
    mockReplaceCalcVariables.mockReturnValue('processed');
    mockReplaceMaxVariables.mockReturnValue('processed');
    mockReplaceMinVariables.mockReturnValue('processed');
    mockParseIfBlockRecursive.mockReturnValue('processed');

    const data = { messages: [{ content: '原始内容' }] };
    await handleChatCompletionReady_ACU(data);

    expect(mockParseRandomTags).toHaveBeenCalledWith('原始内容');
    expect(data.messages[0].content).toBe('processed');
  });

  it('处理数组类型的 message.content（多模态）', async () => {
    mockParseRandomTags.mockReturnValue('processed');
    mockReplaceRandomVariables.mockReturnValue('processed');
    mockParseCalcTags.mockReturnValue('processed');
    mockParseMaxTags.mockReturnValue('processed');
    mockParseMinTags.mockReturnValue('processed');
    mockReplaceCalcVariables.mockReturnValue('processed');
    mockReplaceMaxVariables.mockReturnValue('processed');
    mockReplaceMinVariables.mockReturnValue('processed');
    mockParseIfBlockRecursive.mockReturnValue('processed');

    const data = {
      messages: [{
        content: [
          { type: 'text', text: '原始文本' },
          { type: 'image_url', image_url: 'http://img.png' },
        ],
      }],
    };
    await handleChatCompletionReady_ACU(data);

    expect(mockParseRandomTags).toHaveBeenCalledWith('原始文本');
    expect(data.messages[0].content[0].text).toBe('processed');
    // image_url 部分不应被处理
    expect(data.messages[0].content[1].image_url).toBe('http://img.png');
  });

  it('content 不是字符串也不是数组时不处理', async () => {
    const data = { messages: [{ content: 123 }] };
    await handleChatCompletionReady_ACU(data);
    expect(mockParseRandomTags).not.toHaveBeenCalled();
  });

  it('空字符串 content 不调用处理函数', async () => {
    const data = { messages: [{ content: '' }] };
    await handleChatCompletionReady_ACU(data);
    expect(mockParseRandomTags).not.toHaveBeenCalled();
  });

  it('多条消息都被处理', async () => {
    mockParseRandomTags.mockImplementation((s: string) => s + '_r');
    mockReplaceRandomVariables.mockImplementation((s: string) => s);
    mockParseCalcTags.mockImplementation((s: string) => s);
    mockParseMaxTags.mockImplementation((s: string) => s);
    mockParseMinTags.mockImplementation((s: string) => s);
    mockReplaceCalcVariables.mockImplementation((s: string) => s);
    mockReplaceMaxVariables.mockImplementation((s: string) => s);
    mockReplaceMinVariables.mockImplementation((s: string) => s);
    mockParseIfBlockRecursive.mockImplementation((s: string) => s);

    const data = {
      messages: [
        { content: '消息1' },
        { content: '消息2' },
        { content: '消息3' },
      ],
    };
    await handleChatCompletionReady_ACU(data);

    expect(mockParseRandomTags).toHaveBeenCalledTimes(3);
    expect(data.messages[0].content).toBe('消息1_r');
    expect(data.messages[1].content).toBe('消息2_r');
    expect(data.messages[2].content).toBe('消息3_r');
  });

  it('getPlotFromHistory_ACU 被调用获取剧情数据', async () => {
    mockGetPlotFromHistory.mockReturnValue('剧情内容');
    const data = { messages: [{ content: '测试' }] };
    // 让处理函数返回不同值以触发 processedCount
    mockParseRandomTags.mockReturnValue('changed');
    mockReplaceRandomVariables.mockReturnValue('changed');
    mockParseCalcTags.mockReturnValue('changed');
    mockParseMaxTags.mockReturnValue('changed');
    mockParseMinTags.mockReturnValue('changed');
    mockReplaceCalcVariables.mockReturnValue('changed');
    mockReplaceMaxVariables.mockReturnValue('changed');
    mockReplaceMinVariables.mockReturnValue('changed');
    mockParseIfBlockRecursive.mockReturnValue('changed');

    await handleChatCompletionReady_ACU(data);
    expect(mockGetPlotFromHistory).toHaveBeenCalled();
  });

  it('内存正文绿灯存在时按运行时过滤注入正文世界书内容', async () => {
    const pendingGreenlights = [{ bookName: '角色A世界书', uid: 1, reason: '正文需要' }];
    mockPendingFinalGenerationGreenlightsRef.value = pendingGreenlights;
    mockGetAgentGreenlightWorldbookEntriesForPlot.mockResolvedValue([
      {
        bookName: '角色A世界书',
        uid: 1,
        comment: '深度2条目',
        content: '正文世界书内容',
        depth: 2,
        role: 'system',
        order: 10,
      },
    ]);

    const data = {
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'assistant', content: '上一条回复' },
        { role: 'user', content: '测试' },
      ],
    };
    await handleChatCompletionReady_ACU(data);

    expect(mockGetAgentGreenlightWorldbookEntriesForPlot).toHaveBeenCalledWith(
      {},
      pendingGreenlights,
    );
    expect(mockSetPendingFinalGenerationGreenlights).not.toHaveBeenCalled();
    expect(data.messages).toEqual([
      { role: 'system', content: '系统提示' },
      { role: 'assistant', content: '上一条回复' },
      { role: 'system', content: '正文世界书内容', injected: true },
      { role: 'user', content: '测试' },
    ]);
  });

  it('正文绿灯条目按 depth 分层注入且不会把内容追加到消息末尾', async () => {
    mockPendingFinalGenerationGreenlightsRef.value = [{ bookName: '世界书', uid: 'a' }];
    mockGetAgentGreenlightWorldbookEntriesForPlot.mockResolvedValue([
      { comment: '深度1', content: '一层内容', depth: 1, role: 'system', order: 1 },
      { comment: '深度3', content: '三层内容', depth: 3, role: 'system', order: 2 },
    ]);

    const data = {
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'assistant', content: '较早回复' },
        { role: 'user', content: '较早输入' },
        { role: 'assistant', content: '上一条回复' },
        { role: 'user', content: '当前输入' },
      ],
    };

    await handleChatCompletionReady_ACU(data);

    expect(data.messages.map(message => message.content)).toEqual([
      '系统提示',
      '一层内容',
      '较早回复',
      '较早输入',
      '三层内容',
      '上一条回复',
      '当前输入',
    ]);
    const depth1Index = data.messages.findIndex(message => message.content === '一层内容');
    const depth3Index = data.messages.findIndex(message => message.content === '三层内容');
    expect(depth1Index).toBe(1);
    expect(depth3Index).toBe(4);
    expect(data.messages[data.messages.length - 1].content).toBe('当前输入');
  });

  it('正文绿灯条目 depth 缺失、为 0 或非法时不会追加到消息末尾', async () => {
    mockPendingFinalGenerationGreenlightsRef.value = [{ bookName: '世界书', uid: 'fallback-depth' }];
    mockGetAgentGreenlightWorldbookEntriesForPlot.mockResolvedValue([
      { comment: '缺失depth', content: '缺失内容', role: 'system' },
      { comment: '零depth', content: '零内容', depth: 0, role: 'system' },
      { comment: '非法depth', content: '非法内容', depth: 'abc', role: 'system' },
    ]);

    const data = {
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'assistant', content: '上一条回复' },
        { role: 'user', content: '当前输入' },
      ],
    };

    await handleChatCompletionReady_ACU(data);

    expect(data.messages.map(message => message.content)).toEqual([
      '系统提示',
      '缺失内容\n\n零内容\n\n非法内容',
      '上一条回复',
      '当前输入',
    ]);
    expect(data.messages[1].content).toBe('缺失内容\n\n零内容\n\n非法内容');
  });

  it('同 depth 和 role 的正文绿灯条目按 order 升序合并', async () => {
    mockPendingFinalGenerationGreenlightsRef.value = [{ bookName: '世界书', uid: 'ordered' }];
    mockGetAgentGreenlightWorldbookEntriesForPlot.mockResolvedValue([
      { comment: '后置', content: '第二段', depth: 1, role: 'system', order: 20 },
      { comment: '前置', content: '第一段', depth: 1, role: 'system', order: 10 },
    ]);

    const data = {
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'assistant', content: '上一条回复' },
        { role: 'user', content: '当前输入' },
      ],
    };

    await handleChatCompletionReady_ACU(data);

    expect(data.messages.map(message => message.content)).toEqual([
      '系统提示',
      '第一段\n\n第二段',
      '上一条回复',
      '当前输入',
    ]);
  });

  it('处理管线按正确顺序执行', async () => {
    const callOrder: string[] = [];
    mockParseRandomTags.mockImplementation((s: string) => { callOrder.push('parseRandom'); return s; });
    mockReplaceRandomVariables.mockImplementation((s: string) => { callOrder.push('replaceRandom'); return s; });
    mockParseCalcTags.mockImplementation((s: string) => { callOrder.push('parseCalc'); return s; });
    mockParseMaxTags.mockImplementation((s: string) => { callOrder.push('parseMax'); return s; });
    mockParseMinTags.mockImplementation((s: string) => { callOrder.push('parseMin'); return s; });
    mockReplaceCalcVariables.mockImplementation((s: string) => { callOrder.push('replaceCalc'); return s; });
    mockReplaceMaxVariables.mockImplementation((s: string) => { callOrder.push('replaceMax'); return s; });
    mockReplaceMinVariables.mockImplementation((s: string) => { callOrder.push('replaceMin'); return s; });
    mockParseIfBlockRecursive.mockImplementation((s: string) => { callOrder.push('parseIf'); return s; });

    const data = { messages: [{ content: '测试内容' }] };
    await handleChatCompletionReady_ACU(data);

    expect(callOrder).toEqual([
      'parseRandom', 'replaceRandom',
      'parseCalc', 'parseMax', 'parseMin',
      'replaceCalc', 'replaceMax', 'replaceMin',
      'parseIf',
    ]);
  });
});
