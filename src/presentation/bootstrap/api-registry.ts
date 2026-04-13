import { TABLE_TEMPLATE_ACU } from '../../shared/defaults-json.js';
import { deriveTemplatePresetNameForImport_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../shared/template-preset-utils';
import { openAutoCardPopup_ACU } from '../pages/main-popup';
import { openNewVisualizer_ACU } from '../pages/visualizer';
import { handleTxtImportAndSplit_ACU } from '../components/import-status-ui';
import { isAutoUpdatingCard_ACU, _set_isAutoUpdatingCard_ACU } from '../../service/runtime/state-manager';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { getApiConfigByPreset_ACU } from '../../service/ai/api-call';
import { handleApiResponse_ACU } from '../../service/ai/prompt-builder';
import { importCombinedSettings_ACU } from '../triggers/admin-ui';
import { clearImportLocalStorage_ACU, clearImportedEntries_ACU, deleteImportedEntries_ACU, handleInjectImportedTxtSelected_ACU } from '../triggers/import-process';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../../service/runtime/state-manager';
import { getCurrentWorldbookConfig_ACU, setZeroTkOccupyMode_ACU } from '../../service/settings/settings-service';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { handleManualUpdate_ACU, proceedWithCardUpdate_ACU, saveCurrentDataForTable_ACU } from '../triggers/update-process';
import { getSortedSheetKeys_ACU, overwriteChatSheetGuideFromTemplate_ACU, sanitizeChatSheetsObject_ACU, sanitizeSheetForStorage_ACU } from '../../service/template/chat-scope';
import { deleteAllGeneratedEntries_ACU, loadAllChatMessages_ACU, updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../components/pipeline-ui-helpers';
import { topLevelWindow_ACU } from '../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { saveIndependentTableToChatHistory_ACU } from '../../service/table/table-service';
import { handleInjectSplitEntriesFull_ACU, handleInjectSplitEntriesStandard_ACU, handleInjectSplitEntriesSummary_ACU } from '../components/import-status-ui';
import { getCurrentRuntimePlotPresetName_ACU, normalizePlotPresetExcludeRules_ACU, switchCurrentChatPlotPreset_ACU } from '../../service/plot/plot-logic';
import { reoptimizeMessage_ACU } from '../components/optimization-ui';
import { applyTemplatePresetToCurrent_ACU, applyTemplateSnapshotToScope_ACU, listTemplatePresetNames_ACU, normalizeTemplateOperationScope_ACU, parseImportedTemplateData_ACU, upsertTemplatePreset_ACU } from '../../service/template/template-preset-service';
import { refreshTemplatePresetSelectInUI_ACU } from '../components/template-preset-ui';
import { exportCurrentJsonData_ACU, exportTableTemplate_ACU, importTableTemplate_ACU, overrideLatestLayerWithTemplate_ACU, resetAllToDefaults_ACU, resetTableTemplate_ACU } from '../triggers/data-admin-ui';
import { deleteApiPreset_ACU, loadApiPreset_ACU, saveApiPreset_ACU } from '../triggers/settings-ui-sync';
import { exportCombinedSettings_ACU, handleManualMergeSummary_ACU } from '../triggers/update-trigger';
import { cancelContentOptimization_ACU } from '../../service/optimization/content-optimization';
import { fillFirstLayerWithTemplateData_ACU, formatJsonToReadable_ACU, getEffectiveAutoUpdateThreshold_ACU, getTableLocksForSheet_ACU, isSpecialIndexLockEnabled_ACU, saveTableLocksForSheet_ACU, setSpecialIndexLockEnabled_ACU, toggleCellLock_ACU, toggleColLock_ACU, toggleRowLock_ACU } from '../../service/runtime/helpers-remaining';
import { updateOutlineTableEntry_ACU } from '../../service/worldbook/injection-engine';
/**
 * presentation/bootstrap/api-registry.ts — AutoCardUpdaterAPI 对外 API 注册
 * 从 src/core/03_runtime_api.js 整体迁移。
 */

  // --- [核心改造] 回调函数管理器 ---
  const tableUpdateCallbacks_ACU = [];
  const tableFillStartCallbacks_ACU = [];
  // 修复：确保API对象被附加到最顶层的窗口对象上，以便iframe等外部脚本可以访问
  (topLevelWindow_ACU as any).AutoCardUpdaterAPI = {
    // [新增] 打开可视化编辑器的 API
    openVisualizer: function() {
        if (typeof openNewVisualizer_ACU === 'function') {
            openNewVisualizer_ACU();
        } else {
            console.error('[ACU] openNewVisualizer_ACU is not defined inside closure.');
            showToastr_ACU('error', '可视化编辑器加载失败。');
        }
    },
    // 导出当前表格数据（返回合并后的数据，同步函数以兼容前端）
    exportTableAsJson: function() {
        // [新增] 直接返回 currentJsonTableData_ACU，它已经在保存和加载时被更新为合并后的数据
        // 修复：如果数据尚未加载，返回一个空对象以防止美化插件在初始化时出错。
        return currentJsonTableData_ACU || {};
    },
    // [新增] 导入并覆盖当前表格数据
    importTableAsJson: async function(jsonString) {
        if (typeof jsonString !== 'string' || jsonString.trim() === '') {
            logError_ACU('importTableAsJson received invalid input.');
            showToastr_ACU('error', '导入数据失败：输入为空。');
            return false;
        }
        try {
            const newData = JSON.parse(jsonString);
            // 基本验证
            if (newData && newData.mate && Object.keys(newData).some(k => k.startsWith('sheet_'))) {
                // [瘦身] 导入 JSON 后立即清洗并规范化（兼容旧格式；新存储不再带冗余字段）
                _set_currentJsonTableData_ACU(sanitizeChatSheetsObject_ACU(newData, { ensureMate: true }));
                logDebug_ACU('Successfully imported new table data into memory.');
                
                // [新增] 导入后，分别保存标准表和总结表到对应的源文件中
                const chat = SillyTavern_API_ACU.chat;
                if (chat && chat.length > 0) {
                    // 查找最新的AI消息作为保存目标
                    let targetMessage = null;
                    let finalIndex = -1;
                    for (let i = chat.length - 1; i >= 0; i--) {
                        if (!chat[i].is_user) {
                            targetMessage = chat[i];
                            finalIndex = i;
                            break;
                        }
                    }

                    if (targetMessage) {
                        // --- [修复] importTableAsJson 必须同步更新 IsolatedData，否则在开启数据隔离时会被旧值“回档” ---
                        try {
                            // 1) 准备全量 independentData（仅 sheet_）
                            const newIndependentData = {};
                            Object.keys(currentJsonTableData_ACU).forEach(k => {
                                if (k.startsWith('sheet_')) {
                                    newIndependentData[k] = sanitizeSheetForStorage_ACU(currentJsonTableData_ACU[k]);
                                }
                            });

                            // 2) 同步写入当前隔离标签槽位
                            const currentIsolationKey = getCurrentIsolationKey_ACU(); // 无标签为 ""，有标签为 code

                            // 兼容：TavernDB_ACU_IsolatedData 可能被序列化成字符串
                            let isolatedContainer = targetMessage.TavernDB_ACU_IsolatedData;
                            if (typeof isolatedContainer === 'string') {
                                try {
                                    isolatedContainer = JSON.parse(isolatedContainer);
                                } catch (e) {
                                    isolatedContainer = {};
                                }
                            }
                            if (!isolatedContainer || typeof isolatedContainer !== 'object') isolatedContainer = {};

                            if (!isolatedContainer[currentIsolationKey]) {
                                isolatedContainer[currentIsolationKey] = {
                                    independentData: {},
                                    modifiedKeys: [],
                                    updateGroupKeys: [],
                                };
                            }

                            const tagData = isolatedContainer[currentIsolationKey];
                            tagData.independentData = newIndependentData;
                            // 作为“全量覆盖导入”，标记所有键为已修改/本次组更新成功，确保读取优先权
                            tagData.modifiedKeys = Object.keys(newIndependentData);
                            tagData.updateGroupKeys = Object.keys(newIndependentData);

                            isolatedContainer[currentIsolationKey] = tagData;
                            targetMessage.TavernDB_ACU_IsolatedData = isolatedContainer;

                            // 3) 兼容旧字段（与 saveIndependentTableToChatHistory_ACU 的写入保持一致）
                            if (settings_ACU.dataIsolationEnabled) {
                                targetMessage.TavernDB_ACU_Identity = settings_ACU.dataIsolationCode;
                            } else {
                                delete targetMessage.TavernDB_ACU_Identity;
                            }
                            targetMessage.TavernDB_ACU_IndependentData = newIndependentData;
                            targetMessage.TavernDB_ACU_ModifiedKeys = tagData.modifiedKeys;
                            targetMessage.TavernDB_ACU_UpdateGroupKeys = tagData.updateGroupKeys;
                        } catch (e) {
                            logWarn_ACU('[importTableAsJson] 同步 IsolatedData 失败（将继续执行旧写入以尽量保持可用）：', e);
                        }

                        // 分离标准表和总结表数据
                        const standardData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));
                        const summaryData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));
                        
                        // 从标准表数据中移除总结表和总体大纲
                        const standardTableIndexes = Object.keys(standardData).filter(k => k.startsWith('sheet_'));
                        standardTableIndexes.forEach(sheetKey => {
                            const table = standardData[sheetKey];
                            if (table && table.name && isSummaryOrOutlineTable_ACU(table.name)) {
                                delete standardData[sheetKey];
                            }
                        });

                        // 从总结表数据中移除标准表
                        const summaryTableIndexes = Object.keys(summaryData).filter(k => k.startsWith('sheet_'));
                        summaryTableIndexes.forEach(sheetKey => {
                            const table = summaryData[sheetKey];
                            if (table && table.name && !isSummaryOrOutlineTable_ACU(table.name)) {
                                delete summaryData[sheetKey];
                            }
                        });

                        // 分别保存到对应的源文件中
                        if (Object.keys(standardData).some(k => k.startsWith('sheet_'))) {
                            targetMessage.TavernDB_ACU_Data = sanitizeChatSheetsObject_ACU(standardData, { ensureMate: true });
                            logDebug_ACU(`Saved standard table data to message at index ${finalIndex}.`);
                        }
                        
                        if (Object.keys(summaryData).some(k => k.startsWith('sheet_'))) {
                            targetMessage.TavernDB_ACU_SummaryData = sanitizeChatSheetsObject_ACU(summaryData, { ensureMate: true });
                            logDebug_ACU(`Saved summary table data to message at index ${finalIndex}.`);
                        }

                        await SillyTavern_API_ACU.saveChat(); // Persist the changes
                    }
                }
                
                // [修复] 使用统一的刷新函数，确保数据合并和UI更新正确
                await refreshMergedDataAndNotifyWithUI_ACU();
                return true;
            } else {
                throw new Error('导入的JSON缺少关键结构 (mate, sheet_*)。');
            }
        } catch (error) {
            logError_ACU('Failed to import table data from JSON:', error);
            showToastr_ACU('error', `导入数据失败: ${error.message}`);
            return false;
        }
    },
    // [新增] 外部触发增量更新
    triggerUpdate: async function() {
        logDebug_ACU('External trigger for database update received.');
        if (isAutoUpdatingCard_ACU) {
            showToastr_ACU('info', '已有更新任务在后台进行中。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
            return false;
        }
        _set_isAutoUpdatingCard_ACU(true);
        // 使用与手动更新相同的逻辑
        await loadAllChatMessages_ACU(); // Keep for worldbook context
        const chatHistory = SillyTavern_API_ACU.chat || []; // Use the live chat data for slicing
        const currentThreshold = getEffectiveAutoUpdateThreshold_ACU('manual_update');

        const allAiMessageIndices = chatHistory
            .map((msg, index) => !msg.is_user ? index : -1)
            .filter(index => index !== -1);
        
        const numberOfAiMessages = allAiMessageIndices.length;

        let sliceStartIndex = 0; 
        if (numberOfAiMessages > currentThreshold) {
            const firstRelevantAiMessageMapIndex = numberOfAiMessages - currentThreshold;
            const previousAiMessageMapIndex = firstRelevantAiMessageMapIndex - 1;
            if (previousAiMessageMapIndex >= 0) {
                sliceStartIndex = allAiMessageIndices[previousAiMessageMapIndex] + 1;
            }
        }

        // [新机制] 确保上下文的起始点包含AI回复前的用户发言
        if (sliceStartIndex > 0 &&
            chatHistory[sliceStartIndex] &&
            !chatHistory[sliceStartIndex].is_user &&
            chatHistory[sliceStartIndex - 1] &&
            chatHistory[sliceStartIndex - 1].is_user)
        {
            sliceStartIndex = sliceStartIndex - 1;
            logDebug_ACU(`Adjusted slice start index to ${sliceStartIndex} to include preceding user message.`);
        }

        const messagesToProcess = chatHistory.slice(sliceStartIndex);
        const success = await proceedWithCardUpdate_ACU(messagesToProcess);
        _set_isAutoUpdatingCard_ACU(false);
        return success;
    },

    // =========================
    // [新增] 对外开放：与UI按钮等价的调用入口（便于前端插件直接调用）
    // 说明：这些方法尽量保持“可编程调用”(无需点UI)；个别方法仍可能弹出确认框/文件选择框，行为与按钮一致。
    // =========================

    // 打开设置面板（等价于点“打开星·数据库”）
    openSettings: async function() {
        try {
            return await openAutoCardPopup_ACU();
        } catch (e) {
            logError_ACU('openSettings failed:', e);
            return false;
        }
    },

    // 立即手动更新（等价于“立即手动更新”按钮）
    manualUpdate: async function() {
        try {
            return await handleManualUpdate_ACU();
        } catch (e) {
            logError_ACU('manualUpdate failed:', e);
            return false;
        }
    },

    // 立即同步世界书注入条目（可读数据库/人物/总结/大纲/自定义导出等）
    syncWorldbookEntries: async function({ createIfNeeded = true } = {}) {
        try {
            await updateReadableLorebookEntry_ACU(!!createIfNeeded, false);
            return true;
        } catch (e) {
            logError_ACU('syncWorldbookEntries failed:', e);
            return false;
        }
    },

    // [新增] 强制刷新数据并重新注入世界书
    // 用于前端完成数据写入后，强制触发一次完整的数据合并和世界书更新
    refreshDataAndWorldbook: async function() {
        try {
            await refreshMergedDataAndNotifyWithUI_ACU();
            logDebug_ACU('refreshDataAndWorldbook: Data refreshed and worldbook updated successfully.');
            return true;
        } catch (e) {
            logError_ACU('refreshDataAndWorldbook failed:', e);
            return false;
        }
    },

    reoptimizeMessage: async function(messageIndex) {
        try {
            return await reoptimizeMessage_ACU(messageIndex);
        } catch (e) {
            logError_ACU('reoptimizeMessage failed:', e);
            return false;
        }
    },

    cancelContentOptimization: function(reason) {
        try {
            const result = cancelContentOptimization_ACU(reason);
            if (result.cancelled) showToastr_ACU('warning', result.reason);
            return result.cancelled;
        } catch (e) {
            logError_ACU('cancelContentOptimization failed:', e);
            return false;
        }
    },
 
    // 删除当前注入目标世界书里的“本插件生成条目”
    deleteInjectedEntries: async function() {
        try {
            await deleteAllGeneratedEntries_ACU();
            return true;
        } catch (e) {
            logError_ACU('deleteInjectedEntries failed:', e);
            return false;
        }
    },

    // 设置“总结大纲/总体大纲(OutlineTable)”条目在世界书中的启用状态，并尝试即时同步
    // 注意：由于UI已经改成“0TK占用模式”，推荐改用 setZeroTkOccupyMode(mode)。
    setOutlineEntryEnabled: async function(enabled) {
        try {
            const isEnabled = !!enabled;
            setZeroTkOccupyMode_ACU(!isEnabled); // outlineEntryEnabled=true 等价于 zeroTkOccupyMode=false
            if (currentJsonTableData_ACU) {
                const { outlineTable } = formatJsonToReadable_ACU(currentJsonTableData_ACU);
                await updateOutlineTableEntry_ACU(outlineTable, false);
            }
            return true;
        } catch (e) {
            logError_ACU('setOutlineEntryEnabled failed:', e);
            return false;
        }
    },

    // [新增] 设置 0TK占用模式：true=世界书条目禁用；false=世界书条目启用
    setZeroTkOccupyMode: async function(modeEnabled) {
        try {
            setZeroTkOccupyMode_ACU(!!modeEnabled);
            if (currentJsonTableData_ACU) {
                const { outlineTable } = formatJsonToReadable_ACU(currentJsonTableData_ACU);
                await updateOutlineTableEntry_ACU(outlineTable, false);
            }
            return true;
        } catch (e) {
            logError_ACU('setZeroTkOccupyMode failed:', e);
            return false;
        }
    },

    // 模板/数据管理（等价于对应按钮）
    importTemplate: async function(options: any = {}) { try { return await importTableTemplate_ACU(options); } catch (e) { logError_ACU('importTemplate failed:', e); return false; } },
    exportTemplate: async function(options: any = {}) { try { return await exportTableTemplate_ACU(options); } catch (e) { logError_ACU('exportTemplate failed:', e); return false; } },
    resetTemplate: async function(options: any = {}) { try { return await resetTableTemplate_ACU(options); } catch (e) { logError_ACU('resetTemplate failed:', e); return false; } },
    resetAllDefaults: async function() { try { return await resetAllToDefaults_ACU(); } catch (e) { logError_ACU('resetAllDefaults failed:', e); return false; } },
    exportJsonData: async function() { try { return await exportCurrentJsonData_ACU(); } catch (e) { logError_ACU('exportJsonData failed:', e); return false; } },
    importCombinedSettings: async function() { try { return await importCombinedSettings_ACU(); } catch (e) { logError_ACU('importCombinedSettings failed:', e); return false; } },
    exportCombinedSettings: async function() { try { return await exportCombinedSettings_ACU(); } catch (e) { logError_ACU('exportCombinedSettings failed:', e); return false; } },
    overrideWithTemplate: async function() { try { return await overrideLatestLayerWithTemplate_ACU(); } catch (e) { logError_ACU('overrideWithTemplate failed:', e); return false; } },

    // =========================
    // 表格模板预设（列表/切换）API
    // =========================
    getTemplatePresetNames: function() {
        try {
            return listTemplatePresetNames_ACU();
        } catch (e) {
            logError_ACU('getTemplatePresetNames failed:', e);
            return [];
        }
    },
    switchTemplatePreset: async function(presetName, options: any = {}) {
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
    injectTemplatePresetToCurrentChat: async function(presetName) {
        try {
            return await this.switchTemplatePreset(presetName, { scope: 'chat' });
        } catch (e) {
            logError_ACU('injectTemplatePresetToCurrentChat failed:', e);
            return { success: false, message: `当前聊天模板预设切换失败：${e.message}` };
        }
    },

    // 导入TXT链路（等价于“导入/注入/清理”相关按钮）
    importTxtAndSplit: async function() { try { return await handleTxtImportAndSplit_ACU(); } catch (e) { logError_ACU('importTxtAndSplit failed:', e); return false; } },
    injectImportedSelected: async function() { try { return await handleInjectImportedTxtSelected_ACU(); } catch (e) { logError_ACU('injectImportedSelected failed:', e); return false; } },
    injectImportedStandard: async function() { try { return await handleInjectSplitEntriesStandard_ACU(); } catch (e) { logError_ACU('injectImportedStandard failed:', e); return false; } },
    injectImportedSummary: async function() { try { return await handleInjectSplitEntriesSummary_ACU(); } catch (e) { logError_ACU('injectImportedSummary failed:', e); return false; } },
    injectImportedFull: async function() { try { return await handleInjectSplitEntriesFull_ACU(); } catch (e) { logError_ACU('injectImportedFull failed:', e); return false; } },
    deleteImportedEntries: async function() { try { return await deleteImportedEntries_ACU(); } catch (e) { logError_ACU('deleteImportedEntries failed:', e); return false; } },
    clearImportedEntries: async function(clearAll = true) { try { return await clearImportedEntries_ACU(!!clearAll); } catch (e) { logError_ACU('clearImportedEntries failed:', e); return false; } },
    clearImportCache: async function(clearAll = true) { try { return await clearImportLocalStorage_ACU(!!clearAll); } catch (e) { logError_ACU('clearImportCache failed:', e); return false; } },

    // 合并总结
    mergeSummaryNow: async function() { try { return await handleManualMergeSummary_ACU(); } catch (e) { logError_ACU('mergeSummaryNow failed:', e); return false; } },

    // =========================
    // 表格锁定 API
    // =========================
    getTableLockState: function(sheetKey) {
        try {
            if (!sheetKey) return null;
            const lockState = getTableLocksForSheet_ACU(sheetKey);
            return {
                rows: Array.from(lockState.rows || []),
                cols: Array.from(lockState.cols || []),
                cells: Array.from(lockState.cells || []),
            };
        } catch (e) {
            logError_ACU('getTableLockState failed:', e);
            return null;
        }
    },
    setTableLockState: function(sheetKey, lockState: any = {}, { merge = false } = {}) {
        try {
            if (!sheetKey) return false;
            const base = merge ? getTableLocksForSheet_ACU(sheetKey) : { rows: new Set(), cols: new Set(), cells: new Set() };
            const rows = Array.isArray(lockState.rows) ? lockState.rows : [];
            const cols = Array.isArray(lockState.cols) ? lockState.cols : [];
            const cells = Array.isArray(lockState.cells) ? lockState.cells : [];

            rows.forEach(v => { if (Number.isFinite(v)) base.rows.add(v); });
            cols.forEach(v => { if (Number.isFinite(v)) base.cols.add(v); });
            cells.forEach(v => {
                if (typeof v === 'string') base.cells.add(v);
                else if (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
                    base.cells.add(`${v[0]}:${v[1]}`);
                }
            });

            saveTableLocksForSheet_ACU(sheetKey, base);
            return true;
        } catch (e) {
            logError_ACU('setTableLockState failed:', e);
            return false;
        }
    },
    clearTableLocks: function(sheetKey) {
        try {
            if (!sheetKey) return false;
            saveTableLocksForSheet_ACU(sheetKey, { rows: new Set(), cols: new Set(), cells: new Set() });
            return true;
        } catch (e) {
            logError_ACU('clearTableLocks failed:', e);
            return false;
        }
    },
    lockTableRow: function(sheetKey, rowIndex, locked = true) {
        try {
            if (!sheetKey || !Number.isFinite(rowIndex)) return false;
            const lockState = getTableLocksForSheet_ACU(sheetKey);
            if (locked) lockState.rows.add(rowIndex);
            else lockState.rows.delete(rowIndex);
            saveTableLocksForSheet_ACU(sheetKey, lockState);
            return true;
        } catch (e) {
            logError_ACU('lockTableRow failed:', e);
            return false;
        }
    },
    lockTableCol: function(sheetKey, colIndex, locked = true) {
        try {
            if (!sheetKey || !Number.isFinite(colIndex)) return false;
            const lockState = getTableLocksForSheet_ACU(sheetKey);
            if (locked) lockState.cols.add(colIndex);
            else lockState.cols.delete(colIndex);
            saveTableLocksForSheet_ACU(sheetKey, lockState);
            return true;
        } catch (e) {
            logError_ACU('lockTableCol failed:', e);
            return false;
        }
    },
    lockTableCell: function(sheetKey, rowIndex, colIndex, locked = true) {
        try {
            if (!sheetKey || !Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return false;
            const lockState = getTableLocksForSheet_ACU(sheetKey);
            const key = `${rowIndex}:${colIndex}`;
            if (locked) lockState.cells.add(key);
            else lockState.cells.delete(key);
            saveTableLocksForSheet_ACU(sheetKey, lockState);
            return true;
        } catch (e) {
            logError_ACU('lockTableCell failed:', e);
            return false;
        }
    },
    toggleTableRowLock: function(sheetKey, rowIndex) {
        try {
            if (!sheetKey || !Number.isFinite(rowIndex)) return false;
            toggleRowLock_ACU(sheetKey, rowIndex);
            return true;
        } catch (e) {
            logError_ACU('toggleTableRowLock failed:', e);
            return false;
        }
    },
    toggleTableColLock: function(sheetKey, colIndex) {
        try {
            if (!sheetKey || !Number.isFinite(colIndex)) return false;
            toggleColLock_ACU(sheetKey, colIndex);
            return true;
        } catch (e) {
            logError_ACU('toggleTableColLock failed:', e);
            return false;
        }
    },
    toggleTableCellLock: function(sheetKey, rowIndex, colIndex) {
        try {
            if (!sheetKey || !Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return false;
            toggleCellLock_ACU(sheetKey, rowIndex, colIndex);
            return true;
        } catch (e) {
            logError_ACU('toggleTableCellLock failed:', e);
            return false;
        }
    },
    getSpecialIndexLockEnabled: function(sheetKey) {
        try {
            if (!sheetKey) return null;
            return isSpecialIndexLockEnabled_ACU(sheetKey);
        } catch (e) {
            logError_ACU('getSpecialIndexLockEnabled failed:', e);
            return null;
        }
    },
    setSpecialIndexLockEnabled: function(sheetKey, enabled) {
        try {
            if (!sheetKey) return false;
            setSpecialIndexLockEnabled_ACU(sheetKey, !!enabled);
            return true;
        } catch (e) {
            logError_ACU('setSpecialIndexLockEnabled failed:', e);
            return false;
        }
    },
    // 注册表格更新回调
    registerTableUpdateCallback: function(callback) {
        if (typeof callback === 'function' && !tableUpdateCallbacks_ACU.includes(callback)) {
            tableUpdateCallbacks_ACU.push(callback);
            logDebug_ACU('A new table update callback has been registered.');
        }
    },
    // 注销表格更新回调
    unregisterTableUpdateCallback: function(callback) {
        const index = tableUpdateCallbacks_ACU.indexOf(callback);
        if (index > -1) {
            tableUpdateCallbacks_ACU.splice(index, 1);
            logDebug_ACU('A table update callback has been unregistered.');
        }
    },
    // 内部使用：通知更新
    _notifyTableUpdate: function() {
        logDebug_ACU(`Notifying ${tableUpdateCallbacks_ACU.length} callbacks about table update.`);
        // 修复：确保回调函数永远不会收到 null，而是收到一个空对象，增加稳健性。
        const dataToSend = currentJsonTableData_ACU || {};
        tableUpdateCallbacks_ACU.forEach(callback => {
            try {
                // 将最新的数据作为参数传给回调
                callback(dataToSend);
            } catch (e) {
                logError_ACU('Error executing a table update callback:', e);
            }
        });
    },
    // 注册“填表开始”回调
    registerTableFillStartCallback: function(callback) {
        if (typeof callback === 'function' && !tableFillStartCallbacks_ACU.includes(callback)) {
            tableFillStartCallbacks_ACU.push(callback);
            logDebug_ACU('A new table fill start callback has been registered.');
        }
    },
    // 内部使用：通知“填表开始”
    _notifyTableFillStart: function() {
        logDebug_ACU(`Notifying ${tableFillStartCallbacks_ACU.length} callbacks about table fill start.`);
        tableFillStartCallbacks_ACU.forEach(callback => {
            try {
                callback();
            } catch (e) {
                logError_ACU('Error executing a table fill start callback:', e);
            }
        });
    },

    // =========================
    // 单格/单行更新 API（供前端插件使用）
    // =========================

    /**
     * 更新指定表格中某个单元格的值
     * @param {string} tableName - 表格名称（如 "主角信息"）
     * @param {number} rowIndex - 行索引（0为表头，1为第一行数据）
     * @param {string|number} colIdentifier - 列名或列索引
     * @param {any} value - 要设置的值
     * @returns {Promise<boolean>} 是否成功
     */
    updateCell: async function(tableName, rowIndex, colIdentifier, value) {
        try {
            if (!currentJsonTableData_ACU) {
                logError_ACU('updateCell: No table data loaded.');
                return false;
            }
            
            // 查找表格
            let targetSheet = null;
            let targetSheetKey = null;
            for (const sheetKey in currentJsonTableData_ACU) {
                if (sheetKey.startsWith('sheet_') && currentJsonTableData_ACU[sheetKey].name === tableName) {
                    targetSheet = currentJsonTableData_ACU[sheetKey];
                    targetSheetKey = sheetKey;
                    break;
                }
            }
            
            if (!targetSheet) {
                logError_ACU(`updateCell: Table "${tableName}" not found.`);
                return false;
            }
            
            // 确保content存在
            if (!targetSheet.content || targetSheet.content.length === 0) {
                logError_ACU(`updateCell: Table "${tableName}" has no content.`);
                return false;
            }
            
            // 获取列索引
            let colIndex = -1;
            if (typeof colIdentifier === 'number') {
                colIndex = colIdentifier;
            } else {
                const headers = targetSheet.content[0] || [];
                colIndex = headers.indexOf(colIdentifier);
            }
            
            if (colIndex < 0 || colIndex >= (targetSheet.content[0] || []).length) {
                logError_ACU(`updateCell: Column "${colIdentifier}" not found in table "${tableName}".`);
                return false;
            }
            
            // 检查行索引
            if (rowIndex < 1 || rowIndex >= targetSheet.content.length) {
                logError_ACU(`updateCell: Row index ${rowIndex} out of bounds in table "${tableName}".`);
                return false;
            }
            
            // 更新单元格
            targetSheet.content[rowIndex][colIndex] = value;
            logDebug_ACU(`updateCell: Updated [${tableName}] row ${rowIndex}, col ${colIdentifier} = ${value}`);
            
            // 保存并通知
            await saveCurrentDataForTable_ACU(targetSheetKey);
            (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
            
            return true;
        } catch (e) {
            logError_ACU('updateCell failed:', e);
            return false;
        }
    },

    /**
     * 更新指定表格中某一行（按列名-值映射）
     * @param {string} tableName - 表格名称
     * @param {number} rowIndex - 行索引（1为第一行数据，0是表头不允许修改）
     * @param {Object} data - 列名-值映射对象，如 { "力量": 15, "敏捷": 12 }
     * @returns {Promise<boolean>} 是否成功
     */
    updateRow: async function(tableName, rowIndex, data) {
        try {
            if (!currentJsonTableData_ACU) {
                logError_ACU('updateRow: No table data loaded.');
                return false;
            }
            
            if (rowIndex < 1) {
                logError_ACU('updateRow: Cannot modify header row (index 0).');
                return false;
            }
            
            // 查找表格
            let targetSheet = null;
            let targetSheetKey = null;
            for (const sheetKey in currentJsonTableData_ACU) {
                if (sheetKey.startsWith('sheet_') && currentJsonTableData_ACU[sheetKey].name === tableName) {
                    targetSheet = currentJsonTableData_ACU[sheetKey];
                    targetSheetKey = sheetKey;
                    break;
                }
            }
            
            if (!targetSheet) {
                logError_ACU(`updateRow: Table "${tableName}" not found.`);
                return false;
            }
            
            // 确保行存在
            while (targetSheet.content.length <= rowIndex) {
                const newRow = new Array((targetSheet.content[0] || []).length).fill('');
                targetSheet.content.push(newRow);
            }
            
            const headers = targetSheet.content[0] || [];
            const row = targetSheet.content[rowIndex];
            
            // 更新各列
            let updated = 0;
            for (const colName in data) {
                const colIndex = headers.indexOf(colName);
                if (colIndex !== -1) {
                    row[colIndex] = data[colName];
                    updated++;
                } else {
                    logWarn_ACU(`updateRow: Column "${colName}" not found in table "${tableName}".`);
                }
            }
            
            logDebug_ACU(`updateRow: Updated ${updated} cells in [${tableName}] row ${rowIndex}`);
            
            // [优化] 保存到该表的最新楼层并触发世界书刷新
            // 说明：合并数据时从最新楼层向前遍历，每个表的"最新楼层"是该表数据第一次出现的位置
            if (targetSheetKey) {
                const chat = SillyTavern_API_ACU.chat;
                const isSummaryTable = isSummaryOrOutlineTable_ACU(targetSheet.name);
                const isolationKey = getCurrentIsolationKey_ACU();
                
                // 查找该表的最新楼层（从最新消息向前遍历，找到第一个包含该表数据的楼层）
                let tableLatestFloorIndex = -1;
                if (chat && chat.length > 0) {
                    for (let i = chat.length - 1; i >= 0; i--) {
                        const msg = chat[i];
                        if (msg.is_user) continue;
                        
                        let hasTableData = false;
                        
                        // 优先：新格式（按标签分组）
                        if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[isolationKey]) {
                            const tagData = msg.TavernDB_ACU_IsolatedData[isolationKey];
                            const independentData = tagData.independentData || {};
                            if (independentData[targetSheetKey]) {
                                hasTableData = true;
                            }
                        }
                        
                        // 兼容：旧格式
                        if (!hasTableData) {
                            const msgIdentity = msg.TavernDB_ACU_Identity;
                            const isLegacyMatch = settings_ACU.dataIsolationEnabled
                                ? msgIdentity === settings_ACU.dataIsolationCode
                                : !msgIdentity;
                        
                            if (isLegacyMatch) {
                                const hasLegacyData =
                                    (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[targetSheetKey]) ||
                                    (isSummaryTable
                                        ? (msg.TavernDB_ACU_SummaryData && msg.TavernDB_ACU_SummaryData[targetSheetKey])
                                        : (msg.TavernDB_ACU_Data && msg.TavernDB_ACU_Data[targetSheetKey]));
                                hasTableData = !!hasLegacyData;
                            }
                        }
                        
                        if (hasTableData) {
                            tableLatestFloorIndex = i;
                            break;
                        }
                    }
                }
                
                // 如果找不到该表的楼层，使用最新AI楼层
                if (tableLatestFloorIndex === -1 && chat && chat.length > 0) {
                    for (let i = chat.length - 1; i >= 0; i--) {
                        if (!chat[i].is_user) {
                            tableLatestFloorIndex = i;
                            break;
                        }
                    }
                }
                
                // 保存到该表的最新楼层
                if (tableLatestFloorIndex !== -1) {
                    // [修复] 外部导入模式下不保存到聊天记录
                    if (!data?.isImportMode) {
                        logDebug_ACU(`updateRow: Saving [${tableName}] to its latest floor ${tableLatestFloorIndex}`);
                        await saveIndependentTableToChatHistory_ACU(tableLatestFloorIndex, [targetSheetKey], [targetSheetKey], true);
                    }
                    
                    // 触发世界书刷新
                    await refreshMergedDataAndNotifyWithUI_ACU();
                    logDebug_ACU(`updateRow: Worldbook refreshed after saving [${tableName}]`);
                } else {
                    // 回退：使用旧方法保存
                    logDebug_ACU(`updateRow: No AI floor found, falling back to saveCurrentDataForTable_ACU`);
                    await saveCurrentDataForTable_ACU(targetSheetKey);
                }
            }
            (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
            
            return true;
        } catch (e) {
            logError_ACU('updateRow failed:', e);
            return false;
        }
    },

    /**
     * 在指定表格末尾插入新行
     * @param {string} tableName - 表格名称
     * @param {Object} data - 列名-值映射对象
     * @returns {Promise<number>} 新行的索引，失败返回 -1
     */
    insertRow: async function(tableName, data) {
        try {
            if (!currentJsonTableData_ACU) {
                logError_ACU('insertRow: No table data loaded.');
                return -1;
            }
            
            // 查找表格
            let targetSheet = null;
            let targetSheetKey = null;
            for (const sheetKey in currentJsonTableData_ACU) {
                if (sheetKey.startsWith('sheet_') && currentJsonTableData_ACU[sheetKey].name === tableName) {
                    targetSheet = currentJsonTableData_ACU[sheetKey];
                    targetSheetKey = sheetKey;
                    break;
                }
            }
            
            if (!targetSheet) {
                logError_ACU(`insertRow: Table "${tableName}" not found.`);
                return -1;
            }
            
            const headers = targetSheet.content[0] || [];
            const newRow = new Array(headers.length).fill('');
            
            // 填充数据
            for (const colName in data) {
                const colIndex = headers.indexOf(colName);
                if (colIndex !== -1) {
                    newRow[colIndex] = data[colName];
                }
            }
            
            targetSheet.content.push(newRow);
            const newIndex = targetSheet.content.length - 1;
            
            logDebug_ACU(`insertRow: Inserted row at index ${newIndex} in [${tableName}]`);
            
            // 保存并通知
            if (targetSheetKey) {
                const chat = SillyTavern_API_ACU.chat;
                const isSummaryTable = isSummaryOrOutlineTable_ACU(targetSheet.name);
                const isolationKey = getCurrentIsolationKey_ACU();
                
                // 查找该表的最新楼层（与 updateRow 保持一致）
                let tableLatestFloorIndex = -1;
                if (chat && chat.length > 0) {
                    for (let i = chat.length - 1; i >= 0; i--) {
                        const msg = chat[i];
                        if (msg.is_user) continue;
                        
                        let hasTableData = false;
                        
                        if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[isolationKey]) {
                            const tagData = msg.TavernDB_ACU_IsolatedData[isolationKey];
                            const independentData = tagData.independentData || {};
                            if (independentData[targetSheetKey]) {
                                hasTableData = true;
                            }
                        }
                        
                        if (!hasTableData) {
                            const msgIdentity = msg.TavernDB_ACU_Identity;
                            const isLegacyMatch = settings_ACU.dataIsolationEnabled
                                ? msgIdentity === settings_ACU.dataIsolationCode
                                : !msgIdentity;
                            
                            if (isLegacyMatch) {
                                const hasLegacyData =
                                    (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[targetSheetKey]) ||
                                    (isSummaryTable
                                        ? (msg.TavernDB_ACU_SummaryData && msg.TavernDB_ACU_SummaryData[targetSheetKey])
                                        : (msg.TavernDB_ACU_Data && msg.TavernDB_ACU_Data[targetSheetKey]));
                                hasTableData = !!hasLegacyData;
                            }
                        }
                        
                        if (hasTableData) {
                            tableLatestFloorIndex = i;
                            break;
                        }
                    }
                }
                
                if (tableLatestFloorIndex === -1 && chat && chat.length > 0) {
                    for (let i = chat.length - 1; i >= 0; i--) {
                        if (!chat[i].is_user) {
                            tableLatestFloorIndex = i;
                            break;
                        }
                    }
                }
                
                if (tableLatestFloorIndex !== -1) {
                    logDebug_ACU(`insertRow: Saving [${tableName}] to its latest floor ${tableLatestFloorIndex}`);
                    await saveIndependentTableToChatHistory_ACU(tableLatestFloorIndex, [targetSheetKey], [targetSheetKey], true);
                    await refreshMergedDataAndNotifyWithUI_ACU();
                    logDebug_ACU(`insertRow: Worldbook refreshed after saving [${tableName}]`);
                } else {
                    logDebug_ACU(`insertRow: No AI floor found, falling back to saveCurrentDataForTable_ACU`);
                    await saveCurrentDataForTable_ACU(targetSheetKey);
                }
            }
            (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
            
            return newIndex;
        } catch (e) {
            logError_ACU('insertRow failed:', e);
            return -1;
        }
    },

    /**
     * 删除指定表格中的某一行
     * @param {string} tableName - 表格名称
     * @param {number} rowIndex - 行索引（1为第一行数据）
     * @returns {Promise<boolean>} 是否成功
     */
    deleteRow: async function(tableName, rowIndex) {
        try {
            if (!currentJsonTableData_ACU) {
                logError_ACU('deleteRow: No table data loaded.');
                return false;
            }
            
            if (rowIndex < 1) {
                logError_ACU('deleteRow: Cannot delete header row (index 0).');
                return false;
            }
            
            // 查找表格
            let targetSheet = null;
            let targetSheetKey = null;
            for (const sheetKey in currentJsonTableData_ACU) {
                if (sheetKey.startsWith('sheet_') && currentJsonTableData_ACU[sheetKey].name === tableName) {
                    targetSheet = currentJsonTableData_ACU[sheetKey];
                    targetSheetKey = sheetKey;
                    break;
                }
            }
            
            if (!targetSheet) {
                logError_ACU(`deleteRow: Table "${tableName}" not found.`);
                return false;
            }
            
            if (rowIndex >= targetSheet.content.length) {
                logError_ACU(`deleteRow: Row index ${rowIndex} out of bounds.`);
                return false;
            }
            
            targetSheet.content.splice(rowIndex, 1);
            
            logDebug_ACU(`deleteRow: Deleted row ${rowIndex} from [${tableName}]`);
            
            // 保存并通知
            if (targetSheetKey) {
                const chat = SillyTavern_API_ACU.chat;
                const isSummaryTable = isSummaryOrOutlineTable_ACU(targetSheet.name);
                const isolationKey = getCurrentIsolationKey_ACU();
                
                // 查找该表的最新楼层（与 updateRow 保持一致）
                let tableLatestFloorIndex = -1;
                if (chat && chat.length > 0) {
                    for (let i = chat.length - 1; i >= 0; i--) {
                        const msg = chat[i];
                        if (msg.is_user) continue;
                        
                        let hasTableData = false;
                        
                        if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[isolationKey]) {
                            const tagData = msg.TavernDB_ACU_IsolatedData[isolationKey];
                            const independentData = tagData.independentData || {};
                            if (independentData[targetSheetKey]) {
                                hasTableData = true;
                            }
                        }
                        
                        if (!hasTableData) {
                            const msgIdentity = msg.TavernDB_ACU_Identity;
                            const isLegacyMatch = settings_ACU.dataIsolationEnabled
                                ? msgIdentity === settings_ACU.dataIsolationCode
                                : !msgIdentity;
                            
                            if (isLegacyMatch) {
                                const hasLegacyData =
                                    (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[targetSheetKey]) ||
                                    (isSummaryTable
                                        ? (msg.TavernDB_ACU_SummaryData && msg.TavernDB_ACU_SummaryData[targetSheetKey])
                                        : (msg.TavernDB_ACU_Data && msg.TavernDB_ACU_Data[targetSheetKey]));
                                hasTableData = !!hasLegacyData;
                            }
                        }
                        
                        if (hasTableData) {
                            tableLatestFloorIndex = i;
                            break;
                        }
                    }
                }
                
                if (tableLatestFloorIndex === -1 && chat && chat.length > 0) {
                    for (let i = chat.length - 1; i >= 0; i--) {
                        if (!chat[i].is_user) {
                            tableLatestFloorIndex = i;
                            break;
                        }
                    }
                }
                
                if (tableLatestFloorIndex !== -1) {
                    logDebug_ACU(`deleteRow: Saving [${tableName}] to its latest floor ${tableLatestFloorIndex}`);
                    await saveIndependentTableToChatHistory_ACU(tableLatestFloorIndex, [targetSheetKey], [targetSheetKey], true);
                    await refreshMergedDataAndNotifyWithUI_ACU();
                    logDebug_ACU(`deleteRow: Worldbook refreshed after saving [${tableName}]`);
                } else {
                    logDebug_ACU(`deleteRow: No AI floor found, falling back to saveCurrentDataForTable_ACU`);
                    await saveCurrentDataForTable_ACU(targetSheetKey);
                }
            }
            (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
            
            return true;
        } catch (e) {
            logError_ACU('deleteRow failed:', e);
            return false;
        }
    },

    // =========================
    // 剧情推进预设管理 API
    // =========================

    /**
     * 获取所有剧情预设列表
     * @returns {Array<{name: string, ...}>} 预设数组，每个预设包含 name 及其他配置
     */
    getPlotPresets: function() {
        try {
            const presets = settings_ACU.plotSettings?.promptPresets || [];
            // 返回预设列表的深拷贝，防止外部直接修改内部数据
            return presets.map(p => normalizePlotPresetExcludeRules_ACU(p));
        } catch (e) {
            logError_ACU('getPlotPresets failed:', e);
            return [];
        }
    },

    /**
     * 获取当前正在使用的预设名称
     * @returns {string} 当前预设名称，如果没有选择任何预设则返回空字符串
     */
    getCurrentPlotPreset: function() {
        try {
            return getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal: true });
        } catch (e) {
            logError_ACU('getCurrentPlotPreset failed:', e);
            return '';
        }
    },

    /**
     * 切换到指定的剧情预设（仅作用当前聊天）
     * @param {string} presetName - 要切换到的预设名称
     * @returns {boolean} 切换是否成功
     */
    switchPlotPreset: function(presetName) {
        try {
            if (presetName === undefined || presetName === null) {
                logError_ACU('switchPlotPreset: Invalid preset name provided.');
                return false;
            }

            const result = switchCurrentChatPlotPreset_ACU(presetName, {
                source: 'api',
                save: true,
            });

            if (!result) {
                logError_ACU(`switchPlotPreset: Preset "${presetName}" not found.`);
                return false;
            }

            logDebug_ACU(`Successfully switched current chat to plot preset: "${result.followsGlobal ? '跟随全局' : result.presetName}"`);
            return true;
        } catch (e) {
            logError_ACU('switchPlotPreset failed:', e);
            return false;
        }
    },

    /**
     * 将指定的全局剧情预设切换为当前对话使用的剧情推进预设，不修改全局当前预设
     * @param {string} presetName - 要切换到当前对话的预设名称
     * @returns {boolean} 切换是否成功
     */
    injectPlotPresetToCurrentChat: function(presetName) {
        try {
            if (presetName === undefined || presetName === null) {
                logError_ACU('injectPlotPresetToCurrentChat: Invalid preset name provided.');
                return false;
            }

            const result = switchCurrentChatPlotPreset_ACU(presetName, {
                source: 'api',
                save: true,
            });

            if (!result) {
                logError_ACU(`injectPlotPresetToCurrentChat: Preset "${presetName}" not found.`);
                return false;
            }

            logDebug_ACU(`Injected global plot preset into current chat: "${result.followsGlobal ? '跟随全局' : result.presetName}"`);
            return true;
        } catch (e) {
            logError_ACU('injectPlotPresetToCurrentChat failed:', e);
            return false;
        }
    },

    /**
     * 获取预设的详细信息
     * @param {string} presetName - 预设名称
     * @returns {Object|null} 预设对象的深拷贝，如果未找到则返回 null
     */
    getPlotPresetDetails: function(presetName) {
        try {
            if (!presetName || typeof presetName !== 'string') {
                return null;
            }
            const presets = settings_ACU.plotSettings?.promptPresets || [];
            const preset = presets.find(p => p.name === presetName);
            return preset ? normalizePlotPresetExcludeRules_ACU(preset) : null;
        } catch (e) {
            logError_ACU('getPlotPresetDetails failed:', e);
            return null;
        }
    },

    /**
     * 获取预设名称列表（简化版，仅返回名称数组）
     * @returns {Array<string>} 预设名称数组
     */
    getPlotPresetNames: function() {
        try {
            const presets = settings_ACU.plotSettings?.promptPresets || [];
            return presets.map(p => p.name);
        } catch (e) {
            logError_ACU('getPlotPresetNames failed:', e);
            return [];
        }
    },

    // =========================
    // 前端导入 API（无需文件选择器）
    // =========================

    /**
     * 通过前端直接导入表格模板（无需文件选择器）
     * @param {Object|string} templateData - 模板数据，可以是 JSON 对象或 JSON 字符串
     * @param {Object} options - 可选配置
     * @param {'global'|'chat'} options.scope - 导入作用域，默认 global
     * @param {string} options.presetName - 仅当 scope=global 时可选保存到预设库；scope=chat 时仅写入聊天快照元信息
     * @returns {Promise<{success: boolean, message: string, scope?: string, presetName?: string}>} 导入结果
     */
    importTemplateFromData: async function(templateData, options: any = {}) {
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

    /**
     * 通过前端直接导入剧情推进预设（无需文件选择器）
     * @param {Object|string} presetData - 预设数据，可以是 JSON 对象或 JSON 字符串
     * @param {Object} options - 可选配置
     * @param {boolean} options.overwrite - 如果预设已存在，是否覆盖（默认 false，会自动重命名）
     * @param {boolean} options.switchTo - 导入后是否立即切换到该预设（默认 false）
     * @returns {Promise<{success: boolean, message: string, presetName?: string}>} 导入结果
     */
    importPlotPresetFromData: async function(presetData, options: any = {}) {
        try {
            const { overwrite = false, switchTo = false } = options;
            let preset;

            // 支持字符串或对象格式
            if (typeof presetData === 'string') {
                try {
                    preset = JSON.parse(presetData);
                } catch (parseError) {
                    return { success: false, message: `JSON解析错误: ${parseError.message}` };
                }
            } else if (typeof presetData === 'object' && presetData !== null) {
                preset = JSON.parse(JSON.stringify(presetData)); // 深拷贝
            } else {
                return { success: false, message: '无效的预设数据：必须是 JSON 对象或 JSON 字符串' };
            }

            // 验证预设数据必须包含 name 字段
            if (!preset.name || typeof preset.name !== 'string' || preset.name.trim() === '') {
                return { success: false, message: '预设数据无效：缺少 "name" 字段或名称为空' };
            }

            const presetName = preset.name.trim();
            const presets = settings_ACU.plotSettings?.promptPresets || [];
            const existingIndex = presets.findIndex(p => p.name === presetName);
            const normalizedPreset = normalizePlotPresetExcludeRules_ACU(preset);
            normalizedPreset.name = presetName;

            let finalName = presetName;

            if (existingIndex !== -1) {
                if (overwrite) {
                    // 覆盖现有预设
                    presets[existingIndex] = normalizedPreset;
                    logDebug_ACU(`[API] importPlotPresetFromData: 覆盖已存在的预设 "${presetName}"`);
                } else {
                    // 自动重命名
                    let counter = 1;
                    while (presets.some(p => p.name === finalName)) {
                        finalName = `${presetName} (${counter})`;
                        counter++;
                    }
                    normalizedPreset.name = finalName;
                    presets.push(normalizedPreset);
                    logDebug_ACU(`[API] importPlotPresetFromData: 预设已存在，重命名为 "${finalName}"`);
                }
            } else {
                // 新增预设
                presets.push(normalizedPreset);
                logDebug_ACU(`[API] importPlotPresetFromData: 新增预设 "${presetName}"`);
            }

            settings_ACU.plotSettings.promptPresets = presets;
            saveSettingsAndNotify_ACU();

            let switchedCurrentChat = false;
            // 如果需要，导入到全局预设库后再切换当前对话使用该预设
            if (switchTo) {
                switchedCurrentChat = this.injectPlotPresetToCurrentChat(finalName) === true;
            }

            // UI 刷新由 presentation 层调用方负责

            return {
                success: true,
                message: switchedCurrentChat
                    ? `预设 "${finalName}" 已成功导入到全局预设库，并已切换当前聊天使用该预设。`
                    : `预设 "${finalName}" 已成功导入到全局预设库！`,
                presetName: finalName,
            };

        } catch (e) {
            logError_ACU('importPlotPresetFromData failed:', e);
            return { success: false, message: `导入失败: ${e.message}` };
        }
    },

    /**
     * 批量导入多个剧情推进预设
     * @param {Array<Object|string>} presetsArray - 预设数据数组
     * @param {Object} options - 可选配置
     * @param {boolean} options.overwrite - 如果预设已存在，是否覆盖（默认 false）
     * @returns {Promise<{success: boolean, message: string, imported: number, failed: number, details: Array}>} 导入结果
     */
    importPlotPresetsFromData: async function(presetsArray, options: any = {}) {
        try {
            if (!Array.isArray(presetsArray)) {
                return { success: false, message: '输入必须是数组', imported: 0, failed: 0, details: [] };
            }

            const details = [];
            let imported = 0;
            let failed = 0;

            for (const presetData of presetsArray) {
                const result = await this.importPlotPresetFromData(presetData, { ...options, switchTo: false });
                details.push(result);
                if (result.success) {
                    imported++;
                } else {
                    failed++;
                }
            }

            return {
                success: failed === 0,
                message: `批量导入完成：成功 ${imported} 个，失败 ${failed} 个`,
                imported,
                failed,
                details
            };

        } catch (e) {
            logError_ACU('importPlotPresetsFromData failed:', e);
            return { success: false, message: `批量导入失败: ${e.message}`, imported: 0, failed: 0, details: [] };
        }
    },

    /**
     * 获取当前使用的表格模板
     * @returns {Object|null} 模板对象的深拷贝
     */
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

    /**
     * 导出所有剧情推进预设
     * @returns {Array<Object>} 所有预设的深拷贝数组
     */
    exportAllPlotPresets: function() {
        try {
            const presets = settings_ACU.plotSettings?.promptPresets || [];
            return presets.map(p => normalizePlotPresetExcludeRules_ACU(p));
        } catch (e) {
            logError_ACU('exportAllPlotPresets failed:', e);
            return [];
        }
    },

    // =========================
    // 游戏初始化 API（角色卡开场页面专用）
    // =========================

    /**
     * 游戏初始化接口 - 供角色卡开场页面调用
     * @param {Object} characterData - 角色数据
     * @param {Object} options - 配置选项
     * @returns {Promise<Object>} 初始化结果
     */
    initGameSession: async function(characterData, options: any = {}) {
        const result = {
            success: false,
            templateInjected: false,
            presetLoaded: false,
            protagonistInitialized: false,
            equipmentInitialized: false,
            message: ''
        };
        
        try {
            // 步骤1: 注入数据库模板到首楼
            if (options.injectTemplate !== false) {
                logDebug_ACU('[游戏初始化] 开始注入数据库模板...');
                try {
                    let templateData;
                    
                    // 优先使用传入的 templateData 参数
                    if (options.templateData) {
                        logDebug_ACU('[游戏初始化] 使用传入的模板数据');
                        templateData = options.templateData;
                    } else {
                        // 从服务器加载默认模板
                        logDebug_ACU('[游戏初始化] 从服务器加载模板数据');
                        const templateResponse = await fetch('/TavernDB_template_默认模板.json');
                        if (!templateResponse.ok) {
                            throw new Error(`HTTP ${templateResponse.status}: ${templateResponse.statusText}`);
                        }
                        templateData = await templateResponse.json();
                    }
                    
                    // 将模板数据直接填充到第一楼（包含所有种子数据）
                    const templateObj = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
                    const templatePresetName = deriveTemplatePresetNameForImport_ACU({
                        presetName: options.templatePresetName || characterData?.name || characterData?.data?.name || '',
                    });
                    const fillResult = await fillFirstLayerWithTemplateData_ACU(templateObj, {
                        reason: 'game_init',
                        presetName: templatePresetName,
                        source: 'game_init',
                        registerPreset: true,
                    });
                    if (fillResult && typeof fillResult === 'object' && fillResult.success) {
                        result.templateInjected = true;
                        // UI 刷新：通知前端楼层更新 + 表格面板刷新
                        if (fillResult.messageIndex != null) {
                            if (SillyTavern_API_ACU?.eventSource?.emit && SillyTavern_API_ACU?.eventTypes?.MESSAGE_UPDATED) {
                                SillyTavern_API_ACU.eventSource.emit(SillyTavern_API_ACU.eventTypes.MESSAGE_UPDATED, fillResult.messageIndex);
                            }
                            if ((topLevelWindow_ACU as any)?.AutoCardUpdaterAPI) {
                                (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
                            }
                        }
                        logDebug_ACU('[游戏初始化] 数据库模板注入成功（包含种子数据）');
                    } else {
                        // 回退到旧方式（仅写入指导表）
                        await overwriteChatSheetGuideFromTemplate_ACU(templateObj, {
                            reason: 'game_init',
                            presetName: templatePresetName,
                            source: 'game_init',
                            syncTemplateScope: true,
                            registerPreset: true,
                        });
                        result.templateInjected = true;
                        logDebug_ACU('[游戏初始化] 数据库模板注入成功（仅指导表）');
                    }
                } catch (templateError) {
                    logError_ACU('[游戏初始化] 模板注入失败:', templateError);
                    throw new Error(`数据库模板注入失败: ${templateError.message}`);
                }
            }
            
            // 步骤2: 加载剧情引导预设
            if (options.loadPreset !== false) {
                logDebug_ACU('[游戏初始化] 开始加载剧情引导预设...');
                const presetName = options.presetName || '西幻剧情引导';
                try {
                    let presetData;
                    
                    // 优先使用传入的 presetData 参数
                    if (options.presetData) {
                        logDebug_ACU('[游戏初始化] 使用传入的预设数据');
                        presetData = options.presetData;
                    } else {
                        // 从服务器加载预设数据
                        logDebug_ACU('[游戏初始化] 从服务器加载预设数据');
                        const presetResponse = await fetch('/西幻剧情引导.json');
                        if (!presetResponse.ok) {
                            throw new Error(`HTTP ${presetResponse.status}: ${presetResponse.statusText}`);
                        }
                        presetData = await presetResponse.json();
                    }
                    
                    // 导入预设
                    const importResult = await this.importPlotPresetFromData(presetData, {
                        overwrite: true,
                        switchTo: true
                    });
                    if (!importResult.success) {
                        throw new Error(importResult.message || '预设导入失败');
                    }
                    result.presetLoaded = true;
                    logDebug_ACU('[游戏初始化] 剧情引导预设加载成功');
                } catch (presetError) {
                    logError_ACU('[游戏初始化] 预设加载失败:', presetError);
                    // 预设加载失败不阻断流程，只记录警告
                    logWarn_ACU('[游戏初始化] 剧情引导预设加载失败，但继续游戏初始化');
                }
            }
            
            // 步骤3: 保存设置并刷新
            try {
                saveSettingsAndNotify_ACU();
                if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI && (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate) {
                    (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
                }
            } catch (saveError) {
                logWarn_ACU('[游戏初始化] 保存设置时出错:', saveError);
            }
            
            result.success = true;
            result.message = '游戏初始化成功';
            logDebug_ACU('[游戏初始化] 游戏初始化流程完成');
            
        } catch (error) {
            result.message = `初始化失败: ${error.message}`;
            logError_ACU('initGameSession failed:', error);
        }
        
        return result;
    },

    // =========================
    // 更新配置参数读写 API
    // =========================

    /**
     * 获取更新配置参数
     * @returns {Object} 包含 autoUpdateThreshold, autoUpdateFrequency, updateBatchSize 等参数
     */
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

    /**
     * 设置更新配置参数
     * @param {Object} params - 要更新的参数对象
     * @param {number} [params.autoUpdateThreshold] - 自动更新阈值
     * @param {number} [params.autoUpdateFrequency] - 自动更新频率
     * @param {number} [params.updateBatchSize] - 批处理大小
     * @param {number} [params.autoUpdateTokenThreshold] - Token阈值
     * @returns {boolean} 设置是否成功
     */
    setUpdateConfigParams: function(params) {
        try {
            if (!params || typeof params !== 'object') {
                logError_ACU('setUpdateConfigParams: Invalid params');
                return false;
            }

            // 验证并设置每个参数
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

    /**
     * 获取手动更新表选择
     * @returns {Object} 包含 selectedTables 和 hasManualSelection
     */
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

    /**
     * 设置手动更新表选择
     * @param {Array<string>} sheetKeys - 要选择的表格 key 数组
     * @returns {boolean} 设置是否成功
     */
    setManualSelectedTables: function(sheetKeys) {
        try {
            if (!Array.isArray(sheetKeys)) {
                logError_ACU('setManualSelectedTables: sheetKeys must be an array');
                return false;
            }

            // 获取当前可用的表格 keys
            const availableKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
            
            // 过滤出有效的 keys
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

    /**
     * 清除手动更新表选择（恢复全选状态）
     * @returns {boolean} 清除是否成功
     */
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

    /**
     * 获取所有 API 预设列表
     * @returns {Array<Object>} API 预设数组的深拷贝
     */
    getApiPresets: function() {
        try {
            const presets = settings_ACU.apiPresets || [];
            return JSON.parse(JSON.stringify(presets));
        } catch (e) {
            logError_ACU('getApiPresets failed:', e);
            return [];
        }
    },

    /**
     * 获取当前选中的填表 API 预设名称
     * @returns {string} 预设名称，如果使用当前配置则返回空字符串
     */
    getTableApiPreset: function() {
        try {
            return settings_ACU.tableApiPreset || '';
        } catch (e) {
            logError_ACU('getTableApiPreset failed:', e);
            return '';
        }
    },

    /**
     * 设置填表 API 预设
     * @param {string} presetName - 预设名称，空字符串表示使用当前配置
     * @returns {boolean} 设置是否成功
     */
    setTableApiPreset: function(presetName) {
        try {
            // 空字符串表示使用当前配置
            if (presetName === '') {
                settings_ACU.tableApiPreset = '';
                saveSettingsAndNotify_ACU();
                logDebug_ACU('Table API preset cleared (use current config)');
                return true;
            }

            // 验证预设是否存在
            const presets = settings_ACU.apiPresets || [];
            const exists = presets.some(p => p.name === presetName);
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

    /**
     * 获取当前选中的剧情推进 API 预设名称
     * @returns {string} 预设名称，如果使用当前配置则返回空字符串
     */
    getPlotApiPreset: function() {
        try {
            return settings_ACU.plotApiPreset || '';
        } catch (e) {
            logError_ACU('getPlotApiPreset failed:', e);
            return '';
        }
    },

    /**
     * 设置剧情推进 API 预设
     * @param {string} presetName - 预设名称，空字符串表示使用当前配置
     * @returns {boolean} 设置是否成功
     */
    setPlotApiPreset: function(presetName) {
        try {
            // 空字符串表示使用当前配置
            if (presetName === '') {
                settings_ACU.plotApiPreset = '';
                saveSettingsAndNotify_ACU();
                logDebug_ACU('Plot API preset cleared (use current config)');
                return true;
            }

            // 验证预设是否存在
            const presets = settings_ACU.apiPresets || [];
            const exists = presets.some(p => p.name === presetName);
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

    /**
     * 保存或更新 API 预设
     * @param {Object} presetData - 预设数据
     * @param {string} presetData.name - 预设名称（必填）
     * @param {string} presetData.apiMode - API 模式（如 'custom', 'proxy' 等）
     * @param {Object} presetData.apiConfig - API 配置对象
     * @param {string} [presetData.tavernProfile] - Tavern Profile 名称
     * @returns {boolean} 保存是否成功
     */
    saveApiPreset: function(presetData) {
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

            // 调用内部函数保存预设
            saveApiPreset_ACU(newPreset.name);
            logDebug_ACU(`API preset saved: ${newPreset.name}`);
            return true;
        } catch (e) {
            logError_ACU('saveApiPreset failed:', e);
            return false;
        }
    },

    /**
     * 加载 API 预设（应用到当前配置）
     * @param {string} presetName - 预设名称
     * @returns {boolean} 加载是否成功
     */
    loadApiPreset: function(presetName) {
        try {
            if (!presetName || typeof presetName !== 'string') {
                logError_ACU('loadApiPreset: preset name is required');
                return false;
            }

            // 调用内部函数加载预设
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

    /**
     * 删除 API 预设
     * @param {string} presetName - 预设名称
     * @returns {boolean} 删除是否成功
     */
    deleteApiPreset: function(presetName) {
        try {
            if (!presetName || typeof presetName !== 'string') {
                logError_ACU('deleteApiPreset: preset name is required');
                return false;
            }

            // 调用内部函数删除预设
            deleteApiPreset_ACU(presetName);
            logDebug_ACU(`API preset deleted: ${presetName}`);
            return true;
        } catch (e) {
            logError_ACU('deleteApiPreset failed:', e);
            return false;
        }
    },

    // =========================
    // AI 调用 API（供前端插件使用）
    // =========================

    /**
     * 调用AI生成内容（支持API预设）
     * @param {Array} messages - 消息数组，格式: [{role: 'system'|'user'|'assistant', content: '...'}]
     * @param {Object} options - 可选配置 { max_tokens: number, presetName: string }
     * @param {string} options.presetName - API预设名称，为空则使用当前配置
     * @returns {Promise<string|null>} AI返回的文本内容，失败返回null
     */
    callAI: async function(messages, options: any = {}) {
        try {
            if (!Array.isArray(messages) || messages.length === 0) {
                logError_ACU('callAI: messages must be a non-empty array');
                return null;
            }

            // [修复] 支持API预设参数
            const presetName = options.presetName || '';
            const apiPresetConfig = getApiConfigByPreset_ACU(presetName);
            const effectiveApiMode = apiPresetConfig.apiMode;
            const effectiveApiConfig = apiPresetConfig.apiConfig || {};
            const effectiveTavernProfile = apiPresetConfig.tavernProfile;
            
            logDebug_ACU(`[callAI] Calling AI with ${messages.length} messages, preset: ${presetName || '当前配置'}, mode: ${effectiveApiMode}`);
            
            const maxTokens = options.max_tokens || effectiveApiConfig.max_tokens || effectiveApiConfig.maxTokens || 4096;
            
            // 使用预设或当前配置的API调用AI
            if (effectiveApiMode === 'tavern') {
                // 使用酒馆Profile
                const profileId = effectiveTavernProfile || settings_ACU.tavernProfile;
                const response = await SillyTavern_API_ACU.ConnectionManagerRequestService.sendRequest(
                    profileId, messages, maxTokens
                );
                if (response && response.result && response.result.choices && response.result.choices[0]) {
                    return response.result.choices[0].message.content;
                }
                // 尝试其他响应格式
                if (response && typeof response.content === 'string') {
                    return response.content;
                }
                logError_ACU('[callAI] Invalid response from Tavern API:', response);
                return null;
            } else {
                // 使用自定义API
                if (effectiveApiConfig.useMainApi) {
                    // 使用酒馆主API（流式传输）
                    if (typeof TavernHelper_API_ACU?.generateRaw === 'function') {
                        const response = await TavernHelper_API_ACU.generateRaw({
                            ordered_prompts: messages,
                            should_stream: settings_ACU.streamingEnabled || false
                        });
                        if (typeof response === 'string') {
                            return response.trim();
                        }
                        logError_ACU('[callAI] Main API did not return string');
                        return null;
                    }
                    logError_ACU('[callAI] TavernHelper.generateRaw not available');
                    return null;
                } else {
                    // 使用独立API配置 - 使用完整的请求格式
                    if (!effectiveApiConfig.url || !effectiveApiConfig.model) {
                        logError_ACU('[callAI] Custom API URL or model not configured');
                        return null;
                    }
                    
                    const url = `/api/backends/chat-completions/generate`;
                    const body = JSON.stringify({
                        "messages": messages,
                        "model": effectiveApiConfig.model,
                        "temperature": effectiveApiConfig.temperature || 1.0,
                        "top_p": effectiveApiConfig.top_p || 0.9,
                        "max_tokens": maxTokens,
                        "stream": settings_ACU.streamingEnabled || false,
                        "chat_completion_source": "custom",
                        "group_names": [],
                        "include_reasoning": false,
                        "reasoning_effort": "medium",
                        "enable_web_search": false,
                        "request_images": false,
                        "custom_prompt_post_processing": "strict",
                        "reverse_proxy": effectiveApiConfig.url,
                        "proxy_password": "",
                        "custom_url": effectiveApiConfig.url,
                        "custom_include_headers": effectiveApiConfig.apiKey ?
                            `Authorization: Bearer ${effectiveApiConfig.apiKey}` : ""
                    });
                    
                    const headers = {
                        ...SillyTavern.getRequestHeaders(),
                        'Content-Type': 'application/json'
                    };
                    const res = await fetch(url, { method: 'POST', headers, body });
                    
                    if (!res.ok) {
                        const errTxt = await res.text();
                        logError_ACU('[callAI] API request failed:', res.status, errTxt);
                        return null;
                    }
                    
                    // 根据streamingEnabled设置选择响应处理方式
                    const content = await handleApiResponse_ACU(res);
                    if (content) {
                        return content;
                    }
                    logError_ACU('[callAI] Invalid response from custom API');
                    return null;
                }
            }
        } catch (e) {
            logError_ACU('[callAI] Failed:', e);
            return null;
        }
    },

    /**
     * 获取最近剧情上下文（从聊天记录，仅AI消息）
     * @param {number} maxTurns - 最大回合数，默认3
     * @returns {string} 剧情上下文文本
     */
    getStoryContext: function(maxTurns = 3) {
        try {
            const chat = SillyTavern_API_ACU?.chat;
            if (!Array.isArray(chat) || chat.length === 0) {
                return '';
            }

            const aiMessages = [];
            let turnCount = 0;

            for (let i = chat.length - 1; i >= 0 && turnCount < maxTurns; i--) {
                const msg = chat[i];
                if (msg && !msg.is_user && msg.mes) {
                    aiMessages.unshift(msg.mes);
                    turnCount++;
                }
            }

            return aiMessages.join('\n\n');
        } catch (e) {
            logError_ACU('getStoryContext failed:', e);
            return '';
        }
    }
};

  // Toast 变量已迁移到 service/runtime/toast-service.ts
