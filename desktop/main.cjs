// PoE Stash Pricer – desktop app (Windows and Linux, same code).
// One program instead of terminal commands: it starts the local pricing server, shows the app in its
// own window and draws the optional in-game overlay. Installers are built by GitHub Actions
// (Windows .exe, Linux AppImage) and update themselves from GitHub Releases.
//
// GGG third-party policy: the app never reads the screen, game memory or game files and never sends
// input to the game. The player copies an item with the game's own Ctrl+C; the app notices copied PoE
// item text in the clipboard and prices it (everything else in the clipboard is ignored). Can be turned off in the tray.

const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, Tray, Menu, nativeImage, dialog, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 5317);
const SERVER = `http://127.0.0.1:${PORT}`;
const ICON = path.join(__dirname, 'icon.png');

if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
// Windows shows system notifications only for an app with an id (same as appId in package.json).
if (process.platform === 'win32') app.setAppUserModelId('com.hightowersc.poestashpricer');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());
}

let main = null;
let overlay = null;
let tray = null;
const state = { overlayOn: false, calibrating: false, tabIndex: 0, items: [], minValue: 0, grids: {}, clipWatch: true, popup: null, notifyMode: null };
const CONFIG = () => path.join(app.getPath('userData'), 'overlay.json');

// ---------- server ----------

function startServer() {
  process.env.PRICER_EMBEDDED = '1';
  process.env.PORT = String(PORT);
  require(path.join(__dirname, '..', 'build', 'server', 'server.js'));
}

async function waitForServer(ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${SERVER}/api/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ---------- main window ----------

function createMain() {
  main = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'PoE Stash Pricer',
    backgroundColor: '#14120f',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  main.removeMenu();
  // Links to trade, poedb, profiles… open in the normal browser.
  main.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(SERVER)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  main.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SERVER) && !url.startsWith(`http://localhost:${PORT}`)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  main.loadURL(`http://localhost:${PORT}`);
  main.on('closed', () => { main = null; app.quit(); });
}

function showMain() {
  if (!main) return;
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
}

// ---------- overlay ----------

function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG(), 'utf8'));
    state.grids = saved.grids || {};
    state.tabIndex = saved.tabIndex || 0;
    state.overlayOn = !!saved.overlayOn;
    state.clipWatch = saved.clipWatch !== false;
  } catch { /* first run */ }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG()), { recursive: true });
  fs.writeFileSync(CONFIG(), JSON.stringify({ grids: state.grids, tabIndex: state.tabIndex, overlayOn: state.overlayOn, clipWatch: state.clipWatch }, null, 2));
}

const displayKey = () => { const d = screen.getPrimaryDisplay(); return `${d.size.width}x${d.size.height}`; };

/** First guess for the stash grid: left side of a 16:9 screen; the player fixes it once with calibration. */
function defaultGrid() {
  const d = screen.getPrimaryDisplay().size;
  const size = Math.round(d.height * 0.5);
  return { x: Math.round(d.height * 0.0145), y: Math.round(d.height * 0.112), w: size, h: size };
}

const grid = () => state.grids[displayKey()] || defaultGrid();

function tabs() {
  const byTab = new Map();
  for (const p of state.items) {
    if (!p.location || p.present === false) continue;
    if (!byTab.has(p.location.tab)) byTab.set(p.location.tab, []);
    byTab.get(p.location.tab).push(p);
  }
  return [...byTab.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pl')).map(([tab, items]) => ({ tab, items }));
}

function currentTab() {
  const t = tabs();
  if (t.length === 0) return null;
  state.tabIndex = ((state.tabIndex % t.length) + t.length) % t.length;
  return t[state.tabIndex];
}

function createOverlay() {
  const d = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.size.width, height: d.size.height,
    transparent: true, frame: false, resizable: false, movable: false, focusable: true,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.webContents.on('did-finish-load', pushOverlay);
  overlay.on('closed', () => { overlay = null; });
}

function pushOverlay() {
  if ((state.overlayOn || state.popup) && !overlay) { createOverlay(); return; } // did-finish-load pushes again
  if (!overlay) return updateTray();
  const tab = currentTab();
  overlay.webContents.send('overlay:state', {
    visible: state.overlayOn, calibrating: state.calibrating, grid: grid(),
    tab: tab ? tab.tab : null, tabCount: tabs().length, items: tab ? tab.items : [], minValue: state.minValue,
    popup: state.popup,
  });
  overlay.setIgnoreMouseEvents(!state.calibrating, { forward: true });
  if (state.overlayOn || state.popup) overlay.showInactive(); else overlay.hide();
  updateTray();
}

// ---------- price check: Ctrl+C on an item in game ----------
// The game itself copies the item text with Ctrl+C. The app only looks at the clipboard to notice a copied
// PoE item (text starting with "Item Class:"/"Rarity:"); anything else is ignored and never stored or sent.

let lastClip = '';
let popupTimer = null;
const looksLikeItem = (t) => /^(Item Class: .+\r?\n)?Rarity: .+/m.test(t) && t.includes('--------');

function fmtChaos(c, divine) {
  if (c == null) return 'brak ceny';
  if (divine && c >= divine) return `${(c / divine).toFixed(c >= divine * 10 ? 0 : 1)} div (${Math.round(c)}c)`;
  return `${c >= 10 ? Math.round(c) : c.toFixed(1)}c`;
}

function showPopup(popup, ms = 9000) {
  const p = screen.getCursorScreenPoint();
  const d = screen.getPrimaryDisplay().bounds;
  state.popup = { ...popup, x: p.x - d.x, y: p.y - d.y };
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => { state.popup = null; pushOverlay(); }, ms);
  pushOverlay();
}

