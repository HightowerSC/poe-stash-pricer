// Dev mode: compile and run the local API server, plus the Vite dev server (hot reload) proxying /api to it.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'vite';

execSync('npx tsc -p tsconfig.server.json', { stdio: 'inherit' });
const api = spawn(process.execPath, ['build/server/server.js'], { stdio: 'inherit', env: { ...process.env, NO_OPEN: '1' } });

const vite = await createServer({
  configFile: 'vite.config.mts',
  server: { open: true, proxy: { '/api': 'http://127.0.0.1:5317' } },
});
await vite.listen();
vite.printUrls();

const stop = async () => {
  api.kill();
  await vite.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
