import { useState } from 'react';
import type { PricedItem } from '../../shared/types';
import { priceNote } from '../../core/extras/priceNote';
import { modTiers } from '../../core/extras/tiers';
import { trend } from '../../core/extras/history';
import { CONFIDENCE_LABEL, displayName, formatPrice, rarityClass } from '../format';
import { Sparkline, TrendBadge } from './Sparkline';
import { positionLabel } from '../../core/stashLayout';
import type { ItemLocation } from '../../shared/types';

/** Tiny 12×12 (or 24×24) map with the item's cells highlighted. */
function MiniGrid({ loc }: { loc: ItemLocation }) {
  const size = loc.x + loc.w > 12 || loc.y + loc.h > 12 ? 24 : 12;
  return (
    <div className="minigrid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }} aria-hidden>
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const on = x >= loc.x && x < loc.x + loc.w && y >= loc.y && y < loc.y + loc.h;
        return <span key={i} className={on ? 'on' : ''} />;
      })}
    </div>
  );
}

interface Props {
  data: PricedItem;
  currency: 'chaos' | 'divine';
  divine: number | null;
  onClose(): void;
}

export function ItemDetails({ data, currency, divine, onClose }: Props) {
  const { item, price, advice } = data;
  const { title, subtitle } = displayName(item);
  const tiers = modTiers(item);
  const note = priceNote(price.chaos, divine);
  const [copied, setCopied] = useState(false);

  async function copyNote() {
    if (!note) return;
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

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
          {item.enchantMods?.length ? <><hr />{item.enchantMods.map((m) => <div key={m} className="mod enchant">{m}</div>)}</> : null}
          {item.implicitMods?.length ? <><hr />{item.implicitMods.map((m) => <div key={m} className="mod">{m}</div>)}</> : null}
          {item.explicitMods?.length ? (
            <>
              <hr />
              {item.explicitMods.map((m, i) => (
                <div key={m} className="mod">
                  {tiers[i] != null && <span className={`tier t${Math.min(tiers[i]!, 4)}`}>T{tiers[i]}</span>}
                  {m}
                </div>
              ))}
            </>
          ) : null}
          {item.craftedMods?.map((m) => <div key={m} className="mod crafted">{m}</div>)}
          {item.corrupted && <div className="corrupted">Skażony</div>}
        </div>
      </div>

      {data.location && (
        <div className={`location-box ${data.present === false ? 'gone' : ''}`}>
          <MiniGrid loc={data.location} />
          <div>
            <div className="advice-title">Gdzie leży</div>
            <div className="small">{positionLabel(data.location)}</div>
            {data.present === false && <div className="small error-text">Przedmiotu nie ma już w publicznej zakładce.</div>}
          </div>
        </div>
      )}

      <div className="valuation">
        <div className="val-main">{formatPrice(price.chaos, currency, divine)}</div>
        {price.low != null && price.high != null && (
          <div className="muted">Przedział: {formatPrice(price.low, currency, divine)} – {formatPrice(price.high, currency, divine)}</div>
        )}
        <div className={`badge ${price.confidence}`}>{CONFIDENCE_LABEL[price.confidence]}</div>
        <div className="muted small">Źródło: {price.source === 'none' ? '—' : price.source} · {price.note}</div>
        {price.poeprices && (
          <div className="second-opinion">
            poeprices.info: {Math.round(price.poeprices.min)}–{Math.round(price.poeprices.max)} {price.poeprices.currency}
            <span className="muted"> (pewność {Math.round(price.poeprices.confidence)}%)</span>
          </div>
        )}
      </div>

      {note && (
        <div className="note-row">
          <code className="note">{note}</code>
          <button className="btn" onClick={copyNote}>{copied ? 'Skopiowano ✓' : 'Kopiuj notkę'}</button>
        </div>
      )}

      {advice && (
        <div className={`advice-box ${advice.action}`}>
          <div className="advice-title">{advice.label}</div>
          <div className="small">{advice.reason}</div>
        </div>
      )}

      {data.history && data.history.length > 1 && (
        <div className="section">
          <h3>Historia ceny <TrendBadge change={price.change7d ?? trend(data.history)} /></h3>
          <Sparkline points={data.history} height={90} labels format={(c) => formatPrice(c, currency, divine)} />
        </div>
      )}

      {price.comparables?.length ? (
        <div className="section comparables">
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
        <button className="btn ghost" onClick={() => window.pricer.openExternal('https://www.craftofexile.com/')}>Craft of Exile</button>
      </div>
    </aside>
  );
}
