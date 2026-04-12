/**
 * rollup.config.js — 真正的模块化构建
 *
 * 使用 @rollup/plugin-typescript 编译 TS，Rollup 做真正的模块图解析。
 * 输出格式：IIFE（油猴环境要求）。
 * 产物结构：UserScript 头 → IIFE 闭包 → 模块代码
 */
import typescript from '@rollup/plugin-typescript';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════
// UserScript 头
// ═══════════════════════════════════════════════════════════════
const USER_SCRIPT_BANNER = `// ==UserScript==
// @name         数据库-可定制副本
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  为不同的角色卡提供独立的、使用不同默认模板的数据库。通过修改 @name 和 UNIQUE_SCRIPT_ID 来创建互不干扰的副本。
// @author       Cline (AI Assisted)
// @match        */*
// @grant        none
// @注释掉的require  https://code.jquery.com/jquery-3.7.1.min.js
// @注释掉的require  https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js
// ==/UserScript==`;

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.bundle.js',
    format: 'iife',
    banner: USER_SCRIPT_BANNER,
    sourcemap: false,
  },
  // 禁用 tree-shaking：所有模块都通过闭包作用域互相调用，
  // 没有显式 import 链但运行时确实需要
  treeshake: false,
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      // 覆盖 noEmit 以允许 Rollup 拿到编译产物
      compilerOptions: {
        noEmit: false,
        declaration: false,
        declarationMap: false,
        sourceMap: false,
        outDir: 'dist',
      },
      // .js 文件也参与编译（defaults-json.js 需要）
      include: ['src/**/*.ts', 'src/**/*.js'],
    }),
  ],
  // 外部依赖（油猴环境下由宿主页面提供的全局变量）
  // jQuery ($) 和 SillyTavern 全局对象不需要打包
  external: [
    // tavern-storage.ts 中的运行时动态 import（在酒馆环境中按需加载）
    './script.js',
    './scripts/extensions.js',
  ],
  onwarn(warning, warn) {
    // 忽略 "this" 相关警告（IIFE 模式下常见）
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    // 忽略循环依赖警告（由于旧代码结构，暂时不可避免）
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
};
