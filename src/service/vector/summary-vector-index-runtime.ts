import { createEmbeddings_ACU } from '../../data/gateways/vector-embedding-gateway';
import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';
import { getChatArray_ACU } from '../chat/chat-service';
import { callAIWithPreset_ACU } from '../ai/api-call';
import { getCurrentWorldbookConfig_ACU } from '../settings/settings-readers';
import { globalMeta_ACU } from '../../data/repositories/profile-repo';
import { getInjectionTargetLorebook_ACU, getIsolationPrefix_ACU } from '../worldbook/injection-engine';
import {
    createLorebookEntries_ACU,
    getLorebookEntries_ACU,
    isWorldbookApiAvailable_ACU,
    setLorebookEntries_ACU,
} from '../worldbook/worldbook-service';
import { getEffectiveSummaryVectorIndexConfig_ACU, validateSummaryVectorIndexConfig_ACU } from './vector-memory-config';
import { getLatestSummaryVectorIndexSnapshotState_ACU } from './summary-vector-index-state-service';
import { loadSummaryVectorIndexChunksFromManifest_ACU } from './summary-vector-index-storage-service';
import type { ChatSummaryVectorIndexChunk_ACU, ChatSummaryVectorIndexRow_ACU } from './summary-vector-index-types';

interface SummaryVectorIndexRuntimeOptions_ACU {
    userInput?: string;
    source?: string;
}

export interface SummaryVectorIndexRuntimeResult_ACU {
    success: boolean;
    skipped?: boolean;
    reason?: string;
    keywordCount?: number;
    candidateCount?: number;
    injectedCount?: number;
}

interface RankedSummaryCandidate_ACU {
    chunk: ChatSummaryVectorIndexChunk_ACU;
    row: ChatSummaryVectorIndexRow_ACU;
    score: number;
    rerankScore?: number;
}

let lastRuntimeSignature_ACU = '';
let lastRuntimeAt_ACU = 0;
const SUMMARY_VECTOR_INDEX_RUNTIME_DEDUPE_MS_ACU = 8000;

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function buildRecentContext_ACU(pairCount: number): string {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) return '';
    const limit = Math.max(2, Math.min(chat.length, Math.max(1, pairCount) * 2 + 2));
    return chat.slice(Math.max(0, chat.length - limit))
        .map((message: any) => {
            const role = message?.is_user ? '用户' : 'AI';
            const text = normalizeText_ACU(message?.mes).replace(/<[^>]+>/g, '').trim();
            return text ? `${role}: ${text}` : '';
        })
        .filter(Boolean)
        .join('\n');
}

function renderKeywordPromptMessages_ACU(segments: any[], variables: { recentContext: string; userInput: string }): any[] {
    return (Array.isArray(segments) ? segments : [])
        .map((segment) => ({
            role: ['system', 'assistant', 'user'].includes(String(segment?.role || '').toLowerCase())
                ? String(segment.role).toLowerCase()
                : 'user',
            content: normalizeText_ACU(segment?.content)
                .replace(/\$RECENT_CONTEXT/g, variables.recentContext)
                .replace(/\$USER_INPUT/g, variables.userInput),
        }))
        .filter((segment) => segment.content);
}

function extractTaggedContent_ACU(text: string, tagName: string): string {
    const source = String(text || '');
    const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = source.match(pattern);
    return match ? String(match[1] || '').trim() : '';
}

function stripThinkingBlocks_ACU(text: string): string {
    return String(text || '')
        .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<thought[^>]*>[\s\S]*?<\/thought>/gi, '')
        .replace(/<\/?(?:thinking|thought)[^>]*>/gi, '')
        .trim();
}

function parseKeywords_ACU(text: string): string[] {
    const normalized = normalizeText_ACU(text);
    const explicitKeywords = extractTaggedContent_ACU(normalized, 'keywords');
    let keywordText = explicitKeywords || stripThinkingBlocks_ACU(normalized);
    const keywordMarkerMatch = keywordText.match(/(?:关键词|檢索詞|检索词)\s*[:：]/g);
    if (keywordMarkerMatch && keywordMarkerMatch.length > 0) {
        const marker = keywordMarkerMatch[keywordMarkerMatch.length - 1];
        keywordText = keywordText.slice(keywordText.lastIndexOf(marker) + marker.length);
    }

    return Array.from(new Set(keywordText
        .replace(/<[^>]+>/g, '')
        .split(/[，,、\n;；|]/g)
        .map((item) => item.replace(/^[-*\d.、\s]+/, '').replace(/^(关键词|檢索詞|检索词)\s*[:：]/, '').trim())
        .filter((item) => item.length > 0)
        .slice(0, 24)));
}

async function generateKeywords_ACU(config: any, userInput: string): Promise<string[]> {
    const recentContext = buildRecentContext_ACU(config.keywordContextPairCount || 1);
    const messages = renderKeywordPromptMessages_ACU(config.keywordPromptGroup || [], { recentContext, userInput });
    if (messages.length === 0) return [];
    const attempts = Math.max(1, Number(config.keywordGenerationMaxAttempts) || 1);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await callAIWithPreset_ACU(messages, config.keywordApiPreset || '');
            const keywords = parseKeywords_ACU(response || '');
            if (keywords.length > 0) return keywords;
        } catch (error) {
            logWarn_ACU(`[交火模式纪要索引] 关键词生成失败 ${attempt}/${attempts}:`, error);
        }
    }
    return [];
}

