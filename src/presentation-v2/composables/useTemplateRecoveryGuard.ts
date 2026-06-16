import { deleteLocalDataInChatCore_ACU } from '../../service/chat/chat-service';
import { validateCurrentChatTableRecoveryWithGuide_ACU } from '../../service/table/storage-frame-v2-replay';
import { useDialogStore } from '../stores/dialog-store';
import { useToastStore } from '../stores/toast-store';

export type TemplateRecoveryGuardAction_ACU = 'save-template' | 'switch-template';

export interface TemplateRecoveryGuardResult_ACU {
  success: boolean;
  dataWasReset: boolean;
}

function buildTemplateRecoveryConfirmMessage_ACU(action: TemplateRecoveryGuardAction_ACU, error?: string): string {
  const actionText = action === 'save-template' ? '保存这次聊天模板修改' : '切换并保存当前聊天模板';
  const confirmText = action === 'save-template' ? '继续保存模板' : '继续切换模板';
  const detail = error ? `\n\n底层恢复错误：${error}` : '';
  return `高风险：本次模板变更会导致当前标识的旧表格数据无法按新模板恢复。\n\n系统已尝试用新模板回放当前聊天里的本地表格数据，但验证失败。继续操作会立即删除“当前标识本地数据”（不可恢复），然后${actionText}。\n\n删除后当前标识下已有表格数据会被清空，后续必须重新填表。\n\n如果你还需要旧数据，请先取消并备份/导出聊天。\n\n确认要删除当前标识本地数据并${confirmText}吗？${detail}`;
}

export async function ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU(
  guideData: Record<string, any> | null,
  action: TemplateRecoveryGuardAction_ACU,
): Promise<TemplateRecoveryGuardResult_ACU> {
  const validation = await validateCurrentChatTableRecoveryWithGuide_ACU(guideData);
  if (validation.success) return { success: true, dataWasReset: false };

  const dialogStore = useDialogStore();
  const toast = useToastStore();
  const confirmed = await dialogStore.confirm({
    title: '高风险：旧表数据无法按新模板恢复',
    message: buildTemplateRecoveryConfirmMessage_ACU(action, 'error' in validation ? validation.error : undefined),
    dangerMessage: '确认后会删除当前标识本地数据，此操作不可恢复。',
    confirmLabel: action === 'save-template' ? '删除数据并保存模板' : '删除数据并切换模板',
    cancelLabel: '取消，保留旧数据',
    confirmVariant: 'danger',
  });
  if (!confirmed) return { success: false, dataWasReset: false };

  const deletedCount = await deleteLocalDataInChatCore_ACU('current');
  if (deletedCount <= 0) {
    toast.error('未删除任何当前标识本地数据，模板操作已取消。', { muteable: false });
    return { success: false, dataWasReset: false };
  }

  toast.warning('已删除当前标识本地数据；模板操作将继续，后续必须重新填表。', { muteable: false });
  return { success: true, dataWasReset: true };
}
