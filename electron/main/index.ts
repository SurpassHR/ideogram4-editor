import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createGatewayServer } from '../../server/server.ts';
import { loadGatewayConfig, type GatewayConfig } from '../../server/config.ts';
import { DesktopDataStore, type SecretStorage } from '../../server/desktop-store.ts';
import { DesktopService } from '../../server/desktop-service.ts';
import type { DesktopBridge } from '../../shared/desktop-contract.ts';

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const isHeadlessTest = process.env.IDEOGRAM4_TEST_HEADLESS === '1';
const configuredPort = Number(process.env.IDEOGRAM4_BACKEND_PORT ?? (isDev ? 0 : 47821));
let mainWindow: BrowserWindow | null = null;
let apiServer: ReturnType<typeof createGatewayServer> | null = null;
let bridge: DesktopBridge | null = null;

if (process.env.IDEOGRAM4_USER_DATA_DIR) {
  app.setPath('userData', process.env.IDEOGRAM4_USER_DATA_DIR);
}
if (isHeadlessTest) {
  app.dock?.hide();
}

function platformName(): DesktopBridge['platform'] {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

function createSecretStorage(): SecretStorage {
  return {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: plainText => safeStorage.encryptString(plainText).toString('base64'),
    decrypt: cipherText => safeStorage.decryptString(Buffer.from(cipherText, 'base64')),
  };
}

async function startBackend(): Promise<void> {
  const dataDir = join(app.getPath('userData'), 'data');
  const store = new DesktopDataStore({ dataDir, secretStorage: createSecretStorage() });
  await store.init();
  const desktop = new DesktopService(store);

  const token = randomBytes(32).toString('hex');
  const config: GatewayConfig = {
    ...loadGatewayConfig({}),
    host: '127.0.0.1',
    // A stable production origin keeps localStorage-backed UI preferences
    // (presets, skills, shortcuts marker) across launches.
    port: Number.isFinite(configuredPort) && configuredPort >= 0 ? configuredPort : 47821,
    authToken: token,
    allowedOrigins: isDev
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : [],
    providers: await store.getProviderConfigs(),
  };
  const staticDir = isDev ? undefined : join(__dirname, '../renderer');
  apiServer = createGatewayServer(config, { desktop, staticDir });
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('error', reject);
    apiServer!.listen(config.port, '127.0.0.1', () => resolve());
  });
  const address = apiServer.address() as AddressInfo;
  const apiBaseUrl = `http://127.0.0.1:${address.port}`;
  config.allowedOrigins = isDev
    ? ['http://localhost:5173', 'http://127.0.0.1:5173']
    : [apiBaseUrl];

  bridge = {
    apiBaseUrl,
    apiToken: token,
    platform: platformName(),
    appVersion: app.getVersion(),
    dataDir,
  };

  ipcMain.on('desktop:bridge-sync', event => {
    event.returnValue = bridge;
  });
  ipcMain.handle('desktop:open-data-dir', async () => {
    await shell.openPath(dataDir);
  });
  ipcMain.handle('desktop:open-logs', async () => {
    await shell.openPath(app.getPath('logs'));
  });
}

function createWindow(): void {
  if (!bridge) throw new Error('Desktop backend is not ready');
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#101010',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  if (!isHeadlessTest) window.once('ready-to-show', () => window.show());
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });

  const allowedOrigin = new URL(bridge.apiBaseUrl).origin;
  const devOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : '';
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const url = new URL(targetUrl);
    if (url.origin === allowedOrigin || (devOrigin && url.origin === devOrigin)) return;
    event.preventDefault();
    if (url.protocol === 'http:' || url.protocol === 'https:') void shell.openExternal(targetUrl);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  void window.loadURL(devUrl || `${bridge.apiBaseUrl}/`);
}

async function shutdown(): Promise<void> {
  if (!apiServer) return;
  const server = apiServer;
  apiServer = null;
  await new Promise<void>(resolve => server.close(() => resolve()));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
      createWindow();
    } catch (error) {
      console.error('Failed to start desktop backend', error);
      dialog.showErrorBox(
        'Ideogram4 Editor could not start',
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    }
  }).catch(error => {
    console.error(error);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && bridge) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => { void shutdown(); });
}
