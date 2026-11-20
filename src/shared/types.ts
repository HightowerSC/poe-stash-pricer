// Types shared by the Electron main process, the core logic and the UI.

export type Realm = 'pc' | 'xbox' | 'sony';

/** One user's settings. Nothing personal is hardcoded; everything comes from the setup wizard. */
export interface Profile {
  id: string;
  name: string;
  realm: Realm;
  /** Account name with discriminator, e.g. "Exile#1234". */
  accountName: string;
  /** A league id such as "Standard", or "auto" for the current challenge league. */
  league: string;
  /** Used only when league is "auto". */
  hardcore: boolean;
  /** Name of the public stash tab that acts as the inbox. Empty = all public tabs. */
  watchedTab: string;
  /** Minimum value (in chaos) for a notification. */
  notifyMinChaos: number;
  displayCurrency: 'chaos' | 'divine';
  /** Seconds between checks for new items. Never below 120. */
  pollSeconds: number;
}

export interface AppSettings {
  activeProfileId: string | null;
  profiles: Profile[];
}

export interface League {
  id: string;
  name: string;
  hardcore: boolean;
  /** True for the current challenge league(s). */
  current: boolean;
}

/** Subset of the GGG item JSON (same shape for the trade API and the stash API). */
export interface PoeItem {
  id: string;
  name: string;
  typeLine: string;
  baseType: string;
  icon: string;
  ilvl: number;
  /** 0 normal, 1 magic, 2 rare, 3 unique, 4 gem, 5 currency, 6 divination card, 8 prophecy/other, 9 foil/relic */
  frameType: number;
  stackSize?: number;
  corrupted?: boolean;
  identified?: boolean;
  sockets?: { group: number; sColour: string }[];
  properties?: { name: string; values: [string, number][] }[];
  implicitMods?: string[];
  explicitMods?: string[];
  craftedMods?: string[];
  fracturedMods?: string[];
  enchantMods?: string[];
  influences?: Record<string, boolean>;
}

export type PriceSource = 'poe.ninja' | 'trade' | 'none';
export type Confidence = 'high' | 'medium' | 'low';

export interface ComparableListing {
  chaos: number;
  originalAmount: number;
  originalCurrency: string;
  similarity: number; // 0..1
  indexedAt?: string;
}

export interface PriceEstimate {
  itemId: string;
  source: PriceSource;
  /** Suggested price in chaos. */
  chaos: number | null;
  low: number | null;
  high: number | null;
  confidence: Confidence;
  /** How many listings/rows were behind the estimate. */
  sampleSize: number;
  note: string;
  comparables?: ComparableListing[];
  tradeUrl?: string;
}

export interface PricedItem {
  item: PoeItem;
  price: PriceEstimate;
  firstSeen: string;
}
