// Character tab: equipped gear, socketed gems, tree jewels and stats added up from gear,
// in the spirit of poe.ninja builds. Data comes from the public profile endpoints (or POESESSID).
// Full calculated stats (DPS, EHP) need Path of Building; this module sums what the item mods give.

import type { CharacterStat, CharacterSummary, CharacterView, EquippedItem, PoeItem } from '../shared/types';
import { normalizeItem } from './normalize';

const SLOT_ORDER = ['Weapon', 'Offhand', 'Helm', 'BodyArmour', 'Gloves', 'Boots', 'Amulet', 'Ring', 'Ring2', 'Ring3', 'Belt', 'Flask', 'Weapon2', 'Offhand2'];

export function toSummary(raw: any): CharacterSummary {
  return {
    name: String(raw?.name ?? ''),
    league: String(raw?.league ?? ''),
    class: String(raw?.class ?? ''),
    level: Number(raw?.level ?? 0) || 0,
  };
}

/** Characters of the chosen league first, then by level. */
export function sortCharacters(list: CharacterSummary[], league: string): CharacterSummary[] {
  return [...list].sort((a, b) => Number(b.league === league) - Number(a.league === league) || b.level - a.level || a.name.localeCompare(b.name));
}

function equipped(raw: any): EquippedItem {
  const item = normalizeItem(raw);
  const gems: PoeItem[] = Array.isArray(raw?.socketedItems) ? raw.socketedItems.map(normalizeItem) : [];
  return { slot: String(raw?.inventoryId ?? ''), item, gems };
}

export function buildCharacter(account: string, realm: string, itemsResponse: { character: any; items: any[] }, passives: { hashes?: number[]; items?: any[]; mastery_effects?: Record<string, unknown> } | null): CharacterView {
  const summary = toSummary(itemsResponse.character);
  const items = (itemsResponse.items ?? [])
    .map(equipped)
    // Weapon swap and the main inventory are not gear.
    .filter((e) => e.slot && e.slot !== 'MainInventory' && e.slot !== 'ExpandedMainInventory')
    .sort((a, b) => order(a.slot) - order(b.slot) || Number((a.item as any).x ?? 0) - Number((b.item as any).x ?? 0));
  const jewels = (passives?.items ?? []).map((r) => ({ ...equipped(r), slot: 'PassiveJewels' }));
  const active = items.filter((e) => !/2$/.test(e.slot) || e.slot === 'Ring2');
  return {
    summary,
    account,
    items,
    jewels,
    passives: passives?.hashes?.length ?? 0,
    masteries: passives?.mastery_effects ? Object.keys(passives.mastery_effects).length : 0,
    stats: gearStats([...active.filter((e) => e.slot !== 'Flask').map((e) => e.item), ...jewels.map((j) => j.item)]),
    profileUrl: `https://www.pathofexile.com/account/view-profile/${encodeURIComponent(account.replace('#', '-'))}/characters?characterName=${encodeURIComponent(summary.name)}${realm !== 'pc' ? `&realm=${realm}` : ''}`,
  };
}

const order = (slot: string) => {
  const i = SLOT_ORDER.indexOf(slot);
  return i === -1 ? 99 : i;
};

// ---------- stats from gear ----------

type Rule = { re: RegExp; add: (t: Totals, n: number[]) => void };
interface Totals { [k: string]: number }

