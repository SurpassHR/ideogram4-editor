import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEditorStore } from '../../store';
import { useBoxImageImport } from '../useBoxImageImport';

/** 创建模拟 dataTransfer 对象，避免 jsdom 不支持 DataTransfer */
function createMockDataTransfer(files: File[]) {
  return {
    files: files as unknown as FileList,
    items: {
      add: vi.fn(),
      length: files.length,
    },
    clearData: vi.fn(),
    getData: vi.fn(),
    setData: vi.fn(),
    types: [],
  };
}

/** 创建模拟 DropEvent */
function createDropEvent(files: File[]): React.DragEvent {
  const event = new Event('drop', { bubbles: true }) as unknown as React.DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: createMockDataTransfer(files),
    writable: false,
  });
  Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
  Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
  return event;
}

describe('useBoxImageImport', () => {
  beforeEach(() => {
    useEditorStore.setState({
      boxes: [{ id: 'box_0', x: 0, y: 0, w: 100, h: 100, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' }],
    });
  });

  it('handleDragOver 应设置 isDragging 为 true', () => {
    const { result } = renderHook(() => useBoxImageImport('box_0'));

    act(() => {
      result.current.handleDragOver(new Event('dragover') as unknown as React.DragEvent);
    });

    expect(result.current.isDragging).toBe(true);
  });

  it('handleDragLeave 应设置 isDragging 为 false', () => {
    const { result } = renderHook(() => useBoxImageImport('box_0'));

    act(() => {
      result.current.handleDragOver(new Event('dragover') as unknown as React.DragEvent);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.handleDragLeave(new Event('dragleave') as unknown as React.DragEvent);
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('handleDrop 应调用 importImageToBox', async () => {
    const { result } = renderHook(() => useBoxImageImport('box_0'));

    const file = new File(['fake-image-content'], 'test.png', { type: 'image/png' });

    act(() => {
      result.current.handleDrop(createDropEvent([file]));
    });

    await waitFor(() => {
      const state = useEditorStore.getState();
      expect(state.boxes[0].imageDataUrl).not.toBeNull();
      expect(state.boxes[0].imageDataUrl).toContain('data:image/png;base64,');
    });
  });

  it('handleDrop 非图像文件不应更新 imageDataUrl', async () => {
    const { result } = renderHook(() => useBoxImageImport('box_0'));

    const file = new File(['text-content'], 'test.txt', { type: 'text/plain' });

    await act(async () => {
      result.current.handleDrop(createDropEvent([file]));
    });

    const state = useEditorStore.getState();
    expect(state.boxes[0].imageDataUrl).toBeNull();
  });

  it('handleDrop 应重置 isDragging 为 false', async () => {
    const { result } = renderHook(() => useBoxImageImport('box_0'));

    const file = new File(['fake'], 'test.png', { type: 'image/png' });

    await act(async () => {
      result.current.handleDrop(createDropEvent([file]));
    });

    expect(result.current.isDragging).toBe(false);
  });
});
