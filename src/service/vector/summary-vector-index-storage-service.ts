import { getCurrentIsolationKey_ACU, currentChatFileIdentifier_ACU } from '../runtime/state-manager';
import { hashUserInput_ACU, logDebug_ACU, logWarn_ACU } from '../../shared/utils';
import {
    buildVectorIndexFileName_ACU,
    buildVectorIndexStableDirectory_ACU,
    buildVectorIndexStableFilePath_ACU,
    deleteRegisteredVectorIndexFilesWhere_ACU,
    deleteVectorIndexFile_ACU,
    readVectorIndexJsonFile_ACU,
    registerVectorIndexFiles_ACU,
    sha256Text_ACU,
    unregisterVectorIndexFiles_ACU,
    uploadVectorIndexJsonFile_ACU,
} from '../../data/storage/vector-index-st-files-storage';
import {
    deleteVectorIndexCacheByIndex_ACU,
    estimateVectorIndexTempCache_ACU,
    getVectorIndexCachedShard_ACU,
    putVectorIndexCachedShard_ACU,
} from '../../data/storage/vector-index-temp-cache';
import type {
    ChatSummaryVectorIndexChunk_ACU,
    ChatSummaryVectorIndexManifest_ACU,
    ChatSummaryVectorIndexRow_ACU,
    ChatSummaryVectorIndexState_ACU,
    SummaryVectorIndexBatchRef_ACU,
    SummaryVectorIndexExternalFileRef_ACU,
    SummaryVectorIndexRowIndex_ACU,
    SummaryVectorIndexRowIndexEntry_ACU,
    SummaryVectorIndexShard_ACU,
    SummaryVectorIndexStats_ACU,
    SummaryVectorIndexTombstone_ACU,
} from './summary-vector-index-types';
import { SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU } from './summary-vector-index-types';

const DEFAULT_SHARD_CHUNK_LIMIT_ACU = 128;

export interface PersistSummaryVectorIndexExternalOptions_ACU {
    chatKey?: string;
    isolationKey?: string;
    previousManifest?: ChatSummaryVectorIndexManifest_ACU | null;
    rows: ChatSummaryVectorIndexRow_ACU[];
    chunks: ChatSummaryVectorIndexChunk_ACU[];
    snapshotMessageId: string;
    sourceTableKey: string;
    sourceTableName: string;
    indexedAt: string;
    skippedRowCount: number;
    embeddingModel: string;
    shardChunkLimit?: number;
}

export interface PersistSummaryVectorIndexSnapshotOptions_ACU extends PersistSummaryVectorIndexExternalOptions_ACU {
    activeRowKeys?: string[];
    activeChunkIds?: string[];
    removedRowKeys?: string[];
    replacedRowKeys?: string[];
    parentIndexIds?: string[];
    snapshotRevision?: number;
    sourceMessageIndex?: number;
}

export interface PersistSummaryVectorIndexExternalResult_ACU {
    state: ChatSummaryVectorIndexState_ACU;
    manifest: ChatSummaryVectorIndexManifest_ACU;
    uploadedFiles: SummaryVectorIndexExternalFileRef_ACU[];
}

function normalizeChatKey_ACU(chatKey?: string): string {
    const raw = String(chatKey || currentChatFileIdentifier_ACU || 'current-chat').trim();
    return raw || 'current-chat';
}

function normalizeVectorFileNamePart_ACU(value: string): string {
    return String(value || 'default')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 96) || 'default';
}

function buildVectorIndexScopePrefix_ACU(chatKey: string, isolationKey: string): string {
    return `TavernDB_ACU_vector_${normalizeVectorFileNamePart_ACU(chatKey)}_${normalizeVectorFileNamePart_ACU(isolationKey || 'default')}_`;
}

function buildVectorIndexStableScopePrefix_ACU(chatKey: string, isolationKey: string, sourceTableKey: string): string {
    return `${buildVectorIndexStableDirectory_ACU({ chatKey, isolationKey, sourceTableKey })}_`;
}

function buildLegacyVectorIndexStableScopePrefix_ACU(chatKey: string, isolationKey: string, sourceTableKey: string): string {
    return [
        'TavernDB_ACU_vector',
        normalizeVectorFileNamePart_ACU(chatKey),
        normalizeVectorFileNamePart_ACU(isolationKey || 'default'),
        normalizeVectorFileNamePart_ACU(sourceTableKey || 'summary'),
    ].join('/');
}

function buildIndexId_ACU(params: { chatKey: string; isolationKey: string; sourceTableKey: string; snapshotMessageId: string; indexedAt: string }): string {
    return `idx_${hashUserInput_ACU(`${params.chatKey}\n${params.isolationKey}\n${params.sourceTableKey}\n${params.snapshotMessageId}\n${params.indexedAt}`)}`;
}

