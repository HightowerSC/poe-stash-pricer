"use strict";
// "What should I do with this item?" – simple rules a trading player would apply.
Object.defineProperty(exports, "__esModule", { value: true });
exports.advise = advise;
const classify_1 = require("../pricing/classify");
const ninjaMatch_1 = require("../pricing/ninjaMatch");
const tiers_1 = require("./tiers");
function advise(item, price, opts = { sellMinChaos: 5 }) {
    const kind = (0, classify_1.classify)(item);
    const r = (0, classify_1.rarity)(item);
    const chaos = price.chaos ?? 0;
    if (kind === 'currency') {
        return chaos >= opts.sellMinChaos * 4
            ? { action: 'sell', label: 'Sprzedaj', reason: 'Wartościowa waluta – sprzedaj przez Currency Exchange albo zostaw na crafting.' }
            : { action: 'keep', label: 'Zachowaj', reason: 'Waluta do użycia albo do sprzedaży hurtowej.' };
    }
    if (chaos >= opts.sellMinChaos) {
        return { action: 'sell', label: 'Sprzedaj', reason: `Wartość ok. ${Math.round(chaos)}c – wystaw z notką cenową.` };
    }
    // Crafting candidates: good base or fractured/influenced item with high-tier mods.
    const tiers = (0, tiers_1.modTiers)(item).filter((t) => t !== null);
    const topTiers = tiers.filter((t) => t <= 2).length;
    if ((r === 'rare' || r === 'magic') && (item.fractured || (0, classify_1.influenceNames)(item).length) && topTiers >= 1 && item.ilvl >= 82) {
        return { action: 'craft', label: 'Do craftu', reason: `Baza ${item.ilvl} ilvl z ${topTiers} modem T1/T2 – warto dokończyć crafting.` };
    }
    if (r === 'rare' && topTiers >= 3) {
        return { action: 'check', label: 'Sprawdź ręcznie', reason: `${topTiers} mody T1/T2, a trade nie dał ceny – sprawdź ręcznie.` };
    }
    // Vendor recipes.
    const sockets = item.sockets?.length ?? 0;
    if ((0, ninjaMatch_1.linkCount)(item) === 6)
        return { action: 'recipe', label: 'Vendor: 6-link', reason: '6 połączonych gniazd – u NPC dostaniesz 20 Orb of Fusing.' };
    if (sockets === 6)
        return { action: 'recipe', label: 'Vendor: 6 gniazd', reason: '6 gniazd – u NPC dostaniesz 7 Jeweller\'s Orb.' };
    if (hasLinkedRGB(item)) {
        return { action: 'recipe', label: 'Vendor: R-G-B', reason: 'Połączone gniazda R, G i B – u NPC dostaniesz Chromatic Orb.' };
    }
    if (kind === 'gem') {
        const q = qualityOf(item);
        if (q >= 20)
            return { action: 'recipe', label: 'Vendor: GCP', reason: 'Gem 20% jakości – u NPC dostaniesz Gemcutter\'s Prism.' };
    }
    if (r === 'rare' && item.identified === false && item.ilvl >= 60) {
        return {
            action: 'recipe',
            label: item.ilvl >= 75 ? 'Recipe: Regal' : 'Recipe: Chaos',
            reason: `Niezidentyfikowany rare ilvl ${item.ilvl} – pasuje do zestawu na ${item.ilvl >= 75 ? 'Regal' : 'Chaos'} Orb recipe.`,
        };
    }
    if (kind === 'unique' || kind === 'card' || kind === 'map') {
        return { action: 'keep', label: 'Zachowaj', reason: 'Tania rzecz, ale można sprzedać hurtowo albo użyć.' };
    }
    return { action: 'vendor', label: 'Sprzedaj u NPC', reason: 'Brak wartościowych modów i cennej bazy.' };
}
function qualityOf(item) {
    const raw = item.properties?.find((p) => p.name === 'Quality')?.values?.[0]?.[0];
    return raw ? parseInt(raw.replace(/[^\d]/g, ''), 10) || 0 : 0;
}
function hasLinkedRGB(item) {
    const groups = new Map();
    for (const s of item.sockets ?? [])
        groups.set(s.group, (groups.get(s.group) ?? new Set()).add(s.sColour));
    return [...groups.values()].some((g) => g.has('R') && g.has('G') && g.has('B'));
}
