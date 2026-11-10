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
