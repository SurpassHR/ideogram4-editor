// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { DesktopDataStore, type SecretStorage } from '../desktop-store.ts';
import { DesktopService } from '../desktop-service.ts';
import { loadGatewayConfig } from '../config.ts';
import { createGatewayServer } from '../server.ts';

const servers: Server[] = [];
const dirs: string[] = [];
const realFetch = globalThis.fetch;
const secretStorage: SecretStorage = {
  isEncryptionAvailable: () => true,
  encrypt: plain => `enc:${Buffer.from(plain).toString('base64')}`,
  decrypt: cipher => Buffer.from(cipher.slice(4), 'base64').toString('utf8'),
};

async function startDesktopServer() {
  const dataDir = await mkdtemp(join(tmpdir(), 'ideogram-desktop-api-'));
  dirs.push(dataDir);
  const store = new DesktopDataStore({ dataDir, secretStorage });
  await store.init();
  const desktop = new DesktopService(store);
  const staticDir = join(dataDir, 'dist');
  await mkdir(staticDir);
  await writeFile(join(staticDir, 'index.html'), '<html><body>desktop shell</body></html>');
  const config = {
    ...loadGatewayConfig({}),
    port: 0,
    authToken: 'test-token',
    rateLimitPerMinute: 1000,
  };
  const server = createGatewayServer(config, { desktop, staticDir });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, store, desktop };
}

function headers(extra: Record<string, string> = {}) {
  return { Authorization: 'Bearer test-token', ...extra };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('desktop API', () => {
  it('bootstraps, stores workspace assets, and serves exported archives', async () => {
    const { baseUrl } = await startDesktopServer();
    const bootstrap = await realFetch(`${baseUrl}/v1/bootstrap`, { headers: headers() });
    await expect(bootstrap.json()).resolves.toMatchObject({ firstRun: true });

    const canvasResponse = await realFetch(`${baseUrl}/v1/workspace/canvas`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        schemaVersion: 1,
        canvasW: 1024,
        canvasH: 1024,
        boxes: [{ id: 'box_1', imageDataUrl: 'data:image/png;base64,AQID' }],
        canvasBackgroundUrl: null,
      }),
    });
    expect(canvasResponse.status).toBe(200);

    const after = await realFetch(`${baseUrl}/v1/bootstrap`, { headers: headers() });
    const data = await after.json() as { canvas: { boxes: Array<{ imageDataUrl: string }> } };
    expect(data.canvas.boxes[0].imageDataUrl).toMatch(/^\/v1\/assets\/asset_/);
    const assetUrl = `${baseUrl}${data.canvas.boxes[0].imageDataUrl}`;
    const asset = await realFetch(assetUrl, { headers: headers() });
    expect(asset.status).toBe(200);
    expect(Buffer.from(await asset.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
    const queryTokenAsset = await realFetch(`${assetUrl}?token=test-token`);
    expect(queryTokenAsset.status).toBe(200);

    const exported = await realFetch(`${baseUrl}/v1/workspace/export`, { headers: headers() });
    expect(exported.status).toBe(200);
    expect(Buffer.from(await exported.arrayBuffer()).subarray(0, 2).toString()).toBe('PK');
    const archived = Buffer.from(await (await realFetch(`${baseUrl}/v1/workspace/export`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ localStorage: { 'ideogram4-lang': 'zh' } }),
    })).arrayBuffer());
    const files = unzipSync(archived);
    expect(JSON.parse(strFromU8(files['manifest.json'])).modules.localStorage).toEqual({ 'ideogram4-lang': 'zh' });
  });

  it('manages providers without returning API keys', async () => {
    const { baseUrl } = await startDesktopServer();
    const saved = await realFetch(`${baseUrl}/v1/providers/openai`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name: 'OpenAI',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-5.1'],
        apiKey: 'provider-secret',
      }),
    });
    expect(saved.status).toBe(200);
    const savedText = await saved.text();
    expect(savedText).not.toContain('provider-secret');
    expect(JSON.parse(savedText)).toMatchObject({ id: 'openai', hasApiKey: true });

    const listed = await realFetch(`${baseUrl}/v1/providers`, { headers: headers() });
    const listedText = await listed.text();
    expect(listedText).not.toContain('provider-secret');
    expect(JSON.parse(listedText).providers[0]).toMatchObject({ id: 'openai', hasApiKey: true });
  });

  it('serves the built renderer from the same origin', async () => {
    const { baseUrl } = await startDesktopServer();
    const response = await realFetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('desktop shell');
    const traversal = await realFetch(`${baseUrl}/%2e%2e%2fpackage.json`);
    expect(traversal.status).toBe(403);
  });

  it('round-trips a workspace archive through import and export', async () => {
    const { baseUrl } = await startDesktopServer();
    await realFetch(`${baseUrl}/v1/workspace/canvas`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ schemaVersion: 1, boxes: [{ id: 'box_original' }] }),
    });
    const exported = Buffer.from(await (await realFetch(`${baseUrl}/v1/workspace/export`, { headers: headers() })).arrayBuffer());
    await realFetch(`${baseUrl}/v1/workspace/canvas`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ schemaVersion: 1, boxes: [] }),
    });
    const imported = await realFetch(`${baseUrl}/v1/workspace/import`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/zip' }),
      body: exported,
    });
    expect(imported.status).toBe(200);
    const after = await (await realFetch(`${baseUrl}/v1/bootstrap`, { headers: headers() })).json() as {
      canvas: { boxes: Array<{ id: string }> };
    };
    expect(after.canvas.boxes[0].id).toBe('box_original');
  });

  it('proxies ComfyUI prompt, history, and image requests through the backend setting', async () => {
    const upstream = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/prompt')) return new Response(JSON.stringify({ prompt_id: 'prompt-1' }), { status: 200 });
      if (url.includes('/history/prompt-1')) return new Response(JSON.stringify({ 'prompt-1': { outputs: {} } }), { status: 200 });
      if (url.includes('/view?')) return new Response(Uint8Array.from([9, 8, 7]), { status: 200, headers: { 'content-type': 'image/png' } });
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    vi.stubGlobal('fetch', upstream);
    const { baseUrl } = await startDesktopServer();
    await realFetch(`${baseUrl}/v1/settings`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ comfyuiUrl: 'https://comfy.example' }),
    });

    const prompt = await realFetch(`${baseUrl}/v1/comfyui/prompt`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prompt: { node: {} } }),
    });
    expect(await prompt.json()).toEqual({ prompt_id: 'prompt-1' });
    const history = await realFetch(`${baseUrl}/v1/comfyui/history/prompt-1`, { headers: headers() });
    expect(await history.json()).toEqual({ 'prompt-1': { outputs: {} } });
    const image = await realFetch(`${baseUrl}/v1/comfyui/view?filename=a.png&subfolder=&type=output`, { headers: headers() });
    expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from([9, 8, 7]));
  });
});
