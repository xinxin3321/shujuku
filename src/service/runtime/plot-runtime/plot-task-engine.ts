/**
 * service/runtime/plot-runtime/plot-task-engine.ts
 * 剧情推进 — Task 执行引擎（排序/分组/上下文构建/单任务执行/运行时调度）+ 世界书内容获取
 * 从 helpers-plot-runtime.ts 拆出（L532-L1023 + L1513-L1618）
 */
import { DEFAULT_PLOT_SETTINGS_ACU } from '../../../shared/defaults-json.js';
import { callApi_ACU, getApiConfigByPreset_ACU } from '../../ai/api-call';
import { abortController_ACU, currentJsonTableData_ACU, planningGuard_ACU, settings_ACU, _set_tempPlotToSave_ACU, _set_currentJsonTableData_ACU } from '../state-manager';
import { getCharLorebooks_ACU } from '../../../data/gateways/character-gateway';
import { getChatArray_ACU } from '../../../data/gateways/chat-gateway';
import { getPersonaDescription_ACU, getCharDescription_ACU } from '../../../data/gateways/host-state-gateway';
import { buildCombinedWorldbookContentByStrategy_ACU } from '../../worldbook/pipeline';
import { escapeRegExp_ACU, hashUserInput_ACU, isEntryBlocked_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU } from '../../../shared/utils';
import { ensurePlotTasksCompat_ACU, getPlotPromptContentByIdFromSettings_ACU, normalizePlotTask_ACU, normalizePlotTasks_ACU } from '../../plot/plot-logic';
import { parseRandomTags_ACU, replaceRandomVariables_ACU, getLatestAIMessageContent_ACU } from '../template-vars';
import { applyContextTagFilters_ACU, applyExcludeRulesToText_ACU } from '../helpers-context-tags';
import { mergeAllIndependentTables_ACU } from '../helpers-data-merge';
import { formatTableDataForLLM_ACU, formatOutlineTableForPlot_ACU, formatSummaryIndexForPlot_ACU, getSummaryIndexContentForPlot_ACU } from './plot-data-format';
import { getNormalizedPlotMessageRole_ACU, tryRenderPlotTemplateWithEjs_ACU, renderPlotTaskContentWithIsolatedVariables_ACU, extractPlotTagsFromResponse_ACU, getPlotPlaceholderTagNames_ACU, buildPlotTagMapFromText_ACU, replacePlotTagPlaceholders_ACU, sortPlotTaskResults_ACU, aggregatePlotTaskTags_ACU, buildPlotSaveContentFromTaskResults_ACU, buildFinalPlotInjectionMessage_ACU } from './plot-tag-utils';
import { getPlotFromHistory_ACU, savePlotToLatestMessage_ACU } from './plot-history-preset';

  function checkPlotAbortRequested_ACU() {
    if (abortController_ACU && abortController_ACU.signal.aborted) {
      throw new Error('TaskAbortedByUser');
    }
  }

  export function willPlotUseMainApiGenerateRaw_ACU() {
    try {
      const apiPresetConfig: any = getApiConfigByPreset_ACU(settings_ACU.plotApiPreset) || {};
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

    if (contextTurnCount > 0) {
      let aiCount = 0;
      const extracted: { role: string; content: string }[] = [];

      let i = (chat?.length || 0) - 1;
      if (i >= 0 && chat[i] && chat[i].is_user) {
        if (String(chat[i].mes || '') === String(userMessage || '')) {
          i -= 1;
        }
      }

      for (; i >= 0 && aiCount < contextTurnCount; i--) {
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

    let worldbookContent = await getWorldbookContentForPlot_ACU(plotSettings, userMessage, lastPlotContent);
    logDebug_ACU('[剧情推进] $1 世界书内容(原始):', worldbookContent ? `长度=${worldbookContent.length}` : '(空)');

    let outlineTableContent = '';
    try {
      if (!currentJsonTableData_ACU || typeof currentJsonTableData_ACU !== 'object') {
        try {
          const merged = await mergeAllIndependentTables_ACU();
          if (merged && typeof merged === 'object') {
            _set_currentJsonTableData_ACU(merged);
          }
        } catch (e) {}
      }
      if (currentJsonTableData_ACU && typeof currentJsonTableData_ACU === 'object') {
        const summaryIndexResult = formatSummaryIndexForPlot_ACU(currentJsonTableData_ACU);
        if (summaryIndexResult.success) {
          outlineTableContent = summaryIndexResult.content;
          logDebug_ACU('[剧情推进] $5 使用纪要表的概要和编码索引列');
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

    const performReplacements = (text: string) => {
      if (!text) return '';
      let processed = text;

      const worldbookReplacement = worldbookContent
        ? `\n<worldbook_context>\n${filterPlotInjectedContent(worldbookContent, '$1')}\n</worldbook_context>\n`
        : '';
      processed = processed.replace(/(?<!\\)\$1/g, worldbookReplacement);

      for (const key in replacements) {
        const value = replacements[key];
        const regex = new RegExp(escapeRegExp_ACU(key), 'g');
        const filteredValue = filterPlotInjectedContent(value, key);
        processed = processed.replace(regex, () => filteredValue);
      }
      return processed;
    };

    worldbookContent = await tryRenderPlotTemplateWithEjs_ACU(worldbookContent);
    logDebug_ACU('[剧情推进] $1 世界书内容(渲染后):', worldbookContent ? `长度=${worldbookContent.length}` : '(空)');
    worldbookContent = parseRandomTags_ACU(worldbookContent);
    worldbookContent = replaceRandomVariables_ACU(worldbookContent);

    const defaultDirective = '[SYSTEM_DIRECTIVE: You are a storyteller. The following <plot> block is your absolute script for this turn. You MUST follow the <directive> within it to generate the story.]';
    let finalSystemDirectiveContent = defaultDirective;
    let rawFinal = getPlotPromptContentByIdFromSettings_ACU(plotSettings, 'finalSystemDirective')
      || plotSettings.finalSystemDirective
      || '';
    rawFinal = await tryRenderPlotTemplateWithEjs_ACU(rawFinal);
    const plotFinalDirective = performReplacements(rawFinal);
    let finalWithRandom = parseRandomTags_ACU(plotFinalDirective);
    finalWithRandom = replaceRandomVariables_ACU(finalWithRandom);
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
      allTablesJson: currentJsonTableData_ACU,
    };
  }

  async function renderPlotTaskMessages_ACU(task: Record<string, any>, sharedContext: Record<string, any>, runtimeOptions: any = {}) {
    const promptGroup = JSON.parse(JSON.stringify(task?.promptGroup || []));
    const messagesToUse = Array.isArray(promptGroup) ? promptGroup : [];

    for (const seg of messagesToUse) {
      if (!seg || typeof seg.content !== 'string') continue;
      let c = seg.content;
      c = await tryRenderPlotTemplateWithEjs_ACU(c);
      c = sharedContext.performReplacements(c);
      const relayTagMap = runtimeOptions.useHistoryRelay
        ? buildPlotTagMapFromText_ACU(sharedContext.lastPlotContent, getPlotPlaceholderTagNames_ACU(c))
        : (runtimeOptions.relayTagMap instanceof Map ? runtimeOptions.relayTagMap : new Map());
      c = replacePlotTagPlaceholders_ACU(c, relayTagMap);
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

    try {
      checkPlotAbortRequested_ACU();
      const messages = await renderPlotTaskMessages_ACU(normalizedTask, sharedContext, runtimeOptions);
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

        if (runtimeOptions.willUseMainApiGenerateRaw) {
          planningGuard_ACU.ignoreNextGenerationEndedCount++;
        }

        let tempMessage = null;
        let apiError = null;
        try {
          tempMessage = await callApi_ACU(messages, settings_ACU, abortController_ACU?.signal || null);
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
          await new Promise(resolve => setTimeout(resolve, 5000));
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

      const { tagNames, extractedTags, injectedFragments } = extractPlotTagsFromResponse_ACU(rawResponse, normalizedTask.extractTags);
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

    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });

    const enabledTasks = getEnabledPlotTasks_ACU(plotSettings);
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

    const stageGroups = groupPlotTasksByStage_ACU(enabledTasks);

    const sharedContext = await buildPlotSharedContext_ACU(plotSettings, userMessage, {
      inputForHash,
      hasExistingUserMessage,
    });
    checkPlotAbortRequested_ACU();

    const willUseMainApiGenerateRaw = willPlotUseMainApiGenerateRaw_ACU();
    const successfulResults: any[] = [];
    const failedResults: any[] = [];
    let aggregatedTags = new Map();

    for (let stageIndex = 0; stageIndex < stageGroups.length; stageIndex++) {
      const stageGroup = stageGroups[stageIndex];

      const stageResults = await Promise.all(
        stageGroup.tasks.map((task: any) =>
          executeSinglePlotTask_ACU(task, sharedContext, {
            willUseMainApiGenerateRaw,
            relayTagMap: aggregatedTags,
            useHistoryRelay: stageIndex === 0,
          }),
        ),
      );
      checkPlotAbortRequested_ACU();

      const stageSuccessfulResults = stageResults.filter((result: any) => result?.success);
      const stageFailedResults = stageResults.filter((result: any) => result && !result.success);
      successfulResults.push(...stageSuccessfulResults);
      failedResults.push(...stageFailedResults);

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

      aggregatedTags = aggregatePlotTaskTags_ACU(successfulResults);
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
    });
    logDebug_ACU('[剧情推进] [Plot] 已暂存plot数据，用户输入哈希:', userInputHash, '，原始文本长度:', inputForHash?.length || 0);

    const finalMessage = buildFinalPlotInjectionMessage_ACU(
      sharedContext.finalSystemDirectiveContent,
      successfulResults,
      aggregatedTags,
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
  export async function getWorldbookContentForPlot_ACU(apiSettings: Record<string, any>, userMessage: string, extraBaseText: string = '') {
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

      const historyLimit = Number.isFinite(apiSettings.contextTurnCount)
        ? Math.max(1, apiSettings.contextTurnCount)
        : 3;
      const chatArray = getChatArray_ACU();
      const recentMessages = historyLimit > 0 ? chatArray.slice(-historyLimit) : chatArray;
      const historyAndUserText = `${recentMessages.map((message: any) => message.mes || '').join('\n')}\n${userMessage || ''}`;
      const enabledMap = plotCfg?.enabledEntries;
      const hasAnySelection = enabledMap && typeof enabledMap === 'object' && Object.keys(enabledMap).length > 0;

      return await buildCombinedWorldbookContentByStrategy_ACU({
        logPrefix: '[剧情推进]',
        bookNames,
        baseScanText: [historyAndUserText, extraBaseText || ''].filter(Boolean).join('\n'),
        includeConstantEntriesInBaseScan: true,
        includeEntry: (entry: any) => {
          const normalizedComment = entry.normalizedComment || '';
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
          if (!hasAnySelection) return true;
          if (isDbGenerated) return true;
          const list = enabledMap?.[entry.bookName];
          if (typeof list === 'undefined') return true;
          if (!Array.isArray(list)) return true;
          return list.includes(entry.uid);
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
