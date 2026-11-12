/* ============================================================
 *  BLOOP PINK — o prédio da loja e a rua.
 *  O prédio vai de x=-9 a 9 (3 portas na rua) e a loja CRESCE dentro dele (grow.ts):
 *  garagem 5×6 m com portão de enrolar → sala dos fundos → salas dos lados → estoque com
 *  doca (porta de enrolar no beco, z=-16) → ampliação lateral → salão gigante.
 *  O que já foi comprado mas não aberto fica atrás da parede quebrável (rachaduras);
 *  salas que não são da loja aparecem fechadas com porta de aço + placa "aluga-se".
 *  Estado quebrado → reformado é aplicado por partes (paredes, vitrine, piso, placa, luz).
 * ============================================================ */
import * as THREE from 'three';
import type { FpBox } from '../../3d/fpkit';
import { brandCanvas, drawBrandLogo, PINK } from './brand';
import { PAINTS, type FloorId, type SignId } from './data';
import type { Kit } from './mats';
import { Builder, rbox, uvMeters } from './shapes';
import { buildFurniture } from './furniture';
import { productMesh } from './products';
import { PRODUCTS } from './catalog';
import { ownedStage, pendingWall, stageOf, STAGES, Z_BACK, type GrowState, type Seg, type Stage } from './grow';

export const LAY = {
  zBack: Z_BACK,
  H: 3.4,
  door: 0.95,
  part: [2.3, 4.3] as [number, number],
  backDoor: 1.6,
};
export interface Renov extends GrowState {
  walls: boolean;
  paint: string;
  window: boolean;
  door: boolean;
  floor: FloorId;
  sign: SignId;
  light: number;
  /** antigo (0..2) — só para migrar saves */
  exp?: number;
}
export const RENOV0: Renov = { walls: false, paint: 'blush', window: false, door: false, floor: 'broken', sign: 'none', light: 0, sz: 0, op: 0, hits: 0, own: false };

/** limites do salão de vendas aberto */
export function floorBounds(r: GrowState): { x0: number; x1: number; zB: number; stock: boolean; garage: boolean } {
  const s = stageOf(r);
  return { x0: s.x0, x1: s.x1, zB: s.zB, stock: s.stock, garage: r.op <= 1 };
}
/** retângulo novo (comprado e ainda fechado) */
function diffRect(S: Stage, O: Stage): { x0: number; x1: number; z0: number; z1: number } | null {
  if (S === O) return null;
  const zEnd = S.stock ? Z_BACK : S.zB;
  if (S.x0 < O.x0) return { x0: S.x0, x1: O.x0, z0: zEnd, z1: 0 };
  if (S.x1 > O.x1) return { x0: O.x1, x1: S.x1, z0: zEnd, z1: 0 };
  if (S.zB < O.zB) return { x0: S.x0, x1: S.x1, z0: S.zB, z1: O.zB };
  if (S.stock && !O.stock) return { x0: S.x0, x1: S.x1, z0: Z_BACK, z1: S.zB };
  return null;
}

const T = 0.2; // espessura das paredes
/** portaria do prédio onde o dono mora */
export const APT_DOOR = { x: 10.6, z: 0 };

function signCanvas(kind: SignId, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const lh = h * 0.62;
  if (kind === 'simple') {
    x.fillStyle = '#fff3f7';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = PINK.rose;
    x.lineWidth = h * 0.05;
    x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    drawBrandLogo(x, w / 2, h / 2, lh);
  } else if (kind === 'box') {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff8cc0');
    g.addColorStop(1, '#ff5fa2');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    drawBrandLogo(x, w / 2, h / 2, lh, { light: true, color: '#ffffff' });
  } else if (kind === 'neon') {
    x.fillStyle = '#1e1020';
    x.fillRect(0, 0, w, h);
    drawBrandLogo(x, w / 2, h / 2, lh, { light: true, glow: 1.2, color: '#ff4fa0' });
    drawBrandLogo(x, w / 2, h / 2, lh, { light: true, glow: 0.6, color: '#ff4fa0' });
  } else if (kind === 'gold') {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#f6efe9');
    g.addColorStop(1, '#e9ddd4');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.save();
    x.shadowColor = 'rgba(80,50,10,.45)';
    x.shadowBlur = h * 0.06;
    x.shadowOffsetY = h * 0.03;
    drawBrandLogo(x, w / 2, h / 2, lh, { color: '#d9a85a' });
    x.restore();
  } else if (kind === 'flowers') {
    x.fillStyle = '#4f7a3a';
    x.fillRect(0, 0, w, h);
    const R = (n: number) => ((Math.sin(n * 91.7) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 900; i++) {
      x.fillStyle = ['#ff9ac4', '#ffffff', '#ff5fa2', '#ffd3e6', '#6aa84f', '#8fcf6a'][Math.floor(R(i) * 6)];
      x.beginPath();
      x.arc(R(i + 0.3) * w, R(i + 0.7) * h, h * (0.02 + R(i + 0.9) * 0.03), 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.beginPath();
    x.roundRect(w * 0.18, h * 0.16, w * 0.64, h * 0.68, h * 0.2);
    x.fill();
    drawBrandLogo(x, w / 2, h / 2, lh * 0.8, { glow: 0.5 });
  } else {
    // sem placa: chapa velha, furos de parafuso e marcas das letras antigas
    x.fillStyle = '#8a8076';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(${60 + Math.random() * 60},${50 + Math.random() * 40},${40},${Math.random() * 0.25})`;
      x.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    x.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 0; i < 6; i++) x.fillRect(w * 0.15 + i * w * 0.12, h * 0.3, w * 0.07, h * 0.4);
    x.fillStyle = '#3a302a';
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.arc(w * 0.17 + (i % 6) * w * 0.12, i < 6 ? h * 0.28 : h * 0.72, 4, 0, Math.PI * 2);
      x.fill();
    }
  }
  return c;
}

function windowsCanvas(base: string, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 3; k++) {
      const wx = 24 + k * 78;
      const wy = 20 + r * 80;
      x.fillStyle = '#e8e2da';
      x.fillRect(wx - 4, wy - 4, 58, 62);
      const lit = Math.sin(seed * 13 + r * 7 + k * 3) > 0.3;
      const g = x.createLinearGradient(wx, wy, wx + 50, wy + 54);
      g.addColorStop(0, lit ? '#ffe9b8' : '#7a9ab8');
      g.addColorStop(1, lit ? '#e8b878' : '#3a5068');
      x.fillStyle = g;
      x.fillRect(wx, wy, 50, 54);
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillRect(wx + 24, wy, 2, 54);
      x.fillRect(wx, wy + 26, 50, 2);
    }
  return c;
}
function iconSignCanvas(kind: 'cup' | 'flower' | 'book' | 'bread', bg: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#fff';
  x.strokeStyle = '#fff';
  x.lineWidth = 5;
  const cx = 128;
  const cy = 32;
  if (kind === 'cup') {
    x.fillRect(cx - 18, cy - 14, 30, 28);
    x.beginPath();
    x.arc(cx + 14, cy, 9, -1.5, 1.5);
    x.stroke();
  } else if (kind === 'flower') {
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.arc(cx + Math.cos(i * 1.256) * 12, cy + Math.sin(i * 1.256) * 12, 9, 0, 7);
      x.fill();
    }
    x.fillStyle = '#ffd84a';
    x.beginPath();
    x.arc(cx, cy, 7, 0, 7);
    x.fill();
  } else if (kind === 'book') {
    x.fillRect(cx - 24, cy - 16, 22, 32);
    x.fillRect(cx + 2, cy - 16, 22, 32);
  } else {
    x.beginPath();
    x.ellipse(cx, cy, 30, 15, 0, 0, 7);
    x.fill();
    x.strokeStyle = bg;
    for (let i = -1; i <= 1; i++) {
      x.beginPath();
      x.moveTo(cx + i * 12 - 4, cy - 9);
      x.lineTo(cx + i * 12 + 4, cy + 9);
      x.stroke();
    }
  }
  return c;
}
function rentCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffe14a';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#2a2a2a';
  x.lineWidth = 8;
  x.strokeRect(6, 6, 244, 116);
  // ícone: casinha + chave
  x.fillStyle = '#2a2a2a';
  x.beginPath();
  x.moveTo(60, 30);
  x.lineTo(100, 62);
  x.lineTo(20, 62);
  x.fill();
  x.fillRect(32, 62, 56, 40);
  x.beginPath();
  x.arc(170, 64, 22, 0, 7);
  x.lineWidth = 10;
  x.stroke();
  x.fillRect(188, 60, 50, 9);
  x.fillRect(222, 60, 9, 22);
  return c;
}

function poolCanvas(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},.42)`);
  g.addColorStop(0.45, `rgba(${rgb},.16)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return c;
}
function washCanvas(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  // cone de luz de spot na parede: forte em cima, some para baixo
  const g = x.createRadialGradient(32, 0, 2, 32, 10, 110);
  g.addColorStop(0, `rgba(${rgb},.5)`);
  g.addColorStop(0.5, `rgba(${rgb},.14)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 128);
  return c;
}

function crackCanvas(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  void seed;
  return c;
}
/** desenha rachaduras proporcionais a k (0..1) — sempre as mesmas (semente fixa) */
function drawCracks(c: HTMLCanvasElement, k: number): void {
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, c.width, c.height);
  if (k <= 0) return;
  let s = 7;
  const R = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const n = Math.ceil(k * 14);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    // marca do golpe + raios
    const cx = 60 + R() * 392;
    const cy = 50 + R() * 170;
    x.fillStyle = 'rgba(60,45,40,.55)';
    x.beginPath();
    x.ellipse(cx, cy, 10 + R() * 10, 7 + R() * 8, R() * 3, 0, 7);
    x.fill();
    x.fillStyle = 'rgba(150,90,70,.7)';
    x.beginPath();
    x.ellipse(cx + 2, cy + 1, 5 + R() * 6, 4 + R() * 4, R() * 3, 0, 7);
    x.fill();
    const rays = 4 + Math.floor(R() * 4);
    for (let r = 0; r < rays; r++) {
      let a = R() * Math.PI * 2;
      let px = cx;
      let py = cy;
      x.strokeStyle = 'rgba(70,55,50,.75)';
      x.lineWidth = 1.8;
      x.beginPath();
      x.moveTo(px, py);
      const len = 30 + R() * 70 * (0.5 + k);
      for (let d = 0; d < len; d += 9) {
        a += (R() - 0.5) * 0.8;
        px += Math.cos(a) * 9;
        py += Math.sin(a) * 9;
        x.lineTo(px, py);
      }
      x.stroke();
      x.lineWidth = 0.8;
      x.strokeStyle = 'rgba(255,255,255,.3)';
      x.stroke();
    }
  }
  // buracos que mostram o tijolo
  if (k > 0.55) {
    const m = Math.floor((k - 0.5) * 10);
    for (let i = 0; i < m; i++) {
      const cx = 90 + R() * 330;
      const cy = 70 + R() * 120;
      x.fillStyle = '#8a4a36';
      x.beginPath();
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2;
        const rr = 16 + R() * 18;
        x.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
      }
      x.fill();
      x.strokeStyle = '#c8a090';
      x.lineWidth = 2;
      for (let j = -1; j <= 1; j++) {
        x.beginPath();
        x.moveTo(cx - 24, cy + j * 9);
        x.lineTo(cx + 24, cy + j * 9);
        x.stroke();
      }
    }
  }
}

