# 设置页配置中心优化设计

> 日期：2026-06-21 · 状态：设计已确认

## 概述

本次设计将 Settings 页从“三块设置面板并排堆叠”优化为“模块切换型配置中心”。页面左侧提供设置模块导航，右侧展示当前模块的完整工作流，让 LLM 提供商、提示词预设、工作区备份在同一个清晰框架内管理。

目标不是重做业务能力，而是改善设置页的信息架构、视觉层级和响应式可用性。现有 `LlmConfigPanel`、`PresetManagerPanel`、`WorkspacePanel` 继续作为模块内容承载，避免把业务逻辑拆散。

## 已确认决策

- 采用“配置中心”方向，而不是继续左右并列仪表盘或创作工作台风格。
- 采用“模块切换型”：左侧模块导航，右侧只显示当前模块。
- 设置页不新增路由层级，不引入 React Router，不改变现有 `#/settings` 入口。
- 设置页新增本地 UI 状态用于当前模块切换，初始模块为 LLM 提供商。
- 复用现有三个设置模块：LLM providers、Prompt presets、Workspace。
- 不拆分 LLM provider、preset、workspace 的业务逻辑；只调整其嵌入态容器和页面外壳。
- 视觉保持深色工具控制台气质，保留现有 `--primary` 紫色，强化 `--accent` 青绿色作为活动信号。
- 响应式在窄屏下转为单列：模块导航在上方，内容区在下方。

## 当前问题

当前 `SettingsPage` 结构很薄：

```tsx
<div className="settings-page">
  <div className="settings-page-left">
    <LlmConfigPanel embedded />
  </div>
  <div className="settings-page-right">
    <PresetManagerPanel embedded />
  </div>
  <WorkspacePanel />
</div>
```

对应样式为两列网格，Workspace 横跨整行。这个结构实现简单，但在功能增多后出现三类问题：

1. 页面入口没有“设置中心”的层级感，三个模块看起来像临时拼接。
2. LLM 和 Preset 面板内部本身已有左右结构，外层再并排后横向空间偏紧。
3. Workspace 区域横跨整行后视觉权重过高，页面扫描顺序不够稳定。

## 范围

### 本次范围

- 重构 `SettingsPage` 的页面骨架为模块导航 + 模块内容舞台。
- 为三个模块定义稳定的导航配置：模块 id、标题、说明、状态摘要。
- 点击左侧模块后切换右侧内容，不刷新路由。
- 为设置页新增页面标题区、模块导航样式、内容舞台样式。
- 调整 `LlmConfigPanel`、`PresetManagerPanel`、`WorkspacePanel` 的嵌入态视觉，让它们在内容舞台内更像同一套控制台。
- 优化桌面和窄屏响应式布局。
- 补充设置页相关渲染/切换测试。

### 非本次范围

- 不新增设置模块。
- 不改变 LLM provider CRUD、模型拉取、API key 存储逻辑。
- 不改变 prompt preset 的搜索、过滤、编辑、复制、删除逻辑。
- 不改变 Workspace 收藏、Gist 备份、恢复逻辑。
- 不做设置页内搜索。
- 不做 hash 子路由，如 `#/settings/providers`。
- 不引入外部 UI 组件库、图标库或新字体。
- 不修改 Canvas 页布局。

## 信息架构

设置页分为三层：

1. 页面标题区：说明 Settings 是配置中心，展示当前配置域。
2. 模块导航区：列出 LLM providers、Prompt presets、Workspace，并显示短说明和状态摘要。
3. 模块内容区：展示当前模块的原有嵌入式面板。

桌面结构：

```text
SettingsPage
  ├── 页面标题区
  └── settings-console
      ├── settings-module-nav
      │   ├── LLM providers
      │   ├── Prompt presets
      │   └── Workspace
      └── settings-module-stage
          ├── 当前模块标题与说明
          └── 当前模块内容
```

窄屏结构：

```text
SettingsPage
  ├── 页面标题区
  └── settings-console
      ├── settings-module-nav（顶部单列）
      └── settings-module-stage（下方单列）
```

## 模块定义

### LLM providers

