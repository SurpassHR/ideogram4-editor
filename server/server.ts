import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { GatewayConfig, GatewayProviderConfig } from './config.ts';
import { chatGateway, GatewayProviderError, streamGatewayChat } from './providers.ts';
import type { GatewayChatMessage, GatewayChatRequest, GatewayThinkingLevel } from './types.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const THINKING_LEVELS = new Set<GatewayThinkingLevel>(['off', 'low', 'medium', 'high']);

type RateLimiter = (request: IncomingMessage) => boolean;

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

function authorized(config: GatewayConfig, request: IncomingMessage): boolean {
  if (!config.authToken) return isLoopbackAddress(request.socket.remoteAddress);
  const provided = request.headers.authorization ?? '';
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

async function readJsonBody(
  config: GatewayConfig,
  request: IncomingMessage,
): Promise<unknown> {
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON');
  }
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

  if (!url.pathname.startsWith('/v1/')) {
    sendJson(config, request, response, 404, { error: 'Not found' });
    return;
  }

  if (!allowRequest(request)) {
    sendJson(config, request, response, 429, { error: 'Too many requests' });
    return;
  }

  if (!authorized(config, request)) {
    sendJson(config, request, response, 401, { error: 'Unauthorized' });
    return;
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

export function createGatewayServer(config: GatewayConfig): Server {
  const allowRequest = createRateLimiter(config);
  return createServer((request, response) => {
    void requestHandler(config, request, response, allowRequest).catch(() => {
      if (!response.headersSent) {
        sendJson(config, request, response, 500, { error: 'Internal gateway error' });
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });
}
