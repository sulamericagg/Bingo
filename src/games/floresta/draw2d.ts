/* ============================================================
 *  LENHADORES DO BOSQUE — desenho 2D (vista lateral com paralaxe).
 *  Sprites de árvore/camadas são pré-renderizados (cache por escala);
 *  partículas em pool fixo; nada de canvas/degradê novo por quadro.
 * ============================================================ */
import { gameFont } from '../../i18n/font';
import { t } from '../../i18n';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS, type Skin } from '../../game/skins';
import { save as globalSave } from '../../core/storage';
import type { QualitySettings } from '../../core/quality';
import { glowSprite } from '../../gfx/light';
import { BIOMES, BUILDS, INTAKE_X, RARES, SPECIES, TOOLS, gateX, mulberry, short, type Species } from './data';
import { DRONE_PAD_X, PALLET_X, PLANER_X, SAW_X, SELL_X, TS, type Agent, type Ev, type Sim, type Tree } from './sim';

const TAU = Math.PI * 2;
const MAXP = 360;

interface P {
  on: boolean;
  kind: 0 | 1 | 2 | 3 | 4 | 5; // 0 lasca, 1 serragem, 2 folha, 3 brilho, 4 poeira, 5 tábua
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  color: string;
}
interface Pop {
  on: boolean;
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

export class Draw2D {
  canvas: HTMLCanvasElement;
  x: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  /** px por metro (CSS) */
  S = 30;
  gy = 0;
  camX = 0;
  shake = 0;
  q: QualitySettings;
  private parts: P[] = [];
  private pops: Pop[] = [];
  private treeSpr = new Map<number, { c: HTMLCanvasElement; ox: number; oy: number }>();
  private layerSpr = new Map<number, HTMLCanvasElement[]>();
  private skyGrad = new Map<number, CanvasGradient>();
  private heroSpr = new Map<string, HTMLCanvasElement>();
  private pose: PlayerPose = { t: 0, blink: 0, lookX: 0.4, lookY: 0, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
  private mySkin: Skin;
  private time = 0;
  private rand = mulberry(77);

  constructor(
    public root: HTMLElement,
    public sim: Sim,
    q: QualitySettings,
  ) {
    this.q = q;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fl-canvas';
    root.appendChild(this.canvas);
    this.x = this.canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i < MAXP; i++) this.parts.push({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, r: 1, rot: 0, vr: 0, life: 0, max: 1, color: '#fff' });
    for (let i = 0; i < 16; i++) this.pops.push({ on: false, x: 0, y: 0, t: 0, text: '', color: '#fff' });
    this.mySkin = SKINS.find((s) => s.id === globalSave.skin) ?? SKINS[0];
    this.resize();
    this.camX = sim.me.x;
  }

  setQuality(q: QualitySettings): void {
    this.q = q;
    this.resize();
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.S = Math.min(h / 16, w / 13);
    this.gy = h * (h > w ? 0.74 : 0.8);
    this.treeSpr.clear();
    this.layerSpr.clear();
    this.skyGrad.clear();
    this.heroSpr.clear();
  }

  destroy(): void {
    this.canvas.remove();
  }

  /* ------------------------------ coordenadas ------------------------------ */

  sx(x: number): number {
    return (x - this.camX) * this.S + this.W / 2;
  }
  /** y do chão para uma profundidade z (atrás = mais alto) */
  depthY(z: number): number {
    return this.gy + (z < 0 ? -0.9 : 0.55) * this.S;
  }

  /* ------------------------------ partículas ------------------------------ */

  private spawn(kind: P['kind'], x: number, y: number, vx: number, vy: number, r: number, life: number, color: string): void {
    if (kind !== 3 && this.rand() > this.q.particleBudget) return;
    for (const p of this.parts) {
      if (p.on) continue;
      p.on = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.r = r;
      p.rot = this.rand() * TAU;
      p.vr = (this.rand() - 0.5) * 12;
      p.life = p.max = life;
      p.color = color;
      return;
    }
  }

  pop(x: number, y: number, text: string, color = '#fff6b0'): void {
    for (const p of this.pops) {
      if (p.on) continue;
      p.on = true;
      p.x = x;
      p.y = y;
      p.t = 0;
      p.text = text;
      p.color = color;
      return;
    }
  }

  onEvent(e: Ev): void {
    const r = this.rand;
    const S = this.S;
    switch (e.type) {
      case 'chip': {
        const sp = SPECIES[e.a];
        const px = this.sx(e.x);
        const py = this.depthY(e.z) - e.y * S;
        const n = e.b === 2 ? 4 : 7;
        for (let i = 0; i < n; i++) this.spawn(e.b === 2 ? 3 : 0, px, py, (r() - 0.5) * 8 * S, -(2 + r() * 5) * S, S * (0.08 + r() * 0.08), 0.6 + r() * 0.4, e.b === 2 ? '#9ff6ff' : r() < 0.5 ? sp.trunk : '#ffe2b0');
        for (let i = 0; i < 3; i++) this.spawn(1, px, py, (r() - 0.5) * 4 * S, -(1 + r() * 2) * S, S * 0.04, 0.8, '#f3d9a8');
        if (r() < 0.6) this.spawn(2, px, py - sp.h * S * 0.6, (r() - 0.5) * 2 * S, S * 0.5, S * 0.14, 2.2, sp.leaf);
        if (this.q.shake) this.shake = Math.max(this.shake, 2);
        break;
      }
      case 'fell':
        for (let i = 0; i < 10; i++) this.spawn(2, this.sx(e.x) + (r() - 0.5) * S * 3, this.depthY(e.z) - SPECIES[this.sim.trees[e.a].sp].h * S * 0.7, (r() - 0.5) * 3 * S, S * 0.3, S * 0.16, 2.6, SPECIES[this.sim.trees[e.a].sp].leaf);
        break;
      case 'land': {
        const px = this.sx(e.x);
        const py = this.depthY(e.z);
        for (let i = 0; i < 12; i++) this.spawn(4, px + (r() - 0.5) * S * 4, py, (r() - 0.5) * 3 * S, -(0.5 + r()) * S, S * (0.3 + r() * 0.3), 0.9, 'rgba(230,210,170,0.6)');
        for (let i = 0; i < 8; i++) this.spawn(2, px + (r() - 0.5) * S * 4, py - S, (r() - 0.5) * 4 * S, -(1 + r() * 3) * S, S * 0.15, 2, SPECIES[e.a].leaf);
        if (this.q.shake && e.b >= 0) this.shake = Math.max(this.shake, 7);
        break;
      }
      case 'pickup':
        if (e.b > 0) this.pop(this.sx(e.x), this.depthY(0) - S * 2.2, '+1', '#ffe2b0');
        break;
      case 'saw':
        for (let i = 0; i < 14; i++) this.spawn(1, this.sx(SAW_X - 0.8), this.gy - S * 1.3, -(1 + r() * 4) * S, -(1 + r() * 3) * S, S * 0.05, 1, '#ffe6b8');
        break;
      case 'plank':
        if (e.b === 1) for (let i = 0; i < 6; i++) this.spawn(1, this.sx(PLANER_X), this.gy - S * 1.2, (r() - 0.5) * 3 * S, -(1 + r() * 2) * S, S * 0.05, 0.9, '#fff3d0');
        break;
      case 'sell':
        this.pop(this.sx(SELL_X), this.gy - S * 3.2, '+' + short(e.a), '#ffd34a');
        for (let i = 0; i < 14; i++) this.spawn(3, this.sx(SELL_X), this.gy - S * 2, (r() - 0.5) * 6 * S, -(2 + r() * 4) * S, S * 0.12, 1.2, '#ffd34a');
        break;
      case 'build':
        for (let i = 0; i < 30; i++) this.spawn(3, this.sx(e.x) + (r() - 0.5) * S * 4, this.gy - S * (1 + r() * 4), (r() - 0.5) * 5 * S, -(1 + r() * 3) * S, S * 0.14, 1.6, r() < 0.5 ? '#ffd34a' : '#7affc4');
        break;
      case 'rare':
        this.pop(this.sx(e.x), this.depthY(e.z) - e.y * S, RARES[e.a].name() + '!', RARES[e.a].color);
        for (let i = 0; i < 20; i++) this.spawn(3, this.sx(e.x), this.depthY(e.z) - e.y * S, (r() - 0.5) * 7 * S, -(r() * 5) * S, S * 0.13, 1.4, RARES[e.a].color);
        break;
      case 'grow':
      case 'plant':
        for (let i = 0; i < 5; i++) this.spawn(3, this.sx(e.x) + (r() - 0.5) * S, this.depthY(e.z) - S * 0.4, (r() - 0.5) * S, -(1 + r()) * S, S * 0.08, 0.9, '#9cff8a');
        break;
      case 'buy':
        for (let i = 0; i < 16; i++) this.spawn(3, this.sx(e.x), this.gy - S * 1.5, (r() - 0.5) * 6 * S, -(2 + r() * 3) * S, S * 0.12, 1, r() < 0.5 ? '#ffd34a' : '#ffffff');
        break;
      case 'swing':
        break;
      case 'deliver':
        if (r() < 0.5) this.spawn(1, this.sx(INTAKE_X), this.gy - S * 2, (r() - 0.5) * S, -S, S * 0.05, 0.6, '#e8c890');
        break;
    }
  }

