# AutoCardUpdater 插件更新日志

## 2026-03-30 更新（填表 JSON 脏数据容错增强）

### 修复填表指令中字符串包含未转义引号、控制字符或尾随逗号时容易整条解析失败的问题

#### 功能描述
1. 修复填表 AI 输出的 [`insertRow()`](index.js:1850)、[`updateRow()`](index.js:1850) 指令里，JSON 值中包含未转义双引号时，[`parseTableEditCommandLine_ACU()`](index.js:26110) 会直接解析失败并跳过整条指令的问题。
2. **问题根因**：旧逻辑仅在 [`parseTableEditCommandLine_ACU()`](index.js:26313) 内通过几条正则做轻量清洗，无法稳定处理两类高频脏数据：一是类似 `秉持"谁欺负我就打谁"的信念` 这类“字符串内部再次出现未转义引号”；二是 AI 把对象后半段写成 `"2":"描述","裸字符串","裸字符串"` 这种“前半有键、后半缺失数字键”的半结构化对象。后者会让标准 [`JSON.parse()`](index.js:26344) 和单纯转义清洗都失效。
3. **修复方案**：
   - 在 [`index.js`](index.js:25831) 新增多层 JSON sanitization pipeline，按“智能引号归一化 → 未转义引号修复 → 控制字符转义 → 尾随逗号清理 → 数字键修复”的顺序处理脏数据；
   - 新增宽松对象恢复工具 [`splitTopLevelSegments_ACU()`](index.js:26109)、[`findTopLevelDelimiterIndex_ACU()`](index.js:26162)、[`tryParseLooseJsonValue_ACU()`](index.js:26203)、[`parseLooseObjectKey_ACU()`](index.js:26232)、[`coerceLooseRowObject_ACU()`](index.js:26245)，用于把缺失键名的裸字符串段自动补成递增数字键；
   - 在 [`parseTableEditCommandLine_ACU()`](index.js:26313) 的 JSON 解析失败分支中，优先尝试对原始对象做宽松恢复；若失败，再走 pipeline + 二次 [`JSON.parse()`](index.js:26350) + 清洗后宽松恢复的三级兜底链路；
   - 在填表提示词 [`DEFAULT_CHAR_CARD_PROMPT_ACU`](index.js:1822) 中补充显式格式要求，提前约束 AI 输出纯数字表格 ID、完整数字键和值的成对结构，降低脏数据产生概率。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 填表提示词格式约束增强 | 1850-1850 | 在 [`DEFAULT_CHAR_CARD_PROMPT_ACU`](index.js:1822) 中新增“表格 ID / 行号必须是纯数字、字段值内部双引号必须写成 `\\\"`、换行必须写成 `\\n`、禁止省略数字键后连续输出裸字符串”说明 |
| JSON 清洗与宽松恢复辅助函数 | 25831-26310 | 新增智能引号归一化、未转义引号修复、控制字符清洗、尾随逗号移除、数字键修复，以及 [`splitTopLevelSegments_ACU()`](index.js:26109) / [`coerceLooseRowObject_ACU()`](index.js:26245) 等宽松对象恢复工具 |
| 指令解析三级兜底链路 | 26329-26360 | 在 [`parseTableEditCommandLine_ACU()`](index.js:26313) 中改为“原始对象宽松恢复 → sanitization pipeline → 清洗后宽松恢复”的三级解析链路，并补充恢复日志 |

## 2026-03-30 更新（外部导入提示词世界书过滤设置）

### 新增仅对外部导入生效的世界书占位符过滤开关

#### 功能描述
1. 新增设置 [`importPromptExcludeImportedWorldbookEntries`](index.js:4699)，默认开启，仅用于外部导入流程。
2. **问题根因**：外部导入在构造填表提示词的世界书占位符时，仍会通过 [`getCombinedWorldbookContent_ACU()`](index.js:24920) 读取带有 `外部导入-` 标签的世界书条目；这些历史导入条目会被再次送回当前导入轮次，干扰本轮表格增量更新与世界书条目生成判断。
3. **修复方案**：
   - 在默认设置与运行时设置中新增外部导入专用开关；
   - 在外部导入页新增 UI 复选框，并在设置加载与事件绑定时进行回填和保存；
   - 新增 [`isImportTaggedLorebookEntry_ACU()`](index.js:24913) 用于识别 `外部导入-` 和 `ACU-[隔离码]-外部导入-` 条目；
   - 通过 [`proceedWithCardUpdate_ACU()`](index.js:26840) → [`prepareAIInput_ACU()`](index.js:25113) → [`getCombinedWorldbookContent_ACU()`](index.js:24920) 只在 `isImportMode === true` 时透传过滤参数；
   - 普通填表流程不传该参数，因此不影响其它填表模式。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 外部导入设置默认值 | 4697-4699, 13489-13490 | 新增 [`importPromptExcludeImportedWorldbookEntries`](index.js:4699) 默认值，确保新旧设置都能获得该开关 |
| 外部导入设置回填 | 13747-13752 | 在设置加载阶段回填“屏蔽外部导入世界书条目占位符”开关状态 |
| 外部导入页 UI | 21230-21246 | 在外部导入页新增仅对导入流程生效的过滤开关说明与复选框 |
| 外部导入页事件绑定 | 22145-22170 | 保存 UI 开关状态到 [`settings_ACU`](index.js:22167)，并输出导入专用日志 |
| 外部导入世界书条目标记识别 | 24913-24923 | 新增 [`isImportTaggedLorebookEntry_ACU()`](index.js:24913)，兼容普通前缀与隔离前缀条目识别 |
| 世界书占位符过滤 | 24977-24993 | 在 [`getCombinedWorldbookContent_ACU()`](index.js:24920) 中按需屏蔽导入标签条目，并记录仅外部导入生效的过滤日志 |
| AI 输入准备链路 | 25113-25113, 25282-25288 | 为 [`prepareAIInput_ACU()`](index.js:25113) 增加外部导入专用选项，并在生成世界书占位符时透传过滤参数 |
| 外部导入调用链入口 | 26836-26842 | 仅在 [`proceedWithCardUpdate_ACU()`](index.js:26715) 的 `isImportMode` 分支中启用该过滤选项 |

## 2026-03-30 更新（外部导入临时 JSON 条目恢复）

### 修复外部导入时累计表格数据未按正常流程暂存到目标世界书，导致最终条目生成阶段读取为空

#### 功能描述
1. 修复外部导入流程中，累计表格数据没有在每个分块处理后写回目标世界书临时 JSON 条目，导致继续导入或最终注入阶段缺少基础数据的问题。
2. **问题根因**：[`processImportedTxtAsUpdates_ACU()`](index.js:18695) 只在全部分块完成后才创建一次外部导入 JSON 备份条目，没有在处理中持续维护这个“本地数据源”条目；同时继续导入时也没有优先从该条目恢复累计数据库，导致最终阶段可能出现 `mergedData 为空`、`No important persons to create entries for.`、`No summary rows to create entries for.` 和 `[CustomExport] mergedData 为空，已清理旧条目，跳过创建。`。
3. **第二轮补充根因**：[`updateReadableLorebookEntry_ACU()`](index.js:16317) 之前把 [`readableText`](index.js:16362) 为空直接当成“数据库为空”，但外部导入在只选“单独导出到世界书”的表、或只涉及 [`重要人物表`](index.js:9460) / [`总结表`](index.js:9463) / [`总体大纲`](index.js:9466) 时，`readableText` 本来就可能为空，实际 [`mergedData`](index.js:16338) 仍然有有效数据，结果把自定义导出错误地走到了“清理并跳过创建”分支。
4. **修复方案**：
   - 新增 [`getImportJsonStorageComment_ACU()`](index.js:18639)、[`loadImportedJsonDataFromLorebook_ACU()`](index.js:18644)、[`saveImportedJsonDataToLorebook_ACU()`](index.js:18658)、[`deleteImportedJsonDataFromLorebook_ACU()`](index.js:18685) 统一管理外部导入临时 JSON 条目；
   - 在 [`processImportedTxtAsUpdates_ACU()`](index.js:18756) 首次导入时，先用模板初始化内存数据库，并立即写入目标世界书的临时 JSON 条目；
   - 在 [`processImportedTxtAsUpdates_ACU()`](index.js:18780) 继续导入时，优先从临时 JSON 条目恢复累计数据库；
   - 在 [`processImportedTxtAsUpdates_ACU()`](index.js:18830) 每个分块成功后，立刻把累计数据库刷新回目标世界书临时条目；
   - 在 [`processImportedTxtAsUpdates_ACU()`](index.js:18849) 最终世界书条目生成前，再从临时 JSON 条目重载一次累计数据，避免 UI 刷新链覆盖内存；
   - 在 [`updateReadableLorebookEntry_ACU()`](index.js:16391) 仅对外部导入启用放宽判空：改为以 `mergedData` 是否存在有效单元格作为主判据，不影响其它普通填表流程；
   - 在 [`processImportedTxtAsUpdates_ACU()`](index.js:18867) 最终世界书条目生成完成后，再删除临时 JSON 条目；
   - 临时 JSON 条目统一写入实际目标世界书 [`importTarget`](index.js:18722)，避免“character”占位目标导致临时条目写错位置。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 外部导入临时 JSON 条目辅助函数 | 18639-18693 | 新增临时条目 comment 生成、读取、写入、删除辅助函数，统一管理 `ImportedJsonData` 数据源条目 |
