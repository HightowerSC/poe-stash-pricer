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

import { buildAdvice, gemMaxLevel } from './build';
import { newFinds, normalizeWatch } from './watch';
import { craftOptions, withCraft } from '../craft/advisor';

describe('PoE HUB build help', () => {
  const gem = (typeLine: string, level = 20, quality = 20): PoeItem => ({ id: typeLine, name: '', typeLine, baseType: typeLine, icon: '', ilvl: 0, frameType: 4,
    properties: [{ name: 'Level', values: [[`${level}`, 0]] }, ...(quality ? [{ name: 'Quality', values: [[`+${quality}%`, 1]] as [string, number][] }] : [])] });
  const sockets = (n: number) => Array.from({ length: n }, () => ({ group: 0, sColour: 'B' }));

  it('flags a 4-linked main skill, low gems, missing utility and flasks', () => {
    const body = { slot: 'BodyArmour', item: item('b', [], { sockets: sockets(4) }), gems: [gem('Fireball', 12, 0), gem('Spell Echo Support', 20, 0), gem('Faster Casting Support', 15, 0), gem('Added Fire Damage Support')] };
    const tips = buildAdvice(viewOf([body]));
    expect(tips[0]).toMatchObject({ severity: 'high', area: 'Linki' });
    expect(tips[0].text).toMatch(/Fireball jest w 4-linku/);
    expect(tips.some((t) => /niskim poziomem: Fireball \(12\)/.test(t.text))).toBe(true);
    expect(tips.some((t) => /skilla ruchu/.test(t.text))).toBe(true);
    expect(tips.some((t) => /0\/5 flaszek/.test(t.text))).toBe(true);
  });

  it('is quiet about a 6-link with utility skills and good flasks', () => {
    const body = { slot: 'BodyArmour', item: item('b', [], { sockets: sockets(6) }), gems: [gem('Fireball'), gem('Spell Echo Support'), gem('Flame Dash'), gem('Steelskin'), gem('Determination')] };
    const flasks = ['of Staunching: Immunity to Bleeding', 'of Heat: Immunity to Freeze', 'Quicksilver Flask', 'Life Flask', 'Granite Flask']
      .map((t, i) => ({ slot: 'Flask', item: item(`f${i}`, [t], { typeLine: t, frameType: 1 }), gems: [] }));
    expect(buildAdvice(viewOf([body, ...flasks]))).toEqual([]);
  });

  it('knows short max levels', () => {
    expect(gemMaxLevel('Awakened Spell Echo Support')).toBe(5);
    expect(gemMaxLevel('Empower Support')).toBe(4);
    expect(gemMaxLevel('Fireball')).toBe(20);
  });
});

describe('PoE HUB upgrade watch', () => {
  const r = (slot: string, prices: (number | null)[]) => ({ slot, wants: ['życie 60+'], total: prices.length, tradeUrl: 'u', offers: prices.map((c, i) => ({ chaos: c, amount: c ?? 1, currency: 'chaos', name: `${slot}${i}`, mods: [] })) });

  it('reports the cheapest offer within budget once', () => {
    const seen = new Set<string>();
    const first = newFinds([r('Helm', [80, 30, 45]), r('Boots', [90, null])], 50, seen);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ slot: 'Helm', chaos: 30, name: 'Helm1' });
    expect(newFinds([r('Helm', [30])], 50, seen)).toHaveLength(1); // different offer name
    expect(newFinds([r('Helm', [80, 30, 45])], 50, seen)).toHaveLength(0);
  });

  it('normalizes settings with a minimum interval', () => {
    expect(normalizeWatch({ everyMinutes: 1, budgetChaos: -5 })).toEqual({ enabled: false, character: '', budgetChaos: 50, everyMinutes: 15 });
  });
});

