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
import { ensureStableRowIdsForSheetContent_ACU, getChatSheetGuideDataForIsolationKey_ACU, getEffectiveSeedRowsForSheet_ACU, shouldUseInitialSeedRows_ACU } from '../template/chat-scope';
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
import { checkIfFirstTimeInit_ACU, ensureLegacyStorageMigratedBeforeWrite_ACU } from './table-service';
import { parseAndApplyTableEditsToData_ACU, prepareAIInput_ACU } from '../ai/prompt-builder';
import { isSqlContent } from '../ai/prompt-builder/table-edit-parser';
import { buildGuidedBaseDataFromSheetGuide_ACU, getSortedSheetKeys_ACU } from '../template/chat-scope';
import { isSqliteMode } from './storage-mode';
import type { ManualRefillProgressV2_ACU, TableMutationOperationV2_ACU } from './storage-frame-v2-types';
import { applySqlEditsToTableDataSnapshot_ACU, extractTableNamesFromStatements, mapSqlTableNamesToSheetKeys_ACU, normalizeSqlStatementsForRuntimeLog_ACU } from './sql-table-service';
import { loadTableStateFromFramesV2_ACU } from './storage-frame-v2-replay';
import { ensureStorageProviderReady_ACU, getStorageProvider, reloadStorageProvider } from './table-storage-strategy';
import { applySpecialIndexSequenceToSummaryTables_ACU } from '../runtime/helpers-remaining';
import { captureTableRuntimeRevisionForWriteSet_ACU } from './table-write-transaction';
import { runTableUpdateCommit_ACU } from './table-update-commit';
import { readIsolatedTagData_ACU } from '../../data/repositories/chat-message-data-repo';
import { isV2TagData_ACU, resolveTableStorageStrategy_ACU } from './storage-strategy-resolver';

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
    tableData?: Record<string, any>;
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
    baseRevision?: string | null;
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

interface PlannedGroupedRuntimeJob_ACU {
    group: GroupedRuntimeUpdateGroup_ACU;
    batchNumber: number;
    firstMessageIndexOfBatch: number;
    lastMessageIndexOfBatch: number;
    saveTargetIndex: number;
    updateMode: string;
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
function cloneTableDataSnapshot_ACU(data: Record<string, any> | null | undefined): Record<string, any> | null {
    if (!data || typeof data !== 'object') return null;
    return JSON.parse(JSON.stringify(data));
}

function hasUsableRuntimeTableData_ACU(data: Record<string, any> | null): boolean {
    if (!data || typeof data !== 'object') return false;
    return Object.keys(data).some(k => k.startsWith('sheet_') && Array.isArray(data[k]?.content));
}

function buildWriteSetForSheetKeys_ACU(sheetKeys: string[] | null | undefined, fallbackData?: Record<string, any> | null) {
    const keys = Array.isArray(sheetKeys) && sheetKeys.length > 0
        ? sheetKeys
        : getSortedSheetKeys_ACU(fallbackData || currentJsonTableData_ACU || {});
    const normalized = [...new Set(keys.filter(sheetKey => typeof sheetKey === 'string' && sheetKey.startsWith('sheet_')))].sort();
    return normalized.length > 0
        ? normalized.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }))
        : [{ kind: 'all' as const }];
}

function getManualRefillProgressAtMessage_ACU(chat: any[], messageIndex: number): ManualRefillProgressV2_ACU | null {
    const msg = Array.isArray(chat) ? chat[messageIndex] : null;
    if (!msg || msg.is_user) return null;
    const tagData = readIsolatedTagData_ACU(msg, getCurrentIsolationKey_ACU()) as any;
    if (!isV2TagData_ACU(tagData)) return null;
    const progress = tagData.storageFrame?.checkpoint?.manualRefillProgress;
    return progress?.kind === 'manual_refill' ? progress as ManualRefillProgressV2_ACU : null;
}

function arraysEqualUnordered_ACU(a: string[], b: string[]): boolean {
    const aa = [...new Set(a)].sort();
    const bb = [...new Set(b)].sort();
    return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

function manualRefillProgressMatches_ACU(
    progress: ManualRefillProgressV2_ACU | null,
    selectedSheetKeys: string[],
    contextMessageIndices: number[],
    targetMessageIndex: number,
): progress is ManualRefillProgressV2_ACU {
    if (!progress || progress.status !== 'in_progress') return false;
    if (progress.targetMessageIndex !== targetMessageIndex) return false;
    if (!arraysEqualUnordered_ACU(progress.selectedSheetKeys || [], selectedSheetKeys)) return false;
    const currentStart = contextMessageIndices[0];
    const originalStart = Number(progress.originalStartMessageIndex);
    if (!Number.isFinite(currentStart) || !Number.isFinite(originalStart)) return false;
    // 允许用户调整上下文层数和批大小；只要当前请求没有扩展到上次重填起点之前，就按已完成楼层续跑。
    return currentStart >= originalStart;
}

function buildSqlBatchOperationsFromText_ACU(sqlText: string): TableMutationOperationV2_ACU[] {
    const statements = normalizeSqlStatementsForRuntimeLog_ACU(sqlText);
    return statements.length > 0 ? [{ kind: 'sql_batch', statements }] : [];
}

function getTouchedSheetKeysFromSqlText_ACU(sqlText: string, tableData: Record<string, any>): string[] {
    const statements = normalizeSqlStatementsForRuntimeLog_ACU(sqlText);
    if (statements.length === 0) return [];
    const tableNames = extractTableNamesFromStatements(statements);
    return mapSqlTableNamesToSheetKeys_ACU(tableData as any, tableNames);
}

function findSqlFailureGroupKey_ACU(sqlTexts: string[], responses: GroupFillResponse_ACU[], errorMessage: string): string | null {
    const match = String(errorMessage || '').match(/第\s*(\d+)\s*条语句失败/);
    const failedIndex = match ? Number.parseInt(match[1], 10) : NaN;
    if (!Number.isFinite(failedIndex) || failedIndex <= 0) return null;

    let cursor = 0;
    for (let i = 0; i < sqlTexts.length; i += 1) {
        const count = normalizeSqlStatementsForRuntimeLog_ACU(sqlTexts[i]).length;
        if (failedIndex > cursor && failedIndex <= cursor + count) {
            return responses[i]?.job?.groupKey || null;
        }
        cursor += count;
    }
    return null;
}

function createRuntimeRollbackSnapshot_ACU(provider: any): unknown | null {
    return typeof provider?.createRuntimeSnapshot === 'function' ? provider.createRuntimeSnapshot() : null;
}

async function restoreRuntimeRollbackSnapshot_ACU(provider: any, snapshot: unknown, reason: string): Promise<void> {
    if (!snapshot || typeof provider?.restoreRuntimeSnapshot !== 'function') return;
    try {
        await provider.restoreRuntimeSnapshot(snapshot);
        logDebug_ACU(`[RuntimeRollback] 已恢复运行时 DB 快照: ${reason}`);
    } catch (error) {
        logWarn_ACU(`[RuntimeRollback] 恢复运行时 DB 快照失败，尝试 reload: ${reason}`, error);
        await reloadStorageProvider();
    }
}

function getRuntimeTableDataSnapshot_ACU(fallbackData: Record<string, any> | null = null): Record<string, any> | null {
    const explicitFallback = cloneTableDataSnapshot_ACU(fallbackData || null);
    if (hasUsableRuntimeTableData_ACU(explicitFallback)) return explicitFallback;

    try {
        const providerData = getStorageProvider().getCurrentData();
        const cloned = cloneTableDataSnapshot_ACU(providerData as any);
        if (hasUsableRuntimeTableData_ACU(cloned)) return cloned;
    } catch (error) {
        logWarn_ACU('[RuntimeSnapshot] 无法从运行时存储导出当前表格快照，改用内存快照兜底。', error);
    }

    const fallback = cloneTableDataSnapshot_ACU(currentJsonTableData_ACU || null);
    if (hasUsableRuntimeTableData_ACU(fallback)) return fallback;
    return null;
}

async function resetSqliteRuntimeFromSnapshot_ACU(
    snapshotData: Record<string, any> | null | undefined,
    reason: string,
): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    if (!snapshotData || typeof snapshotData !== 'object') {
        return { success: false, error: `${reason}: 缺少可用于初始化 SQLite 运行时的快照。` };
    }
    const provider = await ensureStorageProviderReady_ACU();
    if (typeof provider.replaceAllData !== 'function') {
        return { success: false, error: `${reason}: 当前存储 provider 不支持运行时全量替换。` };
    }
    const replaceResult = await provider.replaceAllData(snapshotData as any);
    if (!replaceResult.success) {
        return { success: false, error: replaceResult.error || `${reason}: SQLite 运行时初始化失败。` };
    }
    const runtimeData = provider.getCurrentData() as Record<string, any> | null;
    return { success: true, data: runtimeData || JSON.parse(JSON.stringify(snapshotData)) };
}

