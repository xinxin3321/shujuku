import type { ChatVectorRemoteMemoryBatch_ACU, ChatVectorRemoteMemoryChunk_ACU } from '../../data/models/chat-message-data';
import { createEmbeddings_ACU } from '../../data/gateways/vector-embedding-gateway';
import { callAIWithPreset_ACU } from '../ai/api-call';
import { hashUserInput_ACU } from '../../shared/utils';
import { DEFAULT_REMOTE_MEMORY_ARCHIVE_PROMPT_GROUP_ACU } from '../../shared/defaults-json.js';
import { defaultVectorMemoryConfig_ACU } from '../../shared/defaults';
import type { VectorMemoryConfig_ACU } from './vector-memory-config';

export interface RemoteMemoryArchiveSourceRow_ACU {
    rowKey: string;
    rowId: string;
    timeSpan: string;
    location: string;
    summary: string;
    content: string;
    sourceMessageId: string;
}

export interface BuildRemoteMemoryBatchOptions_ACU {
    namespace: string;
    snapshotMessageId: string;
    sourceMessageId: string;
    batchSequence?: number;
    createdAt?: string;
    config: Pick<
        VectorMemoryConfig_ACU,
        | 'embeddingEndpoint'
        | 'embeddingApiKey'
        | 'embeddingModel'
        | 'summaryChunkSentenceCount'
        | 'summaryPromptGroupId'
        | 'summaryPromptGroup'
        | 'archiveWithoutSummary'
    >;
}

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function normalizePromptRole_ACU(role: any): string {
    const normalized = String(role || 'user').trim().toLowerCase();
    if (normalized === 'system' || normalized === 'assistant' || normalized === 'user') {
        return normalized;
    }
    return 'user';
}

function cloneDefaultRemotePromptGroup_ACU(): any[] {
    return Array.isArray(DEFAULT_REMOTE_MEMORY_ARCHIVE_PROMPT_GROUP_ACU)
        ? JSON.parse(JSON.stringify(DEFAULT_REMOTE_MEMORY_ARCHIVE_PROMPT_GROUP_ACU))
        : [];
}

function cloneSummaryPromptGroupFromConfig_ACU(promptGroup?: any[]): any[] {
    if (Array.isArray(promptGroup) && promptGroup.length > 0) {
        return JSON.parse(JSON.stringify(promptGroup));
    }

    const defaultPromptGroup = Array.isArray((defaultVectorMemoryConfig_ACU as any).summaryPromptGroup)
        ? (defaultVectorMemoryConfig_ACU as any).summaryPromptGroup
        : [];
    if (defaultPromptGroup.length > 0) {
        return JSON.parse(JSON.stringify(defaultPromptGroup));
    }

    return cloneDefaultRemotePromptGroup_ACU();
}

function normalizeArchiveRows_ACU(rows: RemoteMemoryArchiveSourceRow_ACU[]): RemoteMemoryArchiveSourceRow_ACU[] {
    return Array.isArray(rows)
        ? rows.filter((row) => normalizeText_ACU(row?.rowKey) && normalizeText_ACU(row?.content || row?.summary))
        : [];
}

function buildArchiveSourceMaterial_ACU(rows: RemoteMemoryArchiveSourceRow_ACU[]): string {
    return rows
        .map((row, index) => {
            const parts = [
                `条目序号: ${index + 1}`,
                `rowKey: ${normalizeText_ACU(row.rowKey) || '未填写'}`,
                `row_id: ${normalizeText_ACU(row.rowId) || '未填写'}`,
                `时间跨度: ${normalizeText_ACU(row.timeSpan) || '未填写'}`,
                `地点: ${normalizeText_ACU(row.location) || '未填写'}`,
                `概览: ${normalizeText_ACU(row.summary) || '未填写'}`,
                `纪要内容: ${normalizeText_ACU(row.content) || '未填写'}`,
            ];
            return parts.join('\n');
        })
        .join('\n\n--------------------\n\n');
}

function buildFallbackArchivePromptMessage_ACU(material: string): { role: string; content: string } {
    const normalizedMaterial = material || '（空）';
    return {
        role: 'user',
        content: `以下是需要归档成远记忆大总结的一批较早纪要条目：\n<纪要批次>\n${normalizedMaterial}\n</纪要批次>\n\n请严格遵守前述规则，只输出最终远记忆大总结正文。`,
    };
}

