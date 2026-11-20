"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const config_1 = require("../core/config");
const ninja_1 = require("../core/ninja");
const trade_1 = require("../core/trade");
const engine_1 = require("../core/engine");
const watcher_1 = require("../core/watcher");
const sampleItems_1 = require("../core/sampleItems");
const demo_1 = require("../core/demo");
const advice_1 = require("../core/extras/advice");
const history_1 = require("../core/extras/history");
const discord_1 = require("../core/extras/discord");
const csv_1 = require("../core/extras/csv");
const DISCLAIMER = "This product isn't affiliated with or endorsed by Grinding Gear Games in any way.";
const dataDir = () => electron_1.app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const safe = (league) => league.replace(/[^\w-]/g, '_');
const itemsFile = (league) => path.join(dataDir(), `items-${safe(league)}.json`);
const historyFile = (league) => path.join(dataDir(), `history-${safe(league)}.json`);
let win = null;
let watcher = null;
let items = [];
let history = (0, history_1.emptyHistory)();
let currentLeague = '';
let divineRate = null;
let sessionStart = new Date().toISOString();
const ninja = new ninja_1.NinjaClient(fetch);
function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function loadSettings() {
    const s = readJson(settingsFile(), (0, config_1.emptySettings)());
    return { ...s, profiles: s.profiles.map(config_1.upgradeProfile) };
}
function send(channel, payload) {
    win?.webContents.send(channel, payload);
}
function summary() {
    return (0, history_1.sessionSummary)(items, sessionStart);
}
function pushState() {
    send('items', items);
    send('session', { summary: summary(), value: history.value, divineRate });
}
/** Adds advice and history to freshly priced items. */
function enrich(newItems, profile) {
    return newItems.map((p) => {
        const withAdvice = { ...p, advice: (0, advice_1.advise)(p.item, p.price, { sellMinChaos: Math.max(1, profile.notifyMinChaos / 2) }) };
        return { ...withAdvice, history: [...(0, history_1.recordPrice)(history, withAdvice)] };
    });
}
function createWindow() {
    win = new electron_1.BrowserWindow({
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
    if (devUrl)
        void win.loadURL(devUrl);
    else
        void win.loadFile(path.join(__dirname, '../../dist/index.html'));
}
electron_1.ipcMain.handle('settings:get', () => loadSettings());
electron_1.ipcMain.handle('settings:save', (_e, s) => writeJson(settingsFile(), s));
electron_1.ipcMain.handle('leagues:list', async () => {
    try {
        return await ninja.leagues();
    }
    catch {
        // Offline: still let the user pick the permanent leagues.
        return [
            { id: 'Standard', name: 'Standard', hardcore: false, current: false },
            { id: 'Hardcore', name: 'Hardcore', hardcore: true, current: false },
        ];
    }
});
electron_1.ipcMain.handle('items:get', () => items);
electron_1.ipcMain.handle('session:get', () => ({ summary: summary(), value: history.value, divineRate }));
electron_1.ipcMain.handle('session:reset', () => {
    sessionStart = new Date().toISOString();
    pushState();
});
electron_1.ipcMain.handle('open:external', (_e, url) => {
    if (/^https:\/\/(www\.)?(pathofexile\.com|poe\.ninja|poedb\.tw|poewiki\.net|www\.poewiki\.net|www\.craftofexile\.com|www\.poeprices\.info)\//.test(url)) {
        return electron_1.shell.openExternal(url);
    }
});
electron_1.ipcMain.handle('export:csv', async () => {
    const res = await electron_1.dialog.showSaveDialog(win, {
        title: 'Eksport do CSV',
        defaultPath: `wycena-${safe(currentLeague || 'poe')}-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath)
        return null;
    fs.writeFileSync(res.filePath, (0, csv_1.toCsv)(items, divineRate), 'utf8');
    return res.filePath;
});
electron_1.ipcMain.handle('discord:test', async (_e, webhook) => {
    const sample = (0, sampleItems_1.sampleItems)()[0];
    await (0, discord_1.sendDiscord)(fetch, webhook, (0, discord_1.discordPayload)(sample, 'Test', 180));
});
electron_1.ipcMain.handle('watch:stop', () => {
    watcher?.stop();
    watcher = null;
});
electron_1.ipcMain.handle('watch:start', async (_e, demo) => {
    watcher?.stop();
    const settings = loadSettings();
    const profile = settings.profiles.find((p) => p.id === settings.activeProfileId);
    if (!profile)
        throw new Error('Brak aktywnego profilu – uzupełnij ustawienia.');
    sessionStart = new Date().toISOString();
    if (demo) {
        currentLeague = profile.league === 'auto' ? 'Demo' : profile.league;
        divineRate = 180;
        history = (0, history_1.emptyHistory)();
        items = (0, demo_1.demoItems)();
        history.value = (0, demo_1.demoValue)(items);
        pushState();
        send('status', { text: 'Tryb demo – przykładowe przedmioty, bez połączenia z API' });
        return { league: currentLeague, divineRate };
    }
    const leagues = await ninja.leagues().catch(() => []);
    currentLeague = (0, config_1.resolveLeague)(profile.league, profile.hardcore, leagues);
    const trade = new trade_1.TradeClient(fetch, profile.accountName);
    const engine = new engine_1.PricingEngine(profile, currentLeague, ninja, trade);
    await engine.refreshPrices();
    divineRate = engine.divineRate;
    try {
        engine.setTradeStats(await trade.stats());
    }
    catch (e) {
        send('status', { text: `Nie udało się pobrać statystyk trade: ${e instanceof Error ? e.message : e}`, error: true });
    }
    const store = readJson(itemsFile(currentLeague), { seen: [], items: [] });
    items = store.items;
    history = readJson(historyFile(currentLeague), (0, history_1.emptyHistory)());
    pushState();
    watcher = new watcher_1.StashWatcher(profile, currentLeague, trade, engine, {
        onItems(newItems) {
            divineRate = engine.divineRate ?? divineRate;
            const enriched = enrich(newItems, profile);
            items = [...enriched, ...items].slice(0, 2000);
            (0, history_1.recordValue)(history, items);
            writeJson(itemsFile(currentLeague), { seen: watcher?.seenIds ?? [], items });
            writeJson(historyFile(currentLeague), history);
            pushState();
            for (const it of enriched) {
                if ((it.price.chaos ?? 0) < profile.notifyMinChaos)
                    continue;
                if (electron_1.Notification.isSupported()) {
                    new electron_1.Notification({ title: it.item.name || it.item.typeLine, body: `~${Math.round(it.price.chaos ?? 0)}c · ${it.advice?.label ?? ''}` }).show();
                }
                if (profile.discordWebhook) {
                    (0, discord_1.sendDiscord)(fetch, profile.discordWebhook, (0, discord_1.discordPayload)(it, currentLeague, divineRate)).catch((e) => send('status', { text: `Discord: ${e instanceof Error ? e.message : e}`, error: true }));
                }
            }
        },
        onStatus: (text) => send('status', { text }),
        onError: (text) => send('status', { text, error: true }),
    }, store.seen);
    watcher.start();
    return { league: currentLeague, divineRate };
});
electron_1.app.whenReady().then(() => {
    console.log(DISCLAIMER);
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
