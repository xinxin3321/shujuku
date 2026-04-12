/**
 * presentation/state/ui-refs.ts — UI jQuery 元素引用
 * 所有 $xxx_ACU jQuery 对象和 $popupInstance_ACU。
 * 仅 presentation 层内部使用。
 */

export let $popupInstance_ACU: any = null;

export let $apiConfigSectionToggle_ACU: any,
  $apiConfigAreaDiv_ACU: any,
  $customApiUrlInput_ACU: any,
  $customApiKeyInput_ACU: any,
  $customApiModelInput_ACU: any,
  $customApiModelSelect_ACU: any,
  $maxTokensInput_ACU: any,
  $temperatureInput_ACU: any,
  $loadModelsButton_ACU: any,
  $saveApiConfigButton_ACU: any,
  $clearApiConfigButton_ACU: any,
  $apiStatusDisplay_ACU: any,
  $charCardPromptToggle_ACU: any,
  $charCardPromptAreaDiv_ACU: any,
  $charCardPromptSegmentsContainer_ACU: any,
  $saveCharCardPromptButton_ACU: any,
  $resetCharCardPromptButton_ACU: any,
  $plotPromptSegmentsContainer_ACU: any,
  $plotTaskListContainer_ACU: any,
  $autoUpdateThresholdInput_ACU: any,
  $saveAutoUpdateThresholdButton_ACU: any,
  $autoUpdateTokenThresholdInput_ACU: any,
  $saveAutoUpdateTokenThresholdButton_ACU: any,
  $autoUpdateFrequencyInput_ACU: any,
  $saveAutoUpdateFrequencyButton_ACU: any,
  $updateBatchSizeInput_ACU: any,
  $saveUpdateBatchSizeButton_ACU: any,
  $maxConcurrentGroupsInput_ACU: any,
  $autoUpdateEnabledCheckbox_ACU: any,
  $standardizedTableFillEnabledCheckbox_ACU: any,
  $toastMuteEnabledCheckbox_ACU: any,
  $promptTemplateEnabledCheckbox_ACU: any,
  $tableEditLastPairOnlyCheckbox_ACU: any,
  $tableMaxRetriesInput_ACU: any,
  $manualUpdateCardButton_ACU: any,
  $statusMessageSpan_ACU: any,
  $cardUpdateStatusDisplay_ACU: any,
  $useMainApiCheckbox_ACU: any,
  $streamingEnabledCheckbox_ACU: any,
  $manualExtraHintCheckbox_ACU: any,
  $skipUpdateFloorsInput_ACU: any,
  $saveSkipUpdateFloorsButton_ACU: any,
  $retainRecentLayersInput_ACU: any,
  $saveRetainRecentLayersButton_ACU: any,
  $manualTableSelector_ACU: any,
  $manualTableSelectAll_ACU: any,
  $manualTableSelectNone_ACU: any,
  $importTableSelector_ACU: any,
  $importTableSelectAll_ACU: any,
  $importTableSelectNone_ACU: any;

export function _set_$popupInstance_ACU(v: any) { $popupInstance_ACU = v; }

