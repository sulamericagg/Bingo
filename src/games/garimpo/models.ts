/* ============================================================
 *  GARIMPO BRUTO — modelos procedurais (originais, marca própria "Bloop Máquinas").
 *  Peças arredondadas com normais suaves, vidro e cromados brilhantes, faróis acesos,
 *  adesivos (logo, zebrado, placa), sujeira de terra nas partes baixas e LOD (kit.setLod).
 * ============================================================ */
import * as THREE from 'three';
import { Kit, lod, MAT, stretch } from './kit';

export { stretch };

export const C = {
  yellow: 0xf2b20f,
  yellowD: 0xc98a08,
  orange: 0xe8651e,
  red: 0xd23a2a,
  teal: 0x1f8f8a,
  white: 0xf3efe6,
  steel: 0x8b9096,
  steelD: 0x4d5257,
  chrome: 0xd9dde2,
  dark: 0x2b2d31,
  black: 0x18191b,
  rubber: 0x1c1c1f,
  glass: 0x24394a,
  glassL: 0x5d86a0,
  light: 0xfff4c8,
  redL: 0xff3a2a,
  amber: 0xffa21a,
  dirt: 0x8a4a26,
  wood: 0x7a5232,
  woodL: 0xa8784c,
  roof: 0xb5462e,
  gold: 0xffcc33,
  hat: 0xffc21a,
  skin: 0xe0a77a,
  shirt: 0x2f6fbf,
  jeans: 0x34496e,
  concrete: 0xa8a49a,
};

/* ------------------------------ cilindro hidráulico telescópico ------------------------------ */
/** camisa fica no pino A, haste cromada no pino B; set() a cada quadro */
export class Ram extends THREE.Group {
  private barrel: THREE.Object3D;
  private rod: THREE.Object3D;
  constructor(
    r: number,
    private len: number,
    color = C.yellowD,
  ) {
    super();
    const kb = new Kit();
    kb.cyl(r, r, len, color, 0, len / 2, 0, 10);
    kb.cyl(r * 1.15, r * 1.15, 0.12, C.dark, 0, len - 0.05, 0, 10);
    kb.cylX(r * 0.9, r * 2.4, C.steelD, 0, 0, 0, 8);
    this.barrel = kb.build();
    const kr = new Kit();
    kr.use('shiny').cyl(r * 0.55, r * 0.55, len, C.chrome, 0, len / 2, 0, 8);
    kr.use('paint').cylX(r * 0.8, r * 2.2, C.steelD, 0, 0, 0, 8);
    this.rod = kr.build();
    this.add(this.barrel, this.rod);
  }
  set(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    stretch(this.barrel, ax, ay, az, bx, by, bz);
    this.barrel.scale.y = 1;
    stretch(this.rod, bx, by, bz, ax, ay, az);
    this.rod.scale.y = 1;
    void this.len;
  }
}

/* ------------------------------ rodas ------------------------------ */
/** pneu de borracha com ombro redondo, cravos em V, aro brilhante com parafusos */
export function wheelMesh(r: number, w: number, rim = C.steel): THREE.Group {
  const k = new Kit();
  // perfil do pneu (torneado no eixo y, depois deitado)
  const pts: THREE.Vector2[] = [];
  const hw = w / 2;
  const n = lod() ? 4 : 7;
  pts.push(new THREE.Vector2(r * 0.6, -hw));
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push(new THREE.Vector2(r - 0.12 * r + Math.cos(a) * 0.12 * r, Math.sin(a) * hw));
  }
  pts.push(new THREE.Vector2(r * 0.6, hw));
  k.add(new THREE.LatheGeometry(pts, lod() ? 12 : 22), C.rubber, 0, 0, 0, 0, 0, Math.PI / 2);
  k.fine((kk) => {
    const lugs = 14;
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      const cy = Math.cos(a) * r * 0.99;
      const cz = Math.sin(a) * r * 0.99;
      kk.box(w * 0.42, r * 0.09, r * 0.2, C.rubber, w * 0.22, cy, cz, a, 0.5, 0);
      kk.box(w * 0.42, r * 0.09, r * 0.2, C.rubber, -w * 0.22, cy, cz, a, -0.5, 0);
    }
  });
  k.use('shiny');
  k.cylX(r * 0.58, w * 0.9, rim, 0, 0, 0, 16);
  k.use('paint');
  k.cylX(r * 0.3, w * 1.02, C.steelD, 0, 0, 0, 10);
  k.fine((kk) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      kk.use('shiny').cylX(r * 0.04, w * 1.06, C.chrome, 0, Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, 6);
    }
    kk.use('paint');
  });
  return k.build();
}

/** cabine com colunas, vidros e teto (frente em +z) */
function cab(k: Kit, w: number, h: number, d: number, x: number, y: number, z: number, color: number, slope = 0.12): void {
  const p = 0.07; // espessura das colunas
  // colunas (A frente, B meio, C atrás)
  for (const sx of [1, -1]) {
    k.rbox(p, h, p, 0.02, color, x + sx * (w / 2 - p / 2), y, z + d / 2 - p / 2 - slope * h * 0.5, -slope, 0, 0);
    k.rbox(p, h, p, 0.02, color, x + sx * (w / 2 - p / 2), y, z - d / 2 + p / 2);
    k.fine((kk) => kk.rbox(p, h, p, 0.02, color, x + sx * (w / 2 - p / 2), y, z));
  }
  k.rbox(w + 0.04, 0.1, d + 0.04, 0.04, color, x, y + h / 2 + 0.03, z - slope * h * 0.3);
  k.rbox(w, 0.14, d, 0.04, color, x, y - h / 2, z);
  // vidros (um pouco para dentro)
  k.use('shiny');
  k.box(w - p * 1.2, h * 0.92, 0.03, C.glass, x, y, z + d / 2 - 0.05 - slope * h * 0.5, -slope);
  k.box(w - p * 1.2, h * 0.88, 0.03, C.glass, x, y, z - d / 2 + 0.05);
  k.box(0.03, h * 0.88, d - p * 2, C.glassL, x + w / 2 - 0.04, y, z);
  k.box(0.03, h * 0.88, d - p * 2, C.glassL, x - w / 2 + 0.04, y, z);
  k.use('paint');
}
function mirror(k: Kit, x: number, y: number, z: number, s = 1): void {
  k.fine((kk) => {
    kk.box(0.25 * s, 0.03, 0.03, C.dark, x - Math.sign(x) * 0.1 * s, y, z);
    kk.rbox(0.07 * s, 0.26 * s, 0.16 * s, 0.02, C.black, x, y, z);
    kk.use('shiny').box(0.075 * s, 0.22 * s, 0.01, C.glassL, x, y, z - 0.08 * s);
    kk.use('paint');
  });
}
function lamp(k: Kit, x: number, y: number, z: number, w: number, h: number, col = C.light): void {
  k.rbox(w + 0.04, h + 0.04, 0.06, 0.02, C.black, x, y, z - 0.02);
  k.use('glow').box(w, h, 0.03, col, x, y, z + 0.015);
  k.use('paint');
}

