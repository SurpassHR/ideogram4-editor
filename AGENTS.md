# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Ideogram JSON Prompt 可视化编辑器 — 在画布上拖拽创建边界框，配置描述与颜色，生成 Ideogram 4 图像生成模型所需的 JSON prompt，并通过 ComfyUI API 生成图片。

## 技术栈

- React 19 + TypeScript + Vite 7
- Zustand 5 状态管理
- 纯自定义 CSS（CSS 变量主题 + 语义类）
- Vitest + @testing-library/react 测试框架
- 零外部 UI 组件库
- ComfyUI API 集成（`/api/prompt` + `/history/{id}` 轮询）

## 项目结构

```
src/
├── main.tsx                          # 入口，挂载 App + I18nProvider
├── index.css                         # Tailwind + 自定义 CSS 变量 + 全局样式
├── test-setup.ts                     # 测试 setup（@testing-library/jest-dom 导入）
├── i18n/
│   ├── context.tsx                   # I18nProvider + useI18n() hook（t() 函数 + 插值）
│   └── translations.ts              # 中英双语字典（~120 条目），按 UI 区域组织
├── store/
│   ├── index.ts                      # Zustand store（useEditorStore），单一数据源
│   └── __tests__/
│       └── index.test.ts             # Store 单元测试（openChat, selectBox, editingBoxId）
├── types/
│   ├── index.ts                      # Box, IdeogramOutput, GenerationStatus 等类型
│   ├── chat.ts                       # ChatMessage 类型（id, role, content, timestamp, adopted, thinking?, canvasSnapshotUrl?）
│   ├── presets.ts                    # PromptPreset 接口 + 4 个内置预设模板
│   └── workspace.ts                  # WorkspaceBackupSettings, WorkspaceBackupPackageV1, 恢复模块类型
├── hooks/
│   ├── usePointerInteraction.ts      # 画布 Pointer Events：绘制/拖拽/缩放 boxes + 单击/双击检测 + 全局键盘快捷键（Ctrl+Z/Y/D/C/X/V, Delete）
│   ├── useImageDrop.ts               # 图片拖放导入，PNG 元数据提取
│   ├── useBoxImageImport.ts          # Box 图像导入：拖放/上传/粘贴 → FileReader → Data URL
│   ├── useComfyUIGeneration.ts       # ComfyUI 生成流程编排
│   ├── useArtboardZoom.ts            # 画板缩放/平移：wheel 缩放+中键拖拽+坐标转换
│   ├── useChatPanel.ts               # AI 对话面板逻辑：消息发送/采纳/清空/预设/多模态图像
│   ├── useCanvasChat.ts              # 画布级 AI 构图对话：发送/流式/重试/解析 IdeogramOutput/选择性 Apply/布局质量校验/画布缩略图截取/预设
│   ├── useHashRoute.ts               # Hash 路由 Hook：监听 hashchange 事件，返回 { hash, navigate }
│   └── __tests__/
│       ├── usePointerInteraction.test.tsx  # 交互 hook 测试（单击选中/拖拽/双击编辑）
│       └── useBoxImageImport.test.tsx      # 图像导入 hook 测试（拖放/过滤）
├── components/
│   ├── layout/
│   │   ├── App.tsx                   # 根组件：Hash 路由（#/ → CanvasPage, #/settings → SettingsPage）+ Header
│   │   ├── HeaderControls.tsx        # 全局 Header：Logo + 居中 Canvas/Settings 导航 + 右侧快捷键+语言切换
│   │   ├── MainContent.tsx           # CanvasPage：左列（Artboard） + 右列（面板）
│   │   ├── SettingsPage.tsx          # 设置页：左右两栏（LLM 提供商管理 + 提示词预设管理）
│   │   └── WorkspacePanel.tsx        # 工作区备份：GitHub Token/Gist ID 输入、备份/恢复/跨客户端发现
│   ├── canvas/
│   │   ├── Artboard.tsx              # 画板容器：固定视口、滚轮缩放+中键平移、缩放控件 + 组合 ArtboardToolbar
│   │   ├── ArtboardToolbar.tsx       # 画布上边缘悬浮工具栏：比例下拉 + 缩放滑块 + 自定义尺寸 + 实时尺寸 + 收藏
│   │   ├── CanvasArea.tsx            # 交互式画布（Pointer Events）+ 右键上下文菜单 + ChatPanel 渲染
│   │   ├── BoundingBox.tsx           # 边界框：文字标签 + inline 编辑 input + 背景图像 + 悬浮删除按钮 + resize + 右键菜单
│   │   ├── ContextMenu.tsx           # 通用右键上下文菜单（createPortal→body），支持分隔线/危险项/边界检测/Escape 关闭
│   │   ├── ChatBubbleButton.tsx      # ✨ 按钮：选中 box 时在右上角边框，编辑时在 input 内部右侧
│   │   ├── CanvasChatPanel.tsx       # 画布级 AI 构图浮动面板：消息列表/模型/语言/预设 SelectMenu/Apply 确认弹窗
│   │   ├── LayoutQualityDialog.tsx   # 布局质量校验结果弹窗（Accept / Regenerate）
│   │   └── __tests__/
│   │       └── BoundingBox.test.tsx  # BoundingBox 组件测试（文字/编辑/sparkle/背景图像 按钮）
│   ├── panels/
│   │   ├── GlobalSettingsPanel.tsx    # 全局设置：模式/描述/美学/光照/媒介/背景/调色板
│   │   ├── BoxPropertiesPanel.tsx     # 边界框属性：模式/文本/描述/调色板/删除
│   │   ├── ColorPalette.tsx          # 可复用颜色选择器 + 色板组件
│   │   ├── GlowGrid.tsx             # 装饰性交互式发光点阵背景容器
│   │   └── RightPanelContainer.tsx   # 右列 Tab 导航容器（全局/边界框 两 tab）
│   ├── json/
│   │   └── JsonToolbar.tsx           # 生成 JSON / 从粘贴加载
│   ├── comfyui/
│   │   ├── ComfyUIControls.tsx       # 生成控制：种子滑块/API URL/生成按钮
│   │   └── ImagePreview.tsx          # 生成结果图片展示
│   └── llm/
│       ├── LlmPanel.tsx              # LLM 工具面板：提供商列表 + 配置入口（已迁移到 SettingsPage）
│       ├── LlmConfigPanel.tsx        # LLM 配置面板（模态框 + 内嵌模式）：CRUD + 模型拉取
│       ├── types.ts                  # LlmProvider, ProviderKind 类型 + 常量
│       └── api.ts                    # LLM 提供商 CRUD（localStorage）+ 模型 API 调用
│   └── chat/
│       ├── ChatPanel.tsx             # AI 对话浮动面板（createPortal→body），预设/模型/语言三个 SelectMenu
│       ├── ChatMessage.tsx           # 用户/AI 消息气泡 + 采纳/忽略 + JSON 语法高亮
│       ├── JsonCodeBlock.tsx         # JSON 代码块组件：json/预览 iOS 滑块切换，支持语法高亮
│       ├── PresetManagerPanel.tsx    # 预设管理面板（模态框 + 内嵌模式）：搜索/标签筛选/CRUD/变量参考
│       └── SelectMenu.tsx            # 可复用 Portal 下拉选择菜单组件
│   └── shortcuts/
│       ├── ShortcutsModal.tsx        # 快捷键速查模态（createPortal→body，✕/Escape/遮罩关闭，store isShortcutsModalOpen 驱动）
│       └── shortcuts-data.ts         # 静态分组数据（3 组 11 条，keyLabel/descKey 均走 i18n）
├── utils/
│   ├── coordinates.ts               # 坐标归一化/反归一化（0-1000 ↔ 像素）
│   ├── json-serializer.ts           # generateJSON() + parseBoxesFromJSON()，可选 image_data 导出
│   ├── json-highlight.ts            # 轻量 JSON 语法高亮（单遍正则 token 匹配，零依赖）
│   ├── code-block-parser.ts         # Markdown fenced code block 切分（text/code 段）
│   ├── resolveTemplate.ts           # 模板变量替换：{box_text}/{box_desc}/{box_colors}/{box_mode}
│   ├── png-metadata.ts              # 从 PNG tEXt chunk 提取 prompt/workflow 元数据
│   └── comfyui-api.ts               # 轮询 ComfyUI /history 端点
├── services/
│   ├── llm-chat.ts                  # sendChatMessage() 多提供商 LLM + 多模态图像支持
│   ├── llm-stream.ts                # sendChatMessageStream() SSE 流式服务层（OpenAI/Anthropic/Gemini）
│   ├── llm-canvas-chat.ts           # Canvas Chat system prompt + JSON 提取验证 + 上下文构建
│   ├── layout-validator.ts          # 布局质量软校验（元素面积/覆盖率/间距/边距/数量/宽高比）
│   ├── gist-backup.ts               # GitHub Gist CRUD：创建/更新/读取备份，按文件名发现备份
│   ├── workspace-backup.ts           # 备份包构建/解析/恢复预览生成
│   ├── workspace-persistence.ts      # workspace 状态在 localStorage 中的持久化存取
│   └── __tests__/
│       └── llm-chat.test.ts         # 多模态消息格式测试（OpenAI/Anthropic/Gemini）
└── workflow/
    ├── comfyui-workflow.ts           # 静态 ComfyUI workflow JSON 模板
    └── workflow-mutator.ts           # 向模板注入 prompt/width/height/seed
```

