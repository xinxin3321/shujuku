import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { logWarn_ACU } from '../../shared/utils';
import { syncVectorMemoryLorebookEntry_ACU } from '../worldbook/vector-memory-entry-service';
import {
    generateVectorRecallKeywords_ACU,
    VectorRecallKeywordContextMessage_ACU,
} from '../vector/vector-recall-keyword-service';
import {
    getCurrentVectorMemoryConfig_ACU,
    normalizeVectorMemoryConfig_ACU,
    validateVectorMemoryConfig_ACU,
} from '../vector/vector-memory-config';
import { recallVectorMemory_ACU, VectorRecallResult_ACU } from '../vector/vector-recall-service';
import { getAggregatedRemoteMemorySnapshot_ACU } from '../vector/remote-memory-active-snapshot-service';

export interface VectorRecallOrchestrationResult_ACU {
    intercepted: boolean;
    handled: boolean;
    skipped: boolean;
    /** 严格 gate：全链路（关键词→召回→世界书同步）均成功 */
    success: boolean;
    /** 严格 gate：true = 允许放行继续生成，false = 必须阻断 */
    shouldProceed: boolean;
    signature: string;
    recallResult: VectorRecallResult_ACU | null;
    syncResult: {
        skipped: boolean;
        updated: boolean;
        cleared: boolean;
        lorebookName: string | null;
        errors: string[];
    } | null;
    completedBeforeContinuation: boolean;
    worldbookReady: boolean;
    blocking: boolean;
    blockStage: string;
    blockReason: string;
    recallQuery: string;
    /** 关键词生成是否回退到原始输入（AI 调用失败） */
    usedKeywordFallback: boolean;
    errors: string[];
    warnings: string[];
}

export function buildVectorRecallSignature_ACU(userInput: any): string {
    const text = typeof userInput === 'string' ? userInput.trim() : '';
    return text;
}

export function buildRecentContextMessages_ACU(chat: any[], anchorMessage: any, pairCount: number): VectorRecallKeywordContextMessage_ACU[] {
    if (!Array.isArray(chat) || chat.length === 0 || !anchorMessage || pairCount < 1) {
        return [];
    }

    const anchorIndex = chat.lastIndexOf(anchorMessage);
    if (anchorIndex < 0) {
        return [];
    }

    // Step 1: Find the N most recent AI messages from anchor backwards
    const aiIndices: number[] = [];
    for (let i = anchorIndex; i >= 0 && aiIndices.length < pairCount; i--) {
        const message = chat[i];
        if (message?.is_user === false) {
            const text = typeof message.mes === 'string'
                ? message.mes.trim()
                : typeof message.message === 'string'
                    ? message.message.trim()
                    : '';
            if (text) {
                aiIndices.push(i);
            }
        }
    }

    if (aiIndices.length === 0) {
        return [];
    }

    // Step 2: For each AI message, also include the user message immediately before it
    const includeIndices = new Set<number>();
    for (const aiIdx of aiIndices) {
        includeIndices.add(aiIdx);
        for (let j = aiIdx - 1; j >= 0; j--) {
            const msg = chat[j];
            if (msg?.is_user === true) {
                const text = typeof msg.mes === 'string'
                    ? msg.mes.trim()
                    : typeof msg.message === 'string'
                        ? msg.message.trim()
                        : '';
                if (text) {
                    includeIndices.add(j);
                }
                break;
            }
        }
    }

    // Step 3: Collect and sort chronologically
    const result: VectorRecallKeywordContextMessage_ACU[] = [];
    const sortedIndices = Array.from(includeIndices).sort((a, b) => a - b);
    for (const idx of sortedIndices) {
        const message = chat[idx];
        const text = typeof message.mes === 'string'
            ? message.mes.trim()
            : typeof message.message === 'string'
                ? message.message.trim()
                : '';
        if (text) {
            result.push({
                isUser: message.is_user === true,
                text,
            });
        }
    }

    return result;
}

