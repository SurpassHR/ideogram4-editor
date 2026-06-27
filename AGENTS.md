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
├── test-setup.ts                     # 测试 setup（@testing-library/jest-dom）
├── i18n/
│   ├── context.tsx                   # I18nProvider + useI18n() hook（t() + 插值）
│   └── translations.ts              # 中英双语字典（~120 条目），按 UI 区域组织
├── store/
│   └── index.ts                      # Zustand store（useEditorStore），单一数据源
├── types/
│   ├── index.ts                      # Box, IdeogramOutput, GenerationStatus 等类型
│   ├── chat.ts                       # ChatMessage 类型
│   ├── presets.ts                    # PromptPreset 接口 + 4 个内置预设模板
│   └── workspace.ts                  # WorkspaceBackupSettings, WorkspaceBackupPackageV1
├── hooks/
│   ├── usePointerInteraction.ts      # 画布 Pointer Events：绘制/拖拽/缩放 boxes + 键盘快捷键
│   ├── useImageDrop.ts               # 图片拖放导入，PNG 元数据提取
│   ├── useBoxImageImport.ts          # Box 图像导入：拖放/上传/粘贴 → Data URL
│   ├── useComfyUIGeneration.ts       # ComfyUI 生成流程编排
│   ├── useArtboardZoom.ts            # 画板缩放/平移：wheel 缩放+中键拖拽+坐标转换
│   ├── useChatPanel.ts               # AI 对话面板逻辑：消息发送/采纳/清空/预设/多模态
│   ├── useCanvasChat.ts              # 画布级 AI 构图对话：发送/流式/重试/解析/Apply/布局校验
│   ├── useGeneratedJSON.ts           # JSON 生成逻辑：generateJSON + watch + 格式化输出
│   └── useHashRoute.ts               # Hash 路由 Hook
├── components/
│   ├── layout/
│   │   ├── App.tsx                   # 根组件：Hash 路由（#/ → CanvasPage, #/settings → SettingsPage）
│   │   ├── HeaderControls.tsx        # 全局 Header：Logo + 导航 + 快捷键+语言切换
│   │   ├── MainContent.tsx           # CanvasPage：左列（Artboard） + 右列（面板）
│   │   ├── BottomBar.tsx             # 底部工具栏：JSON 生成 + ComfyUI 控件 + 图片预览
│   │   ├── SettingsPage.tsx          # 设置页：LLM 提供商管理 + 提示词预设管理
│   │   ├── GeneralSettingsPanel.tsx   # 通用设置面板（模态框内嵌）
│   │   └── WorkspacePanel.tsx        # 工作区备份：GitHub Token/Gist ID、备份/恢复/跨客户端发现
│   ├── canvas/
│   │   ├── Artboard.tsx              # 画板容器：固定视口、滚轮缩放+中键平移、缩放控件
│   │   ├── ArtboardToolbar.tsx       # 画布上边缘悬浮工具栏：比例/缩放/尺寸/收藏
│   │   ├── CanvasArea.tsx            # 交互式画布（Pointer Events）+ 右键上下文菜单 + ChatPanel
│   │   ├── BoundingBox.tsx           # 边界框：文字标签 + inline 编辑 + 背景图像 + resize + 右键菜单
│   │   ├── ContextMenu.tsx           # 通用右键上下文菜单（createPortal→body）
│   │   ├── ChatBubbleButton.tsx      # ✨ 按钮：选中 box 右上角，编辑时在 input 内部右侧
│   │   ├── CanvasChatPanel.tsx       # 画布级 AI 构图浮动面板：消息/模型/语言/预设/Apply 弹窗
│   │   ├── LayoutQualityDialog.tsx   # 布局质量校验结果弹窗（Accept / Regenerate）
│   │   └── LayerPanel.tsx            # 图层管理面板：显示所有 box 列表，支持选中/重命名/可见性
│   ├── panels/
│   │   ├── GlobalSettingsPanel.tsx    # 全局设置：模式/描述/美学/光照/媒介/背景/调色板
│   │   ├── BoxPropertiesPanel.tsx     # 边界框属性：模式/文本/描述/调色板/删除
│   │   ├── ColorPalette.tsx          # 可复用颜色选择器 + 色板组件
│   │   ├── GlowGrid.tsx             # 装饰性交互式发光点阵背景容器
│   │   ├── OptimizableInput.tsx      # 可优化输入框：带 ✨ 按钮触发 AI 优化
│   │   ├── SuggestionBar.tsx         # AI 建议条：显示快捷采纳建议
│   │   └── RightPanelContainer.tsx   # 右列 Tab 导航容器（全局/边界框 两 tab）
│   ├── json/
│   │   └── JsonToolbar.tsx           # 生成 JSON / 从粘贴加载
│   ├── comfyui/
│   │   ├── ComfyUIControls.tsx       # 生成控制：种子滑块/API URL/生成按钮
│   │   └── ImagePreview.tsx          # 生成结果图片展示
│   ├── llm/
│   │   ├── LlmPanel.tsx              # LLM 工具面板（已迁移到 SettingsPage）
│   │   ├── LlmConfigPanel.tsx        # LLM 配置面板：CRUD + 模型拉取
│   │   ├── types.ts                  # LlmProvider, ProviderKind 类型 + 常量
│   │   └── api.ts                    # LLM 提供商 CRUD（localStorage）+ 模型 API 调用
│   ├── chat/
│   │   ├── ChatPanel.tsx             # AI 对话浮动面板（createPortal→body），预设/模型/语言 SelectMenu
│   │   ├── ChatMessage.tsx           # 用户/AI 消息气泡 + 采纳/忽略 + JSON 语法高亮
│   │   ├── ChatRunControls.tsx       # 对话运行控制：发送/停止/重新生成按钮
│   │   ├── SystemPromptPanel.tsx     # 系统提示词编辑面板
│   │   ├── JsonCodeBlock.tsx         # JSON 代码块：json/预览 iOS 滑块切换，语法高亮
│   │   ├── PresetManagerPanel.tsx    # 预设管理面板：搜索/标签筛选/CRUD/变量参考
│   │   └── SelectMenu.tsx            # 可复用 Portal 下拉选择菜单组件
│   ├── shortcuts/
│   │   ├── ShortcutsModal.tsx        # 快捷键速查模态（createPortal→body）
│   │   └── shortcuts-data.ts         # 静态分组数据（3 组 11 条，均走 i18n）
│   └── ui/
│       └── icons.tsx                 # 所有 SVG 图标组件（IconXxx 命名，size prop 控制尺寸）
├── utils/
│   ├── coordinates.ts               # 坐标归一化/反归一化（0-1000 ↔ 像素）
│   ├── json-serializer.ts           # generateJSON() + parseBoxesFromJSON()
│   ├── canvas-dims.ts               # 画布尺寸计算：roundTo16 约束 + 比例预设
│   ├── json-highlight.ts            # 轻量 JSON 语法高亮（单遍正则，零依赖）
│   ├── code-block-parser.ts         # Markdown fenced code block 切分
│   ├── panelPosition.ts             # 面板定位计算：浮动面板位置 + 边界检测
│   ├── resolveTemplate.ts           # 模板变量替换：{box_text}/{box_desc}/{box_colors}/{box_mode}
│   ├── png-metadata.ts              # 从 PNG tEXt chunk 提取 prompt/workflow 元数据
│   └── comfyui-api.ts               # 轮询 ComfyUI /history 端点
├── services/
│   ├── llm-chat.ts                  # sendChatMessage() 多提供商 LLM + 多模态图像支持
│   ├── llm-stream.ts                # sendChatMessageStream() SSE 流式服务层
│   ├── llm-canvas-chat.ts           # Canvas Chat system prompt + JSON 提取验证 + 上下文构建
│   ├── layout-validator.ts          # 布局质量软校验（面积/覆盖率/间距/边距/数量/宽高比）
│   ├── gist-backup.ts               # GitHub Gist CRUD：创建/更新/读取备份
│   ├── workspace-backup.ts           # 备份包构建/解析/恢复预览生成
│   └── workspace-persistence.ts      # workspace 状态在 localStorage 中的持久化存取
└── workflow/
    ├── comfyui-workflow.ts           # 静态 ComfyUI workflow JSON 模板
    └── workflow-mutator.ts           # 向模板注入 prompt/width/height/seed
