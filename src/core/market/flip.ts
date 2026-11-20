// Currency flipping: the gap between what sellers ask and what buyers pay on the bulk exchange.
// A flipper buys at the buyers' price (posting a buy offer) and sells at the sellers' price.

import type { ExchangeOffer } from '../trade';
import type { FlipRow } from '../../shared/types';
import { quantile } from '../pricing/listings';

/** Currencies worth checking (trade exchange ids) with their names. */
export const FLIP_CURRENCIES: [string, string][] = [
  ['divine', 'Divine Orb'], ['exalted', 'Exalted Orb'], ['alch', 'Orb of Alchemy'], ['alt', 'Orb of Alteration'],
  ['fusing', 'Orb of Fusing'], ['chrome', 'Chromatic Orb'], ['jewellers', "Jeweller's Orb"], ['scour', 'Orb of Scouring'],
  ['regal', 'Regal Orb'], ['vaal', 'Vaal Orb'], ['gcp', "Gemcutter's Prism"], ['annul', 'Orb of Annulment'],
];

/** Typical price of the first few offers (skips the single best one, often a bait or tiny stock). */
function typical(prices: number[], dir: 'low' | 'high'): number | null {
  const s = [...prices].sort((a, b) => (dir === 'low' ? a - b : b - a)).slice(0, 6);
  if (!s.length) return null;
  return quantile(s.length > 2 ? s.slice(1) : s, 0.5);
}

/**
 * ask = chaos per unit that sellers want (offers giving X for chaos);
 * bid = chaos per unit that buyers pay (offers giving chaos for X).
 */
export function flipRow(id: string, name: string, sellers: ExchangeOffer[], buyers: ExchangeOffer[], ninjaChaos: number | null): FlipRow {
  const ask = typical(sellers.filter((o) => o.stock >= 1).map((o) => o.take / o.give), 'low');
  const bid = typical(buyers.map((o) => o.give / o.take), 'high');
  const margin = ask != null && bid != null && bid > 0 ? (ask - bid) / bid : null;
  return {
    id, name, ask: round(ask), bid: round(bid), ninja: round(ninjaChaos),
    marginPct: margin == null ? null : Math.round(margin * 1000) / 10,
    sellers: sellers.length, buyers: buyers.length,
    whisperBuy: sellers.find((o) => o.whisper)?.whisper,
  };
}

const round = (v: number | null) => (v == null ? null : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000);

/** Most interesting first: positive margin with enough offers on both sides. */
export function rankFlips(rows: FlipRow[]): FlipRow[] {
  const score = (r: FlipRow) => (r.marginPct ?? -999) * Math.min(1, Math.min(r.sellers, r.buyers) / 5);
  return [...rows].sort((a, b) => score(b) - score(a));
}
