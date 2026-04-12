import { DEFAULT_MERGE_SUMMARY_PROMPT_ACU, DEFAULT_PLOT_SETTINGS_ACU, TABLE_TEMPLATE_ACU } from '../../data/models/defaults-json.js';
import { getCurrentWorldbookConfig_ACU } from '../../data/repositories/character-settings-repo';
import { getDataIsolationHistory_ACU, removeDataIsolationHistory_ACU } from '../../data/repositories/isolation-repo';
import { globalMeta_ACU, saveGlobalMeta_ACU } from '../../data/repositories/profile-repo';
import { deriveTemplatePresetNameForImport_ACU, getCurrentTemplatePresetName_ACU, isDefaultTemplatePresetSelection_ACU, normalizeTemplatePresetSelectionValue_ACU, persistCurrentTemplatePresetName_ACU } from '../../data/repositories/template-preset-repo';
import { updateImportStatusUI_ACU, handleTxtImportAndSplit_ACU } from '../components/import-status-ui';
import { addPlotTaskFromUI_ACU, buildDefaultPlotPromptGroup_ACU, deleteCurrentPlotTaskFromUI_ACU, getCharCardPromptFromUI_ACU, getPlotPromptGroupFromUI_ACU, loadCurrentPlotTaskToUI_ACU, moveCurrentPlotTask_ACU, renderPlotPromptSegments_ACU, renderPlotTaskList_ACU, renderPromptSegments_ACU, saveCurrentPlotTaskFromUI_ACU, schedulePlotTaskAutoSave_ACU, selectPlotTaskForEditing_ACU } from '../components/plot-editors';
import { getTemplatePreset_ACU } from '../components/template-preset-ui';
import { openNewVisualizer_ACU } from './visualizer';
import { ACU_TOAST_CATEGORY_ACU, showToastr_ACU } from '../theme/toast';
import { importCombinedSettings_ACU } from '../../service/data-admin/admin';
import { clearImportLocalStorage_ACU, clearImportedEntries_ACU, deleteImportedEntries_ACU, handleInjectImportedTxtSelected_ACU } from '../../service/import/import-process';
import { buildDefaultContentOptimizationPromptGroup_ACU } from '../../service/optimization/content-optimization';
import { stopAutoLoop_ACU } from '../../service/runtime/helpers-remaining';
import {
  currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU,
  jQuery_API_ACU, toastr_API_ACU, TavernHelper_API_ACU, $popupInstance_ACU,
  $apiConfigSectionToggle_ACU, $apiConfigAreaDiv_ACU, $customApiUrlInput_ACU, $customApiKeyInput_ACU,
  $customApiModelInput_ACU, $customApiModelSelect_ACU, $maxTokensInput_ACU, $temperatureInput_ACU,
  $loadModelsButton_ACU, $saveApiConfigButton_ACU, $clearApiConfigButton_ACU, $apiStatusDisplay_ACU,
  $charCardPromptToggle_ACU, $charCardPromptAreaDiv_ACU, $charCardPromptSegmentsContainer_ACU,
  $saveCharCardPromptButton_ACU, $resetCharCardPromptButton_ACU, $plotPromptSegmentsContainer_ACU,
  $plotTaskListContainer_ACU, $autoUpdateThresholdInput_ACU,
  $saveAutoUpdateThresholdButton_ACU, $autoUpdateTokenThresholdInput_ACU, $saveAutoUpdateTokenThresholdButton_ACU,
  $autoUpdateFrequencyInput_ACU, $saveAutoUpdateFrequencyButton_ACU, $updateBatchSizeInput_ACU,
  $saveUpdateBatchSizeButton_ACU, $maxConcurrentGroupsInput_ACU, $autoUpdateEnabledCheckbox_ACU,
  $standardizedTableFillEnabledCheckbox_ACU, $toastMuteEnabledCheckbox_ACU, $promptTemplateEnabledCheckbox_ACU,
  $tableEditLastPairOnlyCheckbox_ACU, $tableMaxRetriesInput_ACU, $manualUpdateCardButton_ACU,
  $statusMessageSpan_ACU, $cardUpdateStatusDisplay_ACU, $useMainApiCheckbox_ACU, $streamingEnabledCheckbox_ACU,
  $manualExtraHintCheckbox_ACU, $skipUpdateFloorsInput_ACU, $saveSkipUpdateFloorsButton_ACU,
  $retainRecentLayersInput_ACU, $saveRetainRecentLayersButton_ACU, $manualTableSelector_ACU,
  $manualTableSelectAll_ACU, $manualTableSelectNone_ACU, $importTableSelector_ACU,
  $importTableSelectAll_ACU, $importTableSelectNone_ACU,
  _assignUIPlaceholders_ACU
} from '../../service/runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU, loadSettingsAndRefreshUI_ACU, saveSettings_ACU, switchIsolationProfile_ACU } from '../../service/settings/settings-service';
import { handleManualUpdate_ACU } from '../../service/table/update-process';
import { getChatSheetGuideDataForIsolationKey_ACU, getCurrentChatPlotScopeState_ACU, getCurrentChatTemplateScopeState_ACU, sanitizeTemplateSnapshotForChat_ACU } from '../../service/template/chat-scope';
import { deleteAllGeneratedEntries_ACU, getLorebookEntriesByNames_ACU, getWorldBooks_ACU, refreshMergedDataAndNotify_ACU, updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { topLevelWindow_ACU } from '../../shared/env';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { logDebug_ACU, logError_ACU, logWarn_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU } from '../../shared/utils';
import { loadOrCreateJsonTableFromChatHistory_ACU } from '../../data/repositories/table-repo';
import { appendExcludeRuleRow_ACU, applyGlobalPlotPresetSelectionForEditor_ACU, applyPlotPresetToSettings_ACU, clearPlotPresetBindingForChat_ACU, ensureLoopPromptsArray_ACU, ensurePlotTasksCompat_ACU, getActivePlotEditorSettings_ACU, getCurrentRuntimePlotPresetName_ACU, getLastOptimizedMessageIndex_ACU, getPlotPresetBindingForChat_ACU, isDefaultPlotPresetSelection_ACU, normalizePlotPresetExcludeRules_ACU, normalizePlotPresetSelectionValue_ACU, persistPlotPresetSelectionState_ACU, readExcludeRulesFromRows_ACU, renderLoopPromptsList_ACU, reoptimizeMessage_ACU, saveLoopPromptsFromUI_ACU, setActivePlotEditorSettings_ACU, setCurrentEditablePlotPresetState_ACU, setPlotPromptContentByIdForSettings_ACU, stripPlotPresetWorldbookEntrySelectionForExport_ACU, switchCurrentChatPlotPreset_ACU } from '../components/optimization-ui';
import { applyTemplatePresetToCurrent_ACU, applyTemplateSnapshotToScope_ACU, deleteTemplatePreset_ACU, ensureUniqueTemplatePresetName_ACU, loadTemplatePresetSelect_ACU, normalizeTemplateForPresetSave_ACU, parseImportedTemplateData_ACU, persistTemplateScopeSelectionState_ACU, resolveActiveTemplatePresetName_ACU, upsertTemplatePreset_ACU } from '../components/template-preset-ui';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { applyWorldbookEntryFilter_ACU, applyWorldbookListFilter_ACU, applyWorldbookSelectFilter_ACU, getPlotWorldbookConfig_ACU, isEntryBlocked_ACU, populateImportWorldbookTargetSelector_ACU, populateInjectionTargetSelector_ACU, populatePlotWorldbookEntryList_ACU, populateWorldbookEntryList_ACU, populateWorldbookList_ACU, renderLazyWorldbookEntryItems_ACU, toggleLazyWorldbookEntryGroup_ACU, updateLazyWorldbookEntryCheckedState_ACU, updatePlotWorldbookSourceView_ACU, updateWorldbookSourceView_ACU } from '../components/worldbook-selector';
import { getCurrentPlotSettingsFromUI_ACU, getOptimizationPromptGroupFromUI_ACU, loadOptimizationPresetSelect_ACU, loadOptimizationSettingsToUI_ACU, loadPlotPresetSelect_ACU, loadPlotSettingsToUI_ACU, renderOptimizationPromptSegments_ACU, saveOptimizationPresetAsNew_ACU, savePlotPresetAsNew_ACU } from './popup-helpers';
import { deleteLocalDataInChat_ACU, exportCurrentJsonData_ACU, exportTableTemplate_ACU, importTableTemplate_ACU, overrideLatestLayerWithTemplate_ACU, resetAllToDefaults_ACU, resetTableTemplate_ACU } from '../triggers/data-admin-ui';
import { clearApiConfig_ACU, deleteApiPreset_ACU, exportCharCardPromptToJson_ACU, fetchModelsAndConnect_ACU, loadApiPreset_ACU, loadCharCardPromptFromJson_ACU, loadTavernApiProfiles_ACU, refreshApiPresetSelectors_ACU, resetDefaultCharCardPrompt_ACU, saveApiConfig_ACU, saveApiPreset_ACU, saveAutoUpdateFrequency_ACU, saveAutoUpdateThreshold_ACU, saveAutoUpdateTokenThreshold_ACU, saveCustomCharCardPrompt_ACU, saveImportSplitSize_ACU, saveMaxConcurrentGroups_ACU, saveRetainRecentLayers_ACU, saveSkipUpdateFloors_ACU, saveTableMaxRetries_ACU, saveUpdateBatchSize_ACU, updateApiModeView_ACU, updateCustomApiInputsState_ACU } from '../triggers/settings-ui-sync';
import { exportCombinedSettings_ACU, handleManualMergeSummary_ACU } from '../triggers/update-trigger';
import { performContentOptimization_ACU } from '../../service/optimization/content-optimization';
import { formatJsonToReadable_ACU, startAutoLoop_ACU } from '../../service/runtime/helpers-remaining';
import { getInjectionTargetLorebook_ACU, getIsolationPrefix_ACU, updateOutlineTableEntry_ACU } from '../../service/worldbook/injection-engine';
/**
 * presentation/pages/popup-bindings.ts — 主弹窗事件绑定
 * 从 main-popup.ts 拆出（原 onReady 回调中的事件绑定部分）
 */

  export async function bindPopupEvents_ACU() {
 
      // Assign jQuery objects for UI elements (via batch setter to avoid ESM reassignment)
      _assignUIPlaceholders_ACU({
        $apiConfigSectionToggle_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-config-toggle`),
        $apiConfigAreaDiv_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-config-area-div`),
        $customApiUrlInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-url`),
        $customApiKeyInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-key`),
        $customApiModelInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-model-input`),
        $customApiModelSelect_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-model-select`),
        $maxTokensInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-max-tokens`),
        $temperatureInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-temperature`),
        $loadModelsButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-load-models`),
        $saveApiConfigButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-config`),
        $clearApiConfigButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-clear-config`),
        $apiStatusDisplay_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-status`),
        $charCardPromptToggle_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-char-card-prompt-toggle`),
        $charCardPromptAreaDiv_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-char-card-prompt-area-div`),
        $charCardPromptSegmentsContainer_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-prompt-segments-container`),
        $saveCharCardPromptButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-char-card-prompt`),
        $resetCharCardPromptButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-reset-char-card-prompt`),
        $autoUpdateThresholdInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-update-threshold`),
        $saveAutoUpdateThresholdButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-auto-update-threshold`),
        $autoUpdateTokenThresholdInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-update-token-threshold`),
        $saveAutoUpdateTokenThresholdButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-auto-update-token-threshold`),
        $autoUpdateFrequencyInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-update-frequency`),
        $saveAutoUpdateFrequencyButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-auto-update-frequency`),
        $updateBatchSizeInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-update-batch-size`),
        $saveUpdateBatchSizeButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-update-batch-size`),
        $maxConcurrentGroupsInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-max-concurrent-groups`),
        $skipUpdateFloorsInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-skip-update-floors`),
        $saveSkipUpdateFloorsButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-skip-update-floors`),
        $retainRecentLayersInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-retain-recent-layers`),
        $saveRetainRecentLayersButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-retain-recent-layers`),
        $autoUpdateEnabledCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-update-enabled-checkbox`),
        $standardizedTableFillEnabledCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-standardized-table-fill-enabled-checkbox`),
        $toastMuteEnabledCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-toast-mute-enabled-checkbox`),
        $promptTemplateEnabledCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-prompt-template-enabled-checkbox`),
        $tableEditLastPairOnlyCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-tableedit-last-pair-only-checkbox`),
        $tableMaxRetriesInput_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-max-retries`),
        $manualExtraHintCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox`),
        $manualUpdateCardButton_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-manual-update-card`),
        $manualTableSelectAll_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-manual-table-select-all`),
        $manualTableSelectNone_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-manual-table-select-none`),
        $manualTableSelector_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-manual-table-selector`),
        $importTableSelectAll_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-table-select-all`),
        $importTableSelectNone_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-table-select-none`),
        $importTableSelector_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-table-selector`),
        $statusMessageSpan_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-status-message`),
        $cardUpdateStatusDisplay_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-card-update-status-display`),
        $useMainApiCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-use-main-api-checkbox`),
        $streamingEnabledCheckbox_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-streaming-enabled-checkbox`),
      });
      const $loadCharCardPromptFromJsonButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-load-char-card-prompt-from-json`);
      const $exportCharCardPromptToJsonButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-char-card-prompt-to-json`);
      const $advancedConfigToggle_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-advanced-config-toggle`);
      const $advancedConfigArea_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-advanced-config-area-div`);
      const $importTemplateButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-template`);
      const $exportTemplateButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-template`);
      const $resetTemplateButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-reset-template`);
      const $templatePresetSelect_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-select`);
      const $templateChatPresetSelect_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select`);
      const $templatePresetSaveBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-save`);
      const $templatePresetSaveAsBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-saveas`);
      const $templatePresetRenameBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-rename`);
      const $templatePresetDeleteBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-delete`);
      const $templateChatSaveBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-save-preset`);
      const $templateChatImportBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-import-preset`);
      const $templateChatExportBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-export-preset`);
      const $templateChatClearOverrideBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-clear-override`);
      const $templateChatPresetFileInput_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-file-input`);
      const $resetAllDefaultsButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults`);
      const $exportJsonDataButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-json-data`);
      const $importCombinedSettingsButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-combined-settings`);
      const $exportCombinedSettingsButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-combined-settings`);
      const $openNewVisualizerButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer`);

      const $apiModeRadios = $popupInstance_ACU.find(`input[name="${SCRIPT_ID_PREFIX_ACU}-api-mode"]`);
      const $tavernProfileSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-select`);
      const $refreshTavernProfilesButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-refresh-tavern-api-profiles`);
      const $worldbookSourceRadios = $popupInstance_ACU.find(`input[name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source"]`);
      const $refreshWorldbooksButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-refresh-worldbooks`);
      const $worldbookSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-select`);
      const $worldbookEntryList = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-list`);
      const $selectAllButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-select-all`);
      const $deselectAllButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-deselect-all`);
      const $importTxtButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-txt-button`);
      const $injectImportedTxtButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button`);
      const $clearImportedAllButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-clear-imported-all-button`);
      const $clearImportedCacheButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-clear-imported-cache-button`); // [新增]
      const $saveImportSplitSizeButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-import-split-size`);
      // Removed $hideCurrentValueDisplay_ACU, $advHideToggle, $advHideArea assignments

      // Load existing settings into UI fields
      loadSettingsAndRefreshUI_ACU(); // This function will populate the fields
      // [新增] 加载世界书UI状态（已移至 loadSettings_ACU）
      // $worldbookSourceRadios.filter(`[value="${getCurrentWorldbookConfig_ACU().source}"]`).prop('checked', true);
      // updateWorldbookSourceView_ACU();
      // [新增] 填充并设置注入目标选择器
      populateInjectionTargetSelector_ACU();
      // [新增] 填充外部导入专用的世界书选择器
      populateImportWorldbookTargetSelector_ACU();

      const $injectionTargetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target`);
      if ($injectionTargetSelect.length) {
          $injectionTargetSelect.on('change', async function() {
              const worldbookConfig = getCurrentWorldbookConfig_ACU();
              const oldTargetSetting = worldbookConfig.injectionTarget;
              const newTargetSetting = jQuery_API_ACU(this).val();

              if (oldTargetSetting === newTargetSetting) return;

              // 异步获取旧的世界书实际名称
              const getOldLorebookName = async () => {
                  if (oldTargetSetting === 'character') {
                      return await TavernHelper_API_ACU.getCurrentCharPrimaryLorebook();
                  }
                  return oldTargetSetting;
              };
              const oldLorebookName = await getOldLorebookName();

              // 1. 从旧目标删除条目
              if (oldLorebookName) {
                  showToastr_ACU('info', `正在从旧目标 [${oldLorebookName}] 中清除条目...`);
                  try {
                      await deleteAllGeneratedEntries_ACU(oldLorebookName);
                      // [修复] 增加短暂延迟，确保后端/API完成删除操作
                      await new Promise(resolve => setTimeout(resolve, 300));
                  } catch (e) {
                      logError_ACU(`Failed to clean up old target ${oldLorebookName}:`, e);
                  }
              } else {
                  logWarn_ACU('Old lorebook name could not be determined, skipping cleanup.');
              }

              // 2. 更新设置为新目标并保存
              worldbookConfig.injectionTarget = newTargetSetting;
              saveSettings_ACU();
              logDebug_ACU(`Injection target changed from "${oldTargetSetting}" to "${newTargetSetting}" for char ${currentChatFileIdentifier_ACU}.`);

              // 3. 向新目标注入条目
              if (currentJsonTableData_ACU) {
                  showToastr_ACU('info', `正在向新目标注入条目...`);
                  await updateReadableLorebookEntry_ACU(true); // `true` to ensure entries are created
                  showToastr_ACU('success', '数据注入目标已成功切换！');
              } else {
                  showToastr_ACU('warning', '数据注入目标已更新，但当前无数据可注入。');
              }
          });
      }

      // [新增] 提示词组 JSON 导入/导出
      if ($loadCharCardPromptFromJsonButton_ACU && $loadCharCardPromptFromJsonButton_ACU.length) {
        $loadCharCardPromptFromJsonButton_ACU.off('click').on('click', function () {
          loadCharCardPromptFromJson_ACU();
        });
      }
      if ($exportCharCardPromptToJsonButton_ACU && $exportCharCardPromptToJsonButton_ACU.length) {
        $exportCharCardPromptToJsonButton_ACU.off('click').on('click', function () {
          exportCharCardPromptToJson_ACU();
        });
      }

      // Attach event listeners

        // --- [新增] Tab切换逻辑 ---
        const $tabButtons = $popupInstance_ACU.find('.acu-tab-button');
        const $tabContents = $popupInstance_ACU.find('.acu-tab-content');
        $tabButtons.on('click', function() {
            const tabId = jQuery_API_ACU(this).data('tab');
            $tabButtons.removeClass('active');
            jQuery_API_ACU(this).addClass('active');
            $tabContents.removeClass('active');
            $popupInstance_ACU.find(`#acu-tab-${tabId}`).addClass('active');
        });
        
        // API Mode switching logic
        if ($apiModeRadios.length) {
            $apiModeRadios.on('change', function() {
                const selectedMode = jQuery_API_ACU(this).val();
                settings_ACU.apiMode = selectedMode;
                saveSettings_ACU();
                updateApiModeView_ACU(selectedMode);
            });
        }
        if ($refreshTavernProfilesButton.length) {
            $refreshTavernProfilesButton.on('click', loadTavernApiProfiles_ACU);
        }
        if ($tavernProfileSelect.length) {
            $tavernProfileSelect.on('change', function() {
                settings_ACU.tavernProfile = jQuery_API_ACU(this).val();
                saveSettings_ACU();
            });
        }

        // [新增] 数据隔离/多副本机制事件绑定
        const $dataIsolationCodeInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-code`);
        const $dataIsolationSaveButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-save`);
        const $dataIsolationDeleteButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-delete-entries`); // [新增]
        const $dataIsolationCombo = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo`);
        const $dataIsolationHistoryToggle = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle`);
        const $dataIsolationHistoryList = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list`);

        const closeDataIsolationHistoryDropdown_ACU = () => {
            if ($dataIsolationCombo.length && $dataIsolationHistoryList.length) {
                $dataIsolationCombo.removeClass('open');
                $dataIsolationHistoryList.hide();
            }
        };

        const renderDataIsolationHistoryDropdown_ACU = () => {
            if (!$dataIsolationHistoryList.length) return;
            const history = getDataIsolationHistory_ACU();
            $dataIsolationHistoryList.empty();
            if (!history.length) {
                $dataIsolationHistoryList.append(
                    `<li class="acu-history-empty" style="padding: 6px 10px; color: var(--text-dim); user-select: none;">暂无历史记录</li>`,
                );
                return;
            }
            history.forEach(code => {
                const safeCode = escapeHtml_ACU(code);
                $dataIsolationHistoryList.append(
                    `<li class="acu-history-item" data-code="${safeCode}" title="${safeCode}" style="padding: 6px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <span class="acu-history-text" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeCode}</span>
                        <button type="button" class="acu-remove-code" data-code="${safeCode}" title="删除该标识" style="border: none; background: transparent; color: var(--error-color); cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                    </li>`,
                );
            });
        };

        // 初始化输入框的值
        if ($dataIsolationCodeInput.length) {
            $dataIsolationCodeInput.val(settings_ACU.dataIsolationCode || '');
        }
        // 初始化历史下拉
        renderDataIsolationHistoryDropdown_ACU();

        // [新增] 删除按钮事件
        if ($dataIsolationDeleteButton.length) {
            $dataIsolationDeleteButton.on('click', async function() {
                if (confirm('确定要删除当前标识下的所有注入世界书条目吗？\n(这不会删除聊天记录中的数据)')) {
                    await deleteAllGeneratedEntries_ACU(); // 此函数已修改为支持隔离逻辑
                    showToastr_ACU('success', '已删除相关世界书条目。');
                }
            });
        }

        // 保存按钮事件 (简化版隔离流程)
        if ($dataIsolationSaveButton.length) {
            $dataIsolationSaveButton.on('click', async function() {
                const code = $dataIsolationCodeInput.val().trim();

                if (code) showToastr_ACU('info', `正在切换到标识 [${code}] 的整套设置/模板/数据...`);
                else showToastr_ACU('info', `标识为空：正在切换到默认整套设置/模板/数据...`);

                // [Profile] 切换标识 = 切换 profile（设置+模板），标识列表跨 profile 共享
                await switchIsolationProfile_ACU(code);

                // 刷新下拉（跨标识共享）
                renderDataIsolationHistoryDropdown_ACU();
                // 同步输入框显示（以当前 profile 为准）
                if ($dataIsolationCodeInput.length) $dataIsolationCodeInput.val(settings_ACU.dataIsolationCode || '');
                
                // 强制重载
                await loadOrCreateJsonTableFromChatHistory_ACU();
                
                // 触发UI刷新
                // 1. 刷新可视化编辑器（如果打开）
                if (jQuery_API_ACU('#acu-visualizer-content').length || (typeof (window as any).ACU_WindowManager !== 'undefined' && (window as any).ACU_WindowManager.isOpen(`${SCRIPT_ID_PREFIX_ACU}-visualizer-window`))) {
                     jQuery_API_ACU(document).trigger('acu-visualizer-refresh-data');
                }
                
                // 2. [新增] 强制刷新前端UI显示的表格 (如果前端有监听 update 事件)
                if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI) {
                     (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
                }

                // 3. [新增] 强制刷新状态显示 (消息计数)
                if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
                    updateCardUpdateStatusDisplay_ACU();
                }
                
                showToastr_ACU('success', '数据载入完成！');
            });
        }
        
        // 保留回车键支持
        if ($dataIsolationCodeInput.length) {
            $dataIsolationCodeInput.on('keypress', function(e) {
                if (e.which === 13) { // Enter key
                    $dataIsolationSaveButton.trigger('click');
                }
            });
        }

        if ($dataIsolationHistoryToggle.length) {
            $dataIsolationHistoryToggle.on('click', function(e) {
                e.stopPropagation();
                if (!$dataIsolationHistoryList.length) return;
                const willOpen = !$dataIsolationCombo.hasClass('open');
                if (willOpen) {
                    renderDataIsolationHistoryDropdown_ACU();
                }
                $dataIsolationCombo.toggleClass('open', willOpen);
                $dataIsolationHistoryList.toggle(willOpen);
            });
        }

        if ($dataIsolationHistoryList.length) {
            $dataIsolationHistoryList.on('click', '.acu-history-item', function(e) {
                if (jQuery_API_ACU(e.target).hasClass('acu-remove-code')) return;
                const chosen = jQuery_API_ACU(this).data('code');
                if (chosen && $dataIsolationCodeInput.length) {
                    $dataIsolationCodeInput.val(chosen);
                }
                closeDataIsolationHistoryDropdown_ACU();
            });

            $dataIsolationHistoryList.on('click', '.acu-remove-code', function(e) {
                e.stopPropagation();
                const targetCode = jQuery_API_ACU(this).data('code');
                removeDataIsolationHistory_ACU(targetCode);
                renderDataIsolationHistoryDropdown_ACU();
            });
        }

        if ($dataIsolationCombo.length) {
            jQuery_API_ACU(document).on('click', function(e) {
                if (!$dataIsolationCombo.hasClass('open')) return;
                if (jQuery_API_ACU(e.target).closest($dataIsolationCombo).length === 0) {
                    closeDataIsolationHistoryDropdown_ACU();
                }
            });
        }

      // [新增] 世界书UI事件绑定
      if ($worldbookSourceRadios.length) {
          $worldbookSourceRadios.on('change', async function() {
              const worldbookConfig = getCurrentWorldbookConfig_ACU();
              worldbookConfig.source = jQuery_API_ACU(this).val();
              saveSettings_ACU();
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
              saveSettings_ACU();
              logDebug_ACU(`Import worldbook target changed to: ${settings_ACU.importWorldbookTarget}`);
          });
      }
      if ($importPromptExcludeImportedEntriesToggle.length) {
          $importPromptExcludeImportedEntriesToggle.off('change.acu_import_prompt_filter').on('change.acu_import_prompt_filter', function() {
              settings_ACU.importPromptExcludeImportedWorldbookEntries = jQuery_API_ACU(this).is(':checked');
              saveSettings_ACU();
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
              const charLorebooks = await TavernHelper_API_ACU.getCharLorebooks({ type: 'all' });
              if (charLorebooks.primary) names.push(charLorebooks.primary);
              if (charLorebooks.additional?.length) names.push(...charLorebooks.additional);
          } catch (e) {}
          return [...new Set(names.filter(Boolean))];
      };
      const isWorldbookEntryAllowedForUI_ACU = (entry) => {
          if (!entry) return false;
          const comment = entry.comment || '';
          if (comment.startsWith('TavernDB-ACU-') || comment.startsWith('重要人物条目') || comment.startsWith('总结条目')) {
              return false;
          }
          if (isEntryBlocked_ACU(entry)) return false;
          if (!entry.enabled) return false;
          return true;
      };
      const setWorldbookEntriesSelection_ACU = async (mode) => {
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
          saveSettings_ACU();
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
                  selection = selection.filter(name => name !== bookName);
              } else {
                  // Select
                  selection.push(bookName);
              }
              
              worldbookConfig.manualSelection = selection;
              $item.toggleClass('selected'); // Toggle visual state
              
              saveSettings_ACU();
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
              saveSettings_ACU();
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

      // [新增] “总结大纲(总体大纲)”条目启用开关
      const $outlineEnabledToggle = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled`);
      if ($outlineEnabledToggle.length) {
          $outlineEnabledToggle.off('change.acu_outline_toggle').on('change.acu_outline_toggle', async function() {
              // UI 是“0TK占用模式”
              const modeEnabled = jQuery_API_ACU(this).is(':checked');
              const worldbookConfig = getCurrentWorldbookConfig_ACU();
              worldbookConfig.zeroTkOccupyMode = !!modeEnabled;
              // 兼容：同步旧字段（旧语义：true=条目启用）
              worldbookConfig.outlineEntryEnabled = !modeEnabled;
              settings_ACU.zeroTkOccupyModeDefault = !!modeEnabled;
              globalMeta_ACU.zeroTkOccupyModeGlobal = !!modeEnabled;
              saveGlobalMeta_ACU();
              saveSettings_ACU();
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
                  if (primaryLorebookName && TavernHelper_API_ACU) {
                      const isoPrefix = getIsolationPrefix_ACU();
                      const allEntries = await TavernHelper_API_ACU.getLorebookEntries(primaryLorebookName);
                      // [修复] 使用endsWith匹配，因为条目名称可能带有隔离前缀
                      const existingIndexEntry = allEntries.find(e => e.comment && e.comment.endsWith('TavernDB-ACU-CustomExport-纪要索引'));
                      if (existingIndexEntry) {
                          const outlineEntryEnabled = !modeEnabled; // 0TK模式启用=条目禁用
                          if (existingIndexEntry.enabled !== outlineEntryEnabled) {
                              await TavernHelper_API_ACU.setLorebookEntries(primaryLorebookName, [{
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

      // [新增] 外部导入事件绑定
      if ($importTxtButton.length) {
          $importTxtButton.on('click', handleTxtImportAndSplit_ACU);
      }
      // [新增] 外部导入注入按钮（自选表格）在下方统一绑定（使用 $injectImportedTxtButton）
      
      const $restoreMergeSettingsButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-restore-merge-settings`);
      const $saveMergeSettingsButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-merge-settings`);

      if ($saveMergeSettingsButton.length) {
          $saveMergeSettingsButton.on('click', function() {
              // 保存所有合并相关设置
              const $promptInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template`);
              const $targetCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-target-count`);
              const $batchSize = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-batch-size`);
              const $startIndex = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-start-index`);
              const $endIndex = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-end-index`);
              const $autoEnabled = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-enabled`);
              const $autoThreshold = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-threshold`);
              const $autoReserve = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-reserve`);

              // 验证提示词
              const newPrompt = $promptInput.val();
              if (!newPrompt || !newPrompt.trim()) {
                  showToastr_ACU('warning', '提示词不能为空。');
                  return;
              }

              // 保存所有设置
              settings_ACU.mergeSummaryPrompt = newPrompt;
              settings_ACU.mergeTargetCount = parseInt($targetCount.val()) || 1;
              settings_ACU.mergeBatchSize = parseInt($batchSize.val()) || 5;
              settings_ACU.mergeStartIndex = parseInt($startIndex.val()) || 1;
              settings_ACU.mergeEndIndex = $endIndex.val() ? parseInt($endIndex.val()) : null;
              settings_ACU.autoMergeEnabled = $autoEnabled.is(':checked');
              settings_ACU.autoMergeThreshold = parseInt($autoThreshold.val()) || 20;
              settings_ACU.autoMergeReserve = parseInt($autoReserve.val()) || 0;

              saveSettings_ACU();
              showToastr_ACU('success', '所有合并设置已保存！');
          });
      }

      if ($restoreMergeSettingsButton.length) {
          $restoreMergeSettingsButton.on('click', function() {
              if (confirm('确定要将所有合并设置恢复为默认值吗？')) {
                  const $promptInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template`);
                  const $targetCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-target-count`);
                  const $batchSize = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-batch-size`);
                  const $startIndex = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-start-index`);
                  const $endIndex = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-end-index`);
                  const $autoEnabled = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-enabled`);
                  const $autoThreshold = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-threshold`);
                  const $autoReserve = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-reserve`);

                  // 恢复所有设置的默认值
                  $promptInput.val(DEFAULT_MERGE_SUMMARY_PROMPT_ACU);
                  $targetCount.val(1);
                  $batchSize.val(5);
                  $startIndex.val(1);
                  $endIndex.val('');
                  $autoEnabled.prop('checked', false);
                  $autoThreshold.val(20);
                  $autoReserve.val(0);

                  // 更新设置对象
                  settings_ACU.mergeSummaryPrompt = DEFAULT_MERGE_SUMMARY_PROMPT_ACU;
                  settings_ACU.mergeTargetCount = 1;
                  settings_ACU.mergeBatchSize = 5;
                  settings_ACU.mergeStartIndex = 1;
                  settings_ACU.mergeEndIndex = null;
                  settings_ACU.autoMergeEnabled = false;
                  settings_ACU.autoMergeThreshold = 20;
                  settings_ACU.autoMergeReserve = 0;

                  saveSettings_ACU();
                  showToastr_ACU('success', '所有合并设置已恢复默认值并保存。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE });
              }
          });
      }

      if ($injectImportedTxtButton && $injectImportedTxtButton.length) {
          $injectImportedTxtButton.on('click', handleInjectImportedTxtSelected_ACU);
      }
      
      // [新增] 删除注入条目按钮的事件绑定
      const $deleteImportedEntriesButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-imported-entries`);
      if ($deleteImportedEntriesButton.length) {
          $deleteImportedEntriesButton.on('click', deleteImportedEntries_ACU);
      }
      
      if ($clearImportedAllButton.length) {
          $clearImportedAllButton.on('click', () => clearImportedEntries_ACU(true));
      }
      // [新增] 绑定新按钮的点击事件
      if ($clearImportedCacheButton.length) {
          $clearImportedCacheButton.on('click', () => clearImportLocalStorage_ACU(true));
      }
      if ($saveImportSplitSizeButton_ACU.length) {
          $saveImportSplitSizeButton_ACU.on('click', saveImportSplitSize_ACU);
      }
      // Initial UI state update for the import tab
      void updateImportStatusUI_ACU();

      if ($useMainApiCheckbox_ACU.length) {
        $useMainApiCheckbox_ACU.on('change', function () {
            settings_ACU.apiConfig.useMainApi = jQuery_API_ACU(this).is(':checked');
            saveSettings_ACU();
            updateCustomApiInputsState_ACU();
            showToastr_ACU('info', `自定义API已切换为 ${settings_ACU.apiConfig.useMainApi ? '使用主API' : '使用独立配置'}`);
        });
      }
      // [新增] 流式传输开关事件监听
      if ($streamingEnabledCheckbox_ACU.length) {
        $streamingEnabledCheckbox_ACU.on('change', function () {
            settings_ACU.streamingEnabled = jQuery_API_ACU(this).is(':checked');
            saveSettings_ACU();
            showToastr_ACU('info', `流式传输已${settings_ACU.streamingEnabled ? '启用' : '关闭'}`);
        });
      }
      if ($loadModelsButton_ACU.length) $loadModelsButton_ACU.on('click', fetchModelsAndConnect_ACU);
      if ($saveApiConfigButton_ACU.length) $saveApiConfigButton_ACU.on('click', saveApiConfig_ACU);
      if ($clearApiConfigButton_ACU.length) $clearApiConfigButton_ACU.on('click', clearApiConfig_ACU);
      
      // [新增] 下拉选择改变时自动覆盖到输入框
      if ($customApiModelSelect_ACU.length) {
          $customApiModelSelect_ACU.on('change', function() {
              const selectedModel = jQuery_API_ACU(this).val();
              if (selectedModel && $customApiModelInput_ACU.length) {
                  $customApiModelInput_ACU.val(selectedModel);
              }
          });
      }

      // --- [新增] API预设管理事件绑定 ---
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-api-preset`).on('click', function() {
        const presetName = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-name`).val();
        if (saveApiPreset_ACU(presetName)) {
          $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-name`).val('');
        }
      });

      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-load-api-preset`).on('click', function() {
        const presetName = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-select`).val();
        if (presetName) {
          loadApiPreset_ACU(presetName);
        } else {
          showToastr_ACU('warning', '请先选择一个预设。');
        }
      });

      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-api-preset`).on('click', function() {
        const presetName = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-select`).val();
        if (presetName) {
          if (confirm(`确定要删除API预设 "${presetName}" 吗？`)) {
            deleteApiPreset_ACU(presetName);
          }
        } else {
          showToastr_ACU('warning', '请先选择一个预设。');
        }
      });

      // 填表API预设选择器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-api-preset-select`).on('change', function() {
        settings_ACU.tableApiPreset = jQuery_API_ACU(this).val();
        saveSettings_ACU();
        logDebug_ACU(`填表API预设已切换为: ${settings_ACU.tableApiPreset || '当前配置'}`);
      });

      // 填表正文标签提取规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`,
          { startPlaceholder: '开始词（例如：<think）', endPlaceholder: '结束词（例如：</think>）' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules .acu-exclude-rule-end`, function() {
        settings_ACU.tableContextExtractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`);
        saveSettings_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        settings_ACU.tableContextExtractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`);
        saveSettings_ACU();
      });

      // 填表正文标签排除规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`,
          { startPlaceholder: '开始词（例如：<thinking）', endPlaceholder: '结束词（例如：</thinking>）' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules .acu-exclude-rule-end`, function() {
        settings_ACU.tableContextExcludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`);
        saveSettings_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        settings_ACU.tableContextExcludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`);
        saveSettings_ACU();
      });

      // 剧情推进API预设选择器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select`).on('change', function() {
        settings_ACU.plotApiPreset = jQuery_API_ACU(this).val();
        saveSettings_ACU();
        logDebug_ACU(`剧情推进API预设已切换为: ${settings_ACU.plotApiPreset || '当前配置'}`);
      });

      if ($charCardPromptToggle_ACU.length)
        $charCardPromptToggle_ACU.on('click', () => $charCardPromptAreaDiv_ACU.slideToggle());
      if ($saveCharCardPromptButton_ACU.length) $saveCharCardPromptButton_ACU.on('click', saveCustomCharCardPrompt_ACU);
      if ($resetCharCardPromptButton_ACU.length)
        $resetCharCardPromptButton_ACU.on('click', resetDefaultCharCardPrompt_ACU);
      // 由上方“提示词组 JSON 导入/导出”统一做 off/on 绑定，避免重复绑定导致多次触发
      // if ($loadCharCardPromptFromJsonButton_ACU.length) $loadCharCardPromptFromJsonButton_ACU.on('click', loadCharCardPromptFromJson_ACU);
      
      // --- [新增] 对话编辑器事件绑定 ---
      $popupInstance_ACU.on('click', `.${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn`, function() {
          const position = jQuery_API_ACU(this).data('position');
          const newSegment = { role: 'USER', content: '', deletable: true };
          let segments = getCharCardPromptFromUI_ACU();
          if (position === 'top') {
              segments.unshift(newSegment);
          } else {
              segments.push(newSegment);
          }
          renderPromptSegments_ACU(segments);
      });

      $popupInstance_ACU.on('click', '.prompt-segment-delete-btn', function() {
          const indexToDelete = jQuery_API_ACU(this).data('index');
          let segments = getCharCardPromptFromUI_ACU();
          segments.splice(indexToDelete, 1);
          renderPromptSegments_ACU(segments);
      });

      // [新增] 主提示词槽位切换事件（A/B 两个槽位，各自保持唯一）
      $popupInstance_ACU.on('change', '.prompt-segment-main-slot', function() {
          const $currentSegment = jQuery_API_ACU(this).closest('.prompt-segment');
          const selected = String(jQuery_API_ACU(this).val() || '').toUpperCase();

          // 1) A/B 槽位唯一：同槽位的其他段落自动改为“普通”
          if (selected === 'A' || selected === 'B') {
            $charCardPromptSegmentsContainer_ACU
              .find('.prompt-segment')
              .not($currentSegment)
              .each(function() {
                const $seg = jQuery_API_ACU(this);
                const v = String($seg.find('.prompt-segment-main-slot').val() || '').toUpperCase();
                if (v === selected) {
                  $seg.find('.prompt-segment-main-slot').val('');
                }
              });
          }

          // 2) 统一刷新样式与删除按钮可见性
          $charCardPromptSegmentsContainer_ACU.find('.prompt-segment').each(function() {
            const $seg = jQuery_API_ACU(this);
            const slot = String($seg.find('.prompt-segment-main-slot').val() || '').toUpperCase();
            const isA = slot === 'A';
            const isB = slot === 'B';
            const isMain = isA || isB;
            const borderColor = isA ? 'var(--accent-primary)' : (isB ? '#ffb74d' : '');
            if (isMain) {
              $seg.css('border-left', `3px solid ${borderColor}`).attr('data-main-slot', slot);
              $seg.find('.prompt-segment-delete-btn').hide();
            } else {
              $seg.css('border-left', '').attr('data-main-slot', '');
              $seg.find('.prompt-segment-delete-btn').show();
            }
          });
      });
      

      // [优化] 填表相关参数：取消“保存按钮”，改为输入后自动保存（与剧情推进一致）
      const bindAutoSaveNumberInput_ACU = ($input, saveFn, debounceMs = 450) => {
          if (!$input || !$input.length || typeof saveFn !== 'function') return;
          let t = null;
          const run = () => saveFn({ silent: true, skipReload: true });
          $input.off('input.acu_autosave change.acu_autosave blur.acu_autosave')
              .on('input.acu_autosave', function() {
                  clearTimeout(t);
                  t = setTimeout(run, debounceMs);
              })
              .on('change.acu_autosave blur.acu_autosave', function() {
                  clearTimeout(t);
                  run();
              });
      };

      bindAutoSaveNumberInput_ACU($autoUpdateTokenThresholdInput_ACU, saveAutoUpdateTokenThreshold_ACU);
      bindAutoSaveNumberInput_ACU($autoUpdateThresholdInput_ACU, saveAutoUpdateThreshold_ACU);
      bindAutoSaveNumberInput_ACU($autoUpdateFrequencyInput_ACU, saveAutoUpdateFrequency_ACU);
      bindAutoSaveNumberInput_ACU($updateBatchSizeInput_ACU, saveUpdateBatchSize_ACU);
      bindAutoSaveNumberInput_ACU($maxConcurrentGroupsInput_ACU, saveMaxConcurrentGroups_ACU);
      bindAutoSaveNumberInput_ACU($skipUpdateFloorsInput_ACU, saveSkipUpdateFloors_ACU);
      bindAutoSaveNumberInput_ACU($retainRecentLayersInput_ACU, saveRetainRecentLayers_ACU);
      bindAutoSaveNumberInput_ACU($tableMaxRetriesInput_ACU, saveTableMaxRetries_ACU); // [新增] 填表重试次数
      if ($autoUpdateEnabledCheckbox_ACU.length) {
        $autoUpdateEnabledCheckbox_ACU.on('change', function () {
          settings_ACU.autoUpdateEnabled = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
          logDebug_ACU('数据库自动更新启用状态已保存:', settings_ACU.autoUpdateEnabled);
          showToastr_ACU('info', `数据库自动更新已 ${settings_ACU.autoUpdateEnabled ? '启用' : '禁用'}`);
        });
      }
      if ($standardizedTableFillEnabledCheckbox_ACU && $standardizedTableFillEnabledCheckbox_ACU.length) {
        $standardizedTableFillEnabledCheckbox_ACU.on('change', function () {
          settings_ACU.standardizedTableFillEnabled = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
          logDebug_ACU('规范填表功能启用状态已保存:', settings_ACU.standardizedTableFillEnabled);
          showToastr_ACU('info', `规范填表功能已 ${settings_ACU.standardizedTableFillEnabled ? '开启' : '关闭'}`, {
            acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE,
          });
        });
      }
      if ($toastMuteEnabledCheckbox_ACU && $toastMuteEnabledCheckbox_ACU.length) {
        $toastMuteEnabledCheckbox_ACU.on('change', function () {
          settings_ACU.toastMuteEnabled = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
          logDebug_ACU('静默提示框启用状态已保存:', settings_ACU.toastMuteEnabled);
          // 该提示属于“导入/手动操作类”允许项，避免用户开启后无反馈
          showToastr_ACU('info', `静默提示框已 ${settings_ACU.toastMuteEnabled ? '开启' : '关闭'}`, {
            acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
          });
        });
      }
      if ($promptTemplateEnabledCheckbox_ACU && $promptTemplateEnabledCheckbox_ACU.length) {
        $promptTemplateEnabledCheckbox_ACU.on('change', function () {
          if (!settings_ACU.promptTemplateSettings) {
            settings_ACU.promptTemplateSettings = { enabled: true, maxNestingDepth: 10, debugMode: false };
          }
          settings_ACU.promptTemplateSettings.enabled = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
          logDebug_ACU('条件模板功能启用状态已保存:', settings_ACU.promptTemplateSettings.enabled);
          showToastr_ACU('info', `条件模板功能已 ${settings_ACU.promptTemplateSettings.enabled ? '开启' : '关闭'}`, {
            acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE,
          });
        });
      }
      if ($tableEditLastPairOnlyCheckbox_ACU && $tableEditLastPairOnlyCheckbox_ACU.length) {
        $tableEditLastPairOnlyCheckbox_ACU.on('change', function () {
          settings_ACU.tableEditLastPairOnly = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
          logDebug_ACU('仅识别最后一对 tableEdit 启用状态已保存:', settings_ACU.tableEditLastPairOnly);
          showToastr_ACU('info', `tableEdit 解析将${settings_ACU.tableEditLastPairOnly ? '仅使用最后一对标签' : '按全部标签优先匹配'}`, {
            acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE,
          });
        });
      }
      // [新增] 统一的手动更新按钮
      if ($manualUpdateCardButton_ACU && $manualUpdateCardButton_ACU.length) {
          $manualUpdateCardButton_ACU.on('click', handleManualUpdate_ACU);
      }
      // Removed $advHideToggle event listener
        if ($importTemplateButton_ACU.length) {
            $importTemplateButton_ACU.off('click.acu_template_scope').on('click.acu_template_scope', function() {
                importTableTemplate_ACU({ scope: 'global' });
            });
        }
        if ($exportTemplateButton_ACU.length) {
            $exportTemplateButton_ACU.off('click.acu_template_scope').on('click.acu_template_scope', function() {
                exportTableTemplate_ACU({ scope: 'global' });
            });
        }
        if ($resetTemplateButton_ACU.length) {
            $resetTemplateButton_ACU.off('click.acu_template_scope').on('click.acu_template_scope', function() {
                resetTableTemplate_ACU({ source: 'ui_global_reset', scope: 'global' });
            });
        }

        const refreshTemplatePresetUiState_ACU = ({ globalSelectName = null, keepGlobalValue = false } = {}) => {
            if (!$popupInstance_ACU || !$popupInstance_ACU.length) return;
            loadTemplatePresetSelect_ACU({ globalSelectName, keepGlobalValue });
        };

        const persistCurrentTemplateChatSnapshot_ACU = async ({ source = 'ui_chat_save', presetName = null, showToast = true } = {}) => {
            const selectedChatPresetName = normalizeTemplatePresetSelectionValue_ACU(
                jQuery_API_ACU($templateChatPresetSelect_ACU).val(),
            );
            const resolvedPresetName = presetName === null
                ? (selectedChatPresetName || resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true }))
                : normalizeTemplatePresetSelectionValue_ACU(presetName);
            const guideData = getChatSheetGuideDataForIsolationKey_ACU(getCurrentIsolationKey_ACU());
            persistTemplateScopeSelectionState_ACU(resolvedPresetName, {
                source,
                updateGlobal: false,
                save: true,
                persistChatScope: true,
                templateSource: TABLE_TEMPLATE_ACU,
                guideData,
                scopeMode: 'chat_override',
                registerChatPresetEntry: true,
            });
            applyTemplateScopeForCurrentChat_ACU();
            try { await refreshMergedDataAndNotify_ACU(); } catch (e) {}
            refreshTemplatePresetUiState_ACU({ keepGlobalValue: true });
            if (showToast) {
                showToastr_ACU('success', `当前聊天预设已保存${resolvedPresetName ? `（预设名：${resolvedPresetName}）` : '（默认预设）'}；后续在此聊天再次保存会直接覆盖同名聊天预设。`, {
                    acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                });
            }
            return true;
        };

        const exportCurrentChatTemplateSnapshot_ACU = () => {
            const effectivePresetName = normalizeTemplatePresetSelectionValue_ACU(resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true }));
            const chatScopeState = getCurrentChatTemplateScopeState_ACU();
            const snapshot = sanitizeTemplateSnapshotForChat_ACU(chatScopeState?.templateStr || TABLE_TEMPLATE_ACU);
            if (!snapshot?.templateObj) {
                showToastr_ACU('error', '读取当前聊天模板快照失败。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                return;
            }

            const jsonString = JSON.stringify(snapshot.templateObj, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `template_chat_snapshot_${(effectivePresetName || 'default').replace(/[^a-z0-9]/gi, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToastr_ACU('success', `当前聊天模板快照已导出${effectivePresetName ? `（预设名：${effectivePresetName}）` : ''}。`, {
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
            });
        };

        refreshTemplatePresetUiState_ACU({ keepGlobalValue: false });

        // --- [模板预设库] 全局 / 当前聊天双作用域 ---
        if ($templatePresetSelect_ACU && $templatePresetSelect_ACU.length) {
            $templatePresetSelect_ACU.off('change.acu_template_preset').on('change.acu_template_preset', async function() {
                const name = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU(this).val());
                const displayName = name || '默认预设';
                showToastr_ACU('info', `正在切换全局模板预设：${displayName}...`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                const result = await applyTemplatePresetToCurrent_ACU(name, {
                    source: 'ui_global_select',
                    updateGlobal: true,
                    refreshUi: true,
                    save: true,
                    persistChatScope: false,
                });
                if (result) {
                    refreshTemplatePresetUiState_ACU({ globalSelectName: name, keepGlobalValue: false });
                    showToastr_ACU('success', `全局模板预设已切换：${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                } else {
                    showToastr_ACU('error', `全局模板预设切换失败：${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    refreshTemplatePresetUiState_ACU({ keepGlobalValue: false });
                }
            });
        }
        if ($templateChatPresetSelect_ACU && $templateChatPresetSelect_ACU.length) {
            $templateChatPresetSelect_ACU.off('change.acu_template_preset').on('change.acu_template_preset', async function() {
                const name = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU(this).val());
                const displayName = name || '默认预设';
                showToastr_ACU('info', `正在切换当前聊天模板预设：${displayName}...`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                const result = await applyTemplatePresetToCurrent_ACU(name, {
                    source: 'ui_chat_select',
                    updateGlobal: false,
                    refreshUi: true,
                    save: true,
                    persistChatScope: true,
                });
                if (result) {
                    refreshTemplatePresetUiState_ACU({ keepGlobalValue: true });
                    if ((result as any).mode === 'chat_override') {
                        showToastr_ACU('success', `当前聊天已切换到本地模板预设：${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    } else {
                        showToastr_ACU('success', `当前聊天已切换到引用预设：${displayName}；当前聊天尚未生成本地快照。`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    }
                } else {
                    showToastr_ACU('error', `当前聊天模板预设切换失败：${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    refreshTemplatePresetUiState_ACU({ keepGlobalValue: true });
                }
            });
        }
        if ($templatePresetSaveBtn_ACU && $templatePresetSaveBtn_ACU.length) {
            $templatePresetSaveBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                const currentSelectedName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                let finalName = currentSelectedName;
                if (isDefaultTemplatePresetSelection_ACU(currentSelectedName)) {
                    const promptedName = prompt('请输入要保存的全局模板预设名称：', '新模板预设');
                    if (!promptedName) return;
                    finalName = String(promptedName).trim();
                } else if (!confirm(`确定要用当前模板覆盖全局预设 "${currentSelectedName}" 吗？同名全局预设会被覆盖，当前聊天的本地预设不会被自动清除。`)) {
                    return;
                }
                if (!finalName) return;
                const norm = normalizeTemplateForPresetSave_ACU();
                if (!norm) {
                    showToastr_ACU('error', '保存全局模板预设失败：无法解析当前模板。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const ok = upsertTemplatePreset_ACU(finalName, norm.templateStr);
                if (!ok) {
                    showToastr_ACU('error', '保存全局模板预设失败：无法写入设置存储。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const applied = await applyTemplatePresetToCurrent_ACU(finalName, {
                    source: 'ui_global_save',
                    updateGlobal: true,
                    refreshUi: true,
                    save: true,
                    persistChatScope: false,
                });
                if (!applied) {
                    showToastr_ACU('error', '保存后切换全局模板预设失败。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                showToastr_ACU('success', `已保存全局模板预设：${finalName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templatePresetSaveAsBtn_ACU && $templatePresetSaveAsBtn_ACU.length) {
            $templatePresetSaveAsBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                const cur = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                const defaultName = cur ? `${cur}_副本` : '新模板预设';
                const raw = prompt('另存为全局模板预设名称：', defaultName);
                if (!raw) return;
                const norm = normalizeTemplateForPresetSave_ACU();
                if (!norm) {
                    showToastr_ACU('error', '另存为全局模板预设失败：无法解析当前模板。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const requested = String(raw).trim();
                if (!requested) return;
                const finalName = ensureUniqueTemplatePresetName_ACU(requested);
                if (finalName !== requested) {
                    if (!confirm(`预设名已存在，将自动另存为 "${finalName}"。是否继续？`)) return;
                }
                const ok = upsertTemplatePreset_ACU(finalName, norm.templateStr);
                if (!ok) {
                    showToastr_ACU('error', '另存为全局模板预设失败：无法写入设置存储。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const applied = await applyTemplatePresetToCurrent_ACU(finalName, {
                    source: 'ui_global_save_as',
                    updateGlobal: true,
                    refreshUi: true,
                    save: true,
                    persistChatScope: false,
                });
                if (!applied) {
                    showToastr_ACU('error', '另存为后切换全局模板预设失败。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                showToastr_ACU('success', `已另存为全局模板预设：${finalName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templatePresetRenameBtn_ACU && $templatePresetRenameBtn_ACU.length) {
            $templatePresetRenameBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                const oldName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                if (isDefaultTemplatePresetSelection_ACU(oldName)) {
                    showToastr_ACU('warning', '默认全局预设不能重命名。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    return;
                }
                const preset = getTemplatePreset_ACU(oldName);
                if (!preset?.templateStr) {
                    showToastr_ACU('warning', '找不到当前选中的全局模板预设。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    return;
                }
                const newName = prompt(`将全局模板预设 "${oldName}" 重命名为：`, oldName);
                if (!newName) return;
                const nn = String(newName).trim();
                if (!nn) return;
                const saveOk = upsertTemplatePreset_ACU(nn, preset.templateStr);
                if (!saveOk) {
                    showToastr_ACU('error', '重命名全局模板预设失败：无法写入设置存储。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                if (nn !== oldName) {
                    deleteTemplatePreset_ACU(oldName);
                }
                if (normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU({ requireExisting: false })) === oldName) {
                    persistCurrentTemplatePresetName_ACU(nn, { save: false });
                    saveSettings_ACU();
                }
                refreshTemplatePresetUiState_ACU({ globalSelectName: nn, keepGlobalValue: false });
                showToastr_ACU('success', `全局模板预设已重命名：${oldName} → ${nn}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templatePresetDeleteBtn_ACU && $templatePresetDeleteBtn_ACU.length) {
            $templatePresetDeleteBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                const name = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                if (isDefaultTemplatePresetSelection_ACU(name)) {
                    showToastr_ACU('warning', '默认全局预设不能删除。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    return;
                }
                if (!confirm(`确定要删除全局模板预设 "${name}" 吗？此操作不可撤销。`)) return;
                const ok = deleteTemplatePreset_ACU(name);
                refreshTemplatePresetUiState_ACU({ keepGlobalValue: false });
                if (ok) {
                    const activeGlobalName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU({ requireExisting: false }));
                    if (activeGlobalName === name) {
                        showToastr_ACU('success', `已从全局模板库删除预设：${name}。当前 profile 仍保留这份模板快照，直到你再次切换或恢复默认。`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    } else {
                        showToastr_ACU('success', `已删除全局模板预设：${name}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    }
                } else {
                    showToastr_ACU('warning', `删除失败或全局模板预设不存在：${name}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                }
            });
        }
        if ($templateChatSaveBtn_ACU && $templateChatSaveBtn_ACU.length) {
            $templateChatSaveBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                await persistCurrentTemplateChatSnapshot_ACU({ source: 'ui_chat_save' });
            });
        }
        if ($templateChatExportBtn_ACU && $templateChatExportBtn_ACU.length) {
            $templateChatExportBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                exportCurrentChatTemplateSnapshot_ACU();
            });
        }
        if ($templateChatClearOverrideBtn_ACU && $templateChatClearOverrideBtn_ACU.length) {
            $templateChatClearOverrideBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                const currentSelectedName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templateChatPresetSelect_ACU).val());
                let finalName = currentSelectedName;
                if (isDefaultTemplatePresetSelection_ACU(currentSelectedName)) {
                    const promptedName = prompt('请输入要保存到全局的模板预设名称：', '新模板预设');
                    if (!promptedName) return;
                    finalName = String(promptedName).trim();
                } else if (!confirm(`确定要用当前聊天正在使用的模板覆盖全局预设 "${currentSelectedName}" 吗？`)) {
                    return;
                }
                if (!finalName) return;
                const norm = normalizeTemplateForPresetSave_ACU();
                if (!norm) {
                    showToastr_ACU('error', '保存到全局失败：无法解析当前模板。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const ok = upsertTemplatePreset_ACU(finalName, norm.templateStr);
                if (!ok) {
                    showToastr_ACU('error', '保存到全局失败：无法写入设置存储。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const applied = await applyTemplatePresetToCurrent_ACU(finalName, {
                    source: 'ui_chat_save_to_global',
                    updateGlobal: true,
                    refreshUi: true,
                    save: true,
                    persistChatScope: false,
                });
                if (!applied) {
                    showToastr_ACU('error', '保存到全局后切换全局模板预设失败。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                refreshTemplatePresetUiState_ACU({ globalSelectName: finalName, keepGlobalValue: false });
                showToastr_ACU('success', `当前聊天模板配置已保存到全局预设：${finalName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templateChatImportBtn_ACU && $templateChatImportBtn_ACU.length) {
            $templateChatImportBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                if ($templateChatPresetFileInput_ACU && $templateChatPresetFileInput_ACU.length) {
                    $templateChatPresetFileInput_ACU.click();
                }
            });
        }
        if ($templateChatPresetFileInput_ACU && $templateChatPresetFileInput_ACU.length) {
            $templateChatPresetFileInput_ACU.off('change.acu_template_preset').on('change.acu_template_preset', function(e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async readerEvent => {
                    try {
                        const content = String(readerEvent?.target?.result || '');
                        const prepared = parseImportedTemplateData_ACU(content);
                        const fallbackLabel = `导入模板_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
                        const selectedChatPresetName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templateChatPresetSelect_ACU).val());
                        const presetName = normalizeTemplatePresetSelectionValue_ACU(
                            deriveTemplatePresetNameForImport_ACU({
                                filename: file?.name,
                                fallbackLabel: selectedChatPresetName || fallbackLabel,
                            }) || selectedChatPresetName || fallbackLabel,
                        );
                        const applied = await applyTemplateSnapshotToScope_ACU(prepared.templateStr, {
                            scope: 'chat',
                            source: 'ui_chat_import',
                            presetName,
                            refreshUi: true,
                            save: true,
                            persistChatScope: true,
                            registerChatPresetEntry: true,
                        });
                        if (!applied) {
                            throw new Error('模板结构无效，无法生成当前聊天模板预设。');
                        }
                        try { await refreshMergedDataAndNotify_ACU(); } catch (e) {}
                        refreshTemplatePresetUiState_ACU({ keepGlobalValue: true });
                        showToastr_ACU('success', `当前聊天模板预设已导入${presetName ? `（预设名：${presetName}）` : ''}；同名聊天预设会直接覆盖。`, {
                            acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                        });
                    } catch (error) {
                        logError_ACU('[TemplateScope] 导入当前聊天模板预设失败:', error);
                        showToastr_ACU('error', `导入当前聊天模板预设失败: ${error.message}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR, timeOut: 10000 });
                    } finally {
                        $templateChatPresetFileInput_ACU.val('');
                    }
                };
                reader.readAsText(file, 'UTF-8');
            });
        }
        if ($resetAllDefaultsButton_ACU.length) $resetAllDefaultsButton_ACU.on('click', resetAllToDefaults_ACU);
        if ($exportJsonDataButton_ACU.length) $exportJsonDataButton_ACU.on('click', exportCurrentJsonData_ACU);

        // [新增] 模板覆盖最新层数据按钮绑定
        const $overrideWithTemplateButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-override-with-template`);
        if ($overrideWithTemplateButton.length) {
            $overrideWithTemplateButton.on('click', overrideLatestLayerWithTemplate_ACU);
        }
        
        // [新增] 删除本地数据按钮绑定
        const $deleteCurrentLocalDataButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-current-local-data`);
        const $deleteAllLocalDataButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-all-local-data`);

        if ($deleteCurrentLocalDataButton.length) {
            $deleteCurrentLocalDataButton.on('click', function() {
                const $startFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-start-floor`);
                const $endFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-end-floor`);

                const startFloor = $startFloor.length ? parseInt($startFloor.val()) || null : null;
                const endFloor = $endFloor.length && $endFloor.val() ? parseInt($endFloor.val()) || null : null;

                // 保存楼层范围设置
                settings_ACU.deleteStartFloor = startFloor;
                settings_ACU.deleteEndFloor = endFloor;
                saveSettings_ACU();

                const identityText = settings_ACU.dataIsolationEnabled ? `标识 [${settings_ACU.dataIsolationCode}]` : "所有标识";
                const rangeText = startFloor && endFloor ? `第${startFloor}到${endFloor}AI楼层` :
                                startFloor ? `从第${startFloor}AI楼层开始` :
                                endFloor ? `到第${endFloor}AI楼层结束` : "全部AI楼层";

                if (confirm(`警告：这将永久删除当前聊天记录中${rangeText}所有属于 ${identityText} 的数据库数据。\n\n此操作不可恢复！\n\n确定要继续吗？`)) {
                    deleteLocalDataInChat_ACU('current', startFloor, endFloor);
                }
            });
        }

        if ($deleteAllLocalDataButton.length) {
            $deleteAllLocalDataButton.on('click', function() {
                const $startFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-start-floor`);
                const $endFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-end-floor`);

                const startFloor = $startFloor.length ? parseInt($startFloor.val()) || null : null;
                const endFloor = $endFloor.length && $endFloor.val() ? parseInt($endFloor.val()) || null : null;

                // 保存楼层范围设置
                settings_ACU.deleteStartFloor = startFloor;
                settings_ACU.deleteEndFloor = endFloor;
                saveSettings_ACU();

                const rangeText = startFloor && endFloor ? `第${startFloor}到${endFloor}AI楼层` :
                                startFloor ? `从第${startFloor}AI楼层开始` :
                                endFloor ? `到第${endFloor}AI楼层结束` : "全部AI楼层";

                if (confirm(`严重警告：这将永久删除当前聊天记录中${rangeText}【所有】数据库数据，无论其标识是什么。\n\n此操作不可恢复！\n\n确定要继续吗？`)) {
                    // 二次确认
                    if (confirm(`再次确认：您真的要清空当前聊天的${rangeText}所有数据库存档吗？`)) {
                        deleteLocalDataInChat_ACU('all', startFloor, endFloor);
                    }
                }
            });
        }

        if ($importCombinedSettingsButton.length) $importCombinedSettingsButton.on('click', importCombinedSettings_ACU);
        if ($exportCombinedSettingsButton.length) $exportCombinedSettingsButton.on('click', exportCombinedSettings_ACU);
        if ($openNewVisualizerButton_ACU.length) {
            $openNewVisualizerButton_ACU.on('click', function() {
                if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI && (topLevelWindow_ACU as any).AutoCardUpdaterAPI.openVisualizer) {
                    (topLevelWindow_ACU as any).AutoCardUpdaterAPI.openVisualizer();
                } else {
                     openNewVisualizer_ACU(); // Fallback direct call
                }
            });
        }

        // [新增] 绑定合并总结按钮事件
        const $startMergeSummaryButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-start-merge-summary`);
        if ($startMergeSummaryButton.length) {
            $startMergeSummaryButton.on('click', handleManualMergeSummary_ACU);
            
            // 尝试加载默认的提示词模板
            const $promptArea = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template`);
            // 这里我们暂时硬编码一个默认值，或者可以通过 ajax 读取文件，但由于这是一个 Tampermonkey 脚本，直接读取文件比较困难
            // 用户提到 "你帮我在旁边新建并设计一个提示词.txt文档供我检查修改"
            // 所以我们可以尝试通过 fetch 获取，或者直接把之前生成的默认值放这里作为 placeholder
            // 更好的方式是每次打开弹窗时去读取那个文件? 不太行，Tampermonkey 读取本地文件受限。
            // 我们先把默认值填进去。
             const defaultMergePrompt = `你接下来需要扮演一个填表用的美杜莎，你需要参考之前的背景设定以及对发送给你的数据进行合并与精简。
你需要在 <现有基础数据> (已生成的底稿) 的基础上，将本批次的 <新增总结数据> 和 <新增大纲数据> 融合进去，并对整体内容进行重新梳理和精简。

### 核心任务
分别维护两个表格：
1.  **总结表 (Table 0)**: 记录关键剧情总结。
2.  **总体大纲 (Table 1)**: 记录时间线和事件大纲。

目标总条目数：将本批次的两个表数据分别精简为 $TARGET_COUNT 条后通过insertRow指令分别插入基础数据中对应的表格当中，注意保持两个表索引条目一致

### 输入数据区
<新增总结数据>:
$A

<新增大纲数据>:
$B

<现有基础数据> (你需要在此基础上插入本批次精简后的条目):
$BASE_DATA

### 填写指南
    **严格格式**:
\`<tableEdit>\` (表格编辑指令块):
功能: 包含实际执行表格数据更新的操作指令 (\`insertRow\`)。所有指令必须被完整包含在 \`<!--\` 和 \`-->\` 注释块内。

**输出格式强制要求:**
- **纯文本输出:** 严格按照 \`<tableThink>\`,  \`<tableEdit>\` 顺序。
- **禁止封装:** 严禁使用 markdown 代码块、引号包裹整个输出。
- **无额外字符:** 除了指令本身，禁止添加任何解释性文字。

**\`<tableEdit>\` 指令语法 (严格遵守):**
- **操作类型**: 仅限\`insertRow\`
- **参数格式**:
    - \`tableIndex\` (表序号): **必须使用你在映射步骤中从标题 \`[Index:Name]\` 提取的真实索引**。
    - \`rowIndex\` (行序号): 对应表格中的行索引 (数字, 从0开始)。
    - \`colIndex\` (列序号): 必须是**带双引号的字符串** (如 \`"0"\`).
- **指令示例**:
    - 插入: \`insertRow(10, {"0": "数据1", "1": 100})\` (注意: 如果表头是 \`[10:xxx]\`，这里必须是 10)


### 输出示例
<tableThink>
<!-- 思考：将新增的战斗细节合并入现有的第3条总结中... 新增的大纲是新的时间点，添加在最后... -->
</tableThink>
<tableEdit>
insertRow(0, ["总结条目1...", "关键词"]);
insertRow(0, ["总结条目2...", "关键词"]);
insertRow(1, ["时间1", "大纲事件1...", "关键词"]);
insertRow(1, ["时间2", "大纲事件2...", "关键词"]);
</tableEdit>`;
            if ($promptArea.length && !$promptArea.val()) {
                $promptArea.val(defaultMergePrompt);
            }
        }

      // Removed call to applyActualMessageVisibility_ACU();
      // Removed call to updateAdvancedHideUIDisplay_ACU();
      if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU(); // Call here

      // --- [剧情推进] UI事件绑定 ---
      // 剧情推进功能开关
      const $plotEnabledCheckbox = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-enabled`);
      if ($plotEnabledCheckbox.length) {
        $plotEnabledCheckbox.on('change', function() {
          settings_ACU.plotSettings.enabled = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
        });
      }


      // 剧情推进：独立提示词组 + 最终注入指令
      // 1) 最终注入指令仍使用原字段（兼容旧数据/旧编辑器）
      const $plotFinalDirective = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-final-directive`);
      if ($plotFinalDirective.length) {
        $plotFinalDirective.on('input change', function() {
          const value = jQuery_API_ACU(this).val() || '';
          const plotSettings = getActivePlotEditorSettings_ACU();
          if (!plotSettings) return;
          plotSettings.finalSystemDirective = value;
          setPlotPromptContentByIdForSettings_ACU(plotSettings, 'finalSystemDirective', value);
          saveSettings_ACU();
        });
      }

      // 2) 独立提示词组编辑器（段落）
      _assignUIPlaceholders_ACU({
        $plotPromptSegmentsContainer_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-prompt-segments-container`),
        $plotTaskListContainer_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-task-list`),
      });

      // 初次载入：若缺失 plotTasks / promptGroup，则从旧结构迁移生成
      try {
        setActivePlotEditorSettings_ACU(settings_ACU.plotSettings);
        ensurePlotTasksCompat_ACU(settings_ACU.plotSettings, { persist: true, syncLegacy: true });
      } catch (e) {}
      try {
        renderPlotTaskList_ACU();
        loadCurrentPlotTaskToUI_ACU();
      } catch (e) {}

      // 任务切换/新增/删除/排序
      $popupInstance_ACU.on('click', '.acu-plot-task-item', function() {
        const taskId = jQuery_API_ACU(this).data('task-id');
        if (!taskId) return;
        selectPlotTaskForEditing_ACU(taskId, { saveCurrent: true });
      });
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-task-add`).on('click', function() {
        addPlotTaskFromUI_ACU();
      });
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-task-delete`).on('click', function() {
        deleteCurrentPlotTaskFromUI_ACU();
      });
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-task-move-up`).on('click', function() {
        moveCurrentPlotTask_ACU('up');
      });
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-task-move-down`).on('click', function() {
        moveCurrentPlotTask_ACU('down');
      });

      // 添加段落
      $popupInstance_ACU.on('click', `.${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt-segment-btn`, function() {
        const position = jQuery_API_ACU(this).data('position');
        const newSegment = { role: 'USER', content: '', deletable: true };
        let segments = getPlotPromptGroupFromUI_ACU();
        if (position === 'top') segments.unshift(newSegment);
        else segments.push(newSegment);
        renderPlotPromptSegments_ACU(segments);
        schedulePlotTaskAutoSave_ACU({ renderTaskList: false });
      });

      // 删除段落
      $popupInstance_ACU.on('click', '.plot-prompt-segment-delete-btn', function() {
        const indexToDelete = jQuery_API_ACU(this).data('index');
        let segments = getPlotPromptGroupFromUI_ACU();
        segments.splice(indexToDelete, 1);
        renderPlotPromptSegments_ACU(segments);
        schedulePlotTaskAutoSave_ACU({ renderTaskList: false });
      });

      // A/B 槽位唯一
      $popupInstance_ACU.on('change', '.plot-prompt-segment-main-slot', function() {
        const $currentSegment = jQuery_API_ACU(this).closest('.plot-prompt-segment');
        const selected = String(jQuery_API_ACU(this).val() || '').toUpperCase();

        if (selected === 'A' || selected === 'B') {
          $plotPromptSegmentsContainer_ACU
            .find('.plot-prompt-segment')
            .not($currentSegment)
            .each(function() {
              const $seg = jQuery_API_ACU(this);
              const v = String($seg.find('.plot-prompt-segment-main-slot').val() || '').toUpperCase();
              if (v === selected) {
                $seg.find('.plot-prompt-segment-main-slot').val('');
              }
            });
        }

        // 刷新样式/删除按钮
        $plotPromptSegmentsContainer_ACU.find('.plot-prompt-segment').each(function() {
          const $seg = jQuery_API_ACU(this);
          const slot = String($seg.find('.plot-prompt-segment-main-slot').val() || '').toUpperCase();
          const isA = slot === 'A';
          const isB = slot === 'B';
          const isMain = isA || isB;
          const borderColor = isA ? 'var(--accent-primary)' : (isB ? '#ffb74d' : '');
          if (isMain) {
            $seg.css('border-left', `3px solid ${borderColor}`).attr('data-main-slot', slot);
            $seg.find('.plot-prompt-segment-delete-btn').hide();
          } else {
            $seg.css('border-left', '').attr('data-main-slot', '');
            $seg.find('.plot-prompt-segment-delete-btn').show();
          }
        });
        schedulePlotTaskAutoSave_ACU({ renderTaskList: false });
      });

      $popupInstance_ACU.on('input change', '.plot-prompt-segment-role, .plot-prompt-segment-content', function() {
        schedulePlotTaskAutoSave_ACU({ renderTaskList: false });
      });

      // 任务基础信息自动保存
      [
        `#${SCRIPT_ID_PREFIX_ACU}-plot-task-name`,
        `#${SCRIPT_ID_PREFIX_ACU}-plot-extract-tags`,
        `#${SCRIPT_ID_PREFIX_ACU}-plot-min-length`,
        `#${SCRIPT_ID_PREFIX_ACU}-plot-task-stage`,
        `#${SCRIPT_ID_PREFIX_ACU}-plot-task-max-retries`,
      ].forEach(selector => {
        $popupInstance_ACU.on('input change', selector, function() {
          schedulePlotTaskAutoSave_ACU({ renderTaskList: true });
        });
      });
      $popupInstance_ACU.on('change', `#${SCRIPT_ID_PREFIX_ACU}-plot-task-enabled`, function() {
        saveCurrentPlotTaskFromUI_ACU({ silent: true, renderTaskList: true, persist: true });
        loadCurrentPlotTaskToUI_ACU();
      });

      // 匹配替换速率保存
      const plotRateInputs = [
        { id: 'plot-rate-main', key: 'rateMain', defaultValue: 1.0 },
        { id: 'plot-rate-personal', key: 'ratePersonal', defaultValue: 1.0 },
        { id: 'plot-rate-erotic', key: 'rateErotic', defaultValue: 0 },
        { id: 'plot-rate-cuckold', key: 'rateCuckold', defaultValue: 1.0 },
        { id: 'plot-recall-count', key: 'recallCount', defaultValue: 20 }
      ];

      plotRateInputs.forEach(({ id, key, defaultValue }) => {
        const $input = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-${id}`);
        if ($input.length) {
          $input.on('input change', function() {
            const plotSettings = getActivePlotEditorSettings_ACU();
            if (!plotSettings) return;
            plotSettings[key] = parseFloat(jQuery_API_ACU(this).val()) || defaultValue;
            saveSettings_ACU();
          });
        }
      });

      // 剧情推进其他全局参数自动保存（不含任务私有参数）
      const plotPersistentInputs = [
        { id: 'plot-context-turn-count', key: 'contextTurnCount', type: 'number' },
        // 注意：plot-quick-reply-content 已改为数组，不再使用单个输入框，改用循环提示词列表管理
        { id: 'plot-loop-tags', key: 'loopSettings.loopTags', type: 'string' },
        { id: 'plot-loop-delay', key: 'loopSettings.loopDelay', type: 'number' },
        { id: 'plot-loop-total-duration', key: 'loopSettings.loopTotalDuration', type: 'number' },
        { id: 'plot-max-retries', key: 'loopSettings.maxRetries', type: 'number' }
      ];

      plotPersistentInputs.forEach(({ id, key, type }) => {
        const $input = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-${id}`);
        if ($input.length) {
          $input.on('input change', function() {
            const plotSettings = getActivePlotEditorSettings_ACU();
            if (!plotSettings) return;

            let value = jQuery_API_ACU(this).val();
            if (type === 'number') {
              value = parseFloat(value) || 0;
            }

            if (key.includes('.')) {
              const [parent, child] = key.split('.');
              if (!plotSettings[parent]) {
                plotSettings[parent] = {};
              }
              plotSettings[parent][child] = value;
            } else {
              plotSettings[key] = value;
            }

            saveSettings_ACU();
          });
        }
      });

      // 剧情推进正文标签提取规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules`,
          { startPlaceholder: '开始词（例如：<think）', endPlaceholder: '结束词（例如：</think>）' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules .acu-exclude-rule-end`, function() {
        const plotSettings = getActivePlotEditorSettings_ACU();
        if (!plotSettings) return;
        plotSettings.contextExtractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules`);
        saveSettings_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules .acu-exclude-rule-delete`, function() {
        const plotSettings = getActivePlotEditorSettings_ACU();
        if (!plotSettings) return;
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        plotSettings.contextExtractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules`);
        saveSettings_ACU();
      });

      // 剧情推进标签排除规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules`,
          { startPlaceholder: '开始词（例如：<thinking）', endPlaceholder: '结束词（例如：</thinking>）' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules .acu-exclude-rule-end`, function() {
        const plotSettings = getActivePlotEditorSettings_ACU();
        if (!plotSettings) return;
        plotSettings.contextExcludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules`);
        saveSettings_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules .acu-exclude-rule-delete`, function() {
        const plotSettings = getActivePlotEditorSettings_ACU();
        if (!plotSettings) return;
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        plotSettings.contextExcludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules`);
        saveSettings_ACU();
      });

      // 循环提示词列表管理
      // 确保兼容性
      ensureLoopPromptsArray_ACU(settings_ACU.plotSettings);
      // 初始渲染
      renderLoopPromptsList_ACU();

      // 添加提示词按钮
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt`, function() {
        const plotSettings = getActivePlotEditorSettings_ACU();
        if (!plotSettings) return;
        ensureLoopPromptsArray_ACU(plotSettings);
        plotSettings.loopSettings.quickReplyContent.push('');
        renderLoopPromptsList_ACU();
        // 聚焦到新添加的输入框
        setTimeout(() => {
          const $newTextarea = $popupInstance_ACU.find('.loop-prompt-textarea').last();
          if ($newTextarea.length) {
            $newTextarea.focus();
          }
        }, 100);
      });

      // 删除提示词按钮
      $popupInstance_ACU.on('click', '.loop-prompt-delete-btn', function() {
        const index = parseInt(jQuery_API_ACU(this).data('index'), 10);
        if (isNaN(index)) return;

        const plotSettings = getActivePlotEditorSettings_ACU();
        if (!plotSettings) return;
        ensureLoopPromptsArray_ACU(plotSettings);
        const prompts = plotSettings.loopSettings.quickReplyContent;
        
        if (prompts.length > 0 && index >= 0 && index < prompts.length) {
          prompts.splice(index, 1);
          // 调整索引
          if (plotSettings.loopSettings.currentPromptIndex >= prompts.length) {
            plotSettings.loopSettings.currentPromptIndex = 0;
          }
          renderLoopPromptsList_ACU();
          saveLoopPromptsFromUI_ACU();
        }
      });

      // 提示词内容变化时自动保存（防抖）
      let saveLoopPromptsTimeout = null;
      $popupInstance_ACU.on('input', '.loop-prompt-textarea', function() {
        clearTimeout(saveLoopPromptsTimeout);
        saveLoopPromptsTimeout = setTimeout(() => {
          saveLoopPromptsFromUI_ACU();
        }, 500);
      });

      // 预设管理（全局负责管理，当前聊天仅负责切换使用）
      const $plotPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-select`);
      const $plotImportPresets = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-import-presets`);
      const $plotExportPresets = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-export-presets`);
      const $plotSavePreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-save-preset`);
      const $plotSaveAsNewPreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-save-as-new-preset`);
      const $plotResetDefaults = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-reset-defaults`);
      const $plotDeletePreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-delete-preset`);
      const $plotPresetFileInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-file-input`);
      const $plotChatPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-chat-preset-select`);

      // 第一步：全局预设选择事件
      if ($plotPresetSelect.length) {
        $plotPresetSelect.on('change', function() {
          const selectedName = normalizePlotPresetSelectionValue_ACU(jQuery_API_ACU(this).val());
          const result = applyGlobalPlotPresetSelectionForEditor_ACU(selectedName, {
            source: 'ui_global_select',
            refreshUi: true,
            save: true,
          });

          if (!result) {
            showToastr_ACU('error', '找不到选中的全局预设。');
            loadPlotPresetSelect_ACU();
          }
        });
      }

      // 第二步：当前聊天预设选择事件（这里只负责切换当前聊天使用的预设）
      if ($plotChatPresetSelect.length) {
        $plotChatPresetSelect.on('change', function() {
          const selectedName = normalizePlotPresetSelectionValue_ACU(jQuery_API_ACU(this).val());
          const result = switchCurrentChatPlotPreset_ACU(selectedName, {
            source: 'ui',
            refreshUi: true,
            save: true,
          });

          if (!result) {
            showToastr_ACU('error', '找不到选中的当前聊天预设。');
            loadPlotPresetSelect_ACU();
            return;
          }

          showToastr_ACU(
            'success',
            result.followsGlobal
              ? '当前聊天已改为跟随全局剧情推进预设。'
              : `当前聊天已切换到预设 "${result.presetName}"。`,
          );
        });
      }


      // 导入全局预设
      if ($plotImportPresets.length) {
        $plotImportPresets.on('click', function() {
          $plotPresetFileInput.click();
        });
      }

      // 导出全局预设
      if ($plotExportPresets.length) {
        $plotExportPresets.on('click', function() {
          const selectedName = normalizePlotPresetSelectionValue_ACU($plotPresetSelect.val());
          if (isDefaultPlotPresetSelection_ACU(selectedName)) {
            showToastr_ACU('info', '默认预设不支持直接导出，请先另存为自定义预设。');
            return;
          }

          const presets = settings_ACU.plotSettings.promptPresets || [];
          const selectedPreset = presets.find(p => p.name === selectedName);

          if (!selectedPreset) {
            showToastr_ACU('error', '找不到选中的全局预设。');
            return;
          }

          const exportPreset = stripPlotPresetWorldbookEntrySelectionForExport_ACU(selectedPreset);
          const dataStr = JSON.stringify([exportPreset], null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `plot_preset_${selectedName.replace(/[^a-z0-9]/gi, '_')}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          showToastr_ACU('success', `全局预设 "${selectedName}" 已成功导出。`);
        });
      }

      // 保存全局预设
      if ($plotSavePreset.length) {
        $plotSavePreset.on('click', function() {
          const selectedName = normalizePlotPresetSelectionValue_ACU($plotPresetSelect.val());
          if (isDefaultPlotPresetSelection_ACU(selectedName)) {
            // 如果当前是默认预设，则等同于“另存为新的全局预设”
            savePlotPresetAsNew_ACU();
            return;
          }

          if (!confirm(`确定要用当前设置覆盖全局预设 "${selectedName}" 吗？`)) {
            return;
          }

          const presets = settings_ACU.plotSettings.promptPresets || [];
          const existingIndex = presets.findIndex(p => p.name === selectedName);

          if (existingIndex === -1) {
            showToastr_ACU('error', '找不到要覆盖的全局预设。');
            return;
          }

          const currentSettings = getCurrentPlotSettingsFromUI_ACU();
          if (!currentSettings || typeof currentSettings !== 'object') {
            showToastr_ACU('error', '读取当前剧情推进设置失败。');
            return;
          }

          const savedPreset = normalizePlotPresetExcludeRules_ACU({ name: selectedName, ...currentSettings });
          const currentRuntimePresetName = getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal: true });

          presets[existingIndex] = savedPreset;
          settings_ACU.plotSettings.promptPresets = presets;

          if (normalizePlotPresetSelectionValue_ACU(currentRuntimePresetName) === selectedName) {
            applyPlotPresetToSettings_ACU(settings_ACU.plotSettings, savedPreset);
          }

          setCurrentEditablePlotPresetState_ACU(selectedName, {
            scope: 'global',
            source: 'ui_global_save',
          });
          persistPlotPresetSelectionState_ACU(selectedName, { source: 'ui_global_save', updateGlobal: true, save: false });
          saveSettings_ACU();
          loadPlotPresetSelect_ACU();
          showToastr_ACU('success', `全局预设 "${selectedName}" 已被成功覆盖。`);
        });
      }

      // 另存为新的全局预设
      if ($plotSaveAsNewPreset.length) {
        $plotSaveAsNewPreset.on('click', function() {
          savePlotPresetAsNew_ACU();
        });
      }

      // 删除全局预设
      if ($plotDeletePreset.length) {
        $plotDeletePreset.on('click', function() {
          const selectedName = normalizePlotPresetSelectionValue_ACU($plotPresetSelect.val());
          if (isDefaultPlotPresetSelection_ACU(selectedName)) {
            showToastr_ACU('warning', '默认全局预设不能删除。');
            return;
          }

          if (!confirm(`确定要删除全局预设 "${selectedName}" 吗？`)) {
            return;
          }

          const presets = settings_ACU.plotSettings.promptPresets || [];
          const indexToDelete = presets.findIndex(p => p.name === selectedName);

          if (indexToDelete > -1) {
            presets.splice(indexToDelete, 1);
            settings_ACU.plotSettings.promptPresets = presets;

            const shouldResetGlobalSelection = normalizePlotPresetSelectionValue_ACU(settings_ACU.plotSettings.lastUsedPresetName || '') === selectedName;
            const chatScopeState = getCurrentChatPlotScopeState_ACU();
            const currentBinding = getPlotPresetBindingForChat_ACU();
            if (shouldResetGlobalSelection) {
              settings_ACU.plotSettings.lastUsedPresetName = '';
            }
            if (!chatScopeState && currentBinding && normalizePlotPresetSelectionValue_ACU(currentBinding.presetName || '') === selectedName) {
              clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU);
            }

            saveSettings_ACU();

            // 刷新预设选择器
            loadPlotPresetSelect_ACU();
            showToastr_ACU('success', `全局预设 "${selectedName}" 已被删除。`);
          } else {
            showToastr_ACU('error', '找不到要删除的全局预设。');
          }
        });
      }

      // 恢复全局默认提示词
      if ($plotResetDefaults.length) {
        $plotResetDefaults.on('click', function() {
          if (!confirm('确定要恢复全局默认的剧情推进提示词吗？这将覆盖当前的提示词设置，并重置“标签摘取”。')) {
            return;
          }

          const result = applyGlobalPlotPresetSelectionForEditor_ACU('', {
            source: 'ui_global_reset',
            refreshUi: true,
            save: true,
          });

          if (!result) {
            showToastr_ACU('error', '恢复全局默认预设失败。');
            return;
          }

          showToastr_ACU('success', '全局剧情推进提示词与“标签摘取”已恢复为默认值。');
        });
      }

      // 全局预设文件导入
      if ($plotPresetFileInput.length) {
        $plotPresetFileInput.on('change', function(e) {
          const file = e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = function(e) {
            try {
              const importedPresets = JSON.parse(e.target.result as string);

              if (!Array.isArray(importedPresets)) {
                throw new Error('JSON文件格式不正确，根节点必须是一个数组。');
              }

              let currentPresets = settings_ACU.plotSettings.promptPresets || [];
              let importedCount = 0;
              let overwrittenCount = 0;

              importedPresets.forEach(preset => {
                if (preset && typeof preset.name === 'string' && preset.name.length > 0) {
                  const getLegacyPromptFromThree_ACU = (p, id) => {
                    if (!p) return '';
                    if (Array.isArray(p)) return (p.find(x => x && x.id === id)?.content) || '';
                    if (typeof p === 'object') return p[id] || '';
                    return '';
                  };
                  const looksLikePromptGroupSegments = (arr) => {
                    if (!Array.isArray(arr) || arr.length === 0) return false;
                    const x = arr[0];
                    return x && typeof x === 'object' && 'role' in x && 'content' in x && !('id' in x);
                  };

                  // 兼容导入：新格式(promptGroup) / 某些导出用 prompts 存了段落数组 / 旧格式(三段提示词)
                  let promptGroup = null;
                  if (Array.isArray(preset.promptGroup) && preset.promptGroup.length) {
                    promptGroup = JSON.parse(JSON.stringify(preset.promptGroup));
                  } else if (looksLikePromptGroupSegments(preset.prompts)) {
                    promptGroup = JSON.parse(JSON.stringify(preset.prompts));
                  } else {
                    const legacyMain = preset.mainPrompt || getLegacyPromptFromThree_ACU(preset.prompts, 'mainPrompt') || '';
                    const legacySystem = preset.systemPrompt || getLegacyPromptFromThree_ACU(preset.prompts, 'systemPrompt') || '';
                    promptGroup = buildDefaultPlotPromptGroup_ACU({ mainAContent: legacyMain, mainBContent: legacySystem });
                  }

                  const finalDirective =
                    preset.finalSystemDirective ||
                    preset.finalDirective ||
                    getLegacyPromptFromThree_ACU(preset.prompts, 'finalSystemDirective') ||
                    '';

                  const presetData = normalizePlotPresetExcludeRules_ACU({
                    name: preset.name,
                    promptGroup: promptGroup,
                    plotTasks: Array.isArray(preset.plotTasks) ? JSON.parse(JSON.stringify(preset.plotTasks)) : undefined,
                    finalSystemDirective: finalDirective,
                    rateMain: preset.rateMain ?? 1.0,
                    ratePersonal: preset.ratePersonal ?? 1.0,
                    rateErotic: preset.rateErotic ?? 0,
                    rateCuckold: preset.rateCuckold ?? 1.0,
                    recallCount: preset.recallCount ?? 20,
                    extractTags: preset.extractTags || '',
                    contextExtractRules: normalizeExtractRules_ACU(preset.contextExtractRules, preset.contextExtractTags || ''),
                    contextExcludeRules: normalizeExcludeRules_ACU(preset.contextExcludeRules, preset.contextExcludeTags || ''),
                    minLength: preset.minLength ?? 0,
                    contextTurnCount: preset.contextTurnCount ?? 3,
                    loopSettings: preset.loopSettings || DEFAULT_PLOT_SETTINGS_ACU.loopSettings
                  });

                  const existingIndex = currentPresets.findIndex(p => p.name === preset.name);

                  if (existingIndex !== -1) {
                    currentPresets[existingIndex] = presetData;
                    overwrittenCount++;
                  } else {
                    currentPresets.push(presetData);
                    importedCount++;
                  }
                }
              });

              if (importedCount > 0 || overwrittenCount > 0) {
                settings_ACU.plotSettings.promptPresets = currentPresets;
                saveSettings_ACU();
                loadPlotPresetSelect_ACU();

                let messages = [];
                if (importedCount > 0) messages.push(`成功导入 ${importedCount} 个新预设。`);
                if (overwrittenCount > 0) messages.push(`成功覆盖 ${overwrittenCount} 个同名预设。`);
                showToastr_ACU('success', messages.join(' '));

                // 导入后：自动选择第一个有效全局预设并加载到UI（方便继续修改）
                const firstValid = importedPresets.find(p => p && typeof p.name === 'string' && p.name.length > 0);
                if (firstValid && $plotPresetSelect && $plotPresetSelect.length) {
                  setTimeout(() => {
                    $plotPresetSelect.val(firstValid.name).trigger('change');
                  }, 50);
                }
              } else {
                showToastr_ACU('warning', '未找到可导入的有效预设。');
              }
            } catch (error) {
              logError_ACU('[剧情推进] 导入预设失败:', error);
              showToastr_ACU('error', `导入失败: ${error.message}`);
            } finally {
              // 清空文件输入框
              $plotPresetFileInput.val('');
            }
          };
          reader.readAsText(file);
        });
      }

      // 循环控制按钮
      const $startLoopBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-start-loop-btn`);
      const $stopLoopBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-stop-loop-btn`);

      if ($startLoopBtn.length) {
        $startLoopBtn.on('click', function() {
          const duration = parseInt($popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-loop-total-duration`).val(), 10);
          if (!duration || duration <= 0) {
            showToastr_ACU('warning', '请设置一个大于0的总倒计时 (分钟) 才能启动循环。');
            return;
          }

          startAutoLoop_ACU();
          jQuery_API_ACU(this).hide();
          $stopLoopBtn.css('display', 'inline-flex').show();
          showToastr_ACU('success', '自动化循环已启动。');
        });
      }

      if ($stopLoopBtn.length) {
        $stopLoopBtn.on('click', function() {
          stopAutoLoop_ACU();
          jQuery_API_ACU(this).hide();
          $startLoopBtn.css('display', 'inline-flex').show();
          showToastr_ACU('info', '自动化循环已停止。');
        });
      }

      // 中止按钮绑定将在剧情规划开始时动态绑定

      // 加载剧情推进设置到UI
      loadPlotSettingsToUI_ACU();

      // --- [正文替换] UI事件绑定 ---
      // 正文替换功能开关
      const $optimizationEnabledCheckbox = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-enabled`);
      if ($optimizationEnabledCheckbox.length) {
        $optimizationEnabledCheckbox.on('change', function() {
          settings_ACU.contentOptimizationSettings.enabled = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
        });
      }

      // API预设选择
      const $optimizationApiPreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset`);
      if ($optimizationApiPreset.length) {
        $optimizationApiPreset.on('change', function() {
          settings_ACU.contentOptimizationSettings.apiPreset = jQuery_API_ACU(this).val();
          saveSettings_ACU();
        });
      }

      // 最小优化长度
      const $optimizationMinLength = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-min-length`);
      if ($optimizationMinLength.length) {
        $optimizationMinLength.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val(), 10);
          if (!isNaN(val) && val >= 0) {
            settings_ACU.contentOptimizationSettings.minLength = val;
            saveSettings_ACU();
          }
        });
      }

      // 最大优化项数
      const $optimizationMaxItems = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-max-items`);
      if ($optimizationMaxItems.length) {
        $optimizationMaxItems.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val(), 10);
          if (!isNaN(val) && val >= 1 && val <= 100) {
            settings_ACU.contentOptimizationSettings.maxOptimizations = val;
            saveSettings_ACU();
          }
        });
      }

      // [新增] 循环优化次数
      const $optimizationLoopCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count`);
      if ($optimizationLoopCount.length) {
        $optimizationLoopCount.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val(), 10);
          if (!isNaN(val) && val >= 1 && val <= 10) {
            settings_ACU.contentOptimizationSettings.loopCount = val;
            saveSettings_ACU();
          }
        });
      }

      // [新增] 自动重试次数
      const $optimizationRetryCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count`);
      if ($optimizationRetryCount.length) {
        $optimizationRetryCount.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val(), 10);
          if (!isNaN(val) && val >= 1 && val <= 10) {
            settings_ACU.contentOptimizationSettings.retryCount = val;
            saveSettings_ACU();
          }
        });
      }

      // 无感替换模式
      const $optimizationSeamlessMode = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode`);
      if ($optimizationSeamlessMode.length) {
        $optimizationSeamlessMode.on('change', function() {
          settings_ACU.contentOptimizationSettings.seamlessMode = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
        });
      }

      // 自动应用优化结果
      const $optimizationAutoApply = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply`);
      if ($optimizationAutoApply.length) {
        $optimizationAutoApply.on('change', function() {
          settings_ACU.contentOptimizationSettings.autoApply = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
        });
      }

      // 显示优化对比
      const $optimizationShowDiff = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff`);
      if ($optimizationShowDiff.length) {
        $optimizationShowDiff.on('change', function() {
          settings_ACU.contentOptimizationSettings.showDiff = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
        });
      }

      // 填表与正文替换并行执行
      const $optimizationParallelMode = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode`);
      if ($optimizationParallelMode.length) {
        $optimizationParallelMode.on('change', function() {
          settings_ACU.contentOptimizationSettings.parallelMode = jQuery_API_ACU(this).is(':checked');
          saveSettings_ACU();
        });
      }

      // 正文优化快捷操作按钮
      const $optimizationReoptimizeLatest = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-reoptimize-latest`);
      if ($optimizationReoptimizeLatest.length) {
        $optimizationReoptimizeLatest.off('click').on('click', async function() {
          const lastOptimizedMessageIndex = getLastOptimizedMessageIndex_ACU();

          if (lastOptimizedMessageIndex < 0) {
            showToastr_ACU('warning', '当前还没有“已被正文替换过”的 AI 回复可供重新优化');
            return;
          }

          jQuery_API_ACU(this).prop('disabled', true).text('处理中...');
          try {
            await reoptimizeMessage_ACU(lastOptimizedMessageIndex);
          } finally {
            jQuery_API_ACU(this).prop('disabled', false).html('<i class="fa-solid fa-rotate-right"></i> 重新优化最近一次被替换的AI回复');
          }
        });
      }

 
      // ═══ 正文替换标签筛选规则 ═══
      // 标签提取输入框
      const $optimizationExtractTags = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags`);
      if ($optimizationExtractTags.length) {
        $optimizationExtractTags.on('input', function() {
          settings_ACU.contentOptimizationSettings.extractTags = jQuery_API_ACU(this).val();
          saveSettings_ACU();
        });
      }

      // 标签提取规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules`,
          { startPlaceholder: '开始词（例如：<think）', endPlaceholder: '结束词（例如：</think）' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules .acu-exclude-rule-end`, function() {
        settings_ACU.contentOptimizationSettings.extractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules`);
        saveSettings_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        settings_ACU.contentOptimizationSettings.extractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules`);
        saveSettings_ACU();
      });

      // 标签排除规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules`,
          { startPlaceholder: '开始词（例如：<think）', endPlaceholder: '结束词（例如：</think）' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules .acu-exclude-rule-end`, function() {
        settings_ACU.contentOptimizationSettings.excludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules`);
        saveSettings_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        settings_ACU.contentOptimizationSettings.excludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules`);
        saveSettings_ACU();
      });

      // ═══ 正文替换预设管理 ═══
      const $optimizationPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select`);
      const $optimizationImportPresets = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-import-presets`);
      const $optimizationExportPresets = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-export-presets`);
      const $optimizationSavePreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-save-preset`);
      const $optimizationSaveAsNewPreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-save-as-new-preset`);
      const $optimizationDeletePreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-delete-preset`);
      const $optimizationResetDefaults = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-reset-defaults`);
      const $optimizationPresetFileInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-preset-file-input`);

      // 预设选择事件
      if ($optimizationPresetSelect.length) {
        $optimizationPresetSelect.on('change', function() {
          const selectedName = jQuery_API_ACU(this).val();
          if (!selectedName) {
            $optimizationDeletePreset.hide();
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const selectedPreset = presets.find(p => p.name === selectedName);

          if (selectedPreset) {
            // 加载预设到UI
            if (selectedPreset.promptGroup) {
              settings_ACU.contentOptimizationSettings.promptGroup = selectedPreset.promptGroup;
              renderOptimizationPromptSegments_ACU(selectedPreset.promptGroup);
            }
            $optimizationDeletePreset.show();
            saveSettings_ACU();
            showToastr_ACU('success', `已加载预设 "${selectedName}"`);
          }
        });
      }

      // 导入预设
      if ($optimizationImportPresets.length) {
        $optimizationImportPresets.on('click', function() {
          $optimizationPresetFileInput.click();
        });
      }

      // 导出预设
      if ($optimizationExportPresets.length) {
        $optimizationExportPresets.on('click', function() {
          const selectedName = $optimizationPresetSelect.val();
          if (!selectedName) {
            showToastr_ACU('info', '请先选择要导出的预设。');
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const selectedPreset = presets.find(p => p.name === selectedName);

          if (!selectedPreset) {
            showToastr_ACU('error', '找不到选中的预设。');
            return;
          }

          const dataStr = JSON.stringify([selectedPreset], null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `optimization_preset_${selectedName.replace(/[^a-z0-9]/gi, '_')}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          showToastr_ACU('success', `预设 "${selectedName}" 已成功导出。`);
        });
      }

      // 保存预设（覆盖）
      if ($optimizationSavePreset.length) {
        $optimizationSavePreset.on('click', function() {
          const selectedName = $optimizationPresetSelect.val();
          if (!selectedName) {
            // 如果没有选择预设，则等同于"另存为"
            saveOptimizationPresetAsNew_ACU();
            return;
          }

          if (!confirm(`确定要用当前设置覆盖预设 "${selectedName}" 吗？`)) {
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const existingIndex = presets.findIndex(p => p.name === selectedName);

          if (existingIndex === -1) {
            showToastr_ACU('error', '找不到要覆盖的预设。');
            return;
          }

          const currentPromptGroup = getOptimizationPromptGroupFromUI_ACU();
          presets[existingIndex] = { name: selectedName, promptGroup: currentPromptGroup };
          settings_ACU.contentOptimizationSettings.promptPresets = presets;
          saveSettings_ACU();
          showToastr_ACU('success', `预设 "${selectedName}" 已被成功覆盖。`);
        });
      }

      // 另存为新预设
      if ($optimizationSaveAsNewPreset.length) {
        $optimizationSaveAsNewPreset.on('click', function() {
          saveOptimizationPresetAsNew_ACU();
        });
      }

      // 删除预设
      if ($optimizationDeletePreset.length) {
        $optimizationDeletePreset.on('click', function() {
          const selectedName = $optimizationPresetSelect.val();
          if (!selectedName) {
            showToastr_ACU('warning', '没有选择任何预设。');
            return;
          }

          if (!confirm(`确定要删除预设 "${selectedName}" 吗？`)) {
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const indexToDelete = presets.findIndex(p => p.name === selectedName);

          if (indexToDelete > -1) {
            presets.splice(indexToDelete, 1);
            settings_ACU.contentOptimizationSettings.promptPresets = presets;
            saveSettings_ACU();

            // 刷新预设选择器
            loadOptimizationPresetSelect_ACU();
            showToastr_ACU('success', `预设 "${selectedName}" 已被删除。`);
          } else {
            showToastr_ACU('error', '找不到要删除的预设。');
          }
        });
      }

      // 恢复默认提示词
      if ($optimizationResetDefaults.length) {
        $optimizationResetDefaults.on('click', function() {
          if (!confirm('确定要恢复默认的正文替换提示词吗？这将覆盖当前的提示词设置。')) {
            return;
          }
          settings_ACU.contentOptimizationSettings.promptGroup = buildDefaultContentOptimizationPromptGroup_ACU();
          saveSettings_ACU();
          renderOptimizationPromptSegments_ACU(settings_ACU.contentOptimizationSettings.promptGroup);
          showToastr_ACU('success', '正文替换提示词已恢复为默认值');
        });
      }

      // 预设文件导入
      if ($optimizationPresetFileInput.length) {
        $optimizationPresetFileInput.on('change', function(e) {
          const file = e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = function(e) {
            try {
              const importedPresets = JSON.parse(e.target.result as string);

              if (!Array.isArray(importedPresets)) {
                throw new Error('JSON文件格式不正确，根节点必须是一个数组。');
              }

              let currentPresets = settings_ACU.contentOptimizationSettings.promptPresets || [];
              let importedCount = 0;
              let overwrittenCount = 0;

              importedPresets.forEach(preset => {
                if (preset && typeof preset.name === 'string' && preset.name.length > 0) {
                  const presetData = {
                    name: preset.name,
                    promptGroup: preset.promptGroup || buildDefaultContentOptimizationPromptGroup_ACU()
                  };

                  const existingIndex = currentPresets.findIndex(p => p.name === preset.name);

                  if (existingIndex !== -1) {
                    currentPresets[existingIndex] = presetData;
                    overwrittenCount++;
                  } else {
                    currentPresets.push(presetData);
                    importedCount++;
                  }
                }
              });

              if (importedCount > 0 || overwrittenCount > 0) {
                settings_ACU.contentOptimizationSettings.promptPresets = currentPresets;
                saveSettings_ACU();
                loadOptimizationPresetSelect_ACU();

                let messages = [];
                if (importedCount > 0) messages.push(`成功导入 ${importedCount} 个新预设。`);
                if (overwrittenCount > 0) messages.push(`成功覆盖 ${overwrittenCount} 个同名预设。`);
                showToastr_ACU('success', messages.join(' '));

                // 导入后：自动选择第一个有效预设并加载到UI
                const firstValid = importedPresets.find(p => p && typeof p.name === 'string' && p.name.length > 0);
                if (firstValid && $optimizationPresetSelect && $optimizationPresetSelect.length) {
                  setTimeout(() => {
                    $optimizationPresetSelect.val(firstValid.name).trigger('change');
                  }, 50);
                }
              } else {
                showToastr_ACU('warning', '未找到有效的预设数据。');
              }
            } catch (err) {
              showToastr_ACU('error', `导入失败：${err.message}`);
            }
          };
          reader.readAsText(file);
          // 清空文件输入，允许重复导入同一文件
          e.target.value = '';
        });
      }

      // 保存提示词组
      const $optimizationSavePromptGroup = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-save-prompt-group`);
      if ($optimizationSavePromptGroup.length) {
        $optimizationSavePromptGroup.on('click', function() {
          const segments = getOptimizationPromptGroupFromUI_ACU();
          settings_ACU.contentOptimizationSettings.promptGroup = segments;
          saveSettings_ACU();
          showToastr_ACU('success', '正文替换提示词组已保存');
        });
      }

      // 恢复默认提示词组
      const $optimizationResetPromptGroup = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-reset-prompt-group`);
      if ($optimizationResetPromptGroup.length) {
        $optimizationResetPromptGroup.on('click', function() {
          if (!confirm('确定要恢复默认的正文替换提示词吗？这将覆盖当前的提示词设置。')) {
            return;
          }
          settings_ACU.contentOptimizationSettings.promptGroup = buildDefaultContentOptimizationPromptGroup_ACU();
          saveSettings_ACU();
          renderOptimizationPromptSegments_ACU(settings_ACU.contentOptimizationSettings.promptGroup);
          showToastr_ACU('success', '正文替换提示词已恢复为默认值');
        });
      }

      // 添加提示词段落
      $popupInstance_ACU.on('click', `.${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn`, function() {
        const position = jQuery_API_ACU(this).data('position');
        const newSegment = { role: 'USER', content: '', deletable: true };
        let segments = getOptimizationPromptGroupFromUI_ACU();
        if (position === 'top') segments.unshift(newSegment);
        else segments.push(newSegment);
        renderOptimizationPromptSegments_ACU(segments);
      });

      // 删除提示词段落
      $popupInstance_ACU.on('click', '.optimization-prompt-segment-delete-btn', function() {
        const indexToDelete = jQuery_API_ACU(this).data('index');
        let segments = getOptimizationPromptGroupFromUI_ACU();
        segments.splice(indexToDelete, 1);
        renderOptimizationPromptSegments_ACU(segments);
      });

      // 测试按钮
      const $optimizationTestBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-btn`);
      if ($optimizationTestBtn.length) {
        $optimizationTestBtn.on('click', async function() {
          const testInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-input`).val();
          if (!testInput || testInput.trim().length < 10) {
            showToastr_ACU('warning', '请输入至少10个字符的测试文本');
            return;
          }

          jQuery_API_ACU(this).prop('disabled', true).text('优化中...');
          const $resultDiv = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-result`);
          const $outputDiv = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-output`);
          $resultDiv.show();
          $outputDiv.text('正在调用AI进行优化...');

          try {
            const result = await performContentOptimization_ACU(testInput);
            if (result.success) {
              let outputText = `优化完成！共 ${result.optimizations.length} 处改进\n\n`;
              outputText += `摘要：${result.summary || '无'}\n\n`;
              outputText += `=== 优化详情 ===\n\n`;
              result.optimizations.forEach((opt, i) => {
                outputText += `[${i + 1}] 修改方案：${opt.plan || opt.reason || '未说明'}\n`;
                outputText += `原文：${opt.original.substring(0, 100)}${opt.original.length > 100 ? '...' : ''}\n`;
                outputText += `优化：${opt.optimized.substring(0, 100)}${opt.optimized.length > 100 ? '...' : ''}\n\n`;
              });
              outputText += `=== 优化后全文 ===\n\n${result.optimizedContent}`;
              $outputDiv.text(outputText);
            } else {
              $outputDiv.text(`优化失败：${result.error || '未知错误'}`);
            }
          } catch (e) {
            $outputDiv.text(`优化出错：${e.message}`);
          }

          jQuery_API_ACU(this).prop('disabled', false).text('执行优化测试');
        });
      }

      // 加载正文优化设置到UI
      loadOptimizationSettingsToUI_ACU();

      // [新增] 刷新API预设选择器
      refreshApiPresetSelectors_ACU();

      // [剧情推进] 世界书选择 UI 绑定（独立）
      try {
        const cfg = getPlotWorldbookConfig_ACU();
        const $plotWbRadios = $popupInstance_ACU.find(`input[name="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source"]`);
        if ($plotWbRadios.length) {
          $plotWbRadios.filter(`[value="${cfg.source || 'character'}"]`).prop('checked', true);
          $plotWbRadios.off('change.acu_plot_wb').on('change.acu_plot_wb', async function() {
            const v = jQuery_API_ACU(this).val();
            cfg.source = (v === 'manual') ? 'manual' : 'character';
            saveSettings_ACU();
            await updatePlotWorldbookSourceView_ACU();
          });
        }

        // 手动选择：世界书列表点击切换选中
        const $plotWbList = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select`);
        const $plotWbListFilter = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select-filter`);
        const $plotEntryFilter = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-entry-filter`);
        if ($plotWbList.length) {
          $plotWbList.off('click.acu_plot_wb').on('click.acu_plot_wb', '.qrf_worldbook_list_item', async function() {
            const bookName = jQuery_API_ACU(this).data('book-name');
            if (!bookName) return;
            let selection = Array.isArray(cfg.manualSelection) ? cfg.manualSelection : [];
            if (selection.includes(bookName)) selection = selection.filter(x => x !== bookName);
            else selection = [...selection, bookName];
            cfg.manualSelection = selection;
            saveSettings_ACU();
            await updatePlotWorldbookSourceView_ACU();
          });
        }
        if ($plotWbListFilter.length) {
          $plotWbListFilter.off('input.acu_plot_wb').on('input.acu_plot_wb', function() {
            applyWorldbookListFilter_ACU($plotWbList, jQuery_API_ACU(this).val());
          });
        }

        const $plotSelectAll = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select-all`);
        const $plotDeselectAll = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-deselect-all`);
        // 兼容旧id（如果用户未更新UI片段或缓存导致旧节点仍在）
        const $plotSelectNoneLegacy = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select-none`);
        const resolvePlotBookNames_ACU = async () => {
          if ((cfg.source || 'character') === 'manual') return Array.isArray(cfg.manualSelection) ? cfg.manualSelection : [];
          const names = [];
          try {
            const charLorebooks = await TavernHelper_API_ACU.getCharLorebooks({ type: 'all' });
            if (charLorebooks.primary) names.push(charLorebooks.primary);
            if (charLorebooks.additional?.length) names.push(...charLorebooks.additional);
          } catch (e) {}
          return names;
        };
        const isPlotEntryAllowed_ACU = (entry) => {
          if (!entry) return false;
          const comment = entry.comment || entry.name || '';
          // UI 不显示数据库生成条目（含隔离/外部导入前缀），因此“全选/全不选”也只作用于非数据库条目
          let normalizedComment = String(comment).replace(/^ACU-\[[^\]]+\]-/, '');
          normalizedComment = normalizedComment.replace(/^外部导入-(?:[^-]+-)?/, '');
          if (normalizedComment.startsWith('TavernDB-ACU-OutlineTable')) return false; // 仍需屏蔽总结大纲
          const isDbGenerated =
            normalizedComment.startsWith('TavernDB-ACU-') ||
            normalizedComment.startsWith('总结条目') ||
            normalizedComment.startsWith('小总结条目') ||
            normalizedComment.startsWith('重要人物条目');
          if (isDbGenerated) return false;
          if (isEntryBlocked_ACU(entry)) return false;
          // “启用的世界书条目”按钮应只勾选 ST 本身启用的条目（否则勾选了也不会被使用）
          if (!entry.enabled) return false;
          return true;
        };
        const setPlotEntriesSelection_ACU = async (mode) => {
          // mode: 'all' | 'none'
          const bookNames = await resolvePlotBookNames_ACU();
          if (!cfg.enabledEntries) cfg.enabledEntries = {};

          const allBooks = await getWorldBooks_ACU();
          for (const bookName of bookNames) {
            let entries = [];
            const bookData = allBooks.find(b => b.name === bookName);
            if (bookData?.entries?.length) {
              entries = bookData.entries;
            } else {
              try { entries = await TavernHelper_API_ACU.getLorebookEntries(bookName); } catch (e) { entries = []; }
            }

            if (mode === 'none') {
              cfg.enabledEntries[bookName] = [];
            } else {
              cfg.enabledEntries[bookName] = (entries || []).filter(isPlotEntryAllowed_ACU).map(e => e.uid);
            }
          }

          saveSettings_ACU();
          await populatePlotWorldbookEntryList_ACU(); // 立即刷新UI，显示勾选/取消
        };

        if ($plotSelectAll.length) {
          $plotSelectAll.off('click.acu_plot_wb').on('click.acu_plot_wb', async function() {
            await setPlotEntriesSelection_ACU('all');
          });
        }
        if ($plotDeselectAll.length) {
          $plotDeselectAll.off('click.acu_plot_wb').on('click.acu_plot_wb', async function() {
            await setPlotEntriesSelection_ACU('none');
          });
        }
        if ($plotSelectNoneLegacy.length) {
          $plotSelectNoneLegacy.off('click.acu_plot_wb').on('click.acu_plot_wb', async function() {
            await setPlotEntriesSelection_ACU('none');
          });
        }

        const $plotRefreshWorldbooks = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-refresh-worldbooks`);
        if ($plotRefreshWorldbooks.length) {
          $plotRefreshWorldbooks.off('click.acu_plot_wb').on('click.acu_plot_wb', async function() {
            await updatePlotWorldbookSourceView_ACU();
          });
        }

        // 条目勾选
        const $plotEntryList = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-entry-list`);
        if ($plotEntryList.length) {
          $plotEntryList.off('change.acu_plot_wb').on('change.acu_plot_wb', 'input[type="checkbox"]', function() {
            const bookName = jQuery_API_ACU(this).data('book');
            const uid = jQuery_API_ACU(this).data('uid');
            if (!bookName || uid === undefined || uid === null) return;
            if (!cfg.enabledEntries) cfg.enabledEntries = {};
            if (!Array.isArray(cfg.enabledEntries[bookName])) cfg.enabledEntries[bookName] = [];
            const list = cfg.enabledEntries[bookName];
            const checked = jQuery_API_ACU(this).is(':checked');
            if (checked && !list.includes(uid)) list.push(uid);
            if (!checked && list.includes(uid)) cfg.enabledEntries[bookName] = list.filter(x => x !== uid);
            updateLazyWorldbookEntryCheckedState_ACU($plotEntryList, bookName, uid, checked);
            saveSettings_ACU();
          });
          $plotEntryList.off('click.acu_plot_wb_toggle').on('click.acu_plot_wb_toggle', '.qrf_worldbook_entry_toggle', function() {
            const bookName = jQuery_API_ACU(this).closest('.qrf_worldbook_entry_group').data('book-name');
            if (!bookName) return;
            toggleLazyWorldbookEntryGroup_ACU($plotEntryList, bookName);
          });
          $plotEntryList.off('click.acu_plot_wb_more').on('click.acu_plot_wb_more', '.qrf_worldbook_entry_load_more', function() {
            const bookName = jQuery_API_ACU(this).closest('.qrf_worldbook_entry_group').data('book-name');
            if (!bookName) return;
            renderLazyWorldbookEntryItems_ACU($plotEntryList, bookName);
          });
        }
        if ($plotEntryFilter.length) {
          $plotEntryFilter.off('input.acu_plot_wb').on('input.acu_plot_wb', function() {
            applyWorldbookEntryFilter_ACU($plotEntryList, jQuery_API_ACU(this).val());
          });
        }

        await updatePlotWorldbookSourceView_ACU();
      } catch (e) {
        logWarn_ACU('[剧情推进] Plot worldbook UI bind failed:', e);
      }

      showToastr_ACU('success', '数据库更新工具已加载。');
  }