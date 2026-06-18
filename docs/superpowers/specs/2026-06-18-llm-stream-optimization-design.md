# LLM 流式输出 + 思维链 + 画布缩略图 设计规格

> 日期：2026-06-18 · 状态：设计已确认

## 概述

优化 LLM 交互体验，三部分改动：

1. **流式输出**：两个 LLM 聊天面板（per-box `ChatPanel` + 画布级 `CanvasChatPanel`）支持 SSE token 流式渲染，用户逐 token 看到 AI 回复
2. **模型思维链**：自动检测各 provider 的 CoT/reasoning 字段，在消息卡片中以可折叠区域独立渲染
3. **画布缩略图**：Canvas Chat 的每条 assistant 消息附带发送时刻的画布快照缩略图

## 总体架构

```
src/services/llm-stream.ts          ← 新增：流式 API 服务层
src/types/chat.ts                   ← 修改：ChatMessage 增加 thinking + canvasSnapshotUrl
src/hooks/useChatPanel.ts           ← 修改：集成流式
src/hooks/useCanvasChat.ts          ← 修改：集成流式 + 缩略图截取
src/components/chat/ChatMessage.tsx ← 修改：渲染 CoT + 缩略图
```

**策略**：在现有架构上做增量改动。`sendChatMessage()` 等非流式 API 保持不变，新增 `sendChatMessageStream()` 及其配套的 provider 流式调用。

## 1. 类型扩展

### ChatMessage（`src/types/chat.ts`）

```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  adopted?: boolean;
  /** 模型推理过程文本，从流式事件中提取 */
  thinking?: string;
  /** 消息发送时刻的画布截图 Data URL（仅 Canvas Chat 使用） */
  canvasSnapshotUrl?: string;
}
```

两个字段都是可选的，向后兼容。

## 2. 流式服务层 — `llm-stream.ts`

### 接口

```typescript
export interface StreamChunk {
  type: 'thinking' | 'content';
  text: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export async function sendChatMessageStream(
  provider: LlmProvider,
  model: string,
  messages: ChatMessageForApi[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  imageDataUrl?: string,
): Promise<void>;
```

### Provider 流式适配

| Provider | 端点变化 | 文本 delta 路径 | CoT 路径 | 流终止信号 |
|---|---|---|---|---|
| OpenAI / compat | stream: true | `choices[0].delta.content` | — | `data: [DONE]` |
| Anthropic | stream: true | `type=content_block_delta / delta.text` | `type=content_block_start / content_block.thinking` | `type=message_done` |
| Gemini | `:streamGenerateContent?alt=sse` | `candidates[0].content.parts[0].text` | `candidates[0].content.parts[?].thought` | header `x-server-response-is-complete: true` |

### 核心处理模式

所有 provider 统一使用 `ReadableStream` + `getReader()` 逐行读取 SSE：

```
fetch(POST, { stream: true, ... })
  → resp.body.getReader()
  → decoder.decode(chunk) → 按 '\n' 切行
  → 每行以 "data: " 开头 → JSON.parse → 提取 delta
      → delta 为 content → onChunk({ type: 'content', text })
      → delta 为 thinking/reasoning → onChunk({ type: 'thinking', text })
  → 流终止 → onDone(accumulated)
```

关键实现细节：
- **文本累积器**：content 和 thinking 分别累积，最终传给 `onDone(fullText)`
- **Anthropic 特殊处理**：event stream 类型不同，需要区分 `message_start`, `content_block_start`, `content_block_delta`, `message_done`
- **超时**：使用 `AbortController` 实现，`setTimeout(() => controller.abort(), 30000)`。`fetch` 传入 `signal: controller.signal`，`abort()` 时 fetch 抛 `AbortError`，catch 中转发给 `onError`。内容到达后 `clearTimeout` 取消定时器。

## 3. Hooks 流式改造

### 通用模式：占位消息驱动

两个 hook 共享同一模式：

```
发送消息时：
  1. 创建 assistant 占位消息（空 content + 空 thinking）
  2. 立即写入 store → UI 渲染一个"正在输入"的卡片
  3. sendChatMessageStream(provider, model, ..., {
       onChunk: ({ type, text }) => {
         占位消息.content += text   (type === 'content')
         占位消息.thinking += text   (type === 'thinking')
         触发 store 中该消息的引用更新
       },
       onDone: (fullText) => {
         完成累积 → 保留完整 content + thinking 在 store
         setIsLoading(false)
       },
       onError: (err) => {
         占位消息.content += `\n\n[Error: ${err}]`
         setIsLoading(false)
       }
     })
```
- **Store 新增 action**：`updateCanvasChatMessage(messageId, updates)` — 在 `canvasChatMessages` 中按 id 查找并合并 `updates` 到匹配消息。流式过程中 `onChunk` 回调通过 `getState().updateCanvasChatMessage(placeholderId, { content: newContent })` 触发 store 更新，组件自动重渲染。避免 React 闭包捕获过期引用。

### useChatPanel（Per-box Chat）

- `sendMessage` 改为使用 `sendChatMessageStream`
- 新建一条 assistant 消息先写入 store → 再开始流
- 流结束时写入最终 `ChatMessage`
- 重试逻辑不适用（无需 JSON 校验），出错直接显示错误

### useCanvasChat（Canvas Chat）

