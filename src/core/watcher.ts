// Polls the trade site for items in the user's public tabs and prices the ones not seen before.

import type { PricedItem, Profile } from '../shared/types';
import type { PricingEngine } from './engine';
import type { TradeClient } from './trade';

export interface WatcherEvents {
  onItems(items: PricedItem[]): void;
  onStatus(text: string): void;
  onError(text: string): void;
}

/** How many new items to fetch and price per check. */
const BATCH = 20;

export class StashWatcher {
  private seen = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly profile: Profile,
    private readonly league: string,
    private readonly trade: TradeClient,
    private readonly engine: PricingEngine,
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

  async tick() {
    try {
      this.events.onStatus('Sprawdzam publiczne zakładki…');
      await this.engine.refreshPrices();
      const search = await this.trade.searchAccountItems(this.league, this.profile.accountName, this.profile.realm);
      const unseen = search.result.filter((id) => !this.seen.has(id));
      // Price in batches so one check never floods the trade site; the rest waits for the next check.
      const batch = unseen.slice(0, BATCH);
      const listings = batch.length ? await this.trade.fetch(batch, search.id) : [];
      const priced: PricedItem[] = [];
      const tabs = new Set<string>();
      let otherTab = 0;
      for (let i = 0; i < listings.length; i++) {
        const l = listings[i];
        this.seen.add(l.id);
        const tab = l.listing?.stash?.name ?? '';
        tabs.add(tab);
        if (this.profile.watchedTab && tab.toLowerCase() !== this.profile.watchedTab.toLowerCase()) {
          otherTab++;
          continue;
        }
        this.events.onStatus(`Wyceniam ${i + 1}/${listings.length}: ${l.item?.name || l.item?.typeLine || 'przedmiot'}…`);
        priced.push({ item: l.item, price: await this.engine.price(l.item), firstSeen: new Date().toISOString() });
        if (priced.length % 5 === 0) {
          this.events.onItems(priced.splice(0));
        }
      }
      if (priced.length) this.events.onItems(priced);
      this.events.onStatus(this.describe(search.total, unseen.length - batch.length, otherTab, tabs));
    } catch (e) {
      this.events.onError(e instanceof Error ? e.message : String(e));
    } finally {
      this.timer = setTimeout(() => void this.tick(), this.profile.pollSeconds * 1000);
    }
  }

  private describe(total: number, waiting: number, otherTab: number, tabs: Set<string>): string {
    const time = new Date().toLocaleTimeString();
    if (total === 0) {
      return `${time} · Nie znaleziono żadnych przedmiotów konta ${this.profile.accountName} w lidze ${this.league}. `
        + 'Ustaw w grze zakładkę jako „Public” (bez ceny) – przedmioty pojawiają się na trade po ok. 5 minutach.';
    }
    const parts = [`${time} · Na trade widać ${total} Twoich przedmiotów`];
    if (waiting > 0) parts.push(`do wyceny w kolejnych sprawdzeniach: ${waiting}`);
    if (otherTab > 0) {
      parts.push(`pominięto ${otherTab} z innych zakładek (obserwowana: „${this.profile.watchedTab}”, znalezione: ${[...tabs].map((t) => `„${t}”`).join(', ')})`);
    }
    return parts.join(' · ');
  }
}
