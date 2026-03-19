# shujuku（神·数据库）

## 触发规则（已修复"其它插件 API 调用误触发"）

为避免其它扩展/插件的后台调用（尤其是 quiet/后台生成、工具调用）误触发本脚本的逻辑，本项目对触发条件做了门控：

- **剧情推进**：仅在 **用户在酒馆界面真实发送消息** 时触发（`MESSAGE_SENT` → 紧随其后的 `GENERATION_AFTER_COMMANDS`），并且会过滤 `quiet_prompt` / `type === 'quiet'` / `automatic_trigger`。
- **自动填表更新**：仅在 **本次生成不是 quiet/后台生成** 时触发（通过 `GENERATION_STARTED` 记录上下文，在 `GENERATION_ENDED` 时过滤）。

如需调整"用户发送→生成"的容忍窗口，可在 `shujuku/index.js` 中搜索并修改 `USER_SEND_TRIGGER_TTL_MS_ACU`。

---

## 更新日志

### 2026-03-19 新对话首楼注入逻辑修复

#### 修复问题
- **新对话首楼被强制注入空模板**：修复了开启新对话后，首楼会被强制注入一个空模板的问题
- 根本原因：`initializeJsonTableInChatHistory_ACU()` 函数中错误地调用了 `seedGreetingLocalDataFromTemplate_ACU()`，导致正常新对话也会注入空模板到首楼
- 设计意图：空模板注入应该只针对通过外部插件触发的API（如 `initGameSession`），正常新对话应该只注入指导表

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 14334-14339（已删除） | 移除 `seedGreetingLocalDataFromTemplate_ACU()` 调用，保留指导表注入逻辑 |

#### 技术细节
- **保留的功能**：
  - 指导表注入（`ensureChatSheetGuideSeeded_ACU`）正常工作，会保存模板的 `seedRows` 字段
  - 外部API `initGameSession` 仍可通过 `fillFirstLayerWithTemplateData_ACU()` 注入完整模板数据
- **数据流程**：
  - 新对话时：只注入指导表（包含 seedRows），不注入空模板到首楼
  - 第二楼填表时：通过 `getEffectiveSeedRowsForSheet_ACU()` 函数的多层回退机制（当前数据 → 指导表 → 模板）正确获取种子数据
- **不影响**：模板自带的数据仍可在填表时正确使用

---

### 2026-03-15 流式传输开关修复

