# LLM 流式输出 + 思维链 + 画布缩略图 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable SSE streaming for both LLM chat panels, render chain-of-thought as collapsible blocks, and show canvas thumbnails in Canvas Chat messages.

**Architecture:** Callback-based streaming service layer (`llm-stream.ts`) parallel to existing `llm-chat.ts`. Hooks manage a "placeholder message" pattern — send an empty assistant message, then progressively update it via store as chunks arrive. ChatMessage component gets optional CoT + thumbnail rendering.

**Tech Stack:** TypeScript, React 19, Zustand 5, `ReadableStream.getReader()` for SSE parsing, native `<details>` for CoT folding, `foreignObject` for canvas screenshot.

## Global Constraints

- All stream parsing uses `ReadableStream.getReader()` + `TextDecoder` — no third-party SSE library
- `sendChatMessage()` (non-streaming) stays untouched
- Every new/changed function must have inline JSDoc
- `ChatMessage` backward compatible — `thinking` and `canvasSnapshotUrl` are optional
- Test files follow existing patterns (`describe`/`it` from vitest, `@testing-library/react` for components)

---

### Task 1: ChatMessage 类型 + Store 扩展

**Files:**
- Modify: `src/types/chat.ts`
- Modify: `src/store/index.ts`
- Test: `src/store/__tests__/index.test.ts`

**Interfaces:**
- Produces: `ChatMessage.thinking?: string`, `ChatMessage.canvasSnapshotUrl?: string`, store action `updateCanvasChatMessage(id, updates)`

- [ ] **Step 1: 扩展 ChatMessage 类型**

在 `src/types/chat.ts` 的 `ChatMessage` 接口末尾新增两个可选字段：

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

所有现有引用不受影响（可选字段）。

- [ ] **Step 2: Store 新增 updateCanvasChatMessage action**

在 `src/store/index.ts` 中，`setCanvasChatLoading` 之后添加：

```typescript
updateCanvasChatMessage: (messageId, updates) => set(state => ({
  canvasChatMessages: state.canvasChatMessages.map(m =>
    m.id === messageId ? { ...m, ...updates } : m
  ),
})),
```

在 `EditorStore` 接口中对应位置添加类型声明。

- [ ] **Step 3: 编写 Store 测试**

在 `src/store/__tests__/index.test.ts` 的 `describe('Canvas Chat actions')` 中添加：

```typescript
describe('updateCanvasChatMessage', () => {
  it('应按 id 更新消息的指定字段', () => {
    const { addCanvasChatMessage, updateCanvasChatMessage } =
      useEditorStore.getState();

    addCanvasChatMessage({
      id: 'msg_1', role: 'assistant', content: '', timestamp: 1000,
    });

    updateCanvasChatMessage('msg_1', { content: 'Hello', thinking: 'Let me think...' });

    const state = useEditorStore.getState();
    expect(state.canvasChatMessages[0].content).toBe('Hello');
    expect(state.canvasChatMessages[0].thinking).toBe('Let me think...');
  });

  it('不存在的 id 不应影响其他消息', () => {
    const { addCanvasChatMessage, updateCanvasChatMessage } =
      useEditorStore.getState();

    addCanvasChatMessage({
      id: 'msg_1', role: 'user', content: 'Hi', timestamp: 1000,
    });
    updateCanvasChatMessage('nonexistent', { content: 'Should not appear' });

    expect(useEditorStore.getState().canvasChatMessages[0].content).toBe('Hi');
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest src/store/__tests__/index.test.ts --reporter=verbose -t "updateCanvasChatMessage"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/chat.ts src/store/index.ts src/store/__tests__/index.test.ts
git commit -m "feat: extend ChatMessage with thinking/canvasSnapshotUrl, add updateCanvasChatMessage store action"
```

---

### Task 2: 流式服务层 — llm-stream.ts

**Files:**
- Create: `src/services/llm-stream.ts`
- Test: `src/services/__tests__/llm-stream.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`, `ChatMessageForApi` (from existing types)
- Produces: `sendChatMessageStream(provider, model, messages, systemPrompt, callbacks, imageDataUrl?)`

