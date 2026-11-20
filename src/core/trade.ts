// Client for the pathofexile.com trade site, used the same way as Awakened PoE Trade:
//  - comparable listings of OTHER players for pricing (search + fetch),
//  - the player's own stash, characters and gear from the profile endpoints (character-window).
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

  /**
   * One stash tab from the legacy stash API (needs POESESSID; GGG may answer 403 for it).
   * With withTabs=true the answer also lists all tabs: { numTabs, tabs: [{ n, i, type }], items }.
   */
  async stashTab(league: string, account: string, realm: Realm, index: number, withTabs: boolean): Promise<{ numTabs?: number; tabs?: { n: string; i: number; type?: string; hidden?: boolean; colour?: { r: number; g: number; b: number } }[]; items: any[] }> {
    if (!this.sessionId) throw new Error('Brak POESESSID w ustawieniach profilu.');
    const url = `${SITE}/character-window/get-stash-items?accountName=${encodeURIComponent(account)}&realm=${realm}`
      + `&league=${encodeURIComponent(league)}&tabs=${withTabs ? 1 : 0}&tabIndex=${index}`;
    return (await this.legacy(url)) as any;
  }

  /** Characters of the account (needs a public "Characters" tab on the profile, or POESESSID). */
  async characters(account: string, realm: Realm): Promise<any[]> {
    return (await this.legacy(`${SITE}/character-window/get-characters?accountName=${encodeURIComponent(account)}&realm=${realm}`)) as any[];
  }

  /** Equipped items, flasks and socketed gems of one character: { character, items }. */
  async characterItems(account: string, character: string, realm: Realm): Promise<{ character: any; items: any[] }> {
    return (await this.legacy(`${SITE}/character-window/get-items?accountName=${encodeURIComponent(account)}&character=${encodeURIComponent(character)}&realm=${realm}`)) as any;
  }

  /** Allocated passives and socketed jewels: { hashes, items, mastery_effects }. */
  async passives(account: string, character: string, realm: Realm): Promise<{ hashes?: number[]; items?: any[] }> {
    return (await this.legacy(`${SITE}/character-window/get-passive-skills?accountName=${encodeURIComponent(account)}&character=${encodeURIComponent(character)}&realm=${realm}`)) as any;
  }

  /** GET on the old character-window endpoints, with errors explained in Polish. */
  private async legacy(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.call(url, { method: 'GET' });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/HTTP 403/.test(m)) {
        throw new Error(this.sessionId
          ? 'pathofexile.com odmówił dostępu (403): POESESSID jest nieaktualny albo GGG zablokowało ten endpoint. Zaloguj się ponownie na stronie i skopiuj nowy POESESSID.'
          : 'pathofexile.com odmówił dostępu (403): profil jest prywatny. W ustawieniach konta na pathofexile.com odznacz „Hide characters” albo wpisz POESESSID w profilu aplikacji.');
      }
      if (/HTTP 404/.test(m)) throw new Error('Nie znaleziono konta albo postaci – sprawdź nazwę konta z numerem (np. Exile#1234).');
      throw e;
    }
    const json = (await res.json()) as any;
    if (json?.error) throw new Error(`pathofexile.com: ${json.error.message ?? 'błąd'}`);
    return json;
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

  /**
   * Bulk item exchange: offers of players who give `want` for `have` (cheapest first).
   * Each offer: the seller gives item.amount of `want` for exchange.amount of `have`.
   */
  async exchange(league: string, want: string, have: string, realm: Realm = 'pc'): Promise<ExchangeOffer[]> {
    const realmPart = realm === 'pc' ? '' : `${realm}/`;
    const res = await this.call(`${SITE}/api/trade/exchange/${realmPart}${encodeURIComponent(league)}`, {
      method: 'POST',
      body: JSON.stringify({ query: { status: { option: 'online' }, have: [have], want: [want] }, sort: { have: 'asc' }, engine: 'new' }),
      headers: { 'Content-Type': 'application/json' },
    });
    return parseExchange((await res.json()) as any);
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
        whisper: typeof l.listing.whisper === 'string' ? l.listing.whisper : undefined,
        seller: l.listing.account?.name,
      };
    })
    .filter((x): x is ComparableListing => x !== null);
}

export function itemFromListing(l: any): PoeItem | null {
  return l?.item ?? null;
}

export interface ExchangeOffer {
  /** Seller gives this much of the wanted currency… */
  give: number;
  /** …for this much of what we have. */
  take: number;
  stock: number;
  seller?: string;
  whisper?: string;
}

/** Reads the bulk exchange response (result is an object keyed by listing id). */
export function parseExchange(json: any): ExchangeOffer[] {
  const out: ExchangeOffer[] = [];
  for (const r of Object.values(json?.result ?? {}) as any[]) {
    for (const o of r?.listing?.offers ?? []) {
      const give = Number(o?.item?.amount);
      const take = Number(o?.exchange?.amount);
      if (!(give > 0) || !(take > 0)) continue;
      out.push({ give, take, stock: Number(o?.item?.stock ?? give), seller: r?.listing?.account?.name, whisper: typeof o?.item?.whisper === 'string' ? o.item.whisper : undefined });
    }
  }
  return out;
}
