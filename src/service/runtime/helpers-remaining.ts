import { DEFAULT_PLOT_SETTINGS_ACU } from '../../data/models/defaults-json.js';
import { deriveTemplatePresetNameForImport_ACU } from '../../data/repositories/template-preset-repo';
import { currentPlotTaskEditorId_ACU , _set_currentPlotTaskEditorId_ACU} from './state-manager';
import { ACU_TOAST_CATEGORY_ACU, showToastr_ACU } from '../../presentation/theme/toast';
import { callApi_ACU, getApiConfigByPreset_ACU } from '../ai/api-call';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, toastr_API_ACU, TABLE_ORDER_FIELD_ACU, abortController_ACU, currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, independentTableStates_ACU, isProcessing_Plot_ACU, loopState_ACU, planningGuard_ACU, settings_ACU, suppressWorldbookInjectionInGreeting_ACU, tempPlotToSave_ACU , _set_isProcessing_Plot_ACU, _set_abortController_ACU, _set_tempPlotToSave_ACU, _set_suppressWorldbookInjectionInGreeting_ACU, _set_currentJsonTableData_ACU} from './state-manager';
import { applyTemplateScopeForCurrentChat_ACU, saveSettings_ACU } from '../settings/settings-service';
import { buildChatPlotScopeStateFromSettings_ACU, buildChatSheetGuideDataFromTemplateObj_ACU, getChatSheetGuideDataForIsolationKey_ACU, getCurrentChatPlotScopeState_ACU, getSortedSheetKeys_ACU, materializeDataFromSheetGuide_ACU, reorderDataBySheetKeys_ACU, sanitizeTemplateSnapshotForChat_ACU, setChatSheetGuideDataForIsolationKey_ACU, setCurrentChatPlotScopeState_ACU } from '../template/chat-scope';
import { buildCombinedWorldbookContentByStrategy_ACU, deleteAllGeneratedEntries_ACU } from '../worldbook/pipeline';
import { topLevelWindow_ACU } from '../../shared/env';
import { ensureSheetOrderNumbers_ACU, escapeRegExp_ACU, getTemplateSheetKeys_ACU, hashUserInput_ACU, isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU, normalizeNonNegativeInteger_ACU, normalizePositiveInteger_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { applyPlotPresetToSettings_ACU, clearPlotPresetBindingForChat_ACU, ensureLoopPromptsArray_ACU, ensurePlotPresetBindingsStore_ACU, ensurePlotTasksCompat_ACU, findPlotPresetByName_ACU, getCurrentRuntimePlotPresetName_ACU, getPlotGlobalRevision_ACU, getPlotPresetBindingForChat_ACU, getPlotPromptContentByIdFromSettings_ACU, isDefaultPlotPresetSelection_ACU, normalizePlotPresetSelectionValue_ACU, normalizePlotTask_ACU, normalizePlotTasks_ACU, replaceCurrentPlotSettingsWithSnapshot_ACU, resetPlotSettingsToDefault_ACU, syncCurrentEditablePlotPresetState_ACU } from '../plot/plot-logic';
import { clickSendButton_ACU, setSendTextareaValue_ACU } from '../../presentation/components/status-display';
import { upsertTemplatePreset_ACU } from '../template/template-preset-service';
import { isEntryBlocked_ACU } from '../../shared/utils';
import { updateLoopTimerDisplay_ACU, updateLoopUIStatus_ACU } from '../../presentation/triggers/settings-ui-sync';
import { getIsolationPrefix_ACU } from '../worldbook/injection-engine';
/**
 * service/runtime/helpers-remaining.ts — 04_shared_helpers 剩余函数
 * 从 src/core/04_shared_helpers.js:38~5968 迁移而来。
 * 包含: 标签提取、表格锁定、合并、格式化、剧情推进、API配置、自动更新等
 * 后续需按功能域拆分到 service/template、service/ai、presentation/ 等
 */
  function extractContextTags_ACU(text, tagNames, excludeUserMessages = false) {
      if (!text || !tagNames || tagNames.length === 0) {
          return text;
      }
      
      let result = text;

      // 如果排除用户消息，则需要按行处理
      if (excludeUserMessages) {
          const lines = result.split('\n');
          const processedLines = lines.map(line => {
              // 检查是否是用户消息行（通常以特定格式标识）
              if (line.includes('[User]') || line.includes('User:') || line.includes('用户:')) {
                  return line; // 用户消息不处理
              }
              // 对非用户消息行进行标签提取
              return extractTagsFromLine(line, tagNames);
          });
          result = processedLines.join('\n');
      } else {
          result = extractTagsFromLine(result, tagNames);
      }

      return result;
  }

  // 辅助函数：从单行文本中提取标签内容
  function extractTagsFromLine(text, tagNames) {
      if (!text || !tagNames || tagNames.length === 0) {
          return text;
      }
      
      let result = text;
      const extractedParts = [];

      tagNames.forEach(tagName => {
          const content = extractLastTagContent(text, tagName);
          if (content !== null) {
              extractedParts.push(`<${tagName}>${content}</${tagName}>`);
          }
      });

      if (extractedParts.length > 0) {
          result = extractedParts.join('\n\n');
      }

      return result;
  }

  // 辅助函数：提取文本中最后一个指定标签的内容
  function extractLastTagContent(text, tagName) {
      if (!text || !tagName) return null;
      const lower = text.toLowerCase();
      const open = `<${tagName.toLowerCase()}>`;
      const close = `</${tagName.toLowerCase()}>`;

      const closeIdx = lower.lastIndexOf(close);
      if (closeIdx === -1) return null;

      const openIdx = lower.lastIndexOf(open, closeIdx);
      if (openIdx === -1) return null;

      const contentStart = openIdx + open.length;
      const content = text.slice(contentStart, closeIdx);
      return content;
  }

  // [新增] 标签列表解析：支持英文逗号/中文逗号/空格分隔
  function parseTagList_ACU(input) {
      if (!input || typeof input !== 'string') return [];
      return input
          .split(/[,，\s]+/g)
          .map(t => t.trim())
          .filter(Boolean)
          .map(t => t.replace(/[<>]/g, '')); // 防止用户输入 <tag>
  }

  // [新增] 兼容旧"标签提取/排除"字符串：tagA,tagB -> [{start:"<tagA", end:"</tagA>"}, ...]
  export function buildBoundaryRulesFromLegacyTags_ACU(tagsText = '') {
      const tags = parseTagList_ACU(tagsText);
      return tags.map(tag => ({ start: `<${tag}`, end: `</${tag}>` }));
  }

  // [新增] 标准化标签排除规则：支持数组对象/字符串行/旧标签字符串兜底

  // [新增] 标准化正文标签提取规则，结构与排除规则一致

  export function getDefaultPlotContextExtractRules_ACU() {
      return normalizeExtractRules_ACU(
          DEFAULT_PLOT_SETTINGS_ACU.contextExtractRules,
          DEFAULT_PLOT_SETTINGS_ACU.contextExtractTags || '',
      );
  }

  export function getDefaultPlotContextExcludeRules_ACU() {
      return normalizeExcludeRules_ACU(
          DEFAULT_PLOT_SETTINGS_ACU.contextExcludeRules,
          DEFAULT_PLOT_SETTINGS_ACU.contextExcludeTags || '',
      );
  }

  // [新增] 按"开始词 + 结束词"删除最后一个命中区间
  function removeLastMatchedBoundary_ACU(text, startBoundary, endBoundary) {
      const source = String(text ?? '');
      const start = String(startBoundary || '');
      const end = String(endBoundary || '');
      if (!source || !start || !end) return source;

      const lowerSource = source.toLowerCase();
      const lowerStart = start.toLowerCase();
      const lowerEnd = end.toLowerCase();

      const endIdx = lowerSource.lastIndexOf(lowerEnd);
      if (endIdx === -1) return source;

      const startIdx = lowerSource.lastIndexOf(lowerStart, Math.max(0, endIdx - 1));
      if (startIdx === -1) return source;

      const removeTo = endIdx + end.length;
      if (removeTo <= startIdx) return source;

      return source.slice(0, startIdx) + source.slice(removeTo);
  }

  // [新增] 对文本应用排除规则：每组规则仅移除"最后一个"命中区间
  export function applyExcludeRulesToText_ACU(text, { excludeRules = [], excludeTags = '' } = {}) {
      let result = String(text ?? '');
      const rules = normalizeExcludeRules_ACU(excludeRules, excludeTags);
      if (!result || rules.length === 0) return result;

      rules.forEach(rule => {
          result = removeLastMatchedBoundary_ACU(result, rule.start, rule.end);
      });

      return result.replace(/\n{3,}/g, '\n\n').trim();
  }

  // [新增] 提取"开始词 + 结束词"最后一组命中区间（保留区间文本）
  function extractLastMatchedBoundary_ACU(text, startBoundary, endBoundary) {
      const source = String(text ?? '');
      const start = String(startBoundary || '');
      const end = String(endBoundary || '');
      if (!source || !start || !end) return null;

      const lowerSource = source.toLowerCase();
      const lowerStart = start.toLowerCase();
      const lowerEnd = end.toLowerCase();

      const endIdx = lowerSource.lastIndexOf(lowerEnd);
      if (endIdx === -1) return null;
      const startIdx = lowerSource.lastIndexOf(lowerStart, Math.max(0, endIdx - 1));
      if (startIdx === -1) return null;

      const rangeEnd = endIdx + end.length;
      if (rangeEnd <= startIdx) return null;
      return source.slice(startIdx, rangeEnd);
  }

  // [新增] 对文本应用提取规则：每组规则提取最后一组命中并拼接返回；若无命中则保留原文本
  function applyExtractRulesToText_ACU(text, { extractRules = [], extractTags = '' } = {}) {
      const source = String(text ?? '');
      const rules = normalizeExtractRules_ACU(extractRules, extractTags);
      if (!source || rules.length === 0) return source;

      const parts = [];
      rules.forEach(rule => {
          const matched = extractLastMatchedBoundary_ACU(source, rule.start, rule.end);
          if (matched !== null) parts.push(matched);
      });
      if (parts.length === 0) return source;
      return parts.join('\n\n');
  }

  // [新增] 上下文筛选：标签提取 + 标签排除（可单独生效，也可叠加）
  export function applyContextTagFilters_ACU(text, { extractTags = '', extractRules = [], excludeTags = '', excludeRules = [] } = {}) {
      let result = String(text ?? '');
      result = applyExtractRulesToText_ACU(result, { extractRules, extractTags });
      result = applyExcludeRulesToText_ACU(result, { excludeRules, excludeTags });
      return result;
  }

  // [新增] 辅助函数：判断表格是否是总结表、总体大纲表或纪要表（这些表拥有索引编码锁定功能）

  // =========================
  // [新增] 表格更新锁定与总结索引锁定（按聊天+隔离标签存储）
  // =========================
  function getTableLockScopeKey_ACU() {
      const chatKey = (currentChatFileIdentifier_ACU || 'default').trim() || 'default';
      const isolationKey = getCurrentIsolationKey_ACU() || '';
      return `${chatKey}::${isolationKey}`;
  }

  function ensureTableLockStore_ACU() {
      if (!settings_ACU.tableUpdateLocks || typeof settings_ACU.tableUpdateLocks !== 'object') {
          settings_ACU.tableUpdateLocks = {};
      }
      if (!settings_ACU.specialIndexLocks || typeof settings_ACU.specialIndexLocks !== 'object') {
          settings_ACU.specialIndexLocks = {};
      }
  }

  export function getTableLocksForSheet_ACU(sheetKey) {
      const scopeKey = getTableLockScopeKey_ACU();
      const bucket = settings_ACU?.tableUpdateLocks?.[scopeKey]?.[sheetKey] || {};
      return {
          rows: new Set(Array.isArray(bucket.rows) ? bucket.rows : []),
          cols: new Set(Array.isArray(bucket.cols) ? bucket.cols : []),
          cells: new Set(Array.isArray(bucket.cells) ? bucket.cells : []),
      };
  }

  export function saveTableLocksForSheet_ACU(sheetKey, lockState) {
      if (!sheetKey) return;
      ensureTableLockStore_ACU();
      const scopeKey = getTableLockScopeKey_ACU();
      if (!settings_ACU.tableUpdateLocks[scopeKey]) settings_ACU.tableUpdateLocks[scopeKey] = {};
      settings_ACU.tableUpdateLocks[scopeKey][sheetKey] = {
          rows: Array.from(lockState.rows || []),
          cols: Array.from(lockState.cols || []),
          cells: Array.from(lockState.cells || []),
      };
      saveSettings_ACU();
  }

  export function toggleRowLock_ACU(sheetKey, rowIndex) {
      const lockState = getTableLocksForSheet_ACU(sheetKey);
      if (lockState.rows.has(rowIndex)) lockState.rows.delete(rowIndex);
      else lockState.rows.add(rowIndex);
      saveTableLocksForSheet_ACU(sheetKey, lockState);
  }

  export function toggleColLock_ACU(sheetKey, colIndex) {
      const lockState = getTableLocksForSheet_ACU(sheetKey);
      if (lockState.cols.has(colIndex)) lockState.cols.delete(colIndex);
      else lockState.cols.add(colIndex);
      saveTableLocksForSheet_ACU(sheetKey, lockState);
  }

  export function toggleCellLock_ACU(sheetKey, rowIndex, colIndex) {
      const lockState = getTableLocksForSheet_ACU(sheetKey);
      const key = `${rowIndex}:${colIndex}`;
      if (lockState.cells.has(key)) lockState.cells.delete(key);
      else lockState.cells.add(key);
      saveTableLocksForSheet_ACU(sheetKey, lockState);
  }

  export function isSpecialIndexLockEnabled_ACU(sheetKey) {
      const scopeKey = getTableLockScopeKey_ACU();
      const bucket = settings_ACU?.specialIndexLocks?.[scopeKey] || {};
      if (typeof bucket[sheetKey] === 'boolean') return bucket[sheetKey];
      return true; // 默认锁定
  }

  export function setSpecialIndexLockEnabled_ACU(sheetKey, enabled) {
      if (!sheetKey) return;
      ensureTableLockStore_ACU();
      const scopeKey = getTableLockScopeKey_ACU();
      if (!settings_ACU.specialIndexLocks[scopeKey]) settings_ACU.specialIndexLocks[scopeKey] = {};
      settings_ACU.specialIndexLocks[scopeKey][sheetKey] = !!enabled;
      saveSettings_ACU();
  }

  export function getSummaryIndexColumnIndex_ACU(table) {
      try {
          if (!table || !Array.isArray(table.content) || !Array.isArray(table.content[0])) return -1;
          const headers = table.content[0].slice(1);
          if (!headers.length) return -1;
          let idx = headers.findIndex(h => {
              if (typeof h !== 'string') return false;
              return /编码|索引/.test(h);
          });
          if (idx === -1) idx = headers.length - 1;
          return idx;
      } catch (e) {
          return -1;
      }
  }

  export function formatSummaryIndexCode_ACU(num) {
      const n = Math.max(1, parseInt(num, 10) || 1);
      return `AM${String(n).padStart(4, '0')}`;
  }

  export function applySummaryIndexSequenceToTable_ACU(table, colIndex) {
      if (!table || !Array.isArray(table.content) || colIndex < 0) return;
      for (let i = 1; i < table.content.length; i++) {
          const row = table.content[i];
          if (!Array.isArray(row)) continue;
          row[colIndex + 1] = formatSummaryIndexCode_ACU(i);
      }
  }

  export function applySpecialIndexSequenceToSummaryTables_ACU(dataObj) {
      if (!dataObj || typeof dataObj !== 'object') return;
      Object.keys(dataObj).forEach(sheetKey => {
          if (!sheetKey.startsWith('sheet_')) return;
          const table = dataObj[sheetKey];
          if (!table || !isSummaryOrOutlineTable_ACU(table.name)) return;
          if (!isSpecialIndexLockEnabled_ACU(sheetKey)) return;
          const colIndex = getSummaryIndexColumnIndex_ACU(table);
          if (colIndex < 0) return;
          applySummaryIndexSequenceToTable_ACU(table, colIndex);
      });
  }

  // [重构] 辅助函数：全表数据合并 (从独立存储中恢复完整状态)
  // [数据隔离核心] 严格按照当前隔离标签读取数据，无标签也是标签的一种
  export async function mergeAllIndependentTables_ACU() {
      const chat = SillyTavern_API_ACU.chat;
      if (!chat || chat.length === 0) {
          logDebug_ACU('Cannot merge data: Chat history is empty.');
          return null;
      }

      // [数据隔离核心] 获取当前隔离标签键名
      const currentIsolationKey = getCurrentIsolationKey_ACU();
      logDebug_ACU(`[Merge] Loading data for isolation key: [${currentIsolationKey || '无标签'}]`);

      // [新增] 聊天级"空白指导表"：一旦存在，本聊天合并/显示顺序都按指导表，不再按模板
      // 注意：该指导表按隔离标签分槽，因此切换标识时可拥有不同的"参数/表头/顺序总指导"
      const sheetGuideData = getChatSheetGuideDataForIsolationKey_ACU(currentIsolationKey);
      const hasSheetGuide = !!(sheetGuideData && typeof sheetGuideData === 'object' && Object.keys(sheetGuideData).some(k => k.startsWith('sheet_')));

      // [新增] 获取当前模板/指导表的表格键列表，用于过滤非当前模板的数据
      // 优先使用指导表（如果存在），否则使用当前模板
      // 这样可以确保：切换/导入新模板后，只读取当前模板中存在的表格数据
      const templateSheetKeys = (() => {
          if (hasSheetGuide) {
              // 存在指导表：使用指导表的表格键（指导表已在导入/切换模板时更新）
              return Object.keys(sheetGuideData).filter(k => k.startsWith('sheet_'));
          }
          // 不存在指导表：使用当前模板的表格键
          return getTemplateSheetKeys_ACU();
      })();
      const templateSheetKeySet = new Set(templateSheetKeys);
      logDebug_ACU(`[Merge] Template/Guide filter: ${templateSheetKeys.length} tables allowed (${hasSheetGuide ? 'guide' : 'template'})`);

      // 1. [优化] 不使用模板作为基础，动态收集聊天记录中的所有实际数据
      let mergedData = {};
      const foundSheets = {};

      for (let i = chat.length - 1; i >= 0; i--) {
          const message = chat[i];
          if (message.is_user) continue;

          // [优先级1] 检查新版按标签分组存储 TavernDB_ACU_IsolatedData
          if (message.TavernDB_ACU_IsolatedData && message.TavernDB_ACU_IsolatedData[currentIsolationKey]) {
              const tagData = message.TavernDB_ACU_IsolatedData[currentIsolationKey];
              const independentData = tagData.independentData || {};
              const modifiedKeys = tagData.modifiedKeys || [];
              const updateGroupKeys = tagData.updateGroupKeys || [];

              Object.keys(independentData).forEach(storedSheetKey => {
                  // [新增] 只处理当前模板/指导表中存在的表格
                  if (!templateSheetKeySet.has(storedSheetKey)) {
                      logDebug_ACU(`[Merge] Skipping sheet [${storedSheetKey}] - not in current template/guide`);
                      return;
                  }
                  if (!foundSheets[storedSheetKey]) {
                      mergedData[storedSheetKey] = JSON.parse(JSON.stringify(independentData[storedSheetKey]));
                      foundSheets[storedSheetKey] = true;

                      // 更新表格状态
                      let wasUpdated = false;
                      if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
                          wasUpdated = updateGroupKeys.includes(storedSheetKey);
                      } else if (modifiedKeys.length > 0) {
                          wasUpdated = modifiedKeys.includes(storedSheetKey);
                      } else {
                          wasUpdated = true;
                      }

                      if (wasUpdated) {
                          if (!independentTableStates_ACU[storedSheetKey]) {
                              independentTableStates_ACU[storedSheetKey] = {};
                          }
                          const currentAiFloor = chat.slice(0, i + 1).filter(m => !m.is_user).length;
                          independentTableStates_ACU[storedSheetKey].lastUpdatedAiFloor = currentAiFloor;
                      }
                  }
              });
          }

          // [优先级2] 兼容旧版存储格式 - 严格匹配隔离标签
          // [数据隔离核心逻辑] 无标签也是标签的一种，严格隔离不同标签的数据
          const msgIdentity = message.TavernDB_ACU_Identity;
          let isLegacyMatch = false;
          if (settings_ACU.dataIsolationEnabled) {
              // 开启隔离：严格匹配标识代码
              isLegacyMatch = (msgIdentity === settings_ACU.dataIsolationCode);
          } else {
              // 关闭隔离（无标签模式）：只匹配无标识数据
              isLegacyMatch = !msgIdentity;
          }

          if (isLegacyMatch) {
              // 检查旧版独立数据格式
              if (message.TavernDB_ACU_IndependentData) {
                  const independentData = message.TavernDB_ACU_IndependentData;
                  const modifiedKeys = message.TavernDB_ACU_ModifiedKeys || [];
                  const updateGroupKeys = message.TavernDB_ACU_UpdateGroupKeys || [];

                  Object.keys(independentData).forEach(storedSheetKey => {
                      // [新增] 只处理当前模板/指导表中存在的表格
                      if (!templateSheetKeySet.has(storedSheetKey)) {
                          logDebug_ACU(`[Merge] Skipping sheet [${storedSheetKey}] (legacy) - not in current template/guide`);
                          return;
                      }
                      if (!foundSheets[storedSheetKey]) {
                          mergedData[storedSheetKey] = JSON.parse(JSON.stringify(independentData[storedSheetKey]));
                          foundSheets[storedSheetKey] = true;

                          let wasUpdated = false;
                          if (updateGroupKeys.length > 0 && modifiedKeys.length > 0) {
                              wasUpdated = updateGroupKeys.includes(storedSheetKey);
                          } else if (modifiedKeys.length > 0) {
                              wasUpdated = modifiedKeys.includes(storedSheetKey);
                          } else {
                              wasUpdated = true;
                          }

                          if (wasUpdated) {
                              if (!independentTableStates_ACU[storedSheetKey]) independentTableStates_ACU[storedSheetKey] = {};
                              const currentAiFloor = chat.slice(0, i + 1).filter(m => !m.is_user).length;
                              independentTableStates_ACU[storedSheetKey].lastUpdatedAiFloor = currentAiFloor;
                          }
                      }
                  });
              }

              // 检查旧版标准表/总结表格式
              if (message.TavernDB_ACU_Data) {
                  const standardData = message.TavernDB_ACU_Data;
                  Object.keys(standardData).forEach(k => {
                      // [新增] 只处理当前模板/指导表中存在的表格
                      if (!templateSheetKeySet.has(k)) {
                          return;
                      }
                      if (k.startsWith('sheet_') && !foundSheets[k] && standardData[k].name && !isSummaryOrOutlineTable_ACU(standardData[k].name)) {
                          mergedData[k] = JSON.parse(JSON.stringify(standardData[k]));
                          foundSheets[k] = true;
                          if (!independentTableStates_ACU[k]) independentTableStates_ACU[k] = {};
                          const currentAiFloor = chat.slice(0, i + 1).filter(m => !m.is_user).length;
                          independentTableStates_ACU[k].lastUpdatedAiFloor = currentAiFloor;
                      }
                  });
              }
              if (message.TavernDB_ACU_SummaryData) {
                  const summaryData = message.TavernDB_ACU_SummaryData;
                  Object.keys(summaryData).forEach(k => {
                      // [新增] 只处理当前模板/指导表中存在的表格
                      if (!templateSheetKeySet.has(k)) {
                          return;
                      }
                      if (k.startsWith('sheet_') && !foundSheets[k] && summaryData[k].name && isSummaryOrOutlineTable_ACU(summaryData[k].name)) {
                          mergedData[k] = JSON.parse(JSON.stringify(summaryData[k]));
                          foundSheets[k] = true;
                          if (!independentTableStates_ACU[k]) independentTableStates_ACU[k] = {};
                          const currentAiFloor = chat.slice(0, i + 1).filter(m => !m.is_user).length;
                          independentTableStates_ACU[k].lastUpdatedAiFloor = currentAiFloor;
                      }
                  });
              }
          }
      }

      const foundCount = Object.keys(foundSheets).length;
      logDebug_ACU(`[Merge] Found ${foundCount} tables for tag [${currentIsolationKey || '无标签'}] from chat history.`);

      // 如果没有任何数据：
      // - 若存在"空白指导表"：优先返回"指导表物化结构"（表头+参数；seedRows 仅保留字段，不默认展开到 content）
      // - 否则返回 null，让调用方按旧逻辑处理（例如用完整模板结构作为占位符）
      if (foundCount <= 0) {
          if (hasSheetGuide) {
              // 直接物化：仅表头（seedRows 保留在字段中，但不作为"当前对话真实数据行"展示）
              const base = materializeDataFromSheetGuide_ACU(sheetGuideData, { includeSeedRows: false });
              const orderedKeys = getSortedSheetKeys_ACU(base);
              return reorderDataBySheetKeys_ACU(base, orderedKeys);
          }
          return null;
      }

      // [兼容迁移] 旧版：updateConfig 的 0 表示"沿用UI"；新版：-1 表示"沿用UI"
      // 注意：聊天记录里保存的是"单表对象"，没有 mate 标记，因此用 updateConfig.uiSentinel 作为表级标记。
      Object.keys(mergedData).forEach(k => {
          if (!k.startsWith('sheet_')) return;
          const sheet = mergedData[k];
          const uc = (sheet && typeof sheet === 'object') ? sheet.updateConfig : null;
          if (!uc || typeof uc !== 'object') return;
          if (uc.uiSentinel === -1) return; // 已是新语义
          for (const field of ['contextDepth', 'updateFrequency', 'batchSize', 'skipFloors']) {
              if (Object.prototype.hasOwnProperty.call(uc, field) && uc[field] === 0) {
                  uc[field] = -1;
              }
          }
          uc.uiSentinel = -1;
      });

      // [新增] 若存在"空白指导表"，则：
      // 1) 过滤掉不在指导表里的表（UI/填表只以指导表为准，避免旧表复活）
      // 2) 对指导表中缺失的表：使用指导表结构作为初始值（seedRows 仅保留字段，不默认展开到 content）
      // 3) 对于存在历史数据的表：以历史数据为主，但表名/表头/参数/顺序以指导表为准；不把 seedRows 合并进真实数据行
      if (hasSheetGuide) {
          const guided = materializeDataFromSheetGuide_ACU(sheetGuideData, { includeSeedRows: false });
          const guideKeys = getSortedSheetKeys_ACU(guided, { ignoreChatGuide: true, includeMissingFromGuide: true });
          guideKeys.forEach(k => {
              if (!k || !k.startsWith('sheet_')) return;
              const guideSheet = guided[k];
              const hist = mergedData[k];
              if (hist && typeof hist === 'object') {
                  const next = JSON.parse(JSON.stringify(hist));
                  next.uid = k;
                  // 需求4（视觉编辑器改名/改表头/改参数）：合并展示以指导表为准（不影响历史真实数据行，仅覆盖"元信息/表头/参数/顺序"）
                  if (guideSheet?.name) next.name = guideSheet.name;
                  if (guideSheet?.sourceData) next.sourceData = JSON.parse(JSON.stringify(guideSheet.sourceData));
                  if (guideSheet?.updateConfig) next.updateConfig = JSON.parse(JSON.stringify(guideSheet.updateConfig));
                  if (guideSheet?.exportConfig) next.exportConfig = JSON.parse(JSON.stringify(guideSheet.exportConfig));
                  // 表头：以指导表为准，并对行做简单对齐（pad/truncate）
                  const guideHeader = (guideSheet && Array.isArray(guideSheet.content) && Array.isArray(guideSheet.content[0]))
                      ? JSON.parse(JSON.stringify(guideSheet.content[0]))
                      : null;
                  if (!Array.isArray(next.content)) next.content = guideHeader ? [guideHeader] : [[null]];
                  if (guideHeader) {
                      next.content[0] = guideHeader;
                      const targetLen = guideHeader.length;
                      for (let r = 1; r < next.content.length; r++) {
                          const row = next.content[r];
                          if (!Array.isArray(row)) continue;
                          // [修复] 在对齐行长度之前，保留 auto_merged 标签
                          const hasAutoMergedTag = row.length > 0 && row[row.length - 1] === 'auto_merged';
                          if (row.length < targetLen) {
                              while (row.length < targetLen) row.push('');
                              // 如果原本有 auto_merged 标签，在填充后重新添加
                              if (hasAutoMergedTag && row[row.length - 1] !== 'auto_merged') {
                                  row.push('auto_merged');
                              }
                          } else if (row.length > targetLen) {
                              // [修复] 截断时保留 auto_merged 标签
                              row.splice(targetLen);
                              if (hasAutoMergedTag) {
                                  row.push('auto_merged');
                              }
                          }
                      }
                  }
                  // 顺序编号以指导表为准
                  if (Number.isFinite(guideSheet?.[TABLE_ORDER_FIELD_ACU])) next[TABLE_ORDER_FIELD_ACU] = Math.trunc(guideSheet[TABLE_ORDER_FIELD_ACU]);
                  // 保留 seedRows 字段（不参与实际 content 合并）
                  if (Array.isArray(guideSheet?.seedRows)) next.seedRows = JSON.parse(JSON.stringify(guideSheet.seedRows));
                  guided[k] = next;
              } else {
                  // 无历史数据：直接使用指导表物化结果（不展开 seedRows）
                  if (Number.isFinite(guideSheet?.[TABLE_ORDER_FIELD_ACU])) guided[k][TABLE_ORDER_FIELD_ACU] = Math.trunc(guideSheet[TABLE_ORDER_FIELD_ACU]);
              }
          });
          mergedData = guided;
      }

      // [修复] 合并结果按"用户手动顺序/模板顺序"重排，避免合并过程导致的随机乱序
      const orderedKeys = getSortedSheetKeys_ACU(mergedData);
      mergedData = reorderDataBySheetKeys_ACU(mergedData, orderedKeys);
      return mergedData;
  }

  // [重构] 刷新合并数据并通知前端和更新世界书

  export function formatJsonToReadable_ACU(jsonData) {
    if (!jsonData) return { readableText: "数据库为空。", importantPersonsTable: null, summaryTable: null, outlineTable: null };

    let readableText = '';
    let importantPersonsTable = null;
    let summaryTable = null;
    let outlineTable = null;
    // No longer need globalDataTable here as it's part of the main text.

    const tableIndexes = getSortedSheetKeys_ACU(jsonData);
    
    tableIndexes.forEach((sheetKey, tableIndex) => {
        const table = jsonData[sheetKey];
        if (!table || !table.name || !table.content) return;

        // Extract special tables
        switch (table.name.trim()) {
            case '重要人物表':
                importantPersonsTable = table;
                return; // Skip from main output
            case '总结表':
                summaryTable = table;
                return; // Skip from main output
            case '总体大纲':
                outlineTable = table;
                return; // Skip from main output
        }

        // [新增] 检查是否启用了单独注入（Custom Export），如果启用了，则不包含在基础条目中
        // [新增] 检查是否允许注入世界书 (injectIntoWorldbook)，如果为 false，则不包含在基础条目中
        if (table.exportConfig) {
            if (table.exportConfig.enabled) return; // Skip from main output because it will be exported separately
            if (table.exportConfig.injectIntoWorldbook === false) return; // Skip if injection is disabled
        }
        
        // All other tables, including '全局数据表', are added to the readable text
        readableText += `# ${table.name}\n\n`;
        const headers = table.content[0] ? table.content[0].slice(1) : [];
        if (headers.length > 0) {
            readableText += `| ${headers.join(' | ')} |\n`;
            readableText += `|${headers.map(() => '---').join('|')}|\n`;
        }
        
        const rows = table.content.slice(1);
        if (rows.length > 0) {
            rows.forEach(row => {
                const rowData = row.slice(1);
                readableText += `| ${rowData.join(' | ')} |\n`;
            });
        }
        readableText += '\n';
    });
    
    return { readableText, importantPersonsTable, summaryTable, outlineTable };
  }

  // =========================
  // [新功能] 新建对话：将模板基础状态写入"楼层本地数据"（而非拼接到消息文本）
  // 目标：像填表一样，开场白楼层就拥有一份"当前模板"的数据库基底（模板有数据就带数据，没有就为空表）
  // 注意：此动作不触发世界书注入链路，只做本地数据写入 + 前端显示刷新
  // =========================
  const GREETING_LOCAL_BASE_STATE_MARKER_ACU = 'ACU_TEMPLATE_BASE_STATE_LOCAL_V1';

  function isNewChatGreetingStage_ACU(chat) {
      if (!Array.isArray(chat) || chat.length === 0) return false;
      const hasAnyUserMessage = chat.some(m => m && m.is_user);
      if (hasAnyUserMessage) return false;
      const firstAiIndex = chat.findIndex(m => m && !m.is_user);
      return firstAiIndex !== -1;
  }

  // [健全性] 你要求的监视点：任何"仅单一AI楼层、没有任何User回复"的聊天记录，都不进行世界书注入
  function isSingleAiNoUserChat_ACU(chat) {
      if (!Array.isArray(chat) || chat.length === 0) return false;
      const userCount = chat.filter(m => m && m.is_user).length;
      const aiCount = chat.filter(m => m && !m.is_user).length;
      return userCount === 0 && aiCount === 1;
  }

  export function shouldSuppressWorldbookInjection_ACU() {
      // 用户要求：取消"首楼填表后不注入书"的限制。
      // 是否创建条目，改由各条目更新逻辑自身基于"真实有效数据"判定，避免一刀切拦截整个链路。
      return false;
  }

  export function maybeLiftWorldbookSuppression_ACU() {
      if (!suppressWorldbookInjectionInGreeting_ACU) return;
      const chat = SillyTavern_API_ACU?.chat;
      if (!Array.isArray(chat)) return;
      const hasAnyUserMessage = chat.some(m => m && m.is_user);
      if (hasAnyUserMessage) {
          _set_suppressWorldbookInjectionInGreeting_ACU(false);
          logDebug_ACU('[Worldbook] Greeting-stage suppression lifted (user message detected).');
      }
  }

  function buildTemplateBaseStateDataForLocalStorage_ACU(templateObj) {
      if (!templateObj || typeof templateObj !== 'object') return null;
      const out = { mate: { type: 'chatSheets', version: 1 } };
      const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
      if (sheetKeys.length === 0) return null;
      sheetKeys.forEach(k => {
          out[k] = JSON.parse(JSON.stringify(templateObj[k]));
      });
      return out;
  }

  async function seedGreetingLocalDataFromTemplate_ACU() {
      try {
          const chat = SillyTavern_API_ACU?.chat;
          if (!isNewChatGreetingStage_ACU(chat)) return false;

          const firstAiIndex = chat.findIndex(m => m && !m.is_user);
          const greetingMsg = chat[firstAiIndex];
          if (!greetingMsg) return false;

          // 幂等：避免重复写入
          if (greetingMsg._acu_local_template_base_state_seeded === GREETING_LOCAL_BASE_STATE_MARKER_ACU) return false;

          const templateObj = parseTableTemplateJson_ACU({ stripSeedRows: false }); // 模板有数据就带数据
          if (!templateObj) return false;

          // 确保模板编号稳定（不改变内容，只补齐 orderNo）
          const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
          ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: sheetKeys, forceRebuild: false });

          const baseData = buildTemplateBaseStateDataForLocalStorage_ACU(templateObj);
          if (!baseData) return false;

          const isolationKey = getCurrentIsolationKey_ACU();
          if (!greetingMsg.TavernDB_ACU_IsolatedData) greetingMsg.TavernDB_ACU_IsolatedData = {};
          if (!greetingMsg.TavernDB_ACU_IsolatedData[isolationKey]) {
              greetingMsg.TavernDB_ACU_IsolatedData[isolationKey] = {
                  independentData: {},
                  modifiedKeys: [],
                  updateGroupKeys: []
              };
          }
          const tagData = greetingMsg.TavernDB_ACU_IsolatedData[isolationKey];

          // 写入 independentData（只写 sheet_，不强制 modifiedKeys）
          const indep = {};
          Object.keys(baseData).forEach(k => {
              if (!k.startsWith('sheet_')) return;
              indep[k] = JSON.parse(JSON.stringify(baseData[k]));
          });
          tagData.independentData = indep;
          // 这是一份"基底"，不应被认为是AI更新结果，因此 modifiedKeys 留空
          tagData.modifiedKeys = [];
          tagData.updateGroupKeys = [];
          tagData._acu_base_state = GREETING_LOCAL_BASE_STATE_MARKER_ACU;

          // 同步旧格式（兼容老逻辑）
          greetingMsg.TavernDB_ACU_IndependentData = JSON.parse(JSON.stringify(indep));
          greetingMsg.TavernDB_ACU_ModifiedKeys = [];
          greetingMsg.TavernDB_ACU_UpdateGroupKeys = [];

          // 标记幂等
          greetingMsg._acu_local_template_base_state_seeded = GREETING_LOCAL_BASE_STATE_MARKER_ACU;

          // 不在这里做全局注入抑制；
          // 是否真正创建世界书条目，交给后续各条目逻辑按"是否存在真实有效数据"决定。
          _set_suppressWorldbookInjectionInGreeting_ACU(false);

          await SillyTavern_API_ACU.saveChat();

          // [关键] 新开对话时应清理旧的世界书条目，但仍不能创建新条目。
          // 这里主动清理一次，确保"开场白阶段不注入，但旧条目会被清掉"。
          try {
              await deleteAllGeneratedEntries_ACU();
              logDebug_ACU('[Worldbook] Deleted generated entries on new chat greeting seed (cleanup-only).');
          } catch (e) {
              logWarn_ACU('[Worldbook] Cleanup on greeting seed failed:', e);
          }

          // 仅触发前端显示刷新（更新该楼层的UI）
          if (SillyTavern_API_ACU?.eventSource?.emit && SillyTavern_API_ACU?.eventTypes?.MESSAGE_UPDATED) {
              SillyTavern_API_ACU.eventSource.emit(SillyTavern_API_ACU.eventTypes.MESSAGE_UPDATED, firstAiIndex);
          }
          // 额外通知前端表格刷新（可视化/面板读取本地数据）
          if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI) {
              (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
          }

          // 更新内存（但不触发世界书注入）
          _set_currentJsonTableData_ACU(reorderDataBySheetKeys_ACU(JSON.parse(JSON.stringify(baseData)), getSortedSheetKeys_ACU(baseData)));
          return true;
      } catch (e) {
          logWarn_ACU('[GreetingLocalBaseState] Failed to seed greeting local data from template:', e);
          return false;
      }
  }

  // [新增] 直接将模板数据填充到第一楼的实际表格数据
  // 用于 initGameSession 场景，确保模板中的所有表格数据（包括种子数据）都被写入第一楼
  export async function fillFirstLayerWithTemplateData_ACU(templateObj, { reason = 'game_init', presetName = '', source = 'game_init', registerPreset = true } = {}) {
      try {
          const chat = SillyTavern_API_ACU?.chat;
          if (!chat || !Array.isArray(chat) || chat.length === 0) {
              logWarn_ACU('[FillFirstLayer] 聊天记录为空，无法填充数据');
              return false;
          }

          // 找到第一条AI消息（第一楼）
          const firstAiIndex = chat.findIndex(m => m && !m.is_user);
          if (firstAiIndex === -1) {
              logWarn_ACU('[FillFirstLayer] 找不到第一楼AI消息');
              return false;
          }
          const firstMsg = chat[firstAiIndex];

          // 确保模板编号稳定
          const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
          if (sheetKeys.length === 0) {
              logWarn_ACU('[FillFirstLayer] 模板中没有表格数据');
              return false;
          }
          ensureSheetOrderNumbers_ACU(templateObj, { baseOrderKeys: sheetKeys, forceRebuild: false });

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

          // 构建完整的表格数据（包含所有种子数据）
          const fullData = { mate: { type: 'chatSheets', version: 1 } };
          sheetKeys.forEach(k => {
              fullData[k] = JSON.parse(JSON.stringify(templateObj[k]));
          });

          const isolationKey = getCurrentIsolationKey_ACU();

          // 写入 TavernDB_ACU_IsolatedData（新版格式）
          if (!firstMsg.TavernDB_ACU_IsolatedData) firstMsg.TavernDB_ACU_IsolatedData = {};
          if (!firstMsg.TavernDB_ACU_IsolatedData[isolationKey]) {
              firstMsg.TavernDB_ACU_IsolatedData[isolationKey] = {
                  independentData: {},
                  modifiedKeys: [],
                  updateGroupKeys: []
              };
          }
          const tagData = firstMsg.TavernDB_ACU_IsolatedData[isolationKey];

          // 写入 independentData（包含所有表格的完整数据）
          const indep = {};
          sheetKeys.forEach(k => {
              indep[k] = JSON.parse(JSON.stringify(fullData[k]));
          });
          tagData.independentData = indep;
          tagData.modifiedKeys = [];
          tagData.updateGroupKeys = [];

          // 同步旧格式（兼容老逻辑）
          firstMsg.TavernDB_ACU_IndependentData = JSON.parse(JSON.stringify(indep));
          firstMsg.TavernDB_ACU_ModifiedKeys = [];
          firstMsg.TavernDB_ACU_UpdateGroupKeys = [];

          // 同时更新指导表与聊天级模板快照（确保表头、参数、预设名同步）
          const guideData = buildChatSheetGuideDataFromTemplateObj_ACU(templateObj, { stripSeedRows: false });
          if (guideData) {
              setChatSheetGuideDataForIsolationKey_ACU(isolationKey, guideData, {
                  reason,
                  syncTemplateScope: true,
                  templateSource: templateSnapshot?.templateStr || templateObj,
                  presetName: normalizedPresetName,
                  source,
              });
              applyTemplateScopeForCurrentChat_ACU();
          }

          // 保存聊天
          await SillyTavern_API_ACU.saveChat();

          // 更新内存数据
          _set_currentJsonTableData_ACU(reorderDataBySheetKeys_ACU(JSON.parse(JSON.stringify(fullData)), getSortedSheetKeys_ACU(fullData)));

          // 通知前端刷新
          if (SillyTavern_API_ACU?.eventSource?.emit && SillyTavern_API_ACU?.eventTypes?.MESSAGE_UPDATED) {
              SillyTavern_API_ACU.eventSource.emit(SillyTavern_API_ACU.eventTypes.MESSAGE_UPDATED, firstAiIndex);
          }
          if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI) {
              (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
          }

          logDebug_ACU(`[FillFirstLayer] 成功将模板数据填充到第一楼，共 ${sheetKeys.length} 个表格`);
          return true;
      } catch (e) {
          logError_ACU('[FillFirstLayer] 填充第一楼数据失败:', e);
          return false;
      }
  }

  function parseReadableToJson_ACU(text) {
    if (!currentJsonTableData_ACU) {
        logError_ACU("Parsing failed: currentJsonTableData_ACU is not available.");
        return null;
    }

    try {
        // Create a deep clone to safely modify, preserving original metadata.
        const newJsonData = JSON.parse(JSON.stringify(currentJsonTableData_ACU)); 
        const tablesText = text.trim().split('# ').slice(1);

        const parsedSheetContents = {};

        for (const tableText of tablesText) {
            const lines = tableText.trim().split('\n');
            const tableName = lines[0].trim();
            
            const sheetKey = getSortedSheetKeys_ACU(newJsonData).find(k => newJsonData[k].name === tableName);
            if (!sheetKey) {
                logWarn_ACU(`Table "${tableName}" from text not found in current JSON structure. Skipping.`);
                continue;
            }

            const originalSheet = newJsonData[sheetKey];
            const originalHeaderRow = originalSheet.content[0];
            const newContent = [originalHeaderRow]; // Start with the original header row.

            // Find all valid markdown table row lines, skipping the format line.
            const dataLines = lines.filter(line => line.trim().startsWith('|') && !line.includes('---'));

            // The first markdown row is the header text, which we ignore since we use the original header.
            for (let i = 1; i < dataLines.length; i++) {
                const line = dataLines[i];
                // Split by '|', remove the first and last empty elements, and trim whitespace.
                const columns = line.split('|').slice(1, -1).map(c => c.trim());
                
                // Start row with null placeholder
                const newRow = [null, ...columns];
                
                // Pad or truncate the row to match the header's column count for consistency.
                if (newRow.length < originalHeaderRow.length) {
                     while(newRow.length < originalHeaderRow.length) newRow.push('');
                } else if (newRow.length > originalHeaderRow.length) {
                    newRow.splice(originalHeaderRow.length);
                }
                newContent.push(newRow);
            }
            parsedSheetContents[sheetKey] = newContent;
        }

        // Update the cloned JSON object only with sheets that were successfully parsed.
        for (const sheetKey in parsedSheetContents) {
            newJsonData[sheetKey].content = parsedSheetContents[sheetKey];
        }

        return newJsonData;

    } catch (error) {
        logError_ACU("Error parsing readable text back to JSON:", error);
        return null;
    }
  }

  export function getEffectiveAutoUpdateThreshold_ACU(calledFrom = 'system') {
    let threshold = Number(settings_ACU.autoUpdateThreshold); // Start with the in-memory setting, ensure number
    if (isNaN(threshold)) threshold = 3; // Default fallback

    // 移除：不再从 UI 输入框实时获取值
    // 原因：UI 可能处于隐藏状态或者未初始化完成，导致获取到的值为空或过时
    // 我们应完全信任 settings_ACU 中的值，因为 UI 修改后会同步到 settings_ACU
    /*
    if (
      $autoUpdateThresholdInput_ACU &&
      $autoUpdateThresholdInput_ACU.length > 0 &&
      $autoUpdateThresholdInput_ACU.is(':visible')
    ) {
      const uiThresholdVal = $autoUpdateThresholdInput_ACU.val();
      if (uiThresholdVal) {
        const parsedUiInput = parseInt(uiThresholdVal, 10);
        if (!isNaN(parsedUiInput) && parsedUiInput >= 1) {
          threshold = parsedUiInput;
        } 
        // ...
      }
    }
    */
    
    // logDebug_ACU(`getEffectiveAutoUpdateThreshold_ACU (calledFrom: ${calledFrom}): final threshold = ${threshold}`);
    return threshold;
  }


  // --- [剧情推进] 核心函数 ---

  /**
   * 剧情推进统一的API调用函数
   */

  /**
   * 将表格JSON数据转换为更适合LLM读取的文本格式。
   * @param {object} jsonData - 表格数据对象（例如本插件的 currentJsonTableData_ACU）。
   * @returns {string} - 格式化后的文本字符串。
   */
  function formatTableDataForLLM_ACU(jsonData) {
    if (!jsonData || typeof jsonData !== 'object' || Object.keys(jsonData).length === 0) {
      return '当前无任何可用的表格数据。';
    }

    let output = '以下是当前角色聊天记录中，由st-memory-enhancement插件保存的全部表格数据：\n';

    for (const sheetId in jsonData) {
      if (Object.prototype.hasOwnProperty.call(jsonData, sheetId)) {
        const sheet = jsonData[sheetId];
        // 确保表格有名称，且内容至少包含表头和一行数据
        if (sheet && sheet.name && sheet.content && sheet.content.length > 1) {
          output += `\n## 表格: ${sheet.name}\n`;
          const headers = sheet.content[0].slice(1); // 第一行是表头，第一个元素通常为空
          const rows = sheet.content.slice(1);

          rows.forEach((row, rowIndex) => {
            const rowData = row.slice(1);
            let rowOutput = '';
            let hasContent = false;
            headers.forEach((header, index) => {
              const cellValue = rowData[index];
              if (cellValue !== null && cellValue !== undefined && String(cellValue).trim() !== '') {
                rowOutput += `  - ${header}: ${cellValue}\n`;
                hasContent = true;
              }
            });

            if (hasContent) {
              output += `\n### ${sheet.name} - 第 ${rowIndex + 1} 条记录\n${rowOutput}`;
            }
          });
        }
      }
    }
    output += '\n--- 表格数据结束 ---\n';
    return output;
  }

  // [新增] 从世界书获取"纪要索引"条目内容（用于$5优先替换）
  async function getSummaryIndexContentForPlot_ACU(plotSettings) {
    try {
      const plotCfg = plotSettings?.plotWorldbookConfig;
      const worldbookSource = plotCfg?.source || 'character';
      let bookNames = [];
      
      if (worldbookSource === 'manual' && plotCfg?.manualSelection?.length) {
        bookNames = plotCfg.manualSelection;
      } else {
        try {
          const charLorebooks = await TavernHelper_API_ACU.getCharLorebooks({ type: 'all' });
          if (charLorebooks.primary) bookNames.push(charLorebooks.primary);
          if (charLorebooks.secondary) bookNames.push(charLorebooks.secondary);
        } catch (e) {
          return null;
        }
      }
      
      const isoPrefix = getIsolationPrefix_ACU();
      const targetComment = isoPrefix + 'TavernDB-ACU-CustomExport-纪要索引';
      
      for (const bookName of bookNames) {
        try {
          const entries = await TavernHelper_API_ACU.getLorebookEntries(bookName);
          // [修复] 移除&& e.enabled检查，让$5占位符在0TK模式下仍能读取被禁用的纪要索引条目内容
          // 该函数仅被用于$5占位符，不影响其他逻辑的enabled状态检查
          const indexEntry = entries?.find(e => e.comment === targetComment);
          if (indexEntry?.content) {
            logDebug_ACU('[剧情推进] $5 从世界书纪要索引条目获取成功' + (indexEntry.enabled ? '' : '(条目已禁用)'));
            return indexEntry.content;
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    } catch (error) {
      logError_ACU('[剧情推进] 获取纪要索引条目失败:', error);
      return null;
    }
  }

  // [剧情推进专用] $5 只注入"总体大纲"表（含表头）。不影响填表侧任何逻辑。
  export function formatOutlineTableForPlot_ACU(allTablesJson) {
    try {
      if (!allTablesJson || typeof allTablesJson !== 'object') {
        return '总体大纲表：未获取到表格数据。';
      }
      const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
      const outline = sheets.find(s => String(s.name || '').trim() === '总体大纲');
      if (!outline || !Array.isArray(outline.content) || outline.content.length === 0) {
        return '总体大纲表：未找到该表或表结构为空。';
      }

      const headerRow = Array.isArray(outline.content[0]) ? outline.content[0] : [];
      const headers = headerRow.slice(1).map(h => String(h ?? '').trim()).filter(Boolean);
      let out = `## 表格: 总体大纲\n`;
      out += headers.length ? `Columns: ${headers.join(', ')}\n` : 'Columns: (无表头)\n';

      const rows = outline.content.slice(1).filter(r => Array.isArray(r));
      if (rows.length === 0) {
        out += '(无数据行)\n';
        return out;
      }

      rows.forEach((row, idx) => {
        const cells = row.slice(1);
        // 只输出非空单元格，避免噪声；但保留行号便于引用
        const parts = [];
        for (let i = 0; i < headers.length; i++) {
          const v = cells[i];
          if (v !== null && v !== undefined && String(v).trim() !== '') {
            parts.push(`${headers[i]}: ${String(v)}`);
          }
        }
        out += parts.length ? `- [${idx}] ${parts.join(' | ')}\n` : `- [${idx}] (空行)\n`;
      });
      return out;
    } catch (e) {
      return '总体大纲表：格式化时发生错误。';
    }
  }

  // [剧情推进专用] $5 从纪要表本地数据读取概要和编码索引两列（不再从世界书纪要索引条目读取）
  // 只读取纪要表的"概览/概要"列和"编码索引"列，不读取其他内容（时间跨度、地点、纪要等）
  // 返回格式：{ success: boolean, content: string }，方便调用方判断是否成功
  export function formatSummaryIndexForPlot_ACU(allTablesJson) {
    try {
      if (!allTablesJson || typeof allTablesJson !== 'object') {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未获取到表格数据');
        return { success: false, content: '纪要索引：未获取到表格数据。' };
      }
      const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
      // 查找纪要表（兼容旧数据"总结表"）
      const summaryTable = sheets.find(s => {
        const name = String(s.name || '').trim();
        return name === '纪要表' || name === '总结表';
      });
      
      if (!summaryTable) {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未找到纪要表，可用表格:', sheets.map(s => s.name));
        return { success: false, content: '纪要索引：未找到纪要表。' };
      }
      
      if (!Array.isArray(summaryTable.content) || summaryTable.content.length <= 1) {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 纪要表为空，content长度:', summaryTable.content?.length);
        return { success: false, content: '纪要索引：纪要表为空。' };
      }

      const headerRow = Array.isArray(summaryTable.content[0]) ? summaryTable.content[0] : [];
      logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 纪要表表头:', JSON.stringify(headerRow));
      
      // 找到概要列和编码索引列的索引（兼容"概览"和"概要"两种列名）
      const summaryColIdx = headerRow.findIndex(h => {
        const name = String(h ?? '').trim();
        return name === '概览' || name === '概要';
      });
      const indexColIdx = headerRow.findIndex(h => String(h ?? '').trim() === '编码索引');
      
      if (summaryColIdx === -1 || indexColIdx === -1) {
        logWarn_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未找到概要列或编码索引列，概要列索引=', summaryColIdx, ', 编码索引列索引=', indexColIdx);
        return { success: false, content: '纪要索引：未找到概要列或编码索引列。' };
      }

      let out = `## 表格: 纪要索引\n`;
      out += `Columns: 概要, 编码索引\n`;

      const rows = summaryTable.content.slice(1).filter(r => Array.isArray(r));
      if (rows.length === 0) {
        out += '(无数据行)\n';
        return { success: true, content: out };
      }

      rows.forEach((row, idx) => {
        const summary = row[summaryColIdx] ? String(row[summaryColIdx]).trim() : '';
        const indexCode = row[indexColIdx] ? String(row[indexColIdx]).trim() : '';
        if (summary || indexCode) {
          out += `- [${idx}] 概要: ${summary} | 编码索引: ${indexCode}\n`;
        }
      });
      logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 成功生成纪要索引，行数=', rows.length);
      return { success: true, content: out };
    } catch (e) {
      logError_ACU('[剧情推进] 格式化纪要索引时出错:', e);
      return { success: false, content: '纪要索引：格式化时发生错误。' };
    }
  }

  // =========================
  // [剧情推进] 随机数生成功能
  // 语法：<random min="1" max="100" />
  // 在提示词中生成指定范围内的随机整数
  // 新增：支持 id 属性存储随机数变量，可用 $random:id 引用
  // =========================

  // 随机数变量存储（每次处理时重置）
  let randomVariables_ACU = {};

  // 计算变量存储（每次处理时重置）
  let calcVariables_ACU = {};

  // 最大值变量存储（每次处理时重置）
  let maxVariables_ACU = {};

  // 最小值变量存储（每次处理时重置）
  let minVariables_ACU = {};

  /**
   * 解析随机数标签，生成随机整数
   * 语法：
   * - <random min="1" max="100" /> - 生成随机数并替换标签
   * - <random id="dice" min="1" max="6" /> - 生成随机数并存储为变量
   * @param {string} content - 包含随机数标签的内容
   * @returns {string} - 替换随机数标签后的内容
   */
  export function parseRandomTags_ACU(content) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    // 重置随机数变量存储
    randomVariables_ACU = {};

    // 匹配 <random id="xxx" min="X" max="Y" /> 或 <random min="X" max="Y" id="xxx" />
    // 也支持不带 id 的传统格式
    const randomRegex = /<random\s+([^>]*?)\s*\/?>/gi;

    return content.replace(randomRegex, (match, attrs) => {
      // 解析属性
      const idMatch = attrs.match(/id\s*=\s*"([^"]*)"/i);
      const minMatch = attrs.match(/min\s*=\s*"(\d+)"/i);
      const maxMatch = attrs.match(/max\s*=\s*"(\d+)"/i);

      if (!minMatch || !maxMatch) {
        logWarn_ACU('[随机函数] 缺少 min 或 max 参数:', attrs);
        return match; // 保持原样
      }

      const id = idMatch ? idMatch[1].trim() : null;
      const min = parseInt(minMatch[1], 10);
      const max = parseInt(maxMatch[1], 10);

      if (isNaN(min) || isNaN(max)) {
        logWarn_ACU('[随机函数] 无效的随机参数:', minMatch[1], maxMatch[1]);
        return match; // 保持原样
      }

      let randomValue;
      if (min > max) {
        logWarn_ACU('[随机函数] 最小值大于最大值，自动交换:', min, max);
        randomValue = Math.floor(Math.random() * (min - max + 1)) + max;
      } else {
        randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
      }

      // 如果有 id，存储到变量中
      if (id) {
        randomVariables_ACU[id] = randomValue;
        logDebug_ACU('[随机函数] 生成随机数变量:', id, '=', randomValue, '范围:', min, '-', max);
        // 返回空字符串，不显示在文本中（用户可以用 $random:id 引用）
        return '';
      } else {
        logDebug_ACU('[随机函数] 生成随机数:', randomValue, '范围:', min, '-', max);
        return String(randomValue);
      }
    });
  }

  /**
   * 替换随机数变量引用 $random:id
   * @param {string} content - 包含随机数变量引用的内容
   * @returns {string} - 替换后的内容
   */
  export function replaceRandomVariables_ACU(content) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    // 匹配 $random:id 或 $random:id 格式
    return content.replace(/\$random:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (randomVariables_ACU.hasOwnProperty(id)) {
        return String(randomVariables_ACU[id]);
      }
      logWarn_ACU('[随机函数] 未找到随机数变量:', id);
      return match; // 保持原样
    });
  }

  /**
   * 获取随机数变量值（用于条件判断）
   * @param {string} id - 随机数变量 ID
   * @returns {number|null} - 随机数值，不存在返回 null
   */
  function getRandomVariable_ACU(id) {
    if (randomVariables_ACU.hasOwnProperty(id)) {
      return randomVariables_ACU[id];
    }
    return null;
  }

  // =========================
  // [剧情推进] 计算变量功能
  // 语法：<calc id="变量名" expr="计算表达式" />
  // 支持四则运算、表格引用、随机数引用、其他计算变量引用
  // =========================

  /**
   * 解析表达式中的变量引用，返回数值
   * 支持：cell:表名/行名/列名、$random:id、$calc:id、$max:id、$min:id
   * @param {string} expr - 表达式
   * @param {object} context - 上下文（包含 allTablesJson 等）
   * @returns {object} - { success: boolean, value: number|null, error: string|null }
   */
  function parseCalcExpressionValue_ACU(expr, context) {
    if (!expr || typeof expr !== 'string') {
      return { success: false, value: null, error: '表达式为空' };
    }

    const trimmed = expr.trim();
    
    // 检查是否是纯数字
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { success: true, value: parseFloat(trimmed), error: null };
    }

    // 检查是否是 cell:表名/行名/列名 格式
    if (trimmed.startsWith('cell:')) {
      const cellPath = trimmed.substring(5).trim();
      const parts = cellPath.split('/');
      if (parts.length !== 3) {
        return { success: false, value: null, error: `cell 路径格式错误: ${cellPath}` };
      }
      const [tableName, rowName, colName] = parts.map(p => p.trim());
      const cellValue: any = getCellValue_ACU(tableName, rowName, colName, context.allTablesJson);
      if (cellValue === null || cellValue === undefined || cellValue === '') {
        return { success: false, value: null, error: `cell 值不存在: ${cellPath}` };
      }
      const numValue = parseFloat(cellValue);
      if (isNaN(numValue)) {
        return { success: false, value: null, error: `cell 值不是数字: ${cellPath} = ${cellValue}` };
      }
      return { success: true, value: numValue, error: null };
    }

    // 检查是否是 $random:id 格式
    const randomMatch = trimmed.match(/^\$random:([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (randomMatch) {
      const randomId = randomMatch[1];
      const randomValue = getRandomVariable_ACU(randomId);
      if (randomValue === null) {
        return { success: false, value: null, error: `随机数变量不存在: ${randomId}` };
      }
      return { success: true, value: randomValue, error: null };
    }

    // 检查是否是 $calc:id 格式
    const calcMatch = trimmed.match(/^\$calc:([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (calcMatch) {
      const calcId = calcMatch[1];
      if (calcVariables_ACU.hasOwnProperty(calcId)) {
        return { success: true, value: calcVariables_ACU[calcId], error: null };
      }
      return { success: false, value: null, error: `计算变量不存在: ${calcId}` };
    }

    // 检查是否是 $max:id 格式
    const maxMatch = trimmed.match(/^\$max:([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (maxMatch) {
      const maxId = maxMatch[1];
      if (maxVariables_ACU.hasOwnProperty(maxId)) {
        return { success: true, value: maxVariables_ACU[maxId], error: null };
      }
      return { success: false, value: null, error: `最大值变量不存在: ${maxId}` };
    }

    // 检查是否是 $min:id 格式
    const minMatch = trimmed.match(/^\$min:([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (minMatch) {
      const minId = minMatch[1];
      if (minVariables_ACU.hasOwnProperty(minId)) {
        return { success: true, value: minVariables_ACU[minId], error: null };
      }
      return { success: false, value: null, error: `最小值变量不存在: ${minId}` };
    }

    return { success: false, value: null, error: `无法解析表达式: ${trimmed}` };
  }

  /**
   * 计算表达式（支持四则运算和括号）
   * @param {string} expr - 计算表达式
   * @param {object} context - 上下文
   * @returns {object} - { success: boolean, value: number|null, error: string|null }
   */
  function evaluateCalcExpression_ACU(expr, context) {
    if (!expr || typeof expr !== 'string') {
      return { success: false, value: null, error: '表达式为空' };
    }

    let processedExpr = expr.trim();
    
    // 替换所有变量引用为数值
    // 先替换 cell: 引用
    processedExpr = processedExpr.replace(/cell:([^+\-*/%()\s]+)/gi, (match, cellPath) => {
      const parts = cellPath.split('/');
      if (parts.length !== 3) {
        return 'NaN';
      }
      const [tableName, rowName, colName] = parts.map(p => p.trim());
      const cellValue: any = getCellValue_ACU(tableName, rowName, colName, context.allTablesJson);
      if (cellValue === null || cellValue === undefined || cellValue === '') {
        return 'NaN';
      }
      const numValue = parseFloat(cellValue);
      return isNaN(numValue) ? 'NaN' : String(numValue);
    });

    // 替换 $random:id 引用
    processedExpr = processedExpr.replace(/\$random:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      const value = getRandomVariable_ACU(id);
      return value === null ? 'NaN' : String(value);
    });

    // 替换 $calc:id 引用
    processedExpr = processedExpr.replace(/\$calc:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (calcVariables_ACU.hasOwnProperty(id)) {
        return String(calcVariables_ACU[id]);
      }
      return 'NaN';
    });

    // 替换 $max:id 引用
    processedExpr = processedExpr.replace(/\$max:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (maxVariables_ACU.hasOwnProperty(id)) {
        return String(maxVariables_ACU[id]);
      }
      return 'NaN';
    });

    // 替换 $min:id 引用
    processedExpr = processedExpr.replace(/\$min:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (minVariables_ACU.hasOwnProperty(id)) {
        return String(minVariables_ACU[id]);
      }
      return 'NaN';
    });

    // 检查是否包含 NaN（表示有变量不存在）
    if (processedExpr.includes('NaN')) {
      return { success: false, value: null, error: `表达式包含无效变量: ${processedExpr}` };
    }

    // 检查是否包含除零
    if (/\/\s*0(?![.\d])/.test(processedExpr)) {
      return { success: false, value: null, error: '除数为零' };
    }

    // 安全计算表达式
    try {
      // 只允许数字、运算符、括号和小数点
      if (!/^[\d+\-*/%().\s]+$/.test(processedExpr)) {
        return { success: false, value: null, error: `表达式包含非法字符: ${processedExpr}` };
      }
      
      // 使用 Function 安全计算
      const result = new Function('return ' + processedExpr)();
      
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return { success: false, value: null, error: `计算结果无效: ${result}` };
      }

      // 只保留整数
      const intResult = Math.floor(result);
      return { success: true, value: intResult, error: null };
    } catch (e) {
      return { success: false, value: null, error: `计算错误: ${e.message}` };
    }
  }

  /**
   * 解析计算变量标签 <calc id="xxx" expr="表达式" />
   * @param {string} content - 包含计算变量标签的内容
   * @param {object} context - 上下文
   * @returns {string} - 替换计算变量标签后的内容
   */
  export function parseCalcTags_ACU(content, context) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    // 重置计算变量存储
    calcVariables_ACU = {};

    // 匹配 <calc id="xxx" expr="表达式" />
    const calcRegex = /<calc\s+([^>]*?)\s*\/?>/gi;

    return content.replace(calcRegex, (match, attrs) => {
      const idMatch = attrs.match(/id\s*=\s*"([^"]*)"/i);
      const exprMatch = attrs.match(/expr\s*=\s*"([^"]*)"/i);

      if (!idMatch || !exprMatch) {
        logWarn_ACU('[计算变量] 缺少 id 或 expr 参数:', attrs);
        return match; // 保持原样
      }

      const id = idMatch[1].trim();
      const expr = exprMatch[1].trim();

      const result = evaluateCalcExpression_ACU(expr, context);
      
      if (result.success) {
        calcVariables_ACU[id] = result.value;
        logDebug_ACU('[计算变量] 定义成功:', id, '=', result.value, '表达式:', expr);
        return ''; // 成功定义，返回空字符串
      } else {
        logWarn_ACU('[计算变量] 定义失败:', id, '-', result.error);
        return match; // 保持原样，让后续条件判断失败
      }
    });
  }

  /**
   * 解析最大值变量标签 <max id="xxx" values="值1, 值2, ..." />
   * @param {string} content - 包含最大值变量标签的内容
   * @param {object} context - 上下文
   * @returns {string} - 替换最大值变量标签后的内容
   */
  export function parseMaxTags_ACU(content, context) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    // 重置最大值变量存储
    maxVariables_ACU = {};

    // 匹配 <max id="xxx" values="值列表" />
    const maxRegex = /<max\s+([^>]*?)\s*\/?>/gi;

    return content.replace(maxRegex, (match, attrs) => {
      const idMatch = attrs.match(/id\s*=\s*"([^"]*)"/i);
      const valuesMatch = attrs.match(/values\s*=\s*"([^"]*)"/i);

      if (!idMatch || !valuesMatch) {
        logWarn_ACU('[最大值变量] 缺少 id 或 values 参数:', attrs);
        return match;
      }

      const id = idMatch[1].trim();
      const valuesStr = valuesMatch[1].trim();

      // 解析值列表
      const valueExprs = valuesStr.split(',').map(v => v.trim()).filter(v => v);
      if (valueExprs.length === 0) {
        logWarn_ACU('[最大值变量] 值列表为空:', id);
        return match;
      }

      // 获取所有值
      const values = [];
      for (const expr of valueExprs) {
        const result = parseCalcExpressionValue_ACU(expr, context);
        if (!result.success) {
          logWarn_ACU('[最大值变量] 解析值失败:', id, '-', result.error, '表达式:', expr);
          return match; // 任一值失败，整个变量无效
        }
        values.push(result.value);
      }

      const maxValue = Math.max(...values);
      maxVariables_ACU[id] = maxValue;
      logDebug_ACU('[最大值变量] 定义成功:', id, '=', maxValue, '值列表:', values);
      return '';
    });
  }

  /**
   * 解析最小值变量标签 <min id="xxx" values="值1, 值2, ..." />
   * @param {string} content - 包含最小值变量标签的内容
   * @param {object} context - 上下文
   * @returns {string} - 替换最小值变量标签后的内容
   */
  export function parseMinTags_ACU(content, context) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    // 重置最小值变量存储
    minVariables_ACU = {};

    // 匹配 <min id="xxx" values="值列表" />
    const minRegex = /<min\s+([^>]*?)\s*\/?>/gi;

    return content.replace(minRegex, (match, attrs) => {
      const idMatch = attrs.match(/id\s*=\s*"([^"]*)"/i);
      const valuesMatch = attrs.match(/values\s*=\s*"([^"]*)"/i);

      if (!idMatch || !valuesMatch) {
        logWarn_ACU('[最小值变量] 缺少 id 或 values 参数:', attrs);
        return match;
      }

      const id = idMatch[1].trim();
      const valuesStr = valuesMatch[1].trim();

      // 解析值列表
      const valueExprs = valuesStr.split(',').map(v => v.trim()).filter(v => v);
      if (valueExprs.length === 0) {
        logWarn_ACU('[最小值变量] 值列表为空:', id);
        return match;
      }

      // 获取所有值
      const values = [];
      for (const expr of valueExprs) {
        const result = parseCalcExpressionValue_ACU(expr, context);
        if (!result.success) {
          logWarn_ACU('[最小值变量] 解析值失败:', id, '-', result.error, '表达式:', expr);
          return match; // 任一值失败，整个变量无效
        }
        values.push(result.value);
      }

      const minValue = Math.min(...values);
      minVariables_ACU[id] = minValue;
      logDebug_ACU('[最小值变量] 定义成功:', id, '=', minValue, '值列表:', values);
      return '';
    });
  }

  /**
   * 替换计算变量引用 $calc:id
   * @param {string} content - 包含计算变量引用的内容
   * @returns {string} - 替换后的内容
   */
  export function replaceCalcVariables_ACU(content) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    return content.replace(/\$calc:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (calcVariables_ACU.hasOwnProperty(id)) {
        return String(calcVariables_ACU[id]);
      }
      logWarn_ACU('[计算变量] 未找到变量:', id);
      return match; // 保持原样
    });
  }

  /**
   * 替换最大值变量引用 $max:id
   * @param {string} content - 包含最大值变量引用的内容
   * @returns {string} - 替换后的内容
   */
  export function replaceMaxVariables_ACU(content) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    return content.replace(/\$max:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (maxVariables_ACU.hasOwnProperty(id)) {
        return String(maxVariables_ACU[id]);
      }
      logWarn_ACU('[最大值变量] 未找到变量:', id);
      return match;
    });
  }

  /**
   * 替换最小值变量引用 $min:id
   * @param {string} content - 包含最小值变量引用的内容
   * @returns {string} - 替换后的内容
   */
  export function replaceMinVariables_ACU(content) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    return content.replace(/\$min:([a-zA-Z_][a-zA-Z0-9_]*)/gi, (match, id) => {
      if (minVariables_ACU.hasOwnProperty(id)) {
        return String(minVariables_ACU[id]);
      }
      logWarn_ACU('[最小值变量] 未找到变量:', id);
      return match;
    });
  }

  /**
   * 获取计算变量值（用于条件判断）
   * @param {string} id - 计算变量 ID
   * @returns {number|null} - 计算值，不存在返回 null
   */
  function getCalcVariable_ACU(id) {
    if (calcVariables_ACU.hasOwnProperty(id)) {
      return calcVariables_ACU[id];
    }
    return null;
  }

  /**
   * 获取最大值变量值（用于条件判断）
   * @param {string} id - 最大值变量 ID
   * @returns {number|null} - 最大值，不存在返回 null
   */
  function getMaxVariable_ACU(id) {
    if (maxVariables_ACU.hasOwnProperty(id)) {
      return maxVariables_ACU[id];
    }
    return null;
  }

  /**
   * 获取最小值变量值（用于条件判断）
   * @param {string} id - 最小值变量 ID
   * @returns {number|null} - 最小值，不存在返回 null
   */
  function getMinVariable_ACU(id) {
    if (minVariables_ACU.hasOwnProperty(id)) {
      return minVariables_ACU[id];
    }
    return null;
  }

  // =========================
  // [剧情推进] 条件模板解析功能
  // 语法：<if seed="关键词表达式">条件提示词内容</if>
  // 支持与（&）、或（,）、非（!）三种逻辑及其组合
  // 检测范围：除纪要表以外的所有数据库表格内容 + $6上轮规划数据
  // =========================

  /**
   * 解析关键词表达式并判断是否匹配
   * 支持的语法：
   * - 简单匹配：战斗
   * - 或逻辑：战斗,打架
   * - 与逻辑：战斗&主角
   * - 非逻辑：!战斗
   * - 组合逻辑：(战斗&主角),感情
   * @param {string} expression - 关键词表达式
   * @param {string} content - 待检测的内容（最新一层的AI回复正文）
   * @param {string} plotContent - 最新一层的推进数据（$6），可选
   * @returns {boolean} - 是否匹配
   */
  function evaluateSeedExpression_ACU(expression, content, plotContent = '') {
    if (!expression || typeof expression !== 'string') return false;
    if (!content || typeof content !== 'string') return false;
    if (!plotContent || typeof plotContent !== 'string') {
      plotContent = '';
    }
    
    const expr = expression.trim();
    if (!expr) return false;
    
    // 拼接最新一层AI回复正文和最新一层推进数据，在两者中查找关键词
    const combinedContent = content + '\n' + plotContent;
    const lowerContent = combinedContent.toLowerCase();
    
    // 检查单个关键词是否匹配
    const checkKeyword = (keyword) => {
      const kw = keyword.trim();
      if (!kw) return false;
      
      // 非逻辑：!关键词
      if (kw.startsWith('!')) {
        const actualKw = kw.slice(1).trim();
        if (!actualKw) return true; // 空的非逻辑视为匹配
        return !lowerContent.includes(actualKw.toLowerCase());
      }
      
      // 普通匹配
      return lowerContent.includes(kw.toLowerCase());
    };
    
    // 检查与逻辑组：A&B&C
    const checkAndGroup = (group) => {
      const keywords = group.split('&').map(k => k.trim()).filter(k => k);
      if (keywords.length === 0) return false;
      return keywords.every(kw => checkKeyword(kw));
    };
    
    // 处理括号内的组合
    // 使用局部变量存储括号结果，避免浏览器环境中 global 未定义的问题
    const _parenResults = {};
    
    const processExpression = (expr) => {
      // 先处理括号内的表达式
      // 简单处理：找到 ( ) 包裹的内容，递归处理
      let processed = expr;
      const parenRegex = /\(([^()]+)\)/g;
      let match;
      let idx = 0;
      
      while ((match = parenRegex.exec(expr)) !== null) {
        const innerExpr = match[1];
        const innerResult = processExpression(innerExpr);
        // 用占位符替换括号表达式
        processed = processed.replace(match[0], `__PAREN_${idx}__`);
        // 存储结果到局部变量
        _parenResults[`__PAREN_${idx}__`] = innerResult;
        idx++;
      }
      
      // 处理或逻辑（逗号分隔）
      const orParts = processed.split(',').map(p => p.trim()).filter(p => p);
      
      // 如果有多个或部分，任一匹配即可
      if (orParts.length > 1) {
        return orParts.some(part => {
          // 检查是否是占位符
          if (_parenResults[part] !== undefined) {
            return _parenResults[part];
          }
          // 检查是否是与逻辑组
          if (part.includes('&')) {
            return checkAndGroup(part);
          }
          return checkKeyword(part);
        });
      }
      
      // 单个部分
      const singlePart = orParts[0] || '';
      if (_parenResults[singlePart] !== undefined) {
        return _parenResults[singlePart];
      }
      if (singlePart.includes('&')) {
        return checkAndGroup(singlePart);
      }
      return checkKeyword(singlePart);
    };
    
    
    return processExpression(expr);
  }

  // =========================
  // [剧情推进] 条件模板扩展：表格数值定位与比较
  // 语法：<if cell="表格名::行名::列名 比较运算符 数值">条件提示词内容</if>
  // 支持的比较运算符：>、<、>=、<=、==、!=
  // 示例：<if cell="重要人物表::威尔逊::好感度 > 50">威尔逊好感度超过50时的提示词</if>
  // =========================

  /**
   * 从表格数据中获取指定单元格的值
   * @param {object} allTablesJson - 完整的表格数据对象
   * @param {string} tableName - 表格名称
   * @param {string} rowName - 行标识文本（会在该表任意列中查找）
   * @param {string} colName - 列名称
   * @returns {object} - { success: boolean, value: string|number, error?: string }
   */
  function getCellValue_ACU(allTablesJson, tableName, rowName, colName) {
    try {
      if (!allTablesJson || typeof allTablesJson !== 'object') {
        return { success: false, value: null, error: '表格数据为空' };
      }
      
      // 查找目标表格
      const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
      const targetTable = sheets.find(s => String(s.name || '').trim() === tableName.trim());
      
      if (!targetTable) {
        return { success: false, value: null, error: `未找到表格: ${tableName}` };
      }
      
      if (!Array.isArray(targetTable.content) || targetTable.content.length < 1) {
        return { success: false, value: null, error: `表格 ${tableName} 没有数据` };
      }
      
      // 获取表头
      const headerRow = targetTable.content[0];
      if (!Array.isArray(headerRow)) {
        return { success: false, value: null, error: `表格 ${tableName} 表头格式错误` };
      }
      
      // 查找列索引（表头中匹配列名的索引）
      const colIndex = headerRow.findIndex(h => String(h || '').trim() === colName.trim());
      if (colIndex === -1) {
        return { success: false, value: null, error: `未找到列: ${colName}` };
      }
      
      // 查找行：只要任意列有单元格匹配 rowName，就视为命中该行
      const normalizedRowName = String(rowName || '').trim();
      const dataRows = targetTable.content.slice(1);
      const targetRow = dataRows.find(row => {
        if (!Array.isArray(row)) return false;
        return row.some(cell => String(cell || '').trim() === normalizedRowName);
      });
      
      if (!targetRow) {
        return { success: false, value: null, error: `未找到行标识: ${rowName}` };
      }
      
      // 获取单元格值
      const cellValue = targetRow[colIndex];
      
      // 尝试转换为数值
      const numValue = parseFloat(cellValue);
      if (!isNaN(numValue) && isFinite(numValue)) {
        return { success: true, value: numValue, rawValue: String(cellValue) };
      }
      
      // 返回字符串值
      return { success: true, value: String(cellValue || ''), rawValue: String(cellValue || '') };
      
    } catch (e) {
      logError_ACU('[剧情推进] getCellValue_ACU 出错:', e);
      return { success: false, value: null, error: String(e.message || e) };
    }
  }

  /**
   * 规范化运算符表达式（将全角运算符转换为半角）
   * 支持：＞、＜、＝、≥、≦、≠ 等全角符号
   * @param {string} expression - 原始表达式
   * @returns {string} - 规范化后的表达式
   */
  function normalizeOperators_ACU(expression) {
    if (!expression || typeof expression !== 'string') return expression;
    return expression
      .replace(/＞/g, '>')    // 全角大于
      .replace(/＜/g, '<')    // 全角小于
      .replace(/＝/g, '==')   // 全角等于（转换为双等号）
      .replace(/≥/g, '>=')   // 大于等于
      .replace(/≦/g, '<=')   // 小于等于
      .replace(/≤/g, '<=')   // 小于等于
      .replace(/≠/g, '!=');  // 不等于
  }

  /**
   * 执行单个值的比较
   * @param {number|string} cellValue - 单元格值
   * @param {string} operator - 比较运算符
   * @param {number|string} compareValue - 比较值
   * @returns {boolean} - 是否满足条件
   */
  function compareValue_ACU(cellValue, operator, compareValue) {
    const numCompareValue = parseFloat(compareValue);
    const isNumericComparison = !isNaN(numCompareValue) && isFinite(numCompareValue);
    
    if (isNumericComparison && typeof cellValue === 'number') {
      // 数值比较
      switch (operator) {
        case '>': return cellValue > numCompareValue;
        case '<': return cellValue < numCompareValue;
        case '>=': return cellValue >= numCompareValue;
        case '<=': return cellValue <= numCompareValue;
        case '==': return cellValue === numCompareValue;
        case '!=': return cellValue !== numCompareValue;
        default: return false;
      }
    } else {
      // 字符串比较
      const strCellValue = String(cellValue);
      const strCompareValue = String(compareValue);
      switch (operator) {
        case '==': return strCellValue === strCompareValue;
        case '!=': return strCellValue !== strCompareValue;
        case '>': return strCellValue > strCompareValue;
        case '<': return strCellValue < strCompareValue;
        case '>=': return strCellValue >= strCompareValue;
        case '<=': return strCellValue <= strCompareValue;
        default: return false;
      }
    }
  }

  /**
   * 解析数值比较表达式（简化版）
   * 支持格式：
   * - 精确匹配：表格名/行标识/列名 > 50（先在任意列定位行，再读取目标列；允许行列颠倒后再整体匹配）
   * - 模糊匹配（某行）：表格名/行名 > 50（检查该行所有数值列）
   * - 模糊匹配（某列）：表格名/列名 > 50（检查该列所有数值行）
   * @param {string} expression - 比较表达式
   * @param {object} allTablesJson - 完整的表格数据对象
   * @returns {boolean} - 是否满足条件（任一匹配即返回true）
   */
  function evaluateCellExpression_ACU(expression, allTablesJson) {
    if (!expression || typeof expression !== 'string') return false;
    
    // 【新增】将全角运算符转换为半角运算符
    const normalizedExpr = normalizeOperators_ACU(expression);
    
    // 支持的比较运算符：>、<、>=、<=、==、!=
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    
    let matchedOperator = null;
    let cellRef = '';
    let compareValue = '';
    
    // 查找匹配的运算符（使用规范化后的表达式）
    for (const op of operators) {
      const opIndex = normalizedExpr.indexOf(op);
      if (opIndex !== -1) {
        cellRef = normalizedExpr.substring(0, opIndex).trim();
        compareValue = normalizedExpr.substring(opIndex + op.length).trim();
        matchedOperator = op;
        break;
      }
    }
    
    if (!matchedOperator) {
      logWarn_ACU('[剧情推进] evaluateCellExpression_ACU: 未找到有效的比较运算符, expression=', expression);
      return false;
    }
    
    // 解析单元格引用：用斜杠分隔
    const parts = cellRef.split('/').map(p => p.trim()).filter(p => p);
    
    if (parts.length < 2 || parts.length > 3) {
      logWarn_ACU('[剧情推进] evaluateCellExpression_ACU: 单元格引用格式错误, cellRef=', cellRef);
      return false;
    }
    
    const [tableName, name1, name2] = parts;
    
    // 查找目标表格
    if (!allTablesJson || typeof allTablesJson !== 'object') {
      // 表格数据不存在时：== 返回 false，!= 返回 true
      return matchedOperator === '!=';
    }
    
    const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
    const targetTable = sheets.find(s => String(s.name || '').trim() === tableName.trim());
    
    if (!targetTable || !Array.isArray(targetTable.content) || targetTable.content.length < 1) {
      logDebug_ACU('[剧情推进] evaluateCellExpression_ACU: 未找到表格或表格为空, tableName=', tableName);
      // 表格不存在时：== 返回 false，!= 返回 true
      return matchedOperator === '!=';
    }
    
    const headerRow = targetTable.content[0];
    if (!Array.isArray(headerRow)) {
      return false;
    }
    
    const dataRows = targetTable.content.slice(1);
    
    // 根据参数数量决定匹配模式
    if (parts.length === 3) {
      // 精确匹配：表格名/行标识/列名
      // 先在任意列中定位到包含"行标识"的整行，再读取目标列；允许将"行标识/列名"整体交换后再次尝试
      const rowName = name1;
      const colName = name2;
      let cellResult = getCellValue_ACU(allTablesJson, tableName, rowName, colName);
      
      if (cellResult.success) {
        return compareValue_ACU(cellResult.value, matchedOperator, compareValue);
      }

      // 允许行列颠倒，但仍要求"交换后"的行与列都同时存在才算命中
      cellResult = getCellValue_ACU(allTablesJson, tableName, colName, rowName);
      if (cellResult.success) {
        return compareValue_ACU(cellResult.value, matchedOperator, compareValue);
      }
      
      // 单元格不存在时：== 返回 false，!= 返回 true
      return matchedOperator === '!=';
      
    } else if (parts.length === 2) {
      // 模糊匹配：表格名/名称（检查该名称是行名还是列名）
      const targetName = name1;
      let foundAnyCell = false; // 标记是否找到了任何单元格
      
      // 检查是否是行名（第一列匹配）
      const targetRow = dataRows.find(row => {
        if (!Array.isArray(row)) return false;
        return String(row[0] || '').trim() === targetName.trim();
      });
      
      if (targetRow) {
        foundAnyCell = true;
        // 是行名，检查该行所有列（支持数值和字符串比较）
        for (let colIdx = 1; colIdx < targetRow.length; colIdx++) {
          const cellValue = targetRow[colIdx];
          if (compareValue_ACU(cellValue, matchedOperator, compareValue)) {
            return true;
          }
        }
      }
      
      // 检查是否是列名（表头匹配）
      const colIndex = headerRow.findIndex(h => String(h || '').trim() === targetName.trim());
      
      if (colIndex !== -1) {
        foundAnyCell = true;
        // 是列名，检查该列所有行（支持数值和字符串比较）
        for (const row of dataRows) {
          if (!Array.isArray(row)) continue;
          const cellValue = row[colIndex];
          if (compareValue_ACU(cellValue, matchedOperator, compareValue)) {
            return true;
          }
        }
      }
      
      // 如果找到了单元格但比较失败，返回 false
      // 如果没找到任何单元格，== 返回 false，!= 返回 true
      if (foundAnyCell) {
        return false;
      } else {
        return matchedOperator === '!=';
      }
    }
    
    return false;
  }

  // =========================
  // [剧情推进] 条件模板扩展：统一条件表达式（cond属性）
  // 语法：<if cond="条件表达式">条件提示词内容</if>
  // 支持的子条件：seed:关键词表达式 | cell:表格条件
  // 支持的逻辑运算符：& (AND) | , (OR)
  // 支持括号分组：(A & B) , C
  // 示例：<if cond="(seed:战斗 & cell:状态表/主角/魔力值 > 30) , cell:关系表/陈默/好感度 > 80">...</if>
  // =========================

  /**
   * 解析单个子条件（seed:、cell:、random:、calc:、max:、min:）
   * @param {string} subCondition - 子条件字符串，如 "seed:战斗" 或 "cell:状态表/主角/魔力值 > 30" 或 "random:dice > 3"
   * @param {object} context - 上下文对象，包含 seedContent, allTablesJson, plotContent
   * @returns {boolean} - 是否满足条件
   */
  function evaluateSubCondition_ACU(subCondition, context) {
    if (!subCondition || typeof subCondition !== 'string') return false;
    
    const trimmed = subCondition.trim();
    if (!trimmed) return false;
    
    // 检查是否是取反条件（以 ! 开头）
    let isNegated = false;
    let actualCondition = trimmed;
    
    if (trimmed.startsWith('!')) {
      isNegated = true;
      actualCondition = trimmed.slice(1).trim();
    }
    
    // 解析子条件类型
    if (actualCondition.startsWith('seed:')) {
      // 关键词匹配
      const keywordExpr = actualCondition.slice(5).trim(); // 去掉 "seed:" 前缀
      let result = evaluateSeedExpression_ACU(keywordExpr, context.seedContent || '', context.plotContent || '');
      return isNegated ? !result : result;
      
    } else if (actualCondition.startsWith('cell:')) {
      // 表格数值比较
      const cellExpr = actualCondition.slice(5).trim(); // 去掉 "cell:" 前缀
      let result = evaluateCellExpression_ACU(cellExpr, context.allTablesJson);
      return isNegated ? !result : result;
      
    } else if (actualCondition.startsWith('random:')) {
      // 随机数条件判断
      const randomExpr = actualCondition.slice(7).trim(); // 去掉 "random:" 前缀
      let result = evaluateRandomExpression_ACU(randomExpr);
      return isNegated ? !result : result;
      
    } else if (actualCondition.startsWith('calc:')) {
      // 计算变量条件判断
      const calcExpr = actualCondition.slice(5).trim(); // 去掉 "calc:" 前缀
      let result = evaluateCalcCondition_ACU(calcExpr);
      return isNegated ? !result : result;
      
    } else if (actualCondition.startsWith('max:')) {
      // 最大值变量条件判断
      const maxExpr = actualCondition.slice(4).trim(); // 去掉 "max:" 前缀
      let result = evaluateMaxCondition_ACU(maxExpr);
      return isNegated ? !result : result;
      
    } else if (actualCondition.startsWith('min:')) {
      // 最小值变量条件判断
      const minExpr = actualCondition.slice(4).trim(); // 去掉 "min:" 前缀
      let result = evaluateMinCondition_ACU(minExpr);
      return isNegated ? !result : result;
      
    } else {
      // 尝试作为关键词匹配（向后兼容，不带前缀的情况）
      logWarn_ACU('[条件模板] 子条件缺少前缀，默认作为关键词匹配:', actualCondition);
      let result = evaluateSeedExpression_ACU(actualCondition, context.seedContent || '', context.plotContent || '');
      return isNegated ? !result : result;
    }
  }

  /**
   * 解析计算变量条件表达式
   * 格式：calc:id > 50
   * @param {string} expression - 计算变量条件表达式
   * @returns {boolean} - 是否满足条件
   */
  function evaluateCalcCondition_ACU(expression) {
    if (!expression || typeof expression !== 'string') return false;
    
    // 规范化运算符（支持全角符号）
    const expr = normalizeOperators_ACU(expression).trim();
    if (!expr) return false;
    
    // 支持的比较运算符：>=、<=、!=、==、>、<
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    
    let matchedOperator = null;
    let varRef = '';
    let compareValue = '';
    
    // 查找匹配的运算符
    for (const op of operators) {
      const opIndex = expr.indexOf(op);
      if (opIndex !== -1) {
        varRef = expr.substring(0, opIndex).trim();
        compareValue = expr.substring(opIndex + op.length).trim();
        matchedOperator = op;
        break;
      }
    }
    
    if (!matchedOperator) {
      logWarn_ACU('[条件模板] evaluateCalcCondition_ACU: 未找到有效的比较运算符, expression=', expression);
      return false;
    }
    
    // 获取计算变量值
    const calcValue = getCalcVariable_ACU(varRef);
    if (calcValue === null) {
      logWarn_ACU('[条件模板] evaluateCalcCondition_ACU: 未找到计算变量:', varRef);
      return false;
    }
    
    // 执行比较
    const numCompareValue = parseFloat(compareValue);
    if (isNaN(numCompareValue)) {
      logWarn_ACU('[条件模板] evaluateCalcCondition_ACU: 无效的比较值:', compareValue);
      return false;
    }
    
    return compareValue_ACU(calcValue, matchedOperator, numCompareValue);
  }

  /**
   * 解析最大值变量条件表达式
   * 格式：max:id > 50
   * @param {string} expression - 最大值变量条件表达式
   * @returns {boolean} - 是否满足条件
   */
  function evaluateMaxCondition_ACU(expression) {
    if (!expression || typeof expression !== 'string') return false;
    
    // 规范化运算符（支持全角符号）
    const expr = normalizeOperators_ACU(expression).trim();
    if (!expr) return false;
    
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    
    let matchedOperator = null;
    let varRef = '';
    let compareValue = '';
    
    for (const op of operators) {
      const opIndex = expr.indexOf(op);
      if (opIndex !== -1) {
        varRef = expr.substring(0, opIndex).trim();
        compareValue = expr.substring(opIndex + op.length).trim();
        matchedOperator = op;
        break;
      }
    }
    
    if (!matchedOperator) {
      logWarn_ACU('[条件模板] evaluateMaxCondition_ACU: 未找到有效的比较运算符, expression=', expression);
      return false;
    }
    
    const maxValue = getMaxVariable_ACU(varRef);
    if (maxValue === null) {
      logWarn_ACU('[条件模板] evaluateMaxCondition_ACU: 未找到最大值变量:', varRef);
      return false;
    }
    
    const numCompareValue = parseFloat(compareValue);
    if (isNaN(numCompareValue)) {
      logWarn_ACU('[条件模板] evaluateMaxCondition_ACU: 无效的比较值:', compareValue);
      return false;
    }
    
    return compareValue_ACU(maxValue, matchedOperator, numCompareValue);
  }

  /**
   * 解析最小值变量条件表达式
   * 格式：min:id < 50
   * @param {string} expression - 最小值变量条件表达式
   * @returns {boolean} - 是否满足条件
   */
  function evaluateMinCondition_ACU(expression) {
    if (!expression || typeof expression !== 'string') return false;
    
    // 规范化运算符（支持全角符号）
    const expr = normalizeOperators_ACU(expression).trim();
    if (!expr) return false;
    
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    
    let matchedOperator = null;
    let varRef = '';
    let compareValue = '';
    
    for (const op of operators) {
      const opIndex = expr.indexOf(op);
      if (opIndex !== -1) {
        varRef = expr.substring(0, opIndex).trim();
        compareValue = expr.substring(opIndex + op.length).trim();
        matchedOperator = op;
        break;
      }
    }
    
    if (!matchedOperator) {
      logWarn_ACU('[条件模板] evaluateMinCondition_ACU: 未找到有效的比较运算符, expression=', expression);
      return false;
    }
    
    const minValue = getMinVariable_ACU(varRef);
    if (minValue === null) {
      logWarn_ACU('[条件模板] evaluateMinCondition_ACU: 未找到最小值变量:', varRef);
      return false;
    }
    
    const numCompareValue = parseFloat(compareValue);
    if (isNaN(numCompareValue)) {
      logWarn_ACU('[条件模板] evaluateMinCondition_ACU: 无效的比较值:', compareValue);
      return false;
    }
    
    return compareValue_ACU(minValue, matchedOperator, numCompareValue);
  }

  /**
   * 解析随机数条件表达式
   * 支持两种格式：
   * 1. random:id > 50 - 引用已生成的随机数变量
   * 2. random:1-100 > 50 - 内联随机数（生成并判断）
   * @param {string} expression - 随机数条件表达式
   * @returns {boolean} - 是否满足条件
   */
  function evaluateRandomExpression_ACU(expression) {
    if (!expression || typeof expression !== 'string') return false;
    
    // 规范化运算符（支持全角符号）
    const expr = normalizeOperators_ACU(expression).trim();
    if (!expr) return false;
    
    // 支持的比较运算符：>=、<=、!=、==、>、<
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    
    let matchedOperator = null;
    let randomRef = '';
    let compareValue = '';
    
    // 查找匹配的运算符
    for (const op of operators) {
      const opIndex = expr.indexOf(op);
      if (opIndex !== -1) {
        randomRef = expr.substring(0, opIndex).trim();
        compareValue = expr.substring(opIndex + op.length).trim();
        matchedOperator = op;
        break;
      }
    }
    
    if (!matchedOperator) {
      logWarn_ACU('[条件模板] evaluateRandomExpression_ACU: 未找到有效的比较运算符, expression=', expression);
      return false;
    }
    
    // 获取随机数值
    let randomValue = null;
    
    // 检查是否是内联随机数格式（如 1-100）
    const inlineMatch = randomRef.match(/^(\d+)-(\d+)$/);
    if (inlineMatch) {
      // 内联随机数：生成并判断
      const min = parseInt(inlineMatch[1], 10);
      const max = parseInt(inlineMatch[2], 10);
      if (!isNaN(min) && !isNaN(max)) {
        randomValue = Math.floor(Math.random() * (Math.abs(max - min) + 1)) + Math.min(min, max);
        logDebug_ACU('[条件模板] 内联随机数生成:', randomValue, '范围:', min, '-', max);
      }
    } else {
      // 引用随机数变量
      randomValue = getRandomVariable_ACU(randomRef);
      if (randomValue === null) {
        logWarn_ACU('[条件模板] evaluateRandomExpression_ACU: 未找到随机数变量:', randomRef);
        return false;
      }
    }
    
    // 执行比较
    const numCompareValue = parseFloat(compareValue);
    if (isNaN(numCompareValue)) {
      logWarn_ACU('[条件模板] evaluateRandomExpression_ACU: 无效的比较值:', compareValue);
      return false;
    }
    
    return compareValue_ACU(randomValue, matchedOperator, numCompareValue);
  }

  /**
   * 解析统一条件表达式（支持括号分组、& 和 , 运算符）
   * 运算优先级：括号 > & (AND) > , (OR)
   * @param {string} expression - 条件表达式
   * @param {object} context - 上下文对象
   * @returns {boolean} - 是否满足条件
   */
  function evaluateCondExpression_ACU(expression, context) {
    if (!expression || typeof expression !== 'string') return false;
    
    const expr = expression.trim();
    if (!expr) return false;
    
    // 使用递归下降解析器处理表达式
    // 语法：Expression = OrExpr
    //        OrExpr = AndExpr (',' AndExpr)*
    //        AndExpr = Primary ('&' Primary)*
    //        Primary = '(' Expression ')' | SubCondition
    //        SubCondition = ('!'? ('seed:' | 'cell:')? [^()&,]+)
    
    let pos = 0;
    
    // 跳过空白
    const skipWhitespace = () => {
      while (pos < expr.length && /\s/.test(expr[pos])) {
        pos++;
      }
    };
    
    // 解析或表达式（最低优先级）
    const parseOrExpr = () => {
      skipWhitespace();
      let result = parseAndExpr();
      
      while (pos < expr.length) {
        skipWhitespace();
        if (expr[pos] === ',') {
          pos++; // 跳过 ','
          skipWhitespace();
          const right = parseAndExpr();
          result = result || right; // OR 逻辑
        } else {
          break;
        }
      }
      
      return result;
    };
    
    // 解析与表达式
    const parseAndExpr = () => {
      skipWhitespace();
      let result = parsePrimary();
      
      while (pos < expr.length) {
        skipWhitespace();
        if (expr[pos] === '&') {
          pos++; // 跳过 '&'
          skipWhitespace();
          const right = parsePrimary();
          result = result && right; // AND 逻辑
        } else {
          break;
        }
      }
      
      return result;
    };
    
    // 解析基本元素（括号表达式或子条件）
    const parsePrimary = () => {
      skipWhitespace();
      
      if (pos >= expr.length) return false;
      
      // 检查是否是取反操作（!）
      let isNegated = false;
      if (expr[pos] === '!') {
        isNegated = true;
        pos++; // 跳过 '!'
        skipWhitespace();
      }
      
      // 括号表达式
      if (expr[pos] === '(') {
        pos++; // 跳过 '('
        skipWhitespace();
        const result = parseOrExpr();
        skipWhitespace();
        if (pos < expr.length && expr[pos] === ')') {
          pos++; // 跳过 ')'
        }
        return isNegated ? !result : result;
      }
      
      // 子条件：提取直到遇到运算符或括号
      let subCond = '';
      while (pos < expr.length && expr[pos] !== '(' && expr[pos] !== ')' && expr[pos] !== '&' && expr[pos] !== ',') {
        subCond += expr[pos];
        pos++;
      }
      
      const result = evaluateSubCondition_ACU(subCond, context);
      return isNegated ? !result : result;
    };
    
    try {
      const result = parseOrExpr();
      skipWhitespace();
      return result;
    } catch (e) {
      logError_ACU('[条件模板] evaluateCondExpression_ACU 解析出错:', e, 'expression:', expression);
      return false;
    }
  }

  /**
   * 解析条件模板，根据关键词匹配或表格数值比较决定是否包含条件提示词内容
   * 支持三种语法：
   * 1. <if seed="关键词表达式">内容</if> - 关键词匹配
   * 2. <if cell="表格名/行名/列名 > 50">内容</if> - 表格数值比较
   * 3. <if cond="条件表达式">内容</if> - 统一条件表达式（新增）
   * @param {string} templateContent - 包含条件模板的提示词内容
   * @param {string} seedContent - 用于关键词检测的内容（表格内容）
   * @param {object} allTablesJson - 完整的表格数据对象（用于表格数值比较）
   * @param {string} plotContent - 上轮规划数据（$6），用于关键词检测
   * @returns {string} - 解析后的提示词内容
   */
  function parseConditionalTemplate_ACU(templateContent, seedContent, allTablesJson, plotContent = '') {
    if (!templateContent || typeof templateContent !== 'string') {
      return templateContent || '';
    }
    
    if (!seedContent || typeof seedContent !== 'string') {
      seedContent = '';
    }
    
    if (!plotContent || typeof plotContent !== 'string') {
      plotContent = '';
    }
    
    // 构建上下文对象
    const context = { seedContent, allTablesJson, plotContent };
    
    // 正则匹配 <if seed="表达式">内容</if> 或 <if cell="表达式">内容</if> 或 <if cond="表达式">内容</if>
    // 使用非贪婪匹配，支持多行内容
    const ifRegex = /<if\s+(seed|cell|cond)\s*=\s*"([^"]*)"\s*>([\s\S]*?)<\/if>/gi;
    
    let result = templateContent;
    let match;
    
    // 收集所有匹配项并处理
    const matches = [];
    while ((match = ifRegex.exec(templateContent)) !== null) {
      matches.push({
        fullMatch: match[0],
        type: match[1].toLowerCase(), // 'seed'、'cell' 或 'cond'
        expression: match[2],
        content: match[3],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    
    // 从后向前替换，避免索引偏移问题
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      let shouldInclude = false;
      
      if (m.type === 'seed') {
        // 关键词匹配（在表格内容和上轮规划数据中查找）
        shouldInclude = evaluateSeedExpression_ACU(m.expression, seedContent, plotContent);
      } else if (m.type === 'cell') {
        // 表格数值比较
        shouldInclude = evaluateCellExpression_ACU(m.expression, allTablesJson);
      } else if (m.type === 'cond') {
        // 统一条件表达式（支持 seed: 和 cell: 混合，支持括号分组）
        shouldInclude = evaluateCondExpression_ACU(m.expression, context);
      }
      
      if (shouldInclude) {
        // 匹配成功，保留条件提示词内容（不包含包裹符号）
        result = result.slice(0, m.startIndex) + m.content + result.slice(m.endIndex);
      } else {
        // 匹配失败，移除整个条件模板块
        result = result.slice(0, m.startIndex) + result.slice(m.endIndex);
      }
    }
    
    return result;
  }

  /**
   * 解析条件模板（支持 else 和嵌套）
   * 递归解析 <if ...>...</if> 结构，支持 <else> 分支和嵌套条件
   * @param {string} content - 包含条件模板的内容
   * @param {object} context - 上下文对象，包含 seedContent 和 allTablesJson
   * @param {number} depth - 当前递归深度
   * @returns {string} - 解析后的内容
   */
  export function parseIfBlockRecursive_ACU(content, context, depth = 0) {
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    // 防止无限递归
    const maxDepth = settings_ACU?.promptTemplateSettings?.maxNestingDepth || 10;
    if (depth > maxDepth) {
      logWarn_ACU(`[条件模板] 超过最大嵌套深度 ${maxDepth}，停止解析`);
      return content;
    }
    
    // 使用正则匹配最外层的 <if ...>...</if>
    // 注意：这个正则需要处理嵌套，所以我们使用一个更智能的方法
    const result = parseIfBlocksInContent_ACU(content, context, depth);
    
    return result;
  }

  /**
   * 解析内容中的所有 if 块（支持嵌套）
   * @param {string} content - 内容
   * @param {object} context - 上下文
   * @param {number} depth - 当前深度
   * @returns {string} - 解析后的内容
   */
  export function parseIfBlocksInContent_ACU(content, context, depth) {
    let result = '';
    let currentIndex = 0;
    
    while (currentIndex < content.length) {
      // 查找下一个 <if 开始标签
      // 支持三种格式：
      // 1. <if seed="表达式">
      // 2. <if cell="表达式">
      // 3. <if cond="表达式"> (新增)
      const ifStartMatch = content.slice(currentIndex).match(/<if\s+(seed|cell|cond)\s*=\s*"([^"]*)"\s*>/i);
      
      if (!ifStartMatch) {
        // 没有更多的 if 块，添加剩余内容
        result += content.slice(currentIndex);
        break;
      }
      
      // 添加 if 标签之前的内容
      const ifStartIndex = currentIndex + ifStartMatch.index;
      result += content.slice(currentIndex, ifStartIndex);
      
      // 解析这个 if 块
      const ifBlock = parseSingleIfBlock_ACU(
        content,
        ifStartIndex,
        ifStartMatch[1], // type
        ifStartMatch[2], // expression
        context,
        depth
      );
      
      if (ifBlock) {
        result += ifBlock.content;
        currentIndex = ifBlock.endIndex;
      } else {
        // 解析失败，跳过这个标签
        result += ifStartMatch[0];
        currentIndex = ifStartIndex + ifStartMatch[0].length;
      }
    }
    
    return result;
  }

  /**
   * 解析单个 if 块（包括 else 分支和嵌套）
   * @param {string} content - 完整内容
   * @param {number} startIndex - if 块开始索引
   * @param {string} type - 条件类型 (seed、cell 或 cond)
   * @param {string} expression - 条件表达式
   * @param {object} context - 上下文
   * @param {number} depth - 当前深度
   * @returns {object|null} - { content: 解析后的内容, endIndex: 结束索引 }
   */
  function parseSingleIfBlock_ACU(content, startIndex, type, expression, context, depth) {
    // 找到 if 开始标签的结束位置
    // 支持 seed、cell、cond 三种类型
    const ifStartMatch = content.slice(startIndex).match(/<if\s+(?:seed|cell|cond)\s*=\s*"[^"]*"\s*>/i);
    if (!ifStartMatch) return null;
    
    const ifStartTagEnd = startIndex + ifStartMatch[0].length;
    
    // 查找匹配的 </if> 结束标签（需要处理嵌套）
    let nestingLevel = 1;
    let currentIndex = ifStartTagEnd;
    let elseIndex = -1;
    
    while (currentIndex < content.length && nestingLevel > 0) {
      // 查找下一个 <if 或 </if> 或 <else>
      const remainingContent = content.slice(currentIndex);
      
      // 匹配嵌套的 <if 开始标签（支持 seed、cell、cond 三种类型）
      const nestedIfMatch = remainingContent.match(/<if\s+(?:seed|cell|cond)\s*=\s*"[^"]*"\s*>/i);
      // 匹配 </if> 结束标签
      const endIfMatch = remainingContent.match(/<\/if>/i);
      // 匹配 <else> 标签（只在当前层级有效）
      const elseMatch = remainingContent.match(/<else>/i);
      
      // 找到最近的一个
      const positions = [];
      if (nestedIfMatch) positions.push({ type: 'if', index: currentIndex + nestedIfMatch.index, length: nestedIfMatch[0].length });
      if (endIfMatch) positions.push({ type: 'endif', index: currentIndex + endIfMatch.index, length: endIfMatch[0].length });
      if (elseMatch && nestingLevel === 1) positions.push({ type: 'else', index: currentIndex + elseMatch.index, length: elseMatch[0].length });
      
      if (positions.length === 0) {
        // 没有找到任何标签，格式错误
        return null;
      }
      
      // 按索引排序，找到最近的
      positions.sort((a, b) => a.index - b.index);
      const nearest = positions[0];
      
      if (nearest.type === 'if') {
        nestingLevel++;
        currentIndex = nearest.index + nearest.length;
      } else if (nearest.type === 'endif') {
        nestingLevel--;
        if (nestingLevel === 0) {
          // 找到匹配的结束标签
          const ifBody = content.slice(ifStartTagEnd, nearest.index);
          const endIndex = nearest.index + nearest.length;
          
          // 处理 else 分支
          let ifContent, elseContent;
          const elsePos = ifBody.indexOf('<else>');
          if (elsePos !== -1) {
            ifContent = ifBody.slice(0, elsePos);
            elseContent = ifBody.slice(elsePos + 6); // '<else>'.length = 6
          } else {
            ifContent = ifBody;
            elseContent = '';
          }
          
          // 评估条件
          let conditionMet = false;
          const typeLower = type.toLowerCase();
          
          if (typeLower === 'seed') {
            // 关键词匹配（在表格内容和上轮规划数据中查找）
            conditionMet = evaluateSeedExpression_ACU(expression, context.seedContent || '', context.plotContent || '');
          } else if (typeLower === 'cell') {
            // 表格数值比较
            conditionMet = evaluateCellExpression_ACU(expression, context.allTablesJson);
          } else if (typeLower === 'cond') {
            // 统一条件表达式（支持 seed: 和 cell: 混合，支持括号分组）
            conditionMet = evaluateCondExpression_ACU(expression, context);
          }
          
          // 选择内容并递归处理嵌套
          const selectedContent = conditionMet ? ifContent : elseContent;
          const processedContent = parseIfBlocksInContent_ACU(selectedContent, context, depth + 1);
          
          return { content: processedContent, endIndex };
        } else {
          currentIndex = nearest.index + nearest.length;
        }
      } else if (nearest.type === 'else') {
        // 只在 nestingLevel === 1 时记录 else 位置
        currentIndex = nearest.index + nearest.length;
      }
    }
    
    return null;
  }

  /**
   * 获取用于提示词处理的数据库表格数据
   * @returns {object} - 表格数据对象
   */
  function getTableDataForPrompt_ACU() {
    return currentJsonTableData_ACU || {};
  }

  /**
   * 获取最新一条AI消息的正文内容，用于条件模板的 seed 关键词检测
   * @returns {string} - 最新AI消息正文；若不存在则返回空字符串
   */
  export function getLatestAIMessageContent_ACU() {
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) {
      return '';
    }

    for (let i = chat.length - 1; i >= 0; i--) {
      const message = chat[i];
      if (message && !message.is_user) {
        return typeof message.mes === 'string' ? message.mes : '';
      }
    }

    return '';
  }

  /**
   * 处理酒馆提示词（CHAT_COMPLETION_SETTINGS_READY 事件处理）
   * @param {object} data - 事件数据，包含 messages 数组
   */
  export async function handleChatCompletionReady_ACU(data) {
    logDebug_ACU('[提示词模板] handleChatCompletionReady_ACU 被调用');
    logDebug_ACU('[提示词模板] settings_ACU?.promptTemplateSettings:', settings_ACU?.promptTemplateSettings);
    
    // 检查功能是否启用
    if (!settings_ACU?.promptTemplateSettings?.enabled) {
      logDebug_ACU('[提示词模板] 功能未启用，跳过处理');
      return;
    }
    
    if (!data || !data.messages || !Array.isArray(data.messages)) {
      return;
    }
    
    const startTime = Date.now();
    logDebug_ACU('[提示词模板] 开始处理酒馆提示词...');
    
    // 获取最新一层推进数据（$6）
    const lastPlotContent = getPlotFromHistory_ACU();
    logDebug_ACU('[提示词模板] $6 最新一层推进数据:', lastPlotContent ? `长度=${lastPlotContent.length}` : '(空)');
    
    // 获取上下文数据
    const context = {
      seedContent: getLatestAIMessageContent_ACU(),
      allTablesJson: getTableDataForPrompt_ACU(),
      plotContent: lastPlotContent
    };

    const processPromptTemplateContent_ACU = (content) => {
      if (typeof content !== 'string' || !content) {
        return typeof content === 'string' ? content : '';
      }

      let processedContent = content;

      // [随机函数] 先处理随机数标签与随机变量引用，确保正文提示词中也能生效
      processedContent = parseRandomTags_ACU(processedContent);
      processedContent = replaceRandomVariables_ACU(processedContent);

      // [计算变量] 再处理计算/最大值/最小值标签与变量引用
      const contextForCalc = { allTablesJson: context.allTablesJson };
      processedContent = parseCalcTags_ACU(processedContent, contextForCalc);
      processedContent = parseMaxTags_ACU(processedContent, contextForCalc);
      processedContent = parseMinTags_ACU(processedContent, contextForCalc);
      processedContent = replaceCalcVariables_ACU(processedContent);
      processedContent = replaceMaxVariables_ACU(processedContent);
      processedContent = replaceMinVariables_ACU(processedContent);

      // [条件模板] 最后处理 if/else 逻辑
      processedContent = parseIfBlockRecursive_ACU(processedContent, context, 0);
      return processedContent;
    };
    
    // 遍历处理消息
    let processedCount = 0;
    for (const message of data.messages) {
      if (typeof message.content === 'string') {
        const originalContent = message.content;
        message.content = processPromptTemplateContent_ACU(message.content);
        if (message.content !== originalContent) {
          processedCount++;
        }
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            const originalText = part.text;
            part.text = processPromptTemplateContent_ACU(part.text);
            if (part.text !== originalText) {
              processedCount++;
            }
          }
        }
      }
    }
    
    const endTime = Date.now();
    logDebug_ACU(`[提示词模板] 处理完成，共处理 ${processedCount} 个消息块，耗时 ${endTime - startTime}ms`);
  }

  /**
   * 转义正则表达式特殊字符。
   * @param {string} string - 需要转义的字符串.
   * @returns {string} - 转义后的字符串.
   */

  function getNormalizedPlotMessageRole_ACU(role) {
    const ru = String(role || '').toUpperCase();
    if (ru === 'AI' || ru === 'ASSISTANT') return 'assistant';
    if (ru === 'SYSTEM') return 'system';
    if (ru === 'USER') return 'user';
    return String(role || 'user').toLowerCase();
  }

  async function tryRenderPlotTemplateWithEjs_ACU(content) {
    if (!content) return '';
    if ((window as any).EjsTemplate && typeof (window as any).EjsTemplate.evalTemplate === 'function') {
      try {
        const context = await (window as any).EjsTemplate.prepareContext();
        if (typeof (window as any).Mvu !== 'undefined' && (window as any).Mvu.getMvuData) {
          try {
            const mvuObj = (window as any).Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            if (mvuObj && mvuObj.stat_data) {
              context.mvu = mvuObj.stat_data;
            }
          } catch (e) {
            logWarn_ACU('[剧情推进] 获取 MVU 数据失败:', e);
          }
        }
        return await (window as any).EjsTemplate.evalTemplate(content, context);
      } catch (e) {
        logWarn_ACU('[剧情推进] 提示词模板渲染失败，将使用原始文本:', e);
        return content;
      }
    }
    return content;
  }

  function clonePlotTemplateVariableMap_ACU(store) {
    return store && typeof store === 'object' ? { ...store } : {};
  }

  function capturePlotTemplateVariables_ACU() {
    return {
      randomVariables: clonePlotTemplateVariableMap_ACU(randomVariables_ACU),
      calcVariables: clonePlotTemplateVariableMap_ACU(calcVariables_ACU),
      maxVariables: clonePlotTemplateVariableMap_ACU(maxVariables_ACU),
      minVariables: clonePlotTemplateVariableMap_ACU(minVariables_ACU),
    };
  }

  function restorePlotTemplateVariables_ACU(snapshot) {
    randomVariables_ACU = clonePlotTemplateVariableMap_ACU(snapshot?.randomVariables);
    calcVariables_ACU = clonePlotTemplateVariableMap_ACU(snapshot?.calcVariables);
    maxVariables_ACU = clonePlotTemplateVariableMap_ACU(snapshot?.maxVariables);
    minVariables_ACU = clonePlotTemplateVariableMap_ACU(snapshot?.minVariables);
  }

  function runWithIsolatedPlotTemplateVariables_ACU(callback) {
    const previousSnapshot = capturePlotTemplateVariables_ACU();
    restorePlotTemplateVariables_ACU(null);
    try {
      return callback();
    } finally {
      restorePlotTemplateVariables_ACU(previousSnapshot);
    }
  }

  function renderPlotTaskContentWithIsolatedVariables_ACU(content, sharedContext) {
    const contextForCalc = { allTablesJson: sharedContext.allTablesJson };
    const contextForIf = {
      seedContent: sharedContext.seedContentForConditional,
      allTablesJson: sharedContext.allTablesJson,
      plotContent: sharedContext.lastPlotContent || '',
    };

    return runWithIsolatedPlotTemplateVariables_ACU(() => {
      let renderedContent = content;
      renderedContent = parseRandomTags_ACU(renderedContent);
      renderedContent = replaceRandomVariables_ACU(renderedContent);
      renderedContent = parseCalcTags_ACU(renderedContent, contextForCalc);
      renderedContent = parseMaxTags_ACU(renderedContent, contextForCalc);
      renderedContent = parseMinTags_ACU(renderedContent, contextForCalc);
      renderedContent = replaceCalcVariables_ACU(renderedContent);
      renderedContent = replaceMaxVariables_ACU(renderedContent);
      renderedContent = replaceMinVariables_ACU(renderedContent);
      return parseIfBlockRecursive_ACU(renderedContent, contextForIf, 0);
    });
  }

  function extractLastTagContent_ACU(text, rawTagName) {
    if (!text || !rawTagName) return null;
    const tagName = String(rawTagName).trim();
    if (!tagName) return null;

    const lower = String(text).toLowerCase();
    const open = `<${tagName.toLowerCase()}>`;
    const close = `</${tagName.toLowerCase()}>`;

    const closeIdx = lower.lastIndexOf(close);
    if (closeIdx === -1) return null;

    const openIdx = lower.lastIndexOf(open, closeIdx);
    if (openIdx === -1) return null;

    const contentStart = openIdx + open.length;
    return String(text).slice(contentStart, closeIdx);
  }

  function extractPlotTagsFromResponse_ACU(text, extractTags) {
    const tagNames = String(extractTags || '')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    const extractedTags = {};
    const injectedFragments = [];

    tagNames.forEach(tagName => {
      const content = extractLastTagContent_ACU(text, tagName);
      if (content !== null) {
        extractedTags[tagName] = content;
        injectedFragments.push(`<${tagName}>${content}</${tagName}>`);
      }
    });

    return {
      tagNames,
      extractedTags,
      injectedFragments,
    };
  }

  function extractAllTagContents_ACU(text, rawTagName) {
    if (!text || !rawTagName) return [];
    const tagName = String(rawTagName).trim();
    if (!tagName) return [];

    const source = String(text);
    const lower = source.toLowerCase();
    const open = `<${tagName.toLowerCase()}>`;
    const close = `</${tagName.toLowerCase()}>`;
    const contents = [];
    let searchIndex = 0;

    while (searchIndex < lower.length) {
      const openIdx = lower.indexOf(open, searchIndex);
      if (openIdx === -1) break;
      const contentStart = openIdx + open.length;
      const closeIdx = lower.indexOf(close, contentStart);
      if (closeIdx === -1) break;
      contents.push(source.slice(contentStart, closeIdx));
      searchIndex = closeIdx + close.length;
    }

    return contents;
  }

  function getPlotPlaceholderTagNames_ACU(text) {
    const placeholderPattern = /\{\{(\w+)\}\}/g;
    const names = [];
    let match;

    while ((match = placeholderPattern.exec(String(text || ''))) !== null) {
      const tagName = String(match[1] || '').trim();
      if (tagName) names.push(tagName);
    }

    return [...new Set(names)];
  }

  function buildPlotTagMapFromText_ACU(text, requestedTagNames = null) {
    const sourceText = String(text || '');
    const tagMap = new Map();
    if (!sourceText.trim()) return tagMap;

    if (Array.isArray(requestedTagNames) && requestedTagNames.length > 0) {
      [...new Set(requestedTagNames.map(tagName => String(tagName || '').trim()).filter(Boolean))].forEach(tagName => {
        const contents = extractAllTagContents_ACU(sourceText, tagName);
        if (contents.length > 0) {
          tagMap.set(tagName, contents);
        }
      });
      return tagMap;
    }

    const tagPattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let match;
    while ((match = tagPattern.exec(sourceText)) !== null) {
      const tagName = String(match[1] || '').trim();
      if (!tagName) continue;
      if (!tagMap.has(tagName)) tagMap.set(tagName, []);
      tagMap.get(tagName).push(match[2] ?? '');
    }

    return tagMap;
  }

  function buildPlotTagBlock_ACU(tagName, contents) {
    const normalizedTagName = String(tagName || '').trim();
    if (!normalizedTagName) return '';
    const normalizedContents = (Array.isArray(contents) ? contents : [contents]).map(content => content ?? '');
    if (!normalizedContents.length) return '';
    return `<${normalizedTagName}>${normalizedContents.join('\n\n')}</${normalizedTagName}>`;
  }

  function replacePlotTagPlaceholders_ACU(text, tagSourceMap) {
    const sourceText = String(text || '');
    if (!sourceText) return '';
    const placeholderPattern = /\{\{(\w+)\}\}/g;

    return sourceText.replace(placeholderPattern, (placeholder, tagName) => {
      if (!(tagSourceMap instanceof Map)) return '';
      return buildPlotTagBlock_ACU(tagName, tagSourceMap.get(tagName));
    });
  }

  function sortPlotTaskResults_ACU(results) {
    return (Array.isArray(results) ? [...results] : [])
      .filter(Boolean)
      .sort((a, b) => (normalizePositiveInteger_ACU(a?.stage, 1) - normalizePositiveInteger_ACU(b?.stage, 1)) || ((a?.order ?? 0) - (b?.order ?? 0)));
  }

  function aggregatePlotTaskTags_ACU(taskResults) {
    const aggregated = new Map();
    const sortedResults = sortPlotTaskResults_ACU(taskResults);

    sortedResults.forEach(result => {
      if (!result?.success || !result.extractedTags || typeof result.extractedTags !== 'object') return;
      Object.entries(result.extractedTags).forEach(([tagName, content]) => {
        if (!aggregated.has(tagName)) aggregated.set(tagName, []);
        aggregated.get(tagName).push(content ?? '');
      });
    });

    return aggregated;
  }

  function buildAggregatedPlotTagBlocks_ACU(aggregatedTags) {
    if (!(aggregatedTags instanceof Map) || aggregatedTags.size === 0) return '';
    const blocks = [];
    aggregatedTags.forEach((contents, tagName) => {
      const block = buildPlotTagBlock_ACU(tagName, contents);
      if (block) blocks.push(block);
    });
    return blocks.join('\n\n');
  }

  function buildPlotRawFallbackText_ACU(taskResults) {
    const successfulResults = sortPlotTaskResults_ACU(taskResults)
      .filter(result => result?.success && typeof result.rawResponse === 'string' && result.rawResponse.trim());

    if (successfulResults.length === 0) return '';
    if (successfulResults.length === 1) {
      return successfulResults[0].rawResponse.trim();
    }

    return successfulResults
      .map(result => `【剧情任务：${result.taskName || result.taskId || '未命名任务'}】\n${result.rawResponse.trim()}`)
      .join('\n\n');
  }

  function buildPlotSaveContentFromTaskResults_ACU(taskResults) {
    return buildPlotRawFallbackText_ACU(taskResults);
  }

  function buildFinalPlotInjectionMessage_ACU(finalSystemDirectiveContent, taskResults, aggregatedTags) {
    const defaultDirective = '[SYSTEM_DIRECTIVE: You are a storyteller. The following <plot> block is your absolute script for this turn. You MUST follow the <directive> within it to generate the story.]';
    const baseDirective = String(finalSystemDirectiveContent || '').trim() || defaultDirective;
    const rawFallbackText = buildPlotRawFallbackText_ACU(taskResults);
    const placeholderPattern = /\{\{(\w+)\}\}/g;
    const placeholderNames = [];
    let match;

    while ((match = placeholderPattern.exec(baseDirective)) !== null) {
      placeholderNames.push(match[1]);
    }

    if (aggregatedTags instanceof Map && aggregatedTags.size > 0) {
      if (placeholderNames.length > 0) {
        const matchedTags = new Set();
        const finalDirectiveWithTags = baseDirective.replace(placeholderPattern, (placeholder, tagName) => {
          matchedTags.add(tagName);
          const contents = aggregatedTags.get(tagName);
          if (Array.isArray(contents) && contents.length > 0) {
            return `<${tagName}>${contents.map(content => content ?? '').join('\n\n')}</${tagName}>`;
          }
          return '';
        });

        const unusedTagBlocks = [];
        aggregatedTags.forEach((contents, tagName) => {
          if (matchedTags.has(tagName)) return;
          unusedTagBlocks.push(`<${tagName}>${(Array.isArray(contents) ? contents : [contents]).map(content => content ?? '').join('\n\n')}</${tagName}>`);
        });

        return [finalDirectiveWithTags.trim(), unusedTagBlocks.join('\n\n').trim()]
          .filter(Boolean)
          .join('\n');
      }

      const aggregatedTagBlocks = buildAggregatedPlotTagBlocks_ACU(aggregatedTags);
      return [baseDirective, aggregatedTagBlocks].filter(Boolean).join('\n');
    }

    if (placeholderNames.length > 0) {
      const finalDirectiveWithoutTags = baseDirective.replace(placeholderPattern, '');
      return [finalDirectiveWithoutTags.trim(), rawFallbackText].filter(Boolean).join('\n');
    }

    return [baseDirective, rawFallbackText].filter(Boolean).join('\n');
  }

  function checkPlotAbortRequested_ACU() {
    if (abortController_ACU && abortController_ACU.signal.aborted) {
      throw new Error('TaskAbortedByUser');
    }
  }

  function willPlotUseMainApiGenerateRaw_ACU() {
    try {
      const apiPresetConfig: any = getApiConfigByPreset_ACU(settings_ACU.plotApiPreset) || {};
      const effectiveApiMode = apiPresetConfig.apiMode ?? settings_ACU.apiMode;
      const effectiveApiConfig = apiPresetConfig.apiConfig || settings_ACU.apiConfig || {};
      return effectiveApiMode !== 'tavern' && !!effectiveApiConfig.useMainApi;
    } catch (e) {
      return settings_ACU.apiMode !== 'tavern' && !!settings_ACU.useMainApi;
    }
  }

  function sortPlotTasksForRuntime_ACU(tasks) {
    return (Array.isArray(tasks) ? [...tasks] : [])
      .filter(Boolean)
      .sort((a, b) => (normalizePositiveInteger_ACU(a?.stage, 1) - normalizePositiveInteger_ACU(b?.stage, 1)) || ((a?.order ?? 0) - (b?.order ?? 0)));
  }

  function groupPlotTasksByStage_ACU(tasks) {
    const stageGroups = [];
    sortPlotTasksForRuntime_ACU(tasks).forEach(task => {
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

  function getEnabledPlotTasks_ACU(plotSettings) {
    return sortPlotTasksForRuntime_ACU(
      normalizePlotTasks_ACU(plotSettings)
        .filter(task => task && task.enabled !== false),
    );
  }

  async function buildPlotSharedContext_ACU(plotSettings, userMessage, runtimeOptions: any = {}) {
    const chat = SillyTavern_API_ACU.chat || [];
    const contextTurnCount = plotSettings.contextTurnCount ?? 1;
    let slicedContext = [];

    if (contextTurnCount > 0) {
      let aiCount = 0;
      const extracted = [];

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
    const filterPlotInjectedContent = (value, placeholderKey = '') => {
      const text = value !== undefined && value !== null ? String(value) : '';
      if (!['$1', '$5', '$6', '$7', '$8', '$U', '$C'].includes(placeholderKey)) return text;
      return applyExcludeRulesToText_ACU(text, { excludeRules: plotExcludeRules, excludeTags: plotExcludeTags });
    };

    const sanitizeHtml = htmlString => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlString;
      return tempDiv.textContent || tempDiv.innerText || '';
    };

    const formattedHistory = (slicedContext && Array.isArray(slicedContext) ? slicedContext : [])
      .map(msg => `assistant："${sanitizeHtml(msg.content)}"`)
      .join(' \n ');

    const contextInjectionText = formattedHistory && formattedHistory.trim()
      ? `以下是前文的故事发展（AI输出），给你用作参考：\n ${formattedHistory}`
      : '';

    let userInfoContent_Plot = '';
    try {
      const stContext = (window as any).SillyTavern?.getContext?.();
      userInfoContent_Plot = stContext?.powerUserSettings?.persona_description
        || (window as any).power_user?.persona_description
        || SillyTavern_API_ACU?.powerUserSettings?.persona_description
        || '';
      logDebug_ACU(`[剧情推进] $U (persona_description) 获取结果: ${userInfoContent_Plot ? '成功' : '为空'}`);
    } catch (e) {
      logWarn_ACU('[剧情推进] 获取用户设定描述时出错:', e);
      userInfoContent_Plot = '';
    }

    let charInfoContent_Plot = '';
    try {
      const stContext = (window as any).SillyTavern?.getContext?.();
      let character = null;
      if (TavernHelper_API_ACU?.getCharData) {
        character = TavernHelper_API_ACU.getCharData('current');
      }
      if (!character) {
        character = SillyTavern_API_ACU?.characters?.[SillyTavern_API_ACU?.this_chid]
          || stContext?.characters?.[stContext?.characterId]
          || (typeof (window as any).characters !== 'undefined' && typeof (window as any).this_chid !== 'undefined' ? (window as any).characters[(window as any).this_chid] : null);
      }

      charInfoContent_Plot = character?.description
        || character?.data?.description
        || stContext?.name2_description
        || '';
      logDebug_ACU(`[剧情推进] $C (char_description) 获取结果: ${charInfoContent_Plot ? '成功，长度=' + charInfoContent_Plot.length : '为空'}`);
    } catch (e) {
      logWarn_ACU('[剧情推进] 获取角色描述时出错:', e);
      charInfoContent_Plot = '';
    }

    const replacements = {
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

    const performReplacements = text => {
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

  async function renderPlotTaskMessages_ACU(task, sharedContext, runtimeOptions: any = {}) {
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

  async function executeSinglePlotTask_ACU(task, sharedContext, runtimeOptions: any = {}) {
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
        error: null,
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
        injectedFragments: [],
        error: error?.message || '任务执行失败。',
        stage: taskStage,
        order: normalizedTask.order ?? 0,
      };
    }
  }

  async function runPlotTasksRuntime_ACU(plotSettings, userMessage, runtimeOptions: any = {}) {
    const { inputForHash = userMessage, $toast = null, hasExistingUserMessage = false } = runtimeOptions;

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

    try {
      if ($toast?.find) {
        $toast.find('.toastr-message').text(`正在读取过往的记忆并分析，请稍后...（共 ${enabledTasks.length} 个任务，${stageGroups.length} 个阶段）`);
      }
    } catch (e) {}

    const sharedContext = await buildPlotSharedContext_ACU(plotSettings, userMessage, {
      inputForHash,
      hasExistingUserMessage,
    });
    checkPlotAbortRequested_ACU();

    const willUseMainApiGenerateRaw = willPlotUseMainApiGenerateRaw_ACU();
    const successfulResults = [];
    const failedResults = [];
    let aggregatedTags = new Map();

    for (let stageIndex = 0; stageIndex < stageGroups.length; stageIndex++) {
      const stageGroup = stageGroups[stageIndex];
      try {
        if ($toast?.find) {
          $toast.find('.toastr-message').text(`正在读取过往的记忆并分析，请稍后...（第 ${stageIndex + 1}/${stageGroups.length} 阶段，阶段号 ${stageGroup.stage}，本阶段 ${stageGroup.tasks.length} 个任务）`);
        }
      } catch (e) {}

      const stageResults = await Promise.all(
        stageGroup.tasks.map(task =>
          executeSinglePlotTask_ACU(task, sharedContext, {
            willUseMainApiGenerateRaw,
            relayTagMap: aggregatedTags,
            useHistoryRelay: stageIndex === 0,
          }),
        ),
      );
      checkPlotAbortRequested_ACU();

      const stageSuccessfulResults = stageResults.filter(result => result?.success);
      const stageFailedResults = stageResults.filter(result => result && !result.success);
      successfulResults.push(...stageSuccessfulResults);
      failedResults.push(...stageFailedResults);

      if (stageFailedResults.length > 0) {
        stageFailedResults.forEach(result => {
          logWarn_ACU(
            `[剧情推进] [阶段:${result.stage ?? stageGroup.stage}] [任务:${result.taskName || result.taskId || '未命名任务'}] 未产出有效结果: ${result.error || '未知错误'}`,
          );
        });
        const failedTaskNames = stageFailedResults.map(result => result.taskName || result.taskId || '未命名任务').join('、');
        return {
          finalMessage: null,
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
        finalMessage: null,
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

  /**
   * 加载上次使用的预设到全局设置，并清除当前角色卡上冲突的陈旧设置。
   * 这是为了确保在切换角色或新开对话时，预设能够被正确应用，而不是被角色卡上的"幽灵数据"覆盖。
   */
  export async function loadPresetAndCleanCharacterData_ACU() {
    const plotSettings = settings_ACU.plotSettings;
    if (!plotSettings) return;

    ensurePlotTasksCompat_ACU(plotSettings, { syncLegacy: true });
    ensurePlotPresetBindingsStore_ACU();

    const chatScopeState = getCurrentChatPlotScopeState_ACU();
    if (chatScopeState?.snapshot) {
      logDebug_ACU(`[剧情推进] Applying chat override snapshot for chat "${currentChatFileIdentifier_ACU || 'unknown'}".`);
      replaceCurrentPlotSettingsWithSnapshot_ACU(plotSettings, chatScopeState.snapshot);
      _set_currentPlotTaskEditorId_ACU('');
      syncCurrentEditablePlotPresetState_ACU({ source: 'load_chat_override' });

      if (clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU)) {
        logDebug_ACU('[剧情推进] Cleared legacy plotPresetBindings entry because chat metadata override is authoritative.');
      }

      saveSettings_ACU();
      logDebug_ACU('[剧情推进] Chat override snapshot restored from chat history.');
      return;
    }

    let globalPresetName = normalizePlotPresetSelectionValue_ACU(plotSettings.lastUsedPresetName || '');
    let globalPresetToLoad = findPlotPresetByName_ACU(globalPresetName);
    if (globalPresetName && !globalPresetToLoad) {
      logWarn_ACU(`[剧情推进] Global preset "${globalPresetName}" no longer exists. Falling back to default preset.`);
      globalPresetName = '';
      plotSettings.lastUsedPresetName = '';
    }

    const legacyBinding = getPlotPresetBindingForChat_ACU();
    if (legacyBinding) {
      const legacyPresetName = normalizePlotPresetSelectionValue_ACU(legacyBinding.presetName || '');
      const bindingMatchesGlobal = legacyPresetName === globalPresetName;
      const bindingIsImplicitInherit = legacyBinding.isExplicit !== true || legacyBinding.source === 'inherit';

      if (bindingIsImplicitInherit || bindingMatchesGlobal) {
        if (clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU)) {
          logDebug_ACU('[剧情推进] Cleared legacy inherit-style plot preset binding for current chat.');
        }
      } else {
        const legacyPresetToLoad = findPlotPresetByName_ACU(legacyPresetName);
        const canMigrateToChatSnapshot = isDefaultPlotPresetSelection_ACU(legacyPresetName) || !!legacyPresetToLoad;

        if (canMigrateToChatSnapshot) {
          if (legacyPresetToLoad) {
            logDebug_ACU(`[剧情推进] Migrating legacy binding to chat snapshot for chat "${currentChatFileIdentifier_ACU || 'unknown'}": "${legacyPresetName}"`);
            applyPlotPresetToSettings_ACU(plotSettings, legacyPresetToLoad);
          } else {
            logDebug_ACU(`[剧情推进] Migrating legacy default binding to chat snapshot for chat "${currentChatFileIdentifier_ACU || 'unknown'}".`);
            resetPlotSettingsToDefault_ACU(plotSettings);
          }

          _set_currentPlotTaskEditorId_ACU('');
          const migratedScopeState = buildChatPlotScopeStateFromSettings_ACU(plotSettings, {
            presetName: legacyPresetName,
            source: `legacy_binding_${legacyBinding.source || 'inherit'}`,
            originGlobalName: globalPresetName,
            originGlobalRevision: getPlotGlobalRevision_ACU(),
            updatedAt: legacyBinding.updatedAt || Date.now(),
          });

          if (migratedScopeState) {
            setCurrentChatPlotScopeState_ACU(migratedScopeState, { reason: 'migrate_legacy_plot_binding' });
            clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU);
            syncCurrentEditablePlotPresetState_ACU({ source: 'migrate_legacy_plot_binding' });
            saveSettings_ACU();

            if (typeof SillyTavern_API_ACU?.saveChat === 'function') {
              try {
                await SillyTavern_API_ACU.saveChat();
              } catch (error) {
                logWarn_ACU('[剧情推进] 保存迁移后的聊天级剧情推进快照失败:', error);
              }
            }

            logDebug_ACU('[剧情推进] Legacy plotPresetBindings entry migrated to chat metadata snapshot.');
            return;
          }
        }

        logWarn_ACU(`[剧情推进] Legacy binding preset "${legacyPresetName}" could not be migrated. Falling back to inherit global/default.`);
        clearPlotPresetBindingForChat_ACU(currentChatFileIdentifier_ACU);
      }
    }

    if (globalPresetToLoad) {
      logDebug_ACU(`[剧情推进] Applying inherited global preset for chat "${currentChatFileIdentifier_ACU || 'unknown'}": "${globalPresetName}"`);
      applyPlotPresetToSettings_ACU(plotSettings, globalPresetToLoad);
    } else {
      logDebug_ACU(`[剧情推进] Applying inherited default preset for chat "${currentChatFileIdentifier_ACU || 'unknown'}".`);
      resetPlotSettingsToDefault_ACU(plotSettings);
    }

    _set_currentPlotTaskEditorId_ACU('');
    syncCurrentEditablePlotPresetState_ACU({ source: globalPresetToLoad ? 'load_inherit_global' : 'load_inherit_default' });
    saveSettings_ACU();


    logDebug_ACU('[剧情推进] Current chat is inheriting the active global plot preset state.');
  }

  /**
   * 开始自动化循环
   */
  export async function startAutoLoop_ACU() {
    const plotSettings = settings_ACU.plotSettings;
    
    // 确保循环提示词格式正确（兼容旧版本）
    ensureLoopPromptsArray_ACU(plotSettings);
    
    const loopSettings = plotSettings.loopSettings;
    const loopDuration = (loopSettings.loopTotalDuration || 0) * 60 * 1000;

    // 检查是否有有效的提示词
    if (!loopSettings.quickReplyContent || !Array.isArray(loopSettings.quickReplyContent) || loopSettings.quickReplyContent.length === 0) {
      showToastr_ACU('error', '请先添加至少一个循环提示词', '无法启动循环');
      stopAutoLoop_ACU();
      return;
    }
    
    // 重置索引到第一个
    loopSettings.currentPromptIndex = 0;

    if (loopDuration <= 0) {
        showToastr_ACU('error', '请设置有效的总倒计时 (大于0分钟)', '无法启动循环');
        stopAutoLoop_ACU();
        return;
    }

    loopState_ACU.isLooping = true;
    loopState_ACU.isRetrying = false; // 初始状态非重试
    loopState_ACU.startTime = Date.now();
    loopState_ACU.totalDuration = loopDuration;
    loopState_ACU.retryCount = 0; // 重置重试计数

    logDebug_ACU('[剧情推进] Auto Loop Started. Duration: ' + loopDuration + 'ms');

    // 更新UI状态
    updateLoopUIStatus_ACU(true);

    // 启动倒计时更新
    loopState_ACU.tickInterval = setInterval(() => {
        const elapsed = Date.now() - loopState_ACU.startTime;
        const remaining = Math.max(0, loopState_ACU.totalDuration - elapsed);

        if (remaining <= 0) {
            stopAutoLoop_ACU();
            showToastr_ACU('info', '总倒计时结束，自动化循环已停止。', '循环结束');
            return;
        }

        // 格式化剩余时间 mm:ss
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        // 更新倒计时显示
        updateLoopTimerDisplay_ACU(formatted);
    }, 1000);

    // 立即触发一次生成
    triggerLoopGeneration_ACU();
  }
  // [T180] updateLoopUIStatus_ACU, updateLoopTimerDisplay_ACU 已移到 presentation/triggers/settings-ui-sync.ts

  /**
   * 停止自动化循环
   */
  export function stopAutoLoop_ACU() {
    loopState_ACU.isLooping = false;
    loopState_ACU.isRetrying = false; // 确保停止时重置重试状态
    loopState_ACU.awaitingReply = false;
    if (loopState_ACU.timerId) {
      clearTimeout(loopState_ACU.timerId);
      loopState_ACU.timerId = null;
    }
    if (loopState_ACU.tickInterval) {
        clearInterval(loopState_ACU.tickInterval);
        loopState_ACU.tickInterval = null;
    }
    // 更新UI状态
    updateLoopUIStatus_ACU(false);
    logDebug_ACU('[剧情推进] Auto Loop Stopped.');
  }

  /**
   * 触发循环中的单次生成
   */
  async function triggerLoopGeneration_ACU() {
    if (!loopState_ACU.isLooping) return;

    const plotSettings = settings_ACU.plotSettings;
    ensureLoopPromptsArray_ACU(plotSettings);
    
    const loopSettings = plotSettings.loopSettings;
    const prompts = loopSettings.quickReplyContent || [];

    if (!prompts || prompts.length === 0) {
      logWarn_ACU('[剧情推进] Loop prompts array is empty, stopping loop.');
      stopAutoLoop_ACU();
      return;
    }

    // 获取当前提示词（循环使用）
    const currentIndex = loopSettings.currentPromptIndex || 0;
    const quickReplyContent = prompts[currentIndex] || prompts[0];
    
    if (!quickReplyContent || !quickReplyContent.trim()) {
      logWarn_ACU('[剧情推进] Current prompt is empty, stopping loop.');
      stopAutoLoop_ACU();
      return;
    }

    // 更新索引，为下次循环做准备（循环到下一个提示词）
    loopSettings.currentPromptIndex = (currentIndex + 1) % prompts.length;
    
    logDebug_ACU(`[剧情推进] 使用提示词 ${currentIndex + 1}/${prompts.length}: ${quickReplyContent.substring(0, 50)}...`);

    // 模拟用户输入并发送
    loopState_ACU.awaitingReply = true;
    setSendTextareaValue_ACU(quickReplyContent);
    ;

    // 给一点时间让UI更新，然后点击发送
    setTimeout(() => {
      if (loopState_ACU.isLooping) {
          if (typeof clickSendButton_ACU === 'function') clickSendButton_ACU();;
      }
    }, 100);
  }

  /**
   * 验证AI回复是否包含所需标签
   * @param {string} content - AI回复内容
   * @param {string} tags - 逗号分隔的标签列表
   * @returns {boolean} - 是否验证通过
   */
  function validateLoopTags_ACU(content, tags) {
      if (!tags || !tags.trim()) return true; // 如果未设置标签，默认通过

      const tagList = tags.split(/[,，]/).map(t => t.trim()).filter(t => t);
      if (tagList.length === 0) return true;

      for (const tag of tagList) {
          if (!content.includes(tag)) {
              logDebug_ACU(`[剧情推进] Loop validation failed: missing tag "${tag}"`);
              return false;
          }
      }
      return true;
  }

  async function triggerDirectRegenerateForLoop_ACU(loopSettings) {
    // 标记：本轮依然在等待回复（重试）
    loopState_ACU.awaitingReply = true;

    // 使用酒馆正规生成入口触发回复，确保消息入库+渲染
    if (window.TavernHelper?.triggerSlash) {
      await window.TavernHelper.triggerSlash('/trigger await=true');
      return;
    }
    if ((window as any).original_TavernHelper_generate) {
      (window as any).original_TavernHelper_generate({ user_input: '' });
      return;
    }
    window.TavernHelper?.generate?.({ user_input: '' });
  }

  export async function enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply }) {
    loopState_ACU.isRetrying = true;
    loopState_ACU.retryCount++;
    const maxRetries = loopSettings.maxRetries ?? 3;

    logDebug_ACU(`[剧情推进] 进入重试流程: ${loopState_ACU.retryCount}/${maxRetries}.`);

    if (loopState_ACU.retryCount > maxRetries) {
      showToastr_ACU('error', `连续失败超过 ${maxRetries} 次，自动化循环已停止。`, '循环中止');
      stopAutoLoop_ACU();
      return;
    }

    // 需要删除AI楼层时，先删最后一条（仅当最后一条确实是AI）
    if (shouldDeleteAiReply) {
      const chat = SillyTavern_API_ACU.chat;
      const last = chat?.length ? chat[chat.length - 1] : null;
      if (last && !last.is_user) {
        logDebug_ACU('[剧情推进] [重试] 删除缺失标签的AI楼层...');
        try {
          if (typeof SillyTavern_API_ACU.deleteLastMessage === 'function') {
            await SillyTavern_API_ACU.deleteLastMessage();
          } else if ((window as any).SillyTavern?.deleteLastMessage) {
            await (window as any).SillyTavern.deleteLastMessage();
          }
        } catch (e) {
          logError_ACU('[剧情推进] 删除楼层失败:', e);
        }
      } else {
        logDebug_ACU('[剧情推进] [重试] 不需要删除：最新楼层不是AI。');
      }
    }

    // 延迟后重试生成
    loopState_ACU.timerId = setTimeout(async () => {
      // 等待系统空闲
      let busyWait = 0;
      while ((window as any).SillyTavern?.generating && busyWait < 20) {
        await new Promise(r => setTimeout(r, 500));
        busyWait++;
      }
      try {
        await triggerDirectRegenerateForLoop_ACU(loopSettings);
      } catch (err) {
        logError_ACU('[剧情推进] [重试] 触发生成失败:', err);
        // 如果仍在循环中，则按重试逻辑继续（不删除楼层，因为没有生成成功）
        if (loopState_ACU.isLooping) {
          await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: false });
        }
      }
    }, (loopSettings.retryDelay || 3) * 1000);
  }

  /**
   * 循环逻辑的核心事件监听器：生成结束时触发
   */
  export async function onLoopGenerationEnded_ACU() {
    if (!loopState_ACU.isLooping) return;
    if (!loopState_ACU.awaitingReply) return;

    // 忽略规划阶段触发的生成结束事件
    if (planningGuard_ACU.inProgress) {
      logDebug_ACU('[剧情推进] [Loop] Planning in progress, ignoring GENERATION_ENDED.');
      return;
    }
    if (planningGuard_ACU.ignoreNextGenerationEndedCount > 0) {
      planningGuard_ACU.ignoreNextGenerationEndedCount--;
      logDebug_ACU(`[剧情推进] [Loop] Ignoring planning-triggered GENERATION_ENDED (${planningGuard_ACU.ignoreNextGenerationEndedCount} left).`);
      return;
    }

    // 等待一下让消息同步
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (!loopState_ACU.isLooping || !loopState_ACU.awaitingReply) return;

    const loopSettings = settings_ACU.plotSettings.loopSettings || DEFAULT_PLOT_SETTINGS_ACU.loopSettings;
    const chat = SillyTavern_API_ACU.chat;

    if (!chat || chat.length === 0) return;

    // 获取最新消息
    let lastMessage = chat[chat.length - 1];

    // 如果最新消息是用户消息，且带有规划标记，说明这是规划层，应该忽略
    if (lastMessage.is_user && lastMessage._qrf_from_planning) {
      logDebug_ACU('[剧情推进] [Loop] 检测到规划层(user with _qrf_from_planning)，忽略，继续等待AI回复。');
      return;
    }

    // 如果依然是用户消息（但没有规划标记），说明生成未产生有效AI回复，视为验证失败
    if (lastMessage.is_user) {
      logWarn_ACU('[剧情推进] [Loop] 生成结束但最后一条是用户消息（无规划标记），等待2s后重试检测...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const updatedChat = SillyTavern_API_ACU.chat;
      lastMessage = updatedChat?.length ? updatedChat[updatedChat.length - 1] : null;
    }

    // 如果还是没有AI回复，进入重试
    if (!lastMessage || lastMessage.is_user) {
      logWarn_ACU('[剧情推进] [Loop] 未找到AI回复楼层，进入重试。');
      loopState_ACU.awaitingReply = false; // 本次检测结束
      await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: false });
      return;
    }

    // 忽略来自其他扩展 / 虚拟角色的 AI 回复
    const activeChar = SillyTavern_API_ACU.characters?.[SillyTavern_API_ACU.this_chid];
    const activeCharName = activeChar?.name;
    if (activeCharName && lastMessage.name && lastMessage.name !== activeCharName) {
      logDebug_ACU(
        `[剧情推进] [Loop] 检测到来自其他角色/扩展的AI回复(name=${lastMessage.name})，与当前角色(${activeCharName})不符，忽略本次 GENERATION_ENDED。`
      );
      return;
    }

    // 进行标签检测
    const ok = validateLoopTags_ACU(lastMessage.mes, loopSettings.loopTags);
    if (ok) {
      logDebug_ACU('[剧情推进] 标签检测通过。继续循环。');
      loopState_ACU.isRetrying = false;
      loopState_ACU.retryCount = 0;
      loopState_ACU.awaitingReply = false;
      // 通过后等待 loopDelay 再进入下一轮
      loopState_ACU.timerId = setTimeout(() => {
        triggerLoopGeneration_ACU();
      }, (loopSettings.loopDelay || 5) * 1000);
      return;
    }

    // 标签检测未通过，进入重试
    logDebug_ACU('[剧情推进] 标签检测未通过。进入重试。');
    loopState_ACU.awaitingReply = false; // 本次检测结束
    await enterLoopRetryFlow_ACU({ loopSettings, shouldDeleteAiReply: true });
  }

  /**
   * 从聊天记录中反向查找最新的plot。
   * @param {Object} options - 检索选项
   * @param {number} [options.beforeIndex] - 仅检索该索引之前的消息（不含该索引）
   * @param {string} [options.beforeUserInputHash] - 作为当前用户楼层锚点的原始输入哈希
   * @param {string} [options.beforeUserInputText] - 作为当前用户楼层锚点的原始输入文本
   * @returns {string} - 返回找到的plot文本，否则返回空字符串。
   */
  function findPlotHistoryAnchorIndex_ACU(chat, options: any = {}) {
    if (!Array.isArray(chat) || chat.length === 0) return -1;
    const beforeUserInputHash = String(options?.beforeUserInputHash || '').trim();
    const beforeUserInputText = String(options?.beforeUserInputText || '');
    if (!beforeUserInputHash && !beforeUserInputText.trim()) return -1;

    for (let i = chat.length - 1; i >= 0; i--) {
      const message = chat[i];
      if (!message?.is_user) continue;
      if (beforeUserInputHash && message._qrf_plot_pending_hash === beforeUserInputHash) {
        return i;
      }
      const messageText = String(message.mes || '');
      if (beforeUserInputHash && hashUserInput_ACU(messageText) === beforeUserInputHash) {
        return i;
      }
      if (!beforeUserInputHash && beforeUserInputText && messageText === beforeUserInputText) {
        return i;
      }
    }

    return -1;
  }

  function getPlotHistorySearchUpperBound_ACU(chat, options: any = {}) {
    if (!Array.isArray(chat) || chat.length === 0) return -1;

    if (Number.isFinite(options?.beforeIndex)) {
      return Math.min(chat.length - 1, Math.floor(options.beforeIndex) - 1);
    }

    const anchorIndex = findPlotHistoryAnchorIndex_ACU(chat, options);
    if (anchorIndex >= 0) {
      return anchorIndex - 1;
    }

    return chat.length - 1;
  }

  export function getPlotFromHistory_ACU(options: any = {}) {
    const chat = SillyTavern_API_ACU.chat;
    logDebug_ACU('[剧情推进] [Plot] getPlotFromHistory_ACU 被调用，聊天记录长度:', chat?.length || 0, '，检索选项:', options || {});
    if (!chat || chat.length === 0) {
      logDebug_ACU('[剧情推进] [Plot] 聊天记录为空');
      return '';
    }

    const currentPresetName = getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal: true });
    logDebug_ACU('[剧情推进] [Plot] 当前聊天实际预设名称:', currentPresetName || '(默认预设)');

    const upperBound = getPlotHistorySearchUpperBound_ACU(chat, options);
    if (upperBound < 0) {
      logDebug_ACU('[剧情推进] [Plot] 当前楼层之前没有更早的用户消息或可检索范围为空，返回空字符串');
      return '';
    }

    let latestPlotContent = '';
    let latestPlotIndex = -1;

    for (let i = upperBound; i >= 0; i--) {
      const message = chat[i];
      if (message && message.qrf_plot) {
        const plotPresetName = message.qrf_plot_preset || '';

        if (currentPresetName === '') {
          latestPlotContent = message.qrf_plot;
          latestPlotIndex = i;
          logDebug_ACU(`[剧情推进] [Plot] (无预设模式) ✓ 在消息 ${i} 找到最新的plot数据，检索上界: ${upperBound}`);
          break;
        }

        if (plotPresetName === currentPresetName) {
          latestPlotContent = message.qrf_plot;
          latestPlotIndex = i;
          logDebug_ACU(`[剧情推进] [Plot] ✓ 在消息 ${i} (is_user=${message.is_user}) 找到精确匹配预设 "${currentPresetName}" 的plot数据，检索上界: ${upperBound}`);
          break;
        }
      }
    }

    if (!latestPlotContent && currentPresetName !== '') {
      logDebug_ACU(`[剧情推进] [Plot] 未找到精确匹配预设 "${currentPresetName}" 的数据，尝试在上界 ${upperBound} 之前寻找无标签旧数据...`);
      for (let i = upperBound; i >= 0; i--) {
        const message = chat[i];
        if (message && message.qrf_plot) {
          const plotPresetName = message.qrf_plot_preset || '';
          if (plotPresetName === '') {
            latestPlotContent = message.qrf_plot;
            latestPlotIndex = i;
            logDebug_ACU(`[剧情推进] [Plot] (兼容模式) ✓ 在消息 ${i} 找到无标签的旧plot数据作为回退，检索上界: ${upperBound}`);
            break;
          }
        }
      }
    }

    if (latestPlotContent) {
      logDebug_ACU(`[剧情推进] [Plot] 返回匹配预设 "${currentPresetName || '(无)'}" 的最新剧情规划数据，消息索引: ${latestPlotIndex}, 检索上界: ${upperBound}, 长度: ${latestPlotContent.length}`);
      return latestPlotContent;
    }

    logDebug_ACU(`[剧情推进] [Plot] 未找到匹配预设 "${currentPresetName || '(无)'}" 的plot数据，检索上界: ${upperBound}`);
    return '';
  }

  /**
   * 生成用户输入文本的哈希值，用于精确匹配目标消息
   * 归一化处理：去除首尾空白，统一换行符
   */

  /**
   * 将plot附加到对应的用户消息上。
   * 使用用户输入文本哈希精确匹配，避免保存到错误的楼层。
   */
  async function savePlotToLatestMessage_ACU(force = false) {
    logDebug_ACU('[剧情推进] [Plot] savePlotToLatestMessage_ACU 被调用');
    logDebug_ACU('[剧情推进] [Plot] planningGuard_ACU.inProgress:', planningGuard_ACU.inProgress);
    logDebug_ACU('[剧情推进] [Plot] planningGuard_ACU.ignoreNextGenerationEndedCount:', planningGuard_ACU.ignoreNextGenerationEndedCount);
    logDebug_ACU('[剧情推进] [Plot] tempPlotToSave_ACU:', tempPlotToSave_ACU ? (typeof tempPlotToSave_ACU === 'string' ? `长度=${tempPlotToSave_ACU.length}` : `content长度=${tempPlotToSave_ACU.content?.length}, hash=${tempPlotToSave_ACU.userInputHash}`) : '(空)');

    // 忽略规划阶段触发的生成结束事件，避免把 plot 附加到错误楼层
    if (!force && planningGuard_ACU.inProgress) {
      logDebug_ACU('[剧情推进] [Plot] Planning in progress, ignoring GENERATION_ENDED.');
      return;
    }
    if (planningGuard_ACU.ignoreNextGenerationEndedCount > 0) {
      planningGuard_ACU.ignoreNextGenerationEndedCount--;
      logDebug_ACU(`[剧情推进] [Plot] Ignoring planning-triggered GENERATION_ENDED (${planningGuard_ACU.ignoreNextGenerationEndedCount} left).`);
      return;
    }

    if (!tempPlotToSave_ACU) {
      logDebug_ACU('[剧情推进] [Plot] tempPlotToSave_ACU 为空，无需保存');
      return;
    }

    // [兼容性] 处理旧格式（字符串）和新格式（对象）
    let plotContent, userInputHash, userInputText;
    if (typeof tempPlotToSave_ACU === 'string') {
      // 旧格式：只有内容，没有哈希（向后兼容）
      plotContent = tempPlotToSave_ACU;
      userInputHash = null;
      userInputText = null;
      logDebug_ACU('[剧情推进] [Plot] 检测到旧格式数据，使用回退匹配逻辑');
    } else {
      // 新格式：包含内容和用户输入哈希
      plotContent = tempPlotToSave_ACU.content;
      userInputHash = tempPlotToSave_ACU.userInputHash;
      userInputText = tempPlotToSave_ACU.userInputText;
      logDebug_ACU('[剧情推进] [Plot] 使用新格式，用户输入哈希:', userInputHash, '，原始文本长度:', userInputText?.length || 0);
    }

    if (!plotContent) {
      logWarn_ACU('[剧情推进] [Plot] plotContent 为空，无法保存');
      _set_tempPlotToSave_ACU(null);
      return;
    }

    // [优化] 使用轮询等待机制，确保用户楼层已写入chat数组
    const MAX_POLL_ATTEMPTS = 20; // 最多轮询20次（2秒）
    const POLL_INTERVAL_MS = 100; // 每100ms轮询一次
    let pollAttempts = 0;
    let target = null;

    const tryFindTarget = () => {
      const chat = SillyTavern_API_ACU.chat;
      if (!chat || chat.length === 0) {
        return null;
      }

      // [精确匹配] 优先使用用户输入文本哈希匹配
      if (userInputHash) {
        for (let i = chat.length - 1; i >= 0; i--) {
          const msg = chat[i];
          if (msg && msg.is_user) {
            // [优化] 优先检查消息对象上保存的原始输入哈希（策略1场景）
            if (msg._qrf_plot_pending_hash === userInputHash) {
              // 找到匹配的消息，清理临时标记
              delete msg._qrf_plot_pending_hash;
              if (!msg.qrf_plot) {
                logDebug_ACU(`[剧情推进] [Plot] ✓ 通过消息对象上的哈希标记找到目标用户消息（索引 ${i}，哈希: ${userInputHash}）`);
                return { msg, index: i };
              } else {
                logDebug_ACU(`[剧情推进] [Plot] 索引 ${i} 的消息哈希标记匹配但已有plot，继续查找`);
              }
            }
            
            // [回退] 如果消息对象上没有哈希标记，尝试计算当前消息文本的哈希（策略2场景）
            const msgText = msg.mes || '';
            const msgHash = hashUserInput_ACU(msgText);
            
            // 精确匹配哈希
            if (msgHash === userInputHash) {
              // 额外检查：如果该消息已有plot，且不是本次规划的目标，跳过（可能是重复文本）
              // 但如果该消息没有plot，则一定是目标
              if (!msg.qrf_plot) {
                logDebug_ACU(`[剧情推进] [Plot] ✓ 通过消息文本哈希精确匹配找到目标用户消息（索引 ${i}，哈希: ${userInputHash}）`);
                return { msg, index: i };
              } else {
                // 已有plot，可能是更早的重复文本，继续查找
                logDebug_ACU(`[剧情推进] [Plot] 索引 ${i} 的消息哈希匹配但已有plot，继续查找`);
              }
            }
          }
        }
      }

      // [回退逻辑] 如果没有哈希或哈希匹配失败，使用原逻辑（向后兼容）
      // 寻找最新的、且【尚未附加plot数据】的用户消息
      for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (msg && msg.is_user && !msg.qrf_plot) {
          logDebug_ACU(`[剧情推进] [Plot] 使用回退逻辑找到目标用户消息于索引 ${i}`);
          return { msg, index: i };
        }
      }

      return null;
    };

    const pollForTarget = () => {
      pollAttempts++;
      const result = tryFindTarget();
      
      if (result) {
        target = result.msg;
        logDebug_ACU(`[剧情推进] [Plot] 在第 ${pollAttempts} 次轮询中找到目标消息`);
        
        // 保存plot数据
        target.qrf_plot = plotContent;
        const currentPresetName = getCurrentRuntimePlotPresetName_ACU({ fallbackToGlobal: true });
        target.qrf_plot_preset = currentPresetName;
        logDebug_ACU('[剧情推进] [Plot] ✓ Plot数据已精确附加到目标用户消息，长度:', plotContent.length, '，预设:', currentPresetName || '(默认预设)');
        
        // 清空临时变量
        _set_tempPlotToSave_ACU(null);
        return true; // 成功
      }

      if (pollAttempts >= MAX_POLL_ATTEMPTS) {
        // 超时，记录警告但不清空tempPlotToSave_ACU，允许后续重试
        logWarn_ACU(`[剧情推进] [Plot] 轮询 ${MAX_POLL_ATTEMPTS} 次后仍未找到目标用户消息。用户输入哈希: ${userInputHash || '(无)'}，原始文本: ${userInputText ? `长度=${userInputText.length}` : '(无)'}。将在下一次事件中重试。`);
        return false; // 失败，但保留数据等待重试
      }

      // 继续轮询
      setTimeout(pollForTarget, POLL_INTERVAL_MS);
      return null; // 继续中
    };

    // 开始轮询（首次延迟100ms，给SillyTavern一些时间写入消息）
    setTimeout(() => {
      pollForTarget();
    }, 100);
  }

  /**
   * 核心优化逻辑，可被多处调用。
   * @param {string} userMessage - 需要被优化的用户输入文本。
   * @param {Object} options - 可选参数
   * @param {string} options.originalUserInput - 原始用户输入文本（用于哈希匹配，如果与userMessage不同）
   * @returns {Promise<string|null>} - 返回优化后的完整消息体，如果失败或跳过则返回null。
   */
  export async function runOptimizationLogic_ACU(userMessage, options: any = {}) {
    const { originalUserInput, hasExistingUserMessage = false } = options;
    // 用于哈希匹配的原始用户输入（如果未提供，使用userMessage）
    const inputForHash = originalUserInput || userMessage;
    // 如果当前处于重试流程，绝对禁止触发剧情规划
    if (loopState_ACU.isRetrying) {
        logDebug_ACU('[剧情推进] 当前处于重试流程，跳过剧情规划逻辑。');
        return null;
    }

    // [关键修复] 硬互斥：同一时刻只允许一个剧情规划在跑，防止重复触发导致"成功但刷一堆规划失败 toast"
    if ((runOptimizationLogic_ACU as any).__inFlight) {
      const inflightText = String((runOptimizationLogic_ACU as any).__inFlightText || '');
      const t = String(userMessage || '');
      if (t && inflightText && t === inflightText) {
        logDebug_ACU('[剧情推进] Duplicate planning call skipped (same text, in-flight).');
      } else {
        logDebug_ACU('[剧情推进] Planning skipped (another planning in-flight).');
      }
      return { skipped: true };
    }
    (runOptimizationLogic_ACU as any).__inFlight = true;
    (runOptimizationLogic_ACU as any).__inFlightText = String(userMessage || '');

    let $toast = null;
    // [中止回退] 记录本次规划对应的原始用户文本，用于"用户手动终止"时回填
    let originalUserInputForAbort_ACU = userMessage || '';
    try {
      // 标记进入规划阶段：用于忽略规划触发的生成事件
      planningGuard_ACU.inProgress = true;

      // 在每次执行前，都重新进行一次深度合并，以获取最新、最完整的设置状态
      const currentSettings = settings_ACU.plotSettings || {};
      const plotSettings = {
        ...DEFAULT_PLOT_SETTINGS_ACU,
        ...currentSettings,
      };

      if (!plotSettings.enabled) {
        return null; // 剧情推进功能未启用，直接返回
      }

      // 重置中止控制器
      _set_abortController_ACU(new AbortController());

      // 创建带中止按钮的 Toast（使用 ACU 主题 toast class，保证风格统一）
      const toastMsg = `
          <div style="display: flex; align-items: center; justify-content: space-between;">
              <span class="toastr-message" style="margin-right: 10px;">正在读取过往的记忆并分析，请稍后...</span>
              <button class="qrf-abort-btn">终止</button>
          </div>
      `;

      // "正在规划"属于白名单提示：无论是否开启静默都允许显示
      $toast = showToastr_ACU('info', toastMsg, {
            timeOut: 0,
            extendedTimeOut: 0,
            escapeHtml: false,
            tapToDismiss: false,
            closeButton: false,
            progressBar: false,
          toastClass: 'toast acu-toast acu-toast--info',
          acuToastCategory: ACU_TOAST_CATEGORY_ACU.PLANNING,
        });

      // 确保中止按钮绑定生效 - 在toast显示后立即绑定（绑定到本 toast 内按钮，避免误绑/绑到旧 toast）
      setTimeout(() => {
        // 优先绑定当前 toast 内的按钮
        const $abortBtn = ($toast && $toast.find) ? $toast.find('.qrf-abort-btn') : null;
        if ($abortBtn.length > 0) {
          $abortBtn.off('click').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            logDebug_ACU('[剧情推进] 用户点击了中止按钮。');

            if (abortController_ACU) {
              abortController_ACU.abort();
              logDebug_ACU('[剧情推进] 用户手动中止了规划任务。');
            }

            // 仅移除本次规划 toast（不要清空其它 toast；不同 toastr 封装可能不存在 remove()）
            try {
              // 先尝试 clear 当前 toast 对象
              if ($toast) toastr_API_ACU.clear($toast);
              // 再兜底：从按钮回溯到 toast DOM 并直接移除
              try { if ($toast) toastr_API_ACU.clear($toast); } catch (e2) {}
            } catch (e) {}
            _set_isProcessing_Plot_ACU(false); // 强制释放锁

            setTimeout(() => {
              // 用户主动中止属于正常流程，不应触发"错误"类提示
              showToastr_ACU('info', '规划任务已被用户中止。', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.PLANNING });
            }, 500);
          });
          logDebug_ACU('[剧情推进] 中止按钮事件已绑定。');
        } else {
          logWarn_ACU('[剧情推进] 未找到中止按钮元素。');
        }
      }, 200);

      const runtimeResult = await runPlotTasksRuntime_ACU(plotSettings, userMessage, {
        inputForHash,
        $toast,
        hasExistingUserMessage,
      });

      try { if ($toast) toastr_API_ACU.clear($toast); } catch (e) {}

      if (!runtimeResult?.finalMessage) {
        if (runtimeResult?.abortedByStageFailure) {
          showToastr_ACU(
            'error',
            runtimeResult.errorMessage || `剧情任务阶段 ${runtimeResult.failedStage ?? '?'} 执行失败，后续阶段已停止。`,
            '规划失败',
            { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR },
          );
        } else if (runtimeResult?.enabledTaskCount > 0) {
          showToastr_ACU(
            'error',
            `共 ${runtimeResult.enabledTaskCount} 个剧情任务均未返回有效结果，操作已取消。`,
            '规划失败',
            { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR },
          );
        } else {
          showToastr_ACU('error', '当前没有可执行的剧情任务。', '规划失败', {
            acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
          });
        }
        return null;
      }

      const aggregatedTagNames = runtimeResult.aggregatedTags instanceof Map
        ? Array.from(runtimeResult.aggregatedTags.keys())
        : [];
      if (aggregatedTagNames.length > 0) {
        logDebug_ACU(`[剧情推进] 成功聚合标签: ${aggregatedTagNames.join(', ')}`);
        showToastr_ACU('info', `已成功聚合 [${aggregatedTagNames.join(', ')}] 标签内容并注入。`, '标签摘取');
      }

      if (runtimeResult.failedResults.length > 0) {
        showToastr_ACU(
          'warning',
          `剧情规划完成，${runtimeResult.successfulResults.length}/${runtimeResult.enabledTaskCount} 个任务成功。`,
          '部分成功',
          { acuToastCategory: ACU_TOAST_CATEGORY_ACU.PLAN_OK },
        );
      } else {
        showToastr_ACU(
          'success',
          `剧情规划成功，共完成 ${runtimeResult.successfulResults.length} 个任务。`,
          '规划成功',
          { acuToastCategory: ACU_TOAST_CATEGORY_ACU.PLAN_OK },
        );
      }

      return runtimeResult.finalMessage;
    } catch (error) {
      if (error.message === 'TaskAbortedByUser') {
          // 用户中止，返回特殊标记对象
          return { aborted: true, manual: true, restoreText: originalUserInputForAbort_ACU };
      }
      // 兼容 AbortController/浏览器的标准取消错误（不应当弹红框）
      if (error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted')) {
          return { aborted: true, manual: true, restoreText: originalUserInputForAbort_ACU };
      }
      logError_ACU('[剧情推进] 在核心优化逻辑中发生错误:', error);
      try { if ($toast) toastr_API_ACU.clear($toast); } catch (e) {}
      showToastr_ACU('error', '剧情规划大师在处理时发生错误。', '规划失败', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
      return null;
    } finally {
        planningGuard_ACU.inProgress = false;
        _set_abortController_ACU(null);
        (runOptimizationLogic_ACU as any).__inFlight = false;
        (runOptimizationLogic_ACU as any).__inFlightText = '';
    }
  }

  /**
   * 获取剧情推进功能的世界书内容（默认开启，无需检查 worldbookEnabled）
   */
  export async function getWorldbookContentForPlot_ACU(apiSettings, userMessage, extraBaseText = '') {
    if (!apiSettings) {
      logWarn_ACU('[剧情推进] apiSettings 为空，无法获取世界书');
      return '';
    }

    logDebug_ACU('[剧情推进] Starting to get combined worldbook content with shared placeholder pipeline...');

    try {
      let bookNames = [];

      // 1. 确定要扫描的世界书（剧情推进使用"独立 worldbookConfig"，与填表世界书选择互不干扰）
      const plotCfg = (apiSettings && apiSettings.plotWorldbookConfig) ? apiSettings.plotWorldbookConfig : null;
      const worldbookSource = plotCfg?.source || apiSettings.worldbookSource || 'character';
      logDebug_ACU('[剧情推进] 世界书来源模式:', worldbookSource);

      if (worldbookSource === 'manual') {
        bookNames = plotCfg?.manualSelection || apiSettings.selectedWorldbooks || [];
        logDebug_ACU('[剧情推进] 手动选择的世界书:', bookNames);
      } else {
        logDebug_ACU('[剧情推进] 使用角色绑定的世界书模式');
        try {
          const charLorebooks = await TavernHelper_API_ACU.getCharLorebooks({ type: 'all' });
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
      const chatArray = Array.isArray(SillyTavern_API_ACU.chat) ? SillyTavern_API_ACU.chat : [];
      const recentMessages = historyLimit > 0 ? chatArray.slice(-historyLimit) : chatArray;
      const historyAndUserText = `${recentMessages.map(message => message.mes || '').join('\n')}\n${userMessage || ''}`;
      const enabledMap = plotCfg?.enabledEntries;
      const hasAnySelection = enabledMap && typeof enabledMap === 'object' && Object.keys(enabledMap).length > 0;

      return await buildCombinedWorldbookContentByStrategy_ACU({
        logPrefix: '[剧情推进]',
        bookNames,
        baseScanText: [historyAndUserText, extraBaseText || ''].filter(Boolean).join('\n'),
        includeConstantEntriesInBaseScan: true,
        includeEntry: entry => {
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
        isSelected: entry => {
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
        onEntriesFiltered: entries => {
          logDebug_ACU('[剧情推进] 过滤后的条目总数:', entries.length);
        },
        onSelectedEntries: entries => {
          logDebug_ACU('[剧情推进] SillyTavern中启用的条目数量:', entries.length);
        },
      });
    } catch (error) {
      logError_ACU('[剧情推进] 处理世界书内容时发生错误:', error);
      return '';
    }
  }




  // Removed applyActualMessageVisibility_ACU function

  // [T180] updateApiModeView_ACU ~ attemptToLoadCoreApis_ACU (~1237行纯UI函数) 已移到 presentation/triggers/settings-ui-sync.ts
