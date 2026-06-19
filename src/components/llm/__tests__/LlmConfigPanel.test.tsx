import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LlmConfigPanel from '../LlmConfigPanel';
import { I18nProvider } from '../../../i18n/context';

function renderLlmConfigPanel() {
  return render(
    <I18nProvider>
      <LlmConfigPanel embedded />
    </I18nProvider>
  );
}

describe('LlmConfigPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('API Key 输入框和显示切换按钮应使用专用样式类', async () => {
    renderLlmConfigPanel();

    fireEvent.click(await screen.findByRole('button', { name: '+ Add' }));

    await waitFor(() => {
      expect(document.querySelector('.llm-api-key-wrapper')).not.toBeNull();
    });

    const wrapper = document.querySelector('.llm-api-key-wrapper')!;
    const input = wrapper.querySelector('input[type="password"]');
    const toggleButton = wrapper.querySelector('button');

    expect(input).not.toBeNull();
    expect(input).toHaveClass('llm-api-key-input');
    expect(toggleButton).not.toBeNull();
    expect(toggleButton).toHaveClass('llm-api-key-toggle');
  });
});