#### 修复问题
- **流式传输开关不生效问题**：修复了即使关闭流式传输开关，各功能仍尝试解析流式响应导致失败的问题
- 根本原因：部分代码中 `stream` 参数硬编码为 `true`，且响应处理未根据开关状态切换解析方式

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 4703-4720 | 新增 [`parseNonStreamResponse_ACU()`](index.js:4703) 函数，解析非流式JSON响应 |
| `index.js` | 4722-4731 | 新增 [`handleApiResponse_ACU()`](index.js:4722) 函数，根据开关自动选择响应解析方式 |
| `index.js` | 4582 | `callAI()` 函数 fetch 调用：`stream: true` → `stream: settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 4610 | `callAI()` 函数响应处理：`streamToText_ACU(res)` → `handleApiResponse_ACU(res)` |
| `index.js` | 4814 | `callAI()` 函数（位置2）fetch 调用：`stream: true` → `stream: settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 4842 | `callAI()` 函数（位置2）响应处理：`streamToText_ACU(res)` → `handleApiResponse_ACU(res)` |
| `index.js` | 7156 | 剧情推进功能响应处理：`streamToText_ACU(response, abortSignal)` → `handleApiResponse_ACU(response, abortSignal)` |
| `index.js` | 20368 | 自动填表功能响应处理：`streamToText_ACU(response, abortSignal)` → `handleApiResponse_ACU(response, abortSignal)` |
| `index.js` | 21385 | 自动填表功能（纪要合并）fetch 调用：`stream: true` → `stream: settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 21392 | 自动填表功能（纪要合并）响应处理：`streamToText_ACU(res)` → `handleApiResponse_ACU(res)` |
| `index.js` | 22044 | 纪要合并功能响应处理：`streamToText_ACU(res)` → `handleApiResponse_ACU(res)` |
| `index.js` | 25587 | 其他 AI 调用响应处理：`streamToText_ACU(res)` → `handleApiResponse_ACU(res)` |

#### 技术细节
- **新增函数 [`parseNonStreamResponse_ACU()`](index.js:4703)**：解析标准OpenAI格式的非流式JSON响应，提取 `choices[0].message.content`
- **新增函数 [`handleApiResponse_ACU()`](index.js:4722)**：统一响应处理入口，根据 `settings_ACU.streamingEnabled` 自动选择使用 `streamToText_ACU()` 或 `parseNonStreamResponse_ACU()`
- **修复策略**：将所有直接的 `streamToText_ACU()` 调用替换为 `handleApiResponse_ACU()`，确保响应解析方式与请求的 `stream` 参数一致

---

### 2026-03-15 流式传输开关控制

#### 新增功能
- **流式传输开关**：在API设置界面新增"启用流式传输 (Streaming)"复选框，用于控制所有AI调用功能是否使用流式传输
- 开关默认关闭，用户可根据需要开启
- 开启后可减少首字节响应时间（TTFT），避免长时间等待无响应

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 2298-2299 | 新增 `$streamingEnabledCheckbox_ACU` jQuery变量声明 |
| `index.js` | 2330-2331 | `settings_ACU` 对象：新增 `streamingEnabled: false` 默认设置 |
| `index.js` | 9672-9674 | `buildDefaultSettings_ACU()` 函数：新增 `streamingEnabled: false` 默认设置 |
| `index.js` | 16615-16620 | API设置界面：新增流式传输开关复选框UI元素 |
| `index.js` | 17305-17306 | 初始化流式传输开关jQuery对象 |
| `index.js` | 9993-9997 | `loadSettings_ACU()` 函数：加载流式传输开关状态 |
| `index.js` | 17855-17861 | 流式传输开关 change 事件监听器 |
| `index.js` | 4558 | `callAI()` 函数：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 4749 | `callAI()` 函数（位置2）：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 4886 | `callAI()` 函数（位置3）：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 4910 | `callAI()` 函数 fetch 调用：`stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 7070 | 剧情推进功能：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 7088 | 剧情推进功能 fetch 调用：`stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 20264 | 自动填表功能：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 20283 | 自动填表功能（回退）：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 20304 | 自动填表功能 fetch 调用：`stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 21337 | 纪要合并功能：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 21989 | 纪要合并功能（位置2）：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 21996 | 纪要合并功能 fetch 调用：`stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 25530 | 其他 AI 调用：`should_stream: true` → `settings_ACU.streamingEnabled \|\| false` |
| `index.js` | 25537 | 其他 AI 调用 fetch：`stream: true` → `settings_ACU.streamingEnabled \|\| false` |

#### 技术细节
- **设置存储**：`settings_ACU.streamingEnabled` 布尔值，默认为 `false`
- **UI控件**：复选框控件，位于API设置界面"使用主API"复选框下方
- **实时生效**：开关状态变更后立即保存并生效，无需重启
- **统一控制**：所有使用 `TavernHelper.generateRaw` 和 `fetch` 的AI调用均受此开关控制

---

### 2026-03-14 AI大模型流式传输支持

#### 新增功能
- **流式传输（Streaming）支持**：所有使用 AI 大模型的功能现在都支持流式传输，可以减少首字节响应时间（TTFT），避免长时间等待无响应
- 新增通用流式响应处理函数 [`streamToText_ACU()`](index.js:4518)，用于处理 SSE（Server-Sent Events）流并累积返回完整文本

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 4518-4559 | 新增 `streamToText_ACU()` 函数，处理流式响应 |
| `index.js` | 4601-4663 | `callAI()` 函数：`should_stream: false` → `true`，`stream: false` → `true`，使用流式处理 |
| `index.js` | 6777-6835 | 剧情推进功能：`should_stream: false` → `true`，`stream: false` → `true`，使用流式处理 |
| `index.js` | 19890-19958 | 自动填表功能：`should_stream: false` → `true`，`stream: false` → `true`，使用流式处理 |
| `index.js` | 20969-20985 | 纪要合并功能（位置1）：`should_stream: false` → `true`，`stream: false` → `true`，使用流式处理 |
| `index.js` | 21616-21635 | 纪要合并功能（位置2）：`should_stream: false` → `true`，`stream: false` → `true`，使用流式处理 |
| `index.js` | 25155-25180 | 其他 AI 调用：`should_stream: false` → `true`，`stream: false` → `true`，使用流式处理 |

#### 技术细节
- **TavernHelper.generateRaw 调用**：`should_stream: false` → `should_stream: true`
- **fetch API 调用**：`stream: false` → `stream: true`
- **响应处理**：使用 `streamToText_ACU()` 函数处理 SSE 流，累积所有 chunk 中的 content 并返回完整文本
- **中止信号支持**：`streamToText_ACU()` 函数支持 AbortSignal 参数，可以在需要时中止流式传输

---

### 2026-03-11 酒馆提示词模板支持$6上轮规划数据

#### 新增功能
- 酒馆提示词（正文、世界书）的条件模板 `<if seed="关键词">` 现在可以在上轮规划数据（$6）中查找关键词
- 修改内容：
  1. [`handleChatCompletionReady_ACU()`](index.js:7100) 函数：获取上轮规划数据（$6）并添加到context中
  2. [`parseConditionalTemplate_ACU()`](index.js:6847) 函数：添加 `plotContent` 参数
  3. [`evaluateSeedExpression_ACU()`](index.js:6499) 函数：添加 `plotContent` 参数，将表格内容和上轮规划数据拼接进行关键词匹配
  4. [`parseSingleIfBlock_ACU()`](index.js:7007) 函数：在评估seed条件时传入 `context.plotContent`

#### 修复内容
- 修复浏览器环境中 `global is not defined` 错误：将 `global._parenResults` 改为局部变量 `_parenResults`
- 修复位置：[`index.js:6543-6590`](index.js:6543) - `evaluateSeedExpression_ACU` 函数
- 修复酒馆提示词模板功能不生效的问题：`buildDefaultSettings_ACU()` 函数缺少 `promptTemplateSettings` 默认值
- 修复位置：[`index.js:8772-8780`](index.js:8772) - `buildDefaultSettings_ACU` 函数
- 修复 `getAllTablesJson_ACU is not defined` 错误：`getTableDataForPrompt_ACU()` 和 `getSeedContentForPrompt_ACU()` 函数参数问题
- 修复位置：[`index.js:7084-7086`](index.js:7084) - `getTableDataForPrompt_ACU` 函数、[`index.js:7093`](index.js:7093) - `getSeedContentForPrompt_ACU` 函数

---

### 2026-03-11 条件模板语法说明文档

#### 新增文档
- 创建 [`docs/条件模板语法说明.md`](docs/条件模板语法说明.md)，详细说明数据库条件模板的语法和使用方法

---

### 2026-03-11 UI开关与提示词处理优化

#### 新增功能
- **UI界面开关**：在"数据库更新"设置区域新增"启用条件模板功能"复选框，用户可在界面上直接控制条件模板功能的开启/关闭
- **提示词处理顺序优化**：数据库提示词现在先经过 st-prompt-template 插件处理，再由数据库自身的条件模板处理，实现两层模板处理的协同工作

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 2291-2293 | 新增 `$promptTemplateEnabledCheckbox_ACU` jQuery变量声明 |
| `index.js` | 15524-15527 | 新增"启用条件模板功能"复选框UI元素 |
| `index.js` | 16324-16325 | 初始化复选框jQuery对象 |
| `index.js` | 8985-8986 | 加载设置时同步复选框状态 |
| `index.js` | 17094-17106 | 新增复选框change事件监听器 |
| `index.js` | 19149-19174 | 填表提示词处理：先调用st-prompt-template（含prepareContext），再调用数据库条件模板 |

#### 执行流程
1. 用户在UI界面勾选/取消"启用条件模板功能"
2. 填表/推进提示词构建时：
   - 先调用 `globalThis.EjsTemplate.prepareContext()` 获取上下文（包含 getvar 等函数）
   - 再调用 `globalThis.EjsTemplate.evalTemplate(content, context)` 让 st-prompt-template 处理 EJS 语法
   - 最后调用 `parseIfBlocksInContent_ACU()` 处理数据库自身的 `<if>` 条件模板语法
3. 两层处理完成后，提示词发送给AI

#### Bug修复
- 修复了 st-prompt-template 调用时缺少 `prepareContext()` 导致 `getvar is not defined` 错误的问题

---

### 2026-03-11 酒馆提示词模板功能

#### 新增功能
- **酒馆提示词模板**：数据库插件现在可以独立处理酒馆提示词中的条件模板语法
- **支持 else 分支**：条件不满足时显示备选内容
- **支持嵌套条件**：在条件内部再嵌套另一个条件判断
- **设置总开关**：可通过 `promptTemplateSettings.enabled` 控制功能开启/关闭

#### 执行机制
- 监听 `CHAT_COMPLETION_SETTINGS_READY` 事件
- 使用 `eventSource.makeLast()` 确保在 st-prompt-template 插件之后执行
- 处理 `data.messages` 数组中的所有消息内容

#### 语法格式

**基本语法**
```
<if seed="关键词表达式">条件内容</if>
<if cell="表格名/行名/列名 > 数值">条件内容</if>
```

**带 else 的语法**
```
<if seed="战斗">
战斗场景内容
<else>
非战斗场景内容
</if>
```

**嵌套语法**
```
<if seed="战斗">
  <if cell="状态表/主角/魔力值 > 30">
    有足够魔力施放高级魔法。
  <else>
    魔力不足，只能使用普通攻击。
  </if>
