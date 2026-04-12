// ═══════════════════════════════════════════════════════════════
// data/repositories/character-settings-repo.ts — 角色专属设置辅助函数
// 从 02_storage_and_profile.js 行 4193~4236 迁入
// ═══════════════════════════════════════════════════════════════

import { logDebug_ACU, deepMerge_ACU } from '../../shared/utils';
import { defaultWorldbookConfig_ACU } from '../models/defaults';
import { globalMeta_ACU } from './profile-repo';
import { settings_ACU, currentChatFileIdentifier_ACU } from '../../service/runtime/state-manager';

export function getCurrentCharSettings_ACU() {
    const charId = currentChatFileIdentifier_ACU || 'default';
    if (!settings_ACU.characterSettings) {
        settings_ACU.characterSettings = {};
    }
    const globalZeroTkDefault =
        (typeof globalMeta_ACU?.zeroTkOccupyModeGlobal === 'boolean')
            ? (globalMeta_ACU.zeroTkOccupyModeGlobal === true)
            : (settings_ACU?.zeroTkOccupyModeDefault === true);
    if (!settings_ACU.characterSettings[charId]) {
        const worldbookConfigForNewChat = JSON.parse(JSON.stringify(defaultWorldbookConfig_ACU));
        worldbookConfigForNewChat.zeroTkOccupyMode = globalZeroTkDefault;
        worldbookConfigForNewChat.outlineEntryEnabled = !globalZeroTkDefault;
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
        mergedCfg.zeroTkOccupyMode = globalZeroTkDefault;
        mergedCfg.outlineEntryEnabled = !globalZeroTkDefault;
        settings_ACU.characterSettings[charId].worldbookConfig = mergedCfg;
    } catch (e) {
        // ignore
    }
    return settings_ACU.characterSettings[charId];
}

export function getCurrentWorldbookConfig_ACU() {
    return getCurrentCharSettings_ACU().worldbookConfig;
}
