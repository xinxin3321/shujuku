import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetLorebookEntriesByNames } = vi.hoisted(() => ({
  mockGetLorebookEntriesByNames: vi.fn(async () => ({})),
}));

const { mockCallAIWithPreset, mockSettings, mockParseWorldbookSkillMeta, mockSaveWorldbookEntrySkillMeta, mockReadAgentWorldbookControl } = vi.hoisted(() => ({
  mockCallAIWithPreset: vi.fn(),
  mockReadAgentWorldbookControl: vi.fn(),
  mockSaveWorldbookEntrySkillMeta: vi.fn(),
  mockParseWorldbookSkillMeta: vi.fn(() => null),
  mockSettings: {
    plotSettings: {
      plotWorldbookConfig: {},
      agentWorldbookControl: { maxSkillifyConcurrency: 1 } as any,
    },
  },
}));

vi.mock('../../../src/service/ai/api-call', () => ({
  callAIWithPreset_ACU: mockCallAIWithPreset,
}));

vi.mock('../../../src/service/runtime/state-manager', () => ({
  settings_ACU: mockSettings,
}));

vi.mock('../../../src/service/worldbook/worldbook-service', () => ({
  getCharLorebooks_ACU: vi.fn(async () => ({ primary: '', additional: [] })),
}));

vi.mock('../../../src/service/worldbook/pipeline', () => ({
  getLorebookEntriesByNames_ACU: mockGetLorebookEntriesByNames,
}));

vi.mock('../../../src/service/agent/agent-worldbook-skill-meta', () => ({
  parseWorldbookSkillMetaFromComment_ACU: mockParseWorldbookSkillMeta,
  saveWorldbookEntrySkillMeta_ACU: mockSaveWorldbookEntrySkillMeta,
  stripWorldbookSkillMetaBlock_ACU: vi.fn((comment: unknown) => String(comment || '').replace(/\n?<!--\s*ACU_SKILL_META_START\s*\n[\s\S]*?\nACU_SKILL_META_END\s*-->\n?/g, '\n').trim()),
}));

vi.mock('../../../src/service/agent/agent-worldbook-config-meta', () => ({
  readAgentWorldbookControlFromWorldbooks_ACU: mockReadAgentWorldbookControl,
}));

import {
  buildWorldbookSkillifyPrompt_ACU,
  collectWorldbookSkillifyCandidates_ACU,
  isDatabaseGeneratedWorldbookEntryForAgent_ACU,
  isWorldbookEntrySkillifyCandidate_ACU,
  parseAgentSkillifyResponse_ACU,
  skillifyWorldbookEntries_ACU,
} from '../../../src/service/agent/agent-skillify-service';

