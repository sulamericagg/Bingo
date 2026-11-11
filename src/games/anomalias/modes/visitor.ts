/* ============================================================
 *  ANOMALIAS — VISITANTE (modo Recepção): um Bloop com "botões" para
 *  cada pista de impostor: nº de olhos, piscar fora de ritmo, boca larga
 *  com dentes, cor, acessórios (chapéu / óculos / cachecol / bolsa),
 *  sombra, ficar parado demais, rosto que gira em volta da cabeça,
 *  marcas que só a luz UV mostra. Também serve de reflexo (espelho)
 *  e de foto do crachá.
 * ============================================================ */
import * as THREE from 'three';
import { blobTexture, canvasTex, type Mats } from './common';

export type Hat = 'none' | 'cap' | 'beanie' | 'bow' | 'chef' | 'crown' | 'flower';
export interface Look {
  color: string;
  eyes: 1 | 2 | 3;
  /** 0 = sorriso; 1 = bocão sutil; 2 = bocão com dentes */
  mouth: 0 | 1 | 2;
  hat: Hat;
  hatColor: string;
  glasses: boolean;
  scarf: string | null;
  bag: string | null;
}
export interface Behave {
  shadow: boolean;
  still: boolean;
  blinkAsync: boolean;
  headSpin: boolean;
  uvMark: boolean;
}
export const BEHAVE_OK: Behave = { shadow: true, still: false, blinkAsync: false, headSpin: false, uvMark: false };

