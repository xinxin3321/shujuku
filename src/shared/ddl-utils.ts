/**
 * shared/ddl-utils.ts — DDL 纯解析/操作工具函数
 *
 * 这些函数只做字符串解析，不访问数据库、不读写存储、不依赖任何 data 层基础设施。
 * 所有层（data / service / presentation）均可直接 import。
 */

import { logWarn_ACU } from './utils';

// ═══════════════════════════════════════════════════════════════
// DDL 解析
// ═══════════════════════════════════════════════════════════════

/**
 * 从 DDL 中解析英文表名
 * @param ddl CREATE TABLE 语句
 * @returns 表名，解析失败返回 null
 */
export function parseDDLTableName(ddl: string): string | null {
  if (!ddl) return null;
  // 匹配 CREATE TABLE [IF NOT EXISTS] table_name
  const match = ddl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
  return match ? match[1] : null;
}

/**
 * 从 DDL 第一行注释中解析中文表名
 * 格式：CREATE TABLE table_name ( -- 中文表名
 * @param ddl CREATE TABLE 语句
 * @returns 中文表名，解析失败返回 null
 */
export function parseDDLChineseName(ddl: string): string | null {
  if (!ddl) return null;
  // 匹配第一行的 -- 注释
  const firstLine = ddl.split('\n')[0];
  const match = firstLine.match(/--\s*(.+?)\s*$/);
  return match ? match[1].trim() : null;
}

/**
 * 从 DDL 中解析所有列名（按顺序）
 * @param ddl CREATE TABLE 语句
 * @returns 列名数组
 */
export function parseDDLColumnNames(ddl: string): string[] {
  if (!ddl) return [];
  const columns: string[] = [];

  // 提取括号内的列定义部分
  const bodyMatch = ddl.match(/\(([^]*)\)/);
  if (!bodyMatch) return [];

  const body = bodyMatch[1];
  // 按逗号分割（但要注意括号内和注释内的逗号）
  const lines = splitColumnDefinitions(body);

  for (const line of lines) {
    // 去掉行注释（-- 到行尾），然后取最后一个非注释行的内容
    const withoutComments = line.replace(/--[^\n]*/g, '').trim();
    if (!withoutComments) continue;
    // 跳过表级约束（PRIMARY KEY、FOREIGN KEY、UNIQUE、CHECK、CONSTRAINT）
    if (/^(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(withoutComments)) continue;
    // 提取列名（第一个标识符）
    const colMatch = withoutComments.match(/^([^\s,()]+)/);
    if (colMatch) {
      columns.push(colMatch[1]);
    }
  }

  return columns;
}

/**
 * 从 DDL 中解析列名 → 注释的映射
 * 格式：column_name TYPE ... -- 注释
 * @param ddl CREATE TABLE 语句
 * @returns Map<列名, 注释>
 */
export function parseDDLColumnComments(ddl: string): Map<string, string> {
  const comments = new Map<string, string>();
  if (!ddl) return comments;

  const bodyMatch = ddl.match(/\(([^]*)\)/);
  if (!bodyMatch) return comments;

  const body = bodyMatch[1];
  // 按行分割（注释是行级概念，标准 SQL 中 `-- 注释` 到行尾）
  // 而非按 splitColumnDefinitions 分割（逗号在注释之前，会截断注释）
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 匹配 column_name ... -- 注释（行内可能有逗号、CHECK 约束等）
    const match = trimmed.match(/^([^\s,()]+)\s+.*?--\s*(.+?)\s*,?\s*$/);
    if (match) {
      comments.set(match[1], match[2]);
    }
  }

  return comments;
}

/**
 * 构建 DDL 列名 → 中文名的双向映射
 * @param ddl CREATE TABLE 语句
 * @returns { sqlToChinese: Map<英文列名, 中文名>, chineseToSql: Map<中文名, 英文列名> }
 */
