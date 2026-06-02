// ═══════════════════════════════════════════════════════════════
// service/table/table-service.ts — 表格数据操作 service 层
// 从 data/repositories/table-repo.ts 迁入（消除 data 层越权）
// ═══════════════════════════════════════════════════════════════

import { getChatArray_ACU, saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU } from '../settings/settings-service';
import {
  attachSeedRowsToCurrentDataFromGuide_ACU,
  buildChatSheetGuideDataFromData_ACU,
  ensureStableRowIdsForSheetContent_ACU,
  ensureChatSheetGuideSeeded_ACU,
  getChatSheetGuideDataForIsolationKey_ACU,
  getSortedSheetKeys_ACU,
  sanitizeSheetForStorage_ACU,
  setChatSheetGuideDataForIsolationKey_ACU,
} from '../template/chat-scope';
import { deleteAllGeneratedEntries_ACU } from '../worldbook/pipeline';
import { mergeAllIndependentTables_ACU } from '../runtime/helpers-remaining';
import { cloneIsolatedData_ACU, writeIsolatedTagData_ACU, writeMessageIdentity_ACU, readIsolatedTagData_ACU, readLegacyIndependentData_ACU, isLegacyMatchForIsolation_ACU } from '../../data/repositories/chat-message-data-repo';
import { applyTableDelta_ACU, buildTableDelta_ACU, isDeltaTagData_ACU } from './table-delta';
import { buildTableUpdateApplyScopeKey_ACU, runTableUpdateApplyWithScopeLock_ACU } from './table-update-queue';
import type { TableDataObject_ACU } from '../../shared/models/table-data';

export interface TableChatPersistOptions_ACU {
  targetMessageIndex?: number;
  targetSheetKeys?: string[] | null;
  updateGroupKeys?: string[] | null;
  /**
   * 只把这些 sheet 记录为“本轮已更新”。
   * targetSheetKeys 决定保存哪些表；trackingSheetKeys 决定哪些表推进自动更新门禁。
   * 未传时沿用 targetSheetKeys，保持旧调用兼容。
   */
  trackingSheetKeys?: string[] | null;
  tableData?: TableDataObject_ACU | null;
  trackAsUpdate?: boolean;
}

export async function persistTablesToChatMessage_ACU(
  options: TableChatPersistOptions_ACU = {},
): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
  return persistTablesToChatMessageWithLockOption_ACU(options, true);
}

async function persistTablesToChatMessageWithLockOption_ACU(
  options: TableChatPersistOptions_ACU = {},
  useScopeLock: boolean,
): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
  const {
    targetMessageIndex = -1,
    targetSheetKeys = null,
    updateGroupKeys = null,
    trackingSheetKeys = targetSheetKeys,
    tableData: explicitTableData,
    trackAsUpdate = true,
  } = options;