describe('essence crafting', () => {
  it('offers essences on a white armour base and searches the result as rare', () => {
    const base: PoeItem = { id: 'w', name: '', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots', icon: '', ilvl: 86, frameType: 0, implicitMods: ['+12% to Fire and Cold Resistances'] };
    const { options } = craftOptions(base);
    expect(options.map((o) => o.cost.currency)).toContain('Deafening Essence of Greed');
    expect(options.every((o) => o.method === 'essence')).toBe(true);
    expect(withCraft(base, '+80 to maximum Life').frameType).toBe(2);
  });
});

import { deflateSync } from 'node:zlib';
import { decodePob, parsePobXml, pobRawUrl } from './pob';

describe('Path of Building import', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="94" className="Witch" ascendClassName="Necromancer" mainSocketGroup="1"/>
  <Skills activeSkillSet="1"><SkillSet id="1">
    <Skill enabled="true" slot="Body Armour">
      <Gem nameSpec="Raise Spectre" skillId="RaiseSpectre" level="21" quality="20" enabled="true"/>
      <Gem nameSpec="Spell Echo" skillId="SupportMulticast" level="20" quality="0" enabled="true"/>
      <Gem nameSpec="Empower" skillId="SupportAdditionalLevel" level="4" quality="0" enabled="true"/>
      <Gem nameSpec="Disabled Gem" skillId="X" level="1" quality="0" enabled="false"/>
    </Skill>
  </SkillSet></Skills>
  <Tree activeSpec="1"><Spec treeVersion="3_25"><Sockets><Socket nodeId="1" itemId="3"/><Socket nodeId="2" itemId="0"/></Sockets></Spec></Tree>
  <Items activeItemSet="1">
    <Item id="1">
Rarity: UNIQUE
The Covenant
Spidersilk Robe
Unique ID: abc
Item Level: 85
Sockets: B-B-B-B-B-B
LevelReq: 69
Implicits: 0
Socketed Gems are Supported by Level 22 Added Chaos Damage
{range:0.5}+(100-120) to maximum Energy Shield
Corrupted
    </Item>
    <Item id="2">
Rarity: RARE
Doom Crown
Hubris Circlet
Item Level: 86
Sockets: B-B G B
Implicits: 1
{tags:mana}+23 to maximum Mana
{crafted}+30% to Fire Resistance
+90 to maximum Life
+42% to Cold Resistance
    </Item>
    <Item id="3">
Rarity: RARE
Gloom Eye
Cobalt Jewel
Implicits: 0
7% increased maximum Life
    </Item>
    <ItemSet id="1" useSecondWeaponSet="false">
      <Slot name="Body Armour" itemId="1"/>
      <Slot name="Helmet" itemId="2"/>
      <Slot name="Gloves" itemId="0"/>
    </ItemSet>
  </Items>
</PathOfBuilding>`;
  const code = deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  it('decodes the export code and reads the build', () => {
    const b = parsePobXml(decodePob(code));
    expect(b).toMatchObject({ className: 'Witch', ascendancy: 'Necromancer', level: 94 });
    expect(b.items.map((i) => i.slot)).toEqual(['Body Armour', 'Helmet', 'Jewel']);
    expect(b.items[0]).toMatchObject({ rarity: 'UNIQUE', name: 'The Covenant', base: 'Spidersilk Robe', sockets: 'B-B-B-B-B-B', corrupted: true });
    expect(b.items[1].implicits).toEqual(['+23 to maximum Mana']);
    expect(b.items[1].mods).toEqual(['+30% to Fire Resistance', '+90 to maximum Life', '+42% to Cold Resistance']);
    expect(b.gems.map((g) => g.name)).toEqual(['Raise Spectre', 'Spell Echo Support', 'Empower Support']);
  });

  it('recognises links and rejects garbage', () => {
    expect(pobRawUrl('https://pobb.in/AbC-12')).toBe('https://pobb.in/AbC-12/raw');
    expect(pobRawUrl('https://pastebin.com/xyz123')).toBe('https://pastebin.com/raw/xyz123');
    expect(pobRawUrl(code)).toBeNull();
    expect(() => decodePob('not a code!')).toThrow(/Path of Building/);
  });
});
