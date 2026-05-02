import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';
import { getChatArray_ACU, saveChatToHost_ACU } from '../chat/chat-service';
import { readIsolatedTagData_ACU, writeIsolatedTagData_ACU } from '../../data/repositories/chat-message-data-repo';
import { deleteVectorIndexCacheByIndex_ACU } from '../../data/storage/vector-index-temp-cache';
import { assignSummaryVectorIndexStateToTagData_ACU, getLatestSummaryVectorIndexSnapshotState_ACU } from './summary-vector-index-state-service';
import { loadSummaryVectorIndexChunksFromManifest_ACU } from './summary-vector-index-storage-service';

export interface SummaryVectorIndexCachePreloadResult_ACU {
    success: boolean;
    skipped: boolean;
    reason?: string;
    chunkCount: number;
    indexId?: string;
    error?: string;
    cacheCleared?: boolean;
    chatStateCleared?: boolean;
}

function normalizeErrorMessage_ACU(error: unknown): string {
    if (error instanceof Error) return error.message || error.name || '未知错误';
    if (typeof error === 'string') return error;
    try {
        const json = JSON.stringify(error);
        return json && json !== '{}' ? json : String(error || '未知错误');
    } catch (_jsonError) {
        return String(error || '未知错误');
    }
}

function isMissingExternalVectorFileError_ACU(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return text.includes('交火向量索引分片读取失败')
        && (text.includes('404') || text.includes('not found') || text.includes('读取失败'));
}

async function clearLatestSummaryVectorIndexState_ACU(params: { messageIndex: number; isolationKey: string }): Promise<boolean> {
    const chat = getChatArray_ACU();
    const message = chat?.[params.messageIndex];
    if (!message || message.is_user) return false;
    const tagData = readIsolatedTagData_ACU(message, params.isolationKey);
    if (!tagData) return false;
    assignSummaryVectorIndexStateToTagData_ACU(tagData, null);
    writeIsolatedTagData_ACU(message, params.isolationKey, tagData);
    await saveChatToHost_ACU();
    return true;
}

export async function preloadSummaryVectorIndexCacheForCurrentChat_ACU(): Promise<SummaryVectorIndexCachePreloadResult_ACU> {
    const snapshot = getLatestSummaryVectorIndexSnapshotState_ACU();
    const latestLayer = snapshot?.layers?.[0] || null;
    const manifest = snapshot?.summaryVectorIndexState?.manifest || null;
    if (!manifest) {
        return {
            success: true,
            skipped: true,
            reason: 'no_manifest',
            chunkCount: 0,
        };
    }

    if (manifest.status !== 'ready') {
        return {
            success: true,
            skipped: true,
            reason: `manifest_status_${manifest.status || 'unknown'}`,
            chunkCount: 0,
            indexId: manifest.indexId,
        };
    }

    try {
        const chunks = await loadSummaryVectorIndexChunksFromManifest_ACU(manifest, { preferExternalFiles: true });
        logDebug_ACU(`[交火向量索引] 当前聊天向量缓存预热完成：indexId=${manifest.indexId}, chunks=${chunks.length}`);
        return {
            success: true,
            skipped: false,
            chunkCount: chunks.length,
            indexId: manifest.indexId,
        };
    } catch (error) {
        const message = normalizeErrorMessage_ACU(error);
        if (isMissingExternalVectorFileError_ACU(message)) {
            await deleteVectorIndexCacheByIndex_ACU(manifest.indexId);
            const chatStateCleared = latestLayer
                ? await clearLatestSummaryVectorIndexState_ACU({ messageIndex: latestLayer.messageIndex, isolationKey: latestLayer.isolationKey })
                : false;
            logWarn_ACU('[交火向量索引] 当前聊天外置向量文件缺失，已清空对应缓存与聊天索引状态:', message);
            return {
                success: true,
                skipped: true,
                reason: 'external_files_missing_cache_cleared',
                chunkCount: 0,
                indexId: manifest.indexId,
                error: message,
                cacheCleared: true,
                chatStateCleared,
            };
        }
        logWarn_ACU('[交火向量索引] 当前聊天向量缓存预热失败:', message);
        return {
            success: false,
            skipped: false,
            reason: 'preload_failed',
            chunkCount: 0,
            indexId: manifest.indexId,
            error: message,
        };
    }
}
