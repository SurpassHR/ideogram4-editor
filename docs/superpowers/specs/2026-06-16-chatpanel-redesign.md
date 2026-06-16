# ChatPanel 样式与布局优化设计文档

**日期**: 2026-06-16
**状态**: 设计中
**版本**: 2.0

## 1. 概览

对 ChatPanel（AI 对话浮动面板）进行全面的样式与布局优化，提升视觉效果、交互体验和代码质量。本次优化覆盖布局结构、视觉风格、消息展示和输入交互四个方面。

## 2. 设计目标

- **视觉升级**: 从基础暗色风格升级为玻璃态（Glassmorphism），增加层次感和现代感
- **布局优化**: 重构 header 为标签式工具栏，简化结构，释放消息展示空间
- **消息增强**: 添加 Markdown 渲染、卡片式消息展示、时间戳、复制按钮
- **交互改进**: textarea 自动伸缩输入、Enter 发送/Shift+Enter 换行
- **性能优化**: 用位置阈值 + ResizeObserver 优化 rAF 轮询定位

## 3. 布局结构调整

### 3.1 标签式工具栏（方案 C）

**当前结构**（两行 header）:
```
┌─────────────────────────────┐
│ AI 对话  [box-1]          ✕ │  ← 第一行: 标题 + badge + 关闭
│ [预设▼] [模型▼] [🌐] ⚙ 🗑    │  ← 第二行: 所有控件平铺
├─────────────────────────────┤
│ 消息区域                      │
├─────────────────────────────┤
│ [输入框_______________] [➤]  │
└─────────────────────────────┘
```

**新结构**（标签式工具栏）:
```
┌─────────────────────────────┐
│ AI 对话 · box-1            ✕│  ← 极简 header: 标题 + 关闭
├─────────────────────────────┤
│ 消息区域                      │  ← 更多空间给消息
├─────────────────────────────┤
│ [预设▼] [模型▼] [🌐] ⚙ 🗑 ▲│  ← 可折叠工具栏
├─────────────────────────────┤
│ [textarea 自动伸缩_____] [➤]│  ← 输入区域
└─────────────────────────────┘
```

### 3.2 面板定位

- 保持浮动跟随模式：面板跟随目标 bounding box 移动
- 定位策略优化：
  - 初始位置：`computeChatPanelPosition()` 计算，放 box 下方水平居中
  - 跟随跟踪：保留 rAF 循环但增加 `ResizeObserver` 监听 box 元素尺寸变化
  - 降级方案：box 离开视口时面板固定在边缘

### 3.3 响应式尺寸

- 面板宽度: `min(360px, 30vw)`，最小 300px，最大 420px
- 面板高度: `clamp(280px, 50vh, 600px)`，内容自适应
- 消息区域: flex-grow 填充剩余空间，`overflow-y: auto`
- 工具栏默认展开，点击 ▲/▼ 切换折叠状态
- 小屏适配（视口宽度 < 480px）：面板宽度固定 95vw

## 4. 视觉风格：玻璃态 (Glassmorphism)

### 4.1 面板容器

```css
.chat-panel {
  background: rgba(22, 22, 48, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(124, 92, 252, 0.25);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(124, 92, 252, 0.1) inset;
}
```

### 4.2 Header 区域

```css
.chat-header {
  border-bottom: 1px solid rgba(124, 92, 252, 0.2);
  background: rgba(30, 30, 58, 0.5);
  padding: 8px 12px;
}
```

- 左侧: 标题 + box 名称（用 `·` 分隔，一行显示）
- 右侧: 关闭按钮，hover 时变红色

### 4.3 工具栏区域

```css
.chat-toolbar {
  border-top: 1px solid rgba(124, 92, 252, 0.15);
  background: rgba(124, 92, 252, 0.03);
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}
```

- 控件顺序: [预设▼] [模型▼] [语言▼] [spacer] [预设管理] [清空历史] [折叠▲]
- 折叠后只显示一行细线或隐藏

### 4.4 输入区域

