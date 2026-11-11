/* ============================================================
 *  GARIMPO BRUTO — modelos procedurais low-poly (originais, sem marcas).
 *  Cada peça rígida vira UMA malha (geometrias fundidas com cor por vértice),
 *  então uma máquina inteira custa ~6-12 draw calls.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const LAMBERT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const _mtx = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo === g) geo = g.clone();
    g.dispose();
    geo.deleteAttribute('uv');
    _mtx.compose(_tmpV.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _tmpS.set(sx, sy, sz));
    geo.applyMatrix4(_mtx);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.setHex(color).convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(geo);
    return this;
  }
  box(w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
  }
  /** cilindro deitado no eixo x (rodas, roletes, pinos) */
  cylX(r: number, w: number, c: number, x = 0, y = 0, z = 0, seg = 10): this {
    return this.add(new THREE.CylinderGeometry(r, r, w, seg), c, x, y, z, 0, 0, Math.PI / 2);
  }
  /** cilindro no eixo z (pistões ao longo da peça) */
  cylZ(r: number, len: number, c: number, x = 0, y = 0, z = 0, rx = 0, seg = 8): this {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), c, x, y, z, Math.PI / 2 + rx, 0, 0);
  }
  cyl(rt: number, rb: number, h: number, c: number, x = 0, y = 0, z = 0, seg = 8, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, rx, ry, rz);
  }
  ball(r: number, c: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), c, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  geometry(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  mesh(shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), LAMBERT);
    m.castShadow = shadow;
    return m;
  }
}
const _tmpV = new THREE.Vector3();
const _tmpS = new THREE.Vector3();

/* --------------------------- paleta --------------------------- */
export const C = {
  yellow: 0xf2b20f,
  yellowD: 0xc98a08,
  orange: 0xe8651e,
  red: 0xd23a2a,
  teal: 0x1f8f8a,
  white: 0xf3efe6,
  steel: 0x8b9096,
  steelD: 0x4d5257,
  dark: 0x2b2d31,
  rubber: 0x1f1f22,
  glass: 0x2f4858,
  glassL: 0x6f98ad,
  light: 0xfff2b0,
  redL: 0xff4a3a,
  dirt: 0x8a4a26,
  wood: 0x7a5232,
  woodL: 0xa8784c,
  roof: 0xb5462e,
  gold: 0xffcc33,
  hat: 0xffc21a,
  skin: 0xe0a77a,
  shirt: 0x2f6fbf,
  jeans: 0x34496e,
};

/* --------------------------- rodas --------------------------- */
export function wheelMesh(r: number, w: number, rim = C.steel): THREE.Mesh {
  const k = new Kit();
  k.cylX(r, w, C.rubber, 0, 0, 0, 14);
  // garras do pneu (cravos) — terra fora de estrada
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.box(w * 1.02, r * 0.16, r * 0.22, C.rubber, 0, Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97, a);
  }
  k.cylX(r * 0.58, w * 1.04, rim, 0, 0, 0, 10);
  k.cylX(r * 0.2, w * 1.1, C.steelD, 0, 0, 0, 8);
  return k.mesh();
}

/* --------------------------- pickup 4x4 --------------------------- */
export function buildPickup(color = C.teal): { body: THREE.Mesh } {
  const k = new Kit();
  // chassi e caixa
  k.box(1.5, 0.25, 4.6, C.dark, 0, -0.25, 0);
  k.box(1.86, 0.55, 1.75, color, 0, 0.18, 1.55); // capô
  k.box(1.86, 0.95, 1.6, color, 0, 0.38, 0.05); // cabine
  k.box(1.7, 0.6, 1.5, C.glass, 0, 0.58, 0.07); // vidros (lados)
  k.box(1.78, 0.5, 0.06, C.glassL, 0, 0.62, 0.86, -0.35); // para-brisa
  k.box(1.86, 0.1, 1.3, color, 0, 0.88, 0.0); // teto
  k.box(1.86, 0.5, 1.75, color, 0, 0.1, -1.6); // caçamba (lados)
  k.box(1.62, 0.06, 1.62, C.dark, 0, 0.0, -1.6); // assoalho
  k.box(1.6, 0.42, 1.6, 0x15363a, 0, 0.12, -1.6);
  // para-choques, grade, faróis, para-lamas
  k.box(1.95, 0.22, 0.2, C.steelD, 0, -0.08, 2.48);
  k.box(1.3, 0.3, 0.06, C.dark, 0, 0.22, 2.43);
  k.box(0.3, 0.14, 0.05, C.light, 0.66, 0.28, 2.43);
  k.box(0.3, 0.14, 0.05, C.light, -0.66, 0.28, 2.43);
  k.box(1.95, 0.2, 0.18, C.steelD, 0, -0.12, -2.48);
  k.box(0.14, 0.24, 0.05, C.redL, 0.82, 0.18, -2.47);
  k.box(0.14, 0.24, 0.05, C.redL, -0.82, 0.18, -2.47);
  for (const z of [1.55, -1.45])
    for (const s of [1, -1]) k.box(0.24, 0.12, 1.15, C.dark, s * 0.98, 0.0, z);
  // barra de luzes no teto, santo-antônio, snorkel
  k.box(1.5, 0.08, 0.1, C.dark, 0, 0.98, 0.55);
  for (let i = 0; i < 4; i++) k.box(0.22, 0.1, 0.06, C.light, -0.5 + i * 0.33, 0.98, 0.6);
  k.box(1.7, 0.08, 0.08, C.steelD, 0, 0.92, -0.85);
  k.box(0.08, 0.6, 0.08, C.steelD, 0.82, 0.6, -0.85);
  k.box(0.08, 0.6, 0.08, C.steelD, -0.82, 0.6, -0.85);
  k.cyl(0.06, 0.06, 1.1, C.dark, 0.98, 0.55, 1.0);
  // retrovisores
  k.box(0.18, 0.14, 0.06, C.dark, 1.03, 0.5, 0.75);
  k.box(0.18, 0.14, 0.06, C.dark, -1.03, 0.5, 0.75);
  return { body: k.mesh() };
}

