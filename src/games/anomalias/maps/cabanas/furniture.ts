/* ============================================================
 *  CABANAS — móveis rústicos (geometria local, origem no chão).
 * ============================================================ */
import type { G } from '../nightkit/kit';
import { shade } from '../nightkit/props';

const TAU = Math.PI * 2;

/** cama de casal de toras (cabeceira em −z). Colchão em y ≈ 0.55 */
export function logBed(g: G, w = 1.5, l = 2.0, frame = '#a8703f', sheet = '#f4efe6'): void {
  const wd = g('wood');
  // pés/postes de tora
  for (const sx of [-1, 1]) {
    wd.cyl(0.07, 0.075, 1.15, sx * (w / 2), 0, -l / 2 + 0.06, frame, 10);
    wd.cyl(0.065, 0.07, 0.65, sx * (w / 2), 0, l / 2 - 0.06, frame, 10);
    wd.sph(0.075, sx * (w / 2), 1.15, -l / 2 + 0.06, shade(frame, 0.1), 1, 0.7, 1, 8);
  }
  // cabeceira: 3 toras horizontais
  for (let i = 0; i < 3; i++) wd.cyl(0.05, 0.05, w - 0.1, 0, 0.55 + i * 0.2, -l / 2 + 0.06, shade(frame, i % 2 ? 0.06 : -0.04), 10, 0, Math.PI / 2);
  wd.cyl(0.05, 0.05, w - 0.1, 0, 0.42, l / 2 - 0.06, frame, 10, 0, Math.PI / 2);
  // laterais
  for (const sx of [-1, 1]) wd.box(0.06, 0.16, l - 0.12, sx * (w / 2 - 0.02), 0.25, 0, shade(frame, -0.1));
  // estrado + colchão
  g('fabric').box(w - 0.08, 0.2, l - 0.14, 0, 0.36, 0, sheet);
}

/** colcha + travesseiros (arrumado) — parte trocada pela tarefa */
export function bedMade(g: G, w = 1.5, l = 2.0, quilt = '#b84a3a', quilt2 = '#e8c070'): void {
  const f = g('fabric');
  f.box(w - 0.04, 0.06, l * 0.72, 0, 0.55, l * 0.13, quilt);
  f.box(w - 0.02, 0.32, 0.04, 0, 0.27, l / 2 - 0.08 + 0.02, quilt);
  for (const sx of [-1, 1]) f.box(0.04, 0.3, l * 0.72, sx * (w / 2 - 0.0), 0.28, l * 0.13, quilt);
  // faixa xadrez da colcha
  f.box(w - 0.02, 0.065, 0.22, 0, 0.555, l * 0.38, quilt2);
  f.box(w - 0.02, 0.065, 0.1, 0, 0.555, -l * 0.05, quilt2);
  // dobra do lençol + travesseiros
  f.box(w - 0.06, 0.07, 0.2, 0, 0.56, -l * 0.25, '#ffffff');
  for (const sx of [-1, 1]) f.box(w * 0.4, 0.13, 0.36, sx * w * 0.23, 0.57, -l / 2 + 0.3, '#fbf8f2');
}
/** cama desarrumada */
export function bedMessy(g: G, w = 1.5, l = 2.0, quilt = '#b84a3a'): void {
  const f = g('fabric');
  f.box(w * 0.9, 0.12, l * 0.5, 0.15, 0.55, l * 0.15, quilt, 0.35);
  f.sph(0.3, -0.2, 0.62, 0.2, quilt, 1.4, 0.4, 1, 10);
  f.box(w * 0.42, 0.13, 0.36, 0.4, 0.56, -l / 2 + 0.35, '#fbf8f2', 0.5, 0.2);
  f.box(w * 0.42, 0.13, 0.36, -0.55, 0.12, l / 2 + 0.25, '#fbf8f2', 1.1); // travesseiro no chão
  f.box(0.5, 0.03, 0.4, 0.5, 0.0, l / 2 + 0.4, '#f0f0f0', 0.4); // lençol no chão
}

/** criado-mudo de madeira */
export function nightstand(g: G, x: number, z: number, col = '#9a6a3a'): void {
  g('wood').box(0.45, 0.55, 0.4, x, 0, z, col);
  g('wood').box(0.48, 0.03, 0.43, x, 0.55, z, shade(col, 0.1));
  g('paint').sph(0.02, x, 0.38, z + 0.205, '#d8c27a', 1, 1, 0.6, 6);
  g('paint').box(0.4, 0.008, 0.01, x, 0.3, z + 0.2, shade(col, -0.3));
}

