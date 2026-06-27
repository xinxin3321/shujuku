// ═══════════════════════════════════════════════════════════════
// data/models/defaults.ts — 默认常量（纯数据，无 DOM 依赖）
// 从 02_storage_and_profile.js 迁入
//
// 注意：含中文引号的巨型 JSON 字符串（DEFAULT_CHAR_CARD_PROMPT_ACU、
// DEFAULT_TABLE_TEMPLATE_ACU 等）不能迁移到 .ts 文件——TypeScript 编译器
// 会把中文引号 "" 当作字符串定界符，破坏产物。这些留在旧文件中。
// ═══════════════════════════════════════════════════════════════

// [剧情推进] 默认世界书选择


export const DEFAULT_AGENT_CONTEXT_SETTINGS_ACU = {
  decisionRecentContextCharLimit: 1500,
  decisionPreviousPlotCharLimit: 3000,
  decisionWorldbookContentPreviewLimit: 1000,
  decisionWorldbookCandidateLimit: 100,
  skillifyContentPreviewLimit: 1200,
  skillifyMaxEntries: 100,
  plotWorldbookScanMessageLimit: 3,
};

export const AGENT_CONTEXT_SETTINGS_LIMITS_ACU = {
  decisionRecentContextCharLimit: { min: 200, max: 12000 },
  decisionPreviousPlotCharLimit: { min: 200, max: 20000 },
  decisionWorldbookContentPreviewLimit: { min: 200, max: 5000 },
  decisionWorldbookCandidateLimit: { min: 1, max: 300 },
  skillifyContentPreviewLimit: { min: 200, max: 5000 },
  skillifyMaxEntries: { min: 1, max: 300 },
  plotWorldbookScanMessageLimit: { min: 1, max: 20 },
};

export function buildDefaultAgentDecisionPromptSegments_ACU() {
  return [
    {
      role: 'system',
      content: [
        '你是 SillyTavern 插件 SP·数据库的前置控制 Agent。',
        '你必须基于用户输入、前文剧情、推进任务 Skill、世界书 Skill 元数据，决定本轮剧情推进任务和世界书绿灯条目。',
        '只返回严格 JSON 对象，不要 Markdown，不要解释。',
        'JSON 结构：{{agent.outputSchemaJson}}',
        'taskId 必须来自候选任务。世界书 bookName/uid 必须来自候选世界书。effectiveStage 必须为正整数，effectiveOrder 必须为非负整数。',
      ].join('\n'),
      deletable: false,
    },
    {
      role: 'user',
      content: [
        '用户输入：\n{{agent.userMessage}}',
        '上轮剧情：\n{{agent.previousPlot}}',
        '最近上下文：\n{{agent.recentContext}}',
        '候选推进任务 JSON：\n{{agent.tasksJson}}',
        '候选世界书条目 JSON：\n{{agent.worldbookEntriesJson}}',
        '通道条目上限 JSON：\n{{agent.maxEntriesPerChannelJson}}',
      ].join('\n\n'),
      deletable: true,
    },
  ];
}

export function buildDefaultAgentSkillifyPromptSegments_ACU() {
  return [
    {
      role: 'system',
      content: '你是 SillyTavern 世界书条目的 Skill 元数据生成器。根据条目名称、关键词和内容预览，生成用于 Agent 判断是否触发该条目的描述和触发时机。只返回严格 JSON 对象，不要 Markdown，不要解释。JSON 结构：{{agent.skillify.outputSchemaJson}}',
      deletable: false,
    },
    {
      role: 'user',
      content: '世界书: {{agent.skillify.bookName}}\n条目 uid: {{agent.skillify.uid}}\n条目名称/备注: {{agent.skillify.comment}}\n关键词: {{agent.skillify.keysText}}\n已有 Skill 元数据 JSON: {{agent.skillify.existingSkillMetaJson}}\n内容预览:\n{{agent.skillify.contentPreview}}',
      deletable: true,
    },
  ];
}

