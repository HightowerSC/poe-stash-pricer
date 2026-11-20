// The bridge exposed by the preload script as window.pricer.

import type { AppSettings, UpgradeResult, PriceCheck, CharacterSummary, CharacterView, CraftReport, League, PricedItem, PricePoint, SessionSummary } from './types';

export interface SessionState {
  summary: SessionSummary;
  /** Total value of tracked items over time. */
  value: PricePoint[];
  divineRate: number | null;
}

export interface FlipState { at: string | null; rows: import('./types').FlipRow[]; running: boolean }

export interface PricerApi {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  listLeagues(): Promise<League[]>;
  /** Starts watching with the active profile. demo=true shows sample items without any network calls. */
  start(demo: boolean): Promise<{ league: string; divineRate: number | null }>;
  stop(): Promise<void>;
  /** Doradca craftu: can a mod be added so the item sells for more? */
  craftAdvice(itemId: string): Promise<CraftReport>;
  /** Prices items again with the current market (all present items, or the given ids). */
  reprice(ids?: string[]): Promise<{ queued: number }>;
  /** PoE HUB: league challenge list (per league) and gear upgrade search for the opened character. */
  getChallenges(): Promise<import('../core/hub/challenges').Challenge[]>;
  saveChallenges(list: import('../core/hub/challenges').Challenge[]): Promise<import('../core/hub/challenges').Challenge[]>;
  upgradeSearch(slot: string): Promise<UpgradeResult>;
  getUpgradeWatch(): Promise<import('./types').UpgradeWatchState>;
  saveUpgradeWatch(s: import('./types').UpgradeWatchSettings): Promise<import('./types').UpgradeWatchState>;
  exportBackup(withSecrets: boolean): Promise<unknown>;
  importBackup(backup: unknown): Promise<{ profiles: number; files: number }>;
  getFlips(): Promise<FlipState>;
  getFarm(): Promise<import('./types').FarmState>;
  startFarm(strategy: string, costPerMap: number): Promise<import('./types').FarmState>;
  finishFarm(maps: number, extraChaos: number, notes: string): Promise<import('./types').FarmState>;
  cancelFarm(): Promise<import('./types').FarmState>;
  deleteFarmRun(id: string): Promise<import('./types').FarmState>;
  scanFlips(): Promise<FlipState>;
  runUpgradeWatch(): Promise<import('./types').UpgradeWatchState>;
  /** Prices an item from text copied in game with Ctrl+C. */
  checkText(text: string): Promise<PriceCheck>;
  getChecks(): Promise<PriceCheck[]>;
  onChecks(cb: (c: PriceCheck[]) => void): () => void;
  /** Forgets remembered stash items (current league, or all leagues); settings stay. */
  clearItems(all: boolean): Promise<{ removed: number }>;
  /** Characters of the account (public profile or POESESSID). */
  listCharacters(): Promise<CharacterSummary[]>;
  /** Gear, gems, jewels and stats of one character; prices=true also prices the gear. */
  character(name: string, prices?: boolean): Promise<CharacterView>;
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
