/* ============================================================
 *  ANOMALIAS — peças comuns dos modos extras (Recepção / Corredor):
 *   · Walker: andar em 1ª pessoa com a "sensação Cozinha" (velocidade
 *     suavizada que acelera/freia, balanço de cabeça + leve rolagem),
 *     colisão por caixas (slide do núcleo).
 *   · makeRenderer / snap: renderer no padrão do núcleo e foto pequena
 *     (render target → dataURL) para recap / dica.
 *   · ModeRun: o que o AnomaliasGame precisa de cada modo.
 * ============================================================ */
import * as THREE from 'three';
import { settingsFor, type Tier } from '../../../core/quality';
import type { FpsControls } from '../../../ui/touch';
import type { Box } from '../core/world';
import { AabbCollider, FpCamera, FpController, fpTuning } from '../../../3d/fpkit';
import type { ModeUi } from './ui';

export interface ModeRun {
  readonly ui: ModeUi;
  start(): void;
  readonly inMatch: boolean;
  readonly panelOpen: boolean;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function makeRenderer(host: HTMLElement, tier: Tier): THREE.WebGLRenderer {
  const s = settingsFor(tier);
  const r = new THREE.WebGLRenderer({ antialias: s.antialias && tier >= 2, powerPreference: 'high-performance', stencil: false });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.pr3d));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.className = 'ano-canvas';
  host.appendChild(r.domElement);
  return r;
}

/** foto pequena de uma cena (não mexe na tela) */
export function snap(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w = 192, h = 128, q = 0.8): string {
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(w * h * 4);
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt);
  r.render(scene, cam);
  r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  r.setRenderTarget(prev);
  rt.dispose();
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  x.putImageData(img, 0, 0);
  return cv.toDataURL('image/jpeg', q);
}

export const EYE_H = 1.55;

/**
 * andar em 1ª pessoa com o kit compartilhado (src/3d/fpkit — o "feel" da Cozinha), preset indoor.
 * Colisão: AabbCollider com o filtro de altura do núcleo (0,15–1,7 m). API pequena para os modos.
 */
export class Walker {
  readonly fp: FpController;
  readonly cam: FpCamera;
  private col = new AabbCollider();
  private colSrc: Box[] | null = null;
  private stepAcc = 0;
  /** giro automático (botão "voltar"): radianos que faltam */
  turnLeft = 0;
  constructor(speed = 2.9) {
    const tune = fpTuning('indoor', { speed, eye: EYE_H, pitchMin: -1.2, pitchMax: 1.05 });
    this.col.y0 = 0.15;
    this.col.y1 = 1.7;
    this.fp = new FpController(tune, this.col);
    this.cam = new FpCamera(tune);
  }
  get x(): number {
    return this.fp.x;
  }
  set x(v: number) {
    this.fp.x = v;
  }
  get z(): number {
    return this.fp.z;
  }
  set z(v: number) {
    this.fp.z = v;
  }
  get vx(): number {
    return this.fp.vx;
  }
  set vx(v: number) {
    this.fp.vx = v;
  }
  get vz(): number {
    return this.fp.vz;
  }
  set vz(v: number) {
    this.fp.vz = v;
  }
  get yaw(): number {
    return this.cam.yaw;
  }
  set yaw(v: number) {
    this.cam.yaw = v;
  }
  get pitch(): number {
    return this.cam.pitch;
  }
  set pitch(v: number) {
    this.cam.pitch = v;
  }
  get speedK(): number {
    return this.fp.speedK;
  }
  set speed(v: number) {
    this.fp.tune.speed = v;
  }

  /** devolve true quando deu um passo (som) */
  update(dt: number, ctl: FpsControls | null, cols: Box[]): boolean {
    if (cols !== this.colSrc) {
      this.colSrc = cols;
      this.col.boxes = cols.map((b) => ({ x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, y0: b.min.y, y1: b.max.y }));
    }
    let mx = 0,
      my = 0;
    if (ctl) {
      const [lx, ly] = ctl.consumeLook(dt);
      this.cam.look(lx, ly);
      [mx, my] = ctl.dir();
    }
    if (this.turnLeft !== 0) {
      const s = Math.sign(this.turnLeft) * Math.min(Math.abs(this.turnLeft), dt * 5.2);
      this.cam.yaw += s;
      this.turnLeft -= s;
      this.cam.pitch *= 1 - Math.min(1, dt * 4);
    }
    const ox = this.fp.x,
      oz = this.fp.z;
    this.fp.steer(dt, mx, my, this.cam.yaw);
    this.fp.move(dt);
    this.stepAcc += Math.hypot(this.fp.x - ox, this.fp.z - oz);
    if (this.stepAcc > 0.7) {
      this.stepAcc = 0;
      return true;
    }
    return false;
  }
  apply(cam: THREE.PerspectiveCamera, extraRoll = 0): void {
    this.cam.extraRoll = extraRoll;
    this.cam.apply(cam, this.lastDt, this.fp, this.col);
  }
  lastDt = 1 / 60;
}

/** materiais simples em cache por cor (o modo descarta tudo no fim) */
export class Mats {
  private m = new Map<string, THREE.Material>();
  lam(col: THREE.ColorRepresentation, emissive = 0, map?: THREE.Texture | null): THREE.MeshLambertMaterial {
    const k = 'l' + String(col) + emissive + (map?.uuid ?? '');
    let x = this.m.get(k) as THREE.MeshLambertMaterial | undefined;
    if (!x) {
      x = new THREE.MeshLambertMaterial({ color: col, map: map ?? null });
      if (emissive) x.emissive.set(col).multiplyScalar(emissive);
      this.m.set(k, x);
    }
    return x;
  }
  basic(col: THREE.ColorRepresentation, map?: THREE.Texture | null, transparent = false): THREE.MeshBasicMaterial {
    const k = 'b' + String(col) + (map?.uuid ?? '') + transparent;
    let x = this.m.get(k) as THREE.MeshBasicMaterial | undefined;
    if (!x) {
      x = new THREE.MeshBasicMaterial({ color: col, map: map ?? null, transparent, fog: true });
      this.m.set(k, x);
    }
    return x;
  }
  /** material novo (não compartilhado) — para anomalias que mudam cor */
  own<T extends THREE.Material>(m: T): T {
    this.m.set('own' + m.uuid, m);
    return m;
  }
  dispose(): void {
    this.m.forEach((m) => m.dispose());
    this.m.clear();
  }
}

/** libera geometrias/texturas próprias de um grupo (as de cache do núcleo ficam) */
export function disposeTree(o: THREE.Object3D, keep: Set<THREE.BufferGeometry> = new Set()): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && !keep.has(m.geometry)) m.geometry.dispose();
  });
}

/** textura de canvas desenhada na hora (sem cache) */
export function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** sombra de contato (disco escuro com borda suave) */
let blobTex: THREE.CanvasTexture | null = null;
export function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  blobTex = canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,.75)');
    g.addColorStop(0.6, 'rgba(0,0,0,.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });
  return blobTex;
}
export function disposeCommon(): void {
  blobTex?.dispose();
  blobTex = null;
}
