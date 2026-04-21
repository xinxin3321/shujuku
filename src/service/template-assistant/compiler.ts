import { TABLE_ORDER_FIELD_ACU } from '../../shared/constants';
import { getSortedSheetKeys_ACU } from '../template/chat-scope';
import { buildDefaultExportConfig_ACU, ensureGlobalInjectionConfigDefaults_ACU, ensureSheetExportConfigDefaults_ACU } from '../worldbook/injection-engine';

type AnyRecord = Record<string, any>;

export interface TemplateAssistantDiff_ACU {
    addedSheets: Array<{ sheetKey: string; name: string }>;
    deletedSheets: Array<{ sheetKey: string; name: string }>;
    renamedSheets: Array<{ sheetKey: string; beforeName: string; afterName: string }>;
    movedSheets: Array<{ sheetKey: string; name: string; fromIndex: number; toIndex: number }>;
    patchedSourceDataSheets: Array<{ sheetKey: string; name: string; keys: string[] }>;
    patchedUpdateConfigSheets: Array<{ sheetKey: string; name: string; keys: string[] }>;
    patchedExportConfigSheets: Array<{ sheetKey: string; name: string; keys: string[] }>;
    globalInjectionChanged: boolean;
}

export interface TemplateAssistantCompileResult_ACU {
    candidateData: AnyRecord;
    orderedSheetKeys: string[];
    deletedSheetKeys: string[];
    focusSheetKey: string | null;
    diff: TemplateAssistantDiff_ACU;
    highRiskItems: Array<{ type: 'delete_sheet' | 'patch_global_injection_config'; label: string }>;
    lockChanges: Array<{
        sheetKey: string;
        rows: Array<{ rowIndex: number; locked: boolean }>;
        columns: Array<{ colIndex: number; locked: boolean }>;
        cells: Array<{ rowIndex: number; colIndex: number; locked: boolean }>;
        specialIndexLocked?: boolean;
    }>;
}

export interface TemplateAssistantCumulativeCompileInput_ACU {
    baselineData: AnyRecord;
    baselineSheetOrder?: string[] | null;
    candidateData: AnyRecord;
    candidateSheetOrder?: string[] | null;
    focusSheetKey?: string | null;
}

function clone_ACU<T>(value: T): T {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function isObject_ACU(value: any): value is AnyRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify_ACU(value: any): string {
    return JSON.stringify(value);
}

function isSameValue_ACU(left: any, right: any) {
    if (left === right) return true;
    return stableStringify_ACU(left) === stableStringify_ACU(right);
}

function createEmptyDiff_ACU(): TemplateAssistantDiff_ACU {
    return {
        addedSheets: [],
        deletedSheets: [],
        renamedSheets: [],
        movedSheets: [],
        patchedSourceDataSheets: [],
        patchedUpdateConfigSheets: [],
        patchedExportConfigSheets: [],
        globalInjectionChanged: false,
    };
}

function listChangedLeafKeys_ACU(beforeValue: any, afterValue: any, prefix = ''): string[] {
    if (isObject_ACU(beforeValue) && isObject_ACU(afterValue)) {
        const keys = Array.from(new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])).sort();
        return keys.flatMap((key) => {
            const nextPrefix = prefix ? `${prefix}.${key}` : key;
            const hasBefore = Object.prototype.hasOwnProperty.call(beforeValue, key);
            const hasAfter = Object.prototype.hasOwnProperty.call(afterValue, key);
            if (!hasBefore || !hasAfter) {
                return [nextPrefix];
            }
            return listChangedLeafKeys_ACU(beforeValue[key], afterValue[key], nextPrefix);
        });
    }
    return isSameValue_ACU(beforeValue, afterValue) ? [] : (prefix ? [prefix] : []);
}

function listPatchLeafKeys_ACU(patch: any, prefix = ''): string[] {
    if (!isObject_ACU(patch)) return prefix ? [prefix] : [];
    const out: string[] = [];
    Object.keys(patch).forEach((key) => {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        const value = patch[key];
        if (isObject_ACU(value)) {
            out.push(...listPatchLeafKeys_ACU(value, nextPrefix));
            return;
        }
        out.push(nextPrefix);
    });
    return out;
}

