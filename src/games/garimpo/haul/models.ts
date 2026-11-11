/* ============================================================
 *  GARIMPO — modelos da estrada: cavalo mecânico 6x4 (cabine avançada com leito),
 *  carretas graneleiras com o concentrado de ouro (pilha que cresce com a carga),
 *  bomba de posto, placa, casinhas de cidade e carros do trânsito.
 *  Tudo no Kit (cantos arredondados, vidro/cromo, luzes acesas, sujeira embaixo).
 *  Origem: centro do eixo traseiro no chão; frente em +z.
 * ============================================================ */
import * as THREE from 'three';
import { Kit } from '../kit';
import { C } from '../models';

const TIRE = 0x1c1c1f;
function wheelPair(k: Kit, x: number, z: number, r: number, dual: boolean): void {
  for (const s of [1, -1]) {
    const w = dual ? 0.62 : 0.36;
    k.cylX(r, w, TIRE, s * x, r, z, 14);
    k.use('shiny').cylX(r * 0.55, w + 0.02, C.steel, s * x, r, z, 10).use('paint');
    k.cylX(r * 0.18, w + 0.06, C.steelD, s * x, r, z, 8);
  }
}

/** cavalo mecânico 6x4: cabine avançada, leito, tanques, chaminés, 5ª roda */
export function buildTractor(color = C.red): THREE.Group {
  const k = new Kit({ y: 1.0, k: 0.45 });
  const r = 0.52;
  // chassi
  k.rbox(1.0, 0.28, 7.0, 0.05, C.black, 0, 1.0, 2.0);
  // eixos
  wheelPair(k, 0.98, 4.3, r, false);
  wheelPair(k, 0.9, 0.65, r, true);
  wheelPair(k, 0.9, -0.65, r, true);
  // para-lamas
  for (const s of [1, -1]) {
    k.rbox(0.5, 0.12, 1.3, 0.05, C.black, s * 1.05, 1.15, 4.3);
    k.rbox(0.72, 0.1, 2.6, 0.04, C.black, s * 0.95, 1.18, 0);
  }
  // 5ª roda
  k.use('shiny').cyl(0.75, 0.75, 0.12, C.steelD, 0, 1.24, 0.35, 16).use('paint');
  k.box(0.5, 0.14, 0.9, C.black, 0, 1.32, -0.1);
  // tanques e caixas
  for (const s of [1, -1]) {
    k.use('shiny').cylZ(0.34, 1.5, C.chrome, s * 0.95, 0.95, 2.4).use('paint');
    k.rbox(0.5, 0.5, 0.6, 0.06, C.dark, s * 0.85, 0.9, 1.25);
  }
  // cabine avançada
  const y0 = 1.25;
  k.rbox(2.5, 2.75, 2.4, 0.18, color, 0, y0 + 1.37, 4.7);
  k.rbox(2.42, 0.55, 2.3, 0.15, color, 0, y0 + 3.0, 4.55); // teto alto (leito)
  k.rbox(2.3, 0.35, 0.8, 0.12, color, 0, y0 + 3.35, 4.4, -0.25); // defletor
  // para-brisa e janelas
  k.use('shiny');
  k.box(2.2, 1.05, 0.04, C.glass, 0, y0 + 2.05, 5.92, -0.08);
  for (const s of [1, -1]) k.box(0.04, 0.8, 0.95, C.glassL, s * 1.255, y0 + 2.05, 5.2);
  k.use('paint');
  // grade, para-choque, faróis
  k.rbox(2.3, 0.9, 0.08, 0.04, C.dark, 0, y0 + 0.7, 5.92);
  k.decal('grille', 2.0, 0.8, 0, y0 + 0.72, 5.97);
  k.rbox(2.55, 0.42, 0.35, 0.08, C.steelD, 0, y0 - 0.05, 5.95);
  for (const s of [1, -1]) {
    k.rbox(0.5, 0.24, 0.06, 0.03, C.black, s * 0.85, y0 + 0.2, 6.1);
    k.use('glow').box(0.44, 0.18, 0.03, C.light, s * 0.85, y0 + 0.2, 6.13).use('paint');
  }
  // luzes do teto
  k.fine((kk) => {
    for (let i = 0; i < 5; i++) kk.use('glow').box(0.14, 0.08, 0.04, C.amber, -0.6 + i * 0.3, y0 + 3.3, 4.85).use('paint');
  });
  // degraus, espelhos, chaminés
  for (const s of [1, -1]) {
    k.rbox(0.3, 0.06, 0.5, 0.02, C.steelD, s * 1.2, y0 - 0.1, 5.1);
    k.rbox(0.06, 0.55, 0.3, 0.03, C.black, s * 1.45, y0 + 2.2, 5.6);
    k.use('shiny').box(0.03, 0.48, 0.24, C.glassL, s * 1.47, y0 + 2.2, 5.55).use('paint');
    k.use('shiny').cyl(0.1, 0.1, 2.4, C.chrome, s * 1.05, y0 + 2.1, 3.35, 10).use('paint');
  }
  // faixa e logo na porta
  for (const s of [1, -1]) {
    k.decal('stripe', 2.2, 0.16, s * 1.26, y0 + 1.15, 4.7, s * Math.PI / 2);
    k.decal('logo', 1.0, 0.5, s * 1.26, y0 + 1.6, 4.4, s * Math.PI / 2);
  }
  k.decal('plate', 0.5, 0.17, 0, y0 - 0.02, 6.14);
  return k.build();
}