## 核心架构

### 数据流

1. `App.tsx` 使用 `useHashRoute()` hook 根据 `window.location.hash` 路由到 `CanvasPage`（`#/`）或 `SettingsPage`（`#/settings`）
2. 用户在画布上拖拽创建 `bounding-box`（Pointer Events 驱动，`usePointerInteraction` hook）
3. 单击 box 选中，双击 box 进入文字内联编辑模式（Enter 保存 / Escape 取消）
4. 点击 ✨ 按钮（选中 box 右上角，或编辑时在 input 内部右侧）打开 AI 对话面板
5. 画布置于 `Artboard` 画板容器中，支持滚轮缩放（以鼠标位置为中心）和中键拖拽平移
6. 画布上边缘悬浮工具栏（`ArtboardToolbar`）提供比例选择、缩放滑块、自定义尺寸、实时尺寸显示和收藏功能
7. 每个 box 存储为对象：`{ id, x, y, w, h, mode, text, desc, colors, imageDataUrl, imageRole }`
8. 全局状态存储在 Zustand store（`useEditorStore`）中
8. 右键 box 弹出框上下文菜单（Duplicate/Cut/Copy/Delete/层级/图像/AI Chat），右键画布空白弹出画布菜单（Paste/背景图/清除/Fit）；键盘快捷键 Ctrl+Z/Y/D/Ctrl+X/Ctrl+C/Ctrl+V/Delete 全局生效
9. `generateJSON()` 将 boxes 坐标归一化到 0-1000 范围，合并全局设置，输出 JSON（可选导出图像 Data URL）
10. `generateImage()` 将 JSON 注入 ComfyUI workflow 模板，调用 ComfyUI API 生成图片
11. LLM 对话支持 SSE 流式输出：`sendChatMessageStream()` 逐 token 渲染，模型思维链（CoT）以可折叠块显示，Canvas Chat 每条消息附带画布缩略图
12. `IdeogramOutput` 结构：Canvas Chat 的 LLM 返回结构化 JSON（`high_level_description` + `style_description` + `compositional_deconstruction.elements[]`），解析验证后存入 `pendingIdeogramOutput`；Per-Box Chat 返回自由文本，直接采纳为 box 描述

