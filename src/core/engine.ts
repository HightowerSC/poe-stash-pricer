// Ties the sources together. Strategy per item kind:
//  currency / cards / gems / maps / uniques -> poe.ninja (uniques missing there -> trade by name)
//  normal & magic bases                      -> valuable mods? trade : poe.ninja BaseType, then trade as a base
//  rare equipment, jewels, abyss jewels      -> trade, comparable listings
//  cluster jewels                            -> poe.ninja for plain ones, trade (enchant + notables) otherwise
//  timeless jewels                           -> trade with the exact seed

import type { PoeItem, PriceEstimate, Profile } from '../shared/types';
import { NinjaClient } from './ninja';
import { TradeClient, toComparables } from './trade';
import { NinjaIndex } from './pricing/ninjaMatch';
import { summarizeListings } from './pricing/listings';
import { classify, clusterInfo, influenceNames, rarity } from './pricing/classify';
import { buildQuery, buildStatIndex, hasValuableMods, similarity, statFilters, type StatIndex, type TradeStat } from './pricing/tradeQuery';

/** Trade currency codes -> poe.ninja names, for converting listing prices to chaos. */
const CURRENCY_NAMES: Record<string, string> = {
  chaos: 'Chaos Orb', divine: 'Divine Orb', exalted: 'Exalted Orb', alch: 'Orb of Alchemy',
  alt: 'Orb of Alteration', fusing: 'Orb of Fusing', chance: 'Orb of Chance', vaal: 'Vaal Orb',
  regal: 'Regal Orb', mirror: 'Mirror of Kalandra', annul: 'Orb of Annulment', gcp: "Gemcutter's Prism",
};

const MIN_RESULTS = 5;

export class PricingEngine {
  private index = new NinjaIndex([]);
  private stats: StatIndex = new Map();
  private chaosRates = new Map<string, number>([['chaos', 1]]);

  constructor(
    private readonly profile: Profile,
    private readonly league: string,
    private readonly ninja: NinjaClient,
    private readonly trade: TradeClient,
  ) {}

  async refreshPrices(force = false) {
    const rows = await this.ninja.allPrices(this.league, force);
    this.index = new NinjaIndex(rows);
    for (const [code, name] of Object.entries(CURRENCY_NAMES)) {
      const row = rows.find((r) => r.name === name);
      if (row) this.chaosRates.set(code, row.chaosValue);
    }
    return rows.length;
  }

  setTradeStats(stats: TradeStat[]) {
    this.stats = buildStatIndex(stats);
  }

  get divineRate(): number | null {
    return this.chaosRates.get('divine') ?? null;
  }

  async price(item: PoeItem): Promise<PriceEstimate> {
    const kind = classify(item);
    const r = rarity(item);

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
        const info = clusterInfo(item);
        if (info.notables.length === 0 && r !== 'rare') {
          const n = this.index.priceCluster(item);
          if (n) return n;
        }
        return this.byTrade(item, {});
      }
      case 'jewel':
      case 'abyssJewel':
      case 'flask':
      case 'equipment': {
        const filters = statFilters(item, this.stats);
        if ((r === 'rare' || r === 'magic') && hasValuableMods(filters)) return this.byTrade(item, {});
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
  private async byTrade(item: PoeItem, opts: { baseOnly?: boolean }): Promise<PriceEstimate> {
    if (this.stats.size === 0 && !opts.baseOnly) return unpriced(item, 'Brak danych statystyk trade');
    const filters = statFilters(item, this.stats);
    const steps = opts.baseOnly ? [0] : [6, 4, 3, 2, 1];
    let last: { id: string; ids: string[]; chosen: ReturnType<typeof buildQuery>['chosen'] } | null = null;

    for (const keep of steps) {
      const { query, sort, chosen } = buildQuery(item, filters, { keep, baseOnly: opts.baseOnly });
      const result = await this.trade.search(this.league, { query, sort }, this.profile.realm);
      last = { id: result.id, ids: result.result, chosen };
      if (result.total >= MIN_RESULTS) break;
    }
    if (!last || last.ids.length === 0) return unpriced(item, 'Brak podobnych ofert na trade');

    const listings = await this.trade.fetch(last.ids.slice(0, 20), last.id);
    const comparables = listings.flatMap((l) =>
      toComparables([l], (c) => this.chaosRates.get(c) ?? null, similarity(last!.chosen, l.item, this.stats)),
    );
    const summary = summarizeListings(comparables);
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

/** Bases worth checking: high item level, influenced, fractured, synthesised. */
export function isInterestingBase(item: PoeItem): boolean {
  return item.ilvl >= 82 || influenceNames(item).length > 0 || !!item.fractured || !!item.synthesised;
}

function unpriced(item: PoeItem, note: string): PriceEstimate {
  return { itemId: item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note };
}
