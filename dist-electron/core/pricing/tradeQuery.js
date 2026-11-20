"use strict";
// Builds trade-site queries for anything priced by comparable listings, the way Awakened PoE Trade does:
//  - each mod line is mapped to a trade stat id (numbers -> "#", option stats such as cluster enchants included),
//  - resistances and life are merged into pseudo stats so differently-rolled items still compare,
//  - the most valuable mods are required at ~85% of our roll,
//  - item-type filters depend on the kind: bases (ilvl, influence, fractured), jewels (category),
//    cluster jewels (enchant, passive count, notables), timeless jewels (exact seed).
Object.defineProperty(exports, "__esModule", { value: true });
exports.modWeight = modWeight;
exports.normalizeMod = normalizeMod;
exports.buildStatIndex = buildStatIndex;
exports.pseudoTotals = pseudoTotals;
exports.statFilters = statFilters;
exports.hasValuableMods = hasValuableMods;
exports.buildQuery = buildQuery;
exports.similarity = similarity;
const classify_1 = require("./classify");
// ---------- weights ----------
const WEIGHTS = [
    [/^1 Added Passive Skill is /, 9],
    [/to Level of all .*Gems|to Level of Socketed .*Gems/i, 10],
    [/increased maximum Life|to maximum Life/i, 10],
    [/increased Movement Speed/i, 9],
    [/to Damage over Time Multiplier/i, 9],
    [/Critical Strike Multiplier/i, 8],
    [/increased maximum Energy Shield|to maximum Energy Shield/i, 8],
    [/increased Physical Damage$/i, 8],
    [/Suppress Spell Damage/i, 8],
    [/increased Spell Damage|increased Damage with .* Skills/i, 7],
    [/to all Elemental Resistances|Elemental Resistance/i, 6],
    [/to Chaos Resistance/i, 6],
    [/Resistance/i, 5],
    [/increased Attack Speed|increased Cast Speed/i, 6],
    [/Adds .* Damage/i, 6],
    [/Critical Strike Chance/i, 5],
    [/increased (Fire|Cold|Lightning|Chaos|Elemental) Damage/i, 5],
    [/Minions/i, 6],
    [/Aura|Reservation Efficiency/i, 7],
    [/to (Strength|Dexterity|Intelligence|all Attributes)/i, 3],
    [/increased Rarity of Items/i, 3],
    [/Accuracy|Stun|Light Radius|Mana Regeneration|Life Regeneration|Knockback|Thorns|reflect/i, 1],
];
function modWeight(line) {
    for (const [re, w] of WEIGHTS)
        if (re.test(line))
            return w;
    return 2;
}
// ---------- stat index ----------
function normalizeMod(line) {
    const nums = line.match(/[+-]?\d+(\.\d+)?/g) ?? [];
    const values = nums.map(Number);
    const value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
    const text = line.replace(/[+-]?\d+(\.\d+)?/g, '#').replace(/\+#/g, '#').trim();
    return { text, value };
}
const key = (s) => s.replace(/\+#/g, '#').toLowerCase();
function buildStatIndex(stats) {
    const map = new Map();
    const add = (k, v) => map.set(key(k), [...(map.get(key(k)) ?? []), v]);
    for (const s of stats) {
        if (s.options?.length) {
            for (const o of s.options)
                add(s.text.replace('#', o.text), { stat: s, option: o.id });
        }
        else {
            add(s.text, { stat: s });
        }
    }
    return map;
}
function lookup(index, line, type) {
    const exact = index.get(key(line));
    if (exact?.length)
        return { hit: exact.find((h) => h.stat.type === type) ?? exact[0] };
    const { text, value } = normalizeMod(line);
    const list = index.get(key(text));
    if (!list?.length)
        return null;
    return { hit: list.find((h) => h.stat.type === type) ?? list[0], value };
}
// ---------- pseudo stats ----------
const RES_PATTERNS = [
    [/^\+?(\d+)% to (Fire|Cold|Lightning) Resistance$/, 1],
    [/^\+?(\d+)% to (Fire and Cold|Fire and Lightning|Cold and Lightning) Resistances$/, 2],
    [/^\+?(\d+)% to all Elemental Resistances$/, 3],
];
function pseudoTotals(item) {
    const lines = [...(item.implicitMods ?? []), ...(item.explicitMods ?? []), ...(item.craftedMods ?? []), ...(item.fracturedMods ?? [])];
    let eleRes = 0;
    let life = 0;
    const resLines = [];
    const lifeLines = [];
    for (const l of lines) {
        for (const [re, mult] of RES_PATTERNS) {
            const m = l.match(re);
            if (m) {
                eleRes += Number(m[1]) * mult;
                resLines.push(l);
            }
        }
        let m = l.match(/^\+?(\d+) to maximum Life$/);
        if (m) {
            life += Number(m[1]);
            lifeLines.push(l);
        }
        m = l.match(/^\+?(\d+) to (Strength|all Attributes)$/) ?? l.match(/^\+?(\d+) to Strength and (Dexterity|Intelligence)$/);
        if (m)
            life += Math.floor(Number(m[1]) / 2);
    }
    return { eleRes, life, resLines, lifeLines };
}
// ---------- filters ----------
function statFilters(item, index, ratio = 0.85) {
    const kind = (0, classify_1.classify)(item);
    const out = [];
    const usePseudo = kind === 'equipment';
    const pseudo = usePseudo ? pseudoTotals(item) : null;
    const skip = new Set();
    if (pseudo && pseudo.resLines.length >= 1) {
        pseudo.resLines.forEach((l) => skip.add(l));
        out.push({ id: 'pseudo.pseudo_total_elemental_resistance', text: `+${pseudo.eleRes}% łącznej odporności na żywioły`, min: Math.floor(pseudo.eleRes * ratio), weight: pseudo.eleRes >= 80 ? 8 : 6 });
    }
    if (pseudo && pseudo.lifeLines.length >= 1) {
        pseudo.lifeLines.forEach((l) => skip.add(l));
        out.push({ id: 'pseudo.pseudo_total_life', text: `+${pseudo.life} łącznego życia`, min: Math.floor(pseudo.life * ratio), weight: 10 });
    }
    const groups = [
        ['explicit', item.explicitMods],
        ['implicit', item.implicitMods],
        ['crafted', item.craftedMods],
        ['fractured', item.fracturedMods],
        ['enchant', kind === 'clusterJewel' ? item.enchantMods : undefined],
    ];
    for (const [type, lines] of groups) {
        for (const line of lines ?? []) {
            if (skip.has(line))
                continue;
            const found = lookup(index, line, type);
            if (!found)
                continue;
            const { hit, value } = found;
            const f = { id: hit.stat.id, text: line, weight: modWeight(line), option: hit.option };
            if (kind === 'timeless') {
                // The seed must match exactly; the conqueror name is part of the stat text.
                f.min = value;
                f.max = value;
                f.required = true;
                f.weight = 20;
            }
            else if (kind === 'clusterJewel' && type === 'enchant') {
                f.required = true;
                f.weight = 15;
                if (/^Adds # Passive Skills/.test(hit.stat.text) && value !== undefined) {
                    f.min = value;
                    f.max = value;
                }
            }
            else if (/^1 Added Passive Skill is /.test(line)) {
                f.required = true;
            }
            else if (value !== undefined) {
                f.min = Math.floor(value * ratio);
            }
            out.push(f);
        }
    }
    return out.sort((a, b) => b.weight - a.weight);
}
/** Whether an item is worth a trade search based on its mods. */
function hasValuableMods(filters) {
    return filters.some((f) => f.required || f.weight >= 6);
}
const CATEGORY = {
    jewel: 'jewel.base',
    abyssJewel: 'jewel.abyss',
    clusterJewel: 'jewel.cluster',
    flask: 'flask',
};
function buildQuery(item, filters, opts) {
    const kind = (0, classify_1.classify)(item);
    const r = (0, classify_1.rarity)(item);
    const required = opts.baseOnly ? [] : filters.filter((f) => f.required);
    const optional = opts.baseOnly ? [] : filters.filter((f) => !f.required && f.weight >= 3).slice(0, opts.keep);
    const chosen = [...required, ...optional];
    const misc = {};
    const typeFilters = {};
    const query = { status: { option: 'online' } };
    if (kind === 'unique' || kind === 'timeless') {
        query.name = item.name;
        query.type = item.baseType || item.typeLine;
    }
    else if (CATEGORY[kind] && r === 'rare') {
        typeFilters.category = { option: CATEGORY[kind] };
    }
    else {
        query.type = item.baseType || item.typeLine;
    }
    if (r === 'rare' || r === 'magic' || r === 'normal') {
        typeFilters.rarity = { option: opts.baseOnly ? 'nonunique' : r === 'rare' ? 'rare' : 'nonunique' };
    }
    if (item.corrupted !== undefined && kind !== 'currency')
        misc.corrupted = { option: item.corrupted ? 'true' : 'false' };
    // Bases and cluster jewels: item level matters (crafting tiers / notable availability).
    if (opts.baseOnly || kind === 'clusterJewel') {
        const ilvl = item.ilvl >= 86 ? 86 : item.ilvl >= 84 ? 84 : item.ilvl >= 82 ? 82 : item.ilvl >= 75 ? 75 : 0;
        if (ilvl)
            misc.ilvl = { min: ilvl };
    }
    for (const inf of (0, classify_1.influenceNames)(item))
        misc[`${inf}_item`] = { option: 'true' };
    if (item.fractured)
        misc.fractured_item = { option: 'true' };
    if (item.synthesised)
        misc.synthesised_item = { option: 'true' };
    query.stats = [{
            type: 'and',
            filters: chosen.map((f) => {
                const value = {};
                if (f.min !== undefined)
                    value.min = f.min;
                if (f.max !== undefined)
                    value.max = f.max;
                if (f.option !== undefined)
                    value.option = f.option;
                return { id: f.id, value };
            }),
        }];
    query.filters = {
        type_filters: { filters: typeFilters },
        misc_filters: { filters: misc },
        trade_filters: { filters: { sale_type: { option: 'priced' } } },
    };
    return { query, sort: { price: 'asc' }, chosen };
}
/** Similarity of a listed item to ours: share of our chosen filters that it satisfies. */
function similarity(chosen, theirs, index) {
    if (chosen.length === 0)
        return 1;
    const theirFilters = statFilters(theirs, index, 1);
    let score = 0;
    for (const f of chosen) {
        const match = theirFilters.find((t) => t.id === f.id && (f.option === undefined || t.option === f.option));
        if (!match)
            continue;
        score += f.min !== undefined && match.min !== undefined && match.min < f.min ? 0.5 : 1;
    }
    return score / chosen.length;
}
