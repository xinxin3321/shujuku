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
import { cloneScopedConfigData_ACU, getChatFirstLayerMessage_ACU } from '../../shared/utils';

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

/**
 * 从 chat[0] 读取作用域配置容器
 * @param chat SillyTavern 聊天数组
 * @returns 解析后的配置对象，或 null
 */
export function getChatScopedConfigContainer_ACU(chat: unknown[]): Record<string, unknown> | null {
    const first = getChatFirstLayerMessage_ACU(chat);
    if (!first) return null;
    const raw = (first as Record<string, unknown>)[CHAT_SCOPED_CONFIG_FIELD_ACU];
    if (!raw) return null;
    const obj = (typeof raw === 'string') ? safeJsonParse_ACU(raw, null) : raw;
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj as Record<string, unknown> : null;
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
    const first = getChatFirstLayerMessage_ACU(chat);
    if (!first) return null;
    const raw = (first as Record<string, unknown>)[CHAT_SHEET_GUIDE_FIELD_ACU];
    if (!raw) return null;
    const obj = (typeof raw === 'string') ? safeJsonParse_ACU(raw, null) : raw;
    return (obj && typeof obj === 'object') ? obj as Record<string, unknown> : null;
}