/* --------------------------- pickup 4x4 --------------------------- */
export function buildPickup(color = C.teal): { body: THREE.Group } {
  const k = new Kit({ y: -0.1, k: 0.55 });
  k.rbox(1.45, 0.22, 4.5, 0.05, C.dark, 0, -0.28, 0);
  k.rbox(1.88, 0.5, 1.7, 0.12, color, 0, 0.12, 1.6); // capô
  k.rbox(1.8, 0.1, 1.5, 0.08, color, 0, 0.38, 1.55, 0.05); // tampa do capô
  k.rbox(1.88, 0.55, 1.65, 0.1, color, 0, 0.1, 0.02); // base da cabine
  cab(k, 1.78, 0.62, 1.55, 0, 0.66, 0.05, color, 0.3);
  k.rbox(1.88, 0.55, 1.8, 0.08, color, 0, 0.12, -1.62); // caçamba
  k.box(1.6, 0.5, 1.66, 0x163a3b, 0, 0.2, -1.62);
  k.rbox(1.88, 0.06, 0.1, 0.02, C.dark, 0, 0.41, -2.5);
  // para-lamas alargados
  for (const z of [1.52, -1.45]) for (const s of [1, -1]) k.rbox(0.18, 0.2, 1.2, 0.08, C.black, s * 0.98, 0.0, z);
  // para-choques, guincho, grade
  k.rbox(2.0, 0.24, 0.24, 0.06, C.black, 0, -0.08, 2.48);
  k.fine((kk) => {
    kk.cylX(0.1, 0.5, C.steelD, 0, -0.06, 2.62);
    kk.use('shiny').box(0.04, 0.04, 0.2, C.chrome, 0, -0.06, 2.75).use('paint');
  });
  k.rbox(1.3, 0.3, 0.06, 0.03, C.black, 0, 0.22, 2.44);
  k.decal('grille', 1.24, 0.28, 0, 0.22, 2.48);
  lamp(k, 0.68, 0.26, 2.46, 0.3, 0.14);
  lamp(k, -0.68, 0.26, 2.46, 0.3, 0.14);
  k.rbox(2.0, 0.22, 0.2, 0.06, C.black, 0, -0.12, -2.5);
  lamp(k, 0.82, 0.2, -2.53, 0.14, 0.24, C.redL);
  lamp(k, -0.82, 0.2, -2.53, 0.14, 0.24, C.redL);
  k.decal('plate', 0.5, 0.17, 0, -0.08, -2.61, Math.PI);
  // barra de luzes, santo-antônio, snorkel, estribos
  k.rbox(1.4, 0.1, 0.14, 0.04, C.black, 0, 1.06, 0.45);
  k.fine((kk) => {
    for (let i = 0; i < 4; i++) {
      kk.use('glow').box(0.22, 0.06, 0.02, C.light, -0.48 + i * 0.32, 1.06, 0.53);
    }
    kk.use('paint');
    kk.cyl(0.04, 0.04, 1.6, C.black, 0, 0.98, -0.9, 8, 0, 0, Math.PI / 2);
    kk.cyl(0.04, 0.04, 0.55, C.black, 0.8, 0.7, -0.9, 8);
    kk.cyl(0.04, 0.04, 0.55, C.black, -0.8, 0.7, -0.9, 8);
    kk.cyl(0.06, 0.06, 1.0, C.black, 1.0, 0.55, 1.0, 8);
    kk.rbox(0.14, 0.12, 0.2, 0.04, C.black, 1.0, 1.08, 1.04);
    kk.rbox(0.22, 0.05, 1.5, 0.02, C.steelD, 1.0, -0.3, 0.1);
    kk.rbox(0.22, 0.05, 1.5, 0.02, C.steelD, -1.0, -0.3, 0.1);
    kk.box(0.03, 0.04, 0.22, C.steelD, 0.94, 0.25, 0.25);
  });
  mirror(k, 1.08, 0.58, 0.78);
  mirror(k, -1.08, 0.58, 0.78);
  k.decal('logoDark', 0.9, 0.45, 0.945, 0.12, 0.05, Math.PI / 2);
  k.decal('logoDark', 0.9, 0.45, -0.945, 0.12, 0.05, -Math.PI / 2);
  return { body: k.build() };
}

/* --------------------------- caminhão basculante 6x4 --------------------------- */
export function buildTruck(color = C.orange): { body: THREE.Group; bed: THREE.Group; heap: THREE.Mesh; ram: Ram } {
  const k = new Kit({ y: -0.2, k: 0.6 });
  k.rbox(1.1, 0.32, 7.6, 0.04, C.dark, 0, -0.2, -0.3); // longarinas
  k.fine((kk) => {
    for (let i = 0; i < 5; i++) kk.box(1.0, 0.18, 0.12, C.dark, 0, -0.2, -3.6 + i * 1.6);
  });
  // cabine avançada
  k.rbox(2.42, 0.95, 1.75, 0.14, color, 0, 0.62, 2.78);
  cab(k, 2.36, 0.85, 1.6, 0, 1.52, 2.76, color, 0.08);
  k.rbox(2.2, 0.22, 0.42, 0.08, color, 0, 2.08, 3.15); // pala
  k.rbox(2.5, 0.42, 0.34, 0.08, C.black, 0, 0.12, 3.68);
  k.decal('hazard', 2.3, 0.22, 0, 0.12, 3.86);
  k.decal('grille', 1.7, 0.6, 0, 0.66, 3.66);
  lamp(k, 0.95, 0.42, 3.66, 0.34, 0.18);
  lamp(k, -0.95, 0.42, 3.66, 0.34, 0.18);
  k.fine((kk) => {
    // giroflex no teto
    kk.use('glow').cyl(0.1, 0.1, 0.14, C.amber, 0.7, 2.06, 2.5, 8);
    kk.cyl(0.1, 0.1, 0.14, C.amber, -0.7, 2.06, 2.5, 8);
    kk.use('paint');
    // degraus e alças
    for (const s of [1, -1]) {
      kk.box(0.4, 0.04, 0.32, C.steelD, s * 1.15, -0.05, 2.45);
      kk.box(0.4, 0.04, 0.32, C.steelD, s * 1.15, 0.3, 2.45);
      kk.use('shiny').cyl(0.025, 0.025, 0.9, C.chrome, s * 1.23, 1.3, 2.0).use('paint');
    }
  });
  mirror(k, 1.42, 1.55, 3.3, 1.3);
  mirror(k, -1.42, 1.55, 3.3, 1.3);
  for (const s of [1, -1]) {
    k.rbox(0.42, 0.42, 1.15, 0.12, C.black, s * 1.12, 0.12, 2.6); // para-lama dianteiro
    k.rbox(0.42, 0.14, 2.7, 0.05, C.black, s * 1.12, 0.32, -2.05); // para-lama traseiro
    k.decal('logoDark', 1.05, 0.52, s * 1.215, 0.68, 2.78, s * Math.PI / 2);
  }
  // tanque cromado, caixa de bateria
  k.use('shiny').cylX(0.3, 1.0, C.chrome, 0, 0, 0).use('paint');
  k.use('shiny').add(new THREE.CylinderGeometry(0.3, 0.3, 1.0, lod() ? 8 : 16), C.chrome, 0.95, 0.12, 1.25, Math.PI / 2, 0, 0).use('paint');
  k.rbox(0.55, 0.5, 0.7, 0.05, C.dark, -0.95, 0.12, 1.25);
  // escapamento vertical
  k.use('shiny').cyl(0.08, 0.08, 1.9, C.chrome, -1.05, 1.5, 1.9).use('paint');
  k.cyl(0.1, 0.1, 0.12, C.dark, -1.05, 2.48, 1.9);
  k.rbox(1.0, 0.24, 0.2, 0.05, C.black, 0, 0.18, -4.05);
  lamp(k, 0.7, 0.2, -4.16, 0.22, 0.14, C.redL);
  lamp(k, -0.7, 0.2, -4.16, 0.22, 0.14, C.redL);
  const body = k.build();
  // caçamba (gira no pino traseiro)
  const bk = new Kit({ y: 0.4, k: 0.65 });
  const L = 3.6;
  bk.rbox(2.35, 0.12, L, 0.04, C.yellowD, 0, 0.06, L / 2);
  bk.rbox(0.1, 1.0, L, 0.03, color, 1.12, 0.56, L / 2);
  bk.rbox(0.1, 1.0, L, 0.03, color, -1.12, 0.56, L / 2);
  bk.rbox(2.35, 1.25, 0.12, 0.04, color, 0, 0.66, L - 0.05);
  bk.rbox(2.35, 0.1, 0.65, 0.04, color, 0, 1.27, L + 0.27, 0.12);
  bk.rbox(2.2, 0.9, 0.1, 0.04, C.yellowD, 0, 0.5, 0.0);
  for (let i = 0; i < 5; i++) {
    bk.rbox(0.07, 1.0, 0.12, 0.03, C.yellowD, 1.19, 0.55, 0.35 + i * 0.75);
    bk.rbox(0.07, 1.0, 0.12, 0.03, C.yellowD, -1.19, 0.55, 0.35 + i * 0.75);
  }
  bk.rbox(2.4, 0.1, 0.1, 0.03, C.yellowD, 0, 1.06, L / 2 - 1.8 + 0.05);
  bk.decal('hazard', 2.1, 0.2, 0, 0.35, -0.06, Math.PI);
  bk.decal('stripe', L - 0.4, 0.07, 1.075, 0.78, L / 2, -Math.PI / 2);
  bk.decal('stripe', L - 0.4, 0.07, -1.075, 0.78, L / 2, Math.PI / 2);
  bk.decal('num1', 0.55, 0.55, 1.245, 0.55, L / 2 + 1.0, Math.PI / 2);
  bk.decal('num1', 0.55, 0.55, -1.245, 0.55, L / 2 + 1.0, -Math.PI / 2);
  const bed = new THREE.Group();
  bed.add(bk.build());
  bed.position.set(0, 0.42, -3.9);
  const hk = new Kit();
  hk.ball(1, C.dirt, 0, 0.32, 0, 1.05, 0.38, 1.7, 1);
  const heap = new THREE.Mesh(hk.geometry(), MAT.paint);
  heap.position.set(0, 0.12, L / 2);
  heap.visible = false;
  bed.add(heap);
  body.add(bed);
  const ram = new Ram(0.13, 1.0, C.steelD);
  body.add(ram);
  return { body, bed, heap, ram };
}

