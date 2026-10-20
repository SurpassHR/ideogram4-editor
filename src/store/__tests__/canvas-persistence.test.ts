import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_DOCUMENT_STORAGE_KEY,
  loadCanvasDocument,
  saveCanvasDocument,
} from '../../services/workspace-persistence';
import type { PersistedCanvasDocumentV1 } from '../../types/workspace';
import type { CanvasImageSnapshot } from '../../services/canvas-image-store';

const imageStore = vi.hoisted(() => {
  const state: { snapshot: CanvasImageSnapshot; saves: CanvasImageSnapshot[]; loads: number } = {
    snapshot: { boxes: {}, background: null },
    saves: [],
    loads: 0,
  };
  return {
    state,
    loadCanvasImages: vi.fn(async () => {
      state.loads += 1;
      return state.snapshot;
    }),
    saveCanvasImages: vi.fn(async (next: CanvasImageSnapshot) => {
      state.snapshot = next;
      state.saves.push(next);
    }),
    clearCanvasImages: vi.fn(async () => {
      state.snapshot = { boxes: {}, background: null };
    }),
  };
});

vi.mock('../../services/canvas-image-store', () => ({
  loadCanvasImages: imageStore.loadCanvasImages,
  saveCanvasImages: imageStore.saveCanvasImages,
  clearCanvasImages: imageStore.clearCanvasImages,
}));

const makeDocument = (overrides: Partial<PersistedCanvasDocumentV1> = {}): PersistedCanvasDocumentV1 => ({
  schemaVersion: 1,
  savedAt: 1000,
  canvasW: 1024,
  canvasH: 768,
  canvasRatio: '4:3',
  canvasScale: 8,
  canvasCustomW: 16,
  canvasCustomH: 9,
  boxes: [
    {
      id: 'box_0',
      x: 10,
      y: 20,
      w: 300,
      h: 200,
      mode: 'obj',
      text: '',
      desc: '主角',
      colors: ['#FFFFFF'],
      imageDataUrl: null,
      imageRole: 'both',
    },
    {
      id: 'box_2',
      x: 400,
      y: 100,
      w: 120,
      h: 120,
      mode: 'text',
      text: '标题',
      desc: '',
      colors: [],
      imageDataUrl: null,
      imageRole: 'both',
    },
  ],
  globalPalette: ['#FF0000'],
  highLevelDescription: '海报',
  aesthetics: 'clean',
  lighting: 'soft',
  medium: 'photo',
  artStyle: 'flat',
  background: 'white',
  photoArtStyleMode: 0,
  canvasBackgroundUrl: null,
  ...overrides,
});

const newBox = (desc: string) => ({
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  mode: 'obj' as const,
  text: '',
  desc,
  colors: [],
  imageDataUrl: null,
  imageRole: 'both' as const,
});

