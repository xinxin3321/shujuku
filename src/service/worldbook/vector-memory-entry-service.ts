import {
    createLorebookEntries_ACU,
    getLorebookEntries_ACU,
    setLorebookEntries_ACU,
} from '../../data/gateways/worldbook-gateway';
import { logWarn_ACU } from '../../shared/utils';
import { applyPlacementToEntry_ACU, buildDefaultGlobalInjectionConfig_ACU } from './injection-engine-config';
import { getInjectionTargetLorebook_ACU, getIsolationPrefix_ACU } from './injection-engine-state';
import {
    getCurrentVectorMemoryConfig_ACU,
    normalizeVectorMemoryConfig_ACU,
    VectorMemoryConfig_ACU,
} from '../vector/vector-memory-config';
import type { ChatVectorRemoteMemoryBatch_ACU } from '../../data/models/chat-message-data';
import { VectorRecallMatch_ACU } from '../vector/vector-recall-service';

export interface VectorMemoryEntrySyncResult_ACU {
    skipped: boolean;
    updated: boolean;
    cleared: boolean;
    lorebookName: string | null;
    errors: string[];
}

function buildVectorEntryComment_ACU(config: VectorMemoryConfig_ACU): string {
    return `${getIsolationPrefix_ACU()}${config.entryComment}`;
}

function buildVectorEntryKeys_ACU(config: VectorMemoryConfig_ACU): string[] {
    const entryKey = String(config.entryKey || '').trim();
    return entryKey ? [entryKey] : [];
}

function normalizeCreatedAtTimestamp_ACU(value: any): number {
    const text = String(value || '').trim();
    if (!text) {
        return Number.NaN;
    }
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function compareChronologicalOrder_ACU(
    leftCreatedAt: any,
    rightCreatedAt: any,
    leftFallbackKey: any,
    rightFallbackKey: any,
    leftIndex: number,
    rightIndex: number,
): number {
    const leftTimestamp = normalizeCreatedAtTimestamp_ACU(leftCreatedAt);
    const rightTimestamp = normalizeCreatedAtTimestamp_ACU(rightCreatedAt);
    const leftHasTimestamp = Number.isFinite(leftTimestamp);
    const rightHasTimestamp = Number.isFinite(rightTimestamp);

    if (leftHasTimestamp && rightHasTimestamp && leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
    }
    if (leftHasTimestamp !== rightHasTimestamp) {
        return leftHasTimestamp ? -1 : 1;
    }

    const leftKey = String(leftFallbackKey || '').trim();
    const rightKey = String(rightFallbackKey || '').trim();
    if (leftKey && rightKey && leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey);
    }
    if (leftKey !== rightKey) {
        return leftKey ? -1 : 1;
    }

    return leftIndex - rightIndex;
}

function sortMatchesForMemoryEntry_ACU(matches: VectorRecallMatch_ACU[]): VectorRecallMatch_ACU[] {
    return matches
        .map((match, index) => ({ match, index }))
        .sort((left, right) => compareChronologicalOrder_ACU(
            left.match?.createdAt,
            right.match?.createdAt,
            left.match?.rowKey,
            right.match?.rowKey,
            left.index,
            right.index,
        ))
        .map((item) => item.match);
}

function sortBatchesForMemoryEntry_ACU(batches: ChatVectorRemoteMemoryBatch_ACU[]): ChatVectorRemoteMemoryBatch_ACU[] {
    return batches
        .map((batch, index) => ({ batch, index }))
        .sort((left, right) => compareChronologicalOrder_ACU(
            left.batch?.createdAt,
            right.batch?.createdAt,
            left.batch?.archivedRange?.firstRowKey || left.batch?.sourceRowKeys?.[0] || '',
            right.batch?.archivedRange?.firstRowKey || right.batch?.sourceRowKeys?.[0] || '',
            left.index,
            right.index,
        ))
        .map((item) => item.batch);
}

interface VectorMemoryEntryBlock_ACU {
    content: string;
    relevanceText: string;
}

function formatMemoryRelevanceText_ACU(score: any): string {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) {
        return '';
    }
    return numericScore.toFixed(4);
}

function buildChronologicalMemoryEntryContent_ACU(itemsInput: VectorMemoryEntryBlock_ACU[]): string {
    const items = itemsInput
        .map((item) => {
            const content = String(item?.content || '').trim();
            const relevanceText = String(item?.relevanceText || '').trim();
            if (!content) {
                return null;
            }
            return {
                content,
                relevanceText,
            };
        })
        .filter((item): item is VectorMemoryEntryBlock_ACU => !!item);
    if (items.length === 0) {
        return '';
    }

    const lines: string[] = ['<记忆召回>', '以下是过去已经发生过的事情：'];
    items.forEach((item, index) => {
        lines.push('');
        lines.push(item.relevanceText
            ? `#${index + 1} | 剧情关联度：${item.relevanceText}`
            : `#${index + 1} |`);
        lines.push(item.content);
    });
    lines.push('');
    lines.push('</记忆召回>');
    return lines.join('\n').trim();
}

