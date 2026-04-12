import { SillyTavern_API_ACU } from '../../shared/host-api';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';

// 注入点：由 service 层在启动时设置，打破 data→service/presentation 循环依赖
let _deps: any = {};
export function _injectTableRepoDeps(deps: {
  getSettings: () => any;
  getCurrentJsonTableData: () => any;
  setCurrentJsonTableData: (v: any) => void;
  getCurrentIsolationKey: () => string;
  showToastr: (...args: any[]) => void;
  applyTemplateScopeForCurrentChat: (...args: any[]) => any;
  attachSeedRowsToCurrentDataFromGuide: (...args: any[]) => any;
  buildChatSheetGuideDataFromData: (...args: any[]) => any;
  ensureChatSheetGuideSeeded: (...args: any[]) => any;
  getChatSheetGuideDataForIsolationKey: (...args: any[]) => any;
  getSortedSheetKeys: (...args: any[]) => any;
  sanitizeSheetForStorage: (...args: any[]) => any;
  setChatSheetGuideDataForIsolationKey: (...args: any[]) => any;
  deleteAllGeneratedEntries: (...args: any[]) => any;
  refreshMergedDataAndNotify: (...args: any[]) => any;
  mergeAllIndependentTables: (...args: any[]) => any;
}) {
  _deps = deps;
}

