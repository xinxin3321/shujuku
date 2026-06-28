import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEntriesByBook,
  mockPersistSettings,
  mockResolveBookNames,
  mockHashUserInput,
} = vi.hoisted(() => ({
  mockEntriesByBook: new Map<string, any[]>(),
  mockPersistSettings: vi.fn(),
  mockResolveBookNames: vi.fn(async () => ['角色A世界书']),
  mockHashUserInput: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock('../../../src/data/gateways/worldbook-gateway', () => ({
  getLorebookEntries_ACU: vi.fn(async (bookName: string) => mockEntriesByBook.get(bookName) || []),
  deleteLorebookEntries_ACU: vi.fn(async (bookName: string, uids: any[]) => {
    const uidSet = new Set((uids || []).map(uid => String(uid)));
    const entries = mockEntriesByBook.get(bookName) || [];
    mockEntriesByBook.set(bookName, entries.filter(entry => !uidSet.has(String(entry.uid))));
  }),
}));

vi.mock('../../../src/data/storage/tavern-storage', () => ({
  persistTavernSettings_ACU: mockPersistSettings,
}));

vi.mock('../../../src/shared/utils', () => ({
  hashUserInput_ACU: mockHashUserInput,
}));

vi.mock('../../../src/service/runtime/state-manager', () => ({
  settings_ACU: { plotSettings: {} },
}));

vi.mock('../../../src/service/agent/agent-skillify-service', () => ({
  resolvePlotWorldbookSkillifyBookNames_ACU: mockResolveBookNames,
  isWorldbookEntrySkillifyCandidate_ACU: vi.fn((entry: any) => entry?.enabled !== false && String(entry?.type || '').toLowerCase() !== 'constant' && Array.isArray(entry?.keys) && entry.keys.length > 0),
  getWorldbookEntryKeywordsForSkillify_ACU: vi.fn((entry: any) => entry?.keys || []),
}));

import { settings_ACU } from '../../../src/service/runtime/state-manager';
import {
  AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU,
  AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU,
  getPlotAgentWorldbookSnapshot_ACU,
  readFinalGenerationGreenlights_ACU,
  refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU,
  restoreWorldbookGreenlights_ACU,
  takeoverWorldbookGreenlights_ACU,
  writeFinalGenerationGreenlights_ACU,
} from '../../../src/service/agent/agent-worldbook-takeover';

function snapshotEntry(bookName = '角色A世界书'): any {
  return (mockEntriesByBook.get(bookName) || []).find(entry => entry.comment === AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU);
}

function finalGenerationGreenlightEntry(bookName = '角色A世界书'): any {
  return (mockEntriesByBook.get(bookName) || []).find(entry => entry.comment === AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEntriesByBook.clear();
  mockResolveBookNames.mockResolvedValue(['角色A世界书']);
  (settings_ACU as any).plotSettings = {};
  mockEntriesByBook.set('角色A世界书', [
    { uid: 1, enabled: true, keys: ['钥匙A'], comment: '普通条目A', content: '内容A' },
  ]);
});

describe('agent worldbook takeover runtime filtering compatibility', () => {
  it('接管只启用运行时过滤兼容壳，不写内部快照也不禁用原条目', async () => {
    const result = await takeoverWorldbookGreenlights_ACU();

    expect(result.updated).toBe(true);
    expect(result.reason).toBe('runtime_filter_only');
    expect(result.totalCandidates).toBe(1);
    expect(result.disabled).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.snapshot.active).toBe(false);
    expect(result.updates).toEqual([{ bookName: '角色A世界书', uid: 1 }]);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(true);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(false);
    expect(snapshotEntry()).toBeUndefined();
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
  });

  it('世界书范围为空时不启用运行时过滤', async () => {
    mockResolveBookNames.mockResolvedValue([]);

    const result = await takeoverWorldbookGreenlights_ACU();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('empty_scope');
    expect(result.totalCandidates).toBe(0);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(false);
  });

  it('刷新快照时忽略旧内部快照并保持非 active 运行时状态', async () => {
    (settings_ACU as any).plotSettings.agentWorldbookControlSnapshot = {
      active: true,
      selectionSignature: 'stale',
      createdAt: 1,
      books: { stale: [{ uid: 9, previousEnabled: true }] },
    };

    const snapshot = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();

    expect(snapshot.active).toBe(false);
    expect(snapshot.books).toEqual({});
    expect(getPlotAgentWorldbookSnapshot_ACU()).toMatchObject({ active: false, books: {} });
  });

  it('正文绿灯写入兼容壳只清理旧托管状态，不再写入或读取隐藏条目', async () => {
    mockEntriesByBook.set('角色A世界书', [
      { uid: 1, enabled: true, keys: ['钥匙A'], comment: '普通条目A', content: '内容A' },
      { uid: 'final-state', enabled: false, type: 'constant', keys: [], comment: AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU, content: '{}' },
    ]);

    const written = await writeFinalGenerationGreenlights_ACU([{ bookName: '角色A世界书', uid: 1, reason: '正文需要' }]);
    const readBack = await readFinalGenerationGreenlights_ACU();

    expect(written).toBe(false);
    expect(readBack).toEqual([]);
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(true);
  });

  it('恢复只清理旧版本内部隐藏条目，不恢复或改写原世界书条目状态', async () => {
    mockEntriesByBook.set('角色A世界书', [
      { uid: 1, enabled: false, keys: ['钥匙A'], comment: '普通条目A', content: '内容A' },
      { uid: 'final-state', enabled: false, type: 'constant', keys: [], comment: AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU, content: '{}' },
      { uid: 'snapshot-state', enabled: false, type: 'constant', keys: [], comment: AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU, content: '{}' },
    ]);

    const result = await restoreWorldbookGreenlights_ACU();

    expect(result.updated).toBe(true);
    expect(result.reason).toBe('legacy_artifacts_cleaned');
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(false);
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
    expect(snapshotEntry()).toBeUndefined();
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(false);
  });

  it('没有遗留内部条目时恢复返回运行时过滤语义的空操作结果', async () => {
    const result = await restoreWorldbookGreenlights_ACU();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('runtime_filter_only');
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(true);
    expect(snapshotEntry()).toBeUndefined();
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
  });
});
