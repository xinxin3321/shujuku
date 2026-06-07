/**
 * tests/data/repositories/chat-message-data-repo.test.ts
 * 消息级表格数据 CRUD 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/shared/json-helpers', () => ({
  safeJsonParse_ACU: (json: string, fallback: any) => { try { return JSON.parse(json); } catch { return fallback; } },
  safeJsonStringify_ACU: (obj: any, fallback: string) => { try { return JSON.stringify(obj); } catch { return fallback; } },
}));

import {
  readIsolatedTagData_ACU,
  readLegacyIndependentData_ACU,
  readLegacyStandardData_ACU,
  readLegacySummaryData_ACU,
  readMessageIdentity_ACU,
  readModifiedKeys_ACU,
  readUpdateGroupKeys_ACU,
  isLegacyMatchForIsolation_ACU,
  writeIsolatedTagData_ACU,
  initIsolatedTagSlot_ACU,
  writeLegacyCompatData_ACU,
  writeLegacyStandardAndSummary_ACU,
  writeMessageIdentity_ACU,
  purgeSheetKeysFromMessage_ACU,
  clearAllTableFields_ACU,
  hasAnyTableData_ACU,
  cloneIsolatedData_ACU,
} from '../../../src/data/repositories/chat-message-data-repo';

// ═══ 读取类 ═══

describe('readIsolatedTagData_ACU', () => {
  it('msg 为 null 返回 null', () => {
    expect(readIsolatedTagData_ACU(null, 'tag1')).toBeNull();
  });

  it('无 IsolatedData 字段返回 null', () => {
    expect(readIsolatedTagData_ACU({}, 'tag1')).toBeNull();
  });

  it('IsolatedData 为 JSON 字符串时正确解析', () => {
    const tagData = { independentData: { sheet_0: { name: '表' } }, modifiedKeys: ['sheet_0'] };
    const msg = { TavernDB_ACU_IsolatedData: JSON.stringify({ tag1: tagData }) };
    const result = readIsolatedTagData_ACU(msg, 'tag1');
    expect(result).not.toBeNull();
    expect(result!.independentData).toBeDefined();
    expect(result!.modifiedKeys).toEqual(['sheet_0']);
  });

  it('IsolatedData 为对象时直接读取', () => {
    const tagData = { independentData: { sheet_0: { name: '表' } } };
    const msg = { TavernDB_ACU_IsolatedData: { tag1: tagData } };
    const result = readIsolatedTagData_ACU(msg, 'tag1');
    expect(result).not.toBeNull();
    expect(result!.independentData.sheet_0.name).toBe('表');
  });

  it('tagKey 不存在返回 null', () => {
    const msg = { TavernDB_ACU_IsolatedData: { tag1: { independentData: {} } } };
    expect(readIsolatedTagData_ACU(msg, 'nonexistent')).toBeNull();
  });

  it('IsolatedData 为数组返回 null', () => {
    const msg = { TavernDB_ACU_IsolatedData: [1, 2, 3] };
    expect(readIsolatedTagData_ACU(msg, 'tag1')).toBeNull();
  });

  it('IsolatedData 为无效 JSON 字符串返回 null', () => {
    const msg = { TavernDB_ACU_IsolatedData: 'not valid json' };
    expect(readIsolatedTagData_ACU(msg, 'tag1')).toBeNull();
  });
});

describe('readLegacyIndependentData_ACU', () => {
  it('msg 为 null 返回 null', () => {
    expect(readLegacyIndependentData_ACU(null)).toBeNull();
  });

  it('无字段返回 null', () => {
    expect(readLegacyIndependentData_ACU({})).toBeNull();
  });

  it('有效对象返回数据', () => {
    const data = { sheet_0: { name: '表', content: [['row_id']] } };
    expect(readLegacyIndependentData_ACU({ TavernDB_ACU_IndependentData: data })).toBe(data);
  });

  it('数组返回 null', () => {
    expect(readLegacyIndependentData_ACU({ TavernDB_ACU_IndependentData: [] })).toBeNull();
  });
});

describe('readLegacyStandardData_ACU', () => {
  it('有效对象返回数据', () => {
    const data = { sheet_0: { name: '标准表' } };
    expect(readLegacyStandardData_ACU({ TavernDB_ACU_Data: data })).toBe(data);
  });

  it('null msg 返回 null', () => {
    expect(readLegacyStandardData_ACU(null)).toBeNull();
  });
});

describe('readLegacySummaryData_ACU', () => {
  it('有效对象返回数据', () => {
    const data = { sheet_0: { name: '摘要表' } };
    expect(readLegacySummaryData_ACU({ TavernDB_ACU_SummaryData: data })).toBe(data);
  });

  it('null msg 返回 null', () => {
    expect(readLegacySummaryData_ACU(null)).toBeNull();
  });
});

describe('readMessageIdentity_ACU', () => {
  it('有 Identity 返回值', () => {
    expect(readMessageIdentity_ACU({ TavernDB_ACU_Identity: 'code_1' })).toBe('code_1');
  });

  it('无 Identity 返回 undefined', () => {
    expect(readMessageIdentity_ACU({})).toBeUndefined();
  });

  it('null msg 返回 undefined', () => {
    expect(readMessageIdentity_ACU(null)).toBeUndefined();
  });
});

describe('readModifiedKeys_ACU', () => {
  it('有数组返回数组', () => {
    expect(readModifiedKeys_ACU({ TavernDB_ACU_ModifiedKeys: ['sheet_0', 'sheet_1'] })).toEqual(['sheet_0', 'sheet_1']);
  });

  it('无字段返回空数组', () => {
    expect(readModifiedKeys_ACU({})).toEqual([]);
  });

  it('非数组返回空数组', () => {
    expect(readModifiedKeys_ACU({ TavernDB_ACU_ModifiedKeys: 'not_array' })).toEqual([]);
  });
});

describe('readUpdateGroupKeys_ACU', () => {
  it('有数组返回数组', () => {
    expect(readUpdateGroupKeys_ACU({ TavernDB_ACU_UpdateGroupKeys: ['sheet_0'] })).toEqual(['sheet_0']);
  });

  it('无字段返回空数组', () => {
    expect(readUpdateGroupKeys_ACU({})).toEqual([]);
  });
});

describe('isLegacyMatchForIsolation_ACU', () => {
  it('隔离开启 + Identity 匹配 → true', () => {
    const msg = { TavernDB_ACU_Identity: 'code_1' };
    expect(isLegacyMatchForIsolation_ACU(msg, { enabled: true, code: 'code_1' })).toBe(true);
  });

  it('隔离开启 + Identity 不匹配 → false', () => {
    const msg = { TavernDB_ACU_Identity: 'code_2' };
    expect(isLegacyMatchForIsolation_ACU(msg, { enabled: true, code: 'code_1' })).toBe(false);
  });

  it('隔离关闭 + 无 Identity → true', () => {
    expect(isLegacyMatchForIsolation_ACU({}, { enabled: false, code: '' })).toBe(true);
  });

  it('隔离关闭 + 有 Identity → false', () => {
    const msg = { TavernDB_ACU_Identity: 'code_1' };
    expect(isLegacyMatchForIsolation_ACU(msg, { enabled: false, code: '' })).toBe(false);
  });
});

// ═══ 写入类 ═══

describe('writeIsolatedTagData_ACU', () => {
  it('null msg 不抛错', () => {
    expect(() => writeIsolatedTagData_ACU(null, 'tag1', { independentData: {} } as any)).not.toThrow();
  });

  it('无 IsolatedData 时自动创建容器', () => {
    const msg: any = {};
    writeIsolatedTagData_ACU(msg, 'tag1', { independentData: { sheet_0: {} } } as any);
    expect(msg.TavernDB_ACU_IsolatedData).toBeDefined();
    expect(msg.TavernDB_ACU_IsolatedData.tag1.independentData.sheet_0).toBeDefined();
  });

  it('已有 IsolatedData 时追加标签', () => {
    const msg: any = { TavernDB_ACU_IsolatedData: { existing: {} } };
    writeIsolatedTagData_ACU(msg, 'tag1', { independentData: {} } as any);
    expect(msg.TavernDB_ACU_IsolatedData.existing).toBeDefined();
    expect(msg.TavernDB_ACU_IsolatedData.tag1).toBeDefined();
  });
});

describe('initIsolatedTagSlot_ACU', () => {
  it('无容器时创建并返回空槽', () => {
    const msg: any = {};
    const slot = initIsolatedTagSlot_ACU(msg, 'tag1');
    expect(slot.independentData).toEqual({});
    expect(slot.modifiedKeys).toEqual([]);
    expect(slot.updateGroupKeys).toEqual([]);
  });

  it('已有槽时不覆盖', () => {
    const existing = { independentData: { sheet_0: { name: '表' } }, modifiedKeys: ['sheet_0'], updateGroupKeys: [] };
    const msg: any = { TavernDB_ACU_IsolatedData: { tag1: existing } };
    const slot = initIsolatedTagSlot_ACU(msg, 'tag1');
    expect(slot.independentData.sheet_0.name).toBe('表');
  });
});

describe('writeLegacyCompatData_ACU', () => {
  it('null msg 不抛错', () => {
    expect(() => writeLegacyCompatData_ACU(null, {}, [], [], { legacyConfirmed: true })).not.toThrow();
  });

  it('未显式确认 legacy-v1 时不写入', () => {
    const msg: any = {};
    const indep = { sheet_0: { name: '表' } } as any;
    writeLegacyCompatData_ACU(msg, indep, ['sheet_0'], ['sheet_0'], {} as any);
    expect(msg.TavernDB_ACU_IndependentData).toBeUndefined();
  });

  it('写入三个旧版字段', () => {
    const msg: any = {};
    const indep = { sheet_0: { name: '表' } } as any;
    writeLegacyCompatData_ACU(msg, indep, ['sheet_0'], ['sheet_0'], { legacyConfirmed: true });
    expect(msg.TavernDB_ACU_IndependentData).toBe(indep);
    expect(msg.TavernDB_ACU_ModifiedKeys).toEqual(['sheet_0']);
    expect(msg.TavernDB_ACU_UpdateGroupKeys).toEqual(['sheet_0']);
  });
});

describe('writeLegacyStandardAndSummary_ACU', () => {
  it('null msg 不抛错', () => {
    expect(() => writeLegacyStandardAndSummary_ACU(null, null, null, { legacyConfirmed: true })).not.toThrow();
  });

  it('未显式确认 legacy-v1 时不写入', () => {
    const msg: any = {};
    const std = { sheet_0: { name: '标准表' } } as any;
    writeLegacyStandardAndSummary_ACU(msg, std, null, {} as any);
    expect(msg.TavernDB_ACU_Data).toBeUndefined();
  });

  it('有 sheet_ 键时写入', () => {
    const msg: any = {};
    const std = { sheet_0: { name: '标准表' } } as any;
    const sum = { sheet_1: { name: '摘要表' } } as any;
    writeLegacyStandardAndSummary_ACU(msg, std, sum, { legacyConfirmed: true });
    expect(msg.TavernDB_ACU_Data).toBe(std);
    expect(msg.TavernDB_ACU_SummaryData).toBe(sum);
  });

  it('无 sheet_ 键时不写入', () => {
    const msg: any = {};
    writeLegacyStandardAndSummary_ACU(msg, { noSheet: true } as any, null, { legacyConfirmed: true });
    expect(msg.TavernDB_ACU_Data).toBeUndefined();
  });
});

describe('writeMessageIdentity_ACU', () => {
  it('隔离启用时设置 Identity', () => {
    const msg: any = {};
    writeMessageIdentity_ACU(msg, { enabled: true, code: 'code_1' });
    expect(msg.TavernDB_ACU_Identity).toBe('code_1');
  });

  it('隔离关闭时删除 Identity', () => {
    const msg: any = { TavernDB_ACU_Identity: 'old_code' };
    writeMessageIdentity_ACU(msg, { enabled: false, code: '' });
    expect(msg.TavernDB_ACU_Identity).toBeUndefined();
  });

  it('null msg 不抛错', () => {
    expect(() => writeMessageIdentity_ACU(null, { enabled: true, code: 'x' })).not.toThrow();
  });
});

// ═══ 删除类 ═══

describe('purgeSheetKeysFromMessage_ACU', () => {
  it('null msg 返回 false', () => {
    expect(purgeSheetKeysFromMessage_ACU(null, ['sheet_0'])).toBe(false);
  });

  it('空 sheetKeys 返回 false', () => {
    expect(purgeSheetKeysFromMessage_ACU({}, [])).toBe(false);
  });

  it('从新版 IsolatedData 中删除 sheet', () => {
    const msg: any = {
      TavernDB_ACU_IsolatedData: {
        tag1: {
          independentData: { sheet_0: { name: '表0' }, sheet_1: { name: '表1' } },
          modifiedKeys: ['sheet_0', 'sheet_1'],
          updateGroupKeys: ['sheet_0'],
        },
      },
    };
    const result = purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(result).toBe(true);
    const tagData = msg.TavernDB_ACU_IsolatedData.tag1;
    expect(tagData.independentData.sheet_0).toBeUndefined();
    expect(tagData.independentData.sheet_1).toBeDefined();
    expect(tagData.modifiedKeys).toEqual(['sheet_1']);
    expect(tagData.updateGroupKeys).toEqual([]);
  });

  it('从旧版 IndependentData 中删除 sheet', () => {
    const msg: any = {
      TavernDB_ACU_IndependentData: { sheet_0: { name: '表0' }, sheet_1: { name: '表1' } },
    };
    const result = purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(result).toBe(true);
    expect(msg.TavernDB_ACU_IndependentData.sheet_0).toBeUndefined();
    expect(msg.TavernDB_ACU_IndependentData.sheet_1).toBeDefined();
  });

  it('旧版 IndependentData 删除后无 sheet 键且无非 sheet 键时删除字段', () => {
    const msg: any = {
      TavernDB_ACU_IndependentData: { sheet_0: { name: '表0' } },
    };
    purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(msg.TavernDB_ACU_IndependentData).toBeUndefined();
  });

  it('从旧版 ModifiedKeys/UpdateGroupKeys 中移除', () => {
    const msg: any = {
      TavernDB_ACU_ModifiedKeys: ['sheet_0', 'sheet_1'],
      TavernDB_ACU_UpdateGroupKeys: ['sheet_0'],
    };
    purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(msg.TavernDB_ACU_ModifiedKeys).toEqual(['sheet_1']);
    expect(msg.TavernDB_ACU_UpdateGroupKeys).toEqual([]);
  });

  it('从旧版 Data 中删除 sheet', () => {
    const msg: any = {
      TavernDB_ACU_Data: { sheet_0: { name: '标准表' }, sheet_1: { name: '标准表1' } },
    };
    purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(msg.TavernDB_ACU_Data.sheet_0).toBeUndefined();
    expect(msg.TavernDB_ACU_Data.sheet_1).toBeDefined();
  });

  it('从旧版 SummaryData 中删除 sheet', () => {
    const msg: any = {
      TavernDB_ACU_SummaryData: { sheet_0: { name: '摘要表' } },
    };
    purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(msg.TavernDB_ACU_SummaryData).toBeUndefined();
  });

  it('新版+旧版混合数据全部清理', () => {
    const msg: any = {
      TavernDB_ACU_IsolatedData: {
        tag1: {
          independentData: { sheet_0: { name: '新版表' } },
          modifiedKeys: ['sheet_0'],
          updateGroupKeys: [],
        },
      },
      TavernDB_ACU_IndependentData: { sheet_0: { name: '旧版独立表' } },
      TavernDB_ACU_Data: { sheet_0: { name: '旧版标准表' } },
      TavernDB_ACU_SummaryData: { sheet_0: { name: '旧版摘要表' } },
      TavernDB_ACU_ModifiedKeys: ['sheet_0'],
      TavernDB_ACU_UpdateGroupKeys: ['sheet_0'],
    };
    const result = purgeSheetKeysFromMessage_ACU(msg, ['sheet_0']);
    expect(result).toBe(true);
    expect(msg.TavernDB_ACU_IsolatedData.tag1.independentData.sheet_0).toBeUndefined();
    expect(msg.TavernDB_ACU_IndependentData).toBeUndefined();
    expect(msg.TavernDB_ACU_Data).toBeUndefined();
    expect(msg.TavernDB_ACU_SummaryData).toBeUndefined();
    expect(msg.TavernDB_ACU_ModifiedKeys).toEqual([]);
    expect(msg.TavernDB_ACU_UpdateGroupKeys).toEqual([]);
  });
});

describe('clearAllTableFields_ACU', () => {
  it('null msg 不抛错', () => {
    expect(() => clearAllTableFields_ACU(null)).not.toThrow();
  });

  it('清除所有 TavernDB_ACU_* 字段', () => {
    const msg: any = {
      TavernDB_ACU_IsolatedData: { tag1: {} },
      TavernDB_ACU_IndependentData: { sheet_0: {} },
      TavernDB_ACU_Data: { sheet_0: {} },
      TavernDB_ACU_SummaryData: { sheet_0: {} },
      TavernDB_ACU_Identity: 'code_1',
      TavernDB_ACU_ModifiedKeys: ['sheet_0'],
      TavernDB_ACU_UpdateGroupKeys: ['sheet_0'],
      _acu_local_template_base_state_seeded: true,
      otherField: '保留',
    };
    clearAllTableFields_ACU(msg);
    expect(msg.TavernDB_ACU_IsolatedData).toBeUndefined();
    expect(msg.TavernDB_ACU_IndependentData).toBeUndefined();
    expect(msg.TavernDB_ACU_Data).toBeUndefined();
    expect(msg.TavernDB_ACU_SummaryData).toBeUndefined();
    expect(msg.TavernDB_ACU_Identity).toBeUndefined();
    expect(msg.TavernDB_ACU_ModifiedKeys).toBeUndefined();
    expect(msg.TavernDB_ACU_UpdateGroupKeys).toBeUndefined();
    expect(msg._acu_local_template_base_state_seeded).toBeUndefined();
    // 非 ACU 字段保留
    expect(msg.otherField).toBe('保留');
  });
});

// ═══ 辅助类 ═══

describe('hasAnyTableData_ACU', () => {
  it('null msg 返回 false', () => {
    expect(hasAnyTableData_ACU(null)).toBe(false);
  });

  it('指定 isolationKey 检查新版数据', () => {
    const msg = {
      TavernDB_ACU_IsolatedData: {
        tag1: { independentData: { sheet_0: { name: '表' } } },
      },
    };
    expect(hasAnyTableData_ACU(msg, 'tag1')).toBe(true);
    expect(hasAnyTableData_ACU(msg, 'tag2')).toBe(false);
  });

  it('不指定 isolationKey 检查容器是否有内容', () => {
    const msg = { TavernDB_ACU_IsolatedData: { tag1: {} } };
    expect(hasAnyTableData_ACU(msg)).toBe(true);
  });

  it('有旧版 IndependentData 返回 true', () => {
    const msg = { TavernDB_ACU_IndependentData: { sheet_0: {} } };
    expect(hasAnyTableData_ACU(msg)).toBe(true);
  });

  it('有旧版 Data 返回 true', () => {
    const msg = { TavernDB_ACU_Data: { sheet_0: {} } };
    expect(hasAnyTableData_ACU(msg)).toBe(true);
  });

  it('有旧版 SummaryData 返回 true', () => {
    const msg = { TavernDB_ACU_SummaryData: { sheet_0: {} } };
    expect(hasAnyTableData_ACU(msg)).toBe(true);
  });

  it('有 isolationConfig 且不匹配时跳过旧版检查', () => {
    const msg = {
      TavernDB_ACU_Identity: 'code_2',
      TavernDB_ACU_IndependentData: { sheet_0: {} },
    };
    expect(hasAnyTableData_ACU(msg, undefined, { enabled: true, code: 'code_1' })).toBe(false);
  });

  it('空 msg 无任何数据返回 false', () => {
    expect(hasAnyTableData_ACU({})).toBe(false);
  });
});

describe('cloneIsolatedData_ACU', () => {
  it('无 IsolatedData 返回空对象', () => {
    expect(cloneIsolatedData_ACU({})).toEqual({});
  });

  it('有 IsolatedData 返回深拷贝', () => {
    const original = { tag1: { independentData: { sheet_0: { name: '表' } } } };
    const msg = { TavernDB_ACU_IsolatedData: original };
    const cloned = cloneIsolatedData_ACU(msg);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.tag1).not.toBe(original.tag1);
  });

  it('IsolatedData 为 JSON 字符串时正确解析并深拷贝', () => {
    const data = { tag1: { independentData: {} } };
    const msg = { TavernDB_ACU_IsolatedData: JSON.stringify(data) };
    const cloned = cloneIsolatedData_ACU(msg);
    expect(cloned).toEqual(data);
  });
});