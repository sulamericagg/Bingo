/* ============================================================
 *  BICHOS — efeitos: partículas ("puf" de brilhinhos, fogo, corações,
 *  poeira, estrelinhas de tontura), projéteis e AVISOS NO CHÃO
 *  (círculo, cone, linha, anel) com preenchimento progressivo.
 *  Tudo instanciado: 3 draw calls no total.
 * ============================================================ */
import * as THREE from 'three';

export type FxKind = 'sparkle' | 'fire' | 'heart' | 'dust' | 'star' | 'smoke' | 'splash' | 'goo' | 'snow' | 'leaf';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grav: number;
  r: number;
  g: number;
  b: number;
  spin: number;
}

export type TeleKind = 'circle' | 'cone' | 'line' | 'ring';
export interface Telegraph {
  kind: TeleKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** raio / comprimento (m) */
  size: number;
  /** meia-largura da linha (m) ou meia-abertura do cone (rad) */
  width: number;
  /** anel: raio interno relativo */
  t: number;
  dur: number;
  /** chamado quando enche */
  onFire?: () => void;
  /** segue algo (atualizado pelo dono) */
  done: boolean;
}

const TELE_V = /* glsl */ `
attribute vec4 iT;
varying vec2 vP;
varying vec4 vT;
void main() {
  vP = position.xz;
  vT = iT;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const TELE_F = /* glsl */ `
