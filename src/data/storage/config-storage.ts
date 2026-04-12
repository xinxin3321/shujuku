/**
 * data/storage/config-storage.ts — 统一配置存储门面
 *
 * 对应初版设计 plans/three_layer_refactor_plan.md §3.1 的 config-storage.js。
 * 提供统一的配置存储接口，封装自动降级策略：
 *   酒馆设置 → IndexedDB 缓存 → localStorage（如未禁用）
 *
 * 实际实现在 tavern-storage.ts 的 getConfigStorage_ACU 中。
 * 本文件作为门面层，为未来解耦提供接口稳定性。
 */

import { logError_ACU } from '../../shared/utils';
import { normalizeIsolationCode_ACU, getProfileSettingsKey_ACU } from '../constants';
import { globalMeta_ACU, saveGlobalMeta_ACU, sanitizeSettingsForProfileSave_ACU } from '../repositories/profile-repo';
import { addDataIsolationHistory_ACU, normalizeDataIsolationHistory_ACU } from '../repositories/isolation-repo';

import { getConfigStorage_ACU } from './tavern-storage';
import { migrateKeyToTavernStorageIfNeeded_ACU } from './tavern-storage';


export { getConfigStorage_ACU } from './tavern-storage';
export { migrateKeyToTavernStorageIfNeeded_ACU } from './tavern-storage';

/**
 * 纯数据层的 settings 持久化（不含 UI 通知）
 * @param settingsObj 要持久化的 settings 对象（由调用方传入）
 */
export function persistSettingsToStorage_ACU(settingsObj?: any) {
    try {
        if (!settingsObj) return;
        const store = getConfigStorage_ACU();
        const code = normalizeIsolationCode_ACU(settingsObj?.dataIsolationCode || globalMeta_ACU?.activeIsolationCode || '');
        if (globalMeta_ACU && typeof globalMeta_ACU === 'object') {
            globalMeta_ACU.activeIsolationCode = code;
            if (code) addDataIsolationHistory_ACU(code, { save: false });
            normalizeDataIsolationHistory_ACU(globalMeta_ACU.isolationCodeList);
            saveGlobalMeta_ACU();
        }
        const payloadObj = sanitizeSettingsForProfileSave_ACU(settingsObj);
        payloadObj.dataIsolationCode = code;
        const payload = JSON.stringify(payloadObj);
        store.setItem(getProfileSettingsKey_ACU(code), payload);
    } catch (error) {
        logError_ACU('Failed to persist settings to storage:', error);
    }
}