describe('agent worldbook skillify candidate filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.plotSettings.agentWorldbookControl = {
      maxSkillifyConcurrency: 1,
      agentSkillApiPreset: '',
      contextSettings: {},
      agentSkillifyPromptSegments: undefined,
    };
    mockGetLorebookEntriesByNames.mockResolvedValue({});
    mockParseWorldbookSkillMeta.mockReturnValue(null);
    mockCallAIWithPreset.mockResolvedValue('');
    mockSaveWorldbookEntrySkillMeta.mockResolvedValue({ updated: true });
    mockReadAgentWorldbookControl.mockImplementation(async () => ({
      control: mockSettings.plotSettings.agentWorldbookControl,
      source: 'legacy_settings',
      bookName: '',
      duplicateCount: 0,
      writableBookName: '',
      reason: 'legacy_settings_fallback',
    }));
  });

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

  it('always excludes Agent final generation greenlight internal entries from Agent candidates', () => {
    const entry = { comment: 'TavernDB-ACU-AgentFinalGenerationGreenlights', keys: ['异常关键词'], enabled: true, type: 'selective' };
    expect(isDatabaseGeneratedWorldbookEntryForAgent_ACU(entry)).toBe(true);
    expect(isWorldbookEntrySkillifyCandidate_ACU(entry)).toBe(false);
  });

  it('keeps disabled and constant checks while allowing entries without keywords', () => {
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: ['酒馆'], enabled: false })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: ['酒馆'], type: 'constant' })).toBe(false);
    expect(isWorldbookEntrySkillifyCandidate_ACU({ comment: '用户自定义地点', keys: [] })).toBe(true);
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
    expect(candidates[0].tk).toBe(3);
  });

  it('renders editable skillify prompt placeholders', () => {
    mockSettings.plotSettings.agentWorldbookControl.agentSkillifyPromptSegments = [
      { role: 'user', deletable: true, content: 'B={{agent.skillify.bookName}};U={{agent.skillify.uid}};K={{agent.skillify.keysText}};TK={{agent.skillify.tk}};C={{agent.skillify.contentPreview}};M={{agent.skillify.existingSkillMetaJson}}' },
    ];

    const messages = buildWorldbookSkillifyPrompt_ACU({
      bookName: '剧情书',
      uid: 7,
      comment: '酒馆地点',
      content: '灯火昏暗，吧台后藏着通往地下室的暗门。',
      keys: ['酒馆', '夜晚'],
      existingSkillMeta: { version: 1, description: '旧描述', triggerWhen: '旧触发', updatedAt: 1, updatedBy: 'manual' },
      tk: 42,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('B=剧情书');
    expect(messages[0].content).toContain('U=7');
    expect(messages[0].content).toContain('K=酒馆、夜晚');
    expect(messages[0].content).toContain('TK=42');
    expect(messages[0].content).toContain('C=灯火昏暗，吧台后藏着通往地下室的暗门。');
    expect(messages[0].content).toContain('旧描述');
  });

  it('renders original worldbook content in default skillify prompt', () => {
    mockSettings.plotSettings.agentWorldbookControl.agentSkillifyPromptSegments = undefined;

    const messages = buildWorldbookSkillifyPrompt_ACU({
      bookName: '剧情书',
      uid: 8,
      comment: '酒馆地点',
      content: '灯火昏暗，吧台后藏着通往地下室的暗门。',
      keys: ['酒馆'],
      existingSkillMeta: null,
      tk: 7,
    });

    const rendered = messages.map(message => message.content).join('\n');
    expect(rendered).not.toContain('contentPreview');
    expect(rendered).toContain('条目正文');
    expect(rendered).toContain('灯火昏暗，吧台后藏着通往地下室的暗门。');
    expect(rendered).toContain('描述、触发时机与 tk 数值');
    expect(rendered).toContain('酒馆地点');
    expect(rendered).toContain('条目 TK: 7');
  });


  it('uses context settings for default skillify max entries while keeping original content', async () => {
    mockSettings.plotSettings.agentWorldbookControl.contextSettings = {
      skillifyContentPreviewLimit: 1,
      skillifyMaxEntries: 1,
    };
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [
        { uid: 'a', comment: '地点A', content: 'A'.repeat(250), enabled: true, keys: ['A'] },
        { uid: 'b', comment: '地点B', content: 'B'.repeat(250), enabled: true, keys: ['B'] },
      ],
    });

    const candidates = await collectWorldbookSkillifyCandidates_ACU(['剧情书']);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].uid).toBe('a');
    expect(candidates[0]).not.toHaveProperty('contentPreview');
    expect(candidates[0].content).toBe('A'.repeat(250));
    expect(candidates[0].tk).toBe(157);
  });

  it('uses existing skill meta tk before estimating content tk', async () => {
    mockParseWorldbookSkillMeta.mockReturnValueOnce({ version: 1, description: '旧描述', triggerWhen: '旧触发', tk: 12, updatedAt: 1, updatedBy: 'agent-skillify' });
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'a', comment: '地点A', content: 'A'.repeat(250), enabled: true, keys: ['A'] }],
    });

    const candidates = await collectWorldbookSkillifyCandidates_ACU(['剧情书']);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].tk).toBe(12);
  });

  it('strips existing skill meta block from skillify summary comment', async () => {
    const metaBlock = '<!-- ACU_SKILL_META_START\n{"version":1,"description":"旧描述","triggerWhen":"旧触发","tk":12,"updatedAt":1,"updatedBy":"agent-skillify"}\nACU_SKILL_META_END -->';
    mockParseWorldbookSkillMeta.mockReturnValueOnce({ version: 1, description: '旧描述', triggerWhen: '旧触发', tk: 12, updatedAt: 1, updatedBy: 'agent-skillify' });
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'a', comment: `地点A\n\n${metaBlock}`, content: 'A'.repeat(20), enabled: true, keys: ['A'] }],
    });

    const candidates = await collectWorldbookSkillifyCandidates_ACU(['剧情书']);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].comment).toBe('地点A');
    expect(candidates[0].existingSkillMeta?.description).toBe('旧描述');
    expect(JSON.stringify(candidates[0])).not.toContain('ACU_SKILL_META_START');
  });

  it('parses skillify response tk and falls back when tk is omitted', () => {
    expect(parseAgentSkillifyResponse_ACU('{"description":"描述","triggerWhen":"触发","tk":88}', 12)).toEqual({
      description: '描述',
      triggerWhen: '触发',
      tk: 88,
    });

    expect(parseAgentSkillifyResponse_ACU('{"description":"描述","triggerWhen":"触发"}', 12)).toEqual({
      description: '描述',
      triggerWhen: '触发',
      tk: 12,
    });
  });

  it('saves parsed skillify tk meta with agent-skillify updatedBy', async () => {
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'a', comment: '地点A', content: 'A'.repeat(100), enabled: true, keys: ['A'] }],
    });
    mockCallAIWithPreset.mockResolvedValueOnce('{"description":"新描述","triggerWhen":"新触发","tk":64}');
    mockSaveWorldbookEntrySkillMeta.mockResolvedValueOnce({ updated: true });

    const result = await skillifyWorldbookEntries_ACU(['剧情书']);

    expect(mockSaveWorldbookEntrySkillMeta).toHaveBeenCalledWith('剧情书', 'a', {
      description: '新描述',
      triggerWhen: '新触发',
      tk: 64,
    }, 'agent-skillify');
    expect(result).toMatchObject({ totalCandidates: 1, updated: 1, skipped: 0, failed: 0 });
  });

  it('retries AI skillify responses according to maxAiRetries before saving', async () => {
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'retry', comment: '地点Retry', content: 'R'.repeat(20), enabled: true, keys: [] }],
    });
    mockCallAIWithPreset
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('{"description":"新描述","triggerWhen":"新触发","tk":9}');
    mockSaveWorldbookEntrySkillMeta.mockResolvedValueOnce({ updated: true });
    const progress = vi.fn();

    const result = await skillifyWorldbookEntries_ACU(['剧情书'], { maxAiRetries: 2, onProgress: progress });

    expect(mockCallAIWithPreset).toHaveBeenCalledTimes(2);
    expect(mockSaveWorldbookEntrySkillMeta).toHaveBeenCalledWith('剧情书', 'retry', { description: '新描述', triggerWhen: '新触发', tk: 9 }, 'agent-skillify');
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'retry', attempt: 1, maxAttempts: 2, uid: 'retry' }));
    expect(result).toMatchObject({ totalCandidates: 1, updated: 1, skipped: 0, failed: 0 });
  });

  it('falls back to summary tk when saving skillify response without tk', async () => {
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'a', comment: '地点A', content: 'A'.repeat(100), enabled: true, keys: ['A'] }],
    });
    mockCallAIWithPreset.mockResolvedValueOnce('{"description":"新描述","triggerWhen":"新触发"}');
    mockSaveWorldbookEntrySkillMeta.mockResolvedValueOnce({ updated: false, reason: '世界书 Skill 元数据未变化' });

    const result = await skillifyWorldbookEntries_ACU(['剧情书']);

    expect(mockSaveWorldbookEntrySkillMeta).toHaveBeenCalledWith('剧情书', 'a', {
      description: '新描述',
      triggerWhen: '新触发',
      tk: 63,
    }, 'agent-skillify');
    expect(result).toMatchObject({ totalCandidates: 1, updated: 0, skipped: 1, failed: 0 });
  });

  it('reports invalid skillify response and save errors as failed results', async () => {
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'invalid', comment: '无效', content: 'X', enabled: true, keys: ['X'] }],
    });
    mockCallAIWithPreset.mockResolvedValueOnce('{"description":"","triggerWhen":""}');

    const invalidResult = await skillifyWorldbookEntries_ACU(['剧情书']);

    expect(invalidResult).toMatchObject({ totalCandidates: 1, updated: 0, skipped: 0, failed: 1 });
    expect(mockSaveWorldbookEntrySkillMeta).not.toHaveBeenCalled();

    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'save-failed', comment: '保存失败', content: 'Y', enabled: true, keys: ['Y'] }],
    });
    mockCallAIWithPreset.mockResolvedValueOnce('{"description":"新描述","triggerWhen":"新触发","tk":1}');
    mockSaveWorldbookEntrySkillMeta.mockResolvedValueOnce({ updated: false, reason: '写入失败' });

    const saveFailedResult = await skillifyWorldbookEntries_ACU(['剧情书']);

    expect(saveFailedResult).toMatchObject({ totalCandidates: 1, updated: 0, skipped: 0, failed: 1 });
    expect(saveFailedResult.results[0].reason).toBe('写入失败');
  });

  it('uses worldbook card config before legacy settings for skillify prompt and preset', async () => {
    mockSettings.plotSettings.agentWorldbookControl = {
      agentSkillApiPreset: 'legacy-preset',
      maxSkillifyConcurrency: 1,
      contextSettings: { agentAiMaxRetries: 1, skillifyMaxEntries: 5 },
      agentSkillifyPromptSegments: [
        { role: 'user', deletable: true, content: 'LEGACY={{agent.skillify.bookName}}' },
      ],
    };
    mockReadAgentWorldbookControl.mockResolvedValueOnce({
      control: {
        ...mockSettings.plotSettings.agentWorldbookControl,
        agentSkillApiPreset: 'worldbook-preset',
        contextSettings: { agentAiMaxRetries: 1, skillifyMaxEntries: 5 },
        agentSkillifyPromptSegments: [
          { role: 'user', deletable: true, content: 'WB={{agent.skillify.bookName}};UID={{agent.skillify.uid}}' },
        ],
      },
      source: 'worldbook',
      bookName: '角色A世界书',
      duplicateCount: 0,
      writableBookName: '角色A世界书',
    });
    mockGetLorebookEntriesByNames.mockResolvedValueOnce({
      '剧情书': [{ uid: 'wb-first', comment: '地点A', content: 'A'.repeat(20), enabled: true, keys: ['A'] }],
    });
    mockCallAIWithPreset.mockResolvedValueOnce('{"description":"新描述","triggerWhen":"新触发","tk":4}');

    await skillifyWorldbookEntries_ACU(['剧情书']);

    expect(mockCallAIWithPreset).toHaveBeenCalledWith([
      { role: 'user', content: 'WB=剧情书;UID=wb-first' },
    ], 'worldbook-preset');
  });
});
