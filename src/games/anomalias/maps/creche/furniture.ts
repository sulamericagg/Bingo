/* ============================================================
 *  CRECHE — móveis e brinquedos (geometria local, origem no chão).
 *  Cada função escreve num G (baldes por material) — serve tanto para
 *  a geometria estática da sala quanto para peças soltas (k.part).
 * ============================================================ */
import * as THREE from 'three';
import type { G } from '../nightkit/kit';
import { shade } from '../nightkit/props';

const TAU = Math.PI * 2;

/** berço de grades: 0.72 × 1.3 (comprido em z), colchão em y ≈ 0.5 */
export function crib(g: G, x: number, z: number, ry: number, col: string, sheet: string, mat = 'paint'): void {
  const w = g(mat);
  const p = g('paint');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const W = 0.72;
  const L = 1.3;
  const H = 0.98;
  // pés/postes com bolinha
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const [px, pz] = P((sx * W) / 2, (sz * L) / 2);
      w.box(0.055, H + (sz < 0 ? 0.12 : 0), 0.055, px, 0, pz, col, ry);
      w.sph(0.04, px, H + (sz < 0 ? 0.12 : 0) + 0.03, pz, col, 1, 1, 1, 10);
    }
  // cabeceira (painel inteiro com aplique) e pezeira (grades, para ver o bebê)
  for (const sz of [-1, 1]) {
    const [px, pz] = P(0, (sz * L) / 2);
    w.box(W - 0.06, 0.05, 0.04, px, H - 0.05 + (sz < 0 ? 0.08 : 0), pz, col, ry);
    w.box(W - 0.06, 0.05, 0.04, px, 0.22, pz, col, ry);
    if (sz < 0) {
      w.box(W - 0.06, H - 0.24, 0.025, px, 0.27, pz, shade(col, -0.04), ry);
      const [qx, qz] = P(0, (sz * L) / 2 + 0.02);
      p.rcyl(0.11, 0.012, qx, 0.66, qz, sheet, 16, 0.4, Math.PI / 2, 0, ry);
    } else
      for (let i = 1; i < 7; i++) {
        const [qx, qz] = P(-W / 2 + (i / 7) * W, (sz * L) / 2);
        w.cyl(0.013, 0.013, H - 0.27, qx, 0.245, qz, col, 6);
      }
  }
  // laterais: corrimão + grades
  for (const sx of [-1, 1]) {
    const [px, pz] = P((sx * W) / 2, 0);
    w.box(0.045, 0.045, L - 0.05, px, H - 0.045, pz, col, ry);
    w.box(0.045, 0.045, L - 0.05, px, 0.2, pz, col, ry);
    const n = 13;
    for (let i = 1; i < n; i++) {
      const [qx, qz] = P((sx * W) / 2, -L / 2 + (i / n) * L);
      w.cyl(0.013, 0.013, H - 0.27, qx, 0.245, qz, col, 6);
    }
  }
  // estrado + colchão + lençol
  {
    const [px, pz] = P(0, 0);
    w.box(W - 0.04, 0.04, L - 0.04, px, 0.24, pz, shade(col, -0.2), ry);
    g('fabric').box(W - 0.07, 0.13, L - 0.07, px, 0.28, pz, sheet, ry);
    // travesseirinho
    const [ox, oz] = P(0, -L / 2 + 0.2);
    g('fabric').box(0.36, 0.06, 0.2, ox, 0.41, oz, '#ffffff', ry);
    // mantinha dobrada nos pés
    const [bx, bz] = P(0, L / 2 - 0.22);
    g('fabric').box(W - 0.1, 0.05, 0.3, bx, 0.41, bz, shade(sheet, -0.18), ry);
  }
}

