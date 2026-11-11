/* ============================================================
 *  CONSERTOS — fios e mangueiras flexíveis (corda de Verlet com folga) e o quebra-cabeça
 *  "leve a ponta até a tomada da mesma cor" usado na pane elétrica e no freio.
 *  Cor + símbolo (para quem não distingue cores). Errou: faísca e a ponta volta.
 *  Arrays fixos, nada alocado por quadro.
 * ============================================================ */
import { tap as haptic } from '../../../../core/haptics';
import { rs } from '../sound';
import { clamp, easeOut, glow, rrect, TAU, type C2 } from './art';
import { P, type Fx } from './overlay';

export const WIRE_COL = ['#e53b2f', '#2f7de0', '#f4c31d', '#2fb34a', '#ff8a1f', '#a55be6'];
export const WIRE_DARK = ['#8a1a12', '#163f78', '#9a7408', '#16692a', '#a24e08', '#5a2a8a'];
const SEG = 16;

export class Rope {
  readonly x = new Float32Array(SEG);
  readonly y = new Float32Array(SEG);
  private px = new Float32Array(SEG);
  private py = new Float32Array(SEG);
  /** comprimento total (muda: o cabo sai/entra do conduíte) */
  L: number;
  /** alcance máximo */
  maxL: number;
  ax = 0;
  ay = 0;
  ex = 0;
  ey = 0;
  constructor(ax: number, ay: number, ex: number, ey: number, L: number) {
    this.maxL = L;
    this.L = L;
    this.reset(ax, ay, ex, ey);
  }
  reset(ax: number, ay: number, ex: number, ey: number): void {
    this.ax = ax;
    this.ay = ay;
    this.ex = ex;
    this.ey = ey;
    for (let i = 0; i < SEG; i++) {
      const k = i / (SEG - 1);
      this.x[i] = this.px[i] = ax + (ex - ax) * k;
      this.y[i] = this.py[i] = ay + (ey - ay) * k + Math.sin(k * Math.PI) * 30;
    }
  }
  step(dt: number): void {
    // folga constante (~18%): sobra de cabo recolhe para dentro do conduíte
    const want = Math.min(this.maxL, Math.hypot(this.ex - this.ax, this.ey - this.ay) * 1.18 + 24);
    this.L += (want - this.L) * Math.min(1, dt * 8);
    const x = this.x;
    const y = this.y;
    const g = 900 * dt * dt;
    for (let i = 1; i < SEG - 1; i++) {
      const vx = (x[i] - this.px[i]) * 0.97;
      const vy = (y[i] - this.py[i]) * 0.97;
      this.px[i] = x[i];
      this.py[i] = y[i];
      x[i] += vx;
      y[i] += vy + g;
    }
    x[0] = this.ax;
    y[0] = this.ay;
    x[SEG - 1] = this.ex;
    y[SEG - 1] = this.ey;
    const seg = this.L / (SEG - 1);
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < SEG - 1; i++) {
        const dx = x[i + 1] - x[i];
        const dy = y[i + 1] - y[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
        if (d <= seg) continue;
        const k = (d - seg) / d;
        const a = i === 0 ? 0 : 0.5;
        const b = i + 1 === SEG - 1 ? 0 : 0.5;
        const s = a + b || 1;
        x[i] += dx * k * (a / s);
        y[i] += dy * k * (a / s);
        x[i + 1] -= dx * k * (b / s);
        y[i + 1] -= dy * k * (b / s);
      }
    }
  }
  /** caminho suave pelos pontos */
  path(c: C2): void {
    const x = this.x;
    const y = this.y;
    c.beginPath();
    c.moveTo(x[0], y[0]);
    for (let i = 1; i < SEG - 1; i++) c.quadraticCurveTo(x[i], y[i], (x[i] + x[i + 1]) / 2, (y[i] + y[i + 1]) / 2);
    c.lineTo(x[SEG - 1], y[SEG - 1]);
  }
  /** ângulo da ponta (direção do último segmento) */
  tipAngle(): number {
    return Math.atan2(this.y[SEG - 1] - this.y[SEG - 3], this.x[SEG - 1] - this.x[SEG - 3]);
  }
}

