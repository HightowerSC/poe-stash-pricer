import type { FlipState, LanInfo, PricerApi, SessionState } from '../shared/api';
import { makeBackup, restoreBackup } from '../core/extras/backup';
import { FLIP_CURRENCIES, flipRow, rankFlips } from '../core/market/flip';
import { summarizeStrategies } from '../core/market/farm';
import type { FarmRun, FarmState, ShoppingRow } from '../shared/types';
import type { AppSettings, PricedItem } from '../shared/types';
import { demoItems, demoValue } from '../core/demo';
import { sessionSummary } from '../core/extras/history';
import { toCsv } from '../core/extras/csv';
import { upgradeProfile } from '../core/config';
import { craftReport, demoCraftPricer } from '../core/craft/advisor';
import { demoCharacter, demoCharacters } from '../core/character';
import { parseItemText } from '../core/itemText';
import type { PriceCheck } from '../shared/types';
import type { UpgradeWatchState } from '../shared/types';
import { newFinds, normalizeWatch } from '../core/hub/watch';
import { bundledCatalog, mergeCatalog, type ChallengeCatalog } from '../core/hub/challengeSource';
import type { Challenge } from '../core/hub/challenges';

/** Used when the UI runs in a normal browser (design preview, screenshots). */
export function browserMockApi(): PricerApi {
  let settings: AppSettings = { activeProfileId: null, profiles: [] };
  try {
    const raw = localStorage.getItem('pricer-settings');
    if (raw) {
      settings = JSON.parse(raw);
      settings.profiles = settings.profiles.map(upgradeProfile);
    }
  } catch { /* storage unavailable */ }
  let items: PricedItem[] = [];
  let watch: UpgradeWatchState = { settings: normalizeWatch(null), running: false, lastRun: null, lastError: null, finds: [] };
  const watchReported = new Set<string>();
  const farm: { active: FarmRun | null; runs: FarmRun[] } = { active: null, runs: [
    { id: 'r1', strategy: 'Essence + Harbinger', startedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), endedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(), maps: 14, costPerMap: 8, extraChaos: 60, lootChaos: 820, lootCount: 41, notes: '' },
    { id: 'r2', strategy: 'Strongbox', startedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), endedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), maps: 12, costPerMap: 15, extraChaos: 0, lootChaos: 640, lootCount: 22, notes: '' },
  ] };
  const farmState = (): FarmState => ({ active: farm.active, live: farm.active ? { chaos: 310, count: 12 } : null, runs: farm.runs, strategies: summarizeStrategies(farm.runs), lastScan: new Date().toISOString() });
  let lanInfo: LanInfo = { enabled: false, pin: '482913', port: 5318, running: false, urls: ['http://192.168.1.20:5318'], error: null };
  let flips: FlipState = { at: null, rows: [], running: false };
  let session: SessionState = { summary: sessionSummary([], new Date().toISOString()), value: [], divineRate: null };
  const itemListeners = new Set<(i: PricedItem[]) => void>();
  const sessionListeners = new Set<(s: SessionState) => void>();
  let checks: PriceCheck[] = [];
  const checkListeners = new Set<(c: PriceCheck[]) => void>();
  const statusListeners = new Set<(s: { text: string; error?: boolean }) => void>();

  return {
    async getSettings() { return settings; },
    async saveSettings(s) {
      settings = s;
      try { localStorage.setItem('pricer-settings', JSON.stringify(s)); } catch { /* ignore */ }
    },
    async listLeagues() {
      return [
        { id: 'Covens', name: 'Covens', hardcore: false, current: true },
        { id: 'Hardcore Covens', name: 'Hardcore Covens', hardcore: true, current: true },
        { id: 'Standard', name: 'Standard', hardcore: false, current: false },
        { id: 'Hardcore', name: 'Hardcore', hardcore: true, current: false },
      ];
    },
    async start() {
      items = demoItems();
      const startedAt = new Date(Date.now() - 45 * 60_000).toISOString();
      session = { summary: sessionSummary(items, startedAt), value: demoValue(items), divineRate: 180 };
      itemListeners.forEach((l) => l(items));
      sessionListeners.forEach((l) => l(session));
      statusListeners.forEach((l) => l({ text: 'Podgląd w przeglądarce – przykładowe przedmioty' }));
      return { league: 'Covens', divineRate: 180 };
    },
    async stop() {},
    async getChallenges() {
      try { return JSON.parse(localStorage.getItem('pricer-challenges') ?? '[]'); } catch { return []; }
    },
    async saveChallenges(list) {
      try { localStorage.setItem('pricer-challenges', JSON.stringify(list)); } catch { /* ignore */ }
      return list;
    },
    async syncChallenges() {
      let list: Challenge[] = [];
      try { list = JSON.parse(localStorage.getItem('pricer-challenges') ?? '[]'); } catch { /* ignore */ }
      const cat: ChallengeCatalog = { league: 'Covens', source: 'bundled', fetchedAt: new Date().toISOString(), items: bundledCatalog('Covens') ?? [], notes: ['podgląd w przeglądarce'] };
      list = mergeCatalog(list, cat);
      try { localStorage.setItem('pricer-challenges', JSON.stringify(list)); } catch { /* ignore */ }
      return { list, league: 'Covens', source: 'bundled', fetchedAt: cat.fetchedAt, notes: cat.notes };
    },
    async upgradeSearch(slot) {
      return { slot, wants: ['życie 70+', 'fire res 40%+'], total: 42, tradeUrl: 'https://www.pathofexile.com/trade', offers: [35, 48, 60].map((c, i) => ({ chaos: c, amount: c, currency: 'chaos', name: `Demo ${i + 1}`, mods: ['+75 to maximum Life', '+42% to Fire Resistance'] })) };
    },
    async exportBackup(withSecrets) {
      const files: Record<string, unknown> = {};
      try { files['challenges-Covens.json'] = JSON.parse(localStorage.getItem('pricer-challenges') ?? '[]'); } catch { /* ignore */ }
      return makeBackup(settings, files, withSecrets);
    },
    async importBackup(backup) {
      const r = restoreBackup(backup, settings);
      settings = r.settings;
      try {
        localStorage.setItem('pricer-settings', JSON.stringify(settings));
        const ch = Object.entries(r.files).find(([k]) => k.startsWith('challenges-'));
        if (ch) localStorage.setItem('pricer-challenges', JSON.stringify(ch[1]));
      } catch { /* ignore */ }
      return { profiles: settings.profiles.length, files: Object.keys(r.files).length };
    },
    async getFlips() { return flips; },
    async getLan() { return lanInfo; },
    async saveLan(cfg) {
      if (cfg.pin !== undefined && !/^\d{4,8}$/.test(cfg.pin)) throw new Error('PIN musi mieć od 4 do 8 cyfr.');
      lanInfo = { ...lanInfo, ...cfg, running: cfg.enabled ?? lanInfo.enabled };
      return lanInfo;
    },
    async pobShopping() {
      const rows = [
        { kind: 'unique', slot: 'Body Armour', name: 'The Covenant', detail: 'Spidersilk Robe · gniazda B-B-B-B-B-B', chaos: 420, confidence: 'high', owned: false },
        { kind: 'rare', slot: 'Helmet', name: 'Doom Crown', detail: 'Hubris Circlet', chaos: 85, confidence: 'medium', owned: false },
        { kind: 'gem', slot: 'Gem', name: 'Empower Support', detail: '4/0', chaos: 310, confidence: 'high', owned: false },
        { kind: 'gem', slot: 'Gem', name: 'Raise Spectre', detail: '20/20', chaos: 6, confidence: 'high', owned: true },
      ] as ShoppingRow[];
      return { className: 'Witch', ascendancy: 'Necromancer', level: 94, rows, total: 821, toBuy: 815, at: new Date().toISOString() };
    },
    async getFarm() { return farmState(); },
    async startFarm(strategy, costPerMap) {
      if (farm.active) throw new Error('Sesja farmy już trwa – najpierw ją zakończ.');
      farm.active = { id: String(Date.now()), strategy: strategy || 'Bez nazwy', startedAt: new Date(Date.now() - 45 * 60_000).toISOString(), endedAt: null, maps: 0, costPerMap, extraChaos: 0, lootChaos: 0, lootCount: 0, notes: '' };
      return farmState();
    },
    async finishFarm(maps, extraChaos, notes) {
      if (!farm.active) throw new Error('Nie ma trwającej sesji farmy.');
      farm.runs.push({ ...farm.active, endedAt: new Date().toISOString(), maps, extraChaos, notes, lootChaos: 900, lootCount: 34 });
      farm.active = null;
      return farmState();
    },
    async cancelFarm() { farm.active = null; return farmState(); },
    async deleteFarmRun(id) { farm.runs = farm.runs.filter((r) => r.id !== id); return farmState(); },
    async scanFlips() {
      flips = { running: false, at: new Date().toISOString(), rows: rankFlips(FLIP_CURRENCIES.slice(0, 6).map(([id, name], i) => flipRow(id, name,
        [{ give: 1, take: [182, 12.5, 0.32, 0.16, 0.62, 0.13][i], stock: 50 }, { give: 1, take: [183, 12.6, 0.33, 0.17, 0.63, 0.13][i], stock: 80 }],
        [{ give: [172, 11.9, 0.29, 0.15, 0.6, 0.12][i], take: 1, stock: 900 }, { give: [170, 11.8, 0.28, 0.15, 0.59, 0.11][i], take: 1, stock: 900 }],
        [180, 12, 0.3, 0.15, 0.6, 0.12][i]))) };
      return flips;
    },
    async getUpgradeWatch() { return watch; },
    async saveUpgradeWatch(settings) { watch = { ...watch, settings: normalizeWatch(settings) }; return watch; },
    async runUpgradeWatch() {
      const at = new Date().toISOString();
      const finds = newFinds([await this.upgradeSearch('Gloves')], watch.settings.budgetChaos, watchReported, at);
      watch = { ...watch, lastRun: at, lastError: null, finds: [...finds, ...watch.finds].slice(0, 20) };
      return watch;
    },
    async checkText(text) {
      const item = parseItemText(text);
      if (!item) throw new Error('To nie wygląda na przedmiot z PoE.');
      const check: PriceCheck = { at: new Date().toISOString(), item, price: { itemId: item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note: 'Podgląd w przeglądarce – bez wyceny' } };
      checks = [check, ...checks];
      checkListeners.forEach((l) => l(checks));
      return check;
    },
    async getChecks() { return checks; },
    onChecks(cb) { checkListeners.add(cb); return () => { checkListeners.delete(cb); }; },
    async clearItems() {
      const removed = items.length;
      items = [];
      itemListeners.forEach((l) => l(items));
      return { removed };
    },
    async listCharacters() { return demoCharacters(); },
    async character(name, prices) {
      const view = demoCharacter(name);
      if (prices) [...view.items, ...view.jewels].forEach((e, i) => { e.price = { itemId: e.item.id, source: 'trade', chaos: 20 + ((i * 37) % 160), low: null, high: null, confidence: 'medium', sampleSize: 6, note: 'demo' }; });
      return view;
    },
    async reprice(ids) {
      items = items.map((p) => (!ids || ids.includes(p.item.id) ? { ...p, pricedAt: new Date().toISOString() } : p));
      itemListeners.forEach((l) => l(items));
      return { queued: ids?.length ?? items.length };
    },
    async craftAdvice(id) {
      const found = items.find((p) => p.item.id === id);
      if (!found) throw new Error('Nie znaleziono przedmiotu.');
      return craftReport(found.item, found.price.chaos, demoCraftPricer(found.price.chaos, session.divineRate));
    },
    async getItems() { return items; },
    async getSession() { return session; },
    async resetSession() {
      session = { ...session, summary: sessionSummary(items, new Date().toISOString()) };
      sessionListeners.forEach((l) => l(session));
    },
    async exportCsv() {
      const blob = new Blob([toCsv(items, session.divineRate)], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wycena.csv';
      a.click();
      return 'wycena.csv';
    },
    async testDiscord() {},
    async openExternal(url) { window.open(url, '_blank'); },
    onItems(cb) { itemListeners.add(cb); return () => { itemListeners.delete(cb); }; },
    onSession(cb) { sessionListeners.add(cb); return () => { sessionListeners.delete(cb); }; },
    onStatus(cb) { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; },
  };
}
