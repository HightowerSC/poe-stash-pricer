// Demo data so the UI can be tried without a PoE account or network access.

import type { PricedItem } from '../shared/types';

const ICON = 'https://web.poecdn.com/image/Art/2DItems/';

export function sampleItems(): PricedItem[] {
  const now = Date.now();
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  return [
    {
      firstSeen: at(2),
      item: { id: 's1', name: '', typeLine: 'Divine Orb', baseType: 'Divine Orb', icon: `${ICON}Currency/CurrencyModValues.png`, ilvl: 0, frameType: 5, stackSize: 3 },
      price: { itemId: 's1', source: 'poe.ninja', chaos: 540, low: 486, high: 594, confidence: 'high', sampleSize: 512, note: '3 × 180c (Currency)' },
    },
    {
      firstSeen: at(5),
      item: {
        id: 's2', name: 'Doom Stride', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots', icon: `${ICON}Armours/Boots/TwoTonedBoots.png`, ilvl: 84, frameType: 2,
        implicitMods: ['+12% to Fire and Cold Resistances'],
        explicitMods: ['+82 to maximum Life', '30% increased Movement Speed', '+41% to Cold Resistance', '+38% to Lightning Resistance', '+46 to Accuracy Rating'],
      },
      price: {
        itemId: 's2', source: 'trade', chaos: 95, low: 80, high: 110, confidence: 'medium', sampleSize: 7, note: '7 ofert (odrzucono 1 podejrzanie tanich); wymagane mody: 4',
        comparables: [
          { chaos: 80, originalAmount: 80, originalCurrency: 'chaos', similarity: 0.88 },
          { chaos: 90, originalAmount: 0.5, originalCurrency: 'divine', similarity: 1 },
          { chaos: 99, originalAmount: 0.55, originalCurrency: 'divine', similarity: 0.75 },
          { chaos: 110, originalAmount: 110, originalCurrency: 'chaos', similarity: 1 },
        ],
        tradeUrl: 'https://www.pathofexile.com/trade/search/Covens',
      },
    },
    {
      firstSeen: at(11),
      item: { id: 's3', name: 'Headhunter', typeLine: 'Leather Belt', baseType: 'Leather Belt', icon: `${ICON}Belts/Headhunter.png`, ilvl: 86, frameType: 3,
        explicitMods: ['+52 to Strength', '+55 to Dexterity', '+60 to maximum Life', '28% increased Damage with Hits against Rare monsters', 'When you Kill a Rare Monster, you gain its Modifiers for 60 seconds'] },
      price: { itemId: 's3', source: 'poe.ninja', chaos: 9000, low: 8100, high: 9900, confidence: 'high', sampleSize: 41, note: 'UniqueAccessory' },
    },
    {
      firstSeen: at(14),
      item: { id: 's4', name: '', typeLine: 'Empower Support', baseType: 'Empower Support', icon: `${ICON}Gems/Support/Empower.png`, ilvl: 0, frameType: 4,
        properties: [{ name: 'Level', values: [['4', 0]] }] },
      price: { itemId: 's4', source: 'poe.ninja', chaos: 300, low: 270, high: 330, confidence: 'high', sampleSize: 30, note: 'SkillGem' },
    },
    {
      firstSeen: at(20),
      item: { id: 's5', name: 'Gloom Grip', typeLine: 'Iron Gauntlets', baseType: 'Iron Gauntlets', icon: `${ICON}Armours/Gloves/IronGauntlets.png`, ilvl: 45, frameType: 2,
        explicitMods: ['+12 to Strength', '+8 to Accuracy Rating', '5% increased Stun Duration on Enemies'] },
      price: { itemId: 's5', source: 'none', chaos: null, low: null, high: null, confidence: 'medium', sampleSize: 0, note: 'Brak wartościowych modów – raczej do sprzedania u NPC' },
    },
  ];
}
