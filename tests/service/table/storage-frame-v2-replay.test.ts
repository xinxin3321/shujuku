import { describe, expect, it } from 'vitest';
import { loadTableStateFromFramesV2_ACU } from '../../../src/service/table/storage-frame-v2-replay';

function makeCheckpointData() {
  return {
    mate: { type: 'acu', version: 1 },
    sheet_0: {
      uid: 'inventory',
      name: '背包',
      content: [
        ['row_id', 'name'],
        ['1', '铁剑'],
      ],
      sourceData: {
        ddl: 'CREATE TABLE inventory (row_id INTEGER PRIMARY KEY, name TEXT);',
      },
      updateConfig: {},
      exportConfig: {},
      orderNo: 0,
    },
  } as any;
}

function makeDslCheckpointData() {
  return {
    mate: { type: 'acu', version: 1 },
    sheet_a: {
      uid: 'global_state',
      name: '全局数据表',
      content: [['row_id', '地点'], ['1', '起点']],
      sourceData: {},
      updateConfig: {},
      exportConfig: {},
      orderNo: 0,
    },
    sheet_b: {
      uid: 'chronicle',
      name: '纪要表',
      content: [['row_id', '时间跨度', '地点', '纪要', '概要']],
      sourceData: {},
      updateConfig: {},
      exportConfig: {},
      orderNo: 1,
    },
  } as any;
}