const RULES: Rule[] = [
  { re: /^\+?(\d+) to maximum Life$/, add: (t, [n]) => { t.life += n; } },
  { re: /^(\d+)% increased maximum Life$/, add: (t, [n]) => { t.lifeInc += n; } },
  { re: /^\+?(\d+) to maximum Energy Shield$/, add: (t, [n]) => { t.es += n; } },
  { re: /^(\d+)% increased maximum Energy Shield$/, add: (t, [n]) => { t.esInc += n; } },
  { re: /^\+?(\d+) to maximum Mana$/, add: (t, [n]) => { t.mana += n; } },
  { re: /^\+?(\d+)% to Fire Resistance$/, add: (t, [n]) => { t.fire += n; } },
  { re: /^\+?(\d+)% to Cold Resistance$/, add: (t, [n]) => { t.cold += n; } },
  { re: /^\+?(\d+)% to Lightning Resistance$/, add: (t, [n]) => { t.light += n; } },
  { re: /^\+?(\d+)% to Chaos Resistance$/, add: (t, [n]) => { t.chaos += n; } },
  { re: /^\+?(\d+)% to Fire and Cold Resistances$/, add: (t, [n]) => { t.fire += n; t.cold += n; } },
  { re: /^\+?(\d+)% to Fire and Lightning Resistances$/, add: (t, [n]) => { t.fire += n; t.light += n; } },
  { re: /^\+?(\d+)% to Cold and Lightning Resistances$/, add: (t, [n]) => { t.cold += n; t.light += n; } },
  { re: /^\+?(\d+)% to Fire and Chaos Resistances$/, add: (t, [n]) => { t.fire += n; t.chaos += n; } },
  { re: /^\+?(\d+)% to Cold and Chaos Resistances$/, add: (t, [n]) => { t.cold += n; t.chaos += n; } },
  { re: /^\+?(\d+)% to Lightning and Chaos Resistances$/, add: (t, [n]) => { t.light += n; t.chaos += n; } },
  { re: /^\+?(\d+)% to all Elemental Resistances$/, add: (t, [n]) => { t.fire += n; t.cold += n; t.light += n; } },
  { re: /^\+?(\d+) to Strength$/, add: (t, [n]) => { t.str += n; } },
  { re: /^\+?(\d+) to Dexterity$/, add: (t, [n]) => { t.dex += n; } },
  { re: /^\+?(\d+) to Intelligence$/, add: (t, [n]) => { t.int += n; } },
  { re: /^\+?(\d+) to Strength and Dexterity$/, add: (t, [n]) => { t.str += n; t.dex += n; } },
  { re: /^\+?(\d+) to Strength and Intelligence$/, add: (t, [n]) => { t.str += n; t.int += n; } },
  { re: /^\+?(\d+) to Dexterity and Intelligence$/, add: (t, [n]) => { t.dex += n; t.int += n; } },
  { re: /^\+?(\d+) to all Attributes$/, add: (t, [n]) => { t.str += n; t.dex += n; t.int += n; } },
  { re: /^(\d+)% increased Movement Speed$/, add: (t, [n]) => { t.ms += n; } },
  { re: /^\+?(\d+)% chance to Suppress Spell Damage$/, add: (t, [n]) => { t.suppress += n; } },
  { re: /^(\d+)% increased Attack Speed$/, add: (t, [n]) => { t.aspd += n; } },
  { re: /^(\d+)% increased Cast Speed$/, add: (t, [n]) => { t.cspd += n; } },
  { re: /^\+?(\d+)% to Global Critical Strike Multiplier$/, add: (t, [n]) => { t.critMulti += n; } },
  { re: /^(\d+)% increased Global Critical Strike Chance$/, add: (t, [n]) => { t.critChance += n; } },
  { re: /^(\d+)% increased Spell Damage$/, add: (t, [n]) => { t.spell += n; } },
  { re: /^\+?(\d+)% to Damage over Time Multiplier$/, add: (t, [n]) => { t.dot += n; } },
  { re: /^\+?(\d+) to Level of all .*Gems$/, add: (t, [n]) => { t.gemLevels += n; } },
  { re: /^\+?(\d+)% Chance to Block Attack Damage$/, add: (t, [n]) => { t.block += n; } },
  { re: /^\+?(\d+) to Armour$/, add: (t, [n]) => { t.armour += n; } },
  { re: /^\+?(\d+) to Evasion Rating$/, add: (t, [n]) => { t.evasion += n; } },
];

const KEYS = ['life', 'lifeInc', 'es', 'esInc', 'mana', 'fire', 'cold', 'light', 'chaos', 'str', 'dex', 'int', 'ms', 'suppress', 'aspd', 'cspd', 'critMulti', 'critChance', 'spell', 'dot', 'gemLevels', 'block', 'armour', 'evasion', 'baseArmour', 'baseEvasion', 'baseEs'];

