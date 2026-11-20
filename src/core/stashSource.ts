// Where the watcher gets the account's items from.
//  - PublicTabsSource: public stash tabs, found with a trade search by account name (no login needed).
//  - SessionTabsSource: all stash tabs, also private, from the legacy stash API with POESESSID.

import type { ItemLocation, PoeItem, Profile } from '../shared/types';
import { tabFilter } from './config';
import { listingLocation, normalizeItem } from './normalize';
import { sleep } from './http';
import type { TradeClient } from './trade';

export interface ScanResult {
  /** Ids of the items currently in the scanned tabs. */
  ids: string[];
  /** true when ids is the full list (the trade search stops at 100). */
  complete: boolean;
  total: number;
  /** Names of the tabs seen in this scan (the public source fills it in load()). */
  tabs: string[];
  /** Loads the given ids (only the ones not priced yet). */
  load(ids: string[]): Promise<{ item: PoeItem; location?: ItemLocation }[]>;
}

export interface StashSource {
  readonly label: string;
  scan(): Promise<ScanResult>;
}

const wanted = (profile: Profile, tab: string) => {
  const f = tabFilter(profile.watchedTab);
  return f.length === 0 || f.includes(tab.toLowerCase());
};

export class PublicTabsSource implements StashSource {
  readonly label = 'publiczne zakładki';

  constructor(private readonly profile: Profile, private readonly league: string, private readonly trade: TradeClient) {}

  async scan(): Promise<ScanResult> {
    const search = await this.trade.searchAccountItems(this.league, this.profile.accountName, this.profile.realm);
    const tabs: string[] = [];
    return {
      ids: search.result,
      complete: search.total <= search.result.length,
      total: search.total,
      tabs,
      load: async (ids) => {
        const listings = ids.length ? await this.trade.fetch(ids, search.id) : [];
        const out: { item: PoeItem; location?: ItemLocation }[] = [];
        for (const l of listings) {
          const tab = String(l?.listing?.stash?.name ?? '');
          if (!tabs.includes(tab)) tabs.push(tab);
          if (!wanted(this.profile, tab)) continue;
          const item = normalizeItem(l.item);
          out.push({ item, location: listingLocation(l, item) });
        }
        return out;
      },
    };
  }
}

/** Remove-only tabs and other unusual tab types are skipped; everything else (also quad/currency/map tabs) is read. */
const SKIP_TYPES = new Set(['MapStash']);

export class SessionTabsSource implements StashSource {
  readonly label = 'wszystkie zakładki (POESESSID)';

  constructor(private readonly profile: Profile, private readonly league: string, private readonly trade: TradeClient, private readonly delayMs = 1500) {}

  async scan(): Promise<ScanResult> {
    const { accountName, realm } = this.profile;
    const first = await this.trade.stashTab(this.league, accountName, realm, 0, true);
    const tabs = (first.tabs ?? []).filter((t) => !t.hidden && !SKIP_TYPES.has(t.type ?? '') && wanted(this.profile, t.n));
    const byId = new Map<string, { item: PoeItem; location?: ItemLocation }>();
    for (const t of tabs) {
      const res = t.i === 0 ? first : await (async () => { await sleep(this.delayMs); return this.trade.stashTab(this.league, accountName, realm, t.i, false); })();
      for (const raw of res.items ?? []) {
        const item = normalizeItem(raw);
        if (!item.id) continue;
        const x = Number(raw.x);
        const y = Number(raw.y);
        byId.set(item.id, {
          item,
          location: Number.isFinite(x) && Number.isFinite(y) ? { tab: t.n, x, y, w: item.w ?? 1, h: item.h ?? 1 } : { tab: t.n, x: 0, y: 0, w: 1, h: 1 },
        });
      }
    }
    return {
      ids: [...byId.keys()],
      complete: true,
      total: byId.size,
      tabs: tabs.map((t) => t.n),
      load: async (ids) => ids.map((id) => byId.get(id)!).filter(Boolean),
    };
  }
}
