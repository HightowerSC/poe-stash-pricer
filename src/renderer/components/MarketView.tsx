import { useEffect, useState } from 'react';
import type { FlipState } from '../../shared/api';
import { formatPrice } from '../format';
import { CopyWhisper } from './ItemDetails';

interface Props {
  currency: 'chaos' | 'divine';
  divine: number | null;
}

const num = (v: number | null) => (v == null ? '—' : v >= 10 ? `${v}c` : `${v.toFixed(3)}c`);

/** Trading tools: currency flipping (more tools join this view in later versions). */
export function MarketView({ currency, divine }: Props) {
  return (
    <div className="market">
      <FlipPanel currency={currency} divine={divine} />
    </div>
  );
}

function FlipPanel({ currency, divine }: Props) {
  const [state, setState] = useState<FlipState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stack, setStack] = useState(100);

  useEffect(() => { void window.pricer.getFlips().then(setState).catch(() => undefined); }, []);

  async function scan() {
    setBusy(true);
    setError('');
    try { setState(await window.pricer.scanFlips()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <section className="char-card">
      <h3>Flip walut</h3>
      <p className="muted small">
        Program czyta wymianę hurtową na trade w obie strony. <b>Kupujesz</b> wystawiając ofertę kupna po cenie „płacą kupujący”,
        <b> sprzedajesz</b> po cenie „chcą sprzedający”. Marża to różnica przed kosztem Twojego czasu. Sprawdzenie trwa ok. minuty (limity trade).
      </p>
      <div className="inline">
        <button className="btn primary" disabled={busy || state?.running} onClick={() => void scan()}>
          {busy || state?.running ? <><span className="spinner" /> Sprawdzam rynek…</> : 'Sprawdź rynek teraz'}
        </button>
        <label className="inline-label">Zysk liczony dla <input type="number" min={1} value={stack} onChange={(e) => setStack(Math.max(1, Number(e.target.value)))} /> sztuk</label>
        {state?.at && <span className="muted small">ostatnio: {new Date(state.at).toLocaleTimeString()}</span>}
      </div>
      {error && <p className="error-text">{error}</p>}
      {state && state.rows.length > 0 && (
        <table className="flip-table">
          <thead><tr><th>Waluta</th><th>Chcą sprzedający</th><th>Płacą kupujący</th><th>poe.ninja</th><th>Marża</th><th>Zysk / {stack} szt.</th><th>Oferty</th><th /></tr></thead>
          <tbody>
            {state.rows.map((r) => {
              const profit = r.ask != null && r.bid != null ? (r.ask - r.bid) * stack : null;
              const good = (r.marginPct ?? 0) >= 3 && Math.min(r.sellers, r.buyers) >= 5;
              return (
                <tr key={r.id} className={good ? 'gain' : ''}>
                  <td>{r.name}</td>
                  <td>{num(r.ask)}</td>
                  <td>{num(r.bid)}</td>
                  <td className="muted">{num(r.ninja)}</td>
                  <td>{r.marginPct == null ? '—' : `${r.marginPct > 0 ? '+' : ''}${r.marginPct}%`}</td>
                  <td>{profit == null ? '—' : formatPrice(profit, currency, divine)}</td>
                  <td className="muted small">{r.sellers} / {r.buyers}</td>
                  <td>{r.whisperBuy && <CopyWhisper text={r.whisperBuy} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {state && state.rows.length > 0 && <p className="muted small">Zielone wiersze: marża ≥ 3% i co najmniej 5 ofert po obu stronach. Ceny zmieniają się szybko – sprawdź przed dużą transakcją.</p>}
    </section>
  );
}
