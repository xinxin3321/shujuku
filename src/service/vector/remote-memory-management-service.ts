import {
    cloneIsolatedData_ACU,
    readIsolatedTagData_ACU,
    writeIsolatedTagData_ACU,
    writeLegacyCompatData_ACU,
    writeMessageIdentity_ACU,
} from '../../data/repositories/chat-message-data-repo';
import type { ChatVectorRemoteMemoryBatch_ACU, ChatVectorState_ACU } from '../../data/models/chat-message-data';
import { getChatArray_ACU, saveChatToHost_ACU } from '../chat/chat-service';
import { getLatestAiMessageIndexFromChat_ACU } from '../table/table-history';
import { getCurrentIsolationKey_ACU, settings_ACU } from '../runtime/state-manager';
import { getCurrentVectorMemoryConfig_ACU } from './vector-memory-config';
import { assignVectorStateToTagData_ACU, replaceVectorRemoteMemoryBatches_ACU } from './vector-index-state-service';
import { assignSummaryVectorIndexStateToTagData_ACU, getAggregatedSummaryVectorIndexSnapshot_ACU } from './summary-vector-index-state-service';
import { getAggregatedRemoteMemorySnapshot_ACU, getRemoteMemoryLayers_ACU } from './remote-memory-active-snapshot-service';
import { rebuildRemoteMemoryBatchSummary_ACU } from './remote-memory-build-service';
import { syncVectorMemoryLorebookEntryFromState_ACU } from '../worldbook/vector-memory-entry-service';
import { getCurrentWorldbookConfig_ACU } from '../settings/settings-readers';
import {
    persistRemoteMemorySnapshotAnchorIfNeeded_ACU,
    resolveRemoteMemorySnapshotAnchor_ACU,
} from './remote-memory-snapshot-anchor';

export interface RemoteMemorySnapshotView_ACU {
    messageIndex: number;
    messageId: string;
    vectorState: ChatVectorState_ACU;
    batches: ChatVectorRemoteMemoryBatch_ACU[];
}

export interface SaveEditedRemoteMemoryBatchParams_ACU {
    batchId: string;
    summaryText: string;
}

export interface SaveEditedRemoteMemoryBatchResult_ACU {
    saved: boolean;
    messageIndex?: number;
    batches: ChatVectorRemoteMemoryBatch_ACU[];
    errors: string[];
}

export interface DeleteRemoteMemoryBatchParams_ACU {
    batchId: string;
}

export interface DeleteRemoteMemoryBatchResult_ACU {
    deleted: boolean;
    messageIndex?: number;
    batches: ChatVectorRemoteMemoryBatch_ACU[];
    errors: string[];
}

export interface DeleteAllArchivedVectorDataResult_ACU {
    deleted: boolean;
    mode: 'summary_vector_index' | 'remote_memory';
    messageIndex?: number;
    deletedCount: number;
    batches: ChatVectorRemoteMemoryBatch_ACU[];
    errors: string[];
}

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function cloneBatches_ACU(batches: ChatVectorRemoteMemoryBatch_ACU[]): ChatVectorRemoteMemoryBatch_ACU[] {
    return Array.isArray(batches)
        ? JSON.parse(JSON.stringify(batches))
        : [];
}

function buildBaseTagDataForArchiveWrite_ACU(existingTagData: any): any {
    return {
        independentData: existingTagData?.independentData || {},
        modifiedKeys: Array.isArray(existingTagData?.modifiedKeys) ? [...existingTagData.modifiedKeys] : [],
        updateGroupKeys: Array.isArray(existingTagData?.updateGroupKeys) ? [...existingTagData.updateGroupKeys] : [],
        ...(existingTagData?.vectorMemoryState ? { vectorMemoryState: existingTagData.vectorMemoryState } : {}),
        ...(existingTagData?.summaryVectorIndexState ? { summaryVectorIndexState: existingTagData.summaryVectorIndexState } : {}),
        ...(existingTagData?._acu_base_state ? { _acu_base_state: existingTagData._acu_base_state } : {}),
    } as any;
}

