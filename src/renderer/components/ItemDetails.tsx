import type { PricedItem } from '../../shared/types';
import { CONFIDENCE_LABEL, displayName, formatPrice, rarityClass } from '../format';

interface Props {
  data: PricedItem;
  currency: 'chaos' | 'divine';
  divine: number | null;
  onClose(): void;
}

export function ItemDetails({ data, currency, divine, onClose }: Props) {
  const { item, price } = data;
  const { title, subtitle } = displayName(item);
  return (
    <aside className="details">
      <button className="close" onClick={onClose} aria-label="Zamknij">×</button>
      <div className={`tooltip ${rarityClass(item)}`}>
        <div className="tt-head">
          <div className="tt-title">{title}</div>
          {subtitle && <div className="tt-title">{subtitle}</div>}
        </div>
        <div className="tt-body">
          {item.ilvl > 0 && <div className="tt-prop">Poziom przedmiotu: <b>{item.ilvl}</b></div>}
          {item.properties?.map((p) => (
            <div key={p.name} className="tt-prop">{p.name}: <b>{p.values.map((v) => v[0]).join(', ')}</b></div>
          ))}
          {item.implicitMods?.length ? <><hr />{item.implicitMods.map((m) => <div key={m} className="mod">{m}</div>)}</> : null}
          {item.explicitMods?.length ? <><hr />{item.explicitMods.map((m) => <div key={m} className="mod">{m}</div>)}</> : null}
          {item.craftedMods?.map((m) => <div key={m} className="mod crafted">{m}</div>)}
          {item.corrupted && <div className="corrupted">Skażony</div>}
        </div>
      </div>

      <div className="valuation">
        <div className="val-main">{formatPrice(price.chaos, currency, divine)}</div>
        {price.low != null && price.high != null && (
          <div className="muted">Przedział: {formatPrice(price.low, currency, divine)} – {formatPrice(price.high, currency, divine)}</div>
        )}
        <div className={`badge ${price.confidence}`}>{CONFIDENCE_LABEL[price.confidence]}</div>
        <div className="muted small">Źródło: {price.source === 'none' ? '—' : price.source} · {price.note}</div>
      </div>

      {price.comparables?.length ? (
        <div className="comparables">
          <h3>Najbliższe oferty</h3>
          <table>
            <thead><tr><th>Cena</th><th>W chaos</th><th>Podobieństwo</th></tr></thead>
            <tbody>
              {price.comparables.map((c, i) => (
                <tr key={i}>
                  <td>{c.originalAmount} {c.originalCurrency}</td>
                  <td>{Math.round(c.chaos)}c</td>
                  <td><div className="simbar"><span style={{ width: `${Math.round(c.similarity * 100)}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="links">
        {price.tradeUrl && <button className="btn primary" onClick={() => window.pricer.openExternal(price.tradeUrl!)}>Otwórz na trade</button>}
        <button className="btn ghost" onClick={() => window.pricer.openExternal(`https://poedb.tw/us/search?q=${encodeURIComponent(item.name || item.baseType)}`)}>poedb</button>
      </div>
    </aside>
  );
}
