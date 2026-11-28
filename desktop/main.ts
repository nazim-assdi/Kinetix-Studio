import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startServer } from '../server';

let localServer: Server | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
let envGeminiApiKey = '';

const encryptedGeminiKeyPath = () => path.join(app.getPath('userData'), 'gemini-api-key.bin');

ipcMain.handle('kinetix:has-gemini-key', async () => {
  if (process.env.GEMINI_API_KEY?.trim()) return true;
  try {
    await readFile(encryptedGeminiKeyPath());
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('kinetix:save-gemini-key', async (_event, value: unknown) => {
  if (typeof value !== 'string' || value.trim().length < 10 || value.length > 512) {
    throw new Error('Enter a valid Gemini API key.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable. Restart the app and try again.');
  }
  const key = value.trim();
  const filePath = encryptedGeminiKeyPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, safeStorage.encryptString(key));
  process.env.GEMINI_API_KEY = key;
  return true;
});

ipcMain.handle('kinetix:remove-gemini-key', async () => {
  try {
    await unlink(encryptedGeminiKeyPath());
  } catch {
    // Removing an already absent local key is safe.
  }
  if (envGeminiApiKey) process.env.GEMINI_API_KEY = envGeminiApiKey;
  else delete process.env.GEMINI_API_KEY;
  return true;
});

async function createMainWindow(): Promise<void> {
  // Keep private API credentials in the per-user app data folder, not inside the installer.
  loadEnv({ path: path.join(app.getPath('userData'), '.env'), override: false });
  envGeminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encryptedKey = await readFile(encryptedGeminiKeyPath());
      process.env.GEMINI_API_KEY = safeStorage.decryptString(encryptedKey);
    } catch {
      // No locally saved key yet (or an invalid encrypted file); use the .env key if present.
      if (envGeminiApiKey) process.env.GEMINI_API_KEY = envGeminiApiKey;
    }
  }

  const rendererDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.resolve(process.cwd(), 'dist');
  const desktopIconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'kinetix-icon.png')
    : path.resolve(process.cwd(), 'public', 'kinetix-icon.png');

  localServer = await startServer({
    port: 0,
    host: '127.0.0.1',
    staticDirectory: rendererDirectory,
    useVite: !app.isPackaged,
  });

  const address = localServer.address() as AddressInfo | null;
  if (!address || typeof address.port !== 'number') {
    throw new Error('Kinetix Studio local server did not provide a valid port.');
  }
  const appUrl = `http://127.0.0.1:${address.port}`;

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#111215',
    icon: desktopIconPath,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith(appUrl)) event.preventDefault();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(appUrl);
}

app.whenReady().then(async () => {
  try {
    app.setAppUserModelId('com.ntech.kinetixstudio');
    await createMainWindow();
  } catch (error) {
    console.error('Kinetix Studio desktop startup failed:', error);
    dialog.showErrorBox('Kinetix Studio could not start', error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !quitting) {
    void createMainWindow().catch((error) => {
      console.error('Could not reopen Kinetix Studio:', error);
    });
  }
});

app.on('before-quit', () => {
  quitting = true;
  localServer?.close();
  localServer = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
