/**
 * presentation/bootstrap/api-groups/template-preset-api.ts
 * 模板预设 API — 模板预设的列表/切换/导入
 */

import { TABLE_TEMPLATE_ACU } from '../../../shared/defaults-json.js';
import { deriveTemplatePresetNameForImport_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../../shared/template-preset-utils';
import { logDebug_ACU, logError_ACU } from '../../../shared/utils';
import {
    applyTemplatePresetToCurrent_ACU,
    applyTemplateSnapshotToScope_ACU,
    listTemplatePresetNames_ACU,
    normalizeTemplateOperationScope_ACU,
    parseImportedTemplateData_ACU,
    upsertTemplatePreset_ACU,
} from '../../../service/template/template-preset-service';
import { refreshTemplatePresetSelectInUI_ACU } from '../../components/template-preset-ui';
import type { ApiGroupContext } from './callback-api';

export function createTemplatePresetApi(ctx: ApiGroupContext): Record<string, Function> {
    return {
        getTemplatePresetNames: function() {
            try {
                return listTemplatePresetNames_ACU();
            } catch (e) {
                logError_ACU('getTemplatePresetNames failed:', e);
                return [];
            }
        },

        switchTemplatePreset: async function(presetName: any, options: any = {}) {
            try {
                const { scope = 'global' } = options || {};
                const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
                const name = normalizeTemplatePresetSelectionValue_ACU(presetName);
                const displayName = name || '默认预设';
                const result = await applyTemplatePresetToCurrent_ACU(name, {
                    source: 'api',
                    updateGlobal: normalizedScope === 'global',
                    save: true,
                    persistChatScope: normalizedScope === 'chat',
                });
                if (result) {
                    refreshTemplatePresetSelectInUI_ACU({
                        selectName: normalizedScope === 'global' ? name : null,
                        keepValue: normalizedScope !== 'global',
                    });
                    return {
                        success: true,
                        scope: normalizedScope,
                        message: `${normalizedScope === 'global' ? '全局模板预设' : '当前聊天模板预设'}已切换：${displayName}`,
                    };
                }
                return {
                    success: false,
                    scope: normalizedScope,
                    message: `${normalizedScope === 'global' ? '全局模板预设' : '当前聊天模板预设'}切换失败：${displayName}`,
                };
            } catch (e) {
                logError_ACU('switchTemplatePreset failed:', e);
                return { success: false, message: `模板预设切换失败：${e.message}` };
            }
        },

        injectTemplatePresetToCurrentChat: async function(presetName: any) {
            try {
                return await ctx.getApi().switchTemplatePreset(presetName, { scope: 'chat' });
            } catch (e) {
                logError_ACU('injectTemplatePresetToCurrentChat failed:', e);
                return { success: false, message: `当前聊天模板预设切换失败：${e.message}` };
            }
        },

        importTemplateFromData: async function(templateData: any, options: any = {}) {
            try {
                const { scope = 'global', presetName = '' } = options || {};
                const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
                const normalizedPresetName = deriveTemplatePresetNameForImport_ACU({
                    presetName,
                    fallbackLabel: normalizedScope === 'global'
                        ? `导入模板_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
                        : '',
                });
                const prepared = parseImportedTemplateData_ACU(templateData);

                if (normalizedScope === 'global' && normalizedPresetName) {
                    const savePresetOk = upsertTemplatePreset_ACU(normalizedPresetName, prepared.templateStr);
                    if (!savePresetOk) {
                        return {
                            success: false,
                            scope: normalizedScope,
                            message: `模板已解析，但保存全局模板预设失败：${normalizedPresetName}`,
                        };
                    }
                }

                const applied = await applyTemplateSnapshotToScope_ACU(prepared.templateStr, {
                    scope: normalizedScope,
                    source: normalizedScope === 'chat' ? 'api_import_template_chat' : 'api_import_template_global',
                    presetName: normalizedPresetName,
                    save: true,
                    persistChatScope: normalizedScope === 'chat',
                });
                if (!applied) {
                    return {
                        success: false,
                        scope: normalizedScope,
                        message: '模板导入失败：无法应用模板快照。',
                    };
                }

                logDebug_ACU(`[API] importTemplateFromData: 模板已成功导入到${normalizedScope === 'chat' ? '当前聊天' : '全局'}。`);
                return {
                    success: true,
                    scope: normalizedScope,
                    message: normalizedScope === 'chat'
                        ? `模板已成功导入到当前聊天${normalizedPresetName ? `（预设名：${normalizedPresetName}）` : ''}！`
                        : (normalizedPresetName
                            ? `模板已成功导入到全局，并已保存为预设：${normalizedPresetName}`
                            : '模板已成功导入到全局！'),
                    presetName: normalizedPresetName || undefined,
                };

            } catch (e) {
                logError_ACU('importTemplateFromData failed:', e);
                return { success: false, message: `导入失败: ${e.message}` };
            }
        },

        getTableTemplate: function() {
            try {
                if (TABLE_TEMPLATE_ACU) {
                    return JSON.parse(TABLE_TEMPLATE_ACU);
                }
                return null;
            } catch (e) {
                logError_ACU('getTableTemplate failed:', e);
                return null;
            }
        },
    };
}
