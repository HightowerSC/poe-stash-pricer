// Bulk selling: stackable items (currency, fragments, scarabs, essences, cards…) grouped by name,
// priced a bit under market for a quick sale, with ready messages and stash price notes.

import type { PricedItem } from '../../shared/types';
import { classify } from '../pricing/classify';

export interface BulkLot {
  name: string;
  count: number;
  /** Market price per unit (chaos). */
  unit: number;
  /** Asking price per unit after the discount (chaos). */
  ask: number;
  total: number;
  /** "~price 1.8 chaos" – set on the stack/tab in the stash so it shows up in bulk exchange. */
  note: string;
  message: string;
}

export interface BulkOptions {
  discountPct: number;
  minLotChaos: number;
  divine: number | null;
}

const NOT_FOR_SALE = new Set(['Chaos Orb']);

/** Stackable, priced items worth selling in bulk. */
export function isBulkItem(p: PricedItem): boolean {
  const kind = classify(p.item);
  if (NOT_FOR_SALE.has(p.item.typeLine)) return false;
  if (!p.price.chaos || p.price.chaos <= 0) return false;
  return kind === 'currency' || kind === 'card' || (kind !== 'equipment' && kind !== 'gem' && (p.item.stackSize ?? 0) > 1) || /Scarab|Fragment|Splinter|Essence|Fossil|Catalyst|Oil|Emblem|Invitation/.test(p.item.typeLine);
}

export function bulkLots(items: PricedItem[], opts: BulkOptions): BulkLot[] {
  const byName = new Map<string, { count: number; chaos: number }>();
  for (const p of items) {
    if (p.present === false || !isBulkItem(p)) continue;
    const name = p.item.typeLine || p.item.name;
    const g = byName.get(name) ?? { count: 0, chaos: 0 };
    g.count += Math.max(1, p.item.stackSize ?? 1);
    g.chaos += p.price.chaos ?? 0;
    byName.set(name, g);
  }
  const factor = 1 - Math.min(Math.max(opts.discountPct, 0), 90) / 100;
  const lots: BulkLot[] = [];
  for (const [name, g] of byName) {
    const unit = g.chaos / g.count;
    const ask = unit * factor;
    const total = ask * g.count;
    if (total < opts.minLotChaos) continue;
    lots.push({ name, count: g.count, unit: r(unit), ask: r(ask), total: Math.round(total), note: priceNote(ask, opts.divine), message: `WTS ${g.count}x ${name} ${fmt(ask, opts.divine)} each (${fmt(total, opts.divine)} all)` });
  }
  return lots.sort((a, b) => b.total - a.total);
}

/** Trade-chat lines (each under the chat limit) listing several lots. */
export function bulkMessages(lots: BulkLot[], divine: number | null, max = 240): string[] {
  const lines: string[] = [];
  let cur = 'WTS bulk:';
  for (const l of lots) {
    const part = ` ${l.count}x ${l.name} ${fmt(l.ask, divine)} ea,`;
    if ((cur + part).length > max) { lines.push(cur.replace(/,$/, '')); cur = 'WTS bulk:'; }
    cur += part;
  }
  if (cur !== 'WTS bulk:') lines.push(cur.replace(/,$/, ''));
  return lines.map((l) => `${l} – PM`);
}

/** Price note per unit: chaos with up to 2 decimals, or divine for expensive items. */
export function priceNote(ask: number, divine: number | null): string {
  if (divine && ask >= divine) return `~price ${trim(ask / divine)} divine`;
  return `~price ${trim(ask)} chaos`;
}

function fmt(chaos: number, divine: number | null): string {
  if (divine && chaos >= divine) return `${trim(chaos / divine)}div`;
  return `${trim(chaos)}c`;
}

const trim = (v: number) => String(v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
const r = (v: number) => Math.round(v * 100) / 100;
