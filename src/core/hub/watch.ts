// PoE HUB – background upgrade watch: every N minutes re-reads the character, searches trade for
// its weakest slots and reports offers within the player's budget (once per offer).

import type { UpgradeResult, UpgradeWatchFind, UpgradeWatchSettings } from '../../shared/types';

export const MIN_WATCH_MINUTES = 15;

export function normalizeWatch(s: Partial<UpgradeWatchSettings> | null | undefined): UpgradeWatchSettings {
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    enabled: !!s?.enabled,
    character: String(s?.character ?? '').slice(0, 100),
    budgetChaos: num(s?.budgetChaos, 50),
    everyMinutes: Math.max(MIN_WATCH_MINUTES, num(s?.everyMinutes, 30)),
  };
}

/** Cheapest offer per slot within budget that was not reported before; marks it as reported. */
export function newFinds(results: UpgradeResult[], budgetChaos: number, reported: Set<string>, at = new Date().toISOString()): UpgradeWatchFind[] {
  const out: UpgradeWatchFind[] = [];
  for (const r of results) {
    const best = r.offers
      .filter((o) => o.chaos != null && o.chaos <= budgetChaos)
      .sort((a, b) => (a.chaos ?? 0) - (b.chaos ?? 0))[0];
    if (!best) continue;
    const key = `${r.slot}|${best.name}|${best.chaos}`;
    if (reported.has(key)) continue;
    reported.add(key);
    out.push({ slot: r.slot, name: best.name, chaos: best.chaos!, wants: r.wants, tradeUrl: r.tradeUrl, at });
  }
  return out;
}
