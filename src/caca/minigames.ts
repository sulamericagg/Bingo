/**
 * CAÇA BLOOP — minigames de batalha (Canvas 2D, coordenadas em px CSS).
 * Todos recebem `diff` 0..1 (raridade/estatísticas do bichinho) e terminam com `score` 0..1.
 *   aneis   — toque no tempo certo quando o anel encolhe até o alvo
 *   ritmo   — notas caem em 3 trilhas; toque na linha
 *   runa    — desenhe a runa ligando os pontos (nos difíceis ela some: memorize)
 *   esquiva — arraste seu Bloop e desvie dos ataques
 *   memoria — repita a sequência de luzes
 * `auto` (só ?debug) joga sozinho e perfeito — usado pelos testes automatizados.
 */
import { t } from '../i18n';
import { gameFont } from '../i18n/font';
import { Rng, type Seed64 } from './rng';
import type { Element } from './genome';
import { EL_COLOR } from './draw';

type C = CanvasRenderingContext2D;
export type GameKind = 'aneis' | 'ritmo' | 'runa' | 'esquiva' | 'memoria';
export const GAME_KINDS: GameKind[] = ['aneis', 'ritmo', 'runa', 'esquiva', 'memoria'];

export const EL_GAMES: Record<Element, [GameKind, GameKind]> = {
  fogo: ['aneis', 'esquiva'], agua: ['esquiva', 'ritmo'], planta: ['runa', 'memoria'], eletrico: ['aneis', 'ritmo'], gelo: ['runa', 'aneis'],
  terra: ['esquiva', 'memoria'], ar: ['ritmo', 'esquiva'], luz: ['aneis', 'memoria'], sombra: ['memoria', 'runa'], som: ['ritmo', 'memoria'],
};

export function gameName(k: GameKind): string {
  switch (k) {
    case 'aneis': return t('caca.mg.aneis', 'Anéis no Tempo');
    case 'ritmo': return t('caca.mg.ritmo', 'Batida Bloop');
    case 'runa': return t('caca.mg.runa', 'Runa Mágica');
    case 'esquiva': return t('caca.mg.esquiva', 'Esquiva!');
    case 'memoria': return t('caca.mg.memoria', 'Luzes da Memória');
  }
}
export function gameHelp(k: GameKind): string {
  switch (k) {
    case 'aneis': return t('caca.mg.aneisHelp', 'Toque no alvo quando o anel encostar nele.');
    case 'ritmo': return t('caca.mg.ritmoHelp', 'Toque na trilha quando a nota chegar na linha.');
    case 'runa': return t('caca.mg.runaHelp', 'Ligue os pontos na ordem, num traço só.');
    case 'esquiva': return t('caca.mg.esquivaHelp', 'Arraste seu Bloop para desviar dos ataques.');
    case 'memoria': return t('caca.mg.memoriaHelp', 'Olhe a sequência de luzes e repita.');
  }
}

export interface MgOpts {
  w: number;
  h: number;
  diff: number;
  hint: boolean;
  seed: Seed64;
  el: Element;
  auto: boolean;
  /** efeitos sonoros/vibração do jogo */
  fx: (kind: 'hit' | 'perfect' | 'miss' | 'tick') => void;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  col: string;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  col: string;
}

