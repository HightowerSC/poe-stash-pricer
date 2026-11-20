const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onState: (cb) => ipcRenderer.on('overlay:state', (_e, s) => cb(s)),
  setGrid: (rect) => ipcRenderer.send('overlay:grid', rect),
  done: () => ipcRenderer.send('overlay:calibrated'),
  resetGrid: () => ipcRenderer.send('overlay:reset-grid'),
});
