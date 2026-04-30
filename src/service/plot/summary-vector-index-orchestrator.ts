import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { logWarn_ACU } from '../../shared/utils';
import {
    _set_currentSummaryVectorIndexRecall_ACU,
} from '../runtime/state-manager';
import {
    generateVectorRecallKeywords_ACU,
} from '../vector/vector-recall-keyword-service';
import {
    getEffectiveSummaryVectorIndexConfig_ACU,
    validateSummaryVectorIndexConfig_ACU,
} from '../vector/vector-memory-config';
import { getAggregatedSummaryVectorIndexSnapshot_ACU } from '../vector/summary-vector-index-state-service';
import {
    recallSummaryVectorIndex_ACU,
    SummaryVectorIndexRecallResult_ACU,
} from '../vector/summary-vector-index-recall-service';
import { buildRecentContextMessages_ACU, buildVectorRecallSignature_ACU } from './vector-recall-orchestrator';
import { refreshSummaryVectorIndexCustomExportEntry_ACU } from '../worldbook/injection-engine-custom';

const SUMMARY_VECTOR_INDEX_RECALL_MIN_ROWS_ACU = 100;

export interface SummaryVectorIndexOrchestrationResult_ACU {
    intercepted: boolean;
    handled: boolean;
    skipped: boolean;
    success: boolean;
    shouldProceed: boolean;
    signature: string;
    recallResult: SummaryVectorIndexRecallResult_ACU | null;
    completedBeforeContinuation: boolean;
    worldbookReady: boolean;
    blocking: boolean;
    blockStage: string;
    blockReason: string;
    recallQuery: string;
    usedKeywordFallback: boolean;
    errors: string[];
    warnings: string[];
}

