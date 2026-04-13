import { STORAGE_KEY_IMPORTED_ENTRIES_ACU, STORAGE_KEY_IMPORTED_STATUS_ACU, STORAGE_KEY_IMPORTED_STATUS_FULL_ACU, STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU, STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU } from '../../shared/data-constants';
import { importTempGet_ACU, importTempRemove_ACU, importTempSet_ACU } from '../../shared/idb-import-temp';
import { getImportSelectionFromUI_ACU, renderImportTableSelector_ACU } from './table-selector';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { handleInjectImportedTxtSelected_ACU } from '../triggers/import-process';
import { settings_ACU } from '../../service/runtime/state-manager';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { logDebug_ACU } from '../../shared/utils';
import { $popupInstance_ACU, $importTableSelector_ACU } from '../state/ui-refs';
/**
 * presentation/components/import-status-ui.ts — 导入状态 UI
 * 从 features/import/01~03 迁移而来
 */
  // --- [新增] 外部导入功能 ---

  export const IMPORTED_ENTRY_PREFIX_ACU = 'TavernDB-ACU-ImportedTxt-';
  // [外部导入] 本次注入的批次ID（用于“每批独立注入，不覆盖上一批”）
  let importBatchId_ACU = null;

  function newImportBatchId_ACU() {
      // 短且可读，避免 comment 过长
      const t = Date.now().toString(36);
      const r = Math.random().toString(36).slice(2, 6);
      return `b${t}${r}`;
  }

  // 外部导入前缀：
  // - stable: 用于 UI 识别/手动删除
  export function getImportStablePrefix_ACU() { return '外部导入-'; }
  // 当前按用户要求：外部导入不自动清理，因此无需批次隔离；统一使用稳定前缀即可
  export function getImportBatchPrefix_ACU() { return getImportStablePrefix_ACU(); }

  // [新增] 只清除本地存储中的导入缓存


  // [新增] 删除外部导入注入的世界书条目

  // --- [新增] 外部导入功能 ---
  
  export async function updateImportStatusUI_ACU() {
      if (!$popupInstance_ACU) return;
      const $statusDisplay = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-status`);
      const $injectButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button`);
      
      const savedEntriesJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
      const savedStatusJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);

      if (savedEntriesJson) {
          try {
              const chunks = JSON.parse(savedEntriesJson);
              if (Array.isArray(chunks) && chunks.length > 0) {
                  // 同步渲染一次表选择器（防止模板/数据变更后列表不刷新）
                  if ($importTableSelector_ACU) renderImportTableSelector_ACU();

                  const currentSelection = getImportSelectionFromUI_ACU();
                  const selectionSig = JSON.stringify(currentSelection || []);

                  if (settings_ACU.hasImportTableSelection && (!currentSelection || currentSelection.length === 0)) {
                      $statusDisplay.text('状态：未选择任何表格，无法注入。').css('color', 'salmon');
                      $injectButton.text('2. 注入（自选表格）').prop('disabled', true);
                      return;
                      }

                  let status = null;
                  if (savedStatusJson) {
                      try { status = JSON.parse(savedStatusJson); } catch (e) { status = null; }
                  }

                  const canResume =
                      status &&
                      typeof status.total === 'number' &&
                      status.total === chunks.length &&
                      typeof status.currentIndex === 'number' &&
                      status.currentIndex < status.total &&
                      (typeof status.selectionSig === 'undefined' || status.selectionSig === selectionSig);

                  if (canResume) {
                      $statusDisplay.text(`状态：已暂停，完成 ${status.currentIndex}/${status.total}。`).css('color', 'orange');
                      $injectButton.text('继续注入（自选表格）').prop('disabled', false);
                      } else {
                  $statusDisplay.text(`状态：已准备好 ${chunks.length} 个条目可供注入。`).css('color', 'lightgreen');
                      $injectButton.text('2. 注入（自选表格）').prop('disabled', false);
                  }
                  return;
              }
          } catch(e) {
             await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
             await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);
          }
      }
      
      $statusDisplay.text('状态：尚未加载文件。').css('color', '');
      $injectButton.text('2. 注入（自选表格）').prop('disabled', true);
  }

  // [新增] 获取导入专用的世界书目标

  export function getImportJsonStorageComment_ACU(modeSuffix = '-Selected') {
      const IMPORT_PREFIX = '外部导入-';
      return `${IMPORT_PREFIX}TavernDB-ACU-ImportedJsonData${modeSuffix}`;
  }





  // [外部导入] 自选表格注入（取代旧的 标准/总结/整体 模式）

  // 兼容旧API/旧按钮调用（仍会走自选表格逻辑）
  export async function handleInjectSplitEntriesStandard_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  export async function handleInjectSplitEntriesSummary_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  export async function handleInjectSplitEntriesFull_ACU() { return await handleInjectImportedTxtSelected_ACU(); }  export async function handleTxtImportAndSplit_ACU() {
      const $splitSizeInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-split-size`);
      const $encodingSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-encoding`); // 新增
      const $statusDisplay = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-status`);
      const splitSize = parseInt($splitSizeInput.val(), 10);
      const encoding = $encodingSelect.val() || 'UTF-8'; // 新增

      if (isNaN(splitSize) || splitSize <= 0) {
          showToastr_ACU('error', '请输入有效的字符分割数。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
          return;
      }

      const $fileInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-hidden-file-input`);
      $fileInput.off('change.acu_import').on('change.acu_import', function(e) {
          const file = e.target.files[0];
          if (!file) return;

          $statusDisplay.text('状态：正在读取和拆分文件...').css('color', '#61afef');
          const reader = new FileReader();
          
          reader.onload = (readerEvent) => {
              const content = readerEvent.target.result as string;
              if (!content) {
                  showToastr_ACU('warning', '文件为空或读取失败。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                  void updateImportStatusUI_ACU();
                  return;
              }

              // Use a timeout to allow the UI to update before this potentially long-running task
              setTimeout(async () => {
                  // [新增] 清除旧的导入状态，确保每次导入都是全新的开始
                  await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);
                  await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU);
                  await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU);
                  await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_FULL_ACU);

                  const chunks = [];
                  for (let i = 0; i < content.length; i += splitSize) {
                      chunks.push({
                          content: content.substring(i, i + splitSize)
                      });
                  }
                  
                  await importTempSet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU, JSON.stringify(chunks));
                  logDebug_ACU(`[外部导入] Saved ${chunks.length} text chunks to temp storage (IndexedDB preferred).`);
                  showToastr_ACU('success', `文件已成功拆分成 ${chunks.length} 个部分。`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                  
                  void updateImportStatusUI_ACU();
                  
                  // Reset file input value to allow re-importing the same file
                  $fileInput.val('');
              }, 50); // 50ms delay
          };
          
          reader.onerror = () => {
              showToastr_ACU('error', '读取文件时出错。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
              void updateImportStatusUI_ACU();
          };

          reader.readAsText(file, encoding); // 修改
      });
      $fileInput.trigger('click');
      return true;
  }

export   async function getImportWorldbookTarget_ACU() {
      // 优先使用 UI 当前选择（不落盘），以便在“完成后解除绑定”的策略下，“删除外部导入条目”仍可用
      try {
          if ($popupInstance_ACU) {
              const $select = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target`);
              const v = ($select && $select.length) ? String($select.val() || '').trim() : '';
              if (v) return v;
          }
      } catch (e) { /* ignore */ }

      // 回退：旧逻辑（从设置读取）
      if (settings_ACU.importWorldbookTarget) return settings_ACU.importWorldbookTarget;
      return null;
  }

  // [T176] 控制注入按钮启用/禁用
  export function setImportInjectButtonEnabled_ACU(enabled) {
    if (!$popupInstance_ACU) return;
    const $btn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button`);
    if ($btn.length) $btn.prop('disabled', !enabled);
  }
