"use strict";
// Client for the documented poe.ninja economy API (https://poe.ninja/docs/api).
// Rules we follow: descriptive User-Agent, at most 2 requests in flight, respect HTTP caching (ETag),
// fetch whole tables at most every 15 minutes (the data does not refresh faster) and never per item.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NinjaClient = exports.ITEM_TYPES = exports.EXCHANGE_TYPES = exports.NINJA_REFRESH_MS = void 0;
exports.parseOverview = parseOverview;
const http_1 = require("./http");
const BASE = 'https://poe.ninja/poe1/api/economy';
exports.NINJA_REFRESH_MS = 15 * 60 * 1000;
/** Exchange-style categories (currency-like, stackable). */
exports.EXCHANGE_TYPES = [
    'Currency', 'Fragment', 'DivinationCard', 'Oil', 'DeliriumOrb', 'Fossil', 'Resonator',
    'Essence', 'Omen', 'Tattoo', 'Artifact', 'Astrolabe', 'Runegraft', 'AllflameEmber', 'DjinnCoin', 'Scarab',
];
/** Item-style categories (uniques, gems, maps, bases...). */
exports.ITEM_TYPES = [
    'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueTincture',
    'UniqueRelic', 'UniqueMap', 'ForbiddenJewel', 'ClusterJewel', 'SkillGem', 'ImbuedGem', 'Map',
    'BlightedMap', 'BlightRavagedMap', 'ValdoMap', 'Invitation', 'Memory', 'Incubator', 'Beast',
    'BaseType', 'Wombgift', 'Vial',
];
class NinjaClient {
    fetchFn;
    cache = new Map();
    limiter = new http_1.Limiter(2);
    ua;
    constructor(fetchFn = fetch, contact = '') {
        this.fetchFn = fetchFn;
        this.ua = (0, http_1.userAgent)(contact);
    }
    async leagues() {
        const res = await this.get(`${BASE}/leagues`);
        if (!res.ok)
            throw new Error(`poe.ninja leagues: HTTP ${res.status}`);
        const data = (await res.json());
        // The first entry is the current challenge league; its Hardcore twin follows the same naming.
        const challenge = data[0]?.id ?? data[0]?.name;
        return data.map((l) => {
            const id = l.id ?? l.name;
            const hardcore = /hardcore/i.test(id) || /hardcore/i.test(l.name ?? '');
            const isCurrent = id === challenge || id === `Hardcore ${challenge}`;
            return { id, name: l.name ?? id, hardcore, current: isCurrent && !/standard/i.test(id) };
        });
    }
    /** All price rows for one league. Unknown categories (new leagues) are skipped, not fatal. */
    async allPrices(league, force = false) {
        const urls = [
            ...exports.EXCHANGE_TYPES.map((t) => [t, `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${t}`]),
            ...exports.ITEM_TYPES.map((t) => [t, `${BASE}/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${t}`]),
        ];
        const results = await Promise.all(urls.map(([type, url]) => this.table(type, url, force).catch(() => [])));
        return results.flat();
    }
    async table(category, url, force) {
        const cached = this.cache.get(url);
        if (cached && !force && Date.now() - cached.fetchedAt < exports.NINJA_REFRESH_MS)
            return cached.rows;
        const res = await this.get(url, cached?.etag);
        if (res.status === 304 && cached) {
            cached.fetchedAt = Date.now();
            return cached.rows;
        }
        if (!res.ok)
            throw new Error(`poe.ninja ${category}: HTTP ${res.status}`);
        const rows = parseOverview(category, await res.json());
        this.cache.set(url, { etag: res.headers.get('etag') ?? undefined, fetchedAt: Date.now(), rows });
        return rows;
    }
    get(url, etag) {
        const headers = { 'User-Agent': this.ua, Accept: 'application/json' };
        if (etag)
            headers['If-None-Match'] = etag;
        return this.limiter.run(() => (0, http_1.fetchWithRetry)(this.fetchFn, url, { headers }));
    }
}
exports.NinjaClient = NinjaClient;
/** Accepts both the item overview ("lines") and the exchange overview ("lines" + "items") shapes. */
function parseOverview(category, json) {
    const lines = json?.lines ?? [];
    const itemNames = new Map();
    for (const it of json?.items ?? [])
        if (it?.id)
            itemNames.set(it.id, it.name);
    return lines
        .map((l) => {
        const name = l.name ?? l.currencyTypeName ?? itemNames.get(l.id);
        const chaos = l.chaosValue ?? l.primaryValue ?? l.chaosEquivalent;
        if (!name || typeof chaos !== 'number')
            return null;
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
        .filter((r) => r !== null);
}
