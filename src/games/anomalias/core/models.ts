/* ============================================================
 *  ANOMALIAS — modelos do núcleo:
 *   · NpcBloop: Bloop (pacientes, hóspedes, bebês) com ROSTOS trocáveis
 *     (normal / bravo / bocão com dentinhos / olhos brilhando / sem rosto)
 *   · Bocudo: o monstrinho original do jogo — bolota roxa com uma BOCA
 *     enorme, dois dentinhos de vampiro e olhinhos amarelos. Fofo-assustador.
 *  Geometrias e materiais em cache (um por cor) → poucas alocações.
 * ============================================================ */
import * as THREE from 'three';

const geo: Record<string, THREE.BufferGeometry> = {};
const g = (k: string, f: () => THREE.BufferGeometry) => (geo[k] ??= f());
const mats = new Map<string, THREE.Material>();
export function lam(col: string, emissive = 0): THREE.MeshLambertMaterial {
  const k = 'l' + col + emissive;
  let m = mats.get(k) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: col });
    if (emissive) m.emissive.set(col).multiplyScalar(emissive);
    mats.set(k, m);
  }
  return m;
}
export function basic(col: string): THREE.MeshBasicMaterial {
  const k = 'b' + col;
  let m = mats.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: col, fog: false });
    mats.set(k, m);
  }
  return m;
}
export function disposeModels(): void {
  for (const k in geo) {
    geo[k].dispose();
    delete geo[k];
  }
  mats.forEach((m) => m.dispose());
  mats.clear();
}
const sph = (r: number, w = 14, h = 10) => g('s' + r + w, () => new THREE.SphereGeometry(r, w, h));
function mesh(gm: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx): THREE.Mesh {
  const o = new THREE.Mesh(gm, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}
const lighten = (c: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const darken = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(1 - k).getHexString();

/* ================================ NPC Bloop ================================ */
export type Face = 'normal' | 'angry' | 'mouth' | 'glow' | 'none';
export const FACE_VARIANTS: Face[] = ['angry', 'mouth', 'glow', 'none'];

export class NpcBloop {
  readonly root = new THREE.Group();
  /** inclinação da pose (deitado) */
  readonly pivot = new THREE.Group();
  readonly body: THREE.Mesh;
  /** ponto da cabeça (para foto/olhar) */
  readonly head = new THREE.Object3D();
  private eyes = new THREE.Group();
  private pupils: THREE.Mesh[] = [];
  private eyeW: THREE.Mesh[] = [];
  private smile: THREE.Mesh;
  private frown: THREE.Mesh;
  private big = new THREE.Group();
  private brows = new THREE.Group();
  private cheeks: THREE.Mesh[] = [];
  private feet: THREE.Mesh[] = [];
  private t = Math.random() * 10;
  private baseY: number;
  face: Face = 'normal';
  /** -1 = sem olhar; senão yaw alvo (mundo) */
  lookYaw: number | null = null;
  baseYaw: number;
  walking = 0;
  readonly color: string;

  constructor(
    color: string,
    readonly pose: 'stand' | 'sit' | 'lie',
    readonly size = 1,
    hat = '',
  ) {
    this.color = color;
    const R = 0.42;
    this.root.add(this.pivot);
    this.body = mesh(sph(R, 18, 14), lam(color));
    this.baseY = pose === 'stand' ? R + 0.12 : pose === 'sit' ? R + 0.02 : R * 0.7;
    this.body.position.y = this.baseY;
    this.pivot.add(this.body);
    if (pose === 'lie') this.pivot.rotation.x = 0.95;
    const belly = mesh(sph(R * 0.72, 14, 10), lam(lighten(color, 0.45)), 0, -0.06, -0.14, 1, 0.9, 0.7);
    this.body.add(belly);
    // olhos (frente = -Z)
    const white = lam('#ffffff');
    const ink = lam('#2a1140');
    for (const s of [-1, 1]) {
      const e = mesh(sph(0.11, 12, 10), white, s * 0.15, 0.1, -0.33, 1, 1.25, 0.6);
      const p = mesh(sph(0.055, 10, 8), ink, 0, 0, -0.08);
      e.add(p);
      this.eyes.add(e);
      this.eyeW.push(e);
      this.pupils.push(p);
    }
    this.body.add(this.eyes);
    // boca sorrindo / bravo
    const tor = g('smile', () => new THREE.TorusGeometry(0.075, 0.02, 6, 14, Math.PI));
    this.smile = mesh(tor, ink, 0, -0.07, -0.405);
    this.smile.rotation.z = Math.PI;
    this.smile.rotation.x = -0.25;
    this.frown = mesh(tor, ink, 0, -0.14, -0.395);
    this.frown.rotation.x = -0.35;
    this.frown.visible = false;
    this.body.add(this.smile, this.frown);
    // BOCÃO com dentinhos
    const mouthIn = mesh(sph(0.2, 16, 12), lam('#3c0718'), 0, 0, 0, 1, 0.78, 0.45);
    const tongue = mesh(sph(0.09, 10, 8), lam('#ff6f91'), 0, -0.09, -0.04, 1.3, 0.55, 0.8);
    this.big.add(mouthIn, tongue);
    const fang = g('fang', () => new THREE.ConeGeometry(0.032, 0.08, 6));
    for (const s of [-1, 1]) {
      const f = mesh(fang, lam('#ffffff'), s * 0.08, 0.1, -0.06);
      f.rotation.x = Math.PI;
      this.big.add(f);
    }
    this.big.position.set(0, -0.12, -0.34);
    this.big.visible = false;
    this.body.add(this.big);
    // sobrancelhas bravas
    for (const s of [-1, 1]) {
      const b = mesh(g('brow', () => new THREE.BoxGeometry(0.15, 0.035, 0.04)), ink, s * 0.15, 0.27, -0.33);
      b.rotation.z = s * 0.45;
      this.brows.add(b);
    }
    this.brows.visible = false;
    this.body.add(this.brows);
    // bochechas
    for (const s of [-1, 1]) {
      const c = mesh(sph(0.05, 8, 6), lam('#ff8fb0'), s * 0.27, -0.04, -0.3, 1, 0.6, 0.5);
      this.cheeks.push(c);
      this.body.add(c);
    }
    // pés (só em pé)
    const footM = lam(darken(color, 0.3));
    for (const s of [-1, 1]) {
      const f = mesh(sph(0.12, 10, 8), footM, s * 0.17, 0.07, -0.04, 1, 0.6, 1.3);
      f.visible = pose === 'stand';
      this.pivot.add(f);
      this.feet.push(f);
    }
    // bracinhos
    for (const s of [-1, 1]) {
      const a = mesh(g('arm', () => new THREE.CapsuleGeometry(0.06, 0.16, 4, 8)), footM, s * 0.38, -0.08, -0.02);
      a.rotation.z = s * 0.6;
      this.body.add(a);
    }
    if (hat) this.body.add(makeHat(hat));
    this.head.position.set(0, 0.05, -0.2);
    this.body.add(this.head);
    this.root.scale.setScalar(size);
    this.baseYaw = 0;
  }

  setFace(f: Face): void {
    this.face = f;
    const none = f === 'none';
    this.eyes.visible = !none;
    this.smile.visible = f === 'normal';
    this.frown.visible = f === 'angry';
    this.brows.visible = f === 'angry';
    this.big.visible = f === 'mouth';
    for (const c of this.cheeks) c.visible = f === 'normal';
    const glow = f === 'glow';
    for (const e of this.eyeW) e.material = glow ? basic('#fff27a') : lam('#ffffff');
    for (const p of this.pupils) {
      p.visible = !glow;
      p.material = f === 'angry' ? lam('#b0103a') : lam('#2a1140');
      p.scale.setScalar(f === 'mouth' ? 0.6 : 1);
    }
  }
  setTint(col: string | null): void {
    this.body.material = lam(col ?? this.color);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const breath = 1 + Math.sin(t * (this.pose === 'lie' ? 1.6 : 2.4)) * 0.025;
    const hop = this.walking * Math.abs(Math.sin(t * 9)) * 0.08;
    this.body.position.y = this.baseY + hop;
    this.body.scale.set(1 / Math.sqrt(breath), breath, 1 / Math.sqrt(breath));
    if (this.walking > 0 && this.feet[0].visible) {
      this.feet[0].position.z = -0.04 + Math.sin(t * 9) * 0.1;
      this.feet[1].position.z = -0.04 - Math.sin(t * 9) * 0.1;
    }
    // piscar (rosto normal/bravo)
    this.eyes.scale.y = this.face !== 'glow' && t % 4.1 < 0.12 ? 0.15 : 1;
    // virar para olhar
    const target = this.lookYaw ?? this.baseYaw;
    let d = target - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * (this.lookYaw != null ? 2.2 : 1.2));
  }
}

function makeHat(h: string): THREE.Object3D {
  const o = new THREE.Group();
  if (h === 'nurse') {
    const a = mesh(g('nurse', () => new THREE.BoxGeometry(0.34, 0.14, 0.2)), lam('#ffffff'));
    const c1 = mesh(g('crossA', () => new THREE.BoxGeometry(0.1, 0.03, 0.01)), lam('#ff4f6a'), 0, 0, -0.105);
    const c2 = mesh(g('crossB', () => new THREE.BoxGeometry(0.03, 0.1, 0.01)), lam('#ff4f6a'), 0, 0, -0.105);
    o.add(a, c1, c2);
    o.position.set(0, 0.4, -0.05);
    o.rotation.x = -0.25;
  } else if (h === 'cap') {
    o.add(mesh(g('capA', () => new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), lam('#3f7bff')));
    const b = mesh(g('capB', () => new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12)), lam('#3f7bff'), 0, 0, -0.26, 1, 1, 0.8);
    o.add(b);
    o.position.y = 0.26;
  } else if (h === 'beanie') {
    o.add(mesh(g('capA', () => new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), lam('#ff9a2e')));
    o.add(mesh(sph(0.07), lam('#ffffff'), 0, 0.3, 0));
    o.position.y = 0.24;
  } else if (h === 'bow') {
    for (const s of [-1, 1]) {
      const a = mesh(g('bow', () => new THREE.ConeGeometry(0.09, 0.15, 8)), lam('#ff5cc8'), s * 0.075, 0, 0);
      a.rotation.z = (s * Math.PI) / 2;
      o.add(a);
    }
    o.position.set(0.17, 0.36, 0);
  } else if (h === 'chef') {
    o.add(mesh(g('chefA', () => new THREE.CylinderGeometry(0.2, 0.2, 0.18, 14)), lam('#ffffff')));
    o.add(mesh(sph(0.24), lam('#ffffff'), 0, 0.16, 0, 1, 0.6, 1));
    o.position.y = 0.42;
  }
  return o;
}

