/**
 * service/runtime/state-manager.ts — ACU_State 全局状态管理 + 生成门控
 * 从 src/core/02_storage_and_profile.js:624~793 迁移而来。
 */
  const NEW_MESSAGE_DEBOUNCE_DELAY_ACU = 500; // 0.5秒防抖延迟 (可调整)
  
  // --- [表格顺序新机制] ---
  // 旧机制使用 settings_ACU.tableKeyOrder 强制固定对象键顺序；新机制改为：每张表自带编号并按编号排序。
  // 编号会随模板导出/导入，且在可视化编辑器调整顺序时同步更新。
  const TABLE_ORDER_FIELD_ACU = 'orderNo'; // 每张表的顺序编号字段名（越小越靠前）
  // [新机制] 新建对话时，将"当前模板基础状态"注入到开场白（角色第一条AI消息）中，仅用于前端显示刷新
  // 注意：此动作不应触发世界书注入/数据更新链路
  let pendingBaseStatePlacement_ACU = false;
  // [健全性] 新对话开场白阶段抑制世界书注入（防止自动创建全局可见世界书条目）
  // 该抑制仅在"开场白阶段（无任何用户消息）"生效；一旦用户开始对话（出现用户消息）自动解除。
  let suppressWorldbookInjectionInGreeting_ACU = false;

  // --- [剧情推进] 相关常量 ---
  // [已迁移到 src/data/constants.ts] STORAGE_KEY_PLOT_SETTINGS_ACU

  // [剧情推进] 循环状态管理
  const loopState_ACU = {
    isLooping: false,
    isRetrying: false, // 标记当前是否处于重试流程
    timerId: null,
    retryCount: 0,
    startTime: 0, // 循环开始时间
    totalDuration: 0, // 总时长(ms)
    tickInterval: null, // 倒计时更新定时器
    awaitingReply: false, // 是否正在等待本轮生成结果（用于 GENERATION_ENDED 检测）
  };

  // [剧情推进] 规划阶段防护
  const planningGuard_ACU = {
    inProgress: false,
    // 规划阶段如果使用 useMainApi(generateRaw)，通常会触发一次 GENERATION_ENDED。用计数精确忽略。
    ignoreNextGenerationEndedCount: 0,
  };

  // [剧情推进] 规划任务中止控制器
  let abortController_ACU = null;

  // [剧情推进] 防重入锁
  let isProcessing_Plot_ACU = false;

  // [剧情推进] 临时存储plot
  // 结构: { content: string, userInputHash: string, userInputText: string }
  let tempPlotToSave_ACU = null;

  // --- [触发门控] 防止其它插件/后台请求误触发"剧情推进/自动填表" ---
  // 目标：
  // 1) 剧情推进：仅在"用户真正发送了一条用户楼层"时触发（MESSAGE_SENT -> GENERATION_AFTER_COMMANDS）
  // 2) 自动填表：仅在"本次生成不是 quiet/后台生成"时触发（GENERATION_STARTED/AFTER -> GENERATION_ENDED）
  const USER_SEND_TRIGGER_TTL_MS_ACU = 12000; // 用户发送与生成之间的合理窗口
  const generationGate_ACU = {
    lastUserMessageId: null,
    lastUserMessageText: '',
    lastUserMessageAt: 0,
    // 用户"发送意图"时间戳：用于在 GENERATION_AFTER_COMMANDS（写入用户楼层之前）做预发送规划
    lastUserSendIntentAt: 0,
    lastGeneration: null, // { type, params, dryRun, at }
  };

  function markUserSendIntent_ACU() {
    generationGate_ACU.lastUserSendIntentAt = Date.now();
  }

  // 使用原生 capture 监听，确保在酒馆自身的 click/keydown 处理器之前记录"发送意图"
  function installSendIntentCaptureHooks_ACU() {
    try {
      const parentDoc = SillyTavern_API_ACU?.Chat?.document
        ? SillyTavern_API_ACU.Chat.document
        : (window.parent || window).document;
      const doc = parentDoc || document;

      if (!window.__ACU_sendIntentHooksInstalled) {
        window.__ACU_sendIntentHooksInstalled = { send: false, enter: false };
      }

      const sendBtn = doc.getElementById('send_but');
      if (sendBtn && !window.__ACU_sendIntentHooksInstalled.send) {
        sendBtn.addEventListener('click', () => markUserSendIntent_ACU(), true); // capture
        // 兼容：部分环境可能走 pointerup/touchend
        sendBtn.addEventListener('pointerup', () => markUserSendIntent_ACU(), true);
        sendBtn.addEventListener('touchend', () => markUserSendIntent_ACU(), true);
        window.__ACU_sendIntentHooksInstalled.send = true;
      }

      const ta = doc.getElementById('send_textarea');
      if (ta && !window.__ACU_sendIntentHooksInstalled.enter) {
        ta.addEventListener('keydown', (e) => {
          try {
            const key = e.key || e.code;
            if ((key === 'Enter' || key === 'NumpadEnter') && !e.shiftKey) {
              markUserSendIntent_ACU();
            }
          } catch (err) {}
        }, true); // capture
        window.__ACU_sendIntentHooksInstalled.enter = true;
      }

      // 元素可能尚未渲染：延迟重试一次
      if ((!sendBtn || !ta) && !window.__ACU_sendIntentHooksRetryScheduled) {
        window.__ACU_sendIntentHooksRetryScheduled = true;
        setTimeout(() => {
          window.__ACU_sendIntentHooksRetryScheduled = false;
          installSendIntentCaptureHooks_ACU();
        }, 1200);
      }
    } catch (e) {
      // ignore
    }
  }

  function isRecentUserSendIntent_ACU() {
    if (!generationGate_ACU.lastUserSendIntentAt) return false;
    return (Date.now() - generationGate_ACU.lastUserSendIntentAt) <= USER_SEND_TRIGGER_TTL_MS_ACU;
  }

  function recordLastUserSend_ACU(messageId) {
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

  function recordGenerationContext_ACU(type, params, dryRun) {
    generationGate_ACU.lastGeneration = { type, params, dryRun, at: Date.now() };
  }

  function isQuietLikeGeneration_ACU(type, params) {
    // SillyTavern: quiet prompt 会带 quiet_prompt；type 也可能为 'quiet'
    if (type === 'quiet') return true;
    if (params && typeof params.quiet_prompt === 'string' && params.quiet_prompt.trim().length > 0) return true;
    // 某些插件会用 quietToLoud 但仍携带 quiet_prompt；上面已覆盖
    return false;
  }

  function isRecentUserSend_ACU() {
    if (!generationGate_ACU.lastUserMessageAt) return false;
    return (Date.now() - generationGate_ACU.lastUserMessageAt) <= USER_SEND_TRIGGER_TTL_MS_ACU;
  }

  function shouldProcessPlotForGeneration_ACU(type, params, dryRun) {
    if (dryRun) return false;
    if (!settings_ACU?.plotSettings?.enabled) return false;
    if (isQuietLikeGeneration_ACU(type, params)) return false;
    // 剧情推进仅响应"用户发送触发的生成"，避免其它插件/自动模式误触发
    if (params?.automatic_trigger) return false;
    // 允许两种路径：
    // A) /send 等命令：用户楼层已写入 chat（MESSAGE_SENT 已发生）
    // B) 正常发送：此时 user 楼层尚未写入 chat，只能靠"发送意图"来判定
    const chat = SillyTavern_API_ACU?.chat;
    const id = generationGate_ACU.lastUserMessageId;
    const msg = (chat && typeof id === 'number') ? chat[id] : null;
    const hasFreshUserMessage = !!(msg && msg.is_user && id === (chat.length - 1) && isRecentUserSend_ACU());
    const hasFreshIntent = isRecentUserSendIntent_ACU();
    return hasFreshUserMessage || hasFreshIntent;
  }

  function shouldProcessAutoTableUpdateForGenerationEnded_ACU() {
    // 自动填表：只过滤 quiet/后台生成；允许 regenerate/swipe/automatic_trigger（只要确实影响聊天楼层）
    const g = generationGate_ACU.lastGeneration;
    if (!g) return true; // 兼容老行为：无上下文时不强行阻断
    if (g.dryRun) return false;
    if (isQuietLikeGeneration_ACU(g.type, g.params)) return false;
    return true;
  }

// [从 02_storage_and_profile.js:2777~2938 迁移] 核心全局变量 + settings 对象
  let SillyTavern_API_ACU, TavernHelper_API_ACU, jQuery_API_ACU, toastr_API_ACU;
  let coreApisAreReady_ACU = false;
  let allChatMessages_ACU = [];
  let lastTotalAiMessages_ACU = 0; // 记录上次检查时的AI消息总数
  let currentChatFileIdentifier_ACU = 'unknown_chat_init';
  let currentJsonTableData_ACU = null; // Holds the parsed JSON table for the current chat
  let $popupInstance_ACU = null;

  // [新增] 独立表格更新状态追踪
  let independentTableStates_ACU = {};
  // 结构: { [sheetKey]: { lastUpdatedAiFloor: 0 } }

  // UI jQuery Object Placeholders
  let $apiConfigSectionToggle_ACU,
    $apiConfigAreaDiv_ACU,
    $customApiUrlInput_ACU,
    $customApiKeyInput_ACU,
    $customApiModelInput_ACU,
    $customApiModelSelect_ACU,
    $maxTokensInput_ACU,
    $temperatureInput_ACU,
    $loadModelsButton_ACU,
    $saveApiConfigButton_ACU,
    $clearApiConfigButton_ACU,
    $apiStatusDisplay_ACU,
    $charCardPromptToggle_ACU,
    $charCardPromptAreaDiv_ACU,
    $charCardPromptSegmentsContainer_ACU,
    $saveCharCardPromptButton_ACU,
    $resetCharCardPromptButton_ACU,
    $plotPromptSegmentsContainer_ACU,
    $plotTaskListContainer_ACU,
    $themeColorButtonsContainer_ACU,
    $autoUpdateThresholdInput_ACU,
    $saveAutoUpdateThresholdButton_ACU, // Replaces chunk size inputs
    $autoUpdateTokenThresholdInput_ACU, // Token threshold input
    $saveAutoUpdateTokenThresholdButton_ACU, // Token threshold save button
    $autoUpdateFrequencyInput_ACU, // Auto update frequency input
    $saveAutoUpdateFrequencyButton_ACU, // Auto update frequency save button
    $updateBatchSizeInput_ACU, // [新增] 批处理大小输入
    $saveUpdateBatchSizeButton_ACU, // [新增] 批处理大小保存按钮
    $maxConcurrentGroupsInput_ACU, // [新增] 最大并发数输入
    $autoUpdateEnabledCheckbox_ACU, // 新增UI元素
    $standardizedTableFillEnabledCheckbox_ACU, // [新增] 规范填表功能
    $toastMuteEnabledCheckbox_ACU, // [新增] 静默提示框
    $promptTemplateEnabledCheckbox_ACU, // [新增] 条件模板功能开关
    $tableEditLastPairOnlyCheckbox_ACU, // [新增] 仅识别最后一对 tableEdit
    $tableMaxRetriesInput_ACU, // [新增] 填表自动重试次数
    $manualUpdateCardButton_ACU, // New manual update button
    $statusMessageSpan_ACU,
    $cardUpdateStatusDisplay_ACU,
    $useMainApiCheckbox_ACU,
    $streamingEnabledCheckbox_ACU, // [新增] 流式传输开关
    $manualExtraHintCheckbox_ACU,
    $skipUpdateFloorsInput_ACU,
    $saveSkipUpdateFloorsButton_ACU,
    $retainRecentLayersInput_ACU,
    $saveRetainRecentLayersButton_ACU,
    $manualTableSelector_ACU,
    $manualTableSelectAll_ACU,
    $manualTableSelectNone_ACU,
    $importTableSelector_ACU,
    $importTableSelectAll_ACU,
    $importTableSelectNone_ACU;

  // --- 全局设置对象 ---
  // [已迁移到 src/data/models/defaults.ts] defaultWorldbookConfig_ACU

  let settings_ACU = {
      // 全局设置
      apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 60000, temperature: 1.0 },
      apiMode: 'custom', // 'custom' or 'tavern'
      streamingEnabled: false, // [新增] 流式传输开关（默认关闭）
      tavernProfile: '', // ID of the selected tavern profile
      // [新增] API预设系统
      apiPresets: [], // [{name, apiMode, apiConfig, tavernProfile}]
      tableApiPreset: '', // 填表使用的API预设名称，空表示使用当前配置
      plotApiPreset: '', // 剧情推进使用的API预设名称，空表示使用当前配置
      charCardPrompt: DEFAULT_CHAR_CARD_PROMPT_ACU,
      autoUpdateThreshold: DEFAULT_AUTO_UPDATE_THRESHOLD_ACU,
      autoUpdateFrequency: DEFAULT_AUTO_UPDATE_FREQUENCY_ACU,
      autoUpdateTokenThreshold: DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU,
      updateBatchSize: 3,
      maxConcurrentGroups: 1,
      autoUpdateEnabled: true,
      standardizedTableFillEnabled: true, // [新增] 规范填表功能
      // [新增] UI提示框静默模式：勾选后，除白名单提示外，其余 toast 全部不显示
      toastMuteEnabled: false,
      // [剧情推进] 设置
      plotSettings: JSON.parse(JSON.stringify(DEFAULT_PLOT_SETTINGS_ACU)),
      plotPresetBindings: {}, // [剧情推进] 按聊天记录绑定剧情推进预设
      currentTemplatePresetName: '', // [模板预设] 当前模板预设名，空表示默认预设
      // [填表功能] 正文标签提取，从上下文中提取指定标签的内容发送给AI，User回复不受影响
      tableContextExtractTags: '',
      tableContextExtractRules: [],
      // [填表功能] 正文标签排除：将指定标签内容从上下文中移除
      tableContextExcludeTags: '',
      tableContextExcludeRules: [],
      // [填表功能] 仅识别最后一对 <tableEdit> 标签
      tableEditLastPairOnly: true,
      // [新增] 填表自动重试次数（错误或空回时重试，默认3次）
      tableMaxRetries: 3,
      importSplitSize: 10000,
      skipUpdateFloors: 0, // 全局有效楼层 (UI参数) - 影响所有表
      retainRecentLayers: 100, // [新增] 保留最近N层本地数据 (0或空=全部保留，按AI楼层计数)
      // [新增] 表格顺序（用户手动调整后持久化）。为空时使用模板顺序。
      tableKeyOrder: [], // ['sheet_xxx', 'sheet_yyy', ...]
      manualSelectedTables: [], // 手动更新时使用UI参数的表格key列表
      hasManualSelection: false, // 是否用户显式选择过（全选/全不选/自选）
      hasManualSelection: false, // 是否用户显式选择过（全选/全不选/自选）
      
      // [外部导入] 注入时自选表格（与手动填表一致的交互，但独立存储）
      importSelectedTables: [], // 外部导入注入时保留的表格key列表
      hasImportTableSelection: false, // 是否用户显式选择过（全选/全不选/自选）
      // [新增] 表格更新锁定（按聊天+隔离标签存储；仅对 updateRow 生效）
      tableUpdateLocks: {}, // { [chatScopeKey]: { [sheetKey]: { rows:[], cols:[], cells:[] } } }
      // [新增] 总结表/总体大纲"编码索引列"特殊锁定（默认锁定）
      specialIndexLocks: {}, // { [chatScopeKey]: { [sheetKey]: boolean } }
      
      // [新增] 外部导入专用的世界书配置
      importWorldbookTarget: '', // 导入数据注入目标世界书名称
      importPromptExcludeImportedWorldbookEntries: true, // [新增] 仅外部导入时，填表提示词中的世界书占位符屏蔽所有带"外部导入-"标签的条目
      // [新增] 0TK占用模式全局默认值：新对话会继承这个值
      zeroTkOccupyModeDefault: false,

    // [新增] 数据隔离/多副本机制
    dataIsolationEnabled: false, // 是否开启数据隔离
    dataIsolationCode: '', // 隔离标识代码
    dataIsolationHistory: [], // 标识代码历史
    
    // [新增] 酒馆提示词模板功能
    promptTemplateSettings: {
      enabled: true,           // 总开关
      maxNestingDepth: 10,     // 最大嵌套深度
      debugMode: false         // 调试模式
    },
    
    // [新增] 正文优化功能
    contentOptimizationSettings: {
      enabled: false,                    // 是否启用正文优化
      apiPreset: '',                     // 优化使用的API预设（为空则使用当前配置）
      seamlessMode: true,                // 无感替换模式：显示遮罩，优化完成后直接显示结果
      autoApply: true,                   // 是否自动应用优化结果（关闭时显示对比让用户选择）
      showDiff: true,                    // 是否显示优化对比（非无感模式下有效）
      minLength: 100,                    // 最小优化长度阈值
      maxOptimizations: 10,              // 单次最大优化项数
      loopCount: 1,                      // 循环优化次数（1表示不循环，2表示优化2次，以此类推）
      retryCount: 3,                     // 自动重试次数（API调用失败时自动重试，默认3次）
      promptGroup: [],                   // 提示词组（段落编辑器）
    },
    
    // 角色专属设置
      characterSettings: {
          // [charId]: { worldbookConfig: { ... } }
      },
  };
  // TABLE_TEMPLATE_ACU 现在从"配置存储(getConfigStorage_ACU)"或默认值加载，因此不属于主 settings 对象的一部分。

  // [已迁移到 src/data/repositories/isolation-repo.ts] MAX_DATA_ISOLATION_HISTORY, normalizeDataIsolationHistory_ACU, getDataIsolationHistory_ACU, addDataIsolationHistory_ACU, removeDataIsolationHistory_ACU, ensureProfileExists_ACU, switchIsolationProfile_ACU

  // [已迁移到 src/data/repositories/character-settings-repo.ts] getCurrentCharSettings_ACU, getCurrentWorldbookConfig_ACU


  // [从 05_core_tail.js:124 迁移] 隔离键辅助函数
  function getCurrentIsolationKey_ACU() {
      return settings_ACU.dataIsolationEnabled ? (settings_ACU.dataIsolationCode || '') : '';
  }
