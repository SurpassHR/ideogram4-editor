import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '..';
import type { Box } from '../../types';
import type { CanvasReplacement } from '../../services/skill-apply';

function makeBox(id: string, desc: string): Box {
  return {
    id,
    x: 10,
    y: 20,
    w: 100,
    h: 80,
    mode: 'obj',
    text: '',
    desc,
    colors: [],
    imageDataUrl: null,
    imageRole: 'both',
  };
}

function makePreviewBox(desc: string) {
  return {
    x: 120,
    y: 80,
    w: 240,
    h: 320,
    mode: 'obj' as const,
    text: '',
    desc,
    colors: [],
    imageDataUrl: null,
    imageRole: 'both' as const,
  };
}

function makeReplacement(desc: string): CanvasReplacement {
  return {
    canvasW: 1536,
    canvasH: 1024,
    boxes: [makePreviewBox(desc)],
    globalPalette: ['#FFFFFF'],
    highLevelDescription: 'final',
    aesthetics: 'a',
    lighting: 'l',
    medium: 'photo',
    artStyle: '',
    background: 'bg',
    photoArtStyleMode: 0,
  };
}

describe('streaming layout store transaction', () => {
  beforeEach(() => {
    useEditorStore.setState({
      boxes: [makeBox('box_0', 'old'), makeBox('box_1', 'old2')],
      boxCounter: 2,
      selectedBoxId: 'box_0',
      selectedBoxIds: ['box_0'],
      editingBoxId: null,
      canvasW: 1024,
      canvasH: 1024,
      undoStack: [],
      redoStack: [],
      layoutStreamTransaction: null,
      isLayoutStreaming: false,
      layoutStreamRecovery: null,
      streamingLayoutBoxCount: 0,
    });
  });

  it('clears the old layout once and pushes a single undo snapshot across upserts', () => {
    const store = useEditorStore.getState();
    store.updateStreamingLayout('req_1', [makePreviewBox('first')]);

    let state = useEditorStore.getState();
    expect(state.boxes).toHaveLength(1);
    expect(state.boxes[0]).toMatchObject({ id: 'box_0', desc: 'first' });
    expect(state.undoStack).toHaveLength(1);
    expect(state.isLayoutStreaming).toBe(true);
    expect(state.streamingLayoutBoxCount).toBe(1);

    state.updateStreamingLayout('req_1', [makePreviewBox('first'), makePreviewBox('second')]);
    state = useEditorStore.getState();
    expect(state.boxes.map(box => box.id)).toEqual(['box_0', 'box_1']);
    expect(state.boxes[1].desc).toBe('second');
    expect(state.undoStack).toHaveLength(1);
    expect(state.streamingLayoutBoxCount).toBe(2);
  });

  it('ignores stale request writes and blocks undo while the layout is streaming', () => {
    const store = useEditorStore.getState();
    store.updateStreamingLayout('req_live', [makePreviewBox('live')]);
    store.updateStreamingLayout('req_stale', [makePreviewBox('stale')]);

    let state = useEditorStore.getState();
    expect(state.boxes[0].desc).toBe('live');
    expect(state.layoutStreamTransaction?.requestId).toBe('req_live');

    state.undo();
    state = useEditorStore.getState();
    expect(state.boxes[0].desc).toBe('live');
    expect(state.undoStack).toHaveLength(1);
  });

  it('commits the final layout without adding a second undo step', () => {
    const store = useEditorStore.getState();
    store.updateStreamingLayout('req_1', [makePreviewBox('preview')]);
    expect(useEditorStore.getState().commitStreamingLayout('req_1', makeReplacement('final'))).toBe(true);

    let state = useEditorStore.getState();
    expect(state.isLayoutStreaming).toBe(false);
    expect(state.layoutStreamTransaction).toBeNull();
    expect(state.boxes[0].id).toBe('box_0');
    expect(state.boxes[0].desc).toBe('final');
    expect(state.canvasW).toBe(1536);
    expect(state.highLevelDescription).toBe('final');
    expect(state.undoStack).toHaveLength(1);

    state.undo();
    state = useEditorStore.getState();
    expect(state.boxes.map(box => box.desc)).toEqual(['old', 'old2']);
    expect(state.canvasW).toBe(1024);
  });

  it('keeps other boxes in region mode and only replaces the target', () => {
    const store = useEditorStore.getState();
    store.updateStreamingLayout('req_region', [makePreviewBox('region update')], 'box_1');

    let state = useEditorStore.getState();
    expect(state.boxes.find(box => box.id === 'box_0')?.desc).toBe('old');
    expect(state.boxes.find(box => box.id === 'box_1')?.desc).toBe('region update');
    expect(state.undoStack).toHaveLength(1);

    expect(state.commitStreamingRegion('req_region', 'box_1', makePreviewBox('final region'))).toBe(true);
    state = useEditorStore.getState();
    expect(state.boxes.map(box => box.desc)).toEqual(['old', 'final region']);
    expect(state.isLayoutStreaming).toBe(false);
  });

  it('discard recovery restores boxes and the previous undo/redo stacks exactly', () => {
    const oldUndo = useEditorStore.getState().undoStack;
    const store = useEditorStore.getState();
    store.updateStreamingLayout('req_fail', [makePreviewBox('partial')]);
    store.requestStreamingLayoutRecovery('req_fail', 'network failed');

    let state = useEditorStore.getState();
    expect(state.layoutStreamRecovery).toMatchObject({ requestId: 'req_fail', boxCount: 1 });
    expect(state.isLayoutStreaming).toBe(false);

    state.resolveStreamingLayoutRecovery('discard');
    state = useEditorStore.getState();
    expect(state.boxes.map(box => box.desc)).toEqual(['old', 'old2']);
    expect(state.undoStack).toEqual(oldUndo);
    expect(state.layoutStreamRecovery).toBeNull();
    expect(state.layoutStreamTransaction).toBeNull();
  });

  it('keep recovery unlocks the partial boxes and leaves them undoable as one step', () => {
    const store = useEditorStore.getState();
    store.updateStreamingLayout('req_keep', [makePreviewBox('partial')]);
    store.requestStreamingLayoutRecovery('req_keep', 'parse failed');
    store.resolveStreamingLayoutRecovery('keep');

    let state = useEditorStore.getState();
    expect(state.boxes[0].desc).toBe('partial');
    expect(state.layoutStreamRecovery).toBeNull();
    expect(state.undoStack).toHaveLength(1);

    state.undo();
    state = useEditorStore.getState();
    expect(state.boxes.map(box => box.desc)).toEqual(['old', 'old2']);
  });
});
