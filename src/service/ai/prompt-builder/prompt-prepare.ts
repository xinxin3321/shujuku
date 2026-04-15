/**
 * service/ai/prompt-builder/prompt-prepare.ts
 * AI 输入准备 — 格式化表格数据和对话内容为 AI 可读文本
 * 从 prompt-builder.ts 拆出（L14-L194）
 */
import { manualExtraHint_ACU } from '../../runtime/state-manager';
import { currentJsonTableData_ACU, settings_ACU } from '../../runtime/state-manager';
import { getUserName_ACU } from '../../../data/gateways/host-state-gateway';
import { attachSeedRowsToCurrentDataFromGuide_ACU, ensureChatSheetGuideSeeded_ACU, getEffectiveSeedRowsForSheet_ACU, getSortedSheetKeys_ACU } from '../../template/chat-scope';
import { getCombinedWorldbookContent_ACU } from '../../worldbook/pipeline';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, normalizeExcludeRules_ACU, normalizeExtractRules_ACU } from '../../../shared/utils';
import { applyContextTagFilters_ACU } from '../../runtime/helpers-remaining';

  export async function prepareAIInput_ACU(messages: any[], updateMode = 'standard', targetSheetKeys: string[] | null = null, options: any = {}) {
    if (!currentJsonTableData_ACU) {
        logError_ACU('prepareAIInput_ACU: Cannot prepare AI input, currentJsonTableData_ACU is null.');
        return null;
    }

    let _seedGuideDataForThisPrepare_ACU = null;
    try {
        _seedGuideDataForThisPrepare_ACU = await ensureChatSheetGuideSeeded_ACU({ reason: 'prepare_ai_input_seedrows' });
        if (_seedGuideDataForThisPrepare_ACU) {
            attachSeedRowsToCurrentDataFromGuide_ACU(_seedGuideDataForThisPrepare_ACU);
        }
    } catch (e) {}

    let tableDataText = '';
    let _seedRowsTablesUsed_ACU: string[] = [];
    const tableIndexes = getSortedSheetKeys_ACU(currentJsonTableData_ACU);
    tableIndexes.forEach((sheetKey, tableIndex) => {
        const table = currentJsonTableData_ACU[sheetKey];
        if (!table || !table.name || !table.content) return;

        if (targetSheetKeys && Array.isArray(targetSheetKeys)) {
            if (!targetSheetKeys.includes(sheetKey)) return;
        }

        const isSummaryTable = isSummaryOrOutlineTable_ACU(table.name);
        let shouldShowData = true;
        
        if (!targetSheetKeys) {
            const isUnifiedMode = (updateMode === 'full' || updateMode === 'manual_unified' || updateMode === 'auto_unified');
            const isStandardMode = (updateMode === 'standard' || updateMode === 'auto_standard' || updateMode === 'manual_standard');
            const isSummaryMode = (updateMode === 'summary' || updateMode === 'auto_summary_silent' || updateMode === 'manual_summary');
            
            if (isUnifiedMode) {
                 shouldShowData = true;
            } else if (isStandardMode && isSummaryTable) {
                shouldShowData = false;
            } else if (isSummaryMode && !isSummaryTable) {
                shouldShowData = false;
            }
        }

        if (!shouldShowData) {
            return;
        }

        const allRows = table.content.slice(1);
        const seedRows = getEffectiveSeedRowsForSheet_ACU(sheetKey, { guideData: _seedGuideDataForThisPrepare_ACU, allowTemplateFallback: true });
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

        if (effectiveAllRows.length === 0) {
            tableDataText += `[${tableIndex}:${table.name}]\n`;
            const headers = table.content[0] ? table.content[0].slice(1).map((h: any, i: number) => `[${i}:${h}]`).join(', ') : 'No Headers';
            tableDataText += `  Columns: ${headers}\n`;

            if (table.sourceData) {
                tableDataText += `  - Note: ${table.sourceData.note || 'N/A'}\n`;
                const initNodeContent = table.sourceData.initNode || table.sourceData.insertNode || 'N/A';
                tableDataText += `  - Init Trigger: ${initNodeContent}\n`;
            }
            tableDataText += `  (该表格为空，请进行初始化。)\n\n`;
        } else {
            tableDataText += `[${tableIndex}:${table.name}]\n`;
            const headers = table.content[0] ? table.content[0].slice(1).map((h: any, i: number) => `[${i}:${h}]`).join(', ') : 'No Headers';
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

            const isSummaryTable = (table.name.trim() === '纪要表' || table.name.trim() === '总结表');
            if (isSummaryTable && effectiveAllRows.length > 10) {
                startIndex = effectiveAllRows.length - 10;
                rowsToProcess = effectiveAllRows.slice(-10);
                tableDataText += `  - Note: Showing last ${rowsToProcess.length} of ${effectiveAllRows.length} entries (summary table fixed limit).\n`;
            } else if (!isSummaryTable) {
                const sendLatestRows = (table.updateConfig && typeof table.updateConfig.sendLatestRows === 'number')
                    ? table.updateConfig.sendLatestRows : -1;
                if (sendLatestRows > 0 && effectiveAllRows.length > sendLatestRows) {
                    startIndex = effectiveAllRows.length - sendLatestRows;
                    rowsToProcess = effectiveAllRows.slice(-sendLatestRows);
                    tableDataText += `  - Note: Showing last ${rowsToProcess.length} of ${effectiveAllRows.length} entries (sendLatestRows=${sendLatestRows}).\n`;
                }
            }

            if (rowsToProcess.length > 0) {
                rowsToProcess.forEach((row: any, index: number) => {
                    const originalRowIndex = startIndex + index;
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
    
    let messagesText = '当前最新对话内容:\n';
    if (messages && messages.length > 0) {
        const extractTags = (settings_ACU.tableContextExtractTags || '').trim();
        const extractRules = normalizeExtractRules_ACU(settings_ACU.tableContextExtractRules, extractTags);
        const excludeTags = (settings_ACU.tableContextExcludeTags || '').trim();
        const excludeRules = normalizeExcludeRules_ACU(settings_ACU.tableContextExcludeRules, excludeTags);

        messagesText += messages.map((msg: any) => {
            const prefix = msg.is_user ? getUserName_ACU() : msg.name || '角色';
            let content = msg.mes || msg.message || '';

            if (!msg.is_user && (extractTags || extractRules.length > 0 || excludeTags || excludeRules.length > 0)) {
                content = applyContextTagFilters_ACU(content, { extractTags, extractRules, excludeTags, excludeRules });
            }

            return `${prefix}: ${content}`;
        }).join('\n');
    } else {
        messagesText += '(无最新对话内容)';
    }

    const worldbookScanText = messagesText;
    const excludeImportTaggedWorldbookEntries = options?.excludeImportTaggedWorldbookEntries === true;
    const worldbookContent = await getCombinedWorldbookContent_ACU(worldbookScanText, {
        excludeImportTaggedEntries: excludeImportTaggedWorldbookEntries,
    });
    const manualExtraHintText = manualExtraHint_ACU || '';

    return { tableDataText, messagesText, worldbookContent, manualExtraHint: manualExtraHintText };
}
