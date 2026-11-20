import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { PricerApi } from '../shared/api';

const api: PricerApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  listLeagues: () => ipcRenderer.invoke('leagues:list'),
  start: (demo) => ipcRenderer.invoke('watch:start', demo),
  stop: () => ipcRenderer.invoke('watch:stop'),
  getItems: () => ipcRenderer.invoke('items:get'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onItems: (cb) => {
    const h = (_e: IpcRendererEvent, items: any) => cb(items);
    ipcRenderer.on('items', h);
    return () => ipcRenderer.removeListener('items', h);
  },
  onStatus: (cb) => {
    const h = (_e: IpcRendererEvent, s: any) => cb(s);
    ipcRenderer.on('status', h);
    return () => ipcRenderer.removeListener('status', h);
  },
};

contextBridge.exposeInMainWorld('pricer', api);
