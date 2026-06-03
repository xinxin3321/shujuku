/**
 * service/table/update-orchestrator.ts — 表格更新编排（service 层：纯业务逻辑）
 * 从 presentation/triggers/update-process.ts 提取。
 * service 层不驱动 UI，只返回结果/状态，presentation 层根据返回值自行决定 UI 操作。
 */

import { isAutoUpdatingCard_ACU, wasStoppedByUser_ACU, _set_isAutoUpdatingCard_ACU, _set_manualExtraHint_ACU, _set_wasStoppedByUser_ACU } from '../runtime/state-manager';
import { callCustomOpenAI_ACU } from '../ai/prompt-builder';
import { getChatArray_ACU } from '../chat/chat-service';
import { coreApisAreReady_ACU, currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../runtime/state-manager';
import { checkAutoMergeTrigger_ACU, prepareAutoMergeBatches_ACU, executeAutoMergeBatch_ACU, finalizeAutoMerge_ACU } from '../summary/merge-logic';
import { ensureStableRowIdsForSheetContent_ACU, getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU } from '../template/chat-scope';
import { loadAllChatMessages_ACU, updateReadableLorebookEntry_ACU } from '../worldbook/pipeline';
import { enqueueSummaryVectorIndexFlush_ACU } from '../vector/summary-vector-index-flush-queue';
import { getCurrentWorldbookConfig_ACU } from '../settings/settings-readers';

import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';

import { applyTableDelta_ACU, isDeltaTagData_ACU } from './table-delta';
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
import { checkIfFirstTimeInit_ACU, persistTablesToChatMessage_ACU, saveIndependentTableToChatHistoryWithinScopeLock_ACU } from './table-service';
import { parseAndApplyTableEdits_ACU, parseAndApplyTableEditsToData_ACU, prepareAIInput_ACU } from '../ai/prompt-builder';
import { isSqlContent } from '../ai/prompt-builder/table-edit-parser';
import { buildGuidedBaseDataFromSheetGuide_ACU, getSortedSheetKeys_ACU } from '../template/chat-scope';
import { isSqliteMode } from './storage-mode';
import { applySqlEditsToTableDataSnapshot_ACU } from './sql-table-service';
import { reloadStorageProvider } from './table-storage-strategy';
import { clearTableDataAtFloors_ACU } from '../chat/chat-service';
import { applySpecialIndexSequenceToSummaryTables_ACU } from '../runtime/helpers-remaining';
import { buildTableUpdateApplyScopeKey_ACU, runTableUpdateApplyWithScopeLock_ACU } from './table-update-queue';

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
    batchBaseSnapshot?: Record<string, any>;
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

export interface GroupFillJob_ACU {
    groupKey: string;
    groupId: number;
    batchNumber: number;
    targetSheetKeys: string[] | null;
    messagesForContext: any[];
    saveTargetIndex: number;
    updateMode: string;
    requestOptions: Record<string, any> | null;
    baseSnapshot: Record<string, any>;
    isImportMode?: boolean;
}

export interface GroupFillResponse_ACU {
    success: boolean;
    attempt: number;
    job: GroupFillJob_ACU;
    aiResponse?: string;
    tableEditText?: string;
    error?: string;
    rawError?: string;
    aborted?: boolean;
}

export interface UnifiedApplyAttempt_ACU {
    saveTargetIndex: number;
    responseCount: number;
    attempt: number;
    error?: string;
}

interface ManualRuntimeUpdateGroup_ACU {
    indices: number[];
    batchSize: number;
    groupId: number;
    sheetKeys: string[];
}

export interface GroupedRuntimeUpdateGroup_ACU {
    key: string;
    groupId: number;
    indices: number[];
    batchSize: number;
    sheetKeys: string[];
    requestOptions: Record<string, any> | null;
}

const SQL_ERROR_MARKER_ACU = '\n\n<!-- SQL_ERROR_FEEDBACK -->\n';
const UNIFIED_GROUP_ERROR_MARKER_ACU = '\n\n<!-- UNIFIED_GROUP_ERROR_FEEDBACK -->\n';

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

    // 收集 delta 楼层的增量数据（逆序收集，后续正序叠加）
    const pendingDeltas: { msgIndex: number; incrementalData: Record<string, any> }[] = [];

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

            // delta 楼层：收集增量，不做整表覆盖
            if (isDeltaTagData_ACU(tagData)) {
                if (tagData.incrementalData) {
                    pendingDeltas.push({ msgIndex: j, incrementalData: tagData.incrementalData });
                }
                continue;
            }

            // checkpoint / legacy 楼层：原 first-write-wins 逻辑
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

    // 正序叠加 delta 增量到已找到的 base 数据上
    if (pendingDeltas.length > 0) {
        pendingDeltas.reverse(); // 逆序收集 → 正序叠加
        for (const { incrementalData } of pendingDeltas) {
            for (const sheetKey of Object.keys(incrementalData)) {
                if (!mergedBatchData[sheetKey] || batchFoundSheets[sheetKey] === undefined) continue;
                try {
                    mergedBatchData[sheetKey] = applyTableDelta_ACU(mergedBatchData[sheetKey], incrementalData[sheetKey], sheetKey);
                    restoreGuideStructure(mergedBatchData[sheetKey], guideSnapshots[sheetKey]);
                    if (Array.isArray(mergedBatchData[sheetKey]?.content)) {
                        mergedBatchData[sheetKey].content = ensureStableRowIdsForSheetContent_ACU(mergedBatchData[sheetKey].content);
                    }
                    batchFoundSheets[sheetKey] = true;
                } catch (e: any) {
                    logWarn_ACU(`[表格增量] loadBatchBaseData: 叠加 delta 失败 (sheet=${sheetKey}): ${e?.message || e}`);
                }
            }
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

export async function collectGroupFillResponse_ACU(
    job: GroupFillJob_ACU,
    feedback?: { lastSqlError?: string | null; lastUnifiedError?: string | null },
    abortController: AbortController = new AbortController(),
    options: {
        onProgress?: (event: CardUpdateProgressEvent) => void;
        maxRetriesOverride?: number;
    } = {}
): Promise<GroupFillResponse_ACU> {
    options.onProgress?.({ phase: 'preparing' });

    const dynamicContent = await prepareAIInput_ACU(job.messagesForContext, job.updateMode, job.targetSheetKeys, {
        tableData: job.baseSnapshot,
        excludeImportTaggedWorldbookEntries: job.isImportMode === true && settings_ACU.importPromptExcludeImportedWorldbookEntries !== false,
    });
    if (!dynamicContent) {
        return {
            job,
            success: false,
            attempt: 0,
            error: '无法准备AI输入，数据库未加载。',
            rawError: '无法准备AI输入，数据库未加载。',
        };
    }

    const maxRetries = options.maxRetriesOverride || settings_ACU.tableMaxRetries || 3;
    let lastErrorMessage = 'AI响应中未找到完整有效的 <tableEdit> 标签';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (wasStoppedByUser_ACU) {
            return { job, success: false, attempt, aborted: true };
        }

        options.onProgress?.({ phase: 'calling_ai', attempt, maxRetries });

        if (feedback?.lastSqlError && isSqliteMode()) {
            const markerIndex = dynamicContent.tableDataText.indexOf(SQL_ERROR_MARKER_ACU);
            if (markerIndex !== -1) {
                dynamicContent.tableDataText = dynamicContent.tableDataText.substring(0, markerIndex);
            }
            dynamicContent.tableDataText += `${SQL_ERROR_MARKER_ACU}[SQL执行错误，请修正后重新输出]\n错误信息: ${feedback.lastSqlError}`;
        }
        if (feedback?.lastUnifiedError) {
            const markerIndex = dynamicContent.tableDataText.indexOf(UNIFIED_GROUP_ERROR_MARKER_ACU);
            if (markerIndex !== -1) {
                dynamicContent.tableDataText = dynamicContent.tableDataText.substring(0, markerIndex);
            }
            dynamicContent.tableDataText += `${UNIFIED_GROUP_ERROR_MARKER_ACU}[统一提交失败，请修正后重新输出]\n错误信息: ${feedback.lastUnifiedError}`;
        }

        try {
            const aiResponse = await callCustomOpenAI_ACU(dynamicContent, abortController, job.requestOptions);
            if (abortController.signal.aborted || wasStoppedByUser_ACU) {
                return { job, success: false, attempt, aborted: true };
            }

            const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;
            if (aiResponse && minReplyLength > 0 && aiResponse.length < minReplyLength) {
                throw new Error(`AI回复过短 (${aiResponse.length} 字符)，低于阈值 (${minReplyLength} 字符)`);
            }
            if (!aiResponse || !aiResponse.includes('<tableEdit>') || !aiResponse.includes('</tableEdit>')) {
                throw new Error('AI响应中未找到完整有效的 <tableEdit> 标签');
            }

            const tableEditText = (aiResponse.match(/<tableEdit>([\s\S]*?)<\/tableEdit>/i)?.[1] || '').trim();

            return { job, success: true, attempt, aiResponse, tableEditText };
        } catch (error: any) {
            lastErrorMessage = error?.message || '未知错误';
            logWarn_ACU(`第 ${attempt} 次尝试失败: ${lastErrorMessage}`);
            if (error?.name === 'AbortError' || String(lastErrorMessage).toLowerCase().includes('aborted') || wasStoppedByUser_ACU) {
                return { job, success: false, attempt, aborted: true };
            }
            if (attempt < maxRetries) {
                options.onProgress?.({ phase: 'retry', attempt, maxRetries, message: String(lastErrorMessage).substring(0, 50) });
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    return { job, success: false, attempt: maxRetries, error: `填表在 ${maxRetries} 次尝试后仍失败: ${lastErrorMessage}`, rawError: lastErrorMessage };
}

function buildSqlInitializationBase_ACU(baseSnapshot: Record<string, any>, targetSheetKeys: string[]) {
    const workingTableData = JSON.parse(JSON.stringify(baseSnapshot || {}));
    const initializedSheetKeys = new Set<string>();

    let templateData: Record<string, any> | null = null;
    let guideData: Record<string, any> | null = null;
    let guidedBaseData: Record<string, any> | null = null;

    try {
        templateData = parseTableTemplateJson_ACU({ stripSeedRows: false }) as Record<string, any> | null;
    } catch (error) {
        logWarn_ACU('[SQL Init] parseTableTemplateJson_ACU failed, fallback to baseSnapshot only.', error);
    }
    try {
        guideData = getChatSheetGuideDataForIsolationKey_ACU(getCurrentIsolationKey_ACU());
        guidedBaseData = guideData ? buildGuidedBaseDataFromSheetGuide_ACU(guideData) : null;
    } catch (error) {
        logWarn_ACU('[SQL Init] getChatSheetGuideDataForIsolationKey_ACU failed, fallback to template/baseSnapshot only.', error);
    }

    if (!workingTableData.mate && templateData?.mate) {
        workingTableData.mate = JSON.parse(JSON.stringify(templateData.mate));
    }

    for (const sheetKey of Array.isArray(targetSheetKeys) ? targetSheetKeys : []) {
        if (!sheetKey || !String(sheetKey).startsWith('sheet_')) continue;

        const templateSheet = templateData?.[sheetKey];
        const guidedSheet = guidedBaseData?.[sheetKey];
        const existingSheet = workingTableData?.[sheetKey];
        const sourceSheet = guidedSheet || templateSheet;
        if ((!existingSheet || typeof existingSheet !== 'object') && (!sourceSheet || typeof sourceSheet !== 'object')) continue;

        let sheetChanged = false;
        if (!existingSheet || typeof existingSheet !== 'object') {
            workingTableData[sheetKey] = {};
            sheetChanged = true;
        }

        const targetSheet = workingTableData[sheetKey];
        const fallbackUid = guidedSheet?.uid || templateSheet?.uid;
        const fallbackName = guidedSheet?.name || templateSheet?.name;
        const fallbackSourceData = guidedSheet?.sourceData && typeof guidedSheet.sourceData === 'object'
            ? guidedSheet.sourceData
            : (templateSheet?.sourceData && typeof templateSheet.sourceData === 'object' ? templateSheet.sourceData : null);
        const fallbackUpdateConfig = guidedSheet?.updateConfig && typeof guidedSheet.updateConfig === 'object'
            ? guidedSheet.updateConfig
            : (templateSheet?.updateConfig && typeof templateSheet.updateConfig === 'object' ? templateSheet.updateConfig : null);
        const fallbackExportConfig = guidedSheet?.exportConfig && typeof guidedSheet.exportConfig === 'object'
            ? guidedSheet.exportConfig
            : (templateSheet?.exportConfig && typeof templateSheet.exportConfig === 'object' ? templateSheet.exportConfig : null);
        const fallbackOrderNo = guidedSheet?.orderNo !== undefined ? guidedSheet.orderNo : templateSheet?.orderNo;
        const headerRow = Array.isArray(targetSheet?.content?.[0])
            ? targetSheet.content[0]
            : (Array.isArray(guidedSheet?.content?.[0])
                ? guidedSheet.content[0]
                : (Array.isArray(templateSheet?.content?.[0]) ? templateSheet.content[0] : null));

        if (!targetSheet.uid && fallbackUid) { targetSheet.uid = fallbackUid; sheetChanged = true; }
        if (!targetSheet.name && fallbackName) { targetSheet.name = fallbackName; sheetChanged = true; }
        if ((!targetSheet.sourceData || typeof targetSheet.sourceData !== 'object') && fallbackSourceData) {
            targetSheet.sourceData = JSON.parse(JSON.stringify(fallbackSourceData));
            sheetChanged = true;
        } else if (!targetSheet?.sourceData?.ddl && fallbackSourceData?.ddl) {
            targetSheet.sourceData = { ...(targetSheet.sourceData || {}), ddl: fallbackSourceData.ddl };
            sheetChanged = true;
        }
        if ((!targetSheet.updateConfig || typeof targetSheet.updateConfig !== 'object') && fallbackUpdateConfig) {
            targetSheet.updateConfig = JSON.parse(JSON.stringify(fallbackUpdateConfig));
            sheetChanged = true;
        }
        if ((!targetSheet.exportConfig || typeof targetSheet.exportConfig !== 'object') && fallbackExportConfig) {
            targetSheet.exportConfig = JSON.parse(JSON.stringify(fallbackExportConfig));
            sheetChanged = true;
        }
        if ((targetSheet.orderNo === undefined || targetSheet.orderNo === null) && fallbackOrderNo !== undefined) {
            targetSheet.orderNo = fallbackOrderNo;
            sheetChanged = true;
        }

        if (!Array.isArray(targetSheet.content)) {
            targetSheet.content = headerRow ? [JSON.parse(JSON.stringify(headerRow))] : [];
            sheetChanged = true;
        } else if (targetSheet.content.length === 0 && headerRow) {
            targetSheet.content = [JSON.parse(JSON.stringify(headerRow))];
            sheetChanged = true;
        } else if (!Array.isArray(targetSheet.content[0]) && headerRow) {
            targetSheet.content[0] = JSON.parse(JSON.stringify(headerRow));
            sheetChanged = true;
        }

        if (Array.isArray(targetSheet.content) && targetSheet.content.length <= 1) {
            const seedRows = getEffectiveSeedRowsForSheet_ACU(sheetKey, { guideData, allowTemplateFallback: true });
            if (Array.isArray(seedRows) && seedRows.length > 0) {
                targetSheet.content = [targetSheet.content[0] || [], ...JSON.parse(JSON.stringify(seedRows))];
                targetSheet.content = ensureStableRowIdsForSheetContent_ACU(targetSheet.content);
                sheetChanged = true;
            }
        }

        if (sheetChanged) initializedSheetKeys.add(sheetKey);
    }

    return { workingTableData, initializedSheetKeys };
}

export async function applyUnifiedGroupFillResponses_ACU(
    responses: GroupFillResponse_ACU[],
    baseSnapshot: Record<string, any>,
    options: {
        saveTargetIndex: number;
        updateMode: string;
        isImportMode: boolean;
    }
): Promise<CardUpdateResult> {
    if (!Array.isArray(responses) || responses.length === 0) {
        return { success: false, modifiedKeys: [], error: '统一提交失败：responses 为空。' };
    }
    if (!baseSnapshot || typeof baseSnapshot !== 'object') {
        return { success: false, modifiedKeys: [], error: '统一提交失败：baseSnapshot 无效。' };
    }

    const sortedResponses = [...responses].sort((a, b) => {
        const jobA = a.job;
        const jobB = b.job;
        return (jobA?.saveTargetIndex || 0) - (jobB?.saveTargetIndex || 0)
            || (jobA?.batchNumber || 0) - (jobB?.batchNumber || 0)
            || (jobA?.groupId || 0) - (jobB?.groupId || 0)
            || String(jobA?.groupKey || '').localeCompare(String(jobB?.groupKey || ''));
    });

    const seenTargetSheetKeys = new Set<string>();
    const allTargetSheetKeySet = new Set<string>();
    for (const response of sortedResponses) {
        if (!response.success || !response.aiResponse || response.tableEditText === undefined || response.tableEditText === null || !response.job) {
            return { success: false, modifiedKeys: [], error: '统一提交失败：存在未完成或无效的 group 响应。' };
        }
        for (const sheetKey of response.job.targetSheetKeys || []) {
            if (seenTargetSheetKeys.has(sheetKey)) {
                return { success: false, modifiedKeys: [], error: `统一提交失败：targetSheetKeys 存在重叠冲突 (${sheetKey})。` };
            }
            seenTargetSheetKeys.add(sheetKey);
            allTargetSheetKeySet.add(sheetKey);
        }
    }

    const sqlInitialization = isSqliteMode()
        ? buildSqlInitializationBase_ACU(baseSnapshot, [...allTargetSheetKeySet])
        : { workingTableData: JSON.parse(JSON.stringify(baseSnapshot)), initializedSheetKeys: new Set<string>() };

    let workingTableData = sqlInitialization.workingTableData;
    const initializedSheetKeys = sqlInitialization.initializedSheetKeys;
    const modifiedKeySet = new Set<string>();
    const trackingKeySet = new Set<string>();

    for (const response of sortedResponses) {
        let parseResult: any;
        if (isSqliteMode() && typeof response.tableEditText === 'string' && isSqlContent(response.tableEditText)) {
            parseResult = await applySqlEditsToTableDataSnapshot_ACU(
                response.tableEditText,
                workingTableData,
                options.updateMode,
            );
            if (parseResult?.success && parseResult.workingData) {
                workingTableData = parseResult.workingData;
            }
        } else {
            parseResult = parseAndApplyTableEditsToData_ACU(response.aiResponse!, workingTableData, options.updateMode, options.isImportMode);
        }
        const parseResultObject = typeof parseResult === 'object' && parseResult !== null ? parseResult : null;
        const parseSuccess = parseResultObject ? parseResultObject.success : !!parseResult;
        const parsedKeys = parseResultObject ? (parseResultObject.modifiedKeys || []) : (response.job?.targetSheetKeys || []);
        const appliedEdits = parseResultObject && typeof parseResultObject.appliedEdits === 'number'
            ? parseResultObject.appliedEdits
            : (Array.isArray(parsedKeys) ? parsedKeys.length : 0);
        const parseError = parseResultObject && typeof parseResultObject.error === 'string'
            ? parseResultObject.error.trim()
            : '';
        if (!parseSuccess) {
            return {
                success: false,
                modifiedKeys: [],
                error: parseError
                    ? `统一提交失败：group ${response.job.groupKey} 解析或应用失败。${parseError}`
                    : `统一提交失败：group ${response.job.groupKey} 解析或应用失败。`,
            };
        }
        if (Array.isArray(response.job.targetSheetKeys) && response.job.targetSheetKeys.length > 0) {
            const allowedSheetKeys = new Set(response.job.targetSheetKeys);
            const unauthorizedKeys = parsedKeys.filter((sheetKey: string) => !allowedSheetKeys.has(sheetKey));
            if (unauthorizedKeys.length > 0) {
                return {
                    success: false,
                    modifiedKeys: [],
                    error: `统一提交失败：group ${response.job.groupKey} 越权修改了非目标表 (${unauthorizedKeys.join(', ')})。`,
                };
            }
        }
        for (const sheetKey of (response.job?.targetSheetKeys || [])) {
            if (workingTableData && workingTableData[sheetKey]) {
                trackingKeySet.add(sheetKey);
            }
        }
        parsedKeys.forEach((sheetKey: string) => modifiedKeySet.add(sheetKey));
    }

    applySpecialIndexSequenceToSummaryTables_ACU(workingTableData);

    const modifiedKeys = [...modifiedKeySet].sort();
    if (!options.isImportMode) {
        const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
        const allUnifiedSheetKeys = getSortedSheetKeys_ACU(workingTableData);
        const initializedKeys = [...initializedSheetKeys].sort();
        const keysToSave = isFirstTimeInit
            ? allUnifiedSheetKeys
            : [...new Set([...modifiedKeys, ...initializedKeys])].sort();
        const keysToTrack = isFirstTimeInit
            ? allUnifiedSheetKeys
            : [...new Set([...trackingKeySet, ...initializedKeys])].sort();
        const saveResult = await persistTablesToChatMessage_ACU({
            targetMessageIndex: options.saveTargetIndex,
            targetSheetKeys: keysToSave,
            updateGroupKeys: keysToTrack,
            trackingSheetKeys: keysToTrack,
            tableData: workingTableData,
            trackAsUpdate: true,
        });
        if (!saveResult.saved) {
            return { success: false, modifiedKeys, error: saveResult.error || '统一提交失败：保存聊天记录失败。' };
        }

        await updateReadableLorebookEntry_ACU(true);
        if (getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true) {
            await enqueueSummaryVectorIndexFlush_ACU({ targetMessageIndex: options.saveTargetIndex, mode: 'sync', reason: 'unified_group_fill_complete' });
        }
    }

    return { success: true, modifiedKeys };
}

export async function processGroupedRuntimeChunk_ACU(
    groups: GroupedRuntimeUpdateGroup_ACU[],
    mode: string,
    options: {
        isImportMode?: boolean;
        abortController?: AbortController;
    } = {}
): Promise<{ success: boolean; failedGroups: string[]; error?: string }> {
    if (!Array.isArray(groups) || groups.length === 0) {
        return { success: true, failedGroups: [] };
    }

    const chatHistory = getChatArray_ACU();
    const templateForLookup = parseTableTemplateJson_ACU({ stripSeedRows: true });
    const failedGroups = new Set<string>();
    let firstError: string | undefined;
    const transactionBuckets = new Map<string, {
        saveTargetIndex: number;
        batchNumber: number;
        updateMode: string;
        baseSnapshot: Record<string, any>;
        jobs: GroupFillJob_ACU[];
    }>();

    for (const group of groups) {
        const batchSize = Math.max(1, Number(group.batchSize) || Number(settings_ACU.updateBatchSize) || 2);
        const groupBatches: number[][] = [];
        for (let i = 0; i < group.indices.length; i += batchSize) {
            groupBatches.push(group.indices.slice(i, i + batchSize));
        }

        for (let i = 0; i < groupBatches.length; i++) {
            const batchIndices = groupBatches[i];
            const batchNumber = i + 1;
            const firstMessageIndexOfBatch = batchIndices[0];
            const lastMessageIndexOfBatch = batchIndices[batchIndices.length - 1];
            const finalSaveTargetIndex = lastMessageIndexOfBatch;

            const baseResult = buildBatchMergeBase_ACU(batchNumber);
            if (!baseResult.data) {
                failedGroups.add(group.key);
                firstError = firstError || baseResult.error || '无法构建合并基底，操作已终止。';
                continue;
            }

            const mergedBatchData = baseResult.data;
            const batchSheetKeys = getSortedSheetKeys_ACU(mergedBatchData);
            const batchIsolationKey = getCurrentIsolationKey_ACU();
            loadBatchBaseData_ACU(chatHistory, firstMessageIndexOfBatch, batchIsolationKey, batchSheetKeys, mergedBatchData);
            _set_currentJsonTableData_ACU(mergedBatchData);

            let sliceStartIndex = firstMessageIndexOfBatch;
            if (sliceStartIndex > 0 && chatHistory[sliceStartIndex - 1]?.is_user) {
                sliceStartIndex--;
            }
            const messagesForContext = chatHistory.slice(sliceStartIndex, lastMessageIndexOfBatch + 1);

            const isAutoUpdateMode = mode && mode.startsWith('auto');
            const lastAiMessageInBatch = chatHistory[lastMessageIndexOfBatch];
            const lastAiMessageContent = lastAiMessageInBatch?.mes || lastAiMessageInBatch?.message || '';
            const lastAiMessageLength = lastAiMessageContent.length;
            const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;
            if (isAutoUpdateMode && lastAiMessageLength < minReplyLength) {
                continue;
            }

            const updateMode = resolveUpdateMode_ACU(mode);
            const baseSnapshot = JSON.parse(JSON.stringify(mergedBatchData));
            let effectiveRequestOptions = group.requestOptions || null;
            if (!effectiveRequestOptions?.tableApiPreset && Array.isArray(group.sheetKeys) && group.sheetKeys.length > 0) {
                const firstTableName = templateForLookup?.[group.sheetKeys[0]]?.name || '';
                const resolvedPreset = resolveTableApiPresetOverride_ACU(firstTableName);
                if (resolvedPreset) {
                    effectiveRequestOptions = { ...(effectiveRequestOptions || {}), tableApiPreset: resolvedPreset };
                }
            }
            const job: GroupFillJob_ACU = {
                groupKey: group.key,
                groupId: group.groupId,
                batchNumber,
                targetSheetKeys: group.sheetKeys,
                messagesForContext,
                saveTargetIndex: finalSaveTargetIndex,
                updateMode,
                requestOptions: effectiveRequestOptions,
                baseSnapshot,
                isImportMode: options.isImportMode === true,
            };
            const bucketKey = `${finalSaveTargetIndex}|${batchNumber}|${updateMode}|${options.isImportMode === true ? 1 : 0}`;
            const existingBucket = transactionBuckets.get(bucketKey);
            if (existingBucket) {
                existingBucket.jobs.push(job);
            } else {
                transactionBuckets.set(bucketKey, {
                    saveTargetIndex: finalSaveTargetIndex,
                    batchNumber,
                    updateMode,
                    baseSnapshot,
                    jobs: [job],
                });
            }
        }
    }

    const orderedBuckets = [...transactionBuckets.values()].sort((a, b) => a.saveTargetIndex - b.saveTargetIndex || a.batchNumber - b.batchNumber);
    for (const bucket of orderedBuckets) {
        const maxBucketRetries = Math.max(1, Number(settings_ACU.tableMaxRetries) || 3);
        let retryUnifiedError: string | null = null;
        let bucketSucceeded = false;

        for (let bucketAttempt = 1; bucketAttempt <= maxBucketRetries; bucketAttempt++) {
            const collectFeedback = retryUnifiedError ? { lastUnifiedError: retryUnifiedError } : undefined;
            const settledResponses = await Promise.allSettled(bucket.jobs.map(job => collectGroupFillResponse_ACU(job, collectFeedback, options.abortController)));
            const responses: GroupFillResponse_ACU[] = [];
            let collectFailed = false;
            let collectError: string | undefined;

            for (let i = 0; i < settledResponses.length; i++) {
                const settledResponse = settledResponses[i];
                const job = bucket.jobs[i];
                if (settledResponse.status === 'rejected') {
                    collectFailed = true;
                    collectError = collectError || (settledResponse.reason instanceof Error ? settledResponse.reason.message : String(settledResponse.reason || 'AI响应收集失败'));
                    continue;
                }
                if (!settledResponse.value.success || settledResponse.value.aborted || !settledResponse.value.aiResponse) {
                    collectFailed = true;
                    collectError = collectError || settledResponse.value.error || settledResponse.value.rawError || 'AI响应收集失败';
                    continue;
                }
                responses.push(settledResponse.value);
            }

            if (collectFailed) {
                bucket.jobs.forEach(job => failedGroups.add(job.groupKey));
                firstError = firstError || collectError || 'AI响应收集失败';
                break;
            }

            const applyResult = await applyUnifiedGroupFillResponses_ACU(responses, bucket.baseSnapshot, {
                saveTargetIndex: bucket.saveTargetIndex,
                updateMode: bucket.updateMode,
                isImportMode: options.isImportMode === true,
            });
            if (applyResult.success) {
                bucketSucceeded = true;
                break;
            }

            retryUnifiedError = applyResult.error || '统一提交失败。';
            if (bucketAttempt >= maxBucketRetries) {
                bucket.jobs.forEach(job => failedGroups.add(job.groupKey));
                firstError = firstError || `统一提交在 ${maxBucketRetries} 次尝试后仍失败: ${retryUnifiedError}`;
            }
        }

        if (!bucketSucceeded && firstError && options.abortController?.signal.aborted) {
            break;
        }
    }

    return failedGroups.size > 0
        ? { success: false, failedGroups: [...failedGroups], error: firstError || '统一提交失败。' }
        : { success: true, failedGroups: [] };
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
    // 向后兼容：历史调用可能把 onProgress 作为第9参传入
    if (typeof progressContext === 'function' && !onProgress) {
        onProgress = progressContext as unknown as (event: CardUpdateProgressEvent) => void;
        progressContext = null;
    }
    // 兜底保护：若误传了非对象 progressContext，避免读取属性报错
    if (progressContext && typeof progressContext !== 'object') {
        progressContext = null;
    }

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
        let lastSqlError: string | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const collectResult = await collectGroupFillResponse_ACU({
                    groupKey: `legacy_execute_${saveTargetIndex}`,
                    groupId: 0,
                    batchNumber: progressContext?.currentBatch || 1,
                    targetSheetKeys,
                    messagesForContext: messagesToUse,
                    saveTargetIndex,
                    updateMode,
                    requestOptions,
                    baseSnapshot: JSON.parse(JSON.stringify(progressContext?.batchBaseSnapshot || currentJsonTableData_ACU || {})),
                    isImportMode,
                }, { lastSqlError }, abortController, { onProgress: emitProgress, maxRetriesOverride: 1 });

                if (collectResult.aborted) {
                    return { success: false, modifiedKeys: [], aborted: true };
                }
                if (!collectResult.success || !collectResult.aiResponse) {
                    throw new Error(collectResult.rawError || collectResult.error || 'AI响应收集失败');
                }

                emitProgress({ phase: 'parsing' });
                const aiResponse = collectResult.aiResponse;

                const applyScopeKey = buildTableUpdateApplyScopeKey_ACU({
                    chatKey: currentChatFileIdentifier_ACU,
                    isolationKey: getCurrentIsolationKey_ACU(),
                    targetMessageIndex: saveTargetIndex,
                });

                const updateOutcome = await runTableUpdateApplyWithScopeLock_ACU(applyScopeKey, async () => {
                    if (progressContext?.batchBaseSnapshot) {
                        _set_currentJsonTableData_ACU(JSON.parse(JSON.stringify(progressContext.batchBaseSnapshot)));
                    }

                    const parseResult = parseAndApplyTableEdits_ACU(aiResponse, updateMode, isImportMode);

                    let parseSuccess = false;
                    let parsedKeys: string[] = [];

                    if (typeof parseResult === 'object' && parseResult !== null) {
                        parseSuccess = parseResult.success;
                        parsedKeys = parseResult.modifiedKeys || [];
                    } else {
                        parseSuccess = !!parseResult;
                        parsedKeys = targetSheetKeys || [];
                    }

                    if (!parseSuccess) {
                        throw new Error('解析或应用AI更新时出错');
                    }

                    // [spv3.6.5] 填表完成后统一强制应用编码索引列特殊锁定（AM序列）
                    // 无论 SQL 模式还是原生模式，都在这里兜底确保编码索引列被强制修正
                    applySpecialIndexSequenceToSummaryTables_ACU(currentJsonTableData_ACU);
                    if (!isImportMode) {
                        emitProgress({ phase: 'saving' });

                        let keysToPersist = parsedKeys;
                        if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
                            keysToPersist = keysToPersist.filter((k: string) => targetSheetKeys.includes(k));
                        }

                        const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
                        const hasTargetSheetTracking = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0;
                        const allSheetKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
                        const targetTrackingKeys = hasTargetSheetTracking
                            ? targetSheetKeys.filter((sheetKey: string) => Boolean(currentJsonTableData_ACU?.[sheetKey]))
                            : [];

                        if (keysToPersist.length > 0 || isFirstTimeInit || hasTargetSheetTracking) {
                            let keysToActuallySave = keysToPersist;
                            if (isFirstTimeInit) {
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

                            const keysToTrackAsUpdated = isFirstTimeInit
                                ? [...allSheetKeys]
                                : (hasTargetSheetTracking
                                    ? [...targetTrackingKeys]
                                    : keysToPersist.filter((sheetKey: string) => keysToActuallySave.includes(sheetKey)));
                            const updateGroupKeysRaw = isFirstTimeInit
                                ? [...allSheetKeys]
                                : (hasTargetSheetTracking ? [...targetTrackingKeys] : targetSheetKeys);
                            const updateGroupKeysToUse = Array.isArray(updateGroupKeysRaw)
                                ? updateGroupKeysRaw.filter(sheetKey => {
                                    const table = currentJsonTableData_ACU?.[sheetKey];
                                    if (!table || !isSummaryOrOutlineTable_ACU(table.name)) return true;
                                    return keysToTrackAsUpdated.includes(sheetKey);
                                })
                                : updateGroupKeysRaw;
                            const saveResult = await saveIndependentTableToChatHistoryWithinScopeLock_ACU(
                                saveTargetIndex,
                                keysToActuallySave,
                                updateGroupKeysToUse,
                                false,
                                keysToTrackAsUpdated,
                            );
                            if (!saveResult.saved) {
                                return { success: false, modifiedKeys: parsedKeys, error: '无法将更新后的数据库保存到聊天记录。' };
                            }
                        } else {
                            logDebug_ACU("No tables were modified by AI, skipping save to chat history.");
                        }

                        await updateReadableLorebookEntry_ACU(true);
                    } else {
                        emitProgress({ phase: 'chunk_done' });
                        logDebug_ACU("Import mode: skipping save to chat history for this chunk.");
                    }

                    return { success: true, modifiedKeys: parsedKeys };
                });

                modifiedKeys = updateOutcome.modifiedKeys;

                if (!updateOutcome.success) {
                    return updateOutcome;
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

            emitProgress({ phase: 'complete' });

            // [spv3.6.6] 填表完成后异步触发交火向量索引防抖归档
            // 将 embedding + 归档写入从 saving 阶段移到 complete 之后，
            // 避免 embedding API 调用阻塞"正在保存"提示框。
            // 使用 flush queue 替代直接调用，由防抖定时器统一调度。
            // [spv3.6.9] 增加诊断日志，记录入队结果（queued/skipped）
            if (!isImportMode && success && getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true) {
                enqueueSummaryVectorIndexFlush_ACU({
                    targetMessageIndex: saveTargetIndex,
                    mode: 'sync',
                    reason: 'table_fill_complete',
                }).then(result => {
                    if (result.skipped) {
                        logWarn_ACU(`[交火模式纪要索引] 填表完成后防抖归档被跳过：${result.reason || 'unknown'}, scopeKey=${result.scopeKey || ''}`);
                    } else if (result.queued) {
                        logDebug_ACU(`[交火模式纪要索引] 填表完成后已入队防抖归档, scopeKey=${result.scopeKey}, debounceUntil=${result.debounceUntil}`);
                    }
                }).catch(err => {
                    logWarn_ACU('[交火模式纪要索引] 填表完成后防抖归档入队异常:', err);
                });
            }

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

    _set_wasStoppedByUser_ACU(false);
    _set_isAutoUpdatingCard_ACU(true);

    try {
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
                {
                    currentBatch: batchNumber,
                    totalBatches: batches.length,
                    batchBaseSnapshot: JSON.parse(JSON.stringify(mergedBatchData)),
                }
            );

            if (!result.success) {
                return { success: false, failedBatch: batchNumber, error: result.error || `批处理在第 ${batchNumber} 批时失败或被终止。` };
            }
        }

        return { success: true };
    } finally {
        _set_isAutoUpdatingCard_ACU(false);
        _set_wasStoppedByUser_ACU(false);
    }
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
        const updateGroups: Record<string, ManualRuntimeUpdateGroup_ACU> = {};
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
            const groupedChunk: GroupedRuntimeUpdateGroup_ACU[] = chunkKeys.map((gKey): GroupedRuntimeUpdateGroup_ACU => {
                const group = updateGroups[gKey];
                let effectiveRequestOptions: GroupedRuntimeUpdateGroup_ACU['requestOptions'] = null;
                if (Array.isArray(group.sheetKeys) && group.sheetKeys.length > 0) {
                    const firstSheetKey = group.sheetKeys[0];
                    const firstTableName = templateData?.[firstSheetKey]?.name || '';
                    const resolvedPreset = resolveTableApiPresetOverride_ACU(firstTableName);
                    if (resolvedPreset) {
                        effectiveRequestOptions = { tableApiPreset: resolvedPreset };
                    }
                }

                return {
                    key: gKey,
                    groupId: group.groupId,
                    indices: group.indices,
                    batchSize: group.batchSize,
                    sheetKeys: group.sheetKeys,
                    requestOptions: effectiveRequestOptions,
                };
            });
            const chunkResult = await processGroupedRuntimeChunk_ACU(groupedChunk, 'manual_independent');
            if (!chunkResult.success) {
                chunkResult.failedGroups.forEach(key => {
                    failedGroups.push({ key, error: chunkResult.error || '手动更新失败或被终止。' });
                });
            }

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
