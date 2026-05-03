/**
 * service/table/update-orchestrator.ts — 表格更新编排（service 层：纯业务逻辑）
 * 从 presentation/triggers/update-process.ts 提取。
 * service 层不驱动 UI，只返回结果/状态，presentation 层根据返回值自行决定 UI 操作。
 */

import { isAutoUpdatingCard_ACU, wasStoppedByUser_ACU, _set_isAutoUpdatingCard_ACU, _set_manualExtraHint_ACU, _set_wasStoppedByUser_ACU } from '../runtime/state-manager';
import { callCustomOpenAI_ACU } from '../ai/prompt-builder';
import { getChatArray_ACU } from '../chat/chat-service';
import { coreApisAreReady_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../runtime/state-manager';
import { checkAutoMergeTrigger_ACU, prepareAutoMergeBatches_ACU, executeAutoMergeBatch_ACU, finalizeAutoMerge_ACU } from '../summary/merge-logic';
import { getChatSheetGuideDataForIsolationKey_ACU } from '../template/chat-scope';
import { loadAllChatMessages_ACU, updateReadableLorebookEntry_ACU } from '../worldbook/pipeline';
import { archiveSummaryVectorIndexNow_ACU } from '../vector/summary-vector-index-archive-service';
import { getCurrentWorldbookConfig_ACU } from '../settings/settings-readers';

import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';

/**
 * 表名标准化：trim 后空串视为无效键
 */
function normalizeTableNameForPresetLookup_ACU(name: any): string {
    const trimmed = String(name ?? '').trim();
    return trimmed;
}

/**
 * 根据起始表的名称，查找表级 API 预设覆盖
 * @returns 预设名称，空字符串表示使用全局 tableApiPreset
 */
function resolveTableApiPresetOverride_ACU(tableName: any): string {
    const normalizedName = normalizeTableNameForPresetLookup_ACU(tableName);
    if (!normalizedName) return '';
    const overrides = settings_ACU.tableApiPresetOverridesByName;
    if (!overrides || typeof overrides !== 'object') return '';
    const preset = overrides[normalizedName];
    return (typeof preset === 'string' && preset.trim()) ? preset.trim() : '';
}
import { checkIfFirstTimeInit_ACU, saveIndependentTableToChatHistory_ACU } from './table-service';
import { parseAndApplyTableEdits_ACU, prepareAIInput_ACU } from '../ai/prompt-builder';
import { buildGuidedBaseDataFromSheetGuide_ACU, getSortedSheetKeys_ACU } from '../template/chat-scope';
import { isSqliteMode } from './storage-mode';
import { reloadStorageProvider } from './table-storage-strategy';
import { clearTableDataAtFloors_ACU } from '../chat/chat-service';

// ============================================================
// 类型定义：返回值 + 进度事件（service 层不驱动 UI）
// ============================================================

/** 卡片更新进度事件阶段 */
export type CardUpdatePhase =
    | 'preparing'        // 准备 AI 输入
    | 'calling_ai'       // 调用 AI（含重试信息）
    | 'parsing'          // 解析 AI 返回
    | 'saving'           // 保存到聊天记录
    | 'chunk_done'       // 分块处理成功（import 模式）
    | 'complete'         // 完成
    | 'retry'            // 重试中
    | 'error';           // 出错

/** 卡片更新进度事件 */
export interface CardUpdateProgressEvent {
    phase: CardUpdatePhase;
    attempt?: number;
    maxRetries?: number;
    message?: string;
    currentBatch?: number;
    totalBatches?: number;
}

/** 批处理进度上下文 */
export interface BatchUpdateProgressContext {
    currentBatch: number;
    totalBatches: number;
}

/** executeCardUpdateCore 的返回值 */
export interface CardUpdateResult {
    success: boolean;
    modifiedKeys: string[];
    error?: string;
    aborted?: boolean;
}

/** processUpdatesBatch 的返回值 */
export interface BatchUpdateResult {
    success: boolean;
    failedBatch?: number;
    error?: string;
}

/** orchestrateManualUpdate 的返回值 */
export interface ManualUpdateResult {
    success: boolean;
    error?: string;
    /** 是否触发了自动合并 */
    autoMergeTriggered?: boolean;
    autoMergeSuccess?: boolean;
}

// ============================================================
// 核心业务函数
// ============================================================

/**
 * 加载批次基础数据：从聊天记录中为每个表格查找最新数据
 * 纯业务逻辑，不涉及任何 UI 操作
 */
/**
 * [辅助] 从聊天记录加载旧数据覆盖 sheet 后，恢复指导表基底中的关键结构字段。
 *
 * 背景：loadBatchBaseData_ACU 从聊天记录中加载旧数据时，会整体覆盖 mergedBatchData[sheetKey]。
 * 但指导表基底中可能包含用户在可视化编辑器中修改过的 sourceData.ddl 和表头（content[0]），
 * 这些结构信息不应该被聊天记录中的旧数据覆盖。
 *
 * 只恢复 sourceData（含 DDL）和表头（content[0]），其他字段（name/uid/updateConfig/exportConfig）
 * 保留聊天记录中的值，因为它们可能在聊天过程中被合法修改。
 */
function restoreGuideStructure(mergedSheet: any, guideSheet: any): void {
    if (!guideSheet || typeof guideSheet !== 'object') return;
    if (!mergedSheet || typeof mergedSheet !== 'object') return;

    // 恢复 sourceData（包含 DDL、note 等用户在可视化编辑器中修改的关键配置）
    if (guideSheet.sourceData) mergedSheet.sourceData = JSON.parse(JSON.stringify(guideSheet.sourceData));

    // 恢复表头（content[0]）——指导表中的表头是用户最新编辑的
    if (Array.isArray(guideSheet.content) && guideSheet.content.length > 0 &&
        Array.isArray(mergedSheet.content) && mergedSheet.content.length > 0) {
        mergedSheet.content[0] = JSON.parse(JSON.stringify(guideSheet.content[0]));
    }
}

export function loadBatchBaseData_ACU(
    chatHistory: any[],
    firstMessageIndexOfBatch: number,
    batchIsolationKey: string,
    batchSheetKeys: string[],
    mergedBatchData: Record<string, any>
): { foundCount: number; totalCount: number } {
    const batchFoundSheets: Record<string, boolean> = {};
    batchSheetKeys.forEach(k => batchFoundSheets[k] = false);

    // [修复] 保存指导表基底中每个 sheet 的结构快照（sourceData/DDL/表头/表名等），
    // 以便从聊天记录加载旧数据覆盖后恢复。防止旧数据中的旧 DDL/旧表头覆盖用户在可视化编辑器中的修改。
    const guideSnapshots: Record<string, any> = {};
    batchSheetKeys.forEach(k => {
        if (mergedBatchData[k] && typeof mergedBatchData[k] === 'object') {
            guideSnapshots[k] = mergedBatchData[k];
        }
    });

    for (let j = firstMessageIndexOfBatch - 1; j >= 0; j--) {
        const msg = chatHistory[j];
        if (msg.is_user) continue;

        // [优先级1] 新版按标签分组存储
        if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[batchIsolationKey]) {
            const tagData = msg.TavernDB_ACU_IsolatedData[batchIsolationKey];
            const independentData = tagData.independentData || {};

            Object.keys(independentData).forEach(storedSheetKey => {
                if (batchFoundSheets[storedSheetKey] === false && mergedBatchData[storedSheetKey]) {
                    mergedBatchData[storedSheetKey] = JSON.parse(JSON.stringify(independentData[storedSheetKey]));
                    restoreGuideStructure(mergedBatchData[storedSheetKey], guideSnapshots[storedSheetKey]);
                    batchFoundSheets[storedSheetKey] = true;
                }
            });
        }

        // [优先级2] 兼容旧版存储格式
        const msgIdentity = msg.TavernDB_ACU_Identity;
        let isLegacyMatch = false;
        if (settings_ACU.dataIsolationEnabled) {
            isLegacyMatch = (msgIdentity === settings_ACU.dataIsolationCode);
        } else {
            isLegacyMatch = !msgIdentity;
        }

        if (isLegacyMatch) {
            if (msg.TavernDB_ACU_IndependentData) {
                const independentData = msg.TavernDB_ACU_IndependentData;
                Object.keys(independentData).forEach(storedSheetKey => {
                    if (batchFoundSheets[storedSheetKey] === false && mergedBatchData[storedSheetKey]) {
                        mergedBatchData[storedSheetKey] = JSON.parse(JSON.stringify(independentData[storedSheetKey]));
                        restoreGuideStructure(mergedBatchData[storedSheetKey], guideSnapshots[storedSheetKey]);
                        batchFoundSheets[storedSheetKey] = true;
                    }
                });
            }

            if (msg.TavernDB_ACU_Data) {
                const standardData = msg.TavernDB_ACU_Data;
                Object.keys(standardData).forEach(k => {
                    if (k.startsWith('sheet_') && batchFoundSheets[k] === false && mergedBatchData[k]) {
                        mergedBatchData[k] = JSON.parse(JSON.stringify(standardData[k]));
                        restoreGuideStructure(mergedBatchData[k], guideSnapshots[k]);
                        batchFoundSheets[k] = true;
                    }
                });
            }

            if (msg.TavernDB_ACU_SummaryData) {
                const summaryData = msg.TavernDB_ACU_SummaryData;
                Object.keys(summaryData).forEach(k => {
                    if (k.startsWith('sheet_') && batchFoundSheets[k] === false && mergedBatchData[k]) {
                        mergedBatchData[k] = JSON.parse(JSON.stringify(summaryData[k]));
                        restoreGuideStructure(mergedBatchData[k], guideSnapshots[k]);
                        batchFoundSheets[k] = true;
                    }
                });
            }
        }

        if (Object.values(batchFoundSheets).every(v => v === true)) {
            break;
        }
    }

    const foundCount = Object.values(batchFoundSheets).filter(v => v === true).length;
    const totalCount = batchSheetKeys.length;
    return { foundCount, totalCount };
}

