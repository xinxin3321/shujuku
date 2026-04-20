// main-popup-table.ts
// 表格标签页 HTML生成
// 聚合：表格模板预设（来自data页） + 世界书注入（来自worldbook页） + 表格工具入口

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU } from '../../shared/template-preset-utils';

/**
 * 生成表格标签页的 HTML 片段
 * 包含：模板预设（全局/当前聊天双作用域）、世界书注入设置、表格工具入口
 */
export function generateTableTabHTML(): string {
    return `
                <div id="acu-tab-table" class="acu-tab-content">
                    <!-- A. 表格模板预设 -->
                    <div class="acu-card">
                        <h3>表格模板预设</h3>
                        <div class="acu-template-presets" style="background: var(--background-color-light); padding: 12px; border-radius: 8px;">
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
                                    <small class="notes">这里仅做全局模板预设库管理（导入 / 导出 / 另存为 / 重命名 / 删除）；需要覆盖保存全局模板时，请使用可视化编辑器顶部的"保存到全局"。</small>
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
                                    <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-origin-status" class="notes">这里仅做当前聊天模板预设的导入 / 导出；需要覆盖保存时，请在可视化编辑器中使用"保存到当前聊天"或"保存到全局"。</small>
                                </div>
                            </div>
                        </div>
                        <p class="notes" style="margin-top: 10px;">模板预设分为全局和当前聊天两个作用域。新聊天默认继承全局模板，也可为每个聊天单独配置。</p>
                    </div>

                    <!-- B. 世界书注入（从原worldbook页迁入，不含0TK） -->
                    <div class="acu-card">
                        <h3>世界书注入</h3>
                        <p class="notes">配置数据库条目注入到哪个世界书，以及AI读取上下文时使用哪些世界书。</p>
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target">数据注入目标:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-normal); background: var(--input-background); color: var(--input-text-color);">
                            <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target" style="width: 100%;"></select>
                            </div>
                            <small class="notes">选择数据库条目（如全局、人物、大纲等）将被创建或更新到哪个世界书里。</small>
                        </div>
                        <hr>
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

                    <!-- C. 表格工具入口 -->
                    <div class="acu-card">
                        <h3>表格工具</h3>
                        <div class="button-group" style="margin-top: 0;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer" class="primary acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-table-columns"></i> 打开可视化表格编辑器
                            </button>
                        </div>
                        <p class="notes" style="text-align: center; margin-top: 10px;">点击上方按钮打开全新的可视化界面，支持直接编辑数据、修改表头及更新参数。</p>
                    </div>
                </div>`;
}
