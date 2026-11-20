// The whole app logic without any UI or Electron: settings, watching, pricing, history, notifications.
// Used by the local web server (browser UI) and by the Electron shell.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppSettings, League, PricedItem, Profile, SessionSummary } from '../shared/types';
import type { SessionState } from '../shared/api';
import { emptySettings, resolveLeague, upgradeProfile } from './config';
import { NinjaClient } from './ninja';
import { TradeClient } from './trade';
import { PricingEngine } from './engine';
import { StashWatcher } from './watcher';
import { SessionTabsSource } from './stashSource';
import { sampleItems } from './sampleItems';
import { demoItems, demoValue } from './demo';
import { advise } from './extras/advice';
import { emptyHistory, recordPrice, recordValue, sessionSummary, type HistoryStore } from './extras/history';
import { discordPayload, sendDiscord } from './extras/discord';
import { toCsv } from './extras/csv';
import { craftReport, demoCraftPricer } from './craft/advisor';
import { modWeight } from './pricing/tradeQuery';
import type { CharacterSummary, CharacterView, CraftReport, EquippedItem, PriceCheck } from '../shared/types';
import { parseItemText } from './itemText';
import { normalizeItem } from './normalize';
import { diagnose, upgradeQuery } from './hub/upgrades';
import type { Challenge } from './hub/challenges';
import type { UpgradeResult, UpgradeWatchSettings, UpgradeWatchState } from '../shared/types';
import { newFinds, normalizeWatch } from './hub/watch';
import { BACKUP_FILE, makeBackup, restoreBackup, type Backup } from './extras/backup';
import { FLIP_CURRENCIES, flipRow, rankFlips } from './market/flip';
import type { FlipRow } from '../shared/types';
import { buildCharacter, demoCharacter, demoCharacters, sortCharacters, toSummary } from './character';

export type ServiceEvent =
  | { type: 'checks'; payload: PriceCheck[] }
  | { type: 'items'; payload: PricedItem[] }
  | { type: 'session'; payload: SessionState }
  | { type: 'status'; payload: { text: string; error?: boolean } }
  | { type: 'notify'; payload: { title: string; body: string } };

const safe = (league: string) => league.replace(/[^\w-]/g, '_');

export class PricerService {
  private watcher: StashWatcher | null = null;
  private trade: TradeClient | null = null;
  private profile: Profile | null = null;
  private repriceTimer: ReturnType<typeof setInterval> | null = null;
  private repricing = false;
  private lastCharacter: CharacterView | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private watchState: UpgradeWatchState | null = null;
  private watchReported = new Set<string>();
  private flips: { at: string | null; rows: FlipRow[]; running: boolean } = { at: null, rows: [], running: false };
  /** Last items priced from Ctrl+C / pasted text, newest first. */
  private checks: PriceCheck[] = [];
  /** Gear of the last opened character, so the craft advisor works on it too. */
  private characterItems: EquippedItem[] = [];
  private engine: PricingEngine | null = null;
  private demo = false;
  private items: PricedItem[] = [];
  private history: HistoryStore = emptyHistory();
  private league = '';
  private divineRate: number | null = null;
  private sessionStart = new Date().toISOString();
  private ninja = new NinjaClient(fetch);
  private listeners = new Set<(e: ServiceEvent) => void>();

  constructor(private readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.scheduleUpgradeWatch();
  }

