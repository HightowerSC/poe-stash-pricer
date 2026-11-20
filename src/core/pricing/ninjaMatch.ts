// Matches one item against poe.ninja rows: currency-like items, uniques, gems, maps and bases.

import type { PoeItem, PriceEstimate } from '../../shared/types';
import type { NinjaRow } from '../ninja';

export function linkCount(item: PoeItem): number {
  if (!item.sockets?.length) return 0;
  const groups = new Map<number, number>();
  for (const s of item.sockets) groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
  return Math.max(...groups.values());
}

function prop(item: PoeItem, name: string): number | undefined {
  const p = item.properties?.find((x) => x.name === name);
  const raw = p?.values?.[0]?.[0];
  if (!raw) return undefined;
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

export class NinjaIndex {
  private byName = new Map<string, NinjaRow[]>();

  constructor(rows: NinjaRow[]) {
    for (const r of rows) {
      const key = r.name.toLowerCase();
      const list = this.byName.get(key) ?? [];
      list.push(r);
      this.byName.set(key, list);
    }
  }

  get size() {
    return this.byName.size;
  }

  /** Returns null when poe.ninja has no row for this item (the caller then uses the trade site). */
  price(item: PoeItem): PriceEstimate | null {
    const isUnique = item.frameType === 3 || item.frameType === 9;
    const isGem = item.frameType === 4;
    const key = (isUnique ? item.name : item.typeLine || item.baseType).toLowerCase();
    let candidates = this.byName.get(key);
    if (!candidates?.length) return null;

    if (isUnique) {
      const links = linkCount(item);
      const wanted = links >= 5 ? links : 0;
      const exact = candidates.filter((c) => (c.links ?? 0) === wanted);
      if (exact.length) candidates = exact;
      if (item.corrupted !== undefined) {
        const byCorr = candidates.filter((c) => c.corrupted === undefined || !!c.corrupted === !!item.corrupted);
        if (byCorr.length) candidates = byCorr;
      }
    }

    if (isGem) {
      const level = prop(item, 'Level') ?? 1;
      const quality = prop(item, 'Quality') ?? 0;
      const corrupted = !!item.corrupted;
      // Closest gem row by level, then quality, preferring the same corruption state.
      candidates = [...candidates].sort((a, b) => gemDistance(a, level, quality, corrupted) - gemDistance(b, level, quality, corrupted));
      candidates = candidates.slice(0, 1);
    }

    // Many rows left (e.g. variants): take the cheapest, so we never overprice.
    const row = candidates.reduce((min, r) => (r.chaosValue < min.chaosValue ? r : min));
    const qty = item.stackSize ?? 1;
    const listings = row.listingCount ?? row.count ?? 0;
    const confidence = listings >= 20 ? 'high' : listings >= 5 ? 'medium' : 'low';
    const unit = row.chaosValue;
    return {
      itemId: item.id,
      source: 'poe.ninja',
      chaos: round(unit * qty),
      low: round(unit * qty * 0.9),
      high: round(unit * qty * 1.1),
      confidence,
      sampleSize: listings,
      note: qty > 1 ? `${qty} × ${round(unit)}c (${row.category})` : `${row.category}${row.variant ? `, ${row.variant}` : ''}`,
    };
  }
}

function gemDistance(r: NinjaRow, level: number, quality: number, corrupted: boolean): number {
  return Math.abs((r.gemLevel ?? 1) - level) * 10 + Math.abs((r.gemQuality ?? 0) - quality) + (!!r.corrupted !== corrupted ? 50 : 0);
}

export const round = (n: number) => Math.round(n * 100) / 100;
