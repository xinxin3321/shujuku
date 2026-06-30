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
        "剧情推进参考的世界书条目。默认跟随角色卡主世界书，也可手动指定。Agent 模式会在运行时过滤提示词模板中的世界书条目，由 Agent 决策剧情、填表与正文通道的放行条目。",
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
    description: "切换 Agent 世界书模式；接管只在运行时提示词模板阶段过滤未放行条目，不改写酒馆世界书条目状态。",
    modes: { disabled: "关闭", passive: "仅观察", agent: "Agent 接管" },
    modeChanged: {
      disabled: "Agent 世界书模式已关闭。",
      passive: "Agent 世界书已切换为仅观察模式。",
      agent: "Agent 世界书已切换为接管模式。",
    },
    status: {
      inactive: "运行时过滤未启用",
      active: () => "运行时过滤已启用",
    },
    config: {
      status: (state: { source: string; bookName?: string; writableBookName?: string; reason?: string }) => {
        if (state.source === "worldbook" && state.bookName) return `配置保存在世界书：${state.bookName}`;
        if (state.source === "legacy_settings") {
          return state.writableBookName
            ? `正在使用旧全局配置；下次保存会写入世界书：${state.writableBookName}`
            : "正在使用旧全局配置；当前未找到可写世界书，无法保存为卡级配置。";
        }
        if (state.writableBookName) return `当前使用默认配置；保存后写入世界书：${state.writableBookName}`;
        return "当前使用默认配置；未找到可写世界书，无法保存卡级 Agent 配置。";
      },
      saveFailed: (reason: string) => reason === "no_config_host_book"
        ? "未找到可写世界书，卡级 Agent 配置未保存。"
        : `卡级 Agent 配置保存失败：${reason || "未知原因"}`,
    },
    apiPresets: {
      decisionLabel: "Agent 决策 API",
      decisionHint: "用于 Agent 判断世界书条目是否应启用；留空则使用当前 API 配置。",
      skillLabel: "Agent Skill 化 API",
      skillHint: "用于一键生成世界书 Skill 元数据；留空则使用当前 API 配置。",
      followCurrentLabel: "使用当前 API 配置",
    },
    takeover: {
      button: "启用运行时过滤",
      confirm: {
        title: "启用 Agent 运行时过滤",
        message: "将由 Agent 在提示词模板阶段过滤当前剧情推进世界书范围内未放行的条目。原世界书条目状态、深度和顺序不会被改写。",
        dangerMessage: "此操作不会写回酒馆世界书，但会影响后续剧情推进生成时进入提示词的条目。确认前请确保当前世界书范围正确。",
        confirmLabel: "确认启用",
        cancelLabel: "取消",
      },
      modeRequired: "请先切换到「Agent 接管」模式，再执行接管。",
      success: () => "Agent 运行时过滤已启用；原世界书条目状态保持不变。",
      noop: "未启用运行时过滤。",
      error: "启用 Agent 运行时过滤失败",
      reasons: {
        empty_scope: "当前世界书范围为空，无法启用运行时过滤。",
        no_card_agent_config: "当前角色卡世界书尚未保存 Agent 配置，未启用运行时过滤。",
        not_agent_mode: "当前角色卡未开启 Agent 接管模式，未启用运行时过滤。",
        no_skill_data: "当前世界书范围没有 Skill 化数据，按普通世界书流程运行。请先执行一键 Skill 化。",
        runtime_filter_only: "Agent 运行时过滤已由提示词模板阶段处理。",
        no_candidates: "当前范围没有可由 Agent 管理的世界书条目。",
      } as Record<string, string>,
    },
    restore: {
      button: "清理遗留状态",
      confirm: {
        title: "清理 Agent 世界书遗留状态",
        message: "将清理旧版本写入的 Agent 内部隐藏条目，并关闭运行时过滤；不会恢复或改写任何原世界书条目的启用状态。",
        confirmLabel: "确认清理",
        cancelLabel: "取消",
      },
      success: () => "已清理 Agent 世界书遗留状态；原世界书条目状态保持不变。",
      noop: "没有需要清理的 Agent 世界书遗留状态。",
      error: "清理 Agent 世界书遗留状态失败",
      reasons: {
        runtime_filter_only: "当前使用运行时过滤机制，没有需要恢复的世界书条目状态。",
        legacy_artifacts_cleaned: "已清理旧版本 Agent 内部隐藏条目。",
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
    clearSkillMeta: {
      button: "清除 Skill 化",
      confirm: {
        title: "清除世界书 Skill 元数据",
        message: "将删除当前 Agent 世界书范围内条目的 Skill 元数据块。此操作不会恢复接管状态，也不会删除世界书条目正文或 Agent 配置条目。",
        confirmLabel: "确认清除",
        cancelLabel: "取消",
      },
      success: (cleared: number) => `已清除 ${cleared} 条世界书 Skill 元数据。`,
      partial: (cleared: number, skipped: number, failed: number) => `Skill 元数据清除部分完成：清除 ${cleared} 条，跳过 ${skipped} 条，失败 ${failed} 条。`,
      noop: "当前 Agent 世界书范围内没有可清除的 Skill 元数据。",
      error: "清除 Skill 元数据失败",
    },
    advanced: {
      button: "Agent 高级设置",
      title: "Agent 世界书高级设置",
      description: "编辑 Agent 决策、Skill 化提示词模板，并控制上下文层数与候选数量上限。",
    },
    executionMode: {
      label: "Agent 与剧情推进执行方式",
      hint: "串行模式保持 Agent 接管剧情任务与剧情世界书绿灯；并发模式下 Agent 不决定哪些剧情任务生效，剧情任务也按非 Agent 模式读取世界书，只保留正文绿灯判断。",
      options: {
        sequential: "串行接管",
        concurrent: "并发旁路",
      },
    },
    contextSettings: {
      title: "上下文参数",
      description: "这些参数会影响 Agent 决策、世界书 Skill 化和剧情世界书扫描。输入会被硬上限夹紧，别指望把模型窗口当垃圾桶无限塞。",
      resetButton: "恢复默认上下文参数",
      resetSuccess: "已恢复默认上下文参数。",
      fields: {
        decisionRecentContextCharLimit: {
          label: "最近上下文层数",
          hint: "进入 Agent 决策提示词的最近对话层数；1 层 = 1 条 AI 回复 + 其上方 1 条用户输入。剧情推进记录保存在用户楼层，会随对应上下文一起传入。",
        },
        decisionWorldbookCandidateLimit: {
          label: "决策世界书候选数",
          hint: "进入 Agent 决策提示词的世界书候选条目最大数量。候选只包含条目名称、关键词、描述和触发时机，不再携带正文预览。",
        },
        skillifyMaxEntries: {
          label: "Skill 化最大条目数",
          hint: "一键 Skill 化单次最多处理的世界书条目数量。",
        },
        plotWorldbookScanMessageLimit: {
          label: "剧情世界书扫描消息数",
          hint: "剧情推进读取世界书内容时回看的聊天消息数量；未显式保存旧配置时仍回退原 contextTurnCount。",
        },
        agentAiMaxRetries: {
          label: "Agent AI 最大尝试次数",
          hint: "Agent 决策与一键 Skill 化的公共 AI 调用尝试次数。设置过高会放大请求量，不会让烂提示词自动变聪明。",
        },
        greenlightMinTkBudget: {
          label: "绿灯最小 TK 预算",
          hint: "Agent 选择绿灯条目时的目标下限。它只用于提示模型不要选得过少，不会为了凑下限强塞无关条目。",
        },
        greenlightMaxTkBudget: {
          label: "绿灯最大 TK 预算",
          hint: "Agent 每个通道、每个剧情任务可选择的绿灯条目 TK 上限；超出时会优先保留模型先返回的高相关条目。",
        },
      },
    },
    prompts: {
      title: "提示词模板",
      description: "可使用 {{agent.*}} 与 {{agent.skillify.*}} 占位符。未知占位符会原样保留，写错了模型不会替你变聪明。",
      decisionTitle: "Agent 决策提示词",
      decisionReset: "恢复默认决策提示词",
      decisionResetSuccess: "已恢复默认决策提示词。",
      skillifyTitle: "Agent Skill 化提示词",
      skillifyReset: "恢复默认 Skill 化提示词",
      skillifyResetSuccess: "已恢复默认 Skill 化提示词。",
      emptyText: "暂无提示词段。保存时会回退默认模板。",
    },
  },
};
