// import-process.ts — 导入编排逻辑（presentation 层：涉及 UI 读取和状态更新）


import { STORAGE_KEY_IMPORTED_ENTRIES_ACU, STORAGE_KEY_IMPORTED_STATUS_ACU, STORAGE_KEY_IMPORTED_STATUS_FULL_ACU, STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU, STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU } from '../../shared/data-constants';

import { importTempGet_ACU, importTempRemove_ACU, importTempSet_ACU } from '../../shared/idb-import-temp';
import { getImportWorldbookTarget_ACU, updateImportStatusUI_ACU } from '../components/import-status-ui';
import { getImportSelectionFromUI_ACU } from '../components/table-selector';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU, IMPORTED_ENTRY_PREFIX_ACU, getImportJsonStorageComment_ACU } from '../../shared/constants';
import { TavernHelper_API_ACU, currentJsonTableData_ACU, settings_ACU, _set_currentJsonTableData_ACU} from '../../service/runtime/state-manager';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { proceedWithCardUpdate_ACU } from './update-process';
import { updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { setImportInjectButtonEnabled_ACU } from '../components/import-status-ui';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import { allocOrder_ACU, buildUsedOrderSet_ACU, getInjectionTargetLorebook_ACU, getIsolationPrefix_ACU } from '../../service/worldbook/injection-engine';

export   async function processImportedTxtAsUpdates_ACU() {
      // 外部导入：按"自选表格"处理与注入（与手动填表一致的表选择体验）
      const $injectButton: any = null; // 旧闭包变量，现在通过 UI 层控制

      const savedEntriesJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
      if (!savedEntriesJson) {
          logDebug_ACU('No imported entries found in storage.');
          return;
      }
      
      let allChunks;
      try {
          allChunks = JSON.parse(savedEntriesJson);
      } catch (e) {
          logError_ACU('Could not parse imported entries from storage.', e);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
          void updateImportStatusUI_ACU();
          return;
      }

      if (!Array.isArray(allChunks) || allChunks.length === 0) return;

      // 先获取导入目标世界书
      const importTargetLorebook = await getImportWorldbookTarget_ACU();
      if (!importTargetLorebook) {
          showToastr_ACU('error', '无法注入：未设置导入数据注入目标世界书。');
          return;
      }
      const importTarget = importTargetLorebook === 'character'
          ? await TavernHelper_API_ACU.getCurrentCharPrimaryLorebook()
          : importTargetLorebook;
      if (!importTarget) {
          showToastr_ACU('error', '无法注入：未找到实际导入目标世界书。');
          return;
      }

      // 读取当前表选择（空且曾选择过 => 不允许执行）
      const selectedSheetKeys = getImportSelectionFromUI_ACU();
      if (settings_ACU.hasImportTableSelection && (!selectedSheetKeys || selectedSheetKeys.length === 0)) {
          showToastr_ACU('error', '未选择任何表格，无法注入。请先在"注入表选择"中勾选至少一个表。');
          return;
      }
      const selectionSig = JSON.stringify(selectedSheetKeys || []);
      const modeSuffix = '-Selected';

      // 新机制：只使用一个断点 key（旧的 standard/summary/full 断点仍会被清理，但不再使用）
      const statusStorageKey = STORAGE_KEY_IMPORTED_STATUS_ACU;

      let status = { total: allChunks.length, currentIndex: 0, selectionSig };
      const savedStatusJson = await importTempGet_ACU(statusStorageKey);
      if (savedStatusJson) {
          try {
              const savedStatus = JSON.parse(savedStatusJson);
              if (savedStatus.total === allChunks.length && (typeof savedStatus.selectionSig === 'undefined' || savedStatus.selectionSig === selectionSig)) {
                  status = { ...savedStatus, selectionSig };
              }
          } catch(e) { /* use default */ }
      }

      if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(false);

      // 如果是全新导入，则重置内存中的数据库为模板初始状态，并立即写入目标世界书的临时 JSON 条目
      if (status.currentIndex === 0) {
          logDebug_ACU(`Starting fresh import (selected tables), resetting in-memory database from template.`);
          try {
              _set_currentJsonTableData_ACU(parseTableTemplateJson_ACU({ stripSeedRows: true }));
          } catch(e) {
              logError_ACU("Failed to parse table template for import.", e);
              showToastr_ACU('error', "无法为导入解析数据库模板。");
              $injectButton.prop('disabled', false);
              return;
          }
          if (!currentJsonTableData_ACU) {
              showToastr_ACU('error', "无法为导入解析数据库模板。");
              $injectButton.prop('disabled', false);
              return;
          }
          try {
              await saveImportedJsonDataToLorebook_ACU(importTarget, currentJsonTableData_ACU, modeSuffix);
          } catch (e) {
              logError_ACU('[外部导入] Failed to initialize ImportedJsonData source entry from template.', e);
              showToastr_ACU('error', '无法初始化外部导入的临时数据库条目。');
              $injectButton.prop('disabled', false);
              return;
          }
      } else {
          let restoredImportData = null;
          try {
              restoredImportData = await loadImportedJsonDataFromLorebook_ACU(importTarget, modeSuffix);
          } catch (e) {
              logError_ACU('[外部导入] Failed to load ImportedJsonData source entry for resume.', e);
          }

          if (restoredImportData && typeof restoredImportData === 'object') {
              _set_currentJsonTableData_ACU(restoredImportData);
              logDebug_ACU(`[外部导入] Resumed import from ImportedJsonData source entry. currentIndex=${status.currentIndex}`);
          } else if (currentJsonTableData_ACU) {
              logWarn_ACU('[外部导入] ImportedJsonData source entry missing during resume, falling back to in-memory data.');
          } else {
              showToastr_ACU('error', '无法继续导入：未找到临时数据库条目，请重新开始导入。');
              $injectButton.prop('disabled', false);
              return;
          }
      }

      // 自选表格：用统一模式 + 传入 targetSheetKeys，让 AI 只看/只改选中的表
      const updateMode = 'manual_unified';

      for (let i = status.currentIndex; i < allChunks.length; i++) {
          const chunk = allChunks[i];
          const mockMessage = { is_user: false, mes: chunk.content, name: '导入文本' };
          
          let success = false;
          let attempt = 0;
          const MAX_RETRIES = 3;

          while (attempt < MAX_RETRIES && !success) {
              const toastMessage = `正在处理 ${i + 1}/${allChunks.length} (尝试 ${attempt + 1}/${MAX_RETRIES})...`;
              success = await proceedWithCardUpdate_ACU([mockMessage], toastMessage, -1, true, updateMode, false, selectedSheetKeys);
              
              if (!success) {
                  attempt++;
                  logError_ACU(`处理区块 ${i + 1} 失败, 尝试次数 ${attempt}:`, "Update process returned false.");
                  if (attempt >= MAX_RETRIES) {
                      status.currentIndex = i;
                      await importTempSet_ACU(statusStorageKey, JSON.stringify(status));
                      showToastr_ACU('error', `处理失败次数过多，操作已终止。请稍后点击"继续"重试。`);
                      void updateImportStatusUI_ACU();
                      $injectButton.prop('disabled', false);
                      return;
                  }
                  await new Promise(resolve => setTimeout(resolve, 2000));
              }
          }
          
          try {
              await saveImportedJsonDataToLorebook_ACU(importTarget, currentJsonTableData_ACU, modeSuffix);
          } catch (e) {
              logError_ACU(`[外部导入] Failed to persist ImportedJsonData after chunk ${i + 1}.`, e);
              showToastr_ACU('error', `第 ${i + 1} 个分块处理成功，但无法保存临时数据库条目，已停止继续导入。`);
              $injectButton.prop('disabled', false);
              return;
          }

          status.currentIndex = i + 1;
          await importTempSet_ACU(statusStorageKey, JSON.stringify(status));
      }

      // [新逻辑] 所有分块处理完毕后的操作
      // 1. 按"自选表格"筛选最终数据（每批作为独立流程）
      // [修复] 最终注入前优先从目标世界书里的 ImportedJsonData 临时条目重载一次，
      // 避免 UI 刷新/回调链把 currentJsonTableData_ACU 覆盖回旧值或空模板。
      let finalImportSourceData = currentJsonTableData_ACU;
      try {
          const persistedFinalData = await loadImportedJsonDataFromLorebook_ACU(importTarget, modeSuffix);
          if (persistedFinalData && typeof persistedFinalData === 'object') {
              finalImportSourceData = persistedFinalData;
              _set_currentJsonTableData_ACU(persistedFinalData);
              logDebug_ACU('[外部导入] Reloaded final import data from ImportedJsonData source entry before worldbook creation.');
          }
      } catch (e) {
          logWarn_ACU('[外部导入] Failed to reload ImportedJsonData source entry before final worldbook creation, falling back to in-memory data:', e);
      }

      let finalDataForInjection = JSON.parse(JSON.stringify(finalImportSourceData));
      if (selectedSheetKeys && Array.isArray(selectedSheetKeys) && selectedSheetKeys.length > 0) {
          const tableKeys = getSortedSheetKeys_ACU(finalDataForInjection);
          tableKeys.forEach(sheetKey => {
              if (!selectedSheetKeys.includes(sheetKey)) delete finalDataForInjection[sheetKey];
          });
      }

      // 2. 将筛选后的数据注入到目标世界书（使用与正文更新相同的逻辑）
      showToastr_ACU('info', `所有文本块已处理完毕，正在生成最终的世界书条目（自选表格注入）...`);
      
      // [修复] 外部导入时使用 targetLorebookOverride 参数直接指定目标世界书
      // 避免临时修改 worldbookConfig.injectionTarget 被 getCurrentCharSettings_ACU() 的兜底补齐逻辑覆盖
      const originalData = currentJsonTableData_ACU;
      
      _set_currentJsonTableData_ACU(finalDataForInjection);
      await updateReadableLorebookEntry_ACU(true, true, importTarget); // [外部导入] 添加 isImport 标志和 targetLorebookOverride 参数
      
      // 恢复原始数据
      _set_currentJsonTableData_ACU(originalData);
      logDebug_ACU('[外部导入] Final worldbook entries created from ImportedJsonData source entry.');

      // 3. 外部导入完成：删除"本地数据源 JSON 临时条目"，并解除与该世界书的绑定
      try {
          const deleted = await deleteImportedJsonDataFromLorebook_ACU(importTarget, modeSuffix);
          if (deleted) {
              logDebug_ACU('[外部导入] Deleted ImportedJsonData source entry to detach from worldbook.');
          }
      } catch (e) {
          logWarn_ACU('[外部导入] Failed to delete ImportedJsonData source entry:', e);
      }

      // [新增] 外部导入完成后：清理目标世界书中本插件生成的旧条目（不带"外部导入-"前缀的条目）
      // 避免出现重复条目：既有"外部导入-"前缀的新条目，也有不带前缀的旧条目
      try {
          const IMPORT_PREFIX = '外部导入-';
          const isoPrefix = getIsolationPrefix_ACU();
          const allTargetEntries = await TavernHelper_API_ACU.getLorebookEntries(importTarget);
          
          // 从模板数据中提取所有表格的 entryName 和其他标识信息（用于清理自定义导出条目）
          const templateEntryNames = [];
          const templateTableNames = []; // 备用：表格原始名称
          if (finalDataForInjection) {
              const sheetKeys = getSortedSheetKeys_ACU(finalDataForInjection);
              sheetKeys.forEach(sheetKey => {
                  const sheet = finalDataForInjection[sheetKey];
                  if (sheet?.exportConfig?.enabled) {
                      if (sheet?.exportConfig?.entryName) {
                          templateEntryNames.push(sheet.exportConfig.entryName);
                      }
                      // 同时记录表格原始名称作为备用清理目标
                      if (sheet?.name) {
                          templateTableNames.push(sheet.name);
                      }
                  }
              });
          }
          
          // 找出本插件生成的不带"外部导入-"前缀的条目（这些是旧条目，需要清理）
          // 基础前缀列表：所有本插件可能生成的条目前缀
          const oldEntryBasePrefixes = [
              'TavernDB-ACU-ReadableDataTable',
              'TavernDB-ACU-WrapperStart',
              'TavernDB-ACU-WrapperEnd',
              'TavernDB-ACU-MemoryStart',
              'TavernDB-ACU-MemoryEnd',
              'TavernDB-ACU-PersonsHeader',
              'TavernDB-ACU-OutlineTable',
              'TavernDB-ACU-CustomExport-',  // 自定义导出条目前缀
              'TavernDB-ACU-ImportantPersonsIndex',
              '总结条目',
              '小总结条目',
              '故事大纲',
              '大纲表',
              '重要人物条目',
              '纪要索引',
          ];
          // 合并模板中的 entryName 和表格名称（用于精确匹配）
          const allOldPrefixes = [
              ...oldEntryBasePrefixes,
              ...templateEntryNames,
              ...templateTableNames
          ];
          
          const entriesToDelete = allTargetEntries.filter(entry => {
              const comment = entry.comment || '';
              // 移除隔离前缀进行判断
              const normalizedComment = comment.replace(/^ACU-\[[^\]]+\]-/, '');
              // 保留带"外部导入-"前缀的条目（这些是新的外部导入条目）
              if (normalizedComment.startsWith(IMPORT_PREFIX)) return false;
              // 检查是否匹配任何旧前缀
              return allOldPrefixes.some(prefix => normalizedComment.startsWith(prefix));
          });
          
          if (entriesToDelete.length > 0) {
              const uidsToDelete = entriesToDelete.map(e => e.uid);
              await TavernHelper_API_ACU.deleteLorebookEntries(importTarget, uidsToDelete);
              logDebug_ACU(`[外部导入] Cleaned up ${uidsToDelete.length} old entries (non-import prefixed) from target worldbook.`);
              showToastr_ACU('info', `外部导入完成：已清理 ${uidsToDelete.length} 个旧数据库条目。`);
          }
      } catch (e) {
          logWarn_ACU('[外部导入] Failed to clean old entries from target worldbook:', e);
      }

      // 5. 清理本地缓存（entries + status），并清空导入目标设置（解除联系）
      showToastr_ACU('success', `外部导入已完成：已注入 ${allChunks.length} 个分块并解除与世界书的绑定。`);
      await importTempRemove_ACU(statusStorageKey);
      await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
      // 同时清理旧断点 key（兼容旧版本残留）
      await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU);
      await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU);
      await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_FULL_ACU);
      logDebug_ACU('[外部导入] Cleared temp storage entries + status after import completion.');

      // 清空导入目标，防止后续任何"删除外部导入条目"等操作误伤第三方世界书
      settings_ACU.importWorldbookTarget = '';
      saveSettingsAndNotify_ACU();
      
      // [新增] 清除内存中的暂存数据
      _set_currentJsonTableData_ACU(null);
      logDebug_ACU('Cleared in-memory database data after import completion.');
      
      void updateImportStatusUI_ACU();
      if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(true);
      }


  // [T176] handleTxtImportAndSplit_ACU 已移到 presentation/components/import-status-ui.ts


