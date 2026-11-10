/* ============================================================
 *  COZINHA MALUCA — renderizador 2D (Canvas, vista de cima 3/4).
 *  Camada estática (piso, paredes, bancadas, estações) em cache;
 *  por quadro: itens, fogo, jogadores, partículas (pool fixo), tickets.
 * ============================================================ */
import { gameFont } from '../../i18n/font';
import type { QualitySettings } from '../../core/quality';
import { drawEmoteBubble } from '../../social/emotes';
import { DECOR, INGS, RECIPES, compIng, compRoute, compStage, type Proc } from './data';
import { INK, blitIng, charSprite, drawPetIcon, drawPlate } from './art';
import { COOKERS, FX, IK, type FxEv, type Item, type Player, type Sim, type Station } from './sim';

const TAU = Math.PI * 2;
const SKINS_CUST = ['bloop', 'mint', 'sunny', 'chef', 'bee', 'ocean', 'kitty', 'capy', 'pirate', 'astro'];
const NP = 220;

export interface View {
  T: number;
  ox: number;
  oy: number;
  /** altura do salão (px) acima da cozinha */
  dining: number;
  /** topo da faixa de tickets */
  ticketsY: number;
  ticketsH: number;
}

export class Render2D {
  readonly ctx: CanvasRenderingContext2D;
  sim!: Sim;
  v: View = { T: 40, ox: 0, oy: 0, dining: 60, ticketsY: 56, ticketsH: 76 };
  private stat: HTMLCanvasElement = document.createElement('canvas');
  private w = 1;
  private h = 1;
  private dpr = 1;
  private decor = 0;
  private topPad = 56;
  private botPad = 0;
  /* partículas (estrutura de arrays) */
  private pk = new Uint8Array(NP);
  private px = new Float32Array(NP);
  private py = new Float32Array(NP);
  private pvx = new Float32Array(NP);
  private pvy = new Float32Array(NP);
  private pl = new Float32Array(NP);
  private pm = new Float32Array(NP);
  private ps = new Float32Array(NP);
  private pc: string[] = new Array(NP).fill('#fff');
  private pHead = 0;
  /* textos flutuantes */
  private popT: string[] = new Array(10).fill('');
  private popX = new Float32Array(10);
  private popY = new Float32Array(10);
  private popL = new Float32Array(10);
  private popC: string[] = new Array(10).fill('#fff');
  private popHead = 0;
  private sorted: Player[] = [];
  shake = 0;
  budget = 1;
  /** jogador local (destaque do alvo) */
  me: Player | null = null;
  /** guia: estação a destacar (seta grande no treino; brilho de dica no jogo) */
  guide: { st: number; strong: boolean } | null = null;
  /** ajudante selecionado (anel de destaque) */
  selected: Player | null = null;
  /** ajudante tocado na tela (coordenadas do elemento) */
  pickPlayer(cx: number, cy: number): Player | null {
    if (!this.sim) return null;
    const { T, ox, oy } = this.v;
    let best: Player | null = null;
    let bd = T * 0.95;
    for (const p of this.sim.players) {
      if (!p.bot) continue;
      const d = Math.hypot(ox + p.x * T - cx, oy + p.y * T - T * 0.45 - cy);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
  /** estação sob o toque (-1 = nenhuma) */
  pickStation(cx: number, cy: number): number {
    if (!this.sim) return -1;
    const { T, ox, oy } = this.v;
    const gx = Math.floor((cx - ox) / T);
    const gy = Math.floor((cy - oy) / T);
    const s = this.sim.st.find((q) => q.x === gx && q.y === gy);
    return s ? s.i : -1;
  }

  constructor(
    readonly cv: HTMLCanvasElement,
    transparent = false,
  ) {
    this.ctx = cv.getContext('2d', { alpha: transparent })!;
  }

  setSim(sim: Sim, decor: number): void {
    this.sim = sim;
    this.decor = Math.min(DECOR.length - 1, decor);
    this.layoutView();
  }
  resize(w: number, h: number, dpr: number, topPad: number, botPad: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.topPad = topPad;
    this.botPad = botPad;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    if (this.sim) this.layoutView();
  }
  private layoutView(): void {
    const s = this.sim;
    const ticketsH = Math.min(88, Math.max(68, this.h * 0.095));
    const top = this.topPad + ticketsH + 6;
    const availW = this.w - 12;
    const availH = this.h - top - this.botPad - 8;
    const DR = this.h < this.w ? 1.25 : 1.7;
    const T = Math.max(14, Math.min(availW / s.cols, availH / (s.rows + DR), 96));
    const kw = T * s.cols;
    const kh = T * (s.rows + DR);
    this.v = { T, ox: (this.w - kw) / 2, oy: top + Math.max(0, (availH - kh) / 2) + DR * T, dining: DR * T, ticketsY: this.topPad, ticketsH };
    this.buildStatic();
  }

  /* ------------------------------ camada estática ------------------------------ */
  private buildStatic(): void {
    const s = this.sim;
    const { T, dining } = this.v;
    const W = Math.ceil(T * s.cols + 2);
    const H = Math.ceil(T * s.rows + dining + 2);
    const c = this.stat;
    c.width = Math.round(W * this.dpr);
    c.height = Math.round(H * this.dpr);
    const x = c.getContext('2d')!;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const D = DECOR[this.decor];
    const oy = dining;
    // salão
    x.fillStyle = D.dining;
    x.fillRect(0, 0, W, dining + 2);
    x.globalAlpha = 0.25;
    x.fillStyle = '#ffffff';
    for (let i = 0; i < W / (T * 0.5); i++) x.fillRect(i * T * 0.5, 0, 2, dining);
    x.globalAlpha = 1;
    // mesas
    const seats = s.seats;
    for (let i = 0; i < seats; i++) {
      const sx = ((i + 0.5) / seats) * W;
      x.beginPath();
      x.ellipse(sx, dining * 0.62, T * 0.42, T * 0.2, 0, 0, TAU);
      x.fillStyle = '#ffffff';
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = INK;
      x.stroke();
      x.fillStyle = '#ff7a9a';
      x.beginPath();
      x.ellipse(sx, dining * 0.6, T * 0.3, T * 0.12, 0, 0, TAU);
      x.fill();
    }
    // piso
    for (let ty = 0; ty < s.rows; ty++)
      for (let tx = 0; tx < s.cols; tx++) {
        x.fillStyle = (tx + ty) & 1 ? D.floorA : D.floorB;
        x.fillRect(tx * T, oy + ty * T, T + 0.5, T + 0.5);
      }
    // bancadas
    const Hf = T * 0.26;
    for (const st of s.st) {
      const bx = st.x * T;
      const by = oy + st.y * T;
      const wall = !st.fx && !st.fy;
      x.fillStyle = wall ? D.wall : D.counterSide;
      x.fillRect(bx, by + T - Hf, T, Hf);
      x.fillStyle = wall ? D.wall : D.counter;
      x.fillRect(bx, by, T, T - Hf);
      x.strokeStyle = 'rgba(42,11,92,.35)';
      x.lineWidth = 1;
      x.strokeRect(bx + 0.5, by + 0.5, T - 1, T - 1);
      this.drawStationStatic(x, st, bx + T / 2, by + (T - Hf) / 2, T);
    }
    // contorno geral
    x.lineWidth = 3;
    x.strokeStyle = INK;
    x.strokeRect(1.5, oy + 1.5, T * s.cols - 3, T * s.rows - 3);
  }

  private drawStationStatic(x: CanvasRenderingContext2D, st: Station, cx: number, cy: number, T: number): void {
    const lw = Math.max(1.5, T * 0.04);
    const box = (a: number, b: number, w: number, h: number, r: number, fill: string) => {
      x.beginPath();
      x.roundRect(a, b, w, h, r);
      x.fillStyle = fill;
      x.fill();
      x.lineWidth = lw;
      x.strokeStyle = INK;
      x.stroke();
    };
    switch (st.k) {
      case 'crate':
        box(cx - T * 0.42, cy - T * 0.34, T * 0.84, T * 0.68, T * 0.08, '#c98a4a');
        x.fillStyle = '#a86a32';
        x.fillRect(cx - T * 0.42, cy - T * 0.06, T * 0.84, T * 0.08);
        blitIng(x, st.ing * 16, false, cx, cy - T * 0.02, T * 0.62);
        break;
      case 'board':
        box(cx - T * 0.4, cy - T * 0.28, T * 0.8, T * 0.56, T * 0.1, '#e8b878');
        x.fillStyle = '#c99050';
        x.beginPath();
        x.arc(cx + T * 0.3, cy - T * 0.18, T * 0.05, 0, TAU);
        x.fill();
        break;
      case 'pot':
      case 'pan':
      case 'oven':
      case 'blender':
        box(cx - T * 0.44, cy - T * 0.36, T * 0.88, T * 0.72, T * 0.12, st.k === 'oven' ? '#ff9a6b' : '#5a5370');
        if (st.k !== 'oven' && st.k !== 'blender') {
          for (let i = 0; i < 2; i++) {
            x.beginPath();
            x.arc(cx + (i ? 1 : -1) * T * 0.3, cy + T * 0.26, T * 0.04, 0, TAU);
            x.fillStyle = '#ffcf2e';
            x.fill();
          }
        }
        if (st.k === 'oven') {
          box(cx - T * 0.3, cy - T * 0.2, T * 0.6, T * 0.4, T * 0.08, '#3a2a50');
        }
        break;
      case 'plates':
        box(cx - T * 0.38, cy - T * 0.3, T * 0.76, T * 0.6, T * 0.1, '#cfe3ff');
        break;
      case 'dirty':
        box(cx - T * 0.4, cy - T * 0.3, T * 0.8, T * 0.6, T * 0.08, '#b8a07a');
        x.strokeStyle = 'rgba(42,11,92,.4)';
        x.beginPath();
        x.moveTo(cx - T * 0.3, cy);
        x.lineTo(cx + T * 0.3, cy);
        x.stroke();
        break;
      case 'sink':
        box(cx - T * 0.42, cy - T * 0.32, T * 0.84, T * 0.64, T * 0.16, '#9fd8ff');
        box(cx - T * 0.32, cy - T * 0.22, T * 0.64, T * 0.44, T * 0.12, '#5ab0e8');
        box(cx - T * 0.05, cy - T * 0.42, T * 0.1, T * 0.2, T * 0.04, '#dcd6f0');
        break;
      case 'trash':
        box(cx - T * 0.3, cy - T * 0.32, T * 0.6, T * 0.64, T * 0.12, '#3ec96a');
        box(cx - T * 0.36, cy - T * 0.36, T * 0.72, T * 0.14, T * 0.06, '#2f9e54');
        break;
      case 'window':
        box(cx - T * 0.46, cy - T * 0.36, T * 0.92, T * 0.72, T * 0.08, '#ffcf2e');
        x.fillStyle = '#e98f00';
        x.fillRect(cx - T * 0.46, cy - T * 0.05, T * 0.92, T * 0.1);
        x.beginPath();
        x.arc(cx + T * 0.26, cy - T * 0.14, T * 0.1, Math.PI, 0);
        x.fillStyle = '#fff6b0';
        x.fill();
        x.lineWidth = lw;
        x.stroke();
        break;
      case 'belt':
        box(cx - T * 0.46, cy - T * 0.32, T * 0.92, T * 0.64, T * 0.06, '#4a4560');
        break;
    }
  }

  /* ------------------------------ efeitos ------------------------------ */
  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, col: string): void {
    if (Math.random() > this.budget) return;
    const i = this.pHead;
    this.pHead = (this.pHead + 1) % NP;
    this.pk[i] = kind;
    this.px[i] = x;
    this.py[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pl[i] = life;
    this.pm[i] = life;
    this.ps[i] = size;
    this.pc[i] = col;
  }
  popup(txt: string, x: number, y: number, col: string): void {
    const i = this.popHead;
    this.popHead = (this.popHead + 1) % this.popT.length;
    this.popT[i] = txt;
    this.popX[i] = x;
    this.popY[i] = y;
    this.popL[i] = 1.4;
    this.popC[i] = col;
  }
  onFx(e: FxEv): void {
    switch (e.t) {
      case FX.Chop:
        for (let i = 0; i < 3; i++) this.spawn(2, e.x, e.y - 0.2, (Math.random() - 0.5) * 2, -1.5 - Math.random(), 0.4, 0.06, '#7be36b');
        break;
      case FX.Sizzle:
        this.spawn(1, e.x + (Math.random() - 0.5) * 0.4, e.y - 0.3, 0, -0.6, 1.2, 0.12, e.v ? '#ffffff' : '#fff3c4');
        break;
      case FX.Done:
        for (let i = 0; i < 6; i++) this.spawn(3, e.x, e.y - 0.3, Math.cos(i) * 1.5, Math.sin(i) * 1.5 - 1, 0.5, 0.07, '#ffd84a');
        break;
      case FX.Burn:
        for (let i = 0; i < 5; i++) this.spawn(4, e.x, e.y - 0.3, (Math.random() - 0.5) * 0.4, -0.8, 1.5, 0.18, '#4a4458');
        break;
      case FX.Fire:
        this.shake = Math.max(this.shake, 0.4);
        break;
      case FX.Ext:
        this.spawn(5, e.x, e.y - 0.2, (Math.random() - 0.5) * 1.2, -0.5 - Math.random() * 0.5, 0.7, e.v ? 0.25 : 0.14, '#ffffff');
        break;
      case FX.Serve:
        for (let i = 0; i < 10; i++) this.spawn(3, e.x, e.y, Math.cos(i * 0.63) * 2.2, Math.sin(i * 0.63) * 2.2 - 1.2, 0.8, 0.08, i & 1 ? '#ffd84a' : '#ff5cc8');
        this.popup('+' + e.v, e.x, e.y - 0.6, '#ffe14a');
        break;
      case FX.Wrong:
        this.popup('?!', e.x, e.y - 0.5, '#ff4f6a');
        this.shake = Math.max(this.shake, 0.25);
        break;
      case FX.Drop:
        for (let i = 0; i < 4; i++) this.spawn(2, e.x, e.y, (Math.random() - 0.5) * 2.5, -1 - Math.random(), 0.4, 0.05, '#ffffff');
        break;
      case FX.Wash:
        this.spawn(6, e.x + (Math.random() - 0.5) * 0.5, e.y - 0.2, (Math.random() - 0.5) * 0.4, -0.7, 0.9, 0.08, '#e0feff');
        break;
    }
  }
  private stepParticles(dt: number): void {
    for (let i = 0; i < NP; i++) {
      if (this.pl[i] <= 0) continue;
      this.pl[i] -= dt;
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      const k = this.pk[i];
      if (k === 2 || k === 3) this.pvy[i] += 5 * dt;
      if (k === 1 || k === 4 || k === 6) this.ps[i] += dt * 0.12;
    }
    for (let i = 0; i < this.popT.length; i++) if (this.popL[i] > 0) {
      this.popL[i] -= dt;
      this.popY[i] -= dt * 0.8;
    }
  }

  /* ------------------------------ quadro ------------------------------ */
  draw(time: number, dt: number, q: QualitySettings): void {
    const x = this.ctx;
    const s = this.sim;
    const { T, ox, oy, dining } = this.v;
    this.budget = q.particleBudget;
    this.stepParticles(dt);
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // fundo por tema
    this.drawBackdrop(x, time);
    x.save();
    if (this.shake > 0 && q.shake) {
      x.translate((Math.random() - 0.5) * this.shake * 8, (Math.random() - 0.5) * this.shake * 8);
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    if (s.theme === 'boat') {
      const cx = ox + (T * s.cols) / 2;
      const cy = oy + (T * s.rows) / 2;
      x.translate(cx, cy);
      x.rotate(Math.sin(time * 0.9) * 0.025);
      x.translate(-cx, -cy);
    }
    x.drawImage(this.stat, ox, oy - dining, this.stat.width / this.dpr, this.stat.height / this.dpr);
    x.translate(ox, oy);
    this.drawCustomers(x, time);
    // estações dinâmicas
    const Hf = T * 0.26;
    for (const st of s.st) this.drawStationDyn(x, st, (st.x + 0.5) * T, st.y * T + (T - Hf) / 2, T, time);
    // alvo do jogador local
    const me = this.me;
    if (me && me.target >= 0) {
      const st = s.st[me.target];
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(255,255,255,' + (0.6 + Math.sin(time * 8) * 0.3).toFixed(2) + ')';
      x.beginPath();
      x.roundRect(st.x * T + 2, st.y * T + 2, T - 4, T - Hf - 2, T * 0.12);
      x.stroke();
    }
    // guia (brilho / seta)
    const gd = this.guide;
    if (gd && gd.st >= 0) {
      const st = s.st[gd.st];
      const pulse = 0.5 + Math.sin(time * 6) * 0.5;
      x.save();
      x.lineWidth = gd.strong ? 4 + pulse * 3 : 3;
      x.strokeStyle = gd.strong ? '#3effa0' : 'rgba(126,255,170,' + (0.45 + pulse * 0.4).toFixed(2) + ')';
      x.shadowColor = '#3effa0';
      x.shadowBlur = gd.strong ? 14 + pulse * 10 : 8;
      x.beginPath();
      const g = gd.strong ? pulse * 3 : 0;
      x.roundRect(st.x * T - g, st.y * T - g, T + g * 2, T - Hf + g * 2, T * 0.14);
      x.stroke();
      x.restore();
      if (gd.strong) this.drawArrow(x, (st.x + 0.5) * T, st.y * T - T * 0.1 - Math.abs(Math.sin(time * 5)) * T * 0.35, T);
    }
    // itens no chão
    for (const it of s.floor) this.drawItem(x, it, it.x * T, it.y * T - it.z * T * 0.5, T * 0.6);
    // jogadores ordenados por y (sem alocar)
    const ps = this.sorted;
    ps.length = 0;
    for (const p of s.players) ps.push(p);
    for (let i = 1; i < ps.length; i++) {
      const p = ps[i];
      let j = i - 1;
      while (j >= 0 && ps[j].y > p.y) {
        ps[j + 1] = ps[j];
        j--;
      }
      ps[j + 1] = p;
    }
    for (const p of ps) this.drawPlayer(x, p, time, T);
    // partículas
    this.drawParticles(x, T);
    x.restore();
    if (s.outage) {
      x.fillStyle = 'rgba(12,6,40,.5)';
      x.fillRect(0, 0, this.w, this.h);
    }
    this.drawTickets(x, time);
  }

  /** seta grande apontando para baixo (ponta em cx,cy) */
  drawArrow(x: CanvasRenderingContext2D, cx: number, cy: number, T: number): void {
    const w = T * 0.42;
    const h = T * 0.75;
    x.save();
    x.translate(cx, cy);
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(-w, -h * 0.5);
    x.lineTo(-w * 0.42, -h * 0.5);
    x.lineTo(-w * 0.42, -h);
    x.lineTo(w * 0.42, -h);
    x.lineTo(w * 0.42, -h * 0.5);
    x.lineTo(w, -h * 0.5);
    x.closePath();
    x.fillStyle = '#3effa0';
    x.shadowColor = 'rgba(0,0,0,.35)';
    x.shadowBlur = 6;
    x.fill();
    x.shadowBlur = 0;
    x.lineWidth = Math.max(2, T * 0.06);
    x.strokeStyle = INK;
    x.stroke();
    x.restore();
  }

  private drawBackdrop(x: CanvasRenderingContext2D, time: number): void {
    const s = this.sim;
    const g = x.createLinearGradient(0, 0, 0, this.h);
    if (s.theme === 'space') {
      g.addColorStop(0, '#0b0630');
      g.addColorStop(1, '#2a1166');
    } else if (s.theme === 'boat') {
      g.addColorStop(0, '#5ec8ff');
      g.addColorStop(1, '#1f6ad1');
    } else if (s.theme === 'truck') {
      g.addColorStop(0, '#9fe08a');
      g.addColorStop(1, '#5a9e4a');
    } else if (s.theme === 'beach') {
      g.addColorStop(0, '#7fe3ff');
      g.addColorStop(0.55, '#4fd1e8');
      g.addColorStop(0.56, '#ffe7a8');
      g.addColorStop(1, '#f5cf7a');
    } else if (s.theme === 'junina') {
      g.addColorStop(0, '#2a1a5a');
      g.addColorStop(1, '#d1495b');
    } else if (s.theme === 'snow') {
      g.addColorStop(0, '#cfe6ff');
      g.addColorStop(1, '#8ab4f8');
    } else {
      g.addColorStop(0, '#ffcf9a');
      g.addColorStop(1, '#ff8a7a');
    }
    x.fillStyle = g;
    x.fillRect(0, 0, this.w, this.h);
    if (s.theme === 'space') {
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97.3) % this.w;
        const sy = (i * 211.7 + time * 6 * ((i % 3) + 1)) % this.h;
        x.globalAlpha = 0.4 + (i % 5) * 0.12;
        x.fillRect(sx, sy, 2, 2);
      }
      x.globalAlpha = 1;
    } else if (s.theme === 'boat') {
      x.strokeStyle = 'rgba(255,255,255,.35)';
      x.lineWidth = 3;
      for (let j = 0; j < 8; j++) {
        const yy = (j / 8) * this.h + 20;
        x.beginPath();
        for (let i = 0; i <= 20; i++) {
          const xx = (i / 20) * this.w;
          const yv = yy + Math.sin(i * 0.9 + time * 2 + j) * 5;
          if (i) x.lineTo(xx, yv);
          else x.moveTo(xx, yv);
        }
        x.stroke();
      }
    } else if (s.theme === 'junina') {
      // bandeirinhas
      const cols = ['#ff4f6a', '#ffd84a', '#3ee07a', '#5ab0ff', '#ff7ae0'];
      for (let row = 0; row < 3; row++) {
        const yy = 20 + row * (this.h / 3);
        for (let i = 0; i < 24; i++) {
          const xx = (i / 24) * this.w;
          const sag = Math.sin((i / 24) * Math.PI) * 18 + Math.sin(time * 2 + i) * 2;
          x.fillStyle = cols[(i + row) % cols.length];
          x.beginPath();
          x.moveTo(xx, yy + sag);
          x.lineTo(xx + this.w / 24, yy + sag);
          x.lineTo(xx + this.w / 48, yy + sag + 16);
          x.fill();
        }
      }
    } else if (s.theme === 'snow') {
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 50; i++) {
        const sx = (i * 97.3 + Math.sin(time + i) * 12) % this.w;
        const sy = (i * 151.7 + time * 25 * ((i % 3) + 1)) % this.h;
        x.globalAlpha = 0.5 + (i % 4) * 0.12;
        x.beginPath();
        x.arc(sx, sy, 2 + (i % 3), 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
    } else if (s.theme === 'beach') {
      x.fillStyle = 'rgba(255,255,255,.6)';
      for (let i = 0; i < 6; i++) {
        const xx = ((i * 173 + time * 18) % (this.w + 120)) - 60;
        x.beginPath();
        x.ellipse(xx, this.h * 0.55, 40, 4, 0, 0, TAU);
        x.fill();
      }
    } else if (s.theme === 'truck') {
      x.fillStyle = '#5a5a6a';
      x.fillRect(0, this.h - 60, this.w, 60);
      x.fillStyle = '#ffd84a';
      for (let i = 0; i < 10; i++) x.fillRect(((i * 80 - time * 120) % (this.w + 80)) - 40, this.h - 32, 40, 6);
    }
  }

  private drawCustomers(x: CanvasRenderingContext2D, time: number): void {
    const s = this.sim;
    const { T, dining } = this.v;
    const W = T * s.cols;
    const cs = Math.round(T * 0.85);
    for (const o of s.orders) {
      const seat = o.seat % s.seats;
      const sx = ((seat + 0.5) / s.seats) * W;
      const sy = -dining * 0.38 - (1 - o.a) * T;
      const spr = charSprite(SKINS_CUST[o.id % SKINS_CUST.length], 'server', cs, o.t / o.max > 0.5, false);
      const bob = Math.sin(time * 3 + o.id) * 1.5;
      x.globalAlpha = o.a;
      x.drawImage(spr, sx - cs / 2, sy - cs * 0.9 + bob, cs, cs * 1.25);
      // balão com o prato pedido
      const by = sy - cs * 0.95;
      x.beginPath();
      x.arc(sx + cs * 0.45, by, cs * 0.3, 0, TAU);
      x.fillStyle = o.vip ? '#ffe14a' : '#ffffff';
      x.fill();
      x.lineWidth = 1.5;
      x.strokeStyle = INK;
      x.stroke();
      const r = RECIPES[o.r];
      blitIng(x, r.parts[r.parts.length - 1], false, sx + cs * 0.45, by, cs * 0.42);
      // impaciência
      if (o.t / o.max < 0.3 && ((time * 4) | 0) % 2) {
        x.fillStyle = '#ff4f6a';
        x.font = gameFont(700, Math.round(cs * 0.4));
        x.textAlign = 'center';
        x.fillText('!', sx - cs * 0.4, by + cs * 0.1);
      }
      x.globalAlpha = 1;
    }
  }

  private drawStationDyn(x: CanvasRenderingContext2D, st: Station, cx: number, cy: number, T: number, time: number): void {
    const s = this.sim;
    const it = st.item;
    const bump = st.bump > 0 ? Math.sin(st.bump * Math.PI) * T * 0.06 : 0;
    cy -= bump;
    const proc = COOKERS[st.k];
    if (st.k === 'pot' || st.k === 'pan') {
      // panela/frigideira
      x.beginPath();
      if (st.k === 'pot') x.roundRect(cx - T * 0.34, cy - T * 0.26, T * 0.68, T * 0.5, T * 0.14);
      else x.ellipse(cx, cy, T * 0.36, T * 0.26, 0, 0, TAU);
      x.fillStyle = st.k === 'pot' ? '#d9d2f0' : '#2e2a40';
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = INK;
      x.stroke();
      if (st.k === 'pot' && it) {
        x.beginPath();
        x.ellipse(cx, cy - T * 0.08, T * 0.26, T * 0.12, 0, 0, TAU);
        x.fillStyle = it.burnt ? '#3a3340' : '#9fd0ff';
        x.fill();
      }
      if (st.k === 'pan') {
        x.fillStyle = '#7a4fd1';
        x.fillRect(cx + T * 0.32, cy - T * 0.04, T * 0.18, T * 0.08);
      }
      if (it && !s.outage && s.nextProc(it) === proc) {
        // chaminha
        x.fillStyle = '#ff7a2e';
        for (let i = -1; i <= 1; i++) {
          const fl = 0.7 + Math.sin(time * 18 + i * 2 + st.i) * 0.3;
          x.beginPath();
          x.ellipse(cx + i * T * 0.18, cy + T * 0.28, T * 0.05, T * 0.08 * fl, 0, 0, TAU);
          x.fill();
        }
      }
    } else if (st.k === 'blender') {
      x.beginPath();
      x.moveTo(cx - T * 0.22, cy - T * 0.36);
      x.lineTo(cx + T * 0.22, cy - T * 0.36);
      x.lineTo(cx + T * 0.16, cy + T * 0.2);
      x.lineTo(cx - T * 0.16, cy + T * 0.2);
      x.closePath();
      x.fillStyle = 'rgba(224,254,255,.85)';
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = INK;
      x.stroke();
      if (it && s.nextProc(it) === 'blend' && !s.outage) {
        const g = INGS[compIng(it.c)];
        x.fillStyle = g.c[0];
        const wob = Math.sin(time * 30) * T * 0.02;
        x.fillRect(cx - T * 0.15 + wob, cy - T * 0.1, T * 0.3, T * 0.28);
      }
    } else if (st.k === 'plates' && st.n > 0) {
      for (let i = 0; i < Math.min(st.n, 6); i++) drawPlate(x, [], cx, cy + T * 0.08 - i * T * 0.06, T * 0.62);
    } else if (st.k === 'dirty' && st.n > 0) {
      for (let i = 0; i < Math.min(st.n, 6); i++) drawPlate(x, [], cx, cy + T * 0.06 - i * T * 0.06, T * 0.6, true);
    } else if (st.k === 'sink' && st.n > 0) {
      for (let i = 0; i < Math.min(st.n, 4); i++) drawPlate(x, [], cx - T * 0.06 + i * T * 0.04, cy - i * T * 0.04, T * 0.42, true);
      if (st.busy > 0) {
        x.fillStyle = 'rgba(255,255,255,.8)';
        for (let i = 0; i < 4; i++) {
          x.beginPath();
          x.arc(cx + Math.sin(time * 9 + i * 1.7) * T * 0.25, cy + Math.cos(time * 7 + i) * T * 0.12, T * 0.06, 0, TAU);
          x.fill();
        }
      }
    } else if (st.k === 'belt') {
      x.strokeStyle = 'rgba(255,255,255,.35)';
      x.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const xx = cx - T * 0.4 + ((i * T * 0.25 + time * T * 0.6) % (T * 0.8));
        x.beginPath();
        x.moveTo(xx, cy - T * 0.25);
        x.lineTo(xx, cy + T * 0.25);
        x.stroke();
      }
    }
    if (it) {
      let ix = cx;
      if (st.k === 'belt') ix = cx - T * 0.3 + st.prog * T * 0.6;
      const iy = st.k === 'pot' ? cy - T * 0.14 : st.k === 'blender' ? cy - T * 0.05 : cy;
      if (st.k === 'board' && st.busy > 0) {
        // faca picando
        x.save();
        x.translate(cx + T * 0.25, cy - T * 0.15);
        x.rotate(-0.6 + Math.abs(Math.sin(time * 22)) * 0.6);
        x.fillStyle = '#dcd6f0';
        x.fillRect(-T * 0.04, -T * 0.32, T * 0.08, T * 0.3);
        x.fillStyle = '#ff7a2e';
        x.fillRect(-T * 0.05, -T * 0.04, T * 0.1, T * 0.14);
        x.restore();
      }
      this.drawItem(x, it, ix, iy, T * (st.k === 'blender' ? 0.5 : 0.66));
      // progresso
      const prog = it.k === IK.Ing ? it.prog : 0;
      if (prog > 0 && prog < 1) this.bar(x, cx, cy - T * 0.52, T * 0.7, prog, '#3ee07a');
      if (proc && it.k === IK.Ing && !it.burnt && it.over > 1.5 && s.nextProc(it) !== proc && proc !== 'blend') {
        const k = Math.min(1, it.over / 8);
        if (((time * (3 + k * 8)) | 0) % 2) {
          x.beginPath();
          x.arc(cx, cy - T * 0.55, T * 0.18, 0, TAU);
          x.fillStyle = '#ff4f6a';
          x.fill();
          x.lineWidth = 2;
          x.strokeStyle = INK;
          x.stroke();
          x.fillStyle = '#fff';
          x.font = gameFont(700, Math.round(T * 0.28));
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          x.fillText('!', cx, cy - T * 0.54);
        }
      }
    }
    if (st.k === 'sink' && st.prog > 0) this.bar(x, cx, cy - T * 0.52, T * 0.7, st.prog, '#5ef0ff');
    if (st.fire > 0) this.drawFire(x, cx, cy, T, time, st.fire, st.i);
  }

  private bar(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, k: number, col: string): void {
    x.beginPath();
    x.roundRect(cx - w / 2, cy - 5, w, 10, 5);
    x.fillStyle = INK;
    x.fill();
    x.beginPath();
    x.roundRect(cx - w / 2 + 2, cy - 3, Math.max(2, (w - 4) * k), 6, 3);
    x.fillStyle = col;
    x.fill();
  }

  private drawFire(x: CanvasRenderingContext2D, cx: number, cy: number, T: number, time: number, k: number, seed: number): void {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const ph = time * 9 + i * 1.7 + seed;
      const fx = cx + (i - (n - 1) / 2) * T * 0.18 + Math.sin(ph) * T * 0.03;
      const h = T * (0.45 + Math.sin(ph * 1.3) * 0.12) * (0.5 + k * 0.5);
      x.beginPath();
      x.moveTo(fx - T * 0.12, cy + T * 0.2);
      x.quadraticCurveTo(fx - T * 0.14, cy - h * 0.4, fx, cy - h);
      x.quadraticCurveTo(fx + T * 0.14, cy - h * 0.4, fx + T * 0.12, cy + T * 0.2);
      x.closePath();
      x.fillStyle = i & 1 ? '#ff7a2e' : '#ff4f3a';
      x.fill();
      x.beginPath();
      x.ellipse(fx, cy + T * 0.05, T * 0.05, h * 0.3, 0, 0, TAU);
      x.fillStyle = '#ffe14a';
      x.fill();
    }
    if (Math.random() < 0.3) this.spawn(4, (cx / T), (cy / T) - 0.5, (Math.random() - 0.5) * 0.3, -0.9, 1.4, 0.16, '#5a5068');
  }

