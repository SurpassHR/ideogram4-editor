import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import CanvasArea from '../CanvasArea';
import type { Box } from '../../../types';

const makeBox = (id: string, x: number, y: number): Box => ({
  id,
  x,
  y,
  w: 100,
  h: 80,
  mode: 'obj',
  text: id,
  desc: '',
  colors: [],
  imageDataUrl: null,
  imageRole: 'both',
});

function renderCanvas() {
  return render(
    <I18nProvider>
      <CanvasArea
        zoom={1}
        panX={0}
        panY={0}
        screenToCanvas={(x, y) => ({ x, y })}
        onFitToArtboard={() => {}}
      />
    </I18nProvider>,
  );
}

describe('CanvasArea multi-select integration', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      canvasW: 500,
      canvasH: 500,
      boxes: [
        makeBox('box_0', 20, 20),
        makeBox('box_1', 150, 20),
        makeBox('box_2', 320, 320),
      ],
      selectedBoxId: null,
      selectedBoxIds: ['box_0', 'box_1'],
      boxCounter: 3,
      activeChatBoxId: null,
      isChatOpen: false,
      canvasBackgroundUrl: null,
      generatedImageUrl: null,
    });
  });

  it('右键已选 box 应保留多选，并让批量删除菜单作用于所有选中 box', () => {
    renderCanvas();

    fireEvent.contextMenu(document.getElementById('box_0')!, { clientX: 40, clientY: 40 });
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));

    expect(useEditorStore.getState().boxes.map(box => box.id)).toEqual(['box_2']);
    expect(useEditorStore.getState().selectedBoxIds).toEqual([]);
  });

  it('右键未选 box 应切换为单选', () => {
    renderCanvas();

    fireEvent.contextMenu(document.getElementById('box_2')!, { clientX: 340, clientY: 340 });

    expect(useEditorStore.getState().selectedBoxIds).toEqual(['box_2']);
    expect(useEditorStore.getState().selectedBoxId).toBe('box_2');
  });

  it('框选过程中应渲染 SVG 蚂蚁线 rect', () => {
    renderCanvas();

    const canvas = document.getElementById('canvas-wrapper')!;
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true });
    fireEvent.pointerMove(canvas, { clientX: 260, clientY: 140, ctrlKey: true });

    expect(document.querySelector('svg.marquee-ants rect.marquee-ants-path')).toBeInTheDocument();
  });

  it('多选后应渲染带 10px 内边距的最小外包围蚂蚁线', () => {
    renderCanvas();

    const bounds = document.querySelector('.selected-bounds-marquee') as HTMLElement;
    expect(bounds).not.toBeNull();
    expect(bounds.style.left).toBe('10px');
    expect(bounds.style.top).toBe('10px');
    expect(bounds.style.width).toBe('250px');
    expect(bounds.style.height).toBe('100px');
    expect(bounds.querySelector('svg.marquee-ants rect.marquee-ants-path')).toBeInTheDocument();
  });

  it('拖动多个已选 box 时最小外包围蚂蚁线应实时跟随预览位置', () => {
    renderCanvas();

    const box = document.getElementById('box_0')!;
    fireEvent.pointerDown(box, { clientX: 40, clientY: 40, button: 0 });
    fireEvent.pointerMove(window, { clientX: 70, clientY: 65 });

    const bounds = document.querySelector('.selected-bounds-marquee') as HTMLElement;
    expect(bounds).not.toBeNull();
    expect(bounds.style.left).toBe('40px');
    expect(bounds.style.top).toBe('35px');
    expect(bounds.style.width).toBe('250px');
    expect(bounds.style.height).toBe('100px');

    expect(useEditorStore.getState().boxes.find(box => box.id === 'box_0')).toMatchObject({ x: 20, y: 20 });
  });
});
