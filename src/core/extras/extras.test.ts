import { describe, expect, it } from 'vitest';
import { priceNote } from './priceNote';
import { advise } from './advice';
import { modTiers } from './tiers';
import { recordPrice, emptyHistory, trend, sessionSummary, historyKey } from './history';
import { discordPayload } from './discord';
import { itemToText } from './poeprices';
import { toCsv } from './csv';
import { isDiscordWebhook, upgradeProfile } from '../config';
import type { PoeItem, PriceEstimate, PricedItem, Profile } from '../../shared/types';
import { FALLBACK_DIVINE_CHAOS, notifyThresholdChaos, shouldNotifyItem, shouldNotifyUpgrade } from './notifyPolicy';

const base: PoeItem = { id: 'x', name: '', typeLine: 'Iron Gauntlets', baseType: 'Iron Gauntlets', icon: '', ilvl: 70, frameType: 2 };
const est = (chaos: number | null): PriceEstimate => ({ itemId: 'x', source: chaos ? 'trade' : 'none', chaos, low: chaos, high: chaos, confidence: 'medium', sampleSize: 5, note: 'n' });
const priced = (item: PoeItem, chaos: number | null, firstSeen = new Date().toISOString()): PricedItem => ({ item, price: est(chaos), firstSeen });

describe('priceNote', () => {
  it('rounds chaos to nice steps', () => {
    expect(priceNote(3.4, 180)).toBe('~b/o 3 chaos');
    expect(priceNote(47, 180)).toBe('~b/o 45 chaos');
    expect(priceNote(133, 180)).toBe('~b/o 130 chaos');
  });
  it('switches to divine near one divine', () => {
    expect(priceNote(270, 180)).toBe('~b/o 1.5 divine');
    expect(priceNote(2000, 180)).toBe('~b/o 11 divine');
  });
  it('no note without a price', () => {
    expect(priceNote(null, 180)).toBeNull();
  });
});

describe('advice', () => {
  it('sell valuable items', () => {
    expect(advise(base, est(50)).action).toBe('sell');
  });
  it('vendor recipes', () => {
    const six = { ...base, sockets: Array.from({ length: 6 }, (_, i) => ({ group: 0, sColour: ['R', 'G', 'B'][i % 3] })) };
    expect(advise(six, est(null)).label).toBe('Vendor: 6-link');
    const rgb = { ...base, sockets: [{ group: 0, sColour: 'R' }, { group: 0, sColour: 'G' }, { group: 0, sColour: 'B' }] };
    expect(advise(rgb, est(null)).label).toBe('Vendor: R-G-B');
    expect(advise({ ...base, identified: false, ilvl: 78 }, est(null)).label).toBe('Recipe: Regal');
  });
  it('craft candidates: fractured, high ilvl, top tier mod', () => {
    const item: PoeItem = {
      ...base, ilvl: 85, fractured: true, explicitMods: ['+90 to maximum Life'],
      extended: { mods: { explicit: [{ name: 'Rapturous', tier: 'P1' }] }, hashes: { explicit: [['h', [0]]] } },
    };
    expect(advise(item, est(null)).action).toBe('craft');
  });
  it('junk goes to the vendor', () => {
    expect(advise(base, est(null)).action).toBe('vendor');
  });
});

describe('tiers', () => {
  it('maps mod lines to tiers', () => {
    const item: PoeItem = {
      ...base, explicitMods: ['a', 'b', 'c'],
      extended: { mods: { explicit: [{ name: 'x', tier: 'S3' }, { name: 'y', tier: 'P1' }] }, hashes: { explicit: [['1', [1]], ['2', [0]], ['3', null]] } },
    };
    expect(modTiers(item)).toEqual([1, 3, null]);
  });
});

