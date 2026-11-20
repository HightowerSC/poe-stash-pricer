// PoE HUB – fetches the league's challenge list on its own:
//  1. the official profile page on pathofexile.com (list + the player's own progress; POESESSID or a public profile),
//  2. poedb.tw (list only, no login),
//  3. the list bundled with the app (offline).
// Both pages are parsed from their visible text, so small markup changes do not break it.

import { fetchTimed, userAgent, type FetchLike } from '../http';
import { BUNDLED_CHALLENGES } from './challengeData';
import type { Challenge } from './challenges';

export type ChallengeSource = 'official' | 'poedb' | 'bundled';

export interface CatalogItem {
  title: string;
  desc: string;
  steps: string[];
  /** Progress "done/total" – from the official page; poedb/bundled give "0/total". */
  current: number;
  total: number;
}

export interface ChallengeCatalog {
  league: string;
  source: ChallengeSource;
  fetchedAt: string;
  items: CatalogItem[];
  /** Why better sources were skipped (shown to the user). */
  notes: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…' };

/** Visible text of a page, one block element per line; list items start with "•". */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/?(div|p|h[1-6]|ul|ol|li|tr|td|th|table|section|article|header|footer|br|dt|dd|nav|main|aside|form|button|label|select|option)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
  return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && l !== '•');
}