function resolveLatestAiMessageForArchiveWrite_ACU(): { chat: any[]; messageIndex: number; message: any } | null {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) return null;
    const messageIndex = getLatestAiMessageIndexFromChat_ACU(chat);
    if (messageIndex < 0 || !chat[messageIndex] || chat[messageIndex].is_user) return null;
    return { chat, messageIndex, message: chat[messageIndex] };
}

export function getLatestRemoteMemorySnapshotView_ACU(): RemoteMemorySnapshotView_ACU | null {
    const snapshot = getAggregatedRemoteMemorySnapshot_ACU();
    if (!snapshot) {
        return null;
    }

    const chat = getChatArray_ACU();
    const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, snapshot.messageIndex);
    return {
        messageIndex: snapshot.messageIndex,
        messageId: snapshotAnchor?.anchor || normalizeText_ACU(snapshot.message?.message_id),
        vectorState: snapshot.vectorState,
        batches: cloneBatches_ACU(snapshot.vectorState.remoteMemoryBatches),
    };
}

export async function saveEditedRemoteMemoryBatch_ACU(
    params: SaveEditedRemoteMemoryBatchParams_ACU,
): Promise<SaveEditedRemoteMemoryBatchResult_ACU> {
    const batchId = normalizeText_ACU(params?.batchId);
    const summaryText = normalizeText_ACU(params?.summaryText);

    if (!batchId) {
        return {
            saved: false,
            batches: [],
            errors: ['缺少远记忆批次 batchId。'],
        };
    }

    if (!summaryText) {
        return {
            saved: false,
            batches: [],
            errors: ['远记忆总结内容不能为空。'],
        };
    }

    const snapshotView = getLatestRemoteMemorySnapshotView_ACU();
    if (!snapshotView) {
        return {
            saved: false,
            batches: [],
            errors: ['当前聊天暂无可编辑的远记忆快照。'],
        };
    }

    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) {
        return {
            saved: false,
            batches: cloneBatches_ACU(snapshotView.batches),
            errors: ['当前聊天记录为空，无法保存远记忆。'],
        };
    }

    const aggregatedSnapshot = getAggregatedRemoteMemorySnapshot_ACU();
    const batchOwner = aggregatedSnapshot?.batchOwners.get(batchId);
    const targetMessageIndex = batchOwner?.messageIndex ?? -1;
    if (targetMessageIndex < 0 || !chat[targetMessageIndex]) {
        return {
            saved: false,
            batches: cloneBatches_ACU(snapshotView.batches),
            errors: ['远记忆批次所在的 AI 楼层无效，无法保存。'],
        };
    }

    const targetMessage = chat[targetMessageIndex];
    if (!targetMessage || targetMessage.is_user) {
        return {
            saved: false,
            batches: cloneBatches_ACU(snapshotView.batches),
            errors: ['远记忆快照所在楼层不是可写入的 AI 消息。'],
        };
    }

    const sourceBatches = cloneBatches_ACU(snapshotView.batches);
    const targetBatchIndex = sourceBatches.findIndex((batch) => normalizeText_ACU(batch?.batchId) === batchId);
    if (targetBatchIndex < 0) {
        return {
            saved: false,
            batches: sourceBatches,
            errors: ['未找到指定的远记忆批次，可能已被更新。'],
        };
    }

    const ownerTagData = readIsolatedTagData_ACU(targetMessage, getCurrentIsolationKey_ACU());
    const ownerBatches = cloneBatches_ACU(ownerTagData?.vectorMemoryState?.remoteMemoryBatches || []);
    const ownerBatchIndex = ownerBatches.findIndex((batch) => normalizeText_ACU(batch?.batchId) === batchId);
    if (ownerBatchIndex < 0) {
        return {
            saved: false,
            batches: sourceBatches,
            errors: ['未在批次原始楼层找到指定远记忆，无法保存。'],
        };
    }

    const vectorConfig = getCurrentVectorMemoryConfig_ACU();
    const nextBatch = await rebuildRemoteMemoryBatchSummary_ACU(
        {
            ...ownerBatches[ownerBatchIndex],
            summaryText,
        },
        {
            embeddingEndpoint: vectorConfig.embeddingEndpoint,
            embeddingApiKey: vectorConfig.embeddingApiKey,
            embeddingModel: vectorConfig.embeddingModel,
            summaryChunkSentenceCount: vectorConfig.summaryChunkSentenceCount,
        },
    );

    ownerBatches[ownerBatchIndex] = nextBatch;

    const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, targetMessageIndex);
    if (!snapshotAnchor?.anchor) {
        return {
            saved: false,
            batches: sourceBatches,
            errors: ['目标楼层缺少可用的远记忆快照锚点，无法保存远记忆。'],
        };
    }

    const snapshotMessageId = snapshotAnchor.anchor;
    const nextVectorState = replaceVectorRemoteMemoryBatches_ACU(ownerTagData?.vectorMemoryState, ownerBatches, {
        snapshotMessageId,
        indexedAt: new Date().toISOString(),
    });

    const isolationKey = getCurrentIsolationKey_ACU();
    const existingTagData = readIsolatedTagData_ACU(targetMessage, isolationKey) || {
        independentData: {},
        modifiedKeys: [],
        updateGroupKeys: [],
    };
    const nextIsolatedData = cloneIsolatedData_ACU(targetMessage);
    const nextTagData = {
        independentData: existingTagData.independentData || {},
        modifiedKeys: Array.isArray(existingTagData.modifiedKeys) ? [...existingTagData.modifiedKeys] : [],
        updateGroupKeys: Array.isArray(existingTagData.updateGroupKeys) ? [...existingTagData.updateGroupKeys] : [],
        ...(existingTagData._acu_base_state ? { _acu_base_state: existingTagData._acu_base_state } : {}),
    } as any;

    assignVectorStateToTagData_ACU(nextTagData, nextVectorState);
    nextIsolatedData[isolationKey] = nextTagData;
    targetMessage.TavernDB_ACU_IsolatedData = nextIsolatedData;
    writeIsolatedTagData_ACU(targetMessage, isolationKey, nextTagData);
    persistRemoteMemorySnapshotAnchorIfNeeded_ACU(targetMessage, snapshotAnchor);

    await saveChatToHost_ACU();
    const aggregatedAfterSave = getAggregatedRemoteMemorySnapshot_ACU();
    const allBatches = Array.isArray(aggregatedAfterSave?.vectorState?.remoteMemoryBatches)
        ? aggregatedAfterSave.vectorState.remoteMemoryBatches
        : nextVectorState.remoteMemoryBatches;
    const syncResult = await syncVectorMemoryLorebookEntryFromState_ACU(allBatches, vectorConfig);
    const errors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];

    return {
        saved: true,
        messageIndex: targetMessageIndex,
        batches: cloneBatches_ACU(allBatches),
        errors,
    };
}