  /* ------------------------------ sprites ------------------------------ */

  private sky(b: number): CanvasGradient {
    let g = this.skyGrad.get(b);
    if (!g) {
      const c = BIOMES[b].sky;
      g = this.x.createLinearGradient(0, 0, 0, this.gy);
      g.addColorStop(0, c[0]);
      g.addColorStop(0.6, c[1]);
      g.addColorStop(1, c[2]);
      this.skyGrad.set(b, g);
    }
    return g;
  }

  /** camadas de paralaxe: [longe, meio] — faixas repetíveis de largura L */
  private layers(b: number): HTMLCanvasElement[] {
    let arr = this.layerSpr.get(b);
    if (arr) return arr;
    const B = BIOMES[b];
    const L = Math.ceil(Math.max(this.W, 480) * this.dpr);
    const H = Math.ceil(this.gy * this.dpr);
    arr = [];
    const r = mulberry(b * 31 + 5);
    for (let layer = 0; layer < 2; layer++) {
      const [c, x] = mk(L, H);
      const base = H * (layer === 0 ? 0.72 : 0.84);
      const amp = H * (layer === 0 ? 0.1 : 0.05);
      x.fillStyle = layer === 0 ? B.far : B.mid;
      x.beginPath();
      x.moveTo(0, H);
      const k1 = 1 + Math.floor(r() * 2);
      const k2 = 2 + Math.floor(r() * 2);
      const p1 = r() * TAU;
      const p2 = r() * TAU;
      for (let i = 0; i <= 64; i++) {
        const u = i / 64;
        const y = base - amp * (Math.sin(u * TAU * k1 + p1) * 0.6 + Math.sin(u * TAU * k2 + p2) * 0.4);
        x.lineTo(u * L, y);
      }
      x.lineTo(L, H);
      x.closePath();
      x.fill();
      // silhuetas de árvores no meio
      if (layer === 1) {
        const sp = SPECIES[B.species];
        x.fillStyle = B.mid;
        const n = 14;
        for (let i = 0; i < n; i++) {
          const tx = (i + r() * 0.6) * (L / n);
          const th = H * (0.12 + r() * 0.1);
          const ty = base + amp * 0.3;
          this.silhouette(x, sp, tx, ty, th);
          if (tx < th) this.silhouette(x, sp, tx + L, ty, th);
          if (tx > L - th) this.silhouette(x, sp, tx - L, ty, th);
        }
        x.globalCompositeOperation = 'source-atop';
        x.fillStyle = 'rgba(255,255,255,0.12)';
        x.fillRect(0, 0, L, H * 0.7);
        x.globalCompositeOperation = 'source-over';
      }
      if (B.id === 'nuvens') {
        x.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 6; i++) {
          const cx = r() * L;
          const cy = H * (0.3 + layer * 0.3 + r() * 0.1);
          for (let k = 0; k < 4; k++) {
            x.beginPath();
            x.arc(cx + k * H * 0.05, cy - (k % 2) * H * 0.02, H * 0.05, 0, TAU);
            x.fill();
          }
        }
      }
      arr.push(c);
    }
    this.layerSpr.set(b, arr);
    return arr;
  }

  private silhouette(x: CanvasRenderingContext2D, sp: Species, tx: number, ty: number, th: number): void {
    x.beginPath();
    if (sp.shape === 'pine') {
      x.moveTo(tx, ty - th);
      x.lineTo(tx + th * 0.3, ty);
      x.lineTo(tx - th * 0.3, ty);
    } else if (sp.shape === 'mushroom') {
      x.rect(tx - th * 0.06, ty - th * 0.7, th * 0.12, th * 0.7);
      x.moveTo(tx - th * 0.4, ty - th * 0.6);
      x.quadraticCurveTo(tx, ty - th * 1.3, tx + th * 0.4, ty - th * 0.6);
    } else if (sp.shape === 'crystal') {
      x.moveTo(tx, ty - th);
      x.lineTo(tx + th * 0.18, ty - th * 0.4);
      x.lineTo(tx + th * 0.1, ty);
      x.lineTo(tx - th * 0.1, ty);
      x.lineTo(tx - th * 0.18, ty - th * 0.4);
    } else {
      x.rect(tx - th * 0.05, ty - th * 0.5, th * 0.1, th * 0.5);
      x.moveTo(tx + th * 0.32, ty - th * 0.65);
      x.arc(tx, ty - th * 0.65, th * 0.32, 0, TAU);
    }
    x.fill();
  }

