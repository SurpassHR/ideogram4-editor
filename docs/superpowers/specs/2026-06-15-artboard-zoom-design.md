# Artboard 画板缩放平移改造

**日期**: 2026-06-15
**状态**: 设计完成

## 上下文

当前画布直接嵌入布局，CSS `transform: scale()` 自适应容器（最大 800px 高），缩放范围 ≤ 1（只缩小不放大），无平移能力。用户需要放大查看画布细节的能力，类似 Figma 的视口模型。

## 目标

为画布增加外层画板（Artboard），画板固定大小填满左侧列，画布置于画板中，支持鼠标滚轮缩放（10%~500%）和中键拖拽平移。

## 架构概览

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/components/canvas/Artboard.tsx` | 画板容器组件：固定视口、渲染画布、绑定滚轮/中键事件、缩放控件 |
| `src/hooks/useArtboardZoom.ts` | zoom/pan 状态管理 hook：useRef 存储、坐标转换、fitToArtboard 计算 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/components/canvas/CanvasArea.tsx` | 移除本地 scale 计算和 ResizeObserver，改为接收 zoom/panX/panY props |
| `src/hooks/usePointerInteraction.ts` | 坐标转换改用 artboardRect + zoom + panX/panY |
| `src/components/layout/MainContent.tsx` | 用 `<Artboard>` 替换 `<CanvasArea>` |
| `src/components/layout/HeaderControls.tsx` | 滑块旁增加可编辑数字输入框 |
| `src/store/index.ts` | 移除死代码 `scale` 字段及相关逻辑 |
| `src/index.css` | 新增 `.artboard`、`.artboard-controls` 样式 |

### 组件树

```
MainContent
  └── Artboard           ← 新增，固定视口，fills left column
        ├── ZoomControls  ← 缩放百分比 + 适应画板 + 重置视图
        └── CanvasArea    ← 改造，接收 zoom/panX/panY
              ├── BoundingBox × N
              └── drawingGhost
```

### 数据流

```
useArtboardZoom(artboardRef, canvasW, canvasH)
  → { zoom, panX, panY, handleWheel, handleMouseDown, ... }
  → Artboard 使用 zoom/panX/panY 做 CSS transform
  → CanvasArea 接收 zoom/panX/panY 传给 usePointerInteraction
  → usePointerInteraction 用 screenToCanvas() 做坐标转换
```

## 详细设计

### useArtboardZoom Hook

```typescript
// src/hooks/useArtboardZoom.ts

interface ArtboardZoomState {
  zoom: number;    // 缩放级别 [0.1, 5.0]
  panX: number;    // 画布在画板中的 X 偏移（px）
  panY: number;    // 画布在画板中的 Y 偏移（px）
}

function useArtboardZoom(artboardRef, canvasW, canvasH) {
  // 返回：
  //   zoom, panX, panY                          — 当前状态（渲染用）
  //   handleWheel(e)                             — onWheel 事件处理
  //   handleMouseDown/Move/Up(e)                 — 中键拖拽事件
  //   fitToArtboard()                            — 自适应画板
  //   resetView()                                — 重置视图（同 fitToArtboard）
  //   screenToCanvas(screenX, screenY)           — 屏幕坐标 → 画布坐标
}
```

**实现要点：**

- 用 `useRef` 存储 zoom/panX/panY，避免高频交互触发重渲染
- 每次 wheel/drag 结束时用 `forceUpdate`（useState 计数器）触发渲染更新缩放百分比
- 滚轮缩放以鼠标位置为中心：
  ```
  newZoom = clamp(zoom * (deltaY > 0 ? 0.9 : 1.1), 0.1, 5.0)
  panX = mouseX - (mouseX - panX) * (newZoom / oldZoom)
  panY = mouseY - (mouseY - panY) * (newZoom / oldZoom)
  ```
- `fitToArtboard()`: `zoom = min(artboardW / canvasW, artboardH / canvasH, 1)`，居中放置
- `screenToCanvas(sx, sy)`: `((sx - artboardRect.left - panX) / zoom, (sy - artboardRect.top - panY) / zoom)`

### Artboard 组件

```typescript
function Artboard() {
  // 从 store 读取 canvasW, canvasH
  // 使用 useArtboardZoom hook
  // ResizeObserver 监听 artboard 容器尺寸变化 → fitToArtboard()
  // useEffect 监听 canvasW/canvasH 变化 → fitToArtboard()

  return (
    <div ref={artboardRef} className="artboard"
         onWheel={handleWheel}
         onMouseDown={handleMouseDown}>
      <div className="artboard-controls">
        <button onClick={fitToArtboard}>适应画板</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={resetView}>重置视图</button>
      </div>
      <div style={{
        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
        transformOrigin: 'top left',
      }}>
        <CanvasArea zoom={zoom} panX={panX} panY={panY}
                    screenToCanvas={screenToCanvas} />
      </div>
    </div>
  );
}
```