/** cadeirão de bebê (alimentação), virado para +z; bandeja na frente */
export function highChair(g: G, x: number, z: number, ry: number, col: string, seat: string): void {
  const p = g('paint');
  const m = g('metal');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  // pernas abertas (tubos)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const [a, b] = P(sx * 0.27, sz * 0.27);
      const [e, f] = P(sx * 0.17, sz * 0.12);
      m.tube([[a, 0.02, b], [(a + e) / 2, 0.35, (b + f) / 2], [e, 0.66, f]], 0.018, '#e8e8ee', 4, 6);
      m.sph(0.03, a, 0.02, b, '#5a5a6a', 1, 0.6, 1, 8);
    }
  // apoio de pés
  {
    const [a, b] = P(0, 0.22);
    p.box(0.3, 0.025, 0.1, a, 0.3, b, col, ry);
  }
  // assento-concha
  {
    const [a, b] = P(0, -0.02);
    p.box(0.38, 0.08, 0.36, a, 0.64, b, col, ry);
    const [e, f] = P(0, -0.19);
    p.box(0.38, 0.5, 0.06, e, 0.68, f, col, ry, -0.12);
    for (const sx of [-1, 1]) {
      const [h, i] = P(sx * 0.18, -0.02);
      p.box(0.04, 0.2, 0.34, h, 0.7, i, col, ry);
    }
    g('fabric').box(0.32, 0.04, 0.3, a, 0.72, b, seat, ry);
    g('fabric').box(0.32, 0.42, 0.03, e, 0.74, f + 0.0, seat, ry, -0.12);
  }
  // bandeja
  {
    const [a, b] = P(0, 0.22);
    p.box(0.5, 0.035, 0.24, a, 0.86, b, '#ffffff', ry);
    p.box(0.44, 0.03, 0.18, a, 0.885, b, shade(col, 0.5), ry);
  }
}

/** mesinha infantil redonda + cadeirinhas */
export function kidTable(g: G, x: number, z: number, top: string, chairs: string[]): void {
  const p = g('paint');
  p.rcyl(0.55, 0.04, x, 0.48, z, top, 28, 0.4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + TAU / 8;
    p.cyl(0.025, 0.025, 0.48, x + Math.cos(a) * 0.36, 0, z + Math.sin(a) * 0.36, '#ffffff', 8);
  }
  chairs.forEach((col, i) => {
    const a = (i / chairs.length) * TAU;
    const cx = x + Math.cos(a) * 0.78;
    const cz = z + Math.sin(a) * 0.78;
    const ry = -a - Math.PI / 2;
    kidChair(g, cx, cz, ry, col);
  });
}
export function kidChair(g: G, x: number, z: number, ry: number, col: string): void {
  const p = g('paint');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const [a, b] = P(sx * 0.13, sz * 0.13);
      p.cyl(0.018, 0.018, 0.28, a, 0, b, '#ffffff', 6);
    }
  const [a, b] = P(0, 0);
  p.box(0.32, 0.035, 0.32, a, 0.28, b, col, ry);
  const [e, f] = P(0, -0.15);
  p.box(0.32, 0.26, 0.03, e, 0.31, f, col, ry);
}

