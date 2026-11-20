import { useEffect, useMemo, useState } from 'react';
import type { CharacterView, UpgradeResult, UpgradeWatchState } from '../../shared/types';
import { diagnose, UPGRADE_CATEGORY } from '../../core/hub/upgrades';
import { buildAdvice } from '../../core/hub/build';
import { formatPrice } from '../format';

interface Props {
  view: CharacterView;
  slotLabel: Record<string, string>;
  currency: 'chaos' | 'divine';
  divine: number | null;
}

const SEV: Record<string, string> = { high: 'Ważne', medium: 'Warto', low: 'Drobne' };

/** PoE HUB: what to fix on this character, cheap bench fixes first, then trade upgrades per slot. */
export function HubPanel({ view, slotLabel, currency, divine }: Props) {
  const d = useMemo(() => diagnose(view), [view]);
  const build = useMemo(() => buildAdvice(view), [view]);
  const [watch, setWatch] = useState<UpgradeWatchState | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);

  useEffect(() => {
    const load = () => window.pricer.getUpgradeWatch().then(setWatch).catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  async function saveWatch(patch: Partial<UpgradeWatchState['settings']>) {
    if (!watch) return;
    const settings = { ...watch.settings, ...patch };
    if (patch.enabled && !settings.character) settings.character = view.summary.name;
    if (patch.enabled && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    setWatch({ ...watch, settings });
    setWatch(await window.pricer.saveUpgradeWatch(settings));
  }

  async function runWatch() {
    setWatchBusy(true);
    try { setWatch(await window.pricer.runUpgradeWatch()); } finally { setWatchBusy(false); }
  }
  const [results, setResults] = useState<Record<string, UpgradeResult | string>>({});
  const [busySlot, setBusySlot] = useState('');

  async function search(slot: string) {
    setBusySlot(slot);
    try {
      const r = await window.pricer.upgradeSearch(slot);
      setResults((x) => ({ ...x, [slot]: r }));
    } catch (e) {
      setResults((x) => ({ ...x, [slot]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusySlot('');
    }
  }

  const slots = view.items.filter((e) => UPGRADE_CATEGORY[e.slot] && e.item.frameType !== 3);
  const ninjaBuilds = `https://poe.ninja/builds?class=${encodeURIComponent(view.summary.class)}`;
  const label = (s: string) => slotLabel[s] ?? s;

  return (
    <section className="char-card hub">
      <h3>PoE HUB – co poprawić</h3>
      {d.issues.length === 0
        ? <p className="muted">Nie widzę oczywistych braków w ekwipunku. 👍</p>
        : (
          <ul className="hub-issues">
            {d.issues.map((i) => <li key={i.text} className={`sev-${i.severity}`}><span className="sev">{SEV[i.severity]}</span> {i.text}</li>)}
          </ul>
        )}

      {d.quickFixes.length > 0 && (
        <>
          <h4>Najtańsze poprawki – crafting bench</h4>
          <ul className="hub-fixes">
            {d.quickFixes.map((f) => (
              <li key={`${f.slot}|${f.craft}`}>
                <b>{label(f.slot)}</b> ({f.itemName}): <code>{f.craft}</code>
                <span className="muted"> · koszt {f.cost.amount} {f.cost.currency} · pomaga: {f.fixes}{!f.sure && ' · jeśli przedmiot ma wolny prefiks/sufiks'}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Ulepszenia z trade</h4>
      <p className="muted small">
        Szukam przedmiotu, który ma co najmniej tyle życia i odporności co obecny, plus część tego, czego Ci brakuje.
        {d.weakestSlots.length > 0 && <> Najsłabsze sloty: <b>{d.weakestSlots.map(label).join(', ')}</b>.</>}
      </p>
      <div className="hub-slots">
        {slots.map((e) => {
          const r = results[e.slot];
          return (
            <div key={e.slot} className={`hub-slot ${d.weakestSlots.includes(e.slot) ? 'weak' : ''}`}>
              <div className="hub-slot-head">
                <span><b>{label(e.slot)}</b> <span className="muted small">{e.item.name || e.item.typeLine}</span></span>
                <button className="btn ghost small" disabled={!!busySlot} onClick={() => void search(e.slot)}>
                  {busySlot === e.slot ? <><span className="spinner" /> Szukam…</> : 'Szukaj ulepszenia'}
                </button>
              </div>
              {typeof r === 'string' && <p className="error-text small">{r}</p>}
              {r && typeof r !== 'string' && (
                <div className="hub-result">
                  <div className="muted small">Szukam: {r.wants.join(', ')} · ofert: {r.total}</div>
                  {r.offers.length === 0
                    ? <p className="muted small">Brak ofert spełniających wszystkie warunki – spróbuj crafta z listy wyżej.</p>
                    : (
                      <ul>
                        {r.offers.slice(0, 5).map((o, i) => (
                          <li key={i} title={o.mods.join('\n')}>
                            <b>{o.chaos != null ? formatPrice(o.chaos, currency, divine) : `${o.amount} ${o.currency}`}</b> – {o.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  <a href={r.tradeUrl} target="_blank" rel="noopener">Otwórz wyszukiwanie na trade →</a>
                </div>
              )}
            </div>
          );
        })}
        {slots.length === 0 && <p className="muted small">Brak rare/magic ekwipunku do porównania.</p>}
      </div>

      <h4>Pilnuj tanich ulepszeń</h4>
      {watch && (
        <div className="hub-watch">
          <div className="inline">
            <label className="check">
              <input type="checkbox" checked={watch.settings.enabled} onChange={(e) => void saveWatch({ enabled: e.target.checked })} />
              Sprawdzaj co
            </label>
            <input type="number" min={15} step={5} value={watch.settings.everyMinutes} onChange={(e) => void saveWatch({ everyMinutes: Number(e.target.value) })} />
            <span>min, powiadom gdy ulepszenie kosztuje do</span>
            <input type="number" min={0} step={5} value={watch.settings.budgetChaos} onChange={(e) => void saveWatch({ budgetChaos: Number(e.target.value) })} />
            <span>chaos</span>
            <button className="btn ghost small" disabled={watchBusy || watch.running} onClick={() => void runWatch()}>
              {watchBusy || watch.running ? <><span className="spinner" /> Sprawdzam…</> : 'Sprawdź teraz'}
            </button>
          </div>
          <p className="muted small">
            Postać: <b>{watch.settings.character || view.summary.name}</b>
            {watch.settings.character && watch.settings.character !== view.summary.name && (
              <> · <button className="link" onClick={() => void saveWatch({ character: view.summary.name })}>pilnuj {view.summary.name}</button></>
            )}
            {' '}· sprawdzane są 3 najsłabsze sloty · powiadomienie w systemie{' '}i na Discordzie (jeśli ustawiony w profilu)
            {watch.lastRun && <> · ostatnio: {new Date(watch.lastRun).toLocaleTimeString()}</>}
          </p>
          {watch.lastError && <p className="error-text small">{watch.lastError}</p>}
          {watch.finds.length > 0 && (
            <ul className="hub-finds">
              {watch.finds.slice(0, 8).map((f) => (
                <li key={`${f.slot}|${f.name}|${f.chaos}|${f.at}`}>
                  <b>{formatPrice(f.chaos, currency, divine)}</b> – {label(f.slot)}: {f.name}
                  <span className="muted small"> · {new Date(f.at).toLocaleString()} · </span>
                  <a href={f.tradeUrl} target="_blank" rel="noopener">trade →</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h4>Pomoc w budowie postaci</h4>
      {build.length > 0 && (
        <ul className="hub-issues">
          {build.map((t) => <li key={t.text} className={`sev-${t.severity}`}><span className="sev">{t.area}</span> {t.text}</li>)}
        </ul>
      )}
      <ul className="hub-links">
        <li>
          <a href={ninjaBuilds} target="_blank" rel="noopener">Buildy klasy {view.summary.class} na poe.ninja</a>
          <span className="muted small"> – zobacz, co noszą inni gracze tej klasy (drzewko, unikaty, gemy).</span>
        </li>
        <li>
          Path of Building: <span className="muted small">Import/Export Build → wpisz nazwę konta → wybierz postać <b>{view.summary.name}</b> → Import. PoB policzy DPS i obronę z drzewkiem.</span>
        </li>
        <li><a href={view.profileUrl} target="_blank" rel="noopener">Profil postaci na pathofexile.com</a></li>
      </ul>
    </section>
  );
}
