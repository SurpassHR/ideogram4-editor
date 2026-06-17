# Ideogram4 Editor

> Ideogram JSON Prompt 可视化编辑器 — 在画布上拖拽创建边界框，配置描述与颜色，生成 Ideogram 4 图像生成模型所需的 JSON prompt，并通过 ComfyUI API 生成图片。

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-7-646cff.svg)
![Zustand](https://img.shields.io/badge/Zustand-5-orange.svg)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 📖 项目简介

Ideogram4 Editor 是一个基于 Web 的可视化编辑器，专为 [Ideogram 4](https://ideogram.ai/) 图像生成模型设计。它允许用户通过直观的画布交互方式创建结构化的 JSON prompt，而无需手动编写复杂的 JSON 格式。

核心工作流程：在画布上拖拽创建边界框（bounding box）→ 为每个框配置模式、文本描述和颜色 → 合并全局设置（美学、光照、媒介等）→ 生成标准化的 JSON prompt → 通过 ComfyUI API 直接生成图片。

---

## ✨ 功能特性

- 🖊️ **画布交互** — 拖拽创建、移动、缩放边界框；支持精确的像素级定位
- 🔍 **画板缩放/平移** — 鼠标滚轮缩放（以光标为中心）、中键拖拽平移，10%~500% 缩放范围
- 🎨 **颜色调色板** — 全局调色板（最多 16 色）+ 每个边界框独立调色板
- 📝 **双重模式** — 照片模式（`MODE_PHOTO`）和艺术风格模式（`MODE_ARTSTYLE`），每个边界框可独立设置 `obj` 或 `text` 模式
- 🌐 **中英双语** — 内置国际化支持，一键切换中/英界面，语言偏好持久化到 localStorage
- 📋 **JSON 生成/加载** — 一键生成标准化 JSON prompt，支持从剪贴板粘贴加载已有 JSON
- 🖼️ **图片拖放导入** — 拖入 PNG 图片自动设置画布尺寸并显示底图；如果 PNG 包含 ComfyUI 元数据，自动提取并加载嵌入的 prompt
- 🔌 **ComfyUI 集成** — 直接调用本地 ComfyUI API 生成图片，支持种子控制和质量预设（Quality/Default/Turbo）
- 🤖 **LLM 辅助** — 配置多个 LLM 提供商（OpenAI、Anthropic、Gemini、OpenAI 兼容），为 prompt 优化提供 AI 辅助
- 💬 **AI 对话面板** — 选中边界框后点击 ✨ 按钮，打开浮动 AI 对话面板，可与 LLM 对话优化描述，支持采纳/忽略 AI 回复、提示词预设模板、LLM 回复语言选择
- 🖼️ **Box 图像参考** — 拖放/上传/粘贴图像到边界框，作为视觉背景和多模态 AI 参考图输入
- 📑 **右侧面板 Tab 导航** — 全局设置、边界框属性两个面板合并为 Tab 导航，节省垂直空间
- ⚙️ **独立设置页** — Hash 路由驱动（`/#/settings`），LLM 提供商管理和提示词预设管理统一入口
- 🎭 **黑暗主题** — 精心设计的深色 UI，自定义 CSS 变量驱动的设计系统，零外部 UI 组件库依赖
- ✨ **发光点阵背景** — 交互式 CSS Masking + JS 坐标映射的动态发光点阵装饰效果

---

## 📖 使用方法

> 确保已安装依赖（见下方 [安装与运行](#-安装与运行)），`npm run dev` 后浏览器打开 `http://localhost:5173`。

### 基本工作流程

1. **设置画布尺寸** — 顶部比例下拉框（1:1、3:2、4:3、16:9 等）+ 倍数滑块（1×–16×），基数 256px，范围 256–4096px
2. **创建边界框** — 在画布上拖拽鼠标创建矩形框，每个框代表画面中一个区域
3. **配置框属性** — 单击选中框，右侧面板（边界框 Tab）设置：
   - **模式**：`obj`（对象模式 / 照片）或 `text`（文本模式 / 艺术风格）
   - **文本**：框中显示的文字标签
   - **描述**：该区域的详细视觉描述（中英文均可）
   - **颜色**：分配颜色（最多 16 色），同色框被视为同一对象的不同部分
4. **配置全局设置** — 右侧面板切换到「全局」Tab，设置：风格模式、全局描述、美学/光照/媒介参数、全局调色板
5. **生成 JSON Prompt** — 点击底部「生成 JSON」按钮，编辑器将框坐标归一化到 0-1000，合并全局设置，输出标准化 JSON
6. **复制 / 加载** — 复制 JSON 到剪贴板；也可从剪贴板粘贴 JSON 反向加载到编辑器

### 进阶操作

| 操作 | 方式 |
|------|------|
| 框内联编辑 | 双击框 → 输入文字 → Enter 保存 / Escape 取消 |
| AI 对话优化 | 选中框 → 点击右上角 ✨ 按钮 → 与 LLM 对话优化描述（需在 `/#/settings` 配置 LLM 提供商） |
| 框参考图 | 拖放/粘贴图片到边界框，作为视觉参考或多模态 AI 输入 |
| 画布背景图 | 右键画布空白 →「设置背景图」，导入底图参考（opacity 0.5） |
| 框操作 | 右键框 → 复制/剪切/删除/层级调整/图像管理/AI Chat |
| 键盘快捷键 | `Ctrl+D` 复制框 · `Ctrl+C` 复制到剪贴板 · `Ctrl+X` 剪切 · `Ctrl+V` 粘贴 · `Delete` 删除 |
| 画板缩放/平移 | 滚轮缩放（以光标为中心）· 中键拖拽平移 · 底部滑块（10%–500%） |
| PNG 元数据导入 | 拖入 ComfyUI 生成的 PNG → 自动提取嵌入的 prompt 并加载 |

### 图片生成（需本地 ComfyUI）

1. 确保 ComfyUI 运行在 `http://localhost:8188`（可在界面修改地址）
2. 安装所需模型文件（详见 [ComfyUI 配置说明](#-comfyui-配置说明)）
3. 配置边界框和全局设置 → 设置种子值 → 点击「生成图片」
4. 编辑器自动注入 workflow → POST `/api/prompt` → 轮询 `/history/{id}` → 显示结果

---

## 🛠️ 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 19 |
| 类型系统 | TypeScript | 5.9 |
| 构建工具 | Vite | 7 |
| 状态管理 | Zustand | 5 |
| 样式方案 | Tailwind CSS | v4 |
| UI 组件 | 自建组件 | 零外部 UI 库 |
| 图像生成 | ComfyUI API | `/api/prompt` + `/history/{id}` |
| 国际化 | React Context | 自建 i18n 系统 |

---

## 📁 项目结构

```
src/
├── main.tsx                              # 入口，挂载 App + I18nProvider
├── index.css                             # Tailwind + 自定义 CSS 变量 + 全局样式
├── i18n/
│   ├── context.tsx                       # I18nProvider + useI18n() hook（t() 函数 + 插值）
│   └── translations.ts                   # 中英双语字典（~90 条目），按 UI 区域组织
├── store/
│   └── index.ts                          # Zustand store（useEditorStore），单一数据源
├── types/
│   ├── index.ts                          # Box, IdeogramOutput, GenerationStatus 等类型
│   └── chat.ts                           # ChatMessage 类型（id, role, content, timestamp, adopted）
├── hooks/
│   ├── usePointerInteraction.ts          # 画布 Pointer Events：绘制/拖拽/缩放 boxes + interactionMode 状态
│   ├── useImageDrop.ts                   # 图片拖放导入，PNG 元数据提取
│   ├── useComfyUIGeneration.ts           # ComfyUI 生成流程编排
│   ├── useArtboardZoom.ts                # 画板缩放/平移：wheel 缩放+中键拖拽+坐标转换
│   ├── useChatPanel.ts                   # AI 对话面板逻辑：消息发送/采纳/清空/模型选择
│   └── useHashRoute.ts                   # Hash 路由 Hook：监听 hashchange 事件
├── components/
│   ├── layout/
│   │   ├── App.tsx                       # 根组件：Hash 路由（#/ → CanvasPage, #/settings → SettingsPage）
│   │   ├── HeaderControls.tsx            # 全局 Header：Logo + Canvas/Settings 导航 + 语言切换
│   │   ├── MainContent.tsx               # CanvasPage：比例+倍数画布控件 + 主布局
│   │   └── SettingsPage.tsx              # 设置页：左右两栏（LLM 提供商 + 提示词预设）
│   ├── canvas/
│   │   ├── Artboard.tsx                  # 画板容器：固定视口、滚轮缩放+中键平移、缩放控件
│   │   ├── CanvasArea.tsx                # 交互式画布（Pointer Events）+ ChatPanel 渲染
│   │   ├── BoundingBox.tsx               # 单个边界框覆盖层 + resize handle + ChatBubbleButton
│   │   └── ChatBubbleButton.tsx          # ✨ 按钮：选中 box 右上角，点击打开 AI 对话面板
│   ├── panels/
│   │   ├── GlobalSettingsPanel.tsx        # 全局设置：模式/描述/美学/光照/媒介/背景/调色板
│   │   ├── BoxPropertiesPanel.tsx         # 边界框属性：模式/文本/描述/调色板/删除
│   │   ├── ColorPalette.tsx              # 可复用颜色选择器 + 色板组件
│   │   └── RightPanelContainer.tsx       # 右列 Tab 导航容器（全局/边界框 两 tab）
│   ├── json/
│   │   └── JsonToolbar.tsx              # 生成 JSON / 从粘贴加载
│   ├── comfyui/
│   │   ├── ComfyUIControls.tsx           # 生成控制：种子滑块/API URL/生成按钮
│   │   └── ImagePreview.tsx              # 生成结果图片展示
│   └── llm/
│       ├── LlmPanel.tsx                  # LLM 工具面板：提供商列表 + 配置入口
│       ├── LlmConfigPanel.tsx            # LLM 配置面板（模态框 + 内嵌模式）：CRUD + 模型拉取
│       ├── types.ts                      # LlmProvider, ProviderKind 类型 + 常量
│       └── api.ts                        # LLM 提供商 CRUD（localStorage）+ 模型 API 调用
│   └── chat/
│       ├── ChatPanel.tsx                 # AI 对话浮动面板（createPortal→body），预设/模型/语言 SelectMenu
│       ├── ChatMessage.tsx               # 用户/AI 消息气泡 + 采纳/忽略按钮
│       ├── PresetManagerPanel.tsx        # 预设管理面板（模态框 + 内嵌模式）：搜索/标签筛选/CRUD
│       └── SelectMenu.tsx                # 可复用 Portal 下拉选择菜单组件
│       └── ChatMessage.tsx               # 用户/AI 消息气泡 + 采纳/忽略按钮
├── utils/
│   ├── coordinates.ts                    # 坐标归一化/反归一化（0-1000 ↔ 像素）
│   ├── json-serializer.ts               # generateJSON() + parseBoxesFromJSON()
│   ├── png-metadata.ts                   # 从 PNG tEXt chunk 提取 prompt/workflow 元数据
│   └── comfyui-api.ts                    # 轮询 ComfyUI /history 端点
├── services/
│   └── llm-chat.ts                       # sendChatMessage() 多提供商 LLM API 调用
└── workflow/
    ├── comfyui-workflow.ts               # 静态 ComfyUI workflow JSON 模板
    └── workflow-mutator.ts               # 向模板注入 prompt/width/height/seed
```

---

## 🏗️ 核心架构

### 数据流

```
用户拖拽创建边界框 (Pointer Events → usePointerInteraction)
        ↓
画布显示边界框 (Artboard → CanvasArea → BoundingBox)
        ↓
Store 更新 boxes[] (Zustand useEditorStore)
        ↓
配置全局设置 + 每个框属性 (GlobalSettingsPanel + BoxPropertiesPanel)
        ↓
generateJSON() 归一化坐标到 0-1000 范围，合并全局设置
        ↓
输出标准化 JSON prompt (IdeogramOutput 结构)
        ↓
buildWorkflowPayload() 注入 ComfyUI workflow 模板
        ↓
POST /api/prompt → 轮询 /history/{id} → 显示生成图片
```

### Store 关键字段

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `canvasW / canvasH` | `1024 / 1024` | 画布尺寸（像素，通过比例下拉框 + 倍数滑块控制，256-4096） |
| `boxes[]` | `[]` | 所有边界框的状态数组 |
| `selectedBoxId` | `null` | 当前选中的边界框 ID |
| `globalPalette[]` | `[]` | 全局调色板（最多 16 色） |
| `photoArtStyleMode` | `1` (艺术风格) | 照片模式 (0) 或艺术风格模式 (1) |
| `apiUrl` | `http://localhost:8188` | ComfyUI API 地址 |
| `seed` | `42` | 生成随机种子 |
| `generationStatus` | `'idle'` | 生成状态：`idle | generating | polling | done | error` |
| `generatedImageUrl` | `null` | 生成图像的 URL |
| `activeChatBoxId` | `null` | 当前打开 AI 对话的 box ID |
| `isChatOpen` | `false` | AI 对话面板是否打开 |
| `chatHistories` | `{}` | 每个 box 的对话历史（`Record<string, ChatMessage[]>`） |
| `chatModel` | localStorage | 选中的 LLM 模型标识（格式 `providerId:modelName`） |

### 坐标系统

项目使用三层坐标系统：

| 层级 | 范围 | 说明 |
|------|------|------|
| **画布坐标** | `canvasW × canvasH` 像素 | 边界框的实际像素位置和尺寸 |
| **画板坐标** | 屏幕像素 + zoom/pan 偏移 | `screenToCanvas(sx, sy) = (sx - artboardRect.left - panX) / zoom` |
| **JSON 坐标** | 0-1000 整数 | 归一化输出：`Math.round((val / max) * 1000)` |

**坐标转换流程：**
- **屏幕 → 画布**：通过 `useArtboardZoom` hook 的 `screenToCanvas()` 方法，考虑画板偏移和缩放比例
- **画布 → JSON**：通过 `coordinates.ts` 的归一化函数，将像素值映射到 0-1000 整数范围
- **JSON → 画布**：通过反归一化函数，将 0-1000 值还原为像素坐标

### ComfyUI Workflow

`comfyui-workflow.ts` 包含一个硬编码的 Ideogram 4 双模型 CFG workflow 模板。`workflow-mutator.ts` 负责将生成的 JSON prompt 和用户配置注入到模板中。

**关键 workflow 节点：**

| 节点 ID | 类 | 说明 |
|---------|-----|------|
| `98:23` | 加载主扩散模型 | `ideogram4_fp8_scaled.safetensors` |
| `98:14` | 加载 CLIP | `qwen3vl_8b_fp8_scaled.safetensors` |
| `98:24` | CLIPTextEncode | **注入 JSON prompt 文本** |
| `98:27 / 98:28` | PrimitiveInt | **画布宽度/高度** |
| `98:18` | RandomNoise | **噪声种子** |
| `98:155` | DualModelGuider | 双模型 CFG（主模型 + 无条件模型） |
| `98:154` | 加载无条件模型 | `ideogram4_unconditional_fp8_scaled.safetensors` |
| `98:156` | CustomCombo | 质量预设：Quality (48步) / Default (20步) / Turbo (12步) |
| `98:17` | Ideogram4Scheduler | 自定义调度器（mu/std/步数） |

---

## 🚀 安装与运行

### 前置要求

- **Node.js** ≥ 18（推荐 20+）
- **npm** 或其他包管理器
- **ComfyUI** 本地实例（仅图片生成功能需要）

### 安装步骤

```bash
# 克隆仓库
git clone <repository-url>
cd ideogram4-editor

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

### 构建与预览

```bash
# 生产构建（TypeScript 类型检查 + Vite 打包）
npm run build

# 预览生产构建
npm run preview
```

---

## 📸 截图 / 演示

<!-- TODO: 添加项目截图 -->

| 功能 | 截图 |
|------|------|
| 画布交互（拖拽创建边界框） | ![画布交互](./docs/screenshots/canvas-interaction.png) |
| 边界框属性配置 | ![属性配置](./docs/screenshots/box-properties.png) |
| JSON Prompt 生成 | ![JSON 生成](./docs/screenshots/json-generation.png) |
| ComfyUI 图片生成 | ![图片生成](./docs/screenshots/image-generation.png) |
| LLM 配置面板 | ![LLM 配置](./docs/screenshots/llm-config.png) |

---

## 🔌 ComfyUI 配置说明

### 安装 ComfyUI

1. 按照 [ComfyUI 官方文档](https://github.com/comfyanonymous/ComfyUI) 安装 ComfyUI
2. 确保 ComfyUI 服务运行在默认端口 `8188`（即 `http://localhost:8188`）

### 安装所需模型

编辑器使用的 Ideogram 4 workflow 需要以下模型文件，放置在 ComfyUI 的 `models/` 目录下：

| 模型文件 | 目录 | 说明 |
|----------|------|------|
| `ideogram4_fp8_scaled.safetensors` | `models/diffusion_models/` | 主扩散模型 |
| `ideogram4_unconditional_fp8_scaled.safetensors` | `models/diffusion_models/` | 无条件模型（双模型 CFG） |
| `qwen3vl_8b_fp8_scaled.safetensors` | `models/text_encoders/` | CLIP 文本编码器 |

### 自定义 API 地址

如果 ComfyUI 运行在非默认地址，可在编辑器界面的「生成控制」区域修改 API URL，或直接修改 Store 默认值：

```typescript
// src/store/index.ts
apiUrl: 'http://your-comfyui-host:8188'
```

### 生成流程

1. 在编辑器中创建边界框并配置 prompt
2. 点击「生成图片」按钮
3. 编辑器将 JSON prompt 注入 workflow 模板，POST 到 `/api/prompt`
4. 自动轮询 `/history/{prompt_id}`（每 3 秒，超时 5 分钟）
5. 生成完成后在界面显示结果图片

---

## 🤖 LLM 配置说明

编辑器在独立设置页（`/#/settings`）中提供 LLM 提供商管理，支持配置多个 LLM 提供商用于 AI 辅助 prompt 优化。

### AI 对话功能

- **多模态图像参考**：可将边界框中的参考图作为多模态输入发送给 LLM（支持 OpenAI/Anthropic/Gemini 三种格式）
- **提示词预设**：内置 4 个预设模板（增强细节描述/中文优化/场景氛围/人物特征），支持自定义预设，模板变量替换（`{box_text}`, `{box_desc}`, `{box_colors}`, `{box_mode}`）
- **回复语言控制**：ChatPanel 中可选择 LLM 回复语言（自动/英文/中文）
- **采纳/忽略**：可直接将 AI 优化后的内容采纳到边界框描述中

### 支持的提供商

| 提供商 | 类型 | 说明 |
|--------|------|------|
| OpenAI | `openai` | GPT 系列 |
| Anthropic | `anthropic` | Claude 系列 |
| Google Gemini | `gemini` | Gemini 系列 |
| OpenAI 兼容 | `openai-compatible` | 任何兼容 OpenAI API 格式的服务（如 Ollama、vLLM 等） |

### 配置方式

1. 点击顶部导航栏的「⚙ Settings」进入设置页（`/#/settings`）
2. 在左侧 LLM Providers 面板中添加提供商：填写名称、API Key、Base URL
3. 点击「拉取模型列表」获取可用模型
4. 所有配置存储在浏览器 localStorage 中，不会发送到外部服务器

### 数据存储

LLM 配置完全存储在浏览器本地（localStorage），包括：
- 提供商列表及其连接参数
- API Key（⚠️ 注意：API Key 以明文存储在 localStorage，请确保浏览器环境安全）

---

## 🧭 开发指南

### 代码风格

- **组件结构**：功能划分明确，`layout/`（布局）、`canvas/`（画布）、`panels/`（面板）、`json/`（JSON 工具）、`comfyui/`（生成）、`llm/`（AI 辅助）
- **状态管理**：单一 Zustand store（`useEditorStore`）作为数据源，React Context 仅用于 i18n
- **样式方案**：Tailwind CSS v4 + CSS 自定义属性（`src/index.css` 中定义黑暗主题色板），零外部 UI 库
- **Hooks 模式**：复杂交互逻辑提取为自定义 hooks（`usePointerInteraction`、`useArtboardZoom`、`useComfyUIGeneration`、`useImageDrop`）

### 设计系统色板

```css
:root {
  --bg: #0d0d1a;           /* 主背景 */
  --surface: #161630;       /* 卡片/面板背景 */
  --surface-raised: #1e1e3a; /* 提升表面 */
  --primary: #7c5cfc;       /* 主色 */
  --primary-hover: #9575fd; /* 主色悬浮 */
  --accent: #00d4aa;        /* 强调色 */
  --danger: #ff5252;        /* 危险色 */
  --text: #e8e8f0;          /* 主文字 */
  --text-secondary: #8888aa; /* 次文字 */
  --text-muted: #5a5a7a;    /* 弱文字 */
}
```

### 国际化

- 翻译文件：`src/i18n/translations.ts`，按 UI 区域组织
- 使用方式：`t('section.key', { var: value })` 支持点分隔路径查找 + `{var}` 插值
- 新增翻译：在 `translations.ts` 中同时添加 `en` 和 `zh` 条目

### 常用开发命令

```bash
# 启动开发服务器
npm run dev

# TypeScript 类型检查
npx tsc -b

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

---

## 📄 许可证

[MIT](./LICENSE)
