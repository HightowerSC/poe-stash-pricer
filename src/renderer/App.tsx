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
import { ProgramSettings, UpdateBadge } from './components/ProgramSettings';
import type { PriceCheck } from '../shared/types';
import { formatPrice } from './format';
import { Icon } from './components/Icon';
import { isBelowMin } from '../core/config';

type SortKey = 'value' | 'newest';
type View = 'list' | 'stash' | 'groups' | 'character' | 'check' | 'challenges' | 'market' | 'farm';

/** Name and one-line explanation of every view (shown in the menu and as the page title). */
const PAGES: Record<View, { label: string; hint: string }> = {
  list: { label: 'Lista', hint: 'Wszystkie wycenione przedmioty, od najdroższych.' },
  stash: { label: 'Zakładki', hint: 'Twoje zakładki skrzyni z cenami na przedmiotach.' },
  groups: { label: 'Kategorie', hint: 'Przedmioty pogrupowane według rodzaju i ceny.' },
  check: { label: 'Sprawdź (Ctrl+C)', hint: 'W grze najedź na przedmiot i naciśnij Ctrl+C – cena pojawi się tutaj.' },
  character: { label: 'Postać', hint: 'Ekwipunek postaci, jego wartość i podpowiedzi ulepszeń.' },
  challenges: { label: 'Challenge', hint: 'Challenge bieżącej ligi z postępem i podpowiedziami.' },
  market: { label: 'Handel', hint: 'Lista zakupów pod build, sprzedaż hurtowa i flip walut.' },
  farm: { label: 'Farma', hint: 'Mierz zarobek z mapowania i porównuj strategie.' },
};

