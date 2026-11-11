// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { GatewayConfig } from '../config.ts';
import { createGatewayServer } from '../server.ts';

const config: GatewayConfig = {
  host: '127.0.0.1',
  port: 0,
  allowedOrigins: ['http://localhost:5173'],
  authToken: 'gateway-token',
  maxBodyBytes: 1024 * 1024,
  requestTimeoutMs: 5000,
  rateLimitPerMinute: 1000,
  providers: [{
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'provider-secret',
    models: ['gpt-5.1'],
  }],
};

const runningServers: Server[] = [];
const realFetch = globalThis.fetch;

async function startServer(overrides: Partial<GatewayConfig> = {}) {
  const server = createGatewayServer({ ...config, ...overrides });
  runningServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function authHeaders(origin?: string) {
  return {
    Authorization: 'Bearer gateway-token',
    'Content-Type': 'application/json',
    ...(origin ? { Origin: origin } : {}),
  };
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function delayedSseResponse(chunks: string[], delayMs: number): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(runningServers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
  })));
});

describe('AI gateway HTTP server', () => {
  it('serves health without authentication', async () => {
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('lists public provider metadata without leaking secrets', async () => {
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/models`, {
      headers: authHeaders('http://localhost:5173'),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(text).not.toContain('provider-secret');
    expect(JSON.parse(text)).toEqual({
      providers: [{ id: 'openai', name: 'OpenAI', kind: 'openai', models: ['gpt-5.1'] }],
    });
  });

  it('rejects API requests without the configured bearer token', async () => {
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/models`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects disallowed browser origins before calling a provider', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { ...authHeaders('https://evil.example'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'openai',
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('requires a JSON content type for chat requests', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        providerId: 'openai',
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(response.status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('allows anonymous loopback requests only when no token is configured', async () => {
    const { baseUrl } = await startServer({ authToken: null });
    const response = await realFetch(`${baseUrl}/v1/models`);

    expect(response.status).toBe(200);
  });

  it('rate-limits API requests per client address', async () => {
    const { baseUrl } = await startServer({ rateLimitPerMinute: 2 });
    const request = () => realFetch(`${baseUrl}/v1/models`, { headers: authHeaders() });

    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
  });

  it('relays a normalized SSE stream from the selected provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
    ])));
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        providerId: 'openai',
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('event: content');
    expect(text).toContain('"text":"Hello"');
    expect(text).toContain('event: done');
  });

  it('resets the streaming timeout when provider events keep arriving', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => delayedSseResponse([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"C"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"D"}}]}\n\n',
    ], 60)));
    const { baseUrl } = await startServer({ requestTimeoutMs: 120 });
    const response = await realFetch(`${baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        providerId: 'openai',
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const text = await response.text();

    expect(text).toContain('event: done');
    expect(text).not.toContain('Gateway request timed out');
  });

  it('returns a clear error for unknown providers', async () => {
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        providerId: 'missing',
        model: 'anything',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Provider not found' });
  });

  it('serves a non-streaming chat response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello', reasoning_content: 'Plan' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        providerId: 'openai',
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ content: 'Hello', thinking: 'Plan' });
  });

  it('does not reflect upstream error bodies or provider URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'provider secret diagnostic' },
    }), { status: 401 })));
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        providerId: 'openai',
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).toContain('Provider API error 401');
    expect(text).not.toContain('provider secret diagnostic');
    expect(text).not.toContain('api.openai.com');
  });

  it('rejects models that are not configured for the provider', async () => {
    const { baseUrl } = await startServer();
    const response = await realFetch(`${baseUrl}/v1/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        providerId: 'openai',
        model: 'not-allowed',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Model is not configured for this provider' });
  });
});
