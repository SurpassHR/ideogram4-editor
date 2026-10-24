import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../index';

describe('EditorStore Command Bar State', () => {
  beforeEach(() => {
    useEditorStore.setState({
      isGeneratingScene: false,
      isExtractingImage: false,
    });
  });

  it('toggles isGeneratingScene and isExtractingImage', () => {
    const store = useEditorStore.getState();
    expect(store.isGeneratingScene).toBe(false);
    expect(store.isExtractingImage).toBe(false);

    store.setIsGeneratingScene(true);
    expect(useEditorStore.getState().isGeneratingScene).toBe(true);

    store.setIsExtractingImage(true);
    expect(useEditorStore.getState().isExtractingImage).toBe(true);
  });
});