/** Adds up the mod lines of the given items (implicit, explicit, crafted, fractured, enchant) and their defences. */
export function gearStats(items: PoeItem[]): CharacterStat[] {
  const t: Totals = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const it of items) {
    const lines = [...(it.implicitMods ?? []), ...(it.explicitMods ?? []), ...(it.craftedMods ?? []), ...(it.fracturedMods ?? []), ...(it.enchantMods ?? [])];
    for (const line of lines) {
      if (typeof line !== 'string') continue;
      for (const r of RULES) {
        const m = line.match(r.re);
        if (m) { r.add(t, m.slice(1).map(Number)); break; }
      }
    }
    // Armour pieces list their final defences as properties.
    for (const p of it.properties ?? []) {
      const v = Number(String(p.values?.[0]?.[0] ?? '').replace(/[^\d.]/g, ''));
      if (!Number.isFinite(v)) continue;
      if (p.name === 'Armour') t.baseArmour += v;
      if (p.name === 'Evasion Rating') t.baseEvasion += v;
      if (p.name === 'Energy Shield') t.baseEs += v;
    }
  }
  const out: CharacterStat[] = [
    { label: 'Życie z ekwipunku', value: t.life, kind: 'life' },
    { label: 'Zwiększone życie', value: t.lifeInc, unit: '%', kind: 'life' },
    { label: 'Energy Shield (przedmioty)', value: t.baseEs + t.es, kind: 'defence' },
    { label: 'Pancerz (przedmioty)', value: t.baseArmour + t.armour, kind: 'defence' },
    { label: 'Uniki (przedmioty)', value: t.baseEvasion + t.evasion, kind: 'defence' },
    { label: 'Mana', value: t.mana, kind: 'other' },
    { label: 'Odporność na ogień', value: t.fire, unit: '%', kind: 'res' },
    { label: 'Odporność na zimno', value: t.cold, unit: '%', kind: 'res' },
    { label: 'Odporność na błyskawice', value: t.light, unit: '%', kind: 'res' },
    { label: 'Odporność na chaos', value: t.chaos, unit: '%', kind: 'res' },
    { label: 'Siła', value: t.str, kind: 'attr' },
    { label: 'Zręczność', value: t.dex, kind: 'attr' },
    { label: 'Inteligencja', value: t.int, kind: 'attr' },
    { label: 'Szybkość ruchu', value: t.ms, unit: '%', kind: 'other' },
    { label: 'Spell suppression', value: t.suppress, unit: '%', kind: 'defence' },
    { label: 'Blok ataków', value: t.block, unit: '%', kind: 'defence' },
    { label: 'Szybkość ataku', value: t.aspd, unit: '%', kind: 'offence' },
    { label: 'Szybkość rzucania', value: t.cspd, unit: '%', kind: 'offence' },
    { label: 'Mnożnik krytyka', value: t.critMulti, unit: '%', kind: 'offence' },
    { label: 'Szansa na krytyk', value: t.critChance, unit: '%', kind: 'offence' },
    { label: 'Obrażenia od czarów', value: t.spell, unit: '%', kind: 'offence' },
    { label: 'Mnożnik DoT', value: t.dot, unit: '%', kind: 'offence' },
    { label: '+ poziomy gemów', value: t.gemLevels, kind: 'offence' },
  ];
  // Resistances are always shown (0 is useful information); other stats only when the gear has them.
  return out.filter((s) => s.kind === 'res' || s.value !== 0);
}

// ---------- demo ----------

const ICON = 'https://web.poecdn.com/image/Art/2DItems/';

export function demoCharacters(): CharacterSummary[] {
  return [
    { name: 'DemoWiedźma', league: 'Covens', class: 'Necromancer', level: 94 },
    { name: 'DemoŁucznik', league: 'Standard', class: 'Deadeye', level: 88 },
  ];
}

