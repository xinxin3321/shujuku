import type { ChatVectorRemoteMemoryBatch_ACU, ChatVectorRemoteMemoryChunk_ACU, ChatVectorState_ACU } from '../../data/models/chat-message-data';
import { createEmbeddings_ACU } from '../../data/gateways/vector-embedding-gateway';
import { logWarn_ACU } from '../../shared/utils';
import {
    getCurrentVectorMemoryConfig_ACU,
    getVectorMemoryNamespace_ACU,
    normalizeVectorMemoryConfig_ACU,
    validateVectorMemoryConfig_ACU,
    VectorMemoryConfig_ACU,
} from './vector-memory-config';

export interface VectorRecallMatch_ACU {
    id: string;
    score: number;
    content: string;
    rowKey: string;
    createdAt: string;
    metadata: Record<string, any>;
}

export interface VectorRecallResult_ACU {
    enabled: boolean;
    skipped: boolean;
    namespace: string;
    queryText: string;
    matches: VectorRecallMatch_ACU[];
    errors: string[];
}

interface ScoredChunkCandidate_ACU {
    batch: ChatVectorRemoteMemoryBatch_ACU;
    chunk: ChatVectorRemoteMemoryChunk_ACU;
    score: number;
}

interface RuleMatchedBatch_ACU {
    batch: ChatVectorRemoteMemoryBatch_ACU;
    matchedTerms: string[];
    keywordBoost: number;
    summaryBoost: number;
}

interface RerankedBatchCandidate_ACU {
    batch: ChatVectorRemoteMemoryBatch_ACU;
    chunkMatches: ScoredChunkCandidate_ACU[];
    matchedTerms: string[];
    matchedByRules: boolean;
    maxChunkScore: number;
    avgChunkScore: number;
    keywordBoost: number;
    summaryBoost: number;
    finalScore: number;
}

function normalizeQueryText_ACU(queryText: any): string {
    return typeof queryText === 'string' ? queryText.trim() : '';
}

function normalizeTopK_ACU(config: VectorMemoryConfig_ACU): number {
    const topK = Number(config.topK);
    if (!Number.isFinite(topK) || topK <= 0) {
        return 5;
    }
    return Math.max(1, Math.floor(topK));
}

function normalizeMinScore_ACU(config: VectorMemoryConfig_ACU): number {
    const minScore = Number(config.minScore);
    if (!Number.isFinite(minScore)) {
        return 0;
    }
    if (minScore < 0) {
        return 0;
    }
    if (minScore > 1) {
        return 1;
    }
    return minScore;
}

function normalizeCandidateLimit_ACU(config: VectorMemoryConfig_ACU): number {
    const candidateLimit = Number(config.recallCandidateLimit);
    if (!Number.isFinite(candidateLimit) || candidateLimit <= 0) {
        return Math.max(normalizeTopK_ACU(config), 20);
    }
    return Math.max(normalizeTopK_ACU(config), Math.floor(candidateLimit));
}

function normalizeVectorState_ACU(stateInput: any): ChatVectorState_ACU {
    if (!stateInput || typeof stateInput !== 'object' || Array.isArray(stateInput)) {
        return {
            snapshotMessageId: '',
            remoteMemoryBatches: [],
        };
    }
    return {
        snapshotMessageId: typeof stateInput.snapshotMessageId === 'string' ? stateInput.snapshotMessageId : '',
        remoteMemoryBatches: Array.isArray(stateInput.remoteMemoryBatches) ? stateInput.remoteMemoryBatches : [],
        lastIndexedAt: typeof stateInput.lastIndexedAt === 'string' ? stateInput.lastIndexedAt : undefined,
        lastArchiveAt: typeof stateInput.lastArchiveAt === 'string' ? stateInput.lastArchiveAt : undefined,
    };
}

function cosineSimilarity_ACU(left: number[], right: number[]): number {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
        return -1;
    }
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index++) {
        const l = Number(left[index]);
        const r = Number(right[index]);
        if (!Number.isFinite(l) || !Number.isFinite(r)) {
            return -1;
        }
        dot += l * r;
        leftNorm += l * l;
        rightNorm += r * r;
    }
    if (leftNorm <= 0 || rightNorm <= 0) {
        return -1;
    }
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function normalizeSearchText_ACU(value: any): string {
    return String(value || '').trim().toLowerCase();
}

function extractQueryTerms_ACU(queryText: string): string[] {
    const normalized = normalizeSearchText_ACU(queryText);
    const pieces = normalized
        .split(/[\s,，。！？；;、|/\\]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2);
    const ordered = [normalized, ...pieces].filter((part) => part.length >= 2);
    return Array.from(new Set(ordered));
}

