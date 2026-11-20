// Demo state shared by Electron's demo mode and the browser preview.

import type { PricedItem, PricePoint } from '../shared/types';
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

export function demoItems(): PricedItem[] {
  return sampleItems().map((p, i) => ({ ...p, advice: advise(p.item, p.price, { sellMinChaos: 5 }), history: demoHistory(p.price.chaos, 12, i) }));
}

export function demoValue(items: PricedItem[]): PricePoint[] {
  return demoHistory(items.reduce((s, i) => s + (i.price.chaos ?? 0), 0), 24);
}
