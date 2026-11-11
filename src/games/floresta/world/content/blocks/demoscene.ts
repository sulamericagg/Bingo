/* ============================================================
 *  BLOCOS — cenas de demonstração (puro): casa de materiais mistos com
 *  morro de terra suave encostado, e caverna com minérios.
 *  Usadas pela página de debug (scripts/dev/blocos.html) e pelo benchmark.
 * ============================================================ */
import { blockNum } from './registry';
import type { BlockStore } from './store';
import type { TerrainSampler } from './types';

const B = (id: string) => {
  const n = blockNum(id);
  if (!n) throw new Error('bloco? ' + id);
  return n;
};

function hash(x: number, z: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** chão natural da demo (o "terreno do motor"): ondulado, plano perto da casa */
export function demoHeight(x: number, z: number): number {
  const wave = Math.sin(x * 0.21) * 0.9 + Math.cos(z * 0.17 + 1) * 0.8 + Math.sin((x + z) * 0.09) * 1.2;
  const dx = Math.max(0, Math.abs(x - 5) - 9);
  const dz = Math.max(0, Math.abs(z - 4) - 8);
  const k = Math.min(1, Math.hypot(dx, dz) / 8);
  return 3 + wave * k * k;
}
export const demoTerrain: TerrainSampler = {
  height: demoHeight,
  block: () => B('grama'),
};

/** casa (x 0..10, z 0..8, piso em y=3) + morro de terra/grama encostado + arredores */
export function buildHouse(s: BlockStore): void {
  const Y = 3;
  const PL = B('pedra_lisa');
  const TP = B('tijolo_pedra');
  const LOG = B('tora_carvalho');
  const PLK = B('tabuas_carvalho');
  const BR = B('tijolo');
  const GL = B('vidro');
  const ROOF = B('telha_barro');
  const ROOF2 = B('telha_ardosia');
  // fundação + piso
  s.fill(0, Y - 1, 0, 10, Y - 1, 8, TP);
  s.fill(1, Y - 1, 1, 9, Y - 1, 7, PL);
  // paredes: base de pedra, meio tábuas/tijolo, colunas de tora
  for (let y = Y; y <= Y + 3; y++)
    for (let x = 0; x <= 10; x++)
      for (let z = 0; z <= 8; z++) {
        const edge = x === 0 || x === 10 || z === 0 || z === 8;
        if (!edge) continue;
        const corner = (x === 0 || x === 10) && (z === 0 || z === 8);
        let n = y === Y ? TP : x === 0 || x === 10 ? BR : PLK;
        if (corner || x === 5) n = LOG;
        s.setBlock(x, y, z, n);
      }
  // janelas
  for (const [x, z] of [
    [2, 0],
    [3, 0],
    [7, 0],
    [8, 0],
    [2, 8],
    [8, 8],
  ]) {
    s.setBlock(x, Y + 1, z, GL);
    s.setBlock(x, Y + 2, z, GL);
  }
  s.setBlock(0, Y + 1, 4, B('vidro_menta'));
  s.setBlock(0, Y + 2, 4, B('vidro_menta'));
  s.setBlock(10, Y + 2, 3, B('vidraca'));
  s.setBlock(10, Y + 2, 5, B('vidraca'));
  // porta (frente z=0)
  s.setBlock(5, Y, 0, B('porta_madeira'), 2);
  s.setBlock(5, Y + 1, 0, B('porta_madeira'), 2);
  s.setBlock(5, Y + 2, 0, PLK);
  // telhado em degraus (duas águas ao longo de X)
  for (let k = 0; k <= 4; k++) {
    const y = Y + 4 + k;
    for (let x = -1; x <= 11; x++) {
      s.setBlock(x, y, k - 1, ROOF);
      s.setBlock(x, y, 9 - k, ROOF);
    }
    // empenas (oitões)
    for (let z = k; z <= 8 - k; z++) {
      s.setBlock(0, y, z, PLK);
      s.setBlock(10, y, z, PLK);
    }
  }
  for (let x = -1; x <= 11; x++) s.setBlock(x, Y + 9, 4, ROOF2);
  // chaminé
  s.fill(8, Y + 4, 6, 8, Y + 10, 6, BR);
  // interior
  s.setBlock(2, Y, 6, B('bancada'));
  s.setBlock(3, Y, 7, B('fornalha'), 2);
  s.setBlock(8, Y, 6, B('bau'), 2);
  s.setBlock(7, Y, 2, B('cama'), 1);
  s.setBlock(4, Y, 4, B('tapete_vermelho'));
  s.setBlock(5, Y, 4, B('tapete_vermelho'));
  s.setBlock(5, Y + 3, 4, B('lanterna'));
  s.setBlock(1, Y + 2, 1, B('tocha'));
  // varanda: tochas, cerca, caminho de cascalho
  s.setBlock(4, Y, -1, B('tocha'));
  s.setBlock(6, Y, -1, B('tocha'));
  for (let x = -4; x <= 14; x++) if (x < 3 || x > 7) s.setBlock(x, Y, -4, B('cerca_madeira'));
  for (let z = -4; z <= -1; z++) s.setBlock(5, Y - 1, z, B('cascalho'));
  s.setBlock(-4, Y, -3, B('cerca_madeira'));
  s.setBlock(-4, Y, -2, B('cerca_madeira'));
  // MORRO de terra encostado na parede leste (x>10): elipsoide de blocos, grama por cima
  const cx = 15;
  const cz = 5;
  for (let x = 10; x <= 21; x++)
    for (let z = -2; z <= 12; z++) {
      const d = Math.hypot((x - cx) / 6, (z - cz) / 6.5);
      const top = Math.floor(Y - 1 + (1 - d * d) * 6 + hash(x, z, 3) * 0.8);
      for (let y = Y - 1; y <= top; y++) if (!s.getBlock(x, y, z)) s.setBlock(x, y, z, y === top ? B('grama') : B('terra'));
    }
  // pedras e minério aparecendo no morro
  s.setBlock(16, Y + 4, 2, B('pedregulho'));
  s.setBlock(17, Y + 3, 1, B('pedregulho'));
  s.setBlock(17, Y + 4, 2, B('min_cobre'));
  // monte de areia e de neve, poça de lama e argila (outros macios)
  for (let x = -9; x <= -4; x++)
    for (let z = 2; z <= 8; z++) {
      const d = Math.hypot((x + 6.5) / 2.8, (z - 5) / 3.2);
      const h = Math.floor((1 - d) * 3.2);
      for (let y = 0; y < h; y++) s.setBlock(x, Y + y, z, B('areia'));
    }
  for (let x = -9; x <= -5; x++)
    for (let z = 10; z <= 14; z++) {
      const d = Math.hypot((x + 7) / 2.4, (z - 12) / 2.4);
      const h = Math.floor((1 - d) * 3);
      for (let y = 0; y < h; y++) s.setBlock(x, Y + y, z, y === h - 1 ? B('neve') : B('argila'));
    }
  // árvore
  const tx = -2;
  const tz = 12;
  s.fill(tx, Y, tz, tx, Y + 4, tz, LOG);
  for (let x = -2; x <= 2; x++)
    for (let y = 3; y <= 6; y++)
      for (let z = -2; z <= 2; z++) {
        if (Math.hypot(x, (y - 4.5) * 1.3, z) > 2.6 || (x === 0 && z === 0 && y < 5)) continue;
        s.setBlock(tx + x, Y + y, tz + z, B('folhas_carvalho'));
      }
  // muro de pedregulho com quinas chanfradas + bloco de pedra/minérios expostos
  s.fill(12, Y, 12, 18, Y, 12, B('pedregulho'));
  s.fill(12, Y + 1, 12, 15, Y + 1, 12, B('tijolo_musgoso'));
  s.setBlock(1, Y, -2, B('bloco_ouro'));
  s.setBlock(2, Y, -2, B('bloco_cristal'));
  s.setBlock(1, Y + 1, -2, B('lampada_cristal'));
  // plantinhas na grama
  const plants = ['capim', 'flor_sol', 'flor_lilas', 'flor_brasa', 'capim', 'samambaia'];
  for (let x = -8; x <= 22; x++)
    for (let z = -8; z <= 16; z++) {
      if (hash(x, z, 9) > 0.1) continue;
      const top = topSolid(s, x, z, Y + 12);
      if (top < 0) {
        const gy = Math.ceil(demoHeight(x + 0.5, z + 0.5));
        if (gy >= Y - 1 && !s.getBlock(x, gy, z)) s.setBlock(x, gy, z, B(plants[(hash(x, z, 4) * plants.length) | 0]));
      } else if (s.getBlock(x, top, z) === B('grama') && !s.getBlock(x, top + 1, z)) s.setBlock(x, top + 1, z, B(plants[(hash(x, z, 4) * plants.length) | 0]));
    }
}

function topSolid(s: BlockStore, x: number, z: number, from: number): number {
  for (let y = from; y > -8; y--) if (s.getBlock(x, y, z)) return y;
  return -1;
}

/** caverna (volume de pedra com túnel, minérios, cristais, estalactites) a partir de (ox, oy, oz) */
export function buildCave(s: BlockStore, ox = 40, oy = -24, oz = 0): void {
  const W = 26;
  const H = 16;
  const D = 26;
  const stone = B('pedra');
  const deep = B('pedra_funda');
  const ores = ['min_carvao', 'min_carvao', 'min_cobre', 'min_ferro', 'min_prata', 'min_ouro', 'min_cristal', 'min_gema', 'min_solarita', 'min_lumelita', 'min_roselio'].map(B);
  const inCave = (x: number, y: number, z: number) => {
    // salão elipsoide + túnel sinuoso
    const hall = Math.hypot((x - 13) / 10, (y - 7) / 5.5, (z - 13) / 10) + Math.sin(x * 0.7 + z * 0.4) * 0.08 + Math.cos(y * 0.9 + x * 0.3) * 0.07;
    const tz = 13 + Math.sin(x * 0.3) * 3;
    const tun = Math.hypot((y - 5 - Math.sin(x * 0.2)) / 2.2, (z - tz) / 2.4);
    return hall < 1 || (tun < 1 && x > 18);
  };
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = 0; z < D; z++) {
        if (inCave(x, y, z)) continue;
        // só a casca (4 blocos) — o resto não aparece mesmo
        let shell = false;
        for (let d = 1; d <= 3 && !shell; d++) if (inCave(x + d, y, z) || inCave(x - d, y, z) || inCave(x, y + d, z) || inCave(x, y - d, z) || inCave(x, y, z + d) || inCave(x, y, z - d)) shell = true;
        if (!shell) continue;
        const h = hash(x * 31 + y, z, 77);
        let n = y < 4 ? deep : stone;
        if (h < 0.07) n = ores[(hash(x, z * 7 + y, 5) * ores.length) | 0];
        else if (h < 0.1) n = B('calcario');
        s.setBlock(ox + x, oy + y, oz + z, n);
      }
  // chão macio: lama/argila/musgo em bolsões
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      for (let y = 1; y < H - 1; y++) {
        if (!inCave(x, y, z) || inCave(x, y - 1, z)) continue;
        const h = hash(x, z, 12);
        const n = h < 0.35 ? B('musgo') : h < 0.55 ? B('lama') : h < 0.7 ? B('argila') : 0;
        if (n) s.setBlock(ox + x, oy + y, oz + z, n);
        const hp = hash(x, z, 13);
        if (n && hp < 0.25 && !s.getBlock(ox + x, oy + y + 1, oz + z)) s.setBlock(ox + x, oy + y + 1, oz + z, B(hp < 0.08 ? 'cogumelo_luar' : hp < 0.14 ? 'cogumelo_vermelho' : 'liquen_luz'));
        else if (!n && hp < 0.06) s.setBlock(ox + x, oy + y, oz + z, B('cacho_cristal'));
        else if (!n && hp < 0.1) s.setBlock(ox + x, oy + y, oz + z, B('estalagmite'));
        break;
      }
  // estalactites no teto
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      for (let y = H - 2; y > 1; y--) {
        if (!inCave(x, y, z) || inCave(x, y + 1, z)) continue;
        if (hash(x, z, 21) < 0.12) s.setBlock(ox + x, oy + y, oz + z, B('estalactite'));
        else if (hash(x, z, 22) < 0.02) s.setBlock(ox + x, oy + y, oz + z, B('lanterna'));
        break;
      }
  // tochas nas paredes, um veio de cristal grande
  s.setBlock(ox + 6, oy + 4, oz + 13, B('tocha'));
  s.setBlock(ox + 20, oy + 4, oz + 12, B('tocha'));
  s.fill(ox + 3, oy + 6, oz + 18, ox + 4, oy + 8, oz + 19, B('min_cristal'));
}
