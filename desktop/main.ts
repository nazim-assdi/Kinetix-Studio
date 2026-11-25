import { app, BrowserWindow, dialog, shell } from 'electron';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startServer } from '../server';

let localServer: Server | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;

async function createMainWindow(): Promise<void> {
  // Keep private API credentials in the per-user app data folder, not inside the installer.
  loadEnv({ path: path.join(app.getPath('userData'), '.env'), override: false });

  const rendererDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.resolve(process.cwd(), 'dist');

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
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
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