export function buildDefaultAgentWorldbookControl_ACU() {
  return {
    enabled: false,
    mode: 'disabled' as const,
    scopeMode: 'follow_worldbook_page_selection' as const,
    agentApiPreset: '',
    agentSkillApiPreset: '',
    skillMetadataPolicy: 'comment_block' as const,
    managedEntryPrefix: 'TavernDB-ACU-AgentGreenlight',
    finalInjectionMode: 'prompt_template' as const,
    restoreOnDisable: true,
    maxSkillifyConcurrency: 2,
    contextSettings: JSON.parse(JSON.stringify(DEFAULT_AGENT_CONTEXT_SETTINGS_ACU)),
    contextSettingsConfigured: false,
    agentDecisionPromptSegments: buildDefaultAgentDecisionPromptSegments_ACU(),
    agentSkillifyPromptSegments: buildDefaultAgentSkillifyPromptSegments_ACU(),
    maxEntriesPerChannel: {
      plot: 20,
      tableFill: 20,
      finalGeneration: 20,
    },
  };
}

export function buildDefaultAgentWorldbookControlSnapshot_ACU() {
  return {
    active: false,
    selectionSignature: '',
    createdAt: 0,
    books: {} as Record<string, Array<{
      uid: string | number;
      previousEnabled: boolean;
      previousKeys?: string[];
      previousType?: string;
      commentHash?: string;
    }>>,
  };
}

export function buildDefaultPlotWorldbookConfig_ACU() {
  return {
    source: 'character' as const,
    manualSelection: [] as string[],
    enabledEntries: {} as Record<string, string[]>,
  };
}

// --- [填表功能] 自动更新阈值默认常量 ---
export const DEFAULT_AUTO_UPDATE_THRESHOLD_ACU = 3;
export const DEFAULT_AUTO_UPDATE_FREQUENCY_ACU = 1;
export const DEFAULT_AUTO_UPDATE_TOKEN_THRESHOLD_ACU = 500;
export const AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU = 2000;

// --- [填表功能] V2 checkpoint 自动生成默认阈值 ---
export const DEFAULT_CHECKPOINT_MAX_ENTRIES_AFTER_CHECKPOINT_ACU = 50;
export const DEFAULT_CHECKPOINT_MAX_OPERATION_KB_AFTER_CHECKPOINT_ACU = 256;
export const DEFAULT_CHECKPOINT_MAX_OPERATION_COUNT_AFTER_CHECKPOINT_ACU = 2000;
export const DEFAULT_CHECKPOINT_CUMULATIVE_OPERATION_RATIO_PERCENT_ACU = 35;
export const DEFAULT_CHECKPOINT_SINGLE_OPERATION_RATIO_PERCENT_ACU = 50;

// --- 一次性默认值刷新版本标记 ---
export const VECTOR_MEMORY_DEFAULTS_REFRESH_VERSION_ACU = 'spv3.6.3-keyword-prompt-content-based-refresh';
export const TABLE_TEMPLATE_DEFAULTS_REFRESH_VERSION_ACU = 'spv2.1.2-table-template-defaults';