```

## 核心架构

### 数据流

1. `App.tsx` 使用 `useHashRoute()` 根据 hash 路由到 `CanvasPage`（`#/`）或 `SettingsPage`（`#/settings`）
2. 用户在画布上拖拽创建 bounding-box（Pointer Events，`usePointerInteraction`）
3. 单击选中，双击进入文字内联编辑（Enter 保存 / Escape 取消）
4. 点击 ✨ 按钮打开 AI 对话面板
5. 画布置于 `Artboard` 中，支持滚轮缩放和中键拖拽平移
6. `ArtboardToolbar` 提供比例选择、缩放滑块、自定义尺寸、收藏
7. 每个 box 存储为：`{ id, x, y, w, h, mode, text, desc, colors, imageDataUrl, imageRole }`
8. 全局状态在 Zustand store（`useEditorStore`）
9. 右键菜单（box: Duplicate/Cut/Copy/Delete/层级/图像/AI Chat；画布: Paste/背景图/清除/Fit）+ 键盘快捷键
10. `generateJSON()` 归一化坐标到 0-1000，合并全局设置
11. `generateImage()` 注入 ComfyUI workflow，调用 API 生成图片
12. LLM 对话支持 SSE 流式 + CoT 可折叠块 + Canvas Chat 画布缩略图
13. Canvas Chat 返回结构化 `IdeogramOutput`（`high_level_description` + `style_description` + `elements[]`），存入 `pendingIdeogramOutput`；Per-Box Chat 返回自由文本

