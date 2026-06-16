import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../index';

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
});