# shujuku（神·数据库）

## 触发规则（已修复"其它插件 API 调用误触发"）

为避免其它扩展/插件的后台调用（尤其是 quiet/后台生成、工具调用）误触发本脚本的逻辑，本项目对触发条件做了门控：

- **剧情推进**：仅在 **用户在酒馆界面真实发送消息** 时触发（`MESSAGE_SENT` → 紧随其后的 `GENERATION_AFTER_COMMANDS`），并且会过滤 `quiet_prompt` / `type === 'quiet'` / `automatic_trigger`。
- **自动填表更新**：仅在 **本次生成不是 quiet/后台生成** 时触发（通过 `GENERATION_STARTED` 记录上下文，在 `GENERATION_ENDED` 时过滤）。

如需调整"用户发送→生成"的容忍窗口，可在 `shujuku/index.js` 中搜索并修改 `USER_SEND_TRIGGER_TTL_MS_ACU`。

---

## 更新日志

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