### 关键 Store 字段

- `boxes[]` — 所有边界框（含 `imageDataUrl`/`imageRole` 参考图字段）
- `globalPalette[]` — 全局调色板（最多 16 色）
- `photoArtStyleMode` — `MODE_PHOTO`(0) 或 `MODE_ARTSTYLE`(1)
- `canvasW / canvasH` — 画布尺寸（256-4096）
- `canvasBackgroundUrl` — 画布背景参考图 Data URL，渲染在 boxes 下方 opacity 0.5
- `generationStatus` — `'idle' | 'generating' | 'polling' | 'done' | 'error'`
- `apiUrl` — ComfyUI API 地址（默认 `http://localhost:8188`）
- `editingBoxId` — 当前内联编辑的 box ID（双击进入）
- `activeChatBoxId` — 当前 AI 对话的 box ID（✨ 按钮打开）
- `chatHistories` — 每个 box 的对话历史（`Record<string, ChatMessage[]>`）
- `chatModel` — LLM 模型标识（`providerId:modelName`，持久化 `ideogram4-chat-model`）
- `chatPresets[]` — 聊天提示词预设（持久化 `ideogram4-chat-presets`）
- `chatResponseLang` — LLM 回复语言（`'auto' | 'en' | 'zh'`，持久化 `ideogram4-chat-lang`）
- `isCanvasChatOpen` — 画布级 AI 构图面板状态
- `canvasChatMessages` — 画布级对话历史
- `pendingIdeogramOutput` — 待 Apply 的 `IdeogramOutput`
- `duplicateBox / cutBox / copyBox / pasteBox / bringToFront / sendToBack` — 框操作（内部剪贴板）
- `setCanvasBackgroundUrl(url)` — 设置/清除画布背景图
- `undoStack / redoStack` — 撤销/重做（快照式，最多 50 步）
- `updateBox(id, updates, recordHistory?)` — 第三参数控制是否记录历史

### 坐标系统

- 画布像素：`canvasW × canvasH`（比例下拉 + 倍数滑块，基数 256，scale 1-16，roundTo16）
- 画板视口：`Artboard` 固定视口，`useArtboardZoom` 管理 zoom（10%~500%）和 pan（中键拖拽）
- 坐标转换：`screenToCanvas(sx, sy) = (sx - artboardRect.left - panX) / zoom`
- JSON 输出：归一化到 0-1000（`Math.round((val / max) * 1000)`）

### ComfyUI Workflow

`comfyui-workflow.ts` 包含硬编码的 Ideogram 4 双模型 CFG workflow。关键注入节点：`98:24`（prompt）、`98:27`/`98:28`（宽高）、`98:18`（seed）、`98:156`（Quality/Default/Turbo 预设）。

### 国际化（i18n）

- 语言状态在 React Context（`I18nProvider`），不在 Zustand store
- 默认英文，持久化 localStorage key `ideogram4-lang`
- `useI18n()` → `{ lang, setLang, t }`
- `t('section.key', { var: value })` 点分隔路径 + `{var}` 插值
- 翻译在 `src/i18n/translations.ts`

### 设计系统

黑暗主题，CSS 自定义属性定义在 `:root`（`src/index.css`）。主色 `--primary: #7c5cfc`，强调 `--accent: #00d4aa`，危险 `--danger: #ff5252`，背景 `--bg: #0d0d1a`，表面 `--surface: #161630`，文字 `--text: #e8e8f0` / `--text-secondary: #8888aa` / `--text-muted: #5a5a7a`。

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

优先使用 CodeGraph MCP 工具来阅读和理解代码，而非直接 `Read` 文件或 `Bash grep`。适用场景：理解代码结构、查找函数定义、分析调用链、搜索模式。直接读文件仅用于需要查看完整文件内容或精确修改的场景。

