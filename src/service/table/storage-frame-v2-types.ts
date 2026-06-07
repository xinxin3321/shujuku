import type { Sheet_ACU, TableDataObject_ACU } from '../../shared/models/table-data';

export type TableMutationSourceV2_ACU =
  | 'auto_fill'
  | 'manual_fill'
  | 'group_fill'
  | 'manual_crud'
  | 'raw_sql_mutation'
  | 'raw_sql_batch'
  | 'import'
  | 'merge_summary'
  | 'template_assistant'
  | 'system';

export interface TableMutationEventV2_ACU {
  filledSheetKeys: string[];
  changedSheetKeys: string[];
  groupKeys?: string[];
  requestId?: string;
  batchId?: string;
  error?: string;
}

export interface TableCheckpointScheduleSummaryV2_ACU {
  lastFilledAiFloor?: number;
  lastChangedAiFloor?: number;
}

export interface TableCheckpointV2_ACU {
  kind: 'full';
  createdAt: number;
  reason: 'init' | 'periodic' | 'manual' | 'schema_change' | 'compaction' | 'import' | 'migration';
  data: TableDataObject_ACU;
  scheduleSummary?: Record<string, TableCheckpointScheduleSummaryV2_ACU>;
  event?: TableMutationEventV2_ACU;
}

export type TableMutationOperationV2_ACU =
  | TableSqlBatchOperationV2_ACU
  | TableEditDslOperationV2_ACU
  | TableRowUpsertPatchV2_ACU
  | TableRowDeletePatchV2_ACU
  | TableMetaPatchV2_ACU
  | TableSheetReplaceOperationV2_ACU
  | TableDataReplaceOperationV2_ACU;

export type TableSqlBindValueV2_ACU = string | number | null;

export interface TableSqlBatchOperationV2_ACU {
  kind: 'sql_batch';
  statements: string[];
  /** 与 statements 同索引的参数绑定；无参数语句可省略对应项或传空数组。 */
  params?: TableSqlBindValueV2_ACU[][];
}

export interface TableEditDslOperationV2_ACU {
  kind: 'table_edit_dsl';
  text: string;
  updateMode?: string;
}

export interface TableSheetReplaceOperationV2_ACU {
  kind: 'sheet_replace';
  sheetKey: string;
  sheet: Sheet_ACU;
  reason: 'manual_crud' | 'import' | 'system';
}

export interface TableDataReplaceOperationV2_ACU {
  kind: 'data_replace';
  data: TableDataObject_ACU;
  reason: 'checkpoint_fallback' | 'manual_crud' | 'import' | 'system';
}

// 旧 patch 结构仅用于兼容历史 V2 数据；新 V2 日志不再写 patches。
export type TablePatchV2_ACU =
  | TableRowUpsertPatchV2_ACU
  | TableRowDeletePatchV2_ACU
  | TableSheetReplacePatchV2_ACU
  | TableMetaPatchV2_ACU;

export interface TableRowUpsertPatchV2_ACU {
  kind: 'row_upsert';
  sheetKey: string;
  rowId: string;
  cells: (string | null)[];
}

export interface TableRowDeletePatchV2_ACU {
  kind: 'row_delete';
  sheetKey: string;
  rowId: string;
}

export interface TableSheetReplacePatchV2_ACU {
  kind: 'sheet_replace';
  sheetKey: string;
  sheet: Sheet_ACU;
  reason: 'schema_change' | 'unstable_row_id' | 'raw_sql_export' | 'import' | 'fallback';
}

export interface TableMetaPatchV2_ACU {
  kind: 'meta_update';
  sheetKey: string;
  meta: Partial<Pick<Sheet_ACU, 'name' | 'orderNo' | 'updateConfig' | 'exportConfig' | 'sourceData'>>;
}

export type TableWriteConflictUnitV2_ACU =
  | { kind: 'sheet'; sheetKey: string }
  | { kind: 'row'; sheetKey: string; rowId: string }
  | { kind: 'cell'; sheetKey: string; rowId: string; columnKey: string }
  | { kind: 'schema'; sheetKey: string }
  | { kind: 'all' };

export type TableMutationWriteSetV2_ACU = TableWriteConflictUnitV2_ACU[];

export interface TableMutationLogEntryV2_ACU extends TableMutationEventV2_ACU {
  seq: number;
  entryId: string;
  createdAt: number;
  source: TableMutationSourceV2_ACU;
  targetMessageIndex: number;
  aiFloor: number;
  operations: TableMutationOperationV2_ACU[];
  /** 兼容旧 V2 derived patch log；新写入不再使用。 */
  patches?: TablePatchV2_ACU[];
  baseRevision?: string | null;
  parentRevision?: string | null;
  commitRevision?: string;
  writeSet?: TableMutationWriteSetV2_ACU;
}

export interface TableStorageFrameV2_ACU {
  version: 2;
  headRevision?: string | null;
  checkpoint?: TableCheckpointV2_ACU;
  logEntries: TableMutationLogEntryV2_ACU[];
}
