import type { GatewayProviderConfig } from './config.ts';
import type {
  GatewayChatResult,
  GatewayChatRequest,
  GatewayStreamEvent,
  GatewayThinkingLevel,
} from './types.ts';

type OnEvent = (event: GatewayStreamEvent) => void;

export class GatewayProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayProviderError';
  }
}

function providerError(message: string): GatewayProviderError {
  return new GatewayProviderError(message);
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw providerError('Provider request failed');
  }
}

async function readSseData(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  const processFrame = (frame: string) => {
    const dataLines: string[] = [];
    for (const rawLine of frame.split(/\r?\n/)) {
      if (!rawLine.startsWith('data:')) continue;
      let value = rawLine.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      dataLines.push(value);
    }
    if (dataLines.length > 0) onData(dataLines.join('\n'));
  };

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/^\uFEFF/, '');
    while (true) {
      const boundary = /\r?\n\r?\n/.exec(buffer);
      if (!boundary) break;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      processFrame(frame);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) processFrame(buffer);
}

function thinkingBudgetFor(level: GatewayThinkingLevel | undefined): number | null {
  switch (level) {
    case 'low': return 1024;
    case 'medium': return 2048;
    case 'high': return 3072;
    default: return null;
  }
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);(?:[^,]*;)?base64,(.*)$/s.exec(dataUrl);
  if (!match) throw providerError('imageDataUrl must be a base64 data URL');
  return { mimeType: match[1], data: match[2] };
}

function lastUserMessageIndex(messages: GatewayChatRequest['messages']): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

function openAiMessages(request: GatewayChatRequest): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }
  const imageIndex = request.imageDataUrl ? lastUserMessageIndex(request.messages) : -1;
  for (const [index, message] of request.messages.entries()) {
    if (index === imageIndex) {
      messages.push({
        role: message.role,
        content: [
          { type: 'image_url', image_url: { url: request.imageDataUrl } },
          { type: 'text', text: message.content },
        ],
      });
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  }
  return messages;
}

function anthropicMessages(request: GatewayChatRequest): Array<Record<string, unknown>> {
  const imageIndex = request.imageDataUrl ? lastUserMessageIndex(request.messages) : -1;
  return request.messages.map((message, index) => {
    if (index !== imageIndex) return { role: message.role, content: message.content };
    const image = splitDataUrl(request.imageDataUrl!);
    return {
      role: message.role,
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } },
        { type: 'text', text: message.content },
      ],
    };
  });
}

function geminiContents(request: GatewayChatRequest): Array<Record<string, unknown>> {
  const imageIndex = request.imageDataUrl ? lastUserMessageIndex(request.messages) : -1;
  return request.messages.map((message, index) => {
    const parts: Array<Record<string, unknown>> = [];
    if (index === imageIndex && request.imageDataUrl) {
      const image = splitDataUrl(request.imageDataUrl);
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    parts.push({ text: message.content });
    return { role: message.role === 'assistant' ? 'model' : 'user', parts };
  });
}

function openAiBody(request: GatewayChatRequest, stream: boolean): Record<string, unknown> {
  const thinking = request.thinkingLevel && request.thinkingLevel !== 'off'
    ? { reasoning_effort: request.thinkingLevel }
    : {};
  return {
    model: request.model,
    messages: openAiMessages(request),
    stream,
    ...thinking,
  };
}

async function throwUpstreamError(response: Response): Promise<never> {
  throw providerError(`Provider API error ${response.status}`);
}

async function streamOpenAi(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  onEvent: OnEvent,
  signal: AbortSignal,
): Promise<void> {
  const response = await safeFetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(openAiBody(request, true)),
    signal,
  });
  if (!response.ok) await throwUpstreamError(response);
  if (!response.body) throw new Error('Provider returned an empty response body');

  let content = '';
  let upstreamError = false;
  let finishReason: string | null = null;
  await readSseData(response.body, data => {
    if (data === '[DONE]') return;
    try {
      const chunk = JSON.parse(data) as {
        error?: unknown;
        choices?: Array<{
          delta?: { content?: string; reasoning_content?: string };
          finish_reason?: string | null;
        }>;
      };
      if (chunk.error) {
        upstreamError = true;
        return;
      }
      const delta = chunk.choices?.[0]?.delta;
      const reason = chunk.choices?.[0]?.finish_reason;
      if (typeof reason === 'string' && reason) finishReason = reason;
      if (delta?.reasoning_content) onEvent({ type: 'thinking', text: delta.reasoning_content });
      if (delta?.content) {
        content += delta.content;
        onEvent({ type: 'content', text: delta.content });
      }
    } catch {
      // Ignore malformed upstream events instead of aborting the whole stream.
    }
  });

  if (upstreamError) throw providerError('Provider returned an error');
  if (finishReason && finishReason !== 'stop') {
    throw providerError(`Provider stopped before completion: ${finishReason}`);
  }
  if (!content) throw providerError('Provider returned no content');
  onEvent({ type: 'done', text: content });
}

