import { callAIWithPreset_ACU } from '../ai/api-call';
import { settings_ACU } from '../runtime/state-manager';
import { getSortedSheetKeys_ACU } from '../template/chat-scope';
import { getGlobalInjectionConfigFromData_ACU } from '../worldbook/injection-engine';
import { safeJsonStringify_ACU } from '../../shared/json-helpers';
import { hashUserInput_ACU } from '../../shared/utils';
import { compileTemplateAssistantDraft_ACU, type TemplateAssistantCompileResult_ACU } from './compiler';

type AnyRecord = Record<string, any>;

export interface TemplateAssistantOperation_ACU {
    op: string;
    [key: string]: any;
}

export interface TemplateAssistantDraft_ACU {
    protocolVersion: number;
    mode: 'modify_current_template_incremental';
    baseFingerprint: string;
    selectedSheetKey: string;
    summary: string;
    warnings: string[];
    operations: TemplateAssistantOperation_ACU[];
}

export interface TemplateAssistantGenerateInput_ACU {
    tempData: AnyRecord;
    currentSheetKey: string | null;
    sheetOrder?: string[] | null;
    userRequest: string;
}

export interface TemplateAssistantGenerateResult_ACU {
    draft: TemplateAssistantDraft_ACU;
    aiRawText: string;
    messages: Array<{ role: string; content: string }>;
    compileResult: TemplateAssistantCompileResult_ACU;
}

function clone_ACU<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function asObject_ACU(value: any, fallback: AnyRecord = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function extractHeaders_ACU(sheet: any) {
    return Array.isArray(sheet?.content?.[0]) ? sheet.content[0].slice(1).map((item: any) => String(item ?? '')) : [];
}

function getSelectedSheetSnapshot_ACU(tempData: AnyRecord, sheetKey: string | null) {
    if (!sheetKey || !tempData?.[sheetKey]) return null;
    const sheet = tempData[sheetKey];
    return {
        sheetKey,
        name: String(sheet?.name || ''),
        headers: extractHeaders_ACU(sheet),
        sourceData: clone_ACU(asObject_ACU(sheet?.sourceData)),
        updateConfig: clone_ACU(asObject_ACU(sheet?.updateConfig)),
        exportConfig: clone_ACU(asObject_ACU(sheet?.exportConfig)),
    };
}

function buildSheetSummary_ACU(tempData: AnyRecord) {
    const sheetKeys = getSortedSheetKeys_ACU(tempData, { ignoreChatGuide: true });
    return sheetKeys.map((sheetKey) => {
        const sheet = tempData[sheetKey] || {};
        return {
            sheetKey,
            name: String(sheet.name || ''),
            orderNo: Number.isFinite(sheet.orderNo) ? sheet.orderNo : null,
            headers: extractHeaders_ACU(sheet),
        };
    });
}

export function buildTemplateAssistantFingerprint_ACU(tempData: AnyRecord) {
    const normalized = asObject_ACU(tempData);
    const sheetKeys = getSortedSheetKeys_ACU(normalized, { ignoreChatGuide: true });
    const snapshot = {
        globalInjectionConfig: getGlobalInjectionConfigFromData_ACU(normalized, { ensureWriteBack: false }),
        sheets: sheetKeys.map((sheetKey) => {
            const sheet = normalized[sheetKey] || {};
            return {
                sheetKey,
                uid: sheet.uid ?? '',
                name: sheet.name ?? '',
                orderNo: sheet.orderNo ?? null,
                headers: Array.isArray(sheet?.content?.[0]) ? sheet.content[0] : [],
                sourceData: asObject_ACU(sheet.sourceData),
                updateConfig: asObject_ACU(sheet.updateConfig),
                exportConfig: asObject_ACU(sheet.exportConfig),
            };
        }),
    };
    return `acu-struct:${hashUserInput_ACU(safeJsonStringify_ACU(snapshot, '{}'))}`;
}

function getLastTaggedDraftText_ACU(aiText: string) {
    const tagPattern = /<templateAssistantDraft>([\s\S]*?)<\/templateAssistantDraft>/g;
    const matches = Array.from(String(aiText || '').matchAll(tagPattern));
    if (!matches.length) {
        throw new Error('AI 响应中未找到 <templateAssistantDraft> 标签');
    }
    return String(matches[matches.length - 1][1] || '').trim();
}

export function parseTemplateAssistantDraft_ACU(aiText: string): TemplateAssistantDraft_ACU {
    const jsonText = getLastTaggedDraftText_ACU(aiText);
    let parsed: any = null;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error: any) {
        throw new Error(`assistant draft JSON 解析失败: ${error?.message || '未知错误'}`);
    }
    return validateTemplateAssistantDraft_ACU(parsed);
}

