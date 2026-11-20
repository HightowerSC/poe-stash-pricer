// Matches one item against poe.ninja rows: currency-like items, uniques, gems, maps and bases.

import type { PoeItem, PriceEstimate } from '../../shared/types';
import type { NinjaRow } from '../ninja';
import { clusterInfo, ninjaInfluenceVariant } from './classify';

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
  private clusterRows: NinjaRow[] = [];

  constructor(rows: NinjaRow[]) {
    this.clusterRows = rows.filter((r) => r.category === 'ClusterJewel');
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

  /**
   * Normal/magic bases worth crafting on: poe.ninja's BaseType table lists them by item level (82+)
   * and influence. Picks the row with the highest item level not above ours.
   */
  priceBase(item: PoeItem): PriceEstimate | null {
    const base = item.baseType || item.typeLine;
    const variant = ninjaInfluenceVariant(item);
    const rows = (this.byName.get(base.toLowerCase()) ?? []).filter(
      (r) => r.category === 'BaseType' && (r.variant ?? null) === variant && (r.levelRequired ?? 0) <= item.ilvl,
    );
    if (!rows.length) return null;
    const row = rows.reduce((best, r) => ((r.levelRequired ?? 0) > (best.levelRequired ?? 0) ? r : best));
    return fromRow(item, row, `Baza ilvl ${row.levelRequired ?? '?'}${variant ? `, ${variant}` : ''}`);
  }

  /** Normal/magic cluster jewels: matched by enchant, passive count and item level. */
  priceCluster(item: PoeItem): PriceEstimate | null {
    const info = clusterInfo(item);
    if (!info.enchant) return null;
    const wanted = simplify(info.enchant);
    const rows = this.clusterRows.filter((r) => {
      if ((r.levelRequired ?? 0) > item.ilvl) return false;
      if (info.passives && r.variant && !r.variant.startsWith(`${info.passives} `)) return false;
      const name = simplify(r.name);
      return name.includes(wanted) || wanted.includes(name);
    });
    if (!rows.length) return null;
    const row = rows.reduce((best, r) => ((r.levelRequired ?? 0) > (best.levelRequired ?? 0) ? r : best));
    return fromRow(item, row, `Cluster ${info.passives} pasywek, ilvl ${row.levelRequired ?? '?'}`);
  }

  /** Magic items copied in game carry affixes in the name ("Hale Two-Toned Boots of the Fox"): find the base. */
  findBase(text: string): string | null {
    const lower = text.toLowerCase();
    let best: string | null = null;
    for (const [name, rows] of this.byName) {
      if (!rows.some((r) => r.category === 'BaseType')) continue;
      if (lower.includes(name) && (!best || name.length > best.length)) best = name;
    }
    if (!best) return null;
    return this.byName.get(best)![0].name;
  }

  /**
   * Special unique variants ("Voidborn The Covenant", "Foulborn …") are often missing on poe.ninja.
   * Returns the plain unique name when dropping the first word(s) gives a known unique, else null.
   */
  plainUniqueName(name: string): string | null {
    const words = name.trim().split(/\s+/);
    for (let i = 1; i <= 2 && i < words.length; i++) {
      const rest = words.slice(i).join(' ');
      const rows = this.byName.get(rest.toLowerCase());
      if (rows?.some((r) => r.category !== 'BaseType' && r.category !== 'ClusterJewel')) return rest;
    }
    return null;
  }

  /** Returns null when poe.ninja has no row for this item (the caller then uses the trade site). */
  price(item: PoeItem): PriceEstimate | null {
    const isUnique = item.frameType === 3 || item.frameType === 9;
    const isGem = item.frameType === 4;
    const key = (isUnique ? item.name : item.typeLine || item.baseType).toLowerCase();
    // Bases and cluster jewels have their own matchers (item level, influence, enchant).
    let candidates = this.byName.get(key)?.filter((c) => c.category !== 'BaseType' && c.category !== 'ClusterJewel');
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
      change7d: row.change7d,
      note: qty > 1 ? `${qty} × ${round(unit)}c (${row.category})` : `${row.category}${row.variant ? `, ${row.variant}` : ''}`,
    };
  }
}

function fromRow(item: PoeItem, row: NinjaRow, note: string): PriceEstimate {
  const listings = row.listingCount ?? row.count ?? 0;
  return {
    itemId: item.id,
    source: 'poe.ninja',
    chaos: round(row.chaosValue),
    low: round(row.chaosValue * 0.85),
    high: round(row.chaosValue * 1.1),
    confidence: listings >= 20 ? 'high' : listings >= 5 ? 'medium' : 'low',
    sampleSize: listings,
    note,
    change7d: row.change7d,
  };
}

const simplify = (s: string) => s.toLowerCase().replace(/[\d%+#.]/g, '').replace(/\s+/g, ' ').trim();

function gemDistance(r: NinjaRow, level: number, quality: number, corrupted: boolean): number {
  return Math.abs((r.gemLevel ?? 1) - level) * 10 + Math.abs((r.gemQuality ?? 0) - quality) + (!!r.corrupted !== corrupted ? 50 : 0);
}

export const round = (n: number) => Math.round(n * 100) / 100;