export   async function handleInjectImportedTxtSelected_ACU() {
      showToastr_ACU('info', '开始处理导入文件（自选表格注入）...', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
      await processImportedTxtAsUpdates_ACU();
  }


export   async function clearImportLocalStorage_ACU(notify = true) {
      try {
          const entriesExist = (await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU)) !== null;
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);
          // [新增] 清除所有模式的断点续行状态
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_FULL_ACU);
          if (notify && entriesExist) showToastr_ACU('success', '已成功清除导入暂存缓存（IndexedDB）。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          else if (notify && !entriesExist) showToastr_ACU('info', '没有需要清除的导入暂存缓存。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          logDebug_ACU('[外部导入] Cleared imported txt entries and status from temp storage (IndexedDB preferred).');
          // Update the UI to reflect the change
          if (typeof updateImportStatusUI_ACU === 'function') {
              void updateImportStatusUI_ACU();
          }
          return true;
      } catch(error) {
          logError_ACU('[外部导入] Failed to clear import temp storage:', error);
          if (notify) showToastr_ACU('error', '清除导入缓存时出错。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
          return false;
      }
  }


export   async function clearImportedEntries_ACU(notify = true) {
    const targetLorebook = await getInjectionTargetLorebook_ACU();
    if (!targetLorebook) {
        showToastr_ACU('error', '无法清除导入条目：未设置数据注入目标。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
        return;
    }

    try {
        const allEntries = await TavernHelper_API_ACU.getLorebookEntries(targetLorebook);
        
        const prefixesToDelete = [
            '外部导入-', // Catches all new prefixed entries
            'TavernDB-ACU-ImportedJsonData', // Catches the non-prefixed JSON backup for safety
            IMPORTED_ENTRY_PREFIX_ACU // Catches old raw txt entries
        ];

        const uidsToDelete = allEntries
            .filter(entry => entry.comment && prefixesToDelete.some(prefix => entry.comment.startsWith(prefix)))
            .map(entry => entry.uid);

        if (uidsToDelete.length > 0) {
            await TavernHelper_API_ACU.deleteLorebookEntries(targetLorebook, uidsToDelete);
            logDebug_ACU(`Successfully deleted ${uidsToDelete.length} imported txt entries.`);
            if (notify) showToastr_ACU('success', `成功清除了 ${uidsToDelete.length} 个导入条目。`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
        } else {
            if (notify) showToastr_ACU('info', '没有找到可清除的已注入世界书条目。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
        }
        // [重构] 调用新的函数来只清除本地存储，而不是在这里重复逻辑
        await clearImportLocalStorage_ACU(false); // notify=false 因为我们已经在上面或下面提供了反馈
    } catch(error) {
        logError_ACU('Failed to delete imported lorebook entries:', error);
        if (notify) showToastr_ACU('error', '清除导入条目时出错。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    }
  }


export   async function deleteImportedEntries_ACU() {
      const targetLorebook = await getImportWorldbookTarget_ACU();
      if (!targetLorebook) {
          showToastr_ACU('error', '无法删除注入条目：未设置导入数据注入目标世界书。');
          return;
      }

      try {
          const allEntries = await TavernHelper_API_ACU.getLorebookEntries(targetLorebook);
          
          // [修改] 根据隔离标识代码删除对应的条目
          const IMPORT_PREFIX = '外部导入-';
          const isoPrefix = getIsolationPrefix_ACU(); // 获取当前的隔离前缀 (例如 "ACU-[code]-" 或 "")
          
          const uidsToDelete = allEntries
              .filter(entry => {
                  if (!entry.comment) return false;
                  
                  if (settings_ACU.dataIsolationEnabled) {
                      // 开启隔离：只删除带有当前隔离前缀的条目
                      // 目标格式：ACU-[code]-外部导入-...
                      return entry.comment.startsWith(isoPrefix + IMPORT_PREFIX);
                  } else {
                      // 关闭隔离：只删除没有隔离前缀的条目 (即以 "外部导入-" 开头，但不以 "ACU-[" 开头)
                      if (entry.comment.startsWith('ACU-[')) return false;
                      return entry.comment.startsWith(IMPORT_PREFIX);
                  }
              })
              .map(entry => entry.uid);

          if (uidsToDelete.length > 0) {
              await TavernHelper_API_ACU.deleteLorebookEntries(targetLorebook, uidsToDelete);
              logDebug_ACU(`Successfully deleted ${uidsToDelete.length} imported entries from ${targetLorebook} (Isolation: ${settings_ACU.dataIsolationEnabled}).`);
              showToastr_ACU('success', `成功删除了 ${uidsToDelete.length} 个外部导入注入的条目。`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          } else {
              showToastr_ACU('info', `在世界书 "${targetLorebook}" 中没有找到符合当前标识的外部导入条目。`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          }
      } catch(error) {
          logError_ACU('Failed to delete imported entries:', error);
          showToastr_ACU('error', '删除注入条目时出错。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    }
  }



  // [T176] getImportWorldbookTarget_ACU 已移到 presentation/components/import-status-ui.ts



export   async function loadImportedJsonDataFromLorebook_ACU(targetLorebook, modeSuffix = '-Selected') {
      if (!TavernHelper_API_ACU || !targetLorebook) return null;
      const jsonStorageComment = getImportJsonStorageComment_ACU(modeSuffix);
      const allEntries = await TavernHelper_API_ACU.getLorebookEntries(targetLorebook);
      const existingEntry = allEntries.find(entry => entry.comment === jsonStorageComment);
      if (!existingEntry || !existingEntry.content) return null;
      try {
          return JSON.parse(existingEntry.content);
      } catch (error) {
          logError_ACU('[外部导入] Failed to parse ImportedJsonData source entry:', error);
          return null;
      }
  }


export   async function saveImportedJsonDataToLorebook_ACU(targetLorebook, jsonData, modeSuffix = '-Selected') {
      if (!TavernHelper_API_ACU || !targetLorebook || !jsonData) return false;
      const jsonStorageComment = getImportJsonStorageComment_ACU(modeSuffix);
      const allEntries = await TavernHelper_API_ACU.getLorebookEntries(targetLorebook);
      const usedOrders = buildUsedOrderSet_ACU(allEntries);
      const existingEntry = allEntries.find(entry => entry.comment === jsonStorageComment);
      const finalJsonString = JSON.stringify(jsonData, null, 2);
      const newEntryData = {
          comment: jsonStorageComment,
          content: finalJsonString,
          keys: [`TavernDB-ACU-ImportedJson-Key${modeSuffix}`],
          enabled: false,
          type: 'keyword',
          order: existingEntry?.order ?? allocOrder_ACU(usedOrders, 10000, 1, 99999),
          prevent_recursion: true,
      };

      if (existingEntry) {
          await TavernHelper_API_ACU.setLorebookEntries(targetLorebook, [{ ...newEntryData, uid: existingEntry.uid }]);
          logDebug_ACU('[外部导入] Updated ImportedJsonData source entry in target lorebook.');
      } else {
          await TavernHelper_API_ACU.createLorebookEntries(targetLorebook, [newEntryData]);
          logDebug_ACU('[外部导入] Created ImportedJsonData source entry in target lorebook.');
      }
      return true;
  }


export   async function deleteImportedJsonDataFromLorebook_ACU(targetLorebook, modeSuffix = '-Selected') {
      if (!TavernHelper_API_ACU || !targetLorebook) return false;
      const jsonStorageComment = getImportJsonStorageComment_ACU(modeSuffix);
      const entriesNow = await TavernHelper_API_ACU.getLorebookEntries(targetLorebook);
      const jsonEntry = entriesNow.find(e => e.comment === jsonStorageComment);
      if (!jsonEntry) return false;
      await TavernHelper_API_ACU.deleteLorebookEntries(targetLorebook, [jsonEntry.uid]);
      return true;
  }
