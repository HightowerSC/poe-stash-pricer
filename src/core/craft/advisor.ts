// Craft advisor: can a mod be added so the item sells for more?
//  1. read prefix/suffix counts from the trade "extended" data,
//  2. list bench crafts that fit the slot and a free affix, plus random crafts (aug/regal/exalt),
//  3. price the item "with the added mod" on trade and compare with the current price minus craft cost.

import type { CraftOption, CraftReport, CraftSuggestion, PoeItem } from '../../shared/types';
import { rarity } from '../pricing/classify';
import { modWeight } from '../pricing/tradeQuery';
import { benchCraftsFor, RANDOM_CRAFTS, type Slot } from './benchCrafts';

export interface AffixInfo {
  prefixes: number;
  suffixes: number;
  maxPrefixes: number;
  maxSuffixes: number;
  /** Crafted mods of unknown affix type: they take a slot, but we do not know which. */
  unknownCrafted: number;
  /** A crafted mod is already present: a second one needs a meta-craft. */
  hasCrafted: boolean;
  /** false when the trade data has no affix info (we cannot tell what is free). */
  known: boolean;
}

export function itemSlot(item: PoeItem): Slot | null {
  const sub = item.extended?.subcategories ?? [];
  const cat = item.extended?.category;
  const base = item.baseType || item.typeLine || '';
  if (cat === 'jewels' || /Jewel$/.test(base)) return /Cluster|Eye Jewel$/.test(base) || sub.includes('abyss') || sub.includes('cluster') ? null : 'jewel';
  for (const s of ['boots', 'gloves', 'helmet', 'shield', 'ring', 'amulet', 'belt', 'quiver'] as const) if (sub.includes(s)) return s;
  if (sub.includes('chest')) return 'chest';
  if (cat === 'weapons' || cat === 'weapon') return 'weapon';
  if (/Boots|Greaves|Slippers|Shoes$/.test(base)) return 'boots';
  if (/Gloves|Gauntlets|Mitts$/.test(base)) return 'gloves';
  if (/Ring$/.test(base)) return 'ring';
  if (/Amulet|Talisman$/.test(base)) return 'amulet';
  if (/Belt|Sash|Stygian Vise$/.test(base)) return 'belt';
  if (/Quiver$/.test(base)) return 'quiver';
  return null;
}

export function affixInfo(item: PoeItem): AffixInfo {
  const r = rarity(item);
  const jewel = itemSlot(item) === 'jewel';
  const max = r === 'magic' ? 1 : r === 'rare' ? (jewel ? 2 : 3) : 0;
  const mods = item.extended?.mods?.explicit ?? [];
  const tiers = mods.map((m) => m.tier ?? '');
  const prefixes = tiers.filter((t) => t.startsWith('P')).length;
  const suffixes = tiers.filter((t) => t.startsWith('S')).length;
  const crafted = item.extended?.mods?.crafted ?? [];
  const cp = crafted.filter((m) => (m.tier ?? '').startsWith('P')).length;
  const cs = crafted.filter((m) => (m.tier ?? '').startsWith('S')).length;
  // Crafted mods whose affix type the trade data does not tell us.
  const unknownCrafted = Math.max(0, (item.craftedMods?.length ?? 0) - cp - cs);
  return {
    prefixes: prefixes + cp,
    suffixes: suffixes + cs,
    maxPrefixes: max,
    maxSuffixes: max,
    unknownCrafted,
    hasCrafted: (item.craftedMods?.length ?? 0) > 0,
    // Without tiers the free slots would be a guess.
    known: (item.explicitMods?.length ?? 0) === 0 || mods.length > 0,
  };
}

