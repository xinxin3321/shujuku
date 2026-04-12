// toast.ts
// 从 03_theme_and_toast.js 整体迁入

import { _acuToastStyleInjected_ACU, _set__acuToastStyleInjected_ACU} from '../../service/runtime/api-registry';
import { settings_ACU } from '../../service/runtime/state-manager';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { topLevelWindow_ACU } from '../../shared/env';
import { logDebug_ACU } from '../../shared/utils';
import { ACU_TOAST_TITLE_ACU, _acuToastDedup_ACU } from '../../service/runtime/api-registry';

  export function ensureAcuToastStylesInjected_ACU() {
    if (_acuToastStyleInjected_ACU) return;
    try {
      const doc = topLevelWindow_ACU?.document || document;
      const styleId = `${SCRIPT_ID_PREFIX_ACU}-acu-toast-style`;
      if (doc.getElementById(styleId)) {
        _set__acuToastStyleInjected_ACU(true);
        return;
      }
      const style = doc.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* ACU Toast Theme (古典中国风 - scoped to .acu-toast) */
        /* 双主题变量 */
        #toast-container .acu-toast.toast {
          --toast-accent: #7d4940;
          --toast-bg: #24221f;
          --toast-text: #c1b9ad;
          --toast-border: #36332e;
          --toast-font: "Noto Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", serif;
        }
        body.acu-theme-silk #toast-container .acu-toast.toast {
          --toast-accent: #8a6b5e;
          --toast-bg: #f4f1eb;
          --toast-text: #3d3629;
          --toast-border: #d4cfc4;
        }
        
        .acu-toast.toast {
          font-family: var(--toast-font) !important;
          font-weight: 500 !important;
          font-size: 14px !important;
          letter-spacing: 0.2px;
          --acu-toast-accent: var(--toast-accent);
          background: var(--toast-bg) !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E") !important;
          color: var(--toast-text) !important;
          border: 1px solid var(--toast-border) !important;
          border-radius: 2px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.35) !important;
          padding: 12px 14px 12px 50px !important;
          width: min(420px, calc(100vw - 24px)) !important;
          opacity: 1 !important;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          position: relative !important;
          overflow: hidden !important;
          /* 左侧古典色条 */
          border-left: 3px solid var(--toast-accent) !important;
        }
        /* 强制覆盖 Toastr/SillyTavern 更高优先级背景 */
        #toast-container .acu-toast.toast,
        #toast-container .acu-toast.toast.toast-success,
        #toast-container .acu-toast.toast.toast-info,
        #toast-container .acu-toast.toast.toast-warning,
        #toast-container .acu-toast.toast.toast-error {
          background: var(--toast-bg) !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E") !important;
          opacity: 1 !important;
        }
        #toast-container .acu-toast.toast .toast-title,
        #toast-container .acu-toast.toast .toast-message {
          background: transparent !important;
        }
        /* 清掉 Toastr 默认的纹理 */
        .acu-toast.toast,
        .acu-toast.toast.toast-success,
        .acu-toast.toast.toast-info,
        .acu-toast.toast.toast-warning,
        .acu-toast.toast.toast-error {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E") !important;
          background-repeat: repeat !important;
          background-position: 0 0 !important;
        }
        /* 图标徽章：古典印章风格 */
        #toast-container .acu-toast.toast::before {
          content: "i" !important;
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 26px;
          height: 26px;
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 400;
          font-size: 14px;
          font-family: var(--toast-font);
          color: var(--toast-bg);
          background: var(--toast-accent);
          border: none;
          box-shadow: none;
        }
        #toast-container .acu-toast.acu-toast--success::before { content: "达" !important; }
        #toast-container .acu-toast.acu-toast--info::before { content: "知" !important; }
        #toast-container .acu-toast.acu-toast--warning::before { content: "警" !important; }
        #toast-container .acu-toast.acu-toast--error::before { content: "误" !important; }
        
        .acu-toast.acu-toast--success { --acu-toast-accent: #5a8a5a; }
        .acu-toast.acu-toast--info { --acu-toast-accent: #8a6b5e; }
        .acu-toast.acu-toast--warning { --acu-toast-accent: #b08a5a; }
        .acu-toast.acu-toast--error { --acu-toast-accent: #8a5a5a; }
        .acu-toast.toast .toast-title {
          font-weight: 650 !important;
          letter-spacing: 0.4px;
          margin-bottom: 4px !important;
          opacity: 1;
          text-shadow: none;
          font-family: var(--toast-font);
        }
        .acu-toast.toast .toast-message {
          line-height: 1.55;
          color: var(--toast-text) !important;
          text-shadow: none;
          font-family: var(--toast-font);
          font-weight: 500 !important;
          font-size: 13px !important;
        }
        .acu-toast.toast .toast-close-button {
          color: var(--toast-text) !important;
          text-shadow: none !important;
          opacity: 0.6 !important;
          font-size: 18px;
          right: 8px;
          top: 8px;
        }
        .acu-toast.toast .toast-close-button:hover {
          opacity: 1 !important;
        }
        .acu-toast.toast .toast-progress {
          background: var(--toast-accent) !important;
        }
        .acu-toast.acu-toast--success { border-color: rgba(90,138,90,0.5) !important; }
        .acu-toast.acu-toast--info { border-color: rgba(138,107,94,0.5) !important; }
        .acu-toast.acu-toast--warning { border-color: rgba(176,138,90,0.5) !important; }
        .acu-toast.acu-toast--error { border-color: rgba(138,90,90,0.5) !important; }

        /* Plot abort button inside toast */
        .acu-toast .qrf-abort-btn {
          padding: 4px 12px !important;
          border-radius: 1px !important;
          border: 1px solid var(--toast-accent) !important;
          background: transparent !important;
          color: var(--toast-text) !important;
          font-weight: 600 !important;
          font-family: var(--toast-font) !important;
          cursor: pointer !important;
          font-size: 0.85em;
        }
        .acu-toast .qrf-abort-btn:hover {
          background: var(--toast-accent) !important;
          color: var(--toast-bg) !important;
        }
        @media (max-width: 520px) {
          #toast-container .acu-toast.toast {
            width: min(320px, calc(100vw - 16px)) !important;
            padding: 10px 12px 10px 42px !important;
          }
          #toast-container .acu-toast.toast::before {
            left: 9px;
            width: 22px;
            height: 22px;
            font-size: 12px;
          }
          .acu-toast.toast .toast-title {
            font-size: 13px !important;
            margin-bottom: 3px !important;
          }
          .acu-toast.toast .toast-message {
            font-size: 12px !important;
            line-height: 1.45 !important;
          }
          .acu-toast.toast .toast-close-button {
            font-size: 16px;
            right: 6px;
            top: 6px;
          }
          .acu-toast .qrf-abort-btn {
            padding: 3px 10px !important;
            font-size: 12px !important;
          }
        }
      `;
      doc.head.appendChild(style);
      _set__acuToastStyleInjected_ACU(true);
    } catch (e) {
      // 不影响功能
      _set__acuToastStyleInjected_ACU(true);
    }
  }

  export function _acuNormalizeToastArgs_ACU(type, message, titleOrOptions = {}, maybeOptions = {}) {
    let title = ACU_TOAST_TITLE_ACU;
    let options = {};
    if (typeof titleOrOptions === 'string') {
      title = titleOrOptions || title;
      options = (maybeOptions && typeof maybeOptions === 'object') ? maybeOptions : {};
    } else {
      options = (titleOrOptions && typeof titleOrOptions === 'object') ? titleOrOptions : {};
    }

    // defaults
    const defaultTimeOut =
      type === 'success' ? 2500 :
      type === 'info' ? 2500 :
      type === 'warning' ? 3500 :
      type === 'error' ? 5000 : 2500;

    const isNarrow = (() => {
      try {
        const w = (topLevelWindow_ACU && typeof topLevelWindow_ACU.innerWidth === 'number')
          ? topLevelWindow_ACU.innerWidth
          : window.innerWidth;
        return w <= 520;
      } catch (e) { return false; }
    })();

    const finalOptions = {
      escapeHtml: false,
      closeButton: true,
      progressBar: true,
      newestOnTop: true,
      timeOut: defaultTimeOut,
      extendedTimeOut: 1000,
      tapToDismiss: true,
      // 让样式只作用于本插件 toast
      toastClass: `toast acu-toast acu-toast--${type}`,
      // 宽屏右上角，窄屏顶部居中（避免挡住关键 UI）
      positionClass: isNarrow ? 'toast-top-center' : 'toast-top-right',
      ...options,
    };
    return { title, finalOptions };
  }

  // =========================
  // [新增] Toast 静默门控（全局）
  // 需求：主界面新增勾选项（默认不勾选），勾选后除指定几类提示框外其它全部静默不显示。
  // 允许显示的类别（按用户要求）：
  // - 填表/规划成功提示框
  // - 正在规划提示框
  // - 任意报错提示框
  // - 手动填表/合并填表/外部导入提示框
  // 实现方式：在 showToastr_ACU 统一门控；调用方通过 options.acuToastCategory 打标。
  // =========================
  export const ACU_TOAST_CATEGORY_ACU = {
    ERROR: 'error',
    TABLE_OK: 'table_ok',
    PLAN_OK: 'plan_ok',
    PLANNING: 'planning',
    MANUAL_TABLE: 'manual_table',
    MERGE_TABLE: 'merge_table',
    IMPORT: 'import',
  };

  export function _acuShouldShowToast_ACU(type, title, message, options = {}) {
    try {
      if (!settings_ACU?.toastMuteEnabled) return true;
      if (String(type).toLowerCase() === 'error') return true;
      const cat = options?.acuToastCategory || null;
      const allow = new Set([
        ACU_TOAST_CATEGORY_ACU.ERROR,
        ACU_TOAST_CATEGORY_ACU.TABLE_OK,
        ACU_TOAST_CATEGORY_ACU.PLAN_OK,
        ACU_TOAST_CATEGORY_ACU.PLANNING,
        ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE,
        ACU_TOAST_CATEGORY_ACU.MERGE_TABLE,
        ACU_TOAST_CATEGORY_ACU.IMPORT,
      ]);
      if (cat && allow.has(cat)) return true;
      // 兼容旧调用点：未打标时，根据文案进行“严格白名单”兜底，避免关键流程在静默模式下完全无反馈
      try {
        const raw = `${title || ''}\n${message || ''}`;
        const text = String(raw)
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .toLowerCase();
        const t = String(type).toLowerCase();
        const has = (s) => text.includes(String(s).toLowerCase());

        // 正在规划提示（长驻）
        if (has('正在规划')) return true;

        // 填表/规划成功
        if (t === 'success' && (has('填表') || has('规划'))) return true;
        if (t === 'success' && (has('更新') && has('成功'))) return true;

        // 手动填表/合并填表/外部导入提示
        const allowKeywords = ['手动填表', '手动更新', '合并', '外部导入', '导入', '注入'];
        if (allowKeywords.some(k => has(k))) return true;
      } catch (e) {}
      return false;
    } catch (e) {
      // 出错时不阻断提示
      return true;
    }
  }

  export function showToastr_ACU(type, message, titleOrOptions = {}, maybeOptions = {}) {
    if (!toastr_API_ACU) {
      logDebug_ACU(`Toastr (${type}): ${message}`);
      return null;
    }

    ensureAcuToastStylesInjected_ACU();
    const { title, finalOptions } = _acuNormalizeToastArgs_ACU(type, message, titleOrOptions, maybeOptions);

    // [新增] 静默门控：在实际弹出之前统一拦截
    if (!_acuShouldShowToast_ACU(type, title, message, finalOptions)) return null;

    // 去重防刷屏：同样内容在短时间内只显示一次
    try {
      const key = `${type}|${title}|${String(message).replace(/<[^>]*>/g, '').slice(0, 120)}`;
      const now = Date.now();
      const last = _acuToastDedup_ACU.get(key) || 0;
      if (now - last < 1200) return null;
      _acuToastDedup_ACU.set(key, now);
    } catch (e) {}

    return toastr_API_ACU[type](message, title, finalOptions);
  }

