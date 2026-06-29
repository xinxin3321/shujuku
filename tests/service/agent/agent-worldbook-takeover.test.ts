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
  setLorebookEntries_ACU: vi.fn(async (bookName: string, patches: any[]) => {
    const patchByUid = new Map((patches || []).map(patch => [String(patch.uid), patch]));
    const entries = mockEntriesByBook.get(bookName) || [];
    mockEntriesByBook.set(bookName, entries.map(entry => {
      const patch = patchByUid.get(String(entry.uid));
      if (!patch) return entry;
      return { ...entry, ...patch };
    }));
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

describe('agent worldbook takeover native trigger suppression', () => {
  it('接管会保存 active snapshot 并禁用原世界书条目，避免最终正文被正常世界书机制重复触发', async () => {
    const result = await takeoverWorldbookGreenlights_ACU();

    expect(result.updated).toBe(true);
    expect(result.reason).toBe('native_worldbook_trigger_disabled');
    expect(result.totalCandidates).toBe(1);
    expect(result.disabled).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.snapshot.active).toBe(true);
    expect(result.snapshot.books['角色A世界书']).toEqual([
      expect.objectContaining({
        uid: 1,
        previousEnabled: true,
        previousKeys: ['钥匙A'],
        commentHash: 'hash:普通条目A',
      }),
    ]);
    expect(result.updates).toEqual([{ bookName: '角色A世界书', uid: 1 }]);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(false);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(true);
    expect(snapshotEntry()).toBeUndefined();
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
  });

  it('重复接管时如果候选已被禁用，不覆盖既有 active snapshot，保证后续仍可恢复', async () => {
    const first = await takeoverWorldbookGreenlights_ACU();
    expect(first.reason).toBe('native_worldbook_trigger_disabled');

    const second = await takeoverWorldbookGreenlights_ACU();

    expect(second.updated).toBe(false);
    expect(second.reason).toBe('native_worldbook_trigger_already_disabled');
    expect(second.totalCandidates).toBe(0);
    expect(second.disabled).toBe(0);
    expect(second.failed).toBe(0);
    expect(second.snapshot.active).toBe(true);
    expect(second.snapshot.books['角色A世界书']).toEqual([
      expect.objectContaining({
        uid: 1,
        previousEnabled: true,
        previousKeys: ['钥匙A'],
      }),
    ]);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(true);
  });

  it('世界书范围为空时不启用运行时过滤', async () => {
    mockResolveBookNames.mockResolvedValue([]);

    const result = await takeoverWorldbookGreenlights_ACU();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('empty_scope');
    expect(result.totalCandidates).toBe(0);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(false);
  });

  it('刷新快照时保留当前 selection 的 active snapshot，确保 takeover 后 UI refresh 不破坏 restore', async () => {
    const takeoverResult = await takeoverWorldbookGreenlights_ACU();
    expect(takeoverResult.reason).toBe('native_worldbook_trigger_disabled');
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(false);

    const snapshot = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
    expect(snapshot.active).toBe(true);
    expect(snapshot.books['角色A世界书']).toEqual([
      expect.objectContaining({ uid: 1, previousEnabled: true, previousKeys: ['钥匙A'] }),
    ]);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(true);

    const restoreResult = await restoreWorldbookGreenlights_ACU();
    expect(restoreResult.reason).toBe('native_worldbook_trigger_restored');
    expect(restoreResult.restored).toBe(1);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(true);
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(false);
  });

  it('刷新快照时会清空 selection 不匹配的过期 active snapshot', async () => {
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

  it('恢复会按 active snapshot 恢复原世界书条目状态并清理旧版本内部隐藏条目', async () => {
    mockEntriesByBook.set('角色A世界书', [
      { uid: 1, enabled: false, keys: ['钥匙A'], comment: '普通条目A', content: '内容A' },
      { uid: 'final-state', enabled: false, type: 'constant', keys: [], comment: AGENT_FINAL_GENERATION_GREENLIGHT_COMMENT_ACU, content: '{}' },
      { uid: 'snapshot-state', enabled: false, type: 'constant', keys: [], comment: AGENT_WORLDBOOK_SNAPSHOT_COMMENT_ACU, content: '{}' },
    ]);
    (settings_ACU as any).plotSettings.agentWorldbookControlSnapshot = {
      active: true,
      selectionSignature: 'hash:{"scope":"agent-worldbook-takeover","books":["角色A世界书"]}',
      createdAt: 1,
      books: {
        '角色A世界书': [
          { uid: 1, previousEnabled: true, previousKeys: ['钥匙A'], commentHash: 'hash:普通条目A' },
        ],
      },
    };

    const result = await restoreWorldbookGreenlights_ACU();

    expect(result.updated).toBe(true);
    expect(result.reason).toBe('native_worldbook_trigger_restored');
    expect(result.restored).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(true);
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
    expect(snapshotEntry()).toBeUndefined();
    expect(getPlotAgentWorldbookSnapshot_ACU().active).toBe(false);
  });

  it('恢复时如果 comment 已变化则跳过该条目，避免误恢复用户已改写的世界书条目', async () => {
    mockEntriesByBook.set('角色A世界书', [
      { uid: 1, enabled: false, keys: ['新钥匙'], comment: '用户已改名', content: '内容A' },
    ]);
    (settings_ACU as any).plotSettings.agentWorldbookControlSnapshot = {
      active: true,
      selectionSignature: 'hash:{"scope":"agent-worldbook-takeover","books":["角色A世界书"]}',
      createdAt: 1,
      books: {
        '角色A世界书': [
          { uid: 1, previousEnabled: true, previousKeys: ['钥匙A'], commentHash: 'hash:普通条目A' },
        ],
      },
    };

    const result = await restoreWorldbookGreenlights_ACU();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('native_worldbook_trigger_restore_skipped');
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)).toMatchObject({
      enabled: false,
      keys: ['新钥匙'],
      comment: '用户已改名',
    });
  });

  it('没有 active snapshot 或遗留内部条目时恢复返回空操作结果', async () => {
    const result = await restoreWorldbookGreenlights_ACU();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('no_active_snapshot');
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockEntriesByBook.get('角色A世界书')?.find(entry => entry.uid === 1)?.enabled).toBe(true);
    expect(snapshotEntry()).toBeUndefined();
    expect(finalGenerationGreenlightEntry()).toBeUndefined();
  });
});
