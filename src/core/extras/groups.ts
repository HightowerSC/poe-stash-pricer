// Sorting priced items into groups: by kind (currency, uniques, rares…) and by price band,
// with a suggested stash tab for each group. The app never moves items in the game (GGG rules);
// it only tells the player where an item would fit.

import type { PricedItem } from '../../shared/types';
import { classify, rarity } from '../pricing/classify';
import { isBelowMin } from '../config';

export interface Group {
  key: string;
  label: string;
  /** Where to keep these items in the stash. */
  suggestedTab: string;
  items: PricedItem[];
  totalChaos: number;
}

const KIND_GROUPS: { key: string; label: string; tab: string }[] = [
  { key: 'special', label: '★ Wartościowe corrupty i warianty', tab: 'Sprawdź ręcznie' },
  { key: 'currency', label: 'Waluta i fragmenty', tab: 'Currency' },
  { key: 'card', label: 'Karty', tab: 'Divination' },
  { key: 'gem', label: 'Gemy', tab: 'Gemy' },
  { key: 'map', label: 'Mapy', tab: 'Map' },
  { key: 'unique', label: 'Unikaty', tab: 'Unikaty' },
  { key: 'jewel', label: 'Jewele (w tym cluster i abyss)', tab: 'Jewele' },
  { key: 'rare', label: 'Rare', tab: 'Sprzedaż' },
  { key: 'base', label: 'Bazy (normal/magic)', tab: 'Bazy' },
  { key: 'flask', label: 'Flaszki', tab: 'Sprzedaż' },
  { key: 'vendor', label: 'Do sprzedania u NPC / tanie', tab: 'Vendor' },
  { key: 'other', label: 'Inne', tab: 'Inne' },
];

export function kindGroup(p: PricedItem, minValue: number): string {
  if (p.price.specialMods?.length || p.price.lowerBound) return 'special';
  const kind = classify(p.item);
  if (kind === 'currency' || kind === 'card' || kind === 'gem' || kind === 'map') return kind;
  if (isBelowMin(p.price.chaos, minValue) || p.advice?.action === 'vendor' || p.advice?.action === 'recipe') return 'vendor';
  if (kind === 'unique' || kind === 'timeless') return 'unique';
  if (kind === 'jewel' || kind === 'abyssJewel' || kind === 'clusterJewel') return 'jewel';
  if (kind === 'flask') return 'flask';
  if (kind === 'equipment') return rarity(p.item) === 'rare' ? 'rare' : 'base';
  return 'other';
}

export function priceBand(chaos: number | null, divine: number | null, minValue: number): { key: string; label: string; order: number } {
  const div = divine ?? 180;
  if (chaos == null) return { key: 'none', label: 'Bez ceny', order: 6 };
  if (minValue > 0 && chaos < minValue) return { key: 'below', label: `Poniżej minimum (< ${minValue}c)`, order: 5 };
  if (chaos >= div * 10) return { key: 'd10', label: '10+ divine', order: 0 };
  if (chaos >= div) return { key: 'd1', label: '1–10 divine', order: 1 };
  if (chaos >= 50) return { key: 'c50', label: `50c – 1 divine`, order: 2 };
  if (chaos >= 10) return { key: 'c10', label: '10–50c', order: 3 };
  return { key: 'c0', label: 'Poniżej 10c', order: 4 };
}

const sum = (items: PricedItem[]) => items.reduce((s, p) => s + (p.price.chaos ?? 0), 0);

export function groupByKind(items: PricedItem[], minValue: number): Group[] {
  const map = new Map<string, PricedItem[]>();
  for (const p of items) {
    const k = kindGroup(p, minValue);
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  return KIND_GROUPS.filter((g) => map.has(g.key)).map((g) => {
    const list = map.get(g.key)!.sort((a, b) => (b.price.chaos ?? -1) - (a.price.chaos ?? -1));
    return { key: g.key, label: g.label, suggestedTab: g.tab, items: list, totalChaos: sum(list) };
  });
}

export function groupByPrice(items: PricedItem[], divine: number | null, minValue: number): Group[] {
  const map = new Map<string, { label: string; order: number; items: PricedItem[] }>();
  for (const p of items) {
    const b = priceBand(p.price.chaos, divine, minValue);
    const g = map.get(b.key) ?? { label: b.label, order: b.order, items: [] };
    g.items.push(p);
    map.set(b.key, g);
  }
  return [...map.entries()].sort((a, b) => a[1].order - b[1].order).map(([key, g]) => {
    const list = g.items.sort((a, b) => (b.price.chaos ?? -1) - (a.price.chaos ?? -1));
    return { key, label: g.label, suggestedTab: key === 'below' || key === 'none' ? 'Vendor' : 'Sprzedaż', items: list, totalChaos: sum(list) };
  });
}

/** Suggested tab for one item (shown in the details panel). */
export function suggestedTab(p: PricedItem, minValue: number): string {
  const k = kindGroup(p, minValue);
  return KIND_GROUPS.find((g) => g.key === k)?.tab ?? 'Inne';
}

/** By the stash tab the item lies in (items without a known position go to "Bez pozycji"). */
export function groupByTab(items: PricedItem[]): Group[] {
  const map = new Map<string, PricedItem[]>();
  for (const p of items) {
    const tab = p.location?.tab ?? '';
    map.set(tab, [...(map.get(tab) ?? []), p]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0], 'pl')))
    .map(([tab, list]) => {
      const sorted = list.sort((a, b) => (b.price.chaos ?? -1) - (a.price.chaos ?? -1));
      return { key: `tab-${tab}`, label: tab ? `Zakładka „${tab}”` : 'Bez pozycji w skrzyni', suggestedTab: tab || '—', items: sorted, totalChaos: sum(sorted) };
    });
}
