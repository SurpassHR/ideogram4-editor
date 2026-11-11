import type {
  DesktopBootstrap,
  DesktopSettings,
  ProviderSummary,
  ProviderUpsertInput,
  WorkspaceArchiveManifestV2,
} from '../../shared/desktop-contract';

export function getDesktopBridge() {
  return typeof window !== 'undefined' ? window.desktop : undefined;
}

export function isDesktopRuntime(): boolean {
  return Boolean(getDesktopBridge());
}

export function desktopAssetUrl(value: string): string {
  const bridge = getDesktopBridge();
  if (!bridge) return value;
  if (value.startsWith('/v1/assets/')) {
    const absolute = `${bridge.apiBaseUrl}${value}`;
    if (typeof window !== 'undefined' && window.location.origin === bridge.apiBaseUrl) return absolute;
    return `${absolute}?token=${encodeURIComponent(bridge.apiToken)}`;
  }
  return value;
}

function absolutizeAssetRefs(value: unknown): unknown {
  if (typeof value === 'string') return desktopAssetUrl(value);
  if (Array.isArray(value)) return value.map(absolutizeAssetRefs);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, absolutizeAssetRefs(child)]),
  );
}

export async function desktopFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error('Desktop runtime is not available');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${bridge.apiToken}`);
  return fetch(`${bridge.apiBaseUrl}${path}`, { ...init, headers });
}

async function desktopJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await desktopFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Desktop API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function bootstrapDesktop(): Promise<DesktopBootstrap> {
  const data = await desktopJson<DesktopBootstrap>('/v1/bootstrap');
  return {
    ...data,
    canvas: absolutizeAssetRefs(data.canvas),
    chat: absolutizeAssetRefs(data.chat),
    favorites: data.favorites.map(absolutizeAssetRefs),
  };
}

export async function getDesktopSettings(): Promise<DesktopSettings> {
  return desktopJson<DesktopSettings>('/v1/settings');
}

let workspaceWriteChain: Promise<void> = Promise.resolve();

function enqueueWorkspaceWrite(task: () => Promise<void>): Promise<void> {
  const next = workspaceWriteChain.catch(() => undefined).then(task);
  workspaceWriteChain = next;
  return next;
}

export async function flushDesktopWrites(): Promise<void> {
  await workspaceWriteChain.catch(() => undefined);
}

export async function saveDesktopSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
  return desktopJson<DesktopSettings>('/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function listDesktopProviders(): Promise<ProviderSummary[]> {
  const data = await desktopJson<{ providers: ProviderSummary[] }>('/v1/providers');
  return data.providers;
}

export async function saveDesktopProvider(id: string, input: ProviderUpsertInput): Promise<ProviderSummary> {
  return desktopJson<ProviderSummary>(`/v1/providers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteDesktopProvider(id: string): Promise<void> {
  await desktopJson(`/v1/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function refreshDesktopProviderModels(id: string): Promise<string[]> {
  const data = await desktopJson<{ models: string[] }>(`/v1/providers/${encodeURIComponent(id)}/models/refresh`, {
    method: 'POST',
  });
  return data.models;
}

async function saveWorkspaceModule(module: 'canvas' | 'chat' | 'favorites', value: unknown): Promise<void> {
  const body = JSON.stringify(value);
  await enqueueWorkspaceWrite(() => desktopJson(`/v1/workspace/${module}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    ...(body.length < 60_000 ? { keepalive: true } : {}),
  }));
}

export function saveDesktopCanvas(value: unknown): Promise<void> {
  return saveWorkspaceModule('canvas', value);
}

export function saveDesktopChat(value: unknown): Promise<void> {
  return saveWorkspaceModule('chat', value);
}

export function saveDesktopFavorites(value: unknown[]): Promise<void> {
  return saveWorkspaceModule('favorites', value);
}

export async function exportDesktopWorkspace(): Promise<Blob> {
  const localStorageData: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith('ideogram4-')) continue;
    if (key === 'ideogram4-workspace-backup-settings:v1') continue;
    if (key === 'ideogram4-llm-providers') continue;
    localStorageData[key] = localStorage.getItem(key) ?? '';
  }
  const response = await desktopFetch('/v1/workspace/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localStorage: localStorageData }),
  });
  if (!response.ok) throw new Error(`Export failed: ${response.status}`);
  return response.blob();
}

export async function importDesktopWorkspace(archive: Blob): Promise<WorkspaceArchiveManifestV2> {
  const response = await desktopFetch('/v1/workspace/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: archive,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `Import failed: ${response.status}`);
  }
  return response.json() as Promise<WorkspaceArchiveManifestV2>;
}

export async function submitDesktopComfyPrompt(payload: unknown): Promise<{ prompt_id: string }> {
  return desktopJson('/v1/comfyui/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getDesktopComfyHistory(promptId: string): Promise<unknown> {
  return desktopJson(`/v1/comfyui/history/${encodeURIComponent(promptId)}`);
}

export async function fetchDesktopComfyImage(params: URLSearchParams): Promise<Blob> {
  const response = await desktopFetch(`/v1/comfyui/view?${params.toString()}`);
  if (!response.ok) throw new Error(`ComfyUI image proxy failed: ${response.status}`);
  return response.blob();
}

export type DesktopStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'content'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; error: string };

export async function streamDesktopChat(
  body: unknown,
  onEvent: (event: DesktopStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await desktopFetch('/v1/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `Stream failed: ${response.status}`);
  }
  if (!response.body) throw new Error('Desktop stream returned no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const boundary = /\r?\n\r?\n/.exec(buffer);
      if (!boundary) break;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const data = frame.split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      const event = JSON.parse(data) as DesktopStreamEvent;
      onEvent(event);
    }
  }
}

export async function desktopChat(body: unknown, signal?: AbortSignal): Promise<{ content: string; thinking?: string }> {
  return desktopJson('/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}
