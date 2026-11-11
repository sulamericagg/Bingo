/* ============================================================
 *  CAVA & FALA — Bloops (moradores, ajudantes e rivais da arena).
 *  Bolinha fofa com olhos, pezinhos, bracinhos e chapéu opcional;
 *  anima pulinho, andar, comemorar, "splat" e balão de fala.
 * ============================================================ */
import * as THREE from 'three';

const geoCache: Record<string, THREE.BufferGeometry> = {};
const g = (k: string, f: () => THREE.BufferGeometry) => (geoCache[k] ??= f());
const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function lam(col: string, emissive = 0): THREE.MeshLambertMaterial {
  const k = col + '|' + emissive;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: col });
    if (emissive) m.emissive.set(col).multiplyScalar(emissive);
    matCache.set(k, m);
  }
  return m;
}
export function disposeBloopCache(): void {
  for (const k in geoCache) {
    geoCache[k].dispose();
    delete geoCache[k];
  }
  matCache.forEach((m) => m.dispose());
  matCache.clear();
}

export type Hat = '' | 'cap' | 'beanie' | 'straw' | 'crown' | 'helmet' | 'bow';

export class BloopModel {
  readonly root = new THREE.Group();
  readonly body: THREE.Mesh;
  private eyes = new THREE.Group();
  private feet: THREE.Mesh[] = [];
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  /** ponto da mão direita (para segurar engenhocas) */
  readonly hand = new THREE.Group();
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  private t = Math.random() * 10;
  /** 0..1: força do pulinho de comemoração */
  cheer = 0;
  private splatT = 0;
  constructor(
    color: string,
    readonly scale = 1,
    hat: Hat = '',
    hatCol = '#ff4f6a',
  ) {
    const R = 0.42;
    this.body = new THREE.Mesh(
      g('body', () => new THREE.SphereGeometry(R, 18, 14)),
      lam(color),
    );
    this.body.position.y = R + 0.12;
    this.body.castShadow = true;
    this.root.add(this.body);
    // barriga
    const belly = new THREE.Mesh(
      g('belly', () => new THREE.SphereGeometry(R * 0.72, 14, 10)),
      lam(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45).getStyle()),
    );
    belly.position.set(0, -0.06, -0.14);
    belly.scale.set(1, 0.9, 0.7);
    this.body.add(belly);
    // olhos (olhando para -Z = frente)
    const white = lam('#ffffff');
    const ink = lam('#2a1140');
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(
        g('eye', () => new THREE.SphereGeometry(0.11, 12, 10)),
        white,
      );
      e.position.set(s * 0.15, 0.1, -0.33);
      e.scale.set(1, 1.25, 0.6);
      const p = new THREE.Mesh(
        g('pupil', () => new THREE.SphereGeometry(0.055, 10, 8)),
        ink,
      );
      p.position.set(0, 0.0, -0.07);
      e.add(p);
      this.eyes.add(e);
    }
    this.body.add(this.eyes);
    // bochechas
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(
        g('cheek', () => new THREE.SphereGeometry(0.05, 8, 6)),
        lam('#ff8fb0'),
      );
      c.position.set(s * 0.27, -0.04, -0.3);
      c.scale.set(1, 0.6, 0.5);
      this.body.add(c);
    }
    // pés
    const footM = lam(new THREE.Color(color).multiplyScalar(0.7).getStyle());
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(
        g('foot', () => new THREE.SphereGeometry(0.12, 10, 8)),
        footM,
      );
      f.scale.set(1, 0.6, 1.3);
      f.position.set(s * 0.17, 0.07, -0.04);
      this.root.add(f);
      this.feet.push(f);
    }
    // bracinhos
    for (const [arm, s] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const a = new THREE.Mesh(
        g('arm', () => new THREE.CapsuleGeometry(0.06, 0.18, 4, 8)),
        footM,
      );
      a.position.y = -0.13;
      arm.add(a);
      arm.position.set(s * 0.38, 0.0, -0.02);
      arm.rotation.z = s * 0.5;
      this.body.add(arm);
    }
    this.hand.position.set(0, -0.26, -0.05);
    this.armR.add(this.hand);
    if (hat) this.body.add(makeHat(hat, hatCol));
    this.root.scale.setScalar(scale);
  }

  /** balão de fala acima da cabeça */
  say(text: string, ms = 2200): void {
    if (this.bubble) {
      this.root.remove(this.bubble);
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
      this.bubble.material.dispose();
    }
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d')!;
    c.font = '700 40px Fredoka, system-ui, sans-serif';
    const w = Math.min(560, Math.ceil(c.measureText(text).width) + 48);
    cv.width = w;
    cv.height = 84;
    c.font = '700 40px Fredoka, system-ui, sans-serif';
    c.fillStyle = '#fff';
    c.strokeStyle = '#2a0b5c';
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(4, 4, w - 8, 62, 26);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(w / 2 - 12, 64);
    c.lineTo(w / 2, 80);
    c.lineTo(w / 2 + 12, 64);
    c.fill();
    c.fillStyle = '#2a0b5c';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, 37, w - 30);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 20;
    const k = 0.0042;
    sp.scale.set(w * k, 84 * k, 1);
    sp.position.y = 1.55;
    this.root.add(sp);
    this.bubble = sp;
    this.bubbleT = ms / 1000;
  }
  /** etiqueta com o nome (amigos online) */
  nameTag(text: string, col: string): void {
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d')!;
    c.font = '800 34px Fredoka, system-ui, sans-serif';
    const w = Math.min(420, Math.ceil(c.measureText(text).width) + 36);
    cv.width = w;
    cv.height = 52;
    c.font = '800 34px Fredoka, system-ui, sans-serif';
    c.fillStyle = 'rgba(20,8,48,.72)';
    c.beginPath();
    c.roundRect(2, 2, w - 4, 48, 22);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.arc(24, 26, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2 + 10, 28, w - 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.tag.renderOrder = 19;
    const k = 0.0052;
    this.tagW = w;
    this.tag.scale.set(w * k, 52 * k, 1);
    this.tag.position.y = 1.25;
    this.root.add(this.tag);
  }
  private tag: THREE.Sprite | null = null;
  private tagW = 0;
  /** etiqueta legível de longe: cresce com a distância da câmera */
  tagDist(d: number): void {
    if (!this.tag) return;
    const s = Math.max(1, Math.min(3.2, d / 4.5)) / this.scale;
    const k = 0.0052 * s;
    this.tag.scale.set(this.tagW * k, 52 * k, 1);
    this.tag.position.y = 1.2 + 0.14 * s;
  }
  splat(): void {
    this.splatT = 0.35;
  }

  /** speed: velocidade horizontal; air: no ar */
  update(dt: number, speed: number, air: boolean): void {
    this.t += dt;
    const t = this.t;
    const walk = Math.min(1, speed / 4);
    let hop = walk * Math.abs(Math.sin(t * 10)) * 0.12;
    let sy = 1 + Math.sin(t * 3) * 0.03;
    if (this.cheer > 0) {
      const c = Math.abs(Math.sin(t * 9));
      hop += c * 0.45 * this.cheer;
      sy = 1 + (c - 0.5) * 0.18 * this.cheer;
      this.armL.rotation.z = -2.4 + Math.sin(t * 18) * 0.4;
      this.armR.rotation.z = 2.4 - Math.sin(t * 18) * 0.4;
    } else {
      this.armL.rotation.z = -0.5 - walk * Math.sin(t * 10) * 0.4 - (air ? 1 : 0);
      this.armR.rotation.z = 0.5 + walk * Math.sin(t * 10) * 0.4 + (air ? 1 : 0);
    }
    if (this.splatT > 0) {
      this.splatT -= dt;
      sy = 0.6;
    }
    if (air) sy = 1.08;
    this.body.position.y = 0.54 + hop;
    this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.feet[0].position.z = -0.04 + Math.sin(t * 10) * 0.12 * walk;
    this.feet[1].position.z = -0.04 - Math.sin(t * 10) * 0.12 * walk;
    // piscar
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    this.eyes.scale.y = blink;
    if (this.tag) this.tag.visible = !this.bubble;
    if (this.bubble) {
      this.bubbleT -= dt;
      const m = this.bubble.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, this.bubbleT * 3);
      if (this.bubbleT <= 0) {
        this.root.remove(this.bubble);
        m.map?.dispose();
        m.dispose();
        this.bubble = null;
      }
    }
  }
  dispose(): void {
    this.root.parent?.remove(this.root);
    if (this.tag) {
      (this.tag.material as THREE.SpriteMaterial).map?.dispose();
      this.tag.material.dispose();
    }
    if (this.bubble) {
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
      this.bubble.material.dispose();
    }
  }
}

