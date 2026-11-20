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
import { PublicTabsSource, SessionTabsSource } from './stashSource';
import { sampleItems } from './sampleItems';
import { demoItems, demoValue } from './demo';
import { advise } from './extras/advice';
import { emptyHistory, recordPrice, recordValue, sessionSummary, type HistoryStore } from './extras/history';
import { discordPayload, sendDiscord } from './extras/discord';
import { toCsv } from './extras/csv';
import { craftReport, demoCraftPricer } from './craft/advisor';
import { modWeight } from './pricing/tradeQuery';
import type { CraftReport } from '../shared/types';

export type ServiceEvent =
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
    const trade = new TradeClient(fetch, profile.accountName, profile.stashSource === 'session' ? profile.poesessid.trim() : undefined);
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
    const source = profile.stashSource === 'session' ? new SessionTabsSource(profile, this.league, trade) : new PublicTabsSource(profile, this.league, trade);
    this.status(`Krok 4/4: sprawdzam ${source.label} konta ${profile.accountName}… (wczytano ${count} cen)`);

    const store = this.readJson<{ seen: string[]; items: PricedItem[] }>(`items-${safe(this.league)}.json`, { seen: [], items: [] });
    this.items = store.items;
    this.history = this.readJson<HistoryStore>(`history-${safe(this.league)}.json`, emptyHistory());
    this.pushState();

    const self = this;
    // Only items we actually priced count as seen (older versions also stored skipped ones, which hid them for good).
    const pricedIds = new Set(this.items.map((p) => p.item.id));
    this.watcher = new StashWatcher(profile, this.league, source, engine, {
      onItems(newItems) {
        self.divineRate = engine.divineRate ?? self.divineRate;
        const enriched = self.enrich(newItems, profile);
        self.items = [...enriched, ...self.items].slice(0, 2000);
        recordValue(self.history, self.items);
        self.writeJson(`items-${safe(self.league)}.json`, { seen: self.watcher?.seenIds ?? [], items: self.items });
        self.writeJson(`history-${safe(self.league)}.json`, self.history);
        self.pushState();
        self.notify(enriched, profile);
      },
      onEmpty: () => this.findOtherLeague(profile, leagues),
      onPresent: (ids, complete) => {
        // Only trust absence when the scan returned everything (the trade search is capped at 100 results).
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
    const found = this.items.find((p) => p.item.id === itemId);
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

  /** Nothing visible in this league: look for the account's items in other leagues (once per start). */
  private async findOtherLeague(profile: Profile, leagues: League[]): Promise<string | null> {
    if (profile.stashSource === 'session' || !this.trade) return null;
    const candidates = [...new Set(['Standard', 'Hardcore', ...leagues.filter((l) => l.current).map((l) => l.id)])].filter((l) => l !== this.league);
    const found: string[] = [];
    for (const league of candidates.slice(0, 4)) {
      try {
        const r = await this.trade.searchAccountItems(league, profile.accountName, profile.realm);
        if (r.total > 0) found.push(`${league} (${r.total})`);
      } catch { /* ignore: only a hint */ }
    }
    return found.length
      ? `Twoje publiczne przedmioty widać w innej lidze: ${found.join(', ')} – zmień ligę w profilu.`
      : 'W innych ligach też nic nie widać – sprawdź nazwę konta z numerem i czy zakładka jest „Public”.';
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
