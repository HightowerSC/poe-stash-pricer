import { useState } from 'react';
import { lanLogin } from '../httpApi';

/** Phone preview: asks for the PIN shown in the desktop app's settings. */
export function PinScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await lanLogin(pin.trim());
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="wizard-page">
      <form className="wizard pin-screen" onSubmit={submit}>
        <h1 className="brand">PoE Stash Pricer</h1>
        <p className="muted">Podgląd na telefonie. Wpisz PIN z aplikacji na komputerze (⚙ Ustawienia → Podgląd na telefonie).</p>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{4,8}" maxLength={8} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" disabled={busy || pin.length < 4}>{busy ? 'Sprawdzam…' : 'Otwórz podgląd'}</button>
      </form>
    </div>
  );
}
