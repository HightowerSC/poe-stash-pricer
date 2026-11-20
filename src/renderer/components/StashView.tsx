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

  if (!tab) {
    return (
      <div className="empty">
        <p>Brak przedmiotów z pozycją w zakładce.</p>
        <p className="muted small">Pozycje znamy dla przedmiotów wycenionych z publicznych zakładek (po kliknięciu Start).</p>
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
                  <span className="tag">{formatPrice(p.price.chaos, currency, divine)}</span>
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
              <b>{formatPrice(p.price.chaos, currency, divine)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