async function priceClipboard(text) {
  if (process.env.PRICER_DEBUG) console.log('[clip] pricing');
  showPopup({ title: 'Wyceniam…', price: '', note: '', loading: true }, 30000);
  try {
    const res = await fetch(`${SERVER}/api/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
    const session = await fetch(`${SERVER}/api/session`).then((r) => r.json()).catch(() => ({}));
    const divine = session && session.divineRate;
    const pr = data.price || {};
    const title = data.item.name ? `${data.item.name} · ${data.item.typeLine}` : data.item.typeLine;
    showPopup({
      title,
      price: fmtChaos(pr.chaos, divine) + (pr.lowerBound && pr.chaos != null ? '+' : ''),
      range: pr.low != null && pr.high != null && pr.low !== pr.high ? `${fmtChaos(pr.low, divine)} – ${fmtChaos(pr.high, divine)}` : '',
      confidence: pr.confidence,
      special: (pr.specialMods || []).join(', '),
      advice: data.advice ? data.advice.label : '',
      note: pr.note || '',
    });
  } catch (e) {
    showPopup({ title: 'Nie udało się wycenić', price: '', note: e.message, error: true });
  }
}

// Linux: reading the X11/Wayland clipboard synchronously can stall the whole app when the clipboard owner
// is slow, so we use a small system tool asynchronously when one is installed (xclip, xsel or wl-paste).
const { execFile } = require('node:child_process');

function findTool() {
  if (process.platform !== 'linux') return null;
  const dirs = (process.env.PATH || '/usr/bin:/bin').split(':');
  const has = (name) => dirs.some((d) => { try { return fs.statSync(path.join(d, name)).isFile(); } catch { return false; } });
  if (process.env.WAYLAND_DISPLAY && has('wl-paste')) return ['wl-paste', ['--no-newline', '--type', 'text']];
  if (has('xclip')) return ['xclip', ['-o', '-selection', 'clipboard']];
  if (has('xsel')) return ['xsel', ['--clipboard', '--output']];
  return null;
}

function readClipboard(tool) {
  if (!tool) {
    try { return Promise.resolve(clipboard.readText()); } catch { return Promise.resolve(''); }
  }
  return new Promise((resolve) => {
    execFile(tool[0], tool[1], { timeout: 1500, maxBuffer: 1024 * 1024 }, (err, out) => resolve(err ? '' : String(out)));
  });
}

async function priceClipboardNow() {
  const t = await readClipboard(findTool());
  if (t && looksLikeItem(t)) await priceClipboard(t);
  else showPopup({ title: 'W schowku nie ma przedmiotu', price: '', note: 'Najedź w grze na przedmiot i naciśnij Ctrl+C.', error: true }, 4000);
}

function watchClipboard() {
  const tool = findTool();
  let busy = false;
  void readClipboard(tool).then((t) => { lastClip = t; });
  setInterval(async () => {
    if (!state.clipWatch || busy) return;
    busy = true;
    try {
      const t = await readClipboard(tool);
      if (t === lastClip) return;
      lastClip = t;
      if (process.env.PRICER_DEBUG) console.log('[clip] changed', looksLikeItem(t));
      if (t && looksLikeItem(t)) void priceClipboard(t);
    } finally {
      busy = false;
    }
  }, 400);
}

async function poll() {
  try {
    const [items, settings] = await Promise.all([
      fetch(`${SERVER}/api/items`).then((r) => r.json()),
      fetch(`${SERVER}/api/settings`).then((r) => r.json()),
    ]);
    state.items = Array.isArray(items) ? items : [];
    const profile = (settings.profiles || []).find((p) => p.id === settings.activeProfileId);
    state.minValue = profile ? Number(profile.minValueChaos) || 0 : 0;
    state.notifyMode = profile ? profile.notifyMode || 'valuable' : null;
    pushOverlay();
  } catch { /* server still starting */ }
}

/** Tray shortcut for the same setting as in ⚙ Ustawienia → Powiadomienia (saved in the active profile). */
async function setNotifyMode(mode) {
  try {
    const settings = await fetch(`${SERVER}/api/settings`).then((r) => r.json());
    const profile = (settings.profiles || []).find((p) => p.id === settings.activeProfileId);
    if (!profile) return;
    profile.notifyMode = mode;
    await fetch(`${SERVER}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    state.notifyMode = mode;
    updateTray();
  } catch { /* server not ready */ }
}

function toggleOverlay() { state.overlayOn = !state.overlayOn; state.calibrating = false; saveConfig(); pushOverlay(); }
function switchTab(step) { state.tabIndex += step; saveConfig(); pushOverlay(); }
function toggleCalibration() {
  state.calibrating = !state.calibrating;
  state.overlayOn = true;
  saveConfig();
  pushOverlay();
  if (state.calibrating && overlay) overlay.focus();
}

ipcMain.on('overlay:grid', (_e, rect) => {
  if (!rect || !(rect.w > 50 && rect.h > 50)) return;
  state.grids[displayKey()] = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
  saveConfig();
});
ipcMain.on('overlay:calibrated', () => { state.calibrating = false; pushOverlay(); });
ipcMain.on('overlay:reset-grid', () => { delete state.grids[displayKey()]; saveConfig(); pushOverlay(); });

// ---------- tray ----------

function updateTray() {
  if (!tray) return;
  const t = tabs();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pokaż aplikację', click: showMain },
    { type: 'separator' },
    { label: 'Wyceń schowek teraz (Ctrl+Alt+D)', click: () => void priceClipboardNow() },
    { label: 'Wycena po Ctrl+C w grze', type: 'checkbox', checked: state.clipWatch, click: () => { state.clipWatch = !state.clipWatch; saveConfig(); updateTray(); } },
    { label: 'Ceny na skrzyni w grze (Ctrl+Alt+P)', type: 'checkbox', checked: state.overlayOn, click: toggleOverlay },
    { label: 'Kalibruj siatkę skrzynki (Ctrl+Alt+K)', click: toggleCalibration },
    { label: 'Następna zakładka (Ctrl+Alt+→)', click: () => switchTab(1), enabled: t.length > 1 },
    ...t.map((x, i) => ({ label: `Zakładka: ${x.tab}`, type: 'radio', checked: i === state.tabIndex, click: () => { state.tabIndex = i; saveConfig(); pushOverlay(); } })),
    { type: 'separator' },
    {
      label: 'Powiadomienia',
      enabled: state.notifyMode !== null,
      submenu: [
        { label: 'Wyłączone', type: 'radio', checked: state.notifyMode === 'off', click: () => void setNotifyMode('off') },
        { label: 'Tylko wartościowe przedmioty', type: 'radio', checked: state.notifyMode === 'valuable', click: () => void setNotifyMode('valuable') },
        { label: 'Wszystkie', type: 'radio', checked: state.notifyMode === 'all', click: () => void setNotifyMode('all') },
      ],
    },
    { type: 'separator' },
    { label: 'Sprawdź aktualizacje', click: () => checkUpdates(true) },
    { label: 'Zamknij', click: () => app.quit() },
  ]));
}