export interface BreakWall {
  seg: Seg;
  y1: number;
  /** caixa para mirar */
  box: THREE.Box3;
}

export class Store3D {
  readonly root = new THREE.Group();
  private outside = new THREE.Group();
  private shell = new THREE.Group();
  private facade = new THREE.Group();
  private signG = new THREE.Group();
  private lightsG = new THREE.Group();
  private floorG = new THREE.Group();
  colliders: FpBox[] = [];
  physBoxes: [number, number, number, number, number, number][] = [];
  wallMat!: THREE.MeshStandardMaterial;
  private doorL: THREE.Object3D | null = null;
  private doorR: THREE.Object3D | null = null;
  private garage: THREE.Object3D | null = null;
  private doorOpen = 0;
  /** chama quando portas/colisores mudaram (a loja refaz colisão e física) */
  onRebuilt: (() => void) | null = null;
  private flick: THREE.MeshStandardMaterial | null = null;
  private shutter: THREE.Object3D | null = null;
  shutterOpen = 0;
  private r: Renov = { ...RENOV0 };
  /** fachada aberta (centro e largura da parte da loja na rua) — placa, toldo, foto */
  front = { x0: -5, x1: 5 };
  /** parede para quebrar (comprou a sala do lado) */
  brk: BreakWall | null = null;
  private crackCv: HTMLCanvasElement | null = null;
  private crackTex: THREE.CanvasTexture | null = null;
  private lastKey = '';
  /** placa da porta: ABERTO / FECHADO (vira) */
  private doorSign: THREE.Object3D | null = null;
  private signFlip = 0;
  signOpen = false;

  constructor(private kit: Kit) {
    this.root.add(this.outside, this.shell, this.facade, this.signG, this.lightsG, this.floorG);
    this.buildOutside();
  }

