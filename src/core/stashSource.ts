// Where the watcher gets the account's items from: the whole stash, straight from GGG's stash API
// (the same data the game shows), using the player's POESESSID. The trade site is never used for the
// player's own items – only to compare with other players' offers.

import type { ItemLocation, PoeItem, Profile } from '../shared/types';
import { tabFilter } from './config';
import { normalizeItem } from './normalize';
import { sleep } from './http';
import type { TradeClient } from './trade';

export interface ScanResult {
  /** Ids of the items currently in the scanned tabs. */
  ids: string[];
  /** true when ids is the full list (the trade search stops at 100). */
  complete: boolean;
  total: number;
  /** Names of the tabs seen in this scan. */
  tabs: string[];
  /** Current position of every item (items move between scans; the picture of the tab must follow). */
  locations?: Map<string, ItemLocation>;
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

/** Remove-only tabs and other unusual tab types are skipped; everything else (also quad/currency/map tabs) is read. */
const SKIP_TYPES = new Set(['MapStash']);

export class SessionTabsSource implements StashSource {
  readonly label = 'skrzynię';

  constructor(private readonly profile: Profile, private readonly league: string, private readonly trade: TradeClient, private readonly delayMs = 1500) {}

  async scan(): Promise<ScanResult> {
    const { accountName, realm } = this.profile;
    const first = await this.trade.stashTab(this.league, accountName, realm, 0, true);
    if (!first.numTabs && !(first.tabs ?? []).length) {
      throw new Error(`Konto ${accountName} nie ma skrzyni w lidze ${this.league} – sprawdź ligę w ustawieniach (np. Standard albo bieżąca liga).`);
    }
    const tabs = (first.tabs ?? []).filter((t) => !t.hidden && !SKIP_TYPES.has(t.type ?? '') && wanted(this.profile, t.n));
    const byId = new Map<string, { item: PoeItem; location?: ItemLocation }>();
    for (const t of tabs) {
      const res = t.i === 0 ? first : await (async () => { await sleep(this.delayMs); return this.trade.stashTab(this.league, accountName, realm, t.i, false); })();
      for (const raw of res.items ?? []) {
        const item = normalizeItem(raw);
        if (!item.id) continue;
        const x = Number(raw.x);
        const y = Number(raw.y);
        const colour = hexColour(t.colour);
        const tabInfo = { ...(t.type ? { tabType: t.type } : {}), tabIndex: t.i, ...(colour ? { tabColor: colour } : {}) };
        byId.set(item.id, {
          item,
          location: Number.isFinite(x) && Number.isFinite(y)
            ? { tab: t.n, x, y, w: item.w ?? 1, h: item.h ?? 1, ...tabInfo }
            : { tab: t.n, x: 0, y: 0, w: 1, h: 1, ...tabInfo },
        });
      }
    }
    return {
      ids: [...byId.keys()],
      complete: true,
      total: byId.size,
      tabs: tabs.map((t) => t.n),
      locations: new Map([...byId].flatMap(([id, v]) => (v.location ? [[id, v.location] as const] : []))),
      load: async (ids) => ids.map((id) => byId.get(id)!).filter(Boolean),
    };
  }
}

/** GGG tab colour { r, g, b } → "#rrggbb". */
export function hexColour(c: { r: number; g: number; b: number } | undefined): string | undefined {
  if (!c || ![c.r, c.g, c.b].every((v) => Number.isFinite(v))) return undefined;
  return '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
