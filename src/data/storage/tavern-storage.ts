/**
 * 酒馆设置存储桥接（Tavern Settings Bridge）
 *
 * 负责在 SillyTavern 的 extensionSettings 中读写脚本设置。
 */

import { topLevelWindow_ACU, FORBID_BROWSER_LOCAL_STORAGE_FOR_CONFIG_ACU, ALLOW_LEGACY_LOCALSTORAGE_MIGRATION_ACU, legacyLocalStorage_ACU, storage_ACU } from '../../shared/env';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

// ── 常量 ──
import { idbRequestToPromise_ACU, isIndexedDbAvailable_ACU } from './idb-import-temp';

export const USE_TAVERN_SETTINGS_STORAGE_ACU = true;
export const TAVERN_SETTINGS_NAMESPACE_ACU = `${SCRIPT_ID_PREFIX_ACU}__userscript_settings_v1`;
export let tavernSaveSettingsFn_ACU: any = null;
export let tavernExtensionSettingsRoot_ACU: any = null;
export const TAVERN_BRIDGE_GLOBAL_KEY_ACU = '__ACU_USERSCRIPT_BRIDGE__';
export const TAVERN_BRIDGE_INJECTED_FLAG_ACU = '__ACU_USERSCRIPT_BRIDGE_INJECTED__';
export const sleep_ACU = (ms: number) => new Promise(r => setTimeout(r, ms));
export let tavernBridgeErrorReported_ACU = false;

// ── 桥接函数 ──
export function tryReadBridgeFromTop_ACU(): boolean {
    try {
        const bridge = (topLevelWindow_ACU as any)?.[TAVERN_BRIDGE_GLOBAL_KEY_ACU];
        if (bridge && typeof bridge === 'object') {
            if (bridge.error && !tavernBridgeErrorReported_ACU) {
                tavernBridgeErrorReported_ACU = true;
                console.warn(`[${SCRIPT_ID_PREFIX_ACU}] Tavern bridge 初始化失败：`, bridge.error);
            }
            if (bridge.extension_settings && !tavernExtensionSettingsRoot_ACU) tavernExtensionSettingsRoot_ACU = bridge.extension_settings;
            if (!tavernSaveSettingsFn_ACU) tavernSaveSettingsFn_ACU = bridge.saveSettingsDebounced || bridge.saveSettings || null;
            return !!(tavernExtensionSettingsRoot_ACU);
        }
    } catch (e) { /* ignore */ }
    return false;
}

export async function injectTavernBridgeIntoTopWindow_ACU(): Promise<boolean> {
    try {
        if ((topLevelWindow_ACU as any)?.[TAVERN_BRIDGE_INJECTED_FLAG_ACU]) return true;
        (topLevelWindow_ACU as any)[TAVERN_BRIDGE_INJECTED_FLAG_ACU] = true;

        const doc = (topLevelWindow_ACU as any).document;
        if (!doc || !doc.createElement) return false;

        const s = doc.createElement('script');
        s.type = 'module';
        s.textContent = `
            (async () => {
                try {
                    const ext = await import('/scripts/extensions.js');
                    const main = await import('/script.js');
                    window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'] = window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'] || {};
                    window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'].extension_settings = ext?.extension_settings || null;
                    window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'].saveSettingsDebounced = main?.saveSettingsDebounced || null;
                    window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'].saveSettings = main?.saveSettings || null;
                } catch (e) {
                    window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'] = window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'] || {};
                    window['${TAVERN_BRIDGE_GLOBAL_KEY_ACU}'].error = String(e && (e.message || e));
                }
            })();
        `;
        (doc.head || doc.documentElement || doc.body).appendChild(s);
        return true;
    } catch (e) {
        return false;
    }
}

export async function initTavernSettingsBridge_ACU(): Promise<boolean> {
    if (!USE_TAVERN_SETTINGS_STORAGE_ACU) return false;
    tryReadBridgeFromTop_ACU();
    try {
        if (typeof (topLevelWindow_ACU as any).saveSettingsDebounced === 'function') tavernSaveSettingsFn_ACU = (topLevelWindow_ACU as any).saveSettingsDebounced;
        else if (typeof (window as any).saveSettingsDebounced === 'function') tavernSaveSettingsFn_ACU = (window as any).saveSettingsDebounced;
        else if (typeof (topLevelWindow_ACU as any).saveSettings === 'function') tavernSaveSettingsFn_ACU = (topLevelWindow_ACU as any).saveSettings;
        else if (typeof (window as any).saveSettings === 'function') tavernSaveSettingsFn_ACU = (window as any).saveSettings;
    } catch (e) { /* ignore */ }

    tryReadBridgeFromTop_ACU();
    if (!tavernExtensionSettingsRoot_ACU) {
        await injectTavernBridgeIntoTopWindow_ACU();
        for (let i = 0; i < 40 && !tavernExtensionSettingsRoot_ACU; i++) {
            tryReadBridgeFromTop_ACU();
            if (tavernExtensionSettingsRoot_ACU) break;
            await sleep_ACU(50);
        }
    }

    try {
        const mod = await import('./script.js' as any);
        if (mod) {
            if (typeof mod.saveSettingsDebounced === 'function') tavernSaveSettingsFn_ACU = mod.saveSettingsDebounced;
            else if (typeof mod.saveSettings === 'function') tavernSaveSettingsFn_ACU = mod.saveSettings;
        }
    } catch (e) { /* ignore */ }
    try {
        const ext = await import('./scripts/extensions.js' as any);
        if (ext && ext.extension_settings) {
            tavernExtensionSettingsRoot_ACU = ext.extension_settings;
        }
    } catch (e) { /* ignore */ }
    return !!tavernExtensionSettingsRoot_ACU;
}

