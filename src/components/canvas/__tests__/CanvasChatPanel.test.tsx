import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act, within } from '@testing-library/react';
import CanvasChatPanel from '../CanvasChatPanel';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';
import type { IdeogramOutput } from '../../../types';
import { getLlmProviders } from '../../../components/llm/api';

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

/** 渲染 CanvasChatPanel */
function renderPanel() {
  return render(<I18nProvider><CanvasChatPanel /></I18nProvider>);
}

/** 渲染展开态（设置 chatModel），等待异步 providers 加载 */
async function renderWithPending(pendingOutput?: IdeogramOutput | null) {
  useEditorStore.setState({
    chatModel: 'mock:gpt-4',
    pendingIdeogramOutput: pendingOutput ?? null,
  });
  const result = render(<I18nProvider><CanvasChatPanel /></I18nProvider>);
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
      isCanvasChatMaximized: false,
      canvasChatMessages: [],
      canvasChatSessions: [{
        id: 'session_1',
        title: '新会话',
        createdAt: 1000,
        updatedAt: 1000,
        messages: [],
        pendingIdeogramOutput: null,
        pendingQualityReport: null,
        requestLogs: [],
      }],
      activeCanvasChatSessionId: 'session_1',
      activeCanvasChatRequestId: null,
      pendingIdeogramOutput: null,
      pendingQualityReport: null,
      chatModel: 'mock:gpt-4',
    });
    window.location.hash = '#/';
  });

  // ─── 底部横杠 ────────────────────────────────────────────────────

  it('应渲染底部横杠 handle', () => {
    renderPanel();
    const handle = document.querySelector('.canvas-chat-handle');
    expect(handle).not.toBeNull();
  });

  it('应渲染面板容器（始终渲染，hover 控制显示）', () => {
    renderPanel();
    const wrapper = document.querySelector('.canvas-chat-handle-wrapper');
    expect(wrapper).not.toBeNull();
    const panel = wrapper!.querySelector('.canvas-chat-panel');
    expect(panel).not.toBeNull();
  });

  // ─── 面板内容 ────────────────────────────────────────────────────

  describe('面板内容', () => {
    it('应显示 header 标题', async () => {
      await renderWithPending();
      const header = document.querySelector('.canvas-chat-header-title');
      expect(header).not.toBeNull();
      expect(header!.textContent).toContain('Canvas AI Compose');
    });

    it('pendingIdeogramOutput 为 null 时不应显示 Apply 按钮', async () => {
      await renderWithPending(null);
      const applyBtn = document.querySelector('.canvas-chat-apply-btn');
      expect(applyBtn).toBeNull();
    });

    it('pendingIdeogramOutput 非 null 时应显示 Apply 按钮', async () => {
      await renderWithPending(makePendingOutput());
      const applyBtn = document.querySelector('.canvas-chat-apply-btn');
      expect(applyBtn).not.toBeNull();
      expect(applyBtn!.textContent).toContain('Apply');
    });

    it('点击 Apply 按钮应弹出确认弹窗', async () => {
      await renderWithPending(makePendingOutput());
      const applyBtn = document.querySelector('.canvas-chat-apply-btn')!;
      fireEvent.click(applyBtn);
      const dialog = document.querySelector('.canvas-chat-confirm');
      expect(dialog).not.toBeNull();
      expect(dialog!.textContent).toContain('Apply Composition');
    });

    it('无 LLM provider 时应显示添加提供商按钮并跳转到设置页', async () => {
      vi.mocked(getLlmProviders).mockResolvedValueOnce([]);

      const { getByRole, getByText } = await renderWithPending();

      expect(getByText('No LLM provider configured yet')).toBeInTheDocument();

      const addButton = getByRole('button', { name: '+ Add' });
      expect(addButton).toBeInTheDocument();

      fireEvent.click(addButton);

      expect(window.location.hash).toBe('#/settings');
    });

    it('点击最大化按钮应显示三栏工作台', async () => {
      const { getByRole, getByText } = await renderWithPending();

      const maximizeButton = getByRole('button', { name: 'Maximize Canvas Chat' });
      fireEvent.click(maximizeButton);

      expect(useEditorStore.getState().isCanvasChatMaximized).toBe(true);
      expect(document.querySelector('.canvas-chat-workbench')).not.toBeNull();
      expect(getByText('Sessions')).toBeInTheDocument();
      expect(getByText('Terminal')).toBeInTheDocument();
    });

    it('最大化终端应显示当前会话的请求日志步骤', async () => {
      useEditorStore.setState({
        isCanvasChatOpen: true,
        isCanvasChatMaximized: true,
        canvasChatSessions: [{
          id: 'session_1',
          title: '调试会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [{
            id: 'request_1',
            sessionId: 'session_1',
            promptPreview: '生成咖啡海报',
            status: 'error',
            startedAt: 1000,
            endedAt: 2000,
            steps: [{
              id: 'step_1',
              at: 1500,
              kind: 'parse_failed',
              status: 'error',
              label: 'Parse Ideogram JSON failed',
              detail: 'No json code block',
            }],
          }],
        }],
        activeCanvasChatSessionId: 'session_1',
        activeCanvasChatRequestId: 'request_1',
      });

      const { getByText } = await renderWithPending();

      expect(getByText('生成咖啡海报')).toBeInTheDocument();
      expect(getByText('Parse Ideogram JSON failed')).toBeInTheDocument();
      expect(getByText('No json code block')).toBeInTheDocument();
    });

    it('最大化工作台应保留输入框和发送按钮', async () => {
      useEditorStore.setState({
        isCanvasChatOpen: true,
        isCanvasChatMaximized: true,
      });

      await renderWithPending();

      const workbench = document.querySelector('.canvas-chat-workbench') as HTMLElement;
      expect(workbench).not.toBeNull();
      expect(within(workbench).getByPlaceholderText('Describe the scene you want to compose...')).toBeInTheDocument();
      expect(within(workbench).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    });
  });

  // ─── Apply 确认弹窗 ─────────────────────────────────────────

  describe('Apply 确认弹窗', () => {
    async function openConfirmDialog() {
      await renderWithPending(makePendingOutput());
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