describe('当前画布自动保存', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    imageStore.state.snapshot = { boxes: {}, background: null };
    imageStore.state.saves = [];
    imageStore.state.loads = 0;
    imageStore.loadCanvasImages.mockClear();
    imageStore.saveCanvasImages.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('刷新页面后应从 localStorage 恢复 bbox、画板比例/倍数与全局设置', async () => {
    saveCanvasDocument(makeDocument());

    const { useEditorStore } = await import('../index');
    const state = useEditorStore.getState();

    expect(state.boxes).toHaveLength(2);
    expect(state.boxes[0]).toMatchObject({ id: 'box_0', desc: '主角' });
    expect(state.boxCounter).toBe(3);
    expect(state.canvasW).toBe(1024);
    expect(state.canvasH).toBe(768);
    expect(state.canvasRatio).toBe('4:3');
    expect(state.canvasScale).toBe(8);
    expect(state.highLevelDescription).toBe('海报');
    expect(state.globalPalette).toEqual(['#FF0000']);
    expect(state.photoArtStyleMode).toBe(0);
  });

  it('首次访问（无存档）应保持空画布', async () => {
    const { useEditorStore } = await import('../index');
    const state = useEditorStore.getState();

    expect(state.boxes).toEqual([]);
    expect(state.canvasW).toBe(1024);
    expect(state.canvasRatio).toBe('1:1');
  });

  it('画布内容变化后应自动写入 localStorage', async () => {
    const { useEditorStore } = await import('../index');

    useEditorStore.getState().addBox(newBox('新框'));
    expect(loadCanvasDocument()).toBeNull();

    await vi.advanceTimersByTimeAsync(500);

    const saved = loadCanvasDocument();
    expect(saved?.boxes).toHaveLength(1);
    expect(saved?.boxes[0].desc).toBe('新框');
  });

  it('启动时应把 IndexedDB 中的图像合并回 boxes 与画布背景', async () => {
    saveCanvasDocument(makeDocument());
    imageStore.state.snapshot = {
      boxes: { box_0: 'data:image/png;base64,BOX0' },
      background: 'data:image/png;base64,BG',
    };

    const { useEditorStore } = await import('../index');
    expect(useEditorStore.getState().boxes[0].imageDataUrl).toBeNull();

    await useEditorStore.getState().hydrateCanvasImages();

    const state = useEditorStore.getState();
    expect(state.boxes[0].imageDataUrl).toBe('data:image/png;base64,BOX0');
    expect(state.boxes[1].imageDataUrl).toBeNull();
    expect(state.canvasBackgroundUrl).toBe('data:image/png;base64,BG');
  });

  it('重复 hydrate 只读一次 IndexedDB，且不覆盖用户已换上的新图', async () => {
    saveCanvasDocument(makeDocument());
    imageStore.state.snapshot = {
      boxes: { box_0: 'data:image/png;base64,OLD' },
      background: null,
    };

    const { useEditorStore } = await import('../index');
    useEditorStore.getState().importImageToBox('box_0', 'data:image/png;base64,NEW');

    await useEditorStore.getState().hydrateCanvasImages();
    await useEditorStore.getState().hydrateCanvasImages();

    expect(imageStore.state.loads).toBe(1);
    expect(useEditorStore.getState().boxes[0].imageDataUrl).toBe('data:image/png;base64,NEW');
  });

  it('box 图像应写入 IndexedDB，而不是 localStorage', async () => {
    saveCanvasDocument(makeDocument());
    const { useEditorStore } = await import('../index');

    useEditorStore.getState().importImageToBox('box_0', 'data:image/png;base64,NEWIMAGE');
    await vi.advanceTimersByTimeAsync(500);

    const lastSave = imageStore.state.saves.at(-1);
    expect(lastSave?.boxes.box_0).toBe('data:image/png;base64,NEWIMAGE');

    const raw = localStorage.getItem(CANVAS_DOCUMENT_STORAGE_KEY) ?? '';
    expect(raw).not.toContain('base64');
    expect(loadCanvasDocument()?.boxes[0].imageDataUrl).toBeNull();
  });

  it('粘贴导入的 blob: 图像也应写入 IndexedDB', async () => {
    saveCanvasDocument(makeDocument());
    const { useEditorStore } = await import('../index');

    useEditorStore.getState().importImageToBox('box_0', 'blob:http://localhost/pasted');
    await vi.advanceTimersByTimeAsync(500);

    expect(imageStore.state.saves.at(-1)?.boxes.box_0).toBe('blob:http://localhost/pasted');
  });

  it('删除 box 后应清理它的图像', async () => {
    saveCanvasDocument(makeDocument());
    imageStore.state.snapshot = { boxes: { box_0: 'data:image/png;base64,BOX0' }, background: null };

    const { useEditorStore } = await import('../index');
    await useEditorStore.getState().hydrateCanvasImages();
    await vi.advanceTimersByTimeAsync(500);

    useEditorStore.getState().removeBox('box_0');
    await vi.advanceTimersByTimeAsync(500);

    expect(imageStore.state.saves.at(-1)).toEqual({ boxes: {}, background: null });
  });

  it('旧存档里的内联图像应在启动时迁移进 IndexedDB 并从 localStorage 移除', async () => {
    localStorage.setItem(CANVAS_DOCUMENT_STORAGE_KEY, JSON.stringify(makeDocument({
      boxes: [{ ...makeDocument().boxes[0], imageDataUrl: 'data:image/png;base64,LEGACY' }],
      canvasBackgroundUrl: 'data:image/png;base64,LEGACYBG',
    })));

    const { useEditorStore } = await import('../index');
    expect(useEditorStore.getState().boxes[0].imageDataUrl).toBe('data:image/png;base64,LEGACY');

    await useEditorStore.getState().hydrateCanvasImages();
    await vi.advanceTimersByTimeAsync(500);

    expect(imageStore.state.saves.at(-1)).toEqual({
      boxes: { box_0: 'data:image/png;base64,LEGACY' },
      background: 'data:image/png;base64,LEGACYBG',
    });
    const raw = localStorage.getItem(CANVAS_DOCUMENT_STORAGE_KEY) ?? '';
    expect(raw).not.toContain('base64');
  });

  it('清空画布后刷新应保持为空', async () => {
    saveCanvasDocument(makeDocument());
    const { useEditorStore } = await import('../index');

    useEditorStore.getState().clearBoxes();
    await vi.advanceTimersByTimeAsync(500);

    expect(loadCanvasDocument()?.boxes).toEqual([]);
    expect(imageStore.state.saves.at(-1)).toEqual({ boxes: {}, background: null });
  });
});