### 关键 Store 字段

- `boxes[]` — 所有边界框的状态数组（每个含 `imageDataUrl` 和 `imageRole` 字段用于参考图）
- `globalPalette[]` — 全局调色板（最多 16 色）
- `photoArtStyleMode` — `MODE_PHOTO`(0) 或 `MODE_ARTSTYLE`(1)
- `canvasW / canvasH` — 画布尺寸（256-4096）
- `canvasBackgroundUrl` — 画布级背景参考图 Data URL（`null` 表示无背景图），渲染在 boxes 下方，opacity 0.5
- `generationStatus` — `'idle' | 'generating' | 'polling' | 'done' | 'error'`
- `apiUrl` — ComfyUI API 地址（默认 `http://localhost:8188`）
- `editingBoxId` — 当前正在内联编辑的 box ID（`null` 表示无编辑），双击 box 进入编辑模式
- `activeChatBoxId` — 当前打开 AI 对话的 box ID（`null` 表示未打开），通过点击 ✨ 按钮打开
- `isChatOpen` — AI 对话面板是否打开
- `chatHistories` — 每个 box 的对话历史（`Record<string, ChatMessage[]>`）
- `chatModel` — 选中的 LLM 模型标识（格式 `providerId:modelName`，持久化 localStorage `ideogram4-chat-model`）
- `chatPresets[]` — 聊天提示词预设列表（持久化 localStorage `ideogram4-chat-presets`）
- `chatResponseLang` — LLM 回复语言偏好（`'auto' | 'en' | 'zh'`，持久化 localStorage `ideogram4-chat-lang`）
- `isCanvasChatOpen` — 画布级 AI 构图对话面板展开/折叠状态（独立于 per-box ChatPanel）
- `canvasChatMessages` — 画布级对话历史（`ChatMessage[]`，不绑定任何 box）
- `isCanvasChatLoading` / `setCanvasChatLoading` — Canvas Chat 加载状态
- `pendingQualityReport` — AI 回复的质量校验报告（`null` 表示无报告）
- `updateCanvasChatMessage(messageId, updates)` — 更新 canvasChatMessages 中指定消息的字段
- `updateChatHistoryMessage(boxId, messageId, updates)` — 更新 per-box chatHistories 中的消息字段
- `pendingIdeogramOutput` — 最新 AI 回复中提取的待 Apply 的 `IdeogramOutput`，null 表示无有效 JSON
- `duplicateBox / cutBox / copyBox / pasteBox / bringToFront / sendToBack` — 框操作（右键菜单 + 键盘快捷键），内部剪贴板（模块级变量，非 OS 剪贴板）
- `setCanvasBackgroundUrl(url)` — 设置/清除画布背景图
- `undoStack / redoStack` — 撤销/重做历史栈（快照式，最多 50 步），`snapshot()` 手动创建快照，`undo()` / `redo()` 切换状态
- `updateBox(id, updates, recordHistory?)` — 第三个参数控制是否记录历史，拖拽实时更新传 `false`，其他操作默认 `true`

