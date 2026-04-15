/**
 * service/runtime/helpers-data-merge.ts — 数据合并/格式化/首楼初始化/阈值
 * 从 helpers-remaining.ts 拆出
 */
import { deriveTemplatePresetNameForImport_ACU } from '../../shared/template-preset-utils';
import { TABLE_ORDER_FIELD_ACU } from '../../shared/constants';
import { currentJsonTableData_ACU, getCurrentIsolationKey_ACU, independentTableStates_ACU, settings_ACU, suppressWorldbookInjectionInGreeting_ACU, _set_suppressWorldbookInjectionInGreeting_ACU, _set_currentJsonTableData_ACU } from './state-manager';
import { getChatArray_ACU, saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { applyTemplateScopeForCurrentChat_ACU, saveSettings_ACU } from '../settings/settings-service';
import { buildChatSheetGuideDataFromTemplateObj_ACU, getChatSheetGuideDataForIsolationKey_ACU, getSortedSheetKeys_ACU, materializeDataFromSheetGuide_ACU, reorderDataBySheetKeys_ACU, sanitizeTemplateSnapshotForChat_ACU, setChatSheetGuideDataForIsolationKey_ACU } from '../template/chat-scope';
import { deleteAllGeneratedEntries_ACU } from '../worldbook/pipeline';
import { ensureSheetOrderNumbers_ACU, isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { getTemplateSheetKeys_ACU } from '../template/chat-scope';
import { upsertTemplatePreset_ACU } from '../template/template-preset-service';
import { readIsolatedTagData_ACU, readLegacyIndependentData_ACU, readLegacyStandardData_ACU, readLegacySummaryData_ACU, readModifiedKeys_ACU, readUpdateGroupKeys_ACU, readMessageIdentity_ACU, isLegacyMatchForIsolation_ACU, initIsolatedTagSlot_ACU, writeLegacyCompatData_ACU } from '../../data/repositories/chat-message-data-repo';

  export async function mergeAllIndependentTables_ACU() {
      const chat = getChatArray_ACU();
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
      let mergedData: Record<string, any> = {};
      const foundSheets: Record<string, boolean> = {};

      for (let i = chat.length - 1; i >= 0; i--) {
          const message = chat[i];
          if (message.is_user) continue;

          // [优先级1] 检查新版按标签分组存储
          const tagData = readIsolatedTagData_ACU(message, currentIsolationKey);
          if (tagData) {
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
          const isolationConfig = { enabled: settings_ACU.dataIsolationEnabled, code: settings_ACU.dataIsolationCode };
          const isLegacyMatch = isLegacyMatchForIsolation_ACU(message, isolationConfig);

          if (isLegacyMatch) {
              // 检查旧版独立数据格式
              const legacyIndepData = readLegacyIndependentData_ACU(message);
              if (legacyIndepData) {
                  const independentData = legacyIndepData;
                  const modifiedKeys = readModifiedKeys_ACU(message);
                  const updateGroupKeys = readUpdateGroupKeys_ACU(message);

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
              const legacyStdData = readLegacyStandardData_ACU(message);
              if (legacyStdData) {
                  const standardData: any = legacyStdData;
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
              const legacySumData = readLegacySummaryData_ACU(message);
              if (legacySumData) {
                  const summaryData: any = legacySumData;
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

  export function formatJsonToReadable_ACU(jsonData: Record<string, any> | null) {
    if (!jsonData) return { readableText: "数据库为空。", importantPersonsTable: null as any, summaryTable: null as any, outlineTable: null as any };

    let readableText = '';
    let importantPersonsTable = null;
    let summaryTable = null;
    let outlineTable = null;
    // No longer need globalDataTable here as it's part of the main text.

    const tableIndexes = getSortedSheetKeys_ACU(jsonData);
    
    tableIndexes.forEach((sheetKey: string, tableIndex: number) => {
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
            rows.forEach((row: any[]) => {
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

  function isNewChatGreetingStage_ACU(chat: any[]) {
      if (!Array.isArray(chat) || chat.length === 0) return false;
      const hasAnyUserMessage = chat.some(m => m && m.is_user);
      if (hasAnyUserMessage) return false;
      const firstAiIndex = chat.findIndex(m => m && !m.is_user);
      return firstAiIndex !== -1;
  }

  // [健全性] 你要求的监视点：任何"仅单一AI楼层、没有任何User回复"的聊天记录，都不进行世界书注入
  function isSingleAiNoUserChat_ACU(chat: any[]) {
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
      const chat = getChatArray_ACU();
      if (!Array.isArray(chat)) return;
      const hasAnyUserMessage = chat.some(m => m && m.is_user);
      if (hasAnyUserMessage) {
          _set_suppressWorldbookInjectionInGreeting_ACU(false);
          logDebug_ACU('[Worldbook] Greeting-stage suppression lifted (user message detected).');
      }
  }

  function buildTemplateBaseStateDataForLocalStorage_ACU(templateObj: Record<string, any> | null) {
      if (!templateObj || typeof templateObj !== 'object') return null;
      const out: Record<string, any> = { mate: { type: 'chatSheets', version: 1 } };
      const sheetKeys = Object.keys(templateObj).filter(k => k.startsWith('sheet_'));
      if (sheetKeys.length === 0) return null;
      sheetKeys.forEach(k => {
          out[k] = JSON.parse(JSON.stringify(templateObj[k]));
      });
      return out;
  }

  async function seedGreetingLocalDataFromTemplate_ACU() {
      try {
          const chat = getChatArray_ACU();
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
          const tagData = initIsolatedTagSlot_ACU(greetingMsg, isolationKey);

          // 写入 independentData（只写 sheet_，不强制 modifiedKeys）
          const indep: Record<string, any> = {};
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
          writeLegacyCompatData_ACU(greetingMsg, JSON.parse(JSON.stringify(indep)), [], []);

          // 标记幂等
          greetingMsg._acu_local_template_base_state_seeded = GREETING_LOCAL_BASE_STATE_MARKER_ACU;

          // 不在这里做全局注入抑制；
          // 是否真正创建世界书条目，交给后续各条目逻辑按"是否存在真实有效数据"决定。
          _set_suppressWorldbookInjectionInGreeting_ACU(false);

          await saveChatToHost_ACU();

          // [关键] 新开对话时应清理旧的世界书条目，但仍不能创建新条目。
          // 这里主动清理一次，确保"开场白阶段不注入，但旧条目会被清掉"。
          try {
              await deleteAllGeneratedEntries_ACU();
              logDebug_ACU('[Worldbook] Deleted generated entries on new chat greeting seed (cleanup-only).');
          } catch (e) {
              logWarn_ACU('[Worldbook] Cleanup on greeting seed failed:', e);
          }

          // 更新内存（但不触发世界书注入）
          _set_currentJsonTableData_ACU(reorderDataBySheetKeys_ACU(JSON.parse(JSON.stringify(baseData)), getSortedSheetKeys_ACU(baseData)));
          return { success: true, messageIndex: firstAiIndex };
      } catch (e) {
          logWarn_ACU('[GreetingLocalBaseState] Failed to seed greeting local data from template:', e);
          return { success: false };
      }
  }

  // [新增] 直接将模板数据填充到第一楼的实际表格数据
  // 用于 initGameSession 场景，确保模板中的所有表格数据（包括种子数据）都被写入第一楼
  export async function fillFirstLayerWithTemplateData_ACU(templateObj: Record<string, any>, { reason = 'game_init', presetName = '', source = 'game_init', registerPreset = true } = {}) {
      try {
          const chat = getChatArray_ACU();
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
          const fullData: Record<string, any> = { mate: { type: 'chatSheets', version: 1 } };
          sheetKeys.forEach(k => {
              fullData[k] = JSON.parse(JSON.stringify(templateObj[k]));
          });

          const isolationKey = getCurrentIsolationKey_ACU();

          // 写入新版格式
          const tagData = initIsolatedTagSlot_ACU(firstMsg, isolationKey);

          // 写入 independentData（包含所有表格的完整数据）
          const indep: Record<string, any> = {};
          sheetKeys.forEach(k => {
              indep[k] = JSON.parse(JSON.stringify(fullData[k]));
          });
          tagData.independentData = indep;
          tagData.modifiedKeys = [];
          tagData.updateGroupKeys = [];

          // 同步旧格式（兼容老逻辑）
          writeLegacyCompatData_ACU(firstMsg, JSON.parse(JSON.stringify(indep)), [], []);

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
          await saveChatToHost_ACU();

          // 更新内存数据
          _set_currentJsonTableData_ACU(reorderDataBySheetKeys_ACU(JSON.parse(JSON.stringify(fullData)), getSortedSheetKeys_ACU(fullData)));

          logDebug_ACU(`[FillFirstLayer] 成功将模板数据填充到第一楼，共 ${sheetKeys.length} 个表格`);
          return { success: true, messageIndex: firstAiIndex, sheetCount: sheetKeys.length };
      } catch (e) {
          logError_ACU('[FillFirstLayer] 填充第一楼数据失败:', e);
          return { success: false };
      }
  }

  function parseReadableToJson_ACU(text: string) {
    if (!currentJsonTableData_ACU) {
        logError_ACU("Parsing failed: currentJsonTableData_ACU is not available.");
        return null;
    }

    try {
        // Create a deep clone to safely modify, preserving original metadata.
        const newJsonData = JSON.parse(JSON.stringify(currentJsonTableData_ACU)); 
        const tablesText = text.trim().split('# ').slice(1);

        const parsedSheetContents: Record<string, any[][]> = {};

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
