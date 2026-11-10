import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { GatewayConfig, GatewayProviderConfig } from './config.ts';
import { chatGateway, fetchProviderModels, GatewayProviderError, streamGatewayChat } from './providers.ts';
import type { GatewayChatMessage, GatewayChatRequest, GatewayThinkingLevel } from './types.ts';
import type { DesktopService } from './desktop-service.ts';
import type { DesktopSettings, ProviderUpsertInput } from '../shared/desktop-contract.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const THINKING_LEVELS = new Set<GatewayThinkingLevel>(['off', 'low', 'medium', 'high']);

type RateLimiter = (request: IncomingMessage) => boolean;

export interface GatewayServices {
  desktop?: DesktopService;
  staticDir?: string;
}

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function createRateLimiter(config: GatewayConfig): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const windowMs = 60_000;
  return request => {
    if (config.rateLimitPerMinute <= 0) return true;
    const key = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= config.rateLimitPerMinute) return false;
    bucket.count += 1;
    return true;
  };
}

function corsHeaders(config: GatewayConfig, request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin) return {};
  if (!isOriginAllowed(config, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function isOriginAllowed(config: GatewayConfig, origin: string): boolean {
  return config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);
}

function sendJson(
  config: GatewayConfig,
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, { ...JSON_HEADERS, ...corsHeaders(config, request) });
  response.end(JSON.stringify(payload));
}

