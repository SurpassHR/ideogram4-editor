# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Ideogram JSON Prompt 可视化编辑器 — 在画布上拖拽创建边界框，配置描述与颜色，生成 Ideogram 4 图像生成模型所需的 JSON prompt，并通过 ComfyUI API 生成图片。

## 分支说明

- `main` — 原始单文件 HTML 版本（`index.html`，~884 行），纯静态，无构建工具
- `react-refactor` — **当前活跃开发分支**，Vite + React + TypeScript 重构

## 技术栈（react-refactor）

- **构建**: Vite 7 + TypeScript 5.9
- **框架**: React 19 + Zustand 5（状态管理）
- **样式**: Tailwind CSS 4
- **包管理**: pnpm

## 常用命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 类型检查 + 生产构建（tsc -b && vite build）
pnpm preview      # 预览生产构建
```

## 项目结构（react-refactor）

```
src/
├── main.tsx                          # 入口
├── index.css                         # Tailwind + 自定义样式
├── components/
│   ├── layout/
│   │   ├── App.tsx                   # 根组件，组合 HeaderControls + MainContent
│   │   ├── HeaderControls.tsx        # 画布尺寸 slider + Go 按钮
│   │   └── MainContent.tsx           # 左右双栏布局
│   ├── canvas/
│   │   ├── CanvasArea.tsx            # 画布区域，绑定 Pointer Events
│   │   └── BoundingBox.tsx           # 单个边界框 DOM 渲染
│   ├── panels/
│   │   ├── GlobalSettingsPanel.tsx   # 全局设置（模式、描述、美学、光照、调色板等）
│   │   ├── BoxPropertiesPanel.tsx    # 选中框属性（mode、text、desc、调色板）
│   │   ├── ColorPalette.tsx          # 通用调色板 UI 组件
│   │   ├── GlowPanel.tsx             # 发光面板容器
│   │   └── GlowGrid.tsx              # 交互式网格发光效果
│   ├── json/
│   │   └── JsonToolbar.tsx           # JSON 生成/加载按钮 + 文本区
│   ├── comfyui/
│   │   ├── ComfyUIControls.tsx       # API 地址、Seed、生成按钮
│   │   └── ImagePreview.tsx          # 生成结果展示
│   └── llm/
│       ├── LlmPanel.tsx              # LLM 面板入口
│       ├── LlmConfigPanel.tsx        # 多提供商 LLM 配置面板
│       ├── types.ts                  # LLM 相关类型
│       └── api.ts                    # LLM API 调用
├── hooks/
│   ├── usePointerInteraction.ts     # 画布指针交互（绘制/拖拽/缩放 box）
│   ├── useComfyUIGeneration.ts      # ComfyUI 图片生成 + 轮询
│   └── useImageDrop.ts              # 拖入 PNG 导入
├── store/
│   └── index.ts                     # Zustand 单一 store（所有编辑器状态）
├── types/
│   └── index.ts                     # Box, IdeogramOutput, InteractionState 等类型
├── utils/
│   ├── comfyui-api.ts               # ComfyUI API 调用
│   ├── coordinates.ts               # 坐标归一化/反归一化（0-1000 ↔ 实际像素）
│   ├── json-serializer.ts           # JSON 序列化/反序列化
│   └── png-metadata.ts              # PNG tEXt chunk 元数据提取
└── workflow/
    ├── comfyui-workflow.ts          # 硬编码的 ComfyUI workflow 模板
    └── workflow-mutator.ts          # 运行时注入参数到 workflow 节点
```

## 核心架构

### 状态管理（Zustand）

单一 store `useEditorStore` 管理所有状态，无 prop drilling：

- **画布**: `canvasW`, `canvasH`, `scale`, `setCanvasDimensions()`, `resetCanvas()`
- **Boxes**: `boxes[]`, `addBox()`, `updateBox()`, `removeBox()`, `selectBox()`, `clearBoxes()`
- **全局设置**: `highLevelDescription`, `aesthetics`, `lighting`, `medium`, `artStyle`, `background`, `photoArtStyleMode`, `globalPalette[]`
- **调色板**: `addGlobalColor()`, `removeGlobalColor()`, `addBoxColor()`, `removeBoxColor()`
- **ComfyUI**: `apiUrl`, `seed`, `generationStatus`, `generatedImageUrl`
- **JSON**: `generateJSON()` 返回 `IdeogramOutput`，`loadFromJSON()` 从 JSON 恢复全部状态

### 数据流

1. 交互层（`usePointerInteraction`）→ store 更新 boxes
2. UI 表单 onChange → store `setGlobalSetting()` / `updateBox()`
3. `generateJSON()` 从 store 读取所有状态，坐标归一化到 0-1000，输出 `IdeogramOutput`
4. `useComfyUIGeneration` 将 JSON 注入 workflow 模板，调用 ComfyUI API，轮询结果

### 坐标系统

- 画布实际像素：`canvasW × canvasH`（slider 控制，256-4096）
- 视觉缩放：`scale = canvasH > 800 ? 800 / canvasH : 1`
- JSON 输出坐标：归一化到 0-1000（`Math.round((val / max) * 1000)`）

### ComfyUI Workflow

硬编码的 Ideogram 4 双模型 CFG workflow，关键节点：
- `98:24`（CLIPTextEncode）— 注入生成的 JSON prompt
- `98:27`/`98:28` — 画布宽高
- `98:18`（RandomNoise）— seed 值
- `98:156`（CustomCombo）— Quality/Default/Turbo 预设选择

### Photo / Art Style 模式

`MODE_PHOTO`(0) 时 `medium` 强制为 `"photograph"` 且 disabled，JSON 输出 `style_description.photo` + `style_description.medium`；`MODE_ARTSTYLE`(1) 时输出 `style_description.medium` + `style_description.art_style`。