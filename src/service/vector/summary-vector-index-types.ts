import type { IsolationTagData_ACU } from '../../data/models/chat-message-data';

export type SummaryVectorIndexBackend_ACU = 'embedded' | 'st-files';

export type SummaryVectorIndexManifestStatus_ACU =
    | 'building'
    | 'uploading'
    | 'ready'
    | 'missing'
    | 'corrupt'
    | 'incompatible'
    | 'upload_failed'
    | 'rebuild_required'
    | 'delete_pending'
    | 'delete_failed'
    | 'superseded';

export type SummaryVectorIndexExternalFileRole_ACU =
    | 'manifest'
    | 'row_index'
    | 'tombstone'
    | 'base_shard'
    | 'delta_shard'
    | 'registry';

export interface ChatSummaryVectorIndexChunk_ACU {
    chunkId: string;
    rowKey: string;
    text: string;
    vector: number[];
    sequence: number;
    shardId?: string;
    shardRole?: 'base' | 'delta';
}

export interface ChatSummaryVectorIndexRow_ACU {
    rowKey: string;
    rowId: string;
    rowOrder: number;
    timeSpan: string;
    location: string;
    summary: string;
    indexCode: string;
    vectorSourceText: string;
    chunkIds: string[];
    sourceFingerprint?: string;
    shardIds?: string[];
    status?: 'active' | 'removed' | 'replaced';
    updatedAt?: string;
}

export interface ChatSummaryVectorIndexState_ACU {
    version?: number;
    backend?: SummaryVectorIndexBackend_ACU;
    status?: SummaryVectorIndexManifestStatus_ACU;
    indexId?: string;
    snapshotMessageId: string;
    sourceTableKey: string;
    sourceTableName: string;
    indexedAt: string;
    rowCount: number;
    chunkCount: number;
    skippedRowCount: number;
    rows: ChatSummaryVectorIndexRow_ACU[];
    /**
     * 兼容旧版内嵌向量。新外置模式下聊天记录不应再写入该字段。
     */
    chunks?: ChatSummaryVectorIndexChunk_ACU[];
    manifest?: ChatSummaryVectorIndexManifest_ACU;
}

export interface SummaryVectorIndexExternalFileRef_ACU {
    role: SummaryVectorIndexExternalFileRole_ACU;
    path: string;
    shardId?: string;
    byteSize: number;
    checksum: string;
    chunkCount?: number;
    rowCount?: number;
    createdAt: string;
    updatedAt: string;
    status: SummaryVectorIndexManifestStatus_ACU;
}

export interface SummaryVectorIndexBatchRef_ACU {
    batchId: string;
    indexId: string;
    createdAt: string;
    updatedAt: string;
    rowKeys: string[];
    chunkIds: string[];
    files: SummaryVectorIndexExternalFileRef_ACU[];
    rowCount: number;
    chunkCount: number;
    sourceMessageIndex?: number;
    sourceSnapshotMessageId?: string;
    status: SummaryVectorIndexManifestStatus_ACU;
}

export interface SummaryVectorIndexSnapshotInfo_ACU {
    revision: number;
    mode: 'snapshot';
    parentIndexIds: string[];
    activeRowKeys: string[];
    activeChunkIds?: string[];
    removedRowKeys: string[];
    replacedRowKeys: string[];
    batchIds: string[];
}

export interface ChatSummaryVectorIndexManifest_ACU {
    version: number;
    backend: 'st-files';
    status: SummaryVectorIndexManifestStatus_ACU;
    indexId: string;
    chatKey: string;
    isolationKey: string;
    snapshotMessageId: string;
    sourceTableKey: string;
    sourceTableName: string;
    indexedAt: string;
    updatedAt: string;
    rowCount: number;
    chunkCount: number;
    skippedRowCount: number;
    embeddingModel: string;
    dimension: number;
    rowsFile: string;
    tombstoneFile: string;
    manifestFile: string;
    files: SummaryVectorIndexExternalFileRef_ACU[];
    baseShardCount: number;
    deltaShardCount: number;
    tombstoneRowCount: number;
    tombstoneChunkCount: number;
    externalTotalBytes: number;
    cacheTotalBytes?: number;
    lastCompactAt?: string;
    error?: string;
    /**
     * v2 快照协议：最新楼层 manifest 可引用多个批次文件，召回时按该列表拼接完整向量库。
     * 旧版 manifest 没有该字段，读取端必须回退到 files 中的 base_shard/delta_shard。
     */
    snapshot?: SummaryVectorIndexSnapshotInfo_ACU;
    batchRefs?: SummaryVectorIndexBatchRef_ACU[];
}

export interface SummaryVectorIndexRowIndexEntry_ACU {
    rowKey: string;
    rowId: string;
    rowOrder: number;
    summaryKey: string;
    sourceFingerprint: string;
    indexCode: string;
    chunkIds: string[];
    shardIds: string[];
    status: 'active' | 'removed' | 'replaced';
    updatedAt: string;
}

export interface SummaryVectorIndexRowIndex_ACU {
    version: number;
    indexId: string;
    updatedAt: string;
    rows: Record<string, SummaryVectorIndexRowIndexEntry_ACU>;
}

export interface SummaryVectorIndexTombstoneEntry_ACU {
    rowKey: string;
    chunkIds: string[];
    reason: 'row_deleted' | 'row_replaced' | 'index_deleted' | 'compact';
    removedAt: string;
}

export interface SummaryVectorIndexTombstone_ACU {
    version: number;
    indexId: string;
    updatedAt: string;
    removedRows: Record<string, SummaryVectorIndexTombstoneEntry_ACU>;
    removedChunks: Record<string, { rowKey: string; removedAt: string }>;
}

export interface SummaryVectorIndexShard_ACU {
    version: number;
    indexId: string;
    shardId: string;
    role: 'base' | 'delta';
    createdAt: string;
    updatedAt: string;
    chunks: ChatSummaryVectorIndexChunk_ACU[];
}

export interface SummaryVectorIndexRegistryFile_ACU {
    version: number;
    updatedAt: string;
    files: SummaryVectorIndexExternalFileRef_ACU[];
}

export interface SummaryVectorIndexSnapshotLayer_ACU {
    messageIndex: number;
    isolationKey: string;
    summaryVectorIndexState: ChatSummaryVectorIndexState_ACU | null;
    tagData: IsolationTagData_ACU | null;
}

export interface SummaryVectorIndexAggregatedSnapshot_ACU {
    summaryVectorIndexState: ChatSummaryVectorIndexState_ACU | null;
    layers: SummaryVectorIndexSnapshotLayer_ACU[];
    rowOwners: Map<string, { messageIndex: number; row: ChatSummaryVectorIndexRow_ACU }>;
}

export interface SummaryVectorIndexStats_ACU {
    status: SummaryVectorIndexManifestStatus_ACU | 'none';
    indexId: string;
    backend: SummaryVectorIndexBackend_ACU | 'none';
    rowCount: number;
    chunkCount: number;
    baseShardCount: number;
    deltaShardCount: number;
    tombstoneRowCount: number;
    tombstoneChunkCount: number;
    externalTotalBytes: number;
    cacheTotalBytes: number;
    updatedAt: string;
    error?: string;
}

export const SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU = 1;
export const SUMMARY_VECTOR_INDEX_REGISTRY_PATH_ACU = 'TavernDB_ACU_vector_registry';