export interface TrailerParts {
  root: THREE.Group;
  /** pilha de concentrado (escala y = carga) */
  load: THREE.Object3D;
}
const BOX = [0x2f8ae0, 0xe8e0d0, 0x3fae4a, 0xf2b20f];
/** carreta graneleira: origem no eixo (tandem) traseiro; pino-rei em z = len */
export function buildTrailer(len: number, last: boolean, idx: number): TrailerParts {
  const k = new Kit({ y: 1.0, k: 0.5 });
  const r = 0.5;
  const front = len + 0.55;
  const back = last ? -1.6 : 0.95;
  const L = front - back;
  const zc = (front + back) / 2;
  const col = BOX[idx % BOX.length];
  // chassi e assoalho
  k.rbox(1.0, 0.3, len + 1.0, 0.04, C.black, 0, 1.05, len / 2);
  k.rbox(2.5, 0.16, L, 0.04, C.dark, 0, 1.3, zc);
  // caixa graneleira
  const h = 1.5;
  for (const s of [1, -1]) k.rbox(0.08, h, L, 0.03, col, s * 1.21, 1.38 + h / 2, zc);
  k.rbox(2.5, h, 0.08, 0.03, col, 0, 1.38 + h / 2, front - 0.04);
  k.rbox(2.5, h, 0.08, 0.03, col, 0, 1.38 + h / 2, back + 0.04);
  // fueiros (colunas) e frisos
  const nPost = Math.max(2, Math.round(L / 1.6));
  for (let i = 0; i <= nPost; i++) for (const s of [1, -1]) k.rbox(0.12, h + 0.06, 0.12, 0.02, C.steelD, s * 1.25, 1.38 + h / 2, back + (i / nPost) * L);
  for (const s of [1, -1]) k.rbox(0.06, 0.1, L, 0.02, C.steelD, s * 1.26, 1.4 + h, zc);
  // eixos (tandem)
  wheelPair(k, 0.92, 0.65, r, true);
  wheelPair(k, 0.92, -0.65, r, true);
  for (const s of [1, -1]) k.rbox(0.7, 0.08, 2.4, 0.03, C.black, s * 0.95, 1.12, 0);
  // pino-rei / pés de apoio
  k.box(0.2, 0.2, 0.2, C.steelD, 0, 1.15, len);
  for (const s of [1, -1]) k.box(0.12, 0.85, 0.12, C.steelD, s * 0.7, 0.65, len - 1.4);
  // 5ª roda da próxima (bitrem): plataforma atrás
  if (!last) {
    k.rbox(1.6, 0.14, 1.6, 0.03, C.black, 0, 1.2, 0);
    k.use('shiny').cyl(0.6, 0.6, 0.1, C.steelD, 0, 1.28, 0, 14).use('paint');
  } else {
    k.rbox(2.5, 0.2, 0.15, 0.03, C.black, 0, 0.95, back - 0.05);
    for (const s of [1, -1]) {
      k.use('glow').box(0.22, 0.12, 0.03, C.redL, s * 1.0, 1.0, back - 0.14).use('paint');
      k.use('glow').box(0.12, 0.12, 0.03, C.amber, s * 0.7, 1.0, back - 0.14).use('paint');
    }
    k.decal('hazard', 2.4, 0.22, 0, 1.55, back - 0.02, Math.PI);
  }
  // faixas refletivas laterais
  for (const s of [1, -1]) k.decal('stripe', L * 0.9, 0.14, s * 1.26, 1.65, zc, s * Math.PI / 2);
  const root = k.build();
  // carga (pilha de concentrado com pintinhas de ouro)
  const kl = new Kit();
  kl.rbox(2.3, 1.0, L - 0.25, 0.35, 0x7a4a2a, 0, 0.5, 0);
  kl.fine((kk) => {
    for (let i = 0; i < 18; i++) kk.use('glow').box(0.08, 0.04, 0.08, C.gold, ((i * 0.37) % 1.9) - 0.95, 1.0, ((i * 0.61) % 1) * (L - 1) - (L - 1) / 2);
  });
  const load = kl.build(false);
  load.position.set(0, 1.38, zc);
  root.add(load);
  return { root, load };
}

