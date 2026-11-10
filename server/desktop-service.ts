import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import type {
  AssetManifestEntry,
  DesktopBootstrap,
  DesktopSettings,
  ProviderSummary,
  ProviderUpsertInput,
  WorkspaceArchiveKind,
  WorkspaceArchiveManifestV2,
} from '../shared/desktop-contract.ts';
import { DesktopDataStore } from './desktop-store.ts';

const assetSchema = z.object({
  id: z.string().regex(/^asset_[a-f0-9-]+$/),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});

const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['openai', 'anthropic', 'gemini', 'openai_compat']),
  baseUrl: z.string(),
  models: z.array(z.string()),
});

const manifestSchema: z.ZodType<WorkspaceArchiveManifestV2> = z.object({
  app: z.literal('ideogram4-editor'),
  schemaVersion: z.literal(2),
  kind: z.enum(['web-migration', 'desktop-backup']),
  exportedAt: z.number(),
  modules: z.object({
    canvas: z.unknown().nullable(),
    chat: z.unknown().nullable(),
    favorites: z.array(z.unknown()),
    settings: z.object({
      comfyuiUrl: z.string(),
      onboardingCompleted: z.boolean(),
    }),
    providers: z.array(providerSchema),
    presets: z.unknown().optional(),
    skills: z.unknown().optional(),
    uiPreferences: z.unknown().optional(),
    localStorage: z.record(z.string(), z.string()).optional(),
  }),
  assets: z.array(assetSchema),
});

function normalizeRemoteUrl(raw: string, label: string): string {
  if (!raw.trim()) return '';
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }
  if (url.username || url.password) throw new Error(`${label} must not include credentials`);
  return `${url.origin}${url.pathname}`.replace(/\/$/, '');
}