/**
 * 构建批次合并基底数据
 * 纯业务逻辑，不涉及任何 UI 操作
 */
export function buildBatchMergeBase_ACU(batchNumber: number): { data: Record<string, any> | null; error: string | null } {
    try {
        const batchIsoKey = getCurrentIsolationKey_ACU();
        const sheetGuideForBatch = getChatSheetGuideDataForIsolationKey_ACU(batchIsoKey);
        if (sheetGuideForBatch && typeof sheetGuideForBatch === 'object' && Object.keys(sheetGuideForBatch).some(k => k.startsWith('sheet_'))) {
            const data = buildGuidedBaseDataFromSheetGuide_ACU(sheetGuideForBatch);
            logDebug_ACU(`[Batch ${batchNumber}] Using chat sheet guide as merge base.`);
            return { data, error: null };
        } else {
            const data = parseTableTemplateJson_ACU({ stripSeedRows: true });
            logDebug_ACU(`[Batch ${batchNumber}] No chat sheet guide found, using template as merge base.`);
            return { data, error: null };
        }
    } catch (e) {
        logError_ACU(`[Batch ${batchNumber}] Failed to build merge base from guide/template.`, e);
        return { data: null, error: '无法构建合并基底，操作已终止。' };
    }
}

/**
 * 确定更新模式
 * 纯业务逻辑
 */