function applyStrictPatch_ACU(target: AnyRecord, patch: AnyRecord, path = '') {
    Object.keys(patch).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            throw new Error(`patch 包含未知字段: ${path}${key}`);
        }
        const nextValue = patch[key];
        const currentValue = target[key];
        if (isObject_ACU(nextValue)) {
            if (!isObject_ACU(currentValue)) {
                throw new Error(`patch 目标不是对象，无法递归覆盖: ${path}${key}`);
            }
            applyStrictPatch_ACU(currentValue, nextValue, `${path}${key}.`);
            return;
        }
        target[key] = clone_ACU(nextValue);
    });
}

function ensureSheetExists_ACU(dataObj: AnyRecord, sheetKey: string) {
    const sheet = dataObj?.[sheetKey];
    if (!sheet || typeof sheet !== 'object') {
        throw new Error(`找不到目标表: ${sheetKey}`);
    }
    return sheet;
}

function assertPatchTargetsCurrentSheet_ACU(op: any, currentSheetKey: string | null | undefined, selectedSheetKey: string | null | undefined) {
    const opName = String(op?.op || 'patch_sheet');
    const opSheetKey = String(op?.sheetKey || '');
    if (opSheetKey !== String(selectedSheetKey || '')) {
        throw new Error(`${opName} 的 sheetKey 必须与 draft.selectedSheetKey 一致`);
    }
    if (currentSheetKey && opSheetKey !== currentSheetKey) {
        throw new Error(`${opName} 只能修改当前选中表`);
    }
}

function createUniqueSheetKey_ACU(dataObj: AnyRecord) {
    let nextKey = '';
    do {
        nextKey = `sheet_${Math.random().toString(36).slice(2, 11)}`;
    } while (dataObj[nextKey]);
    return nextKey;
}

function getBaseOrderedSheetKeys_ACU(tempData: AnyRecord, sheetOrder: string[] | null | undefined) {
    const existingKeys = getSortedSheetKeys_ACU(tempData, { ignoreChatGuide: true });
    const order = Array.isArray(sheetOrder) ? sheetOrder.filter((key) => existingKeys.includes(key)) : [];
    existingKeys.forEach((key) => {
        if (!order.includes(key)) order.push(key);
    });
    return order;
}

function normalizeFocusSheetKey_ACU(candidateData: AnyRecord, orderedSheetKeys: string[], focusSheetKey: string | null | undefined) {
    if (focusSheetKey && candidateData[focusSheetKey]) {
        return focusSheetKey;
    }
    return orderedSheetKeys[0] || null;
}

function getNormalizedGlobalInjectionConfig_ACU(dataObj: AnyRecord) {
    const rawValue = isObject_ACU(dataObj?.mate) ? dataObj.mate.globalInjectionConfig : undefined;
    return ensureGlobalInjectionConfigDefaults_ACU(clone_ACU(rawValue));
}

function buildDefaultUpdateConfig_ACU() {
    return {
        uiSentinel: -1,
        contextDepth: -1,
        updateFrequency: -1,
        batchSize: -1,
        skipFloors: -1,
        sendLatestRows: -1,
        groupId: -1,
    };
}

function buildDefaultSourceData_ACU() {
    return {
        note: '新表格说明',
        initNode: '',
        insertNode: '',
        updateNode: '',
        deleteNode: '',
    };
}

function sanitizeAddSheetConfig_ACU(rawValue: any, baseValue: AnyRecord, label: string) {
    const nextValue = clone_ACU(baseValue);
    if (rawValue == null) return nextValue;
    if (!isObject_ACU(rawValue)) {
        throw new Error(`add_sheet.${label} 必须是对象`);
    }
    applyStrictPatch_ACU(nextValue, rawValue, `${label}.`);
    return nextValue;
}

function buildNewSheet_ACU(op: any, newKey: string, orderNo: number) {
    const sheetName = String(op?.sheetName || '').trim();
    if (!sheetName) {
        throw new Error('add_sheet 缺少 sheetName');
    }
    const headers = Array.isArray(op?.headers)
        ? op.headers.map((item: any) => String(item ?? '').trim()).filter(Boolean)
        : [];
    if (headers.length === 0) {
        throw new Error('add_sheet 至少需要一个表头');
    }

    const sourceData = sanitizeAddSheetConfig_ACU(op?.sourceData, buildDefaultSourceData_ACU(), 'sourceData');
    const updateConfig = sanitizeAddSheetConfig_ACU(op?.updateConfig, buildDefaultUpdateConfig_ACU(), 'updateConfig');
    const exportConfig = sanitizeAddSheetConfig_ACU(op?.exportConfig, buildDefaultExportConfig_ACU(sheetName), 'exportConfig');

    const sheet: AnyRecord = {
        uid: newKey,
        name: sheetName,
        domain: 'chat',
        type: 'dynamic',
        enable: true,
        required: false,
        content: [['row_id', ...headers]],
        sourceData,
        updateConfig,
        exportConfig,
        [TABLE_ORDER_FIELD_ACU]: orderNo,
    };
    ensureSheetExportConfigDefaults_ACU(sheet);
    return sheet;
}

