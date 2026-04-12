// init.ts — 初始化编排
// 从 05_core_tail.js 迁入

export   function mainInitialize_ACU() {
    console.log('ACU_INIT_DEBUG: mainInitialize_ACU called.');
    if (attemptToLoadCoreApis_ACU()) {
      logDebug_ACU('AutoCardUpdater Initialization successful! Core APIs loaded.');
      showToastr_ACU('success', '数据库自动更新脚本已加载！', '脚本启动');

      addAutoCardMenuItem_ACU();
      loadSettings_ACU();
      if (
        SillyTavern_API_ACU &&
        SillyTavern_API_ACU.eventSource &&
        typeof SillyTavern_API_ACU.eventSource.on === 'function' &&
        SillyTavern_API_ACU.eventTypes
      ) {
        // [调试] 检查可用的事件类型
        logDebug_ACU('[提示词模板] 可用的事件类型:', Object.keys(SillyTavern_API_ACU.eventTypes));
        
        // [提示词模板] 监听 CHAT_COMPLETION_SETTINGS_READY 事件，使用 makeLast 确保在 st-prompt-template 之后执行
        if (SillyTavern_API_ACU.eventTypes.CHAT_COMPLETION_SETTINGS_READY) {
          // 检查是否有 makeLast 方法
          if (typeof SillyTavern_API_ACU.eventSource.makeLast === 'function') {
            SillyTavern_API_ACU.eventSource.makeLast(
              SillyTavern_API_ACU.eventTypes.CHAT_COMPLETION_SETTINGS_READY,
              handleChatCompletionReady_ACU
            );
            logDebug_ACU('[提示词模板] 已注册 CHAT_COMPLETION_SETTINGS_READY 事件监听（makeLast）');
          } else {
            // 如果没有 makeLast，使用普通 on
            SillyTavern_API_ACU.eventSource.on(
              SillyTavern_API_ACU.eventTypes.CHAT_COMPLETION_SETTINGS_READY,
              handleChatCompletionReady_ACU
            );
            logDebug_ACU('[提示词模板] 已注册 CHAT_COMPLETION_SETTINGS_READY 事件监听（on）');
          }
        }
        
        SillyTavern_API_ACU.eventSource.on(SillyTavern_API_ACU.eventTypes.CHAT_CHANGED, async chatFileName => {
          logDebug_ACU(`ACU CHAT_CHANGED event: ${chatFileName}`);
          await resetScriptStateForNewChat_ACU(chatFileName);

          // [触发门控] 切换聊天时清空“用户发送/生成上下文”，避免跨聊天误触发
          generationGate_ACU.lastUserMessageId = null;
          generationGate_ACU.lastUserMessageText = '';
          generationGate_ACU.lastUserMessageAt = 0;
          generationGate_ACU.lastUserSendIntentAt = 0;
          generationGate_ACU.lastGeneration = null;

          // [触发门控] 每次切换聊天都尝试安装一次 capture 钩子（防止 DOM 重新渲染导致丢失）
          installSendIntentCaptureHooks_ACU();

          // [剧情推进] 切换聊天时停止循环并加载预设
          if (loopState_ACU.isLooping) {
            stopAutoLoop_ACU();
            showToastr_ACU('info', '切换聊天，自动化循环已停止。');
          }
          await loadPresetAndCleanCharacterData_ACU();

          // [剧情推进] TavernHelper钩子：拦截直接的JS调用
          if (!window.original_TavernHelper_generate_ACU) {
            if (window.TavernHelper && typeof window.TavernHelper.generate === 'function') {
              window.original_TavernHelper_generate_ACU = window.TavernHelper.generate;
              window.TavernHelper.generate = async function (...args) {
                const options = args[0] || {};

                // 注意：TavernHelper.generate 常用于脚本/插件直接触发，这里不依赖“发送意图”，只过滤 quiet/automatic_trigger。
                if (isQuietLikeGeneration_ACU('tavernhelper', { quiet_prompt: options.quiet_prompt }) || options.automatic_trigger) {
                  return window.original_TavernHelper_generate_ACU.apply(this, args);
                }

                if (!settings_ACU.plotSettings.enabled || isProcessing_Plot_ACU || loopState_ACU.isRetrying || options.should_stream) {
                  return window.original_TavernHelper_generate_ACU.apply(this, args);
                }

                let userMessage = options.user_input || options.prompt;
                if (options.injects?.[0]?.content) {
                  userMessage = options.injects[0].content;
                }
                // 记录本次拦截，供 GENERATION_AFTER_COMMANDS 去重
                markPlotIntercept_ACU(userMessage);

                try {
                  if (userMessage) {
                    isProcessing_Plot_ACU = true;
                    try {
                      // [优化] 传递原始用户输入用于哈希匹配
                      // 注意：在 TavernHelper.generate 钩子中，userMessage 就是原始用户输入
                      const finalMessage = await runOptimizationLogic_ACU(userMessage, {
                        originalUserInput: userMessage,
                        hasExistingUserMessage: false,
                      });

                      // 去重互斥：若本次被判定为重复触发，则不改写 prompt，继续走原始生成
                      if (finalMessage && finalMessage.skipped) {
                        logDebug_ACU('[剧情推进] Planning skipped in TavernHelper.generate hook (duplicate).');
                        isProcessing_Plot_ACU = false;
                        return await window.original_TavernHelper_generate_ACU.apply(this, args);
                      }

                      // 检查是否被中止
                      if (finalMessage && finalMessage.aborted) {
                        logDebug_ACU('[剧情推进] Generation aborted by user.');
                        // 中止剧情规划不应中断酒馆的正常生成流程：直接走原始生成（不改写prompt）
                        isProcessing_Plot_ACU = false;
                        return await window.original_TavernHelper_generate_ACU.apply(this, args);
                      }

                      // 如果是在循环模式下且规划未返回有效字符串，视为规划失败，按循环重试次数重试
                      if (
                        loopState_ACU.isLooping &&
                        loopState_ACU.awaitingReply &&
                        (!finalMessage || typeof finalMessage !== 'string')
                      ) {
                        logWarn_ACU('[剧情推进] [Loop] 规划未产生有效回复，按循环重试规则重试。');
                        const loopSettings = settings_ACU.plotSettings.loopSettings || DEFAULT_PLOT_SETTINGS_ACU.loopSettings;
                        loopState_ACU.awaitingReply = false;
                        await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: false });
                        return;
                      }

                      if (finalMessage && typeof finalMessage === 'string') {
                        // 根据来源写回
                        if (options.injects?.[0]?.content) {
                          options.injects[0].content = finalMessage;
                        } else if (options.prompt) {
                          options.prompt = finalMessage;
                        } else {
                          options.user_input = finalMessage;
                        }
                        // 添加标志，防止 GENERATION_AFTER_COMMANDS 重复处理
                        options._qrf_processed_by_hook = true;
                      }
                    } catch (error) {
                      logError_ACU('[剧情推进] Error in TavernHelper.generate hook:', error);
                    } finally {
                      isProcessing_Plot_ACU = false;
                    }
                  }

                  // 关键：等待原始生成完成后再恢复 AI 指令预设
                  return await window.original_TavernHelper_generate_ACU.apply(this, args);
                } catch (error) {
                  logError_ACU('[剧情推进] Error in TavernHelper.generate hook:', error);
                  return window.original_TavernHelper_generate_ACU.apply(this, args);
                }
              };
              logDebug_ACU('[剧情推进] TavernHelper.generate hook registered.');
            }
          }
          
          // [新增] 切换角色卡（聊天）时，强制从新聊天记录的本地数据读取最新的表格并刷新UI
          logDebug_ACU('ACU: Chat changed, forcing reload of table data from new chat history.');
          const scheduledChatIdentifier_ACU = cleanChatName_ACU(chatFileName);

          // 稍作延迟以确保SillyTavern已完全加载新聊天的消息列表
          setTimeout(async () => {
             if (scheduledChatIdentifier_ACU && currentChatFileIdentifier_ACU !== scheduledChatIdentifier_ACU) {
                 logDebug_ACU(`ACU: Skip delayed chat refresh because active chat already changed to "${currentChatFileIdentifier_ACU || '未知'}".`);
                 return;
             }

             applyTemplateScopeForCurrentChat_ACU();
 
            // 3. 刷新所有UI（包括可视化编辑器）和世界书
            await refreshMergedDataAndNotify_ACU();
            if (typeof isPopupOpen_ACU === "function" && isPopupOpen_ACU()) {
                loadTemplatePresetSelect_ACU({ keepGlobalValue: false });
            }
            
            // [新增] 再次强制刷新可视化编辑器，确保万无一失
            if (typeof notifyVisualizerRefresh_ACU === 'function') notifyVisualizerRefresh_ACU();
            
            // [新增] 再次强制刷新状态显示，确保UI同步
            if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
                updateCardUpdateStatusDisplay_ACU();
            }
            
            logDebug_ACU('ACU: Chat data reload and UI refresh triggered after chat change (Delayed).');
         }, 1200); // 增加延迟到1200ms，给SillyTavern更多的DOM渲染和上下文切换时间
        });

        // [触发门控] 记录“用户真实发送”的消息ID，用于剧情推进触发判定
        if (SillyTavern_API_ACU.eventTypes.MESSAGE_SENT) {
          SillyTavern_API_ACU.eventSource.on(SillyTavern_API_ACU.eventTypes.MESSAGE_SENT, (messageId) => {
            try {
              recordLastUserSend_ACU(messageId);
            } catch (e) {}
          });
        }

        // [触发门控] 捕捉“用户发送意图”：使用 capture 钩子，确保先于酒馆自身发送逻辑执行
        installSendIntentCaptureHooks_ACU();

        // [触发门控] 记录最近一次生成的上下文（用于过滤 quiet/后台生成导致的误触发）
        if (SillyTavern_API_ACU.eventTypes.GENERATION_STARTED) {
          SillyTavern_API_ACU.eventSource.on(SillyTavern_API_ACU.eventTypes.GENERATION_STARTED, (type, params, dryRun) => {
            try {
              recordGenerationContext_ACU(type, params, dryRun);
            } catch (e) {}
          });
        }
        if (SillyTavern_API_ACU.eventTypes.GENERATION_ENDED) {
            SillyTavern_API_ACU.eventSource.on(SillyTavern_API_ACU.eventTypes.GENERATION_ENDED, (message_id) => {
                logDebug_ACU(`ACU GENERATION_ENDED event for message_id: ${message_id}`);
                if (shouldProcessAutoTableUpdateForGenerationEnded_ACU()) {
                  handleNewMessageDebounced_ACU('GENERATION_ENDED');
                } else {
                  logDebug_ACU('ACU: Skip auto table update due to quiet/background generation.');
                }

                // [剧情推进] 保存Plot到消息和循环检测
                // savePlotToLatestMessage_ACU(); // Moved to runOptimizationLogic_ACU
                onLoopGenerationEnded_ACU();
            });
        }

        // [剧情推进] 拦截用户输入进行剧情规划
        if (SillyTavern_API_ACU.eventTypes.GENERATION_AFTER_COMMANDS) {
          SillyTavern_API_ACU.eventSource.on(SillyTavern_API_ACU.eventTypes.GENERATION_AFTER_COMMANDS, async (type, params, dryRun) => {
            // 如果消息已被TavernHelper钩子处理，则跳过
            if (params?._qrf_processed_by_hook) {
              return;
            }

            // 只在“用户发送触发的正常生成”时做剧情推进，避免其它插件/后台生成触发
            if (!shouldProcessPlotForGeneration_ACU(type, params, dryRun)) {
              return;
            }
            if (type === 'regenerate' || isProcessing_Plot_ACU) {
              return;
            }

            // [去重] 若同一文本刚被 TavernHelper.generate 钩子处理过，则跳过本事件处理，避免重复规划/重复 toast
            try {
              const lastMsgText = (SillyTavern_API_ACU.chat?.length && SillyTavern_API_ACU.chat[SillyTavern_API_ACU.chat.length - 1]?.is_user)
                ? (SillyTavern_API_ACU.chat[SillyTavern_API_ACU.chat.length - 1].mes || '')
                : '';
              const boxText = getSendTextareaValue_ACU() || '';
              if (shouldSkipPlotIntercept_ACU(lastMsgText) || shouldSkipPlotIntercept_ACU(boxText)) {
                logDebug_ACU('[剧情推进] Skip GENERATION_AFTER_COMMANDS due to recent TavernHelper.generate interception.');
                return;
              }
            } catch (e) {}

            const chat = SillyTavern_API_ACU.chat;
            if (!chat || chat.length === 0) {
              return;
            }

            // [策略1] 检查最新的聊天消息 (主要用于 /send 等命令，这些命令会先创建消息再触发生成)
            const lastMessageIndex = chat.length - 1;
            const lastMessage = chat[lastMessageIndex];

            // 如果是新的用户消息且未被处理，进行剧情规划
            if (lastMessage && lastMessage.is_user && !lastMessage._plot_processed) {
              lastMessage._plot_processed = true;

              const messageToProcess = lastMessage.mes;
              if (messageToProcess && messageToProcess.trim().length > 0) {
                isProcessing_Plot_ACU = true;
                try {
                  // 如果是在循环模式下，给消息打上规划标记
                  const isLoopTriggered = loopState_ACU.isLooping && loopState_ACU.awaitingReply;
                  if (isLoopTriggered) {
                    lastMessage._qrf_from_planning = true;
                    logDebug_ACU('[剧情推进] [Loop] 标记规划层消息: _qrf_from_planning=true');
                  }

                  // [优化] 在修改消息之前，先保存原始用户输入的哈希到消息对象上
                  // 这样即使消息内容被规划结果替换，保存函数也能通过这个哈希找到正确的消息
                  const originalInputHash = hashUserInput_ACU(messageToProcess);
                  lastMessage._qrf_plot_pending_hash = originalInputHash;
                  logDebug_ACU('[剧情推进] [Plot] 在消息对象上保存原始输入哈希:', originalInputHash);

                  // [优化] 传递原始用户输入用于哈希匹配
                  // 注意：在策略1中，lastMessage.mes 就是原始用户输入（还未被规划结果替换）
                  const finalMessage = await runOptimizationLogic_ACU(messageToProcess, {
                    originalUserInput: messageToProcess,
                    hasExistingUserMessage: true,
                  });

                  if (finalMessage && finalMessage.skipped) {
                    logDebug_ACU('[剧情推进] Planning skipped in Strategy 1 (duplicate).');
                    return;
                  }

                  if (finalMessage && finalMessage.aborted) {
                    logDebug_ACU('[剧情推进] Generation aborted by user in Strategy 1.');
                    // [优化] 用户手动中止 => 回退：停止生成 + 删除刚创建的用户楼层（如果是本次输入） + 回填输入框
                    if (finalMessage.manual) {
                      try {
                        if (SillyTavern_API_ACU && typeof SillyTavern_API_ACU.stopGeneration === 'function') {
                          SillyTavern_API_ACU.stopGeneration();
                        } else if (window.SillyTavern?.stopGeneration) {
                          window.SillyTavern.stopGeneration();
                        }
                      } catch (e) {}
                      try {
                        const chatNow = SillyTavern_API_ACU.chat;
                        const lastNow = chatNow?.length ? chatNow[chatNow.length - 1] : null;
                        if (lastNow && lastNow.is_user && String(lastNow.mes || '') === String(messageToProcess || '')) {
                          if (typeof SillyTavern_API_ACU.deleteLastMessage === 'function') {
                            await SillyTavern_API_ACU.deleteLastMessage();
                          } else if (window.SillyTavern?.deleteLastMessage) {
                            await window.SillyTavern.deleteLastMessage();
                          }
                        }
                      } catch (e) {}
                      try {
                        const t = finalMessage.restoreText ?? messageToProcess;
                        setSendTextareaValue_ACU(t);
                        ;
                      } catch (e) {}
                    }
                    return;
                  }

                  if (finalMessage && typeof finalMessage === 'string') {
                    params.prompt = finalMessage;
                    lastMessage.mes = finalMessage;

                    // 发送消息更新事件以刷新UI
                    SillyTavern_API_ACU.eventSource.emit(SillyTavern_API_ACU.eventTypes.MESSAGE_UPDATED, lastMessageIndex);

                    // 清空输入框
                    if (getSendTextareaValue_ACU() === messageToProcess) {
                      setSendTextareaValue_ACU('');
                      ;
                    }
                  }
                } catch (error) {
                  logError_ACU('[剧情推进] Error processing last chat message:', error);
                  delete lastMessage._plot_processed; // 允许重试
                } finally {
                  isProcessing_Plot_ACU = false;
                }
                return; // 策略1成功，直接返回，不再执行策略2
              }
            }

            // [策略2 - 受控恢复] 正常发送路径：此时用户楼层还未写入 chat
            // 仅当检测到“近期发送意图”时才读取输入框，避免其它插件触发的生成误伤。
            if (!isRecentUserSendIntent_ACU()) return;
            const textInBox = getSendTextareaValue_ACU();
            if (!textInBox || !String(textInBox).trim()) return;

            isProcessing_Plot_ACU = true;
            try {
              // [优化] 传递原始用户输入用于哈希匹配
              // 注意：在策略2中，textInBox 就是原始用户输入（还未被规划结果替换）
              const originalInputText = String(textInBox);
              const finalMessage = await runOptimizationLogic_ACU(originalInputText, {
                originalUserInput: originalInputText,
                hasExistingUserMessage: false,
              });

              if (finalMessage && finalMessage.skipped) {
                logDebug_ACU('[剧情推进] Planning skipped in Strategy 2 (duplicate).');
                return;
              }

              if (finalMessage && finalMessage.aborted) {
                logDebug_ACU('[剧情推进] Generation aborted by user in Strategy 2.');
                // 用户手动中止：停止生成，保留输入框内容
                if (finalMessage.manual) {
                  try {
                    if (SillyTavern_API_ACU && typeof SillyTavern_API_ACU.stopGeneration === 'function') {
                      SillyTavern_API_ACU.stopGeneration();
                    } else if (window.SillyTavern?.stopGeneration) {
                      window.SillyTavern.stopGeneration();
                    }
                  } catch (e) {}
                }
                return;
              }

              if (finalMessage && typeof finalMessage === 'string') {
                // 关键：写回输入框 + 写回 params.prompt（供本次生成使用），达到“先规划再发送”的效果
                setSendTextareaValue_ACU(finalMessage);
                ;
                try { params.prompt = finalMessage; } catch (e) {}
              }
            } catch (error) {
              logError_ACU('[剧情推进] Error processing textarea input (Strategy 2):', error);
            } finally {
              isProcessing_Plot_ACU = false;
              // 消费掉本次发送意图，避免同一次生成链路重复触发
              generationGate_ACU.lastUserSendIntentAt = 0;
            }
            });
        }
        const chatModificationEvents = ['MESSAGE_DELETED', 'MESSAGE_SWIPED'];
        chatModificationEvents.forEach(evName => {
            if (SillyTavern_API_ACU.eventTypes[evName]) {
                SillyTavern_API_ACU.eventSource.on(SillyTavern_API_ACU.eventTypes[evName], async (data) => {
                    logDebug_ACU(`ACU ${evName} event detected. Triggering data reload and merge from chat history.`);
                    clearTimeout(newMessageDebounceTimer_ACU);
                    newMessageDebounceTimer_ACU = setTimeout(async () => {
                        // [修复] 重新合并数据并更新UI和世界书
                        await refreshMergedDataAndNotify_ACU();
                    }, 500); // 使用防抖处理快速滑动
                });
            }
        });
        logDebug_ACU('ACU: All event listeners attached using eventSource.');
      } else {
        logWarn_ACU('ACU: Could not attach event listeners because eventSource or eventTypes are missing.');
      }
      // [新增] 移除公用的手动更新按钮，改为两个独立的手动更新按钮
      // if (typeof eventOnButton === 'function') {
      //     eventOnButton('更新数据库', handleManualUpdateCard_ACU);
      //     logDebug_ACU(
      //         "ACU: '更新数据库' button event registered with global eventOnButton.",
      //     );
      // } else {
      //     logWarn_ACU("ACU: Global eventOnButton function is not available.");
      // }
      // 修复：移除启动时的状态重置调用。现在完全依赖于SillyTavern加载后触发的第一个CHAT_CHANGED事件来初始化，避免了竞态条件。
      // [新增修复]：为了解决作为角色脚本加载时可能错过初始CHAT_CHANGED事件的问题，
      // 我们在初始化时主动获取一次当前聊天信息并进行设置。
      // 这确保了无论脚本何时加载，都能正确初始化。
      if (SillyTavern_API_ACU && SillyTavern_API_ACU.chatId) {
          logDebug_ACU(`ACU: Initializing with current chat on load: ${SillyTavern_API_ACU.chatId}`);
          // 修复：将初始加载延迟到下一个事件循环，以避免在SillyTavern完全准备好之前运行初始化，从而解决新聊天的竞态条件。
          // [新增] 使用延迟初始化确保UI就绪
          setTimeout(async () => {
              await resetScriptStateForNewChat_ACU(SillyTavern_API_ACU.chatId);
              await loadPresetAndCleanCharacterData_ACU();
              
              // 再次强制刷新数据和UI，确保初始加载时表格显示正确
              await loadAllChatMessages_ACU();
              await refreshMergedDataAndNotify_ACU();
              
              if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
                 updateCardUpdateStatusDisplay_ACU();
              }
          }, 1000);
      } else {
          logWarn_ACU('ACU: Could not get current chat ID on initial load. Waiting for CHAT_CHANGED event.');
      }
    } else {
      logError_ACU('ACU: Failed to initialize. Core APIs not available on DOM ready.');
      console.error('数据库自动更新脚本初始化失败：核心API加载失败。');
    }
  }