function makeHat(h: Hat, col: string): THREE.Object3D {
  const o = new THREE.Group();
  const m = lam(col);
  if (h === 'cap') {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), m);
    b.position.set(0, 0, -0.26);
    b.scale.set(1, 1, 0.8);
    o.add(a, b);
    o.position.y = 0.26;
  } else if (h === 'beanie') {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lam('#ffffff'));
    p.position.y = 0.32;
    o.add(a, p);
    o.position.y = 0.22;
  } else if (h === 'straw') {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 14), lam('#f2d27a'));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 18), lam('#f2d27a'));
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 14), m);
    a.position.y = 0.07;
    r.position.y = 0.03;
    o.add(a, b, r);
    o.position.y = 0.32;
  } else if (h === 'crown') {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.16, 6, 1, true), lam('#ffd34a', 0.3));
    o.add(a);
    o.position.y = 0.4;
  } else if (h === 'helmet') {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam('#ffcf2e'));
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), lam('#fff8c0', 0.8));
    l.rotation.x = Math.PI / 2;
    l.position.set(0, 0.16, -0.28);
    o.add(a, l);
    o.position.y = 0.2;
  } else if (h === 'bow') {
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 8), m);
      a.rotation.z = (s * Math.PI) / 2;
      a.position.x = s * 0.08;
      o.add(a);
    }
    o.position.set(0.18, 0.36, 0);
  }
  return o;
}
