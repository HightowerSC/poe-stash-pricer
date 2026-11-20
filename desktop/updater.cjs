// Program updates from GitHub Releases (electron-updater): check, show version and changes,
// download with progress, install and restart. Errors are explained in plain Polish
// (src/shared/updates.ts). The installers are not code-signed, so on Windows Smart App Control may block
// the installer – the app notices that on the next start and tells the player what to do.

const { app, ipcMain, BrowserWindow, shell, net, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const up = require(path.join(__dirname, '..', 'build', 'shared', 'updates.js'));

const PREFS = () => path.join(app.getPath('userData'), 'updates.json');
const SIX_HOURS = 6 * 60 * 60 * 1000;

function readPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS(), 'utf8')) || {}; } catch { return {}; }
}
function writePrefs(p) {
  try {
    fs.mkdirSync(path.dirname(PREFS()), { recursive: true });
    fs.writeFileSync(PREFS(), JSON.stringify(p, null, 2));
  } catch (e) { console.error('[updates] save failed', e); }
}

/** Why this copy can't update itself, or '' when it can. */
function unsupportedReason() {
  if (!app.isPackaged) return 'Program uruchomiono z kodu źródłowego (npm run app) – aktualizacje działają w wersji zainstalowanej z instalatora.';
  if (process.platform === 'linux' && !process.env.APPIMAGE) return 'Na Linuksie program aktualizuje się sam tylko w wersji AppImage. Pobierz nową wersję ręcznie z GitHuba.';
  if (process.platform !== 'win32' && process.platform !== 'linux') return 'Automatyczne aktualizacje działają na Windows i Linux (AppImage).';
  return '';
}

