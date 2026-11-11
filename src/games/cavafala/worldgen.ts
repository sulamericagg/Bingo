/* ============================================================
 *  CAVA & FALA — geração dos mapas.
 *  Vila: um "diorama" de terra em camadas (grama, terra, argila,
 *  areia, pedra, veios de cristal e ouro) com um morro que cobre a
 *  vila e uma ravina que corta o mapa (precisa de ponte).
 *  Arena: ilha flutuante sobre o vazio.
 * ============================================================ */
import * as THREE from 'three';
import { M, type Theme } from './data';
import { fbm2, noise3, smooth } from './noise';
import { Terrain } from './terrain';
import type { TownLayout } from './town';

export function townSize(vs: number): { n: number; ny: number } {
  // 64 m × 32 m × 64 m
  const n = Math.round(64 / vs / 16) * 16;
  const ny = Math.round(32 / vs / 16) * 16;
  return { n, ny };
}

/** raio da ilha da vila (o jogador não passa de TOWN_WALK_R) */
export const ISLAND_R = 31;
export const TOWN_WALK_R = 30.2;

export function genTown(th: Theme, vs: number, detail: boolean, variant: number): { T: Terrain; L: TownLayout } {
  const { n, ny } = townSize(vs);
  const size = n * vs;
  const T = new Terrain({ nx: n, ny, nz: n, vs, ox: -size / 2, oy: 0, oz: -size / 2 }, th, detail);
  const seed = th.seed + variant * 7919;
  const floorY = 8;
  const cx = 0,
    cz = 0;
  const ravZ = 14.5 + ((variant % 3) - 1) * 0.6;
  const ravHalf = 2.1;
  const plateau = floorY + 6.6 + th.cover;
  const edgeH = th.sea ? floorY - 1.6 : floorY + 1.2;
  const ceil = th.cave ? 31.6 : 999;
  const D = T.d;
  const Mm = T.m;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const x = T.ox + i * vs,
        z = T.oz + k * vs;
      const rr = Math.hypot((x - cx) * 1.0, (z - cz - 4) * 0.92);
      const hill = smooth(29.5, 20, rr);
      const nz = fbm2(x * 0.06, z * 0.06, seed, 4);
      let H = edgeH + (plateau - edgeH) * hill + (nz - 0.5) * 2.6 * (0.4 + hill * 0.6);
      // borda redonda: o mapa vira uma ilha (sem o "quadrado" de terra nas pontas)
      const rEdge = Math.hypot(x, z);
      if (rEdge > 27) H -= Math.min(1, (rEdge - 27) / 6) ** 2 * (th.sea ? 3.5 : 5);
      // ondinhas de dunas no deserto
      if (th.id === 'deserto') H += Math.sin(x * 0.35 + z * 0.12) * 0.35 * hill;
      const cH = ceil - fbm2(x * 0.09, z * 0.09, seed + 5, 3) * 3;
      for (let j = 0; j < ny; j++) {
        const y = j * vs;
        const q = (k * ny + j) * n + i;
        let d = Math.max(-3, Math.min(3, H - y));
        // ravina que atravessa o mapa
        const rz = Math.abs(z - ravZ) - (ravHalf + (fbm2(x * 0.2, 3, seed + 9, 2) - 0.5) * 0.8);
        if (y > 1.4) d = Math.min(d, Math.max(-3, Math.min(3, rz)));
        // teto da caverna (+ estalactites)
        if (th.cave) {
          const st = noise3(x * 0.25, 0, z * 0.25, seed + 3) > 0.74 ? 2.4 : 0;
          d = Math.max(d, Math.min(3, y - (cH - st)));
        }
        let m: number;
        if (j < 2) {
          m = M.Base;
          d = Math.max(d, 1);
        } else {
          const depth = H - y;
          if (th.cave && y > cH - 3.5) m = noise3(x * 0.3, y * 0.3, z * 0.3, seed + 8) > 0.66 ? M.Cristal : M.Pedra;
          else if (depth < 0.7 && y > floorY) m = th.id === 'deserto' ? M.Areia : M.Grama;
          else if (y < floorY - 0.1 && y > floorY - 0.7) m = M.Pedra; // calçamento da vila
          else if (y < floorY - 3.5) {
            const v = noise3(x * 0.22, y * 0.22, z * 0.22, seed + 1);
            m = v > 0.78 ? M.Cristal : v < 0.12 ? M.Ouro : M.Pedra;
          } else {
            const band = Math.sin(y * 1.3 + fbm2(x * 0.08, z * 0.08, seed + 2, 2) * 6);
            const v = noise3(x * 0.18, y * 0.18, z * 0.18, seed + 4);
            const v2 = noise3(x * 0.3, y * 0.3, z * 0.3, seed + 6);
            if (v2 > 0.86 && depth > 2.5) m = M.Ouro;
            else if (v2 < 0.08 && depth > 2) m = M.Cristal;
            else if (v > 0.68) m = M.Areia;
            else if (band > 0.55) m = M.Argila;
            else if (depth > 7 && v < 0.25) m = M.Pedra;
            else m = M.Terra;
            if (th.sea && y < floorY + 1.5 && rr > 21) m = M.Areia;
            if (th.id === 'deserto' && depth < 2.5) m = M.Areia;
          }
        }
        // ilha redonda: corta o "quadrado" das pontas
        D[q] = Math.min(d, Math.max(-3, Math.min(3, (ISLAND_R - rEdge) * 1.5)));
        Mm[q] = m;
      }
    }
  T.recount();
  T.markAllDirty();
  // nasce do lado de cá da ravina, NO ALTO do morro (chão firme e plano, longe da água), olhando a vila
  const L: TownLayout = { cx, cz, floorY, ravZ, ravHalf, spawn: findSpawn(T, th.cave ? 25 : 30, plateau, th.sea ? 7 : -100) };
  return { T, L };
}

