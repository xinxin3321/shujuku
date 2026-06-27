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

  it('renders decision context by AI layers with paired user turns and selectable task filtering', async () => {
    const longWorldbookContent = '书'.repeat(250);
    const skillMetaBlock = '<!-- ACU_SKILL_META_START\n{"version":1,"description":"陈默人物 Skill 描述","triggerWhen":"陈默触发条件","updatedAt":1,"updatedBy":"agent-skillify"}\nACU_SKILL_META_END -->';
    mockGetLorebookEntries.mockResolvedValueOnce([
      { uid: 12, comment: `陈默人物档案\n\n${skillMetaBlock}`, keys: ['陈默'], content: longWorldbookContent, enabled: true },
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
            decisionRecentContextCharLimit: 1,
          },
          agentDecisionPromptSegments: [
            { role: 'user', deletable: true, content: 'P={{agent.previousPlot}}\nR={{agent.recentContext}}\nT={{agent.tasksJson}}\nW={{agent.worldbookEntriesJson}}' },
          ],
        },
      },
      userMessage: '敲门',
      sharedContext: {
        lastPlotContent: '旧剧情兜底不应使用',
        seedContentForConditional: '旧最近上下文兜底不应使用',
        recentContextMessages: [
          { is_user: true, name: '用户', mes: '第一层用户输入', qrf_plot: '第一层剧情规划' },
          { is_user: false, name: '角色', mes: '第一层AI回复' },
          { is_user: true, name: '用户', mes: '第二层用户输入', qrf_plot: '第二层剧情规划' },
          { is_user: false, name: '角色', mes: '第二层AI回复' },
        ],
      },
      enabledTasks: [
        { id: 'selectable task', name: '可选任务', enabled: true, promptGroup: { messages: [] } },
        { id: 'blocked task', name: '不可选任务', enabled: true, agentControl: { selectable: false }, promptGroup: { messages: [] } },
      ],
    });

    expect(result.active).toBe(true);
    expect(result.effectiveTasks).toHaveLength(1);
    expect(result.effectiveTasks[0].id).toBe('selectable_task');
    const messages = mockCallAIWithPreset.mock.calls[0][0];
    expect(messages[0].content).toContain('P=【最近上下文 AI层 1】');
    expect(messages[0].content).toContain('用户: 第二层用户输入');
    expect(messages[0].content).toContain('剧情推进记录: 第二层剧情规划');
    expect(messages[0].content).toContain('R=【最近上下文 AI层 1】');
    expect(messages[0].content).toContain('角色: 第二层AI回复');
    expect(messages[0].content).not.toContain('第一层用户输入');
    expect(messages[0].content).not.toContain('第一层AI回复');
    expect(messages[0].content).not.toContain('已截断');
    expect(messages[0].content).not.toContain('旧最近上下文兜底不应使用');
    expect(messages[0].content).toContain('"bookName": "剧情书"');
    expect(messages[0].content).toContain('"uid": 12');
    expect(messages[0].content).toContain('"description": "陈默人物 Skill 描述"');
    expect(messages[0].content).toContain('"triggerWhen": "陈默触发条件"');
    expect(messages[0].content).not.toContain('陈默人物档案');
    expect(messages[0].content).not.toContain('ACU_SKILL_META_START');
    expect(messages[0].content).not.toContain('"keys"');
    expect(messages[0].content).not.toContain('"contentPreview"');
    expect(messages[0].content).not.toContain(longWorldbookContent);
    expect(messages[0].content).toContain('selectable_task');
    expect(messages[0].content).not.toContain('blocked_task');
  });

  it('uses user-layer plot records from recent context instead of independent plot context messages', async () => {
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
            decisionRecentContextCharLimit: 1,
          },
          agentDecisionPromptSegments: [
            { role: 'user', deletable: true, content: 'P={{agent.previousPlot}}\nR={{agent.recentContext}}' },
          ],
        },
      },
      userMessage: '继续',
      sharedContext: {
        recentContextMessages: [
          { is_user: true, name: '用户', mes: '第一层用户输入', qrf_plot: '第一层剧情规划' },
          { is_user: false, name: '角色', mes: '第一层AI回复' },
          { is_user: true, name: '用户', mes: '第二层用户输入', qrf_plot_tasks: { main: '第二层任务剧情规划' } },
          { is_user: false, name: '角色', mes: '第二层AI回复' },
        ],
      },
      enabledTasks: [{ id: 'selectable task', name: '可选任务', enabled: true, promptGroup: { messages: [] } }],
    });

    expect(result.active).toBe(true);
    const messages = mockCallAIWithPreset.mock.calls[0][0];
    expect(messages[0].content).toContain('P=【最近上下文 AI层 1】');
    expect(messages[0].content).toContain('用户: 第二层用户输入');
    expect(messages[0].content).toContain('剧情推进记录: 【main】\n第二层任务剧情规划');
    expect(messages[0].content).toContain('R=【最近上下文 AI层 1】');
    expect(messages[0].content).not.toContain('第一层剧情规划');
    expect(messages[0].content).not.toContain('第一层用户输入');
  });

  it('uses two recent AI layers by default when context limit is not configured', async () => {
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
          agentDecisionPromptSegments: [
            { role: 'user', deletable: true, content: 'R={{agent.recentContext}}' },
          ],
        },
      },
      userMessage: '继续',
      sharedContext: {
        recentContextMessages: [
          { is_user: true, name: '用户', mes: '第一层用户输入' },
          { is_user: false, name: '角色', mes: '第一层AI回复' },
          { is_user: true, name: '用户', mes: '第二层用户输入' },
          { is_user: false, name: '角色', mes: '第二层AI回复' },
          { is_user: true, name: '用户', mes: '第三层用户输入' },
          { is_user: false, name: '角色', mes: '第三层AI回复' },
        ],
      },
      enabledTasks: [{ id: 'selectable task', name: '可选任务', enabled: true, promptGroup: { messages: [] } }],
    });

    expect(result.active).toBe(true);
    const messages = mockCallAIWithPreset.mock.calls[0][0];
    expect(messages[0].content).toContain('【最近上下文 AI层 1】');
    expect(messages[0].content).not.toContain('第二层用户输入');
    expect(messages[0].content).toContain('第二层AI回复');
    expect(messages[0].content).toContain('【最近上下文 AI层 2】');
    expect(messages[0].content).toContain('第三层用户输入');
    expect(messages[0].content).toContain('第三层AI回复');
    expect(messages[0].content).not.toContain('第一层用户输入');
    expect(messages[0].content).not.toContain('第一层AI回复');
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