function buildStableSnapshotIndexId_ACU(params: { chatKey: string; isolationKey: string; sourceTableKey: string }): string {
    return `stable_${hashUserInput_ACU(`${params.chatKey}\n${params.isolationKey}\n${params.sourceTableKey}`)}`;
}

function normalizeRows_ACU(rows: ChatSummaryVectorIndexRow_ACU[]): ChatSummaryVectorIndexRow_ACU[] {
    return (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.rowKey && Array.isArray(row.chunkIds) && row.chunkIds.length > 0)
        .map((row): ChatSummaryVectorIndexRow_ACU => {
            const status: ChatSummaryVectorIndexRow_ACU['status'] = row.status === 'removed' || row.status === 'replaced'
                ? row.status
                : 'active';
            return {
                ...row,
                chunkIds: row.chunkIds.filter(Boolean),
                status,
                updatedAt: row.updatedAt || new Date().toISOString(),
            };
        })
        .sort((left, right) => left.rowOrder - right.rowOrder || left.rowKey.localeCompare(right.rowKey));
}

function normalizeChunks_ACU(chunks: ChatSummaryVectorIndexChunk_ACU[]): ChatSummaryVectorIndexChunk_ACU[] {
    return (Array.isArray(chunks) ? chunks : [])
        .filter((chunk) => chunk?.chunkId && chunk?.rowKey && chunk?.text && Array.isArray(chunk.vector) && chunk.vector.length > 0)
        .map((chunk, index) => ({ ...chunk, sequence: index }));
}