/* --------------------------- esteira --------------------------- */
function trackPair(k: Kit, gauge: number, len: number, y: number, h = 0.75, w = 0.6): void {
  for (const s of [1, -1]) {
    const x = s * gauge;
    // quadro da esteira
    k.rbox(w * 0.7, h * 0.5, len - h * 0.4, 0.06, C.dark, x, y, 0);
    k.cylX(h / 2, w, C.black, x, y, len / 2, 16);
    k.cylX(h / 2, w, C.black, x, y, -len / 2, 16);
    k.box(w, 0.08, len, C.black, x, y + h / 2 - 0.04, 0);
    k.box(w, 0.08, len, C.black, x, y - h / 2 + 0.04, 0);
    // sapatas com garra
    k.fine((kk) => {
      const n = Math.round(len / 0.24);
      for (let i = 0; i <= n; i++) {
        const z = -len / 2 + (i * len) / n;
        kk.box(w * 1.04, 0.06, 0.09, 0x2c2c30, x, y + h / 2 + 0.01, z);
        kk.box(w * 1.04, 0.06, 0.09, 0x2c2c30, x, y - h / 2 - 0.01, z);
      }
      // garras nas pontas arredondadas
      for (const zc of [len / 2, -len / 2])
        for (let i = 1; i < 6; i++) {
          const a = (i / 6) * Math.PI;
          const sgn = zc > 0 ? 1 : -1;
          kk.box(w * 1.04, 0.09, 0.06, 0x2c2c30, x, y + Math.cos(a) * (h / 2 + 0.01), zc + sgn * Math.sin(a) * (h / 2 + 0.01), sgn * a);
        }
    });
    // roda-guia, roda motriz com dentes, roletes
    k.cylX(h * 0.38, w * 1.08, C.yellowD, x, y, len / 2, 14);
    k.cylX(h * 0.4, w * 1.08, C.steelD, x, y, -len / 2, 14);
    k.fine((kk) => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        kk.box(w * 1.1, 0.07, 0.1, C.steelD, x, y + Math.cos(a) * h * 0.42, -len / 2 + Math.sin(a) * h * 0.42, a);
      }
      for (let i = 1; i < 5; i++) kk.cylX(h * 0.17, w * 1.06, C.steel, x, y - h * 0.18, -len / 2 + (i * len) / 5, 8);
      for (let i = 1; i < 3; i++) kk.cylX(h * 0.1, w * 0.5, C.steel, x, y + h * 0.3, -len / 2 + (i * len) / 3, 8);
    });
  }
}