function cosineSimilarity_ACU(left: number[], right: number[]): number {
    const length = Math.min(left.length, right.length);
    if (length <= 0) return 0;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < length; index += 1) {
        const a = Number(left[index]) || 0;
        const b = Number(right[index]) || 0;
        dot += a * b;
        leftNorm += a * a;
        rightNorm += b * b;
    }
    if (leftNorm <= 0 || rightNorm <= 0) return 0;
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

async function rerankCandidates_ACU(config: any, query: string, candidates: RankedSummaryCandidate_ACU[]): Promise<RankedSummaryCandidate_ACU[]> {
    const endpoint = normalizeText_ACU(config.rerankEndpoint);
    const model = normalizeText_ACU(config.rerankModel);
    if (!endpoint || !model || candidates.length === 0) return candidates;
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const apiKey = normalizeText_ACU(config.rerankApiKey);
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                query,
                documents: candidates.map((candidate) => candidate.chunk.text),
            }),
        });
        if (!response.ok) throw new Error(await response.text().catch(() => response.statusText));
        const payload = await response.json();
        const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
        const byIndex = new Map<number, number>();
        results.forEach((item: any, fallbackIndex: number) => {
            const index = Number.isInteger(item?.index) ? Number(item.index) : Number.isInteger(item?.document_index) ? Number(item.document_index) : fallbackIndex;
            const score = Number(item?.relevance_score ?? item?.score ?? item?.rerank_score);
            if (Number.isFinite(index) && Number.isFinite(score)) byIndex.set(index, score);
        });
        return candidates
            .map((candidate, index) => ({ ...candidate, rerankScore: byIndex.get(index) ?? candidate.score }))
            .sort((left, right) => (right.rerankScore ?? right.score) - (left.rerankScore ?? left.score));
    } catch (error) {
        logWarn_ACU('[交火模式纪要索引] Rerank 失败，回退到 Embedding 排序:', error);
        return candidates;
    }
}

function escapeMarkdownTableCell_ACU(value: any): string {
    return normalizeText_ACU(value)
        .replace(/\r?\n+/g, '<br>')
        .replace(/\|/g, '\\|');
}

function buildSummaryIndexOverwriteContent_ACU(candidates: RankedSummaryCandidate_ACU[]): string {
    const selectedRows = (Array.isArray(candidates) ? candidates : [])
        .map((candidate) => candidate.row)
        .filter((row): row is ChatSummaryVectorIndexRow_ACU => !!row)
        .sort((left, right) => (Number(left.rowOrder) || 0) - (Number(right.rowOrder) || 0));

    const lines = [
        '# 纪要索引',
        '',
        '| 时间 | 地点 | 概要 | 编码索引 |',
        '|---|---|---|---|',
    ];

    selectedRows.forEach((row) => {
        lines.push(`| ${escapeMarkdownTableCell_ACU(row.timeSpan)} | ${escapeMarkdownTableCell_ACU(row.location)} | ${escapeMarkdownTableCell_ACU(row.summary)} | ${escapeMarkdownTableCell_ACU(row.indexCode)} |`);
    });

    if (selectedRows.length === 0) {
        lines.push('|  |  | （无命中纪要） |  |');
    }

    return lines.join('\n');
}

async function upsertOriginalSummaryIndexEntry_ACU(content: string): Promise<void> {
    if (!isWorldbookApiAvailable_ACU()) return;
    const targetLorebook = await getInjectionTargetLorebook_ACU();
    if (!targetLorebook) return;

    const worldbookConfig = getCurrentWorldbookConfig_ACU();
    const comment = `${getIsolationPrefix_ACU()}TavernDB-ACU-CustomExport-纪要索引`;
    const entries = await getLorebookEntries_ACU(targetLorebook);
    const existing = entries.find((entry: any) => entry?.comment === comment);
    const enabled = existing?.enabled ?? (worldbookConfig?.zeroTkOccupyMode !== true);
    const nextEntry = {
        ...(existing || {}),
        comment,
        content,
        keys: Array.isArray(existing?.keys) ? existing.keys : [],
        enabled,
        type: 'constant',
        order: Number.isFinite(Number(existing?.order)) ? Number(existing.order) : 10000,
        prevent_recursion: true,
    };

    if (existing?.uid != null) {
        await setLorebookEntries_ACU(targetLorebook, [{ ...nextEntry, uid: existing.uid }]);
    } else {
        await createLorebookEntries_ACU(targetLorebook, [nextEntry]);
    }
}

