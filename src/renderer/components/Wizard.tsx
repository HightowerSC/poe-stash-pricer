import { useEffect, useState } from 'react';
import type { League, Profile } from '../../shared/types';
import { newProfile, validateProfile } from '../../core/config';

interface Props {
  /** Saves the profile and starts watching. */
  onDone(p: Profile): void;
}

const STEPS = ['Witaj', 'Konto', 'Liga', 'Skrzynia', 'Gotowe'];

/** First run: one simple question per screen, with instructions where to find each thing. */
export function Wizard({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(newProfile());
  const [leagues, setLeagues] = useState<League[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void window.pricer.listLeagues().then(setLeagues).catch(() => undefined); }, []);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });

  function next() {
    setError('');
    if (step === 1 && !/^[^#\s]{3,}#\d{4}$/.test(p.accountName.trim())) {
      setError('Wpisz nazwę konta razem z numerem po znaku #, np. Exile#1234.');
      return;
    }
    if (step === 3 && p.stashSource === 'session' && !/^[0-9a-f]{32}$/i.test(p.poesessid.trim())) {
      setError('POESESSID ma 32 znaki (cyfry i litery a–f). Skopiuj go jeszcze raz albo wybierz publiczne zakładki.');
      return;
    }
    if (step === STEPS.length - 1) {
      const final = { ...p, accountName: p.accountName.trim(), name: p.accountName.trim().split('#')[0] || 'Mój profil' };
      const errs = validateProfile(final);
      if (errs.length) { setError(errs.join(' ')); return; }
      onDone(final);
      return;
    }
    setStep(step + 1);
  }

  return (
    <div className="wizard-steps">
      <ol className="steps">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{i < step ? '✓ ' : `${i + 1}. `}{s}</li>)}
      </ol>

      {step === 0 && (
        <div className="step">
          <h2>Co robi ten program?</h2>
          <ul>
            <li>Sprawdza przedmioty w Twojej skrzyni w Path of Exile i podaje ich cenę (poe.ninja + oferty z trade).</li>
            <li>Pokazuje, w której zakładce i na którym polu leży każdy przedmiot, a w grze może rysować ceny na skrzyni (overlay).</li>
            <li>Podpowiada, co sprzedać, co zostawić i jaki craft podniesie cenę.</li>
          </ul>
          <p className="muted">Ustawienie zajmie minutę. Twoje dane zostają tylko na tym komputerze.</p>
        </div>
      )}

      {step === 1 && (
        <div className="step">
          <h2>Jak nazywa się Twoje konto?</h2>
          <label>
            Nazwa konta z numerem
            <input autoFocus placeholder="np. Exile#1234" value={p.accountName} onChange={(e) => set('accountName', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
          </label>
          <p className="hint">Gdzie ją znaleźć: zaloguj się na <b>pathofexile.com</b> – nazwa z numerem (np. Exile#1234) jest w prawym górnym rogu. To nie jest nazwa postaci.</p>
          <label>
            Platforma
            <select value={p.realm} onChange={(e) => set('realm', e.target.value as Profile['realm'])}>
              <option value="pc">PC</option>
              <option value="xbox">Xbox</option>
              <option value="sony">PlayStation</option>
            </select>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="step">
          <h2>W której lidze grasz?</h2>
          <label>
            Liga
            <select value={p.league} onChange={(e) => set('league', e.target.value)}>
              <option value="auto">Automatycznie – bieżąca liga (polecane)</option>
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}{l.current ? ' (bieżąca)' : ''}</option>)}
            </select>
          </label>
          {p.league === 'auto' && (
            <label className="check">
              <input type="checkbox" checked={p.hardcore} onChange={(e) => set('hardcore', e.target.checked)} /> Gram w Hardcore
            </label>
          )}
          <p className="hint">„Automatycznie” samo przełączy się na nową ligę, gdy wystartuje.</p>
        </div>
      )}

      {step === 3 && (
        <div className="step">
          <h2>Skąd brać przedmioty?</h2>
          <button type="button" className={`choice ${p.stashSource === 'public' ? 'on' : ''}`} onClick={() => set('stashSource', 'public')}>
            <b>Publiczne zakładki (polecane, bez logowania)</b>
            <span>W grze kliknij prawym przyciskiem na zakładkę skrzyni, zaznacz <b>Public</b> i nie wpisuj ceny. Wrzucaj tam przedmioty – po ok. 5 minutach pojawią się w programie.</span>
          </button>
          <button type="button" className={`choice ${p.stashSource === 'session' ? 'on' : ''}`} onClick={() => set('stashSource', 'session')}>
            <b>Wszystkie zakładki, także prywatne (dla zaawansowanych)</b>
            <span>Wymaga ciasteczka POESESSID ze strony pathofexile.com. GGG może zablokować ten sposób – wtedy program to powie.</span>
          </button>
          {p.stashSource === 'session' && (
            <label>
              POESESSID
              <input type="password" autoComplete="off" placeholder="32 znaki" value={p.poesessid} onChange={(e) => set('poesessid', e.target.value.trim())} />
              <span className="hint">
                1. Zaloguj się na pathofexile.com w przeglądarce. 2. Naciśnij F12. 3. Zakładka Application (Chrome) albo Storage (Firefox) → Cookies → pathofexile.com.
                4. Skopiuj wartość <b>POESESSID</b>. Zostaje tylko na tym komputerze – nikomu go nie podawaj.
              </span>
            </label>
          )}
          <label>
            Tylko te zakładki (opcjonalnie)
            <input placeholder="puste = wszystkie" value={p.watchedTab} onChange={(e) => set('watchedTab', e.target.value)} />
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="step">
          <h2>Ostatnie szczegóły</h2>
          <label>
            Oznaczaj jako tanie przedmioty warte mniej niż (chaos)
            <input type="number" min={0} value={p.minValueChaos} onChange={(e) => set('minValueChaos', Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <label>
            Powiadamiaj o przedmiotach wartych co najmniej (chaos)
            <input type="number" min={0} value={p.notifyMinChaos} onChange={(e) => set('notifyMinChaos', Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <p className="hint">Po kliknięciu „Zapisz i uruchom” program pobierze ceny i sprawdzi Twoją skrzynię. Resztę opcji zmienisz w ⚙ Ustawieniach.</p>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      <div className="form-actions">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => { setError(''); setStep(step - 1); }}>Wstecz</button>}
        <button type="button" className="btn primary" onClick={next}>{step === STEPS.length - 1 ? 'Zapisz i uruchom' : 'Dalej'}</button>
      </div>
    </div>
  );
}