用途：管理对话和画布构图使用的 LLM 提供商。

内容：继续渲染 `LlmConfigPanel embedded`。

状态摘要：

- 首版显示中性说明，不额外统计 provider 数量，避免为了导航摘要引入异步加载分支。
- provider 真实列表和空状态仍由右侧 `LlmConfigPanel` 展示。

### Prompt presets

用途：管理 per-box chat 和 canvas chat 可复用提示词模板。

内容：继续渲染 `PresetManagerPanel embedded`。

状态摘要：

- 显示 preset 数量。
- 若当前搜索/标签过滤属于面板内部状态，不提升到模块导航。

### Workspace

用途：管理画布收藏和 Gist 备份/恢复。

内容：继续渲染 `WorkspacePanel`，但去掉其作为整页大卡片的定位，让它成为模块内容。

状态摘要：

- 显示收藏数量。
- 若已存在 Gist ID，可显示“Gist backup configured”一类短状态。

## 交互设计

### 模块切换

- `SettingsPage` 内部维护 `activeModule` 状态。
- 初始值为 `llm`。
- 点击模块导航按钮后切换当前模块。
- 切换不影响各模块内部已保存的数据。
- 已卸载模块的临时编辑状态可以按 React 现有行为重置；本次不要求跨模块保留半填写表单。

### 可访问性

- 模块导航使用 `button`，当前模块使用 `aria-current="page"` 或 `aria-pressed` 表达选中态。
- 键盘 focus 需要有明确描边，沿用 `--border-focus`。
- 模块说明和状态摘要不能只靠颜色区分。

### 滚动

- 设置页外层保持页面级滚动。
- 内容舞台内部模块按各自现有滚动逻辑工作。
- 桌面下避免外层与内层同时出现多个横向滚动条。

## 视觉设计

### 设计目标

设置页应该像创作工具的配置控制台，而不是营销页或普通表单集合。视觉上安静、专业、适合反复使用；记忆点集中在左侧模块导航的活动信号。

### 色彩

沿用现有 CSS 变量：

- 背景：`--bg: #0d0d1a`
- 面板：`--surface: #161630`
- 抬升面：`--surface-raised: #1e1e3a`
- 主色：`--primary: #7c5cfc`
- 活动信号：`--accent: #00d4aa`
- 边框：`--border: #2a2a4a`

新增样式应优先使用现有变量和半透明组合，不新增一套平行主题变量。`--accent` 用于当前模块信号、轻量状态、细线高亮；`--primary` 继续用于主按钮和既有选中控件。

### 布局与间距

- 页面标题区使用紧凑高度，不做 hero。
- 控制台外壳使用单层边框和轻微背景层次。
- 左侧模块导航宽度建议约 `240px`，内容区使用 `minmax(0, 1fr)`。
- 模块导航项固定信息结构：图标/字母标识、标题、说明、状态。
- 卡片圆角不超过现有系统风格，保持 8-10px。
- 避免卡片套卡片的强装饰感；嵌入面板应与内容舞台共享边框语义。

### 字体

- 继续使用现有 `Inter` 作为 UI 字体。
- 继续使用 `JetBrains Mono` 作为 id、model、template 等技术文本字体。
- 不引入外部字体，避免增加加载和构建成本。

### 签名元素

左侧模块导航的活动信号作为唯一视觉记忆点：

- 当前模块左侧或图标内使用青绿色信号点/细线。
- 当前模块背景可使用非常轻的 `--accent` 到 `--primary` 透明渐变。
- 其他区域保持克制，避免多处装饰抢焦点。

## 组件影响

| 文件 | 影响 |
| --- | --- |
| `src/components/layout/SettingsPage.tsx` | 重构为配置中心骨架，新增 active module 状态和模块定义 |
| `src/components/layout/WorkspacePanel.tsx` | 可接受轻量 className 或内部语义调整，以适配模块内容舞台 |
| `src/components/llm/LlmConfigPanel.tsx` | 保持业务逻辑，必要时调整 embedded 外层 class 以适配新高度 |
| `src/components/chat/PresetManagerPanel.tsx` | 保持业务逻辑，必要时调整 embedded 外层 class 以适配新高度 |
| `src/index.css` | 新增/替换 SettingsPage、模块导航、舞台、嵌入态样式 |
| `src/i18n/translations.ts` | 补充设置页模块标题、说明、状态摘要文案 |
| 测试文件 | 增加 SettingsPage 模块切换和渲染测试 |

