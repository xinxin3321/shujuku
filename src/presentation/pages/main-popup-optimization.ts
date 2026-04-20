// main-popup-optimization.ts
// Optimization标签页（正文替换）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成 Optimization 标签页的 HTML 片段
 * 包含：正文替换设置、基础设置、优化模式、标签筛选、预设管理、优化提示词、手动测试
 */
export function generateOptimizationTabHTML(): string {
    return `
                <!-- 正文替换Tab -->
                <div id="acu-tab-optimization">
                    <div class="acu-card">
                        <!-- 顶部标题和开关区域 -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border_color);">
                            <div>
                                <h3 style="margin: 0; color: var(--text_primary);">正文替换设置</h3>
                                <p class="notes" style="margin: 5px 0 0 0;">AI生成正文后，自动替换内容（在填表之前执行）</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-enabled" style="font-weight: 500; cursor: pointer;">启用功能</label>
                                <label class="toggle-switch">
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-enabled" type="checkbox" />
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- 基础设置区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-cog"></i> 基础设置
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset" style="font-weight: 500;">API预设</label>
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset" class="text_pole" style="width: 100%; margin-top: 5px;">
                                        <option value="">使用当前API配置</option>
                                    </select>
                                    <small class="notes">选择正文替换使用的API配置，留空则使用酒馆当前API</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-min-length" style="font-weight: 500;">最小优化长度</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-min-length" type="number" class="text_pole" min="0" step="10" value="100" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">正文长度小于此值时跳过优化</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-max-items" style="font-weight: 500;">最大优化项数</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-max-items" type="number" class="text_pole" min="1" max="100" step="1" value="10" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">单次优化的最大修改项数（1-100）</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count" style="font-weight: 500;">循环优化次数</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count" type="number" class="text_pole" min="1" max="10" step="1" value="1" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">优化完成后再次优化，达到完整优化效果（1-10次）</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count" style="font-weight: 500;">自动重试次数</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count" type="number" class="text_pole" min="1" max="10" step="1" value="3" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">API调用失败时自动重试（1-10次，默认3次）</small>
                                </div>
                            </div>
                        </div>

                        <!-- 优化模式设置 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-magic"></i> 优化模式
                            </h4>
                            <div style="display: grid; gap: 15px;">
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode">无感替换模式</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">显示"正在优化"遮罩，优化完成后直接显示结果，无闪烁</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply">自动应用优化结果</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">关闭时显示对比对话框，让用户选择是否应用</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff" checked>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff">显示优化对比</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">优化完成后显示修改摘要（非无感模式下有效）</small>
                                </div>
                                <div class="checkbox-group">
                                    <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode">填表与正文替换并行执行</label>
                                    <small class="notes" style="display: block; margin-left: 24px; margin-top: 4px;">勾选后填表不再等待正文替换完成，双方并行进行（默认关闭）</small>
                                </div>
                                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border_color_light);">
                                    <label style="font-weight: 500; display: block; margin-bottom: 8px;">快捷操作</label>
                                    <div style="display: flex; flex-direction: column; gap: 8px; align-items: stretch;">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reoptimize-latest" class="menu_button" title="对最近一次已执行正文替换的 AI 回复，基于替换前原文重新优化并再次替换" style="width: 100%; min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: normal; line-height: 1.4; text-align: center; padding: 10px 14px;">
                                            <i class="fa-solid fa-rotate-right"></i><span>重新优化上一次替换结果</span>
                                        </button>
                                    </div>
                                    <small class="notes" style="display: block; margin-top: 6px; line-height: 1.5;">这里会定位"最近一次已经被正文替换过的 AI 回复"，并使用替换前保留的原文重新优化后再次替换。取消正文优化请使用进行中提示框里的"取消优化"按钮。</small>
                                </div>
                            </div>
                        </div>
 
                        <!-- 标签筛选设置 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-filter"></i> 标签筛选
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px;">
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags" style="font-weight: 500;">标签提取</label>
                                    <input id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags" type="text" class="text_pole" placeholder="例如: think,plot" style="width: 100%; margin-top: 5px;">
                                    <small class="notes">仅提取指定标签内的内容进行优化</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label style="font-weight: 500;">正文标签提取规则</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-optimization-extract-add-rule" class="button" style="margin-top: 6px;">添加规则</button>
                                    <small class="notes">每条规则填写开始词和结束词，仅提取最后一组匹配内容</small>
                                </div>
                                <div class="qrf_settings_block" style="margin-bottom: 0;">
                                    <label style="font-weight: 500;">标签排除规则</label>
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules"></div>
                                    <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-add-rule" class="button" style="margin-top: 6px;">添加规则</button>
                                    <small class="notes">每条规则填写开始词和结束词，仅移除最后一组匹配内容</small>
                                </div>
                            </div>
                        </div>

                        <!-- 预设管理区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-bookmark"></i> 预设管理
                            </h4>
                            <div class="qrf_settings_block" style="margin-bottom: 0;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select" style="font-weight: 500;">选择预设</label>
                                <div class="qrf_preset_selector_wrapper acu-optimization-preset-wrapper" style="display: flex; gap: 8px; align-items: center; margin-top: 5px;">
                                    <select id="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select" class="text_pole" style="flex: 1;">
                                        <option value="">-- 选择一个预设 --</option>
                                    </select>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-preset" class="menu_button" title="覆盖保存当前预设" style="padding: 8px 12px;"><i class="fa-solid fa-save"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-as-new-preset" class="menu_button" title="另存为新预设" style="padding: 8px 12px;"><i class="fa-solid fa-file-export"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-import-presets" class="menu_button" title="导入预设" style="padding: 8px 12px;"><i class="fa-solid fa-upload"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-export-presets" class="menu_button" title="导出当前预设" style="padding: 8px 12px;"><i class="fa-solid fa-download"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reset-defaults" class="menu_button" title="恢复默认提示词" style="padding: 8px 12px; background-color: var(--orange); color: white;"><i class="fa-solid fa-undo"></i></button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-delete-preset" class="menu_button" title="删除当前选中的预设" style="display: none; padding: 8px 12px; background-color: var(--red);"><i class="fa-solid fa-trash-alt"></i></button>
                                    <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-optimization-preset-file-input" style="display: none;" accept=".json">
                                </div>
                                <small class="notes">选择预设应用提示词组设置，或保存当前配置为新预设</small>
                            </div>
                        </div>

                        <!-- 提示词设置区域 -->
                        <div class="settings-section" style="margin-bottom: 25px; padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-edit"></i> 优化提示词
                            </h4>
                            <div style="margin-bottom: 15px; padding: 12px; background: var(--background_default); border-radius: 6px; border-left: 3px solid var(--text_secondary);">
                                <small class="notes" style="color: var(--text_secondary);">
                                    <strong>占位符说明：</strong><br>
                                    <code>$CONTENT</code> - 自动替换为需要优化的正文内容<br>
                                    <code>$1</code> - 世界书内容（剧情推进专用）<br>
                                    <code>$5</code> - 纪要表/总体大纲表内容<br>
                                    <code>$6</code> - 上一轮剧情规划数据<br>
                                    <code>$7</code> - 前文上下文（仅AI输出）<br>
                                    <code>$8</code> - 本轮用户输入<br>
                                    <code>$U</code> - 用户设定描述 (persona_description)<br>
                                    <code>$C</code> - 角色描述 (char_description)<br>
                                    <strong>输出格式：</strong>AI需返回JSON格式的优化指令，包含 optimizations 数组
                                </small>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-prompt-constructor-area">
                                <div class="button-group" style="margin-bottom: 10px; justify-content: center;">
                                    <button class="${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn" data-position="top" title="在上方添加对话轮次">+</button>
                                </div>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-prompt-segments-container">
                                    <!-- 优化提示词段将动态插入这里 -->
                                </div>
                                <div class="button-group" style="margin-top: 10px; justify-content: center;">
                                    <button class="${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn" data-position="bottom" title="在下方添加对话轮次">+</button>
                                </div>
                            </div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-save-prompt-group" class="primary">保存提示词组</button>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-reset-prompt-group">恢复默认提示词组</button>
                            </div>
                        </div>

                        <!-- 手动测试区域 -->
                        <div class="settings-section" style="padding: 20px; background: var(--background_light); border-radius: 8px; border: 1px solid var(--border_color_light);">
                            <h4 style="margin: 0 0 15px 0; color: var(--text_primary); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-flask"></i> 手动测试
                            </h4>
                            <div class="qrf_settings_block" style="margin-bottom: 15px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-optimization-test-input" style="font-weight: 500;">测试文本</label>
                                <textarea id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-input" class="text_pole" rows="5" placeholder="输入需要优化的文本进行测试..." style="resize: vertical; margin-top: 5px;"></textarea>
                            </div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-btn" class="primary">执行优化测试</button>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-result" style="margin-top: 15px; display: none;">
                                <label style="font-weight: 500;">优化结果</label>
                                <div id="${SCRIPT_ID_PREFIX_ACU}-optimization-test-output" style="margin-top: 8px; padding: 12px; background: var(--background_default); border-radius: 6px; border: 1px solid var(--border_color_light); max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-size: 0.9em;"></div>
                            </div>
                        </div>
                    </div>
                </div>`;
}