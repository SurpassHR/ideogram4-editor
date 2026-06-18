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
│   └── presets.ts                    # PromptPreset 接口 + 4 个内置预设模板
├── hooks/
│   ├── usePointerInteraction.ts      # 画布 Pointer Events：绘制/拖拽/缩放 boxes + 单击/双击检测 + 全局键盘快捷键（Ctrl+D/C/X/V, Delete）
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
│   │   ├── HeaderControls.tsx        # 全局 Header：Logo 左侧 + 居中 Canvas/Settings 导航 + 右侧语言切换
│   │   ├── MainContent.tsx           # CanvasPage：比例+倍数画布控件（SelectMenu 比例下拉 + 倍数滑块 + 实时尺寸） + 左列（Artboard+JSON+生成）右列（面板）
│   │   └── SettingsPage.tsx          # 设置页：左右两栏（LLM 提供商管理 + 提示词预设管理）
│   ├── canvas/
│   │   ├── Artboard.tsx              # 画板容器：固定视口、滚轮缩放+中键平移、缩放控件
│   │   ├── ArtboardToolbar.tsx       # 画板工具栏：比例下拉 + 倍数滑块 + 自定义尺寸 + 实时画布尺寸
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
│       ├── ChatMessage.tsx           # 用户/AI 消息气泡 + 采纳/忽略按钮
│       ├── PresetManagerPanel.tsx    # 预设管理面板（模态框 + 内嵌模式）：搜索/标签筛选/CRUD/变量参考
│       └── SelectMenu.tsx            # 可复用 Portal 下拉选择菜单组件
├── utils/
│   ├── coordinates.ts               # 坐标归一化/反归一化（0-1000 ↔ 像素）
│   ├── json-serializer.ts           # generateJSON() + parseBoxesFromJSON()，可选 image_data 导出
│   ├── resolveTemplate.ts           # 模板变量替换：{box_text}/{box_desc}/{box_colors}/{box_mode}
│   ├── png-metadata.ts              # 从 PNG tEXt chunk 提取 prompt/workflow 元数据
│   └── comfyui-api.ts               # 轮询 ComfyUI /history 端点
├── services/
│   ├── llm-chat.ts                  # sendChatMessage() 多提供商 LLM + 多模态图像支持
│   ├── llm-stream.ts                # sendChatMessageStream() SSE 流式服务层（OpenAI/Anthropic/Gemini）
│   ├── llm-canvas-chat.ts           # Canvas Chat system prompt + JSON 提取验证 + 上下文构建
│   ├── layout-validator.ts          # 布局质量软校验（元素面积/覆盖率/间距/边距/数量/宽高比）
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
6. 每个 box 存储为对象：`{ id, x, y, w, h, mode, text, desc, colors, imageDataUrl, imageRole }`
7. 全局状态存储在 Zustand store（`useEditorStore`）中
8. 右键 box 弹出框上下文菜单（Duplicate/Cut/Copy/Delete/层级/图像/AI Chat），右键画布空白弹出画布菜单（Paste/背景图/清除/Fit）；键盘快捷键 Ctrl+D/Ctrl+X/Ctrl+C/Ctrl+V/Delete 全局生效
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