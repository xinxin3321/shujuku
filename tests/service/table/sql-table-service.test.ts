/**
 * tests/service/table/sql-table-service.test.ts
 * SqlTableService 单元测试
 *
 * 策略：
 * - splitSqlStatements / extractTableNamesFromStatements 是纯函数，直接测试
 * - SqlTableService 类方法需要 mock 外部依赖（state-manager/table-service/helpers-data-merge/name-mapper）
 *   但使用真实 SqliteEngine + SyncBridge 作为后端
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Mock 设置（必须在 import 被测模块之前）
// ═══════════════════════════════════════════════════════════════

// mock log 函数
vi.mock('../../../src/shared/utils', () => ({
  logDebug_ACU: vi.fn(),
  logWarn_ACU: vi.fn(),
  logError_ACU: vi.fn(),
  isSummaryOrOutlineTable_ACU: vi.fn(() => false),
  parseTableTemplateJson_ACU: vi.fn(() => null),
}));

// mock state-manager
let mockCurrentJsonTableData: any = null;
vi.mock('../../../src/service/runtime/state-manager', () => ({
  get currentJsonTableData_ACU() { return mockCurrentJsonTableData; },
  _set_currentJsonTableData_ACU: vi.fn((v: any) => { mockCurrentJsonTableData = v; }),
}));

// mock table-service
const mockSaveIndependentTable = vi.fn().mockResolvedValue({ saved: true, messageIndex: 5 });
vi.mock('../../../src/service/table/table-service', () => ({
  saveIndependentTableToChatHistory_ACU: (...args: any[]) => mockSaveIndependentTable(...args),
}));

// mock helpers-data-merge
const mockMergeAll = vi.fn();
vi.mock('../../../src/service/runtime/helpers-data-merge', () => ({
  mergeAllIndependentTables_ACU: (...args: any[]) => mockMergeAll(...args),
}));

// mock name-mapper
vi.mock('../../../src/service/runtime/template-vars/name-mapper', () => ({
  buildGlobalNameMapper: vi.fn(),
  disposeGlobalNameMapper: vi.fn(),
}));

// 现在 import 被测模块
import {
  SqlTableService,
  splitSqlStatements,
  extractTableNamesFromStatements,
} from '../../../src/service/table/sql-table-service';

// ═══════════════════════════════════════════════════════════════
// 纯函数测试：splitSqlStatements
// ═══════════════════════════════════════════════════════════════
describe('splitSqlStatements', () => {
  it('按分号拆分多条语句', () => {
    const sql = "INSERT INTO t VALUES (1, 'a'); UPDATE t SET x = 1; DELETE FROM t WHERE id = 1;";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("INSERT INTO t VALUES (1, 'a')");
    expect(result[1]).toBe('UPDATE t SET x = 1');
    expect(result[2]).toBe('DELETE FROM t WHERE id = 1');
  });

  it('跳过字符串内的分号（单引号）', () => {
    const sql = "INSERT INTO t VALUES (1, 'hello; world'); INSERT INTO t VALUES (2, 'foo');";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("INSERT INTO t VALUES (1, 'hello; world')");
    expect(result[1]).toBe("INSERT INTO t VALUES (2, 'foo')");
  });

  it('跳过字符串内的分号（双引号）', () => {
    const sql = 'INSERT INTO t VALUES (1, "hello; world"); INSERT INTO t VALUES (2, "foo");';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('INSERT INTO t VALUES (1, "hello; world")');
    expect(result[1]).toBe('INSERT INTO t VALUES (2, "foo")');
  });

  it('处理转义的单引号（SQL 风格 \'\'）', () => {
    const sql = "INSERT INTO t VALUES (1, 'it''s a test'); INSERT INTO t VALUES (2, 'ok');";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("INSERT INTO t VALUES (1, 'it''s a test')");
    expect(result[1]).toBe("INSERT INTO t VALUES (2, 'ok')");
  });

  it('最后一条语句没有分号结尾', () => {
    const sql = 'INSERT INTO t VALUES (1); UPDATE t SET x = 2';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe('UPDATE t SET x = 2');
  });

  it('空字符串返回空数组', () => {
    expect(splitSqlStatements('')).toEqual([]);
  });

  it('纯空白返回空数组', () => {
    expect(splitSqlStatements('   \n\t  ')).toEqual([]);
  });

  it('单条语句无分号', () => {
    const result = splitSqlStatements('SELECT * FROM t');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('SELECT * FROM t');
  });

  it('连续分号产生空语句被过滤', () => {
    const sql = 'INSERT INTO t VALUES (1);;; UPDATE t SET x = 2;;';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });

  it('多行 SQL 语句', () => {
    const sql = `INSERT INTO inventory
      VALUES (1, '铁剑', 3);
    UPDATE inventory
      SET quantity = 5
      WHERE item_name = '铁剑';`;
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('INSERT INTO inventory');
    expect(result[1]).toContain('UPDATE inventory');
  });

  it('字符串中包含转义双引号', () => {
    const sql = 'INSERT INTO t VALUES (1, "he said ""hello"""); INSERT INTO t VALUES (2, "ok");';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 纯函数测试：extractTableNamesFromStatements
// ═══════════════════════════════════════════════════════════════
describe('extractTableNamesFromStatements', () => {
  it('提取 INSERT INTO 的表名', () => {
    const result = extractTableNamesFromStatements(["INSERT INTO inventory VALUES (1, '铁剑', 3)"]);
    expect(result).toEqual(['inventory']);
  });

  it('提取 INSERT OR REPLACE INTO 的表名', () => {
    const result = extractTableNamesFromStatements(["INSERT OR REPLACE INTO inventory VALUES (1, '铁剑', 3)"]);
    expect(result).toEqual(['inventory']);
  });

  it('提取 UPDATE 的表名', () => {
    const result = extractTableNamesFromStatements(["UPDATE inventory SET quantity = 5 WHERE row_id = 1"]);
    expect(result).toEqual(['inventory']);
  });

  it('提取 UPDATE OR IGNORE 的表名', () => {
    const result = extractTableNamesFromStatements(["UPDATE OR IGNORE inventory SET quantity = 5"]);
    expect(result).toEqual(['inventory']);
  });

  it('提取 DELETE FROM 的表名', () => {
    const result = extractTableNamesFromStatements(["DELETE FROM inventory WHERE row_id = 1"]);
    expect(result).toEqual(['inventory']);
  });

  it('提取 ALTER TABLE 的表名', () => {
    const result = extractTableNamesFromStatements(["ALTER TABLE inventory ADD COLUMN description TEXT"]);
    expect(result).toEqual(['inventory']);
  });

  it('多条语句提取多个表名（去重）', () => {
    const result = extractTableNamesFromStatements([
      "INSERT INTO inventory VALUES (1, '铁剑', 3)",
      "UPDATE inventory SET quantity = 5",
      "INSERT INTO characters VALUES (1, '角色A', 25)",
    ]);
    expect(result).toContain('inventory');
    expect(result).toContain('characters');
    expect(result).toHaveLength(2); // inventory 去重
  });

  it('SELECT 语句不提取表名', () => {
    const result = extractTableNamesFromStatements(["SELECT * FROM inventory"]);
    expect(result).toEqual([]);
  });

  it('CREATE TABLE 语句不提取表名', () => {
    const result = extractTableNamesFromStatements(["CREATE TABLE new_table (id INTEGER)"]);
    expect(result).toEqual([]);
  });

  it('空数组返回空数组', () => {
    expect(extractTableNamesFromStatements([])).toEqual([]);
  });

  it('空字符串语句不提取', () => {
    expect(extractTableNamesFromStatements(['', '  '])).toEqual([]);
  });

  it('大小写不敏感', () => {
    const result = extractTableNamesFromStatements(["insert into MyTable values (1)"]);
    expect(result).toEqual(['MyTable']);
  });
});

// ═══════════════════════════════════════════════════════════════
// SqlTableService 类测试
// ═══════════════════════════════════════════════════════════════
describe('SqlTableService', () => {
  let service: SqlTableService;

  // 构造测试用的 TableDataObject
  const TEST_DDL = `CREATE TABLE inventory (
    row_id INTEGER PRIMARY KEY,
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1
  );`;

  const testTableData: any = {
    mate: { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } },
    sheet_0: {
      uid: 'inventory',
      name: '背包物品表',
      sourceData: { note: '', initNode: '', deleteNode: '', updateNode: '', insertNode: '', ddl: TEST_DDL },
      content: [
        ['row_id', 'item_name', 'quantity'],
        ['1', '铁剑', '3'],
        ['2', '治疗药水', '5'],
      ],
      updateConfig: { uiSentinel: 0, contextDepth: 0, updateFrequency: 0, batchSize: 0, skipFloors: 0 },
      exportConfig: {},
      orderNo: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentJsonTableData = null;
    service = new SqlTableService();
  });

  afterAll(() => {
    // 确保清理
    try { service?.dispose(); } catch (_) {}
  });

  // ═══════════════════════════════════════════════════════════════
  // _ensureInitialized（通过公开方法间接测试）
  // ═══════════════════════════════════════════════════════════════
  describe('未初始化时的行为', () => {
    it('applyEdits 未初始化时抛出错误', () => {
      expect(() => service.applyEdits('INSERT INTO t VALUES (1)')).toThrow('SQLite 引擎未初始化');
    });

    it('executeQuery 未初始化时抛出错误', () => {
      expect(() => service.executeQuery('SELECT 1')).toThrow('SQLite 引擎未初始化');
    });

    it('executeMutation 未初始化时抛出错误', () => {
      expect(() => service.executeMutation('INSERT INTO t VALUES (1)')).toThrow('SQLite 引擎未初始化');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // loadFromChat
  // ═══════════════════════════════════════════════════════════════
  describe('loadFromChat', () => {
    it('无数据时返回 empty', async () => {
      mockMergeAll.mockResolvedValue(null);
      const result = await service.loadFromChat();
      expect(result.loaded).toBe(false);
      expect(result.source).toBe('empty');
    });

    it('有数据时成功加载', async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      const result = await service.loadFromChat();
      expect(result.loaded).toBe(true);
      expect(result.source).toBe('merged');
    });

    it('加载后可以执行查询', async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
      const queryResult = service.executeQuery('SELECT * FROM inventory');
      expect(queryResult.rowCount).toBe(2);
      expect(queryResult.columns).toContain('item_name');
    });

    it('加载失败时返回错误信息', async () => {
      mockMergeAll.mockRejectedValue(new Error('网络错误'));
      const result = await service.loadFromChat();
      expect(result.loaded).toBe(false);
      expect(result.error).toContain('网络错误');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // applyEdits
  // ═══════════════════════════════════════════════════════════════
  describe('applyEdits', () => {
    beforeEach(async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
    });

    it('执行单条 INSERT 语句', () => {
      const result = service.applyEdits("INSERT INTO inventory VALUES (3, '魔法书', 1);");
      expect(result.success).toBe(true);
      expect(result.appliedEdits).toBe(1);
      // 验证数据确实插入了
      const query = service.executeQuery('SELECT * FROM inventory WHERE row_id = 3');
      expect(query.rowCount).toBe(1);
    });

    it('执行多条语句', () => {
      const sql = "INSERT INTO inventory VALUES (3, '魔法书', 1); UPDATE inventory SET quantity = 10 WHERE row_id = 1;";
      const result = service.applyEdits(sql);
      expect(result.success).toBe(true);
      expect(result.appliedEdits).toBe(2);
    });

    it('空字符串返回成功（无操作）', () => {
      const result = service.applyEdits('');
      expect(result.success).toBe(true);
      expect(result.appliedEdits).toBe(0);
    });

    it('纯空白返回成功（无操作）', () => {
      const result = service.applyEdits('   \n\t  ');
      expect(result.success).toBe(true);
      expect(result.appliedEdits).toBe(0);
    });

    it('去除 HTML 注释标记', () => {
      const sql = "<!-- INSERT INTO inventory VALUES (3, '魔法书', 1); -->";
      const result = service.applyEdits(sql);
      expect(result.success).toBe(true);
      expect(result.appliedEdits).toBe(1);
    });

    it('SQL 语法错误时抛出异常', () => {
      expect(() => service.applyEdits('INVALID SQL SYNTAX HERE;')).toThrow();
    });

    it('返回受影响的 modifiedKeys', () => {
      // 设置 currentJsonTableData 以便 _tableNamesToSheetKeys 能工作
      mockCurrentJsonTableData = JSON.parse(JSON.stringify(testTableData));
      const result = service.applyEdits("UPDATE inventory SET quantity = 10 WHERE row_id = 1;");
      expect(result.modifiedKeys).toContain('sheet_0');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // executeQuery
  // ═══════════════════════════════════════════════════════════════
  describe('executeQuery', () => {
    beforeEach(async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
    });

    it('执行 SELECT 查询', () => {
      const result = service.executeQuery('SELECT item_name, quantity FROM inventory');
      expect(result.columns).toEqual(['item_name', 'quantity']);
      expect(result.rowCount).toBe(2);
      expect(result.values[0]).toEqual(['铁剑', 3]);
    });

    it('带参数的查询', () => {
      const result = service.executeQuery('SELECT * FROM inventory WHERE item_name = ?', ['铁剑']);
      expect(result.rowCount).toBe(1);
    });

    it('无结果的查询', () => {
      const result = service.executeQuery("SELECT * FROM inventory WHERE item_name = '不存在'");
      expect(result.rowCount).toBe(0);
      expect(result.values).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // executeMutation
  // ═══════════════════════════════════════════════════════════════
  describe('executeMutation', () => {
    beforeEach(async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
    });

    it('执行 INSERT 并返回 changes', () => {
      const result = service.executeMutation("INSERT INTO inventory VALUES (3, '魔法书', 1)");
      expect(result.changes).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('执行 UPDATE 并返回 changes', () => {
      const result = service.executeMutation('UPDATE inventory SET quantity = 10 WHERE row_id = 1');
      expect(result.changes).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('执行 DELETE 并返回 changes', () => {
      const result = service.executeMutation('DELETE FROM inventory WHERE row_id = 1');
      expect(result.changes).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('SQL 错误时返回 errors 而不抛出', () => {
      const result = service.executeMutation('INSERT INTO nonexistent_table VALUES (1)');
      expect(result.changes).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getCurrentData
  // ═══════════════════════════════════════════════════════════════
  describe('getCurrentData', () => {
    it('未初始化时返回 currentJsonTableData_ACU', () => {
      mockCurrentJsonTableData = { test: true };
      const result = service.getCurrentData();
      expect(result).toEqual({ test: true });
    });

    it('初始化后返回导出的数据', async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
      const result = service.getCurrentData();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('sheet_0');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // saveToChat
  // ═══════════════════════════════════════════════════════════════
  describe('saveToChat', () => {
    beforeEach(async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
    });

    it('成功保存到聊天', async () => {
      const result = await service.saveToChat();
      expect(result.saved).toBe(true);
      expect(mockSaveIndependentTable).toHaveBeenCalled();
    });

    it('传递 targetSheetKeys 参数', async () => {
      await service.saveToChat(['sheet_0'], ['group_1']);
      expect(mockSaveIndependentTable).toHaveBeenCalledWith(-1, ['sheet_0'], ['group_1']);
    });

    it('null 参数转为 null', async () => {
      await service.saveToChat(null, null);
      expect(mockSaveIndependentTable).toHaveBeenCalledWith(-1, null, null);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // dispose
  // ═══════════════════════════════════════════════════════════════
  describe('dispose', () => {
    it('销毁后无法执行查询', async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
      service.dispose();
      expect(() => service.executeQuery('SELECT 1')).toThrow();
    });

    it('多次 dispose 不抛出', async () => {
      mockMergeAll.mockResolvedValue(JSON.parse(JSON.stringify(testTableData)));
      await service.loadFromChat();
      service.dispose();
      expect(() => service.dispose()).not.toThrow();
    });
  });
});
