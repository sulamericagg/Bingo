// Benchmark do mesher de blocos (Node): node scripts/dev/blocos-bench.mjs
// Mede, por nível de qualidade: montar o volume (buildJob) + malha (meshChunk) por pedaço 16³, triângulos e draw calls.
import { BlockStore } from '../../src/games/floresta/world/content/blocks/store';
import { meshChunk } from '../../src/games/floresta/world/content/blocks/mesher';
import { BLOCKS, TILES, blockNum } from '../../src/games/floresta/world/content/blocks/registry';
import { buildCave, buildHouse, demoTerrain } from '../../src/games/floresta/world/content/blocks/demoscene';
import { BLOCK_QUALITY } from '../../src/games/floresta/world/content/blocks/quality';

const s = new BlockStore();
buildHouse(s);
buildCave(s);
// pior caso patológico: xadrez 3D de pedra/terra num pedaço só (toda célula exposta)
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) if ((x + y + z) % 2 === 0) s.setBlock(208 + x, y, z, blockNum((x + z) % 4 ? 'pedra' : 'terra'));
// pedaço maciço típico de construção: 16×8×16 de tijolo com janelas
s.fill(240, 0, 0, 255, 7, 15, blockNum('tijolo'));
const chunks = [...s.chunks.values()].filter((c) => !c.key.startsWith('13,') && !c.key.startsWith('15,'));
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
const out: string[] = [];
out.push(`blocos: ${BLOCKS.length - 1} · ladrilhos no atlas: ${TILES.length} · pedaços da demo: ${chunks.length}`);
for (let w = 0; w < 3; w++) for (const t of [0, 1, 2, 3] as const) for (const c of s.chunks.values()) meshChunk(s.buildJob(c, BLOCK_QUALITY[t].mesh, demoTerrain));
for (const tier of [0, 1, 2, 3] as const) {
  const opt = BLOCK_QUALITY[tier].mesh;
  const per: number[] = [];
  const jobMs: number[] = [];
  let tris = 0;
  let draws = 0;
  let worst = 0;
  let worstK = '';
  for (const c of chunks) {
    const runs: number[] = [];
    const jr: number[] = [];
    let r = null as ReturnType<typeof meshChunk> | null;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      const job = s.buildJob(c, opt, demoTerrain);
      const t1 = performance.now();
      r = meshChunk(job);
      runs.push(performance.now() - t0);
      jr.push(t1 - t0);
    }
    const m = med(runs);
    per.push(m);
    jobMs.push(med(jr));
    tris += r!.tris;
    draws += r!.groups.filter(Boolean).length;
    if (m > worst) {
      worst = m;
      worstK = c.key;
    }
  }
  const one = (k: string) => {
    const c = s.chunks.get(k)!;
    const rr: number[] = [];
    let tri = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      tri = meshChunk(s.buildJob(c, opt, demoTerrain)).tris;
      rr.push(performance.now() - t0);
    }
    return `${med(rr).toFixed(2)} ms / ${tri} tri`;
  };
  const avg = per.reduce((a, b) => a + b, 0) / per.length;
  out.push(
    `nível ${tier} (chanfro ${opt.bevel ? 'sim' : 'não'}, relaxa ${opt.smooth}): média ${avg.toFixed(2)} ms/pedaço (dos quais montar volume ${(jobMs.reduce((a, b) => a + b, 0) / jobMs.length).toFixed(2)} ms) · mediana ${med(per).toFixed(2)} · pior ${worst.toFixed(2)} ms (${worstK}) · ${tris} tri · ${draws} draw calls · tijolo maciço 16×8×16: ${one('15,0,0')} · xadrez patológico: ${one('13,0,0')}`,
  );
}
console.log(out.join('\n'));
