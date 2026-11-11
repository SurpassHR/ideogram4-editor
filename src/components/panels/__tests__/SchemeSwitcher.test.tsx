import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import SchemeSwitcher from '../SchemeSwitcher';

describe('SchemeSwitcher', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    localStorage.removeItem('ideogram4-json-scheme');
    useEditorStore.setState({
      activeJsonScheme: 'ideogram4',
      flux3Globals: null,
      mossGlobals: null,
      highLevelDescription: 'Poster scene',
      background: 'Studio backdrop',
      aesthetics: '',
      lighting: '',
      medium: '',
      artStyle: '',
      globalPalette: [],
    });
  });

  it('切换 scheme 时更新 store 与提示文案', () => {
    render(<I18nProvider><SchemeSwitcher /></I18nProvider>);

    expect(screen.getByRole('radio', { name: 'Ideogram 4' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'FLUX 3' }));

    expect(useEditorStore.getState().activeJsonScheme).toBe('flux3-layout');
    expect(screen.getByText(/FLUX 3 layout rows/)).toBeInTheDocument();
  });
});
