// ═══════════════════════════════════════════════════════════════
// presentation/index.ts — 表示层统一出口
// ═══════════════════════════════════════════════════════════════

// 窗口系统
export * from './window/window-system';

// 主题 & Toast
export * from './theme/toast';

// 组件
export * from './components/table-selector';
export * from './components/plot-editors';
export * from './components/status-display';

export * from './components/worldbook-selector';
export * from './components/template-preset-ui';
export * from './components/optimization-ui';
export * from './components/update-status-display';
export * from './components/import-status-ui';

// 页面
export * from './pages/main-popup';
export * from './pages/visualizer';

// 启动
export * from './bootstrap/startup';

// 触发器
export * from './triggers/update-trigger';
export * from './triggers/data-admin-ui';
