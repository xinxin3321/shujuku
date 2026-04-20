// main-popup-datamgmt.ts
// 数据管理标签页 HTML生成
// 承接原data页的数据隔离、删除清理、备份恢复、Medusa合并

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成数据管理标签页的 HTML 片段
 * 包含：数据隔离、删除与清理、备份与恢复、纪要合并(Medusa)
 */
export function generateDataMgmtTabHTML(): string {
    return `
                <div id="acu-tab-datamgmt" class="acu-tab-content">
                    <!-- A. 数据隔离 -->
                    <div class="acu-card">
                        <h3>数据隔离</h3>
                        <p class="notes">在此处输入特定的标识代码，插件将只读取和保存带有该标识的数据。若留空则使用默认数据。</p>
                        <div class="setting-item" style="margin-bottom: 15px; border-bottom: 1px dashed var(--border-normal); padding-bottom: 15px;">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-input-area" style="margin-top: 10px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code">标识代码:</label>
                                <div class="acu-data-isolation-row" style="display: flex; gap: 10px; margin-top: 5px; align-items: flex-start;">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo" style="position: relative; flex-grow: 1; display: flex; align-items: center;">
                                        <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code" placeholder="输入标识代码 (留空则不隔离)" style="flex-grow: 1; padding-right: 36px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle" title="历史标识代码" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 1px solid var(--border-normal); background: var(--bg-secondary); color: var(--text-main); padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1;">▼</button>
                                        <ul id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list" style="display: none; position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--bg-primary); border: 1px solid var(--border-normal); border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); list-style: none; margin: 0; padding: 6px 0; max-height: 220px; overflow-y: auto; z-index: 9999;"></ul>
                                    </div>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-save" class="primary" style="white-space: nowrap;">保存并应用</button>
                                </div>
                                <p class="notes" style="margin-top: 5px;">输入代码并点击保存后，将重新载入对应的本地数据。</p>
                            </div>
                            <div style="margin-top: 10px; text-align: right;">
                        <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-delete-entries" class="btn-danger" style="padding: 5px 10px; border-radius: 4px; font-size: 0.9em;">删除当前标识的注入条目</button>
                            </div>
                        </div>
                    </div>

                    <!-- B. 备份与恢复 -->
                    <div class="acu-card">
                        <h3>备份与恢复</h3>
                        <p class="notes">导入/导出当前对话的数据库，或管理全局模板。</p>
                        <div class="button-group acu-data-mgmt-buttons acu-cols-2">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-combined-settings" class="primary">合并导入(模板+指令)</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-combined-settings" class="primary">合并导出(模板+指令)</button>
                        </div>
                        <hr style="border-color: var(--border-normal); margin: 15px 0;">
                        <div class="button-group acu-data-mgmt-buttons acu-cols-3">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-json-data">导出JSON数据</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults" class="btn-warning">恢复默认模板及提示词</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-override-with-template" class="btn-danger">模板覆盖最新层数据</button>
                        </div>
                    </div>

                    <!-- C. 删除与清理 -->
                    <div class="acu-card">
                        <h3>删除与清理</h3>
                        <!-- 楼层范围选择 -->
                        <div style="background: var(--background-color-light); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.9em; color: var(--text-color); font-weight: 500;">删除范围设置</h4>
                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" style="font-weight: 500; font-size: 0.85em;">起始AI楼层:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" min="1" value="1" placeholder="1" style="width: 100%; padding: 4px 8px; border: 1px solid var(--border-normal); border-radius: 4px; background: var(--input-background); color: var(--input-text-color);">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" style="font-weight: 500; font-size: 0.85em;">终止AI楼层:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" min="1" placeholder="留空删除到最后" style="width: 100%; padding: 4px 8px; border: 1px solid var(--border-normal); border-radius: 4px; background: var(--input-background); color: var(--input-text-color);">
                                </div>
                            </div>
                            <div style="margin-top: 6px; font-size: 0.8em; color: var(--text-color-dimmed);">
                                默认全选所有AI楼层，可设置范围精确删除（只计算AI回复）
                            </div>
                        </div>

                        <div class="button-group acu-data-mgmt-buttons acu-cols-2">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-current-local-data" class="btn-warning">删除当前标识本地数据</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-all-local-data" class="btn-danger">删除所有本地数据 (慎用)</button>
                        </div>
                    </div>

                    <!-- D. 纪要合并 (Medusa) -->
                    <div class="acu-card">
                        <h3 style="text-align: center; margin-bottom: 15px;">纪要合并 (Medusa)</h3>
                        <p class="notes" style="text-align: center; margin-bottom: 20px;">将当前的纪要表进行批量合并与精简。</p>

                        <!-- 手动合并参数 -->
                        <div style="background: var(--background-color-light); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--text-color); border-bottom: 1px solid var(--border-normal); padding-bottom: 8px;">手动合并参数</h4>

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
                        <div style="background: var(--background-color-light); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--text-color); border-bottom: 1px solid var(--border-normal); padding-bottom: 8px;">自动合并设置</h4>

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
                        <div style="background: var(--background-color-light); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 1em; color: var(--text-color); border-bottom: 1px solid var(--border-normal); padding-bottom: 8px;">提示词模板</h4>
                            <textarea id="${SCRIPT_ID_PREFIX_ACU}-merge-prompt-template" style="height: 120px; font-size: 0.85em; font-family: monospace; width: 100%; resize: vertical;" placeholder="正在加载提示词模板..."></textarea>
                        </div>

                        <!-- 操作按钮 -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-save-merge-settings" style="padding: 10px; background: var(--button-background); border: 1px solid var(--border-normal); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fa-solid fa-save" style="margin-right: 5px;"></i>保存设置
                            </button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-restore-merge-settings" style="padding: 10px; background: var(--button-secondary-background, #f8f9fa); border: 1px solid var(--border-normal); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fa-solid fa-undo" style="margin-right: 5px;"></i>恢复默认
                            </button>
                        </div>

                        <button id="${SCRIPT_ID_PREFIX_ACU}-start-merge-summary" class="primary" style="width: 100%; padding: 12px; font-size: 1em;">
                            <i class="fa-solid fa-play" style="margin-right: 8px;"></i>开始合并纪要
                        </button>
                    </div>
                </div>`;
}
