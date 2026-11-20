// Polls the account's stash tabs and prices the items not seen before.

import type { PoeItem, PriceEstimate, PricedItem, Profile } from '../shared/types';
import type { PricingEngine } from './engine';
import type { StashSource } from './stashSource';
import { tabFilter } from './config';
import { withTradePriority } from './tradeLimiter';

export interface WatcherEvents {
  onItems(items: PricedItem[]): void;
  onStatus(text: string): void;
  onError(text: string): void;
  /** Ids currently in the scanned tabs; complete=false when the list was cut off (trade search: 100 max). */
  onPresent?(ids: string[], complete: boolean, locations?: Map<string, import('../shared/types').ItemLocation>): void;
  /** Called when nothing is visible, to find out why (e.g. items are in another league). */
  onEmpty?(): Promise<string | null>;
  /** Items the user chose not to price (e.g. currency, uniques). Asked on every check, so a setting change works at once. */
  shouldSkip?(item: PoeItem): boolean;
}

/** How many new items to price per check, so one check never floods the trade site. */
const BATCH = 20;

export class StashWatcher {
  private seen = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private emptyHint: string | null | undefined;
  /** Items outside the chosen tabs: not fetched again during this run, but not remembered either. */
  private skippedThisRun = new Set<string>();

  constructor(
    private readonly profile: Profile,
    private readonly league: string,
    private readonly source: StashSource,
    private readonly engine: Pick<PricingEngine, 'refreshPrices' | 'price'>,
    private readonly events: WatcherEvents,
    seenIds: string[] = [],
  ) {
    seenIds.forEach((id) => this.seen.add(id));
  }

  start() {
    void this.tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  get seenIds() {
    return [...this.seen];
  }

  /** Forgets items, so they are priced again on a later check (e.g. after a skip option is turned off). */
  forget(ids: string[]) {
    ids.forEach((id) => this.seen.delete(id));
  }

  async tick() {
    try {
      this.events.onStatus(`Sprawdzam ${this.source.label}…`);
      await this.engine.refreshPrices();
      const scan = await this.source.scan();
      this.events.onPresent?.(scan.ids, scan.complete, scan.locations);
      const unseen = scan.ids.filter((id) => !this.seen.has(id) && !this.skippedThisRun.has(id));
      // Loading is cheap (the scan already has every item); only pricing costs requests, so the batch limit applies there.
      const loaded = await scan.load(unseen);
      const loadedIds = new Set(loaded.map((l) => l.item.id));
      // Skipped (other tab) ids are remembered for this run only, so they are not fetched again every check.
      unseen.forEach((id) => { if (!loadedIds.has(id)) this.skippedThisRun.add(id); });
      // Items skipped by type are not remembered as seen: turning the option off prices them on the next check.
      const wanted = loaded.filter((l) => !this.events.shouldSkip?.(l.item));
      const skippedByType = loaded.length - wanted.length;
      const batch = wanted.slice(0, BATCH);
      // Only priced items count as seen: items skipped by the tab filter come back when the filter changes.
      const priced: PricedItem[] = [];
      for (let i = 0; i < batch.length; i++) {
        const { item, location } = batch[i];
        this.seen.add(item.id);
        this.events.onStatus(`Wyceniam ${i + 1}/${batch.length}: ${item.name || item.typeLine || 'przedmiot'}…`);
        const now = new Date().toISOString();
        priced.push({ item, price: await this.safePrice(item), firstSeen: now, pricedAt: now, location, present: true });
        if (priced.length % 5 === 0) this.events.onItems(priced.splice(0));
      }
      if (priced.length) this.events.onItems(priced);
      if (scan.ids.length === 0 && this.emptyHint === undefined && this.events.onEmpty) this.emptyHint = await this.events.onEmpty();
      this.events.onStatus(this.describe(scan.total, Math.max(0, wanted.length - batch.length), this.skippedThisRun.size, scan.tabs, skippedByType));
    } catch (e) {
      console.error('Błąd sprawdzania zakładek:', e);
      this.events.onError(e instanceof Error ? e.message : String(e));
    } finally {
      this.timer = setTimeout(() => void this.tick(), this.profile.pollSeconds * 1000);
    }
  }

  /** One unusual item must never stop the rest from being priced. */
  private async safePrice(item: PoeItem): Promise<PriceEstimate> {
    try {
      return await withTradePriority('background', () => this.engine.price(item));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Błąd wyceny "${item.name || item.typeLine}":`, e);
      return { itemId: item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note: `Błąd wyceny: ${message}` };
    }
  }

  private describe(total: number, waiting: number, skipped: number, tabs: string[], skippedByType = 0): string {
    const time = new Date().toLocaleTimeString();
    if (total === 0) {
      const base = `${time} · Zakładki konta ${this.profile.accountName} w lidze ${this.league} są puste`
        + (this.profile.watchedTab ? ` (sprawdzane tylko: ${this.profile.watchedTab})` : '') + '.';
      return this.emptyHint ? `${base} ${this.emptyHint}` : base;
    }
    const parts = [`${time} · Widać ${total} Twoich przedmiotów (${this.source.label})`];
    if (waiting > 0) parts.push(`do wyceny w kolejnych sprawdzeniach: ${waiting}`);
    if (skippedByType > 0) parts.push(`niewyceniane wg ustawień (orby/unikaty): ${skippedByType}`);
    if (skipped > 0) {
      parts.push(`pominięto ${skipped} z innych zakładek (wybrane: „${tabFilter(this.profile.watchedTab).join('”, „')}”${tabs.length ? `, znalezione: ${tabs.map((t) => `„${t}”`).join(', ')}` : ''}) – wyczyść pole zakładki w profilu, żeby wyceniać wszystkie`);
    }
    return parts.join(' · ');
  }
}