const R = 0.42;
const INK = '#2a1140';
const light = (c: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const dark = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(1 - k).getHexString();

let uvTex: THREE.CanvasTexture | null = null;
function uvTexture(): THREE.CanvasTexture {
  if (uvTex) return uvTex;
  uvTex = canvasTex(128, 128, (x) => {
    x.strokeStyle = '#b6ff3a';
    x.fillStyle = '#b6ff3a';
    x.lineCap = 'round';
    x.lineWidth = 7;
    // três arranhões + olho
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(26 + i * 22, 18);
      x.quadraticCurveTo(34 + i * 22, 60, 22 + i * 22, 104);
      x.stroke();
    }
    x.lineWidth = 5;
    x.beginPath();
    x.ellipse(98, 92, 18, 11, 0, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(98, 92, 5, 0, Math.PI * 2);
    x.fill();
  });
  return uvTex;
}
export function disposeVisitorTex(): void {
  uvTex?.dispose();
  uvTex = null;
}

const geos = new Map<string, THREE.BufferGeometry>();
const G = (k: string, f: () => THREE.BufferGeometry) => {
  let g = geos.get(k);
  if (!g) geos.set(k, (g = f()));
  return g;
};
export function disposeVisitorGeo(): void {
  geos.forEach((g) => g.dispose());
  geos.clear();
}
const sph = (r: number, w = 14, h = 10) => G(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}

export class Visitor {
  readonly root = new THREE.Group();
  readonly body: THREE.Mesh;
  /** rosto (olhos, boca, bochechas) — gira em volta do corpo na pista "cabeça gira" */
  readonly face = new THREE.Group();
  readonly head = new THREE.Object3D();
  private eyes: THREE.Mesh[] = [];
  private feet: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private uv: THREE.Mesh;
  private bodyMat: THREE.MeshLambertMaterial;
  private t = Math.random() * 10;
  private blinkPh: number[];
  walking = 0;
  /** olhar para (yaw relativo, rad) */
  lookYaw = 0;
  private lookCur = 0;
  private spinT = 0;
  /** 0..1 fala (boca mexe) */
  talk = 0;
  private mouthG = new THREE.Group();

  constructor(
    readonly look: Look,
    readonly beh: Behave,
    mats: Mats,
  ) {
    this.bodyMat = mats.own(new THREE.MeshLambertMaterial({ color: look.color }));
    this.body = mesh(sph(R, 22, 16), this.bodyMat, 0, R + 0.12, 0);
    this.root.add(this.body);
    this.body.add(mesh(sph(R * 0.72, 16, 12), mats.lam(light(look.color, 0.45)), 0, -0.06, -0.14, 1, 0.9, 0.7));
    this.body.add(this.face);
    // olhos
    const white = mats.lam('#ffffff');
    const ink = mats.lam(INK);
    const ex = look.eyes === 1 ? [0] : look.eyes === 2 ? [-0.15, 0.15] : [-0.19, 0, 0.19];
    ex.forEach((x, i) => {
      const y = look.eyes === 3 && i === 1 ? 0.2 : 0.1;
      const s = look.eyes === 1 ? 1.35 : look.eyes === 3 ? 0.85 : 1;
      const e = mesh(sph(0.11, 12, 10), white, x, y, -0.33 - (look.eyes === 3 && i === 1 ? -0.03 : 0), s, s * 1.25, s * 0.6);
      e.add(mesh(sph(0.055, 10, 8), ink, 0, 0, -0.08));
      this.face.add(e);
      this.eyes.push(e);
    });
    this.blinkPh = this.eyes.map((_, i) => (beh.blinkAsync ? i * 1.37 + 0.6 : 0));
    // boca
    if (look.mouth === 0) {
      const smile = mesh(G('smile', () => new THREE.TorusGeometry(0.075, 0.02, 6, 14, Math.PI)), ink, 0, -0.07, -0.405);
      smile.rotation.z = Math.PI;
      smile.rotation.x = -0.25;
      this.mouthG.add(smile);
    } else {
      const w = look.mouth === 1 ? 1.15 : 1.75;
      const cav = mesh(sph(0.1, 16, 10), mats.lam('#3c0718'), 0, -0.1, -0.37, w * 1.25, 0.55, 0.45);
      this.mouthG.add(cav);
      const tooth = G('vtooth', () => new THREE.ConeGeometry(0.022, 0.05, 5));
      const n = look.mouth === 1 ? 4 : 8;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1) - 0.5) * 0.2 * w;
        const tt = mesh(tooth, mats.lam('#ffffff'), x, -0.075, -0.405);
        tt.rotation.x = Math.PI;
        this.mouthG.add(tt);
      }
    }
    this.face.add(this.mouthG);
    for (const s of [-1, 1]) this.face.add(mesh(sph(0.05, 8, 6), mats.lam('#ff8fb0'), s * 0.27, -0.04, -0.3, 1, 0.6, 0.5));
    // pés, braços
    const fm = mats.lam(dark(look.color, 0.3));
    for (const s of [-1, 1]) {
      const f = mesh(sph(0.12, 10, 8), fm, s * 0.17, 0.07, -0.04, 1, 0.6, 1.3);
      this.root.add(f);
      this.feet.push(f);
      const a = mesh(G('varm', () => new THREE.CapsuleGeometry(0.06, 0.16, 4, 8)), fm, s * 0.38, -0.08, -0.02);
      a.rotation.z = s * 0.6;
      this.body.add(a);
      this.arms.push(a);
    }
    // acessórios
    if (look.hat !== 'none') this.body.add(hatOf(look.hat, look.hatColor, mats));
    if (look.glasses) {
      const gm = mats.lam('#1d1d2a');
      const ring = G('glass', () => new THREE.TorusGeometry(0.1, 0.018, 6, 16));
      const xs = look.eyes === 1 ? [0] : look.eyes === 2 ? [-0.15, 0.15] : [-0.19, 0.19];
      for (const x of xs) this.face.add(mesh(ring, gm, x, 0.1, -0.4));
      if (xs.length === 2) this.face.add(mesh(G('bridge', () => new THREE.BoxGeometry(0.1, 0.02, 0.02)), gm, 0, 0.12, -0.41));
    }
    if (look.scarf) {
      const sc = mesh(G('scarf', () => new THREE.TorusGeometry(0.33, 0.07, 8, 20)), mats.lam(look.scarf), 0, -0.22, 0, 1, 1, 1);
      sc.rotation.x = Math.PI / 2 + 0.12;
      this.body.add(sc);
      const tail = mesh(G('scarfT', () => new THREE.BoxGeometry(0.1, 0.24, 0.05)), mats.lam(look.scarf), 0.14, -0.36, -0.3);
      tail.rotation.z = 0.2;
      this.body.add(tail);
    }
    if (look.bag) {
      const b = mesh(G('bag', () => new THREE.BoxGeometry(0.22, 0.2, 0.08)), mats.lam(look.bag), 0.46, -0.2, -0.05);
      this.body.add(b);
      const strap = mesh(G('strap', () => new THREE.TorusGeometry(0.4, 0.015, 4, 20)), mats.lam(dark(look.bag, 0.3)), 0.1, 0.02, -0.02, 1, 1, 0.9);
      strap.rotation.y = Math.PI / 2;
      strap.rotation.x = 0.5;
      this.body.add(strap);
    }
    // sombra (disco no chão)
    this.shadow = mesh(G('vshadow', () => new THREE.PlaneGeometry(1, 1)), mats.basic('#ffffff', blobTexture(), true), 0, 0.012, 0, 1.15, 1.15, 1.15);
    this.shadow.rotation.x = -Math.PI / 2;
    (this.shadow.material as THREE.MeshBasicMaterial).depthWrite = false;
    this.shadow.visible = beh.shadow;
    this.root.add(this.shadow);
    // marca UV (escondida até a luz UV)
    const uvm = mats.own(new THREE.MeshBasicMaterial({ map: uvTexture(), transparent: true, depthWrite: false, fog: false }));
    this.uv = mesh(G('uvq', () => new THREE.PlaneGeometry(0.5, 0.5)), uvm, 0, -0.04, -0.435);
    this.uv.rotation.y = Math.PI;
    this.uv.visible = false;
    this.body.add(this.uv);
    this.head.position.set(0, 0.08, -0.2);
    this.body.add(this.head);
  }

  setUv(on: boolean): void {
    this.uv.visible = on && this.beh.uvMark;
  }
  /** impostor revelado (corredor de dentro): olhos acesos */
  setCreepy(mats: Mats): void {
    for (const e of this.eyes) {
      e.material = mats.basic('#fff27a');
      e.children.forEach((p) => ((p as THREE.Mesh).material = mats.basic('#d0103a')));
    }
  }
  setColor(c: string): void {
    this.bodyMat.color.set(c);
  }
  hideShadow(): void {
    this.shadow.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const still = this.beh.still && this.walking < 0.05;
    const breath = still ? 1 : 1 + Math.sin(t * 2.4) * 0.025;
    const hop = this.walking * Math.abs(Math.sin(t * 9)) * 0.08;
    this.body.position.y = R + 0.12 + hop;
    this.body.scale.set(1 / Math.sqrt(breath), breath, 1 / Math.sqrt(breath));
    this.feet[0].position.z = -0.04 + Math.sin(t * 9) * 0.1 * this.walking;
    this.feet[1].position.z = -0.04 - Math.sin(t * 9) * 0.1 * this.walking;
    if (!still) for (let i = 0; i < 2; i++) this.arms[i].rotation.x = Math.sin(t * (this.walking > 0.1 ? 9 : 1.3) + i * Math.PI) * (0.1 + 0.4 * this.walking);
    // piscar (fora de ritmo = cada olho no seu tempo)
    this.eyes.forEach((e, i) => {
      const per = this.beh.blinkAsync ? 2.1 + i * 0.9 : 3.6;
      const ph = (t + this.blinkPh[i]) % per;
      const base = this.look.eyes === 1 ? 1.35 * 1.25 : this.look.eyes === 3 ? 0.85 * 1.25 : 1.25;
      e.scale.y = !still && ph < 0.14 ? base * 0.12 : base;
    });
    // olhar / rosto girando
    if (this.beh.headSpin && this.walking < 0.05) {
      this.spinT += dt;
      const cyc = this.spinT % 7;
      // parado olhando → gira devagar até as costas → volta rápido
      const k = cyc < 3 ? 0 : cyc < 5 ? (cyc - 3) / 2 : cyc < 5.6 ? 1 : 1 - (cyc - 5.6) / 1.4;
      this.face.rotation.y = k * k * (3 - 2 * k) * Math.PI * 0.95;
    } else {
      this.face.rotation.y *= 1 - Math.min(1, dt * 4);
    }
    if (!still) {
      this.lookCur += (this.lookYaw - this.lookCur) * Math.min(1, dt * 2.5);
      this.body.rotation.y = this.lookCur;
    }
    this.mouthG.scale.y = this.talk > 0 ? 1 + Math.abs(Math.sin(t * 16)) * 0.6 * this.talk : 1;
  }
}

