import { showToastr_ACU } from '../../presentation/theme/toast';
import { SillyTavern_API_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU , _set_currentJsonTableData_ACU} from '../../service/runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU } from '../../service/settings/settings-service';
import { attachSeedRowsToCurrentDataFromGuide_ACU, buildChatSheetGuideDataFromData_ACU, ensureChatSheetGuideSeeded_ACU, getChatSheetGuideDataForIsolationKey_ACU, getSortedSheetKeys_ACU, sanitizeSheetForStorage_ACU, setChatSheetGuideDataForIsolationKey_ACU } from '../../service/template/chat-scope';
import { deleteAllGeneratedEntries_ACU, refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { mergeAllIndependentTables_ACU } from '../../service/runtime/helpers-remaining';
/**
 * data/repositories/table-repo.ts — 表格数据 CRUD
 * 从 src/core/05_core_tail.js:2409~2693 迁移而来。
 */
  export async function saveIndependentTableToChatHistory_ACU(targetMessageIndex = -1, targetSheetKeys = null, updateGroupKeys = null, skipPostRefresh = false) {
    if (!currentJsonTableData_ACU) {
        logError_ACU('Save aborted: currentJsonTableData_ACU is null.');
        return false;
    }

    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) {
        logError_ACU('Save failed: Chat history is empty.');
        return false;
    }

    let targetMessage = null;
    let finalIndex = -1;

    if (targetMessageIndex !== -1 && chat[targetMessageIndex] && !chat[targetMessageIndex].is_user) {
        targetMessage = chat[targetMessageIndex];
        finalIndex = targetMessageIndex;
    } else {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user) {
                targetMessage = chat[i];
                finalIndex = i;
                break;
            }
        }
    }

    if (!targetMessage) {
        logWarn_ACU('Save failed: No AI message found.');
        return false;
    }

    // [数据隔离核心] 获取当前隔离标签键名
    // 无标签使用空字符串 ""，有标签使用标签代码
    const currentIsolationKey = getCurrentIsolationKey_ACU();

    // [新增] 首次填表后：在聊天记录第一层写入“空白指导表”（仅表头+参数，无数据行）
    // 说明：只在当前隔离标签槽位未存在时写入；后续不会自动覆盖，避免无意漂移
    try {
        const existingGuide = getChatSheetGuideDataForIsolationKey_ACU(currentIsolationKey);
        if (!existingGuide || !Object.keys(existingGuide).some(k => k.startsWith('sheet_'))) {
            // 需求1：首次生成指导表时，把模板预置数据写入指导表基础数据(seedRows)
            const templateObjForSeed = parseTableTemplateJson_ACU({ stripSeedRows: false });
            const guideData = buildChatSheetGuideDataFromData_ACU(currentJsonTableData_ACU, {
                preserveSeedRowsFromGuideData: null,
                seedRowsFromTemplateObj: templateObjForSeed,
            });
            if (guideData && Object.keys(guideData).some(k => k.startsWith('sheet_'))) {
                setChatSheetGuideDataForIsolationKey_ACU(currentIsolationKey, guideData, { reason: 'first_fill' });
                logDebug_ACU(`[SheetGuide] Created chat sheet guide for tag [${currentIsolationKey || '无标签'}] (tables=${Object.keys(guideData).filter(k => k.startsWith('sheet_')).length}).`);
            }
        }
    } catch (e) {
        logWarn_ACU('[SheetGuide] Failed to create sheet guide on first fill:', e);
    }

    // [数据隔离核心] 使用按标签分组的存储结构
    // 结构: targetMessage.TavernDB_ACU_IsolatedData = { 
    //   "": { independentData: {...}, modifiedKeys: [...], updateGroupKeys: [...] },  // 无标签
    //   "tag1": { independentData: {...}, modifiedKeys: [...], updateGroupKeys: [...] }  // 标签1
    // }
    let isolatedData = targetMessage.TavernDB_ACU_IsolatedData ? JSON.parse(JSON.stringify(targetMessage.TavernDB_ACU_IsolatedData)) : {};
    
    // 获取或创建当前标签的数据槽
    if (!isolatedData[currentIsolationKey]) {
        isolatedData[currentIsolationKey] = {
            independentData: {},
            modifiedKeys: [],
            updateGroupKeys: []
        };
    }
    
    let currentTagData = isolatedData[currentIsolationKey];
    let independentData = currentTagData.independentData || {};

    // [重要] 记录本次实际被修改的表格 key（用于轮次计数）
    const actuallyModifiedKeys = targetSheetKeys ? [...targetSheetKeys] : [];

    // 确定要保存哪些表
    let keysToSave = targetSheetKeys;
    
    // 如果没有指定要更新哪些表，则默认更新所有（兼容旧逻辑）
    if (!keysToSave) {
        keysToSave = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
    }

    keysToSave.forEach(sheetKey => {
        const table = currentJsonTableData_ACU[sheetKey];
        if (table) {
            // [瘦身] 写入聊天记录的本地表格数据时清洗冗余字段
            independentData[sheetKey] = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(table)));
        }
    });

    // 更新当前标签的数据槽
    currentTagData.independentData = independentData;
    
    // 记录实际被修改的表格 key
    if (actuallyModifiedKeys.length > 0) {
        const existingModifiedKeys = currentTagData.modifiedKeys || [];
        currentTagData.modifiedKeys = [...new Set([...existingModifiedKeys, ...actuallyModifiedKeys])];
        logDebug_ACU(`[Tracking] Recorded modified keys for tag [${currentIsolationKey || '无标签'}] at index ${finalIndex}: ${currentTagData.modifiedKeys.join(', ')}`);
    }
    
    // 记录参与合并更新的表格组
    if (updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length > 0) {
        const existingGroupKeys = currentTagData.updateGroupKeys || [];
        currentTagData.updateGroupKeys = [...new Set([...existingGroupKeys, ...updateGroupKeys])];
        logDebug_ACU(`[Merge Update Success] Group keys for tag [${currentIsolationKey || '无标签'}] recorded at index ${finalIndex}: ${currentTagData.updateGroupKeys.join(', ')}`);
    } else if (updateGroupKeys && updateGroupKeys.length > 0 && actuallyModifiedKeys.length === 0) {
        logDebug_ACU(`[Merge Update Failed] No tables were modified for tag [${currentIsolationKey || '无标签'}]. Group keys NOT recorded: ${updateGroupKeys.join(', ')}`);
    }

    // 写入消息对象（按标签分组存储）
    isolatedData[currentIsolationKey] = currentTagData;
    targetMessage.TavernDB_ACU_IsolatedData = isolatedData;

    // [兼容性] 同时更新旧的存储格式（仅用于当前标签）
    // 设置标识代码以标记这条消息最后是由哪个标签保存的（用于旧版兼容）
    if (settings_ACU.dataIsolationEnabled) {
         targetMessage.TavernDB_ACU_Identity = settings_ACU.dataIsolationCode;
    } else {
         delete targetMessage.TavernDB_ACU_Identity;
    }
    
    // 更新旧格式的独立数据（仅当前标签）
    targetMessage.TavernDB_ACU_IndependentData = independentData;
    targetMessage.TavernDB_ACU_ModifiedKeys = currentTagData.modifiedKeys;
    targetMessage.TavernDB_ACU_UpdateGroupKeys = currentTagData.updateGroupKeys;

    logDebug_ACU(`Saved ${keysToSave.length} tables for tag [${currentIsolationKey || '无标签'}] to message at index ${finalIndex}. Actually modified: ${actuallyModifiedKeys.length} tables.`);

    // [兼容性] 为了保持向后兼容，更新旧的标准表/总结表字段
    const legacyStandardData = { mate: { type: 'chatSheets', version: 1 } };
    const legacySummaryData = { mate: { type: 'chatSheets', version: 1 } };
    
    keysToSave.forEach(sheetKey => {
        const table = currentJsonTableData_ACU[sheetKey];
        if (table) {
            if (isSummaryOrOutlineTable_ACU(table.name)) {
                legacySummaryData[sheetKey] = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(table)));
            } else {
                legacyStandardData[sheetKey] = sanitizeSheetForStorage_ACU(JSON.parse(JSON.stringify(table)));
            }
        }
    });
    
    if (Object.keys(legacyStandardData).some(k => k.startsWith('sheet_'))) {
        targetMessage.TavernDB_ACU_Data = legacyStandardData;
    }
    if (Object.keys(legacySummaryData).some(k => k.startsWith('sheet_'))) {
        targetMessage.TavernDB_ACU_SummaryData = legacySummaryData;
    }

    await SillyTavern_API_ACU.saveChat();
    
    // [修复] 增加延时，确保文件系统写入完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 保存后刷新内存和通知（可选跳过，用于批量保存时避免中间刷新导致UI回退）
    if (!skipPostRefresh) {
        await refreshMergedDataAndNotify_ACU();
    }

    return true;
  }

  /**
   * [优化] 检查是否是首次初始化（聊天记录中没有任何当前标签的数据库记录）
   * 用于判断是否需要保存完整的模板结构
   */
  export async function checkIfFirstTimeInit_ACU() {
    const chat = SillyTavern_API_ACU.chat;
    if (!chat || chat.length === 0) return true;
    
    const currentIsolationKey = getCurrentIsolationKey_ACU();
    
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (message.is_user) continue;
        
        // 检查新版按标签分组存储
        if (message.TavernDB_ACU_IsolatedData && message.TavernDB_ACU_IsolatedData[currentIsolationKey]) {
            const tagData = message.TavernDB_ACU_IsolatedData[currentIsolationKey];
            if (tagData.independentData && Object.keys(tagData.independentData).some(k => k.startsWith('sheet_'))) {
                return false; // 找到了数据，不是首次初始化
            }
        }
        
        // 兼容旧版存储格式
        if (message.TavernDB_ACU_IndependentData) {
            const msgIdentity = message.TavernDB_ACU_Identity;
            let isMatch = false;
            if (settings_ACU.dataIsolationEnabled) {
                isMatch = (msgIdentity === settings_ACU.dataIsolationCode);
            } else {
                isMatch = !msgIdentity;
            }
            if (isMatch && Object.keys(message.TavernDB_ACU_IndependentData).some(k => k.startsWith('sheet_'))) {
                return false; // 找到了数据，不是首次初始化
            }
        }
    }
    
    return true; // 没找到任何数据，是首次初始化
  }

  async function initializeJsonTableInChatHistory_ACU() {
    logDebug_ACU('No database found in chat history. Initializing a new one from template.');
    
    // 步骤2：安全地在内存中创建数据库
    try {
        // [修复] 初始化内存数据库时，只使用“表结构”（避免模板自带数据被当作当前数据）
        _set_currentJsonTableData_ACU(parseTableTemplateJson_ACU({ stripSeedRows: true }));
        logDebug_ACU('Successfully initialized database in memory.');
    } catch (error) {
        logError_ACU('Failed to parse template and initialize database in memory:', error);
        showToastr_ACU('error', '从模板解析数据库失败，请检查模板格式。');
        _set_currentJsonTableData_ACU(null);
        return false;
    }
    if (!currentJsonTableData_ACU) {
        showToastr_ACU('error', '从模板解析数据库失败，请检查模板格式。');
        return false;
    }

    // [逻辑优化] 不再将空白模板保存到聊天记录中。
    // 数据库将在内存中初始化，并在第一次成功更新后，连同更新内容一起保存到对应的AI消息中。
    logDebug_ACU('Database initialized in memory. It will be saved to chat history on the first update.');

    // [新增] 新对话初始化阶段：确保"第一层空白指导表"存在，并把模板预置数据写入 seedRows 字段
    // 关键点：只写 seedRows 字段，不写入 content（避免新对话误显示为"已有数据"）
    try {
        const guideData = await ensureChatSheetGuideSeeded_ACU({ reason: 'init_chat_seedrows' });
        // 同步把 seedRows 字段挂到 currentJsonTableData_ACU（只挂字段，不改变 content），确保新对话首次 $0 就能读到
        if (guideData) {
            attachSeedRowsToCurrentDataFromGuide_ACU(guideData);
        }
    } catch (e) {
        logWarn_ACU('[SheetGuide] Failed to ensure sheet guide during initialization:', e);
    }

    // 步骤4：删除所有由本插件生成的旧世界书条目
    try {
        await deleteAllGeneratedEntries_ACU();
        logDebug_ACU('Deleted all generated lorebook entries during initialization.');
    } catch (deleteError) {
        logWarn_ACU('Failed to delete generated lorebook entries during initialization:', deleteError);
    }
    
    return true;
  }

  export async function loadOrCreateJsonTableFromChatHistory_ACU() {
    _set_currentJsonTableData_ACU(null); // Reset before loading
    logDebug_ACU('Attempting to load database from chat history...');

    const chat = SillyTavern_API_ACU.chat;
    applyTemplateScopeForCurrentChat_ACU();
    if (!chat || chat.length === 0) {
      logDebug_ACU('Chat history is empty. Initializing new database.');
      await initializeJsonTableInChatHistory_ACU();
      return;
    }

    // [重构] 统一使用按标签合并逻辑读取当前标签的数据
    // 无标签也是标签的一种，因此直接调用 mergeAllIndependentTables_ACU
    const mergedData = await mergeAllIndependentTables_ACU();

    if (mergedData) {
        _set_currentJsonTableData_ACU(mergedData);
        logDebug_ACU('Database content successfully merged (tag-aware) and loaded into memory.');
        await refreshMergedDataAndNotify_ACU();
        return;
    }

    // If we get here, no data was found in the entire chat history
    logDebug_ACU('No database found for current tag in chat history. Initializing a new one.');
    await initializeJsonTableInChatHistory_ACU();
    if (currentJsonTableData_ACU) {
        await refreshMergedDataAndNotify_ACU();
    }
  }

