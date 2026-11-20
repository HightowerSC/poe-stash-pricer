"use strict";
// Client for the pathofexile.com trade site, used the same way as Awakened PoE Trade:
//  1) find new items in the user's PUBLIC stash tabs by searching for their account name,
//  2) find comparable listings for a rare item and summarise their prices.
// Rate limits are dynamic, so we read X-Rate-Limit-* headers after every call and wait when needed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeClient = void 0;
exports.parseRule = parseRule;
exports.toComparables = toComparables;
exports.itemFromListing = itemFromListing;
const http_1 = require("./http");
const SITE = 'https://www.pathofexile.com';
class TradeClient {
    fetchFn;
    sessionId;
    blockedUntil = 0;
    ua;
    constructor(fetchFn = fetch, contact = '', sessionId) {
        this.fetchFn = fetchFn;
        this.sessionId = sessionId;
        this.ua = (0, http_1.userAgent)(contact);
    }
    /** Newest items listed in the account's public tabs (priced or not). */
    async searchAccountItems(league, account, realm = 'pc') {
        const query = {
            query: {
                status: { option: 'any' },
                filters: { trade_filters: { filters: { account: { input: account } } } },
            },
            sort: { indexed: 'desc' },
        };
        return this.search(league, query, realm);
    }
    async search(league, query, realm = 'pc') {
        const realmPart = realm === 'pc' ? '' : `${realm}/`;
        const res = await this.call(`${SITE}/api/trade/search/${realmPart}${encodeURIComponent(league)}`, {
            method: 'POST',
            body: JSON.stringify(query),
            headers: { 'Content-Type': 'application/json' },
        });
        return (await res.json());
    }
    /** Fetches full listings, at most 10 ids per call (the site's limit). */
    async fetch(ids, queryId) {
        const out = [];
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10).join(',');
            const res = await this.call(`${SITE}/api/trade/fetch/${chunk}?query=${queryId}`, { method: 'GET' });
            const json = (await res.json());
            out.push(...(json.result ?? []).filter(Boolean));
        }
        return out;
    }
    /** All trade stat definitions, flattened (needed to turn mod text into stat ids). Cache this per session. */
    async stats() {
        const res = await this.call(`${SITE}/api/trade/data/stats`, { method: 'GET' });
        const json = (await res.json());
        return json.result.flatMap((g) => g.entries.map((e) => ({ id: e.id, text: e.text, type: e.type, options: e.option?.options })));
    }
    tradeUrl(league, queryId, realm = 'pc') {
        const realmPart = realm === 'pc' ? '' : `${realm}/`;
        return `${SITE}/trade/search/${realmPart}${encodeURIComponent(league)}/${queryId}`;
    }
    async call(url, init) {
        const wait = this.blockedUntil - Date.now();
        if (wait > 0)
            await (0, http_1.sleep)(wait);
        const headers = { 'User-Agent': this.ua, Accept: 'application/json', ...init.headers };
        if (this.sessionId)
            headers.Cookie = `POESESSID=${this.sessionId}`;
        const res = await this.fetchFn(url, { ...init, headers });
        this.updateLimits(res);
        if (res.status === 429) {
            const retry = Number(res.headers.get('retry-after') ?? '60');
            this.blockedUntil = Date.now() + retry * 1000;
            throw new Error(`Limit zapytań trade – czekam ${retry} s`);
        }
        if (!res.ok)
            throw new Error(`Trade: HTTP ${res.status}`);
        return res;
    }
    /** If any rule is one hit away from its limit, pause for that rule's period. */
    updateLimits(res) {
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
exports.TradeClient = TradeClient;
/** "8:10:60,15:60:120" -> [{max:8,period:10,...}, ...]. For a -state header, max holds the current hits. */
function parseRule(header) {
    if (!header)
        return [];
    return header.split(',').map((part) => {
        const [a, b, c] = part.split(':').map(Number);
        return { max: a, period: b, hits: c };
    });
}
/** Converts fetched listings to chaos using a chaos-per-unit map built from poe.ninja. */
function toComparables(listings, chaosPer, similarity = 1) {
    return listings
        .map((l) => {
        const price = l?.listing?.price;
        if (!price?.amount || !price?.currency)
            return null;
        const rate = chaosPer(price.currency);
        if (rate == null)
            return null;
        return {
            chaos: price.amount * rate,
            originalAmount: price.amount,
            originalCurrency: price.currency,
            similarity,
            indexedAt: l.listing.indexed,
        };
    })
        .filter((x) => x !== null);
}
function itemFromListing(l) {
    return l?.item ?? null;
}