function validatePatchSheetBoundary_ACU(op: any, selectedSheetKey: string, currentSheetKey: string | null) {
    if (op.sheetKey !== selectedSheetKey) {
        throw new Error(`${op.op} 的 sheetKey 必须与 draft.selectedSheetKey 一致`);
    }
    if (currentSheetKey && op.sheetKey !== currentSheetKey) {
        throw new Error(`${op.op} 只能修改当前选中表`);
    }
}

export function validateTemplateAssistantDraft_ACU(draft: any): TemplateAssistantDraft_ACU {
    if (!draft || typeof draft !== 'object') {
        throw new Error('assistant draft 必须是对象');
    }
    if (draft.protocolVersion !== 1) {
        throw new Error('assistant draft.protocolVersion 必须为 1');
    }
    if (draft.mode !== 'modify_current_template_incremental') {
        throw new Error('assistant draft.mode 非法');
    }
    if (typeof draft.baseFingerprint !== 'string' || !draft.baseFingerprint.trim()) {
        throw new Error('assistant draft.baseFingerprint 缺失');
    }
    if (typeof draft.selectedSheetKey !== 'string' || !draft.selectedSheetKey.trim()) {
        throw new Error('assistant draft.selectedSheetKey 必须是非空字符串');
    }
    if (typeof draft.summary !== 'string') {
        throw new Error('assistant draft.summary 必须是字符串');
    }
    if (!Array.isArray(draft.warnings)) {
        throw new Error('assistant draft.warnings 必须是数组');
    }
    if (!Array.isArray(draft.operations)) {
        throw new Error('assistant draft.operations 必须是数组');
    }

    draft.operations.forEach((op: any, index: number) => {
        if (!op || typeof op !== 'object') {
            throw new Error(`operations[${index}] 必须是对象`);
        }
        const opName = String(op.op || '');
        const allowedOps = new Set([
            'add_sheet',
            'rename_sheet',
            'delete_sheet',
            'move_sheet',
            'patch_sheet_source_data',
            'patch_sheet_update_config',
            'patch_sheet_export_config',
            'patch_global_injection_config',
        ]);
        if (!allowedOps.has(opName)) {
            throw new Error(`operations[${index}] 包含一期不支持的操作: ${opName}`);
        }
        if (opName === 'replace_sheet_schema') {
            throw new Error('一期禁止 replace_sheet_schema');
        }
        if (opName.startsWith('patch_sheet_')) {
            if (typeof op.sheetKey !== 'string' || !op.sheetKey) {
                throw new Error(`${opName} 缺少 sheetKey`);
            }
            if (!op.patch || typeof op.patch !== 'object' || Array.isArray(op.patch)) {
                throw new Error(`${opName} 缺少合法 patch 对象`);
            }
        }
    });

    return {
        protocolVersion: 1,
        mode: 'modify_current_template_incremental',
        baseFingerprint: draft.baseFingerprint,
        selectedSheetKey: String(draft.selectedSheetKey || ''),
        summary: String(draft.summary || ''),
        warnings: draft.warnings.map((item: any) => String(item ?? '')),
        operations: draft.operations.map((item: any) => clone_ACU(item)),
    };
}

