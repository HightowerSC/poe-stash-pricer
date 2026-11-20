/** Step-by-step: where to find POESESSID. Shared by the wizard and the settings form. */
export function PoesessidHelp() {
  return (
    <ol className="howto">
      <li>Otwórz w przeglądarce <b>pathofexile.com</b> i zaloguj się na swoje konto.</li>
      <li>Naciśnij <b>F12</b> (narzędzia programisty).</li>
      <li>Chrome / Edge / Opera: zakładka <b>Application</b> (Aplikacja). Firefox: zakładka <b>Storage</b> (Dane).</li>
      <li>Po lewej: <b>Cookies</b> (Ciasteczka) → <b>https://www.pathofexile.com</b>.</li>
      <li>Znajdź wiersz <b>POESESSID</b>, kliknij dwa razy jego wartość (32 znaki), skopiuj i wklej tutaj.</li>
    </ol>
  );
}

export const POESESSID_NOTE =
  'POESESSID zostaje tylko w pliku ustawień na tym komputerze i jest wysyłany wyłącznie do pathofexile.com. Nikomu go nie podawaj – daje dostęp do konta. '
  + 'Po wylogowaniu na stronie przestaje działać – wtedy skopiuj nowy.';