function authorized(config: GatewayConfig, request: IncomingMessage, url: URL): boolean {
  if (!config.authToken) return isLoopbackAddress(request.socket.remoteAddress);
  const queryToken = url.pathname.startsWith('/v1/assets/') ? url.searchParams.get('token') : null;
  const provided = request.headers.authorization ?? (queryToken ? `Bearer ${queryToken}` : '');
  const expected = `Bearer ${config.authToken}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChatRequest(value: unknown): GatewayChatRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.providerId !== 'string' || !value.providerId.trim()) return null;
  if (typeof value.model !== 'string' || !value.model.trim()) return null;
  if (!Array.isArray(value.messages) || value.messages.length === 0) return null;

  const messages: GatewayChatMessage[] = [];
  for (const rawMessage of value.messages) {
    if (!isRecord(rawMessage)) return null;
    if (rawMessage.role !== 'user' && rawMessage.role !== 'assistant') return null;
    if (typeof rawMessage.content !== 'string') return null;
    messages.push({ role: rawMessage.role, content: rawMessage.content });
  }

  if (value.systemPrompt !== undefined && typeof value.systemPrompt !== 'string') return null;
  if (value.imageDataUrl !== undefined && typeof value.imageDataUrl !== 'string') return null;
  if (value.thinkingLevel !== undefined && !THINKING_LEVELS.has(value.thinkingLevel as GatewayThinkingLevel)) {
    return null;
  }

  return {
    providerId: value.providerId.trim(),
    model: value.model.trim(),
    messages,
    ...(typeof value.systemPrompt === 'string' ? { systemPrompt: value.systemPrompt } : {}),
    ...(typeof value.imageDataUrl === 'string' ? { imageDataUrl: value.imageDataUrl } : {}),
    ...(typeof value.thinkingLevel === 'string'
      ? { thinkingLevel: value.thinkingLevel as GatewayThinkingLevel }
      : {}),
  };
}

async function readBody(
  config: GatewayConfig,
  request: IncomingMessage,
): Promise<Buffer> {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > config.maxBodyBytes) {
    request.resume();
    throw new Error('Request body too large');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > config.maxBodyBytes) {
      request.resume();
      throw new Error('Request body too large');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new Error('Request body is required');
  return Buffer.concat(chunks);
}

async function readJsonBody(
  config: GatewayConfig,
  request: IncomingMessage,
): Promise<unknown> {
  const body = await readBody(config, request);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

async function serveStaticFile(
  rootDir: string,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const root = resolve(rootDir);
  let targetPath: string;
  try {
    const decoded = decodeURIComponent(pathname);
    targetPath = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  } catch {
    response.writeHead(400);
    response.end();
    return true;
  }
  if (targetPath !== root && !targetPath.startsWith(root + sep)) {
    response.writeHead(403);
    response.end();
    return true;
  }

  try {
    const info = await stat(targetPath);
    if (!info.isFile()) throw new Error('not a file');
  } catch {
    targetPath = resolve(root, 'index.html');
    try {
      await stat(targetPath);
    } catch {
      return false;
    }
  }

  const data = await readFile(targetPath);
  const type = STATIC_MIME[extname(targetPath).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': targetPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  response.end(request.method === 'HEAD' ? undefined : data);
  return true;
}

function findProvider(config: GatewayConfig, providerId: string): GatewayProviderConfig | undefined {
  return config.providers.find(provider => provider.id === providerId);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicProviderError(error: unknown): string {
  return error instanceof GatewayProviderError ? error.message : 'Gateway request failed';
}

async function syncProviderConfig(config: GatewayConfig, services: GatewayServices): Promise<void> {
  if (!services.desktop) return;
  config.providers = await services.desktop.getProviderConfigs();
}

async function comfyuiBaseUrl(services: GatewayServices): Promise<string> {
  const settings = await services.desktop!.getSettings();
  if (!settings.comfyuiUrl) throw new Error('ComfyUI URL is not configured');
  return settings.comfyuiUrl;
}

function writeSseEvent(response: ServerResponse, event: string, payload: unknown): void {
  if (response.writableEnded || response.destroyed) return;
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleStream(
  config: GatewayConfig,
  request: IncomingMessage,
  response: ServerResponse,
  provider: GatewayProviderConfig,
  chatRequest: GatewayChatRequest,
): Promise<void> {
  response.writeHead(200, {
    ...corsHeaders(config, request),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders?.();

  const controller = new AbortController();
  let timedOut = false;
  let idleTimeout: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimeout = () => {
    if (idleTimeout !== null) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.requestTimeoutMs);
  };
  armIdleTimeout();

  let clientClosed = false;
  const abortOnClose = () => {
    if (response.writableEnded) return;
    clientClosed = true;
    controller.abort();
  };
  request.once('aborted', abortOnClose);
  response.once('close', abortOnClose);

  try {
    await streamGatewayChat(provider, chatRequest, event => {
      armIdleTimeout();
      writeSseEvent(response, event.type, event);
    }, controller.signal);
  } catch (error) {
    if (!clientClosed) {
      const message = timedOut ? 'Gateway request timed out' : publicProviderError(error);
      writeSseEvent(response, 'error', { type: 'error', error: message });
    }
  } finally {
    if (idleTimeout !== null) clearTimeout(idleTimeout);
    request.removeListener('aborted', abortOnClose);
    response.removeListener('close', abortOnClose);
    if (!response.writableEnded) response.end();
  }
}

async function requestHandler(
  config: GatewayConfig,
  request: IncomingMessage,
  response: ServerResponse,
  allowRequest: RateLimiter,
  services: GatewayServices,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://gateway.local');
  const method = request.method ?? 'GET';
  const origin = request.headers.origin;

  if (origin && !isOriginAllowed(config, origin)) {
    sendJson(config, request, response, 403, { error: 'Origin not allowed' });
    return;
  }

  if (method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(config, request));
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(config, request, response, 200, { ok: true });
    return;
  }

  if (!url.pathname.startsWith('/v1/') && services.staticDir) {
    if (await serveStaticFile(services.staticDir, url.pathname, request, response)) return;
  }

  if (!url.pathname.startsWith('/v1/')) {
    sendJson(config, request, response, 404, { error: 'Not found' });
    return;
  }

  if (!allowRequest(request)) {
    sendJson(config, request, response, 429, { error: 'Too many requests' });
    return;
  }

  if (!authorized(config, request, url)) {
    sendJson(config, request, response, 401, { error: 'Unauthorized' });
    return;
  }

  const desktop = services.desktop;
  if (desktop) {
    if (method === 'GET' && url.pathname === '/v1/bootstrap') {
      sendJson(config, request, response, 200, await desktop.bootstrap());
      return;
    }

    if (url.pathname === '/v1/settings') {
      if (method === 'GET') {
        sendJson(config, request, response, 200, await desktop.getSettings());
        return;
      }
      if (method === 'PUT') {
        try {
          const body = await readJsonBody(config, request);
          if (!isRecord(body)) throw new Error('Settings body must be an object');
          if (body.comfyuiUrl !== undefined && typeof body.comfyuiUrl !== 'string') {
            throw new Error('comfyuiUrl must be a string');
          }
          if (body.onboardingCompleted !== undefined && typeof body.onboardingCompleted !== 'boolean') {
            throw new Error('onboardingCompleted must be a boolean');
          }
          const settings = await desktop.updateSettings({
            ...(typeof body.comfyuiUrl === 'string' ? { comfyuiUrl: body.comfyuiUrl } : {}),
            ...(typeof body.onboardingCompleted === 'boolean' ? { onboardingCompleted: body.onboardingCompleted } : {}),
          } satisfies Partial<DesktopSettings>);
          sendJson(config, request, response, 200, settings);
        } catch (error) {
          sendJson(config, request, response, 400, { error: errorMessage(error) });
        }
        return;
      }
    }

    if (method === 'GET' && url.pathname === '/v1/providers') {
      sendJson(config, request, response, 200, { providers: await desktop.listProviders() });
      return;
    }

    const providerMatch = /^\/v1\/providers\/([^/]+)$/.exec(url.pathname);
    if (providerMatch) {
      const providerId = decodeURIComponent(providerMatch[1]);
      if (method === 'PUT') {
        try {
          const body = await readJsonBody(config, request);
          if (!isRecord(body)) throw new Error('Provider body must be an object');
          const input: ProviderUpsertInput = {
            name: String(body.name ?? ''),
            kind: body.kind as ProviderUpsertInput['kind'],
            baseUrl: String(body.baseUrl ?? ''),
            models: Array.isArray(body.models) ? body.models.map(String) : [],
            ...(typeof body.apiKey === 'string' && body.apiKey ? { apiKey: body.apiKey } : {}),
          };
          const provider = await desktop.upsertProvider(providerId, input);
          await syncProviderConfig(config, services);
          sendJson(config, request, response, 200, provider);
        } catch (error) {
          sendJson(config, request, response, 400, { error: errorMessage(error) });
        }
        return;
      }
      if (method === 'DELETE') {
        await desktop.deleteProvider(providerId);
        await syncProviderConfig(config, services);
        sendJson(config, request, response, 200, { ok: true });
        return;
      }
    }

    const refreshMatch = /^\/v1\/providers\/([^/]+)\/models\/refresh$/.exec(url.pathname);
    if (refreshMatch && method === 'POST') {
      try {
        const providerId = decodeURIComponent(refreshMatch[1]);
        const provider = config.providers.find(item => item.id === providerId);
        if (!provider) throw new Error('Provider not found');
        const models = await fetchProviderModels(provider);
        if (models.length === 0) throw new Error('Provider returned no models');
        const current = (await desktop.listProviders()).find(item => item.id === providerId);
        if (!current) throw new Error('Provider not found');
        await desktop.upsertProvider(providerId, {
          name: current.name,
          kind: current.kind,
          baseUrl: current.baseUrl,
          models,
        });
        await syncProviderConfig(config, services);
        sendJson(config, request, response, 200, { models });
      } catch (error) {
        sendJson(config, request, response, 502, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/workspace/canvas' && method === 'PUT') {
      try {
        await desktop.saveCanvas(await readJsonBody(config, request));
        sendJson(config, request, response, 200, { ok: true });
      } catch (error) {
        sendJson(config, request, response, 400, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/workspace/chat' && method === 'PUT') {
      try {
        await desktop.saveChat(await readJsonBody(config, request));
        sendJson(config, request, response, 200, { ok: true });
      } catch (error) {
        sendJson(config, request, response, 400, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/workspace/favorites' && method === 'PUT') {
      try {
        const body = await readJsonBody(config, request);
        if (!Array.isArray(body)) throw new Error('Favorites body must be an array');
        await desktop.saveFavorites(body);
        sendJson(config, request, response, 200, { ok: true });
      } catch (error) {
        sendJson(config, request, response, 400, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/workspace/export' && method === 'GET') {
      const archive = await desktop.exportWorkspace('desktop-backup');
      response.writeHead(200, {
        ...corsHeaders(config, request),
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="ideogram4-workspace.zip"',
      });
      response.end(Buffer.from(archive));
      return;
    }

    if (url.pathname === '/v1/workspace/export' && method === 'POST') {
      try {
        const body = await readJsonBody(config, request);
        const localStorageData = isRecord(body) && isRecord(body.localStorage)
          ? Object.fromEntries(Object.entries(body.localStorage).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
          : undefined;
        const archive = await desktop.exportWorkspace('desktop-backup', localStorageData);
        response.writeHead(200, {
          ...corsHeaders(config, request),
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="ideogram4-workspace.zip"',
        });
        response.end(Buffer.from(archive));
      } catch (error) {
        sendJson(config, request, response, 400, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/workspace/import' && method === 'POST') {
      try {
        const archive = await readBody(config, request);
        const manifest = await desktop.importWorkspace(new Uint8Array(archive));
        await syncProviderConfig(config, services);
        sendJson(config, request, response, 200, manifest);
      } catch (error) {
        sendJson(config, request, response, 400, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/assets' && method === 'POST') {
      try {
        const mimeType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!mimeType.startsWith('image/')) throw new Error('Asset Content-Type must be an image');
        const data = await readBody(config, request);
        const asset = await desktop.putAsset(data, mimeType);
        sendJson(config, request, response, 200, { ...asset, url: `/v1/assets/${asset.id}` });
      } catch (error) {
        sendJson(config, request, response, 400, { error: errorMessage(error) });
      }
      return;
    }

    const assetMatch = /^\/v1\/assets\/(asset_[a-f0-9-]+)$/.exec(url.pathname);
    if (assetMatch && method === 'GET') {
      try {
        const asset = await desktop.readAsset(assetMatch[1]);
        response.writeHead(200, {
          ...corsHeaders(config, request),
          'Content-Type': asset.mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        response.end(asset.data);
      } catch {
        sendJson(config, request, response, 404, { error: 'Asset not found' });
      }
      return;
    }

    if (url.pathname === '/v1/comfyui/prompt' && method === 'POST') {
      try {
        const baseUrl = await comfyuiBaseUrl(services);
        const body = await readJsonBody(config, request);
        const upstream = await fetch(`${baseUrl}/api/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', accept: '*/*' },
          body: JSON.stringify(body),
        });
        const text = await upstream.text();
        response.writeHead(upstream.status, {
          ...corsHeaders(config, request),
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        });
        response.end(text);
      } catch (error) {
        sendJson(config, request, response, 502, { error: errorMessage(error) });
      }
      return;
    }

    const historyMatch = /^\/v1\/comfyui\/history\/([^/]+)$/.exec(url.pathname);
    if (historyMatch && method === 'GET') {
      try {
        const baseUrl = await comfyuiBaseUrl(services);
        const upstream = await fetch(`${baseUrl}/history/${encodeURIComponent(decodeURIComponent(historyMatch[1]))}`);
        const text = await upstream.text();
        response.writeHead(upstream.status, {
          ...corsHeaders(config, request),
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        });
        response.end(text);
      } catch (error) {
        sendJson(config, request, response, 502, { error: errorMessage(error) });
      }
      return;
    }

    if (url.pathname === '/v1/comfyui/view' && method === 'GET') {
      try {
        const baseUrl = await comfyuiBaseUrl(services);
        const upstream = await fetch(`${baseUrl}/view${url.search}`);
        if (!upstream.ok) throw new Error(`ComfyUI returned ${upstream.status}`);
        const data = Buffer.from(await upstream.arrayBuffer());
        response.writeHead(200, {
          ...corsHeaders(config, request),
          'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        response.end(data);
      } catch (error) {
        sendJson(config, request, response, 502, { error: errorMessage(error) });
      }
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/v1/models') {
    sendJson(config, request, response, 200, {
      providers: config.providers.map(provider => ({
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        models: provider.models,
      })),
    });
    return;
  }

  if (method !== 'POST' || (url.pathname !== '/v1/chat' && url.pathname !== '/v1/chat/stream')) {
    sendJson(config, request, response, 404, { error: 'Not found' });
    return;
  }

  const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    sendJson(config, request, response, 415, { error: 'Content-Type must be application/json' });
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(config, request);
  } catch (error) {
    const message = errorMessage(error);
    sendJson(config, request, response, message.includes('too large') ? 413 : 400, { error: message });
    return;
  }

  const chatRequest = parseChatRequest(rawBody);
  if (!chatRequest) {
    sendJson(config, request, response, 400, { error: 'Invalid chat request' });
    return;
  }

  const provider = findProvider(config, chatRequest.providerId);
  if (!provider) {
    sendJson(config, request, response, 404, { error: 'Provider not found' });
    return;
  }

  if (provider.models.length > 0 && !provider.models.includes(chatRequest.model)) {
    sendJson(config, request, response, 400, { error: 'Model is not configured for this provider' });
    return;
  }

  if (services.desktop && chatRequest.imageDataUrl) {
    try {
      chatRequest.imageDataUrl = await services.desktop.resolveAssetImage(chatRequest.imageDataUrl);
    } catch (error) {
      sendJson(config, request, response, 400, { error: errorMessage(error) });
      return;
    }
  }

  if (url.pathname === '/v1/chat/stream') {
    await handleStream(config, request, response, provider, chatRequest);
    return;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);
  const abortOnClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', abortOnClose);
  try {
    const result = await chatGateway(provider, chatRequest, controller.signal);
    sendJson(config, request, response, 200, result);
  } catch (error) {
    const status = timedOut ? 504 : 502;
    sendJson(config, request, response, status, {
      error: timedOut ? 'Gateway request timed out' : publicProviderError(error),
    });
  } finally {
    response.removeListener('close', abortOnClose);
    clearTimeout(timeout);
  }
}

export function createGatewayServer(config: GatewayConfig, services: GatewayServices = {}): Server {
  const allowRequest = createRateLimiter(config);
  return createServer((request, response) => {
    void requestHandler(config, request, response, allowRequest, services).catch(() => {
      if (!response.headersSent) {
        sendJson(config, request, response, 500, { error: 'Internal gateway error' });
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });
}