async function chatOpenAi(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  signal: AbortSignal,
): Promise<GatewayChatResult> {
  const response = await safeFetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(openAiBody(request, false)),
    signal,
  });
  if (!response.ok) await throwUpstreamError(response);
  let payload: {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
      finish_reason?: string | null;
    }>;
  };
  try {
    payload = await response.json() as typeof payload;
  } catch {
    throw providerError('Provider returned invalid JSON');
  }
  const finishReason = payload.choices?.[0]?.finish_reason;
  if (typeof finishReason === 'string' && finishReason && finishReason !== 'stop') {
    throw providerError(`Provider stopped before completion: ${finishReason}`);
  }
  const message = payload.choices?.[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  const thinking = typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';
  if (!content) throw providerError('Provider returned no content');
  return { content, thinking };
}

async function streamAnthropic(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  onEvent: OnEvent,
  signal: AbortSignal,
): Promise<void> {
  const thinkingBudget = thinkingBudgetFor(request.thinkingLevel);
  const response = await safeFetch(`${provider.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 4096,
      stream: true,
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      messages: anthropicMessages(request),
      ...(thinkingBudget ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } } : {}),
    }),
    signal,
  });
  if (!response.ok) await throwUpstreamError(response);
  if (!response.body) throw new Error('Provider returned an empty response body');

  let content = '';
  let upstreamError = false;
  let stopReason: string | null = null;
  await readSseData(response.body, data => {
    try {
      const event = JSON.parse(data) as {
        type?: string;
        content_block?: { thinking?: string };
        delta?: { text?: string; thinking?: string; stop_reason?: string | null };
      };
      if (event.type === 'error') {
        upstreamError = true;
      } else if (event.type === 'message_delta') {
        if (typeof event.delta?.stop_reason === 'string' && event.delta.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
        if (event.delta?.text) {
          content += event.delta.text;
          onEvent({ type: 'content', text: event.delta.text });
        } else if (event.delta?.thinking) {
          onEvent({ type: 'thinking', text: event.delta.thinking });
        }
      } else if (event.type === 'content_block_start' && event.content_block?.thinking) {
        onEvent({ type: 'thinking', text: event.content_block.thinking });
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.text) {
          content += event.delta.text;
          onEvent({ type: 'content', text: event.delta.text });
        } else if (event.delta?.thinking) {
          onEvent({ type: 'thinking', text: event.delta.thinking });
        }
      }
    } catch {
      // Ignore malformed upstream events.
    }
  });

  if (upstreamError) throw providerError('Provider returned an error');
  if (stopReason && stopReason !== 'end_turn' && stopReason !== 'stop_sequence') {
    throw providerError(`Provider stopped before completion: ${stopReason}`);
  }
  if (!content) throw providerError('Provider returned no content');
  onEvent({ type: 'done', text: content });
}

async function chatAnthropic(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  signal: AbortSignal,
): Promise<GatewayChatResult> {
  const thinkingBudget = thinkingBudgetFor(request.thinkingLevel);
  const response = await safeFetch(`${provider.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 4096,
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      messages: anthropicMessages(request),
      ...(thinkingBudget ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } } : {}),
    }),
    signal,
  });
  if (!response.ok) await throwUpstreamError(response);
  let payload: {
    content?: Array<{ type?: string; text?: string; thinking?: string }>;
    stop_reason?: string | null;
  };
  try {
    payload = await response.json() as typeof payload;
  } catch {
    throw providerError('Provider returned invalid JSON');
  }
  if (payload.stop_reason && payload.stop_reason !== 'end_turn' && payload.stop_reason !== 'stop_sequence') {
    throw providerError(`Provider stopped before completion: ${payload.stop_reason}`);
  }
  let content = '';
  let thinking = '';
  for (const block of payload.content ?? []) {
    if (block.type === 'text' && block.text) content += block.text;
    if (block.type === 'thinking' && block.thinking) thinking += block.thinking;
  }
  if (!content) throw providerError('Provider returned no content');
  return { content, thinking };
}

