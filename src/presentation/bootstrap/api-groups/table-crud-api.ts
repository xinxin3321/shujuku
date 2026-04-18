/**
 * presentation/bootstrap/api-groups/table-crud-api.ts
 * 表格 CRUD API — updateCell / updateRow / insertRow / deleteRow
 */

import { topLevelWindow_ACU } from '../../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { SillyTavern_API_ACU, type ACUMessage } from '../../../shared/host-api';
import {
    currentJsonTableData_ACU,
    settings_ACU,
    getCurrentIsolationKey_ACU,
} from '../../../service/runtime/state-manager';
import { saveIndependentTableToChatHistory_ACU } from '../../../service/table/table-service';
import { saveCurrentDataForTable_ACU } from '../../triggers/update-process';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../../components/pipeline-ui-helpers';
import type { ApiGroupContext } from './callback-api';
import { isSqliteMode } from '../../../service/table/storage-mode';
import { getStorageProvider } from '../../../service/table/table-storage-strategy';
import { getNameMapper } from '../../../service/runtime/template-vars/name-mapper';
import { parseDDLTableName } from '../../../shared/ddl-utils';

/**
 * 从 sheet 解析英文物理表名
 * 优先从 DDL 解析，fallback 为传入的 tableName 或 sheet.name
 */
function getEnglishTableName(sheet: any, fallback: string): string {
    const ddl = sheet?.sourceData?.ddl;
    if (ddl) {
        const parsed = parseDDLTableName(ddl);
        if (parsed) return parsed;
    }
    return fallback;
}

/**
 * 查找指定表格的目标 sheet 和 sheetKey
 * 支持中文显示名、英文物理表名、中英混用
 * 返回值包含英文物理表名（用于 SQL 拼接）
 */
export function findTargetSheet(
    tableName: string,
): { sheet: any; sheetKey: string; englishTableName: string } | null {
    if (!currentJsonTableData_ACU) return null;

    // 路径 1：按 sheet.name（中文显示名）直接匹配
    for (const sheetKey in currentJsonTableData_ACU) {
        if (!sheetKey.startsWith('sheet_')) continue;
        const sheet = currentJsonTableData_ACU[sheetKey];
        if (sheet?.name === tableName) {
            return {
                sheet,
                sheetKey,
                englishTableName: getEnglishTableName(sheet, tableName),
            };
        }
    }

    // 路径 2：用户传的可能是英文物理表名——通过 NameMapper 反查对应的中文名
    const mapper = getNameMapper();
    const maybeChineseName = mapper.getChineseTableName(tableName);
    if (maybeChineseName && maybeChineseName !== tableName) {
        for (const sheetKey in currentJsonTableData_ACU) {
            if (!sheetKey.startsWith('sheet_')) continue;
            const sheet = currentJsonTableData_ACU[sheetKey];
            if (sheet?.name === maybeChineseName) {
                return {
                    sheet,
                    sheetKey,
                    englishTableName: getEnglishTableName(sheet, tableName),
                };
            }
        }
    }

    // 路径 3：直接从 DDL 的英文表名匹配（兜底，覆盖 NameMapper 未构建的场景）
    for (const sheetKey in currentJsonTableData_ACU) {
        if (!sheetKey.startsWith('sheet_')) continue;
        const sheet = currentJsonTableData_ACU[sheetKey];
        const english = getEnglishTableName(sheet, '');
        if (english && english === tableName) {
            return {
                sheet,
                sheetKey,
                englishTableName: english,
            };
        }
    }

    return null;
}

/**
 * 将用户传入的列名（可能是中文、英文、或数字索引得来的中文）
 * 翻译成英文列名（供 SQL 拼接）和中文列名（供原生模式 headers 匹配）
 *
 * 原生模式下 NameMapper 未构建，resolve* 方法会原样返回——
 * 此时 englishColName === chineseColName === 原始 colName，行为与旧版一致。
 */
