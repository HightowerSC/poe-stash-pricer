// Dev mode: compile the main process, start the Vite dev server, then launch Electron pointing at it.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

execSync('npx tsc -p tsconfig.main.json', { stdio: 'inherit' });
const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Vite: ${url}`);

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('close', async () => {
  await server.close();
  process.exit(0);
});