/** bomba de combustível com cobertura (posto) */
export function buildPump(): THREE.Group {
  const k = new Kit();
  k.rbox(9, 0.3, 6, 0.08, C.white, 0, 5.2, 0);
  k.rbox(9.1, 0.35, 0.2, 0.05, C.red, 0, 5.05, 3.0);
  k.rbox(9.1, 0.35, 0.2, 0.05, C.red, 0, 5.05, -3.0);
  for (const x of [-3.8, 3.8]) k.rbox(0.35, 5, 0.35, 0.05, C.white, x, 2.5, 0);
  for (const x of [-1.6, 1.6]) {
    k.rbox(0.9, 1.7, 0.6, 0.1, 0x2fa84a, x, 0.85, 0);
    k.rbox(0.7, 0.4, 0.04, 0.03, 0xe8fff0, x, 1.3, 0.31);
    k.cyl(0.04, 0.04, 0.9, C.black, x + 0.5, 0.9, 0.1, 6, 0, 0, 0.4);
  }
  k.rbox(1.2, 0.3, 4.5, 0.05, C.concrete, 0, 0.15, 0);
  k.fine((kk) => kk.use('glow').box(8.6, 0.06, 5.6, 0xfff3d0, 0, 5.03, 0).use('paint'));
  return k.build();
}

/** casinha de cidade/parada (cores variadas) */
export function buildShop(col: number, sign: number): THREE.Group {
  const k = new Kit({ y: 0.6, k: 0.3 });
  k.rbox(8, 3.2, 6, 0.08, col, 0, 1.6, 0);
  k.rbox(8.6, 0.3, 6.6, 0.05, C.roof, 0, 3.35, 0);
  k.rbox(8.4, 0.6, 1.8, 0.05, sign, 0, 3.0, 3.6, -0.15);
  k.box(1.4, 2.2, 0.06, C.wood, -2, 1.1, 3.02);
  k.use('shiny').box(2.6, 1.3, 0.05, C.glassL, 1.6, 1.6, 3.02).use('paint');
  k.fine((kk) => {
    for (const x of [-3, 3]) kk.use('glow').box(0.25, 0.25, 0.1, 0xffe0a0, x, 2.6, 3.1).use('paint');
  });
  return k.build();
}

/** carro do trânsito (pequeno, uma malha) */
export function buildCar(col: number): THREE.Group {
  const k = new Kit({ y: 0.4, k: 0.3 });
  k.rbox(1.8, 0.6, 4.2, 0.18, col, 0, 0.6, 0);
  k.rbox(1.6, 0.55, 2.2, 0.2, col, 0, 1.15, -0.2);
  k.use('shiny').box(1.5, 0.45, 0.04, C.glass, 0, 1.15, 0.92, -0.4).box(1.5, 0.45, 0.04, C.glass, 0, 1.15, -1.32, 0.3).use('paint');
  for (const x of [0.8, -0.8]) for (const z of [1.3, -1.3]) k.cylX(0.33, 0.24, TIRE, x, 0.33, z, 10);
  for (const s of [1, -1]) {
    k.use('glow').box(0.32, 0.14, 0.03, C.light, s * 0.6, 0.7, 2.1).use('paint');
    k.use('glow').box(0.3, 0.14, 0.03, C.redL, s * 0.6, 0.75, -2.11).use('paint');
  }
  return k.build();
}

/** placa verde de rodovia (texto desenhado no canvas) */
export function buildSign(lines: string[]): THREE.Group {
  const g = new THREE.Group();
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#1f6a3a';
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#fff';
  x.lineWidth = 10;
  x.strokeRect(10, 10, 492, 236);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, i) => {
    x.font = `800 ${i === 0 ? 54 : 46}px system-ui, sans-serif`;
    x.fillText(l, 256, 256 / (lines.length + 1) * (i + 1), 470);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshLambertMaterial({ map: tex }));
  board.position.y = 5.2;
  g.add(board);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
  back.rotation.y = Math.PI;
  back.position.y = 5.2;
  back.position.z = -0.02;
  g.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.4, 6), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
  for (const px of [-1.8, 1.8]) {
    const p = pole.clone();
    p.position.set(px, 3.2, -0.08);
    g.add(p);
  }
  return g;
}
