# shujuku（神·数据库）

## 触发规则（已修复"其它插件 API 调用误触发"）

为避免其它扩展/插件的后台调用（尤其是 quiet/后台生成、工具调用）误触发本脚本的逻辑，本项目对触发条件做了门控：

- **剧情推进**：仅在 **用户在酒馆界面真实发送消息** 时触发（`MESSAGE_SENT` → 紧随其后的 `GENERATION_AFTER_COMMANDS`），并且会过滤 `quiet_prompt` / `type === 'quiet'` / `automatic_trigger`。
- **自动填表更新**：仅在 **本次生成不是 quiet/后台生成** 时触发（通过 `GENERATION_STARTED` 记录上下文，在 `GENERATION_ENDED` 时过滤）。

如需调整"用户发送→生成"的容忍窗口，可在 `shujuku/index.js` 中搜索并修改 `USER_SEND_TRIGGER_TTL_MS_ACU`。

---

## 更新日志

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