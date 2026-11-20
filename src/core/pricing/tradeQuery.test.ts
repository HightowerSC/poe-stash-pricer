import { describe, expect, it } from 'vitest';
import { buildQuery, buildStatIndex, hasValuableMods, normalizeMod, pseudoTotals, statFilters } from './tradeQuery';
import { classify, clusterInfo } from './classify';
import { NinjaIndex } from './ninjaMatch';
import { isInterestingBase } from '../engine';
import type { PoeItem } from '../../shared/types';

const stats = buildStatIndex([
  { id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' },
  { id: 'explicit.stat_2923486259', text: '+#% to Cold Resistance', type: 'explicit' },
  { id: 'explicit.stat_1671376347', text: '+#% to Lightning Resistance', type: 'explicit' },
  { id: 'explicit.stat_2250533757', text: '#% increased Movement Speed', type: 'explicit' },
  { id: 'explicit.stat_803737631', text: '+# to Accuracy Rating', type: 'explicit' },
  { id: 'explicit.stat_983749596', text: '#% increased maximum Life', type: 'explicit' },
  { id: 'explicit.stat_3556824919', text: '+#% to Global Critical Strike Multiplier', type: 'explicit' },
  { id: 'enchant.stat_3086156145', text: 'Adds # Passive Skills', type: 'enchant' },
  { id: 'enchant.stat_3948993189', text: 'Added Small Passive Skills grant: #', type: 'enchant', options: [{ id: 1, text: '12% increased Fire Damage' }] },
  { id: 'explicit.stat_feed', text: '1 Added Passive Skill is Feed the Fury', type: 'explicit' },
  { id: 'explicit.pseudo_timeless_xibaqua', text: 'Bathed in the blood of # sacrificed in the name of Xibaqua', type: 'explicit' },
]);

const base: PoeItem = { id: 'x', name: '', typeLine: '', baseType: '', icon: '', ilvl: 84, frameType: 2 };

const boots: PoeItem = {
  ...base, id: 'b', name: 'Doom Stride', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots',
  explicitMods: ['+80 to maximum Life', '+40% to Cold Resistance', '+30% to Lightning Resistance', '30% increased Movement Speed', '+50 to Accuracy Rating'],
};

describe('classify', () => {
  it('recognises jewel kinds', () => {
    expect(classify({ ...base, baseType: 'Large Cluster Jewel' })).toBe('clusterJewel');
    expect(classify({ ...base, baseType: 'Ghastly Eye Jewel' })).toBe('abyssJewel');
    expect(classify({ ...base, baseType: 'Cobalt Jewel' })).toBe('jewel');
    expect(classify({ ...base, frameType: 3, name: 'Glorious Vanity', baseType: 'Timeless Jewel' })).toBe('timeless');
    expect(classify({ ...base, frameType: 0, baseType: 'Two-Toned Boots' })).toBe('equipment');
  });

  it('reads cluster enchants and notables', () => {
    const c = clusterInfo({
      ...base, baseType: 'Large Cluster Jewel',
      enchantMods: ['Adds 8 Passive Skills', 'Added Small Passive Skills grant: 12% increased Fire Damage'],
      explicitMods: ['1 Added Passive Skill is Feed the Fury'],
    });
    expect(c).toEqual({ passives: 8, enchant: '12% increased Fire Damage', notables: ['Feed the Fury'] });
  });
});

describe('pseudo stats', () => {
  it('sums resistances and life', () => {
    const p = pseudoTotals({ ...boots, explicitMods: [...boots.explicitMods!, '+20 to Strength', '+10% to all Elemental Resistances'] });
    expect(p.eleRes).toBe(100);
    expect(p.life).toBe(90);
  });

  it('uses pseudo filters instead of single resistances on equipment', () => {
    const f = statFilters(boots, stats);
    const ids = f.map((x) => x.id);
    expect(ids).toContain('pseudo.pseudo_total_elemental_resistance');
    expect(ids).toContain('pseudo.pseudo_total_life');
    expect(ids).not.toContain('explicit.stat_2923486259');
    expect(f.find((x) => x.id === 'pseudo.pseudo_total_life')!.min).toBe(68);
  });
});

describe('queries', () => {
  it('normalizes numbers', () => {
    expect(normalizeMod('+80 to maximum Life')).toEqual({ text: '# to maximum Life', value: 80 });
  });

  it('rare equipment: base type, rarity, valuable mods only', () => {
    const { query, chosen } = buildQuery(boots, statFilters(boots, stats), { keep: 6 });
    expect(query.type).toBe('Two-Toned Boots');
    expect(query.filters.type_filters.filters.rarity.option).toBe('rare');
    expect(chosen.map((c) => c.id)).not.toContain('explicit.stat_803737631');
  });

  it('rare jewel: searched by category, not base', () => {
    const jewel: PoeItem = { ...base, baseType: 'Cobalt Jewel', typeLine: 'Cobalt Jewel', explicitMods: ['7% increased maximum Life', '+15% to Global Critical Strike Multiplier'] };
    const { query, chosen } = buildQuery(jewel, statFilters(jewel, stats), { keep: 6 });
    expect(query.type).toBeUndefined();
    expect(query.filters.type_filters.filters.category.option).toBe('jewel.base');
    expect(chosen).toHaveLength(2);
  });

  it('cluster jewel: enchant option, exact passive count, notables required, ilvl', () => {
    const cluster: PoeItem = {
      ...base, frameType: 1, baseType: 'Large Cluster Jewel', typeLine: 'Large Cluster Jewel', ilvl: 84,
      enchantMods: ['Adds 8 Passive Skills', 'Added Small Passive Skills grant: 12% increased Fire Damage'],
      explicitMods: ['1 Added Passive Skill is Feed the Fury'],
    };
    const f = statFilters(cluster, stats);
    const { query, chosen } = buildQuery(cluster, f, { keep: 0 });
    expect(chosen.map((c) => c.id).sort()).toEqual(['enchant.stat_3086156145', 'enchant.stat_3948993189', 'explicit.stat_feed']);
    expect(chosen.find((c) => c.id === 'enchant.stat_3948993189')!.option).toBe(1);
    expect(chosen.find((c) => c.id === 'enchant.stat_3086156145')).toMatchObject({ min: 8, max: 8 });
    expect(query.filters.misc_filters.filters.ilvl).toEqual({ min: 84 });
  });

  it('timeless jewel: exact seed', () => {
    const tj: PoeItem = { ...base, frameType: 3, name: 'Glorious Vanity', baseType: 'Timeless Jewel', typeLine: 'Timeless Jewel',
      explicitMods: ['Bathed in the blood of 7155 sacrificed in the name of Xibaqua'] };
    const { query, chosen } = buildQuery(tj, statFilters(tj, stats), { keep: 0 });
    expect(query.name).toBe('Glorious Vanity');
    expect(chosen[0]).toMatchObject({ min: 7155, max: 7155 });
  });

  it('base-only query: ilvl and influence, no mods', () => {
    const b: PoeItem = { ...base, frameType: 0, baseType: 'Hubris Circlet', typeLine: 'Hubris Circlet', ilvl: 86, influences: { shaper: true } };
    const { query, chosen } = buildQuery(b, [], { keep: 0, baseOnly: true });
    expect(chosen).toHaveLength(0);
    expect(query.filters.misc_filters.filters).toMatchObject({ ilvl: { min: 86 }, shaper_item: { option: 'true' } });
  });

  it('junk magic item has no valuable mods', () => {
    const junk: PoeItem = { ...base, frameType: 1, baseType: 'Iron Gauntlets', typeLine: 'Iron Gauntlets', ilvl: 40, explicitMods: ['+50 to Accuracy Rating'] };
    expect(hasValuableMods(statFilters(junk, stats))).toBe(false);
    expect(isInterestingBase(junk)).toBe(false);
  });
});

describe('ninja bases and clusters', () => {
  const index = new NinjaIndex([
    { name: 'Hubris Circlet', baseType: 'Hubris Circlet', levelRequired: 84, variant: 'Shaper', chaosValue: 20, listingCount: 30, category: 'BaseType' },
    { name: 'Hubris Circlet', baseType: 'Hubris Circlet', levelRequired: 86, variant: 'Shaper', chaosValue: 60, listingCount: 30, category: 'BaseType' },
    { name: 'Hubris Circlet', baseType: 'Hubris Circlet', levelRequired: 86, chaosValue: 5, listingCount: 30, category: 'BaseType' },
    { name: '12% increased Fire Damage', baseType: 'Large Cluster Jewel', levelRequired: 84, variant: '8 passives', chaosValue: 15, listingCount: 30, category: 'ClusterJewel' },
  ]);

  it('picks the highest item level not above ours, same influence', () => {
    const b: PoeItem = { ...base, frameType: 0, baseType: 'Hubris Circlet', typeLine: 'Hubris Circlet', ilvl: 85, influences: { shaper: true } };
    expect(index.priceBase(b)?.chaos).toBe(20);
    expect(index.priceBase({ ...b, ilvl: 86 })?.chaos).toBe(60);
    expect(index.priceBase({ ...b, influences: undefined, ilvl: 86 })?.chaos).toBe(5);
  });

  it('prices a plain cluster jewel', () => {
    const c: PoeItem = { ...base, frameType: 0, baseType: 'Large Cluster Jewel', typeLine: 'Large Cluster Jewel', ilvl: 84,
      enchantMods: ['Adds 8 Passive Skills', 'Added Small Passive Skills grant: 12% increased Fire Damage'] };
    expect(index.priceCluster(c)?.chaos).toBe(15);
    expect(index.priceCluster({ ...c, ilvl: 70 })).toBeNull();
  });
});
