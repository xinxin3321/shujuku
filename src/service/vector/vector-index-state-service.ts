import type { ChatVectorRemoteMemoryBatch_ACU, ChatVectorRemoteMemoryChunk_ACU, ChatVectorState_ACU, IsolationTagData_ACU } from '../../data/models/chat-message-data';

function normalizeFiniteNumberArray_ACU(values: any): number[] {
    if (!Array.isArray(values)) return [];
    return values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
}

function normalizeChunk_ACU(chunk: any): ChatVectorRemoteMemoryChunk_ACU | null {
    const chunkId = String(chunk?.chunkId || '').trim();
    const text = String(chunk?.text || '').trim();
    const vector = normalizeFiniteNumberArray_ACU(chunk?.vector);
    const sequenceNumber = Number(chunk?.sequence);
    if (!chunkId || !text || vector.length === 0) {
        return null;
    }

    return {
        chunkId,
        text,
        vector,
        sequence: Number.isFinite(sequenceNumber) && sequenceNumber >= 0 ? Math.floor(sequenceNumber) : 0,
    };
}

function normalizeBatch_ACU(batch: any, fallbackSnapshotMessageId = ''): ChatVectorRemoteMemoryBatch_ACU | null {
    const batchId = String(batch?.batchId || '').trim();
    const snapshotMessageId = String(batch?.snapshotMessageId || fallbackSnapshotMessageId).trim() || fallbackSnapshotMessageId;
    const sourceMessageId = String(batch?.sourceMessageId || '').trim();
    const summaryText = String(batch?.summaryText || '').trim();
    const summaryHash = String(batch?.summaryHash || '').trim();
    const promptGroupVersion = String(batch?.promptGroupVersion || '').trim();
    const createdAt = String(batch?.createdAt || '').trim();
    const sourceRowKeys = Array.isArray(batch?.sourceRowKeys)
        ? batch.sourceRowKeys.map((value: any) => String(value || '').trim()).filter(Boolean)
        : [];
    const sourceRowCountNumber = Number(batch?.sourceRowCount);
    const chunks = Array.isArray(batch?.chunks)
        ? batch.chunks
            .map((chunk: any) => normalizeChunk_ACU(chunk))
            .filter((chunk: ChatVectorRemoteMemoryChunk_ACU | null): chunk is ChatVectorRemoteMemoryChunk_ACU => !!chunk)
        : [];

    if (!batchId || !snapshotMessageId || !sourceMessageId || !summaryText || !summaryHash || !promptGroupVersion || !createdAt || sourceRowKeys.length === 0 || chunks.length === 0) {
        return null;
    }

    const archivedRange = batch?.archivedRange && typeof batch.archivedRange === 'object'
        ? {
            firstRowKey: String(batch.archivedRange.firstRowKey || '').trim(),
            lastRowKey: String(batch.archivedRange.lastRowKey || '').trim(),
        }
        : undefined;

    return {
        batchId,
        snapshotMessageId,
        sourceMessageId,
        sourceRowKeys,
        sourceRowCount: Number.isFinite(sourceRowCountNumber) && sourceRowCountNumber > 0 ? Math.floor(sourceRowCountNumber) : sourceRowKeys.length,
        summaryText,
        summaryHash,
        chunks,
        promptGroupVersion,
        createdAt,
        archivedRange: archivedRange && archivedRange.firstRowKey && archivedRange.lastRowKey
            ? archivedRange
            : undefined,
    };
}

function cloneVectorState_ACU(state: ChatVectorState_ACU | null | undefined): ChatVectorState_ACU {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return {
            snapshotMessageId: '',
            remoteMemoryBatches: [],
        };
    }

    const snapshotMessageId = typeof state.snapshotMessageId === 'string' ? state.snapshotMessageId.trim() : '';
    return {
        snapshotMessageId,
        remoteMemoryBatches: Array.isArray(state.remoteMemoryBatches)
            ? state.remoteMemoryBatches
                .map((batch) => normalizeBatch_ACU(batch, snapshotMessageId))
                .filter((batch): batch is ChatVectorRemoteMemoryBatch_ACU => !!batch)
                .sort((a, b) => {
                    const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
                    const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
                    return timeA - timeB;
                })
            : [],
        lastIndexedAt: typeof state.lastIndexedAt === 'string' ? state.lastIndexedAt : undefined,
        lastArchiveAt: typeof state.lastArchiveAt === 'string' ? state.lastArchiveAt : undefined,
    };
}

export function getVectorStateFromTagData_ACU(tagData: IsolationTagData_ACU | null | undefined): ChatVectorState_ACU {
    return cloneVectorState_ACU(tagData?.vectorMemoryState);
}

export function assignVectorStateToTagData_ACU(
    tagData: IsolationTagData_ACU,
    state: ChatVectorState_ACU | null | undefined,
): IsolationTagData_ACU {
    tagData.vectorMemoryState = cloneVectorState_ACU(state);
    return tagData;
}

export function mergeVectorRemoteMemoryBatches_ACU(
    ...batchGroups: Array<ChatVectorRemoteMemoryBatch_ACU[] | null | undefined>
): ChatVectorRemoteMemoryBatch_ACU[] {
    const merged = new Map<string, ChatVectorRemoteMemoryBatch_ACU>();
    batchGroups.forEach((group) => {
        (Array.isArray(group) ? group : []).forEach((batch) => {
            const normalizedBatch = normalizeBatch_ACU(batch);
            if (!normalizedBatch?.batchId) {
                return;
            }
            merged.set(normalizedBatch.batchId, normalizedBatch);
        });
    });
    return Array.from(merged.values()).sort((a, b) => {
        const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
        const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
        return timeA - timeB;
    });
}

export function replaceVectorRemoteMemoryBatches_ACU(
    currentState: ChatVectorState_ACU | null | undefined,
    remoteMemoryBatches: ChatVectorRemoteMemoryBatch_ACU[],
    options: {
        snapshotMessageId?: string;
        indexedAt?: string;
        archivedAt?: string;
    } = {},
): ChatVectorState_ACU {
    const nextState = cloneVectorState_ACU(currentState);
    const snapshotMessageId = String(options.snapshotMessageId || '').trim() || nextState.snapshotMessageId;
    const normalizedBatches = mergeVectorRemoteMemoryBatches_ACU(
        (Array.isArray(remoteMemoryBatches) ? remoteMemoryBatches : [])
            .map((batch) => normalizeBatch_ACU(batch, snapshotMessageId))
            .filter((batch): batch is ChatVectorRemoteMemoryBatch_ACU => !!batch),
    );

    return {
        snapshotMessageId,
        remoteMemoryBatches: normalizedBatches,
        lastIndexedAt: String(options.indexedAt || '').trim() || nextState.lastIndexedAt,
        lastArchiveAt: String(options.archivedAt || '').trim() || nextState.lastArchiveAt,
    };
}
