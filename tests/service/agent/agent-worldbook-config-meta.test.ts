import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEntriesByBook, mockCreated, mockDeleted, mockSettings } = vi.hoisted(() => ({
  mockEntriesByBook: new Map<string, any[]>(),
  mockCreated: vi.fn(),
  mockDeleted: vi.fn(),
  mockSettings: { plotSettings: {} as any },
}));

vi.mock('../../../src/data/gateways/worldbook-gateway', () => ({
  getCurrentCharPrimaryLorebook_ACU: vi.fn(async () => '主世界书'),
  getCharLorebooks_ACU: vi.fn(async () => ({ primary: '主世界书', additional: [] })),
  getLorebookEntries_ACU: vi.fn(async (bookName: string) => mockEntriesByBook.get(bookName) || []),
  createLorebookEntries_ACU: vi.fn(async (bookName: string, entries: any[]) => {
    mockCreated(bookName, entries);
    mockEntriesByBook.set(bookName, [...(mockEntriesByBook.get(bookName) || []), ...entries.map((entry, index) => ({ ...entry, uid: entry.uid ?? `new-${index}` }))]);
  }),
  setLorebookEntries_ACU: vi.fn(async (bookName: string, patches: any[]) => {
    const patchByUid = new Map((patches || []).map(patch => [String(patch.uid), patch]));
    mockEntriesByBook.set(bookName, (mockEntriesByBook.get(bookName) || []).map(entry => patchByUid.has(String(entry.uid)) ? { ...entry, ...patchByUid.get(String(entry.uid)) } : entry));
  }),
  deleteLorebookEntries_ACU: vi.fn(async (bookName: string, uids: any[]) => {
    mockDeleted(bookName, uids);
    const uidSet = new Set((uids || []).map(uid => String(uid)));
    mockEntriesByBook.set(bookName, (mockEntriesByBook.get(bookName) || []).filter(entry => !uidSet.has(String(entry.uid))));
  }),
}));

vi.mock('../../../src/service/runtime/state-manager', () => ({ settings_ACU: mockSettings }));

import { getCharLorebooks_ACU } from '../../../src/data/gateways/worldbook-gateway';
import {
  AGENT_WORLDBOOK_CONFIG_COMMENT_ACU,
  deleteAgentWorldbookStateEntry_ACU,
  readAgentWorldbookStateFromWorldbooks_ACU,
  writeAgentWorldbookControlToWorldbook_ACU,
  writeAgentWorldbookStateToWorldbook_ACU,
} from '../../../src/service/agent/agent-worldbook-config-meta';

function configEntry(content: unknown, uid: any = 'cfg', comment = AGENT_WORLDBOOK_CONFIG_COMMENT_ACU): any {
  return { uid, comment, enabled: false, keys: [], content: JSON.stringify(content) };
}

