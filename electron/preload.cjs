const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
});
