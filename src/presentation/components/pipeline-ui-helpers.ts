/**
 * presentation/components/pipeline-ui-helpers.ts
 * 包装 service 层的 pipeline 函数，在调用后自动刷新 UI
 */
import { refreshMergedDataAndNotify_ACU } from '../../service/worldbook/pipeline';
import { $manualTableSelector_ACU, $importTableSelector_ACU } from '../state/ui-refs';
import { renderManualTableSelector_ACU, renderImportTableSelector_ACU } from './table-selector';
import { updateCardUpdateStatusDisplay_ACU } from './update-status-display';
import { topLevelWindow_ACU } from '../../shared/env';
import { logDebug_ACU } from '../../shared/utils';

/**
 * 刷新合并数据后自动通知前端 + 刷新可视化编辑器 + 刷新 UI 选择器和状态面板
 * presentation 层唯一入口：所有需要"刷新数据+刷新UI"的地方都调这个。
 */
export async function refreshMergedDataAndNotifyWithUI_ACU() {
    const result = await refreshMergedDataAndNotify_ACU();

    // 1. 通知前端 (iframe context)
    try {
        if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI) {
            (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
            logDebug_ACU('Notified frontend to refresh UI after data merge.');
        }
    } catch (_) {}

    // 2. 刷新可视化编辑器
    setTimeout(() => {
        try {
            if (typeof (window as any).ACU_Visualizer_Refresh === 'function') {
                (window as any).ACU_Visualizer_Refresh();
                logDebug_ACU('Triggered global visualizer refresh.');
            }
        } catch (_) {}
    }, 200);

    // 3. UI 选择器刷新
    if ($manualTableSelector_ACU) {
        try { renderManualTableSelector_ACU(); } catch (_) {}
    }
    if ($importTableSelector_ACU) {
        try { renderImportTableSelector_ACU(); } catch (_) {}
    }
    if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
        updateCardUpdateStatusDisplay_ACU();
    }

    // 4. 等待前端完成数据读取（保持原有 800ms 等待行为）
    await new Promise(resolve => setTimeout(resolve, 800));

    return result;
}