| 外部导入初始化与续跑恢复 | 18716-18798 | 新增实际目标世界书解析；首次导入时立即写入临时 JSON 条目，继续导入时优先从临时条目恢复累计数据库 |
| 外部导入分块持久化 | 18830-18840 | 每个分块成功后立刻把累计数据库刷新到目标世界书的临时 JSON 条目 |
| 外部导入最终重载与注入 | 18847-18874 | 最终生成世界书条目前，优先从临时 JSON 条目重载累计数据，再执行最终注入与删除临时条目 |
| 世界书空数据库判定修复（仅外部导入） | 16391-16414 | 仅对外部导入放宽判空，避免 `readableText` 为空时误判数据库为空，同时不影响其它普通填表流程 |

## 2026-03-30 更新（浅色主题勾选框配色优化）

### 优化插件主面板在素纱主题下的勾选框视觉风格

#### 功能描述
1. 优化插件主面板在浅色“素纱”主题下的复选框配色，避免继续沿用深色主题的纯黑底色。
2. **问题根因**：[`index.js`](index.js:19829) 中插件弹窗作用域下的 `input[type="checkbox"]` 固定使用黑底白勾，虽然在深色“墨纸”主题中对比清晰，但切换到浅色“素纱”主题后会产生过强反差，破坏整体古典浅色界面的协调感。
3. **优化方案**：将勾选框样式改为基于主题变量驱动，在默认深色主题下继续保持原有黑底白勾效果，同时为浅色“素纱”主题新增独立的边框、底色、选中底色、阴影与焦点高亮变量，使未选中和已选中状态都与浅色 UI 保持统一。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 插件主面板复选框样式 | 19829-19868 | 将固定黑底复选框改为使用 `--acu-checkbox-*` 主题变量控制边框、背景、选中态与焦点态 |
| 素纱/墨纸主题变量 | 20396-20400, 20430-20434 | 为双主题分别补充复选框颜色变量；浅色主题下使用更柔和的纸面底色与印章色选中态 |

## 2026-03-30 更新（世界书条目 uid=0 勾选修复）

### 修复发送世界书条目时 `uid === 0` 被误判为未选择的问题

#### 功能描述
1. 修复发送世界书条目时，条目 `uid` 为 `0` 时无法被勾选、保存或读取的问题。
2. **问题根因**：世界书条目勾选事件里使用了 [`if (!bookName || !uid) return;`](index.js:23918) 这类真假值判断；在 JavaScript 中数字 `0` 会被当作 `false`，导致合法的 `uid = 0` 被提前拦截。
3. **修复方案**：将 `uid` 判定改为仅拦截 `undefined` 和 `null`，保留 `0` 作为有效条目 ID，使 [`$plotEntryList`](index.js:23913) 中的世界书第 0 号条目也能正常参与勾选与配置保存。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 世界书条目勾选事件 | 23915-23918 | 将 `uid` 的空值判断从真假值判断改为显式判定 `uid === undefined || uid === null`，修复 `uid = 0` 时无法选中的问题 |

## 2026-03-30 更新（正文提示词随机数修复）

### 修复 AI 描写正文提示词中的 `random` 标签不生效

#### 功能描述
1. 修复酒馆正文提示词处理链路中，只解析条件模板 `if/else`，但没有执行随机数、计算变量、最大值/最小值变量预处理的问题。
2. **问题根因**：[`handleChatCompletionReady_ACU()`](index.js:11736) 在处理 `CHAT_COMPLETION_SETTINGS_READY` 事件时，仅调用了 [`parseIfBlockRecursive_ACU()`](index.js:11531)，导致 AI 描写正文使用的提示词消息里，`<random min="1" max="100" />` 和 `$random:id` 不会先被展开。
3. **修复方案**：在 [`handleChatCompletionReady_ACU()`](index.js:11736) 内新增正文提示词统一处理流程，按“随机数 → 随机变量替换 → 计算变量/最大值/最小值变量 → 条件模板”的顺序处理 `message.content` 与多段文本 `part.text`，确保正文提示词与填表、剧情推进、世界书保持一致。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`handleChatCompletionReady_ACU()`](index.js:11736) | 11764-11809 | 新增 [`processPromptTemplateContent_ACU()`](index.js:11764) 统一处理正文提示词中的随机数、变量替换、计算标签与条件模板 |

## 2026-03-29 更新（晚间第二轮）

### 随机数生成功能全局扩展

#### 功能描述
1. 将随机数生成功能扩展到世界书内容处理中，使其与条件模板等语法一样在全球范围内可用。
2. 现在在世界书中也可以使用 `<random min="1" max="100" />` 标签生成随机数。
3. 支持随机数变量 `<random id="dice" min="1" max="6" />` 并通过 `$random:dice` 引用。
4. 将随机数处理添加到"最终注入指令"（finalSystemDirective）处理流程中。
5. 在数据库提示词模板的 EJS 渲染后添加随机数处理，使随机数在填表提示词中也能使用。

#### 使用示例
```
<!-- 在世界书条目中使用随机数 -->
🎲 本轮随机事件判定：<random min="1" max="100" />

<!-- 在世界书中使用随机数变量 -->
<random id="luck" min="1" max="100" />
今日运势：$random:luck

<!-- 在最终注入指令中使用随机数 -->
<random id="mood" min="1" max="10" />
本轮情绪指数：$random:mood

<!-- 在填表提示词中使用随机数 -->
<random id="roll" min="1" max="20" />
🎲 判定结果：$random:roll
```

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进世界书内容处理 | 约12803-12809 | 添加随机数标签解析和变量替换 |
| 正文优化世界书内容处理 | 约2157-2160 | 添加随机数标签解析和变量替换 |
| 最终注入指令处理 | 约12811-12817 | 添加随机数标签解析和变量替换 |
| 数据库提示词模板渲染 | 约25257-25259 | 在 EJS 渲染后添加随机数处理 |

## 2026-03-29 更新（晚间）

### Toast 提示框和正文优化对话框 UI 美化（古典中国风）

#### 功能描述
1. 将 Toast 提示框的 UI 风格从现代科技风改为古典中国风。
2. 将正文优化对话框（showReoptimizationDialog_ACU、showOptimizationLoopDialog_ACU、showOptimizationDiffDialog_ACU）的 UI 风格改为古典中国风。
3. 统一使用古典设计元素：宋体字体、纸张纹理背景、印章红强调色（#7d4940）、细边框（1px）、小圆角（1-2px）。
4. 支持墨纸/素纱双主题切换（使用 CSS 变量）。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| Toast 样式注入 | 7646-7755 | ACU Toast Theme：古典中国风双主题样式（墨纸/素纱），图标改为古风汉字（成/知/警/误） |
| [`showReoptimizationDialog_ACU()`](index.js:3450) | 3450-3532 | 重新优化对话框：古典中国风样式 |
| [`showOptimizationLoopDialog_ACU()`](index.js:3876) | 3876-3970 | 正文替换建议对话框：古典中国风样式 |
| [`showOptimizationDiffDialog_ACU()`](index.js:4040) | 4040-4122 | 优化对比对话框：古典中国风样式 |
| [`showOptimizationDiff_ACU()`](index.js:4178) | 4178-4180 | 优化结果摘要中的重新优化按钮：古典中国风样式 |

---

### 可视化编辑器 UI 美化（古典中国风）

#### 功能描述
1. 将可视化编辑器的 UI 风格从现代科技风改为古典中国风，与主面板和独立窗口保持一致。
2. 支持墨纸/素纱双主题切换。
3. 采用古典设计元素：宋体字体、纸张纹理背景、印章元素、细边框、竖线装饰。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 主面板 HTML 模板 | 20535-20542 | 删除主面板顶部副标题"墨纸 / 素纱双主题 · 古卷样式界面" |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28020-28052 | CSS 变量系统：墨纸/素纱双主题颜色变量定义 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28060-28093 | 复选框样式：古典风格 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28097-28256 | 顶部标题栏、侧边栏、表格导航项：古典竖线装饰 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28257-28297 | 按钮样式：古典印章红强调色 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28298-28374 | 数据卡片样式：古典风格 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28375-28487 | 配置面板、模式切换：古典风格 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 28488-28620 | 列编辑器、滚动条、按钮样式 |
| [`VISUALIZER_CSS_ACU`](index.js:28020) | 29234-29302 | 深色统一覆盖：古典风格覆盖修正 |
| [`openVisualizerWindow_ACU()`](index.js:29375) | 29375-29394 | 可视化编辑器内容模板：添加印章标题和主题切换按钮 |
| [`openVisualizerWindow_ACU()`](index.js:29375) | 29432-29447 | 主题切换按钮事件绑定 |

