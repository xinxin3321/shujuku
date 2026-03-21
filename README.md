# AutoCardUpdater (ACU) 插件

## 项目简介

AutoCardUpdater 是一个 SillyTavern 扩展插件，提供自动化的卡片数据更新、表格管理、剧情推进和正文优化等功能。

## 功能特性

- **数据库管理**: 自动更新和管理角色卡片数据
- **表格系统**: 支持多种表格模板和数据处理
- **剧情推进**: 智能分析剧情并推进故事发展
- **正文优化**: AI辅助的正文内容优化和替换
- **API预设系统**: 支持多个API配置预设，不同功能可使用不同的API

## 更新日志

### 2026-03-21 - 正文优化API预设修复

#### 问题描述
正文替换功能切换使用API配置的预设时，并没有真正使用该预设，仍然使用的是当前全局API配置。

#### 问题分析
- [`performContentOptimization_ACU()`](index.js:1957) 函数调用 `callAI()` 时未传递API预设参数
- [`callAI()`](index.js:5205) 函数直接使用 `settings_ACU.apiConfig` 全局配置，未支持预设参数
- 虽然存在 [`getOptimizationApiConfig_ACU()`](index.js:2020) 函数，但从未被调用

#### 修改内容

**1. 修改 `callAI()` 函数** (第5199-5310行)
- 添加 `options.presetName` 参数支持
- 使用 `getApiConfigByPreset_ACU()` 获取正确的API配置
- 修复 `tavern` 模式下使用 `effectiveTavernProfile` 而非全局配置

```javascript
// 修改前
callAI: async function(messages, options = {}) {
    const effectiveApiConfig = settings_ACU.apiConfig || {};
    // ...
    if (settings_ACU.apiMode === 'tavern') {
        const profileId = settings_ACU.tavernProfile;
        // ...
    }
}

// 修改后
callAI: async function(messages, options = {}) {
    const presetName = options.presetName || '';
    const apiPresetConfig = getApiConfigByPreset_ACU(presetName);
    const effectiveApiMode = apiPresetConfig.apiMode;
    const effectiveApiConfig = apiPresetConfig.apiConfig || {};
    const effectiveTavernProfile = apiPresetConfig.tavernProfile;
    // ...
    if (effectiveApiMode === 'tavern') {
        const profileId = effectiveTavernProfile || settings_ACU.tavernProfile;
        // ...
    }
}
```

**2. 修改 `performContentOptimization_ACU()` 函数** (第1981-1989行)
- 在调用 `callAI()` 时传递 `presetName` 参数

```javascript
// 修改前
const responseContent = await topLevelWindow_ACU.AutoCardUpdaterAPI.callAI(messages, {
    max_tokens: 4000
});

// 修改后
const apiPreset = config.apiPreset || '';
logDebug_ACU(`[正文优化] 使用API预设: ${apiPreset || '当前配置'}`);
const responseContent = await topLevelWindow_ACU.AutoCardUpdaterAPI.callAI(messages, {
    max_tokens: 4000,
    presetName: apiPreset
});
```

#### 修改文件
- `index.js` 第5199-5310行：`callAI()` 函数添加预设支持
- `index.js` 第1981-1989行：`performContentOptimization_ACU()` 传递预设参数

---

### 2026-03-21 - 正文优化最大优化项数限制修复

#### 问题描述
正文优化UI中的"最大优化项数"输入框，当输入超过20的值时会被强制截断，变成错误的值（如输入21变成2）。

#### 问题分析
- HTML输入框设置了 `max="20"` 属性
- JavaScript验证逻辑限制值为 `1 <= val <= 20`
- 当用户输入超过20时，浏览器行为导致值被截断

#### 修改内容

**1. 修改HTML输入框** (第18243行)
- 将 `max="20"` 改为 `max="100"`
- 更新提示文字

**2. 修改JavaScript验证逻辑** (第20087行)
- 将验证条件从 `val <= 20` 改为 `val <= 100`

#### 修改文件
- `index.js` 第18243行：HTML输入框 `max` 属性从20改为100
- `index.js` 第20087行：JavaScript验证条件从 `<= 20` 改为 `<= 100`

---

## 文件结构

```
shujuku/
├── index.js              # 主插件文件
├── API_DOCUMENTATION.md  # API文档
├── 条件模板语法说明.md    # 模板语法说明
├── docs/                 # 文档目录
└── plans/                # 优化计划目录
```

## 相关文档

- [API文档](API_DOCUMENTATION.md)
- [条件模板语法说明](条件模板语法说明.md)
- [条件模板语法说明(docs版)](docs/条件模板语法说明.md)

## 开发计划

详细的优化计划请参阅 `plans/` 目录下的相关文档。