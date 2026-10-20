import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCanvasImages,
  loadCanvasImages,
  saveCanvasImages,
} from '../canvas-image-store';

const DB_NAME = 'ideogram4-canvas-images';
const STORE_NAME = 'images';

function writeRawImages(entries: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const [key, value] of Object.entries(entries)) store.put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('canvas-image-store', () => {
  const createdBlobs: Blob[] = [];
  const blobPayload = new NodeBlob(['fake-image-bytes'], { type: 'image/png' });

  beforeEach(async () => {
    await clearCanvasImages();
    createdBlobs.length = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => {
        createdBlobs.push(blob);
        return `blob:mock/${createdBlobs.length}`;
      }),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => blobPayload })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('应保存并读回 box 参考图与画布背景图', async () => {
    await saveCanvasImages({
      boxes: { box_0: 'data:image/png;base64,AAAA', box_1: 'data:image/jpeg;base64,CCCC' },
      background: 'data:image/png;base64,BBBB',
    });

    await expect(loadCanvasImages()).resolves.toEqual({
      boxes: { box_0: 'data:image/png;base64,AAAA', box_1: 'data:image/jpeg;base64,CCCC' },
      background: 'data:image/png;base64,BBBB',
    });
  });

  it('再次保存应替换旧快照并清理已删除 box 的图像', async () => {
    await saveCanvasImages({ boxes: { box_0: 'data:image/png;base64,AAAA', box_1: 'data:image/png;base64,BBBB' }, background: null });

    await saveCanvasImages({ boxes: { box_0: 'data:image/png;base64,AAAA2' }, background: null });

    await expect(loadCanvasImages()).resolves.toEqual({
      boxes: { box_0: 'data:image/png;base64,AAAA2' },
      background: null,
    });
  });

  it('blob: URL 应转换为 Blob 持久化，加载时重建 object URL', async () => {
    await saveCanvasImages({
      boxes: { box_0: 'blob:http://localhost/pasted' },
      background: 'blob:http://localhost/bg',
    });

    expect(fetch).toHaveBeenCalledWith('blob:http://localhost/pasted');

    const loaded = await loadCanvasImages();
    expect(loaded.boxes.box_0).toMatch(/^blob:mock\//);
    expect(loaded.background).toMatch(/^blob:mock\//);
    expect(createdBlobs).toHaveLength(2);
    expect(createdBlobs[0]).toMatchObject({ type: 'image/png' });
    expect(createdBlobs[0].size).toBeGreaterThan(0);
  });

  it('应兼容上一版以纯字符串保存的图像', async () => {
    await writeRawImages({
      'box:box_0': 'data:image/png;base64,LEGACY',
      'canvas:background': 'data:image/png;base64,LEGACYBG',
    });

    await expect(loadCanvasImages()).resolves.toEqual({
      boxes: { box_0: 'data:image/png;base64,LEGACY' },
      background: 'data:image/png;base64,LEGACYBG',
    });
  });

  it('indexedDB 不可用时应降级为空快照且保存不抛错', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    // @ts-expect-error 模拟浏览器禁用 IndexedDB
    delete globalThis.indexedDB;
    try {
      await expect(saveCanvasImages({
        boxes: { box_0: 'data:image/png;base64,AAAA' },
        background: null,
      })).resolves.toBeUndefined();
      await expect(loadCanvasImages()).resolves.toEqual({ boxes: {}, background: null });
    } finally {
      globalThis.indexedDB = originalIndexedDB;
    }
  });
});
