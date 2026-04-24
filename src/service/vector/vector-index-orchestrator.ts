import {
    cloneIsolatedData_ACU,
    readIsolatedTagData_ACU,
    writeIsolatedTagData_ACU,
    writeMessageIdentity_ACU,
    writeLegacyCompatData_ACU,
    writeLegacyStandardAndSummary_ACU,
} from '../../data/repositories/chat-message-data-repo';
import {
    persistRemoteMemorySnapshotAnchorIfNeeded_ACU,
    resolveRemoteMemorySnapshotAnchor_ACU,
} from './remote-memory-snapshot-anchor';
import { currentJsonTableData_ACU, currentChatFileIdentifier_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../runtime/state-manager';
import { getChatArray_ACU } from '../chat/chat-service';
import { isSummaryOrOutlineTable_ACU, logWarn_ACU } from '../../shared/utils';
import { getLatestAiMessageIndexFromChat_ACU } from '../table/table-history';
import { saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { syncVectorMemoryLorebookEntryFromState_ACU } from '../worldbook/vector-memory-entry-service';
import { assignVectorStateToTagData_ACU, mergeVectorRemoteMemoryBatches_ACU, replaceVectorRemoteMemoryBatches_ACU } from './vector-index-state-service';
import { getActiveRemoteMemorySnapshot_ACU } from './remote-memory-active-snapshot-service';
import { getCurrentVectorMemoryConfig_ACU, getVectorMemoryNamespace_ACU, validateVectorIndexBuildConfig_ACU } from './vector-memory-config';
import { buildRemoteMemoryBatchFromRows_ACU, type RemoteMemoryArchiveSourceRow_ACU } from './remote-memory-build-service';
import { sanitizeSheetForStorage_ACU } from '../template/chat-scope';

export interface SummaryVectorIndexProgressEvent_ACU {
    stage: string;
    message: string;
    currentBatchIndex?: number;
    completedBatches?: number;
    totalBatches?: number;
}

export interface SummaryVectorIndexOptions_ACU {
    targetMessageIndex?: number;
    force?: boolean;
    signal?: AbortSignal | null;
    onProgress?: ((event: SummaryVectorIndexProgressEvent_ACU) => void) | null;
}

export interface SummaryVectorIndexResult_ACU {
    success: boolean;
    skipped: boolean;
    canceled: boolean;
    indexedCount: number;
    chunkCount: number;
    messageIndex?: number;
    summaryKey?: string;
    reason?: string;
    errors: string[];
}

interface SummaryTableSelection_ACU {
    summaryKey: string;
    table: any;
}

function buildResult_ACU(partial: Partial<SummaryVectorIndexResult_ACU> = {}): SummaryVectorIndexResult_ACU {
    return {
        success: false,
        skipped: false,
        canceled: false,
        indexedCount: 0,
        chunkCount: 0,
        errors: [],
        ...partial,
    };
}

function buildCanceledResult_ACU(partial: Partial<SummaryVectorIndexResult_ACU> = {}): SummaryVectorIndexResult_ACU {
    return buildResult_ACU({
        success: true,
        skipped: true,
        canceled: true,
        reason: 'aborted_by_user',
        errors: [],
        ...partial,
    });
}

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function emitProgress_ACU(
    onProgress: SummaryVectorIndexOptions_ACU['onProgress'],
    event: SummaryVectorIndexProgressEvent_ACU,
): void {
    if (typeof onProgress !== 'function') {
        return;
    }
    try {
        onProgress(event);
    } catch (error) {
        logWarn_ACU('[向量记忆] 远记忆归档进度回调执行失败:', error);
    }
}

function createAbortError_ACU(message = '用户已终止远记忆归档。'): Error {
    const error = new Error(message);
    (error as any).name = 'AbortError';
    return error;
}

function isAbortError_ACU(error: any): boolean {
    return error?.name === 'AbortError';
}

function throwIfAborted_ACU(signal?: AbortSignal | null, message = '用户已终止远记忆归档。'): void {
    if (signal?.aborted) {
        throw createAbortError_ACU(message);
    }
}

function findSummaryTable_ACU(): SummaryTableSelection_ACU | null {
    if (!currentJsonTableData_ACU || typeof currentJsonTableData_ACU !== 'object') {
        return null;
    }

    const summaryKey = Object.keys(currentJsonTableData_ACU).find((key) => {
        const table = currentJsonTableData_ACU[key];
        return !!table?.name && isSummaryOrOutlineTable_ACU(String(table.name || ''));
    });

    if (!summaryKey) return null;
    const table = currentJsonTableData_ACU[summaryKey];
    if (!table || !Array.isArray(table.content)) return null;

    return {
        summaryKey,
        table,
    };
}

function resolveSummaryColumnIndexByAliases_ACU(headerRow: any[], aliases: string[], fallbackIndex: number): number {
    const headers = Array.isArray(headerRow) ? headerRow.slice(1) : [];
    const normalizedAliases = aliases.map((item) => normalizeText_ACU(item).replace(/\s+/g, ''));
    const index = headers.findIndex((header) => normalizedAliases.includes(normalizeText_ACU(header).replace(/\s+/g, '')));
    return index >= 0 ? index : fallbackIndex;
}

function buildArchiveSourceRows_ACU(table: any, targetMessageId: string): RemoteMemoryArchiveSourceRow_ACU[] {
    const content = Array.isArray(table?.content) ? table.content : [];
    const headerRow = Array.isArray(content[0]) ? content[0] : ['row_id'];
    const rows = content.slice(1).filter((row: any) => Array.isArray(row) && row.length > 1);

    const timeSpanIndex = resolveSummaryColumnIndexByAliases_ACU(headerRow, ['时间跨度', '时间', '阶段', '时段'], 0);
    const locationIndex = resolveSummaryColumnIndexByAliases_ACU(headerRow, ['地点', '位置', '场景', '场所'], 1);
    const summaryIndex = resolveSummaryColumnIndexByAliases_ACU(headerRow, ['概要', '概览', '概述', '摘要'], 2);
    const contentIndex = resolveSummaryColumnIndexByAliases_ACU(headerRow, ['纪要', '纪要内容', '内容', '正文'], 3);

    return rows.map((row: any, index: number): RemoteMemoryArchiveSourceRow_ACU => {
        const rowId = normalizeText_ACU(row?.[0]) || String(index + 1);
        return {
            rowKey: `${targetMessageId}:${rowId}`,
            rowId,
            timeSpan: normalizeText_ACU(row?.[timeSpanIndex + 1]),
            location: normalizeText_ACU(row?.[locationIndex + 1]),
            summary: normalizeText_ACU(row?.[summaryIndex + 1]),
            content: normalizeText_ACU(row?.[contentIndex + 1]),
            sourceMessageId: targetMessageId,
        };
    }).filter((row: RemoteMemoryArchiveSourceRow_ACU) => row.rowKey && (row.content || row.summary));
}

function pickRowsToArchive_ACU(
    rows: RemoteMemoryArchiveSourceRow_ACU[],
    threshold: number,
    archiveTriggerCount: number,
    archiveBatchSize: number,
    force: boolean,
): RemoteMemoryArchiveSourceRow_ACU[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const overflowCount = rows.length - threshold;
    if (force) {
        if (overflowCount <= 0) {
            return rows.slice(0, Math.min(rows.length, archiveBatchSize));
        }
        return rows.slice(0, overflowCount);
    }

    if (overflowCount < archiveTriggerCount) {
        return [];
    }

    const autoArchiveCount = Math.min(
        overflowCount,
        Math.max(1, Math.floor(Number(archiveTriggerCount) || 1)),
    );
    return rows.slice(0, autoArchiveCount);
}

function chunkArchiveRows_ACU(
    rows: RemoteMemoryArchiveSourceRow_ACU[],
    archiveBatchSize: number,
): RemoteMemoryArchiveSourceRow_ACU[][] {
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }

    const normalizedBatchSize = Math.max(1, Math.floor(Number(archiveBatchSize) || 1));
    const batches: RemoteMemoryArchiveSourceRow_ACU[][] = [];
    for (let index = 0; index < rows.length; index += normalizedBatchSize) {
        const batchRows = rows.slice(index, index + normalizedBatchSize);
        if (batchRows.length > 0) {
            batches.push(batchRows);
        }
    }
    return batches;
}

async function buildRemoteMemoryBatchesWithConcurrency_ACU(
    rowBatches: RemoteMemoryArchiveSourceRow_ACU[][],
    options: {
        namespace: string;
        snapshotMessageId: string;
        sourceMessageId: string;
        config: ReturnType<typeof getCurrentVectorMemoryConfig_ACU>;
        maxConcurrency: number;
        signal?: AbortSignal | null;
        onProgress?: SummaryVectorIndexOptions_ACU['onProgress'];
    },
) {
    if (!Array.isArray(rowBatches) || rowBatches.length === 0) {
        return [];
    }

    throwIfAborted_ACU(options.signal);

    const normalizedConcurrency = Math.max(1, Math.floor(Number(options.maxConcurrency) || 1));
    const results: any[] = new Array(rowBatches.length);
    let cursor = 0;
    let completedBatches = 0;

    async function worker(): Promise<void> {
        while (cursor < rowBatches.length) {
            throwIfAborted_ACU(options.signal);
            const batchIndex = cursor;
            cursor += 1;
            const rows = rowBatches[batchIndex];
            emitProgress_ACU(options.onProgress, {
                stage: 'building_batch',
                message: `正在归档第 ${batchIndex + 1}/${rowBatches.length} 批远记忆...`,
                currentBatchIndex: batchIndex + 1,
                completedBatches,
                totalBatches: rowBatches.length,
            });
            const batch = await buildRemoteMemoryBatchFromRows_ACU(rows, {
                namespace: options.namespace,
                snapshotMessageId: options.snapshotMessageId,
                sourceMessageId: options.sourceMessageId,
                batchSequence: batchIndex,
                config: options.config,
            });
            results[batchIndex] = batch;
            completedBatches += 1;
            if (options.signal?.aborted) {
                emitProgress_ACU(options.onProgress, {
                    stage: 'cancel_requested',
                    message: '已收到终止请求，当前批次已完成，正在停止后续批次...',
                    currentBatchIndex: batchIndex + 1,
                    completedBatches,
                    totalBatches: rowBatches.length,
                });
                throwIfAborted_ACU(options.signal);
            }
            emitProgress_ACU(options.onProgress, {
                stage: 'batch_built',
                message: `已完成 ${completedBatches}/${rowBatches.length} 批远记忆归档构建...`,
                currentBatchIndex: batchIndex + 1,
                completedBatches,
                totalBatches: rowBatches.length,
            });
        }
    }

    const workers = Array.from({ length: Math.min(normalizedConcurrency, rowBatches.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

function removeArchivedRowsFromTable_ACU(table: any, archivedRowIds: Set<string>): void {
    if (!table || !Array.isArray(table.content) || archivedRowIds.size === 0) {
        return;
    }

    const headerRow = Array.isArray(table.content[0]) ? table.content[0] : ['row_id'];
    const preservedRows = table.content.slice(1).filter((row: any) => {
        if (!Array.isArray(row)) return false;
        const rowId = normalizeText_ACU(row?.[0]);
        return !archivedRowIds.has(rowId);
    });

    table.content = [headerRow, ...preservedRows];
}

function resolveTargetMessageIndex_ACU(preferredIndex?: number): number {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) {
        return -1;
    }

    if (typeof preferredIndex === 'number' && preferredIndex >= 0 && chat[preferredIndex] && !chat[preferredIndex].is_user) {
        return preferredIndex;
    }

    return getLatestAiMessageIndexFromChat_ACU(chat);
}

export async function buildSummaryVectorIndexIfNeeded_ACU(
    options: SummaryVectorIndexOptions_ACU = {},
): Promise<SummaryVectorIndexResult_ACU> {
    const vectorConfig = getCurrentVectorMemoryConfig_ACU();

    if (!vectorConfig.enabled) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            reason: 'vector_memory_disabled',
        });
    }

    const buildConfigValidation = validateVectorIndexBuildConfig_ACU(vectorConfig);
    if (!buildConfigValidation.valid) {
        return buildResult_ACU({
            success: false,
            skipped: false,
            reason: 'vector_memory_build_config_invalid',
            errors: buildConfigValidation.errors,
        });
    }

    const selectedSummary = findSummaryTable_ACU();
    if (!selectedSummary) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            reason: 'summary_table_not_found',
        });
    }

    const targetMessageIndex = resolveTargetMessageIndex_ACU(options.targetMessageIndex);
    if (targetMessageIndex < 0) {
        return buildResult_ACU({
            success: false,
            reason: 'target_message_not_found',
            errors: ['未找到可写入远记忆快照的 AI 楼层。'],
        });
    }

    const chat = getChatArray_ACU();
    const targetMessage = chat[targetMessageIndex];
    if (!targetMessage || targetMessage.is_user) {
        return buildResult_ACU({
            success: false,
            reason: 'target_message_invalid',
            errors: ['目标楼层不是可写入的 AI 消息。'],
        });
    }

    const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, targetMessageIndex);
    if (!snapshotAnchor?.anchor) {
        return buildResult_ACU({
            success: false,
            reason: 'snapshot_anchor_unresolved',
            errors: ['目标楼层缺少可用的远记忆快照锚点，无法写入远记忆快照。'],
        });
    }
    const snapshotMessageId = snapshotAnchor.anchor;

    emitProgress_ACU(options.onProgress, {
        stage: 'prepare',
        message: '正在分析纪要条目与远记忆归档条件...',
    });
    if (options.signal?.aborted) {
        return buildCanceledResult_ACU({
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
        });
    }

    const sourceRows = buildArchiveSourceRows_ACU(selectedSummary.table, snapshotMessageId);
    if (sourceRows.length === 0) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            reason: 'no_effective_rows',
        });
    }

    const rowsToArchive = pickRowsToArchive_ACU(
        sourceRows,
        vectorConfig.threshold,
        vectorConfig.archiveTriggerCount,
        vectorConfig.archiveBatchSize,
        options.force === true,
    );
    if (rowsToArchive.length === 0) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            reason: 'threshold_not_reached',
        });
    }

    const rowBatches = chunkArchiveRows_ACU(rowsToArchive, vectorConfig.archiveBatchSize);
    if (rowBatches.length === 0) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            reason: 'threshold_not_reached',
        });
    }

    emitProgress_ACU(options.onProgress, {
        stage: 'plan_archive_batches',
        message: `已选中 ${rowsToArchive.length} 条纪要，准备分 ${rowBatches.length} 批归档远记忆...`,
        completedBatches: 0,
        totalBatches: rowBatches.length,
    });
    if (options.signal?.aborted) {
        return buildCanceledResult_ACU({
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
        });
    }

    const isolationKey = getCurrentIsolationKey_ACU();
    const existingTagData = readIsolatedTagData_ACU(targetMessage, isolationKey) || {
        independentData: {},
        modifiedKeys: [],
        updateGroupKeys: [],
    };
    const activeSnapshot = getActiveRemoteMemorySnapshot_ACU();
    const existingVectorState = activeSnapshot?.vectorState || null;
    const namespace = getVectorMemoryNamespace_ACU(currentChatFileIdentifier_ACU || undefined);

    try {
        emitProgress_ACU(options.onProgress, {
            stage: 'building_batches',
            message: `正在构建 ${rowBatches.length} 批远记忆归档内容...`,
            completedBatches: 0,
            totalBatches: rowBatches.length,
        });
        const nextBatches = await buildRemoteMemoryBatchesWithConcurrency_ACU(rowBatches, {
            namespace,
            snapshotMessageId,
            sourceMessageId: snapshotMessageId,
            config: vectorConfig,
            maxConcurrency: (vectorConfig as any).archiveMaxConcurrency || 1,
            signal: options.signal,
            onProgress: options.onProgress,
        });

        throwIfAborted_ACU(options.signal);

        const mergedBatches = mergeVectorRemoteMemoryBatches_ACU(
            existingVectorState?.remoteMemoryBatches,
            nextBatches,
        );
        const archivedAt = new Date().toISOString();
        const nextVectorState = replaceVectorRemoteMemoryBatches_ACU(existingVectorState, mergedBatches, {
            snapshotMessageId,
            indexedAt: archivedAt,
            archivedAt,
        });

        emitProgress_ACU(options.onProgress, {
            stage: 'saving_snapshot',
            message: '归档批次构建完成，正在写回本地聊天记录...',
            completedBatches: rowBatches.length,
            totalBatches: rowBatches.length,
        });
        throwIfAborted_ACU(options.signal);

        const archivedRowIds = new Set(rowsToArchive.map((row) => row.rowId));
        removeArchivedRowsFromTable_ACU(selectedSummary.table, archivedRowIds);

        const sanitizedSummaryTable = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(selectedSummary.table)));
        const nextIndependentData = {
            ...(existingTagData.independentData || {}),
            [selectedSummary.summaryKey]: sanitizedSummaryTable,
        };
        const nextIsolatedData = cloneIsolatedData_ACU(targetMessage);
        const nextTagData = {
            independentData: nextIndependentData,
            modifiedKeys: Array.isArray(existingTagData.modifiedKeys) ? [...existingTagData.modifiedKeys] : [],
            updateGroupKeys: Array.isArray(existingTagData.updateGroupKeys) ? [...existingTagData.updateGroupKeys] : [],
            ...(existingTagData._acu_base_state ? { _acu_base_state: existingTagData._acu_base_state } : {}),
        } as any;
        assignVectorStateToTagData_ACU(nextTagData, nextVectorState);
        nextIsolatedData[isolationKey] = nextTagData;
        targetMessage.TavernDB_ACU_IsolatedData = nextIsolatedData;
        writeIsolatedTagData_ACU(targetMessage, isolationKey, nextTagData);
        persistRemoteMemorySnapshotAnchorIfNeeded_ACU(targetMessage, snapshotAnchor);
        writeMessageIdentity_ACU(targetMessage, {
            enabled: settings_ACU.dataIsolationEnabled,
            code: settings_ACU.dataIsolationCode,
        });
        writeLegacyCompatData_ACU(
            targetMessage,
            nextIndependentData,
            nextTagData.modifiedKeys || [],
            nextTagData.updateGroupKeys || [],
        );

        const nextLegacySummaryData = {
            ...(targetMessage?.TavernDB_ACU_SummaryData && typeof targetMessage.TavernDB_ACU_SummaryData === 'object'
                ? JSON.parse(JSON.stringify(targetMessage.TavernDB_ACU_SummaryData))
                : { mate: { type: 'chatSheets', version: 1 } }),
            [selectedSummary.summaryKey]: sanitizedSummaryTable,
        };
        writeLegacyStandardAndSummary_ACU(
            targetMessage,
            targetMessage?.TavernDB_ACU_Data && typeof targetMessage.TavernDB_ACU_Data === 'object'
                ? JSON.parse(JSON.stringify(targetMessage.TavernDB_ACU_Data))
                : null,
            nextLegacySummaryData,
        );

        await saveChatToHost_ACU();

        emitProgress_ACU(options.onProgress, {
            stage: 'syncing_worldbook',
            message: '本地聊天记录已更新，正在同步远记忆世界书...',
            completedBatches: rowBatches.length,
            totalBatches: rowBatches.length,
        });
        const syncResult = await syncVectorMemoryLorebookEntryFromState_ACU(nextVectorState.remoteMemoryBatches, vectorConfig);
        const errors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];
        const totalChunkCount = nextBatches.reduce((sum, batch) => sum + (Array.isArray(batch?.chunks) ? batch.chunks.length : 0), 0);

        emitProgress_ACU(options.onProgress, {
            stage: 'completed',
            message: '远记忆归档完成。',
            completedBatches: rowBatches.length,
            totalBatches: rowBatches.length,
        });
        return buildResult_ACU({
            success: true,
            skipped: false,
            indexedCount: nextBatches.length,
            chunkCount: totalChunkCount,
            messageIndex: targetMessageIndex,
            summaryKey: selectedSummary.summaryKey,
            reason: 'archived_remote_memory_batch',
            errors,
        });
    } catch (error: any) {
        if (isAbortError_ACU(error)) {
            emitProgress_ACU(options.onProgress, {
                stage: 'aborted',
                message: '已终止远记忆归档，未提交新的归档结果。',
            });
            return buildCanceledResult_ACU({
                summaryKey: selectedSummary.summaryKey,
                messageIndex: targetMessageIndex,
            });
        }
        logWarn_ACU('[向量记忆] 远记忆归档失败，已跳过删除原纪要:', error);
        return buildResult_ACU({
            success: false,
            skipped: false,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            reason: 'remote_memory_archive_failed',
            errors: [normalizeText_ACU(error?.message) || '远记忆归档失败'],
        });
    }
}
