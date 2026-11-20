import { describe, expect, it } from 'vitest';
import { flipRow, rankFlips } from './flip';
import { parseExchange, toComparables } from '../trade';
import { onePerSeller, summarizeListings } from '../pricing/listings';
import { makeBackup, restoreBackup } from '../extras/backup';
import { newProfile } from '../config';
import type { ComparableListing } from '../../shared/types';

describe('flip', () => {
  it('reads the exchange response', () => {
    const offers = parseExchange({ result: { a: { listing: { account: { name: 'S' }, offers: [{ exchange: { currency: 'chaos', amount: 180 }, item: { currency: 'divine', amount: 1, stock: 10, whisper: '@S hi' } }] } } } });
    expect(offers).toEqual([{ give: 1, take: 180, stock: 10, seller: 'S', whisper: '@S hi' }]);
  });

  it('computes ask, bid and margin', () => {
    const sellers = [178, 182, 183, 184].map((c) => ({ give: 1, take: c, stock: 5 }));
    const buyers = [175, 172, 171, 170].map((c) => ({ give: c, take: 1, stock: 900 }));
    const r = flipRow('divine', 'Divine Orb', sellers, buyers, 180);
    expect(r.ask).toBe(183);
    expect(r.bid).toBe(171);
    expect(r.marginPct).toBeCloseTo(7, 0);
    expect(rankFlips([{ ...r, marginPct: 1 }, r])[0].marginPct).toBe(r.marginPct);
  });
});

describe('whisper and price-fixing', () => {
  it('keeps the whisper and seller', () => {
    const [c] = toComparables([{ listing: { price: { amount: 5, currency: 'chaos' }, whisper: '@X buy', account: { name: 'X' } } }], () => 1);
    expect(c).toMatchObject({ whisper: '@X buy', seller: 'X' });
  });

  it('counts one listing per seller and flags baits', () => {
    const l = (chaos: number, seller?: string): ComparableListing => ({ chaos, originalAmount: chaos, originalCurrency: 'chaos', similarity: 1, seller });
    expect(onePerSeller([l(10, 'A'), l(11, 'A'), l(12, 'B')]).flooded).toHaveLength(1);
    const s = summarizeListings([l(1, 'Bait'), l(40, 'A'), l(41, 'F'), l(41, 'F'), l(41, 'F'), l(45, 'B'), l(50, 'C'), l(55, 'D')]);
    expect(s.suspicious.map((x) => x.seller)).toEqual(['Bait', 'F', 'F']);
    expect(s.used.every((x) => !x.suspicious)).toBe(true);
    expect(s.note).toMatch(/pominięto 3 podejrzanych/);
  });
});

describe('backup', () => {
  const current = { activeProfileId: 'p1', profiles: [newProfile({ id: 'p1', name: 'Mój', accountName: 'Exile#1234', poesessid: 'a'.repeat(32), discordWebhook: 'https://discord.com/api/webhooks/1/x' })] };

  it('leaves secrets out unless asked', () => {
    const b = makeBackup(current, { 'challenges-Covens.json': [], 'items.json': [] }, false);
    expect(b.settings.profiles[0].poesessid).toBe('');
    expect(Object.keys(b.files)).toEqual(['challenges-Covens.json']);
    expect(makeBackup(current, {}, true).settings.profiles[0].poesessid).toBe('a'.repeat(32));
  });

  it('restores and keeps local secrets', () => {
    const b = makeBackup({ ...current, profiles: [{ ...current.profiles[0], name: 'Nowa nazwa' }] }, { 'upgrade-watch.json': {} }, false);
    const r = restoreBackup(JSON.parse(JSON.stringify(b)), current);
    expect(r.settings.profiles[0].name).toBe('Nowa nazwa');
    expect(r.settings.profiles[0].poesessid).toBe('a'.repeat(32));
    expect(Object.keys(r.files)).toEqual(['upgrade-watch.json']);
    expect(() => restoreBackup({ foo: 1 }, current)).toThrow(/kopii zapasowej/);
  });
});
