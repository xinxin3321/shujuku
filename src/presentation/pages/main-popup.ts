// main-popup.ts
// 从 05_main_popup.js 整体迁入

import { DEFAULT_AUTO_UPDATE_FREQUENCY_ACU, DEFAULT_AUTO_UPDATE_THRESHOLD_ACU, DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU } from '../../data/models/defaults';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU } from '../../data/repositories/template-preset-repo';
import { showToastr_ACU } from '../theme/toast';
import { coreApisAreReady_ACU, currentChatFileIdentifier_ACU, $popupInstance_ACU, _set_$popupInstance_ACU} from '../../service/runtime/state-manager';
import { loadSettingsAndRefreshUI_ACU } from '../../service/settings/settings-service';
import { POPUP_ID_ACU, SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { DEFAULT_PRESET_OPTION_VALUE_ACU } from '../components/optimization-ui';
import { bindPopupEvents_ACU } from './popup-bindings';
import { loadPlotSettingsToUI_ACU } from './popup-helpers';
import { createACUWindow } from '../window/window-system';

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
                <style>
                    /* ═══════════════════════════════════════════════════════════════
                       星·数据库 UI 设计系统（仅影响插件自身）
                       目标：大气、简约、高级；超窄屏也能舒服用
                       ═══════════════════════════════════════════════════════════════ */
                    
                    /* 基础隔离：尽量不吃外部样式（但不使用 all: initial，避免破坏第三方组件） */
                    #${POPUP_ID_ACU}, #${POPUP_ID_ACU} * { box-sizing: border-box; }
                    #${POPUP_ID_ACU} { color-scheme: dark; }

                    #${POPUP_ID_ACU} {
                        /* 主题色：深色中性 + 蓝紫高光（不单调，但克制） */
                        --acu-bg-0: #0b0f15;
                        --acu-bg-1: #101826;
                        --acu-bg-2: rgba(255, 255, 255, 0.06);
                        --acu-bg-3: rgba(255, 255, 255, 0.09);
                        --acu-border: rgba(255, 255, 255, 0.12);
                        --acu-border-2: rgba(255, 255, 255, 0.18);
                        --acu-text-1: rgba(255, 255, 255, 0.92);
                        --acu-text-2: rgba(255, 255, 255, 0.74);
                        --acu-text-3: rgba(255, 255, 255, 0.52);

                        --acu-accent: #7bb7ff;
                        --acu-accent-2: #9b7bff;
                        --acu-accent-glow: rgba(123, 183, 255, 0.22);
                        --acu-accent-glow-2: rgba(155, 123, 255, 0.18);

                        --acu-success: #4ad19f;
                        --acu-warning: #ffb85c;
                        --acu-danger: #ff6b6b;

                        --acu-radius-lg: 16px;
                        --acu-radius-md: 12px;
                        --acu-radius-sm: 10px;

                        --acu-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
                        
                        /* 兼容旧 inline style 里使用的变量名（避免依赖外部主题） */
                        --bg-primary: var(--acu-bg-0);
                        --bg-secondary: var(--acu-bg-1);
                        --background_light: rgba(255, 255, 255, 0.04);
                        --background_default: rgba(255, 255, 255, 0.03);
                        --background-color-light: rgba(255, 255, 255, 0.04);
                        --input-background: rgba(0, 0, 0, 0.26);
                        --input-text-color: var(--acu-text-1);
                        --text-main: var(--acu-text-1);
                        --text_primary: var(--acu-text-1);
                        --text_secondary: var(--acu-text-2);
                        --text_tertiary: var(--acu-text-3);
                        --text-color: var(--acu-text-1);
                        --text-color-dimmed: var(--acu-text-3);
                        --border_color: var(--acu-border);
                        --border_color_light: var(--acu-border);
                        --border-normal: var(--acu-border-2);
                        --warning-color: var(--acu-warning);
                        --error-color: var(--acu-danger);
                        --button-background: rgba(255, 255, 255, 0.06);
                        --button-secondary-background: rgba(255, 255, 255, 0.04);
                        --green: var(--acu-success);
                        --orange: var(--acu-warning);
                        --red: var(--acu-danger);
                        
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "HarmonyOS Sans SC", "MiSans", Roboto, Helvetica, Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.6;
                        color: var(--acu-text-1);
                        width: 100%;
                        max-width: 100vw;
                        /* 关键：设置高度为100%并启用滚动，确保内容不溢出 */
                        height: 100%;
                        box-sizing: border-box;
                        overflow-x: hidden;
                        overflow-y: auto;
                        padding: 14px;
                        /* 移动端安全区域适配 */
                        padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
                        background:
                            radial-gradient(1200px 600px at 10% -10%, rgba(123, 183, 255, 0.18), transparent 60%),
                            radial-gradient(900px 500px at 100% 0%, rgba(155, 123, 255, 0.14), transparent 55%),
                            linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 22%),
                            var(--acu-bg-0);
                    }

                    /* 防横向溢出兜底：任何子元素都不应把容器撑出屏幕 */
                    #${POPUP_ID_ACU} * { max-width: 100%; }
                    #${POPUP_ID_ACU} .acu-layout,
                    #${POPUP_ID_ACU} .acu-main,
                    #${POPUP_ID_ACU} .acu-tab-content,
                    #${POPUP_ID_ACU} .acu-card,
                    #${POPUP_ID_ACU} .acu-tabs-nav { min-width: 0; }

                    /* 顶部标题条 */
                    #${POPUP_ID_ACU} .acu-header {
                        display: flex;
                        align-items: flex-start;
                        justify-content: center;
                        gap: 12px;
                        padding: 12px 12px 10px 12px;
                        border: 1px solid var(--acu-border);
                        border-radius: var(--acu-radius-lg);
                        background: rgba(255, 255, 255, 0.03);
                        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                    }
                    /* 顶部标题块居中（宽屏/窄屏一致） */
                    #${POPUP_ID_ACU} .acu-header > div {
                        width: 100%;
                        text-align: center;
                    }

                    #${POPUP_ID_ACU} h2#updater-main-title-acu {
                        margin: 0;
                        padding: 0;
                        border: none;
                        font-size: 16px;
                        line-height: 1.35;
                        font-weight: 650;
                        letter-spacing: 0.2px;
                        color: var(--acu-text-1);
                        text-align: center;
                    }
                    
                    #${POPUP_ID_ACU} .acu-header-sub {
                        margin-top: 6px;
                        font-size: 12px;
                        color: var(--acu-text-3);
                        text-align: center;
                    }

                    #${POPUP_ID_ACU} .acu-layout {
                        display: grid;
                        grid-template-columns: 240px minmax(0, 1fr);
                        gap: 14px;
                        margin-top: 14px;
                        min-height: 0; /* 允许在flex布局中收缩 */
                    }

                    /* 导航（桌面：侧边栏；移动：顶部横向） */
                    #${POPUP_ID_ACU} .acu-tabs-nav {
                        border: 1px solid var(--acu-border);
                        border-radius: var(--acu-radius-lg);
                        background: rgba(255, 255, 255, 0.03);
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                        position: sticky;
                        top: 0;
                        align-self: start;
                        max-height: calc(100vh - 180px);
                        overflow: auto;
                    }

                    #${POPUP_ID_ACU} .acu-nav-section-title {
                        padding: 10px 10px 6px 10px;
                        color: var(--acu-text-3);
                        font-size: 12px;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                        user-select: none;
                    }
                    
                    #${POPUP_ID_ACU} .acu-tab-button {
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 10px;
                        padding: 10px 12px;
                        border: 1px solid transparent;
                        border-radius: 12px;
                        background: transparent;
                        color: var(--acu-text-2);
                        font-size: 13px;
                        font-weight: 600;
                        letter-spacing: 0.2px;
                        cursor: pointer;
                        transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
                    }
                    #${POPUP_ID_ACU} .acu-tab-button:hover {
                        background: rgba(255, 255, 255, 0.06);
                        border-color: rgba(255, 255, 255, 0.10);
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} .acu-tab-button.active {
                        background:
                            linear-gradient(135deg, rgba(123, 183, 255, 0.22), rgba(155, 123, 255, 0.14));
                        border-color: rgba(123, 183, 255, 0.35);
                        color: var(--acu-text-1);
                        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
                    }
                    #${POPUP_ID_ACU} .acu-tab-button::after {
                        content: "›";
                        opacity: 0.55;
                        font-weight: 700;
                    }
                    #${POPUP_ID_ACU} .acu-tab-button.active::after { opacity: 0.9; }

                    /* 内容区 */
                    #${POPUP_ID_ACU} .acu-main {
                        min-width: 0;
                        min-height: 0; /* 允许在flex布局中收缩 */
                        overflow: visible; /* 让滚动在父容器处理 */
                    }

                    #${POPUP_ID_ACU} .acu-tab-content { display: none; }
                    #${POPUP_ID_ACU} .acu-tab-content.active { display: block; animation: acuFadeUp 160ms ease-out; }
                    @keyframes acuFadeUp {
                        from { opacity: 0; transform: translateY(6px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    /* 卡片（统一高级质感） */
                    #${POPUP_ID_ACU} .acu-card {
                        border: 1px solid var(--acu-border);
                        border-radius: var(--acu-radius-lg);
                        background: rgba(255, 255, 255, 0.03);
                        padding: 16px;
                        margin-bottom: 14px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
                    }
                    #${POPUP_ID_ACU} .acu-card h3 {
                        margin: 0 0 12px 0;
                        padding: 0 0 10px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                        font-size: 14px;
                        letter-spacing: 0.6px;
                        font-weight: 700;
                        color: var(--acu-text-1);
                    }
                    
                    /* 网格 */
                    #${POPUP_ID_ACU} .acu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
                    #${POPUP_ID_ACU} .acu-grid-2x2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
                    
                    /* 表单 */
                    #${POPUP_ID_ACU} label {
                        display: block;
                        margin-bottom: 6px;
                        color: var(--acu-text-2);
                        font-size: 12px;
                        font-weight: 600;
                        letter-spacing: 0.2px;
                    }
                    #${POPUP_ID_ACU} input,
                    #${POPUP_ID_ACU} select,
                    #${POPUP_ID_ACU} textarea {
                        width: 100%;
                        padding: 10px 12px;
                        border-radius: 12px;
                        border: 1px solid var(--acu-border-2);
                        background: rgba(0, 0, 0, 0.35) !important;
                        color: var(--acu-text-1);
                        font-size: 14px;
                        outline: none;
                        transition: border-color 0.12s ease, box-shadow 0.12s ease;
                    }
                    #${POPUP_ID_ACU} input:focus, 
                    #${POPUP_ID_ACU} select:focus, 
                    #${POPUP_ID_ACU} textarea:focus {
                        border-color: rgba(123, 183, 255, 0.55);
                        box-shadow: 0 0 0 3px var(--acu-accent-glow);
                    }
                    #${POPUP_ID_ACU} textarea { min-height: 92px; resize: vertical; line-height: 1.55; }
                    #${POPUP_ID_ACU} input::placeholder, #${POPUP_ID_ACU} textarea::placeholder { color: rgba(255, 255, 255, 0.35); }

                    /* iOS：阻止输入框聚焦缩放 */
                    @media (max-width: 480px) {
                        #${POPUP_ID_ACU} input, #${POPUP_ID_ACU} select, #${POPUP_ID_ACU} textarea { font-size: 16px; }
                    }

                    /* 按钮体系（更克制：更小、更稳，不花哨） */
                    #${POPUP_ID_ACU} button, #${POPUP_ID_ACU} .button {
                        padding: 8px 12px;
                        border-radius: 10px;
                        border: 1px solid rgba(255, 255, 255, 0.16);
                        background: rgba(255, 255, 255, 0.04);
                        color: var(--acu-text-2);
                        cursor: pointer;
                        font-weight: 650;
                        letter-spacing: 0.1px;
                        line-height: 1.1;
                        min-height: 34px;
                        transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
                    }
                    #${POPUP_ID_ACU} button:hover, #${POPUP_ID_ACU} .button:hover {
                        background: rgba(255, 255, 255, 0.06);
                        color: var(--acu-text-1);
                        border-color: rgba(255, 255, 255, 0.22);
                    }
                    #${POPUP_ID_ACU} button:active { transform: translateY(1px); }
                    #${POPUP_ID_ACU} button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

                    /* 主按钮：去渐变，改为低饱和纯色强调 */
                    #${POPUP_ID_ACU} button.primary, #${POPUP_ID_ACU} .button.primary {
                        border-color: rgba(123, 183, 255, 0.38);
                        background: rgba(123, 183, 255, 0.16);
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} button.primary:hover, #${POPUP_ID_ACU} .button.primary:hover {
                        background: rgba(123, 183, 255, 0.22);
                        border-color: rgba(123, 183, 255, 0.50);
                    }
                    
                    /* 警告/危险：同样克制，保持辨识但不刺眼 */
                    #${POPUP_ID_ACU} .btn-warning {
                        background: rgba(255, 184, 92, 0.14);
                        border-color: rgba(255, 184, 92, 0.28);
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} .btn-danger {
                        background: rgba(255, 107, 107, 0.14);
                        border-color: rgba(255, 107, 107, 0.28);
                        color: var(--acu-text-1);
                    }
                    
                    /* 小按钮样式 - 用于全选/全不选等辅助按钮 */
                    #${POPUP_ID_ACU} .acu-btn-small, #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-manual-table-select-all, #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-manual-table-select-none {
                        padding: 4px 8px;
                        font-size: 0.8em;
                        font-weight: 600;
                        border-radius: 6px;
                        min-width: auto;
                        height: 28px;
                        line-height: 20px;
                    }

                    /* 中等按钮样式 - 用于主要操作按钮但需要控制大小的情况 */
                    #${POPUP_ID_ACU} .acu-btn-medium, #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer {
                        padding: 8px 12px;
                        font-size: 0.95em;
                        font-weight: 600;
                        border-radius: 10px;
                        min-width: auto;
                        height: 40px;
                    }

                    /* 数据管理按钮组：2×2 / 3×3 网格，等宽等高（不随文字长度变化） */
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons {
                        display: grid !important; /* 覆盖 .button-group 的 flex，避免变成“一排下来” */
                        gap: 12px !important;
                        align-items: stretch;
                        justify-items: stretch;
                        margin-top: 0;
                        min-width: 0;
                    }
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons.acu-cols-2 {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons.acu-cols-3 {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }

                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button,
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button {
                        width: 100% !important;
                        min-width: 0 !important;
                        height: 44px !important;
                        padding: 0 14px !important;
                        border-radius: 12px !important;
                        font-size: 0.92em !important;
                        font-weight: 750 !important;
                        letter-spacing: 0.12px;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        /* 提升对比度：更清晰的底色/边框，不花哨 */
                        background: rgba(255, 255, 255, 0.075) !important;
                        border: 1px solid rgba(255, 255, 255, 0.22) !important;
                        color: rgba(255,255,255,0.92) !important;
                        box-shadow: 0 10px 22px rgba(0,0,0,0.22);
                    }
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button:hover,
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button:hover {
                        background: rgba(255, 255, 255, 0.10) !important;
                        border-color: rgba(255, 255, 255, 0.30) !important;
                    }
                    
                    #${POPUP_ID_ACU} .button-group {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        justify-content: center;
                        margin-top: 14px;
                    }

                    /* 兼容旧类名：保证“只来自插件自身”的统一观感 */
                    #${POPUP_ID_ACU} .menu_button {
                        border-radius: 12px !important;
                        border: 1px solid var(--acu-border-2) !important;
                    }

                    #${POPUP_ID_ACU} hr {
                        border: none;
                        border-top: 1px solid rgba(255, 255, 255, 0.10);
                        margin: 14px 0;
                    }
                    
                    /* 通用布局小组件 */
                    #${POPUP_ID_ACU} .flex-center { display: flex; justify-content: center; align-items: center; }
                    #${POPUP_ID_ACU} .input-group { display: flex; gap: 10px; align-items: center; }
                    #${POPUP_ID_ACU} .input-group input { flex: 1; min-width: 0; }
                    
                    #${POPUP_ID_ACU} .checkbox-group {
                        display: flex;
                        align-items: flex-start;
                        gap: 10px;
                        padding: 12px;
                        border-radius: var(--acu-radius-md);
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: rgba(0, 0, 0, 0.18);
                    }
                    
                    /* ✅ 复选框（最高优先级：按主题切换配色；不受浏览器风格影响；仅限插件弹窗作用域） */
                    #${POPUP_ID_ACU} input[type="checkbox"] {
                        -webkit-appearance: none !important;
                        appearance: none !important;
                        accent-color: initial !important;
                        width: 18px !important;
                        height: 18px !important;
                        min-width: 18px !important;
                        min-height: 18px !important;
                        border-radius: 4px !important;
                        border: 1px solid var(--acu-checkbox-border) !important;
                        background-color: var(--acu-checkbox-bg) !important;
                        background-image: none !important;
                        background-repeat: no-repeat !important;
                        background-position: center !important;
                        background-size: 12px 10px !important;
                        box-shadow: var(--acu-checkbox-shadow) !important;
                        margin: 0 !important;
                        cursor: pointer !important;
                        vertical-align: middle !important;
                        transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease !important;
                    }
                    /* 关键：禁用外部/浏览器可能注入的伪元素勾选样式，避免出现“蓝色小勾叠加” */
                    #${POPUP_ID_ACU} input[type="checkbox"]::before,
                    #${POPUP_ID_ACU} input[type="checkbox"]::after {
                        content: none !important;
                        display: none !important;
                    }
                    #${POPUP_ID_ACU} input[type="checkbox"]:checked {
                        border-color: var(--acu-checkbox-bg-checked) !important;
                        background-color: var(--acu-checkbox-bg-checked) !important;
                        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 10'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M1 5l3 3 7-7'/%3E%3C/svg%3E") !important;
                    }
                    #${POPUP_ID_ACU} input[type="checkbox"]:disabled {
                        opacity: 0.45 !important;
                        cursor: not-allowed !important;
                    }
                    #${POPUP_ID_ACU} input[type="checkbox"]:focus-visible {
                        outline: 2px solid var(--acu-checkbox-focus) !important;
                        outline-offset: 2px !important;
                    }
                    /* 位置微调（不改变外观规则） */
                    #${POPUP_ID_ACU} .checkbox-group input[type="checkbox"] { margin-top: 2px !important; }
                    #${POPUP_ID_ACU} .checkbox-group label { margin: 0; color: var(--acu-text-1); font-size: 13px; font-weight: 600; }

                    /* Toggle switch（剧情推进） */
                    #${POPUP_ID_ACU} .toggle-switch { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
                    /* 关键：滑动开关内部的 checkbox 必须保持“隐藏输入”形态，避免被上面的复选框样式接管 */
                    #${POPUP_ID_ACU} .toggle-switch input[type="checkbox"] {
                        -webkit-appearance: auto !important;
                        appearance: auto !important;
                        background: transparent !important;
                        border: 0 !important;
                        box-shadow: none !important;
                        width: 0 !important;
                        height: 0 !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                        opacity: 0 !important;
                        margin: 0 !important;
                        cursor: pointer !important;
                    }
                    #${POPUP_ID_ACU} .slider {
                        position: absolute; cursor: pointer; inset: 0;
                        background: rgba(255, 255, 255, 0.16);
                        border: 1px solid rgba(255, 255, 255, 0.14);
                        transition: 0.18s ease;
                        border-radius: 999px;
                    }
                    #${POPUP_ID_ACU} .slider:before {
                        content: ""; position: absolute;
                        height: 20px; width: 20px; left: 3px; top: 50%;
                        transform: translateY(-50%);
                        background: rgba(255, 255, 255, 0.92);
                        transition: 0.18s ease;
                        border-radius: 999px;
                    }
                    #${POPUP_ID_ACU} .toggle-switch input:checked + .slider {
                        background: linear-gradient(135deg, rgba(123, 183, 255, 0.55), rgba(155, 123, 255, 0.45));
                        border-color: rgba(123, 183, 255, 0.45);
                    }
                    #${POPUP_ID_ACU} .toggle-switch input:checked + .slider:before { transform: translateY(-50%) translateX(20px); }

                    /* 提示词编辑器 */
                    #${POPUP_ID_ACU} .prompt-segment { 
                        margin-bottom: 12px; 
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: rgba(0, 0, 0, 0.18);
                        padding: 12px;
                        border-radius: var(--acu-radius-md);
                    }
                    #${POPUP_ID_ACU} .prompt-segment-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
                    #${POPUP_ID_ACU} .prompt-segment-role { width: 120px !important; flex-grow: 0; }
                    #${POPUP_ID_ACU} .prompt-segment-delete-btn { 
                        width: 28px; height: 28px; padding: 0;
                        border-radius: 999px;
                        border: 1px solid rgba(255, 107, 107, 0.35);
                        background: rgba(255, 107, 107, 0.18);
                        color: var(--acu-text-1);
                        font-weight: 800;
                        line-height: 28px;
                    }
                    #${POPUP_ID_ACU} .${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn { 
                        height: 32px;
                        padding: 0 14px;
                        border-radius: 999px;
                        border-color: rgba(74, 209, 159, 0.35) !important;
                        background: rgba(74, 209, 159, 0.20) !important;
                        color: var(--acu-text-1) !important;
                    }
                    /* 剧情推进独立提示词组编辑器（避免与“数据库更新预设”事件冲突，使用独立 class） */
                    #${POPUP_ID_ACU} .plot-prompt-segment {
                        margin-bottom: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: rgba(0, 0, 0, 0.18);
                        padding: 12px;
                        border-radius: var(--acu-radius-md);
                    }
                    #${POPUP_ID_ACU} .plot-prompt-segment-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
                    #${POPUP_ID_ACU} .plot-prompt-segment-role { width: 120px !important; flex-grow: 0; }
                    #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-header-row,
                    #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-scope-grid,
                    #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-task-layout {
                        min-width: 0;
                    }
                    #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-scope-grid > *,
                    #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-task-layout > * {
                        min-width: 0;
                    }
                    #${POPUP_ID_ACU} .plot-prompt-segment-delete-btn {
                        width: 28px; height: 28px; padding: 0;
                        border-radius: 999px;
                        border: 1px solid rgba(255, 107, 107, 0.35);
                        background: rgba(255, 107, 107, 0.18);
                        color: var(--acu-text-1);
                        font-weight: 800;
                        line-height: 28px;
                    }
                    #${POPUP_ID_ACU} .${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt-segment-btn { 
                        height: 32px;
                        padding: 0 14px;
                        border-radius: 999px;
                        border-color: rgba(74, 209, 159, 0.35) !important;
                        background: rgba(74, 209, 159, 0.20) !important;
                        color: var(--acu-text-1) !important;
                    }

                    /* 世界书 */
                    #${POPUP_ID_ACU} .qrf_radio_group {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: center;
                        gap: 10px 16px;
                        padding: 12px;
                        border-radius: var(--acu-radius-md);
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: rgba(0, 0, 0, 0.16);
                    }
                    #${POPUP_ID_ACU} .qrf_radio_group input[type="radio"] { width: auto !important; margin: 0; accent-color: var(--acu-accent); }
                    #${POPUP_ID_ACU} .qrf_radio_group label { margin: 0 !important; color: var(--acu-text-1); font-weight: 650; }
                    #${POPUP_ID_ACU} .qrf_worldbook_list, #${POPUP_ID_ACU} .qrf_worldbook_entry_list {
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        border-radius: var(--acu-radius-md);
                        background: rgba(0, 0, 0, 0.18);
                        padding: 8px;
                        max-height: 220px;
                        overflow: auto;
                    }
                    #${POPUP_ID_ACU} .qrf_worldbook_list_item { 
                        padding: 10px 10px;
                        border-radius: 10px;
                        cursor: pointer;
                        user-select: none;
                        color: var(--acu-text-2);
                        transition: background 0.12s ease, color 0.12s ease;
                        margin-bottom: 6px;
                        border: 1px solid transparent;
                    }
                    #${POPUP_ID_ACU} .qrf_worldbook_list_item:hover { background: rgba(255, 255, 255, 0.06); color: var(--acu-text-1); }
                    #${POPUP_ID_ACU} .qrf_worldbook_list_item.selected { 
                        background: linear-gradient(135deg, rgba(123, 183, 255, 0.22), rgba(155, 123, 255, 0.14));
                        border-color: rgba(123, 183, 255, 0.25);
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} .qrf_worldbook_entry_item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 6px; }
                    #${POPUP_ID_ACU} .qrf_worldbook_entry_item input[type="checkbox"] { margin: 1px 0 0 0 !important; }
                    #${POPUP_ID_ACU} .qrf_worldbook_entry_item label { margin: 0; font-weight: 600; font-size: 13px; color: var(--acu-text-2); }

                    /* notes/辅助文字 */
                    #${POPUP_ID_ACU} .notes, #${POPUP_ID_ACU} small.notes {
                        display: block;
                        margin-top: 10px;
                        font-size: 12px;
                        line-height: 1.55;
                        color: var(--acu-text-3);
                        text-align: left;
                    }
                    
                    /* 底部状态栏：独立成条，居中不“歪” */
                    #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-status-message {
                        margin: 12px 0 0 0;
                        padding: 10px 12px;
                            width: 100%;
                        text-align: center;
                        border-radius: var(--acu-radius-md);
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        background: rgba(0, 0, 0, 0.18);
                        color: var(--acu-text-2);
                        }
                        
                    /* 状态显示 */
                        #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-card-update-status-display {
                        padding: 10px 12px;
                        border-radius: var(--acu-radius-md);
                        border: 1px dashed rgba(255, 255, 255, 0.18);
                        background: rgba(0, 0, 0, 0.20);
                        color: var(--acu-text-2);
                        }
                    #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-total-messages-display { color: var(--acu-text-3); font-size: 12px; }
                        
                    /* 表格 */
                    #${POPUP_ID_ACU} table { width: 100%; border-collapse: collapse; }
                    #${POPUP_ID_ACU} table th { color: var(--acu-text-3); font-weight: 700; font-size: 12px; letter-spacing: 0.6px; }
                    #${POPUP_ID_ACU} table td { color: var(--acu-text-2); }
                    #${POPUP_ID_ACU} table tr:hover { background: rgba(123, 183, 255, 0.06); }

                    /* 滚动条 */
                    #${POPUP_ID_ACU} ::-webkit-scrollbar { width: 8px; height: 8px; }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.04); border-radius: 999px; }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 999px; }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.20); }
                        
                    /* Toast 终止按钮（剧情推进） */
                    #toast-container .qrf-abort-btn {
                        margin-left: 8px;
                        padding: 4px 10px;
                        border-radius: 999px;
                        border: 1px solid rgba(255, 107, 107, 0.35);
                        background: rgba(255, 107, 107, 0.20);
                        color: #fff;
                        cursor: pointer;
                        font-weight: 650;
                        white-space: nowrap;
                    }

                    /* 响应式：移动端优先解决"超窄 + 两侧空白" -> 让内容尽量占满可用宽度 */
                    @media screen and (max-width: 1100px) {
                        #${POPUP_ID_ACU} .acu-layout {
                            grid-template-columns: 1fr;
                            min-height: 0; /* 允许收缩 */
                        }
                        #${POPUP_ID_ACU} .acu-tabs-nav {
                            position: sticky;
                            top: 0;
                            z-index: 10;
                            flex-direction: row;
                            align-items: center;
                            overflow-x: auto;
                            overflow-y: hidden;
                            gap: 8px;
                            padding: 10px;
                            max-height: none; /* 移除高度限制 */
                            flex-shrink: 0; /* 导航条不收缩 */
                            -webkit-overflow-scrolling: touch; /* iOS平滑滚动 */
                            /* 窄屏模式下使用不透明背景，避免滚动时内容透出 */
                            background: #0d1117;
                            border-color: rgba(255, 255, 255, 0.12);
                        }
                        #${POPUP_ID_ACU} .acu-nav-section-title { display: none; }
                        #${POPUP_ID_ACU} .acu-tab-button { width: auto; white-space: nowrap; }
                        #${POPUP_ID_ACU} .acu-main { min-height: 0; }
                        #${POPUP_ID_ACU} #acu-tab-data .acu-data-template-grid {
                            grid-template-columns: 1fr !important;
                            gap: 12px !important;
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .acu-data-template-grid > * {
                            min-width: 0;
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .acu-template-preset-left,
                        #${POPUP_ID_ACU} #acu-tab-data .acu-template-preset-actions {
                            width: 100%;
                            flex-wrap: wrap;
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .acu-template-preset-left .acu-mini-btn,
                        #${POPUP_ID_ACU} #acu-tab-data .acu-template-preset-actions .acu-mini-btn {
                            flex: 1 1 140px;
                            min-width: 0;
                            justify-content: center;
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .acu-data-isolation-row {
                            flex-direction: column;
                            align-items: stretch !important;
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .acu-data-isolation-row > button {
                            width: 100%;
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .button-group.acu-data-mgmt-buttons.acu-cols-3 {
                            grid-template-columns: repeat(2, minmax(0, 1fr));
                        }
                        #${POPUP_ID_ACU} #acu-tab-data .button-group.acu-data-mgmt-buttons button,
                        #${POPUP_ID_ACU} #acu-tab-data .button-group.acu-data-mgmt-buttons .button {
                            height: auto !important;
                            min-height: 42px !important;
                            padding: 8px 10px !important;
                            white-space: normal !important;
                            line-height: 1.35 !important;
                        }
                    }
                    
                    /* 手机横屏/小平板 (≤768px) */
                    @media screen and (max-width: 768px) {
                        #${POPUP_ID_ACU} {
                            padding: 10px;
                            padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
                            max-width: 100vw;
                            overflow-x: hidden;
                            overflow-y: auto;
                            box-sizing: border-box;
                            /* 确保高度不超过容器 */
                            max-height: 100%;
                        }
                        #${POPUP_ID_ACU} .acu-layout {
                            gap: 10px;
                            margin-top: 10px;
                            /* 防止内容溢出 */
                            min-height: 0;
                        }
                        #${POPUP_ID_ACU} .acu-header { padding: 10px; gap: 8px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} h2#updater-main-title-acu { font-size: 14px; }
                        #${POPUP_ID_ACU} .acu-card { padding: 12px; margin-bottom: 10px; }
                        #${POPUP_ID_ACU} .acu-card h3 { font-size: 13px; margin-bottom: 10px; padding-bottom: 8px; }
                        #${POPUP_ID_ACU} .acu-tabs-nav {
                            padding: 8px;
                            gap: 6px;
                            flex-shrink: 0;
                            /* 导航条不应该溢出 */
                            max-height: none;
                            /* 窄屏模式下使用不透明背景 */
                            background: #0d1117;
                            border-color: rgba(255, 255, 255, 0.12);
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-header-row {
                            flex-wrap: wrap;
                            align-items: flex-start !important;
                            gap: 10px !important;
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-header-row > div:last-child {
                            width: 100%;
                            justify-content: flex-start !important;
                        }
                    }
                    
                    @media screen and (max-width: 520px) {
                        #${POPUP_ID_ACU} {
                            padding: 8px;
                            padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
                        }
                        #${POPUP_ID_ACU} .acu-layout { gap: 8px; margin-top: 8px; min-height: 0; }
                        #${POPUP_ID_ACU} .acu-main { min-height: 0; }
                        #${POPUP_ID_ACU} .acu-grid, #${POPUP_ID_ACU} .acu-grid-2x2 { grid-template-columns: 1fr; gap: 8px; }
                        #${POPUP_ID_ACU} .acu-card[style*="grid-column: span 2"] { grid-column: auto !important; }
                        #${POPUP_ID_ACU} .input-group { flex-direction: column; align-items: stretch; gap: 6px; }
                        #${POPUP_ID_ACU} .input-group button { width: 100%; }
                        #${POPUP_ID_ACU} .button-group { flex-direction: column; gap: 6px; }
                        #${POPUP_ID_ACU} .button-group button { width: 100%; min-height: 32px; padding: 8px 12px; }
                        #${POPUP_ID_ACU} table { display: block; overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; font-size: 12px; }
                        #${POPUP_ID_ACU} table th, #${POPUP_ID_ACU} table td { padding: 4px 6px !important; }
                        #${POPUP_ID_ACU} .checkbox-group { padding: 10px; gap: 8px; }
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-scope-grid,
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-task-layout {
                            grid-template-columns: 1fr !important;
                            gap: 10px !important;
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .plot-prompt-segment-toolbar {
                            flex-direction: column;
                            align-items: stretch;
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .plot-prompt-segment-toolbar > div {
                            width: 100%;
                            justify-content: space-between;
                            flex-wrap: wrap;
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .plot-prompt-segment-role {
                            width: 100% !important;
                        }

                        /* 剧情推进：预设下拉框单独占一行（更适合窄屏） */
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-preset-wrapper {
                            width: 100%;
                            flex-wrap: wrap;
                            align-items: stretch !important;
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-preset-wrapper select {
                            flex: 1 1 100% !important;
                            width: 100% !important;
                            order: 1;
                        }
                        #${POPUP_ID_ACU} #acu-tab-plot .acu-plot-preset-wrapper button {
                            order: 2;
                            flex: 1 1 44px;
                            min-width: 44px;
                            padding: 8px 10px !important;
                        }

                        /* 小按钮在移动端保持紧凑 */
                        #${POPUP_ID_ACU} .acu-btn-small, #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-manual-table-select-all, #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-manual-table-select-none {
                            padding: 3px 6px;
                            font-size: 0.75em;
                            height: 26px;
                            min-width: 50px;
                            line-height: 18px;
                        }

                        /* 中等按钮在移动端适当缩小 */
                        #${POPUP_ID_ACU} .acu-btn-medium {
                            padding: 6px 10px;
                            font-size: 0.9em;
                            height: 36px;
                        }
                        
                        /* 移动端：仍保持网格（2列更好用），避免变回单列长列表 */
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons.acu-cols-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons.acu-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button,
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button {
                            height: 40px !important;
                            font-size: 0.9em !important;
                            padding: 0 12px !important;
                        }
                    }
                    
                    /* 极窄屏模式 (≤420px) */
                    @media screen and (max-width: 420px) {
                        #${POPUP_ID_ACU} { 
                            padding: 6px; 
                            padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
                        }
                        #${POPUP_ID_ACU} .acu-layout { gap: 6px; margin-top: 6px; min-height: 0; }
                        #${POPUP_ID_ACU} .acu-main { min-height: 0; }
                        #${POPUP_ID_ACU} .acu-header { padding: 8px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} h2#updater-main-title-acu { font-size: 13px; line-height: 1.3; }
                        #${POPUP_ID_ACU} .acu-card { padding: 10px; margin-bottom: 8px; border-radius: 10px; }
                        #${POPUP_ID_ACU} .acu-card h3 { font-size: 12px; margin-bottom: 8px; padding-bottom: 6px; }
                        #${POPUP_ID_ACU} .acu-tabs-nav { padding: 6px; gap: 4px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} .acu-tab-button { padding: 8px 10px; font-size: 12px; }
                        #${POPUP_ID_ACU} label { font-size: 11px; margin-bottom: 4px; }
                        #${POPUP_ID_ACU} input, #${POPUP_ID_ACU} select, #${POPUP_ID_ACU} textarea { 
                            padding: 8px 10px; 
                            border-radius: 8px;
                        }
                        #${POPUP_ID_ACU} button, #${POPUP_ID_ACU} .button { 
                            padding: 6px 10px; 
                            min-height: 32px;
                            border-radius: 8px;
                        }
                        #${POPUP_ID_ACU} .checkbox-group { padding: 8px; gap: 6px; border-radius: 8px; }
                        #${POPUP_ID_ACU} .checkbox-group label { font-size: 12px; }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button,
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button {
                            height: 36px !important;
                            font-size: 0.85em !important;
                            padding: 0 10px !important;
                            border-radius: 8px !important;
                        }
                    }
                    
                    /* 超小屏幕 (≤360px) */
                    @media screen and (max-width: 360px) {
                        #${POPUP_ID_ACU} { 
                            padding: 4px; 
                            padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
                        }
                        #${POPUP_ID_ACU} .acu-layout { gap: 4px; margin-top: 4px; min-height: 0; }
                        #${POPUP_ID_ACU} .acu-main { min-height: 0; }
                        #${POPUP_ID_ACU} .acu-header { padding: 6px; border-radius: 8px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} h2#updater-main-title-acu { font-size: 12px; }
                        #${POPUP_ID_ACU} .acu-header-sub { font-size: 10px; margin-top: 4px; }
                        #${POPUP_ID_ACU} .acu-card { padding: 8px; margin-bottom: 6px; border-radius: 8px; }
                        #${POPUP_ID_ACU} .acu-card h3 { font-size: 11px; margin-bottom: 6px; padding-bottom: 4px; }
                        #${POPUP_ID_ACU} .acu-tabs-nav { padding: 4px; gap: 3px; border-radius: 8px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} .acu-tab-button { padding: 6px 8px; font-size: 11px; border-radius: 6px; }
                        #${POPUP_ID_ACU} .acu-tab-button::after { display: none; }
                        #${POPUP_ID_ACU} label { font-size: 10px; }
                        #${POPUP_ID_ACU} input, #${POPUP_ID_ACU} select, #${POPUP_ID_ACU} textarea { 
                            padding: 6px 8px; 
                            font-size: 14px; /* 保持16px防止iOS缩放 */
                            border-radius: 6px;
                        }
                        #${POPUP_ID_ACU} button, #${POPUP_ID_ACU} .button { 
                            padding: 5px 8px; 
                            min-height: 28px;
                            font-size: 11px;
                            border-radius: 6px;
                        }
                        #${POPUP_ID_ACU} .checkbox-group { padding: 6px; gap: 4px; border-radius: 6px; }
                        #${POPUP_ID_ACU} .checkbox-group label { font-size: 11px; line-height: 1.3; }
                        #${POPUP_ID_ACU} input[type="checkbox"] { 
                            width: 16px !important; 
                            height: 16px !important;
                            min-width: 16px !important;
                            min-height: 16px !important;
                        }
                        #${POPUP_ID_ACU} table { font-size: 11px; }
                        #${POPUP_ID_ACU} table th, #${POPUP_ID_ACU} table td { padding: 3px 4px !important; }
                        #${POPUP_ID_ACU} .button-group { gap: 4px; }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons { gap: 6px !important; }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons.acu-cols-3,
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons.acu-cols-2 { 
                            grid-template-columns: repeat(2, minmax(0, 1fr)); 
                        }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button,
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button {
                            height: 32px !important;
                            font-size: 0.8em !important;
                            padding: 0 6px !important;
                            border-radius: 6px !important;
                        }
                        #${POPUP_ID_ACU} hr { margin: 8px 0; }
                        #${POPUP_ID_ACU} .notes { font-size: 10px !important; line-height: 1.4; }
                    }

                    /* 表格模板预设：下拉旁的小工具条按钮（导入/导出/另存为等） */
                    #${POPUP_ID_ACU} .acu-template-presets {
                        border: 1px solid var(--acu-border);
                        background: rgba(255, 255, 255, 0.03);
                        box-shadow: 0 10px 36px rgba(0, 0, 0, 0.22);
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                    }
                    #${POPUP_ID_ACU} .acu-template-preset-toolbar {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                        flex-wrap: wrap;
                    }
                    #${POPUP_ID_ACU} .acu-template-preset-toolbar .acu-template-preset-left {
                        display: flex;
                        gap: 8px;
                        align-items: center;
                        flex: 1;
                        min-width: 240px;
                    }
                    #${POPUP_ID_ACU} .acu-template-preset-toolbar .acu-template-preset-actions {
                        display: flex;
                        gap: 8px;
                        align-items: center;
                        flex-wrap: wrap;
                        justify-content: flex-end;
                    }
                    #${POPUP_ID_ACU} .acu-mini-btn {
                        height: 32px;
                        padding: 0 10px;
                        border-radius: 10px;
                        border: 1px solid rgba(255, 255, 255, 0.14);
                        background: rgba(255, 255, 255, 0.06);
                        color: var(--acu-text-1);
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 12px;
                        font-weight: 650;
                        letter-spacing: 0.2px;
                        transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
                        white-space: nowrap;
                    }
                    #${POPUP_ID_ACU} .acu-mini-btn:hover {
                        transform: translateY(-1px);
                        background: rgba(255, 255, 255, 0.09);
                        border-color: rgba(255, 255, 255, 0.20);
                        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.25);
                    }
                    #${POPUP_ID_ACU} .acu-mini-btn:active {
                        transform: translateY(0px);
                    }
                    #${POPUP_ID_ACU} .acu-mini-btn.primary {
                        border-color: rgba(123, 183, 255, 0.35);
                        background: linear-gradient(180deg, rgba(123, 183, 255, 0.22), rgba(123, 183, 255, 0.10));
                        box-shadow: 0 10px 26px rgba(123, 183, 255, 0.14);
                    }
                    #${POPUP_ID_ACU} .acu-mini-btn.danger {
                        border-color: rgba(255, 107, 107, 0.35);
                        background: linear-gradient(180deg, rgba(255, 107, 107, 0.22), rgba(255, 107, 107, 0.10));
                    }
                    #${POPUP_ID_ACU} .acu-mini-btn .fa-solid { opacity: 0.92; }
                    
                    /* 超极小屏幕 (≤320px) */
                    @media screen and (max-width: 320px) {
                        #${POPUP_ID_ACU} {
                            padding: 2px;
                            padding-bottom: calc(2px + env(safe-area-inset-bottom, 0px));
                        }
                        #${POPUP_ID_ACU} .acu-layout { gap: 2px; margin-top: 2px; min-height: 0; }
                        #${POPUP_ID_ACU} .acu-main { min-height: 0; }
                        #${POPUP_ID_ACU} .acu-header { padding: 4px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} h2#updater-main-title-acu { font-size: 11px; }
                        #${POPUP_ID_ACU} .acu-card { padding: 6px; margin-bottom: 4px; }
                        #${POPUP_ID_ACU} .acu-card h3 { font-size: 10px; margin-bottom: 4px; }
                        #${POPUP_ID_ACU} .acu-tabs-nav { padding: 3px; flex-shrink: 0; }
                        #${POPUP_ID_ACU} .acu-tab-button { padding: 5px 6px; font-size: 10px; }
                        #${POPUP_ID_ACU} .checkbox-group label { font-size: 10px; }
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button,
                        #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button {
                            height: 28px !important;
                            font-size: 0.75em !important;
                        }
                    }

                    /* ═══════════════════════════════════════════════════════════════
                       古典中国风双主题覆盖（墨纸 / 素纱）
                       仅在插件主面板作用域内覆盖，不影响外部页面
                       ═══════════════════════════════════════════════════════════════ */
                    #${POPUP_ID_ACU} {
                        --acu-bg-0: #24221f;
                        --acu-bg-1: #211f1c;
                        --acu-bg-2: #2a2824;
                        --acu-bg-3: rgba(193, 185, 173, 0.06);
                        --acu-border: #36332e;
                        --acu-border-2: rgba(193, 185, 173, 0.16);
                        --acu-text-1: #c1b9ad;
                        --acu-text-2: #9e978e;
                        --acu-text-3: #645e55;
                        --acu-accent: #7d4940;
                        --acu-accent-2: #8f5a4e;
                        --acu-accent-glow: rgba(125, 73, 64, 0.16);
                        --acu-accent-glow-2: rgba(138, 107, 94, 0.12);
                        --acu-success: #85725f;
                        --acu-warning: #9c7e56;
                        --acu-danger: #8b5a55;
                        --acu-radius-lg: 2px;
                        --acu-radius-md: 2px;
                        --acu-radius-sm: 1px;
                        --acu-shadow: 0 14px 32px rgba(0, 0, 0, 0.20);
                        --background_light: rgba(193, 185, 173, 0.04);
                        --background_default: rgba(193, 185, 173, 0.03);
                        --background-color-light: rgba(193, 185, 173, 0.04);
                        --input-background: rgba(26, 24, 22, 0.36);
                        --button-background: rgba(193, 185, 173, 0.03);
                        --button-secondary-background: rgba(193, 185, 173, 0.02);
                        --acu-checkbox-border: rgba(255, 255, 255, 0.22);
                        --acu-checkbox-bg: #000;
                        --acu-checkbox-bg-checked: #000;
                        --acu-checkbox-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
                        --acu-checkbox-focus: rgba(123, 183, 255, 0.75);
                        color-scheme: dark;
                        font-family: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
                        font-weight: 500;
                        text-rendering: optimizeLegibility;
                        -webkit-font-smoothing: antialiased;
                        background-color: var(--acu-bg-0);
                        background-image:
                            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
                    }
                    body.acu-theme-silk #${POPUP_ID_ACU} {
                        --acu-bg-0: #f4f1eb;
                        --acu-bg-1: #f9f8f5;
                        --acu-bg-2: #ebe7de;
                        --acu-bg-3: rgba(74, 69, 63, 0.05);
                        --acu-border: #e0dacb;
                        --acu-border-2: rgba(110, 103, 94, 0.18);
                        --acu-text-1: #4a453f;
                        --acu-text-2: #6e675e;
                        --acu-text-3: #9e978e;
                        --acu-accent: #8a6b5e;
                        --acu-accent-2: #9d7c6f;
                        --acu-accent-glow: rgba(138, 107, 94, 0.14);
                        --acu-accent-glow-2: rgba(138, 107, 94, 0.10);
                        --acu-success: #6f7b62;
                        --acu-warning: #a2835b;
                        --acu-danger: #a06a65;
                        --background_light: rgba(255, 255, 255, 0.58);
                        --background_default: rgba(255, 255, 255, 0.42);
                        --background-color-light: rgba(255, 255, 255, 0.48);
                        --input-background: rgba(255, 255, 255, 0.70);
                        --button-background: rgba(255, 255, 255, 0.50);
                        --button-secondary-background: rgba(255, 255, 255, 0.36);
                        --acu-checkbox-border: rgba(138, 107, 94, 0.42);
                        --acu-checkbox-bg: rgba(255, 255, 255, 0.92);
                        --acu-checkbox-bg-checked: #8a6b5e;
                        --acu-checkbox-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.58);
                        --acu-checkbox-focus: rgba(138, 107, 94, 0.34);
                        color-scheme: light;
                    }
                    #${POPUP_ID_ACU} .acu-header {
                        align-items: center;
                        justify-content: flex-start;
                        gap: 12px;
                        padding: 16px 20px;
                        border: 1px solid var(--acu-border);
                        border-radius: 2px;
                        background: transparent;
                        box-shadow: none;
                        backdrop-filter: none;
                        -webkit-backdrop-filter: none;
                    }
                    #${POPUP_ID_ACU} .acu-header::before {
                        content: '录';
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 22px;
                        height: 22px;
                        border: 1px solid var(--acu-accent);
                        color: var(--acu-accent);
                        font-size: 12px;
                        border-radius: 1px;
                        opacity: 0.85;
                        letter-spacing: 1px;
                        flex-shrink: 0;
                    }
                    #${POPUP_ID_ACU} .acu-header > div {
                        text-align: left;
                    }
                    #${POPUP_ID_ACU} h2#updater-main-title-acu {
                        font-size: 14px;
                        font-weight: 650;
                        letter-spacing: 1.2px;
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} .acu-layout {
                        gap: 12px;
                        margin-top: 12px;
                    }
                    #${POPUP_ID_ACU} .acu-tabs-nav,
                    #${POPUP_ID_ACU} .acu-card,
                    #${POPUP_ID_ACU} .acu-template-presets,
                    #${POPUP_ID_ACU} .qrf_worldbook_list,
                    #${POPUP_ID_ACU} .qrf_worldbook_entry_list,
                    #${POPUP_ID_ACU} .checkbox-group,
                    #${POPUP_ID_ACU} .qrf_radio_group,
                    #${POPUP_ID_ACU} .prompt-segment,
                    #${POPUP_ID_ACU} .plot-prompt-segment,
                    #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-status-message,
                    #${POPUP_ID_ACU} #${SCRIPT_ID_PREFIX_ACU}-card-update-status-display {
                        background: var(--background_light);
                        border-color: var(--acu-border);
                        border-radius: 2px;
                        box-shadow: none;
                    }
                    #${POPUP_ID_ACU} .acu-nav-section-title {
                        color: var(--acu-text-3);
                        font-size: 11px;
                        letter-spacing: 2px;
                    }
                    #${POPUP_ID_ACU} .acu-tab-button {
                        border-radius: 1px;
                        padding: 10px 12px;
                        color: var(--acu-text-2);
                        font-weight: 600;
                        letter-spacing: 0.6px;
                    }
                    #${POPUP_ID_ACU} .acu-tab-button:hover {
                        background: var(--acu-bg-2);
                        border-color: var(--acu-border);
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} .acu-tab-button.active {
                        background: rgba(125, 73, 64, 0.10);
                        border-color: var(--acu-accent);
                        color: var(--acu-accent);
                        box-shadow: none;
                    }
                    #${POPUP_ID_ACU} .acu-tab-button::after {
                        color: var(--acu-text-3);
                    }
                    #${POPUP_ID_ACU} .acu-card h3 {
                        border-bottom-color: var(--acu-border);
                        font-size: 14px;
                        font-weight: 600;
                        letter-spacing: 0.6px;
                    }
                    #${POPUP_ID_ACU} label,
                    #${POPUP_ID_ACU} .notes,
                    #${POPUP_ID_ACU} small.notes {
                        color: var(--acu-text-2);
                    }
                    #${POPUP_ID_ACU} input,
                    #${POPUP_ID_ACU} select,
                    #${POPUP_ID_ACU} textarea {
                        border-radius: 1px;
                        border-color: var(--acu-border);
                        background: var(--input-background) !important;
                        color: var(--acu-text-1);
                    }
                    #${POPUP_ID_ACU} input:focus,
                    #${POPUP_ID_ACU} select:focus,
                    #${POPUP_ID_ACU} textarea:focus {
                        border-color: var(--acu-accent);
                        box-shadow: 0 0 0 2px var(--acu-accent-glow);
                    }
                    #${POPUP_ID_ACU} input::placeholder,
                    #${POPUP_ID_ACU} textarea::placeholder {
                        color: var(--acu-text-3);
                    }
                    #${POPUP_ID_ACU} button,
                    #${POPUP_ID_ACU} .button,
                    #${POPUP_ID_ACU} .menu_button,
                    #${POPUP_ID_ACU} .acu-mini-btn {
                        border-radius: 1px !important;
                        border-color: var(--acu-border-2) !important;
                        background: var(--button-background) !important;
                        color: var(--acu-text-2) !important;
                        box-shadow: none !important;
                        font-weight: 600;
                        letter-spacing: 0.6px;
                    }
                    #${POPUP_ID_ACU} button:hover,
                    #${POPUP_ID_ACU} .button:hover,
                    #${POPUP_ID_ACU} .menu_button:hover,
                    #${POPUP_ID_ACU} .acu-mini-btn:hover {
                        background: var(--acu-bg-2) !important;
                        border-color: var(--acu-border) !important;
                        color: var(--acu-text-1) !important;
                    }
                    #${POPUP_ID_ACU} button.primary,
                    #${POPUP_ID_ACU} .button.primary,
                    #${POPUP_ID_ACU} .acu-mini-btn.primary {
                        border-color: var(--acu-accent) !important;
                        background: rgba(125, 73, 64, 0.12) !important;
                        color: var(--acu-accent) !important;
                    }
                    #${POPUP_ID_ACU} button.primary:hover,
                    #${POPUP_ID_ACU} .button.primary:hover,
                    #${POPUP_ID_ACU} .acu-mini-btn.primary:hover {
                        background: rgba(125, 73, 64, 0.18) !important;
                    }
                    #${POPUP_ID_ACU} .btn-warning {
                        background: rgba(156, 126, 86, 0.14) !important;
                        border-color: rgba(156, 126, 86, 0.28) !important;
                        color: var(--acu-text-1) !important;
                    }
                    #${POPUP_ID_ACU} .btn-danger,
                    #${POPUP_ID_ACU} .acu-mini-btn.danger {
                        background: rgba(139, 90, 85, 0.14) !important;
                        border-color: rgba(139, 90, 85, 0.26) !important;
                        color: var(--acu-text-1) !important;
                    }
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons button,
                    #${POPUP_ID_ACU} .button-group.acu-data-mgmt-buttons .button {
                        background: rgba(193, 185, 173, 0.04) !important;
                        border: 1px solid var(--acu-border) !important;
                        color: var(--acu-text-1) !important;
                    }
                    body.acu-theme-silk #${POPUP_ID_ACU} .acu-tab-button:hover,
                    body.acu-theme-silk #${POPUP_ID_ACU} button:hover,
                    body.acu-theme-silk #${POPUP_ID_ACU} .button:hover,
                    body.acu-theme-silk #${POPUP_ID_ACU} .menu_button:hover,
                    body.acu-theme-silk #${POPUP_ID_ACU} .acu-mini-btn:hover {
                        background: var(--acu-bg-2) !important;
                    }
                    #${POPUP_ID_ACU} table tr:hover {
                        background: rgba(125, 73, 64, 0.06);
                    }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar { width: 4px; height: 4px; }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar-track { background: transparent; }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar-thumb {
                        background: var(--acu-border);
                        border-radius: 1px;
                    }
                    #${POPUP_ID_ACU} ::-webkit-scrollbar-thumb:hover {
                        background: var(--acu-text-3);
                    }
                    @media screen and (max-width: 768px) {
                        #${POPUP_ID_ACU} .acu-header {
                            padding: 12px 14px;
                            gap: 10px;
                        }
                        #${POPUP_ID_ACU} .acu-tabs-nav {
                            background: var(--background_light);
                            border-color: var(--acu-border);
                        }
                    }
                </style>

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
                <!-- Tab内容 -->
                <div id="acu-tab-status" class="acu-tab-content active">
                    <div class="acu-grid">
                        <div class="acu-card" style="grid-column: span 2;">
                            <h3>数据库状态</h3>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-normal);">
                                <span id="${SCRIPT_ID_PREFIX_ACU}-total-messages-display">上下文总层数: N/A (仅计算AI回复楼层)</span>
                                <span id="${SCRIPT_ID_PREFIX_ACU}-card-update-status-display">正在获取状态...</span>
                            </div>
                            
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                                <thead>
                                    <tr style="border-bottom: 1px solid var(--border-normal); color: var(--text-secondary);">
                                        <th style="text-align: left; padding: 5px;">表格名称</th>
                                        <th style="text-align: center; padding: 5px;">更新频率</th>
                                        <th style="text-align: center; padding: 5px;">未记录楼层</th>
                                        <th style="text-align: center; padding: 5px;">上次更新</th>
                                        <th style="text-align: center; padding: 5px;">下次触发</th>
                                    </tr>
                                </thead>
                                <tbody id="${SCRIPT_ID_PREFIX_ACU}-granular-status-table-body">
                                    <tr><td colspan="5" style="text-align: center; padding: 10px;">正在加载数据...</td></tr>
                                </tbody>
                            </table>

                            <p id="${SCRIPT_ID_PREFIX_ACU}-next-update-display" style="border-top: 1px dashed var(--border-normal); padding-top: 10px; margin-top: 10px; font-size: 0.95em; text-align: right;">下一次更新: 计算中...</p>
                        </div>
                        <div class="acu-card" style="grid-column: span 2;">
                            <h3>核心操作</h3>
                            <div class="flex-center" style="flex-direction: column; gap: 15px;">
                                <div style="width: 100%; display: flex; gap: 10px; align-items: center;">
                                    <label style="white-space: nowrap; font-size: 0.9em;">填表API预设:</label>
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-table-api-preset-select" style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-normal);">
                                        <option value="">使用当前API配置</option>
                                    </select>
                                </div>
                                <div style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
                                    <label style="white-space: nowrap; font-size: 0.9em;">正文标签提取规则:</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-table-context-extract-add-rule" class="button" style="align-self: flex-start;">添加规则</button>
                                    <small class="notes">每条规则填写开始词和结束词，仅提取最后一组匹配内容（不影响注入词规则）。</small>
                                </div>
                                <div style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
                                    <label style="white-space: nowrap; font-size: 0.9em;">标签排除规则:</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-add-rule" class="button" style="align-self: flex-start;">添加规则</button>
                                    <small class="notes">每条规则填写开始词与结束词，仅移除最后一组匹配内容。</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-tableedit-last-pair-only-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-tableedit-last-pair-only-checkbox">仅识别最后一对 &lt;tableEdit&gt; 标签（忽略前面的思维链/草稿）</label>
                                </div>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-manual-update-card" class="primary" style="width:100%;">立即手动更新</button>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox">额外提示词（仅手动更新时临时追加）</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-enabled-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-enabled-checkbox">启用自动更新</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-standardized-table-fill-enabled-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-standardized-table-fill-enabled-checkbox">规范填表功能（总结表与总体大纲必须同步新增）</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-toast-mute-enabled-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-toast-mute-enabled-checkbox">静默提示框（除填表/规划/导入/报错外，其它提示不弹窗）</label>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-prompt-template-enabled-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-prompt-template-enabled-checkbox">启用条件模板功能（<if>条件判断）</label>
                                </div>
                            </div>
                            <p class="notes" style="margin-top: 10px;">手动更新会使用当前UI参数，对勾选的表进行更新；未勾选则默认更新全部表。</p>
                            <p class="notes" style="margin-top: 6px;">勾选“额外提示词”后，点击手动更新会弹出输入框，内容将写入AI指令预设中的 $8 占位符，仅本次操作生效。</p>
                        </div>
                    </div>
                    <div class="acu-card">
                        <h3>手动更新表选择</h3>
                        <div class="notes" style="margin-bottom:6px;">选择需要手动更新的表（可多选，默认全选新表）：</div>
                        <div class="button-group" style="justify-content:flex-start; gap:8px; margin-bottom:6px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-table-select-all" class="button">全选</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-table-select-none" class="button">全不选</button>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-manual-table-selector" style="min-height:60px;">加载表格列表中...</div>
                    </div>
                     <div class="acu-card">
                        <h3>公用设置</h3>
                            <div class="acu-grid">
                                <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-token-threshold">跳过更新最小回复长度:</label>
                                    <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-token-threshold" min="0" step="100" placeholder="${DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU}">
                                    </div>
                                    <small class="notes" style="font-size: 0.85em; color: #888;">AI回复少于此长度时跳过自动填表</small>
                                </div>
                                <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-table-max-retries">填表自动重试次数:</label>
                                    <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-table-max-retries" min="1" max="10" step="1" value="3">
                                    </div>
                                    <small class="notes" style="font-size: 0.85em; color: #888;">错误或空回时自动重试的次数（默认3次）</small>
                                </div>
                                    </div>
                        <p class="notes">当自动更新时，若上下文Token（约等于字符数）低于此值，则跳过本次更新。</p>
                        </div>

                    <div class="acu-card">
                        <h3>更新配置</h3>
                        <div class="acu-grid-2x2">
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-threshold">AI读取上下文层数:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-threshold" min="0" step="1" placeholder="${DEFAULT_AUTO_UPDATE_THRESHOLD_ACU}">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-update-frequency">每N层自动更新一次:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-update-frequency" min="1" step="1" placeholder="${DEFAULT_AUTO_UPDATE_FREQUENCY_ACU}">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-update-batch-size">每批次更新楼层数:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-update-batch-size" min="1" step="1" placeholder="2">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-max-concurrent-groups">最大并发数:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-max-concurrent-groups" min="1" step="1" placeholder="1">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-skip-update-floors">保留X层楼不更新:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-skip-update-floors" min="0" step="1" placeholder="0">
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-retain-recent-layers">保留最近N层数据:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-retain-recent-layers" min="0" step="1" placeholder="空=全部保留">
                                </div>
                                <div class="notes" style="margin-top:4px;font-size:11px;opacity:0.7;">按AI楼层计数，自动更新后清理超出层数的旧数据</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="acu-tab-prompt" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>数据库更新预设 (任务指令)</h3>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-prompt-constructor-area">
                            <div class="button-group" style="margin-bottom: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn" data-position="top" title="在上方添加对话轮次">+</button></div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-prompt-segments-container">
                                <!-- Segments will be dynamically inserted here -->
                            </div>
                            <div class="button-group" style="margin-top: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn" data-position="bottom" title="在下方添加对话轮次">+</button></div>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-save-char-card-prompt" class="primary">保存</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-load-char-card-prompt-from-json">读取JSON模板</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-char-card-prompt-to-json">导出JSON模板</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-char-card-prompt">恢复默认</button>
                        </div>
                    </div>
                </div>

                <div id="acu-tab-api" class="acu-tab-content">
                     <div class="acu-card">
                        <h3>API设置</h3>
                        <div class="qrf_settings_block_radio">
                            <label>API模式:</label>
                            <div class="qrf_radio_group">
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-api-mode-custom" name="${SCRIPT_ID_PREFIX_ACU}-api-mode" value="custom" checked>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-mode-custom">自定义API</label>
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-api-mode-tavern" name="${SCRIPT_ID_PREFIX_ACU}-api-mode" value="tavern">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-mode-tavern">使用酒馆连接预设</label>
                            </div>
                        </div>

                        <div id="${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-block" style="display: none; margin-top: 15px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-select">酒馆连接预设:</label>
                             <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-select"></select>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-tavern-api-profiles" title="刷新预设列表">刷新</button>
                            </div>
                            <small class="notes">选择一个你在酒馆主设置中已经配置好的连接预设。</small>
                        </div>

                        <div id="${SCRIPT_ID_PREFIX_ACU}-custom-api-settings-block" style="margin-top: 15px;">
                             <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-use-main-api-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-use-main-api-checkbox">使用主API (直接使用酒馆当前API和模型)</label>
                            </div>
                             <div class="checkbox-group" style="margin-top: 10px;">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-streaming-enabled-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-streaming-enabled-checkbox">启用流式传输 (Streaming)</label>
                            </div>
                            <small class="notes" style="display: block; margin-left: 0; margin-bottom: 10px;">开启后，所有AI调用将使用流式传输，可减少首字节响应时间。默认关闭。</small>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-custom-api-fields">
                                <p class="notes" style="color:var(--warning-color);"><b>安全提示:</b>API密钥将保存在浏览器本地存储中。</p>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-url">API基础URL:</label><input type="text" id="${SCRIPT_ID_PREFIX_ACU}-api-url">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-key">API密钥(可选):</label><input type="password" id="${SCRIPT_ID_PREFIX_ACU}-api-key">
                                <div class="acu-grid" style="margin-top: 10px;">
                                    <div>
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-max-tokens">最大Tokens:</label>
                                        <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-max-tokens" min="1" step="1" placeholder="120000">
                                    </div>
                                    <div>
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-temperature">温度:</label>
                                        <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-temperature" min="0" max="2" step="0.05" placeholder="0.9">
                                    </div>
                                </div>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-load-models" style="margin-top: 15px; width: 100%;">加载模型列表</button>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-model-input" style="margin-top: 10px;">模型名称 (手动输入):</label>
                                <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-api-model-input" class="text_pole" placeholder="输入模型名称或从下方选择" style="width: 100%;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-model-select" style="margin-top: 8px;">或从列表选择:</label>
                                <select id="${SCRIPT_ID_PREFIX_ACU}-api-model-select" class="text_pole" style="width: 100%;">
                                    <option value="">-- 请先加载模型列表 --</option>
                                </select>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-api-status" class="notes" style="margin-top:15px;">状态: 未配置</div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-save-config" class="primary">保存API</button>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-clear-config">清除API</button>
                            </div>
                            
                            <!-- API预设管理 -->
                            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border-normal);">
                                <h4 style="margin-bottom: 10px; font-size: 0.95em; color: var(--text-muted);">API预设管理</h4>
                                <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                                    <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-api-preset-name" placeholder="预设名称" style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-normal);">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-save-api-preset" class="primary" style="padding: 6px 12px;">保存为预设</button>
                        </div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-api-preset-select" style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-normal);">
                                        <option value="">-- 选择预设 --</option>
                                    </select>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-load-api-preset" style="padding: 6px 12px;">加载</button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-delete-api-preset" style="padding: 6px 12px; background: var(--error-color); color: white;">删除</button>
                                </div>
                                <small class="notes" style="display: block; margin-top: 8px;">保存当前API配置为预设，可在填表和剧情推进中分别选用。</small>
                            </div>
                        </div>
                     </div>
                </div>

                <div id="acu-tab-worldbook" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>世界书设置</h3>
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target">数据注入目标:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                            <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target" style="width: 100%;"></select>
                            </div>
                            <small class="notes">选择数据库条目（如全局、人物、大纲等）将被创建或更新到哪个世界书里。</small>
                        </div>
                        <div class="qrf_settings_block" style="margin-top: 12px; margin-bottom: 6px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled"><strong>0TK占用模式</strong></label>
                            <label class="toggle-switch">
                                <input id="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled" type="checkbox" />
                                <span class="slider"></span>
                            </label>
                        </div>
                        <hr style="border-color: var(--border-normal); margin: 15px 0;">
                         <div class="qrf_settings_block_radio">
                            <label>世界书来源 (用于AI读取上下文):</label>
                            <div class="qrf_radio_group">
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-character" name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source" value="character" checked>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-character">角色卡绑定</label>
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-manual" name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source" value="manual">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-manual">手动选择</label>
                            </div>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-manual-select-block" style="display: none; margin-top: 10px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-select">选择世界书 (可多选):</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                            <div class="input-group">
                                <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select" class="qrf_worldbook_list"></div>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-worldbooks" title="刷新世界书列表">刷新</button>
                            </div>
                        </div>
                        <div style="margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label style="margin-bottom: 0;">启用的世界书条目:</label>
                                <div class="button-group" style="margin: 0;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">全选</button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-deselect-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">全不选</button>
                                </div>
                            </div>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-filter" placeholder="筛选条目/世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-list" class="qrf_worldbook_entry_list">
                                <!-- 条目将动态加载于此 -->
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="acu-tab-data" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>数据隔离</h3>
                        <p class="notes">在此处输入特定的标识代码，插件将只读取和保存带有该标识的数据。若留空则使用默认数据。</p>
                        <div class="setting-item" style="margin-bottom: 15px; border-bottom: 1px dashed var(--border-normal); padding-bottom: 15px;">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-input-area" style="margin-top: 10px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code">标识代码:</label>
                                <div class="acu-data-isolation-row" style="display: flex; gap: 10px; margin-top: 5px; align-items: flex-start;">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo" style="position: relative; flex-grow: 1; display: flex; align-items: center;">
                                        <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code" placeholder="输入标识代码 (留空则不隔离)" style="flex-grow: 1; padding-right: 36px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle" title="历史标识代码" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 1px solid var(--border-normal); background: var(--bg-secondary); color: var(--text-main); padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1;">▼</button>
                                        <ul id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list" style="display: none; position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--bg-primary); border: 1px solid var(--border-normal); border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); list-style: none; margin: 0; padding: 6px 0; max-height: 220px; overflow-y: auto; z-index: 9999;"></ul>
                                    </div>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-save" class="primary" style="white-space: nowrap;">保存并应用</button>
                                </div>
                                <p class="notes" style="margin-top: 5px;">输入代码并点击保存后，将重新载入对应的本地数据。</p>
                            </div>
                            <div style="margin-top: 10px; text-align: right;">
                        <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-delete-entries" class="btn-danger" style="padding: 5px 10px; border-radius: 4px; font-size: 0.9em;">删除当前标识的注入条目</button>
                            </div>
                        </div>

                        <h3>数据管理</h3>
                        <p class="notes">导入/导出当前对话的数据库，或管理全局模板。</p>
                        <div class="button-group acu-data-mgmt-buttons acu-cols-2">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-combined-settings" class="primary">合并导入(模板+指令)</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-combined-settings" class="primary">合并导出(模板+指令)</button>
                        </div>
                        <hr style="border-color: var(--border-normal); margin: 15px 0;">
                        <div class="button-group acu-data-mgmt-buttons acu-cols-3">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-json-data">导出JSON数据</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults" class="btn-warning">恢复默认模板及提示词</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-override-with-template" class="btn-danger">模板覆盖最新层数据</button>
                        </div>
                        <hr style="border-color: var(--border-normal); margin: 15px 0;">
                        <div class="acu-template-presets" style="background: var(--background-color-light); padding: 12px; border-radius: 8px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 0.95em; font-weight: 600;">表格模板预设（全局 / 当前聊天）</h4>
                            <div class="acu-data-template-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start;">
                                <div style="padding: 16px; background: var(--background_default); border-radius: 8px; border: 1px solid var(--border_color_light); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--text_primary);">全局正在使用</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-global-scope-status" class="notes">新聊天会默认继承这里的表格模板</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); font-size: 12px; font-weight: 600;">全局</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-template-preset-select" style="font-weight: 500;">全局模板预设</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-template-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU}">默认预设</option>
                                        </select>
                                    </div>
                                    <div class="acu-template-preset-toolbar" style="display: flex; flex-direction: column; gap: 10px;">
                                        <div class="acu-template-preset-left">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-template" class="acu-mini-btn" title="导入模板到全局模板库，并切换为当前全局模板；已有当前聊天本地预设的聊天不会被自动清除。">
                                                <i class="fa-solid fa-file-import"></i><span>导入</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-template" class="acu-mini-btn" title="导出当前全局模板（优先导出当前选中的全局预设）">
                                                <i class="fa-solid fa-file-export"></i><span>导出</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-template" class="acu-mini-btn" title="恢复全局默认模板；未做本地保存或导入的聊天会继续跟随全局模板。">
                                                <i class="fa-solid fa-undo"></i><span>恢复默认</span>
                                            </button>
                                        </div>
                                        <div class="acu-template-preset-actions">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-saveas" class="acu-mini-btn" title="将当前运行中的模板另存为新的全局预设">
                                                <i class="fa-solid fa-copy"></i><span>另存为</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-rename" class="acu-mini-btn" title="重命名当前选中的全局预设">
                                                <i class="fa-solid fa-i-cursor"></i><span>重命名</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-delete" class="acu-mini-btn danger" title="删除当前选中的全局预设">
                                                <i class="fa-solid fa-trash"></i><span>删除</span>
                                            </button>
                                        </div>
                                    </div>
                                    <small class="notes">这里仅做全局模板预设库管理（导入 / 导出 / 另存为 / 重命名 / 删除）；需要覆盖保存全局模板时，请使用可视化编辑器顶部的“保存到全局”。</small>
                                </div>
                                <div style="padding: 16px; background: var(--background_default); border-radius: 8px; border: 1px solid var(--border_color_light); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--text_primary);">当前聊天正在使用</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-scope-status" class="notes">未做聊天级保存时，这里会直接跟随全局模板</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); font-size: 12px; font-weight: 600;">聊天</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select" style="font-weight: 500;">当前聊天模板预设</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU}">默认预设</option>
                                        </select>
                                    </div>
                                    <div class="acu-template-preset-actions">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-template-chat-import-preset" class="acu-mini-btn" title="导入模板到当前聊天预设列表；同名预设会直接覆盖">
                                            <i class="fa-solid fa-file-import"></i><span>导入到当前聊天</span>
                                        </button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-template-chat-export-preset" class="acu-mini-btn" title="导出当前聊天正在使用的模板预设">
                                            <i class="fa-solid fa-download"></i><span>导出当前聊天</span>
                                        </button>
                                    </div>
                                    <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-file-input" style="display: none;" accept=".json">
                                    <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-origin-status" class="notes">这里仅做当前聊天模板预设的导入 / 导出；需要覆盖保存时，请在可视化编辑器中使用“保存到当前聊天”或“保存到全局”。</small>
                                </div>
                            </div>
                        </div>
                        <!-- 楼层范围选择 -->
                        <div style="background: var(--background-color-light); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.9em; color: var(--text-color); font-weight: 500;">删除范围设置</h4>
                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" style="font-weight: 500; font-size: 0.85em;">起始AI楼层:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" min="1" value="1" placeholder="1" style="width: 100%; padding: 4px 8px; border: 1px solid var(--border-normal); border-radius: 4px; background: var(--input-background); color: var(--input-text-color);">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" style="font-weight: 500; font-size: 0.85em;">终止AI楼层:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" min="1" placeholder="留空删除到最后" style="width: 100%; padding: 4px 8px; border: 1px solid var(--border-normal); border-radius: 4px; background: var(--input-background); color: var(--input-text-color);">
                                </div>
                            </div>
                            <div style="margin-top: 6px; font-size: 0.8em; color: var(--text-color-dimmed);">
                                默认全选所有AI楼层，可设置范围精确删除（只计算AI回复）
                            </div>
                        </div>

                        <div class="button-group acu-data-mgmt-buttons acu-cols-2" style="margin-top: 10px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-current-local-data" class="btn-warning">删除当前标识本地数据</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-all-local-data" class="btn-danger">删除所有本地数据 (慎用)</button>
                        </div>
                        <div class="button-group" style="margin-top: 20px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer" class="primary acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-table-columns"></i> 打开可视化表格编辑器
                            </button>
                        </div>
                        <p class="notes" style="text-align: center; margin-top: 10px;">点击上方按钮打开全新的可视化界面，支持直接编辑数据、修改表头及更新参数。</p>
                    </div>
                    
                    <div class="acu-card">
                        <h3 style="text-align: center; margin-bottom: 15px;">纪要合并 (Medusa)</h3>
                        <p class="notes" style="text-align: center; margin-bottom: 20px;">将当前的纪要表进行批量合并与精简。</p>

                        <!-- 手动合并参数 -->
                        <div style="background: var(--background-color-light); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--text-color); border-bottom: 1px solid var(--border-normal); padding-bottom: 8px;">手动合并参数</h4>

                            <div class="acu-grid" style="margin-bottom: 10px;">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-merge-target-count" style="font-weight: 500;">合并目标条数:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-merge-target-count" min="1" value="1" placeholder="1">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-merge-batch-size" style="font-weight: 500;">每批处理条数:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-merge-batch-size" min="1" value="5" placeholder="5">
                                </div>
                            </div>

                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-merge-start-index" style="font-weight: 500;">起始条数:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-merge-start-index" min="1" value="1" placeholder="1">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-merge-end-index" style="font-weight: 500;">终止条数:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-merge-end-index" min="1" placeholder="留空处理到最后">
                                </div>
                            </div>
                        </div>

                        <!-- 自动合并设置 -->
                        <div style="background: var(--background-color-light); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--text-color); border-bottom: 1px solid var(--border-normal); padding-bottom: 8px;">自动合并设置</h4>

                            <div style="margin-bottom: 12px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-auto-merge-enabled" style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-auto-merge-enabled" style="width: 14px; height: 14px; margin-right: 8px; cursor: pointer;">
                                    <span style="font-size: 0.9em; font-weight: 500;">开启自动合并纪要</span>
                                </label>
                            </div>

                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-auto-merge-threshold" style="font-weight: 500;">触发楼层数:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-merge-threshold" min="1" value="20" placeholder="20">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-auto-merge-reserve" style="font-weight: 500;">保留楼层数:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-auto-merge-reserve" min="0" value="0" placeholder="0">
                                </div>
                            </div>
                        </div>

                        <!-- 提示词设置 -->
                        <div style="background: var(--background-color-light); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--text-color); border-bottom: 1px solid var(--border-normal); padding-bottom: 8px;">提示词模板</h4>
                            <textarea id="${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template" style="height: 120px; font-size: 0.85em; font-family: monospace; width: 100%; resize: vertical;" placeholder="正在加载提示词模板..."></textarea>
                        </div>

                        <!-- 操作按钮 -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-save-merge-settings" style="padding: 10px; background: var(--button-background); border: 1px solid var(--border-normal); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fa-solid fa-save" style="margin-right: 5px;"></i>保存设置
                            </button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-restore-merge-settings" style="padding: 10px; background: var(--button-secondary-background, #f8f9fa); border: 1px solid var(--border-normal); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fa-solid fa-undo" style="margin-right: 5px;"></i>恢复默认
                            </button>
                        </div>

                        <button id="${SCRIPT_ID_PREFIX_ACU}-start-merge-summary" class="primary" style="width: 100%; padding: 12px; font-size: 1em;">
                            <i class="fa-solid fa-play" style="margin-right: 8px;"></i>开始合并纪要
                        </button>
                    </div>
                </div>

                <div id="acu-tab-import" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>从TXT文件导入</h3>
                        <p class="notes">从外部TXT文件导入内容，按指定字符数分割，并作为独立条目注入指定的世界书。这些条目独立于聊天记录，不会被自动清除。</p>
                        
                        <hr style="border-color: var(--border-normal); margin: 15px 0;">
                        
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target">导入数据注入目标世界书:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                            <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target" style="width: 100%;"></select>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-import-worldbooks" title="刷新世界书列表">刷新</button>
                            </div>
                            <small class="notes">选择导入的数据将被注入到哪个世界书里（独立于常规更新的世界书设置）。<strong>注意：不推荐使用角色卡绑定世界书，建议使用新建的其它世界书。</strong></small>
                        </div>
                        <div class="qrf_settings_block" style="margin-top: 12px; margin-bottom: 12px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-import-prompt-exclude-imported-worldbook-entries"><strong>屏蔽外部导入世界书条目占位符</strong></label>
                            <label class="toggle-switch">
                                <input id="${SCRIPT_ID_PREFIX_ACU}-import-prompt-exclude-imported-worldbook-entries" type="checkbox" />
                                <span class="slider"></span>
                            </label>
                            <small class="notes">仅对外部导入流程生效。开启后，填表提示词中的世界书条目占位符会自动屏蔽所有带有“外部导入-”标签的世界书条目，避免导入流程反复读取既有导入条目。</small>
                        </div>
                        
                        <div class="acu-grid" style="grid-template-columns: 1fr 1fr; align-items: end; gap: 20px; margin-bottom: 10px;">
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-import-split-size">每段字符数:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-import-split-size" min="100" step="100" value="10000">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-save-import-split-size">保存</button>
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-import-encoding">文件编码:</label>
                                <select id="${SCRIPT_ID_PREFIX_ACU}-import-encoding">
                                    <option value="UTF-8">UTF-8 (默认)</option>
                                    <option value="GBK" selected>GBK (简体中文)</option>
                                    <option value="Big5">Big5 (繁体中文)</option>
                                </select>
                            </div>
                        </div>
                        
                        <div id="${SCRIPT_ID_PREFIX_ACU}-import-status" class="notes" style="margin-bottom: 15px; font-weight: bold;">状态：尚未加载文件。</div>

                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-txt-button" class="primary">1. 选择并拆分TXT文件</button>
                        </div>
                        <div style="margin: 10px 0 8px 0; font-weight: 700;">注入表选择（自选表格）</div>
                        <div class="notes" style="margin-bottom:6px;">选择需要写入世界书的表（可多选；未曾选择过则默认全选）。</div>
                        <div class="button-group" style="justify-content:flex-start; gap:8px; margin-bottom:6px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-table-select-all" class="button">全选</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-table-select-none" class="button">全不选</button>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-import-table-selector" style="min-height:60px;">加载表格列表中...</div>

                        <div class="button-group" style="margin-top: 10px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button" disabled>2. 注入（自选表格）</button>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-imported-entries" class="btn-danger">删除注入条目</button>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-clear-imported-cache-button" class="btn-danger" style="font-weight: bold;">清空导入暂存缓存</button>
                        </div>
                        <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-hidden-file-input" style="display: none;" accept=".txt">
                    </div>
                </div>

                <div id="acu-tab-plot" class="acu-tab-content">
                    <div class="acu-card">
                        <!-- 顶部标题和开关区域 -->
                        <div class="acu-plot-header-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border_color);">
                            <div>
                                <h3 style="margin: 0; color: var(--text_primary);">剧情推进设置</h3>
                                <p class="notes" style="margin: 5px 0 0 0;">通过AI预处理用户输入，增强故事叙述质量和剧情连贯性</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-plot-enabled" style="font-weight: 500; cursor: pointer;">启用功能</label>
                                <label class="toggle-switch">
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-enabled" type="checkbox" />
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- 预设管理区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-bookmark"></i> 预设管理
                            </h4>
                            <div class="acu-plot-scope-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start;">
                                <div style="padding: 16px; background: var(--background_default); border-radius: 8px; border: 1px solid var(--border_color_light); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--text_primary);">全局正在使用</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-plot-global-scope-status" class="notes">新聊天会默认继承这里的剧情推进配置</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); font-size: 12px; font-weight: 600;">全局</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-select" style="font-weight: 500;">全局预设</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_PRESET_OPTION_VALUE_ACU}">默认预设</option>
                                        </select>
                                    </div>
                                    <div class="qrf_preset_selector_wrapper acu-plot-preset-wrapper" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-save-preset" class="menu_button" title="覆盖保存到全局预设" style="padding: 8px 12px;"><i class="fa-solid fa-save"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-save-as-new-preset" class="menu_button" title="另存为新的全局预设" style="padding: 8px 12px;"><i class="fa-solid fa-file-export"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-import-presets" class="menu_button" title="导入到全局预设库" style="padding: 8px 12px;"><i class="fa-solid fa-upload"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-export-presets" class="menu_button" title="导出当前全局预设" style="padding: 8px 12px;"><i class="fa-solid fa-download"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-reset-defaults" class="menu_button" title="恢复全局默认提示词" style="padding: 8px 12px; background-color: var(--orange); color: white;"><i class="fa-solid fa-undo"></i></button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-global-delete-preset" class="menu_button" title="删除当前全局选中的预设" style="display: none; padding: 8px 12px; background-color: var(--red);"><i class="fa-solid fa-trash-alt"></i></button>
                                        <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-plot-global-preset-file-input" style="display: none;" accept=".json">
                                    </div>
                                    <small class="notes">全局预设区负责导入、导出、修改与保存；切换这里只会切换全局默认使用的剧情推进预设，不会直接改动当前聊天预设。</small>
                                </div>
                                <div style="padding: 16px; background: var(--background_default); border-radius: 8px; border: 1px solid var(--border_color_light); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--text_primary);">当前聊天正在使用</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-plot-chat-scope-status" class="notes">未单独指定时，这里会直接跟随全局剧情推进预设</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); font-size: 12px; font-weight: 600;">聊天</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-plot-chat-preset-select" style="font-weight: 500;">当前聊天预设</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-plot-chat-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_PRESET_OPTION_VALUE_ACU}">跟随全局</option>
                                        </select>
                                    </div>
                                    <small id="${SCRIPT_ID_PREFIX_ACU}-plot-chat-origin-status" class="notes">当前聊天预设这里只负责切换当前聊天使用的剧情推进预设；导入、导出、保存与修改统一在全局预设侧处理。</small>
                                </div>
                            </div>
                            <div class="qrf_settings_block" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border_color_light);">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select" style="font-weight: 500;">剧情推进API预设</label>
                                <select id="${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                    <option value="">使用当前API配置</option>
                                </select>
                                <small class="notes">这里控制剧情推进调用时使用的API配置；剧情推进预设本身则分为全局与当前聊天两条作用域链路。</small>
                            </div>
                        </div>

                        <!-- 提示词设置区域（独立提示词组） -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-edit"></i> 提示词设置
                            </h4>
                            <div style="margin-bottom: 15px; padding: 12px; background: var(--background_default); border-radius: 6px; border-left: 3px solid var(--text_secondary);">
                                <small class="notes" style="color: var(--text_secondary);">
                                    <strong>占位符说明：</strong><br>
                                    <code>$1</code> - 自动替换为世界书内容（默认开启）<br>
                                    <code>$6</code> - 自动替换为上一轮保存的剧情规划数据<br>
                                    <code>$5</code> - 自动替换为“总体大纲”表内容（含表头）<br>
                                    <code>$7</code> - 自动替换为本次实际读取的前文上下文（仅包含历史AI输出，不含任何用户输入）<br>
                                    <code>$8</code> - 自动替换为本轮用户输入（可自由放置）<br>
                                    <code>{{标签名}}</code> - 在剧情任务提示词与最终注入指令中插入标签块内容<br>
                                    <code>sulv1-4</code> - 剧情推进速率设置<br>
                                    <code>zhaohui</code> - 记忆召回数量
                                </small>
                            </div>
                            <div class="acu-plot-task-layout" style="display:grid; grid-template-columns: minmax(240px, 280px) minmax(0, 1fr); gap:16px; align-items:start; margin-bottom:15px;">
                                <div style="padding:12px; background:var(--background_default); border-radius:8px; border:1px solid var(--border_color_light);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
                                        <label style="font-weight:600; margin:0;">剧情任务列表</label>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-add" class="button" style="padding:4px 10px;">新增</button>
                                    </div>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-task-list"></div>
                                    <div class="button-group" style="justify-content:flex-start; gap:8px; margin-top:10px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-move-up" class="button">上移</button>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-move-down" class="button">下移</button>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-task-delete" class="button" style="background:var(--red); color:#fff;">删除</button>
                                    </div>
                                    <small class="notes" style="display:block; margin-top:10px;">每个任务都有独立提示词、独立标签摘取与独立重试次数；任务按阶段号执行：同阶段并发，不同阶段按编号顺序串行。</small>
                                </div>
                                <div style="padding:12px; background:var(--background_default); border-radius:8px; border:1px solid var(--border_color_light);">
                                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:15px;">
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-name" style="font-weight:500;">当前任务名称</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-name" type="text" class="text_pole" placeholder="例如：记忆召回任务" style="width:100%;">
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-enabled" style="font-weight:500; margin:0;">启用当前任务</label>
                                            <label class="toggle-switch" style="margin:0;">
                                                <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-enabled" type="checkbox" />
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-stage" style="font-weight:500;">当前任务阶段号</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-stage" type="number" class="text_pole" min="1" step="1" value="1" style="width:100%;">
                                            <small class="notes">相同阶段并发，不同阶段按编号顺序串行</small>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-task-max-retries" style="font-weight:500;">当前任务最大重试</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-task-max-retries" type="number" class="text_pole" min="1" step="1" value="3" style="width:100%;">
                                        </div>
                                    </div>
                                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:15px;">
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-extract-tags" style="font-weight:500;">当前任务标签摘取</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-extract-tags" type="text" class="text_pole" placeholder="例如: recall,supplement" style="width:100%;">
                                            <small class="notes">仅作用于当前选中的剧情任务</small>
                                        </div>
                                        <div class="qrf_settings_block" style="margin-bottom:0;">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-plot-min-length" style="font-weight:500;">当前任务最小回复长度</label>
                                            <input id="${SCRIPT_ID_PREFIX_ACU}-plot-min-length" type="number" class="text_pole" min="0" max="2000" step="10" value="0" style="width:100%;">
                                            <small class="notes">当前任务回复少于此长度时自动重试</small>
                                        </div>
                                    </div>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-prompt-constructor-area">
                                        <div class="button-group" style="margin-bottom: 10px; justify-content: center;">
                                            <button class="${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt-segment-btn" data-position="top" title="在上方添加对话轮次">+</button>
                                        </div>
                                        <div id="${SCRIPT_ID_PREFIX_ACU}-plot-prompt-segments-container">
                                            <!-- Plot segments will be dynamically inserted here -->
                                        </div>
                                        <div class="button-group" style="margin-top: 10px; justify-content: center;">
                                            <button class="${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt-segment-btn" data-position="bottom" title="在下方添加对话轮次">+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="qrf_settings_block" style="margin-top: 15px; margin-bottom: 0;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-plot-final-directive" style="font-weight: 500;">最终注入指令</label>
                                <textarea id="${SCRIPT_ID_PREFIX_ACU}-plot-final-directive" class="text_pole" rows="3" placeholder="输入最终注入指令" style="resize: vertical;"></textarea>
                                <small class="notes">这段内容不会发给“剧情规划API”，只会注入给主AI。你可以用 <code>$8</code> 自行决定是否/放置位置。</small>
                            </div>
                        </div>


                        <!-- 匹配替换设置区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-right-left"></i> 匹配替换
                            </h4>
                            <small class="notes" style="display: block; margin-bottom: 15px; color: var(--text_secondary);">
                                在发送前，将下方设置的数值替换掉提示词中的占位符（sulv1-4、zhaohui）
                            </small>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-main" style="font-weight: 500;">主线剧情推进速率</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-main" type="number" class="text_pole" step="0.05" value="1.0" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">占位符: sulv1</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-personal" style="font-weight: 500;">个人线推进速率</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-personal" type="number" class="text_pole" step="0.05" value="1.0" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">占位符: sulv2</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-erotic" style="font-weight: 500;">色情事件推进速率</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-erotic" type="number" class="text_pole" step="0.05" value="0" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">占位符: sulv3</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-rate-cuckold" style="font-weight: 500;">绿帽线推进速率</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-rate-cuckold" type="number" class="text_pole" step="0.05" value="1.0" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">占位符: sulv4</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-recall-count" style="font-weight: 500;">记忆召回数量</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-recall-count" type="number" class="text_pole" step="1" min="1" value="20" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">占位符: zhaohui</small>
                                </div>
                            </div>
                        </div>

                        <!-- 自动循环设置区域 -->
                        <div class="settings-section" style="padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-sync-alt"></i> 自动循环生成
                            </h4>

                            <div style="display: grid; gap: 15px; margin-bottom: 20px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <label style="font-weight: 500; margin: 0;">循环提示词列表</label>
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-add-prompt" class="button" style="padding: 4px 12px; font-size: 0.85em; display: flex; align-items: center; gap: 4px;">
                                            <i class="fa-solid fa-plus"></i> 添加提示词
                                        </button>
                                    </div>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-prompts-container" style="display: grid; gap: 10px;">
                                        <!-- 提示词项将动态添加到这里 -->
                                    </div>
                                    <small class="notes">可以添加多个提示词，循环时会自动依次使用，增加剧情变化</small>
                                </div>

                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-loop-tags" style="font-weight: 500;">标签验证</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-loop-tags" type="text" class="text_pole" placeholder="例如: content, thinking" style="width: 100%;">
                                    <small class="notes">输入必须存在于AI回复中的标签，多个标签用逗号分隔。缺少任意标签将重试</small>
                                </div>
                            </div>

                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 20px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-loop-delay" style="font-weight: 500;">循环延时</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-loop-delay" type="number" class="text_pole" min="0" step="1" value="5" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">秒</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-loop-total-duration" style="font-weight: 500;">总时长</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-loop-total-duration" type="number" class="text_pole" min="0" step="1" value="0" placeholder="60" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">分钟</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-max-retries" style="font-weight: 500;">自动循环失败上限</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-max-retries" type="number" class="text_pole" min="0" step="1" value="3" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">仅用于自动循环流程，不影响单个任务的 API 重试次数</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-context-turn-count" style="font-weight: 500;">AI上下文</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-plot-context-turn-count" type="number" class="text_pole" min="0" max="20" step="1" value="3" style="width: 100%;">
                                    <small class="notes" style="color: var(--text_secondary);">AI输出楼层数（仅计算AI回复，不含用户输入）</small>
                                </div>
                            </div>

                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 15px; margin-bottom: 25px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label style="font-weight: 500;">正文标签提取规则</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-context-extract-add-rule" class="button" style="margin-top: 6px;">添加规则</button>
                                    <small class="notes">作用于剧情上下文过滤，不区分任务；每条规则填写开始词和结束词，仅提取最后一组匹配内容</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label style="font-weight: 500;">标签排除规则</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-plot-context-exclude-add-rule" class="button" style="margin-top: 6px;">添加规则</button>
                                    <small class="notes">作用于剧情上下文过滤，不区分任务；仅移除最后一组匹配内容（可与“正文标签提取”叠加）</small>
                                </div>
                            </div>

                            <!-- [新增] 剧情推进世界书选择（与填表世界书选择互不干扰；UI风格与“世界书设置”页一致） -->
                            <div class="qrf_settings_block" style="margin: 10px 0 18px 0; padding-top: 15px; border-top: 1px dashed var(--border_color_light);">
                                <label style="font-weight: 600; display:flex; align-items:center; gap:8px;">
                                    <i class="fa-solid fa-book"></i> 剧情推进世界书选择（独立）
                                </label>
                                <small class="notes">仅影响“剧情推进”，不会影响“填表/读取世界书”的选择。</small>

                                <div class="qrf_settings_block_radio" style="margin-top: 10px;">
                                    <label>世界书来源 (用于剧情推进读取上下文):</label>
                                    <div class="qrf_radio_group">
                                        <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source-character" name="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source" value="character" checked>
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source-character">角色卡绑定</label>
                                        <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source-manual" name="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source" value="manual">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-source-manual">手动选择</label>
                                    </div>
                                </div>

                                <div id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-manual-select-block" style="display: none; margin-top: 10px;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select">选择世界书 (可多选):</label>
                                    <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                                    <div class="input-group">
                                        <div id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select" class="qrf_worldbook_list"></div>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-plot-refresh-worldbooks" title="刷新世界书列表">刷新</button>
                                    </div>
                                </div>

                                <div style="margin-top: 15px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                        <label style="margin-bottom: 0;">启用的世界书条目:</label>
                                        <div class="button-group" style="margin: 0;">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-select-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">全选</button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-deselect-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">全不选</button>
                                        </div>
                                    </div>
                                    <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-entry-filter" placeholder="筛选条目/世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-plot-worldbook-entry-list" class="qrf_worldbook_entry_list">
                                        <!-- 条目将动态加载于此 -->
                                    </div>
                                </div>
                            </div>

                            <!-- 循环控制区域 -->
                            <div style="border-top: 1px solid var(--border_color_light); padding-top: 20px;">
                                <div id="${SCRIPT_ID_PREFIX_ACU}-plot-loop-status-indicator" style="text-align: center; margin-bottom: 15px; padding: 10px; background: var(--background_default); border-radius: 6px; border: 1px solid var(--border_color_light);">
                                    <div style="font-weight: 600; color: var(--text_primary); margin-bottom: 5px;">循环状态</div>
                                    <div style="color: var(--text_secondary);">
                                        <span id="${SCRIPT_ID_PREFIX_ACU}-plot-loop-status-text">未运行</span>
                                        <span id="${SCRIPT_ID_PREFIX_ACU}-plot-loop-timer-display" style="display:none; margin-left: 10px; color: var(--text_tertiary);"></span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-plot-start-loop-btn" class="menu_button" style="padding: 12px 25px; background: var(--green); color: white; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 140px; display: inline-flex; align-items: center; gap: 8px; justify-content: center;">
                                        <i class="fas fa-play"></i> 开始循环
                                    </button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-plot-stop-loop-btn" class="menu_button" style="display: none; padding: 12px 25px; background: var(--red); color: white; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 140px; display: inline-flex; align-items: center; gap: 8px; justify-content: center;">
                                        <i class="fas fa-stop"></i> 停止循环
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 正文替换Tab -->
                <div id="acu-tab-optimization" class="acu-tab-content">
                    <div class="acu-card">
                        <!-- 顶部标题和开关区域 -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border_color);">
                            <div>
                                <h3 style="margin: 0; color: var(--text_primary);">正文替换设置</h3>
                                <p class="notes" style="margin: 5px 0 0 0;">AI生成正文后，自动替换内容（在填表之前执行）</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-enabled" style="font-weight: 500; cursor: pointer;">启用功能</label>
                                <label class="toggle-switch">
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-enabled" type="checkbox" />
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- 基础设置区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-cog"></i> 基础设置
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset" style="font-weight: 500;">API预设</label>
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset" class="text_pole" style="width: 100%; margin-top: 5px;">
                                        <option value="">使用当前API配置</option>
                                    </select>
                                    <small class="notes">选择正文替换使用的API配置，留空则使用酒馆当前API</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-min-length" style="font-weight: 500;">最小优化长度</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-min-length" type="number" class="text_pole" min="0" step="10" value="100" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">正文长度小于此值时跳过优化</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-max-items" style="font-weight: 500;">最大优化项数</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-max-items" type="number" class="text_pole" min="1" max="100" step="1" value="10" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">单次优化的最大修改项数（1-100）</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count" style="font-weight: 500;">循环优化次数</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count" type="number" class="text_pole" min="1" max="10" step="1" value="1" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">优化完成后再次优化，达到完整优化效果（1-10次）</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count" style="font-weight: 500;">自动重试次数</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count" type="number" class="text_pole" min="1" max="10" step="1" value="3" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">API调用失败时自动重试（1-10次，默认3次）</small>
                                </div>
                            </div>
                        </div>

                        <!-- 优化模式设置 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-magic"></i> 优化模式
                            </h4>
                            <div style="display: grid; gap: 15px;">
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode">无感替换模式</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">显示"正在优化"遮罩，优化完成后直接显示结果，无闪烁</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply">自动应用优化结果</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">关闭时显示对比对话框，让用户选择是否应用</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff">显示优化对比</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">优化完成后显示修改摘要（非无感模式下有效）</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode">填表与正文替换并行执行</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">勾选后填表不再等待正文替换完成，双方并行进行（默认关闭）</small>
                                </div>
                                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border_color_light);">
                                    <label style="font-weight: 500; display: block; margin-bottom: 8px;">快捷操作</label>
                                    <div style="display: flex; flex-direction: column; gap: 8px; align-items: stretch;">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reoptimize-latest" class="menu_button" title="对最近一次已执行正文替换的 AI 回复，基于替换前原文重新优化并再次替换" style="width: 100%; min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: normal; line-height: 1.4; text-align: center; padding: 10px 14px;">
                                            <i class="fa-solid fa-rotate-right"></i><span>重新优化上一次替换结果</span>
                                        </button>
                                    </div>
                                    <small class="notes" style="display: block; margin-top: 6px; line-height: 1.5;">这里会定位“最近一次已经被正文替换过的 AI 回复”，并使用替换前保留的原文重新优化后再次替换。取消正文优化请使用进行中提示框里的“取消优化”按钮。</small>
                                </div>
                            </div>
                        </div>
 
                        <!-- 标签筛选设置 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-filter"></i> 标签筛选
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags" style="font-weight: 500;">标签提取</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags" type="text" class="text_pole" placeholder="例如: think,plot" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">仅提取指定标签内的内容进行优化</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label style="font-weight: 500;">正文标签提取规则</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-add-rule" class="button" style="margin-top: 6px;">添加规则</button>
                                    <small class="notes">每条规则填写开始词和结束词，仅提取最后一组匹配内容</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label style="font-weight: 500;">标签排除规则</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-add-rule" class="button" style="margin-top: 6px;">添加规则</button>
                                    <small class="notes">每条规则填写开始词和结束词，仅移除最后一组匹配内容</small>
                                </div>
                            </div>
                        </div>

                        <!-- 预设管理区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-bookmark"></i> 预设管理
                            </h4>
                            <div class="qrf_settings_block" style="margin-bottom: 0;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select" style="font-weight: 500;">选择预设</label>
                                <div class="qrf_preset_selector_wrapper acu-optimization-preset-wrapper" style="display: flex; gap: 8px; align-items: center; margin-top: 5px;">
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select" class="text_pole" style="flex: 1;">
                                        <option value="">-- 选择一个预设 --</option>
                                    </select>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-preset" class="menu_button" title="覆盖保存当前预设" style="padding: 8px 12px;"><i class="fa-solid fa-save"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-as-new-preset" class="menu_button" title="另存为新预设" style="padding: 8px 12px;"><i class="fa-solid fa-file-export"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-import-presets" class="menu_button" title="导入预设" style="padding: 8px 12px;"><i class="fa-solid fa-upload"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-export-presets" class="menu_button" title="导出当前预设" style="padding: 8px 12px;"><i class="fa-solid fa-download"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reset-defaults" class="menu_button" title="恢复默认提示词" style="padding: 8px 12px; background-color: var(--orange); color: white;"><i class="fa-solid fa-undo"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-delete-preset" class="menu_button" title="删除当前选中的预设" style="display: none; padding: 8px 12px; background-color: var(--red);"><i class="fa-solid fa-trash-alt"></i></button>
                                    <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-file-input" style="display: none;" accept=".json">
                                </div>
                                <small class="notes">选择预设应用提示词组设置，或保存当前配置为新预设</small>
                            </div>
                        </div>

                        <!-- 提示词设置区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-edit"></i> 优化提示词
                            </h4>
                            <div style="margin-bottom: 15px; padding: 12px; background: var(--background_default); border-radius: 6px; border-left: 3px solid var(--text_secondary);">
                                <small class="notes" style="color: var(--text_secondary);">
                                    <strong>占位符说明：</strong><br>
                                    <code>$CONTENT</code> - 自动替换为需要优化的正文内容<br>
                                    <code>$1</code> - 世界书内容（剧情推进专用）<br>
                                    <code>$5</code> - 纪要表/总体大纲表内容<br>
                                    <code>$6</code> - 上一轮剧情规划数据<br>
                                    <code>$7</code> - 前文上下文（仅AI输出）<br>
                                    <code>$8</code> - 本轮用户输入<br>
                                    <code>$U</code> - 用户设定描述 (persona_description)<br>
                                    <code>$C</code> - 角色描述 (char_description)<br>
                                    <strong>输出格式：</strong>AI需返回JSON格式的优化指令，包含 optimizations 数组
                                </small>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-prompt-constructor-area">
                                <div class="button-group" style="margin-bottom: 10px; justify-content: center;">
                                    <button class="${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn" data-position="top" title="在上方添加对话轮次">+</button>
                                </div>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-prompt-segments-container">
                                    <!-- 优化提示词段将动态插入这里 -->
                                </div>
                                <div class="button-group" style="margin-top: 10px; justify-content: center;">
                                    <button class="${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn" data-position="bottom" title="在下方添加对话轮次">+</button>
                                </div>
                            </div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-prompt-group" class="primary">保存提示词组</button>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reset-prompt-group">恢复默认提示词组</button>
                            </div>
                        </div>

                        <!-- 手动测试区域 -->
                        <div class="settings-section" style="padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-flask"></i> 手动测试
                            </h4>
                            <div class="qrf_settings_block" style="margin-bottom: 15px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-test-input" style="font-weight: 500;">测试文本</label>
                                <textarea id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-input" class="text_pole" rows="5" placeholder="输入需要优化的文本进行测试..." style="resize: vertical; margin-top: 5px;"></textarea>
                            </div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-btn" class="primary">执行优化测试</button>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-result" style="margin-top: 15px; display: none;">
                                <label style="font-weight: 500;">优化结果</label>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-output" style="margin-top: 8px; padding: 12px; background: var(--background_default); border-radius: 6px; border: 1px solid var(--border_color_light); max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-size: 0.9em;"></div>
                            </div>
                        </div>
                    </div>
                </div>

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
      onReady: async ($window) => {
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