/** guarda-roupa (corpo); portas são peças à parte */
export function wardrobeBody(g: G, w = 1.1, h = 2.0, d = 0.55, col = '#8a5a32'): void {
  const wd = g('wood');
  wd.box(w, 0.06, d, 0, 0, 0, shade(col, -0.2));
  wd.box(0.04, h, d, -w / 2 + 0.02, 0, 0, col);
  wd.box(0.04, h, d, w / 2 - 0.02, 0, 0, col);
  wd.box(w, 0.06, d, 0, h - 0.06, 0, col);
  wd.box(w + 0.06, 0.08, d + 0.04, 0, h, 0, shade(col, 0.1));
  wd.box(w - 0.06, h - 0.12, 0.02, 0, 0.06, -d / 2 + 0.01, shade(col, -0.25));
  // cabideiro + roupas (vistas quando abre)
  g('paint').cyl(0.012, 0.012, w - 0.1, 0, h - 0.35, 0, '#c0c0c8', 6, 0, Math.PI / 2);
  const cols = ['#4a6a9a', '#c84a4a', '#e8e0d0', '#3a5a3a'];
  for (let i = 0; i < 4; i++) g('fabric').box(0.06, 0.8, 0.4, -w / 2 + 0.2 + i * 0.22, h - 1.2, 0, cols[i]);
}
/** porta do guarda-roupa (dobradiça na origem, folha em +x) */
export function wardrobeDoor(g: G, w: number, h: number, col = '#8a5a32'): void {
  const wd = g('wood');
  wd.box(w, h, 0.03, w / 2, 0, 0, col);
  wd.box(w * 0.7, h * 0.36, 0.012, w / 2, h * 0.08, 0.018, shade(col, 0.08));
  wd.box(w * 0.7, h * 0.36, 0.012, w / 2, h * 0.52, 0.018, shade(col, 0.08));
  g('paint').sph(0.022, w - 0.06, h * 0.48, 0.03, '#d8c27a', 1, 1, 1, 6);
}

/** poltrona de balanço de varanda (virada para +z) */
export function porchRocker(g: G, col = '#7a4a2a'): void {
  const w = g('wood');
  for (const s of [-1, 1]) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8 - 0.5) * 1.0;
      pts.push([s * 0.26, 0.5 - Math.cos(t) * 0.5, Math.sin(t) * 0.5]);
    }
    w.tube(pts, 0.02, col, 12, 5);
    w.box(0.04, 0.42, 0.04, s * 0.25, 0.02, 0.18, col);
    w.box(0.04, 1.0, 0.04, s * 0.25, 0.02, -0.2, col, 0, -0.18);
    w.box(0.05, 0.04, 0.45, s * 0.27, 0.62, 0.0, col);
  }
  w.box(0.5, 0.04, 0.42, 0, 0.42, 0, col);
  for (let i = 0; i < 5; i++) w.box(0.05, 0.6, 0.02, -0.18 + i * 0.09, 0.47, -0.21 - 0.0, col, 0, -0.18);
}

/** lampião de jardim (poste + gaiola); a chama é instanciada pelo mapa */
export function lanternPost(g: G, x: number, z: number, y = 0): void {
  const w = g('wood');
  w.box(0.12, 1.25, 0.12, x, y, z, '#5a3a22');
  w.box(0.2, 0.06, 0.2, x, y + 1.25, z, '#4a2e1a');
  const m = g('paint');
  // gaiola do lampião
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.018, 0.32, 0.018, x + sx * 0.09, y + 1.31, z + sz * 0.09, '#2a2a30');
  m.box(0.22, 0.03, 0.22, x, y + 1.31, z, '#2a2a30');
  m.frustum(0.26, 0.26, 0.06, 0.06, 0.12, x, y + 1.63, z, '#2a2a30');
  m.torus(0.04, 0.01, x, y + 1.78, z, '#2a2a30', 0, 10);
  g('glass').box(0.16, 0.3, 0.16, x, y + 1.33, z, '#fff2d0');
  m.box(0.14, 0.03, 0.14, x, y + 1.0, z, '#2a2a30');
}

