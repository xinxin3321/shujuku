import { currentAbortController_ACU, manualExtraHint_ACU, trackAbortController_ACU, untrackAbortController_ACU , _set_currentAbortController_ACU} from '../runtime/state-manager';
import { getApiConfigByPreset_ACU } from './api-call';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, currentJsonTableData_ACU, settings_ACU } from '../runtime/state-manager';
import { attachSeedRowsToCurrentDataFromGuide_ACU, ensureChatSheetGuideSeeded_ACU, getEffectiveSeedRowsForSheet_ACU, getSortedSheetKeys_ACU } from '../template/chat-scope';
import { getCombinedWorldbookContent_ACU } from '../worldbook/pipeline';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU } from '../../shared/utils';
import { applyContextTagFilters_ACU, applyExcludeRulesToText_ACU, applySummaryIndexSequenceToTable_ACU, formatSummaryIndexCode_ACU, getLatestAIMessageContent_ACU, getPlotFromHistory_ACU, getSummaryIndexColumnIndex_ACU, getTableLocksForSheet_ACU, isSpecialIndexLockEnabled_ACU, parseIfBlocksInContent_ACU, parseRandomTags_ACU, replaceRandomVariables_ACU } from '../runtime/helpers-remaining';
/**
 * service/ai/prompt-builder.ts — AI 输入准备 + JSON清洗 + 表格编辑解析
 * 从 src/features/ai/01_prompt_prepare.js + 02_api_call.js 合并迁移。
 */
  export async function prepareAIInput_ACU(messages, updateMode = 'standard', targetSheetKeys = null, options: any = {}) {
    // updateMode: 'standard' 表示更新标准表，'summary' 表示更新总结表和总体大纲
    // targetSheetKeys: 可选，指定要更新的表格key列表
    // This function is now simplified to only prepare the dynamic content parts.    // The main prompt assembly will happen in callCustomOpenAI_ACU.
    if (!currentJsonTableData_ACU) {
        logError_ACU('prepareAIInput_ACU: Cannot prepare AI input, currentJsonTableData_ACU is null.');
        return null;
    }

    // [修复] 生成 $0 之前，确保 seedRows 可用（新对话首次填表、或指导表未命中时也能兜底）
    // - 只把 seedRows 挂到表对象字段，不写入 content
    let _seedGuideDataForThisPrepare_ACU = null;
    try {
        _seedGuideDataForThisPrepare_ACU = await ensureChatSheetGuideSeeded_ACU({ reason: 'prepare_ai_input_seedrows' });
        if (_seedGuideDataForThisPrepare_ACU) {
            attachSeedRowsToCurrentDataFromGuide_ACU(_seedGuideDataForThisPrepare_ACU);
        }
    } catch (e) {}

    // 1. Format the current JSON table data into a human-readable text block for $0
    let tableDataText = '';
    let _seedRowsTablesUsed_ACU = [];
    const tableIndexes = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
    tableIndexes.forEach((sheetKey, tableIndex) => {
        const table = currentJsonTableData_ACU[sheetKey];
        if (!table || !table.name || !table.content) return;

        // [独立更新检查] 如果指定了 targetSheetKeys，则严格过滤
        if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
            if (!targetSheetKeys.includes(sheetKey)) return;
        }

        // [新增] 根据更新模式和表格名称决定是否显示数据行
        // 注意：如果 targetSheetKeys 已指定，上面的检查已经过滤了不需要的表。
        // 但为了兼容旧模式逻辑（未指定 targetSheetKeys 时），仍保留 mode 检查。
        // 如果 targetSheetKeys 存在，我们假设调用者知道自己在做什么，shouldShowData 默认为 true。
        
        const isSummaryTable = isSummaryOrOutlineTable_ACU(table.name);
        let shouldShowData = true;
        
        if (!targetSheetKeys) {
            // [逻辑优化] 使用更明确的模式匹配
            const isUnifiedMode = (updateMode === 'full' || updateMode === 'manual_unified' || updateMode === 'auto_unified');
            const isStandardMode = (updateMode === 'standard' || updateMode === 'auto_standard' || updateMode === 'manual_standard');
            const isSummaryMode = (updateMode === 'summary' || updateMode === 'auto_summary_silent' || updateMode === 'manual_summary');
            
            if (isUnifiedMode) {
                 // 统一更新模式：显示所有表
                 shouldShowData = true;
            } else if (isStandardMode && isSummaryTable) {
                // 标准表更新模式：不显示总结表数据
                shouldShowData = false;
            } else if (isSummaryMode && !isSummaryTable) {
                // 总结表更新模式：不显示标准表数据
                shouldShowData = false;
            }
        }

        if (!shouldShowData) {
            return;
        }

        const allRows = table.content.slice(1);
        // seedRows 统一从“当前数据/指导表/模板”解析（避免 seedRows 丢失导致误判为空表）
        const seedRows = getEffectiveSeedRowsForSheet_ACU(sheetKey, { guideData: _seedGuideDataForThisPrepare_ACU, allowTemplateFallback: true });
        // 把 seedRows 字段挂回 table，便于后续 applyEdits 物化
        try {
            if ((!Array.isArray(table.seedRows) || table.seedRows.length === 0) && Array.isArray(seedRows) && seedRows.length > 0) {
                table.seedRows = JSON.parse(JSON.stringify(seedRows));
            }
        } catch (e) {}
        const isUsingSeedRows = (allRows.length === 0 && seedRows.length > 0);
        if (isUsingSeedRows) {
            try { _seedRowsTablesUsed_ACU.push(String(table.name || sheetKey)); } catch (e) {}
        }
        const effectiveAllRows = (allRows.length > 0) ? allRows : (seedRows.length > 0 ? seedRows : []);

        // [新增] 当表格数据为空时，简化输出并提示初始化
        if (effectiveAllRows.length === 0) {
            tableDataText += `[${tableIndex}:${table.name}]\n`;
            
            // [修正] 即使表格为空，也必须输出表头列名，以便AI知道如何初始化（列结构）
            const headers = table.content[0] ? table.content[0].slice(1).map((h, i) => `[${i}:${h}]`).join(', ') : 'No Headers';
            tableDataText += `  Columns: ${headers}\n`;

            if (table.sourceData) {
                tableDataText += `  - Note: ${table.sourceData.note || 'N/A'}\n`;
                // 只发送 "initNode" 里的内容 (如果没有 initNode 则尝试使用 insertNode)
                const initNodeContent = table.sourceData.initNode || table.sourceData.insertNode || 'N/A';
                tableDataText += `  - Init Trigger: ${initNodeContent}\n`;
            }
            tableDataText += `  (该表格为空，请进行初始化。)\n\n`;
        } else {
            tableDataText += `[${tableIndex}:${table.name}]\n`;
            const headers = table.content[0] ? table.content[0].slice(1).map((h, i) => `[${i}:${h}]`).join(', ') : 'No Headers';
            tableDataText += `  Columns: ${headers}\n`;
            if (table.sourceData) {
                tableDataText += `  - Note: ${table.sourceData.note || 'N/A'}\n`;
                tableDataText += `  - Insert Trigger: ${table.sourceData.insertNode || table.sourceData.initNode || 'N/A'}\n`;
                tableDataText += `  - Update Trigger: ${table.sourceData.updateNode || 'N/A'}\n`;
                tableDataText += `  - Delete Trigger: ${table.sourceData.deleteNode || 'N/A'}\n`;
            }
            if (isUsingSeedRows) {
                tableDataText += `  - SeedRows: 已提供模板基础数据（尚未写入聊天楼层数据；本次填表可直接基于这些行更新）\n`;
            }

            let rowsToProcess = effectiveAllRows;
            let startIndex = 0;

            // [健全机制] 纪要表/总结表：固定使用硬编码的10条限制，不受 sendLatestRows 参数影响
            // 这是为了保证纪要表的行为一致性，避免用户误配置导致发送过多数据
            const isSummaryTable = (table.name.trim() === '纪要表' || table.name.trim() === '总结表');
            if (isSummaryTable && effectiveAllRows.length > 10) {
                startIndex = effectiveAllRows.length - 10;
                rowsToProcess = effectiveAllRows.slice(-10);
                tableDataText += `  - Note: Showing last ${rowsToProcess.length} of ${effectiveAllRows.length} entries (summary table fixed limit).\n`;
            } else if (!isSummaryTable) {
                // [新增] 其他表：使用 sendLatestRows 参数控制发送行数
                // -1 = 全部发送，0 = 全部发送（沿用UI全局），正数 = 仅发送最新N条
                const sendLatestRows = (table.updateConfig && typeof table.updateConfig.sendLatestRows === 'number')
                    ? table.updateConfig.sendLatestRows : -1;
                if (sendLatestRows > 0 && effectiveAllRows.length > sendLatestRows) {
                    startIndex = effectiveAllRows.length - sendLatestRows;
                    rowsToProcess = effectiveAllRows.slice(-sendLatestRows);
                    tableDataText += `  - Note: Showing last ${rowsToProcess.length} of ${effectiveAllRows.length} entries (sendLatestRows=${sendLatestRows}).\n`;
                }
            }

            if (rowsToProcess.length > 0) {
                rowsToProcess.forEach((row, index) => {
                    const originalRowIndex = startIndex + index; // 计算原始行索引
                    const rowData = row.slice(1).join(', ');
                    tableDataText += `  [${originalRowIndex}] ${rowData}\n`;
                });
            } else {
                tableDataText += '  (No data rows)\n';
            }
            tableDataText += '\n';
        }
    });
    if (_seedRowsTablesUsed_ACU.length > 0) {
        logDebug_ACU(`[SeedRows] $0 使用 seedRows 作为基础数据：${_seedRowsTablesUsed_ACU.join('、')}`);
    }
    
    // 2. Format the messages for $1
    let messagesText = '当前最新对话内容:\n';
    if (messages && messages.length > 0) {
        // [上下文筛选] 正文标签提取 + 标签排除（可单独或叠加）
        const extractTags = (settings_ACU.tableContextExtractTags || '').trim();
        const extractRules = normalizeExtractRules_ACU(settings_ACU.tableContextExtractRules, extractTags);
        const excludeTags = (settings_ACU.tableContextExcludeTags || '').trim();
        const excludeRules = normalizeExcludeRules_ACU(settings_ACU.tableContextExcludeRules, excludeTags);

        messagesText += messages.map(msg => {
            const prefix = msg.is_user ? SillyTavern_API_ACU?.name1 || '用户' : msg.name || '角色';
            let content = msg.mes || msg.message || '';

            // 对非用户消息应用上下文筛选（User回复不受影响）
            if (!msg.is_user && (extractTags || extractRules.length > 0 || excludeTags || excludeRules.length > 0)) {
                content = applyContextTagFilters_ACU(content, { extractTags, extractRules, excludeTags, excludeRules });
            }

            return `${prefix}: ${content}`;
        }).join('\n');
    } else {
        messagesText += '(无最新对话内容)';
    }

    // [改动] 世界书初始扫描文本使用“本次实际读取的上下文”（与剧情推进一致）
    // 用 messagesText（已应用上下文标签提取/排除规则）作为扫描源，避免误用全聊天记录导致触发漂移
    const worldbookScanText = messagesText;
    const excludeImportTaggedWorldbookEntries = options?.excludeImportTaggedWorldbookEntries === true;
    const worldbookContent = await getCombinedWorldbookContent_ACU(worldbookScanText, {
        excludeImportTaggedEntries: excludeImportTaggedWorldbookEntries,
    });
    const manualExtraHintText = manualExtraHint_ACU || '';

    // Return the dynamic parts for interpolation.
    return { tableDataText, messagesText, worldbookContent, manualExtraHint: manualExtraHintText };
}

