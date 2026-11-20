// Local web server: serves the UI and a small JSON API on http://localhost:5317.
// The browser cannot call poe.ninja / pathofexile.com directly (CORS), so the server does it.
// It listens on 127.0.0.1 only. The optional phone preview (lan.ts) is a separate, read-only, PIN-protected listener.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { PricerService, type ServiceEvent } from '../core/service';
import { isDiscordWebhook } from '../core/config';
import { LanPreview, publicSettings } from './lan';
import { IconCache } from './icons';

const PORT = Number(process.env.PORT ?? 5317);
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '../../dist');
const DATA_DIR = process.env.POE_PRICER_DATA ?? path.join(os.homedir(), '.poe-stash-pricer');

const service = new PricerService(DATA_DIR);
const clients = new Set<http.ServerResponse>();
const icons = new IconCache(DATA_DIR);

service.on((e: ServiceEvent) => {
  if (e.type === 'status') console.log(`[${new Date().toLocaleTimeString()}] ${e.payload.error ? 'BŁĄD: ' : ''}${e.payload.text}`);
  if (e.type === 'notify') console.log(`[${new Date().toLocaleTimeString()}] Nowy przedmiot: ${e.payload.title} – ${e.payload.body}`);
  const data = `event: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`;
  for (const c of clients) c.write(data);
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body ?? null));
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error('Za duże zapytanie');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Brak zbudowanego interfejsu – uruchom: npm run build');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
}

/** Rejects requests from other websites (DNS rebinding / CSRF): only our own origin may call the API. */
function sameOrigin(req: http.IncomingMessage): boolean {
  const host = req.headers.host ?? '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: string): Promise<void> {
  try {
    if (req.method === 'GET' && url === '/api/icon') {
      const u = new URL(req.url ?? '', 'http://localhost').searchParams.get('u') ?? '';
      const icon = await icons.get(u);
      res.writeHead(200, { 'Content-Type': icon.type, 'Cache-Control': 'max-age=604800' });
      res.end(icon.body);
      return;
    }
    const route = `${req.method} ${url}`;
    switch (route) {
      case 'GET /api/health': return json(res, 200, { ok: true, dataDir: DATA_DIR });
      case 'GET /api/settings': return json(res, 200, service.getSettings());
      case 'POST /api/settings': service.saveSettings(await readBody(req)); return json(res, 200, { ok: true });
      case 'GET /api/leagues': return json(res, 200, await service.listLeagues());
      case 'GET /api/items': return json(res, 200, service.getItems());
      case 'GET /api/session': return json(res, 200, service.getSession());
      case 'POST /api/session/reset': service.resetSession(); return json(res, 200, { ok: true });
      case 'POST /api/start': {
        const body = await readBody(req);
        return json(res, 200, await service.start(!!body.demo));
      }
      case 'POST /api/craft': {
        const { id } = await readBody(req);
        return json(res, 200, await service.craftAdvice(String(id ?? '')));
      }
      case 'POST /api/reprice': {
        const { ids } = await readBody(req);
        return json(res, 200, await service.reprice(Array.isArray(ids) ? ids.map(String) : undefined));
      }
      case 'GET /api/characters': return json(res, 200, await service.listCharacters());
      case 'POST /api/character': {
        const { name, prices } = await readBody(req);
        return json(res, 200, await service.character(String(name ?? ''), !!prices));
      }
      case 'POST /api/items/clear': {
        const { all } = await readBody(req);
        return json(res, 200, await service.clearItems(!!all));
      }
      case 'POST /api/check': {
        const { text } = await readBody(req);
        return json(res, 200, await service.checkText(String(text ?? '')));
      }
      case 'GET /api/checks': return json(res, 200, service.getChecks());
      case 'GET /api/challenges': return json(res, 200, await service.getChallenges());
      case 'POST /api/challenges': return json(res, 200, await service.saveChallenges((await readBody(req)).list));
      case 'POST /api/challenges/sync': return json(res, 200, await service.syncChallenges(!!(await readBody(req)).force));
      case 'POST /api/upgrade': {
        const { slot } = await readBody(req);
        return json(res, 200, await service.upgradeSearch(String(slot ?? '')));
      }
      case 'GET /api/upgrade-watch': return json(res, 200, service.getUpgradeWatch());
      case 'POST /api/upgrade-watch': return json(res, 200, service.saveUpgradeWatch((await readBody(req)).settings));
      case 'POST /api/upgrade-watch/run': return json(res, 200, await service.runUpgradeWatch(true));
      case 'POST /api/backup/export': return json(res, 200, service.exportBackup(!!(await readBody(req)).withSecrets));
      case 'POST /api/backup/import': return json(res, 200, service.importBackup((await readBody(req)).backup));
      case 'POST /api/pob': return json(res, 200, await service.pobShopping(String((await readBody(req)).input ?? '')));
      case 'GET /api/farm': return json(res, 200, service.getFarm());
      case 'POST /api/farm/start': { const b = await readBody(req); return json(res, 200, service.startFarm(b.strategy, b.costPerMap)); }
      case 'POST /api/farm/finish': { const b = await readBody(req); return json(res, 200, service.finishFarm(b.maps, b.extraChaos, b.notes)); }
      case 'POST /api/farm/cancel': return json(res, 200, service.cancelFarm());
      case 'POST /api/farm/delete': return json(res, 200, service.deleteFarmRun(String((await readBody(req)).id ?? '')));
      case 'GET /api/flip': return json(res, 200, service.getFlips());
      case 'POST /api/flip/scan': return json(res, 200, await service.scanFlips());
      case 'POST /api/stop': service.stop(); return json(res, 200, { ok: true });
      case 'POST /api/discord/test': {
        const { webhook } = await readBody(req);
        if (!isDiscordWebhook(String(webhook ?? ''))) return json(res, 400, { error: 'Nieprawidłowy webhook' });
        await service.testDiscord(webhook);
        return json(res, 200, { ok: true });
      }
      case 'GET /api/export.csv':
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${service.exportFileName()}"`,
        });
        res.end(service.exportCsv());
        return;
      case 'GET /api/events':
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': ok\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      default:
        return json(res, 404, { error: 'Nie ma takiego adresu' });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`[${new Date().toLocaleTimeString()}] BŁĄD ${req.method} ${url}: ${message}`);
    return json(res, 500, { error: message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (!url.startsWith('/api/')) return serveStatic(req, res);
  if (!sameOrigin(req)) return json(res, 403, { error: 'Niedozwolone źródło zapytania' });
  if (url === '/api/lan' && req.method === 'GET') return json(res, 200, lan.status());
  if (url === '/api/lan' && req.method === 'POST') {
    try { return json(res, 200, await lan.configure(await readBody(req))); } catch (e) { return json(res, 400, { error: e instanceof Error ? e.message : String(e) }); }
  }
  return handleApi(req, res, url);
});

