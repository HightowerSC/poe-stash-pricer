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
  /**
   * Which notifications the app sends (system pop-up, Discord, upgrade watch):
   * 'off' = none, 'valuable' = only items worth at least the threshold, 'all' = every newly priced item.
   */
  notifyMode: 'off' | 'valuable' | 'all';
  /** Notification threshold, in the unit below (the field name is kept for old settings files). */
  notifyMinChaos: number;
  /** Unit of the notification threshold. */
  notifyUnit: 'chaos' | 'divine';
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
  /**
   * How hard the app may use the trade site: 'saver' (default) = few requests (max 2 searches per item,
   * long cache, half of GGG's limits, stash read every 10 min); 'normal' = faster and more precise.
   */
  tradeMode: 'saver' | 'normal';
  /**
   * Where the user's items come from (the trade site is used only to compare with other players' offers):
   * 'session' = the whole stash straight from GGG's stash API with the user's POESESSID,
   * 'none' = no stash scanning, only items copied in game with Ctrl+C.
   */
  stashSource: 'session' | 'none';
  /** POESESSID cookie, kept only in the local settings file and sent only to pathofexile.com. */
  poesessid: string;
  /** Re-price items older than this many hours automatically. 0 = off. */
  repriceHours: number;
  /** Do not price currency (orbs, essences, fossils…) from the stash – saves trade/poe.ninja requests. Ctrl+C still prices them. */
  skipCurrency: boolean;
  /** Do not price unique items from the stash. Ctrl+C still prices them. */
  skipUniques: boolean;
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
  /** Ready "@seller Hi, I would like to buy…" message from the trade site (copied, never sent by the app). */
  whisper?: string;
  seller?: string;
  /** Why this listing was not used for the price (price-fixing / bait / one seller flooding). */
  suspicious?: string;
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
  /** Special mods that can raise the value a lot (e.g. valuable corrupted implicits). */
  specialMods?: string[];
  /** The price ignores some special mod or variant, so the real value may be higher. */
  lowerBound?: boolean;
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
  /** Stash API only: tab type (NormalStash, PremiumStash, QuadStash, CurrencyStash…), position of the tab and its colour (#rrggbb). */
  tabType?: string;
  tabIndex?: number;
  tabColor?: string;
}

export interface PricedItem {
  item: PoeItem;
  price: PriceEstimate;
  firstSeen: string;
  location?: ItemLocation;
  /** False once the item no longer shows up in the public tabs (sold, moved out, tab made private). */
  present?: boolean;
  advice?: Advice;
  /** When the price was last computed (first pricing or a re-price). */
  pricedAt?: string;
  /** Our own price snapshots for this kind of item (same name/base), oldest first. */
  history?: PricePoint[];
}

/** Doradca craftu: one way to add a mod to an item. */
export interface CraftOption {
  method: 'bench' | 'essence' | 'aug' | 'regal' | 'exalted';
  label: string;
  /** The added mod line (bench crafts only). */
  line?: string;
  affix?: 'prefix' | 'suffix';
  /** Cost in trade currency codes (chaos, divine, exalted, aug, regal) or an item name priced by poe.ninja (essences). */
  cost: { amount: number; currency: string };
  /** true = the result is known (bench), false = random (orbs). */
  deterministic: boolean;
}

export interface CraftSuggestion {
  option: CraftOption;
  /** Estimated price after the craft (bench crafts only). */
  priceAfter: number | null;
  costChaos: number | null;
  /** priceAfter − current price − cost. */
  profit: number | null;
  tradeUrl?: string;
}

export interface CraftReport {
  itemId: string;
  current: number | null;
  prefixes: string;
  suffixes: string;
  suggestions: CraftSuggestion[];
  /** Why there is nothing to suggest. */
  reason?: string;
}

/** One character of the account, from the character list. */
export interface CharacterSummary {
  name: string;
  league: string;
  class: string;
  level: number;
}

export interface CharacterStat {
  label: string;
  value: number;
  /** e.g. "%", shown after the number. */
  unit?: string;
  /** Resistance values are compared against the 75% cap. */
  kind?: 'res' | 'life' | 'defence' | 'offence' | 'attr' | 'other';
}

