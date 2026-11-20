"use strict";
// CSV export that opens correctly in Excel with Polish regional settings (semicolons, decimal comma, BOM).
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = toCsv;
const priceNote_1 = require("./priceNote");
const HEADERS = ['Data', 'Nazwa', 'Baza', 'Rzadkość', 'ilvl', 'Ilość', 'Cena (chaos)', 'Od', 'Do', 'Cena (divine)', 'Pewność', 'Źródło', 'Rada', 'Notka', 'Uwagi', 'Link trade'];
const RARITY = ['Normal', 'Magic', 'Rare', 'Unique', 'Gem', 'Waluta', 'Karta', '', '', 'Relikt'];
function cell(v) {
    if (v === null || v === undefined)
        return '';
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(items, divineRate) {
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
        (0, priceNote_1.priceNote)(p.price.chaos, divineRate) ?? '',
        p.price.note,
        p.price.tradeUrl ?? '',
    ].map(cell).join(';'));
    return '﻿' + [HEADERS.join(';'), ...rows].join('\r\n');
}
