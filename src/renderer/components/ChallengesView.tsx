import { useEffect, useState } from 'react';
import { challengeHints, parseChallenges, progress, type Challenge } from '../../core/hub/challenges';
import type { ChallengeSync } from '../../shared/api';

const SOURCE_LABEL: Record<NonNullable<ChallengeSync['source']>, string> = {
  official: 'z pathofexile.com – razem z Twoim postępem',
  poedb: 'z poedb.tw (bez postępu – zaznaczaj ręcznie albo wpisz POESESSID, żeby postęp pobierał się sam)',
  bundled: 'z listy wbudowanej w program (brak internetu albo strony nie odpowiadają)',
};

/** PoE HUB: league challenges – the player's own list, progress, order and "what to prepare". */
export function ChallengesView() {
  const [list, setList] = useState<Challenge[] | null>(null);
  const [paste, setPaste] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [error, setError] = useState('');
  const [sync, setSync] = useState<ChallengeSync | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function fetchList(force: boolean) {
    setSyncing(true);
    try {
      const r = await window.pricer.syncChallenges(force);
      setSync(r);
      setList(r.list);
      setError(r.error ? `Nie udało się pobrać listy: ${r.error}` : '');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSyncing(false); }
  }

  useEffect(() => {
    window.pricer.getChallenges().then(setList).catch((e) => { setList([]); setError(String(e?.message ?? e)); });
    // the list downloads itself when the tab opens (a fresh cached copy is reused)
    void fetchList(false);
  }, []);

  async function save(next: Challenge[]) {
    setList(next);
    try { setList(await window.pricer.saveChallenges(next)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const update = (id: string, patch: Partial<Challenge>) => list && save(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (id: string, dir: -1 | 1) => {
    if (!list) return;
    const i = list.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
  };
  const remove = (id: string) => list && save(list.filter((c) => c.id !== id));

  if (!list) return <p className="muted"><span className="spinner" /> Wczytuję…</p>;
  const { done, total } = progress(list);
  const shown = hideDone ? list.filter((c) => !c.done) : list;

  return (
    <div className="challenges">
      <section className="char-card">
        <h3>Challenge ligowe {total > 0 && <span className="muted">– {done}/{total}</span>}</h3>
        {total > 0 && <div className="progress"><div style={{ width: `${(done / total) * 100}%` }} /></div>}
        <div className="inline">
          <button className="btn primary" disabled={syncing} onClick={() => void fetchList(true)}>
            {syncing ? <><span className="spinner" /> Pobieram…</> : '🔄 Pobierz listę i postęp'}
          </button>
          <label className="check"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ukryj zrobione</label>
          {total > 0 && <button className="btn ghost danger" onClick={() => { if (window.confirm('Usunąć całą listę challenge\'y tej ligi? (Pobierze się od nowa, notatki znikną)')) void save([]); }}>Wyczyść listę</button>}
        </div>
        {sync?.source && (
          <p className="muted small">
            Liga {sync.league}: lista {SOURCE_LABEL[sync.source]}
            {sync.fetchedAt && <> · pobrano {new Date(sync.fetchedAt).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
            {sync.source !== 'official' && sync.notes.length > 0 && <span title={sync.notes.join('\n')}> ⓘ</span>}
          </p>
        )}
        <details className="challenge-manual">
          <summary className="muted small">Dodaj challenge ręcznie</summary>
          <textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Jeden w linii, np.\nDefeat the Maven'} />
          <button className="btn" disabled={!paste.trim()} onClick={() => { void save(parseChallenges(paste, list)); setPaste(''); }}>Dodaj do listy</button>
        </details>
        {error && <p className="error-text">{error}</p>}
      </section>
      {shown.length > 0 && (
        <ol className="challenge-list">
          {shown.map((c) => {
            const hints = challengeHints(c.title, c.desc, c.steps);
            const counter = c.total && c.total > 1 ? `${c.current ?? (c.done ? c.total : 0)}/${c.total}` : '';
            return (
              <li key={c.id} className={c.done ? 'done' : ''}>
                <div className="challenge-row">
                  <label className="check grow">
                    <input type="checkbox" checked={c.done} onChange={(e) => void update(c.id, { done: e.target.checked })} />
                    <span className="challenge-title">{c.title}</span>
                    {counter && <span className="muted small"> {counter}</span>}
                  </label>
                  <button className="btn ghost small" title="Wyżej" onClick={() => move(c.id, -1)}>↑</button>
                  <button className="btn ghost small" title="Niżej" onClick={() => move(c.id, 1)}>↓</button>
                  <button className="btn ghost small" title="Usuń" onClick={() => void remove(c.id)}>✕</button>
                </div>
                {c.desc && <p className="muted small challenge-desc">{c.desc}</p>}
                {c.steps && c.steps.length > 0 && (
                  <details className="challenge-steps"><summary className="muted small">Kroki ({c.steps.length})</summary>
                    <ul>{c.steps.map((st) => <li key={st} className="small">{st}</li>)}</ul>
                  </details>
                )}
                {!c.done && hints.length > 0 && <ul className="challenge-hints">{hints.map((h) => <li key={h}>💡 {h}</li>)}</ul>}
                <input className="challenge-notes" placeholder="Notatki (co kupić, gdzie farmić…)" defaultValue={c.notes}
                  onBlur={(e) => e.target.value !== c.notes && void update(c.id, { notes: e.target.value })} />
              </li>
            );
          })}
        </ol>
      )}
      {total === 0 && !syncing && <p className="muted">Lista jest pusta – kliknij „Pobierz listę i postęp”.</p>}
    </div>
  );
}
