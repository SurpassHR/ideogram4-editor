import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AssetManifestEntry,
  DesktopSettings,
  ProviderKind,
  ProviderSummary,
  ProviderUpsertInput,
} from '../shared/desktop-contract.ts';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/desktop-contract.ts';
import { normalizeProviderBaseUrl, validateProviderApiKey, type GatewayProviderConfig } from './config.ts';

export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
}

interface StoredProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  models: string[];
}

interface StoredAsset extends AssetManifestEntry {
  extension: string;
}

interface DesktopStoreOptions {
  dataDir: string;
  secretStorage: SecretStorage;
}

const PROVIDER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const ASSET_ID_RE = /^asset_[a-f0-9-]+$/;
const MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await rename(tempPath, path);
}

function isProviderKind(value: unknown): value is ProviderKind {
  return value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'openai_compat';
}

export class DesktopDataStore {
  private readonly dataDir: string;
  private readonly secretStorage: SecretStorage;
  private readonly workspaceDir: string;
  private readonly assetsDir: string;
  private readonly providersPath: string;
  private readonly secretsPath: string;
  private readonly assetsPath: string;
  private readonly settingsPath: string;

  constructor(options: DesktopStoreOptions) {
    this.dataDir = options.dataDir;
    this.secretStorage = options.secretStorage;
    this.workspaceDir = join(this.dataDir, 'workspace');
    this.assetsDir = join(this.dataDir, 'assets');
    this.providersPath = join(this.dataDir, 'providers.json');
    this.secretsPath = join(this.dataDir, 'secrets.json');
    this.assetsPath = join(this.dataDir, 'assets.json');
    this.settingsPath = join(this.dataDir, 'settings.json');
  }

  async init(): Promise<void> {
    await Promise.all([
      mkdir(this.workspaceDir, { recursive: true }),
      mkdir(this.assetsDir, { recursive: true }),
    ]);
  }

  getDataDir(): string {
    return this.dataDir;
  }

  async readCanvas(): Promise<unknown | null> {
    return readJson(join(this.workspaceDir, 'canvas.json'), null);
  }

  async writeCanvas(value: unknown): Promise<void> {
    await writeJsonAtomic(join(this.workspaceDir, 'canvas.json'), value);
  }

  async readChat(): Promise<unknown | null> {
    return readJson(join(this.workspaceDir, 'chat.json'), null);
  }

  async writeChat(value: unknown): Promise<void> {
    await writeJsonAtomic(join(this.workspaceDir, 'chat.json'), value);
  }

  async readFavorites(): Promise<unknown[]> {
    return readJson<unknown[]>(join(this.workspaceDir, 'favorites.json'), []);
  }

  async writeFavorites(value: unknown[]): Promise<void> {
    await writeJsonAtomic(join(this.workspaceDir, 'favorites.json'), value);
  }

  async readSettings(): Promise<DesktopSettings> {
    return {
      ...DEFAULT_DESKTOP_SETTINGS,
      ...await readJson<Partial<DesktopSettings>>(this.settingsPath, {}),
    };
  }

  async writeSettings(value: DesktopSettings): Promise<DesktopSettings> {
    const settings = { ...DEFAULT_DESKTOP_SETTINGS, ...value };
    await writeJsonAtomic(this.settingsPath, settings);
    return settings;
  }

  async listProviders(): Promise<ProviderSummary[]> {
    const providers = await this.readProviders();
    const secrets = await this.readSecrets();
    return providers.map(provider => ({
      ...provider,
      hasApiKey: Boolean(secrets[provider.id]),
    }));
  }

  async getProviderConfigs(): Promise<GatewayProviderConfig[]> {
    const providers = await this.readProviders();
    const secrets = await this.readSecrets();
    return providers.flatMap(provider => {
      const encrypted = secrets[provider.id];
      if (!encrypted) return [];
      try {
        return [{
          ...provider,
          apiKey: this.secretStorage.decrypt(encrypted),
        }];
      } catch {
        return [];
      }
    });
  }

  async upsertProvider(id: string, input: ProviderUpsertInput): Promise<ProviderSummary> {
    if (!PROVIDER_ID_RE.test(id)) throw new Error('Invalid provider id');
    if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Provider name is required');
    if (!isProviderKind(input.kind)) throw new Error('Unsupported provider kind');
    const baseUrl = normalizeProviderBaseUrl('Provider base URL', input.baseUrl);
    const models = (input.models ?? []).map(model => String(model).trim()).filter(Boolean);
    if (models.length === 0) throw new Error('At least one model is required');

    const providers = await this.readProviders();
    const secrets = await this.readSecrets();
    const existingIndex = providers.findIndex(provider => provider.id === id);
    const isNew = existingIndex < 0;

    if (input.apiKey !== undefined && input.apiKey.trim()) {
      if (!this.secretStorage.isEncryptionAvailable()) {
        throw new Error('OS credential encryption is unavailable; API key was not saved');
      }
      const apiKey = validateProviderApiKey('Provider API key', input.apiKey);
      secrets[id] = this.secretStorage.encrypt(apiKey);
    } else if (isNew) {
      throw new Error('API key is required for a new provider');
    }

    const provider: StoredProvider = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      baseUrl,
      models,
    };
    if (existingIndex >= 0) providers[existingIndex] = provider;
    else providers.push(provider);

