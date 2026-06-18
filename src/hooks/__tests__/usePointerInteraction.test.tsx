import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useEditorStore } from '../../store';
import { usePointerInteraction } from '../usePointerInteraction';

/**
 * 测试辅助组件：渲染一个 canvas 容器和一个 bounding box 子元素，
 * 使用 usePointerInteraction hook 处理交互。
 */
function TestCanvasWithBox({ zoom = 1, panX = 0, panY = 0 }: { zoom?: number; panX?: number; panY?: number }) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const screenToCanvas = (sx: number, sy: number) => ({
    x: sx,
    y: sy,
  });

  const { registerBoxRef, handleCanvasPointerDown, handleCanvasPointerMove } =
    usePointerInteraction({ canvasRef, zoom, panX, panY, screenToCanvas });

  return (
    <div
      ref={canvasRef}
      id="canvas-wrapper"
      style={{ width: 500, height: 500, position: 'relative' }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
    >
      <div id="canvas-inner" style={{ position: 'absolute', inset: 0 }}>
        <div
          id="box_test"
          ref={registerBoxRef('box_test')}
          className="bounding-box"
          style={{ left: 50, top: 50, width: 100, height: 80 }}
        />
      </div>
    </div>
  );
}

describe('usePointerInteraction - click vs drag', () => {
  beforeEach(() => {
    useEditorStore.setState({
      boxes: [
        { id: 'box_test', x: 50, y: 50, w: 100, h: 80, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' },
      ],
      selectedBoxId: null,
      activeChatBoxId: null,
      isChatOpen: false,
      boxCounter: 1,
    });
  });

  it('单击 box（无位移）应选中 box 但不打开 Chat', () => {
    render(<TestCanvasWithBox />);

    const box = document.getElementById('box_test')!;
    expect(box).not.toBeNull();

    // 模拟 pointerdown 在 bounding box 上
    fireEvent.pointerDown(box, { clientX: 100, clientY: 90, button: 0 });

    // 模拟 pointerup 在 window 上（无位移）
    fireEvent.pointerUp(window, { clientX: 100, clientY: 90 });

    // 验证：box 被选中，但 chat 未打开
    const state = useEditorStore.getState();
    expect(state.selectedBoxId).toBe('box_test');
    expect(state.activeChatBoxId).toBeNull();
    expect(state.isChatOpen).toBe(false);
  });

  it('拖拽 bounding box（有位移）应更新位置，不打开 Chat', () => {
    render(<TestCanvasWithBox />);

    const box = document.getElementById('box_test')!;

    // 模拟 pointerdown
    fireEvent.pointerDown(box, { clientX: 100, clientY: 90, button: 0 });

    // 模拟 pointermove（有位移）
    fireEvent.pointerMove(window, { clientX: 150, clientY: 140 });

    // 模拟 pointerup
    fireEvent.pointerUp(window, { clientX: 150, clientY: 140 });

    // 验证：位置被更新，但 chat 未打开
    const state = useEditorStore.getState();
    expect(state.boxes[0].x).not.toBe(50);
    expect(state.activeChatBoxId).toBeNull();
    expect(state.isChatOpen).toBe(false);
  });

  it('双击同一 bounding box（300ms 内两次点击）应进入文字编辑模式', () => {
    render(<TestCanvasWithBox />);

    const box = document.getElementById('box_test')!;

    // 第一次点击
    fireEvent.pointerDown(box, { clientX: 100, clientY: 90, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 90 });

    // 第二次点击（同一 box）
    fireEvent.pointerDown(box, { clientX: 100, clientY: 90, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 90 });

    // 验证：进入编辑模式
    const state = useEditorStore.getState();
    expect(state.editingBoxId).toBe('box_test');
  });

  it('Alt+pointerdown 在已有 box 上应创建新 box 而非选中已有 box', () => {
    render(<TestCanvasWithBox />);

    const box = document.getElementById('box_test')!;

    // 按住 Alt 在已有 box 区域内按下（坐标 100,90 命中 box_test 内部）
    fireEvent.pointerDown(box, { clientX: 100, clientY: 90, button: 0, altKey: true });

    // drawing 模式的移动由 canvas 上的 onPointerMove 处理，拖出 100x100 区域
    const canvas = document.getElementById('canvas-wrapper')!;
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 190 });

    // 松开鼠标，触发 addBox（绘制区域 >= 10x10）
    fireEvent.pointerUp(window, { clientX: 200, clientY: 190 });

    const state = useEditorStore.getState();
    // 新 box 已创建并位于数组末尾（最上层），总数为 2
    expect(state.boxes).toHaveLength(2);
    // 原 box_test 位置未变（未被选中/拖动）
    expect(state.boxes[0]).toMatchObject({ id: 'box_test', x: 50, y: 50 });
    // 新 box 被选中（addBox 设置 selectedBoxId），原 box_test 未被选中
    expect(state.boxes[1].id).toBe('box_1');
    expect(state.selectedBoxId).toBe('box_1');
    expect(state.boxes[1]).toMatchObject({ x: 100, y: 90, w: 100, h: 100 });
  });

  it('Alt+pointerdown 后未拖动（< 10px）不应创建 box', () => {
    render(<TestCanvasWithBox />);

    const box = document.getElementById('box_test')!;

    fireEvent.pointerDown(box, { clientX: 100, clientY: 90, button: 0, altKey: true });
    // 微小移动，绘制区域不足 10x10
    const canvas = document.getElementById('canvas-wrapper')!;
    fireEvent.pointerMove(canvas, { clientX: 103, clientY: 92 });
    fireEvent.pointerUp(window, { clientX: 103, clientY: 92 });

    const state = useEditorStore.getState();
    // 未达到最小尺寸阈值，不创建 box，原 box_test 也未被改动
    expect(state.boxes).toHaveLength(1);
    expect(state.selectedBoxId).toBeNull();
  });
});