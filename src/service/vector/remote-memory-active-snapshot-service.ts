import {
    readIsolatedTagData_ACU,
} from '../../data/repositories/chat-message-data-repo';
import type { ChatVectorState_ACU, IsolationTagData_ACU } from '../../data/models/chat-message-data';
import { getChatArray_ACU } from '../chat/chat-service';
import { getCurrentIsolationKey_ACU } from '../runtime/state-manager';
import { getVectorStateFromTagData_ACU } from './vector-index-state-service';

export interface ActiveRemoteMemorySnapshot_ACU {
    messageIndex: number;
    message: any;
    isolationKey: string;
    tagData: IsolationTagData_ACU | null | undefined;
    vectorState: ChatVectorState_ACU;
}

export interface RemoteMemoryLayer_ACU extends ActiveRemoteMemorySnapshot_ACU {}

export interface RemoteMemoryBatchOwner_ACU {
    messageIndex: number;
    message: any;
    isolationKey: string;
    tagData: IsolationTagData_ACU | null | undefined;
}

export interface AggregatedRemoteMemorySnapshot_ACU extends ActiveRemoteMemorySnapshot_ACU {
    layers: RemoteMemoryLayer_ACU[];
    batchOwners: Map<string, RemoteMemoryBatchOwner_ACU>;
}

function collectRemoteMemoryLayers_ACU(): RemoteMemoryLayer_ACU[] {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) {
        return [];
    }

    const isolationKey = getCurrentIsolationKey_ACU();
    if (typeof isolationKey !== 'string') {
        return [];
    }

    const layers: RemoteMemoryLayer_ACU[] = [];
    for (let index = 0; index < chat.length; index += 1) {
        const message = chat[index];
        if (!message || message.is_user === true) {
            continue;
        }
        const tagData = readIsolatedTagData_ACU(message, isolationKey);
        const vectorState = getVectorStateFromTagData_ACU(tagData);
        if (!Array.isArray(vectorState.remoteMemoryBatches) || vectorState.remoteMemoryBatches.length === 0) {
            continue;
        }
        layers.push({
            messageIndex: index,
            message,
            isolationKey,
            tagData,
            vectorState,
        });
    }
    return layers;
}

export function getRemoteMemoryLayers_ACU(): RemoteMemoryLayer_ACU[] {
    return collectRemoteMemoryLayers_ACU();
}

export function getAggregatedRemoteMemorySnapshot_ACU(): AggregatedRemoteMemorySnapshot_ACU | null {
    const layers = collectRemoteMemoryLayers_ACU();
    if (layers.length === 0) {
        return null;
    }

    const batchesById = new Map<string, any>();
    const batchOwners = new Map<string, RemoteMemoryBatchOwner_ACU>();
    layers.forEach((layer) => {
        (Array.isArray(layer.vectorState.remoteMemoryBatches) ? layer.vectorState.remoteMemoryBatches : []).forEach((batch) => {
            const batchId = String(batch?.batchId || '').trim();
            if (!batchId) return;
            batchesById.set(batchId, JSON.parse(JSON.stringify(batch)));
            batchOwners.set(batchId, {
                messageIndex: layer.messageIndex,
                message: layer.message,
                isolationKey: layer.isolationKey,
                tagData: layer.tagData,
            });
        });
    });

    const remoteMemoryBatches = Array.from(batchesById.values()).sort((left, right) => {
        const timeLeft = left?.createdAt ? Date.parse(left.createdAt) : 0;
        const timeRight = right?.createdAt ? Date.parse(right.createdAt) : 0;
        if (timeLeft !== timeRight) return timeLeft - timeRight;
        return String(left?.batchId || '').localeCompare(String(right?.batchId || ''));
    });
    if (remoteMemoryBatches.length === 0) {
        return null;
    }

    const latestLayer = layers[layers.length - 1];
    const vectorState: ChatVectorState_ACU = {
        snapshotMessageId: latestLayer.vectorState.snapshotMessageId || layers[0].vectorState.snapshotMessageId || '',
        remoteMemoryBatches,
        lastIndexedAt: latestLayer.vectorState.lastIndexedAt,
        lastArchiveAt: latestLayer.vectorState.lastArchiveAt,
    };

    return {
        messageIndex: latestLayer.messageIndex,
        message: latestLayer.message,
        isolationKey: latestLayer.isolationKey,
        tagData: latestLayer.tagData,
        vectorState,
        layers,
        batchOwners,
    };
}

export function getActiveRemoteMemorySnapshot_ACU(): ActiveRemoteMemorySnapshot_ACU | null {
    const aggregated = getAggregatedRemoteMemorySnapshot_ACU();
    if (aggregated) {
        return {
            messageIndex: aggregated.messageIndex,
            message: aggregated.message,
            isolationKey: aggregated.isolationKey,
            tagData: aggregated.tagData,
            vectorState: aggregated.vectorState,
        };
    }
    return null;
}

