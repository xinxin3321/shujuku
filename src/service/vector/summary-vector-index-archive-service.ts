import {
    cloneIsolatedData_ACU,
    readIsolatedTagData_ACU,
    writeIsolatedTagData_ACU,
    writeMessageIdentity_ACU,
    writeLegacyCompatData_ACU,
} from '../../data/repositories/chat-message-data-repo';
import type {
    ChatSummaryVectorIndexChunk_ACU,
    ChatSummaryVectorIndexRow_ACU,
    ChatSummaryVectorIndexState_ACU,
} from '../../data/models/chat-message-data';
import { createEmbeddings_ACU } from '../../data/gateways/vector-embedding-gateway';
import { saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../runtime/state-manager';
import { getChatArray_ACU } from '../chat/chat-service';
import { getLatestAiMessageIndexFromChat_ACU } from '../table/table-history';
import {
    persistRemoteMemorySnapshotAnchorIfNeeded_ACU,
    resolveRemoteMemorySnapshotAnchor_ACU,
} from './remote-memory-snapshot-anchor';
import {
    getEffectiveSummaryVectorIndexConfig_ACU,
    validateSummaryVectorIndexConfig_ACU,
} from './vector-memory-config';
import {
    assignSummaryVectorIndexStateToTagData_ACU,
    getAggregatedSummaryVectorIndexSnapshot_ACU,
} from './summary-vector-index-state-service';
import { hashUserInput_ACU, isSummaryOrOutlineTable_ACU, logDebug_ACU, logWarn_ACU } from '../../shared/utils';

export interface SummaryVectorIndexArchiveResult_ACU {
    success: boolean;
    skipped: boolean;
    indexedRowCount: number;
    skippedRowCount: number;
    chunkCount: number;
    messageIndex?: number;
    summaryKey?: string;
    reason?: string;
    errors: string[];
}

interface SummaryTableSelection_ACU {
    summaryKey: string;
    table: any;
}

interface SummaryVectorArchivePreparedRow_ACU {
    rowKey: string;
    rowId: string;
    rowOrder: number;
    timeSpan: string;
    location: string;
    summary: string;
    indexCode: string;
    vectorSourceText: string;
    sourceFingerprint: string;
}

function buildResult_ACU(partial: Partial<SummaryVectorIndexArchiveResult_ACU> = {}): SummaryVectorIndexArchiveResult_ACU {
    return {
        success: false,
        skipped: false,
        indexedRowCount: 0,
        skippedRowCount: 0,
        chunkCount: 0,
        errors: [],
        ...partial,
    };
}

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function resolveColumnIndexByAliases_ACU(headerRow: any[], aliases: string[], fallbackIndex = -1): number {
    const normalizedAliases = aliases.map((item) => normalizeText_ACU(item).replace(/\s+/g, ''));
    const index = (Array.isArray(headerRow) ? headerRow : []).findIndex((header) => normalizedAliases.includes(normalizeText_ACU(header).replace(/\s+/g, '')));
    return index >= 0 ? index : fallbackIndex;
}

function buildStableSummaryRowKey_ACU(summaryKey: string, rowId: string, indexCode: string): string {
    const source = `${summaryKey}:${rowId}:${indexCode}`;
    return `summary-row:${hashUserInput_ACU(source)}`;
}

function buildPreparedRowFingerprint_ACU(row: SummaryVectorArchivePreparedRow_ACU): string {
    return hashUserInput_ACU([
        row.rowId,
        row.rowOrder,
        row.timeSpan,
        row.location,
        row.summary,
        row.indexCode,
        row.vectorSourceText,
    ].join('\n'));
}

function findSummaryTable_ACU(): SummaryTableSelection_ACU | null {
    if (!currentJsonTableData_ACU || typeof currentJsonTableData_ACU !== 'object') {
        return null;
    }

    const summaryKey = Object.keys(currentJsonTableData_ACU).find((key) => {
        const table = currentJsonTableData_ACU[key];
        return !!table?.name && isSummaryOrOutlineTable_ACU(String(table.name || ''));
    });

    if (!summaryKey) return null;
    const table = currentJsonTableData_ACU[summaryKey];
    if (!table || !Array.isArray(table.content)) return null;

    return {
        summaryKey,
        table,
    };
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

function chunkTextBySentenceCount_ACU(text: string, sentenceCount: number): string[] {
    const sentences = splitSentences_ACU(text);
    const normalizedSentenceCount = Math.max(1, Math.floor(Number(sentenceCount) || 2));
    const chunks: string[] = [];
    for (let index = 0; index < sentences.length; index += normalizedSentenceCount) {
        const chunkText = normalizeText_ACU(sentences.slice(index, index + normalizedSentenceCount).join(''));
        if (chunkText) chunks.push(chunkText);
    }
    return chunks;
}

function buildPreparedRows_ACU(table: any, summaryKey: string): {
    rows: SummaryVectorArchivePreparedRow_ACU[];
    skippedRowCount: number;
    error: string;
} {
    const content = Array.isArray(table?.content) ? table.content : [];
    const headerRow = Array.isArray(content[0]) ? content[0] : [];
    const timeSpanColIdx = resolveColumnIndexByAliases_ACU(headerRow, ['时间跨度', '时间', '阶段', '时段'], 0);
    const locationColIdx = resolveColumnIndexByAliases_ACU(headerRow, ['地点', '位置', '场景', '场所'], 1);
    const summaryColIdx = resolveColumnIndexByAliases_ACU(headerRow, ['概要', '概览', '概述', '摘要']);
    const indexColIdx = resolveColumnIndexByAliases_ACU(headerRow, ['编码索引']);
    if (summaryColIdx < 0) {
        return { rows: [], skippedRowCount: 0, error: '纪要表缺少概要列，无法构建纪要向量索引。' };
    }
    if (indexColIdx < 0) {
        return { rows: [], skippedRowCount: 0, error: '纪要表缺少编码索引列，无法构建纪要向量索引。' };
    }

    const dataRows = content.slice(1).filter((row: any) => Array.isArray(row));
    const preparedRows: SummaryVectorArchivePreparedRow_ACU[] = [];
    let skippedRowCount = 0;
    dataRows.forEach((row: any[], rowIndex: number) => {
        const rowId = normalizeText_ACU(row?.[0]) || String(rowIndex + 1);
        const timeSpan = timeSpanColIdx >= 0 ? normalizeText_ACU(row?.[timeSpanColIdx]) : '';
        const location = locationColIdx >= 0 ? normalizeText_ACU(row?.[locationColIdx]) : '';
        const summary = normalizeText_ACU(row?.[summaryColIdx]);
        const indexCode = normalizeText_ACU(row?.[indexColIdx]);
        const sourceParts: string[] = [];
        headerRow.forEach((header: any, colIndex: number) => {
            if (colIndex === 0 || colIndex === summaryColIdx || colIndex === indexColIdx) return;
            const headerText = normalizeText_ACU(header);
            const cellText = normalizeText_ACU(row?.[colIndex]);
            if (!headerText || !cellText) return;
            sourceParts.push(`${headerText}: ${cellText}`);
        });
        const vectorSourceText = normalizeText_ACU(sourceParts.join('\n'));
        if (!summary || !indexCode || !vectorSourceText) {
            skippedRowCount += 1;
            return;
        }
        const preparedRow: SummaryVectorArchivePreparedRow_ACU = {
            rowKey: buildStableSummaryRowKey_ACU(summaryKey, rowId, indexCode),
            rowId,
            rowOrder: rowIndex,
            timeSpan,
            location,
            summary,
            indexCode,
            vectorSourceText,
            sourceFingerprint: '',
        };
        preparedRow.sourceFingerprint = buildPreparedRowFingerprint_ACU(preparedRow);
        preparedRows.push(preparedRow);
    });

    return { rows: preparedRows, skippedRowCount, error: '' };
}

function resolveTargetMessageIndex_ACU(_preferredIndex?: number): number {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) {
        return -1;
    }

    return getLatestAiMessageIndexFromChat_ACU(chat);
}

function cloneSummaryVectorIndexState_ACU(state: ChatSummaryVectorIndexState_ACU | null | undefined): ChatSummaryVectorIndexState_ACU | null {
    if (!state) return null;
    try {
        return JSON.parse(JSON.stringify(state));
    } catch (_error) {
        return null;
    }
}

function getSummaryRowFingerprintFromStateRow_ACU(row: ChatSummaryVectorIndexRow_ACU): string {
    return hashUserInput_ACU([
        row.rowId,
        row.rowOrder,
        row.timeSpan,
        row.location,
        row.summary,
        row.indexCode,
        row.vectorSourceText,
    ].join('\n'));
}

function buildLayerStateWithRows_ACU(
    baseState: ChatSummaryVectorIndexState_ACU | null | undefined,
    rows: ChatSummaryVectorIndexRow_ACU[],
    chunks: ChatSummaryVectorIndexChunk_ACU[],
    options: {
        snapshotMessageId: string;
        sourceTableKey: string;
        sourceTableName: string;
        indexedAt: string;
        skippedRowCount?: number;
    },
): ChatSummaryVectorIndexState_ACU | null {
    const normalizedRows = (Array.isArray(rows) ? rows : [])
        .map((row) => ({
            ...row,
            chunkIds: Array.isArray(row.chunkIds) ? row.chunkIds.filter(Boolean) : [],
        }))
        .filter((row) => row.rowKey && row.rowId && row.summary && row.indexCode && row.chunkIds.length > 0)
        .sort((left, right) => left.rowOrder - right.rowOrder || left.rowKey.localeCompare(right.rowKey));
    const validRowKeys = new Set(normalizedRows.map((row) => row.rowKey));
    const validChunkIds = new Set(normalizedRows.flatMap((row) => row.chunkIds));
    const normalizedChunks = (Array.isArray(chunks) ? chunks : [])
        .filter((chunk) => chunk?.chunkId && chunk?.rowKey && validRowKeys.has(chunk.rowKey) && validChunkIds.has(chunk.chunkId))
        .map((chunk, index) => ({ ...chunk, sequence: index }));
    if (normalizedRows.length === 0 || normalizedChunks.length === 0) {
        return null;
    }
    return {
        schemaVersion: 1,
        snapshotMessageId: options.snapshotMessageId || baseState?.snapshotMessageId || '',
        sourceTableKey: options.sourceTableKey || baseState?.sourceTableKey || '',
        sourceTableName: options.sourceTableName || baseState?.sourceTableName || '纪要表',
        indexedAt: options.indexedAt || baseState?.indexedAt || new Date().toISOString(),
        rowCount: normalizedRows.length,
        chunkCount: normalizedChunks.length,
        skippedRowCount: Math.max(0, Math.floor(Number(options.skippedRowCount ?? baseState?.skippedRowCount ?? 0) || 0)),
        rows: normalizedRows,
        chunks: normalizedChunks,
    };
}

function buildExistingReusableRows_ACU(
    preparedRows: SummaryVectorArchivePreparedRow_ACU[],
    existingState: ChatSummaryVectorIndexState_ACU | null,
): { reusableRows: ChatSummaryVectorIndexRow_ACU[]; reusableChunks: ChatSummaryVectorIndexChunk_ACU[]; rowsNeedingEmbedding: SummaryVectorArchivePreparedRow_ACU[] } {
    const preparedByKey = new Map(preparedRows.map((row) => [row.rowKey, row]));
    const existingRows = Array.isArray(existingState?.rows) ? existingState!.rows : [];
    const existingChunks = Array.isArray(existingState?.chunks) ? existingState!.chunks : [];
    const existingChunksByRowKey = new Map<string, ChatSummaryVectorIndexChunk_ACU[]>();
    existingChunks.forEach((chunk) => {
        if (!chunk?.rowKey || !chunk?.chunkId || !Array.isArray(chunk.vector) || chunk.vector.length === 0) return;
        const list = existingChunksByRowKey.get(chunk.rowKey) || [];
        list.push({ ...chunk });
        existingChunksByRowKey.set(chunk.rowKey, list);
    });

    const reusableRows: ChatSummaryVectorIndexRow_ACU[] = [];
    const reusableChunks: ChatSummaryVectorIndexChunk_ACU[] = [];
    const reusableKeySet = new Set<string>();
    existingRows.forEach((existingRow) => {
        const prepared = preparedByKey.get(existingRow.rowKey);
        const chunks = existingChunksByRowKey.get(existingRow.rowKey) || [];
        const existingFingerprint = hashUserInput_ACU([
            existingRow.rowId,
            existingRow.rowOrder,
            existingRow.timeSpan,
            existingRow.location,
            existingRow.summary,
            existingRow.indexCode,
            existingRow.vectorSourceText,
        ].join('\n'));
        if (!prepared || chunks.length === 0 || existingFingerprint !== prepared.sourceFingerprint) {
            return;
        }
        const chunkIds = chunks.map((chunk) => chunk.chunkId).filter(Boolean);
        if (chunkIds.length === 0) return;
        reusableRows.push({
            rowKey: prepared.rowKey,
            rowId: prepared.rowId,
            rowOrder: prepared.rowOrder,
            timeSpan: prepared.timeSpan,
            location: prepared.location,
            summary: prepared.summary,
            indexCode: prepared.indexCode,
            vectorSourceText: prepared.vectorSourceText,
            chunkIds,
        });
        chunks.forEach((chunk) => reusableChunks.push({ ...chunk }));
        reusableKeySet.add(prepared.rowKey);
    });

    const rowsNeedingEmbedding = preparedRows.filter((row) => !reusableKeySet.has(row.rowKey));
    return { reusableRows, reusableChunks, rowsNeedingEmbedding };
}

async function buildChunksWithEmbeddings_ACU(
    rows: SummaryVectorArchivePreparedRow_ACU[],
    options: {
        snapshotMessageId: string;
        sentenceCount: number;
        embeddingEndpoint: string;
        embeddingApiKey: string;
        embeddingModel: string;
        existingSequenceBase?: number;
    },
): Promise<{ rows: ChatSummaryVectorIndexRow_ACU[]; chunks: ChatSummaryVectorIndexChunk_ACU[] }> {
    const sequenceBase = Math.max(0, Math.floor(Number(options.existingSequenceBase) || 0));
    const chunkSources: Array<{ chunkId: string; rowKey: string; rowIndex: number; text: string; sequence: number }> = [];
    rows.forEach((row, rowIndex) => {
        const rowChunkTexts = chunkTextBySentenceCount_ACU(row.vectorSourceText, options.sentenceCount);
        rowChunkTexts.forEach((text, chunkIndex) => {
            chunkSources.push({
                chunkId: `${row.rowKey}:chunk:${chunkIndex}`,
                rowKey: row.rowKey,
                rowIndex,
                text,
                sequence: sequenceBase + chunkSources.length,
            });
        });
    });

    if (chunkSources.length === 0) {
        return { rows: [], chunks: [] };
    }

    const embeddings = await createEmbeddings_ACU({
        endpoint: options.embeddingEndpoint,
        apiKey: options.embeddingApiKey,
        model: options.embeddingModel,
        input: chunkSources.map((item) => item.text),
    });

    const embeddingMap = new Map<number, number[]>();
    embeddings.forEach((item) => {
        if (Array.isArray(item.embedding) && item.embedding.length > 0) {
            embeddingMap.set(item.index, item.embedding);
        }
    });

    const chunks: ChatSummaryVectorIndexChunk_ACU[] = [];
    const rowChunkIds = new Map<string, string[]>();
    chunkSources.forEach((source, index) => {
        const vector = embeddingMap.get(index) || [];
        if (vector.length === 0) return;
        chunks.push({
            chunkId: source.chunkId,
            rowKey: source.rowKey,
            text: source.text,
            vector,
            sequence: source.sequence,
        });
        const ids = rowChunkIds.get(source.rowKey) || [];
        ids.push(source.chunkId);
        rowChunkIds.set(source.rowKey, ids);
    });

    const indexedRows: ChatSummaryVectorIndexRow_ACU[] = rows
        .map((row) => ({
            rowKey: row.rowKey,
            rowId: row.rowId,
            rowOrder: row.rowOrder,
            timeSpan: row.timeSpan,
            location: row.location,
            summary: row.summary,
            indexCode: row.indexCode,
            vectorSourceText: row.vectorSourceText,
            chunkIds: rowChunkIds.get(row.rowKey) || [],
        }))
        .filter((row) => row.chunkIds.length > 0);

    return { rows: indexedRows, chunks };
}

function buildFinalSummaryVectorIndexRowsAndChunks_ACU(
    rows: ChatSummaryVectorIndexRow_ACU[],
    chunks: ChatSummaryVectorIndexChunk_ACU[],
): { rows: ChatSummaryVectorIndexRow_ACU[]; chunks: ChatSummaryVectorIndexChunk_ACU[] } {
    const finalRows = (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.rowKey && Array.isArray(row.chunkIds) && row.chunkIds.length > 0)
        .sort((a, b) => a.rowOrder - b.rowOrder || a.rowKey.localeCompare(b.rowKey));
    const validRowChunkPairs = new Set<string>();
    finalRows.forEach((row) => {
        row.chunkIds.forEach((chunkId) => validRowChunkPairs.add(`${row.rowKey}:${chunkId}`));
    });
    const finalChunks = (Array.isArray(chunks) ? chunks : [])
        .filter((chunk) => chunk?.rowKey && chunk?.chunkId && validRowChunkPairs.has(`${chunk.rowKey}:${chunk.chunkId}`))
        .map((chunk, index) => ({ ...chunk, sequence: index }));
    return { rows: finalRows, chunks: finalChunks };
}

async function writeSummaryVectorIndexCheckpoint_ACU(options: {
    chat: any[];
    aggregatedSnapshot: ReturnType<typeof getAggregatedSummaryVectorIndexSnapshot_ACU>;
    preparedRows: SummaryVectorArchivePreparedRow_ACU[];
    finalRows: ChatSummaryVectorIndexRow_ACU[];
    finalChunks: ChatSummaryVectorIndexChunk_ACU[];
    targetMessageIndex: number;
    snapshotMessageId: string;
    sourceTableKey: string;
    sourceTableName: string;
    indexedAt: string;
    skippedRowCount: number;
}): Promise<void> {
    const preparedByKey = new Map(options.preparedRows.map((row) => [row.rowKey, row]));
    const rowsByKey = new Map(options.finalRows.map((row) => [row.rowKey, row]));
    const chunksByRowKey = new Map<string, ChatSummaryVectorIndexChunk_ACU[]>();
    options.finalChunks.forEach((chunk) => {
        const list = chunksByRowKey.get(chunk.rowKey) || [];
        list.push({ ...chunk });
        chunksByRowKey.set(chunk.rowKey, list);
    });
    const targetRowKeysByMessageIndex = new Map<number, Set<string>>();
    const touchedMessageIndexes = new Set<number>();

    options.finalRows.forEach((row) => {
        const owner = options.aggregatedSnapshot?.rowOwners.get(row.rowKey);
        const ownerStateRow = owner?.row;
        const preparedRow = preparedByKey.get(row.rowKey);
        const ownerFingerprint = ownerStateRow ? getSummaryRowFingerprintFromStateRow_ACU(ownerStateRow) : '';
        const isReusableAtOwner = !!preparedRow && !!owner && ownerFingerprint === preparedRow.sourceFingerprint;
        const writeMessageIndex = owner && isReusableAtOwner ? owner.messageIndex : (owner?.messageIndex ?? options.targetMessageIndex);
        const rowSet = targetRowKeysByMessageIndex.get(writeMessageIndex) || new Set<string>();
        rowSet.add(row.rowKey);
        targetRowKeysByMessageIndex.set(writeMessageIndex, rowSet);
        touchedMessageIndexes.add(writeMessageIndex);
    });

    (options.aggregatedSnapshot?.rowOwners || new Map()).forEach((owner, rowKey) => {
        if (!preparedByKey.has(rowKey)) {
            touchedMessageIndexes.add(owner.messageIndex);
        }
    });
    touchedMessageIndexes.add(options.targetMessageIndex);

    for (const messageIndex of Array.from(touchedMessageIndexes).sort((left, right) => left - right)) {
        const message = options.chat[messageIndex];
        if (!message || message.is_user) continue;
        const layer = options.aggregatedSnapshot?.layers.find((item) => item.messageIndex === messageIndex) || null;
        const layerState = cloneSummaryVectorIndexState_ACU(layer?.summaryVectorIndexState);
        const layerRows = Array.isArray(layerState?.rows) ? [...layerState.rows] : [];
        const layerChunks = Array.isArray(layerState?.chunks) ? [...layerState.chunks] : [];
        const keepRowKeys = new Set(layerRows.map((row) => row.rowKey).filter((rowKey) => preparedByKey.has(rowKey) && !rowsByKey.has(rowKey)));
        const assignedRowKeys = targetRowKeysByMessageIndex.get(messageIndex) || new Set<string>();
        assignedRowKeys.forEach((rowKey) => keepRowKeys.add(rowKey));

        const nextRows = Array.from(keepRowKeys)
            .map((rowKey) => rowsByKey.get(rowKey) || layerRows.find((row) => row.rowKey === rowKey) || null)
            .filter((row): row is ChatSummaryVectorIndexRow_ACU => !!row);
        const nextChunks: ChatSummaryVectorIndexChunk_ACU[] = [];
        nextRows.forEach((row) => {
            const sourceChunks = rowsByKey.has(row.rowKey)
                ? (chunksByRowKey.get(row.rowKey) || [])
                : layerChunks.filter((chunk) => row.chunkIds.includes(chunk.chunkId));
            sourceChunks.forEach((chunk) => nextChunks.push({ ...chunk }));
        });

        const snapshotForMessage = messageIndex === options.targetMessageIndex
            ? options.snapshotMessageId
            : (layerState?.snapshotMessageId || resolveRemoteMemorySnapshotAnchor_ACU(options.chat, messageIndex)?.anchor || options.snapshotMessageId);
        const nextState = buildLayerStateWithRows_ACU(layerState, nextRows, nextChunks, {
            snapshotMessageId: snapshotForMessage,
            sourceTableKey: options.sourceTableKey,
            sourceTableName: options.sourceTableName,
            indexedAt: options.indexedAt,
            skippedRowCount: messageIndex === options.targetMessageIndex ? options.skippedRowCount : layerState?.skippedRowCount,
        });
        const isolationKey = getCurrentIsolationKey_ACU();
        const existingTagData = readIsolatedTagData_ACU(message, isolationKey) || {
            independentData: {},
            modifiedKeys: [],
            updateGroupKeys: [],
        };
        const nextIsolatedData = cloneIsolatedData_ACU(message);
        const nextTagData = {
            independentData: existingTagData.independentData || {},
            modifiedKeys: Array.isArray(existingTagData.modifiedKeys) ? [...existingTagData.modifiedKeys] : [],
            updateGroupKeys: Array.isArray(existingTagData.updateGroupKeys) ? [...existingTagData.updateGroupKeys] : [],
            ...(existingTagData.vectorMemoryState ? { vectorMemoryState: existingTagData.vectorMemoryState } : {}),
            ...(existingTagData._acu_base_state ? { _acu_base_state: existingTagData._acu_base_state } : {}),
        } as any;
        assignSummaryVectorIndexStateToTagData_ACU(nextTagData, nextState);
        nextIsolatedData[isolationKey] = nextTagData;
        message.TavernDB_ACU_IsolatedData = nextIsolatedData;
        writeIsolatedTagData_ACU(message, isolationKey, nextTagData);
        const anchorForMessage = resolveRemoteMemorySnapshotAnchor_ACU(options.chat, messageIndex);
        if (anchorForMessage?.anchor) {
            persistRemoteMemorySnapshotAnchorIfNeeded_ACU(message, anchorForMessage);
        }
        writeMessageIdentity_ACU(message, {
            enabled: settings_ACU.dataIsolationEnabled,
            code: settings_ACU.dataIsolationCode,
        });
        writeLegacyCompatData_ACU(
            message,
            nextTagData.independentData || {},
            nextTagData.modifiedKeys || [],
            nextTagData.updateGroupKeys || [],
        );
    }

    await saveChatToHost_ACU();
}

export async function archiveSummaryVectorIndexNow_ACU(options: { targetMessageIndex?: number } = {}): Promise<SummaryVectorIndexArchiveResult_ACU> {
    const config = getEffectiveSummaryVectorIndexConfig_ACU();
    const validation = validateSummaryVectorIndexConfig_ACU(config);
    if (!validation.valid) {
        return buildResult_ACU({
            success: false,
            reason: 'summary_vector_index_config_invalid',
            errors: validation.errors,
        });
    }

    const selectedSummary = findSummaryTable_ACU();
    if (!selectedSummary) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            reason: 'summary_table_not_found',
        });
    }

    const targetMessageIndex = resolveTargetMessageIndex_ACU(options.targetMessageIndex);
    if (targetMessageIndex < 0) {
        return buildResult_ACU({
            success: false,
            reason: 'target_message_not_found',
            errors: ['未找到可写入纪要向量索引的 AI 楼层。'],
        });
    }

    const chat = getChatArray_ACU();
    const targetMessage = chat[targetMessageIndex];
    if (!targetMessage || targetMessage.is_user) {
        return buildResult_ACU({
            success: false,
            reason: 'target_message_invalid',
            errors: ['目标楼层不是可写入的 AI 消息。'],
        });
    }

    const snapshotAnchor = resolveRemoteMemorySnapshotAnchor_ACU(chat, targetMessageIndex);
    if (!snapshotAnchor?.anchor) {
        return buildResult_ACU({
            success: false,
            reason: 'snapshot_anchor_unresolved',
            errors: ['目标楼层缺少可用的本地聊天记录锚点，无法写入纪要向量索引。'],
        });
    }
    const snapshotMessageId = snapshotAnchor.anchor;

    const prepared = buildPreparedRows_ACU(selectedSummary.table, selectedSummary.summaryKey);
    if (prepared.error) {
        return buildResult_ACU({
            success: false,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            reason: 'summary_vector_index_prepare_failed',
            errors: [prepared.error],
        });
    }
    if (prepared.rows.length === 0) {
        return buildResult_ACU({
            success: true,
            skipped: true,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            skippedRowCount: prepared.skippedRowCount,
            reason: 'no_effective_rows',
        });
    }

    try {
        const aggregatedSnapshot = getAggregatedSummaryVectorIndexSnapshot_ACU();
        const existingState = cloneSummaryVectorIndexState_ACU(aggregatedSnapshot?.summaryVectorIndexState);
        const reusable = buildExistingReusableRows_ACU(prepared.rows, existingState);
        const reusableRowKeySet = new Set(reusable.reusableRows.map((row) => row.rowKey));
        const rowsNeedingEmbedding = prepared.rows.filter((row) => !reusableRowKeySet.has(row.rowKey));
        const indexedAt = new Date().toISOString();
        const sourceTableName = normalizeText_ACU(selectedSummary.table?.name) || '纪要表';
        const maxRowsPerBatch = Math.max(1, Math.floor(Number(config.summaryIndexArchiveMaxConcurrency) || 30));
        const embeddedRows: ChatSummaryVectorIndexRow_ACU[] = [];
        const embeddedChunks: ChatSummaryVectorIndexChunk_ACU[] = [];
        let checkpointResult = buildFinalSummaryVectorIndexRowsAndChunks_ACU(reusable.reusableRows, reusable.reusableChunks);

        if (rowsNeedingEmbedding.length === 0) {
            logDebug_ACU('[纪要向量索引] 当前纪要表未发现新增或变更条目，复用已有归档向量。');
        }

        for (let startIndex = 0; startIndex < rowsNeedingEmbedding.length; startIndex += maxRowsPerBatch) {
            const rowBatch = rowsNeedingEmbedding.slice(startIndex, startIndex + maxRowsPerBatch);
            if (rowBatch.length === 0) continue;
            const batchResult = await buildChunksWithEmbeddings_ACU(rowBatch, {
                snapshotMessageId,
                sentenceCount: config.summaryIndexChunkSentenceCount,
                embeddingEndpoint: config.embeddingEndpoint,
                embeddingApiKey: config.embeddingApiKey,
                embeddingModel: config.embeddingModel,
                existingSequenceBase: embeddedChunks.length,
            });
            embeddedRows.push(...batchResult.rows);
            embeddedChunks.push(...batchResult.chunks);
            checkpointResult = buildFinalSummaryVectorIndexRowsAndChunks_ACU(
                [...reusable.reusableRows, ...embeddedRows],
                [...reusable.reusableChunks, ...embeddedChunks],
            );
            if (checkpointResult.rows.length > 0 && checkpointResult.chunks.length > 0) {
                await writeSummaryVectorIndexCheckpoint_ACU({
                    chat,
                    aggregatedSnapshot,
                    preparedRows: prepared.rows,
                    finalRows: checkpointResult.rows,
                    finalChunks: checkpointResult.chunks,
                    targetMessageIndex,
                    snapshotMessageId,
                    sourceTableKey: selectedSummary.summaryKey,
                    sourceTableName,
                    indexedAt,
                    skippedRowCount: prepared.skippedRowCount,
                });
            }
        }

        const finalResult = buildFinalSummaryVectorIndexRowsAndChunks_ACU(
            [...reusable.reusableRows, ...embeddedRows],
            [...reusable.reusableChunks, ...embeddedChunks],
        );
        if (finalResult.rows.length === 0 || finalResult.chunks.length === 0) {
            return buildResult_ACU({
                success: false,
                summaryKey: selectedSummary.summaryKey,
                messageIndex: targetMessageIndex,
                reason: 'embedding_empty',
                errors: ['纪要向量索引 embedding 结果为空。'],
            });
        }

        if (rowsNeedingEmbedding.length === 0) {
            await writeSummaryVectorIndexCheckpoint_ACU({
                chat,
                aggregatedSnapshot,
                preparedRows: prepared.rows,
                finalRows: finalResult.rows,
                finalChunks: finalResult.chunks,
                targetMessageIndex,
                snapshotMessageId,
                sourceTableKey: selectedSummary.summaryKey,
                sourceTableName,
                indexedAt,
                skippedRowCount: prepared.skippedRowCount,
            });
        }

        return buildResult_ACU({
            success: true,
            skipped: false,
            indexedRowCount: finalResult.rows.length,
            skippedRowCount: prepared.skippedRowCount + (prepared.rows.length - finalResult.rows.length),
            chunkCount: finalResult.chunks.length,
            messageIndex: targetMessageIndex,
            summaryKey: selectedSummary.summaryKey,
            reason: 'archived_summary_vector_index',
        });
    } catch (error: any) {
        logWarn_ACU('[纪要向量索引] 归档失败，未修改纪要表原条目:', error);
        return buildResult_ACU({
            success: false,
            skipped: false,
            summaryKey: selectedSummary.summaryKey,
            messageIndex: targetMessageIndex,
            reason: 'summary_vector_index_archive_failed',
            errors: [normalizeText_ACU(error?.message) || '纪要向量索引归档失败'],
        });
    }
}

export function buildSummaryVectorIndexBatchId_ACU(state: ChatSummaryVectorIndexState_ACU): string {
    const source = `${state.snapshotMessageId}:${state.sourceTableKey}:${state.indexedAt}:${state.rowCount}:${state.chunkCount}`;
    return `summary-vector-index:${hashUserInput_ACU(source)}`;
}
