// popup-bindings-worldbook.ts
// 世界书标签页事件绑定

import { showToastr_ACU } from '../theme/toast';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { jQuery_API_ACU } from '../../shared/host-api';
import { getCharLorebooks_ACU, getLorebookEntries_ACU, setLorebookEntries_ACU, isWorldbookApiAvailable_ACU } from '../../data/gateways/worldbook-gateway';
import { settings_ACU, currentJsonTableData_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { applyWorldbookEntryFilter_ACU, applyWorldbookListFilter_ACU, applyWorldbookSelectFilter_ACU, isEntryBlocked_ACU, populateImportWorldbookTargetSelector_ACU, populateWorldbookEntryList_ACU, populateWorldbookList_ACU, renderLazyWorldbookEntryItems_ACU, toggleLazyWorldbookEntryGroup_ACU, updateLazyWorldbookEntryCheckedState_ACU, updateWorldbookSourceView_ACU } from '../components/worldbook-selector';
import { getLorebookEntriesByNames_ACU, getWorldBooks_ACU, updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { getInjectionTargetLorebook_ACU, getIsolationPrefix_ACU, updateOutlineTableEntry_ACU } from '../../service/worldbook/injection-engine';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../components/pipeline-ui-helpers';
import { getCurrentWorldbookConfig_ACU } from '../../service/settings/settings-readers';
import { setZeroTkOccupyMode_ACU } from '../../service/settings/settings-service';
import { formatJsonToReadable_ACU } from '../../service/runtime/helpers-remaining';

/**
 * 绑定世界书标签页的所有事件
 */
export async function bindWorldbookEvents_ACU(): Promise<void> {
      const $worldbookSourceRadios = $popupInstance_ACU.find(`input[name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source"]`);
      const $refreshWorldbooksButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-refresh-worldbooks`);
      const $worldbookSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-select`);
      const $worldbookEntryList = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-list`);
      const $selectAllButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-select-all`);
      const $deselectAllButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-deselect-all`);

      // [新增] 世界书UI事件绑定
      if ($worldbookSourceRadios.length) {
          $worldbookSourceRadios.on('change', async function() {
              const worldbookConfig = getCurrentWorldbookConfig_ACU();
              worldbookConfig.source = jQuery_API_ACU(this).val();
              saveSettingsAndNotify_ACU();
              await updateWorldbookSourceView_ACU();
          });
      }
      // [新增] 世界书筛选：注入目标 / 手动选择列表 / 条目列表
      const $wbTargetFilter = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target-filter`);
      const $wbListFilter = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-select-filter`);
      const $wbEntryFilter = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-filter`);
      if ($wbTargetFilter.length) {
          $wbTargetFilter.on('input', function() {
              const $sel = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target`);
              applyWorldbookSelectFilter_ACU($sel, jQuery_API_ACU(this).val());
          });
      }
      if ($wbListFilter.length) {
          $wbListFilter.on('input', function() {
              applyWorldbookListFilter_ACU($worldbookSelect, jQuery_API_ACU(this).val());
          });
      }
      if ($wbEntryFilter.length) {
          $wbEntryFilter.on('input', function() {
              applyWorldbookEntryFilter_ACU($worldbookEntryList, jQuery_API_ACU(this).val());
          });
      }
      if ($refreshWorldbooksButton.length) {
          $refreshWorldbooksButton.on('click', populateWorldbookList_ACU);
      }
      // [新增] 外部导入世界书选择器的事件绑定
      const $refreshImportWorldbooksButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-refresh-import-worldbooks`);
      if ($refreshImportWorldbooksButton.length) {
          $refreshImportWorldbooksButton.on('click', populateImportWorldbookTargetSelector_ACU);
      }
      const $importWorldbookTargetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target`);
      const $importWorldbookTargetFilter = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target-filter`);
      const $importPromptExcludeImportedEntriesToggle = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-prompt-exclude-imported-worldbook-entries`);
      if ($importWorldbookTargetFilter.length) {
          $importWorldbookTargetFilter.on('input', function() {
              applyWorldbookSelectFilter_ACU($importWorldbookTargetSelect, jQuery_API_ACU(this).val());
          });
      }
      if ($importWorldbookTargetSelect.length) {
          $importWorldbookTargetSelect.on('change', function() {
              settings_ACU.importWorldbookTarget = jQuery_API_ACU(this).val();
              saveSettingsAndNotify_ACU();
              logDebug_ACU(`Import worldbook target changed to: ${settings_ACU.importWorldbookTarget}`);
          });
      }
      if ($importPromptExcludeImportedEntriesToggle.length) {
          $importPromptExcludeImportedEntriesToggle.off('change.acu_import_prompt_filter').on('change.acu_import_prompt_filter', function() {
              settings_ACU.importPromptExcludeImportedWorldbookEntries = jQuery_API_ACU(this).is(':checked');
              saveSettingsAndNotify_ACU();
              logDebug_ACU(`[外部导入] importPromptExcludeImportedWorldbookEntries=${settings_ACU.importPromptExcludeImportedWorldbookEntries}`);
          });
      }
      const resolveWorldbookBookNames_ACU = async () => {
          const worldbookConfig = getCurrentWorldbookConfig_ACU();
          if ((worldbookConfig.source || 'character') === 'manual') {
              return [...new Set((Array.isArray(worldbookConfig.manualSelection) ? worldbookConfig.manualSelection : []).filter(Boolean))];
          }
          const names = [];
          try {
              const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
              if (charLorebooks.primary) names.push(charLorebooks.primary);
              if (charLorebooks.additional?.length) names.push(...charLorebooks.additional);
          } catch (e) {}
          return [...new Set(names.filter(Boolean))];
      };
      const isWorldbookEntryAllowedForUI_ACU = (entry: any) => {
          if (!entry) return false;
          const comment = entry.comment || '';
          if (comment.startsWith('TavernDB-ACU-') || comment.startsWith('重要人物条目') || comment.startsWith('总结条目')) {
              return false;
          }
          if (isEntryBlocked_ACU(entry)) return false;
          if (!entry.enabled) return false;
          return true;
      };
      const setWorldbookEntriesSelection_ACU = async (mode: any) => {
          const worldbookConfig = getCurrentWorldbookConfig_ACU();
          const bookNames = await resolveWorldbookBookNames_ACU();
          if (!worldbookConfig.enabledEntries) worldbookConfig.enabledEntries = {};
          const entriesMap = await getLorebookEntriesByNames_ACU(bookNames);
          for (const bookName of bookNames) {
              const entries = Array.isArray(entriesMap[bookName]) ? entriesMap[bookName] : [];
              if (mode === 'none') {
                  worldbookConfig.enabledEntries[bookName] = [];
              } else {
                  worldbookConfig.enabledEntries[bookName] = entries.filter(isWorldbookEntryAllowedForUI_ACU).map(entry => entry.uid);
              }
          }
          saveSettingsAndNotify_ACU();
          await populateWorldbookEntryList_ACU();
      };
      if ($worldbookSelect.length) {
          // New click handler for the custom list
          $worldbookSelect.on('click', '.qrf_worldbook_list_item', async function() {
              const $item = jQuery_API_ACU(this);
              const bookName = $item.data('book-name');
              const worldbookConfig = getCurrentWorldbookConfig_ACU();
              let selection = worldbookConfig.manualSelection || [];

              if ($item.hasClass('selected')) {
                  // Deselect
              selection = selection.filter((name: string) => name !== bookName);
              } else {
                  // Select
                  selection.push(bookName);
              }
              
              worldbookConfig.manualSelection = selection;
              $item.toggleClass('selected'); // Toggle visual state
              
              saveSettingsAndNotify_ACU();
              await populateWorldbookEntryList_ACU();
          });
      }
      if ($worldbookEntryList.length) {
          $worldbookEntryList.off('change.acu_wb_list').on('change.acu_wb_list', 'input[type="checkbox"]', function() {
              const $checkbox = jQuery_API_ACU(this);
              const bookName = $checkbox.data('book');
              const entryUid = $checkbox.data('uid');
              const worldbookConfig = getCurrentWorldbookConfig_ACU();

              if (!worldbookConfig.enabledEntries[bookName]) {
                  worldbookConfig.enabledEntries[bookName] = [];
              }
              const enabledList = worldbookConfig.enabledEntries[bookName];
              const index = enabledList.indexOf(entryUid);
              const checked = $checkbox.is(':checked');

              if (checked) {
                  if (index === -1) enabledList.push(entryUid);
              } else if (index > -1) {
                  enabledList.splice(index, 1);
              }
              updateLazyWorldbookEntryCheckedState_ACU($worldbookEntryList, bookName, entryUid, checked);
              saveSettingsAndNotify_ACU();
          });
          $worldbookEntryList.off('click.acu_wb_toggle').on('click.acu_wb_toggle', '.qrf_worldbook_entry_toggle', function() {
              const bookName = jQuery_API_ACU(this).closest('.qrf_worldbook_entry_group').data('book-name');
              if (!bookName) return;
              toggleLazyWorldbookEntryGroup_ACU($worldbookEntryList, bookName);
          });
          $worldbookEntryList.off('click.acu_wb_more').on('click.acu_wb_more', '.qrf_worldbook_entry_load_more', function() {
              const bookName = jQuery_API_ACU(this).closest('.qrf_worldbook_entry_group').data('book-name');
              if (!bookName) return;
              renderLazyWorldbookEntryItems_ACU($worldbookEntryList, bookName);
          });
      }

      // [新增] "总结大纲(总体大纲)"条目启用开关
      const $outlineEnabledToggle = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled`);
      if ($outlineEnabledToggle.length) {
          $outlineEnabledToggle.off('change.acu_outline_toggle').on('change.acu_outline_toggle', async function() {
              // UI 是"0TK占用模式"
              const modeEnabled = jQuery_API_ACU(this).is(':checked');
              setZeroTkOccupyMode_ACU(modeEnabled);
              showToastr_ACU(
                  'info',
                  `0TK占用模式已${modeEnabled ? '启用' : '禁用'}（世界书中该条目显示为 ${modeEnabled ? '禁用' : '启用'}）。`,
              );

              // 尝试立即同步世界书条目 enabled 状态（不强制全量更新）
              try {
                  if (currentJsonTableData_ACU) {
                      const { outlineTable } = formatJsonToReadable_ACU(currentJsonTableData_ACU);
                      await updateOutlineTableEntry_ACU(outlineTable, false);
                  }
                  // [修复] 额外直接更新"纪要索引"条目的enabled状态
                  // 因为该条目可能由updateCustomTableExports_ACU创建，不在updateOutlineTableEntry_ACU控制范围内
                  const primaryLorebookName = await getInjectionTargetLorebook_ACU();
                  if (primaryLorebookName && isWorldbookApiAvailable_ACU()) {
                      const isoPrefix = getIsolationPrefix_ACU();
                      const allEntries = await getLorebookEntries_ACU(primaryLorebookName);
                      // [修复] 使用endsWith匹配，因为条目名称可能带有隔离前缀
                      const existingIndexEntry = allEntries.find(e => e.comment && e.comment.endsWith('TavernDB-ACU-CustomExport-纪要索引'));
                      if (existingIndexEntry) {
                          const outlineEntryEnabled = !modeEnabled; // 0TK模式启用=条目禁用
                          if (existingIndexEntry.enabled !== outlineEntryEnabled) {
                              await setLorebookEntries_ACU(primaryLorebookName, [{
                                  uid: existingIndexEntry.uid,
                                  enabled: outlineEntryEnabled
                              }]);
                              logDebug_ACU(`0TK mode toggle: updated 纪要索引 entry. enabled=${outlineEntryEnabled}`);
                          }
                      }
                  }
              } catch (e) {
                  logWarn_ACU('Failed to sync outline entry enabled state immediately:', e);
              }
          });
      }

      // [新增] 全选/全不选事件
      if ($selectAllButton.length) {
          $selectAllButton.off('click.acu_wb_bulk').on('click.acu_wb_bulk', async function() {
              await setWorldbookEntriesSelection_ACU('all');
          });
      }

      if ($deselectAllButton.length) {
          $deselectAllButton.off('click.acu_wb_bulk').on('click.acu_wb_bulk', async function() {
              await setWorldbookEntriesSelection_ACU('none');
          });
      }


}
