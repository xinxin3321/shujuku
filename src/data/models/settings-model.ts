/**
 * data/models/settings-model.ts — 设置数据结构定义
 *
 * 定义 settings_ACU 对象的 TypeScript 接口。
 */

/** 世界书注入配置 */

export interface WorldbookConfig_ACU {
  source: 'character' | 'manual';
  manualSelection: string[];
  injectionTarget: string;
  entryBlockList: string[];
}

export type AgentWorldbookControlMode_ACU = 'disabled' | 'passive' | 'agent';
export type AgentSkillMetadataPolicy_ACU = 'comment_block' | 'content_block' | 'settings_map';
export type WorldbookSkillMetaUpdatedBy_ACU = 'manual' | 'agent-skillify';

export interface PromptSegment_ACU {
  role: string;
  content: string;
  deletable: boolean;
  mainSlot?: string;
  isMain?: boolean;
  isMain2?: boolean;
}

export interface AgentContextSettings_ACU {
  /** Compatibility field name. Runtime interprets it as recent AI layer count; 1 layer = 1 AI reply plus its preceding user input. */
  decisionRecentContextCharLimit: number;
  /** @deprecated Compatibility-only. Agent decisions use recent context layers for plot history. */
  decisionPreviousPlotCharLimit: number;
  /** @deprecated Compatibility-only. Agent decisions no longer inject worldbook entry content previews. */
  decisionWorldbookContentPreviewLimit: number;
  decisionWorldbookCandidateLimit: number;
  /** @deprecated Compatibility-only. Skillify prompts no longer inject worldbook entry content previews. */
  skillifyContentPreviewLimit: number;
  skillifyMaxEntries: number;
  plotWorldbookScanMessageLimit: number;
}

/** 世界书条目 Skill 元数据 */
export interface WorldbookSkillMeta_ACU {
  version: 1;
  description: string;
  triggerWhen: string;
  updatedAt: number;
  updatedBy: WorldbookSkillMetaUpdatedBy_ACU;
}

/** Agent 模式世界书接管配置 */
export interface AgentWorldbookControl_ACU {
  enabled: boolean;
  mode: AgentWorldbookControlMode_ACU;
  scopeMode: 'follow_worldbook_page_selection';
  agentApiPreset: string;
  agentSkillApiPreset: string;
  skillMetadataPolicy: AgentSkillMetadataPolicy_ACU;
  managedEntryPrefix: string;
  finalInjectionMode: 'prompt_template';
  restoreOnDisable: boolean;
  maxSkillifyConcurrency: number;
  contextSettings: AgentContextSettings_ACU;
  contextSettingsConfigured?: boolean;
  agentDecisionPromptSegments: PromptSegment_ACU[];
  agentSkillifyPromptSegments: PromptSegment_ACU[];
  maxEntriesPerChannel: {
    plot: number;
    tableFill: number;
    finalGeneration: number;
  };
}

export interface AgentWorldbookControlSnapshotEntry_ACU {
  uid: string | number;
  previousEnabled: boolean;
  previousKeys?: string[];
  previousType?: string;
  commentHash?: string;
}

/** Agent 模式接管快照，恢复世界书绿灯状态时使用 */
export interface AgentWorldbookControlSnapshot_ACU {
  active: boolean;
  selectionSignature: string;
  createdAt: number;
  books: Record<string, AgentWorldbookControlSnapshotEntry_ACU[]>;
}

/** 设置对象的核心接口 */
export interface Settings_ACU {
  charCardPrompt: Array<{
    role: string;
    content: string;
    deletable: boolean;
    mainSlot?: string;
    isMain?: boolean;
    isMain2?: boolean;
  }>;
  tableTemplate: string;
  autoUpdateEnabled: boolean;
  autoUpdateThresholdNewMessages: number;
  autoUpdateThresholdInterval: number;
  tableMaxRetries: number;
  worldbookConfig: WorldbookConfig_ACU;
  plotSettings: PlotSettings_ACU;
  mergeSummaryPrompt: string;
  hasImportTableSelection: boolean;
  /** 存储模式：'native' 原生 JSON 模式 | 'sqlite' SQLite 运行时数据库模式 */
  storageMode: 'native' | 'sqlite';
  /** 角色专属设置键映射 */
  [key: string]: unknown;
}

/** 剧情推进设置 */
export interface PlotSettings_ACU {
  enabled: boolean;
  prompts: Array<{
    id: string;
    name: string;
    role: string;
    content: string;
    deletable: boolean;
  }>;
  rateMain: number;
  ratePersonal: number;
  rateErotic: number;
  rateCuckold: number;
  recallCount: number;
  extractTags: string;
  contextExtractTags: string;
  contextExtractRules: unknown[];
  plotWorldbookConfig?: WorldbookConfig_ACU;
  agentWorldbookControl?: AgentWorldbookControl_ACU;
  agentWorldbookControlSnapshot?: AgentWorldbookControlSnapshot_ACU;
  [key: string]: unknown;
}