// ---------- updates ----------

function checkUpdates(manual) {
  if (!app.isPackaged) {
    if (manual) void dialog.showMessageBox({ message: 'Aktualizacje działają w wersji zainstalowanej z instalatora.' });
    return;
  }
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    if (manual) {
      autoUpdater.once('update-not-available', () => void dialog.showMessageBox({ message: 'Masz najnowszą wersję.' }));
      autoUpdater.once('error', (e) => void dialog.showMessageBox({ type: 'warning', message: `Nie udało się sprawdzić aktualizacji: ${e.message}` }));
    }
    autoUpdater.once('update-downloaded', async (info) => {
      const r = await dialog.showMessageBox({ message: `Nowa wersja ${info.version} jest gotowa.`, detail: 'Zainstalować teraz? Aplikacja uruchomi się ponownie.', buttons: ['Zainstaluj teraz', 'Przy następnym uruchomieniu'], defaultId: 0 });
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
    void autoUpdater.checkForUpdates();
  } catch (e) {
    if (manual) void dialog.showMessageBox({ type: 'warning', message: `Aktualizacje niedostępne: ${e.message}` });
  }
}

// ---------- start ----------

app.whenReady().then(async () => {
  loadConfig();
  startServer();
  if (!(await waitForServer())) {
    dialog.showErrorBox('PoE Stash Pricer', `Nie udało się uruchomić serwera aplikacji na porcie ${PORT}. Zamknij inne kopie programu i spróbuj ponownie.`);
    app.quit();
    return;
  }
  createMain();
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('PoE Stash Pricer');
  tray.on('click', showMain);
  updateTray();
  globalShortcut.register('CommandOrControl+Alt+P', toggleOverlay);
  globalShortcut.register('CommandOrControl+Alt+Right', () => switchTab(1));
  globalShortcut.register('CommandOrControl+Alt+Left', () => switchTab(-1));
  globalShortcut.register('CommandOrControl+Alt+K', toggleCalibration);
  // Price what is in the clipboard now (for when automatic Ctrl+C pricing is turned off).
  globalShortcut.register('CommandOrControl+Alt+D', () => void priceClipboardNow());
  // Linux compositors need a moment before a transparent window can be created.
  setTimeout(() => { void poll(); setInterval(poll, 5000); }, process.platform === 'linux' ? 500 : 0);
  setTimeout(() => checkUpdates(false), 5000);
  watchClipboard();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