```css
.chat-input-area {
  border-top: 1px solid rgba(124, 92, 252, 0.2);
  background: rgba(30, 30, 58, 0.4);
  padding: 8px 10px;
}
```

- textarea: 半透明背景，聚焦时边框高亮为 primary
- 发送按钮: 紫色圆形，hover 时发光

### 4.5 过渡动画

- 面板入场: 当前 `chat-panel-in` (fade + slide-up) 保持不变
- 工具栏折叠: `max-height` + `opacity` 过渡 0.2s ease
- 消息入场: 新消息从下方淡入，`opacity` + `translateY` 0.2s
- 按钮 hover: `transform: scale(1.05)` 微缩放 + 阴影变化

## 5. 消息展示：卡片式

### 5.1 卡片结构

```
┌──────────────────────────────────┐
│ ● 你                    14:32   │  ← 标签栏（紫色背景）
├──────────────────────────────────┤
│ 帮我优化这个描述                  │  ← 消息正文
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ● gpt-4o                 14:32   │  ← 标签栏（绿色背景）
├──────────────────────────────────┤
│ 当然！以下是优化版本：             │
│ ```                              │  ← Markdown 渲染
│ A breathtaking sunset...         │
│ ```                              │
│ [采纳] [忽略]              [📋]  │  ← 操作栏
└──────────────────────────────────┘
```

### 5.2 CSS 规格

- 卡片容器: `border-radius: 8px; overflow: hidden;`
- 用户卡片边框: `1px solid rgba(124, 92, 252, 0.2)`
- AI 卡片边框: `1px solid rgba(0, 212, 170, 0.2)`
- 用户标签栏: `background: rgba(124, 92, 252, 0.12)`
- AI 标签栏: `background: rgba(0, 212, 170, 0.08)`
- 标签头像: 12px 圆形，紫色(U)/绿色(AI)
- 时间戳: `font-size: 9px; color: rgba(255,255,255,0.35);` 右对齐
- 卡片间距: `gap: 10px`

### 5.3 操作按钮

- 采纳按钮: 绿色背景 `#00d4aa`，白色文字
- 忽略按钮: 透明背景，灰色边框
- 复制按钮: 仅图标（📋），放在操作栏右侧，hover 显示 tooltip
- 已采纳状态: 标签栏显示 "✓ 已采纳" 替代操作按钮

## 6. Markdown 渲染

### 6.1 技术方案

引入轻量级 markdown 解析库 `marked`（~50KB gzipped ~15KB），配合 `DOMPurify` 做 XSS 防护。

### 6.2 支持的语法

- **加粗** / *斜体* / `内联代码`
- 代码块（带语言标注、语法高亮可选）
- 无序/有序列表
- 链接（新标签打开）
- 段落和换行

### 6.3 样式适配

```css
.chat-message-content pre {
  background: rgba(0, 0, 0, 0.4);
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  overflow-x: auto;
  margin: 4px 0;
}

.chat-message-content code {
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.chat-message-content a {
  color: var(--primary);
  text-decoration: underline;
}
```

## 7. 输入交互改进

### 7.1 Textarea 自动伸缩

```tsx
<textarea
  className="chat-input"
  rows={1}
  onInput={(e) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'; // 最大5行
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }}
/>
```

- 默认 1 行（40px），最大 5 行（~120px）
- Enter 发送，Shift+Enter 换行
- 发送后重置高度
- 禁用状态: opacity 降低，cursor not-allowed

### 7.2 发送按钮

- 输入为空或加载中时 disabled
- 发送图标: ➤（保持当前）
- hover 时: `box-shadow: 0 2px 12px rgba(124, 92, 252, 0.5)` 发光

## 8. 性能优化

### 8.1 定位跟踪

**当前问题**: rAF 循环持续运行，每帧触发 `getBoundingClientRect()` + `offsetHeight` 读取，导致强制布局。

