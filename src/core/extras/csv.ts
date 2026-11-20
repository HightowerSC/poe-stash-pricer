// CSV export that opens correctly in Excel with Polish regional settings (semicolons, decimal comma, BOM).

import type { PricedItem } from '../../shared/types';
import { priceNote } from './priceNote';

const HEADERS = ['Data', 'Nazwa', 'Baza', 'Rzadkość', 'ilvl', 'Ilość', 'Cena (chaos)', 'Od', 'Do', 'Cena (divine)', 'Pewność', 'Źródło', 'Rada', 'Notka', 'Uwagi', 'Link trade'];
const RARITY = ['Normal', 'Magic', 'Rare', 'Unique', 'Gem', 'Waluta', 'Karta', '', '', 'Relikt'];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(items: PricedItem[], divineRate: number | null): string {
  const rows = items.map((p) => [
    p.firstSeen.replace('T', ' ').slice(0, 19),
    p.item.name || p.item.typeLine,
    p.item.baseType || p.item.typeLine,
    RARITY[p.item.frameType] ?? '',
    p.item.ilvl || '',
    p.item.stackSize ?? 1,
    p.price.chaos,
    p.price.low,
    p.price.high,
    divineRate && p.price.chaos != null ? p.price.chaos / divineRate : null,
    p.price.confidence,
    p.price.source,
    p.advice?.label ?? '',
    priceNote(p.price.chaos, divineRate) ?? '',
    p.price.note,
    p.price.tradeUrl ?? '',
  ].map(cell).join(';'));
  return '﻿' + [HEADERS.join(';'), ...rows].join('\r\n');
}
