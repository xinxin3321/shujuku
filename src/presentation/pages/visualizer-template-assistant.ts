import { generateTemplateAssistantDraft_ACU, type TemplateAssistantGenerateResult_ACU } from '../../service/template-assistant/service';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { jQuery_API_ACU } from '../dom-utils';
import { showToastr_ACU } from '../theme/toast';
import { applyTemplateAssistantDraftToVisualizer_ACU } from './visualizer-template-assistant-apply';
import { _acuVisState } from './visualizer';

type AssistantUiState = {
    isOpen: boolean;
    userRequest: string;
    isGenerating: boolean;
    result: TemplateAssistantGenerateResult_ACU | null;
    error: string;
    riskConfirmations: Record<string, boolean>;
};

const assistantUiState_ACU: AssistantUiState = {
    isOpen: false,
    userRequest: '',
    isGenerating: false,
    result: null,
    error: '',
    riskConfirmations: {},
};

function clearAssistantDraftState_ACU() {
    assistantUiState_ACU.result = null;
    assistantUiState_ACU.error = '';
    assistantUiState_ACU.riskConfirmations = {};
}

function getRiskConfirmationKey_ACU(index: number) {
    return String(index);
}

function getHost_ACU() {
    return jQuery_API_ACU('#acu-vis-assistant-host');
}

function getSelectedSheetLabel_ACU() {
    const sheetKey = _acuVisState.currentSheetKey;
    const sheet = sheetKey ? _acuVisState.tempData?.[sheetKey] : null;
    if (!sheetKey || !sheet) return '当前未选中表';
    return `${sheet.name || sheetKey} (${sheetKey})`;
}

function buildDiffHtml_ACU(result: TemplateAssistantGenerateResult_ACU) {
    const diff = result.compileResult.diff;
    const sections: string[] = [];
    const renderList = (items: string[]) => items.length ? `<ul>${items.map((item) => `<li>${escapeHtml_ACU(item)}</li>`).join('')}</ul>` : '<div class="acu-hint">无</div>';

    sections.push(`<div class="acu-assistant-diff-block"><strong>新增表</strong>${renderList(diff.addedSheets.map((item) => `${item.name} [${item.sheetKey}]`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>删除表</strong>${renderList(diff.deletedSheets.map((item) => `${item.name} [${item.sheetKey}]`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>重命名</strong>${renderList(diff.renamedSheets.map((item) => `${item.beforeName} -> ${item.afterName}`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>顺序变化</strong>${renderList(diff.movedSheets.map((item) => `${item.name}: ${item.fromIndex} -> ${item.toIndex}`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>sourceData patch</strong>${renderList(diff.patchedSourceDataSheets.map((item) => `${item.name}: ${item.keys.join(', ') || '字段已修改'}`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>updateConfig patch</strong>${renderList(diff.patchedUpdateConfigSheets.map((item) => `${item.name}: ${item.keys.join(', ') || '字段已修改'}`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>exportConfig patch</strong>${renderList(diff.patchedExportConfigSheets.map((item) => `${item.name}: ${item.keys.join(', ') || '字段已修改'}`))}</div>`);
    sections.push(`<div class="acu-assistant-diff-block"><strong>全局注入配置</strong>${diff.globalInjectionChanged ? '<div>已修改</div>' : '<div class="acu-hint">未修改</div>'}</div>`);
    return sections.join('');
}

function areHighRiskItemsConfirmed_ACU() {
    const result = assistantUiState_ACU.result;
    if (!result) return false;
    return result.compileResult.highRiskItems.every((_, index) => assistantUiState_ACU.riskConfirmations[getRiskConfirmationKey_ACU(index)]);
}

function renderResult_ACU() {
    const result = assistantUiState_ACU.result;
    if (!result) return '';

    const warningsHtml = result.draft.warnings.length
        ? `<ul>${result.draft.warnings.map((item) => `<li>${escapeHtml_ACU(item)}</li>`).join('')}</ul>`
        : '<div class="acu-hint">无</div>';
    const riskHtml = result.compileResult.highRiskItems.length
        ? result.compileResult.highRiskItems.map((item, index) => {
            const riskKey = getRiskConfirmationKey_ACU(index);
            return `
            <label class="acu-assistant-risk-item">
                <input type="checkbox" class="acu-assistant-risk-confirm" data-risk-key="${escapeHtml_ACU(riskKey)}" ${assistantUiState_ACU.riskConfirmations[riskKey] ? 'checked' : ''}>
                <span>${escapeHtml_ACU(item.label)}</span>
            </label>
        `;
        }).join('')
        : '<div class="acu-hint">无高风险操作</div>';
    const applyDisabled = result.compileResult.highRiskItems.length > 0 && !areHighRiskItemsConfirmed_ACU();

    return `
        <div class="acu-assistant-section">
            <div class="acu-assistant-title">草稿摘要</div>
            <div>${escapeHtml_ACU(result.draft.summary || '（无摘要）')}</div>
        </div>
        <div class="acu-assistant-section">
            <div class="acu-assistant-title">警告</div>
            ${warningsHtml}
        </div>
        <div class="acu-assistant-section">
            <div class="acu-assistant-title">变更 diff</div>
            ${buildDiffHtml_ACU(result)}
        </div>
        <div class="acu-assistant-section">
            <div class="acu-assistant-title">高风险确认</div>
            <div class="acu-assistant-risk-list">${riskHtml}</div>
        </div>
        <div class="acu-assistant-actions-row">
            <button id="acu-vis-assistant-apply" class="acu-btn-primary" ${applyDisabled ? 'disabled' : ''}>应用到编辑器</button>
        </div>
    `;
}