/** pilha de lenha (toras empilhadas) */
export function woodPile(g: G, x: number, z: number, ry: number, rows = 3, len = 1.2): void {
  const w = g('wood');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < 5 - r; i++) {
      const lx = (i - (4 - r) / 2) * 0.17;
      const y = 0.08 + r * 0.145;
      w.cyl(0.08, 0.08, len, x + lx * c, y, z - lx * s, i % 2 ? '#8a5a32' : '#9a6a3a', 8, Math.PI / 2, 0, ry);
      // pontas claras (cortes)
      for (const e of [-1, 1]) w.cyl(0.07, 0.07, 0.01, x + lx * c + e * (len / 2) * s, y, z - lx * s + e * (len / 2) * c, '#e8c890', 8, Math.PI / 2, 0, ry);
    }
}

/** malas (peça) */
export function suitcase(g: G, col: string, w = 0.5, h = 0.36, d = 0.2): void {
  const p = g('paint');
  p.box(w, h, d, 0, 0, 0, col);
  p.box(w + 0.01, 0.03, d + 0.01, 0, h * 0.25, 0, shade(col, -0.3));
  p.box(w + 0.01, 0.03, d + 0.01, 0, h * 0.7, 0, shade(col, -0.3));
  p.torus(0.06, 0.012, 0, h + 0.01, 0, '#2a2a30', 0, 10, 0, Math.PI);
}

/** cabeça de alce (troféu) — virada para +z, origem no centro da placa */
export function mooseHead(g: G): void {
  const w = g('wood');
  w.lathe([[0.0, 0], [0.32, 0], [0.34, 0.03], [0.3, 0.06], [0, 0.06]], 0, 0, 0, '#6a4224', 20, Math.PI / 2);
  const p = g('fabric');
  p.sph(0.2, 0, -0.02, 0.2, '#6a4a32', 1, 1.1, 1.1, 14);
  p.sph(0.14, 0, -0.12, 0.42, '#5a3a24', 1, 1, 1.5, 12);
  p.sph(0.1, 0, -0.18, 0.58, '#4a2e1c', 1.1, 0.9, 1.1, 10);
  for (const s of [-1, 1]) {
    p.sph(0.05, s * 0.16, 0.12, 0.18, '#5a3a24', 1.4, 0.6, 0.8, 8);
    g('paint').sph(0.025, s * 0.1, 0.03, 0.37, '#140a06', 1, 1, 1, 6);
    g('paint').sph(0.018, s * 0.05, -0.24, 0.7, '#140a06', 1, 0.6, 1, 6);
    // galhada em pá
    const a = g('wood');
    a.tube([[s * 0.12, 0.12, 0.15], [s * 0.3, 0.22, 0.12], [s * 0.45, 0.32, 0.08]], 0.03, '#e8d8b8', 6, 6);
    a.sph(0.16, s * 0.52, 0.4, 0.06, '#e8d8b8', 1.1, 0.6, 0.25, 10);
    for (let i = 0; i < 4; i++) a.lathe([[0.03, 0], [0, 0.12]], s * (0.4 + i * 0.08), 0.48 + (i % 2) * 0.04, 0.06, '#e8d8b8', 5, 0, -s * 0.4);
  }
}

/** sofá rústico (virado para +z) */
export function sofa(g: G, w = 2.0, col = '#7a3a2a', cushion = '#9a4a34'): void {
  const f = g('fabric');
  g('wood').box(w + 0.1, 0.12, 0.9, 0, 0, 0, '#5a3a22');
  f.box(w, 0.32, 0.85, 0, 0.12, 0, col);
  f.box(w, 0.55, 0.22, 0, 0.3, -0.33, col);
  for (const s of [-1, 1]) f.box(0.2, 0.55, 0.85, s * (w / 2 - 0.1), 0.12, 0, col);
  const n = Math.round(w / 0.75);
  for (let i = 0; i < n; i++) f.box((w - 0.45) / n - 0.02, 0.12, 0.6, -w / 2 + 0.22 + ((w - 0.45) / n) * (i + 0.5), 0.44, 0.08, cushion);
  f.box(0.35, 0.3, 0.12, -w / 2 + 0.45, 0.55, -0.15, '#e8c070', 0, -0.2, 0.2);
}
/** poltrona */
export function armchair(g: G, col = '#3a5a4a', cushion = '#4a6a5a'): void {
  const f = g('fabric');
  g('wood').box(0.85, 0.1, 0.85, 0, 0, 0, '#5a3a22');
  f.box(0.8, 0.32, 0.8, 0, 0.1, 0, col);
  f.box(0.8, 0.62, 0.2, 0, 0.3, -0.3, col);
  for (const s of [-1, 1]) f.box(0.16, 0.5, 0.8, s * 0.32, 0.1, 0, col);
  f.box(0.5, 0.12, 0.58, 0, 0.42, 0.06, cushion);
}

