import { describe, expect, it } from 'vitest';
import type { PoeItem, Profile } from '../../shared/types';
import { affixInfo, craftOptions, craftReport, itemSlot, withCraft } from './advisor';
import { modWeight, buildQuery } from '../pricing/tradeQuery';
import { valuableSpecialMods } from '../pricing/classify';
import { NinjaIndex } from '../pricing/ninjaMatch';
import { PricingEngine } from '../engine';
import { newProfile } from '../config';

const boots: PoeItem = {
  id: 'b', name: 'Doom Stride', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots', icon: '', ilvl: 84, frameType: 2,
  implicitMods: ['+12% to Fire and Cold Resistances'],
  explicitMods: ['+82 to maximum Life', '30% increased Movement Speed', '+41% to Cold Resistance', '+38% to Lightning Resistance'],
  extended: {
    subcategories: ['boots'],
    mods: { explicit: [{ name: 'a', tier: 'P2' }, { name: 'b', tier: 'P1' }, { name: 'c', tier: 'S2' }, { name: 'd', tier: 'S3' }] },
  },
};

describe('craft advisor', () => {
  it('counts prefixes and suffixes from trade tiers', () => {
    expect(itemSlot(boots)).toBe('boots');
    expect(affixInfo(boots)).toMatchObject({ prefixes: 2, suffixes: 2, maxPrefixes: 3, maxSuffixes: 3, known: true });
  });

  it('lists bench crafts for free slots, skipping mods the item already has', () => {
    const { options } = craftOptions(boots);
    const lines = options.filter((o) => o.method === 'bench').map((o) => o.line);
    expect(lines).toContain('+30% to Fire Resistance');
    expect(lines).toContain('+18% to Chaos Resistance');
    expect(lines).not.toContain('+55 to maximum Life'); // already has life
    expect(lines).not.toContain('20% increased Movement Speed'); // already has MS
    expect(lines).not.toContain('+30% to Cold Resistance');
    expect(options.some((o) => o.method === 'exalted')).toBe(true);
  });

  it('blocks bench crafts when a crafted mod is present and refuses corrupted items', () => {
    expect(craftOptions({ ...boots, craftedMods: ['+20% to Chaos Resistance'] }).options.some((o) => o.method === 'bench')).toBe(false);
    expect(craftOptions({ ...boots, corrupted: true }).reason).toMatch(/skażony/);
  });

  it('says when there is no affix data', () => {
    expect(craftOptions({ ...boots, extended: undefined }).reason).toMatch(/prefiksach/);
  });

  it('prices the best bench crafts and computes profit', async () => {
    const report = await craftReport(boots, 100, {
      tradePrice: async (it) => ({ chaos: it.explicitMods!.at(-1)!.includes('Chaos') ? 260 : 110 }),
      chaosRate: (c) => ({ divine: 180, exalted: 12 } as Record<string, number>)[c] ?? null,
      weight: modWeight,
    });
    expect(report.prefixes).toBe('2/3');
    const chaos = report.suggestions.find((s) => s.option.line === '+18% to Chaos Resistance')!;
    expect(chaos.costChaos).toBe(180);
    expect(chaos.profit).toBe(260 - 100 - 180);
    expect(report.suggestions.at(-1)!.option.deterministic).toBe(false);
    expect(withCraft(boots, 'x').explicitMods!.at(-1)).toBe('x');
  });
});

describe('special mods and variants', () => {
  it('detects valuable corrupted implicits only on corrupted items', () => {
    const cov: PoeItem = { ...boots, frameType: 3, name: 'The Covenant', corrupted: true, implicitMods: ['+1 to Level of Socketed Gems'] };
    expect(valuableSpecialMods(cov)).toEqual(['+1 to Level of Socketed Gems']);
    expect(valuableSpecialMods({ ...cov, corrupted: false })).toEqual([]);
  });

  it('finds the plain unique for a special variant name', () => {
    const idx = new NinjaIndex([{ name: 'The Covenant', chaosValue: 25, listingCount: 30, category: 'UniqueArmour' }]);
    expect(idx.plainUniqueName('Voidborn The Covenant')).toBe('The Covenant');
    expect(idx.plainUniqueName('Headhunter')).toBeNull();
  });

  it('relaxes special filters only on the last step and reports them', () => {
    const inf = { ...boots, influences: { shaper: true }, fractured: true };
    const strict = buildQuery(inf, [], { keep: 0 });
    expect(strict.query.filters.misc_filters.filters.shaper_item).toBeDefined();
    const loose = buildQuery(inf, [], { keep: 0, relaxMisc: true });
    expect(loose.query.filters.misc_filters.filters.shaper_item).toBeUndefined();
    expect(loose.relaxed).toEqual(['wpływ shaper', 'fractured']);
  });

  it('does not filter uniques by item level', () => {
    const u: PoeItem = { ...boots, frameType: 3, name: 'The Covenant', ilvl: 86 };
    expect(buildQuery(u, [], { keep: 0, baseOnly: true }).query.filters.misc_filters.filters.ilvl).toBeUndefined();
  });
});

describe('unique pricing fallbacks', () => {
  const profile: Profile = newProfile({ accountName: 'Test#1' });
  const listing = (amount: number) => ({ listing: { price: { amount, currency: 'chaos' } }, item: { ...boots } });

  function engine(searchTotals: number[], prices: number[]) {
    const searches: any[] = [];
    const trade = {
      search: async (_l: string, q: any) => { searches.push(q); const n = searchTotals.shift() ?? 0; return { id: 'q', result: Array.from({ length: n }, (_, i) => `id${i}`), total: n }; },
      fetch: async () => prices.map(listing),
      tradeUrl: () => 'url',
    };
    const ninja = { allPrices: async () => [{ name: 'The Covenant', chaosValue: 25, listingCount: 30, category: 'UniqueArmour' }] };
    const e = new PricingEngine(profile, 'Covens', ninja as any, trade as any);
    return { e, searches };
  }

  it('prices a missing variant from the plain unique and marks it as a lower bound', async () => {
    const { e } = engine([0, 0], []);
    await e.refreshPrices();
    const p = await e.price({ ...boots, frameType: 3, name: 'Voidborn The Covenant', typeLine: 'Spidersilk Robe', baseType: 'Spidersilk Robe' });
    expect(p.chaos).toBe(25);
    expect(p.lowerBound).toBe(true);
    expect(p.note).toMatch(/Voidborn/);
  });

  it('searches with a valuable corrupt first', async () => {
    const { e, searches } = engine([8], [300, 310, 320, 330, 340, 350, 360, 370]);
    await e.refreshPrices();
    e.setTradeStats([{ id: 'implicit.stat_gems', text: '+# to Level of Socketed Gems', type: 'implicit' }]);
    const p = await e.price({ ...boots, frameType: 3, name: 'The Covenant', corrupted: true, implicitMods: ['+1 to Level of Socketed Gems'] });
    expect(searches[0].query.stats[0].filters[0].id).toBe('implicit.stat_gems');
    expect(p.specialMods).toEqual(['+1 to Level of Socketed Gems']);
    expect(p.chaos).toBeGreaterThan(250);
  });
});