function hatOf(h: Hat, col: string, mats: Mats): THREE.Object3D {
  const o = new THREE.Group();
  const m = mats.lam(col);
  if (h === 'cap') {
    o.add(mesh(G('capA', () => new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m));
    o.add(mesh(G('capB', () => new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12)), m, 0, 0, -0.26, 1, 1, 0.8));
    o.position.y = 0.27;
  } else if (h === 'beanie') {
    o.add(mesh(G('capA', () => new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m));
    o.add(mesh(sph(0.07), mats.lam('#ffffff'), 0, 0.3, 0));
    o.position.y = 0.25;
  } else if (h === 'bow') {
    for (const s of [-1, 1]) {
      const a = mesh(G('bowc', () => new THREE.ConeGeometry(0.09, 0.15, 8)), m, s * 0.075, 0, 0);
      a.rotation.z = (s * Math.PI) / 2;
      o.add(a);
    }
    o.add(mesh(sph(0.04), m));
    o.position.set(0.17, 0.37, 0);
  } else if (h === 'chef') {
    o.add(mesh(G('chefA', () => new THREE.CylinderGeometry(0.2, 0.2, 0.18, 14)), m));
    o.add(mesh(sph(0.24), m, 0, 0.16, 0, 1, 0.6, 1));
    o.position.y = 0.42;
  } else if (h === 'crown') {
    o.add(mesh(G('crownA', () => new THREE.CylinderGeometry(0.17, 0.15, 0.1, 10, 1, true)), m));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const c = mesh(G('crownT', () => new THREE.ConeGeometry(0.04, 0.1, 5)), m, Math.sin(a) * 0.16, 0.09, Math.cos(a) * 0.16);
      o.add(c);
    }
    o.position.y = 0.43;
  } else if (h === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      o.add(mesh(sph(0.055, 8, 6), m, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0, 1, 1, 0.5));
    }
    o.add(mesh(sph(0.045, 8, 6), mats.lam('#ffd34a'), 0, 0, -0.02));
    o.position.set(-0.2, 0.33, -0.18);
    o.rotation.y = 0.5;
  }
  return o;
}
