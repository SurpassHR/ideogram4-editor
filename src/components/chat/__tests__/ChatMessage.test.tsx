import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    }),
}));

// Mock llm-canvas-chat (parsedOutput extraction)
vi.mock('../../../services/llm-canvas-chat', () => ({
  extractAndValidateIdeogramJSON: () => null, // default: no valid JSON
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
});