/** Side menu, grouped so related views sit together. */
const NAV: { group: string; items: View[] }[] = [
  { group: 'Przedmioty', items: ['list', 'stash', 'groups', 'check'] },
  { group: 'Postać i liga', items: ['character', 'challenges'] },
  { group: 'Zarabianie', items: ['market', 'farm'] },
];

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PricedItem[]>([]);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: 'Zatrzymane' });
  const [tradeLimit, setTradeLimit] = useState<{ waitSeconds: number; queued: number }>({ waitSeconds: 0, queued: 0 });
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
  /** Desktop app: shortcut and update screen (opened from the top bar or the tray menu). */
  const [program, setProgram] = useState<null | 'shortcuts' | 'updates'>(null);
  useEffect(() => window.desktop?.onOpenSettings(() => setProgram('shortcuts')), []);
  const [view, setView] = useState<View>(() => {
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
    const offLimit = window.pricer.onTradeLimit?.(setTradeLimit) ?? (() => undefined);
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
    return () => { offItems(); offStatus(); offLimit(); offSession(); offChecks(); };
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

  if (program) return <ProgramSettings focus={program} onClose={() => setProgram(null)} />;

  if (!profile || editing) {
    return (
      <div className="wizard-page">
        <div className="wizard">
          <h1 className="brand">PoE Stash Pricer</h1>
          <p className="muted">
            {profile ? 'Ustawienia profilu' : 'Pierwsze uruchomienie – kilka prostych kroków.'}
          </p>
          {profile && window.desktop && (
            <button type="button" className="btn ghost program-link" onClick={() => { setEditing(false); setProgram('shortcuts'); }}>⌨ Skróty klawiszowe i aktualizacje programu →</button>
          )}
          {profile
            ? <ProfileForm initial={profile} onSave={saveProfile} onCancel={() => setEditing(false)} />
            : <Wizard onDone={async (p) => { await saveProfile(p); void start(false); }} />}
        </div>
      </div>
    );
  }

  const itemView = view === 'list' || view === 'stash' || view === 'groups';
  const page = PAGES[view];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand">PoE Stash Pricer</span>
          <span className="side-league" title="Liga i konto z ustawień profilu">
            {league || (profile.league === 'auto' ? 'liga: auto' : profile.league)} · {profile.accountName}
          </span>
        </div>
        <nav className="nav" aria-label="Widoki">
          {NAV.map((g) => (
            <div className="nav-group" key={g.group}>
              <div className="nav-title">{g.group}</div>
              {g.items.map((id) => (
                <button key={id} className={`nav-item ${view === id ? 'on' : ''}`} onClick={() => setView(id)} title={PAGES[id].hint} aria-current={view === id ? 'page' : undefined}>
                  <Icon name={id} />
                  <span>{PAGES[id].label}</span>
                  {id === 'check' && checks.length > 0 && <span className="nav-count">{checks.length}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <button className="nav-item" onClick={() => setEditing(true)} title="Konto, liga, POESESSID, powiadomienia">
            <Icon name="settings" /><span>Ustawienia</span>
          </button>
          <div className="side-program"><UpdateBadge onOpen={setProgram} /></div>
          <p className="side-legal">This product isn't affiliated with or endorsed by Grinding Gear Games in any way.</p>
        </div>
      </aside>

      <div className="main">
        {window.pricerReadOnly && <div className="readonly-banner">Podgląd z telefonu – tylko odczyt. Zmiany rób w aplikacji na komputerze.</div>}
        <header className="topbar">
          <div className="page-title">
            <h1>{page.label}</h1>
            <p>{page.hint}</p>
          </div>
          <div className="actions">
            {running ? (
              <button className="btn" onClick={stop}><Icon name="stop" size={15} /> Zatrzymaj</button>
            ) : (
              <>
                <button className="btn primary" onClick={() => start(false)} disabled={busy}>{busy ? <><span className="spinner" /> Uruchamiam…</> : <><Icon name="play" size={15} /> Start</>}</button>
                <button className="btn ghost" onClick={() => start(true)} disabled={busy} title="Przykładowe przedmioty, bez łączenia z grą"><Icon name="demo" size={15} /> Demo</button>
              </>
            )}
            <button className="btn ghost" onClick={repriceAll} disabled={items.length === 0} title="Wycenia ponownie wszystkie przedmioty według aktualnego rynku"><Icon name="refresh" size={15} /> Przelicz</button>
            <button className="btn ghost" onClick={exportCsv} disabled={items.length === 0} title="Zapisz listę cen do pliku CSV (Excel)"><Icon name="download" size={15} /> CSV</button>
          </div>
          <div className={`status-line ${status.error ? 'error' : ''}`}>
            <span className={`dot ${running ? 'on' : ''}`} />
            <span className="status-text">{status.text}</span>
            {tradeLimit.waitSeconds > 0 && (
              <span className="trade-wait" title="pathofexile.com ogranicza liczbę zapytań – aplikacja sama czeka, żeby nie dostać blokady. Wycena Ctrl+C idzie pierwsza.">
                ⏳ czekam na limit trade, {tradeLimit.waitSeconds} s{tradeLimit.queued > 1 ? ` (w kolejce: ${tradeLimit.queued})` : ''}
              </span>
            )}
            {toast && <span className="toast">{toast}</span>}
          </div>
        </header>

        {itemView && (
          <>
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
                  <span className="stat-label">Wartość w czasie{session && session.summary.itemCount > 0 ? ` · w sesji ${session.summary.itemCount} przedm.` : ''}</span>
                  <button className="link" onClick={() => window.pricer.resetSession()}>Nowa sesja</button>
                </div>
                <Sparkline points={session?.value ?? []} height={44} format={(c) => formatPrice(c, currency, divine)} />
              </div>
            </section>

            <section className="toolbar">
              <input className="search" placeholder="Szukaj przedmiotu…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="seg" role="group" aria-label="Sortowanie">
                <button className={sort === 'value' ? 'on' : ''} onClick={() => setSort('value')}>Najdroższe</button>
                <button className={sort === 'newest' ? 'on' : ''} onClick={() => setSort('newest')}>Najnowsze</button>
              </div>
              <span className="spacer" />
              <div className="threshold" title="Przedmioty warte mniej niż ta kwota (albo bez ceny) są oznaczane jako tanie">
                <label>
                  Tanie poniżej
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
            </section>
          </>
        )}

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
      </div>
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