/* --------------------------- caminhão basculante 6x4 --------------------------- */
export function buildTruck(color = C.orange): { body: THREE.Mesh; bed: THREE.Group; heap: THREE.Mesh } {
  const k = new Kit();
  k.box(1.1, 0.35, 7.6, C.dark, 0, -0.2, -0.3); // longarinas
  // cabine avançada
  k.box(2.4, 1.6, 1.7, color, 0, 0.95, 2.75);
  k.box(2.42, 0.75, 1.0, C.glass, 0, 1.35, 2.9);
  k.box(2.3, 0.8, 0.07, C.glassL, 0, 1.35, 3.6, -0.12);
  k.box(2.45, 0.12, 1.75, color, 0, 1.8, 2.75);
  k.box(2.0, 0.22, 0.3, 0xffffff, 0, 1.96, 2.9); // defletor
  k.box(2.5, 0.5, 0.3, C.steelD, 0, 0.15, 3.65); // para-choque
  k.box(1.6, 0.55, 0.06, C.dark, 0, 0.62, 3.62); // grade
  for (let i = 0; i < 5; i++) k.box(1.5, 0.04, 0.07, C.steel, 0, 0.42 + i * 0.1, 3.63);
  k.box(0.36, 0.2, 0.06, C.light, 0.9, 0.42, 3.82);
  k.box(0.36, 0.2, 0.06, C.light, -0.9, 0.42, 3.82);
  for (const s of [1, -1]) {
    k.box(0.2, 0.6, 0.1, C.dark, s * 1.3, 1.5, 3.2); // espelho
    k.box(0.4, 0.5, 1.1, C.steelD, s * 1.15, 0.0, 2.6); // para-lama
    k.box(0.12, 0.15, 2.6, C.steelD, s * 1.12, 0.05, -1.9);
    k.box(0.7, 0.5, 0.9, C.steel, s * 0.85, 0.2, 1.3); // tanque/caixa
  }
  k.cyl(0.09, 0.09, 1.9, C.steelD, 1.0, 1.6, 1.85); // escapamento
  k.cyl(0.11, 0.11, 0.2, C.dark, 1.0, 2.6, 1.85);
  k.box(1.0, 0.3, 0.2, C.redL, 0, 0.2, -4.05);
  // pistão da caçamba (fixo na base)
  k.cyl(0.14, 0.14, 0.8, C.steelD, 0, 0.6, 0.0);
  const body = k.mesh();
  // caçamba (gira no pino traseiro)
  const bk = new Kit();
  const L = 3.6;
  bk.box(2.35, 0.12, L, C.yellowD, 0, 0.06, L / 2); // fundo
  bk.box(0.12, 1.0, L, color, 1.12, 0.56, L / 2);
  bk.box(0.12, 1.0, L, color, -1.12, 0.56, L / 2);
  bk.box(2.35, 1.25, 0.12, color, 0, 0.66, L - 0.05); // frente
  bk.box(2.35, 0.12, 0.6, color, 0, 1.25, L + 0.25); // protetor da cabine
  bk.box(2.2, 0.9, 0.1, C.yellowD, 0, 0.5, 0.0); // tampa
  for (let i = 0; i < 4; i++) {
    bk.box(0.06, 0.95, 0.12, C.yellowD, 1.2, 0.55, 0.4 + i * 0.95);
    bk.box(0.06, 0.95, 0.12, C.yellowD, -1.2, 0.55, 0.4 + i * 0.95);
  }
  // risca da "marca de cheio"
  bk.box(0.02, 0.06, L - 0.3, 0xffffff, 1.06, 0.78, L / 2);
  bk.box(0.02, 0.06, L - 0.3, 0xffffff, -1.06, 0.78, L / 2);
  const bed = new THREE.Group();
  bed.add(bk.mesh());
  bed.position.set(0, 0.42, -3.9);
  const hk = new Kit();
  hk.box(2.1, 1, L - 0.2, C.dirt, 0, 0.5, 0);
  hk.ball(0.9, C.dirt, 0, 1.0, 0.2, 1.2, 0.5, 1.6);
  const heap = hk.mesh(false);
  heap.position.set(0, 0.12, L / 2);
  heap.visible = false;
  bed.add(heap);
  body.add(bed);
  return { body, bed, heap };
}

