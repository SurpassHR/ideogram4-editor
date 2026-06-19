import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import BoxPropertiesPanel from '../BoxPropertiesPanel';
import type { Box } from '../../../types';

const makeBox = (id: string): Box => ({
  id,
  x: 0,
  y: 0,
  w: 100,
  h: 80,
  mode: 'obj',
  text: '',
  desc: id,
  colors: [],
  imageDataUrl: null,
  imageRole: 'both',
});

function renderPanel() {
  return render(
    <I18nProvider>
      <BoxPropertiesPanel />
    </I18nProvider>,
  );
}

describe('BoxPropertiesPanel multi-select', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      boxes: [makeBox('box_0'), makeBox('box_1'), makeBox('box_2')],
      selectedBoxId: null,
      selectedBoxIds: ['box_0', 'box_1'],
      boxCounter: 3,
    });
  });

  it('多选时应显示摘要并隐藏单个 box 的编辑控件', () => {
    renderPanel();

    expect(screen.getByText('Selected 2 elements')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('多选删除按钮应删除所有选中 box', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));

    expect(useEditorStore.getState().boxes.map(box => box.id)).toEqual(['box_2']);
    expect(useEditorStore.getState().selectedBoxIds).toEqual([]);
  });
});
