import { createReadStream, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Bloop Espelho: o WASM do MediaPipe vai JUNTO no app (sem CDN em tempo de execução —
 * funciona offline e no WebView do Android). Só a variante SIMD (todo WebView ≥ 91);
 * sem SIMD o recurso cai para o modo "só microfone". O modelo .task fica em public/mediapipe/.
 */
const MP_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
const mpPath = (f: string) => fileURLToPath(new URL(`./node_modules/@mediapipe/tasks-vision/wasm/${f}`, import.meta.url));
function mediapipeWasm(): Plugin {
  return {
    name: 'bloop-mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/mediapipe\/(vision_wasm_internal\.(?:js|wasm))(?:\?|$)/.exec(req.url ?? '');
        if (!m) return next();
        res.setHeader('Content-Type', m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(mpPath(m[1])).pipe(res);
      });
    },
    generateBundle() {
      for (const f of MP_FILES) this.emitFile({ type: 'asset', fileName: `mediapipe/${f}`, source: readFileSync(mpPath(f)) });
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [mediapipeWasm()],
  // teste local com o Worker: BLOOP_API=http://127.0.0.1:8787 npx vite  (encaminha /api para o wrangler dev)
  server: process.env.BLOOP_API
    ? { proxy: { '/api': { target: process.env.BLOOP_API, changeOrigin: true } }, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
    : undefined,
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
});
