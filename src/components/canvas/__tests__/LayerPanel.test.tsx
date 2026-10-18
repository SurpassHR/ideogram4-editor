import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import LayerPanel from '../LayerPanel';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import type { Box } from '../../../types';

function makeBox(id: string, overrides: Partial<Box> = {}): Box {
  return {
    id,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    mode: 'obj',
    text: '',
    desc: '',
    colors: [],
    imageDataUrl: null,
    imageRole: 'both',
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <I18nProvider>
      <LayerPanel />
    </I18nProvider>,
  );
}

describe('LayerPanel 序号与 tag 条统一', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      boxes: [
        makeBox('box_0', { text: 'GeForce RTX 5090' }),
        makeBox('box_1', { mode: 'text', text: '', desc: '' }),
      ],
      selectedBoxIds: [],
      selectedBoxId: null,
      isLayerPanelOpen: true,
    });
  });

  it('图层项显示与 tag 一致的 1 起始序号，上层列表在前', () => {
    renderPanel();

    const indexes = Array.from(document.querySelectorAll('.layer-panel-item-index')).map(
      el => el.textContent,
    );
    expect(indexes).toEqual(['2', '1']);
  });

  it('无文字与描述的框显示类型名，不暴露内部 id', () => {
    renderPanel();

    const labels = Array.from(document.querySelectorAll('.layer-panel-item-label')).map(
      el => el.textContent,
    );
    expect(labels).toEqual(['Text', 'GeForce RTX 5090']);
    expect(document.body.textContent).not.toContain('box_0');
  });

  it('点击图层项应选中对应框', () => {
    renderPanel();

    const items = document.querySelectorAll('.layer-panel-item');
    fireEvent.click(items[1]);

    expect(useEditorStore.getState().selectedBoxIds).toEqual(['box_0']);
  });
});
