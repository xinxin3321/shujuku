import { DEFAULT_PLOT_SETTINGS_ACU } from '../../shared/defaults-json.js';
import { activePlotEditorSettings_ACU, buildDefaultPlotPromptGroup_ACU, currentEditablePlotPresetState_ACU, currentPlotTaskEditorId_ACU, ensurePlotPromptGroup_ACU , _set_currentEditablePlotPresetState_ACU, _set_activePlotEditorSettings_ACU, _set_currentPlotTaskEditorId_ACU} from '../../service/plot/plot-state';
import { showToastr_ACU } from '../theme/toast';
import { SillyTavern_API_ACU, jQuery_API_ACU, toastr_API_ACU, currentChatFileIdentifier_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { saveSettingsAndNotify_ACU } from './settings-ui-helpers';
import { buildChatPlotScopeStateFromSettings_ACU, clearCurrentChatPlotScopeState_ACU, getCurrentChatPlotScopeState_ACU, sanitizePlotSettingsSnapshotForChat_ACU, setCurrentChatPlotScopeState_ACU } from '../../service/template/chat-scope';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { cleanChatName_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU, normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU } from '../../shared/utils';
import { triggerAutomaticUpdateIfNeeded_ACU } from '../triggers/settings-ui-sync';
import { cancelContentOptimization_ACU, contentOptimizationAbortRequested_ACU, ensureOptimizationNotCancelled_ACU, getLastOptimizationBase_ACU, optimizationProgressToast_ACU, performContentOptimization_ACU, setLastOptimizationBase_ACU, _set_optimizationProgressToast_ACU, _set_contentOptimizationAbortRequested_ACU } from '../../service/optimization/content-optimization';
import { applyContextTagFilters_ACU } from '../../service/runtime/helpers-remaining';
import { getActivePlotEditorSettings_ACU, getPlotPromptContentByIdFromSettings_ACU, setPlotPromptContentByIdForSettings_ACU, ensureLoopPromptsArray_ACU } from '../../service/plot/plot-logic';

// re-export 从 service/plot/plot-logic —— 消除与 optimization-ui.ts 中的 37 个重复函数体
export {
  ensureLoopPromptsArray_ACU,
  ensureTagRulesCompat_ACU,
  getLegacyPromptFromThree_ACU,
  getLegacyPromptTextsFromPromptGroup_ACU,
  getPlotPromptGroupFromSource_ACU,
  getPlotFinalDirectiveFromSource_ACU,
  normalizePlotTask_ACU,
  normalizePlotTasks_ACU,
  syncLegacyPlotSettingsFromTask_ACU,
  ensurePlotTasksCompat_ACU,
  applyPlotPresetToSettings_ACU,
  normalizePlotPresetSelectionValue_ACU,
  isDefaultPlotPresetSelection_ACU,
  ensurePlotPresetBindingsStore_ACU,
  getPlotPresetBindingForChat_ACU,
  clearPlotPresetBindingForChat_ACU,
  findPlotPresetByName_ACU,
  resolveActivePlotPresetName_ACU,
  getCurrentRuntimePlotPresetName_ACU,
  setCurrentEditablePlotPresetState_ACU,
  syncCurrentEditablePlotPresetState_ACU,
  getActivePlotEditorSettings_ACU,
  setActivePlotEditorSettings_ACU,
  getPlotGlobalRevision_ACU,
  resetPlotSettingsToDefault_ACU,
  replaceCurrentPlotSettingsWithSnapshot_ACU,
  switchCurrentChatPlotPreset_ACU,
  persistPlotPresetSelectionState_ACU,
  applyGlobalPlotPresetSelectionForEditor_ACU,
  normalizePlotPresetExcludeRules_ACU,
  stripPlotPresetWorldbookEntrySelectionForExport_ACU,
  ensurePlotPromptsArray_ACU,
  getPlotPromptContentByIdFromSettings_ACU,
  setPlotPromptContentByIdForSettings_ACU,
  markPlotIntercept_ACU,
  shouldSkipPlotIntercept_ACU,
  getLastOptimizedMessageIndex_ACU,
  DEFAULT_PRESET_OPTION_VALUE_ACU,
} from '../../service/plot/plot-logic';
/**
 * presentation/components/optimization-ui.ts — 正文优化 UI + 剧情推进 UI
 * 从 src/core/02_storage_and_profile.js:631~2772 迁移而来
 */
  // --- [正文优化] 构建默认提示词组 ---
  function showOptimizationOverlay_ACU(message = '正在优化正文...') {
    // 移除已存在的遮罩
    hideOptimizationOverlay_ACU();
    
    const overlayHtml = `
      <div id="acu-optimization-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 16px;
      ">
        <div style="
          width: 50px;
          height: 50px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: #7bb7ff;
          border-radius: 50%;
          animation: acu-spin 1s linear infinite;
        "></div>
        <div style="
          color: rgba(255, 255, 255, 0.9);
          font-size: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">${message}</div>
        <button id="acu-optimization-overlay-cancel" style="
          padding: 10px 18px;
          border: 1px solid rgba(255, 193, 7, 0.7);
          background: transparent;
          color: #ffc107;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">取消优化</button>
      </div>
      <style>
        @keyframes acu-spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    
    jQuery_API_ACU('body').append(overlayHtml);
    jQuery_API_ACU('#acu-optimization-overlay-cancel').off('click.acu_opt_cancel').on('click.acu_opt_cancel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const cancelResult = cancelContentOptimization_ACU('正文优化已取消。');
      if (cancelResult.cancelled) showToastr_ACU('warning', cancelResult.reason);
      hideOptimizationOverlay_ACU();
      hideOptimizationProgressToast_ACU();
    });
  }

  /**
   * 显示正文优化进度提示框（无遮罩模式）
   * @param {string} message - 提示消息
   */
  function showOptimizationProgressToast_ACU(message = '正在进行正文优化...') {
    hideOptimizationProgressToast_ACU();
    const stopButtonHtml = `<button id="acu-opt-stop-btn" style="border: 1px solid #ffc107; color: #ffc107; background: transparent; padding: 5px 10px; border-radius: 4px; cursor: pointer; float: right; margin-left: 15px; font-size: 0.9em; transition: all 0.2s ease;" onmouseover="this.style.backgroundColor='#ffc107'; this.style.color='#1a1d24';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#ffc107';">取消优化</button>`;
    _set_optimizationProgressToast_ACU(showToastr_ACU('info', `<div>${message}${stopButtonHtml}</div>`, {
      timeOut: 0,
      extendedTimeOut: 0,
      tapToDismiss: false,
      onShown: function() {
        jQuery_API_ACU('#acu-opt-stop-btn').off('click.acu_opt_cancel').on('click.acu_opt_cancel', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const cancelResult2 = cancelContentOptimization_ACU('正文优化已取消。');
          if (cancelResult2.cancelled) showToastr_ACU('warning', cancelResult2.reason);
          hideOptimizationOverlay_ACU();
          hideOptimizationProgressToast_ACU();
          jQuery_API_ACU(this).closest('.toast').remove();
        });
      }
    }));
  }

  /**
   * 隐藏正文优化进度提示框
   */
  export function hideOptimizationProgressToast_ACU() {
    if (optimizationProgressToast_ACU && toastr_API_ACU) {
      toastr_API_ACU.clear(optimizationProgressToast_ACU);
    }
    _set_optimizationProgressToast_ACU(null);
  }
  
  /**
   * 隐藏无感替换遮罩
   */
  export function hideOptimizationOverlay_ACU() {
    jQuery_API_ACU('#acu-optimization-overlay').remove();
  }
  
  /**
   * 替换酒馆消息内容
   * @param {number} messageIndex - 消息索引
   * @param {string} newContent - 新内容
   */
  async function replaceChatMessage_ACU(messageIndex, newContent, options: any = {}) {
    try {
      logDebug_ACU(`[正文优化] replaceChatMessage_ACU 开始执行, messageIndex=${messageIndex}, newContent长度=${newContent?.length || 0}`);
      
      const chat = SillyTavern_API_ACU.chat;
      if (!chat || !chat[messageIndex]) {
        logError_ACU('[正文优化] 消息不存在, chat存在=', !!chat, 'messageIndex=', messageIndex);
        throw new Error('消息不存在');
      }
      
      const oldContent = chat[messageIndex].mes;
      logDebug_ACU(`[正文优化] 原内容长度: ${oldContent?.length || 0}, 新内容长度: ${newContent?.length || 0}`);
      
      // [新增] 保存原始内容到 extra 字段，用于"重新优化"功能
      // 只有当 extra._acu_original_content 不存在时才保存（避免覆盖最初的原始内容）
      const extra = chat[messageIndex].extra || {};
      if (!extra._acu_original_content) {
        extra._acu_original_content = options.originalContent ?? oldContent;
        logDebug_ACU(`[正文优化] 保存原始内容到 extra._acu_original_content，长度: ${extra._acu_original_content?.length || 0}`);
      }
      extra._acu_last_optimized_at = Date.now();
      extra._acu_last_optimized_message_id = chat[messageIndex].message_id;
      setLastOptimizationBase_ACU({
        messageIndex,
        messageId: chat[messageIndex].message_id,
        baseContent: extra._acu_original_content || options.originalContent || oldContent || ''
      });
      
      // [修复] 使用酒馆的 setChatMessages API 来更新消息内容，确保渲染及时生效
      // 该 API 会自动处理渲染，无需手动触发 MESSAGE_UPDATED 事件
      // refresh: 'affected' 会触发被影响楼层的重新渲染
      if (typeof SillyTavern_API_ACU.setChatMessages === 'function') {
        logDebug_ACU('[正文优化] 使用 setChatMessages API 更新消息...');
        await SillyTavern_API_ACU.setChatMessages(
          [{ message_id: chat[messageIndex].message_id, mes: newContent, extra: extra }],
          { refresh: 'affected' }
        );
        logDebug_ACU('[正文优化] 消息已通过 setChatMessages API 更新');
      } else {
        // 降级方案：如果 setChatMessages 不可用，使用原有逻辑
        logDebug_ACU('[正文优化] setChatMessages API 不可用，使用降级方案...');
        
        // 修改消息内容
        chat[messageIndex].mes = newContent;
        chat[messageIndex].extra = extra;
        
        // 验证修改是否成功
        const verifyContent = chat[messageIndex].mes;
        logDebug_ACU(`[正文优化] 修改后验证 - 内容长度: ${verifyContent?.length || 0}, 是否匹配: ${verifyContent === newContent}`);
        
        // 保存聊天
        if (typeof SillyTavern_API_ACU.saveChat === 'function') {
          logDebug_ACU('[正文优化] 正在保存聊天...');
          await SillyTavern_API_ACU.saveChat();
          logDebug_ACU('[正文优化] 聊天已保存');
        } else {
          logDebug_ACU('[正文优化] saveChat 函数不存在');
        }
        
        // 触发消息更新事件（使用正确的eventTypes常量）
        if (SillyTavern_API_ACU?.eventSource?.emit && SillyTavern_API_ACU?.eventTypes?.MESSAGE_UPDATED) {
          logDebug_ACU('[正文优化] 触发 MESSAGE_UPDATED 事件 (新API)');
          SillyTavern_API_ACU.eventSource.emit(SillyTavern_API_ACU.eventTypes.MESSAGE_UPDATED, messageIndex);
        } else if (SillyTavern_API_ACU.eventSource) {
          logDebug_ACU('[正文优化] 触发 MESSAGE_UPDATED 事件 (旧API)');
          SillyTavern_API_ACU.eventSource.emit('MESSAGE_UPDATED', messageIndex);
        } else {
          logDebug_ACU('[正文优化] eventSource 不存在，无法触发更新事件');
        }
      }
      
      logDebug_ACU(`[正文优化] 消息 ${messageIndex} 已更新完成`);
      return true;
      
    } catch (error) {
      logError_ACU('[正文优化] 替换消息失败:', error);
      return false;
    }
  }
  
  /**
   * 获取消息的原始内容（用于重新优化）
   * @param {number} messageIndex - 消息索引
   * @returns {string|null} 原始内容，如果不存在则返回 null
   */
  function getOriginalContent_ACU(messageIndex) {
    const cachedBase = getLastOptimizationBase_ACU();
    if (cachedBase?.baseContent) {
      const chat = SillyTavern_API_ACU.chat || [];
      if (cachedBase.messageId != null) {
        const matchedIndex = chat.findIndex(msg => msg && !msg.is_user && msg.message_id === cachedBase.messageId);
        if (matchedIndex === messageIndex) {
          return cachedBase.baseContent;
        }
      }
      if (cachedBase.messageIndex === messageIndex) {
        return cachedBase.baseContent;
      }
    }

    const chat = SillyTavern_API_ACU.chat;
    if (!chat || !chat[messageIndex]) {
      return null;
    }
    const extra = chat[messageIndex].extra || {};
    return extra._acu_original_content || null;
  }

  /**
   * 重新优化消息
   * @param {number} messageIndex - 消息索引
   * @returns {Promise<boolean>} 是否成功
   */
  export async function reoptimizeMessage_ACU(messageIndex) {
    const config = settings_ACU.contentOptimizationSettings || {};
    _set_contentOptimizationAbortRequested_ACU(false);
    
    // 检查是否启用
    if (!config.enabled) {
      showToastr_ACU('warning', '正文优化功能未启用');
      return false;
    }
    
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || !chat[messageIndex]) {
      showToastr_ACU('error', '消息不存在');
      return false;
    }
    
    const message = chat[messageIndex];
    
    // 跳过用户消息
    if (message.is_user) {
      showToastr_ACU('warning', '无法优化用户消息');
      return false;
    }
    
    // 获取原始内容
    const originalContent = getOriginalContent_ACU(messageIndex) || message.mes;
    
    if (!originalContent) {
      showToastr_ACU('error', '无法获取消息内容');
      return false;
    }
    
    logDebug_ACU(`[重新优化] 开始重新优化消息 ${messageIndex}，内容长度: ${originalContent.length}`);
    
    if (config.seamlessMode) {
      showOptimizationOverlay_ACU('正在重新优化正文...');
    } else {
      showOptimizationProgressToast_ACU('正在进行正文优化（重新优化）...');
    }
    
    try {
      ensureOptimizationNotCancelled_ACU();
      const result = await performContentOptimization_ACU(originalContent, {
        currentLoop: 1,
        userMessage: ''
      });
      
      hideOptimizationOverlay_ACU();
      hideOptimizationProgressToast_ACU();
      
      if (contentOptimizationAbortRequested_ACU) {
        return false;
      }

      if (!result.success) {
        showToastr_ACU('error', `重新优化失败: ${result.error || '未知错误'}`);
        return false;
      }
      
      if (!result.optimizations || result.optimizations.length === 0) {
        showToastr_ACU('info', '原文已足够好，无需优化');
        return true;
      }
      
      showReoptimizationDialog_ACU(messageIndex, result, originalContent);
      return true;
      
    } catch (error) {
      hideOptimizationOverlay_ACU();
      hideOptimizationProgressToast_ACU();
      if (contentOptimizationAbortRequested_ACU || error?.message === '用户终止正文优化') {
        logDebug_ACU('[重新优化] 用户已取消正文优化');
        return false;
      }
      logError_ACU('[重新优化] 执行出错:', error);
      showToastr_ACU('error', `重新优化失败: ${error.message}`);
      return false;
    } finally {
      hideOptimizationOverlay_ACU();
      hideOptimizationProgressToast_ACU();
      _set_contentOptimizationAbortRequested_ACU(false);
    }
  }
  
  /**
   * 显示重新优化对话框
   * @param {number} messageIndex - 消息索引
   * @param {object} result - 优化结果
   * @param {string} originalContent - 原始内容
   */
  function showReoptimizationDialog_ACU(messageIndex, result, originalContent) {
    const dialogHtml = `
      <div class="acu-optimization-dialog acu-dialog-classic" style="
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--acu-bg-0, #24221f);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
        border: 1px solid var(--acu-border, #36332e);
        border-radius: 2px;
        padding: 20px;
        max-width: 800px;
        width: calc(100% - 20px);
        max-height: calc(90vh - 20px);
        overflow-y: auto;
        z-index: 100000;
        color: var(--acu-text, #c1b9ad);
        font-family: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
        box-sizing: border-box;
      ">
        <h3 style="margin: 0 0 8px 0; color: var(--acu-accent, #7d4940); font-size: 1.1em; letter-spacing: 1px;">🔄 重新优化结果</h3>
        <p style="margin: 0 0 12px 0; color: var(--acu-text-dim, #8a8075);">${result.summary}</p>
        <div class="optimization-list" style="margin-bottom: 16px; max-height: 400px; overflow-y: auto;">
          ${result.optimizations.map((opt, i) => `
            <div class="optimization-item" style="
              background: rgba(0, 0, 0, 0.2);
              border-radius: 1px;
              padding: 12px;
              margin-bottom: 8px;
              border-left: 2px solid var(--acu-border, #36332e);
            ">
              <div style="color: var(--acu-text-dim, #8a8075); margin-bottom: 8px; text-decoration: line-through; opacity: 0.7;">
                <strong>原文：</strong>${escapeHtml_ACU(opt.original.substring(0, 200))}${opt.original.length > 200 ? '...' : ''}
              </div>
              <div style="color: var(--acu-text, #c1b9ad); font-size: 12px; margin-bottom: 8px; padding: 8px; background: rgba(125, 73, 64, 0.1); border-radius: 1px; border-left: 2px solid var(--acu-accent, #7d4940);">
                <strong>修改方案：</strong>${escapeHtml_ACU(opt.plan || opt.reason || '未说明')}
              </div>
              <div style="color: #6a8a6a;">
                <strong>优化：</strong>${escapeHtml_ACU(opt.optimized.substring(0, 200))}${opt.optimized.length > 200 ? '...' : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding-bottom: 10px;">
          <button id="acu-opt-cancel" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-border, #36332e);
            background: transparent;
            color: var(--acu-text-dim, #8a8075);
            border-radius: 1px;
            cursor: pointer;
            min-width: 80px;
            flex-shrink: 0;
            font-family: inherit;
          ">取消</button>
          <button id="acu-opt-reoptimize" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-accent, #7d4940);
            background: transparent;
            color: var(--acu-accent, #7d4940);
            border-radius: 1px;
            cursor: pointer;
            min-width: 100px;
            flex-shrink: 0;
            font-family: inherit;
          ">🔄 再次优化</button>
          <button id="acu-opt-apply" style="
            padding: 8px 16px;
            border: none;
            background: var(--acu-accent, #7d4940);
            color: var(--acu-bg-0, #24221f);
            border-radius: 1px;
            cursor: pointer;
            font-weight: 600;
            min-width: 100px;
            flex-shrink: 0;
            font-family: inherit;
          ">应用优化</button>
        </div>
      </div>
      <div id="acu-opt-backdrop" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 99999;
      "></div>
    `;
    
    jQuery_API_ACU('body').append(dialogHtml);
    
    // 绑定取消事件
    jQuery_API_ACU('#acu-opt-cancel, #acu-opt-backdrop').on('click', function() {
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
    });
    
    // 绑定再次优化事件
    jQuery_API_ACU('#acu-opt-reoptimize').on('click', async function() {
      jQuery_API_ACU(this).prop('disabled', true).text('优化中...');
      
      // 关闭当前对话框
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      
      // 重新优化（使用原始内容）
      await reoptimizeMessage_ACU(messageIndex);
    });
    
    // 绑定应用事件
    jQuery_API_ACU('#acu-opt-apply').on('click', async function() {
      jQuery_API_ACU(this).prop('disabled', true).text('应用中...');
      
      const success = await replaceChatMessage_ACU(messageIndex, result.optimizedContent, { originalContent: getOriginalContent_ACU(messageIndex) || originalContent });
      
      if (success) {
        jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
        showToastr_ACU('success', '优化已应用');
      } else {
        jQuery_API_ACU(this).prop('disabled', false).text('应用优化');
        showToastr_ACU('error', '应用失败');
      }
    });
  }
  
  /**
   * 执行正文优化流程（在GENERATION_ENDED后调用）
   * @param {number} messageIndex - AI消息索引
   * @returns {Promise<boolean>} 是否成功
   */
  export async function executeContentOptimization_ACU(messageIndex) {
    const config = settings_ACU.contentOptimizationSettings || {};
    _set_contentOptimizationAbortRequested_ACU(false);
    
    // 检查是否启用
    if (!config.enabled) {
      return false;
    }
    
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || !chat[messageIndex]) {
      return false;
    }
    
    const message = chat[messageIndex];
    
    // 跳过用户消息
    if (message.is_user) {
      return false;
    }
    
    let content = message.mes || '';
    setLastOptimizationBase_ACU({
      messageIndex,
      messageId: message.message_id,
      baseContent: content
    });
    
    // [新增] 获取用户消息（用于$8占位符）
    let userMessage = '';
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (chat[i] && chat[i].is_user) {
        userMessage = chat[i].mes || '';
        break;
      }
    }
    
    const extractTags = (config.extractTags || '').trim();
    const extractRules = config.extractRules || [];
    const excludeTags = (config.excludeTags || '').trim();
    const excludeRules = config.excludeRules || [];
    
    let processedContent = applyContextTagFilters_ACU(content, {
      extractTags,
      extractRules,
      excludeTags,
      excludeRules
    });
    
    const minLength = config.minLength || 100;
    if (processedContent.length < minLength) {
      logDebug_ACU(`[正文优化] 处理后正文长度 ${processedContent.length} 小于最小阈值 ${minLength}，跳过优化`);
      return false;
    }
    
    const loopCount = config.loopCount || 1;
    logDebug_ACU(`[正文优化] 开始优化消息 ${messageIndex}，原始长度 ${content.length}，处理后长度 ${processedContent.length}，循环次数: ${loopCount}`);
    
    if (config.seamlessMode) {
      showOptimizationOverlay_ACU(loopCount > 1 ? `正在优化正文 (1/${loopCount})...` : '正在优化正文...');
    } else {
      showOptimizationProgressToast_ACU(loopCount > 1 ? `正在进行正文优化 (1/${loopCount})...` : '正在进行正文优化...');
    }
    
    try {
      ensureOptimizationNotCancelled_ACU();
      if (config.autoApply || config.seamlessMode) {
        let currentContent = content;
        let totalOptimizations = [];
        let finalOptimizedContent = content;
        
        for (let loop = 1; loop <= loopCount; loop++) {
          ensureOptimizationNotCancelled_ACU();
          logDebug_ACU(`[正文优化] 执行第 ${loop}/${loopCount} 轮优化`);
          
          if (config.seamlessMode && loopCount > 1) {
            showOptimizationOverlay_ACU(`正在优化正文 (${loop}/${loopCount})...`);
          } else if (!config.seamlessMode) {
            showOptimizationProgressToast_ACU(`正在进行正文优化 (${loop}/${loopCount})...`);
          }
          
          const result = await performContentOptimization_ACU(currentContent, {
            currentLoop: loop,
            userMessage: userMessage
          });
          ensureOptimizationNotCancelled_ACU();
          
          if (!result.success) {
            logDebug_ACU(`[正文优化] 第 ${loop} 轮优化失败:`, result.error);
            if (loop === 1) {
              if (config.seamlessMode) {
                hideOptimizationOverlay_ACU();
              } else {
                hideOptimizationProgressToast_ACU();
              }
              return false;
            }
            break;
          }
          
          if (!result.optimizations || result.optimizations.length === 0) {
            logDebug_ACU(`[正文优化] 第 ${loop} 轮无需优化，原文已足够好`);
            if (loop === 1) {
              if (config.seamlessMode) {
                hideOptimizationOverlay_ACU();
              } else {
                hideOptimizationProgressToast_ACU();
              }
              return true;
            }
            break;
          }
          
          totalOptimizations = totalOptimizations.concat(result.optimizations);
          finalOptimizedContent = result.optimizedContent;
          currentContent = result.optimizedContent;
          
          logDebug_ACU(`[正文优化] 第 ${loop} 轮完成，本轮 ${result.optimizations.length} 个优化项，累计 ${totalOptimizations.length} 个`);
        }
        
        if (totalOptimizations.length === 0) {
          logDebug_ACU('[正文优化] 所有轮次均无需优化');
          if (config.seamlessMode) {
            hideOptimizationOverlay_ACU();
          } else {
            hideOptimizationProgressToast_ACU();
          }
          return true;
        }
        
        await replaceChatMessage_ACU(messageIndex, finalOptimizedContent);
        
        if (config.seamlessMode) {
          hideOptimizationOverlay_ACU();
        } else {
          hideOptimizationProgressToast_ACU();
        }
        
        if (config.showDiff && !config.seamlessMode) {
          showOptimizationDiff_ACU(messageIndex, {
            optimizations: totalOptimizations,
            summary: `共 ${loopCount} 轮优化，累计 ${totalOptimizations.length} 处改进`,
            optimizedContent: finalOptimizedContent
          });
        } else {
          showToastr_ACU('success', `正文优化完成，共 ${loopCount} 轮优化，累计 ${totalOptimizations.length} 处改进`);
        }
        
        return true;
      } else {
        hideOptimizationProgressToast_ACU();
        return await executeContentOptimizationWithConfirm_ACU(messageIndex, content, userMessage, loopCount);
      }
      
    } catch (error) {
      if (contentOptimizationAbortRequested_ACU || error?.message === '用户终止正文优化') {
        logDebug_ACU('[正文优化] 用户已取消正文优化');
        return false;
      }
      logError_ACU('[正文优化] 执行出错:', error);
      if (config.seamlessMode) {
        hideOptimizationOverlay_ACU();
      } else {
        hideOptimizationProgressToast_ACU();
      }
      return false;
    } finally {
      hideOptimizationOverlay_ACU();
      hideOptimizationProgressToast_ACU();
      _set_contentOptimizationAbortRequested_ACU(false);
    }
  }
  
  /**
   * 执行正文优化（手动确认模式，逐轮确认）
   * @param {number} messageIndex - 消息索引
   * @param {string} content - 原始内容
   * @param {string} userMessage - 用户消息
   * @param {number} totalLoops - 总循环次数
   * @param {number} currentLoop - 当前循环次数（内部使用）
   * @param {string} currentContent - 当前内容（内部使用）
   * @param {Array} totalOptimizations - 累计优化项（内部使用）
   * @returns {Promise<boolean>} 是否成功
   */
  async function executeContentOptimizationWithConfirm_ACU(messageIndex, content, userMessage, totalLoops, currentLoop = 1, currentContent = null, totalOptimizations = []) {
    // 使用传入的当前内容，或者原始内容
    let workingContent = currentContent !== null ? currentContent : content;
    
    logDebug_ACU(`[正文优化-手动确认] 执行第 ${currentLoop}/${totalLoops} 轮优化`);
    
    // 执行优化
    const result = await performContentOptimization_ACU(workingContent, {
      currentLoop: currentLoop,
      userMessage: userMessage
    });
    
    if (!result.success) {
      logDebug_ACU(`[正文优化-手动确认] 第 ${currentLoop} 轮优化失败:`, result.error);
      // 如果是第一轮就失败，显示错误
      if (currentLoop === 1) {
        showToastr_ACU('error', `正文优化失败: ${result.error}`);
        return false;
      }
      // 如果是后续轮次失败，使用之前的结果触发填表
      await triggerAutomaticUpdateIfNeeded_ACU();
      return true;
    }
    
    // 检查是否有实际优化
    if (!result.optimizations || result.optimizations.length === 0) {
      logDebug_ACU(`[正文优化-手动确认] 第 ${currentLoop} 轮无需优化，原文已足够好`);
      // 如果没有优化项，检查是否还有下一轮
      if (currentLoop < totalLoops) {
        // 继续下一轮（使用当前内容）
        return await executeContentOptimizationWithConfirm_ACU(messageIndex, content, userMessage, totalLoops, currentLoop + 1, workingContent, totalOptimizations);
      } else {
        // 所有轮次完成，触发填表
        if (totalOptimizations.length > 0) {
          showToastr_ACU('success', `正文优化完成，共 ${totalLoops} 轮优化，累计 ${totalOptimizations.length} 处改进`);
        } else {
          showToastr_ACU('info', '正文无需优化');
        }
        await triggerAutomaticUpdateIfNeeded_ACU();
        return true;
      }
    }
    
    // 累积优化项
    const newTotalOptimizations = totalOptimizations.concat(result.optimizations);
    
    // 显示对比对话框
    return new Promise((resolve) => {
      showOptimizationDiffDialogForLoop_ACU(messageIndex, {
        optimizations: result.optimizations,
        summary: `第 ${currentLoop}/${totalLoops} 轮优化，本轮 ${result.optimizations.length} 处改进`,
        optimizedContent: result.optimizedContent,
        currentLoop: currentLoop,
        totalLoops: totalLoops,
        totalOptimizations: newTotalOptimizations
      }, async (action) => {
        if (action === 'apply') {
          // 用户确认应用
          if (currentLoop < totalLoops) {
            // 还有下一轮，继续优化
            const nextResult = await executeContentOptimizationWithConfirm_ACU(
              messageIndex,
              content,
              userMessage,
              totalLoops,
              currentLoop + 1,
              result.optimizedContent,
              newTotalOptimizations
            );
            resolve(nextResult);
          } else {
            // 所有轮次完成，应用最终结果并触发填表
            await replaceChatMessage_ACU(messageIndex, result.optimizedContent);
            showToastr_ACU('success', `正文优化完成，共 ${totalLoops} 轮优化，累计 ${newTotalOptimizations.length} 处改进`);
            await triggerAutomaticUpdateIfNeeded_ACU();
            resolve(true);
          }
        } else if (action === 'skip') {
          // 用户跳过本轮，但继续下一轮
          if (currentLoop < totalLoops) {
            const nextResult = await executeContentOptimizationWithConfirm_ACU(
              messageIndex,
              content,
              userMessage,
              totalLoops,
              currentLoop + 1,
              workingContent,  // 使用未优化的内容
              totalOptimizations  // 不累积本轮优化项
            );
            resolve(nextResult);
          } else {
            // 最后一轮跳过
            if (totalOptimizations.length > 0) {
              // 如果有之前的优化，应用之前的结果
              // 注意：这里需要应用之前累积的优化内容
              await triggerAutomaticUpdateIfNeeded_ACU();
              showToastr_ACU('success', `正文优化完成，共 ${totalLoops} 轮优化，累计 ${totalOptimizations.length} 处改进`);
            } else {
              showToastr_ACU('info', '正文优化已跳过');
            }
            await triggerAutomaticUpdateIfNeeded_ACU();
            resolve(true);
          }
        } else {
          // 用户取消，结束优化流程
          await triggerAutomaticUpdateIfNeeded_ACU();
          resolve(true);
        }
      });
    });
  }
  
  /**
   * 显示优化对比对话框（支持循环优化）
   */
  function showOptimizationDiffDialogForLoop_ACU(messageIndex, result, callback) {
    const isLastLoop = result.currentLoop >= result.totalLoops;
    const applyButtonText = isLastLoop ? '应用并完成' : '应用并继续';
    const originalContent = getOriginalContent_ACU(messageIndex) || result.optimizedContent;
    
    const dialogHtml = `
      <div class="acu-optimization-dialog acu-dialog-classic" style="
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--acu-bg-0, #24221f);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
        border: 1px solid var(--acu-border, #36332e);
        border-radius: 2px;
        padding: 20px;
        max-width: 800px;
        width: calc(100% - 20px);
        max-height: calc(90vh - 20px);
        overflow-y: auto;
        z-index: 100000;
        color: var(--acu-text, #c1b9ad);
        font-family: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
        box-sizing: border-box;
      ">
        <h3 style="margin: 0 0 8px 0; color: var(--acu-accent, #7d4940); font-size: 1.1em; letter-spacing: 1px;">正文替换建议</h3>
        <p style="margin: 0 0 12px 0; color: var(--acu-text-dim, #8a8075);">${result.summary}</p>
        ${result.totalLoops > 1 ? `<p style="margin: 0 0 12px 0; color: var(--acu-text-mute, #6a6055); font-size: 12px;">进度: 第 ${result.currentLoop}/${result.totalLoops} 轮</p>` : ''}
        <div class="optimization-list" style="margin-bottom: 16px; max-height: 400px; overflow-y: auto;">
          ${result.optimizations.map((opt, i) => `
            <div class="optimization-item" style="
              background: rgba(0, 0, 0, 0.2);
              border-radius: 1px;
              padding: 12px;
              margin-bottom: 8px;
              border-left: 2px solid var(--acu-border, #36332e);
            ">
              <div style="color: var(--acu-text-dim, #8a8075); margin-bottom: 8px; text-decoration: line-through; opacity: 0.7;">
                <strong>原文：</strong>${escapeHtml_ACU(opt.original.substring(0, 200))}${opt.original.length > 200 ? '...' : ''}
              </div>
              <div style="color: var(--acu-text, #c1b9ad); font-size: 12px; margin-bottom: 8px; padding: 8px; background: rgba(125, 73, 64, 0.1); border-radius: 1px; border-left: 2px solid var(--acu-accent, #7d4940);">
                <strong>修改方案：</strong>${escapeHtml_ACU(opt.plan || opt.reason || '未说明')}
              </div>
              <div style="color: #6a8a6a;">
                <strong>优化：</strong>${escapeHtml_ACU(opt.optimized.substring(0, 200))}${opt.optimized.length > 200 ? '...' : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding-bottom: 10px;">
          <button id="acu-opt-cancel" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-border, #36332e);
            background: transparent;
            color: var(--acu-text-dim, #8a8075);
            border-radius: 1px;
            cursor: pointer;
            min-width: 80px;
            flex-shrink: 0;
            font-family: inherit;
          ">取消优化</button>
          ${!isLastLoop ? `
          <button id="acu-opt-skip" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-border, #36332e);
            background: transparent;
            color: var(--acu-text-dim, #8a8075);
            border-radius: 1px;
            cursor: pointer;
            min-width: 80px;
            flex-shrink: 0;
            font-family: inherit;
          ">跳过本轮</button>
          ` : ''}
          <button id="acu-opt-reoptimize" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-accent, #7d4940);
            background: transparent;
            color: var(--acu-accent, #7d4940);
            border-radius: 1px;
            cursor: pointer;
            min-width: 100px;
            flex-shrink: 0;
            font-family: inherit;
          ">🔄 重新优化</button>
          <button id="acu-opt-apply" style="
            padding: 8px 16px;
            border: none;
            background: var(--acu-accent, #7d4940);
            color: var(--acu-bg-0, #24221f);
            border-radius: 1px;
            cursor: pointer;
            font-weight: 600;
            min-width: 100px;
            flex-shrink: 0;
            font-family: inherit;
          ">${applyButtonText}</button>
        </div>
      </div>
      <div id="acu-opt-backdrop" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 99999;
      "></div>
    `;
    
    jQuery_API_ACU('body').append(dialogHtml);
    
    // 绑定取消事件
    jQuery_API_ACU('#acu-opt-cancel, #acu-opt-backdrop').on('click', function() {
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      callback('cancel');
    });
    
    // 绑定跳过事件（仅非最后一轮显示）
    jQuery_API_ACU('#acu-opt-skip').on('click', function() {
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      callback('skip');
    });
    
    // 绑定重新优化事件
    jQuery_API_ACU('#acu-opt-reoptimize').on('click', async function() {
      jQuery_API_ACU(this).prop('disabled', true).text('优化中...');
      
      // 关闭当前对话框
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      
      // 获取原始内容并重新优化
      const originalContent = getOriginalContent_ACU(messageIndex) || result.optimizedContent;
      
      logDebug_ACU(`[正文优化] 用户点击重新优化，messageIndex=${messageIndex}`);
      
      // 重新优化
      await reoptimizeMessage_ACU(messageIndex);
      
      // 触发回调，结束当前优化流程
      callback('cancel');
    });
    
    // 绑定应用事件
    jQuery_API_ACU('#acu-opt-apply').on('click', async function() {
      jQuery_API_ACU(this).prop('disabled', true).text('处理中...');
      
      logDebug_ACU(`[正文优化] 用户点击应用，isLastLoop=${isLastLoop}, messageIndex=${messageIndex}`);
      logDebug_ACU(`[正文优化] optimizedContent长度: ${result.optimizedContent?.length || 0}`);
      
      // 如果是最后一轮，先应用优化
      if (isLastLoop) {
        logDebug_ACU(`[正文优化] 准备调用 replaceChatMessage_ACU...`);
        const success = await replaceChatMessage_ACU(messageIndex, result.optimizedContent, { originalContent: getOriginalContent_ACU(messageIndex) || originalContent });
        logDebug_ACU(`[正文优化] replaceChatMessage_ACU 返回: ${success}`);
        if (!success) {
          jQuery_API_ACU(this).prop('disabled', false).text(applyButtonText);
          showToastr_ACU('error', '应用失败');
          return;
        }
      } else {
        logDebug_ACU(`[正文优化] 非最后一轮，跳过应用，直接回调`);
      }
      
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      callback('apply');
    });
  }
  
  /**
   * 显示优化对比对话框
   */
  function showOptimizationDiffDialog_ACU(messageIndex, result) {
    const originalContent = getOriginalContent_ACU(messageIndex) || result.optimizedContent;
    const dialogHtml = `
      <div class="acu-optimization-dialog acu-dialog-classic" style="
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--acu-bg-0, #24221f);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
        border: 1px solid var(--acu-border, #36332e);
        border-radius: 2px;
        padding: 20px;
        max-width: 800px;
        width: calc(100% - 20px);
        max-height: calc(90vh - 20px);
        overflow-y: auto;
        z-index: 100000;
        color: var(--acu-text, #c1b9ad);
        font-family: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
        box-sizing: border-box;
      ">
        <h3 style="margin: 0 0 16px 0; color: var(--acu-accent, #7d4940); font-size: 1.1em; letter-spacing: 1px;">正文替换建议</h3>
        <p style="margin: 0 0 12px 0; color: var(--acu-text-dim, #8a8075);">${result.summary || `共 ${result.optimizations.length} 处替换建议`}</p>
        <div class="optimization-list" style="margin-bottom: 16px;">
          ${result.optimizations.map((opt, i) => `
            <div class="optimization-item" style="
              background: rgba(0, 0, 0, 0.2);
              border-radius: 1px;
              padding: 12px;
              margin-bottom: 8px;
              border-left: 2px solid var(--acu-border, #36332e);
            ">
              <div style="color: var(--acu-text-dim, #8a8075); margin-bottom: 8px; text-decoration: line-through; opacity: 0.7;">
                <strong>原文：</strong>${escapeHtml_ACU(opt.original.substring(0, 200))}${opt.original.length > 200 ? '...' : ''}
              </div>
              <div style="color: var(--acu-text, #c1b9ad); font-size: 12px; margin-bottom: 8px; padding: 8px; background: rgba(125, 73, 64, 0.1); border-radius: 1px; border-left: 2px solid var(--acu-accent, #7d4940);">
                <strong>修改方案：</strong>${escapeHtml_ACU(opt.plan || opt.reason || '未说明')}
              </div>
              <div style="color: #6a8a6a;">
                <strong>优化：</strong>${escapeHtml_ACU(opt.optimized.substring(0, 200))}${opt.optimized.length > 200 ? '...' : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding-bottom: 10px;">
          <button id="acu-opt-cancel" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-border, #36332e);
            background: transparent;
            color: var(--acu-text-dim, #8a8075);
            border-radius: 1px;
            cursor: pointer;
            min-width: 80px;
            flex-shrink: 0;
            font-family: inherit;
          ">取消</button>
          <button id="acu-opt-reoptimize" style="
            padding: 8px 16px;
            border: 1px solid var(--acu-accent, #7d4940);
            background: transparent;
            color: var(--acu-accent, #7d4940);
            border-radius: 1px;
            cursor: pointer;
            min-width: 100px;
            flex-shrink: 0;
            font-family: inherit;
          ">🔄 重新优化</button>
          <button id="acu-opt-apply" style="
            padding: 8px 16px;
            border: none;
            background: var(--acu-accent, #7d4940);
            color: var(--acu-bg-0, #24221f);
            border-radius: 1px;
            cursor: pointer;
            font-weight: 600;
            min-width: 100px;
            flex-shrink: 0;
            font-family: inherit;
          ">应用优化</button>
        </div>
      </div>
      <div id="acu-opt-backdrop" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 99999;
      "></div>
    `;
    
    jQuery_API_ACU('body').append(dialogHtml);
    
    // 绑定事件
    jQuery_API_ACU('#acu-opt-cancel, #acu-opt-backdrop').on('click', function() {
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
    });
    
    // 绑定重新优化事件
    jQuery_API_ACU('#acu-opt-reoptimize').on('click', async function() {
      jQuery_API_ACU(this).prop('disabled', true).text('优化中...');
      
      // 关闭当前对话框
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      
      logDebug_ACU(`[正文优化] 用户点击重新优化，messageIndex=${messageIndex}`);
      
      // 重新优化
      await reoptimizeMessage_ACU(messageIndex);
    });
    
    jQuery_API_ACU('#acu-opt-apply').on('click', async function() {
      jQuery_API_ACU(this).prop('disabled', true).text('应用中...');
      
      const success = await replaceChatMessage_ACU(messageIndex, result.optimizedContent, { originalContent: getOriginalContent_ACU(messageIndex) || originalContent });
      
      if (success) {
        jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
        showToastr_ACU('success', '优化已应用');
        
        // [新增] 手动确认模式下，应用优化后触发填表
        logDebug_ACU('[正文优化] 手动确认模式：应用优化后触发填表...');
        await triggerAutomaticUpdateIfNeeded_ACU();
      } else {
        jQuery_API_ACU(this).prop('disabled', false).text('应用优化');
        showToastr_ACU('error', '应用失败');
      }
    });
    
    // [新增] 取消时也触发填表（使用原文）
    jQuery_API_ACU('#acu-opt-cancel').on('click', async function() {
      jQuery_API_ACU('.acu-optimization-dialog, #acu-opt-backdrop').remove();
      logDebug_ACU('[正文优化] 手动确认模式：用户取消优化，触发填表...');
      await triggerAutomaticUpdateIfNeeded_ACU();
    });
  }
  
  /**
   * 显示优化结果摘要
   */
  function showOptimizationDiff_ACU(messageIndex, result) {
    const message = `正文替换完成，共 ${result.optimizations.length} 处改进`;
    const reoptButtonHtml = `<button id="acu-opt-toast-reoptimize" style="border: 1px solid var(--acu-accent, #7d4940); color: var(--acu-accent, #7d4940); background: transparent; padding: 5px 10px; border-radius: 1px; cursor: pointer; float: right; margin-left: 15px; font-size: 0.85em; font-family: inherit;" onmouseover="this.style.backgroundColor='var(--acu-accent, #7d4940); color: var(--acu-bg-0, #24221f);'" onmouseout="this.style.backgroundColor='transparent'; this.style.color='var(--acu-accent, #7d4940);'">🔄 重新优化</button>`;
    const html = result.summary
      ? `<div>${message}${reoptButtonHtml}<br><small style="opacity:0.7">${result.summary}</small></div>`
      : `<div>${message}${reoptButtonHtml}</div>`;
    const toast = showToastr_ACU('success', html, {
      timeOut: 10000,
      extendedTimeOut: 3000,
      tapToDismiss: false,
      onShown: function() {
        jQuery_API_ACU('#acu-opt-toast-reoptimize').off('click.acu_reopt').on('click.acu_reopt', async function(e) {
          e.preventDefault();
          e.stopPropagation();
          jQuery_API_ACU(this).prop('disabled', true).text('优化中...');
          if (toast && toastr_API_ACU) toastr_API_ACU.clear(toast);
          await reoptimizeMessage_ACU(messageIndex);
        });
      }
    });
  }
  
  /**
   * HTML转义
   */

  // === 以下为 presentation 层独有的 UI 函数（DOM 操作/渲染）===

  function schedulePlotSettingsUiRefresh_ACU(plotSettingsOverride = null) {
    if (!$popupInstance_ACU || !$popupInstance_ACU.length) return;
 
    const refreshTarget = plotSettingsOverride || getActivePlotEditorSettings_ACU();
    const $targetPopup = $popupInstance_ACU;
    const runRefresh = () => {
      if (!$popupInstance_ACU || !$popupInstance_ACU.length) return;
      if (!$targetPopup || !$targetPopup.length) return;
      $targetPopup.triggerHandler('acu_plot_settings_refresh', [refreshTarget]);
    };
 
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(runRefresh));
      return;
    }
 
    setTimeout(runRefresh, 0);
  }

  export function renderExcludeRuleRows_ACU(containerSelector, rules, { startPlaceholder = '开始词', endPlaceholder = '结束词', fallbackRules = [] } = {}) {
    if (!$popupInstance_ACU) return;
    const $container = $popupInstance_ACU.find(containerSelector);
    if (!$container.length) return;

    let normalized = normalizeExcludeRules_ACU(rules, '');
    if (normalized.length === 0 && Array.isArray(fallbackRules) && fallbackRules.length > 0) {
      normalized = normalizeExcludeRules_ACU(fallbackRules, '');
    }
    $container.empty();

    const appendRow = (rule: any = {}) => {
      const rowHtml = `
        <div class="acu-exclude-rule-row" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
          <input type="text" class="text_pole acu-exclude-rule-start" placeholder="${escapeHtml_ACU(startPlaceholder)}" style="flex:1;" value="${escapeHtml_ACU(rule.start || '')}">
          <input type="text" class="text_pole acu-exclude-rule-end" placeholder="${escapeHtml_ACU(endPlaceholder)}" style="flex:1;" value="${escapeHtml_ACU(rule.end || '')}">
          <button type="button" class="button acu-exclude-rule-delete" title="删除规则" style="padding:4px 8px;">删除</button>
        </div>
      `;
      $container.append(rowHtml);
    };

    const rows = normalized.length > 0 ? normalized : [{ start: '', end: '' }];
    rows.forEach(rule => appendRow(rule));
  }

  export function appendExcludeRuleRow_ACU(containerSelector, { startPlaceholder = '开始词', endPlaceholder = '结束词' } = {}) {
    if (!$popupInstance_ACU) return;
    const $container = $popupInstance_ACU.find(containerSelector);
    if (!$container.length) return;
    const rowHtml = `
      <div class="acu-exclude-rule-row" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
        <input type="text" class="text_pole acu-exclude-rule-start" placeholder="${escapeHtml_ACU(startPlaceholder)}" style="flex:1;" value="">
        <input type="text" class="text_pole acu-exclude-rule-end" placeholder="${escapeHtml_ACU(endPlaceholder)}" style="flex:1;" value="">
        <button type="button" class="button acu-exclude-rule-delete" title="删除规则" style="padding:4px 8px;">删除</button>
      </div>
    `;
    $container.append(rowHtml);
  }

  export function readExcludeRulesFromRows_ACU(containerSelector) {
    if (!$popupInstance_ACU) return [];
    const $container = $popupInstance_ACU.find(containerSelector);
    if (!$container.length) return [];
    const collected = [];
    $container.find('.acu-exclude-rule-row').each(function() {
      const start = String(jQuery_API_ACU(this).find('.acu-exclude-rule-start').val() || '').trim();
      const end = String(jQuery_API_ACU(this).find('.acu-exclude-rule-end').val() || '').trim();
      if (start && end) collected.push({ start, end });
    });
    return normalizeExcludeRules_ACU(collected, '');
  }

  function getPlotPromptContentById_ACU(promptId) {
    return getPlotPromptContentByIdFromSettings_ACU(settings_ACU?.plotSettings, promptId);
  }

  function setPlotPromptContentById_ACU(promptId, content) {
    setPlotPromptContentByIdForSettings_ACU(settings_ACU?.plotSettings, promptId, content);
  }

  // --- [剧情推进] 循环提示词列表渲染和管理 ---
  export function renderLoopPromptsList_ACU(plotSettingsOverride = null) {
    const $container = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-prompts-container`);
    if (!$container.length) return;

    const plotSettings = plotSettingsOverride || getActivePlotEditorSettings_ACU();
    if (!plotSettings) return;

    ensureLoopPromptsArray_ACU(plotSettings);
    const prompts = plotSettings.loopSettings.quickReplyContent || [];

    $container.empty();

    if (prompts.length === 0) {
      $container.html('<div style="padding: 20px; text-align: center; color: var(--text_secondary); border: 1px dashed var(--border_color_light); border-radius: 6px;">暂无提示词，点击上方"添加提示词"按钮添加</div>');
      return;
    }

    prompts.forEach((prompt, index) => {
      const $item = jQuery_API_ACU('<div>', {
        class: 'loop-prompt-item',
        style: 'display: flex; gap: 8px; align-items: flex-start; padding: 10px; background: var(--background_light); border: 1px solid var(--border_color_light); border-radius: 6px;'
      });
      
      const $content = jQuery_API_ACU('<div>', {
        style: 'flex: 1; display: flex; flex-direction: column; gap: 6px;'
      });
      
      $content.append(jQuery_API_ACU('<div>', {
        style: 'display: flex; align-items: center; gap: 8px;'
      }).append(jQuery_API_ACU('<span>', {
        style: 'font-size: 0.85em; color: var(--text_secondary); font-weight: 500;',
        text: `提示词 #${index + 1}`
      })));
      
      const $textarea = jQuery_API_ACU('<textarea>', {
        class: 'loop-prompt-textarea text_pole',
        'data-index': index,
        rows: 2,
        placeholder: '输入循环提示词内容...',
        style: 'resize: vertical; width: 100%;',
        text: prompt || ''
      });
      $content.append($textarea);
      
      const $deleteBtn = jQuery_API_ACU('<button>', {
        type: 'button',
        class: 'loop-prompt-delete-btn button',
        'data-index': index,
        style: 'padding: 6px 10px; color: var(--danger); background: transparent; border: 1px solid var(--danger); border-radius: 4px; cursor: pointer; flex-shrink: 0;',
        title: '删除此提示词',
        html: '<i class="fa-solid fa-trash"></i>'
      });
      
      $item.append($content).append($deleteBtn);
      $container.append($item);
    });
  }

  export function saveLoopPromptsFromUI_ACU() {
    const plotSettings = getActivePlotEditorSettings_ACU();
    if (!plotSettings) return;

    ensureLoopPromptsArray_ACU(plotSettings);
    const prompts = [];

    $popupInstance_ACU.find('.loop-prompt-textarea').each(function() {
      const content = jQuery_API_ACU(this).val()?.trim() || '';
      if (content) {
        prompts.push(content);
      }
    });

    plotSettings.loopSettings.quickReplyContent = prompts;
    plotSettings.loopSettings.currentPromptIndex = 0; // 重置索引
    saveSettingsAndNotify_ACU();
  }

  // --- [剧情推进] 临时替换"AI指令预设"(settings_ACU.charCardPrompt)，并在生成结束后恢复 ---
  let plotPromptOverrideActive_ACU = false;
  let plotPromptOverrideBackup_ACU = null;

  // [剧情推进] 去重锁：避免同一次发送被 TavernHelper.generate 钩子 + GENERATION_AFTER_COMMANDS 双重处理导致重复 toast/误报失败
  function buildPlotModifiedCharCardPrompt_ACU(original) {
    const originalArr = Array.isArray(original)
      ? original
      : (typeof original === 'string' ? [{ role: 'USER', content: original }] : []);

    const cloned = JSON.parse(JSON.stringify(originalArr));

    const plotMain = (getPlotPromptContentById_ACU('mainPrompt') || '').trim();
    const plotTask = (getPlotPromptContentById_ACU('systemPrompt') || '').trim();

    if (!plotMain && !plotTask) return cloned;

    const getMainSlot = seg => {
      if (!seg) return '';
      const slot = String(seg.mainSlot || '').toUpperCase();
      if (slot === 'A' || slot === 'B') return slot;
      if (seg.isMain) return 'A'; // 兼容旧字段
      if (seg.isMain2) return 'B'; // 兼容旧字段（若存在）
      return '';
    };

    // 简化逻辑：只替换内容，不插入、不改role、不改结构
    // 1) 定位主提示词A/B：优先 mainSlot，其次旧 isMain/isMain2
    let mainAIdx = cloned.findIndex(p => getMainSlot(p) === 'A');
    let mainBIdx = cloned.findIndex(p => getMainSlot(p) === 'B');

    if (plotMain && mainAIdx !== -1 && cloned[mainAIdx]) {
      cloned[mainAIdx].content = plotMain;
    }
    if (plotTask && mainBIdx !== -1 && cloned[mainBIdx]) {
      cloned[mainBIdx].content = plotTask;
    }

    return cloned;
  }

  function applyPlotPromptOverride_ACU() {
    if (plotPromptOverrideActive_ACU) return;
    if (!settings_ACU?.plotSettings?.enabled) return;
    const plotMain = (getPlotPromptContentById_ACU('mainPrompt') || '').trim();
    const plotTask = (getPlotPromptContentById_ACU('systemPrompt') || '').trim();
    if (!plotMain && !plotTask) return;

    plotPromptOverrideBackup_ACU = settings_ACU.charCardPrompt;
    settings_ACU.charCardPrompt = buildPlotModifiedCharCardPrompt_ACU(plotPromptOverrideBackup_ACU);
    plotPromptOverrideActive_ACU = true;
    logDebug_ACU('[剧情推进] 已临时替换AI指令预设（charCardPrompt）。');
  }

  function restorePlotPromptOverride_ACU() {
    if (!plotPromptOverrideActive_ACU) return;
    settings_ACU.charCardPrompt = plotPromptOverrideBackup_ACU;
    plotPromptOverrideBackup_ACU = null;
    plotPromptOverrideActive_ACU = false;
    logDebug_ACU('[剧情推进] 已恢复AI指令预设（charCardPrompt）。');
  }

