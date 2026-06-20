import type { LlmProvider } from '../components/llm/types';
import { DEFAULT_BASE_URLS } from '../components/llm/types';
import type { ChatMessage, ChatMessageForApi, ChatThinkingLevel } from '../types/chat';
import { buildMultimodalMessages, sendChatMessage } from './llm-chat';

export interface StreamChunk {
  type: 'thinking' | 'content';
  text: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export interface ChatRunOptions {
  streamEnabled: boolean;
  thinkingLevel: ChatThinkingLevel;
  imageDataUrl?: string;
}

interface StreamRequestOptions {
  thinkingLevel?: ChatThinkingLevel;
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
 * 使用 AbortController 实现 120s 超时。
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
  const apiMessages = imageDataUrl
    ? buildMultimodalMessages(messages, imageDataUrl, provider.kind)
    : messages;
  const baseUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind];

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Request timed out after ${STREAM_TIMEOUT_MS / 1000} seconds.`));
  }, STREAM_TIMEOUT_MS);

  try {
    await dispatchStreamCall(
      provider.kind, baseUrl, provider.api_key, model, systemPrompt, apiMessages,
      callbacks, controller.signal, options
    );
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = timedOut
      ? `Request timed out after ${STREAM_TIMEOUT_MS / 1000} seconds. The model did not start or finish a streaming response in time.`
      : err instanceof Error ? err.message : String(err);
    callbacks.onError(msg);
  }
}

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
      ], callbacks, signal);
    case 'anthropic':
      return callAnthropicStream(baseUrl, apiKey, model, systemPrompt, apiMessages, callbacks, signal, options.thinkingLevel);
    case 'gemini':
      return callGeminiStream(baseUrl, apiKey, model, systemPrompt, apiMessages, callbacks, signal, options.thinkingLevel);
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}
