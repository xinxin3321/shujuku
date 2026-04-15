/**
 * presentation/triggers/settings-ui-sync/settings-ui-connect.ts
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
import { triggerAutomaticUpdateIfNeeded_ACU } from './settings-ui-trigger';

  export async function fetchModelsAndConnect_ACU() {
    if (
      !$popupInstance_ACU ||
      !$customApiUrlInput_ACU ||
      !$customApiKeyInput_ACU ||
      !$customApiModelSelect_ACU ||
      !$apiStatusDisplay_ACU
    ) {
      logError_ACU('加载模型列表失败：UI元素未初始化。');
      showToastr_ACU('error', 'UI未就绪。');
      return;
    }
    const apiUrl = String($customApiUrlInput_ACU.val() || '').trim();
    const apiKey = $customApiKeyInput_ACU.val();
    if (!apiUrl) {
      showToastr_ACU('warning', '请输入API基础URL。');
      $apiStatusDisplay_ACU.text('状态:请输入API基础URL').css('color', 'orange');
      return;
    }
    const statusUrl = `/api/backends/chat-completions/status`;
    $apiStatusDisplay_ACU.text('状态: 正在检查API端点状态...').css('color', '#61afef');
    showToastr_ACU('info', '正在检查自定义API端点状态...');

    try {
        const body = {
            "reverse_proxy": apiUrl,
            "proxy_password": "",
            "chat_completion_source": "custom",
            "custom_url": apiUrl,
            "custom_include_headers": apiKey ? `Authorization: Bearer ${apiKey}` : ""
        };

        const response = await fetch(statusUrl, {
            method: 'POST',
            headers: { ...SillyTavern.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API端点状态检查失败: ${response.status} ${response.statusText}.`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage += ` 详情: ${errorJson.error || errorJson.message || errorText}`;
            } catch (e) {
                errorMessage += ` 详情: ${errorText}`;
            }
            throw new Error(errorMessage);
        }

      const data = await response.json();
      logDebug_ACU('获取到的模型数据:', data);
      // 保存当前选中的模型
      const currentSelectedModel = settings_ACU.apiConfig.model || '';
      // 清空select并添加默认选项
      $customApiModelSelect_ACU.empty().append('<option value="">-- 请选择模型 --</option>');
      let modelsFound = false;
      let modelsList = [];
      if (data && data.models && Array.isArray(data.models)) {
          // Format from Tavern's status endpoint: { models: [...] }
          modelsList = data.models;
      } else if (data && data.data && Array.isArray(data.data)) {
          // Format from OpenAI /v1/models endpoint: { data: [{id: ...}] }
          modelsList = data.data;
      } else if (Array.isArray(data)) {
          // Format from some providers that return a direct array: [...]
          modelsList = data;
      }

      if (modelsList.length > 0) {
        modelsFound = true;
        modelsList.forEach((model: any) => {
          const modelName = typeof model === 'string' ? model : model.id;
          if (modelName) {
            const selected = modelName === currentSelectedModel ? ' selected' : '';
            $customApiModelSelect_ACU.append(`<option value="${escapeHtml_ACU(modelName)}"${selected}>${escapeHtml_ACU(modelName)}</option>`);
          }
        });
      }

      if (modelsFound) {
        // 如果之前保存的模型不在列表中，也添加进去
        if (currentSelectedModel && $customApiModelSelect_ACU.find(`option[value="${escapeHtml_ACU(currentSelectedModel)}"]`).length === 0) {
            $customApiModelSelect_ACU.append(`<option value="${escapeHtml_ACU(currentSelectedModel)}" selected>${escapeHtml_ACU(currentSelectedModel)} (已保存)</option>`);
        }
        showToastr_ACU('success', `模型列表加载成功！共加载 ${modelsList.length} 个模型。`);
      } else {
        showToastr_ACU('warning', '未能解析模型数据或列表为空。');
        $apiStatusDisplay_ACU.text('状态: 未能解析模型数据或列表为空。').css('color', 'orange');
      }
    } catch (error) {
      logError_ACU('加载模型列表时出错:', error);
      showToastr_ACU('error', `加载模型列表失败: ${error.message}`);
      $apiStatusDisplay_ACU.text(`状态: 加载模型失败 - ${error.message}`).css('color', '#ff6b6b');
    }
    updateApiStatusDisplay_ACU();
  }
  export function updateApiStatusDisplay_ACU() {
    if (!$popupInstance_ACU || !$apiStatusDisplay_ACU) return;
    if (settings_ACU.apiConfig.url && settings_ACU.apiConfig.model)
      $apiStatusDisplay_ACU.html(
        `当前URL: <span style="color:lightgreen;word-break:break-all;">${escapeHtml_ACU(
          settings_ACU.apiConfig.url,
        )}</span><br>已选模型: <span style="color:lightgreen;">${escapeHtml_ACU(settings_ACU.apiConfig.model)}</span>`,
      );
    else if (settings_ACU.apiConfig.url)
      $apiStatusDisplay_ACU.html(
        `当前URL: ${escapeHtml_ACU(settings_ACU.apiConfig.url)} - <span style="color:orange;">请加载并选择模型</span>`,
      );
    else $apiStatusDisplay_ACU.html(`<span style="color:#ffcc80;">未配置自定义API。数据库更新功能可能不可用。</span>`);
  }
  export function attemptToLoadCoreApis_ACU() {
    const parentWin: any = typeof window.parent !== 'undefined' ? window.parent : window;
    _set_SillyTavern_API_ACU(typeof parentWin.SillyTavern !== 'undefined' ? parentWin.SillyTavern : (window as any).SillyTavern);
    _set_TavernHelper_API_ACU(typeof parentWin.TavernHelper !== 'undefined' ? parentWin.TavernHelper : (window as any).TavernHelper);
    _set_jQuery_API_ACU(typeof parentWin.$ !== 'undefined' ? parentWin.$ : (window as any).jQuery);
    _set_toastr_API_ACU(parentWin.toastr || (typeof (window as any).toastr !== 'undefined' ? (window as any).toastr : null));
    _set_coreApisAreReady_ACU(!!(
      SillyTavern_API_ACU &&
      TavernHelper_API_ACU &&
      jQuery_API_ACU &&
      TavernHelper_API_ACU.getChatMessages &&
      TavernHelper_API_ACU.getLastMessageId &&
      TavernHelper_API_ACU.getCurrentCharPrimaryLorebook &&
      TavernHelper_API_ACU.getLorebookEntries &&
      typeof TavernHelper_API_ACU.triggerSlash === 'function'
    ));
    if (!toastr_API_ACU) logWarn_ACU('toastr_API_ACU is MISSING.');
    if (coreApisAreReady_ACU) logDebug_ACU('Core APIs successfully loaded/verified for AutoCardUpdater.');
    else logError_ACU('Failed to load one or more critical APIs for AutoCardUpdater.');
    return coreApisAreReady_ACU;
  }

  export async function handleNewMessageDebounced_ACU(eventType = 'unknown_acu') {
    logDebug_ACU(
      `New message event (${eventType}) detected for ACU, debouncing for ${NEW_MESSAGE_DEBOUNCE_DELAY_ACU}ms...`,
    );
    clearTimeout(newMessageDebounceTimer_ACU);
    _set_newMessageDebounceTimer_ACU(setTimeout(async () => {
      // [健全性] 如果用户已经开始对话，则解除"开场白阶段世界书注入抑制"
      try { maybeLiftWorldbookSuppression_ACU(); } catch (e) {}

      // [修复] 检查更新是否被用户手动终止，如果是，则跳过本次因终止操作而触发的更新检查
      // 注意：不要在这里重置标志，由终止按钮处理逻辑负责重置
      if (wasStoppedByUser_ACU) {
          logDebug_ACU('ACU: Skipping update check after user abort.');
          return;
      }
      logDebug_ACU('Debounced new message processing triggered for ACU.');
      if (isAutoUpdatingCard_ACU) {
        logDebug_ACU('ACU: Auto-update already in progress. Skipping.');
        return;
      }
      if (!coreApisAreReady_ACU) {
        logDebug_ACU('ACU: Core APIs not ready. Skipping.');
        return;
      }

      // [优化] 等待确认是当前角色的AI回复后再触发更新（类似剧情推进的逻辑）
      const liveChat = getChatArray_ACU();
      if (!liveChat || liveChat.length === 0) {
        logDebug_ACU('ACU: No chat data available. Skipping.');
        return;
      }

      const lastMessage = liveChat[liveChat.length - 1];
      
      // 如果最新消息不是AI回复，跳过
      if (!lastMessage || lastMessage.is_user) {
        logDebug_ACU('ACU: Last message is not an AI reply. Skipping.');
        return;
      }

      // 检查是否来自当前角色
      const activeChar = getCurrentCharacterFallback_ACU();
      const activeCharName = activeChar?.name;
      if (activeCharName && lastMessage.name && lastMessage.name !== activeCharName) {
        logDebug_ACU(`ACU: AI reply from different character (${lastMessage.name} != ${activeCharName}). Skipping.`);
        return;
      }

      await loadAllChatMessages_ACU();
      // Removed call to applyActualMessageVisibility_ACU();
      
      // [新增] 正文优化：在填表之前执行
      const config = settings_ACU.contentOptimizationSettings || {};
      if (config.enabled) {
        const lastMessageIndex = liveChat.length - 1;
        logDebug_ACU('[正文优化] 检测到AI回复，准备执行正文优化...');
        
        if (config.parallelMode) {
          // 并行执行：正文优化和填表同时进行
          logDebug_ACU('[正文优化] 并行模式已启用，正文优化与填表将同时进行...');
          await Promise.all([
            executeContentOptimization_ACU(lastMessageIndex),
            triggerAutomaticUpdateIfNeeded_ACU()
          ]);
        } else if (!config.autoApply && !config.seamlessMode) {
          // 手动确认模式：只执行正文优化，填表在用户点击应用/取消后触发
          logDebug_ACU('[正文优化] 手动确认模式：等待用户确认后再填表...');
          await executeContentOptimization_ACU(lastMessageIndex);
          // 注意：不在这里触发填表，填表在 showOptimizationDiffDialog_ACU 中用户点击应用/取消后触发
        } else {
          // 顺序执行：先完成正文优化，再进行填表
          await executeContentOptimization_ACU(lastMessageIndex);
          await triggerAutomaticUpdateIfNeeded_ACU();
        }
      } else {
        await triggerAutomaticUpdateIfNeeded_ACU();
      }
    }, NEW_MESSAGE_DEBOUNCE_DELAY_ACU));
  }

  // [重构] 核心触发逻辑：基于独立表格参数的触发检查
