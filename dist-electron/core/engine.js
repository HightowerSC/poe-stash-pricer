"use strict";
// Ties the sources together. Strategy per item kind:
//  currency / cards / gems / maps / uniques -> poe.ninja (uniques missing there -> trade by name)
//  normal & magic bases                      -> valuable mods? trade : poe.ninja BaseType, then trade as a base
//  rare equipment, jewels, abyss jewels      -> trade, comparable listings
//  cluster jewels                            -> poe.ninja for plain ones, trade (enchant + notables) otherwise
//  timeless jewels                           -> trade with the exact seed
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingEngine = void 0;
exports.isInterestingBase = isInterestingBase;
const poeprices_1 = require("./extras/poeprices");
const trade_1 = require("./trade");
const ninjaMatch_1 = require("./pricing/ninjaMatch");
const listings_1 = require("./pricing/listings");
const classify_1 = require("./pricing/classify");
const tradeQuery_1 = require("./pricing/tradeQuery");
/** Trade currency codes -> poe.ninja names, for converting listing prices to chaos. */
const CURRENCY_NAMES = {
    chaos: 'Chaos Orb', divine: 'Divine Orb', exalted: 'Exalted Orb', alch: 'Orb of Alchemy',
    alt: 'Orb of Alteration', fusing: 'Orb of Fusing', chance: 'Orb of Chance', vaal: 'Vaal Orb',
    regal: 'Regal Orb', mirror: 'Mirror of Kalandra', annul: 'Orb of Annulment', gcp: "Gemcutter's Prism",
};
const MIN_RESULTS = 5;
class PricingEngine {
    profile;
    league;
    ninja;
    trade;
    poepricesFetch;
    index = new ninjaMatch_1.NinjaIndex([]);
    stats = new Map();
    chaosRates = new Map([['chaos', 1]]);
    constructor(profile, league, ninja, trade, poepricesFetch = fetch) {
        this.profile = profile;
        this.league = league;
        this.ninja = ninja;
        this.trade = trade;
        this.poepricesFetch = poepricesFetch;
    }
    async refreshPrices(force = false) {
        const rows = await this.ninja.allPrices(this.league, force);
        this.index = new ninjaMatch_1.NinjaIndex(rows);
        for (const [code, name] of Object.entries(CURRENCY_NAMES)) {
            const row = rows.find((r) => r.name === name);
            if (row)
                this.chaosRates.set(code, row.chaosValue);
        }
        return rows.length;
    }
    setTradeStats(stats) {
        this.stats = (0, tradeQuery_1.buildStatIndex)(stats);
    }
    get divineRate() {
        return this.chaosRates.get('divine') ?? null;
    }
    async price(item) {
        const estimate = await this.priceInner(item);
        if (this.profile.usePoeprices && (0, classify_1.rarity)(item) === 'rare' && item.identified !== false) {
            const op = await (0, poeprices_1.poepricesOpinion)(this.poepricesFetch, this.league, item);
            if (op) {
                const rate = op.currency === 'divine' ? this.chaosRates.get('divine') ?? 0 : 1;
                estimate.poeprices = { ...op, chaos: Math.round(((op.min + op.max) / 2) * rate) };
            }
        }
        return estimate;
    }
    async priceInner(item) {
        const kind = (0, classify_1.classify)(item);
        const r = (0, classify_1.rarity)(item);
        switch (kind) {
            case 'currency':
            case 'card':
            case 'gem':
            case 'map':
                return this.index.price(item) ?? (kind === 'gem' || kind === 'map' ? this.byTrade(item, { baseOnly: true }) : unpriced(item, 'Brak na poe.ninja'));
            case 'unique':
                return this.index.price(item) ?? this.byTrade(item, { baseOnly: true });
            case 'timeless':
                return this.byTrade(item, {});
            case 'clusterJewel': {
                const info = (0, classify_1.clusterInfo)(item);
                if (info.notables.length === 0 && r !== 'rare') {
                    const n = this.index.priceCluster(item);
                    if (n)
                        return n;
                }
                return this.byTrade(item, {});
            }
            case 'jewel':
            case 'abyssJewel':
            case 'flask':
            case 'equipment': {
                const filters = (0, tradeQuery_1.statFilters)(item, this.stats);
                if ((r === 'rare' || r === 'magic') && (0, tradeQuery_1.hasValuableMods)(filters))
                    return this.byTrade(item, {});
                // No valuable mods: maybe the base itself is worth something.
                if (isInterestingBase(item)) {
                    return this.index.priceBase(item) ?? this.byTrade(item, { baseOnly: true });
                }
                return { ...unpriced(item, 'Brak wartościowych modów i cennej bazy – do sprzedania u NPC'), confidence: 'medium' };
            }
            default:
                return this.index.price(item) ?? unpriced(item, 'Nieznany typ przedmiotu');
        }
    }
    /** Comparable listings, loosening the query (fewer optional mods) until there are enough results. */
    async byTrade(item, opts) {
        if (this.stats.size === 0 && !opts.baseOnly)
            return unpriced(item, 'Brak danych statystyk trade');
        const filters = (0, tradeQuery_1.statFilters)(item, this.stats);
        const steps = opts.baseOnly ? [0] : [6, 4, 3, 2, 1];
        let last = null;
        for (const keep of steps) {
            const { query, sort, chosen } = (0, tradeQuery_1.buildQuery)(item, filters, { keep, baseOnly: opts.baseOnly });
            const result = await this.trade.search(this.league, { query, sort }, this.profile.realm);
            last = { id: result.id, ids: result.result, chosen };
            if (result.total >= MIN_RESULTS)
                break;
        }
        if (!last || last.ids.length === 0)
            return unpriced(item, 'Brak podobnych ofert na trade');
        const listings = await this.trade.fetch(last.ids.slice(0, 20), last.id);
        const comparables = listings.flatMap((l) => (0, trade_1.toComparables)([l], (c) => this.chaosRates.get(c) ?? null, (0, tradeQuery_1.similarity)(last.chosen, l.item, this.stats)));
        const summary = (0, listings_1.summarizeListings)(comparables);
        return {
            itemId: item.id,
            source: 'trade',
            chaos: summary.chaos,
            low: summary.low,
            high: summary.high,
            confidence: summary.confidence,
            sampleSize: summary.used.length,
            note: `${summary.note}; filtry: ${last.chosen.length ? last.chosen.map((c) => c.text).join(' | ') : 'baza'}`,
            comparables: summary.used,
            tradeUrl: this.trade.tradeUrl(this.league, last.id, this.profile.realm),
        };
    }
}
exports.PricingEngine = PricingEngine;
/** Bases worth checking: high item level, influenced, fractured, synthesised. */
function isInterestingBase(item) {
    return item.ilvl >= 82 || (0, classify_1.influenceNames)(item).length > 0 || !!item.fractured || !!item.synthesised;
}
function unpriced(item, note) {
    return { itemId: item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note };
}
