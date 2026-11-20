import { describe, expect, it } from 'vitest';
import { worthRepricing } from './service';

const item = (source: 'poe.ninja' | 'trade' | 'none', chaos: number | null, hoursAgo: number) => ({
  item: { id: 'x' } as any,
  price: { itemId: 'x', source, chaos, low: null, high: null, confidence: 'medium' as const, sampleSize: 1, note: '' },
  firstSeen: new Date(0).toISOString(),
  pricedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
});

describe('worthRepricing', () => {
  const saver = { tradeMode: 'saver' as const, minValueChaos: 5 };
  it('always re-prices poe.ninja items (free)', () => expect(worthRepricing(item('poe.ninja', 1, 1), saver)).toBe(true));
  it('skips trade items priced today', () => expect(worthRepricing(item('trade', 100, 2), saver)).toBe(false));
  it('skips cheap or unpriced trade items', () => {
    expect(worthRepricing(item('trade', 3, 48), saver)).toBe(false);
    expect(worthRepricing(item('none', null, 48), saver)).toBe(false);
  });
  it('re-prices old valuable trade items', () => expect(worthRepricing(item('trade', 50, 48), saver)).toBe(true));
  it('normal mode re-prices everything', () => expect(worthRepricing(item('trade', 3, 1), { tradeMode: 'normal', minValueChaos: 5 })).toBe(true));
});
