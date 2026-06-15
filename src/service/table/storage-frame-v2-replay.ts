import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { getCurrentIsolationKey_ACU, independentTableStates_ACU } from '../runtime/state-manager';
import type { TableDataObject_ACU, Sheet_ACU, Mate_ACU } from '../../shared/models/table-data';
import { logError_ACU, logWarn_ACU } from '../../shared/utils';
import { SqliteEngine } from '../../data/sqlite/sqlite-engine';
import { SyncBridge } from '../../data/sqlite/sync-bridge';
import { normalizeSqlStructure, normalizeStatementValues } from '../../data/sqlite/sql-normalizer';
import type { TableCheckpointV2_ACU, TableMutationLogEntryV2_ACU, TableMutationOperationV2_ACU, TablePatchV2_ACU, TableStorageFrameV2_ACU } from './storage-frame-v2-types';
import { isV2TagData_ACU } from './storage-strategy-resolver';
import { readIsolatedTagData_ACU } from '../../data/repositories/chat-message-data-repo';
import { getSortedSheetKeys_ACU } from '../template/chat-scope';

interface V2FrameRef_ACU {
  messageIndex: number;
  aiFloor: number;
  frame: TableStorageFrameV2_ACU;
}

export type TableScheduleSummaryV2_ACU = NonNullable<TableCheckpointV2_ACU['scheduleSummary']>;

function deepClone_ACU<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function getV2FrameRefs_ACU(chat: any[], isolationKey: string): V2FrameRef_ACU[] {
  const refs: V2FrameRef_ACU[] = [];
  let aiFloor = 0;

  for (let i = 0; i < chat.length; i += 1) {
    const message = chat[i];
    if (!message || message.is_user) continue;
    aiFloor += 1;

    const tagData = readIsolatedTagData_ACU(message, isolationKey) as any;
    if (isV2TagData_ACU(tagData)) {
      refs.push({ messageIndex: i, aiFloor, frame: tagData.storageFrame });
    }
  }

  return refs;
}

function applyEventToScheduleSummary_ACU(
  summary: TableScheduleSummaryV2_ACU,
  event: Pick<TableMutationLogEntryV2_ACU, 'filledSheetKeys' | 'changedSheetKeys' | 'groupKeys'> | undefined,
  aiFloor: number,
): void {
  if (!event) return;

  const filledKeys = [...new Set([...(event.filledSheetKeys || []), ...(event.groupKeys || [])])];
  for (const sheetKey of filledKeys) {
    if (!summary[sheetKey]) summary[sheetKey] = {};
    summary[sheetKey].lastFilledAiFloor = aiFloor;
  }

  for (const sheetKey of event.changedSheetKeys || []) {
    if (!summary[sheetKey]) summary[sheetKey] = {};
    summary[sheetKey].lastChangedAiFloor = aiFloor;
  }
}

function replayEventForState_ACU(event: Pick<TableMutationLogEntryV2_ACU, 'filledSheetKeys' | 'changedSheetKeys' | 'groupKeys'> | undefined, aiFloor: number): void {
  if (!event) return;

  const filledKeys = [...new Set([...(event.filledSheetKeys || []), ...(event.groupKeys || [])])];
  for (const sheetKey of filledKeys) {
    if (!independentTableStates_ACU[sheetKey]) independentTableStates_ACU[sheetKey] = {};
    independentTableStates_ACU[sheetKey].lastUpdatedAiFloor = aiFloor;
  }

}

function replayCheckpointSchedule_ACU(checkpoint: TableCheckpointV2_ACU, fallbackAiFloor: number): void {
  const summary = checkpoint.scheduleSummary || {};
  for (const [sheetKey, state] of Object.entries(summary)) {
    if (state.lastFilledAiFloor === undefined) continue;
    if (!independentTableStates_ACU[sheetKey]) independentTableStates_ACU[sheetKey] = {};
    independentTableStates_ACU[sheetKey].lastUpdatedAiFloor = state.lastFilledAiFloor;
  }
  replayEventForState_ACU(checkpoint.event, fallbackAiFloor);
}

function replaceState_ACU(state: TableDataObject_ACU, next: TableDataObject_ACU): void {
  Object.keys(state).forEach(key => delete (state as any)[key]);
  Object.assign(state, deepClone_ACU(next));
}

