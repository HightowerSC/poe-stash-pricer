// Phone preview over the local network: a second listener on 0.0.0.0, OFF by default.
// Read-only (only GET routes the UI needs), protected by a PIN, with a lockout after wrong PINs.
// Secrets (POESESSID, Discord webhook) are never sent to the phone.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AppSettings } from '../shared/types';

export interface LanConfig {
  enabled: boolean;
  pin: string;
}

export interface LanStatus extends LanConfig {
  port: number;
  running: boolean;
  urls: string[];
  error: string | null;
}

/** GET routes the phone may read. Everything else (all POSTs) is refused. */
export const LAN_READ_ROUTES = new Set([
  '/api/health', '/api/settings', '/api/items', '/api/session', '/api/checks', '/api/challenges',
  '/api/farm', '/api/flip', '/api/upgrade-watch', '/api/leagues', '/api/events', '/api/export.csv',
]);

export const PIN_RE = /^\d{4,8}$/;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const COOKIE = 'pricer_lan';

export function publicSettings(s: AppSettings): AppSettings {
  return { ...s, profiles: s.profiles.map((p) => ({ ...p, poesessid: '', discordWebhook: '' })) };
}

export function samePin(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function newPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Private IPv4 addresses of this computer (what the phone types in). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
    }
  }
  return out;
}

/** Tracks wrong PINs per address. */
export class PinGuard {
  private fails = new Map<string, { n: number; until: number }>();
  locked(ip: string, now = Date.now()): boolean {
    const f = this.fails.get(ip);
    return !!f && f.until > now;
  }
  fail(ip: string, now = Date.now()) {
    const f = this.fails.get(ip) ?? { n: 0, until: 0 };
    f.n++;
    if (f.n >= MAX_FAILS) { f.until = now + LOCK_MS; f.n = 0; }
    this.fails.set(ip, f);
  }
  ok(ip: string) {
    this.fails.delete(ip);
  }
}

interface Deps {
  serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void;
  json(res: http.ServerResponse, status: number, body: unknown): void;
  readBody(req: http.IncomingMessage): Promise<any>;
  api(req: http.IncomingMessage, res: http.ServerResponse, url: string): Promise<void> | void;
}

export class LanPreview {
  private server: http.Server | null = null;
  private tokens = new Set<string>();
  private guard = new PinGuard();
  private error: string | null = null;
  private config: LanConfig;

  constructor(private readonly dataDir: string, private readonly port: number, private readonly deps: Deps) {
    this.config = this.load();
  }

  private file() {
    return path.join(this.dataDir, 'lan.json');
  }

  private load(): LanConfig {
    try {
      const c = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
      return { enabled: !!c.enabled, pin: PIN_RE.test(c.pin) ? c.pin : newPin() };
    } catch {
      return { enabled: false, pin: newPin() };
    }
  }

  status(): LanStatus {
    return { ...this.config, port: this.port, running: !!this.server?.listening, urls: lanAddresses().map((a) => `http://${a}:${this.port}`), error: this.error };
  }

  async configure(body: Partial<LanConfig>): Promise<LanStatus> {
    const pin = body.pin === undefined ? this.config.pin : String(body.pin).trim();
    if (!PIN_RE.test(pin)) throw new Error('PIN musi mieć od 4 do 8 cyfr.');
    if (pin !== this.config.pin) this.tokens.clear();
    this.config = { enabled: body.enabled === undefined ? this.config.enabled : !!body.enabled, pin };
    fs.writeFileSync(this.file(), JSON.stringify(this.config, null, 2));
    await this.stop();
    this.start();
    await new Promise((r) => setTimeout(r, 150));
    return this.status();
  }

  start() {
    if (!this.config.enabled || this.server) return;
    this.error = null;
    const srv = http.createServer((req, res) => void this.handle(req, res));
    srv.on('error', (e: NodeJS.ErrnoException) => {
      this.error = e.code === 'EADDRINUSE' ? `Port ${this.port} jest zajęty.` : e.message;
      this.server = null;
    });
    srv.listen(this.port, '0.0.0.0');
    this.server = srv;
  }

  stop(): Promise<void> {
    const srv = this.server;
    this.server = null;
    this.tokens.clear();
    if (!srv) return Promise.resolve();
    srv.closeAllConnections?.();
    return new Promise((r) => srv.close(() => r()));
  }

  /** Actual listening port (differs from the configured one only when it was 0, in tests). */
  get boundPort(): number | null {
    const a = this.server?.address();
    return a && typeof a === 'object' ? a.port : null;
  }

  private authed(req: http.IncomingMessage): boolean {
    const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{48})`));
    return !!m && this.tokens.has(m[1]);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = (req.url ?? '/').split('?')[0];
    if (!url.startsWith('/api/')) return this.deps.serveStatic(req, res);
    const host = req.headers.host ?? '';
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) return this.deps.json(res, 403, { error: 'Niedozwolone źródło zapytania' });
    const ip = req.socket.remoteAddress ?? '?';

    if (url === '/api/lan/login' && req.method === 'POST') {
      if (this.guard.locked(ip)) return this.deps.json(res, 429, { error: 'Za dużo błędnych PIN-ów – spróbuj za 5 minut.' });
      let pin = '';
      try { pin = String((await this.deps.readBody(req)).pin ?? ''); } catch { /* bad body */ }
      if (!samePin(pin, this.config.pin)) {
        this.guard.fail(ip);
        return this.deps.json(res, 401, { error: 'Zły PIN.' });
      }
      this.guard.ok(ip);
      const token = randomBytes(24).toString('hex');
      this.tokens.add(token);
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
      return this.deps.json(res, 200, { ok: true });
    }
    if (!this.authed(req)) return this.deps.json(res, 401, { error: 'Podaj PIN.', needPin: true });
    if (req.method !== 'GET' || !LAN_READ_ROUTES.has(url)) return this.deps.json(res, 403, { error: 'Na telefonie działa tylko podgląd.' });
    if (url === '/api/health') return this.deps.json(res, 200, { ok: true, readonly: true });
    return this.deps.api(req, res, url);
  }
}
