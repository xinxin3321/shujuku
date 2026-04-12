import { STORAGE_KEY_TEMPLATE_PRESETS_ACU } from '../../data/constants';
import { DEFAULT_TABLE_TEMPLATE_ACU, TABLE_TEMPLATE_ACU , _set_TABLE_TEMPLATE_ACU} from '../../data/models/defaults-json.js';
import { saveCurrentProfileTemplate_ACU } from '../../data/repositories/profile-repo';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU, getCurrentTemplatePresetName_ACU, isDefaultTemplatePresetSelection_ACU, normalizeTemplatePresetSelectionValue_ACU, persistCurrentTemplatePresetName_ACU } from '../../data/repositories/template-preset-repo';
import { getConfigStorage_ACU } from '../../data/storage/tavern-storage';
import { SillyTavern_API_ACU, jQuery_API_ACU, $popupInstance_ACU, getCurrentIsolationKey_ACU } from '../../service/runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU, saveSettings_ACU } from '../../service/settings/settings-service';
import { activateChatTemplatePresetSelection_ACU, buildChatSheetGuideDataFromTemplateObj_ACU, buildChatTemplatePresetLinkState_ACU, buildChatTemplateScopeStateFromCurrent_ACU, clearChatSheetGuideDataForIsolationKey_ACU, getCurrentChatTemplateScopeState_ACU, listChatTemplatePresetEntries_ACU, migrateLegacyTemplateScopeForCurrentChat_ACU, normalizeTemplateScopeIsolationKey_ACU, normalizeTemplateScopeMode_ACU, sanitizeChatSheetsObject_ACU, sanitizeTemplateSnapshotForChat_ACU, setCurrentChatTemplateScopeState_ACU, upsertChatTemplatePresetEntry_ACU } from '../../service/template/chat-scope';
import { refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { safeJsonParse_ACU, safeJsonStringify_ACU } from '../../shared/json-helpers';
import { ensureSheetOrderNumbers_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { formatPlotScopeUpdatedAt_ACU } from '../pages/popup-helpers';
/**
 * presentation/components/template-preset-ui.ts — 模板预设 UI 函数
 * 从 src/core/02_storage_and_profile.js:20~628 迁移而来
 */
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

  export function getTemplatePresetDisplayName_ACU(presetName) {
      const normalizedName = normalizeTemplatePresetSelectionValue_ACU(presetName);
      return normalizedName || '默认预设';
  }

  export function resolveActiveTemplatePresetName_ACU({ fallbackToGlobal = true, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = String(isolationKey ?? '');
      const chatScopeState = getCurrentChatTemplateScopeState_ACU({ isolationKey: normalizedKey }) || migrateLegacyTemplateScopeForCurrentChat_ACU({ isolationKey: normalizedKey });
      const chatPresetName = normalizeTemplatePresetSelectionValue_ACU(chatScopeState?.presetName || '');
      if (chatPresetName) return chatPresetName;
      if (!fallbackToGlobal) return '';
      return getCurrentTemplatePresetName_ACU({ requireExisting: false });
  }

  export function getActiveTemplatePresetMeta_ACU({ isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = String(isolationKey ?? '');
      const chatScopeState = getCurrentChatTemplateScopeState_ACU({ isolationKey: normalizedKey }) || migrateLegacyTemplateScopeForCurrentChat_ACU({ isolationKey: normalizedKey });
      const normalizedMode = normalizeTemplateScopeMode_ACU(chatScopeState?.mode);
      const effectivePresetName = normalizeTemplatePresetSelectionValue_ACU(
          resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true, isolationKey: normalizedKey }),
      );
      const scope = (normalizedMode === 'chat_override' || normalizedMode === 'preset_link') ? 'chat' : 'global';
      return {
          presetName: effectivePresetName,
          displayName: getTemplatePresetDisplayName_ACU(effectivePresetName),
          mode: normalizedMode,
          scope,
          scopeLabel: scope === 'chat' ? '当前聊天' : '全局',
      };
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
      const globalPresetName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU({ requireExisting: false }));
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

  export function ensureUniqueTemplatePresetName_ACU(baseNameRaw) {
      const baseName = String(baseNameRaw || '').trim();
      if (!baseName) return '';
      const names = new Set(listTemplatePresetNames_ACU().map(n => String(n)));
      if (!names.has(baseName)) return baseName;
      for (let i = 2; i <= 99; i++) {
          const candidate = `${baseName} (${i})`;
          if (!names.has(candidate)) return candidate;
      }
      return `${baseName} (${Date.now()})`;
  }

  function buildDefaultTemplatePresetsStore_ACU() {
      return { version: 1, presets: {} };
  }

  function loadTemplatePresetsStore_ACU() {
      const store = getConfigStorage_ACU();
      const raw = store?.getItem?.(STORAGE_KEY_TEMPLATE_PRESETS_ACU);
      const parsed = raw ? safeJsonParse_ACU(raw, null) : null;
      const base = buildDefaultTemplatePresetsStore_ACU();
      if (!parsed || typeof parsed !== 'object') return base;
      const out = { ...base, ...parsed };
      if (!out.presets || typeof out.presets !== 'object') out.presets = {};
      return out;
  }

  function saveTemplatePresetsStore_ACU(obj) {
      try {
          const store = getConfigStorage_ACU();
          store?.setItem?.(STORAGE_KEY_TEMPLATE_PRESETS_ACU, safeJsonStringify_ACU(obj, '{}'));
          return true;
      } catch (e) {
          logWarn_ACU('[TemplatePresets] Failed to save:', e);
          return false;
      }
  }

  export function listTemplatePresetNames_ACU() {
      const s = loadTemplatePresetsStore_ACU();
      return Object.keys(s.presets || {}).sort((a, b) => String(a).localeCompare(String(b)));
  }

  export function getTemplatePreset_ACU(name) {
      const s = loadTemplatePresetsStore_ACU();
      const p = s?.presets?.[String(name || '')];
      return p && typeof p === 'object' ? p : null;
  }

  export function upsertTemplatePreset_ACU(nameRaw, templateStr) {
      const name = String(nameRaw || '').trim();
      if (!name) return false;
      const s = loadTemplatePresetsStore_ACU();
      s.presets = s.presets && typeof s.presets === 'object' ? s.presets : {};
      s.presets[name] = { templateStr: String(templateStr || ''), updatedAt: Date.now() };
      return saveTemplatePresetsStore_ACU(s);
  }

  export function deleteTemplatePreset_ACU(nameRaw) {
      const name = String(nameRaw || '').trim();
      if (!name) return false;
      const s = loadTemplatePresetsStore_ACU();
      if (!s.presets || typeof s.presets !== 'object') return false;
      if (!Object.prototype.hasOwnProperty.call(s.presets, name)) return false;
      delete s.presets[name];
      return saveTemplatePresetsStore_ACU(s);
  }

  export function normalizeTemplateForPresetSave_ACU() {
      // 返回：{ templateObj, templateStr } 或 null
      const obj = parseTableTemplateJson_ACU({ stripSeedRows: false });
      if (!obj || typeof obj !== 'object') return null;
      try {
          const sheetKeys = Object.keys(obj).filter(k => k.startsWith('sheet_'));
          ensureSheetOrderNumbers_ACU(obj, { baseOrderKeys: sheetKeys, forceRebuild: false });
      } catch (e) {}
      const sanitized = sanitizeChatSheetsObject_ACU(obj, { ensureMate: true });
      const str = safeJsonStringify_ACU(sanitized, '');
      if (!str) return null;
      return { templateObj: sanitized, templateStr: str };
  }

  function renderTemplatePresetSelect_ACU($select, { keepValue = true } = {}) {
      try {
          if (!$select || !$select.length) return;
          const prev = keepValue ? normalizeTemplatePresetSelectionValue_ACU($select.val()) : '';
          const names = listTemplatePresetNames_ACU();
          const persistedName = getCurrentTemplatePresetName_ACU({ requireExisting: true });
          $select.empty();
          $select.append(jQuery_API_ACU('<option/>').val(DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU).text('默认预设'));
          names.forEach(n => {
              // 注意：value/text 必须用 DOM 赋值，避免 HTML 转义导致取值失真（比如 &、<、" 等）
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

  export function getDefaultTemplateSnapshot_ACU() {
      const previousTemplate = TABLE_TEMPLATE_ACU;
      let snapshot = sanitizeTemplateSnapshotForChat_ACU(DEFAULT_TABLE_TEMPLATE_ACU);
      if (snapshot?.templateStr) {
          return snapshot;
      }

      try {
          _set_TABLE_TEMPLATE_ACU(DEFAULT_TABLE_TEMPLATE_ACU);
          const parsedTemplate = parseTableTemplateJson_ACU({ stripSeedRows: false });
          snapshot = sanitizeTemplateSnapshotForChat_ACU(parsedTemplate);
      } catch (e) {
          snapshot = null;
      } finally {
          _set_TABLE_TEMPLATE_ACU(previousTemplate);
      }

      return snapshot || sanitizeTemplateSnapshotForChat_ACU(previousTemplate);
  }

  export function normalizeTemplateOperationScope_ACU(scope) {
      return scope === 'chat' ? 'chat' : 'global';
  }

  export function parseImportedTemplateData_ACU(templateData) {
      let jsonData;

      if (typeof templateData === 'string') {
          try {
              jsonData = JSON.parse(templateData);
          } catch (parseError) {
              throw new Error(`JSON解析错误: ${parseError.message}`);
          }
      } else if (typeof templateData === 'object' && templateData !== null) {
          jsonData = JSON.parse(JSON.stringify(templateData));
      } else {
          throw new Error('无效的模板数据：必须是 JSON 对象或 JSON 字符串');
      }

      if (!jsonData.mate || !jsonData.mate.type || jsonData.mate.type !== 'chatSheets') {
          throw new Error('缺少 "mate" 对象或 "type" 属性不正确。模板必须包含 `"mate": {"type": "chatSheets", ...}`。');
      }

      const sheetKeys = Object.keys(jsonData).filter(k => k.startsWith('sheet_'));
      if (sheetKeys.length === 0) {
          throw new Error('模板中未找到任何表格数据 (缺少 "sheet_..." 键)。');
      }

      for (const key of sheetKeys) {
          const sheet = jsonData[key];
          if (!sheet.name || !sheet.content || !sheet.sourceData || !Array.isArray(sheet.content)) {
              throw new Error(`表格 "${key}" 结构不完整，缺少 "name"、"content" 或 "sourceData" 关键属性。`);
          }
      }

      try {
          if (!jsonData.mate || typeof jsonData.mate !== 'object') jsonData.mate = { type: 'chatSheets', version: 1 };
          if (jsonData.mate.updateConfigUiSentinel !== -1) {
              const sheetKeys2 = Object.keys(jsonData).filter(k => k.startsWith('sheet_'));
              for (const k of sheetKeys2) {
                  const s = jsonData[k];
                  const uc = s && typeof s === 'object' ? s.updateConfig : null;
                  if (!uc || typeof uc !== 'object') continue;
                  if (uc.uiSentinel !== -1) uc.uiSentinel = -1;
                  for (const field of ['contextDepth', 'updateFrequency', 'batchSize', 'skipFloors']) {
                      if (Object.prototype.hasOwnProperty.call(uc, field) && uc[field] === 0) uc[field] = -1;
                  }
              }
              jsonData.mate.updateConfigUiSentinel = -1;
          }
      } catch (e) {}

      ensureSheetOrderNumbers_ACU(jsonData, { baseOrderKeys: sheetKeys, forceRebuild: false });
      const sanitized = sanitizeChatSheetsObject_ACU(jsonData, { ensureMate: true });
      const snapshot = sanitizeTemplateSnapshotForChat_ACU(sanitized);
      if (!snapshot?.templateStr || !snapshot?.templateObj) {
          throw new Error('模板结构无效，无法生成模板快照。');
      }

      return {
          snapshot,
          templateObj: snapshot.templateObj,
          templateStr: snapshot.templateStr,
      };
  }

  export async function applyTemplateSnapshotToScope_ACU(templateSource, { scope = 'global', source = 'ui', presetName = '', refreshUi = false, save = true, persistChatScope = null, registerChatPresetEntry = null } = {}) {
      const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
      const snapshot = sanitizeTemplateSnapshotForChat_ACU(templateSource);
      if (!snapshot?.templateStr || !snapshot?.templateObj) return false;

      const normalizedPresetName = normalizeTemplatePresetSelectionValue_ACU(presetName);
      const updateGlobal = normalizedScope === 'global';
      const effectivePersistChatScope = persistChatScope === null ? !updateGlobal : !!persistChatScope;
      const effectiveRegisterChatPresetEntry = registerChatPresetEntry === null
          ? (!updateGlobal && !!effectivePersistChatScope)
          : !!registerChatPresetEntry;
      _set_TABLE_TEMPLATE_ACU(snapshot.templateStr);
      if (updateGlobal) {
          saveCurrentProfileTemplate_ACU(TABLE_TEMPLATE_ACU);
      }

      const guideData = buildChatSheetGuideDataFromTemplateObj_ACU(snapshot.templateObj, { stripSeedRows: false });
      persistTemplateScopeSelectionState_ACU(normalizedPresetName, {
          source,
          updateGlobal,
          save,
          persistChatScope: effectivePersistChatScope,
          templateSource: snapshot.templateStr,
          guideData,
          scopeMode: effectivePersistChatScope ? 'chat_override' : 'inherit_global',
          registerChatPresetEntry: effectiveRegisterChatPresetEntry,
      });
      applyTemplateScopeForCurrentChat_ACU();

      if ($popupInstance_ACU && refreshUi) {
          loadTemplatePresetSelect_ACU({
              globalSelectName: updateGlobal ? normalizedPresetName : null,
              keepGlobalValue: !updateGlobal,
          });
      }

      try { await refreshMergedDataAndNotify_ACU(); } catch (e) {}
      return {
          scope: normalizedScope,
          presetName: normalizedPresetName,
          templateStr: snapshot.templateStr,
          templateObj: snapshot.templateObj,
      };
  }

  export function persistTemplateScopeSelectionState_ACU(presetName, { source = 'ui', updateGlobal = false, save = true, persistChatScope = !updateGlobal, templateSource = TABLE_TEMPLATE_ACU, guideData = null, archivePreviousChatScope = false, scopeMode = persistChatScope ? 'chat_override' : 'inherit_global', registerChatPresetEntry = !updateGlobal && !!persistChatScope && normalizeTemplateScopeMode_ACU(scopeMode) === 'chat_override' } = {}) {
      void archivePreviousChatScope;
      const normalizedPresetName = normalizeTemplatePresetSelectionValue_ACU(presetName);
      let shouldSaveSettings = false;
      let shouldSaveChat = false;

      if (updateGlobal) {
          persistCurrentTemplatePresetName_ACU(normalizedPresetName, { save: false });
          shouldSaveSettings = true;
      } else if (persistChatScope) {
          const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(getCurrentIsolationKey_ACU());
          const normalizedScopeMode = normalizeTemplateScopeMode_ACU(scopeMode);
          let templateState = null;

          if (normalizedScopeMode === 'chat_override') {
              templateState = buildChatTemplateScopeStateFromCurrent_ACU({
                  isolationKey: normalizedKey,
                  presetName: normalizedPresetName,
                  source,
                  originGlobalName: getCurrentTemplatePresetName_ACU({ requireExisting: false }),
                  originGlobalRevision: 0,
                  updatedAt: Date.now(),
                  templateSource,
                  guideData,
              });
          } else if (normalizedScopeMode === 'preset_link') {
              templateState = buildChatTemplatePresetLinkState_ACU({
                  isolationKey: normalizedKey,
                  presetName: normalizedPresetName,
                  source,
                  originGlobalName: getCurrentTemplatePresetName_ACU({ requireExisting: false }),
                  originGlobalRevision: 0,
                  updatedAt: Date.now(),
              });
          } else {
              templateState = { mode: 'inherit_global' };
          }

          if (templateState) {
              setCurrentChatTemplateScopeState_ACU(templateState, {
                  isolationKey: normalizedKey,
                  reason: `template_scope_${source}`,
              });
              if (normalizedScopeMode === 'chat_override' && registerChatPresetEntry) {
                  try {
                      upsertChatTemplatePresetEntry_ACU(templateState, { isolationKey: normalizedKey });
                  } catch (e) {}
              }
              try {
                  clearChatSheetGuideDataForIsolationKey_ACU({ isolationKey: normalizedKey });
              } catch (e) {}
              shouldSaveChat = true;
          }
      }

      if (save) {
          if (shouldSaveSettings) {
              saveSettings_ACU();
          }
          if (shouldSaveChat && typeof SillyTavern_API_ACU?.saveChat === 'function') {
              Promise.resolve()
                  .then(() => SillyTavern_API_ACU.saveChat())
                  .catch(error => logWarn_ACU('[TemplateScope] 保存聊天级模板状态失败:', error));
          }
      }

      return normalizedPresetName;
  }

  export async function applyTemplatePresetToCurrent_ACU(presetName, { source = 'ui', updateGlobal = true, refreshUi = false, save = true, persistChatScope = !updateGlobal } = {}) {
      const name = normalizeTemplatePresetSelectionValue_ACU(presetName);
      const isDefaultPreset = isDefaultTemplatePresetSelection_ACU(name);

      if (!updateGlobal) {
          const activated = await activateChatTemplatePresetSelection_ACU(name, {
              source,
              refreshUi,
              save,
          });
          if (!activated) return false;
          if ($popupInstance_ACU && refreshUi) {
              loadTemplatePresetSelect_ACU({ keepGlobalValue: true });
          }
          return { ...activated, isDefault: isDefaultPreset };
      }

      let snapshot = null;
      if (isDefaultPreset) {
          snapshot = getDefaultTemplateSnapshot_ACU();
      } else {
          const preset = getTemplatePreset_ACU(name);
          const raw = preset?.templateStr;
          if (!raw) return false;
          snapshot = sanitizeTemplateSnapshotForChat_ACU(raw);
      }

      const applied = await applyTemplateSnapshotToScope_ACU(snapshot?.templateStr, {
          scope: 'global',
          source,
          presetName: name,
          refreshUi,
          save,
          persistChatScope,
      });
      if (!applied) return false;

      return { ...applied, isDefault: isDefaultPreset };
  }

