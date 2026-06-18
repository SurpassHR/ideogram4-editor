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
