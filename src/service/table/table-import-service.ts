import type { TableDataObject_ACU } from '../../shared/models/table-data';
import { isSummaryOrOutlineTable_ACU } from '../../shared/utils';
import { getChatArray_ACU } from '../chat/chat-service';
import { currentJsonTableData_ACU, getCurrentIsolationKey_ACU } from '../runtime/state-manager';
import { sanitizeChatSheetsObject_ACU } from '../template/chat-scope';
import { getStorageProvider } from './table-storage-strategy';
import { runTableUpdateCommit_ACU } from './table-update-commit';

export interface ImportTableJsonCommitResult_ACU {
  success: boolean;
  messageIndex?: number;
  tableData?: TableDataObject_ACU;
  sheetKeys?: string[];
  hasSummaryTables?: boolean;
  error?: string;
}

function resolveLatestAiMessageIndex_ACU(): number {
  const chat = getChatArray_ACU();
  if (!Array.isArray(chat) || chat.length === 0) return -1;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i] && !chat[i].is_user) return i;
  }
  return -1;
}

export async function importTableJsonThroughCommit_ACU(jsonString: string): Promise<ImportTableJsonCommitResult_ACU> {
  const newData = JSON.parse(jsonString);
  if (!newData || !newData.mate || !Object.keys(newData).some(k => k.startsWith('sheet_'))) {
    return { success: false, error: '导入的JSON缺少关键结构 (mate, sheet_*)。' };
  }

  const importedTableData = sanitizeChatSheetsObject_ACU(newData, { ensureMate: true }) as TableDataObject_ACU;
  const sheetKeys = Object.keys(importedTableData).filter(k => k.startsWith('sheet_'));
  const targetMessageIndex = resolveLatestAiMessageIndex_ACU();

  const commitResult = await runTableUpdateCommit_ACU<boolean>({
    source: 'import',
    reason: 'importTableAsJson',
    isolationKey: getCurrentIsolationKey_ACU(),
    writeSet: [{ kind: 'all' }],
    revisionWriteSet: [{ kind: 'all' }],
    initialData: currentJsonTableData_ACU,
    targetMessageIndex,
    targetSheetKeys: sheetKeys,
    updateGroupKeys: sheetKeys,
    trackingSheetKeys: sheetKeys,
    trackAsUpdate: true,
    operations: [{ kind: 'data_replace', data: importedTableData, reason: 'import' }],
  }, async () => {
    const provider = getStorageProvider();
    if (typeof provider.replaceAllData !== 'function') {
      return { success: false, error: '当前存储 provider 不支持全量替换命令。' };
    }
    const replaceResult = await provider.replaceAllData(importedTableData);
    if (!replaceResult.success) {
      return { success: false, error: replaceResult.error || '运行时全量替换失败。' };
    }
    const runtimeData = provider.getCurrentData() || importedTableData;
    return {
      success: true,
      value: true,
      tableData: runtimeData as TableDataObject_ACU,
    };
  });

  if (!commitResult.success || !commitResult.tableData) {
    return { success: false, error: commitResult.error || '导入数据提交失败。' };
  }

  const hasSummaryTables = Object.keys(commitResult.tableData)
    .filter(k => k.startsWith('sheet_'))
    .some(k => {
      const table = (commitResult.tableData as any)?.[k];
      return Boolean(table?.name && isSummaryOrOutlineTable_ACU(table.name));
    });

  return {
    success: true,
    messageIndex: commitResult.messageIndex ?? targetMessageIndex,
    tableData: commitResult.tableData,
    sheetKeys,
    hasSummaryTables,
  };
}
