// ═══════════════════════════════════════════════════════════════
// service/table/table-service.ts — 表格数据操作 service 层
// 从 data/repositories/table-repo.ts 迁入（消除 data 层越权）
// ═══════════════════════════════════════════════════════════════

import { SillyTavern_API_ACU } from '../../shared/host-api';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU } from '../settings/settings-service';
import {
  attachSeedRowsToCurrentDataFromGuide_ACU,
  buildChatSheetGuideDataFromData_ACU,
  ensureChatSheetGuideSeeded_ACU,
  getChatSheetGuideDataForIsolationKey_ACU,
  getSortedSheetKeys_ACU,
  sanitizeSheetForStorage_ACU,
  setChatSheetGuideDataForIsolationKey_ACU,
} from '../template/chat-scope';
import { deleteAllGeneratedEntries_ACU } from '../worldbook/pipeline';
import { mergeAllIndependentTables_ACU } from '../runtime/helpers-remaining';

/**
 * 保存独立表格数据到聊天记录。
 * 返回 { saved: boolean, messageIndex?: number, error?: string }
 * 注意：不再内部调用 refreshMergedDataAndNotify，调用方按需自行刷新。
 */
export async function saveIndependentTableToChatHistory_ACU(
  targetMessageIndex = -1,
  targetSheetKeys: string[] | null = null,
  updateGroupKeys: string[] | null = null,
  _skipPostRefresh = false,
): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
  if (!currentJsonTableData_ACU) {
    logError_ACU('Save aborted: currentJsonTableData_ACU is null.');
    return { saved: false, error: 'currentJsonTableData is null' };
  }

  const chat = SillyTavern_API_ACU.chat;
  if (!chat || chat.length === 0) {
    logError_ACU('Save failed: Chat history is empty.');
    return { saved: false, error: 'chat history is empty' };
  }

  let targetMessage: any = null;
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
    return { saved: false, error: 'no AI message found' };
  }

  const currentIsolationKey = getCurrentIsolationKey_ACU();

  try {
    const existingGuide = getChatSheetGuideDataForIsolationKey_ACU(currentIsolationKey);
    if (!existingGuide || !Object.keys(existingGuide).some(k => k.startsWith('sheet_'))) {
      const templateObjForSeed = parseTableTemplateJson_ACU({ stripSeedRows: false });
      const guideData = buildChatSheetGuideDataFromData_ACU(currentJsonTableData_ACU, {
        preserveSeedRowsFromGuideData: null,
        seedRowsFromTemplateObj: templateObjForSeed,
      });
      if (guideData && Object.keys(guideData).some(k => k.startsWith('sheet_'))) {
        setChatSheetGuideDataForIsolationKey_ACU(currentIsolationKey, guideData, { reason: 'first_fill' });
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
      updateGroupKeys: [],
    };
  }

  let currentTagData = isolatedData[currentIsolationKey];
  let independentData = currentTagData.independentData || {};

  const actuallyModifiedKeys = targetSheetKeys ? [...targetSheetKeys] : [];

  let keysToSave: string[] = targetSheetKeys as string[];

  if (!keysToSave) {
    keysToSave = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
  }

  keysToSave.forEach(sheetKey => {
    const table = currentJsonTableData_ACU[sheetKey];
    if (table) {
      independentData[sheetKey] = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(table)));
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

  if (settings_ACU.dataIsolationEnabled) {
    targetMessage.TavernDB_ACU_Identity = settings_ACU.dataIsolationCode;
  } else {
    delete targetMessage.TavernDB_ACU_Identity;
  }

  targetMessage.TavernDB_ACU_IndependentData = independentData;
  targetMessage.TavernDB_ACU_ModifiedKeys = currentTagData.modifiedKeys;
  targetMessage.TavernDB_ACU_UpdateGroupKeys = currentTagData.updateGroupKeys;

  logDebug_ACU(`Saved ${keysToSave.length} tables for tag [${currentIsolationKey || '无标签'}] to message at index ${finalIndex}. Actually modified: ${actuallyModifiedKeys.length} tables.`);

  const legacyStandardData: any = { mate: { type: 'chatSheets', version: 1 } };
  const legacySummaryData: any = { mate: { type: 'chatSheets', version: 1 } };

  keysToSave.forEach(sheetKey => {
    const table = currentJsonTableData_ACU[sheetKey];
    if (table) {
      if (isSummaryOrOutlineTable_ACU(table.name)) {
        legacySummaryData[sheetKey] = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(table)));
      } else {
        legacyStandardData[sheetKey] = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(table)));
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

  return { saved: true, messageIndex: finalIndex };
}

/**
 * 检查当前聊天是否为首次初始化（无任何已有表格数据）。
 */
export async function checkIfFirstTimeInit_ACU(): Promise<boolean> {
  const chat = SillyTavern_API_ACU.chat;
  if (!chat || chat.length === 0) return true;

  const currentIsolationKey = getCurrentIsolationKey_ACU();

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
      if (settings_ACU.dataIsolationEnabled) {
        isMatch = (msgIdentity === settings_ACU.dataIsolationCode);
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

/**
 * 从模板初始化数据库到内存（不写聊天记录）。
 * 返回 { initialized: boolean, error?: string }
 */
async function initializeJsonTableInChatHistory_ACU(): Promise<{ initialized: boolean; error?: string }> {
  logDebug_ACU('No database found in chat history. Initializing a new one from template.');

  try {
    _set_currentJsonTableData_ACU(parseTableTemplateJson_ACU({ stripSeedRows: true }));
    logDebug_ACU('Successfully initialized database in memory.');
  } catch (error) {
    logError_ACU('Failed to parse template and initialize database in memory:', error);
    _set_currentJsonTableData_ACU(null);
    return { initialized: false, error: '从模板解析数据库失败，请检查模板格式。' };
  }
  if (!currentJsonTableData_ACU) {
    return { initialized: false, error: '从模板解析数据库失败，请检查模板格式。' };
  }

  logDebug_ACU('Database initialized in memory. It will be saved to chat history on the first update.');

  try {
    const guideData = await ensureChatSheetGuideSeeded_ACU({ reason: 'init_chat_seedrows' });
    if (guideData) {
      attachSeedRowsToCurrentDataFromGuide_ACU(guideData);
    }
  } catch (e) {
    logWarn_ACU('[SheetGuide] Failed to ensure sheet guide during initialization:', e);
  }

  try {
    await deleteAllGeneratedEntries_ACU();
    logDebug_ACU('Deleted all generated lorebook entries during initialization.');
  } catch (deleteError) {
    logWarn_ACU('Failed to delete generated lorebook entries during initialization:', deleteError);
  }

  return { initialized: true };
}

/**
 * 从聊天记录加载或创建表格数据到内存。
 * 返回 { loaded: boolean, source: 'merged'|'initialized'|'empty', error?: string }
 * 注意：不再内部调用 refreshMergedDataAndNotify，调用方按需自行刷新。
 */
export async function loadOrCreateJsonTableFromChatHistory_ACU(): Promise<{
  loaded: boolean;
  source: 'merged' | 'initialized' | 'empty';
  error?: string;
}> {
  _set_currentJsonTableData_ACU(null);
  logDebug_ACU('Attempting to load database from chat history...');

  const chat = SillyTavern_API_ACU.chat;
  applyTemplateScopeForCurrentChat_ACU();
  if (!chat || chat.length === 0) {
    logDebug_ACU('Chat history is empty. Initializing new database.');
    const initResult = await initializeJsonTableInChatHistory_ACU();
    return { loaded: initResult.initialized, source: 'initialized', error: initResult.error };
  }

  const mergedData = await mergeAllIndependentTables_ACU();

  if (mergedData) {
    _set_currentJsonTableData_ACU(mergedData);
    logDebug_ACU('Database content successfully merged (tag-aware) and loaded into memory.');
    return { loaded: true, source: 'merged' };
  }

  logDebug_ACU('No database found for current tag in chat history. Initializing a new one.');
  const initResult = await initializeJsonTableInChatHistory_ACU();
  return { loaded: initResult.initialized, source: 'initialized', error: initResult.error };
}
