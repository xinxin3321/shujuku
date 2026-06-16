/**
 * data/storage/chat-history.ts — 聊天消息自定义字段读写
 *
 * 从 src/core/04_shared_helpers.js 迁移而来。
 * 提供对聊天消息 chat[0] 上挂载的 TavernDB_ACU_* 自定义字段的底层 CRUD。
 * 纯数据层：不包含业务逻辑（作用域归一化/快照清洗等在 service/ 层）。
 */

// ── 字段名常量 ──

/** 聊天级作用域配置的字段名（挂载在 chat[0] 上） */
import { safeJsonParse_ACU } from '../../shared/json-helpers';
import { SillyTavern_API_ACU } from '../../shared/host-api';
import { cloneScopedConfigData_ACU } from '../../shared/utils';

export const CHAT_SCOPED_CONFIG_FIELD_ACU = 'TavernDB_ACU_ScopedConfig';

/** 聊天级作用域配置版本号 */
export const CHAT_SCOPED_CONFIG_VERSION_ACU = 1;

/** Sheet Guide（空白指导表）的字段名 */
export const CHAT_SHEET_GUIDE_FIELD_ACU = 'TavernDB_ACU_InternalSheetGuide';

/** Sheet Guide 版本号（v2 新增 seedRows） */
export const CHAT_SHEET_GUIDE_VERSION_ACU = 2;

/** 旧版"表头清单"字段名（兼容迁移用） */
export const LEGACY_CHAT_TABLE_HEADER_GUIDE_FIELD_ACU = 'TavernDB_ACU_TableHeaderGuide';

/** Sheet Guide 中 seedRows 子字段名 */
export const CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU = 'seedRows';

/** 聊天模板归档选项值前缀 */
export const CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU = '__acu_chat_archive__:';

/** 每个隔离标签下最大归档数 */
export const MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU = 8;

// ── 底层容器读取函数 ──

function getChatFirstLayerMessageLocal_ACU(chat: unknown[]): Record<string, unknown> | null {
    return Array.isArray(chat) && chat.length > 0 && chat[0] && typeof chat[0] === 'object'
        ? chat[0] as Record<string, unknown>
        : null;
}

function getChatMetadata_ACU(): Record<string, unknown> | null {
    const metadata = (SillyTavern_API_ACU as any)?.chatMetadata;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
}

function readContainer_ACU(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    const obj = (typeof raw === 'string') ? safeJsonParse_ACU(raw, null) : raw;
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj as Record<string, unknown> : null;
}

function writeChatMetadataField_ACU(field: string, value: Record<string, unknown> | null): void {
    const metadata = getChatMetadata_ACU();
    if (!metadata) return;
    if (value && Object.keys(value).length > 0) metadata[field] = value;
    else delete metadata[field];
    try {
        const updater = (SillyTavern_API_ACU as any)?.updateChatMetadata;
        if (typeof updater === 'function') updater({ [field]: value || undefined }, false);
    } catch (_) {}
}

/**
 * 从 chat_metadata 优先读取作用域配置容器；兼容旧版 chat[0] 字段。
 * @param chat SillyTavern 聊天数组
 * @returns 解析后的配置对象，或 null
 */
export function getChatScopedConfigContainer_ACU(chat: unknown[]): Record<string, unknown> | null {
    const metadataContainer = readContainer_ACU(getChatMetadata_ACU()?.[CHAT_SCOPED_CONFIG_FIELD_ACU]);
    if (metadataContainer) return metadataContainer;

    const first = getChatFirstLayerMessageLocal_ACU(chat);
    if (!first) return null;
    const legacyContainer = readContainer_ACU((first as Record<string, unknown>)[CHAT_SCOPED_CONFIG_FIELD_ACU]);
    if (legacyContainer) writeChatMetadataField_ACU(CHAT_SCOPED_CONFIG_FIELD_ACU, legacyContainer);
    return legacyContainer;
}

/**
 * 规范化作用域配置容器（确保 version 字段存在且合法）
 * @param container 原始容器对象
 * @returns 规范化后的容器对象
 */
export function normalizeChatScopedConfigContainer_ACU(container: unknown): Record<string, unknown> {
    const cloned = cloneScopedConfigData_ACU(container, {});
    const normalized: Record<string, unknown> = (cloned && typeof cloned === 'object' && !Array.isArray(cloned))
        ? cloned as Record<string, unknown>
        : {};
    const ver = normalized.version as number;
    normalized.version = Number.isFinite(ver)
        ? Math.max(CHAT_SCOPED_CONFIG_VERSION_ACU, Math.trunc(ver))
        : CHAT_SCOPED_CONFIG_VERSION_ACU;
    return normalized;
}

/**
 * 从 chat[0] 读取 Sheet Guide 容器
 * @param chat SillyTavern 聊天数组
 * @returns 解析后的 guide 对象，或 null
 */
export function getChatSheetGuideContainer_ACU(chat: unknown[]): Record<string, unknown> | null {
    const metadataContainer = readContainer_ACU(getChatMetadata_ACU()?.[CHAT_SHEET_GUIDE_FIELD_ACU]);
    if (metadataContainer) return metadataContainer;

    const first = getChatFirstLayerMessageLocal_ACU(chat);
    if (!first) return null;
    const legacyContainer = readContainer_ACU((first as Record<string, unknown>)[CHAT_SHEET_GUIDE_FIELD_ACU]);
    if (legacyContainer) writeChatMetadataField_ACU(CHAT_SHEET_GUIDE_FIELD_ACU, legacyContainer);
    return legacyContainer;
}

export function setChatScopedConfigContainer_ACU(chat: unknown[], container: Record<string, unknown> | null): void {
    writeChatMetadataField_ACU(CHAT_SCOPED_CONFIG_FIELD_ACU, container);
    const first = getChatFirstLayerMessageLocal_ACU(chat);
    if (!first) return;
    if (container && Object.keys(container).length > 0) {
        (first as Record<string, unknown>)[CHAT_SCOPED_CONFIG_FIELD_ACU] = container;
    } else {
        delete (first as Record<string, unknown>)[CHAT_SCOPED_CONFIG_FIELD_ACU];
    }
}

export function setChatSheetGuideContainer_ACU(chat: unknown[], container: Record<string, unknown> | null): void {
    writeChatMetadataField_ACU(CHAT_SHEET_GUIDE_FIELD_ACU, container);
    const first = getChatFirstLayerMessageLocal_ACU(chat);
    if (!first) return;
    if (container && Object.keys(container).length > 0) {
        (first as Record<string, unknown>)[CHAT_SHEET_GUIDE_FIELD_ACU] = container;
    } else {
        delete (first as Record<string, unknown>)[CHAT_SHEET_GUIDE_FIELD_ACU];
    }
}