export async function deleteRemoteMemoryBatch_ACU(
    params: DeleteRemoteMemoryBatchParams_ACU,
): Promise<DeleteRemoteMemoryBatchResult_ACU> {
    const batchId = normalizeText_ACU(params?.batchId);
    if (!batchId) {
        return {
            deleted: false,
            batches: [],
            errors: ['缺少远记忆批次 batchId。'],
        };
    }

    const snapshotView = getLatestRemoteMemorySnapshotView_ACU();
    if (!snapshotView) {
        return {
            deleted: false,
            batches: [],
            errors: ['当前聊天暂无可删除的远记忆快照。'],
        };
    }

    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) {
        return {
            deleted: false,
            batches: cloneBatches_ACU(snapshotView.batches),
            errors: ['当前聊天记录为空，无法删除远记忆。'],
        };
    }

    const sourceBatches = cloneBatches_ACU(snapshotView.batches);
    const targetBatchIndex = sourceBatches.findIndex((batch) => normalizeText_ACU(batch?.batchId) === batchId);
    if (targetBatchIndex < 0) {
        return {
            deleted: false,
            batches: sourceBatches,
            errors: ['未找到指定的远记忆批次，可能已被更新。'],
        };
    }

    const aggregatedSnapshot = getAggregatedRemoteMemorySnapshot_ACU();
    const batchOwner = aggregatedSnapshot?.batchOwners.get(batchId);
    const targetMessageIndex = batchOwner?.messageIndex ?? -1;
    if (targetMessageIndex < 0 || !chat[targetMessageIndex]) {
        return {
            deleted: false,
            batches: sourceBatches,
            errors: ['远记忆批次所在的 AI 楼层无效，无法删除。'],
        };
    }

    const targetMessage = chat[targetMessageIndex];
    if (!targetMessage || targetMessage.is_user) {
        return {
            deleted: false,
            batches: sourceBatches,
            errors: ['远记忆快照所在楼层不是可写入的 AI 消息。'],
        };
    }

    const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, targetMessageIndex);
    if (!snapshotAnchor?.anchor) {
        return {
            deleted: false,
            batches: sourceBatches,
            errors: ['目标楼层缺少可用的远记忆快照锚点，无法删除远记忆。'],
        };
    }

    const isolationKey = getCurrentIsolationKey_ACU();
    const ownerTagData = readIsolatedTagData_ACU(targetMessage, isolationKey);
    const ownerBatches = cloneBatches_ACU(ownerTagData?.vectorMemoryState?.remoteMemoryBatches || []);
    const nextBatches = ownerBatches.filter((batch) => normalizeText_ACU(batch?.batchId) !== batchId);
    if (nextBatches.length === ownerBatches.length) {
        return {
            deleted: false,
            batches: sourceBatches,
            errors: ['未在批次原始楼层找到指定远记忆，无法删除。'],
        };
    }
    const snapshotMessageId = snapshotAnchor.anchor;
    const nextVectorState = replaceVectorRemoteMemoryBatches_ACU(ownerTagData?.vectorMemoryState, nextBatches, {
        snapshotMessageId,
        indexedAt: new Date().toISOString(),
    });

    const existingTagData = readIsolatedTagData_ACU(targetMessage, isolationKey) || {
        independentData: {},
        modifiedKeys: [],
        updateGroupKeys: [],
    };
    const nextIsolatedData = cloneIsolatedData_ACU(targetMessage);
    const nextTagData = {
        independentData: existingTagData.independentData || {},
        modifiedKeys: Array.isArray(existingTagData.modifiedKeys) ? [...existingTagData.modifiedKeys] : [],
        updateGroupKeys: Array.isArray(existingTagData.updateGroupKeys) ? [...existingTagData.updateGroupKeys] : [],
        ...(existingTagData._acu_base_state ? { _acu_base_state: existingTagData._acu_base_state } : {}),
    } as any;

    assignVectorStateToTagData_ACU(nextTagData, nextVectorState);
    nextIsolatedData[isolationKey] = nextTagData;
    targetMessage.TavernDB_ACU_IsolatedData = nextIsolatedData;
    writeIsolatedTagData_ACU(targetMessage, isolationKey, nextTagData);
    persistRemoteMemorySnapshotAnchorIfNeeded_ACU(targetMessage, snapshotAnchor);

    await saveChatToHost_ACU();
    const vectorConfig = getCurrentVectorMemoryConfig_ACU();
    const aggregatedAfterDelete = getAggregatedRemoteMemorySnapshot_ACU();
    const allBatches = Array.isArray(aggregatedAfterDelete?.vectorState?.remoteMemoryBatches)
        ? aggregatedAfterDelete.vectorState.remoteMemoryBatches
        : nextVectorState.remoteMemoryBatches;
    const syncResult = await syncVectorMemoryLorebookEntryFromState_ACU(allBatches, vectorConfig);
    const errors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];

    return {
        deleted: true,
        messageIndex: targetMessageIndex,
        batches: cloneBatches_ACU(allBatches),
        errors,
    };
}

