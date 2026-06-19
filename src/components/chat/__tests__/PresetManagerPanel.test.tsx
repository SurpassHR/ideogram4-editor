import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PresetManagerPanel from '../PresetManagerPanel';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

function renderPresetManagerPanel() {
  return render(
    <I18nProvider>
      <PresetManagerPanel embedded />
    </I18nProvider>
  );
}

describe('PresetManagerPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({
      chatPresets: [
        {
          id: 'preset_test_1',
          name: '测试预设',
          description: '用于测试标签布局',
          promptTemplate: '测试模板',
          tags: ['细节', '英文'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  it('编辑预设时，已选标签应渲染在独立的横向列表容器中', () => {
    renderPresetManagerPanel();

    const card = document.querySelector('.preset-card') as HTMLElement;
    fireEvent.click(card);

    const tagList = document.querySelector('.preset-tags-list');
    expect(tagList).not.toBeNull();
    expect(tagList!.querySelectorAll('.preset-tag.removable')).toHaveLength(2);
  });
});
