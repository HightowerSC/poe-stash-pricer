// Client for the documented poe.ninja economy API (https://poe.ninja/docs/api).
// Rules we follow: descriptive User-Agent, at most 2 requests in flight, respect HTTP caching (ETag),
// fetch whole tables at most every 15 minutes (the data does not refresh faster) and never per item.

import type { League } from '../shared/types';
import { fetchWithRetry, Limiter, type FetchLike, userAgent } from './http';

const BASE = 'https://poe.ninja/poe1/api/economy';
export const NINJA_REFRESH_MS = 15 * 60 * 1000;

/** Exchange-style categories (currency-like, stackable). */
export const EXCHANGE_TYPES = [
  'Currency', 'Fragment', 'DivinationCard', 'Oil', 'DeliriumOrb', 'Fossil', 'Resonator',
  'Essence', 'Omen', 'Tattoo', 'Artifact', 'Astrolabe', 'Runegraft', 'AllflameEmber', 'DjinnCoin', 'Scarab',
];

/** Item-style categories (uniques, gems, maps, bases...). */
export const ITEM_TYPES = [
  'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueTincture',
  'UniqueRelic', 'UniqueMap', 'ForbiddenJewel', 'ClusterJewel', 'SkillGem', 'ImbuedGem', 'Map',
  'BlightedMap', 'BlightRavagedMap', 'ValdoMap', 'Invitation', 'Memory', 'Incubator', 'Beast',
  'BaseType', 'Wombgift', 'Vial',
];

export interface NinjaRow {
  name: string;
  baseType?: string;
  variant?: string;
  links?: number;
  corrupted?: boolean;
  gemLevel?: number;
  gemQuality?: number;
  levelRequired?: number;
  itemClass?: number;
  chaosValue: number;
  divineValue?: number;
  listingCount?: number;
  count?: number;
  /** 7-day change in percent (from poe.ninja's sparkline). */
  change7d?: number;
  category: string;
}

interface CacheEntry { etag?: string; fetchedAt: number; rows: NinjaRow[] }

export class NinjaClient {
  private cache = new Map<string, CacheEntry>();
  private limiter = new Limiter(2);
  private ua: string;

  constructor(private readonly fetchFn: FetchLike = fetch, contact = '') {
    this.ua = userAgent(contact);
  }

  async leagues(): Promise<League[]> {
    const res = await this.get(`${BASE}/leagues`);
    if (!res.ok) throw new Error(`poe.ninja (lista lig): HTTP ${res.status}`);
    const data = (await res.json()) as any[];
    // The first entry is the current challenge league; its Hardcore twin follows the same naming.
    const challenge = data[0]?.id ?? data[0]?.name;
    return data.map((l: any) => {
      const id: string = l.id ?? l.name;
      const hardcore = /hardcore/i.test(id) || /hardcore/i.test(l.name ?? '');
      const isCurrent = id === challenge || id === `Hardcore ${challenge}`;
      return { id, name: l.name ?? id, hardcore, current: isCurrent && !/standard/i.test(id) };
    });
  }

  /** All price rows for one league. Unknown categories (new leagues) are skipped, not fatal. */
  async allPrices(league: string, force = false, onProgress?: (done: number, total: number, failed: number) => void): Promise<NinjaRow[]> {
    const urls = [
      ...EXCHANGE_TYPES.map((t) => [t, `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${t}`]),
      ...ITEM_TYPES.map((t) => [t, `${BASE}/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${t}`]),
    ];
    let done = 0;
    let failed = 0;
    let lastError = '';
    const results = await Promise.all(urls.map(([type, url]) =>
      this.table(type, url, force)
        .catch((e) => {
          failed++;
          lastError = e instanceof Error ? e.message : String(e);
          return [] as NinjaRow[];
        })
        .finally(() => onProgress?.(++done, urls.length, failed)),
    ));
    const rows = results.flat();
    // Every table failed: that is a connection problem, not a missing category.
    if (rows.length === 0 && failed === urls.length) throw new Error(`poe.ninja nie odpowiada: ${lastError}`);
    return rows;
  }

  private async table(category: string, url: string, force: boolean): Promise<NinjaRow[]> {
    const cached = this.cache.get(url);
    if (cached && !force && Date.now() - cached.fetchedAt < NINJA_REFRESH_MS) return cached.rows;

    const res = await this.get(url, cached?.etag);
    if (res.status === 304 && cached) {
      cached.fetchedAt = Date.now();
      return cached.rows;
    }
    if (!res.ok) throw new Error(`poe.ninja ${category}: HTTP ${res.status}`);
    const rows = parseOverview(category, await res.json());
    this.cache.set(url, { etag: res.headers.get('etag') ?? undefined, fetchedAt: Date.now(), rows });
    return rows;
  }

  private get(url: string, etag?: string) {
    const headers: Record<string, string> = { 'User-Agent': this.ua, Accept: 'application/json' };
    if (etag) headers['If-None-Match'] = etag;
    return this.limiter.run(() => fetchWithRetry(this.fetchFn, url, { headers }));
  }
}

/** Accepts both the item overview ("lines") and the exchange overview ("lines" + "items") shapes. */
export function parseOverview(category: string, json: any): NinjaRow[] {
  const lines: any[] = json?.lines ?? [];
  const itemNames = new Map<string, string>();
  for (const it of json?.items ?? []) if (it?.id) itemNames.set(it.id, it.name);

  return lines
    .map((l): NinjaRow | null => {
      const name: string | undefined = l.name ?? l.currencyTypeName ?? itemNames.get(l.id);
      const chaos: number | undefined = l.chaosValue ?? l.primaryValue ?? l.chaosEquivalent;
      if (!name || typeof chaos !== 'number') return null;
      return {
        name,
        baseType: l.baseType,
        variant: l.variant,
        links: l.links,
        corrupted: l.corrupted,
        gemLevel: l.gemLevel,
        gemQuality: l.gemQuality,
        levelRequired: l.levelRequired,
        chaosValue: chaos,
        divineValue: l.divineValue,
        listingCount: l.listingCount ?? l.volumePrimaryValue,
        count: l.count,
        change7d: l.sparkLine?.totalChange ?? l.sparkline?.totalChange ?? l.lowConfidenceSparkLine?.totalChange,
        category,
      };
    })
    .filter((r): r is NinjaRow => r !== null);
}
