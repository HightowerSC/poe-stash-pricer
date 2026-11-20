// Global keyboard shortcuts of the desktop app: the list of actions, defaults, turning a pressed key
// combination into an Electron accelerator, and checks (conflicts, keys that would break typing in game).
// Used by the main process (desktop/main.cjs, via build/shared/shortcuts.js) and by the settings screen.

export type ShortcutAction = 'overlay' | 'calibrate' | 'nextTab' | 'prevTab' | 'priceNow' | 'showApp';

/** Action → Electron accelerator ("CommandOrControl+Alt+P"); empty string = shortcut turned off. */
export type ShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_ACTIONS: { id: ShortcutAction; label: string; hint: string }[] = [
  { id: 'overlay', label: 'Ceny na skrzyni w grze (włącz / wyłącz)', hint: 'Pokazuje ceny nad otwartą skrzynią.' },
  { id: 'nextTab', label: 'Następna zakładka skrzyni', hint: 'Którą zakładkę pokazuje nakładka.' },
  { id: 'prevTab', label: 'Poprzednia zakładka skrzyni', hint: '' },
  { id: 'calibrate', label: 'Kalibracja siatki skrzyni', hint: 'Dopasowanie ramki do skrzyni w grze.' },
  { id: 'priceNow', label: 'Wyceń przedmiot ze schowka teraz', hint: 'Przydaje się, gdy automatyczna wycena po Ctrl+C jest wyłączona.' },
  { id: 'showApp', label: 'Pokaż okno programu', hint: 'Domyślnie wyłączony.' },
];

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  overlay: 'CommandOrControl+Alt+P',
  nextTab: 'CommandOrControl+Alt+Right',
  prevTab: 'CommandOrControl+Alt+Left',
  calibrate: 'CommandOrControl+Alt+K',
  priceNow: 'CommandOrControl+Alt+D',
  showApp: '',
};

const MODIFIERS = ['CommandOrControl', 'Alt', 'Shift', 'Super'] as const;
type Modifier = (typeof MODIFIERS)[number];

/** Minimal shape of a browser KeyboardEvent, so this works in tests too. */
export interface KeyLike { code: string; key?: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }

const NAMED_CODES: Record<string, string> = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Escape: 'Escape',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
  PrintScreen: 'PrintScreen', Pause: 'Pause', ScrollLock: 'Scrolllock',
};

/**
 * Turns a physical key (KeyboardEvent.code) into the key part of an accelerator.
 * The physical key is used on purpose: on a Polish keyboard Alt/AltGr changes the typed character (ą, ś…),
 * but the key is still the same. Returns null for modifier keys alone and keys we can't bind.
 */
export function codeToKey(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return `num${m[1]}`;
  m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (m) return `F${m[1]}`;
  return NAMED_CODES[code] ?? null;
}

/** Key press → accelerator, or null while only modifiers are held (the capture box keeps waiting). */
export function keyEventToAccelerator(e: KeyLike): string | null {
  const key = codeToKey(e.code);
  if (!key) return null;
  const mods: Modifier[] = [];
  if (e.ctrlKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  return [...mods, key].join('+');
}

/** Same combination written the same way (order of modifiers, Ctrl/CommandOrControl, case). */
export function normalizeAccelerator(acc: string): string {
  if (!acc || !acc.trim()) return '';
  const parts = acc.split('+').map((p) => p.trim()).filter(Boolean);
  const mods = new Set<Modifier>();
  let key = '';
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'ctrl' || l === 'control' || l === 'commandorcontrol' || l === 'cmdorctrl' || l === 'command' || l === 'cmd') mods.add('CommandOrControl');
    else if (l === 'alt' || l === 'option' || l === 'altgr') mods.add('Alt');
    else if (l === 'shift') mods.add('Shift');
    else if (l === 'super' || l === 'meta' || l === 'win') mods.add('Super');
    else key = p.length === 1 ? p.toUpperCase() : p;
  }
  return [...MODIFIERS.filter((m) => mods.has(m)), key].filter(Boolean).join('+');
}

/** Human-readable form for the screen: "Ctrl+Alt+→". */
export function formatAccelerator(acc: string): string {
  if (!acc) return 'wyłączony';
  const nice: Record<string, string> = { CommandOrControl: 'Ctrl', Super: 'Win', Left: '←', Right: '→', Up: '↑', Down: '↓', Space: 'Spacja', Escape: 'Esc', Delete: 'Del' };
  return normalizeAccelerator(acc).split('+').map((p) => nice[p] ?? (p.startsWith('num') ? `Num ${p.slice(3)}` : p)).join('+');
}

export interface ShortcutCheck { error?: string; warning?: string }

/** Polish letters typed with AltGr (= Ctrl+Alt on Windows): ą ć ę ł ń ó ś ż ź. */
const POLISH_ALTGR = new Set(['A', 'C', 'E', 'L', 'N', 'O', 'S', 'Z', 'X']);

