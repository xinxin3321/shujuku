import { readLocalMessageAnchor_ACU, writeLocalMessageAnchor_ACU } from '../../data/repositories/chat-message-data-repo';
import { currentChatFileIdentifier_ACU } from '../runtime/state-manager';
import { getVectorMemoryNamespace_ACU } from './vector-memory-config';

export interface RemoteMemorySnapshotAnchorResolution_ACU {
    anchor: string;
    realMessageId: string;
    localAnchor: string;
    usedLocalAnchor: boolean;
    needsPersist: boolean;
    targetMessageIndex: number;
    aiFloor: number;
}

function normalizeText_ACU(value: any): string {
    return String(value ?? '').trim();
}

function sanitizeSegment_ACU(value: any, fallback: string): string {
    const normalized = normalizeText_ACU(value)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

function hashText_ACU(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
}

function countAiMessagesToIndex_ACU(chat: any[], targetMessageIndex: number): number {
    if (!Array.isArray(chat) || targetMessageIndex < 0) {
        return 0;
    }

    let count = 0;
    for (let index = 0; index <= targetMessageIndex && index < chat.length; index += 1) {
        if (chat[index] && !chat[index].is_user) {
            count += 1;
        }
    }
    return count;
}

function buildDeterministicLocalAnchor_ACU(chat: any[], targetMessageIndex: number): string {
    const targetMessage = Array.isArray(chat) ? chat[targetMessageIndex] : null;
    const aiFloor = Math.max(1, countAiMessagesToIndex_ACU(chat, targetMessageIndex));
    const namespace = sanitizeSegment_ACU(
        getVectorMemoryNamespace_ACU(currentChatFileIdentifier_ACU || undefined),
        'chat',
    );
    const swipeId = Number.isFinite(Number(targetMessage?.swipe_id))
        ? Math.max(0, Math.floor(Number(targetMessage.swipe_id)))
        : 0;
    const messageName = normalizeText_ACU(targetMessage?.name).slice(0, 80);
    const messageSnippet = normalizeText_ACU(targetMessage?.mes)
        .replace(/\s+/g, ' ')
        .slice(0, 160);
    const signature = hashText_ACU([
        namespace,
        String(aiFloor),
        String(targetMessageIndex),
        String(swipeId),
        messageName,
        messageSnippet,
    ].join('|'));

    return `acu-local-msg:${namespace}:floor:${aiFloor}:idx:${targetMessageIndex}:swipe:${swipeId}:sig:${signature}`;
}

export function resolveRemoteMemorySnapshotAnchor_ACU(
    chat: any[],
    targetMessageIndex: number,
): RemoteMemorySnapshotAnchorResolution_ACU | null {
    if (!Array.isArray(chat) || targetMessageIndex < 0 || targetMessageIndex >= chat.length) {
        return null;
    }

    const targetMessage = chat[targetMessageIndex];
    if (!targetMessage || targetMessage.is_user) {
        return null;
    }

    const realMessageId = normalizeText_ACU(targetMessage?.message_id);
    const existingLocalAnchor = readLocalMessageAnchor_ACU(targetMessage) || '';
    const aiFloor = Math.max(1, countAiMessagesToIndex_ACU(chat, targetMessageIndex));

    if (realMessageId) {
        return {
            anchor: realMessageId,
            realMessageId,
            localAnchor: existingLocalAnchor,
            usedLocalAnchor: false,
            needsPersist: false,
            targetMessageIndex,
            aiFloor,
        };
    }

    const localAnchor = existingLocalAnchor || buildDeterministicLocalAnchor_ACU(chat, targetMessageIndex);
    if (!localAnchor) {
        return null;
    }

    return {
        anchor: localAnchor,
        realMessageId: '',
        localAnchor,
        usedLocalAnchor: true,
        needsPersist: !existingLocalAnchor,
        targetMessageIndex,
        aiFloor,
    };
}

export function persistRemoteMemorySnapshotAnchorIfNeeded_ACU(
    targetMessage: any,
    resolution: RemoteMemorySnapshotAnchorResolution_ACU | null | undefined,
): void {
    if (!targetMessage || !resolution?.usedLocalAnchor || !resolution.localAnchor) {
        return;
    }
    writeLocalMessageAnchor_ACU(targetMessage, resolution.localAnchor);
}
