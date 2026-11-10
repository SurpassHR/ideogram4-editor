import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