/* --------------------------- esteira --------------------------- */
function trackPair(k: Kit, gauge: number, len: number, y: number, h = 0.75, w = 0.6): void {
  for (const s of [1, -1]) {
    const x = s * gauge;
    k.box(w, h * 0.55, len, C.dark, x, y, 0);
    k.cylX(h / 2, w, C.dark, x, y, len / 2, 12);
    k.cylX(h / 2, w, C.dark, x, y, -len / 2, 12);
    // sapatas
    const n = Math.round(len / 0.32);
    for (let i = 0; i <= n; i++) {
      const z = -len / 2 + (i * len) / n;
      k.box(w * 1.04, 0.07, 0.16, 0x3a3a3e, x, y + h / 2, z);
      k.box(w * 1.04, 0.07, 0.16, 0x3a3a3e, x, y - h / 2, z);
    }
    k.cylX(h * 0.36, w * 1.08, C.yellowD, x, y, len / 2, 10); // roda-guia
    k.cylX(h * 0.38, w * 1.08, C.steelD, x, y, -len / 2, 10); // motriz
    for (let i = 1; i < 4; i++) k.cylX(h * 0.18, w * 1.06, C.steel, x, y - h * 0.12, -len / 2 + (i * len) / 4, 8);
  }
}

/* --------------------------- trator de esteira --------------------------- */
export function buildDozer(): { body: THREE.Mesh; blade: THREE.Group } {
  const k = new Kit();
  trackPair(k, 1.08, 3.3, -0.62, 0.78, 0.62);
  k.box(1.6, 0.55, 3.4, C.yellowD, 0, -0.35, 0);
  k.box(1.5, 1.05, 2.0, C.yellow, 0, 0.35, 0.75); // motor
  for (let i = 0; i < 5; i++) k.box(1.52, 0.04, 0.12, C.dark, 0, 0.5 + i * 0.1, 1.76); // grade
  k.box(1.5, 0.08, 1.6, C.dark, 0, 0.9, 0.75);
  k.cyl(0.09, 0.09, 1.0, C.dark, 0.45, 1.3, 1.2); // escapamento
  k.box(2.2, 0.3, 1.6, C.yellow, 0, 0.05, -0.85); // para-lamas/deck
  k.box(1.45, 1.35, 1.35, C.yellow, 0, 0.95, -0.95); // cabine
  k.box(1.47, 0.8, 1.2, C.glass, 0, 1.15, -0.95);
  k.box(1.6, 0.1, 1.5, C.yellowD, 0, 1.68, -0.95);
  k.box(0.14, 0.12, 0.08, C.light, 0.55, 1.62, -0.24);
  k.box(0.14, 0.12, 0.08, C.light, -0.55, 1.62, -0.24);
  // escarificador traseiro
  k.box(1.6, 0.25, 0.25, C.yellowD, 0, -0.2, -2.1);
  k.box(0.18, 0.9, 0.2, C.steelD, 0, -0.55, -2.35, 0.3);
  const body = k.mesh();
  const bk = new Kit();
  // lâmina curva (3 faixas)
  bk.box(3.5, 0.42, 0.2, C.yellow, 0, -0.42, 0.0, 0.3);
  bk.box(3.5, 0.42, 0.18, C.yellow, 0, -0.02, -0.08, 0.0);
  bk.box(3.5, 0.4, 0.18, C.yellow, 0, 0.36, -0.02, -0.3);
  bk.box(3.52, 0.08, 0.26, C.steelD, 0, -0.62, 0.06); // faca
  bk.box(0.16, 1.2, 0.4, C.yellowD, 1.72, -0.05, -0.1);
  bk.box(0.16, 1.2, 0.4, C.yellowD, -1.72, -0.05, -0.1);
  // braços de empuxo e pistões
  for (const s of [1, -1]) {
    bk.box(0.2, 0.22, 1.9, C.yellowD, s * 1.25, -0.35, -1.1);
    bk.cylZ(0.08, 1.4, C.steel, s * 0.6, 0.3, -0.9, 0.35);
  }
  const blade = new THREE.Group();
  blade.add(bk.mesh());
  blade.position.set(0, 0, 2.55);
  body.add(blade);
  return { body, blade };
}

