import { describe, expect, it } from 'vitest';
import { StashWatcher } from './watcher';
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
  const w = new StashWatcher(newProfile({ accountName: 'Exile#1234', watchedTab }), 'Covens', trade, engine, {
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
});
