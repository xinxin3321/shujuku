import { describe, expect, it } from 'vitest';
import { resolveTableHistoryStateFromChat_ACU } from '../../../src/service/table/table-history';

const settings = {
  dataIsolationEnabled: false,
  dataIsolationCode: '',
};

function v2Message(frame: any, stringify = false) {
  const isolatedData = {
    '': {
      storageFrame: frame,
      _acu_storage_version: 2,
    },
  };
  return {
    is_user: false,
    TavernDB_ACU_IsolatedData: stringify ? JSON.stringify(isolatedData) : isolatedData,
  };
}

describe('resolveTableHistoryStateFromChat_ACU', () => {
  it('识别 V2 checkpoint event 作为已更新楼层', () => {
    const chat = [
      { is_user: true },
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 1,
          reason: 'init',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id']] } },
          event: {
            filledSheetKeys: ['sheet_0'],
            changedSheetKeys: ['sheet_0'],
            groupKeys: ['sheet_0'],
          },
        },
        logEntries: [],
      }),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasAnyData).toBe(true);
    expect(state.hasTrackedUpdate).toBe(true);
    expect(state.latestDataAiFloor).toBe(1);
    expect(state.lastTrackedUpdateAiFloor).toBe(1);
  });

  it('识别 V2 operation log 的 filledSheetKeys 作为最后填表楼层', () => {
    const chat = [
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 1,
          reason: 'init',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id']] } },
          event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
        },
        logEntries: [],
      }),
      { is_user: true },
      v2Message({
        version: 2,
        logEntries: [{
          seq: 1,
          entryId: 'v2_1',
          createdAt: 2,
          source: 'auto_fill',
          targetMessageIndex: 2,
          aiFloor: 2,
          filledSheetKeys: ['sheet_0'],
          changedSheetKeys: ['sheet_0'],
          groupKeys: [],
          operations: [{ kind: 'sheet_replace', sheetKey: 'sheet_0', sheet: { name: '表A', content: [['row_id'], ['1']] }, reason: 'system' }],
        }],
      }),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasTrackedUpdate).toBe(true);
    expect(state.lastTrackedUpdateMessageIndex).toBe(2);
    expect(state.lastTrackedUpdateAiFloor).toBe(2);
  });

  it('不把前端写入 changedSheetKeys / sheet_replace 视为已填表更新', () => {
    const chat = [
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 1,
          reason: 'init',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id']] } },
          event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
        },
        logEntries: [],
      }),
      { is_user: true },
      v2Message({
        version: 2,
        logEntries: [{
          seq: 1,
          entryId: 'manual_1',
          createdAt: 2,
          source: 'manual_crud',
          targetMessageIndex: 2,
          aiFloor: 2,
          filledSheetKeys: [],
          changedSheetKeys: ['sheet_0'],
          groupKeys: [],
          operations: [{ kind: 'sheet_replace', sheetKey: 'sheet_0', sheet: { name: '表A', content: [['row_id'], ['1']] }, reason: 'manual_crud' }],
        }],
      }),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasAnyData).toBe(true);
    expect(state.latestDataAiFloor).toBe(2);
    expect(state.hasTrackedUpdate).toBe(false);
    expect(state.lastTrackedUpdateAiFloor).toBe(0);
  });

  it('识别字符串化 V2 IsolatedData 的 filledSheetKeys', () => {
    const chat = [
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 1,
          reason: 'init',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id'], ['1']] } },
          event: {
            filledSheetKeys: ['sheet_0'],
            changedSheetKeys: ['sheet_0'],
            groupKeys: ['sheet_0'],
          },
        },
        logEntries: [],
      }, true),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasAnyData).toBe(true);
    expect(state.hasTrackedUpdate).toBe(true);
    expect(state.lastTrackedUpdateAiFloor).toBe(1);
  });

  it('不把 data_replace 覆盖范围视为已填表更新', () => {
    const chat = [
      v2Message({
        version: 2,
        logEntries: [{
          seq: 1,
          entryId: 'replace_1',
          createdAt: 2,
          source: 'system',
          targetMessageIndex: 0,
          aiFloor: 1,
          filledSheetKeys: [],
          changedSheetKeys: [],
          groupKeys: [],
          operations: [{ kind: 'data_replace', data: { mate: {}, sheet_0: { name: '表A', content: [['row_id'], ['1']] } }, reason: 'system' }],
        }],
      }),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasAnyData).toBe(true);
    expect(state.latestDataAiFloor).toBe(1);
    expect(state.hasTrackedUpdate).toBe(false);
    expect(state.lastTrackedUpdateAiFloor).toBe(0);
  });

  it('不把无事件的 V2 初始模板 checkpoint 视为已自动更新', () => {
    const chat = [
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 1,
          reason: 'init',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id']] } },
          event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
        },
        logEntries: [],
      }),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasAnyData).toBe(true);
    expect(state.hasTrackedUpdate).toBe(false);
    expect(state.lastTrackedUpdateAiFloor).toBe(0);
  });

  it('识别 checkpoint scheduleSummary 中被压缩的历史填表楼层', () => {
    const chat = [
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 1,
          reason: 'init',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id'], ['1']] } },
          event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
        },
        logEntries: [],
      }),
      { is_user: true },
      v2Message({
        version: 2,
        checkpoint: {
          kind: 'full',
          createdAt: 2,
          reason: 'periodic',
          data: { mate: {}, sheet_0: { name: '表A', content: [['row_id'], ['1'], ['2']] } },
          scheduleSummary: { sheet_0: { lastFilledAiFloor: 1, lastChangedAiFloor: 1 } },
          event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
        },
        logEntries: [],
      }),
    ];

    const state = resolveTableHistoryStateFromChat_ACU(chat, {
      sheetKey: 'sheet_0',
      isSummaryTable: false,
      isolationKey: '',
      settings,
    });

    expect(state.hasTrackedUpdate).toBe(true);
    expect(state.lastTrackedUpdateMessageIndex).toBe(2);
    expect(state.lastTrackedUpdateAiFloor).toBe(1);
  });
});
