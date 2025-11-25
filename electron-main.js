/* eslint-disable @typescript-eslint/no-var-requires */
// Electron main process entry (CommonJS)
const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    const devUrl = 'http://localhost:5173';
    win.loadURL(devUrl).catch((err) => {
      console.error('[Electron] Failed to load dev server at', devUrl, err);
    });
    try { win.webContents.openDevTools({ mode: 'detach' }); } catch {}
  } else {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    win.loadFile(indexPath).catch((err) => {
      console.error('[Electron] Failed to load index.html from dist:', indexPath, err);
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