---

## 2026-03-29 更新（下午）

### 修复外部导入模式时数据被错误保存到聊天记录

#### 功能描述
1. 修复外部导入模式下，AI 生成的 `insertRow`、`updateRow`、`deleteRow` 命令被立即保存到聊天记录的问题。
2. **问题根因**：[`parseAndApplyTableEdits_ACU()`](index.js:25130) 函数在执行 `insertRow`、`updateRow`、`deleteRow` 命令后会立即调用 `saveIndependentTableToChatHistory_ACU()` 保存到聊天记录，这个行为没有检查 `isImportMode`。
3. **修复方案**：
   - 为 `parseAndApplyTableEdits_ACU()` 添加 `isImportMode` 参数
   - 在 `proceedWithCardUpdate_ACU()` 调用时传递 `isImportMode`
   - 在 `insertRow`、`updateRow`、`deleteRow` 的保存逻辑中检查 `isImportMode`，如果是导入模式则跳过保存

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`parseAndApplyTableEdits_ACU()`](index.js:25130) | 25130 | 新增 `isImportMode` 参数 |
| [`proceedWithCardUpdate_ACU()`](index.js:26160) | 26290 | 调用时传递 `isImportMode` |
| [`parseAndApplyTableEdits_ACU()`](index.js:25130) | 5839-5844 | `updateRow` 命令保存检查 |
| [`parseAndApplyTableEdits_ACU()`](index.js:25130) | 5961-5966 | `insertRow` 命令保存检查 |
| [`parseAndApplyTableEdits_ACU()`](index.js:25130) | 6079-6084 | `deleteRow` 命令保存检查 |

---

### 修复外部导入完成后清理逻辑扩大范围

#### 功能描述
1. 修复外部导入功能完成后，清理目标世界书中本插件生成的旧条目时，清理范围不够全面的问题。
2. **问题根因**：原清理逻辑只根据模板数据中设置的 `entryName` 来识别需要清理的条目，但如果模板没有设置 `entryName`，或者使用了其他命名方式，清理就不会生效。
3. **修复方案**：
   - 扩大基础前缀列表，增加 `'TavernDB-ACU-CustomExport-'`、`'TavernDB-ACU-ImportantPersonsIndex'`、`'重要人物条目'`、`'纪要索引'` 等前缀
   - 同时从模板数据中提取 `entryName` 和表格原始名称作为清理目标
   - 新增清理完成后的 toast 提示

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`processImportedTxtAsUpdates_ACU()`](index.js:18408) | 18605-18667 | 扩大旧条目清理范围，包含更多条目前缀和模板表格名称 |

---

### 修复外部导入的自定义导出条目命名问题

#### 功能描述
1. 修复外部导入时自定义导出条目的命名格式，确保只使用 `外部导入-` 前缀。
2. **问题根因**：外部导入时条目前缀包含 `外部导入-TavernDB-ACU-CustomExport-`，导致清理逻辑可能被前缀混淆。
3. **修复方案**：
   - 外部导入时只使用 `外部导入-` 前缀，不再包含 `TavernDB-ACU-CustomExport-`
   - 新增 `getImportEntryName()` 辅助函数统一处理条目命名

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16520-16526 | 新增 `getImportEntryName()` 辅助函数 |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16717 | 索引条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16840-16841 | 包裹上条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16857-16858 | 表头条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16915-16916 | 数据行条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16934-16935 | 包裹下条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 16989-16990 | 整体导出包裹上条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 17003-17004 | 整体导出表头条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 17026-17027 | 整体导出条目使用 `getImportEntryName()` |
| [`updateCustomTableExports_ACU()`](index.js:16515) | 17039-17040 | 整体导出包裹下条目使用 `getImportEntryName()` |

---

## 2026-03-29 更新

### 修复全局条目注入顺序问题

#### 功能描述
1. 修复当默认 order 值（99980, 99981, 99982）被占用时，全局条目注入顺序错乱的问题。
2. **问题根因**：三个条目（包裹上、全局内容、包裹下）分别调用 `allocOrder_ACU` 分配 order，当默认值被占用时会分配不连续的值，导致顺序变成"全局内容 → 包裹上 → 包裹下"。
3. **修复方案**：使用 `allocConsecutiveOrderBlock_ACU` 一次性分配连续的 3 个 order 区块，确保三个条目的 order 值始终连续，顺序正确：
   - 包裹上：`baseOrder`
   - 全局内容：`baseOrder + 1`
   - 包裹下：`baseOrder + 2`

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`updateReadableLorebookEntry_ACU()`](index.js:16113) | 16266-16307 | 全局内容条目 order 强制使用 `wrapperPlacement.order + 1` |
| [`updateReadableLorebookEntry_ACU()`](index.js:16113) | 16309-16341 | 包裹上条目 order 使用 `wrapperPlacement.order` |
| [`updateReadableLorebookEntry_ACU()`](index.js:16113) | 16470-16502 | 包裹下条目 order 使用 `wrapperPlacement.order + 2` |

---

### 修复世界书条目 position 值映射问题

#### 功能描述
1. 修复模板设置为"角色定义后"（`after_char`）时，世界书条目实际注入位置仍为"角色定义前"的问题。
2. **问题根因**：[`normalizeLorebookPosition_ACU()`](index.js:15300) 函数返回的 position 值是内部简写 `'before_char'` / `'after_char'`，但 TavernHelper API 期望的正确值是 `'before_character_definition'` / `'after_character_definition'`（参见 [`@types/function/lorebook_entry.d.ts`](@types/function/lorebook_entry.d.ts:8)）。
3. **修复方案**：将所有 `'before_char'` / `'after_char'` 替换为 API 期望的正确值 `'before_character_definition'` / `'after_character_definition'`。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`normalizeLorebookPosition_ACU()`](index.js:15300) | 15300-15307 | 返回 API 期望的正确值 `before_character_definition` / `after_character_definition` |
| [`getFixedPlacementDefaultsForTable_ACU()`](index.js:15337) | 15359-15362 | 全局数据表默认位置改为 `before_character_definition` |
| [`buildDefaultGlobalInjectionConfig_ACU()`](index.js:15391) | 15393-15396 | 全局注入配置默认位置改为 `before_character_definition` |
| UI 下拉选项 | 29173-29176, 29190-29193 | 全局条目位置选择器 value 改为 API 正确值 |
| UI 下拉选项 | 29454-29456, 29471-29473 | 固定条目位置选择器 value 改为 API 正确值 |
| UI 下拉选项 | 29618-29620, 29661-29663 | 自定义导出条目位置选择器 value 改为 API 正确值 |

---

### 修复外部导入功能无法正确将数据注入目标世界书的问题

#### 功能描述
1. 修复 [`processImportedTxtAsUpdates_ACU()`](index.js:18408) 函数在最后一步注入世界书时，数据错误地注入到原始绑定世界书而非用户指定的导入目标世界书。
2. **问题根因**：原代码通过临时修改 `worldbookConfig.injectionTarget` 来设置导入目标，但 [`updateReadableLorebookEntry_ACU()`](index.js:16113) 内部调用 `getCurrentCharSettings_ACU()` 时会触发"兜底补齐逻辑"，重新创建并覆盖整个 `worldbookConfig` 对象，导致临时设置的 `injectionTarget` 丢失。
3. **修复方案**：为 [`updateReadableLorebookEntry_ACU()`](index.js:16113) 添加 `targetLorebookOverride` 可选参数，外部导入时直接传递目标世界书名称，不再依赖临时修改 `worldbookConfig`。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`updateReadableLorebookEntry_ACU()`](index.js:16113) | 16113 | 函数签名新增 `targetLorebookOverride = null` 参数 |
| [`updateReadableLorebookEntry_ACU()`](index.js:16113) | 16204 | 获取世界书名称时优先使用 `targetLorebookOverride` 参数 |
| [`processImportedTxtAsUpdates_ACU()`](index.js:18408) | 18524-18560 | 移除临时修改 `worldbookConfig.injectionTarget` 的逻辑，改用 `targetLorebookOverride` 参数传递导入目标世界书 |
| [`processImportedTxtAsUpdates_ACU()`](index.js:18408) | 18587-18638 | 新增：在外部导入完成后清理目标世界书中本插件生成的旧条目（不带"外部导入-"前缀的条目），避免出现重复条目；并从模板数据中提取 entryName 以覆盖自定义导出条目 |