  /** sprite da árvore (âncora: base do tronco) */
  private treeSprite(sp: number, rare: number, back: boolean): { c: HTMLCanvasElement; ox: number; oy: number } {
    const key = sp * 16 + rare * 2 + (back ? 1 : 0);
    let s = this.treeSpr.get(key);
    if (s) return s;
    const S = this.S * this.dpr * (back ? 0.82 : 1);
    const Sp = SPECIES[sp];
    const w = Sp.h * 0.85 * S + 8;
    const h = Sp.h * 1.08 * S + 8;
    const [c, x] = mk(w, h);
    const ox = w / 2;
    const oy = h - 4;
    x.translate(ox, oy);
    drawTree(x, Sp, rare, S);
    if (back) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(30,40,80,0.22)';
      x.fillRect(-ox, -oy, w, h);
    }
    s = { c, ox, oy };
    this.treeSpr.set(key, s);
    return s;
  }

  private hero(skinId: string): HTMLCanvasElement {
    let c = this.heroSpr.get(skinId);
    if (c) return c;
    const skin = skinId === 'me' ? this.mySkin : (SKINS.find((s) => s.id === skinId) ?? SKINS[0]);
    const rr = this.S * 0.62 * this.dpr;
    const size = Math.ceil(rr * 3.2);
    const [cv, x] = mk(size, size);
    x.translate(size / 2, size / 2);
    try {
      drawPlayer(x, skin, rr, this.pose);
    } catch {
      x.fillStyle = skin.light;
      x.beginPath();
      x.arc(0, 0, rr, 0, TAU);
      x.fill();
    }
    this.heroSpr.set(skinId, cv);
    return cv;
  }

  /* ------------------------------ quadro ------------------------------ */

  frame(dt: number): void {
    this.time += dt;
    const sim = this.sim;
    const x = this.x;
    const S = this.S;
    const W = this.W;
    const H = this.H;
    sim.drain((e) => this.onEvent(e));
    // câmera
    const lead = sim.me.face * Math.min(2.5, W / S / 6);
    const tx = sim.me.x + lead;
    this.camX += (tx - this.camX) * Math.min(1, dt * 4);
    const minCam = W / 2 / S - 0.5;
    if (this.camX < minCam) this.camX = minCam;
    this.shake = Math.max(0, this.shake - dt * 30);
    const shx = this.shake > 0 ? (this.rand() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (this.rand() - 0.5) * this.shake : 0;

    x.setTransform(this.dpr, 0, 0, this.dpr, shx * this.dpr, shy * this.dpr);
    const b = this.camX < gateX(0) ? 0 : Math.min(BIOMES.length - 1, Math.floor((this.camX - gateX(0)) / 110));
    const B = BIOMES[b];
    // céu
    x.fillStyle = this.sky(b);
    x.fillRect(-10, -10, W + 20, this.gy + 12);
    if (B.night) {
      x.fillStyle = '#fff';
      for (let i = 0; i < 26; i++) {
        const px = ((i * 97.3 - this.camX * 2) % W + W) % W;
        const py = (i * 53.7) % (this.gy * 0.5);
        x.globalAlpha = 0.4 + 0.4 * Math.sin(this.time * 2 + i);
        x.fillRect(px, py, 2, 2);
      }
      x.globalAlpha = 1;
    } else {
      // sol
      x.fillStyle = 'rgba(255,250,210,0.9)';
      x.beginPath();
      x.arc(W * 0.8, this.gy * 0.18, S * 1.3, 0, TAU);
      x.fill();
    }
    // paralaxe
    const ls = this.layers(b);
    const nl = this.q.starLayers >= 2 ? 2 : 1;
    for (let i = 0; i < nl; i++) {
      const c = ls[i];
      const lw = c.width / this.dpr;
      const f = i === 0 ? 0.12 : 0.3;
      let off = -((this.camX * S * f) % lw);
      if (off > 0) off -= lw;
      for (let px = off; px < W; px += lw) x.drawImage(c, px, 0, lw, this.gy);
    }
    // chão
    x.fillStyle = B.ground[0];
    x.fillRect(-10, this.gy - S * 1.2, W + 20, H - this.gy + S * 1.2 + 10);
    x.fillStyle = B.grass;
    x.fillRect(-10, this.gy - S * 1.25, W + 20, S * 0.3);
    x.fillStyle = B.ground[1];
    x.fillRect(-10, this.gy + S * 1.1, W + 20, H);
    // trilha
    x.fillStyle = 'rgba(255,240,200,0.18)';
    x.fillRect(-10, this.gy - S * 0.25, W + 20, S * 0.5);

    const vx0 = this.camX - W / 2 / S - 8;
    const vx1 = this.camX + W / 2 / S + 8;

    // árvores de trás
    this.drawTrees(true, vx0, vx1);
    // base / portões
    this.drawBase(vx0, vx1);
    this.drawGates(vx0, vx1);
    // toras
    this.drawLogs(vx0, vx1);
    // ajudantes no chão + remotos + eu
    for (const a of sim.agents) if (a.x > vx0 && a.x < vx1 && a.kind !== 'drone') this.drawAgent(a);
    for (const r of sim.remotes) if (r.x > vx0 && r.x < vx1) this.drawBloop(r.skin, r.x, r.walk, r.face, r.swing, r.tool, r.vehicle, r.carry, r.name, r.emoteT > 0 ? r.emote : '', 0.85);
    this.drawBloop('me', sim.me.x, sim.me.walk, sim.me.face, sim.me.swing, sim.s.tool, sim.s.vehicle, sim.me.carry, '', sim.me.emoteT > 0 ? sim.me.emote : '', 1);
    if (sim.agents.length || sim.remotes.length) {
      // setinha amarela: "esse é você"
      const mx = this.sx(sim.me.x);
      const my = this.gy - S * (sim.s.vehicle >= 2 ? 3.6 : 2.4) + Math.sin(this.time * 4) * S * 0.08;
      x.fillStyle = '#ffd34a';
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 2.5;
      x.beginPath();
      x.moveTo(mx, my + S * 0.3);
      x.lineTo(mx - S * 0.25, my);
      x.lineTo(mx + S * 0.25, my);
      x.closePath();
      x.fill();
      x.stroke();
    }
    // árvores da frente
    this.drawTrees(false, vx0, vx1);
    for (const a of sim.agents) if (a.x > vx0 && a.x < vx1 && a.kind === 'drone') this.drawAgent(a);
    // partículas
    this.drawParticles(dt);
    // alvo
    if (sim.me.target >= 0) {
      const tr = sim.trees[sim.me.target];
      const px = this.sx(tr.x);
      const py = this.depthY(tr.z) - S * 0.2;
      const hpw = S * 1.6;
      const by = py - SPECIES[tr.sp].h * S * (tr.z < 0 ? 0.82 : 1) - S * 0.6;
      x.fillStyle = 'rgba(42,11,92,0.75)';
      roundRect(x, px - hpw / 2 - 2, by - 2, hpw + 4, S * 0.32 + 4, 6);
      x.fill();
      x.fillStyle = tr.rare ? RARES[tr.rare].color : '#7aff8a';
      roundRect(x, px - hpw / 2, by, hpw * Math.max(0, tr.hp / tr.maxHp), S * 0.32, 4);
      x.fill();
    }
    // pop-ups
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = gameFont(800, Math.round(S * 0.55));
    for (const p of this.pops) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t > 1.3) {
        p.on = false;
        continue;
      }
      const a = 1 - Math.max(0, p.t - 0.8) / 0.5;
      x.globalAlpha = a;
      x.lineWidth = 4;
      x.strokeStyle = '#2a0b5c';
      x.strokeText(p.text, p.x, p.y - p.t * S * 1.5);
      x.fillStyle = p.color;
      x.fillText(p.text, p.x, p.y - p.t * S * 1.5);
    }
    x.globalAlpha = 1;
    // ambiente
    if (this.q.ambientParticles && this.rand() < dt * 3) {
      const sp = SPECIES[B.species];
      this.spawn(2, this.rand() * W, -10, (this.rand() - 0.5) * S, S * 0.6, S * 0.12, 6, B.night ? '#b8a8ff' : sp.leaf);
    }
    if (B.night && this.q.vignette) {
      x.fillStyle = 'rgba(20,10,60,0.18)';
      x.fillRect(0, 0, W, H);
    }
  }

  private drawTrees(back: boolean, vx0: number, vx1: number): void {
    const x = this.x;
    const S = this.S;
    const sim = this.sim;
    for (const tr of sim.trees) {
      if (tr.x < vx0 - 8 || tr.x > vx1 + 8 || (tr.z < 0) !== back) continue;
      const px = this.sx(tr.x);
      const py = this.depthY(tr.z);
      const sc = back ? 0.82 : 1;
      const locked = tr.biome >= sim.s.unlocked;
      if (tr.state === TS.Stump || tr.state === TS.Sapling || tr.state === TS.Falling) this.drawStump(px, py, tr, sc);
      if (tr.state === TS.Stump) continue;
      const spr = this.treeSprite(tr.sp, tr.rare, back);
      const k = 1 / this.dpr;
      x.save();
      x.translate(px, py);
      if (tr.state === TS.Falling) x.rotate(tr.ang * (tr.fdx >= 0 ? 1 : -1));
      else if (tr.shake > 0) x.rotate(Math.sin(tr.shake * 60) * 0.03);
      if (tr.state === TS.Sapling) {
        const g = 0.12 + tr.grow * 0.88;
        x.scale(g, g);
      }
      if (locked) x.globalAlpha = 0.85;
      // brilho das raras
      if (tr.rare && this.q.glows && tr.state === TS.Grown) {
        const rgb = tr.rare === 1 ? '255,210,80' : tr.rare === 2 ? '140,240,255' : '120,255,190';
        const g = glowSprite(rgb);
        const R = SPECIES[tr.sp].h * S * sc * 0.6;
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.45 + 0.15 * Math.sin(this.time * 3 + tr.id);
        x.drawImage(g, -R, -SPECIES[tr.sp].h * S * sc * 0.7 - R, R * 2, R * 2);
        x.globalCompositeOperation = 'source-over';
        x.globalAlpha = 1;
      }
      x.drawImage(spr.c, -spr.ox * k, -spr.oy * k, spr.c.width * k, spr.c.height * k);
      x.restore();
      if (tr.rare && tr.state === TS.Grown && this.rand() < 0.04) {
        this.spawn(3, px + (this.rand() - 0.5) * S * 3, py - SPECIES[tr.sp].h * S * sc * (0.4 + this.rand() * 0.5), 0, -S * 0.4, S * 0.1, 1, RARES[tr.rare].color);
      }
    }
  }

  private drawStump(px: number, py: number, tr: Tree, sc: number): void {
    const x = this.x;
    const S = this.S * sc;
    const sp = SPECIES[tr.sp];
    x.fillStyle = sp.trunkDark;
    roundRect(x, px - S * 0.38, py - S * 0.55, S * 0.76, S * 0.6, S * 0.12);
    x.fill();
    x.fillStyle = '#f3d9a8';
    x.beginPath();
    x.ellipse(px, py - S * 0.55, S * 0.38, S * 0.12, 0, 0, TAU);
    x.fill();
    if (tr.state === TS.Stump) {
      // plaquinha de "replantio" piscando
      const blink = 0.6 + 0.4 * Math.sin(this.time * 4 + tr.id);
      x.globalAlpha = blink;
      x.fillStyle = '#7ad04a';
      x.beginPath();
      x.ellipse(px + S * 0.5, py - S * 0.2, S * 0.18, S * 0.1, -0.5, 0, TAU);
      x.ellipse(px + S * 0.75, py - S * 0.3, S * 0.18, S * 0.1, 0.5, 0, TAU);
      x.fill();
      x.globalAlpha = 1;
    }
  }

  private drawBase(vx0: number, vx1: number): void {
    if (vx0 > 36) return;
    const x = this.x;
    const S = this.S;
    const sim = this.sim;
    const gy = this.gy;
    // esteira (da serraria até o palete)
    const bx0 = this.sx(PALLET_X);
    const bx1 = this.sx(SAW_X);
    const by = gy - S * 0.9;
    x.fillStyle = '#5a4585';
    roundRect(x, bx0, by, bx1 - bx0, S * 0.36, S * 0.18);
    x.fill();
    x.fillStyle = '#3a2a5a';
    const step = S * 0.6;
    const off = ((sim.time * 1.6 * S) % step + step) % step;
    for (let px = bx1 - off; px > bx0; px -= step) x.fillRect(px, by + S * 0.05, S * 0.08, S * 0.26);
    x.fillStyle = '#9a82c4';
    for (let px = bx0 + S * 0.4; px < bx1; px += S * 1.6) {
      x.fillRect(px, by + S * 0.36, S * 0.12, gy - by - S * 0.36);
    }
    // tábuas na esteira
    for (const b of sim.belt) {
      if (!b.on) continue;
      const px = this.sx(b.x);
      const sp = SPECIES[b.sp];
      const n = Math.min(5, b.n);
      for (let i = 0; i < n; i++) {
        x.fillStyle = b.planed ? '#ffe2b0' : sp.trunk;
        x.fillRect(px - S * 0.5, by - S * 0.12 * (i + 1), S, S * 0.11);
        x.fillStyle = 'rgba(42,11,92,0.25)';
        x.fillRect(px - S * 0.5, by - S * 0.12 * (i + 1) + S * 0.09, S, S * 0.02);
      }
    }
    // plaina
    const pxl = this.sx(PLANER_X);
    x.fillStyle = '#2a9be0';
    roundRect(x, pxl - S * 0.9, by - S * 1.3, S * 1.8, S * 1.1, S * 0.2);
    x.fill();
    x.fillStyle = '#8a5cff';
    roundRect(x, pxl - S * 0.7, by - S * 1.7, S * 1.4, S * 0.5, S * 0.15);
    x.fill();
    x.fillStyle = '#e0feff';
    x.fillRect(pxl - S * 0.6, by - S * 1.1, S * 1.2, S * 0.15);
    this.label(pxl, by - S * 2.0, t('floresta.m.planer', 'Plaina') + ' ' + (sim.s.mach.planer + 1));
    // palete com pilha de tábuas
    const ppx = this.sx(PALLET_X);
    x.fillStyle = '#8a5a34';
    x.fillRect(ppx - S * 1.1, gy - S * 0.35, S * 2.2, S * 0.3);
    const stack = Math.min(14, Math.ceil(Math.sqrt(sim.s.planks)));
    for (let i = 0; i < stack; i++) {
      x.fillStyle = i % 2 ? '#f3c98a' : '#ffe2b0';
      x.fillRect(ppx - S * 1.0, gy - S * 0.35 - S * 0.18 * (i + 1), S * 2, S * 0.17);
    }
    this.label(ppx, gy - S * 0.6 - S * 0.18 * stack - S * 0.4, short(sim.s.planks));
    // barraca de venda
    const spx = this.sx(SELL_X);
    x.fillStyle = '#c98a4a';
    x.fillRect(spx - S * 1.2, gy - S * 1.6, S * 2.4, S * 1.4);
    x.fillStyle = '#ff4f6a';
    x.beginPath();
    x.moveTo(spx - S * 1.5, gy - S * 1.6);
    x.lineTo(spx - S * 1.1, gy - S * 2.4);
    x.lineTo(spx + S * 1.1, gy - S * 2.4);
    x.lineTo(spx + S * 1.5, gy - S * 1.6);
    x.fill();
    x.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) x.fillRect(spx - S * 1.1 + i * S * 0.6, gy - S * 2.38, S * 0.3, S * 0.76);
    acorn(x, spx, gy - S * 0.95, S * 0.45);
    // serraria
    const sx = this.sx(SAW_X);
    x.fillStyle = '#a0683a';
    x.fillRect(sx - S * 0.3, gy - S * 3.2, S * 4.2, S * 3.2);
    x.fillStyle = '#7a4a20';
    for (let i = 0; i < 6; i++) x.fillRect(sx - S * 0.3, gy - S * 3.2 + i * S * 0.55, S * 4.2, S * 0.06);
    x.fillStyle = '#c21d3c';
    x.beginPath();
    x.moveTo(sx - S * 0.8, gy - S * 3.1);
    x.lineTo(sx + S * 1.8, gy - S * 4.6);
    x.lineTo(sx + S * 4.4, gy - S * 3.1);
    x.fill();
    x.fillStyle = '#2a1a3a';
    x.fillRect(sx - S * 0.3, gy - S * 1.6, S * 1.2, S * 1.6);
    // lâmina
    x.save();
    x.translate(sx - S * 0.2, gy - S * 1.15);
    x.rotate(sim.sawSpin);
    x.fillStyle = '#dcd6f0';
    x.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      x.lineTo(Math.cos(a) * S * 0.62, Math.sin(a) * S * 0.62);
      x.lineTo(Math.cos(a + 0.26) * S * 0.48, Math.sin(a + 0.26) * S * 0.48);
    }
    x.fill();
    x.fillStyle = '#5a4585';
    x.beginPath();
    x.arc(0, 0, S * 0.14, 0, TAU);
    x.fill();
    x.restore();
    this.label(sx + S * 1.8, gy - S * 5.0, t('floresta.m.saw', 'Serraria') + ' ' + (sim.s.mach.saw + 1));
    // funil
    const ix = this.sx(INTAKE_X);
    x.fillStyle = '#ffcf2e';
    x.beginPath();
    x.moveTo(ix - S * 1.2, gy - S * 2.6);
    x.lineTo(ix + S * 1.2, gy - S * 2.6);
    x.lineTo(ix + S * 0.4, gy - S * 1.4);
    x.lineTo(ix - S * 0.4, gy - S * 1.4);
    x.fill();
    x.fillStyle = '#e98f00';
    x.fillRect(ix - S * 0.4, gy - S * 1.4, S * 0.8, S * 1.4);
    const ql = Math.min(6, sim.qLen);
    for (let i = 0; i < ql; i++) {
      x.fillStyle = '#9a6a3c';
      x.beginPath();
      x.ellipse(ix + (i % 3 - 1) * S * 0.5, gy - S * 2.7 - Math.floor(i / 3) * S * 0.35, S * 0.3, S * 0.18, 0, 0, TAU);
      x.fill();
    }
    if (sim.me.carry > 0 && sim.me.x > INTAKE_X + 3) {
      const bob = Math.sin(this.time * 6) * S * 0.2;
      x.fillStyle = '#ffd34a';
      x.beginPath();
      x.moveTo(ix, gy - S * 3 + bob);
      x.lineTo(ix - S * 0.5, gy - S * 3.7 + bob);
      x.lineTo(ix + S * 0.5, gy - S * 3.7 + bob);
      x.fill();
    }
    // pista dos drones
    const dx = this.sx(DRONE_PAD_X);
    x.fillStyle = '#5a4585';
    x.fillRect(dx - S, gy - S * 0.3, S * 2, S * 0.25);
    x.fillStyle = '#ffd34a';
    x.fillRect(dx - S * 0.1, gy - S * 0.28, S * 0.2, S * 0.2);
    void vx1;
  }

  private drawGates(vx0: number, vx1: number): void {
    const x = this.x;
    const S = this.S;
    const gy = this.gy;
    const sim = this.sim;
    for (let b = 1; b < BIOMES.length; b++) {
      const gxw = gateX(b);
      if (gxw < vx0 - 6 || gxw > vx1 + 6) continue;
      const px = this.sx(gxw);
      const built = sim.s.unlocked > b;
      const kind = b - 1;
      if (!built) {
        // canteiro de obra: cordinha + placa com cadeado
        x.fillStyle = '#7a4a20';
        x.fillRect(px - S * 0.12, gy - S * 2.4, S * 0.24, S * 2.4);
        x.fillRect(px + S * 1.8, gy - S * 2.4, S * 0.24, S * 2.4);
        x.strokeStyle = '#ffcf2e';
        x.lineWidth = S * 0.12;
        x.setLineDash([S * 0.3, S * 0.2]);
        x.beginPath();
        x.moveTo(px, gy - S * 1.8);
        x.quadraticCurveTo(px + S, gy - S * 1.4, px + S * 1.9, gy - S * 1.8);
        x.stroke();
        x.setLineDash([]);
        x.fillStyle = '#fff6d6';
        roundRect(x, px - S * 0.2, gy - S * 4.2, S * 2.4, S * 1.6, S * 0.2);
        x.fill();
        x.strokeStyle = '#2a0b5c';
        x.lineWidth = 3;
        x.stroke();
        x.fillStyle = '#2a0b5c';
        x.font = gameFont(800, Math.round(S * 0.32));
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(BUILDS[kind].name(), px + S, gy - S * 3.75, S * 2.2);
        x.fillStyle = '#8a5228';
        x.fillText(short(BUILDS[kind].planks) + ' ' + t('floresta.planks', 'tábuas'), px + S, gy - S * 3.25, S * 2.2);
        this.label(px + S, gy - S * 4.7, BIOMES[b].name());
      } else {
        x.fillStyle = '#c98a4a';
        x.strokeStyle = '#7a4a20';
        x.lineWidth = 2;
        if (kind === 0) {
          for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            x.fillRect(px + i * S * 0.6 - S * 0.1, gy - S * 1.6, S * 0.2, S * 1.6);
          }
          x.fillRect(px - S * 1.4, gy - S * 1.3, S * 2.8, S * 0.18);
          x.fillRect(px - S * 1.4, gy - S * 0.7, S * 2.8, S * 0.18);
        } else if (kind === 1) {
          x.fillStyle = '#4a8ad0';
          x.fillRect(px - S * 2.5, gy - S * 0.15, S * 5, S * 0.6);
          x.fillStyle = '#c98a4a';
          for (let i = -6; i <= 6; i++) x.fillRect(px + i * S * 0.38 - S * 0.15, gy - S * 0.45, S * 0.3, S * 0.3);
          x.fillRect(px - S * 2.5, gy - S * 1.4, S * 5, S * 0.12);
        } else if (kind === 2) {
          x.fillRect(px - S * 1.6, gy - S * 2.4, S * 3.2, S * 2.4);
          x.fillStyle = '#3a9a6a';
          x.beginPath();
          x.moveTo(px - S * 2, gy - S * 2.4);
          x.lineTo(px, gy - S * 3.8);
          x.lineTo(px + S * 2, gy - S * 2.4);
          x.fill();
          x.fillStyle = '#ffe680';
          x.fillRect(px - S * 1.1, gy - S * 1.8, S * 0.7, S * 0.6);
          x.fillStyle = '#5a3a20';
          x.fillRect(px + S * 0.3, gy - S * 1.4, S * 0.8, S * 1.4);
        } else if (kind === 3) {
          for (let i = 0; i < 5; i++) x.fillRect(px - S * 2 + i * S * 0.8, gy - S * 0.4 * (i + 1), S * 0.85, S * 0.4 * (i + 1));
        } else if (kind === 4) {
          x.fillRect(px - S * 0.9, gy - S * 5, S * 0.25, S * 5);
          x.fillRect(px + S * 0.65, gy - S * 5, S * 0.25, S * 5);
          for (let i = 1; i < 5; i++) x.fillRect(px - S * 0.9, gy - S * i, S * 1.8, S * 0.15);
          x.fillStyle = '#ff4f6a';
          x.beginPath();
          x.moveTo(px - S * 1.3, gy - S * 5);
          x.lineTo(px, gy - S * 6.2);
          x.lineTo(px + S * 1.3, gy - S * 5);
          x.fill();
        } else {
          const bob = Math.sin(this.time * 1.5) * S * 0.2;
          x.fillStyle = '#ff9a2e';
          x.beginPath();
          x.arc(px, gy - S * 5 + bob, S * 1.5, 0, TAU);
          x.fill();
          x.fillStyle = '#ffe680';
          x.fillRect(px - S * 0.2, gy - S * 6.5 + bob, S * 0.4, S * 3);
          x.strokeStyle = '#7a4a20';
          x.beginPath();
          x.moveTo(px - S, gy - S * 4 + bob);
          x.lineTo(px - S * 0.6, gy - S * 1.6 + bob);
          x.moveTo(px + S, gy - S * 4 + bob);
          x.lineTo(px + S * 0.6, gy - S * 1.6 + bob);
          x.stroke();
          x.fillStyle = '#c98a4a';
          x.fillRect(px - S * 0.8, gy - S * 1.6 + bob, S * 1.6, S * 0.9);
        }
      }
    }
  }

  private drawLogs(vx0: number, vx1: number): void {
    const x = this.x;
    const S = this.S;
    for (const l of this.sim.logs) {
      if (!l.on || l.x < vx0 || l.x > vx1) continue;
      const sp = SPECIES[l.sp];
      const px = this.sx(l.x);
      const py = this.gy + S * 0.15 - (l.y - 0.3) * S;
      const R = S * 0.36;
      const len = S * 1.25;
      if (l.ghost) x.globalAlpha = Math.max(0, 1 - l.age / 4) * 0.6;
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.beginPath();
      x.ellipse(px, this.gy + S * 0.5, len * 0.6, S * 0.12, 0, 0, TAU);
      x.fill();
      x.fillStyle = l.rare ? RARES[l.rare].color : sp.trunkDark;
      roundRect(x, px - len / 2, py - R, len, R * 2, R);
      x.fill();
      x.fillStyle = l.rare ? '#fff6d0' : sp.trunk;
      roundRect(x, px - len / 2, py - R, len, R * 1.2, R * 0.6);
      x.fill();
      // tampa com anéis girando
      const cx = px + len / 2 - R * 0.3;
      x.fillStyle = '#f3d9a8';
      x.beginPath();
      x.ellipse(cx, py, R * 0.55, R, 0, 0, TAU);
      x.fill();
      x.strokeStyle = '#c98a4a';
      x.lineWidth = 1.5;
      x.beginPath();
      x.ellipse(cx, py, R * 0.3, R * 0.55, 0, 0, TAU);
      x.stroke();
      x.beginPath();
      x.moveTo(cx, py);
      x.lineTo(cx + Math.cos(l.rot) * R * 0.5, py + Math.sin(l.rot) * R * 0.9);
      x.stroke();
      x.globalAlpha = 1;
    }
  }

  private drawAgent(a: Agent): void {
    const x = this.x;
    const S = this.S;
    if (a.kind === 'friend') {
      this.drawBloop(a.skin, a.x, a.walk, a.face, a.swing > 0.6 ? (a.swing - 0.6) * 2.5 : 0, Math.max(0, this.sim.s.tool - 1), a.carry > 0 ? 1 : 0, a.carry, a.name, a.emoteT > 0 ? a.emote : '', 0.92);
      return;
    }
    const px = this.sx(a.x);
    const py = this.gy - a.y * S;
    const bob = Math.abs(Math.sin(a.walk * 3)) * S * 0.12;
    x.save();
    x.translate(px, py - bob);
    x.scale(a.face, 1);
    if (a.kind === 'drone') {
      x.fillStyle = 'rgba(0,0,0,0.15)';
      x.beginPath();
      x.ellipse(0, a.y * S + bob, S * 0.5, S * 0.12, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#2a9be0';
      x.beginPath();
      x.ellipse(0, 0, S * 0.55, S * 0.35, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#e0feff';
      x.beginPath();
      x.ellipse(S * 0.15, -S * 0.08, S * 0.2, S * 0.14, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#dcd6f0';
      const sp = Math.sin(this.time * 50);
      x.fillRect(-S * 0.9, -S * 0.42, S * 0.7 * Math.abs(sp) + S * 0.1, S * 0.07);
      x.fillRect(S * 0.2, -S * 0.42, S * 0.7 * Math.abs(sp) + S * 0.1, S * 0.07);
      if (a.state === 'chop') {
        x.strokeStyle = '#ff6a8a';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(S * 0.4, S * 0.1);
        x.lineTo(S * 1.2, S * 0.8);
        x.stroke();
      }
    } else {
      const green = a.kind === 'planter';
      x.fillStyle = '#5a4585';
      x.fillRect(-S * 0.3, -S * 0.3, S * 0.18, S * 0.3);
      x.fillRect(S * 0.12, -S * 0.3, S * 0.18, S * 0.3);
      x.fillStyle = green ? '#3ee07a' : '#dcd6f0';
      roundRect(x, -S * 0.45, -S * 1.2, S * 0.9, S * 0.9, S * 0.25);
      x.fill();
      x.fillStyle = '#2a0b5c';
      roundRect(x, -S * 0.3, -S * 1.0, S * 0.6, S * 0.32, S * 0.14);
      x.fill();
      x.fillStyle = '#7affc4';
      x.beginPath();
      x.arc(-S * 0.08, -S * 0.84, S * 0.07, 0, TAU);
      x.arc(S * 0.14, -S * 0.84, S * 0.07, 0, TAU);
      x.fill();
      if (green) {
        x.fillStyle = '#5cd04a';
        x.beginPath();
        x.ellipse(-S * 0.1, -S * 1.35, S * 0.18, S * 0.08, -0.6, 0, TAU);
        x.ellipse(S * 0.12, -S * 1.35, S * 0.18, S * 0.08, 0.6, 0, TAU);
        x.fill();
      } else {
        x.fillStyle = '#ffcf2e';
        x.beginPath();
        x.arc(0, -S * 1.32, S * 0.09, 0, TAU);
        x.fill();
        // machadinho
        x.save();
        x.translate(S * 0.4, -S * 0.7);
        x.rotate(a.state === 'chop' ? -1.2 + Math.max(0, a.swing) * 2 : 0.4);
        x.fillStyle = '#8a5228';
        x.fillRect(0, -S * 0.05, S * 0.6, S * 0.1);
        x.fillStyle = '#dcd6f0';
        x.fillRect(S * 0.45, -S * 0.22, S * 0.2, S * 0.3);
        x.restore();
      }
      if (a.carry > 0) {
        x.fillStyle = SPECIES[a.carrySp].trunk;
        roundRect(x, -S * 0.5, -S * 1.6, S * 1, S * 0.3, S * 0.15);
        x.fill();
      }
    }
    x.restore();
  }

  /** Bloop (eu, remotos, amigos) com ferramenta, veículo e pilha de toras */
  private drawBloop(skin: string, wx: number, walk: number, face: number, swing: number, tool: number, vehicle: number, carry: number, name: string, emote: string, scale: number): void {
    const x = this.x;
    const S = this.S * scale;
    const px = this.sx(wx);
    const gy = this.gy;
    const bob = Math.abs(Math.sin(walk * 3)) * S * 0.18;
    const ride = vehicle >= 2;
    const R = S * 0.62;
    // veículo
    let seatY = gy;
    x.save();
    x.translate(px, gy);
    x.scale(face, 1);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.beginPath();
    x.ellipse(0, S * 0.05, S * (ride ? 1.8 : 0.7), S * 0.16, 0, 0, TAU);
    x.fill();
    if (vehicle === 1) {
      // carrinho de mão na frente
      x.fillStyle = '#3ee07a';
      x.beginPath();
      x.moveTo(S * 0.5, -S * 0.9);
      x.lineTo(S * 1.8, -S * 0.9);
      x.lineTo(S * 1.6, -S * 0.4);
      x.lineTo(S * 0.7, -S * 0.4);
      x.fill();
      wheel(x, S * 1.2, -S * 0.25, S * 0.25, walk);
      this.carryStack(S * 1.15, -S * 0.9, carry, S, 6);
    } else if (vehicle >= 2) {
      const col = vehicle === 2 ? '#ff9a2e' : vehicle === 3 ? '#ffcf2e' : '#ff4f6a';
      const L = vehicle === 4 ? 3.6 : 3;
      x.fillStyle = col;
      roundRect(x, -S * L * 0.55, -S * 1.25, S * L, S * 0.85, S * 0.2);
      x.fill();
      x.fillStyle = '#5ef0ff';
      roundRect(x, S * L * 0.1, -S * 2.0, S * 0.9, S * 0.8, S * 0.15);
      x.fill();
      x.fillStyle = col;
      x.fillRect(S * L * 0.1, -S * 2.1, S * 0.9, S * 0.15);
      wheel(x, -S * L * 0.35, -S * 0.35, S * 0.36, walk);
      wheel(x, S * L * 0.3, -S * 0.35, S * 0.36, walk);
      if (vehicle === 3) {
        x.fillStyle = '#9b92bf';
        x.fillRect(S * L * 0.45, -S * 1.0, S * 0.8, S * 0.18);
        x.fillRect(S * L * 0.45 + S * 0.7, -S * 1.3, S * 0.18, S * 0.5);
      }
      if (vehicle === 4) {
        x.fillStyle = '#2a0b5c';
        x.fillRect(-S * 0.2, -S * 2.6, S * 0.35, S * 0.9);
      }
      this.carryStack(-S * L * 0.2, -S * 1.25, carry, S, vehicle === 4 ? 10 : 8);
      seatY = gy - S * 1.0;
    } else if (carry > 0) this.carryStack(-S * 0.5, -S * 1.5, carry, S * 0.8, 2);
    x.restore();
    // bloop
    const spr = this.hero(skin);
    const k = scale / this.dpr;
    const cy = seatY - R - (ride ? 0 : bob);
    const sw = spr.width * k;
    x.save();
    x.translate(px + (ride ? S * 0.35 * face : 0), cy);
    x.scale(face, 1);
    const sq = 1 + Math.sin(walk * 6) * 0.04;
    x.scale(1 / sq, sq);
    x.drawImage(spr, -sw / 2, -sw / 2, sw, sw);
    // ferramenta
    const tl = TOOLS[Math.min(TOOLS.length - 1, tool)];
    x.translate(R * 0.75, R * 0.2);
    x.rotate(-1.4 + (1 - swing) * 0.2 + swing * 1.9);
    if (tl.kind === 'axe') {
      x.fillStyle = '#8a5228';
      x.fillRect(-S * 0.06, -S * 0.9, S * 0.12, S * 1.0);
      x.fillStyle = tl.color;
      x.beginPath();
      x.moveTo(0, -S * 0.9);
      x.quadraticCurveTo(S * 0.55, -S * 0.95, S * 0.5, -S * 0.5);
      x.lineTo(0, -S * 0.6);
      x.fill();
      if (tool === 3) {
        x.beginPath();
        x.moveTo(0, -S * 0.9);
        x.quadraticCurveTo(-S * 0.55, -S * 0.95, -S * 0.5, -S * 0.5);
        x.lineTo(0, -S * 0.6);
        x.fill();
      }
    } else if (tl.kind === 'saw') {
      x.fillStyle = tl.color;
      roundRect(x, -S * 0.2, -S * 0.4, S * 0.4, S * 0.45, S * 0.1);
      x.fill();
      x.fillStyle = '#dcd6f0';
      roundRect(x, -S * 0.1, -S * 1.15, S * 0.22, S * 0.8, S * 0.1);
      x.fill();
      x.fillStyle = '#2a0b5c';
      const o = (this.time * 30) % 1;
      for (let i = 0; i < 5; i++) x.fillRect(S * 0.1, -S * 1.1 + (i + o) * S * 0.14, S * 0.05, S * 0.06);
    } else {
      x.fillStyle = tl.color;
      roundRect(x, -S * 0.14, -S * 0.7, S * 0.28, S * 0.75, S * 0.1);
      x.fill();
      if (swing > 0.2) {
        x.strokeStyle = tl.color;
        x.lineWidth = S * 0.12;
        x.beginPath();
        x.moveTo(0, -S * 0.7);
        x.lineTo(0, -S * 2.0);
        x.stroke();
        x.strokeStyle = '#fff';
        x.lineWidth = S * 0.04;
        x.stroke();
      }
    }
    x.restore();
    // nome / contagem
    if (name) this.label(px, cy - R - S * 0.55, name, 0.8);
    if (carry > 0 && (vehicle >= 2 || name === '')) {
      this.label(px, cy - R - S * (name ? 1.1 : 0.6), String(carry), 0.8, '#ffe2b0');
    }
    if (emote) emoteGlyph(x, px, cy - R - S * 1.6, S * 0.55, emote);
  }

  private carryStack(cx: number, top: number, n: number, S: number, maxShow: number): void {
    const x = this.x;
    const m = Math.min(n, maxShow);
    for (let i = 0; i < m; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      x.fillStyle = '#9a6a3c';
      roundRect(x, cx - S * 0.55 + col * S * 0.05, top - S * 0.28 * (row + 1), S * 1.1, S * 0.26, S * 0.13);
      x.fill();
      x.fillStyle = '#f3d9a8';
      x.beginPath();
      x.arc(cx + S * 0.5 + col * S * 0.05, top - S * 0.28 * (row + 1) + S * 0.13, S * 0.11, 0, TAU);
      x.fill();
    }
  }

  private label(px: number, py: number, text: string, sc = 1, color = '#fff'): void {
    const x = this.x;
    x.font = gameFont(800, Math.round(this.S * 0.36 * sc));
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 3.5;
    x.strokeStyle = '#2a0b5c';
    x.strokeText(text, px, py);
    x.fillStyle = color;
    x.fillText(text, px, py);
  }

  private drawParticles(dt: number): void {
    const x = this.x;
    const S = this.S;
    for (const p of this.parts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0 || p.y > this.H + 20) {
        p.on = false;
        continue;
      }
      const a = Math.min(1, p.life / (p.max * 0.4));
      if (p.kind === 2) {
        p.vx += Math.sin(this.time * 3 + p.rot) * S * dt;
        p.vy = Math.min(p.vy + S * 2 * dt, S * 1.2);
      } else if (p.kind === 4) {
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.r += S * dt * 0.6;
      } else if (p.kind === 3) p.vy += S * 3 * dt;
      else p.vy += S * 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind <= 1 && p.y > this.gy + S * 0.4) {
        p.y = this.gy + S * 0.4;
        p.vy = -p.vy * 0.3;
        p.vx *= 0.6;
      }
      x.globalAlpha = a;
      x.fillStyle = p.color;
      if (p.kind === 0) {
        x.save();
        x.translate(p.x, p.y);
        x.rotate(p.rot);
        x.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        x.restore();
      } else if (p.kind === 2) {
        x.beginPath();
        x.ellipse(p.x, p.y, p.r, p.r * 0.5, p.rot, 0, TAU);
        x.fill();
      } else if (p.kind === 3) {
        star(x, p.x, p.y, p.r * 1.6, p.rot);
      } else {
        x.beginPath();
        x.arc(p.x, p.y, p.r, 0, TAU);
        x.fill();
      }
    }
    x.globalAlpha = 1;
  }
}

