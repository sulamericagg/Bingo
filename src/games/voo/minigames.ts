/* ============================================================
 *  POUSO FORÇADO — minijogos de conserto (sobreposição pequena,
 *  o avião continua voando por trás):
 *   - rewire: arraste cada fio até o encaixe da mesma cor
 *   - pump:   aperte BOMBEAR quando o ponteiro estiver no verde
 *   - valve / crank: gire a roda com o dedo (voltas completas)
 * ============================================================ */
import { t } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { sfx } from '../../3d/common/sfx';
import { tap } from '../../core/haptics';
import type { MiniKind } from './sim';
import { vIcon } from './icons';

const TAU = Math.PI * 2;
const COLS = ['#ff4d6a', '#ffd34a', '#46d9e6', '#5ef08a'];

export class MiniGame {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private bar: HTMLElement;
  private W = 300;
  private H = 170;
  private t = 0;
  prog = 0;
  // rewire
  private right: number[] = [];
  private done = [false, false, false, false];
  private drag: { i: number; x: number; y: number } | null = null;
  // pump
  private needle = 0;
  private pumpAnim = 0;
  private zone = 0.5;
  // roda
  private ang = 0;
  private lastA: number | null = null;
  private turns = 3;
  private offs: (() => void)[] = [];

  constructor(
    layer: HTMLElement,
    readonly kind: MiniKind,
    private add: (amt: number) => void,
    close: () => void,
  ) {
    const title =
      kind === 'rewire' ? t('voo.m.rewire', 'Religue os fios') : kind === 'pump' ? t('voo.m.pump', 'Bombeie combustível') : kind === 'valve' ? t('voo.m.valve', 'Feche a válvula de pressão') : t('voo.m.crank', 'Gire a manivela do trem');
    const hint =
      kind === 'rewire'
        ? t('voo.m.rewireH', 'Arraste cada fio até a mesma cor')
        : kind === 'pump'
          ? t('voo.m.pumpH', 'Aperte quando o ponteiro passar no verde')
          : t('voo.m.turnH', 'Gire o dedo em círculos em volta da roda');
    const ico = kind === 'rewire' ? 'spark' : kind === 'pump' ? 'fuel' : kind === 'valve' ? 'pressure' : 'gear';
    this.el = document.createElement('div');
    this.el.className = 'voo-minig';
    this.el.innerHTML = `<h3>${vIcon(ico, 26)}<span>${title}</span><button class="voo-btn round red" data-x>${vIcon('close', 26)}</button></h3><canvas></canvas><div class="bar"><i></i></div><p>${hint}</p>`;
    layer.appendChild(this.el);
    this.cv = this.el.querySelector('canvas')!;
    this.x = this.cv.getContext('2d')!;
    this.bar = this.el.querySelector('.bar i')!;
    const short = Math.min(window.innerWidth, window.innerHeight);
    this.H = Math.max(140, Math.min(220, short * 0.46));
    this.W = Math.round(this.H * 1.7);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = this.W * dpr;
    this.cv.height = this.H * dpr;
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.x.scale(dpr, dpr);
    this.el.querySelector('[data-x]')!.addEventListener('click', close);
    this.right = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    this.turns = kind === 'valve' ? 3 : 7;
    const pos = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.cv.setPointerCapture?.(e.pointerId);
      const p = pos(e);
      if (kind === 'rewire') {
        for (let i = 0; i < 4; i++) {
          const y = this.rowY(i);
          if (!this.done[i] && Math.abs(p.x - 24) < 34 && Math.abs(p.y - y) < this.H / 10) this.drag = { i, x: p.x, y: p.y };
        }
      } else if (kind === 'pump') this.pump();
      else this.lastA = Math.atan2(p.y - this.H / 2, p.x - this.W / 2);
    };
    const move = (e: PointerEvent) => {
      const p = pos(e);
      if (this.drag) {
        this.drag.x = p.x;
        this.drag.y = p.y;
      } else if (this.lastA !== null) {
        const a = Math.atan2(p.y - this.H / 2, p.x - this.W / 2);
        let d = a - this.lastA;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        this.lastA = a;
        if (d > 0 && d < 1) this.turn(d);
      }
    };
    const up = () => {
      if (this.drag) {
        const d = this.drag;
        for (let j = 0; j < 4; j++) {
          if (this.right[j] !== d.i) continue;
          if (Math.abs(d.x - (this.W - 24)) < 44 && Math.abs(d.y - this.rowY(j)) < this.H / 9) {
            this.done[d.i] = true;
            this.give(0.25);
            sfx.fix();
            tap('light');
          }
        }
        if (!this.done[d.i]) sfx.thud();
      }
      this.drag = null;
      this.lastA = null;
    };
    this.cv.addEventListener('pointerdown', down);
    this.cv.addEventListener('pointermove', move);
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'e' || e.key === 'E') {
        if (kind === 'pump') this.pump();
        else if (kind === 'rewire') {
          const i = this.done.indexOf(false);
          if (i >= 0) (this.done[i] = true), this.give(0.25);
        } else this.turn(0.9);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', kd);
    this.offs.push(() => window.removeEventListener('keydown', kd));
  }
  private rowY(i: number): number {
    return this.H * (0.17 + i * 0.22);
  }
  private give(a: number): void {
    this.prog = Math.min(1, this.prog + a);
    this.add(a);
  }
  private pump(): void {
    const good = Math.abs(this.needle - this.zone) < 0.13;
    this.pumpAnim = 1;
    this.give(good ? 0.11 : 0.025);
    if (good) {
      sfx.bubble();
      tap('light');
      this.zone = 0.25 + Math.random() * 0.5;
    } else sfx.thud();
  }
  private turn(d: number): void {
    const before = Math.floor(this.ang / TAU);
    this.ang += d;
    const amt = d / (TAU * this.turns);
    this.give(amt);
    if (Math.floor(this.ang / TAU) > before) {
      sfx.click();
      tap('light');
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.pumpAnim = Math.max(0, this.pumpAnim - dt * 4);
    this.needle = 0.5 + Math.sin(this.t * 2.6) * 0.46;
    this.bar.style.width = Math.round(this.prog * 100) + '%';
    const x = this.x;
    const W = this.W;
    const H = this.H;
    x.clearRect(0, 0, W, H);
    x.lineCap = 'round';
    if (this.kind === 'rewire') {
      // terminais
      for (let i = 0; i < 4; i++) {
        const y = this.rowY(i);
        x.fillStyle = COLS[i];
        x.strokeStyle = '#111';
        x.lineWidth = 3;
        x.beginPath();
        x.roundRect(6, y - 10, 28, 20, 6);
        x.fill();
        x.stroke();
        const j = this.right[i];
        x.fillStyle = COLS[j];
        x.beginPath();
        x.roundRect(W - 34, this.rowY(i) - 10, 28, 20, 6);
        x.fill();
        x.stroke();
      }
      // fios
      for (let i = 0; i < 4; i++) {
        let ex: number;
        let ey: number;
        if (this.done[i]) {
          ex = W - 34;
          ey = this.rowY(this.right.indexOf(i));
        } else if (this.drag?.i === i) {
          ex = this.drag.x;
          ey = this.drag.y;
        } else {
          // fio solto soltando faísca
          ex = 60 + Math.sin(this.t * 7 + i) * 6;
          ey = this.rowY(i) + 12;
          if (Math.random() < 0.15) {
            x.fillStyle = '#9ff4ff';
            x.fillRect(ex + Math.random() * 10 - 5, ey + Math.random() * 10 - 5, 3, 3);
          }
        }
        x.strokeStyle = '#111';
        x.lineWidth = 11;
        const sy = this.rowY(i);
        x.beginPath();
        x.moveTo(34, sy);
        x.bezierCurveTo(34 + (ex - 34) * 0.4, sy, 34 + (ex - 34) * 0.6, ey, ex, ey);
        x.stroke();
        x.strokeStyle = COLS[i];
        x.lineWidth = 7;
        x.stroke();
      }
    } else if (this.kind === 'pump') {
      const cx = W * 0.38;
      const cy = H * 0.62;
      const R = H * 0.46;
      x.lineWidth = 16;
      x.strokeStyle = '#4a4f6e';
      x.beginPath();
      x.arc(cx, cy, R, Math.PI, TAU);
      x.stroke();
      x.strokeStyle = '#5ef08a';
      x.beginPath();
      x.arc(cx, cy, R, Math.PI + (this.zone - 0.13) * Math.PI, Math.PI + (this.zone + 0.13) * Math.PI);
      x.stroke();
      const a = Math.PI + this.needle * Math.PI;
      x.strokeStyle = '#fff';
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
      x.stroke();
      x.fillStyle = '#ff4d6a';
      x.beginPath();
      x.arc(cx, cy, 10, 0, TAU);
      x.fill();
      // botão BOMBEAR
      const bx = W * 0.8;
      const by = H * 0.55 + this.pumpAnim * 6;
      x.fillStyle = '#ff7a3a';
      x.strokeStyle = '#111';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(bx, by, H * 0.22, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = '#fff';
      x.font = gameFont(800, 13);
      x.textAlign = 'center';
      x.fillText(t('voo.m.pumpBtn', 'BOMBEAR'), bx, by + 5);
    } else {
      const cx = W / 2;
      const cy = H / 2;
      const R = H * 0.4;
      x.strokeStyle = 'rgba(255,255,255,0.18)';
      x.lineWidth = 3;
      x.setLineDash([6, 8]);
      x.beginPath();
      x.arc(cx, cy, R + 18, 0, TAU);
      x.stroke();
      x.setLineDash([]);
      x.save();
      x.translate(cx, cy);
      x.rotate(this.ang);
      const col = this.kind === 'valve' ? '#ff4d6a' : '#ffd34a';
      x.strokeStyle = '#111';
      x.lineWidth = 16;
      x.beginPath();
      x.arc(0, 0, R, 0, TAU);
      x.stroke();
      x.strokeStyle = col;
      x.lineWidth = 10;
      x.stroke();
      for (let i = 0; i < (this.kind === 'valve' ? 4 : 1); i++) {
        x.rotate(TAU / 4);
        x.strokeStyle = '#111';
        x.lineWidth = 10;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(R, 0);
        x.stroke();
        x.strokeStyle = col;
        x.lineWidth = 5;
        x.stroke();
      }
      if (this.kind === 'crank') {
        x.fillStyle = '#ff4d6a';
        x.beginPath();
        x.arc(R, 0, 14, 0, TAU);
        x.fill();
      }
      x.restore();
      x.fillStyle = '#fff';
      x.font = gameFont(800, 14);
      x.textAlign = 'center';
      x.fillText(`${Math.min(this.turns, Math.floor(this.ang / TAU))}/${this.turns}`, cx, cy + 5);
      // seta de sentido
      x.strokeStyle = '#7aff9a';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(cx, cy, R + 18, -0.9, -0.2);
      x.stroke();
      const ea = -0.2;
      x.beginPath();
      x.moveTo(cx + Math.cos(ea) * (R + 18), cy + Math.sin(ea) * (R + 18));
      x.lineTo(cx + Math.cos(ea - 0.2) * (R + 28), cy + Math.sin(ea - 0.2) * (R + 28));
      x.moveTo(cx + Math.cos(ea) * (R + 18), cy + Math.sin(ea) * (R + 18));
      x.lineTo(cx + Math.cos(ea - 0.2) * (R + 8), cy + Math.sin(ea - 0.2) * (R + 8));
      x.stroke();
    }
  }
  destroy(): void {
    for (const f of this.offs) f();
    this.el.remove();
  }
}
