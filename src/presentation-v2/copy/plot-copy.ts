export const plotCopy = {
  panels: {
    preset: {
      title: "剧情推进预设",
      description:
        "下拉框切换当前的预设，星标设为全局默认。点击按钮，可导入新预设、管理全部预设。内置默认预设无法修改，请使用「从默认新建」。预设包含多个独立任务，支持并发或串行。",
    },
    worldbook: {
      title: "剧情推进世界书",
      description:
        "剧情推进参考的世界书条目。默认跟随角色卡主世界书，也可手动指定。Agent 模式可接管原世界书绿灯，由 Agent 决策剧情、填表与正文通道的触发条目。",
    },
  },
  worldbook: {
    emptyDefault: "所选世界书中无可显示的条目。",
    emptyCharacter:
      "未解析到角色卡世界书。打开聊天后会显示条目；也可手动选择一本。",
    emptyManual: "请先选择一本世界书。",
  },
  agentControl: {
    title: "Agent 世界书总控",
    description: "切换 Agent 世界书模式；接管会禁用当前范围内原关键词绿灯条目，并保留快照用于恢复。",
    modes: { disabled: "关闭", passive: "仅观察", agent: "Agent 接管" },
    modeChanged: {
      disabled: "Agent 世界书模式已关闭。",
      passive: "Agent 世界书已切换为仅观察模式。",
      agent: "Agent 世界书已切换为接管模式。",
    },
    status: {
      inactive: "未接管",
      active: (count: number) => `接管中 · 已屏蔽 ${count} 条`,
    },
    takeover: {
      button: "接管原绿灯",
      confirm: {
        title: "接管原世界书绿灯",
        message: "将禁用当前剧情推进世界书范围内可由 Agent 管理的原关键词触发条目，并保存恢复快照。",
        dangerMessage: "这是写回酒馆世界书的操作。确认前请确保当前世界书范围正确。",
        confirmLabel: "确认接管",
        cancelLabel: "取消",
      },
      modeRequired: "请先切换到「Agent 接管」模式，再执行接管。",
      success: (disabled: number) => `已接管原绿灯，禁用 ${disabled} 条条目。`,
      partial: (disabled: number, failed: number) => `已接管部分原绿灯：禁用 ${disabled} 条，${failed} 条禁用失败。`,
      noop: "未执行接管。",
      error: "接管原绿灯失败",
      reasons: {
        empty_scope: "当前世界书范围为空，无法接管。",
        worldbook_api_unavailable: "酒馆世界书写回 API 不可用，无法接管。",
        existing_active_snapshot: "当前范围已经处于接管状态，无需重复接管。",
        snapshot_scope_mismatch: "已有其他范围的接管快照。请先切回原范围并恢复，再接管新范围。",
        no_candidates: "当前范围没有可接管的原关键词绿灯条目。",
        snapshot_saved_with_disable_failures: "已保存快照，但部分条目禁用失败。请检查世界书权限。",
      } as Record<string, string>,
    },
    restore: {
      button: "恢复原绿灯",
      confirm: {
        title: "恢复原世界书绿灯",
        message: "将按接管快照恢复原世界书条目的启用状态。",
        confirmLabel: "确认恢复",
        cancelLabel: "取消",
      },
      success: (restored: number, skipped: number) => `已恢复 ${restored} 条原绿灯${skipped ? `，跳过 ${skipped} 条已不存在条目` : ""}。`,
      noop: "未执行恢复。",
      error: "恢复原绿灯失败",
      reasons: {
        no_active_snapshot: "当前没有可恢复的接管快照。",
        selection_signature_mismatch: "当前世界书范围与快照范围不一致，请切回接管时的范围后再恢复。",
        worldbook_api_unavailable: "酒馆世界书写回 API 不可用，无法恢复。",
        restore_failures_snapshot_kept: "部分条目恢复失败，快照已保留，可稍后重试。",
      } as Record<string, string>,
    },
    skillify: {
      button: "一键 Skill 化",
      confirm: {
        title: "一键生成 Skill 元数据",
        message: "将调用配置的 Agent Skill API，为当前世界书范围内可处理条目生成描述与触发时机。用户手动编辑的 Skill 元数据不会被覆盖。",
        confirmLabel: "开始生成",
        cancelLabel: "取消",
      },
      success: (updated: number, skipped: number) => `Skill 化完成：更新 ${updated} 条，跳过 ${skipped} 条。`,
      partial: (updated: number, skipped: number, failed: number) => `Skill 化部分完成：更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条。`,
      noCandidates: "当前范围没有可 Skill 化的世界书条目。",
      error: "一键 Skill 化失败",
    },
  },
};
