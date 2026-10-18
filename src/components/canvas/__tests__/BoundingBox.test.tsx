import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import BoundingBox from '../BoundingBox';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';
import type { Box, InteractionMode } from '../../../types';

describe('BoundingBox', () => {
  const baseBox: Box = {
    id: 'box_0',
    x: 50,
    y: 60,
    w: 200,
    h: 80,
    mode: 'text',
    text: 'Hello World',
    desc: 'A test box',
    colors: [],
    imageDataUrl: null,
    imageRole: 'both',
  };

  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      editingBoxId: null,
      boxes: [baseBox],
      selectedBoxId: null,
      activeChatBoxId: null,
      isChatOpen: false,
    });
  });

  function renderBox(opts: {
    box?: Partial<Box>;
    isSelected?: boolean;
    index?: number;
    zoom?: number;
    interactionMode?: InteractionMode;
  } = {}) {
    const box: Box = { ...baseBox, ...opts.box };
    return render(
      <I18nProvider>
        <BoundingBox
          box={box}
          index={opts.index ?? 1}
          zoom={opts.zoom ?? 1}
          isSelected={opts.isSelected ?? true}
          boxRef={() => {}}
          interactionMode={opts.interactionMode ?? 'idle'}
        />
      </I18nProvider>,
    );
  }

  it('文字标签应显示 box.text', () => {
    renderBox();

    const label = document.querySelector('.bounding-box-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Hello World');
  });

  it('应在框上方渲染 tag 条，包含序号、类型与文字', () => {
    renderBox({ index: 3 });

    const tag = document.querySelector('.bounding-box-tag');
    expect(tag).not.toBeNull();
    expect(tag!.querySelector('.bounding-box-tag-index')!.textContent).toBe('3');
    expect(tag!.querySelector('.bounding-box-tag-mode')!.textContent).toBe('Text');
    expect(tag!.querySelector('.bounding-box-label')!.textContent).toBe('Hello World');
  });

  it('对象模式应使用对象类型名，并以 desc 作为标签文字', () => {
    renderBox({ box: { mode: 'obj', text: '', desc: 'A large red apple' } });

    const root = document.querySelector('.bounding-box')!;
    expect(root.classList.contains('mode-obj')).toBe(true);
    expect(document.querySelector('.bounding-box-tag-mode')!.textContent).toBe('Object');
    expect(document.querySelector('.bounding-box-label')!.textContent).toBe('A large red apple');
  });

  it('文字模式根节点应带 mode-text 类', () => {
    renderBox();

    expect(document.querySelector('.bounding-box')!.classList.contains('mode-text')).toBe(true);
  });

  it('文字与描述都为空时，tag 仍显示序号与类型', () => {
    renderBox({ index: 5, box: { text: '', desc: '' } });

    const tag = document.querySelector('.bounding-box-tag')!;
    expect(tag.querySelector('.bounding-box-tag-index')!.textContent).toBe('5');
    expect(tag.querySelector('.bounding-box-tag-mode')!.textContent).toBe('Text');
    expect(tag.querySelector('.bounding-box-label')!.textContent).toBe('');
  });

  it('框贴近画布顶部时，tag 应翻到框内', () => {
    renderBox({ box: { y: 10 }, zoom: 1 });

    expect(document.querySelector('.bounding-box-tag')!.classList.contains('inside')).toBe(true);
  });

  it('框不贴近画布顶部时，tag 应位于框上方', () => {
    renderBox({ box: { y: 60 }, zoom: 1 });

    expect(document.querySelector('.bounding-box-tag')!.classList.contains('inside')).toBe(false);
  });

  it('当 editingBoxId 匹配时，应显示可编辑内容', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    renderBox();

    const editable = document.querySelector('[contenteditable="true"]');
    expect(editable).not.toBeNull();
    expect(editable!.textContent).toBe('Hello World');
    // 编辑元素位于 tag 条内
    expect(editable!.closest('.bounding-box-tag')).not.toBeNull();
  });

  it('编辑模式按 Enter 应更新 box 并退出', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    renderBox();

    const editable = document.querySelector('[contenteditable="true"]')!;
    editable.textContent = 'Updated Text';
    fireEvent.keyDown(editable, { key: 'Enter' });

    const state = useEditorStore.getState();
    expect(state.boxes[0].text).toBe('Updated Text');
    expect(state.editingBoxId).toBeNull();
  });

  it('编辑模式按 Escape 应取消编辑并恢复原文本', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    renderBox();

    const editable = document.querySelector('[contenteditable="true"]')!;
    editable.textContent = 'Should Not Save';
    fireEvent.keyDown(editable, { key: 'Escape' });

    const state = useEditorStore.getState();
    expect(state.editingBoxId).toBeNull();
    expect(state.boxes[0].text).toBe('Hello World');
  });

  it('当 box 被选中且 interactionMode 为 idle 时，应显示 sparkle 按钮', () => {
    renderBox();

    expect(document.querySelector('.bounding-box-tag .chat-bubble-btn')).not.toBeNull();
  });

  it('当 interactionMode 不为 idle 时，应隐藏 sparkle 按钮', () => {
    renderBox({ interactionMode: 'dragging' });

    expect(document.querySelector('.chat-bubble-btn')).toBeNull();
  });

  it('当编辑模式时，sparkle 按钮应可见', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    renderBox();

    expect(document.querySelector('.chat-bubble-btn')).not.toBeNull();
    // 不再有 input wrapper
    expect(document.querySelector('.bounding-box-input-wrapper')).toBeNull();
  });

  describe('background image', () => {
    it('当 imageDataUrl 非空时，应渲染背景图像', () => {
      const { container } = renderBox({
        box: { imageDataUrl: 'data:image/png;base64,fake123' },
        isSelected: false,
      });

      const bgImg = container.querySelector('.bounding-box-bg-img') as HTMLImageElement;
      expect(bgImg).not.toBeNull();
      expect(bgImg!.src).toBe('data:image/png;base64,fake123');
    });

    it('当 imageDataUrl 为 null 时，不应渲染背景图像', () => {
      const { container } = renderBox({ isSelected: false });

      expect(container.querySelector('.bounding-box-bg-img')).toBeNull();
    });

    it('当 imageDataUrl 非空时，应渲染悬浮删除按钮（隐藏状态）', () => {
      const { container } = renderBox({
        box: { imageDataUrl: 'data:image/png;base64,fake123' },
        isSelected: false,
      });

      expect(container.querySelector('.bounding-box-img-dismiss')).not.toBeNull();
    });

    it('当 imageDataUrl 为 null 时，不应渲染悬浮删除按钮', () => {
      const { container } = renderBox({ isSelected: false });

      expect(container.querySelector('.bounding-box-img-dismiss')).toBeNull();
    });
  });
});
