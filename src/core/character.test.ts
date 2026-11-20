import { describe, expect, it } from 'vitest';
import { buildCharacter, demoCharacter, gearStats, sortCharacters } from './character';
import { groupByKind, groupByPrice, suggestedTab } from './extras/groups';
import { demoItems } from './demo';

describe('character', () => {
  it('adds up life, resistances and attributes from gear', () => {
    const stats = gearStats([
      { id: 'a', name: '', typeLine: '', baseType: '', icon: '', ilvl: 1, frameType: 2, explicitMods: ['+80 to maximum Life', '+40% to Fire Resistance', '+12% to all Elemental Resistances', '+20 to Strength and Dexterity'] },
      { id: 'b', name: '', typeLine: '', baseType: '', icon: '', ilvl: 1, frameType: 2, implicitMods: ['+30 to maximum Life'], craftedMods: ['+18% to Fire and Cold Resistances'] },
    ]);
    const v = (label: string) => stats.find((s) => s.label === label)?.value;
    expect(v('Życie z ekwipunku')).toBe(110);
    expect(v('Odporność na ogień')).toBe(70);
    expect(v('Odporność na zimno')).toBe(30);
    expect(v('Odporność na chaos')).toBe(0);
    expect(v('Siła')).toBe(20);
  });

  it('builds a view from the profile endpoints and skips the main inventory', () => {
    const view = buildCharacter('Exile#1234', 'pc', {
      character: { name: 'Hero', league: 'Covens', class: 'Necromancer', level: 90 },
      items: [
        { id: 'h', inventoryId: 'Helm', name: 'X', typeLine: 'Bone Helmet', frameType: 2, explicitMods: ['+50 to maximum Life'], socketedItems: [{ id: 'g', typeLine: 'Raise Spectre', frameType: 4 }] },
        { id: 'i', inventoryId: 'MainInventory', typeLine: 'Chaos Orb', frameType: 5 },
      ],
    }, { hashes: [1, 2, 3], items: [{ id: 'j', typeLine: 'Cobalt Jewel', frameType: 2, explicitMods: ['7% increased maximum Life'] }] });
    expect(view.items.map((e) => e.slot)).toEqual(['Helm']);
    expect(view.items[0].gems[0].typeLine).toBe('Raise Spectre');
    expect(view.jewels).toHaveLength(1);
    expect(view.passives).toBe(3);
    expect(view.profileUrl).toContain('Exile-1234');
  });

  it('lists characters of the chosen league first', () => {
    const l = sortCharacters([
      { name: 'Old', league: 'Standard', class: 'Witch', level: 100 },
      { name: 'New', league: 'Covens', class: 'Witch', level: 80 },
    ], 'Covens');
    expect(l[0].name).toBe('New');
  });

  it('has a demo character with stats', () => {
    expect(demoCharacter('DemoWiedźma').stats.length).toBeGreaterThan(5);
  });
});

describe('groups', () => {
  const items = demoItems();
  it('groups by kind with totals and suggested tabs', () => {
    const g = groupByKind(items, 5);
    expect(g.map((x) => x.key)).toContain('special');
    expect(g.map((x) => x.key)).toContain('currency');
    const total = g.reduce((s, x) => s + x.totalChaos, 0);
    expect(total).toBe(items.reduce((s, p) => s + (p.price.chaos ?? 0), 0));
  });

  it('groups by price band, most expensive first', () => {
    const g = groupByPrice(items, 180, 5);
    expect(g[0].key).toBe('d10');
    expect(g.at(-1)!.key).toBe('none');
  });

  it('suggests a tab', () => {
    const hh = items.find((p) => p.item.name === 'Headhunter')!;
    expect(suggestedTab(hh, 5)).toBe('Unikaty');
  });
});
