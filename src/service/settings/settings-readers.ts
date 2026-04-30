/**
 * service/settings/settings-readers.ts — 设置读取器（纯读取，无持久化副作用）
 *
 * 从 settings-service.ts 提取。这些函数只读取/规范化 settings 中的数据，
 * 不执行保存操作。其他子模块应优先从此文件 import，而非 settings-service.ts。
 */

import { currentChatFileIdentifier_ACU, settings_ACU } from '../runtime/state-manager';
import { globalMeta_ACU } from '../../data/repositories/profile-repo';
import { defaultWorldbookConfig_ACU } from '../../shared/defaults';
import { deepMerge_ACU, logDebug_ACU } from '../../shared/utils';

/**
 * 获取当前角色的专属设置。
 * 业务逻辑：读 settings → deep merge 默认值 → 写回（确保字段完整）。
 * 注意：此函数有"规范化写回"的副作用（补全缺失字段），但不触发持久化。
 */
export function getCurrentCharSettings_ACU() {
    const charId = currentChatFileIdentifier_ACU || 'default';
    if (!settings_ACU.characterSettings) {
        settings_ACU.characterSettings = {};
    }
    const globalSummaryVectorIndexEnabled =
        (typeof globalMeta_ACU?.summaryVectorIndexModeGlobal === 'boolean')
            ? (globalMeta_ACU.summaryVectorIndexModeGlobal === true)
            : (settings_ACU?.summaryVectorIndexModeDefault === true);
    const globalZeroTkEnabled = globalSummaryVectorIndexEnabled
        ? false
        : (typeof globalMeta_ACU?.zeroTkOccupyModeGlobal === 'boolean')
            ? (globalMeta_ACU.zeroTkOccupyModeGlobal === true)
            : (settings_ACU?.zeroTkOccupyModeDefault === true);
    if (!settings_ACU.characterSettings[charId]) {
        const worldbookConfigForNewChat = JSON.parse(JSON.stringify(defaultWorldbookConfig_ACU));
        // 0TK 与向量混合交火增强方案是全局互斥开关，不是聊天级配置。
        // 这里保留 worldbookConfig 字段只是为了兼容既有调用方读取。
        worldbookConfigForNewChat.summaryVectorIndexModeEnabled = globalSummaryVectorIndexEnabled;
        worldbookConfigForNewChat.zeroTkOccupyMode = globalZeroTkEnabled;
        worldbookConfigForNewChat.outlineEntryEnabled = globalSummaryVectorIndexEnabled ? true : !globalZeroTkEnabled;
        settings_ACU.characterSettings[charId] = {
            worldbookConfig: worldbookConfigForNewChat,
        };
        logDebug_ACU(`Created new character settings for: ${charId}`);
    }
    try {
        const existingCfg = settings_ACU.characterSettings[charId].worldbookConfig || {};
        const mergedCfg = deepMerge_ACU(
            JSON.parse(JSON.stringify(defaultWorldbookConfig_ACU)),
            existingCfg,
        );
        // 强制使用全局状态覆盖旧聊天残留字段，避免模式跟着对话走。
        mergedCfg.summaryVectorIndexModeEnabled = globalSummaryVectorIndexEnabled;
        mergedCfg.zeroTkOccupyMode = globalZeroTkEnabled;
        mergedCfg.outlineEntryEnabled = globalSummaryVectorIndexEnabled ? true : !globalZeroTkEnabled;
        // [向量记忆] vectorMemory 不再跟随世界书配置规范化，
        // 已迁移到 settings_ACU.vectorMemoryConfig（全局数据库级）。
        // 保留 mergedCfg.vectorMemory 的旧数据引用以兼容迁移读取。
        settings_ACU.characterSettings[charId].worldbookConfig = mergedCfg;
    } catch (e) {
        // ignore
    }
    return settings_ACU.characterSettings[charId];
}

/** 获取当前角色的世界书配置 */
export function getCurrentWorldbookConfig_ACU() {
    return getCurrentCharSettings_ACU().worldbookConfig;
}
