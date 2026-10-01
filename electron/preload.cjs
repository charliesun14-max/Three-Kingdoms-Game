// The small API the game sees when it runs as the desktop app (window.desktop).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openAssetsFolder: () => ipcRenderer.invoke('tk:openAssets'),
  assetInfo: () => ipcRenderer.invoke('tk:assetInfo'),
  toggleFullscreen: () => ipcRenderer.invoke('tk:fullscreen'),
  quit: () => ipcRenderer.invoke('tk:quit'),
});
