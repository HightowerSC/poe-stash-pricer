// One shared gate for every request to pathofexile.com (trade search/fetch/exchange, stat data,
// stash and character endpoints). GGG limits requests per IP and per account, with separate
// policies for search and fetch; going over them means 429 and a timeout that grows with each
// offence. So:
//  - every request waits in ONE global queue, one request at a time,
//  - each policy (search, fetch, exchange, …) keeps its own window of sent requests and obeys the
//    limits GGG reports in X-Rate-Limit-* headers (with a safety margin, because the user may be
//    browsing the trade site from the same IP at the same time),
//  - Retry-After and the "restricted" part of the state header block that policy,
//  - the queue is ordered by priority: a Ctrl+C check goes before background jobs,
//  - identical queries are answered from a short cache or joined while in flight.

import { AsyncLocalStorage } from 'node:async_hooks';

export type TradePriority = 'interactive' | 'normal' | 'background';
export type PolicyKey = 'search' | 'fetch' | 'exchange' | 'data' | 'stash' | 'character';

const PRIORITY: Record<TradePriority, number> = { interactive: 0, normal: 1, background: 2 };

/** Mutable on purpose: a higher-priority caller joining a shared query raises it for the whole job. */
interface PriorityBox { p: number }
const context = new AsyncLocalStorage<PriorityBox>();

/** Runs fn with the given trade priority for every request it makes (also nested ones). */
export function withTradePriority<T>(priority: TradePriority, fn: () => Promise<T>): Promise<T> {
  return context.run({ p: PRIORITY[priority] }, fn);
}

function currentBox(): PriorityBox {
  return context.getStore() ?? { p: PRIORITY.normal };
}

/** True inside withTradePriority('interactive', …) – the user is waiting for the answer. */
export function isInteractive(): boolean {
  return currentBox().p === PRIORITY.interactive;
}

export function policyFor(url: string): PolicyKey {
  if (url.includes('/api/trade/search/')) return 'search';
  if (url.includes('/api/trade/fetch/')) return 'fetch';
  if (url.includes('/api/trade/exchange/')) return 'exchange';
  if (url.includes('/get-stash-items')) return 'stash';
  if (url.includes('/character-window/')) return 'character';
  return 'data';
}

export interface Limit { max: number; period: number }

/** Conservative limits used until GGG tells us the real ones (they change, so headers win). */
const DEFAULTS: Record<PolicyKey, Limit[]> = {
  search: [{ max: 5, period: 10 }, { max: 15, period: 60 }, { max: 30, period: 300 }],
  exchange: [{ max: 5, period: 10 }, { max: 15, period: 60 }, { max: 30, period: 300 }],
  fetch: [{ max: 12, period: 4 }, { max: 16, period: 12 }],
  data: [{ max: 5, period: 10 }],
  stash: [{ max: 15, period: 60 }],
  character: [{ max: 30, period: 60 }],
};

/** Use only part of each limit: other tabs/tools on the same IP count too. */
export function safeMax(max: number): number {
  return Math.max(1, Math.floor(max * 0.8));
}

/** "8:10:60,15:60:120" → [[8,10,60],[15,60,120]] (limit = max:period:penalty, state = hits:period:restricted). */
export function parseTriples(header: string | null): number[][] {
  if (!header) return [];
  return header.split(',').map((part) => part.trim().split(':').map(Number)).filter((t) => t.length >= 2 && t.every(Number.isFinite));
}

export class Policy {
  limits: Limit[];
  /** Times (ms) of requests we sent, newest last. */
  private stamps: number[] = [];
  blockedUntil = 0;

  constructor(key: PolicyKey) {
    this.limits = DEFAULTS[key].map((l) => ({ ...l }));
  }

  /** Earliest time another request may be sent. */
  nextAllowed(now: number): number {
    let at = Math.max(now, this.blockedUntil);
    for (const lim of this.limits) {
      const allowed = safeMax(lim.max);
      const inWindow = this.stamps.filter((t) => t > now - lim.period * 1000);
      if (inWindow.length >= allowed) {
        // wait until enough old requests leave the window (+ a little slack for clock jitter)
        at = Math.max(at, inWindow[inWindow.length - allowed] + lim.period * 1000 + 300);
      }
    }
    return at;
  }

  stamp(now: number) {
    this.stamps.push(now);
    const longest = Math.max(...this.limits.map((l) => l.period), 300) * 1000;
    while (this.stamps.length && this.stamps[0] <= now - longest) this.stamps.shift();
  }

  /** Learn the real limits and current usage from the response headers. */
  update(headers: Headers, now: number) {
    const rules = (headers.get('x-rate-limit-rules') ?? '').split(',').map((r) => r.trim()).filter(Boolean);
    if (!rules.length) return;
    const limits: Limit[] = [];
    for (const rule of rules) {
      const lims = parseTriples(headers.get(`x-rate-limit-${rule}`));
      const states = parseTriples(headers.get(`x-rate-limit-${rule}-state`));
      lims.forEach(([max, period], i) => {
        if (max > 0 && period > 0) limits.push({ max, period });
        const st = states[i];
        if (!st) return;
        const [hits, , restricted] = st;
        if (restricted > 0) this.blockedUntil = Math.max(this.blockedUntil, now + restricted * 1000 + 500);
        // The server counted more than we did (other tools, the browser) → assume they just happened.
        const ours = this.stamps.filter((t) => t > now - period * 1000).length;
        for (let k = ours; k < Math.min(hits, max); k++) this.stamps.push(now);
      });
    }
    if (limits.length) this.limits = limits;
    this.stamps.sort((a, b) => a - b);
  }

  on429(retryAfterSeconds: number, now: number) {
    this.blockedUntil = Math.max(this.blockedUntil, now + Math.max(retryAfterSeconds, 1) * 1000 + 500);
  }
}

