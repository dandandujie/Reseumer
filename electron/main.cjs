const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

const DEFAULT_DEV_URL = 'http://127.0.0.1:3000';
const DEFAULT_PROD_PORT = 3232;
const WINDOW_WIDTH = 1440;
const WINDOW_HEIGHT = 960;

let mainWindow = null;
let bundledServerUrlPromise = null;

function setDesktopEnv() {
  process.env.APP_NAME = process.env.APP_NAME || 'Reseumer';
  process.env.AUTH_ENABLED = process.env.AUTH_ENABLED ?? 'false';
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'reseumer-desktop-secret';
  process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
  process.env.SQLITE_PATH = process.env.SQLITE_PATH || path.join(app.getPath('userData'), 'reseumer.db');
  process.env.HOSTNAME = '127.0.0.1';
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  process.env.ELECTRON = 'true';
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function waitForUrl(targetUrl, timeoutMs = 60_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const ping = () => {
      const request = http.get(targetUrl, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${targetUrl}`));
          return;
        }

        setTimeout(ping, 500);
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${targetUrl}`));
          return;
        }

        setTimeout(ping, 500);
      });
    };

    ping();
  });
}

function findOpenPort(startPort = DEFAULT_PROD_PORT) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();

      server.once('error', (error) => {
        if (error && error.code === 'EADDRINUSE') {
          tryPort(port + 1);
          return;
        }

        reject(error);
      });

      server.once('listening', () => {
        server.close(() => resolve(port));
      });

      server.listen(port, '127.0.0.1');
    };

    tryPort(startPort);
  });
}

async function startBundledNextServer() {
  if (bundledServerUrlPromise) {
    return bundledServerUrlPromise;
  }

  bundledServerUrlPromise = (async () => {
    setDesktopEnv();

    const port = await findOpenPort();
    const standaloneDir = path.join(app.getAppPath(), '.next', 'standalone');
    const serverFile = path.join(standaloneDir, 'server.js');

    if (!fs.existsSync(serverFile)) {
      throw new Error(`Missing Next standalone server at ${serverFile}. Run "pnpm desktop:build" first.`);
    }

    process.env.NODE_ENV = 'production';
    process.env.PORT = String(port);
    process.chdir(standaloneDir);
    require(serverFile);

    const url = `http://127.0.0.1:${port}`;
    await waitForUrl(url);
    return url;
  })();

  return bundledServerUrlPromise;
}

function getBaseUrl() {
  return process.env.ELECTRON_RENDERER_URL || DEFAULT_DEV_URL;
}

function isInternalUrl(targetUrl, baseUrl) {
  try {
    const target = new URL(targetUrl);
    const base = new URL(baseUrl);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}

async function resolveAppUrl() {
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL;
  }

  if (!app.isPackaged) {
    return DEFAULT_DEV_URL;
  }

  return startBundledNextServer();
}

async function createMainWindow() {
  const appUrl = await resolveAppUrl();

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url, appUrl)) {
      return { action: 'allow' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url, appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(appUrl);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function registerIpc() {
  ipcMain.handle('desktop:get-info', () => ({
    isElectron: true,
    platform: process.platform,
    version: app.getVersion(),
  }));

  ipcMain.handle('desktop:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !url.trim()) {
      return false;
    }

    await shell.openExternal(url);
    return true;
  });
}

app.whenReady().then(async () => {
  try {
    setDesktopEnv();
    registerIpc();
    await createMainWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox('Reseumer desktop failed to start', message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
