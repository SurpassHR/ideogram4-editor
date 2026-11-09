import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatMessage from '../ChatMessage';

// Mock i18n
vi.mock('../../../i18n/context', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'chat.you': 'You',
        'chat.copy': 'Copy',
        'chat.adopt': 'Adopt',
        'chat.dismiss': 'Dismiss',
        'chat.adopted': 'Adopted ✓',
      };
      return map[key] ?? key;
    },
    lang: 'en',
  }),
}));

// Mock store
vi.mock('../../../store', () => ({
  useEditorStore: (selector: (s: unknown) => unknown) =>
    selector({
      chatResponseLang: 'en',
      chatPresets: [],
      showDeveloperTools: false,
    }),
}));

// Mock llm-canvas-chat (parsedOutput extraction)
vi.mock('../../../services/llm-canvas-chat', () => ({
  extractAndValidateIdeogramJSON: () => null, // default: no valid JSON
  validateIdeogramJSONVerbose: () => ({ output: null, error: null }), // default: no valid JSON
}));

// Mock JsonCodeBlock to simplify verification
vi.mock('../JsonCodeBlock', () => ({
  default: ({ json }: { json: string }) => (
    <div data-testid="json-code-block">{json}</div>
  ),
}));

const makeMsg = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  role: 'assistant',
  content: 'Hello world',
  timestamp: Date.now(),
  ...overrides,
});