function collectScoredCandidates_ACU(state: ChatVectorState_ACU, queryEmbedding: number[], config: VectorMemoryConfig_ACU): ScoredChunkCandidate_ACU[] {
    const minScore = normalizeMinScore_ACU(config);
    const candidates: ScoredChunkCandidate_ACU[] = [];
    (state.remoteMemoryBatches || []).forEach((batch) => {
        (batch?.chunks || []).forEach((chunk) => {
            const score = cosineSimilarity_ACU(queryEmbedding, Array.isArray(chunk?.vector) ? chunk.vector : []);
            if (score >= minScore) {
                candidates.push({ batch, chunk, score });
            }
        });
    });
    return candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, normalizeCandidateLimit_ACU(config));
}

function collectRuleMatchedBatches_ACU(state: ChatVectorState_ACU, queryText: string): RuleMatchedBatch_ACU[] {
    const terms = extractQueryTerms_ACU(queryText);
    if (terms.length === 0) {
        return [];
    }

    const matches: RuleMatchedBatch_ACU[] = [];
    (state.remoteMemoryBatches || []).forEach((batch) => {
        const summaryText = normalizeSearchText_ACU(batch?.summaryText);
        const archivedFirst = normalizeSearchText_ACU(batch?.archivedRange?.firstRowKey);
        const archivedLast = normalizeSearchText_ACU(batch?.archivedRange?.lastRowKey);
        const sourceRowKeysText = Array.isArray(batch?.sourceRowKeys)
            ? batch.sourceRowKeys.map((value) => normalizeSearchText_ACU(value)).join(' ')
            : '';
        const matchedTerms = terms.filter((term) => (
            summaryText.includes(term)
            || archivedFirst.includes(term)
            || archivedLast.includes(term)
            || sourceRowKeysText.includes(term)
        ));
        if (matchedTerms.length === 0) {
            return;
        }

        const keywordBoost = matchedTerms.reduce((total, term) => {
            let next = total;
            if (archivedFirst.includes(term) || archivedLast.includes(term)) next += 0.04;
            if (sourceRowKeysText.includes(term)) next += 0.02;
            return next;
        }, 0);
        const summaryBoost = matchedTerms.reduce((total, term) => total + (summaryText.includes(term) ? 0.12 : 0), 0);
        matches.push({
            batch,
            matchedTerms,
            keywordBoost,
            summaryBoost,
        });
    });

    return matches;
}

function rerankBatchCandidates_ACU(
    chunkCandidates: ScoredChunkCandidate_ACU[],
    ruleMatchedBatches: RuleMatchedBatch_ACU[],
): RerankedBatchCandidate_ACU[] {
    const aggregated = new Map<string, RerankedBatchCandidate_ACU>();

    chunkCandidates.forEach((candidate) => {
        const key = candidate.batch.batchId;
        if (!key) {
            return;
        }
        const existing = aggregated.get(key);
        if (existing) {
            existing.chunkMatches.push(candidate);
            return;
        }
        aggregated.set(key, {
            batch: candidate.batch,
            chunkMatches: [candidate],
            matchedTerms: [],
            matchedByRules: false,
            maxChunkScore: 0,
            avgChunkScore: 0,
            keywordBoost: 0,
            summaryBoost: 0,
            finalScore: 0,
        });
    });

    ruleMatchedBatches.forEach((ruleMatch) => {
        const key = ruleMatch.batch.batchId;
        if (!key) {
            return;
        }
        const existing = aggregated.get(key);
        if (existing) {
            existing.matchedByRules = true;
            existing.matchedTerms = Array.from(new Set([...existing.matchedTerms, ...ruleMatch.matchedTerms]));
            existing.keywordBoost = Math.max(existing.keywordBoost, ruleMatch.keywordBoost);
            existing.summaryBoost = Math.max(existing.summaryBoost, ruleMatch.summaryBoost);
            return;
        }
        aggregated.set(key, {
            batch: ruleMatch.batch,
            chunkMatches: [],
            matchedTerms: [...ruleMatch.matchedTerms],
            matchedByRules: true,
            maxChunkScore: 0,
            avgChunkScore: 0,
            keywordBoost: ruleMatch.keywordBoost,
            summaryBoost: ruleMatch.summaryBoost,
            finalScore: 0,
        });
    });

    return Array.from(aggregated.values())
        .map((candidate) => {
            const scores = candidate.chunkMatches.map((item) => item.score).filter((score) => Number.isFinite(score));
            const maxChunkScore = scores.length > 0 ? Math.max(...scores) : 0;
            const avgChunkScore = scores.length > 0
                ? scores.reduce((total, score) => total + score, 0) / scores.length
                : 0;
            const multiChunkBoost = scores.length > 1 ? Math.min(0.12, (scores.length - 1) * 0.03) : 0;
            const finalScore = (maxChunkScore * 0.75) + candidate.keywordBoost + candidate.summaryBoost + multiChunkBoost;
            return {
                ...candidate,
                maxChunkScore,
                avgChunkScore,
                finalScore,
            };
        })
        .sort((a, b) => b.finalScore - a.finalScore);
}