describe('loadTableStateFromFramesV2_ACU', () => {
  it('从最后 checkpoint 开始，在同一个恢复 runtime 上顺序回放 sql_batch', async () => {
    const chat = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            _acu_storage_version: 2,
            storageFrame: {
              version: 2,
              checkpoint: {
                kind: 'full',
                createdAt: 1,
                reason: 'init',
                data: makeCheckpointData(),
                event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
              },
              logEntries: [
                {
                  seq: 1,
                  entryId: 'v2_sql_1',
                  createdAt: 2,
                  source: 'auto_fill',
                  targetMessageIndex: 0,
                  aiFloor: 1,
                  filledSheetKeys: ['sheet_0'],
                  changedSheetKeys: ['sheet_0'],
                  groupKeys: [],
                  operations: [
                    { kind: 'sql_batch', statements: ["UPDATE inventory SET name = '钢剑' WHERE row_id = 1"] },
                  ],
                },
                {
                  seq: 2,
                  entryId: 'v2_sql_2',
                  createdAt: 3,
                  source: 'auto_fill',
                  targetMessageIndex: 0,
                  aiFloor: 1,
                  filledSheetKeys: ['sheet_0'],
                  changedSheetKeys: ['sheet_0'],
                  groupKeys: [],
                  operations: [
                    { kind: 'sql_batch', statements: ["INSERT INTO inventory VALUES (2, '药水')"] },
                  ],
                },
              ],
            },
          },
        },
      },
    ];

    const result = await loadTableStateFromFramesV2_ACU(chat, '');

    expect(result?.sheet_0.content).toEqual([
      ['row_id', 'name'],
      ['1', '钢剑'],
      ['2', '药水'],
    ]);
  });

  it('回放带参数绑定的 sql_batch', async () => {
    const chat = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            _acu_storage_version: 2,
            storageFrame: {
              version: 2,
              checkpoint: {
                kind: 'full',
                createdAt: 1,
                reason: 'init',
                data: makeCheckpointData(),
                event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
              },
              logEntries: [{
                seq: 1,
                entryId: 'v2_sql_params_1',
                createdAt: 2,
                source: 'manual_crud',
                targetMessageIndex: 0,
                aiFloor: 1,
                filledSheetKeys: [],
                changedSheetKeys: ['sheet_0'],
                groupKeys: [],
                operations: [{
                  kind: 'sql_batch',
                  statements: ['UPDATE inventory SET name = ? WHERE row_id = ?'],
                  params: [['钢剑', 1]],
                }],
              }],
            },
          },
        },
      },
    ];

    const result = await loadTableStateFromFramesV2_ACU(chat, '');

    expect(result?.sheet_0.content[1]).toEqual(['1', '钢剑']);
  });

  it('回放 sql_batch 前先套用当前聊天 guide 的新 DDL/CHECK', async () => {
    const oldData = {
      mate: { type: 'acu', version: 1 },
      sheet_MapElements: {
        uid: 'sheet_MapElements',
        name: '地图元素表',
        content: [['row_id', '元素名称', '元素类型'], ['1', '旧点', '地标']],
        sourceData: {
          ddl: `CREATE TABLE map_elements (
            row_id INTEGER PRIMARY KEY,
            element_name TEXT NOT NULL, -- 元素名称
            element_type TEXT NOT NULL CHECK(element_type IN ('地标')) -- 元素类型
          );`,
        },
        updateConfig: {},
        exportConfig: {},
        orderNo: 0,
      },
    } as any;
    const newGuide = {
      version: 2,
      tags: {
        '': {
          data: {
            mate: { type: 'chatSheets', version: 2 },
            sheet_MapElements: {
              uid: 'sheet_MapElements',
              name: '地图元素表',
              content: [['row_id', '元素名称', '元素类型']],
              sourceData: {
                ddl: `CREATE TABLE map_elements (
                  row_id INTEGER PRIMARY KEY,
                  element_name TEXT NOT NULL, -- 元素名称
                  element_type TEXT NOT NULL CHECK(element_type IN ('地标','地形')) -- 元素类型
                );`,
              },
              updateConfig: {},
              exportConfig: {},
              orderNo: 0,
            },
          },
          templateScopeMode: 'chat_override',
        },
      },
    };
    const chat = [{
      is_user: false,
      TavernDB_ACU_InternalSheetGuide: newGuide,
      TavernDB_ACU_IsolatedData: {
        '': {
          _acu_storage_version: 2,
          storageFrame: {
            version: 2,
            checkpoint: {
              kind: 'full',
              createdAt: 1,
              reason: 'init',
              data: oldData,
              event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
            },
            logEntries: [{
              seq: 1,
              entryId: 'v2_sql_terrain',
              createdAt: 2,
              source: 'manual_crud',
              targetMessageIndex: 0,
              aiFloor: 1,
              filledSheetKeys: [],
              changedSheetKeys: ['sheet_MapElements'],
              groupKeys: [],
              operations: [{
                kind: 'sql_batch',
                statements: ["INSERT INTO map_elements (row_id, element_name, element_type) VALUES (2, '废弃集装箱', '地形')"],
              }],
            }],
          },
        },
      },
    }];

    const result = await loadTableStateFromFramesV2_ACU(chat, '');

    expect(result?.sheet_MapElements.sourceData.ddl).toContain("'地形'");
    expect(result?.sheet_MapElements.content).toEqual([
      ['row_id', '元素名称', '元素类型'],
      ['1', '旧点', '地标'],
      ['2', '废弃集装箱', '地形'],
    ]);
  });

  it('回放无分号分隔且含前置文本的 table_edit_dsl', async () => {
    const chat = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            _acu_storage_version: 2,
            storageFrame: {
              version: 2,
              checkpoint: {
                kind: 'full',
                createdAt: 1,
                reason: 'init',
                data: makeDslCheckpointData(),
                event: { filledSheetKeys: [], changedSheetKeys: [], groupKeys: [] },
              },
              logEntries: [{
                seq: 1,
                entryId: 'v2_dsl_1',
                createdAt: 2,
                source: 'auto_fill',
                targetMessageIndex: 0,
                aiFloor: 1,
                filledSheetKeys: ['sheet_a', 'sheet_b'],
                changedSheetKeys: ['sheet_a', 'sheet_b'],
                groupKeys: [],
                operations: [{
                  kind: 'table_edit_dsl',
                  text: '说明文字 updateRow(0, 0, {"0":"城镇(北区)"}) insertRow(1, {"0":"第一天","1":"城镇(北区)","2":"记录包含括号(测试)，不应破坏命令切分。","3":"抵达城镇"})',
                }],
              }],
            },
          },
        },
      },
    ];

    const result = await loadTableStateFromFramesV2_ACU(chat, '');

    expect(result?.sheet_a.content[1]).toEqual(['1', '城镇(北区)']);
    expect(result?.sheet_b.content).toEqual([
      ['row_id', '时间跨度', '地点', '纪要', '概要'],
      ['1', '第一天', '城镇(北区)', '记录包含括号(测试)，不应破坏命令切分。', '抵达城镇'],
    ]);
  });

  it('无 full checkpoint 时拒绝从 data_replace/log-only 恢复不完整数据', async () => {
    const chat = [
      {
        is_user: false,
        TavernDB_ACU_IsolatedData: {
          '': {
            _acu_storage_version: 2,
            storageFrame: {
              version: 2,
              logEntries: [{
                seq: 1,
                entryId: 'v2_import_data_replace',
                createdAt: 1,
                source: 'import',
                targetMessageIndex: 0,
                aiFloor: 1,
                filledSheetKeys: ['sheet_a', 'sheet_b'],
                changedSheetKeys: ['sheet_a', 'sheet_b'],
                groupKeys: [],
                operations: [{ kind: 'data_replace', data: makeDslCheckpointData(), reason: 'import' }],
              }],
            },
          },
        },
      },
    ];

    const result = await loadTableStateFromFramesV2_ACU(chat, '');

    expect(result).toBeNull();
  });
});
