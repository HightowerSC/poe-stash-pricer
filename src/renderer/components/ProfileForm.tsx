import { useEffect, useState } from 'react';
import type { League, Profile } from '../../shared/types';
import { isDiscordWebhook, newProfile, validateProfile } from '../../core/config';

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
        Skąd brać przedmioty
        <select value={p.stashSource} onChange={(e) => set('stashSource', e.target.value as Profile['stashSource'])}>
          <option value="public">Publiczne zakładki (przez trade, bez logowania)</option>
          <option value="session">Wszystkie zakładki, także prywatne (POESESSID)</option>
        </select>
        <span className="hint">
          {p.stashSource === 'public'
            ? 'W grze ustaw zakładki jako „Public” bez ceny. Przedmioty pojawią się tu po ok. 5 minutach.'
            : 'Czyta wszystkie zakładki od razu, bez ustawiania „Public”. GGG może zablokować ten sposób (błąd 403) – wtedy wróć do publicznych zakładek.'}
        </span>
      </label>
      {p.stashSource === 'session' && (
        <label>
          POESESSID
          <input type="password" autoComplete="off" placeholder="32 znaki z ciasteczek pathofexile.com" value={p.poesessid} onChange={(e) => set('poesessid', e.target.value.trim())} />
          <span className="hint">
            Zaloguj się na pathofexile.com → F12 → Application (Aplikacja) → Cookies → POESESSID → skopiuj wartość.
            Zostaje tylko w pliku ustawień na tym komputerze i trafia wyłącznie do pathofexile.com. Nikomu go nie podawaj – daje dostęp do konta.
          </span>
        </label>
      )}
      <label>
        Tylko te zakładki (opcjonalnie)
        <input placeholder="puste = wszystkie; kilka po przecinku, np. Inbox, Sprzedaż" value={p.watchedTab} onChange={(e) => set('watchedTab', e.target.value)} />
      </label>
      <div className="row">
        <label>
          Powiadom od (chaos)
          <input type="number" min={0} value={p.notifyMinChaos} onChange={(e) => set('notifyMinChaos', Number(e.target.value))} />
        </label>
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
        Webhook Discord (opcjonalnie)
        <div className="inline">
          <input placeholder="https://discord.com/api/webhooks/…" value={p.discordWebhook} onChange={(e) => set('discordWebhook', e.target.value)} />
          <button type="button" className="btn ghost" disabled={!isDiscordWebhook(p.discordWebhook)} onClick={testDiscord}>{discordState || 'Test'}</button>
        </div>
        <span className="hint">Powiadomienia o drogich dropach na Twój kanał. Discord → Ustawienia kanału → Integracje → Webhooki.</span>
      </label>
      <label className="check wide">
        <input type="checkbox" checked={p.usePoeprices} onChange={(e) => set('usePoeprices', e.target.checked)} />
        Druga opinia z poeprices.info dla przedmiotów rare (wolniejsze, serwis bywa niedostępny)
      </label>
      {errors.length > 0 && <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Anuluj</button>}
        <button type="submit" className="btn primary">Zapisz</button>
      </div>
    </form>
  );
}
