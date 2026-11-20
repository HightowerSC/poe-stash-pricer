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

import { bulkLots, bulkMessages, priceNote } from './bulk';
import { runLoot, runProfit, summarizeStrategies } from './farm';
import type { FarmRun, PricedItem } from '../../shared/types';

const priced = (typeLine: string, frameType: number, stackSize: number, chaos: number, firstSeen = '2026-11-20T10:00:00Z'): PricedItem => ({
  item: { id: `${typeLine}${Math.random()}`, name: '', typeLine, baseType: typeLine, icon: '', ilvl: 0, frameType, stackSize },
  price: { itemId: '', source: 'ninja', chaos, low: null, high: null, confidence: 'high', sampleSize: 1, note: '' },
  firstSeen,
});

describe('bulk selling', () => {
  const items = [
    priced('Divine Orb', 5, 3, 540), priced('Divine Orb', 5, 2, 360), priced('Chaos Orb', 5, 500, 500),
    priced('Rusted Scarab', 0, 40, 80), priced('Orb of Alteration', 5, 10, 1.5), priced('Vaal Regalia', 2, 1, 50),
  ];

  it('groups stacks by name, applies the discount and skips small lots and chaos', () => {
    const lots = bulkLots(items, { discountPct: 10, minLotChaos: 5, divine: 180 });
    expect(lots.map((l) => l.name)).toEqual(['Divine Orb', 'Rusted Scarab']);
    expect(lots[0]).toMatchObject({ count: 5, unit: 180, ask: 162, total: 810, note: '~price 162 chaos' });
    expect(lots[1].message).toBe('WTS 40x Rusted Scarab 1.8c each (72c all)');
  });

  it('writes price notes and chat lines under the limit', () => {
    expect(priceNote(360, 180)).toBe('~price 2 divine');
    expect(priceNote(0.456, 180)).toBe('~price 0.46 chaos');
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Item number ${i}`, count: 10, unit: 2, ask: 2, total: 20, note: '', message: '' }));
    const lines = bulkMessages(many, 180);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 250)).toBe(true);
  });
});

describe('farm profitability', () => {
  it('counts loot that appeared during the run', () => {
    const items = [priced('A', 5, 1, 10, '2026-11-20T09:00:00Z'), priced('B', 5, 1, 30, '2026-11-20T10:30:00Z'), priced('C', 5, 1, 20, '2026-11-20T11:30:00Z')];
    expect(runLoot(items, '2026-11-20T10:00:00Z', '2026-11-20T11:00:00Z')).toEqual({ chaos: 30, count: 1 });
    expect(runLoot(items, '2026-11-20T10:00:00Z', null).count).toBe(2);
  });

  it('compares strategies per map and per hour', () => {
    const run = (strategy: string, hours: number, maps: number, loot: number, cost: number): FarmRun => ({
      id: strategy + hours, strategy, startedAt: '2026-11-20T10:00:00Z', endedAt: new Date(Date.parse('2026-11-20T10:00:00Z') + hours * 3_600_000).toISOString(),
      maps, costPerMap: cost, extraChaos: 0, lootChaos: loot, lootCount: 0, notes: '',
    });
    expect(runProfit(run('A', 1, 10, 500, 10))).toBe(400);
    const s = summarizeStrategies([run('A', 1, 10, 500, 10), run('B', 1, 10, 900, 20), run('A', 1, 10, 300, 10)]);
    expect(s[0]).toMatchObject({ strategy: 'B', perHour: 700, perMap: 70 });
    expect(s[1]).toMatchObject({ strategy: 'A', runs: 2, maps: 20, profit: 600, perHour: 300 });
  });
});
