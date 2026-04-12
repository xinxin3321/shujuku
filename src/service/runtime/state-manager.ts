/**
 * service/runtime/state-manager.ts — Re-export 门面
 * 
 * 此文件已拆分为三处：
 * - shared/host-api.ts        — 宿主 API 引用（SillyTavern_API、jQuery_API 等）
 * - presentation/state/ui-refs.ts — UI jQuery 元素引用（$popupInstance、$xxx 等）
 * - 本文件保留                — 业务状态 + 门控逻辑（settings、generationGate 等）
 * 
 * 为保持向后兼容，本文件 re-export 所有三处的符号。
 * 后续逐步将各文件的 import 路径改为直接引用新位置。
 */

// ═══ 从 shared/host-api.ts re-export ═══
export {
  SillyTavern_API_ACU, TavernHelper_API_ACU, jQuery_API_ACU, toastr_API_ACU,
  _set_SillyTavern_API_ACU, _set_TavernHelper_API_ACU, _set_jQuery_API_ACU, _set_toastr_API_ACU
} from '../../shared/host-api';

// ═══ 从 presentation/state/ui-refs.ts re-export ═══
export {
  $popupInstance_ACU, _set_$popupInstance_ACU, _assignUIPlaceholders_ACU,
  $apiConfigSectionToggle_ACU, $apiConfigAreaDiv_ACU,
  $customApiUrlInput_ACU, $customApiKeyInput_ACU,
  $customApiModelInput_ACU, $customApiModelSelect_ACU,
  $maxTokensInput_ACU, $temperatureInput_ACU,
  $loadModelsButton_ACU, $saveApiConfigButton_ACU, $clearApiConfigButton_ACU,
  $apiStatusDisplay_ACU,
  $charCardPromptToggle_ACU, $charCardPromptAreaDiv_ACU,
  $charCardPromptSegmentsContainer_ACU,
  $saveCharCardPromptButton_ACU, $resetCharCardPromptButton_ACU,
  $plotPromptSegmentsContainer_ACU, $plotTaskListContainer_ACU,
  $autoUpdateThresholdInput_ACU, $saveAutoUpdateThresholdButton_ACU,
  $autoUpdateTokenThresholdInput_ACU, $saveAutoUpdateTokenThresholdButton_ACU,
  $autoUpdateFrequencyInput_ACU, $saveAutoUpdateFrequencyButton_ACU,
  $updateBatchSizeInput_ACU, $saveUpdateBatchSizeButton_ACU,
  $maxConcurrentGroupsInput_ACU,
  $autoUpdateEnabledCheckbox_ACU, $standardizedTableFillEnabledCheckbox_ACU,
  $toastMuteEnabledCheckbox_ACU, $promptTemplateEnabledCheckbox_ACU,
  $tableEditLastPairOnlyCheckbox_ACU, $tableMaxRetriesInput_ACU,
  $manualUpdateCardButton_ACU, $statusMessageSpan_ACU,
  $cardUpdateStatusDisplay_ACU, $useMainApiCheckbox_ACU,
  $streamingEnabledCheckbox_ACU, $manualExtraHintCheckbox_ACU,
  $skipUpdateFloorsInput_ACU, $saveSkipUpdateFloorsButton_ACU,
  $retainRecentLayersInput_ACU, $saveRetainRecentLayersButton_ACU,
  $manualTableSelector_ACU, $manualTableSelectAll_ACU, $manualTableSelectNone_ACU,
  $importTableSelector_ACU, $importTableSelectAll_ACU, $importTableSelectNone_ACU
} from '../../presentation/state/ui-refs';

// ═══ 业务状态 + 门控逻辑（保留在本文件） ═══

import { DEFAULT_CHAR_CARD_PROMPT_ACU, DEFAULT_PLOT_SETTINGS_ACU } from '../../data/models/defaults-json.js';
import { DEFAULT_AUTO_UPDATE_FREQUENCY_ACU, DEFAULT_AUTO_UPDATE_THRESHOLD_ACU, DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU } from '../../data/models/defaults';
import { SillyTavern_API_ACU } from '../../shared/host-api';

export const NEW_MESSAGE_DEBOUNCE_DELAY_ACU = 500;

export const TABLE_ORDER_FIELD_ACU = 'orderNo';
export let pendingBaseStatePlacement_ACU = false;
export let suppressWorldbookInjectionInGreeting_ACU = false;

export const loopState_ACU = {
  isLooping: false,
  isRetrying: false,
  timerId: null,
  retryCount: 0,
  startTime: 0,
  totalDuration: 0,
  tickInterval: null,
  awaitingReply: false,
};