### 坐标系统

- 画布实际像素：`canvasW × canvasH`（通过比例下拉框 + 倍数滑块控制，基数 256，scale 1-16，roundTo16 约束）
- 画板视口：`Artboard` 组件提供固定视口，`useArtboardZoom` hook 管理 zoom（10%~500%）和 pan（中键拖拽）
- 坐标转换：`screenToCanvas(sx, sy)` 将屏幕坐标转换为画布坐标，公式 `(sx - artboardRect.left - panX) / zoom`
- JSON 输出坐标：归一化到 0-1000（`Math.round((val / max) * 1000)`）

### ComfyUI Workflow

`comfyui-workflow.ts` 包含一个硬编码的 Ideogram 4 双模型 CFG workflow，关键节点：
- 节点 `98:24`（CLIPTextEncode）：注入生成的 JSON prompt
- 节点 `98:27`/`98:28`：画布宽高
- 节点 `98:18`（RandomNoise）：seed 值
- 节点 `98:156`（CustomCombo）：Quality/Default/Turbo 预设

### 国际化（i18n）

- 语言状态在 React Context（`I18nProvider`）中，不在 Zustand store
- 默认英文，语言偏好持久化到 localStorage key `ideogram4-lang`
- `useI18n()` hook 返回 `{ lang, setLang, t }`
- `t('section.key', { var: value })` 支持点分隔路径查找 + `{var}` 插值
- 语言切换按钮在 Header 中（右上角 EN/中文）
- 所有翻译在 `src/i18n/translations.ts`，按 UI 区域组织

### 设计系统

CSS 自定义属性定义在 `:root`（`src/index.css`），黑暗主题：
- 背景：`--bg: #0d0d1a`、`--surface: #161630`、`--surface-raised: #1e1e3a`
- 主色：`--primary: #7c5cfc`、`--primary-hover: #9575fd`
- 强调色：`--accent: #00d4aa`
- 危险色：`--danger: #ff5252`
- 文字：`--text: #e8e8f0`、`--text-secondary: #8888aa`、`--text-muted: #5a5a7a`