export function getTavernSettingsNamespace_ACU(): any {
    tryReadBridgeFromTop_ACU();
    const root = tavernExtensionSettingsRoot_ACU;
    if (!root) return null;
    if (!root.__userscripts) root.__userscripts = {};
    if (!root.__userscripts[TAVERN_SETTINGS_NAMESPACE_ACU]) root.__userscripts[TAVERN_SETTINGS_NAMESPACE_ACU] = {};
    return root.__userscripts[TAVERN_SETTINGS_NAMESPACE_ACU];
}

export function persistTavernSettings_ACU(): void {
    try {
        tryReadBridgeFromTop_ACU();
        if (typeof tavernSaveSettingsFn_ACU === 'function') {
            tavernSaveSettingsFn_ACU();
            return;
        }
        if (typeof (topLevelWindow_ACU as any).saveSettingsDebounced === 'function') { (topLevelWindow_ACU as any).saveSettingsDebounced(); return; }
        if (typeof (window as any).saveSettingsDebounced === 'function') { (window as any).saveSettingsDebounced(); return; }
        if (typeof (topLevelWindow_ACU as any).saveSettings === 'function') (topLevelWindow_ACU as any).saveSettings();
        else if (typeof (window as any).saveSettings === 'function') (window as any).saveSettings();
    } catch (e) {
        console.warn('[ACU] Failed to persist to Tavern settings. Falling back to in-memory only.', e);
    }
}

// ── IndexedDB 配置缓存 ──
export const CONFIG_IDB_DB_NAME_ACU = `${SCRIPT_ID_PREFIX_ACU}_config_v1`;
export const CONFIG_IDB_STORE_NAME_ACU = 'kv';
export let configIdbPromise_ACU: Promise<any> | null = null;
export const configIdbCache_ACU = new Map<string, any>();
export const configIdbDeletedKeys_ACU = new Set<string>();
export let configIdbCacheLoaded_ACU = false;
export let configIdbCacheLoadingPromise_ACU: Promise<void> | null = null;
export let configIdbCacheLoadFailed_ACU = false;
export let pendingSettingsReloadFromIdb_ACU = false;

export function openConfigDb_ACU(): Promise<any> {
    if (!isIndexedDbAvailable_ACU()) return Promise.resolve(null);
    if (configIdbPromise_ACU) return configIdbPromise_ACU;
    configIdbPromise_ACU = new Promise((resolve, reject) => {
        try {
            const req = (topLevelWindow_ACU as any).indexedDB.open(CONFIG_IDB_DB_NAME_ACU, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(CONFIG_IDB_STORE_NAME_ACU)) {
                    db.createObjectStore(CONFIG_IDB_STORE_NAME_ACU);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
        } catch (e) {
            reject(e);
        }
    });
    return configIdbPromise_ACU;
}

export function loadConfigIdbCache_ACU(): Promise<void> {
    if (configIdbCacheLoaded_ACU || configIdbCacheLoadFailed_ACU) return Promise.resolve();
    if (configIdbCacheLoadingPromise_ACU) return configIdbCacheLoadingPromise_ACU;
    if (!isIndexedDbAvailable_ACU()) {
        configIdbCacheLoaded_ACU = true;
        return Promise.resolve();
    }
    configIdbCacheLoadingPromise_ACU = new Promise(async (resolve) => {
        try {
            const db = await openConfigDb_ACU();
            if (!db) {
                configIdbCacheLoaded_ACU = true;
                resolve();
                return;
            }
            const tx = db.transaction(CONFIG_IDB_STORE_NAME_ACU, 'readonly');
            const store = tx.objectStore(CONFIG_IDB_STORE_NAME_ACU);
            const req = store.openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    const key = cursor.key as string;
                    if (!configIdbDeletedKeys_ACU.has(key) && !configIdbCache_ACU.has(key)) {
                        configIdbCache_ACU.set(key, cursor.value);
                    }
                    cursor.continue();
                } else {
                    configIdbCacheLoaded_ACU = true;
                    resolve();
                }
            };
            req.onerror = () => {
                console.warn('[ACU] IndexedDB config cache load failed:', req.error);
                configIdbCacheLoadFailed_ACU = true;
                configIdbCacheLoaded_ACU = true;
                resolve();
            };
        } catch (e) {
            console.warn('[ACU] IndexedDB config cache load failed:', e);
            configIdbCacheLoadFailed_ACU = true;
            configIdbCacheLoaded_ACU = true;
            resolve();
        }
    });
    return configIdbCacheLoadingPromise_ACU;
}