/** máquina de lavar (frente +z); a porta redonda é peça à parte */
export function washer(g: G, col = '#f2f2f2'): void {
  const p = g('paint');
  p.box(0.6, 0.85, 0.6, 0, 0, 0, col);
  p.box(0.58, 0.12, 0.02, 0, 0.72, 0.3, '#d8dce4');
  for (let i = 0; i < 3; i++) p.cyl(0.02, 0.02, 0.015, -0.15 + i * 0.08, 0.78, 0.31, '#3a3a44', 10, Math.PI / 2);
  p.torus(0.2, 0.025, 0, 0.38, 0.302, '#c8ccd4', 0, 20);
  p.cyl(0.18, 0.18, 0.01, 0, 0.38, 0.29, '#2a3038', 20, Math.PI / 2);
}

/** varal com lençóis (2 postes em ±L/2 no eixo x) */
export function clothesline(g: G, L: number): void {
  const w = g('wood');
  for (const s of [-1, 1]) {
    w.box(0.08, 1.9, 0.08, (s * L) / 2, 0, 0, '#6a4a2a');
    w.box(0.5, 0.06, 0.06, (s * L) / 2, 1.85, 0, '#6a4a2a');
  }
  g('paint').cyl(0.006, 0.006, L, 0, 1.82, 0.0, '#e8e8e8', 4, 0, Math.PI / 2);
}

/** fogueira com pedras (o fogo é peça à parte) */
export function firePitRing(g: G): void {
  const p = g('stone');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    p.sph(0.14, Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55, i % 2 ? '#8a8480' : '#a09a92', 1.2, 0.7, 1, 8);
  }
  g('paint').cyl(0.48, 0.5, 0.02, 0, 0, 0, '#2a2420', 16);
}
/** chamas (fogo estilizado: cones emissivos) — peça */
export function flames(g: G, s = 1, col1 = '#ffb43a', col2 = '#ff6a1a', col3 = '#fff0a0'): void {
  const f = g('glow');
  f.lathe([[0.18 * s, 0], [0.16 * s, 0.12 * s], [0.08 * s, 0.35 * s], [0, 0.55 * s]], 0, 0, 0, col2, 9);
  f.lathe([[0.12 * s, 0], [0.11 * s, 0.1 * s], [0.05 * s, 0.28 * s], [0, 0.42 * s]], 0.08 * s, 0.02, 0.05 * s, col1, 8);
  f.lathe([[0.1 * s, 0], [0.09 * s, 0.08 * s], [0.04 * s, 0.22 * s], [0, 0.36 * s]], -0.09 * s, 0.02, -0.04 * s, col1, 8);
  f.lathe([[0.07 * s, 0], [0.06 * s, 0.06 * s], [0, 0.22 * s]], 0, 0.04, 0.02, col3, 8);
}
/** toras dentro da lareira/fogueira */
export function fireLogs(g: G, s = 1): void {
  const w = g('wood');
  w.cyl(0.07 * s, 0.07 * s, 0.6 * s, 0, 0.07 * s, 0, '#5a3a22', 8, Math.PI / 2, 0, 0.5);
  w.cyl(0.07 * s, 0.07 * s, 0.6 * s, 0, 0.07 * s, 0, '#4a2e1a', 8, Math.PI / 2, 0, -0.6);
  w.cyl(0.06 * s, 0.06 * s, 0.5 * s, 0, 0.18 * s, 0, '#5a3a22', 8, Math.PI / 2, 0, 1.6);
}

/** toalhas dobradas (pilha) */
export function towels(g: G, n = 2, col = '#ffffff', col2 = '#b8d8e8'): void {
  for (let i = 0; i < n; i++) g('fabric').box(0.36, 0.06, 0.26, 0, i * 0.062, 0, i % 2 ? col2 : col);
}
