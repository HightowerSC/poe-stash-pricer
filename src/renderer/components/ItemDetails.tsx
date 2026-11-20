import { useState } from 'react';
import type { CraftReport } from '../../shared/types';
import type { PricedItem } from '../../shared/types';
import { priceNote } from '../../core/extras/priceNote';
import { modTiers } from '../../core/extras/tiers';
import { trend } from '../../core/extras/history';
import { CONFIDENCE_LABEL, displayName, formatPrice, rarityClass } from '../format';
import { Sparkline, TrendBadge } from './Sparkline';
import { positionLabel } from '../../core/stashLayout';
import { suggestedTab } from '../../core/extras/groups';
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
  minValue?: number;
  onClose(): void;
}

export function ItemDetails({ data, currency, divine, minValue, onClose }: Props) {
  const { item, price, advice } = data;
  const { title, subtitle } = displayName(item);
  const tiers = modTiers(item);
  const note = priceNote(price.chaos, divine);
  const [copied, setCopied] = useState(false);
  const [craft, setCraft] = useState<{ itemId: string; busy: boolean; report?: CraftReport; error?: string } | null>(null);
  const craftable = item.frameType === 1 || item.frameType === 2;
  const craftState = craft?.itemId === item.id ? craft : null;

  async function checkCrafts() {
    setCraft({ itemId: item.id, busy: true });
    try {
      const report = await window.pricer.craftAdvice(item.id);
      setCraft({ itemId: item.id, busy: false, report });
    } catch (e) {
      setCraft({ itemId: item.id, busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

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
            <div className="small muted">Pasuje do zakładki: „{suggestedTab(data, minValue ?? 0)}”</div>
            {data.present === false && <div className="small error-text">Przedmiotu nie ma już w publicznej zakładce.</div>}
          </div>
        </div>
      )}

      <div className="valuation">
        <div className="val-main">{formatPrice(price.chaos, currency, divine)}{price.lowerBound && price.chaos != null ? '+' : ''}</div>
        {price.lowerBound && <div className="lower-bound">Cena minimalna: pominięto specjalny mod lub wariant, realna wartość może być wyższa.</div>}
        {price.specialMods?.length ? (
          <div className="special-box">
            <b>★ Wartościowy corrupt</b>
            {price.specialMods.map((m) => <div key={m} className="mod enchant">{m}</div>)}
          </div>
        ) : null}
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

      {craftable && (
        <div className="section craft">
          <h3>Doradca craftu</h3>
          {!craftState?.report && (
            <>
              <div className="small muted">Sprawdza wolne prefiksy/sufiksy, bench crafty i orby oraz wycenia przedmiot z dodanym modem na trade.</div>
              <button className="btn" disabled={craftState?.busy} onClick={checkCrafts}>{craftState?.busy ? 'Sprawdzam…' : 'Sprawdź crafty'}</button>
            </>
          )}
          {craftState?.error && <div className="small error-text">{craftState.error}</div>}
          {craftState?.report && <CraftTable report={craftState.report} currency={currency} divine={divine} />}
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
        {data.location && <button className="btn ghost" onClick={() => void window.pricer.reprice([item.id]).catch(() => undefined)} title="Wycenia ten przedmiot ponownie według aktualnego rynku">↻ Przelicz</button>}
        {price.tradeUrl && <button className="btn primary" onClick={() => window.pricer.openExternal(price.tradeUrl!)}>Otwórz na trade</button>}
        <button className="btn ghost" onClick={() => window.pricer.openExternal(`https://poedb.tw/us/search?q=${encodeURIComponent(item.name || item.baseType)}`)}>poedb</button>
        <button className="btn ghost" onClick={() => window.pricer.openExternal('https://www.craftofexile.com/')}>Craft of Exile</button>
      </div>
    </aside>
  );
}

function CraftTable({ report, currency, divine }: { report: CraftReport; currency: 'chaos' | 'divine'; divine: number | null }) {
  return (
    <>
      <div className="small muted">Prefiksy {report.prefixes} · sufiksy {report.suffixes}</div>
      {report.reason && <div className="small">{report.reason}</div>}
      {report.suggestions.length > 0 && (
        <table className="craft-table">
          <thead><tr><th>Craft</th><th>Koszt</th><th>Cena po</th><th>Zysk</th></tr></thead>
          <tbody>
            {report.suggestions.map((s, i) => (
              <tr key={i} className={s.profit != null && s.profit > 0 ? 'gain' : ''}>
                <td>
                  {s.option.label}
                  {s.option.affix && <span className="muted"> ({s.option.affix === 'prefix' ? 'prefiks' : 'sufiks'})</span>}
                  {s.tradeUrl && <> · <a href="#" onClick={(e) => { e.preventDefault(); window.pricer.openExternal(s.tradeUrl!); }}>oferty</a></>}
                </td>
                <td>{s.costChaos != null ? formatPrice(s.costChaos, currency, divine) : `${s.option.cost.amount} ${s.option.cost.currency}`}</td>
                <td>{s.option.deterministic ? formatPrice(s.priceAfter, currency, divine) : 'losowy'}</td>
                <td>{s.profit != null ? `${s.profit > 0 ? '+' : ''}${formatPrice(s.profit, currency, divine)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="small muted">Koszty benchu są orientacyjne (3.30) – sprawdź je przy stole w grze.</div>
    </>
  );
}