export async function callCustomOpenAI_ACU(dynamicContent, abortController = null, options = null) {
    // [新增] 创建一个新的 AbortController 用于本次请求
    const localAbortController = abortController || new AbortController();
    _set_currentAbortController_ACU(localAbortController);
    trackAbortController_ACU(localAbortController);
    const abortSignal = localAbortController.signal;
    const skipProfileSwitch = !!options?.skipProfileSwitch;
    const forceDirectApi = !!options?.forceDirectApi;

    // [新增] 获取填表使用的API配置（支持API预设）
    const apiPresetConfig = getApiConfigByPreset_ACU(settings_ACU.tableApiPreset);
    const effectiveApiMode = apiPresetConfig.apiMode;
    const effectiveApiConfig = apiPresetConfig.apiConfig;
    const effectiveTavernProfile = apiPresetConfig.tavernProfile;
    
    // 仅用于发给API时的角色归一化（不做A/B强制）
    const normalizeRoleForApi_ACU = (role) => {
        const ru = String(role || '').toUpperCase();
        const rl = String(role || '').toLowerCase();
        if (ru === 'AI' || ru === 'ASSISTANT' || rl === 'assistant') return 'assistant';
        if (ru === 'SYSTEM' || rl === 'system') return 'system';
        if (ru === 'USER' || rl === 'user') return 'user';
        return 'user';
    };

    // This function now assembles the final messages array.
    const messages = [];
    const charCardPromptSetting = settings_ACU.charCardPrompt;

    let promptSegments = [];
    if (Array.isArray(charCardPromptSetting)) {
        promptSegments = charCardPromptSetting;
    } else if (typeof charCardPromptSetting === 'string') {
        // Handle legacy single-string format
        promptSegments = [{ role: 'USER', content: charCardPromptSetting }];
    }

    // [新增] 构建 $U (用户设定描述) 和 $C (角色描述) 占位符内容
    // $U: 用户设定描述 (persona_description)
    let userInfoContent_Table = '';
    try {
      // 按优先级尝试获取 persona_description
      // 1. 从 SillyTavern 全局对象获取 powerUserSettings
      // 2. 从 (window as any).power_user 获取（酒馆内部变量）
      // 3. 从 SillyTavern_API_ACU 获取
      const stContext = (window as any).SillyTavern?.getContext?.();
      userInfoContent_Table = stContext?.powerUserSettings?.persona_description
        || (window as any).power_user?.persona_description
        || SillyTavern_API_ACU?.powerUserSettings?.persona_description
        || '';
      logDebug_ACU(`[填表] $U (persona_description) 获取结果: ${userInfoContent_Table ? '成功' : '为空'}`);
    } catch (e) {
      logWarn_ACU('[填表] 获取用户设定描述时出错:', e);
      userInfoContent_Table = '';
    }

    // $C: 角色描述 (char_description)
    let charInfoContent_Table = '';
    try {
      // 按优先级尝试获取角色描述
      // 1. 使用酒馆助手 TavernHelper.getCharData('current') 获取当前角色卡
      // 2. 从 SillyTavern_API_ACU.characters[this_chid] 获取
      // 3. 从 (window as any).SillyTavern?.getContext() 获取
      // 4. 从全局 characters/this_chid 变量获取
      const stContext = (window as any).SillyTavern?.getContext?.();
      
      // 优先使用 TavernHelper.getCharData('current')
      let character = null;
      if (TavernHelper_API_ACU?.getCharData) {
        character = TavernHelper_API_ACU.getCharData('current');
      }
      if (!character) {
        character = SillyTavern_API_ACU?.characters?.[SillyTavern_API_ACU?.this_chid]
          || stContext?.characters?.[stContext?.characterId]
          || (typeof (window as any).characters !== 'undefined' && typeof (window as any).this_chid !== 'undefined' ? (window as any).characters[(window as any).this_chid] : null);
      }
      
      charInfoContent_Table = character?.description
        || character?.data?.description
        || stContext?.name2_description  // 酒馆内部的角色描述变量
        || '';
      logDebug_ACU(`[填表] $C (char_description) 获取结果: ${charInfoContent_Table ? '成功，长度=' + charInfoContent_Table.length : '为空'}`);
    } catch (e) {
      logWarn_ACU('[填表] 获取角色描述时出错:', e);
      charInfoContent_Table = '';
    }

    // [新增] 读取上一轮剧情规划数据，用于$6占位符
    const lastPlotContent = getPlotFromHistory_ACU();
    logDebug_ACU('[填表] $6 上轮规划数据:', lastPlotContent ? `长度=${lastPlotContent.length}` : '(空)');

    const tableExcludeTags = (settings_ACU.tableContextExcludeTags || '').trim();
    const tableExcludeRules = normalizeExcludeRules_ACU(settings_ACU.tableContextExcludeRules, tableExcludeTags);
    const filterTableInjectedContent = (value, placeholderKey = '') => {
        const text = value !== undefined && value !== null ? String(value) : '';
        // 仅对注入内容应用规则，避免改写基础提示词本体
        if (!['$0', '$1', '$4', '$6', '$8', '$U', '$C'].includes(placeholderKey)) return text;
        return applyExcludeRulesToText_ACU(text, { excludeRules: tableExcludeRules, excludeTags: tableExcludeTags });
    };

    // Interpolate placeholders in each segment
    for (const segment of promptSegments) {
        let finalContent = segment.content;
        finalContent = finalContent.replace('$0', filterTableInjectedContent(dynamicContent.tableDataText, '$0'));
        finalContent = finalContent.replace('$1', filterTableInjectedContent(dynamicContent.messagesText, '$1'));
        finalContent = finalContent.replace('$4', filterTableInjectedContent(dynamicContent.worldbookContent, '$4'));
        finalContent = finalContent.replace(/\$6/g, filterTableInjectedContent(lastPlotContent || '', '$6')); // [新增] $6 占位符替换为上一轮剧情规划数据（全局替换）
        finalContent = finalContent.replace('$8', filterTableInjectedContent(dynamicContent.manualExtraHint || '', '$8'));
        // [新增] $U 和 $C 占位符替换
        finalContent = finalContent.replace(/\$U/g, filterTableInjectedContent(userInfoContent_Table, '$U'));
        finalContent = finalContent.replace(/\$C/g, filterTableInjectedContent(charInfoContent_Table, '$C'));
        
        // [新增] 先让 st-prompt-template 插件处理提示词（如果存在）
        if (typeof (globalThis as any).EjsTemplate?.evalTemplate === 'function') {
          try {
            // 不传入 context，让 evalTemplate 自动调用 prepareContext()
            // 这样可以确保上下文正确传递给 EJS 模板引擎
            finalContent = await (globalThis as any).EjsTemplate.evalTemplate(finalContent);
            logDebug_ACU('[填表] 已通过 st-prompt-template 处理提示词');
          } catch (e) {
            logWarn_ACU('[填表] st-prompt-template 处理失败，使用原始内容:', e);
          }
        }

        // [新增] 在 EJS 渲染后进行随机数处理
        finalContent = parseRandomTags_ACU(finalContent);
        finalContent = replaceRandomVariables_ACU(finalContent);
        
        // [新增] 再让数据库自身的条件模板处理
        if (settings_ACU.promptTemplateSettings?.enabled !== false) {
          // 构建条件模板上下文
          const templateContext = {
            seedContent: getLatestAIMessageContent_ACU(),
            allTablesJson: currentJsonTableData_ACU,
            plotContent: lastPlotContent || ''
          };
          finalContent = parseIfBlocksInContent_ACU(finalContent, templateContext, 0);
        }
        
        // Convert role to API-safe role
        messages.push({ role: normalizeRoleForApi_ACU(segment.role), content: finalContent });
    }

    // Add the final instruction for the AI
    
    logDebug_ACU('Final messages array being sent to API:', messages);
    logDebug_ACU(`使用API预设: ${settings_ACU.tableApiPreset || '当前配置'}, 模式: ${effectiveApiMode}`);

    try {
        if (effectiveApiMode === 'tavern') {
        const profileId = effectiveTavernProfile;
        if (!profileId) {
            throw new Error('未选择酒馆连接预设。');
        }
            if (skipProfileSwitch) {
                logDebug_ACU('ACU: 并发模式启用，跳过酒馆预设切换。');
            }

        let originalProfile = '';
        let responsePromise;
        let rawResult;

        try {
            if (!skipProfileSwitch) {
                originalProfile = await TavernHelper_API_ACU.triggerSlash('/profile');
            }
            const targetProfile = SillyTavern_API_ACU.extensionSettings?.connectionManager?.profiles.find(p => p.id === profileId);

            if (!targetProfile) {
                throw new Error(`无法找到ID为 "${profileId}" 的连接预设。`);
            }
            if (!targetProfile.api) {
                throw new Error(`预设 "${targetProfile.name || targetProfile.id}" 没有配置API。`);
            }
            if (!targetProfile.preset) {
                throw new Error(`预设 "${targetProfile.name || targetProfile.id}" 没有选择预设。`);
            }

            const targetProfileName = targetProfile.name || targetProfile.id;
            if (!skipProfileSwitch) {
                const currentProfile = await TavernHelper_API_ACU.triggerSlash('/profile');

                if (currentProfile !== targetProfileName) {
                    const escapedProfileName = targetProfileName.replace(/"/g, '\\"');
                    await TavernHelper_API_ACU.triggerSlash(`/profile await=true "${escapedProfileName}"`);
                }
            }
            
            logDebug_ACU(`ACU: 通过酒馆连接预设 (ID: ${profileId}, Name: ${targetProfileName}) 发送请求...`);

            responsePromise = SillyTavern_API_ACU.ConnectionManagerRequestService.sendRequest(
                profileId, 
                messages, 
                // 使用 max_tokens 设置，如果不存在则回退到4096
                effectiveApiConfig.max_tokens || 4096 
            );

            rawResult = await responsePromise;

        } catch (error) {
            logError_ACU(`ACU: 调用酒馆连接预设时出错:`, error);
            // [修正] 确保恢复预设后再抛出错误
            try {
                if (originalProfile && !skipProfileSwitch) {
                    const currentProfileAfterCall = await TavernHelper_API_ACU.triggerSlash('/profile');
                    if (originalProfile !== currentProfileAfterCall) {
                        const escapedOriginalProfile = originalProfile.replace(/"/g, '\\"');
                        await TavernHelper_API_ACU.triggerSlash(`/profile await=true "${escapedOriginalProfile}"`);
                        logDebug_ACU(`ACU: 已恢复原酒馆连接预设: "${originalProfile}"`);
                    }
                }
            } catch (restoreError) {
                logError_ACU(`ACU: 恢复原预设时出错:`, restoreError);
            }
            throw new Error(`API请求失败 (酒馆预设): ${error.message}`);
        } finally {
            // [修正] 只在成功的情况下恢复预设（错误情况下已在catch中处理）
            if (rawResult !== undefined) {
                try {
                    if (!skipProfileSwitch) {
                        const currentProfileAfterCall = await TavernHelper_API_ACU.triggerSlash('/profile');
                        if (originalProfile && originalProfile !== currentProfileAfterCall) {
                            const escapedOriginalProfile = originalProfile.replace(/"/g, '\\"');
                            await TavernHelper_API_ACU.triggerSlash(`/profile await=true "${escapedOriginalProfile}"`);
                            logDebug_ACU(`ACU: 已恢复原酒馆连接预设: "${originalProfile}"`);
                        }
                    }
                } catch (restoreError) {
                    logError_ACU(`ACU: 恢复原预设时出错:`, restoreError);
                }
            }
        }

        if (rawResult && rawResult.ok && rawResult.result?.choices?.[0]?.message?.content) {
            return rawResult.result.choices[0].message.content.trim();
        } else if (rawResult && typeof rawResult.content === 'string') {
            return rawResult.content.trim();
        } else {
            const errorMsg = rawResult?.error || JSON.stringify(rawResult);
            throw new Error(`酒馆预设API调用返回无效响应: ${errorMsg}`);
        }

    } else { // 'custom' mode
        // --- 使用自定义API ---
        if (effectiveApiConfig.useMainApi && !forceDirectApi) {
            // 模式A: 使用主API（流式传输）
            logDebug_ACU('ACU: 通过酒馆主API发送请求（流式传输）...');
            if (typeof TavernHelper_API_ACU.generateRaw !== 'function') {
                throw new Error('TavernHelper.generateRaw 函数不存在。请检查酒馆版本。');
            }
            const response = await TavernHelper_API_ACU.generateRaw({
                ordered_prompts: messages,
                should_stream: settings_ACU.streamingEnabled || false,
            });
            if (typeof response !== 'string') {
                throw new Error('主API调用未返回预期的文本响应。');
            }
            return response.trim();

        } else {
            // 模式B: 使用独立配置的API（流式传输）
            if (forceDirectApi && effectiveApiConfig.useMainApi) {
                if (effectiveApiConfig.url && effectiveApiConfig.model) {
                    logDebug_ACU('ACU: 并发模式启用，强制使用独立API路径。');
                } else {
                    logWarn_ACU('ACU: 并发模式要求独立API，但URL或模型未配置，回退主API。');
                    if (typeof TavernHelper_API_ACU.generateRaw !== 'function') {
                        throw new Error('TavernHelper.generateRaw 函数不存在。请检查酒馆版本。');
                    }
                    const response = await TavernHelper_API_ACU.generateRaw({
                        ordered_prompts: messages,
                        should_stream: settings_ACU.streamingEnabled || false,
                    });
                    if (typeof response !== 'string') {
                        throw new Error('主API调用未返回预期的文本响应。');
                    }
                    return response.trim();
                }
            }
            if (!effectiveApiConfig.url || !effectiveApiConfig.model) {
                throw new Error('自定义API的URL或模型未配置。');
            }
            const generateUrl = `/api/backends/chat-completions/generate`;
            
            const headers = { ...SillyTavern.getRequestHeaders(), 'Content-Type': 'application/json' };
            
            const body = JSON.stringify({
              "messages": messages,
              "model": effectiveApiConfig.model,
              "temperature": effectiveApiConfig.temperature,
              "top_p": effectiveApiConfig.top_p || 0.9,
              "max_tokens": effectiveApiConfig.max_tokens,
              "stream": settings_ACU.streamingEnabled || false,
              "chat_completion_source": "custom",
              "group_names": [],
              "include_reasoning": false,
              "reasoning_effort": "medium",
              "enable_web_search": false,
              "request_images": false,
              "custom_prompt_post_processing": "strict",
              "reverse_proxy": effectiveApiConfig.url,
              "proxy_password": "",
              "custom_url": effectiveApiConfig.url,
              "custom_include_headers": effectiveApiConfig.apiKey ? `Authorization: Bearer ${effectiveApiConfig.apiKey}` : ""
            });
            
            logDebug_ACU('ACU: 调用新的后端生成API:', generateUrl, 'Model:', effectiveApiConfig.model);
            const response = await fetch(generateUrl, { method: 'POST', headers, body, signal: abortSignal });
            
            if (!response.ok) {
              const errTxt = await response.text();
              throw new Error(`API请求失败: ${response.status} ${errTxt}`);
            }
            
            // 根据streamingEnabled设置选择响应处理方式
            const content = await handleApiResponse_ACU(response, abortSignal);
            if (content) {
                return content.trim();
            }
            throw new Error('API响应格式不正确或内容为空。');
        }
        }
    } finally {
        untrackAbortController_ACU(localAbortController);
        if (currentAbortController_ACU === localAbortController) {
            _set_currentAbortController_ACU(null);
        }
    }
  }

  // ===========================
  // TableEdit 解析健壮性工具集
  // - 允许 <tableEdit> 或 </tableEdit> 丢失一端
  // - 只要 <!-- --> 注释包裹完整，且内部包含 insertRow/updateRow/deleteRow，即可识别
  // ===========================
  function normalizeAiResponseForTableEditParsing_ACU(text) {
    if (typeof text !== 'string') return '';
    let cleaned = text.trim();
    // 移除JS风格的字符串拼接：'...' + '...'
    cleaned = cleaned.replace(/'\s*\+\s*'/g, '');
    // 移除可能包裹整个响应的单引号
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) cleaned = cleaned.slice(1, -1);
    // 将 "\\n" 转换为真实换行
    cleaned = cleaned.replace(/\\n/g, '\n');
    // 修复由JS字符串转义符（\\）导致的解析失败
    cleaned = cleaned.replace(/\\\\"/g, '\\"');
    // 修复全角冒号导致的 JSON 解析失败
    cleaned = cleaned.replace(/：/g, ':');
    return cleaned;
  }

  export function extractTableEditInner_ACU(text, options: any = {}) {
    const { allowNoTableEditTags = true, useLastPairOnly = (settings_ACU?.tableEditLastPairOnly !== false) } = options;
    const cleaned = normalizeAiResponseForTableEditParsing_ACU(text);
    if (!cleaned) return null;

    // 1) 标准格式：<tableEdit>...</tableEdit>
    if (useLastPairOnly) {
      const fullRe = /<tableEdit>([\s\S]*?)<\/tableEdit>/ig;
      let lastMatch = null;
      let m;
      while ((m = fullRe.exec(cleaned)) !== null) {
        lastMatch = m;
      }
      if (lastMatch && typeof lastMatch[1] === 'string') {
        return { inner: lastMatch[1], cleaned, mode: 'full_last' };
      }
    } else {
      const fullMatch = cleaned.match(/<tableEdit>([\s\S]*?)<\/tableEdit>/i);
      if (fullMatch && typeof fullMatch[1] === 'string') {
        return { inner: fullMatch[1], cleaned, mode: 'full' };
      }
    }

    // 2) 宽松格式：缺失开/闭标签，但 <!-- --> 包裹完整
    const lowerCleaned = cleaned.toLowerCase();
    const openTag = '<tableedit>';
    const closeTag = '</tableedit>';
    const hasOpen = lowerCleaned.includes(openTag);
    const hasClose = lowerCleaned.includes(closeTag);
    const hasAnyTag = hasOpen || hasClose;

    const commentRe = /<!--([\s\S]*?)-->/g;
    const commentBlocks = [];
    let m;
    while ((m = commentRe.exec(cleaned)) !== null) {
      commentBlocks.push({
        start: m.index,
        end: commentRe.lastIndex,
        raw: m[0],
        content: m[1] || ''
      });
    }

    const hasCommands = (s) => /(insertRow|updateRow|deleteRow)\s*\(/.test(s);
    const candidates = commentBlocks.filter(b => hasCommands(b.content));
    if (!candidates.length) return null;

    let chosen = null;
    if (hasOpen && !hasClose) {
      const openIdx = useLastPairOnly ? lowerCleaned.lastIndexOf(openTag) : cleaned.search(/<tableEdit>/i);
      chosen = candidates.find(b => b.start > openIdx) || (useLastPairOnly ? candidates[candidates.length - 1] : candidates[0]);
    } else if (!hasOpen && hasClose) {
      const closeIdx = useLastPairOnly ? lowerCleaned.lastIndexOf(closeTag) : cleaned.search(/<\/tableEdit>/i);
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (candidates[i].end < closeIdx) { chosen = candidates[i]; break; }
      }
      chosen = chosen || candidates[candidates.length - 1];
    } else if (hasAnyTag) {
      const lastOpenIdx = lowerCleaned.lastIndexOf(openTag);
      const lastCloseIdx = lowerCleaned.lastIndexOf(closeTag);
      const tagIdx = useLastPairOnly
        ? (lastCloseIdx !== -1 ? lastCloseIdx : lastOpenIdx)
        : (hasOpen ? cleaned.search(/<tableEdit>/i) : cleaned.search(/<\/tableEdit>/i));
      let bestDist = Infinity;
      candidates.forEach(b => {
        const dist = Math.min(Math.abs(b.start - tagIdx), Math.abs(b.end - tagIdx));
        if (dist < bestDist) { bestDist = dist; chosen = b; }
      });
    } else if (allowNoTableEditTags) {
      chosen = useLastPairOnly ? candidates[candidates.length - 1] : candidates[0];
    }

    if (!chosen) return null;
    return { inner: chosen.raw, cleaned, mode: 'comment_fallback', hasOpen, hasClose };
  }

  export function parseAndApplyTableEdits_ACU(aiResponse, updateMode = 'standard', isImportMode = false) {
    // updateMode: 'standard' 表示更新标准表，'summary' 表示更新总结表和总体大纲
    if (!currentJsonTableData_ACU) {
        logError_ACU('Cannot apply edits, currentJsonTableData_ACU is not loaded.');
        return false;
    }

    const extracted = extractTableEditInner_ACU(aiResponse, { allowNoTableEditTags: true });
    if (!extracted || !extracted.inner) {
        logWarn_ACU('No recognizable table edit block found (missing <tableEdit> boundary and/or incomplete <!-- --> wrapper).');
        return true; // Not a failure, just no edits to apply.
    }

    const editsString = extracted.inner.replace(/<!--|-->/g, '').trim();
    if (!editsString) {
        logDebug_ACU('Empty <tableEdit> block. No edits to apply.');
        return true;
    }
    
    // [核心修复] 增加指令重组步骤，处理AI生成的多行指令
    const originalLines = editsString.split('\n');
    const commandLines = [];
    let commandReconstructor = '';
    let isInJsonBlock = false; // [新增] 追踪是否在JSON对象块中

    originalLines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine === '') return;

        // [稳健性强化] 移除行尾的注释
        // 注意：如果是在JSON字符串内部的 // 应该保留，但在指令级应该移除
        // 这里简单处理：如果不在JSON块中，且包含 //，则移除 // 之后的内容
        let lineContent = trimmedLine;
        if (!isInJsonBlock && lineContent.includes('//') && !lineContent.includes('"//') && !lineContent.includes("'//")) {
             lineContent = lineContent.split('//')[0].trim();
        }
        if (lineContent === '') return;

        // 检查大括号平衡，判断是否进入或离开JSON块
        // 简单计数：{ +1, } -1
        // 注意：这只是简单的启发式方法，处理跨行JSON
        const openBraces = (lineContent.match(/{/g) || []).length;
        const closeBraces = (lineContent.match(/}/g) || []).length;
        
        // 如果当前行以指令开头，并且不在JSON块中
        if ((lineContent.startsWith('insertRow') || lineContent.startsWith('deleteRow') || lineContent.startsWith('updateRow')) && !isInJsonBlock) {
            if (commandReconstructor) {
                commandLines.push(commandReconstructor);
            }
            commandReconstructor = lineContent;
        } else {
            // 如果不是指令开头，或者是上一条指令的JSON参数延续，拼接到缓存
             // 在拼接时添加空格，防止粘连
            commandReconstructor += ' ' + lineContent;
        }

        // 更新JSON块状态
        // 只有当指令包含 '{' 但不包含 '}' 时，或者虽然包含 '}' 但数量少于 '{' 时，才认为是多行JSON的开始
        // 但考虑到一行内可能有完整的 {}, 我们需要维护一个累积计数
        // 这里的 isInJsonBlock 逻辑需要更精细：
        // 我们可以统计 reconstructor 中的 { 和 } 数量
        if (commandReconstructor) {
            const totalOpen = (commandReconstructor.match(/{/g) || []).length;
            const totalClose = (commandReconstructor.match(/}/g) || []).length;
            // 如果有左括号，且左括号多于右括号，说明JSON未闭合
            if (totalOpen > totalClose) {
                isInJsonBlock = true;
            } else {
                isInJsonBlock = false;
            }
        }
    });

    // 将最后一条缓存的指令推入
    if (commandReconstructor) {
        commandLines.push(commandReconstructor);
    }
    
    // [新增] 二次处理：处理挤在一行里的多条指令
    // 有时AI会输出：[0:全局数据表]- Update: ... [1:主要地点表]- Delete: ... 这种非标准格式
    // 或者标准的：insertRow(...); insertRow(...);
    const finalCommandLines = [];
    commandLines.forEach(rawLine => {
        // 1. 尝试分割用分号分隔的多个标准指令
        // 使用正则匹配 ; 后紧跟 insertRow/deleteRow/updateRow 的情况
        // 为了避免分割JSON内部的分号，我们先替换指令间的分号为特殊标记
        let processedLine = rawLine.replace(/;\s*(?=(insertRow|deleteRow|updateRow))/g, '___COMMAND_SPLIT___');
        
        // 2. [针对特定错误的修复] 处理非标准格式的指令堆叠
        // 错误示例: "[0:全局数据表]- Update: ... [1:主要地点表]- Delete: ..."
        // 这种格式非常难以直接解析，因为它是描述性语言而非函数调用。
        // 我们检测到这种格式时，尝试将其转换为标准指令或跳过并警告
        if (processedLine.match(/\[\d+:.*?\]-\s*(Update|Insert|Delete):/)) {
            logWarn_ACU(`Detected unstructured AI response format: "${rawLine}". Skipping this line as it is not a valid function call.`);
            return; 
        }

        const splitLines = processedLine.split('___COMMAND_SPLIT___');
        splitLines.forEach(l => {
             if (l.trim()) finalCommandLines.push(l.trim());
        });
    });
    
    let appliedEdits = 0;
    const editCountsByTable = {}; // Map<tableName, count>

    const sheetKeysForIndexing = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
    const sheets = sheetKeysForIndexing.map(k => currentJsonTableData_ACU[k]).filter(Boolean);

    // [新增] JSON 指令清洗管线：用于修复 AI 输出中的智能引号、未转义双引号、控制字符、尾随逗号等问题
    const normalizeQuotesLayer_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string' || !jsonStr) return jsonStr;
        return jsonStr.replace(/[“”「」『』＂]/g, '"');
    };

    const getNextNonWhitespaceMeta_ACU = (text, startIndex) => {
        for (let i = startIndex; i < text.length; i++) {
            if (!/\s/.test(text[i])) return { char: text[i], index: i };
        }
        return { char: '', index: -1 };
    };

    const isLikelyJsonValueStart_ACU = (char) => {
        return !!char && (
            char === '"' ||
            char === '{' ||
            char === '[' ||
            char === '-' ||
            /\d/.test(char) ||
            char === 't' ||
            char === 'f' ||
            char === 'n'
        );
    };

    const isLikelyStringCloser_ACU = (text, quoteIndex, stringKind, containerType) => {
        const nextMeta = getNextNonWhitespaceMeta_ACU(text, quoteIndex + 1);
        const nextChar = nextMeta.char;
        if (!nextChar) return stringKind !== 'key';
        if (stringKind === 'key') return nextChar === ':';
        if (nextChar === '}' || nextChar === ']') return true;
        if (nextChar !== ',') return false;

        const afterComma = getNextNonWhitespaceMeta_ACU(text, nextMeta.index + 1).char;
        if (!afterComma) return true;
        if (containerType === 'object') return afterComma === '"' || afterComma === '}';
        if (containerType === 'array') return afterComma === ']' || isLikelyJsonValueStart_ACU(afterComma);
        return isLikelyJsonValueStart_ACU(afterComma) || afterComma === '}' || afterComma === ']';
    };

    const escapeUnescapedQuotesLayer_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string') {
            return { success: false, result: jsonStr, error: 'Input is not a string' };
        }

        let result = '';
        let inString = false;
        let escapeNext = false;
        let currentStringKind = null;
        const containerStack = [];

        const getTopContainer = () => containerStack.length ? containerStack[containerStack.length - 1] : null;
        const markParentValueCompleted = () => {
            const parent = getTopContainer();
            if (!parent) return;
            if (parent.type === 'object' || parent.type === 'array') {
                parent.expecting = 'commaOrEnd';
            }
        };

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                result += char;
                escapeNext = false;
                continue;
            }

            if (inString) {
                if (char === '\\') {
                    result += char;
                    escapeNext = true;
                    continue;
                }

                if (char === '"') {
                    const top = getTopContainer();
                    const containerType = top?.type || null;
                    if (isLikelyStringCloser_ACU(jsonStr, i, currentStringKind, containerType)) {
                        result += char;
                        inString = false;
                        if (currentStringKind === 'key' && top && top.type === 'object') {
                            top.expecting = 'colon';
                        } else {
                            markParentValueCompleted();
                        }
                        currentStringKind = null;
                    } else {
                        result += '\\"';
                    }
                    continue;
                }

                result += char;
                continue;
            }

            if (char === '"') {
                result += char;
                inString = true;
                const top = getTopContainer();
                currentStringKind = top && top.type === 'object' && (top.expecting === 'key' || top.expecting === 'keyOrEnd')
                    ? 'key'
                    : 'value';
                continue;
            }

            if (char === '{') {
                result += char;
                containerStack.push({ type: 'object', expecting: 'keyOrEnd' });
                continue;
            }

            if (char === '[') {
                result += char;
                containerStack.push({ type: 'array', expecting: 'valueOrEnd' });
                continue;
            }

            if (char === ':') {
                result += char;
                const top = getTopContainer();
                if (top && top.type === 'object') top.expecting = 'value';
                continue;
            }

            if (char === ',') {
                result += char;
                const top = getTopContainer();
                if (top && top.type === 'object') top.expecting = 'key';
                if (top && top.type === 'array') top.expecting = 'value';
                continue;
            }

            if (char === '}' || char === ']') {
                result += char;
                containerStack.pop();
                markParentValueCompleted();
                continue;
            }

            result += char;
        }

        return { success: true, result, error: null };
    };

    const sanitizeControlCharsLayer_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string' || !jsonStr) return jsonStr;

        let result = '';
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                result += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                result += char;
                if (inString) escapeNext = true;
                continue;
            }

            if (char === '"') {
                result += char;
                inString = !inString;
                continue;
            }

            if (inString && char === '\n') {
                result += '\\n';
                continue;
            }
            if (inString && char === '\r') {
                result += '\\r';
                continue;
            }
            if (inString && char === '\t') {
                result += '\\t';
                continue;
            }
            if (inString && char === '\0') {
                result += '\\u0000';
                continue;
            }

            result += char;
        }

        return result;
    };

    const removeTrailingCommasLayer_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string' || !jsonStr) return jsonStr;

        let result = '';
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                result += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                result += char;
                if (inString) escapeNext = true;
                continue;
            }

            if (char === '"') {
                result += char;
                inString = !inString;
                continue;
            }

            if (!inString && char === ',') {
                const nextChar = getNextNonWhitespaceMeta_ACU(jsonStr, i + 1).char;
                if (nextChar === '}' || nextChar === ']') continue;
            }

            result += char;
        }

        return result;
    };

    const fixNumericKeysLayer_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string' || !jsonStr) return jsonStr;
        return jsonStr.replace(/([{,]\s*)(-?\d+)(\s*:)/g, '$1"$2"$3');
    };

    const sanitizeJsonPipeline_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string') {
            return { success: false, result: jsonStr, layersApplied: [], error: 'Input is not a string' };
        }

        const layersApplied = [];
        let current = jsonStr;

        const normalizedQuotes = normalizeQuotesLayer_ACU(current);
        if (normalizedQuotes !== current) layersApplied.push('normalizeQuotes');
        current = normalizedQuotes;

        const escapedQuotes = escapeUnescapedQuotesLayer_ACU(current);
        if (!escapedQuotes.success) {
            return { success: false, result: current, layersApplied, error: escapedQuotes.error };
        }
        if (escapedQuotes.result !== current) layersApplied.push('escapeUnescapedQuotes');
        current = escapedQuotes.result;

        const sanitizedControlChars = sanitizeControlCharsLayer_ACU(current);
        if (sanitizedControlChars !== current) layersApplied.push('sanitizeControlChars');
        current = sanitizedControlChars;

        const withoutTrailingCommas = removeTrailingCommasLayer_ACU(current);
        if (withoutTrailingCommas !== current) layersApplied.push('removeTrailingCommas');
        current = withoutTrailingCommas;

        const fixedNumericKeys = fixNumericKeysLayer_ACU(current);
        if (fixedNumericKeys !== current) layersApplied.push('fixNumericKeys');
        current = fixedNumericKeys;

        return { success: true, result: current, layersApplied, error: null };
    };

    const splitTopLevelSegments_ACU = (text, delimiterChar = ',') => {
        if (typeof text !== 'string' || !text) return [];

        const segments = [];
        let current = '';
        let inString = false;
        let escapeNext = false;
        let braceDepth = 0;
        let bracketDepth = 0;
        let parenDepth = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                current += char;
                if (inString) escapeNext = true;
                continue;
            }

            if (char === '"') {
                current += char;
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') braceDepth++;
                else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
                else if (char === '[') bracketDepth++;
                else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
                else if (char === '(') parenDepth++;
                else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
                else if (char === delimiterChar && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
                    if (current.trim()) segments.push(current.trim());
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        if (current.trim()) segments.push(current.trim());
        return segments;
    };

    const findTopLevelDelimiterIndex_ACU = (text, delimiterChar = ':') => {
        if (typeof text !== 'string' || !text) return -1;

        let inString = false;
        let escapeNext = false;
        let braceDepth = 0;
        let bracketDepth = 0;
        let parenDepth = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                if (inString) escapeNext = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') braceDepth++;
                else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
                else if (char === '[') bracketDepth++;
                else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
                else if (char === '(') parenDepth++;
                else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
                else if (char === delimiterChar && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) return i;
            }
        }

        return -1;
    };

    const tryParseLooseJsonValue_ACU = (rawValue) => {
        if (typeof rawValue !== 'string') return { success: true, value: rawValue, error: null };

        const trimmed = rawValue.trim();
        if (!trimmed) return { success: false, value: null, error: 'Empty value' };

        const normalizedValue = (trimmed.startsWith("'") && trimmed.endsWith("'"))
            ? `"${trimmed.slice(1, -1)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\r/g, '\\r')
                .replace(/\n/g, '\\n')
                .replace(/\t/g, '\\t')}"`
            : trimmed;

        const wrappedValue = `[${normalizedValue}]`;
        try {
            return { success: true, value: JSON.parse(wrappedValue)[0], error: null };
        } catch (directError) {
            const sanitizedWrapped = sanitizeJsonPipeline_ACU(wrappedValue);
            if (sanitizedWrapped.success) {
                try {
                    return { success: true, value: JSON.parse(sanitizedWrapped.result)[0], error: null };
                } catch (sanitizedError) {}
            }
            return { success: false, value: null, error: directError?.message || 'Failed to parse loose value' };
        }
    };

    const parseLooseObjectKey_ACU = (rawKey) => {
        const trimmed = typeof rawKey === 'string' ? rawKey.trim() : '';
        if (!trimmed) return null;
        if (/^-?\d+$/.test(trimmed)) return trimmed;

        const parsedKey = tryParseLooseJsonValue_ACU(trimmed);
        if (parsedKey.success && (typeof parsedKey.value === 'string' || typeof parsedKey.value === 'number')) {
            return String(parsedKey.value);
        }

        return trimmed.replace(/^["']|["']$/g, '');
    };

    const coerceLooseRowObject_ACU = (jsonStr) => {
        if (typeof jsonStr !== 'string') {
            return { success: false, result: null, recoveredKeys: [], error: 'Input is not a string' };
        }

        const trimmed = jsonStr.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
            return { success: false, result: null, recoveredKeys: [], error: 'Input is not an object literal' };
        }

        const body = trimmed.slice(1, -1).trim();
        if (!body) return { success: true, result: {}, recoveredKeys: [], error: null };

        const segments = splitTopLevelSegments_ACU(body, ',').filter(Boolean);
        if (!segments.length) {
            return { success: false, result: null, recoveredKeys: [], error: 'No top-level segments detected' };
        }

        const result = {};
        let nextAutoKey = 0;

        for (const segment of segments) {
            const colonIndex = findTopLevelDelimiterIndex_ACU(segment, ':');
            if (colonIndex !== -1) {
                const parsedKey = parseLooseObjectKey_ACU(segment.slice(0, colonIndex));
                const parsedValue = tryParseLooseJsonValue_ACU(segment.slice(colonIndex + 1));
                if (!parsedKey || !parsedValue.success) {
                    return {
                        success: false,
                        result: null,
                        recoveredKeys: Object.keys(result),
                        error: `Failed to parse keyed segment: ${segment}`,
                    };
                }
                result[parsedKey] = parsedValue.value;
                const numericKey = Number.parseInt(parsedKey, 10);
                if (!Number.isNaN(numericKey) && String(numericKey) === parsedKey) {
                    nextAutoKey = Math.max(nextAutoKey, numericKey + 1);
                }
                continue;
            }

            const parsedValue = tryParseLooseJsonValue_ACU(segment);
            if (!parsedValue.success) {
                return {
                    success: false,
                    result: null,
                    recoveredKeys: Object.keys(result),
                    error: `Failed to parse value-only segment: ${segment}`,
                };
            }

            while (Object.prototype.hasOwnProperty.call(result, String(nextAutoKey))) {
                nextAutoKey++;
            }
            result[String(nextAutoKey)] = parsedValue.value;
            nextAutoKey++;
        }

        const recoveredKeys = Object.keys(result).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        if (!recoveredKeys.length) {
            return { success: false, result: null, recoveredKeys: [], error: 'No recoverable columns found' };
        }

        return { success: true, result, recoveredKeys, error: null };
    };

    // [新增] 统一解析指令（供预检查与正式应用复用）
    const parseTableEditCommandLine_ACU = (rawLine) => {
        try {
            let commandLineWithoutComment = rawLine;
            if (commandLineWithoutComment.match(/\)\s*;?\s*\/\/.*$/)) {
                commandLineWithoutComment = commandLineWithoutComment.replace(/\/\/.*$/, '').trim();
            }
            if (!commandLineWithoutComment) return null;
            const match = commandLineWithoutComment.match(/^(insertRow|deleteRow|updateRow)\s*\((.*)\);?$/);
            if (!match) return null;
            const command = match[1];
            const argsString = match[2];
            let args;
            const firstBracket = argsString.indexOf('{');
            if (firstBracket === -1) {
                args = JSON.parse(`[${argsString}]`);
            } else {
                const paramsPart = argsString.substring(0, firstBracket).trim();
                let jsonPart = argsString.substring(firstBracket);
                const initialArgs = JSON.parse(`[${paramsPart.replace(/,$/, '')}]`);
                try {
                    const jsonData = JSON.parse(jsonPart);
                    args = [...initialArgs, jsonData];
                } catch (jsonError) {
                    logError_ACU(`Primary JSON parse failed for: "${jsonPart}". Attempting sanitization pipeline...`, jsonError);

                    const originalLooseObjectResult = coerceLooseRowObject_ACU(jsonPart);
                    if (originalLooseObjectResult.success) {
                        args = [...initialArgs, originalLooseObjectResult.result];
                        logWarn_ACU(`[JSON Sanitization] Recovered malformed row object from original payload via loose parsing. Keys: ${originalLooseObjectResult.recoveredKeys.join(', ')}`);
                    } else {
                        const sanitizeResult = sanitizeJsonPipeline_ACU(jsonPart);
                        if (!sanitizeResult.success) {
                            logError_ACU(`JSON sanitization pipeline failed for: "${jsonPart}"`, new Error(sanitizeResult.error || 'Unknown sanitization error'));
                            throw jsonError;
                        }

                        try {
                            const jsonData = JSON.parse(sanitizeResult.result);
                            args = [...initialArgs, jsonData];
                            if (sanitizeResult.layersApplied.length > 0) {
                                logWarn_ACU(`[JSON Sanitization] Applied layers: ${sanitizeResult.layersApplied.join(', ')}`);
                            }
                        } catch (sanitizedJsonError) {
                            const looseObjectResult = coerceLooseRowObject_ACU(sanitizeResult.result);
                            if (looseObjectResult.success) {
                                args = [...initialArgs, looseObjectResult.result];
                                logWarn_ACU(`[JSON Sanitization] Recovered malformed row object from sanitized payload via loose parsing. Keys: ${looseObjectResult.recoveredKeys.join(', ')}`);
                            } else {
                                const sanitizedPreview = sanitizeResult.result.length > 400
                                    ? `${sanitizeResult.result.slice(0, 400)}...`
                                    : sanitizeResult.result;
                                logError_ACU(`Sanitized JSON parse failed after layers [${sanitizeResult.layersApplied.join(', ') || 'none'}]: "${sanitizedPreview}"`, sanitizedJsonError);
                                logError_ACU(`[JSON Sanitization] Loose row object recovery failed. Original: ${originalLooseObjectResult.error || 'Unknown'}; Sanitized: ${looseObjectResult.error || 'Unknown'}`);
                                throw sanitizedJsonError;
                            }
                        }
                    }
                }
            }
            return { command, args, line: commandLineWithoutComment };
        } catch (e) {
            logError_ACU(`Failed to parse command line: "${rawLine}"`, e);
            return null;
        }
    };

    // [新增] 总结表/总体大纲必须“同时新增一行”才允许写入
    let summaryInsertCount = 0;
    let outlineInsertCount = 0;
    const standardizedFillEnabled = settings_ACU?.standardizedTableFillEnabled !== false;
    if (standardizedFillEnabled) {
        finalCommandLines.forEach(line => {
            try {
                const parsed = parseTableEditCommandLine_ACU(line);
                if (!parsed || parsed.command !== 'insertRow') return;
                const tableIndex = parsed.args?.[0];
                const table = sheets[tableIndex];
                if (!table || !table.name) return;
                if (!isSummaryOrOutlineTable_ACU(table.name)) return;
                if (table.name === '总结表') summaryInsertCount++;
                if (table.name === '总体大纲') outlineInsertCount++;
            } catch (e) {
                // 解析失败的不计入，避免“半条成功半条失败”导致误放行
            }
        });
    }
    const allowSummaryOutlineInsert = !standardizedFillEnabled ||
        (summaryInsertCount === 1 && outlineInsertCount === 1) ||
        (summaryInsertCount === 0 && outlineInsertCount === 0);
    if (standardizedFillEnabled && !allowSummaryOutlineInsert && (summaryInsertCount > 0 || outlineInsertCount > 0)) {
        logWarn_ACU(`[屏蔽] 总结表/总体大纲新增不同步：总结=${summaryInsertCount}, 大纲=${outlineInsertCount}，本轮两表均不写入。`);
    }

    // 如果某表 content 为空，但指导表/模板提供了 seedRows，则在真正应用编辑前先物化到 content，
    // 避免 AI 基于 $0 中的 seed rows 进行 updateRow/deleteRow 时“找不到行”。
    const materializeSeedRowsIfNeeded_ACU = (table) => {
        try {
            if (!table || typeof table !== 'object') return;
            if (!Array.isArray(table.content) || table.content.length !== 1) return;
            // [修复] seedRows 可能未挂到表对象：这里按 uid(sheetKey) 再兜底一次
            let sr = (Array.isArray(table.seedRows) && table.seedRows.length > 0) ? table.seedRows : null;
            if (!sr && table.uid && String(table.uid).startsWith('sheet_')) {
                sr = getEffectiveSeedRowsForSheet_ACU(String(table.uid), { guideData: null, allowTemplateFallback: true });
                if (Array.isArray(sr) && sr.length > 0) {
                    try { table.seedRows = JSON.parse(JSON.stringify(sr)); } catch (e) {}
                }
            }
            if (!Array.isArray(sr) || sr.length === 0) return;
            const headerRow = Array.isArray(table.content[0]) ? JSON.parse(JSON.stringify(table.content[0])) : [null];
            const seed = JSON.parse(JSON.stringify(sr));
            table.content = [headerRow, ...seed];
        } catch (e) {}
    };

    // [新增] 重置本次参与更新的表格的统计信息
    // 由于我们不知道哪些表会更新，只能在实际更新时设置。
    // 但为了清除旧状态，也许应该在保存时处理？
    // 不，这里是应用编辑。我们只记录本次编辑的数量。
    
    finalCommandLines.forEach(line => {
        const parsed = parseTableEditCommandLine_ACU(line);
        if (!parsed) {
            logWarn_ACU(`Skipping malformed or truncated command line: "${line}"`);
            return;
        }
        const { command, args } = parsed;

        try {
            switch (command) {
                case 'insertRow': {
                    const [tableIndex, data] = args;
                    const table = sheets[tableIndex];
                    if (!table || !table.name) {
                        logWarn_ACU(`Table at index ${tableIndex} not found or has no name. Skipping insertRow.`);
                        break;
                    }
                    materializeSeedRowsIfNeeded_ACU(table);
                    const sheetKey = sheetKeysForIndexing[tableIndex];
                    // [新增] 根据更新模式和表格名称屏蔽不相关的表格操作
                    // [修复] 统一更新模式（'full'）允许所有操作，不阻止任何表
                    const isSummaryTable = isSummaryOrOutlineTable_ACU(table.name);
                    // [逻辑优化] 使用更明确的模式匹配
                    const isUnifiedMode = (updateMode === 'full' || updateMode === 'manual_unified' || updateMode === 'auto_unified');
                    const isStandardMode = (updateMode === 'standard' || updateMode === 'auto_standard' || updateMode === 'manual_standard');
                    const isSummaryMode = (updateMode === 'summary' || updateMode === 'auto_summary' || updateMode === 'auto_summary_silent' || updateMode === 'manual_summary');
                    const isManualMode = (updateMode && updateMode.startsWith('manual'));

                    if (isUnifiedMode) {
                        // 统一更新模式：允许所有操作，不阻止任何表
                        // 继续处理
                    } else if (isStandardMode && isSummaryTable) {
                        if (isManualMode) {
                            logDebug_ACU(`[屏蔽] 标准表更新模式(手动)：忽略总结表/总体大纲的insertRow操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                            break;
                        }
                        // 自动模式下不再屏蔽
                    } else if (isSummaryMode && !isSummaryTable) {
                        if (isManualMode) {
                            logDebug_ACU(`[屏蔽] 总结表更新模式(手动)：忽略标准表的insertRow操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                            break;
                        }
                        // 自动模式下不再屏蔽
                    }
                    // [新增] 总结表/总体大纲必须“同时新增一行”
                    if (isSummaryTable && !allowSummaryOutlineInsert) {
                        logDebug_ACU(`[屏蔽] 总结表/总体大纲新增不同步：忽略 insertRow (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                        break;
                    }
                    if (table && table.content && typeof data === 'object') {
                        const newRow = [null];
                        const headers = table.content[0].slice(1);
                        const specialIndexCol = (isSummaryTable && sheetKey && isSpecialIndexLockEnabled_ACU(sheetKey))
                            ? getSummaryIndexColumnIndex_ACU(table)
                            : -1;
                        headers.forEach((_, colIndex) => {
                            let nextVal = data[colIndex] || (data[String(colIndex)] || "");
                            if (colIndex === specialIndexCol) {
                                nextVal = formatSummaryIndexCode_ACU(table.content.length);
                            }
                            newRow.push(nextVal);
                        });
                        table.content.push(newRow);
                        if (isSummaryTable && specialIndexCol >= 0) {
                            applySummaryIndexSequenceToTable_ACU(table, specialIndexCol);
                        }
                        logDebug_ACU(`Applied insertRow to table ${tableIndex} (${table.name}) with data:`, data);
                        appliedEdits++;
                        editCountsByTable[table.name] = (editCountsByTable[table.name] || 0) + 1;
                    }
                    break;
                }
                case 'deleteRow': {
                    const [tableIndex, rowIndex] = args;
                    const table = sheets[tableIndex];
                    if (!table || !table.name) {
                        logWarn_ACU(`Table at index ${tableIndex} not found or has no name. Skipping deleteRow.`);
                        break;
                    }
                    materializeSeedRowsIfNeeded_ACU(table);
                    // [新增] 根据更新模式和表格名称屏蔽不相关的表格操作
                    // [修复] 统一更新模式（'full'）允许所有操作，不阻止任何表
                    const isSummaryTable = isSummaryOrOutlineTable_ACU(table.name);

                    // [优化] 总结表只允许 insertRow 操作，屏蔽 deleteRow 和 updateRow
                    // 注意：这里是对总结表本身的限制，不论何种模式都生效（总结表不应该被删除行，只能新增）
                    if (isSummaryTable) {
                        logDebug_ACU(`[屏蔽] 总结表/总体大纲忽略 deleteRow 操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                        break;
                    }

                    // [逻辑优化] 使用更明确的模式匹配
                    const isUnifiedMode = (updateMode === 'full' || updateMode === 'manual_unified' || updateMode === 'auto_unified');
                    const isStandardMode = (updateMode === 'standard' || updateMode === 'auto_standard' || updateMode === 'manual_standard');
                    const isSummaryMode = (updateMode === 'summary' || updateMode === 'auto_summary' || updateMode === 'auto_summary_silent' || updateMode === 'manual_summary');
                    const isManualMode = (updateMode && updateMode.startsWith('manual'));

                    if (isUnifiedMode) {
                        // 统一更新模式：允许所有操作，不阻止任何表
                        // 继续处理
                    } else if (isStandardMode && isSummaryTable) {
                        if (isManualMode) {
                            logDebug_ACU(`[屏蔽] 标准表更新模式(手动)：忽略总结表/总体大纲的deleteRow操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                            break;
                        }
                        // 自动模式下不再屏蔽
                    } else if (isSummaryMode && !isSummaryTable) {
                        if (isManualMode) {
                            logDebug_ACU(`[屏蔽] 总结表更新模式(手动)：忽略标准表的deleteRow操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                            break;
                        }
                        // 自动模式下不再屏蔽
                    }
                    if (table && table.content && table.content.length > rowIndex + 1) {
                        table.content.splice(rowIndex + 1, 1);
                        logDebug_ACU(`Applied deleteRow to table ${tableIndex} (${table.name}) at index ${rowIndex}`);
                        appliedEdits++;
                        editCountsByTable[table.name] = (editCountsByTable[table.name] || 0) + 1;
                    }
                    break;
                }
                case 'updateRow': {
                    const [tableIndex, rowIndex, data] = args;
                    const table = sheets[tableIndex];
                    if (!table || !table.name) {
                        logWarn_ACU(`Table at index ${tableIndex} not found or has no name. Skipping updateRow.`);
                        break;
                    }
                    materializeSeedRowsIfNeeded_ACU(table);
                    const sheetKey = sheetKeysForIndexing[tableIndex];
                    // [新增] 根据更新模式和表格名称屏蔽不相关的表格操作
                    // [修复] 统一更新模式（'full'）允许所有操作，不阻止任何表
                    const isSummaryTable = isSummaryOrOutlineTable_ACU(table.name);

                    // [优化] 总结表只允许 insertRow 操作，屏蔽 deleteRow 和 updateRow
                    if (isSummaryTable) {
                        logDebug_ACU(`[屏蔽] 总结表/总体大纲忽略 updateRow 操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                        break;
                    }

                    // [逻辑优化] 使用更明确的模式匹配
                    const isUnifiedMode = (updateMode === 'full' || updateMode === 'manual_unified' || updateMode === 'auto_unified');
                    const isStandardMode = (updateMode === 'standard' || updateMode === 'auto_standard' || updateMode === 'manual_standard');
                    const isSummaryMode = (updateMode === 'summary' || updateMode === 'auto_summary' || updateMode === 'auto_summary_silent' || updateMode === 'manual_summary');
                    const isManualMode = (updateMode && updateMode.startsWith('manual'));

                    if (isUnifiedMode) {
                        // 统一更新模式：允许所有操作，不阻止任何表
                        // 继续处理
                    } else if (isStandardMode && isSummaryTable) {
                        if (isManualMode) {
                            logDebug_ACU(`[屏蔽] 标准表更新模式(手动)：忽略总结表/总体大纲的updateRow操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                            break;
                        }
                        // 自动模式下不再屏蔽
                    } else if (isSummaryMode && !isSummaryTable) {
                        if (isManualMode) {
                            logDebug_ACU(`[屏蔽] 总结表更新模式(手动)：忽略标准表的updateRow操作 (tableIndex: ${tableIndex}, tableName: ${table.name})`);
                            break;
                        }
                        // 自动模式下不再屏蔽
                    }
                    if (table && table.content && table.content.length > rowIndex + 1 && typeof data === 'object') {
                        const lockState = sheetKey ? getTableLocksForSheet_ACU(sheetKey) : { rows: new Set(), cols: new Set(), cells: new Set() };
                        if (lockState.rows.has(rowIndex)) {
                            logDebug_ACU(`[锁定] 行锁定阻止 updateRow (tableIndex: ${tableIndex}, rowIndex: ${rowIndex})`);
                            break;
                        }
                        Object.keys(data).forEach(colIndexStr => {
                            const colIndex = parseInt(colIndexStr, 10);
                            if (isNaN(colIndex)) return;
                            if (lockState.cols.has(colIndex)) return;
                            if (lockState.cells.has(`${rowIndex}:${colIndex}`)) return;
                            if (table.content[rowIndex + 1].length > colIndex + 1) {
                                table.content[rowIndex + 1][colIndex + 1] = data[colIndexStr];
                            }
                        });
                        if (isSummaryTable && sheetKey && isSpecialIndexLockEnabled_ACU(sheetKey)) {
                            const specialIndexCol = getSummaryIndexColumnIndex_ACU(table);
                            if (specialIndexCol >= 0) applySummaryIndexSequenceToTable_ACU(table, specialIndexCol);
                        }
                        logDebug_ACU(`Applied updateRow to table ${tableIndex} (${table.name}) at index ${rowIndex} with data:`, data);
                        appliedEdits++;
                        editCountsByTable[table.name] = (editCountsByTable[table.name] || 0) + 1;
                    }
                    break;
                }
            }
        } catch (e) {
            logError_ACU(`Failed to parse or apply command: "${line}"`, e);
        }
    });

    // [新增] 将统计信息写入表格对象，以便保存和展示
    Object.keys(editCountsByTable).forEach(tableName => {
        const sheetKey = Object.keys(currentJsonTableData_ACU).find(k => currentJsonTableData_ACU[k].name === tableName);
        if (sheetKey) {
            if (!currentJsonTableData_ACU[sheetKey]._lastUpdateStats) {
                currentJsonTableData_ACU[sheetKey]._lastUpdateStats = {};
            }
            currentJsonTableData_ACU[sheetKey]._lastUpdateStats.changes = editCountsByTable[tableName];
        }
    });
    
    // [新增] 收集所有被修改的表格 key
    const modifiedSheetKeys = [];
    Object.keys(editCountsByTable).forEach(tableName => {
        if (editCountsByTable[tableName] > 0) {
            const sheetKey = Object.keys(currentJsonTableData_ACU).find(k => currentJsonTableData_ACU[k].name === tableName);
            if (sheetKey) modifiedSheetKeys.push(sheetKey);
        }
    });
    
    return { success: true, modifiedKeys: modifiedSheetKeys, appliedEdits };
}

// --- 流式响应处理（从 03_runtime_api.js:2025~2110 迁移）---
async function streamToText_ACU(response, signal = null) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
        while (true) {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }
            
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留不完整的行

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const json = JSON.parse(data);
                        const content = json?.choices?.[0]?.delta?.content;
                        if (content) {
                            fullContent += content;
                        }
                    } catch (e) {
                        // 忽略解析错误，继续处理下一行
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullContent;
}

/**
 * 解析非流式API响应，提取文本内容
 * @param {Response} response - fetch 返回的 Response 对象
 * @returns {Promise<string|null>} AI 响应文本，失败返回null
 */
async function parseNonStreamResponse_ACU(response) {
    try {
        const data = await response.json();
        // 标准OpenAI格式: choices[0].message.content
        if (data?.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        // 其他可能的格式
        if (data?.content) {
            return data.content;
        }
        if (typeof data === 'string') {
            return data;
        }
        logError_ACU('[parseNonStreamResponse] Unknown response format:', data);
        return null;
    } catch (e) {
        logError_ACU('[parseNonStreamResponse] Failed to parse response:', e);
        return null;
    }
}

/**
 * 统一处理API响应，根据streamingEnabled设置自动选择解析方式
 * @param {Response} response - fetch 返回的 Response 对象
 * @param {AbortSignal} signal - 可选的中止信号
 * @returns {Promise<string|null>} AI 响应文本，失败返回null
 */
export async function handleApiResponse_ACU(response, signal = null) {
    if (settings_ACU.streamingEnabled) {
        return await streamToText_ACU(response, signal);
    } else {
        return await parseNonStreamResponse_ACU(response);
    }
}