<else>
  <if seed="对话">
    可以进行和平对话。
  </if>
</if>
```

#### 作用范围
- 角色卡描述（Character Description）
- 角色卡场景（Scenario）
- 世界书条目（World Info Entries）
- 预设提示词（Preset Prompts）
- 消息内容（Messages）

#### 兼容性说明
- 与 st-prompt-template 插件共存
- 条件模板语法 `<if ...>` 与 EJS 语法 `<% ... %>` 不冲突
- 执行顺序：SillyTavern 构建提示词 → st-prompt-template 处理 → 数据库插件处理 → 发送给 LLM

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 2385-2391 | 新增 `promptTemplateSettings` 设置选项 |
| `index.js` | 6903-7143 | 新增 `parseIfBlockRecursive_ACU()` 等条件模板解析函数（支持 else 和嵌套） |
| `index.js` | 13094-13113 | 新增 `CHAT_COMPLETION_SETTINGS_READY` 事件监听 |

---

### 2026-03-11 剧情推进条件模板功能

#### 新增功能
- **条件模板语法**：为剧情推进提示词新增条件模板功能，支持两种条件判断方式：
  1. **关键词匹配**：根据内容中是否包含关键词来决定是否包含提示词
  2. **表格数值比较**：根据表格中指定单元格的数值比较结果来决定是否包含提示词

#### 语法格式

**1. 关键词匹配**
```
<if seed="关键词表达式">条件提示词内容</if>
```

**2. 表格数值比较**
```
<if cell="表格名/行名/列名 比较运算符 数值">条件提示词内容</if>
```

#### 关键词匹配 - 支持的逻辑类型

| 语法 | 逻辑类型 | 说明 |
|------|---------|------|
| `战斗` | 简单匹配 | 检测内容包含"战斗"即生效 |
| `战斗,打架` | 或逻辑（OR） | 包含"战斗"或"打架"任一即生效 |
| `战斗&主角` | 与逻辑（AND） | 同时包含"战斗"和"主角"才生效 |
| `!战斗` | 非逻辑（NOT） | 不包含"战斗"时才生效 |
| `(战斗&主角),感情` | 组合逻辑 | 同时包含"战斗"和"主角"，或者包含"感情" |

#### 表格数值比较 - 支持的格式

| 格式 | 说明 | 示例 |
|------|------|------|
| 精确匹配 | `表格名/行名/列名` | `重要人物表/威尔逊/好感度 > 50` |
| 模糊匹配（行） | `表格名/行名` - 检查该行所有数值列 | `重要人物表/威尔逊 > 50` |
| 模糊匹配（列） | `表格名/列名` - 检查该列所有数值行 | `重要人物表/好感度 > 50` |

**特性说明：**
- **模糊匹配**：只需指定表格名和行名（或列名），会自动检查该行/列的所有数值
- **行列颠倒**：精确匹配时，如果行名和列名写反了，会自动尝试颠倒匹配
- **任一匹配即生效**：模糊匹配时，只要有一个数值满足条件就生效

#### 表格数值比较 - 支持的比较运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `>` | 大于 | `重要人物表/威尔逊/好感度 > 50` |
| `<` | 小于 | `重要人物表/威尔逊/好感度 < 30` |
| `>=` | 大于等于 | `全局数据表/当前状态/危险等级 >= 3` |
| `<=` | 小于等于 | `全局数据表/当前状态/金钱 <= 100` |
| `==` | 等于 | `重要人物表/威尔逊/状态 == 活跃` |
| `!=` | 不等于 | `重要人物表/威尔逊/状态 != 死亡` |

#### 检测范围
- **关键词匹配**：除纪要表以外的所有数据库表格内容 + $6 上轮剧情规划数据
- **表格数值比较**：所有数据库表格（包括纪要表）

#### 使用示例
```text
你是一个剧情推进AI。

<!-- 关键词匹配：或逻辑 -->
<if seed="战斗,打架,打斗,搏斗">
当检测到战斗场景时，请特别注意战斗动作的流畅性。
</if>

<!-- 关键词匹配：与逻辑 -->
<if seed="主角&战斗">
主角参与战斗时，请重点描写主角的心理活动和战斗策略。
</if>

<!-- 关键词匹配：非逻辑 -->
<if seed="!战斗,!打斗">
日常场景中，请注重角色互动和氛围描写。
</if>

<!-- 表格数值比较：精确匹配 -->
<if cell="重要人物表/威尔逊/好感度 > 50">
威尔逊对主角的好感度较高，可以在剧情中加入更多互动机会。
</if>