uniform float uTime;
varying vec2 vP;
varying vec4 vT;
void main() {
  float kind = vT.x, prog = vT.y, w = vT.z, inner = vT.w;
  vec2 p = vP;
  float r = length(p);
  float inside = 0.0, fill = 0.0, edge = 0.0;
  if (kind < 0.5) { // círculo
    inside = step(r, 1.0);
    fill = step(r, prog);
    edge = smoothstep(0.88, 0.97, r) * inside;
  } else if (kind < 1.5) { // cone (frente = +z local)
    float a = abs(atan(p.x, p.y));
    inside = step(r, 1.0) * step(a, w) * step(0.0, p.y);
    fill = inside * step(r, prog);
    edge = inside * max(smoothstep(0.9, 0.98, r), smoothstep(w - 0.08, w, a));
  } else if (kind < 2.5) { // linha: x em -1..1, z em 0..1
    float py = (p.y + 1.0) * 0.5;
    inside = 1.0;
    fill = step(py, prog);
    edge = inside * smoothstep(0.82, 0.96, abs(p.x));
  } else { // anel que cresce
    float d = abs(r - prog);
    inside = step(d, 0.06 + inner);
    fill = inside;
    edge = inside;
  }
  if (inside < 0.5) discard;
  float pulse = 0.5 + 0.5 * sin(uTime * 14.0);
  vec3 c = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.2, 0.25), fill);
  float a = 0.18 + fill * 0.32 + edge * (0.45 + pulse * 0.3);
  gl_FragColor = vec4(c + edge * 0.25, a);
}`;

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  grav: number;
  life: number;
  col: THREE.Color;
  /** quem atirou: 0 = bicho (acerta jogador), 1 = jogador (acerta bichos) */
  side: 0 | 1;
  dmg: number;
  /** dados livres do dono */
  tag: unknown;
  trail: FxKind | null;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

const PAL: Record<FxKind, string[]> = {
  sparkle: ['#ffffff', '#fff07a', '#ffb3d1', '#9affe0', '#bfd8ff'],
  fire: ['#ffd34a', '#ff8a2e', '#ff5a3a'],
  heart: ['#ff5a8a', '#ff8ab0'],
  dust: ['#d8c8a8', '#b8a888'],
  star: ['#ffe07a', '#ffffff'],
  smoke: ['#c8c0d0', '#a8a0b0'],
  splash: ['#bfeaff', '#ffffff'],
  goo: ['#c8ff4a', '#7aff8a'],
  snow: ['#ffffff', '#dff4ff'],
  leaf: ['#7ad04a', '#ffd34a'],
};

export class MobFx {
  private parts: Particle[] = [];
  private pool: Particle[] = [];
  private pMesh: THREE.InstancedMesh;
  private tMesh: THREE.InstancedMesh;
  private tAttr: THREE.InstancedBufferAttribute;
  private prMesh: THREE.InstancedMesh;
  readonly tele: Telegraph[] = [];
  readonly proj: Projectile[] = [];
  readonly uTime = { value: 0 };
  private group = new THREE.Group();
  private time = 0;

  constructor(
    scene: THREE.Scene,
    public cap: number,
  ) {
    scene.add(this.group);
    const pg = new THREE.OctahedronGeometry(1, 0);
    this.pMesh = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }), 1024);
    this.pMesh.setColorAt(0, _c.set(1, 1, 1));
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    this.pMesh.renderOrder = 3;
    this.group.add(this.pMesh);
    const tg = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    // plano em xz: -1..1 (a linha usa 0..1 em z: o dono posiciona na origem do traço)
    this.tAttr = new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4);
    tg.setAttribute('iT', this.tAttr);
    const tm = new THREE.ShaderMaterial({ vertexShader: TELE_V, fragmentShader: TELE_F, uniforms: { uTime: this.uTime }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.tMesh = new THREE.InstancedMesh(tg, tm, 64);
    this.tMesh.frustumCulled = false;
    this.tMesh.count = 0;
    this.tMesh.renderOrder = 2;
    this.group.add(this.tMesh);
    const sg = new THREE.IcosahedronGeometry(1, 1);
    this.prMesh = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x404040 }), 128);
    this.prMesh.setColorAt(0, _c.set(1, 1, 1));
    this.prMesh.frustumCulled = false;
    this.prMesh.count = 0;
    this.group.add(this.prMesh);
  }

  /** solta n partículas de um tipo */
  emit(kind: FxKind, x: number, y: number, z: number, n: number, spread = 0.5, speed = 2, color?: string): void {
    const pal = color ? [color, ...PAL[kind]] : PAL[kind];
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.cap) return;
      const p = this.pool.pop() ?? ({} as Particle);
      const a = Math.random() * Math.PI * 2;
      const up = kind === 'fire' || kind === 'smoke' || kind === 'heart' || kind === 'sparkle' ? 1 : 0.4;
      p.x = x + Math.cos(a) * spread * Math.random();
      p.y = y + (Math.random() - 0.3) * spread;
      p.z = z + Math.sin(a) * spread * Math.random();
      const sp = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * sp * (1 - up * 0.5);
      p.vz = Math.sin(a) * sp * (1 - up * 0.5);
      p.vy = sp * up + (kind === 'dust' || kind === 'splash' || kind === 'goo' ? 2 : 0);
      p.max = p.life = kind === 'heart' ? 1.4 : kind === 'smoke' ? 1.2 : kind === 'fire' ? 0.7 : kind === 'star' ? 1.0 : 0.8;
      p.life *= 0.7 + Math.random() * 0.6;
      p.size = kind === 'fire' ? 0.28 : kind === 'smoke' ? 0.35 : kind === 'heart' ? 0.16 : kind === 'dust' ? 0.14 : 0.1;
      p.size *= 0.6 + Math.random() * 0.8;
      p.grav = kind === 'fire' || kind === 'smoke' || kind === 'heart' || kind === 'sparkle' ? -0.5 : kind === 'star' ? 0 : 9;
      _c.set(pal[(Math.random() * pal.length) | 0]);
      p.r = _c.r;
      p.g = _c.g;
      p.b = _c.b;
      p.spin = Math.random() * 6;
      this.parts.push(p);
    }
  }

  /** uma partícula com velocidade dada (jatos: sopro de fogo, spray) */
  emitVel(kind: FxKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, grav = 1, life = 0, size = 0): void {
    const n = this.parts.length;
    this.emit(kind, x, y, z, 1, 0.2, 0);
    if (this.parts.length === n) return;
    const p = this.parts[n];
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.grav = grav;
    if (life) p.life = p.max = life * (0.8 + Math.random() * 0.4);
    if (size) p.size = size * (0.7 + Math.random() * 0.6);
  }

  /** "puf" de desenho animado: anel de fumacinha + brilhos + estrelinhas */
  poof(x: number, y: number, z: number, size: number, color?: string): void {
    const n = Math.min(26, 8 + Math.round(size * 8));
    this.emit('smoke', x, y + size * 0.4, z, Math.ceil(n * 0.4), size * 0.6, 1.5 + size);
    this.emit('sparkle', x, y + size * 0.5, z, n, size * 0.5, 2.5 + size, color);
    this.emit('star', x, y + size * 0.6, z, 4, size * 0.3, 3);
  }

  telegraph(t: Omit<Telegraph, 'done' | 't'> & { t?: number }): Telegraph {
    const tt: Telegraph = { t: 0, ...t, done: false };
    this.tele.push(tt);
    return tt;
  }

  shoot(p: Omit<Projectile, 'col'> & { col: string }): Projectile {
    const pr: Projectile = { ...p, col: new THREE.Color(p.col) };
    this.proj.push(pr);
    return pr;
  }

  /** avança partículas e avisos (projéteis são movidos pelo gerente, que testa colisões) */
  update(dt: number): void {
    this.time += dt;
    this.uTime.value = this.time;
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        this.pool.push(p);
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const drag = 1 - dt * 0.9;
      p.vx *= drag;
      p.vz *= drag;
    }
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const t = this.tele[i];
      if (t.done) {
        this.tele.splice(i, 1);
        continue;
      }
      t.t += dt / t.dur;
      if (t.t >= 1) {
        t.done = true;
        t.onFire?.();
      }
    }
  }

  /** escreve as instâncias para desenhar */
  sync(): void {
    // partículas
    let pm = this.pMesh;
    if (this.parts.length > pm.instanceMatrix.count) {
      const nm = new THREE.InstancedMesh(pm.geometry, pm.material, this.parts.length * 2);
      nm.setColorAt(0, _c.set(1, 1, 1));
      nm.frustumCulled = false;
      nm.renderOrder = 3;
      this.group.remove(pm);
      this.group.add(nm);
      this.pMesh = pm = nm;
    }
    let n = 0;
    for (const p of this.parts) {
      const k = p.life / p.max;
      const s = p.size * (k < 0.3 ? k / 0.3 : 1) * (1 + (1 - k) * 0.4);
      _q.setFromEuler(_e.set(p.spin * k, p.spin * 2 * k, 0));
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      pm.setMatrixAt(n, _m);
      pm.setColorAt(n, _c.setRGB(p.r, p.g, p.b));
      n++;
    }
    pm.count = n;
    pm.visible = n > 0;
    pm.instanceMatrix.needsUpdate = true;
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    // avisos
    let tn = 0;
    const ta = this.tAttr.array as Float32Array;
    for (const t of this.tele) {
      if (tn >= 64) break;
      const kind = t.kind === 'circle' ? 0 : t.kind === 'cone' ? 1 : t.kind === 'line' ? 2 : 3;
      const yaw = t.yaw;
      if (t.kind === 'line') {
        // plano -1..1 → x: ±largura, z: 0..comprimento (desloca metade)
        _q.setFromEuler(_e.set(0, yaw, 0));
        _p.set(Math.sin(yaw) * t.size * 0.5, 0, Math.cos(yaw) * t.size * 0.5);
        _m.compose(_s.set(t.x + _p.x, t.y + 0.12, t.z + _p.z), _q, _p.set(t.width, 1, t.size * 0.5));
      } else {
        _q.setFromEuler(_e.set(0, yaw, 0));
        _m.compose(_p.set(t.x, t.y + 0.12, t.z), _q, _s.set(t.size, 1, t.size));
      }
      this.tMesh.setMatrixAt(tn, _m);
      ta[tn * 4] = kind;
      ta[tn * 4 + 1] = t.t;
      ta[tn * 4 + 2] = t.kind === 'cone' ? t.width : 0;
      ta[tn * 4 + 3] = t.kind === 'ring' ? 0.04 : 0;
      tn++;
    }
    this.tMesh.count = tn;
    this.tMesh.visible = tn > 0;
    this.tMesh.instanceMatrix.needsUpdate = true;
    this.tAttr.needsUpdate = true;
    // projéteis
    let pn = 0;
    for (const p of this.proj) {
      if (pn >= this.prMesh.instanceMatrix.count) break;
      _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(p.r, p.r, p.r));
      this.prMesh.setMatrixAt(pn, _m);
      this.prMesh.setColorAt(pn, p.col);
      pn++;
    }
    this.prMesh.count = pn;
    this.prMesh.visible = pn > 0;
    this.prMesh.instanceMatrix.needsUpdate = true;
    if (this.prMesh.instanceColor) this.prMesh.instanceColor.needsUpdate = true;
  }

  get particleCount(): number {
    return this.parts.length;
  }

  clear(): void {
    this.parts.length = 0;
    this.tele.length = 0;
    this.proj.length = 0;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of [this.pMesh, this.tMesh, this.prMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
