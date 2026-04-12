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
