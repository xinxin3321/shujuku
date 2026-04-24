import {
    cloneIsolatedData_ACU,
    readIsolatedTagData_ACU,
    writeIsolatedTagData_ACU,
} from '../../data/repositories/chat-message-data-repo';
import type { ChatVectorRemoteMemoryBatch_ACU, ChatVectorState_ACU } from '../../data/models/chat-message-data';
import { getChatArray_ACU, saveChatToHost_ACU } from '../chat/chat-service';
import { getCurrentIsolationKey_ACU } from '../runtime/state-manager';
import { getCurrentVectorMemoryConfig_ACU } from './vector-memory-config';
import { assignVectorStateToTagData_ACU, replaceVectorRemoteMemoryBatches_ACU } from './vector-index-state-service';
import { getActiveRemoteMemorySnapshot_ACU } from './remote-memory-active-snapshot-service';
import { rebuildRemoteMemoryBatchSummary_ACU } from './remote-memory-build-service';
import { syncVectorMemoryLorebookEntryFromState_ACU } from '../worldbook/vector-memory-entry-service';
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

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function cloneBatches_ACU(batches: ChatVectorRemoteMemoryBatch_ACU[]): ChatVectorRemoteMemoryBatch_ACU[] {
    return Array.isArray(batches)
        ? JSON.parse(JSON.stringify(batches))
        : [];
}

export function getLatestRemoteMemorySnapshotView_ACU(): RemoteMemorySnapshotView_ACU | null {
    const snapshot = getActiveRemoteMemorySnapshot_ACU();
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

    const targetMessageIndex = snapshotView.messageIndex;
    if (targetMessageIndex < 0 || !chat[targetMessageIndex]) {
        return {
            saved: false,
            batches: cloneBatches_ACU(snapshotView.batches),
            errors: ['远记忆快照所在的 AI 楼层无效，无法保存。'],
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

    const vectorConfig = getCurrentVectorMemoryConfig_ACU();
    const nextBatch = await rebuildRemoteMemoryBatchSummary_ACU(
        {
            ...sourceBatches[targetBatchIndex],
            summaryText,
        },
        {
            embeddingEndpoint: vectorConfig.embeddingEndpoint,
            embeddingApiKey: vectorConfig.embeddingApiKey,
            embeddingModel: vectorConfig.embeddingModel,
            summaryChunkSentenceCount: vectorConfig.summaryChunkSentenceCount,
        },
    );

    sourceBatches[targetBatchIndex] = nextBatch;

    const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, targetMessageIndex);
    if (!snapshotAnchor?.anchor) {
        return {
            saved: false,
            batches: sourceBatches,
            errors: ['目标楼层缺少可用的远记忆快照锚点，无法保存远记忆。'],
        };
    }

    const snapshotMessageId = snapshotAnchor.anchor;
    const nextVectorState = replaceVectorRemoteMemoryBatches_ACU(snapshotView.vectorState, sourceBatches, {
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
    const syncResult = await syncVectorMemoryLorebookEntryFromState_ACU(nextVectorState.remoteMemoryBatches, vectorConfig);
    const errors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];

    return {
        saved: true,
        messageIndex: targetMessageIndex,
        batches: cloneBatches_ACU(nextVectorState.remoteMemoryBatches),
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

    const targetMessageIndex = snapshotView.messageIndex;
    if (targetMessageIndex < 0 || !chat[targetMessageIndex]) {
        return {
            deleted: false,
            batches: sourceBatches,
            errors: ['远记忆快照所在的 AI 楼层无效，无法删除。'],
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

    const nextBatches = sourceBatches.filter((batch) => normalizeText_ACU(batch?.batchId) !== batchId);
    const snapshotMessageId = snapshotAnchor.anchor;
    const nextVectorState = replaceVectorRemoteMemoryBatches_ACU(snapshotView.vectorState, nextBatches, {
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
    const vectorConfig = getCurrentVectorMemoryConfig_ACU();
    const syncResult = await syncVectorMemoryLorebookEntryFromState_ACU(nextVectorState.remoteMemoryBatches, vectorConfig);
    const errors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];

    return {
        deleted: true,
        messageIndex: targetMessageIndex,
        batches: cloneBatches_ACU(nextVectorState.remoteMemoryBatches),
        errors,
    };
}