/* --------------------------- trator de esteira --------------------------- */
export function buildDozer(): { body: THREE.Group; blade: THREE.Group; rams: Ram[] } {
  const k = new Kit({ y: -0.3, k: 0.6 });
  trackPair(k, 1.08, 3.3, -0.62, 0.78, 0.62);
  k.rbox(1.6, 0.5, 3.4, 0.08, C.yellowD, 0, -0.35, 0);
  // capô do motor (inclinado) e grade
  k.rbox(1.5, 0.9, 2.1, 0.16, C.yellow, 0, 0.32, 0.72);
  k.rbox(1.42, 0.12, 1.9, 0.08, C.yellow, 0, 0.78, 0.7, -0.04);
  k.decal('grille', 1.2, 0.7, 0, 0.32, 1.78);
  k.decal('logo', 1.4, 0.7, 0.755, 0.35, 0.7, Math.PI / 2);
  k.decal('logo', 1.4, 0.7, -0.755, 0.35, 0.7, -Math.PI / 2);
  // escapamento com chapéu e pré-filtro
  k.use('shiny').cyl(0.08, 0.08, 0.9, C.chrome, 0.42, 1.2, 1.2).use('paint');
  k.cyl(0.11, 0.11, 0.08, C.dark, 0.42, 1.66, 1.2);
  k.fine((kk) => kk.cyl(0.12, 0.12, 0.3, C.dark, -0.4, 0.98, 1.3, 10));
  // deck e para-lamas
  k.rbox(2.25, 0.2, 1.7, 0.06, C.yellow, 0, 0.0, -0.85);
  k.decal('hazardV', 0.12, 0.6, 1.13, 0.0, -0.3, Math.PI / 2, -Math.PI / 2);
  // cabine ROPS
  k.rbox(1.45, 0.5, 1.35, 0.1, C.yellow, 0, 0.35, -0.95);
  cab(k, 1.42, 0.95, 1.3, 0, 1.08, -0.95, C.yellow, 0.05);
  k.rbox(1.62, 0.1, 1.5, 0.05, C.yellowD, 0, 1.62, -0.95);
  lamp(k, 0.55, 1.55, -0.18, 0.14, 0.12);
  lamp(k, -0.55, 1.55, -0.18, 0.14, 0.12);
  k.fine((kk) => {
    kk.use('glow').cyl(0.08, 0.08, 0.12, C.amber, 0, 1.73, -0.95, 8).use('paint');
    for (const s of [1, -1]) kk.cyl(0.025, 0.025, 1.0, C.black, s * 0.78, 0.55, -0.3, 6);
  });
  // escarificador traseiro
  k.rbox(1.6, 0.25, 0.25, 0.05, C.yellowD, 0, -0.2, -2.1);
  k.rbox(0.16, 0.95, 0.2, 0.04, C.steelD, 0, -0.55, -2.35, 0.3);
  k.box(0.14, 0.12, 0.18, C.steel, 0, -1.0, -2.5, 0.3);
  const body = k.build();
  // lâmina curva (perfil extrudado) + braços
  const bk = new Kit({ y: -0.4, k: 0.7 });
  // aiveca côncava para a frente: pé e topo avançados, meio recuado
  const prof: [number, number][] = [];
  const zc = (t: number) => 0.2 * (2 * t - 1) * (2 * t - 1) + (t > 0.85 ? (t - 0.85) * 0.9 : 0) - 0.05;
  for (let i = 0; i <= 10; i++) prof.push([zc(i / 10), -0.62 + (i / 10) * 1.22]);
  for (let i = 10; i >= 0; i--) prof.push([zc(i / 10) - 0.12, -0.62 + (i / 10) * 1.22]);
  bk.profile(prof, 3.5, C.yellow, 0, 0, 0.12, 0.02);
  bk.use('shiny').box(3.52, 0.07, 0.24, C.steel, 0, -0.62, 0.08).use('paint');
  bk.rbox(0.14, 1.25, 0.5, 0.04, C.yellowD, 1.74, -0.05, -0.05);
  bk.rbox(0.14, 1.25, 0.5, 0.04, C.yellowD, -1.74, -0.05, -0.05);
  bk.decal('hazard', 3.2, 0.18, 0, 0.5, -0.13, Math.PI);
  for (const s of [1, -1]) {
    bk.rbox(0.2, 0.24, 2.0, 0.06, C.yellowD, s * 1.25, -0.38, -1.1);
    bk.fine((kk) => kk.box(0.3, 0.3, 0.3, C.steelD, s * 0.5, 0.25, -0.18));
  }
  const blade = new THREE.Group();
  blade.add(bk.build());
  blade.position.set(0, 0, 2.55);
  body.add(blade);
  const rams = [new Ram(0.09, 0.9), new Ram(0.09, 0.9)];
  for (const r of rams) body.add(r);
  return { body, blade, rams };
}

/* --------------------------- escavadeira --------------------------- */
export interface ExcavatorParts {
  body: THREE.Object3D;
  house: THREE.Group;
  boom: THREE.Group;
  arm: THREE.Group;
  bucket: THREE.Group;
  tip: THREE.Object3D;
  heap: THREE.Mesh;
  cylBoom: Ram;
  cylArm: Ram;
  cylBucket: Ram;
}
export const EXC = { boomL: 4.6, armL: 2.7, bucketL: 1.15 };
export function buildExcavator(): ExcavatorParts {
  const k = new Kit({ y: -0.3, k: 0.6 });
  trackPair(k, 1.15, 3.6, -0.6, 0.8, 0.6);
  k.rbox(1.7, 0.45, 2.6, 0.08, C.dark, 0, -0.45, 0);
  k.cyl(0.95, 0.95, 0.22, C.steelD, 0, -0.12, 0, 20);
  const body = k.build();
  // casa (gira)
  const hk = new Kit({ y: 0.1, k: 0.4 });
  hk.rbox(2.5, 0.85, 2.9, 0.16, C.yellow, 0, 0.45, -0.35);
  hk.rbox(2.5, 0.95, 1.05, 0.28, C.dark, 0, 0.5, -1.95); // contrapeso
  hk.decal('logoDark', 1.6, 0.8, 0, 0.55, -2.485, Math.PI);
  hk.decal('hazard', 2.2, 0.16, 0, 0.08, -2.485, Math.PI);
  hk.rbox(1.25, 0.32, 1.7, 0.1, C.yellow, -0.55, 1.0, -0.6);
  hk.decal('grille', 0.9, 0.5, -1.255, 0.5, -0.9, -Math.PI / 2);
  hk.decal('logo', 1.2, 0.6, 1.255, 0.5, -0.9, Math.PI / 2);
  // cabine à esquerda
  hk.rbox(1.0, 0.25, 1.3, 0.06, C.yellow, 0.72, 0.98, 0.5);
  cab(hk, 0.98, 1.2, 1.25, 0.72, 1.7, 0.5, C.yellow, 0.08);
  lamp(hk, 0.45, 2.15, 1.16, 0.12, 0.1);
  hk.fine((kk) => {
    kk.use('shiny').cyl(0.07, 0.07, 0.8, C.chrome, -0.85, 1.4, -1.0).use('paint');
    kk.cyl(0.09, 0.09, 0.07, C.dark, -0.85, 1.82, -1.0);
    kk.cyl(0.025, 0.025, 1.8, C.black, -1.18, 1.25, -0.5, 6, Math.PI / 2);
    kk.cyl(0.025, 0.025, 0.3, C.black, -1.18, 1.1, 0.4, 6);
    kk.cyl(0.025, 0.025, 0.3, C.black, -1.18, 1.1, -1.4, 6);
    kk.use('glow').cyl(0.07, 0.07, 0.1, C.amber, 0.72, 2.37, 0.2, 8).use('paint');
  });
  hk.rbox(0.7, 0.55, 0.7, 0.08, C.yellowD, 0, 0.75, 1.05); // base da lança
  const house = new THREE.Group();
  house.add(hk.build());
  body.add(house);
  // lança (banana)
  const boom = new THREE.Group();
  boom.position.set(0, 0.95, 1.2);
  const bk = new Kit({ y: -0.2, k: 0.3 });
  const L = EXC.boomL;
  bk.profile([[-0.2, -0.25], [L * 0.45, 0.35], [L + 0.15, -0.2], [L + 0.1, 0.18], [L * 0.45, 0.85], [-0.25, 0.3]], 0.5, C.yellow, 0, 0, 0, 0.04);
  bk.cylX(0.17, 0.72, C.steelD, 0, 0, 0);
  bk.cylX(0.14, 0.62, C.steelD, 0, 0, L);
  bk.fine((kk) => kk.cylX(0.1, 0.6, C.steelD, 0, 0.72, L * 0.42));
  boom.add(bk.build());
  house.add(boom);
  const arm = new THREE.Group();
  arm.position.set(0, 0, L);
  const ak = new Kit({ y: -0.6, k: 0.4 });
  const A = EXC.armL;
  ak.profile([[-0.55, 0.15], [-0.2, 0.62], [A * 0.45, 0.28], [A + 0.05, 0.14], [A + 0.05, -0.16], [A * 0.4, -0.22], [-0.3, -0.18]], 0.4, C.yellow, 0, 0, 0, 0.03);
  ak.cylX(0.12, 0.52, C.steelD, 0, 0, A);
  ak.fine((kk) => kk.cylX(0.09, 0.5, C.steelD, 0, 0.42, -0.3));
  arm.add(ak.build());
  boom.add(arm);
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, A);
  const uk = new Kit({ y: 0, k: 0.8 });
  const BL = EXC.bucketL;
  // casco curvo da caçamba (perfil em C), laterais e dentes
  const shell: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = 0.2 + (i / 10) * 2.3;
    shell.push([BL * 0.5 - Math.cos(a) * BL * 0.55, 0.15 - Math.sin(a) * 0.5]);
  }
  for (let i = 10; i >= 0; i--) {
    const a = 0.2 + (i / 10) * 2.3;
    shell.push([BL * 0.5 - Math.cos(a) * BL * 0.47, 0.15 - Math.sin(a) * 0.42]);
  }
  uk.profile(shell, 1.0, C.yellowD, 0, 0, 0, 0.02);
  uk.profile([[0, 0.18], [BL * 0.98, -0.32], [BL * 0.85, -0.45], [0.1, -0.35], [-0.1, 0.05]], 0.06, C.yellow, 0.52, 0, 0, 0.01);
  uk.profile([[0, 0.18], [BL * 0.98, -0.32], [BL * 0.85, -0.45], [0.1, -0.35], [-0.1, 0.05]], 0.06, C.yellow, -0.52, 0, 0, 0.01);
  uk.use('shiny').box(1.04, 0.06, 0.18, C.steel, 0, -0.33, BL * 0.98, 0.3).use('paint');
  for (let i = 0; i < 5; i++) uk.use('shiny').cyl(0.035, 0.06, 0.24, C.steel, -0.4 + i * 0.2, -0.37, BL * 1.07, 6, Math.PI / 2 + 0.3).use('paint');
  uk.box(0.4, 0.2, 0.25, C.steelD, 0, 0.22, 0.05);
  bucket.add(uk.build());
  const hpk = new Kit();
  hpk.ball(0.42, C.dirt, 0, 0, 0, 1.15, 0.6, 1.0, 1);
  const heap = new THREE.Mesh(hpk.geometry(), MAT.paint);
  heap.position.set(0, -0.15, BL * 0.45);
  heap.visible = false;
  bucket.add(heap);
  const tip = new THREE.Object3D();
  tip.position.set(0, -0.36, BL * 1.12);
  bucket.add(tip);
  arm.add(bucket);
  const cylBoom = new Ram(0.14, 1.9);
  const cylArm = new Ram(0.12, 1.6);
  const cylBucket = new Ram(0.1, 1.15);
  house.add(cylBoom);
  boom.add(cylArm);
  arm.add(cylBucket);
  return { body, house, boom, arm, bucket, tip, heap, cylBoom, cylArm, cylBucket };
}

