# Artboard 顶部悬浮工具栏设计

## 概述
将画布比例/尺寸控制栏从 MainContent（画板上方流式布局）移至 Artboard 内部，作为 absolute 定位的顶部悬浮栏，风格与右下角缩放控件一致（半透明磨砂背景）。

## 动机

- 比例/尺寸控件与画布操作在空间上更接近，减少视觉跳跃
- 释放 MainContent 顶部空间，让画板区域更突出

## 变更清单


### 修改文件

|
|---|
| `src/utils/canvas-dims.ts` | **新** — `computeCanvasDims` 工具函数 |
| `src/store/index.ts` | 新增 `canvasScale`, `canvasCustomW`, `canvasCustomH` + actions；`setCanvasRatio` 改为同步计算尺寸 |
| `src/components/layout/MainContent.tsx` | 删除 `<GlowGrid>` 控件块，无状态简化 |
| `src/components/canvas/Artboard.tsx` | 渲染 `<ArtboardToolbar />` |
| `src/components/canvas/ArtboardToolbar.tsx` | **新** — 顶部悬浮工具栏组件 |
| `src/index.css` | 新增 `.artboard-toolbar` 样式 |
### 不修改

- 右下角缩放控件（`.artboard-controls`）
- CanvasChatPanel
- GlowGrid 组件本身
- 比例预设常量、i18n 键
- CanvasPage 布局与右侧面板

## 组件结构

```
CanvasPage (MainContent.tsx)
└── <Artboard>
    ├── .artboard-toolbar (新增, absolute top)
    │   ├── 比例下拉 (SelectMenu)
    │   ├── [custom 宽高输入: 仅在 custom 比例时显示]
    │   ├── 倍数滑块 + 数字输入
    │   └── 实时尺寸显示 (canvasW × canvasH)
    ├── .artboard-controls (缩放控件, 右下角, 不变)
    ├── <CanvasArea />
    └── <CanvasChatPanel />
```

## 状态管理

新增 store 字段（`src/store/index.ts`）：

```typescript
interface EditorState {
  // … 现有字段 …
  canvasScale: number;    // 倍数 1-16，默认 4
  canvasCustomW: number;  // custom 比例宽基数，默认 16
  canvasCustomH: number;  // custom 比例高基数，默认 9
}

interface EditorActions {
  setCanvasScale: (scale: number) => void;
  setCanvasCustom: (w: number, h: number) => void;
}
```

`setCanvasRatio` 的实现也同步更新：设置 ratio 时自动根据当前 scale/custom 重算 `canvasW`/`canvasH`（见下方数据流）。

## 数据流

将 `computeCanvasDims`（目前位于 `MainContent.tsx`）提取到共享工具函数 `src/utils/canvas-dims.ts`。

Store action 在设置 scale/custom/ratio 时直接计算并更新 `canvasW`/`canvasH`：

```typescript
// setCanvasScale
setCanvasScale: (scale) => {
  const state = get();
  const { w, h } = computeCanvasDims(state.canvasRatio, scale, state.canvasCustomW, state.canvasCustomH);
  set({ canvasScale: scale, canvasW: w, canvasH: h });
},

// setCanvasCustom
setCanvasCustom: (w, h) => {
  const state = get();
  const { w: newW, h: newH } = computeCanvasDims(state.canvasRatio, state.canvasScale, w, h);
  set({ canvasCustomW: w, canvasCustomH: h, canvasW: newW, canvasH: newH });
},

// setCanvasRatio 也改为同步计算尺寸
setCanvasRatio: (ratio) => {
  const state = get();
  const { w, h } = computeCanvasDims(ratio, state.canvasScale, state.canvasCustomW, state.canvasCustomH);
  set({ canvasRatio: ratio, canvasW: w, canvasH: h });
},
```

`CanvasPage` 不再需要 `applyDimensions` — 用户操作 → store action → 自动更新 `canvasW`/`canvasH`。`ArtboardToolbar` 直接从 store 读取全部字段。

## 样式

新增 CSS 类 `.artboard-toolbar`，风格与 `.artboard-controls` 一致：

```css
.artboard-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(22, 22, 48, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 14px;
  pointer-events: auto;
}
```

## 层级关系

```
artboard (position: relative)
  z-index 层级:
  0  - 背景 + grid 点阵
  5  - 画布内容 (CanvasArea 内部)
  40 - .artboard-toolbar (新增)
  50 - .artboard-controls (缩放，保持原样)
  60 - CanvasChatPanel (portal→body, 独立层级)
```

## 测试

- `ArtboardToolbar` 渲染测试：验证控件存在、custom 比例时的宽高输入显示/隐藏
- Store 测试：新增字段的 getter/setter、与 `setCanvasDimensions` 联动
- 不需要修改现有 pointer interaction / bounding box 测试

## 不涉及

- 右下角缩放控件行为
- 画布交互逻辑 (pointer events, drag, resize)
- 国际化 (i18n)
- JSON 生成 / ComfyUI 集成
