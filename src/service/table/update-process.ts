// update-process.ts
// 从 01_update_process.js 迁入

import { abortAllActiveRequests_ACU, isAutoUpdatingCard_ACU, wasStoppedByUser_ACU, _set_isAutoUpdatingCard_ACU, _set_manualExtraHint_ACU, _set_wasStoppedByUser_ACU} from '../runtime/state-manager';
import { getManualSelectionFromUI_ACU } from '../../presentation/components/table-selector';
import { showToastr_ACU } from '../runtime/toast-service';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { callCustomOpenAI_ACU } from '../ai/prompt-builder';
import { SillyTavern_API_ACU, coreApisAreReady_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU, toastr_API_ACU, $statusMessageSpan_ACU, _set_currentJsonTableData_ACU} from '../runtime/state-manager';
import { checkAndTriggerAutoMergeSummary_ACU } from '../summary/merge-logic';
import { getChatSheetGuideDataForIsolationKey_ACU } from '../template/chat-scope';
import { loadAllChatMessages_ACU, refreshMergedDataAndNotify_ACU, updateReadableLorebookEntry_ACU } from '../worldbook/pipeline';
import { topLevelWindow_ACU } from '../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { checkIfFirstTimeInit_ACU, saveIndependentTableToChatHistory_ACU } from '../../data/repositories/table-repo';
import { bindTableFillStopButton_ACU, resetManualUpdateButton_ACU } from '../../presentation/components/status-display';
import { updateCardUpdateStatusDisplay_ACU } from '../../presentation/components/update-status-display';
import { collectManualExtraHint_ACU } from '../../presentation/triggers/settings-ui-sync';
import { parseAndApplyTableEdits_ACU, prepareAIInput_ACU } from '../ai/prompt-builder';
import { buildGuidedBaseDataFromSheetGuide_ACU, getSortedSheetKeys_ACU, sanitizeSheetForStorage_ACU } from '../template/chat-scope';