/* --------------------------- helicóptero --------------------------- */
export function buildHeli(): { body: THREE.Group; rotor: THREE.Object3D; tail: THREE.Object3D; bucket: THREE.Object3D; water: THREE.Mesh } {
  const k = new Kit();
  // fuselagem torneada (gota), cabine de vidro
  const prof: THREE.Vector2[] = [];
  const N = lod() ? 8 : 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = Math.sin(Math.PI * Math.pow(t, 0.75)) * 1.05 * (1 - t * 0.35);
    prof.push(new THREE.Vector2(Math.max(0.02, r), -1.9 + t * 4.2));
  }
  k.add(new THREE.LatheGeometry(prof, lod() ? 10 : 20), C.red, 0, 0.95, 0.15, Math.PI / 2, 0, 0, 1, 1, 0.82);
  k.use('shiny').ball(0.9, 0x4f7890, 0, 1.15, 1.3, 0.9, 0.72, 0.95, 2).use('paint');
  k.rbox(1.3, 0.3, 1.9, 0.12, C.white, 0, 0.42, 0.2);
  k.rbox(1.1, 0.55, 1.4, 0.2, C.white, 0, 1.82, -0.35); // capô do motor
  k.decal('logoDark', 1.3, 0.65, 0.985, 0.95, -0.25, Math.PI / 2);
  k.decal('logoDark', 1.3, 0.65, -0.985, 0.95, -0.25, -Math.PI / 2);
  k.decal('stripe', 2.2, 0.12, 0.99, 0.5, 0.2, Math.PI / 2);
  k.decal('stripe', 2.2, 0.12, -0.99, 0.5, 0.2, -Math.PI / 2);
  // cone de cauda, deriva, estabilizador
  k.cyl(0.14, 0.38, 4.6, C.red, 0, 1.25, -3.6, 12, Math.PI / 2 - 0.05);
  k.profile([[-0.5, 0], [0.2, 0], [0.5, 1.2], [0.15, 1.3], [-0.35, 0.3]], 0.1, C.red, 0, 1.25, -5.85, 0.02);
  k.rbox(1.7, 0.07, 0.5, 0.03, C.white, 0, 1.3, -5.0);
  k.decal('num2', 0.5, 0.5, 0.06, 1.85, -5.95, Math.PI / 2);
  lamp(k, 0, 0.35, 2.1, 0.22, 0.12);
  k.fine((kk) => kk.use('glow').ball(0.06, C.redL, 0, 2.15, -0.9).use('paint'));
  // esquis
  for (const s of [1, -1]) {
    k.use('shiny').cylZ(0.055, 3.0, C.steel, s * 0.9, -0.2, 0.3).use('paint');
    k.use('shiny').cyl(0.05, 0.05, 0.3, C.steel, s * 0.9, -0.2, 1.83, 6, 0.9).use('paint');
    k.cyl(0.04, 0.04, 0.75, C.steelD, s * 0.72, 0.15, 1.0, 6, 0, 0, s * 0.45);
    k.cyl(0.04, 0.04, 0.75, C.steelD, s * 0.72, 0.15, -0.5, 6, 0, 0, s * 0.45);
  }
  k.cyl(0.12, 0.16, 0.5, C.dark, 0, 2.22, 0.15, 10); // mastro
  const body = k.build();
  // rotor: pás + disco borrado
  const rotor = new THREE.Group();
  const rk = new Kit();
  for (let i = 0; i < 4; i++) rk.rbox(0.26, 0.04, 5.3, 0.02, C.dark, 0, 0, 0, 0, (i * Math.PI) / 2 + Math.PI / 4);
  rk.cyl(0.18, 0.18, 0.14, C.steelD, 0, 0, 0, 10);
  rotor.add(rk.build(false));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blurTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
  disc.name = 'blur';
  rotor.add(disc);
  rotor.position.set(0, 2.5, 0.15);
  body.add(rotor);
  const tail = new THREE.Group();
  const tk = new Kit();
  tk.rbox(0.05, 1.3, 0.14, 0.02, C.dark, 0, 0, 0);
  tk.rbox(0.05, 0.14, 1.3, 0.02, C.dark, 0, 0, 0);
  tail.add(tk.build(false));
  const tdisc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: blurTexture(), transparent: true, depthWrite: false, opacity: 0.5, side: THREE.DoubleSide }));
  tdisc.name = 'blur';
  tail.add(tdisc);
  tail.position.set(0.16, 1.85, -5.75);
  body.add(tail);
  // balde d'água (lona laranja com aro)
  const bkk = new Kit();
  bkk.cyl(0.75, 0.52, 1.0, C.orange, 0, 0, 0, 16);
  bkk.cyl(0.78, 0.78, 0.08, C.dark, 0, 0.5, 0, 16);
  bkk.cyl(0.55, 0.55, 0.06, C.dark, 0, -0.5, 0, 16);
  bkk.fine((kk) => {
    for (let i = 0; i < 4; i++) kk.cyl(0.015, 0.015, 1.2, C.dark, Math.cos((i * Math.PI) / 2) * 0.35, 1.0, Math.sin((i * Math.PI) / 2) * 0.35, 4, Math.sin((i * Math.PI) / 2) * 0.35, 0, -Math.cos((i * Math.PI) / 2) * 0.35);
  });
  const bucket = bkk.build();
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 16), new THREE.MeshPhongMaterial({ color: 0x3d8bd6, shininess: 90, transparent: true, opacity: 0.85 }));
  water.position.y = 0.35;
  bucket.add(water);
  return { body, rotor, tail, bucket, water };
}

