import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LlmProvider, ProviderKind } from '../../components/llm/types';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// 在测试前 import，确保 mock 已生效
import { sendChatMessageStream, sendChatMessageWithOptions, STREAM_TIMEOUT_MS } from '../llm-stream';
import type { ChatMessageForApi } from '../../types/chat';

function makeProvider(kind: ProviderKind): LlmProvider {
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
    vi.useRealTimers();
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

  it('超时 abort 应触发可读的超时错误，而不是底层 signal 文案', async () => {
    vi.useFakeTimers();
    expect(STREAM_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
    mockFetch.mockImplementation((_url, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new Error('signal is aborted without reason'));
        });
      });
    });

    let errorText = '';
    const request = sendChatMessageStream(
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

    await vi.advanceTimersByTimeAsync(STREAM_TIMEOUT_MS);
    await request;

    expect(errorText).toContain('Request timed out');
    expect(errorText).not.toContain('signal is aborted without reason');
  });

  it('统一入口在 streamEnabled=false 时应等待完整回复后一次性回调', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        choices: [{ message: { content: 'Complete answer' } }],
      })),
    } as unknown as Response);

    const chunks: string[] = [];
    let doneText = '';

    await sendChatMessageWithOptions(
      makeProvider('openai'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: (chunk) => { chunks.push(chunk.text); },
        onDone: (text) => { doneText = text; },
        onError: () => {},
      },
      { streamEnabled: false, thinkingLevel: 'medium' },
    );

    expect(chunks).toEqual(['Complete answer']);
    expect(doneText).toBe('Complete answer');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toMatchObject({
      stream: false,
    });
  });

  it('OpenAI 流式请求应按 thinkingLevel 映射 reasoning_effort', async () => {
    mockFetch.mockResolvedValue(makeSSEResponse([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
      'data: [DONE]\n',
    ]));

    await sendChatMessageWithOptions(
      makeProvider('openai'),
      'gpt-5',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: () => {},
        onDone: () => {},
        onError: () => {},
      },
      { streamEnabled: true, thinkingLevel: 'high' },
    );

    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toMatchObject({
      stream: true,
      reasoning_effort: 'high',
    });
  });

  it('openai_compat 不应发送 OpenAI 专有 thinking 参数', async () => {
    mockFetch.mockResolvedValue(makeSSEResponse([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
      'data: [DONE]\n',
    ]));

    await sendChatMessageWithOptions(
      makeProvider('openai_compat'),
      'test-model',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: () => {},
        onDone: () => {},
        onError: () => {},
      },
      { streamEnabled: true, thinkingLevel: 'high' },
    );

    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).not.toHaveProperty('reasoning_effort');
  });

  it('Anthropic 流式请求应按 thinkingLevel 映射 thinking budget', async () => {
    mockFetch.mockResolvedValue(makeSSEResponse([
      'data: {"type":"content_block_delta","delta":{"text":"ok"}}\n',
      'data: {"type":"message_done"}\n',
    ]));

    await sendChatMessageWithOptions(
      makeProvider('anthropic'),
      'claude-test',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: () => {},
        onDone: () => {},
        onError: () => {},
      },
      { streamEnabled: true, thinkingLevel: 'medium' },
    );

    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toMatchObject({
      thinking: { type: 'enabled', budget_tokens: 2048 },
    });
  });

  it('Gemini 流式请求应按 thinkingLevel 映射 thinkingConfig', async () => {
    mockFetch.mockResolvedValue(makeSSEResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n',
    ]));

    await sendChatMessageWithOptions(
      makeProvider('gemini'),
      'gemini-test',
      [{ role: 'user', content: 'Hi' }],
      'Be helpful.',
      {
        onChunk: () => {},
        onDone: () => {},
        onError: () => {},
      },
      { streamEnabled: true, thinkingLevel: 'low' },
    );

    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toMatchObject({
      generationConfig: {
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });
  });
});
