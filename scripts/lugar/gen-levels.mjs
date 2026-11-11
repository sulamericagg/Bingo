// Gera src/games/lugar/levels-data.ts (sementes das fases). Uso: node scripts/lugar/gen-levels.mjs [workers]
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

async function load() {
  const out = await build({ entryPoints: ['src/games/lugar/levels.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral',
    plugins: [{ name: 'empty-seeds', setup(b) { b.onLoad({ filter: /levels-data\.ts$/ }, () => ({ contents: 'export const SEEDS = [];', loader: 'ts' })); } }] });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

if (isMainThread) {
  const L = await load();
  const W = +process.argv[2] || Math.max(1, os.cpus().length);
  const N = L.LEVELS;
  const res = new Array(N);
  let next = 0, done = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: {} });
      const feed = () => { if (next < N) wk.postMessage(next++); else wk.terminate(); };
      wk.on('message', (m) => {
        res[m.i] = m;
        if (++done % 50 === 0) console.log(done, '/', N, Math.round((Date.now() - t0) / 1000) + 's');
        if (done === N) resolve();
        feed();
      });
      feed();
    }
  });
  // ordena cada capítulo por nota (mais fácil primeiro)
  const seeds = [];
  for (let ch = 0; ch < L.CHAPTERS; ch++) {
    const part = res.slice(ch * L.PER_CHAPTER, (ch + 1) * L.PER_CHAPTER).sort((a, b) => a.score - b.score);
    for (const p of part) seeds.push(p.seed);
  }
  const hit = res.filter((r) => r.tier === r.target).length;
  console.log(`alvo atingido em ${hit}/${N}; ${Math.round((Date.now() - t0) / 1000)}s`);
  const lines = [];
  for (let i = 0; i < seeds.length; i += 20) lines.push('  ' + seeds.slice(i, i + 20).join(', ') + ',');
  fs.writeFileSync('src/games/lugar/levels-data.ts', `// GERADO por scripts/lugar/gen-levels.mjs — não edite à mão.\n// ${N} fases (${L.CHAPTERS} capítulos × ${L.PER_CHAPTER}); cada número é a semente de generate(tamanho, semente).\nexport const SEEDS: number[] = [\n${lines.join('\n')}\n];\n`);
} else {
  const L = await load();
  const { generate, hash32 } = await import('data:text/javascript;base64,' + Buffer.from((await build({ entryPoints: ['src/games/lugar/engine.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' })).outputFiles[0].text).toString('base64'));
  parentPort.on('message', (i) => {
    const n = L.levelSize(i);
    const target = L.targetTier(i);
    let best = null;
    for (let k = 0; k < 30; k++) {
      const seed = (hash32(i, k, 0x1e7e1) % 900000) + 1;
      const p = generate(n, seed);
      const d = Math.abs(p.rating.tier - target);
      if (!best || d < best.d) best = { d, seed, tier: p.rating.tier, score: p.rating.score };
      if (d === 0) break;
    }
    parentPort.postMessage({ i, seed: best.seed, tier: best.tier, score: best.score, target });
  });
}
