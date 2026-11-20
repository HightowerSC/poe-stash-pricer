import type { Profile } from '../../shared/types';

type Prefs = Pick<Profile, 'notifyMode' | 'notifyMinChaos' | 'notifyUnit'>;

const MODES: { id: Profile['notifyMode']; label: string }[] = [
  { id: 'off', label: 'Wyłączone' },
  { id: 'valuable', label: 'Tylko wartościowe' },
  { id: 'all', label: 'Wszystkie' },
];

const HINT: Record<Profile['notifyMode'], string> = {
  off: 'Żadnych powiadomień – ani w systemie, ani na Discordzie, ani z obserwowania ulepszeń.',
  valuable: 'Powiadomienie (system i Discord) tylko o przedmiotach wartych co najmniej tyle:',
  all: 'Powiadomienie o każdym nowo wycenionym przedmiocie – może być ich dużo.',
};

/** Notifications: off / only valuable items (threshold in chaos or divine) / everything. */
export function NotifySettings({ value, onChange }: { value: Prefs; onChange(patch: Partial<Prefs>): void }) {
  return (
    <fieldset className="notify-settings">
      <legend>Powiadomienia</legend>
      <div className="seg" role="radiogroup" aria-label="Powiadomienia">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={value.notifyMode === m.id} className={value.notifyMode === m.id ? 'on' : ''} onClick={() => onChange({ notifyMode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <span className="hint">{HINT[value.notifyMode]}</span>
      {value.notifyMode === 'valuable' && (
        <div className="inline">
          <input
            type="number"
            min={0}
            step={value.notifyUnit === 'divine' ? 0.5 : 1}
            aria-label="Próg powiadomień"
            value={value.notifyMinChaos}
            onChange={(e) => onChange({ notifyMinChaos: Math.max(0, Number(e.target.value) || 0) })}
          />
          <select aria-label="Waluta progu" value={value.notifyUnit} onChange={(e) => onChange({ notifyUnit: e.target.value as Profile['notifyUnit'] })}>
            <option value="chaos">chaos</option>
            <option value="divine">divine</option>
          </select>
        </div>
      )}
    </fieldset>
  );
}