/** Checks one combination: is it allowed, and is it a bad idea (e.g. steals a Polish letter). */
export function checkAccelerator(acc: string): ShortcutCheck {
  const a = normalizeAccelerator(acc);
  if (!a) return {};
  const parts = a.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key || MODIFIERS.includes(key as Modifier)) return { error: 'Dodaj zwykły klawisz do modyfikatora (np. Ctrl+Alt+P).' };
  const isF = /^F\d+$/.test(key);
  if (mods.length === 0 && !isF) return { error: 'Sam klawisz bez Ctrl/Alt/Shift zablokowałby pisanie w grze. Użyj np. Ctrl+Alt+…, albo klawisza F1–F24.' };
  if (mods.length === 1 && mods[0] === 'Shift' && !isF) return { error: 'Shift+klawisz to po prostu wielka litera – dodaj Ctrl albo Alt.' };
  if (a === 'CommandOrControl+C' || a === 'CommandOrControl+Alt+C') return { error: 'Tym skrótem gra kopiuje przedmiot – program musi go zostawić grze.' };
  if (a === 'CommandOrControl+V' || a === 'CommandOrControl+X' || a === 'CommandOrControl+A' || a === 'CommandOrControl+Z') return { error: 'To skrót kopiuj/wklej/cofnij – zablokowałby go we wszystkich programach.' };
  if (a === 'Alt+F4' || a === 'Alt+Tab' || a === 'CommandOrControl+Alt+Delete') return { error: 'Tego skrótu używa system – nie da się go przejąć.' };
  if (key === 'Escape' || key === 'Enter' || key === 'Tab' || key === 'Backspace') {
    if (mods.length === 0 || (mods.length === 1 && mods[0] === 'Shift')) return { error: 'Ten klawisz jest potrzebny w grze (czat, okna).' };
  }
  if (mods.includes('CommandOrControl') && mods.includes('Alt') && !mods.includes('Shift') && POLISH_ALTGR.has(key)) {
    return { warning: 'Ctrl+Alt+' + key + ' to na polskiej klawiaturze polska litera (AltGr) – nie wpiszesz jej wtedy na czacie ani w innych programach.' };
  }
  if (isF && mods.length === 0) return { warning: 'Sprawdź, czy gra nie używa tego klawisza (F1–F12 bywają zajęte).' };
  return {};
}

/** Which actions share the same combination: action → names of the other actions using it. */
export function findConflicts(map: Partial<ShortcutMap>): Partial<Record<ShortcutAction, ShortcutAction[]>> {
  const byAcc = new Map<string, ShortcutAction[]>();
  for (const [action, acc] of Object.entries(map) as [ShortcutAction, string][]) {
    const n = normalizeAccelerator(acc);
    if (!n) continue;
    byAcc.set(n, [...(byAcc.get(n) ?? []), action]);
  }
  const out: Partial<Record<ShortcutAction, ShortcutAction[]>> = {};
  for (const actions of byAcc.values()) {
    if (actions.length < 2) continue;
    for (const a of actions) out[a] = actions.filter((x) => x !== a);
  }
  return out;
}

/** Saved file → full map. Unknown actions are dropped, missing ones get the default, bad entries are reset. */
export function mergeShortcuts(saved: unknown): ShortcutMap {
  const out: ShortcutMap = { ...DEFAULT_SHORTCUTS };
  if (!saved || typeof saved !== 'object') return out;
  for (const { id } of SHORTCUT_ACTIONS) {
    const v = (saved as Record<string, unknown>)[id];
    if (typeof v !== 'string') continue;
    const n = normalizeAccelerator(v);
    if (!checkAccelerator(n).error) out[id] = n;
  }
  // Two actions on one combination can't both be registered: the later one falls back to "off".
  const seen = new Set<string>();
  for (const { id } of SHORTCUT_ACTIONS) {
    if (!out[id]) continue;
    if (seen.has(out[id])) out[id] = '';
    else seen.add(out[id]);
  }
  return out;
}

/** Result of trying to set one shortcut: the new map, or a reason why not. */
export function applyShortcut(map: ShortcutMap, action: ShortcutAction, acc: string): { map: ShortcutMap; error?: string; warning?: string } {
  const n = normalizeAccelerator(acc);
  const check = checkAccelerator(n);
  if (check.error) return { map, error: check.error };
  if (n) {
    const other = SHORTCUT_ACTIONS.find((a) => a.id !== action && normalizeAccelerator(map[a.id]) === n);
    if (other) return { map, error: `${formatAccelerator(n)} jest już przypisany do: „${other.label}”. Najpierw zmień tamten skrót.` };
  }
  return { map: { ...map, [action]: n }, warning: check.warning };
}

/** Per action: registered fine, turned off, or taken by another program / not supported by the system. */
export type ShortcutStatus = 'ok' | 'off' | 'taken';

export interface ShortcutState {
  map: ShortcutMap;
  status: Record<ShortcutAction, ShortcutStatus>;
  /** Automatic pricing after Ctrl+C in game (clipboard watch). */
  clipWatch: boolean;
  /** Linux Wayland sessions often ignore global shortcuts – shown as a hint. */
  wayland: boolean;
}
