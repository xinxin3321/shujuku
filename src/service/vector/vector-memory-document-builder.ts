import { hashUserInput_ACU } from '../../shared/utils';

export type VectorMemoryChunkKind_ACU = 'overview';

export interface VectorMemoryChunkSource_ACU {
    chunkId: string;
    parentId: string;
    rowKey: string;
    sequence: number;
    kind: VectorMemoryChunkKind_ACU;
    text: string;
}

export interface VectorMemorySourceItem_ACU {
    parentId: string;
    rowKey: string;
    rowIndex: number;
    messageIndex: number;
    timeSpan: string;
    location: string;
    overview: string;
    content: string;
    contentHash: string;
    createdAt: string;
    chunks: VectorMemoryChunkSource_ACU[];
}

export interface VectorSummaryBuildContext_ACU {
    namespace: string;
    messageIndex: number;
    createdAt?: string;
    summaryChunkSentenceCount: number;
}

interface SummaryColumnIndexes_ACU {
    timeSpan: number;
    location: number;
    overview: number;
    indexCode: number;
    content: number;
}

const SUMMARY_HEADER_ALIASES_ACU = {
    timeSpan: ['时间跨度', '时间', '阶段', '时段'],
    location: ['地点', '位置', '场景', '场所'],
    overview: ['概览', '概要', '概述', '摘要'],
    indexCode: ['编码索引', '索引', '编号', '标签'],
    content: ['纪要内容', '纪要', '内容', '正文'],
} as const;

function normalizeCellText_ACU(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function normalizeHeaderText_ACU(value: any): string {
    return normalizeCellText_ACU(value).replace(/\s+/g, '');
}

function normalizePositiveInteger_ACU(value: any, fallbackValue: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
    return Math.max(1, Math.floor(parsed));
}

function findColumnIndex_ACU(headers: any[], aliases: readonly string[], fallbackIndex: number): number {
    const normalizedAliases = aliases.map(alias => normalizeHeaderText_ACU(alias));
    const matchedIndex = headers.findIndex((header) => normalizedAliases.includes(normalizeHeaderText_ACU(header)));
    return matchedIndex >= 0 ? matchedIndex : fallbackIndex;
}

export function resolveSummaryColumnIndexes_ACU(headerRow: any[] | null | undefined): SummaryColumnIndexes_ACU {
    const headers = Array.isArray(headerRow) ? headerRow.slice(1) : [];
    return {
        timeSpan: findColumnIndex_ACU(headers, SUMMARY_HEADER_ALIASES_ACU.timeSpan, 0),
        location: findColumnIndex_ACU(headers, SUMMARY_HEADER_ALIASES_ACU.location, 1),
        overview: findColumnIndex_ACU(headers, SUMMARY_HEADER_ALIASES_ACU.overview, 2),
        indexCode: findColumnIndex_ACU(headers, SUMMARY_HEADER_ALIASES_ACU.indexCode, 3),
        content: findColumnIndex_ACU(headers, SUMMARY_HEADER_ALIASES_ACU.content, 4),
    };
}

function readSummaryField_ACU(row: any[], fieldIndex: number): string {
    if (!Array.isArray(row)) return '';
    return normalizeCellText_ACU(row[fieldIndex + 1]);
}

function splitChineseSentences_ACU(text: string): string[] {
    const normalized = normalizeCellText_ACU(text);
    if (!normalized) return [];
    const matches = normalized.match(/[^。！？!?；;\n]+[。！？!?；;]?/g);
    const sentences = Array.isArray(matches)
        ? matches.map((part) => normalizeCellText_ACU(part)).filter(Boolean)
        : [normalized];
    return sentences.length > 0 ? sentences : [normalized];
}

function buildChunkText_ACU(timeSpan: string, location: string, body: string): string {
    return [
        `时间跨度: ${timeSpan || '未填写'}`,
        `地点: ${location || '未填写'}`,
        `概要: ${body || '未填写'}`,
    ].join('\n');
}

function buildOverviewChunks_ACU(parentId: string, rowKey: string, timeSpan: string, location: string, overview: string, sentenceLimit: number): VectorMemoryChunkSource_ACU[] {
    const sentences = splitChineseSentences_ACU(overview);
    if (sentences.length === 0) return [];

    const normalizedLimit = normalizePositiveInteger_ACU(sentenceLimit, 2);
    const chunks: VectorMemoryChunkSource_ACU[] = [];
    for (let index = 0; index < sentences.length; index += normalizedLimit) {
        const part = sentences.slice(index, index + normalizedLimit).join('');
        const text = buildChunkText_ACU(timeSpan, location, part);
        const chunkId = `${parentId}:overview:${chunks.length}`;
        chunks.push({
            chunkId,
            parentId,
            rowKey,
            sequence: chunks.length,
            kind: 'overview',
            text,
        });
    }
    return chunks;
}

export function buildVectorMemorySourceItem_ACU(
    row: any[],
    rowIndex: number,
    headerRow: any[] | null | undefined,
    context: VectorSummaryBuildContext_ACU,
): VectorMemorySourceItem_ACU | null {
    if (!Array.isArray(row) || row.length <= 1) return null;

    const columnIndexes = resolveSummaryColumnIndexes_ACU(headerRow);
    const timeSpan = readSummaryField_ACU(row, columnIndexes.timeSpan);
    const location = readSummaryField_ACU(row, columnIndexes.location);
    const overview = readSummaryField_ACU(row, columnIndexes.overview);
    const content = readSummaryField_ACU(row, columnIndexes.content);
    const createdAt = normalizeCellText_ACU(context.createdAt) || new Date().toISOString();
    const stableRowId = normalizeCellText_ACU(row[0]) || String(rowIndex + 1);
    const rowKey = `${context.messageIndex}:${stableRowId}`;
    const contentHash = hashUserInput_ACU([timeSpan, location, overview, content].join('\n'));
    if (!contentHash) {
        return null;
    }

    const parentId = `${context.namespace}:${rowKey}:${contentHash}`;
    const chunks = buildOverviewChunks_ACU(parentId, rowKey, timeSpan, location, overview, context.summaryChunkSentenceCount);
    if (chunks.length === 0) {
        return null;
    }

    return {
        parentId,
        rowKey,
        rowIndex,
        messageIndex: context.messageIndex,
        timeSpan,
        location,
        overview,
        content,
        contentHash,
        createdAt,
        chunks,
    };
}

export function buildVectorMemorySourceItems_ACU(
    rows: any[],
    headerRow: any[] | null | undefined,
    context: VectorSummaryBuildContext_ACU,
): VectorMemorySourceItem_ACU[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const items: VectorMemorySourceItem_ACU[] = [];

    rows.forEach((row, rowIndex) => {
        const item = buildVectorMemorySourceItem_ACU(row, rowIndex, headerRow, context);
        if (item) {
            items.push(item);
        }
    });

    return items;
}
