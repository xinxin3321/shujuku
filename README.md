# AutoCardUpdater 插件更新日志

## 2026-04-08 更新（本轮实现：UI 可读性与手机弹窗优化）

### 功能描述

1. 提升独立窗口与主面板基础字体可读性：为窗口容器与主弹窗作用域补充 `font-weight`、字体平滑和更稳的标题/导航/按钮字重，缓解“字体太细看不清”的反馈；对应实现位于 [`index.js`](index.js:222)-[`index.js`](index.js:227) 与 [`index.js`](index.js:23566)-[`index.js`](index.js:23677)。
2. 调整手机端弹窗尺寸策略：移动端不再强制全屏，而是改成保留边距的浮层；同时在窗口初始化阶段引入手机专用宽高与边距，减少“提示框太大挡内容”的情况；对应实现位于 [`index.js`](index.js:279)-[`index.js`](index.js:293)、[`index.js`](index.js:638)-[`index.js`](index.js:667) 与 [`index.js`](index.js:798)-[`index.js`](index.js:800)。
3. 优化 toast 提示框文字与手机尺寸：加重标题、正文与中止按钮字重，并在 `<=520px` 时缩窄 toast 宽度、内边距、图标与关闭按钮尺寸，降低移动端遮挡；对应实现位于 [`index.js`](index.js:9221)-[`index.js`](index.js:9288)。
4. 已执行 `node --check index.js`，当前脚本通过语法检查。

### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 独立窗口基础字重与字体渲染 | 222-227 | 独立窗口容器补充 `font-weight`、`text-rendering` 与抗锯齿设置 |
| 手机端独立窗口尺寸与边距 | 279-293、638-667、798-800 | 手机端改为保留边距的浮层尺寸，并在初始化逻辑中按手机屏幕计算宽高 |
| 主面板标题 / 导航 / 按钮字重优化 | 23566-23677 | 主面板字体整体变厚，标题、标签页和按钮可读性提升 |
| Toast 字体与手机尺寸优化 | 9221-9288 | 提示框标题 / 正文 / 操作按钮变厚，手机端 toast 更窄更紧凑 |

## 2026-04-08 更新（本轮实现：表格模板 `groupId` 分组并发）

### 功能描述

1. 模板 / 指导表默认 `updateConfig` 已补入 `groupId: -1`，这样旧模板、旧指导表、以及过去没有编号的表格都会被视为默认同组；对应实现位于 [`index.js`](index.js:10366) 与 [`index.js`](index.js:10875)。
2. 自动更新链路现在会先从模板参数解析 `groupId`，再把它写入待更新任务，并按 `groupId + 上下文索引 + batchSize` 建立并发分组；因此不同编号的表会拆分并发，相同编号的表仍然保持原本“相同上下文 + 相同批次大小才合并”的逻辑；对应实现位于 [`index.js`](index.js:17569)-[`index.js`](index.js:17783)。
3. 手动更新链路也已改为按模板中的 `groupId` 对当前选中表拆组，但仍继续共用 UI 的上下文深度、批处理大小与跳过楼层设置；对应实现位于 [`index.js`](index.js:18096)-[`index.js`](index.js:18123)。
4. 可视化编辑器的自动化参数面板新增了 `groupId` 输入框，并补齐了实时写回 [`sheet.updateConfig`](index.js:34619) 的绑定，之后可以直接在模板编辑界面配置分组编号；对应实现位于 [`index.js`](index.js:34368)-[`index.js`](index.js:34392) 与 [`index.js`](index.js:34618)-[`index.js`](index.js:34620)。
5. 新建表格时的默认模板参数也已补入 `groupId: -1`，保证新表默认与历史无编号模板保持同组语义；对应实现位于 [`index.js`](index.js:33982)-[`index.js`](index.js:33985)。
6. 已执行 `node --check index.js`，当前脚本通过语法检查。

### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 模板 / 指导表默认 `groupId` 兼容 | 10366-10373、10875-10880 | 为旧模板、指导表空白结构补上 `groupId: -1` 默认值 |
| 自动更新参数解析与并发分组 | 17569-17783 | 解析 `groupId`，并把分组键扩展为 `groupId + indices + batchSize` |
| 手动更新按 `groupId` 拆组 | 18096-18123 | 手动选中的表改为先按 `groupId` 分组，再逐组更新 |
| 新增表格默认模板参数 | 33982-33985 | 新建表默认携带 `groupId: -1` |
| 可视化编辑器 `groupId` 输入与绑定 | 34368-34392、34618-34620 | 新增配置项说明、输入框和事件绑定 |

## 2026-04-08 更新（本轮规划：表格模板 `groupId` 分组并发）

### 规划目标

为 [`index.js`](index.js) 的表格模板新增 `groupId` 参数，用于把不同编号的表拆分到不同并发组；同编号的表仍按现有逻辑继续复用“相同上下文范围 + 相同 batch size 才能合并到同一请求”的规则。历史模板未填写 `groupId` 时，统一视为默认同组，保证旧模板兼容。

### 当前分析结论

1. 自动更新主分组逻辑位于 [`tablesToUpdate`](index.js:17713) 收集与 [`updateGroups`](index.js:17734) 构建阶段；当前仅按 `indices + batchSize` 分组，需要在这里补入 `groupId` 维度。
2. 手动更新入口位于 [`updateSelectedTablesManual_ACU()`](index.js:18073) 所在分支；当前手动更新会把所有选中表强制归为一组，是否继续保持该行为，需要在实施前再由你确认。
3. 模板转指导表时，[`buildChatSheetGuideDataFromTemplateObj_ACU()`](index.js:10904) 会复制每个表的完整配置对象，因此只要模板对象保存了 `groupId`，指导表链路天然可继承该参数。
4. 可视化编辑器的自动化参数面板位于 [`cfg-depth` ~ `cfg-send-rows`](index.js:34356) 到 [`cfg-send-rows` 绑定](index.js:34601) 之间，适合新增 `groupId` 输入框与写回逻辑。
5. 保存模板时，[`templateTable.updateConfig`](index.js:34872) 已做整段深比较与同步，因此只要 `groupId` 写入 [`sheet.updateConfig`](index.js:34597)，全局模板保存链路可自动带上该字段。

### 预计改动区间

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 自动更新参数解析与待更新表收集 | 17562-17719 | 新增 `groupId` 默认值解析，并把它写入待分组项 |
| 自动更新并发分组键生成 | 17731-17790 | 分组键从 `indices + batchSize` 扩展为 `groupId + indices + batchSize` |
| 手动更新入口 | 18079-18119 | 待确认是否也要按 `groupId` 继续拆组 |
| 模板指导表构建继承链 | 10921-10933 | 确认模板复制链路无需额外丢字段处理 |
| 可视化编辑器参数面板 | 34354-34601 | 新增 `groupId` 输入项、说明文案与事件绑定 |
| 模板保存回写链路 | 34872-34887 | 依赖 `updateConfig` 全量同步，将 `groupId` 一并保存 |

## 2026-04-08 更新（第八步：剧情推进任务阶段接力与按楼层历史回溯）

### 为剧情推进任务增加“同阶段并发 / 跨阶段串行”的接力模式，并修复 `$6` 删除楼层后仍读取旧剧情推进数据的问题

#### 功能描述
1. [`normalizePlotTask_ACU()`](index.js:4888) 现在会为每个剧情任务标准化 `stage` 阶段号；旧版单任务包装逻辑也会默认补上 `stage: 1`，保证历史配置继续兼容。
2. 剧情任务编辑器已补齐阶段号读写链路：[`renderPlotTaskList_ACU()`](index.js:6400) 会在列表中显示“阶段：N”，[`loadCurrentPlotTaskToUI_ACU()`](index.js:6433) / [`saveCurrentPlotTaskFromUI_ACU()`](index.js:6456) 会把阶段号同步到界面和设置对象中，[`buildNewPlotTaskForUI_ACU()`](index.js:6503) 新建任务时则默认继承最后一个任务的阶段号。
3. 新增 [`buildPlotTagMapFromText_ACU()`](index.js:14432)、[`buildPlotTagBlock_ACU()`](index.js:14459)、[`replacePlotTagPlaceholders_ACU()`](index.js:14467) 等 helper，让剧情任务提示词内部也能直接使用 `{{标签名}}`；首阶段任务会从上一轮剧情推进结果中回填同名标签，后续阶段则会从前面阶段已聚合出的标签块中继续接力，取不到时替换为空。
4. [`runPlotTasksRuntime_ACU()`](index.js:14964) 已改为“同阶段并发、跨阶段串行”，阶段间共享前序聚合标签；任一阶段出现失败任务时，会立即停止后续阶段并返回明确报错。
5. [`aggregatePlotTaskTags_ACU()`](index.js:14484)、[`buildPlotRawFallbackText_ACU()`](index.js:14509) 与相关排序 helper 现在都会按 `stage + order` 统一整理任务结果，保证标签聚合、回退文本和最终注入顺序与阶段执行顺序一致。
6. [`findPlotHistoryAnchorIndex_ACU()`](index.js:15540) 与 [`getPlotFromHistory_ACU()`](index.js:15579) 已支持“按当前用户楼层向前回溯”的历史检索上界；剧情推进主链路在用户消息已经入 chat 时会传入楼层锚点，因此删除某一楼层后，`$6` 会重新读取当前楼层之前更早的剧情推进数据；若再往前已经没有对应用户楼层，则返回空字符串。
7. [`buildPlotSharedContext_ACU()`](index.js:14618)、[`runOptimizationLogic_ACU()`](index.js:15815) 以及生成拦截调用方已经补齐 `hasExistingUserMessage` 透传，使不同发送路径下的剧情推进历史读取都能按当前楼层正确限定检索范围。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情任务 `stage` 字段标准化与旧配置兼容 | 4888-4929 | [`normalizePlotTask_ACU()`](index.js:4888) 与 [`buildLegacyWrappedPlotTask_ACU()`](index.js:4917) 新增阶段号兼容逻辑 |
| 剧情任务列表 / 编辑器阶段号读写 | 6400-6518 | 任务列表显示阶段号，编辑区支持阶段号加载、保存与新建默认值 |
| 剧情任务标签接力与阶段顺序排序 helper | 14419-14525 | 新增 `{{标签名}}` 解析、标签块构造、结果排序与聚合顺序控制 |
| 剧情任务共享上下文、标签接力渲染与分阶段运行时 | 14618-15045 | 首阶段读取上一轮标签，后续阶段接力前序结果，并按阶段顺序串行执行 |
| `$6` 按当前用户楼层向前回溯的历史检索 | 15540-15643 | 新增楼层锚点定位与检索上界控制，修复删除楼层后的历史读取错位 |
| 剧情推进主链路透传当前楼层状态 | 15815-15920、20797-21063 | 运行时与生成拦截链路补齐 `hasExistingUserMessage`，区分“消息已入 chat / 尚未入 chat” |
| 剧情任务编辑面板阶段号输入框与说明文案 | 24459-24462 | 设置面板新增“当前任务阶段号”输入框，并标注“同阶段并发，不同阶段串行” |
| 阶段号自动保存监听 | 26432-26434 | 将阶段号输入纳入剧情任务编辑器自动保存监听 |

## 2026-04-08 更新（第七步：重构剧情推进作用域逻辑）

### 将剧情推进预设改成“全局预设负责管理，当前聊天预设只负责切换使用”

#### 功能描述
1. 剧情推进预设区的 UI 已重新梳理：全局卡片继续保留导入、导出、保存、另存为、恢复默认与删除入口，而当前聊天卡片现在只保留 [`#...-plot-chat-preset-select`](index.js:24182) 下拉框；原先当前聊天侧的保存、导入、导出、清除覆写按钮已经移除，说明文案也同步改成“当前聊天这里只负责切换使用”。
2. 新增 [`switchCurrentChatPlotPreset_ACU()`](index.js:5334)，把“当前聊天切换到某个剧情推进预设”与“当前聊天改为跟随全局”统一收口为一条独立链路；它会在切换时优先清掉旧版聊天快照覆写，再改成基于聊天绑定名切换当前聊天实际使用的全局预设，避免当前聊天侧继续承担保存快照职责。
3. [`$plotChatPresetSelect.on('change', ...)`](index.js:26406) 现在只负责切换当前聊天正在使用的剧情推进预设，并立即刷新提示词编辑区；全局侧的 [`$plotSavePreset.on('click', ...)`](index.js:26473) 与 [`savePlotPresetAsNew_ACU()`](index.js:27887) 则继续负责把当前 UI 中的内容保存回全局预设库，不再生成或同步聊天级剧情推进快照。
4. [`loadPlotPresetSelect_ACU()`](index.js:27742) 已同步改成新的状态文案：当前聊天下拉框的默认项改为“跟随全局”，状态提示会区分“跟随全局 / 独立预设 / 旧版聊天快照待迁移 / 原绑定预设已失效回退”几种情况，便于直接看出当前聊天到底在使用哪一条剧情推进链路。
5. 剧情推进 API 注入逻辑也已跟着切换：[`importPlotPresetFromData()`](index.js:7938) 现在会先把导入内容写入全局剧情推进预设库；当 `switchTo = true` 时，再继续调用 [`injectPlotPresetToCurrentChat()`](index.js:7878) 把当前聊天切换到刚导入的那个全局预设。这样像 [`opening-regex.html`](opening-regex.html) 一类走初始化注入接口的场景，体感上仍然是“导入后立刻可用”，但底层数据归属已经统一回到全局预设库。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进双卡片 UI 重构 | 24156-24187 | 当前聊天卡片只保留 [`#...-plot-chat-preset-select`](index.js:24182)，并更新全局 / 当前聊天两侧说明文案 |
| 当前聊天剧情推进切换 helper | 5334-5406 | 新增 [`switchCurrentChatPlotPreset_ACU()`](index.js:5334)，统一处理“跟随全局 / 独立预设 / 旧版聊天快照迁移清理” |
| 当前聊天下拉切换与全局预设管理事件 | 26377-26702 | [`$plotChatPresetSelect.on('change', ...)`](index.js:26406) 改成仅切换当前聊天；全局导入 / 导出 / 保存仍集中在全局卡片 |
| 剧情推进预设选择器状态回显与全局另存为 | 27742-27934 | [`loadPlotPresetSelect_ACU()`](index.js:27742) 与 [`savePlotPresetAsNew_ACU()`](index.js:27887) 按新作用域语义刷新状态和保存全局预设 |
| 剧情推进前端导入 API 语义调整 | 7938-8011 | [`importPlotPresetFromData()`](index.js:7938) 改为“先导入全局预设库，再按需切换当前聊天到该预设” |

