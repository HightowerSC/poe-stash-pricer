"use strict";
// Mod tiers (T1 = best) from the "extended" block that trade-site results carry.
// extended.hashes.explicit[i] = [statHash, [modIndex...]] lines up with item.explicitMods[i];
// extended.mods.explicit[modIndex].tier is like "P1" (prefix tier 1) or "S3" (suffix tier 3).
Object.defineProperty(exports, "__esModule", { value: true });
exports.modTiers = modTiers;
exports.modAffix = modAffix;
function modTiers(item, group = 'explicit') {
    const lines = (group === 'explicit' ? item.explicitMods : item.implicitMods) ?? [];
    const hashes = item.extended?.hashes?.[group] ?? [];
    const mods = item.extended?.mods?.[group] ?? [];
    return lines.map((_, i) => {
        const idx = hashes[i]?.[1]?.[0];
        if (idx === undefined || idx === null)
            return null;
        const tier = mods[idx]?.tier;
        const n = tier ? parseInt(tier.replace(/^\D+/, ''), 10) : NaN;
        return Number.isFinite(n) ? n : null;
    });
}
function modAffix(item, i) {
    const idx = item.extended?.hashes?.explicit?.[i]?.[1]?.[0];
    const tier = idx !== undefined && idx !== null ? item.extended?.mods?.explicit?.[idx]?.tier : undefined;
    if (!tier)
        return null;
    return tier.startsWith('P') ? 'prefix' : tier.startsWith('S') ? 'suffix' : null;
}
