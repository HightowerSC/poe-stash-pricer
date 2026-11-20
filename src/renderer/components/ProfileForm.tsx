import { useEffect, useState } from 'react';
import type { League, Profile } from '../../shared/types';
import { isDiscordWebhook, newProfile, validateProfile } from '../../core/config';
import { PoesessidHelp, POESESSID_NOTE } from './PoesessidHelp';
import { NotifySettings } from './NotifySettings';
import type { LanInfo } from '../../shared/api';

interface Props {
  initial?: Profile;
  onSave(p: Profile): void;
  onCancel?: () => void;
}

export function ProfileForm({ initial, onSave, onCancel }: Props) {
  const [p, setP] = useState<Profile>(initial ?? newProfile());
  const [leagues, setLeagues] = useState<League[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    void window.pricer.listLeagues().then(setLeagues);
  }, []);

  const [discordState, setDiscordState] = useState('');

  async function testDiscord() {
    setDiscordState('Wysyłam…');
    try {
      await window.pricer.testDiscord(p.discordWebhook.trim());
      setDiscordState('Wysłano ✓');
    } catch {
      setDiscordState('Błąd ✗');
    }
    setTimeout(() => setDiscordState(''), 2500);
  }

  const [clearState, setClearState] = useState('');
  async function clearItems(all: boolean) {
    const what = all ? 'ze WSZYSTKICH lig' : 'z bieżącej ligi';
    if (!window.confirm(`Usunąć zapamiętane przedmioty ${what}? Ceny, pozycje i lista „już widzianych” zostaną wyczyszczone, a przy następnym sprawdzeniu program pobierze skrzynię od nowa. Ustawienia i profile zostają.`)) return;
    setClearState('Czyszczę…');
    try {
      const r = await window.pricer.clearItems(all);
      setClearState(`Wyczyszczono (${r.removed} przedmiotów). Program pobierze skrzynię od nowa.`);
    } catch (e) {
      setClearState(`Błąd: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const [lan, setLan] = useState<LanInfo | null>(null);
  const [lanPin, setLanPin] = useState('');
  const [lanMsg, setLanMsg] = useState('');
  useEffect(() => {
    if (!initial) return;
    void window.pricer.getLan().then((l) => { setLan(l); setLanPin(l.pin); }).catch(() => undefined);
  }, []);
  async function saveLan(cfg: { enabled?: boolean; pin?: string }) {
    setLanMsg('');
    try { const l = await window.pricer.saveLan(cfg); setLan(l); setLanPin(l.pin); if (l.error) setLanMsg(l.error); }
    catch (e) { setLanMsg(e instanceof Error ? e.message : String(e)); }
  }

  const [withSecrets, setWithSecrets] = useState(false);
  const [backupState, setBackupState] = useState('');
  async function exportBackup() {
    try {
      const data = await window.pricer.exportBackup(withSecrets);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `poe-stash-pricer-kopia-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setBackupState(withSecrets ? 'Zapisano kopię (z POESESSID – nie udostępniaj tego pliku).' : 'Zapisano kopię (bez POESESSID i webhooka).');
    } catch (e) {
      setBackupState(`Błąd: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!window.confirm('Wczytać ustawienia z kopii? Profile o tych samych nazwach zostaną zastąpione.')) return;
      const r = await window.pricer.importBackup(data);
      setBackupState(`Wczytano ${r.profiles} profil(e) i ${r.files} plik(i). Przeładowuję…`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setBackupState(`Błąd: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateProfile(p);
    setErrors(errs);
    if (errs.length === 0) onSave({ ...p, accountName: p.accountName.trim(), discordWebhook: p.discordWebhook.trim() });
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Nazwa profilu
        <input value={p.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="row">
        <label>
          Platforma
          <select value={p.realm} onChange={(e) => set('realm', e.target.value as Profile['realm'])}>
            <option value="pc">PC</option>
            <option value="xbox">Xbox</option>
            <option value="sony">PlayStation</option>
          </select>
        </label>
        <label className="grow">
          Konto PoE (z numerem)
          <input placeholder="Exile#1234" value={p.accountName} onChange={(e) => set('accountName', e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label className="grow">
          Liga
          <select value={p.league} onChange={(e) => set('league', e.target.value)}>
            <option value="auto">Automatycznie – bieżąca liga</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}{l.current ? ' (bieżąca)' : ''}</option>)}
            {p.league !== 'auto' && !leagues.some((l) => l.id === p.league) && <option value={p.league}>{p.league}</option>}
          </select>
        </label>
        {p.league === 'auto' && (
          <label className="check">
            <input type="checkbox" checked={p.hardcore} onChange={(e) => set('hardcore', e.target.checked)} />
            Hardcore
          </label>
        )}
      </div>
      <label>
        Skąd brać Twoje przedmioty
        <select value={p.stashSource} onChange={(e) => set('stashSource', e.target.value as Profile['stashSource'])}>
          <option value="session">Cała skrzynia prosto z serwera GGG (POESESSID)</option>
          <option value="none">Bez skanowania skrzyni – tylko Ctrl+C w grze</option>
        </select>
        <span className="hint">Ceny zawsze pochodzą z poe.ninja i z ofert innych graczy na trade. Ctrl+C na przedmiocie w grze działa w obu trybach.</span>
      </label>
      {p.stashSource === 'session' && (
        <label>
          POESESSID
          <input type="password" autoComplete="off" placeholder="32 znaki z ciasteczek pathofexile.com" value={p.poesessid} onChange={(e) => set('poesessid', e.target.value.trim())} />
          <PoesessidHelp />
          <span className="hint">{POESESSID_NOTE}</span>
        </label>
      )}
      <label>
        Tylko te zakładki (opcjonalnie)
        <input placeholder="puste = wszystkie; kilka po przecinku, np. Inbox, Sprzedaż" value={p.watchedTab} onChange={(e) => set('watchedTab', e.target.value)} />
      </label>
      <div className="row">
        <label>
          Minimalna wartość (chaos)
          <input type="number" min={0} value={p.minValueChaos} onChange={(e) => set('minValueChaos', Number(e.target.value))} />
        </label>
        <label>
          Sprawdzaj co (s)
          <input type="number" min={120} step={30} value={p.pollSeconds} onChange={(e) => set('pollSeconds', Number(e.target.value))} />
        </label>
        <label>
          Przeliczaj ceny co (h)
          <input type="number" min={0} step={1} value={p.repriceHours} onChange={(e) => set('repriceHours', Number(e.target.value))} title="0 = wyłączone" />
        </label>
        <label>
          Pokazuj ceny w
          <select value={p.displayCurrency} onChange={(e) => set('displayCurrency', e.target.value as Profile['displayCurrency'])}>
            <option value="chaos">Chaos</option>
            <option value="divine">Divine</option>
          </select>
        </label>
      </div>
      <label>
        Zapytania do trade (pathofexile.com)
        <select value={p.tradeMode} onChange={(e) => set('tradeMode', e.target.value as Profile['tradeMode'])}>
          <option value="saver">Oszczędny (zalecany) – mało zapytań, bez ryzyka blokady</option>
          <option value="normal">Normalny – szybciej i dokładniej, więcej zapytań</option>
        </select>
        <span className="hint">
          Oszczędny: rare z trade tylko z min. 2 dobrymi modami, max 2 wyszukiwania na przedmiot, wyniki pamiętane 30 min,
          skrzynia czytana co 10 min, pilnowanie ulepszeń co 60 min, „Przelicz” pomija przedmioty wycenione z trade w ostatniej dobie i tanie.
          Waluta, karty, gemy i unikaty zawsze idą z poe.ninja – bez zapytań do trade.
        </span>
      </label>
      <NotifySettings value={p} onChange={(patch) => setP({ ...p, ...patch })} />
      <label>
        Webhook Discord (opcjonalnie)
        <div className="inline">
          <input placeholder="https://discord.com/api/webhooks/…" value={p.discordWebhook} onChange={(e) => set('discordWebhook', e.target.value)} />
          <button type="button" className="btn ghost" disabled={!isDiscordWebhook(p.discordWebhook)} onClick={testDiscord}>{discordState || 'Test'}</button>
        </div>
        <span className="hint">Powiadomienia (według ustawienia wyżej) także na Twój kanał. Discord → Ustawienia kanału → Integracje → Webhooki.</span>
      </label>
      <label className="check wide">
        <input type="checkbox" checked={p.usePoeprices} onChange={(e) => set('usePoeprices', e.target.checked)} />
        Druga opinia z poeprices.info dla przedmiotów rare (wolniejsze, serwis bywa niedostępny)
      </label>
      {initial && (
        <fieldset className="danger-zone">
          <legend>Dane o przedmiotach ze skrzyni</legend>
          <span className="hint">Przydaje się, gdy lista jest nieaktualna albo przedmioty nie mają pozycji w zakładkach. Ustawienia i profile nie są usuwane.</span>
          <div className="inline">
            <button type="button" className="btn ghost" onClick={() => void clearItems(false)}>Wyczyść przedmioty (bieżąca liga)</button>
            <button type="button" className="btn ghost danger" onClick={() => void clearItems(true)}>Wyczyść przedmioty (wszystkie ligi)</button>
          </div>
          {clearState && <span className="hint">{clearState}</span>}
        </fieldset>
      )}
      {initial && lan && !window.pricerReadOnly && (
        <fieldset className="danger-zone">
          <legend>Podgląd na telefonie</legend>
          <span className="hint">Otwórz listę cen, zakładki i farmę na telefonie w tej samej sieci Wi-Fi (tylko podgląd). Zabezpieczone PIN-em; POESESSID nie trafia na telefon. Używaj tylko w zaufanej sieci domowej – połączenie nie jest szyfrowane.</span>
          <label className="check wide">
            <input type="checkbox" checked={lan.enabled} onChange={(e) => void saveLan({ enabled: e.target.checked })} />
            Włącz podgląd na telefonie
          </label>
          <div className="inline">
            <span className="hint">PIN:</span>
            <input style={{ width: 120 }} inputMode="numeric" maxLength={8} value={lanPin} onChange={(e) => setLanPin(e.target.value.replace(/\D/g, ''))} />
            <button type="button" className="btn ghost" disabled={lanPin === lan.pin} onClick={() => void saveLan({ pin: lanPin })}>Zmień PIN</button>
          </div>
          {lan.enabled && lan.running && (
            <span className="hint">
              Na telefonie wpisz w przeglądarce: {lan.urls.length ? lan.urls.map((u) => <b key={u} className="lan-url">{u}</b>) : <b>adres IP tego komputera:{lan.port}</b>}
              {' '}i podaj PIN. Windows może zapytać o zgodę zapory – zezwól dla sieci prywatnej.
            </span>
          )}
          {lanMsg && <span className="hint error-text">{lanMsg}</span>}
        </fieldset>
      )}
      {initial && (
        <fieldset className="danger-zone">
          <legend>Kopia zapasowa ustawień</legend>
          <span className="hint">Profile, lista challenge'y i ustawienia pilnowania ulepszeń w jednym pliku – np. do przeniesienia na inny komputer.</span>
          <div className="inline">
            <button type="button" className="btn ghost" onClick={() => void exportBackup()}>Zapisz kopię do pliku</button>
            <label className="btn ghost file-btn">
              Wczytaj kopię z pliku
              <input type="file" accept="application/json,.json" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          <label className="check wide">
            <input type="checkbox" checked={withSecrets} onChange={(e) => setWithSecrets(e.target.checked)} />
            Dołącz POESESSID i webhook Discord (plik będzie wtedy poufny)
          </label>
          {backupState && <span className="hint">{backupState}</span>}
        </fieldset>
      )}
      {errors.length > 0 && <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Anuluj</button>}
        <button type="submit" className="btn primary">Zapisz</button>
      </div>
    </form>
  );
}
