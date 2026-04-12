import { DEFAULT_CHAR_CARD_PROMPT_ACU, DEFAULT_MERGE_SUMMARY_PROMPT_ACU } from '../../data/models/defaults-json.js';
import { abortAllActiveRequests_ACU, getCharCardPromptFromUI_ACU, isAutoUpdatingCard_ACU, wasStoppedByUser_ACU , _set_isAutoUpdatingCard_ACU, _set_wasStoppedByUser_ACU} from '../components/plot-editors';
import { ACU_TOAST_CATEGORY_ACU, showToastr_ACU } from '../theme/toast';
import { callCustomOpenAI_ACU, handleApiResponse_ACU } from '../../service/ai/prompt-builder';
import { SillyTavern_API_ACU, jQuery_API_ACU, TavernHelper_API_ACU, toastr_API_ACU, $popupInstance_ACU, $statusMessageSpan_ACU, $manualUpdateCardButton_ACU, $apiConfigAreaDiv_ACU, $apiConfigSectionToggle_ACU, currentJsonTableData_ACU, settings_ACU, _assignUIPlaceholders_ACU } from '../../service/runtime/state-manager';
import { checkAndTriggerAutoMergeSummary_ACU } from '../../service/summary/merge-logic';
import { processUpdates_ACU } from '../../service/table/update-process';
import { getSortedSheetKeys_ACU, sanitizeChatSheetsObject_ACU } from '../../service/template/chat-scope';
import { loadAllChatMessages_ACU, refreshMergedDataAndNotify_ACU, updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { topLevelWindow_ACU } from '../../shared/env';
import { ensureSheetOrderNumbers_ACU, isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { checkIfFirstTimeInit_ACU, loadOrCreateJsonTableFromChatHistory_ACU, saveIndependentTableToChatHistory_ACU } from '../../data/repositories/table-repo';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { extractTableEditInner_ACU, parseAndApplyTableEdits_ACU, prepareAIInput_ACU } from '../../service/ai/prompt-builder';
import { getEffectiveAutoUpdateThreshold_ACU } from '../../service/runtime/helpers-remaining';
/**
 * presentation/triggers/update-trigger.ts — 手动更新触发 UI
 * 从 features/ui/01_update_trigger.js 迁移而来
 */

  async function proceedWithCardUpdate_ACU(messagesToUse, batchToastMessage = '正在填表，请稍候...', saveTargetIndex = -1, isImportMode = false, updateMode = 'standard', isSilentMode = false, targetSheetKeys = null, requestOptions = null) {
    if (!$statusMessageSpan_ACU && $popupInstance_ACU)
        _assignUIPlaceholders_ACU({ $statusMessageSpan_ACU: $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-status-message`) });

    const statusUpdate = (text) => {
        // [新增] 静默模式下不更新状态消息
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
                    const $stopButton = jQuery_API_ACU('#acu-stop-update-btn');
                    if ($stopButton.length) {
                        $stopButton.off('click.acu_stop').on('click.acu_stop', function(e) {
                            e.stopPropagation();
                            e.preventDefault();

                            // [修复] 设置标志，告知事件监听器跳过因终止操作而触发的下一次更新检查
                            // 但只跳过一次，之后自动恢复正常
                            _set_wasStoppedByUser_ACU(true);

                            // 1. Abort network requests
                            abortAllActiveRequests_ACU();
                            // [修复] 不再调用 SillyTavern_API_ACU.stopGeneration()，
                            // 因为这会停止酒馆的生成，但填表是独立的API调用，不应影响酒馆
                            // if (SillyTavern_API_ACU && typeof SillyTavern_API_ACU.stopGeneration === 'function') {
                            //     SillyTavern_API_ACU.stopGeneration();
                            //     logDebug_ACU('Called SillyTavern_API_ACU.stopGeneration()');
                            // }
                            
                            // 2. Immediately reset UI state
                            _set_isAutoUpdatingCard_ACU(false);
                            if ($manualUpdateCardButton_ACU) {
                                $manualUpdateCardButton_ACU.prop('disabled', false).text('立即手动更新');
                            }
                            if ($statusMessageSpan_ACU) {
                                 $statusMessageSpan_ACU.text('操作已终止。');
                            }

                            // 3. Remove toast and show confirmation
                            jQuery_API_ACU(this).closest('.toast').remove();
                            showToastr_ACU('warning', '填表操作已由用户终止。');

                            // [修复] 延迟重置标志，确保只跳过因本次终止操作触发的事件
                            // 而不会影响后续正常的自动更新
                            setTimeout(() => {
                                _set_wasStoppedByUser_ACU(false);
                                logDebug_ACU('ACU: wasStoppedByUser_ACU reset after abort timeout.');
                            }, 3000);
                        });
                    } else {
                        logError_ACU('Could not find the stop button in the toast.');
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
        // _set_isAutoUpdatingCard_ACU(false;);
        // if ($manualUpdateCardButton_ACU) {
        //     $manualUpdateCardButton_ACU.prop('disabled', false).text('立即手动更新');
        // }
    }
  }

  // [重构] 手动合并纪要功能处理函数 (Medusa 模式)
  // 关键点：
  // 1. 所有批次必须全部成功完成后，才会统一写入数据库并触发世界书注入；任意一批失败都会终止并不落盘。
  // 2. AI 请求与 <tableEdit> 解析一体化放入同一重试循环，解析失败同样会触发重试而不是被视为成功。
  // 3. 明确的批次完成计数与进度文案，避免"首批成功即整体成功"的误判。
  export async function handleManualMergeSummary_ACU() {
      if (isAutoUpdatingCard_ACU) {
          showToastr_ACU('info', '后台已有任务在运行，请稍候。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE });
          return;
      }
      
      _set_wasStoppedByUser_ACU(false);

      // [关键修复] 手动合并纪要在开始前强制刷新一次内存数据库。
      // 目的：避免 UI 已显示有数据，但 currentJsonTableData_ACU 仍停留在旧状态，导致合并时读取到空表。
      // 注意：使用 loadOrCreateJsonTableFromChatHistory_ACU() + refreshMergedDataAndNotify_ACU() 的既有链路，
      // 该链路不会触发自动合并纪要（自动合并只在手动/自动更新后显式 checkAndTriggerAutoMergeSummary_ACU 调用）。
      try {
          await loadAllChatMessages_ACU();
          await loadOrCreateJsonTableFromChatHistory_ACU();
      } catch (e) {
          logWarn_ACU('[手动合并纪要] 合并前刷新数据库失败，将继续使用当前内存数据:', e);
      }

      const $countInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-target-count`);
      const $batchInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-batch-size`);
      const $startInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-start-index`);
      const $endInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-end-index`);
      const $promptInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template`);
      const $btn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-start-merge-summary`);

      const targetCount = settings_ACU.mergeTargetCount || 1;
      const batchSize = settings_ACU.mergeBatchSize || 5;
      const startIndex = Math.max(0, (settings_ACU.mergeStartIndex || 1) - 1); // 转换为0-based索引
      const endIndex = settings_ACU.mergeEndIndex ? Math.max(startIndex + 1, settings_ACU.mergeEndIndex) : null; // null表示到最后
      let promptTemplate = settings_ACU.mergeSummaryPrompt || DEFAULT_MERGE_SUMMARY_PROMPT_ACU;

      if (!promptTemplate) {
          showToastr_ACU('error', '提示词模板不能为空。');
          return;
      }
      
      const apiIsConfigured = (settings_ACU.apiMode === 'custom' && (settings_ACU.apiConfig.useMainApi || (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model))) || (settings_ACU.apiMode === 'tavern' && settings_ACU.tavernProfile);
      if (!apiIsConfigured) {
          showToastr_ACU('warning', '请先配置API连接。');
          return;
      }

      if (!currentJsonTableData_ACU) {
          showToastr_ACU('error', '数据库未加载。');
          return;
      }

      // 查找纪要表（兼容旧数据"总结表"）
      const summaryKey = Object.keys(currentJsonTableData_ACU).find(k =>
          currentJsonTableData_ACU[k].name === '纪要表' ||
          currentJsonTableData_ACU[k].name === '总结表'
      );

      if (!summaryKey) {
          showToastr_ACU('warning', '未找到"纪要表"，无法进行合并。');
          return;
      }

      let fullSummaryRows = summaryKey ? (currentJsonTableData_ACU[summaryKey].content || []).slice(1) : [];

      if (fullSummaryRows.length === 0) {
          showToastr_ACU('info', `当前没有纪要数据需要合并。`);
          return;
      }

      // 验证并调整范围
      const maxSummaryRows = fullSummaryRows.length;
      const maxRows = maxSummaryRows;

      if (startIndex >= maxRows) {
          showToastr_ACU('error', `起始条数超出可用数据范围。可用数据: ${maxRows} 条`);
          return;
      }

      const actualEndIndex = endIndex ? Math.min(endIndex, maxRows) : maxRows;
      if (startIndex >= actualEndIndex) {
          showToastr_ACU('error', '起始条数不能大于或等于终止条数。');
          return;
      }

      // 提取指定范围的数据
      let allSummaryRows = fullSummaryRows.slice(startIndex, actualEndIndex);
      const selectedRange = actualEndIndex - startIndex;

      if (allSummaryRows.length === 0) {
          showToastr_ACU('info', `指定范围内没有纪要数据需要合并。范围: 第${startIndex + 1}条 到 第${actualEndIndex}条`);
          return;
      }

      if (!confirm(`即将开始合并纪要。\n\n源数据范围: 第${startIndex + 1}条 到 第${actualEndIndex}条 (${selectedRange} 条数据)\n处理数据: ${allSummaryRows.length} 条纪要\n目标: 精简为 ${targetCount} 条\n\n注意：此操作将使用AI重写指定范围内的纪要数据，其他数据不受影响。操作不可逆！\n建议先导出JSON备份。`)) {
          return;
      }

      _set_isAutoUpdatingCard_ACU(true);
      $btn.prop('disabled', true).text('正在合并 (0%)...');

      const stopButtonHtml = `<button id="acu-merge-stop-btn" style="border: 1px solid #ffc107; color: #ffc107; background: transparent; padding: 5px 10px; border-radius: 4px; cursor: pointer; float: right; margin-left: 15px; font-size: 0.9em; transition: all 0.2s ease;" onmouseover="this.style.backgroundColor='#ffc107'; this.style.color='#1a1d24';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#ffc107';">终止</button>`;
      let progressToast = showToastr_ACU('info', `<div>正在合并纪要...${stopButtonHtml}</div>`, {
          timeOut: 0, extendedTimeOut: 0, tapToDismiss: false,
          acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE,
          onShown: function() {
              jQuery_API_ACU('#acu-merge-stop-btn').off('click.acu_stop').on('click.acu_stop', function(e) {
                  e.stopPropagation();
                  e.preventDefault();
                  _set_wasStoppedByUser_ACU(true);
                  abortAllActiveRequests_ACU();
                  if (SillyTavern_API_ACU && typeof SillyTavern_API_ACU.stopGeneration === 'function') SillyTavern_API_ACU.stopGeneration();
                  jQuery_API_ACU(this).closest('.toast').remove();
                  showToastr_ACU('warning', '合并操作已由用户终止。');
                  _set_isAutoUpdatingCard_ACU(false);
                  $btn.prop('disabled', false).text('开始合并总结');
              });
          }
      });

      try {
          const maxRows = allSummaryRows.length;
          const totalBatches = Math.ceil(maxRows / batchSize);
          
          let accumulatedSummary = [];

          // [新增] 手动合并纪要：为"第一批次"提供一个稳定的索引锚点。
          // 规则：第一批次的纪要表从"本次合并范围起点 startIndex 之前"的已有表格数据中，
          // 抽取最近 2 条作为填表基础；若不足 2 条则取现有全部；若没有则留空。
          // 注意：该逻辑仅用于手动合并纪要，不影响自动合并纪要 performAutoMergeSummary_ACU。
          const pickLastRowsBeforeIndex_ACU = (allRows, beforeIndex, count) => {
              if (!Array.isArray(allRows) || allRows.length === 0) return [];
              const end = Math.max(0, Math.min(Number.isFinite(beforeIndex) ? beforeIndex : 0, allRows.length));
              const start = Math.max(0, end - (Number.isFinite(count) ? count : 0));
              return allRows.slice(start, end);
          };

          for (let i = 0; i < totalBatches; i++) {
              if (wasStoppedByUser_ACU) throw new Error('用户终止操作');

              const startIdx = i * batchSize;
              const endIdx = startIdx + batchSize;
              const batchSummaryRows = allSummaryRows.slice(startIdx, endIdx);

              const formatRows = (rows, displayStartIndex) => rows.map((r, idx) => `[${displayStartIndex + idx}] ${r.slice(1).join(', ')}`).join('\n');
              const textA = batchSummaryRows.length > 0 ? formatRows(batchSummaryRows, (startIndex + 1) + startIdx) : "(本批次无新增纪要数据)";
              
              let textBase = "";
              const summaryTableObj = currentJsonTableData_ACU[summaryKey];
              
              const formatTableStructure = (tableName, currentRows, originalTableObj, tableIndex) => {
                  let str = `[${tableIndex}:${tableName}]\n`;
                  const headers = originalTableObj.content[0] ? originalTableObj.content[0].slice(1).map((h, i) => `[${i}:${h}]`).join(', ') : 'No Headers';
                  str += `  Columns: ${headers}\n`;
                  if (originalTableObj.sourceData) {
                      str += `  - Note: ${originalTableObj.sourceData.note || 'N/A'}\n`;
                  }
                  if (currentRows && currentRows.length > 0) {
                      currentRows.forEach((row, rIdx) => { str += `  [${rIdx}] ${row.join(', ')}\n`; });
                  } else {
                      str += `  (Table Empty - No rows yet)\n`;
                  }
                  return str + "\n";
              };

              // [优化] 为 $BASE_DATA 准备数据（仅手动合并纪要）：
              // - 第一批次：使用 startIndex 之前"原表格"中最近 2 条记录做基础（如无则为空）
              // - 后续批次：使用之前批次生成的累积条目做基础
              const summaryBaseData = (i === 0)
                  ? pickLastRowsBeforeIndex_ACU(fullSummaryRows, startIndex, 2)
                  : accumulatedSummary.slice();

              if(summaryTableObj) textBase += formatTableStructure(summaryTableObj.name, summaryBaseData, summaryTableObj, 0);

              let currentPrompt = promptTemplate.replace('$TARGET_COUNT', targetCount).replace('$A', textA).replace('$BASE_DATA', textBase);

              let aiResponseText = "";
              let lastError = null;
              const maxRetries = 3;

              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  if (wasStoppedByUser_ACU) throw new Error('用户终止操作');
                  
                  const percent = Math.floor((i / totalBatches) * 100);
                  const progressText = `正在处理批次 ${i + 1}/${totalBatches} (尝试 ${attempt}/${maxRetries})...`;
                  $btn.text(progressText);

                  // 更新toast消息显示批次进度
                  if (progressToast) {
                      const toastMessage = `<div>正在合并纪要... (批次 ${i + 1}/${totalBatches})${stopButtonHtml}</div>`;
                      progressToast.find('.toast-message').html(toastMessage);
                      // 重新绑定终止按钮事件
                      jQuery_API_ACU('#acu-merge-stop-btn').off('click.acu_stop').on('click.acu_stop', function(e) {
                          e.stopPropagation();
                          e.preventDefault();
                          _set_wasStoppedByUser_ACU(true);
                          abortAllActiveRequests_ACU();
                          if (SillyTavern_API_ACU && typeof SillyTavern_API_ACU.stopGeneration === 'function') SillyTavern_API_ACU.stopGeneration();
                          jQuery_API_ACU(this).closest('.toast').remove();
                          showToastr_ACU('warning', '合并操作已由用户终止。');
                          _set_isAutoUpdatingCard_ACU(false);
                          $btn.prop('disabled', false).text('开始合并纪要');
                      });
                  }
                  
                  let messagesToUse = JSON.parse(JSON.stringify(settings_ACU.charCardPrompt || [DEFAULT_CHAR_CARD_PROMPT_ACU]));
                  let mainPromptSegment =
                      messagesToUse.find(m => (String(m?.mainSlot || '').toUpperCase() === 'A') || m?.isMain) ||
                      messagesToUse.find(m => m && m.content && m.content.includes("你接下来需要扮演一个填表用的美杜莎"));
                  if (mainPromptSegment) {
                      mainPromptSegment.content = currentPrompt;
                  } else {
                      messagesToUse.push({ role: 'USER', content: currentPrompt });
                  }
                  const finalMessages = messagesToUse.map(m => ({ role: m.role.toLowerCase(), content: m.content }));

                  try {
                      if (settings_ACU.apiMode === 'tavern') {
                           const result = await SillyTavern_API_ACU.ConnectionManagerRequestService.sendRequest(settings_ACU.tavernProfile, finalMessages, settings_ACU.apiConfig.max_tokens || 4096);
                          if (result && result.ok) aiResponseText = result.result.choices[0].message.content;
                          else throw new Error('API请求返回不成功状态');
                      } else {
                          if (settings_ACU.apiConfig.useMainApi) {
                               aiResponseText = await TavernHelper_API_ACU.generateRaw({ ordered_prompts: finalMessages, should_stream: settings_ACU.streamingEnabled || false });
                           } else {
                                const res = await fetch(`/api/backends/chat-completions/generate`, {
                                    method: 'POST',
                                    headers: { ...SillyTavern.getRequestHeaders(), 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        "messages": finalMessages, "model": settings_ACU.apiConfig.model, "temperature": settings_ACU.apiConfig.temperature,
                                        "max_tokens": settings_ACU.apiConfig.max_tokens || 4096, "stream": settings_ACU.streamingEnabled || false, "chat_completion_source": "custom",
                                        "reverse_proxy": settings_ACU.apiConfig.url, "custom_url": settings_ACU.apiConfig.url,
                                        "custom_include_headers": settings_ACU.apiConfig.apiKey ? `Authorization: Bearer ${settings_ACU.apiConfig.apiKey}` : ""
                                    })
                                });
                                if (!res.ok) throw new Error(`API请求失败: ${res.status} ${await res.text()}`);
                                // 根据streamingEnabled设置选择响应处理方式
                                aiResponseText = await handleApiResponse_ACU(res);
                                if (!aiResponseText) throw new Error('API返回的数据格式不正确');
                           }
                       }

                       const extractResult = extractTableEditInner_ACU(aiResponseText, { allowNoTableEditTags: true });
                      if (!extractResult || !extractResult.inner) {
                          throw new Error('AI未返回有效的 <tableEdit> 块（缺少 <tableEdit> 边界或 <!-- --> 注释块不完整）。');
                      }

                      const editsString = extractResult.inner;
                      const newSummaryRows = [];
                      
                      editsString.split('\n').forEach(line => {
                          const match = line.trim().match(/insertRow\s*\(\s*(\d+)\s*,\s*(\{.*?\}|\[.*?\])\s*\)/);
                          if (match) {
                              try {
                                  const tableIdx = parseInt(match[1], 10);
                                  let rowData = JSON.parse(match[2].replace(/'/g, '"'));
                                  if (typeof rowData === 'object' && !Array.isArray(rowData)) {
                                      // 将对象格式转换为数组格式，添加null作为ID列
                                      const sortedKeys = Object.keys(rowData).sort((a,b) => parseInt(a) - parseInt(b));
                                      const dataColumns = sortedKeys.map(k => rowData[k]);
                                      rowData = [null, ...dataColumns]; // ID列(null) + 数据列
                                  }
                                  // 只处理纪要表（tableIdx === 0）
                                  if (tableIdx === 0 && summaryKey) newSummaryRows.push(rowData);
                              } catch (e) { logWarn_ACU('解析行失败:', line, e); }
                          }
                      });
                      
                      if (newSummaryRows.length === 0) {
                          throw new Error('AI返回了内容，但未能解析出任何有效的数据行。');
                      }
                      
                      // [修复] 将新批次的数据追加到累积数据中，而不是替换
                      accumulatedSummary = accumulatedSummary.concat(newSummaryRows);
                      
                      lastError = null;
                      break;
                  } catch (e) {
                      lastError = e;
                      logWarn_ACU(`批次 ${i + 1} 尝试 ${attempt} 失败: ${e.message}`);
                      if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 5000));
                  }
              }
              if (lastError) throw new Error(`批次 ${i + 1} 在 ${maxRetries} 次尝试后均失败: ${lastError.message}`);
          }

          // FINALIZATION: Only write if all batches succeeded.
          // 只替换指定范围内的数据，保持其他数据不变
          if (summaryKey && accumulatedSummary.length > 0) {
              const table = currentJsonTableData_ACU[summaryKey];
              const originalContent = table.content.slice(1); // 排除表头
              // 替换指定范围内的数据
              const newSummaryContent = [
                  ...originalContent.slice(0, startIndex), // 起始之前的保持不变
                  ...accumulatedSummary, // 替换的范围 (accumulatedSummary已经是完整行数据)
                  ...originalContent.slice(actualEndIndex) // 结束之后的保持不变
              ];
              table.content = [table.content[0], ...newSummaryContent];
          }

          const keysToSave = [summaryKey];
          await saveIndependentTableToChatHistory_ACU(SillyTavern_API_ACU.chat.length - 1, keysToSave, keysToSave);
          await updateReadableLorebookEntry_ACU(true);
          
          (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
          if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU();
          
          showToastr_ACU('success', '所有批次处理完毕，数据库已更新！', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE });

      } catch (e) {
          logError_ACU('合并过程出错:', e);
          showToastr_ACU('error', '合并过程出错: ' + e.message, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
      } finally {
          _set_isAutoUpdatingCard_ACU(false);
          $btn.prop('disabled', false).text('开始合并总结');
          _set_wasStoppedByUser_ACU(false);
          if (progressToast && toastr_API_ACU) toastr_API_ACU.clear(progressToast);
      }
  }

  async function handleManualUpdateCard_ACU() {
    if (isAutoUpdatingCard_ACU) {
      showToastr_ACU('info', '已有更新任务在后台进行中。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
      return;
    }
    
    const apiIsConfigured = (settings_ACU.apiMode === 'custom' && (settings_ACU.apiConfig.useMainApi || (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model))) || (settings_ACU.apiMode === 'tavern' && settings_ACU.tavernProfile);

    if (!apiIsConfigured) {
      showToastr_ACU('warning', '请先完成当前API模式的配置。');
      if ($popupInstance_ACU && $apiConfigAreaDiv_ACU && $apiConfigAreaDiv_ACU.is(':hidden')) {
        if ($apiConfigSectionToggle_ACU) $apiConfigSectionToggle_ACU.trigger('click');
      }
      return;
    }

    _set_isAutoUpdatingCard_ACU(true);
    if ($manualUpdateCardButton_ACU) $manualUpdateCardButton_ACU.prop('disabled', true).text('更新中...');
    
    await loadAllChatMessages_ACU();
    const liveChat = SillyTavern_API_ACU.chat || [];
    const threshold = getEffectiveAutoUpdateThreshold_ACU('manual_update');
    
    // 1. 严格按照“上下文层数”从最新消息往前读取，找出这个范围内的所有AI楼层
    const allAiMessageIndices = liveChat
        .map((msg, index) => !msg.is_user ? index : -1)
        .filter(index => index !== -1);

    // [优化] 从用户设置的读取上下文层数的最开始的楼层开始
    // slice(-threshold) 返回最后 threshold 个元素，顺序为 [oldest, ..., newest]
    // 这保证了按照时间顺序从最旧到最新进行处理
    const messagesToProcessIndices = allAiMessageIndices.slice(-threshold);
    
    // [重要修正] 确保顺序是从最旧的批次到最新的批次
    // slice(-threshold) 已经按时间正序返回了 [oldest...newest]，所以不需要 reverse
    // processUpdates_ACU 内部会按照 batchSize 切片，也是顺序处理
    // 举例：threshold=10, batchSize=2
    // indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] (0是10条里最旧的)
    // batch 1: [0, 1] -> 处理并保存到 1
    // batch 2: [2, 3] -> 读取 1 的数据库，处理 2,3，保存到 3
    // ...
    // batch 5: [8, 9] -> 读取 7 的数据库，处理 8,9，保存到 9
    // 逻辑是正确的。如果用户感觉反了，可能是因为之前的逻辑是倒序的，或者哪里有误解。
    // 现在的逻辑：messagesToProcessIndices[0] 是最旧的消息。
    
    if (messagesToProcessIndices.length === 0) {
        showToastr_ACU('info', '在指定的上下文层数内没有找到AI消息可供处理。');
        _set_isAutoUpdatingCard_ACU(false);
        if ($manualUpdateCardButton_ACU) $manualUpdateCardButton_ACU.prop('disabled', false).text('立即手动更新');
        return;
    }
    
    // [手动更新模式] 强制使用UI参数，忽略表格模板中的独立配置（频率、上下文深度、批次大小等）
    // 使用合并模式，保存时仅记录实际被修改的表，避免将未修改的表也标记为已更新
    const batchSize = settings_ACU.updateBatchSize || 2;
    
    // 获取所有表的 key（手动更新时更新所有表，但各表独立处理）
    const allSheetKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);

    // 2. 将这些楼层作为待办列表，调用统一的处理器
    // processUpdates_ACU 会根据 UI 设置的 batchSize 分成批次，按顺序处理
    // 每一批次处理完后，会将结果保存到该批次的最后一个楼层 (latest floor of the batch)
    // manual_* 模式下，processUpdates_ACU 会忽略 token 阈值，且强制覆盖
    showToastr_ACU('info', `手动更新已启动 (合并模式)，将处理最近的 ${messagesToProcessIndices.length} 条AI消息。`);
    
    // [修改] 使用 manual_independent 模式，传入所有表的 key
    const success = await processUpdates_ACU(messagesToProcessIndices, 'manual_independent', {
        targetSheetKeys: allSheetKeys,
        batchSize: batchSize
    });

    _set_isAutoUpdatingCard_ACU(false);
    if ($manualUpdateCardButton_ACU) $manualUpdateCardButton_ACU.prop('disabled', false).text('立即手动更新');
    
    if (success) {
        showToastr_ACU('success', '手动更新已成功完成！');
        await loadAllChatMessages_ACU();
        await refreshMergedDataAndNotify_ACU();

        // [新增] 在手动更新全部完成后检测自动合并总结
        try {
            await checkAndTriggerAutoMergeSummary_ACU();
        } catch (e) {
            logWarn_ACU('自动合并总结检测失败:', e);
        }
    } else {
        showToastr_ACU('error', '手动更新失败或被中断。');
    }
  }

  export function exportCombinedSettings_ACU() {
    const promptSegments = getCharCardPromptFromUI_ACU();
    if (!promptSegments || promptSegments.length === 0) {
      showToastr_ACU('warning', '没有可导出的提示词。');
      return;
    }

    try {
        // [修复] 合并导出应导出“当前模板”（localStorage/内存中的模板），并兼容旧模板缺少顺序编号的情况
        const templateObj = parseTableTemplateJson_ACU({ stripSeedRows: false });
        if (!templateObj || typeof templateObj !== 'object') {
            throw new Error('无法解析当前模板。');
        }
        const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
        ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: sheetKeys, forceRebuild: false });
        // [瘦身] 合并导出时也不带冗余字段
        const templateData = sanitizeChatSheetsObject_ACU(templateObj, { ensureMate: true });
        const combinedData = {
            prompt: promptSegments,
            template: templateData,
            mergeSummaryPrompt: settings_ACU.mergeSummaryPrompt || DEFAULT_MERGE_SUMMARY_PROMPT_ACU, // [新增] 导出合并提示词
            mergeTargetCount: settings_ACU.mergeTargetCount || 1, // [新增] 导出合并目标条数
            mergeBatchSize: settings_ACU.mergeBatchSize || 5, // [新增] 导出合并批次大小
            mergeStartIndex: settings_ACU.mergeStartIndex || 1, // [新增] 导出合并起始条数
            mergeEndIndex: settings_ACU.mergeEndIndex || null, // [新增] 导出合并终止条数
            autoMergeEnabled: settings_ACU.autoMergeEnabled || false, // [新增] 导出自动合并总结设置
            autoMergeThreshold: settings_ACU.autoMergeThreshold || 20, // [新增] 导出自动合并总结楼层数
            autoMergeReserve: settings_ACU.autoMergeReserve || 0, // [新增] 导出保留固定楼层数
            deleteStartFloor: settings_ACU.deleteStartFloor || null, // [新增] 导出删除起始楼层
            deleteEndFloor: settings_ACU.deleteEndFloor || null // [新增] 导出删除终止楼层
        };
        const jsonString = JSON.stringify(combinedData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'TavernDB_Combined_Settings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToastr_ACU('success', '合并配置已成功导出！');
    } catch (error) {
        logError_ACU('导出合并配置失败:', error);
        showToastr_ACU('error', '导出合并配置失败，请检查控制台获取详情。');
    }
  }