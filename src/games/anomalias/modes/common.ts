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
import { slide, type Box } from '../core/world';
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

/** andar em 1ª pessoa — mesma sensação da Cozinha (render3d.ts): acelera ~10/s, freia ~14/s, bob ×9 */
export class Walker {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  vx = 0;
  vz = 0;
  speedK = 0;
  private bob = 0;
  private stepAcc = 0;
  speed = 3.0;
  r = 0.3;
  /** giro automático (botão "voltar"): radianos que faltam */
  turnLeft = 0;

  /** devolve true quando deu um passo (som) */
  update(dt: number, ctl: FpsControls | null, cols: Box[], lock = false): boolean {
    let mx = 0,
      my = 0;
    if (ctl && !lock) {
      const [lx, ly] = ctl.consumeLook(dt);
      this.yaw -= lx;
      this.pitch = Math.max(-1.2, Math.min(1.05, this.pitch - ly));
      [mx, my] = ctl.dir();
    }
    if (this.turnLeft !== 0) {
      const s = Math.sign(this.turnLeft) * Math.min(Math.abs(this.turnLeft), dt * 5.2);
      this.yaw += s;
      this.turnLeft -= s;
      this.pitch *= 1 - Math.min(1, dt * 4);
    }
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    const sp = this.speed;
    const tvx = (fx * my + rx * mx) * sp;
    const tvz = (fz * my + rz * mx) * sp;
    const k = mx || my ? 10 : 14;
    this.vx += (tvx - this.vx) * Math.min(1, dt * k);
    this.vz += (tvz - this.vz) * Math.min(1, dt * k);
    const ox = this.x,
      oz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    slide(this, this.r, cols);
    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.speedK = Math.min(1, moved / Math.max(1e-4, dt) / sp);
    this.bob += dt * 9 * this.speedK;
    this.stepAcc += moved;
    if (this.stepAcc > 0.7) {
      this.stepAcc = 0;
      return true;
    }
    return false;
  }
  apply(cam: THREE.PerspectiveCamera, eye = EYE_H, shake = 0): void {
    const bobY = Math.sin(this.bob * 2) * 0.025 * this.speedK;
    const roll = Math.cos(this.bob) * 0.008 * this.speedK;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + sy * 0.5, this.yaw + sx * 0.5, roll);
    cam.position.set(this.x + sx, eye + bobY + sy, this.z);
    cam.updateMatrixWorld();
  }
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
