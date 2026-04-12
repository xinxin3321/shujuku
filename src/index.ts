/**
 * src/index.ts — 应用真入口
 *
 * 按层级顺序导入所有模块，Rollup 基于此构建模块图。
 * 输出格式为 IIFE（油猴环境要求），所有模块代码合并到同一个闭包作用域。
 */

// ═══════════════════════════════════════════════════════════════
// shared 层
// ═══════════════════════════════════════════════════════════════
import './shared/constants';
import './shared/env';
import './shared/service-locator';
import './shared/utils';
import './shared/json-helpers';
import './shared/html-helpers';
import './shared/text-optimization';

// ═══════════════════════════════════════════════════════════════
// data 层
// ═══════════════════════════════════════════════════════════════
import './data/constants';
import './data/storage/idb-import-temp';
import './data/storage/tavern-storage';
import './data/storage/chat-history';
import './data/models/defaults';
import './data/models/defaults-json.js';
import './data/storage/config-storage';
import './data/repositories/profile-repo';
import './data/repositories/isolation-repo';
import './data/repositories/template-preset-repo';
import './data/repositories/character-settings-repo';
import './data/repositories/table-repo';

// ═══════════════════════════════════════════════════════════════
// service 层
// ═══════════════════════════════════════════════════════════════
import './service/settings/settings-service';
import './service/ai/api-call';
import './service/ai/prompt-builder';
import './service/table/update-process';
import './service/worldbook/pipeline';
import './service/worldbook/injection-engine';
import './service/data-admin/admin';
import './service/summary/merge-logic';
import './service/import/import-process';
import './service/runtime/init';
import './service/runtime/state-manager';
import './service/runtime/event-bus';
import './service/runtime/helpers-remaining';
import './service/runtime/api-registry';
import './service/template/chat-scope';
import './service/optimization/content-optimization';

// ═══════════════════════════════════════════════════════════════
// presentation 层
// ═══════════════════════════════════════════════════════════════
import './presentation/window/window-system';
import './presentation/window/window-styles';
import './presentation/theme/toast';
import './presentation/components/table-selector';
import './presentation/components/plot-editors';
import './presentation/components/status-display';
import './presentation/bootstrap/startup';
import './presentation/components/update-controls';
import './presentation/components/worldbook-selectors';
import './presentation/pages/main-popup';
import './presentation/pages/popup-bindings';
import './presentation/pages/popup-helpers';
import './presentation/pages/visualizer';
import './presentation/pages/visualizer-sidebar';
import './presentation/pages/visualizer-main';
import './presentation/components/template-preset-ui';
import './presentation/components/optimization-ui';
import './presentation/components/worldbook-selector';
import './presentation/components/update-status-display';
import './presentation/components/import-status-ui';
import './presentation/triggers/update-trigger';
import './presentation/triggers/data-admin-ui';
import './presentation/triggers/settings-ui-sync';

// ═══════════════════════════════════════════════════════════════
// 启动入口
// ═══════════════════════════════════════════════════════════════
import { mainInitialize_ACU } from './service/runtime/init';

// jQuery ready 回调
declare const $: any;
$(function() {
    console.log('ACU_INIT_DEBUG: Document is ready, attempting to initialize ACU script.');
    mainInitialize_ACU();
});
