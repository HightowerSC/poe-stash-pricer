// Turns trade-site listings for similar items into one suggested price, the way a careful player would:
// convert to chaos, drop old and suspiciously cheap listings, then use the low quartile of the rest.

import type { ComparableListing, Confidence } from '../../shared/types';
import { round } from './ninjaMatch';

export interface ListingSummary {
  chaos: number | null;
  low: number | null;
  high: number | null;
  confidence: Confidence;
  used: ComparableListing[];
  /** Listings left out as suspicious, with the reason. */
  suspicious: ComparableListing[];
  note: string;
}

const MAX_AGE_DAYS = 7;

export function summarizeListings(listings: ComparableListing[], now = Date.now()): ListingSummary {
  const fresh = listings.filter((l) => {
    if (!l.indexedAt) return true;
    return now - Date.parse(l.indexedAt) <= MAX_AGE_DAYS * 86_400_000;
  });
  const sorted = [...fresh].filter((l) => l.chaos > 0).sort((a, b) => a.chaos - b.chaos);
  if (sorted.length === 0) {
    return { chaos: null, low: null, high: null, confidence: 'low', used: [], suspicious: [], note: 'Brak porównywalnych ofert' };
  }

  const { kept, flooded } = onePerSeller(sorted);
  const cleaned = dropPriceFixers(kept);
  const baits = kept.slice(0, kept.length - cleaned.length);
  const suspicious = [
    ...baits.map((l) => ({ ...l, suspicious: 'dużo taniej od reszty – zwykle przynęta (price-fixing) albo pomyłka' })),
    ...flooded.map((l) => ({ ...l, suspicious: 'ten sam sprzedawca wystawia wiele kopii – liczony raz' })),
  ];
  const top = cleaned.slice(0, 10);
  const q1 = quantile(top.map((l) => l.chaos), 0.25);
  const median = quantile(top.map((l) => l.chaos), 0.5);
  const avgSimilarity = top.reduce((s, l) => s + l.similarity, 0) / top.length;

  let confidence: Confidence = 'low';
  if (top.length >= 8 && avgSimilarity >= 0.8) confidence = 'high';
  else if (top.length >= 4 && avgSimilarity >= 0.6) confidence = 'medium';

  return {
    chaos: round((q1 + median) / 2),
    low: round(top[0].chaos),
    high: round(median),
    confidence,
    used: top,
    suspicious,
    note: `${top.length} ofert` + (suspicious.length ? ` (pominięto ${suspicious.length} podejrzanych)` : ''),
  };
}

/**
 * One seller listing many copies can move the median (a common way to fake a price):
 * keep only the cheapest listing per seller. Listings without a seller are all kept.
 */
export function onePerSeller(sorted: ComparableListing[]): { kept: ComparableListing[]; flooded: ComparableListing[] } {
  const seen = new Set<string>();
  const kept: ComparableListing[] = [];
  const flooded: ComparableListing[] = [];
  for (const l of sorted) {
    if (l.seller && seen.has(l.seller)) { flooded.push(l); continue; }
    if (l.seller) seen.add(l.seller);
    kept.push(l);
  }
  return { kept, flooded };
}

/**
 * Listings far below the next ones are usually bait (price-fixing) or mistakes.
 * A listing is dropped while it costs less than 50% of the median of the following five.
 */
export function dropPriceFixers(sorted: ComparableListing[]): ComparableListing[] {
  let start = 0;
  while (start < sorted.length - 3) {
    const next = sorted.slice(start + 1, start + 6).map((l) => l.chaos);
    if (sorted[start].chaos < quantile(next, 0.5) * 0.5) start++;
    else break;
  }
  return sorted.slice(start);
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
