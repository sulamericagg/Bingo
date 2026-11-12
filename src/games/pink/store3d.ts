/* ============================================================
 *  BLOOP PINK — o prédio da loja e a rua.
 *  Planta (m): salão x∈[-5,5] z∈[-12,0]; estoque z∈[-16,-12]; porta da frente em z=0;
 *  porta de enrolar dos fundos em z=-16 (beco do caminhão); expansões: x∈[5,9] (1) e
 *  x∈[-9,-5] (2), fechadas com porta de aço + placa "aluga-se" até serem compradas.
 *  Estado quebrado → reformado é aplicado por partes (paredes, vitrine, piso, placa, luz).
 * ============================================================ */
import * as THREE from 'three';
import type { FpBox } from '../../3d/fpkit';
import { brandCanvas, drawBrandLogo, PINK } from './brand';
import { PAINTS, type FloorId, type SignId } from './data';
import type { Kit } from './mats';
import { Builder, rbox } from './shapes';

export const LAY = {
  x0: -5,
  x1: 5,
  zF: 0,
  zB: -12,
  zBack: -16,
  H: 3.4,
  door: 0.95,
  part: [2.3, 4.3] as [number, number],
  backDoor: 1.6,
  expX: 4,
};
export interface Renov {
  walls: boolean;
  paint: string;
  window: boolean;
  door: boolean;
  floor: FloorId;
  sign: SignId;
  light: number;
  exp: number;
}
export const RENOV0: Renov = { walls: false, paint: 'blush', window: false, door: false, floor: 'broken', sign: 'none', light: 0, exp: 0 };

/** limites do salão de vendas (com expansões) */
export function floorBounds(exp: number): { x0: number; x1: number } {
  return { x0: exp >= 2 ? -9 : -5, x1: exp >= 1 ? 9 : 5 };
}

const T = 0.2; // espessura das paredes

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

export interface StoreParts {
  root: THREE.Group;
  colliders: FpBox[];
  /** caixas para a física (paredes) — x,y,z, meias-extensões */
  physBoxes: [number, number, number, number, number, number][];
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
  private doorOpen = 0;
  /** chama quando portas/colisores mudaram (a loja refaz colisão e física) */
  onRebuilt: (() => void) | null = null;
  private flick: THREE.MeshStandardMaterial | null = null;
  private shutter: THREE.Object3D | null = null;
  shutterOpen = 0;
  private r: Renov = { ...RENOV0 };

  constructor(private kit: Kit) {
    this.root.add(this.outside, this.shell, this.facade, this.signG, this.lightsG, this.floorG);
    this.buildOutside();
  }

