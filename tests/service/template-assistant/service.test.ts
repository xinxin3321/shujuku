import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockCallAIWithPreset } = vi.hoisted(() => ({
  mockCallAIWithPreset: vi.fn(),
}));

vi.mock('../../../src/service/ai/api-call', () => ({
  callAIWithPreset_ACU: mockCallAIWithPreset,
}));

vi.mock('../../../src/service/runtime/state-manager', () => ({
  settings_ACU: { tableApiPreset: 'preset-1' },
}));

vi.mock('../../../src/service/template/chat-scope', () => ({
  getSortedSheetKeys_ACU: (data: any) => Object.keys(data || {}).filter((key) => key.startsWith('sheet_')).sort((a, b) => (data[a]?.orderNo ?? 0) - (data[b]?.orderNo ?? 0)),
}));

vi.mock('../../../src/service/worldbook/injection-engine', async () => {
  const actual = await vi.importActual<any>('../../../src/service/worldbook/injection-engine-config');
  return {
    getGlobalInjectionConfigFromData_ACU: actual.getGlobalInjectionConfigFromData_ACU,
  };
});

vi.mock('../../../src/service/template-assistant/compiler', () => ({
  compileTemplateAssistantDraft_ACU: vi.fn((input: any) => ({
    candidateData: input.tempData,
    orderedSheetKeys: input.sheetOrder || [],
    deletedSheetKeys: [],
    focusSheetKey: input.currentSheetKey,
    diff: { addedSheets: [], deletedSheets: [], renamedSheets: [], movedSheets: [], patchedSourceDataSheets: [], patchedUpdateConfigSheets: [], patchedExportConfigSheets: [], globalInjectionChanged: false },
    highRiskItems: [],
  })),
}));

import {
  buildTemplateAssistantFingerprint_ACU,
  generateTemplateAssistantDraft_ACU,
  parseTemplateAssistantDraft_ACU,
  validateTemplateAssistantDraft_ACU,
} from '../../../src/service/template-assistant/service';

function buildTempData_ACU() {
  return {
    mate: {
      type: 'chatSheets',
      version: 1,
      globalInjectionConfig: {
        readableEntryPlacement: { position: 'before_character_definition', depth: 2, order: 99981 },
        wrapperPlacement: { position: 'before_character_definition', depth: 2, order: 99980 },
      },
    },
    sheet_a: {
      uid: 'sheet_a',
      name: 'A表',
      orderNo: 0,
      content: [['row_id', '姓名'], [1, '甲']],
      sourceData: { note: 'a', initNode: '', insertNode: '', updateNode: '', deleteNode: '' },
      updateConfig: { uiSentinel: -1, contextDepth: -1, updateFrequency: -1, batchSize: -1, skipFloors: -1, sendLatestRows: -1, groupId: -1 },
      exportConfig: { enabled: false, splitByRow: false, entryName: 'A表', entryType: 'constant', keywords: '', preventRecursion: true, injectionTemplate: '', extraIndexEnabled: false, extraIndexEntryName: 'A表-索引', extraIndexColumns: [], extraIndexColumnModes: {}, extraIndexInjectionTemplate: '', entryPlacement: { position: 'at_depth_as_system', depth: 2, order: 10000 }, extraIndexPlacement: { position: 'at_depth_as_system', depth: 2, order: 10010 }, fixedEntryPlacement: { position: 'at_depth_as_system', depth: 2, order: 99990 }, fixedIndexPlacement: { position: 'at_depth_as_system', depth: 2, order: 99991 } },
    },
  } as any;
}

describe('template assistant service', () => {
  beforeEach(() => {
    mockCallAIWithPreset.mockReset();
  });

  it('提取最后一个合法标签块', () => {
    const draft = parseTemplateAssistantDraft_ACU(`x<templateAssistantDraft>{"protocolVersion":1,"mode":"modify_current_template_incremental","baseFingerprint":"acu-struct:1","selectedSheetKey":"sheet_a","summary":"旧","warnings":[],"operations":[]}</templateAssistantDraft>y<templateAssistantDraft>{"protocolVersion":1,"mode":"modify_current_template_incremental","baseFingerprint":"acu-struct:2","selectedSheetKey":"sheet_a","summary":"新","warnings":[],"operations":[]}</templateAssistantDraft>`);
    expect(draft.summary).toBe('新');
    expect(draft.baseFingerprint).toBe('acu-struct:2');
  });

  it('协议缺字段时报错', () => {
    expect(() => validateTemplateAssistantDraft_ACU({ protocolVersion: 1 })).toThrow(/mode/);
  });

  it('selectedSheetKey 为空字符串时报错', () => {
    expect(() => validateTemplateAssistantDraft_ACU({
      protocolVersion: 1,
      mode: 'modify_current_template_incremental',
      baseFingerprint: 'acu-struct:1',
      selectedSheetKey: '',
      summary: 'x',
      warnings: [],
      operations: [],
    })).toThrow(/selectedSheetKey 必须是非空字符串/);
  });

  it('selectedSheetKey 与 patch op 的 sheetKey 不一致时报错', async () => {
    const tempData = buildTempData_ACU();
    const fp = buildTemplateAssistantFingerprint_ACU(tempData);
    mockCallAIWithPreset.mockResolvedValue(`<templateAssistantDraft>{"protocolVersion":1,"mode":"modify_current_template_incremental","baseFingerprint":"${fp}","selectedSheetKey":"sheet_a","summary":"x","warnings":[],"operations":[{"op":"patch_sheet_update_config","sheetKey":"sheet_b","patch":{"contextDepth":8}}]}</templateAssistantDraft>`);
    await expect(generateTemplateAssistantDraft_ACU({ tempData, currentSheetKey: 'sheet_a', sheetOrder: ['sheet_a'], userRequest: '修改当前表' })).rejects.toThrow(/selectedSheetKey/);
  });

  it('结构级 fingerprint 稳定', () => {
    const tempData = buildTempData_ACU();
    expect(buildTemplateAssistantFingerprint_ACU(tempData)).toBe(buildTemplateAssistantFingerprint_ACU(buildTempData_ACU()));
  });

  it('currentSheetKey 为空时直接拒绝生成', async () => {
    await expect(generateTemplateAssistantDraft_ACU({
      tempData: buildTempData_ACU(),
      currentSheetKey: null,
      sheetOrder: ['sheet_a'],
      userRequest: '修改当前表',
    })).rejects.toThrow(/请先选中一个表/);
    expect(mockCallAIWithPreset).not.toHaveBeenCalled();
  });

  it('构建 messages 后调用 callAIWithPreset_ACU', async () => {
    const tempData = buildTempData_ACU();
    const fp = buildTemplateAssistantFingerprint_ACU(tempData);
    mockCallAIWithPreset.mockResolvedValue(`<templateAssistantDraft>{"protocolVersion":1,"mode":"modify_current_template_incremental","baseFingerprint":"${fp}","selectedSheetKey":"sheet_a","summary":"x","warnings":[],"operations":[]}</templateAssistantDraft>`);
    const result = await generateTemplateAssistantDraft_ACU({ tempData, currentSheetKey: 'sheet_a', sheetOrder: ['sheet_a'], userRequest: '查看' });
    expect(mockCallAIWithPreset).toHaveBeenCalledTimes(1);
    expect(result.messages).toHaveLength(2);
  });
});
