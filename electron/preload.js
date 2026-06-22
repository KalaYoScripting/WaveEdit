const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('waveEdit', {
  openFileDialog: () => ipcRenderer.invoke('dialog:open'),
  saveFileDialog: (defaultName, extension) =>
    ipcRenderer.invoke('dialog:save', { defaultName, extension }),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:write', { filePath, data }),
  setDirty: (dirty) => ipcRenderer.send('app:set-dirty', dirty),
  readyToClose: () => ipcRenderer.send('app:ready-to-close'),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),
  onMenuAction: (callback) =>
    ipcRenderer.on('menu:action', (_e, action) => callback(action)),
  platform: process.platform,
});
