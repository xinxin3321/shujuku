/**
 * presentation/bootstrap/api-groups/settings-config-api.ts
 * 设置与配置 API — 设置面板 + 更新配置参数 + 手动更新表选择 + API 预设管理
 */

import { logDebug_ACU, logError_ACU } from '../../../shared/utils';
import { settings_ACU, currentJsonTableData_ACU } from '../../../service/runtime/state-manager';
import { getSortedSheetKeys_ACU } from '../../../service/template/chat-scope';
import { openAutoCardPopup_ACU } from '../../pages/main-popup';
import { openNewVisualizer_ACU } from '../../pages/visualizer';
import { showToastr_ACU } from '../../theme/toast';
import { handleManualUpdate_ACU } from '../../triggers/update-process';
import { deleteApiPreset_ACU, loadApiPreset_ACU, saveApiPreset_ACU } from '../../triggers/settings-ui-sync';
import { saveSettingsAndNotify_ACU } from '../../components/settings-ui-helpers';
import type { ApiGroupContext } from './callback-api';

export function createSettingsConfigApi(_ctx: ApiGroupContext): Record<string, Function> {
    return {
        // 打开可视化编辑器
        openVisualizer: function() {
            if (typeof openNewVisualizer_ACU === 'function') {
                openNewVisualizer_ACU();
            } else {
                console.error('[ACU] openNewVisualizer_ACU is not defined inside closure.');
                showToastr_ACU('error', '可视化编辑器加载失败。');
            }
        },

        // 打开设置面板
        openSettings: async function() {
            try {
                return await openAutoCardPopup_ACU();
            } catch (e) {
                logError_ACU('openSettings failed:', e);
                return false;
            }
        },

        // 立即手动更新
        manualUpdate: async function() {
            try {
                return await handleManualUpdate_ACU();
            } catch (e) {
                logError_ACU('manualUpdate failed:', e);
                return false;
            }
        },

        // =========================
        // 更新配置参数读写 API
        // =========================

        getUpdateConfigParams: function() {
            try {
                return {
                    autoUpdateThreshold: settings_ACU.autoUpdateThreshold ?? 3,
                    autoUpdateFrequency: settings_ACU.autoUpdateFrequency ?? 1,
                    updateBatchSize: settings_ACU.updateBatchSize ?? 2,
                    autoUpdateTokenThreshold: settings_ACU.autoUpdateTokenThreshold ?? 0
                };
            } catch (e) {
                logError_ACU('getUpdateConfigParams failed:', e);
                return {
                    autoUpdateThreshold: 3,
                    autoUpdateFrequency: 1,
                    updateBatchSize: 2,
                    autoUpdateTokenThreshold: 0
                };
            }
        },

        setUpdateConfigParams: function(params: any) {
            try {
                if (!params || typeof params !== 'object') {
                    logError_ACU('setUpdateConfigParams: Invalid params');
                    return false;
                }

                if (typeof params.autoUpdateThreshold === 'number' && params.autoUpdateThreshold >= 0) {
                    settings_ACU.autoUpdateThreshold = Math.floor(params.autoUpdateThreshold);
                }
                if (typeof params.autoUpdateFrequency === 'number' && params.autoUpdateFrequency >= 1) {
                    settings_ACU.autoUpdateFrequency = Math.floor(params.autoUpdateFrequency);
                }
                if (typeof params.updateBatchSize === 'number' && params.updateBatchSize >= 1) {
                    settings_ACU.updateBatchSize = Math.floor(params.updateBatchSize);
                }
                if (typeof params.autoUpdateTokenThreshold === 'number' && params.autoUpdateTokenThreshold >= 0) {
                    settings_ACU.autoUpdateTokenThreshold = Math.floor(params.autoUpdateTokenThreshold);
                }

                saveSettingsAndNotify_ACU();
                logDebug_ACU('Update config params saved:', params);
                return true;
            } catch (e) {
                logError_ACU('setUpdateConfigParams failed:', e);
                return false;
            }
        },

        // =========================
        // 手动更新表选择读写 API
        // =========================

        getManualSelectedTables: function() {
            try {
                return {
                    selectedTables: Array.isArray(settings_ACU.manualSelectedTables)
                        ? [...settings_ACU.manualSelectedTables]
                        : [],
                    hasManualSelection: !!settings_ACU.hasManualSelection
                };
            } catch (e) {
                logError_ACU('getManualSelectedTables failed:', e);
                return { selectedTables: [], hasManualSelection: false };
            }
        },

        setManualSelectedTables: function(sheetKeys: string[]) {
            try {
                if (!Array.isArray(sheetKeys)) {
                    logError_ACU('setManualSelectedTables: sheetKeys must be an array');
                    return false;
                }

                const availableKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
                const validKeys = sheetKeys.filter(key => availableKeys.includes(key));

                settings_ACU.manualSelectedTables = validKeys;
                settings_ACU.hasManualSelection = true;
                saveSettingsAndNotify_ACU();

                logDebug_ACU('Manual selected tables updated:', validKeys);
                return true;
            } catch (e) {
                logError_ACU('setManualSelectedTables failed:', e);
                return false;
            }
        },

        clearManualSelectedTables: function() {
            try {
                settings_ACU.manualSelectedTables = [];
                settings_ACU.hasManualSelection = false;
                saveSettingsAndNotify_ACU();
                logDebug_ACU('Manual selected tables cleared');
                return true;
            } catch (e) {
                logError_ACU('clearManualSelectedTables failed:', e);
                return false;
            }
        },

        // =========================
        // API 预设管理 API
        // =========================

        getApiPresets: function() {
            try {
                const presets = settings_ACU.apiPresets || [];
                return JSON.parse(JSON.stringify(presets));
            } catch (e) {
                logError_ACU('getApiPresets failed:', e);
                return [];
            }
        },

        getTableApiPreset: function() {
            try {
                return settings_ACU.tableApiPreset || '';
            } catch (e) {
                logError_ACU('getTableApiPreset failed:', e);
                return '';
            }
        },

        setTableApiPreset: function(presetName: string) {
            try {
                if (presetName === '') {
                    settings_ACU.tableApiPreset = '';
                    saveSettingsAndNotify_ACU();
                    logDebug_ACU('Table API preset cleared (use current config)');
                    return true;
                }

                const presets = settings_ACU.apiPresets || [];
                const exists = presets.some((p: any) => p.name === presetName);
                if (!exists) {
                    logError_ACU(`setTableApiPreset: Preset "${presetName}" not found`);
                    return false;
                }

                settings_ACU.tableApiPreset = presetName;
                saveSettingsAndNotify_ACU();
                logDebug_ACU(`Table API preset set to: ${presetName}`);
                return true;
            } catch (e) {
                logError_ACU('setTableApiPreset failed:', e);
                return false;
            }
        },

        getPlotApiPreset: function() {
            try {
                return settings_ACU.plotApiPreset || '';
            } catch (e) {
                logError_ACU('getPlotApiPreset failed:', e);
                return '';
            }
        },

        setPlotApiPreset: function(presetName: string) {
            try {
                if (presetName === '') {
                    settings_ACU.plotApiPreset = '';
                    saveSettingsAndNotify_ACU();
                    logDebug_ACU('Plot API preset cleared (use current config)');
                    return true;
                }

                const presets = settings_ACU.apiPresets || [];
                const exists = presets.some((p: any) => p.name === presetName);
                if (!exists) {
                    logError_ACU(`setPlotApiPreset: Preset "${presetName}" not found`);
                    return false;
                }

                settings_ACU.plotApiPreset = presetName;
                saveSettingsAndNotify_ACU();
                logDebug_ACU(`Plot API preset set to: ${presetName}`);
                return true;
            } catch (e) {
                logError_ACU('setPlotApiPreset failed:', e);
                return false;
            }
        },

        saveApiPreset: function(presetData: any) {
            try {
                if (!presetData || typeof presetData !== 'object') {
                    logError_ACU('saveApiPreset: Invalid presetData');
                    return false;
                }
                if (!presetData.name || typeof presetData.name !== 'string') {
                    logError_ACU('saveApiPreset: preset name is required');
                    return false;
                }

                const newPreset = {
                    name: presetData.name.trim(),
                    apiMode: presetData.apiMode || 'custom',
                    apiConfig: presetData.apiConfig || {},
                    tavernProfile: presetData.tavernProfile || ''
                };

                saveApiPreset_ACU(newPreset.name);
                logDebug_ACU(`API preset saved: ${newPreset.name}`);
                return true;
            } catch (e) {
                logError_ACU('saveApiPreset failed:', e);
                return false;
            }
        },

        loadApiPreset: function(presetName: string) {
            try {
                if (!presetName || typeof presetName !== 'string') {
                    logError_ACU('loadApiPreset: preset name is required');
                    return false;
                }

                const result = loadApiPreset_ACU(presetName);
                if (result) {
                    logDebug_ACU(`API preset loaded: ${presetName}`);
                    return true;
                } else {
                    logError_ACU(`loadApiPreset: Preset "${presetName}" not found`);
                    return false;
                }
            } catch (e) {
                logError_ACU('loadApiPreset failed:', e);
                return false;
            }
        },

        deleteApiPreset: function(presetName: string) {
            try {
                if (!presetName || typeof presetName !== 'string') {
                    logError_ACU('deleteApiPreset: preset name is required');
                    return false;
                }

                deleteApiPreset_ACU(presetName);
                logDebug_ACU(`API preset deleted: ${presetName}`);
                return true;
            } catch (e) {
                logError_ACU('deleteApiPreset failed:', e);
                return false;
            }
        },
    };
}