export function resolveUpdateMode_ACU(mode: string): string {
    if (mode === 'auto_unified' || mode === 'manual_unified' || mode === 'full') {
        return mode;
    } else if (mode === 'auto_summary_silent') {
        return 'auto_summary_silent';
    } else if (mode && mode.startsWith('manual')) {
        if (mode.includes('summary')) return 'manual_summary';
        else if (mode === 'manual_independent') return 'manual_independent';
        else return 'manual_standard';
    } else {
        if (mode && mode.includes('summary')) return 'auto_summary';
        else return 'auto_standard';
    }
}

/**
 * 执行单次卡片更新的核心逻辑（AI调用 + 重试 + 解析 + 保存）
 * 纯业务逻辑，不驱动 UI。通过可选的 onProgress 回调传递纯数据进度事件。
 * presentation 层根据返回值和进度事件自行决定 UI 操作。
 */
export async function executeCardUpdateCore_ACU(
    messagesToUse: any[],
    saveTargetIndex: number,
    isImportMode: boolean,
    updateMode: string,
    isSilentMode: boolean,
    targetSheetKeys: string[] | null,
    requestOptions: Record<string, any> | null,
    abortController: AbortController,
    progressContext: BatchUpdateProgressContext | null = null,
    onProgress?: (event: CardUpdateProgressEvent) => void
): Promise<CardUpdateResult> {
    const emitProgress = (event: CardUpdateProgressEvent): void => {
        onProgress?.({
            ...event,
            ...(progressContext
                ? {
                    currentBatch: progressContext.currentBatch,
                    totalBatches: progressContext.totalBatches,
                }
                : {}),
        });
    };
    let success = false;
    let modifiedKeys: string[] = [];
    const maxRetries = settings_ACU.tableMaxRetries || 3;

    try {
        emitProgress({ phase: 'preparing' });

        const dynamicContent = await prepareAIInput_ACU(messagesToUse, updateMode, targetSheetKeys, {
            excludeImportTaggedWorldbookEntries: isImportMode && settings_ACU.importPromptExcludeImportedWorldbookEntries !== false,
        });
        if (!dynamicContent) {
            return { success: false, modifiedKeys: [], error: '无法准备AI输入，数据库未加载。' };
        }

        const SQL_ERROR_MARKER = '\n\n<!-- SQL_ERROR_FEEDBACK -->\n';
        let lastSqlError: string | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (wasStoppedByUser_ACU) {
                return { success: false, modifiedKeys: [], aborted: true };
            }

            emitProgress({ phase: 'calling_ai', attempt, maxRetries });

            if (lastSqlError && isSqliteMode()) {
                const markerIndex = dynamicContent.tableDataText.indexOf(SQL_ERROR_MARKER);
                if (markerIndex !== -1) {
                    dynamicContent.tableDataText = dynamicContent.tableDataText.substring(0, markerIndex);
                }
                dynamicContent.tableDataText += `${SQL_ERROR_MARKER}[SQL执行错误，请修正后重新输出]\n错误信息: ${lastSqlError}`;
            }

            try {
                const aiResponse = await callCustomOpenAI_ACU(dynamicContent, abortController, requestOptions);

                if (abortController.signal.aborted || wasStoppedByUser_ACU) {
                    return { success: false, modifiedKeys: [], aborted: true };
                }

                const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;
                if (aiResponse && minReplyLength > 0 && aiResponse.length < minReplyLength) {
                    throw new Error(`AI回复过短 (${aiResponse.length} 字符)，低于阈值 (${minReplyLength} 字符)`);
                }

                if (!aiResponse || !aiResponse.includes('<tableEdit>') || !aiResponse.includes('</tableEdit>')) {
                    throw new Error('AI响应中未找到完整有效的 <tableEdit> 标签');
                }

                emitProgress({ phase: 'parsing' });

                const parseResult = parseAndApplyTableEdits_ACU(aiResponse, updateMode, isImportMode);

                let parseSuccess = false;
                modifiedKeys = [];

                if (typeof parseResult === 'object' && parseResult !== null) {
                    parseSuccess = parseResult.success;
                    modifiedKeys = parseResult.modifiedKeys || [];
                } else {
                    parseSuccess = !!parseResult;
                    modifiedKeys = targetSheetKeys || [];
                }

                if (!parseSuccess) {
                    throw new Error('解析或应用AI更新时出错');
                }

                success = true;
                break;

            } catch (error: any) {
                logWarn_ACU(`第 ${attempt} 次尝试失败: ${error.message}`);

                if (isSqliteMode() && error.message) {
                    lastSqlError = error.message;
                }

                if (error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted') || wasStoppedByUser_ACU) {
                    return { success: false, modifiedKeys: [], aborted: true };
                }

                if (attempt < maxRetries) {
                    const waitTime = 5000;
                    logDebug_ACU(`等待 ${waitTime}ms 后重试...`);
                    emitProgress({ phase: 'retry', attempt, maxRetries, message: error.message?.substring(0, 50) });
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                } else {
                    return { success: false, modifiedKeys: [], error: `填表在 ${maxRetries} 次尝试后仍失败: ${error.message}` };
                }
            }
        }

        if (success) {
            if (!isImportMode) {
                emitProgress({ phase: 'saving' });

                let keysToPersist = modifiedKeys;
                if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
                    keysToPersist = keysToPersist.filter((k: string) => targetSheetKeys.includes(k));
                }

                const isFirstTimeInit = await checkIfFirstTimeInit_ACU();

                if (keysToPersist.length > 0 || isFirstTimeInit) {
                    let keysToActuallySave = keysToPersist;
                    if (isFirstTimeInit) {
                        const allSheetKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
                        keysToActuallySave = allSheetKeys;

                        const fullTemplate = parseTableTemplateJson_ACU({ stripSeedRows: false });
                        if (fullTemplate) {
                            allSheetKeys.forEach(sheetKey => {
                                if (!keysToPersist.includes(sheetKey) && fullTemplate[sheetKey]) {
                                    currentJsonTableData_ACU[sheetKey] = JSON.parse(JSON.stringify(fullTemplate[sheetKey]));
                                    logDebug_ACU(`[Init] Table ${sheetKey} not modified by AI, using template data (may include seed rows).`);
                                }
                            });
                        }

                        logDebug_ACU('[Init] First time initialization detected. Saving complete template structure with all tables.');
                    }

                    const updateGroupKeysRaw = isFirstTimeInit ? keysToPersist : targetSheetKeys;
                    const keysToTrackAsUpdated = keysToPersist.filter((sheetKey: string) => keysToActuallySave.includes(sheetKey));
                    const updateGroupKeysToUse = Array.isArray(updateGroupKeysRaw)
                        ? updateGroupKeysRaw.filter(sheetKey => {
                            const table = currentJsonTableData_ACU?.[sheetKey];
                            if (!table || !isSummaryOrOutlineTable_ACU(table.name)) return true;
                            return keysToTrackAsUpdated.includes(sheetKey);
                        })
                        : updateGroupKeysRaw;
                    const saveSuccess = await saveIndependentTableToChatHistory_ACU(
                        saveTargetIndex,
                        keysToActuallySave,
                        updateGroupKeysToUse,
                        false,
                        keysToTrackAsUpdated,
                    );
                    if (!saveSuccess) {
                        return { success: false, modifiedKeys, error: '无法将更新后的数据库保存到聊天记录。' };
                    }
                } else {
                    logDebug_ACU("No tables were modified by AI, skipping save to chat history.");
                }

                    await updateReadableLorebookEntry_ACU(true);

                    if (getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true) {
                        try {
                            const archiveResult = await archiveSummaryVectorIndexNow_ACU({ targetMessageIndex: saveTargetIndex, mode: 'append', saveChatAfterWrite: false });
                            if (!archiveResult.success && !archiveResult.skipped) {
                                logWarn_ACU('[交火模式纪要索引] 填表完成后自动归档失败:', archiveResult.errors?.join('; ') || archiveResult.reason || 'unknown_error');
                            } else {
                                logDebug_ACU(`[交火模式纪要索引] 填表完成后自动归档完成：rows=${archiveResult.indexedRowCount}, chunks=${archiveResult.chunkCount}, skipped=${archiveResult.skipped}, reason=${archiveResult.reason || ''}`);
                            }
                        } catch (archiveError) {
                            logWarn_ACU('[交火模式纪要索引] 填表完成后自动归档异常，已保留本次表格保存结果:', archiveError);
                        }
                    }
            } else {
                emitProgress({ phase: 'chunk_done' });
                logDebug_ACU("Import mode: skipping save to chat history for this chunk.");
            }

            emitProgress({ phase: 'complete' });
        }
        return { success, modifiedKeys };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            logDebug_ACU('Fetch request was aborted by the user.');
            return { success: false, modifiedKeys: [], aborted: true };
        } else {
            logError_ACU(`数据库增量更新流程失败: ${error.message}`);
            return { success: false, modifiedKeys: [], error: error.message };
        }
    }
}

