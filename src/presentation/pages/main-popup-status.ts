// main-popup-status.ts
// 仪表盘标签页 HTML生成
// 原status页拆分：仪表盘（本文件）+ 更新（main-popup-update.ts）

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成仪表盘标签页的 HTML 片段
 * 包含：数据库状态总览、快速操作、核心功能开关、API快照
 * 
 * 承接原status页的：
 * - 数据库状态卡片（状态总览+表格）
 * - 核心操作区的手动更新按钮
 * - 自动更新/规范填表/静默提示框/条件模板/0TK 等开关
 * - 表格存储模式
 * 
 * 新迁入：
 * - 0TK占用模式（从worldbook页迁入）
 */
export function generateDashboardTabHTML(): string {
    return `
                <div id="acu-tab-dashboard" class="acu-tab-content active">
                    <!-- A. 数据库状态卡片 -->
                    <div class="acu-card">
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

                    <!-- B. 快速操作卡片 -->
                    <div class="acu-grid">
                        <div class="acu-card">
                            <h3>快速操作</h3>
                            <div class="flex-center" style="flex-direction: column; gap: 10px;">
                                <div style="width: 100%; display: flex; gap: 10px; align-items: center;">
                                    <label style="white-space: nowrap; font-size: 0.9em;">填表API预设:</label>
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-table-api-preset-select" style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-normal);">
                                        <option value="">使用当前API配置</option>
                                    </select>
                                </div>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-manual-update-card" class="primary" style="width:100%;">立即手动更新</button>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-manual-extra-hint-checkbox">额外提示词（仅手动更新时临时追加）</label>
                                </div>
                            </div>
                            <p class="notes" style="margin-top: 10px;">手动更新会使用当前UI参数，对勾选的表进行更新；未勾选则默认更新全部表。</p>
                            <p class="notes" style="margin-top: 6px;">勾选"额外提示词"后，点击手动更新会弹出输入框，内容将写入AI指令预设中的 $8 占位符，仅本次操作生效。</p>
                        </div>
                    </div>

                    <!-- 手动更新表选择 -->
                    <div class="acu-card">
                        <h3>手动更新表选择</h3>
                        <div class="notes" style="margin-bottom:6px;">选择需要手动更新的表（可多选，默认全选新表）：</div>
                        <div class="button-group" style="justify-content:flex-start; gap:8px; margin-bottom:6px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-table-select-all" class="button">全选</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-manual-table-select-none" class="button">全不选</button>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-manual-table-selector" style="min-height:60px;">加载表格列表中...</div>
                    </div>

                    <!-- C. 核心功能开关卡片 -->
                    <div class="acu-card">
                        <h3>核心功能开关</h3>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
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
                            <!-- 0TK占用模式：从worldbook页迁入仪表盘 -->
                            <div class="checkbox-group">
                                <label class="toggle-switch">
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled" type="checkbox" />
                                    <span class="slider"></span>
                                </label>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled">0TK占用模式</label>
                            </div>
                            <small class="notes">0TK占用模式仍然作用于世界书注入链路，仅迁移到此处以提高可见性。</small>

                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-normal);">
                                <label style="font-weight: 500; font-size: 0.9em; margin-bottom: 8px; display: block;">表格存储模式:</label>
                                <div style="display: flex; gap: 16px; align-items: center;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <input type="radio" name="${SCRIPT_ID_PREFIX_ACU}-storage-mode" value="native" checked>
                                        <span>原生模式 (JSON/DSL)</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <input type="radio" name="${SCRIPT_ID_PREFIX_ACU}-storage-mode" value="sqlite">
                                        <span>SQLite 模式 (SQL)</span>
                                    </label>
                                </div>
                                <small class="notes" style="margin-top: 4px; display: block;">原生模式使用 JSON 二维数组 + DSL 指令；SQLite 模式使用内存数据库 + 标准 SQL 语句。切换后会自动重新加载数据。</small>
                            </div>
                        </div>
                    </div>
                </div>`;
}
