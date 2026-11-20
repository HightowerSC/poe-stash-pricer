// The bridge exposed by the preload script as window.pricer.

import type { AppSettings, League, PricedItem } from './types';

export interface PricerApi {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  listLeagues(): Promise<League[]>;
  /** Starts watching with the active profile. demo=true shows sample items without any network calls. */
  start(demo: boolean): Promise<{ league: string; divineRate: number | null }>;
  stop(): Promise<void>;
  getItems(): Promise<PricedItem[]>;
  openExternal(url: string): Promise<void>;
  onItems(cb: (items: PricedItem[]) => void): () => void;
  onStatus(cb: (status: { text: string; error?: boolean }) => void): () => void;
}

declare global {
  interface Window { pricer: PricerApi }
}
