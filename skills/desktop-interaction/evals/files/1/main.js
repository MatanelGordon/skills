const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let mainWindow = null;

function createSplashWindow() {
  const splash = new BrowserWindow({ width: 360, height: 240, frame: false, resizable: false });
  splash.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  return splash;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Notes',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  // The page's <title> stays "Notes". The title bar text is set from this file only.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return mainWindow;
}

app.whenReady().then(() => {
  const splash = createSplashWindow();
  const win = createMainWindow();
  win.once('ready-to-show', () => {
    splash.close();
    win.show();
  });
});

// Sent by the renderer (through preload.js) after the user picks a workspace.
ipcMain.on('workspace:switched', (_event, workspace) => {
  mainWindow.setTitle(`${workspace.accountName} · ${workspace.name} · Notes`);
});

app.on('window-all-closed', () => app.quit());