/* --------------------------- escavadeira --------------------------- */
export interface ExcavatorParts {
  body: THREE.Mesh;
  house: THREE.Group;
  boom: THREE.Group;
  arm: THREE.Group;
  bucket: THREE.Group;
  tip: THREE.Object3D;
  heap: THREE.Mesh;
  cylBoom: THREE.Mesh;
  cylArm: THREE.Mesh;
  cylBucket: THREE.Mesh;
}
export const EXC = { boomL: 4.6, armL: 2.7, bucketL: 1.15 };
export function buildExcavator(): ExcavatorParts {
  const k = new Kit();
  trackPair(k, 1.15, 3.6, -0.6, 0.8, 0.6);
  k.box(1.7, 0.5, 2.6, C.dark, 0, -0.45, 0);
  k.cyl(0.85, 0.85, 0.25, C.steelD, 0, -0.1, 0, 14);
  const body = k.mesh();
  // casa (gira)
  const hk = new Kit();
  hk.box(2.5, 0.9, 3.0, C.yellow, 0, 0.45, -0.4);
  hk.box(2.5, 0.85, 1.0, C.dark, 0, 0.45, -1.95); // contrapeso
  hk.box(2.52, 0.3, 1.05, C.yellowD, 0, 0.95, -1.95);
  for (let i = 0; i < 6; i++) hk.box(0.04, 0.4, 0.8, C.dark, -1.27, 0.5, -1.0 + i * 0.13);
  hk.box(1.0, 1.55, 1.25, C.yellow, 0.72, 1.6, 0.55); // cabine (lado esquerdo)
  hk.box(1.02, 1.0, 1.1, C.glass, 0.72, 1.75, 0.6);
  hk.box(0.95, 1.1, 0.06, C.glassL, 0.72, 1.7, 1.18, 0.08);
  hk.box(1.1, 0.08, 1.3, C.yellowD, 0.72, 2.4, 0.55);
  hk.box(0.12, 0.1, 0.08, C.light, 0.45, 2.36, 1.2);
  hk.cyl(0.08, 0.08, 0.9, C.dark, -0.8, 1.3, -0.9);
  hk.box(0.8, 0.5, 1.5, C.yellowD, -0.55, 1.1, -0.6);
  hk.box(0.6, 0.6, 0.6, C.yellowD, 0, 0.75, 1.1); // base da lança
  const house = new THREE.Group();
  house.add(hk.mesh());
  house.position.y = 0.0;
  body.add(house);
  // lança
  const boom = new THREE.Group();
  boom.position.set(0, 0.95, 1.2);
  const bk = new Kit();
  bk.box(0.5, 0.62, EXC.boomL * 0.6, C.yellow, 0, 0.35, EXC.boomL * 0.3, -0.18);
  bk.box(0.46, 0.55, EXC.boomL * 0.48, C.yellow, 0, 0.4, EXC.boomL * 0.76, 0.42);
  bk.cylX(0.18, 0.7, C.steelD, 0, 0, 0);
  bk.cylX(0.14, 0.6, C.steelD, 0, 0, EXC.boomL);
  boom.add(bk.mesh());
  house.add(boom);
  const arm = new THREE.Group();
  arm.position.set(0, 0, EXC.boomL);
  const ak = new Kit();
  ak.box(0.38, 0.45, EXC.armL, C.yellow, 0, 0, EXC.armL / 2);
  ak.box(0.36, 0.5, 0.6, C.yellowD, 0, 0.2, -0.15);
  ak.cylX(0.12, 0.5, C.steelD, 0, 0, EXC.armL);
  arm.add(ak.mesh());
  boom.add(arm);
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, EXC.armL);
  const uk = new Kit();
  // caçamba: costas curvas no lado +y, boca para -y, dentes na ponta
  const L = EXC.bucketL;
  uk.box(1.05, 0.1, L * 0.55, C.yellowD, 0, 0.12, L * 0.3, -0.25);
  uk.box(1.05, 0.1, L * 0.55, C.yellowD, 0, -0.03, L * 0.75, 0.55);
  uk.box(0.08, 0.7, L, C.yellow, 0.52, -0.12, L * 0.5);
  uk.box(0.08, 0.7, L, C.yellow, -0.52, -0.12, L * 0.5);
  uk.box(1.05, 0.08, 0.2, C.steelD, 0, -0.32, L * 0.98);
  for (let i = 0; i < 5; i++) uk.box(0.1, 0.08, 0.22, C.steel, -0.4 + i * 0.2, -0.36, L * 1.05);
  bucket.add(uk.mesh());
  const hpk = new Kit();
  hpk.ball(0.42, C.dirt, 0, 0, 0, 1.15, 0.6, 1.0);
  const heap = hpk.mesh(false);
  heap.position.set(0, -0.2, L * 0.5);
  heap.visible = false;
  bucket.add(heap);
  const tip = new THREE.Object3D();
  tip.position.set(0, -0.36, L * 1.12);
  bucket.add(tip);
  arm.add(bucket);
  // pistões hidráulicos (esticados a cada quadro entre os pinos)
  const cyl = (r: number) => {
    const ck = new Kit();
    ck.cyl(r, r, 1, C.yellowD, 0, 0.25, 0, 8);
    ck.cyl(r * 0.55, r * 0.55, 1, 0xd8dde2, 0, 0.75, 0, 8);
    const m = ck.mesh();
    return m;
  };
  const cylBoom = cyl(0.13);
  const cylArm = cyl(0.12);
  const cylBucket = cyl(0.1);
  house.add(cylBoom);
  boom.add(cylArm);
  arm.add(cylBucket);
  return { body, house, boom, arm, bucket, tip, heap, cylBoom, cylArm, cylBucket };
}