export   async function processUpdates_ACU(indicesToUpdate, mode = 'auto', options: any = {}) {
      if (!indicesToUpdate || indicesToUpdate.length === 0) {
          return true;
      }

      const { targetSheetKeys, batchSize: specificBatchSize, requestOptions } = options;

      _set_isAutoUpdatingCard_ACU(true);

      // [新增] 根据更新模式选择不同的批处理大小和阈值
      const isSummaryMode = (mode && (mode.includes('summary') || mode === 'manual_summary')) || false;
      // 优先使用传入的 specificBatchSize，否则使用全局批处理大小
      const batchSize = specificBatchSize || (settings_ACU.updateBatchSize || 2);
      
      const batches = [];
      for (let i = 0; i < indicesToUpdate.length; i += batchSize) {
          batches.push(indicesToUpdate.slice(i, i + batchSize));
      }

      logDebug_ACU(`[${mode}] Processing ${indicesToUpdate.length} updates in ${batches.length} batches of size ${batchSize} (${isSummaryMode ? '总结表模式' : '标准表模式'}). Target Sheets: ${targetSheetKeys ? targetSheetKeys.length : 'All'}`);

      let overallSuccess = true;
      const chatHistory = SillyTavern_API_ACU.chat || [];

          for (let i = 0; i < batches.length; i++) {
              const batchIndices = batches[i];
              const batchNumber = i + 1;
              const totalBatches = batches.length;
              const firstMessageIndexOfBatch = batchIndices[0];
              const lastMessageIndexOfBatch = batchIndices[batchIndices.length - 1];

          // [逻辑修正] 保存目标应始终是当前处理批次的最后一个消息。
          // “跳过楼层”参数仅影响触发时机和读取的上下文，不影响保存位置。
          const finalSaveTargetIndex = lastMessageIndexOfBatch;

          // 1. 加载基础数据库：从当前批次开始的位置往前找每个表格的最新记录
          // [核心修复] 多批次更新时，必须为每个表格单独查找其最新数据
          // 这确保了即使上一批次只更新了部分表格，当前批次也能获得所有表格的完整数据
          
          // Step 1: 优先使用聊天记录的"空白指导表"作为基础，否则回退到模板
          // [关键修复] 用户切换模板后回到聊天记录时，应使用该聊天的指导表，而不是新模板
          let mergedBatchData = null;
          try {
              const batchIsoKey = getCurrentIsolationKey_ACU();
              const sheetGuideForBatch = getChatSheetGuideDataForIsolationKey_ACU(batchIsoKey);
              if (sheetGuideForBatch && typeof sheetGuideForBatch === 'object' && Object.keys(sheetGuideForBatch).some(k => k.startsWith('sheet_'))) {
                  // 使用聊天记录的指导表作为基础（深拷贝）
                  mergedBatchData = buildGuidedBaseDataFromSheetGuide_ACU(sheetGuideForBatch);
                  logDebug_ACU(`[Batch ${batchNumber}] Using chat sheet guide as merge base.`);
              } else {
                  // [兜底] 没有指导表时使用模板（header-only）
                  mergedBatchData = parseTableTemplateJson_ACU({ stripSeedRows: true });
                  logDebug_ACU(`[Batch ${batchNumber}] No chat sheet guide found, using template as merge base.`);
              }
          } catch (e) {
              logError_ACU(`[Batch ${batchNumber}] Failed to build merge base from guide/template.`, e);
              showToastr_ACU('error', "无法构建合并基底，操作已终止。");
              overallSuccess = false;
              break;
          }
          if (!mergedBatchData) {
              showToastr_ACU('error', "无法构建合并基底，操作已终止。");
              overallSuccess = false;
              break;
          }

          // [修复] 使用指导表感知的排序获取 keys
          const batchSheetKeys = getSortedSheetKeys_ACU(mergedBatchData);
          
          // [数据隔离核心] 获取当前隔离标签键名
          const batchIsolationKey = getCurrentIsolationKey_ACU();

          // Step 2: 为每个表格单独查找该批次开始位置之前的最新数据
          // 使用 map 跟踪每个表格是否已找到
          const batchFoundSheets = {};
          batchSheetKeys.forEach(k => batchFoundSheets[k] = false);

          // 遍历当前批次开始位置之前的所有消息
          for (let j = firstMessageIndexOfBatch - 1; j >= 0; j--) {
              const msg = chatHistory[j];
              if (msg.is_user) continue;
              
              // [优先级1] 检查新版按标签分组存储 TavernDB_ACU_IsolatedData
              if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[batchIsolationKey]) {
                  const tagData = msg.TavernDB_ACU_IsolatedData[batchIsolationKey];
                  const independentData = tagData.independentData || {};
                  
                  Object.keys(independentData).forEach(storedSheetKey => {
                      if (batchFoundSheets[storedSheetKey] === false && mergedBatchData[storedSheetKey]) {
                          mergedBatchData[storedSheetKey] = JSON.parse(JSON.stringify(independentData[storedSheetKey]));
                          batchFoundSheets[storedSheetKey] = true;
                      }
                  });
              }
              
              // [优先级2] 兼容旧版存储格式 - 严格匹配隔离标签
              // [数据隔离核心逻辑] 无标签也是标签的一种，严格隔离不同标签的数据
              const msgIdentity = msg.TavernDB_ACU_Identity;
              let isLegacyMatch = false;
              if (settings_ACU.dataIsolationEnabled) {
                  isLegacyMatch = (msgIdentity === settings_ACU.dataIsolationCode);
              } else {
                  // 关闭隔离（无标签模式）：只匹配无标识数据
                  isLegacyMatch = !msgIdentity;
              }

              if (isLegacyMatch) {
                  // 检查旧版独立数据格式
                  if (msg.TavernDB_ACU_IndependentData) {
                      const independentData = msg.TavernDB_ACU_IndependentData;
                      Object.keys(independentData).forEach(storedSheetKey => {
                          if (batchFoundSheets[storedSheetKey] === false && mergedBatchData[storedSheetKey]) {
                              mergedBatchData[storedSheetKey] = JSON.parse(JSON.stringify(independentData[storedSheetKey]));
                              batchFoundSheets[storedSheetKey] = true;
                          }
                      });
                  }
                  
                  // 检查旧版标准表存储格式
                  if (msg.TavernDB_ACU_Data) {
                      const standardData = msg.TavernDB_ACU_Data;
                      Object.keys(standardData).forEach(k => {
                          if (k.startsWith('sheet_') && batchFoundSheets[k] === false && mergedBatchData[k]) {
                              mergedBatchData[k] = JSON.parse(JSON.stringify(standardData[k]));
                              batchFoundSheets[k] = true;
                          }
                      });
                  }
                  
                  // 检查旧版总结表存储格式
                  if (msg.TavernDB_ACU_SummaryData) {
                      const summaryData = msg.TavernDB_ACU_SummaryData;
                      Object.keys(summaryData).forEach(k => {
                          if (k.startsWith('sheet_') && batchFoundSheets[k] === false && mergedBatchData[k]) {
                              mergedBatchData[k] = JSON.parse(JSON.stringify(summaryData[k]));
                              batchFoundSheets[k] = true;
                          }
                      });
                  }
              }

              // 如果所有表格都找到了，提前结束搜索
              if (Object.values(batchFoundSheets).every(v => v === true)) {
                  break;
              }
          }

          // 将合并后的数据赋值给全局变量
          _set_currentJsonTableData_ACU(mergedBatchData);
          
          // 统计找到的表格数量
          const foundCount = Object.values(batchFoundSheets).filter(v => v === true).length;
          const totalCount = batchSheetKeys.length;
          logDebug_ACU(`[Batch ${batchNumber}] Loaded ${foundCount}/${totalCount} tables from history before index ${firstMessageIndexOfBatch}. Missing tables will use template structure (header-only).`);

          // 2. 计算上下文范围
          // [修复] 在批量处理模式下，上下文应仅包含当前批次的消息（以及其前置的用户消息），
          // 而不是基于 threshold 回溯包含之前批次的消息。
          // 数据库状态已经通过上面的加载逻辑更新到了上一批次的结尾，因此AI只需要阅读当前批次的增量内容。
          
          let sliceStartIndex = firstMessageIndexOfBatch;

          // 尝试包含当前批次第一条AI消息之前的用户消息（如果是用户发言的话）
          // 这有助于AI理解对话上下文
          if (sliceStartIndex > 0 && chatHistory[sliceStartIndex - 1]?.is_user) {
              sliceStartIndex--;
              logDebug_ACU(`[Batch ${batchNumber}] Adjusted slice start to ${sliceStartIndex} to include preceding user message.`);
          }

          const messagesForContext = chatHistory.slice(sliceStartIndex, lastMessageIndexOfBatch + 1);
          
          // [优化] 检测最新AI回复的长度，而非整个上下文
          // 获取当前批次中最后一条AI消息的内容长度
          const lastAiMessageInBatch = chatHistory[lastMessageIndexOfBatch];
          const lastAiMessageContent = lastAiMessageInBatch?.mes || lastAiMessageInBatch?.message || '';
          const lastAiMessageLength = lastAiMessageContent.length;
          const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;
                   
          // [新增] 静默模式判断逻辑：
          // - 自动更新模式 (auto_*) + 用户开启静默开关：不显示进度框
          // - 手动更新模式 (manual_*)：无论静默开关如何，始终显示进度框
          const isAutoUpdateMode = mode && mode.startsWith('auto');
          const isManualMode = mode && mode.startsWith('manual');
          const isSilentMode = isAutoUpdateMode && !!settings_ACU.toastMuteEnabled;
                    
          // [修复] 检查最新AI回复长度阈值，仅适用于自动更新模式
                 // 手动更新模式 (manual_*) 强制执行，忽略阈值
                 // [修复 2026-02-28] 使用 isAutoUpdateMode 变量替代硬编码的模式列表，确保所有 auto_* 模式（包括 auto_independent）都被覆盖
          if (isAutoUpdateMode && lastAiMessageLength < minReplyLength) {
              logDebug_ACU(`[Auto] Batch ${batchNumber}/${totalBatches} skipped: Last AI reply length (${lastAiMessageLength}) is below threshold (${minReplyLength}).`);
              // [新增] 静默模式下不显示跳过提示
              if (!isSilentMode) {
                  showToastr_ACU('info', `最新AI回复过短 (${lastAiMessageLength} 字符)，跳过自动更新。`);
              }
              continue; // 跳过此批次，但不算失败
          }

          // 3. 执行更新并保存
          // [修复] 根据 mode 判断更新模式：
          // - 'auto_unified' 表示参数一致时的统一更新模式，使用 'full'，不屏蔽任何表
          // - 'auto_standard' 或 'auto' 表示标准表更新模式，使用 'standard'，屏蔽总结表
          // - 包含 'summary' 或 'manual_summary' 表示总结表更新模式，使用 'summary'，屏蔽标准表
          // [修复] 根据 mode 判断更新模式：
          // - 'auto_unified' 或 'manual_unified' 表示参数一致时的统一更新模式，使用 'full'，不屏蔽任何表
          // - 其他模式保留 auto/manual 前缀，以便 downstream 区分
          let updateMode = 'auto_standard'; // Default
          if (mode === 'auto_unified' || mode === 'manual_unified' || mode === 'full') {
              updateMode = mode;
          } else if (mode === 'auto_summary_silent') {
              updateMode = 'auto_summary_silent';
          } else if (mode && mode.startsWith('manual')) {
            // manual_standard, manual_summary, manual_independent
            if (mode.includes('summary')) updateMode = 'manual_summary';
            else if (mode === 'manual_independent') updateMode = 'manual_independent';
            else updateMode = 'manual_standard';
        } else {
              // auto_independent, auto, etc.
              if (mode && mode.includes('summary')) updateMode = 'auto_summary';
              else updateMode = 'auto_standard';
          }

          // [新增] 总结表静默更新时不显示toast提示
          const toastMessage = isSilentMode ? '' : `正在处理 ${isManualMode ? '手动' : '自动'} 更新 (${batchNumber}/${totalBatches})...`;
          // [修复] 传递 targetSheetKeys 到 proceedWithCardUpdate_ACU
          const success = await proceedWithCardUpdate_ACU(messagesForContext, toastMessage, finalSaveTargetIndex, false, updateMode, isSilentMode, targetSheetKeys, requestOptions);

          if (!success) {
              // [新增] 静默模式下不显示错误提示
              if (!isSilentMode) {
                  showToastr_ACU('error', `批处理在第 ${batchNumber} 批时失败或被终止。`);
              }
              overallSuccess = false;
                          break;
                      }
      }

      // 自动合并总结检测已移至更高层级调用处

      _set_isAutoUpdatingCard_ACU(false);
      return overallSuccess;
  }


