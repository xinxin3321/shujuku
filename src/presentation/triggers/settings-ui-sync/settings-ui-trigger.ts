/**
 * presentation/triggers/settings-ui-sync/settings-ui-trigger.ts
 */
import { DEFAULT_CHAR_CARD_PROMPT_ACU } from '../../../shared/defaults-json.js';
import { AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU } from '../../../shared/defaults';
import { updateCardUpdateStatusDisplay_ACU } from '../../components/update-status-display';
import { getCharCardPromptFromUI_ACU, isAutoUpdatingCard_ACU, manualExtraHint_ACU, newMessageDebounceTimer_ACU, renderPromptSegments_ACU, wasStoppedByUser_ACU , _set_isAutoUpdatingCard_ACU, _set_manualExtraHint_ACU, _set_newMessageDebounceTimer_ACU} from '../../components/plot-editors';
import { showToastr_ACU } from '../../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../../shared/constants';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, jQuery_API_ACU, toastr_API_ACU, _set_SillyTavern_API_ACU, _set_TavernHelper_API_ACU, _set_jQuery_API_ACU, _set_toastr_API_ACU } from '../../../shared/host-api';
import { getChatArray_ACU, saveChatToHost_ACU } from '../../../data/gateways/chat-gateway';
import { getConnectionManagerProfiles_ACU } from '../../../data/gateways/ai-gateway';
import { getCurrentCharacterFallback_ACU } from '../../../data/gateways/host-state-gateway';
import { NEW_MESSAGE_DEBOUNCE_DELAY_ACU, allChatMessages_ACU, coreApisAreReady_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, lastTotalAiMessages_ACU, settings_ACU , _set_coreApisAreReady_ACU, _set_lastTotalAiMessages_ACU} from '../../../service/runtime/state-manager';
import { $popupInstance_ACU, $customApiUrlInput_ACU, $customApiKeyInput_ACU, $customApiModelInput_ACU, $customApiModelSelect_ACU, $maxTokensInput_ACU, $temperatureInput_ACU, $apiStatusDisplay_ACU, $charCardPromptSegmentsContainer_ACU, $autoUpdateThresholdInput_ACU, $autoUpdateTokenThresholdInput_ACU, $autoUpdateFrequencyInput_ACU, $updateBatchSizeInput_ACU, $maxConcurrentGroupsInput_ACU, $skipUpdateFloorsInput_ACU, $retainRecentLayersInput_ACU, $tableMaxRetriesInput_ACU, $manualExtraHintCheckbox_ACU } from '../../state/ui-refs';
import { saveSettingsAndNotify_ACU, loadSettingsAndRefreshUI_ACU } from '../../components/settings-ui-helpers';
import { checkAutoMergeTrigger_ACU, prepareAutoMergeBatches_ACU, executeAutoMergeBatch_ACU, finalizeAutoMerge_ACU } from '../../../service/summary/merge-logic';
import { processUpdates_ACU } from '../update-process';
import { getSortedSheetKeys_ACU } from '../../../service/template/chat-scope';
import { loadAllChatMessages_ACU } from '../../../service/worldbook/pipeline';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../../components/pipeline-ui-helpers';
import { SCRIPT_ID_PREFIX_ACU } from '../../../shared/constants';
import { escapeHtml_ACU } from '../../../shared/html-helpers';
import { topLevelWindow_ACU } from '../../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { executeContentOptimization_ACU } from '../../components/optimization-ui';
import { maybeLiftWorldbookSuppression_ACU } from '../../../service/runtime/helpers-remaining';
import { purgeOldLayerData_ACU } from './settings-ui-config';

  export async function triggerAutomaticUpdateIfNeeded_ACU() {
    logDebug_ACU('ACU Auto-Trigger: Starting independent check...');

    if (!settings_ACU.autoUpdateEnabled) {
      logDebug_ACU('ACU Auto-Trigger: Auto update is disabled via settings. Skipping.');
      return;
    }

    const apiIsConfigured = (settings_ACU.apiMode === 'custom' && (settings_ACU.apiConfig.useMainApi || (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model))) || (settings_ACU.apiMode === 'tavern' && settings_ACU.tavernProfile);

    if (!coreApisAreReady_ACU || isAutoUpdatingCard_ACU || !apiIsConfigured || !currentJsonTableData_ACU) {
      logDebug_ACU('ACU Auto-Trigger: Pre-flight checks failed.');
      return;
    }
    
    if (allChatMessages_ACU.length < 2) {
      logDebug_ACU('ACU Auto-Trigger: Chat history too short.');
      return;
    }

    let liveChat = getChatArray_ACU();
    if (!liveChat || liveChat.length === 0) return;
    const lastLiveMessage = liveChat[liveChat.length - 1];

    let totalAiMessages = liveChat.filter(m => !m.is_user).length;

    // Floor increase delay logic...
    if (totalAiMessages > lastTotalAiMessages_ACU) {
        logDebug_ACU(`ACU: AI Message count increased (${lastTotalAiMessages_ACU} -> ${totalAiMessages}). Waiting ${AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU}ms...`);
        await new Promise(resolve => setTimeout(resolve, AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU));
        
        liveChat = getChatArray_ACU();
        if (!liveChat || liveChat.length === 0) return;
        totalAiMessages = liveChat.filter(m => !m.is_user).length;
        
        _set_lastTotalAiMessages_ACU(totalAiMessages);
    } else if (totalAiMessages < lastTotalAiMessages_ACU) {
         _set_lastTotalAiMessages_ACU(totalAiMessages);
    }

    // 独立表格检查
    const tablesToUpdate = []; // [{sheetKey, updateConfig, indicesToUpdate}]
      const sheetKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);

    // 预计算所有 AI 消息索引
    const allAiMessageIndices = liveChat
        .map((msg, index) => !msg.is_user ? index : -1)
        .filter(index => index !== -1);

    // [新增] 检查数据库是否为空（初始化状态）
    let isDatabaseEmpty = true;
    for (const key of sheetKeys) {
        const table = currentJsonTableData_ACU[key];
        // 只要有一个表有数据（行数 > 1），就不算空
        if (table && table.content && table.content.length > 1) {
            isDatabaseEmpty = false;
            break;
        }
    }

    if (isDatabaseEmpty && allAiMessageIndices.length > 0) {
        logDebug_ACU('ACU Auto-Trigger: Database is empty (First Floor scenario). Will use normal frequency-based update logic.');
        // [优化] 不再强制触发所有表格的更新
        // 因为在 proceedWithCardUpdate_ACU 中已经优化了首次初始化时保存完整模板结构的逻辑
        // 即使某些表因为频率设置没有被触发，也会以空表的形式保存到聊天记录中
        // 这样后续更新就有了完整的基底
    }
    
    // [优化] 统一使用频率逻辑，无论是否是首次初始化
    {
        // 遍历每个表格，检查是否满足其独立更新条件
        for (const sheetKey of sheetKeys) {
            const table = currentJsonTableData_ACU[sheetKey];
            if (!table) continue;

            const tableConfig = table.updateConfig || {};
            const isSummary = isSummaryOrOutlineTable_ACU(table.name);
            
            // 统一的全局默认参数（不再区分标准/总结）
            const globalFrequency = settings_ACU.autoUpdateFrequency || 1;
            const globalSkip = settings_ACU.skipUpdateFloors || 0;

            // 获取该表的更新配置 (优先使用表内配置，否则使用全局默认)
            // -1 = 沿用UI全局；0 = 合法值（其中 updateFrequency=0 表示该表不参与自动更新）
            const rawDepth = Number.isFinite(tableConfig.contextDepth) ? tableConfig.contextDepth : -1;
            const rawFreq = Number.isFinite(tableConfig.updateFrequency) ? tableConfig.updateFrequency : -1;
            const rawSkip = Number.isFinite(tableConfig.skipFloors) ? tableConfig.skipFloors : -1;
            const rawBatch = Number.isFinite(tableConfig.batchSize) ? tableConfig.batchSize : -1;
            const rawGroupId = Number.isFinite(tableConfig.groupId) ? Math.trunc(tableConfig.groupId) : -1;

            // contextDepth: -1=沿用UI；0 视为"未设置/沿用UI"（避免与"禁用自动更新"的语义混淆）
            const threshold = (rawDepth === -1 || rawDepth === 0) ? (settings_ACU.autoUpdateThreshold || 3) : Math.max(0, rawDepth);
            const frequency = (rawFreq === -1) ? globalFrequency : rawFreq;
            const skipFloors = Math.max(0, (rawSkip === -1) ? globalSkip : rawSkip);
            const groupId = rawGroupId;
            // batchSize 在实际执行时使用，这里仅用于分组

            // [修复] 获取该表上次更新的 AI 楼层数：不再依赖缓存，而是直接扫描聊天记录
            // 参考 updateCardUpdateStatusDisplay_ACU 的逻辑，确保判断一致性
            let lastUpdatedAiFloor = 0;
            
            // [数据隔离核心] 获取当前隔离标签键名
            const triggerIsolationKey = getCurrentIsolationKey_ACU();

            for (let i = liveChat.length - 1; i >= 0; i--) {
                const msg = liveChat[i];
                if (msg.is_user) continue;

                let wasUpdated = false;
                
                // [优先级1] 检查新版按标签分组存储 TavernDB_ACU_IsolatedData
                if (msg.TavernDB_ACU_IsolatedData && msg.TavernDB_ACU_IsolatedData[triggerIsolationKey]) {
                    const tagData = msg.TavernDB_ACU_IsolatedData[triggerIsolationKey];
                    const modifiedKeys = tagData.modifiedKeys || [];
                    const updateGroupKeys = tagData.updateGroupKeys || [];
                    const independentData = tagData.independentData || {};
                    
                    if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
                        wasUpdated = updateGroupKeys.includes(sheetKey);
                    } else if (modifiedKeys.length > 0) {
                        wasUpdated = modifiedKeys.includes(sheetKey);
                    } else if (independentData[sheetKey]) {
                        wasUpdated = true;
                    }
                }
                
                // [优先级2] 兼容旧版存储格式 - 严格匹配隔离标签
                if (!wasUpdated) {
                    const msgIdentity = msg.TavernDB_ACU_Identity;
                    let isLegacyMatch = false;
                    if (settings_ACU.dataIsolationEnabled) {
                        isLegacyMatch = (msgIdentity === settings_ACU.dataIsolationCode);
                    } else {
                        // 关闭隔离（无标签模式）：只匹配无标识数据
                        isLegacyMatch = !msgIdentity;
                    }
                    
                    if (isLegacyMatch) {
                        const modifiedKeys = msg.TavernDB_ACU_ModifiedKeys || [];
                        const updateGroupKeys = msg.TavernDB_ACU_UpdateGroupKeys || [];
                        
                        if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
                            wasUpdated = updateGroupKeys.includes(sheetKey);
                        } else if (modifiedKeys.length > 0) {
                            wasUpdated = modifiedKeys.includes(sheetKey);
                        } else {
                            // 旧版兼容：没有 ModifiedKeys 字段时，回退到检查数据是否存在
                            if (msg.TavernDB_ACU_IndependentData && msg.TavernDB_ACU_IndependentData[sheetKey]) {
                                wasUpdated = true;
                            }
                            else if (isSummary && msg.TavernDB_ACU_SummaryData && msg.TavernDB_ACU_SummaryData[sheetKey]) {
                                wasUpdated = true;
                            }
                            else if (!isSummary && msg.TavernDB_ACU_Data && msg.TavernDB_ACU_Data[sheetKey]) {
                                wasUpdated = true;
                            }
                        }
                    }
                }

                if (wasUpdated) {
                    // 计算这是第几个 AI 回复
                    lastUpdatedAiFloor = liveChat.slice(0, i + 1).filter(m => !m.is_user).length;
                    break;
                }
            }
            
            // 计算未记录楼层数
            // [修复] 根据用户反馈，触发判断必须考虑跳过楼层。
            // 逻辑：(当前总层数 - 跳过层数) - 上次更新层数 >= 频率
            // 例如：Last=12, Freq=2, Skip=1. NextTrigger = 12 + 2 + 1 = 15.
            // 当 Total=15 时, (15 - 1) - 12 = 2 >= 2. 触发。
            
            const effectiveUnrecordedFloors = Math.max(0, (totalAiMessages - skipFloors) - lastUpdatedAiFloor);

            logDebug_ACU(`[Trigger Check] Table: ${table.name}, TotalAI: ${totalAiMessages}, Skip: ${skipFloors}, LastUpdated: ${lastUpdatedAiFloor}, Unrecorded: ${effectiveUnrecordedFloors}, Freq: ${frequency}`);

            // updateFrequency=0：该表不参与自动更新
            if (frequency > 0 && effectiveUnrecordedFloors >= frequency && threshold > 0) {
                // 需要更新
                // 计算需要更新的具体消息索引
                // 范围：从 (lastUpdatedAiFloor 对应的索引 + 1) 开始，到最新
                // 且必须在 Context Depth 范围内
                
                // 计算有效范围的截止点（跳过楼层处理）
                // 注意：globalSkip 意味着最新的 N 条消息不应被考虑进更新范围，或者说更新应该滞后 N 条。
                // 但实际上，我们通常希望跳过的是"不计算在触发条件内"的楼层，一旦触发，还是应该读取最新的。
                // 不过根据"跳过更新楼层"的定义，通常是指最新的 N 层暂不更新。
                // [修复] 计算 effectiveAiIndices 时，如果 globalSkip 为 0，slice(0, length) 是对的。
                // 但如果 globalSkip > 0，slice(0, length - skip) 也是对的。
                // 问题在于，当 globalSkip 很大，或者总楼层很少时，可能导致 effectiveAiIndices 为空。
                // 此外，contextScopeIndices 应该是基于 effectiveAiIndices 的末尾往前推，还是基于实际最新消息往前推？
                // 通常 Context Depth 是指 AI 能看到的"最新"上下文。
                // 如果我们跳过了最新的 N 层，那么 AI 看到的应该是"被跳过之后的最新"？
                // 不，contextDepth 是物理限制。AI 只能看到最新的 M 条消息。
                // 如果我们跳过了最新的 N 条，且 N < M，那么我们实际上是让 AI 去更新它"能看到但还未更新"的部分。
                // 如果 N >= M，那么我们要更新的内容已经超出了 AI 的可视范围（太旧了），理论上无法更新。
                
                // [核心重构] 跳过楼层的上下文处理逻辑
                // 用户反馈：跳过楼层参数被设置时，上下文读取就应该以跳过楼层参数设置后的对应楼层为基数往上进行读取
                
                // 1. 计算有效范围的截止点（跳过楼层处理）
                const effectiveAiIndices = skipFloors > 0
                    ? allAiMessageIndices.slice(0, -skipFloors)
                    : allAiMessageIndices;
                
                // 确定该表上次更新在 chat history 中的 index
                // lastUpdatedAiFloor 是数量，作为索引正好指向"下一个"
                const startIndexInAiArray = lastUpdatedAiFloor;
                
                logDebug_ACU(`[Trigger Check] EffIndicesLen: ${effectiveAiIndices.length}, StartIndex: ${startIndexInAiArray}`);

                if (startIndexInAiArray < effectiveAiIndices.length) {
                    const unupdatedAiIndices = effectiveAiIndices.slice(startIndexInAiArray);
                    
                    // [修复] Context Scope 的计算基准
                    // 根据用户要求，上下文读取应该以"跳过楼层后的有效末尾"为基准，往上回溯 threshold 层。
                    // 这样即使 globalSkip 很大，我们处理旧楼层时，也能读取到以该旧楼层为终点的上下文，
                    // 而不是被迫去读它可能够不着的最新实时消息。
                    
                    const contextScopeIndices = effectiveAiIndices.slice(-threshold);
                    const contextScopeSet = new Set(contextScopeIndices);
                    
                    logDebug_ACU(`[Trigger Check] Unupdated: ${unupdatedAiIndices.length}, ContextScope: ${contextScopeIndices.length}`);

                    const indicesToUpdate = unupdatedAiIndices.filter(idx => contextScopeSet.has(idx));
                    
                    if (indicesToUpdate.length > 0) {
                        tablesToUpdate.push({
                            sheetKey,
                            sheetName: table.name,
                            indices: indicesToUpdate,
                            groupId,
                            // batchSize: -1=沿用UI；<=0 兜底到 UI，避免 0 导致死循环切片
                            batchSize: (rawBatch === -1) ? (settings_ACU.updateBatchSize || 3) : ((rawBatch > 0) ? rawBatch : (settings_ACU.updateBatchSize || 3))
                        });
                    }
                } else {
                    // [调试] 如果没有需要更新的索引，记录原因
                    // logDebug_ACU(`Table ${table.name}: Skipped. Unupdated indices [${unupdatedAiIndices.join(',')}] are outside context scope [${contextScopeIndices.join(',')}].`);
                }
            }
        }
    }

    if (tablesToUpdate.length === 0) return;

    // [优化] 分组执行
    // 将待更新的表按 (groupId + indices + batchSize) 进行分组，以便不同编号的表拆分并发
    // Key: groupId + '|' + indices.join(',') + '|' + batchSize
    const updateGroups: Record<string, any> = {};
    
    tablesToUpdate.forEach(item => {
        const key = item.groupId + '|' + item.indices.join(',') + '|' + item.batchSize;
        if (!updateGroups[key]) {
            updateGroups[key] = {
                indices: item.indices,
                batchSize: item.batchSize,
                groupId: item.groupId,
                sheetKeys: [],
                sheetNames: []
            };
        }
        updateGroups[key].sheetKeys.push(item.sheetKey);
        updateGroups[key].sheetNames.push(item.sheetName);
    });

    // 执行更新
    const groupKeys = Object.keys(updateGroups);
    if (groupKeys.length > 0) {
        const totalGroups = groupKeys.length;
        const maxConcurrentGroups = Math.max(1, settings_ACU.maxConcurrentGroups || 1);
        const needsChunking = totalGroups > maxConcurrentGroups;
        if (needsChunking) {
            showToastr_ACU('info', `检测到 ${tablesToUpdate.length} 个表格需要更新，将分批并发处理 ${totalGroups} 组（每批最多 ${maxConcurrentGroups} 组）。`);
        } else {
            showToastr_ACU('info', `检测到 ${tablesToUpdate.length} 个表格需要更新，将并发处理 ${totalGroups} 组。`);
        }
        
        _set_isAutoUpdatingCard_ACU(true);
        
        const failedGroupKeys = [];
        for (let start = 0; start < groupKeys.length; start += maxConcurrentGroups) {
            const chunkKeys = groupKeys.slice(start, start + maxConcurrentGroups);
            const groupPromises = chunkKeys.map(key => (async () => {
                const group = updateGroups[key];
                // 构造一个临时的 updateMode 对象或字符串，传递给 processUpdates_ACU
                // 这里我们需要一种方式告诉 processUpdates_ACU 只更新特定的 sheetKeys
                // 我们将通过一个新的参数 'specific_sheets' 传递
                
                logDebug_ACU(`[Parallel] Processing group update for groupId=${group.groupId}, sheets: ${group.sheetNames.join(', ')}`);
                
                const success = await processUpdates_ACU(group.indices, 'auto_independent', {
                    targetSheetKeys: group.sheetKeys,
                    batchSize: group.batchSize,
                    requestOptions: { skipProfileSwitch: true, forceDirectApi: true }
                });
                
                return { key, success, sheetNames: group.sheetNames };
            })());
            
            const results = await Promise.allSettled(groupPromises);
            results.forEach((result, idx) => {
                if (result.status === 'rejected' || !result.value?.success) {
                    failedGroupKeys.push(chunkKeys[idx]);
                }
            });
        }
        
        if (failedGroupKeys.length > 0) {
            logWarn_ACU(`并发分组更新失败 ${failedGroupKeys.length}/${totalGroups} 组。`);
            showToastr_ACU('warning', `并发分组更新有 ${failedGroupKeys.length} 组失败，请查看日志。`);
        }
        
        // [核心修复] 并发更新完成后统一刷新数据链条
        logDebug_ACU(`All group updates completed. Forcing data refresh...`);
        await loadAllChatMessages_ACU();
        await refreshMergedDataAndNotifyWithUI_ACU();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        _set_isAutoUpdatingCard_ACU(false);
        // 最后再刷新一次，确保 UI 状态最新
        await refreshMergedDataAndNotifyWithUI_ACU();

        // [新增] 在自动更新全部完成后检测自动合并总结
        try {
            const trigger = checkAutoMergeTrigger_ACU();
            if (trigger.shouldTrigger) {
                const prepared = prepareAutoMergeBatches_ACU({
                    startIndex: 0, endIndex: trigger.mergeCount, targetCount: 1,
                    batchSize: 5, promptTemplate: '', isAutoMode: true,
                });
                let acc = [];
                for (let i = 0; i < prepared.batches.length; i++) {
                    showToastr_ACU('info', `自动合并纪要进行中... (批次 ${i + 1}/${prepared.batches.length})`, { timeOut: 0, extendedTimeOut: 0, tapToDismiss: false });
                    const batchResult = await executeAutoMergeBatch_ACU(prepared, prepared.batches[i], acc);
                    acc = batchResult.accumulatedSummary;
                }
                await finalizeAutoMerge_ACU(prepared, acc);
                showToastr_ACU('success', '自动合并纪要完成！');
                try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate(); } catch (_) {}
            }
            if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU();
        } catch (e) {
            logWarn_ACU('自动合并总结检测失败:', e);
        }

        // [新增] 自动更新完成后，检查并清理超出保留层数的旧数据
        try {
            await purgeOldLayerData_ACU();
        } catch (e) {
            logWarn_ACU('清理旧层数据失败:', e);
        }
    }
  }

  // [新增] 手动更新时采集一次性额外提示词
  export function collectManualExtraHint_ACU() {
      _set_manualExtraHint_ACU('');
      if (!$manualExtraHintCheckbox_ACU || !$manualExtraHintCheckbox_ACU.length) return;
      if (!$manualExtraHintCheckbox_ACU.is(':checked')) return;

      const userInput = prompt('请输入本次手动填表的额外提示词（可留空）：', '');
      const trimmed = (userInput || '').trim();
      if (!trimmed) return;

      _set_manualExtraHint_ACU(`以下为用户的额外填表要求，请严格遵守：${trimmed}`);
  }

  // [新增] 获取当前选中的手动更新表格列表（无效或为空则回退为全部表）
  export function getSelectedManualSheetKeys_ACU() {
      if (!currentJsonTableData_ACU) return [];
      const availableKeys = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
      const saved = Array.isArray(settings_ACU.manualSelectedTables) ? settings_ACU.manualSelectedTables : [];

      // 未曾手动选择过：默认全选
      if (!settings_ACU.hasManualSelection) return availableKeys;

      const validSaved = saved.filter((k: string) => availableKeys.includes(k));

      // 已手动选择过：严格按保存的交集，不再自动补全新表，防止回退全选
      return validSaved;
  }

