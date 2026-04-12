// ═══════════════════════════════════════════════════════════════
// service/settings/settings-service.ts — 设置加载/保存编排
// 从 04_shared_helpers.js 迁入
//
// 这两个函数混合了数据读写 + UI 同步 + 运行时状态操作，
// 属于 service 层（业务编排），不是纯 data 层。
// ═══════════════════════════════════════════════════════════════

export function saveSettings_ACU() {
  try {
      const store = (getConfigStorage_ACU as any)();
      const code = (normalizeIsolationCode_ACU as any)((settings_ACU as any)?.dataIsolationCode || (globalMeta_ACU as any)?.activeIsolationCode || '');
      // 同步 globalMeta 的当前标识（避免刷新后回到旧标识）
      if (globalMeta_ACU && typeof globalMeta_ACU === 'object') {
          (globalMeta_ACU as any).activeIsolationCode = code;
          if (code) (addDataIsolationHistory_ACU as any)(code, { save: false });
          (normalizeDataIsolationHistory_ACU as any)((globalMeta_ACU as any).isolationCodeList);
          (saveGlobalMeta_ACU as any)();
      }
      const payloadObj = (sanitizeSettingsForProfileSave_ACU as any)(settings_ACU);
      payloadObj.dataIsolationCode = code;
      const payload = JSON.stringify(payloadObj);
      // [Profile] 按标识码保存"整套设置"
      store.setItem((getProfileSettingsKey_ACU as any)(code), payload);
      if (store && store._isTavern) {
          (logDebug_ACU as any)(`[Profile] Settings saved for code: ${code || '(default)'}`);
      } else {
          if ((isIndexedDbAvailable_ACU as any)()) {
              console.warn(`[${SCRIPT_ID_PREFIX_ACU}] 未连接到酒馆服务端设置：已保存到 IndexedDB（仅本浏览器可用，跨浏览器不同步）。请检查顶层 bridge 是否注入成功。`);
              try { (showToastr_ACU as any)('info', '当前未连接酒馆设置：已保存到 IndexedDB（仅本浏览器可用）。', { timeOut: 6000 }); } catch (e) {}
          } else {
              console.warn(`[${SCRIPT_ID_PREFIX_ACU}] 未连接到可持久化的 extension_settings，且 IndexedDB 不可用：本次保存仅在内存中生效，刷新会丢失。`);
              try { (showToastr_ACU as any)('warning', '⚠️ 当前未连接酒馆设置且 IndexedDB 不可用，本次修改刷新后会丢失。', { timeOut: 8000 }); } catch (e) {}
          }
          // 异步再尝试一次初始化（不阻塞 UI）
          void (initTavernSettingsBridge_ACU as any)();
      }
  } catch (error) {
      (logError_ACU as any)('Failed to save settings:', error);
      (showToastr_ACU as any)('error', '保存设置时发生浏览器存储错误。');
  }
}


