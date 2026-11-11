import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../index';

function resetStore() {
  localStorage.removeItem('ideogram4-json-scheme');
  useEditorStore.setState({
    boxes: [],
    selectedBoxId: null,
    selectedBoxIds: [],
    undoStack: [],
    redoStack: [],
    globalPalette: ['#FF0000'],
    highLevelDescription: 'Poster scene',
    aesthetics: 'Bold',
    lighting: 'Soft',
    medium: 'digital illustration',
    artStyle: 'flat vector',
    background: 'Studio backdrop',
    photoArtStyleMode: 1,
    activeJsonScheme: 'ideogram4',
    flux3Globals: null,
    mossGlobals: null,
  });
}

describe('scheme globals', () => {
  beforeEach(resetStore);

  it('首次切到 FLUX 3 时克隆当前 Ideogram 场景与色板', () => {
    useEditorStore.getState().setActiveJsonScheme('flux3-layout');

    const state = useEditorStore.getState();
    expect(state.activeJsonScheme).toBe('flux3-layout');
    expect(state.flux3Globals).toEqual({
      fullScenePrompt: 'Poster scene Studio backdrop',
      palette: ['#FF0000'],
    });
    expect(localStorage.getItem('ideogram4-json-scheme')).toBe('flux3-layout');
  });

  it('首次切到 MOSS-Image 时保持旧版 summary 映射', () => {
    useEditorStore.getState().setActiveJsonScheme('moss-layout');

    expect(useEditorStore.getState().mossGlobals).toEqual({
      summaryCaption: 'Poster scene Studio backdrop',
      meta: ['Bold', 'Soft', 'digital illustration', 'flat vector'],
      canvas: 'single',
      palette: ['#FF0000'],
    });
  });

  it('各 scheme 的 global 值独立保存，重复切换不会覆盖', () => {
    const store = useEditorStore.getState();
    store.setActiveJsonScheme('flux3-layout');
    store.updateFlux3Globals({ fullScenePrompt: 'Edited FLUX scene' });
    store.setActiveJsonScheme('moss-layout');
    store.updateMossGlobals({ summaryCaption: 'Edited MOSS scene', canvas: 'collage' });
    store.setActiveJsonScheme('ideogram4');
    store.setActiveJsonScheme('flux3-layout');

    const state = useEditorStore.getState();
    expect(state.flux3Globals?.fullScenePrompt).toBe('Edited FLUX scene');
    expect(state.mossGlobals?.summaryCaption).toBe('Edited MOSS scene');
    expect(state.mossGlobals?.canvas).toBe('collage');
    expect(state.highLevelDescription).toBe('Poster scene');
  });

  it('清空画布时清空三个 scheme 的 global 配置', () => {
    const store = useEditorStore.getState();
    store.setActiveJsonScheme('flux3-layout');
    store.clearBoxes();

    const state = useEditorStore.getState();
    expect(state.highLevelDescription).toBe('');
    expect(state.globalPalette).toEqual([]);
    expect(state.flux3Globals).toEqual({ fullScenePrompt: '', palette: [] });
    expect(state.mossGlobals).toEqual({ summaryCaption: '', meta: [], canvas: 'single', palette: [] });
  });

  it('undo/redo 快照会恢复 scheme profile', () => {
    const store = useEditorStore.getState();
    store.setActiveJsonScheme('flux3-layout');
    store.updateFlux3Globals({ fullScenePrompt: 'Before undo' });
    store.snapshot();
    store.updateFlux3Globals({ fullScenePrompt: 'After snapshot' });

    store.undo();
    expect(useEditorStore.getState().flux3Globals?.fullScenePrompt).toBe('Before undo');

    store.redo();
    expect(useEditorStore.getState().flux3Globals?.fullScenePrompt).toBe('After snapshot');
  });
});