<!-- 表格数值比较：模糊匹配（检查威尔逊行所有数值列） -->
<if cell="重要人物表/威尔逊 > 80">
威尔逊的某项属性超过80，可以触发特殊剧情。
</if>

<!-- 表格数值比较：模糊匹配（检查好感度列所有数值行） -->
<if cell="重要人物表/好感度 < 20">
有人的好感度低于20，可能会产生冲突。
</if>

请根据上述指引推进剧情。
```

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 6449-6489 | `formatNonSummaryTablesForSeed_ACU()` 函数，获取除纪要表外的表格内容用于关键词检测 |
| `index.js` | 6503-6590 | `evaluateSeedExpression_ACU()` 函数，解析关键词表达式（支持与、或、非逻辑） |
| `index.js` | 6592-6665 | `getCellValue_ACU()` 函数，从表格中获取指定单元格的值 |
| `index.js` | 6667-6810 | `evaluateCellExpression_ACU()` 函数，解析表格数值比较表达式（支持斜杠分隔、模糊匹配、行列颠倒） |
| `index.js` | 6812-6870 | `parseConditionalTemplate_ACU()` 函数，统一处理 seed 和 cell 两种条件模板 |
| `index.js` | 7920-7930 | 在剧情推进提示词处理流程中集成条件模板解析 |

---

### 2026-03-08 全局包裹条目顺序修复

#### 修复问题
- **全局包裹条目顺序错误**：修复了全局条目注入配置中，包裹条目无法正确包裹全局数据条目的问题。

#### 问题原因
1. **默认顺序配置错误**：`buildDefaultGlobalInjectionConfig_ACU()` 函数中 `wrapperPlacement.order` 默认值为 99982，而 `readableEntryPlacement.order` 为 99981。
2. **WrapperEnd 顺序计算错误**：WrapperEnd 的 order 使用 `wrapperPlacement.order + 1`（即 99983），导致顺序变成：数据(99981) → 上包裹(99982) → 下包裹(99983)，无法正确包裹。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 10055-10060 | 修改 `buildDefaultGlobalInjectionConfig_ACU()` 函数，将 `wrapperPlacement.order` 默认值从 99982 改为 99980 |
| `index.js` | 11126-11143 | 修改 WrapperEnd 的 order 计算逻辑，从 `wrapperPlacement.order + 1` 改为 `wrapperPlacement.order + 2` |

#### 修复后的效果
- 上包裹条目（WrapperStart）：Order = 99980
- 全局可读条目（ReadableDataTable）：Order = 99981
- 下包裹条目（WrapperEnd）：Order = 99982
- 顺序正确：上包裹 → 数据 → 下包裹，实现正确包裹

---

### 2026-03-08 纪要索引优化与重试延时调整

#### 修改内容

**1. $5占位符读取逻辑优化**
- $5占位符不再优先读取世界书中的"纪要索引"条目内容
- 改为从聊天记录的本地数据（纪要表）中读取
- 只读取纪要表的"概要"列和"编码索引"列两列内容
- 不再读取纪要表的其他内容（时间跨度、地点、纪要等）
- **兼容性**：如果读取不到纪要表（表不存在或为空），则回退到总体大纲表

**2. 纪要索引条目永久屏蔽**
- 纪要索引条目（`TavernDB-ACU-CustomExport-纪要索引`）在剧情推进世界书读取时被永久屏蔽
- 与"总体大纲"条目享受同等待遇

**3. 自动重试延时调整**
- 剧情推进自动重试延时改为固定5秒
- 填表自动重试延时改为固定5秒
- 自动/手动合并纪要重试延时改为固定5秒

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 6372-6435 | 新增 `formatSummaryIndexForPlot_ACU()` 函数，格式化纪要表的概要和编码索引列，返回 `{ success, content }` 对象 |
| `index.js` | 7255-7288 | 修改$5占位符生成逻辑，优先从纪要表读取，失败时回退到总体大纲表 |
| `index.js` | 7694-7702 | 在剧情推进世界书读取时屏蔽纪要索引条目 |
| `index.js` | 7520-7528 | 剧情推进重试延时改为固定5秒 |
| `index.js` | 19838-19846 | 填表重试延时改为固定5秒 |
| `index.js` | 19602-19605 | 自动合并纪要重试延时改为固定5秒 |
| `index.js` | 20251-20255 | 手动合并纪要重试延时改为固定5秒 |

---

### 2026-03-07 API接口扩展与纪要表索引锁定功能

#### 新增功能

**1. 更新配置参数读写 API**
- `getUpdateConfigParams()` - 获取自动更新阈值、频率、批处理大小等配置参数
- `setUpdateConfigParams(params)` - 设置更新配置参数

**2. 手动更新表选择读写 API**
- `getManualSelectedTables()` - 获取手动更新时选择的表格列表
- `setManualSelectedTables(sheetKeys)` - 设置手动更新选择的表格
- `clearManualSelectedTables()` - 清除手动选择（恢复全选状态）

**3. API 预设管理 API**
- `getApiPresets()` - 获取所有 API 预设列表
- `getTableApiPreset()` / `setTableApiPreset(name)` - 填表 API 预设读写
- `getPlotApiPreset()` / `setPlotApiPreset(name)` - 剧情推进 API 预设读写
- `saveApiPreset(data)` - 保存/更新 API 预设
- `loadApiPreset(name)` - 加载 API 预设到当前配置
- `deleteApiPreset(name)` - 删除 API 预设

**4. 纪要表索引编码锁定功能**
- 纪要表现在拥有与总结表相同的"编码索引列特殊锁定"功能
- 支持编码索引列的自动锁定
- 新增/删除行时自动重新排序编码

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 5044-5049 | 修改 `isSummaryOrOutlineTable_ACU()` 函数，添加对"纪要表"的判断，使其支持索引编码锁定功能 |
| `index.js` | 3771-4058 | 在 `AutoCardUpdaterAPI` 对象中新增更新配置参数、手动更新表选择、API预设管理等 API 接口 |

#### API 使用示例

```javascript
// 获取更新配置参数
const config = window.AutoCardUpdaterAPI.getUpdateConfigParams();
console.log('阈值:', config.autoUpdateThreshold);

