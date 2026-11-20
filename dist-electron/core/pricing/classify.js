"use strict";
// Sorts an item into a kind that decides which pricing strategy applies.
Object.defineProperty(exports, "__esModule", { value: true });
exports.rarity = rarity;
exports.classify = classify;
exports.influenceNames = influenceNames;
exports.ninjaInfluenceVariant = ninjaInfluenceVariant;
exports.clusterInfo = clusterInfo;
const TIMELESS = ['Glorious Vanity', 'Lethal Pride', 'Brutal Restraint', 'Militant Faith', 'Elegant Hubris', 'Heroic Tragedy'];
function rarity(item) {
    return ['normal', 'magic', 'rare', 'unique'][item.frameType] ?? (item.frameType === 9 ? 'unique' : 'other');
}
function classify(item) {
    const base = item.baseType || item.typeLine;
    if (item.frameType === 5)
        return 'currency';
    if (item.frameType === 6)
        return 'card';
    if (item.frameType === 4)
        return 'gem';
    if (item.frameType === 3 && TIMELESS.includes(item.name))
        return 'timeless';
    if (/Cluster Jewel$/.test(base))
        return item.frameType === 3 ? 'unique' : 'clusterJewel';
    if (/Eye Jewel$/.test(base) || item.extended?.subcategories?.includes('abyss'))
        return item.frameType === 3 ? 'unique' : 'abyssJewel';
    if (/Jewel$/.test(base))
        return item.frameType === 3 ? 'unique' : 'jewel';
    if (item.frameType === 3 || item.frameType === 9)
        return 'unique';
    if (/\bMap\b/.test(base) || item.extended?.category === 'maps')
        return 'map';
    if (/Flask$|Tincture$/.test(base) || item.extended?.category === 'flasks')
        return 'flask';
    if (item.frameType <= 2)
        return 'equipment';
    return 'other';
}
function influenceNames(item) {
    return Object.entries(item.influences ?? {}).filter(([, v]) => v).map(([k]) => k);
}
/** "Shaper", "Crusader/Hunter" etc. – the format poe.ninja uses in the BaseType variant column. */
function ninjaInfluenceVariant(item) {
    const names = influenceNames(item).map((n) => n[0].toUpperCase() + n.slice(1));
    return names.length ? names.join('/') : null;
}
/** Cluster jewel details read from enchant lines. */
function clusterInfo(item) {
    const enchants = item.enchantMods ?? [];
    const passivesLine = enchants.find((e) => /^Adds \d+ Passive Skills?/.test(e));
    const passives = passivesLine ? Number(passivesLine.match(/\d+/)[0]) : 0;
    const enchant = enchants.find((e) => e.startsWith('Added Small Passive Skills grant:'))?.replace('Added Small Passive Skills grant: ', '') ?? null;
    const notables = (item.explicitMods ?? [])
        .filter((m) => /^1 Added Passive Skill is /.test(m))
        .map((m) => m.replace('1 Added Passive Skill is ', ''));
    return { passives, enchant, notables };
}