async function deleteAllSummaryVectorIndexData_ACU(): Promise<DeleteAllArchivedVectorDataResult_ACU> {
    const snapshot = getAggregatedSummaryVectorIndexSnapshot_ACU();
    if (!snapshot?.summaryVectorIndexState || snapshot.layers.length === 0) {
        return {
            deleted: false,
            mode: 'summary_vector_index',
            deletedCount: 0,
            batches: [],
            errors: ['当前聊天暂无可删除的纪要向量索引归档。'],
        };
    }

    const isolationKey = getCurrentIsolationKey_ACU();
    for (const layer of snapshot.layers) {
        const existingTagData = readIsolatedTagData_ACU(layer.message, isolationKey) || {
            independentData: {},
            modifiedKeys: [],
            updateGroupKeys: [],
        };
        const nextIsolatedData = cloneIsolatedData_ACU(layer.message);
        const nextTagData = buildBaseTagDataForArchiveWrite_ACU(existingTagData);
        assignSummaryVectorIndexStateToTagData_ACU(nextTagData, null);
        nextIsolatedData[isolationKey] = nextTagData;
        layer.message.TavernDB_ACU_IsolatedData = nextIsolatedData;
        writeIsolatedTagData_ACU(layer.message, isolationKey, nextTagData);
        writeMessageIdentity_ACU(layer.message, {
            enabled: settings_ACU.dataIsolationEnabled,
            code: settings_ACU.dataIsolationCode,
        });
        writeLegacyCompatData_ACU(
            layer.message,
            nextTagData.independentData || {},
            nextTagData.modifiedKeys || [],
            nextTagData.updateGroupKeys || [],
        );
    }
    await saveChatToHost_ACU();

    return {
        deleted: true,
        mode: 'summary_vector_index',
        messageIndex: snapshot.messageIndex,
        deletedCount: snapshot.summaryVectorIndexState.rowCount || 0,
        batches: [],
        errors: [],
    };
}