describe('history and session', () => {
  it('records unit prices per kind and computes trend', () => {
    const store = emptyHistory();
    const div: PoeItem = { ...base, frameType: 5, typeLine: 'Divine Orb', stackSize: 2 };
    recordPrice(store, priced(div, 300), '2026-11-19T00:00:00Z');
    const pts = recordPrice(store, priced(div, 360), '2026-11-20T00:00:00Z');
    expect(pts.map((p) => p.chaos)).toEqual([150, 180]);
    expect(trend(pts)).toBe(20);
    expect(historyKey(priced(div, 1))).toBe('currency:Divine Orb');
  });

  it('session summary counts only items since the start', () => {
    const start = '2026-11-20T10:00:00Z';
    const now = Date.parse('2026-11-20T12:00:00Z');
    const s = sessionSummary([
      priced({ ...base, name: 'Old' }, 1000, '2026-11-20T09:00:00Z'),
      priced({ ...base, name: 'A' }, 100, '2026-11-20T10:30:00Z'),
      priced({ ...base, name: 'B' }, 300, '2026-11-20T11:30:00Z'),
    ], start, now);
    expect(s).toMatchObject({ itemCount: 2, totalChaos: 400, chaosPerHour: 200, best: { name: 'B', chaos: 300 } });
  });
});

describe('discord, poeprices, csv, settings', () => {
  it('builds a discord embed with the note', () => {
    const p = discordPayload(priced({ ...base, name: 'Doom Stride' }, 270), 'Covens', 180);
    expect(p.embeds[0].title).toContain('Doom Stride');
    expect(p.embeds[0].fields.some((f) => f.value.includes('~b/o 1.5 divine'))).toBe(true);
  });

  it('validates discord webhooks', () => {
    expect(isDiscordWebhook('https://discord.com/api/webhooks/123/abc-DEF')).toBe(true);
    expect(isDiscordWebhook('https://evil.example/api/webhooks/1/a')).toBe(false);
  });

  it('rebuilds clipboard text for poeprices', () => {
    const t = itemToText({ ...base, name: 'Doom Stride', typeLine: 'Two-Toned Boots', ilvl: 84, implicitMods: ['+10% to Cold Resistance'], explicitMods: ['+80 to maximum Life'] });
    expect(t).toContain('Rarity: Rare\nDoom Stride\nTwo-Toned Boots');
    expect(t).toContain('Item Level: 84');
    expect(t).toContain('+10% to Cold Resistance (implicit)');
  });

  it('writes Excel-friendly CSV', () => {
    const csv = toCsv([priced({ ...base, name: 'Doom; Stride' }, 12.5)], 180);
    expect(csv.startsWith('﻿Data;Nazwa')).toBe(true);
    expect(csv).toContain('"Doom; Stride"');
    expect(csv).toContain(';12,5;');
  });

  it('upgrades old profiles with new fields', () => {
    const p = upgradeProfile({ id: 'a', name: 'Old', accountName: 'Exile#1234' });
    expect(p.discordWebhook).toBe('');
    expect(p.usePoeprices).toBe(false);
    expect(p.accountName).toBe('Exile#1234');
  });
});

describe('notification settings', () => {
  const prefs = { notifyMode: 'valuable' as const, notifyMinChaos: 10, notifyUnit: 'chaos' as const };

  it('off silences items and upgrades', () => {
    const off = { ...prefs, notifyMode: 'off' as const };
    expect(shouldNotifyItem(off, 9999, 200)).toBe(false);
    expect(shouldNotifyUpgrade(off)).toBe(false);
  });

  it('valuable uses the threshold in chaos', () => {
    expect(shouldNotifyItem(prefs, 9, 200)).toBe(false);
    expect(shouldNotifyItem(prefs, 10, 200)).toBe(true);
    expect(shouldNotifyItem(prefs, null, 200)).toBe(false);
    expect(shouldNotifyUpgrade(prefs)).toBe(true);
  });

  it('valuable converts a divine threshold with the current rate', () => {
    const div = { ...prefs, notifyMinChaos: 1, notifyUnit: 'divine' as const };
    expect(notifyThresholdChaos(div, 200)).toBe(200);
    expect(shouldNotifyItem(div, 199, 200)).toBe(false);
    expect(shouldNotifyItem(div, 200, 200)).toBe(true);
    expect(notifyThresholdChaos(div, null)).toBe(FALLBACK_DIVINE_CHAOS);
  });

  it('all notifies about everything', () => {
    expect(shouldNotifyItem({ ...prefs, notifyMode: 'all' }, 0, null)).toBe(true);
  });

  it('old profiles keep notifying about valuable items', () => {
    const p = upgradeProfile({ notifyMinChaos: 25 } as Partial<Profile>);
    expect(p.notifyMode).toBe('valuable');
    expect(p.notifyUnit).toBe('chaos');
    expect(p.notifyMinChaos).toBe(25);
  });
});
