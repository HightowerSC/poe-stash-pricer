"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function listen(channel) {
    return (cb) => {
        const h = (_e, payload) => cb(payload);
        electron_1.ipcRenderer.on(channel, h);
        return () => {
            electron_1.ipcRenderer.removeListener(channel, h);
        };
    };
}
const api = {
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    saveSettings: (s) => electron_1.ipcRenderer.invoke('settings:save', s),
    listLeagues: () => electron_1.ipcRenderer.invoke('leagues:list'),
    start: (demo) => electron_1.ipcRenderer.invoke('watch:start', demo),
    stop: () => electron_1.ipcRenderer.invoke('watch:stop'),
    getItems: () => electron_1.ipcRenderer.invoke('items:get'),
    getSession: () => electron_1.ipcRenderer.invoke('session:get'),
    resetSession: () => electron_1.ipcRenderer.invoke('session:reset'),
    exportCsv: () => electron_1.ipcRenderer.invoke('export:csv'),
    testDiscord: (webhook) => electron_1.ipcRenderer.invoke('discord:test', webhook),
    openExternal: (url) => electron_1.ipcRenderer.invoke('open:external', url),
    onItems: listen('items'),
    onSession: listen('session'),
    onStatus: listen('status'),
};
electron_1.contextBridge.exposeInMainWorld('pricer', api);
