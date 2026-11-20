// Builds a trade query for a rare item the way Awakened PoE Trade does:
// map each mod line to a trade stat id (numbers replaced with "#"), keep the valuable mods,
// require ~85% of each rolled value, and loosen the query step by step if there are too few results.

import type { PoeItem } from '../../shared/types';

/** One entry from /api/trade/data/stats, flattened. */
export interface TradeStat { id: string; text: string; type: string }

export interface StatFilter { id: string; min?: number; text: string; weight: number }

/** Rough importance of common mods. Unknown mods get a low weight and are dropped first. */
const WEIGHTS: [RegExp, number][] = [
  [/to maximum Life/i, 10],
  [/to Level of all/i, 10],
  [/increased Movement Speed/i, 9],
  [/to maximum Energy Shield/i, 8],
  [/increased Physical Damage/i, 8],
  [/Critical Strike Multiplier/i, 7],
  [/increased Spell Damage/i, 7],
  [/to all Elemental Resistances/i, 7],
  [/Resistance/i, 6],
  [/increased Attack Speed|increased Cast Speed/i, 6],
  [/Adds .* Damage/i, 6],
  [/to (Strength|Dexterity|Intelligence)/i, 3],
  [/Accuracy|Stun|Light Radius|Mana Regeneration/i, 1],
];

export function modWeight(line: string): number {
  for (const [re, w] of WEIGHTS) if (re.test(line)) return w;
  return 2;
}

export function normalizeMod(line: string): { text: string; value?: number } {
  const nums = line.match(/[+-]?\d+(\.\d+)?/g) ?? [];
  const values = nums.map(Number);
  const value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const text = line.replace(/[+-]?\d+(\.\d+)?/g, '#').replace(/\+#/g, '#').trim();
  return { text, value };
}

export function buildStatIndex(stats: TradeStat[]): Map<string, TradeStat[]> {
  const map = new Map<string, TradeStat[]>();
  for (const s of stats) {
    const key = s.text.replace(/\+#/g, '#').toLowerCase();
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return map;
}

export function statFilters(item: PoeItem, index: Map<string, TradeStat[]>, ratio = 0.85): StatFilter[] {
  const groups: [string, string[] | undefined][] = [
    ['explicit', item.explicitMods],
    ['implicit', item.implicitMods],
    ['crafted', item.craftedMods],
    ['fractured', item.fracturedMods],
  ];
  const out: StatFilter[] = [];
  for (const [type, lines] of groups) {
    for (const line of lines ?? []) {
      const { text, value } = normalizeMod(line);
      const stat = index.get(text.toLowerCase())?.find((s) => s.type === type) ?? index.get(text.toLowerCase())?.[0];
      if (!stat) continue;
      out.push({
        id: stat.id,
        text: line,
        min: value !== undefined ? Math.floor(value * ratio) : undefined,
        weight: modWeight(line),
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Query for similar items. `keep` = how many of the most valuable mods to require. */
export function buildRareQuery(item: PoeItem, filters: StatFilter[], keep: number) {
  const chosen = filters.filter((f) => f.weight >= 3).slice(0, keep);
  return {
    query: {
      status: { option: 'online' },
      type: item.baseType || item.typeLine,
      stats: [{ type: 'and', filters: chosen.map((f) => ({ id: f.id, value: f.min !== undefined ? { min: f.min } : {} })) }],
      filters: {
        misc_filters: { filters: { corrupted: { option: item.corrupted ? 'true' : 'false' } } },
        trade_filters: { filters: { sale_type: { option: 'priced' } } },
      },
    },
    sort: { price: 'asc' },
  };
}

/** Similarity of a listed item to ours: share of our chosen mods that it has at >= our min. */
export function similarity(ours: StatFilter[], theirs: PoeItem, index: Map<string, TradeStat[]>): number {
  if (ours.length === 0) return 0;
  const theirFilters = statFilters(theirs, index, 1);
  let score = 0;
  for (const f of ours) {
    const match = theirFilters.find((t) => t.id === f.id);
    if (match) score += match.min !== undefined && f.min !== undefined && match.min < f.min ? 0.5 : 1;
  }
  return score / ours.length;
}