// Phone preview on the local network (off by default, PIN, read-only).
const lan = new LanPreview(DATA_DIR, Number(process.env.LAN_PORT ?? 5318), {
  serveStatic,
  json,
  readBody,
  api: (req, res, url) => (url === '/api/settings' && req.method === 'GET' ? json(res, 200, publicSettings(service.getSettings())) : handleApi(req, res, url)),
});
lan.start();

// Keep event streams alive through proxies/antivirus.
setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25_000).unref();

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  PoE Stash Pricer działa:  ${url}`);
  console.log(`  Dane zapisywane w:        ${DATA_DIR}`);
  console.log('  Zamknij to okno (albo Ctrl+C), aby wyłączyć.\n');
  console.log("  This product isn't affiliated with or endorsed by Grinding Gear Games in any way.\n");
  if (process.env.NO_OPEN !== '1' && process.env.PRICER_EMBEDDED !== '1') openBrowser(url);
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE' && process.env.PRICER_EMBEDDED === '1') {
    // Desktop app: another copy of the server (e.g. "npm start") already serves the same data – just use it.
    console.log(`Port ${PORT} jest zajęty – używam działającego serwera.`);
  } else if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} jest zajęty – aplikacja chyba już działa. Otwórz http://localhost:${PORT}`);
    openBrowser(`http://localhost:${PORT}`);
    setTimeout(() => process.exit(0), 500);
  } else {
    throw e;
  }
});

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => { /* no browser available: the URL is printed above */ });
}