/* ================================ Bocudo ================================ */
/** O monstrinho: ~1,8 m, roxo, boca gigante com dois dentinhos, olhos amarelos. */
export class Bocudo {
  readonly root = new THREE.Group();
  private bodyG = new THREE.Group();
  private mouth = new THREE.Group();
  private cavity: THREE.Mesh;
  private jaw = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private feet: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private t = 0;
  /** 0..1 boca aberta */
  open = 0.35;
  walking = 0;

  constructor() {
    const C = '#4b2a7a';
    const dark = '#2e1650';
    this.root.add(this.bodyG);
    const body = mesh(sph(0.72, 22, 16), lam(C), 0, 1.0, 0, 1, 1.05, 0.92);
    this.bodyG.add(body);
    // barriga mais clara
    this.bodyG.add(mesh(sph(0.55, 16, 12), lam('#6b45a3'), 0, 0.82, -0.2, 1, 0.9, 0.75));
    // orelhinhas de morcego
    const ear = g('ear', () => new THREE.ConeGeometry(0.16, 0.38, 6));
    for (const s of [-1, 1]) {
      const e = mesh(ear, lam(dark), s * 0.42, 1.72, 0.05);
      e.rotation.z = -s * 0.5;
      this.bodyG.add(e);
      const inner = mesh(ear, lam('#c06aa8'), s * 0.41, 1.7, -0.02, 0.6, 0.7, 0.4);
      inner.rotation.z = -s * 0.5;
      this.bodyG.add(inner);
    }
    // BOCA: cavidade escura + língua + dentinhos de vampiro em cima
    this.cavity = mesh(sph(0.5, 20, 14), lam('#33061a'), 0, 0, 0, 1, 0.7, 0.42);
    this.mouth.add(this.cavity);
    // lábio (anel)
    const lip = mesh(g('lip', () => new THREE.TorusGeometry(0.48, 0.05, 6, 24)), lam('#2b1248'), 0, 0, -0.02, 1, 0.7, 1);
    this.mouth.add(lip);
    this.jaw.add(mesh(sph(0.2, 12, 10), lam('#ff6f91'), 0, -0.12, -0.08, 1.4, 0.45, 0.9));
    this.mouth.add(this.jaw);
    const fang = g('bfang', () => new THREE.ConeGeometry(0.07, 0.2, 8));
    for (const s of [-1, 1]) {
      const f = mesh(fang, lam('#fffbe8', 0.15), s * 0.2, 0.25, -0.12);
      f.rotation.x = Math.PI;
      f.name = 'fang';
      this.mouth.add(f);
    }
    // dentinhos de baixo (pequenos)
    const tooth = g('btooth', () => new THREE.ConeGeometry(0.04, 0.09, 6));
    for (const s of [-1, 1]) this.jaw.add(mesh(tooth, lam('#fffbe8'), s * 0.13, -0.22, -0.12));
    this.mouth.position.set(0, 0.86, -0.56);
    this.bodyG.add(this.mouth);
    // olhos amarelos brilhando + pupila em fenda
    for (const s of [-1, 1]) {
      const e = mesh(sph(0.13, 14, 10), basic('#ffe14a'), s * 0.24, 1.42, -0.55, 1, 1.15, 0.7);
      const p = mesh(g('slit', () => new THREE.BoxGeometry(0.03, 0.15, 0.02)), basic('#1a0420'), 0, 0, -0.12);
      e.add(p);
      this.eyes.push(e);
      this.bodyG.add(e);
      const brow = mesh(g('bbrow', () => new THREE.BoxGeometry(0.2, 0.05, 0.05)), lam(dark), s * 0.24, 1.6, -0.57);
      brow.rotation.z = s * 0.35;
      this.bodyG.add(brow);
    }
    // bracinhos e pés
    for (const s of [-1, 1]) {
      const a = mesh(g('barm', () => new THREE.CapsuleGeometry(0.1, 0.3, 4, 8)), lam(dark), s * 0.72, 0.9, -0.1);
      a.rotation.z = s * 0.9;
      this.arms.push(a);
      this.bodyG.add(a);
      const f = mesh(sph(0.2, 12, 8), lam(dark), s * 0.3, 0.12, -0.08, 1, 0.55, 1.35);
      this.feet.push(f);
      this.root.add(f);
    }
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).frustumCulled = true) : 0));
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const o = Math.max(0.05, this.open);
    this.cavity.scale.set(1, 0.25 + 0.6 * o, 0.42);
    this.jaw.position.y = -0.18 * o;
    const hop = this.walking * Math.abs(Math.sin(t * 7)) * 0.1;
    this.bodyG.position.y = hop + Math.sin(t * 2) * 0.02;
    this.feet[0].position.z = -0.08 + Math.sin(t * 7) * 0.2 * this.walking;
    this.feet[1].position.z = -0.08 - Math.sin(t * 7) * 0.2 * this.walking;
    for (let i = 0; i < 2; i++) this.arms[i].rotation.x = Math.sin(t * 7 + i * Math.PI) * 0.5 * this.walking;
    const blink = t % 3.3 < 0.1 ? 0.12 : 1;
    for (const e of this.eyes) e.scale.y = 1.15 * blink;
  }
}