- `sendMessage` 内 while 循环改为流式：
  ```
  while (hardRetryCount <= MAX_HARD_RETRIES) {
    1. 创建占位 assistant 消息
    2. sendChatMessageStream({
         onChunk: 逐步填充占位消息
         onDone: (fullText) => {
           最终写入 content + thinking
           const parsed = extractAndValidateIdeogramJSON(fullText)
           if (parsed) → setPendingIdeogramOutput, 返回（跳出循环）
           else → 记录 lastErrorText, hardRetryCount++
         }
       })
  }
  ```
- **重试 UX**：流完后如果解析失败，占位消息**保留**在消息列表中（不消失），在底部追加一条 System 提示："[Parse Error: 原因] 正在重新生成..."，然后重新流式生成新的占位消息开始新一轮

## 4. 思维链渲染

在 `ChatMessage` 组件中新增 CoT 渲染：

```
{message.thinking && (
  <details className="chat-thinking-block">
    <summary>
      {isChinese ? '🧠 思考过程' : '🧠 Reasoning'}
    </summary>
    <div className="chat-thinking-content">
      {renderMarkdown(message.thinking)}
    </div>
  </details>
)}
```

- 使用原生 `<details>/<summary>` 实现折叠，无额外 JS
- 默认折叠，点击展开
- 灰色/暗色底色 + 斜体内文字
- `<summary>` 标签文案跟随 `chatResponseLang`：
  - `zh` → "🧠 思考过程"
  - `en` → "🧠 Reasoning"
  - `auto` → 检测 message 语言或默认英文
- 如果 message 没有 `thinking` 字段，不渲染此块，现有样式不变

## 5. 画布缩略图

### 截图时机

仅在 `CanvasChatPanel` 中，用户点击发送按钮时：

```typescript
// useCanvasChat — 在发送消息时截取
function takeCanvasSnapshot(): string | undefined {
  const wrapper = document.querySelector('#canvas-wrapper') as HTMLElement;
  if (!wrapper) return undefined;
  
  // 使用 foreignObject 将 DOM 渲染到 canvas
  const rect = wrapper.getBoundingClientRect();
  const TARGET_W = 120;
  const scale = TARGET_W / rect.width;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${wrapper.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `;
  const img = new Image();
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d')!;
  // 使用 drawImage 在 onload 中绘制
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  return new Promise(resolve => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(undefined);
  });
}
```

- 截图输出为 JPEG（更小体积，缩略图不需要 PNG 无损）
- quality 0.6
- 最大宽度 120px，高度等比缩放
- 仅截取 `#canvas-wrapper` 区域（不包含 artboard 背景或缩放控件）
- 缩略图 Data URL 存储在 assistant message 的 `canvasSnapshotUrl` 字段

### 渲染位置

在 `ChatMessage` 组件中：

```
{message.canvasSnapshotUrl && (
  <div className="chat-msg-thumb-container">
    <img
      src={message.canvasSnapshotUrl}
      className="chat-msg-canvas-thumb"
      alt="Canvas preview"
    />
  </div>
)}
```

- 位置：消息卡片 header 下方、正文上方
- 右对齐
- 最大宽度 120px
- 4px border-radius
- 半透明边框 (1px solid rgba(255,255,255,0.15))
- 点击缩略图无交互（纯展示）
- 仅在 Canvas Chat 消息中使用；Per-box Chat 中忽略此字段

## 6. 样式新增
.chat-thinking-block {
  margin: 8px 0;
  background: rgba(255,255,255,0.04);
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
}
.chat-thinking-block summary {
  cursor: pointer;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}
.chat-thinking-content {
  padding: 0 10px 8px;
  font-size: 12px;
  font-style: italic;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Canvas 缩略图 */
.chat-msg-thumb-container {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.chat-msg-canvas-thumb {
  max-width: 120px;
  height: auto;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.15);
}
```

## 7. 错误处理

| 场景 | 行为 |
|------|------|
| **流中断 / 网络错误** | `onError` 被调用，占位消息末尾追加 `[Stream interrupted: <error>]` |
| **流超时（>30s）** | 中断流，触发 `onError` |
| **Anthropic thinking 块过大** | 累积到 `thinking` 字段，不影响 content 渲染 |
| **Gemini 不支持流式** | 回退到非流式 `sendChatMessage()` |
| **Canvas Chat 重试时** | 保留失败文本，追加系统提示行，重新流式 |

## 8. 不在范围内

- Per-box Chat 的画布缩略图（仅 Canvas Chat 需要）
- 流式传输的进度条（text cursor 闪烁已足够）
- `optimizeText()` 的流式改造（单轮优化不需要流式）
- 流式取消/中断 UI（无 "Stop" 按钮，后续迭代）
- `html-to-image` 等第三方库的安装简化（后续处理）

## 9. 测试策略

- `llm-stream.ts` 单元测试：mock `fetch` + `ReadableStream` 模拟各 provider 的 SSE 格式
- `ChatMessage` 组件测试：
  - 有/无 thinking 字段的渲染差异
  - 有/无 canvasSnapshotUrl 的渲染差异
  - thinking 默认折叠、点击展开
- `useChatPanel` hook 测试：流式消息逐步累积
- `useCanvasChat` hook 测试：流式 + 解析成功 / 失败重试
