# 浮动图层面板设计

## 问题

画布上 box 存在重叠时，上层 box 拦截所有 Pointer Events，下层 box 无法通过鼠标直接选中。用户需要一种不依赖鼠标点击的选中机制。

## 设计目标

- 提供一个始终可访问的 box 列表，解决「点不到下层 box」的问题
- 单击列表项即可选中任何 box，不受重叠遮挡影响
- 选中后淡化其他 box 以增强可见性，便于后续鼠标拖拽操作
- 极简：不增加复杂交互（无拖拽排序），复用现有层级管理（右键菜单）

## 方案：画布内浮动图层面板

### 定位

画布右上角，一个图标按钮（图层堆叠 icon）触发展开/收起浮动面板。与 `CanvasChatPanel`（画布底部居中）位置不同、用途独立，不互斥。

### 组件

- **`LayerPanel.tsx`**（合并按钮 + 面板为一体）

### 面板布局

```
┌──────────────────────┐
│ Layers (3)       ✕   │  ← 标题栏 + 关闭按钮
├──────────────────────┤
│ 🔴 Button — Submit   │  ← 选中态（primary 背景高亮）
│ 🟢 Card — Desc text  │
│ 🔵 Background frame  │  ← 未选中
└──────────────────────┘
```

- 列表顺序：渲染顺序，**上层 box 在顶部**（Figma 模式）
- 每行：色块圆点（box 的 `colors[0]` 或 fallback）+ box text / id 回退 + 右侧视觉把手
- 选中行：`background: rgba(124, 92, 252, 0.2)` 高亮
- 面板高度自适应，最多显示 `max-height` 后滚动

### 交互

| 操作 | 行为 |
|---|---|
| 单击展开按钮 | toggle 面板显示/隐藏，store `isLayerPanelOpen` |
| 单击层级列表行 | `store.selectBox(boxId)`，画布同步选中 |
| 单击 ✕ | 关闭面板 |
| 点击画布空白处 | 取消选中时自动关闭面板（或仅关闭选中） |
| Escape | 关闭面板（同其他浮动面板行为） |

### 淡化其他 box 机制

- 当 `selectedBoxId` 非 null 时，未选中的 box 应用 CSS `opacity: 0.25`
- 选中 box 保持 `opacity: 1.0`
- 取消选中 → 恢复所有 box 正常透明度
- store 新增派生产品 `isAnyBoxSelected: boolean`

### 边界情况

- **无 box**：面板显示空状态提示 `t('layerPanel.empty')`，展开按钮置灰或隐藏
- **box 被删除**：面板中对应行自动消失（box 数组驱动渲染）
- **box 数量多**：面板纵向滚动，列表区域 `overflow-y: auto`
- **多个 box 选中**（多选模式下）：所有选中行高亮

### 排除的功能（有意的边界）

- ❌ 拖拽排序（层级通过右键菜单「上移一层/下移一层/置顶/置底」管理）
- ❌ 可见性 toggle（淡化机制替代 hide/show）
- ❌ 与 CanvasChatPanel 互斥或避让

### 状态变更

store 新增：

```ts
isLayerPanelOpen: boolean    // 面板展开/收起
toggleLayerPanel: () => void // 切换面板状态
```

无需新增其他 store 字段——选中状态复用已有的 `selectedBoxId` / `selectedBoxIds`。

### 淡化效果的 CSS 实现

在 `BoundingBox` 组件中根据 `isSelected` 和 `selectedBoxIds.length > 0`（其他 box 有选中）动态设置透明度：

```css
/* 当画布上有 box 被选中时，非选中 box 透明度降低 */
.bounding-box.dimmed {
  opacity: 0.25;
  transition: opacity 0.2s ease;
}
```

或者通过 store 的派生选择器驱动。

### 视觉风格

与 CanvasChatPanel 一致：
```
background: rgba(22, 22, 48, 0.92)
backdrop-filter: blur(20px)
border: 1px solid rgba(124, 92, 252, 0.25)
border-radius: 8px
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45)
font-size: 12px
max-width: 240px
```

### 新增/修改文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/store/index.ts` | 修改 | 新增 `isLayerPanelOpen` + `toggleLayerPanel` action |
| `src/components/canvas/LayerPanel.tsx` | 新增 | 浮动图层面板组件 |
| `src/components/canvas/Artboard.tsx` | 修改 | 引入 LayerPanel，渲染在画布区域内 |
| `src/components/canvas/BoundingBox.tsx` | 修改 | 根据 store 状态添加 dim 样式 |
| `src/index.css` | 修改 | 添加 `.layer-panel-*` 样式 + `.bounding-box.dimmed` |
| `src/i18n/translations.ts` | 修改 | 添加 `layerPanel.*` 翻译条目 |