/** estica um pistão (malha de altura 1 no eixo y) entre dois pontos no referencial do pai */
const _a = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
export function stretch(m: THREE.Object3D, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length();
  m.position.set(ax, ay, az);
  m.quaternion.setFromUnitVectors(_up, _a.multiplyScalar(1 / (len || 1)));
  m.scale.set(1, len, 1);
}

/* --------------------------- helicóptero --------------------------- */
export function buildHeli(): { body: THREE.Mesh; rotor: THREE.Mesh; tail: THREE.Mesh; bucket: THREE.Mesh; water: THREE.Mesh } {
  const k = new Kit();
  k.ball(1.25, C.red, 0, 0.9, 0.4, 1.0, 0.95, 1.6, 1);
  k.ball(1.0, C.glassL, 0, 1.05, 1.4, 0.95, 0.85, 0.9, 1);
  k.box(1.3, 0.25, 1.6, C.white, 0, 0.35, 0.2);
  k.cyl(0.32, 0.16, 5.0, C.red, 0, 1.1, -3.2, 8, Math.PI / 2 - 0.06);
  k.box(0.12, 1.2, 0.7, C.red, 0, 1.6, -5.5, -0.3);
  k.box(1.6, 0.08, 0.5, C.white, 0, 1.0, -5.0);
  k.cyl(0.2, 0.3, 0.45, C.dark, 0, 2.05, 0.2);
  for (const s of [1, -1]) {
    k.box(0.08, 0.08, 2.8, C.steelD, s * 0.85, -0.2, 0.3);
    k.box(0.06, 0.6, 0.06, C.steelD, s * 0.75, 0.1, 1.0, 0, 0, s * 0.3);
    k.box(0.06, 0.6, 0.06, C.steelD, s * 0.75, 0.1, -0.4, 0, 0, s * 0.3);
  }
  k.box(1.32, 0.12, 0.6, C.white, 0, 1.0, -0.6);
  const body = k.mesh();
  const rk = new Kit();
  for (let i = 0; i < 4; i++) rk.box(0.28, 0.04, 5.2, C.dark, 0, 0, 0, 0, (i * Math.PI) / 2 + Math.PI / 4);
  const rotor = rk.mesh(false);
  rotor.position.set(0, 2.32, 0.2);
  body.add(rotor);
  const tk = new Kit();
  tk.box(0.04, 1.3, 0.16, C.dark, 0, 0, 0);
  tk.box(0.04, 0.16, 1.3, C.dark, 0, 0, 0);
  const tail = tk.mesh(false);
  tail.position.set(0.18, 1.7, -5.55);
  body.add(tail);
  const bkk = new Kit();
  bkk.cyl(0.75, 0.55, 1.0, C.orange, 0, 0, 0, 12);
  bkk.cyl(0.78, 0.78, 0.08, C.dark, 0, 0.5, 0, 12);
  const bucket = bkk.mesh();
  const wk = new Kit();
  wk.cyl(0.7, 0.7, 0.06, 0x3d8bd6, 0, 0, 0, 12);
  const water = wk.mesh(false);
  water.position.y = 0.35;
  bucket.add(water);
  return { body, rotor, tail, bucket, water };
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
  bucket: THREE.Mesh;
}
export function buildWorker(): WorkerParts {
  const root = new THREE.Group();
  const tk = new Kit();
  tk.box(0.46, 0.55, 0.28, C.shirt, 0, 1.18, 0);
  tk.box(0.42, 0.18, 0.26, C.jeans, 0, 0.86, 0);
  tk.ball(0.17, C.skin, 0, 1.62, 0.02, 1, 1.1, 1, 1);
  tk.cyl(0.21, 0.22, 0.1, C.hat, 0, 1.76, 0.02, 10);
  tk.ball(0.18, C.hat, 0, 1.78, 0.02, 1, 0.7, 1.05, 1);
  tk.box(0.36, 0.03, 0.12, C.hat, 0, 1.73, 0.22);
  tk.box(0.05, 0.05, 0.02, C.dark, 0.06, 1.65, 0.17);
  tk.box(0.05, 0.05, 0.02, C.dark, -0.06, 1.65, 0.17);
  root.add(tk.mesh());
  const limb = (x: number, y: number, len: number, w: number, c: number, boot: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const lk = new Kit();
    lk.box(w, len, w, c, 0, -len / 2, 0);
    lk.box(w * 1.1, 0.1, w * 1.6, boot, 0, -len, 0.05);
    g.add(lk.mesh());
    root.add(g);
    return g;
  };
  const legL = limb(0.11, 0.8, 0.72, 0.16, C.jeans, 0x4a3020);
  const legR = limb(-0.11, 0.8, 0.72, 0.16, C.jeans, 0x4a3020);
  const armL = limb(0.3, 1.42, 0.6, 0.12, C.shirt, C.skin);
  const armR = limb(-0.3, 1.42, 0.6, 0.12, C.shirt, C.skin);
  // carrinho de mão (na frente)
  const barrow = new THREE.Group();
  const bk = new Kit();
  bk.box(0.75, 0.06, 0.9, C.red, 0, 0.45, 0.95);
  bk.box(0.06, 0.32, 0.9, C.red, 0.38, 0.6, 0.95, 0, 0, -0.25);
  bk.box(0.06, 0.32, 0.9, C.red, -0.38, 0.6, 0.95, 0, 0, 0.25);
  bk.box(0.8, 0.34, 0.06, C.red, 0, 0.6, 1.42, 0.35);
  bk.box(0.75, 0.3, 0.06, C.red, 0, 0.58, 0.5, -0.2);
  bk.box(0.05, 0.05, 1.5, C.steelD, 0.3, 0.42, 0.75, -0.12);
  bk.box(0.05, 0.05, 1.5, C.steelD, -0.3, 0.42, 0.75, -0.12);
  bk.cylX(0.22, 0.1, C.rubber, 0, 0.22, 1.55, 10);
  bk.box(0.05, 0.4, 0.05, C.steelD, 0.25, 0.22, 0.6);
  bk.box(0.05, 0.4, 0.05, C.steelD, -0.25, 0.22, 0.6);
  barrow.add(bk.mesh());
  const hk = new Kit();
  hk.ball(0.34, C.dirt, 0, 0, 0, 1.0, 0.5, 1.25);
  const heap = hk.mesh(false);
  heap.position.set(0, 0.6, 0.95);
  heap.visible = false;
  barrow.add(heap);
  root.add(barrow);
  // pá (na mão direita)
  const shovel = new THREE.Group();
  const sk = new Kit();
  sk.box(0.05, 0.05, 1.2, C.woodL, 0, 0, 0.4);
  sk.box(0.26, 0.04, 0.32, C.steel, 0, -0.02, 1.08, 0.2);
  shovel.add(sk.mesh());
  shovel.position.set(-0.3, 1.0, 0.25);
  shovel.visible = false;
  root.add(shovel);
  const bkk = new Kit();
  bkk.cyl(0.18, 0.13, 0.3, C.steel, 0, 0, 0, 8);
  const bucket = bkk.mesh();
  bucket.position.set(0.32, 0.65, 0.2);
  bucket.visible = false;
  root.add(bucket);
  return { root, legL, legR, armL, armR, barrow, heap, shovel, bucket };
}

