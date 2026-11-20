import { describe, expect, it } from 'vitest';
import { NinjaIndex, linkCount } from './ninjaMatch';
import { dropPriceFixers, summarizeListings } from './listings';
import { resolveLeague, validateProfile, newProfile } from '../config';
import { parseOverview } from '../ninja';
import type { ComparableListing, PoeItem } from '../../shared/types';

const base: PoeItem = { id: 'x', name: '', typeLine: '', baseType: '', icon: '', ilvl: 80, frameType: 0 };

describe('NinjaIndex', () => {
  const index = new NinjaIndex([
    { name: 'Divine Orb', chaosValue: 180, listingCount: 500, category: 'Currency' },
    { name: 'Headhunter', chaosValue: 9000, links: 0, listingCount: 40, category: 'UniqueAccessory' },
    { name: 'Kaom\'s Heart', chaosValue: 30, links: 0, listingCount: 30, category: 'UniqueArmour' },
    { name: 'Kaom\'s Heart', chaosValue: 120, links: 6, listingCount: 6, category: 'UniqueArmour' },
    { name: 'Empower Support', chaosValue: 5, gemLevel: 1, listingCount: 100, category: 'SkillGem' },
    { name: 'Empower Support', chaosValue: 300, gemLevel: 4, listingCount: 30, category: 'SkillGem' },
  ]);

  it('prices a currency stack', () => {
    const p = index.price({ ...base, frameType: 5, typeLine: 'Divine Orb', stackSize: 3 });
    expect(p?.chaos).toBe(540);
    expect(p?.confidence).toBe('high');
  });

  it('matches uniques by link count', () => {
    const sockets = Array.from({ length: 6 }, () => ({ group: 0, sColour: 'R' }));
    const six = index.price({ ...base, frameType: 3, name: 'Kaom\'s Heart', sockets });
    const plain = index.price({ ...base, frameType: 3, name: 'Kaom\'s Heart' });
    expect(six?.chaos).toBe(120);
    expect(plain?.chaos).toBe(30);
  });

  it('matches gems by level', () => {
    const gem = index.price({
      ...base, frameType: 4, typeLine: 'Empower Support',
      properties: [{ name: 'Level', values: [['4', 0]] }],
    });
    expect(gem?.chaos).toBe(300);
  });

  it('returns null for unknown items', () => {
    expect(index.price({ ...base, frameType: 2, typeLine: 'Vaal Regalia' })).toBeNull();
  });

  it('counts links', () => {
    expect(linkCount({ ...base, sockets: [{ group: 0, sColour: 'R' }, { group: 0, sColour: 'G' }, { group: 1, sColour: 'B' }] })).toBe(2);
  });
});

describe('summarizeListings', () => {
  const l = (chaos: number, similarity = 0.9): ComparableListing => ({ chaos, originalAmount: chaos, originalCurrency: 'chaos', similarity });

  it('drops price fixers', () => {
    const out = dropPriceFixers([l(1), l(2), l(40), l(42), l(45), l(50), l(55)]);
    expect(out[0].chaos).toBe(40);
  });

  it('suggests a price between low quartile and median', () => {
    const s = summarizeListings([l(40), l(42), l(45), l(50), l(55), l(60), l(70), l(80)]);
    expect(s.chaos).toBeGreaterThanOrEqual(44);
    expect(s.chaos).toBeLessThanOrEqual(53);
    expect(s.confidence).toBe('high');
  });

  it('handles no listings', () => {
    expect(summarizeListings([]).chaos).toBeNull();
  });
});

describe('league settings', () => {
  const leagues = [
    { id: 'Covens', name: 'Covens', hardcore: false, current: true },
    { id: 'Hardcore Covens', name: 'Hardcore Covens', hardcore: true, current: true },
    { id: 'Standard', name: 'Standard', hardcore: false, current: false },
  ];

  it('auto picks the current challenge league', () => {
    expect(resolveLeague('auto', false, leagues)).toBe('Covens');
    expect(resolveLeague('auto', true, leagues)).toBe('Hardcore Covens');
  });

  it('accepts any listed league, case-insensitive', () => {
    expect(resolveLeague('standard', false, leagues)).toBe('Standard');
  });

  it('rejects an unknown league', () => {
    expect(() => resolveLeague('Necropolis', false, leagues)).toThrow();
  });

  it('validates account names', () => {
    expect(validateProfile(newProfile({ accountName: 'Exile#1234' }))).toEqual([]);
    expect(validateProfile(newProfile({ accountName: 'Exile' })).length).toBe(1);
  });
});

describe('parseOverview', () => {
  it('reads the exchange shape', () => {
    const rows = parseOverview('Currency', {
      items: [{ id: 'divine', name: 'Divine Orb' }],
      lines: [{ id: 'divine', primaryValue: 180 }],
    });
    expect(rows[0]).toMatchObject({ name: 'Divine Orb', chaosValue: 180 });
  });
});