  apply(r: Renov): void {
    this.r = { ...r };
    for (const g of [this.shell, this.facade, this.signG, this.lightsG, this.floorG]) {
      for (const c of [...g.children]) {
        c.removeFromParent();
        c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
    }
    this.colliders = [];
    this.physBoxes = [];
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
    nb(9, 21, '#d9e4ea', 'flower', '#c85a6a', 2);
    // prédios do outro lado da rua
    const cols = ['#e8d0b8', '#c8d8e0', '#f0e0d0', '#d8c8e8', '#e0e8d0'];
    for (let i = 0; i < 5; i++) {
      const cx = -18 + i * 9;
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
    this.outsideColliders = [
      { x0: -24, z0: 4.3, x1: 24, z1: 6 },
      { x0: -24, z0: -0.4, x1: -9, z1: 0.2 },
      { x0: 9, z0: -0.4, x1: 24, z1: 0.2 },
      { x0: -16, z0: -6, x1: -15.8, z1: 6 },
      { x0: 15.8, z0: -6, x1: 16, z1: 6 },
      { x0: -15, z0: -28, x1: 15, z1: -27 },
      { x0: -15.2, z0: -28, x1: -15, z1: -16 },
      { x0: 15, z0: -28, x1: 15.2, z1: -16 },
    ];
  }
  outsideColliders: FpBox[] = [];

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
    const { x0, x1 } = floorBounds(r.exp);
    const H = LAY.H;
    // paredes laterais (com expansões: paredes externas mudam)
    this.wall(b, brick, x0 - T / 2, LAY.zBack, x0 - T / 2, 0);
    this.wall(b, brick, x1 + T / 2, LAY.zBack, x1 + T / 2, 0);
    // paredes internas pintadas (camada fina por dentro)
    const inner = (xa: number, za: number, xb: number, zb: number) => b.addW(new THREE.BoxGeometry(Math.max(0.02, Math.abs(xb - xa)), H, Math.max(0.02, Math.abs(zb - za))), this.wallMat, (xa + xb) / 2, H / 2, (za + zb) / 2);
    inner(x0 + 0.01, LAY.zB, x0 + 0.01, 0);
    inner(x1 - 0.01, LAY.zB, x1 - 0.01, 0);
    // colunas onde ficavam as paredes antigas (expansões abertas)
    const col = k.plain('column', '#f4efec', 0.4);
    if (r.exp >= 1)
      for (const z of [-11.8, -6, -0.2]) {
        b.add(rbox(0.4, H, 0.4, 0.04, 2), col, 5, H / 2, z);
        this.colliders.push({ x0: 4.8, z0: z - 0.2, x1: 5.2, z1: z + 0.2 });
        this.physBoxes.push([5, H / 2, z, 0.2, H / 2, 0.2]);
      }
    if (r.exp >= 2)
      for (const z of [-11.8, -6, -0.2]) {
        b.add(rbox(0.4, H, 0.4, 0.04, 2), col, -5, H / 2, z);
        this.colliders.push({ x0: -5.2, z0: z - 0.2, x1: -4.8, z1: z + 0.2 });
        this.physBoxes.push([-5, H / 2, z, 0.2, H / 2, 0.2]);
      }
    // divisória salão/estoque (z=-12) com vão para o estoque
    const [p0, p1] = LAY.part;
    this.wall(b, this.wallMat, x0, LAY.zB - T / 2, p0, LAY.zB - T / 2);
    this.wall(b, this.wallMat, p1, LAY.zB - T / 2, x1, LAY.zB - T / 2);
    this.wall(b, this.wallMat, p0, LAY.zB - T / 2, p1, LAY.zB - T / 2, 2.4, H, false);
    // batente + plaquinha "só funcionários" (ícone)
    const frame = k.plain('doorFrame', '#e9e1dc', 0.4);
    for (const x of [p0, p1]) b.add(rbox(0.08, 2.4, 0.26, 0.02, 1), frame, x, 1.2, LAY.zB - T / 2);
    b.add(rbox(p1 - p0 + 0.08, 0.08, 0.26, 0.02, 1), frame, (p0 + p1) / 2, 2.42, LAY.zB - T / 2);
    // mural da marca na divisória (reformada)
    if (r.walls) {
      const mural = k.canvasMat('mural', brandCanvas(1024, 256, { bg: '#00000000' }), { transparent: true, rough: 0.5 });
      b.add(new THREE.PlaneGeometry(3.6, 0.9), mural, -1.2, 2.3, LAY.zB + 0.012);
    }
    // estoque: paredes de concreto e porta de enrolar nos fundos
    const bd = LAY.backDoor;
    this.wall(b, con, x0, LAY.zBack - T / 2, -bd, LAY.zBack - T / 2);
    this.wall(b, con, bd, LAY.zBack - T / 2, x1, LAY.zBack - T / 2);
    this.wall(b, con, -bd, LAY.zBack - T / 2, bd, LAY.zBack - T / 2, 2.8, H, false);
    // rodapé (pinta junto) e faixa de AO no encontro parede/chão
    const ao = k.aoMat();
    const aoStrip = (xa: number, za: number, xb: number, zb: number, nx: number, nz: number) => {
      const len = Math.hypot(xb - xa, zb - za);
      const g = new THREE.PlaneGeometry(len, 0.35);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, ao);
      m.position.set((xa + xb) / 2 + nx * 0.175, 0.006, (za + zb) / 2 + nz * 0.175);
      m.rotation.y = Math.atan2(xb - xa, zb - za) - Math.PI / 2;
      // a textura escurece em v=0 → borda da parede
      m.renderOrder = -1;
      this.shell.add(m);
      const g2 = new THREE.PlaneGeometry(len, 0.5);
      const m2 = new THREE.Mesh(g2, ao);
      m2.rotation.y = Math.atan2(nx, nz);
      m2.rotation.z = Math.PI;
      m2.position.set((xa + xb) / 2 + nx * 0.012, 0.25, (za + zb) / 2 + nz * 0.012);
      this.shell.add(m2);
    };
    aoStrip(x0, LAY.zB, x0, 0, 1, 0);
    aoStrip(x1, LAY.zB, x1, 0, -1, 0);
    aoStrip(x0, LAY.zB, p0, LAY.zB, 0, 1);
    aoStrip(p1, LAY.zB, x1, LAY.zB, 0, 1);
    const skirt = k.plain('skirt', '#ffffff', 0.35);
    b.add(new THREE.BoxGeometry(0.02, 0.1, -LAY.zB), skirt, x0 + 0.03, 0.05, LAY.zB / 2);
    b.add(new THREE.BoxGeometry(0.02, 0.1, -LAY.zB), skirt, x1 - 0.03, 0.05, LAY.zB / 2);
    // teto
    const ceil = k.surf('ceiling', 'ceiling', { rough: 1, envK: 0.2 });
    ceil.emissive.set('#ffffff');
    ceil.emissiveIntensity = r.light >= 1 ? 0.32 : 0.12;
    ceil.emissiveMap = ceil.map;
    const cg = new THREE.PlaneGeometry(x1 - x0, -LAY.zBack);
    cg.rotateX(Math.PI / 2);
    b.addW(cg, ceil, (x0 + x1) / 2, H, LAY.zBack / 2);
    // laje acima do teto até a fachada
    b.addW(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.3, -LAY.zBack + 0.2), con, (x0 + x1) / 2, H + 0.15, LAY.zBack / 2);
    if (!r.walls) {
      // placas do forro faltando + fios pendurados
      const hole = k.plain('ceilHole', '#141012', 1);
      for (const [hx, hz] of [[-2.4, -3], [1.8, -7.2], [-0.6, -9.6], [3, -2.2]]) b.add(new THREE.PlaneGeometry(0.6, 0.6).rotateX(Math.PI / 2), hole, hx, H - 0.005, hz);
      const wire = k.plain('wire', '#222', 0.6);
      b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), wire, 1.8, H - 0.45, -7.2, 0.3, 0, 0.2);
    }
    // estoque: estante metálica e lixeira de caixas
    const rack = k.plain('rack', '#5a6a80', 0.5, 0.6);
    const rackW = k.plain('rackWood', '#c8a070', 0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.05, 2.4, 0.05), rack, x0 + 0.4 + (sx + 1) * 1.1, 1.2, LAY.zBack + 0.5 + (sz + 1) * 0.25);
    for (const y of [0.3, 1.1, 1.9]) b.add(new THREE.BoxGeometry(2.3, 0.04, 0.6), rackW, x0 + 1.5, y, LAY.zBack + 0.75);
    this.colliders.push({ x0: x0 + 0.3, z0: LAY.zBack + 0.4, x1: x0 + 2.7, z1: LAY.zBack + 1.1 });
    this.physBoxes.push([x0 + 1.5, 1.2, LAY.zBack + 0.75, 1.2, 1.2, 0.35]);
    // faixa amarela de descarga
    const yel = k.plain('yellow', '#f2c21a', 0.7);
    for (let i = 0; i < 2; i++) b.add(new THREE.BoxGeometry(3.4, 0.004, 0.08), yel, 0, 0.004, LAY.zBack + 0.4 + i * 2.6);
    this.shell.add(b.build({ receive: true }));
    // porta de enrolar (anima)
    const sh = new THREE.Mesh(new THREE.BoxGeometry(bd * 2, 2.8, 0.06), k.surf('shutterBack', 'shutter', { rough: 1, envK: 0.6, metal: 0.5 }));
    sh.position.set(0, 1.4, LAY.zBack - 0.05);
    this.shell.add(sh);
    this.shutter = sh;
  }

  /* ------------------------------ fachada ------------------------------ */
  private buildFacade(): void {
    const k = this.kit;
    const r = this.r;
    const b = new Builder();
    const ext = k.surf('facadeExt' + (r.walls ? 1 : 0), r.walls ? 'plaster' : 'plasterDirty', { color: r.walls ? '#fbeef3' : '#e2dcd6', rough: 1, envK: 0.3 });
    const metal = k.plain('frameMetal' + (r.window ? 1 : 0), r.window ? '#2c2a30' : '#5a5650', r.window ? 0.35 : 0.8, 0.6);
    const H = LAY.H;
    const top = 5.2;
    const D = LAY.door;
    const segs = (x0: number, x1: number, store: boolean) => {
      // parede acima das vitrines e pilares
      this.wall(b, ext, x0, 0, x1, 0, 2.8, top, false);
      b.addW(new THREE.BoxGeometry(x1 - x0, 0.45, T + 0.04), k.plain('plinth', '#d9d2cc', 0.6), (x0 + x1) / 2, 0.225, 0);
      this.colliders.push({ x0, z0: -T / 2, x1, z1: T / 2 });
      this.physBoxes.push([(x0 + x1) / 2, 1.4, 0, (x1 - x0) / 2, 1.4, T / 2]);
      if (!store) return;
    };
    const { x0, x1 } = floorBounds(r.exp);
    // frente da loja principal: pilares + vitrines + porta
    this.wall(b, ext, -5.2, 0, -4.6, 0, 0, top);
    this.wall(b, ext, 4.6, 0, 5.2, 0, 0, top);
    this.wall(b, ext, -4.6, 0, 4.6, 0, 2.8, top, false);
    // mureta das vitrines
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -4.6 : D + 0.1;
      const xb = s < 0 ? -D - 0.1 : 4.6;
      b.addW(new THREE.BoxGeometry(xb - xa, 0.45, T), ext, (xa + xb) / 2, 0.225, 0);
      this.colliders.push({ x0: xa, z0: -T / 2, x1: xb, z1: T / 2 });
      this.physBoxes.push([(xa + xb) / 2, 1.4, 0, (xb - xa) / 2, 1.4, T / 2]);
      // caixilhos
      b.add(rbox(xb - xa, 0.08, 0.14, 0.02, 1), metal, (xa + xb) / 2, 0.47, 0.02);
      b.add(rbox(xb - xa, 0.08, 0.14, 0.02, 1), metal, (xa + xb) / 2, 2.78, 0.02);
      for (const xm of [xa, (xa + xb) / 2, xb]) b.add(rbox(0.08, 2.4, 0.14, 0.02, 1), metal, xm, 1.62, 0.02);
      if (r.window) b.add(new THREE.PlaneGeometry(xb - xa, 2.3), k.glass('shopGlass', '#e6f6ff', 0.16), (xa + xb) / 2, 1.62, 0.01);
      else {
        // tábuas pregadas + vidro rachado/sujo
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
    // porta: duas folhas de vidro de correr (abrem sozinhas)
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
    // toldo (lona curva) — reformado: rosa; quebrado: rasgado e desbotado
    const awn = new THREE.CylinderGeometry(0.9, 0.9, 9.6, 24, 1, true, 0, Math.PI / 2);
    awn.rotateZ(Math.PI / 2);
    b.add(awn, k.plain('awning' + (r.walls ? 1 : 0), r.walls ? '#ff9ac4' : '#b9a8a0', 0.85, 0, { side: THREE.DoubleSide }), 0, 2.95, 0.15, 0, 0, 0);
    if (r.walls) for (let i = 0; i < 12; i++) b.add(new THREE.BoxGeometry(0.4, 0.12, 0.01), k.plain('awnStripe', '#ffffff', 0.85), -4.4 + i * 0.8, 2.98, 1.05);
    // expansões fechadas: porta de aço + "aluga-se"
    for (const [ex, need] of [[7, 1], [-7, 2]] as const) {
      const open = r.exp >= need;
      const xa = ex - 2;
      const xb = ex + 2;
      this.wall(b, ext, xa - 0.2, 0, xa + 0.2, 0, 0, top);
      this.wall(b, ext, xb - 0.2, 0, xb + 0.2, 0, 0, top);
      this.wall(b, ext, xa, 0, xb, 0, 2.8, top, false);
      if (!open) {
        b.add(new THREE.BoxGeometry(xb - xa - 0.4, 2.8, 0.08), k.surf('shutterFront', 'shutter', { rough: 1, envK: 0.6, metal: 0.5 }), ex, 1.4, 0.05);
        b.add(new THREE.PlaneGeometry(0.9, 0.45), k.canvasMat('rent', rentCanvas()), ex, 1.7, 0.1);
        this.colliders.push({ x0: xa, z0: -0.15, x1: xb, z1: 0.15 });
        this.physBoxes.push([ex, 1.4, 0, 2, 1.4, 0.15]);
      } else {
        b.addW(new THREE.BoxGeometry(xb - xa - 0.4, 0.45, T), ext, ex, 0.225, 0);
        b.add(new THREE.PlaneGeometry(xb - xa - 0.4, 2.3), k.glass('shopGlass', '#e6f6ff', 0.16), ex, 1.62, 0.01);
        b.add(rbox(xb - xa - 0.4, 0.08, 0.14, 0.02, 1), metal, ex, 2.78, 0.02);
        this.colliders.push({ x0: xa, z0: -0.15, x1: xb, z1: 0.15 });
        this.physBoxes.push([ex, 1.4, 0, 2, 1.4, 0.15]);
      }
      // parede interna entre a loja e a expansão fechada
      if (!open) {
        const wx = ex > 0 ? 5 : -5;
        this.wall(b, this.wallMat, wx - T / 2, LAY.zBack, wx + T / 2, 0, 0, LAY.H);
      }
    }
    void segs;
    void x0;
    void x1;
    // marquise de concreto
    b.addW(rbox(Math.max(10.8, x1 - x0 + 0.8), 0.18, 1.0, 0.04, 2), k.surf('marquee', 'concrete', { rough: 1, color: '#efe8e4' }), (x0 + x1) / 2, top, 0.4);
    this.facade.add(b.build({ receive: true }));
    void H;
  }

  private buildSign(): void {
    const k = this.kit;
    const r = this.r;
    const cv = signCanvas(r.sign, 1024, 220);
    const glow = r.sign === 'neon' ? 1.6 : r.sign === 'box' ? 0.8 : r.sign === 'flowers' ? 0.3 : r.sign === 'none' ? 0 : 0.15;
    const m = k.canvasMat('sign-' + r.sign, cv, { emissive: glow, rough: r.sign === 'gold' ? 0.4 : 0.6 });
    const w = 6.2;
    const h = (w * 220) / 1024;
    const b = new Builder();
    if (r.sign !== 'none' && r.sign !== 'simple') b.add(rbox(w + 0.1, h + 0.1, 0.18, 0.05, 2), k.plain('signBox', r.sign === 'neon' ? '#1e1020' : r.sign === 'gold' ? '#e8ddd4' : '#ffffff', 0.4), 0, 3.95, 0.12);
    b.add(new THREE.PlaneGeometry(w, h), m, 0, 3.95, r.sign === 'none' || r.sign === 'simple' ? 0.115 : 0.215);
    if (r.sign === 'flowers') {
      const fl = [k.plain('fl1', '#ff9ac4', 0.6), k.plain('fl2', '#ffffff', 0.6), k.plain('fl3', '#ff5fa2', 0.6)];
      for (let i = 0; i < 40; i++) {
        const g = new THREE.IcosahedronGeometry(0.08 + (i % 3) * 0.03, 1);
        const a = (i / 40) * Math.PI * 2;
        b.add(g, fl[i % 3], Math.cos(a) * (w / 2 + 0.05), 3.95 + Math.sin(a) * (h / 2 + 0.05), 0.25);
      }
    }
    this.signG.add(b.build());
  }

  /* ------------------------------ luzes ------------------------------ */
  private buildLights(): void {
    const k = this.kit;
    const r = this.r;
    const { x0, x1 } = floorBounds(r.exp);
    const b = new Builder();
    const H = LAY.H;
    this.flick = null;
    if (r.light === 0) {
      // uma lâmpada pendurada piscando
      const m = k.plain('bulbOld', '#fff4d0', 0.4, 0, { emissive: '#ffe0a0', ei: 1.5 });
      this.flick = m;
      b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), k.plain('wire', '#222', 0.6), 0, H - 0.3, -5);
      b.add(new THREE.SphereGeometry(0.06, 10, 8), m, 0, H - 0.65, -5);
    } else if (r.light === 1) {
      const m = k.plain('panelLed', '#ffffff', 0.5, 0, { emissive: '#ffffff', ei: 1.1 });
      for (let x = x0 + 1.5; x < x1 - 0.5; x += 3) for (let z = -2; z > LAY.zB; z -= 3.3) b.add(rbox(1.2, 0.04, 0.3, 0.01, 1), m, x, H - 0.02, z);
    } else if (r.light === 2) {
      const m = k.plain('spotLed', '#fffaf0', 0.5, 0, { emissive: '#fff0d8', ei: 2.2 });
      const ring = k.plain('spotRing', '#f0f0f0', 0.3, 0.6);
      for (let x = x0 + 1; x < x1 - 0.3; x += 1.6)
        for (let z = -1.5; z > LAY.zB; z -= 1.8) {
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
      for (let x = x0 + 1.5; x < x1 - 0.5; x += 2.2)
        for (let z = -2; z > LAY.zB; z -= 2.6) {
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
    b.add(rbox(1.2, 0.05, 0.18, 0.02, 1), k.plain('fluor', '#ffffff', 0.5, 0, { emissive: '#f4fbff', ei: 1 }), 0, H - 0.04, -14);
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
    if (r.light === 0) pools.add(pg(), pm, 0, 0.014, -5, 0, 0, 0, 3.2, 1, 3.2);
    else {
      const step = r.light === 2 ? 3.2 : 2.6;
      for (let x = x0 + 1.6; x < x1 - 0.6; x += step) for (let z = -2; z > LAY.zB + 0.6; z -= 3.3) pools.add(pg(), pm, x, 0.014, z, 0, 0, 0, 3.6, 1, 3.6);
      // lavagem nas paredes laterais
      const wm = k.canvasMat('wash' + (warm ? 'w' : 'c'), washCanvas(warm ? '255,224,185' : '240,245,255'), { basic: true, transparent: true }) as THREE.MeshBasicMaterial;
      wm.blending = THREE.AdditiveBlending;
      wm.depthWrite = false;
      wm.opacity = amt * 0.8;
      for (let z = -1.6; z > LAY.zB + 0.5; z -= 2.2) {
        pools.add(new THREE.PlaneGeometry(1.6, H), wm, x0 + 0.03, H / 2, z, 0, Math.PI / 2, 0);
        pools.add(new THREE.PlaneGeometry(1.6, H), wm, x1 - 0.03, H / 2, z, 0, -Math.PI / 2, 0);
      }
    }
    const pg2 = pools.build({ receive: false });
    pg2.traverse((o) => (o.renderOrder = 3));
    this.lightsG.add(pg2);
    // luzes de verdade (só em aparelhos bons): dão volume aos móveis
    if (k.tier >= 2 && r.light >= 1) {
      for (const z of [-3.5, -8.5]) {
        const pl = new THREE.PointLight(warm ? '#ffe2c0' : '#f4f8ff', 3 + r.light * 1.5, 10, 1.4);
        pl.position.set((x0 + x1) / 2, H - 0.4, z);
        this.lightsG.add(pl);
      }
    }
  }

  private buildFloor(): void {
    const k = this.kit;
    const r = this.r;
    const { x0, x1 } = floorBounds(r.exp);
    const id = r.floor === 'broken' ? 'concreteBroken' : r.floor;
    const m = k.surf('floor-' + id, id, { rough: 1, envK: id === 'marble' || id === 'tile' || id === 'terrazzo' ? 1.0 : 0.5, normalK: id === 'concreteBroken' ? 1.4 : 0.8 });
    const g = new THREE.PlaneGeometry(x1 - x0, -LAY.zB);
    g.rotateX(-Math.PI / 2);
    const b = new Builder();
    b.addW(g, m, (x0 + x1) / 2, 0, LAY.zB / 2);
    const g2 = new THREE.PlaneGeometry(x1 - x0, LAY.zB - LAY.zBack);
    g2.rotateX(-Math.PI / 2);
    b.addW(g2, k.surf('floor-concrete', 'concrete', { rough: 1, envK: 0.5, normalK: 0.8 }), (x0 + x1) / 2, 0, (LAY.zB + LAY.zBack) / 2);
    // soleira da porta
    b.add(rbox(LAY.door * 2 + 0.2, 0.02, 0.3, 0.008, 1), k.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 }), 0, 0.01, 0);
    const fg = b.build({ receive: true });
    this.floorG.add(fg);
  }

  /** anima portas (abre quando alguém está perto) e lâmpada velha piscando */
  update(dt: number, time: number, near: boolean, shutterWant: number): void {
    const want = near ? 1 : 0;
    this.doorOpen += (want - this.doorOpen) * Math.min(1, dt * 5);
    const D = LAY.door;
    if (this.doorL && this.doorR) {
      this.doorL.position.x = -D / 2 - this.doorOpen * (D - 0.06);
      this.doorR.position.x = D / 2 + this.doorOpen * (D - 0.06);
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

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.root.removeFromParent();
  }
}