// 设置更新配置参数
window.AutoCardUpdaterAPI.setUpdateConfigParams({
    autoUpdateThreshold: 5,
    updateBatchSize: 3
});

// 获取/设置手动更新表选择
const selection = window.AutoCardUpdaterAPI.getManualSelectedTables();
window.AutoCardUpdaterAPI.setManualSelectedTables(['sheet_xxx', 'sheet_yyy']);

// API 预设管理
const presets = window.AutoCardUpdaterAPI.getApiPresets();
window.AutoCardUpdaterAPI.setTableApiPreset('战斗场景API');
window.AutoCardUpdaterAPI.saveApiPreset({
    name: '新预设',
    apiMode: 'custom',
    apiConfig: { customApiUrl: '...', customApiKey: '...', customApiModel: 'gpt-4' }
});
```

---

### 2026-03-07 纪要表填表优化（减少TK压力）

#### 优化内容
- **纪要表填表时只发送最新10行**：将纪要表设置为和总结表一样，每轮填表时只发送最新的10行条目给填表AI，避免完整纪要表导致TK压力过大的问题。

#### 问题原因
1. **TK压力过大**：之前只有"总结表"有只发送最新10行的优化逻辑，而"纪要表"每次都会被完整发送给填表AI。
2. **表格增长**：随着对话进行，纪要表会不断增长，完整发送会导致Token消耗急剧增加。
3. **代码遗漏**：原有的条件判断只检查了`table.name.trim() === '总结表'`，没有包含新名称"纪要表"。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 17811-17812 | 将条件从`table.name.trim() === '总结表'`修改为`(table.name.trim() === '纪要表' || table.name.trim() === '总结表')`，同时支持新旧两种表格名称 |

#### 优化后的效果
- 纪要表行数超过10行时，填表AI只会收到最新的10行数据
- 大幅减少填表时的Token消耗
- 保持与总结表一致的行为逻辑
- 兼容旧数据中的"总结表"名称

---

### 2026-03-06 0TK模式$5占位符优化

#### 修复问题
1. **0TK模式下$5占位符无法获取纪要索引数据**：修复了在0TK占用模式启用时，剧情推进的$5占位符无法从世界书纪要索引条目获取数据的问题。
2. **0TK模式错误禁用其他表格索引条目**：修复了0TK模式启用时，会错误地禁用所有表格的附加索引条目，而不是只禁用"纪要索引"条目的问题。

#### 问题原因
1. **enabled检查导致获取失败**：`getSummaryIndexContentForPlot_ACU()`函数在查找纪要索引条目时，会检查`e.enabled`状态。
2. **0TK模式的行为**：当0TK占用模式启用时，纪要索引条目的`enabled`状态会被设置为`false`（禁用世界书注入）。
3. **冲突**：`getSummaryIndexContentForPlot_ACU()`因为条目被禁用而找不到数据，导致$5占位符回退到总体大纲表。
4. **设计意图冲突**：0TK模式只应控制世界书注入是否生效，不应影响剧情推进$5占位符读取数据的能力。
5. **过度禁用**：`buildExtraIndexEntryBlock_ACU()`函数将0TK模式的enabled控制应用到了所有表格的附加索引条目，而不是只针对"纪要索引"条目。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 5982-5986 | 移除`&& e.enabled`检查，让$5占位符能读取被禁用的纪要索引条目内容 |
| `index.js` | 10979 | 修改`buildExtraIndexEntryBlock_ACU()`函数，只有`entryName === '纪要索引'`时才应用0TK模式的enabled控制，其他表格的索引条目始终启用 |

#### 修复后的效果
- 0TK模式启用时，只有"纪要索引"条目的enabled状态为false（世界书注入禁用）
- 其他表格的附加索引条目不受0TK模式影响，始终保持启用
- 剧情推进的$5占位符仍能正常读取纪要索引条目内容（即使条目被禁用）
- $5占位符在0TK模式下获得正确的纪要索引数据

#### 注意事项
- `getSummaryIndexContentForPlot_ACU()`函数仅被用于$5占位符（第6861行调用）
- 该修改不影响其他任何逻辑对enabled状态的检查
- 0TK模式的世界书注入禁用功能保持正常工作
- 只有"纪要索引"条目会被0TK模式控制，其他表格的索引条目不受影响

---

### 2026-03-06 恢复默认模板解析错误修复

#### 修复问题
- **恢复默认模板后报错**：修复了点击"恢复默认模板"按钮后，控制台报错 `Failed to parse TABLE_TEMPLATE_ACU: safeJsonParse returned null` 的问题。

#### 问题原因
1. **模板字符串中的控制字符问题**：`DEFAULT_TABLE_TEMPLATE_ACU` 常量使用模板字符串（反引号）定义，格式为 `` `"{...}"` ``。
2. **JavaScript解释器的行为**：在模板字符串中，`\n` 会被解释为实际的换行符，`\"` 会被解释为双引号。这导致模板字符串的实际值包含了未转义的控制字符。
3. **JSON解析失败**：`JSON.parse()` 不允许字符串中包含未转义的换行符等控制字符，因此直接解析会失败，报错 `Bad control character in string literal in JSON`。
4. **具体流程**：
   - 恢复默认模板时，`TABLE_TEMPLATE_ACU = DEFAULT_TABLE_TEMPLATE_ACU`
   - 模板字符串的值是 `"{\n  \"key\": ...}"`（包含实际换行符）
   - `JSON.parse()` 因为控制字符而失败
   - 触发错误日志

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 4097-4193 | 修改 `parseTableTemplateJson_ACU()` 函数，添加 `escapeStringForJson_ACU()` 辅助函数，用于将控制字符转义为JSON兼容格式。解析流程：1) 去掉首尾引号；2) 转义反斜杠、双引号、换行符等控制字符；3) 重新包装引号；4) 解析得到JSON字符串；5) 再次解析得到对象 |

#### 修复后的效果
- 恢复默认模板时不再报错
- 正确解析包含控制字符的模板字符串
- 保持对标准JSON格式模板的兼容性

---

### 2026-03-06 0TK模式与世界书条目优化