export interface EquippedItem {
  /** GGG inventoryId: Helm, BodyArmour, Weapon, Offhand, Gloves, Boots, Amulet, Ring, Ring2, Belt, Flask, PassiveJewels. */
  slot: string;
  item: PoeItem;
  /** Gems socketed in the item. */
  gems: PoeItem[];
  price?: PriceEstimate;
}

export interface CharacterView {
  summary: CharacterSummary;
  account: string;
  items: EquippedItem[];
  /** Jewels socketed in the passive tree. */
  jewels: EquippedItem[];
  passives: number;
  masteries: number;
  /** Totals added up from gear and jewels (no tree, auras or flasks). */
  stats: CharacterStat[];
  /** Link to the character on pathofexile.com. */
  profileUrl: string;
}

/** One item priced from text copied in game (Ctrl+C) or pasted into the app. */
export interface PriceCheck {
  at: string;
  item: PoeItem;
  price: PriceEstimate;
  advice?: Advice;
}

/** PoE HUB: trade offers that would upgrade one gear slot. */
export interface UpgradeResult {
  slot: string;
  /** What the search asks for, e.g. "życie 80+", "fire res 40%+". */
  wants: string[];
  total: number;
  offers: { chaos: number | null; amount: number; currency: string; name: string; mods: string[]; whisper?: string }[];
  tradeUrl: string;
}

/** PoE HUB: background upgrade watch settings (saved per user, in the app data folder). */
export interface UpgradeWatchSettings {
  enabled: boolean;
  /** Character name; empty = the one opened last in the Postać tab. */
  character: string;
  /** Report offers up to this price. */
  budgetChaos: number;
  everyMinutes: number;
}

export interface UpgradeWatchFind {
  slot: string;
  name: string;
  chaos: number;
  wants: string[];
  tradeUrl: string;
  at: string;
}

export interface UpgradeWatchState {
  settings: UpgradeWatchSettings;
  running: boolean;
  lastRun: string | null;
  lastError: string | null;
  /** Newest first. */
  finds: UpgradeWatchFind[];
}

/** Currency flipping: market prices for one currency in chaos. */
export interface FlipRow {
  id: string;
  name: string;
  /** What sellers ask (you pay when buying now). */
  ask: number | null;
  /** What buyers pay (you get when selling now). */
  bid: number | null;
  ninja: number | null;
  /** (ask − bid) / bid in %: the flipper's gross margin. */
  marginPct: number | null;
  sellers: number;
  buyers: number;
  whisperBuy?: string;
}

/** One farming session with one strategy. */
export interface FarmRun {
  id: string;
  strategy: string;
  startedAt: string;
  endedAt: string | null;
  maps: number;
  /** Map + scarabs + sextants etc. per map (chaos). */
  costPerMap: number;
  /** Loot not visible as new stash items (e.g. currency added to existing stacks), typed by the player. */
  extraChaos: number;
  lootChaos: number;
  lootCount: number;
  notes: string;
}

export interface FarmStrategySummary {
  strategy: string;
  runs: number;
  maps: number;
  profit: number;
  perMap: number | null;
  perHour: number | null;
}

export interface FarmState {
  active: FarmRun | null;
  /** Loot so far in the active run. */
  live: { chaos: number; count: number } | null;
  runs: FarmRun[];
  strategies: FarmStrategySummary[];
  /** Time of the last stash scan, so the player knows how fresh the numbers are. */
  lastScan: string | null;
}

/** One thing to buy for a Path of Building build. */
export interface ShoppingRow {
  kind: 'unique' | 'rare' | 'gem' | 'other';
  slot: string;
  name: string;
  detail: string;
  chaos: number | null;
  confidence: Confidence;
  /** The opened character already has it. */
  owned: boolean;
  tradeUrl?: string;
  note?: string;
}

export interface ShoppingList {
  className: string;
  ascendancy: string;
  level: number;
  rows: ShoppingRow[];
  total: number;
  /** Total without what the character already owns. */
  toBuy: number;
  at: string;
}
