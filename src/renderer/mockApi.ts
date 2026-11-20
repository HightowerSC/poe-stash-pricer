import type { PricerApi } from '../shared/api';
import type { AppSettings, PricedItem } from '../shared/types';
import { sampleItems } from '../core/sampleItems';

/** Used when the UI runs in a normal browser (design preview, screenshots). */
export function browserMockApi(): PricerApi {
  let settings: AppSettings = { activeProfileId: null, profiles: [] };
  try {
    const raw = localStorage.getItem('pricer-settings');
    if (raw) settings = JSON.parse(raw);
  } catch { /* storage unavailable */ }
  let items: PricedItem[] = [];
  const itemListeners = new Set<(i: PricedItem[]) => void>();
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
      items = sampleItems();
      itemListeners.forEach((l) => l(items));
      statusListeners.forEach((l) => l({ text: 'Podgląd w przeglądarce – przykładowe przedmioty' }));
      return { league: 'Covens', divineRate: 180 };
    },
    async stop() {},
    async getItems() { return items; },
    async openExternal(url) { window.open(url, '_blank'); },
    onItems(cb) { itemListeners.add(cb); return () => itemListeners.delete(cb); },
    onStatus(cb) { statusListeners.add(cb); return () => statusListeners.delete(cb); },
  };
}