export const planningGuard_ACU = {
  inProgress: false,
  ignoreNextGenerationEndedCount: 0,
};

export let abortController_ACU: any = null;
export let isProcessing_Plot_ACU = false;
export let tempPlotToSave_ACU: any = null;

export const USER_SEND_TRIGGER_TTL_MS_ACU = 12000;
export const generationGate_ACU = {
  lastUserMessageId: null,
  lastUserMessageText: '',
  lastUserMessageAt: 0,
  lastUserSendIntentAt: 0,
  lastGeneration: null as any,
};

export function markUserSendIntent_ACU() {
  generationGate_ACU.lastUserSendIntentAt = Date.now();
}

export function installSendIntentCaptureHooks_ACU() {
  try {
    const parentDoc = SillyTavern_API_ACU?.Chat?.document
      ? SillyTavern_API_ACU.Chat.document
      : (window.parent || window).document;
    const doc = parentDoc || document;

    if (!(window as any).__ACU_sendIntentHooksInstalled) {
      (window as any).__ACU_sendIntentHooksInstalled = { send: false, enter: false };
    }

    const sendBtn = doc.getElementById('send_but');
    if (sendBtn && !(window as any).__ACU_sendIntentHooksInstalled.send) {
      sendBtn.addEventListener('click', () => markUserSendIntent_ACU(), true);
      sendBtn.addEventListener('pointerup', () => markUserSendIntent_ACU(), true);
      sendBtn.addEventListener('touchend', () => markUserSendIntent_ACU(), true);
      (window as any).__ACU_sendIntentHooksInstalled.send = true;
    }

    const ta = doc.getElementById('send_textarea');
    if (ta && !(window as any).__ACU_sendIntentHooksInstalled.enter) {
      ta.addEventListener('keydown', (e) => {
        try {
          const key = e.key || e.code;
          if ((key === 'Enter' || key === 'NumpadEnter') && !e.shiftKey) {
            markUserSendIntent_ACU();
          }
        } catch (err) {}
      }, true);
      (window as any).__ACU_sendIntentHooksInstalled.enter = true;
    }

    if ((!sendBtn || !ta) && !(window as any).__ACU_sendIntentHooksRetryScheduled) {
      (window as any).__ACU_sendIntentHooksRetryScheduled = true;
      setTimeout(() => {
        (window as any).__ACU_sendIntentHooksRetryScheduled = false;
        installSendIntentCaptureHooks_ACU();
      }, 1200);
    }
  } catch (e) {
    // ignore
  }
}

export function isRecentUserSendIntent_ACU() {
  if (!generationGate_ACU.lastUserSendIntentAt) return false;
  return (Date.now() - generationGate_ACU.lastUserSendIntentAt) <= USER_SEND_TRIGGER_TTL_MS_ACU;
}

export function recordLastUserSend_ACU(messageId) {
  try {
    const chat = SillyTavern_API_ACU?.chat;
    const msg = (chat && typeof messageId === 'number') ? chat[messageId] : null;
    if (!msg || !msg.is_user) return;
    generationGate_ACU.lastUserMessageId = messageId;
    generationGate_ACU.lastUserMessageText = String(msg.mes || '');
    generationGate_ACU.lastUserMessageAt = Date.now();
  } catch (e) {
    // ignore
  }
}

export function recordGenerationContext_ACU(type, params, dryRun) {
  generationGate_ACU.lastGeneration = { type, params, dryRun, at: Date.now() };
}

export function isQuietLikeGeneration_ACU(type, params) {
  if (type === 'quiet') return true;
  if (params && typeof params.quiet_prompt === 'string' && params.quiet_prompt.trim().length > 0) return true;
  return false;
}

export function isRecentUserSend_ACU() {
  if (!generationGate_ACU.lastUserMessageAt) return false;
  return (Date.now() - generationGate_ACU.lastUserMessageAt) <= USER_SEND_TRIGGER_TTL_MS_ACU;
}

export function shouldProcessPlotForGeneration_ACU(type, params, dryRun) {
  if (dryRun) return false;
  if (!settings_ACU?.plotSettings?.enabled) return false;
  if (isQuietLikeGeneration_ACU(type, params)) return false;
  if (params?.automatic_trigger) return false;
  const chat = SillyTavern_API_ACU?.chat;
  const id = generationGate_ACU.lastUserMessageId;
  const msg = (chat && typeof id === 'number') ? chat[id] : null;
  const hasFreshUserMessage = !!(msg && msg.is_user && id === (chat.length - 1) && isRecentUserSend_ACU());
  const hasFreshIntent = isRecentUserSendIntent_ACU();
  return hasFreshUserMessage || hasFreshIntent;
}