function insertAfterAnchor_ACU(orderedSheetKeys: string[], newKey: string, insertAfterSheetKey?: string) {
    if (!insertAfterSheetKey) {
        orderedSheetKeys.push(newKey);
        return;
    }
    const idx = orderedSheetKeys.indexOf(insertAfterSheetKey);
    if (idx === -1) {
        throw new Error(`add_sheet 的 insertAfterSheetKey 不存在: ${insertAfterSheetKey}`);
    }
    orderedSheetKeys.splice(idx + 1, 0, newKey);
}

function moveSheetAroundAnchor_ACU(orderedSheetKeys: string[], sheetKey: string, beforeSheetKey?: string, afterSheetKey?: string) {
    const anchorCount = Number(!!beforeSheetKey) + Number(!!afterSheetKey);
    if (anchorCount !== 1) {
        throw new Error('move_sheet 必须且只能提供 beforeSheetKey 或 afterSheetKey 之一');
    }
    const fromIndex = orderedSheetKeys.indexOf(sheetKey);
    if (fromIndex === -1) {
        throw new Error(`move_sheet 目标表不存在: ${sheetKey}`);
    }
    const anchorKey = beforeSheetKey || afterSheetKey || '';
    const anchorIndex = orderedSheetKeys.indexOf(anchorKey);
    if (anchorIndex === -1) {
        throw new Error(`move_sheet 锚点不存在: ${anchorKey}`);
    }
    if (anchorKey === sheetKey) {
        throw new Error('move_sheet 不能以自身为锚点');
    }

    orderedSheetKeys.splice(fromIndex, 1);
    const nextAnchorIndex = orderedSheetKeys.indexOf(anchorKey);
    const insertIndex = beforeSheetKey ? nextAnchorIndex : nextAnchorIndex + 1;
    orderedSheetKeys.splice(insertIndex, 0, sheetKey);
}

