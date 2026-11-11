/* ============================================================
 *  BLOOP NO LUGAR — tabuleiro (Canvas 2D) + toque.
 *  Camada estática em cache (cores, padrões, bordas das regiões) + camada viva
 *  (X, Bloops com squash & stretch, brilho de região completa, dicas, conflitos, festa).
 *  O jogo decide as regras; aqui só desenha e traduz toques em eventos de casa.
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS, type Skin } from '../../game/skins';
import { save as globalSave } from '../../core/storage';
import { REGION_COLORS, drawPattern } from './palette';

export const EMPTY = 0;
export const MARK = 1; // X manual
export const AUTO = 2; // X automático
export const BLOOP = 3;

const INK = '#1d0b48';
const TAU = Math.PI * 2;

export interface BoardInput {
  /** dedo encostou numa casa (realce de linha/coluna) */
  press?(c: number): void;
  tap(c: number): void;
  hold(c: number): void;
  /** começou a arrastar a partir de `start`; devolve false para não pintar */
  dragStart(start: number): boolean;
  dragCell(c: number): void;
  dragEnd(): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  c: string;
  star: boolean;
}

export interface HintView {
  focus: number[];
  elim: number[];
  place: number;
  cell: number;
}

export class Board {
  readonly canvas: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private stat: HTMLCanvasElement | null = null;
  n = 5;
  reg: Uint8Array = new Uint8Array(25);
  cells: Uint8Array = new Uint8Array(25);
  /** tamanho em px CSS */
  size = 300;
  dpr = 1;
  pad = 6;
  cs = 50;
  patterns = false;
  fancy = true;
  // animações (tempo em s, relógio interno)
  time = 0;
  private popT = new Map<number, number>();
  private markT = new Map<number, number>();
  private wrongT = new Map<number, number>();
  private shimmer = new Map<number, number>();
  private blinkAt = new Map<number, number>();
  private parts: Particle[] = [];
  winT = -1;
  conflictCells = new Set<number>();
  deadUnits: number[] = [];
  hint: HintView | null = null;
  pressCell = -1;
  dirty = true;
  // sprites
  private skin: Skin;
  private spr = new Map<string, HTMLCanvasElement>();
  private sprR = 0;
  // toque
  private pid = -1;
  private startCell = -1;
  private lastCell = -1;
  private dragging = false;
  private holdTimer = 0;
  private held = false;
  private lastPt: [number, number] = [0, 0];
  private offs: (() => void)[] = [];

