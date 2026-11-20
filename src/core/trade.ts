// Client for the pathofexile.com trade site, used the same way as Awakened PoE Trade:
//  - comparable listings of OTHER players for pricing (search + fetch),
//  - the player's own stash, characters and gear from the profile endpoints (character-window).
// Every request goes through the one shared gate in tradeLimiter.ts (limits from X-Rate-Limit-* headers,
// Retry-After, priority queue, cache of identical queries), whichever TradeClient instance sends it.

import type { ComparableListing, PoeItem, Realm } from '../shared/types';
import { fetchTimed, type FetchLike, userAgent } from './http';
import { isInteractive, tradeGate, type TradeGate } from './tradeLimiter';

const SITE = 'https://www.pathofexile.com';

export interface TradeSearchResult { id: string; result: string[]; total: number }

interface RuleState { max: number; period: number; hits: number }

/** How long identical queries are answered from memory (listings don't change that fast). */
const SEARCH_TTL = 5 * 60_000;
const EXCHANGE_TTL = 2 * 60_000;
const STATS_TTL = 6 * 60 * 60_000;
/** A Ctrl+C check gives up instead of hanging when GGG imposed a long timeout. */
const INTERACTIVE_MAX_WAIT = 60_000;

export class TradeClient {
  private ua: string;

  constructor(
    private readonly fetchFn: FetchLike = fetch,
    contact = '',
    private readonly sessionId?: string,
    private readonly gate: TradeGate = tradeGate,
  ) {
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

  search(league: string, query: unknown, realm: Realm = 'pc'): Promise<TradeSearchResult> {
    return this.gate.cached(`search|${realm}|${league}|${JSON.stringify(query)}`, SEARCH_TTL, () => this.searchNow(league, query, realm));
  }

  private async searchNow(league: string, query: unknown, realm: Realm): Promise<TradeSearchResult> {
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
  exchange(league: string, want: string, have: string, realm: Realm = 'pc'): Promise<ExchangeOffer[]> {
    return this.gate.cached(`exchange|${realm}|${league}|${want}|${have}`, EXCHANGE_TTL, () => this.exchangeNow(league, want, have, realm));
  }

  private async exchangeNow(league: string, want: string, have: string, realm: Realm): Promise<ExchangeOffer[]> {
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
      const part = await this.gate.cached(`fetch|${queryId}|${chunk}`, SEARCH_TTL, async () => {
        const res = await this.call(`${SITE}/api/trade/fetch/${chunk}?query=${queryId}`, { method: 'GET' });
        const json = (await res.json()) as { result: any[] };
        return (json.result ?? []).filter(Boolean);
      });
      out.push(...part);
    }
    return out;
  }

  /** All trade stat definitions, flattened (needed to turn mod text into stat ids). Cache this per session. */
  stats(): Promise<{ id: string; text: string; type: string; options?: { id: number; text: string }[] }[]> {
    return this.gate.cached('stats', STATS_TTL, () => this.statsNow());
  }

  private async statsNow(): Promise<{ id: string; text: string; type: string; options?: { id: number; text: string }[] }[]> {
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
    const headers: Record<string, string> = { 'User-Agent': this.ua, Accept: 'application/json', ...(init.headers as any) };
    if (this.sessionId) headers.Cookie = `POESESSID=${this.sessionId}`;
    const res = await this.gate.request(url, () => fetchTimed(this.fetchFn, url, { ...init, headers }), {
      maxWaitMs: isInteractive() ? INTERACTIVE_MAX_WAIT : undefined,
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '60') || 60;
      throw new Error(`Limit zapytań trade (pathofexile.com) – GGG każe czekać ${retry} s. Aplikacja sama zwolni tempo.`);
    }
    if (!res.ok) throw new Error(`Trade: HTTP ${res.status}`);
    return res;
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