/** Everything that could add a mod to this item, without prices. */
export function craftOptions(item: PoeItem): { options: CraftOption[]; reason?: string; info: AffixInfo } {
  const info = affixInfo(item);
  const r = rarity(item);
  if (item.corrupted) return { options: [], info, reason: 'Przedmiot jest skażony – nie da się go craftować.' };
  if ((item as { mirrored?: boolean }).mirrored) return { options: [], info, reason: 'Przedmiot jest skopiowany (mirrored).' };
  if (r !== 'rare' && r !== 'magic') return { options: [], info, reason: 'Doradca obsługuje przedmioty magic i rare.' };
  if (!info.known) return { options: [], info, reason: 'Brak danych o prefiksach/sufiksach (pojawiają się po wycenie z trade).' };

  const freeP = info.maxPrefixes - info.prefixes;
  const freeS = info.maxSuffixes - info.suffixes;
  const freeAny = freeP + freeS - info.unknownCrafted;
  const options: CraftOption[] = [];
  // Bench mods share groups with explicit mods only (implicits do not block them).
  const existing = [...(item.explicitMods ?? []), ...(item.craftedMods ?? []), ...(item.fracturedMods ?? [])]
    .filter((l): l is string => typeof l === 'string');

  if (!info.hasCrafted && r === 'rare') {
    for (const c of benchCraftsFor(itemSlot(item))) {
      if ((c.affix === 'prefix' ? freeP : freeS) <= 0) continue;
      if (existing.some((l) => c.conflicts.test(l))) continue;
      options.push({ method: 'bench', label: `Bench: ${c.line}`, line: c.line, affix: c.affix, cost: c.cost, deterministic: true });
    }
  }
  if (r === 'magic' && freeAny > 0) {
    options.push({ method: 'aug', label: RANDOM_CRAFTS.aug.label, cost: { amount: 1, currency: RANDOM_CRAFTS.aug.currency }, deterministic: false });
  }
  if (r === 'magic') {
    options.push({ method: 'regal', label: RANDOM_CRAFTS.regal.label, cost: { amount: 1, currency: RANDOM_CRAFTS.regal.currency }, deterministic: false });
  }
  if (r === 'rare' && freeAny > 0) {
    options.push({ method: 'exalted', label: RANDOM_CRAFTS.exalted.label, cost: { amount: 1, currency: RANDOM_CRAFTS.exalted.currency }, deterministic: false });
  }
  const reason = options.length === 0
    ? freeAny <= 0 ? 'Brak wolnych prefiksów i sufiksów.' : 'Brak pasującego craftu z benchu.'
    : undefined;
  return { options, info, reason };
}

/**
 * The item as it would look after the craft. The line goes into explicit mods for the search,
 * because most comparable listings have that mod rolled, not crafted (life and resistances
 * are merged into pseudo totals anyway).
 */
export function withCraft(item: PoeItem, line: string): PoeItem {
  return { ...item, id: `${item.id}#craft`, explicitMods: [...(item.explicitMods ?? []), line] };
}

/** Ranks bench crafts by weight of the mod so only a few trade searches are needed. */
export function rankBench(options: CraftOption[], weight: (line: string) => number, limit = 3): CraftOption[] {
  return options
    .filter((o) => o.deterministic && o.line)
    .sort((a, b) => weight(b.line!) - weight(a.line!) || costOrder(a) - costOrder(b))
    .slice(0, limit);
}

const costOrder = (o: CraftOption) => (o.cost.currency === 'divine' ? 100 : 1) * o.cost.amount;

export function suggestion(option: CraftOption, current: number | null, after: number | null, costChaos: number | null, tradeUrl?: string): CraftSuggestion {
  const profit = after != null && costChaos != null ? Math.round(after - (current ?? 0) - costChaos) : null;
  return { option, priceAfter: after, costChaos, profit, tradeUrl };
}

export interface CraftPricer {
  tradePrice(item: PoeItem): Promise<{ chaos: number | null; tradeUrl?: string }>;
  chaosRate(code: string): number | null;
  weight(line: string): number;
}

/** Full report: bench crafts priced on trade (top 3 by mod value), random crafts with cost only. */
export async function craftReport(item: PoeItem, current: number | null, pricer: CraftPricer): Promise<CraftReport> {
  const { options, info, reason } = craftOptions(item);
  const cost = (o: CraftOption) => {
    const rate = o.cost.currency === 'chaos' ? 1 : pricer.chaosRate(o.cost.currency);
    return rate == null ? null : Math.round(o.cost.amount * rate * 10) / 10;
  };
  const suggestions: CraftSuggestion[] = [];
  for (const o of rankBench(options, pricer.weight)) {
    const after = await pricer.tradePrice(withCraft(item, o.line!));
    suggestions.push(suggestion(o, current, after.chaos, cost(o), after.tradeUrl));
  }
  suggestions.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  for (const o of options.filter((x) => !x.deterministic)) suggestions.push(suggestion(o, current, null, cost(o)));
  return {
    itemId: item.id,
    current,
    prefixes: info.known ? `${info.prefixes}/${info.maxPrefixes}` : '?',
    suffixes: info.known ? `${info.suffixes}/${info.maxSuffixes}` : '?',
    suggestions,
    reason,
  };
}

/** Demo / browser preview: no network, a pretend trade price that grows with the value of the added mod. */
export function demoCraftPricer(current: number | null, divine: number | null): CraftPricer {
  const rates: Record<string, number> = { divine: divine ?? 180, exalted: 12, aug: 0.1, regal: 0.5 };
  return {
    tradePrice: async (it) => ({ chaos: Math.round((current ?? 10) * (1 + modWeight(it.explicitMods?.at(-1) ?? '') / 12)) }),
    chaosRate: (c) => rates[c] ?? null,
    weight: modWeight,
  };
}
