import type { PricerApi, SessionState } from '../shared/api';
import type { AppSettings, PricedItem } from '../shared/types';
import { demoItems, demoValue } from '../core/demo';
import { sessionSummary } from '../core/extras/history';
import { toCsv } from '../core/extras/csv';
import { upgradeProfile } from '../core/config';
import { craftReport, demoCraftPricer } from '../core/craft/advisor';
import { demoCharacter, demoCharacters } from '../core/character';

/** Used when the UI runs in a normal browser (design preview, screenshots). */
export function browserMockApi(): PricerApi {
  let settings: AppSettings = { activeProfileId: null, profiles: [] };
  try {
    const raw = localStorage.getItem('pricer-settings');
    if (raw) {
      settings = JSON.parse(raw);
      settings.profiles = settings.profiles.map(upgradeProfile);
    }
  } catch { /* storage unavailable */ }
  let items: PricedItem[] = [];
  let session: SessionState = { summary: sessionSummary([], new Date().toISOString()), value: [], divineRate: null };
  const itemListeners = new Set<(i: PricedItem[]) => void>();
  const sessionListeners = new Set<(s: SessionState) => void>();
  const statusListeners = new Set<(s: { text: string; error?: boolean }) => void>();

  return {
    async getSettings() { return settings; },
    async saveSettings(s) {
      settings = s;
      try { localStorage.setItem('pricer-settings', JSON.stringify(s)); } catch { /* ignore */ }
    },
    async listLeagues() {
      return [
        { id: 'Covens', name: 'Covens', hardcore: false, current: true },
        { id: 'Hardcore Covens', name: 'Hardcore Covens', hardcore: true, current: true },
        { id: 'Standard', name: 'Standard', hardcore: false, current: false },
        { id: 'Hardcore', name: 'Hardcore', hardcore: true, current: false },
      ];
    },
    async start() {
      items = demoItems();
      const startedAt = new Date(Date.now() - 45 * 60_000).toISOString();
      session = { summary: sessionSummary(items, startedAt), value: demoValue(items), divineRate: 180 };
      itemListeners.forEach((l) => l(items));
      sessionListeners.forEach((l) => l(session));
      statusListeners.forEach((l) => l({ text: 'Podgląd w przeglądarce – przykładowe przedmioty' }));
      return { league: 'Covens', divineRate: 180 };
    },
    async stop() {},
    async listCharacters() { return demoCharacters(); },
    async character(name, prices) {
      const view = demoCharacter(name);
      if (prices) [...view.items, ...view.jewels].forEach((e, i) => { e.price = { itemId: e.item.id, source: 'trade', chaos: 20 + ((i * 37) % 160), low: null, high: null, confidence: 'medium', sampleSize: 6, note: 'demo' }; });
      return view;
    },
    async reprice(ids) {
      items = items.map((p) => (!ids || ids.includes(p.item.id) ? { ...p, pricedAt: new Date().toISOString() } : p));
      itemListeners.forEach((l) => l(items));
      return { queued: ids?.length ?? items.length };
    },
    async craftAdvice(id) {
      const found = items.find((p) => p.item.id === id);
      if (!found) throw new Error('Nie znaleziono przedmiotu.');
      return craftReport(found.item, found.price.chaos, demoCraftPricer(found.price.chaos, session.divineRate));
    },
    async getItems() { return items; },
    async getSession() { return session; },
    async resetSession() {
      session = { ...session, summary: sessionSummary(items, new Date().toISOString()) };
      sessionListeners.forEach((l) => l(session));
    },
    async exportCsv() {
      const blob = new Blob([toCsv(items, session.divineRate)], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wycena.csv';
      a.click();
      return 'wycena.csv';
    },
    async testDiscord() {},
    async openExternal(url) { window.open(url, '_blank'); },
    onItems(cb) { itemListeners.add(cb); return () => { itemListeners.delete(cb); }; },
    onSession(cb) { sessionListeners.add(cb); return () => { sessionListeners.delete(cb); }; },
    onStatus(cb) { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; },
  };
}
