/**
 * presentation/components/import-status-ui.ts — 导入状态 UI
 * 从 features/import/01~03 迁移而来
 */
  // --- [新增] 外部导入功能 ---

  const IMPORTED_ENTRY_PREFIX_ACU = 'TavernDB-ACU-ImportedTxt-';
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
  function getImportStablePrefix_ACU() { return '外部导入-'; }
  // 当前按用户要求：外部导入不自动清理，因此无需批次隔离；统一使用稳定前缀即可
  function getImportBatchPrefix_ACU() { return getImportStablePrefix_ACU(); }

  // [新增] 只清除本地存储中的导入缓存
  // [已迁移到 service/import/import-process.ts] clearImportLocalStorage_ACU

  // [已迁移到 service/import/import-process.ts] clearImportedEntries_ACU

  // [新增] 删除外部导入注入的世界书条目
  // [已迁移到 service/import/import-process.ts] deleteImportedEntries_ACU

  // --- [新增] 外部导入功能 ---
  
  async function updateImportStatusUI_ACU() {
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
  // [已迁移到 service/import/import-process.ts] getImportWorldbookTarget_ACU

  function getImportJsonStorageComment_ACU(modeSuffix = '-Selected') {
      const IMPORT_PREFIX = '外部导入-';
      return `${IMPORT_PREFIX}TavernDB-ACU-ImportedJsonData${modeSuffix}`;
  }

  // [已迁移到 service/import/import-process.ts] loadImportedJsonDataFromLorebook_ACU

  // [已迁移到 service/import/import-process.ts] saveImportedJsonDataToLorebook_ACU

  // [已迁移到 service/import/import-process.ts] deleteImportedJsonDataFromLorebook_ACU

  // [已迁移到 service/import/import-process.ts] processImportedTxtAsUpdates_ACU

  // [外部导入] 自选表格注入（取代旧的 标准/总结/整体 模式）
  // [已迁移到 service/import/import-process.ts] handleInjectImportedTxtSelected_ACU

  // 兼容旧API/旧按钮调用（仍会走自选表格逻辑）
  async function handleInjectSplitEntriesStandard_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  async function handleInjectSplitEntriesSummary_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  async function handleInjectSplitEntriesFull_ACU() { return await handleInjectImportedTxtSelected_ACU(); }