function bindEvents_ACU() {
    const $host = getHost_ACU();
    if (!$host.length || !assistantUiState_ACU.isOpen) return;

    $host.find('#acu-vis-assistant-input').on('input', function() {
        assistantUiState_ACU.userRequest = String(jQuery_API_ACU(this).val() || '');
    });

    $host.find('#acu-vis-assistant-generate').on('click', async () => {
        const requestSheetKey = _acuVisState.currentSheetKey || null;
        try {
            assistantUiState_ACU.isGenerating = true;
            clearAssistantDraftState_ACU();
            renderVisualizerTemplateAssistantPanel_ACU();

            const result = await generateTemplateAssistantDraft_ACU({
                tempData: JSON.parse(JSON.stringify(_acuVisState.tempData || {})),
                currentSheetKey: requestSheetKey,
                sheetOrder: Array.isArray(_acuVisState.sheetOrder) ? [..._acuVisState.sheetOrder] : null,
                userRequest: assistantUiState_ACU.userRequest,
            });
            if ((requestSheetKey || null) !== (_acuVisState.currentSheetKey || null)) {
                assistantUiState_ACU.error = '当前选中表已变化，请重新生成 assistant 草稿。';
                showToastr_ACU('warning', assistantUiState_ACU.error);
                return;
            }
            assistantUiState_ACU.result = result;
            assistantUiState_ACU.riskConfirmations = {};
        } catch (error: any) {
            assistantUiState_ACU.error = error?.message || '生成失败';
            showToastr_ACU('error', assistantUiState_ACU.error);
        } finally {
            assistantUiState_ACU.isGenerating = false;
            renderVisualizerTemplateAssistantPanel_ACU();
        }
    });

    $host.find('.acu-assistant-risk-confirm').on('change', function() {
        const riskKey = String(jQuery_API_ACU(this).data('risk-key') || '');
        assistantUiState_ACU.riskConfirmations[riskKey] = !!jQuery_API_ACU(this).prop('checked');
        renderVisualizerTemplateAssistantPanel_ACU();
    });

    $host.find('#acu-vis-assistant-apply').on('click', () => {
        if (!assistantUiState_ACU.result) return;
        const applied = applyTemplateAssistantDraftToVisualizer_ACU(assistantUiState_ACU.result);
        if (!applied) return;
        clearAssistantDraftState_ACU();
        renderVisualizerTemplateAssistantPanel_ACU();
    });
}

export function resetVisualizerTemplateAssistantState_ACU() {
    assistantUiState_ACU.isOpen = false;
    assistantUiState_ACU.userRequest = '';
    assistantUiState_ACU.isGenerating = false;
    clearAssistantDraftState_ACU();
    renderVisualizerTemplateAssistantPanel_ACU();
}

export function handleVisualizerTemplateAssistantSheetChange_ACU() {
    const currentSheetKey = _acuVisState.currentSheetKey || null;
    if (assistantUiState_ACU.result && assistantUiState_ACU.result.draft.selectedSheetKey !== currentSheetKey) {
        clearAssistantDraftState_ACU();
    }
    renderVisualizerTemplateAssistantPanel_ACU();
}

export function setVisualizerTemplateAssistantOpen_ACU(nextOpen: boolean) {
    assistantUiState_ACU.isOpen = !!nextOpen;
    renderVisualizerTemplateAssistantPanel_ACU();
}

export function toggleVisualizerTemplateAssistant_ACU() {
    assistantUiState_ACU.isOpen = !assistantUiState_ACU.isOpen;
    renderVisualizerTemplateAssistantPanel_ACU();
}

export function renderVisualizerTemplateAssistantPanel_ACU() {
    const $host = getHost_ACU();
    if (!$host.length) return;

    const display = assistantUiState_ACU.isOpen ? 'flex' : 'none';
    const generateDisabled = assistantUiState_ACU.isGenerating || !String(assistantUiState_ACU.userRequest || '').trim();

    $host.html(`
        <div class="acu-vis-assistant-panel" style="display:${display}; flex-direction:column; width:420px; border-left:1px solid var(--vis-border-color); background:var(--vis-bg-secondary, rgba(0,0,0,0.02)); overflow:auto;">
            <div style="padding:14px 16px; border-bottom:1px solid var(--vis-border-color); display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div>
                    <div style="font-weight:600;">AI 改表助手</div>
                    <div class="acu-hint" style="font-size:12px; margin-top:4px;">当前表：${escapeHtml_ACU(getSelectedSheetLabel_ACU())}</div>
                </div>
                <button id="acu-vis-assistant-close" class="acu-btn-secondary">关闭</button>
            </div>
            <div style="padding:16px; display:flex; flex-direction:column; gap:12px;">
                <textarea id="acu-vis-assistant-input" class="acu-form-textarea" style="min-height:120px;" placeholder="例如：新增一张战利品表，并关闭旧表独立导出。">${escapeHtml_ACU(assistantUiState_ACU.userRequest)}</textarea>
                <button id="acu-vis-assistant-generate" class="acu-btn-primary" ${generateDisabled ? 'disabled' : ''}>${assistantUiState_ACU.isGenerating ? '生成中...' : '生成草稿'}</button>
                ${assistantUiState_ACU.error ? `<div style="color:#c55;">${escapeHtml_ACU(assistantUiState_ACU.error)}</div>` : ''}
                ${renderResult_ACU()}
            </div>
        </div>
    `);

    $host.find('#acu-vis-assistant-close').on('click', () => {
        assistantUiState_ACU.isOpen = false;
        renderVisualizerTemplateAssistantPanel_ACU();
    });

    bindEvents_ACU();
}