#### 修复问题
1. **0TK模式开启后未关闭"纪要索引"条目**：修复了0TK占用模式启用时，世界书中的"TavernDB-ACU-CustomExport-纪要索引"条目没有被同步禁用的问题。
2. **没有总结表时仍出现MemoryStart/MemoryEnd条目**：修复了即使总结表没有数据，也会在世界书中创建TavernDB-ACU-MemoryStart和TavernDB-ACU-MemoryEnd条目的问题。

#### 问题原因
1. **问题1原因**：`updateOutlineTableEntry_ACU()`函数在没有outlineTable数据时会提前返回，导致不会执行"纪要索引"条目的enabled状态同步逻辑。
2. **问题2原因**：`updateReadableLorebookEntry_ACU()`函数在创建MemoryStart/MemoryEnd条目时，没有检查总结表是否存在实际数据（只检查了表头），导致空表也会创建这两个包裹条目。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 10050-10066 | 在`updateOutlineTableEntry_ACU()`函数中，当outlineTable为空时也执行"纪要索引"条目的enabled状态同步，使用`endsWith`匹配条目名称 |
| `index.js` | 10125-10139 | 在`updateOutlineTableEntry_ACU()`函数中，使用`endsWith`匹配"纪要索引"条目名称 |
| `index.js` | 10486-10507 | 添加`hasSummaryData`检查，判断总结表是否有实际数据（至少有一行非表头数据） |
| `index.js` | 10508-10518 | 没有总结表数据时，删除已存在的MemoryStart/MemoryEnd条目 |
| `index.js` | 10519-10607 | 有总结表数据时，正常创建或更新MemoryStart/MemoryEnd条目（原有逻辑移入此条件分支） |
| `index.js` | 10664-10668 | 在`updateCustomTableExports_ACU()`函数中获取0TK模式状态，用于控制"纪要索引"条目的enabled |
| `index.js` | 10842-10870 | 修改`buildExtraIndexEntryBlock_ACU()`函数，添加`enabled`参数支持0TK模式控制 |
| `index.js` | 11045-11058 | 调用`buildExtraIndexEntryBlock_ACU`时传递`extraIndexEntryEnabled`参数 |
| `index.js` | 11150-11158 | 调用`buildExtraIndexEntryBlock_ACU`时传递`extraIndexEntryEnabled`参数 |
| `index.js` | 15458-15477 | 0TK模式切换时，使用`endsWith`匹配"纪要索引"条目并更新enabled状态 |
| `index.js` | 4097-4115 | 修改`parseTableTemplateJson_ACU()`函数，使用`safeJsonParse_ACU`代替`JSON.parse`，避免控制字符导致的解析失败 |

#### 修复后的效果
1. **0TK模式**：启用0TK占用模式时，会同时禁用"总体大纲"和"纪要索引"两个世界书条目，即使总体大纲表没有数据也能正常工作
2. **MemoryStart/MemoryEnd条目**：只有在总结表有实际数据时才会创建这两个条目，空表时会自动清理已存在的条目

---

### 2026-03-06 模板加载错误提示优化

#### 修复问题
- **启动时误报模板解析错误**：移除了插件启动时不必要的自检错误提示，避免困扰用户。

#### 问题原因
1. **误报场景**：当存储中存在旧的/其他标识的损坏数据时，`loadTemplateFromStorage_ACU()` 函数会抛出错误并显示提示框。
2. **实际影响**：这个错误并不影响正在使用的自定义模板，也不会真的重置为默认模板，纯属误报。
3. **错误信息示例**：`SyntaxError: Bad control character in string literal in JSON at position 2 (line 1 column 3)`

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 7427-7455 | 将 `JSON.parse(savedTemplate)` 替换为 `safeJsonParse_ACU(savedTemplate, null)`，移除 `logError_ACU` 和 `showToastr_ACU` 错误提示，改为静默处理 |

#### 修复后的效果
- 当存储中的模板数据损坏时，插件会静默回退到默认模板，不再显示错误提示框
- 仅在调试模式下记录日志，便于开发者排查问题
- 用户不再被无意义的错误提示困扰

---

### 2026-03-06 模板解析错误修复

#### 修复问题
- **启动时模板解析错误**：修复了插件启动时报错 `SyntaxError: Expected property name or '}' in JSON at position 1` 的问题。

#### 问题原因
1. **JSON.parse 未使用安全解析**：在 `loadTemplateFromStorage_ACU()` 函数中，直接使用 `JSON.parse(savedTemplate)` 解析从存储中读取的模板数据，当数据格式不正确时会抛出异常。
2. **Tavern 设置命名空间类型检查不足**：`getTavernSettingsNamespace_ACU()` 函数只检查 `root.__userscripts[TAVERN_SETTINGS_NAMESPACE_ACU]` 是否为 truthy，但没有验证它是否为对象类型。如果该值是字符串或其他非对象类型，会导致后续读取逻辑出错。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 8022-8023 | 将 `JSON.parse(savedTemplate)` 替换为 `safeJsonParse_ACU(savedTemplate, null)`，并添加 `parsedTemplate &&` 条件检查 |
| `index.js` | 961-972 | 修改 `getTavernSettingsNamespace_ACU()` 函数，添加类型检查确保 namespace 是对象类型 |

#### 修复后的效果
- 当存储中的模板数据损坏时，插件会优雅地回退到默认模板，而不是抛出错误
- 当 Tavern 设置命名空间中存储了非对象类型的值时，会自动重置为空对象
- 错误日志仍会记录解析失败的信息，便于调试

---

### 2026-03-06 纪要表功能优化

#### 修改内容
1. **0TK功能开关控制优化**
   - 修改 `updateOutlineTableEntry_ACU()` 函数，在更新 `TavernDB-ACU-OutlineTable` 条目后，额外查找并同步更新 `TavernDB-ACU-CustomExport-纪要索引` 条目的 `enabled` 状态
   - 当0TK占用模式启用时，同时禁用这两个条目；禁用时，同时启用这两个条目

2. **剧情推进$5占位符优化**
   - 新增 `getSummaryIndexContentForPlot_ACU()` 函数，从世界书获取"纪要索引"条目内容
   - 修改 `$5` 占位符生成逻辑：优先从世界书读取纪要索引条目内容，如果不存在或未启用则回退到总体大纲表内容

