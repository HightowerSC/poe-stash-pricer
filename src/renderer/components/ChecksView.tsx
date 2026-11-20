import { useState } from 'react';
import type { PriceCheck, PricedItem } from '../../shared/types';
import { isBelowMin } from '../../core/config';
import { ItemCard } from './ItemCard';

interface Props {
  checks: PriceCheck[];
  currency: 'chaos' | 'divine';
  divine: number | null;
  minValue: number;
  selectedId: string | null;
  onSelect(p: PricedItem): void;
  desktop: boolean;
}

export const asPriced = (c: PriceCheck): PricedItem => ({ item: c.item, price: c.price, advice: c.advice, firstSeen: c.at, pricedAt: c.at });

/** Price check of single items copied in game (Ctrl+C), like Awakened PoE Trade. */
export function ChecksView({ checks, currency, divine, minValue, selectedId, onSelect, desktop }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check(t = text) {
    if (!t.trim()) return;
    setBusy(true);
    setError('');
    try {
      const c = await window.pricer.checkText(t);
      onSelect(asPriced(c));
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="checks">
      <div className="check-box">
        <div>
          <b>Wycena przedmiotu z gry</b>
          <p className="muted small">
            {desktop
              ? <>W grze najedź myszką na przedmiot i naciśnij <b>Ctrl+C</b> – cena pojawi się nad grą i tutaj. <b>Ctrl+Alt+C</b> kopiuje też tiery modów (lepszy doradca craftu).</>
              : <>W grze najedź na przedmiot i naciśnij <b>Ctrl+C</b>, potem wklej tutaj (<b>Ctrl+V</b>). W aplikacji desktopowej dzieje się to samo.</>}
          </p>
        </div>
        <textarea
          placeholder="Wklej tekst przedmiotu (Ctrl+V)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); setText(t); void check(t); } }}
          rows={4}
        />
        <div className="inline">
          <button className="btn primary" onClick={() => void check()} disabled={busy || !text.trim()}>{busy ? <><span className="spinner" /> Wyceniam…</> : 'Wyceń'}</button>
          {error && <span className="error-text small">{error}</span>}
        </div>
      </div>
      {checks.length === 0
        ? <p className="muted">Jeszcze nic nie sprawdzono.</p>
        : (
          <div className="grid">
            {checks.map((c) => {
              const p = asPriced(c);
              return <ItemCard key={c.item.id} data={p} currency={currency} divine={divine} belowMin={isBelowMin(c.price.chaos, minValue)} minValue={minValue} onClick={() => onSelect(p)} active={selectedId === c.item.id} />;
            })}
          </div>
        )}
    </div>
  );
}
