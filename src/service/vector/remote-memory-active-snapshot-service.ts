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

export function getActiveRemoteMemorySnapshot_ACU(): ActiveRemoteMemorySnapshot_ACU | null {
    const chat = getChatArray_ACU();
    if (!Array.isArray(chat) || chat.length === 0) {
        return null;
    }

    const isolationKey = getCurrentIsolationKey_ACU();
    if (typeof isolationKey !== 'string') {
        return null;
    }

    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!message || message.is_user === true) {
            continue;
        }
        const tagData = readIsolatedTagData_ACU(message, isolationKey);
        const vectorState = getVectorStateFromTagData_ACU(tagData);
        if (!Array.isArray(vectorState.remoteMemoryBatches) || vectorState.remoteMemoryBatches.length === 0) {
            continue;
        }
        return {
            messageIndex: index,
            message,
            isolationKey,
            tagData,
            vectorState,
        };
    }

    return null;
}

