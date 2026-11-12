/* ============================================================
 *  BLOOP PINK — a vida do dono: apartamento no prédio da mesma quadra.
 *  Portaria na rua (x≈10,6) → escada → corredor do 2º andar → apartamento:
 *  quarto (cama: DORMIR encerra o dia), banheiro (chuveiro: minigame de espuma e
 *  enxágue), pia com louça (lavar), cama para arrumar, saquinho de lixo para a
 *  lixeira do prédio. Sem banho o "cheirinho" cai e os clientes reclamam ("tá fedendo").
 *  O interior fica longe (atrás do quarteirão, z≈-70), fechado; entra/sai com fade.
 * ============================================================ */
import * as THREE from 'three';
import type { FpBox } from '../../3d/fpkit';
import { t } from '../../i18n';
import { sfx } from '../../audio';
import type { Kit } from './mats';
import { Builder, rbox } from './shapes';
import { ic } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const X0 = 0;
const Z0 = -70;
const H = 2.8;
export const wx = (x: number) => X0 + x;
export const wz = (z: number) => Z0 + z;

export interface HomeSave {
  /** cheirinho 0..100 (banho = 100) */
  fresh: number;
  /** pratos sujos na pia */
  dishes: number;
  /** cama arrumada */
  bed: boolean;
  /** tem saquinho de lixo no quarto */
  trash: boolean;
}
export const HOME0: HomeSave = { fresh: 100, dishes: 0, bed: true, trash: false };

