// Ties the sources together. Strategy per item kind:
//  currency / cards / gems / maps / uniques -> poe.ninja (uniques missing there -> trade by name)
//  normal & magic bases                      -> valuable mods? trade : poe.ninja BaseType, then trade as a base
//  rare equipment, jewels, abyss jewels      -> trade, comparable listings
//  cluster jewels                            -> poe.ninja for plain ones, trade (enchant + notables) otherwise
//  timeless jewels                           -> trade with the exact seed

import type { PoeItem, PriceEstimate, Profile } from '../shared/types';
import { NinjaClient } from './ninja';
import type { FetchLike } from './http';
import { poepricesOpinion } from './extras/poeprices';
import { normalizeItem } from './normalize';
import { TradeClient, toComparables } from './trade';
import { NinjaIndex } from './pricing/ninjaMatch';
import { summarizeListings } from './pricing/listings';
import { classify, clusterInfo, influenceNames, rarity, valuableSpecialMods } from './pricing/classify';
import { buildQuery, buildStatIndex, hasValuableMods, similarity, statFilters, type QueryOptions, type StatFilter, type StatIndex, type TradeStat } from './pricing/tradeQuery';

/** Trade currency codes -> poe.ninja names, for converting listing prices to chaos. */
const CURRENCY_NAMES: Record<string, string> = {
  chaos: 'Chaos Orb', divine: 'Divine Orb', exalted: 'Exalted Orb', alch: 'Orb of Alchemy',
  alt: 'Orb of Alteration', fusing: 'Orb of Fusing', chance: 'Orb of Chance', vaal: 'Vaal Orb',
  regal: 'Regal Orb', mirror: 'Mirror of Kalandra', annul: 'Orb of Annulment', gcp: "Gemcutter's Prism",
  aug: 'Orb of Augmentation', transmute: 'Orb of Transmutation',
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
    private readonly poepricesFetch: FetchLike = fetch,
  ) {}

  async refreshPrices(force = false, onProgress?: (done: number, total: number, failed: number) => void) {
    const rows = await this.ninja.allPrices(this.league, force, onProgress);
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
    if (!item.baseType && item.typeLine) item = { ...item, baseType: this.index.findBase(item.typeLine) ?? item.typeLine };
    const estimate = await this.priceInner(item);
    if (this.profile.usePoeprices && rarity(item) === 'rare' && item.identified !== false) {
      const op = await poepricesOpinion(this.poepricesFetch, this.league, item);
      if (op) {
        const rate = op.currency === 'divine' ? this.chaosRates.get('divine') ?? 0 : 1;
        estimate.poeprices = { ...op, chaos: Math.round(((op.min + op.max) / 2) * rate) };
      }
    }
    return estimate;
  }

  private async priceInner(item: PoeItem): Promise<PriceEstimate> {
    const kind = classify(item);
    const r = rarity(item);

    switch (kind) {
      case 'currency':
      case 'card':
      case 'gem':
      case 'map':
        return this.index.price(item) ?? (kind === 'gem' || kind === 'map' ? this.byTrade(item, { baseOnly: true }) : unpriced(item, 'Brak na poe.ninja'));
      case 'unique':
        return this.priceUnique(item);
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
        // Saver mode: one good mod is rarely worth trade requests – ask trade only for 2+ (or a required one).
        const good = filters.filter((f) => f.required || f.weight >= 6);
        const enough = this.profile.tradeMode === 'normal' ? hasValuableMods(filters) : good.some((f) => f.required) || good.length >= 2;
        if ((r === 'rare' || r === 'magic') && enough) return withSpecial(item, await this.byTrade(item, {}));
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

  /**
   * Uniques, in order:
   *  1. valuable corrupted implicits -> trade with those mods required (they can multiply the price),
   *  2. poe.ninja row (links / corruption variant),
   *  3. trade by name, then without special filters,
   *  4. special variant missing everywhere ("Voidborn The Covenant") -> price of the plain unique.
   * Whenever a special mod or variant is ignored, the price is marked as a lower bound.
   */
  private async priceUnique(item: PoeItem): Promise<PriceEstimate> {
    const special = valuableSpecialMods(item);
    if (special.length && this.stats.size) {
      const only = { ...item, explicitMods: [], craftedMods: [], fracturedMods: [], enchantMods: [], implicitMods: special };
      const filters = statFilters(only, this.stats).map((f) => ({ ...f, required: true }));
      if (filters.length) {
        const withMods = await this.byTrade(item, { filters, strict: true });
        if (withMods.chaos != null) return { ...withMods, specialMods: special, note: `z modami: ${special.join(' | ')}; ${withMods.note}` };
      }
    }
    const lowerBound = (e: PriceEstimate, why: string): PriceEstimate =>
      ({ ...e, specialMods: special.length ? special : undefined, lowerBound: true, confidence: 'low', note: `${why} – cena może być wyższa; ${e.note}` });

    const ninja = this.index.price(item);
    if (ninja) return special.length ? lowerBound(ninja, `bez wartościowego corruptu (${special.join(' | ')})`) : ninja;

    const byName = await this.byTrade(item, { baseOnly: true });
    if (byName.chaos != null) return special.length ? lowerBound(byName, 'bez wartościowego corruptu') : byName;

    const plain = this.index.plainUniqueName(item.name);
    if (plain) {
      const variant = item.name.slice(0, item.name.length - plain.length).trim();
      const plainPrice = this.index.price({ ...item, name: plain }) ?? await this.byTrade(item, { baseOnly: true, name: plain });
      if (plainPrice.chaos != null) return lowerBound(plainPrice, `wariant „${variant}” nie ma własnych ofert, podaję cenę zwykłej wersji ${plain}`);
    }
    return byName;
  }

  /** Public for the craft advisor: price an item from comparable trade listings. */
  tradePrice(item: PoeItem): Promise<PriceEstimate> {
    return this.byTrade(item, {});
  }

  /** Chaos value of a trade currency code (chaos, divine, exalted, aug, regal…), null when unknown. */
  chaosRate(code: string): number | null {
    return this.chaosRates.get(code) ?? this.index.valueOf(code);
  }

  /**
   * Comparable listings, loosening the query until there are enough results:
   * first fewer optional mods, then (last resort) without special filters like influence or ilvl.
   * Corruption is only dropped from the filters for normal items; strict=true never relaxes.
   */
  private async byTrade(item: PoeItem, opts: { baseOnly?: boolean; filters?: StatFilter[]; strict?: boolean; name?: string }): Promise<PriceEstimate> {
    if (this.stats.size === 0 && !opts.baseOnly) return unpriced(item, 'Brak danych statystyk trade');
    const filters = opts.filters ?? statFilters(item, this.stats);
    // 'saver' mode: at most 2 searches + 1 fetch per item; 'normal': up to 6 searches + 2 fetches.
    const saver = this.profile.tradeMode !== 'normal';
    const keeps = opts.baseOnly || opts.filters ? [0] : saver ? [4, 2] : [6, 4, 3, 2, 1];
    const steps: QueryOptions[] = keeps.map((keep) => ({ keep, baseOnly: opts.baseOnly, name: opts.name }));
    if (!opts.strict && !saver) steps.push({ ...steps[steps.length - 1], relaxMisc: true });
    let last: { id: string; ids: string[]; chosen: ReturnType<typeof buildQuery>['chosen']; relaxed: string[] } | null = null;

    for (const step of steps) {
      const { query, sort, chosen, relaxed } = buildQuery(item, filters, step);
      if (step.relaxMisc && relaxed.length === 0) break; // nothing left to relax
      const result = await this.trade.search(this.league, { query, sort }, this.profile.realm);
      if (result.result.length || !last) last = { id: result.id, ids: result.result, chosen, relaxed };
      if (result.total >= MIN_RESULTS) break;
    }
    if (!last || last.ids.length === 0) return unpriced(item, 'Brak podobnych ofert na trade');

    const listings = await this.trade.fetch(last.ids.slice(0, saver ? 10 : 20), last.id);
    const comparables = listings.flatMap((l) =>
      toComparables([l], (c) => this.chaosRates.get(c) ?? null, similarity(last!.chosen, normalizeItem(l.item), this.stats)),
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
      note: `${summary.note}; filtry: ${last.chosen.length ? last.chosen.map((c) => c.text).join(' | ') : 'baza'}${dropped(filters, last.chosen, last.relaxed)}`,
      lowerBound: last.relaxed.length > 0 || undefined,
      comparables: [...summary.used, ...summary.suspicious.slice(0, 5)],
      tradeUrl: this.trade.tradeUrl(this.league, last.id, this.profile.realm),
    };
  }
}

/** "; pominięto: …" – valuable mods and special filters the final query had to leave out. */
function dropped(all: StatFilter[], chosen: StatFilter[], relaxed: string[]): string {
  const skipped = all.filter((f) => f.weight >= 6 && !chosen.includes(f)).map((f) => f.text);
  const parts = [...skipped, ...relaxed];
  return parts.length ? `; pominięto: ${parts.join(' | ')}` : '';
}

/** Rares/magic: mark valuable corrupted implicits so the UI can highlight them. */
function withSpecial(item: PoeItem, e: PriceEstimate): PriceEstimate {
  const special = valuableSpecialMods(item);
  return special.length ? { ...e, specialMods: special } : e;
}

/** Bases worth checking: high item level, influenced, fractured, synthesised. */
export function isInterestingBase(item: PoeItem): boolean {
  return item.ilvl >= 82 || influenceNames(item).length > 0 || !!item.fractured || !!item.synthesised;
}

function unpriced(item: PoeItem, note: string): PriceEstimate {
  return { itemId: item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note };
}
