# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Ideogram JSON Prompt 可视化编辑器 — 在画布上拖拽创建边界框，配置描述与颜色，生成 Ideogram 4 图像生成模型所需的 JSON prompt，并通过 ComfyUI API 生成图片。

## 技术栈

- 纯单文件 HTML（无框架、无构建工具、无外部依赖）
- 原生 DOM 操作 + Pointer Events API
- ComfyUI API 集成（`/api/prompt` + `/history/{id}` 轮询）

## 项目结构

```
index.html          # 唯一源文件，包含 HTML/CSS/JS（~884 行，~40KB）
```

## 核心架构

### 数据流

1. 用户在画布上拖拽创建 `bounding-box`（Pointer Events 驱动）
2. 每个 box 存储为对象：`{ id, x, y, w, h, mode, text, desc, colors }`
3. 全局状态存储在可变全局变量中：`boxes[]`, `globalPalette[]`, `selectedBoxId`, `canvasW/H`, `scale`
4. `generateJSON()` 将 boxes 坐标归一化到 0-1000 范围，合并全局设置，输出 JSON
5. `generateImage()` 将 JSON 注入硬编码的 ComfyUI workflow（`json_prompt` 变量），调用 ComfyUI API 生成图片

### 关键全局变量

- `json_prompt` — base64 编码的 ComfyUI workflow 模板（节点图），在 `generateImage()` 时动态注入参数
- `boxes[]` — 所有边界框的状态数组
- `globalPalette[]` — 全局调色板（最多 16 色）
- `photoArtStyleMode` — `MODE_PHOTO`(0) 或 `MODE_ARTSTYLE`(1)，影响 JSON 输出中 photo/medium/art_style 的字段排列

### 关键函数

| 函数 | 用途 |
|------|------|
| `initCanvas()` | 根据 slider 值重置画布尺寸和缩放 |
| `generateJSON()` | 将 boxes + 全局设置序列化为 Ideogram JSON |
| `generateImage()` | 将 JSON 注入 ComfyUI workflow 并调用 API |
| `waitForComfyUIResult()` | 轮询 ComfyUI `/history/{id}` 获取生成结果 |
| `extractComfyUIMetadata()` | 从 PNG 二进制中解析 tEXt chunk 提取 prompt/workflow 元数据 |
| `importImage()` | 拖入图片：设置画布尺寸、提取 PNG 元数据、重建 boxes 和参数 |
| `parseBoxesFromJSON()` | 从 JSON 反序列化 boxes 到画布（坐标从 0-1000 映射回实际像素） |
| `parseParametersFromJSON()` | 从 JSON 恢复全局设置面板的值 |

### 坐标系统

- 画布实际像素：`canvasW × canvasH`（slider 控制，256-4096）
- 视觉缩放：`scale = canvasH > 800 ? 800 / canvasH : 1`（保持可视区域不超过 800px 高）
- JSON 输出坐标：归一化到 0-1000（`Math.round((val / max) * 1000)`）

### ComfyUI Workflow

`json_prompt` 是一个硬编码的 Ideogram 4 双模型 CFG workflow，包含：
- 节点 `98:24`（CLIPTextEncode）：注入生成的 JSON prompt 作为正向条件
- 节点 `98:27`/`98:28`：画布宽高
- 节点 `98:18`（RandomNoise）：seed 值
- 节点 `98:156`（CustomCombo）：Quality/Default/Turbo 预设选择

## 运行方式

直接用浏览器打开 `index.html`，无需构建或服务器。需要本地 ComfyUI 实例（默认 `http://localhost:8188`）才能使用图片生成功能。