import { useEffect, useState } from 'react';
import type { FlipState } from '../../shared/api';
import type { PricedItem } from '../../shared/types';
import { bulkLots, bulkMessages } from '../../core/market/bulk';
import { formatPrice } from '../format';
import { CopyWhisper } from './ItemDetails';

interface Props {
  currency: 'chaos' | 'divine';
  divine: number | null;
}

const BULK_KEY = 'pricer-bulk';

const num = (v: number | null) => (v == null ? '—' : v >= 10 ? `${v}c` : `${v.toFixed(3)}c`);

/** Trading tools: currency flipping (more tools join this view in later versions). */
export function MarketView({ currency, divine, items }: Props & { items: PricedItem[] }) {
  return (
    <div className="market">
      <BulkPanel currency={currency} divine={divine} items={items} />
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

function BulkPanel({ currency, divine, items }: Props & { items: PricedItem[] }) {
  const [opts, setOpts] = useState(() => {
    try { return { discountPct: 10, minLotChaos: 5, ...JSON.parse(localStorage.getItem(BULK_KEY) ?? '{}') }; } catch { return { discountPct: 10, minLotChaos: 5 }; }
  });
  const [skip, setSkip] = useState<Set<string>>(new Set());
  useEffect(() => { try { localStorage.setItem(BULK_KEY, JSON.stringify(opts)); } catch { /* ignore */ } }, [opts]);
  const lots = bulkLots(items, { ...opts, divine });
  const chosen = lots.filter((l) => !skip.has(l.name));
  const total = chosen.reduce((s, l) => s + l.total, 0);
  const toggle = (name: string) => setSkip((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  return (
    <section className="char-card">
      <h3>Sprzedaż hurtowa {chosen.length > 0 && <span className="muted">– {chosen.length} pozycji, razem {formatPrice(total, currency, divine)}</span>}</h3>
      <p className="muted small">
        Waluta, fragmenty, scaraby, essence i karty ze skrzyni, zsumowane po nazwie. Cena hurtowa jest trochę niższa od rynkowej, żeby szybko się sprzedało.
        „Notka” ustaw na stosie lub zakładce w grze (prawy klik → cena) – wtedy kupujący znajdą Cię w wymianie hurtowej.
      </p>
      <div className="inline">
        <label className="inline-label">Rabat od ceny rynkowej <input type="number" min={0} max={50} value={opts.discountPct} onChange={(e) => setOpts({ ...opts, discountPct: Number(e.target.value) })} /> %</label>
        <label className="inline-label">Pomiń pozycje poniżej <input type="number" min={0} value={opts.minLotChaos} onChange={(e) => setOpts({ ...opts, minLotChaos: Number(e.target.value) })} /> c</label>
        {chosen.length > 0 && bulkMessages(chosen, divine).map((m, i, all) => <CopyWhisper key={i} text={m} label={all.length > 1 ? `Kopiuj wiadomość zbiorczą ${i + 1}/${all.length}` : 'Kopiuj wiadomość zbiorczą'} />)}
      </div>
      {lots.length === 0 ? (
        <p className="muted small">Brak wycenionych przedmiotów do sprzedaży hurtowej. Kliknij Start (skrzynia) albo zmniejsz próg.</p>
      ) : (
        <table className="flip-table">
          <thead><tr><th /><th>Przedmiot</th><th>Ilość</th><th>Rynek / szt.</th><th>Hurt / szt.</th><th>Razem</th><th>Notka</th><th /></tr></thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.name} className={skip.has(l.name) ? 'off' : ''}>
                <td><input type="checkbox" checked={!skip.has(l.name)} onChange={() => toggle(l.name)} /></td>
                <td>{l.name}</td>
                <td>{l.count}</td>
                <td className="muted">{num(l.unit)}</td>
                <td>{num(l.ask)}</td>
                <td><b>{formatPrice(l.total, currency, divine)}</b></td>
                <td><code>{l.note}</code></td>
                <td><CopyWhisper text={l.message} label="Kopiuj WTS" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