function mergeGuideStructureIntoBaseData_ACU(data: Record<string, any>): Record<string, any> {
    const base = cloneTableDataSnapshot_ACU(data) || {};
    const batchIsoKey = getCurrentIsolationKey_ACU();
    const sheetGuideForBatch = getChatSheetGuideDataForIsolationKey_ACU(batchIsoKey);
    if (!sheetGuideForBatch || typeof sheetGuideForBatch !== 'object' || !Object.keys(sheetGuideForBatch).some(k => k.startsWith('sheet_'))) {
        return base;
    }

    const guideBase = buildGuidedBaseDataFromSheetGuide_ACU(sheetGuideForBatch);
    if (!base.mate && guideBase?.mate) base.mate = JSON.parse(JSON.stringify(guideBase.mate));
    Object.keys(guideBase || {}).forEach(sheetKey => {
        if (!sheetKey.startsWith('sheet_')) return;
        if (base[sheetKey]) {
            restoreGuideStructure(base[sheetKey], guideBase[sheetKey]);
        } else {
            base[sheetKey] = JSON.parse(JSON.stringify(guideBase[sheetKey]));
        }
    });
    return base;
}

async function loadV2ReplayMergeBase_ACU(
    batchNumber: number,
    options: { maxMessageIndex?: number } = {},
): Promise<{ data: Record<string, any> | null; attempted: boolean }> {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) return { data: null, attempted: false };

    const isolationKey = getCurrentIsolationKey_ACU();
    const strategy = resolveTableStorageStrategy_ACU(chat, isolationKey, {
        enabled: settings_ACU.dataIsolationEnabled,
        code: settings_ACU.dataIsolationCode,
    });
    if (strategy.mode !== 'v2') return { data: null, attempted: false };

    try {
        const replayedData = await loadTableStateFromFramesV2_ACU(chat, isolationKey, options);
        const cloned = cloneTableDataSnapshot_ACU(replayedData as any);
        if (!hasUsableRuntimeTableData_ACU(cloned)) return { data: null, attempted: true };
        const mergedData = mergeGuideStructureIntoBaseData_ACU(cloned as Record<string, any>);
        _set_currentJsonTableData_ACU(JSON.parse(JSON.stringify(mergedData)));
        const scope = Number.isInteger(options.maxMessageIndex) ? `<=${options.maxMessageIndex}` : 'latest';
        logDebug_ACU(`[Batch ${batchNumber}] Using V2 replay state as merge base (${scope}).`);
        return { data: mergedData, attempted: true };
    } catch (error) {
        logWarn_ACU(`[Batch ${batchNumber}] V2 replay merge base failed; fallback guarded by scope.`, error);
        return { data: null, attempted: true };
    }
}

function buildGuideOrTemplateMergeBase_ACU(batchNumber: number): { data: Record<string, any> | null; error: string | null } {
    const batchIsoKey = getCurrentIsolationKey_ACU();
    const sheetGuideForBatch = getChatSheetGuideDataForIsolationKey_ACU(batchIsoKey);
    if (sheetGuideForBatch && typeof sheetGuideForBatch === 'object' && Object.keys(sheetGuideForBatch).some(k => k.startsWith('sheet_'))) {
        const data = buildGuidedBaseDataFromSheetGuide_ACU(sheetGuideForBatch);
        logDebug_ACU(`[Batch ${batchNumber}] Using chat sheet guide as merge base.`);
        return { data, error: null };
    }
    const data = parseTableTemplateJson_ACU({ stripSeedRows: true });
    logDebug_ACU(`[Batch ${batchNumber}] No chat sheet guide found, using template as merge base.`);
    return { data, error: null };
}

export async function buildBatchMergeBase_ACU(
    batchNumber: number,
    options: { maxMessageIndex?: number } = {},
): Promise<{ data: Record<string, any> | null; error: string | null }> {
    try {
        const runtimeData = getRuntimeTableDataSnapshot_ACU();
        if (runtimeData && isSqliteMode()) {
            logDebug_ACU(`[Batch ${batchNumber}] Using SQLite runtime storage snapshot as merge base.`);
            return { data: mergeGuideStructureIntoBaseData_ACU(runtimeData), error: null };
        }

        const v2ReplayResult = await loadV2ReplayMergeBase_ACU(batchNumber, options);
        if (v2ReplayResult.data) return { data: v2ReplayResult.data, error: null };

        // 指定了历史边界时，若当前聊天是 V2 但边界前没有可重放 checkpoint，不能退回“最新运行时快照”，
        // 否则会把目标楼之后的表格数据喂给本批次；此时应按空指导表/模板从零开始。
        if (!isSqliteMode() && v2ReplayResult.attempted && Number.isInteger(options.maxMessageIndex)) {
            return buildGuideOrTemplateMergeBase_ACU(batchNumber);
        }

        if (runtimeData) {
            logDebug_ACU(`[Batch ${batchNumber}] Using runtime storage snapshot as merge base.`);
            return { data: mergeGuideStructureIntoBaseData_ACU(runtimeData), error: null };
        }

        return buildGuideOrTemplateMergeBase_ACU(batchNumber);
    } catch (e) {
        logError_ACU(`[Batch ${batchNumber}] Failed to build merge base from guide/template.`, e);
        return { data: null, error: '无法构建合并基底，操作已终止。' };
    }
}

function buildSchemaOnlyRefillBase_ACU(): Record<string, any> {
    const batchIsoKey = getCurrentIsolationKey_ACU();
    const sheetGuideForBatch = getChatSheetGuideDataForIsolationKey_ACU(batchIsoKey);
    if (sheetGuideForBatch && typeof sheetGuideForBatch === 'object' && Object.keys(sheetGuideForBatch).some(k => k.startsWith('sheet_'))) {
        return buildGuidedBaseDataFromSheetGuide_ACU(sheetGuideForBatch);
    }
    return parseTableTemplateJson_ACU({ stripSeedRows: true }) || {};
}

