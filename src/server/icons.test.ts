import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { allowedIconUrl, IconCache } from './icons';
import { imageFileName } from '../renderer/stashImage';

describe('icon cache', () => {
  it('only allows GGG image servers', () => {
    expect(allowedIconUrl('https://web.poecdn.com/gen/image/abc/Item.png')).not.toBeNull();
    expect(allowedIconUrl('http://web.poecdn.com/x.png')).toBeNull();
    expect(allowedIconUrl('https://evil.example/x.png')).toBeNull();
    expect(allowedIconUrl('https://web.poecdn.com.evil.example/x.png')).toBeNull();
    expect(allowedIconUrl('file:///etc/passwd')).toBeNull();
    expect(allowedIconUrl('nonsense')).toBeNull();
  });

  it('fetches an icon once and then serves it from disk', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
    let calls = 0;
    const fake = async () => { calls++; return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }); };
    const cache = new IconCache(dir, fake as any);
    const url = 'https://web.poecdn.com/gen/image/a/b.png';
    const [a, b] = await Promise.all([cache.get(url), cache.get(url)]);
    expect(a.body.length).toBe(4);
    expect(b.type).toBe('image/png');
    await cache.get(url);
    expect(calls).toBe(1);
    await expect(cache.get('https://evil.example/x.png')).rejects.toThrow();
  });

  it('refuses answers that are not images', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
    const cache = new IconCache(dir, (async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as any);
    await expect(cache.get('https://web.poecdn.com/x.png')).rejects.toThrow('to nie jest obraz');
  });

  it('names the saved picture after the tab and time', () => {
    expect(imageFileName('Waluta / 1', new Date(2026, 10, 20, 19, 5))).toBe('skrzynia-Waluta_1-2026-11-20-1905.png');
  });
});