/** cavalinho de balanço (peça solta), virado para +x */
export function rockingHorse(g: G, col: string, mane: string): void {
  const p = g('paint');
  const w = g('wood');
  // balancins (arcos)
  for (const sz of [-1, 1]) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8 - 0.5) * 1.2;
      pts.push([Math.sin(t) * 0.55, 0.62 - Math.cos(t) * 0.58, sz * 0.16]);
    }
    w.tube(pts, 0.025, '#c68a4a', 16, 6);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.cyl(0.025, 0.025, 0.3, sx * 0.24, 0.07, sz * 0.12, '#c68a4a', 6, 0, -sz * 0.35);
  // corpo, pescoço, cabeça
  p.sph(0.22, 0, 0.45, 0, col, 1.45, 0.75, 0.75, 16);
  p.cyl(0.08, 0.1, 0.3, 0.22, 0.45, 0, col, 10, 0, -0.6);
  p.sph(0.11, 0.38, 0.72, 0, col, 1.5, 0.9, 0.85, 12);
  p.sph(0.05, 0.53, 0.68, 0, shade(col, -0.15), 1, 1, 1, 8);
  for (const sz of [-1, 1]) {
    p.sph(0.022, 0.42, 0.78, sz * 0.085, '#2a1a1a', 1, 1, 1, 6);
    p.lathe([[0.03, 0], [0, 0.07]], 0.3, 0.8, sz * 0.05, col, 6);
  }
  // crina e rabo
  for (let i = 0; i < 5; i++) p.sph(0.045, 0.16 + i * 0.05, 0.62 + i * 0.04, 0, mane, 1, 1, 0.7, 8);
  p.sph(0.06, -0.33, 0.48, 0, mane, 1.6, 0.7, 0.7, 8);
  // sela
  p.box(0.2, 0.03, 0.34, 0, 0.6, 0, '#e05a5a');
  // alças
  for (const sz of [-1, 1]) g('metal').cyl(0.012, 0.012, 0.16, 0.3, 0.75, sz * 0.08, '#e8d070', 6, Math.PI / 2);
}

/** escorregador de plástico (peça estática), escada em −x, rampa descendo para +x */
export function slide(g: G, x: number, z: number, col: string, rail: string): void {
  const p = g('paint');
  // plataforma + escada
  p.box(0.6, 0.06, 0.6, x - 0.55, 0.9, z, rail);
  for (const sz of [-1, 1]) {
    p.box(0.06, 0.96, 0.06, x - 0.82, 0, z + sz * 0.27, rail);
    p.box(0.06, 1.35, 0.06, x - 0.28, 0, z + sz * 0.27, rail);
    p.box(0.06, 0.96, 0.06, x - 0.82 - 0.0, 0, z + sz * 0.27, rail);
    // guarda-corpo
    p.box(0.6, 0.05, 0.04, x - 0.55, 1.3, z + sz * 0.27, col);
  }
  for (let i = 0; i < 4; i++) p.box(0.08, 0.04, 0.5, x - 0.95, 0.2 + i * 0.22, z, col);
  for (const sz of [-1, 1]) p.box(0.05, 1.0, 0.05, x - 1.0, 0, z + sz * 0.25, col, 0, 0, 0.2);
  // rampa (calha) inclinada
  const L = 1.5;
  const a = Math.atan2(0.85, 1.25);
  const cx = x + 0.38;
  const cy = 0.5;
  p.box(L, 0.04, 0.5, cx, cy - 0.02, z, col, 0, 0, -a);
  for (const sz of [-1, 1]) p.box(L, 0.14, 0.04, cx, cy - 0.02, z + sz * 0.25, shade(col, -0.1), 0, 0, -a);
  p.box(0.3, 0.04, 0.5, x + 1.12, 0.06, z, col);
  p.box(0.05, 0.06, 0.5, x + 1.26, 0, z, col);
}

/** caixa de brinquedos (baú) com tampa (tampa separada pelo chamador) */
export function toyChest(g: G, col: string, trim: string): void {
  const p = g('paint');
  p.box(0.8, 0.45, 0.46, 0, 0, 0, col);
  p.box(0.84, 0.05, 0.5, 0, 0.42, 0, trim);
  p.box(0.84, 0.06, 0.5, 0, 0.0, 0, trim);
  // letras/estrelas aplicadas
  p.rcyl(0.08, 0.01, -0.2, 0.24, 0.235, '#ffd25a', 5, 0.3, Math.PI / 2);
  p.rcyl(0.07, 0.01, 0.05, 0.22, 0.235, '#5ac8ff', 16, 0.3, Math.PI / 2);
  p.rcyl(0.06, 0.01, 0.25, 0.26, 0.235, '#7ae07a', 3, 0.3, Math.PI / 2);
}

