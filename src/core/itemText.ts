// Parses the text Path of Exile puts in the clipboard when you press Ctrl+C on an item
// (Ctrl+Alt+C "advanced" text too, which adds affix tiers: { Prefix Modifier "Virile" (Tier: 2) }).
// This is the game's own copy feature; the app reads the text only after the player copies an item.

import type { PoeItem } from '../shared/types';

const RARITY: Record<string, number> = {
  normal: 0, magic: 1, rare: 2, unique: 3, gem: 4, currency: 5, 'divination card': 6,
};

const INFLUENCES: Record<string, string> = {
  'shaper item': 'shaper', 'elder item': 'elder', 'crusader item': 'crusader', 'redeemer item': 'redeemer',
  'hunter item': 'hunter', 'warlord item': 'warlord', 'searing exarch item': 'searing', 'eater of worlds item': 'tangled',
};

/** True when the text looks like a copied PoE item. */
export function isItemText(text: string): boolean {
  return /^(Item Class: .+\r?\n)?Rarity: .+/m.test(text) && text.includes('--------');
}

let counter = 0;

export function parseItemText(text: string): PoeItem | null {
  if (!isItemText(text)) return null;
  const sections = text.replace(/\r/g, '').split(/\n--------\n/).map((s) => s.split('\n').map((l) => l.trim()).filter(Boolean));
  const head = sections[0];
  const itemClass = head.find((l) => l.startsWith('Item Class: '))?.slice(12) ?? '';
  const rarityLine = head.find((l) => l.startsWith('Rarity: '));
  if (!rarityLine) return null;
  const rarity = rarityLine.slice(8).toLowerCase();
  const names = head.filter((l) => !l.startsWith('Item Class: ') && !l.startsWith('Rarity: '));
  const frameType = RARITY[rarity] ?? 0;

  const item: PoeItem = {
    id: `clip-${Date.now()}-${++counter}`,
    name: '',
    typeLine: '',
    baseType: '',
    icon: '',
    ilvl: 0,
    frameType,
    identified: true,
  };
  if (names.length >= 2) {
    item.name = names[0];
    item.typeLine = names[1];
    item.baseType = names[1];
  } else {
    item.typeLine = names[0] ?? '';
    // Magic items carry their affixes in the name; the engine finds the base. Normal items: the line is the base.
    item.baseType = frameType === 1 ? '' : item.typeLine;
  }
  if (/^Superior /.test(item.baseType) && frameType === 0) item.baseType = item.baseType.replace(/^Superior /, '');
  if (frameType === 3 && rarity === 'unique' && /Foil|Relic/.test(text)) item.frameType = 9;

  const implicit: string[] = [];
  const explicit: string[] = [];
  const crafted: string[] = [];
  const fractured: string[] = [];
  const enchant: string[] = [];
  const tiers: { name: string; tier: string }[] = [];
  const hashes: [string, number[]][] = [];
  item.properties = [];
  item.influences = {};

  for (const sec of sections.slice(1)) {
    for (const raw of sec) {
      const line = raw;
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^Item Level: (\d+)/))) { item.ilvl = Number(m[1]); continue; }
      if ((m = line.match(/^Stack Size: ([\d,.\s]+)\//))) { item.stackSize = Number(m[1].replace(/[^\d]/g, '')); continue; }
      if ((m = line.match(/^Sockets: (.+)$/))) { item.sockets = socketsFrom(m[1]); continue; }
      if (line === 'Corrupted') { item.corrupted = true; continue; }
      if (line === 'Unidentified') { item.identified = false; continue; }
      if (line === 'Fractured Item') { item.fractured = true; continue; }
      if (line === 'Synthesised Item') { item.synthesised = true; continue; }
      if (line === 'Mirrored') { (item as any).mirrored = true; continue; }
      if (INFLUENCES[line.toLowerCase()]) { item.influences![INFLUENCES[line.toLowerCase()]] = true; continue; }
      // Advanced copy: "{ Prefix Modifier "Virile" (Tier: 2) — Life }" before the mod lines it produced.
      if ((m = line.match(/^\{ (Prefix|Suffix) Modifier "([^"]*)"(?: \(Tier: (\d+)\))?/))) {
        tiers.push({ name: m[2], tier: `${m[1][0]}${m[3] ?? ''}` });
        continue;
      }
      if (line.startsWith('{')) continue;
      if ((m = line.match(/^(Quality|Level|Armour|Evasion Rating|Energy Shield|Physical Damage|Elemental Damage|Critical Strike Chance|Attacks per Second|Map Tier|Experience|Chance to Block|Ward)(?: \([^)]*\))?: (.+)$/))) {
        item.properties.push({ name: m[1], values: [[m[2].replace(/ \(augmented\)| \(unmet\)/g, ''), 0]] });
        continue;
      }
      if (/^(Requirements:|Requires |Level: |Str: |Dex: |Int: |Note: |Place into|Right click|Shift click|Can be used|Travel to|This is a Support Gem|Item Class)/.test(line)) continue;
      if (sec === sections[1] && /^[A-Z][a-z]+(?: [A-Za-z]+)*$/.test(line) && frameType === 4) continue; // gem tags line
      const clean = line.replace(/ \((implicit|crafted|enchant|fractured|augmented|scourge|crucible)\)$/, '');
      if (/\(implicit\)$/.test(line)) implicit.push(clean);
      else if (/\(crafted\)$/.test(line)) crafted.push(clean);
      else if (/\(enchant\)$/.test(line)) enchant.push(clean);
      else if (/\(fractured\)$/.test(line)) { fractured.push(clean); explicit.push(clean); }
      else if (isModSection(sec)) {
        if (tiers.length && hashes.length < explicit.length + 1) hashes.push([`h${explicit.length}`, [tiers.length - 1]]);
        explicit.push(clean);
      }
    }
  }
  if (implicit.length) item.implicitMods = implicit;
  if (explicit.length) item.explicitMods = explicit;
  if (crafted.length) item.craftedMods = crafted;
  if (fractured.length) item.fracturedMods = fractured;
  if (enchant.length) item.enchantMods = enchant;
  if (tiers.length) item.extended = { mods: { explicit: tiers }, hashes: { explicit: hashes } };
  if (/Jewel/.test(itemClass)) item.extended = { ...(item.extended ?? {}), category: 'jewels', ...(itemClass.includes('Abyss') ? { subcategories: ['abyss'] } : {}) };
  const slot = SUBCATEGORY[itemClass];
  if (slot) item.extended = { ...(item.extended ?? {}), subcategories: [slot] };
  return item;
}

const SUBCATEGORY: Record<string, string> = {
  Boots: 'boots', Gloves: 'gloves', Helmets: 'helmet', 'Body Armours': 'chest', Shields: 'shield',
  Rings: 'ring', Amulets: 'amulet', Belts: 'belt', Quivers: 'quiver',
};

/** A section is a mod block when its lines are not "Name: value" properties or flavour text. */
function isModSection(sec: string[]): boolean {
  return sec.some((l) => /\d|^[A-Z][a-z]+ (have|deal|are|gain|take|cannot|can)\b|^Socketed|^Adds|^Grants|^Your|^You /.test(l))
    && !sec.every((l) => /^"|^[A-Z][^:]*\.$/.test(l));
}

function socketsFrom(s: string): { group: number; sColour: string }[] {
  const out: { group: number; sColour: string }[] = [];
  let group = 0;
  for (const part of s.trim().split(' ')) {
    for (const c of part.split('-')) if (c) out.push({ group, sColour: c });
    group++;
  }
  return out;
}
