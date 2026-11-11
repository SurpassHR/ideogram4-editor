import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';

test('desktop app starts hidden, persists canvas, and keeps a stable local origin', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'ideogram4-e2e-'));
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null;
  const launch = () => electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IDEOGRAM4_USER_DATA_DIR: userData,
      IDEOGRAM4_TEST_HEADLESS: '1',
      IDEOGRAM4_BACKEND_PORT: '47831',
    },
    timeout: 30_000,
  });

  try {
    app = await launch();
    let page = await app.firstWindow();
    await page.locator('button', { hasText: 'Start Fresh' }).click();
    await page.locator('.desktop-welcome-overlay').waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    const canvas = page.locator('#canvas-wrapper');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 120, box!.y + 120);
    await page.mouse.down();
    await page.mouse.move(box!.x + 320, box!.y + 280, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.bounding-box:not(.drawing-ghost)')).toHaveCount(1);
    const firstOrigin = new URL(page.url()).origin;
    await page.waitForTimeout(900);
    await app.close();
    app = null;

    app = await launch();
    page = await app.firstWindow();
    await page.waitForSelector('#canvas-wrapper');
    await page.waitForTimeout(700);
    expect(new URL(page.url()).origin).toBe(firstOrigin);
    await expect(page.locator('.desktop-welcome-overlay')).toHaveCount(0);
    await expect(page.locator('.bounding-box:not(.drawing-ghost)')).toHaveCount(1);
  } finally {
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('canvas image assets load through the authenticated same-origin cookie', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'ideogram4-assets-e2e-'));
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null;
  try {
    app = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        IDEOGRAM4_USER_DATA_DIR: userData,
        IDEOGRAM4_TEST_HEADLESS: '1',
        IDEOGRAM4_BACKEND_PORT: '47831',
      },
      timeout: 30_000,
    });
    const page = await app.firstWindow();
    await page.locator('button', { hasText: 'Start Fresh' }).click();
    await page.locator('.desktop-welcome-overlay').waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
    const loaded = await page.evaluate(async imageDataUrl => {
      const desktop = window.desktop!;
      await fetch(`${desktop.apiBaseUrl}/v1/workspace/canvas`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${desktop.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          canvasW: 1024,
          canvasH: 1024,
          canvasRatio: '1:1',
          canvasScale: 4,
          canvasCustomW: 16,
          canvasCustomH: 9,
          globalPalette: [],
          highLevelDescription: '',
          aesthetics: '',
          lighting: '',
          medium: '',
          artStyle: '',
          background: '',
          photoArtStyleMode: 1,
          canvasBackgroundUrl: null,
          boxes: [{
            id: 'box_asset', x: 10, y: 10, w: 100, h: 100,
            mode: 'obj', text: '', desc: 'asset', colors: [], imageDataUrl, imageRole: 'reference',
          }],
        }),
      });
      const bootstrapResponse = await fetch(`${desktop.apiBaseUrl}/v1/bootstrap`, {
        headers: { Authorization: `Bearer ${desktop.apiToken}` },
      });
      const bootstrap = await bootstrapResponse.json() as {
        canvas: { boxes: Array<{ imageDataUrl: string }> };
      };
      const image = new Image();
      image.src = bootstrap.canvas.boxes[0].imageDataUrl.startsWith('http')
        ? bootstrap.canvas.boxes[0].imageDataUrl
        : `${desktop.apiBaseUrl}${bootstrap.canvas.boxes[0].imageDataUrl}`;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('asset image failed to load'));
      });
      return { width: image.naturalWidth, src: image.src };
    }, pixel);
    expect(loaded.width).toBeGreaterThan(0);
    expect(new URL(loaded.src).searchParams.get('token')).toBeNull();
  } finally {
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('first-run Web migration imports workspace and requires provider keys again', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'ideogram4-migration-e2e-'));
  const archivePath = join(userData, 'migration.zip');
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null;
  const manifest = {
    app: 'ideogram4-editor', schemaVersion: 2, kind: 'web-migration', exportedAt: Date.now(),
    modules: {
      canvas: {
        schemaVersion: 1, canvasW: 1024, canvasH: 1024, canvasRatio: '1:1', canvasScale: 4,
        canvasCustomW: 16, canvasCustomH: 9, globalPalette: [], highLevelDescription: '',
        aesthetics: '', lighting: '', medium: '', artStyle: '', background: '', photoArtStyleMode: 1,
        canvasBackgroundUrl: null,
        boxes: [{
          id: 'box_imported', x: 10, y: 10, w: 100, h: 100, mode: 'obj', text: '', desc: 'imported',
          colors: [], imageDataUrl: null, imageRole: 'both',
        }],
      },
      chat: null,
      favorites: [],
      settings: { comfyuiUrl: '', onboardingCompleted: false },
      providers: [{ id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5.1'] }],
      localStorage: { 'ideogram4-shortcuts-seen': '1' },
    },
    assets: [],
  };
  await writeFile(archivePath, zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) }));
  const launch = () => electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IDEOGRAM4_USER_DATA_DIR: userData,
      IDEOGRAM4_TEST_HEADLESS: '1',
      IDEOGRAM4_BACKEND_PORT: '47832',
    },
    timeout: 30_000,
  });

  try {
    app = await launch();
    let page = await app.firstWindow();
    page.on('dialog', dialog => void dialog.accept());
    await page.locator('.desktop-welcome-card input[type=file]').setInputFiles(archivePath);
    await page.locator('.desktop-welcome-overlay').waitFor({ state: 'hidden', timeout: 15_000 });
    await expect(page.locator('.bounding-box:not(.drawing-ghost)')).toHaveCount(1);
    const providers = await page.evaluate(async () => {
      const desktop = window.desktop!;
      return (await fetch(`${desktop.apiBaseUrl}/v1/providers`, {
        headers: { Authorization: `Bearer ${desktop.apiToken}` },
      })).json();
    }) as { providers: Array<{ hasApiKey: boolean }> };
    expect(providers.providers[0].hasApiKey).toBe(false);
    await app.close();
    app = null;

    app = await launch();
    page = await app.firstWindow();
    await page.waitForSelector('#canvas-wrapper');
    await expect(page.locator('.desktop-welcome-overlay')).toHaveCount(0);
    await expect(page.locator('.bounding-box:not(.drawing-ghost)')).toHaveCount(1);
  } finally {
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
