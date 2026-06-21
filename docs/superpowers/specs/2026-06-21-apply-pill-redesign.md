# Apply Pill 重新设计：Actions 行内嵌 Ghost 按钮

**日期：** 2026-06-21
**状态：** 已确认
**来源：** `/frontend-design` 评审细化

## 背景

提交 `28e3d8a`（feat(chat): move Canvas Chat Apply to per-message card corner）将 Apply 按钮从输入区移到每条含 JSON 的 AI 回复卡片右上角。pill 以 `position: absolute; top: 6px; right: 6px` 定位，一半在 header 的 teal 底色上、一半在 body 区域。

/frontend-design 评审后决定重新设计 pill 的位置和样式。

## 设计决策

| 维度 | 选择 | 理由 |
|------|------|------|
| **位置** | Actions 行内嵌（C2） | pill 作为 actions 行的一个按钮，放在 📋 copy 按钮右侧。结构自然，DOM 层级合理，不与 header 冲突 |
| **样式** | Ghost 半透明（S3） | `background: rgba(0,212,170,0.15); color: #00d4aa`。克制、不与 copy 按钮争抢视觉权重，但仍可识别 |
| **应用后状态** | 静态徽章（B） | pill 替换为不可点击的 `✓ Applied` 文本徽章，清晰标记已应用状态。不可重复应用（历史记录）。每条含 JSON 的卡内各自独立 |

### 否决的方案

- **右上角绝对定位（现状）**：pill 贯穿 header/body 边界，视觉割裂感
- **Header 内嵌（A1）**：pill 完全在 header 条内，不够显眼
- **浮出卡片（B1）**：需 `overflow: visible`，破坏圆角裁切
- **Body 底部浮层（C1）**：需要额外的 body 底部 padding
- **绝对定位 + copy 让位（C3）**：copy 与 pill 之间的空白尴尬
- **Solid / Outline / Icon-only**：Solid 太重，Outline 可读性弱，Icon-only 语义不够明确
- **应用后消失（状态 A）**：历史卡片无法区分已应用
- **淡出 Re-apply（状态 C）**：增加不必要的交互复杂度

## 已应用状态跟踪

向 `ChatMessage` 类型（`src/types/chat.ts`）新增可选字段：

```ts
/** Canvas Chat 中此条消息的 JSON 构图是否已被应用到画布（仅 assistant 消息） */
applied?: boolean;
```

- `handleApplyMessage` 调用 `applyMessageOutput` 后，通过 store 的 `updateCanvasChatMessage(messageId, { applied: true })` 标记
- `ChatMessage` 组件检查 `message.applied`，仅当 `parsedOutput && onApply` 时有效（即 Canvas Chat 上下文中含有效 JSON 的 assistant 卡）
- 此字段与 per-box ChatPanel 使用的 `adopted` 字段**独立**——语义不同（"composition applied to canvas" vs "description adopted to box"），视觉不同（teal Applied 徽章 vs 紫色 Adopted 徽章），互不干扰
- `applied` 状态随 `canvasChatSessions`/`canvasChatMessages` 通过现有工作区持久化机制（`workspace-persistence.ts`）自动保留，刷新/会话切换后不丢失

## 视觉规格

### Ghost Apply pill（可点击）
```css
.chat-msg-card-apply-ghost {
  padding: 4px 12px;
  font-size: 10px;
  font-weight: 700;
  font-family: 'Inter', sans-serif;
  border-radius: 999px;
  border: none;
  background: rgba(0, 212, 170, 0.15);
  color: var(--accent);          /* #00d4aa */
  cursor: pointer;
  transition: all 0.15s;
}
.chat-msg-card-apply-ghost:hover:not(:disabled) {
  background: rgba(0, 212, 170, 0.25);
  box-shadow: 0 2px 8px rgba(0, 212, 170, 0.2);
}
.chat-msg-card-apply-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

### Applied 徽章（不可点击，无 hover 效果）
```css
.chat-msg-card-applied-badge {
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  border-radius: 999px;
  background: rgba(0, 212, 170, 0.08);
  color: rgba(0, 212, 170, 0.5);
}
```

## Actions 行结构

Canvas Chat 上下文（`onApply` 传入）中 assistant 消息的 actions 行渲染：

```
───────────────────────────────────────────
                          [📋]  [Apply]      ← 未应用：spacer → copy → ghost pill
                          [📋]  [✓ Applied]  ← 已应用：spacer → copy → 静态徽章