  constructor(private input: BoardInput) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lg-canvas';
    this.x = this.canvas.getContext('2d')!;
    this.skin = SKINS.find((s) => s.id === globalSave.skin) ?? SKINS[0];
    const on = <K extends keyof HTMLElementEventMap>(k: K, f: (e: HTMLElementEventMap[K]) => void) => {
      this.canvas.addEventListener(k, f as EventListener);
      this.offs.push(() => this.canvas.removeEventListener(k, f as EventListener));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e, false));
    on('pointercancel', (e) => this.up(e, true));
    on('contextmenu', (e) => e.preventDefault());
  }

  destroy(): void {
    clearTimeout(this.holdTimer);
    for (const f of this.offs) f();
    this.canvas.remove();
  }

  setPuzzle(n: number, reg: Uint8Array, cells: Uint8Array): void {
    this.n = n;
    this.reg = reg;
    this.cells = cells;
    this.popT.clear();
    this.markT.clear();
    this.wrongT.clear();
    this.shimmer.clear();
    this.parts = [];
    this.winT = -1;
    this.hint = null;
    this.stat = null;
    this.dirty = true;
  }

  resize(size: number, dprCap: number): void {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    if (Math.abs(size - this.size) < 0.5 && dpr === this.dpr && this.stat) return;
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.stat = null;
    this.spr.clear();
    this.dirty = true;
  }

  private geom(): void {
    this.pad = Math.max(4, Math.round(this.size * 0.016));
    this.cs = (this.size - this.pad * 2) / this.n;
  }
  cellXY(c: number): [number, number] {
    const n = this.n;
    return [this.pad + (c % n) * this.cs + this.cs / 2, this.pad + Math.floor(c / n) * this.cs + this.cs / 2];
  }
  /** centro da casa em coordenadas da página (para efeitos em DOM) */
  cellPage(c: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const [x, y] = this.cellXY(c);
    return [r.left + x, r.top + y];
  }
  private cellAt(px: number, py: number): number {
    const k = Math.floor((px - this.pad) / this.cs);
    const r = Math.floor((py - this.pad) / this.cs);
    if (k < 0 || r < 0 || k >= this.n || r >= this.n) return -1;
    return r * this.n + k;
  }

  /* ------------------------------ eventos visuais ------------------------------ */
  pop(c: number): void {
    this.popT.set(c, this.time);
    this.burst(c, 9, false);
    this.dirty = true;
  }
  mark(c: number): void {
    this.markT.set(c, this.time);
    this.dirty = true;
  }
  wrong(c: number): void {
    this.wrongT.set(c, this.time);
    this.dirty = true;
  }
  regionDone(g: number): void {
    this.shimmer.set(g, this.time);
    for (let c = 0; c < this.n * this.n; c++) if (this.reg[c] === g && this.cells[c] === BLOOP) this.burst(c, 14, true);
  }
  win(): void {
    this.winT = this.time;
    for (let c = 0; c < this.n * this.n; c++) if (this.cells[c] === BLOOP) this.burst(c, 10, true);
  }
  private burst(c: number, k: number, star: boolean): void {
    if (!this.fancy && !star) return;
    const [cx, cy] = this.cellXY(c);
    const col = REGION_COLORS[this.reg[c] % 12].fill;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU + Math.random() * 0.5;
      const sp = this.cs * (1.4 + Math.random() * 1.6);
      this.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.cs * 0.8, r: this.cs * (0.05 + Math.random() * 0.05), life: 0, max: 0.5 + Math.random() * 0.4, c: i % 3 === 0 ? '#ffffff' : star ? '#ffe066' : col, star });
    }
  }
  /** algo animando? (o loop pode dormir quando não) */
  busy(): boolean {
    const t = this.time;
    for (const v of this.popT.values()) if (t - v < 0.7) return true;
    for (const v of this.markT.values()) if (t - v < 0.25) return true;
    for (const v of this.wrongT.values()) if (t - v < 0.9) return true;
    for (const v of this.shimmer.values()) if (t - v < 1.1) return true;
    return this.parts.length > 0 || this.winT >= 0 || !!this.hint || this.conflictCells.size > 0 || this.deadUnits.length > 0;
  }

  /* ------------------------------ toque ------------------------------ */
  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.size, ((e.clientY - r.top) / r.height) * this.size];
  }
  private down(e: PointerEvent): void {
    if (this.pid >= 0 || e.button > 0) return;
    e.preventDefault();
    const [px, py] = this.local(e);
    const c = this.cellAt(px, py);
    if (c < 0) return;
    this.pid = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    this.startCell = c;
    this.lastCell = c;
    this.dragging = false;
    this.held = false;
    this.lastPt = [px, py];
    this.pressCell = c;
    this.dirty = true;
    this.input.press?.(c);
    clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => {
      if (this.pid >= 0 && !this.dragging) {
        this.held = true;
        this.input.hold(this.startCell);
      }
    }, 430);
  }
  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pid) return;
    const [px, py] = this.local(e);
    // amostra o caminho (dedo rápido não pula casas)
    const [ox, oy] = this.lastPt;
    const dist = Math.hypot(px - ox, py - oy);
    const steps = Math.max(1, Math.ceil(dist / (this.cs * 0.3)));
    for (let i = 1; i <= steps; i++) {
      const c = this.cellAt(ox + ((px - ox) * i) / steps, oy + ((py - oy) * i) / steps);
      if (c < 0 || c === this.lastCell) continue;
      if (!this.dragging) {
        if (this.held) break;
        clearTimeout(this.holdTimer);
        this.dragging = this.input.dragStart(this.startCell);
        if (!this.dragging) {
          this.held = true; // ignora o resto do gesto
          break;
        }
      }
      this.lastCell = c;
      this.pressCell = c;
      this.input.dragCell(c);
      this.dirty = true;
    }
    this.lastPt = [px, py];
  }
  private up(e: PointerEvent, cancel: boolean): void {
    if (e.pointerId !== this.pid) return;
    this.pid = -1;
    clearTimeout(this.holdTimer);
    this.pressCell = -1;
    this.dirty = true;
    if (this.dragging) this.input.dragEnd();
    else if (!this.held && !cancel) this.input.tap(this.startCell);
    this.dragging = false;
  }

  /* ------------------------------ sprites ------------------------------ */
  private sprite(mood: PlayerPose['mood'], blink: number, look = 0): HTMLCanvasElement {
    const R = this.cs * 0.33 * this.dpr;
    if (R !== this.sprR) {
      this.spr.clear();
      this.sprR = R;
    }
    const key = mood + blink + ':' + look;
    let c = this.spr.get(key);
    if (c) return c;
    const size = Math.ceil(R * 3.3);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.translate(size / 2, size / 2);
    try {
      drawPlayer(x, this.skin, R, { t: 0, blink, lookX: 0.15, lookY: look, sx: 1, sy: 1, mood, lx: -0.5, ly: -0.7, still: true });
    } catch {
      x.fillStyle = this.skin.light;
      x.beginPath();
      x.arc(0, 0, R, 0, TAU);
      x.fill();
    }
    this.spr.set(key, c);
    return c;
  }
  /** sprite grande avulso (telas de vitória/derrota) */
  static bigBloop(R: number, mood: PlayerPose['mood'], lookY = 0): HTMLCanvasElement {
    const skin = SKINS.find((s) => s.id === globalSave.skin) ?? SKINS[0];
    const size = Math.ceil(R * 3.3);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.translate(size / 2, size / 2);
    try {
      drawPlayer(x, skin, R, { t: 0, blink: 0, lookX: 0, lookY, sx: 1, sy: 1, mood, lx: -0.5, ly: -0.7, still: true });
    } catch {
      x.fillStyle = skin.light;
      x.beginPath();
      x.arc(0, 0, R, 0, TAU);
      x.fill();
    }
    return c;
  }
  static skinColors(): { light: string; dark: string } {
    const s = SKINS.find((k) => k.id === globalSave.skin) ?? SKINS[0];
    return { light: s.light, dark: s.dark };
  }

  /* ------------------------------ camada estática ------------------------------ */
  private buildStatic(): void {
    this.geom();
    const { n, cs, pad, size, dpr } = this;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const x = c.getContext('2d')!;
    x.scale(dpr, dpr);
    // moldura
    x.fillStyle = INK;
    x.beginPath();
    x.roundRect(0, 0, size, size, pad * 2.2);
    x.fill();
    x.save();
    x.beginPath();
    x.roundRect(pad, pad, size - pad * 2, size - pad * 2, pad * 1.2);
    x.clip();
    // casas
    const pats = new Map<number, CanvasPattern | null>();
    for (let i = 0; i < n * n; i++) {
      const g = this.reg[i] % 12;
      const col = REGION_COLORS[g];
      const px = pad + (i % n) * cs;
      const py = pad + Math.floor(i / n) * cs;
      x.fillStyle = col.fill;
      x.fillRect(px, py, cs + 0.5, cs + 0.5);
      // almofadinha: brilho em cima, sombra embaixo
      const gr = x.createLinearGradient(0, py, 0, py + cs);
      gr.addColorStop(0, 'rgba(255,255,255,0.32)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      gr.addColorStop(1, 'rgba(40,10,80,0.10)');
      x.fillStyle = gr;
      x.beginPath();
      x.roundRect(px + cs * 0.07, py + cs * 0.07, cs * 0.86, cs * 0.86, cs * 0.2);
      x.fill();
      if (this.patterns) {
        let p = pats.get(g);
        if (p === undefined) {
          const ts = Math.max(8, Math.round(cs * 0.5 * dpr));
          const tc = document.createElement('canvas');
          tc.width = tc.height = ts;
          const tx = tc.getContext('2d')!;
          tx.globalAlpha = 0.5;
          drawPattern(tx, g, ts, col.deep);
          p = x.createPattern(tc, 'repeat');
          p?.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr).translate(pad * dpr, pad * dpr));
          pats.set(g, p);
        }
        if (p) {
          x.fillStyle = p;
          x.fillRect(px, py, cs + 0.5, cs + 0.5);
        }
      }
    }
    // linhas finas da grade
    x.strokeStyle = 'rgba(29,11,72,0.22)';
    x.lineWidth = Math.max(1, cs * 0.025);
    x.beginPath();
    for (let i = 1; i < n; i++) {
      x.moveTo(pad + i * cs, pad);
      x.lineTo(pad + i * cs, size - pad);
      x.moveTo(pad, pad + i * cs);
      x.lineTo(size - pad, pad + i * cs);
    }
    x.stroke();
    // bordas entre regiões
    x.strokeStyle = INK;
    x.lineWidth = Math.max(2.5, cs * 0.085);
    x.lineCap = 'round';
    x.beginPath();
    for (let r = 0; r < n; r++)
      for (let k = 0; k < n; k++) {
        const i = r * n + k;
        if (k < n - 1 && this.reg[i] !== this.reg[i + 1]) {
          x.moveTo(pad + (k + 1) * cs, pad + r * cs);
          x.lineTo(pad + (k + 1) * cs, pad + (r + 1) * cs);
        }
        if (r < n - 1 && this.reg[i] !== this.reg[i + n]) {
          x.moveTo(pad + k * cs, pad + (r + 1) * cs);
          x.lineTo(pad + (k + 1) * cs, pad + (r + 1) * cs);
        }
      }
    x.stroke();
    x.restore();
    this.stat = c;
  }

  /* ------------------------------ quadro ------------------------------ */
  private lastDt = 1 / 60;
  frame(dt: number): boolean {
    this.time += dt;
    this.lastDt = Math.min(0.05, dt);
    if (!this.stat) this.buildStatic();
    const anim = this.busy() || this.fancy;
    if (!this.dirty && !anim) return false;
    this.dirty = false;
    this.draw();
    return true;
  }

  private cellPath(x: CanvasRenderingContext2D, cells: Iterable<number>, inset = 0): void {
    const { n, cs, pad } = this;
    x.beginPath();
    for (const c of cells) x.rect(pad + (c % n) * cs + inset, pad + Math.floor(c / n) * cs + inset, cs - inset * 2, cs - inset * 2);
  }
  /** contorno externo de um conjunto de casas */
  private outline(x: CanvasRenderingContext2D, cells: number[]): void {
    const { n, cs, pad } = this;
    const set = new Set(cells);
    x.beginPath();
    for (const c of cells) {
      const r = Math.floor(c / n);
      const k = c % n;
      const X0 = pad + k * cs;
      const Y0 = pad + r * cs;
      if (r === 0 || !set.has(c - n)) (x.moveTo(X0, Y0), x.lineTo(X0 + cs, Y0));
      if (r === n - 1 || !set.has(c + n)) (x.moveTo(X0, Y0 + cs), x.lineTo(X0 + cs, Y0 + cs));
      if (k === 0 || !set.has(c - 1)) (x.moveTo(X0, Y0), x.lineTo(X0, Y0 + cs));
      if (k === n - 1 || !set.has(c + 1)) (x.moveTo(X0 + cs, Y0), x.lineTo(X0 + cs, Y0 + cs));
    }
    x.stroke();
  }

  private drawX(x: CanvasRenderingContext2D, c: number, auto: boolean, alpha = 1, scale = 1, color?: string): void {
    const [cx, cy] = this.cellXY(c);
    const s = this.cs * (auto ? 0.13 : 0.19) * scale;
    x.save();
    x.globalAlpha = alpha * (auto ? 0.55 : 0.9);
    x.strokeStyle = color ?? REGION_COLORS[this.reg[c] % 12].deep;
    x.lineWidth = Math.max(1.5, this.cs * (auto ? 0.06 : 0.085));
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx - s, cy - s);
    x.lineTo(cx + s, cy + s);
    x.moveTo(cx + s, cy - s);
    x.lineTo(cx - s, cy + s);
    x.stroke();
    x.restore();
  }

  private drawBloopAt(x: CanvasRenderingContext2D, c: number, mood: PlayerPose['mood'], sx: number, sy: number, dy: number, alpha = 1, blink = 0, wave = 0): void {
    const [cx, cy] = this.cellXY(c);
    const spr = this.sprite(mood, blink);
    const w = spr.width / this.dpr;
    const baseY = cy + this.cs * 0.33;
    x.save();
    x.globalAlpha = alpha;
    // sombrinha
    x.fillStyle = 'rgba(29,11,72,0.22)';
    x.beginPath();
    x.ellipse(cx, baseY + this.cs * 0.02, this.cs * 0.28 * Math.max(0.3, sx) * (1 - Math.min(0.5, -dy / this.cs)), this.cs * 0.07, 0, 0, TAU);
    x.fill();
    // escala ancorada no pé
    x.translate(cx, baseY + dy);
    x.scale(sx, sy);
    x.drawImage(spr, -w / 2, -w / 2 - this.cs * 0.33, w, w);
    if (wave) {
      // mãozinha acenando
      const R = this.cs * 0.33;
      const a = Math.sin(wave * 14) * 0.6 - 0.6;
      x.translate(R * 0.95, -R * 1.05);
      x.rotate(a);
      x.fillStyle = this.skin.light;
      x.strokeStyle = this.skin.dark;
      x.lineWidth = Math.max(1, R * 0.08);
      x.beginPath();
      x.ellipse(0, -R * 0.35, R * 0.2, R * 0.27, 0, 0, TAU);
      x.fill();
      x.stroke();
    }
    x.restore();
  }

  private draw(): void {
    const x = this.x;
    const { n, dpr, size, time } = this;
    const nn = n * n;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, size, size);
    x.drawImage(this.stat!, 0, 0, size, size);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);

    // realce de linha/coluna sob o dedo
    if (this.pressCell >= 0) {
      const r = Math.floor(this.pressCell / n);
      const k = this.pressCell % n;
      const cells: number[] = [];
      for (let i = 0; i < n; i++) cells.push(r * n + i, i * n + k);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      this.cellPath(x, cells);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.28)';
      this.cellPath(x, [this.pressCell]);
      x.fill();
    }

    // brilho de região completa
    for (const [g, t0] of this.shimmer) {
      const k = (time - t0) / 1.0;
      if (k > 1.1) {
        this.shimmer.delete(g);
        continue;
      }
      const cells: number[] = [];
      for (let i = 0; i < nn; i++) if (this.reg[i] === g) cells.push(i);
      x.save();
      this.cellPath(x, cells);
      x.clip();
      x.fillStyle = `rgba(255,255,255,${0.35 * Math.max(0, 1 - k)})`;
      x.fillRect(0, 0, size, size);
      const bx = -size * 0.5 + k * size * 2.2;
      const gr = x.createLinearGradient(bx - size * 0.25, 0, bx + size * 0.25, size * 0.4);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, size, size);
      x.restore();
    }

    // conflitos (suaves)
    if (this.conflictCells.size || this.deadUnits.length) {
      x.fillStyle = `rgba(255,60,90,${0.18 + 0.14 * pulse})`;
      this.cellPath(x, this.conflictCells);
      x.fill();
      x.strokeStyle = `rgba(255,70,100,${0.55 + 0.35 * pulse})`;
      x.lineWidth = Math.max(2, this.cs * 0.06);
      for (const u of this.deadUnits) this.outline(x, this.unitCells(u));
    }

    // dica: foco
    const h = this.hint;
    if (h) {
      x.fillStyle = `rgba(255,255,255,${0.22 + 0.18 * pulse})`;
      this.cellPath(x, h.focus);
      x.fill();
      x.strokeStyle = '#ffd23f';
      x.lineWidth = Math.max(2.5, this.cs * 0.08);
      x.lineJoin = 'round';
      x.lineCap = 'round';
      this.outline(x, h.focus);
    }

    // X
    for (let i = 0; i < nn; i++) {
      const v = this.cells[i];
      if (v !== MARK && v !== AUTO) continue;
      const wt = this.wrongT.get(i);
      if (wt !== undefined && time - wt < 0.75) continue;
      const mt = this.markT.get(i);
      let sc = 1;
      if (mt !== undefined) {
        const k = (time - mt) / 0.2;
        if (k >= 1) this.markT.delete(i);
        else sc = 0.4 + 0.6 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.25;
      }
      this.drawX(x, i, v === AUTO, 1, sc);
    }

    // dica: X fantasmas e Bloop fantasma
    if (h) {
      for (const c of h.elim) this.drawX(x, c, false, 0.55 + 0.45 * pulse, 1.1, '#ffb800');
      if (h.cell >= 0 && !h.elim.includes(h.cell) && h.place < 0) {
        x.strokeStyle = '#ffb800';
        x.lineWidth = Math.max(2, this.cs * 0.06);
        const [cx, cy] = this.cellXY(h.cell);
        x.beginPath();
        x.arc(cx, cy, this.cs * 0.36, 0, TAU);
        x.stroke();
      }
      if (h.place >= 0) {
        const [cx, cy] = this.cellXY(h.place);
        x.strokeStyle = '#ffb800';
        x.lineWidth = Math.max(2.5, this.cs * 0.07);
        x.beginPath();
        x.arc(cx, cy, this.cs * (0.4 + 0.04 * pulse), 0, TAU);
        x.stroke();
        this.drawBloopAt(x, h.place, 'happy', 1, 1, -Math.abs(Math.sin(time * 4)) * this.cs * 0.08, 0.55);
      }
    }

    // Bloops
    for (let i = 0; i < nn; i++) {
      const wt = this.wrongT.get(i);
      if (wt !== undefined) {
        const k = time - wt;
        if (k > 0.9) {
          this.wrongT.delete(i);
          continue;
        }
        // Bloop tonto: treme e some
        const shake = Math.sin(k * 60) * this.cs * 0.06 * Math.max(0, 1 - k / 0.6);
        const s = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.3);
        x.save();
        x.translate(shake, 0);
        x.fillStyle = `rgba(255,60,90,${0.35 * s})`;
        this.cellPath(x, [i], this.cs * 0.06);
        x.fill();
        this.drawBloopAt(x, i, 'dead', s, s, 0, Math.max(0, s));
        x.restore();
        continue;
      }
      if (this.cells[i] !== BLOOP) continue;
      let sx = 1;
      let sy = 1;
      let dy = 0;
      let mood: PlayerPose['mood'] = 'idle';
      let blink = 0;
      let wave = 0;
      const pt = this.popT.get(i);
      if (pt !== undefined) {
        const k = time - pt;
        if (k > 0.7) this.popT.delete(i);
        else {
          // mola amortecida: entra esticado, amassa e assenta
          const s = 1 - Math.exp(-9 * k) * Math.cos(16 * k);
          const sq = 0.32 * Math.exp(-6 * k) * Math.sin(20 * k + 0.6);
          sx = s * (1 - sq);
          sy = s * (1 + sq);
          dy = -Math.max(0, Math.sin(Math.min(1, k / 0.32) * Math.PI)) * this.cs * 0.22;
          mood = 'happy';
        }
      }
      if (this.winT >= 0) {
        const k = time - this.winT;
        const ph = k * 5 - (i % n) * 0.45 - Math.floor(i / n) * 0.2;
        dy = -Math.max(0, Math.sin(ph)) * this.cs * 0.28;
        const land = Math.max(0, -Math.sin(ph));
        sx *= 1 + land * 0.12;
        sy *= 1 - land * 0.12;
        mood = 'happy';
        wave = k + i;
      } else if (this.fancy && pt === undefined) {
        const b = Math.sin(time * 2.6 + i * 1.7) * 0.03;
        sx = 1 + b;
        sy = 1 - b;
        let bt = this.blinkAt.get(i);
        if (bt === undefined || bt < time - 0.2) {
          if (bt === undefined || time - bt > 0.2) {
            bt = time + 1.5 + Math.random() * 4;
            this.blinkAt.set(i, bt);
          }
        }
        if (time > bt && time - bt < 0.13) blink = 1;
      }
      this.drawBloopAt(x, i, mood, sx, sy, dy, 1, blink, wave);
    }

    // partículas
    if (this.parts.length) {
      const dt = this.lastDt;
      this.parts = this.parts.filter((p) => (p.life += dt) < p.max);
      for (const p of this.parts) {
        p.vy += this.cs * 6 * dt;
        p.vx *= 0.96;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = 1 - p.life / p.max;
        x.globalAlpha = a;
        x.fillStyle = p.c;
        x.strokeStyle = INK;
        x.lineWidth = 1;
        if (p.star) {
          const r = p.r * 1.4;
          x.beginPath();
          for (let j = 0; j < 8; j++) {
            const rr = j % 2 ? r * 0.45 : r;
            const ang = (j / 8) * TAU + p.life * 6;
            x.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
          }
          x.closePath();
          x.fill();
        } else {
          x.beginPath();
          x.arc(p.x, p.y, p.r * a, 0, TAU);
          x.fill();
        }
      }
      x.globalAlpha = 1;
    }
  }

  unitCells(u: number): number[] {
    const n = this.n;
    const out: number[] = [];
    for (let c = 0; c < n * n; c++) {
      if (u < n ? Math.floor(c / n) === u : u < 2 * n ? c % n === u - n : this.reg[c] === u - 2 * n) out.push(c);
    }
    return out;
  }
}
