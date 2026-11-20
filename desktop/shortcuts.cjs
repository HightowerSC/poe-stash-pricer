// Global keyboard shortcuts: saved in shortcuts.json (user data folder), registered with Electron,
// changed live from the settings screen. Logic shared with the UI lives in src/shared/shortcuts.ts.

const { app, globalShortcut, ipcMain, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const sc = require(path.join(__dirname, '..', 'build', 'shared', 'shortcuts.js'));

const FILE = () => path.join(app.getPath('userData'), 'shortcuts.json');

/**
 * @param {{ handlers: Record<string, () => void>, getClipWatch: () => boolean, setClipWatch: (on: boolean) => void, onChange?: () => void }} opts
 */
function setupShortcuts(opts) {
  let map = load();
  let paused = false;
  /** @type {Record<string, 'ok'|'off'|'taken'>} */
  let status = {};

  function load() {
    try { return sc.mergeShortcuts(JSON.parse(fs.readFileSync(FILE(), 'utf8'))); } catch { return { ...sc.DEFAULT_SHORTCUTS }; }
  }

  function save() {
    try {
      fs.mkdirSync(path.dirname(FILE()), { recursive: true });
      fs.writeFileSync(FILE(), JSON.stringify(map, null, 2));
    } catch (e) { console.error('[shortcuts] save failed', e); }
  }

  function unregister() {
    for (const acc of Object.values(map)) {
      if (!acc) continue;
      try { if (globalShortcut.isRegistered(acc)) globalShortcut.unregister(acc); } catch { /* bad accelerator */ }
    }
  }

  /** (Re)registers everything; an accelerator another program already holds is reported as 'taken'. */
  function register() {
    status = {};
    for (const { id } of sc.SHORTCUT_ACTIONS) {
      const acc = map[id];
      if (!acc) { status[id] = 'off'; continue; }
      let ok = false;
      try { ok = globalShortcut.register(acc, () => { try { opts.handlers[id] && opts.handlers[id](); } catch (e) { console.error(e); } }); } catch { ok = false; }
      status[id] = ok ? 'ok' : 'taken';
      // While the player is pressing a new combination, only test that it can be registered.
      if (ok && paused) globalShortcut.unregister(acc);
    }
  }

  function state() {
    return {
      map: { ...map },
      status: { ...status },
      clipWatch: opts.getClipWatch(),
      wayland: process.platform === 'linux' && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland'),
    };
  }

  function broadcast() {
    const s = state();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('shortcuts:state', s);
    if (opts.onChange) opts.onChange();
  }

  function replace(next) {
    unregister();
    map = next;
    save();
    register();
    broadcast();
  }

  ipcMain.handle('shortcuts:get', () => state());
  ipcMain.handle('shortcuts:set', (_e, action, accelerator) => {
    if (!sc.SHORTCUT_ACTIONS.some((a) => a.id === action)) return { state: state(), error: 'Nieznana akcja.' };
    const r = sc.applyShortcut(map, action, String(accelerator || ''));
    if (r.error) return { state: state(), error: r.error };
    const previous = map;
    replace(r.map);
    if (status[action] === 'taken') {
      // Another program holds it: keep the old, working shortcut.
      const taken = sc.formatAccelerator(r.map[action]);
      replace(previous);
      return { state: state(), error: `${taken} jest zajęty przez inny program albo system – wybierz inną kombinację.` };
    }
    return { state: state(), warning: r.warning };
  });
  ipcMain.handle('shortcuts:reset', () => { replace({ ...sc.DEFAULT_SHORTCUTS }); return state(); });
  ipcMain.handle('shortcuts:pause', (_e, p) => {
    if (p === paused) return;
    paused = !!p;
    unregister();
    register();
  });
  ipcMain.handle('shortcuts:clipwatch', (_e, on) => { opts.setClipWatch(!!on); broadcast(); return state(); });

  register();

  return {
    /** Text for menus: "Ctrl+Alt+P", or '' when the shortcut is off. */
    label: (id) => (map[id] ? sc.formatAccelerator(map[id]) : ''),
    broadcast,
  };
}

module.exports = { setupShortcuts };