/** urso de pelúcia (peça), sentado, virado para +z */
export function teddy(g: G, col: string, s = 1, bow = '#ff5a8a'): void {
  const p = g('fabric');
  const S = s;
  p.sph(0.16 * S, 0, 0.17 * S, 0, col, 1, 1.1, 0.9, 14);
  p.sph(0.11 * S, 0, 0.18 * S, 0.1 * S, shade(col, 0.35), 1, 1.1, 0.5, 12);
  p.sph(0.13 * S, 0, 0.42 * S, 0.01 * S, col, 1.05, 0.95, 0.95, 14);
  p.sph(0.06 * S, 0, 0.39 * S, 0.11 * S, shade(col, 0.35), 1.1, 0.8, 0.8, 10);
  for (const sx of [-1, 1]) {
    p.sph(0.05 * S, sx * 0.1 * S, 0.53 * S, 0, col, 1, 1, 0.6, 10);
    p.sph(0.03 * S, sx * 0.1 * S, 0.53 * S, 0.02 * S, shade(col, 0.35), 1, 1, 0.5, 8);
    p.sph(0.06 * S, sx * 0.16 * S, 0.2 * S, 0.05 * S, col, 0.8, 1.3, 0.8, 10); // braços
    p.sph(0.07 * S, sx * 0.09 * S, 0.05 * S, 0.12 * S, col, 0.9, 0.7, 1.2, 10); // pés
  }
  const q = g('paint');
  q.sph(0.022 * S, 0, 0.415 * S, 0.165 * S, '#2a1a1a', 1, 0.8, 0.6, 8);
  for (const sx of [-1, 1]) q.sph(0.018 * S, sx * 0.05 * S, 0.46 * S, 0.115 * S, '#1a1010', 1, 1, 0.6, 8);
  q.sph(0.035 * S, -0.03 * S, 0.3 * S, 0.09 * S, bow, 1, 0.7, 0.6, 8);
  q.sph(0.035 * S, 0.03 * S, 0.3 * S, 0.09 * S, bow, 1, 0.7, 0.6, 8);
}

/** caixinha de música (peça): caixa + tampa (tampa e bailarina ficam por conta do chamador) */
export function musicBox(g: G, col: string): void {
  const p = g('paint');
  p.box(0.22, 0.1, 0.15, 0, 0, 0, col);
  p.box(0.23, 0.015, 0.16, 0, 0.0, 0, '#e8c860');
  p.box(0.23, 0.015, 0.16, 0, 0.09, 0, '#e8c860');
  p.cyl(0.012, 0.012, 0.05, 0.12, 0.05, 0, '#e8c860', 6, 0, Math.PI / 2);
  p.sph(0.02, 0.15, 0.05, 0, '#e8c860', 1, 1, 0.4, 6);
}

/** carrinho de bebê (peça), virado para +x */
export function stroller(g: G, col: string, hood: string): void {
  const p = g('paint');
  const m = g('metal');
  // rodas
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      p.torus(0.09, 0.025, sx * 0.3, 0.11, sz * 0.24, '#2a2a30', 0, 14);
      m.cyl(0.03, 0.03, 0.04, sx * 0.3, 0.11, sz * 0.24, '#d0d0d8', 8, Math.PI / 2);
    }
  // chassi
  m.tube([[-0.3, 0.11, 0.0], [-0.1, 0.35, 0], [0.3, 0.11, 0]], 0.014, '#c0c0c8', 8, 5);
  for (const sz of [-1, 1]) m.tube([[-0.3, 0.11, sz * 0.24], [-0.05, 0.42, sz * 0.22], [0.3, 0.11, sz * 0.24]], 0.014, '#c0c0c8', 8, 5);
  m.tube([[-0.2, 0.45, -0.22], [-0.42, 0.95, -0.22], [-0.42, 0.95, 0.22], [-0.2, 0.45, 0.22]], 0.015, '#c0c0c8', 10, 5);
  g('fabric').box(0.36, 0.06, 0.44, -0.42, 0.93, 0, '#2a2a30');
  // cesto (ovo)
  p.sph(0.32, 0.02, 0.6, 0, col, 1.15, 0.6, 0.75, 16);
  g('fabric').box(0.44, 0.05, 0.36, 0.05, 0.69, 0, shade(col, 0.4));
  // capota
  const hoodG = new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI, 0, Math.PI / 2);
  hoodG.rotateZ(Math.PI / 2);
  hoodG.rotateY(Math.PI / 2);
  p.geo(hoodG, hood, -0.12, 0.7, 0);
}

