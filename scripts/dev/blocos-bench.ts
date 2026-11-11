// Benchmark do mesher de blocos (Node): node scripts/dev/blocos-bench.mjs
import { BlockStore } from '../../src/games/floresta/world/content/blocks/store';
import { meshChunk, type MeshOpts } from '../../src/games/floresta/world/content/blocks/mesher';
import { BLOCKS, TILES, blockNum } from '../../src/games/floresta/world/content/blocks/registry';
import { buildCave, buildHouse, demoTerrain } from '../../src/games/floresta/world/content/blocks/demoscene';
import { BLOCK_QUALITY } from '../../src/games/floresta/world/content/blocks/quality';

const s = new BlockStore();
buildHouse(s);
buildCave(s);
// pedaço "cheio" de pior caso: xadrez 3D de pedra/terra (muitas faces)
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) if ((x + y + z) % 2 === 0) s.setBlock(208 + x, y, z, blockNum((x + z) % 4 ? 'pedra' : 'terra'));
const out: string[] = [];
out.push(`blocos: ${BLOCKS.length - 1} · ladrilhos no atlas: ${TILES.length}`);
for (const tier of [0, 1, 2, 3] as const) {
  const opt: MeshOpts = BLOCK_QUALITY[tier].mesh;
  let tot = 0;
  let tris = 0;
  let n = 0;
  let worst = 0;
  let worstK = '';
  // aquece JIT
  for (const c of s.chunks.values()) meshChunk(s.buildJob(c, opt, demoTerrain));
  for (const c of s.chunks.values()) {
    if (c.key.startsWith('13,')) continue; // pior caso separado
    const t0 = performance.now();
    const job = s.buildJob(c, opt, demoTerrain);
    const r = meshChunk(job);
    const ms = performance.now() - t0;
    tot += ms;
    tris += r.tris;
    n++;
    if (ms > worst) {
      worst = ms;
      worstK = c.key;
    }
  }
  const wc = s.chunk(13, 0, 0)!;
  const t0 = performance.now();
  const wr = meshChunk(s.buildJob(wc, opt, demoTerrain));
  const wms = performance.now() - t0;
  out.push(`nível ${tier}: ${n} pedaços · média ${(tot / n).toFixed(2)} ms/pedaço (montar+malha) · pior ${worst.toFixed(2)} ms (${worstK}) · ${tris} triângulos · xadrez 16³ pior caso: ${wms.toFixed(2)} ms, ${wr.tris} tri`);
}
console.log(out.join('\n'));