let blurT: THREE.Texture | null = null;
function blurTexture(): THREE.Texture {
  if (blurT) return blurT;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(30,30,32,0.9)');
  g.addColorStop(0.15, 'rgba(30,30,32,0.15)');
  g.addColorStop(0.85, 'rgba(30,30,32,0.28)');
  g.addColorStop(0.97, 'rgba(30,30,32,0.45)');
  g.addColorStop(1, 'rgba(30,30,32,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  blurT = new THREE.CanvasTexture(c);
  return blurT;
}

/* --------------------------- garimpeiro + carrinho de mão --------------------------- */
export interface WorkerParts {
  root: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  barrow: THREE.Group;
  heap: THREE.Mesh;
  shovel: THREE.Object3D;
  bucket: THREE.Object3D;
}
export function buildWorker(shirt = C.shirt): WorkerParts {
  const root = new THREE.Group();
  const tk = new Kit();
  tk.add(new THREE.CapsuleGeometry(0.21, 0.36, 3, lod() ? 6 : 10), shirt, 0, 1.2, 0, 0, 0, 0, 1.1, 1, 0.75);
  tk.rbox(0.44, 0.08, 0.3, 0.03, 0x3a2a1a, 0, 0.95, 0); // cinto
  tk.box(0.06, 0.06, 0.02, C.gold, 0, 0.95, 0.16);
  tk.rbox(0.4, 0.2, 0.28, 0.06, C.jeans, 0, 0.85, 0);
  tk.ball(0.16, C.skin, 0, 1.6, 0.02, 1, 1.12, 1, 2);
  tk.ball(0.05, 0x5a3a20, 0, 1.53, 0.16, 1.4, 0.5, 0.6, 1); // bigode
  tk.add(new THREE.SphereGeometry(0.19, lod() ? 8 : 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.hat, 0, 1.68, 0.02, 0, 0, 0, 1, 0.85, 1.08);
  tk.cyl(0.24, 0.24, 0.025, C.hat, 0, 1.68, 0.04, 16);
  tk.box(0.05, 0.05, 0.02, C.dark, 0.06, 1.63, 0.15);
  tk.box(0.05, 0.05, 0.02, C.dark, -0.06, 1.63, 0.15);
  tk.box(0.09, 0.4, 0.02, 0xd8e04a, 0.1, 1.24, 0.17); // colete refletivo
  tk.box(0.09, 0.4, 0.02, 0xd8e04a, -0.1, 1.24, 0.17);
  root.add(tk.build());
  const limb = (x: number, y: number, len: number, w: number, c: number, end: number, boot: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const lk = new Kit();
    lk.add(new THREE.CapsuleGeometry(w / 2, len - w, 2, 8), c, 0, -len / 2, 0);
    if (boot) lk.rbox(w * 1.15, 0.12, w * 1.8, 0.04, end, 0, -len, 0.06);
    else lk.ball(w * 0.6, end, 0, -len, 0);
    g.add(lk.build());
    root.add(g);
    return g;
  };
  const legL = limb(0.11, 0.8, 0.74, 0.16, C.jeans, 0x4a3020, true);
  const legR = limb(-0.11, 0.8, 0.74, 0.16, C.jeans, 0x4a3020, true);
  const armL = limb(0.29, 1.42, 0.6, 0.12, shirt, C.skin, false);
  const armR = limb(-0.29, 1.42, 0.6, 0.12, shirt, C.skin, false);
  // carrinho de mão (na frente, maior e visível)
  const barrow = new THREE.Group();
  const bk = new Kit({ y: 0.3, k: 0.5 });
  const tray = new THREE.CylinderGeometry(0.62, 0.36, 0.42, lod() ? 8 : 16, 1, true);
  tray.scale(1, 1, 1.35);
  bk.add(tray, C.red, 0, 0.66, 1.0);
  bk.add(new THREE.CircleGeometry(0.36, lod() ? 8 : 16).rotateX(-Math.PI / 2), C.red, 0, 0.45, 1.0, 0, 0, 0, 1, 1, 1.35);
  bk.cyl(0.64, 0.64, 0.04, C.dark, 0, 0.87, 1.0, 16, 0, 0, 0);
  bk.use('shiny');
  bk.cyl(0.025, 0.025, 1.6, C.steel, 0.3, 0.5, 0.75, 6, Math.PI / 2 - 0.15);
  bk.cyl(0.025, 0.025, 1.6, C.steel, -0.3, 0.5, 0.75, 6, Math.PI / 2 - 0.15);
  bk.use('paint');
  bk.cyl(0.03, 0.03, 0.15, C.black, 0.3, 0.38, -0.02, 6, Math.PI / 2);
  bk.cyl(0.03, 0.03, 0.15, C.black, -0.3, 0.38, -0.02, 6, Math.PI / 2);
  bk.add(new THREE.TorusGeometry(0.2, 0.06, 6, lod() ? 10 : 16), C.rubber, 0, 0.24, 1.6, 0, Math.PI / 2, 0);
  bk.cylX(0.08, 0.1, C.steel, 0, 0.24, 1.6, 8);
  bk.cyl(0.02, 0.02, 0.42, C.steelD, 0.22, 0.24, 0.62, 6);
  bk.cyl(0.02, 0.02, 0.42, C.steelD, -0.22, 0.24, 0.62, 6);
  barrow.add(bk.build());
  const hk = new Kit();
  hk.ball(0.34, C.dirt, 0, 0, 0, 1.4, 0.45, 1.75, 1);
  const heap = new THREE.Mesh(hk.geometry(), MAT.paint);
  heap.position.set(0, 0.78, 1.0);
  heap.visible = false;
  barrow.add(heap);
  root.add(barrow);
  const shovel = new THREE.Group();
  const sk = new Kit();
  sk.cyl(0.025, 0.025, 1.2, C.woodL, 0, 0, 0.4, 6, Math.PI / 2);
  sk.use('shiny').rbox(0.26, 0.03, 0.32, 0.01, C.steel, 0, -0.02, 1.08, 0.2).use('paint');
  sk.box(0.16, 0.04, 0.04, C.dark, 0, 0, -0.2);
  shovel.add(sk.build());
  shovel.position.set(-0.3, 1.0, 0.25);
  shovel.visible = false;
  root.add(shovel);
  const bkk = new Kit();
  bkk.use('shiny').cyl(0.18, 0.13, 0.3, C.steel, 0, 0, 0, 10);
  const bucket = bkk.build();
  bucket.position.set(0.32, 0.65, 0.2);
  bucket.visible = false;
  root.add(bucket);
  return { root, legL, legR, armL, armR, barrow, heap, shovel, bucket };
}

/* --------------------------- prédios --------------------------- */
/** lavadora: pátio de concreto com batente, moega com grelha, estrutura de aço com passarela
 *  e escada, trommel, calha com água correndo, caixa d'água e esteira de rejeito */
export function buildPlant(): { root: THREE.Group; trommel: THREE.Object3D; belt: THREE.Object3D; water: THREE.Mesh } {
  const root = new THREE.Group();
  const k = new Kit({ y: 0.25, k: 0.5 });
  // pátio de concreto e batente para o caminhão de ré
  k.rbox(5.2, 0.3, 0.4, 0.06, C.steelD, 0, 0.25, 8.25);
  k.decal('hazard', 5.0, 0.25, 0, 0.25, 8.46);
  // moega (funil) sobre pilares de perfil I
  k.rbox(4.4, 0.3, 4.4, 0.05, C.steelD, 0, 1.25, 6);
  for (const [x, z, rz, rx] of [
    [2.05, 6, -0.35, 0],
    [-2.05, 6, 0.35, 0],
    [0, 3.95, 0, -0.35],
  ] as const)
    k.rbox(x !== 0 ? 0.12 : 4.4, 1.3, x !== 0 ? 4.4 : 0.12, 0.03, C.yellowD, x, 1.95, z, rx, 0, rz);
  k.fine((kk) => {
    for (let i = 0; i < 9; i++) kk.box(0.05, 0.06, 4.0, C.dark, -1.8 + i * 0.45, 1.44, 6);
    for (let i = 0; i < 9; i++) kk.box(4.0, 0.06, 0.05, C.dark, 0, 1.45, 4.2 + i * 0.45);
  });
  k.decal('warn', 0.6, 0.6, 0, 2.2, 8.13);
  for (const [x, z] of [
    [1.9, 4.2],
    [-1.9, 4.2],
    [1.9, 7.8],
    [-1.9, 7.8],
  ]) {
    k.box(0.22, 1.25, 0.08, C.steelD, x, 0.62, z);
    k.box(0.08, 1.25, 0.22, C.steelD, x, 0.62, z);
  }
  // estrutura do trommel: pórtico de aço com contraventamento
  k.rbox(3.4, 0.25, 7, 0.04, C.steelD, 0, 1.0, 0);
  for (const z of [-3, 0, 3])
    for (const s of [1, -1]) {
      k.box(0.2, 2.2, 0.2, C.yellowD, s * 1.55, 1.1, z);
    }
  k.fine((kk) => {
    for (const s of [1, -1]) {
      kk.box(0.06, 0.06, 3.4, C.yellowD, s * 1.55, 1.1, -1.5, 0.6);
      kk.box(0.06, 0.06, 3.4, C.yellowD, s * 1.55, 1.1, 1.5, -0.6);
    }
    // passarela com guarda-corpo e escada
    kk.box(1.0, 0.06, 7, C.steel, 2.25, 2.25, 0);
    for (let i = 0; i < 8; i++) kk.cyl(0.025, 0.025, 1.0, C.yellow, 2.72, 2.75, -3.3 + i * 0.94, 6);
    kk.cyl(0.03, 0.03, 7, C.yellow, 2.72, 3.25, 0, 6, Math.PI / 2);
    for (let i = 0; i < 9; i++) kk.box(0.8, 0.05, 0.25, C.steel, 2.25, 0.25 * i, -3.6 - i * 0.22);
  });
  // calha (sluice) com carpete e riffles
  k.rbox(1.25, 0.22, 5.2, 0.03, C.steel, -2.55, 0.75, -0.5, 0.12);
  k.box(1.1, 0.04, 5.0, 0x2f5a34, -2.55, 0.85, -0.5, 0.12);
  k.fine((kk) => {
    for (let i = 0; i < 12; i++) kk.box(1.08, 0.06, 0.04, C.dark, -2.55, 0.88 + 0.6 - i * 0.12 * 0.5, 1.6 - i * 0.4);
  });
  // caixa d'água + bomba + cano
  k.cyl(1.05, 1.05, 2.0, C.teal, 3.6, 1.6, -2.6, 16);
  k.cyl(1.1, 1.1, 0.1, C.dark, 3.6, 2.62, -2.6, 16);
  k.box(1.6, 0.6, 1.0, C.dark, 3.6, 0.3, -2.6);
  k.fine((kk) => kk.cyl(0.1, 0.1, 4, C.dark, 1.6, 2.9, -1.0, 8, 0, 0, Math.PI / 2));
  // cofre do ouro
  k.rbox(0.95, 0.75, 0.95, 0.06, C.dark, -2.6, 0.38, -3.7);
  k.decal('gold', 0.8, 0.4, -2.6, 0.45, -3.21);
  k.decal('logo', 2.6, 1.3, 0, 1.6, 3.45);
  root.add(k.build());
  // água correndo na calha (textura rolando)
  const wt = waterTexture();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 5.0), new THREE.MeshPhongMaterial({ map: wt, color: 0x9ad8ff, transparent: true, opacity: 0.75, shininess: 80, depthWrite: false }));
  water.rotation.x = -Math.PI / 2 + 0.12;
  water.position.set(-2.55, 0.9, -0.5);
  root.add(water);
  const tk = new Kit();
  tk.use('shiny').cylX(1.0, 5.6, C.steel, 0, 0, 0, 20).use('paint');
  for (let i = 0; i < 6; i++) tk.cylX(1.06, 0.14, C.dark, -2.6 + i * 1.04, 0, 0, 20);
  tk.fine((kk) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      kk.box(5.4, 0.04, 0.04, C.steelD, 0, Math.cos(a) * 1.01, Math.sin(a) * 1.01);
    }
  });
  tk.cylX(0.42, 5.8, C.dark, 0, 0, 0, 10);
  const trommel = new THREE.Group();
  trommel.add(tk.build());
  trommel.rotation.y = Math.PI / 2;
  trommel.position.set(0, 2.35, 0);
  root.add(trommel);
  const bk = new Kit();
  bk.rbox(0.95, 0.12, 7, 0.04, C.black, 0, 0, 0);
  bk.box(1.05, 0.3, 7, C.steelD, 0, -0.18, 0);
  bk.fine((kk) => {
    for (let i = 0; i < 12; i++) kk.cylX(0.06, 1.0, C.steel, 0, -0.06, -3.3 + i * 0.6, 6);
  });
  for (let i = 0; i < 3; i++) bk.box(0.14, 2.2, 0.14, C.yellowD, 0, -1.1 - i * 0.4, -2.5 + i * 2.5);
  const belt = bk.build();
  belt.position.set(0, 2.2, -6.2);
  belt.rotation.x = -0.32;
  root.add(belt);
  return { root, trommel, belt, water };
}
let waterT: THREE.Texture | null = null;
export function waterTexture(): THREE.Texture {
  if (waterT) return waterT;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#7cc4ec';
  x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
    x.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 10, 2 + Math.random() * 6);
  }
  waterT = new THREE.CanvasTexture(c);
  waterT.wrapS = waterT.wrapT = THREE.RepeatWrapping;
  waterT.repeat.set(1, 2);
  return waterT;
}

