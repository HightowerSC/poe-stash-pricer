import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppSettings, League, PricedItem, Profile, SessionSummary } from '../shared/types';
import { emptySettings, resolveLeague, upgradeProfile } from '../core/config';
import { NinjaClient } from '../core/ninja';
import { TradeClient } from '../core/trade';
import { PricingEngine } from '../core/engine';
import { StashWatcher } from '../core/watcher';
import { sampleItems } from '../core/sampleItems';
import { demoItems, demoValue } from '../core/demo';
import { advise } from '../core/extras/advice';
import { emptyHistory, recordPrice, recordValue, sessionSummary, type HistoryStore } from '../core/extras/history';
import { discordPayload, sendDiscord } from '../core/extras/discord';
import { toCsv } from '../core/extras/csv';

const DISCLAIMER = "This product isn't affiliated with or endorsed by Grinding Gear Games in any way.";
const dataDir = () => app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const safe = (league: string) => league.replace(/[^\w-]/g, '_');
const itemsFile = (league: string) => path.join(dataDir(), `items-${safe(league)}.json`);
const historyFile = (league: string) => path.join(dataDir(), `history-${safe(league)}.json`);

let win: BrowserWindow | null = null;
let watcher: StashWatcher | null = null;
let items: PricedItem[] = [];
let history: HistoryStore = emptyHistory();
let currentLeague = '';
let divineRate: number | null = null;
let sessionStart = new Date().toISOString();
const ninja = new NinjaClient(fetch);

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadSettings(): AppSettings {
  const s = readJson<AppSettings>(settingsFile(), emptySettings());
  return { ...s, profiles: s.profiles.map(upgradeProfile) };
}

function send(channel: string, payload: unknown) {
  win?.webContents.send(channel, payload);
}

function summary(): SessionSummary {
  return sessionSummary(items, sessionStart);
}

function pushState() {
  send('items', items);
  send('session', { summary: summary(), value: history.value, divineRate });
}

/** Adds advice and history to freshly priced items. */
function enrich(newItems: PricedItem[], profile: Profile): PricedItem[] {
  return newItems.map((p) => {
    const withAdvice = { ...p, advice: advise(p.item, p.price, { sellMinChaos: Math.max(1, profile.notifyMinChaos / 2) }) };
    return { ...withAdvice, history: [...recordPrice(history, withAdvice)] };
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0e0d0b',
    title: 'PoE Stash Pricer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '../../dist/index.html'));
}

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:save', (_e, s: AppSettings) => writeJson(settingsFile(), s));

ipcMain.handle('leagues:list', async (): Promise<League[]> => {
  try {
    return await ninja.leagues();
  } catch {
    // Offline: still let the user pick the permanent leagues.
    return [
      { id: 'Standard', name: 'Standard', hardcore: false, current: false },
      { id: 'Hardcore', name: 'Hardcore', hardcore: true, current: false },
    ];
  }
});

ipcMain.handle('items:get', () => items);
ipcMain.handle('session:get', () => ({ summary: summary(), value: history.value, divineRate }));
ipcMain.handle('session:reset', () => {
  sessionStart = new Date().toISOString();
  pushState();
});

ipcMain.handle('open:external', (_e, url: string) => {
  if (/^https:\/\/(www\.)?(pathofexile\.com|poe\.ninja|poedb\.tw|poewiki\.net|www\.poewiki\.net|www\.craftofexile\.com|www\.poeprices\.info)\//.test(url)) {
    return shell.openExternal(url);
  }
});

ipcMain.handle('export:csv', async () => {
  const res = await dialog.showSaveDialog(win!, {
    title: 'Eksport do CSV',
    defaultPath: `wycena-${safe(currentLeague || 'poe')}-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, toCsv(items, divineRate), 'utf8');
  return res.filePath;
});

ipcMain.handle('discord:test', async (_e, webhook: string) => {
  const sample = sampleItems()[0];
  await sendDiscord(fetch, webhook, discordPayload(sample, 'Test', 180));
});

ipcMain.handle('watch:stop', () => {
  watcher?.stop();
  watcher = null;
});

ipcMain.handle('watch:start', async (_e, demo: boolean) => {
  watcher?.stop();
  const settings = loadSettings();
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId);
  if (!profile) throw new Error('Brak aktywnego profilu – uzupełnij ustawienia.');
  sessionStart = new Date().toISOString();

  if (demo) {
    currentLeague = profile.league === 'auto' ? 'Demo' : profile.league;
    divineRate = 180;
    history = emptyHistory();
    items = demoItems();
    history.value = demoValue(items);
    pushState();
    send('status', { text: 'Tryb demo – przykładowe przedmioty, bez połączenia z API' });
    return { league: currentLeague, divineRate };
  }

  const leagues = await ninja.leagues().catch(() => [] as League[]);
  currentLeague = resolveLeague(profile.league, profile.hardcore, leagues);
  const trade = new TradeClient(fetch, profile.accountName);
  const engine = new PricingEngine(profile, currentLeague, ninja, trade);
  await engine.refreshPrices();
  divineRate = engine.divineRate;
  try {
    engine.setTradeStats(await trade.stats());
  } catch (e) {
    send('status', { text: `Nie udało się pobrać statystyk trade: ${e instanceof Error ? e.message : e}`, error: true });
  }

  const store = readJson<{ seen: string[]; items: PricedItem[] }>(itemsFile(currentLeague), { seen: [], items: [] });
  items = store.items;
  history = readJson<HistoryStore>(historyFile(currentLeague), emptyHistory());
  pushState();

  watcher = new StashWatcher(profile, currentLeague, trade, engine, {
    onItems(newItems) {
      divineRate = engine.divineRate ?? divineRate;
      const enriched = enrich(newItems, profile);
      items = [...enriched, ...items].slice(0, 2000);
      recordValue(history, items);
      writeJson(itemsFile(currentLeague), { seen: watcher?.seenIds ?? [], items });
      writeJson(historyFile(currentLeague), history);
      pushState();
      for (const it of enriched) {
        if ((it.price.chaos ?? 0) < profile.notifyMinChaos) continue;
        if (Notification.isSupported()) {
          new Notification({ title: it.item.name || it.item.typeLine, body: `~${Math.round(it.price.chaos ?? 0)}c · ${it.advice?.label ?? ''}` }).show();
        }
        if (profile.discordWebhook) {
          sendDiscord(fetch, profile.discordWebhook, discordPayload(it, currentLeague, divineRate)).catch((e) =>
            send('status', { text: `Discord: ${e instanceof Error ? e.message : e}`, error: true }),
          );
        }
      }
    },
    onStatus: (text) => send('status', { text }),
    onError: (text) => send('status', { text, error: true }),
  }, store.seen);
  watcher.start();
  return { league: currentLeague, divineRate };
});

app.whenReady().then(() => {
  console.log(DISCLAIMER);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
