// PoE HUB – character diagnosis and gear upgrade hints, built on the Postać tab data:
//  - what is missing (uncapped resistances, negative chaos res, little life from gear…),
//  - cheap fixes first: bench crafts on items with a free affix,
//  - per slot: a trade search for a better item (keeps what the current item gives and adds what is missing).

import type { CharacterView, EquippedItem } from '../../shared/types';
import { craftOptions, itemSlot } from '../craft/advisor';
import { benchCraftsFor } from '../craft/benchCrafts';
import { pseudoTotals } from '../pricing/tradeQuery';

export interface Issue {
  severity: 'high' | 'medium' | 'low';
  text: string;
}

export interface QuickFix {
  slot: string;
  itemName: string;
  craft: string;
  cost: { amount: number; currency: string };
  fixes: string;
  /** false = the item may have no free prefix/suffix (character items carry no affix data). */
  sure: boolean;
}

export interface Diagnosis {
  issues: Issue[];
  quickFixes: QuickFix[];
  /** Slots worth upgrading first (weakest rare/magic gear by life + resistances). */
  weakestSlots: string[];
  deficits: { fire: number; cold: number; lightning: number; chaos: number };
}

const RES_CAP = 75;
const ELEMENTS = [['fire', 'Odporność na ogień', 'Fire'], ['cold', 'Odporność na zimno', 'Cold'], ['lightning', 'Odporność na błyskawice', 'Lightning']] as const;

const statValue = (view: CharacterView, label: string) => view.stats.find((s) => s.label === label)?.value ?? 0;