export type HomeSpot = 'stairs' | 'bed' | 'shower' | 'sink' | 'chute';
export class Home {
  readonly root = new THREE.Group();
  readonly colliders: FpBox[] = [];
  /** pontos de interação (mundo) */
  readonly spots: { k: HomeSpot; p: THREE.Vector3; r: number }[] = [];
  private dishesG = new THREE.Group();
  private blanket: THREE.Object3D | null = null;
  private blanketMessy: THREE.Object3D | null = null;
  /** onde o jogador chega subindo a escada / acorda */
  readonly arrive = { x: wx(2.4), z: wz(1.1), yaw: -Math.PI / 2 };
  readonly wake = { x: wx(13.2), z: wz(2.0), yaw: Math.PI / 2 };
  readonly trashAt = { x: wx(11.2), z: wz(0.2) };
  constructor(private kit: Kit) {
    this.build();
  }
  private wall(b: Builder, m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y1 = H): void {
    const w = Math.max(0.12, Math.abs(x1 - x0));
    const d = Math.max(0.12, Math.abs(z1 - z0));
    b.addW(new THREE.BoxGeometry(w, y1, d), m, wx((x0 + x1) / 2), y1 / 2, wz((z0 + z1) / 2));
    this.colliders.push({ x0: wx(Math.min(x0, x1)) - (w === 0.12 ? 0.06 : 0), z0: wz(Math.min(z0, z1)) - (d === 0.12 ? 0.06 : 0), x1: wx(Math.max(x0, x1)) + (w === 0.12 ? 0.06 : 0), z1: wz(Math.max(z0, z1)) + (d === 0.12 ? 0.06 : 0) });
  }
  private box(x0: number, z0: number, x1: number, z1: number): void {
    this.colliders.push({ x0: wx(x0), z0: wz(z0), x1: wx(x1), z1: wz(z1) });
  }
  private build(): void {
    const k = this.kit;
    const b = new Builder();
    const corr = k.surf('homeCorr', 'plaster', { color: '#efe6da', rough: 1, envK: 0.3 });
    const room = k.surf('homeRoom', 'plaster', { color: '#ffe3ef', rough: 1, envK: 0.3 });
    const tile = k.surf('homeTile', 'tile', { rough: 0.8, envK: 0.8 });
    const wood = k.surf('homeWood', 'wood', { rough: 0.8, envK: 0.5 });
    const ceil = k.surf('ceiling', 'ceiling', { rough: 1, envK: 0.2 });
    const white = k.plain('lacq', '#f7f1ef', 0.32, 0, { envK: 0.7 });
    const chrome = k.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 });
    // pisos e teto: corredor x 0..10, z 0..2.2 · apartamento x 10..15.6, z -1.6..4.6
    const floor = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
      b.addW(g, m, wx((x0 + x1) / 2), 0, wz((z0 + z1) / 2));
      const c = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2);
      b.addW(c, ceil, wx((x0 + x1) / 2), H, wz((z0 + z1) / 2));
    };
    floor(1.6, 10, 0, 2.2, tile);
    floor(10, 15.6, -1.6, 4.6, wood);
    // corredor
    this.wall(b, corr, -0.1, -0.06, 10, -0.06);
    this.wall(b, corr, -0.1, 2.26, 10, 2.26);
    this.wall(b, corr, -0.06, 0, -0.06, 2.2);
    // escada descendo (poço com degraus e corrimão)
    const step = k.plain('stairStep', '#c8b8a8', 0.8);
    for (let i = 0; i < 7; i++) b.add(new THREE.BoxGeometry(0.26, 0.08, 1.9), step, wx(1.45 - i * 0.22), -0.12 - i * 0.2, wz(1.1));
    b.add(new THREE.PlaneGeometry(1.6, 2.2).rotateX(-Math.PI / 2), k.plain('stairDark', '#3a3036', 1), wx(0.8), -1.6, wz(1.1));
    b.add(rbox(0.05, 0.05, 2.0, 0.02, 1), chrome, wx(1.6), 0.95, wz(1.1));
    for (const z of [0.2, 1.1, 2.0]) b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), chrome, wx(1.6), 0.47, wz(z));
    this.box(-0.2, 0, 1.55, 2.2);
    this.spots.push({ k: 'stairs', p: new THREE.Vector3(wx(1.1), 0.4, wz(1.1)), r: 2.0 });
    // portas dos vizinhos + lixeira do prédio
    const doorM = k.surf('aptDoor', 'wood', { rough: 0.7, color: '#a8744a' });
    for (const x of [4, 7.4]) {
      b.add(rbox(1.0, 2.1, 0.06, 0.02, 2), doorM, wx(x), 1.05, wz(2.2));
      b.add(new THREE.SphereGeometry(0.04, 8, 6), chrome, wx(x + 0.35), 1.0, wz(2.15));
    }
    b.add(rbox(0.7, 1.0, 0.5, 0.05, 2), k.plain('chute', '#5a7a5a', 0.5), wx(5.6), 0.5, wz(0.25));
    b.add(rbox(0.6, 0.05, 0.4, 0.02, 1), k.plain('chuteLid', '#3a5a3a', 0.5), wx(5.6), 1.02, wz(0.25));
    this.box(5.25, 0, 5.95, 0.55);
    this.spots.push({ k: 'chute', p: new THREE.Vector3(wx(5.6), 0.8, wz(0.3)), r: 1.6 });
    // luminárias do corredor
    const lampM = k.plain('homeLamp', '#fff', 0.5, 0, { emissive: '#fff4e0', ei: 1.4 });
    for (const x of [3, 6.5, 9]) b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), lampM, wx(x), H - 0.02, wz(1.1));
    // apartamento: paredes (porta aberta no corredor z 0.3..1.9)
    this.wall(b, room, 10, -1.6, 10, 0.25);
    this.wall(b, room, 10, 1.95, 10, 4.6);
    this.wall(b, room, 10, -1.66, 15.6, -1.66);
    this.wall(b, room, 10, 4.66, 15.6, 4.66);
    this.wall(b, room, 15.66, -1.6, 15.66, 4.6);
    b.add(rbox(0.12, 0.6, 1.7, 0.02, 1), room, wx(10), H - 0.3, wz(1.1));
    // janela com vista da rua (desenho)
    b.add(new THREE.PlaneGeometry(1.6, 1.2), k.canvasMat('homeView', viewCanvas(), { emissive: 0.5 }), wx(15.6), 1.6, wz(1.0), 0, -Math.PI / 2, 0);
    b.add(rbox(0.08, 1.36, 1.76, 0.02, 1), white, wx(15.58), 1.6, wz(1.0));
    // cama (lado direito), criado-mudo, guarda-roupa
    b.add(rbox(1.5, 0.4, 2.1, 0.06, 2), white, wx(14.7), 0.2, wz(3.4));
    b.add(rbox(1.5, 0.9, 0.1, 0.04, 2), white, wx(14.7), 0.55, wz(4.5));
    b.add(rbox(1.4, 0.16, 2.0, 0.08, 3), k.plain('mattress', '#ffffff', 0.8), wx(14.7), 0.48, wz(3.4));
    b.add(rbox(0.6, 0.14, 0.35, 0.07, 3), k.plain('pillow', '#fff3f8', 0.8), wx(14.7), 0.62, wz(4.2));
    this.box(13.9, 2.3, 15.5, 4.6);
    this.spots.push({ k: 'bed', p: new THREE.Vector3(wx(14.6), 0.6, wz(3.2)), r: 2.2 });
    const blanketM = k.plain('blanket', '#ff8cc0', 0.85);
    const bl = new THREE.Mesh(rbox(1.46, 0.08, 1.4, 0.04, 2), blanketM);
    bl.position.set(wx(14.7), 0.58, wz(3.05));
    const blm = new THREE.Mesh(rbox(1.3, 0.22, 1.2, 0.1, 3), blanketM);
    blm.position.set(wx(14.4), 0.62, wz(3.0));
    blm.rotation.set(0.15, 0.5, 0.2);
    this.root.add(bl, blm);
    this.blanket = bl;
    this.blanketMessy = blm;
    b.add(rbox(0.5, 0.5, 0.45, 0.04, 2), white, wx(13.6), 0.25, wz(4.3));
    b.add(new THREE.CylinderGeometry(0.1, 0.14, 0.26, 16), k.plain('lampShade', '#fff3e0', 0.8, 0, { emissive: '#ffe2b8', ei: 0.8 }), wx(13.6), 0.68, wz(4.3));
    b.add(rbox(1.2, 2.2, 0.6, 0.04, 2), k.plain('wardrobe', '#f2b3c9', 0.36, 0, { envK: 0.7 }), wx(15.2), 1.1, wz(-0.9), 0, Math.PI / 2, 0);
    this.box(14.85, -1.6, 15.6, -0.25);
    // cozinha: bancada com pia (louça) e geladeirinha
    b.add(rbox(1.8, 0.9, 0.6, 0.03, 2), white, wx(11.6), 0.45, wz(-1.3));
    b.add(rbox(1.84, 0.05, 0.64, 0.02, 1), k.surf('marbleTop', 'marble', { rough: 0.6, envK: 1.1 }), wx(11.6), 0.92, wz(-1.3));
    b.add(rbox(0.6, 0.14, 0.4, 0.04, 2), k.plain('sink', '#c8ccd4', 0.25, 0.8, { envK: 1.2 }), wx(11.4), 0.88, wz(-1.28));
    b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), chrome, wx(11.4), 1.08, wz(-1.5));
    b.add(rbox(0.6, 1.3, 0.6, 0.06, 2), k.plain('fridgeW', '#f4f4f8', 0.3, 0.1), wx(12.85), 0.65, wz(-1.3));
    this.box(10.6, -1.6, 13.2, -0.95);
    this.spots.push({ k: 'sink', p: new THREE.Vector3(wx(11.4), 0.95, wz(-1.2)), r: 1.8 });
    this.dishesG.position.set(wx(11.4), 0.95, wz(-1.28));
    this.root.add(this.dishesG);
    // banheiro: canto x 10..12.3, z 2.7..4.6 com box de vidro e chuveiro
    this.wall(b, k.surf('bathTile', 'tile', { rough: 0.6, envK: 1, color: '#d6f0ff' }), 12.3, 3.2, 12.3, 4.6);
    this.wall(b, k.surf('bathTile', 'tile', { rough: 0.6, envK: 1, color: '#d6f0ff' }), 10, 2.7, 11.2, 2.7);
    b.add(new THREE.PlaneGeometry(1.1, 2.0), k.glass('boxGlass', '#e6f6ff', 0.25), wx(11.75), 1.0, wz(2.7));
    b.add(new THREE.PlaneGeometry(2.3, 1.9).rotateX(-Math.PI / 2), k.surf('bathTile', 'tile', { rough: 0.6, envK: 1, color: '#d6f0ff' }), wx(11.15), 0.006, wz(3.65));
    b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), chrome, wx(10.5), 2.2, wz(4.4));
    b.add(new THREE.CylinderGeometry(0.14, 0.12, 0.04, 16), chrome, wx(10.6), 1.86, wz(4.2));
    this.spots.push({ k: 'shower', p: new THREE.Vector3(wx(10.9), 1.2, wz(3.9)), r: 2.0 });
    // tapetinho e luminária do quarto
    b.add(new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2), k.plain('homeRug', '#ffc6de', 0.95), wx(13), 0.005, wz(1.2));
    b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), lampM, wx(13), H - 0.03, wz(1.4));
    this.root.add(b.build({ receive: true }));
    // luz própria (o interior é fechado)
    const pl = new THREE.PointLight('#fff1e0', 6, 9, 1.4);
    pl.position.set(wx(13), H - 0.4, wz(1.4));
    const pl2 = new THREE.PointLight('#fff8f0', 4, 9, 1.4);
    pl2.position.set(wx(5), H - 0.4, wz(1.1));
    this.root.add(pl, pl2);
  }
  /** aparência conforme o save (louça, cama) */
  sync(h: HomeSave): void {
    if (this.blanket) this.blanket.visible = h.bed;
    if (this.blanketMessy) this.blanketMessy.visible = !h.bed;
    while (this.dishesG.children.length > h.dishes) {
      const c = this.dishesG.children[this.dishesG.children.length - 1];
      c.removeFromParent();
      (c as THREE.Mesh).geometry?.dispose();
    }
    const m = this.kit.plain('plate', '#ffffff', 0.3, 0, { envK: 1 });
    const dirt = this.kit.plain('plateDirt', '#c89a6a', 0.9);
    while (this.dishesG.children.length < h.dishes) {
      const i = this.dishesG.children.length;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.02, 20), m));
      const sp = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10).rotateX(-Math.PI / 2), dirt);
      sp.position.set(0.02, 0.012, 0.01);
      g.add(sp);
      g.position.set((i % 2) * 0.05 - 0.02, 0.0 + i * 0.025, 0);
      g.rotation.y = i;
      this.dishesG.add(g);
    }
  }
  /** ponto de interação mirado */
  aim(ray: THREE.Ray, px: number, pz: number): HomeSpot | null {
    const v = new THREE.Vector3();
    for (const s of this.spots) {
      if (Math.hypot(px - s.p.x, pz - s.p.z) > s.r + 0.6) continue;
      v.copy(s.p).sub(ray.origin);
      const along = v.dot(ray.direction);
      if (along < 0.1 || along > s.r + 0.8) continue;
      if (v.lengthSq() - along * along < 0.7 * 0.7) return s.k;
    }
    return null;
  }
  /** jogador está dentro do prédio? */
  inside(x: number, z: number): boolean {
    return z < wz(5) && z > wz(-3) && x > wx(-1) && x < wx(17);
  }
  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.root.removeFromParent();
  }
}

function viewCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, '#9fd6ff');
  g.addColorStop(1, '#ffe3ef');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 192);
  const cols = ['#e8d0b8', '#c8d8e0', '#f0e0d0', '#d8c8e8'];
  for (let i = 0; i < 6; i++) {
    x.fillStyle = cols[i % 4];
    const h = 60 + ((i * 37) % 70);
    x.fillRect(i * 44, 192 - h, 40, h);
    x.fillStyle = '#ffffffaa';
    for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) x.fillRect(i * 44 + 6 + q * 18, 192 - h + 8 + r * 16, 10, 9);
  }
  return c;
}

/** chuveiro: esfregar (espuma) e enxaguar (segurar) */
export function showerGame(host: { panel(h: string): HTMLDivElement; closePanel(): void }, done: (ok: boolean) => void): void {
  const d = host.panel(`<div class="pk-shower"><h2>${ic('shower', 30)}${esc(t('pink.home.shower', 'Hora do banho!'))}</h2>
    <div class="ask">${ic('hand', 22)}<span class="msg">${esc(t('pink.home.scrub', 'Esfregue para fazer espuma!'))}</span></div>
    <div class="stall"><canvas width="220" height="200"></canvas><div class="foam"></div><div class="water"></div></div>
    <div class="pk-row"><div class="meter"><b></b></div><button class="pk-b g rinse" disabled>${ic('shower', 26)}${esc(t('pink.home.rinse', 'Enxaguar'))}</button><button class="pk-b w" data-a="x">${ic('close', 22)}</button></div></div>`);
  const cv = d.querySelector('canvas') as HTMLCanvasElement;
  const x = cv.getContext('2d')!;
  const foam = d.querySelector('.foam') as HTMLElement;
  const meter = d.querySelector('.meter b') as HTMLElement;
  const rinse = d.querySelector('.rinse') as HTMLButtonElement;
  const water = d.querySelector('.water') as HTMLElement;
  const msg = d.querySelector('.msg') as HTMLElement;
  let scrub = 0;
  let wet = 0;
  let holding = false;
  let fin = false;
  // Bloop no chuveiro (desenho simples: corpo redondo + olhinhos)
  const drawB = (k: number) => {
    x.clearRect(0, 0, 220, 200);
    x.fillStyle = '#ff8cc0';
    x.beginPath();
    x.ellipse(110, 120, 62, 66, 0, 0, 7);
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = '#3a0d2a';
    x.stroke();
    x.fillStyle = '#3a0d2a';
    x.beginPath();
    x.arc(88, 108, 8, 0, 7);
    x.arc(132, 108, 8, 0, 7);
    x.fill();
    x.beginPath();
    x.lineWidth = 4;
    x.arc(110, 128, 16, 0.2, Math.PI - 0.2);
    x.stroke();
    // nuvem verde de "fedor" some com a espuma
    x.globalAlpha = Math.max(0, 0.7 - k * 0.7);
    x.strokeStyle = '#8ab83a';
    x.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      for (let y = 0; y < 50; y += 4) x.lineTo(60 + i * 50 + Math.sin(y * 0.3) * 6, 50 - y);
      x.stroke();
    }
    x.globalAlpha = 1;
  };
  drawB(0);
  const bubble = (px: number, py: number) => {
    const b = document.createElement('i');
    const r = 14 + Math.random() * 18;
    b.style.cssText = `left:${px - r / 2}px;top:${py - r / 2}px;width:${r}px;height:${r}px`;
    foam.appendChild(b);
  };
  let last = 0;
  cv.addEventListener('pointermove', (e) => {
    if (fin || !(e.buttons || e.pointerType === 'touch')) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const now = performance.now();
    if (now - last < 40) return;
    last = now;
    bubble(px, py);
    scrub = Math.min(1, scrub + 0.035);
    meter.style.width = scrub * 100 + '%';
    drawB(scrub);
    if (Math.random() < 0.3) sfx.play('brush');
    if (scrub >= 1 && rinse.disabled) {
      rinse.disabled = false;
      msg.textContent = t('pink.home.hold', 'Segure para enxaguar!');
      sfx.play('sparkle');
    }
  });
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    bubble(e.clientX - r.left, e.clientY - r.top);
    scrub = Math.min(1, scrub + 0.03);
    meter.style.width = scrub * 100 + '%';
  });
  const tick = () => {
    if (fin || !d.isConnected) return;
    if (holding) {
      wet += 0.025;
      water.style.opacity = '1';
      foam.style.opacity = String(Math.max(0, 1 - wet));
      if (Math.random() < 0.15) sfx.play('shower', { db: -6 });
      if (wet >= 1) {
        fin = true;
        sfx.play('goal');
        window.setTimeout(() => {
          host.closePanel();
          done(true);
        }, 400);
        return;
      }
    } else water.style.opacity = '0';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  rinse.addEventListener('pointerdown', () => (holding = !rinse.disabled));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) rinse.addEventListener(ev, () => (holding = false));
  d.querySelector('[data-a=x]')!.addEventListener('click', () => {
    fin = true;
    host.closePanel();
    done(false);
  });
}
