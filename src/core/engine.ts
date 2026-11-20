// Ties the sources together: poe.ninja tables first, then comparable trade listings.

import type { PoeItem, PriceEstimate, Profile } from '../shared/types';
import { NinjaClient } from './ninja';
import { TradeClient, toComparables } from './trade';
import { NinjaIndex } from './pricing/ninjaMatch';
import { summarizeListings } from './pricing/listings';
import { routeItem } from './pricing/router';
import { buildRareQuery, buildStatIndex, similarity, statFilters, type TradeStat } from './pricing/rareQuery';

/** Trade currency codes -> poe.ninja names, for converting listing prices to chaos. */
const CURRENCY_NAMES: Record<string, string> = {
  chaos: 'Chaos Orb', divine: 'Divine Orb', exalted: 'Exalted Orb', alch: 'Orb of Alchemy',
  alt: 'Orb of Alteration', fusing: 'Orb of Fusing', chance: 'Orb of Chance', vaal: 'Vaal Orb',
  regal: 'Regal Orb', mirror: 'Mirror of Kalandra', annul: 'Orb of Annulment', gcp: "Gemcutter's Prism",
};

export class PricingEngine {
  private index = new NinjaIndex([]);
  private stats = new Map<string, TradeStat[]>();
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
    const route = routeItem(item);
    if (route !== 'trade') {
      const fromNinja = this.index.price(item);
      if (fromNinja) return fromNinja;
      if (route === 'ninja') return unpriced(item, 'Brak na poe.ninja');
    }
    if (item.frameType === 2 && this.stats.size > 0) return this.priceRare(item);
    return unpriced(item, 'Brak danych – wycena ręczna');
  }

  /** Searches for similar rares, loosening the query (fewer required mods) until there are enough results. */
  private async priceRare(item: PoeItem): Promise<PriceEstimate> {
    const filters = statFilters(item, this.stats);
    if (filters.filter((f) => f.weight >= 3).length === 0) {
      return { ...unpriced(item, 'Brak wartościowych modów – raczej do sprzedania u NPC'), confidence: 'medium' };
    }
    for (const keep of [6, 4, 3, 2]) {
      const query = buildRareQuery(item, filters, keep);
      const result = await this.trade.search(this.league, query, this.profile.realm);
      if (result.total < 5 && keep > 2) continue;
      const listings = await this.trade.fetch(result.result.slice(0, 20), result.id);
      const chosen = filters.filter((f) => f.weight >= 3).slice(0, keep);
      const comparables = listings.map((l) => ({
        ...toComparables([l], (c) => this.chaosRates.get(c) ?? null)[0],
        similarity: similarity(chosen, l.item, this.stats),
      })).filter((c) => c.chaos !== undefined);
      const summary = summarizeListings(comparables);
      return {
        itemId: item.id,
        source: 'trade',
        chaos: summary.chaos,
        low: summary.low,
        high: summary.high,
        confidence: summary.confidence,
        sampleSize: summary.used.length,
        note: `${summary.note}; wymagane mody: ${chosen.length}`,
        comparables: summary.used,
        tradeUrl: this.trade.tradeUrl(this.league, result.id, this.profile.realm),
      };
    }
    return unpriced(item, 'Brak podobnych ofert');
  }
}

function unpriced(item: PoeItem, note: string): PriceEstimate {
  return { itemId: item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note };
}
