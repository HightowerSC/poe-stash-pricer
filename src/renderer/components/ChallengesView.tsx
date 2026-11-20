import { useEffect, useState } from 'react';
import { challengeHints, parseChallenges, progress, type Challenge } from '../../core/hub/challenges';

/** PoE HUB: league challenges – the player's own list, progress, order and "what to prepare". */
export function ChallengesView() {
  const [list, setList] = useState<Challenge[] | null>(null);
  const [paste, setPaste] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.pricer.getChallenges().then(setList).catch((e) => { setList([]); setError(String(e?.message ?? e)); });
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
        <p className="muted small">
          Wklej listę challenge'y (jedna w linii) – np. skopiowaną ze strony profilu na pathofexile.com albo z okna Challenges w grze (przepisaną).
          Ustaw kolejność strzałkami, dopisz notatki, a program podpowie, co przygotować.
        </p>
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Complete 40 Expedition encounters\nDefeat the Maven\nReach level 95 …'} />
        <div className="inline">
          <button className="btn primary" disabled={!paste.trim()} onClick={() => { void save(parseChallenges(paste, list)); setPaste(''); }}>Dodaj do listy</button>
          <label className="check"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ukryj zrobione</label>
          {total > 0 && <button className="btn ghost danger" onClick={() => { if (window.confirm('Usunąć całą listę challenge\'y tej ligi?')) void save([]); }}>Wyczyść listę</button>}
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>
      {shown.length > 0 && (
        <ol className="challenge-list">
          {shown.map((c) => {
            const hints = challengeHints(c.title);
            return (
              <li key={c.id} className={c.done ? 'done' : ''}>
                <div className="challenge-row">
                  <label className="check grow">
                    <input type="checkbox" checked={c.done} onChange={(e) => void update(c.id, { done: e.target.checked })} />
                    <span className="challenge-title">{c.title}</span>
                  </label>
                  <button className="btn ghost small" title="Wyżej" onClick={() => move(c.id, -1)}>↑</button>
                  <button className="btn ghost small" title="Niżej" onClick={() => move(c.id, 1)}>↓</button>
                  <button className="btn ghost small" title="Usuń" onClick={() => void remove(c.id)}>✕</button>
                </div>
                {!c.done && hints.length > 0 && <ul className="challenge-hints">{hints.map((h) => <li key={h}>💡 {h}</li>)}</ul>}
                <input className="challenge-notes" placeholder="Notatki (co kupić, gdzie farmić…)" defaultValue={c.notes}
                  onBlur={(e) => e.target.value !== c.notes && void update(c.id, { notes: e.target.value })} />
              </li>
            );
          })}
        </ol>
      )}
      {total === 0 && <p className="muted">Lista jest pusta – wklej challenge powyżej.</p>}
    </div>
  );
}
