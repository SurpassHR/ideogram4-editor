import { strToU8, zipSync } from 'fflate';
import type {
  AssetManifestEntry,
  WorkspaceArchiveManifestV2,
} from '../../shared/desktop-contract';
import { loadCanvasImages } from './canvas-image-store';

const STORAGE_PREFIX = 'ideogram4-';
const EXCLUDED_KEYS = new Set([
  'ideogram4-workspace-backup-settings:v1',
]);
const CANVAS_KEY = 'ideogram4-canvas-document:v1';
const CHAT_KEY = 'ideogram4-canvas-chat-sessions:v1';
const FAVORITES_KEY = 'ideogram4-canvas-favorites:v1';
const PROVIDERS_KEY = 'ideogram4-llm-providers';
const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

interface ArchiveAsset {
  entry: AssetManifestEntry;
  bytes: Uint8Array;
}

function newAssetId(): string {
  return `asset_${crypto.randomUUID()}`;
}

function bytesFromDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], bytes: Uint8Array.from(atob(match[2]), char => char.charCodeAt(0)) };
}

async function bytesFromBlobUrl(url: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'image/png' };
  } catch {
    return null;
  }
}

async function assetFromUrl(url: string): Promise<ArchiveAsset | null> {
  const payload = url.startsWith('data:')
    ? bytesFromDataUrl(url)
    : url.startsWith('blob:')
      ? await bytesFromBlobUrl(url)
      : null;
  if (!payload) return null;
  const id = newAssetId();
  return {
    entry: { id, mimeType: payload.mimeType, size: payload.bytes.byteLength },
    bytes: payload.bytes,
  };
}

function localStorageSnapshot(): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX) || EXCLUDED_KEYS.has(key)) continue;
    result[key] = localStorage.getItem(key) ?? '';
  }
  try {
    const providers = JSON.parse(result[PROVIDERS_KEY] ?? '[]') as Array<Record<string, unknown>>;
    result[PROVIDERS_KEY] = JSON.stringify(providers.map(provider => ({ ...provider, api_key: '' })));
  } catch {
    delete result[PROVIDERS_KEY];
  }
  return result;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export async function buildWebMigrationArchive(): Promise<Uint8Array> {
  const localStorageData = localStorageSnapshot();
  const images = await loadCanvasImages();
  const assets: ArchiveAsset[] = [];

  const canvas = parseJson<Record<string, unknown> | null>(localStorageData[CANVAS_KEY], null);
  if (canvas) {
    if (Array.isArray(canvas.boxes)) {
      canvas.boxes = await Promise.all(canvas.boxes.map(async rawBox => {
        if (!rawBox || typeof rawBox !== 'object') return rawBox;
        const box = { ...(rawBox as Record<string, unknown>) };
        const imageUrl = typeof box.imageDataUrl === 'string'
          ? box.imageDataUrl
          : images.boxes[String(box.id)];
        if (imageUrl) {
          const asset = await assetFromUrl(imageUrl);
          if (asset) {
            assets.push(asset);
            box.imageDataUrl = `/v1/assets/${asset.entry.id}`;
          }
        }
        return box;
      }));
    }
    if (images.background) {
      const asset = await assetFromUrl(images.background);
      if (asset) {
        assets.push(asset);
        canvas.canvasBackgroundUrl = `/v1/assets/${asset.entry.id}`;
      }
    }
  }

  const chat = parseJson<Record<string, unknown> | null>(localStorageData[CHAT_KEY], null);
  if (chat && Array.isArray(chat.sessions)) {
    chat.sessions = await Promise.all(chat.sessions.map(async rawSession => {
      if (!rawSession || typeof rawSession !== 'object') return rawSession;
      const session = { ...(rawSession as Record<string, unknown>) };
      if (Array.isArray(session.messages)) {
        session.messages = await Promise.all(session.messages.map(async rawMessage => {
          if (!rawMessage || typeof rawMessage !== 'object') return rawMessage;
          const message = { ...(rawMessage as Record<string, unknown>) };
          if (typeof message.canvasSnapshotUrl === 'string') {
            const asset = await assetFromUrl(message.canvasSnapshotUrl);
            if (asset) {
              assets.push(asset);
              message.canvasSnapshotUrl = `/v1/assets/${asset.entry.id}`;
            }
          }
          return message;
        }));
      }
      return session;
    }));
  }

  const rawProviders = parseJson<Array<Record<string, unknown>>>(localStorageData[PROVIDERS_KEY], []);
  const favorites = parseJson<unknown[]>(localStorageData[FAVORITES_KEY], []);
  const manifest: WorkspaceArchiveManifestV2 = {
    app: 'ideogram4-editor',
    schemaVersion: 2,
    kind: 'web-migration',
    exportedAt: Date.now(),
    modules: {
      canvas,
      chat,
      favorites,
      settings: { comfyuiUrl: '', onboardingCompleted: false },
      providers: rawProviders.map(provider => ({
        id: String(provider.id ?? ''),
        name: String(provider.name ?? ''),
        kind: provider.kind as WorkspaceArchiveManifestV2['modules']['providers'][number]['kind'],
        baseUrl: String(provider.base_url || DEFAULT_PROVIDER_BASE_URLS[String(provider.kind)] || ''),
        models: Array.isArray(provider.models) ? provider.models.map(String) : [],
      })),
      localStorage: localStorageData,
    },
    assets: assets.map(asset => asset.entry),
  };
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const asset of assets) files[`assets/${asset.entry.id}`] = asset.bytes;
  return zipSync(files, { level: 6 });
}

export function downloadWebMigrationArchive(archive: Uint8Array): void {
  const blob = new Blob([new Uint8Array(archive)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ideogram4-web-migration-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function applyImportedLocalStorage(manifest: WorkspaceArchiveManifestV2): void {
  for (const [key, value] of Object.entries(manifest.modules.localStorage ?? {})) {
    if (key.startsWith(STORAGE_PREFIX) && !EXCLUDED_KEYS.has(key)) localStorage.setItem(key, value);
  }
}