function buildVectorRecallOrchestrationResult_ACU(
    partial: Partial<VectorRecallOrchestrationResult_ACU>,
): VectorRecallOrchestrationResult_ACU {
    return {
        intercepted: false,
        handled: false,
        skipped: false,
        success: false,
        shouldProceed: false,
        signature: '',
        recallResult: null,
        syncResult: null,
        completedBeforeContinuation: false,
        worldbookReady: false,
        blocking: false,
        blockStage: '',
        blockReason: '',
        recallQuery: '',
        usedKeywordFallback: false,
        errors: [],
        warnings: [],
        ...partial,
    };
}

function buildCombinedRecallQuery_ACU(userInput: string, generatedKeywords: string): string {
    const normalizedUserInput = typeof userInput === 'string' ? userInput.trim() : '';
    const normalizedKeywords = typeof generatedKeywords === 'string' ? generatedKeywords.trim() : '';
    const segments = [normalizedUserInput, normalizedKeywords]
        .filter((segment) => !!segment)
        .filter((segment, index, array) => array.indexOf(segment) === index);
    return segments.join('，');
}

function hasRecallableRemoteMemoryBatches_ACU(batches: any[]): boolean {
    return Array.isArray(batches) && batches.some((batch) => {
        const batchId = String(batch?.batchId || '').trim();
        const summaryText = String(batch?.summaryText || '').trim();
        const chunks = Array.isArray(batch?.chunks) ? batch.chunks : [];
        return !!batchId && !!summaryText && chunks.some((chunk: any) => {
            const text = String(chunk?.text || '').trim();
            const vector = Array.isArray(chunk?.vector) ? chunk.vector : [];
            return !!text && vector.some((value: any) => Number.isFinite(Number(value)));
        });
    });
}

