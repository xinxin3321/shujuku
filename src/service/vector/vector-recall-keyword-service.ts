import { callAIWithPreset_ACU } from '../ai/api-call';
import {
    getCurrentVectorMemoryConfig_ACU,
    VectorMemoryKeywordPromptSegment_ACU,
} from './vector-memory-config';
import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';

const VECTOR_RECALL_USER_INPUT_CHAR_LIMIT_ACU = 500;
const VECTOR_RECALL_KEYWORD_CHAR_LIMIT_ACU = 200;

export interface VectorRecallKeywordContextMessage_ACU {
    isUser: boolean;
    text: string;
}

export interface GenerateVectorRecallKeywordsInput_ACU {
    userInput: string;
    recentMessages?: VectorRecallKeywordContextMessage_ACU[] | null;
}

export interface VectorRecallKeywordGenerationResult_ACU {
    keywords: string;
    usedFallback: boolean;
    promptContext: string;
    errors: string[];
}

function normalizeText_ACU(value: any): string {
    return typeof value === 'string'
        ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
        : '';
}

function limitText_ACU(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(text.length - maxLength).trim();
}

function normalizeContextMessages_ACU(messages: any): VectorRecallKeywordContextMessage_ACU[] {
    if (!Array.isArray(messages)) {
        return [];
    }
    return messages
        .map((message) => {
            const text = normalizeText_ACU(message?.text);
            if (!text) {
                return null;
            }
            return {
                isUser: message?.isUser === true,
                text,
            };
        })
        .filter((message): message is VectorRecallKeywordContextMessage_ACU => !!message);
}

export function buildVectorRecallKeywordContext_ACU(messages: any): string {
    const normalizedMessages = normalizeContextMessages_ACU(messages);
    if (normalizedMessages.length === 0) {
        return '';
    }

    return normalizedMessages
        .map((message) => `${message.isUser ? '用户' : '助手'}：${message.text}`)
        .join('\n');
}

function buildKeywordPromptMessagesFromGroup_ACU(
    promptGroup: VectorMemoryKeywordPromptSegment_ACU[],
    userInput: string,
    promptContext: string,
): any[] {
    const validRoles = new Set(['system', 'assistant', 'user']);
    return JSON.parse(JSON.stringify(promptGroup)).map((segment: any) => {
        let content = typeof segment?.content === 'string' ? segment.content : '';
        content = content.replace(/\$RECENT_CONTEXT/g, promptContext || '（无）');
        content = content.replace(/\$USER_INPUT/g, userInput);
        const rawRole = typeof segment?.role === 'string' ? segment.role.toLowerCase().trim() : 'system';
        return {
            role: validRoles.has(rawRole) ? rawRole : 'system',
            content,
        };
    });
}

function sanitizeKeywordOutput_ACU(rawOutput: any): string {
    const normalized = normalizeText_ACU(rawOutput)
        .replace(/^```[a-zA-Z]*\n?/g, '')
        .replace(/```$/g, '')
        .replace(/^关键词[:：]\s*/i, '')
        .replace(/^检索词[:：]\s*/i, '')
        .replace(/^输出[:：]\s*/i, '')
        .replace(/[\n\t]+/g, '，')
        .replace(/[;；|/]+/g, '，')
        .replace(/[“”"'`]/g, '')
        .trim();

    if (!normalized) {
        return '';
    }

    const parts = normalized
        .split(/[，,、]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2)
        .filter((part, index, array) => array.indexOf(part) === index);

    if (parts.length === 0) {
        return '';
    }

    return limitText_ACU(parts.join('，'), VECTOR_RECALL_KEYWORD_CHAR_LIMIT_ACU);
}

export async function generateVectorRecallKeywords_ACU(
    input: GenerateVectorRecallKeywordsInput_ACU,
): Promise<VectorRecallKeywordGenerationResult_ACU> {
    const userInput = limitText_ACU(normalizeText_ACU(input?.userInput), VECTOR_RECALL_USER_INPUT_CHAR_LIMIT_ACU);
    const promptContext = buildVectorRecallKeywordContext_ACU(input?.recentMessages);

    if (!userInput) {
        return {
            keywords: '',
            usedFallback: true,
            promptContext,
            errors: [],
        };
    }

    const vectorConfig = getCurrentVectorMemoryConfig_ACU();
    const presetName = typeof vectorConfig.keywordApiPreset === 'string'
        ? vectorConfig.keywordApiPreset.trim()
        : '';
    const promptGroup = Array.isArray(vectorConfig.keywordPromptGroup) && vectorConfig.keywordPromptGroup.length > 0
        ? vectorConfig.keywordPromptGroup
        : [];

    try {
        const messages = promptGroup.length > 0
            ? buildKeywordPromptMessagesFromGroup_ACU(promptGroup, userInput, promptContext)
            : buildKeywordPromptMessagesFromGroup_ACU(
                [
                    { role: 'system', content: '你负责为向量记忆召回生成检索关键词。\n请输出 3 到 8 个简洁关键词或短语。\n禁止输出解释、句子、编号、前后缀说明。\n多个关键词请使用中文逗号分隔。', deletable: false },
                    { role: 'user', content: '最近上下文：\n$RECENT_CONTEXT\n\n当前用户输入：\n$USER_INPUT\n\n请仅输出关键词。', deletable: true },
                ],
                userInput,
                promptContext,
            );
        const rawOutput = await callAIWithPreset_ACU(messages, presetName);
        const keywords = sanitizeKeywordOutput_ACU(rawOutput);
        if (!keywords) {
            logWarn_ACU('[向量记忆] 关键词生成结果为空，回退原始用户输入');
            return {
                keywords: userInput,
                usedFallback: true,
                promptContext,
                errors: ['关键词生成结果为空'],
            };
        }

        logDebug_ACU('[向量记忆] 关键词生成完成', {
            presetName: presetName || '当前配置',
            usedFallback: false,
            keywords,
        });
        return {
            keywords,
            usedFallback: false,
            promptContext,
            errors: [],
        };
    } catch (error) {
        logWarn_ACU('[向量记忆] 关键词生成失败，回退原始用户输入:', error);
        return {
            keywords: userInput,
            usedFallback: true,
            promptContext,
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
}
