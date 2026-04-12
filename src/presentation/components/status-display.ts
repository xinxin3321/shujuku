// status-display.ts — 对应源文件有跨文件依赖，保留在原位

  // [T172] 可视化编辑器刷新通知（从 service/worldbook/pipeline.ts 提取）
  function notifyVisualizerRefresh_ACU() {
    try { jQuery_API_ACU(document).trigger('acu-visualizer-refresh-data'); } catch(e) {}
  }

  // [T173] 填表状态消息更新
  function updateTableFillStatus_ACU(text) {
    if (!$statusMessageSpan_ACU && $popupInstance_ACU)
        $statusMessageSpan_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-status-message`);
    if ($statusMessageSpan_ACU) $statusMessageSpan_ACU.text(text);
  }

  // [T173] 填表停止按钮绑定
  function bindTableFillStopButton_ACU(localAbortController, onStop) {
    const $stopButton = jQuery_API_ACU('#acu-stop-update-btn');
    if ($stopButton.length) {
        $stopButton.off('click.acu_stop').on('click.acu_stop', function(e) {
            e.stopPropagation();
            e.preventDefault();
            if ($manualUpdateCardButton_ACU) {
                $manualUpdateCardButton_ACU.prop('disabled', false).text('立即手动更新');
            }
            jQuery_API_ACU(this).closest('.toast').remove();
            if (typeof onStop === 'function') onStop();
        });
    }
  }

  // [T173] 重置手动更新按钮状态
  function resetManualUpdateButton_ACU() {
    if ($manualUpdateCardButton_ACU) {
        $manualUpdateCardButton_ACU.prop('disabled', false).text('立即手动更新');
    }
  }

  // [T174] 更新聊天标题显示
  function updateChatTitleDisplay_ACU(chatIdentifier) {
    if (!$popupInstance_ACU) return;
    const $titleElement = $popupInstance_ACU.find('h2#updater-main-title-acu');
    if ($titleElement.length)
        $titleElement.html(`当前聊天：${escapeHtml_ACU(chatIdentifier || '未知')}`);
  }

  // [T175] 检查弹窗是否打开（供 service 层用布尔判断，不暴露 DOM 引用）
  function isPopupOpen_ACU() {
    return !!$popupInstance_ACU;
  }

  // [T177] 读取酒馆发送输入框的值
  function getSendTextareaValue_ACU() {
    try { return jQuery_API_ACU('#send_textarea').val() || ''; } catch(e) { return ''; }
  }

  // [T177] 设置酒馆发送输入框的值并触发 input 事件
  function setSendTextareaValue_ACU(text) {
    try {
      jQuery_API_ACU('#send_textarea').val(text);
      jQuery_API_ACU('#send_textarea').trigger('input');
    } catch(e) {}
  }

  // [T178] 将合并/删除设置同步到 UI
  function syncMergeSettingsToUI_ACU(s) {
    if (!$popupInstance_ACU) return;
    const find = (id) => $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-${id}`);
    const setVal = (id, v) => { const $el = find(id); if ($el.length) $el.val(v); };
    const setChecked = (id, v) => { const $el = find(id); if ($el.length) $el.prop('checked', !!v); };
    setVal('merge-prompt-template', s.mergeSummaryPrompt || DEFAULT_MERGE_SUMMARY_PROMPT_ACU);
    setVal('merge-target-count', s.mergeTargetCount || 1);
    setVal('merge-batch-size', s.mergeBatchSize || 5);
    setVal('merge-start-index', s.mergeStartIndex || 1);
    setVal('merge-end-index', s.mergeEndIndex || '');
    setChecked('auto-merge-enabled', s.autoMergeEnabled);
    setVal('auto-merge-threshold', s.autoMergeThreshold || 20);
    setVal('auto-merge-reserve', s.autoMergeReserve || 0);
    setVal('delete-start-floor', s.deleteStartFloor || 1);
    setVal('delete-end-floor', s.deleteEndFloor || '');
  }

  // [T179] 将全部设置同步到 UI（从 service/settings/settings-service.ts 提取）
  function syncAllSettingsToUI_ACU(s) {
      if (!$popupInstance_ACU) return;
      if ($customApiUrlInput_ACU) $customApiUrlInput_ACU.val(s.apiConfig.url);
      if ($customApiKeyInput_ACU) $customApiKeyInput_ACU.val(s.apiConfig.apiKey);
      if ($maxTokensInput_ACU) $maxTokensInput_ACU.val(s.apiConfig.max_tokens);
      if ($temperatureInput_ACU) $temperatureInput_ACU.val(s.apiConfig.temperature);
      if ($customApiModelInput_ACU) $customApiModelInput_ACU.val(s.apiConfig.model || '');
      if ($customApiModelSelect_ACU) {
          $customApiModelSelect_ACU.empty().append('<option value="">-- 请先加载模型列表 --</option>');
          if (s.apiConfig.model) {
              $customApiModelSelect_ACU.append(`<option value="${escapeHtml_ACU(s.apiConfig.model)}">${escapeHtml_ACU(s.apiConfig.model)}</option>`);
          }
      }
      if (typeof updateApiStatusDisplay_ACU === 'function') updateApiStatusDisplay_ACU();
      if ($charCardPromptSegmentsContainer_ACU) renderPromptSegments_ACU(s.charCardPrompt);
      if ($autoUpdateThresholdInput_ACU) $autoUpdateThresholdInput_ACU.val(s.autoUpdateThreshold);
      if ($autoUpdateFrequencyInput_ACU) $autoUpdateFrequencyInput_ACU.val(s.autoUpdateFrequency);
      if ($autoUpdateTokenThresholdInput_ACU) $autoUpdateTokenThresholdInput_ACU.val(s.autoUpdateTokenThreshold);
      if ($updateBatchSizeInput_ACU) $updateBatchSizeInput_ACU.val(s.updateBatchSize);
      if ($maxConcurrentGroupsInput_ACU) $maxConcurrentGroupsInput_ACU.val(s.maxConcurrentGroups || 1);
      if ($skipUpdateFloorsInput_ACU) $skipUpdateFloorsInput_ACU.val(s.skipUpdateFloors || 0);
      if ($retainRecentLayersInput_ACU) $retainRecentLayersInput_ACU.val(s.retainRecentLayers || '');
      if (typeof renderExcludeRuleRows_ACU === 'function') {
          renderExcludeRuleRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`, normalizeExtractRules_ACU(s.tableContextExtractRules, s.tableContextExtractTags || ''), { startPlaceholder: '开始词（例如：<think）', endPlaceholder: '结束词（例如：</think>）' });
          renderExcludeRuleRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`, normalizeExcludeRules_ACU(s.tableContextExcludeRules, s.tableContextExcludeTags || ''), { startPlaceholder: '开始词（例如：<thinking）', endPlaceholder: '结束词（例如：</thinking>）' });
      }
      const find = (id) => $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-${id}`);
      const setVal = (id, v) => { const $el = find(id); if ($el.length) $el.val(v); };
      const setChecked = (id, v) => { const $el = find(id); if ($el.length) $el.prop('checked', !!v); };
      setVal('import-split-size', s.importSplitSize);
      setChecked('import-prompt-exclude-imported-worldbook-entries', s.importPromptExcludeImportedWorldbookEntries !== false);
      if ($autoUpdateEnabledCheckbox_ACU) $autoUpdateEnabledCheckbox_ACU.prop('checked', s.autoUpdateEnabled);
      if ($standardizedTableFillEnabledCheckbox_ACU) $standardizedTableFillEnabledCheckbox_ACU.prop('checked', s.standardizedTableFillEnabled !== false);
      if ($toastMuteEnabledCheckbox_ACU) $toastMuteEnabledCheckbox_ACU.prop('checked', !!s.toastMuteEnabled);
      if ($promptTemplateEnabledCheckbox_ACU) $promptTemplateEnabledCheckbox_ACU.prop('checked', s.promptTemplateSettings?.enabled !== false);
      if ($tableEditLastPairOnlyCheckbox_ACU) $tableEditLastPairOnlyCheckbox_ACU.prop('checked', s.tableEditLastPairOnly !== false);
      if ($tableMaxRetriesInput_ACU) $tableMaxRetriesInput_ACU.val(s.tableMaxRetries || 3);
      syncMergeSettingsToUI_ACU(s);
      const worldbookConfig = getCurrentWorldbookConfig_ACU();
      $popupInstance_ACU.find(`input[name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source"]`).filter(`[value="${worldbookConfig.source}"]`).prop('checked', true);
      if (typeof updateWorldbookSourceView_ACU === 'function') updateWorldbookSourceView_ACU();
      if (typeof populateInjectionTargetSelector_ACU === 'function') populateInjectionTargetSelector_ACU();
      const $outlineToggle = find('worldbook-outline-entry-enabled');
      if ($outlineToggle.length) {
          let mode = worldbookConfig.zeroTkOccupyMode;
          if (typeof mode === 'undefined' && typeof worldbookConfig.outlineEntryEnabled !== 'undefined') mode = (worldbookConfig.outlineEntryEnabled === false);
          $outlineToggle.prop('checked', mode === true);
      }
      if ($useMainApiCheckbox_ACU) { $useMainApiCheckbox_ACU.prop('checked', s.apiConfig.useMainApi); if (typeof updateCustomApiInputsState_ACU === 'function') updateCustomApiInputsState_ACU(); }
      if ($streamingEnabledCheckbox_ACU) $streamingEnabledCheckbox_ACU.prop('checked', s.streamingEnabled || false);
      if ($manualTableSelector_ACU && typeof renderManualTableSelector_ACU === 'function') renderManualTableSelector_ACU();
      if ($importTableSelector_ACU && typeof renderImportTableSelector_ACU === 'function') renderImportTableSelector_ACU();
      $popupInstance_ACU.find(`input[name="${SCRIPT_ID_PREFIX_ACU}-api-mode"][value="${s.apiMode}"]`).prop('checked', true);
      if (typeof updateApiModeView_ACU === 'function') updateApiModeView_ACU(s.apiMode);
  }
