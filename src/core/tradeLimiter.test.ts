import { describe, expect, it } from 'vitest';
import { Policy, TradeGate, policyFor, safeMax, tradeLimitText, withTradePriority } from './tradeLimiter';
import { TradeClient } from './trade';

/** Fake clock: sleep() advances time instantly. */
function fakeGate() {
  let t = 1_000_000;
  const gate = new TradeGate(() => t, async (ms) => { t += ms; await Promise.resolve(); });
  return { gate, now: () => t, advance: (ms: number) => { t += ms; } };
}

const ok = (headers: Record<string, string> = {}, status = 200, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('policyFor', () => {
  it('separates search, fetch, exchange and account endpoints', () => {
    expect(policyFor('https://www.pathofexile.com/api/trade/search/Covens')).toBe('search');
    expect(policyFor('https://www.pathofexile.com/api/trade/fetch/a,b?query=x')).toBe('fetch');
    expect(policyFor('https://www.pathofexile.com/api/trade/exchange/Covens')).toBe('exchange');
    expect(policyFor('https://www.pathofexile.com/character-window/get-stash-items?x')).toBe('stash');
    expect(policyFor('https://www.pathofexile.com/character-window/get-items?x')).toBe('character');
    expect(policyFor('https://www.pathofexile.com/api/trade/data/stats')).toBe('data');
  });
});

describe('Policy', () => {
  it('keeps a safety margin under the limit', () => {
    expect(safeMax(5)).toBe(4);
    expect(safeMax(1)).toBe(1);
    const p = new Policy('search');
    const now = 0;
    for (let i = 0; i < 4; i++) p.stamp(now);
    expect(p.nextAllowed(now)).toBeGreaterThan(now + 10_000); // 4 of 5 per 10 s used
  });

  it('learns limits, server-side usage and restrictions from headers', () => {
    const p = new Policy('fetch');
    const h = new Headers({
      'x-rate-limit-rules': 'Ip,Account',
      'x-rate-limit-ip': '10:5:10,30:60:300',
      'x-rate-limit-ip-state': '9:5:0,9:60:0',
      'x-rate-limit-account': '3:5:60',
      'x-rate-limit-account-state': '1:5:0',
    });
    p.update(h, 1000);
    expect(p.limits).toEqual([{ max: 10, period: 5 }, { max: 30, period: 60 }, { max: 3, period: 5 }]);
    expect(p.nextAllowed(1000)).toBeGreaterThan(1000); // 9 hits seen by the server, safe max is 8
    p.update(new Headers({ 'x-rate-limit-rules': 'Ip', 'x-rate-limit-ip': '10:5:10', 'x-rate-limit-ip-state': '0:5:42' }), 2000);
    expect(p.blockedUntil).toBeGreaterThanOrEqual(2000 + 42_000);
  });
});

describe('TradeGate', () => {
  it('waits for Retry-After on 429 and retries', async () => {
    const { gate, now } = fakeGate();
    const start = now();
    let calls = 0;
    const res = await gate.request('https://x/api/trade/search/L', async () => (++calls === 1 ? ok({ 'retry-after': '30' }, 429) : ok()));
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(now() - start).toBeGreaterThanOrEqual(30_000);
  });

  it('paces bursts so the limit is never exceeded', async () => {
    const { gate, now } = fakeGate();
    const sent: number[] = [];
    await Promise.all(Array.from({ length: 10 }, () => gate.request('https://x/api/trade/search/L', async () => { sent.push(now()); return ok(); })));
    // defaults 5:10 → at most 4 per 10 s
    for (let i = 4; i < sent.length; i++) expect(sent[i] - sent[i - 4]).toBeGreaterThanOrEqual(10_000);
  });

  it('serves interactive requests before queued background ones', async () => {
    const { gate } = fakeGate();
    const order: string[] = [];
    const send = (name: string) => async () => { order.push(name); return ok(); };
    const url = 'https://x/api/trade/search/L';
    const bg = Array.from({ length: 6 }, (_, i) => withTradePriority('background', () => gate.request(url, send(`bg${i}`))));
    const fg = withTradePriority('interactive', () => gate.request(url, send('ctrl+c')));
    await Promise.all([...bg, fg]);
    expect(order.indexOf('ctrl+c')).toBeLessThanOrEqual(1);
  });

  it('caches and de-duplicates identical queries', async () => {
    const { gate, advance } = fakeGate();
    let n = 0;
    const produce = async () => ++n;
    const [a, b] = await Promise.all([gate.cached('k', 1000, produce), gate.cached('k', 1000, produce)]);
    expect([a, b, n]).toEqual([1, 1, 1]);
    expect(await gate.cached('k', 1000, produce)).toBe(1);
    advance(1500);
    expect(await gate.cached('k', 1000, produce)).toBe(2);
  });

  it('reports the wait in Polish', async () => {
    const { gate } = fakeGate();
    const seen: string[] = [];
    gate.onStatus((s) => { const t = tradeLimitText(s); if (t) seen.push(t); });
    gate.policy('search').on429(5, 1_000_000);
    await gate.request('https://x/api/trade/search/L', async () => ok());
    expect(seen.some((t) => /Czekam na limit trade, \d+ s/.test(t))).toBe(true);
  });
});

describe('TradeClient through the gate', () => {
  it('sends one search for two identical queries', async () => {
    const { gate } = fakeGate();
    let posts = 0;
    const fetchFn = async () => { posts++; return ok({}, 200, { id: 'q', result: ['a'], total: 1 }); };
    const client = new TradeClient(fetchFn as any, '', undefined, gate);
    const q = { query: { name: 'Headhunter' } };
    const [a, b] = await Promise.all([client.search('Covens', q), client.search('Covens', q)]);
    expect(a).toEqual(b);
    expect(posts).toBe(1);
  });
});

describe('trade mode', () => {
  it('saver mode uses half of each limit and keeps answers longer', async () => {
    const { applyTradeMode } = await import('./tradeLimiter');
    const { gate } = fakeGate();
    applyTradeMode('saver', gate);
    expect(safeMax(16)).toBe(8);
    expect(gate.ttlScale).toBe(6);
    applyTradeMode('normal', gate);
    expect(safeMax(16)).toBe(12);
  });

  it('counts requests of the last hour', async () => {
    const { gate, advance } = fakeGate();
    await gate.request('https://x/api/trade/fetch/a', async () => ok());
    await gate.request('https://x/api/trade/fetch/b', async () => ok());
    expect(gate.lastHour()).toBe(2);
    advance(3_600_001);
    expect(gate.lastHour()).toBe(0);
  });
});