export async function processSummaryVectorIndexBeforeGeneration_ACU(
    options: SummaryVectorIndexRuntimeOptions_ACU = {},
): Promise<SummaryVectorIndexRuntimeResult_ACU> {
    const worldbookConfig = getCurrentWorldbookConfig_ACU();
    const globalEnabled = globalMeta_ACU?.summaryVectorIndexModeGlobal === true;
    if (!globalEnabled) {
        logDebug_ACU(`[交火模式纪要索引] 全局开关未启用，跳过发送前处理。worldbookProjection=${worldbookConfig.summaryVectorIndexModeEnabled === true}`);
        return { success: false, skipped: true, reason: 'summary_vector_index_disabled' };
    }
    const userInput = normalizeText_ACU(options.userInput);
    if (!userInput) return { success: false, skipped: true, reason: 'empty_user_input' };
    const signature = `${options.source || 'unknown'}:${userInput}`;
    if (signature === lastRuntimeSignature_ACU && Date.now() - lastRuntimeAt_ACU <= SUMMARY_VECTOR_INDEX_RUNTIME_DEDUPE_MS_ACU) {
        return { success: true, skipped: true, reason: 'deduped' };
    }
    lastRuntimeSignature_ACU = signature;
    lastRuntimeAt_ACU = Date.now();

    const config = getEffectiveSummaryVectorIndexConfig_ACU();
    const validation = validateSummaryVectorIndexConfig_ACU(config);
    if (!validation.valid) {
        logWarn_ACU('[交火模式纪要索引] 配置无效，跳过发送前注入:', validation.errors.join('; '));
        return { success: false, skipped: true, reason: 'invalid_config' };
    }

    const snapshot = getLatestSummaryVectorIndexSnapshotState_ACU();
    const state = snapshot?.summaryVectorIndexState || null;
    if (!state) {
        return { success: false, skipped: true, reason: 'no_index_state' };
    }
    const activeRowKeys = new Set(state.manifest?.snapshot?.activeRowKeys || []);
    const rows: ChatSummaryVectorIndexRow_ACU[] = Array.isArray(state.rows)
        ? state.rows.filter((row: ChatSummaryVectorIndexRow_ACU) => row.status !== 'removed' && (activeRowKeys.size === 0 || activeRowKeys.has(row.rowKey)))
        : [];
    if (rows.length < config.summaryIndexKeywordMinRows) {
        return { success: false, skipped: true, reason: 'below_min_rows' };
    }
    let chunks: ChatSummaryVectorIndexChunk_ACU[] = Array.isArray(state.chunks) ? state.chunks : [];
    if (state.manifest) {
        chunks = await loadSummaryVectorIndexChunksFromManifest_ACU(state.manifest);
    }
    if (chunks.length === 0) {
        return { success: false, skipped: true, reason: 'no_chunks' };
    }

    const rowByKey = new Map(rows.map((row) => [row.rowKey, row]));
    const keywords = await generateKeywords_ACU(config, userInput);
    const queryText = [userInput, keywords.join('，')].filter(Boolean).join('\n关键词：');
    const embeddings = await createEmbeddings_ACU({
        endpoint: config.embeddingEndpoint,
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel,
        input: [queryText],
    });
    const queryVector = embeddings[0]?.embedding || [];
    if (queryVector.length === 0) {
        return { success: false, skipped: true, reason: 'empty_query_embedding' };
    }

    const candidates = chunks
        .map((chunk): RankedSummaryCandidate_ACU | null => {
            const row = rowByKey.get(chunk.rowKey);
            if (!row || !Array.isArray(chunk.vector) || chunk.vector.length === 0) return null;
            const score = cosineSimilarity_ACU(queryVector, chunk.vector);
            if (score < config.summaryIndexMinScore) return null;
            return { chunk, row, score };
        })
        .filter((candidate): candidate is RankedSummaryCandidate_ACU => !!candidate)
        .sort((left, right) => right.score - left.score)
        .slice(0, config.summaryIndexCandidateLimit);

    if (candidates.length === 0) {
        return { success: false, skipped: true, reason: 'no_candidates', keywordCount: keywords.length };
    }

    const reranked = await rerankCandidates_ACU(config, queryText, candidates);
    const selectedByRow = new Map<string, RankedSummaryCandidate_ACU>();
    for (const candidate of reranked) {
        if (!selectedByRow.has(candidate.row.rowKey)) selectedByRow.set(candidate.row.rowKey, candidate);
        if (selectedByRow.size >= config.topK) break;
    }
    const selected = Array.from(selectedByRow.values())
        .sort((left, right) => (Number(left.row.rowOrder) || 0) - (Number(right.row.rowOrder) || 0));
    if (selected.length === 0) {
        return { success: false, skipped: true, reason: 'no_selected_rows', keywordCount: keywords.length, candidateCount: candidates.length };
    }

    const content = buildSummaryIndexOverwriteContent_ACU(selected);
    await upsertOriginalSummaryIndexEntry_ACU(content);
    logDebug_ACU(`[交火模式纪要索引] 已覆盖原概要索引条目：${selected.length} 条纪要候选，关键词 ${keywords.length} 个，输出顺序按纪要表原 rowOrder。`);
    return { success: true, keywordCount: keywords.length, candidateCount: candidates.length, injectedCount: selected.length };
}