/**
 * data/repositories/table-repo.ts — 表格数据 CRUD
 * 从 src/core/05_core_tail.js:2409~2693 迁移而来。
 */
  export async function saveIndependentTableToChatHistory_ACU(targetMessageIndex = -1, targetSheetKeys = null, updateGroupKeys = null, skipPostRefresh = false) {
    const currentJsonTableData = _deps.getCurrentJsonTableData?.();
    if (!currentJsonTableData) {
        logError_ACU('Save aborted: currentJsonTableData_ACU is null.');
        return false;
    }

    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) {
        logError_ACU('Save failed: Chat history is empty.');
        return false;
    }

    let targetMessage = null;
    let finalIndex = -1;

    if (targetMessageIndex !== -1 && chat[targetMessageIndex] && !chat[targetMessageIndex].is_user) {
        targetMessage = chat[targetMessageIndex];
        finalIndex = targetMessageIndex;
    } else {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user) {
                targetMessage = chat[i];
                finalIndex = i;
                break;
            }
        }
    }

    if (!targetMessage) {
        logWarn_ACU('Save failed: No AI message found.');
        return false;
    }

    const currentIsolationKey = _deps.getCurrentIsolationKey?.() ?? '';

    try {
        const existingGuide = _deps.getChatSheetGuideDataForIsolationKey?.(currentIsolationKey);
        if (!existingGuide || !Object.keys(existingGuide).some(k => k.startsWith('sheet_'))) {
            const templateObjForSeed = parseTableTemplateJson_ACU({ stripSeedRows: false });
            const guideData = _deps.buildChatSheetGuideDataFromData?.(currentJsonTableData, {
                preserveSeedRowsFromGuideData: null,
                seedRowsFromTemplateObj: templateObjForSeed,
            });
            if (guideData && Object.keys(guideData).some(k => k.startsWith('sheet_'))) {
                _deps.setChatSheetGuideDataForIsolationKey?.(currentIsolationKey, guideData, { reason: 'first_fill' });
                logDebug_ACU(`[SheetGuide] Created chat sheet guide for tag [${currentIsolationKey || '无标签'}] (tables=${Object.keys(guideData).filter(k => k.startsWith('sheet_')).length}).`);
            }
        }
    } catch (e) {
        logWarn_ACU('[SheetGuide] Failed to create sheet guide on first fill:', e);
    }

    let isolatedData = targetMessage.TavernDB_ACU_IsolatedData ? JSON.parse(JSON.stringify(targetMessage.TavernDB_ACU_IsolatedData)) : {};
    
    if (!isolatedData[currentIsolationKey]) {
        isolatedData[currentIsolationKey] = {
            independentData: {},
            modifiedKeys: [],
            updateGroupKeys: []
        };
    }
    
    let currentTagData = isolatedData[currentIsolationKey];
    let independentData = currentTagData.independentData || {};

    const actuallyModifiedKeys = targetSheetKeys ? [...targetSheetKeys] : [];

    let keysToSave = targetSheetKeys;
    
    if (!keysToSave) {
        keysToSave = _deps.getSortedSheetKeys?.(currentJsonTableData) ?? [];
    }

    keysToSave.forEach(sheetKey => {
        const table = currentJsonTableData[sheetKey];
        if (table) {
            independentData[sheetKey] = _deps.sanitizeSheetForStorage?.(JSON.parse(JSON.stringify(table)));
        }
    });

    currentTagData.independentData = independentData;
    
    if (actuallyModifiedKeys.length > 0) {
        const existingModifiedKeys = currentTagData.modifiedKeys || [];
        currentTagData.modifiedKeys = [...new Set([...existingModifiedKeys, ...actuallyModifiedKeys])];
        logDebug_ACU(`[Tracking] Recorded modified keys for tag [${currentIsolationKey || '无标签'}] at index ${finalIndex}: ${currentTagData.modifiedKeys.join(', ')}`);
    }
    
    if (updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length > 0) {
        const existingGroupKeys = currentTagData.updateGroupKeys || [];
        currentTagData.updateGroupKeys = [...new Set([...existingGroupKeys, ...updateGroupKeys])];
        logDebug_ACU(`[Merge Update Success] Group keys for tag [${currentIsolationKey || '无标签'}] recorded at index ${finalIndex}: ${currentTagData.updateGroupKeys.join(', ')}`);
    } else if (updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length === 0) {
        logDebug_ACU(`[Merge Update Failed] No tables were modified for tag [${currentIsolationKey || '无标签'}]. Group keys NOT recorded: ${updateGroupKeys.join(', ')}`);
    }

    isolatedData[currentIsolationKey] = currentTagData;
    targetMessage.TavernDB_ACU_IsolatedData = isolatedData;

    const settings = _deps.getSettings?.() ?? {};
    if (settings.dataIsolationEnabled) {
         targetMessage.TavernDB_ACU_Identity = settings.dataIsolationCode;
    } else {
         delete targetMessage.TavernDB_ACU_Identity;
    }
    
    targetMessage.TavernDB_ACU_IndependentData = independentData;
    targetMessage.TavernDB_ACU_ModifiedKeys = currentTagData.modifiedKeys;
    targetMessage.TavernDB_ACU_UpdateGroupKeys = currentTagData.updateGroupKeys;

    logDebug_ACU(`Saved ${keysToSave.length} tables for tag [${currentIsolationKey || '无标签'}] to message at index ${finalIndex}. Actually modified: ${actuallyModifiedKeys.length} tables.`);

    const legacyStandardData = { mate: { type: 'chatSheets', version: 1 } };
    const legacySummaryData = { mate: { type: 'chatSheets', version: 1 } };
    
    keysToSave.forEach(sheetKey => {
        const table = currentJsonTableData[sheetKey];
        if (table) {
            if (isSummaryOrOutlineTable_ACU(table.name)) {
                legacySummaryData[sheetKey] = _deps.sanitizeSheetForStorage?.(JSON.parse(JSON.stringify(table)));
            } else {
                legacyStandardData[sheetKey] = _deps.sanitizeSheetForStorage?.(JSON.parse(JSON.stringify(table)));
            }
        }
    });
    
    if (Object.keys(legacyStandardData).some(k => k.startsWith('sheet_'))) {
        targetMessage.TavernDB_ACU_Data = legacyStandardData;
    }
    if (Object.keys(legacySummaryData).some(k => k.startsWith('sheet_'))) {
        targetMessage.TavernDB_ACU_SummaryData = legacySummaryData;
    }

    await SillyTavern_API_ACU.saveChat();
    
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!skipPostRefresh) {
        await _deps.refreshMergedDataAndNotify?.();
    }

    return true;
  }

  export async function checkIfFirstTimeInit_ACU() {
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) return true;
    
    const currentIsolationKey = _deps.getCurrentIsolationKey?.() ?? '';
    const settings = _deps.getSettings?.() ?? {};
    
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (message.is_user) continue;
        
        if (message.TavernDB_ACU_IsolatedData && message.TavernDB_ACU_IsolatedData[currentIsolationKey]) {
            const tagData = message.TavernDB_ACU_IsolatedData[currentIsolationKey];
            if (tagData.independentData && Object.keys(tagData.independentData).some(k => k.startsWith('sheet_'))) {
                return false;
            }
        }
        
        if (message.TavernDB_ACU_IndependentData) {
            const msgIdentity = message.TavernDB_ACU_Identity;
            let isMatch = false;
            if (settings.dataIsolationEnabled) {
                isMatch = (msgIdentity === settings.dataIsolationCode);
            } else {
                isMatch = !msgIdentity;
            }
            if (isMatch && Object.keys(message.TavernDB_ACU_IndependentData).some(k => k.startsWith('sheet_'))) {
                return false;
            }
        }
    }
    
    return true;
  }

  async function initializeJsonTableInChatHistory_ACU() {
    logDebug_ACU('No database found in chat history. Initializing a new one from template.');
    
    try {
        _deps.setCurrentJsonTableData?.(parseTableTemplateJson_ACU({ stripSeedRows: true }));
        logDebug_ACU('Successfully initialized database in memory.');
    } catch (error) {
        logError_ACU('Failed to parse template and initialize database in memory:', error);
        _deps.showToastr?.('error', '从模板解析数据库失败，请检查模板格式。');
        _deps.setCurrentJsonTableData?.(null);
        return false;
    }
    if (!_deps.getCurrentJsonTableData?.()) {
        _deps.showToastr?.('error', '从模板解析数据库失败，请检查模板格式。');
        return false;
    }

    logDebug_ACU('Database initialized in memory. It will be saved to chat history on the first update.');

    try {
        const guideData = await _deps.ensureChatSheetGuideSeeded?.({ reason: 'init_chat_seedrows' });
        if (guideData) {
            _deps.attachSeedRowsToCurrentDataFromGuide?.(guideData);
        }
    } catch (e) {
        logWarn_ACU('[SheetGuide] Failed to ensure sheet guide during initialization:', e);
    }

    try {
        await _deps.deleteAllGeneratedEntries?.();
        logDebug_ACU('Deleted all generated lorebook entries during initialization.');
    } catch (deleteError) {
        logWarn_ACU('Failed to delete generated lorebook entries during initialization:', deleteError);
    }
    
    return true;
  }

  export async function loadOrCreateJsonTableFromChatHistory_ACU() {
    _deps.setCurrentJsonTableData?.(null);
    logDebug_ACU('Attempting to load database from chat history...');

    const chat = SillyTavern_API_ACU.chat;
    _deps.applyTemplateScopeForCurrentChat?.();
    if (!chat || chat.length === 0) {
      logDebug_ACU('Chat history is empty. Initializing new database.');
      await initializeJsonTableInChatHistory_ACU();
      return;
    }

    const mergedData = await _deps.mergeAllIndependentTables?.();

    if (mergedData) {
        _deps.setCurrentJsonTableData?.(mergedData);
        logDebug_ACU('Database content successfully merged (tag-aware) and loaded into memory.');
        await _deps.refreshMergedDataAndNotify?.();
        return;
    }

    logDebug_ACU('No database found for current tag in chat history. Initializing a new one.');
    await initializeJsonTableInChatHistory_ACU();
    if (_deps.getCurrentJsonTableData?.()) {
        await _deps.refreshMergedDataAndNotify?.();
    }
  }
