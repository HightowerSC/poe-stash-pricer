import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { PricerApi } from '../shared/api';

function listen(channel: string) {
  return (cb: (payload: any) => void) => {
    const h = (_e: IpcRendererEvent, payload: any) => cb(payload);
    ipcRenderer.on(channel, h);
    return () => {
      ipcRenderer.removeListener(channel, h);
    };
  };
}

const api: PricerApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  listLeagues: () => ipcRenderer.invoke('leagues:list'),
  start: (demo) => ipcRenderer.invoke('watch:start', demo),
  stop: () => ipcRenderer.invoke('watch:stop'),
  getItems: () => ipcRenderer.invoke('items:get'),
  getSession: () => ipcRenderer.invoke('session:get'),
  resetSession: () => ipcRenderer.invoke('session:reset'),
  exportCsv: () => ipcRenderer.invoke('export:csv'),
  testDiscord: (webhook) => ipcRenderer.invoke('discord:test', webhook),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onItems: listen('items'),
  onSession: listen('session'),
  onStatus: listen('status'),
};

contextBridge.exposeInMainWorld('pricer', api);
