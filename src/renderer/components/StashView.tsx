import { useEffect, useMemo, useState } from 'react';
import type { PricedItem } from '../../shared/types';
import { tabLayouts, tabTypeLabel } from '../../core/stashLayout';
import { iconSrc, imageFileName, renderTabImage, specialOrder } from '../stashImage';
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
  // The picture follows the stash: every refresh of the items redraws it; remember when that happened.
  const [updated, setUpdated] = useState(() => new Date());
  useEffect(() => setUpdated(new Date()), [items]);
  const [big, setBig] = useState(() => { try { return localStorage.getItem('stashBig') === '1'; } catch { return false; } });
  const toggleBig = () => setBig((b) => { try { localStorage.setItem('stashBig', b ? '0' : '1'); } catch { /* optional */ } return !b; });
  const [imgMsg, setImgMsg] = useState<string | null>(null);
  const stamp = `Stan z ${updated.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

  async function picture(): Promise<Blob | null> {
    if (!tab) return null;
    try {
      return await renderTabImage(tab, { currency, divine, minValue, stamp });
    } catch (e) {
      setImgMsg(`Nie udało się zrobić obrazu: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
  async function savePng() {
    setImgMsg('Tworzę obraz…');
    const blob = await picture();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = imageFileName(tab!.tab, updated);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setImgMsg('Obraz zapisany (wybierz miejsce w oknie zapisu albo sprawdź Pobrane).');
  }
  async function copyPng() {
    setImgMsg('Tworzę obraz…');
    const blob = await picture();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setImgMsg('Obraz skopiowany – wklej go np. na Discordzie (Ctrl+V).');
    } catch {
      setImgMsg('Nie udało się skopiować obrazu do schowka – użyj „Zapisz obraz”.');
    }
  }

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
          <button key={t.tab} role="tab" aria-selected={t.tab === tab.tab} className={`stash-tab ${t.tab === tab.tab ? 'on' : ''}`} style={t.color ? { borderTopColor: t.color, borderTopWidth: 3 } : undefined} onClick={() => setActive(t.tab)}>
            <span className="stash-tab-name">{t.tab}</span>
            <span className="stash-tab-value">{formatPrice(t.totalChaos, currency, divine)}</span>
          </button>
        ))}
      </div>

      <div className="stash-toolbar">
        <span className="stash-stamp" title="Obraz odświeża się sam przy każdym sprawdzeniu skrzyni">● {stamp}</span>
        <span className="stash-total">Razem: <b>{formatPrice(tab.totalChaos, currency, divine)}</b></span>
        <span className="spacer" />
        <button className="btn small" onClick={toggleBig}>{big ? '↙ Mniejszy' : '↗ Większy'}</button>
        <button className="btn small" onClick={() => void copyPng()} title="Obraz zakładki z cenami do schowka">📋 Kopiuj obraz</button>
        <button className="btn small" onClick={() => void savePng()} title="Zapisz obraz zakładki z cenami jako PNG">📷 Zapisz obraz</button>
      </div>
      {imgMsg && <div className="muted small">{imgMsg}</div>}

      {tab.grid ? (
        <div className={`stash-frame ${big ? 'big' : ''}`}>
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
                  {p.item.icon && <Icon url={p.item.icon} />}
                  {p.item.stackSize && p.item.stackSize > 1 && <span className="stack">{p.item.stackSize}</span>}
                  <span className="tag">{p.price.specialMods?.length ? "★ " : ""}{formatPrice(p.price.chaos, currency, divine)}{p.price.lowerBound && p.price.chaos != null ? "+" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="stash-legend muted small">
            {tabTypeLabel(tab.type, tab.grid)} · {tab.items.length} przedmiotów · kliknij przedmiot, aby zobaczyć szczegóły
          </div>
        </div>
      ) : (
        <div className={`stash-frame ${big ? 'big' : ''}`}>
          <div className="stash-tiles">
            {specialOrder(tab).map(({ p }) => {
              const below = isBelowMin(p.price.chaos, minValue);
              return (
                <button
                  key={p.item.id}
                  className={`stash-item tile ${rarityClass(p.item)} ${below ? 'below' : ''} ${selectedId === p.item.id ? 'active' : ''}`}
                  title={displayName(p.item).title}
                  onClick={() => onSelect(p)}
                >
                  {p.item.icon ? <Icon url={p.item.icon} /> : <span className="tile-name">{displayName(p.item).title}</span>}
                  {p.item.stackSize && p.item.stackSize > 1 && <span className="stack">{p.item.stackSize}</span>}
                  <span className="tag">{formatPrice(p.price.chaos, currency, divine)}{p.price.lowerBound && p.price.chaos != null ? '+' : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="stash-legend muted small">
            {tabTypeLabel(tab.type, tab.grid)} · {tab.items.length} przedmiotów · ta zakładka ma w grze własny układ, więc przedmioty są ułożone po kolei
          </div>
        </div>
      )}
      {unplacedNote}
    </div>
  );
}

/** Item icon through the local cache; falls back to GGG's address if the server cannot fetch it. */
function Icon({ url }: { url: string }) {
  const [src, setSrc] = useState(() => iconSrc(url));
  useEffect(() => setSrc(iconSrc(url)), [url]);
  return <img src={src} alt="" loading="lazy" onError={() => { if (src !== url) setSrc(url); }} />;
}