export function diagnose(view: CharacterView): Diagnosis {
  const issues: Issue[] = [];
  const deficits = { fire: 0, cold: 0, lightning: 0, chaos: 0 };
  for (const [key, label, en] of ELEMENTS) {
    const v = statValue(view, label);
    const missing = RES_CAP - v;
    if (missing > 0) {
      deficits[key] = missing;
      issues.push({ severity: missing >= 20 ? 'high' : 'medium', text: `${label}: ${v}% z ekwipunku – brakuje ${missing}% do 75% (${en}). Drzewko i flaszki mogą część pokryć.` });
    }
  }
  const chaos = statValue(view, 'Odporność na chaos');
  if (chaos < 0) {
    deficits.chaos = -chaos;
    issues.push({ severity: 'medium', text: `Odporność na chaos jest ujemna z ekwipunku (${chaos}%).` });
  } else if (view.summary.level >= 85 && chaos < 20) {
    deficits.chaos = 20 - chaos;
    issues.push({ severity: 'low', text: `Mało odporności na chaos (${chaos}%) – w mapach T16 warto mieć co najmniej 20–40%.` });
  }
  const life = statValue(view, 'Życie z ekwipunku');
  const es = statValue(view, 'Energy Shield (przedmioty)');
  if (es < 1000 && view.summary.level >= 70 && life < view.summary.level * 6) {
    issues.push({ severity: 'medium', text: `Mało życia z ekwipunku (+${life}). Na poziomie ${view.summary.level} rare zwykle dają razem ${view.summary.level * 7}+.` });
  }
  const ms = statValue(view, 'Szybkość ruchu');
  if (!view.items.some((e) => e.slot === 'Boots' && /Movement Speed/.test([...(e.item.explicitMods ?? []), ...(e.item.craftedMods ?? []), ...(e.item.implicitMods ?? [])].join('\n')))) {
    issues.push({ severity: 'low', text: `Buty bez szybkości ruchu (łącznie z ekwipunku: ${ms}%).` });
  }
  const gear = view.items.filter((e) => e.slot !== 'Flask' && !/2$/.test(e.slot) || e.slot === 'Ring2');
  if (gear.filter((e) => e.slot !== 'Weapon' && e.slot !== 'Offhand').length < 7) {
    issues.push({ severity: 'high', text: 'Brakuje części ekwipunku – każdy pusty slot to dużo życia i odporności.' });
  }

  // Cheap fixes: bench crafts for missing resistances on items with a free suffix.
  const quickFixes: QuickFix[] = [];
  for (const e of gear) {
    for (const o of benchOptions(e)) {
      if (o.method !== 'bench' || !o.line) continue;
      const helps = ELEMENTS.filter(([key, , en]) => deficits[key] > 0 && new RegExp(en).test(o.line!)).map(([, label]) => label.replace('Odporność na ', ''));
      const chaosHelps = deficits.chaos > 0 && /Chaos Resistance/.test(o.line);
      const lifeHelps = /maximum Life/.test(o.line) && life < view.summary.level * 6;
      if (!helps.length && !chaosHelps && !lifeHelps) continue;
      quickFixes.push({
        slot: e.slot,
        itemName: e.item.name || e.item.typeLine,
        craft: o.line,
        cost: o.cost,
        fixes: [...helps, ...(chaosHelps ? ['chaos'] : []), ...(lifeHelps ? ['życie'] : [])].join(', '),
        sure: o.sure,
      });
    }
  }
  quickFixes.sort((a, b) => Number(b.sure) - Number(a.sure) || b.fixes.split(',').length - a.fixes.split(',').length || costOrder(a.cost) - costOrder(b.cost));

  const weakestSlots = gear
    .filter((e) => (e.item.frameType === 1 || e.item.frameType === 2) && UPGRADE_CATEGORY[e.slot])
    .map((e) => ({ slot: e.slot, score: itemScore(e) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((x) => x.slot);

  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, quickFixes: dedupeFixes(quickFixes).slice(0, 6), weakestSlots, deficits };
}

// Character items have no trade "extended" data, so tell the craft advisor which slot the item is in.
const SLOT_SUB: Record<string, string> = {
  Helm: 'helmet', BodyArmour: 'chest', Gloves: 'gloves', Boots: 'boots', Ring: 'ring', Ring2: 'ring', Amulet: 'amulet', Belt: 'belt', Offhand: 'shield',
};

function withSlot(e: EquippedItem): EquippedItem['item'] {
  const sub = SLOT_SUB[e.slot];
  if (!sub || e.item.extended?.subcategories?.length) return e.item;
  return { ...e.item, extended: { ...e.item.extended, category: 'armour', subcategories: [sub] } };
}

/**
 * Bench crafts that fit this item. With affix data (stash/trade items) the craft advisor decides;
 * character items have none, so: no crafted mod, not corrupted, and a rare with ≤2 own mods (magic ≤1)
 * surely has a free prefix and suffix; a rare with 3–5 mods has a free slot of unknown kind ("maybe").
 */
function benchOptions(e: EquippedItem): { line?: string; method: string; cost: { amount: number; currency: string }; sure: boolean }[] {
  const it = withSlot(e);
  const known = craftOptions(it);
  if (known.info.known) return known.options.map((o) => ({ ...o, sure: true }));
  if (it.corrupted || it.craftedMods?.length || (it.frameType !== 1 && it.frameType !== 2)) return [];
  const own = (it.explicitMods ?? []).length;
  const max = it.frameType === 1 ? 2 : 6;
  if (own >= max) return [];
  const sure = it.frameType === 1 ? own <= 1 : own <= 2;
  const lines = [...(it.explicitMods ?? []), ...(it.implicitMods ?? [])];
  return benchCraftsFor(itemSlot(it))
    .filter((c) => !lines.some((l) => c.conflicts.test(l)))
    .map((c) => ({ line: c.line, method: 'bench', cost: c.cost, sure }));
}

const costOrder = (c: { amount: number; currency: string }) => (c.currency === 'divine' ? 150 : 1) * c.amount;

function dedupeFixes(list: QuickFix[]): QuickFix[] {
  const seen = new Set<string>();
  return list.filter((f) => { const k = `${f.slot}|${f.fixes}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function itemScore(e: EquippedItem): number {
  const p = pseudoTotals(e.item);
  return p.life + p.eleRes;
}

/** Trade item category per equipment slot. */
export const UPGRADE_CATEGORY: Record<string, string> = {
  Helm: 'armour.helmet', BodyArmour: 'armour.chest', Gloves: 'armour.gloves', Boots: 'armour.boots',
  Ring: 'accessory.ring', Ring2: 'accessory.ring', Amulet: 'accessory.amulet', Belt: 'accessory.belt', Offhand: 'armour.shield',
};

const RES_LINE = (en: string) => new RegExp(`^([+-]?\\d+)% to (?:.*\\b${en}\\b.*Resistances?|all Elemental Resistances)$`);

/** Resistance of one element on an item (single, dual and all-res lines). */
export function itemRes(e: EquippedItem, en: 'Fire' | 'Cold' | 'Lightning' | 'Chaos'): number {
  const lines = [...(e.item.implicitMods ?? []), ...(e.item.explicitMods ?? []), ...(e.item.craftedMods ?? [])];
  let sum = 0;
  for (const l of lines) {
    const m = typeof l === 'string' ? l.match(RES_LINE(en)) : null;
    if (m && !(en === 'Chaos' && /Elemental/.test(l))) sum += Number(m[1]);
  }
  return sum;
}

/**
 * Trade query for a better item in this slot: at least the life and resistances the current item gives,
 * plus up to 40% of each missing resistance; boots keep movement speed.
 */
export function upgradeQuery(e: EquippedItem, deficits: Diagnosis['deficits']) {
  const category = UPGRADE_CATEGORY[e.slot];
  if (!category) return null;
  const p = pseudoTotals(e.item);
  const filters: { id: string; value: { min: number } }[] = [];
  const wants: string[] = [];
  const life = Math.max(p.life, /ring|amulet|belt/.test(category) ? 40 : 60);
  filters.push({ id: 'pseudo.pseudo_total_life', value: { min: life } });
  wants.push(`życie ${life}+`);
  for (const [key, , en] of ELEMENTS) {
    const now = itemRes(e, en);
    const want = now + Math.min(deficits[key], 40);
    if (want > 0) {
      filters.push({ id: `pseudo.pseudo_total_${key}_resistance`, value: { min: want } });
      wants.push(`${en.toLowerCase()} res ${want}%+`);
    }
  }
  const chaosNow = itemRes(e, 'Chaos');
  const chaosWant = chaosNow + Math.min(deficits.chaos, 25);
  if (chaosWant > 0) {
    filters.push({ id: 'pseudo.pseudo_total_chaos_resistance', value: { min: chaosWant } });
    wants.push(`chaos res ${chaosWant}%+`);
  }
  if (e.slot === 'Boots') {
    const ms = Number(([...(e.item.explicitMods ?? []), ...(e.item.craftedMods ?? [])].join('\n').match(/(\d+)% increased Movement Speed/) ?? [])[1] ?? 0);
    const want = Math.max(ms, 20);
    filters.push({ id: 'pseudo.pseudo_increased_movement_speed', value: { min: want } });
    wants.push(`ruch ${want}%+`);
  }
  return {
    query: {
      query: {
        status: { option: 'online' },
        stats: [{ type: 'and', filters }],
        filters: {
          type_filters: { filters: { category: { option: category }, rarity: { option: 'nonunique' } } },
          trade_filters: { filters: { sale_type: { option: 'priced' } } },
        },
      },
      sort: { price: 'asc' },
    },
    wants,
  };
}