async function deleteAllRemoteMemoryData_ACU(): Promise<DeleteAllArchivedVectorDataResult_ACU> {
    const snapshotView = getLatestRemoteMemorySnapshotView_ACU();
    if (!snapshotView || snapshotView.batches.length === 0) {
        return {
            deleted: false,
            mode: 'remote_memory',
            deletedCount: 0,
            batches: [],
            errors: ['当前聊天暂无可删除的远记忆归档。'],
        };
    }

    const chat = getChatArray_ACU();
    const layers = getRemoteMemoryLayers_ACU();
    const isolationKey = getCurrentIsolationKey_ACU();
    const indexedAt = new Date().toISOString();
    for (const layer of layers) {
        const targetMessage = Array.isArray(chat) ? chat[layer.messageIndex] : null;
        if (!targetMessage || targetMessage.is_user) continue;
        const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, layer.messageIndex);
        if (!snapshotAnchor?.anchor) continue;
        const nextVectorState = replaceVectorRemoteMemoryBatches_ACU(layer.vectorState, [], {
            snapshotMessageId: snapshotAnchor.anchor,
            indexedAt,
        });
        const existingTagData = readIsolatedTagData_ACU(targetMessage, isolationKey) || {
            independentData: {},
            modifiedKeys: [],
            updateGroupKeys: [],
        };
        const nextIsolatedData = cloneIsolatedData_ACU(targetMessage);
        const nextTagData = buildBaseTagDataForArchiveWrite_ACU(existingTagData);
        assignVectorStateToTagData_ACU(nextTagData, nextVectorState);
        nextIsolatedData[isolationKey] = nextTagData;
        targetMessage.TavernDB_ACU_IsolatedData = nextIsolatedData;
        writeIsolatedTagData_ACU(targetMessage, isolationKey, nextTagData);
        persistRemoteMemorySnapshotAnchorIfNeeded_ACU(targetMessage, snapshotAnchor);
    }
    await saveChatToHost_ACU();

    const vectorConfig = getCurrentVectorMemoryConfig_ACU();
    const syncResult = await syncVectorMemoryLorebookEntryFromState_ACU([], vectorConfig);
    const errors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];
    return {
        deleted: true,
        mode: 'remote_memory',
        messageIndex: snapshotView.messageIndex,
        deletedCount: snapshotView.batches.length,
        batches: [],
        errors,
    };
}

export async function deleteAllArchivedVectorData_ACU(): Promise<DeleteAllArchivedVectorDataResult_ACU> {
    const summaryVectorIndexModeEnabled = getCurrentWorldbookConfig_ACU()?.summaryVectorIndexModeEnabled === true;
    return summaryVectorIndexModeEnabled
        ? deleteAllSummaryVectorIndexData_ACU()
        : deleteAllRemoteMemoryData_ACU();
}