function buildArchivePromptMessages_ACU(rows: RemoteMemoryArchiveSourceRow_ACU[], promptGroup?: any[]): any[] {
    const material = buildArchiveSourceMaterial_ACU(rows);
    const materialForPrompt = material || '（空）';
    const promptGroupSource = cloneSummaryPromptGroupFromConfig_ACU(promptGroup);
    let materialInjected = false;

    const messages = promptGroupSource
        .map((segment) => {
            const rawContent = String(segment?.content || '');
            if (rawContent.includes('$SUMMARY_SOURCE_ROWS')) {
                materialInjected = true;
            }
            return {
                role: normalizePromptRole_ACU(segment?.role),
                content: normalizeText_ACU(rawContent.replace(/\$SUMMARY_SOURCE_ROWS/g, materialForPrompt)),
            };
        })
        .filter((segment) => segment.content);

    if (!materialInjected || messages.length === 0) {
        messages.push(buildFallbackArchivePromptMessage_ACU(materialForPrompt));
    }

    return messages;
}

function buildDirectArchiveTextFromRows_ACU(rows: RemoteMemoryArchiveSourceRow_ACU[]): string {
    const material = rows
        .map((row, index) => {
            const parts = [
                `第${index + 1}条纪要`,
                `时间跨度: ${normalizeText_ACU(row.timeSpan) || '未填写'}`,
                `地点: ${normalizeText_ACU(row.location) || '未填写'}`,
                `概览: ${normalizeText_ACU(row.summary) || '未填写'}`,
                `纪要内容: ${normalizeText_ACU(row.content) || '未填写'}`,
            ];
            return parts.join('\n');
        })
        .join('\n\n--------------------\n\n');

    return normalizeText_ACU(
        `以下为未经过AI总结的远记忆直接归档内容，共 ${rows.length} 条纪要。\n`
        + '为保证后续召回可读性，按原始纪要顺序整理如下：\n\n'
        + `${material || '（空）'}`,
    );
}

function splitSentences_ACU(text: string): string[] {
    const normalized = normalizeText_ACU(text);
    if (!normalized) return [];
    const matches = normalized.match(/[^。！？!?；;\n]+[。！？!?；;]?/g);
    const sentences = Array.isArray(matches)
        ? matches.map((item) => normalizeText_ACU(item)).filter(Boolean)
        : [normalized];
    return sentences.length > 0 ? sentences : [normalized];
}

function buildSummaryChunks_ACU(batchId: string, summaryText: string, sentenceCount: number): Omit<ChatVectorRemoteMemoryChunk_ACU, 'vector'>[] {
    const sentences = splitSentences_ACU(summaryText);
    if (sentences.length === 0) return [];

    const normalizedSentenceCount = Math.max(1, Math.floor(Number(sentenceCount) || 2));
    const chunks: Omit<ChatVectorRemoteMemoryChunk_ACU, 'vector'>[] = [];

    for (let index = 0; index < sentences.length; index += normalizedSentenceCount) {
        const text = normalizeText_ACU(sentences.slice(index, index + normalizedSentenceCount).join(''));
        if (!text) continue;
        chunks.push({
            chunkId: `${batchId}:chunk:${chunks.length}`,
            text,
            sequence: chunks.length,
        });
    }

    return chunks;
}

async function embedChunkTexts_ACU(
    chunkSources: Omit<ChatVectorRemoteMemoryChunk_ACU, 'vector'>[],
    config: Pick<VectorMemoryConfig_ACU, 'embeddingEndpoint' | 'embeddingApiKey' | 'embeddingModel'>,
): Promise<ChatVectorRemoteMemoryChunk_ACU[]> {
    if (chunkSources.length === 0) {
        return [];
    }

    const embeddings = await createEmbeddings_ACU({
        endpoint: config.embeddingEndpoint,
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel,
        input: chunkSources.map((item) => item.text),
    });

    const embeddingMap = new Map<number, number[]>();
    embeddings.forEach((item) => {
        if (Array.isArray(item.embedding) && item.embedding.length > 0) {
            embeddingMap.set(item.index, item.embedding);
        }
    });

    return chunkSources.map((item, index) => ({
        ...item,
        vector: embeddingMap.get(index) || [],
    })).filter((item) => item.vector.length > 0);
}

export async function generateRemoteMemorySummaryText_ACU(
    rows: RemoteMemoryArchiveSourceRow_ACU[],
    promptGroupId: string,
    promptGroup?: any[],
): Promise<string> {
    const normalizedRows = normalizeArchiveRows_ACU(rows);
    if (normalizedRows.length === 0) {
        throw new Error('缺少可归档的纪要条目。');
    }

    const messages = buildArchivePromptMessages_ACU(normalizedRows, promptGroup);
    const result = await callAIWithPreset_ACU(messages, normalizeText_ACU(promptGroupId));
    const summaryText = normalizeText_ACU(result);
    if (!summaryText) {
        throw new Error('远记忆归档模型返回空内容。');
    }
    return summaryText;
}

