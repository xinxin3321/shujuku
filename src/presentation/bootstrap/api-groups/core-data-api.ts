/**
 * presentation/bootstrap/api-groups/core-data-api.ts
 * 核心数据操作 API — exportTableAsJson / importTableAsJson / triggerUpdate
 */

import { ACU_TOAST_CATEGORY_ACU } from '../../../shared/constants';
import { topLevelWindow_ACU } from '../../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { SillyTavern_API_ACU, type ACUMessage } from '../../../shared/host-api';
import {
    currentJsonTableData_ACU,
    _set_currentJsonTableData_ACU,
    isAutoUpdatingCard_ACU,
    _set_isAutoUpdatingCard_ACU,
    settings_ACU,
    getCurrentIsolationKey_ACU,
} from '../../../service/runtime/state-manager';
import { sanitizeChatSheetsObject_ACU, sanitizeSheetForStorage_ACU } from '../../../service/template/chat-scope';
import { loadAllChatMessages_ACU } from '../../../service/worldbook/pipeline';
import { getEffectiveAutoUpdateThreshold_ACU } from '../../../service/runtime/helpers-remaining';
import { proceedWithCardUpdate_ACU } from '../../triggers/update-process';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../../components/pipeline-ui-helpers';
import { showToastr_ACU } from '../../theme/toast';
import { getCurrentWorldbookConfig_ACU } from '../../../service/settings/settings-readers';
import { archiveSummaryVectorIndexNow_ACU } from '../../../service/vector/summary-vector-index-archive-service';
import type { ApiGroupContext } from './callback-api';

