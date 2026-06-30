/**
 * usePlotWorldbookAgentControl 单元测试
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = {
  success: vi.fn(),
  info: vi.fn(() => 'progress-1'),
  warning: vi.fn(),
  error: vi.fn(),
  update: vi.fn(() => true),
};
const dialog = {
  confirm: vi.fn(async () => true),
};
const mockSaveSettings = vi.fn();
const mockRefreshSnapshot = vi.fn(async () => ({ active: false, selectionSignature: '', createdAt: 0, books: {} }));
const mockTakeover = vi.fn(async () => ({ updated: false, reason: 'noop' }));
const mockRestore = vi.fn(async () => ({ updated: false, reason: 'noop' }));
const mockClearSkillMeta = vi.fn(async () => ({ total: 2, cleared: 2, skipped: 0, failed: 0, errors: [] }));
const mockResolveAvailability = vi.fn(async () => ({
  configuredMode: 'agent',
  control: createSettings().plotSettings.agentWorldbookControl,
  configSource: 'worldbook',
  available: true,
  skillCount: 2,
  bookNames: ['角色A世界书'],
  configBookName: '角色A世界书',
  writableBookName: '角色A世界书',
  reason: 'available',
  skillMetas: [],
}));
const mockSkillify = vi.fn(async (options: any) => {
  options.onProgress?.({ phase: 'collecting' });
  throw new Error('boom');
});

function createSettings() {
  return {
    apiPresets: [],
    plotSettings: {
      agentWorldbookControlSnapshot: { active: false, selectionSignature: '', createdAt: 0, books: {} },
      agentWorldbookControl: {
        enabled: true,
        mode: 'agent',
        agentPlotExecutionMode: 'sequential',
        agentApiPreset: '',
        agentSkillApiPreset: '',
        contextSettings: { agentAiMaxRetries: 2 },
        agentDecisionPromptSegments: [],
        agentSkillifyPromptSegments: [],
      },
    },
  } as any;
}

async function getComposable() {
  vi.resetModules();
  const settings = createSettings();

  vi.doMock('../../../src/service/runtime/state-manager', () => ({
    settings_ACU: settings,
    _set_pendingFinalGenerationGreenlights_ACU: vi.fn(),
  }));
  vi.doMock('../../../src/service/settings/settings-service', () => ({
    saveSettings_ACU: mockSaveSettings,
  }));
  vi.doMock('../../../src/service/agent/agent-worldbook-takeover', () => ({
    getPlotAgentWorldbookSnapshot_ACU: () => settings.plotSettings.agentWorldbookControlSnapshot,
    refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU: mockRefreshSnapshot,
    restoreWorldbookGreenlights_ACU: mockRestore,
    takeoverWorldbookGreenlights_ACU: mockTakeover,
  }));
  vi.doMock('../../../src/service/agent/agent-skillify-service', () => ({
    skillifyCurrentPlotWorldbookSelection_ACU: mockSkillify,
  }));
  vi.doMock('../../../src/service/agent/agent-worldbook-skill-meta', () => ({
    clearWorldbookSkillMetaBlocks_ACU: mockClearSkillMeta,
    resolveAgentWorldbookFilterAvailability_ACU: mockResolveAvailability,
  }));
  vi.doMock('../../../src/service/agent/agent-worldbook-config-meta', () => ({
    readAgentWorldbookControlFromWorldbooks_ACU: vi.fn(async () => ({
      source: 'worldbook',
      bookName: '角色A世界书',
      writableBookName: '角色A世界书',
      reason: '',
      control: settings.plotSettings.agentWorldbookControl,
    })),
    writeAgentWorldbookControlToWorldbook_ACU: vi.fn(async (patch: any) => {
      Object.assign(settings.plotSettings.agentWorldbookControl, patch || {});
      return { updated: true, control: settings.plotSettings.agentWorldbookControl };
    }),
  }));
  vi.doMock('../../../src/service/agent/agent-prompt-template', () => ({
    clonePromptSegments_ACU: (segments: any[]) => [...segments],
    getDefaultAgentDecisionPromptSegments_ACU: () => [],
    getDefaultAgentSkillifyPromptSegments_ACU: () => [],
    normalizeAgentContextSettings_ACU: (value: any) => ({ agentAiMaxRetries: 2, ...(value || {}) }),
    normalizeEditablePromptSegments_ACU: (segments: any[] | undefined, fallback: any[]) => segments || fallback,
  }));
  vi.doMock('../../../src/presentation-v2/stores/dialog-store', () => ({
    useDialogStore: () => dialog,
  }));
  vi.doMock('../../../src/presentation-v2/stores/toast-store', () => ({
    useToastStore: () => toast,
  }));

  const mod = await import('../../../src/presentation-v2/composables/usePlotWorldbookAgentControl');
  return mod.usePlotWorldbookAgentControl();
}

describe('usePlotWorldbookAgentControl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSaveSettings.mockClear();
    mockRefreshSnapshot.mockClear();
    mockSkillify.mockClear();
    mockTakeover.mockClear();
    mockRestore.mockClear();
    mockClearSkillMeta.mockClear();
    mockResolveAvailability.mockClear();
    dialog.confirm.mockClear();
    toast.success.mockClear();
    toast.info.mockClear();
    toast.warning.mockClear();
    toast.error.mockClear();
    toast.update.mockClear();
    toast.info.mockReturnValue('progress-1');
    toast.update.mockReturnValue(true);
    dialog.confirm.mockResolvedValue(true);
    mockRefreshSnapshot.mockResolvedValue({ active: false, selectionSignature: '', createdAt: 0, books: {} });
    mockSkillify.mockImplementation(async (options: any) => {
      options.onProgress?.({ phase: 'collecting' });
      throw new Error('boom');
    });
    mockTakeover.mockResolvedValue({ updated: false, reason: 'noop' });
    mockRestore.mockResolvedValue({ updated: false, reason: 'noop' });
    mockClearSkillMeta.mockResolvedValue({ total: 2, cleared: 2, skipped: 0, failed: 0, errors: [] });
    mockResolveAvailability.mockResolvedValue({
      configuredMode: 'agent',
      control: createSettings().plotSettings.agentWorldbookControl,
      configSource: 'worldbook',
      available: true,
      skillCount: 2,
      bookNames: ['角色A世界书'],
      configBookName: '角色A世界书',
      writableBookName: '角色A世界书',
      reason: 'available',
      skillMetas: [],
    });
  });

  it('skillifyAll 异常时把已有 progress toast 更新为 error 而不是新建 error toast', async () => {
    const c = await getComposable();

    const result = await c.skillifyAll();

    expect(result).toBe(false);
    expect(toast.info).toHaveBeenCalledWith('正在扫描当前世界书范围内可 Skill 化的条目...', {
      durationMs: 0,
      muteable: false,
      dismissible: false,
    });
    expect(toast.update).toHaveBeenCalledWith(
      'progress-1',
      'error',
      expect.stringContaining('boom'),
      { muteable: false },
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('skillifyAll 异常且 progress toast 更新失败时新建 error toast 兜底', async () => {
    toast.update.mockReturnValue(false);
    const c = await getComposable();

    const result = await c.skillifyAll();

    expect(result).toBe(false);
    expect(toast.update).toHaveBeenCalledWith(
      'progress-1',
      'error',
      expect.stringContaining('boom'),
      { muteable: false },
    );
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('boom'),
      { muteable: false },
    );
  });

  it('clearSkillMeta 取消确认时不清除也不触发接管', async () => {
    dialog.confirm.mockResolvedValue(false);
    const c = await getComposable();

    const result = await c.clearSkillMeta();

    expect(result).toBe(false);
    expect(mockClearSkillMeta).not.toHaveBeenCalled();
    expect(mockTakeover).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('clearSkillMeta 清除当前 Agent 世界书范围并且不触发接管或恢复', async () => {
    const c = await getComposable();

    const result = await c.clearSkillMeta();

    expect(result).toBe(true);
    expect(mockResolveAvailability).toHaveBeenCalledTimes(2);
    expect(mockClearSkillMeta).toHaveBeenCalledWith(['角色A世界书']);
    expect(mockTakeover).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('已清除 2 条世界书 Skill 元数据。', { muteable: false });
  });

  it('clearSkillMeta 无可清除条目时返回 false 并提示 noop', async () => {
    mockClearSkillMeta.mockResolvedValue({ total: 0, cleared: 0, skipped: 0, failed: 0, errors: [] });
    const c = await getComposable();

    await expect(c.clearSkillMeta()).resolves.toBe(false);
    expect(toast.info).toHaveBeenCalledWith('当前 Agent 世界书范围内没有可清除的 Skill 元数据。', { muteable: false });
  });
});
