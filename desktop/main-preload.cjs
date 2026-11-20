// Bridge for the main window: shortcut settings and program updates (see src/shared/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (cb) => {
  const fn = (_e, s) => cb(s);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

const info = ipcRenderer.sendSync('desktop:info') || {};

contextBridge.exposeInMainWorld('desktop', {
  version: info.version || '',
  platform: info.platform || process.platform,
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  setShortcut: (action, accelerator) => ipcRenderer.invoke('shortcuts:set', action, accelerator),
  resetShortcuts: () => ipcRenderer.invoke('shortcuts:reset'),
  pauseShortcuts: (paused) => ipcRenderer.invoke('shortcuts:pause', !!paused),
  setClipWatch: (on) => ipcRenderer.invoke('shortcuts:clipwatch', !!on),
  onShortcuts: listen('shortcuts:state'),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  setAutoDownload: (on) => ipcRenderer.invoke('update:auto', !!on),
  dismissUpdated: () => ipcRenderer.invoke('update:dismiss'),
  openReleases: () => ipcRenderer.invoke('update:releases'),
  onUpdate: listen('update:state'),
  onOpenSettings: listen('desktop:open-settings'),
});