export function ensureConfigIdbCacheLoaded_ACU(): Promise<void> {
    return loadConfigIdbCache_ACU();
}

export function configIdbGetCached_ACU(key: string): any {
    return configIdbCache_ACU.has(key) ? configIdbCache_ACU.get(key) : null;
}

export async function configIdbSetCached_ACU(key: string, value: any): Promise<void> {
    configIdbCache_ACU.set(key, value);
    configIdbDeletedKeys_ACU.delete(key);
    try {
        if (!isIndexedDbAvailable_ACU()) return;
        const db = await openConfigDb_ACU();
        if (!db) return;
        const tx = db.transaction(CONFIG_IDB_STORE_NAME_ACU, 'readwrite');
        const store = tx.objectStore(CONFIG_IDB_STORE_NAME_ACU);
        await idbRequestToPromise_ACU(store.put(value, key));
    } catch (e) {
        console.warn('[ACU] IndexedDB config set failed:', e);
    }
}

export async function configIdbRemoveCached_ACU(key: string): Promise<void> {
    configIdbCache_ACU.delete(key);
    configIdbDeletedKeys_ACU.add(key);
    try {
        if (!isIndexedDbAvailable_ACU()) return;
        const db = await openConfigDb_ACU();
        if (!db) return;
        const tx = db.transaction(CONFIG_IDB_STORE_NAME_ACU, 'readwrite');
        const store = tx.objectStore(CONFIG_IDB_STORE_NAME_ACU);
        await idbRequestToPromise_ACU(store.delete(key));
    } catch (e) {
        console.warn('[ACU] IndexedDB config delete failed:', e);
    }
}

export function getConfigStorage_ACU(): any {
    const ns = USE_TAVERN_SETTINGS_STORAGE_ACU ? getTavernSettingsNamespace_ACU() : null;
    const hasTavern = !!ns;
    return {
        getItem: (key: string) => {
            if (hasTavern && Object.prototype.hasOwnProperty.call(ns, key)) return ns[key];
            const cached = configIdbGetCached_ACU(key);
            if (cached !== null && typeof cached !== 'undefined') return cached;
            if (!FORBID_BROWSER_LOCAL_STORAGE_FOR_CONFIG_ACU && storage_ACU?.getItem) return storage_ACU.getItem(key);
            return null;
        },
        setItem: (key: string, value: any) => {
            const v = String(value);
            if (hasTavern) {
                ns[key] = v;
                persistTavernSettings_ACU();
            } else if (!FORBID_BROWSER_LOCAL_STORAGE_FOR_CONFIG_ACU && storage_ACU?.setItem) {
                storage_ACU.setItem(key, v);
            }
            void configIdbSetCached_ACU(key, v);
        },
        removeItem: (key: string) => {
            if (hasTavern) {
                delete ns[key];
                persistTavernSettings_ACU();
            } else if (!FORBID_BROWSER_LOCAL_STORAGE_FOR_CONFIG_ACU && storage_ACU?.removeItem) {
                storage_ACU.removeItem(key);
            }
            void configIdbRemoveCached_ACU(key);
        },
        _isTavern: hasTavern,
    };
}

export function migrateKeyToTavernStorageIfNeeded_ACU(key: string): boolean {
    const store = getConfigStorage_ACU();
    if (!store || !store._isTavern) return false;
    const cur = store.getItem(key);
    if (cur !== null && typeof cur !== 'undefined') return false;
    if (!ALLOW_LEGACY_LOCALSTORAGE_MIGRATION_ACU || !legacyLocalStorage_ACU) return false;
    const legacy = legacyLocalStorage_ACU.getItem(key);
    if (legacy !== null && typeof legacy !== 'undefined') {
        store.setItem(key, legacy);
        try { legacyLocalStorage_ACU.removeItem(key); } catch (e) { /* ignore */ }
        return true;
    }
    return false;
}

export function _set_pendingSettingsReloadFromIdb_ACU(v: any) { pendingSettingsReloadFromIdb_ACU = v; }