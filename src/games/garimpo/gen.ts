/* ============================================================
 *  GARIMPO BRUTO — geração procedural do mapa (por semente do save).
 *  Montanha grande, vales, estrada de terra do acampamento até a mina, lago (sempre),
 *  acampamento com casas + ESTOQUE + lavadora longe da mina, e jazidas de ouro escondidas
 *  (mais ricas e mais fundas na montanha; rasas e pobres na baixada).
 * ============================================================ */
import { CELL, MAT_DIRT, MAT_GRASS, MAT_MUD, MAT_ROAD, MAT_SAND, N, SIZE, Terrain, V } from './terrain';

export interface P2 {
  x: number;
  z: number;
}
export interface Deposit extends P2 {
  r: number;
  /** teor de pico g/m³ */
  g: number;
  /** profundidade do pico (m) */
  d: number;
}
export interface TreeSpot extends P2 {
  s: number;
  kind: number;
  rot: number;
}
export interface MapInfo {
  seed: number;
  camp: P2;
  plant: P2 & { rot: number };
  stock: P2;
  garage: P2 & { rot: number };
  houses: (P2 & { rot: number; color: number })[];
  lake: P2 & { r: number; level: number };
  mountain: P2 & { r: number; h: number };
  mine: P2;
  road: P2[];
  /** estrada do portão (borda) até o estoque — caminhão de exportação */
  gateRoad: P2[];
  deposits: Deposit[];
  trees: TreeSpot[];
  /** ponto de entrada do caminhão de exportação (borda do mapa) */
  gate: P2;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** ruído de valor 2D suave com semente */
function makeNoise(seed: number): (x: number, z: number) => number {
  const P = new Uint8Array(512);
  const r = rng(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = r() * 2 - 1;
  const f = (t: number) => t * t * (3 - 2 * t);
  return (x, z) => {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const tx = f(x - xi);
    const tz = f(z - zi);
    const a = val[P[(xi & 255) + P[zi & 255]]];
    const b = val[P[((xi + 1) & 255) + P[zi & 255]]];
    const c = val[P[(xi & 255) + P[(zi + 1) & 255]]];
    const d = val[P[((xi + 1) & 255) + P[(zi + 1) & 255]]];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** distância de p ao segmento ab e o parâmetro t */
function segDist(px: number, pz: number, a: P2, b: P2): [number, number] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - a.x) * dx + (pz - a.z) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [Math.hypot(px - a.x - dx * t, pz - a.z - dz * t), t];
}

export function roadDist(road: P2[], x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < road.length - 1; i++) {
    const [d] = segDist(x, z, road[i], road[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

export function generate(T: Terrain, seed: number, treeBudget = 1): MapInfo {
  const r = rng(seed * 7919 + 13);
  const nA = makeNoise(seed);
  const nB = makeNoise(seed + 101);
  const nC = makeNoise(seed + 202);
  const fbm = (x: number, z: number) => nA(x, z) * 0.6 + nA(x * 2.1 + 5, z * 2.1) * 0.27 + nA(x * 4.3, z * 4.3 + 9) * 0.13;
  const J = (a: number) => (r() * 2 - 1) * a;

  // ---- traçado ----
  const flip = r() < 0.5; // espelha o mapa para cada save parecer diferente
  const fx = (x: number) => (flip ? SIZE - x : x);
  const camp = { x: fx(42 + J(4)), z: 44 + J(4) };
  const mountain = { x: fx(136 + J(6)), z: 136 + J(6), r: 62, h: 30 + J(4) };
  const toC = Math.atan2(camp.z - mountain.z, camp.x - mountain.x);
  const mine = { x: mountain.x + Math.cos(toC) * 40, z: mountain.z + Math.sin(toC) * 40 };
  const lake = { x: fx(44 + J(6)), z: 140 + J(6), r: 13 + J(2), level: 0 };
  const plant = { x: camp.x + (flip ? -1 : 1) * 19, z: camp.z + 9, rot: 0 };
  // a moega (lado +z da lavadora) fica virada para o meio do acampamento: caminhões chegam por ali
  plant.rot = Math.atan2(camp.x - plant.x, camp.z - plant.z);
  const stock = { x: camp.x + (flip ? 1 : -1) * 8, z: camp.z - 14 };
  const garage = { x: camp.x + (flip ? -1 : 1) * 12, z: camp.z - 16, rot: 0 };
  const gate = { x: fx(SIZE - 6), z: 26 };
  // estrada: acampamento → mina com uma curva, e um ramal até o portão (caminhão de exportação)
  const mid = { x: (camp.x + mine.x) / 2 + J(10) + (flip ? 10 : -10), z: (camp.z + mine.z) / 2 + 12 };
  const road: P2[] = [{ x: camp.x, z: camp.z }, mid, { x: mine.x, z: mine.z }];
  const gateRoad: P2[] = [{ x: stock.x, z: stock.z }, { x: (stock.x + gate.x) / 2, z: 18 + J(4) }, gate];
  // casas em volta do acampamento, longe da estrada, da lavadora, do estoque e da garagem
  const houses: MapInfo['houses'] = [];
  {
    const avoid = [mid, plant, stock, garage, gateRoad[1]].map((p) => Math.atan2(p.z - camp.z, p.x - camp.x));
    const diff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const start = r() * Math.PI * 2;
    for (let i = 0; i < 18 && houses.length < 4; i++) {
      const a = start + (i / 18) * Math.PI * 2;
      if (avoid.some((b) => diff(a, b) < 0.62) || houses.some((h) => diff(a, Math.atan2(h.z - camp.z, h.x - camp.x)) < 0.7)) continue;
      houses.push({ x: camp.x + Math.cos(a) * 21, z: camp.z + Math.sin(a) * 21, rot: -a + Math.PI / 2, color: houses.length });
    }
  }

  // ---- alturas ----
  const h = T.h;
  for (let j = 0; j < V; j++)
    for (let i = 0; i < V; i++) {
      const x = i * CELL;
      const z = j * CELL;
      let y = 3 + fbm(x / 46, z / 46) * 5 + nB(x / 13, z / 13) * 0.7;
      // montanha com cristas
      const dm = Math.hypot(x - mountain.x, z - mountain.z) / mountain.r;
      if (dm < 1.2) {
        const m = Math.pow(Math.max(0, 1 - dm * dm * 0.72), 1.7);
        const ridge = 1 - Math.abs(nC(x / 18, z / 18));
        y += mountain.h * m * (0.82 + ridge * 0.3);
      }
      // vale (riacho) do lago em direção à borda
      // borda sobe (esconde o fim do mundo)
      const e = Math.min(x, z, SIZE - x, SIZE - z);
      if (e < 16) y += Math.pow(1 - e / 16, 2) * 14;
      h[j * V + i] = y;
    }
  const hAt = (x: number, z: number) => h[Math.round(z / CELL) * V + Math.round(x / CELL)];
  // platôs: acampamento (casas/estoque/lavadora) e pátio da mina
  const campH = hAt(camp.x, camp.z);
  const mineH = Math.max(hAt(mine.x, mine.z) - 1, campH + 2);
  // perfil suave da estrada: interpola as alturas dos extremos + um pouco do terreno
  const flatten = (cx: number, cz: number, r0: number, r1: number, y: number) => {
    const i0 = Math.max(0, Math.floor((cx - r1) / CELL));
    const i1 = Math.min(N, Math.ceil((cx + r1) / CELL));
    const j0 = Math.max(0, Math.floor((cz - r1) / CELL));
    const j1 = Math.min(N, Math.ceil((cz + r1) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * CELL - cx, j * CELL - cz);
        const w = 1 - sstep(r0, r1, d);
        const k = j * V + i;
        h[k] += (y - h[k]) * w;
      }
  };
  flatten(camp.x, camp.z, 26, 38, campH);
  flatten(mine.x, mine.z, 14, 24, mineH);
  // lago
  lake.level = hAt(lake.x, lake.z) - 0.6;
  {
    const R = lake.r + 9;
    for (let j = 0; j < V; j++)
      for (let i = 0; i < V; i++) {
        const x = i * CELL;
        const z = j * CELL;
        const wob = 1 + nB(x / 9, z / 9) * 0.12;
        const d = Math.hypot(x - lake.x, z - lake.z) / wob;
        if (d > R) continue;
        const k = j * V + i;
        const bed = lake.level - 2.6 * (1 - sstep(0, lake.r, d)) + sstep(lake.r - 3, lake.r + 3, d) * 1.8;
        const w = 1 - sstep(lake.r, R, d);
        h[k] += (Math.min(h[k], bed + (d > lake.r ? (d - lake.r) * 0.35 : 0)) - h[k]) * w;
      }
  }
  // estradas
  const roads = [road, gateRoad];
  const roadW = 3.4;
  {
    // altura-alvo ao longo da estrada: média móvel do terreno no eixo
    for (const rd of roads) {
      const pts: { x: number; z: number; y: number }[] = [];
      for (let s = 0; s < rd.length - 1; s++) {
        const a = rd[s];
        const b = rd[s + 1];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
        for (let q = 0; q < n; q++) pts.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n, y: 0 });
      }
      pts.push({ ...rd[rd.length - 1], y: 0 });
      const raw = pts.map((p) => hAt(p.x, p.z));
      pts.forEach((p, q) => {
        let s = 0;
        let c = 0;
        for (let o = -6; o <= 6; o++) {
          const v = raw[Math.max(0, Math.min(raw.length - 1, q + o))];
          s += v;
          c++;
        }
        p.y = s / c;
      });
      if (rd === road) {
        // estrada da mina: rampa de inclinação constante (caminhão carregado sobe e desce sem susto)
        let L = 0;
        const acc = pts.map((p, q) => (q ? (L += Math.hypot(p.x - pts[q - 1].x, p.z - pts[q - 1].z)) : 0));
        pts.forEach((p, q) => (p.y = campH + (mineH - campH) * (acc[q] / L)));
      }
      for (const p of pts) flatten(p.x, p.z, roadW * 0.6, roadW + 4, p.y);
    }
    // os platôs ficam por cima (a estrada encosta neles sem degrau)
    flatten(camp.x, camp.z, 24, 30, campH);
    flatten(mine.x, mine.z, 14, 20, mineH);
  }

  // ---- materiais, umidade ----
  const mat = T.mat;
  const wet = T.wet;
  for (let j = 0; j < V; j++)
    for (let i = 0; i < V; i++) {
      const x = i * CELL;
      const z = j * CELL;
      const k = j * V + i;
      let m = MAT_GRASS;
      let w = 0.08 + Math.max(0, nB(x / 20 + 3, z / 20)) * 0.12;
      const dc = Math.hypot(x - camp.x, z - camp.z);
      if (dc < 27 + nB(x / 6, z / 6) * 3) m = MAT_DIRT;
      if (Math.hypot(x - mine.x, z - mine.z) < 15 + nB(x / 5, z / 5) * 3) m = MAT_DIRT;
      const dm = Math.hypot(x - mountain.x, z - mountain.z);
      if (dm < mountain.r * 0.75 && nC(x / 9, z / 9) > 0.1) m = MAT_DIRT;
      for (const rd of roads) if (roadDist(rd, x, z) < roadW + nB(x / 3, z / 3) * 0.5) m = MAT_ROAD;
      const dl = Math.hypot(x - lake.x, z - lake.z);
      if (dl < lake.r + 2.5) m = MAT_SAND;
      if (dl < lake.r + 6) w = Math.max(w, 0.75 * (1 - sstep(lake.r, lake.r + 6, dl)));
      // poças de lama na baixada perto do lago e pelo caminho
      const mud = nC(x / 11 + 40, z / 11) - 0.45;
      if (mud > 0 && m !== MAT_SAND && m !== MAT_ROAD && dc > 30) {
        m = MAT_MUD;
        w = Math.max(w, 0.55 + mud * 2);
      }
      mat[k] = m;
      wet[k] = Math.min(1, w);
      T.tint[k] = (nB(x / 2.3, z / 2.3) + nA(x / 0.9, z / 0.9) * 0.5) * 0.06;
    }
  // baixadas (poças na chuva)
  {
    const R = 6;
    for (let j = R; j < V - R; j += 1)
      for (let i = R; i < V - R; i += 1) {
        const k = j * V + i;
        const avg = (h[k - R] + h[k + R] + h[k - R * V] + h[k + R * V] + h[k - R - R * V] + h[k + R + R * V] + h[k - R + R * V] + h[k + R - R * V]) / 8;
        T.basin[k] = Math.max(0, Math.min(1, (avg - h[k]) * 2.2));
      }
  }
  T.h0.set(h);
  T.pay.fill(0);
  T.rut.fill(0);

  // ---- ouro ----
  const deposits: Deposit[] = [];
  // 1) jazida rasa perto do acampamento (para os primeiros carrinhos de mão)
  const a0 = toC + Math.PI + (r() - 0.5) * 0.8;
  deposits.push({ x: camp.x + Math.cos(a0) * -34 + J(4), z: camp.z + Math.sin(a0) * -34 + J(4), r: 7, g: 34, d: 0.6 });
  // 2) cascalho de riacho em volta do lago (rasos, médios)
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    deposits.push({ x: lake.x + Math.cos(a) * (lake.r + 8), z: lake.z + Math.sin(a) * (lake.r + 8), r: 6 + r() * 3, g: 18 + r() * 14, d: 0.6 + r() * 1 });
  }
  // 3) baixada espalhada (pobre)
  for (let i = 0; i < 7; i++) deposits.push({ x: 20 + r() * (SIZE - 40), z: 20 + r() * (SIZE - 40), r: 5 + r() * 6, g: 6 + r() * 14, d: 0.5 + r() * 1.5 });
  // 4) montanha: fundo e rico (veios)
  for (let i = 0; i < 6; i++) {
    const a = toC + (r() - 0.5) * 2.2;
    const d = 18 + r() * 32;
    deposits.push({ x: mountain.x + Math.cos(a) * d, z: mountain.z + Math.sin(a) * d, r: 5 + r() * 5, g: 45 + r() * 70, d: 3 + r() * 5 });
  }
  // 5) o veio principal na encosta da mina (a recompensa de quem cava fundo)
  deposits.push({ x: mine.x + Math.cos(toC + Math.PI) * 9, z: mine.z + Math.sin(toC + Math.PI) * 9, r: 9, g: 90, d: 5 });
  T.oreR.fill(0);
  T.oreD.fill(0);
  for (const dp of deposits) {
    const i0 = Math.max(0, Math.floor((dp.x - dp.r * 2) / CELL));
    const i1 = Math.min(N, Math.ceil((dp.x + dp.r * 2) / CELL));
    const j0 = Math.max(0, Math.floor((dp.z - dp.r * 2) / CELL));
    const j1 = Math.min(N, Math.ceil((dp.z + dp.r * 2) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL;
        const z = j * CELL;
        const d = Math.hypot(x - dp.x, z - dp.z) / dp.r;
        const k = j * V + i;
        // contorno irregular (pepitas em "bolsões")
        const v = dp.g * Math.exp(-d * d * 1.6) * (0.75 + 0.5 * Math.max(0, nA(x / 3 + 11, z / 3)));
        if (v > T.oreR[k]) {
          T.oreR[k] = v;
          T.oreD[k] = dp.d;
        }
      }
  }

  // ---- árvores ----
  const trees: TreeSpot[] = [];
  const want = Math.round(900 * treeBudget);
  let guard = 0;
  while (trees.length < want && guard++ < want * 12) {
    const x = 4 + r() * (SIZE - 8);
    const z = 4 + r() * (SIZE - 8);
    const e = Math.min(x, z, SIZE - x, SIZE - z);
    const dense = e < 22 ? 1 : 0.35 + Math.max(0, nA(x / 25 + 7, z / 25)) * 0.9;
    if (r() > dense) continue;
    if (Math.hypot(x - camp.x, z - camp.z) < 33) continue;
    if (Math.hypot(x - deposits[0].x, z - deposits[0].z) < 11) continue;
    if (Math.hypot(x - mine.x, z - mine.z) < 20) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 3) continue;
    if (roadDist(road, x, z) < roadW + 3 || roadDist(gateRoad, x, z) < roadW + 3) continue;
    const k = Math.round(z / CELL) * V + Math.round(x / CELL);
    if (mat[k] === MAT_MUD && r() < 0.7) continue;
    const dm = Math.hypot(x - mountain.x, z - mountain.z) / mountain.r;
    const kind = dm < 0.45 ? 2 : r() < 0.3 ? 1 : r() < 0.5 ? 2 : 0;
    trees.push({ x, z, s: 0.8 + r() * 0.6, kind, rot: r() * 6.28 });
  }

  // pedras (encosta da montanha, borda) e samambaias (mata, beira do lago)
  for (let i = 0; i < 160; i++) {
    const x = 6 + r() * (SIZE - 12);
    const z = 6 + r() * (SIZE - 12);
    if (Math.hypot(x - camp.x, z - camp.z) < 30 || Math.hypot(x - mine.x, z - mine.z) < 18) continue;
    if (roadDist(road, x, z) < roadW + 2 || roadDist(gateRoad, x, z) < roadW + 2) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 1) continue;
    const dm = Math.hypot(x - mountain.x, z - mountain.z) / mountain.r;
    if (dm > 0.95 && r() < 0.6) continue;
    trees.push({ x, z, s: 0.5 + r() * 1.1, kind: 4, rot: r() * 6.28 });
  }
  for (let i = 0; i < 260; i++) {
    const x = 6 + r() * (SIZE - 12);
    const z = 6 + r() * (SIZE - 12);
    if (Math.hypot(x - camp.x, z - camp.z) < 30 || Math.hypot(x - mine.x, z - mine.z) < 16) continue;
    if (roadDist(road, x, z) < roadW + 1.5 || roadDist(gateRoad, x, z) < roadW + 1.5) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 0.5) continue;
    trees.push({ x, z, s: 0.7 + r() * 0.7, kind: 5, rot: r() * 6.28 });
  }

  return { seed, camp, plant, stock, garage, houses, lake, mountain, mine, road: [...road], gateRoad: [gate, gateRoad[1], { x: stock.x, z: stock.z - 6 }], deposits, trees, gate };
}

