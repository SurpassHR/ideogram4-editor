import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArtboardToolbar from '../ArtboardToolbar';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';

describe('ArtboardToolbar', () => {
  beforeEach(() => {
    useEditorStore.setState({
      canvasRatio: '1:1',
      canvasScale: 4,
      canvasCustomW: 16,
      canvasCustomH: 9,
      canvasW: 1024,
      canvasH: 1024,
    });
  });

  it('应该渲染比例选择控件', () => {
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    expect(screen.getByText('Ratio:')).toBeTruthy();
  });

  it('应该显示当前画布尺寸', () => {
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    expect(screen.getByText('1024 × 1024')).toBeTruthy();
  });

  it('当比例为 custom 时，应显示宽高输入框', () => {
    useEditorStore.setState({ canvasRatio: 'custom' });
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    const inputs = document.querySelectorAll('.slider-number');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('当比例为非 custom 时，应隐藏宽高输入框', () => {
    useEditorStore.setState({ canvasRatio: '16:9' });
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    const customRatio = document.querySelector('.canvas-custom-ratio');
    expect(customRatio).toBeNull();
  });
});
