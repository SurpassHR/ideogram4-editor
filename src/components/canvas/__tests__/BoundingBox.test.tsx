import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BoundingBox from '../BoundingBox';
import { useEditorStore } from '../../../store';

describe('BoundingBox', () => {
  const baseBox = {
    id: 'box_0',
    x: 50,
    y: 60,
    w: 200,
    h: 80,
    mode: 'text' as const,
    text: 'Hello World',
    desc: 'A test box',
    colors: [],
  };

  beforeEach(() => {
    useEditorStore.setState({
      editingBoxId: null,
      boxes: [baseBox],
      selectedBoxId: null,
      activeChatBoxId: null,
      isChatOpen: false,
    });
  });

  it('当 box 被选中时，应显示文字标签', () => {
    const boxRef = () => {};
    render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="idle"
      />
    );

    // 文字标签应显示 box.text
    const label = document.querySelector('.bounding-box-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Hello World');
  });

  it('当 editingBoxId 匹配时，应显示编辑 input', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    const boxRef = () => {};
    render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="idle"
      />
    );

    // 应显示 input 而不是文字标签
    const input = document.querySelector('.bounding-box-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input!.value).toBe('Hello World');
  });

  it('编辑 input 按 Enter 应更新 box 并退出编辑模式', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    const boxRef = () => {};
    const { rerender } = render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="idle"
      />
    );

    const input = document.querySelector('.bounding-box-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Updated Text' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // 验证 box 文本被更新
    const state = useEditorStore.getState();
    expect(state.boxes[0].text).toBe('Updated Text');
    // 验证退出编辑模式
    expect(state.editingBoxId).toBeNull();
  });

  it('编辑 input 按 Escape 应取消编辑并恢复原文本', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    const boxRef = () => {};
    render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="idle"
      />
    );

    const input = document.querySelector('.bounding-box-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Should Not Save' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // 验证退出编辑模式
    const state = useEditorStore.getState();
    expect(state.editingBoxId).toBeNull();
    // 验证文本未被更新
    expect(state.boxes[0].text).toBe('Hello World');
  });

  it('当 box 被选中且 interactionMode 为 idle 时，应显示 sparkle 按钮', () => {
    const boxRef = () => {};
    render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="idle"
      />
    );

    const btn = document.querySelector('.chat-bubble-btn');
    expect(btn).not.toBeNull();
  });

  it('当 interactionMode 不为 idle 时，应隐藏 sparkle 按钮', () => {
    const boxRef = () => {};
    render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="dragging"
      />
    );

    const btn = document.querySelector('.chat-bubble-btn');
    expect(btn).toBeNull();
  });

  it('当编辑模式时，sparkle 按钮应在 input 内部', () => {
    useEditorStore.setState({ editingBoxId: 'box_0' });

    const boxRef = () => {};
    render(
      <BoundingBox
        box={baseBox}
        isSelected={true}
        boxRef={boxRef}
        interactionMode="idle"
      />
    );

    // sparkle 按钮应在 input wrapper 内部
    const wrapper = document.querySelector('.bounding-box-input-wrapper');
    expect(wrapper).not.toBeNull();
    const btn = wrapper!.querySelector('.chat-bubble-btn');
    expect(btn).not.toBeNull();
  });
});