export function buildColumnNameMap(ddl: string): {
  sqlToChinese: Map<string, string>;
  chineseToSql: Map<string, string>;
} {
  const comments = parseDDLColumnComments(ddl);
  const sqlToChinese = new Map<string, string>();
  const chineseToSql = new Map<string, string>();

  for (const [colName, comment] of comments) {
    sqlToChinese.set(colName, comment);
    chineseToSql.set(comment, colName);
  }

  return { sqlToChinese, chineseToSql };
}

export interface DDLColumnInfo_ACU {
  index: number;
  sqlName: string;
  comment: string | null;
}

export function parseDDLColumnInfos_ACU(ddl: string): DDLColumnInfo_ACU[] {
  const columnNames = parseDDLColumnNames(ddl);
  const comments = parseDDLColumnComments(ddl);
  return columnNames.map((sqlName, index) => {
    const rawComment = comments.get(sqlName);
    const comment = typeof rawComment === 'string' && rawComment.trim() ? rawComment.trim() : null;
    return {
      index,
      sqlName,
      comment,
    };
  });
}

function isAsciiOnly_ACU(value: string): boolean {
  return /^[\x00-\x7F]+$/.test(String(value || ''));
}

function buildDDLHeaderMismatchMessage_ACU(index: number, ddlColumn: DDLColumnInfo_ACU, header: string): string {
  return ddlColumn.comment
    ? `第 ${index + 1} 列不匹配：DDL 列名为「${ddlColumn.sqlName}」，注释为「${ddlColumn.comment}」，表头为「${header}」`
    : `第 ${index + 1} 列不匹配：DDL 列名为「${ddlColumn.sqlName}」，表头为「${header}」`;
}

export function validateDDLTextAgainstHeaders_ACU(
  ddlText: string,
  tableHeaders: string[],
): { valid: boolean; message: string } {
  const trimmed = String(ddlText || '').trim();
  if (!trimmed) {
    return { valid: false, message: '⚠ DDL 为空' };
  }
  if (!/CREATE\s+TABLE/i.test(trimmed)) {
    return { valid: false, message: '✗ 不是有效的 CREATE TABLE 语句' };
  }

  const columnInfos = parseDDLColumnInfos_ACU(trimmed);
  const firstColumn = columnInfos[0];
  if (!firstColumn || firstColumn.sqlName.toLowerCase() !== 'row_id' || !/row_id\s+INTEGER\s+PRIMARY\s+KEY/i.test(trimmed)) {
    return { valid: false, message: '✗ 缺少 row_id INTEGER PRIMARY KEY 列（必须作为第一列）' };
  }

  const normalizedHeaders = Array.isArray(tableHeaders)
    ? tableHeaders.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  const firstHeader = normalizedHeaders[0];
  const isRowIdHeader = firstHeader === 'row_id' || firstHeader === '行号';
  const comparableHeaders = isRowIdHeader
    ? normalizedHeaders.slice(1)
    : normalizedHeaders;
  const comparableColumns = columnInfos.filter((item) => item.sqlName.toLowerCase() !== 'row_id');
  const issues: string[] = [];

  if (comparableColumns.length !== comparableHeaders.length) {
    issues.push(`列数不匹配：DDL 有 ${comparableColumns.length} 列，表头有 ${comparableHeaders.length} 列`);
  }

  const compareLength = Math.min(comparableColumns.length, comparableHeaders.length);
  for (let index = 0; index < compareLength; index += 1) {
    const ddlColumn = comparableColumns[index];
    const header = comparableHeaders[index];
    const headerIsAscii = isAsciiOnly_ACU(header);
    const sqlNameIsAscii = isAsciiOnly_ACU(ddlColumn.sqlName);
    const matchesPhysical = ddlColumn.sqlName === header;
    const matchesComment = !!ddlColumn.comment && ddlColumn.comment === header;

    if (headerIsAscii) {
      if (!matchesPhysical) {
        issues.push(buildDDLHeaderMismatchMessage_ACU(index, ddlColumn, header));
      }
      continue;
    }

    if (!matchesComment) {
      issues.push(buildDDLHeaderMismatchMessage_ACU(index, ddlColumn, header));
      continue;
    }

    if (!sqlNameIsAscii) {
      issues.push(
        `第 ${index + 1} 列不匹配：表头为「${header}」时，DDL 物理列名必须使用英文/ASCII，当前 DDL 列名为「${ddlColumn.sqlName}」，注释为「${ddlColumn.comment}」`,
      );
    }
  }

  if (issues.length > 0) {
    return { valid: false, message: `⚠ DDL 列名与表头不完全匹配：${issues.join('；')}` };
  }

  return { valid: true, message: '✓ DDL 格式正确，列名与表头匹配' };
}

