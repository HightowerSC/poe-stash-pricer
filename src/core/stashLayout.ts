// Groups priced items by stash tab and works out how to draw each tab.

import type { ItemLocation, PricedItem } from '../shared/types';

export interface TabLayout {
  tab: string;
  /** 12 = normal/premium tab, 24 = quad tab, null = special tab (currency, fragments…) shown as a list. */
  grid: 12 | 24 | null;
  items: PricedItem[];
  totalChaos: number;
  /** From the stash API: tab type, order in game and colour of the tab. */
  type?: string;
  index?: number;
  color?: string;
}

/** Tab types that are a plain grid of cells; everything else (currency, fragment, essence, divination…) has its own layout. */
const GRID_TYPES: Record<string, 12 | 24> = { NormalStash: 12, PremiumStash: 12, QuadStash: 24 };

/** Polish name of a tab type for the legend under the picture. */
export function tabTypeLabel(type: string | undefined, grid: 12 | 24 | null): string {
  const names: Record<string, string> = {
    NormalStash: 'zwykła', PremiumStash: 'premium', QuadStash: 'quad (24×24)', CurrencyStash: 'waluty', FragmentStash: 'fragmentów',
    EssenceStash: 'esencji', DivinationCardStash: 'kart', MapStash: 'map', UniqueStash: 'unikatów', DelveStash: 'Delve',
    BlightStash: 'Blight', MetamorphStash: 'Metamorph', DeliriumStash: 'Delirium', GemStash: 'gemów', FlaskStash: 'flasek',
  };
  if (type && names[type]) return `Zakładka ${names[type]}`;
  return grid === 24 ? 'Zakładka quad (24×24)' : grid === 12 ? 'Zakładka 12×12' : 'Zakładka specjalna';
}

export function tabLayouts(items: PricedItem[]): TabLayout[] {
  const byTab = new Map<string, PricedItem[]>();
  for (const p of items) {
    if (!p.location || p.present === false) continue;
    byTab.set(p.location.tab, [...(byTab.get(p.location.tab) ?? []), p]);
  }
  return [...byTab.entries()]
    .map(([tab, list]): TabLayout => {
      const info = list.find((p) => p.location!.tabType)?.location;
      const known = info?.tabType ? GRID_TYPES[info.tabType] : undefined;
      const locs = list.map((p) => p.location!);
      // A known grid type wins, but only if the items really fit (otherwise fall back to tiles).
      const grid = info?.tabType ? (known && gridSize(locs) !== null && fits(locs, known) ? known : null) : gridSize(locs);
      return {
        tab,
        grid,
        items: list,
        totalChaos: Math.round(list.reduce((s, p) => s + (p.price.chaos ?? 0), 0)),
        type: info?.tabType,
        index: info?.tabIndex,
        color: info?.tabColor,
      };
    })
    // Same order as in game when the stash API told us; alphabetical otherwise.
    .sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9) || a.tab.localeCompare(b.tab, 'pl'));
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

function fits(locs: ItemLocation[], size: number): boolean {
  return locs.every((l) => l.x >= 0 && l.y >= 0 && l.x + l.w <= size && l.y + l.h <= size);
}

/** "Zakładka „Inbox”, kolumna 3, rząd 5" – 1-based, the way a player counts cells. */
export function positionLabel(loc: ItemLocation | undefined): string | null {
  if (!loc) return null;
  return `Zakładka „${loc.tab}”, kolumna ${loc.x + 1}, rząd ${loc.y + 1}`;
}