function buildRecallMatchesFromCandidates_ACU(candidates: RerankedBatchCandidate_ACU[], config: VectorMemoryConfig_ACU): VectorRecallMatch_ACU[] {
    return candidates
        .filter((candidate) => {
            const content = String(candidate.batch.summaryText || '').trim();
            return !!candidate.batch.batchId && !!content;
        })
        .slice(0, normalizeTopK_ACU(config))
        .map((candidate) => {
            const content = String(candidate.batch.summaryText || '').trim();
            const bestChunk = [...candidate.chunkMatches].sort((a, b) => b.score - a.score)[0] || null;
            return {
                id: candidate.batch.batchId,
                score: candidate.finalScore,
                content,
                rowKey: candidate.batch.archivedRange?.firstRowKey || candidate.batch.sourceRowKeys?.[0] || '',
                createdAt: candidate.batch.createdAt || '',
                metadata: {
                    batchId: candidate.batch.batchId,
                    snapshotMessageId: candidate.batch.snapshotMessageId,
                    sourceMessageId: candidate.batch.sourceMessageId,
                    sourceRowKeys: candidate.batch.sourceRowKeys,
                    sourceRowCount: candidate.batch.sourceRowCount,
                    summaryHash: candidate.batch.summaryHash,
                    promptGroupVersion: candidate.batch.promptGroupVersion,
                    archivedRange: candidate.batch.archivedRange,
                    matchedByRules: candidate.matchedByRules,
                    matchedTerms: candidate.matchedTerms,
                    maxChunkScore: candidate.maxChunkScore,
                    avgChunkScore: candidate.avgChunkScore,
                    keywordBoost: candidate.keywordBoost,
                    summaryBoost: candidate.summaryBoost,
                    chunkMatchCount: candidate.chunkMatches.length,
                    bestChunkId: bestChunk?.chunk.chunkId || '',
                    bestChunkText: bestChunk?.chunk.text || '',
                },
            };
        });
}

export async function recallVectorMemory_ACU(
    queryTextInput: any,
    stateInput: ChatVectorState_ACU | null | undefined,
    configInput?: any,
): Promise<VectorRecallResult_ACU> {
    const queryText = normalizeQueryText_ACU(queryTextInput);
    const config = normalizeVectorMemoryConfig_ACU(configInput ?? getCurrentVectorMemoryConfig_ACU());
    const namespace = getVectorMemoryNamespace_ACU();
    const validation = validateVectorMemoryConfig_ACU(config);
    const state = normalizeVectorState_ACU(stateInput);

    if (!config.enabled) {
        return {
            enabled: false,
            skipped: true,
            namespace,
            queryText,
            matches: [],
            errors: [],
        };
    }

    if (!queryText) {
        return {
            enabled: true,
            skipped: true,
            namespace,
            queryText,
            matches: [],
            errors: [],
        };
    }

    if (!validation.valid) {
        return {
            enabled: true,
            skipped: true,
            namespace,
            queryText,
            matches: [],
            errors: [...validation.errors],
        };
    }

    if (!Array.isArray(state.remoteMemoryBatches) || state.remoteMemoryBatches.length === 0) {
        return {
            enabled: true,
            skipped: true,
            namespace,
            queryText,
            matches: [],
            errors: [],
        };
    }

    try {
        const embeddings = await createEmbeddings_ACU({
            endpoint: config.embeddingEndpoint,
            apiKey: config.embeddingApiKey,
            model: config.embeddingModel,
            input: [queryText],
        });
        const queryEmbedding = embeddings[0]?.embedding;
        if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
            return {
                enabled: true,
                skipped: true,
                namespace,
                queryText,
                matches: [],
                errors: ['召回 embedding 结果为空'],
            };
        }

        const chunkCandidates = collectScoredCandidates_ACU(state, queryEmbedding, config);
        const ruleMatchedBatches = collectRuleMatchedBatches_ACU(state, queryText);
        const rerankedCandidates = rerankBatchCandidates_ACU(chunkCandidates, ruleMatchedBatches)
            .slice(0, normalizeCandidateLimit_ACU(config));
        const matches = buildRecallMatchesFromCandidates_ACU(rerankedCandidates, config);
        return {
            enabled: true,
            skipped: false,
            namespace,
            queryText,
            matches,
            errors: [],
        };
    } catch (error) {
        logWarn_ACU('[向量记忆] 召回失败，已降级跳过:', error);
        return {
            enabled: true,
            skipped: true,
            namespace,
            queryText,
            matches: [],
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
}