### 2. 使用弱模型 Subagent 并行任务

- **探索/搜索** → `haiku`；**一般编码** → `sonnet`；**复杂架构** → `opus`
- 3 个及以下独立任务 → 同时启动；4+ → 分批每批最多 3 个；被依赖的任务先完成

### 3. 使用 Kanban 管理任务链

**分支规则**：创建任务时必须显式传 `--base-ref <当前分支>`（`git branch --show-current`），禁止固定写 `--base-ref main` 或省略。依赖链（`task link`）中的任务会自动启动，无需手动 `task start`。

```bash
CURBR=$(git branch --show-current)
kanban task create --title "Task 1" --prompt "..." --base-ref "$CURBR" --project-path /path/to/project
kanban task link --task-id <id2> --linked-task-id <id1> --project-path /path/to/project
```

**故障处理**（错误示例：缺少 `--base-ref` 可能创建 detached HEAD；固定 `--base-ref main` 在特性分支上会基于错误分支创建）：
- 任务完成但代码未合并 → `git cherry-pick <commit>`
- 并行任务冲突 → 优先采用最后完成的代码，再手动修复
- 任务 worktree 在 `~/.cline/worktrees/<task-id>/`

**依赖链规则**：见 @KANBAN.md

### 4. GitHub Pages 部署规则

部署地址 `https://gp.hrfuqiang.top/ideogram4-editor/`，自定义域名通过 `SurpassHR.github.io` 管理。

**核心配置**：
- `vite.config.ts` 中 `base` 必须用动态模式：`base: process.env.GITHUB_ACTIONS ? '/ideogram4-editor/' : '/'`（不要用 `base: './'`，有已知 Vite bug）
- 自定义域名通过 `public/CNAME` → `gp.hrfuqiang.top`
- `package.json` 中 `"homepage": "https://gp.hrfuqiang.top/ideogram4-editor/"`

**Workflow 规范**：
- 使用官方 artifact 管线，**禁止第三方 actions**（如 `peaceiris/actions-gh-pages`）
- actions 版本：`checkout@v6`、`setup-node@v6`、`upload-pages-artifact@v5`、`deploy-pages@v5`；不要降级（`@v4` 在 Node 24 下不可用）
- permissions：`contents: read`, `pages: write`, `id-token: write`

**红线**：
- **不要通过 API 删除 Pages 配置**，重建后可能 `status: null` 空转导致 404
- **不要修改 src/ 来适配部署**——hash 路由无需 404.html
- Pages Source 必须设为 **GitHub Actions**（非分支），这是手动步骤

### 5. 不重复造轮子：优先复用已有 UI 模式

修改或新增 UI 功能时，**必须先搜索项目中是否已有相同或相似的实现**（用 `ffgrep` 搜索 CSS 类名/组件名/功能关键词），优先复用。

### 6. 剪贴板粘贴/外部数据导入规则

- 事件：用 `document.addEventListener('paste', handler)`（原生事件），不用 React `onPaste`
- 区域过滤：双向检查 `el.contains(target) || target.contains(el)`
- clipboardData.items：**一次性读取全部缓存**到内存，不要多次读取
- 大图：用 `URL.createObjectURL(file/blob)`（瞬时），不用 `FileReader.readAsDataURL`（大图卡死）
- keydown：只在确有必要时 `e.preventDefault()`，不要无差别拦截
- Demo 流程：涉及外部数据导入时，先做可交互 demo 验证真实数据流，再改项目代码

### 7. 前端修改后必须用 Playwright 验证无白屏

每次修改前端代码后，**必须用 Playwright 验证页面正常渲染**。验证命令见「视觉验证」章节。

- 白屏判定：`Failed to load module`、`Uncaught TypeError`、`MIME type mismatch`（非 favicon 404）
- 常见原因：Vite 模块缓存 → `pkill -f vite` 重启；TypeScript 错误 → 先 `npx tsc --noEmit`；CSS 拼写错误；Store 字段缺初始值

### 8. Commit 前必须通过 test 和 build

每次 commit 前，**必须先确保 `npm run test` 和 `npm run build` 都通过**：

```bash
npm run test    # Vitest 测试套件全部通过
npm run build   # tsc -b && vite build 编译+打包无错误
```

**红线**：
- ❌ 不允许在 test 或 build 失败时提交
- ❌ 不允许只 `tsc --noEmit` 代替 `tsc -b`——`tsc -b` 使用项目引用，检查更严格