function resolveColumnForSheet(
    englishTableName: string,
    colName: string,
): { englishColName: string; chineseColName: string } {
    const mapper = getNameMapper();
    const englishColName = mapper.resolveColumnName(englishTableName, colName);
    const chineseColName = mapper.getChineseColumnName(englishTableName, englishColName);
    return { englishColName, chineseColName };
}

/**
 * 查找指定表格数据所在的最新聊天楼层索引
 * 复用逻辑：updateRow / insertRow / deleteRow 共享此函数
 */
function findTableLatestFloor(targetSheetKey: string, tableName: string): number {
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) return -1;

    const isSummaryTable = isSummaryOrOutlineTable_ACU(tableName);
    const isolationKey = getCurrentIsolationKey_ACU();

    // 从最新消息向前遍历，找到第一个包含该表数据的楼层
    for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i] as ACUMessage;
        if (msg.is_user) continue;

        let hasTableData = false;

        // 优先：新格式（按标签分组）
        if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[isolationKey]) {
            const tagData = msg.TavernDB_ACU_IsolatedData[isolationKey];
            const independentData = tagData.independentData || {};
            if (independentData[targetSheetKey]) {
                hasTableData = true;
            }
        }

        // 兼容：旧格式
        if (!hasTableData) {
            const msgIdentity = msg.TavernDB_ACU_Identity;
            const isLegacyMatch = settings_ACU.dataIsolationEnabled
                ? msgIdentity === settings_ACU.dataIsolationCode
                : !msgIdentity;

            if (isLegacyMatch) {
                const hasLegacyData =
                    (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[targetSheetKey]) ||
                    (isSummaryTable
                        ? (msg.TavernDB_ACU_SummaryData && msg.TavernDB_ACU_SummaryData[targetSheetKey])
                        : (msg.TavernDB_ACU_Data && msg.TavernDB_ACU_Data[targetSheetKey]));
                hasTableData = !!hasLegacyData;
            }
        }

        if (hasTableData) return i;
    }

    // 找不到该表的楼层，回退到最新 AI 楼层
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) return i;
    }

    return -1;
}

/**
 * 保存表格到最新楼层并刷新世界书（updateRow / insertRow / deleteRow 共享）
 */
