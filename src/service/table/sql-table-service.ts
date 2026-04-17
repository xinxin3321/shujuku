/**
 * service/table/sql-table-service.ts — SQLite 模式的 ITableStorageProvider 实现
 *
 * 核心职责：
 * - 管理 SqliteEngine 和 SyncBridge 的生命周期
 * - 将 AI 返回的 SQL 语句路由到引擎执行
 * - 维护 currentJsonTableData_ACU 的同步
 * - 提供 SQL 查询和变更的入口
 */

import type {
  ITableStorageProvider,
  SqlQueryResult,
  SqlMutationResult,
  ApplyEditsResult,
} from '../../shared/table-storage-provider';
import type { TableDataObject_ACU, Mate_ACU } from '../../shared/models/table-data';
import { SqliteEngine } from '../../data/sqlite/sqlite-engine';
import { SyncBridge } from '../../data/sqlite/sync-bridge';
import {
  saveIndependentTableToChatHistory_ACU,
} from './table-service';
import {
  currentJsonTableData_ACU,
  _set_currentJsonTableData_ACU,
} from '../runtime/state-manager';
import { mergeAllIndependentTables_ACU } from '../runtime/helpers-data-merge';
import { logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { buildGlobalNameMapper, disposeGlobalNameMapper } from '../runtime/template-vars/name-mapper';
import { parseDDLTableName } from '../../data/sqlite/schema-mapper';

export class SqlTableService implements ITableStorageProvider {
  readonly mode = 'sqlite' as const;
  private engine: SqliteEngine;
  private syncBridge: SyncBridge;
  private _initialized = false;

  constructor() {
    this.engine = new SqliteEngine();
    this.syncBridge = new SyncBridge(this.engine);
  }

  /**
   * 从聊天消息加载表格数据到 SQLite
   * 1. mergeAllIndependentTables_ACU() 获取 JSON 快照
   * 2. engine.init() 创建内存数据库
   * 3. syncBridge.loadFromTableData() 建表 + 灌数据
   * 4. 更新 currentJsonTableData_ACU
   */
  async loadFromChat(): Promise<{
    loaded: boolean;
    source: 'merged' | 'initialized' | 'empty';
    error?: string;
  }> {
    try {
      // 初始化 SQLite 引擎
      await this.engine.init();

      // 从聊天消息合并出最新 JSON 快照
      const mergedData = await mergeAllIndependentTables_ACU();

      if (!mergedData) {
        // 新开卡场景：没有聊天历史数据
        // 只初始化引擎，不建表——建表延迟到第一次 applyEdits/executeQuery/executeMutation 时
        // 这样能确保使用的是「第一次填表那一刻」的最新模板 DDL，而非「进入聊天那一刻」的快照
        logDebug_ACU('[SqlTableService] 没有找到表格数据，引擎已就绪，等待第一次填表时从模板建表');
        this._initialized = true;
        return { loaded: false, source: 'empty' };
      }

      // 将 JSON 数据加载到 SQLite
      this.syncBridge.loadFromTableData(mergedData as TableDataObject_ACU);

      // 更新全局 JSON 视图
      _set_currentJsonTableData_ACU(mergedData as TableDataObject_ACU);

      // 从所有表的 DDL 构建中英文名称映射器
      this._buildNameMapper(mergedData as TableDataObject_ACU);

      this._initialized = true;
      logDebug_ACU('[SqlTableService] SQLite 数据库加载完成');
      return { loaded: true, source: 'merged' };
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      logError_ACU(`[SqlTableService] 加载失败: ${errMsg}`);
      return { loaded: false, source: 'empty', error: errMsg };
    }
  }

  /**
   * 从 SQLite 导出并保存到聊天消息
   * 1. exportToTableData() 导出最新状态
   * 2. 更新 currentJsonTableData_ACU
   * 3. saveIndependentTableToChatHistory_ACU() 写入聊天
   */
  async saveToChat(
    targetSheetKeys?: string[] | null,
    updateGroupKeys?: string[] | null,
  ): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
    this._ensureInitialized();

    try {
      // 从 SQLite 导出最新数据到 JSON 视图
      const mate = (currentJsonTableData_ACU?.mate as Mate_ACU) || { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } };
      const exportedData = this.syncBridge.exportToTableData(mate);
      _set_currentJsonTableData_ACU(exportedData);

      // 写入聊天消息
      return saveIndependentTableToChatHistory_ACU(
        -1,
        targetSheetKeys ?? null,
        updateGroupKeys ?? null,
      );
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      logError_ACU(`[SqlTableService] 保存失败: ${errMsg}`);
      return { saved: false, error: errMsg };
    }
  }

  /**
   * 获取当前运行时的完整表格数据
   * 从 SQLite 导出最新状态，同步更新 JSON 视图后返回
   */
  getCurrentData(): TableDataObject_ACU | null {
    if (!this._initialized || !this.engine.isReady) {
      return currentJsonTableData_ACU;
    }

    try {
      const mate = (currentJsonTableData_ACU?.mate as Mate_ACU) || { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } };
      const exportedData = this.syncBridge.exportToTableData(mate);
      _set_currentJsonTableData_ACU(exportedData);
      return exportedData;
    } catch (e: any) {
      logError_ACU(`[SqlTableService] getCurrentData 失败: ${e?.message}`);
      return currentJsonTableData_ACU;
    }
  }

  /**
   * 应用 AI 返回的 SQL 编辑指令
   * 1. 拆分多条 SQL 语句
   * 2. 事务包裹执行（runBatch）
   * 3. 同步到 JSON 视图
   * 4. 返回结果
   *
   * 失败时抛出包含详细报错的 Error，供上层重试循环捕获
   */
  applyEdits(sqlStatements: string, _updateMode?: string): ApplyEditsResult {
    this._ensureInitialized();
    this._ensureTablesFromTemplate();

    // 去掉 HTML 注释标记（AI 可能在 <tableEdit> 中用 <!-- --> 包裹）
    const cleaned = sqlStatements.replace(/<!--|-->/g, '').trim();
    if (!cleaned) {
      return { success: true, modifiedKeys: [], appliedEdits: 0 };
    }

    // 按分号拆分为多条语句（跳过字符串内的分号）
    const statements = splitSqlStatements(cleaned);
    if (statements.length === 0) {
      return { success: true, modifiedKeys: [], appliedEdits: 0 };
    }

    try {
      // 事务执行
      const result = this.engine.runBatch(statements);

      // 同步到 JSON 视图
      this._syncToJson();

      // 收集受影响的表名（从 SQL 语句中提取）
      const modifiedTables = extractTableNamesFromStatements(statements);
      const modifiedKeys = this._tableNamesToSheetKeys(modifiedTables);

      logDebug_ACU(`[SqlTableService] SQL 执行成功: ${statements.length} 条语句, ${result.totalChanges} 行受影响`);

      return {
        success: true,
        modifiedKeys,
        appliedEdits: statements.length,
      };
    } catch (e: any) {
      // 事务已回滚，数据保持原样
      const errMsg = e?.message || String(e);
      logError_ACU(`[SqlTableService] SQL 执行失败: ${errMsg}`);
      // 抛出错误，供上层重试循环捕获并注入到 AI prompt
      throw e;
    }
  }

  /**
   * 执行 SQL 查询（SELECT）
   */
  executeQuery(sql: string, params?: (string | number | null)[]): SqlQueryResult {
    this._ensureInitialized();
    this._ensureTablesFromTemplate();
    const result = this.engine.query(sql, params);
    return {
      columns: result.columns,
      values: result.values,
      rowCount: result.values.length,
    };
  }

  /**
   * 执行 SQL 变更语句（INSERT/UPDATE/DELETE）
   * 执行后自动同步到 JSON 视图
   */
  executeMutation(sql: string, params?: (string | number | null)[]): SqlMutationResult {
    this._ensureInitialized();
    this._ensureTablesFromTemplate();
    try {
      const result = this.engine.run(sql, params);
      this._syncToJson();
      return { changes: result.changes, errors: [] };
    } catch (e: any) {
      return { changes: 0, errors: [e?.message || String(e)] };
    }
  }

  /**
   * 销毁数据库实例，释放内存
   */
  dispose(): void {
    this.engine.dispose();
    disposeGlobalNameMapper();
    this._initialized = false;
    logDebug_ACU('[SqlTableService] SQLite 引擎已销毁');
  }

  // ═══════════════════════════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════════════════════════

  /** 从 TableDataObject 中提取所有 DDL，构建全局 NameMapper */
  private _buildNameMapper(data: TableDataObject_ACU): void {
    try {
      const ddlMap = new Map<string, string>();
      for (const [key, value] of Object.entries(data)) {
        if (!key.startsWith('sheet_')) continue;
        const sheet = value as any;
        const ddl = sheet?.sourceData?.ddl;
        if (!ddl) continue;
        const tableName = parseDDLTableName(ddl);
        if (tableName) {
          ddlMap.set(tableName, ddl);
        }
      }
      if (ddlMap.size > 0) {
        buildGlobalNameMapper(ddlMap);
      }
    } catch (e: any) {
      logWarn_ACU(`[SqlTableService] 构建 NameMapper 失败: ${e?.message}`);
    }
  }

  /** 同步 SQLite → JSON 视图 */
  private _syncToJson(): void {
    try {
      const mate = (currentJsonTableData_ACU?.mate as Mate_ACU) || { type: 'acu', version: 1, updateConfigUiSentinel: 0, globalInjectionConfig: { readableEntryPlacement: { position: '', depth: 0, order: 0 }, wrapperPlacement: { position: '', depth: 0, order: 0 } } };
      const exportedData = this.syncBridge.exportToTableData(mate);
      _set_currentJsonTableData_ACU(exportedData);
    } catch (e: any) {
      logError_ACU(`[SqlTableService] syncToJson 失败: ${e?.message}`);
    }
  }

  /** 将 SQL 表名映射为 sheetKey */
  private _tableNamesToSheetKeys(tableNames: string[]): string[] {
    if (!currentJsonTableData_ACU) return [];
    const keys: string[] = [];
    for (const [key, value] of Object.entries(currentJsonTableData_ACU)) {
      if (!key.startsWith('sheet_')) continue;
      const sheet = value as any;
      // 从 DDL 中解析表名进行匹配
      const ddl = sheet?.sourceData?.ddl;
      if (ddl) {
        const match = ddl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
        if (match && tableNames.includes(match[1])) {
          keys.push(key);
        }
      }
    }
    return keys;
  }

  /** 确保引擎已初始化 */
  private _ensureInitialized(): void {
    if (!this._initialized || !this.engine.isReady) {
      throw new Error('[SqlTableService] SQLite 引擎未初始化，请先调用 loadFromChat()');
    }
  }

  /**
   * 按需建表：每次执行 SQL 操作前，检查模板中的表是否都已存在于 SQLite。
   *
   * 三种场景：
   * 1. 新卡第一次填表：SQLite 中无任何用户表 → 全量从模板建表
   * 2. 老卡正常运行：所有表都已存在 → 直接返回（幂等）
   * 3. 中途加表：模板中新增了一张表，但 SQLite 中没有 → 只建缺失的表
   *
   * 设计意图：建表延迟到第一次 applyEdits/executeQuery/executeMutation，
   * 确保使用的是「此刻」最新的模板 DDL，而非「进入聊天那一刻」的快照。
   */
  private _ensureTablesFromTemplate(): void {
    const existingTables = new Set(this.engine.getTableNames());

    const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true }) as TableDataObject_ACU | null;
    if (!templateData) {
      // 没有模板（可能模板未配置），如果已有表则正常运行，否则报错
      if (existingTables.size > 0) return;
      throw new Error('[SqlTableService] 模板解析失败，无法建表。请检查模板格式。');
    }

    // 收集模板中所有表的 sheetKey 和表名，找出 SQLite 中缺失的
    const sheetKeys = Object.keys(templateData).filter(k => k.startsWith('sheet_'));
    const missingSheets: Record<string, any> = {};

    for (const key of sheetKeys) {
      const sheet = templateData[key] as any;
      if (!sheet || !sheet.sourceData?.ddl) continue;
      const tableName = parseDDLTableName(sheet.sourceData.ddl);
      if (tableName && !existingTables.has(tableName)) {
        missingSheets[key] = sheet;
      }
    }

    // 所有表都已存在，无需建表
    if (Object.keys(missingSheets).length === 0) return;

    logDebug_ACU(`[SqlTableService] 发现 ${Object.keys(missingSheets).length} 张缺失表，按需建表: ${Object.keys(missingSheets).join(', ')}`);

    // 构造只包含缺失表的 templateData 子集，交给 syncBridge 建表
    const partialData: TableDataObject_ACU = { mate: templateData.mate };
    for (const [key, sheet] of Object.entries(missingSheets)) {
      (partialData as any)[key] = sheet;
    }
    this.syncBridge.loadFromTableData(partialData);

    // 合并新建的表到当前 JSON 视图
    if (currentJsonTableData_ACU) {
      for (const [key, sheet] of Object.entries(missingSheets)) {
        (currentJsonTableData_ACU as any)[key] = sheet;
      }
    } else {
      _set_currentJsonTableData_ACU(templateData);
    }
    this._buildNameMapper(currentJsonTableData_ACU || templateData);

    logDebug_ACU(`[SqlTableService] 按需建表完成，当前共 ${this.engine.getTableNames().length} 张表`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 按分号拆分 SQL 语句（跳过字符串内的分号）
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (inString) {
      current += char;
      // 检查字符串结束（处理转义的引号 ''）
      if (char === stringChar) {
        if (i + 1 < sql.length && sql[i + 1] === stringChar) {
          // 转义的引号，跳过
          current += sql[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else if (char === "'" || char === '"') {
      inString = true;
      stringChar = char;
      current += char;
    } else if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }

  // 最后一条语句（可能没有分号结尾）
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

/**
 * 从 SQL 语句中提取表名（简单正则匹配）
 * 支持 INSERT INTO、UPDATE、DELETE FROM、ALTER TABLE
 */
export function extractTableNamesFromStatements(statements: string[]): string[] {
  const tableNames = new Set<string>();
  const patterns = [
    /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i,
    /UPDATE\s+(?:OR\s+\w+\s+)?(\w+)/i,
    /DELETE\s+FROM\s+(\w+)/i,
    /ALTER\s+TABLE\s+(\w+)/i,
  ];

  for (const stmt of statements) {
    for (const pattern of patterns) {
      const match = stmt.match(pattern);
      if (match) {
        tableNames.add(match[1]);
        break;
      }
    }
  }

  return Array.from(tableNames);
}
