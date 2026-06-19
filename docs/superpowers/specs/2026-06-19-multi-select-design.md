# 画布多选（Multi-Select）设计文档

**日期**: 2026-06-19
**状态**: 设计中

## 概述

在画布上增加多选能力：按住 Ctrl/Cmd/Shift 拖拽创建矩形选区框选多个 box，或 Ctrl/Cmd/Shift+点击 toggle 单个 box 的选中状态，支持批量拖拽移动和批量快捷键操作。

## 动机

当前画布仅支持单选（`selectedBoxId: string | null`），用户无法同时操作多个 box。这限制了以下场景：

- 批量调整多个 box 的位置
- 批量删除/复制/剪切多个 box
- 快速选中某一区域内的所有 box

## 设计

### 1. Store 层变更

**新增字段：**

```ts
// 多选支持，替代 selectedBoxId 的主体地位
selectedBoxIds: string[]

// selectedBoxId 保留为同步兼容字段（兼容旧代码）
// 所有选择 action 同时维护 selectedBoxIds 和 selectedBoxId：
// selectedBoxIds.length === 1 时 selectedBoxId = selectedBoxIds[0]，否则 selectedBoxId = null
```

**新增方法：**

| 方法 | 签名 | 用途 |
|------|------|------|
| `selectBoxes` | `(ids: string[]) => void` | 批量设置选中 |
| `toggleBoxSelection` | `(id: string) => void` | Ctrl/Cmd/Shift+点击：toggle 单个 |
| `addToSelection` | `(id: string) => void` | 追加选中 |
| `removeFromSelection` | `(id: string) => void` | 取消选中 |
| `clearSelection` | `() => void` | 清空所有选中 |

**`selectBox(id)` 行为变更：**
- `selectBox(id: string)`：清空多选后单选该 box（即 `selectedBoxIds = [id]`）
- `selectBox(null)`（兼容旧代码）：清空选中（即 `selectedBoxIds = []`）

**批量操作方法变更：**

| 操作 | 多选时行为 |
|------|-----------|
| `removeBox` | 接受 `string \| string[]`，删除所有选中的 box |
| `duplicateBox` | 接受 `string \| string[]`，批量复制并偏移 |
| 内部剪贴板 | 从 `Box \| null` 改为 `Box[]` |
| `copyBox` / `cutBox` | 接受 `string \| string[]`，操作所有选中 box |
| `pasteBox` | 粘贴所有剪贴板中的 box，各偏移 +20,+20 |

### 2. 交互状态机变更

**新增模式：** `'pendingSelection' | 'marqueeSelect'`（追加到 `InteractionMode` 联合类型）

**状态转换：**

```
idle ──(Ctrl/Cmd/Shift+down)────────→ pendingSelection
pendingSelection ──(move > 4px)────→ marqueeSelect
pendingSelection ──(up on box)─────→ toggle 该 box → idle
pendingSelection ──(up on blank)───→ 保持当前选中 → idle
idle ──(down on box)────────────────→ [检查] → dragging（见下）
idle ──(click on blank)─────────────→ clearSelection → idle（不变）
```

**pointerdown 命中 box 时的关键判断（无修饰键）：**

- 如果命中的 box 已在 `selectedBoxIds` 中且 `selectedBoxIds.length > 1`：**不**清空多选，直接进入 dragging 模式，批量移动所有选中的 box
- 如果命中的 box 不在 `selectedBoxIds` 中或 `selectedBoxIds.length === 1`：清空多选，单选该 box，进入 dragging 模式（与现有行为一致）
- pointerup 时如果 `pointerMoved === false`（纯点击，未拖拽）：如果命中的 box 在 `selectedBoxIds` 中且 `selectedBoxIds.length > 1`，则**不清空多选**（保留多选状态）；否则清空多选并单选该 box

**修饰键说明：** `Ctrl` 在 Windows/Linux 上，`Cmd`（Meta）在 macOS 上。代码中统一使用 `e.ctrlKey || e.metaKey || e.shiftKey` 判断多选修饰键。

**pendingSelection 模式细节：**

- pointerdown 时先记录起点、命中的 box ID 和当前选中集合，不立即改变选择状态
- pointermove 超过 4px 阈值后进入 `marqueeSelect`，开始渲染选区矩形
- pointerup 且未超过阈值时：
  - 如果命中 box：调用 `toggleBoxSelection(boxId)`
  - 如果命中空白：不清空现有选择
