import { describe, expect, it } from 'vitest';
import { buildRareQuery, buildStatIndex, normalizeMod, statFilters } from './rareQuery';
import type { PoeItem } from '../../shared/types';

const stats = buildStatIndex([
  { id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' },
  { id: 'explicit.stat_2923486259', text: '+#% to Cold Resistance', type: 'explicit' },
  { id: 'explicit.stat_2250533757', text: '#% increased Movement Speed', type: 'explicit' },
  { id: 'explicit.stat_803737631', text: '+# to Accuracy Rating', type: 'explicit' },
]);

const boots: PoeItem = {
  id: 'b', name: 'Doom Stride', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots', icon: '', ilvl: 84, frameType: 2,
  explicitMods: ['+80 to maximum Life', '+40% to Cold Resistance', '30% increased Movement Speed', '+50 to Accuracy Rating'],
};

describe('rare query', () => {
  it('normalizes numbers', () => {
    expect(normalizeMod('+80 to maximum Life')).toEqual({ text: '# to maximum Life', value: 80 });
  });

  it('maps mods to stat ids, most valuable first, with 85% minimums', () => {
    const f = statFilters(boots, stats);
    expect(f.map((x) => x.id)[0]).toBe('explicit.stat_3299347043');
    expect(f[0].min).toBe(68);
    expect(f).toHaveLength(4);
  });

  it('leaves low-value mods out of the query', () => {
    const q = buildRareQuery(boots, statFilters(boots, stats), 5);
    const ids = q.query.stats[0].filters.map((x) => x.id);
    expect(ids).not.toContain('explicit.stat_803737631');
    expect(q.query.type).toBe('Two-Toned Boots');
  });
});