describe('agent worldbook config/state meta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntriesByBook.clear();
    mockSettings.plotSettings = {};
    vi.mocked(getCharLorebooks_ACU).mockResolvedValue({ primary: '主世界书', additional: [] } as any);
  });

  it('reads legacy version 1 config as control with inactive snapshot', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 1,
      kind: 'agent_worldbook_config',
      updatedAt: 1,
      control: { mode: 'agent', agentApiPreset: 'preset-a' },
    })]);

    const result = await readAgentWorldbookStateFromWorldbooks_ACU();

    expect(result.source).toBe('worldbook');
    expect(result.control.mode).toBe('agent');
    expect(result.control.enabled).toBe(true);
    expect(result.control.agentApiPreset).toBe('preset-a');
    expect(result.snapshot).toEqual({ active: false, selectionSignature: '', createdAt: 0, books: {} });
  });

  it('reads version 2 state with normalized snapshot', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 2,
      kind: 'agent_worldbook_state',
      updatedAt: 2,
      control: { mode: 'passive' },
      snapshot: {
        active: true,
        selectionSignature: 'sig-1',
        createdAt: 123,
        books: {
          '剧情书': [
            { uid: 1, previousEnabled: false, previousKeys: [' key ', '', 7], previousType: 'selective', commentHash: ' hash ' },
            { uid: '', previousEnabled: true },
          ],
          '': [{ uid: 9, previousEnabled: true }],
        },
      },
    })]);

    const result = await readAgentWorldbookStateFromWorldbooks_ACU();

    expect(result.control.mode).toBe('passive');
    expect(result.snapshot).toEqual({
      active: true,
      selectionSignature: 'sig-1',
      createdAt: 123,
      books: {
        '剧情书': [
          { uid: 1, previousEnabled: false, previousKeys: ['key', '7'], previousType: 'selective', commentHash: 'hash' },
        ],
      },
    });
  });

  it('reads version 2 state by content identity when comment was renamed', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 2,
      kind: 'agent_worldbook_state',
      updatedAt: 2,
      identity: {
        marker: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU,
        hostBookName: '主世界书',
        stateEntryUid: 'cfg-renamed',
      },
      control: { mode: 'agent', agentApiPreset: 'renamed-preset' },
      snapshot: { active: false, selectionSignature: '', createdAt: 0, books: {} },
    }, 'cfg-renamed', '用户改过的备注')]);

    const result = await readAgentWorldbookStateFromWorldbooks_ACU();

    expect(result.source).toBe('worldbook');
    expect(result.entryUid).toBe('cfg-renamed');
    expect(result.control.mode).toBe('agent');
    expect(result.control.agentApiPreset).toBe('renamed-preset');
  });

  it('writes renamed state entry by uid without creating a duplicate or overwriting user comment', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 2,
      kind: 'agent_worldbook_state',
      updatedAt: 2,
      identity: { marker: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU, hostBookName: '主世界书', stateEntryUid: 'cfg-renamed' },
      control: { mode: 'agent', agentApiPreset: 'old' },
      snapshot: { active: false, selectionSignature: '', createdAt: 0, books: {} },
    }, 'cfg-renamed', '用户改过的备注')]);

    const result = await writeAgentWorldbookControlToWorldbook_ACU({ agentApiPreset: 'new' } as any);
    const entries = mockEntriesByBook.get('主世界书') || [];
    const state = JSON.parse(entries[0].content);

    expect(result.entryUid).toBe('cfg-renamed');
    expect(mockCreated).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
    expect(entries[0].comment).toBe('用户改过的备注');
    expect(state.identity).toMatchObject({ marker: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU, hostBookName: '主世界书', stateEntryUid: 'cfg-renamed' });
    expect(state.control.agentApiPreset).toBe('new');
  });

  it('writes control without losing existing snapshot', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 2,
      kind: 'agent_worldbook_state',
      updatedAt: 2,
      control: { mode: 'agent', agentApiPreset: 'old' },
      snapshot: { active: true, selectionSignature: 'sig-2', createdAt: 456, books: { '剧情书': [{ uid: 2, previousEnabled: true, previousKeys: ['A'] }] } },
    }, 'cfg-1')]);

    const result = await writeAgentWorldbookControlToWorldbook_ACU({ agentApiPreset: 'new' } as any);
    const state = JSON.parse((mockEntriesByBook.get('主世界书') || [])[0].content);

    expect(result.updated).toBe(true);
    expect(result.entryUid).toBe('cfg-1');
    expect(state.version).toBe(2);
    expect(state.kind).toBe('agent_worldbook_state');
    expect(state.control.agentApiPreset).toBe('new');
    expect(state.snapshot).toMatchObject({ active: true, selectionSignature: 'sig-2', books: { '剧情书': [{ uid: 2, previousEnabled: true, previousKeys: ['A'] }] } });
  });

  it('writes snapshot without losing existing control', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 2,
      kind: 'agent_worldbook_state',
      updatedAt: 2,
      control: { mode: 'agent', agentApiPreset: 'keep-me' },
      snapshot: { active: false, selectionSignature: '', createdAt: 0, books: {} },
    }, 'cfg-1')]);

    const result = await writeAgentWorldbookStateToWorldbook_ACU({
      snapshot: { active: true, selectionSignature: 'sig-3', createdAt: 789, books: { '剧情书': [{ uid: 3, previousEnabled: true }] } },
    });
    const state = JSON.parse((mockEntriesByBook.get('主世界书') || [])[0].content);

    expect(result.updated).toBe(true);
    expect(state.control.agentApiPreset).toBe('keep-me');
    expect(state.control.mode).toBe('agent');
    expect(state.snapshot).toMatchObject({ active: true, selectionSignature: 'sig-3', books: { '剧情书': [{ uid: 3, previousEnabled: true }] } });
    expect(JSON.parse((mockEntriesByBook.get('主世界书') || [])[0].content).snapshot.books['剧情书']).toEqual([
      { uid: 3, previousEnabled: true, previousKeys: [] },
    ]);
  });

  it('overwrites an existing empty state snapshot with the active takeover snapshot content', async () => {
    mockEntriesByBook.set('主世界书', [configEntry({
      version: 2,
      kind: 'agent_worldbook_state',
      updatedAt: 2,
      control: { mode: 'agent', agentApiPreset: 'keep-me' },
      snapshot: { active: false, selectionSignature: '', createdAt: 0, books: {} },
    }, 'cfg-1')]);

    const activeSnapshot = {
      active: true,
      selectionSignature: 'sig-active',
      createdAt: 999,
      books: { '娇妻沦为仇敌性奴': [{ uid: 52, previousEnabled: true, previousKeys: ['钥匙52'], previousType: 'selective', commentHash: 'hash:旧备注' }] },
    };

    const result = await writeAgentWorldbookStateToWorldbook_ACU({ snapshot: activeSnapshot });
    const state = JSON.parse((mockEntriesByBook.get('主世界书') || [])[0].content);

    expect(result.updated).toBe(true);
    expect(result.snapshot).toEqual(activeSnapshot);
    expect(state.snapshot).toEqual(activeSnapshot);
  });

  it('creates version 2 state entry when no config entry exists', async () => {
    mockEntriesByBook.set('主世界书', [{ uid: 1, comment: '普通条目', enabled: true }]);

    const result = await writeAgentWorldbookStateToWorldbook_ACU({
      control: { mode: 'agent' } as any,
      snapshot: { active: true, selectionSignature: 'sig-4', createdAt: 1, books: { '剧情书': [{ uid: 4, previousEnabled: true, previousKeys: ['K4'] }] } },
    });

    expect(result.updated).toBe(true);
    expect(mockCreated).toHaveBeenCalledTimes(1);
    const created = (mockEntriesByBook.get('主世界书') || []).find(entry => entry.comment === AGENT_WORLDBOOK_CONFIG_COMMENT_ACU);
    expect(result.entryUid).toBe('new-0');
    expect(JSON.parse(created.content)).toMatchObject({
      version: 2,
      kind: 'agent_worldbook_state',
      identity: {
        marker: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU,
        hostBookName: '主世界书',
        stateEntryUid: 'new-0',
      },
      control: { mode: 'agent' },
      snapshot: { active: true, selectionSignature: 'sig-4', books: { '剧情书': [{ uid: 4, previousEnabled: true, previousKeys: ['K4'] }] } },
    });
  });

  it('deletes parseable state entries even when comment was renamed', async () => {
    mockEntriesByBook.set('主世界书', [
      configEntry({ version: 2, kind: 'agent_worldbook_state', updatedAt: 1, identity: { marker: AGENT_WORLDBOOK_CONFIG_COMMENT_ACU, hostBookName: '主世界书', stateEntryUid: 'cfg-1' }, control: {}, snapshot: {} }, 'cfg-1', '用户改过的备注'),
      { uid: 'normal', comment: '普通条目' },
    ]);

    const deleted = await deleteAgentWorldbookStateEntry_ACU('主世界书');

    expect(deleted).toBe(1);
    expect(mockDeleted).toHaveBeenCalledWith('主世界书', ['cfg-1']);
    expect(mockEntriesByBook.get('主世界书')).toEqual([{ uid: 'normal', comment: '普通条目' }]);
  });

  it('deletes all exact state entries in the target book only', async () => {
    mockEntriesByBook.set('主世界书', [
      configEntry({ version: 2, kind: 'agent_worldbook_state', updatedAt: 1, control: {}, snapshot: {} }, 'cfg-1'),
      configEntry({ version: 2, kind: 'agent_worldbook_state', updatedAt: 1, control: {}, snapshot: {} }, 'cfg-2'),
      { uid: 'normal', comment: 'TavernDB-ACU-AgentWorldbookConfig-用户条目' },
    ]);

    const deleted = await deleteAgentWorldbookStateEntry_ACU('主世界书');

    expect(deleted).toBe(2);
    expect(mockDeleted).toHaveBeenCalledWith('主世界书', ['cfg-1', 'cfg-2']);
    expect(mockEntriesByBook.get('主世界书')).toEqual([{ uid: 'normal', comment: 'TavernDB-ACU-AgentWorldbookConfig-用户条目' }]);
  });

  it('未传 bookName 时会扫描角色 all lorebooks 与 manualSelection 中残留的 state/config，但不误删相似前缀', async () => {
    vi.mocked(getCharLorebooks_ACU).mockResolvedValue({ primary: '', additional: ['旧附加书'] } as any);
    mockSettings.plotSettings = {
      plotWorldbookConfig: {
        source: 'manual',
        manualSelection: ['手动书'],
      },
    };
    mockEntriesByBook.set('主世界书', [{ uid: 'normal-main', comment: '普通条目' }]);
    mockEntriesByBook.set('手动书', [
      configEntry({ version: 2, kind: 'agent_worldbook_state', updatedAt: 1, control: {}, snapshot: {} }, 'manual-cfg'),
      { uid: 'manual-normal', comment: 'TavernDB-ACU-AgentWorldbookConfig-用户条目' },
    ]);
    mockEntriesByBook.set('旧附加书', [
      configEntry({ version: 1, kind: 'agent_worldbook_config', updatedAt: 1, control: {} }, 'legacy-cfg'),
      { uid: 'additional-normal', comment: '普通条目' },
    ]);

    const deleted = await deleteAgentWorldbookStateEntry_ACU();

    expect(deleted).toBe(2);
    expect(mockDeleted).toHaveBeenCalledWith('手动书', ['manual-cfg']);
    expect(mockDeleted).toHaveBeenCalledWith('旧附加书', ['legacy-cfg']);
    expect(mockEntriesByBook.get('手动书')).toEqual([{ uid: 'manual-normal', comment: 'TavernDB-ACU-AgentWorldbookConfig-用户条目' }]);
    expect(mockEntriesByBook.get('旧附加书')).toEqual([{ uid: 'additional-normal', comment: '普通条目' }]);
  });
});
