// Groups priced items by stash tab and works out how to draw each tab.

import type { ItemLocation, PricedItem } from '../shared/types';

export interface TabLayout {
  tab: string;
  /** 12 = normal/premium tab, 24 = quad tab, null = special tab (currency, fragments…) shown as a list. */
  grid: 12 | 24 | null;
  items: PricedItem[];
  totalChaos: number;
}

export function tabLayouts(items: PricedItem[]): TabLayout[] {
  const byTab = new Map<string, PricedItem[]>();
  for (const p of items) {
    if (!p.location || p.present === false) continue;
    byTab.set(p.location.tab, [...(byTab.get(p.location.tab) ?? []), p]);
  }
  return [...byTab.entries()]
    .map(([tab, list]) => ({
      tab,
      grid: gridSize(list.map((p) => p.location!)),
      items: list,
      totalChaos: Math.round(list.reduce((s, p) => s + (p.price.chaos ?? 0), 0)),
    }))
    .sort((a, b) => a.tab.localeCompare(b.tab, 'pl'));
}

/**
 * Normal tabs are 12×12 cells, quad tabs 24×24. Special tabs (currency, fragments, maps…)
 * report slot numbers that do not fit a grid, or several items in one cell.
 */
export function gridSize(locs: ItemLocation[]): 12 | 24 | null {
  if (locs.length === 0) return 12;
  const maxX = Math.max(...locs.map((l) => l.x + l.w));
  const maxY = Math.max(...locs.map((l) => l.y + l.h));
  const size = maxX <= 12 && maxY <= 12 ? 12 : maxX <= 24 && maxY <= 24 ? 24 : null;
  if (size === null) return null;
  const taken = new Set<string>();
  for (const l of locs) {
    for (let dx = 0; dx < l.w; dx++) {
      for (let dy = 0; dy < l.h; dy++) {
        const k = `${l.x + dx},${l.y + dy}`;
        if (taken.has(k)) return null;
        taken.add(k);
      }
    }
  }
  return size;
}

/** "Zakładka „Inbox”, kolumna 3, rząd 5" – 1-based, the way a player counts cells. */
export function positionLabel(loc: ItemLocation | undefined): string | null {
  if (!loc) return null;
  return `Zakładka „${loc.tab}”, kolumna ${loc.x + 1}, rząd ${loc.y + 1}`;
}
