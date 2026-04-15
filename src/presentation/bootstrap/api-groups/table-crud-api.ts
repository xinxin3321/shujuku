/**
 * presentation/bootstrap/api-groups/table-crud-api.ts
 * 表格 CRUD API — updateCell / updateRow / insertRow / deleteRow
 */

import { topLevelWindow_ACU } from '../../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { SillyTavern_API_ACU } from '../../../shared/host-api';
import {
    currentJsonTableData_ACU,
    settings_ACU,
    getCurrentIsolationKey_ACU,
} from '../../../service/runtime/state-manager';
import { saveIndependentTableToChatHistory_ACU } from '../../../service/table/table-service';
import { saveCurrentDataForTable_ACU } from '../../triggers/update-process';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../../components/pipeline-ui-helpers';
import type { ApiGroupContext } from './callback-api';

/**
 * 查找指定表格的目标 sheet 和 sheetKey
 */
function findTargetSheet(tableName: string): { sheet: any; sheetKey: string } | null {
    if (!currentJsonTableData_ACU) return null;
    for (const sheetKey in currentJsonTableData_ACU) {
        if (sheetKey.startsWith('sheet_') && currentJsonTableData_ACU[sheetKey].name === tableName) {
            return { sheet: currentJsonTableData_ACU[sheetKey], sheetKey };
        }
    }
    return null;
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
        const msg = chat[i];
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

                const { sheet: targetSheet, sheetKey: targetSheetKey } = target;

                if (!targetSheet.content || targetSheet.content.length === 0) {
                    logError_ACU(`updateCell: Table "${tableName}" has no content.`);
                    return false;
                }

                let colIndex = -1;
                if (typeof colIdentifier === 'number') {
                    colIndex = colIdentifier;
                } else {
                    const headers = targetSheet.content[0] || [];
                    colIndex = headers.indexOf(colIdentifier);
                }

                if (colIndex < 0 || colIndex >= (targetSheet.content[0] || []).length) {
                    logError_ACU(`updateCell: Column "${colIdentifier}" not found in table "${tableName}".`);
                    return false;
                }

                if (rowIndex < 1 || rowIndex >= targetSheet.content.length) {
                    logError_ACU(`updateCell: Row index ${rowIndex} out of bounds in table "${tableName}".`);
                    return false;
                }

                targetSheet.content[rowIndex][colIndex] = value;
                logDebug_ACU(`updateCell: Updated [${tableName}] row ${rowIndex}, col ${colIdentifier} = ${value}`);

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

                const { sheet: targetSheet, sheetKey: targetSheetKey } = target;

                while (targetSheet.content.length <= rowIndex) {
                    const newRow = new Array((targetSheet.content[0] || []).length).fill('');
                    targetSheet.content.push(newRow);
                }

                const headers = targetSheet.content[0] || [];
                const row = targetSheet.content[rowIndex];

                let updated = 0;
                for (const colName in data) {
                    const colIndex = headers.indexOf(colName);
                    if (colIndex !== -1) {
                        row[colIndex] = data[colName];
                        updated++;
                    } else {
                        logWarn_ACU(`updateRow: Column "${colName}" not found in table "${tableName}".`);
                    }
                }

                logDebug_ACU(`updateRow: Updated ${updated} cells in [${tableName}] row ${rowIndex}`);

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

                const { sheet: targetSheet, sheetKey: targetSheetKey } = target;

                const headers = targetSheet.content[0] || [];
                const newRow = new Array(headers.length).fill('');

                for (const colName in data) {
                    const colIndex = headers.indexOf(colName);
                    if (colIndex !== -1) {
                        newRow[colIndex] = data[colName];
                    }
                }

                targetSheet.content.push(newRow);
                const newIndex = targetSheet.content.length - 1;

                logDebug_ACU(`insertRow: Inserted row at index ${newIndex} in [${tableName}]`);

                await saveToLatestFloorAndRefresh(targetSheetKey, targetSheet.name, ctx, 'insertRow');

                return newIndex;
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

                const { sheet: targetSheet, sheetKey: targetSheetKey } = target;

                if (rowIndex >= targetSheet.content.length) {
                    logError_ACU(`deleteRow: Row index ${rowIndex} out of bounds.`);
                    return false;
                }

                targetSheet.content.splice(rowIndex, 1);

                logDebug_ACU(`deleteRow: Deleted row ${rowIndex} from [${tableName}]`);

                await saveToLatestFloorAndRefresh(targetSheetKey, targetSheet.name, ctx, 'deleteRow');

                return true;
            } catch (e) {
                logError_ACU('deleteRow failed:', e);
                return false;
            }
        },
    };
}
