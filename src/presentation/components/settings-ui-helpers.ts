/**
 * presentation/components/settings-ui-helpers.ts
 * 从 settings-service.ts 搬出的 UI 相关便捷函数
 */
import { loadSettings_ACU, saveSettings_ACU } from '../../service/settings/settings-service';
import { syncAllSettingsToUI_ACU } from './status-display';
import { settings_ACU } from '../../service/runtime/state-manager';
import { showToastr_ACU } from '../theme/toast';

/**
 * 加载设置后刷新 UI（presentation 层便捷函数）
 */
export function loadSettingsAndRefreshUI_ACU() {
    loadSettings_ACU();
    if (typeof syncAllSettingsToUI_ACU === 'function') syncAllSettingsToUI_ACU(settings_ACU);
}

/**
 * 保存设置并根据返回值弹 toast 通知（presentation 层便捷函数）
 * service 层 saveSettings_ACU 只返回结果，UI 通知由此函数处理。
 */
export function saveSettingsAndNotify_ACU() {
    const result = saveSettings_ACU();
    if (result.error) {
        showToastr_ACU('error', result.error);
    } else if (result.warning) {
        const toastType = result.storageType === 'memory' ? 'warning' : 'info';
        const timeOut = result.storageType === 'memory' ? 8000 : 6000;
        showToastr_ACU(toastType, result.warning, { timeOut });
    }
    return result;
}
