import type { PoeItem } from '../shared/types';

export function formatPrice(chaos: number | null, currency: 'chaos' | 'divine', divine: number | null): string {
  if (chaos == null) return '—';
  if ((currency === 'divine' || chaos >= (divine ?? Infinity)) && divine) {
    return `${(chaos / divine).toFixed(chaos / divine >= 10 ? 0 : 1)} div`;
  }
  return `${chaos >= 10 ? Math.round(chaos) : chaos.toFixed(1)}c`;
}

export const RARITY = ['normal', 'magic', 'rare', 'unique', 'gem', 'currency', 'card', 'quest', 'other', 'relic'];

export function rarityClass(item: PoeItem): string {
  return `r-${RARITY[item.frameType] ?? 'normal'}`;
}

export function displayName(item: PoeItem): { title: string; subtitle: string } {
  if (item.name) return { title: item.name, subtitle: item.typeLine };
  const prefix = item.stackSize && item.stackSize > 1 ? `${item.stackSize}× ` : '';
  return { title: prefix + item.typeLine, subtitle: '' };
}

export const CONFIDENCE_LABEL = { high: 'Wysoka pewność', medium: 'Średnia pewność', low: 'Niska pewność' } as const;