## 数据流

本次不改变持久化数据流。新增的数据只属于设置页本地 UI 状态：

```ts
type SettingsModuleId = 'llm' | 'presets' | 'workspace';
const [activeModule, setActiveModule] = useState<SettingsModuleId>('llm');
```

模块状态摘要从现有数据读取：

- LLM providers 首版使用中性说明，不读取 `getLlmProviders()`。
- Prompt presets 数量可从 `useEditorStore(s => s.chatPresets)` 读取。
- Workspace favorites 数量可从 `useEditorStore(s => s.canvasFavorites)` 读取。
- Gist 设置可从 `workspaceBackupSettings` 读取。

## 错误处理

设置页骨架本身没有新的远程请求。

已有错误继续由各模块内部处理：

- LLM 模型拉取失败仍由 `LlmConfigPanel` toast 展示。
- Preset 表单校验仍由 `PresetManagerPanel` 处理。
- Gist 备份/恢复错误仍由 `WorkspacePanel` status 展示。

模块切换不能吞掉这些内部状态消息；toast/status 应留在模块内容区域内。

## 响应式规则

### 桌面

- `settings-console` 使用两列：`240px minmax(0, 1fr)`。
- 内容舞台最小高度与现有设置页可用高度协调，避免 LLM/Preset 内部列表被压得过短。
- LLM 和 Preset 的内部左右结构保持现有逻辑。

### 中窄屏

- 约 `1100px` 以下切为单列。
- 模块导航放在内容区上方，导航项可单列或紧凑网格。
- 内嵌 LLM/Preset 面板如果宽度不足，内部列表与详情允许按既有样式降级；本次可补充必要的 CSS 防止文本溢出。

### 小屏

- 模块标题、说明、状态摘要允许换行。
- 按钮文本不应溢出容器。
- 不使用 viewport width 缩放字体。

## 测试计划

### 单元/组件测试

- 测试文件建议落点：`src/components/layout/__tests__/SettingsPage.test.tsx`。
- `SettingsPage` 默认渲染 LLM providers 模块。
- 点击 Prompt presets 模块后渲染 `PresetManagerPanel embedded`。
- 点击 Workspace 模块后渲染 Workspace 内容。
- 当前模块导航项具备可查询的选中状态。

### 回归测试

- `LlmConfigPanel` 现有 provider 列表、编辑、保存逻辑不因嵌入容器变化而失效。
- `PresetManagerPanel` 搜索、标签过滤、新建、编辑逻辑不因模块切换入口变化而失效。
- `WorkspacePanel` 收藏列表、备份设置、恢复预览逻辑不因外层结构变化而失效。

### 视觉验证

- 启动 dev server 后在桌面视口检查 `#/settings`。
- 检查窄屏视口下模块导航是否上移且无横向溢出。
- 检查右侧内容区域的 LLM/Preset 内部滚动是否正常。
- 检查当前模块活动信号是否清晰但不过度装饰。

## 实施顺序建议

1. 增加 SettingsPage 模块定义和本地 active module 状态。
2. 重构 SettingsPage JSX 为标题区、模块导航、内容舞台。
3. 补充 i18n 文案。
4. 替换 SettingsPage 相关 CSS，并调整嵌入态面板高度/边框。
5. 增加组件测试。
6. 运行测试、构建和浏览器视觉检查。

## 验收标准

- `#/settings` 首屏呈现配置中心结构，而不是三块面板并排堆叠。
- 左侧模块导航可以在 LLM providers、Prompt presets、Workspace 之间切换。
- 三个模块的既有核心功能保持可用。
- 桌面布局没有横向溢出，窄屏布局单列可读。
- 视觉与现有深色主题一致，并有明确但克制的活动模块高亮。
- 测试覆盖模块切换行为。
