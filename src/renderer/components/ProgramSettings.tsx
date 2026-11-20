// "Program" screen of the desktop app: rebinding global shortcuts and updating the program.
// Talks to the Electron main process through window.desktop (desktop/main-preload.cjs).

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ShortcutAction, ShortcutState } from '../../shared/shortcuts';
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, formatAccelerator, keyEventToAccelerator } from '../../shared/shortcuts';
import type { UpdateState } from '../../shared/updates';
import { RELEASES_URL, formatBytes } from '../../shared/updates';

export function ProgramSettings({ onClose, focus }: { onClose: () => void; focus?: 'shortcuts' | 'updates' }) {
  const updatesRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (focus === 'updates') updatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  return (
    <div className="wizard-page">
      <div className="wizard program-settings">
        <h1 className="brand">PoE Stash Pricer</h1>
        <p className="muted">Skróty klawiszowe i aktualizacje programu</p>
        {!window.desktop ? (
          <p className="hint">Te ustawienia działają w aplikacji na komputerze (zainstalowanej z instalatora). W przeglądarce skróty w grze i aktualizacje nie są dostępne.</p>
        ) : (
          <>
            <ShortcutsPanel />
            <UpdatesPanel ref={updatesRef} />
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={onClose}>Gotowe</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- shortcuts ----------------

function ShortcutsPanel() {
  const [st, setSt] = useState<ShortcutState | null>(null);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [preview, setPreview] = useState('');
  const [msg, setMsg] = useState<{ action: ShortcutAction | null; text: string; error?: boolean } | null>(null);

  useEffect(() => {
    const d = window.desktop!;
    void d.getShortcuts().then(setSt);
    return d.onShortcuts(setSt);
  }, []);

  // While capturing, global shortcuts are paused so pressing the old combination doesn't trigger it.
  useEffect(() => {
    if (!capturing) return;
    void window.desktop!.pauseShortcuts(true);
    const onKey = (e: KeyboardEvent) => {
      // Typing in the list picker (select, checkboxes) is not a new shortcut.
      if (e.target instanceof Element && e.target.closest('.sc-manual')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keyup') {
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) setPreview('');
        return;
      }
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { setCapturing(null); return; }
      const acc = keyEventToAccelerator(e);
      if (!acc) {
        const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean).join('+');
        setPreview(mods ? `${mods}+…` : '');
        return;
      }
      void save(capturing, acc);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      void window.desktop!.pauseShortcuts(false);
      setPreview('');
    };
  }, [capturing]);

  async function save(action: ShortcutAction, acc: string) {
    const r = await window.desktop!.setShortcut(action, acc);
    setSt(r.state);
    if (r.error) {
      setMsg({ action, text: r.error, error: true });
      // A rejected combination keeps the box open so the player can just press another one.
      return;
    }
    setMsg(r.warning ? { action, text: r.warning } : { action, text: acc ? `Zapisano: ${formatAccelerator(acc)}` : 'Skrót wyłączony.' });
    setCapturing(null);
  }

  async function resetAll() {
    setCapturing(null);
    setSt(await window.desktop!.resetShortcuts());
    setMsg({ action: null, text: 'Przywrócono domyślne skróty.' });
  }

  if (!st) return <fieldset className="program-box"><legend>Skróty klawiszowe</legend><span className="hint">Wczytywanie…</span></fieldset>;

  const changed = SHORTCUT_ACTIONS.some((a) => st.map[a.id] !== DEFAULT_SHORTCUTS[a.id]);

  return (
    <fieldset className="program-box">
      <legend>Skróty klawiszowe</legend>
      <span className="hint">Działają w całym systemie, także w grze. Kliknij „Zmień” i naciśnij nową kombinację (np. Ctrl+Alt+P) – albo wybierz ją z listy pod spodem. Esc – anuluj. Zmiany działają od razu.</span>
      {st.wayland && <span className="hint warn-text">Masz sesję Wayland – część pulpitów ignoruje skróty globalne programów. Jeśli skrót nie działa, wybierz w ekranie logowania sesję „X11” (np. Cinnamon na Linux Mint działa na X11).</span>}

      <div className="shortcut-list">
        <div className="shortcut-row fixed">
          <div className="sc-label">
            <b>Wycena przedmiotu w grze</b>
            <span className="hint">To skrót gry (kopiowanie przedmiotu), więc nie da się go zmienić. Program tylko zauważa skopiowany przedmiot.</span>
          </div>
          <kbd className="sc-key">Ctrl+C</kbd>
          <label className="sc-toggle">
            <input type="checkbox" checked={st.clipWatch} onChange={(e) => void window.desktop!.setClipWatch(e.target.checked).then(setSt)} />
            włączona
          </label>
        </div>

        {SHORTCUT_ACTIONS.map((a) => {
          const acc = st.map[a.id];
          const status = st.status[a.id];
          const isCap = capturing === a.id;
          return (
            <div key={a.id} className={`shortcut-row ${isCap ? 'capturing' : ''}`}>
              <div className="sc-label">
                <b>{a.label}</b>
                {a.hint && <span className="hint">{a.hint}</span>}
                {status === 'taken' && <span className="hint error-text">Ta kombinacja jest zajęta przez inny program albo system – skrót nie działa. Wybierz inną.</span>}
                {msg && msg.action === a.id && <span className={`hint ${msg.error ? 'error-text' : 'warn-text'}`}>{msg.text}</span>}
              </div>
              {isCap
                ? <kbd className="sc-key capture" aria-live="polite">{preview || 'Naciśnij kombinację…'}</kbd>
                : <kbd className={`sc-key ${acc ? '' : 'off'} ${status === 'taken' ? 'bad' : ''}`}>{formatAccelerator(acc)}</kbd>}
              <div className="sc-actions">
                {isCap ? (
                  <button type="button" className="btn ghost small" onClick={() => setCapturing(null)}>Anuluj</button>
                ) : (
                  <>
                    <button type="button" className="btn ghost small" onClick={() => { setMsg(null); setCapturing(a.id); }}>Zmień</button>
                    {acc && <button type="button" className="btn ghost small" onClick={() => void save(a.id, '')}>Wyłącz</button>}
                    {acc !== DEFAULT_SHORTCUTS[a.id] && DEFAULT_SHORTCUTS[a.id] && (
                      <button type="button" className="btn ghost small" title={`Domyślnie: ${formatAccelerator(DEFAULT_SHORTCUTS[a.id])}`} onClick={() => void save(a.id, DEFAULT_SHORTCUTS[a.id])}>Domyślny</button>
                    )}
                  </>
                )}
              </div>
              {isCap && <ManualPicker current={acc} onSave={(v) => void save(a.id, v)} />}
            </div>
          );
        })}
      </div>
      <div className="inline">
        <button type="button" className="btn ghost" disabled={!changed} onClick={() => void resetAll()}>Przywróć wszystkie domyślne</button>
        {msg && msg.action === null && <span className="hint">{msg.text}</span>}
      </div>
    </fieldset>
  );
}

/** Keys offered in the list picker (same names as Electron accelerators). */
const PICK_KEYS: { value: string; label: string }[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map((k) => ({ value: k, label: k })),
  ...Array.from({ length: 12 }, (_, i) => ({ value: `F${i + 1}`, label: `F${i + 1}` })),
  { value: 'Left', label: '← (strzałka w lewo)' }, { value: 'Right', label: '→ (strzałka w prawo)' },
  { value: 'Up', label: '↑ (strzałka w górę)' }, { value: 'Down', label: '↓ (strzałka w dół)' },
  ...Array.from({ length: 10 }, (_, i) => ({ value: `num${i}`, label: `Num ${i} (klawiatura numeryczna)` })),
  { value: 'Home', label: 'Home' }, { value: 'End', label: 'End' }, { value: 'PageUp', label: 'PageUp' }, { value: 'PageDown', label: 'PageDown' },
  { value: 'Insert', label: 'Insert' }, { value: 'Delete', label: 'Delete' }, { value: 'Space', label: 'Spacja' },
];

/**
 * Second way to set a shortcut: tick Ctrl/Alt/Shift and pick the key from a list.
 * Works even when the system or another program swallows the key press before the app sees it.
 */
function ManualPicker({ current, onSave }: { current: string; onSave: (acc: string) => void }) {
  const parts = (current || 'CommandOrControl+Alt+P').split('+');
  const [ctrl, setCtrl] = useState(parts.includes('CommandOrControl'));
  const [alt, setAlt] = useState(parts.includes('Alt'));
  const [shift, setShift] = useState(parts.includes('Shift'));
  const last = parts[parts.length - 1];
  const [key, setKey] = useState(PICK_KEYS.some((k) => k.value === last) ? last : 'P');
  const acc = [ctrl && 'CommandOrControl', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+');
  return (
    <div className="sc-manual">
      <span className="hint">albo wybierz:</span>
      <label className="sc-toggle"><input type="checkbox" checked={ctrl} onChange={(e) => setCtrl(e.target.checked)} />Ctrl</label>
      <label className="sc-toggle"><input type="checkbox" checked={alt} onChange={(e) => setAlt(e.target.checked)} />Alt</label>
      <label className="sc-toggle"><input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} />Shift</label>
      <span>+</span>
      <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Klawisz">
        {PICK_KEYS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <button type="button" className="btn primary small" onClick={() => onSave(acc)}>Zapisz {formatAccelerator(acc)}</button>
    </div>
  );
}

// ---------------- updates ----------------

const UpdatesPanel = forwardRef<HTMLFieldSetElement>(function UpdatesPanel(_props, ref) {
  const u = useUpdateState();
  const d = window.desktop!;
  if (!u) return null;

  const busy = u.status === 'checking' || u.status === 'downloading';
  const pct = Math.max(0, Math.min(100, Math.round(u.progress?.percent ?? 0)));

  return (
    <fieldset className="program-box" ref={ref}>
      <legend>Aktualizacje programu</legend>
      <div className="update-head">
        <span>Twoja wersja: <b>{u.current}</b></span>
        {u.checkedAt && <span className="hint">sprawdzono {new Date(u.checkedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {u.justUpdatedFrom && (
        <div className="update-box ok">
          <b>Zaktualizowano z wersji {u.justUpdatedFrom} do {u.current}.</b>
          {u.notes && u.status !== 'available' && u.status !== 'downloading' && u.status !== 'downloaded' && <Notes text={u.notes} />}
          <div><button type="button" className="btn ghost small" onClick={() => void d.dismissUpdated()}>OK</button></div>
        </div>
      )}

      {u.status === 'unsupported' && <div className="update-box"><span>{u.reason}</span><ManualLink /></div>}

      {u.status === 'checking' && <div className="update-box"><span><span className="spinner" /> Sprawdzam, czy jest nowa wersja…</span></div>}

      {u.status === 'not-available' && <div className="update-box ok"><span>✓ Masz najnowszą wersję.</span></div>}

      {(u.status === 'available' || u.status === 'downloading' || u.status === 'downloaded') && (
        <div className="update-box new">
          <b>Nowa wersja: {u.version}</b>
          {u.releaseDate && <span className="hint">wydana {new Date(u.releaseDate).toLocaleDateString('pl-PL')}</span>}
          {u.notes ? <Notes text={u.notes} /> : <span className="hint">Lista zmian: <a href={RELEASES_URL} target="_blank" rel="noreferrer">na GitHubie</a></span>}
          {u.status === 'downloading' && (
            <div className="progress-wrap" aria-label={`Pobieranie ${pct}%`}>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <span className="hint">
                Pobieranie: {pct}%{u.progress && u.progress.total > 0 ? ` · ${formatBytes(u.progress.transferred)} z ${formatBytes(u.progress.total)}` : ''}
                {u.progress && u.progress.bytesPerSecond > 0 ? ` · ${formatBytes(u.progress.bytesPerSecond)}/s` : ''}
              </span>
            </div>
          )}
          {u.status === 'available' && <div><button type="button" className="btn primary" onClick={() => void d.downloadUpdate()}>Pobierz aktualizację</button></div>}
          {u.status === 'downloaded' && (
            <>
              <div><button type="button" className="btn primary" onClick={() => void d.installUpdate()}>Zainstaluj i uruchom ponownie</button></div>
              <span className="hint">
                Program zamknie się na kilka sekund i włączy w nowej wersji. Ustawienia i ceny zostają. Jeśli wolisz później – zainstaluje się sam przy zamknięciu programu.
                {u.platform === 'win32' && ' Jeśli po zamknięciu program się nie włączy, Windows mógł zablokować instalator (Inteligentna kontrola aplikacji) – uruchom program ponownie, a podpowie, co zrobić.'}
              </span>
            </>
          )}
        </div>
      )}

      {u.status === 'error' && u.error && (
        <div className="update-box bad">
          <b>{u.error.title}</b>
          <span>{u.error.detail}</span>
          <span className="hint">{u.error.hint}</span>
          <div className="inline">
            <button type="button" className="btn ghost" onClick={() => void d.checkUpdate()}>Spróbuj ponownie</button>
            {u.error.manual && <button type="button" className="btn ghost" onClick={() => void d.openReleases()}>Pobierz instalator ręcznie</button>}
          </div>
          {u.error.raw && u.error.raw !== u.error.detail && <details className="hint"><summary>Szczegóły techniczne</summary><code>{u.error.raw}</code></details>}
        </div>
      )}

      <div className="inline">
        <button type="button" className="btn" disabled={busy || u.status === 'unsupported' || u.status === 'downloaded'} onClick={() => void d.checkUpdate()}>
          {u.status === 'checking' ? <><span className="spinner" /> Sprawdzam…</> : 'Sprawdź aktualizacje'}
        </button>
        {u.status !== 'unsupported' && (
          <label className="sc-toggle">
            <input type="checkbox" checked={u.autoDownload} onChange={(e) => void d.setAutoDownload(e.target.checked)} />
            Pobieraj nowe wersje automatycznie
          </label>
        )}
      </div>
    </fieldset>
  );
});

function Notes({ text }: { text: string }) {
  return (
    <details className="update-notes" open={text.length < 600}>
      <summary>Co nowego</summary>
      <div className="update-notes-text">{text}</div>
    </details>
  );
}

function ManualLink() {
  return <div><button type="button" className="btn ghost small" onClick={() => void window.desktop!.openReleases()}>Otwórz stronę z wersjami</button></div>;
}

/** Live update state from the main process (null outside the desktop app). */
export function useUpdateState(): UpdateState | null {
  const [u, setU] = useState<UpdateState | null>(null);
  useEffect(() => {
    const d = window.desktop;
    if (!d) return;
    void d.getUpdate().then(setU);
    return d.onUpdate(setU);
  }, []);
  return u;
}

/** Top bar: current version, or a highlighted button when a new version is waiting. */
export function UpdateBadge({ onOpen }: { onOpen: (focus: 'shortcuts' | 'updates') => void }) {
  const u = useUpdateState();
  if (!window.desktop) return null;
  const v = u?.current ?? window.desktop.version;
  let label = `v${v}`;
  let cls = 'btn ghost';
  let title = 'Sprawdź aktualizacje';
  if (u?.status === 'available') { label = `⬆ Nowa wersja ${u.version}`; cls = 'btn update-ready'; title = 'Kliknij, aby zobaczyć zmiany i zaktualizować'; }
  else if (u?.status === 'downloading') { label = `⬇ ${Math.round(u.progress?.percent ?? 0)}%`; cls = 'btn update-ready'; title = `Pobieranie wersji ${u.version}`; }
  else if (u?.status === 'downloaded') { label = `⬆ Zainstaluj ${u.version}`; cls = 'btn update-ready'; title = 'Nowa wersja jest pobrana'; }
  else if (u?.status === 'error' && u.error?.title.includes('nie zainstalowała')) { label = '⚠ Aktualizacja'; cls = 'btn ghost danger'; title = u.error.title; }
  return (
    <>
      <button className="btn ghost" onClick={() => onOpen('shortcuts')} title="Zmień skróty klawiszowe">⌨ Skróty</button>
      <button className={cls} onClick={() => onOpen('updates')} title={title}>{label}</button>
    </>
  );
}
