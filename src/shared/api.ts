// The bridge exposed by the preload script as window.pricer.

import type { AppSettings, CraftReport, League, PricedItem, PricePoint, SessionSummary } from './types';

export interface SessionState {
  summary: SessionSummary;
  /** Total value of tracked items over time. */
  value: PricePoint[];
  divineRate: number | null;
}

export interface PricerApi {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  listLeagues(): Promise<League[]>;
  /** Starts watching with the active profile. demo=true shows sample items without any network calls. */
  start(demo: boolean): Promise<{ league: string; divineRate: number | null }>;
  stop(): Promise<void>;
  /** Doradca craftu: can a mod be added so the item sells for more? */
  craftAdvice(itemId: string): Promise<CraftReport>;
  getItems(): Promise<PricedItem[]>;
  getSession(): Promise<SessionState>;
  resetSession(): Promise<void>;
  exportCsv(): Promise<string | null>;
  testDiscord(webhook: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  onItems(cb: (items: PricedItem[]) => void): () => void;
  onSession(cb: (s: SessionState) => void): () => void;
  onStatus(cb: (status: { text: string; error?: boolean }) => void): () => void;
}

declare global {
  interface Window { pricer: PricerApi }
}
