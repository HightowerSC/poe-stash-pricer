// Makes item JSON from the trade site safe to work with.
// Real data is not always plain strings: mod lines can carry markup like "[Life|maximum Life]",
// and some fields can be objects or numbers. Everything downstream expects plain strings.

import type { PoeItem } from '../shared/types';

const MOD_FIELDS = ['implicitMods', 'explicitMods', 'craftedMods', 'fracturedMods', 'enchantMods', 'utilityMods', 'scourgeMods', 'crucibleMods'] as const;

/** "[Resistances|Resistance]" -> "Resistance", "[Life]" -> "Life". */
export function stripMarkup(text: string): string {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1');
}

/** Turns anything that may appear as a mod line into a plain string, or null if it carries no text. */
export function modText(v: unknown): string | null {
  if (typeof v === 'string') return stripMarkup(v);
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const t = o.text ?? o.description ?? o.name ?? o.value;
    return typeof t === 'string' ? stripMarkup(t) : null;
  }
  return null;
}

function lines(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  // Keep one entry per mod (no splitting), so indexes still line up with extended.hashes for mod tiers.
  return arr.map((x) => modText(x)?.trim() ?? '').filter(Boolean);
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? stripMarkup(v) : v == null ? fallback : String(v));

export function normalizeItem(raw: any): PoeItem {
  const item: any = { ...(raw ?? {}) };
  item.id = str(item.id);
  item.name = str(item.name);
  item.typeLine = str(item.typeLine);
  item.baseType = str(item.baseType, item.typeLine);
  item.icon = str(item.icon);
  item.ilvl = Number(item.ilvl ?? item.itemLevel ?? 0) || 0;
  item.frameType = Number(item.frameType ?? 0) || 0;
  item.w = Math.max(1, Number(item.w ?? 1) || 1);
  item.h = Math.max(1, Number(item.h ?? 1) || 1);
  for (const f of MOD_FIELDS) {
    const v = lines(item[f]);
    if (v) item[f] = v;
    else delete item[f];
  }
  if (Array.isArray(item.properties)) {
    item.properties = item.properties
      .filter((p: any) => p && typeof p === 'object')
      .map((p: any) => ({
        ...p,
        name: str(p.name),
        values: Array.isArray(p.values) ? p.values.map((v: any) => [str(Array.isArray(v) ? v[0] : v), Array.isArray(v) ? Number(v[1]) || 0 : 0]) : [],
      }));
  }
  if (item.sockets && !Array.isArray(item.sockets)) delete item.sockets;
  return item as PoeItem;
}

/** Location of a trade listing in the seller's public tab. */
export function listingLocation(listing: any, item: PoeItem): import('../shared/types').ItemLocation | undefined {
  const st = listing?.listing?.stash;
  if (!st || typeof st !== 'object') return undefined;
  const x = Number(st.x);
  const y = Number(st.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { tab: str(st.name, '?'), x, y, w: item.w ?? 1, h: item.h ?? 1 };
}