---

## 2026-03-28 更新

### 优化表格模板数据隔离：读取本地数据时只处理当前模板中的表格

#### 功能描述
1. 解决不同表格模板的本地数据共存问题，避免切换/导入新模板后旧模板数据仍然被读取和显示。
2. 在 [`mergeAllIndependentTables_ACU()`](index.js:8906) 函数中添加模板过滤逻辑：
   - 优先使用指导表（如果存在）的表格键列表
   - 否则使用当前模板的表格键列表
   - 在读取本地数据时，只读取当前模板/指导表中存在的表格数据
3. 这样可以确保：
   - 前端只显示当前模板中的表格
   - 世界书只注入当前模板中的表格数据
   - 表格更新只更新当前模板中的表格
   - 切换回原模板后，数据仍然可用（不删除本地数据）

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`mergeAllIndependentTables_ACU()`](index.js:8906) | 约8922-8934 | 新增：获取模板/指导表表格键列表，用于过滤非当前模板的数据 |
| [`mergeAllIndependentTables_ACU()`](index.js:8906) | 约8951-8956 | 新增：过滤非模板表格（新版按标签分组存储格式） |
| [`mergeAllIndependentTables_ACU()`](index.js:8906) | 约9001-9006 | 新增：过滤非模板表格（旧版独立数据格式） |
| [`mergeAllIndependentTables_ACU()`](index.js:8906) | 约9032-9036 | 新增：过滤非模板表格（旧版标准表格式） |
| [`mergeAllIndependentTables_ACU()`](index.js:8906) | 约9048-9052 | 新增：过滤非模板表格（旧版总结表格式） |

---

### 修复"恢复默认模板"无法覆盖当前使用的表格模板问题

#### 功能描述
1. 修复 [`resetTableTemplate_ACU()`](index.js:27333) 和 [`resetAllToDefaults_ACU()`](index.js:27201) 函数无法正确解析 `DEFAULT_TABLE_TEMPLATE_ACU` 的问题。
2. `DEFAULT_TABLE_TEMPLATE_ACU` 使用双重 JSON 编码格式（`"{...}"`），直接使用 `JSON.parse()` 或 `safeJsonParse_ACU()` 会返回字符串而不是对象。
3. 原代码逻辑：
   - `JSON.parse(DEFAULT_TABLE_TEMPLATE_ACU)` 返回字符串 `"..."`，不是对象
   - 检查 `obj && typeof obj === 'object'` 条件为 `false`
   - 进入 `else` 分支，直接使用 `DEFAULT_TABLE_TEMPLATE_ACU` 作为模板
   - `safeJsonParse_ACU(TABLE_TEMPLATE_ACU, null)` 也无法正确解析双重编码
   - 最终 `templateObj` 为 `null`，`overwriteChatSheetGuideFromTemplate_ACU()` 不会被调用
4. 修复方案：使用专门处理双重编码问题的 [`parseTableTemplateJson_ACU()`](index.js:7823) 函数解析默认模板。
5. 修复后行为与"导入模板"功能保持一致：
   - 补齐顺序编号
   - 清洗并规范化模板
   - 正确调用 `overwriteChatSheetGuideFromTemplate_ACU()` 覆盖当前使用的表格模板

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`resetTableTemplate_ACU()`](index.js:27333) | 约27333-27385 | 使用 `parseTableTemplateJson_ACU()` 解析默认模板，与导入模板流程保持一致 |
| [`resetAllToDefaults_ACU()`](index.js:27201) | 约27201-27256 | 同样使用 `parseTableTemplateJson_ACU()` 解析默认模板 |

---

### 修复空数据初始化时仍注入表格索引条目与包裹条目

#### 功能描述
1. 优化 [`updateCustomTableExports_ACU()`](index.js:16469) 的自定义导出判断逻辑。
2. 在处理每张表的世界书导出前，先过滤掉“整行全空”的无效数据行，避免把模板空行、初始化占位行当成真实数据。
3. 只有当表格存在至少一行有效非空数据，或额外索引条目本身确实有可导出的非空数据时，才继续创建对应世界书条目。
4. 这样可以避免插件在初始化或无数据状态下，仍然向世界书注入“表格索引条目”以及“表格包裹条目”。
5. 深挖后确认，更深层差异在于执行顺序：全局可读条目/全局包裹条目在 [`updateReadableLorebookEntry_ACU()`](index.js:16079) 中，会先完成“数据库是否为空”的统一判定，再决定是否创建；而自定义导出条目此前在同一函数里更早执行 [`updateCustomTableExports_ACU()`](index.js:16469)，先于这套判空逻辑运行，所以即使后续全局条目判定为空不注入，自定义导出仍可能已经被创建。
6. 现在已把“数据库是否为空”的统一判定前移到 [`updateReadableLorebookEntry_ACU()`](index.js:16133) 开头，并让 [`updateCustomTableExports_ACU()`](index.js:16469) 与全局条目共用同一判定结果：
   - 空数据库时只清理旧的自定义导出条目；
   - 非空数据库时才创建新的自定义导出条目。
7. 这样修复后，行为与全局条目/全局包裹条目保持一致，不再依赖开场白阶段的一刀切总开关。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`updateReadableLorebookEntry_ACU()`](index.js:16079) | 约16133-16177 | 将“数据库是否为空”的统一判定前移，并让自定义导出条目与全局条目共用同一判定结果 |
| [`updateReadableLorebookEntry_ACU()`](index.js:16079) | 约16213-16216 | 补充说明：修复点在于消除“全局条目已判空、自定义导出已提前创建”的执行顺序差异 |
| [`updateCustomTableExports_ACU()`](index.js:16469) | 约16721-16743 | 新增有效数据行过滤，仅在存在真实非空表格数据或有效索引数据时才继续创建自定义导出条目 |

---

## 2026-03-25 更新

### 条件模板 cell 精确匹配改为“任意列定位行标识后再读取目标列”，并保留整体行列交换

#### 功能描述
1. 条件模板中的三段式 `cell="表格名/行标识/列名 比较值"` 现已改为更稳健的行定位逻辑：不再要求“行标识”必须出现在第一列。
2. 现在会先在目标表的**任意列**中查找与“行标识”完全相等的单元格；找到后，以该单元格所在整行作为目标行。
3. 定位到目标行后，再根据表头匹配“列名”，读取该列单元格并执行比较。
4. 仍然保留整体行列交换兼容：如果 `表格/行标识/列名` 未命中，会再尝试一次 `表格/列名/行标识`，但交换后的尝试也同样遵循“先任意列定位行，再读取目标列”的规则。
5. 这样既避免了名称不在第一列时无法命中的问题，也避免了只命中单侧名称就误判成功的问题。
6. 两段式 `cell="表格名/名称 比较值"` 的模糊匹配逻辑不受本次修改影响。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`getCellValue_ACU()`](index.js:10577) | 约10572-10629 | 行定位逻辑改为：在目标表任意列中查找“行标识”，命中后再读取指定列 |
| [`evaluateCellExpression_ACU()`](index.js:10703) | 约10694-10701 | 更新三段式 `cell` 精确匹配规则说明，明确改为“任意列定位行标识 + 目标列读取” |
| [`evaluateCellExpression_ACU()`](index.js:10765) | 约10765-10783 | 三段式 `cell` 匹配逻辑保留整体行列交换，但正序/交换后都走新的行定位规则 |

---

### 条件模板 seed 关键词解析来源改为“最新一层推进 + 最新一层 AI 回复正文”

#### 功能描述
1. 条件模板中的 `seed:` 关键词匹配，不再从数据库表格内容和旧的组合检测文本中取值。
2. 现在统一改为从最新一条 AI 回复正文与最新一层推进数据中进行关键词检索。
3. 新增 [`getLatestAIMessageContent_ACU()`](index.js:11430)，用于稳定读取最新一条 AI 消息的 `mes` 正文，作为 seed 检测主来源。
4. [`evaluateSeedExpression_ACU()`](index.js:10348) 的说明与语义已同步更新，明确匹配源为“最新一层 AI 回复正文 + 最新一层推进数据”。
5. 该变更已覆盖正文优化、酒馆提示词模板、剧情推进、填表条件模板等所有使用条件模板的场景。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| [`evaluateSeedExpression_ACU()`](index.js:10348) | 约10343-10359 | 更新 seed 关键词匹配的数据来源说明，匹配源改为最新 AI 回复正文与最新推进数据 |
| [`getLatestAIMessageContent_ACU()`](index.js:11430) | 约11426-11444 | 新增：获取最新一条 AI 回复正文，作为条件模板 seed 检测主来源 |
| 正文优化条件模板上下文 | 约2181-2189 | seed 来源改为 [`getLatestAIMessageContent_ACU()`](index.js:11430) + [`getPlotFromHistory_ACU()`](index.js:11955) |
| 酒馆提示词模板上下文 | 约11467-11475 | seed 来源改为最新 AI 回复正文，推进来源保留为最新一层推进数据 |
| 剧情推进条件模板上下文 | 约12535-12569 | 移除表格内容作为 seed 检测来源，改为最新 AI 回复正文，并通过 `plotContent` 传入最新推进数据 |
| 填表条件模板上下文 | 约24618-24626 | seed 来源改为最新 AI 回复正文，同时传入最新推进数据 |

