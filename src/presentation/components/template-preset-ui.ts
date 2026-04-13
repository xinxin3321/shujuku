/**
 * presentation/components/template-preset-ui.ts — 模板预设 UI 函数（纯 DOM 操作）
 *
 * 纯业务逻辑函数已搬到 service/template/template-preset-service.ts。
 * 本文件只保留操作 DOM 的 UI 函数。
 */
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU, getCurrentTemplatePresetName_ACU, isDefaultTemplatePresetSelection_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../shared/template-preset-utils';
import { jQuery_API_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { getCurrentChatTemplateScopeState_ACU, listChatTemplatePresetEntries_ACU, migrateLegacyTemplateScopeForCurrentChat_ACU, normalizeTemplateScopeMode_ACU } from '../../service/template/chat-scope';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { formatPlotScopeUpdatedAt_ACU } from '../pages/popup-helpers';
import { getTemplatePresetDisplayName_ACU, getTemplatePreset_ACU, listTemplatePresetNames_ACU, resolveActiveTemplatePresetName_ACU } from '../../service/template/template-preset-service';

// ═══ 纯 DOM 操作函数 ═══

  export function getTemplatePresetSelectJQ_ACU() {
      try {
          if (!$popupInstance_ACU || !$popupInstance_ACU.length) return null;
          const $sel = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-select`);
          return $sel && $sel.length ? $sel : null;
      } catch (e) {
          return null;
      }
  }

  function getTemplateChatPresetSelectJQ_ACU() {
      try {
          if (!$popupInstance_ACU || !$popupInstance_ACU.length) return null;
          const $sel = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select`);
          return $sel && $sel.length ? $sel : null;
      } catch (e) {
          return null;
      }
  }

  function populateTemplatePresetSelectOptions_ACU($select, { extraPresetName = '', extraLabelSuffix = '（仅当前聊天快照）', extraOptions = [] } = {}) {
      if (!$select || !$select.length) return;
      const normalizedExtraPresetName = normalizeTemplatePresetSelectionValue_ACU(extraPresetName);
      const presetNames = listTemplatePresetNames_ACU();
      const renderedNames = new Set();
      $select.empty().append(jQuery_API_ACU('<option/>').val(DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU).text('默认预设'));
      presetNames.forEach(name => {
          const normalizedName = normalizeTemplatePresetSelectionValue_ACU(name);
          if (!normalizedName || renderedNames.has(normalizedName)) return;
          renderedNames.add(normalizedName);
          $select.append(jQuery_API_ACU('<option/>').val(normalizedName).text(normalizedName));
      });
      if (normalizedExtraPresetName && !renderedNames.has(normalizedExtraPresetName)) {
          renderedNames.add(normalizedExtraPresetName);
          $select.append(jQuery_API_ACU('<option/>').val(normalizedExtraPresetName).text(`${normalizedExtraPresetName}${extraLabelSuffix}`));
      }
      (Array.isArray(extraOptions) ? extraOptions : []).forEach(option => {
          const value = String(option?.value || '').trim();
          if (!value || renderedNames.has(value)) return;
          renderedNames.add(value);
          const label = String(option?.label || value).trim() || value;
          $select.append(jQuery_API_ACU('<option/>').val(value).text(label));
      });
  }

  export function loadTemplatePresetSelect_ACU({ globalSelectName = null, keepGlobalValue = false } = {}) {
      if (!$popupInstance_ACU || !$popupInstance_ACU.length) return;

      const presetNames = listTemplatePresetNames_ACU();
      const globalPresetName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false }));
      const chatScopeState = getCurrentChatTemplateScopeState_ACU() || migrateLegacyTemplateScopeForCurrentChat_ACU();
      const normalizedChatMode = normalizeTemplateScopeMode_ACU(chatScopeState?.mode);
      const effectiveChatPresetName = resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true });
      const chatSelectedPresetName = normalizeTemplatePresetSelectionValue_ACU(chatScopeState?.presetName || effectiveChatPresetName || '');
      const chatPresetEntries = listChatTemplatePresetEntries_ACU();
      const localOnlyOptions = chatPresetEntries
          .filter(entry => {
              const entryName = normalizeTemplatePresetSelectionValue_ACU(entry?.presetName || '');
              return !!entryName && !presetNames.includes(entryName);
          })
          .map(entry => {
              const entryName = normalizeTemplatePresetSelectionValue_ACU(entry?.presetName || '');
              const updatedAtText = (typeof formatPlotScopeUpdatedAt_ACU === 'function')
                  ? formatPlotScopeUpdatedAt_ACU(entry?.updatedAt || entry?.archivedAt)
                  : '';
              return {
                  value: entryName,
                  label: updatedAtText
                      ? `${getTemplatePresetDisplayName_ACU(entryName)}（当前聊天快照，${updatedAtText}）`
                      : `${getTemplatePresetDisplayName_ACU(entryName)}（当前聊天快照）`,
              };
          });
      const chatPresetEntryCount = chatPresetEntries.length;
      const chatExtraPresetName = (() => {
          if (!chatSelectedPresetName) return '';
          if (presetNames.includes(chatSelectedPresetName)) return '';
          if (localOnlyOptions.some(option => option.value === chatSelectedPresetName)) return '';
          return chatSelectedPresetName;
      })();

      const $globalSelect = getTemplatePresetSelectJQ_ACU();
      const $chatSelect = getTemplateChatPresetSelectJQ_ACU();
      const $globalStatus = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-global-scope-status`);
      const $chatStatus = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-scope-status`);
      const $chatOriginStatus = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-origin-status`);
      const $globalDeleteBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-delete`);

      const hasGlobalPreset = !!globalPresetName && presetNames.includes(globalPresetName);

      populateTemplatePresetSelectOptions_ACU($globalSelect, {
          extraPresetName: hasGlobalPreset ? '' : globalPresetName,
          extraLabelSuffix: '（仅当前全局模板快照）',
      });
      populateTemplatePresetSelectOptions_ACU($chatSelect, {
          extraPresetName: chatExtraPresetName,
          extraLabelSuffix: normalizedChatMode === 'preset_link' ? '（当前聊天引用）' : '（当前聊天专属预设）',
          extraOptions: localOnlyOptions,
      });

      if ($globalSelect && $globalSelect.length) {
          let resolvedGlobalValue = globalPresetName;
          if (globalSelectName !== null && typeof globalSelectName !== 'undefined') {
              resolvedGlobalValue = normalizeTemplatePresetSelectionValue_ACU(globalSelectName);
          } else if (keepGlobalValue) {
              resolvedGlobalValue = normalizeTemplatePresetSelectionValue_ACU($globalSelect.val());
          }
          const finalGlobalValue = resolvedGlobalValue && $globalSelect.find(`option[value="${resolvedGlobalValue.replace(/"/g, '\\"')}"]`).length > 0
              ? resolvedGlobalValue
              : (hasGlobalPreset || (!!globalPresetName && $globalSelect.find(`option[value="${globalPresetName.replace(/"/g, '\\"')}"]`).length > 0)
                  ? globalPresetName
                  : DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
          $globalSelect.val(finalGlobalValue || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
      }

      if ($globalDeleteBtn && $globalDeleteBtn.length) {
          $globalDeleteBtn.toggle(!!globalPresetName && presetNames.includes(globalPresetName));
      }

      if ($chatSelect && $chatSelect.length) {
          const finalChatValue = chatSelectedPresetName && $chatSelect.find(`option[value="${chatSelectedPresetName.replace(/"/g, '\\"')}"]`).length > 0
              ? chatSelectedPresetName
              : DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
          $chatSelect.val(finalChatValue || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
      }

      if ($globalStatus && $globalStatus.length) {
          if (globalPresetName && !hasGlobalPreset) {
              $globalStatus.text(`当前全局模板：${globalPresetName}（预设库已不存在，但当前 profile 仍保留这份模板快照）。`);
          } else {
              $globalStatus.text(`当前全局模板：${getTemplatePresetDisplayName_ACU(globalPresetName)}；新聊天会默认继承这里的表格模板。`);
          }
      }

      if ($chatStatus && $chatStatus.length) {
          if (normalizedChatMode === 'chat_override') {
              let scopeLabel = '当前聊天专属预设';
              if (chatScopeState.source === 'legacy_frozen') {
                  scopeLabel = '旧版聊天冻结模板（已迁移）';
              } else if (chatScopeState.source === 'legacy_history_frozen') {
                  scopeLabel = '旧对话历史模板快照（已迁移）';
              } else if (chatScopeState.source === 'legacy_header_frozen') {
                  scopeLabel = '旧版表头冻结模板（已迁移）';
              }
              $chatStatus.text(`当前聊天：${scopeLabel}；当前实际模板预设为 ${getTemplatePresetDisplayName_ACU(chatSelectedPresetName)}。`);
          } else if (normalizedChatMode === 'preset_link') {
              $chatStatus.text(`当前聊天：引用全局预设 ${getTemplatePresetDisplayName_ACU(chatSelectedPresetName)}；打开聊天时会继续沿用这个预设。`);
          } else {
              $chatStatus.text(`当前聊天：跟随当前全局；当前实际模板预设为 ${getTemplatePresetDisplayName_ACU(effectiveChatPresetName)}。`);
          }
      }

      if ($chatOriginStatus && $chatOriginStatus.length) {
          if (normalizedChatMode === 'chat_override') {
              const detailParts = [];
              if (chatScopeState.source === 'legacy_frozen') {
                  detailParts.push('来源语义：从旧版聊天冻结模板迁移');
              } else if (chatScopeState.source === 'legacy_history_frozen') {
                  detailParts.push('来源语义：从旧对话实际表格结构迁移');
              } else if (chatScopeState.source === 'legacy_header_frozen') {
                  detailParts.push('来源语义：从旧版表头冻结模板迁移');
              } else {
                  detailParts.push('来源语义：当前聊天已保存本地模板预设快照');
              }
              if (chatScopeState.originGlobalName) {
                  detailParts.push(`来源全局模板：${getTemplatePresetDisplayName_ACU(chatScopeState.originGlobalName)}`);
              }
              if (Number.isFinite(chatScopeState.originGlobalRevision) && chatScopeState.originGlobalRevision > 0) {
                  detailParts.push(`来源全局版本：v${chatScopeState.originGlobalRevision}`);
              }
              const updatedAtText = (typeof formatPlotScopeUpdatedAt_ACU === 'function') ? formatPlotScopeUpdatedAt_ACU(chatScopeState.updatedAt) : '';
              if (updatedAtText) {
                  detailParts.push(`更新时间：${updatedAtText}`);
              }
              if (chatScopeState.source) {
                  detailParts.push(`写入来源：${chatScopeState.source}`);
              }
              if (chatPresetEntryCount > 0) {
                  detailParts.push(`当前聊天已登记 ${chatPresetEntryCount} 个本地模板预设`);
              }
              $chatOriginStatus.text(detailParts.join('；') || '当前聊天正在使用聊天级模板预设快照。');
          } else if (normalizedChatMode === 'preset_link') {
              const detailParts = [
                  '来源语义：当前聊天仅记录预设引用，未保存本地模板快照',
                  `引用预设：${getTemplatePresetDisplayName_ACU(chatSelectedPresetName)}`,
              ];
              const updatedAtText = (typeof formatPlotScopeUpdatedAt_ACU === 'function') ? formatPlotScopeUpdatedAt_ACU(chatScopeState?.updatedAt) : '';
              if (updatedAtText) {
                  detailParts.push(`更新时间：${updatedAtText}`);
              }
              if (chatScopeState?.source) {
                  detailParts.push(`写入来源：${chatScopeState.source}`);
              }
              if (chatPresetEntryCount > 0) {
                  detailParts.push(`当前聊天可切换/覆盖 ${chatPresetEntryCount} 个本地模板预设`);
              }
              $chatOriginStatus.text(detailParts.join('；'));
          } else if (chatPresetEntryCount > 0) {
              $chatOriginStatus.text(`当前聊天尚未保存本地模板快照，实际会跟随当前全局模板；但当前聊天已经拥有 ${chatPresetEntryCount} 个可直接切换的本地模板预设。`);
          } else {
              $chatOriginStatus.text('当前聊天尚未保存本地模板快照，实际会直接跟随当前全局表格模板。');
          }
      }
  }

  export function refreshTemplatePresetSelectInUI_ACU({ selectName = null, keepValue = false } = {}) {
      if ($popupInstance_ACU && $popupInstance_ACU.length) {
          loadTemplatePresetSelect_ACU({ globalSelectName: selectName, keepGlobalValue: !!keepValue });
          return;
      }

      const $sel = getTemplatePresetSelectJQ_ACU();
      if (!$sel || !$sel.length) return;
      renderTemplatePresetSelect_ACU($sel, { keepValue: !!keepValue });

      if (selectName === null || typeof selectName === 'undefined') return;

      const normalizedName = normalizeTemplatePresetSelectionValue_ACU(selectName);
      $sel.val(normalizedName || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
  }

  function renderTemplatePresetSelect_ACU($select, { keepValue = true } = {}) {
      try {
          if (!$select || !$select.length) return;
          const prev = keepValue ? normalizeTemplatePresetSelectionValue_ACU($select.val()) : '';
          const names = listTemplatePresetNames_ACU();
          const persistedName = getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: true, getTemplatePresetFn: getTemplatePreset_ACU });
          $select.empty();
          $select.append(jQuery_API_ACU('<option/>').val(DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU).text('默认预设'));
          names.forEach(n => {
              $select.append(jQuery_API_ACU('<option/>').val(String(n)).text(String(n)));
          });

          let resolvedValue = DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
          if (keepValue) {
              if (isDefaultTemplatePresetSelection_ACU(prev)) {
                  resolvedValue = DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
              } else if (names.includes(prev)) {
                  resolvedValue = prev;
              }
          }

          if (resolvedValue === DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU && persistedName && names.includes(persistedName)) {
              resolvedValue = persistedName;
          }

          $select.val(resolvedValue);
      } catch (e) {}
  }
