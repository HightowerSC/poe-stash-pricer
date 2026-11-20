// PoE Stash Pricer – in-game overlay.
//
// What it does: draws prices on top of the stash grid in a transparent, click-through window.
// What it never does (GGG third-party policy): read the screen, the clipboard, game memory or game files,
// or send any input to the game. Hotkeys only change what the overlay itself shows.
//
// The overlay cannot know which tab is open in the game, so the player picks the tab
// with a hotkey (or from the tray menu). The grid position on screen is set once by calibration.

const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = process.env.POE_PRICER_URL || 'http://127.0.0.1:5317';
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'overlay.json');

// Transparent windows on Linux (X11) need this switch before the app is ready.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

let win = null;
let tray = null;
let state = {
  visible: true,
  calibrating: false,
  tabIndex: 0,
  items: [],
  minValue: 0,
  // Stash grid rectangle in screen pixels, per display size ("2560x1440": {x,y,w,h}).
  grids: {},
};

function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8'));
    state.grids = saved.grids || {};
    state.tabIndex = saved.tabIndex || 0;
  } catch { /* first run */ }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify({ grids: state.grids, tabIndex: state.tabIndex }, null, 2));
}

function displayKey() {
  const d = screen.getPrimaryDisplay();
  return `${d.size.width}x${d.size.height}`;
}

/** Default guess: PoE's stash grid sits on the left, roughly from 1.3% to 34% of the width (16:9). */
function defaultGrid() {
  const d = screen.getPrimaryDisplay().size;
  const size = Math.round(d.height * 0.5);
  return { x: Math.round(d.height * 0.0145), y: Math.round(d.height * 0.112), w: size, h: size };
}

function grid() {
  return state.grids[displayKey()] || defaultGrid();
}

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

function push() {
  if (!win) return;
  const tab = currentTab();
  win.webContents.send('overlay:state', {
    visible: state.visible,
    calibrating: state.calibrating,
    grid: grid(),
    tab: tab ? tab.tab : null,
    tabCount: tabs().length,
    items: tab ? tab.items : [],
    minValue: state.minValue,
  });
  // Click-through unless the player is calibrating.
  win.setIgnoreMouseEvents(!state.calibrating, { forward: true });
  if (state.visible) win.showInactive(); else win.hide();
  updateTray();
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
    push();
  } catch {
    // The main app is not running yet: try again on the next poll.
  }
}

function createWindow() {
  const d = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.size.width,
    height: d.size.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'overlay.html'));
  win.webContents.on('did-finish-load', push);
}

function updateTray() {
  if (!tray) return;
  const t = tabs();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: state.visible ? 'Ukryj overlay (Ctrl+Alt+P)' : 'Pokaż overlay (Ctrl+Alt+P)', click: toggleVisible },
    { label: 'Następna zakładka (Ctrl+Alt+→)', click: () => switchTab(1) },
    { type: 'separator' },
    ...t.map((x, i) => ({ label: `Zakładka: ${x.tab}`, type: 'radio', checked: i === state.tabIndex, click: () => { state.tabIndex = i; saveConfig(); push(); } })),
    { type: 'separator' },
    { label: 'Kalibruj siatkę (Ctrl+Alt+K)', click: toggleCalibration },
    { label: 'Zamknij overlay', click: () => app.quit() },
  ]));
}

function toggleVisible() { state.visible = !state.visible; push(); }
function switchTab(step) { state.tabIndex += step; saveConfig(); push(); }
function toggleCalibration() {
  state.calibrating = !state.calibrating;
  state.visible = true;
  push();
  if (state.calibrating) win.focus();
}

ipcMain.on('overlay:grid', (_e, rect) => {
  if (!rect || !(rect.w > 50 && rect.h > 50)) return;
  state.grids[displayKey()] = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
  saveConfig();
});
ipcMain.on('overlay:calibrated', () => { state.calibrating = false; push(); });
ipcMain.on('overlay:reset-grid', () => { delete state.grids[displayKey()]; saveConfig(); push(); });

app.whenReady().then(() => {
  loadConfig();
  // Linux compositors need a short delay before a transparent window is created.
  setTimeout(() => {
    createWindow();
    tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
    tray.setToolTip('PoE Stash Pricer – overlay');
    updateTray();
    globalShortcut.register('CommandOrControl+Alt+P', toggleVisible);
    globalShortcut.register('CommandOrControl+Alt+Right', () => switchTab(1));
    globalShortcut.register('CommandOrControl+Alt+Left', () => switchTab(-1));
    globalShortcut.register('CommandOrControl+Alt+K', toggleCalibration);
    poll();
    setInterval(poll, 5000);
    console.log('Overlay działa. Ctrl+Alt+P pokaż/ukryj · Ctrl+Alt+←/→ zakładka · Ctrl+Alt+K kalibracja siatki');
  }, process.platform === 'linux' ? 400 : 0);
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// 16×16 gold square, so the tray entry is visible without shipping an image file.
const TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGM4sSzqPyWYYdSAUQNGDRguBgAAZCzHH7UeuH8AAAAASUVORK5CYII=';
