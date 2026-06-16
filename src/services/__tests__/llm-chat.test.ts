import { describe, it, expect } from 'vitest';
import { parseOpenAIResponse, parseAnthropicResponse } from '../llm-chat';

// ─── parseOpenAIResponse ────────────────────────────────────────────

describe('parseOpenAIResponse', () => {
  describe('普通 JSON 响应', () => {
    it('应正确提取 choices[0].message.content', () => {
      const json = JSON.stringify({
        id: 'chatcmpl-xxx',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hello world' } }],
      });

      const result = parseOpenAIResponse(json);
      expect(result).toBe('Hello world');
    });
  });

  describe('SSE 响应', () => {
    it('单个 chunk 应正确解析', () => {
      const sse = 'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n';

      const result = parseOpenAIResponse(sse);
      expect(result).toBe('Hello');
    });

    it('多个 chunk 应正确拼接 content', () => {
      const sse = [
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"}}]}',
        '',
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":" world"}}]}',
        '',
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":"!"}}]}',
        '',
      ].join('\n');

      const result = parseOpenAIResponse(sse);
      expect(result).toBe('Hello world!');
    });

    it('首个 chunk 只有 role 无 content 应正确处理', () => {
      const sse = [
        'data: {"id":"1","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}',
        '',
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"}}]}',
        '',
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":" world"}}]}',
        '',
      ].join('\n');

      const result = parseOpenAIResponse(sse);
      expect(result).toBe('Hello world');
    });

    it('应正确处理 [DONE] 结束标记', () => {
      const sse = [
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      const result = parseOpenAIResponse(sse);
      expect(result).toBe('Hello');
    });

    it('空行应不影响解析', () => {
      const sse = '\n\ndata: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n\n';

      const result = parseOpenAIResponse(sse);
      expect(result).toBe('Hello');
    });

    it('无 content 应抛错', () => {
      const sse = 'data: {"id":"1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n';

      expect(() => parseOpenAIResponse(sse)).toThrow('No content');
    });
  });
});

// ─── parseAnthropicResponse ─────────────────────────────────────────

describe('parseAnthropicResponse', () => {
  describe('普通 JSON 响应', () => {
    it('应正确提取 content[0].text', () => {
      const json = JSON.stringify({
        id: 'msg_xxx',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      });

      const result = parseAnthropicResponse(json);
      expect(result).toBe('Hello world');
    });
  });

  describe('SSE 响应', () => {
    it('多个 content_block_delta 应正确拼接', () => {
      const sse = [
        'data: {"type":"message_start","message":{"id":"msg_1","role":"assistant"}}',
        '',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
        '',
      ].join('\n');

      const result = parseAnthropicResponse(sse);
      expect(result).toBe('Hello world');
    });

    it('应正确处理 [DONE] 和空行', () => {
      const sse = [
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Bonjour"}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      const result = parseAnthropicResponse(sse);
      expect(result).toBe('Bonjour');
    });

    it('无 content 应抛错', () => {
      const sse = [
        'data: {"type":"message_start","message":{"id":"msg_1"}}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
        '',
      ].join('\n');

      expect(() => parseAnthropicResponse(sse)).toThrow('No content');
    });
  });
});