  apply(r: Renov): void {
    const key = JSON.stringify({ ...r, hits: 0 });
    if (key === this.lastKey) {
      // só mais uma marretada: atualiza as rachaduras (sem refazer o prédio)
      this.r = { ...r };
      this.setCracks();
      return;
    }
    this.lastKey = key;
    this.r = { ...r };
    for (const g of [this.shell, this.facade, this.signG, this.lightsG, this.floorG]) {
      for (const c of [...g.children]) {
        c.removeFromParent();
        c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
    }
    this.colliders = [];
    this.physBoxes = [];
    this.brk = null;
    this.doorL = this.doorR = this.garage = this.shutter = this.doorSign = null;
    this.buildShell();
    this.buildFacade();
    this.buildSign();
    this.buildLights();
    this.buildFloor();
    this.onRebuilt?.();
  }

  private wall(b: Builder, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = LAY.H, collide = true): void {
    const w = Math.max(T, Math.abs(x1 - x0));
    const d = Math.max(T, Math.abs(z1 - z0));
    const h = y1 - y0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    b.addW(new THREE.BoxGeometry(w, h, d), mat, cx, y0 + h / 2, cz);
    if (collide && y0 < 1.6) {
      this.colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
      this.physBoxes.push([cx, y0 + h / 2, cz, w / 2, h / 2, d / 2]);
    }
  }
  /* ------------------------------ rua (fixa) ------------------------------ */
  private buildOutside(): void {
    const k = this.kit;
    const b = new Builder();
    const side = k.surf('sidewalk', 'sidewalk', { rough: 1, envK: 0.3 });
    const asph = k.surf('asphalt', 'asphalt', { rough: 1, envK: 0.25 });
    const curb = k.surf('curb', 'concrete', { rough: 1, color: '#d8d4ce' });
    const brick = k.surf('brick', 'brick', { rough: 1, envK: 0.2 });
    // calçada da frente e do outro lado
    b.addW(new THREE.BoxGeometry(44, 0.15, 4.2), side, 0, -0.075, 2.1);
    b.addW(new THREE.BoxGeometry(44, 0.15, 4), side, 0, -0.075, 13.4);
    b.addW(rbox(44, 0.18, 0.22, 0.04, 2), curb, 0, -0.06, 4.2);
    b.addW(rbox(44, 0.18, 0.22, 0.04, 2), curb, 0, -0.06, 11.4);
    // rua
    b.addW(new THREE.BoxGeometry(44, 0.1, 7.2), asph, 0, -0.2, 7.8);
    const lineM = k.plain('roadLine', '#f3f0e6', 0.8);
    for (let i = -10; i <= 10; i++) b.add(new THREE.BoxGeometry(1.6, 0.012, 0.14), lineM, i * 2.4, -0.145, 7.8);
    // faixa de pedestres
    for (let i = 0; i < 7; i++) b.add(new THREE.BoxGeometry(0.5, 0.012, 6.4), lineM, -11.5 + i * 0.9, -0.145, 7.8);
    // beco dos fundos
    b.addW(new THREE.BoxGeometry(30, 0.1, 11), asph, 0, -0.05, -21.6);
    // prédios vizinhos (frente)
    const nb = (x0: number, x1: number, col: string, icon: 'cup' | 'flower' | 'book' | 'bread', awn: string, seed: number) => {
      const w = x1 - x0;
      const cx = (x0 + x1) / 2;
      const plaster = k.surf('nb' + seed, 'plaster', { color: col, rough: 1, envK: 0.2 });
      b.addW(new THREE.BoxGeometry(w, 7.5, 0.3), plaster, cx, 3.75, -0.15);
      b.addW(new THREE.BoxGeometry(w, 7.5, 16), brick, cx, 3.75, -8.3);
      const win = k.canvasMat('nbw' + seed, windowsCanvas(col, seed), { rough: 0.6 });
      b.add(new THREE.PlaneGeometry(w - 0.6, 3.6), win, cx, 5.4, 0.011);
      // vitrine escura + toldo + plaquinha de ícone
      b.add(new THREE.PlaneGeometry(w - 1.4, 2.2), k.glass('nbGlass', '#4a6070', 0.85), cx, 1.4, 0.02);
      b.add(rbox(w - 1.2, 0.12, 0.12, 0.03, 1), k.plain('nbFrame', '#3a3a40', 0.5), cx, 2.55, 0.06);
      const awM = k.plain('awn' + seed, awn, 0.8, 0, { side: THREE.DoubleSide });
      const aw = new THREE.PlaneGeometry(w - 1, 1.3, 1, 1);
      b.add(aw, awM, cx, 2.95, 0.6, -1.05);
      b.add(new THREE.PlaneGeometry(1.6, 0.4), k.canvasMat('nbs' + seed, iconSignCanvas(icon, awn)), cx, 3.5, 0.012);
    };
    nb(-21, -9, '#e9d8c4', 'cup', '#3a7a5a', 1);
    // prédio de apartamentos do dono (mesma quadra): portaria à esquerda, floricultura à direita
    {
      const x0 = 9;
      const x1 = 21;
      const w = x1 - x0;
      const cx = (x0 + x1) / 2;
      const col = '#d9e4ea';
      const plaster = k.surf('nb2', 'plaster', { color: col, rough: 1, envK: 0.2 });
      b.addW(new THREE.BoxGeometry(w, 10.5, 0.3), plaster, cx, 5.25, -0.15);
      b.addW(new THREE.BoxGeometry(w, 10.5, 16), brick, cx, 5.25, -8.3);
      b.add(new THREE.PlaneGeometry(w - 0.6, 6.4), k.canvasMat('aptw', windowsCanvas(col, 22), { rough: 0.6 }), cx, 6.9, 0.011);
      // portaria: porta de madeira com vidro, marquise e número
      const dx = APT_DOOR.x;
      b.add(rbox(1.5, 2.5, 0.14, 0.03, 2), k.plain('aptFrame', '#5a4636', 0.5), dx, 1.25, 0.05);
      b.add(rbox(1.2, 2.3, 0.06, 0.02, 2), k.surf('aptDoor', 'wood', { rough: 0.7, color: '#a8744a' }), dx, 1.17, 0.11);
      b.add(new THREE.PlaneGeometry(0.7, 1.0), k.glass('aptGlass', '#cfe4f0', 0.5), dx, 1.55, 0.145);
      b.add(rbox(0.05, 0.3, 0.05, 0.02, 1), k.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 }), dx + 0.45, 1.1, 0.16);
      b.add(rbox(2.0, 0.12, 0.9, 0.03, 2), k.plain('aptCanopy', '#2c2a30', 0.4, 0.4), dx, 2.7, 0.45);
      const nc = document.createElement('canvas');
      nc.width = 128;
      nc.height = 64;
      const nx = nc.getContext('2d')!;
      nx.fillStyle = '#2a3a5a';
      nx.fillRect(0, 0, 128, 64);
      nx.fillStyle = '#fff';
      nx.font = '800 44px sans-serif';
      nx.textAlign = 'center';
      nx.fillText('42', 64, 48);
      b.add(new THREE.PlaneGeometry(0.4, 0.2), k.canvasMat('aptNum', nc), dx, 2.95, 0.13);
      b.add(rbox(0.18, 0.28, 0.04, 0.02, 1), k.plain('intercom', '#c8ccd4', 0.35, 0.6), dx + 0.95, 1.35, 0.06);
      // floricultura no térreo
      b.add(new THREE.PlaneGeometry(w - 4, 2.2), k.glass('nbGlass', '#4a6070', 0.85), cx + 1.5, 1.4, 0.02);
      b.add(rbox(w - 3.8, 0.12, 0.12, 0.03, 1), k.plain('nbFrame', '#3a3a40', 0.5), cx + 1.5, 2.55, 0.06);
      const awM = k.plain('awn2', '#c85a6a', 0.8, 0, { side: THREE.DoubleSide });
      b.add(new THREE.PlaneGeometry(w - 3.6, 1.3, 1, 1), awM, cx + 1.5, 2.95, 0.6, -1.05);
      b.add(new THREE.PlaneGeometry(1.6, 0.4), k.canvasMat('nbs2', iconSignCanvas('flower', '#c85a6a')), cx + 1.5, 3.5, 0.012);
    }
    // prédios do outro lado da rua
    const cols = ['#e8d0b8', '#c8d8e0', '#f0e0d0', '#d8c8e8', '#e0e8d0'];
    for (let i = 0; i < 5; i++) {
      const cx = -18 + i * 9;
      if (i === 2) {
        this.buildBank(b, cx);
        continue;
      }
      const plaster = k.surf('far' + i, 'plaster', { color: cols[i], rough: 1, envK: 0.2 });
      b.addW(new THREE.BoxGeometry(8.6, 9, 6), plaster, cx, 4.5, 18.4);
      b.add(new THREE.PlaneGeometry(8, 6), k.canvasMat('farw' + i, windowsCanvas(cols[i], i + 7), { rough: 0.6 }), cx, 5.6, 15.39, 0, Math.PI, 0);
      b.add(new THREE.PlaneGeometry(6.6, 2.2), k.glass('nbGlass', '#4a6070', 0.85), cx, 1.4, 15.38, 0, Math.PI, 0);
      b.add(new THREE.PlaneGeometry(1.6, 0.4), k.canvasMat('fars' + i, iconSignCanvas((['book', 'bread', 'cup', 'flower', 'book'] as const)[i], ['#5a7ab8', '#c87a3a', '#3a7a5a', '#c85a6a', '#7a5ab8'][i])), cx, 2.9, 15.37, 0, Math.PI, 0);
    }
    // fundos: muro do beco
    b.addW(new THREE.BoxGeometry(30, 3, 0.3), brick, 0, 1.5, -27);
    // postes e árvores na calçada
    const pole = k.plain('pole', '#3a3d44', 0.5, 0.6);
    const lampM = k.plain('streetLamp', '#fff6e0', 0.4, 0, { emissive: '#ffe8b0', ei: 0.4 });
    for (const x of [-14, 14]) {
      b.add(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 10), pole, x, 2.75, 3.8);
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), pole, x, 5.4, 3.3, Math.PI / 2, 0, 0);
      b.add(rbox(0.5, 0.14, 0.26, 0.05, 2), lampM, x, 5.35, 2.75);
    }
    const trunk = k.plain('trunk', '#6a4a32', 0.9);
    const leafA = k.plain('treeLeaf', '#4a8a46', 0.8, 0, { envK: 0.3 });
    const leafB = k.plain('treeLeaf2', '#5aa056', 0.8, 0, { envK: 0.3 });
    for (const x of [-7.4, 7.4]) {
      b.add(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 8), trunk, x, 1.3, 3.4);
      b.add(new THREE.BoxGeometry(1.1, 0.04, 1.1), k.plain('treeGrate', '#2a2a2a', 0.6, 0.5), x, 0.02, 3.4);
      for (let i = 0; i < 7; i++) {
        const g = new THREE.IcosahedronGeometry(0.75 + (i % 3) * 0.15, 1);
        b.add(g, i % 2 ? leafA : leafB, x + Math.sin(i * 2.4) * 0.6, 3.0 + (i % 3) * 0.35, 3.4 + Math.cos(i * 2.4) * 0.6);
      }
    }
    // banco
    b.add(rbox(1.6, 0.06, 0.45, 0.02, 2), k.surf('benchWood', 'wood', { rough: 0.8 }), -11.5, 0.45, 3.3);
    b.add(rbox(1.6, 0.4, 0.06, 0.02, 2), k.surf('benchWood', 'wood', { rough: 0.8 }), -11.5, 0.7, 3.55);
    for (const s of [-1, 1]) b.add(rbox(0.06, 0.45, 0.4, 0.01, 1), pole, -11.5 + s * 0.7, 0.22, 3.3);
    // carros estacionados (blocos arredondados simples)
    const car = (x: number, col: string) => {
      const paint = k.plain('car' + col, col, 0.25, 0.4, { envK: 1.4 });
      b.add(rbox(4, 0.7, 1.8, 0.25, 3), paint, x, 0.55, 9.6);
      b.add(rbox(2.2, 0.6, 1.6, 0.25, 3), paint, x - 0.2, 1.15, 9.6);
      b.add(rbox(2.0, 0.45, 1.62, 0.18, 2), k.glass('carGlass', '#30404a', 0.85), x - 0.2, 1.17, 9.6);
      for (const sx of [-1.3, 1.3]) for (const sz of [-0.85, 0.85]) b.add(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16).rotateX(Math.PI / 2), k.plain('tire', '#1c1c1e', 0.85), x + sx, 0.33, 9.6 + sz);
    };
    car(-12, '#7ab8e8');
    car(13, '#f2f0ea');
    const g = b.build({ receive: true });
    this.outside.add(g);
    // colisão da rua: não sair do mapa
    // a rua é atravessável (banco do outro lado); limites: prédios da frente, carros, laterais
    this.outsideColliders = [
      { x0: -24, z0: 15.3, x1: 24, z1: 16 },
      { x0: -14.1, z0: 8.7, x1: -9.9, z1: 10.5 },
      { x0: 10.9, z0: 8.7, x1: 15.1, z1: 10.5 },
      { x0: -24, z0: -0.4, x1: -9, z1: 0.2 },
      { x0: 9, z0: -0.4, x1: 24, z1: 0.2 },
      { x0: -16, z0: -6, x1: -15.8, z1: 16 },
      { x0: 15.8, z0: -6, x1: 16, z1: 16 },
      { x0: -15, z0: -28, x1: 15, z1: -27 },
      { x0: -15.2, z0: -28, x1: -15, z1: -16 },
      { x0: 15, z0: -28, x1: 15.2, z1: -16 },
    ];
  }
  outsideColliders: FpBox[] = [];

  /** BANCO do outro lado da rua (depositar malote, pegar troco) */
  private buildBank(b: Builder, cx: number): void {
    const k = this.kit;
    const stone = k.surf('bankStone', 'plaster', { color: '#e8e4dc', rough: 1, envK: 0.3 });
    const marble = k.surf('bankMarble', 'marble', { rough: 0.6, envK: 1 });
    const dark = k.plain('bankDark', '#2a3a5a', 0.4, 0.3);
    b.addW(new THREE.BoxGeometry(8.6, 9, 6), stone, cx, 4.5, 18.4);
    b.add(new THREE.PlaneGeometry(8, 3.4), k.canvasMat('bankw', windowsCanvas('#e8e4dc', 31), { rough: 0.6 }), cx, 6.6, 15.39, 0, Math.PI, 0);
    // pórtico com colunas
    b.addW(new THREE.BoxGeometry(8.2, 0.5, 1.2), marble, cx, 4.25, 15.0);
    b.addW(new THREE.BoxGeometry(8.4, 0.25, 1.6), marble, cx, 0.12, 15.0);
    for (const x of [-3.4, -1.7, 1.7, 3.4]) {
      b.add(new THREE.CylinderGeometry(0.22, 0.26, 3.8, 16), marble, cx + x, 2.15, 14.75);
      b.add(new THREE.BoxGeometry(0.6, 0.18, 0.6), marble, cx + x, 4.0, 14.75);
    }
    // porta de vidro escura + caixa eletrônico
    b.add(new THREE.PlaneGeometry(2.4, 2.8), k.glass('bankGlass', '#3a5070', 0.8), cx, 1.65, 15.38, 0, Math.PI, 0);
    b.add(rbox(2.6, 0.12, 0.12, 0.03, 1), dark, cx, 3.08, 15.33);
    b.add(rbox(0.9, 1.7, 0.4, 0.06, 2), k.plain('atm', '#d8dce4', 0.35, 0.5, { envK: 1 }), cx + 2.55, 1.0, 15.2);
    b.add(new THREE.PlaneGeometry(0.5, 0.36), k.plain('atmScr', '#3ec9b4', 0.3, 0, { emissive: '#3ec9b4', ei: 0.6 }), cx + 2.55, 1.35, 14.99, 0, Math.PI, 0);
    // placa: prédio clássico + moeda (ícone, sem precisar ler) e nome
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 160;
    const x = c.getContext('2d')!;
    x.fillStyle = '#2a3a5a';
    x.fillRect(0, 0, 1024, 160);
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.moveTo(60, 70);
    x.lineTo(130, 30);
    x.lineTo(200, 70);
    x.fill();
    for (let i = 0; i < 4; i++) x.fillRect(72 + i * 34, 76, 16, 46);
    x.fillRect(60, 124, 140, 12);
    x.font = '800 92px sans-serif';
    x.textBaseline = 'middle';
    x.fillText('BANCO BLOOP', 240, 84);
    b.add(new THREE.PlaneGeometry(6, 0.94), k.canvasMat('bankSign', c, { emissive: 0.25, rough: 0.5 }), cx, 4.25, 14.39, 0, Math.PI, 0);
  }

  /* ------------------------------ paredes / teto / estoque ------------------------------ */
  private buildShell(): void {
    const k = this.kit;
    const r = this.r;
    const b = new Builder();
    const paint = PAINTS.find((p) => p.id === r.paint)?.c ?? '#f6f4f2';
    this.wallMat = r.walls ? k.surf('wallPaint', 'plaster', { color: paint, rough: 1, envK: 0.35 }) : k.surf('wallDirty', 'plasterDirty', { rough: 1, envK: 0.2 });
    if (r.walls) this.wallMat.color.set(paint);
    const brick = k.surf('brickIn', 'brick', { rough: 1, envK: 0.2 });
    const con = k.surf('concreteWall', 'concrete', { rough: 1, color: '#d8d4cf' });
    const S = ownedStage(r);
    const O = stageOf(r);
    const P = pendingWall(r);
    const x0 = S.x0;
    const x1 = S.x1;
    const zEnd = S.stock ? LAY.zBack : S.zB;
    const H = LAY.H;
    // paredes externas (tijolo) em volta de tudo que é da loja
    this.wall(b, brick, x0 - T / 2, zEnd, x0 - T / 2, 0);
    this.wall(b, brick, x1 + T / 2, zEnd, x1 + T / 2, 0);
    if (!S.stock) this.wall(b, brick, x0 - T, S.zB - T / 2, x1 + T, S.zB - T / 2);
    // camada pintada por dentro do salão aberto (menos onde está a parede quebrável)
    const inner = (xa: number, za: number, xb: number, zb: number) => b.addW(new THREE.BoxGeometry(Math.max(0.02, Math.abs(xb - xa)), H, Math.max(0.02, Math.abs(zb - za))), this.wallMat, (xa + xb) / 2, H / 2, (za + zb) / 2);
    const pw = P?.wall ?? null;
    const isP = (xa: number, za: number, xb: number, zb: number) => !!pw && Math.abs(pw.x0 - xa) < 0.01 && Math.abs(pw.x1 - xb) < 0.01 && Math.abs(pw.z0 - za) < 0.01 && Math.abs(pw.z1 - zb) < 0.01;
    if (!isP(O.x0, O.zB, O.x0, 0)) inner(O.x0 + 0.01, O.zB, O.x0 + 0.01, 0);
    if (!isP(O.x1, O.zB, O.x1, 0)) inner(O.x1 - 0.01, O.zB, O.x1 - 0.01, 0);
    if (!O.stock && !S.stock && !isP(O.x0, O.zB, O.x1, O.zB)) inner(O.x0, O.zB + 0.01, O.x1, O.zB + 0.01);
    if (O.stock) {
      // estoque aberto: parede pintada até o fundo dos dois lados
      inner(O.x0 + 0.01, LAY.zBack, O.x0 + 0.01, O.zB);
      inner(O.x1 - 0.01, LAY.zBack, O.x1 - 0.01, O.zB);
    }
    // parede quebrável (comprou e ainda não abriu)
    if (P && pw) this.buildBreakWall(pw, P === STAGES[4] ? 2.4 : H, brick);
    // vigas/colunas onde ficavam as paredes já quebradas
    const col = k.plain('column', '#f4efec', 0.4);
    for (let i = 1; i <= r.op; i++) {
      const w = STAGES[i].wall;
      if (!w || i === 4) continue;
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      const cx = (w.x0 + w.x1) / 2;
      const cz = (w.z0 + w.z1) / 2;
      const alongX = Math.abs(w.x1 - w.x0) > Math.abs(w.z1 - w.z0);
      b.add(rbox(alongX ? len : 0.3, 0.3, alongX ? 0.3 : len, 0.03, 2), col, cx, H - 0.15, cz);
      const zs = len > 13 ? [w.z0 + 0.2, -12.2, -6, -0.2] : len > 9 ? [-6] : [];
      for (const z of zs) {
        if (alongX) continue;
        b.add(rbox(0.4, H, 0.4, 0.04, 2), col, cx, H / 2, z);
        this.colliders.push({ x0: cx - 0.2, z0: z - 0.2, x1: cx + 0.2, z1: z + 0.2 });
        this.physBoxes.push([cx, H / 2, z, 0.2, H / 2, 0.2]);
      }
    }
    const [p0, p1] = LAY.part;
    if (S.stock) {
      // divisória salão/estoque (z=-12) com vão para o estoque
      this.wall(b, this.wallMat, x0, S.zB - T / 2, p0, S.zB - T / 2);
      this.wall(b, this.wallMat, p1, S.zB - T / 2, x1, S.zB - T / 2);
      this.wall(b, this.wallMat, p0, S.zB - T / 2, p1, S.zB - T / 2, 2.4, H, false);
      const frame = k.plain('doorFrame', '#e9e1dc', 0.4);
      for (const x of [p0, p1]) b.add(rbox(0.08, 2.4, 0.26, 0.02, 1), frame, x, 1.2, S.zB - T / 2);
      b.add(rbox(p1 - p0 + 0.08, 0.08, 0.26, 0.02, 1), frame, (p0 + p1) / 2, 2.42, S.zB - T / 2);
      // estoque: paredes de concreto e porta de enrolar nos fundos
      const bd = LAY.backDoor;
      this.wall(b, con, x0, LAY.zBack - T / 2, -bd, LAY.zBack - T / 2);
      this.wall(b, con, bd, LAY.zBack - T / 2, x1, LAY.zBack - T / 2);
      this.wall(b, con, -bd, LAY.zBack - T / 2, bd, LAY.zBack - T / 2, 2.8, H, false);
      // estante metálica e faixa amarela de descarga
      const rack = k.plain('rack', '#5a6a80', 0.5, 0.6);
      const rackW = k.plain('rackWood', '#c8a070', 0.8);
      const rx = -5;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.05, 2.4, 0.05), rack, rx + 0.4 + (sx + 1) * 1.1, 1.2, LAY.zBack + 0.5 + (sz + 1) * 0.25);
      for (const y of [0.3, 1.1, 1.9]) b.add(new THREE.BoxGeometry(2.3, 0.04, 0.6), rackW, rx + 1.5, y, LAY.zBack + 0.75);
      this.colliders.push({ x0: rx + 0.3, z0: LAY.zBack + 0.4, x1: rx + 2.7, z1: LAY.zBack + 1.1 });
      this.physBoxes.push([rx + 1.5, 1.2, LAY.zBack + 0.75, 1.2, 1.2, 0.35]);
      const yel = k.plain('yellow', '#f2c21a', 0.7);
      for (let i = 0; i < 2; i++) b.add(new THREE.BoxGeometry(3.4, 0.004, 0.08), yel, 0, 0.004, LAY.zBack + 0.4 + i * 2.6);
      // porta de enrolar (anima)
      const sh = new THREE.Mesh(new THREE.BoxGeometry(bd * 2, 2.8, 0.06), k.surf('shutterBack', 'shutter', { rough: 1, envK: 0.6, metal: 0.5 }));
      sh.position.set(0, 1.4, LAY.zBack - 0.05);
      this.shell.add(sh);
      this.shutter = sh;
    }
    if (r.walls) {
      // mural da marca na parede do fundo do salão
      const mural = k.canvasMat('mural', brandCanvas(1024, 256, { bg: '#00000000' }), { transparent: true, rough: 0.5 });
      const backPending = P === STAGES[1];
      const mw = Math.min(3.6, (S.stock ? p0 - O.x0 : O.x1 - O.x0) - 0.8);
      const mx = S.stock ? (O.x0 + p0) / 2 : (O.x0 + O.x1) / 2;
      if (!backPending && mw > 1.2) b.add(new THREE.PlaneGeometry(mw, mw / 4), mural, mx, 2.3, O.zB + (S.stock ? 0.012 : 0.032));
    }
    // rodapé e faixa de AO no encontro parede/chão (salão aberto)
    const ao = k.aoMat();
    const aoStrip = (xa: number, za: number, xb: number, zb: number, nx: number, nz: number) => {
      const len = Math.hypot(xb - xa, zb - za);
      const g = new THREE.PlaneGeometry(len, 0.35);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, ao);
      m.position.set((xa + xb) / 2 + nx * 0.175, 0.006, (za + zb) / 2 + nz * 0.175);
      m.rotation.y = Math.atan2(xb - xa, zb - za) - Math.PI / 2;
      m.renderOrder = -1;
      this.shell.add(m);
      const g2 = new THREE.PlaneGeometry(len, 0.5);
      const m2 = new THREE.Mesh(g2, ao);
      m2.rotation.y = Math.atan2(nx, nz);
      m2.rotation.z = Math.PI;
      m2.position.set((xa + xb) / 2 + nx * 0.012, 0.25, (za + zb) / 2 + nz * 0.012);
      this.shell.add(m2);
    };
    aoStrip(O.x0, O.zB, O.x0, 0, 1, 0);
    aoStrip(O.x1, O.zB, O.x1, 0, -1, 0);
    if (S.stock) {
      aoStrip(O.x0, O.zB, p0, O.zB, 0, 1);
      aoStrip(p1, O.zB, O.x1, O.zB, 0, 1);
    } else aoStrip(O.x0, O.zB, O.x1, O.zB, 0, 1);
    const skirt = k.plain('skirt', '#ffffff', 0.35);
    b.add(new THREE.BoxGeometry(0.02, 0.1, -O.zB), skirt, O.x0 + 0.03, 0.05, O.zB / 2);
    b.add(new THREE.BoxGeometry(0.02, 0.1, -O.zB), skirt, O.x1 - 0.03, 0.05, O.zB / 2);
    // teto
    const ceil = k.surf('ceiling', 'ceiling', { rough: 1, envK: 0.2 });
    ceil.emissive.set('#ffffff');
    ceil.emissiveIntensity = r.light >= 1 ? 0.32 : 0.12;
    ceil.emissiveMap = ceil.map;
    const cg = new THREE.PlaneGeometry(x1 - x0, -zEnd);
    cg.rotateX(Math.PI / 2);
    b.addW(cg, ceil, (x0 + x1) / 2, H, zEnd / 2);
    // laje acima do teto até a fachada (o prédio inteiro, x -9..9)
    b.addW(new THREE.BoxGeometry(18.4, 0.3, -LAY.zBack + 0.2), con, 0, H + 0.15, LAY.zBack / 2);
    if (!r.walls) {
      // placas do forro faltando + fios pendurados
      const hole = k.plain('ceilHole', '#141012', 1);
      const cxm = (O.x0 + O.x1) / 2;
      for (const [hx, hz] of [[-1.4, -2.6], [1.2, -4.4], [-0.6, O.zB * 0.8], [1.6, -1.4]]) b.add(new THREE.PlaneGeometry(0.6, 0.6).rotateX(Math.PI / 2), hole, cxm + hx, H - 0.005, hz);
      const wire = k.plain('wire', '#222', 0.6);
      b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), wire, cxm + 1.2, H - 0.45, -4.4, 0.3, 0, 0.2);
    }
    this.shell.add(b.build({ receive: true }));
  }

  /** parede que o jogador quebra com a marreta: caixa com tinta do lado da loja e tijolo do outro + rachaduras */
  private buildBreakWall(w: Seg, y1: number, brick: THREE.Material): void {
    const alongX = Math.abs(w.x1 - w.x0) > Math.abs(w.z1 - w.z0);
    const len = alongX ? Math.abs(w.x1 - w.x0) : Math.abs(w.z1 - w.z0);
    const cx = (w.x0 + w.x1) / 2;
    const cz = (w.z0 + w.z1) / 2;
    const th = 0.22;
    const g = new THREE.BoxGeometry(alongX ? len : th, y1, alongX ? th : len);
    g.translate(cx, y1 / 2, cz);
    uvMeters(g);
    g.translate(-cx, -y1 / 2, -cz);
    // lado da loja: para onde fica o salão aberto
    const O = stageOf(this.r);
    const shopSide = alongX ? 1 : cx <= O.x0 + 0.01 ? 1 : -1;
    // ordem das faces: +x, -x, +y, -y, +z, -z
    const mats: THREE.Material[] = [brick, brick, brick, brick, brick, brick];
    if (alongX) mats[shopSide > 0 ? 4 : 5] = this.wallMat;
    else mats[shopSide > 0 ? 0 : 1] = this.wallMat;
    const m = new THREE.Mesh(g, mats);
    m.position.set(cx, y1 / 2, cz);
    m.receiveShadow = true;
    this.shell.add(m);
    // rachaduras (os dois lados)
    this.crackCv = crackCanvas(1);
    this.crackTex = new THREE.CanvasTexture(this.crackCv);
    this.crackTex.colorSpace = THREE.SRGBColorSpace;
    const cm = new THREE.MeshStandardMaterial({ map: this.crackTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sd of [1, -1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(len - 0.1, 6), Math.min(y1 - 0.1, 2.6)), cm);
      pl.position.set(cx + (alongX ? 0 : sd * (th / 2 + 0.005)), Math.min(y1, 2.7) / 2 + 0.05, cz + (alongX ? sd * (th / 2 + 0.005) : 0));
      pl.rotation.y = alongX ? (sd > 0 ? 0 : Math.PI) : sd > 0 ? Math.PI / 2 : -Math.PI / 2;
      pl.renderOrder = 2;
      this.shell.add(pl);
    }
    this.setCracks();
    const box = alongX ? { x0: Math.min(w.x0, w.x1), z0: cz - th / 2, x1: Math.max(w.x0, w.x1), z1: cz + th / 2 } : { x0: cx - th / 2, z0: Math.min(w.z0, w.z1), x1: cx + th / 2, z1: Math.max(w.z0, w.z1) };
    this.colliders.push(box);
    this.physBoxes.push([cx, y1 / 2, cz, (box.x1 - box.x0) / 2, y1 / 2, (box.z1 - box.z0) / 2]);
    this.brk = { seg: w, y1, box: new THREE.Box3(new THREE.Vector3(box.x0 - 0.05, 0, box.z0 - 0.05), new THREE.Vector3(box.x1 + 0.05, y1, box.z1 + 0.05)) };
  }
  private setCracks(): void {
    const P = pendingWall(this.r);
    if (!this.crackCv || !this.crackTex || !P) return;
    drawCracks(this.crackCv, Math.min(1, this.r.hits / Math.max(1, P.hits)));
    this.crackTex.needsUpdate = true;
  }

  /* ------------------------------ fachada ------------------------------ */
  private buildFacade(): void {
    const k = this.kit;
    const r = this.r;
    const b = new Builder();
    const ext = k.surf('facadeExt' + (r.walls ? 1 : 0), r.walls ? 'plaster' : 'plasterDirty', { color: r.walls ? '#fbeef3' : '#e2dcd6', rough: 1, envK: 0.3 });
    const extOld = k.surf('facadeExt0', 'plasterDirty', { color: '#e2dcd6', rough: 1, envK: 0.3 });
    const metal = k.plain('frameMetal' + (r.window ? 1 : 0), r.window ? '#2c2a30' : '#5a5650', r.window ? 0.35 : 0.8, 0.6);
    const top = 5.2;
    const D = LAY.door;
    const O = stageOf(r);
    const garage = r.op <= 1;
    // parte da frente que é da loja (no bloco principal −5..5)
    const fx0 = Math.max(-5, O.x0);
    const fx1 = Math.min(5, O.x1);
    this.front = { x0: O.x0, x1: O.x1 };
    const shutterM = k.surf('shutterFront', 'shutter', { rough: 1, envK: 0.6, metal: 0.5 });
    /** sala fechada (não é da loja): porta de aço + "aluga-se" */
    const closedUnit = (xa: number, xb: number) => {
      this.wall(b, extOld, xa, 0, xb, 0, 2.8, top, false);
      b.add(new THREE.BoxGeometry(xb - xa - 0.1, 2.8, 0.08), shutterM, (xa + xb) / 2, 1.4, 0.05);
      if (!r.own) b.add(new THREE.PlaneGeometry(0.9, 0.45), k.canvasMat('rent', rentCanvas()), (xa + xb) / 2, 1.7, 0.1);
      this.colliders.push({ x0: xa, z0: -0.15, x1: xb, z1: 0.15 });
      this.physBoxes.push([(xa + xb) / 2, 1.4, 0, (xb - xa) / 2, 1.4, 0.15]);
    };
    const pillar = (xa: number, xb: number, mat: THREE.Material) => this.wall(b, mat, xa, 0, xb, 0, 0, top);
    // pilares do bloco principal (sempre)
    pillar(-5.2, -4.6, fx0 <= -5 ? ext : extOld);
    pillar(4.6, 5.2, fx1 >= 5 ? ext : extOld);
    // salas do bloco principal que ainda não são da loja
    if (fx0 > -4.6) {
      closedUnit(-4.6, fx0 - 0.2);
      pillar(fx0 - 0.2, fx0 + 0.2, ext);
    }
    if (fx1 < 4.6) {
      closedUnit(fx1 + 0.2, 4.6);
      pillar(fx1 - 0.2, fx1 + 0.2, ext);
    }
    const lx0 = fx0 > -4.6 ? fx0 + 0.2 : -4.6;
    const lx1 = fx1 < 4.6 ? fx1 - 0.2 : 4.6;
    // parede acima da frente da loja
    this.wall(b, ext, lx0, 0, lx1, 0, 2.8, top, false);
    const windows: [number, number][] = [];
    if (garage) {
      // GARAGEM: portão de enrolar inteiro (sobe quando abre)
      const gw = lx1 - lx0;
      b.add(rbox(gw + 0.1, 0.22, 0.24, 0.03, 1), k.plain('garageBox', r.door ? '#f4eef0' : '#8a847c', 0.5, 0.3), (lx0 + lx1) / 2, 2.72, 0.06);
      const gm = r.door ? k.plain('garagePink', '#f7c6da', 0.5, 0.4, { envK: 0.8 }) : k.surf('shutterOld', 'shutter', { rough: 1, envK: 0.5, metal: 0.5, color: '#b8b0a6' });
      const gd = new THREE.Mesh(new THREE.BoxGeometry(gw, 2.6, 0.06), gm);
      uvMeters(gd.geometry);
      gd.position.set((lx0 + lx1) / 2, 1.3, 0.02);
      // frisos horizontais
      const ribs = new Builder();
      for (let i = 0; i < 12; i++) ribs.add(new THREE.BoxGeometry(gw, 0.025, 0.03), k.plain('garageRib', r.door ? '#e8a8c4' : '#8a847c', 0.5, 0.4), 0, -1.25 + i * 0.22, 0.04);
      ribs.add(rbox(0.5, 0.06, 0.05, 0.02, 1), k.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 }), 0, -1.15, 0.06);
      gd.add(ribs.build());
      this.facade.add(gd);
      this.garage = gd;
      // mureta lateral dos trilhos
      for (const x of [lx0, lx1]) b.add(rbox(0.07, 2.7, 0.1, 0.02, 1), metal, x, 1.35, 0.06);
      // placa da porta (aberto/fechado) num pedestal ao lado
      this.buildDoorSign(lx1 - 0.15, 0.55);
    } else {
      // vitrines dos lados da porta (só onde é loja)
      const wl: [number, number] = [lx0, -D - 0.1];
      const wr: [number, number] = [D + 0.1, lx1];
      for (const [xa, xb] of [wl, wr]) {
        if (xb - xa < 0.4) continue;
        windows.push([xa, xb]);
        b.addW(new THREE.BoxGeometry(xb - xa, 0.45, T), ext, (xa + xb) / 2, 0.225, 0);
        this.colliders.push({ x0: xa, z0: -T / 2, x1: xb, z1: T / 2 });
        this.physBoxes.push([(xa + xb) / 2, 1.4, 0, (xb - xa) / 2, 1.4, T / 2]);
        b.add(rbox(xb - xa, 0.08, 0.14, 0.02, 1), metal, (xa + xb) / 2, 0.47, 0.02);
        b.add(rbox(xb - xa, 0.08, 0.14, 0.02, 1), metal, (xa + xb) / 2, 2.78, 0.02);
        for (const xm of [xa, (xa + xb) / 2, xb]) b.add(rbox(0.08, 2.4, 0.14, 0.02, 1), metal, xm, 1.62, 0.02);
        if (r.window) b.add(new THREE.PlaneGeometry(xb - xa, 2.3), k.glass('shopGlass', '#e6f6ff', 0.16), (xa + xb) / 2, 1.62, 0.01);
        else {
          b.add(new THREE.PlaneGeometry(xb - xa, 2.3), k.glass('dirtyGlass', '#9a9078', 0.55), (xa + xb) / 2, 1.62, 0.01);
          const plank = k.surf('plank', 'wood', { rough: 1, color: '#b89a7a' });
          for (let i = 0; i < 4; i++) {
            const y = 0.8 + i * 0.55;
            b.add(rbox(xb - xa + 0.2, 0.22, 0.03, 0.01, 1), plank, (xa + xb) / 2, y, 0.06, 0, 0, (i % 2 ? 1 : -1) * 0.05);
          }
          b.add(rbox(0.2, 2.2, 0.03, 0.01, 1), plank, (xa + xb) / 2 + 0.4, 1.6, 0.09, 0, 0, 0.5);
        }
      }
      this.wall(b, ext, -D - 0.1, 0, -D, 0, 0, 2.8);
      this.wall(b, ext, D, 0, D + 0.1, 0, 0, 2.8);
      b.add(rbox(D * 2 + 0.2, 0.18, 0.2, 0.03, 1), metal, 0, 2.62, 0);
      const doorMat = r.door ? k.glass('doorGlass', '#e6f6ff', 0.2) : k.glass('doorOld', '#a89a80', 0.6);
      const leaf = () => {
        const g = new THREE.Group();
        const bb = new Builder();
        bb.add(new THREE.PlaneGeometry(D - 0.04, 2.45), doorMat, 0, 1.27, 0);
        bb.add(rbox(D, 0.06, 0.05, 0.015, 1), metal, 0, 0.03, 0);
        bb.add(rbox(D, 0.06, 0.05, 0.015, 1), metal, 0, 2.5, 0);
        bb.add(rbox(0.05, 2.5, 0.05, 0.015, 1), metal, -D / 2 + 0.025, 1.26, 0);
        bb.add(rbox(0.05, 2.5, 0.05, 0.015, 1), metal, D / 2 - 0.025, 1.26, 0);
        bb.add(rbox(0.03, 0.5, 0.05, 0.015, 1), k.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 }), D / 2 - 0.12, 1.1, 0.04);
        g.add(bb.build());
        return g;
      };
      this.doorL = leaf();
      this.doorR = leaf();
      this.doorL.position.set(-D / 2, 0, 0.04);
      this.doorR.position.set(D / 2, 0, 0.04);
      this.facade.add(this.doorL, this.doorR);
      // plaquinha ABERTO/FECHADO pendurada no vidro da porta (vira)
      this.buildDoorSign(D + 0.45, 0.12, true);
    }
    // toldo listrado sobre a frente da loja
    const aw = Math.min(9.6, lx1 - lx0 + 0.2);
    const acx = (lx0 + lx1) / 2;
    {
      const ag = new THREE.PlaneGeometry(aw, 1.25, 1, 8);
      const p = ag.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const v = (p.getY(i) + 0.625) / 1.25;
        p.setXYZ(i, p.getX(i), 3.22 - v * 0.42 - Math.sin(v * Math.PI) * 0.06, 0.12 + v * 1.15);
      }
      ag.computeVertexNormals();
      const nStripe = Math.max(4, Math.round(aw / 0.6));
      const stripe = document.createElement('canvas');
      stripe.width = nStripe * 32;
      stripe.height = 32;
      const sx = stripe.getContext('2d')!;
      for (let i = 0; i < nStripe; i++) {
        sx.fillStyle = r.walls ? (i % 2 ? '#ffffff' : '#ff8cc0') : i % 2 ? '#d8d0c8' : '#b9a8a0';
        sx.fillRect(i * 32, 0, 32, 32);
      }
      const am = k.canvasMat('awnStripes' + (r.walls ? 1 : 0) + ':' + nStripe, stripe, { rough: 0.85 }) as THREE.MeshStandardMaterial;
      am.side = THREE.DoubleSide;
      b.add(ag, am, acx, 0, 0);
      const val = document.createElement('canvas');
      val.width = nStripe * 32;
      val.height = 64;
      const vx = val.getContext('2d')!;
      for (let i = 0; i < nStripe; i++) {
        vx.fillStyle = r.walls ? (i % 2 ? '#ffffff' : '#ff8cc0') : i % 2 ? '#d8d0c8' : '#b9a8a0';
        vx.fillRect(i * 32, 0, 32, 36);
        vx.beginPath();
        vx.arc(i * 32 + 16, 34, 16, 0, Math.PI);
        vx.fill();
      }
      if (!r.walls) vx.clearRect(val.width * 0.6, 20, 60, 44);
      const vm = k.canvasMat('awnVal' + (r.walls ? 1 : 0) + ':' + nStripe, val, { rough: 0.85, transparent: true }) as THREE.MeshStandardMaterial;
      vm.alphaTest = 0.5;
      vm.transparent = false;
      vm.side = THREE.DoubleSide;
      b.add(new THREE.PlaneGeometry(aw, 0.3), vm, acx, 2.66, 1.27);
      const iron = k.plain('awnIron', '#2c2a30', 0.4, 0.7);
      for (const x of [acx - aw / 2 + 0.2, acx, acx + aw / 2 - 0.2]) b.add(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 6), iron, x, 2.95, 0.7, 1.2, 0, 0);
    }
    if (r.walls) {
      // revestimento de mármore nos pilares + faixa (lintel) e rodapé de granito escuro
      const marble = k.surf('facadeMarble', 'marble', { rough: 0.7, envK: 1.1 });
      const granite = k.plain('granite', '#2e2a30', 0.25, 0.1, { envK: 1.2 });
      const pil: [number, number][] = [
        [lx0 - 0.65, lx0 + 0.05],
        [lx1 - 0.05, lx1 + 0.65],
      ];
      if (!garage) pil.push([-D - 0.14, -D + 0.02], [D - 0.02, D + 0.14]);
      for (const [xa, xb] of pil) b.addW(rbox(xb - xa, 2.8, 0.06, 0.015, 1), marble, (xa + xb) / 2, 1.4, 0.13);
      b.addW(rbox(lx1 - lx0 + 1.3, 0.42, 0.08, 0.02, 1), marble, acx, 3.0, 0.14);
      b.add(rbox(lx1 - lx0 + 1.3, 0.22, 0.1, 0.02, 1), granite, acx, 0.11, 0.15);
      if (!garage) {
        for (const sx of [-1, 1]) {
          b.add(rbox(0.6, 0.55, 0.6, 0.06, 2), k.plain('planter', '#f4eef0', 0.35, 0, { envK: 1 }), sx * 1.75, 0.275, 0.75);
          const pl = buildFurniture(k, 'plant').group;
          pl.position.set(sx * 1.75, 0.15, 0.75);
          pl.scale.setScalar(1.05);
          this.facade.add(pl);
          this.colliders.push({ x0: sx * 1.75 - 0.3, z0: 0.45, x1: sx * 1.75 + 0.3, z1: 1.05 });
        }
        // vitrine: pódios com produtos em destaque
        const podM = k.plain('podium', '#fbf6f8', 0.3, 0, { envK: 0.9 });
        const podG = k.plain('podiumGold', '#d6ad6a', 0.26, 1, { envK: 1.2 });
        const show = PRODUCTS.filter((p) => p.tier === 3);
        let si = 0;
        for (const [xa, xb] of windows)
          for (let x = xa + 0.55; x < xb - 0.4; x += 0.9) {
            const h = [0.55, 0.85, 0.4][si % 3];
            b.add(new THREE.CylinderGeometry(0.28, 0.3, h, 28), podM, x, h / 2, -0.55);
            b.add(new THREE.CylinderGeometry(0.29, 0.29, 0.015, 28), podG, x, h, -0.55);
            if (r.window) {
              const pm = productMesh(k, show[si % show.length]);
              pm.position.set(x, h + 0.008, -0.55);
              pm.scale.setScalar(1.6);
              pm.rotation.y = 0.3 * Math.sign(x);
              this.facade.add(pm);
            }
            si++;
          }
      } else {
        // garagem caprichada: vasinhos nas pontas
        for (const x of [lx0 - 0.35, lx1 + 0.35]) {
          b.add(rbox(0.45, 0.45, 0.45, 0.05, 2), k.plain('planter', '#f4eef0', 0.35, 0, { envK: 1 }), x, 0.225, 0.5);
          const pl = buildFurniture(k, 'plant').group;
          pl.position.set(x, 0.1, 0.5);
          pl.scale.setScalar(0.8);
          this.facade.add(pl);
        }
      }
    }
    // luz de dentro "vazando" na calçada
    if (r.light >= 1 && (r.window || garage)) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(32, 0, 2, 32, 0, 64);
      g.addColorStop(0, 'rgba(255,225,200,.35)');
      g.addColorStop(1, 'rgba(255,225,200,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      const m = k.canvasMat('spill', c, { basic: true, transparent: true }) as THREE.MeshBasicMaterial;
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
      const spots: [number, number][] = garage ? [[lx0, lx1]] : windows;
      for (const [xa, xb] of spots) b.add(new THREE.PlaneGeometry(xb - xa, 2.2).rotateX(-Math.PI / 2), m, (xa + xb) / 2, 0.012, 1.1);
    }
    // salas laterais (ampliações): fechadas até abrir
    for (const [ex, open] of [
      [7, O.x1 >= 9],
      [-7, O.x0 <= -9],
    ] as const) {
      const xa = ex - 2;
      const xb = ex + 2;
      this.wall(b, open ? ext : extOld, ex > 0 ? xb - 0.2 : xa - 0.2, 0, ex > 0 ? xb + 0.2 : xa + 0.2, 0, 0, top);
      if (!open) closedUnit(ex > 0 ? xa + 0.2 : xa + 0.2, ex > 0 ? xb - 0.2 : xb - 0.2);
      else {
        this.wall(b, ext, xa + 0.2, 0, xb - 0.2, 0, 2.8, top, false);
        b.addW(new THREE.BoxGeometry(xb - xa - 0.4, 0.45, T), ext, ex, 0.225, 0);
        b.add(new THREE.PlaneGeometry(xb - xa - 0.4, 2.3), k.glass('shopGlass', '#e6f6ff', 0.16), ex, 1.62, 0.01);
        b.add(rbox(xb - xa - 0.4, 0.08, 0.14, 0.02, 1), metal, ex, 2.78, 0.02);
        this.colliders.push({ x0: xa, z0: -0.15, x1: xb, z1: 0.15 });
        this.physBoxes.push([ex, 1.4, 0, 2, 1.4, 0.15]);
      }
    }
    // prédio próprio: plaquinha dourada
    if (r.own) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, '#fbe7a8');
      g.addColorStop(1, '#d6ad6a');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 96);
      x.strokeStyle = '#8a6420';
      x.lineWidth = 6;
      x.strokeRect(4, 4, 248, 88);
      drawBrandLogo(x, 128, 48, 40);
      b.add(new THREE.PlaneGeometry(0.7, 0.26), k.canvasMat('ownPlaque', c, { rough: 0.3 }), lx0 - 0.35, 1.9, 0.17);
    }
    // marquise de concreto (o prédio todo)
    b.addW(rbox(18.6, 0.18, 1.0, 0.04, 2), k.surf('marquee', 'concrete', { rough: 1, color: '#efe8e4' }), 0, top, 0.4);
    this.facade.add(b.build({ receive: true }));
  }
  /** plaquinha "ABERTO"/"FECHADO" (frente/verso) — o jogador vira tocando nela */
  private buildDoorSign(x: number, z: number, hang = false): void {
    const k = this.kit;
    const mk = (open: boolean) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(4, 4, 248, 120, 18);
      g.fill();
      g.fillStyle = open ? '#2fa35a' : '#e8336f';
      g.beginPath();
      g.roundRect(14, 14, 228, 100, 12);
      g.fill();
      g.fillStyle = '#fff';
      // ícone: porta aberta / cadeado (sem texto: criança não precisa ler)
      if (open) {
        g.fillRect(70, 30, 70, 70);
        g.fillStyle = open ? '#2fa35a' : '#e8336f';
        g.fillRect(80, 40, 50, 60);
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(130, 40);
        g.lineTo(165, 30);
        g.lineTo(165, 108);
        g.lineTo(130, 100);
        g.fill();
        g.beginPath();
        g.arc(190, 64, 10, 0, 7);
        g.fill();
      } else {
        g.lineWidth = 12;
        g.strokeStyle = '#fff';
        g.beginPath();
        g.arc(128, 54, 20, Math.PI, 0);
        g.stroke();
        g.fillRect(96, 54, 64, 50);
      }
      return c;
    };
    const grp = new THREE.Group();
    const mo = k.canvasMat('dsOpen', mk(true), { rough: 0.6 });
    const mc = k.canvasMat('dsClosed', mk(false), { rough: 0.6 });
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), mo);
    pf.position.z = 0.006;
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), mc);
    pb.rotation.y = Math.PI;
    pb.position.z = -0.006;
    const card = new THREE.Group();
    card.add(pf, pb, new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.23, 0.008), k.plain('dsEdge', '#ffffff', 0.5)));
    grp.add(card);
    if (hang) {
      // cordinha na porta de vidro
      const cord = k.plain('cord', '#2a2a2a', 0.6);
      const b = new Builder();
      b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4), cord, -0.1, 0.18, 0, 0, 0, -0.5);
      b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4), cord, 0.1, 0.18, 0, 0, 0, 0.5);
      grp.add(b.build());
      grp.position.set(x, 1.45, z);
    } else {
      // pedestal (garagem)
      const b = new Builder();
      b.add(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), k.plain('dsPole', '#2c2a30', 0.4, 0.7), 0, -0.62, 0);
      b.add(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), k.plain('dsPole', '#2c2a30', 0.4, 0.7), 0, -1.2, 0);
      grp.add(b.build());
      grp.position.set(x, 1.22, z);
    }
    this.facade.add(grp);
    this.doorSign = card;
    this.signFlip = this.signOpen ? 0 : Math.PI;
    card.rotation.y = this.signFlip;
    this.doorSignPos.set(grp.position.x, grp.position.y, grp.position.z);
  }
  readonly doorSignPos = new THREE.Vector3(1.4, 1.45, 0.12);

  private buildSign(): void {
    const k = this.kit;
    const r = this.r;
    const O = stageOf(r);
    const fx0 = Math.max(-4.6, O.x0 + 0.2);
    const fx1 = Math.min(4.6, O.x1 - 0.2);
    const cv = signCanvas(r.sign, 1024, 220);
    const glow = r.sign === 'neon' ? 1.6 : r.sign === 'box' ? 0.8 : r.sign === 'flowers' ? 0.3 : r.sign === 'none' ? 0 : 0.15;
    const m = k.canvasMat('sign-' + r.sign, cv, { emissive: glow, rough: r.sign === 'gold' ? 0.4 : 0.6 });
    const w = Math.min(6.2, fx1 - fx0 - 0.4);
    const h = (w * 220) / 1024;
    const cx = (fx0 + fx1) / 2;
    const y = 3.95;
    const b = new Builder();
    if (r.sign !== 'none' && r.sign !== 'simple') b.add(rbox(w + 0.1, h + 0.1, 0.18, 0.05, 2), k.plain('signBox', r.sign === 'neon' ? '#1e1020' : r.sign === 'gold' ? '#e8ddd4' : '#ffffff', 0.4), cx, y, 0.12);
    b.add(new THREE.PlaneGeometry(w, h), m, cx, y, r.sign === 'none' || r.sign === 'simple' ? 0.115 : 0.215);
    if (r.sign === 'flowers') {
      const fl = [k.plain('fl1', '#ff9ac4', 0.6), k.plain('fl2', '#ffffff', 0.6), k.plain('fl3', '#ff5fa2', 0.6)];
      for (let i = 0; i < 40; i++) {
        const g = new THREE.IcosahedronGeometry(0.08 + (i % 3) * 0.03, 1);
        const a = (i / 40) * Math.PI * 2;
        b.add(g, fl[i % 3], cx + Math.cos(a) * (w / 2 + 0.05), y + Math.sin(a) * (h / 2 + 0.05), 0.25);
      }
    }
    this.signG.add(b.build());
  }

  /* ------------------------------ luzes ------------------------------ */
  private buildLights(): void {
    const k = this.kit;
    const r = this.r;
    const O = stageOf(r);
    const S = ownedStage(r);
    const { x0, x1, zB } = O;
    const b = new Builder();
    const H = LAY.H;
    this.flick = null;
    const cx = (x0 + x1) / 2;
    const cz = zB / 2;
    if (r.light === 0) {
      const m = k.plain('bulbOld', '#fff4d0', 0.4, 0, { emissive: '#ffe0a0', ei: 1.5 });
      this.flick = m;
      b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), k.plain('wire', '#222', 0.6), cx, H - 0.3, cz);
      b.add(new THREE.SphereGeometry(0.06, 10, 8), m, cx, H - 0.65, cz);
    } else if (r.light === 1) {
      const m = k.plain('panelLed', '#ffffff', 0.5, 0, { emissive: '#ffffff', ei: 1.1 });
      for (let x = x0 + 1.25; x < x1 - 0.5; x += 2.5) for (let z = -2; z > zB; z -= 3.3) b.add(rbox(1.2, 0.04, 0.3, 0.01, 1), m, x, H - 0.02, z);
    } else if (r.light === 2) {
      const m = k.plain('spotLed', '#fffaf0', 0.5, 0, { emissive: '#fff0d8', ei: 2.2 });
      const ring = k.plain('spotRing', '#f0f0f0', 0.3, 0.6);
      for (let x = x0 + 0.9; x < x1 - 0.3; x += 1.6)
        for (let z = -1.5; z > zB; z -= 1.8) {
          b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), ring, x, H - 0.01, z);
          b.add(new THREE.CircleGeometry(0.06, 14).rotateX(Math.PI / 2), m, x, H - 0.022, z);
        }
    } else {
      const shadeM = k.plain('pendShade', '#e9b7c8', 0.3, 0.6, { envK: 1.2, side: THREE.DoubleSide });
      const inner = k.plain('pendInner', '#fff6ea', 0.6, 0, { emissive: '#ffe8cc', ei: 1.2, side: THREE.BackSide });
      const bulb = k.plain('pendBulb', '#fff', 0.3, 0, { emissive: '#ffe2b8', ei: 2.4 });
      const cord = k.plain('cord', '#2a2a2a', 0.6);
      const gold = k.plain('gold', '#d6ad6a', 0.26, 1, { envK: 1.2 });
      const prof = [new THREE.Vector2(0.03, 0.2), new THREE.Vector2(0.05, 0.19), new THREE.Vector2(0.09, 0.14), new THREE.Vector2(0.15, 0.06), new THREE.Vector2(0.2, 0.0)];
      for (let x = x0 + 1.25; x < x1 - 0.5; x += 2.2)
        for (let z = -2; z > zB; z -= 2.6) {
          b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 4), cord, x, H - 0.45, z);
          b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), gold, x, H - 0.01, z);
          b.add(new THREE.LatheGeometry(prof, 22), shadeM, x, H - 1.1, z);
          b.add(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * 0.97, p.y - 0.004)), 22), inner, x, H - 1.1, z);
          b.add(new THREE.SphereGeometry(0.045, 10, 8), bulb, x, H - 1.06, z);
        }
      const m = k.plain('spotLed', '#fffaf0', 0.5, 0, { emissive: '#fff0d8', ei: 2.2 });
      for (let x = x0 + 0.6; x < x1; x += 1.6) b.add(new THREE.CircleGeometry(0.05, 12).rotateX(Math.PI / 2), m, x, H - 0.012, -0.8);
    }
    // estoque: luminária fluorescente
    if (O.stock) b.add(rbox(1.2, 0.05, 0.18, 0.02, 1), k.plain('fluor', '#ffffff', 0.5, 0, { emissive: '#f4fbff', ei: 1 }), 0, H - 0.04, -14);
    // sala comprada e ainda fechada: lâmpada pelada
    const nr = diffRect(S, O);
    if (nr) {
      const m = k.plain('bulbBare', '#fff4d0', 0.4, 0, { emissive: '#ffe0a0', ei: 1.2 });
      const bx = (nr.x0 + nr.x1) / 2;
      const bz = (nr.z0 + nr.z1) / 2;
      b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), k.plain('wire', '#222', 0.6), bx, H - 0.25, bz);
      b.add(new THREE.SphereGeometry(0.05, 10, 8), m, bx, H - 0.55, bz);
    }
    this.lightsG.add(b.build());
    // "luz assada": manchas suaves de luz no chão e nas paredes embaixo das luminárias (aditivo, barato)
    const pools = new Builder();
    const warm = r.light >= 2;
    const pm = k.canvasMat('pool' + (warm ? 'w' : 'c'), poolCanvas(warm ? '255,226,190' : '235,242,255'), { basic: true, transparent: true }) as THREE.MeshBasicMaterial;
    pm.blending = THREE.AdditiveBlending;
    pm.depthWrite = false;
    const amt = [0.3, 0.32, 0.4, 0.45][r.light];
    pm.opacity = amt;
    const pg = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    if (r.light === 0) pools.add(pg(), pm, cx, 0.014, cz, 0, 0, 0, 3.2, 1, 3.2);
    else {
      const step = r.light === 2 ? 3.2 : 2.6;
      for (let x = x0 + 1.4; x < x1 - 0.6; x += step) for (let z = -2; z > zB + 0.6; z -= 3.3) pools.add(pg(), pm, x, 0.014, z, 0, 0, 0, 3.6, 1, 3.6);
      const wm = k.canvasMat('wash' + (warm ? 'w' : 'c'), washCanvas(warm ? '255,224,185' : '240,245,255'), { basic: true, transparent: true }) as THREE.MeshBasicMaterial;
      wm.blending = THREE.AdditiveBlending;
      wm.depthWrite = false;
      wm.opacity = amt * 0.8;
      for (let z = -1.6; z > zB + 0.5; z -= 2.2) {
        pools.add(new THREE.PlaneGeometry(1.6, H), wm, x0 + 0.03, H / 2, z, 0, Math.PI / 2, 0);
        pools.add(new THREE.PlaneGeometry(1.6, H), wm, x1 - 0.03, H / 2, z, 0, -Math.PI / 2, 0);
      }
    }
    const pg2 = pools.build({ receive: false });
    pg2.traverse((o) => (o.renderOrder = 3));
    this.lightsG.add(pg2);
    if (k.tier >= 2 && r.light >= 1) {
      for (const z of zB < -7 ? [-3.5, -8.5] : [-3]) {
        const pl = new THREE.PointLight(warm ? '#ffe2c0' : '#f4f8ff', 3 + r.light * 1.5, 10, 1.4);
        pl.position.set(cx, H - 0.4, z);
        this.lightsG.add(pl);
      }
    }
  }

  private buildFloor(): void {
    const k = this.kit;
    const r = this.r;
    const O = stageOf(r);
    const S = ownedStage(r);
    const id = r.floor === 'broken' ? 'concreteBroken' : r.floor;
    const m = k.surf('floor-' + id, id, { rough: 1, envK: id === 'marble' || id === 'tile' || id === 'terrazzo' ? 1.0 : 0.5, normalK: id === 'concreteBroken' ? 1.4 : 0.8 });
    const b = new Builder();
    const rect = (x0: number, x1: number, z0: number, z1: number, mat: THREE.Material, y = 0) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      b.addW(g, mat, (x0 + x1) / 2, y, (z0 + z1) / 2);
    };
    rect(O.x0, O.x1, O.zB, 0, m);
    const con = k.surf('floor-concrete', 'concrete', { rough: 1, envK: 0.5, normalK: 0.8 });
    if (O.stock) rect(O.x0, O.x1, LAY.zBack, O.zB, con);
    const nr = diffRect(S, O);
    if (nr) rect(nr.x0, nr.x1, nr.z0, nr.z1, k.surf('floor-concreteBroken', 'concreteBroken', { rough: 1, envK: 0.5, normalK: 1.4 }), -0.002);
    // soleira da porta
    if (r.op >= 2) b.add(rbox(LAY.door * 2 + 0.2, 0.02, 0.3, 0.008, 1), k.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 }), 0, 0.01, 0);
    else b.add(rbox(4.6, 0.02, 0.18, 0.008, 1), k.plain('garageSill', '#9a948c', 0.6, 0.4), 0, 0.01, 0);
    const fg = b.build({ receive: true });
    this.floorG.add(fg);
  }

  /** anima portas (abre quando alguém está perto), portão da garagem, placa e lâmpada velha */
  update(dt: number, time: number, near: boolean, shutterWant: number): void {
    const want = near ? 1 : 0;
    this.doorOpen += (want - this.doorOpen) * Math.min(1, dt * (this.garage ? 2.2 : 5));
    const D = LAY.door;
    if (this.doorL && this.doorR) {
      this.doorL.position.x = -D / 2 - this.doorOpen * (D - 0.06);
      this.doorR.position.x = D / 2 + this.doorOpen * (D - 0.06);
    }
    if (this.garage) {
      // portão enrola para cima (encolhe dentro da caixa)
      const k = this.doorOpen;
      this.garage.scale.y = Math.max(0.04, 1 - k * 0.96);
      this.garage.position.y = 2.6 - 1.3 * this.garage.scale.y;
    }
    if (this.doorSign) {
      const goal = this.signOpen ? 0 : Math.PI;
      this.signFlip += (goal - this.signFlip) * Math.min(1, dt * 8);
      this.doorSign.rotation.y = this.signFlip;
      this.doorSign.rotation.z = Math.sin(time * 1.3) * 0.03;
    }
    if (this.flick) this.flick.emissiveIntensity = Math.sin(time * 23) > 0.7 || Math.sin(time * 3.1) > 0.95 ? 0.2 : 1.5;
    this.shutterOpen += (shutterWant - this.shutterOpen) * Math.min(1, dt * 1.5);
    if (this.shutter) {
      this.shutter.position.y = 1.4 + this.shutterOpen * 2.5;
      this.shutter.scale.y = 1 - this.shutterOpen * 0.85;
    }
  }
  get doorIsOpen(): boolean {
    return this.doorOpen > 0.7;
  }
  get backOpen(): boolean {
    return this.shutterOpen > 0.8;
  }
  /** luz caiu (Mercadinho): apaga luminárias, teto e luz das geladeiras */
  setPower(on: boolean): void {
    this.lightsG.visible = on;
    const k = this.kit;
    const ceil = k.surf('ceiling', 'ceiling', { rough: 1, envK: 0.2 });
    ceil.emissiveIntensity = on ? (this.r.light >= 1 ? 0.32 : 0.12) : 0.02;
    for (const [key, col, ei] of [['fridgeLight', '#eaf6ff', 0.45], ['freezerIn', '#cfe8f8', 0.3], ['butcherIce', '#f4fbff', 0.25]] as const) k.plain(key, col, 0.4).emissiveIntensity = on ? ei : 0;
  }
  get isGarage(): boolean {
    return !!this.garage;
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.crackTex?.dispose();
    this.root.removeFromParent();
  }
}