function buildSummaryVectorIndexOrchestrationResult_ACU(
    partial: Partial<SummaryVectorIndexOrchestrationResult_ACU>,
): SummaryVectorIndexOrchestrationResult_ACU {
    return {
        intercepted: false,
        handled: false,
        skipped: false,
        success: false,
        shouldProceed: false,
        signature: '',
        recallResult: null,
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

function clearSummaryVectorIndexRecallOverride_ACU(): void {
    _set_currentSummaryVectorIndexRecall_ACU(null);
}

export async function orchestrateSummaryVectorIndexBeforeSend_ACU(
    userInput: any,
    options: {
        previousSignature?: string | null;
        force?: boolean;
        configInput?: any;
    } = {},
): Promise<SummaryVectorIndexOrchestrationResult_ACU> {
    const signature = buildVectorRecallSignature_ACU(userInput);
    const config = getEffectiveSummaryVectorIndexConfig_ACU(options.configInput);
    clearSummaryVectorIndexRecallOverride_ACU();

    if (!signature) {
        return buildSummaryVectorIndexOrchestrationResult_ACU({
            skipped: true,
            shouldProceed: true,
            signature,
        });
    }

    if (!options.force && options.previousSignature && options.previousSignature === signature) {
        return buildSummaryVectorIndexOrchestrationResult_ACU({
            skipped: true,
            shouldProceed: true,
            signature,
        });
    }

    try {
        const activeSnapshot = getAggregatedSummaryVectorIndexSnapshot_ACU();
        const state = activeSnapshot?.summaryVectorIndexState || null;
        const archivedRowCount = Array.isArray(state?.rows)
            ? state.rows.length
            : Number(state?.rowCount || 0);
        const archivedChunkCount = Array.isArray(state?.chunks)
            ? state.chunks.length
            : Number(state?.chunkCount || 0);
        if (!state || archivedRowCount < SUMMARY_VECTOR_INDEX_RECALL_MIN_ROWS_ACU || archivedChunkCount <= 0) {
            return buildSummaryVectorIndexOrchestrationResult_ACU({
                intercepted: true,
                skipped: true,
                success: true,
                signature,
                shouldProceed: true,
                warnings: [
                    `纪要向量索引归档不足 ${SUMMARY_VECTOR_INDEX_RECALL_MIN_ROWS_ACU} 条（当前 ${Math.max(0, archivedRowCount)} 条），已跳过发送前关键词生成、向量召回和世界书覆盖注入；自动归档仍会在填表保存后正常累积。`,
                ],
            });
        }

        const validation = validateSummaryVectorIndexConfig_ACU(config);
        if (!validation.valid) {
            return buildSummaryVectorIndexOrchestrationResult_ACU({
                intercepted: true,
                signature,
                blocking: true,
                blockStage: 'summary_vector_index_config_validation',
                blockReason: validation.errors[0] || '纪要向量索引配置无效，发送前预处理未执行。',
                errors: [...validation.errors],
                shouldProceed: false,
            });
        }

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

        if (!recallQuery || usedKeywordFallback) {
            const fallbackErrors = keywordErrors.length > 0
                ? keywordErrors
                : [!recallQuery ? '关键词生成结果为空' : '关键词生成回退到原始输入，无法保证纪要向量索引召回质量'];
            return buildSummaryVectorIndexOrchestrationResult_ACU({
                intercepted: true,
                signature,
                blocking: true,
                blockStage: 'summary_vector_index_keyword_generation',
                blockReason: fallbackErrors[0] || '纪要向量索引关键词生成失败。',
                recallQuery,
                usedKeywordFallback,
                errors: fallbackErrors,
                shouldProceed: false,
            });
        }

        const combinedRecallQuery = buildCombinedRecallQuery_ACU(signature, recallQuery);
        if (!combinedRecallQuery) {
            return buildSummaryVectorIndexOrchestrationResult_ACU({
                intercepted: true,
                signature,
                blocking: true,
                blockStage: 'summary_vector_index_keyword_generation',
                blockReason: '纪要向量索引联合召回查询为空。',
                recallQuery,
                usedKeywordFallback,
                errors: ['纪要向量索引联合召回查询为空'],
                shouldProceed: false,
            });
        }

        const recallResult = await recallSummaryVectorIndex_ACU(combinedRecallQuery, state, config);
        const recallErrors = Array.isArray(recallResult?.errors) ? [...recallResult.errors] : [];
        const recallWarnings = Array.isArray(recallResult?.warnings) ? [...recallResult.warnings] : [];
        const errors = [...keywordErrors, ...recallErrors];
        const warnings = [...recallWarnings];
        if (recallErrors.length > 0) {
            return buildSummaryVectorIndexOrchestrationResult_ACU({
                intercepted: true,
                signature,
                recallResult,
                blocking: true,
                blockStage: 'summary_vector_index_recall',
                blockReason: recallErrors[0] || '纪要向量索引召回失败。',
                recallQuery: combinedRecallQuery,
                usedKeywordFallback,
                errors,
                warnings,
                shouldProceed: false,
            });
        }

        _set_currentSummaryVectorIndexRecall_ACU({
            mode: 'summary_vector_index',
            signature,
            recallQuery: combinedRecallQuery,
            snapshotMessageId: state.snapshotMessageId,
            sourceTableKey: state.sourceTableKey,
            sourceTableName: state.sourceTableName,
            indexedAt: state.indexedAt,
            matches: recallResult.matches,
            rows: recallResult.matches.map((match) => match.row),
            isEmpty: recallResult.matches.length === 0,
            at: Date.now(),
        });

        const customExportUpdated = await refreshSummaryVectorIndexCustomExportEntry_ACU();
        if (!customExportUpdated) {
            warnings.push('纪要向量索引召回已完成，但 CustomExport 纪要索引世界书条目未被覆盖；请确认该条目已由世界书/表格同步创建。');
        }

        return buildSummaryVectorIndexOrchestrationResult_ACU({
            intercepted: true,
            handled: true,
            success: true,
            shouldProceed: true,
            signature,
            recallResult,
            completedBeforeContinuation: true,
            worldbookReady: true,
            recallQuery: combinedRecallQuery,
            usedKeywordFallback,
            errors,
            warnings,
        });
    } catch (error) {
        clearSummaryVectorIndexRecallOverride_ACU();
        logWarn_ACU('[纪要向量索引] 发送前召回编排失败:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return buildSummaryVectorIndexOrchestrationResult_ACU({
            intercepted: true,
            signature,
            blocking: true,
            blockStage: 'summary_vector_index_orchestration_exception',
            blockReason: errorMessage,
            errors: [errorMessage],
            shouldProceed: false,
        });
    }
}