/**
 * 批处理更新编排（纯业务逻辑）
 * 从 processUpdates_ACU 提取。不驱动 UI，只返回结果。
 */
export async function processUpdatesBatch_ACU(
    indicesToUpdate: number[],
    mode: string,
    options: any,
    executeUpdate: (
        messagesToUse: any[],
        saveTargetIndex: number,
        updateMode: string,
        isSilentMode: boolean,
        targetSheetKeys: string[] | null,
        requestOptions: Record<string, any> | null,
        progressContext: BatchUpdateProgressContext
    ) => Promise<CardUpdateResult>
): Promise<BatchUpdateResult> {
    if (!indicesToUpdate || indicesToUpdate.length === 0) {
        return { success: true };
    }

    const { targetSheetKeys, batchSize: specificBatchSize, requestOptions } = options;

    _set_isAutoUpdatingCard_ACU(true);

    const isSummaryMode = (mode && (mode.includes('summary') || mode === 'manual_summary')) || false;
    const batchSize = specificBatchSize || (settings_ACU.updateBatchSize || 2);

    const batches: number[][] = [];
    for (let i = 0; i < indicesToUpdate.length; i += batchSize) {
        batches.push(indicesToUpdate.slice(i, i + batchSize));
    }

    logDebug_ACU(`[${mode}] Processing ${indicesToUpdate.length} updates in ${batches.length} batches of size ${batchSize} (${isSummaryMode ? '总结表模式' : '标准表模式'}). Target Sheets: ${targetSheetKeys ? targetSheetKeys.length : 'All'}`);

    const chatHistory = getChatArray_ACU();
    const isAutoUpdateMode = mode && mode.startsWith('auto');
    const isSilentMode = !!(isAutoUpdateMode && settings_ACU.toastMuteEnabled);

    for (let i = 0; i < batches.length; i++) {
        const batchIndices = batches[i];
        const batchNumber = i + 1;
        const firstMessageIndexOfBatch = batchIndices[0];
        const lastMessageIndexOfBatch = batchIndices[batchIndices.length - 1];
        const finalSaveTargetIndex = lastMessageIndexOfBatch;

        // 构建合并基底
        const baseResult = buildBatchMergeBase_ACU(batchNumber);
        if (!baseResult.data) {
            _set_isAutoUpdatingCard_ACU(false);
            return { success: false, failedBatch: batchNumber, error: baseResult.error || '无法构建合并基底，操作已终止。' };
        }
        const mergedBatchData = baseResult.data;

        const batchSheetKeys = getSortedSheetKeys_ACU(mergedBatchData);
        const batchIsolationKey = getCurrentIsolationKey_ACU();

        // 加载历史数据
        const loadResult = loadBatchBaseData_ACU(chatHistory, firstMessageIndexOfBatch, batchIsolationKey, batchSheetKeys, mergedBatchData);
        _set_currentJsonTableData_ACU(mergedBatchData);
        logDebug_ACU(`[Batch ${batchNumber}] Loaded ${loadResult.foundCount}/${loadResult.totalCount} tables from history before index ${firstMessageIndexOfBatch}. Missing tables will use template structure (header-only).`);

        // 计算上下文范围
        let sliceStartIndex = firstMessageIndexOfBatch;
        if (sliceStartIndex > 0 && chatHistory[sliceStartIndex - 1]?.is_user) {
            sliceStartIndex--;
            logDebug_ACU(`[Batch ${batchNumber}] Adjusted slice start to ${sliceStartIndex} to include preceding user message.`);
        }
        const messagesForContext = chatHistory.slice(sliceStartIndex, lastMessageIndexOfBatch + 1);

        // 检查最新AI回复长度阈值
        const lastAiMessageInBatch = chatHistory[lastMessageIndexOfBatch];
        const lastAiMessageContent = lastAiMessageInBatch?.mes || lastAiMessageInBatch?.message || '';
        const lastAiMessageLength = lastAiMessageContent.length;
        const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;

        if (isAutoUpdateMode && lastAiMessageLength < minReplyLength) {
            logDebug_ACU(`[Auto] Batch ${batchNumber}/${batches.length} skipped: Last AI reply length (${lastAiMessageLength}) is below threshold (${minReplyLength}).`);
            continue;
        }

        // 确定更新模式
        const updateMode = resolveUpdateMode_ACU(mode);

        // 决议 effective API preset：如果调用方未指定 tableApiPreset，
        // 则以 targetSheetKeys 中第一个表名为准查覆盖映射
        let effectiveRequestOptions = requestOptions;
        if (!effectiveRequestOptions?.tableApiPreset && targetSheetKeys && targetSheetKeys.length > 0) {
            const templateForLookup = parseTableTemplateJson_ACU({ stripSeedRows: true });
            const firstTableName = templateForLookup?.[targetSheetKeys[0]]?.name || '';
            const resolvedPreset = resolveTableApiPresetOverride_ACU(firstTableName);
            if (resolvedPreset) {
                effectiveRequestOptions = { ...(effectiveRequestOptions || {}), tableApiPreset: resolvedPreset };
            }
        }

        const result = await executeUpdate(
            messagesForContext,
            finalSaveTargetIndex,
            updateMode,
            isSilentMode,
            targetSheetKeys,
            effectiveRequestOptions,
            { currentBatch: batchNumber, totalBatches: batches.length }
        );

        if (!result.success) {
            _set_isAutoUpdatingCard_ACU(false);
            return { success: false, failedBatch: batchNumber, error: result.error || `批处理在第 ${batchNumber} 批时失败或被终止。` };
        }
    }

    _set_isAutoUpdatingCard_ACU(false);
    return { success: true };
}

