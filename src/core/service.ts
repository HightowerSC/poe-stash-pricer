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
import { sampleItems } from './sampleItems';
import { demoItems, demoValue } from './demo';
import { advise } from './extras/advice';
import { emptyHistory, recordPrice, recordValue, sessionSummary, type HistoryStore } from './extras/history';
import { discordPayload, sendDiscord } from './extras/discord';
import { toCsv } from './extras/csv';

export type ServiceEvent =
  | { type: 'items'; payload: PricedItem[] }
  | { type: 'session'; payload: SessionState }
  | { type: 'status'; payload: { text: string; error?: boolean } }
  | { type: 'notify'; payload: { title: string; body: string } };

const safe = (league: string) => league.replace(/[^\w-]/g, '_');

export class PricerService {
  private watcher: StashWatcher | null = null;
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
    const trade = new TradeClient(fetch, profile.accountName);
    const engine = new PricingEngine(profile, this.league, this.ninja, trade);

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
    this.status(`Krok 4/4: sprawdzam publiczne zakładki konta ${profile.accountName}… (wczytano ${count} cen)`);

    const store = this.readJson<{ seen: string[]; items: PricedItem[] }>(`items-${safe(this.league)}.json`, { seen: [], items: [] });
    this.items = store.items;
    this.history = this.readJson<HistoryStore>(`history-${safe(this.league)}.json`, emptyHistory());
    this.pushState();

    const self = this;
    this.watcher = new StashWatcher(profile, this.league, trade, engine, {
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
      onStatus: (text) => this.emit({ type: 'status', payload: { text } }),
      onError: (text) => this.emit({ type: 'status', payload: { text, error: true } }),
    }, store.seen);
    this.watcher.start();
    return { league: this.league, divineRate: this.divineRate };
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
