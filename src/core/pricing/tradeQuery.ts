// Builds trade-site queries for anything priced by comparable listings, the way Awakened PoE Trade does:
//  - each mod line is mapped to a trade stat id (numbers -> "#", option stats such as cluster enchants included),
//  - resistances and life are merged into pseudo stats so differently-rolled items still compare,
//  - the most valuable mods are required at ~85% of our roll,
//  - item-type filters depend on the kind: bases (ilvl, influence, fractured), jewels (category),
//    cluster jewels (enchant, passive count, notables), timeless jewels (exact seed).

import type { PoeItem } from '../../shared/types';
import { classify, clusterInfo, influenceNames, rarity, type ItemKind } from './classify';

export interface TradeStat {
  id: string;
  text: string;
  type: string;
  options?: { id: number; text: string }[];
}

export interface StatFilter {
  id: string;
  text: string;
  min?: number;
  max?: number;
  option?: number;
  weight: number;
  /** Must stay in the query even when loosening (cluster notables, enchants, timeless seed). */
  required?: boolean;
}

interface IndexedStat { stat: TradeStat; option?: number }

export type StatIndex = Map<string, IndexedStat[]>;

// ---------- weights ----------

const WEIGHTS: [RegExp, number][] = [
  [/^1 Added Passive Skill is /, 9],
  [/to Level of all .*Gems|to Level of Socketed .*Gems/i, 10],
  [/increased maximum Life|to maximum Life/i, 10],
  [/increased Movement Speed/i, 9],
  [/to Damage over Time Multiplier/i, 9],
  [/Critical Strike Multiplier/i, 8],
  [/increased maximum Energy Shield|to maximum Energy Shield/i, 8],
  [/increased Physical Damage$/i, 8],
  [/Suppress Spell Damage/i, 8],
  [/increased Spell Damage|increased Damage with .* Skills/i, 7],
  [/to all Elemental Resistances|Elemental Resistance/i, 6],
  [/to Chaos Resistance/i, 6],
  [/Resistance/i, 5],
  [/increased Attack Speed|increased Cast Speed/i, 6],
  [/Adds .* Damage/i, 6],
  [/Critical Strike Chance/i, 5],
  [/increased (Fire|Cold|Lightning|Chaos|Elemental) Damage/i, 5],
  [/Minions/i, 6],
  [/Aura|Reservation Efficiency/i, 7],
  [/to (Strength|Dexterity|Intelligence|all Attributes)/i, 3],
  [/increased Rarity of Items/i, 3],
  [/Accuracy|Stun|Light Radius|Mana Regeneration|Life Regeneration|Knockback|Thorns|reflect/i, 1],
];

export function modWeight(line: string): number {
  for (const [re, w] of WEIGHTS) if (re.test(line)) return w;
  return 2;
}

// ---------- stat index ----------