async function streamGemini(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  onEvent: OnEvent,
  signal: AbortSignal,
): Promise<void> {
  const thinkingBudget = thinkingBudgetFor(request.thinkingLevel);
  const model = encodeURIComponent(request.model);
  const response = await safeFetch(`${provider.baseUrl}/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': provider.apiKey,
    },
    body: JSON.stringify({
      ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
      contents: geminiContents(request),
      ...(thinkingBudget ? { generationConfig: { thinkingConfig: { thinkingBudget } } } : {}),
    }),
    signal,
  });
  if (!response.ok) await throwUpstreamError(response);
  if (!response.body) throw new Error('Provider returned an empty response body');

  let content = '';
  let upstreamError = false;
  let finishReason: string | null = null;
  await readSseData(response.body, data => {
    try {
      const chunk = JSON.parse(data) as {
        error?: unknown;
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean | string }> };
          finishReason?: string;
        }>;
      };
      if (chunk.error) {
        upstreamError = true;
        return;
      }
      const finish = chunk.candidates?.[0]?.finishReason;
      if (typeof finish === 'string' && finish) finishReason = finish;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.thought === 'string' && part.thought) {
          onEvent({ type: 'thinking', text: part.thought });
          continue;
        }
        if (typeof part.text !== 'string' || !part.text) continue;
        if (part.thought === true) {
          onEvent({ type: 'thinking', text: part.text });
        } else {
          content += part.text;
          onEvent({ type: 'content', text: part.text });
        }
      }
    } catch {
      // Ignore malformed upstream events.
    }
  });

  if (upstreamError) throw providerError('Provider returned an error');
  if (finishReason && finishReason !== 'STOP') {
    throw providerError(`Provider stopped before completion: ${finishReason}`);
  }
  if (!content) throw providerError('Provider returned no content');
  onEvent({ type: 'done', text: content });
}

function extractGeminiParts(payload: {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean | string }> };
    finishReason?: string;
  }>;
}): GatewayChatResult {
  let content = '';
  let thinking = '';
  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    if (typeof part.thought === 'string' && part.thought) {
      thinking += part.thought;
      continue;
    }
    if (typeof part.text !== 'string' || !part.text) continue;
    if (part.thought === true) thinking += part.text;
    else content += part.text;
  }
  if (!content) throw providerError('Provider returned no content');
  return { content, thinking };
}

async function chatGemini(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  signal: AbortSignal,
): Promise<GatewayChatResult> {
  const thinkingBudget = thinkingBudgetFor(request.thinkingLevel);
  const model = encodeURIComponent(request.model);
  const response = await safeFetch(`${provider.baseUrl}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': provider.apiKey,
    },
    body: JSON.stringify({
      ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
      contents: geminiContents(request),
      ...(thinkingBudget ? { generationConfig: { thinkingConfig: { thinkingBudget } } } : {}),
    }),
    signal,
  });
  if (!response.ok) await throwUpstreamError(response);
  let payload: Parameters<typeof extractGeminiParts>[0] & { error?: unknown };
  try {
    payload = await response.json() as typeof payload;
  } catch {
    throw providerError('Provider returned invalid JSON');
  }
  if (payload.error) throw providerError('Provider returned an error');
  const finishReason = payload.candidates?.[0]?.finishReason;
  if (typeof finishReason === 'string' && finishReason && finishReason !== 'STOP') {
    throw providerError(`Provider stopped before completion: ${finishReason}`);
  }
  return extractGeminiParts(payload);
}

export async function streamGatewayChat(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  onEvent: OnEvent,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  switch (provider.kind) {
    case 'openai':
    case 'openai_compat':
      return streamOpenAi(provider, request, onEvent, signal);
    case 'anthropic':
      return streamAnthropic(provider, request, onEvent, signal);
    case 'gemini':
      return streamGemini(provider, request, onEvent, signal);
    default:
      throw new Error(`Unsupported provider kind: ${provider.kind}`);
  }
}

export async function chatGateway(
  provider: GatewayProviderConfig,
  request: GatewayChatRequest,
  signal: AbortSignal = new AbortController().signal,
): Promise<GatewayChatResult> {
  switch (provider.kind) {
    case 'openai':
    case 'openai_compat':
      return chatOpenAi(provider, request, signal);
    case 'anthropic':
      return chatAnthropic(provider, request, signal);
    case 'gemini':
      return chatGemini(provider, request, signal);
    default:
      throw new Error(`Unsupported provider kind: ${provider.kind}`);
  }
}

export async function fetchProviderModels(provider: GatewayProviderConfig): Promise<string[]> {
  let response: Response;
  if (provider.kind === 'openai' || provider.kind === 'openai_compat') {
    response = await safeFetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
    });
  } else if (provider.kind === 'anthropic') {
    response = await safeFetch(`${provider.baseUrl}/models`, {
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
  } else {
    response = await safeFetch(`${provider.baseUrl}/models`, {
      headers: { 'x-goog-api-key': provider.apiKey },
    });
  }
  if (!response.ok) await throwUpstreamError(response);
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw providerError('Provider returned invalid JSON');
  }
  if (provider.kind === 'gemini') {
    return ((payload.models as Array<{ name?: string; supportedGenerationMethods?: string[] }> | undefined) ?? [])
      .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
      .map(model => (model.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort();
  }
  return ((payload.data as Array<{ id?: string }> | undefined) ?? [])
    .map(model => model.id ?? '')
    .filter(Boolean)
    .sort();
}