- [ ] **Step 1: 编写流式接口和公开函数类型**

```typescript
// src/services/llm-stream.ts
import type { LlmProvider } from '../components/llm/types';
import { DEFAULT_BASE_URLS } from '../components/llm/types';
import type { ChatMessageForApi } from '../types/chat';
import { messagesToApiFormat } from '../types/chat';
import { buildMultimodalMessages, extractBase64FromDataUrl, extractMimeTypeFromDataUrl } from './llm-chat';

export interface StreamChunk {
  type: 'thinking' | 'content';
  text: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

const TIMEOUT_MS = 30_000;

/**
 * SSE 流式聊天消息发送。
 * 按 provider.kind 分发到对应的流式 API 调用。
 * 使用 AbortController 实现 30s 超时。
 */
export async function sendChatMessageStream(
  provider: LlmProvider,
  model: string,
  messages: ChatMessageForApi[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  imageDataUrl?: string,
): Promise<void> {
  const rawApiMessages = messagesToApiFormat(messages);
  const apiMessages = imageDataUrl
    ? buildMultimodalMessages(rawApiMessages, imageDataUrl, provider.kind)
    : rawApiMessages;
  const baseUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    await dispatchStreamCall(
      provider.kind, baseUrl, provider.api_key, model, systemPrompt, apiMessages,
      callbacks, controller.signal
    );
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(msg);
  }
}
```

- [ ] **Step 2: 实现 SSE 逐行读取辅助函数**

```typescript
/** 从 ReadableStream 中逐行读取 SSE 数据 */
async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      onLine(line);
    }
  }
  // 处理剩余数据
  if (buffer.trim()) onLine(buffer);
}
```

- [ ] **Step 3: 实现 OpenAI 流式调用**