export function normalizeMod(line: string): { text: string; value?: number } {
  const nums = line.match(/[+-]?\d+(\.\d+)?/g) ?? [];
  const values = nums.map(Number);
  const value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const text = line.replace(/[+-]?\d+(\.\d+)?/g, '#').replace(/\+#/g, '#').trim();
  return { text, value };
}

const key = (s: string) => s.replace(/\+#/g, '#').toLowerCase();

export function buildStatIndex(stats: TradeStat[]): StatIndex {
  const map: StatIndex = new Map();
  const add = (k: string, v: IndexedStat) => map.set(key(k), [...(map.get(key(k)) ?? []), v]);
  for (const s of stats) {
    if (s.options?.length) {
      for (const o of s.options) add(s.text.replace('#', o.text), { stat: s, option: o.id });
    } else {
      add(s.text, { stat: s });
    }
  }
  return map;
}

function lookup(index: StatIndex, line: string, type: string): { hit: IndexedStat; value?: number } | null {
  const exact = index.get(key(line));
  if (exact?.length) return { hit: exact.find((h) => h.stat.type === type) ?? exact[0] };
  const { text, value } = normalizeMod(line);
  const list = index.get(key(text));
  if (!list?.length) return null;
  return { hit: list.find((h) => h.stat.type === type) ?? list[0], value };
}

// ---------- pseudo stats ----------

const RES_PATTERNS: [RegExp, number][] = [
  [/^\+?(\d+)% to (Fire|Cold|Lightning) Resistance$/, 1],
  [/^\+?(\d+)% to (Fire and Cold|Fire and Lightning|Cold and Lightning) Resistances$/, 2],
  [/^\+?(\d+)% to all Elemental Resistances$/, 3],
];

export function pseudoTotals(item: PoeItem): { eleRes: number; life: number; resLines: string[]; lifeLines: string[] } {
  const lines = [...(item.implicitMods ?? []), ...(item.explicitMods ?? []), ...(item.craftedMods ?? []), ...(item.fracturedMods ?? [])]
    .filter((l): l is string => typeof l === 'string');
  let eleRes = 0;
  let life = 0;
  const resLines: string[] = [];
  const lifeLines: string[] = [];
  for (const l of lines) {
    for (const [re, mult] of RES_PATTERNS) {
      const m = l.match(re);
      if (m) { eleRes += Number(m[1]) * mult; resLines.push(l); }
    }
    let m = l.match(/^\+?(\d+) to maximum Life$/);
    if (m) { life += Number(m[1]); lifeLines.push(l); }
    m = l.match(/^\+?(\d+) to (Strength|all Attributes)$/) ?? l.match(/^\+?(\d+) to Strength and (Dexterity|Intelligence)$/);
    if (m) life += Math.floor(Number(m[1]) / 2);
  }
  return { eleRes, life, resLines, lifeLines };
}

// ---------- filters ----------

export function statFilters(item: PoeItem, index: StatIndex, ratio = 0.85): StatFilter[] {
  const kind = classify(item);
  const out: StatFilter[] = [];
  const usePseudo = kind === 'equipment';
  const pseudo = usePseudo ? pseudoTotals(item) : null;
  const skip = new Set<string>();
  if (pseudo && pseudo.resLines.length >= 1) {
    pseudo.resLines.forEach((l) => skip.add(l));
    out.push({ id: 'pseudo.pseudo_total_elemental_resistance', text: `+${pseudo.eleRes}% łącznej odporności na żywioły`, min: Math.floor(pseudo.eleRes * ratio), weight: pseudo.eleRes >= 80 ? 8 : 6 });
  }
  if (pseudo && pseudo.lifeLines.length >= 1) {
    pseudo.lifeLines.forEach((l) => skip.add(l));
    out.push({ id: 'pseudo.pseudo_total_life', text: `+${pseudo.life} łącznego życia`, min: Math.floor(pseudo.life * ratio), weight: 10 });
  }

  const groups: [string, string[] | undefined][] = [
    ['explicit', item.explicitMods],
    ['implicit', item.implicitMods],
    ['crafted', item.craftedMods],
    ['fractured', item.fracturedMods],
    ['enchant', kind === 'clusterJewel' ? item.enchantMods : undefined],
  ];
  for (const [type, lines] of groups) {
    for (const line of lines ?? []) {
      if (typeof line !== 'string' || skip.has(line)) continue;
      const found = lookup(index, line, type);
      if (!found) continue;
      const { hit, value } = found;
      const f: StatFilter = { id: hit.stat.id, text: line, weight: modWeight(line), option: hit.option };
      if (kind === 'timeless') {
        // The seed must match exactly; the conqueror name is part of the stat text.
        f.min = value; f.max = value; f.required = true; f.weight = 20;
      } else if (kind === 'clusterJewel' && type === 'enchant') {
        f.required = true; f.weight = 15;
        if (/^Adds # Passive Skills/.test(hit.stat.text) && value !== undefined) { f.min = value; f.max = value; }
      } else if (/^1 Added Passive Skill is /.test(line)) {
        f.required = true;
      } else if (value !== undefined) {
        f.min = Math.floor(value * ratio);
      }
      out.push(f);
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Whether an item is worth a trade search based on its mods. */
export function hasValuableMods(filters: StatFilter[]): boolean {
  return filters.some((f) => f.required || f.weight >= 6);
}

const CATEGORY: Partial<Record<ItemKind, string>> = {
  jewel: 'jewel.base',
  abyssJewel: 'jewel.abyss',
  clusterJewel: 'jewel.cluster',
  flask: 'flask',
};

export interface QueryOptions {
  /** How many optional (non-required) mods to require. */
  keep: number;
  /** Price as a plain base: ignore mods, filter on ilvl/influence. */
  baseOnly?: boolean;
}

export function buildQuery(item: PoeItem, filters: StatFilter[], opts: QueryOptions) {
  const kind = classify(item);
  const r = rarity(item);
  const required = opts.baseOnly ? [] : filters.filter((f) => f.required);
  const optional = opts.baseOnly ? [] : filters.filter((f) => !f.required && f.weight >= 3).slice(0, opts.keep);
  const chosen = [...required, ...optional];

  const misc: Record<string, unknown> = {};
  const typeFilters: Record<string, unknown> = {};
  const query: Record<string, any> = { status: { option: 'online' } };

  if (kind === 'unique' || kind === 'timeless') {
    query.name = item.name;
    query.type = item.baseType || item.typeLine;
  } else if (CATEGORY[kind] && r === 'rare') {
    typeFilters.category = { option: CATEGORY[kind] };
  } else {
    query.type = item.baseType || item.typeLine;
  }

  if (r === 'rare' || r === 'magic' || r === 'normal') {
    typeFilters.rarity = { option: opts.baseOnly ? 'nonunique' : r === 'rare' ? 'rare' : 'nonunique' };
  }
  if (item.corrupted !== undefined && kind !== 'currency') misc.corrupted = { option: item.corrupted ? 'true' : 'false' };

  // Bases and cluster jewels: item level matters (crafting tiers / notable availability).
  if (opts.baseOnly || kind === 'clusterJewel') {
    const ilvl = item.ilvl >= 86 ? 86 : item.ilvl >= 84 ? 84 : item.ilvl >= 82 ? 82 : item.ilvl >= 75 ? 75 : 0;
    if (ilvl) misc.ilvl = { min: ilvl };
  }
  for (const inf of influenceNames(item)) misc[`${inf}_item`] = { option: 'true' };
  if (item.fractured) misc.fractured_item = { option: 'true' };
  if (item.synthesised) misc.synthesised_item = { option: 'true' };

  query.stats = [{
    type: 'and',
    filters: chosen.map((f) => {
      const value: Record<string, number> = {};
      if (f.min !== undefined) value.min = f.min;
      if (f.max !== undefined) value.max = f.max;
      if (f.option !== undefined) value.option = f.option;
      return { id: f.id, value };
    }),
  }];
  query.filters = {
    type_filters: { filters: typeFilters },
    misc_filters: { filters: misc },
    trade_filters: { filters: { sale_type: { option: 'priced' } } },
  };
  return { query, sort: { price: 'asc' }, chosen };
}

/** Similarity of a listed item to ours: share of our chosen filters that it satisfies. */
export function similarity(chosen: StatFilter[], theirs: PoeItem, index: StatIndex): number {
  if (chosen.length === 0) return 1;
  const theirFilters = statFilters(theirs, index, 1);
  let score = 0;
  for (const f of chosen) {
    const match = theirFilters.find((t) => t.id === f.id && (f.option === undefined || t.option === f.option));
    if (!match) continue;
    score += f.min !== undefined && match.min !== undefined && match.min < f.min ? 0.5 : 1;
  }
  return score / chosen.length;
}
