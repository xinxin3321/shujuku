import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockCallAIWithPreset,
  mockGetLorebookEntries,
  mockRefreshPlotAgentWorldbookSnapshot,
} = vi.hoisted(() => ({
  mockCallAIWithPreset: vi.fn(),
  mockGetLorebookEntries: vi.fn(),
  mockRefreshPlotAgentWorldbookSnapshot: vi.fn(),
}));

vi.mock('../../../src/service/ai/api-call', () => ({
  callAIWithPreset_ACU: mockCallAIWithPreset,
}));

vi.mock('../../../src/data/gateways/worldbook-gateway', () => ({
  getLorebookEntries_ACU: mockGetLorebookEntries,
}));

vi.mock('../../../src/service/agent/agent-worldbook-takeover', () => ({
  refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU: mockRefreshPlotAgentWorldbookSnapshot,
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
    mockRefreshPlotAgentWorldbookSnapshot.mockResolvedValue({
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
    expect(mockRefreshPlotAgentWorldbookSnapshot).toHaveBeenCalledTimes(1);
    expect(result.taskPlan).toHaveLength(1);
    expect(result.effectiveTasks[0].id).toBe('task_id');
    expect(result.plotGreenlights.task_id).toEqual([
      { bookName: '剧情书', uid: 12, reason: '人物模板' },
    ]);
    expect(result.finalGenerationGreenlights).toEqual([
      { bookName: '剧情书', uid: 12, reason: '最终生成' },
    ]);
  });

  it('renders editable decision prompt placeholders with clamped context limits and selectable task filtering', async () => {
    const longPreviousPlot = '上'.repeat(250);
    const longRecentContext = '近'.repeat(250);
    const longWorldbookContent = '书'.repeat(250);
    mockGetLorebookEntries.mockResolvedValueOnce([
      { uid: 12, comment: '陈默人物档案', keys: ['陈默'], content: longWorldbookContent, enabled: true },
    ]);
    mockCallAIWithPreset.mockResolvedValue(JSON.stringify({
      taskPlan: [{ taskId: 'selectable_task', run: true, effectiveStage: 1, effectiveOrder: 0 }],
      plotGreenlights: {},
      tableFillGreenlights: [],
      finalGenerationGreenlights: [],
      fallbackMode: false,
      reason: 'ok',
    }));

    const result = await runAgentDecisionForPlot_ACU({
      plotSettings: {
        agentWorldbookControl: {
          enabled: true,
          mode: 'agent',
          contextSettings: {
            decisionPreviousPlotCharLimit: 1,
            decisionRecentContextCharLimit: 1,
          },
          agentDecisionPromptSegments: [
            { role: 'user', deletable: true, content: 'P={{agent.previousPlot}}\nR={{agent.recentContext}}\nT={{agent.tasksJson}}\nW={{agent.worldbookEntriesJson}}' },
          ],
        },
      },
      userMessage: '敲门',
      sharedContext: { lastPlotContent: longPreviousPlot, seedContentForConditional: longRecentContext },
      enabledTasks: [
        { id: 'selectable task', name: '可选任务', enabled: true, promptGroup: { messages: [] } },
        { id: 'blocked task', name: '不可选任务', enabled: true, agentControl: { selectable: false }, promptGroup: { messages: [] } },
      ],
    });

    expect(result.active).toBe(true);
    expect(result.effectiveTasks).toHaveLength(1);
    expect(result.effectiveTasks[0].id).toBe('selectable_task');
    const messages = mockCallAIWithPreset.mock.calls[0][0];
    expect(messages[0].content).toContain(`${'上'.repeat(200)}\n...[已截断 50 字]`);
    expect(messages[0].content).toContain(`${'近'.repeat(200)}\n...[已截断 50 字]`);
    expect(messages[0].content).not.toContain('"contentPreview"');
    expect(messages[0].content).not.toContain(longWorldbookContent);
    expect(messages[0].content).not.toContain('书'.repeat(20));
    expect(messages[0].content).toContain('selectable_task');
    expect(messages[0].content).not.toContain('blocked_task');
  });

  it('does not execute taskPlan items for tasks marked as not selectable', async () => {
    mockCallAIWithPreset.mockResolvedValue(JSON.stringify({
      taskPlan: [{ taskId: 'blocked_task', run: true, effectiveStage: 1, effectiveOrder: 0 }],
      plotGreenlights: { blocked_task: [{ bookName: '剧情书', uid: 12, reason: '不应生效' }] },
      tableFillGreenlights: [],
      finalGenerationGreenlights: [],
      fallbackMode: false,
      reason: 'ok',
    }));

    const result = await runAgentDecisionForPlot_ACU({
      plotSettings: { agentWorldbookControl: { enabled: true, mode: 'agent' } },
      userMessage: '敲门',
      sharedContext: {},
      enabledTasks: [{ id: 'blocked task', name: '不可选任务', enabled: true, agentControl: { selectable: false }, promptGroup: { messages: [] } }],
    });

    expect(result.active).toBe(true);
    expect(result.taskPlan).toEqual([{ taskId: 'blocked_task', run: false, effectiveStage: 1, effectiveOrder: 0, mode: '', reason: 'task_not_selectable' }]);
    expect(result.effectiveTasks).toEqual([]);
    expect(result.plotGreenlights).toEqual({});
  });
});