/* --------------------------- prédios --------------------------- */
/** lavadora (planta de lavagem): moega, peneira rotativa (trommel), calha, esteira de rejeito */
export function buildPlant(): { root: THREE.Group; trommel: THREE.Mesh; belt: THREE.Mesh } {
  const root = new THREE.Group();
  const k = new Kit();
  // moega (funil) — a boca fica em z+ (lado de chegada), altura ~1,3 m
  k.box(4.2, 0.3, 4.2, C.steelD, 0, 1.25, 6);
  for (const [x, z, ry] of [[2.0, 6, 0], [-2.0, 6, 0], [0, 8.0, Math.PI / 2], [0, 4.0, Math.PI / 2]] as const)
    k.box(0.2, 1.4, 4.2, C.yellowD, x, 1.9, z, 0, ry, x !== 0 ? (x > 0 ? 0.35 : -0.35) : 0);
  for (let i = 0; i < 7; i++) k.box(0.06, 0.06, 4.0, C.dark, -1.8 + i * 0.6, 1.42, 6); // grelha
  for (const [x, z] of [[1.8, 4.2], [-1.8, 4.2], [1.8, 7.8], [-1.8, 7.8]]) k.box(0.22, 1.3, 0.22, C.steelD, x, 0.6, z);
  // rampa de terra para o caminhão chegar de ré
  // estrutura do trommel
  k.box(3.2, 0.3, 6.5, C.steelD, 0, 1.0, 0);
  for (const z of [-2.8, 2.8]) for (const s of [1, -1]) k.box(0.22, 2.0, 0.22, C.steelD, s * 1.4, 1.0, z);
  // calha com carpete (ouro fica aqui)
  k.box(1.2, 0.2, 5.0, C.steel, 2.6, 0.7, -0.5, 0.12);
  for (let i = 0; i < 9; i++) k.box(1.1, 0.06, 0.06, C.dark, 2.6, 0.84 - i * 0.06, 1.5 - i * 0.5);
  k.box(1.2, 0.25, 4.8, 0x2f6a3a, 2.6, 0.73, -0.5, 0.12);
  // caixa de água e bomba
  k.box(2.0, 1.8, 2.0, C.teal, -3.0, 0.9, -2.0);
  k.cyl(0.12, 0.12, 3.2, C.dark, -2.0, 2.4, 0, 6, 0, 0, Math.PI / 2);
  // cofre do ouro (vai para o estoque)
  k.box(0.9, 0.7, 0.9, C.gold, 2.6, 0.35, -3.6);
  k.box(0.95, 0.12, 0.95, C.dark, 2.6, 0.72, -3.6);
  root.add(k.mesh());
  const tk = new Kit();
  tk.cylX(1.0, 5.6, C.steel, 0, 0, 0, 14);
  for (let i = 0; i < 6; i++) tk.cylX(1.05, 0.12, C.dark, -2.6 + i * 1.04, 0, 0, 14);
  tk.cylX(0.4, 5.8, C.dark, 0, 0, 0, 8);
  const trommel = tk.mesh();
  trommel.rotation.y = Math.PI / 2;
  trommel.position.set(0, 2.3, 0);
  trommel.rotation.z = 0;
  root.add(trommel);
  // esteira de rejeito saindo por trás
  const bk = new Kit();
  bk.box(0.9, 0.12, 7, C.dark, 0, 0, 0);
  bk.box(1.0, 0.25, 7, C.steelD, 0, -0.15, 0);
  for (let i = 0; i < 3; i++) bk.box(0.12, 2.0, 0.12, C.steelD, 0, -1.0 - i * 0.4, -2.5 + i * 2.5);
  const belt = bk.mesh();
  belt.position.set(0, 2.2, -6.2);
  belt.rotation.x = -0.32;
  root.add(belt);
  return { root, trommel, belt };
}