export function compileTemplateAssistantDraft_ACU(input: {
    tempData: AnyRecord;
    sheetOrder?: string[] | null;
    currentSheetKey?: string | null;
    draft: any;
}): TemplateAssistantCompileResult_ACU {
    const tempData = isObject_ACU(input?.tempData) ? input.tempData : null;
    if (!tempData) {
        throw new Error('缺少 tempData');
    }
    const draft = input?.draft;
    if (!draft || !Array.isArray(draft.operations)) {
        throw new Error('缺少合法 draft.operations');
    }

    const candidateData = clone_ACU(tempData);
    const orderedSheetKeys = getBaseOrderedSheetKeys_ACU(candidateData, input.sheetOrder);
    const deletedSheetKeys: string[] = [];
    const highRiskItems: TemplateAssistantCompileResult_ACU['highRiskItems'] = [];
    const diff = createEmptyDiff_ACU();
    let focusSheetKey = input?.currentSheetKey || draft?.selectedSheetKey || null;

    draft.operations.forEach((op: any) => {
        const opName = String(op?.op || '');
        if (!opName) throw new Error('存在缺少 op 的操作');

        if (opName === 'add_sheet') {
            const newKey = createUniqueSheetKey_ACU(candidateData);
            const newSheet = buildNewSheet_ACU(op, newKey, orderedSheetKeys.length);
            candidateData[newKey] = newSheet;
            insertAfterAnchor_ACU(orderedSheetKeys, newKey, op.insertAfterSheetKey);
            focusSheetKey = newKey;
            diff.addedSheets.push({ sheetKey: newKey, name: newSheet.name || newKey });
            return;
        }

        if (opName === 'rename_sheet') {
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            const beforeName = String(sheet.name || '');
            const afterName = String(op.newName || '').trim();
            if (!afterName) throw new Error('rename_sheet 缺少 newName');
            sheet.name = afterName;
            ensureSheetExportConfigDefaults_ACU(sheet);
            diff.renamedSheets.push({ sheetKey: op.sheetKey, beforeName, afterName });
            return;
        }

        if (opName === 'delete_sheet') {
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            diff.deletedSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey) });
            if (!deletedSheetKeys.includes(op.sheetKey)) deletedSheetKeys.push(op.sheetKey);
            highRiskItems.push({ type: 'delete_sheet', label: `删除表: ${String(sheet.name || op.sheetKey)}` });
            delete candidateData[op.sheetKey];
            const idx = orderedSheetKeys.indexOf(op.sheetKey);
            if (idx >= 0) orderedSheetKeys.splice(idx, 1);
            if (focusSheetKey === op.sheetKey) focusSheetKey = null;
            return;
        }

        if (opName === 'move_sheet') {
            const beforeIndex = orderedSheetKeys.indexOf(op.sheetKey);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            moveSheetAroundAnchor_ACU(orderedSheetKeys, op.sheetKey, op.beforeSheetKey, op.afterSheetKey);
            const afterIndex = orderedSheetKeys.indexOf(op.sheetKey);
            if (beforeIndex !== afterIndex) {
                diff.movedSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), fromIndex: beforeIndex, toIndex: afterIndex });
            }
            return;
        }

        if (opName === 'patch_sheet_source_data') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            if (!isObject_ACU(sheet.sourceData)) throw new Error(`目标表 sourceData 非法: ${op.sheetKey}`);
            applyStrictPatch_ACU(sheet.sourceData, isObject_ACU(op.patch) ? op.patch : {});
            diff.patchedSourceDataSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), keys: listPatchLeafKeys_ACU(op.patch) });
            return;
        }

        if (opName === 'patch_sheet_update_config') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            if (!isObject_ACU(sheet.updateConfig)) throw new Error(`目标表 updateConfig 非法: ${op.sheetKey}`);
            applyStrictPatch_ACU(sheet.updateConfig, isObject_ACU(op.patch) ? op.patch : {});
            diff.patchedUpdateConfigSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), keys: listPatchLeafKeys_ACU(op.patch) });
            return;
        }

        if (opName === 'patch_sheet_export_config') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            ensureSheetExportConfigDefaults_ACU(sheet);
            applyStrictPatch_ACU(sheet.exportConfig, isObject_ACU(op.patch) ? op.patch : {});
            ensureSheetExportConfigDefaults_ACU(sheet);
            diff.patchedExportConfigSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), keys: listPatchLeafKeys_ACU(op.patch) });
            return;
        }

        if (opName === 'patch_global_injection_config') {
            if (!isObject_ACU(candidateData.mate)) {
                candidateData.mate = { type: 'chatSheets', version: 1 };
            }
            candidateData.mate.globalInjectionConfig = ensureGlobalInjectionConfigDefaults_ACU(candidateData.mate.globalInjectionConfig);
            applyStrictPatch_ACU(candidateData.mate.globalInjectionConfig, isObject_ACU(op.patch) ? op.patch : {});
            candidateData.mate.globalInjectionConfig = ensureGlobalInjectionConfigDefaults_ACU(candidateData.mate.globalInjectionConfig);
            diff.globalInjectionChanged = true;
            highRiskItems.push({ type: 'patch_global_injection_config', label: '修改全局注入配置' });
            return;
        }

        throw new Error(`一期不支持的操作: ${opName}`);
    });

    orderedSheetKeys.forEach((sheetKey, index) => {
        if (candidateData?.[sheetKey] && typeof candidateData[sheetKey] === 'object') {
            candidateData[sheetKey][TABLE_ORDER_FIELD_ACU] = index;
        }
    });

    focusSheetKey = normalizeFocusSheetKey_ACU(candidateData, orderedSheetKeys, focusSheetKey);

    return {
        candidateData,
        orderedSheetKeys,
        deletedSheetKeys,
        focusSheetKey,
        diff,
        highRiskItems,
        lockChanges: [],
    };
}