```typescript
async function callOpenAIStream(
  baseUrl: string, apiKey: string, model: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
): Promise<void> {
  const url = `${baseUrl}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: apiMessages, stream: true }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const reader = resp.body!.getReader();
  let accumulated = '';

  await readSSEStream(reader, (line) => {
    if (!line.startsWith('data: ')) return;
    const jsonStr = line.slice(6);
    if (jsonStr === '[DONE]') return;
    try {
      const chunk = JSON.parse(jsonStr);
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        accumulated += delta.content;
        callbacks.onChunk({ type: 'content', text: delta.content });
      }
    } catch { /* skip unparseable lines */ }
  });

  callbacks.onDone(accumulated);
}
```

- [ ] **Step 4: 实现 Anthropic 流式调用**

处理 event stream（message_start, content_block_start, content_block_delta, message_done）。
CoT 从 `type=content_block_start` 的 `content_block.thinking` 字段提取。

```typescript
async function callAnthropicStream(
  baseUrl: string, apiKey: string, model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
): Promise<void> {
  const url = `${baseUrl}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages: apiMessages,
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const reader = resp.body!.getReader();
  let accumulated = '';
  let thinkingAccumulated = '';

  await readSSEStream(reader, (line) => {
    if (!line.startsWith('data: ')) return;
    const jsonStr = line.slice(6);
    try {
      const event = JSON.parse(jsonStr);
      if (event.type === 'content_block_start' && event.content_block?.thinking) {
        const text = event.content_block.thinking;
        thinkingAccumulated += text;
        callbacks.onChunk({ type: 'thinking', text });
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.text) {
          accumulated += event.delta.text;
          callbacks.onChunk({ type: 'content', text: event.delta.text });
        } else if (event.delta?.thinking) {
          thinkingAccumulated += event.delta.thinking;
          callbacks.onChunk({ type: 'thinking', text: event.delta.thinking });
        }
      }
    } catch { /* skip */ }
  });

  callbacks.onDone(accumulated);
}
```

- [ ] **Step 5: 实现 Gemini 流式调用**

使用 `streamGenerateContent` 端点，通过 `alt=sse` 获取 SSE 流。

```typescript
async function callGeminiStream(
  baseUrl: string, apiKey: string, model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
): Promise<void> {
  const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const contents = apiMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content) ? m.content : [{ text: m.content }],
  }));

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const reader = resp.body!.getReader();
  let accumulated = '';

  await readSSEStream(reader, (line) => {
    if (!line.startsWith('data: ')) return;
    const jsonStr = line.slice(6);
    try {
      const chunk = JSON.parse(jsonStr);
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) return;
      for (const part of parts) {
        if (part.text) {
          accumulated += part.text;
          callbacks.onChunk({ type: 'content', text: part.text });
        }
        if (part.thought) {
          callbacks.onChunk({ type: 'thinking', text: part.thought });
        }
      }
    } catch { /* skip */ }
  });

  callbacks.onDone(accumulated);
}
```

- [ ] **Step 6: 实现 dispatchStreamCall 分发**

```typescript
async function dispatchStreamCall(
  kind: string, baseUrl: string, apiKey: string, model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
): Promise<void> {
  switch (kind) {
    case 'openai':
    case 'openai_compat':
      return callOpenAIStream(baseUrl, apiKey, model, [
        { role: 'system', content: systemPrompt },
        ...apiMessages,
      ], callbacks, signal);
    case 'anthropic':
      return callAnthropicStream(baseUrl, apiKey, model, systemPrompt, apiMessages, callbacks, signal);
    case 'gemini':
      return callGeminiStream(baseUrl, apiKey, model, systemPrompt, apiMessages, callbacks, signal);
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}
```

- [ ] **Step 7: 编写流式服务层测试**

`src/services/__tests__/llm-stream.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { LlmProvider } from '../../components/llm/types';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// 在测试前 import，确保 mock 已生效
import { sendChatMessageStream } from '../llm-stream';
import type { ChatMessageForApi } from '../../types/chat';

function makeProvider(kind: string): LlmProvider {
  return {
    id: 'test',
    name: 'Test',
    kind,
    api_key: 'sk-test',
    base_url: 'https://api.test.com',
    models: ['test-model'],
  };
}

function makeSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return { ok: true, body: stream, text: () => Promise.resolve(chunks.join('')) } as unknown as Response;
}

describe('sendChatMessageStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OpenAI 流式应逐步返回 content 块', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      'data: [DONE]\n',
    ];
    mockFetch.mockResolvedValue(makeSSEResponse(sseChunks));

    const chunks: string[] = [];
    let doneText = '';

    await sendChatMessageStream(
      makeProvider('openai'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: (chunk) => { chunks.push(chunk.text); },
        onDone: (text) => { doneText = text; },
        onError: () => {},
      },
    );

    expect(chunks).toEqual(['Hello', ' world']);
    expect(doneText).toBe('Hello world');
  });

  it('Anthropic 流式应分离 content 和 thinking', async () => {
    const sseChunks = [
      'data: {"type":"content_block_start","content_block":{"thinking":"Let me reason"}}\n',
      'data: {"type":"content_block_delta","delta":{"text":"Final answer"}}\n',
      'data: {"type":"message_done"}\n',
    ];
    mockFetch.mockResolvedValue(makeSSEResponse(sseChunks));

    const contentChunks: string[] = [];
    const thinkingChunks: string[] = [];

    await sendChatMessageStream(
      makeProvider('anthropic'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: (chunk) => {
          if (chunk.type === 'content') contentChunks.push(chunk.text);
          if (chunk.type === 'thinking') thinkingChunks.push(chunk.text);
        },
        onDone: () => {},
        onError: () => {},
      },
    );

    expect(thinkingChunks).toEqual(['Let me reason']);
    expect(contentChunks).toEqual(['Final answer']);
  });

  it('Gemini 流式应提取 text 和 thought', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n',
      'data: {"candidates":[{"content":{"parts":[{"thought":"thinking..."}]}}]}\n',
    ];
    mockFetch.mockResolvedValue(makeSSEResponse(sseChunks));

    const contentChunks: string[] = [];
    const thinkingChunks: string[] = [];

    await sendChatMessageStream(
      makeProvider('gemini'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: (chunk) => {
          if (chunk.type === 'content') contentChunks.push(chunk.text);
          if (chunk.type === 'thinking') thinkingChunks.push(chunk.text);
        },
        onDone: () => {},
        onError: () => {},
      },
    );

    expect(contentChunks).toEqual(['Hello']);
    expect(thinkingChunks).toEqual(['thinking...']);
  });

  it('网络错误应触发 onError', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    let errorText = '';
    await sendChatMessageStream(
      makeProvider('openai'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (err) => { errorText = err; },
      },
    );

    expect(errorText).toBe('Network error');
  });

  it('HTTP 错误应触发 onError', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') } as unknown as Response);

    let errorText = '';
    await sendChatMessageStream(
      makeProvider('openai'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (err) => { errorText = err; },
      },
    );

    expect(errorText).toContain('API error 401');
  });
});
```

- [ ] **Step 8: 运行测试**

```bash
npx vitest src/services/__tests__/llm-stream.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/services/llm-stream.ts src/services/__tests__/llm-stream.test.ts
git commit -m "feat: add SSE streaming service layer for OpenAI/Anthropic/Gemini"
```

---

### Task 3: useChatPanel 流式改造

**Files:**
- Modify: `src/hooks/useChatPanel.ts`

**Interfaces:**
- Consumes: `sendChatMessageStream` from `llm-stream.ts`, `ChatMessage` extended type
- Produces: Updated `sendMessage` that streams tokens progressively

- [ ] **Step 1: 导入流式函数并改造 sendMessage**

在 `src/hooks/useChatPanel.ts` 中修改 `sendMessage`:

- 新增 import: `import { sendChatMessageStream } from '../services/llm-stream';`
- `sendMessage` 函数体改为流式模式：

```typescript
const sendMessage = useCallback(async (content: string) => {
  if (!activeChatBoxId || !currentBox) return;

  const userMessage: ChatMessage = createUserMessage(content);
  addChatMessage(activeChatBoxId, userMessage);
  setIsLoading(true);
  setError(null);

  const provider = getCurrentProvider();
  if (!provider) { setError('No provider selected'); setIsLoading(false); return; }

  const parsed = parseModel(chatModel);
  if (!parsed) { setError('No model selected'); setIsLoading(false); return; }

  // 创建占位 assistant 消息
  const placeholderId = `msg_${Date.now()}_stream`;
  const placeholder: ChatMessage = {
    id: placeholderId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  };
  addChatMessage(activeChatBoxId, placeholder);

  try {
    const allMessages = [...messages, userMessage];
    const systemPrompt = buildBoxChatSystemPrompt(currentBox, {
      highLevelDescription, aesthetics, lighting, medium, artStyle, background,
      globalPalette, photoArtStyleMode,
    }, chatResponseLang);

    const apiMessages = allMessages.map(m => ({ role: m.role, content: m.content }));

    await sendChatMessageStream(
      provider, parsed.modelName, apiMessages, systemPrompt, {
        onChunk: ({ type, text }) => {
          // 通过 store 直接更新对应消息
          const state = useEditorStore.getState();
          const messages = state.chatHistories[activeChatBoxId] || [];
          const msg = messages.find(m => m.id === placeholderId);
          if (!msg) return;
          // 注意：需要使用 store 内部更新机制
          if (type === 'thinking') {
            useEditorStore.getState().updateChatHistoryMessage(activeChatBoxId, placeholderId, { thinking: (msg.thinking || '') + text });
          } else {
            useEditorStore.getState().updateChatHistoryMessage(activeChatBoxId, placeholderId, { content: msg.content + text });
          }
        },
        onDone: () => {
          setIsLoading(false);
        },
        onError: (err) => {
          setError(err);
          setIsLoading(false);
        },
      },
      canSendImage,
    );
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
    setIsLoading(false);
  }
}, [/* existing deps + chatHistories, activeChatBoxId */]);
```

- [ ] **Step 2: Store 新增 updateChatHistoryMessage action**

在 `src/store/index.ts` 中添加：

```typescript
// EditorStore 接口
updateChatHistoryMessage: (boxId: string, messageId: string, updates: Partial<ChatMessage>) => void;

// 实现
updateChatHistoryMessage: (boxId, messageId, updates) => set(state => ({
  chatHistories: {
    ...state.chatHistories,
    [boxId]: (state.chatHistories[boxId] || []).map(m =>
      m.id === messageId ? { ...m, ...updates } : m
    ),
  },
})),
```

- [ ] **Step 3: 验证没有编译错误**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useChatPanel.ts src/store/index.ts
git commit -m "feat: streaming support for per-box ChatPanel"
```

---

### Task 4: useCanvasChat 流式改造 + 画布缩略图

**Files:**
- Modify: `src/hooks/useCanvasChat.ts`

**Interfaces:**
- Consumes: `sendChatMessageStream`, `updateCanvasChatMessage` (Task 1 store action)
- Produces: Streaming Canvas Chat with retry UX + canvas snapshot on send

- [ ] **Step 1: 导入流式函数**

```typescript
import { sendChatMessageStream } from '../services/llm-stream';
```

- [ ] **Step 2: 添加画布快照函数**

在 `useCanvasChat` hook 内或上方添加：

```typescript
/** 截取当前画布的缩略图 Data URL */
async function takeCanvasSnapshot(): Promise<string | undefined> {
  const wrapper = document.querySelector('#canvas-wrapper') as HTMLElement;
  if (!wrapper) return undefined;

  const rect = wrapper.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return undefined;

  const TARGET_W = 120;
  const scale = TARGET_W / rect.width;

  // 使用 foreignObject 将 DOM 序列化到 SVG 再绘制到 canvas
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${wrapper.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(undefined);
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  });
}
```

- [ ] **Step 3: 改造 sendMessage 使用流式 + 重试 UX**

将 `sendMessage` 的 while 循环改为流式版本。关键变化：

- 发送时调 `takeCanvasSnapshot()` 获取截图
- 创建占位消息（携带 snapshotUrl）并立即写入 store
- 用 `sendChatMessageStream` 替代 `sendChatMessage`
- `onDone` 中执行校验，失败时保留文本并追加错误提示

```typescript
const sendMessage = useCallback(async (content: string, retryContext?: { feedback?: string }) => {
  const userMessage = createUserMessage(content);
  const snapshotUrl = await takeCanvasSnapshot();
  userMessage.canvasSnapshotUrl = snapshotUrl;
  addCanvasChatMessage(userMessage);
  setIsLoading(true);

  const provider = getCurrentProvider();
  if (!provider) { addCanvasChatMessage(createAssistantMessage('No LLM provider selected.')); setIsLoading(false); return; }
  const parsed = parseModel(chatModel);
  if (!parsed) { addCanvasChatMessage(createAssistantMessage('No model selected.')); setIsLoading(false); return; }

  const snapshot = { /* existing snapshot */ };

  let langHint = '';
  if (chatResponseLang === 'en') langHint = '\nYou MUST respond in English.';
  else if (chatResponseLang === 'zh') langHint = '\n你必须用中文回复。';

  let hardRetryCount = 0;
  const MAX_HARD_RETRIES = 2;
  let lastErrorText = '';

  const doStreamAttempt = (): Promise<boolean> => {
    return new Promise((resolve) => {
      const placeholderId = generateMessageId();
      const placeholder: ChatMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        canvasSnapshotUrl: snapshotUrl,
      };
      addCanvasChatMessage(placeholder);

      const contextJson = buildCanvasChatContext(snapshot);
      const allMessages = [...canvasChatMessages, userMessage];
      const apiMessages = allMessages.map(m => ({ role: m.role, content: m.content }));
      const lastUserIdx = apiMessages.map((m, i) => (m.role === 'user' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      if (lastUserIdx >= 0) {
        let enriched = `Current canvas state (JSON prompt):\n\`\`\`json\n${contextJson}\n\`\`\`\n\nMy composition request: ${apiMessages[lastUserIdx].content}`;
        if (hardRetryCount === 0 && retryContext?.feedback) enriched += buildLayoutFeedbackPrompt(retryContext.feedback);
        if (hardRetryCount > 0 && lastErrorText) enriched += lastErrorText;
        apiMessages[lastUserIdx] = { role: 'user', content: enriched };
      }

      const accumulatedContent: string[] = [];
      const accumulatedThinking: string[] = [];

      sendChatMessageStream(provider, parsed.modelName, apiMessages, CANVAS_CHAT_SYSTEM_PROMPT + langHint, {
        onChunk: ({ type, text }) => {
          if (type === 'thinking') {
            accumulatedThinking.push(text);
          } else {
            accumulatedContent.push(text);
          }
          // 逐步更新 store 中的占位消息
          const store = useEditorStore.getState();
          store.updateCanvasChatMessage(placeholderId, {
            content: accumulatedContent.join(''),
            thinking: accumulatedThinking.join(''),
          });
        },
        onDone: async (fullText) => {
          // 确保最终内容写入
          const finalContent = accumulatedContent.join('') || fullText;
          const finalThinking = accumulatedThinking.join('');
          useEditorStore.getState().updateCanvasChatMessage(placeholderId, {
            content: finalContent,
            thinking: finalThinking || undefined,
          });

          const parsedJson = extractAndValidateIdeogramJSON(finalContent);
          if (parsedJson !== null) {
            setPendingIdeogramOutput(parsedJson);
            // 软校验
            const rawElements = parsedJson.compositional_deconstruction.elements;
            const bboxSystem = detectBboxSystem(rawElements);
            const normCw = parsedJson.canvasW ?? canvasW;
            const normCh = parsedJson.canvasH ?? canvasH;
            const normElements = bboxSystem === 'normalized' ? rawElements : rawElements.map(el => {
              const [y1, x1, y2, x2] = el.bbox;
              if (bboxSystem === 'fractional') return { ...el, bbox: [y1 * 1000, x1 * 1000, y2 * 1000, x2 * 1000] as [number, number, number, number] };
              return { ...el, bbox: [(y1 / normCh) * 1000, (x1 / normCw) * 1000, (y2 / normCh) * 1000, (x2 / normCw) * 1000] as [number, number, number, number] };
            });
            const qualityReport = validateLayout(normElements, normCw, normCh);
            setPendingQualityReport(qualityReport.overallPass ? null : qualityReport);
            resolve(true);
          } else {
            // 解析失败：保留失败文本 + 追加错误提示
            lastErrorText = buildParseErrorText(finalContent);
            addCanvasChatMessage(createAssistantMessage(`\n\n[Parse Error: 解析失败，正在重新生成...]`));
            resolve(false);
          }
        },
        onError: (err) => {
          const store = useEditorStore.getState();
          store.updateCanvasChatMessage(placeholderId, {
            content: (accumulatedContent.join('') || '') + `\n\n[Stream Error: ${err}]`,
          });
          setIsLoading(false);
          resolve(false);
        },
      });
    });
  };

  while (hardRetryCount <= MAX_HARD_RETRIES) {
    const success = await doStreamAttempt();
    if (success) { setIsLoading(false); return; }
    hardRetryCount++;
  }

  // 超过最大重试次数 — 在最后一条错误消息后追加最终提示
  addCanvasChatMessage(createAssistantMessage(`Error: Failed after ${MAX_HARD_RETRIES + 1} attempts. Last error: ${lastErrorText.replace(/\n\n\[Parse Error\]\n/, '')}`));
  setIsLoading(false);
}, [/* all existing deps */]);
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCanvasChat.ts
git commit -m "feat: streaming + canvas snapshot for Canvas Chat"
```

---

### Task 5: ChatMessage 组件 CoT + 缩略图渲染 + CSS

**Files:**
- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `ChatMessage.thinking`, `ChatMessage.canvasSnapshotUrl`
- Produces: Updated `ChatMessage` component rendering CoT block and thumbnail

- [ ] **Step 1: 新增 CSS 样式**

在 `src/index.css` 中添加：

```css
/* ─── 模型思维链折叠块 ────────────────────────────────── */
.chat-thinking-block {
  margin: 8px 0;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.chat-thinking-block summary {
  cursor: pointer;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.chat-thinking-block summary::-webkit-details-marker {
  display: none;
}
.chat-thinking-block summary::before {
  content: '▶';
  font-size: 10px;
  transition: transform 0.15s;
}
.chat-thinking-block[open] summary::before {
  content: '▼';
}
.chat-thinking-content {
  padding: 0 10px 8px;
  font-size: 12px;
  font-style: italic;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ─── 画布缩略图 ────────────────────────────────────── */
.chat-msg-thumb-container {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.chat-msg-canvas-thumb {
  max-width: 120px;
  height: auto;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 2: 改造 ChatMessage 组件**

在 `src/components/chat/ChatMessage.tsx` 中，在 `roleLabel` 和 `handleCopy` 之间（或 `div.chat-msg-card` 内部正文上方），新增 CoT 和缩略图渲染：

```typescript
export default function ChatMessage({ message, onAdopt, onDismiss, dismissed }: ChatMessageProps) {
  const { t } = useI18n();
  const timeLabel = useMemo(() => formatTime(message.timestamp), [message.timestamp]);

  const isUser = message.role === 'user';
  const roleLabel = isUser ? t('chat.you') : 'AI';
  const avatarLetter = isUser ? 'U' : 'A';

  // 检测当前语言（用于 thinking 标签文案）
  const isChinese = useI18n().lang === 'zh';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch { /* silent */ }
  };

  return (
    <div className={`chat-msg-card ${isUser ? 'user' : 'assistant'}`}>
      {/* 标签栏 */}
      <div className="chat-msg-card-header">
        <span className="chat-msg-card-avatar">{avatarLetter}</span>
        <span className="chat-msg-card-role">{roleLabel}</span>
        <span className="chat-msg-card-spacer" />
        <span className="chat-msg-card-time">{timeLabel}</span>
      </div>

      {/* 画布缩略图（仅 assistant 消息） */}
      {!isUser && message.canvasSnapshotUrl && (
        <div className="chat-msg-thumb-container">
          <img
            src={message.canvasSnapshotUrl}
            className="chat-msg-canvas-thumb"
            alt="Canvas preview"
          />
        </div>
      )}

      {/* 思维链折叠块（仅 assistant 消息有 thinking） */}
      {!isUser && message.thinking && (
        <details className="chat-thinking-block">
          <summary>
            {isChinese ? '🧠 思考过程' : '🧠 Reasoning'}
          </summary>
          <div
            className="chat-thinking-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.thinking) }}
          />
        </details>
      )}

      {/* 消息正文 */}
      <div
        className="chat-msg-card-body"
        dangerouslySetInnerHTML={
          isUser ? undefined : { __html: renderMarkdown(message.content) }
        }
      >
        {isUser ? message.content : null}
      </div>

      {/* 操作栏（不变） */}
      {/* ... existing action bar ... */}
    </div>
  );
}
```

**注意**：确保 `isChinese` 的获取方式与项目现有的 i18n 模式一致。项目使用 `useI18n()` 返回 `{ lang, setLang, t }`，所以 `const { lang } = useI18n(); const isChinese = lang === 'zh';`。

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ChatMessage.tsx src/index.css
git commit -m "feat: render CoT block and canvas thumbnail in ChatMessage"
```

---

### Task 6: 验证测试

- [ ] **Step 1: 运行全部测试**

```bash
npx vitest run --reporter=verbose
```

Expected: All tests PASS

- [ ] **Step 2: 修复任何失败测试**

如有失败，分析原因并修复。可能影响的测试：
- `CanvasChatPanel.test.tsx` — 如果 `createAssistantMessage` 的行为因类型变化而不同
- `BoundingBox.test.tsx` — 不受影响
- Store 测试 — 不受影响

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "test: fix tests for streaming/CoT/thumbnail changes"
```