async function buildManualRefillInitialData_ACU(
    chatHistory: any[],
    firstMessageIndexOfRange: number,
    selectedSheetKeys: string[],
    latestState: Record<string, any>,
): Promise<Record<string, any>> {
    const finalBase = JSON.parse(JSON.stringify(latestState || {}));
    const zeroBase = buildSchemaOnlyRefillBase_ACU();
    let refillBase: Record<string, any> | null = null;

    if (firstMessageIndexOfRange > 0) {
        try {
            refillBase = await loadTableStateFromFramesV2_ACU(chatHistory, getCurrentIsolationKey_ACU(), {
                maxMessageIndex: firstMessageIndexOfRange - 1,
            }) as Record<string, any> | null;
        } catch (error) {
            logWarn_ACU('[Manual Refill] 重放重填起点之前的数据失败，将从零基底重建选中表。', error);
            refillBase = null;
        }
    }

    if (!refillBase) {
        logWarn_ACU('[Manual Refill] 重填范围前找不到可用 checkpoint，选中表将从零基底开始重填。');
        refillBase = zeroBase;
    }

    if (!finalBase.mate && (latestState?.mate || refillBase?.mate || zeroBase?.mate)) {
        finalBase.mate = JSON.parse(JSON.stringify(latestState?.mate || refillBase?.mate || zeroBase?.mate));
    }

    for (const sheetKey of selectedSheetKeys) {
        const sourceSheet = refillBase?.[sheetKey] || zeroBase?.[sheetKey] || latestState?.[sheetKey];
        if (sourceSheet) {
            finalBase[sheetKey] = JSON.parse(JSON.stringify(sourceSheet));
            if (Array.isArray(finalBase[sheetKey]?.content)) {
                finalBase[sheetKey].content = ensureStableRowIdsForSheetContent_ACU(finalBase[sheetKey].content);
            }
        }
    }

    return finalBase;
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

        if (shouldUseInitialSeedRows_ACU() && Array.isArray(targetSheet.content) && targetSheet.content.length <= 1) {
            let seedRows = getEffectiveSeedRowsForSheet_ACU(sheetKey, { guideData, allowTemplateFallback: true });
            if ((!Array.isArray(seedRows) || seedRows.length === 0) && Array.isArray(sourceSheet?.content) && sourceSheet.content.length > 1) {
                seedRows = JSON.parse(JSON.stringify(sourceSheet.content.slice(1)));
            }
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

function sortGroupFillResponses_ACU(responses: GroupFillResponse_ACU[]): GroupFillResponse_ACU[] {
    return [...responses].sort((a, b) => {
        const jobA = a.job;
        const jobB = b.job;
        return (jobA?.saveTargetIndex || 0) - (jobB?.saveTargetIndex || 0)
            || (jobA?.batchNumber || 0) - (jobB?.batchNumber || 0)
            || (jobA?.groupId || 0) - (jobB?.groupId || 0)
            || String(jobA?.groupKey || '').localeCompare(String(jobB?.groupKey || ''));
    });
}

async function applySqlResponsesToCurrentRuntime_ACU(
    responses: GroupFillResponse_ACU[],
    baseSnapshot: Record<string, any>,
    updateMode: string,
): Promise<CardUpdateResult> {
    if (!Array.isArray(responses) || responses.length === 0) {
        return { success: false, modifiedKeys: [], error: 'SQLite 运行时提交失败：responses 为空。' };
    }
    const sortedResponses = sortGroupFillResponses_ACU(responses);
    const sqlTexts: string[] = [];
    for (const response of sortedResponses) {
        if (!response.success || !response.aiResponse || response.tableEditText === undefined || response.tableEditText === null || !response.job) {
            return { success: false, modifiedKeys: [], error: 'SQLite 运行时提交失败：存在未完成或无效的 group 响应。' };
        }
        if (typeof response.tableEditText !== 'string' || !isSqlContent(response.tableEditText)) {
            return { success: false, modifiedKeys: [], error: `SQLite 运行时提交失败：group ${response.job.groupKey} 未返回 SQL tableEdit。` };
        }
        const touchedKeys = getTouchedSheetKeysFromSqlText_ACU(response.tableEditText, baseSnapshot);
        if (Array.isArray(response.job.targetSheetKeys) && response.job.targetSheetKeys.length > 0) {
            const allowedSheetKeys = new Set(response.job.targetSheetKeys);
            const unauthorizedKeys = touchedKeys.filter((sheetKey: string) => !allowedSheetKeys.has(sheetKey));
            if (unauthorizedKeys.length > 0) {
                return {
                    success: false,
                    modifiedKeys: [],
                    error: `SQLite 运行时提交失败：group ${response.job.groupKey} 越权修改了非目标表 (${unauthorizedKeys.join(', ')})。`,
                };
            }
        }
        sqlTexts.push(response.tableEditText);
    }

    const provider = await ensureStorageProviderReady_ACU();
    const rollbackSnapshot = createRuntimeRollbackSnapshot_ACU(provider);
    try {
        const parseResult = typeof provider.applyEditsBatch === 'function'
            ? provider.applyEditsBatch(sqlTexts, updateMode)
            : provider.applyEdits(sqlTexts.join('\n'), updateMode);
        if (!parseResult?.success) {
            await restoreRuntimeRollbackSnapshot_ACU(provider, rollbackSnapshot, 'manual_refill_sql_runtime_apply_failed');
            return { success: false, modifiedKeys: [], error: parseResult?.error || 'SQLite 运行时 SQL 执行失败。' };
        }
        const runtimeData = provider.getCurrentData() as Record<string, any> | null;
        if (!runtimeData) {
            await restoreRuntimeRollbackSnapshot_ACU(provider, rollbackSnapshot, 'manual_refill_sql_runtime_export_failed');
            return { success: false, modifiedKeys: [], error: 'SQLite 运行时提交失败：无法导出运行时数据。' };
        }
        const modifiedKeys = Array.isArray(parseResult.modifiedKeys)
            ? [...new Set(parseResult.modifiedKeys.filter((key: unknown): key is string => typeof key === 'string'))].sort()
            : [];
        return { success: true, modifiedKeys, tableData: runtimeData };
    } catch (error: any) {
        await restoreRuntimeRollbackSnapshot_ACU(provider, rollbackSnapshot, 'manual_refill_sql_runtime_exception');
        const rawErrorMessage = error?.message || String(error);
        const failedGroupKey = findSqlFailureGroupKey_ACU(sqlTexts, sortedResponses, rawErrorMessage);
        return {
            success: false,
            modifiedKeys: [],
            error: failedGroupKey
                ? `SQLite 运行时提交失败：group ${failedGroupKey} SQL 执行失败。${rawErrorMessage}`
                : `SQLite 运行时提交失败：SQL 执行失败。${rawErrorMessage}`,
        };
    }
}

export async function applyUnifiedGroupFillResponses_ACU(
    responses: GroupFillResponse_ACU[],
    baseSnapshot: Record<string, any>,
    options: {
        saveTargetIndex: number;
        updateMode: string;
        isImportMode: boolean;
        baseRevision?: string | null;
        deferPersist?: boolean;
        forceSnapshotApply?: boolean;
    }
): Promise<CardUpdateResult> {
    if (!Array.isArray(responses) || responses.length === 0) {
        return { success: false, modifiedKeys: [], error: '统一提交失败：responses 为空。' };
    }
    if (!baseSnapshot || typeof baseSnapshot !== 'object') {
        return { success: false, modifiedKeys: [], error: '统一提交失败：baseSnapshot 无效。' };
    }

    const sortedResponses = sortGroupFillResponses_ACU(responses);

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

    const allResponsesAreRuntimeSql = isSqliteMode()
        && !options.deferPersist
        && !options.forceSnapshotApply
        && sortedResponses.every(response => typeof response.tableEditText === 'string' && isSqlContent(response.tableEditText));

    if (allResponsesAreRuntimeSql) {
        const operations: TableMutationOperationV2_ACU[] = [];
        const sqlTexts: string[] = [];

        for (const response of sortedResponses) {
            const sqlText = response.tableEditText || '';
            const touchedKeys = getTouchedSheetKeysFromSqlText_ACU(sqlText, baseSnapshot);
            if (Array.isArray(response.job.targetSheetKeys) && response.job.targetSheetKeys.length > 0) {
                const allowedSheetKeys = new Set(response.job.targetSheetKeys);
                const unauthorizedKeys = touchedKeys.filter((sheetKey: string) => !allowedSheetKeys.has(sheetKey));
                if (unauthorizedKeys.length > 0) {
                    return {
                        success: false,
                        modifiedKeys: [],
                        error: `统一提交失败：group ${response.job.groupKey} 越权修改了非目标表 (${unauthorizedKeys.join(', ')})。`,
                    };
                }
            }
            sqlTexts.push(sqlText);
            operations.push(...buildSqlBatchOperationsFromText_ACU(sqlText));
        }

        const commitResult = await runTableUpdateCommit_ACU<{ modifiedKeys: string[] }>({
            source: 'group_fill',
            reason: 'applyUnifiedGroupFillResponses:runtime_sql',
            isolationKey: getCurrentIsolationKey_ACU(),
            writeSet: buildWriteSetForSheetKeys_ACU([...allTargetSheetKeySet], baseSnapshot),
            baseRevision: options.baseRevision,
            initialData: baseSnapshot as any,
            targetMessageIndex: options.saveTargetIndex,
            targetSheetKeys: null,
            updateGroupKeys: null,
            trackingSheetKeys: null,
            trackAsUpdate: true,
            skipChatSave: options.isImportMode,
        }, async () => {
            const provider = await ensureStorageProviderReady_ACU();
            let parseResult: any;
            try {
                parseResult = typeof provider.applyEditsBatch === 'function'
                    ? provider.applyEditsBatch(sqlTexts, options.updateMode)
                    : provider.applyEdits(sqlTexts.join('\n'), options.updateMode);
            } catch (error: any) {
                const rawErrorMessage = error?.message || String(error);
                const failedGroupKey = findSqlFailureGroupKey_ACU(sqlTexts, sortedResponses, rawErrorMessage);
                return {
                    success: false,
                    error: failedGroupKey
                        ? `统一提交失败：group ${failedGroupKey} SQL 执行失败。${rawErrorMessage}`
                        : `统一提交失败：SQL 执行失败。${rawErrorMessage}`,
                };
            }
            if (!parseResult?.success) {
                return {
                    success: false,
                    error: parseResult?.error ? `统一提交失败：SQL 执行失败。${parseResult.error}` : '统一提交失败：SQL 执行失败。',
                };
            }

            const runtimeData = provider.getCurrentData() || currentJsonTableData_ACU || baseSnapshot;
            const parsedModifiedKeys: string[] = Array.isArray(parseResult.modifiedKeys)
                ? parseResult.modifiedKeys.filter((key: unknown): key is string => typeof key === 'string')
                : [];
            const modifiedKeys: string[] = Array.from(new Set<string>(parsedModifiedKeys)).sort();
            const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
            const allRuntimeSheetKeys: string[] = getSortedSheetKeys_ACU(runtimeData);
            const initializedKeys = [...allTargetSheetKeySet]
                .filter(sheetKey => Boolean((runtimeData as any)?.[sheetKey]) && !Boolean((baseSnapshot as any)?.[sheetKey]))
                .sort();
            const keysToSave = isFirstTimeInit
                ? allRuntimeSheetKeys
                : [...new Set([...modifiedKeys, ...initializedKeys])].sort();
            const keysToTrack = [...new Set([...modifiedKeys, ...initializedKeys])].sort();
            const fillAttemptKeys = [...allTargetSheetKeySet]
                .filter(sheetKey => Boolean((runtimeData as any)?.[sheetKey]))
                .sort();
            const revisionWriteSet = modifiedKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }));

            return {
                success: true,
                value: { modifiedKeys },
                tableData: runtimeData as any,
                mutationResult: { changes: parseResult.appliedEdits || 0, errors: [] },
                persist: {
                    targetSheetKeys: keysToSave,
                    updateGroupKeys: fillAttemptKeys,
                    trackingSheetKeys: keysToTrack,
                    trackAsUpdate: true,
                    operations,
                    revisionWriteSet,
                },
            };
        });

        if (!commitResult.success || !commitResult.value) {
            _set_currentJsonTableData_ACU(JSON.parse(JSON.stringify(baseSnapshot || {})) as any);
            return { success: false, modifiedKeys: [], error: commitResult.error || '统一提交失败。' };
        }
        if (!options.isImportMode && commitResult.tableData) {
            await updateReadableLorebookEntry_ACU(true, false, null, commitResult.tableData);
        }
        return { success: true, modifiedKeys: commitResult.value.modifiedKeys, tableData: commitResult.tableData as any };
    }

    const sqlInitialization = isSqliteMode()
        ? buildSqlInitializationBase_ACU(baseSnapshot, [...allTargetSheetKeySet])
        : { workingTableData: JSON.parse(JSON.stringify(baseSnapshot)), initializedSheetKeys: new Set<string>() };

    let workingTableData = sqlInitialization.workingTableData;
    const initializedSheetKeys = sqlInitialization.initializedSheetKeys;
    const modifiedKeySet = new Set<string>();
    const operations: TableMutationOperationV2_ACU[] = [];

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
                if (Array.isArray(parseResult.operations)) operations.push(...parseResult.operations);
            }
        } else {
            parseResult = parseAndApplyTableEditsToData_ACU(response.aiResponse!, workingTableData, options.updateMode, options.isImportMode);
            if (parseResult && typeof parseResult === 'object' && parseResult.success !== false && response.tableEditText) {
                operations.push({ kind: 'table_edit_dsl', text: response.tableEditText, updateMode: options.updateMode });
            }
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
        parsedKeys.forEach((sheetKey: string) => modifiedKeySet.add(sheetKey));
    }

    applySpecialIndexSequenceToSummaryTables_ACU(workingTableData);

    const modifiedKeys = [...modifiedKeySet].sort();
    if (options.deferPersist) {
        return { success: true, modifiedKeys, tableData: workingTableData as any };
    }
    if (!options.isImportMode) {
        const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
        const allUnifiedSheetKeys = getSortedSheetKeys_ACU(workingTableData);
        const initializedKeys = [...initializedSheetKeys].sort();
        const keysToSave = isFirstTimeInit
            ? allUnifiedSheetKeys
            : [...new Set([...modifiedKeys, ...initializedKeys])].sort();
        const keysToTrack = [...new Set([...modifiedKeys, ...initializedKeys])].sort();
        const fillAttemptKeys = [...allTargetSheetKeySet]
            .filter(sheetKey => Boolean((workingTableData as any)?.[sheetKey]))
            .sort();
        const revisionWriteSet = modifiedKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }));
        const commitResult = await runTableUpdateCommit_ACU<{ modifiedKeys: string[] }>({
            source: 'group_fill',
            reason: 'applyUnifiedGroupFillResponses:snapshot',
            isolationKey: getCurrentIsolationKey_ACU(),
            writeSet: buildWriteSetForSheetKeys_ACU([...allTargetSheetKeySet], baseSnapshot),
            revisionWriteSet,
            baseRevision: options.baseRevision,
            initialData: baseSnapshot as any,
            targetMessageIndex: options.saveTargetIndex,
            targetSheetKeys: keysToSave,
            updateGroupKeys: fillAttemptKeys,
            trackingSheetKeys: keysToTrack,
            trackAsUpdate: true,
            operations,
        }, () => ({
            success: true,
            value: { modifiedKeys },
            tableData: workingTableData as any,
        }));
        if (!commitResult.success) {
            return { success: false, modifiedKeys, error: commitResult.error || '统一提交失败：保存聊天记录失败。' };
        }

        await updateReadableLorebookEntry_ACU(true, false, null, workingTableData);
        if (getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true) {
            await enqueueSummaryVectorIndexFlush_ACU({ targetMessageIndex: options.saveTargetIndex, mode: 'sync', reason: 'unified_group_fill_complete' });
        }
    }

    return { success: true, modifiedKeys, tableData: workingTableData as any };
}