/* ------------------------------ formas soltas ------------------------------ */

export function roundRect(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

function wheel(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fill();
  x.fillStyle = '#9b92bf';
  x.beginPath();
  x.arc(cx, cy, r * 0.5, 0, TAU);
  x.fill();
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(cx, cy);
  x.lineTo(cx + Math.cos(rot * 4) * r * 0.5, cy + Math.sin(rot * 4) * r * 0.5);
  x.stroke();
}

function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * TAU;
    const rr = i % 2 ? r * 0.35 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.fill();
}

export function acorn(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.fillStyle = '#ffcf2e';
  x.beginPath();
  x.ellipse(cx, cy + r * 0.2, r * 0.7, r * 0.85, 0, 0, TAU);
  x.fill();
  x.fillStyle = '#8a5228';
  x.beginPath();
  x.ellipse(cx, cy - r * 0.35, r * 0.85, r * 0.45, 0, Math.PI, TAU);
  x.fill();
  x.fillRect(cx - r * 0.85, cy - r * 0.38, r * 1.7, r * 0.18);
  x.fillRect(cx - r * 0.08, cy - r * 1.05, r * 0.16, r * 0.3);
}

/** balão de emote desenhado em vetor */
export function emoteGlyph(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, code: string): void {
  x.fillStyle = '#fff';
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = 2.5;
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fill();
  x.stroke();
  x.beginPath();
  x.moveTo(cx - r * 0.25, cy + r * 0.9);
  x.lineTo(cx, cy + r * 1.35);
  x.lineTo(cx + r * 0.25, cy + r * 0.9);
  x.fill();
  const s = r * 0.62;
  if (code === 'coracao') {
    x.fillStyle = '#ff4f6a';
    x.beginPath();
    x.moveTo(cx, cy + s * 0.8);
    x.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.35);
    x.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.8);
    x.fill();
  } else if (code === 'uau' || code === 'boa') {
    x.fillStyle = '#ffcf2e';
    star(x, cx, cy, s, -Math.PI / 2);
  } else if (code === 'joinha' || code === 'gg') {
    x.fillStyle = '#ffcf2e';
    roundRect(x, cx - s * 0.7, cy - s * 0.1, s * 1.3, s * 0.9, s * 0.2);
    x.fill();
    roundRect(x, cx - s * 0.2, cy - s * 0.9, s * 0.45, s * 1, s * 0.2);
    x.fill();
  } else if (code === 'vamos') {
    x.fillStyle = '#3ee07a';
    x.beginPath();
    x.moveTo(cx - s * 0.7, cy - s * 0.3);
    x.lineTo(cx + s * 0.1, cy - s * 0.3);
    x.lineTo(cx + s * 0.1, cy - s * 0.8);
    x.lineTo(cx + s * 0.9, cy);
    x.lineTo(cx + s * 0.1, cy + s * 0.8);
    x.lineTo(cx + s * 0.1, cy + s * 0.3);
    x.lineTo(cx - s * 0.7, cy + s * 0.3);
    x.fill();
  } else {
    // sorriso (oi/rindo/padrão)
    x.fillStyle = '#ffcf2e';
    x.beginPath();
    x.arc(cx, cy, s, 0, TAU);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(cx - s * 0.35, cy - s * 0.2, s * 0.13, 0, TAU);
    x.arc(cx + s * 0.35, cy - s * 0.2, s * 0.13, 0, TAU);
    x.fill();
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(cx, cy + s * 0.05, s * 0.45, 0.2, Math.PI - 0.2);
    x.stroke();
  }
}

