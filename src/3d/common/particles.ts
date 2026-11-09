/* ============================================================
 *  PARTÍCULAS 3D EM POOL (um único THREE.Points, sem alocação por quadro)
 *  Atlas 2×2 desenhado em canvas: 0 espuma/bolha, 1 brilho, 2 fumaça, 3 pedacinho.
 *  Tudo em Float32Array fixos; emitir quando cheio recicla a mais antiga.
 * ============================================================ */
import * as THREE from 'three';
import { canvas } from './tex';

export const enum PT {
  Foam = 0,
  Spark = 1,
  Smoke = 2,
  Chunk = 3,
}
export interface EmitOpts {
  tile?: PT;
  color?: string;
  life?: number;
  size?: number;
  grow?: number;
  grav?: number;
  /** arrasto (0 = nenhum) */
  drag?: number;
}
const C = new THREE.Color();
/** stride: x y z vx vy vz life max size grow grav drag r g b tile */
const S = 16;

function atlas(): THREE.CanvasTexture {
  const [cv, c] = canvas(128, 128);
  // 0 espuma: bolha com brilho
  let g = c.createRadialGradient(28, 28, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(32, 32, 30, 0, 7);
  c.fill();
  // 1 brilho: estrela de 4 pontas
  c.save();
  c.translate(96, 32);
  c.fillStyle = '#fff';
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const r = i % 2 ? 7 : 28;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.restore();
  // 2 fumaça: nuvem macia
  g = c.createRadialGradient(32, 96, 0, 32, 96, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 64, 64, 64);
  // 3 pedacinho: losango sólido
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(96, 74);
  c.lineTo(118, 96);
  c.lineTo(96, 118);
  c.lineTo(74, 96);
  c.closePath();
  c.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Particles {
  readonly obj: THREE.Points;
  private d: Float32Array;
  private n = 0;
  private head = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private tex: THREE.CanvasTexture;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private siz: THREE.BufferAttribute;
  private til: THREE.BufferAttribute;
  /** 0..1 — fração emitida (qualidade) */
  budget = 1;
  /** y do chão (partículas quicam) */
  floorY = 0.01;

  constructor(
    readonly max = 400,
    additive = false,
  ) {
    this.d = new Float32Array(max * S);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 4), 4);
    this.siz = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.til = new THREE.BufferAttribute(new Float32Array(max), 1);
    for (const a of [this.pos, this.col, this.siz, this.til]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('pcol', this.col);
    g.setAttribute('psize', this.siz);
    g.setAttribute('ptile', this.til);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.tex = atlas();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, scale: { value: 400 } },
      vertexShader: `attribute vec4 pcol; attribute float psize; attribute float ptile; uniform float scale; varying vec4 vC; varying float vT;
        void main(){ vC=pcol; vT=ptile; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; varying float vT;
        void main(){ vec2 o=vec2(mod(vT,2.0), floor(vT/2.0)); vec2 uv=(vec2(gl_PointCoord.x,1.0-gl_PointCoord.y)+o)*0.5; uv.y=1.0-uv.y; vec4 t=texture2D(map,uv); gl_FragColor=vec4(t.rgb*vC.rgb, t.a*vC.a); if(gl_FragColor.a<0.02) discard; }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.obj = new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: EmitOpts): void {
    let i: number;
    if (this.n < this.max) i = this.n++;
    else {
      i = this.head;
      this.head = (this.head + 1) % this.max;
    }
    const d = this.d;
    const b = i * S;
    const life = o.life ?? 0.8;
    C.set(o.color ?? '#ffffff');
    d[b] = x;
    d[b + 1] = y;
    d[b + 2] = z;
    d[b + 3] = vx;
    d[b + 4] = vy;
    d[b + 5] = vz;
    d[b + 6] = life;
    d[b + 7] = life;
    d[b + 8] = o.size ?? 0.08;
    d[b + 9] = o.grow ?? 0;
    d[b + 10] = o.grav ?? 0;
    d[b + 11] = o.drag ?? 0;
    d[b + 12] = C.r;
    d[b + 13] = C.g;
    d[b + 14] = C.b;
    d[b + 15] = o.tile ?? PT.Foam;
  }
  burst(x: number, y: number, z: number, n: number, kind: 'spark' | 'poof' | 'foam' | 'chunk' | 'steam' | 'flame', color = '#ffffff', speed = 1.5): void {
    const N = Math.max(1, Math.round(n * this.budget));
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283;
      const e = Math.random() * 2 - 0.3;
      const s = speed * (0.4 + Math.random() * 0.8);
      const vx = Math.cos(a) * s;
      const vz = Math.sin(a) * s;
      const vy = e * s;
      if (kind === 'spark') this.emit(x, y, z, vx, vy + 1, vz, { tile: PT.Spark, color, life: 0.5 + Math.random() * 0.4, size: 0.07, grav: 2 });
      else if (kind === 'poof') this.emit(x, y, z, vx * 0.6, Math.abs(vy) * 0.5 + 0.3, vz * 0.6, { tile: PT.Smoke, color, life: 0.7 + Math.random() * 0.3, size: 0.18, grow: 0.5 });
      else if (kind === 'foam') this.emit(x, y, z, vx * 0.3, Math.abs(vy) * 0.4, vz * 0.3, { tile: PT.Foam, color, life: 0.6 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.05, grow: 0.05, grav: -0.2 });
      else if (kind === 'steam') this.emit(x + vx * 0.05, y, z + vz * 0.05, vx * 0.08, 0.5 + Math.random() * 0.4, vz * 0.08, { tile: PT.Smoke, color, life: 1 + Math.random() * 0.6, size: 0.12, grow: 0.3 });
      else if (kind === 'flame') this.emit(x + vx * 0.08, y, z + vz * 0.08, vx * 0.1, 0.9 + Math.random() * 0.8, vz * 0.1, { tile: PT.Smoke, color, life: 0.45 + Math.random() * 0.3, size: 0.16, grow: -0.15 });
      else this.emit(x, y, z, vx, vy + 1.5, vz, { tile: PT.Chunk, color, life: 0.7, size: 0.04, grav: 9 });
    }
  }
  /** fov em graus, altura do canvas em px */
  update(dt: number, fov: number, heightPx: number): void {
    const d = this.d;
    const fy = this.floorY;
    let w = 0;
    // compacta em-lugar (copia registro vivo para a frente)
    for (let i = 0; i < this.n; i++) {
      const b = i * S;
      const life = d[b + 6] - dt;
      if (life <= 0) continue;
      d[b + 6] = life;
      d[b + 4] -= d[b + 10] * dt;
      const dr = d[b + 11];
      if (dr > 0) {
        const k = Math.max(0, 1 - dr * dt);
        d[b + 3] *= k;
        d[b + 4] *= k;
        d[b + 5] *= k;
      }
      d[b] += d[b + 3] * dt;
      d[b + 1] += d[b + 4] * dt;
      d[b + 2] += d[b + 5] * dt;
      if (d[b + 1] < fy) {
        d[b + 1] = fy;
        d[b + 4] *= -0.3;
        d[b + 3] *= 0.7;
        d[b + 5] *= 0.7;
      }
      d[b + 8] = Math.max(0.005, d[b + 8] + d[b + 9] * dt);
      if (w !== i) d.copyWithin(w * S, b, b + S);
      const o = w * S;
      this.pos.setXYZ(w, d[o], d[o + 1], d[o + 2]);
      this.col.setXYZW(w, d[o + 12], d[o + 13], d[o + 14], Math.min(1, (d[o + 6] / d[o + 7]) * 2));
      this.siz.setX(w, d[o + 8]);
      this.til.setX(w, d[o + 15]);
      w++;
    }
    this.n = w;
    this.head = 0;
    this.pos.needsUpdate = this.col.needsUpdate = this.siz.needsUpdate = this.til.needsUpdate = true;
    this.geo.setDrawRange(0, w);
    this.mat.uniforms.scale.value = heightPx / 2 / Math.tan((fov * Math.PI) / 360);
  }
  get count(): number {
    return this.n;
  }
  dispose(): void {
    this.obj.parent?.remove(this.obj);
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