/** banheirinha/troca: pilha de fraldas (peça) */
export function diaperStack(g: G, n: number, col: string): void {
  const p = g('fabric');
  for (let i = 0; i < n; i++) p.box(0.24, 0.045, 0.16, (i % 2) * 0.01, i * 0.046, 0, i % 3 === 1 ? shade(col, -0.06) : col);
}

/** patinho de borracha (peça) virado para +x */
export function duck(g: G, col = '#ffd23a', s = 1): void {
  const p = g('paint');
  p.sph(0.06 * s, 0, 0.045 * s, 0, col, 1.3, 0.8, 1, 12);
  p.sph(0.04 * s, 0.045 * s, 0.1 * s, 0, col, 1, 1, 1, 10);
  p.sph(0.02 * s, 0.085 * s, 0.095 * s, 0, '#ff8a2a', 1.3, 0.5, 1, 8);
  for (const sz of [-1, 1]) p.sph(0.008 * s, 0.07 * s, 0.11 * s, sz * 0.022 * s, '#111', 1, 1, 1, 6);
  p.sph(0.03 * s, -0.07 * s, 0.07 * s, 0, col, 1, 0.6, 0.8, 8);
}

/** mamadeira (peça) em pé */
export function bottle(g: G, milk = '#fffaf0', cap = '#7ac8ff'): void {
  const p = g('paint');
  p.lathe([[0.035, 0], [0.038, 0.01], [0.038, 0.12], [0.03, 0.135]], 0, 0, 0, milk, 12);
  p.lathe([[0.034, 0], [0.036, 0.03], [0.02, 0.04], [0.012, 0.05], [0.006, 0.075], [0, 0.08]], 0, 0.13, 0, cap, 12);
}

/** bolinhas da piscina: geometria única (instanciar) */
export function ballGeo(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(0.06, 1);
}
/** cubo de brinquedo com letra (geometria única; cor na instância) */
export function blockGeo(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.12, 0.12, 0.12);
}

/** móbile (peça): haste + aro + 5 bichinhos pendurados. A peça gira em y. */
export function mobile(g: G): void {
  const p = g('paint');
  p.cyl(0.008, 0.008, 0.45, 0, -0.45, 0, '#f0f0f0', 6);
  p.torus(0.2, 0.008, 0, -0.45, 0, '#ffd27a', Math.PI / 2, 20);
  const cols = ['#ff8ab3', '#7ec8ff', '#ffe066', '#9be5b0', '#c9a8ff'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const x = Math.cos(a) * 0.2;
    const z = Math.sin(a) * 0.2;
    p.cyl(0.003, 0.003, 0.14, x, -0.6, z, '#f0f0f0', 3);
    if (i % 2) {
      // estrela (dois cones achatados)
      p.sph(0.045, x, -0.64, z, cols[i], 1, 1, 0.4, 5);
    } else {
      // nuvem/lua (bolinha + orelhas: um Bloopzinho)
      p.sph(0.045, x, -0.64, z, cols[i], 1, 0.9, 0.9, 10);
      p.sph(0.01, x - 0.015, -0.63, z + 0.04, '#222', 1, 1, 1, 5);
      p.sph(0.01, x + 0.015, -0.63, z + 0.04, '#222', 1, 1, 1, 5);
    }
  }
  p.sph(0.03, 0, -0.42, 0, '#ffd27a', 1, 1, 1, 8);
}
