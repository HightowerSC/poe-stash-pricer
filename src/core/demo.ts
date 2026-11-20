// Demo state shared by Electron's demo mode and the browser preview.

import type { ItemLocation, PricedItem, PricePoint } from '../shared/types';
import { sampleItems } from './sampleItems';
import { advise } from './extras/advice';

export function demoHistory(chaos: number | null, points = 12, seed = 0): PricePoint[] {
  if (!chaos) return [];
  const now = Date.now();
  const slope = [0.25, -0.15, 0.05, 0.4, -0.3, 0.1, 0][seed % 7];
  return Array.from({ length: points }, (_, i) => ({
    t: new Date(now - (points - i) * 3_600_000).toISOString(),
    chaos: Math.round(chaos * (1 + slope * ((i + 1) / points - 1) + 0.04 * Math.sin(i * 1.7 + seed)) * 100) / 100,
  }));
}

/** Demo positions: two normal tabs, items placed like a player would. */
const DEMO_LOCATIONS: Record<string, ItemLocation> = {
  s1: { tab: 'Inbox', x: 0, y: 0, w: 1, h: 1 },
  s2: { tab: 'Inbox', x: 2, y: 0, w: 2, h: 2 },
  s3: { tab: 'Inbox', x: 5, y: 0, w: 2, h: 1 },
  s4: { tab: 'Inbox', x: 0, y: 2, w: 1, h: 1 },
  s6: { tab: 'Jewele', x: 0, y: 0, w: 1, h: 1 },
  s7: { tab: 'Jewele', x: 1, y: 0, w: 1, h: 1 },
  s5: { tab: 'Inbox', x: 8, y: 3, w: 2, h: 2 },
  s8: { tab: 'Inbox', x: 10, y: 0, w: 2, h: 3 },
};

export function demoItems(): PricedItem[] {
  return sampleItems().map((p, i) => ({
    ...p,
    item: { ...p.item, w: DEMO_LOCATIONS[p.item.id]?.w, h: DEMO_LOCATIONS[p.item.id]?.h },
    location: DEMO_LOCATIONS[p.item.id],
    present: true,
    advice: advise(p.item, p.price, { sellMinChaos: 5 }),
    history: demoHistory(p.price.chaos, 12, i),
  }));
}

export function demoValue(items: PricedItem[]): PricePoint[] {
  return demoHistory(items.reduce((s, i) => s + (i.price.chaos ?? 0), 0), 24);
}
