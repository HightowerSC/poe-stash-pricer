import { useEffect, useState } from 'react';
import type { FarmState } from '../../shared/types';
import { runProfit } from '../../core/market/farm';
import { formatPrice } from '../format';

interface Props {
  currency: 'chaos' | 'divine';
  divine: number | null;
}

const KEY = 'pricer-farm-form';

/** Farm profitability: start a run with a strategy, finish with the number of maps, compare strategies. */
export function FarmView({ currency, divine }: Props) {
  const [st, setSt] = useState<FarmState | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    try { return { strategy: '', costPerMap: 10, maps: 10, extra: 0, notes: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { strategy: '', costPerMap: 10, maps: 10, extra: 0, notes: '' }; }
  });
  const price = (c: number | null) => (c == null ? '—' : formatPrice(c, currency, divine));

  useEffect(() => {
    const load = () => window.pricer.getFarm().then(setSt).catch((e) => setError(String(e?.message ?? e)));
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ strategy: form.strategy, costPerMap: form.costPerMap })); } catch { /* ignore */ } }, [form.strategy, form.costPerMap]);

  async function act(p: Promise<FarmState>) {
    setError('');
    try { setSt(await p); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  if (!st) return <p className="muted"><span className="spinner" /> Wczytuję…</p>;
  const strategies = [...new Set(st.runs.map((r) => r.strategy))];
  const minutes = st.active ? Math.round((Date.now() - Date.parse(st.active.startedAt)) / 60_000) : 0;

  return (
    <div className="farm">
      <section className="char-card">
        <h3>Opłacalność farmy</h3>
        <p className="muted small">
          Kliknij <b>Start</b> przed pierwszą mapą, graj, a na koniec wpisz liczbę map i kliknij <b>Zakończ</b>. Program liczy wartość
          nowych przedmiotów, które w tym czasie pojawiły się w skrzyni, minus koszt map. Waluta dokładana do istniejących stosów nie jest
          widoczna jako nowy przedmiot – wrzucaj loot do osobnej zakładki albo wpisz ją ręcznie w „dodatkowo”.
        </p>
        {!st.active ? (
          <div className="inline">
            <label className="inline-label">Strategia
              <input list="farm-strategies" style={{ width: 220 }} placeholder="np. Essence + Harbinger" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} />
              <datalist id="farm-strategies">{strategies.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label className="inline-label">Koszt jednej mapy (mapa, scaraby…)
              <input type="number" min={0} value={form.costPerMap} onChange={(e) => setForm({ ...form, costPerMap: Number(e.target.value) })} /> c
            </label>
            <button className="btn primary" onClick={() => void act(window.pricer.startFarm(form.strategy, form.costPerMap))}>Start</button>
          </div>
        ) : (
          <div className="farm-live">
            <div><b>{st.active.strategy}</b> · trwa {minutes} min · koszt mapy {st.active.costPerMap}c</div>
            <div className="farm-loot">Loot do tej pory: <b>{price(st.live?.chaos ?? 0)}</b> <span className="muted small">({st.live?.count ?? 0} przedmiotów{st.lastScan ? `, ostatni skan skrzyni ${new Date(st.lastScan).toLocaleTimeString()}` : ', skrzynia jeszcze nie skanowana – kliknij Start na górze'})</span></div>
            <div className="inline">
              <label className="inline-label">Zrobione mapy <input type="number" min={0} value={form.maps} onChange={(e) => setForm({ ...form, maps: Number(e.target.value) })} /></label>
              <label className="inline-label">Dodatkowo (c) <input type="number" value={form.extra} onChange={(e) => setForm({ ...form, extra: Number(e.target.value) })} /></label>
              <input placeholder="Notatki (opcjonalnie)" style={{ width: 220 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button className="btn primary" onClick={() => void act(window.pricer.finishFarm(form.maps, form.extra, form.notes))}>Zakończ i zapisz</button>
              <button className="btn ghost" onClick={() => { if (window.confirm('Przerwać sesję bez zapisywania?')) void act(window.pricer.cancelFarm()); }}>Przerwij</button>
            </div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      {st.strategies.length > 0 && (
        <section className="char-card">
          <h3>Porównanie strategii</h3>
          <table className="flip-table">
            <thead><tr><th>Strategia</th><th>Sesje</th><th>Mapy</th><th>Zysk razem</th><th>Na mapę</th><th>Na godzinę</th></tr></thead>
            <tbody>
              {st.strategies.map((s, i) => (
                <tr key={s.strategy} className={i === 0 && st.strategies.length > 1 ? 'gain' : ''}>
                  <td>{s.strategy}</td><td>{s.runs}</td><td>{s.maps}</td><td>{price(s.profit)}</td><td>{price(s.perMap)}</td><td><b>{price(s.perHour)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Najlepsza strategia na godzinę jest na górze. Kilka sesji na strategię daje pewniejszy wynik – loot w PoE jest bardzo losowy.</p>
        </section>
      )}

      {st.runs.length > 0 && (
        <section className="char-card">
          <h3>Sesje</h3>
          <table className="flip-table">
            <thead><tr><th>Kiedy</th><th>Strategia</th><th>Czas</th><th>Mapy</th><th>Loot</th><th>Koszt</th><th>Zysk</th><th /></tr></thead>
            <tbody>
              {[...st.runs].reverse().slice(0, 30).map((r) => (
                <tr key={r.id} title={r.notes || undefined}>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td>{r.strategy}</td>
                  <td>{r.endedAt ? Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 60_000) : '—'} min</td>
                  <td>{r.maps}</td>
                  <td>{price(r.lootChaos + r.extraChaos)}</td>
                  <td>{price(r.maps * r.costPerMap)}</td>
                  <td><b>{price(runProfit(r))}</b></td>
                  <td><button className="btn ghost small" title="Usuń" onClick={() => void act(window.pricer.deleteFarmRun(r.id))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