## 2026-04-08 更新（第六步：重构剧情推进双保存按钮逻辑）

### 让“保存到全局剧情推进预设”和“保存到当前剧情推进预设”都以当前 UI 显示的最新修改数据为准，并在保存全局时同步覆盖当前聊天中的同名预设

#### 功能描述
1. 新增 [`syncCurrentChatPlotSnapshotFromSettings_ACU()`](index.js:5327)、[`shouldSyncCurrentChatPlotPresetOnGlobalSave_ACU()`](index.js:5364) 与 [`queueSaveCurrentChatPlotScope_ACU()`](index.js:5373)，把“将当前 UI 数据写回聊天级完整快照”“判断本次全局保存是否需要同步覆盖当前聊天同名预设”“异步保存聊天记录”三段逻辑集中收敛成可复用 helper，避免全局保存按钮与当前聊天保存按钮继续各自散落写入。
2. [`#...-plot-chat-save-preset`](index.js:24205) 现在会先通过 [`getCurrentPlotSettingsFromUI_ACU()`](index.js:28054) 读取当前界面上最新的剧情任务、提示词、循环提示词与规则，再调用 [`syncCurrentChatPlotSnapshotFromSettings_ACU()`](index.js:5327) 写入当前聊天完整快照；这样“保存当前剧情推进预设”保存的就是眼前 UI 正在显示和编辑的内容，而不是旧运行态残留值。
3. [`#...-plot-global-save-preset`](index.js:24180) 与 [`savePlotPresetAsNew_ACU()`](index.js:28111) 现在同样都基于 [`getCurrentPlotSettingsFromUI_ACU()`](index.js:28054) 取数保存全局预设；并且当当前正处于聊天记录内，且当前聊天实际使用的预设名与本次保存的全局预设同名时，会额外调用 [`syncCurrentChatPlotSnapshotFromSettings_ACU()`](index.js:5327) 把同一份 UI 数据同步覆盖到当前聊天预设，实现你要求的“保存全局时，同时覆盖同名当前聊天预设”。
4. 这一轮还同步更新了剧情推进预设卡片里的说明文案，使界面行为和实际保存语义一致：全局保存按钮明确说明“以当前 UI 最新数据为准，并在同名时同步覆盖当前聊天预设”；当前聊天保存按钮也明确说明“会把当前 UI 最新内容写入聊天级完整快照”。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 新增剧情推进保存链路 helper | 5327-5387 | 新增 [`syncCurrentChatPlotSnapshotFromSettings_ACU()`](index.js:5327)、[`shouldSyncCurrentChatPlotPresetOnGlobalSave_ACU()`](index.js:5364)、[`queueSaveCurrentChatPlotScope_ACU()`](index.js:5373) |
| 当前聊天保存按钮改为直接保存当前 UI 数据 | 26456-26481 | [`$plotChatSavePreset.on('click', ...)`](index.js:26457) 现在会将当前界面数据写入当前聊天快照并保存聊天 |
| 全局覆盖保存时同步同名当前聊天预设 | 26687-26742 | [`$plotSavePreset.on('click', ...)`](index.js:26689) 保存全局后会按当前聊天实际预设名决定是否同步覆盖聊天预设 |
| 另存为新的全局预设时同步同名当前聊天预设 | 28111-28163 | [`savePlotPresetAsNew_ACU()`](index.js:28111) 保存 / 覆盖全局预设时同样支持同步当前聊天同名预设 |
| 剧情推进预设卡片说明文案更新 | 24179-24211 | 更新全局预设与当前聊天预设两处说明文字，和新的保存语义保持一致 |

## 2026-04-08 更新（第五步：修复实时渲染调度函数的作用域错误）

### 修复剧情推进预设切换时的实时渲染调度报错，让已打开数据库窗口内的刷新回调重新进入弹窗局部作用域

#### 功能描述
1. 根据控制台报错，确认根因不是单纯“没重绘”，而是 [`schedulePlotSettingsUiRefresh_ACU()`](index.js:5441) 在外层作用域里直接调用了 [`loadPlotSettingsToUI_ACU()`](index.js:27521)，但后者实际定义在弹窗 [`onReady`](index.js:24627) 的局部作用域中，因此浏览器在 `about:srcdoc` 中执行延迟回调时会直接抛出 `ReferenceError: loadPlotSettingsToUI_ACU is not defined`，导致后续实时刷新链被中断。
2. 现在在弹窗初始化完成后，[`$popupInstance_ACU`](index.js:24637) 会注册一个专用的 `acu_plot_settings_refresh` 事件桥接器；该桥接器本身定义在 [`onReady`](index.js:24627) 内部，因此可以安全调用同作用域下的 [`loadPlotSettingsToUI_ACU()`](index.js:27521)。
3. [`schedulePlotSettingsUiRefresh_ACU()`](index.js:5441) 已改为只负责延迟触发当前弹窗上的 `acu_plot_settings_refresh` 事件，不再跨作用域直接访问 [`loadPlotSettingsToUI_ACU()`](index.js:27521)。这样预设切换后的延迟刷新会重新回到弹窗内部执行，避免再次因为作用域丢失而中断。
4. [`loadPlotSettingsToUI_ACU()`](index.js:27521) 在每次重绘前也会重新抓取 [`#...-plot-prompt-segments-container`](index.js:27524) 与 [`#...-plot-task-list`](index.js:27525)，进一步确保实时刷新使用的是当前打开窗口中的最新 DOM 引用，而不是旧缓存节点。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 弹窗内注册剧情推进 UI 刷新桥接事件 | 24627-24644 | 在 [`onReady`](index.js:24627) 内为 [`$popupInstance_ACU`](index.js:24637) 绑定 `acu_plot_settings_refresh`，在局部作用域里安全调用 [`loadPlotSettingsToUI_ACU()`](index.js:27521) |
| 实时渲染调度改为事件桥接 | 5441-5457 | [`schedulePlotSettingsUiRefresh_ACU()`](index.js:5441) 不再直接调用局部函数，改为触发弹窗上的刷新事件 |
| 剧情推进 UI 重绘前重取关键容器 | 27521-27525 | [`loadPlotSettingsToUI_ACU()`](index.js:27521) 重绘前重新获取提示词段落容器与任务列表容器 |

## 2026-04-08 更新（第四步：修复数据库窗口已打开状态下的延迟渲染链）

### 让剧情推进预设切换在数据库窗口保持打开时也会强制重建提示词编辑区，不再必须关闭窗口后再重新打开

