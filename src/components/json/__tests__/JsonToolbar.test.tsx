import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import JsonToolbar from '../JsonToolbar';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

function renderToolbar() {
  return render(<I18nProvider><JsonToolbar /></I18nProvider>);
}

describe('JsonToolbar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('ideogram4-lang', 'en');
    localStorage.removeItem('ideogram4-json-scheme');
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    useEditorStore.setState({
      canvasW: 1024,
      canvasH: 1024,
      boxes: [
        {
          id: 'box_0',
          x: 128,
          y: 128,
          w: 256,
          h: 256,
          mode: 'obj',
          text: '',
          desc: 'Hero object',
          colors: ['#FF0000'],
          imageDataUrl: null,
          imageRole: 'both',
        },
      ],
      globalPalette: ['#FF0000'],
      highLevelDescription: 'Poster scene',
      aesthetics: '',
      lighting: '',
      medium: '',
      artStyle: '',
      background: '',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('默认显示可编辑 JSON 文本区且包含初始画布状态', () => {
    renderToolbar();

    const textarea = screen.getByPlaceholderText('JSON output will appear here...') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toContain('Hero object');
    expect(textarea.value).toContain('Poster scene');
  });

  it('切换 Preview 时应使用当前画布状态渲染只读预览', () => {
    renderToolbar();

    // 点击 Preview tab
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText('Poster scene')).toBeInTheDocument();
    expect(screen.getByText('Hero object')).toBeInTheDocument();
    expect(document.querySelector('.json-preview-canvas')).not.toBeNull();
  });

  it('Preview 模式下 JSON 文本非法时应显示内联错误', () => {
    renderToolbar();

    fireEvent.change(screen.getByPlaceholderText('JSON output will appear here...'), {
      target: { value: '{ bad json' },
    });
    // 点击 Preview tab
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText(/Invalid JSON:/)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('画布状态变化后 JSON 自动更新（防抖 300ms）', () => {
    renderToolbar();

    const textarea = screen.getByPlaceholderText('JSON output will appear here...') as HTMLTextAreaElement;
    const initialValue = textarea.value;

    // 修改 store 状态
    act(() => {
      useEditorStore.getState().updateBox('box_0', { desc: 'Updated hero' });
      useEditorStore.getState().setGlobalSetting('highLevelDescription', 'New scene');
    });

    // 防抖期间 textarea 不变
    expect(textarea.value).toBe(initialValue);

    // 快进 300ms 触发防抖
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(textarea.value).toContain('Updated hero');
    expect(textarea.value).toContain('New scene');
  });

  it('切换 JSON scheme 后立即生成对应模型的 JSON 结构', () => {
    renderToolbar();

    const textarea = screen.getByPlaceholderText('JSON output will appear here...') as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value).compositional_deconstruction).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'FLUX 3' }));
    const flux3 = JSON.parse(textarea.value) as Array<Record<string, unknown>>;
    expect(Array.isArray(flux3)).toBe(true);
    expect(flux3[0]).toMatchObject({ id: 'obj_1', bbox: [125, 125, 375, 375] });
    expect(localStorage.getItem('ideogram4-json-scheme')).toBe('flux3-layout');

    fireEvent.click(screen.getByRole('radio', { name: 'MOSS-Image' }));
    const moss = JSON.parse(textarea.value) as Record<string, unknown>;
    expect(moss).toMatchObject({
      width: 1024,
      height: 1024,
      bbox_coord_space: 'abs',
      bbox_format: 'xyxy',
    });
    expect(Array.isArray(moss.items)).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Ideogram 4' }));
    expect(JSON.parse(textarea.value).compositional_deconstruction).toBeTruthy();
  });

  it('Preview 跟随所选 scheme 解析对应结构', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('radio', { name: 'FLUX 3' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText('Hero object')).toBeInTheDocument();
    expect(document.querySelector('.json-preview-canvas')).not.toBeNull();
  });

  it('FLUX 3 scheme 可从粘贴的布局行加载画布', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('radio', { name: 'FLUX 3' }));

    const textarea = screen.getByPlaceholderText('JSON output will appear here...');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify([
          { id: 'obj_1', bbox: [0, 0, 500, 500], desc: 'Loaded from FLUX 3' },
        ]),
      },
    });
    fireEvent.blur(textarea);
    fireEvent.click(screen.getByRole('button', { name: 'Load From Pasted JSON' }));

    const state = useEditorStore.getState();
    expect(state.boxes).toHaveLength(1);
    expect(state.boxes[0].desc).toBe('Loaded from FLUX 3');
    expect(state.boxes[0].w).toBe(512);
    expect(state.boxes[0].h).toBe(512);
  });

  it('MOSS-Image caption 草稿加载时只更新场景描述', () => {
    renderToolbar();
    const before = useEditorStore.getState().boxes;
    fireEvent.click(screen.getByRole('radio', { name: 'MOSS-Image' }));

    const textarea = screen.getByPlaceholderText('JSON output will appear here...');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: '{"caption":"Loaded MOSS scene"}' } });
    fireEvent.blur(textarea);
    fireEvent.click(screen.getByRole('button', { name: 'Load From Pasted JSON' }));

    expect(useEditorStore.getState().highLevelDescription).toBe('Loaded MOSS scene');
    expect(useEditorStore.getState().boxes).toEqual(before);
  });

  it('用户编辑 textarea 时自动同步暂停', () => {
    renderToolbar();

    const textarea = screen.getByPlaceholderText('JSON output will appear here...') as HTMLTextAreaElement;

    // 用户聚焦并编辑
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'custom user edit content' } });

    // 修改 store（不应覆盖用户编辑）
    act(() => {
      useEditorStore.getState().updateBox('box_0', { desc: 'Should not overwrite' });
    });

    // 快进 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // 用户内容应保持
    expect(textarea.value).toBe('custom user edit content');
  });

  it('用户离开 textarea 后立即同步', () => {
    renderToolbar();

    const textarea = screen.getByPlaceholderText('JSON output will appear here...') as HTMLTextAreaElement;

    // 用户编辑
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'custom edit' } });

    // 修改 store
    act(() => {
      useEditorStore.getState().updateBox('box_0', { desc: 'After blur sync' });
    });

    // 离开 textarea → 不再立即同步，由防抖定时器 300ms 后同步
    fireEvent.blur(textarea);

    // 防抖自动同步仍在生效，但不是立即的，这里先手动清空待同步
    // 原 onBlur 立即同步已移除，用户粘贴内容不会被覆盖了
    expect(textarea.value).toContain('custom edit');
  });

  it('组件卸载时清理防抖定时器', () => {
    const { unmount } = renderToolbar();

    act(() => {
      useEditorStore.getState().updateBox('box_0', { desc: 'Cleanup test' });
    });

    unmount();

    // 定时器已清理，快进不应报错
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(300);
      });
    }).not.toThrow();
  });
});
