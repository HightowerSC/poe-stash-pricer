// Polls the trade site for items in the user's public tabs and prices the ones not seen before.

import type { PricedItem, Profile } from '../shared/types';
import type { PricingEngine } from './engine';
import type { TradeClient } from './trade';

export interface WatcherEvents {
  onItems(items: PricedItem[]): void;
  onStatus(text: string): void;
  onError(text: string): void;
}

export class StashWatcher {
  private seen = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstRun = true;

  constructor(
    private readonly profile: Profile,
    private readonly league: string,
    private readonly trade: TradeClient,
    private readonly engine: PricingEngine,
    private readonly events: WatcherEvents,
    seenIds: string[] = [],
  ) {
    seenIds.forEach((id) => this.seen.add(id));
    this.firstRun = seenIds.length === 0;
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
      const fresh = search.result.filter((id) => !this.seen.has(id)).slice(0, 40);
      const listings = fresh.length ? await this.trade.fetch(fresh, search.id) : [];
      const priced: PricedItem[] = [];
      for (const l of listings) {
        this.seen.add(l.id);
        if (this.profile.watchedTab && l.listing?.stash?.name !== this.profile.watchedTab) continue;
        // On the very first run we only remember what is already there, so old items are not reported as new.
        if (this.firstRun) continue;
        priced.push({ item: l.item, price: await this.engine.price(l.item), firstSeen: new Date().toISOString() });
      }
      this.firstRun = false;
      if (priced.length) this.events.onItems(priced);
      this.events.onStatus(`Ostatnie sprawdzenie: ${new Date().toLocaleTimeString()} · nowych: ${priced.length}`);
    } catch (e) {
      this.events.onError(e instanceof Error ? e.message : String(e));
    } finally {
      this.timer = setTimeout(() => void this.tick(), this.profile.pollSeconds * 1000);
    }
  }
}