  on(cb: (e: ServiceEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: ServiceEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private file(name: string) {
    return path.join(this.dataDir, name);
  }

  private readJson<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(name: string, data: unknown) {
    fs.writeFileSync(this.file(name), JSON.stringify(data, null, 2));
  }

  getSettings(): AppSettings {
    const s = this.readJson<AppSettings>('settings.json', emptySettings());
    return { ...s, profiles: s.profiles.map(upgradeProfile) };
  }

  saveSettings(s: AppSettings) {
    this.writeJson('settings.json', { ...s, profiles: s.profiles.map(upgradeProfile) });
  }

  async listLeagues(): Promise<League[]> {
    try {
      return await this.ninja.leagues();
    } catch {
      return [
        { id: 'Standard', name: 'Standard', hardcore: false, current: false },
        { id: 'Hardcore', name: 'Hardcore', hardcore: true, current: false },
      ];
    }
  }

  getItems() {
    return this.items;
  }

  getSession(): SessionState {
    return { summary: this.summary(), value: this.history.value, divineRate: this.divineRate };
  }

  /**
   * Forgets the remembered stash items (prices, positions, "already seen") for the current league or all
   * leagues. Settings, profiles and price history stay. A running watcher starts over and fetches everything again.
   */
  async clearItems(all: boolean): Promise<{ removed: number }> {
    const wasRunning = !!this.watcher && !this.demo;
    this.stop();
    const removed = this.items.length;
    let league = this.league;
    if (!league) {
      try { const p = this.activeProfile(); league = p.league !== 'auto' ? p.league : ''; } catch { /* no profile */ }
    }
    if (!league) all = true; // league not known yet (not started, "auto"): clear everything
    const files = fs.readdirSync(this.dataDir).filter((f) => f.startsWith('items-') && f.endsWith('.json'));
    for (const f of files) {
      if (all || f === `items-${safe(league)}.json`) fs.rmSync(this.file(f), { force: true });
    }
    this.items = [];
    this.characterItems = [];
    this.history.value = [];
    if (this.league) this.writeJson(`history-${safe(this.league)}.json`, this.history);
    this.pushState();
    this.status(`Wyczyszczono dane o przedmiotach${all ? ' (wszystkie ligi)' : this.league ? ` (liga ${this.league})` : ''}.`);
    if (wasRunning) void this.start(false).catch(() => undefined); // starts over in the background
    return { removed };
  }

  resetSession() {
    this.sessionStart = new Date().toISOString();
    this.pushState();
  }

  exportCsv(): string {
    return toCsv(this.items, this.divineRate);
  }

  exportFileName() {
    return `wycena-${safe(this.league || 'poe')}-${new Date().toISOString().slice(0, 10)}.csv`;
  }

  async testDiscord(webhook: string) {
    await sendDiscord(fetch, webhook, discordPayload(sampleItems()[0], 'Test', 180));
  }

  stop() {
    this.watcher?.stop();
    this.watcher = null;
    if (this.repriceTimer) clearInterval(this.repriceTimer);
    this.repriceTimer = null;
  }

  private starting = false;

  private status(text: string, error = false) {
    this.emit({ type: 'status', payload: { text, error } });
  }

  async start(demo: boolean): Promise<{ league: string; divineRate: number | null }> {
    if (this.starting) throw new Error('Aplikacja już się uruchamia – poczekaj chwilę.');
    this.starting = true;
    try {
      return await this.startInner(demo);
    } catch (e) {
      this.status(`Nie udało się uruchomić: ${msg(e)}`, true);
      throw e;
    } finally {
      this.starting = false;
    }
  }

  private async startInner(demo: boolean): Promise<{ league: string; divineRate: number | null }> {
    this.stop();
    const settings = this.getSettings();
    const profile = settings.profiles.find((p) => p.id === settings.activeProfileId);
    if (!profile) throw new Error('Brak aktywnego profilu – uzupełnij ustawienia.');
    this.sessionStart = new Date().toISOString();

    if (demo) {
      this.demo = true;
      this.engine = null;
      this.league = profile.league === 'auto' ? 'Demo' : profile.league;
      this.divineRate = 180;
      this.history = emptyHistory();
      this.items = demoItems();
      this.sessionStart = new Date(Date.now() - 45 * 60_000).toISOString();
      this.history.value = demoValue(this.items);
      this.pushState();
      this.emit({ type: 'status', payload: { text: 'Tryb demo – przykładowe przedmioty, bez połączenia z API' } });
      return { league: this.league, divineRate: this.divineRate };
    }

    this.status('Krok 1/4: pobieram listę lig z poe.ninja…');
    let leagues: League[] = [];
    try {
      leagues = await this.ninja.leagues();
    } catch (e) {
      this.status(`Nie udało się pobrać listy lig (${msg(e)}) – używam ustawienia z profilu.`, true);
    }
    this.league = resolveLeague(profile.league, profile.hardcore, leagues);
    const trade = new TradeClient(fetch, profile.accountName, profile.poesessid.trim() || undefined);
    this.trade = trade;
    this.profile = profile;
    const engine = new PricingEngine(profile, this.league, this.ninja, trade);
    this.engine = engine;
    this.demo = false;

    this.status(`Krok 2/4: pobieram ceny z poe.ninja dla ligi ${this.league}…`);
    const count = await engine.refreshPrices(false, (done, total, failed) => {
      this.status(`Krok 2/4: ceny z poe.ninja – ${done}/${total} kategorii${failed ? ` (${failed} niedostępnych)` : ''}`);
    });
    this.divineRate = engine.divineRate;

    this.status('Krok 3/4: pobieram listę modów z trade (pathofexile.com)…');
    try {
      engine.setTradeStats(await trade.stats());
    } catch (e) {
      this.status(`Nie udało się pobrać modów z trade: ${msg(e)}. Rare będą wyceniane dopiero po ponownym starcie.`, true);
    }
    const store = this.readJson<{ seen: string[]; items: PricedItem[] }>(`items-${safe(this.league)}.json`, { seen: [], items: [] });
    this.items = store.items;
    this.history = this.readJson<HistoryStore>(`history-${safe(this.league)}.json`, emptyHistory());
    this.pushState();

    if (profile.stashSource !== 'session' || !profile.poesessid.trim()) {
      this.status(`Gotowe (${count} cen z poe.ninja). Skrzynia nie jest skanowana – wyceniaj przedmioty w grze: najedź i naciśnij Ctrl+C. `
        + 'Aby wczytać całą skrzynię, wpisz POESESSID w ⚙ Ustawieniach.');
      return { league: this.league, divineRate: this.divineRate };
    }
    const source = new SessionTabsSource(profile, this.league, trade);
    this.status(`Krok 4/4: wczytuję skrzynię konta ${profile.accountName} z serwera GGG… (wczytano ${count} cen)`);

    const self = this;
    // Only items we actually priced count as seen (older versions also stored skipped ones, which hid them for good).
    // Items saved without a stash position (older versions) are fetched again so they show up in the tab view.
    const pricedIds = new Set(this.items.filter((p) => p.location).map((p) => p.item.id));
    this.watcher = new StashWatcher(profile, this.league, source, engine, {
      onItems(newItems) {
        self.divineRate = engine.divineRate ?? self.divineRate;
        const enriched = self.enrich(newItems, profile);
        // An item fetched again (e.g. to learn its position) replaces the old entry instead of duplicating it.
        const old = new Map(self.items.map((p) => [p.item.id, p]));
        const merged = enriched.map((p) => (old.has(p.item.id) ? { ...p, firstSeen: old.get(p.item.id)!.firstSeen } : p));
        const ids = new Set(merged.map((p) => p.item.id));
        self.items = [...merged, ...self.items.filter((p) => !ids.has(p.item.id))].slice(0, 2000);
        recordValue(self.history, self.items);
        self.writeJson(`items-${safe(self.league)}.json`, { seen: self.watcher?.seenIds ?? [], items: self.items });
        self.writeJson(`history-${safe(self.league)}.json`, self.history);
        self.pushState();
        self.notify(enriched, profile);
      },
      onPresent: (ids, complete) => {
        if (!complete) return;
        const present = new Set(ids);
        let changed = false;
        self.items = self.items.map((p) => {
          const now = present.has(p.item.id);
          if (p.present === now) return p;
          changed = true;
          return { ...p, present: now };
        });
        if (changed) {
          self.writeJson(`items-${safe(self.league)}.json`, { seen: self.watcher?.seenIds ?? [], items: self.items });
          self.emit({ type: 'items', payload: self.items });
        }
      },
      onStatus: (text) => this.emit({ type: 'status', payload: { text } }),
      onError: (text) => this.emit({ type: 'status', payload: { text, error: true } }),
    }, store.seen.filter((id) => pricedIds.has(id)));
    this.watcher.start();
    this.startAutoReprice(profile);
    return { league: this.league, divineRate: this.divineRate };
  }

  /** Doradca craftu for one item: free affixes, bench crafts priced on trade, random crafts with cost. */
  async craftAdvice(itemId: string): Promise<CraftReport> {
    const gear = this.characterItems.find((e) => e.item.id === itemId)
      ?? (() => { const c = this.checks.find((x) => x.item.id === itemId); return c ? { slot: '', item: c.item, gems: [], price: c.price } : undefined; })();
    const found = this.items.find((p) => p.item.id === itemId)
      ?? (gear ? { item: gear.item, price: gear.price ?? { itemId, source: 'none' as const, chaos: null, low: null, high: null, confidence: 'low' as const, sampleSize: 0, note: '' }, firstSeen: '' } : undefined);
    if (!found) throw new Error('Nie znaleziono przedmiotu.');
    const current = found.price.chaos;
    if (this.demo) {
      return craftReport(found.item, current, demoCraftPricer(current, this.divineRate));
    }
    const engine = this.engine;
    if (!engine) throw new Error('Najpierw kliknij Start – doradca korzysta z cen z trade i poe.ninja.');
    this.status(`Doradca craftu: sprawdzam ${found.item.name || found.item.typeLine}…`);
    const report = await craftReport(found.item, current, { tradePrice: (it) => engine.tradePrice(it), chaosRate: (c) => engine.chaosRate(c), weight: modWeight });
    this.status('Doradca craftu: gotowe.');
    return report;
  }

  private activeProfile(): Profile {
    const settings = this.getSettings();
    const profile = settings.profiles.find((p) => p.id === settings.activeProfileId);
    if (!profile) throw new Error('Brak aktywnego profilu – uzupełnij ustawienia.');
    return profile;
  }

  private accountClient(profile: Profile): TradeClient {
    if (this.trade && this.profile?.id === profile.id) return this.trade;
    return new TradeClient(fetch, profile.accountName, profile.poesessid.trim() || undefined);
  }

  /** Characters of the account; the profile's league first. */
  async listCharacters(): Promise<CharacterSummary[]> {
    const profile = this.activeProfile();
    if (this.demo) return demoCharacters();
    const raw = await this.accountClient(profile).characters(profile.accountName, profile.realm);
    return sortCharacters((Array.isArray(raw) ? raw : []).map(toSummary), this.league || profile.league);
  }

  /** Gear, gems, tree jewels and stats of one character; withPrices=true also prices every item. */
  async character(name: string, withPrices = false): Promise<CharacterView> {
    const profile = this.activeProfile();
    let view: CharacterView;
    if (this.demo) {
      view = demoCharacter(name);
    } else {
      const client = this.accountClient(profile);
      const items = await client.characterItems(profile.accountName, name, profile.realm);
      let passives = null;
      try { passives = await client.passives(profile.accountName, name, profile.realm); } catch { /* tree is optional */ }
      view = buildCharacter(profile.accountName, profile.realm, items, passives);
    }
    if (withPrices) {
      const all = [...view.items, ...view.jewels];
      let i = 0;
      for (const e of all) {
        i++;
        this.status(`Wyceniam ekwipunek ${i}/${all.length}: ${e.item.name || e.item.typeLine}…`);
        if (this.demo) {
          e.price = { itemId: e.item.id, source: 'trade', chaos: 20 + ((i * 37) % 160), low: null, high: null, confidence: 'medium', sampleSize: 6, note: 'demo' };
          continue;
        }
        if (!this.engine) throw new Error('Najpierw kliknij Start – wycena ekwipunku korzysta z cen z trade i poe.ninja.');
        try { e.price = await this.engine.price(e.item); } catch (err) { e.price = { itemId: e.item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note: `Błąd wyceny: ${msg(err)}` }; }
      }
      this.status(`Wyceniono ekwipunek postaci ${name}.`);
    }
    this.characterItems = [...view.items, ...view.jewels];
    this.lastCharacter = view;
    return view;
  }

  // ---------- PoE HUB ----------

  /** The player's challenge list for the current (or profile) league. */
  getChallenges(): Challenge[] {
    return this.readJson<Challenge[]>(`challenges-${safe(this.hubLeague())}.json`, []);
  }

  saveChallenges(list: Challenge[]): Challenge[] {
    const clean = (Array.isArray(list) ? list : []).slice(0, 500).map((c) => ({
      id: String(c.id ?? Math.random().toString(36).slice(2, 10)), title: String(c.title ?? '').slice(0, 300), done: !!c.done, notes: String(c.notes ?? '').slice(0, 2000),
    })).filter((c) => c.title);
    this.writeJson(`challenges-${safe(this.hubLeague())}.json`, clean);
    return clean;
  }

  private hubLeague(): string {
    if (this.league) return this.league;
    try { const p = this.activeProfile(); return p.league === 'auto' ? 'auto' : p.league; } catch { return 'auto'; }
  }

  /** Trade offers that would upgrade one slot of the last opened character (cheapest first). */
  async upgradeSearch(slot: string): Promise<UpgradeResult> {
    const view = this.lastCharacter;
    if (!view) throw new Error('Najpierw otwórz postać w zakładce Postać.');
    const e = view.items.find((x) => x.slot === slot);
    if (!e) throw new Error('Ta postać nie ma przedmiotu w tym slocie.');
    const d = diagnose(view);
    const q = upgradeQuery(e, d.deficits);
    if (!q) throw new Error('Dla tego slotu nie szukam ulepszeń.');
    if (this.demo) {
      return { slot, wants: q.wants, total: 42, tradeUrl: 'https://www.pathofexile.com/trade', offers: [35, 48, 60, 75, 90].map((c, i) => ({ chaos: c, amount: c, currency: 'chaos', name: `Demo ${i + 1}`, mods: q.wants })) };
    }
    if (!this.engine) await this.start(false);
    const engine = this.engine;
    const trade = this.trade;
    if (!engine || !trade) throw new Error('Nie udało się uruchomić wyceny.');
    const league = this.league;
    const profile = this.activeProfile();
    const res = await trade.search(league, q.query, profile.realm);
    const listings = res.result.length ? await trade.fetch(res.result.slice(0, 10), res.id) : [];
    const offers = listings.map((l: any) => {
      const pr = l?.listing?.price ?? {};
      const rate = pr.currency === 'chaos' ? 1 : engine.chaosRate(pr.currency);
      const it = normalizeItem(l.item);
      return { chaos: rate == null ? null : Math.round(pr.amount * rate), amount: pr.amount, currency: pr.currency, name: it.name ? `${it.name}, ${it.typeLine}` : it.typeLine, mods: [...(it.implicitMods ?? []), ...(it.explicitMods ?? []), ...(it.craftedMods ?? [])], whisper: typeof l?.listing?.whisper === 'string' ? l.listing.whisper : undefined };
    }).filter((o: { amount?: number }) => o.amount);
    return { slot, wants: q.wants, total: res.total, offers, tradeUrl: trade.tradeUrl(league, res.id, profile.realm) };
  }

  getUpgradeWatch(): UpgradeWatchState {
    if (!this.watchState) {
      const saved = this.readJson<Partial<UpgradeWatchState>>('upgrade-watch.json', {});
      this.watchState = { settings: normalizeWatch(saved.settings), running: false, lastRun: saved.lastRun ?? null, lastError: null, finds: Array.isArray(saved.finds) ? saved.finds.slice(0, 20) : [] };
      for (const f of this.watchState.finds) this.watchReported.add(`${f.slot}|${f.name}|${f.chaos}`);
    }
    return this.watchState;
  }

  saveUpgradeWatch(settings: Partial<UpgradeWatchSettings>): UpgradeWatchState {
    const st = this.getUpgradeWatch();
    st.settings = normalizeWatch(settings);
    this.persistWatch();
    this.scheduleUpgradeWatch();
    return st;
  }

  private persistWatch() {
    const st = this.getUpgradeWatch();
    this.writeJson('upgrade-watch.json', { settings: st.settings, lastRun: st.lastRun, finds: st.finds });
  }

  private scheduleUpgradeWatch() {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
    const { settings } = this.getUpgradeWatch();
    if (!settings.enabled) return;
    this.watchTimer = setInterval(() => { void this.runUpgradeWatch(false); }, settings.everyMinutes * 60_000);
    this.watchTimer.unref?.();
  }

  /**
   * One pass: re-read the character, search trade for its weakest slots (max 3, a few seconds apart)
   * and notify about offers within budget. manual=false (timer) never starts the app by itself.
   */
  async runUpgradeWatch(manual: boolean): Promise<UpgradeWatchState> {
    const st = this.getUpgradeWatch();
    if (st.running) return st;
    if (!manual && !this.engine && !this.demo) return st;
    const name = st.settings.character || this.lastCharacter?.summary.name;
    if (!name) {
      st.lastError = 'Najpierw otwórz postać w zakładce Postać.';
      return st;
    }
    st.running = true;
    try {
      const view = await this.character(name);
      const slots = diagnose(view).weakestSlots;
      const results: UpgradeResult[] = [];
      for (const slot of slots) {
        if (results.length && !this.demo) await new Promise((r) => setTimeout(r, 3000));
        try { results.push(await this.upgradeSearch(slot)); } catch { /* one slot failing does not stop the rest */ }
      }
      const at = new Date().toISOString();
      const finds = newFinds(results, st.settings.budgetChaos, this.watchReported, at);
      st.finds = [...finds, ...st.finds].slice(0, 20);
      st.lastRun = at;
      st.lastError = slots.length ? null : 'Brak rare/magic ekwipunku do ulepszenia.';
      for (const f of finds) this.announceUpgrade(f, name);
      this.persistWatch();
    } catch (e) {
      st.lastError = msg(e);
    } finally {
      st.running = false;
    }
    return st;
  }

  private announceUpgrade(f: UpgradeWatchState['finds'][number], character: string) {
    this.emit({ type: 'notify', payload: { title: `Ulepszenie: ${f.slot} za ${f.chaos}c`, body: `${character}: ${f.name} (${f.wants.join(', ')})` } });
    let webhook = '';
    try { webhook = this.activeProfile().discordWebhook; } catch { /* no profile */ }
    if (!webhook) return;
    const payload = { username: 'PoE Stash Pricer', embeds: [{ title: `Ulepszenie dla ${character}: ${f.slot} za ${f.chaos}c`.slice(0, 250), url: f.tradeUrl, description: `${f.name}\n${f.wants.join(', ')}`.slice(0, 1000), color: 0xc8a65a }] };
    sendDiscord(fetch, webhook, payload).catch((e) => this.emit({ type: 'status', payload: { text: `Discord: ${msg(e)}`, error: true } }));
  }

  // ---------- backup ----------

  exportBackup(withSecrets: boolean): Backup {
    const files: Record<string, unknown> = {};
    for (const f of fs.readdirSync(this.dataDir)) if (BACKUP_FILE.test(f)) files[f] = this.readJson(f, null);
    return makeBackup(this.getSettings(), files, withSecrets);
  }

  importBackup(raw: unknown): { profiles: number; files: number } {
    const { settings, files } = restoreBackup(raw, this.getSettings());
    this.saveSettings(settings);
    for (const [name, data] of Object.entries(files)) this.writeJson(name, data);
    this.watchState = null;
    this.watchReported.clear();
    this.scheduleUpgradeWatch();
    return { profiles: settings.profiles.length, files: Object.keys(files).length };
  }

  // ---------- currency flipping ----------

  getFlips() {
    return this.flips;
  }

  /** Reads the bulk exchange for each currency in both directions (≈2 s apart, trade limits). */
  async scanFlips(): Promise<{ at: string | null; rows: FlipRow[]; running: boolean }> {
    if (this.flips.running) return this.flips;
    this.flips.running = true;
    try {
      if (this.demo) {
        this.flips.rows = rankFlips(FLIP_CURRENCIES.map(([id, name], i) => {
          const base = [180, 12, 0.3, 0.15, 0.6, 0.12, 0.1, 0.4, 0.5, 0.8, 1.2, 1.5][i] ?? 1;
          return { id, name, ask: base * 1.06, bid: base * (0.97 - (i % 3) * 0.02), ninja: base, marginPct: Math.round(((1.06 / (0.97 - (i % 3) * 0.02)) - 1) * 1000) / 10, sellers: 20, buyers: 12 };
        }));
      } else {
        if (!this.engine) await this.start(false);
        const engine = this.engine;
        const trade = this.trade;
        if (!engine || !trade) throw new Error('Nie udało się uruchomić wyceny.');
        const realm = this.activeProfile().realm;
        const rows: FlipRow[] = [];
        let i = 0;
        for (const [id, name] of FLIP_CURRENCIES) {
          i++;
          this.status(`Flip: sprawdzam ${name} (${i}/${FLIP_CURRENCIES.length})…`);
          if (id === 'chaos') continue;
          try {
            const sellers = await trade.exchange(this.league, id, 'chaos', realm);
            await new Promise((r) => setTimeout(r, 2000));
            const buyers = await trade.exchange(this.league, 'chaos', id, realm);
            await new Promise((r) => setTimeout(r, 2000));
            rows.push(flipRow(id, name, sellers, buyers, engine.chaosRate(id) ?? engine.chaosRate(name)));
          } catch (e) {
            this.status(`Flip: ${name} – ${msg(e)}`, true);
          }
        }
        this.flips.rows = rankFlips(rows);
        this.status(`Flip: sprawdzono ${rows.length} walut.`);
      }
      this.flips.at = new Date().toISOString();
    } finally {
      this.flips.running = false;
    }
    return this.flips;
  }

  getChecks(): PriceCheck[] {
    return this.checks;
  }

  /**
   * Prices an item from the text Path of Exile copies with Ctrl+C (or Ctrl+Alt+C with tiers).
   * Starts the price data on first use, so it works without scanning the stash.
   */
  async checkText(text: string): Promise<PriceCheck> {
    const item = parseItemText(text);
    if (!item) throw new Error('To nie wygląda na przedmiot z PoE – w grze najedź na przedmiot i naciśnij Ctrl+C.');
    let price;
    if (this.demo) {
      price = { itemId: item.id, source: 'none' as const, chaos: null, low: null, high: null, confidence: 'low' as const, sampleSize: 0, note: 'Tryb demo – kliknij Start, aby wyceniać prawdziwe przedmioty.' };
    } else {
      if (!this.engine) await this.start(false);
      const engine = this.engine;
      if (!engine) throw new Error('Nie udało się uruchomić wyceny.');
      this.status(`Wyceniam skopiowany przedmiot: ${item.name || item.typeLine}…`);
      price = await engine.price(item);
      this.status(`Wyceniono: ${item.name || item.typeLine} – ${price.chaos == null ? 'brak ceny' : `${Math.round(price.chaos)}c`}`);
    }
    const check: PriceCheck = { at: new Date().toISOString(), item, price, advice: advise(item, price, { sellMinChaos: 5 }) };
    this.checks = [check, ...this.checks].slice(0, 30);
    this.emit({ type: 'checks', payload: this.checks });
    return check;
  }

  /**
   * Prices items again (all present items, or the given ids) with the current market.
   * Runs in the background; progress goes to the status line.
   */
  async reprice(ids?: string[]): Promise<{ queued: number }> {
    const engine = this.engine;
    if (this.demo) {
      this.items = this.items.map((p) => (!ids || ids.includes(p.item.id) ? { ...p, pricedAt: new Date().toISOString() } : p));
      this.pushState();
      this.status('Tryb demo – ceny przeliczone (bez połączenia z API).');
      return { queued: ids?.length ?? this.items.length };
    }
    if (!engine || !this.profile) throw new Error('Najpierw kliknij Start – przeliczanie korzysta z cen z trade i poe.ninja.');
    if (this.repricing) throw new Error('Przeliczanie już trwa.');
    const targets = this.items.filter((p) => p.present !== false && (!ids || ids.includes(p.item.id)));
    void this.repriceItems(targets, engine, this.profile);
    return { queued: targets.length };
  }

  private async repriceItems(targets: PricedItem[], engine: PricingEngine, profile: Profile) {
    this.repricing = true;
    try {
      await engine.refreshPrices();
      let done = 0;
      for (const p of targets) {
        done++;
        this.status(`Przeliczam ${done}/${targets.length}: ${p.item.name || p.item.typeLine}…`);
        let price;
        try {
          price = await engine.price(p.item);
        } catch (e) {
          this.status(`Nie udało się przeliczyć ${p.item.name || p.item.typeLine}: ${msg(e)}`, true);
          continue;
        }
        const [updated] = this.enrich([{ ...p, price, pricedAt: new Date().toISOString() }], profile);
        this.items = this.items.map((x) => (x.item.id === p.item.id ? { ...updated, firstSeen: p.firstSeen, location: p.location, present: p.present } : x));
        if (done % 5 === 0 || done === targets.length) {
          recordValue(this.history, this.items);
          this.writeJson(`items-${safe(this.league)}.json`, { seen: this.watcher?.seenIds ?? [], items: this.items });
          this.writeJson(`history-${safe(this.league)}.json`, this.history);
          this.pushState();
        }
      }
      this.status(`${new Date().toLocaleTimeString()} · Przeliczono ${targets.length} przedmiotów.`);
    } finally {
      this.repricing = false;
    }
  }

  /** Every 10 minutes re-price up to 10 items whose price is older than profile.repriceHours. */
  private startAutoReprice(profile: Profile) {
    if (this.repriceTimer) clearInterval(this.repriceTimer);
    this.repriceTimer = null;
    if (!profile.repriceHours) return;
    this.repriceTimer = setInterval(() => {
      const engine = this.engine;
      if (!engine || this.repricing) return;
      const limit = Date.now() - profile.repriceHours * 3_600_000;
      const stale = this.items
        .filter((p) => p.present !== false && Date.parse(p.pricedAt ?? p.firstSeen) < limit)
        .sort((a, b) => (b.price.chaos ?? 0) - (a.price.chaos ?? 0))
        .slice(0, 10);
      if (stale.length) void this.repriceItems(stale, engine, profile);
    }, 10 * 60_000);
    this.repriceTimer.unref?.();
  }

  private summary(): SessionSummary {
    return sessionSummary(this.items, this.sessionStart);
  }

  private pushState() {
    this.emit({ type: 'items', payload: this.items });
    this.emit({ type: 'session', payload: this.getSession() });
  }

  private enrich(newItems: PricedItem[], profile: Profile): PricedItem[] {
    return newItems.map((p) => {
      const withAdvice = { ...p, advice: advise(p.item, p.price, { sellMinChaos: Math.max(1, profile.notifyMinChaos / 2) }) };
      return { ...withAdvice, history: [...recordPrice(this.history, withAdvice)] };
    });
  }

  private notify(items: PricedItem[], profile: Profile) {
    for (const it of items) {
      if ((it.price.chaos ?? 0) < profile.notifyMinChaos) continue;
      this.emit({ type: 'notify', payload: { title: it.item.name || it.item.typeLine, body: `~${Math.round(it.price.chaos ?? 0)}c · ${it.advice?.label ?? ''}` } });
      if (profile.discordWebhook) {
        sendDiscord(fetch, profile.discordWebhook, discordPayload(it, this.league, this.divineRate)).catch((e) =>
          this.emit({ type: 'status', payload: { text: `Discord: ${msg(e)}`, error: true } }),
        );
      }
    }
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
