/**
 * presentation/components/optimization-ui.ts — 正文优化 UI + 剧情推进 UI
 * 从 src/core/02_storage_and_profile.js:631~2772 迁移而来
 */
  // --- [正文优化] 构建默认提示词组 ---
  // [已迁移到 service/optimization/content-optimization.ts] buildDefaultContentOptimizationPromptGroup, getOptimizationPlaceholders, performContentOptimization, getOptimizationApiConfig, parseOptimizationResponse, setLastOptimizationBase, getLastOptimizationBase, cancelContentOptimization, ensureOptimizationNotCancelled
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
      cancelContentOptimization_ACU('正文优化已取消。');
    });
  }

  /**
   * 显示正文优化进度提示框（无遮罩模式）
   * @param {string} message - 提示消息
   */
  function showOptimizationProgressToast_ACU(message = '正在进行正文优化...') {
    hideOptimizationProgressToast_ACU();
    const stopButtonHtml = `<button id="acu-opt-stop-btn" style="border: 1px solid #ffc107; color: #ffc107; background: transparent; padding: 5px 10px; border-radius: 4px; cursor: pointer; float: right; margin-left: 15px; font-size: 0.9em; transition: all 0.2s ease;" onmouseover="this.style.backgroundColor='#ffc107'; this.style.color='#1a1d24';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#ffc107';">取消优化</button>`;
    optimizationProgressToast_ACU = showToastr_ACU('info', `<div>${message}${stopButtonHtml}</div>`, {
      timeOut: 0,
      extendedTimeOut: 0,
      tapToDismiss: false,
      onShown: function() {
        jQuery_API_ACU('#acu-opt-stop-btn').off('click.acu_opt_cancel').on('click.acu_opt_cancel', function(e) {
          e.preventDefault();
          e.stopPropagation();
          cancelContentOptimization_ACU('正文优化已取消。');
          jQuery_API_ACU(this).closest('.toast').remove();
        });
      }
    });
  }

  /**
   * 隐藏正文优化进度提示框
   */
  function hideOptimizationProgressToast_ACU() {
    if (optimizationProgressToast_ACU && toastr_API_ACU) {
      toastr_API_ACU.clear(optimizationProgressToast_ACU);
    }
    optimizationProgressToast_ACU = null;
  }
  
  /**
   * 隐藏无感替换遮罩
   */
  function hideOptimizationOverlay_ACU() {
    jQuery_API_ACU('#acu-optimization-overlay').remove();
  }
  
  /**
   * 替换酒馆消息内容
   * @param {number} messageIndex - 消息索引
   * @param {string} newContent - 新内容
   */
  async function replaceChatMessage_ACU(messageIndex, newContent, options = {}) {
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
   * 获取最近一次被正文优化替换过的 AI 消息索引
   * @returns {number} 消息索引，不存在返回 -1
   */
  function getLastOptimizedMessageIndex_ACU() {
    const chat = SillyTavern_API_ACU.chat || [];
    const cachedBase = getLastOptimizationBase_ACU();

    if (cachedBase?.messageId != null) {
      const runtimeIndex = chat.findIndex(msg => msg && !msg.is_user && msg.message_id === cachedBase.messageId);
      if (runtimeIndex >= 0) {
        return runtimeIndex;
      }
    }

    if (Number.isInteger(cachedBase?.messageIndex) && cachedBase.messageIndex >= 0 && chat[cachedBase.messageIndex] && !chat[cachedBase.messageIndex].is_user) {
      return cachedBase.messageIndex;
    }

    let latestIndex = -1;
    let latestTimestamp = -1;

    for (let i = 0; i < chat.length; i++) {
      const msg = chat[i];
      if (!msg || msg.is_user) continue;
      const extra = msg.extra || {};
      const ts = Number(extra._acu_last_optimized_at || 0);
      if (extra._acu_original_content && ts >= latestTimestamp) {
        latestTimestamp = ts;
        latestIndex = i;
      }
    }

    if (latestIndex >= 0) {
      const latestMessage = chat[latestIndex];
      const latestExtra = latestMessage?.extra || {};
      setLastOptimizationBase_ACU({
        messageIndex: latestIndex,
        messageId: latestMessage?.message_id ?? null,
        baseContent: latestExtra._acu_original_content || latestMessage?.mes || ''
      });
    }

    return latestIndex;
  }

  /**
   * 重新优化消息
   * @param {number} messageIndex - 消息索引
   * @returns {Promise<boolean>} 是否成功
   */
  async function reoptimizeMessage_ACU(messageIndex) {
    const config = settings_ACU.contentOptimizationSettings || {};
    contentOptimizationAbortRequested_ACU = false;
    
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
      contentOptimizationAbortRequested_ACU = false;
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
  async function executeContentOptimization_ACU(messageIndex) {
    const config = settings_ACU.contentOptimizationSettings || {};
    contentOptimizationAbortRequested_ACU = false;
    
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
      contentOptimizationAbortRequested_ACU = false;
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
  // [已迁移到 src/shared/html-helpers.ts] escapeHtml_ACU

  // --- [剧情推进] 循环提示词兼容性处理：将旧字符串格式转换为数组格式 ---
  function ensureLoopPromptsArray_ACU(plotSettings) {
    if (!plotSettings || !plotSettings.loopSettings) return;
    const ls = plotSettings.loopSettings;
    
    // 如果 quickReplyContent 是字符串，转换为数组
    if (typeof ls.quickReplyContent === 'string') {
      const oldContent = ls.quickReplyContent.trim();
      ls.quickReplyContent = oldContent ? [oldContent] : [];
      ls.currentPromptIndex = 0;
      logDebug_ACU('[剧情推进] 已迁移旧版循环提示词格式（字符串 -> 数组）');
    }
    
    // 确保是数组
    if (!Array.isArray(ls.quickReplyContent)) {
      ls.quickReplyContent = [];
    }
    
    // 确保 currentPromptIndex 存在且有效
    if (typeof ls.currentPromptIndex !== 'number' || ls.currentPromptIndex < 0) {
      ls.currentPromptIndex = 0;
    }
    
    // 确保索引不超出范围
    if (ls.quickReplyContent.length > 0 && ls.currentPromptIndex >= ls.quickReplyContent.length) {
      ls.currentPromptIndex = 0;
    }
  }

  // --- [剧情推进/填表] 标签规则兼容：旧字符串字段 -> 新规则数组 ---
  function ensureTagRulesCompat_ACU(targetSettings) {
    if (!targetSettings || typeof targetSettings !== 'object') return;

    targetSettings.tableContextExtractRules = normalizeExtractRules_ACU(
      targetSettings.tableContextExtractRules,
      targetSettings.tableContextExtractTags || '',
    );
    targetSettings.tableContextExcludeRules = normalizeExcludeRules_ACU(
      targetSettings.tableContextExcludeRules,
      targetSettings.tableContextExcludeTags || '',
    );

    const plot = targetSettings.plotSettings;
    if (!plot || typeof plot !== 'object') return;

    plot.contextExtractRules = normalizeExtractRules_ACU(
      plot.contextExtractRules,
      plot.contextExtractTags || '',
    );
    plot.contextExcludeRules = normalizeExcludeRules_ACU(
      plot.contextExcludeRules,
      plot.contextExcludeTags || '',
    );

    // 若当前配置为空，回填默认配置中的规则，确保 UI 可见默认规则
    if ((!Array.isArray(plot.contextExtractRules) || plot.contextExtractRules.length === 0)
      && (plot.contextExtractTags || '').trim() === '') {
      plot.contextExtractRules = normalizeExtractRules_ACU(
        DEFAULT_PLOT_SETTINGS_ACU.contextExtractRules,
        DEFAULT_PLOT_SETTINGS_ACU.contextExtractTags || '',
      );
    }
    if ((!Array.isArray(plot.contextExcludeRules) || plot.contextExcludeRules.length === 0)
      && (plot.contextExcludeTags || '').trim() === '') {
      plot.contextExcludeRules = normalizeExcludeRules_ACU(
        DEFAULT_PLOT_SETTINGS_ACU.contextExcludeRules,
        DEFAULT_PLOT_SETTINGS_ACU.contextExcludeTags || '',
      );
    }

    ensurePlotTasksCompat_ACU(plot);

    if (Array.isArray(plot.promptPresets)) {
      plot.promptPresets = plot.promptPresets.map(preset => normalizePlotPresetExcludeRules_ACU(preset));
    }
  }

  function getLegacyPromptFromThree_ACU(prompts, id) {
    if (!prompts) return '';
    if (Array.isArray(prompts)) return (prompts.find(item => item && item.id === id)?.content) || '';
    if (typeof prompts === 'object') return prompts[id] || '';
    return '';
  }

  function looksLikePromptGroupSegments_ACU(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const first = arr[0];
    return first && typeof first === 'object' && 'role' in first && 'content' in first && !('id' in first);
  }

  function getMainSlotFromPlotSegment_ACU(segment) {
    if (!segment) return '';
    const slot = String(segment.mainSlot || '').toUpperCase();
    if (slot === 'A' || slot === 'B') return slot;
    if (segment.isMain) return 'A';
    if (segment.isMain2) return 'B';
    return '';
  }

  function getLegacyPromptTextsFromPromptGroup_ACU(promptGroup) {
    const segments = Array.isArray(promptGroup) ? promptGroup : [];
    return {
      mainPrompt: (segments.find(segment => getMainSlotFromPlotSegment_ACU(segment) === 'A')?.content) || '',
      systemPrompt: (segments.find(segment => getMainSlotFromPlotSegment_ACU(segment) === 'B')?.content) || '',
    };
  }

  function getPlotPromptGroupFromSource_ACU(source, { fallbackPromptGroup = null } = {}) {
    if (Array.isArray(source?.promptGroup) && source.promptGroup.length > 0) {
      return JSON.parse(JSON.stringify(source.promptGroup));
    }
    if (looksLikePromptGroupSegments_ACU(source?.prompts)) {
      return JSON.parse(JSON.stringify(source.prompts));
    }

    const fallbackTexts = getLegacyPromptTextsFromPromptGroup_ACU(fallbackPromptGroup);
    const legacyMain = source?.mainPrompt || getLegacyPromptFromThree_ACU(source?.prompts, 'mainPrompt') || fallbackTexts.mainPrompt || '';
    const legacySystem = source?.systemPrompt || getLegacyPromptFromThree_ACU(source?.prompts, 'systemPrompt') || fallbackTexts.systemPrompt || '';
    return buildDefaultPlotPromptGroup_ACU({ mainAContent: legacyMain, mainBContent: legacySystem });
  }

  function getPlotFinalDirectiveFromSource_ACU(source) {
    if (!source || typeof source !== 'object') return '';
    return source.finalSystemDirective
      || source.finalDirective
      || getPlotPromptContentByIdFromSettings_ACU(source, 'finalSystemDirective')
      || getLegacyPromptFromThree_ACU(source.prompts, 'finalSystemDirective')
      || '';
  }

  // [已迁移到 src/shared/utils.ts] normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU

  function normalizePlotTask_ACU(task, { index = 0, fallbackTask = null } = {}) {
    const cloned = task && typeof task === 'object' ? JSON.parse(JSON.stringify(task)) : {};
    const fallback = fallbackTask && typeof fallbackTask === 'object' ? fallbackTask : null;
    const defaultId = `plotTask${index + 1}`;
    const rawId = String(cloned.id || cloned.name || fallback?.id || defaultId).trim();
    const taskId = rawId.replace(/[^\w-]+/g, '_') || defaultId;
    const taskName = String(cloned.name || fallback?.name || `剧情任务${index + 1}`).trim() || `剧情任务${index + 1}`;
    const promptGroup = getPlotPromptGroupFromSource_ACU(cloned, { fallbackPromptGroup: fallback?.promptGroup || null });

    return {
      id: taskId,
      name: taskName,
      enabled: cloned.enabled !== false,
      promptGroup,
      extractTags: typeof cloned.extractTags === 'string' ? cloned.extractTags : (fallback?.extractTags || ''),
      finalDirectiveTemplate: typeof cloned.finalDirectiveTemplate === 'string' ? cloned.finalDirectiveTemplate : (fallback?.finalDirectiveTemplate || ''),
      minLength: normalizeNonNegativeInteger_ACU(cloned.minLength, fallback?.minLength ?? 0),
      maxRetries: normalizePositiveInteger_ACU(
        cloned.maxRetries ?? cloned.loopSettings?.maxRetries,
        fallback?.maxRetries ?? DEFAULT_PLOT_SETTINGS_ACU.loopSettings?.maxRetries ?? 3,
      ),
      mergeStrategy: typeof cloned.mergeStrategy === 'string' && cloned.mergeStrategy.trim()
        ? cloned.mergeStrategy.trim()
        : (fallback?.mergeStrategy || 'append'),
      stage: normalizePositiveInteger_ACU(cloned.stage, fallback?.stage ?? 1),
      order: normalizeNonNegativeInteger_ACU(cloned.order, fallback?.order ?? index),
    };
  }

  function buildLegacyWrappedPlotTask_ACU(source, { taskId = 'defaultPlotTask', taskName = '默认任务', order = 0 } = {}) {
    return normalizePlotTask_ACU({
      id: taskId,
      name: taskName,
      enabled: true,
      promptGroup: getPlotPromptGroupFromSource_ACU(source),
      extractTags: typeof source?.extractTags === 'string' ? source.extractTags : '',
      minLength: source?.minLength,
      maxRetries: source?.loopSettings?.maxRetries,
      mergeStrategy: 'append',
      stage: 1,
      order,
    }, { index: order });
  }

  function normalizePlotTasks_ACU(source, { fallbackTaskId = 'defaultPlotTask', fallbackTaskName = '默认任务' } = {}) {
    const baseSource = source && typeof source === 'object' ? source : {};
    const fallbackTask = buildLegacyWrappedPlotTask_ACU(baseSource, {
      taskId: fallbackTaskId,
      taskName: fallbackTaskName,
      order: 0,
    });
    const rawTasks = Array.isArray(baseSource.plotTasks) && baseSource.plotTasks.length > 0
      ? baseSource.plotTasks
      : [fallbackTask];

    return rawTasks
      .map((task, index) => normalizePlotTask_ACU(task, {
        index,
        fallbackTask: { ...fallbackTask, order: index },
      }))
      .sort((a, b) => a.order - b.order);
  }

  function syncLegacyPlotSettingsFromTask_ACU(plotSettings, task) {
    if (!plotSettings || !task) return;
    ensurePlotPromptsArray_ACU(plotSettings);

    const normalizedPromptGroup = getPlotPromptGroupFromSource_ACU(task);
    plotSettings.promptGroup = JSON.parse(JSON.stringify(normalizedPromptGroup));
    plotSettings.extractTags = typeof task.extractTags === 'string' ? task.extractTags : '';
    plotSettings.minLength = normalizeNonNegativeInteger_ACU(task.minLength, 0);

    const legacyPromptTexts = getLegacyPromptTextsFromPromptGroup_ACU(normalizedPromptGroup);
    setPlotPromptContentByIdForSettings_ACU(plotSettings, 'mainPrompt', legacyPromptTexts.mainPrompt || '');
    setPlotPromptContentByIdForSettings_ACU(plotSettings, 'systemPrompt', legacyPromptTexts.systemPrompt || '');
  }

  function syncPrimaryPlotTaskFromLegacySettings_ACU(plotSettings) {
    if (!plotSettings || typeof plotSettings !== 'object') return;
    ensurePlotPromptGroup_ACU(plotSettings);
    ensurePlotPromptsArray_ACU(plotSettings);

    const legacyPromptTexts = getLegacyPromptTextsFromPromptGroup_ACU(plotSettings.promptGroup || []);
    setPlotPromptContentByIdForSettings_ACU(plotSettings, 'mainPrompt', legacyPromptTexts.mainPrompt || '');
    setPlotPromptContentByIdForSettings_ACU(plotSettings, 'systemPrompt', legacyPromptTexts.systemPrompt || '');

    const normalizedTasks = normalizePlotTasks_ACU(plotSettings);
    const primaryTaskIndex = normalizedTasks.findIndex(task => task && task.enabled !== false);
    const targetIndex = primaryTaskIndex >= 0 ? primaryTaskIndex : 0;
    const currentTask = normalizedTasks[targetIndex] || buildLegacyWrappedPlotTask_ACU(plotSettings, { order: targetIndex });

    normalizedTasks[targetIndex] = normalizePlotTask_ACU({
      ...currentTask,
      promptGroup: JSON.parse(JSON.stringify(plotSettings.promptGroup || [])),
      extractTags: plotSettings.extractTags,
      minLength: plotSettings.minLength,
      maxRetries: plotSettings.loopSettings?.maxRetries,
      order: currentTask.order ?? targetIndex,
    }, {
      index: targetIndex,
      fallbackTask: currentTask,
    });

    plotSettings.plotTasks = normalizedTasks;
  }

  function ensurePlotTasksCompat_ACU(plotSettings, { persist = false, syncLegacy = true } = {}) {
    if (!plotSettings || typeof plotSettings !== 'object') return;
    const normalizedTasks = normalizePlotTasks_ACU(plotSettings);
    plotSettings.plotTasks = normalizedTasks;

    if (syncLegacy && normalizedTasks.length > 0) {
      const primaryTask = normalizedTasks.find(task => task && task.enabled !== false) || normalizedTasks[0];
      syncLegacyPlotSettingsFromTask_ACU(plotSettings, primaryTask);
    }

    if (persist) {
      try { saveSettings_ACU(); } catch (e) {}
    }
  }

  function applyPlotPresetToSettings_ACU(plotSettings, preset) {
    if (!plotSettings || !preset) {
      return { normalizedPreset: null, promptGroup: [], finalDirective: '' };
    }

    const normalizedPreset = normalizePlotPresetExcludeRules_ACU(preset);
    const finalDirective = getPlotFinalDirectiveFromSource_ACU(normalizedPreset);

    ensurePlotPromptsArray_ACU(plotSettings);
    ensureLoopPromptsArray_ACU(plotSettings);

    plotSettings.plotTasks = normalizePlotTasks_ACU(normalizedPreset);
    plotSettings.promptGroup = JSON.parse(JSON.stringify(getPlotPromptGroupFromSource_ACU(normalizedPreset)));
    plotSettings.finalSystemDirective = finalDirective || '';
    setPlotPromptContentByIdForSettings_ACU(plotSettings, 'finalSystemDirective', finalDirective || '');
    plotSettings.rateMain = normalizedPreset.rateMain ?? 1.0;
    plotSettings.ratePersonal = normalizedPreset.ratePersonal ?? 1.0;
    plotSettings.rateErotic = normalizedPreset.rateErotic ?? 0;
    plotSettings.rateCuckold = normalizedPreset.rateCuckold ?? 1.0;
    plotSettings.recallCount = normalizedPreset.recallCount ?? 20;
    plotSettings.extractTags = normalizedPreset.extractTags || '';
    plotSettings.contextExtractRules = normalizeExtractRules_ACU(normalizedPreset.contextExtractRules, normalizedPreset.contextExtractTags || '');
    plotSettings.contextExcludeRules = normalizeExcludeRules_ACU(normalizedPreset.contextExcludeRules, normalizedPreset.contextExcludeTags || '');
    plotSettings.minLength = normalizedPreset.minLength ?? 0;
    plotSettings.contextTurnCount = normalizedPreset.contextTurnCount ?? 3;
    if (normalizedPreset.loopSettings) {
      plotSettings.loopSettings = { ...plotSettings.loopSettings, ...normalizedPreset.loopSettings };
    }

    ensureLoopPromptsArray_ACU(plotSettings);
    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });
    plotSettings.finalSystemDirective = getPlotPromptContentByIdFromSettings_ACU(plotSettings, 'finalSystemDirective') || plotSettings.finalSystemDirective || '';

    return {
      normalizedPreset,
      promptGroup: JSON.parse(JSON.stringify(plotSettings.promptGroup || [])),
      finalDirective: getPlotPromptContentByIdFromSettings_ACU(plotSettings, 'finalSystemDirective') || '',
    };
  }

  const DEFAULT_PRESET_OPTION_VALUE_ACU = '__ACU_DEFAULT_PRESET__';

  function normalizePlotPresetSelectionValue_ACU(presetName) {
    const normalizedName = String(presetName ?? '').trim();
    return normalizedName === DEFAULT_PRESET_OPTION_VALUE_ACU ? '' : normalizedName;
  }

  function isDefaultPlotPresetSelection_ACU(presetName) {
    return normalizePlotPresetSelectionValue_ACU(presetName) === '';
  }

  function ensurePlotPresetBindingsStore_ACU() {
    if (!settings_ACU || typeof settings_ACU !== 'object') return {};
    if (!settings_ACU.plotPresetBindings || typeof settings_ACU.plotPresetBindings !== 'object' || Array.isArray(settings_ACU.plotPresetBindings)) {
      settings_ACU.plotPresetBindings = {};
    }
    return settings_ACU.plotPresetBindings;
  }

  function normalizePlotPresetBindingChatId_ACU(chatId = currentChatFileIdentifier_ACU) {
    const normalizedChatId = cleanChatName_ACU(String(chatId ?? '').trim());
    return (normalizedChatId && normalizedChatId !== 'unknown_chat_source') ? normalizedChatId : '';
  }

  function hasPlotPresetBindingForChat_ACU(chatId = currentChatFileIdentifier_ACU) {
    const normalizedChatId = normalizePlotPresetBindingChatId_ACU(chatId);
    if (!normalizedChatId) return false;
    return Object.prototype.hasOwnProperty.call(ensurePlotPresetBindingsStore_ACU(), normalizedChatId);
  }

  function getPlotPresetBindingForChat_ACU(chatId = currentChatFileIdentifier_ACU) {
    const normalizedChatId = normalizePlotPresetBindingChatId_ACU(chatId);
    if (!normalizedChatId) return null;

    const bindingStore = ensurePlotPresetBindingsStore_ACU();
    if (!Object.prototype.hasOwnProperty.call(bindingStore, normalizedChatId)) return null;

    const rawBinding = bindingStore[normalizedChatId] || {};
    const normalizedSource = ['inherit', 'ui', 'api'].includes(rawBinding.source) ? rawBinding.source : 'inherit';
    const normalizedBinding = {
      presetName: normalizePlotPresetSelectionValue_ACU(rawBinding.presetName),
      source: normalizedSource,
      isExplicit: rawBinding.isExplicit === true,
      updatedAt: Number.isFinite(rawBinding.updatedAt) ? rawBinding.updatedAt : 0,
    };

    bindingStore[normalizedChatId] = normalizedBinding;
    return normalizedBinding;
  }

  function setPlotPresetBindingForChat_ACU(chatId, presetName, { source = 'inherit', isExplicit = false } = {}) {
    const normalizedChatId = normalizePlotPresetBindingChatId_ACU(chatId);
    if (!normalizedChatId) return null;

    const normalizedSource = ['inherit', 'ui', 'api'].includes(source) ? source : 'inherit';
    const binding = {
      presetName: normalizePlotPresetSelectionValue_ACU(presetName),
      source: normalizedSource,
      isExplicit: isExplicit === true,
      updatedAt: Date.now(),
    };

    ensurePlotPresetBindingsStore_ACU()[normalizedChatId] = binding;
    return binding;
  }

  function clearPlotPresetBindingForChat_ACU(chatId = currentChatFileIdentifier_ACU) {
    const normalizedChatId = normalizePlotPresetBindingChatId_ACU(chatId);
    if (!normalizedChatId) return false;

    const bindingStore = ensurePlotPresetBindingsStore_ACU();
    if (!Object.prototype.hasOwnProperty.call(bindingStore, normalizedChatId)) return false;

    delete bindingStore[normalizedChatId];
    return true;
  }

  function getCurrentChatScopedPlotPresetName_ACU({ fallbackToGlobal = true } = {}) {
    const chatScopeState = getCurrentChatPlotScopeState_ACU();
    if (chatScopeState) return normalizePlotPresetSelectionValue_ACU(chatScopeState.presetName || '');

    const binding = getPlotPresetBindingForChat_ACU();
    if (binding) return binding.presetName || '';
    if (!fallbackToGlobal) return '';
    return normalizePlotPresetSelectionValue_ACU(settings_ACU?.plotSettings?.lastUsedPresetName || '');
  }

  function findPlotPresetByName_ACU(presetName) {
    const normalizedPresetName = normalizePlotPresetSelectionValue_ACU(presetName);
    if (!normalizedPresetName) return null;

    const presets = settings_ACU?.plotSettings?.promptPresets || [];
    const targetPresetRaw = presets.find(p => p.name === normalizedPresetName);
    return targetPresetRaw ? normalizePlotPresetExcludeRules_ACU(targetPresetRaw) : null;
  }

  function resolveActivePlotPresetName_ACU({ fallbackToGlobal = true } = {}) {
    const chatScopeState = getCurrentChatPlotScopeState_ACU();
    if (chatScopeState) {
      return normalizePlotPresetSelectionValue_ACU(chatScopeState.presetName || '');
    }

    const binding = getPlotPresetBindingForChat_ACU();
    if (binding) {
      if (isDefaultPlotPresetSelection_ACU(binding.presetName)) {
        return '';
      }
      const boundPreset = findPlotPresetByName_ACU(binding.presetName);
      if (boundPreset) {
        return boundPreset.name;
      }
    }

    if (!fallbackToGlobal) {
      return '';
    }

    const globalPresetName = normalizePlotPresetSelectionValue_ACU(settings_ACU?.plotSettings?.lastUsedPresetName || '');
    if (isDefaultPlotPresetSelection_ACU(globalPresetName)) {
      return '';
    }

    const globalPreset = findPlotPresetByName_ACU(globalPresetName);
    return globalPreset ? globalPreset.name : '';
  }

  function normalizePlotEditorScope_ACU(scope = 'resolved') {
    if (scope === 'chat') return 'chat';
    if (scope === 'global') return 'global';
    return 'resolved';
  }

  function setCurrentEditablePlotPresetState_ACU(presetName, { scope = 'resolved', source = '' } = {}) {
    currentEditablePlotPresetState_ACU = {
      initialized: true,
      presetName: normalizePlotPresetSelectionValue_ACU(presetName),
      scope: normalizePlotEditorScope_ACU(scope),
      source: String(source || ''),
    };
    return currentEditablePlotPresetState_ACU;
  }

  function getCurrentEditablePlotPresetName_ACU({ fallbackToResolved = true } = {}) {
    if (currentEditablePlotPresetState_ACU?.initialized) {
      return normalizePlotPresetSelectionValue_ACU(currentEditablePlotPresetState_ACU.presetName || '');
    }
    if (!fallbackToResolved) {
      return '';
    }
    return resolveActivePlotPresetName_ACU({ fallbackToGlobal: true });
  }

  function getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal = true } = {}) {
    return normalizePlotPresetSelectionValue_ACU(resolveActivePlotPresetName_ACU({ fallbackToGlobal }));
  }

  function syncCurrentEditablePlotPresetState_ACU({ source = 'runtime_sync' } = {}) {
    const chatScopeState = getCurrentChatPlotScopeState_ACU();
    const binding = getPlotPresetBindingForChat_ACU();
    const resolvedPresetName = resolveActivePlotPresetName_ACU({ fallbackToGlobal: true });
    const scope = (chatScopeState || binding) ? 'chat' : 'global';
    return setCurrentEditablePlotPresetState_ACU(resolvedPresetName, { scope, source });
  }

  function getActivePlotEditorSettings_ACU({ fallbackToRuntime = true } = {}) {
    const activeSettings = activePlotEditorSettings_ACU || (fallbackToRuntime ? settings_ACU?.plotSettings : null);
    return activeSettings && typeof activeSettings === 'object' ? activeSettings : null;
  }

  function setActivePlotEditorSettings_ACU(plotSettings) {
    if (!plotSettings || typeof plotSettings !== 'object') {
      activePlotEditorSettings_ACU = null;
      return null;
    }

    activePlotEditorSettings_ACU = plotSettings;
    ensurePlotPromptsArray_ACU(activePlotEditorSettings_ACU);
    ensureLoopPromptsArray_ACU(activePlotEditorSettings_ACU);
    ensurePlotTasksCompat_ACU(activePlotEditorSettings_ACU, { syncLegacy: true });
    activePlotEditorSettings_ACU.finalSystemDirective = getPlotFinalDirectiveFromSource_ACU(activePlotEditorSettings_ACU);
    setPlotPromptContentByIdForSettings_ACU(
      activePlotEditorSettings_ACU,
      'finalSystemDirective',
      activePlotEditorSettings_ACU.finalSystemDirective || '',
    );
    return activePlotEditorSettings_ACU;
  }

  function getPlotGlobalRevision_ACU() {
    const rawRevision = settings_ACU?.plotSettings?.globalRevision;
    return Number.isFinite(rawRevision) ? Math.max(0, Math.trunc(rawRevision)) : 0;
  }

  function cloneDefaultPlotSettingsForPreset_ACU() {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_PLOT_SETTINGS_ACU));
    ensurePlotPromptsArray_ACU(defaults);
    ensureLoopPromptsArray_ACU(defaults);
    ensurePlotTasksCompat_ACU(defaults, { syncLegacy: true });
    return defaults;
  }

  function buildPlotSettingsPreviewFromPreset_ACU(presetName) {
    const normalizedPresetName = normalizePlotPresetSelectionValue_ACU(presetName);
    const previewSettings = cloneDefaultPlotSettingsForPreset_ACU();

    if (isDefaultPlotPresetSelection_ACU(normalizedPresetName)) {
      resetPlotSettingsToDefault_ACU(previewSettings);
    } else {
      const targetPreset = findPlotPresetByName_ACU(normalizedPresetName);
      if (!targetPreset) return null;
      applyPlotPresetToSettings_ACU(previewSettings, targetPreset);
    }

    previewSettings.lastUsedPresetName = normalizedPresetName;
    ensurePlotPromptsArray_ACU(previewSettings);
    ensureLoopPromptsArray_ACU(previewSettings);
    ensurePlotTasksCompat_ACU(previewSettings, { syncLegacy: true });
    previewSettings.finalSystemDirective = getPlotFinalDirectiveFromSource_ACU(previewSettings);
    setPlotPromptContentByIdForSettings_ACU(previewSettings, 'finalSystemDirective', previewSettings.finalSystemDirective || '');
    return previewSettings;
  }

  function resetPlotSettingsToDefault_ACU(plotSettings) {
    if (!plotSettings || typeof plotSettings !== 'object') return null;

    const preservedPromptPresets = Array.isArray(plotSettings.promptPresets)
      ? JSON.parse(JSON.stringify(plotSettings.promptPresets))
      : [];
    const preservedLastUsedPresetName = normalizePlotPresetSelectionValue_ACU(plotSettings.lastUsedPresetName || '');
    const preservedGlobalRevision = Number.isFinite(plotSettings.globalRevision)
      ? Math.max(0, Math.trunc(plotSettings.globalRevision))
      : 0;
    const defaults = cloneDefaultPlotSettingsForPreset_ACU();

    Object.keys(plotSettings).forEach(key => {
      delete plotSettings[key];
    });

    Object.assign(plotSettings, defaults);
    plotSettings.promptPresets = preservedPromptPresets;
    plotSettings.lastUsedPresetName = preservedLastUsedPresetName;
    plotSettings.globalRevision = preservedGlobalRevision;

    ensurePlotPromptsArray_ACU(plotSettings);
    ensureLoopPromptsArray_ACU(plotSettings);
    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });
    return plotSettings;
  }

  function replaceCurrentPlotSettingsWithSnapshot_ACU(plotSettings, snapshot) {
    if (!plotSettings || typeof plotSettings !== 'object') return null;
    const normalizedSnapshot = sanitizePlotSettingsSnapshotForChat_ACU(snapshot);
    if (!normalizedSnapshot) return null;

    const preservedPromptPresets = Array.isArray(plotSettings.promptPresets)
      ? JSON.parse(JSON.stringify(plotSettings.promptPresets))
      : [];
    const preservedLastUsedPresetName = normalizePlotPresetSelectionValue_ACU(plotSettings.lastUsedPresetName || '');
    const preservedGlobalRevision = Number.isFinite(plotSettings.globalRevision)
      ? Math.max(0, Math.trunc(plotSettings.globalRevision))
      : 0;
    const defaults = cloneDefaultPlotSettingsForPreset_ACU();

    Object.keys(plotSettings).forEach(key => {
      delete plotSettings[key];
    });

    Object.assign(plotSettings, defaults, normalizedSnapshot);
    plotSettings.promptPresets = preservedPromptPresets;
    plotSettings.lastUsedPresetName = preservedLastUsedPresetName;
    plotSettings.globalRevision = preservedGlobalRevision;

    ensurePlotPromptsArray_ACU(plotSettings);
    ensureLoopPromptsArray_ACU(plotSettings);
    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });
    plotSettings.finalSystemDirective = getPlotFinalDirectiveFromSource_ACU(plotSettings);
    setPlotPromptContentByIdForSettings_ACU(plotSettings, 'finalSystemDirective', plotSettings.finalSystemDirective || '');
    return plotSettings;
  }

  function queueSaveCurrentChatPlotScope_ACU(source = 'ui_plot_scope') {
    if (typeof SillyTavern_API_ACU?.saveChat !== 'function') return;
    Promise.resolve()
      .then(() => SillyTavern_API_ACU.saveChat())
      .catch(error => logWarn_ACU(`[剧情推进] 保存聊天级预设快照失败(${source}):`, error));
  }

  function switchCurrentChatPlotPreset_ACU(presetName, { source = 'ui', refreshUi = false, save = true } = {}) {
    if (!settings_ACU?.plotSettings) return false;

    const normalizedPresetName = normalizePlotPresetSelectionValue_ACU(presetName);
    const hadLegacyChatScopeSnapshot = !!getCurrentChatPlotScopeState_ACU();
    if (hadLegacyChatScopeSnapshot) {
      clearCurrentChatPlotScopeState_ACU();
    }

    const bindingSource = String(source || '').startsWith('api') ? 'api' : 'ui';
    let result = null;

    if (isDefaultPlotPresetSelection_ACU(normalizedPresetName)) {
      clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU);

      const inheritedGlobalPresetName = normalizePlotPresetSelectionValue_ACU(settings_ACU.plotSettings.lastUsedPresetName || '');
      const inheritedGlobalPreset = findPlotPresetByName_ACU(inheritedGlobalPresetName);
      if (inheritedGlobalPreset) {
        applyPlotPresetToSettings_ACU(settings_ACU.plotSettings, inheritedGlobalPreset);
      } else {
        resetPlotSettingsToDefault_ACU(settings_ACU.plotSettings);
      }

      currentPlotTaskEditorId_ACU = '';
      setCurrentEditablePlotPresetState_ACU(inheritedGlobalPresetName, {
        scope: 'chat',
        source,
      });
      result = {
        presetName: '',
        isDefault: true,
        followsGlobal: true,
        preset: inheritedGlobalPreset || null,
        activePresetName: inheritedGlobalPresetName,
      };
    } else {
      const targetPreset = findPlotPresetByName_ACU(normalizedPresetName);
      if (!targetPreset) {
        return false;
      }

      applyPlotPresetToSettings_ACU(settings_ACU.plotSettings, targetPreset);
      setPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU, targetPreset.name, {
        source: bindingSource,
        isExplicit: true,
      });
      currentPlotTaskEditorId_ACU = '';
      setCurrentEditablePlotPresetState_ACU(targetPreset.name, {
        scope: 'chat',
        source,
      });
      result = {
        presetName: targetPreset.name,
        isDefault: false,
        followsGlobal: false,
        preset: targetPreset,
        activePresetName: targetPreset.name,
      };
    }

    if (save) {
      saveSettings_ACU();
      if (hadLegacyChatScopeSnapshot) {
        queueSaveCurrentChatPlotScope_ACU(`${bindingSource}_clear_legacy_plot_scope`);
      }
    }

    if ($popupInstance_ACU && refreshUi) {
      schedulePlotSettingsUiRefresh_ACU(settings_ACU.plotSettings);
    }

    return result;
  }

  function persistPlotPresetSelectionState_ACU(presetName, { source = 'ui', updateGlobal = false, save = true, persistChatScope = !updateGlobal } = {}) {
    const normalizedPresetName = normalizePlotPresetSelectionValue_ACU(presetName);
    let shouldSaveChat = false;

    if (updateGlobal && settings_ACU?.plotSettings) {
      settings_ACU.plotSettings.lastUsedPresetName = normalizedPresetName;
    } else if (persistChatScope && settings_ACU?.plotSettings) {
      const plotScopeState = buildChatPlotScopeStateFromSettings_ACU(settings_ACU.plotSettings, {
        presetName: normalizedPresetName,
        source,
        originGlobalName: normalizePlotPresetSelectionValue_ACU(settings_ACU.plotSettings.lastUsedPresetName || ''),
        originGlobalRevision: getPlotGlobalRevision_ACU(),
        updatedAt: Date.now(),
      });
      if (plotScopeState) {
        setCurrentChatPlotScopeState_ACU(plotScopeState, { reason: `plot_scope_${source}` });
        shouldSaveChat = true;
      }
      setPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU, normalizedPresetName, {
        source,
        isExplicit: source !== 'inherit',
      });
    } else {
      setPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU, normalizedPresetName, {
        source,
        isExplicit: source !== 'inherit',
      });
    }

    if (save) {
      saveSettings_ACU();
      if (shouldSaveChat && typeof SillyTavern_API_ACU?.saveChat === 'function') {
        Promise.resolve()
          .then(() => SillyTavern_API_ACU.saveChat())
          .catch(error => logWarn_ACU('[剧情推进] 保存聊天级预设快照失败:', error));
      }
    }

    return normalizedPresetName;
  }

  function applyGlobalPlotPresetSelectionForEditor_ACU(presetName, { source = 'ui', refreshUi = false, save = true } = {}) {
    if (!settings_ACU?.plotSettings) return false;

    const normalizedPresetName = normalizePlotPresetSelectionValue_ACU(presetName);
    const previewSettings = buildPlotSettingsPreviewFromPreset_ACU(normalizedPresetName);
    if (!previewSettings) {
      return false;
    }

    currentPlotTaskEditorId_ACU = '';
    setCurrentEditablePlotPresetState_ACU(normalizedPresetName, {
      scope: 'global',
      source,
    });

    persistPlotPresetSelectionState_ACU(normalizedPresetName, {
      source,
      updateGlobal: true,
      save,
      persistChatScope: false,
    });
 
    if ($popupInstance_ACU && refreshUi) {
      schedulePlotSettingsUiRefresh_ACU(previewSettings);
    }
 
    return {
      presetName: normalizedPresetName,
      isDefault: isDefaultPlotPresetSelection_ACU(normalizedPresetName),
      previewSettings,
    };
  }

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
 
  function normalizePlotPresetExcludeRules_ACU(preset) {
    if (!preset || typeof preset !== 'object') return preset;
    const cloned = JSON.parse(JSON.stringify(preset));
    cloned.contextExtractRules = normalizeExtractRules_ACU(cloned.contextExtractRules, cloned.contextExtractTags || '');
    cloned.contextExcludeRules = normalizeExcludeRules_ACU(cloned.contextExcludeRules, cloned.contextExcludeTags || '');
    cloned.plotTasks = normalizePlotTasks_ACU(cloned);
    cloned.finalSystemDirective = getPlotFinalDirectiveFromSource_ACU(cloned);
    ensurePlotTasksCompat_ACU(cloned, { syncLegacy: true });
    setPlotPromptContentByIdForSettings_ACU(cloned, 'finalSystemDirective', cloned.finalSystemDirective || '');
    // 新格式保存：不再继续写入旧字段
    delete cloned.contextExtractTags;
    delete cloned.contextExcludeTags;
    return cloned;
  }

  function stripPlotPresetWorldbookEntrySelectionForExport_ACU(preset) {
    const normalizedPreset = normalizePlotPresetExcludeRules_ACU(preset);
    if (!normalizedPreset || typeof normalizedPreset !== 'object') return normalizedPreset;
    const exportPreset = JSON.parse(JSON.stringify(normalizedPreset));
    if (exportPreset.plotWorldbookConfig && typeof exportPreset.plotWorldbookConfig === 'object') {
      delete exportPreset.plotWorldbookConfig.enabledEntries;
    }
    return exportPreset;
  }

  function renderExcludeRuleRows_ACU(containerSelector, rules, { startPlaceholder = '开始词', endPlaceholder = '结束词', fallbackRules = [] } = {}) {
    if (!$popupInstance_ACU) return;
    const $container = $popupInstance_ACU.find(containerSelector);
    if (!$container.length) return;

    let normalized = normalizeExcludeRules_ACU(rules, '');
    if (normalized.length === 0 && Array.isArray(fallbackRules) && fallbackRules.length > 0) {
      normalized = normalizeExcludeRules_ACU(fallbackRules, '');
    }
    $container.empty();

    const appendRow = (rule = {}) => {
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

  function appendExcludeRuleRow_ACU(containerSelector, { startPlaceholder = '开始词', endPlaceholder = '结束词' } = {}) {
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

  function readExcludeRulesFromRows_ACU(containerSelector) {
    if (!$popupInstance_ACU) return [];
    const $container = $popupInstance_ACU.find(containerSelector);
    if (!$container.length) return [];
    const collected = [];
    $container.find('.acu-exclude-rule-row').each(function() {
      const start = String($(this).find('.acu-exclude-rule-start').val() || '').trim();
      const end = String($(this).find('.acu-exclude-rule-end').val() || '').trim();
      if (start && end) collected.push({ start, end });
    });
    return normalizeExcludeRules_ACU(collected, '');
  }

  // --- [剧情推进] Prompt 辅助：兼容 prompts(数组/旧对象) 并以 id 读写 ---
  function ensurePlotPromptsArray_ACU(plotSettings) {
    if (!plotSettings) return;
    const p = plotSettings.prompts;

    // 已是数组：补齐必要项即可
    if (Array.isArray(p)) {
      const required = [
        { id: 'mainPrompt', role: 'system', name: '主系统提示词 (通用)' },
        { id: 'systemPrompt', role: 'user', name: '拦截任务详细指令' },
        { id: 'finalSystemDirective', role: 'system', name: '最终注入指令 (Storyteller Directive)' },
      ];
      required.forEach(req => {
        if (!p.some(x => x && x.id === req.id)) {
          p.push({ ...req, content: '', deletable: false });
        }
      });
      return;
    }

    // 旧对象结构：{ mainPrompt, systemPrompt, finalSystemDirective }
    const legacy = (p && typeof p === 'object') ? p : {};
    plotSettings.prompts = [
      { id: 'mainPrompt', name: '主系统提示词 (通用)', role: 'system', content: legacy.mainPrompt || '', deletable: false },
      { id: 'systemPrompt', name: '拦截任务详细指令', role: 'user', content: legacy.systemPrompt || '', deletable: false },
      { id: 'finalSystemDirective', name: '最终注入指令 (Storyteller Directive)', role: 'system', content: legacy.finalSystemDirective || '', deletable: false },
    ];
  }

  function getPlotPromptContentByIdFromSettings_ACU(plotSettings, promptId) {
    if (!plotSettings) return '';
    ensurePlotPromptsArray_ACU(plotSettings);
    const arr = plotSettings.prompts || [];
    const item = arr.find(p => p && p.id === promptId);
    return item?.content || '';
  }

  function getPlotPromptContentById_ACU(promptId) {
    return getPlotPromptContentByIdFromSettings_ACU(settings_ACU?.plotSettings, promptId);
  }

  function setPlotPromptContentByIdForSettings_ACU(plotSettings, promptId, content) {
    if (!plotSettings) return;
    ensurePlotPromptsArray_ACU(plotSettings);
    const arr = plotSettings.prompts || [];
    const item = arr.find(p => p && p.id === promptId);
    if (item) item.content = content ?? '';
  }

  function setPlotPromptContentById_ACU(promptId, content) {
    setPlotPromptContentByIdForSettings_ACU(settings_ACU?.plotSettings, promptId, content);
  }

  // --- [剧情推进] 循环提示词列表渲染和管理 ---
  function renderLoopPromptsList_ACU(plotSettingsOverride = null) {
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
      const $item = $('<div>', {
        class: 'loop-prompt-item',
        style: 'display: flex; gap: 8px; align-items: flex-start; padding: 10px; background: var(--background_light); border: 1px solid var(--border_color_light); border-radius: 6px;'
      });
      
      const $content = $('<div>', {
        style: 'flex: 1; display: flex; flex-direction: column; gap: 6px;'
      });
      
      $content.append($('<div>', {
        style: 'display: flex; align-items: center; gap: 8px;'
      }).append($('<span>', {
        style: 'font-size: 0.85em; color: var(--text_secondary); font-weight: 500;',
        text: `提示词 #${index + 1}`
      })));
      
      const $textarea = $('<textarea>', {
        class: 'loop-prompt-textarea text_pole',
        'data-index': index,
        rows: 2,
        placeholder: '输入循环提示词内容...',
        style: 'resize: vertical; width: 100%;',
        text: prompt || ''
      });
      $content.append($textarea);
      
      const $deleteBtn = $('<button>', {
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

  function saveLoopPromptsFromUI_ACU() {
    const plotSettings = getActivePlotEditorSettings_ACU();
    if (!plotSettings) return;

    ensureLoopPromptsArray_ACU(plotSettings);
    const prompts = [];

    $popupInstance_ACU.find('.loop-prompt-textarea').each(function() {
      const content = $(this).val()?.trim() || '';
      if (content) {
        prompts.push(content);
      }
    });

    plotSettings.loopSettings.quickReplyContent = prompts;
    plotSettings.loopSettings.currentPromptIndex = 0; // 重置索引
    saveSettings_ACU();
  }

  // --- [剧情推进] 临时替换"AI指令预设"(settings_ACU.charCardPrompt)，并在生成结束后恢复 ---
  let plotPromptOverrideActive_ACU = false;
  let plotPromptOverrideBackup_ACU = null;

  // [剧情推进] 去重锁：避免同一次发送被 TavernHelper.generate 钩子 + GENERATION_AFTER_COMMANDS 双重处理导致重复 toast/误报失败
  let lastPlotInterception_ACU = { text: '', ts: 0 };
  function markPlotIntercept_ACU(text) {
      lastPlotInterception_ACU = { text: String(text || ''), ts: Date.now() };
  }
  function shouldSkipPlotIntercept_ACU(text, windowMs = 5000) {
      const t = String(text || '');
      if (!t) return false;
      const age = Date.now() - (lastPlotInterception_ACU?.ts || 0);
      if (age < 0 || age > windowMs) return false;
      return t === String(lastPlotInterception_ACU?.text || '');
  }

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

