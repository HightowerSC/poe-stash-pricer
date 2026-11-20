// Small HTTP helper: one User-Agent for every request, a concurrency cap and 429 handling.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const APP_VERSION = '0.1.0';

export function userAgent(contact: string): string {
  return `poe-stash-pricer/${APP_VERSION} (contact: ${contact || 'github.com/poe-stash-pricer'})`;
}

export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const REQUEST_TIMEOUT_MS = 20_000;

/** fetch with a timeout and a readable Polish error message instead of "fetch failed". */
export async function fetchTimed(fetchFn: FetchLike, url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const host = new URL(url).host;
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) {
    const reason = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      ? `brak odpowiedzi w ${Math.round(timeoutMs / 1000)} s`
      : e?.cause?.code ?? e?.message ?? String(e);
    throw new Error(`Nie można połączyć się z ${host} (${reason})`);
  }
}

/** Retries a 429 at most `retries` times, waiting as long as Retry-After says. */
export async function fetchWithRetry(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
  retries = 2,
  onWait?: (seconds: number) => void,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchTimed(fetchFn, url, init);
    if (res.status !== 429 || attempt >= retries) return res;
    const wait = Number(res.headers.get('retry-after') ?? '10');
    onWait?.(wait);
    await sleep(Math.min(Math.max(wait, 1), 120) * 1000);
  }
}