/**
 * 手动更新编排（纯业务逻辑）
 * 从 handleManualUpdate_ACU 提取。不驱动 UI，只返回结果。
 * presentation 层负责：收集 manualSelection、设置 manualExtraHint、刷新 UI、显示 toast、弹出确认框。
 *
 * @param targetKeys 手动选择的目标表格键列表
 * @param processBatch 批处理执行回调
 * @param refreshData 数据刷新回调
 * @param options 可选参数：
 *   - clearBeforeUpdate: 是否在手动填表前先清空目标楼层的表格数据（默认 false）。
 *     由 presentation 层根据用户确认框结果传入。当设为 true 时，
 *     会先计算所有 update group 的目标保存楼层，去重后逐个清空当前隔离标签的表格数据，
 *     再刷新内存状态，最后执行新的手动填表。
 */
export async function orchestrateManualUpdate_ACU(
    targetKeys: string[],
    processBatch: (indices: number[], mode: string, options: any) => Promise<BatchUpdateResult>,
    refreshData: () => Promise<void>,
    options: { clearBeforeUpdate?: boolean } = {},
): Promise<ManualUpdateResult> {
    try {
        if (isAutoUpdatingCard_ACU) {
            return { success: false, error: '数据库更新正在进行中，请稍候...' };
        }

        if (!coreApisAreReady_ACU) {
            return { success: false, error: 'API未就绪。' };
        }

        const apiIsConfigured = (settings_ACU.apiMode === 'custom' && (settings_ACU.apiConfig.useMainApi || (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model))) || (settings_ACU.apiMode === 'tavern' && settings_ACU.tavernProfile);
        if (!apiIsConfigured) {
            return { success: false, error: 'API未配置，无法更新数据库。' };
        }

        await loadAllChatMessages_ACU();
        await refreshData();

        if (!currentJsonTableData_ACU) {
            return { success: false, error: '数据库未加载。' };
        }
        const liveChat = getChatArray_ACU();
        if (!liveChat || liveChat.length === 0) {
            return { success: false, error: '聊天记录为空，无法更新。' };
        }

        const allAiMessageIndices = liveChat
            .map((msg: any, index: number) => !msg.is_user ? index : -1)
            .filter((index: number) => index !== -1);

        if (allAiMessageIndices.length === 0) {
            return { success: false, error: '尚未检测到AI回复，无法执行手动更新。' };
        }

        if (!targetKeys.length) {
            return { success: false, error: '未选择需要更新的表格。' };
        }

        const uiThreshold = settings_ACU.autoUpdateThreshold || 3;
        const uiBatchSize = settings_ACU.updateBatchSize || 3;
        const uiSkip = settings_ACU.skipUpdateFloors || 0;

        const effectiveAiIndices = uiSkip > 0 ? allAiMessageIndices.slice(0, -uiSkip) : allAiMessageIndices.slice();
        const contextScopeIndices = uiThreshold > 0 ? effectiveAiIndices.slice(-uiThreshold) : effectiveAiIndices;

        if (!contextScopeIndices.length) {
            return { success: false, error: '未找到可用的上下文进行手动更新，请检查阈值或跳过楼层设置。' };
        }

        const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true }) || {};
        const updateGroups: Record<string, any> = {};
        targetKeys.forEach((sheetKey: string) => {
            const tableConfig = templateData?.[sheetKey]?.updateConfig || {};
            const tableGroupId = Number.isFinite(tableConfig?.groupId)
                ? Math.trunc(tableConfig.groupId)
                : -1;
            // 手动更新只尊重分组 ID。updateFrequency/contextDepth/skipFloors 属于自动更新调度参数，
            // 混入手动路径会让用户选择被模板参数悄悄改写，属于职责污染。
            const groupKey = `${tableGroupId}|${contextScopeIndices.join(',')}|${uiBatchSize}`;
            if (!updateGroups[groupKey]) {
                updateGroups[groupKey] = {
                    indices: contextScopeIndices,
                    batchSize: uiBatchSize,
                    groupId: tableGroupId,
                    sheetKeys: []
                };
            }
            updateGroups[groupKey].sheetKeys.push(sheetKey);
        });
        const groupKeys = Object.keys(updateGroups);

        // ── 手动填表前预清空目标楼层的表格数据 ──
        // 当 clearBeforeUpdate 为 true 时（用户已在 presentation 层确认），
        // 先计算每个 update group 的最终保存楼层（每批最后一条 AI 消息的物理索引），
        // 去重后逐个清空当前隔离标签下的表格数据，再刷新内存状态。
        // 这样可以防止 SQL 严格填表逻辑因目标楼层上的旧数据残留导致写入失败。
        if (options.clearBeforeUpdate) {
            const targetFloorSet = new Set<number>();
            const targetSheetKeySet = new Set<string>();
            for (const gKey of groupKeys) {
                const group = updateGroups[gKey];
                (group.sheetKeys || []).forEach((sheetKey: string) => targetSheetKeySet.add(sheetKey));
                // 每个 group 的 indices 按 batchSize 分批，每批的最后一条就是该批的 finalSaveTargetIndex。
                // 这里简化处理：取该 group 的 indices 列表中最后一个 index 作为最终保存目标。
                // （同一个 group 内所有 batch 的 contextScopeIndices 是相同的，
                //   processUpdatesBatch 会按 batchSize 切分后取每批最后一个作为保存目标，
                //   但对于"清空目标楼层"来说，只需要清空 indices 中涉及的最后几个楼层即可。
                //   考虑到 batch 切分逻辑较复杂，这里保守地清空所有 contextScopeIndices 涉及的楼层。）
                if (group.indices && group.indices.length > 0) {
                    // 取该 group 上下文范围内的最后 batchSize 个楼层作为清空目标
                    // 因为 processUpdatesBatch 会把 indices 按 batchSize 切分，
                    // 每批保存到该批最后一条消息。所以只需要清空 indices 列表中的楼层。
                    group.indices.forEach((idx: number) => targetFloorSet.add(idx));
                }
            }

            const targetFloors = Array.from(targetFloorSet);
            const targetSheetKeysForClear = Array.from(targetSheetKeySet);
            if (targetFloors.length > 0) {
                logDebug_ACU(`[Manual Update] 预清空目标楼层: ${targetFloors.join(', ')} (共 ${targetFloors.length} 层)`);
                const clearedCount = await clearTableDataAtFloors_ACU(targetFloors, targetSheetKeysForClear);
                logDebug_ACU(`[Manual Update] 预清空完成: ${clearedCount} 层已清空`);

                // 清空后必须刷新内存数据，确保后续填表基于干净状态
                await loadAllChatMessages_ACU();

                // [关键] 重建 Storage Provider（尤其是 SQLite 模式）
                // 只清空聊天消息字段是不够的——SQLite 引擎在内存中持有独立的数据库实例，
                // 必须先 dispose 旧引擎、创建新引擎、从已清空的聊天消息重新 loadFromChat，
                // 否则后续 applyEdits 仍会在旧内存数据库上执行 SQL，
                // 导致 UNIQUE constraint 等冲突。
                try {
                    await reloadStorageProvider();
                } catch (reloadError: any) {
                    logWarn_ACU(`[Manual Update] reloadStorageProvider 失败: ${reloadError?.message}，继续使用当前 provider`);
                }

                await refreshData();
            }
        }

        _set_isAutoUpdatingCard_ACU(true);
        const maxConcurrentGroups = Math.max(1, Number(settings_ACU.maxConcurrentGroups) || 1);
        const failedGroups: Array<{ key: string; error?: string }> = [];

        for (let start = 0; start < groupKeys.length; start += maxConcurrentGroups) {
            const chunkKeys = groupKeys.slice(start, start + maxConcurrentGroups);
            const groupPromises = chunkKeys.map(gKey => (async () => {
                const group = updateGroups[gKey];

                logDebug_ACU(`[Manual Parallel] Processing group update for groupId=${group.groupId}, sheets: ${group.sheetKeys.join(', ')}, apiPreset=(manual-global), chunk=${Math.floor(start / maxConcurrentGroups) + 1}`);
                const batchResult = await processBatch(group.indices, 'manual_independent', {
                    targetSheetKeys: group.sheetKeys,
                    batchSize: group.batchSize,
                    requestOptions: null,
                });

                return {
                    key: gKey,
                    groupId: group.groupId,
                    sheetKeys: group.sheetKeys,
                    result: batchResult,
                };
            })());

            const results = await Promise.allSettled(groupPromises);
            results.forEach((settledResult, idx) => {
                const gKey = chunkKeys[idx];
                const group = updateGroups[gKey];
                if (settledResult.status === 'rejected') {
                    failedGroups.push({
                        key: gKey,
                        error: settledResult.reason instanceof Error
                            ? settledResult.reason.message
                            : String(settledResult.reason || '手动更新分组执行异常。'),
                    });
                    logError_ACU(`[Manual Parallel] Group update threw for groupId=${group?.groupId}, sheets=${(group?.sheetKeys || []).join(', ')}:`, settledResult.reason);
                    return;
                }

                const batchResult = settledResult.value.result;
                if (!batchResult.success) {
                    failedGroups.push({
                        key: settledResult.value.key,
                        error: batchResult.error || '手动更新失败或被终止。',
                    });
                    logWarn_ACU(`[Manual Parallel] Group update failed for groupId=${settledResult.value.groupId}, sheets=${settledResult.value.sheetKeys.join(', ')}: ${batchResult.error || 'unknown error'}`);
                }
            });

            // 并发组内禁止每组单独刷新：多组同时写聊天记录时，提前刷新会制造中间态覆盖风险。
            // 每个并发 chunk 结束后统一刷新一次，确保后续 chunk 基于已落盘的最新状态继续执行。
            await loadAllChatMessages_ACU();
            await refreshData();

            if (failedGroups.length > 0) {
                break;
            }
        }

        _set_isAutoUpdatingCard_ACU(false);

        if (failedGroups.length > 0) {
            // [修复] 填表失败时，processUpdatesBatch 内部的 loadBatchBaseData 已经用聊天记录中的旧数据
            // 覆盖了 currentJsonTableData_ACU（包括旧表头）。必须调用 refreshData 恢复到正确状态，
            // 否则用户重新打开可视化编辑器时会看到旧表头（指导表中的新表头不会被应用）。
            try {
                await loadAllChatMessages_ACU();
                await refreshData();
            } catch (e) {
                logWarn_ACU('[Manual Update] 填表失败后恢复数据时出错:', e);
            }
            const firstFailure = failedGroups[0];
            return { success: false, error: firstFailure.error || '手动更新失败或被终止。' };
        }

        // 手动更新完成后检测自动合并总结
        let autoMergeTriggered = false;
        let autoMergeSuccess = false;
        try {
            const trigger = checkAutoMergeTrigger_ACU();
            if (trigger.shouldTrigger) {
                autoMergeTriggered = true;
                const prepared = prepareAutoMergeBatches_ACU({
                    startIndex: 0, endIndex: trigger.mergeCount, targetCount: 1,
                    batchSize: 5, promptTemplate: '', isAutoMode: true,
                });
                let acc: any[] = [];
                for (let i = 0; i < prepared.batches.length; i++) {
                    const batchResult = await executeAutoMergeBatch_ACU(prepared, prepared.batches[i], acc);
                    acc = batchResult.accumulatedSummary;
                }
                await finalizeAutoMerge_ACU(prepared, acc);
                autoMergeSuccess = true;
            }
        } catch (e) {
            logWarn_ACU('自动合并总结检测失败:', e);
        }

        return { success: true, autoMergeTriggered, autoMergeSuccess };
    } finally {
        _set_manualExtraHint_ACU('');
        _set_isAutoUpdatingCard_ACU(false);
    }
}
