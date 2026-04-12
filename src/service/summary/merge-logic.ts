// merge-logic.ts


import { DEFAULT_CHAR_CARD_PROMPT_ACU, DEFAULT_MERGE_SUMMARY_PROMPT_ACU } from '../../data/models/defaults-json.js';
import { ACU_TOAST_CATEGORY_ACU, showToastr_ACU } from '../../presentation/theme/toast';
import { handleApiResponse_ACU } from '../ai/prompt-builder';
import { SillyTavern_API_ACU, currentJsonTableData_ACU, settings_ACU } from '../runtime/state-manager';
import { updateReadableLorebookEntry_ACU } from '../worldbook/pipeline';
import { topLevelWindow_ACU } from '../../shared/env';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { saveIndependentTableToChatHistory_ACU } from '../../data/repositories/table-repo';
import { updateCardUpdateStatusDisplay_ACU } from '../../presentation/components/update-status-display';
import { extractTableEditInner_ACU } from '../ai/prompt-builder';

export   async function checkAndTriggerAutoMergeSummary_ACU() {
      if (!settings_ACU.autoMergeEnabled) return;
      
      // 查找纪要表（兼容旧数据"总结表"）
      const summaryKey = Object.keys(currentJsonTableData_ACU).find(k =>
          currentJsonTableData_ACU[k].name === '纪要表' ||
          currentJsonTableData_ACU[k].name === '总结表'
      );
      
      if (!summaryKey) return;
      
      // 计算条目数时排除自动合并生成的条目（以auto_merged标记结尾的行）
      const summaryCount = summaryKey ? (currentJsonTableData_ACU[summaryKey].content || [])
          .slice(1)
          .filter(row => !row || row[row.length - 1] !== 'auto_merged')
          .length : 0;
      
      const threshold = settings_ACU.autoMergeThreshold || 20;
      const reserve = settings_ACU.autoMergeReserve || 0;
      
      // 检查是否达到触发条件：纪要表超过阈值+保留条数
      const triggerThreshold = threshold + reserve;
      if (summaryCount >= triggerThreshold) {
          // 计算实际需要合并的条数（保留条数）
          const mergeCount = summaryCount - reserve;

          if (mergeCount > 0) {
              logDebug_ACU(`触发自动合并纪要: 纪要表${summaryCount}条, 保留${reserve}条, 合并${mergeCount}条`);

              // 显示等待提示（合并类白名单）
              const waitMessage = `检测到数据条数已达到自动合并阈值，正在进行合并纪要...\n\n请务必等待合并纪要完成后再进入下个AI楼层！\n\n(合并前: 纪要${summaryCount}条 → 保留后${reserve}条 + 合并前${mergeCount}条精简为1条)`;
              const waitToast = showToastr_ACU('info', waitMessage, {
                timeOut: 0,
                extendedTimeOut: 0,
                tapToDismiss: false,
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE,
              });

              try {
                  // 准备自动合并参数
                  const autoMergeOptions = {
                      startIndex: 0, // 从开头开始合并（前mergeCount条）
                      endIndex: mergeCount, // 合并前mergeCount条
                      targetCount: 1, // 默认合并为1条
                      batchSize: settings_ACU.mergeBatchSize || 5,
                      promptTemplate: settings_ACU.mergeSummaryPrompt || DEFAULT_MERGE_SUMMARY_PROMPT_ACU,
                      isAutoMode: true // 标记为自动模式
                  };

                  await performAutoMergeSummary_ACU(autoMergeOptions);

                  // 清除等待提示框
                  if (waitToast && toastr_API_ACU) {
                      toastr_API_ACU.clear(waitToast);
                  }

                  showToastr_ACU('success', '自动合并纪要完成！', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE });
              } catch (e) {
                  logError_ACU('自动合并纪要失败:', e);

                  // 清除等待提示框
                  if (waitToast && toastr_API_ACU) {
                      toastr_API_ACU.clear(waitToast);
                  }

                  showToastr_ACU('error', '自动合并纪要失败: ' + e.message, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
              }
          }
      }
  }