export function buildHouse(color: number): THREE.Group {
  const k = new Kit();
  const cols = [0xe9c46a, 0x90be6d, 0xf4a261, 0x8ecae6];
  const wall = cols[color % cols.length];
  k.rbox(5, 0.35, 4.4, 0.04, C.woodL, 0, 0.2, 0);
  for (const [x, z] of [
    [2.3, 2],
    [-2.3, 2],
    [2.3, -2],
    [-2.3, -2],
  ])
    k.box(0.25, 0.8, 0.25, C.wood, x, -0.1, z);
  k.rbox(4.6, 2.4, 4.0, 0.05, wall, 0, 1.6, 0);
  k.fine((kk) => {
    for (let i = 0; i < 10; i++) kk.box(4.62, 0.03, 4.02, 0xffffff, 0, 0.6 + i * 0.24, 0);
  });
  k.add(new THREE.CylinderGeometry(0.01, 3.9, 1.7, 4), C.roof, 0, 3.65, 0, 0, Math.PI / 4, 0, 1.0, 1, 0.85);
  k.rbox(1.0, 1.8, 0.08, 0.02, C.wood, 0.8, 1.3, 2.02);
  k.rbox(1.0, 0.8, 0.08, 0.02, C.white, -1.2, 1.9, 2.02);
  k.use('shiny').box(0.85, 0.65, 0.04, C.glass, -1.2, 1.9, 2.06).use('paint');
  k.rbox(5, 0.1, 1.4, 0.02, C.woodL, 0, 0.42, 2.7);
  k.box(0.12, 1.2, 0.12, C.wood, 2.4, 1.0, 3.3);
  k.box(0.12, 1.2, 0.12, C.wood, -2.4, 1.0, 3.3);
  k.fine((kk) => {
    for (let i = 0; i < 9; i++) kk.box(0.05, 0.6, 0.05, C.wood, -2.3 + i * 0.57, 0.75, 3.35);
    kk.box(4.8, 0.05, 0.05, C.wood, 0, 1.05, 3.35);
  });
  return k.build();
}

