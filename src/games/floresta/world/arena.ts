/* ============================================================
 *  MUNDO — arenas dos minijogos dos servidores (PvP Arena, Spleef de
 *  Blocos, Corrida de Obstáculos). Montadas com blocos NO APARELHO de
 *  cada um (mesma semente → mesma arena para todos; não viram operações
 *  de rede). Ficam no céu, longe do acampamento, então cair = "derrubado".
 * ============================================================ */
import { blockNum } from './content/blocks';
import type { WorldGame } from './worldgame';

export interface V3 {
  x: number;
  y: number;
  z: number;
}
/** centro das arenas (longe da casa/placas do começo) */
export const ARENA_X = 0;
export const ARENA_Z = -150;

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** altura do piso das arenas (bem acima do chão) */
export function arenaY(g: WorldGame): number {
  return Math.floor(g.world.heightAt(ARENA_X, ARENA_Z)) + 26;
}

type Put = (x: number, y: number, z: number, id: string) => void;
function putter(g: WorldGame): Put {
  const bw = g.sb!.blocks;
  const cache = new Map<string, number>();
  return (x, y, z, id) => {
    let n = cache.get(id);
    if (n === undefined) cache.set(id, (n = blockNum(id)));
    bw.setBlock(x, y, z, n, 0);
  };
}

/* ------------------------------ PvP Arena ------------------------------ */

/** disco colorido (anéis) com centro dourado; sem grade nas bordas — o jogo é derrubar */
export function buildPvp(g: WorldGame): { y: number; spawns: V3[]; r: number } {
  const put = putter(g);
  const y = arenaY(g);
  const R = 10;
  const ring = ['la_mostarda', 'la_abobora', 'la_cereja', 'la_chiclete', 'la_lavanda', 'la_anil', 'la_ceu', 'la_turquesa', 'la_menta', 'la_limao', 'la_menta'];
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > R + 0.4) continue;
      put(ARENA_X + dx, y - 1, ARENA_Z + dz, d < 1.5 ? 'bloco_ouro' : ring[Math.min(ring.length - 1, Math.floor(d))]);
      // borda de baixo (deixa o disco "grosso" visto de longe)
      if (d > R - 1.2) put(ARENA_X + dx, y - 2, ARENA_Z + dz, 'la_grafite');
    }
  // 4 ilhotas para fugir (pulo de 2 blocos)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = ARENA_X + Math.round(Math.cos(a) * (R + 4));
    const cz = ARENA_Z + Math.round(Math.sin(a) * (R + 4));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(cx + dx, y - 1, cz + dz, 'vidro');
  }
  const spawns: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spawns.push({ x: ARENA_X + 0.5 + Math.cos(a) * 6, y, z: ARENA_Z + 0.5 + Math.sin(a) * 6 });
  }
  return { y, spawns, r: R };
}

/* ------------------------------ Spleef ------------------------------ */

export const SPLEEF_N = 8; // meia largura (17×17)
export const SPLEEF_GAP = 7;
/** dois andares de neve; quebre o chão embaixo dos outros. Cair do de baixo = fora */
export function buildSpleef(g: WorldGame): { y: number; layers: number[]; spawns: V3[]; spec: V3 } {
  const put = putter(g);
  const y = arenaY(g);
  const layers = [y - 1, y - 1 - SPLEEF_GAP];
  const cols = ['neve', 'neve'];
  layers.forEach((ly, i) => {
    for (let dz = -SPLEEF_N; dz <= SPLEEF_N; dz++)
      for (let dx = -SPLEEF_N; dx <= SPLEEF_N; dx++) {
        const edge = Math.abs(dx) === SPLEEF_N || Math.abs(dz) === SPLEEF_N;
        put(ARENA_X + dx, ly, ARENA_Z + dz, edge ? (i ? 'la_anil' : 'la_ceu') : cols[i]);
      }
  });
  // sacada de vidro para quem saiu assistir (um pouco acima e ao lado)
  const sz = ARENA_Z + SPLEEF_N + 4;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -4; dx <= 4; dx++) put(ARENA_X + dx, y + 2, sz + dz, 'vidro');
  const spawns: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spawns.push({ x: ARENA_X + 0.5 + Math.cos(a) * 5.5, y, z: ARENA_Z + 0.5 + Math.sin(a) * 5.5 });
  }
  return { y, layers, spawns, spec: { x: ARENA_X + 0.5, y: y + 3, z: sz + 0.5 } };
}
export function inSpleef(x: number, z: number): boolean {
  return Math.abs(x - ARENA_X) < SPLEEF_N && Math.abs(z - ARENA_Z) < SPLEEF_N;
}

/* ------------------------------ Corrida de Obstáculos ------------------------------ */

export interface Course {
  start: V3;
  /** pontos de volta (o primeiro é a largada) */
  checks: V3[];
  /** chegada: centro e meia largura */
  finish: V3;
  /** altura mínima segura (abaixo disso = caiu) */
  low: number;
}
/** percurso de plataformas que sobe em zigue-zague; checkpoints coloridos; chegada dourada */
export function buildObby(g: WorldGame, seed: number): Course {
  const put = putter(g);
  const R = rng(seed);
  const y0 = arenaY(g) - 6;
  let x = ARENA_X - 34;
  let z = ARENA_Z;
  let y = y0;
  const pad = (cx: number, cy: number, cz: number, h: number, id: string) => {
    for (let dz = -h; dz <= h; dz++) for (let dx = -h; dx <= h; dx++) put(cx + dx, cy - 1, cz + dz, id);
  };
  // largada larga (todo mundo cabe)
  pad(x, y, z, 3, 'la_menta');
  const start: V3 = { x: x + 0.5, y, z: z + 0.5 };
  const checks: V3[] = [start];
  const cols = ['la_cereja', 'la_abobora', 'la_mostarda', 'la_lavanda', 'la_ceu', 'la_chiclete'];
  let dir = 1;
  let low = y;
  for (let i = 1; i <= 26; i++) {
    const kind = R();
    // distância e subida que um Bloop sempre alcança (pulo ≈ 1,1 m de altura / 4 m de alcance)
    const up = kind < 0.35 ? 1 : 0;
    const gap = up ? 2 + Math.floor(R() * 1.5) : 2 + Math.floor(R() * 2.2);
    const side = Math.floor((R() - 0.5) * 3);
    x += gap + 2;
    z += side * dir;
    if (Math.abs(z - ARENA_Z) > 8) dir = -dir;
    y += up;
    const isCheck = i % 7 === 0;
    if (isCheck) {
      pad(x, y, z, 2, 'la_turquesa');
      checks.push({ x: x + 0.5, y, z: z + 0.5 });
    } else if (kind > 0.85) {
      // viga fina (1 bloco de largura, 4 de comprimento)
      for (let k = -1; k <= 2; k++) put(x + k, y - 1, z, cols[i % cols.length]);
      x += 2;
    } else pad(x, y, z, 1, cols[i % cols.length]);
    low = Math.min(low, y);
  }
  x += 5;
  pad(x, y, z, 3, 'bloco_ouro');
  return { start, checks, finish: { x: x + 0.5, y, z: z + 0.5 }, low: low - 7 };
}
