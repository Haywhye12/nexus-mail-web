const { app, BrowserWindow, Notification, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Nexus Mail - info@devgeeksnexus.com',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // Load the web app URL (either local dev or production deployment)
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Native Desktop Notifications for new incoming emails
ipcMain.on('notify-new-email', (event, { from, subject }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: `New Email: ${from}`,
      body: subject,
      silent: false,
    }).show();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
