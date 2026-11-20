import { describe, expect, it } from 'vitest';
import { gridSize, positionLabel, tabLayouts, tabTypeLabel } from './stashLayout';
import { hexColour } from './stashSource';
import { listingLocation, normalizeItem } from './normalize';
import type { PricedItem } from '../shared/types';

const loc = (x: number, y: number, w = 1, h = 1) => ({ tab: 'T', x, y, w, h });

describe('stash layout', () => {
  it('detects normal, quad and special tabs', () => {
    expect(gridSize([loc(0, 0), loc(11, 11)])).toBe(12);
    expect(gridSize([loc(0, 0), loc(20, 22, 2, 2)])).toBe(24);
    expect(gridSize([loc(0, 0), loc(0, 0)])).toBeNull();
    expect(gridSize([loc(40, 0)])).toBeNull();
  });

  it('groups items by tab, skips items that left the tab', () => {
    const p = (id: string, tab: string, chaos: number, present = true): PricedItem => ({
      item: { id, name: '', typeLine: id, baseType: id, icon: '', ilvl: 1, frameType: 5 },
      price: { itemId: id, source: 'poe.ninja', chaos, low: chaos, high: chaos, confidence: 'high', sampleSize: 1, note: '' },
      firstSeen: '', location: { tab, x: 0, y: Number(id.slice(1)), w: 1, h: 1 }, present,
    });
    const tabs = tabLayouts([p('a1', 'B', 10), p('a2', 'A', 5), p('a3', 'A', 7), p('a4', 'A', 100, false)]);
    expect(tabs.map((t) => [t.tab, t.items.length, t.totalChaos])).toEqual([['A', 2, 12], ['B', 1, 10]]);
  });

  it('reads the location from a trade listing', () => {
    const item = normalizeItem({ id: 'x', typeLine: 'Boots', w: 2, h: 2 });
    expect(listingLocation({ listing: { stash: { name: 'Inbox', x: 3, y: 4 } } }, item)).toEqual({ tab: 'Inbox', x: 3, y: 4, w: 2, h: 2 });
    expect(listingLocation({ listing: {} }, item)).toBeUndefined();
  });

  it('describes the position in player terms', () => {
    expect(positionLabel({ tab: 'Inbox', x: 2, y: 4, w: 1, h: 1 })).toBe('Zakładka „Inbox”, kolumna 3, rząd 5');
  });
});

describe('stash picture', () => {
  const item = (id: string, x: number, y: number, extra: Partial<import('../shared/types').ItemLocation> = {}, w = 1, h = 1): PricedItem => ({
    item: { id, name: '', typeLine: id, baseType: id, icon: '', ilvl: 1, frameType: 5 },
    price: { itemId: id, source: 'poe.ninja', chaos: 1, low: 1, high: 1, confidence: 'high', sampleSize: 1, note: '' },
    firstSeen: '', location: { tab: extra.tab ?? 'T', x, y, w, h, ...extra },
  });

  it('uses the tab type from the stash API and keeps the game order', () => {
    const tabs = tabLayouts([
      item('a', 0, 0, { tab: 'Waluta', tabType: 'CurrencyStash', tabIndex: 0, tabColor: '#ff0000' }),
      item('b', 1, 0, { tab: 'Waluta', tabType: 'CurrencyStash', tabIndex: 0 }),
      item('c', 0, 0, { tab: 'Quad', tabType: 'QuadStash', tabIndex: 2 }),
      item('d', 3, 3, { tab: 'Zwykła', tabType: 'PremiumStash', tabIndex: 1 }),
    ]);
    expect(tabs.map((t) => [t.tab, t.grid, t.type, t.color])).toEqual([
      ['Waluta', null, 'CurrencyStash', '#ff0000'],
      ['Zwykła', 12, 'PremiumStash', undefined],
      ['Quad', 24, 'QuadStash', undefined],
    ]);
    expect(tabTypeLabel('CurrencyStash', null)).toBe('Zakładka waluty');
    expect(tabTypeLabel(undefined, 24)).toBe('Zakładka quad (24×24)');
  });

  it('falls back to tiles when items do not fit the grid of the tab type', () => {
    const [t] = tabLayouts([item('a', 13, 0, { tabType: 'PremiumStash', tabIndex: 0 })]);
    expect(t.grid).toBeNull();
  });

  it('turns the GGG tab colour into hex', () => {
    expect(hexColour({ r: 255, g: 16, b: 0 })).toBe('#ff1000');
    expect(hexColour(undefined)).toBeUndefined();
  });
});