export   function loadSettings_ACU() {
      // 确保酒馆设置桥接已就绪（best-effort，不阻塞）
      void initTavernSettingsBridge_ACU();
      // 尝试预载 IndexedDB 配置缓存（best-effort，不阻塞）
      void ensureConfigIdbCacheLoaded_ACU().then(() => {
          if (pendingSettingsReloadFromIdb_ACU) {
              pendingSettingsReloadFromIdb_ACU = false;
              loadSettings_ACU();
          }
      });
      // 可选迁移：把旧 localStorage 的设置/模板搬迁到酒馆设置（迁移开关默认为 false）
      migrateKeyToTavernStorageIfNeeded_ACU(STORAGE_KEY_ALL_SETTINGS_ACU);
      migrateKeyToTavernStorageIfNeeded_ACU(STORAGE_KEY_CUSTOM_TEMPLATE_ACU);

      // 1) 读取全局元信息（跨标识共享：标识列表/当前标识）
      loadGlobalMeta_ACU();

      const store = getConfigStorage_ACU();
      const legacySettingsJson = store?.getItem?.(STORAGE_KEY_ALL_SETTINGS_ACU);
      if (!legacySettingsJson && !configIdbCacheLoaded_ACU && isIndexedDbAvailable_ACU()) {
          if (!pendingSettingsReloadFromIdb_ACU) {
              pendingSettingsReloadFromIdb_ACU = true;
              void ensureConfigIdbCacheLoaded_ACU().then(() => {
                  if (pendingSettingsReloadFromIdb_ACU) {
                      pendingSettingsReloadFromIdb_ACU = false;
                      loadSettings_ACU();
                  }
              });
          }
      }
      const legacySettingsObj = legacySettingsJson ? safeJsonParse_ACU(legacySettingsJson, null) : null;
      const legacyCode = normalizeIsolationCode_ACU(legacySettingsObj?.dataIsolationCode || '');

      // 2) 一次性迁移：旧版"单份设置/单份模板" -> 当前标识对应 profile
      if (!globalMeta_ACU.migratedLegacySingleStore && (legacySettingsObj || store?.getItem?.(STORAGE_KEY_CUSTOM_TEMPLATE_ACU))) {
          const targetCode = legacyCode; // 旧版 code 就是当时的隔离标识
          const hasProfileSettings = !!readProfileSettingsFromStorage_ACU(targetCode);
          const hasProfileTemplate = !!readProfileTemplateFromStorage_ACU(targetCode);
          try {
              if (!hasProfileSettings && legacySettingsObj) {
                  const toSave = sanitizeSettingsForProfileSave_ACU(legacySettingsObj);
                  toSave.dataIsolationCode = targetCode;
                  writeProfileSettingsToStorage_ACU(targetCode, toSave);
              }
              if (!hasProfileTemplate) {
                  const legacyTemplate = store?.getItem?.(STORAGE_KEY_CUSTOM_TEMPLATE_ACU);
                  if (legacyTemplate && String(legacyTemplate).trim()) {
                      writeProfileTemplateToStorage_ACU(targetCode, legacyTemplate);
                  }
              }
              // 同步迁移"标识列表"到 globalMeta（跨标识共享）
              if (Array.isArray(legacySettingsObj?.dataIsolationHistory)) {
                  globalMeta_ACU.isolationCodeList = legacySettingsObj.dataIsolationHistory;
              }
              if (targetCode) {
                  globalMeta_ACU.activeIsolationCode = targetCode;
                  // 确保 active 在列表里
                  globalMeta_ACU.isolationCodeList = [targetCode, ...(globalMeta_ACU.isolationCodeList || [])];
              }
              normalizeDataIsolationHistory_ACU(globalMeta_ACU.isolationCodeList);
              globalMeta_ACU.migratedLegacySingleStore = true;
              saveGlobalMeta_ACU();
              // 迁移完成后移除 legacy 键，避免后续反复读取造成混乱
              try { store?.removeItem?.(STORAGE_KEY_ALL_SETTINGS_ACU); } catch (e) {}
              try { store?.removeItem?.(STORAGE_KEY_CUSTOM_TEMPLATE_ACU); } catch (e) {}
              logDebug_ACU(`[Profile] Migrated legacy single-store -> profile: ${targetCode || '(default)'}`);
          } catch (e) {
              logWarn_ACU('[Profile] Legacy migration failed (will keep legacy keys):', e);
          }
      }

      // 3) 决定本次启动要加载的标识 code（优先 globalMeta.active，其次 legacyCode）
      const activeCode = normalizeIsolationCode_ACU(globalMeta_ACU.activeIsolationCode || legacyCode || '');
      globalMeta_ACU.activeIsolationCode = activeCode;
      if (activeCode) addDataIsolationHistory_ACU(activeCode, { save: false });
      normalizeDataIsolationHistory_ACU(globalMeta_ACU.isolationCodeList);
      saveGlobalMeta_ACU();

      // 4) 加载模板（按标识 profile）
      loadTemplateFromStorage_ACU(activeCode);

      // 5) 加载设置（按标识 profile）
      const defaultSettings = buildDefaultSettings_ACU();

      try {
          const savedSettings = readProfileSettingsFromStorage_ACU(activeCode);
          if (savedSettings) {

              // [迁移逻辑] 检查旧的顶层 worldbookConfig
              if (savedSettings.worldbookConfig) {
                  logDebug_ACU('Migrating legacy worldbookConfig to character-specific settings.');
                  // 如果存在，并且没有 characterSettings，则创建一个
                  if (!savedSettings.characterSettings) {
                      savedSettings.characterSettings = {};
                  }
                  // 将旧配置迁移到 'default' 或一个通用的键下，以便初次加载时使用
                  // 这里我们假设它应该成为所有未配置角色的基础，但为了简单起见，我们只处理当前角色
                  const charId = currentChatFileIdentifier_ACU || 'default';
                  if (!savedSettings.characterSettings[charId]) {
                       savedSettings.characterSettings[charId] = { worldbookConfig: savedSettings.worldbookConfig };
                  }
                  // 删除顶层配置
                  delete savedSettings.worldbookConfig;
              }
              
              // Deep merge saved settings into defaults to ensure new properties are added
              settings_ACU = deepMerge_ACU(defaultSettings, savedSettings);

              // [剧情推进] 迁移/兜底：确保 plotWorldbookConfig 存在且结构完整
              if (!settings_ACU.plotSettings) settings_ACU.plotSettings = JSON.parse(JSON.stringify(DEFAULT_PLOT_SETTINGS_ACU));
              if (!settings_ACU.plotSettings.plotWorldbookConfig) {
                  // 兼容旧字段迁移：worldbookSource/selectedWorldbooks -> plotWorldbookConfig
                  const legacySource = settings_ACU.plotSettings.worldbookSource || 'character';
                  const legacyBooks = Array.isArray(settings_ACU.plotSettings.selectedWorldbooks) ? settings_ACU.plotSettings.selectedWorldbooks : [];
                  settings_ACU.plotSettings.plotWorldbookConfig = buildDefaultPlotWorldbookConfig_ACU();
                  settings_ACU.plotSettings.plotWorldbookConfig.source = (legacySource === 'manual') ? 'manual' : 'character';
                  settings_ACU.plotSettings.plotWorldbookConfig.manualSelection = legacyBooks;
              }
              if (!settings_ACU.plotPresetBindings || typeof settings_ACU.plotPresetBindings !== 'object' || Array.isArray(settings_ACU.plotPresetBindings)) {
                  settings_ACU.plotPresetBindings = {};
              }
              settings_ACU.currentTemplatePresetName = normalizeTemplatePresetSelectionValue_ACU(settings_ACU.currentTemplatePresetName || '');
              if (typeof settings_ACU.plotSettings.lastUsedPresetName !== 'string') {
                  settings_ACU.plotSettings.lastUsedPresetName = '';
              }

              // [Profile] 强制以 globalMeta.activeIsolationCode 作为当前标识
              settings_ACU.dataIsolationCode = activeCode;
              settings_ACU.dataIsolationEnabled = (activeCode !== '');

              // 0TK 全局偏好：优先 globalMeta；若缺失则从旧 profile 字段迁移
              if (typeof globalMeta_ACU.zeroTkOccupyModeGlobal === 'boolean') {
                  settings_ACU.zeroTkOccupyModeDefault = (globalMeta_ACU.zeroTkOccupyModeGlobal === true);
              } else {
                  globalMeta_ACU.zeroTkOccupyModeGlobal = (settings_ACU.zeroTkOccupyModeDefault === true);
                  saveGlobalMeta_ACU();
              }

              // 确保当前角色有配置
              getCurrentCharSettings_ACU();
              
          } else {
              // No saved settings, use the defaults
              settings_ACU = defaultSettings;
              // [剧情推进] 默认兜底
              if (!settings_ACU.plotSettings.plotWorldbookConfig) {
                  settings_ACU.plotSettings.plotWorldbookConfig = buildDefaultPlotWorldbookConfig_ACU();
              }
              // [Profile] 强制以 globalMeta.activeIsolationCode 作为当前标识
              settings_ACU.dataIsolationCode = activeCode;
              settings_ACU.dataIsolationEnabled = (activeCode !== '');
              if (typeof globalMeta_ACU.zeroTkOccupyModeGlobal === 'boolean') {
                  settings_ACU.zeroTkOccupyModeDefault = (globalMeta_ACU.zeroTkOccupyModeGlobal === true);
              } else {
                  globalMeta_ACU.zeroTkOccupyModeGlobal = (settings_ACU.zeroTkOccupyModeDefault === true);
                  saveGlobalMeta_ACU();
              }
          }
      } catch (error) {
          logError_ACU('Failed to load or parse settings, using defaults:', error);
          settings_ACU = buildDefaultSettings_ACU();
          settings_ACU.dataIsolationCode = activeCode;
          settings_ACU.dataIsolationEnabled = (activeCode !== '');
      }

      // [兼容] 旧标签排除字段自动迁移为新规则组结构
      ensureTagRulesCompat_ACU(settings_ACU);

      if (!Number.isFinite(settings_ACU.maxConcurrentGroups) || settings_ACU.maxConcurrentGroups < 1) {
          settings_ACU.maxConcurrentGroups = 1;
      }
      logDebug_ACU('Settings loaded:', settings_ACU);

      // UI 回填交给 presentation 层
      if (typeof syncAllSettingsToUI_ACU === 'function') syncAllSettingsToUI_ACU(settings_ACU);
  }