/**
 * 根据列在 DDL 中的位置索引获取英文列名
 * 索引从 0 开始，对应 content[0] 中的位置（包含 row_id）
 *
 * @param ddl CREATE TABLE 语句
 * @param index 列索引（对应 content[0] 的位置，0 通常是 row_id）
 * @returns 英文列名，找不到返回 null
 */
export function getDDLColumnNameByIndex(ddl: string, index: number): string | null {
  const columns = parseDDLColumnNames(ddl);
  if (index < 0 || index >= columns.length) return null;
  return columns[index];
}

/**
 * 更新 DDL 中指定列的注释（中文名）
 * 按行扫描 DDL，找到指定列名的行，替换其 `-- 注释` 部分。
 * 如果该行没有注释，则在行尾添加 `-- 新注释`。
 *
 * @param ddl 原始 CREATE TABLE 语句
 * @param columnName 要更新注释的英文列名
 * @param newComment 新的注释内容（中文名）
 * @returns 更新后的 DDL 字符串；如果找不到列名则返回原 DDL
 */
export function updateDDLColumnComment(ddl: string, columnName: string, newComment: string): string {
  if (!ddl || !columnName || !newComment) return ddl;

  const lines = ddl.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // 检查该行是否以目标列名开头（列定义行）
    const colMatch = trimmed.match(/^([^\s,()]+)\s+/);
    if (!colMatch || colMatch[1] !== columnName) continue;

    // 找到目标列，替换或添加注释
    found = true;
    const line = lines[i];

    // 情况 1：行内已有 `-- 注释`，替换注释内容
    const commentMatch = line.match(/^(.*?)(--\s*).+?(,?\s*)$/);
    if (commentMatch) {
      lines[i] = `${commentMatch[1]}-- ${newComment}${commentMatch[3]}`;
      break;
    }

    // 情况 2：行内没有注释，需要添加
    // 先检查行尾是否有逗号
    const trailingCommaMatch = line.match(/^(.*?)(,\s*)$/);
    if (trailingCommaMatch) {
      // 有逗号：在逗号前插入注释 → `  col TEXT, -- 注释`
      // 按照项目约定格式：逗号在注释前 → `  col TEXT, -- 注释`
      lines[i] = `${trailingCommaMatch[1]}, -- ${newComment}`;
    } else {
      // 无逗号（最后一列）：直接在行尾添加注释
      lines[i] = `${line.trimEnd()} -- ${newComment}`;
    }
    break;
  }

  if (!found) {
    logWarn_ACU(`[Schema] updateDDLColumnComment: 未找到列 "${columnName}"，DDL 未修改`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// 内部工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 分割 DDL 括号内的列定义（处理嵌套括号）
 */
function splitColumnDefinitions(body: string): string[] {
  const results: string[] = [];
  let current = '';
  let depth = 0;
  let inLineComment = false;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    // 检测 -- 行注释开始
    if (!inLineComment && char === '-' && i + 1 < body.length && body[i + 1] === '-') {
      inLineComment = true;
      current += char;
      continue;
    }

    // 换行符结束行注释
    if (inLineComment && char === '\n') {
      inLineComment = false;
      current += char;
      continue;
    }

    // 在行注释内，所有字符直接追加（包括逗号）
    if (inLineComment) {
      current += char;
      continue;
    }

    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      results.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    results.push(current);
  }

  return results;
}
