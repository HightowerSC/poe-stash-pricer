import { describe, expect, it } from 'vitest';
import { normalizeItem, stripMarkup } from './normalize';
import { pseudoTotals, statFilters, buildStatIndex } from './pricing/tradeQuery';
import { classify } from './pricing/classify';

// Shape modelled on a trade-site fetch result, including the odd bits seen live:
// markup in mod text, an object instead of a string, a number, missing baseType.
const raw = {
  id: 'abc',
  name: 'Doom Stride',
  typeLine: 'Two-Toned Boots',
  icon: 'https://web.poecdn.com/x.png',
  ilvl: 84,
  frameType: 2,
  identified: true,
  implicitMods: ['+12% to [Resistances|Fire and Cold Resistances]'],
  explicitMods: [
    '+80 to maximum [Life]',
    { text: '+40% to [ColdResistance|Cold Resistance]' },
    30,
    null,
  ],
  properties: [{ name: 'Evasion Rating', values: [['200', 1]], displayMode: 0 }],
  extended: { mods: { explicit: [] }, hashes: { explicit: [] } },
};

describe('normalizeItem', () => {
  it('strips markup', () => {
    expect(stripMarkup('+80 to maximum [Life]')).toBe('+80 to maximum Life');
    expect(stripMarkup('+12% to [Resistances|Fire and Cold Resistances]')).toBe('+12% to Fire and Cold Resistances');
  });

  it('turns every mod into a plain string and keeps the item usable', () => {
    const item = normalizeItem(raw);
    expect(item.explicitMods).toEqual(['+80 to maximum Life', '+40% to Cold Resistance', '30']);
    expect(item.baseType).toBe('Two-Toned Boots');
    expect(classify(item)).toBe('equipment');
    expect(pseudoTotals(item)).toMatchObject({ life: 80, eleRes: 64 });
    expect(() => statFilters(item, buildStatIndex([]))).not.toThrow();
  });

  it('pricing helpers survive non-string mods even without normalizing', () => {
    const weird: any = { ...raw, baseType: 'Two-Toned Boots' };
    expect(() => pseudoTotals(weird)).not.toThrow();
    expect(() => statFilters(weird, buildStatIndex([]))).not.toThrow();
  });
});