export async function orchestrateVectorRecallBeforeSend_ACU(
    userInput: any,
    options: {
        previousSignature?: string | null;
        force?: boolean;
        configInput?: any;
    } = {},
): Promise<VectorRecallOrchestrationResult_ACU> {
    const signature = buildVectorRecallSignature_ACU(userInput);
    const config = normalizeVectorMemoryConfig_ACU(options.configInput ?? getCurrentVectorMemoryConfig_ACU());
    const validation = validateVectorMemoryConfig_ACU(config);

    // ── 向量功能未启用：放行 ──
    if (!config.enabled) {
        return buildVectorRecallOrchestrationResult_ACU({
            skipped: true,
            shouldProceed: true,
            signature,
        });
    }

    // ── 空输入：放行（无内容可召回） ──
    if (!signature) {
        return buildVectorRecallOrchestrationResult_ACU({
            skipped: true,
            shouldProceed: true,
            signature,
        });
    }

    // ── 配置校验失败：阻断 ──
    if (!validation.valid) {
        return buildVectorRecallOrchestrationResult_ACU({
            intercepted: true,
            signature,
            blocking: true,
            blockStage: 'config_validation',
            blockReason: validation.errors[0] || '向量记忆配置无效，发送前预处理未执行。',
            errors: [...validation.errors],
            shouldProceed: false,
        });
    }

    // ── 重复签名去重：上次已成功处理过相同输入，放行 ──
    if (!options.force && options.previousSignature && options.previousSignature === signature) {
        return buildVectorRecallOrchestrationResult_ACU({
            skipped: true,
            shouldProceed: true,
            signature,
        });
    }

    try {
        const activeSnapshot = getAggregatedRemoteMemorySnapshot_ACU();
        const remoteMemoryBatches = Array.isArray(activeSnapshot?.vectorState?.remoteMemoryBatches)
            ? activeSnapshot.vectorState.remoteMemoryBatches
            : [];

        if (!activeSnapshot || !hasRecallableRemoteMemoryBatches_ACU(remoteMemoryBatches)) {
            return buildVectorRecallOrchestrationResult_ACU({
                skipped: true,
                shouldProceed: true,
                signature,
                warnings: ['当前聊天没有可召回的向量归档数据，已跳过关键词生成。'],
            });
        }

        // ── 阶段1：关键词生成 ──
        const chat = getChatArray_ACU();
        const latestAiMessage = Array.isArray(chat)
            ? [...chat].reverse().find((message) => message && !message.is_user) || null
            : null;
        const recentMessages = latestAiMessage
            ? buildRecentContextMessages_ACU(chat, latestAiMessage, config.keywordContextPairCount)
            : [];
        const keywordResult = await generateVectorRecallKeywords_ACU({
            userInput: signature,
            recentMessages,
        });
        const keywordErrors = Array.isArray(keywordResult?.errors) ? [...keywordResult.errors] : [];
        const recallQuery = String(keywordResult?.keywords || '').trim();
        const usedKeywordFallback = keywordResult?.usedFallback === true;

        // 关键词生成失败或回退到原始输入：严格阻断
        if (!recallQuery || usedKeywordFallback) {
            const fallbackErrors = keywordErrors.length > 0
                ? keywordErrors
                : [!recallQuery ? '关键词生成结果为空' : '关键词生成回退到原始输入，无法保证召回质量'];
            return buildVectorRecallOrchestrationResult_ACU({
                intercepted: true,
                signature,
                blocking: true,
                blockStage: 'keyword_generation',
                blockReason: fallbackErrors[0] || '关键词生成失败。',
                recallQuery,
                usedKeywordFallback,
                errors: fallbackErrors,
                shouldProceed: false,
            });
        }

        const combinedRecallQuery = buildCombinedRecallQuery_ACU(signature, recallQuery);
        if (!combinedRecallQuery) {
            return buildVectorRecallOrchestrationResult_ACU({
                intercepted: true,
                signature,
                blocking: true,
                blockStage: 'keyword_generation',
                blockReason: '联合召回查询为空。',
                recallQuery,
                usedKeywordFallback,
                errors: ['联合召回查询为空'],
                shouldProceed: false,
            });
        }

        // ── 阶段2：向量召回 + 世界书同步 ──
        const recallResult = await recallVectorMemory_ACU(combinedRecallQuery, activeSnapshot.vectorState, config);
        const syncResult = await syncVectorMemoryLorebookEntry_ACU(recallResult.matches, config);
        const recallErrors = Array.isArray(recallResult?.errors) ? [...recallResult.errors] : [];
        const recallWarnings = Array.isArray(recallResult?.warnings) ? [...recallResult.warnings] : [];
        const syncErrors = Array.isArray(syncResult?.errors) ? [...syncResult.errors] : [];
        const worldbookReady = !!syncResult && syncResult.skipped !== true && syncErrors.length === 0;
        const errors = [...keywordErrors, ...recallErrors, ...syncErrors];
        const warnings = [...recallWarnings];
        if (recallErrors.length > 0 || !worldbookReady) {
            return buildVectorRecallOrchestrationResult_ACU({
                intercepted: true,
                signature,
                recallResult,
                syncResult,
                blocking: true,
                blockStage: recallErrors.length > 0 ? 'recall' : 'worldbook_sync',
                blockReason: recallErrors[0] || syncErrors[0] || '向量记忆发送前预处理未完成。',
                recallQuery: combinedRecallQuery,
                usedKeywordFallback,
                errors,
                warnings,
                shouldProceed: false,
            });
        }
        return buildVectorRecallOrchestrationResult_ACU({
            intercepted: true,
            handled: true,
            success: true,
            shouldProceed: true,
            signature,
            recallResult,
            syncResult,
            completedBeforeContinuation: true,
            worldbookReady: true,
            recallQuery: combinedRecallQuery,
            usedKeywordFallback,
            errors,
            warnings,
        });
    } catch (error) {
        logWarn_ACU('[向量记忆] 发送前召回编排失败，已转为严格失败:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return buildVectorRecallOrchestrationResult_ACU({
            intercepted: true,
            signature,
            blocking: true,
            blockStage: 'orchestration_exception',
            blockReason: errorMessage,
            errors: [errorMessage],
            shouldProceed: false,
        });
    }
}
