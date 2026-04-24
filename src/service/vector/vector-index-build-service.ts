import { getVectorMemoryNamespace_ACU } from './vector-memory-config';

export interface VectorIndexBuildContext_ACU {
    messageIndex: number;
    createdAt?: string;
    chatFileIdentifier?: string | null;
}

export interface VectorIndexBuildResult_ACU {
    success: boolean;
    namespace: string;
    batchCount: number;
    chunkCount: number;
    errors: string[];
}

function buildFailureResult_ACU(namespace: string, errors: string[]): VectorIndexBuildResult_ACU {
    return {
        success: false,
        namespace,
        batchCount: 0,
        chunkCount: 0,
        errors,
    };
}

export async function buildAndUpsertVectorIndexBatch_ACU(
    _headerRow: any[] | null | undefined,
    _rows: any[],
    context: VectorIndexBuildContext_ACU,
): Promise<VectorIndexBuildResult_ACU> {
    const namespace = getVectorMemoryNamespace_ACU(context.chatFileIdentifier);
    return buildFailureResult_ACU(namespace, [
        '旧纪要条目向量构建服务已停用，等待新的远记忆归档构建服务接管。当前不会再生成过期的 items/chunks 结果。',
    ]);
}
