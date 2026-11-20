import { useEffect, useMemo, useState } from 'react';
import type { PricedItem } from '../../shared/types';
import { tabLayouts } from '../../core/stashLayout';
import { isBelowMin } from '../../core/config';
import { formatPrice, rarityClass, displayName } from '../format';

interface Props {
  items: PricedItem[];
  currency: 'chaos' | 'divine';
  divine: number | null;
  minValue: number;
  selectedId: string | null;
  onSelect(p: PricedItem): void;
}

/** The public stash tabs drawn as in game: each item on its cells with its price. */
export function StashView({ items, currency, divine, minValue, selectedId, onSelect }: Props) {
  const tabs = useMemo(() => tabLayouts(items), [items]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.tab === active)) setActive(tabs[0].tab);
  }, [tabs, active]);
  const tab = tabs.find((t) => t.tab === active) ?? tabs[0];
  const unplaced = items.filter((p) => !p.location && p.present !== false);

  const unplacedNote = unplaced.length > 0 && (
    <div className="unplaced">
      <b>{unplaced.length} przedmiotów bez pozycji w skrzyni</b>
      <span className="muted small">
        Zapisała je starsza wersja programu albo pochodzą z innego źródła. Kliknij Start – program pobierze ich pozycje ponownie.
        Jeśli to nie pomoże: ⚙ Ustawienia → „Wyczyść przedmioty”.
      </span>
      <div className="unplaced-list">
        {unplaced.slice(0, 40).map((p) => (
          <button key={p.item.id} className="group-chip" onClick={() => onSelect(p)}>
            {displayName(p.item).title} <b>{formatPrice(p.price.chaos, currency, divine)}</b>
          </button>
        ))}
      </div>
    </div>
  );

  if (!tab) {
    return (
      <div className="stash">
        <div className="empty">
          <p>Brak przedmiotów z pozycją w zakładce.</p>
          <p className="muted small">Pozycje znamy dla przedmiotów pobranych ze skrzyni po kliknięciu Start (z POESESSID w ustawieniach).</p>
        </div>
        {unplacedNote}
      </div>
    );
  }

  return (
    <div className="stash">
      <div className="stash-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.tab} role="tab" aria-selected={t.tab === tab.tab} className={`stash-tab ${t.tab === tab.tab ? 'on' : ''}`} onClick={() => setActive(t.tab)}>
            <span className="stash-tab-name">{t.tab}</span>
            <span className="stash-tab-value">{formatPrice(t.totalChaos, currency, divine)}</span>
          </button>
        ))}
      </div>

      {tab.grid ? (
        <div className="stash-frame">
          <div className={`stash-grid g${tab.grid}`} style={{ gridTemplateColumns: `repeat(${tab.grid}, 1fr)`, gridTemplateRows: `repeat(${tab.grid}, 1fr)` }}>
            {Array.from({ length: tab.grid * tab.grid }, (_, i) => (
              <div key={`c${i}`} className="cell" style={{ gridColumn: (i % tab.grid!) + 1, gridRow: Math.floor(i / tab.grid!) + 1 }} />
            ))}
            {tab.items.map((p) => {
              const l = p.location!;
              const below = isBelowMin(p.price.chaos, minValue);
              const { title } = displayName(p.item);
              return (
                <button
                  key={p.item.id}
                  className={`stash-item ${rarityClass(p.item)} ${below ? 'below' : ''} ${selectedId === p.item.id ? 'active' : ''}`}
                  style={{ gridColumn: `${l.x + 1} / span ${l.w}`, gridRow: `${l.y + 1} / span ${l.h}` }}
                  title={`${title} – kolumna ${l.x + 1}, rząd ${l.y + 1}`}
                  onClick={() => onSelect(p)}
                >
                  {p.item.icon && <img src={p.item.icon} alt="" loading="lazy" />}
                  {p.item.stackSize && p.item.stackSize > 1 && <span className="stack">{p.item.stackSize}</span>}
                  <span className="tag">{p.price.specialMods?.length ? "★ " : ""}{formatPrice(p.price.chaos, currency, divine)}{p.price.lowerBound && p.price.chaos != null ? "+" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="stash-legend muted small">
            {tab.grid === 24 ? 'Zakładka quad (24×24)' : 'Zakładka 12×12'} · {tab.items.length} przedmiotów · kliknij przedmiot, aby zobaczyć szczegóły
          </div>
        </div>
      ) : (
        <div className="stash-list">
          <p className="muted small">To zakładka specjalna (np. waluty, fragmenty) – pokazuję listę zamiast siatki.</p>
          {tab.items.map((p) => (
            <button key={p.item.id} className={`stash-row ${rarityClass(p.item)}`} onClick={() => onSelect(p)}>
              <span>{displayName(p.item).title}</span>
              <span className="muted">slot {p.location!.x + 1}{p.location!.y ? `, ${p.location!.y + 1}` : ''}</span>
              <b>{formatPrice(p.price.chaos, currency, divine)}{p.price.lowerBound && p.price.chaos != null ? "+" : ""}</b>
            </button>
          ))}
        </div>
      )}
      {unplacedNote}
    </div>
  );
}