export   async function handleManualUpdate_ACU() {
      try {
        if (isAutoUpdatingCard_ACU) {
            showToastr_ACU('warning', '数据库更新正在进行中，请稍候...');
            return;
        }

        if (!coreApisAreReady_ACU) {
            showToastr_ACU('error', 'API未就绪。');
            return;
        }

        const apiIsConfigured = (settings_ACU.apiMode === 'custom' && (settings_ACU.apiConfig.useMainApi || (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model))) || (settings_ACU.apiMode === 'tavern' && settings_ACU.tavernProfile);
        if (!apiIsConfigured) {
            showToastr_ACU('error', 'API未配置，无法更新数据库。');
            return;
        }

        collectManualExtraHint_ACU();

        // [修复] 在填表前先刷新数据，确保 currentJsonTableData_ACU 与聊天记录的指导表一致
        // 这解决了用户切换模板后回到聊天记录时，数据可能不一致的问题
        await loadAllChatMessages_ACU();
        await refreshMergedDataAndNotify_ACU();
        
        if (!currentJsonTableData_ACU) {
            showToastr_ACU('error', '数据库未加载。');
            return;
        }
        const liveChat = SillyTavern_API_ACU.chat;
        if (!liveChat || liveChat.length === 0) {
            showToastr_ACU('warning', '聊天记录为空，无法更新。');
            return;
        }

        const allAiMessageIndices = liveChat
            .map((msg, index) => !msg.is_user ? index : -1)
            .filter(index => index !== -1);

        if (allAiMessageIndices.length === 0) {
            showToastr_ACU('warning', '尚未检测到AI回复，无法执行手动更新。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
            return;
        }

        const targetKeys = getManualSelectionFromUI_ACU();
        if (!targetKeys.length) {
            showToastr_ACU('warning', '未选择需要更新的表格。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
            return;
        }

        // 手动更新强制使用UI参数，忽略模板参数
        const uiThreshold = settings_ACU.autoUpdateThreshold || 3;
        const uiBatchSize = settings_ACU.updateBatchSize || 3;
        const uiSkip = settings_ACU.skipUpdateFloors || 0;

        const effectiveAiIndices = uiSkip > 0 ? allAiMessageIndices.slice(0, -uiSkip) : allAiMessageIndices.slice();
        const contextScopeIndices = uiThreshold > 0 ? effectiveAiIndices.slice(-uiThreshold) : effectiveAiIndices;

        if (!contextScopeIndices.length) {
            showToastr_ACU('warning', '未找到可用的上下文进行手动更新，请检查阈值或跳过楼层设置。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
            return;
        }

        // 手动更新仍使用 UI 的上下文与批次设置，但按模板 groupId 拆成多组并发处理
        const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true }) || {};
        const updateGroups = {};
        targetKeys.forEach(sheetKey => {
            const tableGroupId = Number.isFinite(templateData?.[sheetKey]?.updateConfig?.groupId)
                ? Math.trunc(templateData[sheetKey].updateConfig.groupId)
                : -1;
            const groupKey = `${tableGroupId}|${contextScopeIndices.join(',')}|${uiBatchSize}`;
            if (!updateGroups[groupKey]) {
                updateGroups[groupKey] = {
                    indices: contextScopeIndices,
                    batchSize: uiBatchSize,
                    groupId: tableGroupId,
                    sheetKeys: []
                };
            }
            updateGroups[groupKey].sheetKeys.push(sheetKey);
        });
        const groupKeys = Object.keys(updateGroups);

        _set_isAutoUpdatingCard_ACU(true);
        for (const gKey of groupKeys) {
            const group = updateGroups[gKey];
            logDebug_ACU(`[Manual Parallel] Processing group update for groupId=${group.groupId}, sheets: ${group.sheetKeys.join(', ')}`);
            // 每组严格限制表格范围
            const success = await processUpdates_ACU(group.indices, 'manual_independent', {
                targetSheetKeys: group.sheetKeys,
                batchSize: group.batchSize
            });
            if (!success) {
                _set_isAutoUpdatingCard_ACU(false);
                showToastr_ACU('error', '手动更新失败或被终止。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                return;
            }
            await loadAllChatMessages_ACU();
            await refreshMergedDataAndNotify_ACU();
        }
        _set_isAutoUpdatingCard_ACU(false);
        showToastr_ACU('success', '手动更新完成！', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.TABLE_OK });
        if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
            updateCardUpdateStatusDisplay_ACU();
        }

        // [新增] 在手动更新全部完成后检测自动合并总结
        try {
            await checkAndTriggerAutoMergeSummary_ACU();
        } catch (e) {
            logWarn_ACU('自动合并总结检测失败:', e);
        }
      } finally {
          _set_manualExtraHint_ACU('');
          _set_isAutoUpdatingCard_ACU(false);
          if (typeof resetManualUpdateButton_ACU === 'function') resetManualUpdateButton_ACU();
      }
  }