---

### JSON 解析失败改为进入重试流程，并增强脏数据容错

#### 功能描述
1. 当正文优化 API 返回内容可以请求成功，但在 [`parseOptimizationResponse_ACU()`](index.js:2251) 阶段发生 JSON 解析失败时，不再直接判定本轮优化失败。
2. 现在会把“解析失败”视为一种可重试错误，按与 API 请求失败相同的重试上限进入重新请求流程。
3. 每次解析失败后会记录失败次数、等待指数退避时间，然后重新请求优化结果，再重新解析。
4. 同时增强了解析前清洗逻辑：优先提取平衡的 JSON 对象、移除代码块包裹、清洗智能引号、去除尾随逗号，并对优化项字段进行标准化。
5. 为了避免界面中“修改方案”大量显示“未说明”，标准化阶段现在会自动回退读取 `plan / reason / strategy / description / note` 等同义字段，并统一映射为 `plan`。
6. 还强化了正文优化默认提示词，明确要求模型只返回可被 [`JSON.parse()`](index.js:2570) 直接解析的单个 JSON 对象，减少响应被污染的概率。

#### 修改位置

| 函数 / 配置 | 行号区间 | 说明 |
|------|------|------|
| `DEFAULT_CONTENT_OPTIMIZATION_PROMPT_GROUP_ACU` | 约1918-1924 | 强化输出约束，要求只返回单个合法 JSON 对象 |
| `performContentOptimization_ACU()` | 约2162-2288 | 将“解析/应用失败”改为进入重试循环，且解析失败后的重新请求改为复用 [`AutoCardUpdaterAPI.callAI()`](index.js:2202) |
| `parseOptimizationResponse_ACU()` | 约2326-2520 | 新增平衡 JSON 提取、脏数据清洗、优化项标准化，以及标准解析失败后的容错恢复提取 |

---

### 重新优化按钮改为基于“最近一次被替换的AI回复”工作

#### 功能描述
1. 正文替换设置界面的快捷按钮不再对“最近一条 AI 消息”操作，而是定位“最近一次真正执行过正文替换的 AI 回复”。
2. 重新优化时会读取该条消息在首次替换前保存的原文，再重新优化并替换，避免拿已经被改写过的正文继续二次叠加优化。
3. 新增运行时缓存 [`lastOptimizedMessageMeta_ACU`](index.js:2561)，在正文优化刚完成时即记录最近一次成功替换目标，避免刚优化完但 chat 元数据尚未同步时找不到目标消息。
4. 设置界面的快捷操作按钮改为更紧凑的单按钮布局，避免中文文案过长时被挤成竖排。
5. 取消正文优化入口保留在进行中提示框/遮罩中，不再放在正文替换设置界面里。
6. 取消正文优化时只终止正文优化，不会连带取消并行填表。

#### 修改位置

| 函数 / UI | 行号区间 | 说明 |
|------|------|------|
| `setLastOptimizationBase_ACU()` | 约2563-2592 | 新增：将最近一次正文优化基础文本写入浏览器侧缓存（内存 + `window` + `localStorage`） |
| `getLastOptimizationBase_ACU()` | 约2594-2622 | 新增：优先从浏览器侧缓存读取最近一次正文优化基础文本 |
| `replaceChatMessage_ACU()` | 约2692-2769 | 每次成功替换时同步刷新最近一次正文优化基础文本缓存，并保留消息级 `extra` 兜底信息 |
| `getOriginalContent_ACU()` | 约2835-2855 | 重新优化时优先读取浏览器侧缓存中的基础文本 |
| `getLastOptimizedMessageIndex_ACU()` | 约2862-2901 | 优先根据浏览器侧缓存定位最近一次正文优化对应的 AI 消息 |
| `executeContentOptimization_ACU()` | 约3047-3190 | 每次新的正文优化开始前先覆盖最近一次基础文本缓存 |
| 正文替换设置界面快捷操作区 | 约20451-20460 | 改为单按钮横向紧凑样式，按钮文案简化为“重新优化上一次替换结果” |
| 快捷操作说明文案 | 约20461 | 明确取消操作应在进行中提示框中完成 |
| 快捷操作按钮事件绑定 | 约22349-22365 | 重新优化时改为读取最近一次正文优化目标，而不是最近一条 AI 消息 |
| `showOptimizationOverlay_ACU()` | 约2588-2645 | 遮罩内保留“取消优化”按钮 |
| `showOptimizationProgressToast_ACU()` | 约2651-2665 | 顶部进行中提示框保留“取消优化”按钮 |

#### 外部调用示例
- `window.AutoCardUpdaterAPI.reoptimizeMessage(消息索引)`：对指定 AI 消息重新优化。
- `window.AutoCardUpdaterAPI.cancelContentOptimization('自定义提示')`：终止当前正文优化流程。

---

### 正文优化新增"重新优化"功能

#### 功能描述
在正文优化对话框中新增"🔄 重新优化"按钮，用户可以点击该按钮对原始内容重新进行优化。

#### 使用场景
- 用户对当前优化结果不满意，希望重新生成
- 用户想要尝试不同的优化风格
- 用户想要多次优化以获得最佳结果

#### 功能特点
1. **保留原始内容**：首次优化时，系统会自动保存原始内容到消息的 `extra._acu_original_content` 字段
2. **多次重新优化**：点击"重新优化"按钮会使用保存的原始内容重新调用优化 API
3. **独立对话框**：重新优化会显示独立的对话框，包含"取消"、"再次优化"、"应用优化"三个按钮

#### 修改位置

| 函数 | 行号 | 说明 |
|------|------|------|
| `replaceChatMessage_ACU()` | 约2620 | 修改函数签名，添加保存原始内容到 extra 字段的逻辑 |
| `getOriginalContent_ACU()` | 约2685 | 新增函数，获取消息的原始内容 |
| `reoptimizeMessage_ACU()` | 约2698 | 新增函数，执行重新优化逻辑 |
| `showReoptimizationDialog_ACU()` | 约2760 | 新增函数，显示重新优化对话框 |
| `showOptimizationDiffDialogForLoop_ACU()` | 约3201 | 添加"重新优化"按钮和事件绑定 |
| `showOptimizationDiffDialog_ACU()` | 约3363 | 添加"重新优化"按钮和事件绑定 |

#### UI 变化
优化对话框现在包含以下按钮：
- **取消优化**：取消当前优化，不应用任何更改
- **跳过本轮**：（仅多轮优化时显示）跳过当前轮次，继续下一轮
- **🔄 重新优化**：使用原始内容重新进行优化
- **应用并完成** / **应用优化**：应用当前优化结果

---

### 正文替换渲染问题修复

#### 问题描述
用户反馈正文替换后，替换的内容不能及时渲染，需要手动刷新才能看到替换后的内容。

#### 问题原因
`replaceChatMessage_ACU` 函数直接修改 `chat[messageIndex].mes` 并手动触发 `MESSAGE_UPDATED` 事件，但这种方式可能不会触发酒馆的完整重新渲染流程。

#### 解决方案
使用酒馆提供的 `setChatMessages` API 来更新消息内容。该 API 会自动处理渲染，确保替换内容能够及时显示。

#### 技术细节
- `setChatMessages` API 的 `refresh` 参数：
  - `'affected'`（默认）：仅更新被影响楼层的显示，会发送渲染事件
  - `'all'`：重新载入整个聊天消息
  - `'none'`：不更新页面的显示

#### 修改位置

| 函数 | 行号 | 说明 |
|------|------|------|
| `replaceChatMessage_ACU()` | 约2620 | 使用 setChatMessages API 替代直接修改 chat 数组 |

#### 降级兼容
如果 `setChatMessages` API 不可用，会自动降级到原有的直接修改 + 触发事件的方式，确保向后兼容。

---

## 2026-03-24 更新

### 条件模板支持全角运算符

#### 问题描述
用户反馈条件模板 `<if cell="状态表/主角/魔力值 > 30">` 无法触发，日志显示"未找到有效的比较运算符"。

#### 问题原因
用户使用的是**全角运算符 `＞`**，而代码只支持半角运算符 `>`。

#### 解决方案
新增 `normalizeOperators_ACU()` 函数，自动将全角运算符转换为半角运算符。