/** desenha um símbolo (0 círculo, 1 triângulo, 2 quadrado, 3 estrela, 4 losango, 5 cruz) */
export function sym(c: C2, k: number, x: number, y: number, r: number, col: string): void {
  c.fillStyle = col;
  c.beginPath();
  if (k === 0) c.arc(x, y, r, 0, TAU);
  else if (k === 1) {
    c.moveTo(x, y - r * 1.1);
    c.lineTo(x + r, y + r * 0.75);
    c.lineTo(x - r, y + r * 0.75);
  } else if (k === 2) c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (k === 3)
    for (let j = 0; j < 10; j++) {
      const rr = j % 2 ? r * 0.45 : r * 1.1;
      const a = -Math.PI / 2 + (j * TAU) / 10;
      if (j === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  else if (k === 4) {
    c.moveTo(x, y - r * 1.15);
    c.lineTo(x + r * 0.9, y);
    c.lineTo(x, y + r * 1.15);
    c.lineTo(x - r * 0.9, y);
  } else {
    const w = r * 0.42;
    c.rect(x - w, y - r, w * 2, r * 2);
    c.rect(x - r, y - w, r * 2, w * 2);
  }
  c.closePath();
  c.fill();
}

interface Wire {
  col: number;
  rope: Rope;
  /** ponta em repouso */
  rx: number;
  ry: number;
  /** tomada certa (índice) e onde está ligada (-1) */
  target: number;
  on: number;
  /** animação de volta para o repouso */
  back: number;
  bx: number;
  by: number;
  /** pulso de "ligou" */
  pop: number;
}
export interface Socket {
  x: number;
  y: number;
  col: number;
  wire: number;
  led: number;
  shake: number;
}

export class RopePuzzle {
  readonly wires: Wire[] = [];
  readonly sockets: Socket[] = [];
  private drag = -1;
  private ox = 0;
  private oy = 0;
  done = 0;
  constructor(
    readonly style: 'wire' | 'hose',
    private fx: Fx,
  ) {}
  /** monta: âncoras (onde o fio sai), pontas em repouso, tomadas; perm = qual cor cada tomada pede */
  build(anchors: [number, number][], rest: [number, number][], socks: [number, number][], perm: number[]): void {
    this.wires.length = 0;
    this.sockets.length = 0;
    socks.forEach(([x, y], i) => this.sockets.push({ x, y, col: perm[i], wire: -1, led: 0, shake: 0 }));
    anchors.forEach(([ax, ay], i) => {
      const [rx, ry] = rest[i];
      const si = perm.indexOf(i);
      let L = Math.hypot(rx - ax, ry - ay) + 30;
      for (const [sx, sy] of socks) L = Math.max(L, Math.hypot(sx - ax, sy - ay) * 1.08 + 20);
      this.wires.push({ col: i, rope: new Rope(ax, ay, rx, ry, L), rx, ry, target: si, on: -1, back: 0, bx: rx, by: ry, pop: 0 });
    });
    this.done = 0;
  }
  get allDone(): boolean {
    return this.done >= this.wires.length;
  }
  /** fio que a dica deve mostrar */
  nextHint(): Wire | null {
    for (const w of this.wires) if (w.on < 0) return w;
    return null;
  }
  down(x: number, y: number): boolean {
    let best = -1;
    let bd = 46;
    this.wires.forEach((w, i) => {
      if (w.on >= 0) return;
      const d = Math.hypot(x - w.rope.ex, y - w.rope.ey);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) return false;
    this.drag = best;
    const w = this.wires[best];
    this.ox = w.rope.ex - x;
    this.oy = w.rope.ey - y;
    w.back = 0;
    rs.tick();
    haptic('light');
    return true;
  }
  move(x: number, y: number): void {
    if (this.drag < 0) return;
    const r = this.wires[this.drag].rope;
    let ex = x + this.ox;
    let ey = y + this.oy;
    const dx = ex - r.ax;
    const dy = ey - r.ay;
    const d = Math.hypot(dx, dy);
    if (d > r.maxL * 0.95) {
      ex = r.ax + (dx / d) * r.maxL * 0.95;
      ey = r.ay + (dy / d) * r.maxL * 0.95;
    }
    r.ex = ex;
    r.ey = ey;
  }
  up(): void {
    if (this.drag < 0) return;
    const wi = this.drag;
    const w = this.wires[wi];
    this.drag = -1;
    const r = w.rope;
    // tomada mais perto
    let best = -1;
    let bd = 44;
    this.sockets.forEach((s, i) => {
      if (s.wire >= 0) return;
      const d = Math.hypot(r.ex - s.x, r.ey - s.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && best === w.target) {
      const s = this.sockets[best];
      s.wire = wi;
      w.on = best;
      r.ex = s.x;
      r.ey = s.y;
      w.pop = 1;
      this.done++;
      rs.snap();
      haptic('medium');
      this.fx.burst(P.good, s.x, s.y, 10, 160, 0.6, 6);
    } else {
      if (best >= 0) {
        const s = this.sockets[best];
        s.shake = 1;
        if (this.style === 'wire') {
          this.fx.sparks(s.x, s.y, 26);
          rs.zap();
        } else {
          this.fx.burst(P.drop, s.x, s.y, 8, 160, 0.8, 3, 120);
          rs.nope();
        }
        haptic('heavy');
      } else rs.slide();
      w.back = 1;
      w.bx = r.ex;
      w.by = r.ey;
    }
  }
  update(dt: number): void {
    for (const w of this.wires) {
      if (w.back > 0) {
        w.back = Math.max(0, w.back - dt / 0.4);
        const k = easeOut(1 - w.back);
        w.rope.ex = w.bx + (w.rx - w.bx) * k;
        w.rope.ey = w.by + (w.ry - w.by) * k;
      }
      w.pop = Math.max(0, w.pop - dt * 2);
      w.rope.step(dt);
    }
    for (const s of this.sockets) {
      s.led += ((s.wire >= 0 ? 1 : 0) - s.led) * Math.min(1, dt * 6);
      s.shake = Math.max(0, s.shake - dt * 3);
    }
  }

  /* ------------------------------ desenho ------------------------------ */
  drawSockets(c: C2, t: number, hintCol: number): void {
    const hose = this.style === 'hose';
    for (const s of this.sockets) {
      const x = s.x + Math.sin(t * 70) * s.shake * 4;
      const y = s.y;
      const col = WIRE_COL[s.col];
      if (s.wire < 0 && s.col === hintCol) glow(c, x, y, 34 + 4 * Math.sin(t * 6), 0.5, true);
      // base
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.beginPath();
      c.arc(x + 2, y + 3, hose ? 17 : 16, 0, TAU);
      c.fill();
      c.fillStyle = hose ? '#c9a24a' : '#2b2e33';
      c.beginPath();
      c.arc(x, y, hose ? 16 : 15, 0, TAU);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = col;
      c.beginPath();
      c.arc(x, y, hose ? 18 : 17, 0, TAU);
      c.stroke();
      c.fillStyle = hose ? '#5a4a1e' : '#0e0f11';
      c.beginPath();
      c.arc(x, y, 8, 0, TAU);
      c.fill();
      if (hose) {
        c.strokeStyle = 'rgba(255,240,190,.7)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, 12, 3.6, 5.2);
        c.stroke();
      }
      // símbolo ao lado + LED
      const sx = x + (hose ? -30 : 30);
      sym(c, s.col, sx, y, 7, col);
      c.strokeStyle = 'rgba(0,0,0,.6)';
      c.lineWidth = 1;
      c.stroke();
      const lx = x + (hose ? -30 : 30);
      const ly = y - 19;
      c.fillStyle = s.led > 0.5 ? '#6dff7a' : '#3a1a14';
      c.beginPath();
      c.arc(lx, ly, 4, 0, TAU);
      c.fill();
      if (s.led > 0.05) glow(c, lx, ly, 16, s.led * 0.8, true);
    }
  }
  drawWires(c: C2): void {
    const hose = this.style === 'hose';
    const wW = hose ? 10 : 6;
    // fios ligados primeiro, o arrastado por último
    for (let pass = 0; pass < 2; pass++)
      this.wires.forEach((w, i) => {
        if ((i === this.drag ? 1 : 0) !== pass) return;
        const r = w.rope;
        const col = hose ? '#26272b' : WIRE_COL[w.col];
        c.lineCap = 'round';
        c.lineJoin = 'round';
        // sombra
        c.save();
        c.translate(3, 6);
        r.path(c);
        c.strokeStyle = 'rgba(0,0,0,.3)';
        c.lineWidth = wW + 2;
        c.stroke();
        c.restore();
        r.path(c);
        c.strokeStyle = hose ? '#0d0d0f' : WIRE_DARK[w.col];
        c.lineWidth = wW + 3;
        c.stroke();
        c.strokeStyle = col;
        c.lineWidth = wW;
        c.stroke();
        c.save();
        c.translate(-wW * 0.22, -wW * 0.25);
        r.path(c);
        c.strokeStyle = hose ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.45)';
        c.lineWidth = wW * 0.28;
        c.stroke();
        c.restore();
        this.drawTip(c, w, i === this.drag);
      });
  }
  private drawTip(c: C2, w: Wire, held: boolean): void {
    const r = w.rope;
    const a = w.on >= 0 ? 0 : r.tipAngle();
    const hose = this.style === 'hose';
    const col = WIRE_COL[w.col];
    const k = 1 + w.pop * 0.3 + (held ? 0.12 : 0);
    c.save();
    c.translate(r.ex, r.ey);
    c.scale(k, k);
    if (w.on < 0) c.rotate(a);
    else c.rotate(this.style === 'hose' ? 0 : Math.PI);
    if (held) {
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.beginPath();
      c.ellipse(4, 10, 22, 8, 0, 0, TAU);
      c.fill();
    }
    if (hose) {
      // anel colorido + conexão de latão
      c.fillStyle = col;
      c.beginPath();
      rrect(c, -26, -8, 9, 16, 3);
      c.fill();
      c.fillStyle = '#b08a32';
      c.beginPath();
      rrect(c, -16, -9, 14, 18, 3);
      c.fill();
      c.fillStyle = '#e8c870';
      c.fillRect(-14, -7, 10, 4);
      c.fillStyle = '#8a6a22';
      c.beginPath();
      rrect(c, -3, -6, 9, 12, 2);
      c.fill();
    } else {
      // capa plástica + pino de cobre
      c.fillStyle = WIRE_DARK[w.col];
      c.beginPath();
      rrect(c, -22, -9, 20, 18, 5);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      rrect(c, -21, -8, 18, 14, 4);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.4)';
      c.fillRect(-19, -6, 14, 3);
      c.fillStyle = '#e7a35a';
      c.beginPath();
      rrect(c, -3, -3.5, 12, 7, 2);
      c.fill();
      c.fillStyle = '#ffd9a8';
      c.fillRect(-2, -2.5, 10, 2);
    }
    c.restore();
    // etiqueta com símbolo (não gira)
    if (w.on < 0) {
      const tx = r.ex - Math.cos(a) * 34 * k;
      const ty = r.ey - Math.sin(a) * 34 * k;
      c.fillStyle = '#f4f1e8';
      c.beginPath();
      c.arc(tx, ty, 10, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.5)';
      c.lineWidth = 1;
      c.stroke();
      sym(c, w.col, tx, ty, 6, col);
    }
  }
}
/** embaralha (determinístico o bastante para o jogo) */
export function shuffle(n: number, keep: boolean): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(i);
  if (keep) return a;
  for (let k = 0; k < 8; k++)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  // nunca deixa tudo na mesma ordem
  if (a.every((v, i) => v === i) && n > 1) {
    const t = a[0];
    a[0] = a[1];
    a[1] = t;
  }
  return a;
}
export { clamp };