- 这样避免 `Ctrl/Cmd/Shift+点击 box` 被误判为零尺寸框选，也避免拖拽框选被误判为点击 toggle

**marqueeSelect 模式细节：**

- 从 `pendingSelection` 转入时创建选区矩形 DOM（类似 drawing ghost）
- pointermove 时实时更新选区矩形尺寸（支持负向拖拽，自动翻转 x/w 或 y/h）
- pointerup 时使用 AABB 相交检测计算所有与选区重叠的 box，调用 `selectBoxes(overlappingIds)`
- 选区矩形样式：SVG 连续蚂蚁线动画边框 + 极淡填充

**dragging 模式变更：**

- 拖拽开始时，检查被拖拽的 box 是否属于 `selectedBoxIds`
- 如果是且 `selectedBoxIds.length > 1`，则记录所有选中 box 的初始位置
- 移动时对所有选中的 box 同步应用相同的 delta

### 3. 重叠检测

使用标准 AABB（Axis-Aligned Bounding Box）相交检测：

```ts
function boxesOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}
```

松手时遍历所有 boxes，返回与选区矩形重叠的 ID 列表。性能：boxes 数量通常 < 50，纯 JS 遍历无性能问题。`onPointerMove` 中不触发重叠检测——仅在松手时计算一次。

### 4. 选区矩形渲染

在 `CanvasArea` 中渲染一个绝对定位的 `<div>`，位于 `canvas-inner` 内部：

- **位置尺寸**：跟随鼠标拖拽实时更新，坐标已在画布坐标系中
- **样式**：2px SVG stroke + 主色半透明填充 + 蚂蚁线动画
- **z-index**：10（高于普通 box 的默认层级）
- **pointer-events**：none（不干扰其他交互）

**蚂蚁线动画（SVG）：**

```tsx
<div className="marquee-selection" style={{ left, top, width, height }}>
  <svg className="marquee-ants" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
    <rect
      className="marquee-ants-path"
      x="1"
      y="1"
      width={Math.max(0, width - 2)}
      height={Math.max(0, height - 2)}
      rx="2"
      ry="2"
    />
  </svg>
</div>
```

```css
.marquee-selection {
  position: absolute;
  background: rgba(124, 92, 252, 0.08);
  z-index: 10;
  pointer-events: none;
}

.marquee-ants {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.marquee-ants-path {
  fill: none;
  stroke: var(--primary);
  stroke-width: 2;
  stroke-dasharray: 6 4;
  animation: marquee-ants 0.5s linear infinite;
  vector-effect: non-scaling-stroke;
}

@keyframes marquee-ants {
  to {
    stroke-dashoffset: -10;
  }
}
```

> 原因：CSS `border: dashed` 不能动画 dash offset，伪元素/多 mask 方案容易在角点断裂。SVG `rect` 是单条闭合路径，能保证四边和角点连续运动。

### 5. 组件层变更

**CanvasArea.tsx：**
- 渲染选区矩形 DOM（`marqueeGhost` state）
- `isSelected` 传递改为 `selectedBoxIds.includes(box.id)`

**BoundingBox.tsx：**
- `isSelected` prop 语义不变（仍为 boolean），由父组件计算

**BoxPropertiesPanel.tsx：**
- 选中 0 个：隐藏属性面板或显示占位提示
- 选中 1 个：正常显示个体属性编辑
- 选中 2+ 个：显示"已选中 N 个元素"摘要，隐藏个体属性编辑控件，仅保留批量删除按钮

### 6. 键盘快捷键适配

| 快捷键 | 单选行为 | 多选行为 |
|--------|---------|---------|
| Delete/Backspace | 删除单个 box | 删除所有选中的 box |
| Ctrl+C | 复制单个 box | 复制所有选中的 box |
| Ctrl+X | 剪切单个 box | 剪切所有选中的 box |
| Ctrl+V | 粘贴单个 box | 粘贴所有 box（各偏移 +20,+20） |
| Ctrl+D | 原位复制单个 box | 原位复制所有选中的 box（各偏移 +20,+20） |

### 7. 点击清除逻辑