export interface TradeLimitStatus {
  /** Seconds until the next queued request may go (0 = nothing waiting on the limit). */
  waitSeconds: number;
  /** Requests waiting in the queue. */
  queued: number;
  /** Which kind of request is waiting (search / fetch / …). */
  policy?: PolicyKey;
}

interface Job {
  box: PriorityBox;
  seq: number;
  policy: PolicyKey;
  enqueuedAt: number;
  maxWaitMs?: number;
  attempts: number;
  run: () => Promise<Response>;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
}

const MAX_429_RETRIES = 2;
const CACHE_LIMIT = 400;

export class TradeGate {
  private policies = new Map<PolicyKey, Policy>();
  private queue: Job[] = [];
  private seq = 0;
  private pumping = false;
  private wake: (() => void) | null = null;
  private listeners = new Set<(s: TradeLimitStatus) => void>();
  private lastStatus = '';
  private cache = new Map<string, { until: number; value: unknown }>();
  private inflight = new Map<string, { promise: Promise<unknown>; box: PriorityBox }>();

  constructor(private readonly now: () => number = Date.now, private readonly sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {}

  policy(key: PolicyKey): Policy {
    let p = this.policies.get(key);
    if (!p) this.policies.set(key, (p = new Policy(key)));
    return p;
  }

  onStatus(cb: (s: TradeLimitStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  status(): TradeLimitStatus {
    return JSON.parse(this.lastStatus || '{"waitSeconds":0,"queued":0}') as TradeLimitStatus;
  }

  /**
   * Sends a request through the queue. 429 answers are retried (at most twice) after Retry-After;
   * if they keep coming, the 429 response is returned to the caller.
   * maxWaitMs: give up instead of waiting longer than this for the limit (interactive checks).
   */
  request(url: string, send: () => Promise<Response>, opts: { maxWaitMs?: number } = {}): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      this.queue.push({ box: currentBox(), seq: this.seq++, policy: policyFor(url), enqueuedAt: this.now(), maxWaitMs: opts.maxWaitMs, attempts: 0, run: send, resolve, reject });
      this.wake?.();
      void this.pump();
    });
  }

  /** Cached and de-duplicated call: same key → same answer for ttlMs, and only one request in flight. */
  async cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit && hit.until > now) return hit.value as T;
    const mine = currentBox();
    const running = this.inflight.get(key);
    if (running) {
      running.box.p = Math.min(running.box.p, mine.p);
      return running.promise as Promise<T>;
    }
    const box = { p: mine.p };
    const promise = context.run(box, produce).then((value) => {
      this.cache.set(key, { until: this.now() + ttlMs, value });
      if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
      return value;
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, { promise, box });
    return promise;
  }

  clearCache() {
    this.cache.clear();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const now = this.now();
        this.queue.sort((a, b) => a.box.p - b.box.p || a.seq - b.seq);
        // Highest priority job that may go now. A job waiting for its policy reserves that policy,
        // so lower-priority jobs can't use up the budget it waits for (other policies may still go).
        const reserved = new Set<PolicyKey>();
        let pick: Job | null = null;
        let wait = Infinity;
        let waitingPolicy: PolicyKey | undefined;
        for (const job of [...this.queue]) {
          if (reserved.has(job.policy)) continue;
          const at = this.policy(job.policy).nextAllowed(now);
          if (at <= now) { pick = job; break; }
          if (job.maxWaitMs != null && at - job.enqueuedAt > job.maxWaitMs) {
            this.queue.splice(this.queue.indexOf(job), 1);
            job.reject(new Error(`Limit zapytań trade (pathofexile.com) – spróbuj ponownie za ${Math.ceil((at - now) / 1000)} s.`));
            continue;
          }
          reserved.add(job.policy);
          if (at - now < wait) { wait = at - now; waitingPolicy = job.policy; }
        }
        if (!pick) {
          if (!this.queue.length) break;
          this.emit({ waitSeconds: Math.ceil(wait / 1000), queued: this.queue.length, policy: waitingPolicy });
          await new Promise<void>((resolve) => {
            this.wake = resolve;
            void this.sleep(Math.min(wait, 1000)).then(resolve);
          });
          this.wake = null;
          continue;
        }
        this.queue.splice(this.queue.indexOf(pick), 1);
        const policy = this.policy(pick.policy);
        policy.stamp(now);
        this.emit({ waitSeconds: 0, queued: this.queue.length });
        let res: Response;
        try {
          res = await pick.run();
        } catch (e) {
          pick.reject(e);
          continue;
        }
        const after = this.now();
        policy.update(res.headers, after);
        if (res.status === 429) {
          policy.on429(Number(res.headers.get('retry-after') ?? '60') || 60, after);
          if (pick.attempts < MAX_429_RETRIES) {
            pick.attempts++;
            this.queue.push(pick); // keeps its seq, so it stays first in line
            continue;
          }
        }
        pick.resolve(res);
      }
    } finally {
      this.pumping = false;
      this.emit({ waitSeconds: 0, queued: this.queue.length });
    }
  }

  private emit(s: TradeLimitStatus) {
    const key = JSON.stringify(s);
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.listeners.forEach((l) => l(s));
  }
}

/** The one gate shared by every TradeClient in the app. */
export const tradeGate = new TradeGate();

/** Short Polish text for the status line, '' when nothing is waiting. */
export function tradeLimitText(s: TradeLimitStatus): string {
  if (s.waitSeconds > 0) return `Czekam na limit trade, ${s.waitSeconds} s${s.queued > 1 ? ` (w kolejce: ${s.queued})` : ''}`;
  if (s.queued > 0) return `Zapytania trade w kolejce: ${s.queued}`;
  return '';
}
