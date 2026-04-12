// ═══════════════════════════════════════════════════════════════
// data/repositories/template-preset-repo.ts — 模板预设纯数据工具函数
// 从 02_storage_and_profile.js 行 18~101 迁入
// ═══════════════════════════════════════════════════════════════

import { SillyTavern_API_ACU, TavernHelper_API_ACU } from '../../shared/host-api';
import { persistSettingsToStorage_ACU } from '../storage/config-storage';

export const DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU = '__ACU_DEFAULT_TEMPLATE_PRESET__';

export function normalizeTemplatePresetSelectionValue_ACU(presetName: any): string {
    const normalizedName = String(presetName ?? '').trim();
    return normalizedName === DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU ? '' : normalizedName;
}

export function isDefaultTemplatePresetSelection_ACU(presetName: any): boolean {
    return normalizeTemplatePresetSelectionValue_ACU(presetName) === '';
}

export function getCurrentTemplatePresetName_ACU(settings_ACU: any, { requireExisting = false, getTemplatePresetFn = null as any } = {}): string {
    const presetName = normalizeTemplatePresetSelectionValue_ACU(settings_ACU?.currentTemplatePresetName || '');
    if (!presetName) return '';
    if (!requireExisting) return presetName;
    if (typeof getTemplatePresetFn === 'function') {
        return getTemplatePresetFn(presetName)?.templateStr ? presetName : '';
    }
    return presetName;
}

export function persistCurrentTemplatePresetName_ACU(settings_ACU: any, presetName: any, { save = true } = {}): string {
    if (!settings_ACU || typeof settings_ACU !== 'object') return '';
    const normalizedPresetName = normalizeTemplatePresetSelectionValue_ACU(presetName);
    settings_ACU.currentTemplatePresetName = normalizedPresetName;
    if (save) {
        persistSettingsToStorage_ACU(settings_ACU);
    }
    return normalizedPresetName;
}

export function derivePresetNameFromFilename_ACU(filename: any): string {
    const raw = String(filename || '').trim();
    if (!raw) return '';
    const idx = raw.lastIndexOf('.');
    const base = (idx > 0 ? raw.slice(0, idx) : raw).trim();
    return base;
}

export function getCurrentCharacterCardName_ACU(): string {
    try {
        const stContext = (window as any).SillyTavern?.getContext?.();
        let character = null;
        if (TavernHelper_API_ACU?.getCharData) {
            character = TavernHelper_API_ACU.getCharData('current');
        }
        if (!character) {
            character = SillyTavern_API_ACU?.characters?.[SillyTavern_API_ACU?.this_chid]
                || stContext?.characters?.[stContext?.characterId]
                || (typeof (window as any).characters !== 'undefined' && typeof (window as any).this_chid !== 'undefined' ? (window as any).characters[(window as any).this_chid] : null);
        }
        return String(
            character?.name
            || character?.data?.name
            || stContext?.name2
            || SillyTavern_API_ACU?.name2
            || ''
        ).trim();
    } catch (e) {
        return '';
    }
}

export function deriveTemplatePresetNameForImport_ACU({ presetName = '', filename = '', fallbackLabel = '', allowCharacterFallback = true } = {}): string {
    const explicitName = normalizeTemplatePresetSelectionValue_ACU(presetName);
    if (explicitName) return explicitName;

    const filenameDerivedName = normalizeTemplatePresetSelectionValue_ACU(derivePresetNameFromFilename_ACU(filename));
    if (filenameDerivedName) return filenameDerivedName;

    if (allowCharacterFallback) {
        const characterDerivedName = normalizeTemplatePresetSelectionValue_ACU(getCurrentCharacterCardName_ACU());
        if (characterDerivedName) return characterDerivedName;
    }

    return normalizeTemplatePresetSelectionValue_ACU(fallbackLabel);
}

export function sanitizeFilenameComponent_ACU(name: any): string {
    const s = String(name || '').trim();
    const out = s.replace(/[\\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
    return out.length > 80 ? out.slice(0, 80).trim() : out;
}