export function buildHouse(color: number): THREE.Mesh {
  const k = new Kit();
  const cols = [0xe9c46a, 0x90be6d, 0xf4a261, 0x8ecae6];
  const wall = cols[color % cols.length];
  k.box(5, 0.4, 4.4, C.woodL, 0, 0.2, 0); // assoalho sobre palafita
  for (const [x, z] of [[2.3, 2], [-2.3, 2], [2.3, -2], [-2.3, -2]]) k.box(0.25, 0.8, 0.25, C.wood, x, -0.1, z);
  k.box(4.6, 2.4, 4.0, wall, 0, 1.6, 0);
  k.add(new THREE.CylinderGeometry(0.01, 3.9, 1.7, 4), C.roof, 0, 3.65, 0, 0, Math.PI / 4, 0, 1.0, 1, 0.85);
  k.box(1.0, 1.8, 0.08, C.wood, 0.8, 1.3, 2.02);
  k.box(1.0, 0.8, 0.08, C.glass, -1.2, 1.9, 2.02);
  k.box(1.2, 0.08, 0.1, C.white, -1.2, 2.35, 2.04);
  k.box(5, 0.12, 1.4, C.woodL, 0, 0.42, 2.7); // varanda
  k.box(0.12, 1.2, 0.12, C.wood, 2.4, 1.0, 3.3);
  k.box(0.12, 1.2, 0.12, C.wood, -2.4, 1.0, 3.3);
  return k.mesh();
}