/** procura um lugar firme e plano no alto do morro (nunca na água, no vazio ou dentro da terra) */
function findSpawn(T: Terrain, top: number, plateau: number, waterY: number): THREE.Vector3 {
  let best: THREE.Vector3 | null = null;
  let bestScore = -Infinity;
  for (let z = -22; z <= -8; z += 0.5)
    for (const x of [0, -2, 2, -4, 4, -6, 6]) {
      const y = T.groundY(x, z, top);
      if (y === -Infinity || y < waterY + 2.5) continue;
      // plano: vizinhos a 1,2 m quase na mesma altura
      let flat = 0;
      for (const [dx, dz] of [
        [1.2, 0],
        [-1.2, 0],
        [0, 1.2],
        [0, -1.2],
      ])
        flat = Math.max(flat, Math.abs(T.groundY(x + dx, z + dz, top) - y));
      if (flat > 0.7) continue;
      // espaço livre para a cabeça
      if (T.sample(x, y + 1, z) > 0 || T.sample(x, y + 1.9, z) > 0) continue;
      // no alto (vê a vila), o mais perto da borda de cá, no meio
      const score = -Math.max(0, plateau - 1.2 - y) * 6 - z * 0.4 - Math.abs(x) * 0.3 - flat * 2;
      if (score > bestScore) {
        bestScore = score;
        best = new THREE.Vector3(x, y + 0.25, z);
      }
    }
  return best ?? new THREE.Vector3(0, T.groundY(0, -14, top) + 0.25, -14);
}

/** ilha flutuante da arena */
export function genArena(vs: number, detail: boolean, seed: number): { T: Terrain; topY: number; R: number } {
  const n = Math.round(44 / vs / 16) * 16;
  const ny = Math.round(28 / vs / 16) * 16;
  const size = n * vs;
  const T = new Terrain({ nx: n, ny, nz: n, vs, ox: -size / 2, oy: 0, oz: -size / 2 }, null, detail);
  const topY = 18;
  const R = Math.min(17, size / 2 - 3);
  const D = T.d;
  const Mm = T.m;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const x = T.ox + i * vs,
        z = T.oz + k * vs;
      const ang = Math.atan2(z, x);
      const rEdge = R * (0.86 + fbm2(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5, seed, 3) * 0.28);
      const r = Math.hypot(x, z);
      const top = topY + (fbm2(x * 0.08, z * 0.08, seed + 1, 3) - 0.5) * 2.4 + smooth(rEdge * 0.2, 0, r) * 1.2;
      for (let j = 0; j < ny; j++) {
        const y = j * vs;
        const q = (k * ny + j) * n + i;
        // perfil: topo achatado, fundo em cone (pinga para baixo)
        const below = top - y;
        const depthK = Math.max(0, below) / 13;
        const rAt = rEdge * Math.max(0, 1 - depthK * depthK * 0.95);
        let d = Math.min(top - y, rAt - r);
        d = Math.max(-3, Math.min(3, d));
        if (y < 2.5) d = Math.min(d, -1);
        let m: number;
        if (below < 0.7) m = r > rEdge - 1.6 ? M.Areia : M.Grama;
        else if (below < 2.6) m = M.Terra;
        else {
          const v = noise3(x * 0.25, y * 0.25, z * 0.25, seed + 3);
          m = v > 0.8 ? M.Cristal : v < 0.13 ? M.Ouro : v > 0.6 ? M.Argila : below > 6 ? M.Pedra : M.Terra;
        }
        D[q] = d;
        Mm[q] = m;
      }
    }
  T.recount();
  T.markAllDirty();
  return { T, topY, R };
}
