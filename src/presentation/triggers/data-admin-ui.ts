import { DEFAULT_CHAR_CARD_PROMPT_ACU, TABLE_TEMPLATE_ACU } from '../../shared/defaults-json.js';
import { deriveTemplatePresetNameForImport_ACU, getCurrentTemplatePresetName_ACU, normalizeTemplatePresetSelectionValue_ACU, sanitizeFilenameComponent_ACU } from '../../shared/template-preset-utils';
import { renderPromptSegments_ACU } from '../components/plot-editors';
import { getDefaultTemplateSnapshot_ACU, getTemplatePreset_ACU } from '../../service/template/template-preset-service';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { loadSettingsAndRefreshUI_ACU } from '../components/settings-ui-helpers';
import { getCurrentChatTemplateScopeState_ACU, getGlobalTemplateSnapshotForCurrentProfile_ACU, migrateLegacyTemplateScopeForCurrentChat_ACU, sanitizeChatSheetsObject_ACU, sanitizeTemplateSnapshotForChat_ACU } from '../../service/template/chat-scope';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../components/pipeline-ui-helpers';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { safeJsonParse_ACU } from '../../shared/json-helpers';
import { ensureSheetOrderNumbers_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { loadOrCreateJsonTableFromChatHistory_ACU } from '../../service/table/table-service';
import { applyTemplateSnapshotToScope_ACU, normalizeTemplateOperationScope_ACU, parseImportedTemplateData_ACU, resolveActiveTemplatePresetName_ACU, upsertTemplatePreset_ACU } from '../../service/template/template-preset-service';
import { getTemplatePresetSelectJQ_ACU, refreshTemplatePresetSelectInUI_ACU } from '../components/template-preset-ui';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { buildDefaultExportConfig_ACU, ensureExportConfigDefaults_ACU, getInjectionTargetLorebook_ACU, getIsolationPrefix_ACU } from '../../service/worldbook/injection-engine';
/**
 * presentation/triggers/data-admin-ui.ts — 导入/导出/重置 UI
 * 从 features/data/01_data_admin.js 迁移而来
 */

  function importCombinedSettings_ACU() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = (e.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            const content = readerEvent.target.result;
            let combinedData;

            try {
                combinedData = JSON.parse(content as string);
            } catch (error) {
                logError_ACU('导入合并配置失败：JSON解析错误。', error);
                showToastr_ACU('error', '文件不是有效的JSON格式。', { timeOut: 5000 });
                return;
            }
            
            try {
                // Validation
                if (!combinedData.prompt || !combinedData.template) {
                    throw new Error('JSON文件缺少 "prompt" 或 "template" 键。');
                }
                if (!Array.isArray(combinedData.prompt)) {
                    throw new Error('"prompt" 的值必须是一个数组。');
                }
                if (typeof combinedData.template !== 'object' || combinedData.template === null) {
                    throw new Error('"template" 的值必须是一个对象。');
                }

                // 1. Apply and save prompt
                settings_ACU.charCardPrompt = combinedData.prompt;
                saveSettingsAndNotify_ACU();
                renderPromptSegments_ACU(combinedData.prompt);
                showToastr_ACU('success', '提示词预设已成功导入并保存！');

                // [新增] 导入合并提示词 (如果存在)
                if (combinedData.mergeSummaryPrompt) {
                    settings_ACU.mergeSummaryPrompt = combinedData.mergeSummaryPrompt;
                    saveSettingsAndNotify_ACU();
                    const $mergePromptInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template`);
                    if ($mergePromptInput.length) {
                        $mergePromptInput.val(combinedData.mergeSummaryPrompt);
                    }
                    logDebug_ACU('Merge summary prompt imported.');
                }

                // [新增] 导入所有合并设置 (如果存在)
                if (typeof combinedData.mergeSummaryPrompt !== 'undefined' ||
                    typeof combinedData.autoMergeEnabled !== 'undefined') {

                    // 导入合并提示词
                    if (combinedData.mergeSummaryPrompt) {
                        settings_ACU.mergeSummaryPrompt = combinedData.mergeSummaryPrompt;
                        const $mergePromptInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template`);
                        if ($mergePromptInput.length) {
                            $mergePromptInput.val(combinedData.mergeSummaryPrompt);
                        }
                    }

                    // 导入手动合并设置
                    settings_ACU.mergeTargetCount = combinedData.mergeTargetCount || 1;
                    settings_ACU.mergeBatchSize = combinedData.mergeBatchSize || 5;
                    settings_ACU.mergeStartIndex = combinedData.mergeStartIndex || 1;
                    settings_ACU.mergeEndIndex = combinedData.mergeEndIndex || null;

                    // 导入自动合并设置
                    settings_ACU.autoMergeEnabled = combinedData.autoMergeEnabled || false;
                    settings_ACU.autoMergeThreshold = combinedData.autoMergeThreshold || 20;
                    settings_ACU.autoMergeReserve = combinedData.autoMergeReserve || 0;

                    // 导入删除楼层范围设置
                    settings_ACU.deleteStartFloor = combinedData.deleteStartFloor || null;
                    settings_ACU.deleteEndFloor = combinedData.deleteEndFloor || null;

                    saveSettingsAndNotify_ACU();

                    // 更新所有UI
                    const $mergeTargetCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-target-count`);
                    const $mergeBatchSize = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-batch-size`);
                    const $mergeStartIndex = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-start-index`);
                    const $mergeEndIndex = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-merge-end-index`);
                    const $autoMergeEnabled = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-enabled`);
                    const $autoMergeThreshold = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-threshold`);
                    const $autoMergeReserve = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-auto-merge-reserve`);

                    if ($mergeTargetCount.length) $mergeTargetCount.val(settings_ACU.mergeTargetCount);
                    if ($mergeBatchSize.length) $mergeBatchSize.val(settings_ACU.mergeBatchSize);
                    if ($mergeStartIndex.length) $mergeStartIndex.val(settings_ACU.mergeStartIndex);
                    if ($mergeEndIndex.length) $mergeEndIndex.val(settings_ACU.mergeEndIndex || '');
                    if ($autoMergeEnabled.length) $autoMergeEnabled.prop('checked', settings_ACU.autoMergeEnabled);
                    if ($autoMergeThreshold.length) $autoMergeThreshold.val(settings_ACU.autoMergeThreshold);
                    if ($autoMergeReserve.length) $autoMergeReserve.val(settings_ACU.autoMergeReserve);

                    // 更新删除楼层范围UI
                    const $deleteStartFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-start-floor`);
                    const $deleteEndFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-end-floor`);

                    if ($deleteStartFloor.length) $deleteStartFloor.val(settings_ACU.deleteStartFloor || 1);
                    if ($deleteEndFloor.length) $deleteEndFloor.val(settings_ACU.deleteEndFloor || '');

                    logDebug_ACU('All merge settings imported.');
                }
                
                // 2. Apply and save template
                // [瘦身] 导入时清洗模板并回写（兼容旧模板带冗余字段）
                const sheetKeys = Object.keys(combinedData.template).filter(k => k.startsWith('sheet_'));
                ensureSheetOrderNumbers_ACU(combinedData.template, { baseOrderKeys: sheetKeys, forceRebuild: false });
                const sanitizedTemplate = sanitizeChatSheetsObject_ACU(combinedData.template, { ensureMate: true });
                const appliedTemplate = await applyTemplateSnapshotToScope_ACU(sanitizedTemplate, {
                    scope: 'global',
                    source: 'import_combined',
                    presetName: normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false })),
                    save: true,
                    persistChatScope: false,
                });
                if (!appliedTemplate) {
                    throw new Error('合并配置中的表格模板已解析，但应用到全局模板失败。');
                }

                showToastr_ACU('success', '表格模板已成功导入！模板已更新，但不会影响当前聊天记录的本地数据。');

                // [优化] 不再触发表格数据初始化，仅修改当前插件模板
                // 只有在新开卡或之前没有用过插件的聊天记录里才会使用新的通用模板作为基底
                showToastr_ACU('success', '合并配置已成功导入！');

            } catch (error) {
                logError_ACU('导入合并配置失败：结构验证失败。', error);
                showToastr_ACU('error', `导入失败: ${error.message}`, { timeOut: 10000 });
            }
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  // [新增] 删除聊天记录中的本地数据
  // [重要] 此函数只删除各楼层的表格数据（TavernDB_ACU_Data/IsolatedData等），
  //        不会删除聊天第一层的"空白指导表"（TavernDB_ACU_InternalSheetGuide），
  //        指导表用于保存表头结构和填表参数，作为该聊天的总指导。
  export async function deleteLocalDataInChat_ACU(mode = 'current', startFloor = null, endFloor = null) {
      // mode: 'current' (删除当前标识的数据) | 'all' (删除所有数据)
      // startFloor/endFloor: 楼层范围 (1-based, null表示不限制)
      const chat = SillyTavern_API_ACU.chat;
      if (!chat || chat.length === 0) {
          showToastr_ACU('warning', '聊天记录为空，无法执行删除操作。');
          return;
      }

      let deletedCount = 0;
      const targetIdentity = settings_ACU.dataIsolationEnabled ? settings_ACU.dataIsolationCode : null;

      // 计算AI消息索引列表（只计算AI楼层）
      // [修复] 处理所有AI消息，包括 chat[0]，但在删除时会排除空白指导表字段
      const aiMessageIndices = chat
          .map((msg, index) => (!msg.is_user) ? index : -1)
          .filter(index => index !== -1);

      if (aiMessageIndices.length === 0) {
          showToastr_ACU('warning', '聊天记录中没有AI消息，无法执行删除操作。');
          return;
      }

      // 转换AI楼层范围为AI消息索引范围
      const startAiIndex = startFloor ? Math.max(0, startFloor - 1) : 0;
      const endAiIndex = endFloor ? Math.min(aiMessageIndices.length - 1, endFloor - 1) : aiMessageIndices.length - 1;

      // 获取要处理的AI消息的物理索引
      const targetIndices = aiMessageIndices.slice(startAiIndex, endAiIndex + 1);

      for (const physicalIndex of targetIndices) {
          const msg = chat[physicalIndex];
          let shouldDelete = false;

          if (mode === 'all') {
              shouldDelete = true;
          } else { // mode === 'current'
              if (settings_ACU.dataIsolationEnabled) {
                  // 开启隔离：只删除匹配当前代码的数据
                  if (msg.TavernDB_ACU_Identity === targetIdentity) {
                      shouldDelete = true;
                  }
              } else {
                  // 关闭隔离：删除所有有数据库数据的内容（无论是否有标识）
                  if (msg.TavernDB_ACU_Data || msg.TavernDB_ACU_SummaryData || msg.TavernDB_ACU_IndependentData || msg.TavernDB_ACU_IsolatedData) {
                      shouldDelete = true;
                  }
              }
          }

          if (shouldDelete) {
              let modified = false;
              
              // [保护] 注意：TavernDB_ACU_InternalSheetGuide（空白指导表）字段不会被删除，不在删除列表中
              
              if (msg.TavernDB_ACU_Data) {
                  delete msg.TavernDB_ACU_Data;
                  modified = true;
              }
              if (msg.TavernDB_ACU_SummaryData) {
                  delete msg.TavernDB_ACU_SummaryData;
                  modified = true;
              }
              // [修复] 支持删除独立保存的数据
              if (msg.TavernDB_ACU_IndependentData) {
                  delete msg.TavernDB_ACU_IndependentData;
                  modified = true;
              }
              if (msg.TavernDB_ACU_Identity !== undefined) {
                  delete msg.TavernDB_ACU_Identity;
                  modified = true;
              }
              // [新增] 支持删除按标签分组存储的数据
              if (msg.TavernDB_ACU_IsolatedData) {
                  if (mode === 'all') {
                      // 删除所有标签的数据
                      delete msg.TavernDB_ACU_IsolatedData;
                      modified = true;
                  } else {
                      // 只删除当前标签的数据
                      const currentIsolationKey = getCurrentIsolationKey_ACU();
                      if (msg.TavernDB_ACU_IsolatedData[currentIsolationKey]) {
                          delete msg.TavernDB_ACU_IsolatedData[currentIsolationKey];
                          // 如果删除后没有其他标签的数据了，删除整个对象
                          if (Object.keys(msg.TavernDB_ACU_IsolatedData).length === 0) {
                              delete msg.TavernDB_ACU_IsolatedData;
                          }
                          modified = true;
                      }
                  }
              }
              if (msg.TavernDB_ACU_ModifiedKeys) {
                  delete msg.TavernDB_ACU_ModifiedKeys;
              }
              if (msg.TavernDB_ACU_UpdateGroupKeys) {
                  delete msg.TavernDB_ACU_UpdateGroupKeys;
              }
              
              if (modified) {
                  deletedCount++;
              }
          }
      }

      if (deletedCount > 0) {
          await SillyTavern_API_ACU.saveChat();
          // 刷新内存和UI
          await loadOrCreateJsonTableFromChatHistory_ACU();
          await refreshMergedDataAndNotifyWithUI_ACU();

          // [新增] 删除 WrapperStart 和 WrapperEnd 世界书条目
          try {
              const primaryLorebookName = await getInjectionTargetLorebook_ACU();
              if (primaryLorebookName && TavernHelper_API_ACU) {
                  const isoPrefix = getIsolationPrefix_ACU();
                  const WRAPPER_START_COMMENT = isoPrefix + 'TavernDB-ACU-WrapperStart';
                  const WRAPPER_END_COMMENT = isoPrefix + 'TavernDB-ACU-WrapperEnd';
                  const WRAPPER_START_IMPORT_COMMENT = isoPrefix + '外部导入-TavernDB-ACU-WrapperStart';
                  const WRAPPER_END_IMPORT_COMMENT = isoPrefix + '外部导入-TavernDB-ACU-WrapperEnd';

                  const allEntries = await TavernHelper_API_ACU.getLorebookEntries(primaryLorebookName);
                  const wrapperUidsToDelete = allEntries
                      .filter(e =>
                          e.comment === WRAPPER_START_COMMENT ||
                          e.comment === WRAPPER_END_COMMENT ||
                          e.comment === WRAPPER_START_IMPORT_COMMENT ||
                          e.comment === WRAPPER_END_IMPORT_COMMENT,
                      )
                      .map(e => e.uid);

                  if (wrapperUidsToDelete.length > 0) {
                      await TavernHelper_API_ACU.deleteLorebookEntries(primaryLorebookName, wrapperUidsToDelete);
                      logDebug_ACU('Deleted Wrapper entries: ' + wrapperUidsToDelete.length);
                  }
              }
          } catch (wrapperError) {
              logError_ACU('Failed to delete Wrapper entries:', wrapperError);
          }

    // [新增] 删除 PersonsHeader 世界书条目
    try {
        const primaryLorebookName2 = await getInjectionTargetLorebook_ACU();
        if (primaryLorebookName2 && TavernHelper_API_ACU) {
            const isoPrefix2 = getIsolationPrefix_ACU();
            const PERSONS_HEADER_COMMENT = isoPrefix2 + 'TavernDB-ACU-PersonsHeader';
            const MEMORY_START_COMMENT = isoPrefix2 + 'TavernDB-ACU-MemoryStart';
            const MEMORY_END_COMMENT = isoPrefix2 + 'TavernDB-ACU-MemoryEnd';
            const PERSONS_HEADER_IMPORT_COMMENT = isoPrefix2 + '外部导入-TavernDB-ACU-PersonsHeader';
            const MEMORY_START_IMPORT_COMMENT = isoPrefix2 + '外部导入-TavernDB-ACU-MemoryStart';
            const MEMORY_END_IMPORT_COMMENT = isoPrefix2 + '外部导入-TavernDB-ACU-MemoryEnd';

            const allEntries2 = await TavernHelper_API_ACU.getLorebookEntries(primaryLorebookName2);
            const headerUidsToDelete = allEntries2
                .filter(e =>
                    e.comment === PERSONS_HEADER_COMMENT ||
                    e.comment === MEMORY_START_COMMENT ||
                    e.comment === MEMORY_END_COMMENT ||
                    e.comment === PERSONS_HEADER_IMPORT_COMMENT ||
                    e.comment === MEMORY_START_IMPORT_COMMENT ||
                    e.comment === MEMORY_END_IMPORT_COMMENT,
                )
                .map(e => e.uid);

            if (headerUidsToDelete.length > 0) {
                await TavernHelper_API_ACU.deleteLorebookEntries(primaryLorebookName2, headerUidsToDelete);
                logDebug_ACU('Deleted PersonsHeader and Memory wrapper entries: ' + headerUidsToDelete.length);
            }
        }
    } catch (headerError) {
        logError_ACU('Failed to delete PersonsHeader and Memory wrapper entries:', headerError);
    }

          if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
              updateCardUpdateStatusDisplay_ACU();
          }
          
          showToastr_ACU('success', `已成功删除 ${deletedCount} 条消息中的本地数据 (${mode === 'all' ? '所有数据' : '当前标识'})。`);
      } else {
          showToastr_ACU('info', '没有发现符合删除条件的数据。');
      }
  }

  export function exportCurrentJsonData_ACU() {
    if (!currentJsonTableData_ACU) {
        showToastr_ACU('warning', '没有可导出的数据库。请先开始一个对话。');
        return;
    }
    try {
        const chatName = currentChatFileIdentifier_ACU || 'current_chat';
        const fileName = `TavernDB_data_${chatName}.json`;
        // [瘦身] Json导出时清洗冗余字段（兼容旧数据输入，但导出不再携带）
        const sanitized = sanitizeChatSheetsObject_ACU(currentJsonTableData_ACU, { ensureMate: true });
        const jsonString = JSON.stringify(sanitized, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToastr_ACU('success', '数据库JSON文件已成功导出！');
    } catch (error) {
        logError_ACU('导出JSON数据失败:', error);
        showToastr_ACU('error', '导出JSON失败，请检查控制台获取详情。');
    }
  }

  export function exportTableTemplate_ACU({ scope = 'global' } = {}) {
    const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
    try {
        let fromPresetName = '';
        let jsonData = null;

        if (normalizedScope === 'global') {
            try {
                const selected = normalizeTemplatePresetSelectionValue_ACU(getTemplatePresetSelectJQ_ACU()?.val?.());
                if (selected) {
                    const preset = getTemplatePreset_ACU(selected);
                    const obj = preset?.templateStr ? safeJsonParse_ACU(preset.templateStr, null) : null;
                    if (obj && typeof obj === 'object') {
                        jsonData = JSON.parse(JSON.stringify(obj));
                        fromPresetName = selected;
                    }
                }
            } catch (e) {}

            if (!jsonData || typeof jsonData !== 'object') {
                const globalSnapshot = getGlobalTemplateSnapshotForCurrentProfile_ACU();
                if (globalSnapshot?.templateObj && typeof globalSnapshot.templateObj === 'object') {
                    jsonData = JSON.parse(JSON.stringify(globalSnapshot.templateObj));
                    fromPresetName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false }));
                }
            }
        } else {
            const chatScopeState = getCurrentChatTemplateScopeState_ACU() || migrateLegacyTemplateScopeForCurrentChat_ACU();
            const effectivePresetName = normalizeTemplatePresetSelectionValue_ACU(resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true }));
            const chatSnapshot = chatScopeState?.mode === 'chat_override' && chatScopeState?.templateStr
                ? sanitizeTemplateSnapshotForChat_ACU(chatScopeState.templateStr)
                : (sanitizeTemplateSnapshotForChat_ACU(TABLE_TEMPLATE_ACU) || getGlobalTemplateSnapshotForCurrentProfile_ACU());
            if (chatSnapshot?.templateObj && typeof chatSnapshot.templateObj === 'object') {
                jsonData = JSON.parse(JSON.stringify(chatSnapshot.templateObj));
                fromPresetName = normalizeTemplatePresetSelectionValue_ACU(chatScopeState?.presetName || effectivePresetName);
            }
        }

        if (!jsonData || typeof jsonData !== 'object') {
            const fallbackSnapshot = normalizedScope === 'chat'
                ? sanitizeTemplateSnapshotForChat_ACU(TABLE_TEMPLATE_ACU)
                : getGlobalTemplateSnapshotForCurrentProfile_ACU();
            if (fallbackSnapshot?.templateObj && typeof fallbackSnapshot.templateObj === 'object') {
                jsonData = JSON.parse(JSON.stringify(fallbackSnapshot.templateObj));
            }
        }

        if (!jsonData || typeof jsonData !== 'object') {
            throw new Error('无法解析当前模板。');
        }

        const sheetKeys0 = Object.keys(jsonData).filter(k => k.startsWith('sheet_'));
        ensureSheetOrderNumbers_ACU(jsonData, { baseOrderKeys: sheetKeys0, forceRebuild: false });

        const sheetKeys = Object.keys(jsonData).filter(k => k.startsWith('sheet_'));
        sheetKeys.forEach(key => {
            const sheet = jsonData[key];
            if (!sheet) return;
            if (!sheet.exportConfig) {
                sheet.exportConfig = buildDefaultExportConfig_ACU(sheet.name);
            } else {
                sheet.exportConfig = ensureExportConfigDefaults_ACU(sheet.exportConfig, sheet.name);
            }
        });

        const sanitized = sanitizeChatSheetsObject_ACU(jsonData, { ensureMate: true });
        const jsonString = JSON.stringify(sanitized, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        if (fromPresetName) {
            const safePart = sanitizeFilenameComponent_ACU(fromPresetName) || 'template';
            a.download = normalizedScope === 'chat'
                ? `TavernDB_template_chat_${safePart}.json`
                : `TavernDB_template_${safePart}.json`;
        } else {
            a.download = normalizedScope === 'chat'
                ? 'TavernDB_template_chat_snapshot.json'
                : 'TavernDB_template.json';
        }
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (normalizedScope === 'chat') {
            showToastr_ACU('success', fromPresetName ? `当前聊天模板快照已成功导出：${fromPresetName}` : '当前聊天模板快照已成功导出！');
        } else {
            showToastr_ACU('success', fromPresetName ? `全局表格模板预设已成功导出：${fromPresetName}` : '全局表格模板已成功导出！(已包含最新导出参数)');
        }
        return true;
    } catch (error) {
        logError_ACU('导出模板失败:', error);
        showToastr_ACU('error', '导出模板失败，请检查控制台获取详情。');
        return false;
    }
  }

  export async function resetAllToDefaults_ACU() {
      if (!confirm('确定要同时恢复【默认AI指令预设】和【默认表格模板】吗？\n\n这将覆盖您当前的自定义设置。此操作不可撤销。')) {
          return false;
      }

      try {
          settings_ACU.charCardPrompt = DEFAULT_CHAR_CARD_PROMPT_ACU;
          saveSettingsAndNotify_ACU();

          const templateResetOk = await resetTableTemplate_ACU({
              showToast: false,
              updatePresetSelection: true,
              _refreshUi: false,
              overwriteReason: 'reset_all_defaults',
              scope: 'global',
              source: 'reset_all_defaults',
          });
          if (!templateResetOk) {
              showToastr_ACU('error', '恢复默认设置失败：默认表格模板恢复失败。');
              return false;
          }

          loadSettingsAndRefreshUI_ACU();
          refreshTemplatePresetSelectInUI_ACU({ selectName: '', keepValue: false });
          showToastr_ACU('success', '已恢复默认预设及模板！模板已更新，但不会影响当前聊天记录的本地数据。');
          return true;
      } catch (error) {
          logError_ACU('恢复默认设置失败:', error);
          showToastr_ACU('error', '恢复默认设置失败，请检查控制台获取详情。');
          return false;
      }
  }

  // [新增] 使用通用模板覆盖最新层所有表格数据的函数
  export async function overrideLatestLayerWithTemplate_ACU() {
      if (!confirm('⚠️ 警告：此操作将使用当前通用模板覆盖聊天记录中最新一层的所有表格数据！\n\n' +
                  '• 模板中有的表格会被覆盖（只保留表头，数据清空）\n' +
                  '• 模板中没有的表格会被忽略（本地数据保持不变）\n' +
                  '• 此操作仅影响最新的一条AI消息\n' +
                  '• 删除最新层的聊天数据后即可恢复正常\n\n' +
                  '确定要继续吗？')) {
          return;
      }

      const chat = SillyTavern_API_ACU.chat;
      if (!chat || chat.length === 0) {
          showToastr_ACU('error', '聊天记录为空，无法执行覆盖操作。');
          return;
      }

      // 获取当前隔离标签
      const currentIsolationKey = getCurrentIsolationKey_ACU();

      // 解析通用模板
      const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true });
      if (!templateData) {
          showToastr_ACU('error', '无法解析通用模板，请检查模板格式。');
          return;
      }

      // 找到最新的一条AI消息
      let latestAiIndex = -1;
      for (let i = chat.length - 1; i >= 0; i--) {
          if (!chat[i].is_user) {
              latestAiIndex = i;
              break;
          }
      }

      if (latestAiIndex === -1) {
          showToastr_ACU('error', '聊天记录中没有AI消息，无法执行覆盖操作。');
          return;
      }

      const latestMessage = chat[latestAiIndex];
      let modified = false;

      // 初始化或获取按标签分组的数据结构
      if (!latestMessage.TavernDB_ACU_IsolatedData) {
          latestMessage.TavernDB_ACU_IsolatedData = {};
      }
      if (!latestMessage.TavernDB_ACU_IsolatedData[currentIsolationKey]) {
          latestMessage.TavernDB_ACU_IsolatedData[currentIsolationKey] = {};
      }

      const tagData = latestMessage.TavernDB_ACU_IsolatedData[currentIsolationKey];
      if (!tagData.independentData) {
          tagData.independentData = {};
      }

      // 遍历模板中的所有表格，使用模板数据覆盖本地数据
      Object.keys(templateData).forEach(sheetKey => {
          if (!sheetKey.startsWith('sheet_')) return;

          const templateTable = templateData[sheetKey];
          if (!templateTable || !templateTable.name) return;

          // 创建覆盖数据：保留表头，清空数据行
          const overrideTable = JSON.parse(JSON.stringify(templateTable));
          if (overrideTable.content && overrideTable.content.length > 1) {
              overrideTable.content = [overrideTable.content[0]]; // 只保留表头
          }

          // 覆盖本地数据
          tagData.independentData[sheetKey] = overrideTable;
          modified = true;

          logDebug_ACU(`Overrode table "${templateTable.name}" (${sheetKey}) in latest layer with template data.`);
      });

      if (modified) {
          // 更新修改标记
          tagData.modifiedKeys = Object.keys(tagData.independentData);
          tagData.updateGroupKeys = tagData.modifiedKeys;

          // 保存聊天记录
          await SillyTavern_API_ACU.saveChat();

          // 刷新内存和UI
          await loadOrCreateJsonTableFromChatHistory_ACU();
          await refreshMergedDataAndNotifyWithUI_ACU();

          showToastr_ACU('success', `已使用通用模板覆盖最新层的${Object.keys(templateData).filter(k => k.startsWith('sheet_')).length}个表格数据。`);
      } else {
          showToastr_ACU('warning', '没有找到需要覆盖的表格数据。');
      }
  }

  export async function resetTableTemplate_ACU({ showToast = true, updatePresetSelection = true, _refreshUi = true, overwriteReason = 'reset_template', scope = 'global', source = '' } = {}) {
    const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
    try {
        const snapshot = getDefaultTemplateSnapshot_ACU();
        if (!snapshot?.templateStr) {
            throw new Error('无法解析默认模板。');
        }

        const result = await applyTemplateSnapshotToScope_ACU(snapshot.templateStr, {
            scope: normalizedScope,
            source: source || overwriteReason || (normalizedScope === 'chat' ? 'ui_chat_reset' : 'ui_global_reset'),
            presetName: '',
            save: true,
            persistChatScope: normalizedScope === 'chat',
        });
        if (!result) {
            throw new Error('应用默认模板快照失败。');
        }

        if (showToast) {
            if (normalizedScope === 'chat') {
                showToastr_ACU('success', '当前聊天模板已恢复为默认值！仅影响当前聊天，不会改动全局模板。');
            } else {
                showToastr_ACU('success', '全局模板已恢复为默认值！模板已更新，但不会影响当前聊天记录的本地数据。');
            }
        }
        logDebug_ACU(`Table template has been reset to default for scope: ${normalizedScope}. updatePresetSelection=${updatePresetSelection}`);
        return true;
    } catch (error) {
        logError_ACU('恢复默认模板失败:', error);
        if (showToast) {
            showToastr_ACU('error', '恢复默认模板失败，请检查控制台获取详情。');
        }
        return false;
    }
  }

  export function importTableTemplate_ACU({ scope = 'global' } = {}) {
    const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = (e.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            try {
                const content = String(readerEvent?.target?.result || '');
                const prepared = parseImportedTemplateData_ACU(content);
                const derivedPresetName = deriveTemplatePresetNameForImport_ACU({
                    filename: file?.name,
                    fallbackLabel: normalizedScope === 'global'
                        ? `导入模板_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
                        : '',
                });

                let savePresetOk = false;
                if (normalizedScope === 'global' && derivedPresetName) {
                    try {
                        savePresetOk = upsertTemplatePreset_ACU(derivedPresetName, prepared.templateStr);
                    } catch (presetError) {
                        savePresetOk = false;
                        logWarn_ACU('[TemplateScope] 导入全局模板后保存预设失败:', presetError);
                    }
                }

                const applied = await applyTemplateSnapshotToScope_ACU(prepared.templateStr, {
                    scope: normalizedScope,
                    source: normalizedScope === 'chat' ? 'ui_chat_import' : 'ui_global_import',
                    presetName: derivedPresetName,
                    save: true,
                    persistChatScope: normalizedScope === 'chat',
                });
                if (!applied) {
                    throw new Error('模板已解析，但应用模板快照失败。');
                }

                if (normalizedScope === 'chat') {
                    showToastr_ACU('success', `当前聊天模板快照已导入${derivedPresetName ? `（预设名：${derivedPresetName}）` : ''}。`, {
                        acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                    });
                } else if (savePresetOk) {
                    showToastr_ACU('success', `模板已导入，并保存为全局预设：${derivedPresetName}（同名自动覆盖）`, {
                        acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                    });
                } else if (derivedPresetName) {
                    showToastr_ACU('success', `模板已成功导入到全局！当前全局模板已标记为：${derivedPresetName}；但保存到预设库失败。`, {
                        acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                    });
                } else {
                    showToastr_ACU('success', '模板已成功导入到全局！', {
                        acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                    });
                }
                logDebug_ACU(`[TemplateScope] Template imported for scope: ${normalizedScope}.`);
            } catch (error) {
                logError_ACU('导入模板失败：', error);
                showToastr_ACU('error', `导入失败: ${error.message}`, {
                    acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
                    timeOut: 10000,
                });
            }
        };
        reader.onerror = error => {
            logError_ACU('导入模板失败：文件读取失败。', error);
            showToastr_ACU('error', '读取模板文件失败，请重试。', {
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
                timeOut: 10000,
            });
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  // --- [New Visualizer & Inheritance Module] ---

  // CSS for the Visualizer - 墨韵清雅设计系统（古典中国风）