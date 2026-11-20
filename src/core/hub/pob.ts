// Path of Building import: the export code is base64url(zlib(XML)). Reads class, level, the active
// item set (plus tree jewels) and gems, so the build can be priced as a shopping list.

import { inflateSync } from 'node:zlib';

export interface PobItem {
  slot: string;
  rarity: 'NORMAL' | 'MAGIC' | 'RARE' | 'UNIQUE' | 'RELIC' | string;
  name: string;
  base: string;
  implicits: string[];
  mods: string[];
  /** e.g. "R-R-G-G-B-B" */
  sockets: string;
  corrupted: boolean;
}

export interface PobGem {
  name: string;
  level: number;
  quality: number;
}

export interface PobBuild {
  className: string;
  ascendancy: string;
  level: number;
  items: PobItem[];
  gems: PobGem[];
}

/** Export code (or a pobb.in / pastebin raw text) → XML. */
export function decodePob(code: string): string {
  const clean = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    return inflateSync(Buffer.from(clean, 'base64')).toString('utf8');
  } catch {
    throw new Error('To nie wygląda na kod Path of Building (PoB → Import/Export Build → Generate → Copy).');
  }
}

/** pobb.in and pastebin links → the URL with the raw export code. Other text is a code itself. */
export function pobRawUrl(input: string): string | null {
  const t = input.trim();
  let m = t.match(/^https?:\/\/pobb\.in\/(?:u\/[\w-]+\/)?([\w-]+)\/?$/i);
  if (m) return `https://pobb.in/${m[1]}/raw`;
  m = t.match(/^https?:\/\/pastebin\.com\/(?:raw\/)?(\w+)\/?$/i);
  if (m) return `https://pastebin.com/raw/${m[1]}`;
  return null;
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : '';
};

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
}

const SKIP_LINE = /^(Unique ID|Item Level|LevelReq|Level|Quality|Sockets|Implicits|Selected Variant|Variant|League|Radius|Limited to|Has Alt Variant|Prefix|Suffix|Catalyst|CatalystQuality|Requires|Armour|Evasion|Energy Shield|Ward|ArmourBasePercentile|EvasionBasePercentile|EnergyShieldBasePercentile|WardBasePercentile|Crafted|Shaper Item|Elder Item|Crusader Item|Hunter Item|Redeemer Item|Warlord Item|Synthesised Item|Fractured Item|Mirrored|Split|Cluster Jewel Skill|Cluster Jewel Node Count|Foulborn|Talisman Tier|Has Variants|Corrupted)\b/;

export function parsePobItemText(text: string, slot: string): PobItem | null {
  const lines = decodeXml(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const r = lines.findIndex((l) => /^Rarity:/i.test(l));
  if (r < 0) return null;
  const rarity = lines[r].replace(/^Rarity:\s*/i, '').toUpperCase();
  const rest = lines.slice(r + 1);
  const named = rarity === 'RARE' || rarity === 'UNIQUE' || rarity === 'RELIC';
  const name = named ? rest[0] ?? '' : '';
  const base = named ? rest[1] ?? '' : rest[0] ?? '';
  const sockets = (lines.find((l) => /^Sockets:/.test(l)) ?? '').replace(/^Sockets:\s*/, '');
  const corrupted = lines.some((l) => l === 'Corrupted');
  const implIdx = lines.findIndex((l) => /^Implicits:\s*\d+/.test(l));
  const implicitCount = implIdx >= 0 ? Number(lines[implIdx].match(/\d+/)![0]) : 0;
  const modLines = (implIdx >= 0 ? lines.slice(implIdx + 1) : [])
    .filter((l) => !SKIP_LINE.test(l))
    .map((l) => l.replace(/\{[^}]*\}/g, '').trim())
    .filter((l) => l && !/^\(.*\)$/.test(l));
  return {
    slot, rarity, name, base,
    implicits: modLines.slice(0, implicitCount),
    mods: modLines.slice(implicitCount),
    sockets, corrupted,
  };
}

export function parsePobXml(xml: string): PobBuild {
  const buildTag = xml.match(/<Build\b[^>]*>/)?.[0] ?? '';
  const itemsTag = xml.match(/<Items\b[^>]*>/)?.[0] ?? '';
  const activeSet = attr(itemsTag, 'activeItemSet') || '1';

  const texts = new Map<string, string>();
  for (const m of xml.matchAll(/<Item\b([^>]*)>([\s\S]*?)<\/Item>/g)) texts.set(attr(m[1], 'id'), m[2]);

  const slots: [string, string][] = [];
  const sets = [...xml.matchAll(/<ItemSet\b([^>]*)>([\s\S]*?)<\/ItemSet>/g)];
  const set = sets.find((s) => attr(s[1], 'id') === activeSet) ?? sets[0];
  const slotSrc = set ? set[2] : xml.match(/<Items\b[^>]*>([\s\S]*?)<\/Items>/)?.[1] ?? '';
  for (const m of slotSrc.matchAll(/<Slot\b[^>]*\/?>/g)) {
    const name = attr(m[0], 'name');
    const id = attr(m[0], 'itemId');
    if (id && id !== '0' && !/Swap|Abyssal Socket/.test(name)) slots.push([name, id]);
  }
  // Jewels socketed in the passive tree.
  const tree = xml.match(/<Spec\b[\s\S]*?<\/Spec>/)?.[0] ?? '';
  for (const m of tree.matchAll(/<Socket\b[^>]*\/?>/g)) {
    const id = attr(m[0], 'itemId');
    if (id && id !== '0') slots.push(['Jewel', id]);
  }

  const items: PobItem[] = [];
  for (const [slot, id] of slots) {
    const t = texts.get(id);
    const it = t ? parsePobItemText(t, slot) : null;
    if (it) items.push(it);
  }

  const gems = new Map<string, PobGem>();
  for (const m of xml.matchAll(/<Gem\b[^>]*\/?>/g)) {
    if (attr(m[0], 'enabled') === 'false') continue;
    const name = attr(m[0], 'nameSpec') || attr(m[0], 'skillId');
    if (!name) continue;
    const support = attr(m[0], 'skillId').startsWith('Support') || /Support$/.test(name);
    const g: PobGem = { name: support ? withSupport(name) : name, level: Number(attr(m[0], 'level') || 1), quality: Number(attr(m[0], 'quality') || 0) };
    const prev = gems.get(g.name);
    if (!prev || g.level > prev.level) gems.set(g.name, g);
  }

  return {
    className: attr(buildTag, 'className'),
    ascendancy: attr(buildTag, 'ascendClassName'),
    level: Number(attr(buildTag, 'level') || 0),
    items,
    gems: [...gems.values()],
  };
}

/** PoB stores supports as "Spell Echo"; trade and poe.ninja call them "Spell Echo Support". */
function withSupport(name: string): string {
  return /Support$/.test(name) ? name : `${name} Support`;
}