export   async function proceedWithCardUpdate_ACU(messagesToUse, batchToastMessage = '正在填表，请稍候...', saveTargetIndex = -1, isImportMode = false, updateMode = 'standard', isSilentMode = false, targetSheetKeys = null, requestOptions = null) {
    // UI 状态更新通过 presentation 层函数
    const statusUpdate = (text) => {
        if (!isSilentMode && $statusMessageSpan_ACU) $statusMessageSpan_ACU.text(text);
    };

    const localAbortController = new AbortController();
    let loadingToast = null;
    let success = false;
    let modifiedKeys = []; // [修复] 提升作用域
    const maxRetries = settings_ACU.tableMaxRetries || 3; // [修改] 使用可配置的重试次数，默认3次

    try {
        // [新增] 静默模式下不通知填表开始
        if (!isSilentMode) {
            (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableFillStart();
        }
        
        // [新增] 静默模式下不显示toast提示
        if (!isSilentMode && batchToastMessage) {
        const stopButtonHtml = `
            <button id="acu-stop-update-btn" 
                    style="border: 1px solid #ffc107; color: #ffc107; background: transparent; padding: 5px 10px; border-radius: 4px; cursor: pointer; float: right; margin-left: 15px; font-size: 0.9em; transition: all 0.2s ease;"
                    onmouseover="this.style.backgroundColor='#ffc107'; this.style.color='#1a1d24';"
                    onmouseout="this.style.backgroundColor='transparent'; this.style.color='#ffc107';">
                终止
            </button>`;
        const toastMessage = `<div>${batchToastMessage}${stopButtonHtml}</div>`;
        
            loadingToast = showToastr_ACU('info', toastMessage, { 
                timeOut: 0, 
                extendedTimeOut: 0, 
                tapToDismiss: false,
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE,
                onShown: function() {
                    if (typeof bindTableFillStopButton_ACU === 'function') {
                        bindTableFillStopButton_ACU(localAbortController, () => {
                            _set_wasStoppedByUser_ACU(true);
                            abortAllActiveRequests_ACU();
                            _set_isAutoUpdatingCard_ACU(false);
                            statusUpdate('操作已终止。');
                            showToastr_ACU('warning', '填表操作已由用户终止。');
                            setTimeout(() => { _set_wasStoppedByUser_ACU(false); }, 3000);
                        });
                    }
                }
            });
        }

        if (!isSilentMode) {
            statusUpdate('准备AI输入...');
        }
        // [修复] 传递 targetSheetKeys
        const dynamicContent = await prepareAIInput_ACU(messagesToUse, updateMode, targetSheetKeys, {
            excludeImportTaggedWorldbookEntries: isImportMode && settings_ACU.importPromptExcludeImportedWorldbookEntries !== false,
        });
        if (!dynamicContent) throw new Error('无法准备AI输入，数据库未加载。');

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // [修复] 检查用户是否已经终止操作，如果是则立即退出重试循环
            if (wasStoppedByUser_ACU) {
                logDebug_ACU('ACU: User abort detected, exiting retry loop.');
                throw new DOMException('Aborted by user', 'AbortError');
            }

            if (!isSilentMode) {
                statusUpdate(`第 ${attempt}/${maxRetries} 次调用AI进行增量更新...`);
            }
            
            let aiResponse = null;
            let attemptError = null; // [修改] 统一的错误变量
            
            // [修改] 统一重试逻辑：API调用、空回检测、解析失败都进入重试
            try {
                // 1. API调用
                aiResponse = await callCustomOpenAI_ACU(dynamicContent, localAbortController, requestOptions);
                
                // 检查用户中止
                if (localAbortController.signal.aborted || wasStoppedByUser_ACU) {
                    throw new DOMException('Aborted by user', 'AbortError');
                }
                
                // 2. [新增] 空回检测：检查AI回复长度是否低于阈值
                const minReplyLength = settings_ACU.autoUpdateTokenThreshold || 0;
                if (aiResponse && minReplyLength > 0 && aiResponse.length < minReplyLength) {
                    throw new Error(`AI回复过短 (${aiResponse.length} 字符)，低于阈值 (${minReplyLength} 字符)`);
                }
                
                // 3. 检查tableEdit标签
                if (!aiResponse || !aiResponse.includes('<tableEdit>') || !aiResponse.includes('</tableEdit>')) {
                    throw new Error('AI响应中未找到完整有效的 <tableEdit> 标签');
                }

                if (!isSilentMode) {
                    statusUpdate('解析并应用AI返回的更新...');
                }
                
                // 4. 解析并应用更新
                // [修复] 外部导入模式下不保存到聊天记录
                const parseResult = parseAndApplyTableEdits_ACU(aiResponse, updateMode, isImportMode);
                
                let parseSuccess = false;
                modifiedKeys = []; // Reset for this attempt
                
                if (typeof parseResult === 'object' && parseResult !== null) {
                    parseSuccess = parseResult.success;
                    modifiedKeys = parseResult.modifiedKeys || [];
                } else {
                    parseSuccess = !!parseResult;
                    modifiedKeys = targetSheetKeys || [];
                }

                if (!parseSuccess) {
                    throw new Error('解析或应用AI更新时出错');
                }
                
                // 成功！退出重试循环
                success = true;
                break;
                
            } catch (error) {
                attemptError = error;
                logWarn_ACU(`第 ${attempt} 次尝试失败: ${error.message}`);
                
                // 用户中止：直接抛出，不重试
                if (error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted') || wasStoppedByUser_ACU) {
                    throw new DOMException('Aborted by user', 'AbortError');
                }
                
                // 如果不是最后一次尝试，等待5秒后重试
                if (attempt < maxRetries) {
                    const waitTime = 5000; // 固定等待5秒
                    logDebug_ACU(`等待 ${waitTime}ms 后重试...`);
                    if (!isSilentMode) {
                        showToastr_ACU('warning', `第 ${attempt} 次尝试失败，5秒后重试... (${error.message.substring(0, 50)})`, { timeOut: 5000 });
                    }
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                } else {
                    // 最后一次尝试也失败，抛出错误
                    throw new Error(`填表在 ${maxRetries} 次尝试后仍失败: ${error.message}`);
                }
            }
        }

        if (success) {
            // [修正] 在导入模式下，不保存到聊天记录，而是由父函数在最后统一处理
            if (!isImportMode) {
                if (!isSilentMode) {
                    statusUpdate('正在将更新后的数据库保存到聊天记录...');
                }
                // [新增] 根据更新模式选择不同的保存标记
                // updateMode 在这里仅用于逻辑判断，实际保存使用新的独立函数
                // 如果是 import 模式，不需要在这里保存
                
                // [核心修复] 仅保存实际发生变化的表格
                let keysToPersist = modifiedKeys;
                if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
                    keysToPersist = keysToPersist.filter(k => targetSheetKeys.includes(k));
                }
                
                // [优化] 检查是否是首次初始化（聊天记录中没有任何数据库记录）
                // 如果是首次初始化，即使某些表没有被AI修改，也需要保存完整的模板结构
                const isFirstTimeInit = await checkIfFirstTimeInit_ACU();
                
                if (keysToPersist.length > 0 || isFirstTimeInit) {
                    // [优化] 首次初始化时，保存所有表格的完整结构
                    // 对于没有被AI修改的表，使用模板中的原始数据（包括预置数据）
                    let keysToActuallySave = keysToPersist;
                    if (isFirstTimeInit) {
                        // 获取所有表格的 key
                        const allSheetKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
                        keysToActuallySave = allSheetKeys;
                        
                        // [关键] 获取完整模板（包含预置数据），用于填充没有被AI更新的表
                        const fullTemplate = parseTableTemplateJson_ACU({ stripSeedRows: false });
                        if (fullTemplate) {
                            allSheetKeys.forEach(sheetKey => {
                                // 如果这个表没有被AI修改，使用模板中的原始数据
                                if (!keysToPersist.includes(sheetKey) && fullTemplate[sheetKey]) {
                                    currentJsonTableData_ACU[sheetKey] = JSON.parse(JSON.stringify(fullTemplate[sheetKey]));
                                    logDebug_ACU(`[Init] Table ${sheetKey} not modified by AI, using template data (may include seed rows).`);
                                }
                            });
                        }
                        
                        logDebug_ACU('[Init] First time initialization detected. Saving complete template structure with all tables.');
                    }
                    
                    // [合并更新逻辑] 传递 targetSheetKeys 作为合并更新组
                    // 只要组内有任意一个表被修改，整组表都视为已更新
                    // 首次初始化时，updateGroupKeys 使用实际被修改的表
                    // [新增] 仅对总结表/总体大纲：未写入则视为未更新
                    const updateGroupKeysRaw = isFirstTimeInit ? keysToPersist : targetSheetKeys;
                    const updateGroupKeysToUse = Array.isArray(updateGroupKeysRaw)
                        ? updateGroupKeysRaw.filter(sheetKey => {
                            const table = currentJsonTableData_ACU?.[sheetKey];
                            if (!table || !isSummaryOrOutlineTable_ACU(table.name)) return true;
                            return keysToActuallySave.includes(sheetKey);
                        })
                        : updateGroupKeysRaw;
                    const saveSuccess = await saveIndependentTableToChatHistory_ACU(saveTargetIndex, keysToActuallySave, updateGroupKeysToUse);
                    if (!saveSuccess) throw new Error('无法将更新后的数据库保存到聊天记录。');
                } else {
                    logDebug_ACU("No tables were modified by AI, skipping save to chat history.");
                }
                
                await updateReadableLorebookEntry_ACU(true);
            } else {
                if (!isSilentMode) {
                    statusUpdate('分块处理成功...');
                }
                logDebug_ACU("Import mode: skipping save to chat history for this chunk.");
            }

            // [新增] 静默模式下不通知UI刷新（注意：saveJsonTableToChatHistory_ACU 已经在合并后通知UI刷新了）
            // 这里保留是为了兼容性，但主要通知在 saveJsonTableToChatHistory_ACU 中
            if (!isSilentMode) {
            setTimeout(() => {
                (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
                logDebug_ACU('Delayed notification sent after saving.');
            }, 250);
            }
            
            if (!isSilentMode) {
                statusUpdate('数据库增量更新成功！');
                if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
                    updateCardUpdateStatusDisplay_ACU();
                }
            }
        }
        return success;

    } catch (error) {
        if (error.name === 'AbortError') {
            logDebug_ACU('Fetch request was aborted by the user.');
            // UI state is now reset in the click handler, so we just need to log and return
        } else {
            logError_ACU(`数据库增量更新流程失败: ${error.message}`);
            // [新增] 静默模式下不显示错误提示
            if (!isSilentMode) {
            showToastr_ACU('error', `更新失败: ${error.message}`);
                if (statusUpdate) {
            statusUpdate('错误：更新失败。');
                }
            } else {
                logError_ACU(`[静默模式] 总结表更新失败: ${error.message}`);
            }
        }
        return false;
    } finally {
        // The toast is removed by the click handler on abort, so this only clears it on success/error
        if (loadingToast && toastr_API_ACU) {
            toastr_API_ACU.clear(loadingToast);
        }
        // currentAbortController_ACU 由 callCustomOpenAI_ACU 内部管理
        // [修改] 不在此处重置 isAutoUpdatingCard_ACU 和按钮状态，交由上层调用函数管理
    }
  }


