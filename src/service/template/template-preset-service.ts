/**
 * service/template/template-preset-service.ts — 模板预设纯逻辑函数
 * 
 * 从 presentation/components/template-preset-ui.ts 中提取的纯数据操作函数。
 * 不操作 DOM，可被 service 层和 presentation 层共同引用。
 */

export {
  getTemplatePreset_ACU,
  getDefaultTemplateSnapshot_ACU,
  upsertTemplatePreset_ACU,
  deleteTemplatePreset_ACU,
  getTemplatePresetDisplayName_ACU,
  listTemplatePresetNames_ACU,
  normalizeTemplateOperationScope_ACU,
  parseImportedTemplateData_ACU,
  normalizeTemplateForPresetSave_ACU,
  ensureUniqueTemplatePresetName_ACU,
  persistTemplateScopeSelectionState_ACU,
  applyTemplateSnapshotToScope_ACU,
  applyTemplatePresetToCurrent_ACU,
  resolveActiveTemplatePresetName_ACU,
  refreshTemplatePresetSelectInUI_ACU,
} from '../../presentation/components/template-preset-ui';
