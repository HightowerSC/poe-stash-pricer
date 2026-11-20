import { describe, expect, it } from 'vitest';
import { isItemText, parseItemText } from './itemText';
import { affixInfo } from './craft/advisor';

const RARE = `Item Class: Boots
Rarity: Rare
Doom Stride
Two-Toned Boots
--------
Quality: +20% (augmented)
Armour: 120 (augmented)
Energy Shield: 30 (augmented)
--------
Requirements:
Level: 70
Str: 62
Int: 62
--------
Sockets: B-B-R G
--------
Item Level: 84
--------
+12% to Fire and Cold Resistances (implicit)
--------
+82 to maximum Life
30% increased Movement Speed
+41% to Cold Resistance
+18% to Chaos Resistance (crafted)
--------
Corrupted
--------
Shaper Item`;

const ADVANCED = `Item Class: Rings
Rarity: Rare
Gale Coil
Two-Stone Ring
--------
Item Level: 83
--------
{ Implicit Modifier }
+14% to Fire and Lightning Resistances (implicit)
--------
{ Prefix Modifier "Virile" (Tier: 2) — Life }
+60 to maximum Life
{ Suffix Modifier "of the Polar Bear" (Tier: 3) — Elemental, Cold, Resistance }
+33% to Cold Resistance`;

const CURRENCY = `Item Class: Stackable Currency
Rarity: Currency
Divine Orb
--------
Stack Size: 7/20
--------
Randomises the numeric values of the random modifiers on an item
--------
Right click this item then left click on a magic, rare or unique item to apply it.`;

const UNIQUE = `Item Class: Body Armours
Rarity: Unique
The Covenant
Spidersilk Robe
--------
Energy Shield: 230 (augmented)
--------
Item Level: 86
--------
+1 to Level of Socketed Gems (implicit)
--------
Socketed Gems are Supported by Level 22 Blood Magic
+112 to maximum Energy Shield
--------
"Whispers of a covenant long forgotten"
--------
Corrupted`;

describe('clipboard item text', () => {
  it('recognises item text only', () => {
    expect(isItemText(RARE)).toBe(true);
    expect(isItemText('hello world')).toBe(false);
  });

  it('parses a rare with implicit, crafted mods, sockets and influence', () => {
    const it = parseItemText(RARE)!;
    expect(it.frameType).toBe(2);
    expect(it.name).toBe('Doom Stride');
    expect(it.baseType).toBe('Two-Toned Boots');
    expect(it.ilvl).toBe(84);
    expect(it.implicitMods).toEqual(['+12% to Fire and Cold Resistances']);
    expect(it.explicitMods).toEqual(['+82 to maximum Life', '30% increased Movement Speed', '+41% to Cold Resistance']);
    expect(it.craftedMods).toEqual(['+18% to Chaos Resistance']);
    expect(it.corrupted).toBe(true);
    expect(it.influences).toEqual({ shaper: true });
    expect(it.sockets).toHaveLength(4);
    expect(it.properties!.find((p) => p.name === 'Energy Shield')!.values[0][0]).toBe('30');
  });

  it('reads tiers from the advanced copy, so the craft advisor works', () => {
    const it = parseItemText(ADVANCED)!;
    expect(it.explicitMods).toEqual(['+60 to maximum Life', '+33% to Cold Resistance']);
    expect(affixInfo(it)).toMatchObject({ prefixes: 1, suffixes: 1, known: true });
    expect(it.extended?.subcategories).toEqual(['ring']);
  });

  it('parses a currency stack', () => {
    const it = parseItemText(CURRENCY)!;
    expect(it.frameType).toBe(5);
    expect(it.typeLine).toBe('Divine Orb');
    expect(it.stackSize).toBe(7);
  });

  it('parses a corrupted unique without flavour text', () => {
    const it = parseItemText(UNIQUE)!;
    expect(it.name).toBe('The Covenant');
    expect(it.implicitMods).toEqual(['+1 to Level of Socketed Gems']);
    expect(it.explicitMods).toEqual(['Socketed Gems are Supported by Level 22 Blood Magic', '+112 to maximum Energy Shield']);
    expect(it.corrupted).toBe(true);
  });
});