export async function processGroupedRuntimeChunk_ACU(
    groups: GroupedRuntimeUpdateGroup_ACU[],
    mode: string,
    options: {
        isImportMode?: boolean;
        abortController?: AbortController;
        onProgress?: (event: CardUpdateProgressEvent) => void;
        deferPersist?: boolean;
        forceSnapshotApply?: boolean;
        initialData?: Record<string, any> | null;
        checkpointTargetIndex?: number;
        checkpointBaseData?: Record<string, any> | null;
        manualRefillProgress?: ManualRefillProgressV2_ACU;
    } = {}
): Promise<{ success: boolean; failedGroups: string[]; error?: string; tableData?: Record<string, any>; checkpointData?: Record<string, any> }> {
    if (!Array.isArray(groups) || groups.length === 0) {
        return { success: true, failedGroups: [] };
    }

    const migration = await ensureLegacyStorageMigratedBeforeWrite_ACU('processGroupedRuntimeChunk');
    if (!migration.success) {
        return { success: false, failedGroups: groups.map(group => group.key), error: migration.error || '旧存储迁移失败，已阻止本次填表。' };
    }
    if (migration.migrated) {
        await reloadStorageProvider();
    }

    const templateForLookup = parseTableTemplateJson_ACU({ stripSeedRows: true });
    const failedGroups = new Set<string>();
    let firstError: string | undefined;
    const transactionBuckets = new Map<string, {
        saveTargetIndex: number;
        batchNumber: number;
        updateMode: string;
        plannedJobs: PlannedGroupedRuntimeJob_ACU[];
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

            const updateMode = resolveUpdateMode_ACU(mode);
            const bucketKey = `${finalSaveTargetIndex}|${batchNumber}|${updateMode}|${options.isImportMode === true ? 1 : 0}`;
            const plannedJob: PlannedGroupedRuntimeJob_ACU = {
                group,
                batchNumber,
                firstMessageIndexOfBatch,
                lastMessageIndexOfBatch,
                saveTargetIndex: finalSaveTargetIndex,
                updateMode,
            };
            const existingBucket = transactionBuckets.get(bucketKey);
            if (existingBucket) {
                existingBucket.plannedJobs.push(plannedJob);
            } else {
                transactionBuckets.set(bucketKey, {
                    saveTargetIndex: finalSaveTargetIndex,
                    batchNumber,
                    updateMode,
                    plannedJobs: [plannedJob],
                });
            }
        }
    }

    const orderedBuckets = [...transactionBuckets.values()].sort((a, b) => a.saveTargetIndex - b.saveTargetIndex || a.batchNumber - b.batchNumber);
    let deferredWorkingData: Record<string, any> | null = options.initialData ? JSON.parse(JSON.stringify(options.initialData)) : null;
    let deferredCheckpointData: Record<string, any> | null = options.checkpointBaseData
        ? JSON.parse(JSON.stringify(options.checkpointBaseData))
        : (deferredWorkingData ? JSON.parse(JSON.stringify(deferredWorkingData)) : null);
    const useDeferredSqliteRuntime = options.deferPersist === true && isSqliteMode();
    if (useDeferredSqliteRuntime) {
        const initResult = await resetSqliteRuntimeFromSnapshot_ACU(deferredWorkingData, 'manual_refill_sql_runtime_init');
        if (!initResult.success) {
            return { success: false, failedGroups: groups.map(group => group.key), error: initResult.error || '手动重填 SQLite 运行时初始化失败。' };
        }
        deferredWorkingData = JSON.parse(JSON.stringify(initResult.data || deferredWorkingData));
        deferredCheckpointData = deferredCheckpointData || JSON.parse(JSON.stringify(deferredWorkingData));
    }
    const emitBucketProgress = (bucketIndex: number, event: CardUpdateProgressEvent): void => {
        options.onProgress?.({
            ...event,
            currentBatch: bucketIndex + 1,
            totalBatches: orderedBuckets.length,
        });
    };
    for (let bucketIndex = 0; bucketIndex < orderedBuckets.length; bucketIndex++) {
        const bucket = orderedBuckets[bucketIndex];
        const maxBucketRetries = Math.max(1, Number(settings_ACU.tableMaxRetries) || 3);
        let retryUnifiedError: string | null = null;
        let bucketSucceeded = false;

        for (let bucketAttempt = 1; bucketAttempt <= maxBucketRetries; bucketAttempt++) {
            const chatHistory = getChatArray_ACU();
            const bucketFirstMessageIndex = Math.min(...bucket.plannedJobs.map(job => job.firstMessageIndexOfBatch));
            const baseResult: { data: Record<string, any> | null; error: string | null } = options.deferPersist && deferredWorkingData
                ? { data: JSON.parse(JSON.stringify(deferredWorkingData)), error: null }
                : await buildBatchMergeBase_ACU(bucket.batchNumber, { maxMessageIndex: bucketFirstMessageIndex - 1 });
            if (!baseResult.data) {
                bucket.plannedJobs.forEach(job => failedGroups.add(job.group.key));
                firstError = firstError || baseResult.error || '无法构建合并基底，操作已终止。';
                break;
            }

            const mergedBatchData = baseResult.data;
            _set_currentJsonTableData_ACU(mergedBatchData);
            const baseSnapshot = JSON.parse(JSON.stringify(mergedBatchData));
            const bucketSheetKeys = [...new Set(bucket.plannedJobs.flatMap(job => job.group.sheetKeys || []))].sort();
            const baseRevision = captureTableRuntimeRevisionForWriteSet_ACU(buildWriteSetForSheetKeys_ACU(bucketSheetKeys, baseSnapshot));

            const jobs: GroupFillJob_ACU[] = [];
            for (const plannedJob of bucket.plannedJobs) {
                const isAutoUpdateMode = mode && mode.startsWith('auto');
                const lastAiMessageInBatch = chatHistory[plannedJob.lastMessageIndexOfBatch];
                const lastAiMessageContent = lastAiMessageInBatch?.mes || lastAiMessageInBatch?.message || '';
                const lastAiMessageLength = lastAiMessageContent.length;
                const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;
                if (isAutoUpdateMode && lastAiMessageLength < minReplyLength) {
                    continue;
                }

                let sliceStartIndex = plannedJob.firstMessageIndexOfBatch;
                if (sliceStartIndex > 0 && chatHistory[sliceStartIndex - 1]?.is_user) {
                    sliceStartIndex--;
                }
                const messagesForContext = chatHistory.slice(sliceStartIndex, plannedJob.lastMessageIndexOfBatch + 1);
                let effectiveRequestOptions = plannedJob.group.requestOptions || null;
                if (!effectiveRequestOptions?.tableApiPreset && Array.isArray(plannedJob.group.sheetKeys) && plannedJob.group.sheetKeys.length > 0) {
                    const firstTableName = templateForLookup?.[plannedJob.group.sheetKeys[0]]?.name || '';
                    const resolvedPreset = resolveTableApiPresetOverride_ACU(firstTableName);
                    if (resolvedPreset) {
                        effectiveRequestOptions = { ...(effectiveRequestOptions || {}), tableApiPreset: resolvedPreset };
                    }
                }

                jobs.push({
                    groupKey: plannedJob.group.key,
                    groupId: plannedJob.group.groupId,
                    batchNumber: plannedJob.batchNumber,
                    targetSheetKeys: plannedJob.group.sheetKeys,
                    messagesForContext,
                    saveTargetIndex: plannedJob.saveTargetIndex,
                    updateMode: plannedJob.updateMode,
                    requestOptions: effectiveRequestOptions,
                    baseSnapshot,
                    baseRevision,
                    isImportMode: options.isImportMode === true,
                });
            }

            if (jobs.length === 0) {
                bucketSucceeded = true;
                break;
            }

            const collectFeedback = retryUnifiedError ? { lastUnifiedError: retryUnifiedError } : undefined;
            const settledResponses = await Promise.allSettled(jobs.map(job => collectGroupFillResponse_ACU(
                job,
                collectFeedback,
                options.abortController,
                { onProgress: event => emitBucketProgress(bucketIndex, event) },
            )));
            const responses: GroupFillResponse_ACU[] = [];
            let collectFailed = false;
            let collectError: string | undefined;

            for (let i = 0; i < settledResponses.length; i++) {
                const settledResponse = settledResponses[i];
                const job = jobs[i];
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
                jobs.forEach(job => failedGroups.add(job.groupKey));
                firstError = firstError || collectError || 'AI响应收集失败';
                break;
            }

            emitBucketProgress(bucketIndex, { phase: 'saving' });
            const applyResult = useDeferredSqliteRuntime
                ? await applySqlResponsesToCurrentRuntime_ACU(responses, baseSnapshot, bucket.updateMode)
                : await applyUnifiedGroupFillResponses_ACU(responses, baseSnapshot, {
                    saveTargetIndex: bucket.saveTargetIndex,
                    updateMode: bucket.updateMode,
                    isImportMode: options.isImportMode === true,
                    baseRevision,
                    deferPersist: options.deferPersist === true,
                    forceSnapshotApply: options.forceSnapshotApply === true,
                });
            if (applyResult.success) {
                if (options.deferPersist && applyResult.tableData) {
                    deferredWorkingData = JSON.parse(JSON.stringify(applyResult.tableData));
                    deferredCheckpointData = deferredCheckpointData || JSON.parse(JSON.stringify(deferredWorkingData));
                    const checkpointSheetKeys = bucketSheetKeys.filter(sheetKey => Boolean((deferredWorkingData as any)?.[sheetKey]));
                    for (const sheetKey of checkpointSheetKeys) {
                        (deferredCheckpointData as any)[sheetKey] = JSON.parse(JSON.stringify((deferredWorkingData as any)[sheetKey]));
                    }
                    _set_currentJsonTableData_ACU(deferredCheckpointData);
                    const checkpointTargetIndex = Number.isInteger(options.checkpointTargetIndex) ? options.checkpointTargetIndex as number : bucket.saveTargetIndex;
                    const revisionWriteSet = checkpointSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }));
                    const maxPlannedMessageIndex = Math.max(...jobs.map(job => job.saveTargetIndex));
                    const progressStatus: ManualRefillProgressV2_ACU['status'] = maxPlannedMessageIndex >= checkpointTargetIndex ? 'complete' : 'in_progress';
                    const progress: ManualRefillProgressV2_ACU | undefined = options.manualRefillProgress
                        ? {
                            ...options.manualRefillProgress,
                            status: progressStatus,
                            completedUntilMessageIndex: Math.max(options.manualRefillProgress.completedUntilMessageIndex, maxPlannedMessageIndex),
                            updatedAt: Date.now(),
                        }
                        : undefined;
                    const checkpointCommit = await runTableUpdateCommit_ACU<{ modifiedKeys: string[] }>({
                        source: 'group_fill',
                        reason: 'manual_refill_progress_checkpoint',
                        isolationKey: getCurrentIsolationKey_ACU(),
                        writeSet: buildWriteSetForSheetKeys_ACU(checkpointSheetKeys, deferredCheckpointData),
                        revisionWriteSet,
                        initialData: deferredCheckpointData as any,
                        targetMessageIndex: checkpointTargetIndex,
                        targetSheetKeys: getSortedSheetKeys_ACU(deferredCheckpointData),
                        updateGroupKeys: checkpointSheetKeys,
                        trackingSheetKeys: checkpointSheetKeys,
                        trackAsUpdate: true,
                    }, () => ({
                        success: true,
                        value: { modifiedKeys: checkpointSheetKeys },
                        tableData: deferredCheckpointData as any,
                        persist: {
                            targetMessageIndex: checkpointTargetIndex,
                            targetSheetKeys: getSortedSheetKeys_ACU(deferredCheckpointData),
                            updateGroupKeys: checkpointSheetKeys,
                            trackingSheetKeys: checkpointSheetKeys,
                            trackAsUpdate: true,
                            forceCheckpoint: true,
                            checkpointReason: 'manual',
                            manualRefillProgress: progress,
                            revisionWriteSet,
                        },
                    }));
                    if (!checkpointCommit.success) {
                        jobs.forEach(job => failedGroups.add(job.groupKey));
                        firstError = firstError || checkpointCommit.error || '手动重填进度 checkpoint 保存失败。';
                        break;
                    }
                    if (checkpointCommit.tableData) {
                        deferredCheckpointData = JSON.parse(JSON.stringify(checkpointCommit.tableData));
                        _set_currentJsonTableData_ACU(deferredCheckpointData);
                        if (isSqliteMode()) {
                            try {
                                await reloadStorageProvider();
                            } catch (reloadError: any) {
                                logWarn_ACU(`[Manual Refill] SQLite provider 重建失败: ${reloadError?.message || reloadError}`);
                            }
                        }
                        await updateReadableLorebookEntry_ACU(true, false, null, deferredCheckpointData);
                    }
                    if (getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true) {
                        await enqueueSummaryVectorIndexFlush_ACU({ targetMessageIndex: checkpointTargetIndex, mode: 'sync', reason: 'manual_refill_progress' });
                    }
                }
                emitBucketProgress(bucketIndex, { phase: 'complete' });
                bucketSucceeded = true;
                break;
            }

            retryUnifiedError = applyResult.error || '统一提交失败。';
            if (bucketAttempt >= maxBucketRetries) {
                jobs.forEach(job => failedGroups.add(job.groupKey));
                firstError = firstError || `统一提交在 ${maxBucketRetries} 次尝试后仍失败: ${retryUnifiedError}`;
            } else {
                emitBucketProgress(bucketIndex, {
                    phase: 'retry',
                    attempt: bucketAttempt,
                    maxRetries: maxBucketRetries,
                    message: retryUnifiedError.substring(0, 50),
                });
            }
        }

        if (!bucketSucceeded && options.abortController?.signal.aborted) {
            break;
        }
    }

    return failedGroups.size > 0
        ? { success: false, failedGroups: [...failedGroups], error: firstError || '统一提交失败。', tableData: deferredWorkingData || undefined, checkpointData: deferredCheckpointData || undefined }
        : { success: true, failedGroups: [], tableData: deferredWorkingData || undefined, checkpointData: deferredCheckpointData || undefined };
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
                const rawBaseSnapshot = getRuntimeTableDataSnapshot_ACU(progressContext?.batchBaseSnapshot || null) || {};
                const baseRevision = captureTableRuntimeRevisionForWriteSet_ACU(buildWriteSetForSheetKeys_ACU(targetSheetKeys, rawBaseSnapshot));
                const collectResult = await collectGroupFillResponse_ACU({
                    groupKey: `legacy_execute_${saveTargetIndex}`,
                    groupId: 0,
                    batchNumber: progressContext?.currentBatch || 1,
                    targetSheetKeys,
                    messagesForContext: messagesToUse,
                    saveTargetIndex,
                    updateMode,
                    requestOptions,
                    baseSnapshot: rawBaseSnapshot,
                    baseRevision,
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

                const isSqlTableEdit = isSqliteMode() && typeof collectResult.tableEditText === 'string' && isSqlContent(collectResult.tableEditText);

                if (isSqlTableEdit) {
                    const operations = buildSqlBatchOperationsFromText_ACU(collectResult.tableEditText || '');
                    const writeSet = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0
                        ? targetSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }))
                        : [{ kind: 'all' as const }];
                    const commitResult = await runTableUpdateCommit_ACU<CardUpdateResult>({
                        source: 'group_fill',
                        reason: 'executeCardUpdateCore',
                        isolationKey: getCurrentIsolationKey_ACU(),
                        writeSet,
                        baseRevision,
                        initialData: rawBaseSnapshot as any,
                        targetMessageIndex: saveTargetIndex,
                        targetSheetKeys: null,
                        updateGroupKeys: null,
                        trackingSheetKeys: null,
                        trackAsUpdate: true,
                        skipChatSave: isImportMode,
                    }, async () => {
                        const provider = await ensureStorageProviderReady_ACU();
                        let parseResult: any;
                        try {
                            parseResult = provider.applyEdits(collectResult.tableEditText || '', updateMode);
                        } catch (error: any) {
                            return { success: false, error: error?.message || String(error) };
                        }
                        const parseSuccess = !!parseResult?.success;
                        const parsedKeys: string[] = Array.isArray(parseResult?.modifiedKeys) ? parseResult.modifiedKeys : [];
                        if (!parseSuccess) {
                            return { success: false, error: parseResult?.error || '解析或应用AI更新时出错' };
                        }

                        const runtimeData = (provider.getCurrentData() || currentJsonTableData_ACU || rawBaseSnapshot) as Record<string, any>;
                        applySpecialIndexSequenceToSummaryTables_ACU(runtimeData);

                        if (isImportMode) {
                            emitProgress({ phase: 'chunk_done' });
                            logDebug_ACU('Import mode: skipping save to chat history for this chunk.');
                            return {
                                success: true,
                                value: { success: true, modifiedKeys: parsedKeys },
                                tableData: runtimeData as any,
                                mutationResult: { changes: parseResult.appliedEdits || 0, errors: [] },
                                persist: { revisionWriteSet: parsedKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey })) },
                            };
                        }

                        emitProgress({ phase: 'saving' });
                        let keysToPersist = parsedKeys;
                        if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
                            keysToPersist = keysToPersist.filter((k: string) => targetSheetKeys.includes(k));
                        }

                        const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
                        const hasTargetSheetTracking = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0;
                        const allSheetKeys = getSortedSheetKeys_ACU(runtimeData);
                        const targetTrackingKeys = hasTargetSheetTracking
                            ? targetSheetKeys.filter((sheetKey: string) => Boolean(runtimeData?.[sheetKey]))
                            : [];
                        let keysToActuallySave = keysToPersist;
                        if (isFirstTimeInit) {
                            keysToActuallySave = allSheetKeys;
                            const fullTemplate = parseTableTemplateJson_ACU({ stripSeedRows: false });
                            if (fullTemplate) {
                                allSheetKeys.forEach(sheetKey => {
                                    if (!keysToPersist.includes(sheetKey) && fullTemplate[sheetKey]) {
                                        runtimeData[sheetKey] = JSON.parse(JSON.stringify(fullTemplate[sheetKey]));
                                        logDebug_ACU(`[Init] Table ${sheetKey} not modified by AI, using template data (may include seed rows).`);
                                    }
                                });
                            }
                            logDebug_ACU('[Init] First time initialization detected. Saving complete template structure with all tables.');
                        }
                        const keysToTrackAsUpdated = hasTargetSheetTracking
                            ? keysToPersist.filter((sheetKey: string) => targetTrackingKeys.includes(sheetKey))
                            : keysToPersist.filter((sheetKey: string) => keysToActuallySave.includes(sheetKey));
                        const fillAttemptKeys = hasTargetSheetTracking
                            ? targetTrackingKeys
                            : keysToPersist;
                        const updateGroupKeysToUse = Array.isArray(fillAttemptKeys)
                            ? fillAttemptKeys.filter(sheetKey => {
                                const table = runtimeData?.[sheetKey];
                                if (!table || !isSummaryOrOutlineTable_ACU(table.name)) return true;
                                return keysToTrackAsUpdated.includes(sheetKey);
                            })
                            : fillAttemptKeys;
                        const revisionWriteSet = parsedKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }));

                        return {
                            success: true,
                            value: { success: true, modifiedKeys: parsedKeys },
                            tableData: runtimeData as any,
                            mutationResult: { changes: parseResult.appliedEdits || 0, errors: [] },
                            persist: {
                                targetSheetKeys: keysToActuallySave,
                                updateGroupKeys: updateGroupKeysToUse,
                                trackingSheetKeys: keysToTrackAsUpdated,
                                trackAsUpdate: true,
                                operations,
                                revisionWriteSet,
                            },
                        };
                    });

                    if (!commitResult.success || !commitResult.value) {
                        throw new Error(commitResult.error || '解析或应用AI更新时出错');
                    }
                    modifiedKeys = commitResult.value.modifiedKeys;
                    if (!isImportMode && commitResult.tableData) {
                        await updateReadableLorebookEntry_ACU(true, false, null, commitResult.tableData);
                    }
                    success = true;
                    break;
                }

                const writeSet = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0
                    ? targetSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }))
                    : [{ kind: 'all' as const }];
                const updateOutcome = await runTableUpdateCommit_ACU<CardUpdateResult>({
                    source: 'group_fill',
                    reason: 'executeCardUpdateCore:snapshot',
                    isolationKey: getCurrentIsolationKey_ACU(),
                    writeSet,
                    baseRevision,
                    initialData: rawBaseSnapshot as any,
                    targetMessageIndex: saveTargetIndex,
                    targetSheetKeys: null,
                    updateGroupKeys: null,
                    trackingSheetKeys: null,
                    trackAsUpdate: true,
                    skipChatSave: isImportMode,
                }, async ({ workingData }) => {
                    let workingTableData = (workingData || {}) as Record<string, any>;
                    const operations: TableMutationOperationV2_ACU[] = [];
                    const parseResult: any = parseAndApplyTableEditsToData_ACU(aiResponse, workingTableData, updateMode, isImportMode);
                    if (typeof collectResult.tableEditText === 'string' && collectResult.tableEditText.trim()) {
                        operations.push({ kind: 'table_edit_dsl', text: collectResult.tableEditText, updateMode });
                    }

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
                        return { success: false, error: parseResult?.error || '解析或应用AI更新时出错' };
                    }

                    applySpecialIndexSequenceToSummaryTables_ACU(workingTableData);
                    const revisionWriteSet = parsedKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey }));
                    if (isImportMode) {
                        emitProgress({ phase: 'chunk_done' });
                        logDebug_ACU("Import mode: skipping save to chat history for this chunk.");
                        return {
                            success: true,
                            value: { success: true, modifiedKeys: parsedKeys },
                            tableData: workingTableData as any,
                            persist: { revisionWriteSet },
                        };
                    }

                    emitProgress({ phase: 'saving' });

                    let keysToPersist = parsedKeys;
                    if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
                        keysToPersist = keysToPersist.filter((k: string) => targetSheetKeys.includes(k));
                    }

                    const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
                    const hasTargetSheetTracking = Array.isArray(targetSheetKeys) && targetSheetKeys.length > 0;
                    const allSheetKeys = getSortedSheetKeys_ACU(workingTableData);
                    const targetTrackingKeys = hasTargetSheetTracking
                        ? targetSheetKeys.filter((sheetKey: string) => Boolean(workingTableData?.[sheetKey]))
                        : [];
                    let keysToActuallySave = keysToPersist;
                    if (isFirstTimeInit) {
                        keysToActuallySave = allSheetKeys;

                        const fullTemplate = parseTableTemplateJson_ACU({ stripSeedRows: false });
                        if (fullTemplate) {
                            allSheetKeys.forEach(sheetKey => {
                                if (!keysToPersist.includes(sheetKey) && fullTemplate[sheetKey]) {
                                    workingTableData[sheetKey] = JSON.parse(JSON.stringify(fullTemplate[sheetKey]));
                                    logDebug_ACU(`[Init] Table ${sheetKey} not modified by AI, using template data (may include seed rows).`);
                                }
                            });
                        }

                        logDebug_ACU('[Init] First time initialization detected. Saving complete template structure with all tables.');
                    }

                    if (keysToPersist.length === 0 && !isFirstTimeInit && !hasTargetSheetTracking) {
                        logDebug_ACU("No tables were modified by AI and no target sheets are known; committing runtime view without chat persistence.");
                        return {
                            success: true,
                            value: { success: true, modifiedKeys: parsedKeys },
                            tableData: workingTableData as any,
                            persist: { targetSheetKeys: [], updateGroupKeys: [], trackingSheetKeys: [], trackAsUpdate: false, operations, revisionWriteSet },
                        };
                    }

                    const keysToTrackAsUpdated = hasTargetSheetTracking
                        ? keysToPersist.filter((sheetKey: string) => targetTrackingKeys.includes(sheetKey))
                        : keysToPersist.filter((sheetKey: string) => keysToActuallySave.includes(sheetKey));
                    const fillAttemptKeys = hasTargetSheetTracking
                        ? targetTrackingKeys
                        : keysToPersist;
                    const updateGroupKeysToUse = Array.isArray(fillAttemptKeys)
                        ? fillAttemptKeys.filter(sheetKey => {
                            const table = workingTableData?.[sheetKey];
                            if (!table || !isSummaryOrOutlineTable_ACU(table.name)) return true;
                            return keysToTrackAsUpdated.includes(sheetKey);
                        })
                        : fillAttemptKeys;

                    return {
                        success: true,
                        value: { success: true, modifiedKeys: parsedKeys },
                        tableData: workingTableData as any,
                        persist: {
                            targetSheetKeys: keysToActuallySave,
                            updateGroupKeys: updateGroupKeysToUse,
                            trackingSheetKeys: keysToTrackAsUpdated,
                            trackAsUpdate: true,
                            operations,
                            revisionWriteSet,
                        },
                    };
                });

                if (!updateOutcome.success || !updateOutcome.value) {
                    return { success: false, modifiedKeys: [], error: updateOutcome.error || '无法将更新后的数据库保存到聊天记录。' };
                }
                modifiedKeys = updateOutcome.value.modifiedKeys;
                if (!isImportMode && updateOutcome.tableData) {
                    await updateReadableLorebookEntry_ACU(true, false, null, updateOutcome.tableData);
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

    const migration = await ensureLegacyStorageMigratedBeforeWrite_ACU('processUpdatesBatch');
    if (!migration.success) {
        return { success: false, error: migration.error || '旧存储迁移失败，已阻止本次填表。' };
    }
    if (migration.migrated) {
        await reloadStorageProvider();
    }

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
            const baseResult = await buildBatchMergeBase_ACU(batchNumber, { maxMessageIndex: firstMessageIndexOfBatch - 1 });
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
 *   - clearBeforeUpdate: 兼容旧调用名；现在表示启用事务式手动重填，不会预先清空聊天记录。
 */
export async function orchestrateManualUpdate_ACU(
    targetKeys: string[],
    processBatch: (indices: number[], mode: string, options: any) => Promise<BatchUpdateResult>,
    refreshData: () => Promise<void>,
    options: {
        clearBeforeUpdate?: boolean;
        onProgress?: (event: CardUpdateProgressEvent) => void;
    } = {},
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

        const manualRefillEnabled = options.clearBeforeUpdate === true;
        let manualRefillInitialData: Record<string, any> | null = null;
        let manualRefillCheckpointData: Record<string, any> | null = null;
        let manualRefillTargetIndex = contextScopeIndices[contextScopeIndices.length - 1];
        let manualRefillProgress: ManualRefillProgressV2_ACU | undefined;
        if (manualRefillEnabled) {
            const latestBaseResult = await buildBatchMergeBase_ACU(0);
            if (!latestBaseResult.data) {
                return { success: false, error: latestBaseResult.error || '无法构建当前表格快照，操作已终止。' };
            }
            const existingProgress = getManualRefillProgressAtMessage_ACU(getChatArray_ACU() || [], manualRefillTargetIndex);
            const matchedProgress = manualRefillProgressMatches_ACU(existingProgress, targetKeys, contextScopeIndices, manualRefillTargetIndex)
                ? existingProgress
                : null;
            if (matchedProgress) {
                manualRefillCheckpointData = JSON.parse(JSON.stringify(latestBaseResult.data));
                manualRefillInitialData = JSON.parse(JSON.stringify(latestBaseResult.data));
                logDebug_ACU(`[Manual Refill] 检测到未完成重填进度，将从消息索引 ${matchedProgress.completedUntilMessageIndex + 1} 继续。`);
            } else {
                manualRefillInitialData = await buildManualRefillInitialData_ACU(
                    getChatArray_ACU() || [],
                    contextScopeIndices[0],
                    targetKeys,
                    latestBaseResult.data,
                );
                manualRefillCheckpointData = JSON.parse(JSON.stringify(manualRefillInitialData));
            }
            const pendingStartIndex = matchedProgress ? matchedProgress.completedUntilMessageIndex + 1 : contextScopeIndices[0];
            const pendingContextScopeIndices = contextScopeIndices.filter(index => index >= pendingStartIndex);
            if (matchedProgress && pendingContextScopeIndices.length === 0) {
                logDebug_ACU('[Manual Refill] 已存在完整的重填进度，无需继续处理。');
                return { success: true };
            }
            manualRefillProgress = matchedProgress
                ? { ...matchedProgress, batchSize: uiBatchSize, contextMessageIndices: contextScopeIndices.slice(), updatedAt: Date.now() }
                : {
                    kind: 'manual_refill',
                    status: 'in_progress',
                    selectedSheetKeys: [...new Set(targetKeys)].sort(),
                    contextMessageIndices: contextScopeIndices.slice(),
                    originalStartMessageIndex: contextScopeIndices[0],
                    targetMessageIndex: manualRefillTargetIndex,
                    batchSize: uiBatchSize,
                    completedUntilMessageIndex: contextScopeIndices[0] - 1,
                    updatedAt: Date.now(),
                };
            if (matchedProgress) {
                for (const gKey of Object.keys(updateGroups)) {
                    updateGroups[gKey].indices = pendingContextScopeIndices;
                }
            }
            _set_currentJsonTableData_ACU(JSON.parse(JSON.stringify(manualRefillInitialData)));
            logDebug_ACU(`[Manual Refill] 已构建事务式重填基底，选中 ${targetKeys.length} 张表，范围 ${pendingContextScopeIndices[0] ?? contextScopeIndices[0]}..${manualRefillTargetIndex}。`);
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
            const chunkResult = await processGroupedRuntimeChunk_ACU(groupedChunk, 'manual_independent', {
                onProgress: options.onProgress,
                deferPersist: manualRefillEnabled,
                forceSnapshotApply: manualRefillEnabled,
                initialData: manualRefillInitialData,
                checkpointTargetIndex: manualRefillTargetIndex,
                checkpointBaseData: manualRefillCheckpointData,
                manualRefillProgress,
            });
            if (manualRefillEnabled && chunkResult.tableData) {
                manualRefillInitialData = JSON.parse(JSON.stringify(chunkResult.tableData));
            }
            if (manualRefillEnabled && chunkResult.checkpointData) {
                manualRefillCheckpointData = JSON.parse(JSON.stringify(chunkResult.checkpointData));
            }
            if (!chunkResult.success) {
                chunkResult.failedGroups.forEach(key => {
                    failedGroups.push({ key, error: chunkResult.error || '手动更新失败或被终止。' });
                });
            }

            // 并发组内禁止每组单独刷新；填表保存后 currentJsonTableData_ACU 已由本轮 workingTableData 更新。
            // 这里只同步聊天数组，避免刚保存完又通过 refreshData 触发历史回放/重建。
            await loadAllChatMessages_ACU();

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
