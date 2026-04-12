/**
 * presentation/window/window-styles.ts — 窗口样式注入 + 主题切换
 * 从 window-system.ts 拆出
 */
import { getConfigStorage_ACU } from '../../data/storage/tavern-storage';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { topLevelWindow_ACU } from '../../shared/env';

  const ACU_WINDOW_STYLES_INJECTED_FLAG = `${SCRIPT_ID_PREFIX_ACU}_window_styles_injected`;
  const ACU_UI_THEME_STORAGE_KEY = `${SCRIPT_ID_PREFIX_ACU}_ui_theme_v1`;

  export function getACUTheme_ACU() {
    try {
      const store = getConfigStorage_ACU();
      const savedTheme = String(store?.getItem?.(ACU_UI_THEME_STORAGE_KEY) || '').trim().toLowerCase();
      return savedTheme === 'silk' ? 'silk' : 'ink';
    } catch (e) {
      return 'ink';
    }
  }

  export function setACUTheme_ACU(theme) {
    const normalizedTheme = theme === 'silk' ? 'silk' : 'ink';
    try {
      const store = getConfigStorage_ACU();
      store?.setItem?.(ACU_UI_THEME_STORAGE_KEY, normalizedTheme);
    } catch (e) {
      console.warn('[ACU] Failed to persist UI theme:', e);
    }
    return normalizedTheme;
  }

  export function applyACUThemeToDocument_ACU(targetDoc, theme = null) {
    const doc = targetDoc || (topLevelWindow_ACU?.document || document);
    const activeTheme = theme === 'silk' || theme === 'ink' ? theme : getACUTheme_ACU();
    const body = doc?.body;
    if (!body || !body.classList) return activeTheme;
    body.classList.toggle('acu-theme-silk', activeTheme === 'silk');
    body.setAttribute('data-acu-theme', activeTheme);
    return activeTheme;
  }

  export function syncACUThemeButtons_ACU(targetDoc) {
    const doc = targetDoc || (topLevelWindow_ACU?.document || document);
    const activeTheme = applyACUThemeToDocument_ACU(doc);
    const nextThemeLabel = activeTheme === 'silk' ? '墨纸' : '素纱';
    const nextThemeTitle = activeTheme === 'silk' ? '切换为墨纸主题' : '切换为素纱主题';
    try {
      doc.querySelectorAll('.acu-window-btn.theme-toggle .acu-theme-toggle-text').forEach((el) => {
        el.textContent = nextThemeLabel;
      });
      doc.querySelectorAll('.acu-window-btn.theme-toggle').forEach((el) => {
        el.setAttribute('title', nextThemeTitle);
      });
    } catch (e) {
      console.warn('[ACU] Failed to sync theme buttons:', e);
    }
    return activeTheme;
  }

  export function toggleACUTheme_ACU(targetDoc) {
    const nextTheme = getACUTheme_ACU() === 'silk' ? 'ink' : 'silk';
    setACUTheme_ACU(nextTheme);
    applyACUThemeToDocument_ACU(targetDoc, nextTheme);
    syncACUThemeButtons_ACU(targetDoc);
    return nextTheme;
  }

  function injectACUWindowStyles() {
    // 始终往酒馆主窗口注入样式
    const targetWin = topLevelWindow_ACU || window;
    const targetDoc = targetWin.document;
    
    if (targetWin[ACU_WINDOW_STYLES_INJECTED_FLAG]) return;
    targetWin[ACU_WINDOW_STYLES_INJECTED_FLAG] = true;
    
    const css = `
      /* ═══════════════════════════════════════════════════════════════
         星·数据库 独立窗口系统
         古卷双主题：墨色 / 素纱
         ═══════════════════════════════════════════════════════════════ */
      
      .acu-window-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(17, 15, 13, 0.56);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        z-index: 9999;
        animation: acuOverlayFadeIn 0.24s ease-out;
      }
      body.acu-theme-silk .acu-window-overlay {
        background: rgba(94, 84, 69, 0.16);
      }
      @keyframes acuOverlayFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .acu-window {
        --acu-panel-bg: #24221f;
        --acu-panel-border: #36332e;
        --acu-panel-text: #c1b9ad;
        --acu-panel-text-dim: #9e978e;
        --acu-panel-text-mute: #645e55;
        --acu-panel-accent: #7d4940;
        --acu-panel-hover: #2a2824;
        position: fixed;
        display: flex;
        flex-direction: column;
        background-color: var(--acu-panel-bg);
        background-image:
          url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E"),
          linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 30%);
        border: 1px solid var(--acu-panel-border);
        border-radius: 2px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
        overflow: hidden;
        min-width: 400px;
        min-height: 300px;
        animation: acuWindowSlideIn 0.25s ease-out;
        color-scheme: dark;
        font-family: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
        font-weight: 500;
        color: var(--acu-panel-text);
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }
      body.acu-theme-silk .acu-window {
        --acu-panel-bg: #f4f1eb;
        --acu-panel-border: #e0dacb;
        --acu-panel-text: #4a453f;
        --acu-panel-text-dim: #6e675e;
        --acu-panel-text-mute: #9e978e;
        --acu-panel-accent: #8a6b5e;
        --acu-panel-hover: #ebe7de;
        color-scheme: light;
        box-shadow: 0 18px 42px rgba(72, 59, 43, 0.16);
      }
      @keyframes acuWindowSlideIn {
        from { opacity: 0; transform: scale(0.97) translateY(-14px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      
      .acu-window.maximized {
        top: 10px !important;
        left: 10px !important;
        width: calc(100vw - 20px) !important;
        height: calc(100vh - 20px) !important;
        border-radius: 12px;
      }
      
      /* 窄屏模式下全屏时减小边距，确保头部完全可见 */
      @media screen and (max-width: 1100px) {
        .acu-window.maximized {
          top: 5px !important;
          left: 5px !important;
          width: calc(100vw - 10px) !important;
          height: calc(100vh - 10px) !important;
          border-radius: 8px;
        }
        .acu-window-header {
          padding: 10px 12px;
        }
        .acu-window-controls {
          gap: 6px;
          margin-right: 0; /* 窄屏模式下关闭按钮靠右 */
        }
        .acu-window-btn {
          width: 32px;
          height: 32px;
        }
        .acu-window {
          min-width: 320px; /* 窄屏下允许更小的最小宽度 */
        }
      }
      
      /* 超窄屏模式下全屏时进一步优化 */
      @media screen and (max-width: 768px) {
        .acu-window {
          min-width: min(320px, calc(100vw - 12px)) !important; /* 手机端保留边距，避免遮挡底层界面 */
          min-height: min(360px, calc(100dvh - 12px)) !important;
          max-width: calc(100vw - 12px) !important;
          max-height: calc(100vh - 12px) !important;
          max-height: calc(100dvh - 12px) !important; /* 使用动态视口高度，避免移动浏览器地址栏问题 */
        }
        .acu-window.maximized {
          top: 6px !important;
          left: 6px !important;
          width: calc(100vw - 12px) !important;
          height: calc(100vh - 12px) !important;
          height: calc(100dvh - 12px) !important; /* 优先使用动态视口高度 */
          max-width: calc(100vw - 12px) !important;
          max-height: calc(100vh - 12px) !important;
          max-height: calc(100dvh - 12px) !important;
          border-radius: 10px;
          border: 1px solid var(--acu-panel-border);
        }
        .acu-window-header {
          padding: 8px 10px;
          min-height: 44px; /* 确保头部高度足够 */
          flex-shrink: 0;
        }
        .acu-window-controls {
          margin-right: 0; /* 超窄屏模式下关闭按钮靠右 */
        }
        .acu-window-title {
          font-size: 13px;
        }
        .acu-window-btn {
          width: 36px;
          height: 36px;
          font-size: 16px;
        }
        .acu-window-body {
          max-width: 100vw;
          overflow-x: hidden;
          overflow-y: auto;
          /* 确保body能正确滚动，使用flex布局撑满剩余空间 */
          flex: 1 1 0;
          min-height: 0; /* 关键：允许flex子元素收缩 */
        }
      }
      
      /* 极窄屏模式（≤480px）进一步压缩 */
      @media screen and (max-width: 480px) {
        .acu-window-header {
          padding: 6px 8px;
          min-height: 40px;
        }
        .acu-window-title {
          font-size: 12px;
          gap: 6px;
        }
        .acu-window-title i {
          font-size: 14px;
        }
        .acu-window-btn {
          width: 32px;
          height: 32px;
          font-size: 14px;
        }
        .acu-window-controls {
          gap: 4px;
          margin-right: 0; /* 极窄屏模式下关闭按钮靠右 */
        }
      }
      
      /* 超小屏模式（≤360px）最小化头部占用 */
      @media screen and (max-width: 360px) {
        .acu-window-header {
          padding: 4px 6px;
          min-height: 36px;
        }
        .acu-window-title {
          font-size: 11px;
          gap: 4px;
        }
        .acu-window-title i {
          font-size: 12px;
        }
        .acu-window-btn {
          width: 28px;
          height: 28px;
          font-size: 12px;
          border-radius: 6px;
        }
        .acu-window-controls {
          margin-right: 0; /* 超小屏模式下关闭按钮靠右 */
        }
      }
      
      .acu-window-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: transparent;
        border-bottom: 1px solid var(--acu-panel-border);
        cursor: move;
        user-select: none;
        flex-shrink: 0;
      }
      
      .acu-window-title {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 1px;
        color: var(--acu-panel-text);
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }
      .acu-window-title i {
        color: var(--acu-panel-accent);
        flex-shrink: 0;
      }
      .acu-window-title span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .acu-window-controls {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
        margin-left: 8px;
      }
      
      .acu-window-btn {
        width: 30px;
        height: 30px;
        border: 1px solid transparent;
        border-radius: 1px;
        background: transparent;
        color: var(--acu-panel-text-mute);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.18s ease;
        font-family: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
      }
      .acu-window-btn:hover {
        background: var(--acu-panel-hover);
        border-color: var(--acu-panel-border);
        color: var(--acu-panel-text);
      }
      .acu-window-btn.maximize:hover {
        color: var(--acu-panel-accent);
      }
      .acu-window-btn.close:hover {
        background: rgba(125, 73, 64, 0.10);
        border-color: var(--acu-panel-accent);
        color: var(--acu-panel-accent);
      }
      .acu-window-btn.theme-toggle {
        width: auto;
        min-width: 58px;
        padding: 0 10px;
        font-size: 11px;
        letter-spacing: 1px;
      }
      .acu-theme-toggle-text {
        display: inline-block;
        line-height: 1;
        transform: translateY(-0.5px);
      }
      
      .acu-window-body {
        flex: 1 1 0;
        min-height: 0; /* 关键：允许flex子元素收缩到小于内容高度 */
        overflow: auto;
        overflow-x: hidden;
        padding: 0;
        /* 确保内容不会撑破容器 */
        display: flex;
        flex-direction: column;
      }
      
      /* 窗口body内的内容容器 */
      .acu-window-body > * {
        flex: 1 1 0;
        min-height: 0;
        overflow-y: auto;
        box-sizing: border-box;
      }
      
      /* 窗口大小调整手柄 */
      .acu-window-resize-handle {
        position: absolute;
        background: transparent;
      }
      .acu-window-resize-handle.se {
        right: 0; bottom: 0;
        width: 20px; height: 20px;
        cursor: se-resize;
      }
      .acu-window-resize-handle.se::after {
        content: '';
        position: absolute;
        right: 4px; bottom: 4px;
        width: 10px; height: 10px;
        border-right: 2px solid var(--acu-panel-border);
        border-bottom: 2px solid var(--acu-panel-border);
        opacity: 0.72;
      }
      .acu-window-resize-handle.e {
        right: 0; top: 40px; bottom: 20px;
        width: 6px;
        cursor: e-resize;
      }
      .acu-window-resize-handle.s {
        left: 20px; right: 20px; bottom: 0;
        height: 6px;
        cursor: s-resize;
      }
      .acu-window-resize-handle.w {
        left: 0; top: 40px; bottom: 20px;
        width: 6px;
        cursor: w-resize;
      }
      .acu-window-resize-handle.n {
        left: 20px; right: 20px; top: 0;
        height: 6px;
        cursor: n-resize;
      }
      .acu-window-resize-handle.nw {
        left: 0; top: 0;
        width: 20px; height: 20px;
        cursor: nw-resize;
      }
      .acu-window-resize-handle.ne {
        right: 0; top: 0;
        width: 20px; height: 20px;
        cursor: ne-resize;
      }
      .acu-window-resize-handle.sw {
        left: 0; bottom: 0;
        width: 20px; height: 20px;
        cursor: sw-resize;
      }
    `;
    
    const style = targetDoc.createElement('style');
    style.id = `${SCRIPT_ID_PREFIX_ACU}-window-styles`;
    style.textContent = css;
    (targetDoc.head || targetDoc.documentElement).appendChild(style);
  }

