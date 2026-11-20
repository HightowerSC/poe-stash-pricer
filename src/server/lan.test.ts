import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as http from 'node:http';
import { LanPreview, PinGuard, publicSettings } from './lan';
import { newProfile } from '../core/config';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-'));
const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = async (req: http.IncomingMessage) => { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };
const settings = { activeProfileId: 'p', profiles: [newProfile({ id: 'p', accountName: 'Exile#1234', poesessid: 'a'.repeat(32), discordWebhook: 'https://discord.com/api/webhooks/1/x' })] };
const lan = new LanPreview(dir, 0, {
  serveStatic: (_req, res) => { res.writeHead(200); res.end('ui'); },
  json, readBody,
  api: (req, res, url) => json(res, 200, url === '/api/settings' ? publicSettings(settings) : { url }),
});
let base = '';

beforeAll(async () => {
  await lan.configure({ enabled: true, pin: '4321' });
  base = `http://127.0.0.1:${lan.boundPort}`;
});
afterAll(async () => { await lan.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('phone preview', () => {
  it('asks for the PIN, then serves read-only data without secrets', async () => {
    expect((await fetch(`${base}/api/items`)).status).toBe(401);
    expect((await fetch(`${base}/api/lan/login`, { method: 'POST', body: JSON.stringify({ pin: '0000' }) })).status).toBe(401);
    const ok = await fetch(`${base}/api/lan/login`, { method: 'POST', body: JSON.stringify({ pin: '4321' }) });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie')!.split(';')[0];
    const h = { headers: { cookie } };
    expect(await (await fetch(`${base}/api/health`, h)).json()).toEqual({ ok: true, readonly: true });
    expect(await (await fetch(`${base}/api/items`, h)).json()).toEqual({ url: '/api/items' });
    const s = await (await fetch(`${base}/api/settings`, h)).json();
    expect(s.profiles[0].poesessid).toBe('');
    expect(s.profiles[0].discordWebhook).toBe('');
    expect((await fetch(`${base}/api/start`, { method: 'POST', ...h })).status).toBe(403);
    expect((await fetch(`${base}/api/characters`, h)).status).toBe(403);
    expect((await fetch(`${base}/api/items`, { headers: { cookie, origin: 'http://evil.example' } })).status).toBe(403);
  });

  it('locks out after 5 wrong PINs', () => {
    const g = new PinGuard();
    for (let i = 0; i < 5; i++) g.fail('1.2.3.4', 1000);
    expect(g.locked('1.2.3.4', 2000)).toBe(true);
    expect(g.locked('1.2.3.4', 1000 + 5 * 60_000 + 1)).toBe(false);
    expect(g.locked('5.6.7.8', 2000)).toBe(false);
  });

  it('rejects bad PINs and keeps it off by default', async () => {
    await expect(lan.configure({ pin: '12' })).rejects.toThrow(/4 do 8 cyfr/);
    const fresh = new LanPreview(fs.mkdtempSync(path.join(os.tmpdir(), 'lan2-')), 0, { serveStatic: () => undefined, json, readBody, api: () => undefined });
    expect(fresh.status().enabled).toBe(false);
    expect(fresh.status().pin).toMatch(/^\d{6}$/);
  });
});
