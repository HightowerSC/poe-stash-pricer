// Who gets notified about what: one place that decides it for system pop-ups, Discord and the upgrade watch.

import type { Profile } from '../../shared/types';

/** Used only until poe.ninja tells us the real divine price. */
export const FALLBACK_DIVINE_CHAOS = 150;

type NotifyPrefs = Pick<Profile, 'notifyMode' | 'notifyMinChaos' | 'notifyUnit'>;

/** The profile's notification threshold converted to chaos. */
export function notifyThresholdChaos(p: NotifyPrefs, divineRate: number | null | undefined): number {
  const amount = Math.max(0, Number(p.notifyMinChaos) || 0);
  if (p.notifyUnit !== 'divine') return amount;
  return amount * (divineRate && divineRate > 0 ? divineRate : FALLBACK_DIVINE_CHAOS);
}

/** Should a newly priced item worth `chaos` trigger a notification? */
export function shouldNotifyItem(p: NotifyPrefs, chaos: number | null | undefined, divineRate: number | null | undefined): boolean {
  if (p.notifyMode === 'off') return false;
  if (p.notifyMode === 'all') return true;
  return (chaos ?? 0) >= notifyThresholdChaos(p, divineRate);
}

/** Upgrade-watch finds are already limited by the watch budget, so only 'off' silences them. */
export function shouldNotifyUpgrade(p: NotifyPrefs | null): boolean {
  return !p || p.notifyMode !== 'off';
}
