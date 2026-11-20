import { describe, expect, it } from 'vitest';
import { isSkipped } from './skip';
import { newProfile } from '../config';
import type { PoeItem } from '../../shared/types';

const item = (frameType: number, name = '', baseType = 'Leather Belt'): PoeItem => ({ id: 'x', name, typeLine: baseType, baseType, icon: '', ilvl: 1, frameType });

describe('isSkipped', () => {
  it('is off by default (old settings files too)', () => {
    const p = newProfile({});
    expect(p.skipCurrency).toBe(false);
    expect(p.skipUniques).toBe(false);
    expect(isSkipped(item(5, '', 'Chaos Orb'), p)).toBe(false);
    expect(isSkipped(item(3, 'Headhunter'), p)).toBe(false);
  });

  it('skips only the chosen kinds', () => {
    const cur = { skipCurrency: true, skipUniques: false };
    expect(isSkipped(item(5, '', 'Divine Orb'), cur)).toBe(true);
    expect(isSkipped(item(3, 'Headhunter'), cur)).toBe(false);
    const uni = { skipCurrency: false, skipUniques: true };
    expect(isSkipped(item(3, 'Headhunter'), uni)).toBe(true);
    expect(isSkipped(item(3, 'Lethal Pride', 'Timeless Jewel'), uni)).toBe(true);
    expect(isSkipped(item(9, 'Relic'), uni)).toBe(true);
    expect(isSkipped(item(5, '', 'Divine Orb'), uni)).toBe(false);
    expect(isSkipped(item(2, 'Doom Coil'), { skipCurrency: true, skipUniques: true })).toBe(false);
  });
});
