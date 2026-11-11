/* ============================================================
 *  CONSERTOS — moldura dos minijogos: tela cheia em canvas 2D (espaço de desenho com
 *  altura fixa 390 e largura conforme a tela), laço próprio, toques (pointer events),
 *  barra de passos com ícones, mão-dica animada quando a criança para, partículas
 *  (faíscas, confete, pó, gotas, estrelas, bolhas) em arrays fixos e a festa do final.
 *  Sem texto na tela: ícones, voz curta e gestos.
 * ============================================================ */
import { tap as haptic, success } from '../../../../core/haptics';
import { pushBack } from '../../../../core/back';
import { speak } from '../../../voo/voice';
import type { Kind } from '../../machines';
import type { PartArt } from '../model';
import { rs } from '../sound';
import { clamp, drawHand, drawIcon, easeOut, glow, initArt, lin, rad, rrect, TAU, type C2 } from './art';

/** como o veículo aparece no minijogo */
export interface VehLook {
  kind: Kind;
  /** cor da lataria (css) */
  body: string;
  bodyD: string;
  heavy: boolean;
  art: PartArt;
}
export interface MgCtx {
  /** 0 fácil .. 3 muito difícil */
  level: number;
  veh: VehLook;
}
export type HintK = 'tap' | 'circle' | 'drag' | 'pump' | 'hold';
export interface Hint {
  k: HintK;
  x: number;
  y: number;
  x1: number;
  y1: number;
  r: number;
}

