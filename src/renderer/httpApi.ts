// Bridge to the local server (src/server/server.ts) over HTTP + Server-Sent Events.

import type { PricerApi, SessionState } from '../shared/api';
import type { PricedItem } from '../shared/types';

async function call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function serverAvailable(): Promise<boolean> {
  return (await serverState()) !== 'none';
}

/** 'ok' = full app, 'readonly' = phone preview, 'pin' = phone preview waiting for the PIN, 'none' = no server. */
export async function serverState(): Promise<'ok' | 'readonly' | 'pin' | 'none'> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.status === 401) return 'pin';
    if (!res.ok) return 'none';
    const body = await res.json().catch(() => ({}));
    return body?.readonly ? 'readonly' : 'ok';
  } catch {
    return 'none';
  }
}

export async function lanLogin(pin: string): Promise<void> {
  await call('POST', '/api/lan/login', { pin });
}

export function httpApi(): PricerApi {
  const itemL = new Set<(i: PricedItem[]) => void>();
  const sessionL = new Set<(s: SessionState) => void>();
  const checksL = new Set<(c: any[]) => void>();
  const statusL = new Set<(s: { text: string; error?: boolean }) => void>();
  const limitL = new Set<(s: { waitSeconds: number; queued: number; lastHour?: number }) => void>();

  const events = new EventSource('/api/events');
  events.addEventListener('items', (e) => itemL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('session', (e) => sessionL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('checks', (e) => checksL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('status', (e) => statusL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('tradeLimit', (e) => limitL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('notify', (e) => {
    const n = JSON.parse((e as MessageEvent).data) as { title: string; body: string };
    if ('Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
  });
  events.onerror = () => statusL.forEach((l) => l({ text: 'Brak połączenia z serwerem aplikacji – czy okno terminala jest otwarte?', error: true }));

  return {
    getSettings: () => call('GET', '/api/settings'),
    saveSettings: (s) => call('POST', '/api/settings', s),
    listLeagues: () => call('GET', '/api/leagues'),
    start: (demo) => {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      return call('POST', '/api/start', { demo });
    },
    stop: () => call('POST', '/api/stop', {}),
    craftAdvice: (id) => call('POST', '/api/craft', { id }),
    reprice: (ids) => call('POST', '/api/reprice', { ids }),
    getChallenges: () => call('GET', '/api/challenges'),
    saveChallenges: (list) => call('POST', '/api/challenges', { list }),
    syncChallenges: (force) => call('POST', '/api/challenges/sync', { force }),
    upgradeSearch: (slot) => call('POST', '/api/upgrade', { slot }),
    getUpgradeWatch: () => call('GET', '/api/upgrade-watch'),
    saveUpgradeWatch: (settings) => call('POST', '/api/upgrade-watch', { settings }),
    exportBackup: (withSecrets) => call('POST', '/api/backup/export', { withSecrets }),
    importBackup: (backup) => call('POST', '/api/backup/import', { backup }),
    getLan: () => call('GET', '/api/lan'),
    saveLan: (cfg) => call('POST', '/api/lan', cfg),
    pobShopping: (input) => call('POST', '/api/pob', { input }),
    getFarm: () => call('GET', '/api/farm'),
    startFarm: (strategy, costPerMap) => call('POST', '/api/farm/start', { strategy, costPerMap }),
    finishFarm: (maps, extraChaos, notes) => call('POST', '/api/farm/finish', { maps, extraChaos, notes }),
    cancelFarm: () => call('POST', '/api/farm/cancel'),
    deleteFarmRun: (id) => call('POST', '/api/farm/delete', { id }),
    getFlips: () => call('GET', '/api/flip'),
    scanFlips: () => call('POST', '/api/flip/scan'),
    runUpgradeWatch: () => call('POST', '/api/upgrade-watch/run'),
    checkText: (text) => call('POST', '/api/check', { text }),
    getChecks: () => call('GET', '/api/checks'),
    onChecks(cb) { checksL.add(cb); return () => { checksL.delete(cb); }; },
    clearItems: (all) => call('POST', '/api/items/clear', { all }),
    listCharacters: () => call('GET', '/api/characters'),
    character: (name, prices) => call('POST', '/api/character', { name, prices: !!prices }),
    getItems: () => call('GET', '/api/items'),
    getSession: () => call('GET', '/api/session'),
    resetSession: () => call('POST', '/api/session/reset', {}),
    async exportCsv() {
      const a = document.createElement('a');
      a.href = '/api/export.csv';
      a.click();
      return 'pobieranie pliku CSV';
    },
    testDiscord: (webhook) => call('POST', '/api/discord/test', { webhook }),
    async openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
    onItems(cb) { itemL.add(cb); return () => { itemL.delete(cb); }; },
    onSession(cb) { sessionL.add(cb); return () => { sessionL.delete(cb); }; },
    onStatus(cb) { statusL.add(cb); return () => { statusL.delete(cb); }; },
    onTradeLimit(cb) { limitL.add(cb); return () => { limitL.delete(cb); }; },
  };
}