export function buildStock(): { root: THREE.Group; bars: THREE.InstancedMesh } {
  const root = new THREE.Group();
  const k = new Kit();
  k.rbox(9, 0.3, 7, 0.05, 0x9a9a92, 0, 0.15, 0);
  for (const [x, z] of [
    [4.3, 3.3],
    [-4.3, 3.3],
    [4.3, -3.3],
    [-4.3, -3.3],
  ])
    k.box(0.3, 3.6, 0.3, C.woodL, x, 1.8, z);
  k.rbox(9.6, 0.22, 7.6, 0.05, C.red, 0, 3.7, 0, 0.08);
  k.box(9, 2.6, 0.15, C.woodL, 0, 1.6, -3.3);
  for (let i = -4; i <= 4; i++) k.box(0.08, 1.2, 0.08, C.steel, i, 0.6, 3.6);
  k.box(9, 0.06, 0.06, C.steel, 0, 1.1, 3.6);
  k.rbox(2.6, 1.1, 0.12, 0.04, C.dark, 0, 3.0, 3.4);
  k.decal('gold', 2.3, 0.95, 0, 3.0, 3.47);
  k.rbox(6, 0.1, 2.2, 0.03, C.wood, 0, 0.9, -1.6);
  k.box(0.1, 0.75, 2, C.wood, 2.8, 0.5, -1.6);
  k.box(0.1, 0.75, 2, C.wood, -2.8, 0.5, -1.6);
  root.add(k.build());
  const bg = new THREE.BoxGeometry(0.42, 0.14, 0.2);
  const bars = new THREE.InstancedMesh(bg, new THREE.MeshPhongMaterial({ color: 0xffc933, emissive: 0x4a2a00, shininess: 100, specular: 0xffffff }), 200);
  bars.count = 0;
  root.add(bars);
  return { root, bars };
}

export function buildGarage(): THREE.Group {
  const k = new Kit();
  k.rbox(12, 0.2, 9, 0.04, C.concrete, 0, 0.1, 0);
  for (const [x, z] of [
    [5.8, 4.3],
    [-5.8, 4.3],
    [5.8, -4.3],
    [-5.8, -4.3],
    [0, -4.3],
  ])
    k.box(0.3, 4.2, 0.3, C.dark, x, 2.1, z);
  k.rbox(12.6, 0.22, 9.6, 0.05, C.teal, 0, 4.4, 0, -0.06);
  k.box(12, 3.8, 0.15, C.steel, 0, 2.1, -4.3);
  k.box(0.15, 3.8, 9, C.steel, -5.9, 2.1, 0);
  k.rbox(3.4, 1.4, 0.12, 0.04, C.dark, 0, 5.3, 4.6);
  k.decal('logoDark', 3.1, 1.25, 0, 5.3, 4.67);
  k.rbox(3, 0.9, 1, 0.04, C.wood, -3.5, 0.55, -3.5);
  k.add(new THREE.TorusGeometry(0.4, 0.17, 6, 12), C.rubber, 3.8, 0.6, -3.4, 0, Math.PI / 2, 0);
  k.cyl(0.35, 0.35, 0.9, C.red, 4.8, 0.55, -2.2, 12);
  k.cyl(0.35, 0.35, 0.9, C.teal, 4.8, 0.55, -1.4, 12);
  k.decal('hazard', 11.6, 0.3, 0, 0.35, -4.2);
  return k.build();
}

/** caminhão-forte de exportação */
export function buildExportTruck(): THREE.Group {
  const k = new Kit({ y: 0.6, k: 0.4 });
  k.rbox(2.2, 0.35, 7, 0.04, C.dark, 0, 0.75, 0);
  k.rbox(2.4, 1.2, 1.9, 0.14, C.white, 0, 1.55, 2.4);
  cab(k, 2.34, 0.8, 1.7, 0, 2.55, 2.4, C.white, 0.1);
  k.rbox(2.5, 2.6, 4.6, 0.12, 0x3b5f8a, 0, 2.25, -1.3);
  k.decal('gold', 2.2, 1.0, 1.26, 2.5, -1.3, Math.PI / 2);
  k.decal('gold', 2.2, 1.0, -1.26, 2.5, -1.3, -Math.PI / 2);
  k.decal('grille', 1.6, 0.6, 0, 1.3, 3.36);
  lamp(k, 0.9, 1.0, 3.36, 0.3, 0.16);
  lamp(k, -0.9, 1.0, 3.36, 0.3, 0.16);
  const g = k.build();
  for (const z of [2.4, -1.0, -2.6])
    for (const s of [1, -1]) {
      const w = wheelMesh(0.5, 0.38);
      w.position.set(s * 1.05, 0.5, z);
      g.add(w);
    }
  return g;
}

export function buildFlag(color: number): THREE.Group {
  const k = new Kit();
  k.cyl(0.04, 0.05, 2.4, C.woodL, 0, 1.2, 0, 6);
  k.box(0.03, 0.5, 0.8, color, 0, 2.1, 0.42);
  return k.build();
}