export   function loadTemplateFromStorage_ACU(codeOverride = null) {
      const code = normalizeIsolationCode_ACU(
          (codeOverride !== null && typeof codeOverride !== 'undefined')
              ? codeOverride
              : (settings_ACU?.dataIsolationCode || globalMeta_ACU?.activeIsolationCode || ''),
      );

      // [更新参数哨兵迁移] 旧版本：0 表示"沿用UI"；新版本：-1 表示"沿用UI"，0 表示"禁用/不参与"（仅 updateFrequency 参与禁用语义）
      function migrateTemplateUpdateConfigSentinel_ACU(templateObj) {
          if (!templateObj || typeof templateObj !== 'object') return { changed: false, obj: templateObj };

          const mate = (templateObj.mate && typeof templateObj.mate === 'object') ? templateObj.mate : null;
          const alreadyMigrated = !!(mate && mate.updateConfigUiSentinel === -1);
          if (alreadyMigrated) return { changed: false, obj: templateObj };

          let changed = false;
          const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
          for (const k of sheetKeys) {
              const sheet = templateObj[k];
              if (!sheet || typeof sheet !== 'object') continue;
              const uc = sheet.updateConfig;
              if (!uc || typeof uc !== 'object') continue;
              // sheet 级标记：用于聊天记录里的表格对象（没有 mate）也能识别新语义
              if (uc.uiSentinel !== -1) { uc.uiSentinel = -1; changed = true; }
              for (const field of ['contextDepth', 'updateFrequency', 'batchSize', 'skipFloors']) {
                  if (Object.prototype.hasOwnProperty.call(uc, field) && uc[field] === 0) {
                      uc[field] = -1;
                      changed = true;
                  }
              }
          }

          // 写入标记，避免后续把用户显式设置的 0(禁用) 再次误迁移
          if (!templateObj.mate || typeof templateObj.mate !== 'object') {
              templateObj.mate = { type: 'chatSheets', version: 1 };
              changed = true;
          } else {
              if (!templateObj.mate.type) templateObj.mate.type = 'chatSheets';
              if (!templateObj.mate.version) templateObj.mate.version = 1;
          }
          if (templateObj.mate.updateConfigUiSentinel !== -1) {
              templateObj.mate.updateConfigUiSentinel = -1;
              changed = true;
          }
          return { changed, obj: templateObj };
      }

      try {
          const savedTemplate = readProfileTemplateFromStorage_ACU(code);
          if (savedTemplate) {
              // [修复] 使用 safeJsonParse_ACU 静默处理解析失败，避免误报错误提示
              const parsedTemplate = safeJsonParse_ACU(savedTemplate, null);
              if (parsedTemplate && parsedTemplate.mate && Object.keys(parsedTemplate).some(k => k.startsWith('sheet_'))) {
                  // [迁移] 0(沿用UI) -> -1(沿用UI)，并写入标记
                  migrateTemplateUpdateConfigSentinel_ACU(parsedTemplate);
                  // [Profile] 模板载入时先补齐/修复顺序编号，并回写（编号可随导出/导入迁移）
                  const sheetKeys = Object.keys(parsedTemplate).filter(k => k.startsWith('sheet_'));
                  ensureSheetOrderNumbers_ACU(parsedTemplate, { baseOrderKeys: sheetKeys, forceRebuild: false });
                  // [瘦身] 无论是否 changed，都清洗模板（去掉 domain/type/enable/triggerSend*/config/customStyles 等冗余字段）
                  const sanitizedTemplate = sanitizeChatSheetsObject_ACU(parsedTemplate, { ensureMate: true });
                  TABLE_TEMPLATE_ACU = JSON.stringify(sanitizedTemplate);
                  writeProfileTemplateToStorage_ACU(code, TABLE_TEMPLATE_ACU);
                  logDebug_ACU(`[Profile] Template loaded for code: ${code || '(default)'}`);
                  return;
              } else if (parsedTemplate) {
                  // 解析成功但格式不正确，静默回退到默认模板
                  logDebug_ACU(`[Profile] Template format invalid for code: ${code || '(default)'}, using default.`);
              }
              // parsedTemplate 为 null 时表示解析失败，静默跳过（可能是旧的/其他标识的损坏数据）
          }
      } catch (error) {
          // 静默处理异常，避免误报错误提示困扰用户
          logDebug_ACU('[Profile] Template load skipped due to error, using default.', error?.message || error);
      }

      // No valid template found -> default
      TABLE_TEMPLATE_ACU = DEFAULT_TABLE_TEMPLATE_ACU;
      // [新机制] 默认模板也补齐一次编号（仅写入当前 profile，不改源码常量）
      try {
          const obj = JSON.parse(TABLE_TEMPLATE_ACU);
          // 默认模板也写入哨兵标记（便于后续识别新语义）
          try { migrateTemplateUpdateConfigSentinel_ACU(obj); } catch (e) {}
          const sheetKeys = Object.keys(obj).filter(k => k.startsWith('sheet_'));
          if (ensureSheetOrderNumbers_ACU(obj, { baseOrderKeys: sheetKeys, forceRebuild: false })) {
              const sanitizedTemplate = sanitizeChatSheetsObject_ACU(obj, { ensureMate: true });
              TABLE_TEMPLATE_ACU = JSON.stringify(sanitizedTemplate);
          }
      } catch (e) {
          // ignore
      }
      try { writeProfileTemplateToStorage_ACU(code, TABLE_TEMPLATE_ACU); } catch (e) {}
      logDebug_ACU(`[Profile] No valid template found, default persisted for code: ${code || '(default)'}`);
  }


