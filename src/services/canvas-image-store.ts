/**
 * 画布图像存储（IndexedDB）
 *
 * localStorage 只有 ~5MB，参考图 / 背景图的 Data URL 很容易把整份画布文档撑爆。
 * 这里把图像单独放进 IndexedDB，localStorage 只保留结构化文档（bbox / 文案 / 比例等）。
 *
 * 支持两种来源：
 * - `data:` URL（文件选择 / FileReader 导入）：直接存字符串
 * - `blob:` URL（粘贴 / createObjectURL 导入）：取出 Blob 本身存进 IndexedDB，
 *   加载时用 `URL.createObjectURL(blob)` 重建，因此刷新后依然有效
 *
 * indexedDB 不可用（隐私模式 / 老浏览器）时静默降级：读返回空快照，写是 no-op。
 */

export interface CanvasImageSnapshot {
  /** boxId → 图像 URL（data: 或 blob:） */
  boxes: Record<string, string>;
  /** 画布背景参考图 URL（data: 或 blob:） */
  background: string | null;
}

type StoredImageEntry =
  | { kind: 'data'; dataUrl: string }
  // 用 ArrayBuffer 而不是直接存 Blob：跨 realm / 老 Safari 的 structured clone 更可靠
  | { kind: 'blob'; buffer: ArrayBuffer; mimeType: string };

const DB_NAME = 'ideogram4-canvas-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const BOX_KEY_PREFIX = 'box:';
const BACKGROUND_KEY = 'canvas:background';

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDb(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

function isImageUrl(url: string | null): url is string {
  return typeof url === 'string' && (url.startsWith('data:') || url.startsWith('blob:'));
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const factory = getIndexedDb();
  if (!factory) return Promise.reject(new Error('IndexedDB 不可用'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
    request.onblocked = () => reject(new Error('IndexedDB 被其他标签页阻塞'));
  });

  // 打开失败不缓存 rejected promise，避免之后每次读写都失败
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务被中止'));
  });
}

/** 把状态里的 URL 转换为可持久化的条目；blob: URL 需要先取回 Blob 本体 */
async function toStoredEntry(url: string): Promise<StoredImageEntry | null> {
  if (url.startsWith('data:')) return { kind: 'data', dataUrl: url };
  if (!url.startsWith('blob:')) return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    if (blob.size === 0) return null;
    return {
      kind: 'blob',
      buffer: await blob.arrayBuffer(),
      mimeType: blob.type || 'application/octet-stream',
    };
  } catch {
    // blob URL 已失效（例如被 revoke）：跳过，不阻断其他图像保存
    return null;
  }
}

/** 读回条目 → 当前会话可用的 URL；兼容上一版直接存字符串的格式 */
function fromStoredEntry(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.startsWith('data:') ? value : null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (entry.kind === 'data' && typeof entry.dataUrl === 'string' && entry.dataUrl.startsWith('data:')) {
    return entry.dataUrl;
  }
  if (entry.kind === 'blob' && isArrayBuffer(entry.buffer)) {
    try {
      const blob = new Blob([entry.buffer], { type: typeof entry.mimeType === 'string' ? entry.mimeType : undefined });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadCanvasImages(): Promise<CanvasImageSnapshot> {
  if (!getIndexedDb()) return { boxes: {}, background: null };
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys()),
      requestToPromise(store.getAll()),
    ]);

    const boxes: Record<string, string> = {};
    let background: string | null = null;
    keys.forEach((key, index) => {
      if (typeof key !== 'string') return;
      const url = fromStoredEntry(values[index]);
      if (!url) return;
      if (key === BACKGROUND_KEY) {
        background = url;
        return;
      }
      if (key.startsWith(BOX_KEY_PREFIX)) {
        boxes[key.slice(BOX_KEY_PREFIX.length)] = url;
      }
    });
    return { boxes, background };
  } catch {
    return { boxes: {}, background: null };
  }
}

/** 整份覆盖写入：先清空再写入，已删除的 box 图像不会残留 */
export async function saveCanvasImages(snapshot: CanvasImageSnapshot): Promise<void> {
  if (!getIndexedDb()) return;

  const boxEntries = await Promise.all(
    Object.entries(snapshot.boxes)
      .filter(([, url]) => isImageUrl(url))
      .map(async ([boxId, url]) => [boxId, await toStoredEntry(url)] as const),
  );
  const backgroundEntry = isImageUrl(snapshot.background)
    ? await toStoredEntry(snapshot.background)
    : null;

  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const done = awaitTransaction(tx);
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  for (const [boxId, entry] of boxEntries) {
    if (entry) store.put(entry, BOX_KEY_PREFIX + boxId);
  }
  if (backgroundEntry) {
    store.put(backgroundEntry, BACKGROUND_KEY);
  }
  await done;
}

export async function clearCanvasImages(): Promise<void> {
  if (!getIndexedDb()) return;
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const done = awaitTransaction(tx);
  tx.objectStore(STORE_NAME).clear();
  await done;
}
