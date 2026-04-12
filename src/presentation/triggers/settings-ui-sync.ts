import { DEFAULT_CHAR_CARD_PROMPT_ACU } from '../../data/models/defaults-json.js';
import { AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU } from '../../data/models/defaults';
import { getCharCardPromptFromUI_ACU, isAutoUpdatingCard_ACU, manualExtraHint_ACU, newMessageDebounceTimer_ACU, renderPromptSegments_ACU, wasStoppedByUser_ACU , _set_isAutoUpdatingCard_ACU, _set_manualExtraHint_ACU, _set_newMessageDebounceTimer_ACU} from '../components/plot-editors';
import { ACU_TOAST_CATEGORY_ACU, showToastr_ACU } from '../theme/toast';
import { NEW_MESSAGE_DEBOUNCE_DELAY_ACU, SillyTavern_API_ACU, TavernHelper_API_ACU, jQuery_API_ACU, toastr_API_ACU, $popupInstance_ACU, $customApiUrlInput_ACU, $customApiKeyInput_ACU, $customApiModelInput_ACU, $customApiModelSelect_ACU, $maxTokensInput_ACU, $temperatureInput_ACU, $apiStatusDisplay_ACU, $charCardPromptSegmentsContainer_ACU, $autoUpdateThresholdInput_ACU, $autoUpdateTokenThresholdInput_ACU, $autoUpdateFrequencyInput_ACU, $updateBatchSizeInput_ACU, $maxConcurrentGroupsInput_ACU, $skipUpdateFloorsInput_ACU, $retainRecentLayersInput_ACU, $tableMaxRetriesInput_ACU, $manualExtraHintCheckbox_ACU, allChatMessages_ACU, coreApisAreReady_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, lastTotalAiMessages_ACU, settings_ACU , _set_coreApisAreReady_ACU, _set_SillyTavern_API_ACU, _set_TavernHelper_API_ACU, _set_jQuery_API_ACU, _set_toastr_API_ACU, _set_lastTotalAiMessages_ACU} from '../../service/runtime/state-manager';
import { loadSettingsAndRefreshUI_ACU, saveSettings_ACU } from '../../service/settings/settings-service';
import { checkAndTriggerAutoMergeSummary_ACU } from '../../service/summary/merge-logic';
import { processUpdates_ACU } from '../../service/table/update-process';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import { loadAllChatMessages_ACU, refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { executeContentOptimization_ACU } from '../components/optimization-ui';
import { maybeLiftWorldbookSuppression_ACU } from '../../service/runtime/helpers-remaining';
/**
 * presentation/triggers/settings-ui-sync.ts — UI读写/保存/刷新函数
 * 从 service/runtime/helpers-remaining.ts 提取的纯 UI 函数
 */

  // --- 循环 UI ---

  /**
   * 更新循环UI状态
   */
  export function updateLoopUIStatus_ACU(isRunning) {
    if (!$popupInstance_ACU) return;
    const $startBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-start-loop-btn`);
    const $stopBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-stop-loop-btn`);
    const $statusText = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-loop-status-text`);
    const $timerDisplay = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-loop-timer-display`);

    if (isRunning) {
      $startBtn.hide();
      $stopBtn.css('display', 'inline-flex').show();
      $statusText.text('运行中').css('color', 'var(--green, #4CAF50)');
      $timerDisplay.show();
    } else {
      $stopBtn.hide();
      $startBtn.css('display', 'inline-flex').show();
      $statusText.text('已停止').css('color', 'var(--red, #f44336)');
      $timerDisplay.hide().text('');
    }
  }

  /**
   * 更新循环倒计时显示
   */
  export function updateLoopTimerDisplay_ACU(timeLeftFormatted) {
    if (!$popupInstance_ACU) return;
    $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-loop-timer-display`).text(`(剩余: ${timeLeftFormatted})`);
  }


  // --- API / 设置 UI ---
  export function updateApiModeView_ACU(apiMode) {
    if (!$popupInstance_ACU) return;
    const $customApiBlock = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-custom-api-settings-block`);
    const $tavernApiBlock = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-block`);

    if (apiMode === 'tavern') {
        $customApiBlock.hide();
        $tavernApiBlock.show();
        loadTavernApiProfiles_ACU();
    } else { // custom
        $customApiBlock.show();
        $tavernApiBlock.hide();
    }
  }

  export function updateCustomApiInputsState_ACU() {
    if (!$popupInstance_ACU) return;
    const useMainApi = settings_ACU.apiConfig.useMainApi;
    const $customApiFields = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-custom-api-fields`);
    if (useMainApi) {
        $customApiFields.css('opacity', '0.5');
        $customApiFields.find('input, select, button').prop('disabled', true);
    } else {
        $customApiFields.css('opacity', '1.0');
        $customApiFields.find('input, select, button').prop('disabled', false);
    }
  }

  export async function loadTavernApiProfiles_ACU() {
    if (!$popupInstance_ACU) return;
    const $select = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-select`);
    const currentProfileId = settings_ACU.tavernProfile;
    
    $select.empty().append('<option value="">-- 请选择一个酒馆预设 --</option>');

    try {
        const tavernProfiles = SillyTavern_API_ACU.extensionSettings?.connectionManager?.profiles || [];
        if (!tavernProfiles || tavernProfiles.length === 0) {
            $select.append(jQuery_API_ACU('<option>', { value: '', text: '未找到酒馆预设', disabled: true }));
            return;
        }

        let foundCurrentProfile = false;
        tavernProfiles.forEach(profile => {
            if (profile.api && profile.preset) { // Ensure it's a valid API profile
                const option = jQuery_API_ACU('<option>', {
                    value: profile.id,
                    text: profile.name || profile.id,
                    selected: profile.id === currentProfileId
                });
                $select.append(option);
                if (profile.id === currentProfileId) {
                    foundCurrentProfile = true;
                }
            }
        });

        if (currentProfileId && foundCurrentProfile) {
             $select.val(currentProfileId);
        }

    } catch (error) {
        logError_ACU('加载酒馆API预设失败:', error);
        showToastr_ACU('error', '无法加载酒馆API预设列表。');
    }
  }

  export function saveApiConfig_ACU() {
    if (!$popupInstance_ACU || !$customApiUrlInput_ACU || !$customApiKeyInput_ACU || !$customApiModelInput_ACU) {
      logError_ACU('保存API配置失败：UI元素未初始化。');
      return;
    }
    const url = $customApiUrlInput_ACU.val().trim();
    const apiKey = $customApiKeyInput_ACU.val();
    const model = $customApiModelInput_ACU.val().trim();
    const max_tokens = parseInt($maxTokensInput_ACU.val(), 10);
    const temperature = parseFloat($temperatureInput_ACU.val());


    if (!url) {
      showToastr_ACU('warning', 'API URL 不能为空。');
      return;
    }
    if (!model) {
      showToastr_ACU('warning', '请输入或选择一个模型。');
      return;
    }

    Object.assign(settings_ACU.apiConfig, {
        url,
        apiKey,
        model,
        max_tokens: isNaN(max_tokens) ? 120000 : max_tokens,
        temperature: isNaN(temperature) ? 0.9 : temperature,
    });
    // 将新保存的模型添加到select中（如果不存在）
    if ($customApiModelSelect_ACU && $customApiModelSelect_ACU.find(`option[value="${escapeHtml_ACU(model)}"]`).length === 0) {
        $customApiModelSelect_ACU.append(`<option value="${escapeHtml_ACU(model)}">${escapeHtml_ACU(model)}</option>`);
    }
    saveSettings_ACU();
    showToastr_ACU('success', 'API配置已保存！');
    loadSettingsAndRefreshUI_ACU();
  }

  export function clearApiConfig_ACU() {
    Object.assign(settings_ACU.apiConfig, { url: '', apiKey: '', model: '', max_tokens: 120000, temperature: 0.9 });
    saveSettings_ACU();
    showToastr_ACU('info', 'API配置已清除！');
    loadSettingsAndRefreshUI_ACU();
  }

  // --- [新增] API预设管理函数 ---
  export function saveApiPreset_ACU(presetName) {
    if (!presetName || !presetName.trim()) {
      showToastr_ACU('warning', '请输入预设名称。');
      return false;
    }
    presetName = presetName.trim();
    
    const newPreset = {
      name: presetName,
      apiMode: settings_ACU.apiMode,
      apiConfig: JSON.parse(JSON.stringify(settings_ACU.apiConfig)),
      tavernProfile: settings_ACU.tavernProfile
    };
    
    // 检查是否已存在同名预设
    const existingIndex = settings_ACU.apiPresets.findIndex(p => p.name === presetName);
    if (existingIndex >= 0) {
      settings_ACU.apiPresets[existingIndex] = newPreset;
      showToastr_ACU('success', `API预设 "${presetName}" 已更新。`);
    } else {
      settings_ACU.apiPresets.push(newPreset);
      showToastr_ACU('success', `API预设 "${presetName}" 已保存。`);
    }
    
    saveSettings_ACU();
    refreshApiPresetSelectors_ACU();
    return true;
  }

  export function loadApiPreset_ACU(presetName) {
    const preset = settings_ACU.apiPresets.find(p => p.name === presetName);
    if (!preset) {
      showToastr_ACU('error', `未找到预设 "${presetName}"。`);
      return false;
    }
    
    settings_ACU.apiMode = preset.apiMode;
    settings_ACU.apiConfig = JSON.parse(JSON.stringify(preset.apiConfig));
    settings_ACU.tavernProfile = preset.tavernProfile;
    
    saveSettings_ACU();
    loadSettingsAndRefreshUI_ACU();
    showToastr_ACU('success', `已加载API预设 "${presetName}"。`);
    return true;
  }

  export function deleteApiPreset_ACU(presetName) {
    const index = settings_ACU.apiPresets.findIndex(p => p.name === presetName);
    if (index < 0) {
      showToastr_ACU('error', `未找到预设 "${presetName}"。`);
      return false;
    }
    
    settings_ACU.apiPresets.splice(index, 1);
    
    // 清除使用该预设的引用
    if (settings_ACU.tableApiPreset === presetName) {
      settings_ACU.tableApiPreset = '';
    }
    if (settings_ACU.plotApiPreset === presetName) {
      settings_ACU.plotApiPreset = '';
    }
    
    saveSettings_ACU();
    refreshApiPresetSelectors_ACU();
    showToastr_ACU('info', `API预设 "${presetName}" 已删除。`);
    return true;
  }

  export function refreshApiPresetSelectors_ACU() {
    if (!$popupInstance_ACU) return;
    
    const presets = settings_ACU.apiPresets || [];
    
    // 刷新API配置页面的预设选择器
    const $apiPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-select`);
    if ($apiPresetSelect.length) {
      $apiPresetSelect.empty().append('<option value="">-- 选择预设 --</option>');
      presets.forEach(p => {
        $apiPresetSelect.append(`<option value="${p.name}">${p.name}</option>`);
      });
    }
    
    // 刷新填表的API预设选择器
    const $tableApiPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-api-preset-select`);
    if ($tableApiPresetSelect.length) {
      $tableApiPresetSelect.empty().append('<option value="">使用当前API配置</option>');
      presets.forEach(p => {
        $tableApiPresetSelect.append(`<option value="${p.name}">${p.name}</option>`);
      });
      $tableApiPresetSelect.val(settings_ACU.tableApiPreset || '');
    }
    
    // 刷新剧情推进的API预设选择器
    const $plotApiPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select`);
    if ($plotApiPresetSelect.length) {
      $plotApiPresetSelect.empty().append('<option value="">使用当前API配置</option>');
      presets.forEach(p => {
        $plotApiPresetSelect.append(`<option value="${p.name}">${p.name}</option>`);
      });
      $plotApiPresetSelect.val(settings_ACU.plotApiPreset || '');
    }

    // 刷新正文替换的API预设选择器
    const $optimizationApiPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset`);
    if ($optimizationApiPresetSelect.length) {
      $optimizationApiPresetSelect.empty().append('<option value="">使用当前API配置</option>');
      presets.forEach(p => {
        $optimizationApiPresetSelect.append(`<option value="${p.name}">${p.name}</option>`);
      });
      $optimizationApiPresetSelect.val(settings_ACU.contentOptimizationSettings?.apiPreset || '');
    }
  }

  /**
   * 根据预设名称获取API配置
   * @param {string} presetName - 预设名称，空字符串表示使用当前配置
   * @returns {object} - 包含 apiMode, apiConfig, tavernProfile 的配置对象
   */

  export function saveCustomCharCardPrompt_ACU() {
    if (!$popupInstance_ACU || !$charCardPromptSegmentsContainer_ACU) {
      logError_ACU('保存更新预设失败：UI元素未初始化。');
      return;
    }
    let newPromptSegments = getCharCardPromptFromUI_ACU();
    if (!newPromptSegments || newPromptSegments.length === 0 || (newPromptSegments.length === 1 && !newPromptSegments[0].content.trim())) {
      showToastr_ACU('warning', '更新预设不能为空。');
      return;
    }

    // [健全性] 主提示词槽位去重：A/B 各最多一个（多余的自动降级为普通段落）
    try {
      const seen = { A: false, B: false };
      newPromptSegments = newPromptSegments.map(seg => {
        const slot = String(seg?.mainSlot || (seg?.isMain ? 'A' : (seg?.isMain2 ? 'B' : ''))).toUpperCase();
        if (slot === 'A' || slot === 'B') {
          if (seen[slot]) {
            const cleaned = { ...seg };
            delete cleaned.mainSlot;
            delete cleaned.isMain;
            delete cleaned.isMain2;
            cleaned.deletable = cleaned.deletable !== false;
            return cleaned;
          }
          seen[slot] = true;
        }
        return seg;
      });
    } catch (e) {}

    // 保存为JSON数组格式
    settings_ACU.charCardPrompt = newPromptSegments;
    saveSettings_ACU();
    showToastr_ACU('success', '更新预设已保存！');
    loadSettingsAndRefreshUI_ACU(); // This will re-render from the saved data.
  }

  export function resetDefaultCharCardPrompt_ACU() {
    settings_ACU.charCardPrompt = DEFAULT_CHAR_CARD_PROMPT_ACU;
    saveSettings_ACU();
    showToastr_ACU('info', '更新预设已恢复为默认值！');
    // loadSettings will trigger renderPromptSegments_ACU which correctly handles the string default
    loadSettingsAndRefreshUI_ACU();
  }

  export function loadCharCardPromptFromJson_ACU() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = (e.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = readerEvent => {
            const content = readerEvent.target.result;
            let jsonData;

            try {
                jsonData = JSON.parse(content as string);
            } catch (error) {
                logError_ACU('导入提示词模板失败：JSON解析错误。', error);
                showToastr_ACU('error', '文件不是有效的JSON格式。', { timeOut: 5000 });
                return;
            }
            
            try {
                // Basic validation: must be an array of objects with role and content
                if (!Array.isArray(jsonData) || jsonData.some(item => typeof item.role === 'undefined' || typeof item.content === 'undefined')) {
                    throw new Error('JSON格式不正确。它必须是一个包含 "role" 和 "content" 键的对象的数组。');
                }
                
                // Add deletable: true and normalize roles for consistency
                const segments = jsonData.map(item => {
                    let normalizedRole = 'USER'; // Default to USER
                    if (item.role) {
                        const roleLower = item.role.toLowerCase();
                        if (roleLower === 'system') {
                            normalizedRole = 'SYSTEM';
                        } else if (roleLower === 'assistant' || roleLower === 'ai') {
                            normalizedRole = 'assistant';
                        }
                    }
                    const slot = String(item?.mainSlot || (item?.isMain ? 'A' : (item?.isMain2 ? 'B' : ''))).toUpperCase();
                    const normalizedSlot = (slot === 'A' || slot === 'B') ? slot : '';
                    return {
                        ...item,
                        role: normalizedRole,
                        mainSlot: normalizedSlot || item.mainSlot,
                        // 主提示词A/B不可删除
                        deletable: (normalizedSlot ? false : (item.deletable !== false)),
                    };
                });

                // Use the existing render function
                renderPromptSegments_ACU(segments);
                showToastr_ACU('success', '提示词模板已成功加载！');
                logDebug_ACU('New prompt template loaded from JSON file.');

            } catch (error) {
                logError_ACU('导入提示词模板失败：结构验证失败。', error);
                showToastr_ACU('error', `导入失败: ${error.message}`, { timeOut: 10000 });
            }
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  // [新增] 导出"填表提示词组(更新预设/AI指令预设)"为 JSON（与 loadCharCardPromptFromJson_ACU 联动）
  export function exportCharCardPromptToJson_ACU() {
    try {
      const segments = getCharCardPromptFromUI_ACU();
      if (!Array.isArray(segments) || segments.length === 0) {
        showToastr_ACU('warning', '没有可导出的提示词模板。');
        return;
      }
      // 基础校验：必须包含 role/content
      const invalid = segments.some(s => !s || typeof s !== 'object' || typeof s.role === 'undefined' || typeof s.content === 'undefined');
      if (invalid) {
        showToastr_ACU('error', '导出失败：提示词结构不完整（缺少 role 或 content）。');
        return;
      }

      const jsonString = JSON.stringify(segments, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TavernDB_TablePromptGroup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToastr_ACU('success', '提示词模板已导出为JSON！', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
    } catch (e) {
      logError_ACU('导出提示词模板失败:', e);
      showToastr_ACU('error', '导出提示词模板失败，请检查控制台获取详情。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    }
  }
  export function saveAutoUpdateThreshold_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$autoUpdateThresholdInput_ACU) {
      logError_ACU('保存阈值失败：UI元素未初始化。');
      return;
    }
    const valStr = $autoUpdateThresholdInput_ACU.val();
    const newT = parseInt(valStr, 10);

    if (!isNaN(newT) && newT >= 0) {
      settings_ACU.autoUpdateThreshold = newT;
      saveSettings_ACU();
      if (!silent) {
        if (newT === 0) showToastr_ACU('success', '自动更新阈值已保存！标准表自动更新已禁用。');
        else showToastr_ACU('success', '自动更新阈值已保存！');
      }
      if (!skipReload) loadSettingsAndRefreshUI_ACU();
    } else {
      if (!silent) showToastr_ACU('warning', `阈值 "${valStr}" 无效。请输入一个大于等于0的整数。恢复为: ${settings_ACU.autoUpdateThreshold}`);
      $autoUpdateThresholdInput_ACU.val(settings_ACU.autoUpdateThreshold);
    }
  }

  export function saveAutoUpdateTokenThreshold_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$autoUpdateTokenThresholdInput_ACU) {
      logError_ACU('保存Token阈值失败：UI元素未初始化。');
      return;
    }
    const valStr = $autoUpdateTokenThresholdInput_ACU.val();
    const newT = parseInt(valStr, 10);

    if (!isNaN(newT) && newT >= 0) {
      settings_ACU.autoUpdateTokenThreshold = newT;
      saveSettings_ACU();
      if (!silent) showToastr_ACU('success', '自动更新Token阈值已保存！');
      if (!skipReload) loadSettingsAndRefreshUI_ACU();
    } else {
      if (!silent) showToastr_ACU('warning', `Token阈值 "${valStr}" 无效。请输入一个大于等于0的整数。恢复为: ${settings_ACU.autoUpdateTokenThreshold}`);
      $autoUpdateTokenThresholdInput_ACU.val(settings_ACU.autoUpdateTokenThreshold);
    }
  }

  // [新增] 保存填表自动重试次数的函数
  export function saveTableMaxRetries_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$tableMaxRetriesInput_ACU) {
      logError_ACU('保存填表重试次数失败：UI元素未初始化。');
      return;
    }
    const valStr = $tableMaxRetriesInput_ACU.val();
    const newR = parseInt(valStr, 10);

    if (!isNaN(newR) && newR >= 1 && newR <= 10) {
      settings_ACU.tableMaxRetries = newR;
      saveSettings_ACU();
      if (!silent) showToastr_ACU('success', '填表自动重试次数已保存！');
      if (!skipReload) loadSettingsAndRefreshUI_ACU();
    } else {
      if (!silent) showToastr_ACU('warning', `重试次数 "${valStr}" 无效。请输入1-10之间的整数。恢复为: ${settings_ACU.tableMaxRetries || 3}`);
      $tableMaxRetriesInput_ACU.val(settings_ACU.tableMaxRetries || 3);
    }
  }

  export function saveAutoUpdateFrequency_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$autoUpdateFrequencyInput_ACU) {
      logError_ACU('保存更新频率失败：UI元素未初始化。');
      return;
    }
    const valStr = $autoUpdateFrequencyInput_ACU.val();
    const newF = parseInt(valStr, 10);

    if (!isNaN(newF) && newF >= 1) {
      settings_ACU.autoUpdateFrequency = newF;
      saveSettings_ACU();
      if (!silent) showToastr_ACU('success', '自动更新频率已保存！');
      if (!skipReload) loadSettingsAndRefreshUI_ACU();
    } else {
      if (!silent) showToastr_ACU('warning', `更新频率 "${valStr}" 无效。请输入一个大于0的整数。恢复为: ${settings_ACU.autoUpdateFrequency}`);
      $autoUpdateFrequencyInput_ACU.val(settings_ACU.autoUpdateFrequency);
    }
  }


  // [新增] 保存批处理大小的函数
  export function saveUpdateBatchSize_ACU({ silent = false, skipReload = false } = {}) {
      if (!$popupInstance_ACU || !$updateBatchSizeInput_ACU) {
          logError_ACU('保存批处理大小失败：UI元素未初始化。');
          return;
      }
      const valStr = $updateBatchSizeInput_ACU.val();
      const newBatchSize = parseInt(valStr, 10);

      if (!isNaN(newBatchSize) && newBatchSize >= 1) {
          settings_ACU.updateBatchSize = newBatchSize;
          saveSettings_ACU();
          if (!silent) showToastr_ACU('success', '批处理大小已保存！');
          if (!skipReload) loadSettingsAndRefreshUI_ACU();
      } else {
          if (!silent) showToastr_ACU('warning', `批处理大小 "${valStr}" 无效。请输入一个大于0的整数。恢复为: ${settings_ACU.updateBatchSize}`);
          $updateBatchSizeInput_ACU.val(settings_ACU.updateBatchSize);
      }
  }

  // [新增] 保存最大并发组数
  export function saveMaxConcurrentGroups_ACU({ silent = false, skipReload = false } = {}) {
      if (!$popupInstance_ACU || !$maxConcurrentGroupsInput_ACU) {
          logError_ACU('保存最大并发数失败：UI元素未初始化。');
          return;
      }
      const valStr = $maxConcurrentGroupsInput_ACU.val();
      const newLimit = parseInt(valStr, 10);

      if (!isNaN(newLimit) && newLimit >= 1) {
          settings_ACU.maxConcurrentGroups = newLimit;
          saveSettings_ACU();
          if (!silent) showToastr_ACU('success', '最大并发数已保存！');
          if (!skipReload) loadSettingsAndRefreshUI_ACU();
      } else {
          if (!silent) showToastr_ACU('warning', `最大并发数 "${valStr}" 无效。请输入一个大于0的整数。恢复为: ${settings_ACU.maxConcurrentGroups || 1}`);
          $maxConcurrentGroupsInput_ACU.val(settings_ACU.maxConcurrentGroups || 1);
      }
  }

   // [新增] 保存跳过更新楼层（全局）
   export function saveSkipUpdateFloors_ACU({ silent = false, skipReload = false } = {}) {
       if (!$popupInstance_ACU || !$skipUpdateFloorsInput_ACU) {
           logError_ACU('保存跳过更新楼层失败：UI元素未初始化。');
           return;
       }
       const valStr = $skipUpdateFloorsInput_ACU.val();
       const newSkip = parseInt(valStr, 10);
 
       if (!isNaN(newSkip) && newSkip >= 0) {
           settings_ACU.skipUpdateFloors = newSkip;
           saveSettings_ACU();
           if (!silent) showToastr_ACU('success', '跳过更新楼层已保存！');
           if (!skipReload) loadSettingsAndRefreshUI_ACU();
       } else {
           if (!silent) showToastr_ACU('warning', `跳过更新楼层 "${valStr}" 无效。请输入一个大于等于0的整数。恢复为: ${settings_ACU.skipUpdateFloors || 0}`);
           $skipUpdateFloorsInput_ACU.val(settings_ACU.skipUpdateFloors || 0);
       }
   }

   // [新增] 保存"保留最近N层数据"（全局）
   export function saveRetainRecentLayers_ACU({ silent = false, skipReload = false } = {}) {
       if (!$popupInstance_ACU || !$retainRecentLayersInput_ACU) {
           logError_ACU('保存保留层数失败：UI元素未初始化。');
           return;
       }
       const valStr = $retainRecentLayersInput_ACU.val();
       const parsed = parseInt(valStr, 10);
       // 空字符串或无效值视为0（全部保留）
       const newRetain = (!valStr || valStr.trim() === '' || isNaN(parsed)) ? 0 : Math.max(0, parsed);

       settings_ACU.retainRecentLayers = newRetain;
       saveSettings_ACU();
       if (!silent) {
           if (newRetain === 0) {
               showToastr_ACU('success', '保留层数已清空（将保留全部历史数据）！');
           } else {
               showToastr_ACU('success', `保留层数已保存：最近 ${newRetain} 层！`);
           }
       }
       if (!skipReload) loadSettingsAndRefreshUI_ACU();
   }

   // [新增] 清理超出保留层数的旧本地数据（表格数据 + 剧情推进数据）
   // 按AI楼层计数，仅保留最近N层的数据，更早楼层的 TavernDB_ACU_* 和 qrf_plot 字段将被删除
   // [重要] 此函数不会删除聊天第一层的"空白指导表"（TavernDB_ACU_InternalSheetGuide），
   //        指导表用于保存表头结构和填表参数，作为该聊天的总指导。
   async function purgeOldLayerData_ACU() {
       const retainCount = settings_ACU.retainRecentLayers || 0;
       // 0 或空 = 全部保留，不执行清理
       if (retainCount <= 0) {
           logDebug_ACU('[数据清理] retainRecentLayers 为 0 或未设置，跳过清理。');
           return;
       }

       const chat = SillyTavern_API_ACU?.chat;
       if (!chat || !Array.isArray(chat) || chat.length === 0) {
           logDebug_ACU('[数据清理] 聊天记录为空，跳过清理。');
           return;
       }

       // 1) 收集所有 包含本地数据(TavernDB_ACU_Data/qrf_plot) 的消息索引（按时间顺序，从旧到新）
       // [保护] 排除 chat[0]，确保第一层的指导表数据不被触及
       // [修改] 适配用户层保存逻辑：不再仅检查 AI 消息，而是检查所有可能包含数据的消息（包括用户消息）
       const dataMessageIndices = [];
       for (let i = 1; i < chat.length; i++) {
           const msg = chat[i];
           // 检查是否包含本插件生成的任何本地数据
           if (msg && (
               msg.TavernDB_ACU_Data ||
               msg.TavernDB_ACU_SummaryData ||
               msg.qrf_plot
           )) {
               dataMessageIndices.push(i);
           }
       }

       if (dataMessageIndices.length <= retainCount) {
           logDebug_ACU(`[数据清理] 含数据消息总数(${dataMessageIndices.length}) <= 保留层数(${retainCount})，无需清理。`);
           return;
       }

       // 2) 确定需要清理的楼层：保留最近 retainCount 层，清理更早的
      const cutoffIndex = dataMessageIndices.length - retainCount; // 从这个位置开始是要保留的
      // [优化] 移除"永远保留第一层"的逻辑，严格按照填写的楼层数来保留数据
      const indicesToPurge = dataMessageIndices.slice(0, cutoffIndex); // 这些是要清理的

      if (indicesToPurge.length === 0) {
          logDebug_ACU('[数据清理] 无需清理的楼层。');
           return;
       }

       logDebug_ACU(`[数据清理] 将清理 ${indicesToPurge.length} 层消息的本地数据（保留最近 ${retainCount} 层）...`);

       // 3) 遍历需要清理的楼层，删除本地数据字段
       let purgedCount = 0;
       const keysToDelete = [
           'TavernDB_ACU_Data',
           'TavernDB_ACU_SummaryData',
           'TavernDB_ACU_IndependentData',
           'TavernDB_ACU_ModifiedKeys',
           'TavernDB_ACU_UpdateGroupKeys',
           'TavernDB_ACU_IsolatedData',
           'TavernDB_ACU_Identity',
           'qrf_plot',
           'qrf_plot_preset'  // [新增] 清理剧情规划预设名称标签
       ];

       for (const idx of indicesToPurge) {
           const msg = chat[idx];
           if (!msg) continue;

           let modified = false;
           for (const key of keysToDelete) {
               if (msg.hasOwnProperty(key)) {
                   delete msg[key];
                   modified = true;
               }
           }

           if (modified) {
               purgedCount++;
           }
       }

       if (purgedCount > 0) {
           // 4) 保存聊天记录
           try {
               await SillyTavern_API_ACU.saveChat();
               logDebug_ACU(`[数据清理] 已清理 ${purgedCount} 层AI消息的本地数据，聊天记录已保存。`);
               // [优化] 移除自动清理后的提示框，避免打扰用户
           } catch (e) {
               logError_ACU('[数据清理] 保存聊天记录失败:', e);
           }
       } else {
           logDebug_ACU('[数据清理] 目标楼层中未发现需要清理的数据字段。');
       }
   }
 
   export function saveImportSplitSize_ACU() {
       if (!$popupInstance_ACU) return;
      const $input = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-split-size`);
      if (!$input.length) {
          logError_ACU('保存导入分割大小失败：UI元素未初始化。');
          return;
      }
      const valStr = $input.val();
      const newSize = parseInt(valStr, 10);

      if (!isNaN(newSize) && newSize >= 100) {
          settings_ACU.importSplitSize = newSize;
          saveSettings_ACU();
          showToastr_ACU('success', '导入分割大小已保存！');
          loadSettingsAndRefreshUI_ACU();
      } else {
          showToastr_ACU('warning', `导入分割大小 "${valStr}" 无效。请输入一个大于等于100的整数。恢复为: ${settings_ACU.importSplitSize}`);
          $input.val(settings_ACU.importSplitSize);
      }
  }

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
    const apiUrl = $customApiUrlInput_ACU.val().trim();
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
        modelsList.forEach(model => {
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
      const liveChat = SillyTavern_API_ACU.chat;
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
      const activeChar = SillyTavern_API_ACU.characters?.[SillyTavern_API_ACU.this_chid];
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

    let liveChat = SillyTavern_API_ACU.chat;
    if (!liveChat || liveChat.length === 0) return;
    const lastLiveMessage = liveChat[liveChat.length - 1];

    let totalAiMessages = liveChat.filter(m => !m.is_user).length;

    // Floor increase delay logic...
    if (totalAiMessages > lastTotalAiMessages_ACU) {
        logDebug_ACU(`ACU: AI Message count increased (${lastTotalAiMessages_ACU} -> ${totalAiMessages}). Waiting ${AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU}ms...`);
        await new Promise(resolve => setTimeout(resolve, AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU));
        
        liveChat = SillyTavern_API_ACU.chat;
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
    const updateGroups = {};
    
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
        await refreshMergedDataAndNotify_ACU();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        _set_isAutoUpdatingCard_ACU(false);
        // 最后再刷新一次，确保 UI 状态最新
        await refreshMergedDataAndNotify_ACU();

        // [新增] 在自动更新全部完成后检测自动合并总结
        try {
            await checkAndTriggerAutoMergeSummary_ACU();
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

      const validSaved = saved.filter(k => availableKeys.includes(k));

      // 已手动选择过：严格按保存的交集，不再自动补全新表，防止回退全选
      return validSaved;
  }