export   function buildDefaultSettings_ACU() {
      return {
          apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 60000, temperature: 1.0 },
          apiMode: 'custom',
          tavernProfile: '',
          streamingEnabled: false, // [新增] 流式传输开关（默认关闭）
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
          standardizedTableFillEnabled: true, // [新增] 规范填表功能
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
          removeTags: '',
          importSplitSize: 10000,
          importPromptExcludeImportedWorldbookEntries: true, // [新增] 仅外部导入时，填表提示词中的世界书占位符屏蔽所有带"外部导入-"标签的条目
          skipUpdateFloors: 0, // 跳过更新楼层（全局）
          retainRecentLayers: 100, // [新增] 保留最近N层本地数据 (0或空=全部保留)
          manualSelectedTables: [],
          // [新增] 表格更新锁定（按聊天+隔离标签存储；仅对 updateRow 生效）
          tableUpdateLocks: {},
          // [新增] 总结表/总体大纲"编码索引列"特殊锁定（默认锁定）
          specialIndexLocks: {},
          // [新增] 0TK占用模式全局默认值：新对话会继承这个值
          zeroTkOccupyModeDefault: false,
          // [Profile] dataIsolationEnabled/code 由当前 profile 决定；history 走 globalMeta
          dataIsolationCode: '',
          dataIsolationHistory: [], // legacy 字段保留但不再持久化
          characterSettings: {}, // Start with an empty object
          knownCustomEntryNames: [], // [新增] 记录已创建的自定义条目名称，用于清理
          mergeSummaryPrompt: DEFAULT_MERGE_SUMMARY_PROMPT_ACU, // [新增] 合并总结提示词
          mergeTargetCount: 1, // [新增] 合并目标条数
          mergeBatchSize: 5, // [新增] 合并批次大小
          mergeStartIndex: 1, // [新增] 合并起始条数
          mergeEndIndex: null, // [新增] 合并终止条数
          autoMergeEnabled: false, // [新增] 是否开启自动合并总结
          autoMergeThreshold: 20, // [新增] 自动合并总结楼层数
          autoMergeReserve: 0, // [新增] 保留固定楼层数
          deleteStartFloor: null, // [新增] 删除起始楼层 (null表示从头开始)
          deleteEndFloor: null, // [新增] 删除终止楼层 (null表示到末尾)
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
            parallelMode: false,               // 填表与正文替换并行执行（默认关闭）
            minLength: 100,                    // 最小优化长度阈值
            maxOptimizations: 10,              // 单次最大优化项数
            loopCount: 1,                      // 循环优化次数
            retryCount: 3,                     // 自动重试次数（API调用失败时自动重试，默认3次）
            extractTags: '',                   // 正文标签提取（从正文中提取指定标签内容进行优化）
            extractRules: [],                  // 正文标签提取规则（结构化）
            excludeTags: '',                   // 标签排除（优化时排除指定标签内容）
            excludeRules: [],                  // 标签排除规则（结构化）
            promptGroup: buildDefaultContentOptimizationPromptGroup_ACU(), // 提示词组（段落编辑器）
            promptPresets: [],                 // 提示词组预设列表
          },
      };
  }


