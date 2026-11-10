import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import GlobalSettingsPanel from '../GlobalSettingsPanel';

vi.mock('../../llm/api', () => ({
  getLlmProviders: vi.fn().mockResolvedValue([]),
}));

function renderPanel() {
  return render(<I18nProvider><GlobalSettingsPanel /></I18nProvider>);
}

describe('GlobalSettingsPanel', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      activeJsonScheme: 'ideogram4',
      flux3Globals: null,
      mossGlobals: null,
      globalPalette: ['#FF0000'],
      highLevelDescription: 'Poster scene',
      aesthetics: 'Bold',
      lighting: 'Soft',
      medium: 'digital illustration',
      artStyle: 'flat vector',
      background: 'Studio backdrop',
      photoArtStyleMode: 1,
    });
  });

  it('Ideogram 4 保留原有 Global 字段', () => {
    renderPanel();
    expect(screen.getByText('High Level Description')).toBeInTheDocument();
    expect(screen.getByText('Aesthetics')).toBeInTheDocument();
    expect(screen.queryByText('Full Scene Prompt')).not.toBeInTheDocument();
  });

  it('FLUX 3 显示 Full Scene Prompt 并独立保存', () => {
    act(() => useEditorStore.getState().setActiveJsonScheme('flux3-layout'));
    renderPanel();

    expect(screen.getByText('Full Scene Prompt')).toBeInTheDocument();
    expect(screen.queryByText('High Level Description')).not.toBeInTheDocument();

    const prompt = screen.getByRole('textbox');
    fireEvent.change(prompt, { target: { value: 'Edited FLUX scene' } });
    expect(useEditorStore.getState().flux3Globals?.fullScenePrompt).toBe('Edited FLUX scene');
    expect(useEditorStore.getState().highLevelDescription).toBe('Poster scene');
  });

  it('MOSS-Image 显示 caption/meta/canvas 并写回 profile', () => {
    act(() => useEditorStore.getState().setActiveJsonScheme('moss-layout'));
    renderPanel();

    expect(screen.getByText('Summary Caption')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Canvas Kind')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Collage' }));
    expect(useEditorStore.getState().mossGlobals?.canvas).toBe('collage');

    const [caption, meta] = screen.getAllByRole('textbox');
    fireEvent.change(caption, { target: { value: 'MOSS caption' } });
    fireEvent.change(meta, { target: { value: 'poster\nsoft light\n' } });
    expect(useEditorStore.getState().mossGlobals).toMatchObject({
      summaryCaption: 'MOSS caption',
      meta: ['poster', 'soft light'],
    });
  });
});