const COUNTER = /^(.*?)\s*\b(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/;
const num = (s: string) => Number(s.replace(/,/g, ''));
const isBullet = (l: string) => l.startsWith('•');

/**
 * The account's challenges page: each challenge is "Title", "done/total", description, "• step" lines.
 * Title and counter may also share one line ("Title 3/4").
 */
export function parseProfileChallenges(html: string): CatalogItem[] {
  const lines = htmlToLines(html);
  const out: CatalogItem[] = [];
  let cur: CatalogItem | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = !isBullet(l) ? COUNTER.exec(l) : null;
    if (m && !/^\(/.test(l)) {
      let title = m[1].trim();
      if (!title && i > 0 && !isBullet(lines[i - 1]) && !COUNTER.test(lines[i - 1])) {
        title = lines[i - 1];
        // the previous line was taken as this challenge's description/step – take it back
        if (cur && cur.desc === title) cur.desc = '';
      }
      if (title && /[a-z]/i.test(title) && title.length <= 80 && !/completed/i.test(title)) {
        cur = { title, desc: '', steps: [], current: num(m[2]), total: num(m[3]) };
        out.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    if (isBullet(l)) { if (cur.steps.length < 40) cur.steps.push(l.replace(/^•\s*/, '')); }
    else if (!cur.desc && !(i + 1 < lines.length && /^\d[\d,]*\s*\/\s*\d[\d,]*$/.test(lines[i + 1]))) cur.desc = l;
  }
  // a page without challenges (login page, private profile) yields headers only
  return dedupe(out).filter((c) => c.total > 0);
}

/** poedb.tw "<League>_challenges": "Title", "Quantity: N", description, "• step" lines, in the "Challenge /40" section. */
export function parsePoedbChallenges(html: string): CatalogItem[] {
  let lines = htmlToLines(html);
  const start = lines.findIndex((l) => /challenge\s*\/\s*\d+/i.test(l) && !/reward/i.test(l));
  if (start >= 0) lines = lines.slice(start + 1);
  const end = lines.findIndex((l) => /challenge rewards/i.test(l));
  if (end >= 0) lines = lines.slice(0, end);
  const out: CatalogItem[] = [];
  let cur: CatalogItem | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let q = /^Quantity:?\s*(\d[\d,]*)$/i.exec(l);
    let skip = 0;
    if (!q && /^Quantity:?$/i.test(l) && /^\d[\d,]*$/.test(lines[i + 1] ?? '')) { q = [l, lines[i + 1]] as unknown as RegExpExecArray; skip = 1; }
    if (q && i > 0) {
      const title = lines[i - 1].replace(/^•\s*/, '');
      if (cur && cur.desc === title) cur.desc = '';
      if (cur && cur.steps[cur.steps.length - 1] === title) cur.steps.pop();
      cur = { title, desc: '', steps: [], current: 0, total: num(q[1]) };
      out.push(cur);
      i += skip;
      continue;
    }
    if (!cur) continue;
    if (isBullet(l)) { if (cur.steps.length < 40) cur.steps.push(l.replace(/^•\s*/, '')); }
    else if (!cur.desc) cur.desc = l;
    else cur.steps.push(l);
  }
  return dedupe(out);
}

function dedupe(list: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  return list.filter((c) => { const k = c.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** "Hardcore SSF Covens" → "Covens"; permanent leagues have no challenges. */
export function baseLeague(league: string): string | null {
  const b = league.replace(/\b(hardcore|hc|ssf|solo self-found|ruthless)\b/gi, '').replace(/\(.*?\)/g, '').trim();
  if (!b || /^standard$/i.test(b) || /^auto$/i.test(b)) return null;
  return b.split(/\s+/)[0];
}

export function bundledCatalog(league: string): CatalogItem[] | null {
  const base = baseLeague(league);
  const key = base && Object.keys(BUNDLED_CHALLENGES).find((k) => k.toLowerCase() === base.toLowerCase());
  return key ? BUNDLED_CHALLENGES[key].map((c) => ({ title: c.title, desc: c.desc, steps: [], current: 0, total: c.total })) : null;
}

export interface FetchCatalogOptions {
  league: string;
  account: string;
  realm: string;
  poesessid?: string;
  /** Queue for pathofexile.com requests (the app's shared rate limiter); none = send directly. */
  gate?: (url: string, send: () => Promise<Response>) => Promise<Response>;
}

/** Tries the official profile, then poedb, then the bundled list. Never throws for a known league. */
export async function fetchCatalog(fetchFn: FetchLike, o: FetchCatalogOptions): Promise<ChallengeCatalog> {
  const base = baseLeague(o.league);
  if (!base) throw new Error(`Liga „${o.league}” nie ma challenge'y – wybierz ligę ligową (np. Covens) w ustawieniach profilu.`);
  const notes: string[] = [];
  const at = new Date().toISOString();
  const headers: Record<string, string> = { 'User-Agent': userAgent(o.account), Accept: 'text/html' };

  if (o.account.trim()) {
    try {
      const acc = encodeURIComponent(o.account.trim().replace('#', '-'));
      const realm = o.realm && o.realm !== 'pc' ? `&realm=${encodeURIComponent(o.realm)}` : '';
      const url = `https://www.pathofexile.com/account/view-profile/${acc}/challenges?league=${encodeURIComponent(base)}${realm}`;
      const h = o.poesessid ? { ...headers, Cookie: `POESESSID=${o.poesessid}` } : headers;
      const send = () => fetchTimed(fetchFn, url, { headers: h });
      const res = await (o.gate ? o.gate(url, send) : send());
      if (!res.ok) throw new Error(res.status === 403 ? 'profil prywatny albo nieaktualny POESESSID (403)' : `HTTP ${res.status}`);
      const items = parseProfileChallenges(await res.text());
      if (items.length >= 5) return { league: o.league, source: 'official', fetchedAt: at, items, notes };
      throw new Error(o.poesessid ? 'strona nie pokazała challenge’y (nieaktualny POESESSID?)' : 'profil ukrywa challenge – wpisz POESESSID w ustawieniach');
    } catch (e) {
      notes.push(`pathofexile.com: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    notes.push('pathofexile.com: brak nazwy konta w profilu – bez postępu');
  }

  try {
    const res = await fetchTimed(fetchFn, `https://poedb.tw/us/${encodeURIComponent(base)}_challenges`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parsePoedbChallenges(await res.text());
    if (items.length >= 5) return { league: o.league, source: 'poedb', fetchedAt: at, items, notes };
    throw new Error('nie znaleziono listy na stronie');
  } catch (e) {
    notes.push(`poedb.tw: ${e instanceof Error ? e.message : String(e)}`);
  }

  const bundled = bundledCatalog(o.league);
  if (bundled) return { league: o.league, source: 'bundled', fetchedAt: at, items: bundled, notes };
  throw new Error(`Nie udało się pobrać challenge'y ligi ${base}: ${notes.join('; ')}`);
}

const key = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Merges a fetched catalog into the player's saved list: keeps notes, manual entries and the player's order,
 * adds new challenges in catalog order, refreshes descriptions/progress. Only the official page changes "done".
 */
export function mergeCatalog(existing: Challenge[], cat: ChallengeCatalog): Challenge[] {
  const byKey = new Map(cat.items.map((c) => [key(c.title), c]));
  const kept = existing.map((c) => {
    const f = byKey.get(key(c.title));
    if (!f) return c;
    byKey.delete(key(c.title));
    const official = cat.source === 'official';
    return {
      ...c,
      title: f.title,
      desc: f.desc || c.desc,
      steps: f.steps.length ? f.steps : c.steps,
      total: f.total,
      current: official ? f.current : c.current,
      done: official ? f.total > 0 && f.current >= f.total : c.done,
      source: cat.source,
    };
  });
  const added = [...byKey.values()].map((f): Challenge => ({
    id: newId(), title: f.title, notes: '', desc: f.desc, steps: f.steps, total: f.total,
    current: cat.source === 'official' ? f.current : undefined,
    done: cat.source === 'official' && f.total > 0 && f.current >= f.total,
    source: cat.source,
  }));
  return [...kept, ...added];
}
