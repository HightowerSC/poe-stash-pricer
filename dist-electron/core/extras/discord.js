"use strict";
// Discord webhook notification about a valuable drop.
Object.defineProperty(exports, "__esModule", { value: true });
exports.discordPayload = discordPayload;
exports.sendDiscord = sendDiscord;
const priceNote_1 = require("./priceNote");
function discordPayload(p, league, divineRate) {
    const name = p.item.name ? `${p.item.name} – ${p.item.typeLine}` : p.item.typeLine;
    const fields = [
        { name: 'Cena', value: `${Math.round(p.price.chaos ?? 0)}c${divineRate ? ` (${((p.price.chaos ?? 0) / divineRate).toFixed(1)} div)` : ''}`, inline: true },
        { name: 'Pewność', value: p.price.confidence, inline: true },
        { name: 'Źródło', value: p.price.source, inline: true },
    ];
    const note = (0, priceNote_1.priceNote)(p.price.chaos, divineRate);
    if (note)
        fields.push({ name: 'Notka', value: `\`${note}\``, inline: false });
    return {
        username: 'PoE Stash Pricer',
        embeds: [{
                title: name.slice(0, 250),
                url: p.price.tradeUrl,
                description: `${league} · ${p.price.note}`.slice(0, 1000),
                color: 0xc8a65a,
                thumbnail: p.item.icon ? { url: p.item.icon } : undefined,
                fields,
            }],
    };
}
async function sendDiscord(fetchFn, webhook, payload) {
    const res = await fetchFn(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok && res.status !== 204)
        throw new Error(`Discord: HTTP ${res.status}`);
}
