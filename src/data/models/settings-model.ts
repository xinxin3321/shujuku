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
export type AgentPlotExecutionMode_ACU = 'sequential' | 'concurrent';
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
  agentAiMaxRetries: number;
  greenlightMinTkBudget: number;
  greenlightMaxTkBudget: number;
}

/** 世界书条目 Skill 元数据 */
export interface WorldbookSkillMeta_ACU {
  version: 1;
  description: string;
  triggerWhen: string;
  tk?: number;
  updatedAt: number;
  updatedBy: WorldbookSkillMetaUpdatedBy_ACU;
}

/** Agent 模式世界书接管配置 */
export interface AgentWorldbookControl_ACU {
  enabled: boolean;
  mode: AgentWorldbookControlMode_ACU;
  agentPlotExecutionMode: AgentPlotExecutionMode_ACU;
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

/** 世界书内存储的单卡 Agent 配置元数据；作为新架构下 Agent 控制配置的主事实源。 */
export interface AgentWorldbookCardConfigMeta_ACU {
  version: 1;
  kind: 'agent_worldbook_config';
  updatedAt: number;
  control: Partial<AgentWorldbookControl_ACU>;
}

/** Agent 世界书接管快照条目结构；用于禁用原生触发后按原状态恢复。 */
export interface AgentWorldbookControlSnapshotEntry_ACU {
  uid: string | number;
  previousEnabled: boolean;
  previousKeys?: string[];
  previousType?: string;
  commentHash?: string;
}

/** Agent 世界书接管快照容器；active 时表示已临时禁用候选条目的原生触发。 */
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
