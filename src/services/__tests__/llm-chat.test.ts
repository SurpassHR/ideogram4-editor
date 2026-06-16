import { describe, it, expect } from 'vitest';
import { parseOpenAIResponse, parseAnthropicResponse, buildMultimodalMessages, extractBase64FromDataUrl, extractMimeTypeFromDataUrl } from '../llm-chat';

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

// ─── buildMultimodalMessages ────────────────────────────────────────

describe('buildMultimodalMessages', () => {
  const messages = [
    { role: 'user', content: 'First message' },
    { role: 'assistant', content: 'First response' },
    { role: 'user', content: 'Describe this image' },
  ];
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

  it('无 imageDataUrl 时，应返回原始消息', () => {
    const result = buildMultimodalMessages(messages, undefined);
    expect(result).toEqual(messages);
  });

  it('OpenAI 格式：应正确构造 image_url 多模态消息', () => {
    const result = buildMultimodalMessages(messages, imageDataUrl, 'openai');
    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const content = lastMsg.content as Array<{ type: string; image_url?: { url: string }; text?: string }>;
    expect(content[0]).toEqual({
      type: 'image_url',
      image_url: { url: imageDataUrl },
    });
    expect(content[1]).toEqual({
      type: 'text',
      text: 'Describe this image',
    });
    // 前面的消息应保持字符串
    expect(typeof result[0].content).toBe('string');
  });

  it('Anthropic 格式：应正确构造 image 多模态消息', () => {
    const result = buildMultimodalMessages(messages, imageDataUrl, 'anthropic');
    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe('user');
    const content = lastMsg.content as Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }>;
    expect(content[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'iVBORw0KGgo=',
      },
    });
    expect(content[1]).toEqual({
      type: 'text',
      text: 'Describe this image',
    });
  });

  it('Gemini 格式：应正确构造 inlineData 多模态消息', () => {
    const result = buildMultimodalMessages(messages, imageDataUrl, 'gemini');
    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const content = lastMsg.content as Array<{ inlineData?: { mimeType: string; data: string }; text?: string }>;
    expect(content[0]).toEqual({
      inlineData: {
        mimeType: 'image/png',
        data: 'iVBORw0KGgo=',
      },
    });
    expect(content[1]).toEqual({
      text: 'Describe this image',
    });
  });

  it('openai_compat 格式应使用与 openai 相同的格式', () => {
    const openaiResult = buildMultimodalMessages(messages, imageDataUrl, 'openai');
    const compatResult = buildMultimodalMessages(messages, imageDataUrl, 'openai_compat');
    expect(compatResult).toEqual(openaiResult);
  });

  it('最后一条消息不是 user 时，应追加一条空文本 user 消息', () => {
    const assistantOnly = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    const result = buildMultimodalMessages(assistantOnly, imageDataUrl, 'openai');
    expect(result).toHaveLength(3);
    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(Array.isArray(lastMsg.content)).toBe(true);
  });

  it('多条用户消息时，仅最后一条 user 消息变为多模态', () => {
    const multiUser = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Reply' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'Reply2' },
      { role: 'user', content: 'Third' },
    ];
    const result = buildMultimodalMessages(multiUser, imageDataUrl, 'openai');
    expect(result.length).toBe(5);
    expect(Array.isArray(result[4].content)).toBe(true);
    expect(typeof result[0].content).toBe('string');
    expect(typeof result[2].content).toBe('string');
  });
});

// ─── extractBase64FromDataUrl / extractMimeTypeFromDataUrl ──────────

describe('extractBase64FromDataUrl', () => {
  it('应从 data URL 中提取 base64 数据', () => {
    const result = extractBase64FromDataUrl('data:image/png;base64,abc123');
    expect(result).toBe('abc123');
  });

  it('应提取带 = padding 的 base64 数据', () => {
    const result = extractBase64FromDataUrl('data:image/jpeg;base64,/9j/4AAQ==');
    expect(result).toBe('/9j/4AAQ==');
  });
});

describe('extractMimeTypeFromDataUrl', () => {
  it('应从 data URL 中提取 MIME 类型', () => {
    const result = extractMimeTypeFromDataUrl('data:image/png;base64,abc123');
    expect(result).toBe('image/png');
  });

  it('应提取 jpeg MIME 类型', () => {
    const result = extractMimeTypeFromDataUrl('data:image/jpeg;base64,/9j/4AAQ==');
    expect(result).toBe('image/jpeg');
  });

  it('应提取 webp MIME 类型', () => {
    const result = extractMimeTypeFromDataUrl('data:image/webp;base64,UklGRpA=');
    expect(result).toBe('image/webp');
  });
});