## 图标使用规范

所有图标使用 `src/components/ui/icons.tsx` 中的 SVG 组件，**禁止以下做法**：
- ❌ 内联 emoji 字符（`✨`、`🧠`、`⚙` 等）
- ❌ Unicode 符号（`☆`、`✕`、`→` 等）
- ❌ 图标链接/字体图标
- ❌ 在翻译字符串中嵌入 emoji

**规范**：
- 所有图标导出自 `src/components/ui/icons.tsx`，是纯 SVG React 组件
- 约定命名：`IconXxx`（PascalCase，如 `IconGear`、`IconSparkle`）
- 尺寸通过 `size` prop 控制（默认 16px），颜色继承 `currentColor`
- 在 JSX 中直接使用：`<IconClose size={14} />`
- 如果缺少需要的图标，在 `icons.tsx` 中添加 SVG 组件，遵循现有风格
- 添加图标后运行 `tsc --noEmit` 和 `npm run test` 验证

## 运行方式

```bash
npm run dev      # 启动开发服务器（默认 http://localhost:5173）
npm run build    # 生产构建
npm run test     # 运行 Vitest 测试套件
npm run preview  # 预览生产构建
```

需要本地 ComfyUI 实例（默认 `http://localhost:8188`）才能使用图片生成功能。LLM 配置存储在浏览器 localStorage 中。

### 视觉验证

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" && \
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh" && \
xvfb-run --server-args="-screen 0 1280x1024x24" "$PWCLI" open http://localhost:5173 --headed 2>&1
```

## Agent 工作流规则

### 1. 使用 CodeGraph 阅读代码

优先使用 CodeGraph MCP 工具来阅读和理解代码，而非直接 `Read` 文件或 `Bash grep`。CodeGraph 提供结构化代码分析能力：

- `codegraph_get_ai_context` — 获取指定模块/函数的 AI 上下文，用于理解代码结构
- `codegraph_get_curated_context` — 获取精选上下文，比直接读文件更高效
- `codegraph_get_symbol_info` — 查询符号（函数/类/变量）的详细信息
- `codegraph_get_call_graph` — 获取调用图，分析函数调用关系
- `codegraph_find_by_imports` — 通过导入关系查找引用
- `codegraph_find_by_signature` — 通过函数签名查找实现
- `codegraph_search_by_pattern` — 代码模式搜索（替代 grep）
- `codegraph_get_module_summary` — 获取模块摘要

**适用场景**：理解代码结构、查找函数定义、分析调用链、搜索模式时优先用 CodeGraph。直接读文件仅用于需要查看完整文件内容或精确修改的场景。

### 2. 使用弱模型 Subagent 并行任务

在需要并行执行多个独立任务时，使用 `haiku` 或 `sonnet` 模型启动 subagent，避免使用 `opus` 模型浪费 token：

- **探索/搜索类任务** — 使用 `haiku` 模型（如 Explore agent），适用于代码搜索、文件定位、模式匹配
- **一般编码任务** — 使用 `sonnet` 模型，适用于实现、修复、重构等需要一定推理能力的任务
- **复杂架构/设计任务** — 使用 `opus` 模型，仅用于需要深度推理的架构设计或复杂问题分析

**并行策略**：
- 3 个及以下独立任务 → 同时启动 subagent，使用 `haiku` 或 `sonnet` 模型
- 4+ 独立任务 → 分批启动，每批最多 3 个
- 被依赖的任务先完成，再启动依赖方

### 3. 使用 Kanban 管理任务链

多步骤实施建议使用 Kanban CLI 管理任务和依赖链，但必须注意以下规则：

**分支规则**：
- 创建任务时必须显式传 `--base-ref <当前分支>`（即仓库当前所在分支，用 `git branch --show-current` 获取），使任务 worktree 基于当前工作分支创建，便于后续合并；避免 Kanban 创建 detached HEAD worktree
- 禁止仅传 `--project-path` 而不传 `--base-ref`——fallback 行为不稳定
- 不要固定写 `--base-ref main`，否则在特性分支上工作时任务会错误地基于 main 创建
- 依赖链（`task link`）中的任务会自动启动，无需手动 `task start`

**正确示例**：
```bash
CURBR=$(git branch --show-current)
kanban task create --title "Task 1" --prompt "..." --base-ref "$CURBR" --project-path /path/to/project
kanban task create --title "Task 2" --prompt "..." --base-ref "$CURBR" --project-path /path/to/project
kanban task link --task-id <id2> --linked-task-id <id1> --project-path /path/to/project
```

**错误示例**：
```bash
# ❌ 缺少 --base-ref，可能创建 detached HEAD worktree
kanban task create --title "Task 1" --prompt "..." --project-path /path/to/project