/* ============================== partículas ============================== */
export const P = { spark: 0, confetti: 1, dust: 2, drop: 3, star: 4, bubble: 5, smoke: 6, good: 7 } as const;
export type PK = (typeof P)[keyof typeof P];
const N = 260;
const CONF = ['#ff4d4d', '#ffcf2e', '#3cbf5a', '#3a9be6', '#c05cff', '#ff8a2a'];
export class Fx {
  x = new Float32Array(N);
  y = new Float32Array(N);
  vx = new Float32Array(N);
  vy = new Float32Array(N);
  life = new Float32Array(N);
  max = new Float32Array(N);
  size = new Float32Array(N);
  rot = new Float32Array(N);
  vr = new Float32Array(N);
  kind = new Uint8Array(N);
  col = new Uint8Array(N);
  /** chão para quicar (gotas/pó) */
  floor = 1e9;
  private head = 0;
  emit(k: PK, x: number, y: number, vx: number, vy: number, life: number, size: number, col = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % N;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.rot[i] = Math.random() * TAU;
    this.vr[i] = (Math.random() - 0.5) * 12;
    this.kind[i] = k;
    this.col[i] = col;
  }
  burst(k: PK, x: number, y: number, n: number, speed: number, life: number, size: number, up = 0): void {
    for (let j = 0; j < n; j++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit(k, x, y, Math.cos(a) * s, Math.sin(a) * s - up, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), (Math.random() * 6) | 0);
    }
  }
  sparks(x: number, y: number, n = 22): void {
    this.burst(P.spark, x, y, n, 420, 0.45, 2.4, 120);
    this.burst(P.smoke, x, y, 3, 30, 0.9, 10, 30);
  }
  confetti(W: number): void {
    for (let j = 0; j < 90; j++) this.emit(P.confetti, W * (0.1 + Math.random() * 0.8), -20 - Math.random() * 80, (Math.random() - 0.5) * 120, 60 + Math.random() * 120, 2.6 + Math.random(), 5 + Math.random() * 4, (Math.random() * 6) | 0);
  }
  update(dt: number): void {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      const g = k === P.spark ? 900 : k === P.confetti ? 80 : k === P.drop ? 900 : k === P.dust ? -10 : k === P.smoke ? -40 : k === P.bubble ? -60 : k === P.good ? -30 : 0;
      this.vy[i] += g * dt;
      const drag = k === P.confetti ? 1.4 : k === P.dust || k === P.smoke ? 2 : k === P.star || k === P.good ? 3 : 0.4;
      this.vx[i] *= 1 - Math.min(1, drag * dt);
      if (k === P.confetti) this.vx[i] += Math.sin(this.life[i] * 7 + i) * 40 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      if ((k === P.drop || k === P.spark) && this.y[i] > this.floor) {
        this.y[i] = this.floor;
        this.vy[i] *= k === P.spark ? -0.35 : 0;
        this.vx[i] *= 0.5;
        if (k === P.drop) this.life[i] = Math.min(this.life[i], 0.25);
      }
    }
  }
  draw(c: C2): void {
    for (let i = 0; i < N; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const k = this.kind[i];
      const f = l / this.max[i];
      const x = this.x[i];
      const y = this.y[i];
      const s = this.size[i];
      if (k === P.spark) {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = f > 0.5 ? '#fff6b0' : '#ffae3a';
        c.globalAlpha = Math.min(1, f * 1.6);
        c.lineWidth = s;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - this.vx[i] * 0.025, y - this.vy[i] * 0.025);
        c.stroke();
        c.globalCompositeOperation = 'source-over';
      } else if (k === P.confetti) {
        c.globalAlpha = Math.min(1, f * 3);
        c.fillStyle = CONF[this.col[i]];
        c.save();
        c.translate(x, y);
        c.rotate(this.rot[i]);
        c.scale(1, Math.cos(this.rot[i] * 1.7));
        c.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
        c.restore();
      } else if (k === P.dust || k === P.smoke) {
        c.globalAlpha = f * (k === P.smoke ? 0.35 : 0.5);
        c.fillStyle = k === P.smoke ? '#5d5852' : '#b89878';
        c.beginPath();
        c.arc(x, y, s * (1.6 - f * 0.6), 0, TAU);
        c.fill();
      } else if (k === P.drop) {
        c.globalAlpha = Math.min(1, f * 3);
        c.fillStyle = this.col[i] === 1 ? '#d9a521' : '#241a12';
        c.beginPath();
        c.ellipse(x, y, s * 0.75, s * (1 + Math.min(1, Math.abs(this.vy[i]) / 400)), 0, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,.5)';
        c.beginPath();
        c.arc(x - s * 0.25, y - s * 0.3, s * 0.25, 0, TAU);
        c.fill();
      } else if (k === P.star || k === P.good) {
        c.globalAlpha = Math.min(1, f * 2);
        c.fillStyle = k === P.good ? '#9dff8a' : '#ffe680';
        c.save();
        c.translate(x, y);
        c.rotate(this.rot[i] * 0.3);
        const r = s * (0.6 + 0.4 * Math.sin(f * 9));
        c.beginPath();
        for (let j = 0; j < 8; j++) {
          const rr = j % 2 ? r * 0.35 : r;
          const a = (j * TAU) / 8;
          if (j === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
        c.restore();
      } else if (k === P.bubble) {
        c.globalAlpha = Math.min(1, f * 2) * 0.8;
        c.strokeStyle = '#e8f6ff';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, s, 0, TAU);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
}

/* ============================== gestos ============================== */
/** girar com o dedo em volta de um centro: acumula o ângulo (qualquer sentido, o líquido conta) */
export class Twist {
  cx = 0;
  cy = 0;
  acc = 0;
  private last = 0;
  active = false;
  /** ângulo acumulado desde o último clique de catraca */
  private click = 0;
  start(cx: number, cy: number, x: number, y: number): void {
    this.cx = cx;
    this.cy = cy;
    this.last = Math.atan2(y - cy, x - cx);
    this.active = true;
  }
  /** devolve o delta (rad) deste movimento */
  move(x: number, y: number): number {
    if (!this.active) return 0;
    const dx = x - this.cx;
    const dy = y - this.cy;
    // muito perto do centro o ângulo fica instável
    if (dx * dx + dy * dy < 36) return 0;
    const a = Math.atan2(dy, dx);
    let d = a - this.last;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    this.last = a;
    this.acc += d;
    this.click += Math.abs(d);
    if (this.click > 0.42) {
      this.click = 0;
      rs.ratchet(1 + Math.min(0.5, Math.abs(this.acc) * 0.03));
      haptic('light');
    }
    return d;
  }
  end(): void {
    this.active = false;
  }
  reset(): void {
    this.acc = 0;
    this.active = false;
  }
}

/** alavanca de bombear (sobe e desce, no mesmo arrasto ou em vários): conta cada descida */
export class Pump {
  /** 0 em cima .. 1 embaixo */
  pos = 0;
  /** ponto mais alto desde a última descida contada */
  private lo = 0;
  count = 0;
  active = false;
  private y0 = 0;
  private p0 = 0;
  constructor(public span = 120) {}
  start(y: number): void {
    this.active = true;
    this.y0 = y;
    this.p0 = this.pos;
    this.lo = Math.min(this.lo, this.pos);
  }
  /** devolve true quando completa uma descida */
  move(y: number): boolean {
    if (!this.active) return false;
    this.pos = clamp(this.p0 + (y - this.y0) / this.span, 0, 1);
    // passou do fundo/topo: re-ancora para o próximo vaivém no mesmo arrasto
    if (this.p0 + (y - this.y0) / this.span < 0) this.y0 = y, this.p0 = 0;
    if (this.p0 + (y - this.y0) / this.span > 1) this.y0 = y, this.p0 = 1;
    if (this.pos < this.lo) this.lo = this.pos;
    if (this.pos > 0.85 && this.pos - this.lo > 0.5) {
      this.lo = this.pos;
      this.count++;
      return true;
    }
    return false;
  }
  end(): void {
    this.active = false;
  }
  /** volta sozinha para cima (mola) */
  relax(dt: number): void {
    if (!this.active) this.pos = Math.max(0, this.pos - dt * 3.2);
    if (this.pos < this.lo) this.lo = this.pos;
  }
}

/* ============================== minijogo base ============================== */
export abstract class MiniGame {
  /** espaço de desenho (altura fixa 390) */
  W = 844;
  readonly H = 390;
  t = 0;
  /** ícones da barra de passos (ids de drawIcon) */
  steps: string[] = [];
  step = 0;
  /** passo atual com outra dica no lugar do ícone (ex.: estrela no aperto) */
  hint: Hint | null = null;
  /** segundos sem mexer */
  idle = 0;
  readonly fx = new Fx();
  /** fundo: oficina ou ao ar livre */
  bg: 'shop' | 'out' = 'shop';
  /** chão (y) do fundo */
  floorY = 330;
  /** bônus (estrelas) conquistado */
  bonus = 0;
  /** terminou (o host faz a festa) */
  won = false;
  /** frase falada ao começar cada passo (já traduzida) */
  voice: (() => string)[] = [];
  constructor(readonly ctx: MgCtx) {}
  /** monta gradientes/cache (chamado no início e quando muda o tamanho) */
  abstract setup(c: C2): void;
  abstract update(dt: number): void;
  abstract draw(c: C2): void;
  down(_x: number, _y: number): void {}
  move(_x: number, _y: number): void {}
  up(_x: number, _y: number): void {}
  /** avança o passo (com som e voz) */
  next(): void {
    this.step++;
    this.idle = 0;
    rs.tick();
    if (this.step >= this.steps.length) {
      this.won = true;
      return;
    }
    this.say();
  }
  say(): void {
    const v = this.voice[this.step];
    if (v) speak(v(), { gap: 300 });
  }
  /** dica: preenche o objeto reaproveitado */
  protected setHint(k: HintK, x: number, y: number, x1 = 0, y1 = 0, r = 30): void {
    const h = (this.hint ??= { k, x, y, x1, y1, r });
    h.k = k;
    h.x = x;
    h.y = y;
    h.x1 = x1;
    h.y1 = y1;
    h.r = r;
  }
  protected noHint(): void {
    this.hint = null;
  }
}

/* ============================== tela do minijogo ============================== */
export interface OverlayOpts {
  parent: HTMLElement;
  onClose(ok: boolean, bonus: number): void;
}
export class Overlay {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private c: C2;
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private s = 1;
  private bgCv: HTMLCanvasElement;
  private bgKey = '';
  private winT = -1;
  private stepT = 0;
  private shownStep = -1;
  private popBack: (() => void) | null = null;
  private pid = -1;
  private closed = false;
  private ro: ResizeObserver;

  constructor(
    readonly g: MiniGame,
    private o: OverlayOpts,
  ) {
    const el = document.createElement('div');
    el.className = 'gbr-ov';
    el.innerHTML = `<canvas></canvas><button class="gbr-x" aria-label="close" data-touch-ignore><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    o.parent.appendChild(el);
    this.el = el;
    this.cv = el.querySelector('canvas')!;
    this.c = this.cv.getContext('2d')!;
    this.bgCv = document.createElement('canvas');
    initArt(this.c);
    el.querySelector('.gbr-x')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(false);
    });
    this.cv.addEventListener('pointerdown', this.pd);
    this.cv.addEventListener('pointermove', this.pm);
    this.cv.addEventListener('pointerup', this.pu);
    this.cv.addEventListener('pointercancel', this.pu);
    this.popBack = pushBack(() => this.close(false));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    window.setTimeout(() => g.say(), 250);
    el.classList.add('in');
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(320, r.width || window.innerWidth);
    const h = Math.max(200, r.height || window.innerHeight);
    // tablets velhos: no máximo 1,5× de densidade
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.s = h / this.g.H;
    this.g.W = w / this.s;
    this.g.setup(this.c);
    this.bgKey = '';
  }
  /** fundo pré-desenhado (oficina ou garimpo ao ar livre) */
  private paintBg(): void {
    const g = this.g;
    const key = `${g.bg}|${this.cv.width}|${this.cv.height}|${g.floorY}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    const b = this.bgCv;
    b.width = this.cv.width;
    b.height = this.cv.height;
    const c = b.getContext('2d')!;
    c.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, 0, 0);
    const W = g.W;
    const H = g.H;
    const fy = g.floorY;
    if (g.bg === 'out') {
      c.fillStyle = lin(c, 0, 0, 0, fy, [
        [0, '#5fa9e6'],
        [0.7, '#bfe0f2'],
        [1, '#f4dcae'],
      ]);
      c.fillRect(0, 0, W, fy);
      // nuvens
      c.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 5; i++) {
        const x = ((i * 233) % W) + 30;
        const y = 30 + (i % 3) * 22;
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.arc(x + k * 18, y + (k % 2) * 5, 16 - (k % 2) * 4, 0, TAU);
          c.fill();
        }
      }
      // morros e mata
      c.fillStyle = '#7ba05a';
      c.beginPath();
      c.moveTo(0, fy - 70);
      for (let x = 0; x <= W; x += 40) c.lineTo(x, fy - 80 + Math.sin(x * 0.012) * 18 + Math.sin(x * 0.031) * 8);
      c.lineTo(W, fy);
      c.lineTo(0, fy);
      c.fill();
      c.fillStyle = '#4c7f36';
      for (let x = 0; x < W; x += 26) {
        const h = 24 + ((x * 7) % 19);
        c.beginPath();
        c.arc(x, fy - 52 + Math.sin(x) * 6, h * 0.55, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#b8562a';
      c.beginPath();
      c.moveTo(W * 0.62, fy);
      c.lineTo(W * 0.78, fy - 120);
      c.lineTo(W * 0.9, fy - 96);
      c.lineTo(W * 1.02, fy - 130);
      c.lineTo(W * 1.02, fy);
      c.fill();
      // chão de terra vermelha
      c.fillStyle = lin(c, 0, fy, 0, H, [
        [0, '#c4693a'],
        [0.4, '#a9542a'],
        [1, '#6e3418'],
      ]);
      c.fillRect(0, fy - 1, W, H - fy + 1);
      c.fillStyle = 'rgba(80,30,10,.35)';
      for (let i = 0; i < 70; i++) {
        const x = (i * 97.3) % W;
        const y = fy + 6 + ((i * 37) % (H - fy - 8));
        c.fillRect(x, y, 6 + (i % 5) * 4, 2);
      }
      c.fillStyle = 'rgba(255,220,180,.25)';
      for (let i = 0; i < 40; i++) c.fillRect((i * 151.7) % W, fy + 4 + ((i * 53) % (H - fy - 6)), 3, 2);
    } else {
      // oficina: parede azul-ardósia, painel perfurado, luz quente de cima
      c.fillStyle = lin(c, 0, 0, 0, fy, [
        [0, '#26303b'],
        [1, '#3b4652'],
      ]);
      c.fillRect(0, 0, W, fy);
      c.fillStyle = 'rgba(0,0,0,.22)';
      for (let y = 18; y < fy - 30; y += 18) for (let x = 12 + ((y / 18) % 2) * 9; x < W; x += 18) c.fillRect(x, y, 3, 3);
      // ferramentas penduradas (silhuetas)
      c.strokeStyle = 'rgba(15,20,26,.55)';
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = 40 + ((i * 131) % (W - 80));
        const y = 40 + (i % 3) * 16;
        c.lineWidth = 7;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (i % 2 ? 10 : -6), y + 60 + (i % 3) * 12);
        c.stroke();
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x, y - 4, 7, 0, TAU);
        c.stroke();
      }
      // faixa de segurança no rodapé
      c.fillStyle = '#2a2a2a';
      c.fillRect(0, fy - 16, W, 16);
      c.fillStyle = '#e8b41c';
      for (let x = -20; x < W; x += 28) {
        c.beginPath();
        c.moveTo(x, fy);
        c.lineTo(x + 14, fy - 16);
        c.lineTo(x + 26, fy - 16);
        c.lineTo(x + 12, fy);
        c.fill();
      }
      // piso de concreto
      c.fillStyle = lin(c, 0, fy, 0, H, [
        [0, '#7d756c'],
        [1, '#4a4440'],
      ]);
      c.fillRect(0, fy, W, H - fy);
      c.strokeStyle = 'rgba(0,0,0,.18)';
      c.lineWidth = 1;
      for (let x = -W; x < W * 2; x += 90) {
        c.beginPath();
        c.moveTo(W / 2 + (x - W / 2) * 0.6, fy);
        c.lineTo(x, H);
        c.stroke();
      }
      c.fillStyle = 'rgba(40,30,20,.25)';
      c.beginPath();
      c.ellipse(W * 0.3, fy + 30, 60, 10, 0, 0, TAU);
      c.fill();
      // luz
      c.fillStyle = rad(c, W / 2, -60, 20, W / 2, 80, W * 0.6, [
        [0, 'rgba(255,226,170,.38)'],
        [1, 'rgba(255,226,170,0)'],
      ]);
      c.fillRect(0, 0, W, H);
    }
    // vinheta
    c.fillStyle = rad(c, W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, W * 0.75, [
      [0, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,.45)'],
    ]);
    c.fillRect(0, 0, W, H);
  }

  private toLocal(e: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    return [(e.clientX - r.left) / this.s, (e.clientY - r.top) / this.s];
  }
  private pd = (e: PointerEvent) => {
    if (this.winT >= 0) return;
    if (this.pid >= 0 && this.pid !== e.pointerId) return;
    e.preventDefault();
    this.pid = e.pointerId;
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    const [x, y] = this.toLocal(e);
    this.g.idle = 0;
    this.g.down(x, y);
  };
  private pm = (e: PointerEvent) => {
    if (e.pointerId !== this.pid || this.winT >= 0) return;
    const [x, y] = this.toLocal(e);
    this.g.idle = 0;
    this.g.move(x, y);
  };
  private pu = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    this.pid = -1;
    const [x, y] = this.toLocal(e);
    this.g.up(x, y);
  };

  private loop = (now: number) => {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const g = this.g;
    g.t += dt;
    g.idle += dt;
    g.update(dt);
    g.fx.update(dt);
    if (g.step !== this.shownStep) {
      this.shownStep = g.step;
      this.stepT = 0;
    }
    this.stepT += dt;
    if (g.won && this.winT < 0) {
      this.winT = 0;
      rs.cheer();
      success();
      g.fx.confetti(g.W);
      g.fx.burst(P.star, g.W / 2, g.H * 0.45, 26, 380, 1.1, 14);
    }
    if (this.winT >= 0) {
      this.winT += dt;
      if (this.winT > 2.1) this.close(true);
    }
    this.draw();
  };

  private draw(): void {
    const c = this.c;
    const g = this.g;
    this.paintBg();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bgCv, 0, 0);
    c.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, 0, 0);
    g.draw(c);
    g.fx.draw(c);
    this.stepBar(c);
    // mão-dica: aparece quando a criança para por um tempinho (e no começo de cada passo)
    const h = g.hint;
    if (h && this.winT < 0 && (g.idle > 1.6 || this.stepT < 2.2)) this.drawHint(c, h);
    if (this.winT >= 0) this.drawWin(c);
  }

  /** barra de passos: bolinhas com ícones; a atual pula, as feitas ficam verdes */
  private stepBar(c: C2): void {
    const g = this.g;
    const n = g.steps.length;
    const gap = 46;
    const x0 = g.W / 2 - ((n - 1) * gap) / 2;
    const y = 30;
    c.lineCap = 'round';
    c.lineWidth = 4;
    for (let i = 0; i < n - 1; i++) {
      c.strokeStyle = i < g.step ? '#3cbf5a' : 'rgba(255,255,255,.25)';
      c.beginPath();
      c.moveTo(x0 + i * gap + 17, y);
      c.lineTo(x0 + (i + 1) * gap - 17, y);
      c.stroke();
    }
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      const cur = i === g.step && !g.won;
      const done = i < g.step || g.won;
      const pop = cur ? 1 + 0.12 * Math.max(0, 1 - this.stepT * 2) * Math.sin(this.stepT * 20) + 0.04 * Math.sin(g.t * 4) : 1;
      const r = (cur ? 19 : 15) * pop;
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath();
      c.arc(x + 1.5, y + 2.5, r, 0, TAU);
      c.fill();
      c.fillStyle = done ? '#2f9e4a' : cur ? '#ffcf2e' : 'rgba(30,24,20,.75)';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.strokeStyle = done ? '#bff5c9' : cur ? '#fff6c8' : 'rgba(255,255,255,.35)';
      c.lineWidth = 2.5;
      c.stroke();
      drawIcon(c, done ? 'check' : g.steps[i], x, y, cur ? 22 : 17, done ? '#fff' : cur ? '#3a2400' : 'rgba(255,255,255,.7)', done ? 3.2 : 2.2);
    }
  }

  private drawHint(c: C2, h: Hint): void {
    const t = this.g.t;
    const a = Math.min(1, this.g.idle > 1.6 ? (this.g.idle - 1.6) * 3 : 1);
    if (h.k === 'tap') {
      const k = (t * 1.3) % 1;
      const press = k < 0.25 ? k / 0.25 : k < 0.45 ? 1 - (k - 0.25) / 0.2 : 0;
      if (k > 0.2 && k < 0.7) {
        c.strokeStyle = '#fff';
        c.globalAlpha = 0.8 * (1 - (k - 0.2) / 0.5);
        c.lineWidth = 3;
        c.beginPath();
        c.arc(h.x, h.y, 8 + (k - 0.2) * 70, 0, TAU);
        c.stroke();
        c.globalAlpha = 1;
      }
      drawHand(c, h.x + 4, h.y + 4 + (1 - press) * 10, 0.75, press, a);
    } else if (h.k === 'hold') {
      const k = (t * 0.6) % 1;
      c.strokeStyle = 'rgba(255,255,255,.75)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(h.x, h.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k * 1.4));
      c.stroke();
      drawHand(c, h.x + 4, h.y + 6, 0.75, k < 0.85 ? 1 : 0, a);
    } else if (h.k === 'circle') {
      // seta circular + mão girando em volta
      const r = h.r;
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 4;
      c.setLineDash([2, 9]);
      c.beginPath();
      c.arc(h.x, h.y, r, 0, TAU);
      c.stroke();
      c.setLineDash([]);
      const dir = h.x1 >= 0 ? 1 : -1;
      const an = -Math.PI / 2 + dir * ((t * 2.6) % TAU);
      // ponta de seta na frente da mão
      const ax = h.x + Math.cos(an + dir * 0.5) * r;
      const ay = h.y + Math.sin(an + dir * 0.5) * r;
      c.fillStyle = '#fff';
      c.save();
      c.translate(ax, ay);
      c.rotate(an + dir * 0.5 + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      c.beginPath();
      c.moveTo(0, -8);
      c.lineTo(9, 4);
      c.lineTo(-9, 4);
      c.closePath();
      c.fill();
      c.restore();
      drawHand(c, h.x + Math.cos(an) * r, h.y + Math.sin(an) * r, 0.7, 1, a);
    } else if (h.k === 'drag' || h.k === 'pump') {
      const per = h.k === 'pump' ? 1.1 : 1.8;
      const k = (t % per) / per;
      const m = h.k === 'pump' ? (k < 0.5 ? easeOut(k * 2) : 1 - easeOut((k - 0.5) * 2)) : easeOut(Math.min(1, k * 1.25));
      const x = h.x + (h.x1 - h.x) * m;
      const y = h.y + (h.y1 - h.y) * m;
      // trilha pontilhada
      c.strokeStyle = 'rgba(255,255,255,.7)';
      c.lineWidth = 4;
      c.setLineDash([3, 10]);
      c.beginPath();
      c.moveTo(h.x, h.y);
      c.lineTo(h.x1, h.y1);
      c.stroke();
      c.setLineDash([]);
      // ponta de seta no destino
      const an = Math.atan2(h.y1 - h.y, h.x1 - h.x);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.save();
      c.translate(h.x1, h.y1);
      c.rotate(an);
      c.beginPath();
      c.moveTo(4, 0);
      c.lineTo(-10, -9);
      c.lineTo(-10, 9);
      c.closePath();
      c.fill();
      c.restore();
      drawHand(c, x, y, 0.75, k < 0.85 ? 1 : 0, a * (k > 0.9 ? (1 - k) * 10 : 1));
    }
  }

  private drawWin(c: C2): void {
    const g = this.g;
    const k = Math.min(1, this.winT * 2.2);
    const x = g.W / 2;
    const y = g.H * 0.46;
    glow(c, x, y, 160 * easeOut(k), 0.55, true);
    // raios girando
    c.save();
    c.translate(x, y);
    c.rotate(g.t * 0.6);
    c.fillStyle = 'rgba(255,230,120,.22)';
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-18, -220 * k);
      c.lineTo(18, -220 * k);
      c.closePath();
      c.fill();
    }
    c.restore();
    // selo verde com ✓
    const r = 56 * (k < 1 ? easeOut(k) * 1.15 : 1 + 0.03 * Math.sin(g.t * 6));
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    c.arc(x + 3, y + 6, r, 0, TAU);
    c.fill();
    c.fillStyle = lin(c, x, y - r, x, y + r, [
      [0, '#5fe07a'],
      [1, '#1f8a3a'],
    ]);
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 6;
    c.stroke();
    drawIcon(c, 'check', x, y + 2, r * 1.1, '#fff', 3.4);
    // estrelas de bônus
    for (let i = 0; i < g.bonus; i++) {
      const sx = x + (i - (g.bonus - 1) / 2) * 44;
      const sk = Math.max(0, Math.min(1, (this.winT - 0.45 - i * 0.18) * 4));
      if (sk <= 0) continue;
      if (sk < 0.3 && sk > 0.2) rs.star();
      drawIcon(c, 'star', sx, y + r + 34, 40 * easeOut(sk), '#ffcf2e', 2, true);
    }
  }

  close(ok: boolean): void {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.popBack?.();
    this.popBack = null;
    this.el.classList.add('out');
    window.setTimeout(() => this.el.remove(), 260);
    if (!ok) haptic('light');
    this.o.onClose(ok, this.g.bonus);
  }
}

/** desenha um botão redondo de ícone dentro do canvas (ex.: girar peça, ligar) */
export function roundBtn(c: C2, x: number, y: number, r: number, icon: string, col: string, colD: string, press = 0, pulse = 0): void {
  const k = 1 + pulse * 0.08;
  c.fillStyle = 'rgba(0,0,0,.4)';
  c.beginPath();
  c.arc(x + 2, y + 5 - press * 3, r * k, 0, TAU);
  c.fill();
  c.fillStyle = colD;
  c.beginPath();
  c.arc(x, y + 4 - press * 3, r * k, 0, TAU);
  c.fill();
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y + press * 1, r * k, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.85)';
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,.28)';
  c.beginPath();
  c.ellipse(x - r * 0.25, y - r * 0.4 + press, r * 0.55, r * 0.28, -0.3, 0, TAU);
  c.fill();
  drawIcon(c, icon, x, y + press, r * 1.05, '#fff', 2.8);
}
export { rrect };
