// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopDataStore, type SecretStorage } from '../desktop-store.ts';

const tempDirs: string[] = [];

async function createStore() {
  const dataDir = await mkdtemp(join(tmpdir(), 'ideogram-desktop-'));
  tempDirs.push(dataDir);
  const secrets = new Map<string, string>();
  const secretStorage: SecretStorage = {
    isEncryptionAvailable: () => true,
    encrypt: plain => `enc:${Buffer.from(plain).toString('base64')}`,
    decrypt: cipher => Buffer.from(cipher.slice(4), 'base64').toString('utf8'),
  };
  void secrets;
  const store = new DesktopDataStore({ dataDir, secretStorage });
  await store.init();
  return { dataDir, store };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('DesktopDataStore', () => {
  it('persists workspace JSON atomically and reads it back', async () => {
    const { dataDir, store } = await createStore();
    await store.writeCanvas({ schemaVersion: 1, boxes: [{ id: 'box_1' }] });

    await expect(store.readCanvas()).resolves.toEqual({
      schemaVersion: 1,
      boxes: [{ id: 'box_1' }],
    });
    const raw = await readFile(join(dataDir, 'workspace', 'canvas.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ schemaVersion: 1, boxes: [{ id: 'box_1' }] });
  });

  it('stores provider keys encrypted and never returns plaintext summaries', async () => {
    const { dataDir, store } = await createStore();
    await store.upsertProvider('openai', {
      name: 'OpenAI',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-5.1'],
      apiKey: 'super-secret',
    });

    const summaries = await store.listProviders();
    expect(summaries).toEqual([{
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-5.1'],
      hasApiKey: true,
    }]);
    expect(JSON.stringify(summaries)).not.toContain('super-secret');
    expect(await store.getProviderConfigs()).toMatchObject([{ apiKey: 'super-secret' }]);
    const secrets = await readFile(join(dataDir, 'secrets.json'), 'utf8');
    expect(secrets).not.toContain('super-secret');
    expect(secrets).toContain('enc:');
  });

  it('stores binary assets with safe ids and rejects traversal', async () => {
    const { store } = await createStore();
    const asset = await store.putAsset(Buffer.from([1, 2, 3]), 'image/png');

    expect(asset.id).toMatch(/^asset_[a-f0-9-]+$/);
    await expect(store.readAsset(asset.id)).resolves.toMatchObject({
      mimeType: 'image/png',
      data: Buffer.from([1, 2, 3]),
    });
    await expect(store.readAsset('../../secrets.json')).rejects.toThrow('Invalid asset id');
  });
});