describe('ChatMessage', () => {
  it('用户消息渲染纯文本', () => {
    const msg = makeMsg({ role: 'user', content: 'Hi there' });
    const { container } = render(<ChatMessage message={msg as any} />);
    expect(container.textContent).toContain('Hi there');
  });

  it('assistant 消息渲染 markdown 文本', () => {
    const msg = makeMsg({ content: '**bold** text' });
    const { container } = render(<ChatMessage message={msg as any} />);
    expect(container.querySelector('.chat-msg-card-body')?.textContent).toContain('bold');
  });

  it('含 JSON 代码块时渲染 JsonCodeBlock', () => {
    const msg = makeMsg({
      content: 'Here is the result:\n```json\n{"boxes": []}\n```',
      canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
    });
    render(<ChatMessage message={msg as any} />);
    // JsonCodeBlock mocked, should render its testid
    expect(screen.getByTestId('json-code-block')).toBeTruthy();
  });

  it('无 JSON 代码块不渲染 JsonCodeBlock', () => {
    const msg = makeMsg({
      content: 'Just a text response',
      canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
    });
    render(<ChatMessage message={msg as any} />);
    expect(screen.queryByTestId('json-code-block')).toBeNull();
  });

  it('含非 JSON 代码块时渲染 pre>code', () => {
    const msg = makeMsg({
      content: 'Code:\n```python\nx = 1\n```',
      canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
    });
    const { container } = render(<ChatMessage message={msg as any} />);
    const codeEl = container.querySelector('code.language-python');
    expect(codeEl).toBeTruthy();
    expect(codeEl?.textContent).toContain('x = 1');
  });

  it('用户消息没有 thumb DOM', () => {
    const msg = makeMsg({ role: 'user', canvasSnapshotUrl: 'data:img' });
    const { container } = render(<ChatMessage message={msg as any} />);
    expect(container.querySelector('.chat-msg-thumb-container')).toBeNull();
    expect(container.querySelector('.chat-msg-canvas-thumb')).toBeNull();
  });

  it('assistant 消息没有独立的 thumb DOM', () => {
    const msg = makeMsg({ canvasSnapshotUrl: 'data:img' });
    const { container } = render(<ChatMessage message={msg as any} />);
    expect(container.querySelector('.chat-msg-thumb-container')).toBeNull();
    expect(container.querySelector('.chat-msg-canvas-thumb')).toBeNull();
  });

  // ─── summary 模式（Canvas Chat：零代码用户不暴露 JSON）───────────────

  describe('renderMode="summary"', () => {
    const jsonContent = 'Here you go:\n```json\n{"high_level_description": "A cat"}\n```';

    it('不渲染任何 JSON 代码块', () => {
      const msg = makeMsg({
        content: jsonContent,
        summary: '一张猫的照片',
        canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
      });
      const { container } = render(<ChatMessage message={msg as any} renderMode="summary" />);

      expect(container.querySelector('.language-json')).toBeNull();
      expect(container.querySelector('pre code')).toBeNull();
      expect(screen.queryByTestId('json-code-block')).toBeNull();
    });

    it('渲染自然语言摘要', () => {
      const msg = makeMsg({
        content: jsonContent,
        summary: '一张猫的照片',
        canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
      });
      const { container } = render(<ChatMessage message={msg as any} renderMode="summary" />);
      expect(container.querySelector('.chat-msg-summary')?.textContent).toBe('一张猫的照片');
    });

    it('摘要缺失时回退到元素数量文案', () => {
      const msg = makeMsg({
        content: jsonContent,
        elementCount: 3,
        canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
      });
      const { container } = render(<ChatMessage message={msg as any} renderMode="summary" />);
      // mock 的 t() 不做插值，只回显 key；文案存在即说明走了兜底分支
      expect(container.querySelector('.chat-msg-summary')?.textContent).toBe('chat.summaryFallback');
    });

    it('渲染画布缩略图，点击可打开大图', () => {
      const msg = makeMsg({
        content: jsonContent,
        summary: '摘要',
        canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
      });
      const { container } = render(<ChatMessage message={msg as any} renderMode="summary" />);

      const thumb = container.querySelector('.chat-msg-thumbnail') as HTMLButtonElement;
      expect(thumb).toBeTruthy();
      expect(container.querySelector('.chat-msg-thumbnail img')).toBeTruthy();

      fireEvent.click(thumb);
      expect(document.querySelector('.image-lightbox-overlay')).not.toBeNull();
    });

    it('开发者工具关闭时不展示原始输出', () => {
      const msg = makeMsg({ content: jsonContent, summary: '摘要' });
      const { container } = render(<ChatMessage message={msg as any} renderMode="summary" />);
      expect(container.querySelector('.chat-raw-output-block')).toBeNull();
    });

    it('json 模式保持原有行为（回归保护）', () => {
      const msg = makeMsg({
        content: jsonContent,
        canvasSnapshotUrl: 'data:image/jpeg;base64,abc',
      });
      render(<ChatMessage message={msg as any} />);
      expect(screen.getByTestId('json-code-block')).toBeTruthy();
    });

    it('思考中的流式消息不提前解析，也不显示解析失败提示', () => {
      const outputCheck = vi.fn(() => ({ canApply: false, error: 'not json yet' }));
      const msg = makeMsg({
        content: '',
        thinking: 'Let me reason about the composition...',
      });
      const { container } = render(
        <ChatMessage
          message={msg as any}
          renderMode="summary"
          isStreaming
          outputCheck={outputCheck}
        />,
      );

      expect(container.querySelector('.chat-thinking-block')).not.toBeNull();
      expect(container.querySelector('.chat-msg-parse-hint')).toBeNull();
      expect(container.querySelector('.chat-parse-error-icon')).toBeNull();
      expect(outputCheck).not.toHaveBeenCalled();
    });

    it('传输错误消息不额外显示“无法转换成布局”的解析提示', () => {
      const msg = makeMsg({
        content: '[Stream Error: Request timed out after 120 seconds.]',
        thinking: 'Reasoning output was still arriving...',
      });
      const { container } = render(
        <ChatMessage
          message={msg as any}
          renderMode="summary"
          outputCheck={() => ({ canApply: false, error: 'not json' })}
        />,
      );

      expect(container.querySelector('.chat-msg-parse-hint')).toBeNull();
      expect(container.querySelector('.chat-msg-prose')?.textContent).toContain('Stream Error');
    });

    it('真正完成但输出非 JSON 时仍显示解析提示', () => {
      const msg = makeMsg({ content: 'I cannot produce that layout.' });
      const { container } = render(
        <ChatMessage
          message={msg as any}
          renderMode="summary"
          outputCheck={() => ({ canApply: false, error: 'not json' })}
        />,
      );

      expect(container.querySelector('.chat-msg-parse-hint')).not.toBeNull();
    });
  });
});