function buildVectorEntryContentFromMatches_ACU(matches: VectorRecallMatch_ACU[]): string {
    if (!Array.isArray(matches) || matches.length === 0) {
        return '';
    }

    const orderedItems = sortMatchesForMemoryEntry_ACU(matches)
        .map((match) => {
            const content = String(match?.content || '').trim();
            if (!content) {
                return null;
            }
            return {
                content,
                relevanceText: formatMemoryRelevanceText_ACU(match?.score),
            };
        })
        .filter((item): item is VectorMemoryEntryBlock_ACU => !!item);
    return buildChronologicalMemoryEntryContent_ACU(orderedItems);
}

function buildVectorEntryContentFromState_ACU(batches: ChatVectorRemoteMemoryBatch_ACU[]): string {
    if (!Array.isArray(batches) || batches.length === 0) {
        return '';
    }

    const orderedItems = sortBatchesForMemoryEntry_ACU(batches)
        .map((batch) => {
            const content = String(batch?.summaryText || '').trim();
            if (!content) {
                return null;
            }
            return {
                content,
                relevanceText: '',
            };
        })
        .filter((item): item is VectorMemoryEntryBlock_ACU => !!item);
    return buildChronologicalMemoryEntryContent_ACU(orderedItems);
}

async function disableExistingVectorEntry_ACU(
    lorebookName: string,
    entry: any,
    config: VectorMemoryConfig_ACU,
): Promise<boolean> {
    const placement = buildDefaultGlobalInjectionConfig_ACU().readableEntryPlacement;
    const nextEntry = applyPlacementToEntry_ACU({
        uid: entry.uid,
        comment: buildVectorEntryComment_ACU(config),
        keys: buildVectorEntryKeys_ACU(config),
        content: '',
        enabled: false,
        type: 'constant',
        order: placement.order,
        prevent_recursion: true,
    }, placement);
    await setLorebookEntries_ACU(lorebookName, [nextEntry]);
    return true;
}

async function upsertVectorMemoryLorebookEntry_ACU(
    content: string,
    config: VectorMemoryConfig_ACU,
): Promise<VectorMemoryEntrySyncResult_ACU> {
    const lorebookName = await getInjectionTargetLorebook_ACU();
    if (!config.enabled) {
        return {
            skipped: true,
            updated: false,
            cleared: false,
            lorebookName,
            errors: [],
        };
    }

    if (!lorebookName) {
        return {
            skipped: true,
            updated: false,
            cleared: false,
            lorebookName: null,
            errors: ['未找到可用的目标世界书'],
        };
    }

    const comment = buildVectorEntryComment_ACU(config);
    const keys = buildVectorEntryKeys_ACU(config);
    const placement = buildDefaultGlobalInjectionConfig_ACU().readableEntryPlacement;

    try {
        const entries = await getLorebookEntries_ACU(lorebookName);
        const existingEntry = entries.find((entry: any) => entry?.comment === comment);

        if (!content) {
            if (!existingEntry) {
                return {
                    skipped: false,
                    updated: false,
                    cleared: false,
                    lorebookName,
                    errors: [],
                };
            }

            return {
                skipped: false,
                updated: false,
                cleared: await disableExistingVectorEntry_ACU(lorebookName, existingEntry, config),
                lorebookName,
                errors: [],
            };
        }

        if (existingEntry) {
            const nextEntry = applyPlacementToEntry_ACU({
                uid: existingEntry.uid,
                comment,
                keys,
                content,
                enabled: true,
                type: 'constant',
                order: placement.order,
                prevent_recursion: true,
            }, placement);
            await setLorebookEntries_ACU(lorebookName, [nextEntry]);
            return {
                skipped: false,
                updated: true,
                cleared: false,
                lorebookName,
                errors: [],
            };
        }

        const newEntry = applyPlacementToEntry_ACU({
            comment,
            keys,
            content,
            enabled: true,
            type: 'constant',
            order: placement.order,
            prevent_recursion: true,
        }, placement);
        await createLorebookEntries_ACU(lorebookName, [newEntry]);
        return {
            skipped: false,
            updated: true,
            cleared: false,
            lorebookName,
            errors: [],
        };
    } catch (error) {
        logWarn_ACU('[向量记忆] 同步世界书条目失败，已降级跳过:', error);
        return {
            skipped: true,
            updated: false,
            cleared: false,
            lorebookName,
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
}

export async function syncVectorMemoryLorebookEntry_ACU(
    matchesInput: VectorRecallMatch_ACU[],
    configInput?: any,
): Promise<VectorMemoryEntrySyncResult_ACU> {
    const config = normalizeVectorMemoryConfig_ACU(configInput ?? getCurrentVectorMemoryConfig_ACU());
    const matches = Array.isArray(matchesInput) ? matchesInput : [];
    const content = buildVectorEntryContentFromMatches_ACU(matches);
    return await upsertVectorMemoryLorebookEntry_ACU(content, config);
}

export async function syncVectorMemoryLorebookEntryFromState_ACU(
    batchesInput: ChatVectorRemoteMemoryBatch_ACU[],
    configInput?: any,
): Promise<VectorMemoryEntrySyncResult_ACU> {
    const config = normalizeVectorMemoryConfig_ACU(configInput ?? getCurrentVectorMemoryConfig_ACU());
    const batches = Array.isArray(batchesInput) ? batchesInput : [];
    const content = buildVectorEntryContentFromState_ACU(batches);
    return await upsertVectorMemoryLorebookEntry_ACU(content, config);
}
