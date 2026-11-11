export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'openai_compat';

export interface DesktopBridge {
  apiBaseUrl: string;
  apiToken: string;
  platform: 'macos' | 'windows' | 'linux';
  appVersion: string;
  dataDir: string;
  openDataDir?: () => Promise<void>;
  openLogs?: () => Promise<void>;
}

export interface ProviderSummary {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  models: string[];
  hasApiKey: boolean;
}

export interface ProviderUpsertInput {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  models?: string[];
  apiKey?: string;
}

export interface DesktopSettings {
  comfyuiUrl: string;
  onboardingCompleted: boolean;
}

export interface AssetManifestEntry {
  id: string;
  mimeType: string;
  size: number;
}

export interface DesktopBootstrap {
  firstRun: boolean;
  canvas: unknown | null;
  chat: unknown | null;
  favorites: unknown[];
  settings: DesktopSettings;
  assets: AssetManifestEntry[];
}

export type WorkspaceArchiveKind = 'web-migration' | 'desktop-backup';

export interface WorkspaceArchiveManifestV2 {
  app: 'ideogram4-editor';
  schemaVersion: 2;
  kind: WorkspaceArchiveKind;
  exportedAt: number;
  modules: {
    canvas: unknown | null;
    chat: unknown | null;
    favorites: unknown[];
    settings: DesktopSettings;
    providers: Array<Omit<ProviderSummary, 'hasApiKey'>>;
    presets?: unknown;
    skills?: unknown;
    uiPreferences?: unknown;
    localStorage?: Record<string, string>;
  };
  assets: AssetManifestEntry[];
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  comfyuiUrl: '',
  onboardingCompleted: false,
};

export function isDesktopBridge(value: unknown): value is DesktopBridge {
  if (!value || typeof value !== 'object') return false;
  const bridge = value as Partial<DesktopBridge>;
  return typeof bridge.apiBaseUrl === 'string'
    && typeof bridge.apiToken === 'string'
    && (bridge.platform === 'macos' || bridge.platform === 'windows' || bridge.platform === 'linux')
    && typeof bridge.appVersion === 'string';
}
