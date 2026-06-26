import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockCallAIWithPreset,
  mockGetLorebookEntries,
  mockGetPlotAgentWorldbookSnapshot,
} = vi.hoisted(() => ({
  mockCallAIWithPreset: vi.fn(),
  mockGetLorebookEntries: vi.fn(),
  mockGetPlotAgentWorldbookSnapshot: vi.fn(),
}));

vi.mock('../../../src/service/ai/api-call', () => ({
  callAIWithPreset_ACU: mockCallAIWithPreset,
}));

vi.mock('../../../src/data/gateways/worldbook-gateway', () => ({
  getLorebookEntries_ACU: mockGetLorebookEntries,
}));

vi.mock('../../../src/service/agent/agent-worldbook-takeover', () => ({
  getPlotAgentWorldbookSnapshot_ACU: mockGetPlotAgentWorldbookSnapshot,
}));

vi.mock('../../../src/service/agent/agent-skillify-service', () => ({
  collectWorldbookSkillifyCandidates_ACU: vi.fn(async () => []),
  getWorldbookEntryKeywordsForSkillify_ACU: vi.fn((entry: any) => Array.isArray(entry?.keys) ? entry.keys : []),
  resolvePlotWorldbookSkillifyBookNames_ACU: vi.fn(async () => []),
}));

import { runAgentDecisionForPlot_ACU } from '../../../src/service/agent/agent-decision-engine';

describe('runAgentDecisionForPlot_ACU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlotAgentWorldbookSnapshot.mockReturnValue({
      active: true,
      selectionSignature: 'scope',
      createdAt: 1,
      books: { '剧情书': [{ uid: 12, previousEnabled: true }] },
    });
    mockGetLorebookEntries.mockResolvedValue([
      { uid: 12, comment: '陈默人物档案', keys: ['陈默'], content: '陈默内容', enabled: true },
    ]);
  });

  it('keeps plot greenlights keyed by normalized task id', async () => {
    mockCallAIWithPreset.mockResolvedValue(JSON.stringify({
      taskPlan: [{ taskId: 'task_id', run: true, effectiveStage: 1, effectiveOrder: 0 }],
      plotGreenlights: {
        task_id: [{ bookName: '剧情书', uid: 12, reason: '人物模板' }],
      },
      tableFillGreenlights: [],
      finalGenerationGreenlights: [{ bookName: '剧情书', uid: 12, reason: '最终生成' }],
      fallbackMode: false,
      reason: 'ok',
    }));

    const result = await runAgentDecisionForPlot_ACU({
      plotSettings: { agentWorldbookControl: { enabled: true, mode: 'agent' } },
      userMessage: '敲门',
      sharedContext: {},
      enabledTasks: [{ id: 'task id', name: '默认任务', enabled: true, promptGroup: { messages: [] } }],
    });

    expect(result.active).toBe(true);
    expect(result.taskPlan).toHaveLength(1);
    expect(result.effectiveTasks[0].id).toBe('task_id');
    expect(result.plotGreenlights.task_id).toEqual([
      { bookName: '剧情书', uid: 12, reason: '人物模板' },
    ]);
    expect(result.finalGenerationGreenlights).toEqual([
      { bookName: '剧情书', uid: 12, reason: '最终生成' },
    ]);
  });
});