#### 支持的全角运算符

| 全角符号 | 半角符号 | 说明 |
|----------|----------|------|
| `＞` | `>` | 大于 |
| `＜` | `<` | 小于 |
| `＝` | `==` | 等于 |
| `≥` | `>=` | 大于等于 |
| `≦` / `≤` | `<=` | 小于等于 |
| `≠` | `!=` | 不等于 |

#### 使用示例

现在以下两种写法都可以正常工作：

```
<!-- 半角运算符（推荐） -->
<if cell="状态表/主角/魔力值 > 30">
  你有足够的魔力。
</if>

<!-- 全角运算符（也支持） -->
<if cell="状态表/主角/魔力值 ＞ 30">
  你有足够的魔力。
</if>
```

#### 修改位置

| 函数 | 行号 | 说明 |
|------|------|------|
| `normalizeOperators_ACU()` | 约9680 | 新增运算符规范化函数 |
| `evaluateCellExpression_ACU()` | 约9746 | 使用规范化函数 |
| `evaluateCalcCondition_ACU()` | 约9995 | 使用规范化函数 |
| `evaluateMaxCondition_ACU()` | 约10048 | 使用规范化函数 |
| `evaluateMinCondition_ACU()` | 约10096 | 使用规范化函数 |
| `evaluateRandomExpression_ACU()` | 约10148 | 使用规范化函数 |

---

### 正文优化支持条件模板

#### 功能描述
正文优化功能现在支持条件模板语法，可以在正文优化的提示词中使用随机数、计算变量和条件判断。

#### 支持的语法

正文优化的提示词现在支持以下功能：

| 功能 | 语法 | 示例 |
|------|------|------|
| 随机数 | `<random min="1" max="100" />` | 生成1-100的随机数 |
| 随机数变量 | `<random id="dice" min="1" max="6" />` | 生成并存储随机数变量 |
| 计算变量 | `<calc id="差额" expr="cell:A - cell:B" />` | 四则运算 |
| 最大值 | `<max id="最大" values="cell:A, cell:B" />` | 取最大值 |
| 最小值 | `<min id="最小" values="cell:A, cell:B" />` | 取最小值 |
| 条件判断 | `<if cond="条件">内容</if>` | 条件模板 |

#### 使用示例

```
<!-- 在正文优化提示词中使用条件模板 -->
<random id="style" min="1" max="3" />

<if cond="random:style == 1">
  请使用简洁明快的风格进行优化。
<else>
  <if cond="random:style == 2">
    请使用细腻描写的风格进行优化。
  <else>
    请使用戏剧化的风格进行优化。
  </if>
</if>

<!-- 根据表格数据调整优化策略 -->
<calc id="好感度" expr="cell:关系表/主角/好感度" />
<if cond="calc:好感度 > 50">
  注意保持角色之间的亲密互动。
</if>
```

#### 修改位置

| 函数 | 行号 | 说明 |
|------|------|------|
| `performContentOptimization_ACU()` | 约2075 | 添加条件模板解析步骤 |

---

### 计算变量功能

#### 功能描述
新增计算变量、最大值变量、最小值变量功能，支持对表格数值进行四则运算和多值比较。

#### 新增语法

**1. 计算变量（calc）**
```
<!-- 定义计算变量 -->
<calc id="好感差额" expr="cell:关系表/陈默/好感度 - cell:关系表/李明/好感度" />

<!-- 在文本中引用 -->
好感度差额：$calc:好感差额

<!-- 在条件中使用 -->
<if cond="calc:好感差额 > 20">
  你对陈默的好感远超李明。
</if>

<!-- 复杂运算 -->
<calc id="总资产" expr="cell:资产表/主角/现金 + cell:资产表/主角/存款 + cell:资产表/主角/股票" />
<calc id="综合评分" expr="(cell:属性表/主角/力量 * 2 + cell:属性表/主角/敏捷 * 3) / 5" />
```

**2. 最大值变量（max）**
```
<!-- 取多个值中的最大值 -->
<max id="最高好感" values="cell:关系表/陈默/好感度, cell:关系表/李明/好感度, cell:关系表/王芳/好感度" />

<!-- 在文本中引用 -->
最高好感度：$max:最高好感

<!-- 在条件中使用 -->
<if cond="max:最高好感 > 80">
  有人对你非常有好感！
</if>
```

**3. 最小值变量（min）**
```
<!-- 取多个值中的最小值 -->
<min id="最低属性" values="cell:属性表/主角/力量, cell:属性表/主角/敏捷, cell:属性表/主角/智力" />

<!-- 在文本中引用 -->
最低属性值：$min:最低属性

<!-- 在条件中使用 -->
<if cond="min:最低属性 < 10">
  你有一项属性过低，需要加强训练。
</if>
```

#### 表达式支持

**calc 表达式支持的运算符：**
| 运算符 | 说明 | 示例 |
|--------|------|------|
| `+` | 加法 | `cell:A + cell:B` |
| `-` | 减法 | `cell:A - cell:B` |
| `*` | 乘法 | `cell:A * 2` |
| `/` | 除法 | `cell:A / 10` |
| `%` | 取模 | `cell:A % 100` |
| `()` | 括号 | `(cell:A + cell:B) * 2` |

**values 支持的引用：**
| 引用方式 | 说明 |
|----------|------|
| `cell:表名/行名/列名` | 表格单元格数值 |
| `$random:id` | 随机数变量 |
| `$calc:id` | 计算变量 |
| `$max:id` | 最大值变量 |
| `$min:id` | 最小值变量 |

#### 失效处理

当变量定义失败时（如引用的单元格不存在），该变量不定义，引用该变量的条件块整体屏蔽，AI 不会看到该内容。

```
<!-- 如果"李明"行不存在，好感差额变量失效 -->
<calc id="好感差额" expr="cell:关系表/陈默/好感度 - cell:关系表/李明/好感度" />

<!-- 这个条件块会被整体屏蔽 -->
<if cond="calc:好感差额 > 20">
  这段内容 AI 看不到。
</if>
```

#### 使用示例

```
<!-- 完整的属性比较系统 -->
<calc id="力量差额" expr="cell:属性表/主角/力量 - cell:属性表/敌人/力量" />
<max id="最高属性" values="cell:属性表/主角/力量, cell:属性表/主角/敏捷, cell:属性表/主角/智力" />
<min id="最低属性" values="cell:属性表/主角/力量, cell:属性表/主角/敏捷, cell:属性表/主角/智力" />

📊 **属性分析**
- 力量差额：$calc:力量差额
- 最高属性：$max:最高属性
- 最低属性：$min:最低属性

<if cond="calc:力量差额 > 10">
  你的力量远超敌人，可以轻松压制。
<else>
  <if cond="calc:力量差额 > 0">
    你的力量略胜一筹。
  <else>
    你的力量不如敌人，需要智取。
  </if>
</if>

<if cond="max:最高属性 - min:最低属性 > 20">
  你的属性发展不均衡，建议补齐短板。
</if>
```

#### 处理顺序

提示词处理的完整顺序：
1. **EJS 渲染**（st-prompt-template）
2. **占位符替换**（$变量）
3. **随机数生成**（`<random>` 标签，存储变量）
4. **随机数变量替换**（`$random:id` 引用）
5. **计算变量解析**（`<calc>` 标签）
6. **最大值变量解析**（`<max>` 标签）
7. **最小值变量解析**（`<min>` 标签）
8. **变量引用替换**（`$calc:id`、`$max:id`、`$min:id`）
9. **条件模板解析**（`<if>` 标签）

#### 修改位置

| 函数 | 行号 | 说明 |
|------|------|------|
| `calcVariables_ACU` | 约8898 | 计算变量存储 |
| `maxVariables_ACU` | 约8901 | 最大值变量存储 |
| `minVariables_ACU` | 约8904 | 最小值变量存储 |
| `parseCalcExpressionValue_ACU()` | 约9020 | 解析表达式中的变量引用 |
| `evaluateCalcExpression_ACU()` | 约9100 | 计算表达式 |
| `parseCalcTags_ACU()` | 约9170 | 解析计算变量标签 |
| `parseMaxTags_ACU()` | 约9220 | 解析最大值变量标签 |
| `parseMinTags_ACU()` | 约9280 | 解析最小值变量标签 |
| `replaceCalcVariables_ACU()` | 约9340 | 替换计算变量引用 |
| `replaceMaxVariables_ACU()` | 约9360 | 替换最大值变量引用 |
| `replaceMinVariables_ACU()` | 约9380 | 替换最小值变量引用 |
| `getCalcVariable_ACU()` | 约9400 | 获取计算变量值 |
| `getMaxVariable_ACU()` | 约9410 | 获取最大值变量值 |
| `getMinVariable_ACU()` | 约9420 | 获取最小值变量值 |
| `evaluateSubCondition_ACU()` | 约9885 | 支持 calc:、max:、min: 前缀 |
| `evaluateCalcCondition_ACU()` | 约9960 | 解析计算变量条件 |
| `evaluateMaxCondition_ACU()` | 约10010 | 解析最大值变量条件 |
| `evaluateMinCondition_ACU()` | 约10060 | 解析最小值变量条件 |
| 处理流程 | 约11660 | 添加变量解析和替换步骤 |

