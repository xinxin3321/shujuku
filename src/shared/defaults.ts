// ═══════════════════════════════════════════════════════════════
// data/models/defaults.ts — 默认常量（纯数据，无 DOM 依赖）
// 从 02_storage_and_profile.js 迁入
//
// 注意：含中文引号的巨型 JSON 字符串（DEFAULT_CHAR_CARD_PROMPT_ACU、
// DEFAULT_TABLE_TEMPLATE_ACU 等）不能迁移到 .ts 文件——TypeScript 编译器
// 会把中文引号 "" 当作字符串定界符，破坏产物。这些留在旧文件中。
// ═══════════════════════════════════════════════════════════════

// [剧情推进] 默认世界书选择


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

// --- 一次性默认值刷新版本标记 ---
export const VECTOR_MEMORY_DEFAULTS_REFRESH_VERSION_ACU = 'spv2.1.2-vector-defaults';
export const TABLE_TEMPLATE_DEFAULTS_REFRESH_VERSION_ACU = 'spv2.1.2-table-template-defaults';

// --- 向量记忆全局默认配置（独立于世界书配置，跟随数据库全局设置） ---
export const defaultVectorMemoryConfig_ACU = {
  enabled: false,
  threshold: 50,
  archiveTriggerCount: 9,
  archiveBatchSize: 3,
  archiveMaxConcurrency: 3,
  topK: 10,
  minScore: 0.6,
  embeddingEndpoint: '',
  embeddingApiKey: '',
  embeddingModel: '',
  rerankEndpoint: '',
  rerankApiKey: '',
  rerankModel: '',
  vectorNamespace: 'chat',
  entryComment: 'TavernDB-ACU-VectorMemory',
  entryKey: 'TavernDB-ACU-VectorMemory-Key',
  summaryChunkSentenceCount: 2,
  summaryPromptGroupId: 'remote-memory-archive-default',
  archiveWithoutSummary: false,
  summaryPromptGroup: [
    {
      role: 'system',
      content: '你负责将一批较早的纪要条目整理为可供长期召回的远记忆大总结。\n'
        + '目标：生成一条可被向量召回使用的高密度长期记忆。\n'
        + '硬性长度约束：最终输出最高 1000TK；如果信息过多，优先压缩表达，不要扩写。\n'
        + '内容优先级：人物关系、关键事件、目标变化、冲突、重要道具、地点、时间线、未解决伏笔。\n'
        + '输出要求：只输出最终远记忆大总结正文；不要写解释、前言、编号说明、标题、Markdown 列表，也不要复述你的任务。',
      deletable: false,
    },
    {
      role: 'user',
      content: '以下是需要归档成远记忆大总结的一批较早纪要条目：\n<纪要批次>\n$SUMMARY_SOURCE_ROWS\n</纪要批次>\n\n请在 1000TK 以内输出一条信息密度高、可检索、可长期保存的远记忆大总结正文。只输出正文。',
      deletable: true,
    },
  ],
  keywordApiPreset: '',
  keywordContextPairCount: 1,
  keywordPromptGroup: [
    {
      role: 'system',
      content: '你负责为向量记忆召回生成检索关键词。\n'
        + '你会看到最近对话上下文和当前用户输入。\n'
        + '请输出 3 到 8 个简洁关键词或短语，优先保留人物、地点、时间、事件、目标、道具、组织等检索价值高的信息。\n'
        + '禁止输出解释、句子、编号、前后缀说明。\n'
        + '多个关键词请使用中文逗号分隔。\n'
        + '如果当前输入信息很少，也必须尽量提炼可检索的核心词。',
      deletable: false,
    },
    {
      role: 'user',
      content: '最近上下文：\n$RECENT_CONTEXT\n\n当前用户输入：\n$USER_INPUT\n\n请仅输出关键词。',
      deletable: true,
    },
  ],
  recallCandidateLimit: 100,
};

// --- 全局世界书默认配置 ---
export const defaultWorldbookConfig_ACU = {
  source: 'character',
  manualSelection: [] as string[],
  enabledEntries: {} as Record<string, string[]>,
  injectionTarget: 'character',
  outlineEntryEnabled: true,
  zeroTkOccupyMode: false,
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
