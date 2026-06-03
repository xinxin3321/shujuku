/**
 * tests/service/ai/prompt-prepare.test.ts
 * formatTableForSqliteMode 纯函数单元测试
 *
 * 策略：mock getEffectiveSeedRowsForSheet_ACU，直接测试格式化输出
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Mock 设置
// ═══════════════════════════════════════════════════════════════

const mockGetEffectiveSeedRows = vi.fn(() => []);
const mockEnsureChatSheetGuideSeeded = vi.fn().mockResolvedValue(null);
const mockAttachSeedRows = vi.fn();
let mockCurrentJsonTableData: any = null;
let mockSettings: any = {};

vi.mock('../../../src/service/template/chat-scope', () => ({
  getEffectiveSeedRowsForSheet_ACU: (...args: any[]) => mockGetEffectiveSeedRows(...args),
  ensureChatSheetGuideSeeded_ACU: (...args: any[]) => mockEnsureChatSheetGuideSeeded(...args),
  attachSeedRowsToCurrentDataFromGuide_ACU: (...args: any[]) => mockAttachSeedRows(...args),
  getSortedSheetKeys_ACU: vi.fn((data: any) => data ? Object.keys(data).filter((k: string) => k.startsWith('sheet_')) : []),
}));

vi.mock('../../../src/shared/utils', () => ({
  logDebug_ACU: vi.fn(),
  logWarn_ACU: vi.fn(),
  logError_ACU: vi.fn(),
  isSummaryOrOutlineTable_ACU: vi.fn(() => false),
  normalizeExtractRules_ACU: vi.fn(() => []),
  normalizeExcludeRules_ACU: vi.fn(() => []),
}));

vi.mock('../../../src/service/runtime/state-manager', () => ({
  get manualExtraHint_ACU() { return ''; },
  get currentJsonTableData_ACU() { return mockCurrentJsonTableData; },
  get settings_ACU() { return mockSettings; },
}));

vi.mock('../../../src/data/gateways/host-state-gateway', () => ({
  getUserName_ACU: vi.fn(() => '用户'),
}));

vi.mock('../../../src/service/worldbook/pipeline', () => ({
  getCombinedWorldbookContent_ACU: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../src/service/runtime/helpers-remaining', () => ({
  applyContextTagFilters_ACU: vi.fn((c: string) => c),
}));

vi.mock('../../../src/service/table/storage-mode', () => ({
  isSqliteMode: vi.fn(() => true),
}));

import { formatTableForSqliteMode, prepareAIInput_ACU } from '../../../src/service/ai/prompt-builder/prompt-prepare';

describe('formatTableForSqliteMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectiveSeedRows.mockReturnValue([]);
    mockEnsureChatSheetGuideSeeded.mockResolvedValue(null);
    mockAttachSeedRows.mockReset();
    mockCurrentJsonTableData = null;
    mockSettings = {
      tableContextExtractTags: '',
      tableContextExcludeTags: '',
      tableContextExtractRules: '',
      tableContextExcludeRules: '',
    };
  });

  // ═══════════════════════════════════════════════════════════════
  // DDL 输出
  // ═══════════════════════════════════════════════════════════════
  it('输出 DDL', () => {
    const table = {
      name: '背包物品表',
      sourceData: {
        ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, item_name TEXT, quantity INTEGER);',
        note: '',
        insertNode: '',
        updateNode: '',
        deleteNode: '',
      },
      content: [['row_id', 'item_name', 'quantity'], ['1', '铁剑', '3']],
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('CREATE TABLE inventory');
  });

  // ═══════════════════════════════════════════════════════════════
  // Note 和 Trigger 注释
  // ═══════════════════════════════════════════════════════════════
  it('输出 Note 注释', () => {
    const table = {
      name: '背包物品表',
      sourceData: {
        ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY);',
        note: '记录角色背包中的物品',
        insertNode: '',
        updateNode: '',
        deleteNode: '',
      },
      content: [['row_id'], ['1']],
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('-- Note: 记录角色背包中的物品');
  });

  it('输出 INSERT/UPDATE/DELETE Trigger 注释', () => {
    const table = {
      name: '背包物品表',
      sourceData: {
        ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY);',
        note: '',
        insertNode: '获得新物品时插入',
        updateNode: '物品数量变化时更新',
        deleteNode: '丢弃物品时删除',
      },
      content: [['row_id'], ['1']],
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('-- INSERT: 获得新物品时插入');
    expect(result).toContain('-- UPDATE: 物品数量变化时更新');
    expect(result).toContain('-- DELETE: 丢弃物品时删除');
  });

  // ═══════════════════════════════════════════════════════════════
  // 数据输出
  // ═══════════════════════════════════════════════════════════════
  it('输出当前数据（注释格式的表格）', () => {
    const table = {
      name: '背包物品表',
      sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, item_name TEXT);' },
      content: [['row_id', 'item_name'], ['1', '铁剑'], ['2', '药水']],
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('-- 当前数据 (2 rows)');
    expect(result).toContain('-- | row_id | item_name |');
    expect(result).toContain('-- | 1 | 铁剑 |');
    expect(result).toContain('-- | 2 | 药水 |');
  });

  // ═══════════════════════════════════════════════════════════════
  // 空表
  // ═══════════════════════════════════════════════════════════════
  it('空表输出初始化提示', () => {
    const table = {
      name: '背包物品表',
      sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY);' },
      content: [['row_id']],
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('该表格为空，请进行初始化');
  });

  // ═══════════════════════════════════════════════════════════════
  // seedRows
  // ═══════════════════════════════════════════════════════════════
  it('使用 seedRows 时输出提示', () => {
    mockGetEffectiveSeedRows.mockReturnValue([['1', '铁剑'], ['2', '药水']]);
    const table = {
      name: '背包物品表',
      sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, item_name TEXT);' },
      content: [['row_id', 'item_name']], // 无数据行
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('SeedRows');
    expect(result).toContain('-- 当前数据 (2 rows)');
  });

  // ═══════════════════════════════════════════════════════════════
  // 行数限制
  // ═══════════════════════════════════════════════════════════════
  it('总结表超过10行时只显示最后10行', () => {
    const rows: any[][] = [['row_id', 'content']];
    for (let i = 1; i <= 15; i++) {
      rows.push([String(i), `内容${i}`]);
    }
    const table = {
      name: '总结表',
      sourceData: { ddl: 'CREATE TABLE summary (row_id INTEGER PRIMARY KEY, content TEXT);' },
      content: rows,
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('Showing last 10 of 15');
  });

  it('sendLatestRows 限制行数', () => {
    const rows: any[][] = [['row_id', 'item']];
    for (let i = 1; i <= 20; i++) {
      rows.push([String(i), `物品${i}`]);
    }
    const table = {
      name: '背包物品表',
      sourceData: { ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, item TEXT);' },
      content: rows,
      updateConfig: { sendLatestRows: 5 },
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('Showing last 5 of 20');
  });

  // ═══════════════════════════════════════════════════════════════
  // 多行 Note
  // ═══════════════════════════════════════════════════════════════
  it('多行 Note 正确转为注释', () => {
    const table = {
      name: '背包物品表',
      sourceData: {
        ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY);',
        note: '第一行说明\n第二行说明',
      },
      content: [['row_id'], ['1']],
      updateConfig: {},
    };
    const result = formatTableForSqliteMode(table, 0, 'sheet_0', null);
    expect(result).toContain('-- Note: 第一行说明\n-- 第二行说明');
  });
});

describe('prepareAIInput_ACU — 显式 tableData 模式', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectiveSeedRows.mockReturnValue([]);
    mockEnsureChatSheetGuideSeeded.mockResolvedValue(null);
    mockAttachSeedRows.mockReset();
    mockCurrentJsonTableData = null;
    mockSettings = {
      tableContextExtractTags: '',
      tableContextExcludeTags: '',
      tableContextExtractRules: '',
      tableContextExcludeRules: '',
    };
  });

  it('传入显式 tableData 时优先使用显式数据而不是全局数据', async () => {
    mockCurrentJsonTableData = {
      sheet_0: {
        name: '全局表',
        content: [['row_id', 'name'], ['1', '全局值']],
        updateConfig: {},
      },
    };
    const explicitTableData = {
      sheet_0: {
        uid: 'sheet_0',
        name: '显式表',
        content: [['row_id', 'name'], ['1', '显式值']],
        updateConfig: {},
      },
    };

    const result = await prepareAIInput_ACU([], 'standard', null, { tableData: explicitTableData });
    expect(result).not.toBeNull();
    expect(result!.tableDataText).toContain('[0:显式表]');
    expect(result!.tableDataText).toContain('显式值');
    expect(result!.tableDataText).not.toContain('全局表');
    expect(result!.tableDataText).not.toContain('全局值');
  });

  it('传入显式 tableData 且存在 guideData 时不调用全局 attach helper，且不污染原始显式对象', async () => {
    mockCurrentJsonTableData = {
      sheet_0: {
        uid: 'sheet_0',
        name: '全局表',
        content: [['row_id', 'name']],
        updateConfig: {},
      },
    };
    const explicitTableData = {
      sheet_0: {
        uid: 'sheet_0',
        name: '显式表',
        content: [['row_id', 'name']],
        updateConfig: {},
      },
    };
    mockEnsureChatSheetGuideSeeded.mockResolvedValue({ sheet_0: { seedRows: [['1', '模板值']] } });

    await prepareAIInput_ACU([], 'standard', null, { tableData: explicitTableData });

    expect(mockAttachSeedRows).not.toHaveBeenCalled();
    expect(explicitTableData.sheet_0.seedRows).toBeUndefined();
    expect(mockCurrentJsonTableData.sheet_0.seedRows).toBeUndefined();
  });
});
