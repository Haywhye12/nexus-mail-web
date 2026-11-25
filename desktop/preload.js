const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  notifyNewEmail: (from, subject) => ipcRenderer.send('notify-new-email', { from, subject }),
});