export   async function performAutoMergeSummary_ACU(options) {
      const { startIndex, endIndex, targetCount, batchSize, promptTemplate, isAutoMode } = options;

      // 查找纪要表（兼容旧数据"总结表"）
      const summaryKey = Object.keys(currentJsonTableData_ACU).find(k =>
          currentJsonTableData_ACU[k].name === '纪要表' ||
          currentJsonTableData_ACU[k].name === '总结表'
      );

      if (!summaryKey) throw new Error('未找到纪要表');

      // 获取指定范围的数据（排除自动合并生成的条目）
      let allSummaryRows = summaryKey ? (currentJsonTableData_ACU[summaryKey].content || [])
          .slice(1)
          .filter(row => !row || row[row.length - 1] !== 'auto_merged') : [];

      // 提取指定范围的数据
      allSummaryRows = allSummaryRows.slice(startIndex, endIndex);

      if (allSummaryRows.length === 0) return;

      const maxRows = allSummaryRows.length;
      const totalBatches = Math.ceil(maxRows / batchSize);

      let accumulatedSummary = [];
      let progressToast = null;

      try {
          // 处理批次
          for (let i = 0; i < totalBatches; i++) {
              const startIdx = i * batchSize;
              const endIdx = startIdx + batchSize;
              const batchSummaryRows = allSummaryRows.slice(startIdx, endIdx);

              // 更新进度提示
              if (progressToast) {
                  progressToast.remove();
              }
              const progressMessage = `自动合并纪要进行中... (批次 ${i + 1}/${totalBatches})`;
              if (isAutoMode) {
                  progressToast = showToastr_ACU('info', progressMessage, {
                    timeOut: 0,
                    extendedTimeOut: 0,
                    tapToDismiss: false,
                    acuToastCategory: ACU_TOAST_CATEGORY_ACU.MERGE_TABLE,
                  });
              }

          const formatRows = (rows, globalStartIndex) => rows.map((r, idx) => `[${globalStartIndex + idx}] ${r.slice(1).join(', ')}`).join('\n');
          const textA = batchSummaryRows.length > 0 ? formatRows(batchSummaryRows, (startIndex + 1) + startIdx) : "(本批次无新增纪要数据)";

          let textBase = "";
          const summaryTableObj = currentJsonTableData_ACU[summaryKey];

          const formatTableStructure = (tableName, currentRows, originalTableObj) => {
              let str = `[0:${tableName}]\n`;
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

          // [修复] 自动合并纪要：$BASE_DATA 的"固定基底"要取"最新的 auto_merged"。
          // 重要：auto_merged 行的 ID 列（row[0]）在部分路径下会是 null，导致基于 row[0]/autoMergedOrder 的排序失效，
          // 从而可能误选到最早的 AM0001。这里改为优先按"编码索引 AMxxxx"的数值大小排序，取最大者作为最新。
          // 若无法解析 AM 编码，则回退到存储顺序的末尾 N 条。
          const getExistingAutoMergedRows = (tableObj, count = 1) => {
              if (!tableObj || !tableObj.content) return [];

              const allRows = tableObj.content.slice(1); // 排除表头
              const autoMergedRows = allRows.filter(row => row && row[row.length - 1] === 'auto_merged');
               if (!autoMergedRows.length) return [];

               const n = Number.isFinite(count) ? Math.max(0, count) : 0;
               if (n <= 0) return [];

               // 1) 优先按 AM 编码排序（更符合"最新合并纪要"的语义）
               const parseAmNumber = (row) => {
                   if (!Array.isArray(row)) return null;
                   // 常见：最后一列是 'auto_merged'，其前一列是 'AM0001' / 'AM0012' 等
                   const candidates = row.slice(1).filter(v => typeof v === 'string');
                   for (let i = candidates.length - 1; i >= 0; i--) {
                       const m = candidates[i].trim().match(/^AM(\d+)\b/i);
                       if (m) return parseInt(m[1], 10);
                   }
                   // 兜底：整行拼接再找
                   const joined = row.slice(1).join(' ');
                   const m2 = joined.match(/AM(\d+)/i);
                   return m2 ? parseInt(m2[1], 10) : null;
               };

               const withAm = autoMergedRows
                   .map(r => ({ row: r, am: parseAmNumber(r) }))
                   .filter(x => Number.isFinite(x.am));

               if (withAm.length) {
                   withAm.sort((a, b) => a.am - b.am); // 旧→新
                   return withAm.slice(-n).map(x => x.row);
               }

               // 2) 回退：如果解析不到 AM 编码，再尝试 autoMergedOrder（可能也会因为 row[0]=null 而失效）
               const autoMergedOrder = settings_ACU.autoMergedOrder && settings_ACU.autoMergedOrder[summaryKey] ? settings_ACU.autoMergedOrder[summaryKey] : [];

              // 按照固定顺序排列 auto_merged 条目
              const sortedAutoMergedRows = [];
              autoMergedOrder.forEach(rowIndex => {
                  const row = autoMergedRows.find(r => r && r[0] === rowIndex);
                  if (row) sortedAutoMergedRows.push(row);
              });

              // 添加新生成的 auto_merged 条目（如果有的话）
              autoMergedRows.forEach(row => {
                  if (row && !sortedAutoMergedRows.some(r => r && r[0] === row[0])) {
                      sortedAutoMergedRows.push(row);
                  }
              });

               const fallbackBase = sortedAutoMergedRows.length ? sortedAutoMergedRows : autoMergedRows;
               return fallbackBase.slice(-n); // 末尾(最新)N条（按当前存储顺序）
          };

          // [关键] 自动合并时，$BASE_DATA = 数据库中已有的 auto_merged 条目 + 本次任务之前批次生成的条目
          const existingSummaryAutoMerged = summaryTableObj ? getExistingAutoMergedRows(summaryTableObj, 1) : [];
          
          // 合并已有的 auto_merged 条目和本次任务之前批次生成的条目
          const summaryBaseData = [...existingSummaryAutoMerged, ...accumulatedSummary];

          if(summaryTableObj) textBase += formatTableStructure(summaryTableObj.name, summaryBaseData, summaryTableObj);

          let currentPrompt = promptTemplate.replace('$TARGET_COUNT', targetCount).replace('$A', textA).replace('$BASE_DATA', textBase);

          // 调用AI API（复用现有的逻辑）
          let aiResponseText = "";
          const maxRetries = 3;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                  const messagesToUse = JSON.parse(JSON.stringify(settings_ACU.charCardPrompt || [DEFAULT_CHAR_CARD_PROMPT_ACU]));
                  const mainPromptSegment =
                      messagesToUse.find(m => (String(m?.mainSlot || '').toUpperCase() === 'A') || m?.isMain) ||
                      messagesToUse.find(m => m && m.content && m.content.includes("你接下来需要扮演一个填表用的美杜莎"));
                  if (mainPromptSegment) {
                      mainPromptSegment.content = currentPrompt;
                  } else {
                      messagesToUse.push({ role: 'USER', content: currentPrompt });
                  }
                  const finalMessages = messagesToUse.map(m => ({ role: m.role.toLowerCase(), content: m.content }));

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
                                  const sortedKeys = Object.keys(rowData).sort((a,b) => parseInt(a) - parseInt(b));
                                  const dataColumns = sortedKeys.map(k => rowData[k]);
                                  rowData = [null, ...dataColumns];
                              }

                              // [新增] 为自动合并纪要生成的条目添加标记，防止重复参与合并
                              if (isAutoMode) {
                                  rowData.push('auto_merged');
                              }

                              // 只处理纪要表（tableIdx === 0）
                              if (tableIdx === 0 && summaryKey) newSummaryRows.push(rowData);
                          } catch (e) { logWarn_ACU('解析行失败:', line, e); }
                      }
                  });

                  if (newSummaryRows.length === 0) {
                      throw new Error('AI返回了内容，但未能解析出任何有效的数据行。');
                  }

                  accumulatedSummary = accumulatedSummary.concat(newSummaryRows);
                  break;

              } catch (e) {
                  logWarn_ACU(`自动合并批次 ${i + 1} 尝试 ${attempt} 失败: ${e.message}`);
                  if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 5000));
              }
          }

          if (accumulatedSummary.length === 0) {
              throw new Error(`批次 ${i + 1} 在 ${maxRetries} 次尝试后均失败`);
          }
      }

      // 应用合并结果：保留后面的数据，替换前面的合并结果
      // 注意：endIndex是基于过滤后的数据索引，需要转换为原始数据的索引
      if (summaryKey && accumulatedSummary.length > 0) {
          const table = currentJsonTableData_ACU[summaryKey];
          const originalContent = table.content.slice(1);

          // 找到原始数据中第endIndex个非auto_merged条目的位置
          let actualEndIndex = 0;
          let foundCount = 0;
          for (let i = 0; i < originalContent.length; i++) {
              const row = originalContent[i];
              if (!row || row[row.length - 1] !== 'auto_merged') {
                  foundCount++;
                  if (foundCount === endIndex) {
                      actualEndIndex = i + 1; // +1因为slice是到该位置之前
                      break;
                  }
              }
          }

          // 重新组织数据：保留原有auto_merged条目，然后添加新的合并结果
          const existingAutoMergedRows = originalContent.filter(row => row && row[row.length - 1] === 'auto_merged');
          const remainingRows = originalContent.slice(actualEndIndex);

          const newSummaryContent = [
              ...existingAutoMergedRows, // 原有的auto_merged条目
              ...accumulatedSummary, // 新的合并结果
              ...remainingRows.filter(row => !row || row[row.length - 1] !== 'auto_merged') // 剩余的非auto_merged条目
          ];
          table.content = [table.content[0], ...newSummaryContent];

          // [优化] 更新 auto_merged 顺序记录，为新生成的条目添加顺序记录
          if (!settings_ACU.autoMergedOrder) settings_ACU.autoMergedOrder = {};
          if (!settings_ACU.autoMergedOrder[summaryKey]) settings_ACU.autoMergedOrder[summaryKey] = [];

          const orderList = settings_ACU.autoMergedOrder[summaryKey];
          accumulatedSummary.forEach(row => {
              if (row && row[row.length - 1] === 'auto_merged' && row[0] !== null && row[0] !== undefined && !orderList.includes(row[0])) {
                  orderList.push(row[0]);
              }
          });
      }

      // 保存并更新
      const keysToSave = [summaryKey];
      await saveIndependentTableToChatHistory_ACU(SillyTavern_API_ACU.chat.length - 1, keysToSave, keysToSave);
      await updateReadableLorebookEntry_ACU(true);

      topLevelWindow_ACU.AutoCardUpdaterAPI._notifyTableUpdate();
      if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU();

      // 清除进度提示框
      if (progressToast) {
          progressToast.remove();
      }
      } catch (e) {
          // 清除进度提示框
          if (progressToast) {
              progressToast.remove();
          }
          throw e;
      }
  }
