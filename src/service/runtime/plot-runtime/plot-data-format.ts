/**
 * service/runtime/plot-runtime/plot-data-format.ts
 * 剧情推进 — 表格数据格式化（LLM 可读文本 / 大纲表 / 纪要索引）
 * 从 helpers-plot-runtime.ts 拆出（L26-L219）
 */
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { getCharLorebooks_ACU } from '../../../data/gateways/character-gateway';
import { getLorebookEntries_ACU } from '../../../data/gateways/worldbook-gateway';
import { getIsolationPrefix_ACU } from '../../worldbook/injection-engine';
import { currentSummaryVectorIndexRecall_ACU } from '../state-manager';

  export function formatTableDataForLLM_ACU(jsonData: any) {
    if (!jsonData || typeof jsonData !== 'object' || Object.keys(jsonData).length === 0) {
      return '当前无任何可用的表格数据。';
    }

    let output = '以下是当前角色聊天记录中，由st-memory-enhancement插件保存的全部表格数据：\n';

    for (const sheetId in jsonData) {
      if (Object.prototype.hasOwnProperty.call(jsonData, sheetId)) {
        const sheet = jsonData[sheetId];
        if (sheet && sheet.name && sheet.content && sheet.content.length > 1) {
          output += `\n## 表格: ${sheet.name}\n`;
          const headers = sheet.content[0].slice(1);
          const rows = sheet.content.slice(1);

          rows.forEach((row: any, rowIndex: number) => {
            const rowData = row.slice(1);
            let rowOutput = '';
            let hasContent = false;
            headers.forEach((header: any, index: number) => {
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

  /** 从世界书获取"纪要索引"条目内容（用于$5优先替换） */
  export async function getSummaryIndexContentForPlot_ACU(plotSettings: any) {
    try {
      const plotCfg = plotSettings?.plotWorldbookConfig;
      const worldbookSource = plotCfg?.source || 'character';
      let bookNames = [];
      
      if (worldbookSource === 'manual' && plotCfg?.manualSelection?.length) {
        bookNames = plotCfg.manualSelection;
      } else {
        try {
          const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
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
          const entries = await getLorebookEntries_ACU(bookName);
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

  /** [剧情推进专用] $5 只注入"总体大纲"表（含表头） */
  export function formatOutlineTableForPlot_ACU(allTablesJson: any) {
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
      const headers = headerRow.slice(1).map((h: any) => String(h ?? '').trim()).filter(Boolean);
      let out = `## 表格: 总体大纲\n`;
      out += headers.length ? `Columns: ${headers.join(', ')}\n` : 'Columns: (无表头)\n';

      const rows = outline.content.slice(1).filter((r: any) => Array.isArray(r));
      if (rows.length === 0) {
        out += '(无数据行)\n';
        return out;
      }

      rows.forEach((row: any, idx: number) => {
        const cells = row.slice(1);
        const parts: string[] = [];
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

  function normalizeSummaryIndexCell_ACU(value: any, fallback = ''): string {
    const normalized = String(value ?? '').replace(/\r?\n+/g, ' ').trim();
    return normalized || fallback;
  }

  function escapeMarkdownTableCell_ACU(value: any, fallback = ''): string {
    return normalizeSummaryIndexCell_ACU(value, fallback)
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|');
  }

  function buildSummaryIndexMarkdownTable_ACU(rows: any[]): string {
    let out = `| 时间跨度 | 地点 | 纪要 | 编码索引 |\n`;
    out += `|---|---|---|---|\n`;
    const safeRows = Array.isArray(rows) ? rows : [];
    if (safeRows.length === 0) {
      out += `| 未召回相关纪要 | 未召回相关纪要 | 未召回相关纪要 | 未召回相关纪要 |\n`;
      return out;
    }

    safeRows.forEach((row: any) => {
      const timeSpan = escapeMarkdownTableCell_ACU(row?.timeSpan, '未填写');
      const location = escapeMarkdownTableCell_ACU(row?.location, '未填写');
      const summary = escapeMarkdownTableCell_ACU(row?.summary, '未填写');
      const indexCode = escapeMarkdownTableCell_ACU(row?.indexCode, '未填写');
      out += `| ${timeSpan} | ${location} | ${summary} | ${indexCode} |\n`;
    });
    return out;
  }

  function wrapSummaryIndexWorldbookTag_ACU(content: string): string {
    return `<已发生的事件概览>\n\n${content.trim()}\n\n</已发生的事件概览>\n`;
  }

  export function formatSummaryVectorIndexRecallOverride_ACU(options: { wrapWorldbookTag?: boolean } = {}) {
    const override = currentSummaryVectorIndexRecall_ACU;
    if (!override || typeof override !== 'object' || override.mode !== 'summary_vector_index') {
      return null;
    }

    const rows = Array.isArray(override.rows) && override.isEmpty !== true ? override.rows : [];
    const tableContent = buildSummaryIndexMarkdownTable_ACU(rows);
    const content = options.wrapWorldbookTag === true
      ? wrapSummaryIndexWorldbookTag_ACU(tableContent)
      : tableContent;
    return { success: true, content };
  }

  /** [剧情推进专用] $5 从纪要表本地数据读取概要和编码索引两列 */
  export function formatSummaryIndexForPlot_ACU(allTablesJson: any) {
    try {
      const override = formatSummaryVectorIndexRecallOverride_ACU();
      if (override) {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 使用纪要向量索引召回覆盖结果');
        return override;
      }

      if (!allTablesJson || typeof allTablesJson !== 'object') {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未获取到表格数据');
        return { success: false, content: '纪要索引：未获取到表格数据。' };
      }
      const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
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
      
      const resolveHeaderIndex_ACU = (aliases: string[], fallbackIndex = -1): number => {
        const normalizedAliases = aliases.map((item) => String(item || '').trim().replace(/\s+/g, ''));
        const foundIndex = headerRow.findIndex((h: any) => normalizedAliases.includes(String(h ?? '').trim().replace(/\s+/g, '')));
        return foundIndex >= 0 ? foundIndex : fallbackIndex;
      };
      const timeSpanColIdx = resolveHeaderIndex_ACU(['时间跨度', '时间', '阶段', '时段'], 0);
      const locationColIdx = resolveHeaderIndex_ACU(['地点', '位置', '场景', '场所'], 1);
      const summaryColIdx = resolveHeaderIndex_ACU(['概览', '概要', '概述', '摘要']);
      const indexColIdx = resolveHeaderIndex_ACU(['编码索引']);
      
      if (summaryColIdx === -1 || indexColIdx === -1) {
        logWarn_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未找到概要列或编码索引列，概要列索引=', summaryColIdx, ', 编码索引列索引=', indexColIdx);
        return { success: false, content: '纪要索引：未找到概要列或编码索引列。' };
      }

      const rows = summaryTable.content.slice(1).filter((r: any) => Array.isArray(r));
      if (rows.length === 0) {
        return { success: true, content: buildSummaryIndexMarkdownTable_ACU([]) };
      }

      const tableRows = rows.map((row: any) => ({
        timeSpan: timeSpanColIdx >= 0 ? row[timeSpanColIdx] : '',
        location: locationColIdx >= 0 ? row[locationColIdx] : '',
        summary: row[summaryColIdx],
        indexCode: row[indexColIdx],
      })).filter((row: any) => normalizeSummaryIndexCell_ACU(row.summary) || normalizeSummaryIndexCell_ACU(row.indexCode));
      logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 成功生成纪要索引，行数=', tableRows.length);
      return { success: true, content: buildSummaryIndexMarkdownTable_ACU(tableRows) };
    } catch (e) {
      logError_ACU('[剧情推进] 格式化纪要索引时出错:', e);
      return { success: false, content: '纪要索引：格式化时发生错误。' };
    }
  }