export function createCoreDataApi(ctx: ApiGroupContext): Record<string, Function> {
    return {
        // 导出当前表格数据
        exportTableAsJson: function() {
            return currentJsonTableData_ACU || {};
        },

        // 导入并覆盖当前表格数据
        importTableAsJson: async function(jsonString: any) {
            if (typeof jsonString !== 'string' || jsonString.trim() === '') {
                logError_ACU('importTableAsJson received invalid input.');
                showToastr_ACU('error', '导入数据失败：输入为空。');
                return false;
            }
            try {
                const newData = JSON.parse(jsonString);
                if (newData && newData.mate && Object.keys(newData).some(k => k.startsWith('sheet_'))) {
                    _set_currentJsonTableData_ACU(sanitizeChatSheetsObject_ACU(newData, { ensureMate: true }));
                    logDebug_ACU('Successfully imported new table data into memory.');

                    let targetMessageIndexForVectorSync = -1;
                    const chat = SillyTavern_API_ACU.chat;
                    if (chat && chat.length > 0) {
                        let targetMessage: ACUMessage | null = null;
                        let finalIndex = -1;
                        for (let i = chat.length - 1; i >= 0; i--) {
                            if (!chat[i].is_user) {
                                targetMessage = chat[i];
                                finalIndex = i;
                                targetMessageIndexForVectorSync = i;
                                break;
                            }
                        }

                        if (targetMessage) {
                            // 同步更新 IsolatedData
                            try {
                            const newIndependentData: Record<string, any> = {};
                                Object.keys(currentJsonTableData_ACU).forEach(k => {
                                    if (k.startsWith('sheet_')) {
                                        newIndependentData[k] = sanitizeSheetForStorage_ACU(currentJsonTableData_ACU[k]);
                                    }
                                });

                                const currentIsolationKey = getCurrentIsolationKey_ACU();

                                let isolatedContainer = targetMessage.TavernDB_ACU_IsolatedData;
                                if (typeof isolatedContainer === 'string') {
                                    try {
                                        isolatedContainer = JSON.parse(isolatedContainer);
                                    } catch (e) {
                                        isolatedContainer = {};
                                    }
                                }
                                if (!isolatedContainer || typeof isolatedContainer !== 'object') isolatedContainer = {};

                                if (!isolatedContainer[currentIsolationKey]) {
                                    isolatedContainer[currentIsolationKey] = {
                                        independentData: {},
                                        modifiedKeys: [],
                                        updateGroupKeys: [],
                                    };
                                }

                                const tagData = isolatedContainer[currentIsolationKey];
                                tagData.independentData = newIndependentData;
                                tagData.modifiedKeys = Object.keys(newIndependentData);
                                tagData.updateGroupKeys = Object.keys(newIndependentData);

                                isolatedContainer[currentIsolationKey] = tagData;
                                targetMessage.TavernDB_ACU_IsolatedData = isolatedContainer;

                                if (settings_ACU.dataIsolationEnabled) {
                                    targetMessage.TavernDB_ACU_Identity = settings_ACU.dataIsolationCode;
                                } else {
                                    delete targetMessage.TavernDB_ACU_Identity;
                                }
                                targetMessage.TavernDB_ACU_IndependentData = newIndependentData;
                                targetMessage.TavernDB_ACU_ModifiedKeys = tagData.modifiedKeys;
                                targetMessage.TavernDB_ACU_UpdateGroupKeys = tagData.updateGroupKeys;
                            } catch (e) {
                                logWarn_ACU('[importTableAsJson] 同步 IsolatedData 失败（将继续执行旧写入以尽量保持可用）：', e);
                            }

                            // 分离标准表和总结表数据
                            const standardData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));
                            const summaryData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));

                            const standardTableIndexes = Object.keys(standardData).filter(k => k.startsWith('sheet_'));
                            standardTableIndexes.forEach(sheetKey => {
                                const table = standardData[sheetKey];
                                if (table && table.name && isSummaryOrOutlineTable_ACU(table.name)) {
                                    delete standardData[sheetKey];
                                }
                            });

                            const summaryTableIndexes = Object.keys(summaryData).filter(k => k.startsWith('sheet_'));
                            summaryTableIndexes.forEach(sheetKey => {
                                const table = summaryData[sheetKey];
                                if (table && table.name && !isSummaryOrOutlineTable_ACU(table.name)) {
                                    delete summaryData[sheetKey];
                                }
                            });

                            if (Object.keys(standardData).some(k => k.startsWith('sheet_'))) {
                                targetMessage.TavernDB_ACU_Data = sanitizeChatSheetsObject_ACU(standardData, { ensureMate: true });
                                logDebug_ACU(`Saved standard table data to message at index ${finalIndex}.`);
                            }

                            if (Object.keys(summaryData).some(k => k.startsWith('sheet_'))) {
                                targetMessage.TavernDB_ACU_SummaryData = sanitizeChatSheetsObject_ACU(summaryData, { ensureMate: true });
                                logDebug_ACU(`Saved summary table data to message at index ${finalIndex}.`);
                            }

                            await SillyTavern_API_ACU.saveChat();
                        }
                    }

                    await refreshMergedDataAndNotifyWithUI_ACU();

                    const importedSummaryTables = Object.keys(currentJsonTableData_ACU || {})
                        .filter(k => k.startsWith('sheet_'))
                        .some(k => {
                            const table = currentJsonTableData_ACU?.[k];
                            return table?.name && isSummaryOrOutlineTable_ACU(table.name);
                        });
                    if (importedSummaryTables && getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true) {
                        try {
                            const syncResult = await archiveSummaryVectorIndexNow_ACU({
                                targetMessageIndex: targetMessageIndexForVectorSync >= 0 ? targetMessageIndexForVectorSync : undefined,
                                mode: 'sync',
                                saveChatAfterWrite: false,
                            });
                            if (!syncResult.success && !syncResult.skipped) {
                                logWarn_ACU(`[importTableAsJson] 交火向量索引同步失败: reason=${syncResult.reason || 'unknown'}`, syncResult.errors || []);
                            } else {
                                logDebug_ACU(`[importTableAsJson] 交火向量索引已同步: reason=${syncResult.reason || 'ok'}`);
                            }
                        } catch (syncError) {
                            logError_ACU('[importTableAsJson] 交火向量索引同步异常（表格导入已完成）:', syncError);
                        }
                    }

                    return true;
                } else {
                    throw new Error('导入的JSON缺少关键结构 (mate, sheet_*)。');
                }
            } catch (error) {
                logError_ACU('Failed to import table data from JSON:', error);
                showToastr_ACU('error', `导入数据失败: ${error.message}`);
                return false;
            }
        },

        // 外部触发增量更新
        triggerUpdate: async function() {
            logDebug_ACU('External trigger for database update received.');
            if (isAutoUpdatingCard_ACU) {
                showToastr_ACU('info', '已有更新任务在后台进行中。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
                return false;
            }
            _set_isAutoUpdatingCard_ACU(true);
            try {
                await loadAllChatMessages_ACU();
                const chatHistory = SillyTavern_API_ACU.chat || [];
                const currentThreshold = getEffectiveAutoUpdateThreshold_ACU('manual_update');

                const allAiMessageIndices = chatHistory
                    .map((msg: any, index: number) => !msg.is_user ? index : -1)
                    .filter((index: number) => index !== -1);

                const numberOfAiMessages = allAiMessageIndices.length;

                let sliceStartIndex = 0;
                if (numberOfAiMessages > currentThreshold) {
                    const firstRelevantAiMessageMapIndex = numberOfAiMessages - currentThreshold;
                    const previousAiMessageMapIndex = firstRelevantAiMessageMapIndex - 1;
                    if (previousAiMessageMapIndex >= 0) {
                        sliceStartIndex = allAiMessageIndices[previousAiMessageMapIndex] + 1;
                    }
                }

                if (sliceStartIndex > 0 &&
                    chatHistory[sliceStartIndex] &&
                    !chatHistory[sliceStartIndex].is_user &&
                    chatHistory[sliceStartIndex - 1] &&
                    chatHistory[sliceStartIndex - 1].is_user)
                {
                    sliceStartIndex = sliceStartIndex - 1;
                    logDebug_ACU(`Adjusted slice start index to ${sliceStartIndex} to include preceding user message.`);
                }

                const messagesToProcess = chatHistory.slice(sliceStartIndex);
                return await proceedWithCardUpdate_ACU(messagesToProcess);
            } catch (error) {
                logError_ACU('triggerUpdate failed:', error);
                return false;
            } finally {
                _set_isAutoUpdatingCard_ACU(false);
            }
        },
    };
}
