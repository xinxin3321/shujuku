/**
 * tests/integration/table-lifecycle.test.ts
 * I1+I2 集成测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logWarn_ACU } from '../../src/shared/utils';

const { mockChat, mockSettings, mockCurrentJsonTableDataRef } = vi.hoisted(() => ({
  mockChat: [] as any[],
  mockSettings: { dataIsolationEnabled: false, dataIsolationCode: '' } as any,
  mockCurrentJsonTableDataRef: { value: null as any },
}));

vi.mock('../../src/data/gateways/chat-gateway', () => ({
  getChatArray_ACU: vi.fn(() => mockChat),
  saveChatToHost_ACU: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/shared/utils', () => ({
  isSummaryOrOutlineTable_ACU: vi.fn((n: string) => n.includes('\u7eaa\u8981')),
  logDebug_ACU: vi.fn(), logError_ACU: vi.fn(), logWarn_ACU: vi.fn(),
  parseTableTemplateJson_ACU: vi.fn(() => ({
    sheet_0: { name: 'T', content: [['row_id', 'A', 'B']], sourceData: {} },
  })),
}));
vi.mock('../../src/service/runtime/state-manager', () => ({
  get currentJsonTableData_ACU() { return mockCurrentJsonTableDataRef.value; },
  currentChatFileIdentifier_ACU: 'test-chat',
  getCurrentIsolationKey_ACU: vi.fn(() => ''),
  settings_ACU: mockSettings,
  _set_currentJsonTableData_ACU: vi.fn((v: any) => { mockCurrentJsonTableDataRef.value = v; }),
}));
vi.mock('../../src/service/settings/settings-service', () => ({
  applyTemplateScopeForCurrentChat_ACU: vi.fn(),
}));
vi.mock('../../src/service/template/chat-scope', () => ({
  attachSeedRowsToCurrentDataFromGuide_ACU: vi.fn(),
  buildChatSheetGuideDataFromData_ACU: vi.fn(() => ({ sheet_0: { headers: ['A'] } })),
  ensureChatSheetGuideSeeded_ACU: vi.fn().mockResolvedValue(null),
  getChatSheetGuideDataForIsolationKey_ACU: vi.fn(() => null),
  getSortedSheetKeys_ACU: vi.fn((d: any) => d ? Object.keys(d).filter((k: string) => k.startsWith('sheet_')).sort() : []),
  ensureStableRowIdsForSheetContent_ACU: vi.fn((content: any) => {
    if (!Array.isArray(content) || content.length === 0) return [];
    const header = Array.isArray(content[0]) ? [...content[0]] : ['row_id'];
    const rows = content.slice(1).map((row: any) => Array.isArray(row) ? [...row] : []);
    const used = new Set<string>();
    let nextId = 1;
    return [header, ...rows.map((row: any) => {
      let value = row[0] == null ? '' : String(row[0]).trim();
      if (!value || used.has(value)) {
        while (used.has(String(nextId))) nextId += 1;
        value = String(nextId++);
      }
      used.add(value);
      row[0] = value;
      return row;
    })];
  }),
  sanitizeSheetForStorage_ACU: vi.fn((s: any) => JSON.parse(JSON.stringify(s))),
  setChatSheetGuideDataForIsolationKey_ACU: vi.fn(),
}));
vi.mock('../../src/service/worldbook/pipeline', () => ({
  deleteAllGeneratedEntries_ACU: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/service/runtime/helpers-remaining', () => ({
  mergeAllIndependentTables_ACU: vi.fn(async () => {
    for (let i = mockChat.length - 1; i >= 0; i--) {
      const m = mockChat[i];
      if (m.is_user) continue;
      const iso = m.TavernDB_ACU_IsolatedData;
      if (iso && iso[''] && iso[''].independentData) return JSON.parse(JSON.stringify(iso[''].independentData));
    }
    return null;
  }),
}));
vi.mock('../../src/shared/json-helpers', () => ({
  safeJsonParse_ACU: (j: string, f: any) => { try { return JSON.parse(j); } catch { return f; } },
  safeJsonStringify_ACU: (o: any, f: string) => { try { return JSON.stringify(o); } catch { return f; } },
}));
vi.mock('../../src/shared/env', () => ({ topLevelWindow_ACU: {} }));

import { saveIndependentTableToChatHistory_ACU, loadOrCreateJsonTableFromChatHistory_ACU } from '../../src/service/table/table-service';
import { getCurrentIsolationKey_ACU } from '../../src/service/runtime/state-manager';
import { buildTableDelta_ACU, applyTableDelta_ACU, isDeltaTagData_ACU, isCheckpointTagData_ACU } from '../../src/service/table/table-delta';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentIsolationKey_ACU).mockReturnValue('');
  mockChat.length = 0;
  mockCurrentJsonTableDataRef.value = null;
  mockSettings.dataIsolationEnabled = false;
  mockSettings.dataIsolationCode = '';
});

describe('I1: 表格数据完整生命周期', () => {
  it('空聊天 → 初始化 → 保存 → 重新加载 → 数据一致', async () => {
    const r1 = await loadOrCreateJsonTableFromChatHistory_ACU();
    expect(r1.loaded).toBe(true);
    expect(r1.source).toBe('initialized');
    expect(mockCurrentJsonTableDataRef.value).not.toBeNull();
    mockChat.push({ is_user: false, mes: 'AI回复' });
    mockCurrentJsonTableDataRef.value.sheet_0.content.push(['1', '铁剑', '3']);
    const sr = await saveIndependentTableToChatHistory_ACU();
    expect(sr.saved).toBe(true);
    expect(mockChat[0].TavernDB_ACU_IsolatedData[''].independentData.sheet_0).toBeDefined();
    mockCurrentJsonTableDataRef.value = null;
    const r2 = await loadOrCreateJsonTableFromChatHistory_ACU();
    expect(r2.loaded).toBe(true);
    expect(r2.source).toBe('merged');
    expect(mockCurrentJsonTableDataRef.value.sheet_0.content).toContainEqual(['1', '铁剑', '3']);
  });

  it('多次保存后数据不丢失', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_0: { name: 'T', content: [['row_id', 'A'], ['1', '铁剑']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    mockCurrentJsonTableDataRef.value.sheet_0.content.push(['2', '药水']);
    await saveIndependentTableToChatHistory_ACU();
    const sd = mockChat[0].TavernDB_ACU_IsolatedData[''].independentData.sheet_0;
    expect(sd.content).toHaveLength(3);
    expect(sd.content[2]).toEqual(['2', '药水']);
  });

  it('隔离模式下数据按标签隔离', async () => {
    mockSettings.dataIsolationEnabled = true;
    mockSettings.dataIsolationCode = 'tag_A';
    vi.mocked(getCurrentIsolationKey_ACU).mockReturnValue('tag_A');
    mockChat.push({ is_user: false, mes: 'AI回复' });
    mockCurrentJsonTableDataRef.value = { sheet_0: { name: 'T', content: [['row_id', 'A'], ['1', '铁剑']] } };
    await saveIndependentTableToChatHistory_ACU();
    expect(mockChat[0].TavernDB_ACU_IsolatedData['tag_A']).toBeDefined();
    expect(mockChat[0].TavernDB_ACU_IsolatedData['tag_A'].independentData.sheet_0).toBeDefined();
  });
});

describe('I2: 增量存储端到端链路', () => {
  it('首次保存 → checkpoint 模式确认', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_0: { name: 'T', content: [['row_id', 'A', 'B'], ['r1', '铁剑', '3']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    const tagData = mockChat[0].TavernDB_ACU_IsolatedData[''];
    expect(tagData._acu_storage_mode).toBe('checkpoint');
    expect(tagData._acu_storage_version).toBe(1);
    expect(tagData.independentData.sheet_0).toBeDefined();
    expect(tagData.independentData.sheet_0.content).toContainEqual(['r1', '铁剑', '3']);
    expect(tagData.incrementalData).toBeUndefined();
    expect(isCheckpointTagData_ACU(tagData)).toBe(true);
    expect(isDeltaTagData_ACU(tagData)).toBe(false);
  });

  it('第二次保存（有 checkpoint base）→ delta 模式确认', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_0: { name: 'T', content: [['row_id', 'A', 'B'], ['r1', '铁剑', '3']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    mockChat.push({ is_user: true, mes: '用户' });
    mockChat.push({ is_user: false, mes: 'AI回复2' });
    mockCurrentJsonTableDataRef.value = {
      sheet_0: { name: 'T', content: [['row_id', 'A', 'B'], ['r1', '铁剑', '3'], ['r2', '药水', '5']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    const td2 = mockChat[2].TavernDB_ACU_IsolatedData[''];
    expect(td2._acu_storage_mode).toBe('delta');
    expect(td2._acu_storage_version).toBe(1);
    expect(Object.keys(td2.independentData).filter((k: string) => k.startsWith('sheet_'))).toHaveLength(0);
    expect(td2.incrementalData).toBeDefined();
    expect(td2.incrementalData.sheet_0).toBeDefined();
    expect(td2.incrementalData.sheet_0.rowDeltas.length).toBeGreaterThan(0);
    const ud = td2.incrementalData.sheet_0.rowDeltas.find((d: any) => d.row_id === 'r2' && d.op === 'upsert');
    expect(ud).toBeDefined();
    expect(ud.cells).toEqual(['r2', '药水', '5']);
    expect(isDeltaTagData_ACU(td2)).toBe(true);
    expect(isCheckpointTagData_ACU(td2)).toBe(false);
  });

  it('同一楼层多组分批保存时合并 incrementalData，不丢失先写入的表', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '旧A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] },
    };
    await saveIndependentTableToChatHistory_ACU();

    mockChat.push({ is_user: true, mes: '用户' });
    mockChat.push({ is_user: false, mes: 'AI回复2' });

    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '新A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] },
    };
    await saveIndependentTableToChatHistory_ACU(2, ['sheet_a'], ['sheet_a'], false, ['sheet_a']);

    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '新A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '新B']] },
    };
    await saveIndependentTableToChatHistory_ACU(2, ['sheet_b'], ['sheet_b'], false, ['sheet_b']);

    const td2 = mockChat[2].TavernDB_ACU_IsolatedData[''];
    expect(td2._acu_storage_mode).toBe('delta');
    expect(Object.keys(td2.independentData).filter((k: string) => k.startsWith('sheet_'))).toHaveLength(0);
    expect(td2.incrementalData.sheet_a).toBeDefined();
    expect(td2.incrementalData.sheet_b).toBeDefined();
    expect(td2.modifiedKeys.sort()).toEqual(['sheet_a', 'sheet_b']);
    expect(td2.updateGroupKeys.sort()).toEqual(['sheet_a', 'sheet_b']);

    const sheetADelta = td2.incrementalData.sheet_a.rowDeltas.find((d: any) => d.row_id === 'a1');
    const sheetBDelta = td2.incrementalData.sheet_b.rowDeltas.find((d: any) => d.row_id === 'b1');
    expect(sheetADelta?.cells).toEqual(['a1', '新A']);
    expect(sheetBDelta?.cells).toEqual(['b1', '新B']);

    const rebuiltA = applyTableDelta_ACU(mockChat[0].TavernDB_ACU_IsolatedData[''].independentData.sheet_a, td2.incrementalData.sheet_a, 'sheet_a');
    const rebuiltB = applyTableDelta_ACU(mockChat[0].TavernDB_ACU_IsolatedData[''].independentData.sheet_b, td2.incrementalData.sheet_b, 'sheet_b');
    expect(rebuiltA.content).toEqual([['row_id', 'A'], ['a1', '新A']]);
    expect(rebuiltB.content).toEqual([['row_id', 'B'], ['b1', '新B']]);
  });

  it('同一楼层后续分组在 row_id 稳定化后仍走 delta，且不丢失先写入的表', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '旧A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] },
    };
    await saveIndependentTableToChatHistory_ACU();

    mockChat.push({ is_user: true, mes: '用户' });
    mockChat.push({ is_user: false, mes: 'AI回复2' });

    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '新A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] },
    };
    await saveIndependentTableToChatHistory_ACU(2, ['sheet_a'], ['sheet_a'], false, ['sheet_a']);
    expect(mockChat[2].TavernDB_ACU_IsolatedData['']._acu_storage_mode).toBe('delta');

    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '新A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['', '坏行1'], ['', '坏行2']] },
    };
    await saveIndependentTableToChatHistory_ACU(2, ['sheet_b'], ['sheet_b'], false, ['sheet_b']);

    const td2 = mockChat[2].TavernDB_ACU_IsolatedData[''];
    expect(td2._acu_storage_mode).toBe('delta');
    expect(td2.independentData).toEqual({});
    expect(td2.incrementalData.sheet_b).toBeDefined();
    const rebuiltSheetB = applyTableDelta_ACU(
      { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] } as any,
      td2.incrementalData.sheet_b,
      'sheet_b',
    );
    expect(rebuiltSheetB.content).toEqual([['row_id', 'B'], ['1', '坏行1'], ['2', '坏行2']]);
    const rebuiltSheetA = applyTableDelta_ACU(
      { name: '表A', content: [['row_id', 'A'], ['a1', '新A']] } as any,
      td2.incrementalData.sheet_a,
      'sheet_a',
    );
    expect(rebuiltSheetA.content).toEqual([['row_id', 'A'], ['a1', '新A']]);
    expect(td2.modifiedKeys.sort()).toEqual(['sheet_a', 'sheet_b']);
    expect(td2.updateGroupKeys.sort()).toEqual(['sheet_a', 'sheet_b']);
  });

  it('旧脏 base 在同一 saveTargetIndex 多次保存时会先被稳定化，不再打印 base_no_stable_row_id', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['a1', '旧A']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    mockChat[0].TavernDB_ACU_IsolatedData[''].independentData.sheet_a.content = [['row_id', 'A'], ['', '旧A1'], ['', '旧A2']];

    mockChat.push({ is_user: true, mes: '用户' });
    mockChat.push({ is_user: false, mes: 'AI回复2' });

    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['1', '新A1'], ['2', '新A2']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '旧B']] },
    };
    await saveIndependentTableToChatHistory_ACU(2, ['sheet_a'], ['sheet_a'], false, ['sheet_a']);

    mockCurrentJsonTableDataRef.value = {
      sheet_a: { name: '表A', content: [['row_id', 'A'], ['1', '新A1'], ['2', '新A2']] },
      sheet_b: { name: '表B', content: [['row_id', 'B'], ['b1', '新B']] },
    };
    await saveIndependentTableToChatHistory_ACU(2, ['sheet_b'], ['sheet_b'], false, ['sheet_b']);

    const td2 = mockChat[2].TavernDB_ACU_IsolatedData[''];
    expect(td2._acu_storage_mode).toBe('delta');
    expect(td2.incrementalData.sheet_a).toBeDefined();
    expect(td2.incrementalData.sheet_b).toBeDefined();
    const rebuiltA = applyTableDelta_ACU({ name: '表A', content: [['row_id', 'A'], ['1', '旧A1'], ['2', '旧A2']] } as any, td2.incrementalData.sheet_a, 'sheet_a');
    expect(rebuiltA.content).toEqual([['row_id', 'A'], ['1', '新A1'], ['2', '新A2']]);
    const baseWarnings = vi.mocked(logWarn_ACU).mock.calls.filter(call => String(call[0]).includes('base 缺少稳定 row_id'));
    expect(baseWarnings).toHaveLength(0);
  });

  it('delta 模式保留本轮 tracking metadata，即使纪要表未产生增量', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_summary: { name: '纪要表', content: [['row_id', '内容'], ['s1', '旧纪要']] },
      sheet_data: { name: '数据表', content: [['row_id', '值'], ['d1', '旧数据']] },
    };
    await saveIndependentTableToChatHistory_ACU();

    mockChat.push({ is_user: true, mes: '用户' });
    mockChat.push({ is_user: false, mes: 'AI回复2' });

    mockCurrentJsonTableDataRef.value = {
      sheet_summary: { name: '纪要表', content: [['row_id', '内容'], ['s1', '旧纪要']] },
      sheet_data: { name: '数据表', content: [['row_id', '值'], ['d1', '新数据']] },
    };
    await saveIndependentTableToChatHistory_ACU(
      2,
      ['sheet_summary', 'sheet_data'],
      ['sheet_summary', 'sheet_data'],
      false,
      ['sheet_summary', 'sheet_data'],
    );

    const td2 = mockChat[2].TavernDB_ACU_IsolatedData[''];
    expect(td2._acu_storage_mode).toBe('delta');
    expect(td2.incrementalData.sheet_data).toBeDefined();
    expect(td2.incrementalData.sheet_summary).toBeUndefined();
    expect(td2.modifiedKeys).toEqual(['sheet_summary', 'sheet_data']);
    expect(td2.updateGroupKeys).toEqual(['sheet_summary', 'sheet_data']);
  });

  it('buildTableDelta + applyTableDelta 往返一致性', () => {
    const base = { name: 'T', content: [['row_id', 'A', 'B'], ['r1', '铁剑', '3'], ['r2', '药水', '5']] } as any;
    const next = { name: 'T', content: [['row_id', 'A', 'B'], ['r1', '铁剑', '10'], ['r3', '盾牌', '1']] } as any;
    const res = buildTableDelta_ACU(base, next, 'sheet_0');
    expect(res.degraded).toBe(false);
    expect(res.delta).toBeDefined();
    const rebuilt = applyTableDelta_ACU(base, res.delta!, 'sheet_0');
    expect(rebuilt.content).toEqual(next.content);
  });

  it('row_id 缺失时会在落盘前稳定化，因此仍可写成 delta', async () => {
    mockChat.push({ is_user: false, mes: 'AI回复1' });
    mockCurrentJsonTableDataRef.value = {
      sheet_0: { name: 'T', content: [['row_id', 'A'], ['r1', '铁剑']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    mockChat.push({ is_user: true, mes: '用户' });
    mockChat.push({ is_user: false, mes: 'AI回复2' });
    mockCurrentJsonTableDataRef.value = {
      sheet_0: { name: 'T', content: [['row_id', 'A'], ['', '铁剑'], ['', '药水']] },
    };
    await saveIndependentTableToChatHistory_ACU();
    const td2 = mockChat[2].TavernDB_ACU_IsolatedData[''];
    expect(td2._acu_storage_mode).toBe('delta');
    expect(td2.independentData).toEqual({});
    expect(td2.incrementalData.sheet_0).toBeDefined();
    const rebuilt = applyTableDelta_ACU(
      { name: 'T', content: [['row_id', 'A'], ['r1', '铁剑']] } as any,
      td2.incrementalData.sheet_0,
      'sheet_0',
    );
    expect(rebuilt.content).toEqual([['row_id', 'A'], ['1', '铁剑'], ['2', '药水']]);
    expect(isDeltaTagData_ACU(td2)).toBe(true);
  });

  it('旧版数据（无 _acu_storage_mode 标记）兼容性确认', () => {
    const legacy = {
      independentData: { sheet_0: { name: 'T', content: [['row_id', 'A'], ['r1', '铁剑']] } },
      modifiedKeys: ['sheet_0'],
      updateGroupKeys: [],
    } as any;
    expect(isCheckpointTagData_ACU(legacy)).toBe(true);
    expect(isDeltaTagData_ACU(legacy)).toBe(false);
    const legacyExplicit = { ...legacy, _acu_storage_mode: 'legacy' };
    expect(isCheckpointTagData_ACU(legacyExplicit)).toBe(true);
    expect(isDeltaTagData_ACU(legacyExplicit)).toBe(false);
  });
});