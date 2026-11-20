import { useState } from 'react';
import type { PricedItem } from '../../shared/types';
import { groupByKind, groupByPrice, groupByTab } from '../../core/extras/groups';
import { isBelowMin } from '../../core/config';
import { formatPrice } from '../format';
import { ItemCard } from './ItemCard';

interface Props {
  items: PricedItem[];
  currency: 'chaos' | 'divine';
  divine: number | null;
  minValue: number;
  selectedId: string | null;
  onSelect(p: PricedItem): void;
}

export function GroupsView({ items, currency, divine, minValue, selectedId, onSelect }: Props) {
  const [by, setBy] = useState<'tab' | 'kind' | 'price'>(() => {
    try { const v = localStorage.getItem('pricer-groups'); return v === 'kind' || v === 'price' ? v : 'tab'; } catch { return 'tab'; }
  });
  const choose = (v: 'tab' | 'kind' | 'price') => { setBy(v); try { localStorage.setItem('pricer-groups', v); } catch { /* ignore */ } };
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = by === 'tab' ? groupByTab(items) : by === 'kind' ? groupByKind(items, minValue) : groupByPrice(items, divine, minValue);
  const toggle = (k: string) => setClosed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="groups">
      <div className="groups-head">
        <div className="seg">
          <button className={by === 'tab' ? 'on' : ''} onClick={() => choose('tab')}>Według zakładki w skrzyni</button>
          <button className={by === 'kind' ? 'on' : ''} onClick={() => choose('kind')}>Według rodzaju</button>
          <button className={by === 'price' ? 'on' : ''} onClick={() => choose('price')}>Według ceny</button>
        </div>
        <span className="muted small">Podpowiedź, do której zakładki w grze odłożyć przedmioty – aplikacja niczego w grze nie przenosi.</span>
      </div>
      <div className="groups-summary">
        {groups.map((g) => (
          <button key={g.key} className="group-chip" onClick={() => document.getElementById(`group-${g.key}`)?.scrollIntoView({ behavior: 'smooth' })}>
            {g.label} <b>{formatPrice(g.totalChaos, currency, divine)}</b> <span className="muted">({g.items.length})</span>
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.key} id={`group-${g.key}`} className="group">
          <button className="group-title" onClick={() => toggle(g.key)}>
            <span>{closed.has(g.key) ? '▸' : '▾'} {g.label}</span>
            {by !== 'tab' && <span className="muted small">→ zakładka „{g.suggestedTab}”</span>}
            <span className="spacer" />
            <span>{g.items.length} szt. · <b>{formatPrice(g.totalChaos, currency, divine)}</b></span>
          </button>
          {!closed.has(g.key) && (
            <div className="grid">
              {g.items.map((p) => (
                <ItemCard key={p.item.id} data={p} currency={currency} divine={divine} belowMin={isBelowMin(p.price.chaos, minValue)} minValue={minValue} onClick={() => onSelect(p)} active={selectedId === p.item.id} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
