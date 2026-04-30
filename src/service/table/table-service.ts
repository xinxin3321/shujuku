// ═══════════════════════════════════════════════════════════════
// service/table/table-service.ts — 表格数据操作 service 层
// 从 data/repositories/table-repo.ts 迁入（消除 data 层越权）
// ═══════════════════════════════════════════════════════════════

import { getChatArray_ACU, saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../runtime/state-manager';
import { applySpecialIndexSequenceToSummaryTables_ACU } from '../runtime/helpers-table-lock';
import { applyTemplateScopeForCurrentChat_ACU } from '../settings/settings-service';
import { getCurrentWorldbookConfig_ACU } from '../settings/settings-readers';
import { buildSummaryVectorIndexIfNeeded_ACU } from '../vector/vector-index-orchestrator';
import { archiveSummaryVectorIndexNow_ACU } from '../vector/summary-vector-index-archive-service';
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
import { cloneIsolatedData_ACU, writeIsolatedTagData_ACU, writeMessageIdentity_ACU, writeLegacyCompatData_ACU, writeLegacyStandardAndSummary_ACU, readIsolatedTagData_ACU, readLegacyIndependentData_ACU, isLegacyMatchForIsolation_ACU } from '../../data/repositories/chat-message-data-repo';

export interface TableChatPersistOptions_ACU {
  targetMessageIndex?: number;
  targetSheetKeys?: string[] | null;
  updateGroupKeys?: string[] | null;
  /**
   * 实际应计入“本轮已更新”的表。
   * targetSheetKeys 只表示需要保存哪些表；trackingSheetKeys 才表示哪些表确实参与了填表更新。
   */
  trackingSheetKeys?: string[] | null;
  trackAsUpdate?: boolean;
  skipVectorAutoIndex?: boolean;
}

function isSummaryVectorIndexModeEnabledForAutoArchiveGate_ACU(): boolean {
  try {
    return getCurrentWorldbookConfig_ACU()?.summaryVectorIndexModeEnabled === true;
  } catch (error) {
    logWarn_ACU('[向量记忆] 检查纪要向量索引模式失败，保存后自动归档按普通模式继续评估:', error);
    return false;
  }
}

export async function persistTablesToChatMessage_ACU(
  options: TableChatPersistOptions_ACU = {},
): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
  const {
    targetMessageIndex = -1,
    targetSheetKeys = null,
    updateGroupKeys = null,
    trackingSheetKeys = undefined,
    trackAsUpdate = true,
    skipVectorAutoIndex = false,
  } = options;

/**
 * 保存独立表格数据到聊天记录。
 * 返回 { saved: boolean, messageIndex?: number, error?: string }
 * 注意：不再内部调用 refreshMergedDataAndNotify，调用方按需自行刷新。
 */
  const _skipPostRefresh = false;
  if (!currentJsonTableData_ACU) {
    logError_ACU('Save aborted: currentJsonTableData_ACU is null.');
    return { saved: false, error: 'currentJsonTableData is null' };
  }

  const chat = getChatArray_ACU();
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

  let isolatedData = cloneIsolatedData_ACU(targetMessage);

  if (!isolatedData[currentIsolationKey]) {
    isolatedData[currentIsolationKey] = {
      independentData: {},
      modifiedKeys: [],
      updateGroupKeys: [],
    };
  }

  let currentTagData = isolatedData[currentIsolationKey];
  let independentData = currentTagData.independentData || {};

  applySpecialIndexSequenceToSummaryTables_ACU(currentJsonTableData_ACU);

  const normalizedTrackingSheetKeys = Array.isArray(trackingSheetKeys)
    ? [...new Set(trackingSheetKeys)]
    : trackingSheetKeys === null
      ? []
      : targetSheetKeys
        ? [...new Set(targetSheetKeys)]
        : [];

  const sequenceAdjustedTrackingKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU).filter((sheetKey: string) => {
    if (!normalizedTrackingSheetKeys.includes(sheetKey)) return false;
    const table = currentJsonTableData_ACU?.[sheetKey];
    return table && isSummaryOrOutlineTable_ACU(table.name);
  });

  const sequenceAdjustedSaveKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU).filter((sheetKey: string) => {
    if (targetSheetKeys && !targetSheetKeys.includes(sheetKey)) return false;
    const table = currentJsonTableData_ACU?.[sheetKey];
    return table && isSummaryOrOutlineTable_ACU(table.name);
  });

  const actuallyModifiedKeys = [...new Set([...normalizedTrackingSheetKeys, ...sequenceAdjustedTrackingKeys])];

  let keysToSave: string[] = targetSheetKeys
    ? [...new Set([...targetSheetKeys, ...sequenceAdjustedSaveKeys])]
    : targetSheetKeys as string[];

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

  if (trackAsUpdate && actuallyModifiedKeys.length > 0) {
    const existingModifiedKeys = currentTagData.modifiedKeys || [];
    currentTagData.modifiedKeys = [...new Set([...existingModifiedKeys, ...actuallyModifiedKeys])];
    logDebug_ACU(`[Tracking] Recorded modified keys for tag [${currentIsolationKey || '无标签'}] at index ${finalIndex}: ${currentTagData.modifiedKeys.join(', ')}`);
  }

  if (trackAsUpdate && updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length > 0) {
    const existingGroupKeys = currentTagData.updateGroupKeys || [];
    currentTagData.updateGroupKeys = [...new Set([...existingGroupKeys, ...updateGroupKeys])];
    logDebug_ACU(`[Merge Update Success] Group keys for tag [${currentIsolationKey || '无标签'}] recorded at index ${finalIndex}: ${currentTagData.updateGroupKeys.join(', ')}`);
  } else if (trackAsUpdate && updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length === 0) {
    logDebug_ACU(`[Merge Update Failed] No tables were modified for tag [${currentIsolationKey || '无标签'}]. Group keys NOT recorded: ${updateGroupKeys.join(', ')}`);
  }

  writeIsolatedTagData_ACU(targetMessage, currentIsolationKey, currentTagData);

  writeMessageIdentity_ACU(targetMessage, {
    enabled: settings_ACU.dataIsolationEnabled,
    code: settings_ACU.dataIsolationCode,
  });

  writeLegacyCompatData_ACU(targetMessage, independentData, currentTagData.modifiedKeys, currentTagData.updateGroupKeys);

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

  writeLegacyStandardAndSummary_ACU(targetMessage, legacyStandardData, legacySummaryData);

  await saveChatToHost_ACU();

  const summaryVectorIndexModeEnabled = isSummaryVectorIndexModeEnabledForAutoArchiveGate_ACU();
  if (summaryVectorIndexModeEnabled && !skipVectorAutoIndex) {
    try {
      const archiveResult = await archiveSummaryVectorIndexNow_ACU({
        targetMessageIndex: finalIndex,
      });
      if (archiveResult.success && !archiveResult.skipped) {
        logDebug_ACU(`[纪要向量索引] 保存表格后自动同步完成: messageIndex=${archiveResult.messageIndex}, rows=${archiveResult.indexedRowCount}, chunks=${archiveResult.chunkCount}`);
      } else if (archiveResult.skipped) {
        logDebug_ACU(`[纪要向量索引] 保存表格后自动同步跳过: reason=${archiveResult.reason || 'unknown'}`);
      } else if (archiveResult.errors.length > 0) {
        logWarn_ACU(`[纪要向量索引] 保存表格后自动同步失败: ${archiveResult.errors.join(' | ')}`);
      }
    } catch (error) {
      logWarn_ACU('[纪要向量索引] 保存表格后自动同步异常:', error);
    }
  }

  if (!skipVectorAutoIndex && !summaryVectorIndexModeEnabled) {
    try {
      const vectorIndexResult = await buildSummaryVectorIndexIfNeeded_ACU({
        targetMessageIndex: finalIndex,
      });
      if (vectorIndexResult.success && vectorIndexResult.indexedCount > 0) {
        await saveChatToHost_ACU();
        logDebug_ACU(`[向量记忆] 保存后自动索引完成: messageIndex=${finalIndex}, indexed=${vectorIndexResult.indexedCount}, chunks=${vectorIndexResult.chunkCount}`);
      } else if (!vectorIndexResult.success && !vectorIndexResult.skipped && vectorIndexResult.errors.length > 0) {
        logWarn_ACU(`[向量记忆] 保存后自动索引失败: ${vectorIndexResult.errors.join(' | ')}`);
      }
    } catch (error) {
      logWarn_ACU('[向量记忆] 保存后自动索引异常:', error);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  return { saved: true, messageIndex: finalIndex };
}

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
  trackingSheetKeys: string[] | null | undefined = undefined,
): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
  return persistTablesToChatMessage_ACU({
    targetMessageIndex,
    targetSheetKeys,
    updateGroupKeys,
    trackingSheetKeys,
    trackAsUpdate: true,
  });
}

/**
 * 检查当前聊天是否为首次初始化（无任何已有表格数据）。
 */
export async function checkIfFirstTimeInit_ACU(): Promise<boolean> {
  const chat = getChatArray_ACU();
  if (!chat || chat.length === 0) return true;

  const currentIsolationKey = getCurrentIsolationKey_ACU();

  for (let i = chat.length - 1; i >= 0; i--) {
    const message = chat[i];
    if (message.is_user) continue;

    const tagData = readIsolatedTagData_ACU(message, currentIsolationKey);
    if (tagData?.independentData && Object.keys(tagData.independentData).some(k => k.startsWith('sheet_'))) {
      return false;
    }

    const isolationConfig = { enabled: settings_ACU.dataIsolationEnabled, code: settings_ACU.dataIsolationCode };
    if (isLegacyMatchForIsolation_ACU(message, isolationConfig)) {
      const legacyIndep = readLegacyIndependentData_ACU(message);
      if (legacyIndep && Object.keys(legacyIndep).some(k => k.startsWith('sheet_'))) {
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

  const chat = getChatArray_ACU();
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