// 批量赋值 UI placeholder 变量（popup-bindings 初始化时一次性调用）
export function _assignUIPlaceholders_ACU(map: Record<string, any>) {
  if (map.$apiConfigSectionToggle_ACU !== undefined) $apiConfigSectionToggle_ACU = map.$apiConfigSectionToggle_ACU;
  if (map.$apiConfigAreaDiv_ACU !== undefined) $apiConfigAreaDiv_ACU = map.$apiConfigAreaDiv_ACU;
  if (map.$customApiUrlInput_ACU !== undefined) $customApiUrlInput_ACU = map.$customApiUrlInput_ACU;
  if (map.$customApiKeyInput_ACU !== undefined) $customApiKeyInput_ACU = map.$customApiKeyInput_ACU;
  if (map.$customApiModelInput_ACU !== undefined) $customApiModelInput_ACU = map.$customApiModelInput_ACU;
  if (map.$customApiModelSelect_ACU !== undefined) $customApiModelSelect_ACU = map.$customApiModelSelect_ACU;
  if (map.$maxTokensInput_ACU !== undefined) $maxTokensInput_ACU = map.$maxTokensInput_ACU;
  if (map.$temperatureInput_ACU !== undefined) $temperatureInput_ACU = map.$temperatureInput_ACU;
  if (map.$loadModelsButton_ACU !== undefined) $loadModelsButton_ACU = map.$loadModelsButton_ACU;
  if (map.$saveApiConfigButton_ACU !== undefined) $saveApiConfigButton_ACU = map.$saveApiConfigButton_ACU;
  if (map.$clearApiConfigButton_ACU !== undefined) $clearApiConfigButton_ACU = map.$clearApiConfigButton_ACU;
  if (map.$apiStatusDisplay_ACU !== undefined) $apiStatusDisplay_ACU = map.$apiStatusDisplay_ACU;
  if (map.$charCardPromptToggle_ACU !== undefined) $charCardPromptToggle_ACU = map.$charCardPromptToggle_ACU;
  if (map.$charCardPromptAreaDiv_ACU !== undefined) $charCardPromptAreaDiv_ACU = map.$charCardPromptAreaDiv_ACU;
  if (map.$charCardPromptSegmentsContainer_ACU !== undefined) $charCardPromptSegmentsContainer_ACU = map.$charCardPromptSegmentsContainer_ACU;
  if (map.$saveCharCardPromptButton_ACU !== undefined) $saveCharCardPromptButton_ACU = map.$saveCharCardPromptButton_ACU;
  if (map.$resetCharCardPromptButton_ACU !== undefined) $resetCharCardPromptButton_ACU = map.$resetCharCardPromptButton_ACU;
  if (map.$plotPromptSegmentsContainer_ACU !== undefined) $plotPromptSegmentsContainer_ACU = map.$plotPromptSegmentsContainer_ACU;
  if (map.$plotTaskListContainer_ACU !== undefined) $plotTaskListContainer_ACU = map.$plotTaskListContainer_ACU;
  if (map.$autoUpdateThresholdInput_ACU !== undefined) $autoUpdateThresholdInput_ACU = map.$autoUpdateThresholdInput_ACU;
  if (map.$saveAutoUpdateThresholdButton_ACU !== undefined) $saveAutoUpdateThresholdButton_ACU = map.$saveAutoUpdateThresholdButton_ACU;
  if (map.$autoUpdateTokenThresholdInput_ACU !== undefined) $autoUpdateTokenThresholdInput_ACU = map.$autoUpdateTokenThresholdInput_ACU;
  if (map.$saveAutoUpdateTokenThresholdButton_ACU !== undefined) $saveAutoUpdateTokenThresholdButton_ACU = map.$saveAutoUpdateTokenThresholdButton_ACU;
  if (map.$autoUpdateFrequencyInput_ACU !== undefined) $autoUpdateFrequencyInput_ACU = map.$autoUpdateFrequencyInput_ACU;
  if (map.$saveAutoUpdateFrequencyButton_ACU !== undefined) $saveAutoUpdateFrequencyButton_ACU = map.$saveAutoUpdateFrequencyButton_ACU;
  if (map.$updateBatchSizeInput_ACU !== undefined) $updateBatchSizeInput_ACU = map.$updateBatchSizeInput_ACU;
  if (map.$saveUpdateBatchSizeButton_ACU !== undefined) $saveUpdateBatchSizeButton_ACU = map.$saveUpdateBatchSizeButton_ACU;
  if (map.$maxConcurrentGroupsInput_ACU !== undefined) $maxConcurrentGroupsInput_ACU = map.$maxConcurrentGroupsInput_ACU;
  if (map.$autoUpdateEnabledCheckbox_ACU !== undefined) $autoUpdateEnabledCheckbox_ACU = map.$autoUpdateEnabledCheckbox_ACU;
  if (map.$standardizedTableFillEnabledCheckbox_ACU !== undefined) $standardizedTableFillEnabledCheckbox_ACU = map.$standardizedTableFillEnabledCheckbox_ACU;
  if (map.$toastMuteEnabledCheckbox_ACU !== undefined) $toastMuteEnabledCheckbox_ACU = map.$toastMuteEnabledCheckbox_ACU;
  if (map.$promptTemplateEnabledCheckbox_ACU !== undefined) $promptTemplateEnabledCheckbox_ACU = map.$promptTemplateEnabledCheckbox_ACU;
  if (map.$tableEditLastPairOnlyCheckbox_ACU !== undefined) $tableEditLastPairOnlyCheckbox_ACU = map.$tableEditLastPairOnlyCheckbox_ACU;
  if (map.$tableMaxRetriesInput_ACU !== undefined) $tableMaxRetriesInput_ACU = map.$tableMaxRetriesInput_ACU;
  if (map.$manualUpdateCardButton_ACU !== undefined) $manualUpdateCardButton_ACU = map.$manualUpdateCardButton_ACU;
  if (map.$statusMessageSpan_ACU !== undefined) $statusMessageSpan_ACU = map.$statusMessageSpan_ACU;
  if (map.$cardUpdateStatusDisplay_ACU !== undefined) $cardUpdateStatusDisplay_ACU = map.$cardUpdateStatusDisplay_ACU;
  if (map.$useMainApiCheckbox_ACU !== undefined) $useMainApiCheckbox_ACU = map.$useMainApiCheckbox_ACU;
  if (map.$streamingEnabledCheckbox_ACU !== undefined) $streamingEnabledCheckbox_ACU = map.$streamingEnabledCheckbox_ACU;
  if (map.$manualExtraHintCheckbox_ACU !== undefined) $manualExtraHintCheckbox_ACU = map.$manualExtraHintCheckbox_ACU;
  if (map.$skipUpdateFloorsInput_ACU !== undefined) $skipUpdateFloorsInput_ACU = map.$skipUpdateFloorsInput_ACU;
  if (map.$saveSkipUpdateFloorsButton_ACU !== undefined) $saveSkipUpdateFloorsButton_ACU = map.$saveSkipUpdateFloorsButton_ACU;
  if (map.$retainRecentLayersInput_ACU !== undefined) $retainRecentLayersInput_ACU = map.$retainRecentLayersInput_ACU;
  if (map.$saveRetainRecentLayersButton_ACU !== undefined) $saveRetainRecentLayersButton_ACU = map.$saveRetainRecentLayersButton_ACU;
  if (map.$manualTableSelector_ACU !== undefined) $manualTableSelector_ACU = map.$manualTableSelector_ACU;
  if (map.$manualTableSelectAll_ACU !== undefined) $manualTableSelectAll_ACU = map.$manualTableSelectAll_ACU;
  if (map.$manualTableSelectNone_ACU !== undefined) $manualTableSelectNone_ACU = map.$manualTableSelectNone_ACU;
  if (map.$importTableSelector_ACU !== undefined) $importTableSelector_ACU = map.$importTableSelector_ACU;
  if (map.$importTableSelectAll_ACU !== undefined) $importTableSelectAll_ACU = map.$importTableSelectAll_ACU;
  if (map.$importTableSelectNone_ACU !== undefined) $importTableSelectNone_ACU = map.$importTableSelectNone_ACU;
}
