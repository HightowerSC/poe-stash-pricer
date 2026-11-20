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
  /** Items worth less than this (in chaos) are marked as cheap in the list. 0 = off. */
  minValueChaos: number;
  /** Hide items below minValueChaos instead of only dimming them. */
  hideBelowMin: boolean;
  displayCurrency: 'chaos' | 'divine';
  /** Seconds between checks for new items. Never below 120. */
  pollSeconds: number;
  /** Optional Discord webhook for notifications about valuable drops. */
  discordWebhook: string;
  /** Ask poeprices.info for a second opinion on rares. */
  usePoeprices: boolean;
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
  /** Size in stash cells. */
  w?: number;
  h?: number;
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
  fractured?: boolean;
  synthesised?: boolean;
  duplicated?: boolean;
  /** GGG "extended" block from trade results, e.g. { category: 'jewels', subcategories: ['abyss'] }. */
  extended?: {
    category?: string;
    subcategories?: string[];
    /** Trade results only: mod details (name, tier like "P1"/"S3") and which mod lines they produced. */
    mods?: Record<string, { name: string; tier: string; level?: number }[]>;
    hashes?: Record<string, [string, number[] | null][]>;
  };
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
  /** poe.ninja 7-day change in percent, when known. */
  change7d?: number;
  /** Second opinion from poeprices.info (rares only). */
  poeprices?: { min: number; max: number; currency: string; chaos: number; confidence: number } | null;
}

export type AdviceAction = 'sell' | 'keep' | 'craft' | 'recipe' | 'vendor' | 'check';

export interface Advice {
  action: AdviceAction;
  label: string;
  reason: string;
}

export interface PricePoint { t: string; chaos: number }

export interface SessionSummary {
  startedAt: string;
  itemCount: number;
  totalChaos: number;
  chaosPerHour: number;
  best: { name: string; chaos: number } | null;
}

/** Where the item lies: public stash tab name and top-left cell (0-based, as the trade site reports it). */
export interface ItemLocation {
  tab: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PricedItem {
  item: PoeItem;
  price: PriceEstimate;
  firstSeen: string;
  location?: ItemLocation;
  /** False once the item no longer shows up in the public tabs (sold, moved out, tab made private). */
  present?: boolean;
  advice?: Advice;
  /** Our own price snapshots for this kind of item (same name/base), oldest first. */
  history?: PricePoint[];
}
