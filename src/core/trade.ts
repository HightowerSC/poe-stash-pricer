// Client for the pathofexile.com trade site, used the same way as Awakened PoE Trade:
//  1) find new items in the user's PUBLIC stash tabs by searching for their account name,
//  2) find comparable listings for a rare item and summarise their prices.
// Rate limits are dynamic, so we read X-Rate-Limit-* headers after every call and wait when needed.

import type { ComparableListing, PoeItem, Realm } from '../shared/types';
import { fetchTimed, sleep, type FetchLike, userAgent } from './http';

const SITE = 'https://www.pathofexile.com';

export interface TradeSearchResult { id: string; result: string[]; total: number }

interface RuleState { max: number; period: number; hits: number }

export class TradeClient {
  private blockedUntil = 0;
  private ua: string;

  constructor(private readonly fetchFn: FetchLike = fetch, contact = '', private readonly sessionId?: string) {
    this.ua = userAgent(contact);
  }

  /** Newest items listed in the account's public tabs (priced or not). */
  async searchAccountItems(league: string, account: string, realm: Realm = 'pc'): Promise<TradeSearchResult> {
    const query = {
      query: {
        status: { option: 'any' },
        filters: { trade_filters: { filters: { account: { input: account } } } },
      },
      sort: { indexed: 'desc' },
    };
    return this.search(league, query, realm);
  }

  async search(league: string, query: unknown, realm: Realm = 'pc'): Promise<TradeSearchResult> {
    const realmPart = realm === 'pc' ? '' : `${realm}/`;
    const res = await this.call(`${SITE}/api/trade/search/${realmPart}${encodeURIComponent(league)}`, {
      method: 'POST',
      body: JSON.stringify(query),
      headers: { 'Content-Type': 'application/json' },
    });
    return (await res.json()) as TradeSearchResult;
  }

  /** Fetches full listings, at most 10 ids per call (the site's limit). */
  async fetch(ids: string[], queryId: string): Promise<any[]> {
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10).join(',');
      const res = await this.call(`${SITE}/api/trade/fetch/${chunk}?query=${queryId}`, { method: 'GET' });
      const json = (await res.json()) as { result: any[] };
      out.push(...(json.result ?? []).filter(Boolean));
    }
    return out;
  }

  /** All trade stat definitions, flattened (needed to turn mod text into stat ids). Cache this per session. */
  async stats(): Promise<{ id: string; text: string; type: string; options?: { id: number; text: string }[] }[]> {
    const res = await this.call(`${SITE}/api/trade/data/stats`, { method: 'GET' });
    const json = (await res.json()) as { result: { entries: any[] }[] };
    return json.result.flatMap((g) =>
      g.entries.map((e) => ({ id: e.id, text: e.text, type: e.type, options: e.option?.options })),
    );
  }

  tradeUrl(league: string, queryId: string, realm: Realm = 'pc'): string {
    const realmPart = realm === 'pc' ? '' : `${realm}/`;
    return `${SITE}/trade/search/${realmPart}${encodeURIComponent(league)}/${queryId}`;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    const wait = this.blockedUntil - Date.now();
    if (wait > 0) await sleep(wait);

    const headers: Record<string, string> = { 'User-Agent': this.ua, Accept: 'application/json', ...(init.headers as any) };
    if (this.sessionId) headers.Cookie = `POESESSID=${this.sessionId}`;
    const res = await fetchTimed(this.fetchFn, url, { ...init, headers });
    this.updateLimits(res);

    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '60');
      this.blockedUntil = Date.now() + retry * 1000;
      throw new Error(`Limit zapytań trade – czekam ${retry} s`);
    }
    if (!res.ok) throw new Error(`Trade: HTTP ${res.status}`);
    return res;
  }

  /** If any rule is one hit away from its limit, pause for that rule's period. */
  private updateLimits(res: Response) {
    const rules = (res.headers.get('x-rate-limit-rules') ?? '').split(',').map((r) => r.trim()).filter(Boolean);
    for (const rule of rules) {
      const limits = parseRule(res.headers.get(`x-rate-limit-${rule}`));
      const state = parseRule(res.headers.get(`x-rate-limit-${rule}-state`));
      limits.forEach((lim, i) => {
        const st = state[i];
        if (st && st.max >= lim.max - 1) {
          this.blockedUntil = Math.max(this.blockedUntil, Date.now() + lim.period * 1000);
        }
      });
    }
  }
}

/** "8:10:60,15:60:120" -> [{max:8,period:10,...}, ...]. For a -state header, max holds the current hits. */
export function parseRule(header: string | null): RuleState[] {
  if (!header) return [];
  return header.split(',').map((part) => {
    const [a, b, c] = part.split(':').map(Number);
    return { max: a, period: b, hits: c };
  });
}

/** Converts fetched listings to chaos using a chaos-per-unit map built from poe.ninja. */
export function toComparables(listings: any[], chaosPer: (currency: string) => number | null, similarity = 1): ComparableListing[] {
  return listings
    .map((l): ComparableListing | null => {
      const price = l?.listing?.price;
      if (!price?.amount || !price?.currency) return null;
      const rate = chaosPer(price.currency);
      if (rate == null) return null;
      return {
        chaos: price.amount * rate,
        originalAmount: price.amount,
        originalCurrency: price.currency,
        similarity,
        indexedAt: l.listing.indexed,
      };
    })
    .filter((x): x is ComparableListing => x !== null);
}

export function itemFromListing(l: any): PoeItem | null {
  return l?.item ?? null;
}
