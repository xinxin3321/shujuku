/**
 * service/runtime/plot-runtime/plot-task-engine.ts
 * 剧情推进 — Task 执行引擎（排序/分组/上下文构建/单任务执行/运行时调度）+ 世界书内容获取
 * 从 helpers-plot-runtime.ts 拆出（L532-L1023 + L1513-L1618）
 */
import { DEFAULT_PLOT_SETTINGS_ACU } from '../../../shared/defaults-json.js';
import { callApi_ACU, callApiWithPlotPreset_ACU, getApiConfigByPreset_ACU } from '../../ai/api-call';
import { abortController_ACU, currentJsonTableData_ACU, planningGuard_ACU, settings_ACU, _set_tempPlotToSave_ACU, _set_currentJsonTableData_ACU, _set_pendingFinalGenerationGreenlights_ACU } from '../state-manager';
import { getCharLorebooks_ACU } from '../../../data/gateways/character-gateway';
import { getChatArray_ACU } from '../../../data/gateways/chat-gateway';
import { getPersonaDescription_ACU, getCharDescription_ACU } from '../../../data/gateways/host-state-gateway';
import { buildCombinedWorldbookContentByStrategy_ACU, collectCombinedWorldbookEntriesByStrategy_ACU, formatCombinedWorldbookEntries_ACU } from '../../worldbook/pipeline';
import { escapeRegExp_ACU, hashUserInput_ACU, isEntryBlocked_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU } from '../../../shared/utils';
import { ensurePlotTasksCompat_ACU, getPlotPromptContentByIdFromSettings_ACU, normalizePlotTask_ACU, normalizePlotTasks_ACU } from '../../plot/plot-logic';
import { parseRandomTags_ACU, replaceRandomVariables_ACU, getLatestAIMessageContent_ACU, replaceDbSqlVariables } from '../template-vars';
import { applyContextTagFilters_ACU, applyExcludeRulesToText_ACU } from '../helpers-context-tags';
import { mergeAllIndependentTables_ACU } from '../helpers-data-merge';
import { formatTableDataForLLM_ACU, formatOutlineTableForPlot_ACU, formatSummaryIndexForPlot_ACU, getSummaryIndexContentForPlot_ACU } from './plot-data-format';
import { getNormalizedPlotMessageRole_ACU, tryRenderPlotTemplateWithEjs_ACU, renderPlotTaskContentWithIsolatedVariables_ACU, extractPlotTagsFromResponse_ACU, getPlotPlaceholderTagNames_ACU, buildPlotTagMapFromText_ACU, replacePlotTagPlaceholders_ACU, buildTaskWorldbookTriggerText_ACU, sortPlotTaskResults_ACU, aggregatePlotTaskTags_ACU, buildPlotSaveContentFromTaskResults_ACU, buildFinalPlotInjectionMessage_ACU } from './plot-tag-utils';
import { getPlotFromHistory_ACU, savePlotToLatestMessage_ACU } from './plot-history-preset';
import { abortableDelay } from '../../../shared/abortable-delay';
import { runAgentDecisionForPlot_ACU, type AgentDecisionResult_ACU, type AgentWorldbookRef_ACU } from '../../agent/agent-decision-engine';
import { normalizeAgentContextSettings_ACU } from '../../agent/agent-prompt-template';

  function checkPlotAbortRequested_ACU() {
    if (abortController_ACU && abortController_ACU.signal.aborted) {
      throw new Error('TaskAbortedByUser');
    }
  }

  function getPlotTaskApiPresetOverrides_ACU(): Record<string, string> {
    if (!settings_ACU.plotTaskApiPresetOverridesById || typeof settings_ACU.plotTaskApiPresetOverridesById !== 'object' || Array.isArray(settings_ACU.plotTaskApiPresetOverridesById)) {
      settings_ACU.plotTaskApiPresetOverridesById = {};
    }
    return settings_ACU.plotTaskApiPresetOverridesById;
  }

  function resolvePlotTaskApiPreset_ACU(task: any): string {
    const taskId = String(task?.id || '').trim();
    if (taskId) {
      const mappedPreset = String(getPlotTaskApiPresetOverrides_ACU()[taskId] || '').trim();
      if (mappedPreset) return mappedPreset;
    }
    const legacyTaskPreset = String(task?.taskApiPreset || '').trim();
    if (legacyTaskPreset) return legacyTaskPreset;
    return String(settings_ACU.plotApiPreset || '').trim();
  }

  export function willPlotUseMainApiGenerateRaw_ACU(taskApiPreset: string = '') {
    try {
      const effectivePreset = String(taskApiPreset || '').trim() || String(settings_ACU.plotApiPreset || '').trim();
      const apiPresetConfig: any = getApiConfigByPreset_ACU(effectivePreset) || {};
      const effectiveApiMode = apiPresetConfig.apiMode ?? settings_ACU.apiMode;
      const effectiveApiConfig = apiPresetConfig.apiConfig || settings_ACU.apiConfig || {};
      return effectiveApiMode !== 'tavern' && !!effectiveApiConfig.useMainApi;
    } catch (e) {
      return settings_ACU.apiMode !== 'tavern' && !!settings_ACU.useMainApi;
    }
  }

  function sortPlotTasksForRuntime_ACU(tasks: any[]) {
    return (Array.isArray(tasks) ? [...tasks] : [])
      .filter(Boolean)
      .sort((a, b) => (normalizePositiveInteger_ACU(a?.stage, 1) - normalizePositiveInteger_ACU(b?.stage, 1)) || ((a?.order ?? 0) - (b?.order ?? 0)));
  }

  function groupPlotTasksByStage_ACU(tasks: any[]) {
    const stageGroups: { stage: number; tasks: any[] }[] = [];
    sortPlotTasksForRuntime_ACU(tasks).forEach((task: any) => {
      const stageNo = normalizePositiveInteger_ACU(task?.stage, 1);
      let currentGroup = stageGroups[stageGroups.length - 1];
      if (!currentGroup || currentGroup.stage !== stageNo) {
        currentGroup = { stage: stageNo, tasks: [] };
        stageGroups.push(currentGroup);
      }
      currentGroup.tasks.push(task);
    });
    return stageGroups;
  }

  function getEnabledPlotTasks_ACU(plotSettings: Record<string, any>) {
    return sortPlotTasksForRuntime_ACU(
      normalizePlotTasks_ACU(plotSettings)
        .filter((task: any) => task && task.enabled !== false),
    );
  }

  async function buildPlotSharedContext_ACU(plotSettings: Record<string, any>, userMessage: string, runtimeOptions: any = {}) {
    const chat = getChatArray_ACU();
    const contextTurnCount = plotSettings.contextTurnCount ?? 1;
    let slicedContext: { role: string; content: string }[] = [];
    let contextEndIndex = (chat?.length || 0) - 1;
    if (contextEndIndex >= 0 && chat[contextEndIndex] && chat[contextEndIndex].is_user) {
      if (String(chat[contextEndIndex].mes || '') === String(userMessage || '')) {
        contextEndIndex -= 1;
      }
    }
    const agentContextMessages = contextEndIndex >= 0 ? chat.slice(0, contextEndIndex + 1) : [];

    if (contextTurnCount > 0) {
      let aiCount = 0;
      const extracted: { role: string; content: string }[] = [];

      for (let i = contextEndIndex; i >= 0 && aiCount < contextTurnCount; i--) {
        const msg = chat[i];
        if (!msg) continue;
        if (msg.is_user) continue;
        if (msg._qrf_from_planning) continue;

        let content = msg.mes;
        const extractTags = (plotSettings.contextExtractTags || '').trim();
        const extractRules = normalizeExtractRules_ACU(plotSettings.contextExtractRules, extractTags);
        const excludeTags = (plotSettings.contextExcludeTags || '').trim();
        const excludeRules = normalizeExcludeRules_ACU(plotSettings.contextExcludeRules, excludeTags);
        if (extractTags || extractRules.length > 0 || excludeTags || excludeRules.length > 0) {
          content = applyContextTagFilters_ACU(content, { extractTags, extractRules, excludeTags, excludeRules });
        }

        extracted.unshift({ role: 'assistant', content });
        aiCount++;
      }

      slicedContext = extracted;
    }

    const historyAnchorText = String(runtimeOptions.inputForHash ?? userMessage ?? '');
    const historyLookupOptions = runtimeOptions.hasExistingUserMessage && historyAnchorText.trim()
      ? {
        beforeUserInputHash: hashUserInput_ACU(historyAnchorText),
        beforeUserInputText: historyAnchorText,
      }
      : {};
    const lastPlotContent = getPlotFromHistory_ACU(historyLookupOptions);
    logDebug_ACU('[剧情推进] $6 上轮规划数据:', lastPlotContent ? `长度=${lastPlotContent.length}` : '(空)');

    // 世界书内容不再在此处用整段 lastPlotContent 预计算，
    // 而是延迟到 executeSinglePlotTask_ACU 中按任务实际 {{tag}} 注入内容按需计算。
    let worldbookContent = '';
    logDebug_ACU('[剧情推进] $1 世界书内容: 延迟到任务级计算');

    let outlineTableContent = '';
    try {
      if (!currentJsonTableData_ACU || typeof currentJsonTableData_ACU !== 'object') {
        try {
          const merged = await mergeAllIndependentTables_ACU();
          if (merged && typeof merged === 'object') {
            _set_currentJsonTableData_ACU(merged);
          }
        } catch (e) { logWarn_ACU('[剧情任务] 合并表格数据失败, 剧情推进可能使用过时数据:', e); }
      }

      const summaryIndexWorldbookContent = await getSummaryIndexContentForPlot_ACU(plotSettings);
      if (typeof summaryIndexWorldbookContent === 'string' && summaryIndexWorldbookContent.trim()) {
        outlineTableContent = summaryIndexWorldbookContent;
        logDebug_ACU('[剧情推进] $5 使用世界书纪要索引条目内容');
      } else if (currentJsonTableData_ACU && typeof currentJsonTableData_ACU === 'object') {
        const summaryIndexResult = formatSummaryIndexForPlot_ACU(currentJsonTableData_ACU);
        if (summaryIndexResult.success) {
          outlineTableContent = summaryIndexResult.content;
          logDebug_ACU('[剧情推进] $5 未找到世界书纪要索引条目，使用纪要表的概要和编码索引列');
        } else {
          logDebug_ACU('[剧情推进] $5 纪要表读取失败，回退使用总体大纲表。原因:', summaryIndexResult.content);
          outlineTableContent = formatOutlineTableForPlot_ACU(currentJsonTableData_ACU);
          logDebug_ACU('[剧情推进] $5 回退使用总体大纲表内容');
        }
      } else {
        outlineTableContent = '纪要索引：当前未加载到数据库数据。';
      }
    } catch (error) {
      logError_ACU('[剧情推进] 生成纪要索引($5)时出错:', error);
      outlineTableContent = '{"error": "加载表格数据时发生错误"}';
    }

    const plotExcludeTags = (plotSettings.contextExcludeTags || '').trim();
    const plotExcludeRules = normalizeExcludeRules_ACU(plotSettings.contextExcludeRules, plotExcludeTags);
    const filterPlotInjectedContent = (value: any, placeholderKey: string = '') => {
      const text = value !== undefined && value !== null ? String(value) : '';
      if (!['$1', '$5', '$6', '$7', '$8', '$U', '$C'].includes(placeholderKey)) return text;
      return applyExcludeRulesToText_ACU(text, { excludeRules: plotExcludeRules, excludeTags: plotExcludeTags });
    };

    const sanitizeHtml = (htmlString: string): string => {
      if (!htmlString) return '';
      return String(htmlString)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
    };

    const formattedHistory = (slicedContext && Array.isArray(slicedContext) ? slicedContext : [])
      .map(msg => `assistant："${sanitizeHtml(msg.content)}"`)
      .join(' \n ');

    const contextInjectionText = formattedHistory && formattedHistory.trim()
      ? `以下是前文的故事发展（AI输出），给你用作参考：\n ${formattedHistory}`
      : '';

    let userInfoContent_Plot = '';
    try {
      userInfoContent_Plot = getPersonaDescription_ACU();
      logDebug_ACU(`[剧情推进] $U (persona_description) 获取结果: ${userInfoContent_Plot ? '成功' : '为空'}`);
    } catch (e) {
      logWarn_ACU('[剧情推进] 获取用户设定描述时出错:', e);
      userInfoContent_Plot = '';
    }

    let charInfoContent_Plot = '';
    try {
      charInfoContent_Plot = getCharDescription_ACU();
      logDebug_ACU(`[剧情推进] $C (char_description) 获取结果: ${charInfoContent_Plot ? '成功，长度=' + charInfoContent_Plot.length : '为空'}`);
    } catch (e) {
      logWarn_ACU('[剧情推进] 获取角色描述时出错:', e);
      charInfoContent_Plot = '';
    }

    const replacements: Record<string, any> = {
      sulv1: plotSettings.rateMain,
      sulv2: plotSettings.ratePersonal,
      sulv3: plotSettings.rateErotic,
      sulv4: plotSettings.rateCuckold,
      zhaohui: plotSettings.recallCount,
      $5: outlineTableContent,
      $6: lastPlotContent,
      $7: contextInjectionText,
      $8: userMessage,
      $U: userInfoContent_Plot,
      $C: charInfoContent_Plot,
    };

    const performReplacements = (text: string, taskOverrides: Record<string, any> = {}) => {
      if (!text) return '';
      let processed = text;

      // 任务级世界书内容优先；若未提供则使用共享预计算值（当前为空）
      const effectiveWorldbookContent = taskOverrides.$1 !== undefined
        ? String(taskOverrides.$1)
        : worldbookContent;
      const worldbookReplacement = effectiveWorldbookContent
        ? `\n<worldbook_context>\n${filterPlotInjectedContent(effectiveWorldbookContent, '$1')}\n</worldbook_context>\n`
        : '';
      processed = processed.replace(/(?<!\\)\$1/g, worldbookReplacement);

      for (const key in replacements) {
        const value = taskOverrides[key] !== undefined ? taskOverrides[key] : replacements[key];
        const regex = new RegExp(escapeRegExp_ACU(key), 'g');
        const filteredValue = filterPlotInjectedContent(value, key);
        processed = processed.replace(regex, () => filteredValue);
      }
      return processed;
    };

    // 世界书后处理已在任务级逻辑中完成；共享阶段不再做后处理

    const defaultDirective = '[SYSTEM_DIRECTIVE: You are a storyteller. The following <plot> block is your absolute script for this turn. You MUST follow the <directive> within it to generate the story.]';
    let finalSystemDirectiveContent = defaultDirective;
    let rawFinal = getPlotPromptContentByIdFromSettings_ACU(plotSettings, 'finalSystemDirective')
      || plotSettings.finalSystemDirective
      || '';
    rawFinal = await tryRenderPlotTemplateWithEjs_ACU(rawFinal);
    const plotFinalDirective = performReplacements(rawFinal);
    let finalWithRandom = parseRandomTags_ACU(plotFinalDirective);
    finalWithRandom = replaceRandomVariables_ACU(finalWithRandom);
    // [P4] {[db...]}/{[sql...]} 值替换（SQLite 模式下）
    finalWithRandom = replaceDbSqlVariables(finalWithRandom);
    if (finalWithRandom && finalWithRandom.trim()) {
      finalSystemDirectiveContent = finalWithRandom.trim();
    }

    let seedContentForConditional = '';
    try {
      seedContentForConditional = getLatestAIMessageContent_ACU();
      logDebug_ACU('[剧情推进] 条件模板检测内容长度:', seedContentForConditional.length);
    } catch (e) {
      logWarn_ACU('[剧情推进] 准备条件模板检测内容时出错:', e);
    }

    return {
      plotSettings,
      userMessage,
      lastPlotContent,
      performReplacements,
      finalSystemDirectiveContent,
      seedContentForConditional,
      recentContextMessages: Array.isArray(agentContextMessages) ? agentContextMessages : [],
      allTablesJson: currentJsonTableData_ACU,
    };
  }

  async function renderPlotTaskMessages_ACU(task: Record<string, any>, sharedContext: Record<string, any>, runtimeOptions: any = {}) {
    const promptGroup = JSON.parse(JSON.stringify(task?.promptGroup || []));
    const messagesToUse = Array.isArray(promptGroup) ? promptGroup : [];
    const historyTagMap = runtimeOptions.historyTagMap instanceof Map
      ? runtimeOptions.historyTagMap
      : buildPlotTagMapFromText_ACU(sharedContext.lastPlotContent, null);
    const relayTagMap = runtimeOptions.relayTagMap instanceof Map ? runtimeOptions.relayTagMap : new Map();

    // 构建 $1 的任务级覆盖值（任务级世界书内容）
    const replacementOverrides: Record<string, any> = {};
    if (sharedContext.taskWorldbookContent !== undefined) {
      replacementOverrides.$1 = sharedContext.taskWorldbookContent;
    }

    for (const seg of messagesToUse) {
      if (!seg || typeof seg.content !== 'string') continue;
      let c = seg.content;
      c = await tryRenderPlotTemplateWithEjs_ACU(c);
      c = sharedContext.performReplacements(c, replacementOverrides);
      c = replacePlotTagPlaceholders_ACU(c, relayTagMap, historyTagMap);
      c = renderPlotTaskContentWithIsolatedVariables_ACU(c, sharedContext);
      seg.__renderedContent = c;
    }

    return messagesToUse
      .filter(seg => seg && typeof seg.__renderedContent === 'string' && seg.__renderedContent.trim().length > 0)
      .map(seg => ({ role: getNormalizedPlotMessageRole_ACU(seg.role), content: seg.__renderedContent }));
  }

  async function executeSinglePlotTask_ACU(task: Record<string, any>, sharedContext: Record<string, any>, runtimeOptions: any = {}) {
    const normalizedTask = normalizePlotTask_ACU(task, { index: task?.order ?? 0, fallbackTask: task || null });
    const taskLabel = normalizedTask.name || normalizedTask.id || '未命名任务';
    const taskStage = normalizePositiveInteger_ACU(normalizedTask.stage, 1);
    const maxRetries = normalizePositiveInteger_ACU(
      normalizedTask.maxRetries,
      sharedContext?.plotSettings?.loopSettings?.maxRetries ?? DEFAULT_PLOT_SETTINGS_ACU.loopSettings?.maxRetries ?? 3,
    );
    const minLength = normalizeNonNegativeInteger_ACU(normalizedTask.minLength, 0);

    // 任务级世界书计算：基于当前任务实际使用的 {{tag}} 注入内容 + 本轮上下文触发，
    // 而不是固定使用整段上一轮剧情内容。
    // 标签来源与 renderPlotTaskMessages_ACU 一致：
    // - 若本轮已完成任务产出目标标签：优先用本轮 relayTagMap
    // - 否则回退到 historyTagMap / lastPlotContent（上一轮历史）
    let taskWorldbookContent = '';
    try {
      const taskPlotContent = String(sharedContext.lastPlotContent || '');
      const effectiveRelayTagMap = runtimeOptions.relayTagMap instanceof Map
        ? runtimeOptions.relayTagMap
        : undefined;
      // 从任务 prompt 中提取 {{tag}}，按实际标签来源取对应内容，构造触发文本
      const worldbookTriggerText = buildTaskWorldbookTriggerText_ACU(normalizedTask.promptGroup, taskPlotContent, effectiveRelayTagMap, runtimeOptions.historyTagMap);
      if (worldbookTriggerText) {
        logDebug_ACU(`[剧情推进] [任务:${taskLabel}] 基于 {{tag}} 注入内容构造世界书触发文本，长度: ${worldbookTriggerText.length}`);
      } else {
        logDebug_ACU(`[剧情推进] [任务:${taskLabel}] 无 {{tag}} 注入内容，世界书仅基于本轮上下文触发`);
      }
      const taskAgentGreenlights = sharedContext.agentDecision?.plotGreenlights?.[String(normalizedTask.id || '').trim()] || [];
      taskWorldbookContent = await getWorldbookContentForPlot_ACU(sharedContext.plotSettings, sharedContext.userMessage, worldbookTriggerText, taskAgentGreenlights);
      if (taskWorldbookContent) {
        // 对任务级世界书内容执行与共享管线相同的后处理
        taskWorldbookContent = await tryRenderPlotTemplateWithEjs_ACU(taskWorldbookContent);
        taskWorldbookContent = parseRandomTags_ACU(taskWorldbookContent);
        taskWorldbookContent = replaceRandomVariables_ACU(taskWorldbookContent);
        taskWorldbookContent = replaceDbSqlVariables(taskWorldbookContent);
        logDebug_ACU(`[剧情推进] [任务:${taskLabel}] 任务级世界书内容长度: ${taskWorldbookContent.length}`);
      }
    } catch (wbError) {
      logWarn_ACU(`[剧情推进] [任务:${taskLabel}] 任务级世界书计算失败，$1 将为空:`, wbError);
      taskWorldbookContent = '';
    }

    // 构建任务级共享上下文：覆盖 $1 替换值，使 performReplacements 使用任务级世界书内容
    const taskSharedContext = {
      ...sharedContext,
      taskWorldbookContent,
    };

    try {
      checkPlotAbortRequested_ACU();
      const messages = await renderPlotTaskMessages_ACU(normalizedTask, taskSharedContext, runtimeOptions);
      checkPlotAbortRequested_ACU();

      if (!messages.length) {
        return {
          taskId: normalizedTask.id,
          taskName: taskLabel,
          success: false,
          rawResponse: '',
          extractedTags: {},
          injectedFragments: [],
          error: '任务未生成任何有效提示词消息。',
          stage: taskStage,
          order: normalizedTask.order ?? 0,
        };
      }

      let rawResponse = '';
      let lastErrorMessage = '';

      for (let attemptIndex = 0; attemptIndex < maxRetries; attemptIndex++) {
        checkPlotAbortRequested_ACU();

        const effectivePlotApiPreset = resolvePlotTaskApiPreset_ACU(normalizedTask);
        if (willPlotUseMainApiGenerateRaw_ACU(effectivePlotApiPreset)) {
          planningGuard_ACU.ignoreNextGenerationEndedCount++;
        }

        let tempMessage = null;
        let apiError = null;
        try {
          logDebug_ACU(`[剧情推进] [阶段:${taskStage}] [任务:${taskLabel}] 使用任务级API预设: ${effectivePlotApiPreset || '当前配置'}`);
          tempMessage = await callApiWithPlotPreset_ACU(messages, effectivePlotApiPreset, abortController_ACU?.signal || null);
        } catch (apiCallError) {
          if (apiCallError?.name === 'AbortError' || String(apiCallError?.message || '').toLowerCase().includes('aborted')) {
            throw apiCallError;
          }
          apiError = apiCallError;
          lastErrorMessage = apiCallError?.message || 'API调用失败';
          logWarn_ACU(`[剧情推进] [阶段:${taskStage}] [任务:${taskLabel}] 第 ${attemptIndex + 1} 次API调用失败:`, lastErrorMessage);
        }

        checkPlotAbortRequested_ACU();

        if (!apiError && tempMessage) {
          if (minLength <= 0 || tempMessage.length >= minLength) {
            rawResponse = tempMessage;
            logDebug_ACU(`[剧情推进] [阶段:${taskStage}] [任务:${taskLabel}] 在第 ${attemptIndex + 1} 次尝试中成功完成。`);
            break;
          }
          lastErrorMessage = `回复长度不足（${tempMessage.length}/${minLength}）`;
          logWarn_ACU(`[剧情推进] [阶段:${taskStage}] [任务:${taskLabel}] 第 ${attemptIndex + 1} 次回复过短: ${tempMessage.length}/${minLength}`);
        }

        if (attemptIndex < maxRetries - 1) {
          // 可被 abort 信号中断的等待，避免用户点中止后还要等 5 秒
          await abortableDelay(5000, abortController_ACU?.signal);
        }
      }

      if (!rawResponse) {
        return {
          taskId: normalizedTask.id,
          taskName: taskLabel,
          success: false,
          rawResponse: '',
          extractedTags: {},
          injectedFragments: [],
          error: lastErrorMessage || '任务在最大重试次数后仍未返回有效结果。',
          stage: taskStage,
          order: normalizedTask.order ?? 0,
        };
      }

      const { tagNames, extractedTags, injectedFragments, injectOnlyTags, injectOnlyFragments, injectOnlyTagNames } = extractPlotTagsFromResponse_ACU(rawResponse, normalizedTask.extractTags, normalizedTask.extractInjectTags);
      if (tagNames.length > 0 && Object.keys(extractedTags).length > 0) {
        logDebug_ACU(`[剧情推进] [阶段:${taskStage}] [任务:${taskLabel}] 成功摘取标签: ${Object.keys(extractedTags).join(', ')}`);
      }

      return {
        taskId: normalizedTask.id,
        taskName: taskLabel,
        success: true,
        rawResponse,
        extractedTags,
        injectedFragments,
        injectOnlyTags,
        injectOnlyFragments,
        injectOnlyTagNames,
        error: null as string | null,
        stage: taskStage,
        order: normalizedTask.order ?? 0,
      };
    } catch (error) {
      if (error?.message === 'TaskAbortedByUser' || error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted')) {
        throw error;
      }
      logError_ACU(`[剧情推进] [阶段:${taskStage}] [任务:${taskLabel}] 执行失败:`, error);
      return {
        taskId: normalizedTask.id,
        taskName: taskLabel,
        success: false,
        rawResponse: '',
        extractedTags: {},
        injectedFragments: [] as any[],
        error: error?.message || '任务执行失败。',
        stage: taskStage,
        order: normalizedTask.order ?? 0,
      };
    }
  }

  export async function runPlotTasksRuntime_ACU(plotSettings: Record<string, any>, userMessage: string, runtimeOptions: any = {}) {
    const { inputForHash = userMessage, hasExistingUserMessage = false } = runtimeOptions;

    _set_pendingFinalGenerationGreenlights_ACU([]);

    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });

    let enabledTasks = getEnabledPlotTasks_ACU(plotSettings);
    if (!enabledTasks.length) {
      logWarn_ACU('[剧情推进] 当前没有可执行的启用任务。');
      return {
        finalMessage: null,
        successfulResults: [],
        failedResults: [],
        aggregatedTags: new Map(),
        enabledTaskCount: 0,
      };
    }

    const sharedContext: Record<string, any> = await buildPlotSharedContext_ACU(plotSettings, userMessage, {
      inputForHash,
      hasExistingUserMessage,
    });
    checkPlotAbortRequested_ACU();

    const agentDecision: AgentDecisionResult_ACU = await runAgentDecisionForPlot_ACU({
      plotSettings,
      userMessage,
      sharedContext,
      enabledTasks,
    });
    sharedContext.agentDecision = agentDecision;
    const finalGenerationGreenlights = agentDecision.active === true && Array.isArray(agentDecision.finalGenerationGreenlights)
      ? agentDecision.finalGenerationGreenlights
      : [];
    _set_pendingFinalGenerationGreenlights_ACU(finalGenerationGreenlights);
    if (agentDecision.active === true) {
      enabledTasks = Array.isArray(agentDecision.effectiveTasks) ? agentDecision.effectiveTasks : [];
    }

    if (!enabledTasks.length) {
      logDebug_ACU('[剧情推进] Agent 决策本轮不执行任何推进任务。');
      return {
        finalMessage: null,
        successfulResults: [],
        failedResults: [],
        aggregatedTags: new Map(),
        enabledTaskCount: 0,
      };
    }

    const stageGroups = groupPlotTasksByStage_ACU(enabledTasks);
    const historyTagMap = buildPlotTagMapFromText_ACU(sharedContext.lastPlotContent || '', null);

    // 构建历史检索选项，供任务级历史回溯使用
    const historyAnchorText = String(inputForHash ?? userMessage ?? '');
    const historyLookupOptions = hasExistingUserMessage && historyAnchorText.trim()
      ? {
          beforeUserInputHash: hashUserInput_ACU(historyAnchorText),
          beforeUserInputText: historyAnchorText,
        }
      : {};

    const successfulResults: any[] = [];
    const failedResults: any[] = [];
    let aggregatedTags = new Map();
    let completedSuccessfulResults: any[] = [];
    let aggregatedInjectOnlyTagNames = new Set<string>();

    for (let stageIndex = 0; stageIndex < stageGroups.length; stageIndex++) {
      const stageGroup = stageGroups[stageIndex];

      let stageEffectivePreset = String(settings_ACU.plotApiPreset || '').trim();
      for (const stageTask of stageGroup.tasks) {
        const taskId = String(stageTask?.id || '').trim();
        const mappedPreset = taskId ? String(getPlotTaskApiPresetOverrides_ACU()[taskId] || '').trim() : '';
        const legacyTaskPreset = String(stageTask?.taskApiPreset || '').trim();
        const explicitTaskPreset = mappedPreset || legacyTaskPreset;
        if (explicitTaskPreset) {
          stageEffectivePreset = explicitTaskPreset;
          break;
        }
      }

      logDebug_ACU(`[剧情推进] 阶段 ${stageGroup.stage} 开始执行，任务级API预设将按各任务独立决议。`);

      const stageRelayTagMap = new Map(aggregatedTags);
      const stageResults: any[] = await Promise.all(stageGroup.tasks.map((task: any) => {
        const stageTask = stageEffectivePreset
          ? { ...task, taskApiPreset: stageEffectivePreset }
          : task;
        return executeSinglePlotTask_ACU(stageTask, sharedContext, {
          relayTagMap: stageRelayTagMap,
          historyTagMap,
          historyLookupOptions,
        });
      }));
      checkPlotAbortRequested_ACU();

      const stageSuccessfulResults = stageResults.filter((result: any) => result?.success);
      const stageFailedResults = stageResults.filter((result: any) => result && !result.success);
      successfulResults.push(...stageSuccessfulResults);
      failedResults.push(...stageFailedResults);
      completedSuccessfulResults = [...successfulResults];

      if (stageFailedResults.length > 0) {
        stageFailedResults.forEach((result: any) => {
          logWarn_ACU(
            `[剧情推进] [阶段:${result.stage ?? stageGroup.stage}] [任务:${result.taskName || result.taskId || '未命名任务'}] 未产出有效结果: ${result.error || '未知错误'}`,
          );
        });
        const failedTaskNames = stageFailedResults.map((result: any) => result.taskName || result.taskId || '未命名任务').join('、');
        return {
          finalMessage: null as string | null,
          successfulResults,
          failedResults,
          aggregatedTags,
          enabledTaskCount: enabledTasks.length,
          abortedByStageFailure: true,
          failedStage: stageGroup.stage,
          errorMessage: `剧情任务阶段 ${stageGroup.stage} 执行失败（${failedTaskNames}），后续阶段已停止。`,
        };
      }

      const { aggregated: stageAggregated, injectOnlyTagNames: stageInjectOnly } = aggregatePlotTaskTags_ACU(completedSuccessfulResults);
      aggregatedTags = stageAggregated;
      stageInjectOnly.forEach((name: string) => aggregatedInjectOnlyTagNames.add(name));
      logDebug_ACU(`[剧情推进] 阶段 ${stageGroup.stage} 已完成，成功任务数: ${stageSuccessfulResults.length}`);
    }

    if (!successfulResults.length) {
      return {
        finalMessage: null as string | null,
        successfulResults,
        failedResults,
        aggregatedTags: new Map(),
        enabledTaskCount: enabledTasks.length,
      };
    }

    const saveContent = buildPlotSaveContentFromTaskResults_ACU(successfulResults);
    const userInputHash = hashUserInput_ACU(inputForHash);
    _set_tempPlotToSave_ACU({
      content: saveContent,
      userInputHash,
      userInputText: inputForHash,
      taskResults: successfulResults,
    });
    logDebug_ACU('[剧情推进] [Plot] 已暂存plot数据，用户输入哈希:', userInputHash, '，原始文本长度:', inputForHash?.length || 0);

    const finalMessage = buildFinalPlotInjectionMessage_ACU(
      sharedContext.finalSystemDirectiveContent,
      successfulResults,
      aggregatedTags,
      aggregatedInjectOnlyTagNames,
    );

    await savePlotToLatestMessage_ACU(true);

    return {
      finalMessage,
      successfulResults,
      failedResults,
      aggregatedTags,
      enabledTaskCount: enabledTasks.length,
    };
  }

  // ═══ 世界书内容获取 ═══

  /** 获取剧情推进功能的世界书内容（默认开启，无需检查 worldbookEnabled） */
  export async function getWorldbookContentForPlot_ACU(apiSettings: Record<string, any>, userMessage: string, extraBaseText: string = '', agentGreenlights: AgentWorldbookRef_ACU[] = []) {
    if (!apiSettings) {
      logWarn_ACU('[剧情推进] apiSettings 为空，无法获取世界书');
      return '';
    }

    logDebug_ACU('[剧情推进] Starting to get combined worldbook content with shared placeholder pipeline...');

    try {
      let bookNames: string[] = [];

      const plotCfg = (apiSettings && apiSettings.plotWorldbookConfig) ? apiSettings.plotWorldbookConfig : null;
      const worldbookSource = plotCfg?.source || apiSettings.worldbookSource || 'character';
      logDebug_ACU('[剧情推进] 世界书来源模式:', worldbookSource);

      if (worldbookSource === 'manual') {
        bookNames = plotCfg?.manualSelection || apiSettings.selectedWorldbooks || [];
        logDebug_ACU('[剧情推进] 手动选择的世界书:', bookNames);
      } else {
        logDebug_ACU('[剧情推进] 使用角色绑定的世界书模式');
        try {
          const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
          logDebug_ACU('[剧情推进] 获取到的角色世界书:', charLorebooks);
          if (charLorebooks.primary) bookNames.push(charLorebooks.primary);
          if (charLorebooks.additional?.length) bookNames.push(...charLorebooks.additional);
        } catch (error) {
          logError_ACU('[剧情推进] 获取角色世界书失败:', error);
          return '';
        }
      }

      bookNames = [...new Set((Array.isArray(bookNames) ? bookNames : []).filter(Boolean))];
      logDebug_ACU('[剧情推进] 最终要扫描的世界书列表:', bookNames);
      if (bookNames.length === 0) {
        logWarn_ACU('[剧情推进] 没有找到任何世界书，$1 将为空');
        return '';
      }

      const hasAgentScanLimit = apiSettings?.agentWorldbookControl?.contextSettingsConfigured === true;
      const rawAgentScanLimit = apiSettings?.agentWorldbookControl?.contextSettings?.plotWorldbookScanMessageLimit;
      const agentContextSettings = hasAgentScanLimit && Number.isFinite(Number(rawAgentScanLimit))
        ? normalizeAgentContextSettings_ACU(apiSettings?.agentWorldbookControl?.contextSettings)
        : null;
      const historyLimit = agentContextSettings
        ? agentContextSettings.plotWorldbookScanMessageLimit
        : (Number.isFinite(apiSettings.contextTurnCount) ? Math.max(1, Math.trunc(apiSettings.contextTurnCount)) : 3);
      const chatArray = getChatArray_ACU();
      const recentMessages = historyLimit > 0 ? chatArray.slice(-historyLimit) : chatArray;
      const historyAndUserText = `${recentMessages.map((message: any) => message.mes || '').join('\n')}\n${userMessage || ''}`;
      const enabledMap = plotCfg?.enabledEntries;
      const hasAnySelection = enabledMap && typeof enabledMap === 'object' && Object.keys(enabledMap).length > 0;
      const agentGreenlightKeySet = new Set((Array.isArray(agentGreenlights) ? agentGreenlights : [])
        .map(ref => `${String(ref?.bookName || '').trim()}\u0000${String(ref?.uid || '').trim()}`)
        .filter(key => !key.startsWith('\u0000') && !key.endsWith('\u0000')));
      const hasAgentGreenlights = agentGreenlightKeySet.size > 0;

      return await buildCombinedWorldbookContentByStrategy_ACU({
        logPrefix: '[剧情推进]',
        bookNames,
        formatEntry: (entry: any) => {
          const isAgentGreenlight = agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
          if (isAgentGreenlight) return String(entry?.content || '').trim();
          const comment = entry.comment || `Entry from ${entry.bookName}`;
          return `# ${comment}\n${entry.content}`;
        },
        baseScanText: [historyAndUserText, extraBaseText || ''].filter(Boolean).join('\n'),
        includeConstantEntriesInBaseScan: true,
        includeEntry: (entry: any) => {
          const normalizedComment = entry.normalizedComment || '';
          const isAgentGreenlight = agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
          if (isAgentGreenlight) return true;
          const isOutlineEntry = normalizedComment.startsWith('TavernDB-ACU-OutlineTable');
          const isSummaryIndexEntry = normalizedComment.startsWith('TavernDB-ACU-CustomExport-纪要索引');
          if (isOutlineEntry || isSummaryIndexEntry) {
            return false;
          }

          const isDbGenerated =
            normalizedComment.startsWith('TavernDB-ACU-') ||
            normalizedComment.startsWith('总结条目') ||
            normalizedComment.startsWith('小总结条目') ||
            normalizedComment.startsWith('重要人物条目');
          if (!isDbGenerated && isEntryBlocked_ACU(entry)) {
            logDebug_ACU(`[剧情推进] 条目被屏蔽: "${entry.rawComment || entry.comment || entry.name || ''}"`);
            return false;
          }
          return true;
        },
        isSelected: (entry: any) => {
          const normalizedComment = entry.normalizedComment || '';
          const isDbGenerated =
            normalizedComment.startsWith('TavernDB-ACU-') ||
            normalizedComment.startsWith('总结条目') ||
            normalizedComment.startsWith('小总结条目') ||
            normalizedComment.startsWith('重要人物条目');
          const isAgentGreenlight = agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
          if (hasAgentGreenlights) {
            return isAgentGreenlight || (isDbGenerated && entry.enabled !== false);
          }
          if (!hasAnySelection) return true;
          if (isDbGenerated) return true;
          const list = enabledMap?.[entry.bookName];
          if (typeof list === 'undefined') return true;
          if (!Array.isArray(list)) return true;
          return list.includes(entry.uid);
        },
        forceIncludeEntry: (entry: any) => {
          return agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
        },
        onEntriesFiltered: (entries: any[]) => {
          logDebug_ACU('[剧情推进] 过滤后的条目总数:', entries.length);
        },
        onSelectedEntries: (entries: any[]) => {
          logDebug_ACU('[剧情推进] SillyTavern中启用的条目数量:', entries.length);
        },
      });
    } catch (error) {
      logError_ACU('[剧情推进] 处理世界书内容时发生错误:', error);
      return '';
    }
  }

  /**
   * 获取 Agent 正文生成放行的结构化世界书条目。
   *
   * 这个入口只服务 finalGenerationGreenlights：
   * - 不修改酒馆世界书条目状态；
   * - 不依赖关键词触发；
   * - 不混入未被 Agent 放行的普通世界书条目；
   * - 保留 position/depth/role/order，用于正文生成时按原世界书位置注入。
   */
  export async function getAgentGreenlightWorldbookEntriesForPlot_ACU(apiSettings: Record<string, any>, agentGreenlights: AgentWorldbookRef_ACU[] = []) {
    if (!apiSettings) {
      logWarn_ACU('[剧情推进] apiSettings 为空，无法获取 Agent 正文世界书绿灯');
      return [];
    }

    const agentGreenlightKeySet = new Set((Array.isArray(agentGreenlights) ? agentGreenlights : [])
      .map(ref => `${String(ref?.bookName || '').trim()}\u0000${String(ref?.uid || '').trim()}`)
      .filter(key => !key.startsWith('\u0000') && !key.endsWith('\u0000')));
    if (agentGreenlightKeySet.size === 0) return [];

    try {
      let bookNames: string[] = [];
      const plotCfg = (apiSettings && apiSettings.plotWorldbookConfig) ? apiSettings.plotWorldbookConfig : null;
      const worldbookSource = plotCfg?.source || apiSettings.worldbookSource || 'character';

      if (worldbookSource === 'manual') {
        bookNames = plotCfg?.manualSelection || apiSettings.selectedWorldbooks || [];
      } else {
        try {
          const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
          if (charLorebooks.primary) bookNames.push(charLorebooks.primary);
          if (charLorebooks.additional?.length) bookNames.push(...charLorebooks.additional);
        } catch (error) {
          logError_ACU('[剧情推进] 获取角色世界书失败，无法注入 Agent 正文世界书绿灯:', error);
          return [];
        }
      }

      bookNames = [...new Set((Array.isArray(bookNames) ? bookNames : []).filter(Boolean))];
      if (bookNames.length === 0) return [];

      return await collectCombinedWorldbookEntriesByStrategy_ACU({
        logPrefix: '[剧情推进][Agent正文绿灯]',
        bookNames,
        baseScanText: '',
        includeConstantEntriesInBaseScan: false,
        includeEntry: (entry: any) => {
          return agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
        },
        isSelected: (entry: any) => {
          return agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
        },
        forceIncludeEntry: (entry: any) => {
          return agentGreenlightKeySet.has(`${String(entry.bookName || '').trim()}\u0000${String(entry.uid || '').trim()}`);
        },
        onEntriesFiltered: (entries: any[]) => {
          logDebug_ACU('[剧情推进][Agent正文绿灯] Agent 放行条目候选数量:', entries.length);
        },
        onSelectedEntries: (entries: any[]) => {
          logDebug_ACU('[剧情推进][Agent正文绿灯] Agent 放行条目启用数量:', entries.length);
        },
      });
    } catch (error) {
      logError_ACU('[剧情推进] 处理 Agent 正文世界书绿灯时发生错误:', error);
      return [];
    }
  }

  /**
   * 获取 Agent 正文生成放行的世界书内容。
   *
   * 保留字符串入口用于既有调用方；正文生成位置敏感场景应优先使用
   * getAgentGreenlightWorldbookEntriesForPlot_ACU 以保留 depth/order/role。
   */
  export async function getAgentGreenlightWorldbookContentForPlot_ACU(apiSettings: Record<string, any>, agentGreenlights: AgentWorldbookRef_ACU[] = []) {
    const finalEntries = await getAgentGreenlightWorldbookEntriesForPlot_ACU(apiSettings, agentGreenlights);
    const combinedContent = formatCombinedWorldbookEntries_ACU(finalEntries, (entry: any) => String(entry?.content || '').trim());
    if (combinedContent) {
      logDebug_ACU('[剧情推进][Agent正文绿灯] Agent 正文世界书绿灯内容已生成，长度:', combinedContent.length);
    }
    return combinedContent;
  }