3. **合并总结功能优化（改为合并纪要）**
   - 修改 `DEFAULT_MERGE_SUMMARY_PROMPT_ACU` 默认提示词：
     - 将"总结表"和"总体大纲"改为"纪要表"（单表）
     - 更新表格结构：列0=时间跨度，列1=地点，列2=纪要（≥300字），列3=概要（≤30字），列4=编码索引
     - 更新约束条件和输出格式
   - 修改UI文本：将"总结与大纲合并"改为"纪要合并"，"合并总结"改为"合并纪要"
   - 修改 `checkAndTriggerAutoMergeSummary_ACU()` 函数：只检测纪要表，删除总体大纲表相关逻辑
   - 修改 `performAutoMergeSummary_ACU()` 函数：只处理纪要表，删除总体大纲表相关逻辑
   - 修改 `handleManualMergeSummary_ACU()` 函数：只查找纪要表，兼容旧数据"总结表"

4. **语法错误修复**
   - 删除 `performAutoMergeSummary_ACU()` 函数中残留的 `allOutlineRows`、`newOutlineRows`、`accumulatedOutline` 等大纲表相关变量引用
   - 删除 `handleManualMergeSummary_ACU()` 函数中所有大纲表相关代码（`allOutlineRows`、`outlineKey`、`accumulatedOutline`、`newOutlineRows`、`outlineTableObj`、`fullOutlineRows`）
   - 修复了"Missing catch or finally after try"语法错误

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 10648-10663 | 0TK开关：添加纪要索引条目的同步更新逻辑 |
| `index.js` | 6435-6474 | 新增 `getSummaryIndexContentForPlot_ACU()` 函数 |
| `index.js` | 7335-7357 | 修改 `$5` 占位符生成逻辑，优先读取纪要索引条目 |
| `index.js` | 2831 | 修改 `DEFAULT_MERGE_SUMMARY_PROMPT_ACU` 默认提示词 |
| `index.js` | 15131 | UI文本修改：标题"总结与大纲合并" → "纪要合并" |
| `index.js` | 15132 | UI文本修改：描述文字 |
| `index.js` | 15168 | UI文本修改："开启自动合并总结" → "开启自动合并纪要" |
| `index.js` | 15201 | UI文本修改："开始合并总结" → "开始合并纪要" |
| `index.js` | 19280-19403 | 修改 `checkAndTriggerAutoMergeSummary_ACU()` 函数 |
| `index.js` | 19419-19691 | 修改 `performAutoMergeSummary_ACU()` 函数 |
| `index.js` | 20060-20157 | 修改 `handleManualMergeSummary_ACU()` 函数 |
| `index.js` | 19451 | 删除 `batchOutlineRows` 定义 |
| `index.js` | 19606-19636 | 删除大纲表相关变量和处理逻辑 |
| `index.js` | 20128-20330 | 删除 `handleManualMergeSummary_ACU()` 中所有大纲表相关代码 |

#### 使用说明
1. **0TK功能**：启用0TK占用模式时，会同时禁用"总体大纲"和"纪要索引"两个世界书条目
2. **剧情推进$5占位符**：优先使用世界书中的"纪要索引"条目内容，如果该条目不存在或未启用，则回退到总体大纲表
3. **合并纪要功能**：现在只对纪要表生效，不再处理总体大纲表。UI和提示词已相应更新

---

### 2026-03-06 API模型选择优化（双框模式）

#### 修复问题
- **模型选择优化**：同时支持手动输入和下拉选择两种方式。

#### 问题原因
之前将`<input>`+`<datalist>`改为纯`<select>`下拉菜单后，用户无法手动输入模型名称。用户希望同时支持两种方式。

#### 解决方案
采用双框模式：
- **上方输入框**：用于手动输入模型名称，读取/保存时只使用这个输入框的值
- **下方下拉框**：用于从加载的模型列表中选择，选择后自动覆盖到上方输入框

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 2855-2856 | 变量声明：添加`$customApiModelInput_ACU`和`$customApiModelSelect_ACU` |
| `index.js` | 8244-8253 | 加载设置逻辑：输入框显示已保存模型，select也添加该模型选项 |
| `index.js` | 8441-8447 | 保存配置逻辑：从输入框获取模型值 |
| `index.js` | 8469-8471 | 保存后添加模型：将新模型添加到select中 |
| `index.js` | 9045-9129 | 加载模型列表逻辑：填充select下拉菜单 |
| `index.js` | 14879-14884 | UI部分：添加两个模型框（输入框+下拉框） |
| `index.js` | 15503-15504 | UI初始化：绑定输入框和select元素 |
| `index.js` | 16080-16086 | 事件绑定：下拉选择改变时自动覆盖到输入框 |

#### 使用说明
1. **手动输入**：直接在上方输入框中输入模型名称
2. **下拉选择**：点击"加载模型列表"按钮后，从下方下拉框选择模型，会自动填入上方输入框
3. 保存时只读取上方输入框的值

### 2026-03-06 Import路径修复

#### 修复问题
- **Import路径错误**：修复了动态import语句使用绝对路径导致模块加载失败的问题。

#### 问题原因
在SillyTavern的插件环境中，动态import语句使用绝对路径（如`/script.js`）会导致模块解析失败。需要使用相对路径（如`./script.js`）来正确加载模块。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 939 | 将`import('/script.js')`改为`import('./script.js')` |
| `index.js` | 950 | 将`import('/scripts/extensions.js')`改为`import('./scripts/extensions.js')` |

#### 修复后的效果
- 插件能够正确加载SillyTavern的核心模块
- 正确获取`saveSettings`和`extension_settings`功能
- 避免控制台报错

### 2026-03-02 API模型输入优化

#### 新增功能
- **API模型输入方式优化**：将原本的纯下拉选择`<select>`改为`<input>`+`<datalist>`组合，支持用户手动输入模型名称。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 14879-14880 | UI部分：将`<select>`改为`<input type="text">`+`<datalist>`组合 |
| `index.js` | 2855-2856 | 变量声明：将`$customApiModelSelect_ACU`改为`$customApiModelInput_ACU`和`$customApiModelDatalist_ACU` |
| `index.js` | 15496-15497 | 元素初始化：绑定新的input和datalist元素 |
| `index.js` | 8243-8255 | 加载设置逻辑：适配新结构，将已保存模型显示在input中并添加到datalist |
| `index.js` | 8441-8471 | 保存配置逻辑：从input获取值，保存时将模型名添加到datalist |
| `index.js` | 9049-9165 | 模型列表加载逻辑：将加载的模型填充到datalist中 |
| `index.js` | 9054 | fetchModelsAndConnect_ACU函数检查：更新变量名 |

