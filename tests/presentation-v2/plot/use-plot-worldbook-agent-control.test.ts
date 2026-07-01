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
const mockWriteControl = vi.fn();
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
        maxSkillifyConcurrency: 3,
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
  const worldbookControl = {
    ...settings.plotSettings.agentWorldbookControl,
    contextSettings: { ...settings.plotSettings.agentWorldbookControl.contextSettings },
  };

  mockWriteControl.mockImplementation(async (patch: any) => {
    Object.assign(worldbookControl, patch || {});
    return { updated: true, control: worldbookControl };
  });

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
      control: worldbookControl,
    })),
    writeAgentWorldbookControlToWorldbook_ACU: mockWriteControl,
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
  return Object.assign(mod.usePlotWorldbookAgentControl(), { __settings: settings });
}

describe('usePlotWorldbookAgentControl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSaveSettings.mockClear();
    mockRefreshSnapshot.mockClear();
    mockWriteControl.mockReset();
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

  it('skillifyAll 调用时传入当前 Skill 化并发数', async () => {
    mockSkillify.mockImplementation(async (options: any) => {
      options.onProgress?.({ phase: 'collecting' });
      options.onProgress?.({ phase: 'complete', current: 1, total: 1, updated: 1, skipped: 0, failed: 0 });
      return { totalCandidates: 1, updated: 1, skipped: 0, failed: 0 };
    });
    const c = await getComposable();

    const result = await c.skillifyAll();

    expect(result).toBe(true);
    expect(mockSkillify).toHaveBeenCalledWith(expect.objectContaining({
      maxConcurrency: 3,
      maxAiRetries: 2,
      overwriteManual: false,
    }));
  });

  it('setMaxSkillifyConcurrency 保存夹紧后的并发数', async () => {
    const c = await getComposable();

    await expect(c.setMaxSkillifyConcurrency(9)).resolves.toBe(true);

    expect(mockWriteControl).toHaveBeenCalledWith({ maxSkillifyConcurrency: 5 });
    expect(c.maxSkillifyConcurrency.value).toBe(5);

    mockWriteControl.mockClear();
    await expect(c.setMaxSkillifyConcurrency('not-a-number')).resolves.toBe(false);
    expect(mockWriteControl).not.toHaveBeenCalled();
  });

  it('skillifyAll 成功后不再自动触发物理接管', async () => {
    mockSkillify.mockImplementation(async (options: any) => {
      options.onProgress?.({ phase: 'collecting' });
      options.onProgress?.({ phase: 'complete', current: 1, total: 1, updated: 1, skipped: 0, failed: 0 });
      return { totalCandidates: 1, updated: 1, skipped: 0, failed: 0 };
    });
    const c = await getComposable();

    const result = await c.skillifyAll();

    expect(result).toBe(true);
    expect(mockTakeover).not.toHaveBeenCalled();
  });

  it('setMode agent 保存成功后触发物理接管并刷新 active snapshot', async () => {
    mockTakeover.mockResolvedValueOnce({ updated: true, reason: 'native_worldbook_trigger_disabled', failed: 0 });
    const activeSnapshot = { active: true, selectionSignature: 'sig', createdAt: 1, books: { '角色A世界书': [{ uid: 1 }] } };
    mockRefreshSnapshot
      .mockResolvedValue(activeSnapshot)
      .mockResolvedValueOnce({ active: false, selectionSignature: '', createdAt: 0, books: {} })
      .mockResolvedValueOnce(activeSnapshot);
    const c = await getComposable();

    await c.setMode('agent');

    expect(mockWriteControl).toHaveBeenCalledWith({ mode: 'agent', enabled: true });
    expect(mockTakeover).toHaveBeenCalledTimes(1);
    expect(mockRefreshSnapshot).toHaveBeenCalled();
    expect(c.snapshot.value.active).toBe(true);
    expect(toast.info).toHaveBeenCalledWith('Agent 世界书已切换为接管模式。', { muteable: false });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('setMode agent 接管失败时提示 warning，不把失败伪装成成功', async () => {
    mockTakeover.mockResolvedValueOnce({ updated: true, reason: 'snapshot_state_write_failed', failed: 1 });
    mockRefreshSnapshot.mockResolvedValue({ active: false, selectionSignature: 'sig', createdAt: 0, books: {} });
    const c = await getComposable();

    await c.setMode('agent');

    expect(mockWriteControl).toHaveBeenCalledWith({ mode: 'agent', enabled: true });
    expect(mockTakeover).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('snapshot_state_write_failed'), { muteable: false });
    expect(toast.info).not.toHaveBeenCalledWith('Agent 世界书已切换为接管模式。', { muteable: false });
  });

  it('setMode disabled 只关闭模式，不执行清理并初始化', async () => {
    const c = await getComposable();
    const settings = (c as any).__settings;

    await c.setMode('disabled');

    expect(mockWriteControl).toHaveBeenCalledWith({ mode: 'disabled', enabled: false });
    expect(mockRestore).not.toHaveBeenCalled();
    expect(settings.plotSettings.agentWorldbookControl.mode).toBe('disabled');
    expect(settings.plotSettings.agentWorldbookControl.enabled).toBe(false);
    expect(settings.plotSettings.agentWorldbookControlSnapshot).toBeDefined();
    expect(mockSaveSettings).toHaveBeenCalledTimes(1);
  });

  it('restore 取消确认时不清理也不关闭 Agent 模式', async () => {
    dialog.confirm.mockResolvedValue(false);
    const c = await getComposable();
    const settings = (c as any).__settings;

    await expect(c.restore()).resolves.toBe(false);

    expect(mockRestore).not.toHaveBeenCalled();
    expect(mockWriteControl).not.toHaveBeenCalled();
    expect(settings.plotSettings.agentWorldbookControl.mode).toBe('agent');
    expect(settings.plotSettings.agentWorldbookControlSnapshot).toBeDefined();
  });

  it('restore 清理并初始化后关闭 state control 与 legacy settings', async () => {
    const c = await getComposable();
    const settings = (c as any).__settings;
    mockRestore.mockImplementation(async () => {
      expect(settings.plotSettings.agentWorldbookControlSnapshot).toBeDefined();
      return { updated: true, reason: 'native_worldbook_trigger_restored', skipped: 0, failed: 0 };
    });

    await expect(c.restore()).resolves.toBe(true);

    expect(mockWriteControl).toHaveBeenCalledWith({ mode: 'disabled', enabled: false });
    expect(mockRestore).toHaveBeenCalledWith({ cleanupStateEntry: true });
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(settings.plotSettings.agentWorldbookControl.mode).toBe('disabled');
    expect(settings.plotSettings.agentWorldbookControl.enabled).toBe(false);
    expect(settings.plotSettings.agentWorldbookControlSnapshot).toBeUndefined();
    expect(mockSaveSettings).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('已清理并初始化 Agent 世界书状态；Agent 模式已关闭，下次使用时会重新初始化。', { muteable: false });
  });

  it('restore 恢复失败时保留 legacy snapshot，避免丢失恢复依据', async () => {
    const c = await getComposable();
    const settings = (c as any).__settings;
    mockRestore.mockImplementation(async () => {
      expect(settings.plotSettings.agentWorldbookControlSnapshot).toBeDefined();
      return { updated: true, reason: 'native_worldbook_trigger_restore_failed', skipped: 0, failed: 1 };
    });

    await expect(c.restore()).resolves.toBe(false);

    expect(mockWriteControl).toHaveBeenCalledWith({ mode: 'disabled', enabled: false });
    expect(mockRestore).toHaveBeenCalledWith({ cleanupStateEntry: true });
    expect(settings.plotSettings.agentWorldbookControl.mode).toBe('disabled');
    expect(settings.plotSettings.agentWorldbookControl.enabled).toBe(false);
    expect(settings.plotSettings.agentWorldbookControlSnapshot).toBeDefined();
    expect(mockSaveSettings).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith('部分世界书条目恢复失败，已保留 Agent 快照以避免永久丢失；Agent 模式已关闭。', { muteable: false });
    expect(toast.success).not.toHaveBeenCalled();
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