async function saveToLatestFloorAndRefresh(
    targetSheetKey: string,
    tableName: string,
    ctx: ApiGroupContext,
    methodName: string,
    skipChatSave?: boolean,
): Promise<void> {
    const tableLatestFloorIndex = findTableLatestFloor(targetSheetKey, tableName);

    if (tableLatestFloorIndex !== -1) {
        if (!skipChatSave) {
            logDebug_ACU(`${methodName}: Saving [${tableName}] to its latest floor ${tableLatestFloorIndex}`);
            await saveIndependentTableToChatHistory_ACU(tableLatestFloorIndex, [targetSheetKey], [targetSheetKey], true);
        }
        await refreshMergedDataAndNotifyWithUI_ACU();
        logDebug_ACU(`${methodName}: Worldbook refreshed after saving [${tableName}]`);
    } else {
        logDebug_ACU(`${methodName}: No AI floor found, falling back to saveCurrentDataForTable_ACU`);
        await saveCurrentDataForTable_ACU(targetSheetKey);
    }

    (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
}

export function createTableCrudApi(ctx: ApiGroupContext): Record<string, Function> {
    return {
        updateCell: async function(tableName: string, rowIndex: number, colIdentifier: string | number, value: any) {
            try {
                if (!currentJsonTableData_ACU) {
                    logError_ACU('updateCell: No table data loaded.');
                    return false;
                }

                const target = findTargetSheet(tableName);
                if (!target) {
                    logError_ACU(`updateCell: Table "${tableName}" not found.`);
                    return false;
                }

                const { sheet: targetSheet, sheetKey: targetSheetKey, englishTableName } = target;

                if (!targetSheet.content || targetSheet.content.length === 0) {
                    logError_ACU(`updateCell: Table "${tableName}" has no content.`);
                    return false;
                }

                // 解析列名：先拿到一个「原始列名」（来自用户输入或表头索引）
                let rawColName: string;
                if (typeof colIdentifier === 'number') {
                    const headers = targetSheet.content[0] || [];
                    if (colIdentifier < 0 || colIdentifier >= headers.length) {
                        logError_ACU(`updateCell: Column index ${colIdentifier} out of bounds in table "${tableName}".`);
                        return false;
                    }
                    rawColName = headers[colIdentifier]; // 中文
                } else {
                    rawColName = colIdentifier; // 可能中文也可能英文
                }

                // 统一翻译为英文+中文双形态
                const { englishColName, chineseColName } = resolveColumnForSheet(englishTableName, rawColName);

                // 校验列名：用中文形态和 headers 比对（headers 是中文），
                // 这样用户传英文列名也能通过校验
                if (typeof colIdentifier !== 'number') {
                    const headers = targetSheet.content[0] || [];
                    if (!headers.includes(chineseColName)) {
                        logError_ACU(`updateCell: Column "${colIdentifier}" not found in table "${tableName}".`);
                        return false;
                    }
                }

                if (rowIndex < 1 || rowIndex >= targetSheet.content.length) {
                    logError_ACU(`updateCell: Row index ${rowIndex} out of bounds in table "${tableName}".`);
                    return false;
                }

                if (isSqliteMode()) {
                    // SQLite 模式：用英文物理表名和英文列名生成 UPDATE SQL
                    const rowId = targetSheet.content[rowIndex][0]; // row_id 是第一列
                    const escapedVal = value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
                    const sql = `UPDATE ${quoteIdentifier(englishTableName)} SET ${quoteIdentifier(englishColName)} = ${escapedVal} WHERE row_id = ${rowId};`;
                    const result = getStorageProvider().executeMutation(sql);
                    if (result.errors.length > 0) {
                        logError_ACU(`updateCell SQL failed: ${result.errors.join(', ')}`);
                        return false;
                    }
                    logDebug_ACU(`updateCell: [SQLite] Updated [${englishTableName}] row_id=${rowId}, col=${englishColName}`);
                } else {
                    // 原生模式：直接操作 JSON 数组，用中文列名在 headers 中定位
                    let colIndex = -1;
                    if (typeof colIdentifier === 'number') {
                        colIndex = colIdentifier;
                    } else {
                        const headers = targetSheet.content[0] || [];
                        colIndex = headers.indexOf(chineseColName);
                    }
                    if (colIndex < 0) {
                        logError_ACU(`updateCell: Column "${colIdentifier}" not found in table "${tableName}".`);
                        return false;
                    }
                    targetSheet.content[rowIndex][colIndex] = value;
                    logDebug_ACU(`updateCell: Updated [${tableName}] row ${rowIndex}, col ${colIdentifier} = ${value}`);
                }

                await saveCurrentDataForTable_ACU(targetSheetKey);
                (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();

                return true;
            } catch (e) {
                logError_ACU('updateCell failed:', e);
                return false;
            }
        },

        updateRow: async function(tableName: string, rowIndex: number, data: Record<string, any>) {
            try {
                if (!currentJsonTableData_ACU) {
                    logError_ACU('updateRow: No table data loaded.');
                    return false;
                }

                if (rowIndex < 1) {
                    logError_ACU('updateRow: Cannot modify header row (index 0).');
                    return false;
                }

                const target = findTargetSheet(tableName);
                if (!target) {
                    logError_ACU(`updateRow: Table "${tableName}" not found.`);
                    return false;
                }

                const { sheet: targetSheet, sheetKey: targetSheetKey, englishTableName } = target;

                if (isSqliteMode()) {
                    // SQLite 模式：用英文物理表名和英文列名生成 UPDATE SQL
                    const rowId = targetSheet.content[rowIndex]?.[0];
                    if (rowId === undefined || rowId === null) {
                        logError_ACU(`updateRow: row_id not found at index ${rowIndex}`);
                        return false;
                    }
                    const setClauses: string[] = [];
                    const headers = targetSheet.content[0] || [];
                    for (const colName in data) {
                        if (colName === 'isImportMode') continue; // 跳过内部标记
                        const { englishColName, chineseColName } = resolveColumnForSheet(englishTableName, colName);
                        if (!headers.includes(chineseColName)) {
                            logWarn_ACU(`updateRow: Column "${colName}" not found in table "${tableName}".`);
                            continue;
                        }
                        const val = data[colName];
                        const escapedVal = val === null || val === undefined ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
                        setClauses.push(`${quoteIdentifier(englishColName)} = ${escapedVal}`);
                    }
                    if (setClauses.length === 0) {
                        logWarn_ACU('updateRow: No valid columns to update.');
                        return true;
                    }
                    const sql = `UPDATE ${quoteIdentifier(englishTableName)} SET ${setClauses.join(', ')} WHERE row_id = ${rowId};`;
                    const result = getStorageProvider().executeMutation(sql);
                    if (result.errors.length > 0) {
                        logError_ACU(`updateRow SQL failed: ${result.errors.join(', ')}`);
                        return false;
                    }
                    logDebug_ACU(`updateRow: [SQLite] Updated ${setClauses.length} cols in [${englishTableName}] row_id=${rowId}`);
                } else {
                    // 原生模式：直接操作 JSON 数组
                    while (targetSheet.content.length <= rowIndex) {
                        const newRow = new Array((targetSheet.content[0] || []).length).fill('');
                        targetSheet.content.push(newRow);
                    }

                    const headers = targetSheet.content[0] || [];
                    const row = targetSheet.content[rowIndex];

                    let updated = 0;
                    for (const colName in data) {
                        if (colName === 'isImportMode') continue;
                        // 将用户传入的列名翻译为中文（原生模式 headers 是中文）。
                        // 原生模式下 NameMapper 未构建时 resolveColumnForSheet 原样返回，
                        // 行为与旧版一致。
                        const { chineseColName } = resolveColumnForSheet(englishTableName, colName);
                        const colIndex = headers.indexOf(chineseColName);
                        if (colIndex !== -1) {
                            row[colIndex] = data[colName];
                            updated++;
                        } else {
                            logWarn_ACU(`updateRow: Column "${colName}" not found in table "${tableName}".`);
                        }
                    }

                    logDebug_ACU(`updateRow: Updated ${updated} cells in [${tableName}] row ${rowIndex}`);
                }

                await saveToLatestFloorAndRefresh(targetSheetKey, targetSheet.name, ctx, 'updateRow', !!data?.isImportMode);

                return true;
            } catch (e) {
                logError_ACU('updateRow failed:', e);
                return false;
            }
        },

        insertRow: async function(tableName: string, data: Record<string, any>) {
            try {
                if (!currentJsonTableData_ACU) {
                    logError_ACU('insertRow: No table data loaded.');
                    return -1;
                }

                const target = findTargetSheet(tableName);
                if (!target) {
                    logError_ACU(`insertRow: Table "${tableName}" not found.`);
                    return -1;
                }

                const { sheet: targetSheet, sheetKey: targetSheetKey, englishTableName } = target;
                const headers = targetSheet.content[0] || [];

                if (isSqliteMode()) {
                    // SQLite 模式：用英文物理表名和英文列名生成 INSERT SQL
                    const colNames: string[] = [];
                    const values: string[] = [];
                    for (const colName in data) {
                        const { englishColName, chineseColName } = resolveColumnForSheet(englishTableName, colName);
                        // 跳过 row_id（自增主键），同时检查英文形态和原始名，防止用户传中文"行号"等变体
                        if (englishColName === 'row_id' || colName === 'row_id') continue;
                        if (!headers.includes(chineseColName)) continue;
                        colNames.push(quoteIdentifier(englishColName));
                        const val = data[colName];
                        values.push(val === null || val === undefined ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`);
                    }
                    const sql = colNames.length > 0
                        ? `INSERT INTO ${quoteIdentifier(englishTableName)} (${colNames.join(', ')}) VALUES (${values.join(', ')});`
                        : `INSERT INTO ${quoteIdentifier(englishTableName)} DEFAULT VALUES;`;
                    const result = getStorageProvider().executeMutation(sql);
                    if (result.errors.length > 0) {
                        logError_ACU(`insertRow SQL failed: ${result.errors.join(', ')}`);
                        return -1;
                    }
                    // 获取新插入行在 JSON 视图中的索引
                    const newIndex = targetSheet.content.length; // executeMutation 已同步 JSON 视图
                    logDebug_ACU(`insertRow: [SQLite] Inserted row in [${englishTableName}]`);

                    await saveToLatestFloorAndRefresh(targetSheetKey, targetSheet.name, ctx, 'insertRow');
                    return newIndex;
                } else {
                    // 原生模式：直接操作 JSON 数组，用中文列名在 headers 中定位
                    const newRow = new Array(headers.length).fill('');

                    for (const colName in data) {
                        const { chineseColName } = resolveColumnForSheet(englishTableName, colName);
                        const colIndex = headers.indexOf(chineseColName);
                        if (colIndex !== -1) {
                            newRow[colIndex] = data[colName];
                        }
                    }

                    targetSheet.content.push(newRow);
                    const newIndex = targetSheet.content.length - 1;

                    logDebug_ACU(`insertRow: Inserted row at index ${newIndex} in [${tableName}]`);

                    await saveToLatestFloorAndRefresh(targetSheetKey, targetSheet.name, ctx, 'insertRow');

                    return newIndex;
                }
            } catch (e) {
                logError_ACU('insertRow failed:', e);
                return -1;
            }
        },

        deleteRow: async function(tableName: string, rowIndex: number) {
            try {
                if (!currentJsonTableData_ACU) {
                    logError_ACU('deleteRow: No table data loaded.');
                    return false;
                }

                if (rowIndex < 1) {
                    logError_ACU('deleteRow: Cannot delete header row (index 0).');
                    return false;
                }

                const target = findTargetSheet(tableName);
                if (!target) {
                    logError_ACU(`deleteRow: Table "${tableName}" not found.`);
                    return false;
                }

                const { sheet: targetSheet, sheetKey: targetSheetKey, englishTableName } = target;

                if (rowIndex >= targetSheet.content.length) {
                    logError_ACU(`deleteRow: Row index ${rowIndex} out of bounds.`);
                    return false;
                }

                if (isSqliteMode()) {
                    // SQLite 模式：用英文物理表名生成 DELETE SQL
                    const rowId = targetSheet.content[rowIndex]?.[0];
                    if (rowId === undefined || rowId === null) {
                        logError_ACU(`deleteRow: row_id not found at index ${rowIndex}`);
                        return false;
                    }
                    const sql = `DELETE FROM ${quoteIdentifier(englishTableName)} WHERE row_id = ${rowId};`;
                    const result = getStorageProvider().executeMutation(sql);
                    if (result.errors.length > 0) {
                        logError_ACU(`deleteRow SQL failed: ${result.errors.join(', ')}`);
                        return false;
                    }
                    logDebug_ACU(`deleteRow: [SQLite] Deleted row_id=${rowId} from [${englishTableName}]`);
                } else {
                    // 原生模式：直接操作 JSON 数组
                    targetSheet.content.splice(rowIndex, 1);
                    logDebug_ACU(`deleteRow: Deleted row ${rowIndex} from [${tableName}]`);
                }

                await saveToLatestFloorAndRefresh(targetSheetKey, targetSheet.name, ctx, 'deleteRow');

                return true;
            } catch (e) {
                logError_ACU('deleteRow failed:', e);
                return false;
            }
        },
    };
}

/**
 * 用反引号包裹标识符（表名/列名），防止中文或特殊字符导致 SQL 语法错误
 */
export function quoteIdentifier(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
}