function buildSystemPrompt_ACU() {
    return [
        '你是 visualizer 内的模板改表助手。',
        '你只能输出一个被 <templateAssistantDraft> 和 </templateAssistantDraft> 包裹的 JSON 对象，不能输出解释文本。',
        '严格只允许以下操作：add_sheet、rename_sheet、delete_sheet、move_sheet、patch_sheet_source_data、patch_sheet_update_config、patch_sheet_export_config、patch_global_injection_config。',
        '严格禁止 replace_sheet_schema、任何现有表结构重建、任何数据行内容改写、任何跨表迁移、任何直接保存行为。',
        'patch_sheet_source_data / patch_sheet_update_config / patch_sheet_export_config 只能作用于当前选中表，并且 op.sheetKey 必须与顶层 selectedSheetKey 完全一致。',
        'move_sheet 只能提供 beforeSheetKey 或 afterSheetKey 之一。',
        'add_sheet 不要生成最终 sheetKey，本地会自动生成。',
        'patch 对象只能填写当前结构里真实存在的字段，不要猜测未知字段。',
        '顶层 JSON 必须包含 protocolVersion=1、mode="modify_current_template_incremental"、baseFingerprint、selectedSheetKey、summary、warnings、operations。',
        'warnings 必须是字符串数组；没有则输出空数组。',
    ].join('\n');
}

function buildUserPrompt_ACU(input: TemplateAssistantGenerateInput_ACU, baseFingerprint: string) {
    const tempData = input.tempData;
    const selectedSheet = getSelectedSheetSnapshot_ACU(tempData, input.currentSheetKey);
    const payload = {
        userRequest: String(input.userRequest || '').trim(),
        baseFingerprint,
        sheetCount: buildSheetSummary_ACU(tempData).length,
        allSheets: buildSheetSummary_ACU(tempData),
        selectedSheet,
        globalInjectionConfig: getGlobalInjectionConfigFromData_ACU(tempData, { ensureWriteBack: false }),
        constraints: {
            selectedSheetKey: input.currentSheetKey || '',
            patchOnlyCurrentSheet: true,
            forbidSchemaReplace: true,
            forbidDataRowRewrite: true,
        },
    };
    return safeJsonStringify_ACU(payload, '{}');
}

export async function generateTemplateAssistantDraft_ACU(input: TemplateAssistantGenerateInput_ACU): Promise<TemplateAssistantGenerateResult_ACU> {
    const tempData = asObject_ACU(input?.tempData);
    const userRequest = String(input?.userRequest || '').trim();
    if (!userRequest) {
        throw new Error('请输入改表需求');
    }
    if (!String(input?.currentSheetKey || '').trim()) {
        throw new Error('请先选中一个表后再使用 AI 改表助手');
    }
    const baseFingerprint = buildTemplateAssistantFingerprint_ACU(tempData);
    const messages = [
        { role: 'system', content: buildSystemPrompt_ACU() },
        { role: 'user', content: buildUserPrompt_ACU({ ...input, tempData }, baseFingerprint) },
    ];
    const aiRawText = await callAIWithPreset_ACU(messages, settings_ACU.tableApiPreset || '');
    if (!aiRawText) {
        throw new Error('AI 未返回有效内容');
    }

    const draft = parseTemplateAssistantDraft_ACU(aiRawText);
    if (draft.baseFingerprint !== baseFingerprint) {
        throw new Error('AI 返回的 baseFingerprint 与当前结构不一致');
    }
    draft.operations.forEach((op) => {
        if (String(op?.op || '').startsWith('patch_sheet_')) {
            validatePatchSheetBoundary_ACU(op, draft.selectedSheetKey, input.currentSheetKey);
        }
    });

    const compileResult = compileTemplateAssistantDraft_ACU({
        tempData,
        sheetOrder: input.sheetOrder,
        currentSheetKey: input.currentSheetKey,
        draft,
    });

    return {
        draft,
        aiRawText,
        messages,
        compileResult,
    };
}