// --- 交火模式纪要索引全局默认配置（独立于世界书配置，跟随数据库全局设置） ---
export const defaultVectorMemoryConfig_ACU = {
  enabled: false,
  threshold: 50,
  archiveTriggerCount: 9,
  archiveBatchSize: 3,
  archiveMaxConcurrency: 3,
  summaryIndexArchiveMaxConcurrency: 30,
  topK: 200,
  minScore: 0.45,
  embeddingEndpoint: '',
  embeddingApiKey: '',
  embeddingModel: '',
  rerankEndpoint: '',
  rerankApiKey: '',
  rerankModel: '',
  rerankInstruction: '请根据当前用户输入及关键词，判断每个候选纪要条目的相关性，并将最相关的条目按相关性从高到低降序排列。优先选择能够直接回答、延续或补全当前用户输入意图的条目。',
  vectorNamespace: 'chat',
  entryComment: 'TavernDB-ACU-VectorMemory',
  entryKey: 'TavernDB-ACU-VectorMemory-Key',
  hybridRetrievalEnabled: true,
  bm25CandidateLimit: 1000,
  rrfK: 60,
  summaryIndexKeywordMinRows: 200,
  summaryChunkSentenceCount: 2,
  summaryPromptGroupId: 'remote-memory-archive-default',
  archiveWithoutSummary: false,
  recentFixedInjectCount: 50,
  // [交火向量索引·实验] 基线+滚动增量写入（默认关闭，省远程上传带宽；读取侧自动识别两种格式）。
  summaryIndexRollingDeltaEnabled: false,
  // 折叠阈值 K：滚动增量累计达到 K 个不同纪要行时，把增量折叠进基线。
  summaryIndexRollingDeltaFoldThreshold: 15,
  summaryPromptGroup: [
    {
      role: 'system',
      content: '你负责将一批较早的纪要条目整理为可供长期召回的远记忆大总结。\n'
        + '目标：生成一条可被向量召回使用的高密度长期记忆。\n'
        + '硬性长度约束：最终输出最高 500TK；如果信息过多，优先压缩表达，不要扩写。\n'
        + '内容优先级：人物关系、关键事件、目标变化、冲突、重要道具、地点、时间线、未解决伏笔。\n'
        + '输出要求：只输出最终远记忆大总结正文；不要写解释、前言、编号说明、标题、Markdown 列表，也不要复述你的任务。',
      deletable: false,
    },
    {
      role: 'user',
      content: '以下是需要归档成远记忆大总结的一批较早纪要条目：\n<纪要批次>\n$SUMMARY_SOURCE_ROWS\n</纪要批次>\n\n请在 500TK 以内输出一条信息密度高、可检索、可长期保存的远记忆大总结正文。只输出正文。',
      deletable: true,
    },
  ],
  keywordApiPreset: '',
  keywordContextPairCount: 1,
  keywordGenerationMaxAttempts: 3,
  keywordPromptGroup: [
    {
      role: 'system',
      content: '你负责为交火模式纪要索引召回生成检索关键词。\n'
        + '你会看到最近对话上下文和当前用户输入。\n'
        + '目标：输出最相关的 12 个简洁关键词或短语，用于纪要索引召回与重排序。\n'
        + '优先级：人物、地点、时间、事件、目标、冲突、道具、组织、关系变化、未解决问题。\n'
        + '\n'
        + '【输出格式 — 必须严格遵守】\n'
        + '你的回复必须且只能包含以下两部分，不得使用其他任何格式：\n'
        + '\n'
        + '<thinking>\n'
        + '逐步分析最近上下文、当前用户输入、涉及人物、地点、时间、事件、目标、冲突、道具、组织、关系变化和未解决问题。\n'
        + '</thinking>\n'
        + '<keywords>关键词1，关键词2，关键词3</keywords>\n'
        + '\n'
        + '【硬性规则】\n'
        + '- 关键词必须且只能放在 <keywords></keywords> 标签之间。\n'
        + '- 禁止使用"关键词："前缀输出，禁止使用编号或列表格式。\n'
        + '- <keywords> 标签内只放关键词或短语，不要放解释句、编号、前后缀说明。\n'
        + '- 多个关键词必须使用中文逗号分隔。\n'
        + '- 尽量输出 12 个，最多 24 个。\n'
        + '- <keywords> 标签外的任何内容都不会被用于检索匹配。',
      deletable: false,
    },
    {
      role: 'user',
      content: '最近上下文：\n$RECENT_CONTEXT\n\n当前用户输入：\n$USER_INPUT\n\n请根据以上内容生成交火模式纪要索引召回关键词。先在 <thinking> 中分析，然后在 <keywords></keywords> 标签中输出关键词。',
      deletable: true,
    },
    {
      role: 'assistant',
      content: '<thinking>\n',
      deletable: true,
    },
  ],
  recallCandidateLimit: 1000,
};

// --- 全局世界书默认配置 ---
export const defaultWorldbookConfig_ACU = {
  source: 'character',
  manualSelection: [] as string[],
  enabledEntries: {} as Record<string, string[]>,
  injectionTarget: 'character',
  outlineEntryEnabled: true,
  zeroTkOccupyMode: false,
  summaryVectorIndexModeEnabled: false,
  // vectorMemory 保留引用以兼容旧数据迁移读取，但新数据写入 settings_ACU.vectorMemoryConfig
  vectorMemory: defaultVectorMemoryConfig_ACU,
};

import { DEFAULT_CONTENT_OPTIMIZATION_PROMPT_GROUP_ACU } from './defaults-json.js';

/** 构建默认正文优化提示词组（纯数据构造，无运行时依赖） */
export function buildDefaultContentOptimizationPromptGroup_ACU({ mainContent = '' } = {}) {
    const src = DEFAULT_CONTENT_OPTIMIZATION_PROMPT_GROUP_ACU;
    const base = Array.isArray(src) ? JSON.parse(JSON.stringify(src)) : [];

    // 如果提供了主内容，替换 $CONTENT 占位符
    if (mainContent) {
        base.forEach((item: any) => {
            if (item.content && typeof item.content === 'string') {
                item.content = item.content.replace(/\$CONTENT/g, mainContent);
            }
        });
    }

    return base;
}
