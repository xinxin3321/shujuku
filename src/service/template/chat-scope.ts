/**
 * service/template/chat-scope.ts — 聊天模板/剧情作用域管理 + Sheet Guide + sanitize
 * 从 src/core/04_shared_helpers.js:37~1382 迁移而来。
 * 合并 T114~T120: chat-scope + template-archive + sheet-guide + sheet-helpers(部分)
 */
import { normalizeIsolationCode_ACU } from '../../data/constants';
import { DEFAULT_TABLE_TEMPLATE_ACU, TABLE_TEMPLATE_ACU, _set_TABLE_TEMPLATE_ACU} from '../../data/models/defaults-json.js';
import { readProfileTemplateFromStorage_ACU } from '../../data/repositories/profile-repo';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU, deriveTemplatePresetNameForImport_ACU, getCurrentTemplatePresetName_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../data/repositories/template-preset-repo';
import { CHAT_SCOPED_CONFIG_FIELD_ACU, CHAT_SHEET_GUIDE_FIELD_ACU, CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU, CHAT_SHEET_GUIDE_VERSION_ACU, CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU, LEGACY_CHAT_TABLE_HEADER_GUIDE_FIELD_ACU, MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU, getChatScopedConfigContainer_ACU, getChatSheetGuideContainer_ACU, normalizeChatScopedConfigContainer_ACU } from '../../data/storage/chat-history';
import { getDefaultTemplateSnapshot_ACU, getTemplatePreset_ACU } from '../../presentation/components/template-preset-ui';
import { SillyTavern_API_ACU, TABLE_ORDER_FIELD_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU } from '../settings/settings-service';
import { refreshMergedDataAndNotify_ACU } from '../worldbook/pipeline';
import { safeJsonParse_ACU, safeJsonStringify_ACU } from '../../shared/json-helpers';
import { applySheetOrderNumbers_ACU, cloneScopedConfigData_ACU, ensureSheetOrderNumbers_ACU, getChatFirstLayerMessage_ACU, hashUserInput_ACU, isSummaryOrOutlineTable_ACU, logDebug_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { ensureLoopPromptsArray_ACU, ensurePlotPromptsArray_ACU, ensurePlotTasksCompat_ACU, getPlotFinalDirectiveFromSource_ACU, normalizePlotPresetSelectionValue_ACU, setPlotPromptContentByIdForSettings_ACU } from '../../presentation/components/optimization-ui';
import { getTemplatePresetDisplayName_ACU, persistTemplateScopeSelectionState_ACU, upsertTemplatePreset_ACU } from '../../presentation/components/template-preset-ui';
import { formatPlotScopeUpdatedAt_ACU } from '../../presentation/pages/popup-helpers';
import { ensureExportConfigDefaults_ACU, ensureGlobalInjectionConfigDefaults_ACU } from '../worldbook/injection-engine';

  function normalizePlotScopeMode_ACU(mode) {
      return mode === 'chat_override' ? 'chat_override' : 'inherit_global';
  }

  function normalizeChatScopedConfigSource_ACU(source, fallback = 'inherit') {
      if (typeof source !== 'string') return fallback;
      const normalized = source.trim();
      return normalized || fallback;
  }

  export function sanitizePlotSettingsSnapshotForChat_ACU(plotSettings) {
      if (!plotSettings || typeof plotSettings !== 'object') return null;
      const snapshot = cloneScopedConfigData_ACU(plotSettings, null);
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

      delete snapshot.promptPresets;
      delete snapshot.lastUsedPresetName;
      delete snapshot.enabled;

      ensurePlotPromptsArray_ACU(snapshot);
      ensureLoopPromptsArray_ACU(snapshot);
      ensurePlotTasksCompat_ACU(snapshot, { syncLegacy: true });
      snapshot.finalSystemDirective = getPlotFinalDirectiveFromSource_ACU(snapshot);
      setPlotPromptContentByIdForSettings_ACU(snapshot, 'finalSystemDirective', snapshot.finalSystemDirective || '');
      return snapshot;
  }

  function normalizeChatPlotScopeState_ACU(rawState) {
      const state = (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) ? rawState : {};
      const snapshot = sanitizePlotSettingsSnapshotForChat_ACU(state.snapshot);
      return {
          mode: normalizePlotScopeMode_ACU(state.mode),
          presetName: normalizePlotPresetSelectionValue_ACU(state.presetName || ''),
          snapshot,
          originGlobalName: normalizePlotPresetSelectionValue_ACU(state.originGlobalName || ''),
          originGlobalRevision: Number.isFinite(state.originGlobalRevision) ? Math.max(0, Math.trunc(state.originGlobalRevision)) : 0,
          updatedAt: Number.isFinite(state.updatedAt) ? state.updatedAt : 0,
          source: normalizeChatScopedConfigSource_ACU(state.source, 'inherit'),
      };
  }

  export function getCurrentChatPlotScopeState_ACU(chat = SillyTavern_API_ACU?.chat) {
      const container = getChatScopedConfigContainer_ACU(chat);
      const rawState = container?.plot;
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return null;

      const normalizedState = normalizeChatPlotScopeState_ACU(rawState);
      if (normalizedState.mode !== 'chat_override' || !normalizedState.snapshot) {
          return null;
      }
      return normalizedState;
  }

  export function buildChatPlotScopeStateFromSettings_ACU(plotSettings, { presetName = '', source = 'ui', originGlobalName = '', originGlobalRevision = 0, updatedAt = Date.now() } = {}) {
      const snapshot = sanitizePlotSettingsSnapshotForChat_ACU(plotSettings);
      if (!snapshot) return null;

      return normalizeChatPlotScopeState_ACU({
          mode: 'chat_override',
          presetName,
          snapshot,
          originGlobalName,
          originGlobalRevision,
          updatedAt,
          source,
      });
  }

  export function setCurrentChatPlotScopeState_ACU(plotState, { reason = '' } = {}) {
      const chat = SillyTavern_API_ACU?.chat;
      const first = getChatFirstLayerMessage_ACU(chat);
      if (!first) return null;

      const container = normalizeChatScopedConfigContainer_ACU(getChatScopedConfigContainer_ACU(chat));
      const normalizedState = normalizeChatPlotScopeState_ACU(plotState);

      if (normalizedState.mode === 'chat_override' && normalizedState.snapshot) {
          container.plot = {
              ...normalizedState,
              reason: String(reason || ''),
          };
      } else {
          delete container.plot;
      }

      const hasPayload = Object.keys(container).some(key => key !== 'version');
      if (hasPayload) {
          first[CHAT_SCOPED_CONFIG_FIELD_ACU] = container;
      } else {
          delete first[CHAT_SCOPED_CONFIG_FIELD_ACU];
      }

      return getCurrentChatPlotScopeState_ACU(chat);
  }

  export function clearCurrentChatPlotScopeState_ACU() {
      return setCurrentChatPlotScopeState_ACU({ mode: 'inherit_global' }, { reason: 'clear_plot_override' });
  }

  export function normalizeTemplateScopeMode_ACU(mode) {
      if (mode === 'chat_override') return 'chat_override';
      if (mode === 'preset_link') return 'preset_link';
      return 'inherit_global';
  }

  export function normalizeTemplateScopeIsolationKey_ACU(isolationKey = getCurrentIsolationKey_ACU()) {
      return String(isolationKey ?? '');
  }

  export function sanitizeTemplateSnapshotForChat_ACU(templateSource) {
      let templateObj = null;
      if (typeof templateSource === 'string') {
          templateObj = safeJsonParse_ACU(templateSource, null);
      } else if (templateSource && typeof templateSource === 'object' && !Array.isArray(templateSource)) {
          templateObj = cloneScopedConfigData_ACU(templateSource, null);
      }

      if (!templateObj || typeof templateObj !== 'object' || Array.isArray(templateObj)) return null;

      try {
          const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
          ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: sheetKeys, forceRebuild: false });
      } catch (e) {}

      const sanitized = sanitizeChatSheetsObject_ACU(templateObj, { ensureMate: true });
      const templateStr = safeJsonStringify_ACU(sanitized, '');
      if (!templateStr) return null;

      return {
          templateStr,
          templateObj: safeJsonParse_ACU(templateStr, null),
      };
  }

  function normalizeChatTemplateScopeState_ACU(rawState, { isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const state = (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) ? rawState : {};
      const templateSnapshot = sanitizeTemplateSnapshotForChat_ACU(state.templateStr || state.templateObj || state.template || null);
      const guideData = normalizeGuideData_ACU(state.guideData);
      return {
          mode: normalizeTemplateScopeMode_ACU(state.mode),
          isolationKey: normalizeTemplateScopeIsolationKey_ACU(state.isolationKey ?? isolationKey),
          presetName: normalizeTemplatePresetSelectionValue_ACU(state.presetName || ''),
          templateStr: templateSnapshot?.templateStr || '',
          guideData,
          originGlobalName: normalizeTemplatePresetSelectionValue_ACU(state.originGlobalName || ''),
          originGlobalRevision: Number.isFinite(state.originGlobalRevision) ? Math.max(0, Math.trunc(state.originGlobalRevision)) : 0,
          updatedAt: Number.isFinite(state.updatedAt) ? state.updatedAt : 0,
          source: normalizeChatScopedConfigSource_ACU(state.source, 'inherit'),
      };
  }

  function buildChatTemplatePresetSlotKey_ACU(presetName) {
      return normalizeTemplatePresetSelectionValue_ACU(presetName) || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
  }

  export function listChatTemplatePresetEntries_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const entryMap = new Map();
      getChatTemplateArchiveEntries_ACU({ chat, isolationKey: normalizedKey }).forEach(entry => {
          const slotKey = buildChatTemplatePresetSlotKey_ACU(entry?.presetName || '');
          const previousEntry = entryMap.get(slotKey);
          const currentTs = Number(entry?.updatedAt) || Number(entry?.archivedAt) || 0;
          const previousTs = Number(previousEntry?.updatedAt) || Number(previousEntry?.archivedAt) || 0;
          if (!previousEntry || currentTs >= previousTs) {
              entryMap.set(slotKey, entry);
          }
      });
      return Array.from(entryMap.values()).sort((a, b) => {
          const ta = Number(a?.updatedAt) || Number(a?.archivedAt) || 0;
          const tb = Number(b?.updatedAt) || Number(b?.archivedAt) || 0;
          return tb - ta;
      });
  }

  function findChatTemplatePresetEntry_ACU(presetName, { chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const slotKey = buildChatTemplatePresetSlotKey_ACU(presetName);
      return listChatTemplatePresetEntries_ACU({ chat, isolationKey }).find(entry => buildChatTemplatePresetSlotKey_ACU(entry?.presetName || '') === slotKey) || null;
  }

  export function upsertChatTemplatePresetEntry_ACU(templateState, { chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const normalizedState = normalizeChatTemplateScopeState_ACU(templateState, { isolationKey: normalizedKey });
      if (normalizedState.mode !== 'chat_override' || !normalizedState.templateStr) return null;

      const slotKey = buildChatTemplatePresetSlotKey_ACU(normalizedState.presetName || '');
      const archivedAt = Date.now();
      const nextEntries = [
          {
              ...normalizedState,
              archiveKey: slotKey,
              archivedAt,
              updatedAt: normalizedState.updatedAt || archivedAt,
          },
          ...getChatTemplateArchiveEntries_ACU({ chat, isolationKey: normalizedKey }).filter(entry => buildChatTemplatePresetSlotKey_ACU(entry?.presetName || '') !== slotKey),
      ];
      setChatTemplateArchiveEntries_ACU(nextEntries, { chat, isolationKey: normalizedKey });
      return findChatTemplatePresetEntry_ACU(normalizedState.presetName || '', { chat, isolationKey: normalizedKey });
  }

  function ensureCurrentChatTemplatePresetEntry_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const currentState = getCurrentChatTemplateScopeState_ACU({ chat, isolationKey: normalizedKey }) || migrateLegacyTemplateScopeForCurrentChat_ACU({ chat, isolationKey: normalizedKey });
      const normalizedState = normalizeChatTemplateScopeState_ACU(currentState, { isolationKey: normalizedKey });
      if (normalizedState.mode !== 'chat_override' || !normalizedState.templateStr) return null;

      const existingEntry = findChatTemplatePresetEntry_ACU(normalizedState.presetName || '', { chat, isolationKey: normalizedKey });
      const currentFingerprint = buildChatTemplateArchiveFingerprint_ACU(normalizedState, { isolationKey: normalizedKey });
      const existingFingerprint = existingEntry ? buildChatTemplateArchiveFingerprint_ACU(existingEntry, { isolationKey: normalizedKey }) : '';
      if (existingEntry && currentFingerprint && existingFingerprint === currentFingerprint) {
          return existingEntry;
      }
      return upsertChatTemplatePresetEntry_ACU(normalizedState, { chat, isolationKey: normalizedKey });
  }

  export function buildChatTemplatePresetLinkState_ACU({ isolationKey = getCurrentIsolationKey_ACU(), presetName = '', source = 'ui', originGlobalName = '', originGlobalRevision = 0, updatedAt = Date.now() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      return normalizeChatTemplateScopeState_ACU({
          mode: 'preset_link',
          isolationKey: normalizedKey,
          presetName,
          originGlobalName,
          originGlobalRevision,
          updatedAt,
          source,
      }, { isolationKey: normalizedKey });
  }

  export async function activateChatTemplatePresetSelection_ACU(presetName, { source = 'ui_chat_select', refreshUi = false, save = true } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(getCurrentIsolationKey_ACU());
      const normalizedPresetName = normalizeTemplatePresetSelectionValue_ACU(presetName);
      const localEntry = findChatTemplatePresetEntry_ACU(normalizedPresetName, { isolationKey: normalizedKey });
      const hasGlobalPreset = !normalizedPresetName || !!getTemplatePreset_ACU(normalizedPresetName)?.templateStr;

      try {
          ensureCurrentChatTemplatePresetEntry_ACU({ isolationKey: normalizedKey });
      } catch (e) {}

      if (localEntry?.templateStr) {
          persistTemplateScopeSelectionState_ACU(normalizedPresetName, {
              source,
              updateGlobal: false,
              save,
              persistChatScope: true,
              templateSource: localEntry.templateStr,
              guideData: localEntry.guideData,
              scopeMode: 'chat_override',
              registerChatPresetEntry: false,
          });
      } else {
          if (!hasGlobalPreset) return false;
          const linkState = buildChatTemplatePresetLinkState_ACU({
              isolationKey: normalizedKey,
              presetName: normalizedPresetName,
              source,
              originGlobalName: getCurrentTemplatePresetName_ACU({ requireExisting: false }),
              originGlobalRevision: 0,
              updatedAt: Date.now(),
          });
          setCurrentChatTemplateScopeState_ACU(linkState, {
              isolationKey: normalizedKey,
              reason: `template_scope_${source}`,
          });
          try {
              clearChatSheetGuideDataForIsolationKey_ACU({ isolationKey: normalizedKey });
          } catch (e) {}
          if (save && typeof SillyTavern_API_ACU?.saveChat === 'function') {
              try {
                  await SillyTavern_API_ACU.saveChat();
              } catch (error) {
                  logWarn_ACU('[TemplateScope] 保存聊天级模板预设引用失败:', error);
              }
          }
      }

      applyTemplateScopeForCurrentChat_ACU({ isolationKey: normalizedKey });
      try { await refreshMergedDataAndNotify_ACU(); } catch (e) {}
      return {
          presetName: normalizedPresetName,
          mode: localEntry?.templateStr ? 'chat_override' : 'preset_link',
          fromLocalSnapshot: !!localEntry?.templateStr,
      };
  }

  function buildChatTemplateArchiveFingerprint_ACU(templateState, { isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedState = normalizeChatTemplateScopeState_ACU(templateState, { isolationKey });
      if (normalizedState.mode !== 'chat_override' || !normalizedState.templateStr) return '';
      const raw = safeJsonStringify_ACU({
          presetName: normalizedState.presetName || '',
          source: normalizedState.source || '',
          templateStr: normalizedState.templateStr || '',
          guideData: normalizeGuideData_ACU(normalizedState.guideData),
      }, '');
      return raw ? hashUserInput_ACU(raw) : '';
  }

  function getChatTemplateArchiveBaseLabel_ACU(templateState, { fallback = '聊天模板快照' } = {}) {
      const normalizedState = normalizeChatTemplateScopeState_ACU(templateState);
      if (normalizedState.source === 'legacy_history_frozen') return '旧对话历史模板快照';
      if (normalizedState.source === 'legacy_header_frozen') return '旧版表头冻结模板';
      if (normalizedState.source === 'legacy_frozen') return '旧版聊天冻结模板';
      const presetName = normalizeTemplatePresetSelectionValue_ACU(normalizedState.presetName || '');
      return presetName ? getTemplatePresetDisplayName_ACU(presetName) : fallback;
  }

  function normalizeChatTemplateArchiveEntry_ACU(rawEntry, { isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedState = normalizeChatTemplateScopeState_ACU(rawEntry, { isolationKey });
      if (normalizedState.mode !== 'chat_override' || !normalizedState.templateStr) return null;
      const archiveKey = String(rawEntry?.archiveKey || buildChatTemplateArchiveFingerprint_ACU(normalizedState, { isolationKey: normalizedState.isolationKey }) || '').trim();
      if (!archiveKey) return null;
      return {
          archiveKey,
          isolationKey: normalizedState.isolationKey,
          presetName: normalizedState.presetName,
          templateStr: normalizedState.templateStr,
          guideData: normalizedState.guideData,
          originGlobalName: normalizedState.originGlobalName,
          originGlobalRevision: normalizedState.originGlobalRevision,
          updatedAt: normalizedState.updatedAt,
          archivedAt: Number.isFinite(rawEntry?.archivedAt) ? rawEntry.archivedAt : Date.now(),
          source: normalizedState.source,
          mode: 'chat_override',
      };
  }

  function getChatTemplateArchiveEntries_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const container = getChatScopedConfigContainer_ACU(chat);
      const rawSlots = container?.templateArchives;
      if (!rawSlots || typeof rawSlots !== 'object' || Array.isArray(rawSlots)) return [];
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const rawEntries = Array.isArray(rawSlots[normalizedKey]) ? rawSlots[normalizedKey] : [];
      return rawEntries
          .map(entry => normalizeChatTemplateArchiveEntry_ACU(entry, { isolationKey: normalizedKey }))
          .filter(Boolean)
          .sort((a, b) => (Number(b.archivedAt) || 0) - (Number(a.archivedAt) || 0));
  }

  function setChatTemplateArchiveEntries_ACU(entries, { chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const first = getChatFirstLayerMessage_ACU(chat);
      if (!first) return [];
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const container = normalizeChatScopedConfigContainer_ACU(getChatScopedConfigContainer_ACU(chat));
      const normalizedEntries = (Array.isArray(entries) ? entries : [])
          .map(entry => normalizeChatTemplateArchiveEntry_ACU(entry, { isolationKey: normalizedKey }))
          .filter(Boolean)
          .sort((a, b) => (Number(b.archivedAt) || 0) - (Number(a.archivedAt) || 0))
          .slice(0, MAX_CHAT_TEMPLATE_ARCHIVES_PER_TAG_ACU);

      if (normalizedEntries.length > 0) {
          if (!container.templateArchives || typeof container.templateArchives !== 'object' || Array.isArray(container.templateArchives)) {
              container.templateArchives = {};
          }
          container.templateArchives[normalizedKey] = normalizedEntries;
      } else if (container.templateArchives && typeof container.templateArchives === 'object' && !Array.isArray(container.templateArchives)) {
          delete container.templateArchives[normalizedKey];
          if (Object.keys(container.templateArchives).length === 0) delete container.templateArchives;
      }

      const hasPayload = Object.keys(container).some(key => key !== 'version');
      if (hasPayload) {
          first[CHAT_SCOPED_CONFIG_FIELD_ACU] = container;
      } else {
          delete first[CHAT_SCOPED_CONFIG_FIELD_ACU];
      }

      return getChatTemplateArchiveEntries_ACU({ chat, isolationKey: normalizedKey });
  }

  function archiveCurrentChatTemplateScopeState_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU(), nextTemplateState = null, reason = '' } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const currentState = getCurrentChatTemplateScopeState_ACU({ chat, isolationKey: normalizedKey }) || migrateLegacyTemplateScopeForCurrentChat_ACU({ chat, isolationKey: normalizedKey });
      const normalizedCurrentState = normalizeChatTemplateScopeState_ACU(currentState, { isolationKey: normalizedKey });
      if (normalizedCurrentState.mode !== 'chat_override' || !normalizedCurrentState.templateStr) return false;

      const currentArchiveKey = buildChatTemplateArchiveFingerprint_ACU(normalizedCurrentState, { isolationKey: normalizedKey });
      if (!currentArchiveKey) return false;

      const normalizedNextState = nextTemplateState
          ? normalizeChatTemplateScopeState_ACU(nextTemplateState, { isolationKey: normalizedKey })
          : null;
      const nextArchiveKey = normalizedNextState?.templateStr
          ? buildChatTemplateArchiveFingerprint_ACU(normalizedNextState, { isolationKey: normalizedKey })
          : '';
      if (nextArchiveKey && currentArchiveKey === nextArchiveKey) return false;

      const archivedAt = Date.now();
      const nextEntries = [
          {
              ...normalizedCurrentState,
              archiveKey: currentArchiveKey,
              archivedAt,
              updatedAt: normalizedCurrentState.updatedAt || archivedAt,
              source: normalizedCurrentState.source || normalizeChatScopedConfigSource_ACU(reason, 'inherit'),
          },
          ...getChatTemplateArchiveEntries_ACU({ chat, isolationKey: normalizedKey }).filter(entry => entry.archiveKey !== currentArchiveKey),
      ];
      setChatTemplateArchiveEntries_ACU(nextEntries, { chat, isolationKey: normalizedKey });
      return true;
  }

  function buildChatTemplateArchiveOptionValue_ACU(archiveKey) {
      const normalizedKey = String(archiveKey || '').trim();
      return normalizedKey ? `${CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU}${normalizedKey}` : '';
  }

  function isChatTemplateArchiveOptionValue_ACU(value) {
      return typeof value === 'string' && value.startsWith(CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU);
  }

  function parseChatTemplateArchiveOptionValue_ACU(value) {
      return isChatTemplateArchiveOptionValue_ACU(value)
          ? String(value.slice(CHAT_TEMPLATE_ARCHIVE_OPTION_PREFIX_ACU.length)).trim()
          : '';
  }

  function getChatTemplateArchiveOptionLabel_ACU(entry) {
      const normalizedEntry = normalizeChatTemplateArchiveEntry_ACU(entry);
      if (!normalizedEntry) return '聊天历史模板快照';
      const baseLabel = getChatTemplateArchiveBaseLabel_ACU(normalizedEntry);
      const archivedAtText = (typeof formatPlotScopeUpdatedAt_ACU === 'function') ? formatPlotScopeUpdatedAt_ACU(normalizedEntry.archivedAt || normalizedEntry.updatedAt) : '';
      return archivedAtText
          ? `${baseLabel}（聊天历史快照，${archivedAtText}）`
          : `${baseLabel}（聊天历史快照）`;
  }

  async function restoreChatTemplateArchiveEntry_ACU(archiveKey, { chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU(), refreshUi = false, save = true } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const normalizedArchiveKey = String(archiveKey || '').trim();
      if (!normalizedArchiveKey) return false;
      const entry = getChatTemplateArchiveEntries_ACU({ chat, isolationKey: normalizedKey }).find(item => item.archiveKey === normalizedArchiveKey);
      if (!entry?.templateStr) return false;

      persistTemplateScopeSelectionState_ACU(entry.presetName, {
          source: entry.source || 'ui_chat_archive_restore',
          updateGlobal: false,
          save,
          persistChatScope: true,
          templateSource: entry.templateStr,
          guideData: entry.guideData,
          archivePreviousChatScope: true,
      });
      applyTemplateScopeForCurrentChat_ACU({ isolationKey: normalizedKey });

      try { await refreshMergedDataAndNotify_ACU(); } catch (e) {}
      return {
          archiveKey: normalizedArchiveKey,
          presetName: entry.presetName || '',
          label: getChatTemplateArchiveOptionLabel_ACU(entry),
          templateStr: entry.templateStr,
      };
  }

  export function getCurrentChatTemplateScopeState_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const container = getChatScopedConfigContainer_ACU(chat);
      const rawSlots = container?.template;
      if (!rawSlots || typeof rawSlots !== 'object' || Array.isArray(rawSlots)) return null;

      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const rawState = rawSlots[normalizedKey];
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return null;

      const normalizedState = normalizeChatTemplateScopeState_ACU(rawState, { isolationKey: normalizedKey });
      if (normalizedState.mode === 'preset_link') {
          return normalizedState;
      }
      if (normalizedState.mode !== 'chat_override' || !normalizedState.templateStr) {
          return null;
      }
      return normalizedState;
  }

  export function buildChatTemplateScopeStateFromCurrent_ACU({ isolationKey = getCurrentIsolationKey_ACU(), presetName = '', source = 'ui', originGlobalName = '', originGlobalRevision = 0, updatedAt = Date.now(), templateSource = TABLE_TEMPLATE_ACU as any, guideData = null }: any = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const templateSnapshot = sanitizeTemplateSnapshotForChat_ACU(templateSource);
      if (!templateSnapshot?.templateStr) return null;

      const resolvedGuideData = normalizeGuideData_ACU(guideData || getChatSheetGuideDataForIsolationKey_ACU(normalizedKey));
      return normalizeChatTemplateScopeState_ACU({
          mode: 'chat_override',
          isolationKey: normalizedKey,
          presetName,
          templateStr: templateSnapshot.templateStr,
          guideData: resolvedGuideData,
          originGlobalName,
          originGlobalRevision,
          updatedAt,
          source,
      }, { isolationKey: normalizedKey });
  }

  export function setCurrentChatTemplateScopeState_ACU(templateState, { isolationKey = getCurrentIsolationKey_ACU(), reason = '' } = {}) {
      const chat = SillyTavern_API_ACU?.chat;
      const first = getChatFirstLayerMessage_ACU(chat);
      if (!first) return null;

      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const container = normalizeChatScopedConfigContainer_ACU(getChatScopedConfigContainer_ACU(chat));
      const normalizedState = normalizeChatTemplateScopeState_ACU(templateState, { isolationKey: normalizedKey });

      if (!container.template || typeof container.template !== 'object' || Array.isArray(container.template)) {
          container.template = {};
      }

      if (normalizedState.mode === 'chat_override' && normalizedState.templateStr) {
          container.template[normalizedKey] = {
              ...normalizedState,
              reason: String(reason || ''),
          };
      } else if (normalizedState.mode === 'preset_link') {
          container.template[normalizedKey] = {
              ...normalizedState,
              templateStr: '',
              guideData: null,
              reason: String(reason || ''),
          };
      } else {
          delete container.template[normalizedKey];
          if (Object.keys(container.template).length === 0) {
              delete container.template;
          }
      }

      const hasPayload = Object.keys(container).some(key => key !== 'version');
      if (hasPayload) {
          first[CHAT_SCOPED_CONFIG_FIELD_ACU] = container;
      } else {
          delete first[CHAT_SCOPED_CONFIG_FIELD_ACU];
      }

      return getCurrentChatTemplateScopeState_ACU({ chat, isolationKey: normalizedKey });
  }

  function clearCurrentChatTemplateScopeState_ACU({ isolationKey = getCurrentIsolationKey_ACU(), clearGuide = true, archiveCurrent = true } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      if (archiveCurrent) {
          try {
              archiveCurrentChatTemplateScopeState_ACU({ isolationKey: normalizedKey, reason: 'clear_template_override' });
          } catch (e) {}
      }
      const result = setCurrentChatTemplateScopeState_ACU({ mode: 'inherit_global' }, {
          isolationKey: normalizedKey,
          reason: 'clear_template_override',
      });
      if (clearGuide) {
          try {
              clearChatSheetGuideDataForIsolationKey_ACU({ isolationKey: normalizedKey });
          } catch (e) {}
      }
      return result;
  }

  export function getGlobalTemplateSnapshotForCurrentProfile_ACU() {
      const code = normalizeIsolationCode_ACU(settings_ACU?.dataIsolationCode || '');
      const previousTemplate = TABLE_TEMPLATE_ACU;
      const savedTemplate = readProfileTemplateFromStorage_ACU(code);
      let snapshot = sanitizeTemplateSnapshotForChat_ACU(savedTemplate || previousTemplate);
      if (snapshot?.templateStr) {
          return snapshot;
      }

      try {
          _set_TABLE_TEMPLATE_ACU(savedTemplate || DEFAULT_TABLE_TEMPLATE_ACU);
          const parsedTemplate = parseTableTemplateJson_ACU({ stripSeedRows: false });
          snapshot = sanitizeTemplateSnapshotForChat_ACU(parsedTemplate);
      } catch (e) {
          snapshot = null;
      } finally {
          _set_TABLE_TEMPLATE_ACU(previousTemplate);
      }

      return snapshot || sanitizeTemplateSnapshotForChat_ACU(previousTemplate);
  }



  function normalizeGuideData_ACU(dataObj) {
      if (!dataObj || typeof dataObj !== 'object') return null;
      const out: any = { mate: { type: 'chatSheets', version: CHAT_SHEET_GUIDE_VERSION_ACU } };
      // mate 允许覆盖
      if (dataObj.mate && typeof dataObj.mate === 'object') {
          out.mate = dataObj.mate;
      }
      // 兜底补齐 mate 关键字段（避免旧调用方传入 version=1 导致无法识别新结构）
      if (!out.mate || typeof out.mate !== 'object') out.mate = { type: 'chatSheets', version: CHAT_SHEET_GUIDE_VERSION_ACU };
      if (!out.mate.type) out.mate.type = 'chatSheets';
      if (!Number.isFinite(out.mate.version) || Math.trunc(out.mate.version) < CHAT_SHEET_GUIDE_VERSION_ACU) out.mate.version = CHAT_SHEET_GUIDE_VERSION_ACU;
      Object.keys(dataObj).forEach(k => {
          if (!k.startsWith('sheet_')) return;
          const s = dataObj[k];
          if (!s || typeof s !== 'object') return;
          // content 只保留表头行
          const headerRow = Array.isArray(s.content) && Array.isArray(s.content[0]) ? s.content[0] : [null];
          const keep = {
              uid: s.uid || k,
              name: s.name || k,
              sourceData: s.sourceData || { note: '', initNode: '', insertNode: '', updateNode: '', deleteNode: '' },
              content: [headerRow],
              updateConfig: s.updateConfig || { uiSentinel: -1, contextDepth: -1, updateFrequency: -1, batchSize: -1, skipFloors: -1, sendLatestRows: -1, groupId: -1 },
              exportConfig: ensureExportConfigDefaults_ACU(s.exportConfig, s.name || k),
          };
          // v2: 基础数据（仅模板预置/seedRows）；注意：这里绝不从 content 派生，避免把真实数据误当作"基础数据"写入指导表
          if (Array.isArray(s[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU])) {
              try {
                  keep[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = JSON.parse(JSON.stringify(s[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU]));
              } catch (e) {
                  keep[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = [];
              }
          }
          if (s[TABLE_ORDER_FIELD_ACU] !== undefined) keep[TABLE_ORDER_FIELD_ACU] = s[TABLE_ORDER_FIELD_ACU];
          out[k] = keep;
      });
      return out;
  }

  export function materializeDataFromSheetGuide_ACU(guideData, { includeSeedRows = true } = {}) {
      const normalized = normalizeGuideData_ACU(guideData);
      if (!normalized) return { mate: { type: 'chatSheets', version: 1 } };
      const out = { mate: normalized.mate || { type: 'chatSheets', version: 1 } };
      Object.keys(normalized).forEach(k => {
          if (!k.startsWith('sheet_')) return;
          const s = normalized[k];
          const headerRow = Array.isArray(s?.content?.[0]) ? JSON.parse(JSON.stringify(s.content[0])) : [null];
          const next = JSON.parse(JSON.stringify(s));
          // content: header + (可选) seedRows
          const seedRows = includeSeedRows && Array.isArray(s?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU])
              ? JSON.parse(JSON.stringify(s[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU]))
              : [];
          next.content = [headerRow, ...seedRows];
          // 保留 seedRows 字段本身（便于后续再次写回/二次处理），但不会影响表格使用者（他们只看 content）
          out[k] = next;
      });
      return out;
  }

  function getLegacyHeaderGuideDataForIsolationKey_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = String(isolationKey ?? '');
      try {
          const first = getChatFirstLayerMessage_ACU(chat);
          const legacyRaw = first ? first[LEGACY_CHAT_TABLE_HEADER_GUIDE_FIELD_ACU] : null;
          const legacyObj = legacyRaw ? ((typeof legacyRaw === 'string') ? safeJsonParse_ACU(legacyRaw, null) : legacyRaw) : null;
          const legacyTags = legacyObj?.tags;
          const legacySlot = (legacyTags && typeof legacyTags === 'object') ? legacyTags[normalizedKey] : null;
          const legacyHeaders = Array.isArray(legacySlot?.headers) ? legacySlot.headers : null;
          if (!legacyHeaders || legacyHeaders.length === 0) return null;

          const orderedUids = legacyHeaders
              .map(h => h?.uid)
              .filter(uid => typeof uid === 'string' && uid.startsWith('sheet_'));
          if (orderedUids.length === 0) return null;

          const templateObj = parseTableTemplateJson_ACU({ stripSeedRows: false });
          const out: any = { mate: { type: 'chatSheets', version: CHAT_SHEET_GUIDE_VERSION_ACU } };
          orderedUids.forEach((uid, idx) => {
              const base = (templateObj && templateObj[uid])
                  ? JSON.parse(JSON.stringify(templateObj[uid]))
                  : { uid, name: uid, content: [[null]], sourceData: {}, updateConfig: {}, exportConfig: {} };
              if (Array.isArray(base.content) && base.content.length > 1) {
                  base[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = JSON.parse(JSON.stringify(base.content.slice(1)));
                  base.content = [base.content[0]];
              }
              if (!Array.isArray(base.content) || base.content.length === 0) base.content = [[null]];
              base.uid = uid;
              if (!Number.isFinite(base[TABLE_ORDER_FIELD_ACU])) base[TABLE_ORDER_FIELD_ACU] = idx;
              out[uid] = base;
          });
          return normalizeGuideData_ACU(out);
      } catch (e) {
          return null;
      }
  }

  function getHistoricalTemplateGuideDataForIsolationKey_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      if (!Array.isArray(chat) || chat.length === 0) return null;

      const historicalData = { mate: { type: 'chatSheets', version: 1 } };
      const encounteredKeys = [];
      const encounteredSet = new Set();
      const appendTables = (dataObj, { summaryOnly = null } = {}) => {
          if (!dataObj || typeof dataObj !== 'object' || Array.isArray(dataObj)) return;
          Object.keys(dataObj).forEach(key => {
              if (!key.startsWith('sheet_') || encounteredSet.has(key)) return;
              const sheet = dataObj[key];
              if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return;
              const isSummary = !!sheet.name && isSummaryOrOutlineTable_ACU(sheet.name);
              if (summaryOnly === true && !isSummary) return;
              if (summaryOnly === false && isSummary) return;
              historicalData[key] = JSON.parse(JSON.stringify(sheet));
              encounteredKeys.push(key);
              encounteredSet.add(key);
          });
      };

      for (let i = chat.length - 1; i >= 0; i--) {
          const message = chat[i];
          if (!message || message.is_user) continue;

          const isolatedContainer = typeof message.TavernDB_ACU_IsolatedData === 'string'
              ? safeJsonParse_ACU(message.TavernDB_ACU_IsolatedData, null)
              : message.TavernDB_ACU_IsolatedData;
          appendTables(isolatedContainer?.[normalizedKey]?.independentData);

          const msgIdentity = message.TavernDB_ACU_Identity;
          const isLegacyMatch = settings_ACU.dataIsolationEnabled
              ? (msgIdentity === settings_ACU.dataIsolationCode)
              : !msgIdentity;
          if (!isLegacyMatch) continue;

          appendTables(message.TavernDB_ACU_IndependentData);
          appendTables(message.TavernDB_ACU_Data, { summaryOnly: false });
          appendTables(message.TavernDB_ACU_SummaryData, { summaryOnly: true });
      }

      if (encounteredKeys.length === 0) return null;

      const orderedKeys = encounteredKeys
          .map((key, index) => ({
              key,
              index,
              order: Number.isFinite(historicalData?.[key]?.[TABLE_ORDER_FIELD_ACU])
                  ? Math.trunc(historicalData[key][TABLE_ORDER_FIELD_ACU])
                  : null,
          }))
          .sort((a, b) => {
              if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
              if (a.order !== null && b.order === null) return -1;
              if (a.order === null && b.order !== null) return 1;
              return a.index - b.index;
          })
          .map(item => item.key);

      applySheetOrderNumbers_ACU(historicalData, orderedKeys);
      return buildChatSheetGuideDataFromData_ACU(historicalData, {
          preserveSeedRowsFromGuideData: null,
          seedRowsFromTemplateObj: null,
          orderedKeys,
      });
  }

  function getLegacyTemplateSnapshotLabel_ACU(source = 'legacy_frozen') {
      if (source === 'legacy_history_frozen') return '旧对话历史模板快照';
      if (source === 'legacy_header_frozen') return '旧版表头冻结模板';
      return '旧版聊天冻结模板';
  }

  function buildChatTemplateScopeStateFromGuideData_ACU({ isolationKey = getCurrentIsolationKey_ACU(), presetName = '', source = 'legacy_frozen', originGlobalName = '', originGlobalRevision = 0, updatedAt = Date.now(), guideData = null } = {}) {
      const normalizedGuideData = normalizeGuideData_ACU(guideData);
      if (!normalizedGuideData || !Object.keys(normalizedGuideData).some(k => k.startsWith('sheet_'))) return null;
      const templateObj = materializeDataFromSheetGuide_ACU(normalizedGuideData, { includeSeedRows: true });
      return buildChatTemplateScopeStateFromCurrent_ACU({
          isolationKey,
          presetName,
          source,
          originGlobalName,
          originGlobalRevision,
          updatedAt,
          templateSource: templateObj,
          guideData: normalizedGuideData,
      });
  }

  export function migrateLegacyTemplateScopeForCurrentChat_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const existingScopeState = getCurrentChatTemplateScopeState_ACU({ chat, isolationKey: normalizedKey });
      if (existingScopeState) return existingScopeState;

      const persistMigratedState = (guideData, { source = 'legacy_frozen', updatedAt = Date.now() } = {}) => {
          const templateState = buildChatTemplateScopeStateFromGuideData_ACU({
              isolationKey: normalizedKey,
              presetName: getLegacyTemplateSnapshotLabel_ACU(source),
              source,
              originGlobalName: '',
              originGlobalRevision: 0,
              updatedAt,
              guideData,
          });
          if (!templateState) return null;
          return setCurrentChatTemplateScopeState_ACU(templateState, {
              isolationKey: normalizedKey,
              reason: `template_scope_${source}`,
          });
      };

      const container = getChatSheetGuideContainer_ACU(chat);
      const legacySlot = container?.tags?.[normalizedKey];
      const hasExplicitLegacyScopeMode = typeof legacySlot?.templateScopeMode === 'string' && legacySlot.templateScopeMode.trim() !== '';
      const legacySlotMode = hasExplicitLegacyScopeMode
          ? normalizeTemplateScopeMode_ACU(legacySlot.templateScopeMode)
          : 'chat_override';
      const legacyGuideData = normalizeGuideData_ACU(legacySlot?.data);
      if (legacySlotMode === 'chat_override' && legacyGuideData && Object.keys(legacyGuideData).some(k => k.startsWith('sheet_'))) {
          return persistMigratedState(legacyGuideData, {
              source: 'legacy_frozen',
              updatedAt: Number(legacySlot?.updatedAt) || Date.now(),
          });
      }

      const historicalGuideData = getHistoricalTemplateGuideDataForIsolationKey_ACU({ chat, isolationKey: normalizedKey });
      if (historicalGuideData && Object.keys(historicalGuideData).some(k => k.startsWith('sheet_'))) {
          return persistMigratedState(historicalGuideData, {
              source: 'legacy_history_frozen',
              updatedAt: Date.now(),
          });
      }

      const legacyHeaderGuideData = getLegacyHeaderGuideDataForIsolationKey_ACU({ chat, isolationKey: normalizedKey });
      if (legacyHeaderGuideData && Object.keys(legacyHeaderGuideData).some(k => k.startsWith('sheet_'))) {
          return persistMigratedState(legacyHeaderGuideData, {
              source: 'legacy_header_frozen',
              updatedAt: Date.now(),
          });
      }

      return null;
  }

  export function clearChatSheetGuideDataForIsolationKey_ACU({ chat = SillyTavern_API_ACU?.chat, isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const first = getChatFirstLayerMessage_ACU(chat);
      if (!first) return false;

      const container = getChatSheetGuideContainer_ACU(chat);
      if (!container || typeof container !== 'object' || !container.tags || typeof container.tags !== 'object') return false;

      const normalizedKey = String(isolationKey ?? '');
      if (!Object.prototype.hasOwnProperty.call(container.tags, normalizedKey)) return false;

      const nextContainer = cloneScopedConfigData_ACU(container, null) || { version: CHAT_SHEET_GUIDE_VERSION_ACU, tags: {} };
      if (!nextContainer.tags || typeof nextContainer.tags !== 'object') nextContainer.tags = {};
      delete nextContainer.tags[normalizedKey];

      if (Object.keys(nextContainer.tags).length === 0) {
          delete first[CHAT_SHEET_GUIDE_FIELD_ACU];
      } else {
          nextContainer.version = CHAT_SHEET_GUIDE_VERSION_ACU;
          first[CHAT_SHEET_GUIDE_FIELD_ACU] = nextContainer;
      }
      return true;
  }

  export function getChatSheetGuideDataForIsolationKey_ACU(isolationKey) {
      const chat = SillyTavern_API_ACU?.chat;
      const normalizedKey = String(isolationKey ?? '');
      const scopedTemplateState = getCurrentChatTemplateScopeState_ACU({ chat, isolationKey: normalizedKey })
          || migrateLegacyTemplateScopeForCurrentChat_ACU({ chat, isolationKey: normalizedKey });
      const scopedGuideData = normalizeGuideData_ACU(scopedTemplateState?.guideData);
      if (scopedGuideData && Object.keys(scopedGuideData).some(k => k.startsWith('sheet_'))) {
          return scopedGuideData;
      }

      const buildGuideDataFromTemplateSource_ACU = (templateSource) => {
          const templateSnapshot = sanitizeTemplateSnapshotForChat_ACU(templateSource);
          const guideData = buildChatSheetGuideDataFromTemplateObj_ACU(templateSnapshot?.templateObj, { stripSeedRows: false });
          return (guideData && Object.keys(guideData).some(k => k.startsWith('sheet_'))) ? guideData : null;
      };

      if (scopedTemplateState?.mode === 'chat_override' && scopedTemplateState?.templateStr) {
          const overrideGuideData = buildGuideDataFromTemplateSource_ACU(scopedTemplateState.templateStr);
          if (overrideGuideData) {
              return overrideGuideData;
          }
      }

      if (scopedTemplateState?.mode === 'preset_link') {
          const linkedPresetName = normalizeTemplatePresetSelectionValue_ACU(scopedTemplateState?.presetName || '');
          const linkedTemplateSource = linkedPresetName
              ? (getTemplatePreset_ACU(linkedPresetName)?.templateStr || null)
              : getDefaultTemplateSnapshot_ACU()?.templateStr;
          const linkedGuideData = buildGuideDataFromTemplateSource_ACU(linkedTemplateSource);
          if (linkedGuideData) {
              return linkedGuideData;
          }
      }

      const activeTemplateGuideData = buildGuideDataFromTemplateSource_ACU(TABLE_TEMPLATE_ACU);
      if (activeTemplateGuideData) {
          return activeTemplateGuideData;
      }

      const globalSnapshot = getGlobalTemplateSnapshotForCurrentProfile_ACU();
      const globalGuideData = buildChatSheetGuideDataFromTemplateObj_ACU(globalSnapshot?.templateObj, { stripSeedRows: false });
      if (globalGuideData && Object.keys(globalGuideData).some(k => k.startsWith('sheet_'))) {
          return globalGuideData;
      }

      return null;
  }

  export function setChatSheetGuideDataForIsolationKey_ACU(isolationKey, guideData, { reason = '', syncTemplateScope = false, templateSource = null, presetName = '', source = '', updatedAt = Date.now() } = {}) {
      const chat = SillyTavern_API_ACU?.chat;
      const first = getChatFirstLayerMessage_ACU(chat);
      if (!first) return false;

      const normalized = normalizeGuideData_ACU(guideData);
      if (!normalized || !Object.keys(normalized).some(k => k.startsWith('sheet_'))) return false;

      const normalizedKey = String(isolationKey ?? '');
      const existingTemplateScopeState = getCurrentChatTemplateScopeState_ACU({ chat, isolationKey: normalizedKey });
      const normalizedScopeMode = normalizeTemplateScopeMode_ACU(existingTemplateScopeState?.mode);
      const shouldSyncTemplateScope = !!syncTemplateScope || normalizedScopeMode === 'chat_override' || normalizedScopeMode === 'preset_link';
      const container = getChatSheetGuideContainer_ACU(chat) || { version: CHAT_SHEET_GUIDE_VERSION_ACU, tags: {} };
      if (!container.tags || typeof container.tags !== 'object') container.tags = {};
      container.version = CHAT_SHEET_GUIDE_VERSION_ACU;
      container.tags[normalizedKey] = {
          data: normalized,
          updatedAt,
          reason: String(reason || ''),
          templateScopeMode: shouldSyncTemplateScope ? 'chat_override' : 'inherit_global',
      };
      first[CHAT_SHEET_GUIDE_FIELD_ACU] = container;
      if (shouldSyncTemplateScope) {
          const fallbackTemplateSource = existingTemplateScopeState?.templateStr || materializeDataFromSheetGuide_ACU(normalized, { includeSeedRows: true });
          const resolvedTemplateSource = templateSource || fallbackTemplateSource;
          const currentGlobalPresetName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU({ requireExisting: false }));
          const resolvedPresetName = normalizeTemplatePresetSelectionValue_ACU(
              presetName || existingTemplateScopeState?.presetName || currentGlobalPresetName,
          );
          const resolvedSource = normalizeChatScopedConfigSource_ACU(
              source,
              existingTemplateScopeState?.source || (syncTemplateScope ? 'ui' : 'inherit'),
          );
          const templateState = buildChatTemplateScopeStateFromCurrent_ACU({
              isolationKey: normalizedKey,
              presetName: resolvedPresetName,
              source: resolvedSource,
              originGlobalName: normalizeTemplatePresetSelectionValue_ACU(
                  existingTemplateScopeState?.originGlobalName || currentGlobalPresetName,
              ),
              originGlobalRevision: Number.isFinite(existingTemplateScopeState?.originGlobalRevision)
                  ? existingTemplateScopeState.originGlobalRevision
                  : 0,
              updatedAt,
              templateSource: resolvedTemplateSource,
              guideData: normalized,
          });
          if (templateState) {
              setCurrentChatTemplateScopeState_ACU(templateState, {
                  isolationKey: normalizedKey,
                  reason: String(reason || `template_scope_${resolvedSource}`),
              });
              try {
                  upsertChatTemplatePresetEntry_ACU(templateState, { isolationKey: normalizedKey });
              } catch (e) {}
          }
      }
      return true;
  }

  // =========================
  // [新增] seedRows 解析/兜底：用于 $0 注入与"无数据初始化"场景
  // 目标：
  // - 新对话首次填表时，即使 currentJsonTableData_ACU 仅有表结构，也能从"内部指导表/模板"取到 seedRows
  // - 支持隔离标签切换或初始化早期 chat 尚未加载导致的"指导表未命中"情况
  // 注意：这里只把 seedRows 挂在表对象字段上，不会写入 content（不把模板基础数据当作真实聊天数据）
  // =========================
  let _seedRowsTemplateCacheStr_ACU = null;
  let _seedRowsTemplateCacheObj_ACU = null;

  function getTemplateObjForSeedRows_ACU() {
      try {
          if (_seedRowsTemplateCacheStr_ACU === TABLE_TEMPLATE_ACU && _seedRowsTemplateCacheObj_ACU) return _seedRowsTemplateCacheObj_ACU;
          const obj = parseTableTemplateJson_ACU({ stripSeedRows: false });
          _seedRowsTemplateCacheStr_ACU = TABLE_TEMPLATE_ACU;
          _seedRowsTemplateCacheObj_ACU = obj;
          return obj;
      } catch (e) {
          return null;
      }
  }

  export async function ensureChatSheetGuideSeeded_ACU({ reason = 'auto_seed_seedRows', force = false } = {}) {
      try {
          const isolationKey = getCurrentIsolationKey_ACU();
          const existing = getChatSheetGuideDataForIsolationKey_ACU(isolationKey);
          const hasExisting = !!(existing && typeof existing === 'object' && Object.keys(existing).some(k => k.startsWith('sheet_')));
          if (hasExisting && !force) return existing;

          const chat = SillyTavern_API_ACU?.chat;
          if (!chat || !Array.isArray(chat) || chat.length === 0) return existing || null;

          const templateObj = getTemplateObjForSeedRows_ACU();
          if (!templateObj) return existing || null;

          // 用模板构建指导表（content 保留表头；seedRows 写入字段）
          const guideData = buildChatSheetGuideDataFromTemplateObj_ACU(templateObj, { stripSeedRows: true });
          if (!guideData) return existing || null;

          const ok = setChatSheetGuideDataForIsolationKey_ACU(isolationKey, guideData, { reason });
          if (ok) {
              try { await SillyTavern_API_ACU.saveChat(); } catch (e) {}
              logDebug_ACU(`[SheetGuide] Auto-seeded chat sheet guide for tag [${isolationKey || '无标签'}], reason=${reason}`);
          }
          return guideData;
      } catch (e) {
          return null;
      }
  }

  function pickAnyGuideSeedRowsSlot_ACU(sheetKey) {
      try {
          const chat = SillyTavern_API_ACU?.chat;
          let best = null; // { ts, seedRows }
          const applyCandidate = (ts, data) => {
              const sr = data?.[sheetKey]?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU];
              if (!Array.isArray(sr) || sr.length === 0) return;
              if (!best || ts > best.ts) {
                  best = { ts, seedRows: sr };
              }
          };

          const scopedContainer = getChatScopedConfigContainer_ACU(chat);
          const scopedTemplateSlots = scopedContainer?.template;
          if (scopedTemplateSlots && typeof scopedTemplateSlots === 'object' && !Array.isArray(scopedTemplateSlots)) {
              Object.keys(scopedTemplateSlots).forEach(tagKey => {
                  const slotState = normalizeChatTemplateScopeState_ACU(scopedTemplateSlots[tagKey], { isolationKey: tagKey });
                  if (slotState.mode !== 'chat_override') return;
                  applyCandidate(Number(slotState.updatedAt) || 0, normalizeGuideData_ACU(slotState.guideData));
              });
          }
          if (best) {
              return JSON.parse(JSON.stringify(best.seedRows));
          }

          const container = getChatSheetGuideContainer_ACU(chat);
          const tags = container?.tags;
          if (!tags || typeof tags !== 'object') return null;
          Object.keys(tags).forEach(tagKey => {
              const slot = tags[tagKey];
              const ts = Number(slot?.updatedAt) || 0;
              applyCandidate(ts, normalizeGuideData_ACU(slot?.data));
          });
          return best ? JSON.parse(JSON.stringify(best.seedRows)) : null;
      } catch (e) {
          return null;
      }
  }

  export function getEffectiveSeedRowsForSheet_ACU(sheetKey, { guideData = null, allowTemplateFallback = true } = {}) {
      try {
          if (!sheetKey || !String(sheetKey).startsWith('sheet_')) return [];
          const direct = currentJsonTableData_ACU?.[sheetKey]?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU];
          if (Array.isArray(direct) && direct.length > 0) return JSON.parse(JSON.stringify(direct));

          const g = guideData || (() => {
              const isolationKey = getCurrentIsolationKey_ACU();
              return getChatSheetGuideDataForIsolationKey_ACU(isolationKey);
          })();
          const sr1 = g?.[sheetKey]?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU];
          if (Array.isArray(sr1) && sr1.length > 0) return JSON.parse(JSON.stringify(sr1));

          const any = pickAnyGuideSeedRowsSlot_ACU(sheetKey);
          if (Array.isArray(any) && any.length > 0) return any;

          if (!allowTemplateFallback) return [];
          const templateObj = getTemplateObjForSeedRows_ACU();
          const tplRows = templateObj?.[sheetKey]?.content;
          if (Array.isArray(tplRows) && tplRows.length > 1) return JSON.parse(JSON.stringify(tplRows.slice(1)));
          return [];
      } catch (e) {
          return [];
      }
  }

  export function attachSeedRowsToCurrentDataFromGuide_ACU(guideData) {
      try {
          if (!currentJsonTableData_ACU || typeof currentJsonTableData_ACU !== 'object') return false;
          const g = normalizeGuideData_ACU(guideData);
          if (!g) return false;
          let changed = false;
          Object.keys(currentJsonTableData_ACU).forEach(k => {
              if (!k.startsWith('sheet_')) return;
              const table = currentJsonTableData_ACU[k];
              if (!table || typeof table !== 'object') return;
              const existing = table?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU];
              if (Array.isArray(existing) && existing.length > 0) return;
              const sr = g?.[k]?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU];
              if (Array.isArray(sr) && sr.length > 0) {
                  table[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = JSON.parse(JSON.stringify(sr));
                  changed = true;
              }
          });
          return changed;
      } catch (e) {
          return false;
      }
  }

  // [新增] 用"当前数据"构建空白指导表：只保留表头行 + 参数（顺序由 getSortedSheetKeys_ACU 的旧逻辑决定，避免递归）
  export function buildChatSheetGuideDataFromData_ACU(dataObj, { preserveSeedRowsFromGuideData = null, seedRowsFromTemplateObj = null, orderedKeys = null } = {}) {
      if (!dataObj || typeof dataObj !== 'object') return null;
      const keys = Array.isArray(orderedKeys) && orderedKeys.length
          ? orderedKeys.filter(k => typeof k === 'string' && k.startsWith('sheet_') && dataObj[k])
          : getSortedSheetKeys_ACU(dataObj, { ignoreChatGuide: true });
      const out: any = { mate: { type: 'chatSheets', version: CHAT_SHEET_GUIDE_VERSION_ACU } };
      if (dataObj.mate && typeof dataObj.mate === 'object') {
          out.mate = JSON.parse(JSON.stringify(dataObj.mate));
      }
      out.mate.globalInjectionConfig = ensureGlobalInjectionConfigDefaults_ACU(out.mate.globalInjectionConfig);
      keys.forEach(k => {
          const s = dataObj[k];
          if (!s) return;
          const headerRow = Array.isArray(s.content) && Array.isArray(s.content[0]) ? JSON.parse(JSON.stringify(s.content[0])) : [null];
          const blank = {
              uid: s.uid || k,
              name: s.name || k,
              sourceData: s.sourceData ? JSON.parse(JSON.stringify(s.sourceData)) : { note: '', initNode: '', insertNode: '', updateNode: '', deleteNode: '' },
              content: [headerRow],
              updateConfig: s.updateConfig ? JSON.parse(JSON.stringify(s.updateConfig)) : { uiSentinel: -1, contextDepth: -1, updateFrequency: -1, batchSize: -1, skipFloors: -1, sendLatestRows: -1, groupId: -1 },
              exportConfig: ensureExportConfigDefaults_ACU(
                  s.exportConfig ? JSON.parse(JSON.stringify(s.exportConfig)) : null,
                  s.name || k
              ),
          };
          // 需求4：结构/表名/参数变更时，仅更新指导表元信息，不修改"基础数据(seedRows)"
          const preserved = preserveSeedRowsFromGuideData?.[k]?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU];
          if (Array.isArray(preserved)) {
              blank[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = JSON.parse(JSON.stringify(preserved));
          } else {
              // 需求1：首次生成指导表时，把模板预置数据写入 seedRows（仅在未能从既有指导表继承时）
              const tplRows = seedRowsFromTemplateObj?.[k]?.content;
              if (Array.isArray(tplRows) && tplRows.length > 1) {
                  blank[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = JSON.parse(JSON.stringify(tplRows.slice(1)));
              }
          }
          if (Number.isFinite(s?.[TABLE_ORDER_FIELD_ACU])) blank[TABLE_ORDER_FIELD_ACU] = Math.trunc(s[TABLE_ORDER_FIELD_ACU]);
          out[k] = blank;
      });
      return normalizeGuideData_ACU(out);
  }

  // [新增] 用"模板对象"构建空白指导表：只保留表头行 + 参数（模板已有顺序编号）
  export function buildChatSheetGuideDataFromTemplateObj_ACU(templateObj, { stripSeedRows = true } = {}) {
      if (!templateObj || typeof templateObj !== 'object') return null;
      const keys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
      if (keys.length === 0) return null;
      // 确保模板编号稳定（缺失则补齐）
      try { ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: keys, forceRebuild: false }); } catch (e) {}
      const sorted = keys.sort((a, b) => {
          const ao = Number.isFinite(templateObj?.[a]?.[TABLE_ORDER_FIELD_ACU]) ? Math.trunc(templateObj[a][TABLE_ORDER_FIELD_ACU]) : Infinity;
          const bo = Number.isFinite(templateObj?.[b]?.[TABLE_ORDER_FIELD_ACU]) ? Math.trunc(templateObj[b][TABLE_ORDER_FIELD_ACU]) : Infinity;
          if (ao !== bo) return ao - bo;
          return String(a).localeCompare(String(b));
      });
      const out: any = { mate: { type: 'chatSheets', version: CHAT_SHEET_GUIDE_VERSION_ACU } };
      if (templateObj.mate && typeof templateObj.mate === 'object') {
          out.mate = JSON.parse(JSON.stringify(templateObj.mate));
      }
      out.mate.globalInjectionConfig = ensureGlobalInjectionConfigDefaults_ACU(out.mate.globalInjectionConfig);
      sorted.forEach((k, idx) => {
          const base = JSON.parse(JSON.stringify(templateObj[k] || {}));
          base.uid = base.uid || k;
          base.name = base.name || k;
          if (!Array.isArray(base.content) || base.content.length === 0) base.content = [[null]];
          // v2: 保存模板预置数据为 seedRows，但指导表本体 content 仍只保留表头
          if (Array.isArray(base.content) && base.content.length > 1) {
              base[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = JSON.parse(JSON.stringify(base.content.slice(1)));
          }
          if (stripSeedRows && Array.isArray(base.content) && base.content.length > 1) base.content = [base.content[0]];
          if (!Number.isFinite(base[TABLE_ORDER_FIELD_ACU])) base[TABLE_ORDER_FIELD_ACU] = idx;
          out[k] = base;
      });
      return normalizeGuideData_ACU(out);
  }

  // [新增] 覆盖式更新：用模板写入当前聊天第一层"空白指导表"
  export async function overwriteChatSheetGuideFromTemplate_ACU(templateObj, { reason = 'template_changed', stripSeedRows = true, presetName = '', source = 'ui', syncTemplateScope = false, registerPreset = false } = {}) {
      const guideData = buildChatSheetGuideDataFromTemplateObj_ACU(templateObj, { stripSeedRows });
      if (!guideData) return false;
      const isolationKey = getCurrentIsolationKey_ACU();
      const templateSnapshot = sanitizeTemplateSnapshotForChat_ACU(templateObj);
      const normalizedPresetName = deriveTemplatePresetNameForImport_ACU({ presetName });
      if (registerPreset && normalizedPresetName && templateSnapshot?.templateStr) {
          try {
              const savePresetOk = upsertTemplatePreset_ACU(normalizedPresetName, templateSnapshot.templateStr);
              if (!savePresetOk) {
                  logWarn_ACU(`[TemplateScope] 保存模板预设失败：${normalizedPresetName}`);
              }
          } catch (e) {
              logWarn_ACU('[TemplateScope] 保存模板预设失败:', e);
          }
      }
      const ok = setChatSheetGuideDataForIsolationKey_ACU(isolationKey, guideData, {
          reason,
          syncTemplateScope,
          templateSource: templateSnapshot?.templateStr || templateObj,
          presetName: normalizedPresetName,
          source,
      });
      if (!ok) return false;
      if (syncTemplateScope) {
          try { applyTemplateScopeForCurrentChat_ACU(); } catch (e) {}
      }
      try { await SillyTavern_API_ACU.saveChat(); } catch (e) {}
      try { await refreshMergedDataAndNotify_ACU(); } catch (e) {}
      return true;
  }

  // [表格顺序新机制] 获取表格 keys：
  // - 若当前聊天已存在"空白指导表"：优先按指导表的 orderNo 顺序（可过滤不在指导表里的表）
  // - 否则：按"编号(orderNo)从小到大"排序；缺编号则回退到模板编号/模板顺序
  export function getSortedSheetKeys_ACU(dataObj, { ignoreChatGuide = false, includeMissingFromGuide = false } = {}) {
      if (!dataObj || typeof dataObj !== 'object') return [];
      const existingKeys = Object.keys(dataObj).filter(k => k.startsWith('sheet_'));
      if (existingKeys.length === 0) return [];

      // [新增] 聊天级空白指导表：一旦存在，则该聊天不再按模板顺序合并/显示，而是按此指导表作为总指导
      if (!ignoreChatGuide) {
          try {
              const isolationKey = (typeof getCurrentIsolationKey_ACU === 'function') ? getCurrentIsolationKey_ACU() : '';
              const guideData = getChatSheetGuideDataForIsolationKey_ACU(isolationKey);
              if (guideData && typeof guideData === 'object') {
                  const guideKeys = Object.keys(guideData).filter(k => k.startsWith('sheet_'));
                  if (guideKeys.length > 0) {
                      const sorted = guideKeys.sort((a, b) => {
                          const ao = Number.isFinite(guideData?.[a]?.[TABLE_ORDER_FIELD_ACU]) ? Math.trunc(guideData[a][TABLE_ORDER_FIELD_ACU]) : Infinity;
                          const bo = Number.isFinite(guideData?.[b]?.[TABLE_ORDER_FIELD_ACU]) ? Math.trunc(guideData[b][TABLE_ORDER_FIELD_ACU]) : Infinity;
                          if (ao !== bo) return ao - bo;
                          return String(a).localeCompare(String(b));
                      });
                      return includeMissingFromGuide ? sorted : sorted.filter(k => dataObj[k]);
                  }
              }
          } catch (e) {
              // ignore guide failures; fallback to legacy ordering
          }
      }

      // 尝试拿模板做兜底（比如老数据/导入数据缺编号）
      const templateObj = parseTableTemplateJson_ACU({ stripSeedRows: false });

      // 先对 dataObj 补齐缺失编号（仅在确实缺失/重复时重建）
      // baseOrderKeys 的优先级：模板顺序 > 当前对象键顺序（保证"载入模板编好号"后的稳定性）
      const baseKeys = (() => {
          const tk = templateObj && typeof templateObj === 'object'
              ? Object.keys(templateObj).filter(k => k.startsWith('sheet_'))
              : [];
          return tk.length ? tk : existingKeys;
      })();
      ensureSheetOrderNumbers_ACU(dataObj, { baseOrderKeys: baseKeys, forceRebuild: false });

      const orderValueOf = (k) => {
          const v = dataObj?.[k]?.[TABLE_ORDER_FIELD_ACU];
          if (Number.isFinite(v)) return Math.trunc(v);
          const tv = templateObj?.[k]?.[TABLE_ORDER_FIELD_ACU];
          if (Number.isFinite(tv)) return Math.trunc(tv);
          return Infinity;
      };

      return existingKeys.sort((a, b) => {
          const ao = orderValueOf(a);
          const bo = orderValueOf(b);
          if (ao !== bo) return ao - bo;
          // 稳定排序：同编号时按名称/键
          const an = String(dataObj?.[a]?.name || templateObj?.[a]?.name || a);
          const bn = String(dataObj?.[b]?.name || templateObj?.[b]?.name || b);
          const c = an.localeCompare(bn);
          if (c !== 0) return c;
          return String(a).localeCompare(String(b));
      });
  }

  // [新增] 基于"空白指导表"构建可合并的骨架数据（深拷贝，避免后续修改污染原对象）
  export function buildGuidedBaseDataFromSheetGuide_ACU(guideData) {
      const normalized = normalizeGuideData_ACU(guideData);
      if (!normalized) return { mate: { type: 'chatSheets', version: 1 } };
      try { return JSON.parse(JSON.stringify(normalized)); } catch (e) { return normalized; }
  }

  // [修复] 按指定顺序重建对象键，避免 Object.keys()/合并/深拷贝导致的顺序漂移
  export function reorderDataBySheetKeys_ACU(dataObj, orderedSheetKeys) {
      if (!dataObj || typeof dataObj !== 'object') return dataObj;
      const out: any = {};
      // 先保留非 sheet_ 键（mate 等）
      Object.keys(dataObj).forEach(k => {
          if (!k.startsWith('sheet_')) out[k] = dataObj[k];
      });
      // 再按顺序插入 sheet_ 键
      const keys = Array.isArray(orderedSheetKeys) ? orderedSheetKeys : getSortedSheetKeys_ACU(dataObj);
      keys.forEach(k => {
          if (dataObj[k]) out[k] = dataObj[k];
      });
      return out;
  }

  // =========================
  // [瘦身/兼容] ChatSheets 表格对象清洗（用于：导出、写入聊天记录、持久化模板）
  // 目标：
  // - 与旧模板/旧存档兼容：导入时允许存在冗余字段
  // - 从现在开始：导出/保存时不再携带历史遗留冗余字段，降低体积
  // =========================
  const SHEET_KEEP_KEYS_ACU = new Set([
      'uid',
      'name',
      'sourceData',
      'content',
      // [重要] 可视化编辑器/表格配置（更新频率、上下文深度等）依赖该字段
      'updateConfig',
      'exportConfig',
      TABLE_ORDER_FIELD_ACU, // orderNo
  ]);

  export function sanitizeSheetForStorage_ACU(sheet) {
      if (!sheet || typeof sheet !== 'object') return sheet;
      const out: any = {};
      SHEET_KEEP_KEYS_ACU.forEach(k => {
          if (sheet[k] !== undefined) out[k] = sheet[k];
      });
      // 兜底：保证结构可被模板导入验证通过
      if (!out.name && sheet.name) out.name = sheet.name;
      if (!out.content && Array.isArray(sheet.content)) out.content = sheet.content;
      if (!out.sourceData && sheet.sourceData) out.sourceData = sheet.sourceData;
      out.exportConfig = ensureExportConfigDefaults_ACU(out.exportConfig, out.name || sheet.name || sheet.uid || '');
      return out;
  }

  export function sanitizeChatSheetsObject_ACU(dataObj, { ensureMate = false } = {}) {
      if (!dataObj || typeof dataObj !== 'object') return dataObj;
      const out: any = {};
      Object.keys(dataObj).forEach(k => {
          if (k.startsWith('sheet_')) {
              out[k] = sanitizeSheetForStorage_ACU(dataObj[k]);
          } else if (k === 'mate') {
              out.mate = dataObj.mate;
          } else {
              // 其它顶层键：为兼容保留
              out[k] = dataObj[k];
          }
      });
      if (ensureMate) {
          if (!out.mate || typeof out.mate !== 'object') out.mate = { type: 'chatSheets', version: 1 };
          if (!out.mate.type) out.mate.type = 'chatSheets';
          if (!out.mate.version) out.mate.version = 1;
      }
      return out;
  }



  // [新增] 辅助函数：从上下文中提取指定标签的内容（正文标签提取）