**优化方案**:
```tsx
useEffect(() => {
  if (!isChatOpen || !activeChatBoxId) return;
  const boxEl = document.getElementById(activeChatBoxId);
  if (!boxEl) return;

  let rafId: number;
  let lastPos = { top: 0, left: 0 };
  const THRESHOLD = 2; // 移动超过2px才更新

  const track = () => {
    const rect = boxEl.getBoundingClientRect();
    const newTop = Math.round(rect.top);
    const newLeft = Math.round(rect.left);
    if (Math.abs(newTop - lastPos.top) > THRESHOLD ||
        Math.abs(newLeft - lastPos.left) > THRESHOLD) {
      // 只在位置变化时更新
      const pos = computeChatPanelPosition(...);
      panelEl.style.top = `${pos.top}px`;
      panelEl.style.left = `${pos.left}px`;
      lastPos = { top: newTop, left: newLeft };
    }
    rafId = requestAnimationFrame(track);
  };

  const ro = new ResizeObserver(() => {
    // box 尺寸变化时触发全量重定位（不使用阈值，因为尺寸变化必然需要更新）
    if (!panelEl) return;
    const rect = boxEl.getBoundingClientRect();
    const containerRect = getArtboardRect();
    const actualH = panelEl.offsetHeight || 400;
    const pos = computeChatPanelPosition(
      { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      containerRect, panelW, actualH, 10
    );
    panelEl.style.top = `${pos.top}px`;
    panelEl.style.left = `${pos.left}px`;
    lastPos = { top: pos.top, left: pos.left };
  });
  ro.observe(boxEl);

  rafId = requestAnimationFrame(track);
  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
  };
}, [isChatOpen, activeChatBoxId]);
```

- 添加位置变化阈值（2px），减少不必要的 DOM 写入
- 添加 `ResizeObserver` 监听 box 尺寸变化
- 面板关闭时完全清理

### 8.2 其他优化

- 消息列表虚拟化（消息超 100 条时考虑，当前暂不实施）
- 工具栏折叠状态持久化到 localStorage

## 9. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/index.css` | 大规模修改 | 重写所有 chat-* CSS 类，添加 glassmorphism 样式、消息卡片样式、markdown 样式 |
| `src/components/chat/ChatPanel.tsx` | 重构 | 新布局结构、textarea 自动伸缩、工具栏折叠逻辑、优化定位 |
| `src/components/chat/ChatMessage.tsx` | 重构 | 卡片式布局、markdown 渲染、时间戳、复制按钮 |
| `package.json` | 新增依赖 | `marked` + `dompurify` + `@types/dompurify` |
| `src/utils/panelPosition.ts` | 小幅修改 | 可选优化，添加降级定位逻辑 |
| `src/i18n/translations.ts` | 新增条目 | 复制成功提示等新文案 |

## 10. 不做的事项

- 不改变 ChatPanel 与 store 的数据流（`useChatPanel` hook 保持不变）
- 不改变 LLM API 调用逻辑（`llm-chat.ts` 不变）
- 不添加面板拖拽功能（保持跟随 box 模式）
- 不添加消息流式渲染（SSE streaming 后续单独实现）
- 不使用预设自动清除行为（当前逻辑保持不变）
- 不修改 PresetManagerPanel 样式（本次聚焦 ChatPanel 主体）

## 11. 设计决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| Header 布局 | A/B/C | C - 标签式工具栏 | 极简 header + 可折叠工具栏，释放消息空间 |
| 浮动跟随 | A/B/C | A - 保持跟随+优化 | 保持交互连续性，用阈值+ResizeObserver 优化性能 |
| 面板尺寸 | A/B/C | A - 响应式 | 适配不同画布/屏幕尺寸 |
| 视觉风格 | A/B/C | A - 玻璃态 | 现代科技感，层次感强 |
| 消息展示 | A/B/C | C - 卡片式 | 结构清晰，角色区分明显 |
| 消息内容 | A/B/C | C - markdown+视觉增强 | 代码/格式可读性 + 头像/时间戳/复制 |
| 输入方式 | A/B/C | A - textarea 自动伸缩 | 支持多行，Enter 发送 Shift+Enter 换行 |