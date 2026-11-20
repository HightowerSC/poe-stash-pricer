// Program updates (desktop app, electron-updater + GitHub Releases): the state shown on the screen,
// readable release notes, and plain-language explanations of update errors.

export const RELEASES_URL = 'https://github.com/HightowerSC/poe-stash-pricer/releases/latest';

export type UpdateStatus =
  | 'idle' // nothing checked yet
  | 'checking'
  | 'available' // newer version found, not downloaded
  | 'not-available' // already the newest
  | 'downloading'
  | 'downloaded' // ready to install
  | 'error'
  | 'unsupported'; // running from source / not an installed copy

export interface UpdateError { title: string; detail: string; hint: string; raw?: string; manual: boolean }

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  /** Newest version on GitHub (when known). */
  version?: string;
  releaseDate?: string;
  /** Release notes as plain text. */
  notes?: string;
  progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number };
  error?: UpdateError;
  /** Why updating doesn't work in this copy (status 'unsupported'). */
  reason?: string;
  checkedAt?: string;
  /** Download new versions in the background as soon as they are found. */
  autoDownload: boolean;
  /** Shown once after a successful update: "updated from X". */
  justUpdatedFrom?: string;
  platform: string;
}

/** electron-updater gives release notes as HTML (from GitHub) or as a list per version. */
export function releaseNotesToText(notes: unknown): string {
  if (!notes) return '';
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (n && typeof n === 'object' ? `Wersja ${(n as { version?: string }).version ?? ''}\n${releaseNotesToText((n as { note?: unknown }).note)}` : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  if (typeof notes !== 'string') return '';
  return notes
    .replace(/\r/g, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*h[1-6][^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "1.2.10" > "1.2.9"; pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * Turns a technical error from electron-updater into something a player understands.
 * `manual` = show the "download the installer yourself" button.
 */
export function describeUpdateError(message: string, platform: string, phase: 'check' | 'download' | 'install' = 'check'): UpdateError {
  const raw = String(message || '').slice(0, 500);
  const m = raw.toLowerCase();
  const has = (...s: string[]) => s.some((x) => m.includes(x));

  if (has('enotfound', 'eai_again', 'err_internet_disconnected', 'err_name_not_resolved', 'err_network_changed', 'err_connection', 'econnrefused', 'econnreset', 'enetunreach', 'getaddrinfo', 'offline', 'socket hang up', 'err_proxy')) {
    return { title: 'Brak połączenia z internetem', detail: 'Nie udało się połączyć z GitHubem, gdzie są aktualizacje.', hint: 'Sprawdź internet i spróbuj ponownie. Program działa normalnie dalej – aktualizacja może poczekać.', raw, manual: false };
  }
  if (has('etimedout', 'timeout', 'timed out', 'err_timed_out')) {
    return { title: 'Serwer aktualizacji nie odpowiada', detail: 'Połączenie z GitHubem trwało za długo.', hint: 'Spróbuj za kilka minut.', raw, manual: false };
  }
  if (has('403', 'rate limit', 'ratelimit')) {
    return { title: 'GitHub chwilowo ogranicza zapytania', detail: 'Zbyt wiele sprawdzeń aktualizacji z tego adresu IP.', hint: 'Spróbuj za godzinę albo pobierz instalator ręcznie.', raw, manual: true };
  }
  if (has('404', 'cannot find latest', 'latest.yml', 'latest-linux.yml', 'no published versions', 'cannot find channel', 'unable to find latest version')) {
    return { title: 'Nowa wersja jeszcze się przygotowuje', detail: 'Na GitHubie nie ma jeszcze kompletnych plików aktualizacji (wydanie zwykle buduje się ok. 10 minut).', hint: 'Spróbuj ponownie za kilkanaście minut.', raw, manual: true };
  }
  if (has('sha512', 'checksum', 'integrity')) {
    return { title: 'Pobrany plik jest uszkodzony', detail: 'Plik aktualizacji nie zgadza się z sumą kontrolną (zwykle przerwane pobieranie).', hint: 'Kliknij „Spróbuj ponownie” – plik zostanie pobrany od nowa.', raw, manual: true };
  }
  if (has('enospc', 'no space')) {
    return { title: 'Brak miejsca na dysku', detail: 'Nie ma gdzie zapisać pobranej aktualizacji.', hint: 'Zwolnij trochę miejsca (ok. 200 MB) i spróbuj ponownie.', raw, manual: false };
  }
  if (platform === 'win32' && has('smart app control', 'not signed', 'publisher', 'signature', 'blocked', 'eperm', 'access is denied', 'odmowa dostępu', 'spawn', 'unknown system error')) {
    return {
      title: 'Windows zablokował instalator',
      detail: 'Instalator nie ma płatnego podpisu cyfrowego, więc Windows (Inteligentna kontrola aplikacji / Smart App Control albo antywirus) mógł go zatrzymać.',
      hint: 'Pobierz instalator ręcznie z GitHuba i uruchom go. Jeśli Windows dalej blokuje: Zabezpieczenia Windows → Kontrola aplikacji i przeglądarki → Inteligentna kontrola aplikacji. Twoje ustawienia i ceny zostaną zachowane.',
      raw,
      manual: true,
    };
  }
  if (has('eacces', 'eperm', 'permission denied', 'read-only', 'erofs')) {
    return platform === 'linux'
      ? { title: 'Brak uprawnień do podmiany pliku AppImage', detail: 'Plik programu leży w folderze, do którego nie można pisać.', hint: 'Przenieś plik .AppImage do swojego folderu domowego (np. ~/Aplikacje) i uruchom go stamtąd – albo pobierz nową wersję ręcznie.', raw, manual: true }
      : { title: 'Brak uprawnień', detail: 'System nie pozwolił zapisać lub uruchomić aktualizacji.', hint: 'Pobierz instalator ręcznie z GitHuba i uruchom go.', raw, manual: true };
  }
  const what = phase === 'download' ? 'pobrać' : phase === 'install' ? 'zainstalować' : 'sprawdzić';
  return { title: `Nie udało się ${what} aktualizacji`, detail: raw ? `Szczegóły: ${raw}` : 'Nieznany błąd.', hint: 'Spróbuj ponownie później albo pobierz instalator ręcznie z GitHuba.', raw, manual: true };
}

/** Message shown after the app started again but the version did not change (installer blocked or cancelled). */
export function failedInstallError(platform: string, target: string): UpdateError {
  return platform === 'win32'
    ? {
        title: `Aktualizacja do ${target} się nie zainstalowała`,
        detail: 'Program został zamknięty, ale instalator nie podmienił wersji. Najczęściej blokuje go Windows (Inteligentna kontrola aplikacji / Smart App Control), bo instalator nie ma płatnego podpisu.',
        hint: 'Pobierz instalator ręcznie z GitHuba i uruchom go. Jeśli Windows dalej blokuje: Zabezpieczenia Windows → Kontrola aplikacji i przeglądarki → Inteligentna kontrola aplikacji. Ustawienia zostaną zachowane.',
        manual: true,
      }
    : {
        title: `Aktualizacja do ${target} się nie zainstalowała`,
        detail: 'Program uruchomił się ponownie w starej wersji.',
        hint: 'Upewnij się, że uruchamiasz plik .AppImage z folderu, do którego możesz pisać (np. folder domowy), albo pobierz nową wersję ręcznie.',
        manual: true,
      };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
