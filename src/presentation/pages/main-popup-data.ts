// main-popup-data.ts
// Data标签页（数据管理）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU } from '../../shared/template-preset-utils';

/**
 * 生成 Data 标签页的 HTML 片段
 * 包含：数据隔离、数据管理、模板预设、纪要合并
 */
export function generateDataTabHTML(): string {
    return `
                <div id="acu-tab-data" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>数据隔离</h3>
                        <p class="notes">在此处输入特定的标识代码，插件将只读取和保存带有该标识的数据。若留空则使用默认数据。</p>
                        <div class="setting-item" style="margin-bottom: 15px; border-bottom: 1px dashed var(--acu-border-2); padding-bottom: 15px;">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-input-area" style="margin-top: 10px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code">标识代码:</label>
                                <div class="acu-data-isolation-row" style="display: flex; gap: 10px; margin-top: 5px; align-items: flex-start;">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo" style="position: relative; flex-grow: 1; display: flex; align-items: center;">
                                        <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code" placeholder="输入标识代码 (留空则不隔离)" style="flex-grow: 1; padding-right: 36px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle" title="历史标识代码" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 1px solid var(--acu-border-2); background: var(--acu-bg-1); color: var(--acu-text-1); padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1;">▼</button>
                                        <ul id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list" style="display: none; position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--acu-bg-0); border: 1px solid var(--acu-border-2); border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); list-style: none; margin: 0; padding: 6px 0; max-height: 220px; overflow-y: auto; z-index: 9999;"></ul>
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
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                        <div class="button-group acu-data-mgmt-buttons acu-cols-3">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-json-data">导出JSON数据</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults" class="btn-warning">恢复默认模板及提示词</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-override-with-template" class="btn-danger">模板覆盖最新层数据</button>
                        </div>
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                        <div class="acu-template-presets" style="background: var(--acu-bg-2); padding: 12px; border-radius: 8px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 0.95em; font-weight: 600;">表格模板预设（全局 / 当前聊天）</h4>
                            <div class="acu-data-template-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start;">
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">全局正在使用</div>
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
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">当前聊天正在使用</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-scope-status" class="notes">未做聊天级保存时，这里会直接跟随全局模板</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--acu-success) 14%, transparent); color: var(--acu-success); font-size: 12px; font-weight: 600;">聊天</span>
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
                        <!-- 楼层范围选择 -->
                        <div style="background: var(--acu-bg-2); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.9em; color: var(--acu-text-1); font-weight: 500;">删除范围设置</h4>
                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" style="font-weight: 500; font-size: 0.85em;">起始AI楼层:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" min="1" value="1" placeholder="1" style="width: 100%; padding: 4px 8px; border: 1px solid var(--acu-border-2); border-radius: 4px; background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" style="font-weight: 500; font-size: 0.85em;">终止AI楼层:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" min="1" placeholder="留空删除到最后" style="width: 100%; padding: 4px 8px; border: 1px solid var(--acu-border-2); border-radius: 4px; background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                                </div>
                            </div>
                            <div style="margin-top: 6px; font-size: 0.8em; color: var(--acu-text-3);">
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
                        <h3>远记忆总结管理</h3>
                        <p class="notes">查看当前聊天已经归档的远记忆大总结，支持按批次浏览、编辑并整体保存到最新 AI 楼层。</p>
                        <div style="display: grid; grid-template-columns: minmax(180px, 220px) 1fr; gap: 14px; align-items: start;">
                            <div style="display: flex; flex-direction: column; gap: 10px; min-height: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                    <strong style="font-size: 0.95em; color: var(--acu-text-1);">远记忆批次</strong>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-refresh" class="acu-mini-btn" type="button">刷新</button>
                                </div>
                                <div style="max-height: 320px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px;">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-empty" class="notes" style="padding: 10px; border: 1px dashed var(--acu-border-2); border-radius: 6px; background: var(--acu-bg-2);">当前聊天暂无远记忆总结。</div>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-batch-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 10px; min-width: 0;">
                                <div id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-detail-meta" class="notes" style="min-height: 20px;">请选择左侧总结批次。</div>
                                <textarea id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-summary-text" style="height: 220px; font-size: 0.9em; width: 100%; resize: vertical;" placeholder="请选择左侧总结批次后查看或编辑内容。" disabled></textarea>
                                <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-delete-all" type="button">全部删除</button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-reset" type="button">恢复原文</button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-remote-memory-save" class="primary" type="button">保存到最新楼层</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="acu-card">
                        <h3 style="text-align: center; margin-bottom: 15px;">纪要合并 (Medusa)</h3>
                        <p class="notes" style="text-align: center; margin-bottom: 20px;">将当前的纪要表进行批量合并与精简。</p>

                        <!-- 手动合并参数 -->
                        <div style="background: var(--acu-bg-2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--acu-text-1); border-bottom: 1px solid var(--acu-border-2); padding-bottom: 8px;">手动合并参数</h4>

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
                        <div style="background: var(--acu-bg-2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--acu-text-1); border-bottom: 1px solid var(--acu-border-2); padding-bottom: 8px;">自动合并设置</h4>

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
                        <div style="background: var(--acu-bg-2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--acu-text-1); border-bottom: 1px solid var(--acu-border-2); padding-bottom: 8px;">提示词模板</h4>
                            <textarea id="${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template" style="height: 120px; font-size: 0.85em; font-family: monospace; width: 100%; resize: vertical;" placeholder="正在加载提示词模板..."></textarea>
                        </div>

                        <!-- 操作按钮 -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-save-merge-settings" style="padding: 10px; background: var(--acu-bg-1); border: 1px solid var(--acu-border-2); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fa-solid fa-save" style="margin-right: 5px;"></i>保存设置
                            </button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-restore-merge-settings" style="padding: 10px; background: var(--acu-bg-2); border: 1px solid var(--acu-border-2); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fa-solid fa-undo" style="margin-right: 5px;"></i>恢复默认
                            </button>
                        </div>

                        <button id="${SCRIPT_ID_PREFIX_ACU}-start-merge-summary" class="primary" style="width: 100%; padding: 12px; font-size: 1em;">
                            <i class="fa-solid fa-play" style="margin-right: 8px;"></i>开始合并纪要
                        </button>
                    </div>
                </div>`;
}