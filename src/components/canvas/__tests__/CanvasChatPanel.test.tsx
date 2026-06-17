import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import CanvasChatPanel from '../CanvasChatPanel';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';
import type { IdeogramOutput } from '../../../types';

// Mock getLlmProviders 以确保 hasProviders 为 true
vi.mock('../../../components/llm/api', () => ({
  getLlmProviders: vi.fn().mockResolvedValue([
    {
      id: 'mock',
      name: 'Mock',
      kind: 'openai',
      api_key: 'sk-mock',
      base_url: 'https://api.openai.com/v1',
      models: ['gpt-4'],
    },
  ]),
}));

/** 渲染折叠态 CanvasChatPanel */
function renderFolded() {
  return render(<I18nProvider><CanvasChatPanel /></I18nProvider>);
}

/** 渲染展开态（设置 isCanvasChatOpen=true + chatModel），等待异步 providers 加载 */
async function renderExpanded(pendingOutput?: IdeogramOutput) {
  useEditorStore.setState({
    isCanvasChatOpen: true,
    chatModel: 'mock:gpt-4',
    pendingIdeogramOutput: pendingOutput ?? null,
  });
  const result = render(<I18nProvider><CanvasChatPanel /></I18nProvider>);
  // 让 useEffect 中的 getLlmProviders mock 完成
  await act(() => new Promise(r => setTimeout(r, 50)));
  return result;
}

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
        { type: 'obj' as const, bbox: [0, 0, 500, 500], desc: 'A red circle' },
        { type: 'text' as const, bbox: [600, 100, 700, 300], desc: 'Title text', text: 'Hello' },
      ],
    },
  };
}

describe('CanvasChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({
      isCanvasChatOpen: false,
      canvasChatMessages: [],
      pendingIdeogramOutput: null,
      chatModel: 'mock:gpt-4',
    });
  });

  // ─── 折叠态 ────────────────────────────────────────────────────

  it('折叠态应渲染触发条', () => {
    renderFolded();
    const toggle = document.querySelector('.canvas-chat-trigger');
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent).toContain('AI Compose');
  });

  it('点击触发条应展开面板', () => {
    renderFolded();
    const toggle = document.querySelector('.canvas-chat-trigger')!;
    fireEvent.click(toggle);
    expect(useEditorStore.getState().isCanvasChatOpen).toBe(true);
  });

  // ─── 展开态 ────────────────────────────────────────────────────

  describe('展开态', () => {
    it('展开后应显示面板', async () => {
      await renderExpanded();
      const panel = document.querySelector('.canvas-chat-panel');
      expect(panel).not.toBeNull();
    });

    it('展开后应显示 header 标题', async () => {
      await renderExpanded();
      const header = document.querySelector('.canvas-chat-header-title');
      expect(header).not.toBeNull();
      expect(header!.textContent).toContain('Canvas AI Compose');
    });

    it('pendingIdeogramOutput 为 null 时不应显示 Apply 按钮', async () => {
      await renderExpanded(null);
      const applyBtn = document.querySelector('.canvas-chat-apply-btn');
      expect(applyBtn).toBeNull();
    });

    it('pendingIdeogramOutput 非 null 时应显示 Apply 按钮', async () => {
      await renderExpanded(makePendingOutput());
      const applyBtn = document.querySelector('.canvas-chat-apply-btn');
      expect(applyBtn).not.toBeNull();
      expect(applyBtn!.textContent).toContain('Apply');
    });

    it('点击 Apply 按钮应弹出确认弹窗', async () => {
      await renderExpanded(makePendingOutput());
      const applyBtn = document.querySelector('.canvas-chat-apply-btn')!;
      fireEvent.click(applyBtn);
      const dialog = document.querySelector('.canvas-chat-confirm');
      expect(dialog).not.toBeNull();
      expect(dialog!.textContent).toContain('Apply Composition');
    });

    it('点击折叠按钮应将面板折叠', async () => {
      await renderExpanded();
      const closeBtn = document.querySelector('.chat-close-btn')!;
      fireEvent.click(closeBtn);
      expect(useEditorStore.getState().isCanvasChatOpen).toBe(false);
    });
  });

  // ─── Apply 确认弹窗 ─────────────────────────────────────────

  describe('Apply 确认弹窗', () => {
    async function openConfirmDialog() {
      await renderExpanded(makePendingOutput());
      const applyBtn = document.querySelector('.canvas-chat-apply-btn')!;
      fireEvent.click(applyBtn);
    }

    it('弹窗应显示元素数量 2', async () => {
      await openConfirmDialog();
      const dialog = document.querySelector('.canvas-chat-confirm')!;
      expect(dialog.textContent).toContain('2 个边界框');
    });

    it('默认应全选所有选项', async () => {
      await openConfirmDialog();
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        '.canvas-chat-confirm-item input[type="checkbox"]',
      );
      expect(checkboxes.length).toBe(5);
      checkboxes.forEach(cb => expect(cb.checked).toBe(true));
    });

    it('应可以取消勾选选项', async () => {
      await openConfirmDialog();
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        '.canvas-chat-confirm-item input[type="checkbox"]',
      );
      fireEvent.click(checkboxes[3]);
      expect(checkboxes[3].checked).toBe(false);
      expect(checkboxes[0].checked).toBe(true);
      expect(checkboxes[1].checked).toBe(true);
      expect(checkboxes[2].checked).toBe(true);
      expect(checkboxes[4].checked).toBe(true);
    });

    it('点击 Cancel 应关闭弹窗', async () => {
      await openConfirmDialog();
      const cancelBtn = document.querySelector('.canvas-chat-confirm-actions .btn')!;
      fireEvent.click(cancelBtn);
      // dialog removed after click
      expect(document.querySelector('.canvas-chat-confirm')).toBeNull();
    });

    it('点击 Apply Selected 应关闭弹窗（并显示 toast）', async () => {
      await openConfirmDialog();
      const confirmBtn = document.querySelector(
        '.canvas-chat-confirm-actions .canvas-chat-apply-btn',
      )!;
      fireEvent.click(confirmBtn);
      // dialog removed
      expect(document.querySelector('.canvas-chat-confirm')).toBeNull();
      // toast should appear
      const toast = document.querySelector('.canvas-chat-toast');
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain('Applied');
    });

    it('点击弹窗遮罩层应关闭弹窗', async () => {
      await openConfirmDialog();
      const overlay = document.querySelector('.modal-overlay')!;
      fireEvent.click(overlay);
      expect(document.querySelector('.canvas-chat-confirm')).toBeNull();
    });
  });
});
