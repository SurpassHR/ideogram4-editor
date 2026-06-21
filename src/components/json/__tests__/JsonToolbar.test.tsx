import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JsonToolbar from '../JsonToolbar';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

function renderToolbar() {
  return render(<I18nProvider><JsonToolbar /></I18nProvider>);
}

describe('JsonToolbar', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
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

  it('默认显示可编辑 JSON 文本区', () => {
    renderToolbar();

    expect(screen.getByPlaceholderText('JSON output will appear here...')).toBeInTheDocument();
  });

  it('切换 Preview 时应使用当前画布状态渲染只读预览', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByText('Poster scene')).toBeInTheDocument();
    expect(screen.getByText('Hero object')).toBeInTheDocument();
    expect(document.querySelector('.json-preview-canvas')).not.toBeNull();
  });

  it('Preview 模式下 JSON 文本非法时应显示内联错误', () => {
    renderToolbar();

    fireEvent.change(screen.getByPlaceholderText('JSON output will appear here...'), {
      target: { value: '{ bad json' },
    });
    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByText(/Invalid JSON:/)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });
});