#### 改进内容
1. **灵活输入**：用户可以直接输入模型名称，无需依赖API加载的模型列表
2. **自动补全**：加载的模型列表会自动填充到datalist中，提供下拉选择和自动补全功能
3. **智能保存**：用户手动输入的模型名会在保存时自动添加到datalist中，方便下次选择
4. **去重处理**：已存在的模型名不会重复添加到datalist中
5. **兼容性**：支持从API加载的多种模型数据格式（Tavern、OpenAI标准、数组格式）

#### 使用说明
1. 在插件设置界面的"公用设置"区域找到"选择或输入模型"输入框
2. 方式一：点击"加载模型列表"按钮，加载API提供的模型列表，然后从下拉中选择
3. 方式二：直接在输入框中手动输入模型名称（如 `gpt-4o`、`claude-3-opus` 等）
4. 点击"保存API"按钮保存配置
5. 手动输入的模型名会自动添加到建议列表中，方便下次选择

### 2026-02-28 填表阈值检测修复

#### 修复问题
- **AI回复阈值检测无效**：修复了当AI正文回复低于阈值时，自动跳过填表功能无效的问题。

#### 问题原因
自动填表触发时使用的是 `auto_independent` 模式，但阈值检测的条件只包含了 `auto`、`auto_unified`、`auto_standard`、`auto_summary_silent`，导致 `auto_independent` 模式被遗漏，阈值检测被跳过。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 19203-19206 | 将硬编码的模式列表替换为 `isAutoUpdateMode` 变量，确保所有 `auto_*` 模式（包括 `auto_independent`）都被阈值检测覆盖 |

#### 修复后的逻辑
当接收到的AI正文回复（不是填表反馈）低于用户设置的阈值时，说明AI的正文回复被截断或者空回，此时自动跳过填表功能，不进行填表操作。

#### 后续修复
**2026-02-28 14:45** - 修复手动更新失效问题
- 修复原因：初次修复时意外删除了 `isManualMode` 变量定义，导致手动更新功能失效
- 修复内容：重新添加了 `isManualMode` 变量定义（第19201行）

### 2026-02-26填表自动重试次数设置功能

#### 新增功能
- **填表自动重试次数设置**：为填表功能新增可配置的自动重试次数，支持在错误或空回（低于回复字符）时自动重试。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 2883-2884 | 新增UI变量声明 `$tableMaxRetriesInput_ACU` |
| `index.js` | 2945-2946 | 在默认设置中添加 `tableMaxRetries: 3` 配置项 |
| `index.js` | 8783-8801 | 新增 `saveTableMaxRetries_ACU()` 保存函数 |
| `index.js` | 14726-14732 | 在UI界面新增"填表自动重试次数"输入框 |
| `index.js` | 15514 | UI初始化时绑定 `$tableMaxRetriesInput_ACU` 元素 |
| `index.js` | 16222 | 添加自动保存事件绑定 |
| `index.js` | 8268 | 在 `loadSettings_ACU()` 中加载重试次数设置 |
| `index.js` | 19676 | 修改 `proceedWithCardUpdate_ACU()` 使用可配置的重试次数 |

#### 使用说明
1. 在插件设置界面的"公用设置"区域找到"填表自动重试次数"输入框
2. 输入1-10之间的整数（默认为3次）
3. 设置会自动保存
4. 当填表过程中出现错误或AI回复为空/过短时，系统会自动重试，最多重试设定的次数

### 2026-02-26 剧情推进API错误重试修复

#### 修复问题
- **剧情推进API错误重试**：修复了剧情推进功能在API调用失败（如网络错误、API超时等）时直接中断的问题，现在会自动重试。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 7517-7580 | 重构剧情推进API调用逻辑，添加统一的错误重试机制 |

#### 改进内容
1. **统一重试逻辑**：无论 `minLength` 是否大于0，都支持API错误重试
2. **可配置重试次数**：使用 `plotSettings.loopSettings.maxRetries` 配置（默认3次）
3. **错误捕获**：API调用添加 try-catch，捕获网络错误、API超时等异常
4. **递增等待时间**：重试间隔采用递增策略（1秒、2秒、3秒...）
5. **友好提示**：显示具体的错误信息，帮助用户了解失败原因

#### 注意事项
- 剧情推进的重试次数使用的是"循环设置"中的"最大重试"参数
- 用户中止操作不会触发重试，会直接返回

### 2026-02-26 填表重试逻辑完善

#### 修复问题
- **填表统一重试逻辑**：完善填表功能的重试机制，现在任意错误（API错误、空回、解析失败）都会进入重试。

#### 修改内容

| 文件 | 代码行数区间 | 修改说明 |
|------|-------------|----------|
| `index.js` | 19770-19850 | 重构填表重试逻辑，统一处理所有错误类型 |

#### 改进内容
1. **统一错误处理**：API调用失败、空回（低于回复字符阈值）、解析失败都进入重试
2. **空回检测**：在重试循环内检测AI回复长度，低于 `autoUpdateTokenThreshold` 阈值时触发重试
3. **解析失败重试**：解析或应用AI更新失败时不再直接抛出，而是进入重试
4. **递增等待时间**：重试间隔采用递增策略（1秒、2秒、3秒...）
5. **用户可取消**：用户随时可以通过点击取消按钮结束任务与所有重试
6. **友好提示**：显示具体的错误信息，帮助用户了解失败原因

#### 重试逻辑流程
1. 检查用户是否已取消 → 是则退出
2. 调用API → 失败则重试
3. 检查空回 → 低于阈值则重试
4. 检查tableEdit标签 → 缺失则重试
5. 解析并应用更新 → 失败则重试
6. 成功则退出循环
7. 达到最大重试次数 → 反馈失败并结束任务