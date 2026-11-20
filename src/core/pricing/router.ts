// Decides where an item's price comes from.

import type { PoeItem } from '../../shared/types';

export type Route = 'ninja' | 'trade' | 'ninja-then-trade' | 'skip';

export function routeItem(item: PoeItem): Route {
  switch (item.frameType) {
    case 5: // currency and other stackables
    case 6: // divination cards
      return 'ninja';
    case 3: // unique
    case 9: // relic
    case 4: // gem
      return 'ninja-then-trade';
    case 2: // rare
      return item.identified === false ? 'ninja-then-trade' : 'trade';
    case 1: // magic
    case 0: // normal: maps, fragments, valuable bases (ninja BaseType), otherwise vendor
      return 'ninja-then-trade';
    default:
      return 'ninja-then-trade';
  }
}