export   function applyTemplateScopeForCurrentChat_ACU({ isolationKey = getCurrentIsolationKey_ACU() } = {}) {
      const normalizedKey = normalizeTemplateScopeIsolationKey_ACU(isolationKey);
      const migratedScopeState = migrateLegacyTemplateScopeForCurrentChat_ACU({ isolationKey: normalizedKey });
      const scopeState = getCurrentChatTemplateScopeState_ACU({ isolationKey: normalizedKey }) || migratedScopeState;
      const selectedPresetName = normalizeTemplatePresetSelectionValue_ACU(scopeState?.presetName || '');
      let targetSnapshot = null;

      if (scopeState?.mode === 'chat_override' && scopeState?.templateStr) {
          targetSnapshot = sanitizeTemplateSnapshotForChat_ACU(scopeState.templateStr);
      } else if (scopeState?.mode === 'preset_link') {
          if (selectedPresetName) {
              targetSnapshot = sanitizeTemplateSnapshotForChat_ACU(getTemplatePreset_ACU(selectedPresetName)?.templateStr || null);
          } else {
              targetSnapshot = getDefaultTemplateSnapshot_ACU();
          }
      }

      if (!targetSnapshot?.templateStr) {
          targetSnapshot = getGlobalTemplateSnapshotForCurrentProfile_ACU();
      }
      if (!targetSnapshot?.templateStr) return null;

      TABLE_TEMPLATE_ACU = targetSnapshot.templateStr;
      if (scopeState?.mode === 'chat_override' && scopeState?.templateStr) {
          logDebug_ACU(`[TemplateScope] Applied chat template override for key [${normalizedKey || '默认'}].`);
          return {
              mode: 'chat_override',
              isolationKey: normalizedKey,
              presetName: scopeState.presetName || '',
          };
      }
      if (scopeState?.mode === 'preset_link') {
          logDebug_ACU(`[TemplateScope] Applied linked global preset for key [${normalizedKey || '默认'}]: ${selectedPresetName || '默认预设'}.`);
          return {
              mode: 'preset_link',
              isolationKey: normalizedKey,
              presetName: selectedPresetName,
          };
      }

      logDebug_ACU(`[TemplateScope] Applied global template for key [${normalizedKey || '默认'}].`);
      return {
          mode: 'inherit_global',
          isolationKey: normalizedKey,
          presetName: getCurrentTemplatePresetName_ACU({ requireExisting: false }),
      };
  }