/** @param {{ beforeInstall?: () => void, onChange?: (s: any) => void }} opts */
function setupUpdater(opts = {}) {
  const prefs = readPrefs();
  const current = app.getVersion();
  const state = {
    status: 'idle',
    current,
    autoDownload: prefs.autoDownload !== false,
    platform: process.platform,
  };

  // Did the last "install and restart" work? Same version after restart = the installer didn't run.
  if (prefs.pendingInstall && prefs.pendingInstall.version) {
    const target = prefs.pendingInstall.version;
    if (up.compareVersions(current, target) >= 0) {
      prefs.justUpdatedFrom = prefs.pendingInstall.from || '';
      prefs.justUpdatedNotes = prefs.pendingInstall.notes || '';
    } else {
      state.status = 'error';
      state.version = target;
      state.error = up.failedInstallError(process.platform, target);
    }
    delete prefs.pendingInstall;
    writePrefs(prefs);
  }
  if (prefs.justUpdatedFrom) {
    state.justUpdatedFrom = prefs.justUpdatedFrom;
    state.notes = prefs.justUpdatedNotes || '';
  }

  const reason = unsupportedReason();
  if (reason && state.status !== 'error') { state.status = 'unsupported'; state.reason = reason; }

  let updater = null;
  function getUpdater() {
    if (updater || reason) return updater;
    try {
      ({ autoUpdater: updater } = require('electron-updater'));
    } catch (e) {
      set({ status: 'unsupported', reason: `Moduł aktualizacji niedostępny: ${e.message}` });
      return null;
    }
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.logger = null;
    updater.on('checking-for-update', () => set({ status: 'checking', error: undefined }));
    updater.on('update-available', (info) => {
      set({ status: 'available', version: info.version, releaseDate: info.releaseDate, notes: up.releaseNotesToText(info.releaseNotes), checkedAt: new Date().toISOString(), progress: undefined });
      if (state.autoDownload) void download();
    });
    updater.on('update-not-available', (info) => set({ status: 'not-available', version: info && info.version, checkedAt: new Date().toISOString() }));
    updater.on('download-progress', (p) => set({ status: 'downloading', progress: { percent: p.percent || 0, transferred: p.transferred || 0, total: p.total || 0, bytesPerSecond: p.bytesPerSecond || 0 } }));
    updater.on('update-downloaded', (info) => {
      set({ status: 'downloaded', version: info.version, notes: up.releaseNotesToText(info.releaseNotes) || state.notes, progress: undefined });
      // It also installs itself when the app is closed; remember it so the next start can tell if that worked.
      rememberPending();
      notify(`Nowa wersja ${info.version} jest gotowa`, 'Otwórz program i kliknij „Zainstaluj i uruchom ponownie” – albo zainstaluje się sama przy zamknięciu.');
    });
    updater.on('error', (e) => {
      const phase = state.status === 'downloading' ? 'download' : 'check';
      set({ status: 'error', error: up.describeUpdateError(e && (e.message || String(e)), process.platform, phase), progress: undefined });
    });
    return updater;
  }

  function set(patch) {
    Object.assign(state, patch);
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete state[k];
    const s = { ...state };
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update:state', s);
    if (opts.onChange) opts.onChange(s);
  }

  function notify(title, body) {
    try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch { /* ignore */ }
  }

  function offline() {
    try { return typeof net.isOnline === 'function' && !net.isOnline(); } catch { return false; }
  }

  async function check(manual) {
    if (reason) { if (manual) set({ status: 'unsupported', reason }); return { ...state }; }
    if (state.status === 'checking' || state.status === 'downloading') return { ...state };
    if (state.status === 'downloaded') return { ...state };
    if (offline()) {
      if (manual) set({ status: 'error', error: up.describeUpdateError('ERR_INTERNET_DISCONNECTED', process.platform) });
      return { ...state };
    }
    const u = getUpdater();
    if (!u) return { ...state };
    set({ status: 'checking', error: undefined });
    try {
      await u.checkForUpdates();
    } catch (e) {
      set({ status: 'error', error: up.describeUpdateError(e && (e.message || String(e)), process.platform, 'check') });
    }
    return { ...state };
  }

  async function download() {
    const u = getUpdater();
    if (!u || state.status === 'downloading' || state.status === 'downloaded') return { ...state };
    if (offline()) { set({ status: 'error', error: up.describeUpdateError('ERR_INTERNET_DISCONNECTED', process.platform, 'download') }); return { ...state }; }
    set({ status: 'downloading', error: undefined, progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 } });
    try {
      await u.downloadUpdate();
    } catch (e) {
      set({ status: 'error', error: up.describeUpdateError(e && (e.message || String(e)), process.platform, 'download'), progress: undefined });
    }
    return { ...state };
  }

  function rememberPending() {
    const p = readPrefs();
    p.pendingInstall = { version: state.version, from: current, notes: state.notes || '', at: new Date().toISOString() };
    writePrefs(p);
  }

  function install() {
    const u = getUpdater();
    if (!u || state.status !== 'downloaded') return;
    rememberPending();
    if (opts.beforeInstall) opts.beforeInstall();
    // Give the windows a moment to close, then run the installer (Windows) / swap the AppImage (Linux).
    setImmediate(() => {
      try {
        u.quitAndInstall(process.platform === 'win32', true);
      } catch (e) {
        const q = readPrefs(); delete q.pendingInstall; writePrefs(q);
        set({ status: 'error', error: up.describeUpdateError(e && (e.message || String(e)), process.platform, 'install') });
      }
    });
  }

  ipcMain.on('desktop:info', (e) => { e.returnValue = { version: current, platform: process.platform }; });
  ipcMain.handle('update:get', () => ({ ...state }));
  ipcMain.handle('update:check', () => check(true));
  ipcMain.handle('update:download', () => download());
  ipcMain.handle('update:install', () => install());
  ipcMain.handle('update:auto', (_e, on) => {
    const p = readPrefs(); p.autoDownload = !!on; writePrefs(p);
    set({ autoDownload: !!on });
    if (on && state.status === 'available') void download();
    return { ...state };
  });
  ipcMain.handle('update:dismiss', () => {
    const p = readPrefs(); delete p.justUpdatedFrom; delete p.justUpdatedNotes; writePrefs(p);
    set({ justUpdatedFrom: undefined });
    return { ...state };
  });
  ipcMain.handle('update:releases', () => shell.openExternal(up.RELEASES_URL));

  // Background checks: shortly after start, then every 6 hours. Errors in the background stay quiet
  // (shown only on the settings screen), so an offline PC never gets pop-ups.
  if (!reason) {
    setTimeout(() => { if (state.status !== 'error') void check(false); }, 8000);
    setInterval(() => { if (state.status === 'idle' || state.status === 'not-available' || state.status === 'error') void check(false); }, SIX_HOURS);
  }

  return { check, state: () => ({ ...state }) };
}

module.exports = { setupUpdater };
