/**
 * presentation/triggers/settings-ui-sync/settings-ui-trigger.ts
 */
import { DEFAULT_CHAR_CARD_PROMPT_ACU } from '../../../shared/defaults-json.js';
import { AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU } from '../../../shared/defaults';
import { updateCardUpdateStatusDisplay_ACU } from '../../components/update-status-display';
import { getCharCardPromptFromUI_ACU, manualExtraHint_ACU, newMessageDebounceTimer_ACU, renderPromptSegments_ACU, _set_manualExtraHint_ACU, _set_newMessageDebounceTimer_ACU} from '../../components/plot-editors';
import { showToastr_ACU } from '../../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../../shared/constants';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, toastr_API_ACU, _set_SillyTavern_API_ACU, _set_TavernHelper_API_ACU, _set_jQuery_API_ACU, _set_toastr_API_ACU } from '../../../shared/host-api';
import { jQuery_API_ACU } from '../../dom-utils';
import { getChatArray_ACU, saveChatToHost_ACU } from '../../../service/chat/chat-service';
import { getConnectionManagerProfiles_ACU } from '../../../service/ai/ai-service';
import { getCurrentCharacterFallback_ACU } from '../../../service/host/host-state-service';
import { NEW_MESSAGE_DEBOUNCE_DELAY_ACU, allChatMessages_ACU, coreApisAreReady_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, isAutoUpdatingCard_ACU, lastTotalAiMessages_ACU, settings_ACU, wasStoppedByUser_ACU, _set_coreApisAreReady_ACU, _set_isAutoUpdatingCard_ACU, _set_lastTotalAiMessages_ACU, _set_wasStoppedByUser_ACU } from '../../../service/runtime/state-manager';
import { $popupInstance_ACU, $customApiUrlInput_ACU, $customApiKeyInput_ACU, $customApiModelInput_ACU, $customApiModelSelect_ACU, $maxTokensInput_ACU, $temperatureInput_ACU, $apiStatusDisplay_ACU, $charCardPromptSegmentsContainer_ACU, $autoUpdateThresholdInput_ACU, $autoUpdateTokenThresholdInput_ACU, $autoUpdateFrequencyInput_ACU, $updateBatchSizeInput_ACU, $maxConcurrentGroupsInput_ACU, $skipUpdateFloorsInput_ACU, $retainRecentLayersInput_ACU, $tableMaxRetriesInput_ACU, $manualExtraHintCheckbox_ACU } from '../../state/ui-refs';
import { saveSettingsAndNotify_ACU, loadSettingsAndRefreshUI_ACU } from '../../components/settings-ui-helpers';
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
import { buildAutoUpdatePlan_ACU, checkAutoUpdatePreConditions_ACU, executeAutoUpdatePlan_ACU, handleFloorIncreaseDelay_ACU } from '../../../service/table/update-scheduler';

  export async function triggerAutomaticUpdateIfNeeded_ACU() {
    logDebug_ACU('ACU Auto-Trigger: Starting independent check...');

    // [重构] 调用 service 层前置检查
    const preCheck = checkAutoUpdatePreConditions_ACU(
        settings_ACU,
        coreApisAreReady_ACU,
        isAutoUpdatingCard_ACU,
        currentJsonTableData_ACU,
        allChatMessages_ACU.length
    );
    if (!preCheck.canProceed) {
      logDebug_ACU(`ACU Auto-Trigger: ${preCheck.reason} Skipping.`);
      return;
    }

    let liveChat = getChatArray_ACU();
    if (!liveChat || liveChat.length === 0) return;

    let totalAiMessages = liveChat.filter(m => !m.is_user).length;

    // [重构] 调用 service 层楼层增加延迟逻辑
    const delayResult = await handleFloorIncreaseDelay_ACU(
        totalAiMessages,
        lastTotalAiMessages_ACU,
        AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU,
        getChatArray_ACU,
        _set_lastTotalAiMessages_ACU
    );
    if (delayResult === null) return; // chat 为空
    if (delayResult) {
        liveChat = delayResult.liveChat;
        totalAiMessages = delayResult.totalAiMessages;
    }

    // [重构] 调用 service 层构建更新计划
    const triggerIsolationKey = getCurrentIsolationKey_ACU();
    const plan = buildAutoUpdatePlan_ACU(liveChat, currentJsonTableData_ACU, settings_ACU, triggerIsolationKey);
    if (plan.tablesToUpdate.length === 0) return;

    // UI：显示开始 toast
    const totalGroups = Object.keys(plan.updateGroups).length;
    const maxConcurrentGroups = Math.max(1, settings_ACU.maxConcurrentGroups || 1);
    if (totalGroups > maxConcurrentGroups) {
        showToastr_ACU('info', `检测到 ${plan.tablesToUpdate.length} 个表格需要更新，将分批并发处理 ${totalGroups} 组（每批最多 ${maxConcurrentGroups} 组）。`);
    } else {
        showToastr_ACU('info', `检测到 ${plan.tablesToUpdate.length} 个表格需要更新，将并发处理 ${totalGroups} 组。`);
    }

    // 调用 service 层执行更新计划，传入纯业务操作委托（不含 UI 操作）
    _set_wasStoppedByUser_ACU(false);
    const result = await executeAutoUpdatePlan_ACU(
        plan,
        settings_ACU,
        _set_isAutoUpdatingCard_ACU,
        {
            processUpdates: (indices, mode, options) => processUpdates_ACU(indices, mode, options),
            refreshData: () => refreshMergedDataAndNotifyWithUI_ACU(),
            loadAllChatMessages: () => loadAllChatMessages_ACU(),
            purgeOldLayerData: () => purgeOldLayerData_ACU(),
            shouldStop: () => wasStoppedByUser_ACU,
        }
    );

    // UI：根据返回值显示结果
    if (result.failedGroups > 0) {
        showToastr_ACU('warning', `并发分组更新有 ${result.failedGroups} 组失败，请查看日志。`);
    }
    if (result.autoMergeTriggered && result.autoMergeSuccess) {
        showToastr_ACU('success', '自动合并纪要完成！');
        try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate(); } catch (_) {}
    }
    if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU();
  }

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

