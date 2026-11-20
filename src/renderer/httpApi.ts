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
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export function httpApi(): PricerApi {
  const itemL = new Set<(i: PricedItem[]) => void>();
  const sessionL = new Set<(s: SessionState) => void>();
  const statusL = new Set<(s: { text: string; error?: boolean }) => void>();

  const events = new EventSource('/api/events');
  events.addEventListener('items', (e) => itemL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('session', (e) => sessionL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
  events.addEventListener('status', (e) => statusL.forEach((l) => l(JSON.parse((e as MessageEvent).data))));
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
  };
}
