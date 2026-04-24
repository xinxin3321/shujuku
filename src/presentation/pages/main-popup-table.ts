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
                        <div class="acu-template-presets" style="background: var(--acu-bg-2); padding: 12px; border-radius: 8px;">
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
                        <p class="notes" style="margin-top: 10px;">模板预设分为全局和当前聊天两个作用域。新聊天默认继承全局模板，也可为每个聊天单独配置。</p>
                    </div>

                    <!-- B. 世界书注入（从原worldbook页迁入，不含0TK） -->
                    <div class="acu-card">
                        <h3>世界书注入</h3>
                        <p class="notes">配置数据库条目注入到哪个世界书，以及AI读取上下文时使用哪些世界书。</p>
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target">数据注入目标:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
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
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-filter" placeholder="筛选世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
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
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-filter" placeholder="筛选条目/世界书..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-list" class="qrf_worldbook_entry_list">
                                <!-- 条目将动态加载于此 -->
                            </div>
                        </div>
                        <hr>
                        <div style="margin-top: 15px; padding: 12px; border: 1px solid var(--acu-border-2); border-radius: 8px; background: var(--acu-bg-2);">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-enabled" style="font-weight: 600; margin-bottom: 4px; display: block;">向量远记忆召回</label>
                                    <small class="notes">发送前基于远记忆大总结的向量 chunk 召回相关长期记忆，并同步到专用世界书条目。</small>
                                </div>
                                <label style="display: inline-flex; align-items: center; gap: 8px; margin: 0; white-space: nowrap;">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-enabled">
                                    <span>启用向量记忆</span>
                                </label>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-config-block" style="display: none; margin-top: 12px;">
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">召回参数</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-threshold">近记忆保留阈值</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-threshold" min="1" step="1" placeholder="50">
                                            <small class="notes">纪要表中始终保留的最近条目数；未超过该值时不会自动归档。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-trigger-count">超额触发数量</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-trigger-count" min="1" step="1" placeholder="12">
                                            <small class="notes">超过保留阈值后，还需额外累计这么多条旧纪要，才会触发一次远记忆归档。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-topk">召回 TopK</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-topk" min="1" step="1" placeholder="20">
                                            <small class="notes">每次召回最多返回的候选记忆数量。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-min-score">最小分数</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-min-score" min="0" max="1" step="0.01" placeholder="0.75">
                                            <small class="notes">低于该相似度分数的结果将被忽略。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-recall-candidate-limit">候选召回上限</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-recall-candidate-limit" min="1" step="1" placeholder="100">
                                            <small class="notes">本地相似度计算后保留的候选数量，不能小于 TopK。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-namespace">命名空间前缀</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-namespace" placeholder="chat">
                                            <small class="notes">最终会与当前聊天标识拼接，形成实际 namespace。</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">Embedding 设置</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-endpoint">Embedding Endpoint</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-endpoint" placeholder="https://example.com/embeddings">
                                            <small class="notes">默认保持留空，避免把特定服务地址硬编码进全局默认配置。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-model">Embedding Model</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-model" placeholder="text-embedding-3-large">
                                            <small class="notes">默认保持留空；由助手自行填写实际使用的 embedding 模型。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-api-key">Embedding API Key</label>
                                            <input type="password" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-embedding-api-key" placeholder="留空表示不附带 Authorization">
                                            <small class="notes">敏感信息不写入默认值；需要时再单独配置。</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div class="acu-section-title">归档参数</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-overview-sentence-limit">概要分块句数</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-overview-sentence-limit" min="1" step="1" placeholder="2">
                                            <small class="notes">单个远记忆总结 chunk 最多包含几句；命中后会回卷整条大总结。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-batch-size">单批归档数量</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-batch-size" min="1" step="1" placeholder="4">
                                            <small class="notes">达到触发条件后，会把本轮应归档的最早超额纪要按这个数量切成多批处理。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-max-concurrency">归档并发数</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-max-concurrency" min="1" step="1" placeholder="3">
                                            <small class="notes">当本轮需要归档多个批次时，最多并发处理这么多批；全部成功后才统一删除原纪要并写入远记忆。</small>
                                        </div>
                                        <div class="acu-col-sm" style="display: flex; flex-direction: column; justify-content: flex-end;">
                                            <label style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-archive-without-summary">
                                                <span>不进行总结直接归档</span>
                                            </label>
                                            <small class="notes">勾选后跳过大总结生成，直接将本批纪要正文整理后向量化归档；其它召回与世界书逻辑保持不变。</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 0;">
                                    <div class="acu-section-title">条目与调用</div>
                                    <div class="acu-grid-auto">
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-entry-comment">条目备注 Comment</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-entry-comment" placeholder="TavernDB-ACU-VectorMemory">
                                            <small class="notes">用于识别专用向量记忆世界书条目。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-entry-key">条目 Key</label>
                                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-entry-key" placeholder="TavernDB-ACU-VectorMemory-Key">
                                            <small class="notes">用于向世界书写入统一的记忆召回条目。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-api-preset">关键词 API 预设</label>
                                            <select id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-api-preset" class="text_pole" style="width: 100%;">
                                                <option value="">使用当前API配置</option>
                                            </select>
                                            <small class="notes">仅用于"生成关键词"阶段；留空则使用当前主 API 配置，不再误用填表 API 预设。</small>
                                        </div>
                                        <div class="acu-col-sm">
                                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-context-pair-count">关键词上下文读取层数</label>
                                            <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-context-pair-count" min="1" step="1" placeholder="1">
                                            <small class="notes">关键词生成时读取的最近对话层数；1 层 = 1 条 AI 回复 + 其上方 1 条用户输入，不再截断。</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                        <div class="acu-section-title" style="margin-bottom: 0;">关键词生成提示词</div>
                                        <div style="display: flex; gap: 6px;">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-prompt-reset" class="acu-btn-small" style="font-size: 12px;">重置为默认</button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-prompt-add" class="acu-btn-small" style="font-size: 12px;">添加段落</button>
                                        </div>
                                    </div>
                                    <small class="notes" style="margin-bottom: 8px; display: block;">可用占位符：$RECENT_CONTEXT（最近上下文）、$USER_INPUT（当前用户输入）。</small>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-keyword-prompt-group" style="display: flex; flex-direction: column; gap: 8px;"></div>
                                </div>
                                <div class="acu-section" style="margin-bottom: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                        <div class="acu-section-title" style="margin-bottom: 0;">大总结提示词</div>
                                        <div style="display: flex; gap: 6px;">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-summary-prompt-reset" class="acu-btn-small" style="font-size: 12px;">重置为默认</button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-summary-prompt-add" class="acu-btn-small" style="font-size: 12px;">添加段落</button>
                                        </div>
                                    </div>
                                    <small class="notes" style="margin-bottom: 8px; display: block;">可用占位符：$SUMMARY_SOURCE_ROWS（待归档纪要批次正文）。</small>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-summary-prompt-group" style="display: flex; flex-direction: column; gap: 8px;"></div>
                                </div>
                                <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
                                    <small class="notes">大总结查看入口：当前在“数据管理”页的“远记忆总结管理”面板中。这里直接写明，避免入口藏得像根本没做。</small>
                                    <small class="notes">本方案只依赖 Embedding 接口，不再要求独立 Vector Store。命中的是远记忆 chunk，但注入世界书时会回卷整条远记忆大总结。</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- C. 表格工具入口 -->
                    <div class="acu-card">
                        <h3>表格工具</h3>
                        <div class="button-group" style="margin-top: 0; display: flex; flex-direction: column; gap: 10px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer" class="primary acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-table-columns"></i> 打开可视化表格编辑器
                            </button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-build-vector-index-now" class="acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-brain"></i> 立即执行远记忆归档
                            </button>
                        </div>
                        <p class="notes" style="text-align: center; margin-top: 10px;">点击上方按钮打开全新的可视化界面，支持直接编辑数据、修改表头及更新参数。</p>
                        <p class="notes" style="text-align: center; margin-top: 6px;">“立即执行远记忆归档”会先保存当前表格，再检测旧纪要是否超过阈值；达到后会把最早一批纪要归档成远记忆大总结并删除已成功归档的原始条目。</p>
                    </div>
                </div>`;
}
