// Item icons for the stash picture. The page asks /api/icon?u=<GGG image url>; the server fetches the icon once,
// keeps it on disk and serves it from our own address. That way the picture can be saved as PNG (a canvas with
// images from another site cannot be exported) and icons still show when GGG's image server is slow.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { FetchLike } from '../core/http';
import { fetchTimed } from '../core/http';

/** Only GGG's image servers – the endpoint must never become a general proxy. */
export function allowedIconUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'web.poecdn.com' || u.hostname === 'web.poe.garena.tw' || u.hostname === 'poecdn.game.qq.com') return u;
    if (u.hostname === 'www.pathofexile.com' && u.pathname.startsWith('/image/')) return u;
    return null;
  } catch {
    return null;
  }
}

const MAX_BYTES = 2_000_000;

export class IconCache {
  private readonly dir: string;
  private readonly pending = new Map<string, Promise<{ body: Buffer; type: string }>>();

  constructor(dataDir: string, private readonly fetchFn: FetchLike = fetch) {
    this.dir = path.join(dataDir, 'icons');
  }

  async get(raw: string): Promise<{ body: Buffer; type: string }> {
    const url = allowedIconUrl(raw);
    if (!url) throw new Error('Niedozwolony adres ikony');
    const key = crypto.createHash('sha1').update(url.href).digest('hex');
    const file = path.join(this.dir, `${key}.png`);
    if (fs.existsSync(file)) return { body: fs.readFileSync(file), type: 'image/png' };
    const running = this.pending.get(key);
    if (running) return running;
    const job = (async () => {
      const res = await fetchTimed(this.fetchFn, url.href, {}, 15_000);
      if (!res.ok) throw new Error(`Ikona: HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? 'image/png';
      if (!type.startsWith('image/')) throw new Error('Ikona: to nie jest obraz');
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > MAX_BYTES) throw new Error('Ikona: za duży plik');
      try {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.writeFileSync(file, body);
      } catch { /* cache is optional */ }
      return { body, type };
    })();
    this.pending.set(key, job);
    try {
      return await job;
    } finally {
      this.pending.delete(key);
    }
  }
}
