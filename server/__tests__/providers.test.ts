// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GatewayProviderConfig } from '../config.ts';
import { chatGateway, streamGatewayChat } from '../providers.ts';
import type { GatewayChatRequest, GatewayStreamEvent } from '../types.ts';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const openAiProvider: GatewayProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  kind: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'server-secret',
  models: ['gpt-5.1'],
};

const anthropicProvider: GatewayProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  kind: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  apiKey: 'anthropic-secret',
  models: ['claude-sonnet-4-6'],
};

const geminiProvider: GatewayProviderConfig = {
  id: 'gemini',
  name: 'Gemini',
  kind: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'gemini-secret',
  models: ['gemini-3.8-flash'],
};

const baseRequest: GatewayChatRequest = {
  providerId: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Describe a cat.' }],
  systemPrompt: 'Be concise.',
};

describe('streamGatewayChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes an OpenAI SSE stream and keeps the provider key server-side', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const events: GatewayStreamEvent[] = [];

    await streamGatewayChat(openAiProvider, baseRequest, event => events.push(event));

    expect(events).toEqual([
      { type: 'thinking', text: 'thinking' },
      { type: 'content', text: 'Hello' },
      { type: 'content', text: ' world' },
      { type: 'done', text: 'Hello world' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error('fetch init missing');
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer server-secret' });
    expect(String(init.body)).not.toContain('server-secret');
  });

  it('parses SSE frames split across chunks and data fields without a space', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sseResponse([
      'data:{"choices":[{"delta":',
      '{"content":"Hel',
      'lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const events: GatewayStreamEvent[] = [];

    await streamGatewayChat(openAiProvider, baseRequest, event => events.push(event));

    expect(events).toEqual([
      { type: 'content', text: 'Hello' },
      { type: 'content', text: '!' },
      { type: 'done', text: 'Hello!' },
    ]);
  });

  it('joins multi-line SSE data fields into one JSON payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":\n',
      'data: {"content":"Hello"}}]}\n\n',
    ])));
    const events: GatewayStreamEvent[] = [];

    await streamGatewayChat(openAiProvider, baseRequest, event => events.push(event));

    expect(events.at(-1)).toEqual({ type: 'done', text: 'Hello' });
  });

  it('normalizes Anthropic thinking and text deltas', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sseResponse([
      'data: {"type":"content_block_start","content_block":{"type":"thinking","thinking":"plan"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":" more"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Answer"}}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const events: GatewayStreamEvent[] = [];

    await streamGatewayChat(anthropicProvider, {
      ...baseRequest,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      thinkingLevel: 'medium',
    }, event => events.push(event));

    expect(events).toEqual([
      { type: 'thinking', text: 'plan' },
      { type: 'thinking', text: ' more' },
      { type: 'content', text: 'Answer' },
      { type: 'done', text: 'Answer' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error('fetch init missing');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(init.body));
    expect(body.system).toBe('Be concise.');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Describe a cat.' });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
  });

  it('normalizes Gemini thought parts without exposing the API key in the URL', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"plan","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Answer"}]}}]}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const events: GatewayStreamEvent[] = [];

    await streamGatewayChat(geminiProvider, {
      ...baseRequest,
      providerId: 'gemini',
      model: 'gemini-3.8-flash',
    }, event => events.push(event));

    expect(events).toEqual([
      { type: 'thinking', text: 'plan' },
      { type: 'content', text: 'Answer' },
      { type: 'done', text: 'Answer' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error('fetch init missing');
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
    expect(url).not.toContain('gemini-secret');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'gemini-secret' });
  });

  it('builds provider-specific multimodal messages for the last user turn', async () => {
    const imageDataUrl = 'data:image/png;base64,AAAA';
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => sseResponse([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await streamGatewayChat(openAiProvider, {
      ...baseRequest,
      imageDataUrl,
    }, () => {});

    const init = fetchMock.mock.calls[0][1];
    if (!init) throw new Error('fetch init missing');
    const body = JSON.parse(String(init.body));
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: 'Describe a cat.' },
      ],
    });
  });

  it('does not leak upstream error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'secret upstream diagnostic' },
    }), { status: 401 })));

    await expect(streamGatewayChat(openAiProvider, baseRequest, () => {}))
      .rejects.toThrow('Provider API error 401');
    await expect(streamGatewayChat(openAiProvider, baseRequest, () => {}))
      .rejects.not.toThrow('secret upstream diagnostic');
  });

  it('rejects provider error events instead of treating them as success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"error":{"message":"secret provider error"}}\n\n',
    ])));

    await expect(streamGatewayChat(openAiProvider, baseRequest, () => {}))
      .rejects.toThrow('Provider returned an error');
  });

  it('rejects truncated OpenAI streams instead of emitting a successful done event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Half"},"finish_reason":"length"}]}\n\n',
    ])));
    const events: GatewayStreamEvent[] = [];

    await expect(streamGatewayChat(openAiProvider, baseRequest, event => events.push(event)))
      .rejects.toThrow('Provider stopped before completion: length');
    expect(events).toEqual([{ type: 'content', text: 'Half' }]);
  });

  it('returns normalized non-streaming OpenAI content and thinking', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello', reasoning_content: 'Plan' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(chatGateway(openAiProvider, baseRequest)).resolves.toEqual({
      content: 'Hello',
      thinking: 'Plan',
    });
  });

  it('extracts Anthropic text and thinking blocks from a non-streaming response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      content: [
        { type: 'thinking', thinking: 'Plan' },
        { type: 'text', text: 'Hello' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(chatGateway(anthropicProvider, {
      ...baseRequest,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
    })).resolves.toEqual({ content: 'Hello', thinking: 'Plan' });
  });

  it('extracts Gemini text and thought parts from a non-streaming response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [
        { text: 'Plan', thought: true },
        { text: 'Hello' },
      ] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(chatGateway(geminiProvider, {
      ...baseRequest,
      providerId: 'gemini',
      model: 'gemini-3.8-flash',
    })).resolves.toEqual({ content: 'Hello', thinking: 'Plan' });
  });
});
