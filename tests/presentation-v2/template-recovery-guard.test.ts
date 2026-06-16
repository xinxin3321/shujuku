/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

async function importGuard() {
  vi.resetModules();
  const validateCurrentChatTableRecoveryWithGuide_ACU = vi.fn(async () => ({ success: true }));
  const deleteLocalDataInChatCore_ACU = vi.fn(async () => 1);

  vi.doMock('../../src/service/table/storage-frame-v2-replay', () => ({
    validateCurrentChatTableRecoveryWithGuide_ACU,
  }));
  vi.doMock('../../src/service/chat/chat-service', () => ({
    deleteLocalDataInChatCore_ACU,
  }));

  setActivePinia(createPinia());
  const [{ ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU }, { useDialogStore }] = await Promise.all([
    import('../../src/presentation-v2/composables/useTemplateRecoveryGuard'),
    import('../../src/presentation-v2/stores/dialog-store'),
  ]);
  return {
    ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU,
    useDialogStore,
    validateCurrentChatTableRecoveryWithGuide_ACU,
    deleteLocalDataInChatCore_ACU,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useTemplateRecoveryGuard', () => {
  it('恢复验证通过时不弹窗、不删除数据', async () => {
    const { ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU, useDialogStore, deleteLocalDataInChatCore_ACU } = await importGuard();

    const result = await ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU({ sheet_1: {} }, 'save-template');

    expect(result).toEqual({ success: true, dataWasReset: false });
    expect(useDialogStore().active).toBeNull();
    expect(deleteLocalDataInChatCore_ACU).not.toHaveBeenCalled();
  });

  it('恢复验证失败时用强风险文案确认，确认后删除当前标识数据', async () => {
    const {
      ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU,
      useDialogStore,
      validateCurrentChatTableRecoveryWithGuide_ACU,
      deleteLocalDataInChatCore_ACU,
    } = await importGuard();
    validateCurrentChatTableRecoveryWithGuide_ACU.mockResolvedValueOnce({ success: false, error: 'CHECK constraint failed' });

    const pending = ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU({ sheet_1: {} }, 'save-template');
    await Promise.resolve();
    const dialog = useDialogStore();

    expect(dialog.active?.title).toBe('高风险：旧表数据无法按新模板恢复');
    expect(dialog.active?.message).toContain('高风险：本次模板变更会导致当前标识的旧表格数据无法按新模板恢复');
    expect(dialog.active?.message).toContain('删除后当前标识下已有表格数据会被清空，后续必须重新填表');
    expect(dialog.active?.dangerMessage).toContain('此操作不可恢复');
    expect(dialog.active?.confirmLabel).toBe('删除数据并保存模板');

    dialog.submitActive();
    await expect(pending).resolves.toEqual({ success: true, dataWasReset: true });
    expect(deleteLocalDataInChatCore_ACU).toHaveBeenCalledWith('current');
  });

  it('恢复验证失败且用户取消时不删除、不继续', async () => {
    const {
      ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU,
      useDialogStore,
      validateCurrentChatTableRecoveryWithGuide_ACU,
      deleteLocalDataInChatCore_ACU,
    } = await importGuard();
    validateCurrentChatTableRecoveryWithGuide_ACU.mockResolvedValueOnce({ success: false, error: 'CHECK constraint failed' });

    const pending = ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU({ sheet_1: {} }, 'switch-template');
    await Promise.resolve();
    const dialog = useDialogStore();
    expect(dialog.active?.confirmLabel).toBe('删除数据并切换模板');

    dialog.cancelActive();
    await expect(pending).resolves.toEqual({ success: false, dataWasReset: false });
    expect(deleteLocalDataInChatCore_ACU).not.toHaveBeenCalled();
  });
});
