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

// --- 全局世界书默认配置 ---
export const defaultWorldbookConfig_ACU = {
  source: 'character',
  manualSelection: [] as string[],
  enabledEntries: {} as Record<string, string[]>,
  injectionTarget: 'character',
  outlineEntryEnabled: true,
  zeroTkOccupyMode: false,
};
