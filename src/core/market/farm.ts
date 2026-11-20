// Farm profitability: a run = a farming session with one strategy (e.g. "Essence + Harbinger").
// Loot = value of items that appeared in the stash during the run; cost = maps × cost per map.

import type { FarmRun, FarmStrategySummary, PricedItem } from '../../shared/types';

/** Items first seen during [start, end): the loot of the run. */
export function runLoot(items: PricedItem[], startedAt: string, endedAt: string | null): { chaos: number; count: number } {
  const a = Date.parse(startedAt);
  const b = endedAt ? Date.parse(endedAt) : Infinity;
  let chaos = 0;
  let count = 0;
  for (const p of items) {
    const t = Date.parse(p.firstSeen);
    if (t >= a && t < b) { chaos += p.price.chaos ?? 0; count++; }
  }
  return { chaos: Math.round(chaos), count };
}

export function runProfit(r: FarmRun): number {
  return Math.round(r.lootChaos + r.extraChaos - r.maps * r.costPerMap);
}

export function summarizeStrategies(runs: FarmRun[]): FarmStrategySummary[] {
  const by = new Map<string, FarmRun[]>();
  for (const r of runs) {
    if (!r.endedAt) continue;
    const k = r.strategy.trim() || 'Bez nazwy';
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out: FarmStrategySummary[] = [];
  for (const [strategy, list] of by) {
    const maps = list.reduce((s, r) => s + r.maps, 0);
    const profit = list.reduce((s, r) => s + runProfit(r), 0);
    const hours = list.reduce((s, r) => s + (Date.parse(r.endedAt!) - Date.parse(r.startedAt)) / 3_600_000, 0);
    out.push({
      strategy, runs: list.length, maps, profit,
      perMap: maps ? Math.round(profit / maps) : null,
      perHour: hours > 0.05 ? Math.round(profit / hours) : null,
    });
  }
  return out.sort((a, b) => (b.perHour ?? -Infinity) - (a.perHour ?? -Infinity));
}
