// Servidor Vite (modo dev) usado por todo o pipeline de promo: serve o jogo (index.html?debug)
// e as páginas auxiliares em scripts/promo/*.html (que importam módulos do jogo).
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realpathSync } from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function startServer(port = 4341) {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { port, strictPort: false, host: '127.0.0.1', hmr: false, fs: { allow: [ROOT, realpathSync(path.join(ROOT, 'node_modules'))] } },
    logLevel: 'error',
    clearScreen: false,
  });
  await server.listen();
  const addr = server.httpServer.address();
  const base = `http://127.0.0.1:${addr.port}`;
  return { base, close: () => server.close() };
}
