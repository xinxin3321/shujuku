import { renderVisualizerMain_ACU, saveVisualizerChanges_ACU } from './visualizer-main';
import { renderVisualizerSidebar_ACU } from './visualizer-sidebar';
import { showToastr_ACU } from '../theme/toast';
import { toggleACUTheme_ACU } from '../window/window-styles';
import { closeACUWindow, createACUWindow, ACU_WindowManager } from '../window/window-system';
import { currentJsonTableData_ACU , _set_currentJsonTableData_ACU, jQuery_API_ACU} from '../../service/runtime/state-manager';
import { getSortedSheetKeys_ACU, reorderDataBySheetKeys_ACU } from '../../service/template/chat-scope';
import { loadAllChatMessages_ACU } from '../../service/worldbook/pipeline';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';
import { getActiveTemplatePresetMeta_ACU } from '../../service/template/template-preset-service';
import { mergeAllIndependentTables_ACU } from '../../service/runtime/helpers-remaining';
// visualizer.ts
// 从 06_visualizer.js 整体迁入

  export const VISUALIZER_CSS_ACU = `
    /* ═══════════════════════════════════════════════════════════════
       墨韵清雅 - 可视化编辑器
       与主面板保持一致的设计语言
       ═══════════════════════════════════════════════════════════════ */
    
    /* 仅在可视化编辑器内定义主题变量，避免污染页面其它区域 */
    /* 墨纸主题（默认暗色） */
    #acu-visualizer-content {
        --vis-bg-color: #24221f;
        --vis-border-color: #36332e;
        --vis-text-main: #c1b9ad;
        --vis-text-dim: #9e978e;
        --vis-text-mute: #645e55;
        --vis-accent: #7d4940;
        --vis-accent-dim: #8f5a4e;
        --vis-accent-glow: rgba(125, 73, 64, 0.16);
        --vis-bg-hover: #2a2824;
        --vis-bg-stats: #211f1c;
        --vis-bg-light: rgba(193, 185, 173, 0.04);
        
        --vis-font-serif: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
        
        background-color: var(--vis-bg-color);
        background-image:
          url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        display: flex;
        flex-direction: column;
        font-family: var(--vis-font-serif);
        color: var(--vis-text-main);
    }
    
    /* 素纱主题（浅色） */
    body.acu-theme-silk #acu-visualizer-content {
        --vis-bg-color: #f4f1eb;
        --vis-border-color: #e0dacb;
        --vis-text-main: #4a453f;
        --vis-text-dim: #6e675e;
        --vis-text-mute: #9e978e;
        --vis-accent: #8a6b5e;
        --vis-accent-dim: #9d7c6f;
        --vis-accent-glow: rgba(138, 107, 94, 0.14);
        --vis-bg-hover: #ebe7de;
        --vis-bg-stats: #f9f8f5;
        --vis-bg-light: rgba(255, 255, 255, 0.58);
    }

    /* ✅ 可视化编辑器复选框：古典风格（仅限 #acu-visualizer-content 作用域） */
    #acu-visualizer-content input[type="checkbox"] {
        -webkit-appearance: none;
        appearance: none;
        accent-color: initial;
        width: 16px;
        height: 16px;
        min-width: 16px;
        min-height: 16px;
        border-radius: 1px;
        border: 1px solid var(--vis-border-color);
        background-color: var(--vis-bg-color);
        background-image: none;
        background-repeat: no-repeat;
        background-position: center;
        background-size: 10px 8px;
        margin: 0;
        cursor: pointer;
        vertical-align: middle;
        transition: all 0.2s ease;
    }
    #acu-visualizer-content input[type="checkbox"]::before,
    #acu-visualizer-content input[type="checkbox"]::after {
        content: none;
        display: none;
    }
    #acu-visualizer-content input[type="checkbox"]:checked {
        background-color: var(--vis-accent);
        border-color: var(--vis-accent);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 10'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M1 5l3 3 7-7'/%3E%3C/svg%3E");
    }
    #acu-visualizer-content input[type="checkbox"]:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
    #acu-visualizer-content input[type="checkbox"]:focus-visible {
        outline: 2px solid var(--vis-accent-glow);
        outline-offset: 2px;
    }
    
    /* ═══ 顶部标题栏 ═══ */
    .acu-vis-header {
        flex: 0 0 56px;
        background: transparent;
        border-bottom: 1px solid var(--vis-border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 24px;
    }
    
    .acu-vis-title {
        font-family: var(--vis-font-serif);
        font-size: 16px;
        font-weight: normal;
        color: var(--vis-text-main);
        letter-spacing: 3px;
    }
    .acu-vis-title i {
        color: var(--vis-accent);
        margin-right: 12px;
    }
    
    .acu-vis-actions { display: flex; gap: 10px; }
    .acu-vis-content { flex: 1; display: flex; overflow: hidden; }
    
    /* ═══ 侧边栏 ═══ */
    .acu-vis-sidebar {
        flex: 0 0 340px; /* 增大侧边栏宽度以显示更长的表格名 */
        min-width: 280px;
        max-width: 400px;
        background: var(--vis-bg-stats);
        border-right: 1px solid var(--vis-border-color);
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    
    .acu-vis-sidebar::before {
        content: '表格列表';
        display: block;
        font-size: 11px;
        color: var(--vis-text-mute);
        letter-spacing: 2px;
        padding: 8px 12px 16px;
        border-bottom: 1px solid var(--vis-border-color);
        margin-bottom: 8px;
    }
    
    /* ═══ 主内容区 ═══ */
    .acu-vis-main {
        flex: 1;
        background: var(--vis-bg-color);
        background-image:
          url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        color: var(--vis-text-main);
        overflow-y: auto;
        padding: 24px;
    }
    
    /* ═══ 表格导航项 ═══ */
    .acu-table-nav-item {
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 2px;
        color: var(--vis-text-dim);
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        width: 100%; /* 确保导航项占满侧边栏宽度 */
        box-sizing: border-box;
        position: relative;
        padding-left: 20px;
    }
    
    /* 古典竖线装饰 */
    .acu-table-nav-item::before {
        content: '';
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 1px;
        height: 60%;
        background-color: var(--vis-border-color);
        transition: background-color 0.2s ease;
    }
    
    .acu-table-nav-item:hover {
        background: var(--vis-bg-hover);
        color: var(--vis-text-main);
    }
    
    .acu-table-nav-item:hover::before {
        background-color: var(--vis-accent);
    }
    
    .acu-table-nav-item.active {
        background: rgba(125, 73, 64, 0.10);
        color: var(--vis-accent);
    }
    
    .acu-table-nav-item.active::before {
        background-color: var(--vis-accent);
    }
    
    .acu-table-nav-item i { width: 20px; text-align: center; color: var(--vis-text-mute); }
    .acu-table-nav-item.active i { color: var(--vis-accent); }

    .acu-table-nav-content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 0; /* 使用 flex-basis: 0 确保能正确伸展填满 */
        min-width: 0; /* 允许 flex 子项收缩 */
        width: 0; /* 配合 flex: 1 确保能正确计算宽度 */
    }
    
    .acu-table-index {
        flex-shrink: 0;
        min-width: 28px;
        text-align: center;
        font-size: 11px;
        opacity: 0.5;
        font-family: var(--vis-font-serif);
        letter-spacing: 1px;
    }
    
    .acu-table-name {
        /* 表格名称：优先完整显示，超长时省略 */
        flex: 1 1 0; /* 使用 flex-basis: 0 确保正确伸展 */
        min-width: 0;
        width: 0; /* 配合 flex 确保能正确计算宽度并省略 */
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.4;
    }
    
    .acu-table-nav-actions {
        display: flex;
        gap: 2px;
        opacity: 0;
        transition: opacity 0.15s;
        flex-shrink: 0; /* 防止按钮被压缩 */
        margin-left: auto; /* 使用 auto margin 将按钮推到最右边 */
        padding-left: 6px; /* 与内容保持间距 */
    }
    
    .acu-table-nav-item:hover .acu-table-nav-actions {
        opacity: 1;
    }
    
    .acu-table-nav-item.active .acu-table-nav-actions {
        opacity: 0.7; /* 选中项也显示操作按钮 */
    }
    
    .acu-table-order-btn {
        background: transparent;
        border: 1px solid var(--vis-border-color);
        color: var(--vis-text-mute);
        width: 22px;
        height: 22px;
        border-radius: 1px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
        font-size: 10px;
    }
    
    .acu-table-order-btn:hover {
        background: rgba(125, 73, 64, 0.12);
        border-color: var(--vis-accent);
        color: var(--vis-accent);
    }
    
    .acu-table-order-btn:disabled {
        opacity: 0.25;
        cursor: not-allowed;
    }

    /* ═══ 按钮 ═══ */
    .acu-btn-primary {
        background: rgba(125, 73, 64, 0.12);
        color: var(--vis-accent);
        border: 1px solid var(--vis-accent);
        padding: 10px 20px;
        border-radius: 1px;
        cursor: pointer;
        font-family: var(--vis-font-serif);
        font-size: 12px;
        letter-spacing: 1px;
        transition: all 0.2s ease;
    }
    .acu-btn-primary:hover {
        background: rgba(125, 73, 64, 0.18);
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }

    /* 小按钮样式优化 */
    #acu-visualizer-content .acu-btn-small {
        padding: 6px 12px;
        font-size: 11px;
        min-width: auto;
        height: 32px;
        letter-spacing: 1px;
    }
    
    .acu-btn-secondary {
        background: transparent;
        color: var(--vis-text-dim);
        border: 1px solid var(--vis-border-color);
        padding: 10px 20px;
        border-radius: 1px;
        cursor: pointer;
        font-family: var(--vis-font-serif);
        font-size: 12px;
        letter-spacing: 1px;
        transition: all 0.2s ease;
    }
    .acu-btn-secondary:hover {
        color: var(--vis-text-main);
        border-color: var(--vis-text-mute);
        background: var(--vis-bg-hover);
    }

    /* ═══ 数据卡片 ═══ */
    .acu-card-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-content: flex-start;
    }
    
    .acu-data-card {
        background: var(--vis-bg-light);
        border-radius: 2px;
        box-shadow: none;
        width: 300px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--vis-border-color);
        transition: border-color 0.2s ease;
    }
    
    .acu-data-card:hover {
        border-color: var(--vis-accent);
    }
    
    .acu-card-header {
        padding: 12px 16px;
        background: var(--vis-bg-stats);
        border-bottom: 1px solid var(--vis-border-color);
        font-weight: normal;
        font-size: 13px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--vis-text-main);
        letter-spacing: 1px;
    }
    
    .acu-card-body {
        padding: 14px 16px;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        line-height: 1.8;
        color: var(--vis-text-dim);
    }
    
    .acu-field-row { display: flex; flex-direction: column; gap: 4px; }
    
    .acu-field-label {
        font-size: 10px;
        color: var(--vis-text-mute);
        font-weight: normal;
        letter-spacing: 1px;
    }
    
    .acu-field-value {
        padding: 8px 10px;
        border: 1px solid transparent;
        border-radius: 1px;
        min-height: 20px;
        word-break: break-word;
        white-space: pre-wrap;
        background: var(--vis-bg-color);
        transition: all 0.15s ease;
    }
    .acu-field-value:hover {
        background: var(--vis-bg-hover);
        border-color: var(--vis-border-color);
        cursor: text;
    }
    .acu-field-value:focus {
        background: var(--vis-bg-color);
        border-color: var(--vis-accent);
        outline: none;
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }

    /* ═══ 配置面板 ═══ */
    .acu-config-panel {
        background: var(--vis-bg-light);
        padding: 24px;
        border-radius: 2px;
        box-shadow: none;
        max-width: 800px;
        margin: 0 auto;
        border: 1px solid var(--vis-border-color);
    }
    
    .acu-config-section {
        margin-bottom: 24px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--vis-border-color);
    }
    
    .acu-config-section:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
    }
    
    .acu-config-section h4 {
        margin: 0 0 16px 0;
        color: var(--vis-text-main);
        font-family: var(--vis-font-serif);
        font-size: 14px;
        font-weight: normal;
        letter-spacing: 2px;
    }
    
    .acu-form-group { margin-bottom: 16px; }
    
    .acu-form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: normal;
        color: var(--vis-text-dim);
        font-size: 12px;
        letter-spacing: 1px;
    }
    
    .acu-form-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--vis-border-color);
        border-radius: 1px;
        box-sizing: border-box;
        font-family: var(--vis-font-serif);
        font-size: 14px;
        background: var(--vis-bg-color);
        color: var(--vis-text-main);
        transition: border-color 0.15s, box-shadow 0.15s;
    }
    
    .acu-form-input:focus {
        outline: none;
        border-color: var(--vis-accent);
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }
    
    .acu-form-textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--vis-border-color);
        border-radius: 1px;
        box-sizing: border-box;
        min-height: 100px;
        resize: vertical;
        font-family: var(--vis-font-serif);
        font-size: 14px;
        background: var(--vis-bg-color);
        color: var(--vis-text-main);
        line-height: 1.8;
    }
    
    .acu-form-textarea:focus {
        outline: none;
        border-color: var(--vis-accent);
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }
    
    .acu-hint {
        font-size: 11px;
        color: var(--vis-text-mute);
        margin-top: 4px;
        letter-spacing: 0.5px;
    }
    
    /* ═══ 模式切换 ═══ */
    .acu-mode-switch {
        display: flex;
        background: var(--vis-bg-stats);
        border-radius: 2px;
        padding: 3px;
        margin-right: 12px;
        border: 1px solid var(--vis-border-color);
    }
    
    .acu-mode-btn {
        padding: 6px 16px;
        border-radius: 1px;
        cursor: pointer;
        color: var(--vis-text-mute);
        font-size: 12px;
        font-family: var(--vis-font-serif);
        border: none;
        background: transparent;
        transition: all 0.2s ease;
        letter-spacing: 1px;
    }
    .acu-mode-btn:hover {
        color: var(--vis-text-main);
        background: var(--vis-bg-hover);
    }
    .acu-mode-btn.active {
        background: rgba(125, 73, 64, 0.12);
        color: var(--vis-accent);
    }

    /* ═══ 列编辑器 ═══ */
    .acu-col-list { display: flex; flex-direction: column; gap: 6px; }

    /* ═══ 表格锁定（仅 updateRow 生效） ═══ */
    .acu-lock-btn {
        border: 1px solid var(--vis-border-color);
        background: transparent;
        color: var(--vis-text-mute);
        border-radius: 1px;
        padding: 2px 6px;
        font-size: 11px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
        font-family: var(--vis-font-serif);
    }
    .acu-lock-btn:hover {
        border-color: var(--vis-accent);
        color: var(--vis-accent);
    }
    .acu-lock-btn.active {
        border-color: var(--vis-accent);
        background: rgba(125, 73, 64, 0.12);
        color: var(--vis-accent);
    }
    .acu-lock-btn.special {
        border-color: var(--vis-accent);
        background: rgba(125, 73, 64, 0.08);
        color: var(--vis-accent-dim);
    }
    .acu-field-value-wrap { display: flex; align-items: center; gap: 6px; }
    .acu-field-value { flex: 1; min-width: 0; }
    .acu-field-row.acu-locked-field .acu-field-value {
        background: rgba(125, 73, 64, 0.06);
        border-color: rgba(125, 73, 64, 0.20);
        opacity: 0.85;
    }
    
    .acu-col-item {
        display: flex;
        gap: 8px;
        align-items: center;
        background: var(--vis-bg-stats);
        padding: 8px 10px;
        border-radius: 1px;
        border: 1px solid var(--vis-border-color);
    }
    
    .acu-col-input {
        flex: 1;
        padding: 8px 10px;
        border: 1px solid var(--vis-border-color);
        border-radius: 1px;
        font-family: var(--vis-font-serif);
        background: var(--vis-bg-color);
        font-size: 13px;
        color: var(--vis-text-main);
        transition: border-color 0.15s ease;
    }
    
    .acu-col-input:focus {
        outline: none;
        border-color: var(--vis-accent);
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }
    
    .acu-col-btn {
        padding: 6px 10px;
        cursor: pointer;
        border: 1px solid var(--vis-border-color);
        border-radius: 1px;
        background: transparent;
        color: var(--vis-text-mute);
        transition: all 0.15s ease;
        font-size: 11px;
        font-family: var(--vis-font-serif);
    }
    
    .acu-col-btn:hover {
        background: rgba(125, 73, 64, 0.12);
        border-color: var(--vis-accent);
        color: var(--vis-accent);
    }
    
    /* ═══ 滚动条 ═══ */
    .acu-vis-sidebar::-webkit-scrollbar,
    .acu-vis-main::-webkit-scrollbar {
        width: 4px;
    }
    
    .acu-vis-sidebar::-webkit-scrollbar-track,
    .acu-vis-main::-webkit-scrollbar-track {
        background: transparent;
    }
    
    .acu-vis-sidebar::-webkit-scrollbar-thumb,
    .acu-vis-main::-webkit-scrollbar-thumb {
        background: var(--vis-border-color);
        border-radius: 1px;
    }
    
    .acu-vis-sidebar::-webkit-scrollbar-thumb:hover,
    .acu-vis-main::-webkit-scrollbar-thumb:hover {
        background: var(--vis-text-mute);
    }
    
    /* ═══ 新增表格按钮 ═══ */
    .acu-add-table-btn {
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 1px;
        color: var(--vis-text-mute);
        background: transparent;
        border: 1px dashed var(--vis-border-color);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.2s ease;
        font-family: var(--vis-font-serif);
        font-size: 12px;
        margin-top: 8px;
        letter-spacing: 1px;
    }
    
    .acu-add-table-btn:hover {
        background: var(--vis-bg-hover);
        border-color: var(--vis-accent);
        border-style: solid;
        color: var(--vis-accent);
    }
    
    /* ═══ 删除表格按钮 ═══ */
    .acu-vis-del-table-btn {
        background: transparent;
        border: none;
        color: var(--vis-text-mute);
        opacity: 0.5;
        cursor: pointer;
        padding: 4px;
        transition: all 0.15s ease;
        font-size: 12px;
    }
    
    .acu-vis-del-table-btn:hover {
        opacity: 1;
        color: var(--vis-accent);
    }
    
    /* ═══════════════════════════════════════════════════════════════
       响应式布局 - 可视化编辑器
       ═══════════════════════════════════════════════════════════════ */
    
    /* 宽屏优化 (≥1400px) - 适度增大侧边栏显示更完整的表格名 */
    @media screen and (min-width: 1400px) {
        .acu-vis-sidebar {
            flex: 0 0 320px; /* 从380px拉窄到320px，避免占用过多空间 */
            max-width: 380px;
        }
        
        .acu-table-nav-item {
            padding: 10px 12px;
            width: 100%; /* 确保占满侧边栏宽度 */
        }
        
        .acu-table-name {
            /* 宽屏时允许表格名换行显示 */
            white-space: normal;
            word-break: break-word;
            flex: 1 1 0;
            width: 0;
        }
    }
    
    /* 超宽屏 (≥1800px) */
    @media screen and (min-width: 1800px) {
        .acu-vis-sidebar {
            flex: 0 0 360px; /* 从420px拉窄到360px */
            max-width: 420px;
        }
        
        .acu-table-name {
            font-size: 14px;
        }
    }
    
    /* 平板及以下 (≤768px) */
    @media screen and (max-width: 768px) {
        #acu-visualizer-content {
            font-size: 13px;
        }
        
        /* 顶部栏 */
        .acu-vis-header {
            flex: 0 0 auto;
            min-height: 50px;
            padding: 10px 16px;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .acu-vis-title {
            font-size: 14px;
            letter-spacing: 2px;
            width: 100%;
            text-align: center;
            order: 1;
        }
        
        .acu-mode-switch {
            order: 2;
            margin-right: 0;
        }
        
        .acu-vis-actions {
            order: 3;
            width: 100%;
            justify-content: center;
        }
        
        /* 内容区域 - 垂直布局 */
        .acu-vis-content {
            flex-direction: column;
        }
        
        /* 侧边栏变为顶部横向滚动 */
        .acu-vis-sidebar {
            flex: 0 0 auto;
            width: 100%;
            /* 关键修复：基础样式里存在 max-width:400px/min-width:280px，
               在移动端会把“顶部横条”宽度卡死，导致右侧出现空白背景区域 */
            max-width: none !important;
            min-width: 0 !important;
            box-sizing: border-box;
            max-height: 120px;
            border-right: none;
            border-bottom: 1px solid var(--vis-border-color);
            flex-direction: row;
            flex-wrap: nowrap;
            overflow-x: auto;
            overflow-y: hidden;
            gap: 8px;
            padding: 12px;
            -webkit-overflow-scrolling: touch;
            /* 关键：避免被外部样式“拉开间距”导致中间/右侧出现大块空白 */
            justify-content: flex-start !important;
            align-items: stretch;
        }
        
        .acu-vis-sidebar::before {
            display: none;
        }
        
        .acu-vis-sidebar::-webkit-scrollbar {
            height: 4px;
            width: auto;
        }
        
        /* 表格导航项 - 横向布局 */
        .acu-table-nav-item {
            /* 显式禁用 grow/shrink，保证按内容紧凑排列；超出则横向滚动 */
            flex: 0 0 auto;
            padding: 8px 12px;
            width: auto; /* 横向滚动时宽度由内容决定 */
            min-width: fit-content; /* 确保最小宽度包裹内容 */
            display: inline-flex;
        }
        
        .acu-table-nav-content {
            gap: 6px;
            flex: 0 0 auto; /* 横向滚动时不伸缩，保持内容宽度 */
            width: auto; /* 重置宽度 */
        }
        
        .acu-table-name {
            white-space: nowrap; /* 确保表格名不换行 */
            overflow: visible; /* 窄屏下不截断，完整显示 */
            text-overflow: clip;
            flex: 0 0 auto; /* 不伸缩，宽度由内容决定 */
            width: auto; /* 重置宽度 */
        }
        
        .acu-table-index {
            display: none; /* 隐藏序号 */
        }
        
        .acu-table-nav-actions {
            opacity: 1;
            gap: 2px;
            flex: 0 0 auto; /* 不允许伸缩 */
            /* 强制取消全局的 margin-left:auto（否则会把按钮推到最右，产生巨量空白） */
            margin-left: 6px !important;
            padding-left: 0;
        }
        
        .acu-table-order-btn {
            width: 20px;
            height: 20px;
            font-size: 9px;
        }
        
        /* 新增表格按钮 */
        .acu-add-table-btn {
            flex-shrink: 0;
            padding: 8px 12px;
            margin-top: 0;
        }
        
        /* 主内容区 */
        .acu-vis-main {
            padding: 16px;
        }
        
        /* 数据卡片 */
        .acu-card-grid {
            gap: 12px;
        }
        
        .acu-data-card {
            width: 100%;
            min-width: 0;
        }
        
        .acu-card-header {
            padding: 10px 12px;
            font-size: 13px;
        }
        
        .acu-card-body {
            padding: 10px 12px;
            font-size: 12px;
        }
        
        /* 配置面板 */
        .acu-config-panel {
            padding: 16px;
        }
        
        .acu-config-section {
            margin-bottom: 16px;
            padding-bottom: 16px;
        }
        
        .acu-config-section h4 {
            font-size: 14px;
        }
        
        .acu-form-group {
            margin-bottom: 12px;
        }
        
        .acu-form-input,
        .acu-form-textarea {
            font-size: 14px; /* 防止iOS缩放 */
            padding: 10px;
        }
        
        /* 列编辑器 */
        .acu-col-item {
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .acu-col-input {
            width: 100%;
            flex: none;
        }
        
        /* 按钮 */
        .acu-btn-primary,
        .acu-btn-secondary {
            padding: 10px 16px;
            font-size: 12px;
        }
    }
    
    /* 手机 (≤480px) */
    @media screen and (max-width: 480px) {
        #acu-visualizer-content {
            font-size: 12px;
        }
        
        .acu-vis-header {
            padding: 8px 12px;
        }
        
        .acu-vis-title {
            font-size: 13px;
            letter-spacing: 1px;
        }
        
        .acu-vis-title i {
            display: none;
        }
        
        .acu-mode-switch {
            padding: 2px;
        }
        
        .acu-mode-btn {
            padding: 5px 10px;
            font-size: 11px;
        }
        
        .acu-btn-primary,
        .acu-btn-secondary {
            padding: 8px 12px;
            font-size: 11px;
        }
        
        .acu-vis-sidebar {
            max-height: 100px;
            padding: 8px;
            gap: 6px;
        }
        
        .acu-table-nav-item {
            padding: 6px 10px;
            font-size: 11px;
            width: auto; /* 横向滚动时宽度由内容决定 */
            min-width: fit-content;
            flex: 0 0 auto;
            display: inline-flex;
        }
        
        .acu-table-name {
            white-space: nowrap;
            overflow: visible;
            text-overflow: clip;
            width: auto;
        }
        
        .acu-table-order-btn {
            width: 18px;
            height: 18px;
        }
        
        .acu-vis-main {
            padding: 12px;
        }
        
        .acu-data-card {
            border-radius: 3px;
        }
        
        .acu-card-header {
            padding: 8px 10px;
            font-size: 12px;
        }
        
        .acu-card-body {
            padding: 8px 10px;
            gap: 8px;
        }
        
        .acu-field-label {
            font-size: 9px;
        }
        
        .acu-field-value {
            padding: 5px 6px;
            font-size: 12px;
            min-height: 16px;
        }
        
        .acu-config-panel {
            padding: 12px;
            border-radius: 3px;
        }
        
        .acu-config-section h4 {
            font-size: 13px;
            margin-bottom: 12px;
        }
        
        .acu-form-group label {
            font-size: 11px;
        }
        
        .acu-hint {
            font-size: 10px;
        }
        
        .acu-col-item {
            padding: 6px 8px;
        }
        
        .acu-col-input {
            padding: 6px 8px;
            font-size: 13px;
        }
        
        .acu-col-btn {
            padding: 5px 8px;
            font-size: 11px;
        }
    }
    
    /* 超小屏幕 (≤360px) */
    @media screen and (max-width: 360px) {
        #acu-visualizer-content {
            font-size: 11px;
        }
        
        .acu-vis-header {
            padding: 4px 8px;
            min-height: 40px;
            gap: 6px;
        }
        
        .acu-vis-title {
            font-size: 11px;
            letter-spacing: 0.5px;
        }
        
        .acu-mode-switch {
            padding: 1px;
        }
        
        .acu-mode-btn {
            padding: 4px 8px;
            font-size: 10px;
        }
        
        .acu-vis-actions {
            gap: 4px;
        }
        
        .acu-btn-primary,
        .acu-btn-secondary {
            padding: 5px 8px;
            font-size: 10px;
        }
        
        .acu-vis-sidebar {
            max-height: 75px;
            padding: 4px;
            gap: 4px;
        }
        
        .acu-table-nav-item {
            padding: 4px 6px;
            font-size: 10px;
        }
        
        .acu-table-order-btn {
            width: 16px;
            height: 16px;
            font-size: 8px;
        }
        
        .acu-add-table-btn {
            padding: 4px 8px;
            font-size: 10px;
        }
        
        .acu-vis-main {
            padding: 8px;
        }
        
        .acu-card-grid {
            gap: 8px;
        }
        
        .acu-data-card {
            border-radius: 4px;
        }
        
        .acu-card-header {
            padding: 6px 8px;
            font-size: 11px;
        }
        
        .acu-card-body {
            padding: 6px 8px;
            gap: 6px;
        }
        
        .acu-field-label {
            font-size: 8px;
        }
        
        .acu-field-value {
            padding: 4px 5px;
            font-size: 11px;
            min-height: 14px;
        }
        
        .acu-config-panel {
            padding: 8px;
            border-radius: 4px;
        }
        
        .acu-config-section {
            margin-bottom: 12px;
            padding-bottom: 12px;
        }
        
        .acu-config-section h4 {
            font-size: 12px;
            margin-bottom: 10px;
        }
        
        .acu-form-group {
            margin-bottom: 10px;
        }
        
        .acu-form-group label {
            font-size: 10px;
        }
        
        .acu-form-input,
        .acu-form-textarea {
            padding: 8px;
            font-size: 14px; /* 防止iOS缩放 */
        }
        
        .acu-hint {
            font-size: 9px;
        }
        
        .acu-col-item {
            padding: 5px 6px;
        }
        
        .acu-col-input {
            padding: 5px 6px;
            font-size: 12px;
        }
        
        .acu-col-btn {
            padding: 4px 6px;
            font-size: 10px;
        }
    }
    
    /* 超极小屏幕 (≤320px) */
    @media screen and (max-width: 320px) {
        #acu-visualizer-content {
            font-size: 10px;
        }
        
        .acu-vis-header {
            padding: 3px 6px;
            min-height: 36px;
        }
        
        .acu-vis-title {
            font-size: 10px;
        }
        
        .acu-mode-btn {
            padding: 3px 6px;
            font-size: 9px;
        }
        
        .acu-btn-primary,
        .acu-btn-secondary {
            padding: 4px 6px;
            font-size: 9px;
        }
        
        .acu-vis-sidebar {
            max-height: 65px;
            padding: 3px;
        }
        
        .acu-table-nav-item {
            padding: 3px 5px;
            font-size: 9px;
        }
        
        .acu-vis-main {
            padding: 6px;
        }
        
        .acu-card-header {
            padding: 5px 6px;
            font-size: 10px;
        }
        
        .acu-card-body {
            padding: 5px 6px;
        }
        
        .acu-config-panel {
            padding: 6px;
        }
        
        .acu-config-section h4 {
            font-size: 11px;
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       古典中国风覆盖（修正深色主题下的一致性）
       仅影响 #acu-visualizer-content 内部
       ═══════════════════════════════════════════════════════════════ */

    #acu-visualizer-content .acu-vis-main {
        background: var(--vis-bg-color);
        background-image:
          url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        color: var(--vis-text-main);
    }

    #acu-visualizer-content .acu-data-card,
    #acu-visualizer-content .acu-config-panel {
        background: var(--vis-bg-light);
        border: 1px solid var(--vis-border-color);
        border-radius: 2px;
        box-shadow: none;
    }

    #acu-visualizer-content .acu-card-header {
        background: var(--vis-bg-stats);
        color: var(--vis-text-main);
        border-bottom: 1px solid var(--vis-border-color);
        font-weight: normal;
    }

    #acu-visualizer-content .acu-card-body { color: var(--vis-text-dim); }
    #acu-visualizer-content .acu-field-label { color: var(--vis-text-mute); }

    #acu-visualizer-content .acu-field-value {
        background: var(--vis-bg-color);
        border: 1px solid var(--vis-border-color);
        color: var(--vis-text-main);
    }
    #acu-visualizer-content .acu-field-value:hover {
        background: var(--vis-bg-hover);
        border-color: var(--vis-accent);
    }
    #acu-visualizer-content .acu-field-value:focus {
        background: var(--vis-bg-color);
        border-color: var(--vis-accent);
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }

    #acu-visualizer-content .acu-config-section h4 { color: var(--vis-text-main); }
    #acu-visualizer-content .acu-form-group label { color: var(--vis-text-dim); }

    #acu-visualizer-content .acu-form-input,
    #acu-visualizer-content .acu-form-textarea,
    #acu-visualizer-content .acu-col-input {
        background: var(--vis-bg-color);
        border: 1px solid var(--vis-border-color);
        color: var(--vis-text-main);
    }
    #acu-visualizer-content .acu-form-input:focus,
    #acu-visualizer-content .acu-form-textarea:focus,
    #acu-visualizer-content .acu-col-input:focus {
        border-color: var(--vis-accent);
        box-shadow: 0 0 0 2px var(--vis-accent-glow);
    }

    #acu-visualizer-content .acu-col-item {
        background: var(--vis-bg-stats);
        border: 1px solid var(--vis-border-color);
    }

    /* "添加新行"卡片：古典风格 */
    #acu-visualizer-content #acu-vis-add-row {
        background: rgba(125, 73, 64, 0.08) !important;
        border-color: var(--vis-accent) !important;
        border-radius: 2px;
    }
    #acu-visualizer-content #acu-vis-add-row i,
    #acu-visualizer-content #acu-vis-add-row div {
        color: var(--vis-accent) !important;
    }
  `;

  // Internal state for visualizer
  export let _acuVisState: any = {
      currentSheetKey: null,
      mode: 'data', // 'data' or 'config'
      tempData: null, // Deep copy of currentJsonTableData_ACU
      sheetOrder: null as string[] | null, // 有序表格键列表
      deletedSheetKeys: [] as string[] // 在可视化编辑器中删除的表格key列表
  };

  // [核心重构] 定义全局刷新函数，确保无论何时调用都能从本地数据（聊天记录）中获取最新数据并刷新UI
  (window as any).ACU_Visualizer_Refresh = async function() {
      if (!jQuery_API_ACU('#acu-visualizer-content').length && !ACU_WindowManager.isOpen(`${SCRIPT_ID_PREFIX_ACU}-visualizer-window`)) return;
      
      // 1. 尝试从聊天记录重新构建完整数据
      logDebug_ACU('Visualizer: Forcing data refresh directly from chat history (Global Function)...');
      
      // 确保消息列表是最新的
      await loadAllChatMessages_ACU(); 
      
      // 使用合并逻辑从聊天记录提取最新数据
      const freshData = await mergeAllIndependentTables_ACU();
      
      if (!freshData) {
          logWarn_ACU('Visualizer refresh: Failed to merge data from chat history.');
          // 如果失败，回退到使用当前内存数据（如果存在）
          if (currentJsonTableData_ACU) {
              _acuVisState.tempData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));
          } else {
              return;
          }
      } else {
          // 如果成功，更新内存数据和编辑器数据
          const stableKeys = getSortedSheetKeys_ACU(freshData);
          _set_currentJsonTableData_ACU(reorderDataBySheetKeys_ACU(freshData, stableKeys));
          _acuVisState.tempData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));
      }
      
      // 2. Validate current sheet key
      if (_acuVisState.currentSheetKey && !_acuVisState.tempData[_acuVisState.currentSheetKey]) {
          const keys = getSortedSheetKeys_ACU(_acuVisState.tempData);
          _acuVisState.currentSheetKey = keys.length > 0 ? keys[0] : null;
      } else if (!_acuVisState.currentSheetKey) {
          const keys = getSortedSheetKeys_ACU(_acuVisState.tempData);
          _acuVisState.currentSheetKey = keys.length > 0 ? keys[0] : null;
      }
      
      // 3. Re-render
      renderVisualizerSidebar_ACU();
      renderVisualizerMain_ACU();
      updateVisualizerTemplatePresetIndicator_ACU();
      
      logDebug_ACU('Visualizer: Data refresh completed.');
  };

  export function updateVisualizerTemplatePresetIndicator_ACU() {
      const $indicator = jQuery_API_ACU('#acu-vis-template-preset-indicator');
      if (!$indicator.length) return;
      const activeTemplateMeta_ACU = getActiveTemplatePresetMeta_ACU();
      $indicator.text(`当前生效模板预设：${activeTemplateMeta_ACU.displayName}（${activeTemplateMeta_ACU.scopeLabel}）`);
  }

  export function openNewVisualizer_ACU() {
      if (!currentJsonTableData_ACU) {
          showToastr_ACU('warning', '数据未加载，请先进行一次对话或初始化。');
          return;
      }

      // Initial Load
      _acuVisState.tempData = JSON.parse(JSON.stringify(currentJsonTableData_ACU));
      _acuVisState.currentSheetKey = getSortedSheetKeys_ACU(_acuVisState.tempData)[0] || null; // Default to first sheet
      const activeTemplateMeta_ACU = getActiveTemplatePresetMeta_ACU();
      const activeTemplatePresetText_ACU = `当前生效模板预设：${activeTemplateMeta_ACU.displayName}（${activeTemplateMeta_ACU.scopeLabel}）`;
      
      // 构建可视化编辑器内容（不含外层容器，由独立窗口系统提供）
      const visualizerContent = `
          <div id="acu-visualizer-content" style="display: flex; flex-direction: column; height: 100%;">
              <style>${VISUALIZER_CSS_ACU}</style>
              <div class="acu-vis-toolbar" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: transparent; border-bottom: 1px solid var(--vis-border-color); flex-shrink: 0;">
                  <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                      <span class="seal" style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--vis-accent); color: var(--vis-accent); font-size: 12px; border-radius: 1px; opacity: 0.85; letter-spacing: 1px;">墨</span>
                      <div style="display: flex; flex-direction: column; gap: 6px;">
                          <div class="acu-mode-switch">
                              <button class="acu-mode-btn active" data-mode="data">数据编辑</button>
                              <button class="acu-mode-btn" data-mode="config">结构/参数配置</button>
                              <button class="acu-mode-btn" data-mode="globalConfig">全局注入配置</button>
                          </div>
                          <div id="acu-vis-template-preset-indicator" class="acu-hint" style="font-size: 12px; color: var(--vis-text-mute);">${escapeHtml_ACU(activeTemplatePresetText_ACU)}</div>
                      </div>
                  </div>
                  <div class="acu-vis-actions" style="display: flex; gap: 10px;">
                      <button id="acu-vis-theme-btn" class="acu-btn-secondary acu-vis-theme-btn" title="切换主题"><span class="acu-theme-toggle-text">素纱</span></button>
                      <button id="acu-vis-save-btn" class="acu-btn-primary"><i class="fa-solid fa-save"></i> 保存到当前聊天</button>
                      <button id="acu-vis-save-template-btn" class="acu-btn-secondary"><i class="fa-solid fa-save"></i> 保存到全局</button>
                  </div>
              </div>
              <div class="acu-vis-content" style="flex: 1; display: flex; overflow: hidden;">
                  <div class="acu-vis-sidebar" id="acu-vis-sidebar-list"></div>
                  <div class="acu-vis-main" id="acu-vis-main-area"></div>
              </div>
          </div>
      `;
      
      const windowId = `${SCRIPT_ID_PREFIX_ACU}-visualizer-window`;
      
      // 如果窗口已存在，先移除
      closeACUWindow(windowId);
      
      // 创建独立窗口
      createACUWindow({
          id: windowId,
          title: '数据库编辑器',
          content: visualizerContent,
          width: 1400,  // 基础宽度
          height: 900,  // 基础高度
          modal: false,
          resizable: true,
          maximizable: true,
          startMaximized: false, // 由 rememberState 自动管理，首次打开时不全屏
          onClose: () => {
              if (!confirm('确定要关闭吗？未保存的修改将丢失。')) {
                  return false; // 阻止关闭（注意：当前实现会立即关闭，后续可优化）
              }
          },
          onReady: ($window) => {
              // 绑定事件
              $window.find('#acu-vis-save-btn').on('click', async () => {
                  await saveVisualizerChanges_ACU(false);
              });

              $window.find('#acu-vis-save-template-btn').on('click', async () => {
                  await saveVisualizerChanges_ACU(true);
              });

              $window.find('.acu-mode-btn').on('click', function() {
                  $window.find('.acu-mode-btn').removeClass('active');
                  jQuery_API_ACU(this).addClass('active');
                  _acuVisState.mode = jQuery_API_ACU(this).data('mode');
                  renderVisualizerMain_ACU();
              });

              // 主题切换按钮绑定
              $window.find('#acu-vis-theme-btn').on('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  const nextTheme = toggleACUTheme_ACU(document);
                  const nextLabel = nextTheme === 'silk' ? '墨纸' : '素纱';
                  $window.find('#acu-vis-theme-btn .acu-theme-toggle-text').text(nextLabel);
              });

              // [核心重构] 绑定事件以支持旧的触发方式，但实际逻辑委托给全局函数
              jQuery_API_ACU(document).off('acu-visualizer-refresh-data');
              jQuery_API_ACU(document).on('acu-visualizer-refresh-data', () => {
                  if (typeof (window as any).ACU_Visualizer_Refresh === 'function') {
                      (window as any).ACU_Visualizer_Refresh();
                  }
              });

              renderVisualizerSidebar_ACU();
              renderVisualizerMain_ACU();
              updateVisualizerTemplatePresetIndicator_ACU();
          }
      });
  }

  // [新增] 表格顺序管理 - 存储有序的表格键列表