export async function buildRemoteMemoryBatchFromRows_ACU(
    rows: RemoteMemoryArchiveSourceRow_ACU[],
    options: BuildRemoteMemoryBatchOptions_ACU,
): Promise<ChatVectorRemoteMemoryBatch_ACU> {
    const normalizedRows = normalizeArchiveRows_ACU(rows);
    if (normalizedRows.length === 0) {
        throw new Error('缺少可构建远记忆批次的来源行。');
    }

    const createdAt = normalizeText_ACU(options.createdAt) || new Date().toISOString();
    const snapshotMessageId = normalizeText_ACU(options.snapshotMessageId);
    const sourceMessageId = normalizeText_ACU(options.sourceMessageId);
    const batchSequence = Math.max(0, Math.floor(Number(options.batchSequence) || 0));
    if (!snapshotMessageId) {
        throw new Error('缺少 snapshotMessageId。');
    }
    if (!sourceMessageId) {
        throw new Error('缺少 sourceMessageId。');
    }

    const summaryText = options.config.archiveWithoutSummary === true
        ? buildDirectArchiveTextFromRows_ACU(normalizedRows)
        : await generateRemoteMemorySummaryText_ACU(
            normalizedRows,
            options.config.summaryPromptGroupId,
            options.config.summaryPromptGroup,
        );
    if (!summaryText) {
        throw new Error('远记忆归档正文为空。');
    }

    const summaryHash = hashUserInput_ACU(summaryText);
    if (!summaryHash) {
        throw new Error('远记忆大总结 hash 生成失败。');
    }

    const batchId = `${normalizeText_ACU(options.namespace) || 'chat'}:${sourceMessageId}:batch:${batchSequence}:${summaryHash}`;
    const chunkSources = buildSummaryChunks_ACU(batchId, summaryText, options.config.summaryChunkSentenceCount);
    if (chunkSources.length === 0) {
        throw new Error('远记忆大总结切分后未生成任何 chunk。');
    }

    const chunks = await embedChunkTexts_ACU(chunkSources, options.config);
    if (chunks.length !== chunkSources.length) {
        throw new Error('远记忆大总结向量化结果不完整。');
    }

    const sourceRowKeys = normalizedRows.map((row) => normalizeText_ACU(row.rowKey)).filter(Boolean);
    const firstRowKey = sourceRowKeys[0] || '';
    const lastRowKey = sourceRowKeys[sourceRowKeys.length - 1] || '';

    return {
        batchId,
        snapshotMessageId,
        sourceMessageId,
        sourceRowKeys,
        sourceRowCount: sourceRowKeys.length,
        summaryText,
        summaryHash,
        chunks,
        promptGroupVersion: normalizeText_ACU(options.config.summaryPromptGroupId),
        createdAt,
        archivedRange: firstRowKey && lastRowKey
            ? {
                firstRowKey,
                lastRowKey,
            }
            : undefined,
    };
}

export async function rebuildRemoteMemoryBatchSummary_ACU(
    batch: ChatVectorRemoteMemoryBatch_ACU,
    config: Pick<VectorMemoryConfig_ACU, 'embeddingEndpoint' | 'embeddingApiKey' | 'embeddingModel' | 'summaryChunkSentenceCount'>,
): Promise<ChatVectorRemoteMemoryBatch_ACU> {
    const summaryText = normalizeText_ACU(batch?.summaryText);
    if (!summaryText) {
        throw new Error('远记忆批次 summaryText 为空，无法重建向量。');
    }

    const batchId = normalizeText_ACU(batch?.batchId);
    if (!batchId) {
        throw new Error('远记忆批次 batchId 为空，无法重建向量。');
    }

    const chunkSources = buildSummaryChunks_ACU(batchId, summaryText, config.summaryChunkSentenceCount);
    if (chunkSources.length === 0) {
        throw new Error('编辑后的远记忆总结未生成任何 chunk。');
    }

    const chunks = await embedChunkTexts_ACU(chunkSources, config);
    if (chunks.length !== chunkSources.length) {
        throw new Error('编辑后的远记忆总结向量化结果不完整。');
    }

    return {
        ...batch,
        summaryText,
        summaryHash: hashUserInput_ACU(summaryText),
        chunks,
    };
}
