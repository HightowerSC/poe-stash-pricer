import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppSettings, League, PricedItem } from '../shared/types';
import { emptySettings, resolveLeague } from '../core/config';
import { NinjaClient } from '../core/ninja';
import { TradeClient } from '../core/trade';
import { PricingEngine } from '../core/engine';
import { StashWatcher } from '../core/watcher';
import { sampleItems } from '../core/sampleItems';

const DISCLAIMER = "This product isn't affiliated with or endorsed by Grinding Gear Games in any way.";
const dataDir = () => app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const itemsFile = (league: string) => path.join(dataDir(), `items-${league.replace(/[^\w-]/g, '_')}.json`);

let win: BrowserWindow | null = null;
let watcher: StashWatcher | null = null;
let items: PricedItem[] = [];
let currentLeague = '';
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

function send(channel: string, payload: unknown) {
  win?.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
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

ipcMain.handle('settings:get', () => readJson<AppSettings>(settingsFile(), emptySettings()));
ipcMain.handle('settings:save', (_e, s: AppSettings) => writeJson(settingsFile(), s));

ipcMain.handle('leagues:list', async (): Promise<League[]> => {
  try {
    return await ninja.leagues();
  } catch {
    // Offline: still let the user pick the permanent leagues or type one.
    return [
      { id: 'Standard', name: 'Standard', hardcore: false, current: false },
      { id: 'Hardcore', name: 'Hardcore', hardcore: true, current: false },
    ];
  }
});

ipcMain.handle('items:get', () => items);
ipcMain.handle('open:external', (_e, url: string) => {
  if (/^https:\/\/(www\.)?(pathofexile\.com|poe\.ninja|poedb\.tw|www\.poewiki\.net|www\.craftofexile\.com)\//.test(url)) {
    return shell.openExternal(url);
  }
});

ipcMain.handle('watch:stop', () => {
  watcher?.stop();
  watcher = null;
});

ipcMain.handle('watch:start', async (_e, demo: boolean) => {
  watcher?.stop();
  const settings = readJson<AppSettings>(settingsFile(), emptySettings());
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId);
  if (!profile) throw new Error('Brak aktywnego profilu – uzupełnij ustawienia.');

  if (demo) {
    currentLeague = profile.league === 'auto' ? 'Demo' : profile.league;
    items = sampleItems();
    send('items', items);
    send('status', { text: 'Tryb demo – przykładowe przedmioty, bez połączenia z API' });
    return { league: currentLeague, divineRate: 180 };
  }

  const leagues = await ninja.leagues().catch(() => [] as League[]);
  currentLeague = resolveLeague(profile.league, profile.hardcore, leagues);
  const trade = new TradeClient(fetch, profile.accountName);
  const engine = new PricingEngine(profile, currentLeague, ninja, trade);
  await engine.refreshPrices();
  try {
    engine.setTradeStats(await trade.stats());
  } catch (e) {
    send('status', { text: `Nie udało się pobrać statystyk trade: ${e instanceof Error ? e.message : e}`, error: true });
  }

  const store = readJson<{ seen: string[]; items: PricedItem[] }>(itemsFile(currentLeague), { seen: [], items: [] });
  items = store.items;
  send('items', items);

  watcher = new StashWatcher(profile, currentLeague, trade, engine, {
    onItems(newItems) {
      items = [...newItems, ...items].slice(0, 1000);
      writeJson(itemsFile(currentLeague), { seen: watcher?.seenIds ?? [], items });
      send('items', items);
      for (const it of newItems) {
        if ((it.price.chaos ?? 0) >= profile.notifyMinChaos && Notification.isSupported()) {
          new Notification({ title: it.item.name || it.item.typeLine, body: `~${it.price.chaos}c · ${it.price.note}` }).show();
        }
      }
    },
    onStatus: (text) => send('status', { text }),
    onError: (text) => send('status', { text, error: true }),
  }, store.seen);
  watcher.start();
  return { league: currentLeague, divineRate: engine.divineRate };
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