    await writeJsonAtomic(this.secretsPath, secrets);
    await writeJsonAtomic(this.providersPath, providers);
    return { ...provider, hasApiKey: Boolean(secrets[id]) };
  }

  async deleteProvider(id: string): Promise<void> {
    const providers = (await this.readProviders()).filter(provider => provider.id !== id);
    const secrets = await this.readSecrets();
    delete secrets[id];
    await writeJsonAtomic(this.secretsPath, secrets);
    await writeJsonAtomic(this.providersPath, providers);
  }

  async replaceProviderMetadata(
    incoming: Array<Omit<ProviderSummary, 'hasApiKey'>>,
  ): Promise<void> {
    const providers: StoredProvider[] = incoming.map(provider => {
      if (!PROVIDER_ID_RE.test(provider.id)) throw new Error('Invalid provider id');
      if (!isProviderKind(provider.kind)) throw new Error('Unsupported provider kind');
      return {
        id: provider.id,
        name: provider.name.trim(),
        kind: provider.kind,
        baseUrl: normalizeProviderBaseUrl('Provider base URL', provider.baseUrl),
        models: provider.models.map(model => String(model).trim()).filter(Boolean),
      };
    });
    const secrets = await this.readSecrets();
    const validIds = new Set(providers.map(provider => provider.id));
    for (const id of Object.keys(secrets)) {
      if (!validIds.has(id)) delete secrets[id];
    }
    await writeJsonAtomic(this.secretsPath, secrets);
    await writeJsonAtomic(this.providersPath, providers);
  }

  async putAsset(data: Buffer, mimeType: string): Promise<AssetManifestEntry> {
    const extension = MIME_EXTENSION[mimeType];
    if (!extension) throw new Error('Unsupported asset MIME type');
    if (data.length === 0) throw new Error('Asset is empty');
    const id = `asset_${randomUUID()}`;
    const manifest = await this.readAssetManifest();
    const asset: StoredAsset = { id, mimeType, size: data.length, extension };
    await writeFile(join(this.assetsDir, `${id}${extension}`), data);
    manifest.push(asset);
    await writeJsonAtomic(this.assetsPath, manifest);
    return { id, mimeType, size: data.length };
  }

  async importAsset(entry: AssetManifestEntry, data: Buffer): Promise<void> {
    if (!ASSET_ID_RE.test(entry.id)) throw new Error('Invalid asset id');
    const extension = MIME_EXTENSION[entry.mimeType];
    if (!extension) throw new Error('Unsupported asset MIME type');
    if (data.length !== entry.size) throw new Error('Asset size mismatch');
    const manifest = await this.readAssetManifest();
    const existing = manifest.findIndex(item => item.id === entry.id);
    const stored: StoredAsset = { ...entry, extension };
    await writeFile(join(this.assetsDir, `${entry.id}${extension}`), data);
    if (existing >= 0) manifest[existing] = stored;
    else manifest.push(stored);
    await writeJsonAtomic(this.assetsPath, manifest);
  }

  async readAsset(id: string): Promise<{ mimeType: string; data: Buffer }> {
    if (!ASSET_ID_RE.test(id)) throw new Error('Invalid asset id');
    const asset = (await this.readAssetManifest()).find(item => item.id === id);
    if (!asset) throw new Error('Asset not found');
    return {
      mimeType: asset.mimeType,
      data: await readFile(join(this.assetsDir, `${asset.id}${asset.extension}`)),
    };
  }

  async listAssets(): Promise<AssetManifestEntry[]> {
    return (await this.readAssetManifest()).map(({ id, mimeType, size }) => ({ id, mimeType, size }));
  }

  async clearWorkspace(): Promise<void> {
    await Promise.all([
      rm(join(this.workspaceDir, 'canvas.json'), { force: true }),
      rm(join(this.workspaceDir, 'chat.json'), { force: true }),
      rm(join(this.workspaceDir, 'favorites.json'), { force: true }),
    ]);
  }

  private async readProviders(): Promise<StoredProvider[]> {
    return readJson<StoredProvider[]>(this.providersPath, []);
  }

  private async readSecrets(): Promise<Record<string, string>> {
    return readJson<Record<string, string>>(this.secretsPath, {});
  }

  private async readAssetManifest(): Promise<StoredAsset[]> {
    return readJson<StoredAsset[]>(this.assetsPath, []);
  }
}