function splitSqlStatementsForReplay_ACU(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (inString) {
      current += char;
      if (char === stringChar) {
        if (i + 1 < sql.length && sql[i + 1] === stringChar) {
          current += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
    } else if (char === "'" || char === '"') {
      inString = true;
      stringChar = char;
      current += char;
    } else if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function normalizeSqlStatementsForReplay_ACU(statements: string[]): string[] {
  return statements
    .flatMap(statement => splitSqlStatementsForReplay_ACU(String(statement || '').replace(/<!--|-->/g, '').trim()))
    .map(statement => normalizeStatementValues(normalizeSqlStructure(statement)))
    .filter(Boolean);
}

interface SqlReplayRuntime_ACU {
  engine: SqliteEngine;
  syncBridge: SyncBridge;
  loaded: boolean;
}

async function ensureSqlReplayRuntime_ACU(runtime: SqlReplayRuntime_ACU, state: TableDataObject_ACU): Promise<void> {
  if (runtime.loaded) return;
  await runtime.engine.init();
  runtime.syncBridge.loadFromTableData(state, { strict: true });
  runtime.loaded = true;
}

function exportSqlReplayRuntime_ACU(runtime: SqlReplayRuntime_ACU, state: TableDataObject_ACU): void {
  if (!runtime.loaded) return;
  const next = runtime.syncBridge.exportToTableData((state.mate || { type: 'acu', version: 1 }) as Mate_ACU);
  replaceState_ACU(state, next);
}

async function reloadSqlReplayRuntime_ACU(runtime: SqlReplayRuntime_ACU, state: TableDataObject_ACU): Promise<void> {
  if (!runtime.loaded) return;
  runtime.engine.dispose();
  runtime.loaded = false;
  await ensureSqlReplayRuntime_ACU(runtime, state);
}

async function applySqlBatchOperationV2_ACU(
  state: TableDataObject_ACU,
  operation: Extract<TableMutationOperationV2_ACU, { kind: 'sql_batch' }>,
  runtime: SqlReplayRuntime_ACU,
): Promise<void> {
  const statements = normalizeSqlStatementsForReplay_ACU(operation.statements || []);
  if (statements.length === 0) return;
  await ensureSqlReplayRuntime_ACU(runtime, state);
  const params = Array.isArray(operation.params) ? operation.params : undefined;
  runtime.engine.runBatch(statements, params);
}

export function applyTablePatchV2_ACU(state: TableDataObject_ACU, patch: TablePatchV2_ACU): void {
  if (patch.kind === 'sheet_replace') {
    state[patch.sheetKey] = deepClone_ACU(patch.sheet);
    return;
  }

  const sheet = state[patch.sheetKey] as Sheet_ACU | undefined;
  if (!sheet || !Array.isArray(sheet.content)) {
    logWarn_ACU(`[V2 Replay] 跳过 patch，缺少表或 content: ${patch.sheetKey}`);
    return;
  }

  if (patch.kind === 'row_upsert') {
    const rowIndex = sheet.content.findIndex(row => Array.isArray(row) && row[0] === patch.rowId);
    const nextCells = deepClone_ACU(patch.cells);
    if (rowIndex >= 0) {
      sheet.content[rowIndex] = nextCells;
    } else {
      sheet.content.push(nextCells);
    }
    return;
  }

  if (patch.kind === 'row_delete') {
    sheet.content = sheet.content.filter(row => !(Array.isArray(row) && row[0] === patch.rowId));
    return;
  }

  if (patch.kind === 'meta_update') {
    Object.assign(sheet, deepClone_ACU(patch.meta));
  }
}

function parseDslArgs_ACU(argsString: string): any[] | null {
  try {
    const firstBracket = argsString.indexOf('{');
    if (firstBracket === -1) return JSON.parse(`[${argsString}]`);
    const paramsPart = argsString.substring(0, firstBracket).trim();
    const jsonPart = argsString.substring(firstBracket);
    const initialArgs = JSON.parse(`[${paramsPart.replace(/,$/, '')}]`);
    return [...initialArgs, JSON.parse(jsonPart)];
  } catch (_) {
    return null;
  }
}

function extractTableEditDslCommands_ACU(text: string): string[] {
  const cleaned = String(text || '').replace(/<!--|-->/g, '');
  const commands: string[] = [];
  const commandPattern = /(?:insertRow|updateRow|deleteRow)\s*\(/g;
  let searchStart = 0;

  while (searchStart < cleaned.length) {
    commandPattern.lastIndex = searchStart;
    const match = commandPattern.exec(cleaned);
    if (!match) break;

    const commandStart = match.index;
    const openParenIndex = cleaned.indexOf('(', commandStart);
    if (openParenIndex === -1) break;

    let depth = 0;
    let inString = false;
    let stringChar = '';
    let escaped = false;
    let commandEnd = -1;

    for (let i = openParenIndex; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        continue;
      }
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          commandEnd = i + 1;
          break;
        }
      }
    }

    if (commandEnd === -1) break;
    const command = cleaned.slice(commandStart, commandEnd).trim().replace(/;$/, '');
    if (command) commands.push(command);
    searchStart = commandEnd;
  }

  return commands;
}

function resolveDslReplaySheetKeys_ACU(state: TableDataObject_ACU): string[] {
  const sortedKeys = getSortedSheetKeys_ACU(state as any);
  if (Array.isArray(sortedKeys) && sortedKeys.length > 0) return sortedKeys;
  return Object.keys(state).filter(k => k.startsWith('sheet_'));
}

function applyTableEditDslOperationV2_ACU(state: TableDataObject_ACU, text: string): void {
  const sheetKeys = resolveDslReplaySheetKeys_ACU(state);
  const commands = extractTableEditDslCommands_ACU(text);

  for (const commandLine of commands) {
    const match = commandLine.match(/^(insertRow|deleteRow|updateRow)\s*\((.*)\)$/);
    if (!match) continue;
    const command = match[1];
    const args = parseDslArgs_ACU(match[2]);
    if (!args) continue;
    const tableIndex = Number(args[0]);
    const sheetKey = sheetKeys[tableIndex];
    const sheet = sheetKey ? state[sheetKey] as Sheet_ACU : null;
    if (!sheet || !Array.isArray(sheet.content)) continue;

    if (command === 'insertRow') {
      const data = args[1] || {};
      const headers = Array.isArray(sheet.content[0]) ? sheet.content[0].slice(1) : [];
      const row = [String(sheet.content.length)];
      headers.forEach((_, colIndex) => row.push(data[colIndex] ?? data[String(colIndex)] ?? ''));
      sheet.content.push(row);
    } else if (command === 'deleteRow') {
      const rowIndex = Number(args[1]);
      if (Number.isFinite(rowIndex) && sheet.content.length > rowIndex + 1) sheet.content.splice(rowIndex + 1, 1);
    } else if (command === 'updateRow') {
      const rowIndex = Number(args[1]);
      const data = args[2] || {};
      const row = Number.isFinite(rowIndex) ? sheet.content[rowIndex + 1] : null;
      if (!Array.isArray(row)) continue;
      Object.keys(data).forEach(colIndexStr => {
        const colIndex = Number.parseInt(colIndexStr, 10);
        if (!Number.isFinite(colIndex)) return;
        row[colIndex + 1] = data[colIndexStr];
      });
    }
  }
}

export async function applyTableOperationV2_ACU(
  state: TableDataObject_ACU,
  operation: TableMutationOperationV2_ACU,
  runtime?: SqlReplayRuntime_ACU,
): Promise<void> {
  if (!operation) return;
  const ownedRuntime = !runtime && operation.kind === 'sql_batch'
    ? { engine: new SqliteEngine(), syncBridge: null as unknown as SyncBridge, loaded: false }
    : null;
  if (ownedRuntime) ownedRuntime.syncBridge = new SyncBridge(ownedRuntime.engine);
  const effectiveRuntime = runtime || ownedRuntime || null;

  try {
    if (operation.kind === 'data_replace') {
      if (effectiveRuntime?.loaded) exportSqlReplayRuntime_ACU(effectiveRuntime, state);
      replaceState_ACU(state, operation.data);
      if (effectiveRuntime?.loaded) await reloadSqlReplayRuntime_ACU(effectiveRuntime, state);
      return;
    }
    if (operation.kind === 'sql_batch') {
      if (!effectiveRuntime) throw new Error('sql_batch replay requires runtime');
      await applySqlBatchOperationV2_ACU(state, operation, effectiveRuntime);
      return;
    }
    if (operation.kind === 'sheet_replace') {
      if (effectiveRuntime?.loaded) exportSqlReplayRuntime_ACU(effectiveRuntime, state);
      state[operation.sheetKey] = deepClone_ACU(operation.sheet);
      if (effectiveRuntime?.loaded) await reloadSqlReplayRuntime_ACU(effectiveRuntime, state);
      return;
    }
    if (operation.kind === 'row_upsert' || operation.kind === 'row_delete' || operation.kind === 'meta_update') {
      if (effectiveRuntime?.loaded) exportSqlReplayRuntime_ACU(effectiveRuntime, state);
      applyTablePatchV2_ACU(state, operation);
      if (effectiveRuntime?.loaded) await reloadSqlReplayRuntime_ACU(effectiveRuntime, state);
      return;
    }
    if (operation.kind === 'table_edit_dsl') {
      if (effectiveRuntime?.loaded) exportSqlReplayRuntime_ACU(effectiveRuntime, state);
      applyTableEditDslOperationV2_ACU(state, operation.text);
      if (effectiveRuntime?.loaded) await reloadSqlReplayRuntime_ACU(effectiveRuntime, state);
    }
  } finally {
    if (ownedRuntime) ownedRuntime.engine.dispose();
  }
}

export function collectScheduleSummaryFromFramesV2_ACU(
  chatArg: any[] | null | undefined,
  isolationKey: string,
  options: { maxMessageIndex?: number } = {},
): TableScheduleSummaryV2_ACU {
  const chat = chatArg || [];
  if (!Array.isArray(chat) || chat.length === 0) return {};

  const frameRefs = getV2FrameRefs_ACU(chat, isolationKey)
    .filter(ref => options.maxMessageIndex === undefined || ref.messageIndex <= options.maxMessageIndex);
  const checkpointRef = [...frameRefs].reverse().find(ref => ref.frame.checkpoint?.kind === 'full');

  const summary: TableScheduleSummaryV2_ACU = checkpointRef?.frame.checkpoint
    ? deepClone_ACU(checkpointRef.frame.checkpoint.scheduleSummary || {})
    : {};
  if (checkpointRef?.frame.checkpoint) {
    applyEventToScheduleSummary_ACU(summary, checkpointRef.frame.checkpoint.event, checkpointRef.aiFloor);
  }

  for (const ref of frameRefs) {
    if (checkpointRef && ref.messageIndex < checkpointRef.messageIndex) continue;
    const entries = [...(ref.frame.logEntries || [])].sort((a, b) => a.seq - b.seq);
    for (const entry of entries) {
      applyEventToScheduleSummary_ACU(summary, entry, ref.aiFloor);
    }
  }

  return summary;
}

export async function loadTableStateFromFramesV2_ACU(
  chatArg?: any[],
  isolationKeyArg?: string,
  options: { maxMessageIndex?: number } = {},
): Promise<TableDataObject_ACU | null> {
  const chat = chatArg || getChatArray_ACU();
  if (!Array.isArray(chat) || chat.length === 0) return null;

  const isolationKey = isolationKeyArg ?? getCurrentIsolationKey_ACU();
  const frameRefs = getV2FrameRefs_ACU(chat, isolationKey)
    .filter(ref => options.maxMessageIndex === undefined || ref.messageIndex <= options.maxMessageIndex);
  const checkpointRef = [...frameRefs].reverse().find(ref => ref.frame.checkpoint?.kind === 'full');

  if (!checkpointRef?.frame.checkpoint) {
    logWarn_ACU('[V2 Replay] 未找到 full checkpoint，拒绝从 log-only/data_replace 恢复不完整 V2 表格数据。');
    return null;
  }

  const checkpoint = checkpointRef.frame.checkpoint;
  const state: TableDataObject_ACU = deepClone_ACU(checkpoint.data);
  const replayStartMessageIndex = checkpointRef.messageIndex;
  replayCheckpointSchedule_ACU(checkpoint, checkpointRef.aiFloor);

  const runtime: SqlReplayRuntime_ACU = {
    engine: new SqliteEngine(),
    syncBridge: null as unknown as SyncBridge,
    loaded: false,
  };
  runtime.syncBridge = new SyncBridge(runtime.engine);

  try {
    for (const ref of frameRefs) {
      if (ref.messageIndex < replayStartMessageIndex) continue;
      const entries = [...(ref.frame.logEntries || [])].sort((a, b) => a.seq - b.seq);
      for (const entry of entries) {
        try {
          if (Array.isArray(entry.operations) && entry.operations.length > 0) {
            for (const operation of entry.operations) {
              await applyTableOperationV2_ACU(state, operation, runtime);
            }
          } else {
            if (runtime.loaded) exportSqlReplayRuntime_ACU(runtime, state);
            // 兼容旧版 derived patch log；新 V2 不再写 patches。
            for (const patch of entry.patches || []) {
              applyTablePatchV2_ACU(state, patch);
            }
            if (runtime.loaded) await reloadSqlReplayRuntime_ACU(runtime, state);
          }
          replayEventForState_ACU(entry, ref.aiFloor);
        } catch (error) {
          logError_ACU(`[V2 Replay] 应用日志失败: messageIndex=${ref.messageIndex}, seq=${entry.seq}`, error);
          throw error;
        }
      }
    }

    if (runtime.loaded) exportSqlReplayRuntime_ACU(runtime, state);
    return state;
  } finally {
    runtime.engine.dispose();
  }
}
