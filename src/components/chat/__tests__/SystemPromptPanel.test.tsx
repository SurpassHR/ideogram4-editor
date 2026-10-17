import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import SystemPromptPanel from '../SystemPromptPanel';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

function renderPanel() {
  return render(
    <I18nProvider>
      <SystemPromptPanel embedded />
    </I18nProvider>,
  );
}

describe('SystemPromptPanel（canvas 入口已迁移到 Skill）', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({ systemPrompts: [] });
  });

  it('新建表单不再提供 canvas 作用域，保存后 scope 固定为 box', () => {
    renderPanel();
    fireEvent.click(document.querySelector('.sysprompt-toolbar .btn-primary') as HTMLElement);

    const newCard = document.querySelector('.sp-card.new') as HTMLElement;
    expect(newCard).not.toBeNull();
    expect(newCard.querySelector('select')).toBeNull();
    expect(newCard.textContent).toContain('Box Chat');

    fireEvent.change(newCard.querySelector('input[type="text"]') as HTMLElement, {
      target: { value: '箱级提示词' },
    });
    fireEvent.change(newCard.querySelector('textarea') as HTMLElement, {
      target: { value: 'content' },
    });
    fireEvent.click(newCard.querySelector('.btn-primary') as HTMLElement);

    const saved = useEditorStore.getState().systemPrompts;
    expect(saved).toHaveLength(1);
    expect(saved[0].scope).toBe('box');
  });

  it('内置卡片只剩 Box 一个（canvas 默认已由 Skill 接管）', () => {
    renderPanel();
    const builtins = document.querySelectorAll('.sp-card.sp-builtin');
    expect(builtins).toHaveLength(1);
    expect(builtins[0].textContent).toContain('Box');
  });
});