---

## 2026-03-23 更新

### 随机数功能增强

#### 功能描述
增强随机数功能，支持随机数变量存储和内联随机条件判断。

#### 新增语法

**1. 随机数变量（id 属性）**
```
<!-- 生成随机数并存储为变量 -->
<random id="dice" min="1" max="6" />
<random id="event" min="1" max="100" />

<!-- 在文本中引用随机数变量 -->
🎲 骰子结果：$random:dice
📊 事件随机数：$random:event

<!-- 在条件中引用随机数变量 -->
<if cond="random:dice > 4">
  骰子点数大于4，触发特殊事件！
</if>
```

**2. 内联随机条件**
```
<!-- 直接在条件中生成随机数并判断 -->
<if cond="random:1-100 <= 10">
  ⚠️ 触发重大意外事件！
</if>

<!-- 与其他条件组合 -->
<if cond="seed:战斗 & random:1-6 > 3">
  战斗中，骰子点数大于3，攻击成功！
</if>
```

#### 条件表达式语法更新
| 元素 | 说明 | 示例 |
|------|------|------|
| `random:id` | 引用随机数变量 | `random:dice > 3` |
| `random:min-max` | 内联随机数 | `random:1-100 <= 10` |

#### 使用示例
```
<!-- 完整的随机事件系统 -->
<random id="event" min="1" max="100" />

🎲 **本轮随机数**：$random:event

<if cond="random:event <= 10">
  ⚠️ 触发重大意外事件（如敌人突袭、自然灾害）
<else>
  <if cond="random:event <= 30">
    📊 触发小波折（如物品损坏、NPC拒绝）
  <else>
    <if cond="random:event >= 90">
      🌟 触发重大机遇（如意外收获、关键线索）
    <else>
      ✨ 平稳推进，无特殊事件
    </if>
  </if>
</if>

<!-- 战斗骰子判定 -->
<random id="attack" min="1" max="20" />
<random id="damage" min="1" max="6" />

⚔️ 攻击检定：$random:attack
💥 伤害骰：$random:damage

<if cond="random:attack >= 15">
  命中！造成 $random:damage 点伤害。
<else>
  攻击未命中。
</if>
```

#### 处理顺序
提示词处理的完整顺序：
1. **EJS 渲染**（st-prompt-template）
2. **占位符替换**（$变量）
3. **随机数生成**（`<random>` 标签，存储变量）
4. **随机数变量替换**（`$random:id` 引用）
5. **条件模板解析**（`<if>` 标签，支持 `random:` 条件）

#### 修改位置
- **修改函数**：[`parseRandomTags_ACU()`](index.js:8907) - 支持 id 属性存储随机数变量
- **新增函数**：[`replaceRandomVariables_ACU()`](index.js:8965) - 替换随机数变量引用
- **新增函数**：[`getRandomVariable_ACU()`](index.js:8980) - 获取随机数变量值
- **新增函数**：[`evaluateRandomExpression_ACU()`](index.js:9520) - 解析随机数条件表达式
- **修改函数**：[`evaluateSubCondition_ACU()`](index.js:9454) - 支持 random: 前缀
- **修改位置**：[`index.js:11056-11060`](index.js:11056) - 添加随机数变量替换步骤

---

### 条件模板新增统一条件表达式（cond属性）

#### 功能描述
新增 `<if cond="条件表达式">` 语法，支持多条件组合和括号分组，解决之前需要嵌套多个 `<if>` 标签才能实现的多条件判断问题。

#### 新增语法
```
<if cond="条件表达式">
  条件满足时显示的内容
<else>
  条件不满足时显示的内容
</if>
```

#### 条件表达式语法
| 元素 | 说明 | 示例 |
|------|------|------|
| `seed:关键词` | 关键词匹配 | `seed:战斗` |
| `cell:表格条件` | 表格数值比较 | `cell:状态表/主角/魔力值 > 30` |
| `random:随机条件` | 随机数条件 | `random:dice > 3` |
| `&` | AND（与） | `seed:战斗 & cell:魔力 > 30` |
| `,` | OR（或） | `seed:战斗 , seed:休息` |
| `()` | 括号分组 | `(seed:战斗 & cell:魔力 > 30) , cell:好感度 > 80` |
| `!` | 取反 | `!seed:安全` |

#### 运算优先级
1. 括号 `()` - 最高优先级
2. `&` (AND) - 次高优先级
3. `,` (OR) - 最低优先级

#### 使用示例
```
<!-- 两个表格值共同约束 -->
<if cond="cell:关系表/陈默/好感度 > 50 & cell:资产表/陈默/财富值 > 1000">
  陈默对你有好感且富有。
</if>

<!-- seed 和 cell 混合条件 -->
<if cond="seed:战斗 & cell:状态表/主角/魔力值 > 30">
  战斗中且魔力充足。
</if>

<!-- 括号分组控制优先级 -->
<if cond="(seed:战斗 & cell:魔力 > 30) , cell:好感度 > 80">
  (战斗且魔力充足) 或 好感度很高
</if>

<!-- 取反条件 -->
<if cond="!seed:安全 & cell:生命值 <= 30">
  危险！不在安全区域且生命值很低！
</if>

<!-- 对括号表达式整体取反 -->
<if cond="!(cell:关系表/陈默/好感度 > 50 & cell:资产表/陈默/财富值 > 1000)">
  陈默对你没有好感或穷。
</if>
```

#### else 的含义
`else` 表示整个条件表达式不满足时显示的内容：
- `A & B` 的 else = 不满足A **或** 不满足B
- `A , B` 的 else = 不满足A **且** 不满足B

#### 向后兼容
原有语法保持不变，可继续使用：
- `<if seed="关键词表达式">` - 关键词匹配
- `<if cell="表格条件">` - 表格数值比较

#### 修改位置
- **新增函数**：[`evaluateSubCondition_ACU()`](index.js:9454) - 解析单个子条件（seed:、cell: 或 random:）
- **新增函数**：[`evaluateCondExpression_ACU()`](index.js:9497) - 解析统一条件表达式（支持括号分组）
- **修改函数**：[`parseConditionalTemplate_ACU()`](index.js:9600) - 支持 cond 属性
- **修改函数**：[`parseIfBlocksInContent_ACU()`](index.js:9700) - 支持 cond 属性
- **修改函数**：[`parseSingleIfBlock_ACU()`](index.js:9757) - 支持 cond 类型条件评估

---

### 表格数据发送行数控制（新功能）

#### 功能描述
在数据库编辑器的每个表的结构与参数配置中新增 `sendLatestRows` 参数，用于控制每次填表时发送给AI的最新数据行数。

#### 参数说明
- **参数名**：`sendLatestRows`（发送最新N行）
- **默认值**：-1（全部发送）
- **可选值**：
  - `-1`：全部发送（默认）
  - `0`：沿用UI全局（等同于全部发送）
  - `正数`：仅发送最新N条数据

#### 健全机制
- **纪要表/总结表**：固定使用硬编码的10条限制，不受 `sendLatestRows` 参数影响
- 这是为了保证纪要表的行为一致性，避免用户误配置导致发送过多数据

#### 修改位置
- **数据结构**：[`index.js:7044`](index.js:7044) - `updateConfig` 默认值添加 `sendLatestRows: -1`
- **数据结构**：[`index.js:7283`](index.js:7283) - 同上
- **数据结构**：[`index.js:27050`](index.js:27050) - 新建表格时的默认值
- **UI界面**：[`index.js:27451-27454`](index.js:27451) - 表格配置面板添加输入框
- **事件绑定**：[`index.js:27681`](index.js:27681) - 输入框事件绑定
- **数据发送逻辑**：[`index.js:22574-22600`](index.js:22574) - 使用新参数控制发送行数

#### 模板兼容性
- 新参数会随 `updateConfig` 一起导出/导入，与现有表格模板完全兼容

---

## 2026-03-23 更新（历史记录）

### 正文替换匹配算法优化（重要更新）

#### 1. 标点符号处理优化
**问题描述**：替换时两端标点符号容易出错，AI返回的内容标点与原文不一致。

**修复内容**：
- **移除两端标点后替换**：匹配成功后，提取原文两端的标点符号，使用原文的标点包裹优化后的内容
- **单引号智能处理**：
  - 如果后单引号在文段末尾：保留前双引号，移除后引号 → `"内容`
  - 如果不在句末：前后都变成双引号 → `"内容"`

