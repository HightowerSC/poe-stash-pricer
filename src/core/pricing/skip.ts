// The user's choice of item kinds that are not priced from the stash (saves requests and keeps the list short).

import type { PoeItem, Profile } from '../../shared/types';
import { classify } from './classify';

export type SkipPrefs = Pick<Profile, 'skipCurrency' | 'skipUniques'>;

/** True when the stash scan should leave this item unpriced. */
export function isSkipped(item: PoeItem, p: SkipPrefs | null | undefined): boolean {
  if (!p || (!p.skipCurrency && !p.skipUniques)) return false;
  const kind = classify(item);
  if (p.skipCurrency && kind === 'currency') return true;
  if (p.skipUniques && (kind === 'unique' || kind === 'timeless')) return true;
  return false;
}