| 操作 | 行为 |
|------|------|
| 无修饰键点击空白 | `clearSelection()` → 取消所有选中 |
| 无修饰键点击 box | `selectBox(id)` → 清空多选，单选该 box |
| Ctrl/Cmd/Shift+点击 box | `toggleBoxSelection(id)` → 已选则取消，未选则追加 |
| Ctrl/Cmd/Shift+点击空白 | 不取消选中（预留框选入口） |

### 8. 批量删除的清理副作用

`removeBox` 接受 `string | string[]` 时，对每个被删除的 box 执行现有清理逻辑：

- 清理 `chatHistories[boxId]`
- 若 `activeChatBoxId` 等于被删除的 box ID，则关闭对话面板
- 若 `editingBoxId` 等于被删除的 box ID，则退出编辑模式
- 从 `selectedBoxIds` 中移除被删除的 box ID

### 9. z-order 操作（bringToFront / sendToBack）

多选时（`selectedBoxIds.length > 1`）：

- 不改变选中 box 之间的相对 z-order
- `bringToFront`：将所有选中的 box 移至 boxes 数组末尾（保持彼此相对顺序）
- `sendToBack`：将所有选中的 box 移至 boxes 数组开头（保持彼此相对顺序）

### 10. 双击编辑与多选的交互

- 双击一个 box 进入编辑模式时，先清空多选（`selectedBoxIds = [该box.id]`），再进入编辑
- 编辑模式下该 box 独占选中状态

### 11. 右键上下文菜单

**右键命中选中的 box：**
- 显示批量操作菜单：Duplicate / Cut / Copy / Delete / Bring to Front / Send to Back
- 所有操作作用于 `selectedBoxIds` 中的所有 box

**右键命中未选中的 box：**
- 清空多选，单选该 box
- 显示单 box 操作菜单（与现有行为一致）

**右键空白：**
- 显示画布菜单（Paste / 背景图 / 清除 / Fit），行为不变

## 涉及文件

```
src/
├── types/index.ts                      # InteractionMode 新增 'pendingSelection' | 'marqueeSelect'
├── store/index.ts                      # selectedBoxIds + 方法 + 批量操作
├── hooks/usePointerInteraction.ts      # pendingSelection/marqueeSelect 模式 + Ctrl/Cmd/Shift 逻辑
├── components/canvas/CanvasArea.tsx    # 选区矩形渲染 + isSelected 计算
├── components/canvas/BoundingBox.tsx   # isSelected 语义不变
├── components/canvas/ContextMenu.tsx   # 多选时右键菜单批量操作
├── components/panels/BoxPropertiesPanel.tsx  # 多选摘要
└── index.css                           # SVG 蚂蚁线动画
```

## 不涉及

- `RightPanelContainer.tsx`、`GlobalSettingsPanel.tsx` — 无需改动
- `JsonToolbar.tsx`、`ComfyUIControls.tsx` — 无需改动
- `ChatPanel.tsx`、`CanvasChatPanel.tsx` — 无需改动
- ComfyUI 生成链路测试 — 多选不改变 JSON/生成接口协议

## 验证计划

必须随实现同步补充自动化测试，不作为后续迭代：

- Store 单元测试：`selectBoxes`、`toggleBoxSelection`、批量 `removeBox`、批量剪贴板、批量 z-order 保持相对顺序
- Pointer hook 测试：Ctrl/Cmd/Shift 点击 toggle、超过阈值后框选、负向拖拽框选、点击已多选 box 后批量拖拽
- 快捷键测试：Delete/Ctrl+C/Ctrl+X/Ctrl+V/Ctrl+D 对多选集合生效
- 面板/右键菜单测试：右键已选 box 保留多选并执行批量操作；右键未选 box 切换为单选
- 视觉 smoke：选区矩形使用 SVG `rect.marquee-ants-path`，避免回退到不可动画的 dashed border

## 实现顺序

1. **Step 1**: Store 层 — `selectedBoxIds` + 同步兼容 `selectedBoxId` + 批量操作适配
2. **Step 2**: 交互层 — `pendingSelection` / `marqueeSelect` 模式 + Ctrl/Cmd/Shift+click toggle + 批量拖拽
3. **Step 3**: 视觉层 — SVG 选区矩形 + 连续蚂蚁线动画 + BoundingBox 多选状态
4. **Step 4**: 属性面板 + 右键菜单 + 批量快捷键适配
5. **Step 5**: 测试补齐与视觉 smoke 验证
