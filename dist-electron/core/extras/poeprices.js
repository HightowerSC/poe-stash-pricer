"use strict";
// Second opinion for rares from poeprices.info (machine-learning price prediction).
// The service takes the item in the game's Ctrl+C text format, base64-encoded.
// It may be slow or down, so callers use a short timeout and treat failure as "no opinion".
Object.defineProperty(exports, "__esModule", { value: true });
exports.itemToText = itemToText;
exports.poepricesOpinion = poepricesOpinion;
const http_1 = require("../http");
const classify_1 = require("../pricing/classify");
const RARITY_TEXT = { normal: 'Normal', magic: 'Magic', rare: 'Rare', unique: 'Unique', other: 'Normal' };
const SEP = '--------';
/** Rebuilds the text the game puts on the clipboard for an item. */
function itemToText(item) {
    const parts = [];
    const head = [`Rarity: ${RARITY_TEXT[(0, classify_1.rarity)(item)]}`];
    if (item.name)
        head.push(item.name);
    head.push(item.typeLine);
    parts.push(head);
    if (item.properties?.length) {
        parts.push(item.properties.map((p) => (p.values.length ? `${p.name}: ${p.values.map((v) => v[0]).join(', ')}` : p.name)));
    }
    if (item.sockets?.length) {
        const groups = new Map();
        for (const s of item.sockets)
            groups.set(s.group, [...(groups.get(s.group) ?? []), s.sColour]);
        parts.push([`Sockets: ${[...groups.values()].map((g) => g.join('-')).join(' ')}`]);
    }
    parts.push([`Item Level: ${item.ilvl}`]);
    if (item.enchantMods?.length)
        parts.push(item.enchantMods.map((m) => `${m} (enchant)`));
    if (item.implicitMods?.length)
        parts.push(item.implicitMods.map((m) => `${m} (implicit)`));
    const explicit = [
        ...(item.fracturedMods ?? []).map((m) => `${m} (fractured)`),
        ...(item.explicitMods ?? []),
        ...(item.craftedMods ?? []).map((m) => `${m} (crafted)`),
    ];
    if (explicit.length)
        parts.push(explicit);
    if (item.corrupted)
        parts.push(['Corrupted']);
    const inf = Object.entries(item.influences ?? {}).filter(([, v]) => v).map(([k]) => `${k[0].toUpperCase()}${k.slice(1)} Item`);
    if (inf.length)
        parts.push(inf);
    return parts.map((p) => p.join('\n')).join(`\n${SEP}\n`);
}
async function poepricesOpinion(fetchFn, league, item, timeoutMs = 8000) {
    const text = itemToText(item);
    const b64 = typeof Buffer !== 'undefined' ? Buffer.from(text, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(text)));
    const url = `https://www.poeprices.info/api?l=${encodeURIComponent(league)}&i=${encodeURIComponent(b64)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchFn(url, { headers: { 'User-Agent': (0, http_1.userAgent)('') }, signal: ctrl.signal });
        if (!res.ok)
            return null;
        const j = (await res.json());
        if (j.error || typeof j.min !== 'number')
            return null;
        return { min: j.min, max: j.max, currency: j.currency ?? 'chaos', confidence: j.pred_confidence_score ?? 0 };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
