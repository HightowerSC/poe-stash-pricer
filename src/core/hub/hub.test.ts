import { describe, expect, it } from 'vitest';
import { demoCharacter, gearStats } from '../character';
import { diagnose, itemRes, upgradeQuery } from './upgrades';
import { challengeHints, parseChallenges, progress } from './challenges';
import type { CharacterView, EquippedItem, PoeItem } from '../../shared/types';

const item = (id: string, mods: string[], extra: Partial<PoeItem> = {}): PoeItem => ({ id, name: '', typeLine: 'Base', baseType: 'Base', icon: '', ilvl: 84, frameType: 2, explicitMods: mods, ...extra });
const eq = (slot: string, it: PoeItem): EquippedItem => ({ slot, item: it, gems: [] });

function viewOf(items: EquippedItem[], level = 90): CharacterView {
  const base = demoCharacter('Test');
  return { ...base, summary: { ...base.summary, level }, items, jewels: [], stats: gearStats(items.map((e) => e.item)) };
}

describe('PoE HUB diagnosis', () => {
  const gear = [
    eq('Helm', item('h', ['+60 to maximum Life', '+30% to Fire Resistance'])),
    eq('BodyArmour', item('b', ['+90 to maximum Life', '+20% to Cold Resistance'])),
    eq('Gloves', item('g', ['+50 to maximum Life'])),
    eq('Boots', item('bo', ['+40 to maximum Life', '25% increased Movement Speed', '-17% to Chaos Resistance'])),
    eq('Ring', item('r', ['+10% to all Elemental Resistances'])),
    eq('Ring2', item('r2', ['+30% to Lightning Resistance'])),
    eq('Amulet', item('a', ['+40 to maximum Life'])),
    eq('Belt', item('be', ['+70 to maximum Life'])),
  ];

  it('finds uncapped and negative resistances', () => {
    const d = diagnose(viewOf(gear));
    expect(d.deficits.fire).toBe(35);
    expect(d.deficits.cold).toBe(45);
    expect(d.deficits.lightning).toBe(35);
    expect(d.deficits.chaos).toBe(17);
    expect(d.issues[0].severity).toBe('high');
    expect(d.weakestSlots.length).toBeGreaterThan(0);
  });

  it('suggests bench crafts that fix a deficit', () => {
    const d = diagnose(viewOf(gear));
    expect(d.quickFixes.length).toBeGreaterThan(0);
    expect(d.quickFixes.every((f) => f.fixes.length > 0)).toBe(true);
  });

  it('flags missing gear slots', () => {
    const d = diagnose(viewOf(gear.slice(0, 3)));
    expect(d.issues.some((i) => /Brakuje części ekwipunku/.test(i.text))).toBe(true);
  });

  it('counts dual and all-res lines per element', () => {
    const e = eq('Ring', item('x', ['+12% to all Elemental Resistances', '+20% to Fire and Cold Resistances', '+15% to Chaos Resistance']));
    expect(itemRes(e, 'Fire')).toBe(32);
    expect(itemRes(e, 'Lightning')).toBe(12);
    expect(itemRes(e, 'Chaos')).toBe(15);
  });

  it('builds an upgrade query that keeps what the item gives and adds part of the deficit', () => {
    const q = upgradeQuery(gear[0], { fire: 0, cold: 30, lightning: 0, chaos: 0 })!;
    const filters = (q.query.query.stats[0].filters as { id: string; value: { min: number } }[]);
    const min = (id: string) => filters.find((f) => f.id === id)?.value.min;
    expect(min('pseudo.pseudo_total_life')).toBe(60);
    expect(min('pseudo.pseudo_total_fire_resistance')).toBe(30);
    expect(min('pseudo.pseudo_total_cold_resistance')).toBe(30);
    expect(q.query.query.filters.type_filters.filters.category.option).toBe('armour.helmet');
  });

  it('keeps movement speed on boots and skips weapons', () => {
    const q = upgradeQuery(gear[3], { fire: 0, cold: 0, lightning: 0, chaos: 0 })!;
    expect(q.wants.some((w) => w.startsWith('ruch 25%'))).toBe(true);
    expect(upgradeQuery(eq('Weapon', item('w', [])), { fire: 0, cold: 0, lightning: 0, chaos: 0 })).toBeNull();
  });
});

describe('PoE HUB challenges', () => {
  it('parses a pasted list, skipping headers, counters and duplicates', () => {
    const list = parseChallenges('Challenges\n- Defeat the Maven 0/1\n\n2. Complete 40 Heist Contracts\nDefeat the maven');
    expect(list.map((c) => c.title)).toEqual(['Defeat the Maven', 'Complete 40 Heist Contracts']);
    const more = parseChallenges('Defeat the Maven\nReach level 95', list);
    expect(more.length).toBe(3);
  });

  it('gives hints by keyword and counts progress', () => {
    expect(challengeHints('Complete 40 Heist Contracts')[0]).toMatch(/Heist/);
    expect(challengeHints('xyz')).toEqual([]);
    expect(progress([{ id: '1', title: 'a', done: true, notes: '' }, { id: '2', title: 'b', done: false, notes: '' }])).toEqual({ done: 1, total: 2 });
  });
});