export abstract class Minigame {
  done = false;
  score = 0;
  time = 0;
  protected r: Rng;
  protected pops: Pop[] = [];
  protected sparks: Spark[] = [];
  protected col: string;
  constructor(protected o: MgOpts) {
    this.r = new Rng(o.seed, 77);
    this.col = EL_COLOR[o.el];
  }
  abstract step(dt: number): void;
  abstract paint(c: C): void;
  /** 0..1 para a barra do round */
  abstract progress(): number;
  down(_x: number, _y: number): void {}
  move(_x: number, _y: number): void {}
  up(_x: number, _y: number): void {}
  update(dt: number): void {
    if (this.done) return;
    this.time += dt;
    this.step(dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.9);
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 300 * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < 0.6);
  }
  draw(c: C): void {
    this.paint(c);
    for (const s of this.sparks) {
      c.globalAlpha = 1 - s.t / 0.6;
      c.fillStyle = s.col;
      c.beginPath();
      c.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of this.pops) {
      const k = p.t / 0.9;
      c.globalAlpha = 1 - k * k;
      c.font = gameFont(700, 20 + (1 - k) * 6);
      c.lineWidth = 5;
      c.strokeStyle = '#2a0b5c';
      c.strokeText(p.text, p.x, p.y - k * 30);
      c.fillStyle = p.col;
      c.fillText(p.text, p.x, p.y - k * 30);
    }
    c.globalAlpha = 1;
  }
  protected judge(x: number, y: number, q: number): void {
    const [text, col] = q >= 0.95 ? [t('caca.mg.perfect', 'Perfeito!'), '#ffe14f'] : q >= 0.65 ? [t('caca.mg.good', 'Bom!'), '#7dff9a'] : q > 0 ? [t('caca.mg.ok', 'Quase'), '#9fd6ff'] : [t('caca.mg.miss', 'Errou'), '#ff8aa8'];
    this.pops.push({ x, y, text, col, t: 0 });
    if (q > 0) for (let i = 0; i < (q >= 0.95 ? 14 : 7); i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random();
      const v = 120 + Math.random() * 160;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, t: 0, col: i % 2 ? col : this.col });
    }
    this.o.fx(q >= 0.95 ? 'perfect' : q > 0 ? 'hit' : 'miss');
  }
  protected finish(score: number): void {
    this.score = Math.max(0, Math.min(1, score));
    this.done = true;
  }
}

const ink = '#2a0b5c';

