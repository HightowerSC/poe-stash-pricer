import { useEffect, useState } from 'react';
import type { CharacterSummary, CharacterView as View, EquippedItem, PricedItem } from '../../shared/types';
import { displayName, formatPrice, rarityClass } from '../format';

interface Props {
  currency: 'chaos' | 'divine';
  divine: number | null;
  selectedId: string | null;
  onSelect(p: PricedItem): void;
}

const SLOT_LABEL: Record<string, string> = {
  Weapon: 'Broń', Offhand: 'Druga ręka', Helm: 'Hełm', BodyArmour: 'Zbroja', Gloves: 'Rękawice', Boots: 'Buty',
  Amulet: 'Amulet', Ring: 'Pierścień', Ring2: 'Pierścień 2', Ring3: 'Pierścień 3', Belt: 'Pas', Flask: 'Flaszka',
  Weapon2: 'Broń (zamiana)', Offhand2: 'Druga ręka (zamiana)', PassiveJewels: 'Jewel w drzewku',
};

// Paper-doll layout like the in-game character panel (grid areas).
const AREA: Record<string, string> = {
  Weapon: 'weapon', Offhand: 'offhand', Helm: 'helm', BodyArmour: 'body', Gloves: 'gloves', Boots: 'boots',
  Amulet: 'amulet', Ring: 'ring', Ring2: 'ring2', Belt: 'belt',
};

const KEY = 'pricer-character';

export function CharacterView({ currency, divine, selectedId, onSelect }: Props) {
  const [list, setList] = useState<CharacterSummary[] | null>(null);
  const [name, setName] = useState<string>(() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } });
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function loadList() {
    setBusy('Pobieram listę postaci…');
    setError('');
    try {
      const l = await window.pricer.listCharacters();
      setList(l);
      if (l.length && !l.some((c) => c.name === name)) setName(l[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function load(prices = false) {
    if (!name) return;
    setBusy(prices ? 'Wyceniam ekwipunek – to może potrwać minutę (limity trade)…' : 'Pobieram ekwipunek…');
    setError('');
    try {
      setView(await window.pricer.character(name, prices));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  useEffect(() => { void loadList(); }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, name); } catch { /* ignore */ }
    if (name) void load(false);
  }, [name]);

  const asPriced = (e: EquippedItem): PricedItem => ({
    item: e.item,
    price: e.price ?? { itemId: e.item.id, source: 'none', chaos: null, low: null, high: null, confidence: 'low', sampleSize: 0, note: 'Kliknij „Wyceń ekwipunek”' },
    firstSeen: new Date().toISOString(),
  });
  const gearValue = view ? [...view.items, ...view.jewels].reduce((s, e) => s + (e.price?.chaos ?? 0), 0) : 0;
  const priced = view ? [...view.items, ...view.jewels].some((e) => e.price) : false;

  const slot = (e: EquippedItem) => {
    const { title } = displayName(e.item);
    return (
      <button
        key={e.item.id}
        className={`doll-slot ${rarityClass(e.item)} ${selectedId === e.item.id ? 'active' : ''}`}
        style={AREA[e.slot] ? { gridArea: AREA[e.slot] } : undefined}
        onClick={() => onSelect(asPriced(e))}
        title={`${SLOT_LABEL[e.slot] ?? e.slot}: ${title}`}
      >
        {e.item.icon
          ? <img src={e.item.icon} alt={title} loading="lazy" onError={(ev) => ev.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'doll-name', textContent: title }))} />
          : <span className="doll-name">{title}</span>}
        <span className="doll-label">{SLOT_LABEL[e.slot] ?? e.slot}</span>
        {e.price && <span className="doll-price">{formatPrice(e.price.chaos, currency, divine)}</span>}
      </button>
    );
  };

  return (
    <div className="character">
      <div className="char-head">
        <label>
          Postać
          <select value={name} onChange={(e) => setName(e.target.value)} disabled={!list?.length}>
            {!list?.length && <option value="">—</option>}
            {list?.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.class} {c.level} · {c.league}</option>)}
          </select>
        </label>
        <button className="btn ghost" onClick={() => void loadList()} disabled={!!busy}>↻ Lista postaci</button>
        <button className="btn" onClick={() => void load(true)} disabled={!!busy || !view}>Wyceń ekwipunek</button>
        {view && <a className="btn ghost" href={view.profileUrl} target="_blank" rel="noopener">Profil na pathofexile.com</a>}
      </div>
      {busy && <p className="muted"><span className="spinner" /> {busy}</p>}
      {error && (
        <div className="char-error">
          <p className="error-text">{error}</p>
          <p className="muted small">
            Postacie są czytane z publicznego profilu. Na pathofexile.com → My Account → Privacy Settings odznacz
            „Hide Characters”. Możesz też wpisać POESESSID w profilu aplikacji.
          </p>
        </div>
      )}
      {view && (
        <div className="char-body">
          <section className="char-card">
            <div className="char-title">{view.summary.name}</div>
            <div className="muted">{view.summary.class} · poziom {view.summary.level} · {view.summary.league}</div>
            <div className="muted small">Punkty pasywne: {view.passives}{view.masteries ? ` · mastery: ${view.masteries}` : ''} · jewele w drzewku: {view.jewels.length}</div>
            {priced && <div className="char-value">Wartość ekwipunku: <b>{formatPrice(gearValue, currency, divine)}</b></div>}
            <div className="doll">
              {view.items.filter((e) => AREA[e.slot]).map(slot)}
            </div>
            <div className="doll-row">
              {view.items.filter((e) => e.slot === 'Flask').map(slot)}
            </div>
            {view.jewels.length > 0 && <div className="doll-row">{view.jewels.map(slot)}</div>}
            {view.items.some((e) => !AREA[e.slot] && e.slot !== 'Flask') && (
              <div className="doll-row">{view.items.filter((e) => !AREA[e.slot] && e.slot !== 'Flask').map(slot)}</div>
            )}
          </section>
          <section className="char-card">
            <h3>Statystyki z ekwipunku</h3>
            <table className="char-stats">
              <tbody>
                {view.stats.map((s) => (
                  <tr key={s.label} className={s.kind === 'res' ? (s.value >= 75 ? 'capped' : 'uncapped') : ''}>
                    <td>{s.label}</td>
                    <td>{s.value}{s.unit ?? ''}{s.kind === 'res' && s.label !== 'Odporność na chaos' && s.value < 75 ? <span className="muted"> (brakuje {75 - s.value}%)</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Suma z przedmiotów i jeweli – bez drzewka, aur i flaszek. Odporności w grze są dodatkowo obniżone przez akt 10 (−60%) i można je podnieść drzewkiem.</p>
            <h3>Gemy</h3>
            <div className="char-gems">
              {view.items.filter((e) => e.gems.length).map((e) => (
                <div key={e.item.id} className="gem-group">
                  <span className="muted small">{SLOT_LABEL[e.slot] ?? e.slot}:</span> {e.gems.map((g) => g.typeLine || g.baseType).join(' · ')}
                </div>
              ))}
              {!view.items.some((e) => e.gems.length) && <span className="muted small">Brak gemów w ekwipunku.</span>}
            </div>
          </section>
        </div>
      )}
      {!view && !busy && !error && list?.length === 0 && <p className="muted">Na tym koncie nie ma postaci albo profil jest prywatny.</p>}
    </div>
  );
}