export function shouldProcessAutoTableUpdateForGenerationEnded_ACU() {
  const g = generationGate_ACU.lastGeneration;
  if (!g) return true;
  if (g.dryRun) return false;
  if (isQuietLikeGeneration_ACU(g.type, g.params)) return false;
  return true;
}

// ═══ 业务运行时状态 ═══
export let coreApisAreReady_ACU = false;
export let allChatMessages_ACU: any[] = [];
export let lastTotalAiMessages_ACU = 0;
export let currentChatFileIdentifier_ACU: any = 'unknown_chat_init';
export let currentJsonTableData_ACU: any = null;
export let independentTableStates_ACU: any = {};

export let settings_ACU: any = {
    apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 60000, temperature: 1.0 },
    apiMode: 'custom',
    streamingEnabled: false,
    tavernProfile: '',
    apiPresets: [],
    tableApiPreset: '',
    plotApiPreset: '',
    charCardPrompt: DEFAULT_CHAR_CARD_PROMPT_ACU,
    autoUpdateThreshold: DEFAULT_AUTO_UPDATE_THRESHOLD_ACU,
    autoUpdateFrequency: DEFAULT_AUTO_UPDATE_FREQUENCY_ACU,
    autoUpdateTokenThreshold: DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU,
    updateBatchSize: 3,
    maxConcurrentGroups: 1,
    autoUpdateEnabled: true,
    standardizedTableFillEnabled: true,
    toastMuteEnabled: false,
    plotSettings: JSON.parse(JSON.stringify(DEFAULT_PLOT_SETTINGS_ACU)),
    plotPresetBindings: {},
    currentTemplatePresetName: '',
    tableContextExtractTags: '',
    tableContextExtractRules: [],
    tableContextExcludeTags: '',
    tableContextExcludeRules: [],
    tableEditLastPairOnly: true,
    tableMaxRetries: 3,
    importSplitSize: 10000,
    skipUpdateFloors: 0,
    retainRecentLayers: 100,
    tableKeyOrder: [],
    manualSelectedTables: [],
    hasManualSelection: false,
    importSelectedTables: [],
    hasImportTableSelection: false,
    tableUpdateLocks: {},
    specialIndexLocks: {},
    importWorldbookTarget: '',
    importPromptExcludeImportedWorldbookEntries: true,
    zeroTkOccupyModeDefault: false,
    dataIsolationEnabled: false,
    dataIsolationCode: '',
    dataIsolationHistory: [],
    promptTemplateSettings: {
      enabled: true,
      maxNestingDepth: 10,
      debugMode: false
    },
    contentOptimizationSettings: {
      enabled: false,
      apiPreset: '',
      seamlessMode: true,
      autoApply: true,
      showDiff: true,
      minLength: 100,
      maxOptimizations: 10,
      loopCount: 1,
      retryCount: 3,
      promptGroup: [],
    },
    characterSettings: {},
};

export function getCurrentIsolationKey_ACU() {
    return settings_ACU.dataIsolationEnabled ? (settings_ACU.dataIsolationCode || '') : '';
}

// ═══ Setter 函数 ═══
export function _set_settings_ACU(v: any) { settings_ACU = v; }
export function _set_currentJsonTableData_ACU(v: any) { currentJsonTableData_ACU = v; }
export function _set_currentChatFileIdentifier_ACU(v: any) { currentChatFileIdentifier_ACU = v; }
export function _set_coreApisAreReady_ACU(v: any) { coreApisAreReady_ACU = v; }
export function _set_allChatMessages_ACU(v: any) { allChatMessages_ACU = v; }
export function _set_lastTotalAiMessages_ACU(v: any) { lastTotalAiMessages_ACU = v; }
export function _set_isProcessing_Plot_ACU(v: any) { isProcessing_Plot_ACU = v; }
export function _set_abortController_ACU(v: any) { abortController_ACU = v; }
export function _set_tempPlotToSave_ACU(v: any) { tempPlotToSave_ACU = v; }
export function _set_pendingBaseStatePlacement_ACU(v: any) { pendingBaseStatePlacement_ACU = v; }
export function _set_suppressWorldbookInjectionInGreeting_ACU(v: any) { suppressWorldbookInjectionInGreeting_ACU = v; }
export function _set_independentTableStates_ACU(v: any) { independentTableStates_ACU = v; }