/* ============================== anéis ============================== */
class Aneis extends Minigame {
  private n: number;
  private T: number;
  private tr: number;
  private tol: number;
  private i = 0;
  private cur: { x: number; y: number; t: number; vx: number; vy: number } | null = null;
  private wait = 0.5;
  private sum = 0;
  constructor(o: MgOpts) {
    super(o);
    const d = o.diff;
    this.n = Math.round(4 + d * 4);
    this.T = 1.55 - d * 0.8;
    this.tr = 30 - d * 7;
    this.tol = 15 - d * 8;
  }
  private R(): number {
    if (!this.cur) return 0;
    const k = this.cur.t / this.T;
    return this.tr * (3.2 - 2.8 * k);
  }
  step(dt: number): void {
    const { w, h } = this.o;
    if (!this.cur) {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (this.i >= this.n) return this.finish(this.sum / this.n);
        const drift = this.o.diff > 0.6 ? 40 + this.o.diff * 50 : 0;
        const a = this.r.range(0, Math.PI * 2);
        this.cur = { x: this.r.range(w * 0.22, w * 0.78), y: this.r.range(h * 0.25, h * 0.75), t: 0, vx: Math.cos(a) * drift, vy: Math.sin(a) * drift };
      }
      return;
    }
    const c = this.cur;
    c.t += dt;
    c.x = Math.max(50, Math.min(w - 50, c.x + c.vx * dt));
    c.y = Math.max(60, Math.min(h - 60, c.y + c.vy * dt));
    if (this.o.auto && Math.abs(this.R() - this.tr) < this.tol * 0.3) this.down(c.x, c.y);
    else if (c.t >= this.T) this.resolve(0);
  }
  private resolve(q: number): void {
    if (!this.cur) return;
    this.judge(this.cur.x, this.cur.y, q);
    this.sum += q;
    this.i++;
    this.cur = null;
    this.wait = 0.28;
  }
  down(x: number, y: number): void {
    const c = this.cur;
    if (!c || Math.hypot(x - c.x, y - c.y) > this.tr * 3.3 + 20) return;
    const d = Math.abs(this.R() - this.tr);
    this.resolve(d < this.tol * 0.4 ? 1 : d < this.tol ? 0.7 : d < this.tol * 2 ? 0.35 : 0);
  }
  progress(): number {
    return this.i / this.n;
  }
  paint(c: C): void {
    const cur = this.cur;
    if (!cur) return;
    const R = this.R();
    const inWin = Math.abs(R - this.tr) < this.tol;
    c.lineWidth = 6;
    c.strokeStyle = ink;
    c.fillStyle = this.o.hint && inWin ? '#fff6a0' : 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.arc(cur.x, cur.y, this.tr, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = this.col;
    c.beginPath();
    c.arc(cur.x, cur.y, this.tr * 0.45, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = ink;
    c.beginPath();
    c.arc(cur.x, cur.y, Math.max(2, R), 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 4;
    c.strokeStyle = inWin ? '#ffe14f' : this.col;
    c.stroke();
  }
}

/* ============================== ritmo ============================== */
class Ritmo extends Minigame {
  private notes: { lane: number; at: number; hit: boolean }[] = [];
  private v: number;
  private lineY: number;
  private sum = 0;
  private pressed = [0, 0, 0];
  constructor(o: MgOpts) {
    super(o);
    const d = o.diff;
    const n = Math.round(10 + d * 14);
    const gap = 0.72 - d * 0.38;
    let at = 1.3;
    let last = 1;
    for (let i = 0; i < n; i++) {
      let lane = this.r.int(3);
      if (lane === last && this.r.chance(0.5)) lane = (lane + 1 + this.r.int(2)) % 3;
      last = lane;
      this.notes.push({ lane, at, hit: false });
      if (d > 0.55 && this.r.chance(d * 0.35)) this.notes.push({ lane: (lane + 1 + this.r.int(2)) % 3, at, hit: false });
      at += gap * (this.r.chance(0.25) ? 0.5 : 1);
    }
    this.v = o.h * (0.42 + d * 0.45);
    this.lineY = o.h * 0.8;
  }
  private yOf(n: { at: number }): number {
    return this.lineY - (n.at - this.time) * this.v;
  }
  private win(): [number, number] {
    return [this.v * 0.055, this.v * (0.14 - this.o.diff * 0.045)];
  }
  step(dt: number): void {
    for (let i = 0; i < 3; i++) this.pressed[i] = Math.max(0, this.pressed[i] - dt);
    const [, good] = this.win();
    for (const n of this.notes) {
      if (n.hit) continue;
      const y = this.yOf(n);
      if (this.o.auto && Math.abs(y - this.lineY) < 4) this.tapLane(n.lane);
      else if (y - this.lineY > good * 1.6) {
        n.hit = true;
        this.judge(this.laneX(n.lane), this.lineY - 40, 0);
      }
    }
    if (this.notes.every((n) => n.hit)) this.finish(this.sum / this.notes.length);
  }
  private laneX(l: number): number {
    return this.o.w * (0.2 + l * 0.3);
  }
  private tapLane(l: number): void {
    this.pressed[l] = 0.12;
    const [perf, good] = this.win();
    let best: (typeof this.notes)[0] | null = null;
    let bd = 1e9;
    for (const n of this.notes) {
      if (n.hit || n.lane !== l) continue;
      const d = Math.abs(this.yOf(n) - this.lineY);
      if (d < bd) (bd = d), (best = n);
    }
    if (!best || bd > good * 2) return;
    best.hit = true;
    const q = bd < perf ? 1 : bd < good ? 0.7 : 0.3;
    this.sum += q;
    this.judge(this.laneX(l), this.lineY - 40, q);
  }
  down(x: number): void {
    this.tapLane(Math.max(0, Math.min(2, Math.floor(x / (this.o.w / 3)))));
  }
  progress(): number {
    return this.notes.filter((n) => n.hit).length / this.notes.length;
  }
  paint(c: C): void {
    const { w, h } = this.o;
    for (let l = 0; l < 3; l++) {
      const x = this.laneX(l);
      const near = this.o.hint && this.notes.some((n) => !n.hit && n.lane === l && Math.abs(this.yOf(n) - this.lineY) < this.win()[1]);
      c.fillStyle = near ? 'rgba(255,240,140,0.28)' : 'rgba(255,255,255,0.1)';
      c.beginPath();
      c.roundRect(x - w * 0.12, h * 0.08, w * 0.24, h * 0.84, 18);
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = ink;
      c.fillStyle = this.pressed[l] > 0 ? '#ffe14f' : 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.arc(x, this.lineY, 30, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    for (const n of this.notes) {
      if (n.hit) continue;
      const y = this.yOf(n);
      if (y < -30 || y > h + 30) continue;
      const x = this.laneX(n.lane);
      c.lineWidth = 4;
      c.strokeStyle = ink;
      c.fillStyle = this.col;
      c.beginPath();
      c.arc(x, y, 22, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.beginPath();
      c.arc(x - 7, y - 7, 6, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/* ============================== runa ============================== */
class Runa extends Minigame {
  private pts: [number, number][] = [];
  private dense: [number, number][] = [];
  private drawn: [number, number][] = [];
  private drawing = false;
  private limit: number;
  private showFor: number;
  private tol: number;
  private len = 0;
  constructor(o: MgOpts) {
    super(o);
    const d = o.diff;
    const k = 4 + Math.round(d * 3);
    const { w, h } = o;
    for (let i = 0; i < k; i++) {
      let p: [number, number] = [0, 0];
      for (let tries = 0; tries < 30; tries++) {
        p = [this.r.range(w * 0.15, w * 0.85), this.r.range(h * 0.2, h * 0.8)];
        const prev = this.pts[this.pts.length - 1];
        if (!prev || (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > Math.min(w, h) * 0.22 && this.pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 50))) break;
      }
      this.pts.push(p);
    }
    for (let i = 0; i < k - 1; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.len += L;
      const m = Math.ceil(L / 6);
      for (let j = 0; j < m; j++) this.dense.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m]);
    }
    this.dense.push(this.pts[k - 1]);
    this.limit = 6.5 - d * 2.8;
    this.showFor = d > 0.55 && !o.hint ? 1.8 - (d - 0.55) * 1.2 : 1e9;
    this.tol = 24 - d * 9;
  }
  step(): void {
    if (this.o.auto) {
      const k = Math.min(1, this.time / 1.2);
      const n = Math.floor(k * (this.dense.length - 1));
      this.drawn = this.dense.slice(0, n + 1);
      if (k >= 1) this.evaluate();
      return;
    }
    if (this.time > this.limit) this.evaluate();
  }
  private evaluate(): void {
    if (this.done) return;
    if (this.drawn.length < 3) {
      this.judge(this.o.w / 2, this.o.h / 2, 0);
      return this.finish(0);
    }
    const near = (p: [number, number], set: [number, number][], tol: number) => set.some((q) => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol && Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
    const cov = this.dense.filter((p) => near(p, this.drawn, this.tol)).length / this.dense.length;
    const prec = this.drawn.filter((p) => near(p, this.dense, this.tol * 1.3)).length / this.drawn.length;
    const s0 = this.drawn[0];
    const startOk = Math.hypot(s0[0] - this.pts[0][0], s0[1] - this.pts[0][1]) < this.tol * 2;
    let q = (cov * 0.7 + prec * 0.3) * (startOk ? 1 : 0.8);
    q = Math.max(0, Math.min(1, (q - 0.25) / 0.7));
    this.judge(this.o.w / 2, this.o.h * 0.15, q);
    this.finish(q);
  }
  down(x: number, y: number): void {
    if (this.o.auto) return;
    this.drawing = true;
    this.drawn = [[x, y]];
  }
  move(x: number, y: number): void {
    if (!this.drawing) return;
    const l = this.drawn[this.drawn.length - 1];
    if (Math.hypot(x - l[0], y - l[1]) > 4) this.drawn.push([x, y]);
  }
  up(): void {
    if (!this.drawing) return;
    this.drawing = false;
    let L = 0;
    for (let i = 1; i < this.drawn.length; i++) L += Math.hypot(this.drawn[i][0] - this.drawn[i - 1][0], this.drawn[i][1] - this.drawn[i - 1][1]);
    if (L > this.len * 0.45) this.evaluate();
    else this.drawn = [];
  }
  progress(): number {
    return Math.min(1, this.time / this.limit);
  }
  paint(c: C): void {
    const vis = this.time < this.showFor ? 1 : Math.max(0, 1 - (this.time - this.showFor) / 0.35);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (vis > 0) {
      c.globalAlpha = vis;
      c.lineWidth = this.tol * 1.4;
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      this.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.stroke();
      c.lineWidth = 3;
      c.setLineDash([8, 9]);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
    this.pts.forEach((p, i) => {
      const a = i === 0 ? 1 : vis;
      if (a <= 0) return;
      c.globalAlpha = a;
      c.lineWidth = 4;
      c.strokeStyle = ink;
      c.fillStyle = i === 0 ? '#ffe14f' : '#fff';
      c.beginPath();
      c.arc(p[0], p[1], 15, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = ink;
      c.font = gameFont(700, 15);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), p[0], p[1] + 1);
    });
    c.globalAlpha = 1;
    if (this.drawn.length > 1) {
      c.lineWidth = 10;
      c.strokeStyle = ink;
      c.beginPath();
      this.drawn.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.stroke();
      c.lineWidth = 6;
      c.strokeStyle = this.col;
      c.stroke();
    }
  }
}

/* ============================== esquiva ============================== */
class Esquiva extends Minigame {
  private px: number;
  private py: number;
  private shots: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  private dur: number;
  private every: number;
  private sp: number;
  private next = 0.6;
  private hits = 0;
  private inv = 0;
  private drag: [number, number] | null = null;
  constructor(o: MgOpts) {
    super(o);
    const d = o.diff;
    this.px = o.w / 2;
    this.py = o.h * 0.75;
    this.dur = 7 + d * 3;
    this.every = 0.85 - d * 0.5;
    this.sp = 170 + d * 230;
  }
  step(dt: number): void {
    const { w, h } = this.o;
    this.inv = Math.max(0, this.inv - dt);
    this.next -= dt;
    if (this.next <= 0) {
      this.next = this.every * this.r.range(0.7, 1.3);
      const sx = this.r.range(w * 0.2, w * 0.8);
      const sy = h * 0.06;
      const pattern = this.r.int(this.o.diff > 0.5 ? 3 : 2);
      const aim = Math.atan2(this.py - sy, this.px - sx);
      const angs = pattern === 0 ? [aim] : pattern === 1 ? [Math.PI / 2 + this.r.range(-0.5, 0.5)] : [aim - 0.35, aim, aim + 0.35];
      for (const a of angs) this.shots.push({ x: sx, y: sy, vx: Math.cos(a) * this.sp, vy: Math.sin(a) * this.sp, r: 11 + this.r.range(0, 6) });
    }
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!this.o.auto && this.inv <= 0 && Math.hypot(s.x - this.px, s.y - this.py) < s.r + 16) {
        this.hits++;
        this.inv = 0.8;
        s.y = 1e5;
        this.judge(this.px, this.py - 30, 0);
      }
    }
    this.shots = this.shots.filter((s) => s.y < h + 40 && s.x > -40 && s.x < w + 40);
    if (this.hits >= 4) return this.finish(0);
    if (this.time >= this.dur) {
      const q = 1 - this.hits / 4;
      this.judge(this.o.w / 2, this.o.h * 0.4, q);
      this.finish(q);
    }
  }
  down(x: number, y: number): void {
    this.drag = [x - this.px, y - this.py];
  }
  move(x: number, y: number): void {
    if (!this.drag) return;
    const { w, h } = this.o;
    this.px = Math.max(20, Math.min(w - 20, x - this.drag[0]));
    this.py = Math.max(h * 0.3, Math.min(h - 20, y - this.drag[1]));
  }
  up(): void {
    this.drag = null;
  }
  progress(): number {
    return Math.min(1, this.time / this.dur);
  }
  paint(c: C): void {
    for (const s of this.shots) {
      if (this.o.hint) {
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(s.x + s.vx, s.y + s.vy);
        c.stroke();
      }
      c.lineWidth = 3.5;
      c.strokeStyle = ink;
      c.fillStyle = this.col;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    // seu Bloop
    const blink = this.inv > 0 && Math.floor(this.inv * 12) % 2 === 0;
    if (!blink) {
      c.lineWidth = 4;
      c.strokeStyle = ink;
      c.fillStyle = '#b07bff';
      c.beginPath();
      c.arc(this.px, this.py, 18, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = ink;
      c.beginPath();
      c.arc(this.px - 6, this.py - 3, 3, 0, Math.PI * 2);
      c.arc(this.px + 6, this.py - 3, 3, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i < 4 - this.hits ? '#ff5c8a' : 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(this.o.w / 2 - 33 + i * 22, this.o.h - 16, 8, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/* ============================== memória ============================== */
class Memoria extends Minigame {
  private pads: number;
  private seq: number[] = [];
  private showDur: number;
  private phase: 'show' | 'input' = 'show';
  private input = 0;
  private lit = -1;
  private litT = 0;
  private idle = 0;
  private autoT = 0;
  constructor(o: MgOpts) {
    super(o);
    const d = o.diff;
    this.pads = d > 0.6 ? 6 : 4;
    const L = 3 + Math.round(d * 4);
    for (let i = 0; i < L; i++) {
      let p = this.r.int(this.pads);
      if (i && p === this.seq[i - 1] && this.r.chance(0.6)) p = (p + 1) % this.pads;
      this.seq.push(p);
    }
    this.showDur = (0.62 - d * 0.28) * (o.hint ? 1.5 : 1);
  }
  private padPos(i: number): [number, number] {
    const { w, h } = this.o;
    const a = -Math.PI / 2 + (i / this.pads) * Math.PI * 2;
    const R = Math.min(w, h) * 0.3;
    return [w / 2 + Math.cos(a) * R, h * 0.5 + Math.sin(a) * R];
  }
  private padCol(i: number): string {
    return ['#ff5c8a', '#4fc3ff', '#7dff6b', '#ffd23a', '#c27bff', '#ff9a3a'][i];
  }
  step(dt: number): void {
    this.litT = Math.max(0, this.litT - dt);
    if (this.phase === 'show') {
      const per = this.showDur + 0.16;
      const k = Math.floor((this.time - 0.6) / per);
      const inside = (this.time - 0.6) % per < this.showDur;
      if (this.time < 0.6) return;
      if (k >= this.seq.length) {
        this.phase = 'input';
        this.lit = -1;
        return;
      }
      const nl = inside ? this.seq[k] : -1;
      if (nl !== this.lit && nl >= 0) this.o.fx('tick');
      this.lit = nl;
      return;
    }
    this.idle += dt;
    if (this.o.auto) {
      this.autoT += dt;
      if (this.autoT > 0.22) {
        this.autoT = 0;
        const [x, y] = this.padPos(this.seq[this.input]);
        this.down(x, y);
      }
    }
    if (this.idle > 4) {
      this.judge(this.o.w / 2, this.o.h / 2, 0);
      this.finish(this.input / this.seq.length);
    }
  }
  down(x: number, y: number): void {
    if (this.phase !== 'input' || this.done) return;
    for (let i = 0; i < this.pads; i++) {
      const [px, py] = this.padPos(i);
      if (Math.hypot(x - px, y - py) < 44) {
        this.idle = 0;
        this.lit = i;
        this.litT = 0.18;
        if (i === this.seq[this.input]) {
          this.input++;
          this.o.fx('tick');
          if (this.input >= this.seq.length) {
            this.judge(this.o.w / 2, this.o.h * 0.5, 1);
            this.finish(1);
          }
        } else {
          this.judge(px, py, 0);
          this.finish((this.input / this.seq.length) * 0.8);
        }
        return;
      }
    }
  }
  progress(): number {
    return this.phase === 'show' ? 0 : this.input / this.seq.length;
  }
  paint(c: C): void {
    const { w, h } = this.o;
    for (let i = 0; i < this.pads; i++) {
      const [x, y] = this.padPos(i);
      const on = this.lit === i && (this.phase === 'show' || this.litT > 0);
      c.lineWidth = 5;
      c.strokeStyle = ink;
      c.fillStyle = on ? '#ffffff' : this.padCol(i);
      c.globalAlpha = on ? 1 : 0.75;
      c.beginPath();
      c.arc(x, y, on ? 40 : 34, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (on) {
        c.fillStyle = this.padCol(i);
        c.beginPath();
        c.arc(x, y, 26, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    c.fillStyle = '#fff';
    c.font = gameFont(700, 16);
    c.textAlign = 'center';
    c.fillText(this.phase === 'show' ? t('caca.mg.watch', 'Observe…') : t('caca.mg.repeat', 'Sua vez! {n}/{m}', { n: this.input, m: this.seq.length }), w / 2, h * 0.5);
  }
}

export function makeMinigame(k: GameKind, o: MgOpts): Minigame {
  switch (k) {
    case 'aneis': return new Aneis(o);
    case 'ritmo': return new Ritmo(o);
    case 'runa': return new Runa(o);
    case 'esquiva': return new Esquiva(o);
    case 'memoria': return new Memoria(o);
  }
}
