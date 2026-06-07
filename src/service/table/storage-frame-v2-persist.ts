import { getChatArray_ACU, saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { cloneIsolatedData_ACU, writeMessageIdentity_ACU } from '../../data/repositories/chat-message-data-repo';
import type { TableDataObject_ACU } from '../../shared/models/table-data';
import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';
import { getCurrentIsolationKey_ACU, settings_ACU } from '../runtime/state-manager';
import type { TableMutationLogEntryV2_ACU, TableMutationSourceV2_ACU, TableStorageFrameV2_ACU, TableCheckpointV2_ACU, TableMutationWriteSetV2_ACU, TableMutationOperationV2_ACU } from './storage-frame-v2-types';
import { isV2TagData_ACU } from './storage-strategy-resolver';
import { collectScheduleSummaryFromFramesV2_ACU } from './storage-frame-v2-replay';
import type { TableWriteTransactionContext_ACU } from './table-write-transaction';

const MAX_ENTRIES_AFTER_CHECKPOINT_ACU = 50;
const MAX_OPERATION_BYTES_AFTER_CHECKPOINT_ACU = 256 * 1024;
const MAX_OPERATION_COUNT_AFTER_CHECKPOINT_ACU = 2000;
const SINGLE_OPERATION_CHECKPOINT_RATIO_ACU = 0.5;
const CUMULATIVE_OPERATION_CHECKPOINT_RATIO_ACU = 0.35;

export interface PersistTableMutationV2Options_ACU {
  targetMessageIndex?: number;
  source: TableMutationSourceV2_ACU;
  afterData: TableDataObject_ACU;
  operations?: TableMutationOperationV2_ACU[];
  filledSheetKeys?: string[];
  candidateChangedSheetKeys?: string[] | null;
  groupKeys?: string[];
  requestId?: string;
  batchId?: string;
  error?: string;
  forceCheckpoint?: boolean;
  checkpointReason?: TableCheckpointV2_ACU['reason'];
  isolationKey?: string;
  baseRevision?: string | null;
  parentRevision?: string | null;
  writeSet?: TableMutationWriteSetV2_ACU;
  revisionWriteSet?: TableMutationWriteSetV2_ACU;
  /** 调用方已处于 transactionContext.runCommit 临界区内时使用，避免嵌套 commit 锁。 */
  assumeCommitLock?: boolean;
  transactionContext?: Pick<TableWriteTransactionContext_ACU, 'runCommit' | 'baseRevision' | 'writeSet'>;
}

function safeJsonByteLength_ACU(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function countOperationUnits_ACU(operations: unknown[]): number {
  return operations.reduce<number>((sum, operation: any) => {
    if (operation?.kind === 'sql_batch' && Array.isArray(operation.statements)) return sum + operation.statements.length;
    if (operation?.kind === 'data_replace' || operation?.kind === 'sheet_replace') return sum + 1;
    return sum + 1;
  }, 0);
}

function deepClone_ACU<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function generateEntryId_ACU(): string {
  return `v2_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildCommitRevision_ACU(seq: number | 'checkpoint', entryId: string): string {
  return `${seq}:${entryId}`;
}

function findTargetAiMessage_ACU(chat: any[], targetMessageIndex: number | undefined): { message: any; index: number } | null {
  if (targetMessageIndex !== undefined && targetMessageIndex !== -1) {
    const message = chat[targetMessageIndex];
    if (message && !message.is_user) {
      return { message, index: targetMessageIndex };
    }
    return null;
  }

  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i] && !chat[i].is_user) {
      return { message: chat[i], index: i };
    }
  }

  return null;
}

function countAiFloor_ACU(chat: any[], messageIndex: number): number {
  let count = 0;
  for (let i = 0; i <= messageIndex && i < chat.length; i += 1) {
    if (chat[i] && !chat[i].is_user) count += 1;
  }
  return count;
}

function hasAnyV2Checkpoint_ACU(chat: any[], isolationKey: string): boolean {
  return chat.some(message => {
    const tagData = message?.TavernDB_ACU_IsolatedData?.[isolationKey];
    return isV2TagData_ACU(tagData) && tagData.storageFrame.checkpoint?.kind === 'full';
  });
}

export function getLatestTableStorageHeadRevisionV2_ACU(chat: any[] | null | undefined, isolationKey: string): string | null {
  if (!Array.isArray(chat) || chat.length === 0) return null;
  let headRevision: string | null = null;
  for (const message of chat) {
    const tagData = message?.TavernDB_ACU_IsolatedData?.[isolationKey];
    if (isV2TagData_ACU(tagData)) {
      headRevision = tagData.storageFrame.headRevision ?? headRevision;
    }
  }
  return headRevision;
}

function getLogEntriesAfterLatestCheckpoint_ACU(chat: any[], isolationKey: string): TableMutationLogEntryV2_ACU[] {
  let latestCheckpointIndex = -1;
  for (let i = 0; i < chat.length; i += 1) {
    const tagData = chat[i]?.TavernDB_ACU_IsolatedData?.[isolationKey];
    if (isV2TagData_ACU(tagData) && tagData.storageFrame.checkpoint?.kind === 'full') {
      latestCheckpointIndex = i;
    }
  }

  const entries: TableMutationLogEntryV2_ACU[] = [];
  for (let i = Math.max(0, latestCheckpointIndex); i < chat.length; i += 1) {
    const tagData = chat[i]?.TavernDB_ACU_IsolatedData?.[isolationKey];
    if (isV2TagData_ACU(tagData)) {
      entries.push(...(tagData.storageFrame.logEntries || []));
    }
  }
  return entries;
}

function shouldCreatePeriodicCheckpoint_ACU(
  chat: any[],
  isolationKey: string,
  operations: unknown[],
  afterData: TableDataObject_ACU,
): boolean {
  const previousEntries = getLogEntriesAfterLatestCheckpoint_ACU(chat, isolationKey);
  const entryCount = previousEntries.length + 1;
  if (entryCount >= MAX_ENTRIES_AFTER_CHECKPOINT_ACU) return true;

  const previousOperations = previousEntries.flatMap(entry => entry.operations || []);
  const cumulativeOperations = [...previousOperations, ...operations];
  const fullCheckpointBytes = Math.max(1, safeJsonByteLength_ACU(afterData));
  const cumulativeOperationBytes = safeJsonByteLength_ACU(cumulativeOperations);
  const latestOperationBytes = safeJsonByteLength_ACU(operations);
  const cumulativeOperationCount = countOperationUnits_ACU(cumulativeOperations);

  return (cumulativeOperationBytes >= MAX_OPERATION_BYTES_AFTER_CHECKPOINT_ACU && cumulativeOperationBytes >= fullCheckpointBytes * CUMULATIVE_OPERATION_CHECKPOINT_RATIO_ACU)
    || cumulativeOperationCount >= MAX_OPERATION_COUNT_AFTER_CHECKPOINT_ACU
    || (latestOperationBytes >= MAX_OPERATION_BYTES_AFTER_CHECKPOINT_ACU && latestOperationBytes >= fullCheckpointBytes * SINGLE_OPERATION_CHECKPOINT_RATIO_ACU);
}

function normalizeKeys_ACU(keys: string[] | null | undefined, data?: TableDataObject_ACU): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter(key => typeof key === 'string' && key.startsWith('sheet_') && (!data || Boolean(data[key]))))];
}

function normalizeOperations_ACU(
  operations: TableMutationOperationV2_ACU[] | null | undefined,
  afterData: TableDataObject_ACU,
  source: TableMutationSourceV2_ACU,
): TableMutationOperationV2_ACU[] {
  if (Array.isArray(operations) && operations.length > 0) {
    return deepClone_ACU(operations);
  }
  if (source === 'import') {
    return [{
      kind: 'data_replace',
      data: deepClone_ACU(afterData),
      reason: 'import',
    }];
  }
  return [];
}

function getOrInitV2Frame_ACU(isolatedData: Record<string, any>, isolationKey: string): TableStorageFrameV2_ACU {
  const tagData = isolatedData[isolationKey];
  if (isV2TagData_ACU(tagData)) {
    return tagData.storageFrame;
  }

  const nextTagData: any = {
    storageFrame: {
      version: 2,
      logEntries: [],
    },
    _acu_storage_version: 2,
  };

  if (tagData?.summaryVectorIndexState !== undefined) {
    nextTagData.summaryVectorIndexState = tagData.summaryVectorIndexState;
  }
  if (tagData?.summaryVectorIndexManifest !== undefined) {
    nextTagData.summaryVectorIndexManifest = tagData.summaryVectorIndexManifest;
  }

  isolatedData[isolationKey] = nextTagData;
  return nextTagData.storageFrame;
}

async function persistTableMutationLogV2Core_ACU(
  options: PersistTableMutationV2Options_ACU,
): Promise<{ saved: boolean; messageIndex?: number; entry?: TableMutationLogEntryV2_ACU; error?: string }> {
  const chat = getChatArray_ACU();
  if (!chat || chat.length === 0) {
    return { saved: false, error: 'chat history is empty' };
  }

  const target = findTargetAiMessage_ACU(chat, options.targetMessageIndex);
  if (!target) {
    return { saved: false, error: 'no AI message found' };
  }

  const isolationKey = options.isolationKey ?? getCurrentIsolationKey_ACU();
  const afterData = deepClone_ACU(options.afterData);
  const filledSheetKeys = normalizeKeys_ACU(options.filledSheetKeys, afterData);
  const candidateChangedSheetKeys = normalizeKeys_ACU(options.candidateChangedSheetKeys, afterData);
  const operations = normalizeOperations_ACU(options.operations, afterData, options.source);
  const effectiveChangedSheetKeys = candidateChangedSheetKeys;

  const isolatedData = cloneIsolatedData_ACU(target.message) as Record<string, any>;
  const frame = getOrInitV2Frame_ACU(isolatedData, isolationKey);
  const currentWriteSet = options.writeSet ?? options.transactionContext?.writeSet;
  const revisionWriteSet = options.revisionWriteSet;
  const requestedBaseRevision = options.baseRevision !== undefined
    ? options.baseRevision
    : options.transactionContext?.baseRevision;

  const hasExistingCheckpoint = hasAnyV2Checkpoint_ACU(chat, isolationKey);
  const hasMetadataOnlyFillEvent = filledSheetKeys.length > 0 || (Array.isArray(options.groupKeys) && options.groupKeys.length > 0);
  if (operations.length === 0 && !hasMetadataOnlyFillEvent && options.source !== 'import' && hasExistingCheckpoint) {
    return { saved: false, error: `V2 operation log requires explicit operations for source=${options.source}; snapshot diff fallback is not allowed.` };
  }

  const shouldCheckpoint = options.forceCheckpoint
    || !hasExistingCheckpoint
    || shouldCreatePeriodicCheckpoint_ACU(chat, isolationKey, operations, afterData);
  const now = Date.now();
  const aiFloor = countAiFloor_ACU(chat, target.index);
  let entry: TableMutationLogEntryV2_ACU | undefined;

  if (shouldCheckpoint) {
    const checkpointRevision = buildCommitRevision_ACU('checkpoint', generateEntryId_ACU());
    const checkpointEvent = {
      filledSheetKeys,
      changedSheetKeys: effectiveChangedSheetKeys,
      groupKeys: options.groupKeys || [],
      requestId: options.requestId,
      batchId: options.batchId,
      error: options.error,
    };
    frame.checkpoint = {
      kind: 'full',
      createdAt: now,
      reason: options.checkpointReason || (!hasExistingCheckpoint ? 'init' : 'periodic'),
      data: afterData,
      scheduleSummary: collectScheduleSummaryFromFramesV2_ACU(chat, isolationKey, { maxMessageIndex: target.index }),
      event: checkpointEvent,
    };
    frame.headRevision = checkpointRevision;
    frame.logEntries = [];
    logDebug_ACU(`[V2 Persist] 写入 full checkpoint: messageIndex=${target.index}, revision=${checkpointRevision}, sheets=${Object.keys(afterData).filter(k => k.startsWith('sheet_')).length}`);
  } else {
    const nextSeq = Math.max(0, ...frame.logEntries.map(item => Number(item.seq) || 0)) + 1;
    const entryId = generateEntryId_ACU();
    const parentRevision = options.parentRevision !== undefined ? options.parentRevision : (frame.headRevision ?? null);
    const commitRevision = buildCommitRevision_ACU(nextSeq, entryId);
    entry = {
      seq: nextSeq,
      entryId,
      createdAt: now,
      source: options.source,
      targetMessageIndex: target.index,
      aiFloor,
      filledSheetKeys,
      changedSheetKeys: effectiveChangedSheetKeys,
      groupKeys: options.groupKeys || [],
      requestId: options.requestId,
      batchId: options.batchId,
      error: options.error,
      operations,
      baseRevision: requestedBaseRevision ?? parentRevision,
      parentRevision,
      commitRevision,
      writeSet: currentWriteSet,
    };
    frame.logEntries.push(entry);
    frame.headRevision = commitRevision;
    logDebug_ACU(`[V2 Persist] 追加 operation log entry: messageIndex=${target.index}, seq=${entry.seq}, revision=${commitRevision}, operations=${operations.length}`);
  }

  target.message.TavernDB_ACU_IsolatedData = isolatedData;
  writeMessageIdentity_ACU(target.message, {
    enabled: settings_ACU.dataIsolationEnabled,
    code: settings_ACU.dataIsolationCode,
  });

  if (operations.length === 0 && filledSheetKeys.length === 0 && !shouldCheckpoint) {
    logWarn_ACU(`[V2 Persist] 无 operation 且无 filled 事件，仍保存空日志事件: messageIndex=${target.index}`);
  }

  await saveChatToHost_ACU();
  return { saved: true, messageIndex: target.index, entry };
}

export async function persistTableMutationLogV2_ACU(
  options: PersistTableMutationV2Options_ACU,
): Promise<{ saved: boolean; messageIndex?: number; entry?: TableMutationLogEntryV2_ACU; error?: string }> {
  if (!options.transactionContext) {
    return { saved: false, error: 'V2 operation log write requires TableWriteTransactionContext; direct unsafe writes are not allowed.' };
  }
  if (options.assumeCommitLock) {
    return persistTableMutationLogV2Core_ACU(options);
  }
  return options.transactionContext.runCommit(() => persistTableMutationLogV2Core_ACU(options), options.revisionWriteSet);
}
