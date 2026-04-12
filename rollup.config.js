/**
 * rollup.config.js
 *
 * 支持两种构建模式（通过环境变量 BUILD_MODE 切换）：
 * - concat（默认）：复现 scripts/build-index.js 的纯文本拼接行为，产物逐字节一致
 * - module：标准 import/export 模式，用于后续模块化重构阶段
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILD_MODE = process.env.BUILD_MODE || 'concat';

// ═══════════════════════════════════════════════════════════════
// buildOrder：与 scripts/build-index.js 完全一致的文件顺序
// ═══════════════════════════════════════════════════════════════
const buildOrder = [
  'src/core/01_header_and_env.js',
  'src/ui/01_window_system.js',
  'src/core/02_storage_and_profile.js',
  'src/ui/02_shared_editors_and_selectors.js',
  'src/core/03_runtime_api.js',
  'src/ui/03_theme_and_toast.js',
  'src/core/04_shared_helpers.js',
  'src/ui/04_table_selectors.js',
  'src/core/05_core_tail.js',
  'src/features/startup/01_ready_and_menu.js',
  'src/features/import/01_import_cleanup.js',
  'src/features/import/02_import_lorebook_snapshot.js',
  'src/features/import/03_import_processing.js',
  'src/features/worldbook/01_plot_worldbook.js',
  'src/features/worldbook/02_selection_support.js',
  'src/features/worldbook/03_worldbook_list.js',
  'src/ui/05_main_popup.js',
  'src/features/runtime/01_runtime_state.js',
  'src/features/worldbook/04_pipeline_core.js',
  'src/features/ai/01_prompt_prepare.js',
  'src/features/ai/02_api_call.js',
  'src/features/table/01_update_process.js',
  'src/features/summary/01_summary_logic.js',
  'src/features/ui/01_update_trigger.js',
  'src/features/data/01_data_admin.js',
  'src/ui/06_visualizer.js',
  'src/features/ai/direct_bridge.js',
  'src/03_bootstrap.js',
];

// ═══════════════════════════════════════════════════════════════
// concat 模式：自定义插件，复现 build-index.js 的行为
// ═══════════════════════════════════════════════════════════════
function concatBuildPlugin() {
  return {
    name: 'concat-build',
    buildStart() {
      // 标记为不走标准 rollup 解析
    },
    resolveId(source) {
      if (source === 'virtual:concat-entry') return source;
      return null;
    },
    load(id) {
      if (id === 'virtual:concat-entry') {
        // 返回一个空模块，实际输出由 generateBundle 处理
        return 'export default null;';
      }
      return null;
    },
    generateBundle(options, bundle) {
      // 删除 rollup 默认生成的 bundle
      for (const fileName of Object.keys(bundle)) {
        delete bundle[fileName];
      }

      // 复现 build-index.js 的拼接逻辑
      const parts = buildOrder.map((relPath) => {
        const absPath = join(__dirname, relPath);
        return readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
      });
      const result = parts.join('\n');

      // 确保 dist/ 目录存在
      const distDir = join(__dirname, 'dist');
      mkdirSync(distDir, { recursive: true });

      // 直接写入文件（绕过 rollup 的 asset 系统以保证精确控制）
      writeFileSync(join(distDir, 'index.bundle.js'), result, 'utf8');

      console.log(`[rollup:concat] 输出 dist/index.bundle.js (${result.split('\n').length} 行)`);
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// 配置导出
// ═══════════════════════════════════════════════════════════════
let config;

if (BUILD_MODE === 'concat') {
  config = {
    input: 'virtual:concat-entry',
    plugins: [concatBuildPlugin()],
    output: {
      dir: 'dist',
      format: 'es', // 不重要，generateBundle 会覆盖输出
    },
  };
} else {
  // ═══════════════════════════════════════════════════════════════
  // module 模式：渐进式模块化
  //
  // 核心策略：
  // 1. shared/*.ts 中的函数通过 export 声明（源码层面的模块边界）
  // 2. 构建时，这些 .ts 文件被 TypeScript 编译为 .js
  // 3. 编译后的 JS 去掉 export 关键字，注入到旧文件 IIFE 内部
  //    （在 'use strict'; 之后，其他代码之前）
  // 4. 旧文件中被搬走的函数删除，由注入的代码提供
  // 5. 由于都在同一 IIFE 闭包内，函数名自动可见
  //
  // 这样做的好处：
  // - 源码层面有清晰的模块边界（export）
  // - 产物层面保持 IIFE 单文件，与基线功能等价
  // - 渐进迁移：每搬一个函数，构建验证一次
  // ═══════════════════════════════════════════════════════════════

  // shared/ 模块列表（随着迁移进度逐步添加）
  // 每个条目：{ path: 相对路径, insertBefore: 在 buildOrder 中哪个文件之前注入 }
  // 注入位置：在 IIFE 'use strict'; 之后，但在被依赖的旧文件之前
  const sharedModules = [
    { path: 'src/shared/constants.ts' },
    { path: 'src/shared/env.ts' },
    { path: 'src/shared/service-locator.ts' },
    { path: 'src/shared/utils.ts' },
    { path: 'src/shared/json-helpers.ts' },
    { path: 'src/shared/html-helpers.ts' },
    { path: 'src/shared/text-optimization.ts' },
    { path: 'src/data/constants.ts' },
    { path: 'src/data/storage/idb-import-temp.ts' },
    { path: 'src/data/storage/tavern-storage.ts' },
    { path: 'src/data/storage/chat-history.ts' },
    { path: 'src/data/models/defaults.ts' },
    { path: 'src/data/models/defaults-json.js' },
    { path: 'src/data/repositories/profile-repo.ts' },
    { path: 'src/data/repositories/isolation-repo.ts' },
    { path: 'src/data/repositories/template-preset-repo.ts' },
    { path: 'src/data/repositories/character-settings-repo.ts' },
    { path: 'src/data/repositories/table-repo.ts' },
    { path: 'src/service/settings/settings-service.ts' },
    { path: 'src/service/ai/api-call.ts' },
    { path: 'src/service/ai/prompt-builder.ts' },
    { path: 'src/service/table/update-process.ts' },
    { path: 'src/service/worldbook/pipeline.ts' },
    { path: 'src/service/worldbook/injection-engine.ts' },
    { path: 'src/service/data-admin/admin.ts' },
    { path: 'src/service/summary/merge-logic.ts' },
    { path: 'src/service/import/import-process.ts' },
    { path: 'src/service/runtime/init.ts' },
    { path: 'src/service/runtime/state-manager.ts' },
    { path: 'src/service/runtime/event-bus.ts' },
    { path: 'src/service/template/chat-scope.ts' },
    { path: 'src/service/optimization/content-optimization.ts' },
    { path: 'src/presentation/window/window-system.ts' },
    { path: 'src/presentation/theme/toast.ts' },
    { path: 'src/presentation/components/table-selector.ts' },
    { path: 'src/presentation/components/plot-editors.ts' },
    { path: 'src/presentation/components/status-display.ts' },
    { path: 'src/presentation/bootstrap/startup.ts' },
    { path: 'src/presentation/components/update-controls.ts' },
    { path: 'src/presentation/components/worldbook-selectors.ts' },
    { path: 'src/presentation/pages/main-popup.ts' },
    { path: 'src/presentation/pages/visualizer.ts' },
  ];

  function moduleAssemblyPlugin() {
    return {
      name: 'module-assembly',
      resolveId(source) {
        if (source === 'virtual:module-entry') return source;
        return null;
      },
      load(id) {
        if (id === 'virtual:module-entry') {
          return 'export default null;';
        }
        return null;
      },
      generateBundle(options, bundle) {
        // 删除 rollup 默认生成的 bundle
        for (const fileName of Object.keys(bundle)) {
          delete bundle[fileName];
        }

        // 1. 编译 shared/*.ts → JS（简单的 TypeScript 剥离）
        let sharedCode = '';
        if (sharedModules.length > 0) {
          const esmRequire = createRequire(import.meta.url);
          const ts = esmRequire('typescript');
          const sharedParts = [];

          for (const mod of sharedModules) {
            const tsSource = readFileSync(join(__dirname, mod.path), 'utf8').replace(/\r\n/g, '\n');
            let jsCode;
            // .js 文件直接使用，不经 TS 编译（避免中文引号等特殊字符被破坏）
            if (mod.path.endsWith('.js')) {
              jsCode = tsSource;
            } else {
              // 用 TypeScript 编译器转译（去类型注解，保留 JS 逻辑）
              const result = ts.transpileModule(tsSource, {
                compilerOptions: {
                  target: ts.ScriptTarget.ES2020,
                  module: ts.ModuleKind.ESNext,
                  removeComments: false,
                  strict: false,
                },
              });
              jsCode = result.outputText;
            }
            // export function foo() → function foo()
            // export async function foo() → async function foo()
            jsCode = jsCode.replace(/^export\s+(async\s+)?function\s/gm, '$1function ');
            // export const foo = → const foo =
            jsCode = jsCode.replace(/^export\s+const\s/gm, 'const ');
            // export let foo = → let foo =
            jsCode = jsCode.replace(/^export\s+let\s/gm, 'let ');
            // export var foo = → var foo =
            jsCode = jsCode.replace(/^export\s+var\s/gm, 'var ');
            // export default → (保留，通常不会在纯工具模块中出现)
            // export { ... } → 删除
            jsCode = jsCode.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
            // import 语句 → 删除（依赖已在 IIFE 闭包内由先前注入的模块提供）
            jsCode = jsCode.replace(/^import\s+.*;\s*$/gm, '');
            sharedParts.push(`// ── [shared] ${mod.path} ──\n${jsCode}`);
          }
          sharedCode = sharedParts.join('\n\n');
        }

        // 2. 旧文件拼接体
        const legacyParts = buildOrder.map((relPath) => {
          const absPath = join(__dirname, relPath);
          return readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
        });
        const legacyConcat = legacyParts.join('\n');

        // 3. 提取 UserScript 头（前 11 行）
        const allLines = legacyConcat.split('\n');
        const userScriptBanner = allLines.slice(0, 11).join('\n');
        const bodyAfterHeader = allLines.slice(11).join('\n');

        // 4. 组装最终产物
        let result;
        if (sharedCode) {
          // 在 IIFE 'use strict'; 之后注入 shared/ 代码
          // 旧文件第 12 行开始是空行，第 13 行是 (function () {，第 14 行是 'use strict';
          // 找到 'use strict'; 的位置
          const useStrictMatch = bodyAfterHeader.match(/^(\s*\(function\s*\(\)\s*\{[\r\n]+\s*'use strict';)/m);
          if (useStrictMatch) {
            const insertPos = bodyAfterHeader.indexOf(useStrictMatch[0]) + useStrictMatch[0].length;
            const beforeInsert = bodyAfterHeader.slice(0, insertPos);
            const afterInsert = bodyAfterHeader.slice(insertPos);
            result = userScriptBanner + '\n' + beforeInsert +
              '\n\n// ════════════════════════════════════════════════════════\n' +
              '// [rollup:module] 以下为 shared/ 模块编译注入\n' +
              '// ════════════════════════════════════════════════════════\n' +
              sharedCode +
              '\n// ════════════════════════════════════════════════════════\n' +
              '// [rollup:module] shared/ 注入结束\n' +
              '// ════════════════════════════════════════════════════════\n' +
              afterInsert;
          } else {
            // 找不到 'use strict'，回退到直接拼接
            console.warn('[rollup:module] 警告：未找到 IIFE use strict 位置，shared 代码将拼接在头部之后');
            result = userScriptBanner + '\n' + sharedCode + '\n' + bodyAfterHeader;
          }
        } else {
          // 无 shared 模块，与 concat 模式完全一致
          result = userScriptBanner + '\n' + bodyAfterHeader;
        }

        // 5. 写入
        const distDir = join(__dirname, 'dist');
        mkdirSync(distDir, { recursive: true });
        writeFileSync(join(distDir, 'index.bundle.js'), result, 'utf8');

        console.log(`[rollup:module] 输出 dist/index.bundle.js (${result.split('\n').length} 行)${sharedModules.length > 0 ? ` [注入 ${sharedModules.length} 个 shared 模块]` : ''}`);
      },
    };
  }

  config = {
    input: 'virtual:module-entry',
    plugins: [moduleAssemblyPlugin()],
    output: {
      dir: 'dist',
      format: 'es',
    },
  };
}

export default config;