export function buildTemplateAssistantCumulativeCompileResult_ACU(input: TemplateAssistantCumulativeCompileInput_ACU): TemplateAssistantCompileResult_ACU {
    const baselineData = isObject_ACU(input?.baselineData) ? input.baselineData : null;
    const rawCandidateData = isObject_ACU(input?.candidateData) ? input.candidateData : null;
    if (!baselineData) {
        throw new Error('缺少 baselineData');
    }
    if (!rawCandidateData) {
        throw new Error('缺少 candidateData');
    }

    const candidateData = clone_ACU(rawCandidateData);
    const baselineOrderedSheetKeys = getBaseOrderedSheetKeys_ACU(baselineData, input.baselineSheetOrder);
    const orderedSheetKeys = getBaseOrderedSheetKeys_ACU(candidateData, input.candidateSheetOrder);
    const baselineSheetKeySet = new Set(baselineOrderedSheetKeys);
    const candidateSheetKeySet = new Set(orderedSheetKeys);
    const deletedSheetKeys = baselineOrderedSheetKeys.filter((sheetKey) => !candidateSheetKeySet.has(sheetKey));
    const addedSheetKeys = orderedSheetKeys.filter((sheetKey) => !baselineSheetKeySet.has(sheetKey));
    const baselineCommonOrderedKeys = baselineOrderedSheetKeys.filter((sheetKey) => candidateSheetKeySet.has(sheetKey));
    const candidateCommonOrderedKeys = orderedSheetKeys.filter((sheetKey) => baselineSheetKeySet.has(sheetKey));
    const diff = createEmptyDiff_ACU();
    const highRiskItems: TemplateAssistantCompileResult_ACU['highRiskItems'] = [];

    addedSheetKeys.forEach((sheetKey) => {
        const sheet = candidateData[sheetKey] || {};
        diff.addedSheets.push({ sheetKey, name: String(sheet.name || sheetKey) });
    });

    deletedSheetKeys.forEach((sheetKey) => {
        const sheet = baselineData[sheetKey] || {};
        const name = String(sheet.name || sheetKey);
        diff.deletedSheets.push({ sheetKey, name });
        highRiskItems.push({ type: 'delete_sheet', label: `删除表: ${name}` });
    });

    baselineCommonOrderedKeys.forEach((sheetKey, commonIndex) => {
        const beforeSheet = baselineData[sheetKey] || {};
        const afterSheet = candidateData[sheetKey] || {};
        const beforeName = String(beforeSheet.name || '');
        const afterName = String(afterSheet.name || '');
        if (beforeName !== afterName) {
            diff.renamedSheets.push({ sheetKey, beforeName, afterName });
        }

        const candidateCommonIndex = candidateCommonOrderedKeys.indexOf(sheetKey);
        if (candidateCommonIndex !== commonIndex) {
            diff.movedSheets.push({
                sheetKey,
                name: afterName || beforeName || sheetKey,
                fromIndex: baselineOrderedSheetKeys.indexOf(sheetKey),
                toIndex: orderedSheetKeys.indexOf(sheetKey),
            });
        }

        const changedSourceDataKeys = listChangedLeafKeys_ACU(beforeSheet.sourceData, afterSheet.sourceData);
        if (changedSourceDataKeys.length) {
            diff.patchedSourceDataSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, keys: changedSourceDataKeys });
        }

        const changedUpdateConfigKeys = listChangedLeafKeys_ACU(beforeSheet.updateConfig, afterSheet.updateConfig);
        if (changedUpdateConfigKeys.length) {
            diff.patchedUpdateConfigSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, keys: changedUpdateConfigKeys });
        }

        const changedExportConfigKeys = listChangedLeafKeys_ACU(beforeSheet.exportConfig, afterSheet.exportConfig);
        if (changedExportConfigKeys.length) {
            diff.patchedExportConfigSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, keys: changedExportConfigKeys });
        }
    });

    diff.globalInjectionChanged = !isSameValue_ACU(
        getNormalizedGlobalInjectionConfig_ACU(baselineData),
        getNormalizedGlobalInjectionConfig_ACU(candidateData),
    );
    if (diff.globalInjectionChanged) {
        highRiskItems.push({ type: 'patch_global_injection_config', label: '修改全局注入配置' });
    }

    orderedSheetKeys.forEach((sheetKey, index) => {
        if (candidateData?.[sheetKey] && typeof candidateData[sheetKey] === 'object') {
            candidateData[sheetKey][TABLE_ORDER_FIELD_ACU] = index;
        }
    });

    return {
        candidateData,
        orderedSheetKeys,
        deletedSheetKeys,
        focusSheetKey: normalizeFocusSheetKey_ACU(candidateData, orderedSheetKeys, input.focusSheetKey),
        diff,
        highRiskItems,
        lockChanges: [],
    };
}
