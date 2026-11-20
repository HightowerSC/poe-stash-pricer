import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, PricedItem, Profile } from '../shared/types';
import type { SessionState } from '../shared/api';
import { Sparkline } from './components/Sparkline';
import { ProfileForm } from './components/ProfileForm';
import { Wizard } from './components/Wizard';
import { ItemCard } from './components/ItemCard';
import { ItemDetails } from './components/ItemDetails';
import { StashView } from './components/StashView';
import { CharacterView } from './components/CharacterView';
import { GroupsView } from './components/GroupsView';
import { ChecksView } from './components/ChecksView';
import { ChallengesView } from './components/ChallengesView';
import { MarketView } from './components/MarketView';
import { FarmView } from './components/FarmView';
import type { PriceCheck } from '../shared/types';
import { formatPrice } from './format';
import { isBelowMin } from '../core/config';

type SortKey = 'value' | 'newest';

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PricedItem[]>([]);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: 'Zatrzymane' });
  const [running, setRunning] = useState(false);
  const [league, setLeague] = useState('');
  const [divine, setDivine] = useState<number | null>(null);
  const [selected, setSelected] = useState<PricedItem | null>(null);
  const [sort, setSort] = useState<SortKey>('value');
  const [filter, setFilter] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<PriceCheck[]>([]);
  const [view, setView] = useState<'list' | 'stash' | 'groups' | 'character' | 'check' | 'challenges' | 'market' | 'farm'>(() => {
    try {
      const v = localStorage.getItem('pricer-view');
      return v === 'stash' || v === 'groups' || v === 'character' || v === 'check' || v === 'challenges' || v === 'market' || v === 'farm' ? v : 'list';
    } catch { return 'list'; }
  });
  useEffect(() => {
    try { localStorage.setItem('pricer-view', view); } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    void window.pricer.getSettings().then(setSettings);
    void window.pricer.getItems().then(setItems);
    const offItems = window.pricer.onItems(setItems);
    const offStatus = window.pricer.onStatus(setStatus);
    void window.pricer.getChecks().then(setChecks).catch(() => undefined);
    const offChecks = window.pricer.onChecks((c) => {
      setChecks(c);
      if (c[0]) setSelected({ item: c[0].item, price: c[0].price, advice: c[0].advice, firstSeen: c[0].at });
    });
    void window.pricer.getSession().then(setSession);
    const offSession = window.pricer.onSession((st) => {
      setSession(st);
      if (st.divineRate) setDivine(st.divineRate);
    });
    return () => { offItems(); offStatus(); offSession(); offChecks(); };
  }, []);

  const profile = settings?.profiles.find((p) => p.id === settings.activeProfileId) ?? null;

  const minValue = profile?.minValueChaos ?? 0;
  const hideBelow = profile?.hideBelowMin ?? false;
  const belowCount = items.filter((i) => isBelowMin(i.price.chaos, minValue)).length;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = items
      .filter((i) => !q || `${i.item.name} ${i.item.typeLine}`.toLowerCase().includes(q))
      .filter((i) => !hideBelow || !isBelowMin(i.price.chaos, minValue));
    return [...list].sort((a, b) =>
      sort === 'value' ? (b.price.chaos ?? -1) - (a.price.chaos ?? -1) : b.firstSeen.localeCompare(a.firstSeen),
    );
  }, [items, sort, filter, hideBelow, minValue]);

  const total = items.reduce((s, i) => s + (i.price.chaos ?? 0), 0);
  const currency = profile?.displayCurrency ?? 'chaos';

  /** Changes one setting of the active profile and saves it right away. */
  async function updateProfile(patch: Partial<Profile>) {
    if (!settings || !profile) return;
    const next: AppSettings = { ...settings, profiles: settings.profiles.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)) };
    setSettings(next);
    try {
      await window.pricer.saveSettings(next);
    } catch (e) {
      setStatus({ text: `Nie udało się zapisać ustawień: ${e instanceof Error ? e.message : e}`, error: true });
    }
  }

  async function saveProfile(p: Profile) {
    const others = settings?.profiles.filter((x) => x.id !== p.id) ?? [];
    const next: AppSettings = { activeProfileId: p.id, profiles: [...others, p] };
    try {
      await window.pricer.saveSettings(next);
      setSettings(next);
      setEditing(false);
    } catch (e) {
      alertError(`Nie udało się zapisać ustawień: ${e instanceof Error ? e.message : e}`);
    }
  }

  function alertError(text: string) {
    setStatus({ text, error: true });
    setEditing(false);
  }

  async function start(demo: boolean) {
    setBusy(true);
    setStatus({ text: demo ? 'Wczytuję przykładowe przedmioty…' : 'Uruchamiam – łączę się z poe.ninja i trade…' });
    try {
      const r = await window.pricer.start(demo);
      setLeague(r.league);
      setDivine(r.divineRate);
      setRunning(true);
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function repriceAll() {
    try {
      const r = await window.pricer.reprice();
      setStatus({ text: `Przeliczam ${r.queued} przedmiotów…` });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  async function exportCsv() {
    const file = await window.pricer.exportCsv();
    if (file) {
      setToast(`Zapisano: ${file}`);
      setTimeout(() => setToast(''), 3000);
    }
  }

  async function stop() {
    await window.pricer.stop();
    setRunning(false);
    setStatus({ text: 'Zatrzymane' });
  }

  if (!settings) return <div className="splash">Wczytywanie…</div>;

  if (!profile || editing) {
    return (
      <div className="wizard-page">
        <div className="wizard">
          <h1 className="brand">PoE Stash Pricer</h1>
          <p className="muted">
            {profile ? 'Ustawienia profilu' : 'Pierwsze uruchomienie – kilka prostych kroków.'}
          </p>
          {profile
            ? <ProfileForm initial={profile} onSave={saveProfile} onCancel={() => setEditing(false)} />
            : <Wizard onDone={async (p) => { await saveProfile(p); void start(false); }} />}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {window.pricerReadOnly && <div className="readonly-banner">Podgląd z telefonu – tylko odczyt. Zmiany rób w aplikacji na komputerze.</div>}
      <header className="topbar">
        <div className="brand-row">
          <span className="brand">PoE Stash Pricer</span>
          <span className="chip">{league || (profile.league === 'auto' ? 'liga: auto' : profile.league)}</span>
          <span className="chip subtle">{profile.accountName}</span>
        </div>
        <div className="actions">
          {running ? (
            <button className="btn" onClick={stop}>Zatrzymaj</button>
          ) : (
            <>
              <button className="btn primary" onClick={() => start(false)} disabled={busy}>{busy ? <><span className="spinner" /> Uruchamiam…</> : 'Start'}</button>
              <button className="btn ghost" onClick={() => start(true)} disabled={busy}>Demo</button>
            </>
          )}
          <button className="btn ghost" onClick={repriceAll} disabled={items.length === 0} title="Wycenia ponownie wszystkie przedmioty według aktualnego rynku">↻ Przelicz</button>
          <button className="btn ghost" onClick={exportCsv} disabled={items.length === 0}>⭳ CSV</button>
          <button className="btn ghost" onClick={() => setEditing(true)} aria-label="Ustawienia">⚙ Ustawienia</button>
        </div>
      </header>

      <section className="stats">
        <Stat label="Wartość przedmiotów" value={formatPrice(total, currency, divine)} />
        <Stat label="Sesja: na godzinę" value={session ? formatPrice(session.summary.chaosPerHour, currency, divine) : '—'} />
        <Stat
          label="Najlepszy drop sesji"
          value={session?.summary.best ? formatPrice(session.summary.best.chaos, currency, divine) : '—'}
          hint={session?.summary.best?.name}
        />
        <Stat label="Kurs divine" value={divine ? `${Math.round(divine)}c` : '—'} />
        <div className="stat chart">
          <div className="chart-head">
            <span className="stat-label">Wartość w czasie</span>
            <button className="link" onClick={() => window.pricer.resetSession()}>Nowa sesja</button>
          </div>
          <Sparkline points={session?.value ?? []} height={56} format={(c) => formatPrice(c, currency, divine)} />
        </div>
      </section>
      <div className={`status-line ${status.error ? 'error' : ''}`}>
        <span className={`dot ${running ? 'on' : ''}`} />
        {status.text}
        {session && session.summary.itemCount > 0 && <span className="muted"> · w tej sesji: {session.summary.itemCount} przedm., {formatPrice(session.summary.totalChaos, currency, divine)}</span>}
        {toast && <span className="toast">{toast}</span>}
      </div>

      <section className="toolbar">
        <div className="seg view-switch">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Lista</button>
          <button className={view === 'stash' ? 'on' : ''} onClick={() => setView('stash')}>Zakładki</button>
          <button className={view === 'groups' ? 'on' : ''} onClick={() => setView('groups')}>Kategorie</button>
          <button className={view === 'character' ? 'on' : ''} onClick={() => setView('character')}>Postać</button>
          <button className={view === 'challenges' ? 'on' : ''} onClick={() => setView('challenges')}>Challenge</button>
          <button className={view === 'market' ? 'on' : ''} onClick={() => setView('market')}>Handel</button>
          <button className={view === 'farm' ? 'on' : ''} onClick={() => setView('farm')}>Farma</button>
          <button className={view === 'check' ? 'on' : ''} onClick={() => setView('check')}>Sprawdź (Ctrl+C){checks.length ? ` · ${checks.length}` : ''}</button>
        </div>
        <span className="spacer" />
        <div className="threshold" title="Przedmioty warte mniej niż ta kwota (albo bez ceny) są oznaczane jako tanie">
          <label>
            Minimum
            <input
              type="number"
              min={0}
              step={1}
              value={minValue}
              onChange={(e) => void updateProfile({ minValueChaos: Math.max(0, Number(e.target.value) || 0) })}
            />
            c
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={hideBelow} onChange={(e) => void updateProfile({ hideBelowMin: e.target.checked })} />
            ukryj tanie{belowCount ? ` (${belowCount})` : ''}
          </label>
        </div>
        <input className="search" placeholder="Szukaj…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="seg">
          <button className={sort === 'value' ? 'on' : ''} onClick={() => setSort('value')}>Najdroższe</button>
          <button className={sort === 'newest' ? 'on' : ''} onClick={() => setSort('newest')}>Najnowsze</button>
        </div>
      </section>

      <main className="content">
        {view === 'market' ? (
          <MarketView currency={currency} divine={divine} items={items} />
        ) : view === 'farm' ? (
          <FarmView currency={currency} divine={divine} />
        ) : view === 'challenges' ? (
          <ChallengesView />
        ) : view === 'check' ? (
          <ChecksView checks={checks} currency={currency} divine={divine} minValue={minValue} selectedId={selected?.item.id ?? null} onSelect={setSelected} desktop={navigator.userAgent.includes('Electron')} />
        ) : view === 'character' ? (
          <CharacterView currency={currency} divine={divine} selectedId={selected?.item.id ?? null} onSelect={setSelected} />
        ) : view === 'groups' && visible.length > 0 ? (
          <GroupsView items={visible} currency={currency} divine={divine} minValue={minValue} selectedId={selected?.item.id ?? null} onSelect={setSelected} />
        ) : view === 'stash' && items.length > 0 ? (
          <StashView items={hideBelow ? visible : items} currency={currency} divine={divine} minValue={minValue} selectedId={selected?.item.id ?? null} onSelect={setSelected} />
        ) : visible.length === 0 ? (
          <div className="empty">
            {busy || running ? (
              <>
                <p>{busy ? <><span className="spinner" /> Uruchamiam…</> : 'Na razie brak wycenionych przedmiotów.'}</p>
                <p className={status.error ? 'error-text' : 'muted'}>{status.text}</p>
                {!busy && (
                  <p className="muted small">
                    {profile?.stashSource === 'session'
                      ? <>Skrzynia jest wczytywana z serwera GGG – pierwsze sprawdzenie może potrwać chwilę (każda zakładka to osobne zapytanie).</>
                      : <>Skanowanie skrzyni jest wyłączone. Wyceniaj w grze: najedź na przedmiot i naciśnij <b>Ctrl+C</b> (zakładka „Sprawdź”), albo wpisz POESESSID w ⚙ Ustawieniach.</>}
                  </p>
                )}
              </>
            ) : (
              <>
                <p>Brak przedmiotów.</p>
                <p className="muted">Kliknij <b>Start</b>, aby wczytać skrzynię, albo <b>Demo</b>, aby zobaczyć przykład. W grze możesz też nacisnąć <b>Ctrl+C</b> na przedmiocie.</p>
                {status.error && <p className="error-text">{status.text}</p>}
              </>
            )}
          </div>
        ) : (
          <div className="grid">
            {visible.map((p) => (
              <ItemCard key={p.item.id} data={p} currency={currency} divine={divine} belowMin={isBelowMin(p.price.chaos, minValue)} minValue={minValue} onClick={() => setSelected(p)} active={selected?.item.id === p.item.id} />
            ))}
          </div>
        )}
        {selected && <ItemDetails data={selected} currency={currency} divine={divine} minValue={minValue} onClose={() => setSelected(null)} />}
      </main>

      <footer className="footer">This product isn't affiliated with or endorsed by Grinding Gear Games in any way.</footer>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}{hint ? <span className="stat-hint"> · {hint}</span> : null}</div>
    </div>
  );
}
