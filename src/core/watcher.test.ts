import { describe, expect, it } from 'vitest';
import { StashWatcher } from './watcher';
import { PublicTabsSource, SessionTabsSource } from './stashSource';
import { newProfile } from './config';
import type { PricedItem } from '../shared/types';

function setup(ids: string[], tabOf: (id: string) => string, watchedTab = '') {
  const trade: any = {
    searchAccountItems: async () => ({ id: 'q', result: ids, total: ids.length }),
    fetch: async (batch: string[]) => batch.map((id) => ({
      id, item: { id, name: '', typeLine: `Item ${id}`, baseType: '', icon: '', ilvl: 1, frameType: 5 }, listing: { stash: { name: tabOf(id) } },
    })),
  };
  const engine: any = {
    refreshPrices: async () => 0,
    price: async (item: any) => ({ itemId: item.id, source: 'poe.ninja', chaos: 1, low: 1, high: 1, confidence: 'high', sampleSize: 1, note: '' }),
  };
  const got: PricedItem[] = [];
  const statuses: string[] = [];
  const profile = newProfile({ accountName: 'Exile#1234', watchedTab });
  const w = new StashWatcher(profile, 'Covens', new PublicTabsSource(profile, 'Covens', trade), engine, {
    onItems: (i) => got.push(...i),
    onStatus: (s) => statuses.push(s),
    onError: (s) => statuses.push(`ERR ${s}`),
  });
  return { w, got, statuses };
}

describe('StashWatcher', () => {
  it('prices items already in the public tab on the first check', async () => {
    const { w, got } = setup(['a', 'b', 'c'], () => 'Inbox');
    await w.tick();
    w.stop();
    expect(got.map((g) => g.item.id)).toEqual(['a', 'b', 'c']);
  });

  it('prices in batches and continues on the next check', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `i${i}`);
    const { w, got } = setup(ids, () => 'Inbox');
    await w.tick();
    expect(got).toHaveLength(20);
    await w.tick();
    w.stop();
    expect(got).toHaveLength(30);
  });

  it('explains when nothing is public', async () => {
    const { w, statuses } = setup([], () => '');
    await w.tick();
    w.stop();
    expect(statuses.at(-1)).toContain('Public');
  });

  it('skips other tabs and says which tabs it saw', async () => {
    const { w, got, statuses } = setup(['a', 'b'], (id) => (id === 'a' ? 'Inbox' : 'Sprzedaż'), 'inbox');
    await w.tick();
    w.stop();
    expect(got.map((g) => g.item.id)).toEqual(['a']);
    expect(statuses.at(-1)).toContain('„Sprzedaż”');
  });

  it('does not hide skipped items for good: a later run with all tabs prices them', async () => {
    const first = setup(['a', 'b'], (id) => (id === 'a' ? 'Inbox' : 'Sprzedaż'), 'inbox');
    await first.w.tick();
    first.w.stop();
    expect(first.w.seenIds).toEqual(['a']);
    const second = setup(['a', 'b'], (id) => (id === 'a' ? 'Inbox' : 'Sprzedaż'));
    await second.w.tick();
    second.w.stop();
    expect(second.got.map((g) => g.item.id)).toEqual(['a', 'b']);
  });

  it('accepts several tabs separated by commas', async () => {
    const { w, got } = setup(['a', 'b', 'c'], (id) => ({ a: 'Inbox', b: 'Sprzedaż', c: 'Inne' } as Record<string, string>)[id], 'inbox, sprzedaż');
    await w.tick();
    w.stop();
    expect(got.map((g) => g.item.id)).toEqual(['a', 'b']);
  });

  it('reads all tabs (also private) through the stash API with positions', async () => {
    const calls: number[] = [];
    const trade: any = {
      stashTab: async (_l: string, _a: string, _r: string, i: number) => {
        calls.push(i);
        const items = i === 0
          ? [{ id: 'x', name: '', typeLine: 'Chaos Orb', baseType: 'Chaos Orb', icon: '', ilvl: 0, frameType: 5, x: 3, y: 4, w: 1, h: 1 }]
          : [{ id: 'y', name: '', typeLine: 'Ruby Ring', baseType: 'Ruby Ring', icon: '', ilvl: 80, frameType: 0, x: 0, y: 0, w: 1, h: 1 }];
        return { numTabs: 2, tabs: [{ n: 'Prywatna', i: 0, type: 'NormalStash' }, { n: 'Druga', i: 1, type: 'QuadStash' }], items };
      },
    };
    const profile = newProfile({ accountName: 'Exile#1234', stashSource: 'session', poesessid: 'a'.repeat(32) });
    const scan = await new SessionTabsSource(profile, 'Covens', trade, 0).scan();
    expect(calls).toEqual([0, 1]);
    expect(scan.ids).toEqual(['x', 'y']);
    expect(scan.tabs).toEqual(['Prywatna', 'Druga']);
    const [x] = await scan.load(['x']);
    expect(x.location).toEqual({ tab: 'Prywatna', x: 3, y: 4, w: 1, h: 1 });
  });

  it('adds a hint about other leagues when nothing is visible', async () => {
    const profile = newProfile({ accountName: 'Exile#1234' });
    const trade: any = { searchAccountItems: async () => ({ id: 'q', result: [], total: 0 }), fetch: async () => [] };
    const statuses: string[] = [];
    const w = new StashWatcher(profile, 'Covens', new PublicTabsSource(profile, 'Covens', trade), { refreshPrices: async () => 0, price: async () => ({}) as any }, {
      onItems: () => {}, onStatus: (s) => statuses.push(s), onError: (s) => statuses.push(s),
      onEmpty: async () => 'Twoje publiczne przedmioty widać w innej lidze: Standard (12)',
    });
    await w.tick();
    w.stop();
    expect(statuses.at(-1)).toContain('Standard (12)');
  });
});
