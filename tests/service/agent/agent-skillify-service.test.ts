import { describe, expect, it, vi } from 'vitest';

const { mockGetLorebookEntriesByNames } = vi.hoisted(() => ({
  mockGetLorebookEntriesByNames: vi.fn(async () => ({})),
}));

vi.mock('../../../src/service/ai/api-call', () => ({
  callAIWithPreset_ACU: vi.fn(),
}));

vi.mock('../../../src/service/runtime/state-manager', () => ({
  settings_ACU: {
    plotSettings: {
      plotWorldbookConfig: {},
      agentWorldbookControl: { maxSkillifyConcurrency: 1 },
    },
  },
}));

vi.mock('../../../src/service/worldbook/worldbook-service', () => ({
  getCharLorebooks_ACU: vi.fn(async () => ({ primary: '', additional: [] })),
}));

vi.mock('../../../src/service/worldbook/pipeline', () => ({
  getLorebookEntriesByNames_ACU: mockGetLorebookEntriesByNames,
}));

vi.mock('../../../src/service/agent/agent-worldbook-skill-meta', () => ({
  parseWorldbookSkillMetaFromComment_ACU: vi.fn(() => null),
  saveWorldbookEntrySkillMeta_ACU: vi.fn(),
}));

import {
  collectWorldbookSkillifyCandidates_ACU,
  isDatabaseGeneratedWorldbookEntryForAgent_ACU,
  isWorldbookEntrySkillifyCandidate_ACU,
} from '../../../src/service/agent/agent-skillify-service';

describe('agent worldbook skillify candidate filtering', () => {
  it('excludes database-generated TavernDB entries from Agent candidates', () => {
    expect(isDatabaseGeneratedWorldbookEntryForAgent_ACU({ comment: 'TavernDB-ACU-ReadableDataTable', keys: ['db'] })).toBe(true);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: 'TavernDB-ACU-ReadableDataTable', keys: ['db'] })).toBe(false);
  });

  it('excludes isolated and imported database-generated entries', () => {
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: 'ACU-[role-a]-TavernDB-ACU-WrapperStart', keys: ['wrap'] })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: 'ACU-[role-a]-外部导入-TavernDB-ACU-MemoryStart', keys: ['memory'] })).toBe(false);
  });

  it('excludes Chinese summary and person database entries', () => {
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '重要人物条目-张三', keys: ['张三'] })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '外部导入-总结条目-1', keys: ['总结'] })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: 'ACU-[role-a]-小总结条目-2', keys: ['小总结'] })).toBe(false);
  });

  it('keeps normal keyed user entries as Agent candidates', () => {
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: ['酒馆'] })).toBe(true);
  });

  it('does not treat Agent-managed greenlight entries as database-generated entries', () => {
    expect(isDatabaseGeneratedWorldbookEntryForAgent_ACU({ comment: 'TavernDB-ACU-AgentGreenlight-plot', keys: ['agent'] })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: 'TavernDB-ACU-AgentGreenlight-plot', keys: ['agent'] })).toBe(true);
  });

  it('keeps existing disabled, constant, and keyword checks intact', () => {
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: ['酒馆'], enabled: false })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: ['酒馆'], type: 'constant' })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: [] })).toBe(false);
  });

  it('excludes Agent worldbook snapshot internal entries from collect candidates', async () => {
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [
        {
          uid: 'snapshot',
          comment: 'TavernDB-ACU-AgentWorldbookSnapshot',
          content: '{"version":1}',
          enabled: true,
          keys: ['异常快照关键词'],
        },
        {
          uid: 'normal',
          comment: '用户自定义地点',
          content: '酒馆内容',
          enabled: true,
          keys: ['酒馆'],
        },
      ],
    });

    const candidates = await collectWorldbookSkillifyCandidates_ACU(['剧情书']);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ uid: 'normal', bookName: '剧情书' });
  });
});