  drawItem(x: CanvasRenderingContext2D, it: Item, cx: number, cy: number, s: number): void {
    if (it.k === IK.Ing) blitIng(x, it.c, it.burnt, cx, cy, s);
    else if (it.k === IK.Plate) {
      const m = it.parts.length ? this.sim.matchOrder(it.parts) : null;
      drawPlate(x, it.parts, cx, cy, s * 1.05, false, m ? RECIPES[m.r].dish : 'plate');
      if (m) {
        x.fillStyle = '#ffe14a';
        x.beginPath();
        x.arc(cx + s * 0.45, cy - s * 0.35, s * 0.1, 0, TAU);
        x.fill();
      }
    } else if (it.k === IK.Dirty) {
      for (let i = 0; i < Math.min(it.n, 5); i++) drawPlate(x, [], cx, cy - i * s * 0.08, s, true);
    } else {
      // extintor
      x.save();
      x.translate(cx, cy);
      x.beginPath();
      x.roundRect(-s * 0.2, -s * 0.38, s * 0.4, s * 0.72, s * 0.15);
      x.fillStyle = '#ff4f6a';
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = INK;
      x.stroke();
      x.fillStyle = '#dcd6f0';
      x.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.14);
      x.fillRect(0, -s * 0.5, s * 0.3, s * 0.07);
      x.fillStyle = 'rgba(255,255,255,.5)';
      x.fillRect(-s * 0.12, -s * 0.3, s * 0.06, s * 0.5);
      x.restore();
    }
  }

  private drawPlayer(x: CanvasRenderingContext2D, p: Player, time: number, T: number): void {
    const px = p.x * T;
    const py = p.y * T;
    const sz = Math.round(T * 1.05);
    // sombra
    x.fillStyle = 'rgba(42,11,92,.22)';
    x.beginPath();
    x.ellipse(px, py + T * 0.12, T * 0.3, T * 0.12, 0, 0, TAU);
    x.fill();
    const moving = Math.hypot(p.vx, p.vy) > 0.3;
    const hop = moving ? Math.abs(Math.sin(p.walk * 3)) * T * 0.1 : 0;
    const chop = p.acting > 0 ? Math.abs(Math.sin(time * 20)) * T * 0.04 : 0;
    const blink = ((time * 0.7 + p.id * 0.37) % 4) < 0.08;
    const spr = charSprite(p.skin, p.role, sz, p.happy > 0, blink, p.look);
    const sq = moving ? 1 + Math.sin(p.walk * 6) * 0.04 : 1;
    const flip = p.fx < -0.2 ? -1 : 1;
    x.save();
    x.translate(px, py + T * 0.15 - hop - chop);
    x.scale(flip / sq, sq);
    x.drawImage(spr, -sz / 2, -sz * 1.25, sz, sz * 1.25);
    x.restore();
    // item na mão
    if (p.hold) {
      const hx = px + p.fx * T * 0.32;
      const hy = py - T * 0.42 + p.fy * T * 0.18 - hop;
      this.drawItem(x, p.hold, hx, hy, T * 0.6);
      if (p.hold.k === IK.Ext && p.acting > 0) {
        for (let i = 0; i < 2; i++) this.spawn(5, p.x + p.fx * 0.6, p.y + p.fy * 0.6 - 0.3, p.fx * 3 + (Math.random() - 0.5), p.fy * 3 + (Math.random() - 0.5) - 0.4, 0.5, 0.15, '#ffffff');
      }
    }
    // nome
    x.font = gameFont(700, Math.max(9, Math.round(T * 0.22)));
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.lineWidth = 3;
    x.strokeStyle = INK;
    const ny = py - T * 1.12 - hop;
    x.strokeText(p.name, px, ny);
    x.fillStyle = p === this.me ? '#ffe14a' : '#ffffff';
    x.fillText(p.name, px, ny);
    if (p.emote) drawEmoteBubble(x, p.emote, px + T * 0.4, py - T * 1.3, T / 60, time);
    if (p === this.selected) {
      x.save();
      x.strokeStyle = '#ffe14a';
      x.lineWidth = 3;
      x.setLineDash([6, 4]);
      x.lineDashOffset = -time * 20;
      x.beginPath();
      x.ellipse(px, py + T * 0.05, T * 0.48, T * 0.22, 0, 0, TAU);
      x.stroke();
      x.restore();
    }
    if (p.bot && p.pet) {
      const bob = Math.sin(time * 4 + p.id) * T * 0.04;
      const pop = p.pet === '?' || p.pet === '!' ? 1 + Math.max(0, Math.sin(time * 14)) * 0.12 : 1;
      drawPetIcon(x, p.pet, px, py - T * 1.55 + bob - hop, T * 0.24 * pop, time);
    }
  }

  private drawParticles(x: CanvasRenderingContext2D, T: number): void {
    for (let i = 0; i < NP; i++) {
      const l = this.pl[i];
      if (l <= 0) continue;
      const k = this.pk[i];
      const a = l / this.pm[i];
      x.globalAlpha = k === 2 || k === 3 ? 1 : a * 0.8;
      x.fillStyle = this.pc[i];
      const r = this.ps[i] * T;
      x.beginPath();
      x.arc(this.px[i] * T, this.py[i] * T, r, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let i = 0; i < this.popT.length; i++) {
      const l = this.popL[i];
      if (l <= 0) continue;
      x.globalAlpha = Math.min(1, l * 2);
      x.font = gameFont(700, Math.round(T * 0.42));
      x.lineWidth = 4;
      x.strokeStyle = INK;
      x.strokeText(this.popT[i], this.popX[i] * T, this.popY[i] * T);
      x.fillStyle = this.popC[i];
      x.fillText(this.popT[i], this.popX[i] * T, this.popY[i] * T);
    }
    x.globalAlpha = 1;
  }

  /** só os tickets (sobreposição do modo 3D) */
  drawOverlay(time: number): void {
    const x = this.ctx;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, this.w, this.h);
    if (this.sim.outage) {
      x.fillStyle = 'rgba(12,6,40,.45)';
      x.fillRect(0, 0, this.w, this.h);
    }
    this.drawTickets(x, time);
  }
  destroy(): void {
    this.cv.width = this.cv.height = 1;
  }

  /* ------------------------------ tickets ------------------------------ */
  private drawTickets(x: CanvasRenderingContext2D, time: number): void {
    const s = this.sim;
    const { ticketsY, ticketsH } = this.v;
    const n = s.orders.length;
    const maxW = 160;
    const gap = 6;
    const tw = Math.min(maxW, (this.w - 12 - gap * Math.max(0, Math.max(4, n) - 1)) / Math.max(4, n));
    let tx = 8;
    for (const o of s.orders) {
      const r = RECIPES[o.r];
      const frac = Math.max(0, o.t / o.max);
      const yy = ticketsY + (1 - o.a) * -ticketsH;
      const shake = frac < 0.25 ? Math.sin(time * 30) * 1.5 : 0;
      x.save();
      x.translate(tx + shake, yy);
      x.beginPath();
      x.roundRect(0, 0, tw, ticketsH, 10);
      x.fillStyle = o.vip ? '#fff3a0' : '#fffaf0';
      x.fill();
      x.lineWidth = o.vip ? 3 : 2;
      x.strokeStyle = o.vip ? '#e98f00' : INK;
      x.stroke();
      // barra de paciência
      x.fillStyle = frac > 0.5 ? '#3ee07a' : frac > 0.25 ? '#ffcf2e' : '#ff4f6a';
      x.beginPath();
      x.roundRect(4, 4, (tw - 8) * frac, 6, 3);
      x.fill();
      // nome
      x.fillStyle = INK;
      x.font = gameFont(600, tw < 90 ? 9 : 11);
      x.textAlign = 'center';
      x.textBaseline = 'top';
      let name = r.name();
      if (x.measureText(name).width > tw - 6) {
        while (name.length > 3 && x.measureText(name + '…').width > tw - 6) name = name.slice(0, -1);
        name += '…';
      }
      x.fillText(name, tw / 2, 13);
      // receita como SEQUÊNCIA: [ingrediente] › [estação] › [estação] (✓ quando já está no seu prato)
      const np = r.parts.length;
      const cw = (tw - 8) / np;
      const held = this.me?.hold && this.me.hold.k === IK.Plate ? this.me.hold.parts : null;
      for (let i = 0; i < np; i++) {
        const c = r.parts[i];
        const st = compStage(c);
        const route = INGS[compIng(c)].routes[compRoute(c)];
        const cells = 1 + st;
        const unit = Math.min(cw / (cells + (cells - 1) * 0.35), ticketsH * 0.4);
        const rowW = unit * cells + unit * 0.35 * (cells - 1);
        let cx = 4 + cw * i + (cw - rowW) / 2 + unit / 2;
        const cy = ticketsH * 0.62;
        if (i > 0) {
          x.fillStyle = 'rgba(42,11,92,.18)';
          x.fillRect(4 + cw * i - 0.5, ticketsH * 0.42, 1, ticketsH * 0.42);
        }
        blitIng(x, c - st, false, cx, cy, unit * 1.05);
        for (let k = 0; k < st; k++) {
          x.fillStyle = INK;
          x.beginPath();
          const ax = cx + unit * 0.5 + unit * 0.06;
          x.moveTo(ax, cy - unit * 0.14);
          x.lineTo(ax + unit * 0.22, cy);
          x.lineTo(ax, cy + unit * 0.14);
          x.fill();
          cx += unit * 1.35;
          this.procGlyph(x, route[k], cx, cy, unit * 0.36);
        }
        if (held && held.includes(c)) {
          x.fillStyle = '#3ee07a';
          x.beginPath();
          x.arc(4 + cw * (i + 0.5), ticketsH * 0.88, Math.min(6, cw * 0.15), 0, TAU);
          x.fill();
          x.strokeStyle = '#fff';
          x.lineWidth = 2;
          x.beginPath();
          x.moveTo(4 + cw * (i + 0.5) - 3, ticketsH * 0.88);
          x.lineTo(4 + cw * (i + 0.5) - 0.5, ticketsH * 0.88 + 2.5);
          x.lineTo(4 + cw * (i + 0.5) + 3.5, ticketsH * 0.88 - 2.5);
          x.stroke();
        }
      }
      x.restore();
      tx += tw + gap;
    }
  }
  private procGlyph(x: CanvasRenderingContext2D, p: Proc, cx: number, cy: number, r: number): void {
    x.save();
    x.translate(cx, cy);
    // fundo: selo da estação
    x.beginPath();
    x.arc(0, 0, r * 1.45, 0, TAU);
    x.fillStyle = p === 'chop' ? '#ffe2b8' : p === 'blend' ? '#d8f6ff' : p === 'boil' ? '#dbe9ff' : '#ffe0d0';
    x.fill();
    x.lineWidth = 1;
    x.strokeStyle = 'rgba(42,11,92,.35)';
    x.stroke();
    x.lineWidth = 1.5;
    x.strokeStyle = INK;
    x.beginPath();
    if (p === 'chop') {
      x.moveTo(-r, r * 0.6);
      x.lineTo(r, -r * 0.6);
      x.lineWidth = 2.5;
      x.strokeStyle = '#7a7690';
    } else if (p === 'boil') {
      x.roundRect(-r, -r * 0.5, r * 2, r * 1.2, r * 0.3);
      x.fillStyle = '#9fd0ff';
      x.fill();
    } else if (p === 'fry') {
      x.ellipse(0, 0, r, r * 0.6, 0, 0, TAU);
      x.fillStyle = '#3b3550';
      x.fill();
    } else if (p === 'bake') {
      x.roundRect(-r, -r * 0.8, r * 2, r * 1.6, r * 0.3);
      x.fillStyle = '#ff9a6b';
      x.fill();
    } else {
      x.moveTo(-r * 0.7, -r);
      x.lineTo(r * 0.7, -r);
      x.lineTo(r * 0.5, r);
      x.lineTo(-r * 0.5, r);
      x.closePath();
      x.fillStyle = '#e0feff';
      x.fill();
    }
    x.stroke();
    x.restore();
  }
}
