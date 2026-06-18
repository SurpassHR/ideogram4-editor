import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '../index';
import { PRESETS_STORAGE_KEY } from '../../types/presets';
import type { ChatMessage } from '../../types/chat';
import type { IdeogramOutput } from '../../types';

describe('EditorStore', () => {
  beforeEach(() => {
    // 重置 store 到初始状态
    useEditorStore.setState({
      activeChatBoxId: null,
      isChatOpen: false,
      selectedBoxId: null,
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