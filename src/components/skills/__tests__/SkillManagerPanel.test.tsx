import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import SkillManagerPanel from '../SkillManagerPanel';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import { DEFAULT_SKILL_ID } from '../../../types/skill';

function renderPanel() {
  return render(
    <I18nProvider>
      <SkillManagerPanel embedded />
    </I18nProvider>,
  );
}

const IMPORTED_MD = '---\nname: pasted-skill\ndescription: pasted description\n---\n\n# Pasted';

describe('SkillManagerPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({
      importedSkills: [],
      skillPrefs: { activeSkillId: DEFAULT_SKILL_ID, overrides: {} },
      pendingApply: null,
    });
  });

  it('列出三个内置 skill 并标记当前生效项', () => {
    renderPanel();
    const cards = document.querySelectorAll('.skill-card');
    expect(cards.length).toBe(3);
    expect(document.body.textContent).toContain('Ideogram 4 JSON Caption');
    expect(document.body.textContent).toContain('FLUX 3 Klein Layout');
    expect(document.body.textContent).toContain('MOSS-Image Layout');
    expect(document.querySelector('.skill-card[data-active="true"]')?.getAttribute('data-skill-id'))
      .toBe(DEFAULT_SKILL_ID);
  });

  it('切换 reference 勾选会写入 skillPrefs 覆盖', () => {
    renderPanel();
    const checkbox = document.querySelector('.skill-ref-checkbox input') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    const override = useEditorStore.getState().skillPrefs.overrides[DEFAULT_SKILL_ID];
    expect(override.enabledReferencePaths).toEqual([]);
  });

  it('粘贴 Markdown 导入后出现在列表中', () => {
    renderPanel();
    const textarea = document.querySelector('.skill-import-paste') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: IMPORTED_MD } });
    fireEvent.click(document.querySelector('.skill-import-paste-button') as HTMLElement);

    expect(useEditorStore.getState().importedSkills).toHaveLength(1);
    expect(document.querySelectorAll('.skill-card').length).toBe(4);
  });

  it('删除导入的 skill 后从列表移除，内置项不可删除', () => {
    renderPanel();
    const textarea = document.querySelector('.skill-import-paste') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: IMPORTED_MD } });
    fireEvent.click(document.querySelector('.skill-import-paste-button') as HTMLElement);

    const importedCard = document.querySelector('.skill-card[data-source="imported"]') as HTMLElement;
    // 导入后该卡片自动展开，直接删除
    fireEvent.click(importedCard.querySelector('.skill-delete-button') as HTMLElement);

    expect(useEditorStore.getState().importedSkills).toHaveLength(0);
    expect(document.querySelectorAll('.skill-card').length).toBe(3);
    // 内置卡片没有删除按钮
    const builtinCard = document.querySelector('.skill-card[data-source="builtin"]') as HTMLElement;
    fireEvent.click(builtinCard.querySelector('.skill-detail-toggle') as HTMLElement);
    expect(builtinCard.querySelector('.skill-delete-button')).toBeNull();
  });

  it('可以把某个 skill 设为当前', () => {
    renderPanel();
    const mossCard = document.querySelector('.skill-card[data-skill-id="builtin:moss-layout"]') as HTMLElement;
    fireEvent.click(mossCard.querySelector('.skill-detail-toggle') as HTMLElement);
    fireEvent.click(mossCard.querySelector('.skill-activate-button') as HTMLElement);
    expect(useEditorStore.getState().skillPrefs.activeSkillId).toBe('builtin:moss-layout');
  });
});