export function buildStock(): { root: THREE.Group; bars: THREE.InstancedMesh } {
  const root = new THREE.Group();
  const k = new Kit();
  k.box(9, 0.3, 7, 0x9a9a92, 0, 0.15, 0);
  for (const [x, z] of [[4.3, 3.3], [-4.3, 3.3], [4.3, -3.3], [-4.3, -3.3]]) k.box(0.3, 3.6, 0.3, C.woodL, x, 1.8, z);
  k.box(9.6, 0.25, 7.6, C.red, 0, 3.7, 0, 0.08);
  k.box(9, 2.6, 0.15, C.woodL, 0, 1.6, -3.3);
  // cerca
  for (let i = -4; i <= 4; i++) k.box(0.08, 1.2, 0.08, C.steel, i, 0.6, 3.6);
  k.box(9, 0.06, 0.06, C.steel, 0, 1.1, 3.6);
  // placa com barra de ouro
  k.box(2.2, 1.0, 0.1, C.dark, 0, 3.0, 3.4);
  k.box(1.2, 0.4, 0.12, C.gold, 0, 3.0, 3.42);
  // mesas
  k.box(6, 0.1, 2.2, C.wood, 0, 0.9, -1.6);
  k.box(0.1, 0.75, 2, C.wood, 2.8, 0.5, -1.6);
  k.box(0.1, 0.75, 2, C.wood, -2.8, 0.5, -1.6);
  root.add(k.mesh());
  const bg = new THREE.BoxGeometry(0.42, 0.14, 0.2);
  const bars = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0xffc933, emissive: 0x553300 }), 200);
  bars.count = 0;
  root.add(bars);
  return { root, bars };
}

export function buildGarage(): THREE.Mesh {
  const k = new Kit();
  k.box(12, 0.2, 9, C.steelD, 0, 0.1, 0);
  for (const [x, z] of [[5.8, 4.3], [-5.8, 4.3], [5.8, -4.3], [-5.8, -4.3], [0, -4.3]]) k.box(0.3, 4.2, 0.3, C.dark, x, 2.1, z);
  k.box(12.6, 0.25, 9.6, C.teal, 0, 4.4, 0, -0.06);
  k.box(12, 3.8, 0.15, C.steel, 0, 2.1, -4.3);
  k.box(0.15, 3.8, 9, C.steel, -5.9, 2.1, 0);
  // placa: engrenagem amarela
  k.box(3, 1.2, 0.12, C.dark, 0, 5.2, 4.6);
  k.cyl(0.45, 0.45, 0.14, C.yellow, 0, 5.2, 4.68, 8, Math.PI / 2);
  // bancada, pneus, tambores
  k.box(3, 0.9, 1, C.wood, -3.5, 0.55, -3.5);
  k.cylX(0.5, 0.35, C.rubber, 3.8, 0.5, -3.4, 12);
  k.cyl(0.35, 0.35, 0.9, C.red, 4.8, 0.55, -2.2, 10);
  k.cyl(0.35, 0.35, 0.9, C.teal, 4.8, 0.55, -1.4, 10);
  return k.mesh();
}

/** caminhão-forte de exportação (leva parte do estoque e paga) */
export function buildExportTruck(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit();
  k.box(2.3, 0.4, 7, C.dark, 0, 0.75, 0);
  k.box(2.4, 1.9, 1.9, C.white, 0, 1.9, 2.4);
  k.box(2.42, 0.8, 1.2, C.glass, 0, 2.3, 2.6);
  k.box(2.5, 2.6, 4.6, 0x3b5f8a, 0, 2.25, -1.3);
  k.box(2.52, 0.4, 4.62, C.gold, 0, 1.3, -1.3);
  k.box(1.0, 1.0, 0.1, C.gold, 1.26, 2.6, -1.3, 0, Math.PI / 2);
  k.box(1.0, 1.0, 0.1, C.gold, -1.26, 2.6, -1.3, 0, Math.PI / 2);
  k.box(0.3, 0.2, 0.05, C.light, 0.85, 1.3, 3.36);
  k.box(0.3, 0.2, 0.05, C.light, -0.85, 1.3, 3.36);
  for (const z of [2.4, -1.0, -2.6]) for (const s of [1, -1]) k.cylX(0.5, 0.4, C.rubber, s * 1.05, 0.5, z, 12);
  g.add(k.mesh());
  return g;
}

/** estaca/placa de garimpo (marca de cheio, bandeiras) */
export function buildFlag(color: number): THREE.Mesh {
  const k = new Kit();
  k.box(0.08, 2.4, 0.08, C.woodL, 0, 1.2, 0);
  k.box(0.04, 0.5, 0.8, color, 0, 2.1, 0.42);
  return k.mesh();
}