function chunkArray_ACU<T>(items: T[], limit: number): T[][] {
    const size = Math.max(1, Math.floor(Number(limit) || DEFAULT_SHARD_CHUNK_LIMIT_ACU));
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function buildRowIndex_ACU(indexId: string, rows: ChatSummaryVectorIndexRow_ACU[], shardIdsByChunkId: Map<string, string>, updatedAt: string): SummaryVectorIndexRowIndex_ACU {
    const entries: Record<string, SummaryVectorIndexRowIndexEntry_ACU> = {};
    rows.forEach((row) => {
        const shardIds = Array.from(new Set(row.chunkIds.map((chunkId) => shardIdsByChunkId.get(chunkId)).filter((value): value is string => !!value)));
        entries[row.rowKey] = {
            rowKey: row.rowKey,
            rowId: row.rowId,
            rowOrder: row.rowOrder,
            summaryKey: row.rowKey,
            sourceFingerprint: row.sourceFingerprint || hashUserInput_ACU([row.rowId, row.rowOrder, row.timeSpan, row.location, row.summary, row.indexCode, row.vectorSourceText].join('\n')),
            indexCode: row.indexCode,
            chunkIds: [...row.chunkIds],
            shardIds,
            status: row.status === 'removed' || row.status === 'replaced' ? row.status : 'active',
            updatedAt,
        };
    });
    return { version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU, indexId, updatedAt, rows: entries };
}

function buildTombstone_ACU(indexId: string, previousManifest: ChatSummaryVectorIndexManifest_ACU | null | undefined, updatedAt: string): SummaryVectorIndexTombstone_ACU {
    return {
        version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
        indexId,
        updatedAt,
        removedRows: {},
        removedChunks: {},
        ...(previousManifest?.indexId ? { previousIndexId: previousManifest.indexId } as any : {}),
    };
}

async function cleanupPreviousManifest_ACU(previousManifest: ChatSummaryVectorIndexManifest_ACU | null | undefined): Promise<void> {
    if (!previousManifest?.files?.length) return;
    const paths = previousManifest.files.map((file) => file.path).filter(Boolean);
    for (const path of paths) {
        const result = await deleteVectorIndexFile_ACU(path);
        if (!result.ok) {
            logWarn_ACU('[交火向量索引] 清理旧外置文件失败:', path, result.error);
        }
    }
    await unregisterVectorIndexFiles_ACU(paths);
    await deleteVectorIndexCacheByIndex_ACU(previousManifest.indexId);
}

function collectManifestFilePaths_ACU(manifest: ChatSummaryVectorIndexManifest_ACU | null | undefined): Set<string> {
    const paths = new Set<string>();
    const addPath = (path: any): void => {
        const normalizedPath = String(path || '').trim();
        if (normalizedPath) paths.add(normalizedPath);
    };
    const addFile = (file: SummaryVectorIndexExternalFileRef_ACU | null | undefined): void => {
        addPath(file?.path);
    };
    addPath(manifest?.manifestFile);
    addPath(manifest?.rowsFile);
    addPath(manifest?.tombstoneFile);
    (manifest?.files || []).forEach(addFile);
    (manifest?.batchRefs || []).forEach((batch) => (batch.files || []).forEach(addFile));
    return paths;
}

async function cleanupManifestFilesExcept_ACU(
    previousManifest: ChatSummaryVectorIndexManifest_ACU | null | undefined,
    retainedPaths: Set<string>,
): Promise<void> {
    const previousPaths = collectManifestFilePaths_ACU(previousManifest);
    if (previousPaths.size === 0) return;
    const removablePaths = Array.from(previousPaths).filter((path) => path && !retainedPaths.has(path));
    const deletedPaths: string[] = [];
    for (const path of removablePaths) {
        const result = await deleteVectorIndexFile_ACU(path);
        if (result.ok) {
            deletedPaths.push(result.path || path);
        } else {
            logWarn_ACU('[交火向量索引] 清理未复用外置文件失败:', path, result.error);
        }
    }
    await unregisterVectorIndexFiles_ACU(deletedPaths);
    if (previousManifest.indexId && !Array.from(retainedPaths).some((path) => path.includes(previousManifest.indexId))) {
        await deleteVectorIndexCacheByIndex_ACU(previousManifest.indexId);
    }
}

function isSameChatIsolationSourceTableVectorFile_ACU(path: string, manifest: ChatSummaryVectorIndexManifest_ACU): boolean {
    const normalizedPath = String(path || '');
    if (!normalizedPath.startsWith('TavernDB_ACU_vector_')) return false;
    const chatPart = normalizeVectorFileNamePart_ACU(manifest.chatKey || 'current-chat');
    const isolationPart = normalizeVectorFileNamePart_ACU(manifest.isolationKey || 'default');
    const sourceTablePart = normalizeVectorFileNamePart_ACU(manifest.sourceTableKey || 'summary');
    return normalizedPath.startsWith(`TavernDB_ACU_vector_${chatPart}_${isolationPart}_${sourceTablePart}_`);
}

async function cleanupSnapshotScopeFilesExcept_ACU(
    manifest: ChatSummaryVectorIndexManifest_ACU,
    retainedPaths: Set<string>,
    options: { includeSameSourceTableFallback?: boolean } = {},
): Promise<void> {
    const legacyScopePrefix = buildVectorIndexScopePrefix_ACU(manifest.chatKey, manifest.isolationKey);
    const stableScopePrefix = buildVectorIndexStableScopePrefix_ACU(manifest.chatKey, manifest.isolationKey, manifest.sourceTableKey);
    const legacyStableScopePrefix = buildLegacyVectorIndexStableScopePrefix_ACU(manifest.chatKey, manifest.isolationKey, manifest.sourceTableKey);
    const removedPaths = await deleteRegisteredVectorIndexFilesWhere_ACU((file) => {
        const path = String(file?.path || '');
        const inSameScope = path.startsWith(legacyScopePrefix)
            || path.startsWith(stableScopePrefix)
            || path.startsWith(legacyStableScopePrefix)
            || (options.includeSameSourceTableFallback === true && isSameChatIsolationSourceTableVectorFile_ACU(path, manifest));
        return inSameScope && !retainedPaths.has(path);
    });
    if (removedPaths.length > 0) {
        logDebug_ACU(`[交火向量索引] 已清理最新快照未引用的同作用域外置文件: count=${removedPaths.length}`);
    }
}

export async function deleteSummaryVectorIndexExternalByScope_ACU(options: {
    chatKey?: string;
    isolationKey?: string;
    sourceTableKey?: string;
} = {}): Promise<string[]> {
    const chatKey = normalizeChatKey_ACU(options.chatKey);
    const isolationKey = options.isolationKey || getCurrentIsolationKey_ACU();
    const sourceTableKey = options.sourceTableKey || 'summary';
    const legacyScopePrefix = buildVectorIndexScopePrefix_ACU(chatKey, isolationKey);
    const stableScopePrefix = buildVectorIndexStableScopePrefix_ACU(chatKey, isolationKey, sourceTableKey);
    const legacyStableScopePrefix = buildLegacyVectorIndexStableScopePrefix_ACU(chatKey, isolationKey, sourceTableKey);
    const chatPart = normalizeVectorFileNamePart_ACU(chatKey || 'current-chat');
    const isolationPart = normalizeVectorFileNamePart_ACU(isolationKey || 'default');
    const sourceTablePart = normalizeVectorFileNamePart_ACU(sourceTableKey || 'summary');
    const strictFlatScopePrefix = `TavernDB_ACU_vector_${chatPart}_${isolationPart}_${sourceTablePart}_`;
    const removedPaths = await deleteRegisteredVectorIndexFilesWhere_ACU((file) => {
        const path = String(file?.path || '');
        if (!path.startsWith('TavernDB_ACU_vector_')) return false;
        return path.startsWith(legacyScopePrefix)
            || path.startsWith(stableScopePrefix)
            || path.startsWith(legacyStableScopePrefix)
            || path.startsWith(strictFlatScopePrefix);
    });
    if (removedPaths.length > 0) {
        logDebug_ACU(`[交火向量索引] 已按当前作用域清理外置文件: count=${removedPaths.length}`);
    }
    return removedPaths;
}

function buildBatchRef_ACU(params: {
    batchId: string;
    indexId: string;
    createdAt: string;
    updatedAt: string;
    rows: ChatSummaryVectorIndexRow_ACU[];
    chunks: ChatSummaryVectorIndexChunk_ACU[];
    files: SummaryVectorIndexExternalFileRef_ACU[];
    sourceMessageIndex?: number;
    sourceSnapshotMessageId?: string;
}): SummaryVectorIndexBatchRef_ACU {
    return {
        batchId: params.batchId,
        indexId: params.indexId,
        createdAt: params.createdAt,
        updatedAt: params.updatedAt,
        rowKeys: Array.from(new Set(params.rows.map((row) => row.rowKey).filter(Boolean))),
        chunkIds: Array.from(new Set(params.chunks.map((chunk) => chunk.chunkId).filter(Boolean))),
        files: [...params.files],
        rowCount: params.rows.length,
        chunkCount: params.chunks.length,
        sourceMessageIndex: params.sourceMessageIndex,
        sourceSnapshotMessageId: params.sourceSnapshotMessageId,
        status: 'ready',
    };
}

async function rollbackUploadedFiles_ACU(files: SummaryVectorIndexExternalFileRef_ACU[]): Promise<void> {
    const paths = files.map((file) => file.path).filter(Boolean);
    for (const path of paths) {
        await deleteVectorIndexFile_ACU(path);
    }
    await unregisterVectorIndexFiles_ACU(paths);
}

export async function persistSummaryVectorIndexExternal_ACU(
    options: PersistSummaryVectorIndexExternalOptions_ACU,
): Promise<PersistSummaryVectorIndexExternalResult_ACU> {
    const chatKey = normalizeChatKey_ACU(options.chatKey);
    const isolationKey = options.isolationKey || getCurrentIsolationKey_ACU();
    const indexedAt = options.indexedAt || new Date().toISOString();
    const indexId = buildIndexId_ACU({ chatKey, isolationKey, sourceTableKey: options.sourceTableKey, snapshotMessageId: options.snapshotMessageId, indexedAt });
    const rows = normalizeRows_ACU(options.rows);
    const chunks = normalizeChunks_ACU(options.chunks);
    if (rows.length === 0 || chunks.length === 0) {
        throw new Error('交火向量索引为空，拒绝写入外置文件。');
    }
    const dimension = chunks[0]?.vector?.length || 0;
    if (dimension <= 0) {
        throw new Error('交火向量索引缺少有效向量维度。');
    }
    const uploadedFiles: SummaryVectorIndexExternalFileRef_ACU[] = [];
    try {
        const shardIdsByChunkId = new Map<string, string>();
        const shardRefs: SummaryVectorIndexExternalFileRef_ACU[] = [];
        const shardGroups = chunkArray_ACU(chunks, options.shardChunkLimit || DEFAULT_SHARD_CHUNK_LIMIT_ACU);
        for (let shardIndex = 0; shardIndex < shardGroups.length; shardIndex += 1) {
            const shardId = `base_${String(shardIndex + 1).padStart(4, '0')}`;
            const shardChunks = shardGroups[shardIndex].map((chunk) => ({ ...chunk, shardId, shardRole: 'base' as const }));
            shardChunks.forEach((chunk) => shardIdsByChunkId.set(chunk.chunkId, shardId));
            const shard: SummaryVectorIndexShard_ACU = {
                version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
                indexId,
                shardId,
                role: 'base',
                createdAt: indexedAt,
                updatedAt: indexedAt,
                chunks: shardChunks,
            };
            const path = buildVectorIndexFileName_ACU({ chatKey, isolationKey, indexId, role: 'base_shard', shardId });
            const written = await uploadVectorIndexJsonFile_ACU({ path, role: 'base_shard', shardId, data: shard, chunkCount: shardChunks.length, status: 'ready' });
            if (!written.ok || !written.ref) throw new Error(written.error || `分片 ${shardId} 上传失败`);
            uploadedFiles.push(written.ref);
            shardRefs.push(written.ref);
            await putVectorIndexCachedShard_ACU(indexId, shardId, shard, written.ref.checksum);
        }

        const rowIndex = buildRowIndex_ACU(indexId, rows.map((row) => ({
            ...row,
            shardIds: Array.from(new Set(row.chunkIds.map((chunkId) => shardIdsByChunkId.get(chunkId)).filter((value): value is string => !!value))),
        })), shardIdsByChunkId, indexedAt);
        const tombstone = buildTombstone_ACU(indexId, options.previousManifest, indexedAt);
        const rowIndexPath = buildVectorIndexFileName_ACU({ chatKey, isolationKey, indexId, role: 'row_index' });
        const rowIndexWritten = await uploadVectorIndexJsonFile_ACU({ path: rowIndexPath, role: 'row_index', data: rowIndex, rowCount: rows.length, status: 'ready' });
        if (!rowIndexWritten.ok || !rowIndexWritten.ref) throw new Error(rowIndexWritten.error || 'rowIndex 上传失败');
        uploadedFiles.push(rowIndexWritten.ref);

        const tombstonePath = buildVectorIndexFileName_ACU({ chatKey, isolationKey, indexId, role: 'tombstone' });
        const tombstoneWritten = await uploadVectorIndexJsonFile_ACU({ path: tombstonePath, role: 'tombstone', data: tombstone, status: 'ready' });
        if (!tombstoneWritten.ok || !tombstoneWritten.ref) throw new Error(tombstoneWritten.error || 'tombstone 上传失败');
        uploadedFiles.push(tombstoneWritten.ref);

        const manifestPath = buildVectorIndexFileName_ACU({ chatKey, isolationKey, indexId, role: 'manifest' });
        const externalTotalBytesWithoutManifest = uploadedFiles.reduce((sum, file) => sum + Math.max(0, Number(file.byteSize) || 0), 0);
        const manifestDraft: ChatSummaryVectorIndexManifest_ACU = {
            version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
            backend: 'st-files',
            status: 'ready',
            indexId,
            chatKey,
            isolationKey,
            snapshotMessageId: options.snapshotMessageId,
            sourceTableKey: options.sourceTableKey,
            sourceTableName: options.sourceTableName,
            indexedAt,
            updatedAt: indexedAt,
            rowCount: rows.length,
            chunkCount: chunks.length,
            skippedRowCount: Math.max(0, Math.floor(Number(options.skippedRowCount) || 0)),
            embeddingModel: options.embeddingModel,
            dimension,
            rowsFile: rowIndexPath,
            tombstoneFile: tombstonePath,
            manifestFile: manifestPath,
            files: [],
            baseShardCount: shardRefs.length,
            deltaShardCount: 0,
            tombstoneRowCount: 0,
            tombstoneChunkCount: 0,
            externalTotalBytes: externalTotalBytesWithoutManifest,
        };
        const manifestWritten = await uploadVectorIndexJsonFile_ACU({ path: manifestPath, role: 'manifest', data: { ...manifestDraft, files: uploadedFiles }, status: 'ready' });
        if (!manifestWritten.ok || !manifestWritten.ref) throw new Error(manifestWritten.error || 'manifest 上传失败');
        uploadedFiles.push(manifestWritten.ref);
        const manifest: ChatSummaryVectorIndexManifest_ACU = {
            ...manifestDraft,
            files: [...uploadedFiles],
            externalTotalBytes: uploadedFiles.reduce((sum, file) => sum + Math.max(0, Number(file.byteSize) || 0), 0),
        };
        await registerVectorIndexFiles_ACU(uploadedFiles);
        await cleanupPreviousManifest_ACU(options.previousManifest);
        const lightweightRows = rows.map((row) => ({
            ...row,
            shardIds: Array.from(new Set(row.chunkIds.map((chunkId) => shardIdsByChunkId.get(chunkId)).filter((value): value is string => !!value))),
        }));
        const state: ChatSummaryVectorIndexState_ACU = {
            version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
            backend: 'st-files',
            status: 'ready',
            indexId,
            snapshotMessageId: options.snapshotMessageId,
            sourceTableKey: options.sourceTableKey,
            sourceTableName: options.sourceTableName,
            indexedAt,
            rowCount: rows.length,
            chunkCount: chunks.length,
            skippedRowCount: Math.max(0, Math.floor(Number(options.skippedRowCount) || 0)),
            rows: lightweightRows,
            manifest,
        };
        return { state, manifest, uploadedFiles };
    } catch (error) {
        await rollbackUploadedFiles_ACU(uploadedFiles);
        throw error;
    }
}

export async function persistSummaryVectorIndexSnapshot_ACU(
    options: PersistSummaryVectorIndexSnapshotOptions_ACU,
): Promise<PersistSummaryVectorIndexExternalResult_ACU> {
    const chatKey = normalizeChatKey_ACU(options.chatKey);
    const isolationKey = options.isolationKey || getCurrentIsolationKey_ACU();
    const indexedAt = options.indexedAt || new Date().toISOString();
    const indexId = buildStableSnapshotIndexId_ACU({ chatKey, isolationKey, sourceTableKey: options.sourceTableKey });
    const rows = normalizeRows_ACU(options.rows);
    const allChunks = normalizeChunks_ACU(options.chunks);
    const activeRowKeys = Array.from(new Set(options.activeRowKeys?.length ? options.activeRowKeys : rows.map((row) => row.rowKey)));
    const activeChunkIds = Array.from(new Set(options.activeChunkIds?.length ? options.activeChunkIds : rows.flatMap((row) => row.chunkIds || [])));
    const activeRowKeySet = new Set(activeRowKeys);
    const activeChunkIdSet = new Set(activeChunkIds);
    const chunks = allChunks.filter((chunk) => activeRowKeySet.has(chunk.rowKey) && activeChunkIdSet.has(chunk.chunkId));
    if (rows.length === 0 || chunks.length === 0 || activeChunkIds.length === 0) {
        throw new Error('交火向量快照索引为空，拒绝写入外置文件。');
    }
    const dimension = chunks[0]?.vector?.length || 0;
    if (dimension <= 0) {
        throw new Error('交火向量快照索引缺少有效向量维度。');
    }

    const uploadedFiles: SummaryVectorIndexExternalFileRef_ACU[] = [];
    try {
        const shardIdsByChunkId = new Map<string, string>();
        const shardRefs: SummaryVectorIndexExternalFileRef_ACU[] = [];
        const shardGroups = chunkArray_ACU(chunks, options.shardChunkLimit || DEFAULT_SHARD_CHUNK_LIMIT_ACU);
        for (let shardIndex = 0; shardIndex < shardGroups.length; shardIndex += 1) {
            const shardId = `shard_${String(shardIndex + 1).padStart(4, '0')}`;
            const shardChunks = shardGroups[shardIndex].map((chunk) => ({ ...chunk, shardId, shardRole: 'base' as const }));
            shardChunks.forEach((chunk) => shardIdsByChunkId.set(chunk.chunkId, shardId));
            const shard: SummaryVectorIndexShard_ACU = {
                version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
                indexId,
                shardId,
                role: 'base',
                createdAt: indexedAt,
                updatedAt: indexedAt,
                chunks: shardChunks,
            };
            const path = buildVectorIndexStableFilePath_ACU({ chatKey, isolationKey, sourceTableKey: options.sourceTableKey, role: 'base_shard', shardId });
            const written = await uploadVectorIndexJsonFile_ACU({ path, role: 'base_shard', shardId, data: shard, chunkCount: shardChunks.length, status: 'ready' });
            if (!written.ok || !written.ref) throw new Error(written.error || `快照分片 ${shardId} 覆盖上传失败`);
            uploadedFiles.push(written.ref);
            shardRefs.push(written.ref);
            await putVectorIndexCachedShard_ACU(indexId, shardId, shard, written.ref.checksum);
        }

        const rowsWithShardIds = rows.map((row) => ({
            ...row,
            shardIds: Array.from(new Set(row.chunkIds.map((chunkId) => shardIdsByChunkId.get(chunkId)).filter((value): value is string => !!value))),
        }));
        const rowIndex = buildRowIndex_ACU(indexId, rowsWithShardIds, shardIdsByChunkId, indexedAt);
        const tombstone = buildTombstone_ACU(indexId, options.previousManifest, indexedAt);
        const removedRowKeys = Array.from(new Set(options.removedRowKeys || []));
        removedRowKeys.forEach((rowKey) => {
            tombstone.removedRows[rowKey] = {
                rowKey,
                chunkIds: [],
                reason: 'row_deleted',
                removedAt: indexedAt,
            };
        });
        const rowIndexPath = buildVectorIndexStableFilePath_ACU({ chatKey, isolationKey, sourceTableKey: options.sourceTableKey, role: 'row_index' });
        const rowIndexWritten = await uploadVectorIndexJsonFile_ACU({ path: rowIndexPath, role: 'row_index', data: rowIndex, rowCount: rowsWithShardIds.length, status: 'ready' });
        if (!rowIndexWritten.ok || !rowIndexWritten.ref) throw new Error(rowIndexWritten.error || '快照 rowIndex 覆盖上传失败');
        uploadedFiles.push(rowIndexWritten.ref);

        const tombstonePath = buildVectorIndexStableFilePath_ACU({ chatKey, isolationKey, sourceTableKey: options.sourceTableKey, role: 'tombstone' });
        const tombstoneWritten = await uploadVectorIndexJsonFile_ACU({ path: tombstonePath, role: 'tombstone', data: tombstone, status: 'ready' });
        if (!tombstoneWritten.ok || !tombstoneWritten.ref) throw new Error(tombstoneWritten.error || '快照 tombstone 覆盖上传失败');
        uploadedFiles.push(tombstoneWritten.ref);

        const currentBatchRef = buildBatchRef_ACU({
            batchId: `snapshot_${indexId}`,
            indexId,
            createdAt: indexedAt,
            updatedAt: indexedAt,
            rows: rowsWithShardIds,
            chunks,
            files: [...shardRefs],
            sourceMessageIndex: options.sourceMessageIndex,
            sourceSnapshotMessageId: options.snapshotMessageId,
        });
        const batchRefs = [currentBatchRef];
        const replacedRowKeys = Array.from(new Set(options.replacedRowKeys || []));
        const parentIndexIds = Array.from(new Set([...(options.parentIndexIds || []), ...(options.previousManifest?.indexId ? [options.previousManifest.indexId] : [])].filter(Boolean)));
        const manifestPath = buildVectorIndexStableFilePath_ACU({ chatKey, isolationKey, sourceTableKey: options.sourceTableKey, role: 'manifest' });
        const manifestFilesWithoutManifest = [...uploadedFiles, ...batchRefs.flatMap((batch) => batch.files || [])];
        const externalTotalBytesWithoutManifest = manifestFilesWithoutManifest.reduce((sum, file) => sum + Math.max(0, Number(file.byteSize) || 0), 0);
        const manifestDraft: ChatSummaryVectorIndexManifest_ACU = {
            version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
            backend: 'st-files',
            status: 'ready',
            indexId,
            chatKey,
            isolationKey,
            snapshotMessageId: options.snapshotMessageId,
            sourceTableKey: options.sourceTableKey,
            sourceTableName: options.sourceTableName,
            indexedAt,
            updatedAt: indexedAt,
            rowCount: rowsWithShardIds.length,
            chunkCount: activeChunkIds.length,
            skippedRowCount: Math.max(0, Math.floor(Number(options.skippedRowCount) || 0)),
            embeddingModel: options.embeddingModel,
            dimension,
            rowsFile: rowIndexPath,
            tombstoneFile: tombstonePath,
            manifestFile: manifestPath,
            files: [],
            baseShardCount: shardRefs.length,
            deltaShardCount: 0,
            tombstoneRowCount: removedRowKeys.length,
            tombstoneChunkCount: 0,
            externalTotalBytes: externalTotalBytesWithoutManifest,
            snapshot: {
                revision: Math.max(1, Math.floor(Number(options.snapshotRevision) || 0) + 1),
                mode: 'snapshot',
                parentIndexIds,
                activeRowKeys,
                activeChunkIds,
                removedRowKeys,
                replacedRowKeys,
                batchIds: batchRefs.map((batch) => batch.batchId),
            },
            batchRefs,
        };
        const manifestWritten = await uploadVectorIndexJsonFile_ACU({ path: manifestPath, role: 'manifest', data: { ...manifestDraft, files: [...uploadedFiles] }, status: 'ready' });
        if (!manifestWritten.ok || !manifestWritten.ref) throw new Error(manifestWritten.error || '快照 manifest 覆盖上传失败');
        uploadedFiles.push(manifestWritten.ref);
        const manifest: ChatSummaryVectorIndexManifest_ACU = {
            ...manifestDraft,
            files: [...uploadedFiles],
            externalTotalBytes: [...uploadedFiles, ...batchRefs.flatMap((batch) => batch.files || [])].reduce((sum, file) => sum + Math.max(0, Number(file.byteSize) || 0), 0),
        };
        const retainedPaths = collectManifestFilePaths_ACU(manifest);
        await registerVectorIndexFiles_ACU([...uploadedFiles, ...batchRefs.flatMap((batch) => batch.files || [])]);
        await cleanupManifestFilesExcept_ACU(options.previousManifest, retainedPaths);
        await cleanupSnapshotScopeFilesExcept_ACU(manifest, retainedPaths);
        const state: ChatSummaryVectorIndexState_ACU = {
            version: SUMMARY_VECTOR_INDEX_MANIFEST_VERSION_ACU,
            backend: 'st-files',
            status: 'ready',
            indexId,
            snapshotMessageId: options.snapshotMessageId,
            sourceTableKey: options.sourceTableKey,
            sourceTableName: options.sourceTableName,
            indexedAt,
            rowCount: rowsWithShardIds.length,
            chunkCount: activeChunkIds.length,
            skippedRowCount: Math.max(0, Math.floor(Number(options.skippedRowCount) || 0)),
            rows: rowsWithShardIds,
            manifest,
        };
        return { state, manifest, uploadedFiles };
    } catch (error) {
        await rollbackUploadedFiles_ACU(uploadedFiles);
        throw error;
    }
}

async function loadChunksFromShardRefs_ACU(
    indexId: string,
    shardRefs: SummaryVectorIndexExternalFileRef_ACU[],
    options: { preferExternalFiles?: boolean } = {},
): Promise<ChatSummaryVectorIndexChunk_ACU[]> {
    const chunks: ChatSummaryVectorIndexChunk_ACU[] = [];
    for (const ref of shardRefs) {
        if (!ref.shardId) continue;
        let shard: SummaryVectorIndexShard_ACU | null = null;
        if (options.preferExternalFiles !== true) {
            shard = await getVectorIndexCachedShard_ACU(indexId, ref.shardId);
        }
        if (!shard) {
            const loaded = await readVectorIndexJsonFile_ACU<SummaryVectorIndexShard_ACU>(ref.path);
            if (!loaded.ok || !loaded.data) {
                throw new Error(`交火向量索引分片读取失败: ${ref.path} ${loaded.error || ''}`.trim());
            }
            const json = JSON.stringify(loaded.data);
            const checksum = await sha256Text_ACU(json);
            if (ref.checksum && checksum !== ref.checksum) {
                throw new Error(`交火向量索引分片校验失败: ${ref.path}`);
            }
            shard = loaded.data;
            await putVectorIndexCachedShard_ACU(indexId, ref.shardId, shard, ref.checksum);
        }
        (shard.chunks || []).forEach((chunk) => chunks.push({ ...chunk }));
    }
    return chunks.filter((chunk) => Array.isArray(chunk.vector) && chunk.vector.length > 0);
}

export async function loadSummaryVectorIndexChunksFromManifest_ACU(
    manifest: ChatSummaryVectorIndexManifest_ACU | null | undefined,
    options: { preferExternalFiles?: boolean } = {},
): Promise<ChatSummaryVectorIndexChunk_ACU[]> {
    if (!manifest) return [];
    if (Array.isArray(manifest.batchRefs) && manifest.batchRefs.length > 0) {
        const activeRowKeys = new Set(manifest.snapshot?.activeRowKeys || []);
        const activeChunkIds = new Set(manifest.snapshot?.activeChunkIds || []);
        const removedRowKeys = new Set(manifest.snapshot?.removedRowKeys || []);
        const chunks: ChatSummaryVectorIndexChunk_ACU[] = [];
        for (const batch of manifest.batchRefs) {
            const shardRefs = (batch.files || []).filter((file) => file.role === 'base_shard' || file.role === 'delta_shard');
            const batchChunks = await loadChunksFromShardRefs_ACU(batch.indexId || manifest.indexId, shardRefs, options);
            batchChunks.forEach((chunk) => {
                if (removedRowKeys.has(chunk.rowKey)) return;
                if (activeRowKeys.size > 0 && !activeRowKeys.has(chunk.rowKey)) return;
                if (activeChunkIds.size > 0 && !activeChunkIds.has(chunk.chunkId)) return;
                chunks.push(chunk);
            });
        }
        const byChunkId = new Map<string, ChatSummaryVectorIndexChunk_ACU>();
        chunks.forEach((chunk) => byChunkId.set(chunk.chunkId, chunk));
        logDebug_ACU('[交火向量索引] 已按最新快照 manifest 拼接批次向量库。');
        return Array.from(byChunkId.values()).sort((left, right) => left.sequence - right.sequence || left.chunkId.localeCompare(right.chunkId));
    }
    if (!manifest.files?.length) return [];
    const shardRefs = manifest.files.filter((file) => file.role === 'base_shard' || file.role === 'delta_shard');
    return loadChunksFromShardRefs_ACU(manifest.indexId, shardRefs, options);
}

export async function deleteSummaryVectorIndexExternal_ACU(manifest: ChatSummaryVectorIndexManifest_ACU | null | undefined): Promise<void> {
    if (!manifest) return;
    const retainedPaths = new Set<string>();
    await cleanupManifestFilesExcept_ACU(manifest, retainedPaths);
    await cleanupSnapshotScopeFilesExcept_ACU(manifest, retainedPaths, { includeSameSourceTableFallback: true });
    if (manifest.indexId) {
        await deleteVectorIndexCacheByIndex_ACU(manifest.indexId);
    }
}

export async function getSummaryVectorIndexStats_ACU(manifest: ChatSummaryVectorIndexManifest_ACU | null | undefined): Promise<SummaryVectorIndexStats_ACU> {
    const cache = await estimateVectorIndexTempCache_ACU();
    if (!manifest) {
        return {
            status: 'none',
            indexId: '',
            backend: 'none',
            rowCount: 0,
            chunkCount: 0,
            baseShardCount: 0,
            deltaShardCount: 0,
            tombstoneRowCount: 0,
            tombstoneChunkCount: 0,
            externalTotalBytes: 0,
            cacheTotalBytes: cache.bytes,
            updatedAt: '',
        };
    }
    return {
        status: manifest.status,
        indexId: manifest.indexId,
        backend: manifest.backend,
        rowCount: manifest.rowCount,
        chunkCount: manifest.chunkCount,
        baseShardCount: manifest.baseShardCount,
        deltaShardCount: manifest.deltaShardCount,
        tombstoneRowCount: manifest.tombstoneRowCount,
        tombstoneChunkCount: manifest.tombstoneChunkCount,
        externalTotalBytes: manifest.externalTotalBytes,
        cacheTotalBytes: cache.bytes,
        updatedAt: manifest.updatedAt,
        error: manifest.error,
    };
}