**新增函数**：
- [`trimPunctuation_ACU()`](index.js:2408) - 移除字符串两端的标点符号
- [`processSingleQuotes_ACU()`](index.js:2435) - 智能处理单引号

**修改位置**：
- [`applyOptimizations_ACU()`](index.js:2500-2550) - 使用新的标点处理逻辑

#### 2. 换行/段落合并匹配优化
**问题描述**：原文有换行分段，但AI返回的原文可能合并成一段，导致匹配失败。

**修复内容**：
- 扩大长度差异允许范围：从±30%改为±50%
- 降低关键词匹配阈值：从50%降到40%
- `removePunctuation_ACU()` 已会去除换行符，确保换行不影响匹配

**修改位置**：
- [`findParagraphMatch_ACU()`](index.js:2321-2360) - 调整匹配参数

#### 3. 匹配算法改进（历史记录）
**问题描述**：之前的匹配算法用去标点后的长度计算位置，导致截取范围不准确。

**修复内容**：
- 改进位置查找：从开头位置向后搜索结尾，允许±30%长度差异
- 更精确的位置映射：确保不会多截或少截字符

---

### 正文替换匹配算法重构（历史记录）
**问题描述**：之前的匹配算法使用Levenshtein相似度计算，复杂度高且匹配效果不稳定。

**新匹配算法**：采用"去标点+首尾+关键词"匹配策略：
1. **去除标点符号**：只保留中文、英文、数字，去除所有标点和空白
2. **首尾匹配**：动态计算匹配长度（最小3字符，最大10字符，不超过段落长度1/4）
3. **关键词匹配**：从原文提取5个关键词，检查候选段落是否包含至少50%的关键词
4. **位置映射**：将去标点后的位置映射回原始文本位置

**新增函数**：
- [`removePunctuation_ACU()`](index.js:2253) - 去除标点符号
- [`extractKeywords_ACU()`](index.js:2263) - 提取关键词
- [`findParagraphMatch_ACU()`](index.js:2280) - 段落匹配主函数
- [`mapCleanPositionToOriginal_ACU()`](index.js:2335) - 位置映射

**修改位置**：
- [`applyOptimizations_ACU()`](index.js:2360-2400) - 使用新匹配算法

---

### 正文替换匹配失败修复（历史记录）
**问题描述**：用户反馈点击应用后部分替换没有应用上，修复后甚至一个都应用不上。

**问题原因**：
1. 原代码使用 `indexOf` 精确匹配，如果AI返回的 `original` 与实际正文有细微差异，就会导致替换失败
2. **第一次修复引入的BUG**：策略1（精确匹配）成功时，只设置了 `index` 变量，但没有执行实际的替换操作！

**修复内容**：
1. **修复精确匹配不执行替换的BUG**：使用 `replaced` 布尔变量跟踪替换状态，确保每个策略成功时都执行实际替换
2. **多策略匹配**：
   - 策略1：精确匹配
   - 策略2：去除首尾空白后匹配
   - 策略3：模糊匹配（相似度>85%）
3. **日志记录**：记录每个优化项的匹配结果和替换统计

**修改位置**：
- [`applyOptimizations_ACU()`](index.js:2253-2330) - 修复替换逻辑

---

## 2026-03-22 更新

### 1. 手机端按钮显示优化
**问题描述**：正文优化对比对话框底部的按钮在手机端会超出屏幕且无法点击。

**修复内容**：
- 修改按钮容器样式，添加 `flex-wrap: wrap` 和 `padding-bottom: 10px`
- 为每个按钮添加 `min-width` 和 `flex-shrink: 0`，确保按钮不会被压缩
- 增大按钮内边距从 `8px 16px` 改为 `10px 16px`，提升触控体验

**修改位置**：
- [`showOptimizationDiffDialogForLoop_ACU()`](index.js:2703-2731) - 循环优化对话框按钮样式
- [`showOptimizationDiffDialog_ACU()`](index.js:2825-2844) - 普通优化对话框按钮样式

---

### 2. JSON结构调整：reason → plan
**问题描述**：正文优化返回的JSON结构中，`reason` 字段名称不够直观，且位置在最后，不符合用户阅读习惯。

**修改内容**：
1. **字段重命名**：将 `reason`（原因）改为 `plan`（修改方案）
2. **字段顺序调整**：`original` → `plan` → `optimized`
3. **显示样式优化**：`plan` 字段添加浅蓝色背景高亮显示

**新的JSON格式**：
```json
{
  "optimizations": [
    {
      "type": "replace",
      "original": "原文中需要优化的句子或段落",
      "plan": "修改方案说明",
      "optimized": "优化后的句子或段落"
    }
  ],
  "summary": "本次优化的总体说明"
}
```

**修改位置**：
- 默认提示词模板 [`index.js:1919-1921`](index.js:1919) - 更新JSON格式说明
- 对话框显示 [`index.js:2697-2698`](index.js:2697) - 支持新字段显示
- 对话框显示 [`index.js:2816-2817`](index.js:2816) - 支持新字段显示
- 日志输出 [`index.js:20968-20969`](index.js:20968) - 支持新字段显示

**向后兼容**：
- 显示代码使用 `opt.plan || opt.reason || '未说明'`，确保同时支持新旧格式
- 核心替换逻辑 `applyOptimizations_ACU()` 只依赖 `original` 和 `optimized` 字段，不受影响

---

## 2026-03-21 更新

### 1. 正文优化MAX Token参数修复
**问题描述**：正文替换功能切换使用API配置的预设时，没有使用对应的MAX Token参数。

**修复内容**：移除硬编码的 `max_tokens: 4000`，让 `callAI()` 使用预设配置中的值。

**修改位置**：[`performContentOptimization_ACU()`](index.js:2057-2195)

---

### 2. 剧情推进占位符支持
**新增功能**：正文优化支持以下占位符：
- `$1` - 世界书内容
- `$5` - 纪要表数据
- `$6` - 上轮规划
- `$7` - 前文上下文
- `$8` - 用户输入
- `$U` - 用户设定
- `$C` - 角色描述

**修改位置**：
- 新增 [`getOptimizationPlaceholders_ACU()`](index.js:2000) 函数
- 修改 [`performContentOptimization_ACU()`](index.js:2057) 调用占位符替换

---

### 3. 循环优化功能
**新增功能**：支持多轮循环优化，每轮使用上一轮优化后的内容作为输入。

**新增设置**：
- `loopCount` - 循环优化次数（默认1次，范围1-10次）

**修改位置**：
- 设置结构 [`index.js:3130-3135`](index.js:3130)
- 核心逻辑 [`executeContentOptimization_ACU()`](index.js:2368-2534)
- UI输入框 [`index.js:18459-18468`](index.js:18459)

---

### 4. 自动重试功能
**新增功能**：正文优化API调用失败时自动重试，采用指数退避策略。

**新增设置**：
- `retryCount` - 自动重试次数（默认3次，范围1-10次）

**重试策略**：指数退避（1秒、2秒、4秒...，最大10秒）

**修改位置**：
- 设置结构 [`index.js:3134`](index.js:3134)
- 核心逻辑 [`performContentOptimization_ACU()`](index.js:2057)
- UI输入框 [`index.js:18464-18468`](index.js:18464)

---

### 5. 循环优化与对比显示冲突修复
**问题描述**：设置循环优化次数后，关闭"自动应用优化结果"时，所有轮次执行完才显示对比对话框。

**修复内容**：区分自动应用模式和手动确认模式：
- **自动应用模式**：所有循环完成后统一应用
- **手动确认模式**：每轮优化后都显示对比对话框，支持用户逐轮确认

**新增函数**：
- [`executeContentOptimizationWithConfirm_ACU()`](index.js:2536) - 逐轮确认逻辑
- [`showOptimizationDiffDialogForLoop_ACU()`](index.js:2657) - 支持循环优化的对话框

**操作选项**：
- "应用并继续"：应用本轮优化，继续下一轮
- "跳过本轮"：跳过本轮优化，继续下一轮
- "取消优化"：结束优化流程

---

### 6. 手机页面对话框显示优化
**问题描述**：对话框使用 `top: 50%; transform: translate(-50%, -50%)` 居中时，内容过高会导致顶部超出屏幕。

**修复内容**：
- 将 `top: 50%` 改为 `top: 10px`
- 将 `transform: translate(-50%, -50%)` 改为 `transform: translateX(-50%)`
- 添加 `width: calc(100% - 20px)` 确保手机上有边距
- 调整 `max-height` 确保不超出屏幕底部

**修改位置**：
- [`showOptimizationDiffDialogForLoop_ACU()`](index.js:2661-2679)
- [`showOptimizationDiffDialog_ACU()`](index.js:2775-2796)