export function demoCharacter(name: string): CharacterView {
  const it = (id: string, slot: string, p: Partial<PoeItem>, gems: Partial<PoeItem>[] = []): EquippedItem => ({
    slot,
    item: { id, name: '', typeLine: '', baseType: '', icon: '', ilvl: 84, frameType: 2, ...p } as PoeItem,
    gems: gems.map((g, i) => ({ id: `${id}-g${i}`, name: '', typeLine: '', baseType: '', icon: '', ilvl: 0, frameType: 4, ...g } as PoeItem)),
  });
  const items: EquippedItem[] = [
    it('d-w', 'Weapon', { name: 'Doom Song', typeLine: 'Convoking Wand', baseType: 'Convoking Wand', icon: `${ICON}Weapons/OneHandWeapons/Wands/Wand6.png`, w: 1, h: 3,
      implicitMods: ['Can roll Minion Modifiers'], explicitMods: ['+1 to Level of all Minion Skill Gems', 'Minions deal 85% increased Damage', '+28% to Fire Resistance', '12% increased Cast Speed'] },
      [{ typeLine: 'Raise Spectre' }, { typeLine: 'Minion Damage Support' }, { typeLine: 'Spell Echo Support' }]),
    it('d-h', 'Helm', { name: 'Grim Visage', typeLine: 'Bone Helmet', baseType: 'Bone Helmet', icon: `${ICON}Armours/Helmets/BoneHelm.png`, w: 2, h: 2,
      properties: [{ name: 'Energy Shield', values: [['112', 1]] }],
      explicitMods: ['+78 to maximum Life', '+42% to Cold Resistance', '+35% to Lightning Resistance', '+21% to Chaos Resistance'] }),
    it('d-b', 'BodyArmour', { name: 'Ghost Shroud', typeLine: 'Vaal Regalia', baseType: 'Vaal Regalia', icon: `${ICON}Armours/BodyArmours/BodyInt1C.png`, w: 2, h: 3,
      properties: [{ name: 'Energy Shield', values: [['420', 1]] }],
      explicitMods: ['+96 to maximum Life', '+38% to Fire Resistance', '+18% to Fire and Cold Resistances'] }),
    it('d-g', 'Gloves', { name: 'Kaom Grip', typeLine: 'Fingerless Silk Gloves', baseType: 'Fingerless Silk Gloves', icon: `${ICON}Armours/Gloves/GlovesInt7.png`, w: 2, h: 2,
      explicitMods: ['+65 to maximum Life', '+40% to Lightning Resistance', '+29 to Intelligence'] }),
    it('d-bo', 'Boots', { name: 'Doom Stride', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots', icon: `${ICON}Armours/Boots/TwoTonedBoots.png`, w: 2, h: 2,
      implicitMods: ['+12% to Fire and Cold Resistances'], explicitMods: ['+82 to maximum Life', '30% increased Movement Speed', '+41% to Cold Resistance'] }),
    it('d-a', 'Amulet', { name: 'Bane Beads', typeLine: 'Citrine Amulet', baseType: 'Citrine Amulet', icon: `${ICON}Amulets/Amulet6.png`,
      implicitMods: ['+22 to Strength and Dexterity'], explicitMods: ['+1 to Level of all Minion Skill Gems', '+55 to maximum Life', '+30% to Global Critical Strike Multiplier'] }),
    it('d-r1', 'Ring', { name: 'Gale Coil', typeLine: 'Two-Stone Ring', baseType: 'Two-Stone Ring', icon: `${ICON}Rings/TopazRuby.png`,
      implicitMods: ['+14% to Fire and Lightning Resistances'], explicitMods: ['+60 to maximum Life', '+33% to Cold Resistance', '+11% to Chaos Resistance'] }),
    it('d-r2', 'Ring2', { name: 'Kaom Loop', typeLine: 'Amethyst Ring', baseType: 'Amethyst Ring', icon: `${ICON}Rings/Ring5.png`,
      implicitMods: ['+19% to Chaos Resistance'], explicitMods: ['+48 to maximum Life', '+27% to Fire Resistance', '+39 to Intelligence'] }),
    it('d-be', 'Belt', { name: 'Headhunter', typeLine: 'Leather Belt', baseType: 'Leather Belt', icon: `${ICON}Belts/Headhunter.png`, frameType: 3,
      implicitMods: ['+33 to maximum Life'], explicitMods: ['+52 to Strength', '+55 to Dexterity', '+60 to maximum Life'] }),
  ];
  const jewels = [
    it('d-j1', 'PassiveJewels', { name: 'Rapture Gaze', typeLine: 'Cobalt Jewel', baseType: 'Cobalt Jewel', icon: `${ICON}Jewels/basicint.png`,
      explicitMods: ['7% increased maximum Life', '+12% to Fire Resistance'] }),
  ];
  const summary = demoCharacters().find((c) => c.name === name) ?? demoCharacters()[0];
  return {
    summary, account: 'Demo#0000', items, jewels, passives: 118, masteries: 9,
    stats: gearStats([...items.map((e) => e.item), ...jewels.map((j) => j.item)]),
    profileUrl: 'https://www.pathofexile.com/',
  };
}
