// Crafting bench options the advisor considers. Values and costs are approximate for PoE 3.30
// (the bench recipe list changes rarely; check the in-game bench before crafting). Costs are in
// trade currency codes so they are converted to chaos with the current poe.ninja rates.

export type Slot = 'boots' | 'gloves' | 'helmet' | 'chest' | 'shield' | 'ring' | 'amulet' | 'belt' | 'weapon' | 'quiver' | 'jewel';

export interface BenchCraft {
  /** Mod line as it appears on the item (also used to find the trade stat). */
  line: string;
  affix: 'prefix' | 'suffix';
  slots: Slot[] | 'any';
  /** Mod lines that block this craft (same mod group already on the item). */
  conflicts: RegExp;
  cost: { amount: number; currency: string };
}

const ARMOUR: Slot[] = ['boots', 'gloves', 'helmet', 'chest', 'shield'];
const JEWELLERY: Slot[] = ['ring', 'amulet', 'belt'];
const GEAR: Slot[] = [...ARMOUR, ...JEWELLERY, 'quiver'];

export const BENCH_CRAFTS: BenchCraft[] = [
  { line: '+55 to maximum Life', affix: 'prefix', slots: GEAR, conflicts: /to maximum Life$/, cost: { amount: 3, currency: 'chaos' } },
  { line: '+30% to Fire Resistance', affix: 'suffix', slots: GEAR, conflicts: /Fire Resistance$/, cost: { amount: 1, currency: 'chaos' } },
  { line: '+30% to Cold Resistance', affix: 'suffix', slots: GEAR, conflicts: /Cold Resistance$/, cost: { amount: 1, currency: 'chaos' } },
  { line: '+30% to Lightning Resistance', affix: 'suffix', slots: GEAR, conflicts: /Lightning Resistance$/, cost: { amount: 1, currency: 'chaos' } },
  { line: '+18% to Fire and Cold Resistances', affix: 'suffix', slots: GEAR, conflicts: /Fire and Cold Resistances$/, cost: { amount: 4, currency: 'chaos' } },
  { line: '+18% to Fire and Lightning Resistances', affix: 'suffix', slots: GEAR, conflicts: /Fire and Lightning Resistances$/, cost: { amount: 4, currency: 'chaos' } },
  { line: '+18% to Cold and Lightning Resistances', affix: 'suffix', slots: GEAR, conflicts: /Cold and Lightning Resistances$/, cost: { amount: 4, currency: 'chaos' } },
  { line: '+18% to Chaos Resistance', affix: 'suffix', slots: GEAR, conflicts: /Chaos Resistance$/, cost: { amount: 1, currency: 'divine' } },
  { line: '+12% to all Elemental Resistances', affix: 'suffix', slots: JEWELLERY, conflicts: /all Elemental Resistances$/, cost: { amount: 1, currency: 'divine' } },
  { line: '+25 to all Attributes', affix: 'suffix', slots: JEWELLERY, conflicts: /to all Attributes$/, cost: { amount: 1, currency: 'divine' } },
  { line: '20% increased Movement Speed', affix: 'prefix', slots: ['boots'], conflicts: /increased Movement Speed$/, cost: { amount: 4, currency: 'chaos' } },
  { line: '12% increased Attack Speed', affix: 'suffix', slots: ['gloves', 'weapon', 'quiver'], conflicts: /increased Attack Speed$/, cost: { amount: 4, currency: 'chaos' } },
  { line: '10% increased Cast Speed', affix: 'suffix', slots: ['amulet', 'weapon'], conflicts: /increased Cast Speed$/, cost: { amount: 4, currency: 'chaos' } },
  { line: '+25% to Global Critical Strike Multiplier', affix: 'suffix', slots: ['amulet', 'weapon', 'quiver'], conflicts: /Critical Strike Multiplier$/, cost: { amount: 1, currency: 'divine' } },
  { line: '+50 to maximum Energy Shield', affix: 'prefix', slots: ['ring', 'amulet', 'belt'], conflicts: /to maximum Energy Shield$/, cost: { amount: 3, currency: 'chaos' } },
  { line: '+8% to Damage over Time Multiplier', affix: 'suffix', slots: ['amulet'], conflicts: /Damage over Time Multiplier$/, cost: { amount: 1, currency: 'divine' } },
  { line: '+35 to maximum Life', affix: 'prefix', slots: ['jewel'], conflicts: /to maximum Life$|increased maximum Life$/, cost: { amount: 1, currency: 'chaos' } },
];

/** Random crafts: shown with their cost only, because the result is not known in advance. */
export const RANDOM_CRAFTS = {
  aug: { label: 'Orb of Augmentation – losowy mod na wolne miejsce (magic)', currency: 'aug' },
  regal: { label: 'Regal Orb – zmienia w rare i dodaje losowy mod', currency: 'regal' },
  exalted: { label: 'Exalted Orb – losowy mod na wolne miejsce (rare)', currency: 'exalted' },
} as const;

export function benchCraftsFor(slot: Slot | null): BenchCraft[] {
  if (!slot) return [];
  return BENCH_CRAFTS.filter((c) => c.slots === 'any' || c.slots.includes(slot));
}
