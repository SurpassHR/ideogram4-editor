# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Ideogram JSON Prompt 可视化编辑器 — 在画布上拖拽创建边界框，配置描述与颜色，生成 Ideogram 4 图像生成模型所需的 JSON prompt，并通过 ComfyUI API 生成图片。

## 技术栈

- React 19 + TypeScript + Vite 7
- Zustand 5 状态管理
- Tailwind CSS v4
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
│   └── translations.ts              # 中英双语字典（~90 条目），按 UI 区域组织
├── store/
│   ├── index.ts                      # Zustand store（useEditorStore），单一数据源
│   └── __tests__/
│       └── index.test.ts             # Store 单元测试（openChat, selectBox, editingBoxId）
├── types/
│   ├── index.ts                      # Box, IdeogramOutput, GenerationStatus 等类型
│   └── chat.ts                       # ChatMessage 类型（id, role, content, timestamp, adopted）
├── hooks/
│   ├── usePointerInteraction.ts      # 画布 Pointer Events：绘制/拖拽/缩放 boxes + 单击/双击检测
│   ├── useImageDrop.ts               # 图片拖放导入，PNG 元数据提取
│   ├── useComfyUIGeneration.ts       # ComfyUI 生成流程编排
│   ├── useArtboardZoom.ts            # 画板缩放/平移：wheel 缩放+中键拖拽+坐标转换
│   ├── useChatPanel.ts               # AI 对话面板逻辑：消息发送/采纳/清空/模型选择
│   └── __tests__/
│       └── usePointerInteraction.test.tsx  # 交互 hook 测试（单击选中/拖拽/双击编辑）
├── components/
│   ├── layout/
│   │   ├── App.tsx                   # 根组件：HeaderControls + MainContent
│   │   ├── HeaderControls.tsx        # 顶部栏：画布宽高滑块 + 重置 + 语言切换
│   │   └── MainContent.tsx           # 主布局：左列（Artboard+JSON+生成）右列（面板）
│   ├── canvas/
│   │   ├── Artboard.tsx              # 画板容器：固定视口、滚轮缩放+中键平移、缩放控件
│   │   ├── CanvasArea.tsx            # 交互式画布（Pointer Events）+ ChatPanel 渲染
│   │   ├── BoundingBox.tsx           # 边界框：文字标签 + inline 编辑 input + ChatBubbleButton + resize
│   │   ├── ChatBubbleButton.tsx      # ✨ 按钮：选中 box 时在右上角边框，编辑时在 input 内部右侧
│   │   └── __tests__/
│   │       └── BoundingBox.test.tsx  # BoundingBox 组件测试（文字/编辑/sparkle 按钮）
│   ├── panels/
│   │   ├── GlobalSettingsPanel.tsx    # 全局设置：模式/描述/美学/光照/媒介/背景/调色板
│   │   ├── BoxPropertiesPanel.tsx     # 边界框属性：模式/文本/描述/调色板/删除
│   │   ├── ColorPalette.tsx          # 可复用颜色选择器 + 色板组件
│   │   └── GlowGrid.tsx             # 装饰性交互式发光点阵背景容器
│   ├── json/
│   │   └── JsonToolbar.tsx           # 生成 JSON / 从粘贴加载
│   ├── comfyui/
│   │   ├── ComfyUIControls.tsx       # 生成控制：种子滑块/API URL/生成按钮
│   │   └── ImagePreview.tsx          # 生成结果图片展示
│   └── llm/
│       ├── LlmPanel.tsx              # LLM 工具面板：提供商列表 + 配置入口
│       ├── LlmConfigPanel.tsx        # LLM 配置模态框：CRUD + 模型拉取
│       ├── types.ts                  # LlmProvider, ProviderKind 类型 + 常量
│       └── api.ts                    # LLM 提供商 CRUD（localStorage）+ 模型 API 调用
│   └── chat/
│       ├── ChatPanel.tsx             # AI 对话浮动面板（createPortal→body），rAF 平滑跟随 box 移动
│       └── ChatMessage.tsx           # 用户/AI 消息气泡 + 采纳/忽略按钮
├── utils/
│   ├── coordinates.ts               # 坐标归一化/反归一化（0-1000 ↔ 像素）
│   ├── json-serializer.ts           # generateJSON() + parseBoxesFromJSON()
│   ├── png-metadata.ts              # 从 PNG tEXt chunk 提取 prompt/workflow 元数据
│   └── comfyui-api.ts               # 轮询 ComfyUI /history 端点
├── services/
│   └── llm-chat.ts                  # sendChatMessage() 多提供商 LLM API 调用（OpenAI/Anthropic/Gemini/OpenAI_compat）
└── workflow/
    ├── comfyui-workflow.ts           # 静态 ComfyUI workflow JSON 模板
    └── workflow-mutator.ts           # 向模板注入 prompt/width/height/seed
```

## 核心架构

### 数据流

1. 用户在画布上拖拽创建 `bounding-box`（Pointer Events 驱动，`usePointerInteraction` hook）
2. 单击 box 选中，双击 box 进入文字内联编辑模式（Enter 保存 / Escape 取消）
3. 点击 ✨ 按钮（选中 box 右上角，或编辑时在 input 内部右侧）打开 AI 对话面板
4. 画布置于 `Artboard` 画板容器中，支持滚轮缩放（以鼠标位置为中心）和中键拖拽平移
3. 每个 box 存储为对象：`{ id, x, y, w, h, mode, text, desc, colors }`
4. 全局状态存储在 Zustand store（`useEditorStore`）中
5. `generateJSON()` 将 boxes 坐标归一化到 0-1000 范围，合并全局设置，输出 JSON
6. `generateImage()` 将 JSON 注入 ComfyUI workflow 模板，调用 ComfyUI API 生成图片

### 关键 Store 字段

- `boxes[]` — 所有边界框的状态数组
- `globalPalette[]` — 全局调色板（最多 16 色）
- `photoArtStyleMode` — `MODE_PHOTO`(0) 或 `MODE_ARTSTYLE`(1)
- `canvasW / canvasH` — 画布尺寸（256-4096）
- `generationStatus` — `'idle' | 'generating' | 'polling' | 'done' | 'error'`
- `apiUrl` — ComfyUI API 地址（默认 `http://localhost:8188`）
- `editingBoxId` — 当前正在内联编辑的 box ID（`null` 表示无编辑），双击 box 进入编辑模式
- `activeChatBoxId` — 当前打开 AI 对话的 box ID（`null` 表示未打开），通过点击 ✨ 按钮打开
- `isChatOpen` — AI 对话面板是否打开
- `chatHistories` — 每个 box 的对话历史（`Record<string, ChatMessage[]>`）
- `chatModel` — 选中的 LLM 模型标识（格式 `providerId:modelName`，持久化 localStorage `ideogram4-chat-model`）

### 坐标系统

- 画布实际像素：`canvasW × canvasH`（slider 控制，256-4096）
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
- 语言切换按钮在 `HeaderControls` 中（右上角 EN/中文）
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