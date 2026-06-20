import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '../index';
import { PRESETS_STORAGE_KEY } from '../../types/presets';
import type { ChatMessage } from '../../types/chat';
import type { Box, IdeogramOutput } from '../../types';

const makeBox = (id: string, x: number, y: number): Box => ({
  id,
  x,
  y,
  w: 100,
  h: 80,
  mode: 'obj',
  text: '',
  desc: id,
  colors: [],
  imageDataUrl: null,
  imageRole: 'both',
});

const makeCanvasSession = (
  id: string,
  title = '新会话',
  messages: ChatMessage[] = [],
) => ({
  id,
  title,
  createdAt: 1000,
  updatedAt: 1000,
  messages,
  pendingIdeogramOutput: null,
  pendingQualityReport: null,
  requestLogs: [],
});

describe('EditorStore', () => {
  beforeEach(() => {
    // 重置 store 到初始状态
    useEditorStore.setState({
      activeChatBoxId: null,
      isChatOpen: false,
      selectedBoxId: null,
      selectedBoxIds: [],
      boxes: [],
      boxCounter: 0,
    });
  });

  describe('openChat', () => {
    it('应设置 activeChatBoxId 和 isChatOpen', () => {
      const { openChat } = useEditorStore.getState();
      openChat('box_0');
      const state = useEditorStore.getState();
      expect(state.activeChatBoxId).toBe('box_0');
      expect(state.isChatOpen).toBe(true);
    });
  });

  describe('selectBox', () => {
    it('selectBox 应同步 selectedBoxIds 和兼容 selectedBoxId', () => {
      const { selectBox } = useEditorStore.getState();
      selectBox('box_1');
      expect(useEditorStore.getState().selectedBoxIds).toEqual(['box_1']);
      expect(useEditorStore.getState().selectedBoxId).toBe('box_1');

      selectBox(null);
      expect(useEditorStore.getState().selectedBoxIds).toEqual([]);
      expect(useEditorStore.getState().selectedBoxId).toBeNull();
    });

    it('当选中新 box 时，如果已有 chat 在另一个 box 上打开，应关闭 chat', () => {
      const { openChat, selectBox } = useEditorStore.getState();
      openChat('box_0');
      selectBox('box_1');
      const state = useEditorStore.getState();
      expect(state.selectedBoxId).toBe('box_1');
      expect(state.activeChatBoxId).toBeNull();
      expect(state.isChatOpen).toBe(false);
    });

    it('选中同一 box 不会关闭 chat', () => {
      const { openChat, selectBox } = useEditorStore.getState();
      openChat('box_0');
      selectBox('box_0');
      const state = useEditorStore.getState();
      expect(state.selectedBoxId).toBe('box_0');
      expect(state.activeChatBoxId).toBe('box_0');
      expect(state.isChatOpen).toBe(true);
    });
  });

  describe('multi-select actions', () => {
    beforeEach(() => {
      useEditorStore.setState({
        boxes: [
          makeBox('box_0', 0, 0),
          makeBox('box_1', 120, 0),
          makeBox('box_2', 240, 0),
        ],
        selectedBoxId: null,
        selectedBoxIds: [],
        boxCounter: 3,
        activeChatBoxId: null,
        isChatOpen: false,
        editingBoxId: null,
        chatHistories: {
          box_0: [{ id: 'm0', role: 'user', content: 'a', timestamp: 1 }],
          box_1: [{ id: 'm1', role: 'assistant', content: 'b', timestamp: 2 }],
        },
      });
    });

    it('selectBoxes 应去重并在多选时将 selectedBoxId 设为 null', () => {
      const { selectBoxes } = useEditorStore.getState();
      selectBoxes(['box_0', 'box_1', 'box_0']);

      const state = useEditorStore.getState();
      expect(state.selectedBoxIds).toEqual(['box_0', 'box_1']);
      expect(state.selectedBoxId).toBeNull();
    });

    it('toggleBoxSelection 应追加或移除单个 box，并维护 selectedBoxId', () => {
      const { toggleBoxSelection } = useEditorStore.getState();

      toggleBoxSelection('box_0');
      expect(useEditorStore.getState().selectedBoxIds).toEqual(['box_0']);
      expect(useEditorStore.getState().selectedBoxId).toBe('box_0');

      toggleBoxSelection('box_1');
      expect(useEditorStore.getState().selectedBoxIds).toEqual(['box_0', 'box_1']);
      expect(useEditorStore.getState().selectedBoxId).toBeNull();

      toggleBoxSelection('box_0');
      expect(useEditorStore.getState().selectedBoxIds).toEqual(['box_1']);
      expect(useEditorStore.getState().selectedBoxId).toBe('box_1');
    });

    it('removeBox 批量删除时应清理选择、chat、active chat 和编辑状态', () => {
      useEditorStore.setState({
        selectedBoxIds: ['box_0', 'box_1'],
        selectedBoxId: null,
        activeChatBoxId: 'box_1',
        isChatOpen: true,
        editingBoxId: 'box_0',
      });

      useEditorStore.getState().removeBox(['box_0', 'box_1']);

      const state = useEditorStore.getState();
      expect(state.boxes.map(b => b.id)).toEqual(['box_2']);
      expect(state.selectedBoxIds).toEqual([]);
      expect(state.selectedBoxId).toBeNull();
      expect(state.activeChatBoxId).toBeNull();
      expect(state.isChatOpen).toBe(false);
      expect(state.editingBoxId).toBeNull();
      expect(state.chatHistories.box_0).toBeUndefined();
      expect(state.chatHistories.box_1).toBeUndefined();
    });

    it('duplicateBox 批量复制时应保持相对顺序并选中新副本集合', () => {
      useEditorStore.getState().duplicateBox(['box_0', 'box_2']);

      const state = useEditorStore.getState();
      expect(state.boxes.map(b => b.id)).toEqual(['box_0', 'box_1', 'box_2', 'box_3', 'box_4']);
      expect(state.boxes[3]).toMatchObject({ id: 'box_3', x: 20, y: 20 });
      expect(state.boxes[4]).toMatchObject({ id: 'box_4', x: 260, y: 20 });
      expect(state.selectedBoxIds).toEqual(['box_3', 'box_4']);
      expect(state.selectedBoxId).toBeNull();
      expect(state.boxCounter).toBe(5);
    });

    it('copyBox/cutBox/pasteBox 应支持多个 box 的内部剪贴板', () => {
      const store = useEditorStore.getState();
      store.copyBox(['box_0', 'box_1']);
      store.pasteBox();

      let state = useEditorStore.getState();
      expect(state.boxes.map(b => b.id)).toEqual(['box_0', 'box_1', 'box_2', 'box_3', 'box_4']);
      expect(state.boxes[3]).toMatchObject({ id: 'box_3', x: 20, y: 20 });
      expect(state.boxes[4]).toMatchObject({ id: 'box_4', x: 140, y: 20 });
      expect(state.selectedBoxIds).toEqual(['box_3', 'box_4']);

      useEditorStore.getState().cutBox(['box_0', 'box_1']);
      state = useEditorStore.getState();
      expect(state.boxes.map(b => b.id)).toEqual(['box_2', 'box_3', 'box_4']);
      expect(state.selectedBoxIds).toEqual(['box_3', 'box_4']);

      useEditorStore.getState().pasteBox(300, 200);
      state = useEditorStore.getState();
      expect(state.boxes.slice(-2)).toMatchObject([
        { id: 'box_5', x: 300, y: 200 },
        { id: 'box_6', x: 420, y: 200 },
      ]);
      expect(state.selectedBoxIds).toEqual(['box_5', 'box_6']);
    });

    it('bringToFront/sendToBack 批量操作时应保持选中集合内部相对顺序', () => {
      const store = useEditorStore.getState();

      store.bringToFront(['box_0', 'box_2']);
      expect(useEditorStore.getState().boxes.map(b => b.id)).toEqual(['box_1', 'box_0', 'box_2']);

      store.sendToBack(['box_2', 'box_0']);
      expect(useEditorStore.getState().boxes.map(b => b.id)).toEqual(['box_0', 'box_2', 'box_1']);
    });
  });

  describe('editingBoxId', () => {
    it('初始状态 editingBoxId 应为 null', () => {
      const state = useEditorStore.getState();
      expect(state.editingBoxId).toBeNull();
    });

    it('setEditingBoxId 应设置 editingBoxId', () => {
      const { setEditingBoxId } = useEditorStore.getState();
      setEditingBoxId('box_0');
      const state = useEditorStore.getState();
      expect(state.editingBoxId).toBe('box_0');
    });

    it('setEditingBoxId(null) 应清除 editingBoxId', () => {
      const { setEditingBoxId } = useEditorStore.getState();
      setEditingBoxId('box_0');
      setEditingBoxId(null);
      const state = useEditorStore.getState();
      expect(state.editingBoxId).toBeNull();
    });
  });

  describe('chat run settings', () => {
    beforeEach(() => {
      localStorage.removeItem('ideogram4-chat-stream-enabled');
      localStorage.removeItem('ideogram4-chat-thinking-level');
      useEditorStore.setState({
        chatStreamEnabled: true,
        chatThinkingLevel: 'medium',
      } as Partial<ReturnType<typeof useEditorStore.getState>>);
    });

    it('默认应开启流式并使用 medium 思考强度', () => {
      const state = useEditorStore.getState();
      expect(state.chatStreamEnabled).toBe(true);
      expect(state.chatThinkingLevel).toBe('medium');
    });

    it('setChatStreamEnabled 应更新状态并持久化', () => {
      useEditorStore.getState().setChatStreamEnabled(false);

      expect(useEditorStore.getState().chatStreamEnabled).toBe(false);
      expect(localStorage.getItem('ideogram4-chat-stream-enabled')).toBe('false');

      useEditorStore.getState().setChatStreamEnabled(true);
      expect(useEditorStore.getState().chatStreamEnabled).toBe(true);
      expect(localStorage.getItem('ideogram4-chat-stream-enabled')).toBe('true');
    });

    it('setChatThinkingLevel 应更新四档思考强度并持久化', () => {
      useEditorStore.getState().setChatThinkingLevel('high');

      expect(useEditorStore.getState().chatThinkingLevel).toBe('high');
      expect(localStorage.getItem('ideogram4-chat-thinking-level')).toBe('high');
    });
  });

  describe('importImageToBox', () => {
    it('应设置 box 的 imageDataUrl', () => {
      useEditorStore.setState({
        boxes: [{ id: 'box_0', x: 0, y: 0, w: 100, h: 100, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' }],
      });
      const { importImageToBox } = useEditorStore.getState();
      importImageToBox('box_0', 'data:image/png;base64,abc123');
      const state = useEditorStore.getState();
      expect(state.boxes[0].imageDataUrl).toBe('data:image/png;base64,abc123');
    });

    it('对不存在的 box id 应不做任何事', () => {
      useEditorStore.setState({
        boxes: [{ id: 'box_0', x: 0, y: 0, w: 100, h: 100, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' }],
      });
      const { importImageToBox } = useEditorStore.getState();
      importImageToBox('nonexistent', 'data:image/png;base64,abc123');
      const state = useEditorStore.getState();
      expect(state.boxes[0].imageDataUrl).toBeNull();
    });
  });

  describe('clearBoxImage', () => {
    it('应将 box 的 imageDataUrl 设为 null', () => {
      useEditorStore.setState({
        boxes: [{ id: 'box_0', x: 0, y: 0, w: 100, h: 100, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: 'data:image/png;base64,abc123', imageRole: 'both' }],
      });
      const { clearBoxImage } = useEditorStore.getState();
      clearBoxImage('box_0');
      const state = useEditorStore.getState();
      expect(state.boxes[0].imageDataUrl).toBeNull();
    });
  });

  describe('chatPresets CRUD', () => {
    beforeEach(() => {
      localStorage.removeItem(PRESETS_STORAGE_KEY);
      useEditorStore.setState({ chatPresets: [] });
    });

    it('addPreset 应创建带 id 和时间戳的预设', () => {
      const { addPreset } = useEditorStore.getState();
      addPreset({
        name: '测试预设',
        description: '测试描述',
        promptTemplate: '模板内容 {box_text}',
        tags: ['测试', '标签'],
      });
      const state = useEditorStore.getState();
      expect(state.chatPresets).toHaveLength(1);
      const preset = state.chatPresets[0];
      expect(preset.id).toMatch(/^preset_\d+$/);
      expect(preset.name).toBe('测试预设');
      expect(preset.tags).toEqual(['测试', '标签']);
      expect(preset.createdAt).toBeGreaterThan(0);
      expect(preset.updatedAt).toBeGreaterThan(0);
    });

    it('updatePreset 应更新预设字段和 updatedAt', async () => {
      const { addPreset, updatePreset } = useEditorStore.getState();
      addPreset({
        name: '原始名称',
        description: '原始描述',
        promptTemplate: '原始模板',
        tags: ['原始'],
      });
      const state = useEditorStore.getState();
      const presetId = state.chatPresets[0].id;
      const oldUpdatedAt = state.chatPresets[0].updatedAt;

      // 等待 1ms 确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 1));

      updatePreset(presetId, { name: '新名称', description: '新描述' });
      const newState = useEditorStore.getState();
      expect(newState.chatPresets[0].name).toBe('新名称');
      expect(newState.chatPresets[0].description).toBe('新描述');
      expect(newState.chatPresets[0].promptTemplate).toBe('原始模板'); // 未更新的字段保持不变
      expect(newState.chatPresets[0].updatedAt).toBeGreaterThan(oldUpdatedAt);
    });

    it('deletePreset 应删除预设', () => {
      const { addPreset, deletePreset } = useEditorStore.getState();
      addPreset({
        name: '待删除',
        description: '',
        promptTemplate: '',
        tags: [],
      });
      const state = useEditorStore.getState();
      const presetId = state.chatPresets[0].id;
      expect(state.chatPresets).toHaveLength(1);

      deletePreset(presetId);
      const newState = useEditorStore.getState();
      expect(newState.chatPresets).toHaveLength(0);
    });

    it('预设应持久化到 localStorage', () => {
      const { addPreset } = useEditorStore.getState();
      addPreset({
        name: '持久化测试',
        description: '',
        promptTemplate: '模板',
        tags: [],
      });

      const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('持久化测试');
    });
  });

  // ─── Canvas Chat Actions ──────────────────────────────────────

  describe('Canvas Chat actions', () => {
    beforeEach(() => {
      useEditorStore.setState({
        isCanvasChatOpen: false,
        canvasChatMessages: [],
        pendingIdeogramOutput: null,
        pendingQualityReport: null,
        canvasChatSessions: [makeCanvasSession('session_1')],
        activeCanvasChatSessionId: 'session_1',
        activeCanvasChatRequestId: null,
        isCanvasChatMaximized: false,
      } as Partial<ReturnType<typeof useEditorStore.getState>>);
    });

    describe('Canvas Chat sessions', () => {
      it('初始状态应自动拥有一个默认会话', () => {
        const state = useEditorStore.getState() as unknown as {
          canvasChatSessions?: Array<{ id: string; title: string; messages: ChatMessage[] }>;
          activeCanvasChatSessionId?: string;
        };

        expect(state.canvasChatSessions).toHaveLength(1);
        expect(state.activeCanvasChatSessionId).toBe(state.canvasChatSessions?.[0].id);
        expect(state.canvasChatSessions?.[0].title).toBe('新会话');
        expect(state.canvasChatSessions?.[0].messages).toEqual([]);
      });

      it('createCanvasChatSession 应创建并选中新会话', () => {
        const store = useEditorStore.getState() as unknown as {
          createCanvasChatSession?: (title?: string) => string;
          canvasChatSessions: Array<{ id: string; title: string; messages: ChatMessage[] }>;
          activeCanvasChatSessionId: string;
          canvasChatMessages: ChatMessage[];
        };

        expect(typeof store.createCanvasChatSession).toBe('function');
        const newId = store.createCanvasChatSession?.('海报构图') ?? '';

        const state = useEditorStore.getState() as unknown as typeof store;
        expect(state.canvasChatSessions).toHaveLength(2);
        expect(state.activeCanvasChatSessionId).toBe(newId);
        expect(state.canvasChatSessions[1]).toMatchObject({
          id: newId,
          title: '海报构图',
          messages: [],
        });
        expect(state.canvasChatMessages).toEqual([]);
      });

      it('renameCanvasChatSession 应更新会话标题并忽略空标题', () => {
        const store = useEditorStore.getState() as unknown as {
          renameCanvasChatSession?: (sessionId: string, title: string) => void;
        };
        expect(typeof store.renameCanvasChatSession).toBe('function');

        store.renameCanvasChatSession?.('session_1', '  构图方案 A  ');
        expect(useEditorStore.getState().canvasChatSessions[0].title).toBe('构图方案 A');

        store.renameCanvasChatSession?.('session_1', '   ');
        expect(useEditorStore.getState().canvasChatSessions[0].title).toBe('构图方案 A');
      });

      it('deleteCanvasChatSession 应删除目标会话并切换到邻近会话', () => {
        const firstMessage: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: '第一段需求',
          timestamp: 1000,
        };
        const secondMessage: ChatMessage = {
          id: 'msg_2',
          role: 'assistant',
          content: '第二个会话的回复',
          timestamp: 2000,
        };
        useEditorStore.setState({
          canvasChatSessions: [
            makeCanvasSession('session_1', '第一会话', [firstMessage]),
            makeCanvasSession('session_2', '第二会话', [secondMessage]),
          ],
          activeCanvasChatSessionId: 'session_2',
          canvasChatMessages: [secondMessage],
        } as Partial<ReturnType<typeof useEditorStore.getState>>);

        const store = useEditorStore.getState() as unknown as {
          deleteCanvasChatSession?: (sessionId: string) => void;
        };
        expect(typeof store.deleteCanvasChatSession).toBe('function');

        store.deleteCanvasChatSession?.('session_2');

        const state = useEditorStore.getState();
        expect(state.canvasChatSessions.map(session => session.id)).toEqual(['session_1']);
        expect(state.activeCanvasChatSessionId).toBe('session_1');
        expect(state.canvasChatMessages).toEqual([firstMessage]);
      });

      it('deleteCanvasChatSession 删除最后一个会话时应保留新的空会话', () => {
        const store = useEditorStore.getState() as unknown as {
          deleteCanvasChatSession?: (sessionId: string) => void;
        };

        store.deleteCanvasChatSession?.('session_1');

        const state = useEditorStore.getState();
        expect(state.canvasChatSessions).toHaveLength(1);
        expect(state.activeCanvasChatSessionId).toBe(state.canvasChatSessions[0].id);
        expect(state.canvasChatSessions[0].messages).toEqual([]);
        expect(state.canvasChatMessages).toEqual([]);
      });

      it('clearCanvasChatSession 应清空指定会话并在清空当前会话时同步当前消息', () => {
        const firstMessage: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: '第一段需求',
          timestamp: 1000,
        };
        const secondMessage: ChatMessage = {
          id: 'msg_2',
          role: 'assistant',
          content: '第二个会话的回复',
          timestamp: 2000,
        };
        useEditorStore.setState({
          canvasChatSessions: [
            makeCanvasSession('session_1', '第一会话', [firstMessage]),
            makeCanvasSession('session_2', '第二会话', [secondMessage]),
          ],
          activeCanvasChatSessionId: 'session_1',
          canvasChatMessages: [firstMessage],
        } as Partial<ReturnType<typeof useEditorStore.getState>>);

        const store = useEditorStore.getState() as unknown as {
          clearCanvasChatSession?: (sessionId: string) => void;
        };
        expect(typeof store.clearCanvasChatSession).toBe('function');

        store.clearCanvasChatSession?.('session_2');
        let state = useEditorStore.getState();
        expect(state.canvasChatSessions[1].messages).toEqual([]);
        expect(state.canvasChatMessages).toEqual([firstMessage]);

        store.clearCanvasChatSession?.('session_1');
        state = useEditorStore.getState();
        expect(state.canvasChatSessions[0].messages).toEqual([]);
        expect(state.canvasChatMessages).toEqual([]);
      });

      it('selectCanvasChatSession 应切换当前消息到目标会话', () => {
        const firstMessage: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: '第一段需求',
          timestamp: 1000,
        };
        const secondMessage: ChatMessage = {
          id: 'msg_2',
          role: 'assistant',
          content: '第二个会话的回复',
          timestamp: 2000,
        };
        useEditorStore.setState({
          canvasChatSessions: [
            makeCanvasSession('session_1', '第一会话', [firstMessage]),
            makeCanvasSession('session_2', '第二会话', [secondMessage]),
          ],
          activeCanvasChatSessionId: 'session_1',
          canvasChatMessages: [firstMessage],
        } as Partial<ReturnType<typeof useEditorStore.getState>>);

        const store = useEditorStore.getState() as unknown as {
          selectCanvasChatSession?: (sessionId: string) => void;
        };
        expect(typeof store.selectCanvasChatSession).toBe('function');

        store.selectCanvasChatSession?.('session_2');

        const state = useEditorStore.getState() as unknown as {
          activeCanvasChatSessionId: string;
          canvasChatMessages: ChatMessage[];
        };
        expect(state.activeCanvasChatSessionId).toBe('session_2');
        expect(state.canvasChatMessages).toEqual([secondMessage]);
      });

      it('addCanvasChatMessage 应写入当前会话并用首条用户消息更新标题', () => {
        const { addCanvasChatMessage } = useEditorStore.getState();
        const msg: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: '为咖啡品牌设计一张竖版海报',
          timestamp: 1000,
        };

        addCanvasChatMessage(msg);

        const state = useEditorStore.getState() as unknown as {
          canvasChatSessions: Array<{ id: string; title: string; messages: ChatMessage[] }>;
          canvasChatMessages: ChatMessage[];
        };
        expect(state.canvasChatMessages).toEqual([msg]);
        expect(state.canvasChatSessions[0].messages).toEqual([msg]);
        expect(state.canvasChatSessions[0].title).toBe('为咖啡品牌设计一张竖版海报');
      });

      it('updateCanvasChatMessage 应同步更新当前会话中的消息', () => {
        const msg: ChatMessage = {
          id: 'msg_stream',
          role: 'assistant',
          content: '',
          timestamp: 1000,
        };
        useEditorStore.setState({
          canvasChatMessages: [msg],
          canvasChatSessions: [makeCanvasSession('session_1', '流式会话', [msg])],
          activeCanvasChatSessionId: 'session_1',
        } as Partial<ReturnType<typeof useEditorStore.getState>>);

        useEditorStore.getState().updateCanvasChatMessage('msg_stream', {
          content: 'streamed text',
          thinking: 'reasoning text',
        });

        const state = useEditorStore.getState() as unknown as {
          canvasChatSessions: Array<{ messages: ChatMessage[] }>;
          canvasChatMessages: ChatMessage[];
        };
        expect(state.canvasChatMessages[0]).toMatchObject({
          content: 'streamed text',
          thinking: 'reasoning text',
        });
        expect(state.canvasChatSessions[0].messages[0]).toMatchObject({
          content: 'streamed text',
          thinking: 'reasoning text',
        });
      });

      it('pending output 和质量报告应归属当前会话', () => {
        const output: IdeogramOutput = {
          high_level_description: 'Test scene',
          style_description: { aesthetics: '', lighting: '', color_palette: [] },
          compositional_deconstruction: { background: '', elements: [] },
        };
        const report = {
          overallPass: false,
          metrics: [],
          summaryText: 'layout feedback',
          userSummary: '布局需要调整',
        };

        useEditorStore.getState().setPendingIdeogramOutput(output);
        useEditorStore.getState().setPendingQualityReport(report);

        const state = useEditorStore.getState() as unknown as {
          pendingIdeogramOutput: IdeogramOutput | null;
          pendingQualityReport: typeof report | null;
          canvasChatSessions: Array<{
            pendingIdeogramOutput: IdeogramOutput | null;
            pendingQualityReport: typeof report | null;
          }>;
        };
        expect(state.pendingIdeogramOutput).toBe(output);
        expect(state.pendingQualityReport).toBe(report);
        expect(state.canvasChatSessions[0].pendingIdeogramOutput).toBe(output);
        expect(state.canvasChatSessions[0].pendingQualityReport).toBe(report);
      });

      it('clearCanvasChat 应只清空当前会话并保留其他画布状态', () => {
        const msg: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: 1000,
        };
        useEditorStore.setState({
          boxes: [makeBox('box_keep', 0, 0)],
          canvasChatMessages: [msg],
          pendingIdeogramOutput: {
            high_level_description: 'Test',
            style_description: { aesthetics: '', lighting: '', color_palette: [] },
            compositional_deconstruction: { background: '', elements: [] },
          },
          canvasChatSessions: [makeCanvasSession('session_1', '有内容', [msg])],
          activeCanvasChatSessionId: 'session_1',
        } as Partial<ReturnType<typeof useEditorStore.getState>>);

        useEditorStore.getState().clearCanvasChat();

        const state = useEditorStore.getState() as unknown as {
          boxes: Box[];
          canvasChatMessages: ChatMessage[];
          pendingIdeogramOutput: IdeogramOutput | null;
          canvasChatSessions: Array<{ messages: ChatMessage[]; pendingIdeogramOutput: IdeogramOutput | null }>;
        };
        expect(state.boxes).toHaveLength(1);
        expect(state.canvasChatMessages).toEqual([]);
        expect(state.pendingIdeogramOutput).toBeNull();
        expect(state.canvasChatSessions[0].messages).toEqual([]);
        expect(state.canvasChatSessions[0].pendingIdeogramOutput).toBeNull();
      });

      it('request log actions 应在当前会话记录请求步骤和最终状态', () => {
        const store = useEditorStore.getState() as unknown as {
          startCanvasChatRequest?: (promptPreview: string) => string;
          appendCanvasChatRequestStep?: (
            requestId: string,
            step: {
              kind: 'build_context';
              status: 'success';
              label: string;
              detail?: string;
            },
          ) => void;
          finishCanvasChatRequest?: (requestId: string, status: 'success' | 'error', detail?: string) => void;
        };

        expect(typeof store.startCanvasChatRequest).toBe('function');
        expect(typeof store.appendCanvasChatRequestStep).toBe('function');
        expect(typeof store.finishCanvasChatRequest).toBe('function');

        const requestId = store.startCanvasChatRequest?.('生成海报') ?? '';
        store.appendCanvasChatRequestStep?.(requestId, {
          kind: 'build_context',
          status: 'success',
          label: 'Build canvas context',
          detail: '1 box',
        });
        store.finishCanvasChatRequest?.(requestId, 'success');

        const state = useEditorStore.getState() as unknown as {
          activeCanvasChatRequestId: string | null;
          canvasChatSessions: Array<{
            requestLogs: Array<{
              id: string;
              promptPreview: string;
              status: string;
              endedAt?: number;
              steps: Array<{ kind: string; status: string; label: string; detail?: string }>;
            }>;
          }>;
        };
        expect(state.activeCanvasChatRequestId).toBe(requestId);
        expect(state.canvasChatSessions[0].requestLogs).toHaveLength(1);
        expect(state.canvasChatSessions[0].requestLogs[0]).toMatchObject({
          id: requestId,
          promptPreview: '生成海报',
          status: 'success',
        });
        expect(state.canvasChatSessions[0].requestLogs[0].endedAt).toBeGreaterThan(0);
        expect(state.canvasChatSessions[0].requestLogs[0].steps[0]).toMatchObject({
          kind: 'build_context',
          status: 'success',
          label: 'Build canvas context',
          detail: '1 box',
        });
      });

      it('setCanvasChatMaximized 应切换最大化状态', () => {
        const store = useEditorStore.getState() as unknown as {
          setCanvasChatMaximized?: (maximized: boolean) => void;
        };
        expect(typeof store.setCanvasChatMaximized).toBe('function');

        store.setCanvasChatMaximized?.(true);
        expect(useEditorStore.getState().isCanvasChatMaximized).toBe(true);

        store.setCanvasChatMaximized?.(false);
        expect(useEditorStore.getState().isCanvasChatMaximized).toBe(false);
      });
    });

    describe('setCanvasChatOpen', () => {
      it('应设置 isCanvasChatOpen 为 true', () => {
        const { setCanvasChatOpen } = useEditorStore.getState();
        setCanvasChatOpen(true);
        expect(useEditorStore.getState().isCanvasChatOpen).toBe(true);
      });

      it('应设置 isCanvasChatOpen 为 false', () => {
        useEditorStore.setState({ isCanvasChatOpen: true });
        const { setCanvasChatOpen } = useEditorStore.getState();
        setCanvasChatOpen(false);
        expect(useEditorStore.getState().isCanvasChatOpen).toBe(false);
      });
    });

    describe('addCanvasChatMessage', () => {
      it('应将消息追加到 canvasChatMessages', () => {
        const { addCanvasChatMessage } = useEditorStore.getState();
        const msg: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: 'Design a garden scene',
          timestamp: 1000,
        };
        addCanvasChatMessage(msg);

        const state = useEditorStore.getState();
        expect(state.canvasChatMessages).toHaveLength(1);
        expect(state.canvasChatMessages[0]).toEqual(msg);
      });

      it('应支持追加多条消息', () => {
        const { addCanvasChatMessage } = useEditorStore.getState();
        const msg1: ChatMessage = {
          id: 'msg_1',
          role: 'user',
          content: 'First',
          timestamp: 1000,
        };
        const msg2: ChatMessage = {
          id: 'msg_2',
          role: 'assistant',
          content: 'Response',
          timestamp: 1001,
        };
        addCanvasChatMessage(msg1);
        addCanvasChatMessage(msg2);

        const state = useEditorStore.getState();
        expect(state.canvasChatMessages).toHaveLength(2);
        expect(state.canvasChatMessages[0].content).toBe('First');
        expect(state.canvasChatMessages[1].content).toBe('Response');
      });
    });

    describe('setPendingIdeogramOutput', () => {
      it('应设置 pendingIdeogramOutput', () => {
        const { setPendingIdeogramOutput } = useEditorStore.getState();
        const output: IdeogramOutput = {
          high_level_description: 'Test scene',
          style_description: {
            aesthetics: 'Minimal',
            lighting: 'Soft',
            medium: 'digital art',
            art_style: 'flat',
            color_palette: ['#FF0000'],
          },
          compositional_deconstruction: {
            background: 'White',
            elements: [
              { type: 'obj', bbox: [0, 0, 500, 500], desc: 'A red box' },
            ],
          },
        };
        setPendingIdeogramOutput(output);

        const state = useEditorStore.getState();
        expect(state.pendingIdeogramOutput).not.toBeNull();
        expect(state.pendingIdeogramOutput!.high_level_description).toBe('Test scene');
      });

      it('应能将 pendingIdeogramOutput 设为 null', () => {
        const { setPendingIdeogramOutput } = useEditorStore.getState();
        const output: IdeogramOutput = {
          high_level_description: 'Test scene',
          style_description: {
            aesthetics: 'Minimal',
            lighting: 'Soft',
            color_palette: [],
          },
          compositional_deconstruction: {
            background: 'White',
            elements: [],
          },
        };
        setPendingIdeogramOutput(output);
        setPendingIdeogramOutput(null);

        expect(useEditorStore.getState().pendingIdeogramOutput).toBeNull();
      });
    });

    describe('clearCanvasChat', () => {
      it('应清空 canvasChatMessages 和 pendingIdeogramOutput', () => {
        const { addCanvasChatMessage, setPendingIdeogramOutput, clearCanvasChat } =
          useEditorStore.getState();

        addCanvasChatMessage({ id: 'msg_1', role: 'user', content: 'Hello', timestamp: 1000 });
        setPendingIdeogramOutput({
          high_level_description: 'Test',
          style_description: { aesthetics: '', lighting: '', color_palette: [] },
          compositional_deconstruction: { background: '', elements: [] },
        });
        clearCanvasChat();

        const state = useEditorStore.getState();
        expect(state.canvasChatMessages).toHaveLength(0);
        expect(state.pendingIdeogramOutput).toBeNull();
      });

      it('初始状态下 clearCanvasChat 应为 no-op', () => {
        const { clearCanvasChat } = useEditorStore.getState();
        clearCanvasChat();

        const state = useEditorStore.getState();
        expect(state.canvasChatMessages).toHaveLength(0);
        expect(state.pendingIdeogramOutput).toBeNull();
      });

      it('不应影响其他 store 字段', () => {
        const { addCanvasChatMessage, setPendingIdeogramOutput, clearCanvasChat } =
          useEditorStore.getState();

        addCanvasChatMessage({ id: 'msg_1', role: 'user', content: 'Hello', timestamp: 1000 });
        setPendingIdeogramOutput({
          high_level_description: 'Test',
          style_description: { aesthetics: '', lighting: '', color_palette: [] },
          compositional_deconstruction: { background: '', elements: [] },
        });

        // 设置一些其他字段
        useEditorStore.setState({ boxes: [{ id: 'box_0', x: 0, y: 0, w: 100, h: 100, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' }] });

        clearCanvasChat();

        const state = useEditorStore.getState();
        expect(state.canvasChatMessages).toHaveLength(0);
        expect(state.pendingIdeogramOutput).toBeNull();
        expect(state.boxes).toHaveLength(1); // boxes 不受影响
      });
    });

    describe('updateCanvasChatMessage', () => {
      it('应按 id 更新消息的指定字段', () => {
        const { addCanvasChatMessage, updateCanvasChatMessage } =
          useEditorStore.getState();

        addCanvasChatMessage({
          id: 'msg_1', role: 'assistant', content: '', timestamp: 1000,
        });

        updateCanvasChatMessage('msg_1', { content: 'Hello', thinking: 'Let me think...' });

        const state = useEditorStore.getState();
        expect(state.canvasChatMessages[0].content).toBe('Hello');
        expect(state.canvasChatMessages[0].thinking).toBe('Let me think...');
      });

      it('不存在的 id 不应影响其他消息', () => {
        const { addCanvasChatMessage, updateCanvasChatMessage } =
          useEditorStore.getState();

        addCanvasChatMessage({
          id: 'msg_1', role: 'user', content: 'Hi', timestamp: 1000,
        });
        updateCanvasChatMessage('nonexistent', { content: 'Should not appear' });

        expect(useEditorStore.getState().canvasChatMessages[0].content).toBe('Hi');
      });
    });
  });

  describe('canvasScale / canvasCustom', () => {
    it('初始值应为默认值', () => {
      const state = useEditorStore.getState();
      expect(state.canvasScale).toBe(4);
      expect(state.canvasCustomW).toBe(16);
      expect(state.canvasCustomH).toBe(9);
    });

    it('setCanvasScale 应更新 canvasScale 和 canvasW/canvasH', () => {
      useEditorStore.getState().setCanvasScale(2);
      const state = useEditorStore.getState();
      expect(state.canvasScale).toBe(2);
      // 1:1 ratio + scale 2 → 512×512
      expect(state.canvasW).toBe(512);
      expect(state.canvasH).toBe(512);
    });

    it('setCanvasCustom 应更新 custom 值和 canvasW/canvasH', () => {
      useEditorStore.getState().setCanvasCustom(3, 4);
      const state = useEditorStore.getState();
      expect(state.canvasCustomW).toBe(3);
      expect(state.canvasCustomH).toBe(4);
      expect(state.canvasW).toBeGreaterThan(0);
      expect(state.canvasH).toBeGreaterThan(0);
    });

    it('setCanvasRatio 在 scale/custom 改变后仍正确计算尺寸', () => {
      const store = useEditorStore;
      store.getState().setCanvasScale(2);
      store.getState().setCanvasRatio('16:9');
      const state = store.getState();
      expect(state.canvasRatio).toBe('16:9');
      // 16:9 baseW=256, baseH=144, scale=2 → 512×288
      expect(state.canvasW).toBe(512);
      expect(state.canvasH).toBe(288);
    });
  });
});