#### 功能描述
1. 新增 [`schedulePlotSettingsUiRefresh_ACU()`](index.js:5441)，并把 [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5368) 与 [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5401) 的刷新入口统一改成“延后一帧重绘”。这样全局 / 当前聊天预设切换后，不再与当前弹窗中的同步 DOM 状态抢时序，数据库窗口保持打开时也会重新执行一次完整的剧情推进 UI 装载。
2. [`renderPlotPromptSegments_ACU()`](index.js:6213) 现在在每次重绘提示词段落前，都会优先从当前 [`$popupInstance_ACU`](index.js:5737) 重新获取 [`#...-plot-prompt-segments-container`](index.js:6215)；同时当传入段落为空时，不再错误回退到运行态 [`settings_ACU.plotSettings`](index.js:5820)，而是回退到当前编辑对象。这样可避免弹窗已打开时仍继续拿旧容器 / 旧运行态数据，导致界面停留在切换前内容。
3. [`loadCurrentPlotTaskToUI_ACU()`](index.js:6387) 新增了“未选中任务时的兜底重绘”分支：如果当前预设切换后尚未解析出选中任务，函数不再直接 `return` 让旧任务编辑区残留，而是会把当前预览对象中的提示词组、任务基础字段和重试次数重新写回 UI，确保提示词设置区域立即清空并切到新预设对应内容。
4. 这一步的目标是修复用户反馈的最终残余问题：即使数据库窗口已经打开，切换剧情推进全局预设 / 当前聊天预设后，提示词设置区也必须立即重绘，而不是只有关闭数据库窗口再重新打开时才看到变化。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 预设切换后的延迟重绘调度 | 5368-5455 | [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5368)、[`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5401) 改为调用新增的 [`schedulePlotSettingsUiRefresh_ACU()`](index.js:5441) |
| 提示词段落编辑器容器重取与作用域回退修正 | 6213-6228 | [`renderPlotPromptSegments_ACU()`](index.js:6213) 改为重取当前弹窗容器，并优先回退到当前编辑对象 |
| 任务编辑区无选中任务时的兜底重绘 | 6387-6397 | [`loadCurrentPlotTaskToUI_ACU()`](index.js:6387) 新增空选中任务分支，避免旧任务 UI 残留 |

## 2026-04-08 更新（第三步：运行态预设读取与编辑态预设读取彻底分离）

### 让剧情规划历史匹配、plot 结果写回与公开 API 始终读取“当前聊天真实运行预设”，不再误用编辑区当前预览预设

#### 功能描述
1. 新增 [`getCurrentRuntimePlotPresetName_ACU()`](index.js:5199)，把“当前聊天真实运行中的剧情推进预设”单独抽成独立 helper；它始终基于 [`resolveActivePlotPresetName_ACU()`](index.js:5143) 解析聊天覆写 / 跟随全局的真实结果，不受编辑区当前在预览全局预设还是聊天预设影响。
2. [`getPlotFromHistory_ACU()`](index.js:15288) 现在改为使用 [`getCurrentRuntimePlotPresetName_ACU()`](index.js:5199) 过滤历史 plot 数据。这样剧情规划历史检索会继续按当前聊天真实生效预设隔离，而不会因为你在 UI 里临时切到另一个全局预设预览，就错读别的预设历史结果。
3. [`savePlotToLatestMessage_ACU()`](index.js:15497) 写回 `qrf_plot_preset` 时，现已改为记录运行态预设名，而不是编辑区当前预览预设名；因此聊天记录里的 plot 标签不会再被“正在查看哪个预设”污染。
4. 公开 API [`getCurrentPlotPreset()`](index.js:7681) 也已切回返回当前聊天真实运行预设，而不是当前编辑区可编辑预设。这样外部脚本 / 扩展读取到的仍是当前聊天实际正在使用的剧情推进预设语义。
5. 经过这一步后，剧情推进内部正式形成两条独立语义链：
   - 编辑链：[`getCurrentEditablePlotPresetName_ACU()`](index.js:5189) / 当前编辑对象，用于决定 UI 此刻在编辑哪个预设；
   - 运行链：[`getCurrentRuntimePlotPresetName_ACU()`](index.js:5199)，用于剧情规划历史过滤、plot 写回与外部 API 查询。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 运行态预设名 helper | 5199-5201 | 新增 [`getCurrentRuntimePlotPresetName_ACU()`](index.js:5199)，专门返回当前聊天真实运行预设 |
| 历史 plot 过滤改回运行态语义 | 15288-15335 | [`getPlotFromHistory_ACU()`](index.js:15288) 改为按当前聊天真实生效预设检索历史 plot |
| plot 写回标签改回运行态语义 | 15497-15500 | [`savePlotToLatestMessage_ACU()`](index.js:15497) 记录 `qrf_plot_preset` 时改为使用运行态预设名 |
| 公开 API 返回值改回运行态语义 | 7681-7686 | [`getCurrentPlotPreset()`](index.js:7681) 改为返回当前聊天真实运行预设 |

## 2026-04-08 更新（第二步：编辑器改为绑定当前正在预览的剧情推进作用域）

### 让剧情推进编辑区在切换全局 / 当前聊天预设后，后续输入、任务编辑与保存都落到当前预览对象，而不是偷偷写回运行态配置

#### 功能描述
1. 新增 [`getActivePlotEditorSettings_ACU()`](index.js:5207) 与 [`setActivePlotEditorSettings_ACU()`](index.js:5212)，为剧情推进编辑器引入独立的“当前编辑对象”指针。这样编辑区现在可以明确区分：当前是在编辑全局预设预览，还是在编辑当前聊天预设 / 运行态配置。
2. [`loadPlotSettingsToUI_ACU()`](index.js:27427) 现在在每次加载剧情推进 UI 时，都会先把目标设置对象注册为当前编辑对象；因此切换下拉框后，任务列表、提示词组、最终注入指令、循环提示词和上下文规则，后续都会继续围绕这个对象编辑，不会因为监听器仍写死到 [`settings_ACU.plotSettings`](index.js:5303) 而把刚切换的预览内容覆盖掉。
3. 剧情推进编辑区的一整组输入事件已经改为优先写入当前编辑对象，包括：[`saveCurrentPlotTaskFromUI_ACU()`](index.js:6375)、[`renderLoopPromptsList_ACU()`](index.js:5569)、最终注入指令输入、速率参数、上下文提取 / 排除规则、循环提示词增删与任务列表切换。这样全局预设切到 A、当前聊天预设切到 B 后，界面上显示和后续编辑会继续保持在各自当前预览内容上。
4. [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5364) 现在在切换全局预设时，也会同步刷新“当前可编辑剧情推进预设”状态，确保后续“保存到全局”读取的是当前正在看的全局预设预览，而不是上一轮遗留的聊天作用域状态。
5. [`getCurrentPlotSettingsFromUI_ACU()`](index.js:27838) 改为从当前编辑对象克隆快照再回收 UI 内容，这样后续“保存到全局预设”或“保存到当前聊天预设”读取到的基础对象会与当前编辑区实际显示的内容保持一致。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 当前编辑对象状态 helper | 5207-5228 | 新增 [`getActivePlotEditorSettings_ACU()`](index.js:5207) 与 [`setActivePlotEditorSettings_ACU()`](index.js:5212)，集中维护剧情推进编辑区当前绑定的设置对象 |
| 全局预设切换时同步编辑作用域 | 5364-5390 | [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5364) 在切换全局预设时同步更新当前可编辑预设状态 |
| 剧情任务与循环提示词编辑链路 | 5569-5577, 6330-6465 | [`renderLoopPromptsList_ACU()`](index.js:5569)、[`saveCurrentPlotTaskFromUI_ACU()`](index.js:6375) 等编辑函数改为围绕当前编辑对象工作 |
| 剧情推进面板输入监听改绑当前编辑对象 | 26021-26240 | 最终注入指令、速率、规则、循环提示词与任务编辑监听改为通过当前编辑对象读写 |
| 剧情推进 UI 装载与保存快照基准 | 27427-27449, 27838-27888 | [`loadPlotSettingsToUI_ACU()`](index.js:27427) 与 [`getCurrentPlotSettingsFromUI_ACU()`](index.js:27838) 改为以当前编辑对象作为 UI 装载 / 保存基准 |

## 2026-04-08 更新（第一步：全局预设切换改为独立预览，避免直接覆盖当前聊天）

### 让剧情推进“全局预设 / 当前聊天预设”两个下拉框切换时都能即时回显提示词设置，同时把全局切换收敛为仅更新全局默认值

#### 功能描述
1. 新增 [`buildPlotSettingsPreviewFromPreset_ACU()`](index.js:5220)，专门根据目标剧情推进预设构建独立预览设置，用来给编辑区即时回显目标预设的剧情任务、提示词组、最终注入指令与循环配置，而不必先改写当前聊天真实运行中的 [`settings_ACU.plotSettings`](index.js:5299)。
2. 新增 [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5340)。现在切换“全局预设”时，只会更新 [`settings_ACU.plotSettings.lastUsedPresetName`](index.js:5303) 作为“新聊天默认继承”的全局当前值，并用预览对象刷新编辑区；不会再把当前聊天正在使用的剧情推进配置直接替换成所选全局预设。
3. [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5368) 的 UI 刷新链已调整为直接装载目标预设对应的预览内容；配合 [`loadPlotSettingsToUI_ACU()`](index.js:27427) 与 [`renderLoopPromptsList_ACU()`](index.js:5503) 的外部设置装载能力，当前聊天预设切换后，“提示词设置”区域会立即显示切换后的预设内容，不再需要重新打开数据库窗口才能看到。
4. 全局预设加载入口已统一走新的全局预览链，包括 [`loadPlotPresetToUI_ACU()`](index.js:27820) 与“恢复全局默认”按钮对应的 [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5340) 调用路径；这样全局卡片的行为与“只影响新聊天默认值”的作用域语义保持一致。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进预设预览构建与全局预设独立切换链 | 5220-5366 | 新增 [`buildPlotSettingsPreviewFromPreset_ACU()`](index.js:5220) 与 [`applyGlobalPlotPresetSelectionForEditor_ACU()`](index.js:5340)，把“全局预设选择”改成只更新全局当前值 + 预览刷新 |
| 当前聊天预设切换后的即时回显 | 5368-5407 | [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5368) 切换后直接回显目标预设内容，避免 UI 继续停留在切换前的提示词 |
| 剧情推进 UI 加载支持外部预览对象 | 5503-5511, 27427-27449 | [`renderLoopPromptsList_ACU()`](index.js:5503) 与 [`loadPlotSettingsToUI_ACU()`](index.js:27427) 允许使用外部设置对象重建界面 |
| 全局预设入口统一改走预览链 | 26575-26597, 27820-27831 | “恢复全局默认”与 [`loadPlotPresetToUI_ACU()`](index.js:27820) 统一改为只刷新全局预览，不直接覆盖当前聊天运行态 |

## 2026-04-08 更新（剧情推进预设切换后即时刷新当前聊天提示词设置）

### 修复剧情推进预设切换后，提示词设置区没有立刻跟随当前聊天实际生效配置刷新的问题

#### 功能描述
1. [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5319) 在切换**当前聊天**剧情推进预设且需要刷新 UI 时，不再只直接调用 [`loadPlotSettingsToUI_ACU()`](index.js:27378)，而是优先重新走一次 [`loadPresetAndCleanCharacterData_ACU()`](index.js:14756) 的聊天级恢复链；全局预设切换仍保持直接 UI 刷新。
2. **问题根因**：原来的刷新只会把当前内存中的 [`settings_ACU.plotSettings`](index.js:5319) 直接回填到 UI，但不会重新按“当前聊天覆写 / 跟随全局”的实际作用域重新装载配置；因此旧聊天在切换当前聊天预设后，提示词设置区可能继续显示切换前的聊天快照，直到重新打开数据库窗口时，初始化流程再次调用 [`loadPresetAndCleanCharacterData_ACU()`](index.js:14756) 才会恢复正确显示。
3. **修复方案**：在当前聊天预设切换完成且需要刷新 UI 时，异步触发 [`loadPresetAndCleanCharacterData_ACU()`](index.js:14756) 重新同步当前聊天实际生效的剧情推进配置；若这条恢复链异常，再回退到 [`loadPlotSettingsToUI_ACU()`](index.js:27378) 做基础 UI 重绘，避免界面卡死。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进预设切换后的即时刷新链 | 5319-5366 | [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5319) 在当前聊天预设切换后，改为优先调用 [`loadPresetAndCleanCharacterData_ACU()`](index.js:14756) 重新装载当前聊天实际生效配置，失败时回退到 [`loadPlotSettingsToUI_ACU()`](index.js:27378)；全局预设切换仍直接刷新 UI |

## 2026-04-08 更新（剧情推进编辑区改为跟随最后一次切换/导入的作用域）

### 让剧情推进编辑区始终显示最近一次切换或导入的全局 / 当前聊天预设内容，同时把两个保存按钮固定为保存到对应作用域

#### 功能描述
1. [`setCurrentEditablePlotPresetState_ACU()`](index.js:5179)、[`getCurrentEditablePlotPresetName_ACU()`](index.js:5189) 与 [`syncCurrentEditablePlotPresetState_ACU()`](index.js:5199) 新增了“当前可编辑剧情推进预设”状态：无论最后一次操作来自全局预设还是当前聊天预设，只要执行了切换或导入，编辑区都会立即显示该作用域对应的提示词与任务配置。
2. [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5319) 现在在全局切换 / 当前聊天切换时都会同步刷新这个“当前可编辑预设”状态；[`loadPresetAndCleanCharacterData_ACU()`](index.js:14756) 在打开聊天、恢复聊天覆写或兼容迁移旧绑定时，也会重新同步编辑区来源，避免切换聊天后编辑区来源丢失。
3. [`persistPlotPresetSelectionState_ACU()`](index.js:5254) 的全局保存链路不再自动清除当前聊天覆写，因此“保存到全局”只会更新全局预设本身，不会偷偷改掉当前聊天预设；只有在当前聊天卡片里执行切换、保存或导入时，当前聊天预设才会变成对应的推进预设。
4. [`getCurrentPlotPreset()`](index.js:7598)、[`getPlotFromHistory_ACU()`](index.js:15205) 与 [`savePlotToLatestMessage_ACU()`](index.js:15299) 已改为优先使用当前可编辑预设名，从而让 API 读取、剧情规划结果标记与历史检索都跟随当前编辑区正在操作的预设语义。
5. 剧情推进预设面板文案与按钮语义已同步调整：全局侧保存按钮固定为“保存到全局预设”，当前聊天侧保存按钮固定为“保存到当前聊天预设”；对应的提示文案、成功提示也已更新，避免再出现“按钮看似保存一边，实际却影响另一边”的混淆。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 当前可编辑剧情推进预设状态 helper | 5173-5205 | 新增 [`normalizePlotEditorScope_ACU()`](index.js:5173)、[`setCurrentEditablePlotPresetState_ACU()`](index.js:5179)、[`getCurrentEditablePlotPresetName_ACU()`](index.js:5189)、[`syncCurrentEditablePlotPresetState_ACU()`](index.js:5199) |
| 剧情推进预设切换时同步编辑区来源 | 5319-5349 | [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:5319) 在全局 / 当前聊天切换时同步记录当前可编辑预设 |
| 打开聊天 / 恢复旧绑定时同步编辑区来源 | 14756-14860 | [`loadPresetAndCleanCharacterData_ACU()`](index.js:14756) 在聊天覆写恢复、legacy 迁移、重新跟随全局时同步当前可编辑预设 |
| API 与剧情规划历史链改为读取当前可编辑预设 | 7598-7600, 15205-15275, 15299-15417 | [`getCurrentPlotPreset()`](index.js:7598)、[`getPlotFromHistory_ACU()`](index.js:15205)、[`savePlotToLatestMessage_ACU()`](index.js:15299) 改为跟随当前编辑区预设名 |
| 剧情推进预设面板按钮文案与作用域保存逻辑 | 24000-24027, 26210-26505, 27880-27904 | 全局 / 当前聊天预设卡片的按钮说明、保存提示与保存逻辑改为严格按各自作用域执行 |

## 2026-04-08 更新（修复旧聊天切换当前模板后仍回退显示全局预设）

### 让旧聊天在切换“当前聊天模板预设”后，指导表、数据库状态与可视化编辑器都跟随当前聊天实际选中的预设，而不是被全局预设重新覆盖

#### 功能描述
1. [`getChatSheetGuideDataForIsolationKey_ACU()`](index.js:10394) 现在会优先读取当前聊天模板作用域本身：若当前聊天是 `chat_override`，则直接从聊天快照恢复指导表；若当前聊天是 `preset_link`，则按当前聊天绑定的预设名重新解析对应全局预设/默认预设的模板结构。
2. 当当前聊天没有显式保存 `guideData` 时，[`getChatSheetGuideDataForIsolationKey_ACU()`](index.js:10394) 不再立刻回退到当前全局模板，而是先尝试从当前已经生效的 [`TABLE_TEMPLATE_ACU`](index.js:1843) 反推指导表结构。这样旧聊天切换“当前聊天模板预设”后，合并链、状态页与可视化编辑器都会看到当前聊天刚切换到的模板，而不是又被全局模板覆盖。
3. 因为 [`mergeAllIndependentTables_ACU()`](index.js:11254)、[`refreshMergedDataAndNotify_ACU()`](index.js:11512) 与可视化编辑器刷新链都依赖聊天指导表，所以这次修复后，旧聊天切换到任意当前聊天预设时，数据库状态摘要、表格结构过滤、表格编辑器顶部预设显示会统一跟随该聊天当前实际预设，即使全局当前选中的是另一个模板也不会串回去。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 当前聊天指导表解析链改为优先跟随聊天作用域 | 10394-10439 | [`getChatSheetGuideDataForIsolationKey_ACU()`](index.js:10394) 新增 `chat_override` / `preset_link` / 当前生效模板三级回退，避免旧聊天切换当前模板后仍被全局指导表覆盖 |

## 2026-04-08 更新（模板状态显示改为优先回显当前聊天预设）

### 让数据库状态与可视化编辑器优先显示当前聊天实际生效的模板预设，并把保存入口收敛到可视化编辑器

#### 功能描述
1. [`getActiveTemplatePresetMeta_ACU()`](index.js:1417) 统一汇总当前聊天实际生效的模板预设名称、显示名称、作用域来源与作用域标签；当当前聊天存在 `chat_override` 或 `preset_link` 时优先返回当前聊天预设，否则才回退到全局预设。
2. [`updateCardUpdateStatusDisplay_ACU()`](index.js:27819) 的数据库状态摘要现在会额外显示“当前生效模板预设”，并标记它来自“当前聊天”还是“全局”，避免状态栏继续误把所有聊天都显示成当前全局预设。
3. 可视化编辑器新增 [`updateVisualizerTemplatePresetIndicator_ACU()`](index.js:33361) 与顶部预设指示文案；[`openNewVisualizer_ACU()`](index.js:33368) 和刷新函数会在打开/切换聊天/刷新数据后同步回显当前实际模板预设，因此编辑器顶部看到的也会是当前聊天真实生效的预设，而不是一律显示全局。
4. 数据管理界面的模板预设区已移除外部“保存”类入口：全局侧不再提供直接覆盖保存按钮，当前聊天侧也不再提供面板内保存到当前聊天 / 保存到全局；外部面板仅保留导入 / 导出 / 另存为 / 重命名 / 删除这类预设管理操作，真正的“保存到当前聊天 / 保存到全局”统一收敛到可视化编辑器顶部按钮。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 当前实际模板预设元信息 helper | 1417-1432 | 新增 [`getActiveTemplatePresetMeta_ACU()`](index.js:1417)，统一解析当前聊天优先的模板预设显示元数据 |
| 数据库状态摘要补充当前生效预设 | 28026-28031 | [`updateCardUpdateStatusDisplay_ACU()`](index.js:27819) 现在会显示当前实际模板预设及其来源作用域 |
| 数据管理界面模板预设按钮精简 | 23645-23708 | 模板预设区移除外部保存按钮，并把说明文案改为引导用户到可视化编辑器执行保存 |
| 可视化编辑器顶部当前预设指示器 | 33353-33366, 33374-33445 | 刷新函数与 [`openNewVisualizer_ACU()`](index.js:33368) 新增当前实际模板预设回显，确保编辑器始终显示聊天优先的有效预设 |

## 2026-04-07 更新（表格模板预设改为“聊天专属预设列表 + 预设引用”）

### 让每个聊天在未本地保存时沿用上次选中的预设引用；一旦保存或导入，则沉淀为该聊天自己的模板预设列表

#### 功能描述
1. [`resolveActiveTemplatePresetName_ACU()`](index.js:1408)、[`persistTemplateScopeSelectionState_ACU()`](index.js:1860) 与 [`applyTemplateSnapshotToScope_ACU()`](index.js:1815) 把当前聊天模板作用域从单纯“跟随全局 / 聊天快照”扩展为 `inherit_global`、`preset_link`、`chat_override` 三种语义。这样聊天记录在未本地保存前，会继续沿用自己上次显式选中的预设；只有在当前聊天里执行保存或导入后，才会沉淀为本地模板快照。
2. [`listChatTemplatePresetEntries_ACU()`](index.js:9631) 与 [`upsertChatTemplatePresetEntry_ACU()`](index.js:9655) 现在把当前聊天的本地模板预设按预设名 slot 维护成可覆盖的列表；同名预设会直接更新，不再每次切换都额外追加一份历史快照。
3. [`loadTemplatePresetSelect_ACU()`](index.js:1442) 会在打开/切换聊天时自动重建“当前聊天模板”下拉框：除了全局预设外，还会追加当前聊天独有的本地预设，并在状态说明里明确区分“聊天专属预设快照”“仅记录预设引用”“继续跟随当前全局”三种来源语义。
4. [`setChatSheetGuideDataForIsolationKey_ACU()`](index.js:10401) 在指导表更新时，若当前聊天处于 `chat_override` 或 `preset_link`，会同步更新当前聊天对应的模板预设条目，避免用户通过指导表或可视化编辑器改完表结构后，聊天预设列表里的同名快照仍停留在旧版本。
5. 当前聊天模板面板的“保存到当前聊天 / 导入到当前聊天 / 保存到全局”与可视化编辑器的“保存到当前聊天 / 保存到全局”现在统一到同一套语义：保存到当前聊天会覆盖或新增当前聊天预设；保存到全局会覆盖或新增全局预设，但不会自动清除当前聊天已保存的本地预设；API 侧复用同一模板作用域写入链，因此载入预设时也会自动受益。
6. [`SillyTavern_API_ACU.eventSource.on()`](index.js:20283) 的聊天切换延迟刷新分支现在会在重新应用聊天模板作用域后再刷新 [`loadTemplatePresetSelect_ACU()`](index.js:1442)，确保用户每次点开聊天记录时，下拉菜单和当前实际模板预设都按该聊天自己的状态即时回显。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 当前聊天模板预设解析与状态展示 | 1408-1599 | [`resolveActiveTemplatePresetName_ACU()`](index.js:1408) 与 [`loadTemplatePresetSelect_ACU()`](index.js:1442) 改为支持 `preset_link`、聊天本地预设列表和新的状态说明文案 |
| 模板作用域写入主链 | 1815-1912 | [`applyTemplateSnapshotToScope_ACU()`](index.js:1815) / [`persistTemplateScopeSelectionState_ACU()`](index.js:1860) 统一支持 `inherit_global`、`preset_link`、`chat_override` 三种作用域模式 |
| 当前聊天本地模板预设列表 helper | 9631-9688 | [`listChatTemplatePresetEntries_ACU()`](index.js:9631)、[`findChatTemplatePresetEntry_ACU()`](index.js:9651)、[`upsertChatTemplatePresetEntry_ACU()`](index.js:9655) 改为按预设名 slot 维护聊天专属模板预设 |
| 指导表写入时同步聊天预设列表 | 10401-10457 | [`setChatSheetGuideDataForIsolationKey_ACU()`](index.js:10401) 在 `chat_override` / `preset_link` 模式下同步更新聊天模板预设条目 |
| 聊天切换后的模板下拉刷新 | 20400-20417 | [`SillyTavern_API_ACU.eventSource.on()`](index.js:20283) 的延迟刷新分支在恢复聊天模板作用域后刷新模板预设 UI |
| 模板预设面板文案与按钮语义 | 23644-23699 | 当前聊天模板卡片按钮改为“保存到当前聊天 / 导入到当前聊天 / 导出当前聊天 / 保存到全局”，并更新全局说明文案 |
| 当前聊天模板面板交互逻辑 | 25373-25683 | [`persistCurrentTemplateChatSnapshot_ACU()`](index.js:25373) 以及当前聊天模板下拉、导入、保存到全局事件改为“按预设名覆盖/新增当前聊天列表或全局列表” |
| 可视化编辑器按钮与保存语义 | 33376-33377, 34387-34595, 34716-34722 | [`saveVisualizerChanges_ACU()`](index.js:34387) 与顶部按钮文案同步改为“保存到当前聊天 / 保存到全局”，并在保存后刷新模板预设 UI |

## 2026-04-07 更新（修复旧聊天切换模板后旧模板数据无法找回的问题）

### 为当前聊天模板切换补上历史快照归档与恢复入口，避免旧聊天模板数据一旦切换就彻底丢失

#### 功能描述
1. [`persistTemplateScopeSelectionState_ACU()`](index.js:1821) 在写入新的当前聊天模板快照前，会先把旧的聊天级模板快照归档；[`clearCurrentChatTemplateScopeState_ACU()`](index.js:9802) 在清除聊天覆写时也会先归档当前模板，这样旧聊天从历史模板切到其它模板时，原模板结构和对应指导表不会再被直接覆盖丢失。
2. [`buildChatTemplateArchiveFingerprint_ACU()`](index.js:9560)、[`getChatTemplateArchiveEntries_ACU()`](index.js:9601)、[`restoreChatTemplateArchiveEntry_ACU()`](index.js:9701) 新增了一整套聊天模板历史归档能力：每个聊天、每个隔离标签会保留最多 8 份历史模板快照，并携带预设名、模板正文、guideData、来源语义与归档时间，供后续恢复。
3. [`loadTemplatePresetSelect_ACU()`](index.js:1442) 与 [`populateTemplatePresetSelectOptions_ACU()`](index.js:1417) 现在会把这些“聊天历史快照”作为额外选项挂到“当前聊天模板”下拉框里，同时在状态说明中显示当前聊天仍有多少份可恢复的历史模板快照。
4. 当前聊天模板下拉事件 [`$templateChatPresetSelect_ACU`](index.js:25208) 现在会识别“聊天历史快照”选项并调用 [`restoreChatTemplateArchiveEntry_ACU()`](index.js:9701) 恢复；恢复时会把当前模板再次归档，因此用户可以在多个旧模板之间来回切换，不会出现“切一次就再也找不回原模板数据”的情况。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 聊天模板切换前自动归档旧快照 | 1821-1849, 9802-9817 | [`persistTemplateScopeSelectionState_ACU()`](index.js:1821) 与 [`clearCurrentChatTemplateScopeState_ACU()`](index.js:9802) 在覆盖/清除当前聊天模板前先归档旧模板快照 |
| 聊天模板历史快照归档与恢复 helper | 9373-9377, 9560-9723 | 新增归档常量，以及 [`buildChatTemplateArchiveFingerprint_ACU()`](index.js:9560)、[`getChatTemplateArchiveEntries_ACU()`](index.js:9601)、[`restoreChatTemplateArchiveEntry_ACU()`](index.js:9701) 等 helper |
| 当前聊天模板下拉框展示历史快照 | 1417-1544 | [`populateTemplatePresetSelectOptions_ACU()`](index.js:1417) / [`loadTemplatePresetSelect_ACU()`](index.js:1442) 为当前聊天模板选择器追加历史快照选项与可恢复数量说明 |
| 当前聊天模板下拉框支持恢复历史快照 | 25208-25240 | 当前聊天模板选择事件会识别历史快照选项并执行恢复，而不是按普通预设切换处理 |

## 2026-04-07 更新（修复旧聊天打开时被当前全局模板污染的问题）

### 让旧聊天优先恢复自己的历史模板快照，而不是把旧表格数据套进当前全局模板

#### 功能描述
1. [`getHistoricalTemplateGuideDataForIsolationKey_ACU()`](index.js:9767) 现在会直接扫描旧聊天消息里的历史表格数据，优先从旧对话已经保存过的表结构反推出聊天自己的模板快照，并保留原有表顺序，避免恢复时被当前全局模板重排。
2. [`migrateLegacyTemplateScopeForCurrentChat_ACU()`](index.js:9857) 的 legacy 迁移优先级已调整为“显式旧版聊天冻结模板 → 旧对话实际历史模板快照 → 旧版表头冻结模板”，这样旧聊天首次打开时会优先冻结自己的真实模板结构，而不是沿用当前 profile 的全局模板名和模板内容。
3. [`getChatSheetGuideDataForIsolationKey_ACU()`](index.js:9935) 现在会先读取当前聊天快照或 legacy 迁移结果，只有在聊天侧完全没有可用模板结构时才回退到全局模板，避免旧聊天状态页把历史表格数据错误套进当前全局模板。
4. 模板状态区的 [`loadTemplatePresetSelect_ACU()`](index.js:1496) 已补充“旧对话历史模板快照（已迁移）”与来源说明，用户重新打开旧聊天时，可以在状态页直接看到这是从旧对话历史结构恢复出来的模板，而不是误以为当前聊天仍在跟随全局。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 旧聊天历史模板结构抽取与 legacy 名称补充 | 9767-9839 | [`getHistoricalTemplateGuideDataForIsolationKey_ACU()`](index.js:9767) 会从历史消息里的旧表格数据重建 guideData，并由 [`getLegacyTemplateSnapshotLabel_ACU()`](index.js:9835) 统一生成 legacy 快照名称 |
| legacy 模板迁移优先级调整 | 9857-9909 | [`migrateLegacyTemplateScopeForCurrentChat_ACU()`](index.js:9857) 优先冻结旧聊天自己的模板结构，再决定是否回退到表头冻结模板 |
| 聊天级模板读取链收口 | 9935-9955 | [`getChatSheetGuideDataForIsolationKey_ACU()`](index.js:9935) 先读聊天快照 / legacy 迁移结果，最后才回退全局模板 |
| 模板状态页历史快照展示 | 1496-1525 | [`loadTemplatePresetSelect_ACU()`](index.js:1496) 新增“旧对话历史模板快照（已迁移）”状态与来源说明 |

## 2026-04-07 更新（补齐 initGameSession 模板注入链的预设命名与聊天快照同步）

### 修复角色卡开场页 / opening-regex 一类 `initGameSession()` 模板注入旁路，确保也会生成模板预设名并写回当前聊天模板快照

#### 功能描述
1. 在 [initGameSession()](index.js:7774) 的模板注入阶段新增 `templatePresetName` 推导，支持优先读取 `options.templatePresetName`，否则回退到 `characterData.name` / `characterData.data.name`，再继续复用统一的 [deriveTemplatePresetNameForImport_ACU()](index.js:1355) 命名逻辑。这样像角色卡开场页、[`opening-regex.html`](opening-regex.html) 这类直接调用初始化接口注入模板的场景，也不会再绕过模板预设命名。
2. [fillFirstLayerWithTemplateData_ACU()](index.js:11268) 现在会在把完整模板数据写入第一楼前，先根据 `presetName` 生成标准化模板预设名，并在有可保存模板正文时调用 [upsertTemplatePreset_ACU()](index.js:1605) 注册到模板预设库。
3. 同一条 [fillFirstLayerWithTemplateData_ACU()](index.js:11268) 链路里，指导表回写已改为显式传入 `syncTemplateScope: true`、`templateSource`、`presetName`、`source`，保证“首楼完整模板数据”“聊天指导表”“当前聊天模板快照”三者同步落盘，避免只注入了表格正文却没有聊天级模板状态。
4. 旧的回退链 [overwriteChatSheetGuideFromTemplate_ACU()](index.js:10145) 也同步支持 `presetName` / `registerPreset` / `syncTemplateScope`，因此即使首楼填充失败，仍会写入模板预设库，并把当前聊天模板快照标记为对应预设名。
5. 已清理 [API_DOCUMENTATION.md](API_DOCUMENTATION.md:664) 中此前残留的 `+` markdown 噪音，并补充说明：通过 [initGameSession()](index.js:7774) 且开启 `injectTemplate` 注入模板时，同样复用“显式名称 → 文件名/角色卡名 → 全局兜底”的命名回退策略；示例中也补上了 `templatePresetName` 的写法。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 游戏初始化模板注入命名收口 | 7774-7829 | [initGameSession()](index.js:7774) 为 `injectTemplate` 分支补上 `templatePresetName` 推导，并把名称传入首楼填充与指导表回退链 |
| 指导表回退链补齐预设注册与聊天快照同步 | 10145-10174 | [overwriteChatSheetGuideFromTemplate_ACU()](index.js:10145) 现在支持注册模板预设、同步当前聊天模板快照并携带来源信息 |
| 首楼完整模板注入链补齐预设注册与聊天快照同步 | 11268-11349 | [fillFirstLayerWithTemplateData_ACU()](index.js:11268) 在写入第一楼时同步注册模板预设，并把 `presetName` / `templateSource` 写回当前聊天模板状态 |
| 模板导入命名文档与示例补充 | 664-683, 1061-1083 | [API_DOCUMENTATION.md](API_DOCUMENTATION.md:664) 说明 `initGameSession()` 也复用命名回退，[示例 4](API_DOCUMENTATION.md:1061) 增加 `templatePresetName` 写法 |

## 2026-04-07 更新（无文件名模板导入时改用角色卡名生成预设名）

### 补齐模板导入命名策略：当没有文件名且调用方未显式传入名称时，直接使用当前角色卡卡名

#### 功能描述
1. 在 [index.js](index.js:1327) 新增 [getCurrentCharacterCardName_ACU()](index.js:1336) 与 [deriveTemplatePresetNameForImport_ACU()](index.js:1355)，统一模板导入场景的预设命名来源。
2. 新的命名优先级调整为：
   - 调用方显式传入的 `presetName`；
   - 导入文件名；
   - 当前角色卡卡名；
   - 仅全局导入场景下，最后才回退系统生成的时间戳名称。
3. [importTemplateFromData()](index.js:7542) 现在在没有显式 `presetName` 时，会自动尝试读取当前角色卡卡名作为模板预设名；因此像角色卡开场页这类“直接传模板对象、没有文件名”的注入方式，也能生成对应的表格模板预设名。
4. [importTableTemplate_ACU()](index.js:31284) 的文件导入链路也同步复用了同一套命名 helper，确保 UI 文件导入与前端/API 直接导入的命名规则完全一致。
5. 已在 [API_DOCUMENTATION.md](API_DOCUMENTATION.md:664) 中补充模板导入的命名说明，明确“无文件名时会回退使用当前角色卡卡名”。
6. 已再次通过 `node --check .\index.js` 语法检查。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 模板导入命名 helper | 1327-1364 | [index.js](index.js:1327) 新增角色卡名获取与模板导入预设名推导逻辑 |
| 前端/API 直接导入模板的命名回退 | 7542-7549 | [importTemplateFromData()](index.js:7542) 在无显式名称时改为尝试使用当前角色卡卡名 |
| 文件导入模板的命名回退 | 31284-31290 | [importTableTemplate_ACU()](index.js:31284) 的文件导入链路复用统一命名 helper |
| 模板导入文档补充 | 664-679 | [API_DOCUMENTATION.md](API_DOCUMENTATION.md:664) 记录模板导入时“文件名 → 角色卡名 → 全局兜底名”的命名顺序 |

## 2026-04-07 更新（模板当前聊天注入文档补齐与公开端口审计）

### 审查前端“导入到当前聊天”链路，并补齐模板双作用域 API 文档说明

#### 功能描述
1. 已确认当前聊天模板文件导入按钮的前端链路本身已经走统一作用域入口：在 [当前聊天导入按钮事件](index.js:24990) 中，文件内容会先交给 [parseImportedTemplateData_ACU()](index.js:1653) 校验，再通过 [applyTemplateSnapshotToScope_ACU()](index.js:1715) 以 `scope: 'chat'` 应用到当前聊天，所以“通过前端将表格模板注入到当前聊天”的实现本身已完成更新，缺口主要在公开文档未同步。
2. 本轮补查了模板相关公开端口，重点覆盖：
   - [importTemplate()](index.js:6648) / [exportTemplate()](index.js:6649) / [resetTemplate()](index.js:6650) 的 `options.scope` 语义；
   - [switchTemplatePreset()](index.js:6668) 与 [injectTemplatePresetToCurrentChat()](index.js:6702) 的全局 / 当前聊天切换说明；
   - [importTemplateFromData()](index.js:7515) 的 `scope` 与 `presetName` 行为；
   - [getTableTemplate()](index.js:7694) 返回“当前运行态实际模板”而不是单纯全局模板的语义。
3. 已在 [API_DOCUMENTATION.md](API_DOCUMENTATION.md:543) 中补齐模板双作用域文档：
   - 为 `importTemplate(options)`、`exportTemplate(options)`、`resetTemplate(options)` 增加 `options.scope` 参数说明；
   - 新增 `getTemplatePresetNames()`、`switchTemplatePreset(presetName, options)`、`injectTemplatePresetToCurrentChat(presetName)` 的文档与示例；
   - 明确 [importTemplateFromData(templateData, options)](API_DOCUMENTATION.md:664) 支持导入到全局或当前聊天；
   - 更新“从外部导入模板和预设”示例，使其展示“把模板注入到当前聊天”的正确写法；
   - 在版本历史中追加本轮模板双作用域文档补齐说明。
4. 本轮未改动运行时代码逻辑，主要是补齐文档与公开端口说明，避免调用方误以为“导入到当前聊天”的前端/API 能力尚未接入新作用域模型。

#### 修改位置

| 文件 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 前端“导入到当前聊天”实现链路复核 | 24990-25020 | [index.js](index.js:24990) 中当前聊天模板文件导入已复用 [parseImportedTemplateData_ACU()](index.js:1653) 与 [applyTemplateSnapshotToScope_ACU()](index.js:1715) 的统一 chat scope 入口 |
| 模板相关公开端口语义复核 | 6648-6704, 7515-7559, 7694-7702, 31257-31316 | 复核 [index.js](index.js:6648) 中模板 API 与文件导入端口的作用域语义，确认公开入口与当前聊天注入模型一致 |
| 模板管理 API 文档补齐 | 543-710 | [API_DOCUMENTATION.md](API_DOCUMENTATION.md:543) 补充模板导入/导出/重置的 `scope` 参数，以及模板预设切换与当前聊天注入端口说明 |
| 外部导入示例改为当前聊天注入写法 | 1054-1072 | [API_DOCUMENTATION.md](API_DOCUMENTATION.md:1054) 将示例中的模板导入改为 `scope: 'chat'`，示范正确的当前聊天注入方式 |
| 版本历史补记模板双作用域文档更新 | 1501-1510 | [API_DOCUMENTATION.md](API_DOCUMENTATION.md:1501) 新增 `1.5` 版本记录，说明本轮文档补齐的 API 范围 |

## 2026-04-07 更新（聊天模板编号回写与聊天导入链统一收口）

### 继续处理边界场景，避免聊天模板编号修复误写全局，以及聊天导入链绕过统一作用域入口

#### 功能描述
1. [getTemplateSheetKeys_ACU()](index.js:9212) 在发现模板顺序编号缺失时，不再无条件把修复后的模板回写到当前 profile。现在会先判断当前运行态是否为聊天级模板覆写：
   - 如果当前是聊天覆写，就把修复后的模板与指导表回写到当前聊天 scoped state；
   - 如果当前并非聊天覆写，才回写到全局 profile 模板。
   这样可以避免用户只是打开一个聊天专属模板时，因为顺序编号补齐而把聊天专属模板污染到全局模板存储里。
2. 当前聊天模板文件导入按钮的实现，改为直接复用 [parseImportedTemplateData_ACU()](index.js:1653) 与 [applyTemplateSnapshotToScope_ACU()](index.js:1715) 的统一作用域链，而不再手动拼接 `sanitizeTemplateSnapshotForChat()` + `persistTemplateScopeSelectionState_ACU()`。这样聊天导入、API 导入、UI 导入三条链路在校验、清洗、持久化与 UI 刷新语义上保持一致。
3. 已再次通过 `node --check .\\index.js` 语法检查。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 模板编号补齐时区分全局/聊天回写目标 | 9219-9250 | [getTemplateSheetKeys_ACU()](index.js:9212) 发现缺失顺序编号时，聊天覆写回写到当前聊天 scoped state，全局模板才回写 profile 存储 |
| 当前聊天模板文件导入改走统一作用域入口 | 24978-25003 | 聊天导入文件时改为调用 [parseImportedTemplateData_ACU()](index.js:1653) 与 [applyTemplateSnapshotToScope_ACU()](index.js:1715)，统一聊天导入语义 |

## 2026-04-07 更新（模板全局应用链与聊天切换延迟刷新收口）

### 继续收口“保存至通用模板”的全局语义，并避免聊天切换延迟任务回写旧状态

#### 功能描述
1. [importCombinedSettings_ACU()](index.js:30730) 在导入合并配置中的模板时，改为直接调用 [applyTemplateSnapshotToScope_ACU()](index.js:1715) 并以 `scope: 'global'` 应用全局模板，不再手动直写当前模板字符串。这样全局模板导入会自动复用“保存 profile 模板、清除当前聊天覆写、刷新双卡片 UI”的统一链路。
2. 可视化编辑器保存流程中，只有普通保存才会调用 [setChatSheetGuideDataForIsolationKey_ACU()](index.js:9791) 把结构修改沉淀为当前聊天模板快照；“保存至通用模板”现在直接走 [applyTemplateSnapshotToScope_ACU()](index.js:1715) 的全局模板链路，不再提前写入聊天指导表，避免用户明明是改全局模板，却在当前聊天残留一份不必要的聊天覆写。
3. [CHAT_CHANGED](index.js:19626) 的延迟刷新分支不再二次执行 [resetScriptStateForNewChat_ACU()](index.js:17044)，而是先校验延迟任务对应的聊天仍然是当前聊天，再只补做模板作用域恢复与 [refreshMergedDataAndNotify_ACU()](index.js:10858)。这样能降低快速切换聊天时旧定时任务把新聊天状态再次覆盖的竞态。
4. 已再次通过 `node --check .\\index.js` 语法检查。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 合并配置导入模板改走统一全局作用域应用链 | 30730-30745 | [importCombinedSettings_ACU()](index.js:30730) 改为调用 [applyTemplateSnapshotToScope_ACU()](index.js:1715) 应用全局模板，避免手动直写模板字符串后遗漏清理聊天覆写 |
| 聊天切换延迟刷新防串台 | 19738-19762 | [CHAT_CHANGED](index.js:19626) 的延迟刷新任务先校验当前聊天，再补做模板作用域恢复和统一刷新，避免旧定时任务覆盖新聊天状态 |
| 可视化编辑器普通保存只沉淀当前聊天模板快照 | 33739-33769 | 普通保存时继续通过 [setChatSheetGuideDataForIsolationKey_ACU()](index.js:9791) 写入聊天 scoped template / guideData；“保存至通用模板”不再提前写聊天指导表 |
| 可视化编辑器保存至通用模板改走统一全局作用域应用链 | 33878-33891 | 可视化编辑器保存全局模板时改为调用 [applyTemplateSnapshotToScope_ACU()](index.js:1715)，并让当前聊天重新跟随全局模板 |

## 2026-04-07 更新（表格模板来源语义、聊天恢复链与指导表同步补强）

### 继续把当前聊天模板的来源说明、恢复时机与 seedRows 读取收敛到聊天级模板快照

#### 功能描述
1. [loadTemplatePresetSelect_ACU()](index.js:1457) 现在会在“当前聊天状态 / 来源说明”中区分旧版聊天冻结模板、旧版表头冻结模板与普通聊天覆写，方便用户判断当前聊天到底是在跟随全局、沿用旧冻结模板，还是已经形成新的聊天级快照。
2. [setChatSheetGuideDataForIsolationKey_ACU()](index.js:9786) 现在不仅会在 `syncTemplateScope=true` 时同步聊天模板 scoped state；当当前聊天本来就已经存在模板覆写时，后续指导表写入也会沿用现有聊天覆写的 `presetName`、`source`、来源全局信息与模板正文，把最新 `guideData` 一并回写到聊天模板快照，避免“指导表更新了，但聊天模板元数据还是旧的”这种漂移。
3. [migrateLegacyTemplateScopeForCurrentChat_ACU()](index.js:9696) 迁移旧版聊天指导表时，开始识别 legacy slot 上新增记录的 `templateScopeMode`；只有明确标记为聊天覆写的旧槽位才会迁移成 [legacy_frozen](index.js:1460) 语义，避免那些本质上只是“跟随全局”的旧指导表被误冻结成聊天独立模板。
4. [pickAnyGuideSeedRowsSlot_ACU()](index.js:9875) 现在优先从聊天 scoped template slots 中寻找最近一次聊天覆写的 `seedRows`，只有 scoped 状态里找不到时才回退旧指导表容器，降低旧真相源继续反客为主的概率。
4. [resetScriptStateForNewChat_ACU()](index.js:17033) 在切换聊天时会于重新加载设置、聊天消息之后立即调用当前聊天模板恢复；聊天切换事件与初始化延迟恢复链路也已接上这条恢复路径，进一步减少打开聊天后 UI 显示和实际运行模板不一致的竞态。
5. 可视化编辑器保存流程在普通保存时，会同步把整理后的指导表写回当前聊天模板 scoped state；而“保存到模板”仍保持全局模板语义，避免用户只是改当前聊天结构时意外污染全局模板。
6. 已通过 `node --check .\index.js` 对 [index.js](index.js) 做语法检查，结果通过。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 模板双卡片状态与 legacy 来源文案 | 1457-1495 | 在 [loadTemplatePresetSelect_ACU()](index.js:1457) 中补齐当前聊天状态、来源语义、来源全局版本与更新时间说明 |
| legacy 指导表迁移时识别明确作用域 | 9719-9730 | [migrateLegacyTemplateScopeForCurrentChat_ACU()](index.js:9696) 只把明确标记为聊天覆写的 legacy 槽位迁移为 [legacy_frozen](index.js:1460) 语义 |
| 指导表写入时同步聊天模板快照 | 9786-9838 | [setChatSheetGuideDataForIsolationKey_ACU()](index.js:9786) 支持在显式同步或当前聊天已存在模板覆写时，把 guideData 与聊天模板 scoped state 一并更新，并把 legacy guide slot 的 `templateScopeMode` 一并写回 |
| seedRows 优先从聊天模板 scoped state 回填 | 9875-9912 | [pickAnyGuideSeedRowsSlot_ACU()](index.js:9875) 先读 scoped template slots，再回退 legacy guide 容器 |
| 聊天切换与初始化后的模板恢复 | 17033-17075, 19604-19623, 19981-19985 | 在 [resetScriptStateForNewChat_ACU()](index.js:17033) 及聊天切换/初始化链路中继续接入当前聊天模板恢复 |
| 可视化编辑器普通保存同步聊天模板作用域 | 33713-33735 | 可视化编辑器保存指导表时，普通保存同步更新当前聊天模板 scoped state，“保存到模板”则保留全局模板语义 |

## 2026-04-07 更新（表格模板 API 作用域收口与导入导出重构）

### 让表格模板的 API、导入导出、恢复默认统一支持“全局 / 当前聊天”双作用域

#### 功能描述
1. 新增 [`normalizeTemplateOperationScope_ACU()`](index.js:1636)、[`parseImportedTemplateData_ACU()`](index.js:1640)、[`applyTemplateSnapshotToScope_ACU()`](index.js:1702)，把模板导入数据校验、模板快照规范化，以及“应用到全局 / 应用到当前聊天”三条链路统一到同一套底层入口。
2. [`switchTemplatePreset()`](index.js:6655) 现在支持通过 `options.scope` 显式区分“切换全局模板预设”和“仅切换当前聊天模板预设”；同时新增 [`injectTemplatePresetToCurrentChat()`](index.js:6689) 作为当前聊天级注入别名，避免 API 调用方再手动拼接作用域语义。
3. [`importTemplateFromData()`](index.js:7502) 现在同样支持 `scope` 参数：
   - `scope: 'global'` 时会更新当前 profile 的全局模板，并可选把导入内容写入全局模板预设库；
   - `scope: 'chat'` 时只会把模板快照写入当前聊天元数据，使 API 导入模板也能自动继承当前聊天的独立模板状态。
4. [`exportTableTemplate_ACU()`](index.js:30919)、[`resetTableTemplate_ACU()`](index.js:31146)、[`importTableTemplate_ACU()`](index.js:31184) 现已统一支持作用域参数；全局操作会清除当前聊天覆写并重新跟随全局，当前聊天操作则只影响聊天级模板快照，不再误污染全局模板。
5. [`resetAllToDefaults_ACU()`](index.js:31018) 已改为复用 [`resetTableTemplate_ACU()`](index.js:31146) 的全局作用域链路，避免“恢复全部默认值”和“恢复默认模板”各自维护一套模板重置逻辑。
6. 已通过 `node --check .\index.js` 对 [`index.js`](index.js) 做语法检查，结果通过。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 表格模板作用域统一辅助入口 | 1636-1739 | 新增 [`normalizeTemplateOperationScope_ACU()`](index.js:1636)、[`parseImportedTemplateData_ACU()`](index.js:1640)、[`applyTemplateSnapshotToScope_ACU()`](index.js:1702)，统一模板作用域解析、导入校验与模板快照应用 |
| 模板预设 API 的全局 / 当前聊天语义 | 6655-6696 | 在 [`switchTemplatePreset()`](index.js:6655) 中加入 `scope` 语义，并新增 [`injectTemplatePresetToCurrentChat()`](index.js:6689) 作为当前聊天级入口 |
| API 直接导入模板的作用域化 | 7502-7552 | [`importTemplateFromData()`](index.js:7502) 支持将模板导入到全局或当前聊天，并复用统一模板快照应用链路 |
| 模板导出、恢复全部默认、恢复默认模板、文件导入 | 30919-31263 | [`exportTableTemplate_ACU()`](index.js:30919)、[`resetAllToDefaults_ACU()`](index.js:31018)、[`resetTableTemplate_ACU()`](index.js:31146)、[`importTableTemplate_ACU()`](index.js:31184) 全部改为作用域感知实现 |

## 2026-04-07 更新（剧情推进旧绑定迁移与聊天切换恢复收口）

### 将旧 `plotPresetBindings` 按需迁移到聊天元数据，并确保切换聊天时先完成剧情推进恢复

#### 功能描述
1. 在 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13349) 中补齐“新聊天元数据优先、旧绑定按需迁移、最终回退全局或默认”的完整收口逻辑。
2. 当当前聊天已经存在聊天级剧情推进快照时，会直接以聊天元数据为准，并清除遗留的旧 [`plotPresetBindings`](index.js:4592) 项，避免新旧两套作用域来源并存。
3. 如果聊天元数据不存在但旧绑定还在：
   - 旧绑定本质上只是“继承全局”时，直接清理旧绑定；
   - 旧绑定与当前全局不同且仍可解析时，会在首次进入该聊天时迁移为聊天级完整快照，并写回聊天记录；
   - 旧绑定已失效时，则清理旧绑定并回退到当前全局预设或默认预设。
4. 当全局当前预设名已经失效时，现在会自动把 [`settings_ACU.plotSettings.lastUsedPresetName`](index.js:13374) 回退为空，防止新聊天继续继承一个不存在的全局预设名。
5. [`CHAT_CHANGED`](index.js:18920) 事件里对 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13349) 改为 `await`，减少聊天切换后 UI、世界书刷新与剧情推进恢复之间的竞态。
6. 已通过 `node --check .\index.js` 对 [`index.js`](index.js) 做语法检查，结果通过。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进旧绑定迁移、失效兜底与继承收口 | 13349-13457 | 在 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13349) 中统一处理聊天快照优先、旧 [`plotPresetBindings`](index.js:4592) 清理/迁移、失效全局预设回退，以及新聊天跟随全局的最终加载逻辑 |
| 聊天切换时等待剧情推进恢复完成 | 18979-18979 | 在 [`CHAT_CHANGED`](index.js:18920) 回调里将 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13349) 改为 `await`，避免切换聊天时后续刷新链路早于剧情推进恢复执行 |

## 2026-04-07 更新（剧情推进双卡片与聊天级快照管理）

### 将剧情推进预设拆分为“全局正在使用 / 当前聊天正在使用”，并让聊天级快照真正独立于全局库

#### 功能描述
1. 将剧情推进预设管理区拆成两个卡片：**全局正在使用**与**当前聊天正在使用**。前者负责维护全局当前值与全局预设库，后者负责维护当前聊天实际生效的剧情推进快照。
2. 当前聊天卡片新增“保存当前聊天快照 / 导入到当前聊天 / 导出当前聊天快照 / 清除当前聊天覆写”四个入口；用户未做本地保存时，当前聊天会继续跟随全局剧情推进配置。
3. 当前聊天的保存与导入不再依赖全局同名预设覆盖，而是直接把完整剧情推进快照写入聊天级作用域元数据；因此每个聊天都能继承上一次自己使用过的剧情推进配置，互不污染。
4. 当用户在全局卡片执行切换、覆盖保存、另存为、导入到全局预设库、恢复全局默认等操作时，会同步清除当前聊天覆写，使当前聊天重新回到“跟随全局”的状态。
5. UI 刷新逻辑现在会同时展示：全局当前预设、当前聊天当前预设、当前聊天是否为聊天覆写，以及该聊天快照的来源全局预设名 / 来源版本 / 更新时间 / 写入来源；如果聊天快照引用的预设名已不在全局库中，也会在当前聊天下拉框里以“仅当前聊天快照”形式补出。
6. API 层的剧情推进切换语义继续保持“当前聊天级”，而聊天切换恢复逻辑会优先恢复聊天级快照，因此通过 API 载入或切换的预设也能自动受益于新的聊天级继承链路。
7. 已通过 `node --check .\index.js` 对 [`index.js`](index.js) 做语法检查，结果通过。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 聊天级剧情推进快照持久化 | 4778-4849 | 在 [`persistPlotPresetSelectionState_ACU()`](index.js:4778) 与 [`applyPlotPresetSelectionForCurrentChat_ACU()`](index.js:4822) 中统一处理“更新全局”与“写入当前聊天快照”两条路径 |
| 聊天级剧情推进作用域容器 | 9010-9065 | 通过 [`getCurrentChatPlotScopeState_ACU()`](index.js:9010)、[`setCurrentChatPlotScopeState_ACU()`](index.js:9037)、[`clearCurrentChatPlotScopeState_ACU()`](index.js:9064) 读写聊天级剧情推进完整快照 |
| 剧情推进 API 的当前聊天级语义 | 7059-7129 | [`getCurrentPlotPreset()`](index.js:7059)、[`switchPlotPreset()`](index.js:7073)、[`injectPlotPresetToCurrentChat()`](index.js:7106) 均以当前聊天实际生效配置为准 |
| 聊天切换后的剧情推进恢复 | 13396-13416 | [`loadPresetAndCleanCharacterData_ACU()`](index.js:13396) 在进入聊天时优先恢复聊天级剧情推进快照，并补写兼容状态 |
| 剧情推进预设管理区双卡片 UI | 22494-22536 | 将剧情推进预设区改为“全局正在使用 / 当前聊天正在使用”双卡片结构，并拆分各自的按钮与文件输入 |
| 双卡片事件绑定 | 24458-24740 | 接入全局预设切换与当前聊天选择、保存快照、导入、导出、清除覆写，以及全局导入导出保存等交互 |
| 双卡片状态刷新与全局加载入口 | 25986-26156 | 在 [`loadPlotPresetSelect_ACU()`](index.js:25986)、[`loadPlotPresetToUI_ACU()`](index.js:26056)、[`savePlotPresetAsNew_ACU()`](index.js:26130) 中补齐双卡片回显、状态说明与全局另存为逻辑 |

## 2026-04-07 更新（剧情推进预设按聊天继承与当前对话注入）

### 优化剧情推进预设的聊天继承、默认预设回显与 API 注入作用域

#### 功能描述
1. 为剧情推进预设新增“按聊天记录绑定”的持久化层：新聊天在首次进入时继承当前全局剧情推进预设，旧聊天则优先恢复自己已经固化过的预设，从而避免不同聊天之间互相污染。
2. 在默认设置与加载迁移阶段补齐 [`plotPresetBindings`](index.js:5117) 和 [`settings_ACU.plotSettings.lastUsedPresetName`](index.js:14318)，兼容旧存档并确保聊天绑定、全局当前预设始终有稳定兜底值。
3. 新增一组剧情推进预设辅助函数，统一处理“默认预设”哨兵值、聊天绑定读写、当前聊天实际预设解析、默认预设回退与当前聊天应用入口，避免 UI、聊天切换与 API 分别维护多套状态。
4. 将剧情推进 API 语义拆分为两类：[`switchPlotPreset()`](index.js:6968) 负责“显式切换当前聊天并同步更新全局当前预设”；[`injectPlotPresetToCurrentChat()`](index.js:7000) 负责“仅注入当前对话而不污染全局当前预设”。同时 [`importPlotPresetFromData()`](index.js:7148) 在 `switchTo: true` 时改为复用“仅当前对话注入”语义。
5. 改造 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13115)，使其在聊天切换/恢复时优先读取当前聊天绑定；若当前聊天尚无绑定，则继承全局当前预设；若绑定指向的命名预设已失效，则自动回退到全局当前预设或默认预设，并把最终解析结果重新持久化回当前聊天。
6. 剧情推进预设下拉框现在会固定插入“默认预设”选项，并在刷新设置面板后继续显示当前聊天实际使用的预设名；删除当前预设、恢复默认提示词、另存为、覆盖保存等交互也统一走新的聊天级预设状态维护逻辑。
7. 初始化阶段在 [`resetScriptStateForNewChat_ACU()`](index.js:19049) 后补充调用 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13115)，降低初始进入当前聊天时错过预设恢复时机的竞态风险。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 运行时默认设置补齐剧情绑定存储 | 5116-5117 | 在运行态 [`settings_ACU`](index.js:5116) 中新增 [`plotPresetBindings`](index.js:5117)，用于按聊天记录持久化剧情推进预设绑定 |
| 默认设置工厂与旧存档迁移兜底 | 14132-14133, 14315-14320 | 在 [`buildDefaultSettings_ACU()`](index.js:14131) 中补齐 [`plotPresetBindings`](index.js:14133) 默认值，并在 [`loadSettings_ACU()`](index.js:14197) 中为旧存档兜底补齐绑定存储与 [`lastUsedPresetName`](index.js:14318) |
| 默认预设哨兵与聊天级剧情预设辅助函数 | 4525-4720 | 新增默认预设 sentinel、聊天绑定读写、当前聊天有效预设解析、默认预设回退与统一应用入口等辅助函数 |
| 剧情推进 API 语义拆分 | 6954-7025 | 将 [`getCurrentPlotPreset()`](index.js:6954) 改为返回当前聊天实际预设；[`switchPlotPreset()`](index.js:6968) 改为显式切换并更新全局；新增 [`injectPlotPresetToCurrentChat()`](index.js:7000) 仅作用当前对话 |
| 导入预设后的当前对话注入 | 7148-7206 | 在 [`importPlotPresetFromData()`](index.js:7148) 中将 `switchTo: true` 改为调用 [`injectPlotPresetToCurrentChat()`](index.js:7000)，避免 API 导入时污染全局当前预设 |
| 聊天切换时的剧情预设继承与固化 | 13115-13165 | 重写 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13115) 的解析顺序：旧聊天优先读绑定，新聊天继承全局，失效绑定自动回退，并把最终结果重新持久化 |
| 初始加载补做剧情预设恢复 | 19049-19050 | 在初始化当前聊天时，于 [`resetScriptStateForNewChat_ACU()`](index.js:19049) 后立即调用 [`loadPresetAndCleanCharacterData_ACU()`](index.js:13115) |
| 剧情预设面板交互统一接入聊天级状态 | 24162-24320 | 预设下拉切换、导出、覆盖保存、删除与“恢复默认提示词”均改为通过统一的聊天级剧情预设状态入口执行 |
| 剧情预设下拉框默认选项与刷新回显 | 25446-25579 | 在 [`loadPlotPresetSelect_ACU()`](index.js:25446) 中固定插入“默认预设”选项并按当前聊天实际状态回显；[`loadPlotPresetToUI_ACU()`](index.js:25478) 与 [`savePlotPresetAsNew_ACU()`](index.js:25552) 也同步维护当前选择状态 |

## 2026-04-07 更新（表格模板预设默认选项与刷新回显修复）

### 优化表格模板预设的当前值持久化、默认预设切换与 API/UI 回显一致性

#### 功能描述
1. 为表格模板预设补充持久化字段 [`currentTemplatePresetName`](index.js:5173)，用于记录当前正在使用的模板预设名称；当其为空时，统一表示当前处于“默认预设”状态。
2. 新增模板预设选择值标准化与当前值持久化辅助函数，使模板预设下拉框、模板切换 API、恢复默认模板、导入模板自动建预设等入口统一使用同一套“默认预设 / 命名预设”解析逻辑。
3. 模板预设下拉框现在固定显示“默认预设”选项，并在刷新设置面板后优先根据 [`settings_ACU.currentTemplatePresetName`](index.js:14375) 回显当前实际生效的模板预设，不再退回旧的“（选择预设以切换）”空占位状态。
4. [`applyTemplatePresetToCurrent_ACU()`](index.js:1477) 与 [`switchTemplatePreset()`](index.js:6309) 已支持显式切回“默认预设”：当用户或 API 传入默认选项时，会复用默认模板恢复逻辑，同时保持当前模板预设显示值与实际模板内容一致。
5. 模板预设的保存、另存为、重命名、删除、导入自动建预设，以及“恢复默认模板 / 恢复默认预设及模板”等入口，现在都会同步维护 [`currentTemplatePresetName`](index.js:5173) 和模板预设下拉框的当前显示值，确保 UI、运行态模板和持久化状态三者一致。
6. [`resetTableTemplate_ACU()`](index.js:29723) 增加可配置参数，允许“切回默认预设”与“手动恢复默认模板”共用同一套底层逻辑，同时按需控制 toast、当前预设回写和下拉框刷新，减少重复代码。
7. 已通过 [`node --check`](index.js:1) 对 [`index.js`](index.js) 做语法检查，结果通过。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 模板预设默认选项与当前值辅助函数 | 1299-1514 | 新增默认预设 sentinel、模板预设选择值标准化、当前模板预设名持久化、下拉框回显解析，以及模板预设/默认预设统一应用入口 |
| 运行时默认设置补齐模板当前预设名 | 5170-5173 | 在运行态设置对象中新增 [`currentTemplatePresetName`](index.js:5173)，为空时表示默认预设 |
| 默认设置工厂与旧存档迁移兜底 | 14187-14190, 14372-14375 | 在 [`buildDefaultSettings_ACU()`](index.js:14169) 中补齐 [`currentTemplatePresetName`](index.js:14190)，并在 [`loadSettings_ACU()`](index.js:14254) 中规范化旧存档里的模板当前预设值 |
| 模板预设切换 API | 6301-6323 | [`switchTemplatePreset()`](index.js:6309) 改为兼容默认预设选项，并在切换成功后统一刷新模板预设下拉框当前值 |
| 模板预设下拉框默认选项 | 22068-22072 | 模板预设选择器初始结构改为显式包含“默认预设”选项 |
| 模板预设面板交互统一维护当前值 | 23711-23815 | 模板预设切换、保存、另存为、重命名、删除等交互均改为同步维护 [`currentTemplatePresetName`](index.js:5173) 与下拉框当前显示值 |
| 恢复默认模板 / 恢复全部默认值时同步清空模板当前预设 | 29593-29617, 29723-29792 | 在 [`resetAllToDefaults_ACU()`](index.js:29487) 与 [`resetTableTemplate_ACU()`](index.js:29723) 中统一把模板预设状态切回默认预设，并按需刷新模板预设选择器 |
| 导入模板后自动同步当前模板预设名 | 29868-29875 | 导入模板自动保存为模板预设成功后，立即写入 [`currentTemplatePresetName`](index.js:5173) 并刷新模板预设下拉框回显 |

## 2026-04-07 更新（剧情推进预设保存链路简化）

### 保存剧情推进预设时自动带上当前编辑中的任务提示词，无需先手动保存提示词组

#### 功能描述
1. 修复剧情推进预设保存流程里必须先点“保存当前任务提示词”，否则当前正在编辑的任务名称、标签、重试次数、提示词段落可能不会完整写入预设的问题。
2. 新增 [`flushCurrentPlotTaskEditorState_ACU()`](index.js:5751)，在读取当前剧情设置前先清空自动保存防抖并立即把当前编辑器内容回写到 [`settings_ACU.plotSettings`](index.js:5718)，避免“预设保存”读到旧状态。
3. [`getCurrentPlotSettingsFromUI_ACU()`](index.js:25537) 现在会先调用 [`flushCurrentPlotTaskEditorState_ACU()`](index.js:5751)，因此剧情预设的覆盖保存与另存为入口都会直接带上当前正在编辑的任务数据，无需额外再点一次“保存当前任务提示词”。
4. 为剧情提示词段落的角色与内容输入新增自动保存事件，用户在编辑段落后直接保存/另存为预设时，也能拿到最新输入内容。
5. 进一步移除剧情任务区中容易造成误解的“保存当前任务提示词 / 恢复当前任务默认提示词”按钮，以及对应的无效 DOM 引用与点击绑定；保存、另存为、恢复默认现在统一由预设区右侧按钮承担。
6. 预设管理说明文案保留为“保存/另存为预设时自动带上当前编辑内容”，与最终 UI 行为保持一致。
7. 已通过 [`node --check`](index.js:1) 对 [`index.js`](index.js) 做语法检查，结果通过。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情任务编辑态立即落盘 helper | 5751-5754 | 新增 [`flushCurrentPlotTaskEditorState_ACU()`](index.js:5751)，清空防抖并立即保存当前任务编辑态 |
| 预设区交互说明文案 | 22283-22283 | 预设管理说明改为“保存/另存为预设时自动带上当前编辑内容”，与最终交互一致 |
| 剧情任务区按钮移除后的 UI 结构 | 22355-22360 | 剧情任务区仅保留提示词段落编辑器，不再额外渲染“保存当前任务提示词 / 恢复当前任务默认提示词”按钮 |
| 剧情任务区初始化绑定清理 | 23957-23960 | 删除不再需要的剧情任务区按钮 DOM 引用，只保留任务列表与提示词段落容器 |
| 提示词段落输入自动保存 | 24044-24046 | 为 `.plot-prompt-segment-role` 与 `.plot-prompt-segment-content` 新增自动保存，避免编辑后立即保存预设时丢失最新输入 |
| 读取当前剧情设置前先冲刷编辑态 | 25537-25540 | [`getCurrentPlotSettingsFromUI_ACU()`](index.js:25537) 改为先调用 [`flushCurrentPlotTaskEditorState_ACU()`](index.js:5751)，保证覆盖保存与另存为都读取最新任务内容 |
| 运行态 UI 变量清理 | 5097-5099 | 删除已废弃的剧情任务区手动保存/恢复默认按钮引用，避免留下误导性的无用状态变量 |

## 2026-04-07 更新（全拆分模板世界书注入修复）

### 修复所有表格均按单条拆分时世界书条目不注入的问题

#### 功能描述
1. 修复当表格模板中所有可注入表都启用按行拆分后，主数据库可读文本为空而被误判为“数据库为空”的问题。
2. **问题根因**：[`updateReadableLorebookEntry_ACU()`](index.js:16728) 原先使用同一套 `isDatabaseEmpty` 判定，同时控制全局可读条目与自定义导出条目；而 [`formatJsonToReadable_ACU()`](index.js:9849) 会把已启用单独导出的表排除在 `readableText` 之外，因此当所有表都走拆分注入时，`readableText` 会为空，继而跳过 [`updateCustomTableExports_ACU()`](index.js:17139) 的创建流程。
3. **修复方案**：在 [`updateReadableLorebookEntry_ACU()`](index.js:16728) 中，将自定义导出/拆分条目的注入条件改为直接依据 `mergedData` 中是否存在真实非空单元格（`hasNonEmptyCellData_ACU`）判断；只有在完全无真实数据时，才向 [`updateCustomTableExports_ACU()`](index.js:17139) 传入 `null` 执行清理。
4. 修复后，即使表格模板里所有表都采用“单条拆分”世界书注入模式，只要表格中存在有效数据，对应世界书条目仍会被正常创建或更新。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 自定义导出注入判定修复 | 16822-16835 | 在 [`updateReadableLorebookEntry_ACU()`](index.js:16728) 中，将 [`updateCustomTableExports_ACU()`](index.js:17139) 的调用条件从 `isDatabaseEmpty` 改为 `hasNonEmptyCellData_ACU`，避免“所有表都拆分为单条”时被误判为空数据库 |

### 调整数据库编辑器中的世界书注入提示文案

#### 功能描述
1. 将数据库编辑器里容易引起误解的“主数据库条目 (Readable Entry)”文案，改为更直接的“是否注入到世界书条目”。
2. 同步调整说明文字，明确该选项控制的是“是否注入到任何世界书条目”，而不是仅影响全局可读的“最新数据与记录”条目。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 表格配置面板世界书注入文案 | 31596-31602 | 在数据库编辑器的表格配置 UI 中，将注入开关标题改为“是否注入到世界书条目”，并重写提示说明以消除对 Readable Entry 的误解 |

## 2026-04-03 更新（世界书占位符排序修正）

### 修正填表与剧情推进世界书占位符中的条目排列顺序

#### 功能描述
1. 调整填表与剧情推进共用的世界书占位符排序逻辑，使两边最终输出都遵循同一套分段规则。
2. **新的排序规则**：
   - 角色定义前条目：不看深度，只按顺序（order）从小到大排列；
   - 角色定义后条目：在“角色定义前条目”全部排完之后，再按顺序（order）从小到大排列；
   - 系统条目：在前两段都排完后，再按深度从大到小排列，最底部为 D0；同一深度内再按顺序（order）从小到大排列。
3. **修复方案**：
   - 新增 [`getWorldbookEntryPlaceholderSortKey_ACU()`](index.js:25681) 与 [`compareWorldbookEntriesForPlaceholder_ACU()`](index.js:25697)，把世界书条目统一映射为“角色定义前 / 角色定义后 / 系统条目”三段排序键；
   - 在 [`buildCombinedWorldbookContentByStrategy_ACU()`](index.js:25718) 中，把默认排序器改为上述共享比较函数，从而同时影响填表与剧情推进两个世界书占位符出口；
   - 为条目补充 `_acuPlaceholderOriginalIndex` 作为稳定排序兜底，避免同段、同深度、同 order 时输出顺序抖动。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 世界书占位符排序键与比较器 | 25681-25716 | 新增 [`getWorldbookEntryPlaceholderSortKey_ACU()`](index.js:25681) 与 [`compareWorldbookEntriesForPlaceholder_ACU()`](index.js:25697)，统一定义“角色定义前 → 角色定义后 → 系统条目(D 深度倒序)”的分段排序规则 |
| 共享世界书占位符构建骨架 | 25718-25852 | 在 [`buildCombinedWorldbookContentByStrategy_ACU()`](index.js:25718) 中将默认排序器切换为共享排序函数，并补充 `_acuPlaceholderOriginalIndex` 稳定排序兜底，使填表与剧情推进占位符统一按新规则输出 |

## 2026-04-03 更新（子表格方案评估与填表模式优化建议）

### 完成子表格实现路线评估，并给出现有填表代码模式的优化建议

#### 功能描述
1. 确认项目已存在 [`README.md`](README.md)，本轮无需新建，只追加规划记录。
2. 围绕当前平铺 `sheet_*` 表模型，评估“纯字段约定”、“关系元数据增强层”、“子表格专用 DSL”三种方案，并推荐以 `relationConfig + rowId / parentRowId` 为核心的方案二；详细对比已整理到 [`plans/subtable_design_options_plan.md`](plans/subtable_design_options_plan.md)。
3. 对现有填表代码模式提出四点建议：
   - 精简 [`DEFAULT_CHAR_CARD_PROMPT_ACU`](index.js:1822) 中与填表无关的越权/角色扮演段，保留结构化输出约束，减少模型漂移；
   - 在 [`prepareAIInput_ACU()`](index.js:25875) 输出中显式展示主键、外键、关系元数据与父子表分组视图，帮助 AI 稳定生成 `parentRowId`；
   - 在 [`parseAndApplyTableEdits_ACU()`](index.js:26484) 与 [`parseTableEditCommandLine_ACU()`](index.js:27075) 之间新增“语义校验层”，专门检查 `rowId`、`parentRowId`、孤儿子行、级联删除等问题；
   - 保持 [`insertRow()`](index.js:6497)、[`updateRow()`](index.js:6355)、`deleteRow` 语法不变，优先在模板元数据和应用层增强子表能力，而不是立即引入新 DSL。
4. 本轮仅完成方案评估与规划记录，未直接修改 [`index.js`](index.js) 运行逻辑。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 子表格方案文档 | plans/subtable_design_options_plan.md | 新增规划文档，整理三种子表格方案与推荐路线 |
| 默认填表提示词 | 1822-1877 | 评估 [`DEFAULT_CHAR_CARD_PROMPT_ACU`](index.js:1822) 当前混合了结构化指令与大量越权/角色扮演文本，建议后续收敛为更纯粹的填表协议 |
| AI 输入表格格式化 | 25875-26005 | 评估 [`prepareAIInput_ACU()`](index.js:25875) 当前仅按平铺表展示，建议增加主键/外键/父子关系元数据与分组视图 |
| 指令提取与重组 | 26484-26610 | 评估 [`parseAndApplyTableEdits_ACU()`](index.js:26484) 当前侧重语法重组与容错，建议补充父子关系的语义预检 |
| 指令解析与应用 | 27075-27390 | 评估 [`parseTableEditCommandLine_ACU()`](index.js:27075) 与应用段保持旧语法兼容的同时，可插入关系校验与自动补 ID 机制 |
| 现有插入接口 | 6497-6610 | 评估 [`insertRow()`](index.js:6497) 仍适合作为子表第一阶段写入接口，建议不要急于改成专用 DSL |

## 2026-04-03 更新（剧情推进预设导出精简）

### 优化剧情推进预设导出内容，不再导出世界书条目开启情况

#### 功能描述
1. 调整剧情推进预设导出逻辑，导出的 JSON 不再携带 `plotWorldbookConfig.enabledEntries`。
2. **问题根因**：原逻辑在导出剧情推进预设时，直接对 [`normalizePlotPresetExcludeRules_ACU()`](index.js:4525) 的结果做序列化，导致当前本地的世界书条目勾选快照也被一并写入导出文件；这些数据强依赖当前环境中的世界书结构，跨环境复用价值低，还会让预设文件混入与提示词本身无关的条目开启状态。
3. **优化方案**：
   - 新增 [`stripPlotPresetWorldbookEntrySelectionForExport_ACU()`](index.js:4540)，在导出前复制并精简预设对象；
   - 在剧情推进预设导出按钮逻辑 [`$plotExportPresets.on()`](index.js:23947) 中，改为先调用该 helper，再执行 JSON 序列化；
   - 仅移除世界书条目开启情况，不影响预设本身的提示词、倍率、循环设置及其他导出字段。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进预设导出裁剪 helper | 4540-4548 | 新增 [`stripPlotPresetWorldbookEntrySelectionForExport_ACU()`](index.js:4540)，导出前删除 `plotWorldbookConfig.enabledEntries`，避免把世界书条目勾选快照写入预设文件 |
| 剧情推进预设导出按钮 | 23945-23964 | 在剧情推进导出逻辑中先调用 [`stripPlotPresetWorldbookEntrySelectionForExport_ACU()`](index.js:4540) 再序列化 JSON，导出的预设文件不再携带世界书条目开启情况 |

## 2026-04-03 更新（世界书条目懒加载与占位符统一）

### 优化设置界面的世界书条目读取性能，并统一剧情推进与填表的世界书占位符骨架

#### 功能描述
1. 优化设置界面世界书条目列表加载流程，避免仅为展示选择器和条目列表就通过 [`getWorldBooks_ACU()`](index.js:25638) 一次性读取所有世界书的全部条目。
2. **问题根因**：原逻辑在填表与剧情推进的世界书 UI 中，会在刷新列表时整体拉取世界书与条目数据，并一次性渲染全部条目 HTML；当世界书数量或条目数较大时，在打开设置页、切换来源、搜索或刷新条目列表时容易产生明显卡顿。
3. **优化方案**：
   - 新增 [`getWorldbookNames_ACU()`](index.js:25594) 与 [`getLorebookEntriesByNames_ACU()`](index.js:25610)，将“仅读世界书名称”和“按选中世界书读取条目”拆开，减少不必要的全量读取；
   - 新增懒加载分组渲染状态与 helper，由 [`renderLazyWorldbookEntryList_ACU()`](index.js:19799)、[`renderLazyWorldbookEntryItems_ACU()`](index.js:19764)、[`applyLazyWorldbookEntryFilter_ACU()`](index.js:19860) 驱动世界书条目按书分组、按需展开、分页继续加载，并保留原有筛选体验；
   - 将填表世界书条目列表 [`populateWorldbookEntryList_ACU()`](index.js:20041) 与剧情推进世界书条目列表 [`populatePlotWorldbookEntryList_ACU()`](index.js:19546) 全部接入懒加载渲染，同时保持两边原有过滤规则与独立的 `enabledEntries` 配置不变；
   - 将全选/全不选从“依赖已渲染 DOM 节点”改为“直接基于当前选中世界书条目数据更新配置”，对应 [`setWorldbookEntriesSelection_ACU()`](index.js:22883) 与 [`setPlotEntriesSelection_ACU()`](index.js:24783)，保证懒加载后未展开条目也能正确批量勾选；
   - 将剧情推进世界书占位符 [`getWorldbookContentForPlot_ACU()`](index.js:13662) 改为与填表 [`getCombinedWorldbookContent_ACU()`](index.js:25801) 共用 [`buildCombinedWorldbookContentByStrategy_ACU()`](index.js:25670) 骨架，统一条目读取、常量条目递归扫描与最终拼接流程，同时继续保留两边各自的过滤机制、来源配置与独立条目选择逻辑不变。

#### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进世界书条目列表接入懒加载 | 19546-19656 | 在 [`populatePlotWorldbookEntryList_ACU()`](index.js:19546) 中改为仅读取当前来源下实际选中的世界书条目，并按分组懒加载渲染 |
| 通用世界书条目懒加载 helper | 19685-19918 | 新增 [`isEntryBlocked_ACU()`](index.js:19686)、[`renderLazyWorldbookEntryItems_ACU()`](index.js:19764)、[`renderLazyWorldbookEntryList_ACU()`](index.js:19799)、[`applyLazyWorldbookEntryFilter_ACU()`](index.js:19860) 等分组展开/继续加载/筛选状态管理逻辑 |
| 填表世界书列表与条目列表按需读取 | 19987-20143 | 在 [`populateImportWorldbookTargetSelector_ACU()`](index.js:19987)、[`populateWorldbookList_ACU()`](index.js:20010)、[`populateWorldbookEntryList_ACU()`](index.js:20041) 中改为优先读取世界书名，仅在需要时读取当前选中世界书条目 |
| 填表世界书懒加载事件与批量勾选 | 22883-22954 | 新增 [`setWorldbookEntriesSelection_ACU()`](index.js:22883)，并将条目勾选、展开、继续加载事件改为适配懒加载状态 |
| 剧情推进世界书懒加载事件与批量勾选 | 24783-24849 | 保留剧情推进独立选择逻辑，通过 [`setPlotEntriesSelection_ACU()`](index.js:24783) 与条目列表事件绑定适配懒加载列表 |
| 世界书名称/条目拆分读取与共享占位符骨架 | 25594-25855 | 新增 [`getWorldbookNames_ACU()`](index.js:25594)、[`getLorebookEntriesByNames_ACU()`](index.js:25610)、[`getWorldbookCommentInfo_ACU()`](index.js:25654)、[`getWorldbookEntryKeywords_ACU()`](index.js:25661)、[`buildCombinedWorldbookContentByStrategy_ACU()`](index.js:25670)，并重构 [`getCombinedWorldbookContent_ACU()`](index.js:25801) |
| 剧情推进世界书占位符统一到共享骨架 | 13662-13754 | 在 [`getWorldbookContentForPlot_ACU()`](index.js:13662) 中切换到共享骨架，同时保留剧情推进自己的过滤条件、数据库条目放行规则与独立 `enabledEntries` 选择逻辑 |

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

---

## 2026-04-03 更新（剧情推进 `plotTasks` 兼容层与并发主链路第一阶段）

### 功能描述
1. 在剧情推进默认设置中加入 [`plotTasks`](index.js:1947) 数组入口，保留旧 [`promptGroup`](index.js:4451)、[`extractTags`](index.js:4433)、[`minLength`](index.js:4434)、[`loopSettings.maxRetries`](index.js:4439) 作为兼容镜像来源与回写目标。
2. 新增 [`normalizePlotTask_ACU()`](index.js:4366)、[`buildLegacyWrappedPlotTask_ACU()`](index.js:4394)、[`normalizePlotTasks_ACU()`](index.js:4408)、[`syncLegacyPlotSettingsFromTask_ACU()`](index.js:4427)、[`syncPrimaryPlotTaskFromLegacySettings_ACU()`](index.js:4449)、[`ensurePlotTasksCompat_ACU()`](index.js:4478) 等 helper，把旧单任务结构自动包装成默认任务，并统一完成新旧结构的标准化和双向同步。
3. 预设读取/切换/UI 保存链路统一改走 [`applyPlotPresetToSettings_ACU()`](index.js:4493) 与 [`normalizePlotPresetExcludeRules_ACU()`](index.js:4533)，并通过 [`getCurrentPlotSettingsFromUI_ACU()`](index.js:24743) 保留未在当前 UI 暴露的隐藏任务，保证旧预设、旧配置和最小 UI 兼容继续可运行。
4. 新增共享上下文与任务执行主链路：[`buildPlotSharedContext_ACU()`](index.js:12228) 负责复用上下文；[`renderPlotTaskMessages_ACU()`](index.js:12427) 负责渲染单任务提示词；[`executeSinglePlotTask_ACU()`](index.js:12445) 负责单任务 API 调用、重试与标签提取；[`runPlotTasksRuntime_ACU()`](index.js:12558) 负责并发执行所有启用任务、统一聚合标签，并结合全局 [`finalSystemDirective`](index.js:12397) 生成最终注入文本。
5. [`runOptimizationLogic_ACU()`](index.js:13250) 已切换为调用新的多任务运行时主链路，同时继续保留全局 [`abortController_ACU`](index.js:13293)、[`savePlotToLatestMessage_ACU()`](index.js:12629) 与旧 plot preset 兼容逻辑。
6. 为并发提示词渲染新增 [`runWithIsolatedPlotTemplateVariables_ACU()`](index.js:12033) 和 [`renderPlotTaskContentWithIsolatedVariables_ACU()`](index.js:12043)，隔离 [`random`](index.js:10301)、[`calc`](index.js:10571)、[`max`](index.js:10613)、[`min`](index.js:10667) 变量存储，降低多任务渲染阶段的全局变量互相污染风险。
7. 已使用 [`node --check`](index.js:1) 对 [`index.js`](index.js) 完成语法检查，当前无语法错误。

### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 剧情推进默认设置新增 [`plotTasks`](index.js:1947) | 1940-1948 | 在默认剧情推进设置中加入多任务数组入口，保持旧字段继续存在 |
| `plotTasks` 标准化与旧结构兼容同步 | 4366-4545 | 新增任务标准化、旧结构包装、主任务镜像同步、预设标准化/应用 helper |
| 基于 settings 的提示词读写兼容 | 4630-4651 | 新增 [`getPlotPromptContentByIdFromSettings_ACU()`](index.js:4630) / [`setPlotPromptContentByIdForSettings_ACU()`](index.js:4642)，供预设、UI、运行时统一复用 |
| 最小 UI 兼容与主任务回写 | 5363-5379, 24372-24430, 24722-24803 | UI 保存提示词组、加载设置、加载预设、从 UI 回收当前设置时，均同步到 [`plotTasks`](index.js:24799) 并保留隐藏任务 |
| 预设切换与启动恢复兼容 | 6521-6544, 12644-12666 | 预设切换和启动恢复统一复用 [`applyPlotPresetToSettings_ACU()`](index.js:4493) |
| 多任务共享上下文 / 并发执行 / 聚合注入 helper | 11981-12638 | 新增 EJS 渲染、标签摘取、标签聚合、共享上下文构建、任务执行与总运行时 helper |
| 剧情推进核心主链路切换到多任务运行时 | 13250-13398 | [`runOptimizationLogic_ACU()`](index.js:13250) 改为调用 [`runPlotTasksRuntime_ACU()`](index.js:12558)，统一处理并发任务结果与最终注入消息 |

---

## 2026-04-03 更新（剧情推进 `plotTasks` 多任务 UI 编辑器与预设链路第二阶段）

### 功能描述
1. 新增任务编辑器 helper：[`renderPlotTaskList_ACU()`](index.js:5407)、[`loadCurrentPlotTaskToUI_ACU()`](index.js:5439)、[`saveCurrentPlotTaskFromUI_ACU()`](index.js:5452)、[`buildNewPlotTaskForUI_ACU()`](index.js:5489)、[`schedulePlotTaskAutoSave_ACU()`](index.js:5509)、[`selectPlotTaskForEditing_ACU()`](index.js:5516)、[`addPlotTaskFromUI_ACU()`](index.js:5526)、[`deleteCurrentPlotTaskFromUI_ACU()`](index.js:5543)、[`moveCurrentPlotTask_ACU()`](index.js:5567)，让剧情推进设置支持“任务列表 + 当前任务编辑器”的多任务编辑模式。
2. 剧情推进设置页 UI 已加入任务列表、任务名称、启用开关、任务级最大重试、任务级标签摘取、任务级最小回复长度与当前任务提示词编辑区，对应结构位于 [`index.js`](index.js:21875) 的剧情推进设置 HTML 片段中。
3. [`syncLegacyPlotSettingsFromTask_ACU()`](index.js:4427) 不再把任务级 [`maxRetries`](index.js:5449) 写回全局 [`loopSettings.maxRetries`](index.js:25097)，避免“单任务 API 重试次数”和“自动循环失败上限”相互覆盖。
4. 剧情推进 UI 事件绑定已切换为任务级保存链路：点击任务切换、增删改排序、段落增删、A/B 槽位调整与任务字段输入都会回写到 [`plotTasks`](index.js:5478)，对应绑定区域位于 [`index.js`](index.js:23449) 至 [`index.js`](index.js:23672)。
5. [`loadPlotSettingsToUI_ACU()`](index.js:24688)、[`loadPlotPresetToUI_ACU()`](index.js:25036)、[`getCurrentPlotSettingsFromUI_ACU()`](index.js:25058)、[`savePlotPresetAsNew_ACU()`](index.js:25114) 已补齐多任务预设读写链路：载入预设时自动重置当前编辑任务，保存/另存/导入时尽量完整保留 [`plotTasks`](index.js:25100) 而不是回退为单提示词组。
6. 导入预设时已在 [`normalizePlotPresetExcludeRules_ACU()`](index.js:23958) 入口保留外部传入的 [`plotTasks`](index.js:23961)，并继续兼容旧 [`promptGroup`](index.js:23960) / [`mainPrompt`](index.js:23948) / [`systemPrompt`](index.js:23948) 结构。
7. 已执行 [`node --check`](index.js:1) 对 [`index.js`](index.js) 做第二阶段语法校验，当前无语法错误。

### 修改位置

| 函数 / 场景 | 行号区间 | 说明 |
|------|------|------|
| 兼容层取消任务重试回写全局循环上限 | 4427-4439 | [`syncLegacyPlotSettingsFromTask_ACU()`](index.js:4427) 仅同步提示词、标签和最小长度，不再覆盖全局循环失败上限 |
| 多任务 UI 编辑器 helper 与任务状态变量 | 5407-5624 | 新增任务列表渲染、任务切换、自动保存、新增/删除/排序、当前任务装载与默认恢复逻辑 |
| 剧情推进设置页多任务任务编辑器 UI | 21875-22060 | 在剧情推进设置中加入任务列表面板、任务级字段与任务级提示词编辑区域，并明确全局循环失败上限语义 |
| 剧情推进 UI 事件绑定改造 | 23449-23672 | 绑定任务切换、任务增删排序、任务字段自动保存、段落编辑自动保存，以及全局字段与任务字段分离保存 |
| 预设导入兼容保留 [`plotTasks`](index.js:23961) | 23958-23972 | 导入预设时优先保留外部多任务结构，兼容旧提示词字段并做规则标准化 |
| 剧情推进设置载入 / 预设载入 / 当前设置回收 / 另存为新预设 | 24688-25140 | 多任务 UI 初始化、预设切换重置当前任务、从 UI 汇总完整 [`plotTasks`](index.js:25100)、另存为时清理名称并显示删除按钮 |
