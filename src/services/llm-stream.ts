import type { LlmProvider } from '../components/llm/types';
import { DEFAULT_BASE_URLS } from '../components/llm/types';
import type { ChatMessage, ChatMessageForApi, ChatThinkingLevel } from '../types/chat';
import { buildMultimodalMessages, ensureDataUrl, sendChatMessage } from './llm-chat';

export interface StreamChunk {
  type: 'thinking' | 'content';
  text: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
  onAbort?: () => void;
  /** 捕获 HTTP 响应状态和头信息，用于调试展示 */
  onResponse?: (status: number, headers: Record<string, string>) => void;
  /** 内部使用：底层流每收到一段新数据时通知空闲超时看门狗。 */
  onActivity?: () => void;
}

export interface ChatRunOptions {
  streamEnabled: boolean;
  thinkingLevel: ChatThinkingLevel;
  imageDataUrl?: string;
}

interface StreamRequestOptions {
  thinkingLevel?: ChatThinkingLevel;
}

/** 当前活跃的 AbortController，用于外部手动终止请求 */
let activeAbortController: AbortController | null = null;

/** 手动终止当前正在进行的 LLM 请求 */
export function abortActiveRequest(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

export const STREAM_TIMEOUT_MS = 120_000;

function thinkingBudgetFor(level?: ChatThinkingLevel): number | null {
  switch (level) {
    case 'low':
      return 1024;
    case 'medium':
      return 2048;
    case 'high':
      return 3072;
    default:
      return null;
  }
}

/** 按运行设置发送 LLM 消息，统一封装流式与非流式路径。 */
export async function sendChatMessageWithOptions(
  provider: LlmProvider,
  model: string,
  messages: ChatMessageForApi[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  options: ChatRunOptions,
): Promise<void> {
  if (options.streamEnabled) {
    return sendChatMessageStream(
      provider,
      model,
      messages,
      systemPrompt,
      callbacks,
      options.imageDataUrl,
      { thinkingLevel: options.thinkingLevel },
    );
  }

  const chatMessages: ChatMessage[] = messages.map((message, index) => ({
    id: `api_${index}`,
    role: message.role,
    content: message.content,
    timestamp: Date.now() + index,
  }));
  const result = await sendChatMessage(provider, model, chatMessages, systemPrompt, options.imageDataUrl);
  if (!result.ok || !result.content) {
    callbacks.onError(result.error || 'Unknown error');
    return;
  }
  callbacks.onChunk({ type: 'content', text: result.content });
  callbacks.onDone(result.content);
}

/**
 * SSE 流式聊天消息发送。
 * 按 provider.kind 分发到对应的流式 API 调用。
 * 使用 AbortController 实现 120s 流空闲超时；任何新数据/思考 chunk 都会重置计时。
 */
export async function sendChatMessageStream(
  provider: LlmProvider,
  model: string,
  messages: ChatMessageForApi[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  imageDataUrl?: string,
  options: StreamRequestOptions = {},
): Promise<void> {
  const safeImageUrl = imageDataUrl ? await ensureDataUrl(imageDataUrl) : undefined;
  const apiMessages = safeImageUrl
    ? buildMultimodalMessages(messages, safeImageUrl, provider.kind)
    : messages;
  // 测试打桩模式 (Mock Test Mode) 拦截
  if (provider.id === 'mock_test_provider' || provider.api_key === 'mock-key' || (typeof localStorage !== 'undefined' && localStorage.getItem('ideogram4-mock-test-mode') === 'true' && provider.name.includes('Mock'))) {
    const mockController = new AbortController();
    activeAbortController = mockController;
    const wait = (ms: number) => new Promise<void>((resolve, reject) => {
      if (mockController.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(() => {
        mockController.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      mockController.signal.addEventListener('abort', onAbort, { once: true });
    });
    const mockJson = '```json\n' + JSON.stringify({
      high_level_description: 'A cinematic, high-detail composition with dramatic lighting and balanced spatial depth.',
      style_description: {
        aesthetics: 'cinematic, high-detail poster design',
        lighting: 'dramatic rim lighting with subtle atmospheric haze',
        photo: '85mm lens, shallow depth of field, eye-level',
        medium: 'photograph',
        color_palette: ['#FAFAFA', '#38BDF8', '#1E293B']
      },
      canvasW: 1024,
      canvasH: 576,
      compositional_deconstruction: {
        background: 'Expansive moody atmospheric backdrop with rich gradients and soft environmental reflections.',
        elements: [
          {
            type: 'object',
            desc: 'Main hero subject positioned with clear visual hierarchy and sharp focus.',
            bbox: [120, 80, 880, 520],
            color_palette: ['#fafafa', '#38bdf8', '#1e293b']
          },
          {
            type: 'text',
            text: 'MOCK STUDIO',
            desc: 'Bold modern sans-serif headline in upper region with subtle glow.',
            bbox: [160, 560, 360, 920],
            color_palette: ['#ffffff', '#00d4aa']
          }
        ]
      }
    }, null, 2) + '\n```';
    try {
      await wait(400);
      callbacks.onResponse?.(200, { 'content-type': 'text/event-stream' });
      const thinkingText = 'Analyzing the prompt and craft an ideal composition with balanced bounding boxes and vivid descriptions...';
      callbacks.onChunk({ type: 'thinking', text: thinkingText });
      await wait(600);

      // 分片输出，便于在 mock 模式下验证实时 bbox 预览与中断恢复。
      const MOCK_CHUNK_SIZE = 36;
      for (let offset = 0; offset < mockJson.length; offset += MOCK_CHUNK_SIZE) {
        callbacks.onChunk({ type: 'content', text: mockJson.slice(offset, offset + MOCK_CHUNK_SIZE) });
        await wait(38);
      }
      callbacks.onDone(mockJson);
    } catch (error) {
      if (mockController.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        callbacks.onAbort?.();
      } else {
        callbacks.onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (activeAbortController === mockController) activeAbortController = null;
    }
    return;
  }

  const baseUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind];

  const controller = new AbortController();
  let timedOut = false;
  activeAbortController = controller;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let streamFinished = false;

  const clearIdleTimeout = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const resetIdleTimeout = () => {
    if (streamFinished || timedOut) return;
    clearIdleTimeout();
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STREAM_TIMEOUT_MS);
  };

  const finishStream = () => {
    streamFinished = true;
    clearIdleTimeout();
  };

  const timeoutMessage = `Request timed out after ${STREAM_TIMEOUT_MS / 1000} seconds without new stream data. The model may still be reasoning or the connection may be stalled.`;
  const activeCallbacks: StreamCallbacks = {
    ...callbacks,
    onChunk: chunk => {
      resetIdleTimeout();
      callbacks.onChunk(chunk);
    },
    onDone: fullText => {
      finishStream();
      callbacks.onDone(fullText);
    },
    onError: error => {
      finishStream();
      callbacks.onError(error);
    },
    onAbort: () => {
      finishStream();
      callbacks.onAbort?.();
    },
    onResponse: (status, headers) => {
      resetIdleTimeout();
      callbacks.onResponse?.(status, headers);
    },
    onActivity: resetIdleTimeout,
  };
  resetIdleTimeout();

  try {
    await dispatchStreamCall(
      provider.kind, baseUrl, provider.api_key, model, systemPrompt, apiMessages,
      activeCallbacks, controller.signal, options
    );
    finishStream();
  } catch (err) {
    finishStream();
    if (timedOut) {
      callbacks.onError(timeoutMessage);
      return;
    }
    // 用户手动终止请求 — 不显示错误，调用 onAbort 回调
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onAbort?.();
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(msg);
  } finally {
    finishStream();
    activeAbortController = null;
  }
}

/** 从 ReadableStream 中逐行读取 SSE 数据 */
async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => void,
  onActivity?: () => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity?.();
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

/**
 * 调用 OpenAI / OpenAI Compatible 流式 API。
 * 解析标准 SSE data: 事件块中的 delta.content 字段。
 */
async function callOpenAIStream(
  baseUrl: string, apiKey: string, model: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
  thinkingLevel?: ChatThinkingLevel,
): Promise<void> {
  const url = `${baseUrl}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      stream: true,
      ...(thinkingLevel && thinkingLevel !== 'off' ? { reasoning_effort: thinkingLevel } : {}),
    }),
    signal,
  });
  callbacks.onResponse?.(resp.status, resp.headers ? Object.fromEntries(resp.headers.entries()) : {});

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const reader = resp.body!.getReader();
  let accumulated = '';
  let reasoningAccumulated = '';

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
      if (delta?.reasoning_content) {
        reasoningAccumulated += delta.reasoning_content;
        callbacks.onChunk({ type: 'thinking', text: delta.reasoning_content });
      }
    } catch { /* skip unparseable lines */ }
  }, callbacks.onActivity);

  if (!accumulated) {
    callbacks.onError('The API returned an empty response. Check that the model supports streaming and the request parameters are correct.');
    return;
  }
  callbacks.onDone(accumulated);
}

/**
 * 调用 Anthropic 流式 API。
 * 解析 event stream（content_block_start / content_block_delta / message_done）。
 * CoT 从 content_block.thinking 和 delta.thinking 字段提取。
 */
async function callAnthropicStream(
  baseUrl: string, apiKey: string, model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
  thinkingLevel?: ChatThinkingLevel,
): Promise<void> {
  const url = `${baseUrl}/messages`;
  const thinkingBudget = thinkingBudgetFor(thinkingLevel);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: apiMessages,
      ...(thinkingBudget ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } } : {}),
    }),
    signal,
  });
  callbacks.onResponse?.(resp.status, resp.headers ? Object.fromEntries(resp.headers.entries()) : {});

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
  }, callbacks.onActivity);

  if (!accumulated) {
    callbacks.onError('The API returned an empty response. Check that the model supports streaming with thinking enabled.');
    return;
  }
  callbacks.onDone(accumulated);
}

/**
 * 调用 Gemini 流式 API。
 * 使用 streamGenerateContent 端点，通过 alt=sse 获取 SSE 流。
 * 解析 candidates[].content.parts 中的 text 和 thought 字段。
 */
async function callGeminiStream(
  baseUrl: string, apiKey: string, model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal,
  thinkingLevel?: ChatThinkingLevel,
): Promise<void> {
  const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const thinkingBudget = thinkingBudgetFor(thinkingLevel);

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
      ...(thinkingBudget ? { generationConfig: { thinkingConfig: { thinkingBudget } } } : {}),
    }),
    signal,
  });
  callbacks.onResponse?.(resp.status, resp.headers ? Object.fromEntries(resp.headers.entries()) : {});

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
  }, callbacks.onActivity);

  if (!accumulated) {
    callbacks.onError('The API returned an empty response. Check that the model supports streaming and the API key is valid.');
    return;
  }
  callbacks.onDone(accumulated);
}

/**
 * 按 provider kind 分发到对应的流式 API 调用。
 * openai 和 openai_compat 共用 callOpenAIStream（system 拼入 messages 队首）。
 */
async function dispatchStreamCall(
  kind: string, baseUrl: string, apiKey: string, model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
  callbacks: StreamCallbacks, signal: AbortSignal, options: StreamRequestOptions,
): Promise<void> {
  switch (kind) {
    case 'openai':
      return callOpenAIStream(baseUrl, apiKey, model, [
        { role: 'system', content: systemPrompt },
        ...apiMessages,
      ], callbacks, signal, options.thinkingLevel);
    case 'openai_compat':
      return callOpenAIStream(baseUrl, apiKey, model, [
        { role: 'system', content: systemPrompt },
        ...apiMessages,
      ], callbacks, signal, options.thinkingLevel);
    case 'anthropic':
      return callAnthropicStream(baseUrl, apiKey, model, systemPrompt, apiMessages, callbacks, signal, options.thinkingLevel);
    case 'gemini':
      return callGeminiStream(baseUrl, apiKey, model, systemPrompt, apiMessages, callbacks, signal, options.thinkingLevel);
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}
