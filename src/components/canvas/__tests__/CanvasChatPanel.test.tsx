import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasChatPanel from '../CanvasChatPanel';
import type { ApplySelections } from '../CanvasChatPanel';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';
import type { ChatMessage } from '../../../types/chat';
import type { IdeogramOutput } from '../../../types';

/** 用 I18nProvider 包裹渲染，所有组件测试需要 i18n context */
function renderWithProvider(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

/** 辅助：创建一条测试用的用户消息 */
function makeUserMessage(content: string, id = 'msg_1'): ChatMessage {
  return { id, role: 'user', content, timestamp: Date.now() };
}

/** 辅助：创建一条测试用的 AI 消息 */
function makeAssistantMessage(content: string, id = 'msg_2'): ChatMessage {
  return { id, role: 'assistant', content, timestamp: Date.now() };
}

/** 辅助：创建用于测试的 pendingIdeogramOutput */
function makePendingOutput(): IdeogramOutput {
  return {
    high_level_description: 'Test scene',
    style_description: {
      aesthetics: 'Minimal',
      lighting: 'Soft',
      medium: 'digital art',
      art_style: 'flat design',
      color_palette: ['#FF0000', '#00FF00'],
    },
    compositional_deconstruction: {
      background: 'White background',
      elements: [
        { type: 'obj', bbox: [0, 0, 500, 500], desc: 'A red circle' },
        { type: 'text', bbox: [600, 100, 700, 300], desc: 'Title text', text: 'Hello' },
      ],
    },
  };
}

describe('CanvasChatPanel', () => {
  const defaultProps = {
    onSend: vi.fn(),
    onApply: vi.fn(),
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({
      isCanvasChatOpen: false,
      canvasChatMessages: [],
      pendingIdeogramOutput: null,
    });
  });

  // ─── 折叠态 ────────────────────────────────────────────────────

  it('折叠态应渲染触发条', () => {
    renderWithProvider(<CanvasChatPanel {...defaultProps} />);
    const toggle = screen.getByTestId('canvas-chat-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('AI Compose');
  });

  it('点击触发条应展开面板', () => {
    renderWithProvider(<CanvasChatPanel {...defaultProps} />);
    const toggle = screen.getByTestId('canvas-chat-toggle');
    fireEvent.click(toggle);
    const state = useEditorStore.getState();
    expect(state.isCanvasChatOpen).toBe(true);
  });

  // ─── 展开态 ────────────────────────────────────────────────────

  describe('展开态', () => {
    beforeEach(() => {
      useEditorStore.setState({ isCanvasChatOpen: true });
    });

    it('展开后应显示消息列表区域', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} />);
      const expanded = screen.getByTestId('canvas-chat-expanded');
      expect(expanded).not.toBeNull();
    });

    it('无消息且非加载中时应显示空提示', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} />);
      const hint = document.querySelector('.canvas-chat-empty-hint');
      expect(hint).not.toBeNull();
    });

    it('加载中状态应显示 loading 文本', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} isLoading={true} />);
      const loading = document.querySelector('.chat-loading');
      expect(loading).not.toBeNull();
      expect(loading!.textContent).toContain('thinking');
    });

    it('错误状态应显示错误信息', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} error="API Error" />);
      const errEl = document.querySelector('.chat-error');
      expect(errEl).not.toBeNull();
      expect(errEl!.textContent).toContain('API Error');
    });

    // ─── 消息列表 ──────────────────────────────────────────────

    it('应渲染用户消息和 AI 消息', () => {
      const messages: ChatMessage[] = [
        makeUserMessage('Design a garden scene'),
        makeAssistantMessage('Here is a composition for your garden scene.'),
      ];
      useEditorStore.setState({ canvasChatMessages: messages });

      renderWithProvider(<CanvasChatPanel {...defaultProps} />);

      // ChatMessage 组件渲染每条消息
      const msgCards = document.querySelectorAll('.chat-msg-card');
      expect(msgCards.length).toBe(2);
    });

    // ─── Apply 按钮 ─────────────────────────────────────────────

    it('pendingIdeogramOutput 为 null 时不应显示 Apply 按钮', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} />);
      const applyBtn = screen.queryByTestId('canvas-chat-apply-btn');
      expect(applyBtn).toBeNull();
    });

    it('pendingIdeogramOutput 非 null 时应显示 Apply 按钮', () => {
      useEditorStore.setState({ pendingIdeogramOutput: makePendingOutput() });
      renderWithProvider(<CanvasChatPanel {...defaultProps} />);
      const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
      expect(applyBtn).not.toBeNull();
      expect(applyBtn.textContent).toContain('Apply');
    });

    it('点击 Apply 按钮应弹出确认弹窗', () => {
      useEditorStore.setState({ pendingIdeogramOutput: makePendingOutput() });
      renderWithProvider(<CanvasChatPanel {...defaultProps} />);
      const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
      fireEvent.click(applyBtn);

      const dialog = document.querySelector('.canvas-chat-apply-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog!.textContent).toContain('Apply Composition');
    });

    // ─── Apply 确认弹窗 ───────────────────────────────────────

    describe('Apply 确认弹窗', () => {
      beforeEach(() => {
        useEditorStore.setState({ pendingIdeogramOutput: makePendingOutput() });
      });

      it('弹窗应显示元素数量和调色板数量', () => {
        renderWithProvider(<CanvasChatPanel {...defaultProps} />);
        const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
        fireEvent.click(applyBtn);

        const dialog = document.querySelector('.canvas-chat-apply-dialog')!;
        expect(dialog.textContent).toContain('2 elements');
        expect(dialog.textContent).toContain('2 colors');
      });

      it('默认应全选所有选项', () => {
        renderWithProvider(<CanvasChatPanel {...defaultProps} />);
        const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
        fireEvent.click(applyBtn);

        const checkboxes = document.querySelectorAll<HTMLInputElement>('.canvas-chat-apply-item input[type="checkbox"]');
        expect(checkboxes.length).toBe(4);
        checkboxes.forEach(cb => expect(cb.checked).toBe(true));
      });

      it('应可以取消勾选选项', () => {
        renderWithProvider(<CanvasChatPanel {...defaultProps} />);
        const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
        fireEvent.click(applyBtn);

        const checkboxes = document.querySelectorAll<HTMLInputElement>('.canvas-chat-apply-item input[type="checkbox"]');
        // 取消勾选 Global Palette
        fireEvent.click(checkboxes[3]);
        expect(checkboxes[3].checked).toBe(false);
        // 其他应仍为勾选
        expect(checkboxes[0].checked).toBe(true);
        expect(checkboxes[1].checked).toBe(true);
        expect(checkboxes[2].checked).toBe(true);
      });

      it('点击 Cancel 应关闭弹窗且不调用 onApply', () => {
        const onApply = vi.fn();
        renderWithProvider(<CanvasChatPanel {...defaultProps} onApply={onApply} />);
        const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
        fireEvent.click(applyBtn);

        const cancelBtn = document.querySelector('.canvas-chat-apply-cancel-btn')!;
        fireEvent.click(cancelBtn);

        expect(onApply).not.toHaveBeenCalled();
        // 弹窗应消失
        expect(document.querySelector('.canvas-chat-apply-dialog')).toBeNull();
      });

      it('点击 Apply Selected 应调用 onApply 并传入选择状态', () => {
        const onApply = vi.fn();
        renderWithProvider(<CanvasChatPanel {...defaultProps} onApply={onApply} />);
        const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
        fireEvent.click(applyBtn);

        // 先取消勾选 boxes
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.canvas-chat-apply-item input[type="checkbox"]');
        fireEvent.click(checkboxes[0]);

        const confirmBtn = document.querySelector('.canvas-chat-apply-confirm-btn')!;
        fireEvent.click(confirmBtn);

        expect(onApply).toHaveBeenCalledTimes(1);
        const selections: ApplySelections = onApply.mock.calls[0][0];
        expect(selections.boxes).toBe(false);
        expect(selections.globalDesc).toBe(true);
        expect(selections.styleParams).toBe(true);
        expect(selections.globalPalette).toBe(true);
      });

      it('点击弹窗遮罩层应关闭弹窗', () => {
        renderWithProvider(<CanvasChatPanel {...defaultProps} />);
        const applyBtn = screen.getByTestId('canvas-chat-apply-btn');
        fireEvent.click(applyBtn);

        const overlay = document.querySelector('.canvas-chat-overlay')!;
        fireEvent.click(overlay);

        // 弹窗应消失
        expect(document.querySelector('.canvas-chat-apply-dialog')).toBeNull();
      });
    });

    // ─── 手动折叠 ──────────────────────────────────────────────

    it('点击折叠按钮应将面板折叠', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} />);
      const collapseBtn = screen.getByTestId('canvas-chat-collapse-btn');
      fireEvent.click(collapseBtn);
      const state = useEditorStore.getState();
      expect(state.isCanvasChatOpen).toBe(false);
    });

    // ─── 发送消息 ──────────────────────────────────────────────

    it('在 textarea 按 Enter 应调用 onSend', () => {
      const onSend = vi.fn();
      renderWithProvider(<CanvasChatPanel {...defaultProps} onSend={onSend} />);

      const textarea = document.querySelector('.canvas-chat-input')!;
      fireEvent.change(textarea, { target: { value: 'A beautiful sunset' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith('A beautiful sunset');
    });

    it('Shift+Enter 不应触发发送', () => {
      const onSend = vi.fn();
      renderWithProvider(<CanvasChatPanel {...defaultProps} onSend={onSend} />);

      const textarea = document.querySelector('.canvas-chat-input')!;
      fireEvent.change(textarea, { target: { value: 'Multi\nline' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('空文本不应触发发送', () => {
      const onSend = vi.fn();
      renderWithProvider(<CanvasChatPanel {...defaultProps} onSend={onSend} />);

      const textarea = document.querySelector('.canvas-chat-input')!;
      fireEvent.change(textarea, { target: { value: '   ' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('加载中状态下输入框应禁用', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} isLoading={true} />);
      const textarea = document.querySelector('.canvas-chat-input') as HTMLTextAreaElement;
      expect(textarea.disabled).toBe(true);
    });

    it('加载中状态下发送按钮应禁用', () => {
      renderWithProvider(<CanvasChatPanel {...defaultProps} isLoading={true} />);
      const sendBtn = screen.getByTestId('canvas-chat-send-btn') as HTMLButtonElement;
      expect(sendBtn.disabled).toBe(true);
    });
  });
});