function dataUrlFromAsset(mimeType: string, data: Buffer): string {
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

function assetIdFromUrl(value: string): string | null {
  const match = /\/v1\/assets\/(asset_[a-f0-9-]+)(?:\?.*)?$/.exec(value);
  return match?.[1] ?? null;
}

export class DesktopService {
  constructor(private readonly store: DesktopDataStore) {}

  async bootstrap(): Promise<DesktopBootstrap> {
    const [canvas, chat, favorites, settings, assets] = await Promise.all([
      this.store.readCanvas(),
      this.store.readChat(),
      this.store.readFavorites(),
      this.store.readSettings(),
      this.store.listAssets(),
    ]);
    return {
      firstRun: !settings.onboardingCompleted && canvas === null && chat === null && favorites.length === 0,
      canvas,
      chat,
      favorites,
      settings,
      assets,
    };
  }

  async getSettings(): Promise<DesktopSettings> {
    return this.store.readSettings();
  }

  async updateSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
    const current = await this.store.readSettings();
    const next: DesktopSettings = {
      comfyuiUrl: patch.comfyuiUrl === undefined
        ? current.comfyuiUrl
        : normalizeRemoteUrl(patch.comfyuiUrl, 'ComfyUI URL'),
      onboardingCompleted: patch.onboardingCompleted === undefined
        ? current.onboardingCompleted
        : Boolean(patch.onboardingCompleted),
    };
    return this.store.writeSettings(next);
  }

  async listProviders(): Promise<ProviderSummary[]> {
    return this.store.listProviders();
  }

  async getProviderConfigs() {
    return this.store.getProviderConfigs();
  }

  async upsertProvider(id: string, input: ProviderUpsertInput): Promise<ProviderSummary> {
    return this.store.upsertProvider(id, input);
  }

  async deleteProvider(id: string): Promise<void> {
    return this.store.deleteProvider(id);
  }

  async saveCanvas(value: unknown): Promise<void> {
    await this.store.writeCanvas(await this.materializeCanvasAssets(value));
  }

  async saveChat(value: unknown): Promise<void> {
    await this.store.writeChat(await this.materializeChatAssets(value));
  }

  async saveFavorites(value: unknown[]): Promise<void> {
    await this.store.writeFavorites(value);
  }

  async putAsset(data: Buffer, mimeType: string): Promise<AssetManifestEntry> {
    return this.store.putAsset(data, mimeType);
  }

  async readAsset(id: string): Promise<{ mimeType: string; data: Buffer }> {
    return this.store.readAsset(id);
  }

  async resolveAssetImage(value: string | undefined | null): Promise<string | undefined> {
    if (!value) return undefined;
    if (value.startsWith('data:')) return value;
    const id = assetIdFromUrl(value);
    if (!id) return value;
    const asset = await this.store.readAsset(id);
    return dataUrlFromAsset(asset.mimeType, asset.data);
  }

  async exportWorkspace(
    kind: WorkspaceArchiveKind = 'desktop-backup',
    localStorageData?: Record<string, string>,
  ): Promise<Uint8Array> {
    const [canvas, chat, favorites, settings, providers, assets] = await Promise.all([
      this.store.readCanvas(),
      this.store.readChat(),
      this.store.readFavorites(),
      this.store.readSettings(),
      this.store.listProviders(),
      this.store.listAssets(),
    ]);
    const manifest: WorkspaceArchiveManifestV2 = {
      app: 'ideogram4-editor',
      schemaVersion: 2,
      kind,
      exportedAt: Date.now(),
      modules: {
        canvas,
        chat,
        favorites,
        settings,
        providers: providers.map(({ hasApiKey: _hasApiKey, ...provider }) => provider),
        ...(localStorageData ? { localStorage: localStorageData } : {}),
      },
      assets,
    };
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    };
    for (const asset of assets) {
      files[`assets/${asset.id}`] = new Uint8Array((await this.store.readAsset(asset.id)).data);
    }
    return zipSync(files, { level: 6 });
  }

  async importWorkspace(archive: Uint8Array): Promise<WorkspaceArchiveManifestV2> {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(archive);
    } catch {
      throw new Error('Migration archive is not a valid zip file');
    }
    const manifestBytes = files['manifest.json'];
    if (!manifestBytes) throw new Error('Migration archive is missing manifest.json');
    let manifest: WorkspaceArchiveManifestV2;
    try {
      manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
    } catch (error) {
      throw new Error(`Migration manifest is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }

    for (const key of Object.keys(files)) {
      if (key !== 'manifest.json' && !/^assets\/asset_[a-f0-9-]+$/.test(key)) {
        throw new Error('Migration archive contains an invalid path');
      }
    }

    const existing = await this.bootstrap();
    if (!existing.firstRun) await this.createAutoBackup();

    for (const asset of manifest.assets) {
      const bytes = files[`assets/${asset.id}`];
      if (!bytes) throw new Error(`Migration archive is missing asset ${asset.id}`);
      await this.store.importAsset(asset, Buffer.from(bytes));
    }

    await this.store.writeCanvas(manifest.modules.canvas);
    await this.store.writeChat(manifest.modules.chat);
    await this.store.writeFavorites(manifest.modules.favorites);
    await this.store.writeSettings({ ...manifest.modules.settings, onboardingCompleted: true });
    await this.store.replaceProviderMetadata(manifest.modules.providers);
    return manifest;
  }

  private async createAutoBackup(): Promise<void> {
    const backupDir = join(this.store.getDataDir(), 'backups');
    await mkdir(backupDir, { recursive: true });
    const archive = await this.exportWorkspace('desktop-backup');
    await writeFile(join(backupDir, `auto-${Date.now()}.zip`), archive);
  }

  private async materializeCanvasAssets(value: unknown): Promise<unknown> {
    if (!value || typeof value !== 'object') return value;
    const canvas = structuredClone(value) as Record<string, unknown>;
    if (typeof canvas.canvasBackgroundUrl === 'string') {
      canvas.canvasBackgroundUrl = await this.materializeAssetValue(canvas.canvasBackgroundUrl);
    }
    if (Array.isArray(canvas.boxes)) {
      canvas.boxes = await Promise.all(canvas.boxes.map(async box => {
        if (!box || typeof box !== 'object') return box;
        const next = { ...(box as Record<string, unknown>) };
        if (typeof next.imageDataUrl === 'string') {
          next.imageDataUrl = await this.materializeAssetValue(next.imageDataUrl);
        }
        return next;
      }));
    }
    return canvas;
  }

  private async materializeChatAssets(value: unknown): Promise<unknown> {
    if (!value || typeof value !== 'object') return value;
    const chat = structuredClone(value) as Record<string, unknown>;
    if (Array.isArray(chat.sessions)) {
      chat.sessions = await Promise.all(chat.sessions.map(async session => {
        if (!session || typeof session !== 'object') return session;
        const next = { ...(session as Record<string, unknown>) };
        if (Array.isArray(next.messages)) {
          next.messages = await Promise.all(next.messages.map(async message => {
            if (!message || typeof message !== 'object') return message;
            const messageNext = { ...(message as Record<string, unknown>) };
            if (typeof messageNext.canvasSnapshotUrl === 'string') {
              messageNext.canvasSnapshotUrl = await this.materializeAssetValue(messageNext.canvasSnapshotUrl);
            }
            return messageNext;
          }));
        }
        return next;
      }));
    }
    return chat;
  }

  private async materializeAssetValue(value: string): Promise<string> {
    if (!value) return value;
    const id = assetIdFromUrl(value);
    if (id) return `/v1/assets/${id}`;
    if (!value.startsWith('data:')) return value;
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
    if (!match) return value;
    const asset = await this.store.putAsset(Buffer.from(match[2], 'base64'), match[1]);
    return `/v1/assets/${asset.id}`;
  }
}