# ❌ 固定使用 main，在特性分支上工作时会基于错误的分支创建任务
kanban task create --title "Task 1" --prompt "..." --base-ref main --project-path /path/to/project
```

**故障处理**：
- 如果任务完成但代码未合并到当前分支：在当前分支上用 `git cherry-pick <commit>` 手动合并
- 并行任务出现冲突时（多个 worktree 同时操作同一文件）：优先采用最后完成的任务代码，再手动修复
- 任务 worktree 可在 `~/.cline/worktrees/<task-id>/` 找到

**依赖链规则**：见 @KANBAN.md

### 4. GitHub Pages 部署规则

本项目的部署地址为 `https://gp.hrfuqiang.top/ideogram4-editor/`，自定义域名 `gp.hrfuqiang.top` 通过用户站点 `SurpassHR.github.io` 管理。

#### 核心配置

- **`vite.config.ts`** 中 `base` 必须使用动态模式：
  ```ts
  base: process.env.GITHUB_ACTIONS ? '/ideogram4-editor/' : '/',
  ```
  不要使用 `base: './'`（有已知 Vite bug，详见 [#15130](https://github.com/vitejs/vite/issues/15130)）
- **自定义域名**通过 `public/CNAME` 文件配置，内容为 `gp.hrfuqiang.top`
- **`package.json`** 中设置 `"homepage": "https://gp.hrfuqiang.top/ideogram4-editor/"`

#### Workflow 规范

- 使用官方 artifact 管线，**不要使用第三方 actions**（如 `peaceiris/actions-gh-pages`、`JamesIves/github-pages-deploy-action`）
- 必须的 actions 和当前版本：
  - `actions/checkout@v6`
  - `actions/setup-node@v6`（`node-version: lts/*`, `cache: npm`）
  - `actions/upload-pages-artifact@v5`（`path: ./dist`）
  - `actions/deploy-pages@v5`
- 所需 permissions：`contents: read`, `pages: write`, `id-token: write`
- 不要随意降级 action 版本——旧版本有兼容性问题（`@v4` 在 Node 24 下不可用）

#### 红线

- **不要通过 API 删除 Pages 配置**（`DELETE /repos/{owner}/{repo}/pages`），重建后可能处于 `status: null` 的空转状态，导致站点 404
- **不要修改 src/ 中的代码**来适配部署——本项目使用 hash 路由，无需 404.html 或 SPA fallback
- GitHub Pages Source 必须在仓库 Settings → Pages 中设为 **GitHub Actions**（而非分支），这是手动步骤，不可在代码中配置

### 5. 不重复造轮子：优先复用项目中已有的 UI 模式

在修改或新增 UI 功能时，**必须先搜索项目中是否已有相同或相似的实现**，优先复用，而不是从头另写一套。

- 搜索关键词：用 `ffgrep` 搜索相关 CSS 类名、组件名、或功能关键词，确认是否存在现成方案
- 优先复用：如果已有组件/样式实现相同功能，直接 import 使用或参考其实现方式
- 示例：本项目已有 `JsonCodeBlock` 组件的 `json-code-block-toggle`（iOS 滑块式 JSON/预览切换），新增类似功能时不应再写一套按钮式切换

**为什么会犯这个错：** 在 JSON tab 中新增了视图切换按钮组（`.json-view-toggle`），但 `ChatMessage` 里的 `JsonCodeBlock` 组件已经有完全相同的交互模式（`.json-code-block-toggle`）。应该直接复用后者，而不是造新的按钮组。

### 6. 剪贴板粘贴/外部数据导入规则

涉及 `clipboardData`、`DataTransfer`、文件拖放等外部数据导入时，必须遵守以下规则：

#### 事件选择
- ❌ **不要用 React 合成事件的 `onPaste`** — 非 focusable 元素收不到
- ✅ **用 `document.addEventListener('paste', handler)`** — 原生事件，不管焦点在哪都能捕获

#### 区域过滤
- 当 `e.target` 是 BODY 或祖先元素时，`el.contains(target)` 返回 **false**
- ✅ 必须双向检查：`el.contains(target) || target.contains(el)`

#### clipboardData.items 消费
- ❌ **不要多次读取** — `getAsFile()` / `getAsString()` 第二次调用可能返回 null 或卡死
- ✅ **一次性读取全部缓存**到内存，后续处理都用缓存

#### 大图处理
- ❌ **不要用 `FileReader.readAsDataURL`** — 大图（>5MB）转 base64 会卡死主线程数秒
- ✅ **用 `URL.createObjectURL(file/blob)`** — 瞬时完成，零拷贝
- Blob URL 在当前会话中可用，跨会话持久化需异步转 Data URL

#### keydown 拦截
- ❌ **不要无差别 `e.preventDefault()`** — 会阻止 paste 事件触发
- ✅ 只在确有必要（如内部剪贴板有内容）时拦截

#### Demo 流程
- ✅ 涉及外部数据导入时，**先做可交互 demo 验证真实数据流**，再改项目代码
- ✅ demo 必须能接收**真实粘贴/拖放**，不要用模拟按钮代替
- ✅ 打开 demo 服务器后给出 **`http://localhost:端口`**，不要加文件名

#### 为什么容易犯错
- `clipboardData.items` 看似可多次读取，实则消费一次后失效——违反直觉
- `e.target` 在粘贴事件中经常是 BODY，不是触发粘贴的 UI 元素
- 大图 base64 在小图时没问题，大图才暴露——容易漏测
- keydown 的 `preventDefault()` 与 paste 事件的关系在不同浏览器行为不同

### 7. 前端修改后必须用 Playwright 验证无白屏/样式丢失

每次修改前端代码后（包括但不限于：新增组件、修改 CSS 变量/类名、编辑 i18n 翻译、修改 store 初始化逻辑），**必须使用 Playwright 验证页面是否能正常渲染**，防止出现白屏或样式丢失。

#### 验证命令

```bash
# 1. 启动开发服务器（如果未运行）
npx vite --host 0.0.0.0 &
sleep 3

# 2. 用 Playwright 打开页面并检查控制台错误
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" && \
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh" && \
xvfb-run --server-args="-screen 0 1280x1024x24" sh <<'SCRIPT'
cd /media/hr/Data/Codes/ideogram4-editor
"$PWCLI" open http://localhost:5173 --headed
sleep 6
"$PWCLI" console
"$PWCLI" screenshot /tmp/verify-frontend.png
"$PWCLI" close
SCRIPT
```

#### 验证标准

- ❌ **白屏判定**：控制台出现以下任一错误应立即修复
  - `Failed to load module` / `does not provide an export named`
  - `Uncaught TypeError` / `Cannot read properties of undefined`
  - `MIME type mismatch` / `SyntaxError` (非 favicon 404)
- ❌ **样式丢失判定**：页面整体布局异常（按钮/面板/图标缺失或错位）
- ✅ **通过标准**：控制台无致命错误（favicon 404 忽略），页面正常渲染

#### 常见白屏原因排查清单

| 原因 | 现象 | 解决 |
|------|------|------|
| **Vite 模块缓存** | 修改 i18n/类型后报 "does not provide an export named" | `pkill -f vite` 重启 dev server |
| **TypeScript 编译错误** | `tsc -b` 失败后 Vite 仍会尝试热更新 | 先 `npx tsc --noEmit` 确认无类型错误 |
| **CSS class 名拼写错误** | 组件渲染但无样式/布局错乱 | 检查 className 与 CSS 选择器是否匹配 |
| **Store 初始化 undefined** | `useEditorStore(s => s.xxx)` 报 undefined | 检查 store 接口中新字段是否有初始值 |