export   async function saveCurrentDataForTable_ACU(sheetKey) {
      try {
          if (!currentJsonTableData_ACU || !currentJsonTableData_ACU[sheetKey]) {
              logWarn_ACU('saveCurrentDataForTable_ACU: No data to save.');
              return;
          }
          
          const chat = SillyTavern_API_ACU.chat;
          if (!chat || chat.length === 0) {
              logWarn_ACU('saveCurrentDataForTable_ACU: No chat history.');
              return;
          }
          
          // 查找最新的AI消息
          for (let i = chat.length - 1; i >= 0; i--) {
              if (!chat[i].is_user) {
                  const targetMessage = chat[i];
                  const sheet = currentJsonTableData_ACU[sheetKey];
                  
                  // 判断表格类型
                  const isSummaryTable = isSummaryOrOutlineTable_ACU(sheet.name);
                  
                  // 保存到对应字段
                  const cleanSheet = sanitizeSheetForStorage_ACU(sheet);
                  
                  if (isSummaryTable) {
                      // 总结表
                      let summaryData = targetMessage.TavernDB_ACU_SummaryData;
                      if (typeof summaryData === 'string') {
                          try { summaryData = JSON.parse(summaryData); } catch (e) { summaryData = {}; }
                      }
                      if (!summaryData) summaryData = {};
                      summaryData[sheetKey] = cleanSheet;
                      targetMessage.TavernDB_ACU_SummaryData = summaryData;
                  } else {
                      // 标准表
                      let standardData = targetMessage.TavernDB_ACU_Data;
                      if (typeof standardData === 'string') {
                          try { standardData = JSON.parse(standardData); } catch (e) { standardData = {}; }
                      }
                      if (!standardData) standardData = {};
                      standardData[sheetKey] = cleanSheet;
                      targetMessage.TavernDB_ACU_Data = standardData;
                  }
                  
                  // 保存聊天记录
                  await SillyTavern_API_ACU.saveChat();
                  break;
              }
          }
      } catch (e) {
          logError_ACU('saveCurrentDataForTable_ACU failed:', e);
      }
  }