───────────────────────────────────────────
```

DOM 顺序（`display: flex`，spacer 有 `flex: 1` 右推所有项目）：`spacer → copy → pill/badge`，pill 视觉上在 actions 行最右端。

Per-box ChatPanel 上下文（`onAdopt`/`onDismiss` 传入）的 actions 行**完全不变**——adopt/dismiss 按钮和 purple Adopted 徽章逻辑属于 per-box 消息，不受影响。

## 行为流

1. 助理消息中含有效 Ideogram JSON → actions 行追加 `Apply` ghost pill（`message.applied !== true && showApply`）
2. 用户点击 Apply → `handleApplyMessage(msgId)` → `applyMessageOutput(msg)` + `updateCanvasChatMessage(msgId, { applied: true })` → toast "Applied N boxes"
3. 应用后的卡片：ghost pill 替换为 `✓ Applied` 静态徽章（`message.applied === true && showApply`）
4. 所有含 JSON 的历史卡片各自独立检查 `message.applied`：`false/undefined` → Apply pill，`true` → Applied 徽章
5. 无 JSON 的回复不显示 pill 或徽章（actions 行只有 copy 按钮）
6. 时间戳在 header 始终可见（不再被隐藏）

## 改动范围

### 1. `src/types/chat.ts`
- `ChatMessage` 接口新增 `applied?: boolean` 字段

### 2. `src/components/chat/ChatMessage.tsx`
- 移除绝对定位 Apply pill（`position: absolute; top: 6px; right: 6px`）
- 移除 `has-apply` 类和时间戳隐藏逻辑
- pill/徽章作为 actions 行子元素渲染：在 canva-chat assistant 消息的 actions 行中，spacer → copy → (applied ? badge : ghost pill)
- 仅当 `parsedOutput !== null && onApply` 时渲染 pill/徽章（用户消息/无 JSON 消息不显示）
- 恢复时间戳在 header 的显示

### 3. `src/index.css`
- 移除 `.chat-msg-card-apply`（旧绝对定位 pill 样式块）
- 移除 `.chat-msg-card.has-apply .chat-msg-card-time`（时间戳隐藏规则）
- `.chat-msg-card` 规则块：移除 `position: relative`，保留 `overflow: hidden` 和 `border-radius: 8px`
- 新增 `.chat-msg-card-apply-ghost`（Ghost 按钮样式）及 `:hover`/`:disabled` 伪类
- 新增 `.chat-msg-card-applied-badge`（静态徽章样式）
- 保留 `.canvas-chat-apply-btn`（rename 弹窗仍在使用）

### 4. `src/components/canvas/CanvasChatPanel.tsx`
- `handleApplyMessage` 中在调用 `applyMessageOutput` 后追加 `useEditorStore.getState().updateCanvasChatMessage(messageId, { applied: true })`
- 移除 `applyDisabled` prop（不再需要——卡片渲染完毕时 loading 已结束）

### 5. `src/hooks/useCanvasChat.ts`
- 无需改动（`applyMessageOutput`/`applyIdeogramOutput` 逻辑不变）

### 6. 测试
- `src/components/canvas/__tests__/CanvasChatPanel.test.tsx`：
  - 用 `.chat-msg-card-apply-ghost` 选择器替换旧 `.chat-msg-card-apply`/`.canvas-chat-apply-btn` 选择器
  - 新增：点击 ghost pill 后断言 `applied: true` 和 `.chat-msg-card-applied-badge` 徽章渲染
  - 移除 `has-apply` 和 `apply-btn` 相关旧断言
- `src/hooks/__tests__/useCanvasChat.test.tsx`：无需改动

## 验收

- 含 JSON 的 assistant 卡在 actions 行右端显示 ghost Apply pill
- 点击 Apply 后，pill 替换为 `✓ Applied` 徽章
- 历史卡片中的已应用/未应用状态各自独立，刷新后保留
- 无 JSON 的回复不显示 pill 或徽章
- 时间戳在 header 始终可见（不再被隐藏）
- `rtk tsc` 无类型错误
- `rtk vitest --run` 全绿
