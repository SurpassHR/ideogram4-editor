import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act, within } from '@testing-library/react';
import CanvasChatPanel from '../CanvasChatPanel';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';
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
async function renderWithPending() {
  useEditorStore.setState({
    chatModel: 'mock:gpt-4',
    pendingIdeogramOutput: null,
  });
  const result = render(<I18nProvider><CanvasChatPanel /></I18nProvider>);
  await act(() => new Promise(r => setTimeout(r, 50)));
  return result;
}

describe('CanvasChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('ideogram4-lang', 'en');
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
      chatStreamEnabled: true,
      chatThinkingLevel: 'medium',
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

    it('pendingIdeogramOutput 为 null 且消息不含 JSON 时不应显示 Apply pill', async () => {
      await renderWithPending();
      const applyPill = document.querySelector('.chat-msg-card-apply');
      expect(applyPill).toBeNull();
    });

    it('含 JSON 代码块的 assistant 卡应渲染 Apply pill', async () => {
      const message = {
        id: 'msg_with_json',
        role: 'assistant' as const,
        content: `\`\`\`json
{
  "high_level_description": "Test scene",
  "canvasW": 1024,
  "canvasH": 1024,
  "style_description": {
    "aesthetics": "Minimal",
    "lighting": "Soft",
    "medium": "digital art",
    "art_style": "flat design",
    "color_palette": []
  },
  "compositional_deconstruction": {
    "background": "White",
    "elements": [
      {
        "type": "obj",
        "bbox": [0, 0, 500, 500],
        "desc": "A red circle",
        "color_palette": []
      }
    ]
  }
}
\`\`\``,
        timestamp: 1000,
      };
      useEditorStore.setState({
        canvasChatMessages: [message],
        canvasChatSessions: [{
          id: 'session_1',
          title: '会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [message],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [],
        }],
      });

      const { getByRole } = await renderWithPending();

      const applyPill = getByRole('button', { name: 'Apply this composition to canvas' });
      expect(applyPill).not.toBeNull();
      expect(applyPill!.textContent).toContain('Apply');
      expect(applyPill!.className).toContain('chat-msg-card-apply');
      expect(applyPill!.closest('.chat-msg-card')?.className).toContain('has-apply');
    });

    it('点击 Apply pill 应调用 applyMessageOutput 并显示 toast', async () => {
      const message = {
        id: 'msg_apply_test',
        role: 'assistant' as const,
        content: `\`\`\`json
{
  "high_level_description": "Test scene",
  "style_description": {
    "aesthetics": "Minimal",
    "lighting": "Soft",
    "medium": "digital art",
    "art_style": "flat design",
    "color_palette": ["#FF0000"]
  },
  "compositional_deconstruction": {
    "background": "White",
    "elements": [
      {
        "type": "obj",
        "bbox": [0, 0, 500, 500],
        "desc": "A red circle",
        "color_palette": []
      }
    ]
  }
}
\`\`\``,
        timestamp: 1000,
      };
      useEditorStore.setState({
        canvasChatMessages: [message],
        canvasChatSessions: [{
          id: 'session_1',
          title: '会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [message],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [],
        }],
      });

      const { getByRole } = await renderWithPending();

      const applyPill = getByRole('button', { name: 'Apply this composition to canvas' });
      fireEvent.click(applyPill);

      const state = useEditorStore.getState();
      expect(state.boxes).toHaveLength(1);
      expect(state.highLevelDescription).toBe('Test scene');
      expect(state.globalPalette).toEqual(['#FF0000']);
      expect(state.pendingQualityReport).not.toBeNull();

      const toast = document.querySelector('.canvas-chat-toast');
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain('Applied 1 boxes');
    });

    it('工具条应显示 Stream 开关和 Think 四档滑块，并写入共享设置', async () => {
      const { getByLabelText } = await renderWithPending();

      const streamToggle = getByLabelText('Stream output') as HTMLInputElement;
      expect(streamToggle.checked).toBe(true);
      fireEvent.click(streamToggle);
      expect(useEditorStore.getState().chatStreamEnabled).toBe(false);

      const thinkingSlider = getByLabelText('Thinking strength') as HTMLInputElement;
      expect(thinkingSlider.value).toBe('2');
      fireEvent.change(thinkingSlider, { target: { value: '3' } });
      expect(useEditorStore.getState().chatThinkingLevel).toBe('high');
    });

    it('工具条应显示 Canvas Chat 目标尺寸滑块，并写入共享设置', async () => {
      const { getByLabelText } = await renderWithPending();

      expect(document.querySelector('.canvas-chat-size-marks')).toBeNull();

      const sizeSlider = getByLabelText('Canvas Chat target image size') as HTMLInputElement;
      expect(sizeSlider.value).toBe('1024');
      expect(sizeSlider.closest('.canvas-chat-target-size-control')?.textContent).toContain('Size: 1K');

      fireEvent.change(sizeSlider, { target: { value: '4096' } });

      expect((useEditorStore.getState() as any).canvasChatTargetSize).toBe(4096);
      expect(sizeSlider.value).toBe('4096');
    });

    it('点击 per-message Apply pill 应直接应用布局并生成布局质量诊断，不弹确认窗', async () => {
      const message = {
        id: 'msg_poor',
        role: 'assistant' as const,
        content: `\`\`\`json
{
  "high_level_description": "Tiny scene",
  "style_description": {
    "aesthetics": "Minimal",
    "lighting": "Soft",
    "medium": "digital art",
    "art_style": "flat design",
    "color_palette": ["#FF0000"]
  },
  "compositional_deconstruction": {
    "background": "White background",
    "elements": [
      {
        "type": "obj",
        "bbox": [10, 10, 30, 30],
        "desc": "A tiny red dot",
        "color_palette": []
      }
    ]
  }
}
\`\`\``,
        timestamp: 1000,
      };
      useEditorStore.setState({
        canvasChatMessages: [message],
        canvasChatSessions: [{
          id: 'session_1',
          title: '会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [message],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [],
        }],
      });

      await renderWithPending();
      const applyPill = document.querySelector('.chat-msg-card-apply')!;
      expect(applyPill).not.toBeNull();
      fireEvent.click(applyPill);

      const dialog = document.querySelector('.canvas-chat-confirm');
      expect(dialog).toBeNull();
      expect(useEditorStore.getState().boxes).toHaveLength(1);
      expect(useEditorStore.getState().pendingQualityReport).not.toBeNull();
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
      expect(document.querySelector('.canvas-chat-backdrop')).not.toBeNull();
      expect(document.querySelector('.canvas-chat-workbench')).not.toBeNull();
      expect(getByText('Sessions')).toBeInTheDocument();
      expect(getByText('Terminal')).toBeInTheDocument();
    });

    it('点击 Terminal 步骤应打开请求详情弹窗并展示完整调试分区', async () => {
      useEditorStore.setState({
        isCanvasChatOpen: true,
        isCanvasChatMaximized: true,
        activeCanvasChatRequestId: 'request_1',
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
            promptPreview: '生成海报',
            status: 'error',
            startedAt: 1000,
            endedAt: 1200,
            steps: [{
              id: 'step_1',
              at: 1100,
              kind: 'parse_failed',
              status: 'error',
              label: 'Parse Ideogram JSON failed',
              detail: 'bbox 错误',
            }],
            detail: {
              metadata: {
                providerId: 'mock',
                providerName: 'Mock',
                modelName: 'gpt-4',
                responseLang: 'auto',
                streamEnabled: true,
                thinkingLevel: 'medium',
                targetSize: 2048,
                canvasSize: { width: 1024, height: 1024 },
                boxCount: 1,
              },
              systemPrompt: 'SYSTEM PROMPT',
              messages: [{ role: 'user', content: '完整请求 payload' }],
              responseText: 'RAW RESPONSE',
              parsedJsonText: '{"bbox":[100,100]}',
              parseError: 'elements[0].bbox must be an array of 4 numbers.',
            },
          }],
        } as any],
      });

      const { getByRole, getByText } = await renderWithPending();

      fireEvent.click(getByText('Parse Ideogram JSON failed'));

      const dialog = getByRole('dialog', { name: 'Request details' });
      expect(within(dialog).getByText('Metadata')).toBeInTheDocument();
      expect(within(dialog).getByText('Request')).toBeInTheDocument();
      expect(within(dialog).getByText('Response')).toBeInTheDocument();
      expect(within(dialog).getByText('Parsed JSON')).toBeInTheDocument();
      expect(within(dialog).getByText('Error')).toBeInTheDocument();
      expect(within(dialog).getByText(/Mock · gpt-4/)).toBeInTheDocument();
      expect(within(dialog).getByText(/SYSTEM PROMPT/)).toBeInTheDocument();
      expect(within(dialog).getByText('RAW RESPONSE')).toBeInTheDocument();
      expect(within(dialog).getByText('elements[0].bbox must be an array of 4 numbers.')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.querySelector('.canvas-chat-request-detail-modal')).toBeNull();
    });

    it('最大化工作台滚轮事件不应冒泡到下层容器', async () => {
      useEditorStore.setState({
        isCanvasChatOpen: true,
        isCanvasChatMaximized: true,
      });
      const onWheel = vi.fn();

      render(
        <div onWheel={onWheel}>
          <I18nProvider><CanvasChatPanel /></I18nProvider>
        </div>,
      );
      await act(() => new Promise(r => setTimeout(r, 50)));

      const workbench = document.querySelector('.canvas-chat-workbench') as HTMLElement;
      fireEvent.wheel(workbench, { deltaY: 120 });

      expect(onWheel).not.toHaveBeenCalled();
    });

    it('active 会话项不应内联显示 input，右键后应显示图标操作菜单并通过 modal 重命名', async () => {
      const message = {
        id: 'msg_1',
        role: 'user' as const,
        content: '旧消息',
        timestamp: 1000,
      };
      useEditorStore.setState({
        isCanvasChatOpen: true,
        isCanvasChatMaximized: true,
        canvasChatMessages: [message],
        canvasChatSessions: [
          {
            id: 'session_1',
            title: '旧会话',
            createdAt: 1000,
            updatedAt: 1000,
            messages: [message],
            pendingIdeogramOutput: null,
            pendingQualityReport: null,
            requestLogs: [],
          },
          {
            id: 'session_2',
            title: '保留会话',
            createdAt: 1000,
            updatedAt: 1000,
            messages: [],
            pendingIdeogramOutput: null,
            pendingQualityReport: null,
            requestLogs: [],
          },
        ],
        activeCanvasChatSessionId: 'session_1',
      });

      const { getByText, getByLabelText, getByRole, queryByLabelText } = await renderWithPending();

      expect(queryByLabelText('Session title')).not.toBeInTheDocument();
      expect(queryByLabelText('Rename session')).not.toBeInTheDocument();
      expect(queryByLabelText('Clear session')).not.toBeInTheDocument();
      expect(queryByLabelText('Delete session')).not.toBeInTheDocument();

      const menuButton = getByRole('button', { name: 'Session actions for 旧会话' });
      expect(menuButton).toHaveClass('canvas-chat-session-menu-button');
      fireEvent.click(menuButton);
      expect(document.querySelector('.context-menu')).not.toBeNull();
      fireEvent.click(document.body);

      const activeItem = getByText('旧会话').closest('.canvas-chat-session-item') as HTMLElement;
      fireEvent.contextMenu(activeItem, { clientX: 120, clientY: 160 });

      const menu = document.querySelector('.context-menu');
      expect(menu).not.toBeNull();
      expect(document.querySelector('.canvas-chat-session-menu')).toBeNull();
      const renameButton = getByRole('button', { name: '✏ Rename' });
      const clearButton = getByRole('button', { name: '🧹 Clear' });
      const deleteButton = getByRole('button', { name: '🗑 Delete' });
      expect(renameButton).toHaveClass('context-menu-item');
      expect(clearButton).toHaveClass('context-menu-item');
      expect(deleteButton).toHaveClass('context-menu-item', 'danger');

      fireEvent.click(renameButton);
      expect(document.querySelector('.canvas-chat-rename-overlay')).not.toBeNull();
      const modalInput = getByLabelText('Session title');
      fireEvent.change(modalInput, {
        target: { value: '新版构图' },
      });
      fireEvent.click(getByRole('button', { name: 'Save session name' }));

      expect(useEditorStore.getState().canvasChatSessions[0].title).toBe('新版构图');

      const renamedItem = getByText('新版构图').closest('.canvas-chat-session-item') as HTMLElement;
      fireEvent.contextMenu(renamedItem, { clientX: 120, clientY: 160 });
      fireEvent.click(getByRole('button', { name: '🧹 Clear' }));
      expect(useEditorStore.getState().canvasChatMessages).toEqual([]);

      fireEvent.contextMenu(renamedItem, { clientX: 120, clientY: 160 });
      fireEvent.click(getByRole('button', { name: '🗑 Delete' }));
      const state = useEditorStore.getState();
      expect(state.canvasChatSessions.map(session => session.id)).toEqual(['session_2']);
      expect(state.activeCanvasChatSessionId).toBe('session_2');
    });

    it('最大化工作台的会话操作应支持中文 i18n', async () => {
      localStorage.setItem('ideogram4-lang', 'zh');
      useEditorStore.setState({
        isCanvasChatOpen: true,
        isCanvasChatMaximized: true,
      });

      const { getByRole, getByText } = await renderWithPending();

      const activeItem = getByText('新会话').closest('.canvas-chat-session-item') as HTMLElement;
      fireEvent.contextMenu(activeItem, { clientX: 120, clientY: 160 });
      expect(document.querySelector('.context-menu')).not.toBeNull();
      expect(getByRole('button', { name: '✏ 重命名' })).toBeInTheDocument();
      expect(getByRole('button', { name: '🧹 清空' })).toBeInTheDocument();
      expect(getByRole('button', { name: '🗑 删除' })).toBeInTheDocument();

      fireEvent.click(getByRole('button', { name: '✏ 重命名' }));
      expect(getByRole('dialog', { name: '重命名会话' })).toBeInTheDocument();
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

  // ─── Apply 一键应用（per-message card） ─────────────────────────

  describe('Apply — per-message card corner pill', () => {
    it('含 JSON 代码块的 assistant 卡点击 Apply pill 应写入全部 AI 输出并显示 toast', async () => {
      const message = {
        id: 'msg_full_apply',
        role: 'assistant' as const,
        content: `\`\`\`json
{
  "high_level_description": "Test scene",
  "style_description": {
    "aesthetics": "Minimal",
    "lighting": "Soft",
    "medium": "digital art",
    "art_style": "flat design",
    "color_palette": ["#FF0000", "#00FF00"]
  },
  "compositional_deconstruction": {
    "background": "White background",
    "elements": [
      {
        "type": "obj",
        "bbox": [0, 0, 500, 500],
        "desc": "A red circle",
        "color_palette": []
      },
      {
        "type": "text",
        "bbox": [600, 100, 700, 300],
        "desc": "Title text",
        "text": "Hello",
        "color_palette": []
      }
    ]
  }
}
\`\`\``,
        timestamp: 1000,
      };
      useEditorStore.setState({
        canvasChatMessages: [message],
        canvasChatSessions: [{
          id: 'session_1',
          title: '会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [message],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [],
        }],
      });

      await renderWithPending();

      const applyPill = document.querySelector('.chat-msg-card-apply')!;
      expect(applyPill).not.toBeNull();
      fireEvent.click(applyPill);

      const state = useEditorStore.getState();
      expect(document.querySelector('.canvas-chat-confirm')).toBeNull();
      expect(state.boxes).toHaveLength(2);
      expect(state.highLevelDescription).toBe('Test scene');
      expect(state.aesthetics).toBe('Minimal');
      expect(state.pendingQualityReport).not.toBeNull();

      const toast = document.querySelector('.canvas-chat-toast');
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain('Applied 2 boxes');
    });
  });
});