**关键细节：**

- 画板 `overflow: hidden`，明显边框 + 阴影
- 缩放控件绝对定位在画板右下角，半透明背景
- 中键拖拽：`e.button === 1` 时激活，window 级别监听 mousemove/mouseup
- 中键拖拽时光标切换为 `grabbing`

### CanvasArea 改造

**移除：** ResizeObserver、本地 scale 计算、外层 wrapper 的固定宽度

**新增 props：**
```typescript
interface CanvasAreaProps {
  zoom: number;
  panX: number;
  panY: number;
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
}
```

画布 div 保持逻辑尺寸 `canvasW × canvasH`，不再需要 `transform: scale()`。缩放和平移已由外层 Artboard 处理。

### usePointerInteraction 改造

**坐标转换改造：**

```typescript
// 旧：基于 canvasRect + scale
// getPointerPos: (clientX - canvasRect.left) / scale

// 新：基于 artboardRect + zoom + panX/panY
// screenToCanvas(clientX, clientY) → (clientX - artboardRect.left - panX) / zoom
```

**新增参数：** `zoom`, `panX`, `panY`, `screenToCanvas`

**关键点：** `getBoundingClientRect()` 改用 `artboardRef`（画板的 rect），而非 canvas 的 rect。canvas 的 DOM rect 已被 CSS transform 影响，不适合做坐标转换基准。

### HeaderControls 滑块改造

每个滑块（W/H）增加数字输入框，与 range 滑块双向绑定：

```html
<div class="slider-group">
  <label>W</label>
  <input type="range" min=256 max=4096 step=16 value={canvasW} onChange={...} />
  <input type="number" min=256 max=4096 step=16 value={canvasW} onChange={...}
         style="width: 72px" />
</div>
```

### CSS 样式

```css
.artboard {
  flex: 1;
  min-height: 400px;
  position: relative;
  overflow: hidden;
  background: #0a0a14;
  border: 2px solid var(--border-focus);
  border-radius: 8px;
  box-shadow: 0 0 30px rgba(124, 92, 252, 0.08);
}

.artboard-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(22, 22, 48, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  pointer-events: auto;
}
```

### Store 清理

移除 `src/store/index.ts` 中：
- `scale` 状态字段（`scale: 1`）
- `setCanvasDimensions` 中的 `scale` 计算
- `resetCanvas` 中的 `scale` 计算
- 类型定义中 `EditorState` 的 `scale` 字段

## 交互模型总结

| 操作 | 行为 |
|------|------|
| 鼠标左键拖拽 | 绘制/移动/缩放边界框（不变） |
| 鼠标滚轮 | 缩放画布，以鼠标位置为中心，范围 10%~500% |
| 鼠标中键拖拽 | 平移画板视角，无范围限制 |
| 适应画板按钮 | 缩放使画布完整显示在画板中，居中放置 |
| 重置视图按钮 | 同适应画板 |
| 画布尺寸滑块变化 | 自动重置为适应画板 |

## 实现顺序

1. `useArtboardZoom` hook — 核心逻辑，独立可测试
2. `Artboard` 组件 — 画板容器 + 缩放控件
3. `CanvasArea` 改造 — 移除缩放逻辑，接收 props
4. `usePointerInteraction` 改造 — 坐标转换更新
5. `MainContent` 集成 — 替换 CanvasArea 为 Artboard
6. `HeaderControls` 改造 — 滑块增加数字输入
7. `index.css` — 画板 + 控件样式
8. Store 清理 — 移除死代码

## 验证

1. 启动 `npm run dev`，打开浏览器
2. 确认画板填满左侧列，有明显边框和阴影
3. 滚轮缩放：鼠标放在画布某位置滚动，画布以该点为中心缩放
4. 缩放范围：缩到最小 10%，放到最大 500%
5. 中键拖拽：按住中键拖动画板，画布跟随移动
6. 缩放控件：点击"适应画板"恢复完整显示，百分比数字实时更新
7. 滑块改变画布尺寸：画布自动适应画板，坐标正确
8. 滑块数字输入：直接编辑数字，画布尺寸同步变化
9. 边界框操作：绘制、移动、缩放边界框，坐标正确
10. JSON 生成：坐标归一化结果正确