/**
 * 保存独立表格数据到聊天记录。
 * 返回 { saved: boolean, messageIndex?: number, error?: string }
 * 注意：不再内部调用 refreshMergedDataAndNotify，调用方按需自行刷新。
 */
  const _skipPostRefresh = false;
  const effectiveTableData = explicitTableData !== undefined ? explicitTableData : currentJsonTableData_ACU;
  if (!effectiveTableData) {
    logError_ACU('Save aborted: currentJsonTableData_ACU is null.');
    return { saved: false, error: 'currentJsonTableData is null' };
  }

  const currentIsolationKey = getCurrentIsolationKey_ACU();
  const scopeKey = buildTableUpdateApplyScopeKey_ACU({
    chatKey: currentChatFileIdentifier_ACU,
    isolationKey: currentIsolationKey,
    targetMessageIndex,
  });

  const persistCore = async () => {
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

    // 查找上一个 AI 楼层的 tagData 作为 delta 的 base
    let prevTagData: import('../../data/models/chat-message-data').IsolationTagData_ACU | null = null;
    for (let i = finalIndex - 1; i >= 0; i--) {
      if (!chat[i].is_user) {
        const td = readIsolatedTagData_ACU(chat[i], currentIsolationKey);
        if (td && td.independentData && Object.keys(td.independentData).some(k => k.startsWith('sheet_'))) {
          prevTagData = td;
        }
        break;
      }
    }

    try {
      const existingGuide = getChatSheetGuideDataForIsolationKey_ACU(currentIsolationKey);
      if (!existingGuide || !Object.keys(existingGuide).some(k => k.startsWith('sheet_'))) {
        const templateObjForSeed = parseTableTemplateJson_ACU({ stripSeedRows: false });
        const guideData = buildChatSheetGuideDataFromData_ACU(effectiveTableData, {
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

    const isolatedData = cloneIsolatedData_ACU(targetMessage);

    if (!isolatedData[currentIsolationKey]) {
      isolatedData[currentIsolationKey] = {
        independentData: {},
        modifiedKeys: [],
        updateGroupKeys: [],
      };
    }

    const currentTagData = isolatedData[currentIsolationKey];
    let independentData: Record<string, any> = {};

    if (isDeltaTagData_ACU(currentTagData) && currentTagData.incrementalData) {
      independentData = prevTagData?.independentData
        ? JSON.parse(JSON.stringify(prevTagData.independentData))
        : JSON.parse(JSON.stringify(currentTagData.independentData || {}));
      const existingCheckpointData = JSON.parse(JSON.stringify(currentTagData.independentData || {}));
      for (const [sheetKey, delta] of Object.entries(currentTagData.incrementalData)) {
        const baseSheet = independentData[sheetKey] || existingCheckpointData[sheetKey];
        if (!baseSheet) {
          logWarn_ACU(`[表格增量] 楼层 #${finalIndex} 既有 delta 表 ${sheetKey} 缺少 base，回退保留当前楼层已存快照`);
          if (existingCheckpointData[sheetKey]) {
            independentData[sheetKey] = existingCheckpointData[sheetKey];
          }
          continue;
        }
        const normalizedBaseSheet = JSON.parse(JSON.stringify(baseSheet));
        if (Array.isArray(normalizedBaseSheet.content)) {
          normalizedBaseSheet.content = ensureStableRowIdsForSheetContent_ACU(normalizedBaseSheet.content);
        }
        independentData[sheetKey] = applyTableDelta_ACU(normalizedBaseSheet, delta, sheetKey);
      }
    } else {
      independentData = JSON.parse(JSON.stringify(currentTagData.independentData || {}));
    }

    let keysToSave: string[] = Array.isArray(targetSheetKeys)
      ? targetSheetKeys.filter((sheetKey): sheetKey is string => typeof sheetKey === 'string' && sheetKey.length > 0)
      : getSortedSheetKeys_ACU(effectiveTableData);

    keysToSave = [...new Set(keysToSave.filter(sheetKey => Boolean(effectiveTableData[sheetKey])))];

    const trackingCandidateKeys = [
      ...keysToSave,
      ...(Array.isArray(trackingSheetKeys)
        ? trackingSheetKeys.filter((sheetKey): sheetKey is string => typeof sheetKey === 'string' && sheetKey.length > 0)
        : []),
    ];
    const trackingKeySet = new Set(
      trackingCandidateKeys.filter(sheetKey => Boolean(effectiveTableData[sheetKey]))
    );
    const actuallyModifiedKeys = [...trackingKeySet];
    const metadataOnlyUpdateGroupKeys = Array.isArray(updateGroupKeys)
      ? [...new Set(updateGroupKeys.filter(sheetKey => trackingKeySet.has(sheetKey) && Boolean(effectiveTableData[sheetKey])))]
      : [];

    if (keysToSave.length === 0 && trackAsUpdate && actuallyModifiedKeys.length > 0) {
      const existingModifiedKeys = currentTagData.modifiedKeys || [];
      currentTagData.modifiedKeys = [...new Set([...existingModifiedKeys, ...actuallyModifiedKeys])];

      if (metadataOnlyUpdateGroupKeys.length > 0) {
        const existingGroupKeys = currentTagData.updateGroupKeys || [];
        currentTagData.updateGroupKeys = [...new Set([...existingGroupKeys, ...metadataOnlyUpdateGroupKeys])];
      }

      writeIsolatedTagData_ACU(targetMessage, currentIsolationKey, currentTagData);
      writeMessageIdentity_ACU(targetMessage, {
        enabled: settings_ACU.dataIsolationEnabled,
        code: settings_ACU.dataIsolationCode,
      });

      await saveChatToHost_ACU();
      return { saved: true, messageIndex: finalIndex };
    }

    keysToSave.forEach(sheetKey => {
      const table = effectiveTableData[sheetKey];
      if (table) {
        const normalizedTable = JSON.parse(JSON.stringify(table));
        if (Array.isArray(normalizedTable.content)) {
          normalizedTable.content = ensureStableRowIdsForSheetContent_ACU(normalizedTable.content);
        }
        independentData[sheetKey] = sanitizeSheetForStorage_ACU(normalizedTable);
      }
    });

    currentTagData.independentData = independentData;

    // ── 增量/checkpoint 模式判定 ──
    let persistedChangedKeySet = new Set<string>();

    if (prevTagData && prevTagData.independentData) {
      // 尝试对目标楼层已合并后的表构建 delta。
      // 同一楼层可能由多个更新组分批写入，必须保留此前组已写入的 incrementalData。
      const incrementalData: Record<string, import('../../data/models/chat-message-data').TableIncrementalUpdate_ACU> = {};
      let anyDegraded = false;

      for (const sheetKey of Object.keys(independentData).filter(k => k.startsWith('sheet_'))) {
        const nextSheet = independentData[sheetKey];
        if (!nextSheet) continue;
        const normalizedBaseSheet = JSON.parse(JSON.stringify(prevTagData.independentData[sheetKey] || null));
        if (normalizedBaseSheet && Array.isArray(normalizedBaseSheet.content)) {
          normalizedBaseSheet.content = ensureStableRowIdsForSheetContent_ACU(normalizedBaseSheet.content);
        }
        const result = buildTableDelta_ACU(normalizedBaseSheet, nextSheet, sheetKey);
        if (result.degraded) {
          anyDegraded = true;
          logDebug_ACU(`[表格增量] ${sheetKey} 退化: ${result.degradeReason}，本楼层将使用 checkpoint 模式`);
          break;
        }
        if (result.delta && (result.delta.rowDeltas.length > 0 || result.delta.metaChanged)) {
          incrementalData[sheetKey] = result.delta;
        }
      }

      if (!anyDegraded) {
        // delta 模式：写入增量数据，independentData 清空以节省存储空间
        currentTagData.incrementalData = incrementalData;
        currentTagData.independentData = {};
        currentTagData._acu_storage_mode = 'delta';
        currentTagData._acu_storage_version = 1;
        persistedChangedKeySet = new Set(Object.keys(incrementalData));
        logDebug_ACU(`[表格增量] 楼层 #${finalIndex} 使用 delta 模式，${Object.keys(incrementalData).length} 张表有变更`);
      } else {
        // checkpoint 模式：退化，写完整快照
        delete currentTagData.incrementalData;
        currentTagData._acu_storage_mode = 'checkpoint';
        currentTagData._acu_storage_version = 1;
        persistedChangedKeySet = new Set(actuallyModifiedKeys.filter(sheetKey => Boolean(independentData[sheetKey])));
        logDebug_ACU(`[表格Checkpoint] 楼层 #${finalIndex} 使用 checkpoint 模式`);
      }
    } else {
      // 无上一楼层 base → checkpoint 模式（首楼层或首次出现该标签）
      delete currentTagData.incrementalData;
      currentTagData._acu_storage_mode = 'checkpoint';
      currentTagData._acu_storage_version = 1;
      persistedChangedKeySet = new Set(actuallyModifiedKeys.filter(sheetKey => Boolean(independentData[sheetKey])));
      logDebug_ACU(`[表格Checkpoint] 楼层 #${finalIndex} 无 base，使用 checkpoint 模式`);
    }

    const trackingModifiedKeys = actuallyModifiedKeys;
    const trackingUpdateGroupKeys = metadataOnlyUpdateGroupKeys;

    if (trackAsUpdate && trackingModifiedKeys.length > 0) {
      const existingModifiedKeys = currentTagData.modifiedKeys || [];
      currentTagData.modifiedKeys = [...new Set([...existingModifiedKeys, ...trackingModifiedKeys])];
      logDebug_ACU(`[Tracking] Recorded modified keys for tag [${currentIsolationKey || '无标签'}] at index ${finalIndex}: ${currentTagData.modifiedKeys.join(', ')}`);
    }

    if (trackAsUpdate && trackingUpdateGroupKeys.length > 0 && trackingModifiedKeys.length > 0) {
      const existingGroupKeys = currentTagData.updateGroupKeys || [];
      currentTagData.updateGroupKeys = [...new Set([...existingGroupKeys, ...trackingUpdateGroupKeys])];
      logDebug_ACU(`[Merge Update Success] Group keys for tag [${currentIsolationKey || '无标签'}] recorded at index ${finalIndex}: ${currentTagData.updateGroupKeys.join(', ')}`);
    } else if (trackAsUpdate && updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length === 0) {
      logDebug_ACU(`[Merge Update Failed] No tables were modified for tag [${currentIsolationKey || '无标签'}]. Group keys NOT recorded: ${updateGroupKeys.join(', ')}`);
    } else if (trackAsUpdate && updateGroupKeys && updateGroupKeys.length > 0 && trackingUpdateGroupKeys.length === 0) {
      logDebug_ACU(`[Merge Update Skipped] No tracked group keys intersected for tag [${currentIsolationKey || '无标签'}]. Group keys NOT recorded: ${updateGroupKeys.join(', ')}`);
    }

    writeIsolatedTagData_ACU(targetMessage, currentIsolationKey, currentTagData);

    writeMessageIdentity_ACU(targetMessage, {
      enabled: settings_ACU.dataIsolationEnabled,
      code: settings_ACU.dataIsolationCode,
    });

    logDebug_ACU(`Saved ${keysToSave.length} tables for tag [${currentIsolationKey || '无标签'}] to message at index ${finalIndex}. Actually modified: ${actuallyModifiedKeys.length} tables.`);

    await saveChatToHost_ACU();

    return { saved: true, messageIndex: finalIndex };
  };

  if (!useScopeLock) {
    return persistCore();
  }

  return runTableUpdateApplyWithScopeLock_ACU(scopeKey, persistCore);
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
  trackingSheetKeys: string[] | null = targetSheetKeys,
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
 * 在调用方已经持有 table update scope 锁时保存独立表格数据。
 * 仅供同 scope 的 parse/apply/save 连续临界区使用；外部普通调用必须继续使用
 * saveIndependentTableToChatHistory_ACU，避免绕过目标楼层串行保护。
 */
export async function saveIndependentTableToChatHistoryWithinScopeLock_ACU(
  targetMessageIndex = -1,
  targetSheetKeys: string[] | null = null,
  updateGroupKeys: string[] | null = null,
  _skipPostRefresh = false,
  trackingSheetKeys: string[] | null = targetSheetKeys,
): Promise<{ saved: boolean; messageIndex?: number; error?: string }> {
  return persistTablesToChatMessageWithLockOption_ACU({
    targetMessageIndex,
    targetSheetKeys,
    updateGroupKeys,
    trackingSheetKeys,
    trackAsUpdate: true,
  }, false);
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