/** desenha a árvore com a base do tronco na origem; S = px por metro */
export function drawTree(x: CanvasRenderingContext2D, sp: Species, rare: number, S: number): void {
  const h = sp.h * S;
  const tw = S * (sp.shape === 'mushroom' ? 0.9 : sp.shape === 'palm' ? 0.45 : 0.6);
  const leaf = rare === 1 ? '#ffd34a' : rare === 2 ? '#9ff6ff' : rare === 3 ? '#7affc4' : sp.leaf;
  const leaf2 = rare === 1 ? '#e9a400' : rare === 2 ? '#4ab8f0' : rare === 3 ? '#20c890' : sp.leaf2;
  const trunk = rare === 1 ? '#d8a040' : sp.trunk;
  const outline = '#2a0b5c';
  x.lineJoin = 'round';
  // tronco
  x.fillStyle = trunk;
  x.strokeStyle = outline;
  x.lineWidth = Math.max(2, S * 0.08);
  x.beginPath();
  if (sp.shape === 'palm') {
    x.moveTo(-tw * 0.6, 0);
    x.quadraticCurveTo(-tw * 0.2, -h * 0.5, tw * 0.6, -h * 0.9);
    x.lineTo(tw * 1.1, -h * 0.88);
    x.quadraticCurveTo(tw * 0.4, -h * 0.5, tw * 0.6, 0);
  } else {
    x.moveTo(-tw * 0.6, 0);
    x.lineTo(-tw * 0.4, -h * (sp.shape === 'pine' ? 0.4 : 0.6));
    x.lineTo(tw * 0.4, -h * (sp.shape === 'pine' ? 0.4 : 0.6));
    x.lineTo(tw * 0.6, 0);
  }
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = sp.trunkDark;
  if (sp.shape !== 'palm') x.fillRect(tw * 0.1, -h * 0.55, tw * 0.25, h * 0.5);
  // copa
  x.fillStyle = leaf;
  const blob = (cx: number, cy: number, r: number) => {
    x.moveTo(cx + r, cy);
    x.arc(cx, cy, r, 0, TAU);
  };
  switch (sp.shape) {
    case 'round':
    case 'blossom': {
      const r = h * 0.2;
      x.beginPath();
      blob(0, -h * 0.72, r * 1.2);
      blob(-r * 1.0, -h * 0.6, r);
      blob(r * 1.0, -h * 0.6, r);
      blob(-r * 0.5, -h * 0.85, r);
      blob(r * 0.6, -h * 0.86, r * 0.9);
      x.stroke();
      x.fill();
      x.fillStyle = leaf2;
      x.beginPath();
      blob(-r * 0.6, -h * 0.55, r * 0.6);
      blob(r * 0.8, -h * 0.58, r * 0.55);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.beginPath();
      blob(-r * 0.4, -h * 0.9, r * 0.35);
      x.fill();
      if (sp.shape === 'blossom') {
        x.fillStyle = '#fff';
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4;
          x.beginPath();
          blob(Math.cos(a) * r * 1.4 * ((i % 3) / 3 + 0.4), -h * 0.72 + Math.sin(a) * r * 0.9, r * 0.1);
          x.fill();
        }
      }
      break;
    }
    case 'pine': {
      for (let i = 0; i < 4; i++) {
        const y0 = -h * (0.3 + i * 0.18);
        const w = h * (0.32 - i * 0.06);
        x.fillStyle = i % 2 ? leaf2 : leaf;
        x.beginPath();
        x.moveTo(-w, y0);
        x.lineTo(0, y0 - h * 0.3);
        x.lineTo(w, y0);
        x.closePath();
        x.stroke();
        x.fill();
      }
      break;
    }
    case 'palm': {
      x.fillStyle = leaf;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        x.save();
        x.translate(tw * 0.85, -h * 0.9);
        x.rotate(a + Math.PI / 2);
        x.beginPath();
        x.ellipse(0, -h * 0.17, h * 0.07, h * 0.2, 0, 0, TAU);
        x.stroke();
        x.fill();
        x.restore();
      }
      x.fillStyle = '#8a5a34';
      x.beginPath();
      x.arc(tw * 0.85, -h * 0.88, h * 0.035, 0, TAU);
      x.arc(tw * 0.7, -h * 0.86, h * 0.03, 0, TAU);
      x.fill();
      break;
    }
    case 'mushroom': {
      x.beginPath();
      x.moveTo(-h * 0.42, -h * 0.58);
      x.quadraticCurveTo(-h * 0.4, -h * 1.05, 0, -h * 1.02);
      x.quadraticCurveTo(h * 0.4, -h * 1.05, h * 0.42, -h * 0.58);
      x.closePath();
      x.stroke();
      x.fill();
      x.fillStyle = '#fff6f0';
      for (let i = 0; i < 6; i++) {
        x.beginPath();
        blob(Math.cos(i * 1.7) * h * 0.25, -h * 0.8 + Math.sin(i * 2.3) * h * 0.08, h * 0.04 + (i % 2) * h * 0.02);
        x.fill();
      }
      x.fillStyle = 'rgba(42,11,92,0.25)';
      x.fillRect(-h * 0.4, -h * 0.6, h * 0.8, h * 0.03);
      break;
    }
    case 'crystal': {
      const shards = [
        [0, 1.02, 0.12],
        [-0.16, 0.86, 0.09],
        [0.17, 0.84, 0.1],
        [-0.28, 0.66, 0.07],
        [0.29, 0.68, 0.08],
      ];
      for (let i = 0; i < shards.length; i++) {
        const [cx, top, w] = shards[i];
        x.fillStyle = i % 2 ? leaf2 : leaf;
        x.beginPath();
        x.moveTo(cx * h, -top * h);
        x.lineTo(cx * h + w * h, -top * h + h * 0.22);
        x.lineTo(cx * h + w * h * 0.6, -h * 0.5);
        x.lineTo(cx * h - w * h * 0.6, -h * 0.5);
        x.lineTo(cx * h - w * h, -top * h + h * 0.22);
        x.closePath();
        x.stroke();
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.45)';
        x.beginPath();
        x.moveTo(cx * h, -top * h + h * 0.04);
        x.lineTo(cx * h - w * h * 0.5, -top * h + h * 0.22);
        x.lineTo(cx * h - w * h * 0.3, -h * 0.55);
        x.closePath();
        x.fill();
      }
      break;
    }
    case 'cloud': {
      const r = h * 0.16;
      x.beginPath();
      blob(0, -h * 0.8, r * 1.4);
      blob(-r * 1.3, -h * 0.68, r * 1.1);
      blob(r * 1.3, -h * 0.68, r * 1.1);
      blob(-r * 0.6, -h * 0.94, r);
      blob(r * 0.7, -h * 0.94, r);
      x.stroke();
      x.fill();
      x.fillStyle = leaf2;
      x.beginPath();
      blob(-r * 0.8, -h * 0.62, r * 0.7);
      blob(r * 0.9, -h * 0.62, r * 0.6);
      x.fill();
      x.fillStyle = '#ffd34a';
      x.beginPath();
      blob(r * 0.2, -h * 0.75, r * 0.18);
      blob(-r * 0.9, -h * 0.85, r * 0.14);
      x.fill();
      break;
    }
  }
  if (rare === 3) {
    x.fillStyle = '#eafff6';
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      blob(Math.cos(i * 2.1) * h * 0.25, -h * 0.75 + Math.sin(i * 1.3) * h * 0.15, h * 0.02);
      x.fill();
    }
  }
}
