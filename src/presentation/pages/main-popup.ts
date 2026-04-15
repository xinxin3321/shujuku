// main-popup.ts
// 从 05_main_popup.js 整体迁入

import { showToastr_ACU } from '../theme/toast';
import { coreApisAreReady_ACU, currentChatFileIdentifier_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU, _set_$popupInstance_ACU } from '../state/ui-refs';
import { loadSettingsAndRefreshUI_ACU } from '../components/settings-ui-helpers';
import { POPUP_ID_ACU, SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { bindPopupEvents_ACU } from './popup-bindings';
import { loadPlotSettingsToUI_ACU } from './popup-helpers';
import { createACUWindow } from '../window/window-system';

// 标签页 HTML 生成模块
import { generateStatusTabHTML } from './main-popup-status';
import { generatePromptTabHTML } from './main-popup-prompt';
import { generateApiTabHTML } from './main-popup-api';
import { generateWorldbookTabHTML } from './main-popup-worldbook';
import { generateDataTabHTML } from './main-popup-data';
import { generateImportTabHTML } from './main-popup-import';
import { generatePlotTabHTML } from './main-popup-plot';
import { generateOptimizationTabHTML } from './main-popup-optimization';

import { MAIN_POPUP_CSS_ACU } from './main-popup-styles';

  export async function openAutoCardPopup_ACU() {
    if (!coreApisAreReady_ACU) {
      showToastr_ACU('error', '核心API未就绪。');
      return;
    }
    showToastr_ACU('info', '正在准备数据库更新工具...', { timeOut: 1000 });
    // The state is managed by background event listeners. The popup should only display the current state.
    // Calling reset here could cause race conditions or incorrect state wipes.
    loadSettingsAndRefreshUI_ACU(); // Load latest settings into UI

    const popupHtml = `
            <div id="${POPUP_ID_ACU}" class="auto-card-updater-popup">
                <style>${MAIN_POPUP_CSS_ACU}</style>

                <div class="acu-header">
                    <div>
                        <h2 id="updater-main-title-acu">当前聊天：${escapeHtml_ACU(
                          currentChatFileIdentifier_ACU || '未知',
                        )}</h2>
                    </div>
                </div>

                <div class="acu-layout">
                    <!-- 导航（分组分页） -->
                    <div class="acu-tabs-nav" aria-label="数据库工具导航">
                        <div class="acu-nav-section-title">运行</div>
                    <button class="acu-tab-button active" data-tab="status">状态 & 操作</button>
                        <div class="acu-nav-section-title">配置</div>
                    <button class="acu-tab-button" data-tab="prompt">AI指令预设</button>
                    <button class="acu-tab-button" data-tab="api">API & 连接</button>
                    <button class="acu-tab-button" data-tab="worldbook">世界书</button>
                        <div class="acu-nav-section-title">数据</div>
                    <button class="acu-tab-button" data-tab="data">数据管理</button>
                    <button class="acu-tab-button" data-tab="import">外部导入</button>
                        <div class="acu-nav-section-title">增强</div>
                    <button class="acu-tab-button" data-tab="plot">剧情推进（记忆召回）（必开！）</button>
                    <button class="acu-tab-button" data-tab="optimization" id="${SCRIPT_ID_PREFIX_ACU}-tab-optimization" style="display: none;">正文替换</button>
                </div>

                    <div class="acu-main">
                <!-- Tab内容（由独立模块生成） -->
                ${generateStatusTabHTML()}
                ${generatePromptTabHTML()}
                ${generateApiTabHTML()}
                ${generateWorldbookTabHTML()}
                ${generateDataTabHTML()}
                ${generateImportTabHTML()}
                ${generatePlotTabHTML()}
                ${generateOptimizationTabHTML()}

                <p id="${SCRIPT_ID_PREFIX_ACU}-status-message" class="notes">准备就绪</p>
                    </div>
                </div>
            </div>`;
    
    // ═══ 使用独立窗口系统代替酒馆弹窗 ═══
    const windowId = `${SCRIPT_ID_PREFIX_ACU}-main-window`;
    
    createACUWindow({
      id: windowId,
      title: '星·数据库 III',
      content: popupHtml,
      width: 1400,  // 基础宽度
      height: 900,  // 基础高度
      modal: false, // 非模态，允许多窗口操作
      resizable: true,
      maximizable: true,
      startMaximized: false, // 由 rememberState 自动管理，首次打开时不全屏
      onClose: () => {
        logDebug_ACU('ACU Window closed');
        _set_$popupInstance_ACU(null);
      },
      onReady: async ($window: any) => {
        // 从窗口body中找到实际内容
        const $body = $window.find('.acu-window-body');
        const curDlgCnt = $body.find(`#${POPUP_ID_ACU}`);
        
        if (!curDlgCnt || curDlgCnt.length === 0) {
          logError_ACU('Cannot find ACU popup DOM in window');
          showToastr_ACU('error', 'UI初始化失败');
          return;
        }
        _set_$popupInstance_ACU(curDlgCnt);
        $popupInstance_ACU.off('acu_plot_settings_refresh').on('acu_plot_settings_refresh', function(_event, plotSettingsOverride = null) {
          try {
            loadPlotSettingsToUI_ACU(plotSettingsOverride);
          } catch (error) {
            logWarn_ACU('[剧情推进] Plot settings UI refresh handler failed:', error);
          }
        });

        // 事件绑定（已拆分到 popup-bindings.ts）
        await bindPopupEvents_ACU();

      showToastr_ACU('success', '数据库更新工具已加载。');
      }
    });


  }
