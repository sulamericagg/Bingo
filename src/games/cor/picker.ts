/* ============================================================
 *  PINTOU, GANHOU! — seletor de cor
 *  Anel de matiz + quadrado saturação/brilho num só canvas, lupa que
 *  aparece acima do dedo, paleta de mistura rápida e ajustes finos.
 *  Toque: pointer capture, touch-action:none (a página não rola).
 * ============================================================ */
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { hsvHex, hsvToRgb, type HSV } from './color';

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** paleta rápida: tons de partida (h, s, v) */
const QUICK: HSV[] = [
  { h: 0, s: 0.85, v: 0.85 },
  { h: 24, s: 0.9, v: 0.95 },
  { h: 48, s: 0.85, v: 0.97 },
  { h: 100, s: 0.7, v: 0.7 },
  { h: 175, s: 0.75, v: 0.75 },
  { h: 215, s: 0.8, v: 0.85 },
  { h: 275, s: 0.6, v: 0.7 },
  { h: 330, s: 0.5, v: 0.95 },
  { h: 25, s: 0.65, v: 0.45 },
  { h: 0, s: 0, v: 1 },
  { h: 0, s: 0, v: 0.55 },
  { h: 0, s: 0, v: 0.1 },
];

export class Picker {
  readonly el: HTMLDivElement;
  /** área dos botões de ação (Pronto!) */
  readonly act: HTMLDivElement;
  hsv: HSV = { h: 200, s: 0.5, v: 0.6 };
  onChange: (hex: string) => void = () => {};
  /** primeiro toque do jogador nesta rodada (para "mexeu?") */
  touched = false;
  private cv: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private loupe: HTMLCanvasElement;
  private lx: CanvasRenderingContext2D;
  private sw: HTMLDivElement;
  private ring: HTMLCanvasElement | null = null;
  private size = 0;
  private dpr = 1;
  private drag: 'ring' | 'sv' | null = null;
  private pid = -1;
  private raf = 0;
  private tween = 0;
  private locked = false;
  private lastTick = 0;

  constructor(private dprCap = 2) {
    this.el = document.createElement('div');
    this.el.className = 'pg-picker';
    this.el.innerHTML = `
      <div class="pg-pk-main"><canvas class="pg-pk-cv"></canvas><canvas class="pg-loupe"></canvas></div>
      <div class="pg-pk-side">
        <div class="pg-pk-sw"></div>
        <div class="pg-nudges">
          <button data-n="v+" aria-label="${t('cor.lighter', 'Clarear')}"><i style="background:linear-gradient(90deg,#777,#fff)"></i>${t('cor.lighterS', 'Claro')}</button>
          <button data-n="v-" aria-label="${t('cor.darker', 'Escurecer')}"><i style="background:linear-gradient(90deg,#777,#111)"></i>${t('cor.darkerS', 'Escuro')}</button>
          <button data-n="s+" aria-label="${t('cor.vivid', 'Mais vivo')}"><i class="pg-ni-viv"></i>${t('cor.vividS', 'Vivo')}</button>
          <button data-n="s-" aria-label="${t('cor.muted', 'Mais suave')}"><i class="pg-ni-mut"></i>${t('cor.mutedS', 'Suave')}</button>
        </div>
      </div>
      <div class="pg-pk-act"></div>
      <div class="pg-quick">${QUICK.map((q, i) => `<button data-q="${i}" style="background:${hsvHex(q)}" aria-label="${hsvHex(q)}"></button>`).join('')}</div>`;
    this.cv = this.el.querySelector('.pg-pk-cv')!;
    this.x = this.cv.getContext('2d')!;
    this.loupe = this.el.querySelector('.pg-loupe')!;
    this.lx = this.loupe.getContext('2d')!;
    this.sw = this.el.querySelector('.pg-pk-sw')!;
    this.act = this.el.querySelector('.pg-pk-act')!;
    this.cv.addEventListener('pointerdown', this.down);
    this.cv.addEventListener('pointermove', this.move);
    this.cv.addEventListener('pointerup', this.up);
    this.cv.addEventListener('pointercancel', this.up);
    this.cv.addEventListener('lostpointercapture', this.up);
    this.el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.locked) return;
        tap('light');
        audio.click();
        this.animateTo(QUICK[+b.dataset.q!]);
      }),
    );
    // ajustes finos: toque = 1 passo; segurar = repete
    this.el.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => {
      let rep = 0;
      let to = 0;
      const step = () => this.nudge(b.dataset.n!);
      const stop = () => {
        clearTimeout(to);
        clearInterval(rep);
      };
      b.addEventListener('pointerdown', (e) => {
        if (this.locked) return;
        e.preventDefault();
        tap('light');
        step();
        to = window.setTimeout(() => (rep = window.setInterval(step, 70)), 350);
      });
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointerleave', stop);
      b.addEventListener('pointercancel', stop);
    });
  }

  get hex(): string {
    return hsvHex(this.hsv);
  }

  setLocked(v: boolean): void {
    this.locked = v;
    this.el.classList.toggle('pg-locked', v);
    if (v) this.endDrag();
  }

  set(h: HSV, emit = false): void {
    cancelAnimationFrame(this.tween);
    this.hsv = { h: ((h.h % 360) + 360) % 360, s: clamp01(h.s), v: clamp01(h.v) };
    this.queue();
    if (emit) this.onChange(this.hex);
  }

  /** transição curtinha até a cor da paleta (fica gostoso de ver) */
  private animateTo(to: HSV): void {
    cancelAnimationFrame(this.tween);
    this.touched = true;
    const from = { ...this.hsv };
    let dh = to.h - from.h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    if (to.s === 0) dh = 0;
    const t0 = performance.now();
    const stepFn = () => {
      const k = Math.min(1, (performance.now() - t0) / 160);
      const e = 1 - (1 - k) * (1 - k);
      this.hsv = { h: (from.h + dh * e + 360) % 360, s: from.s + (to.s - from.s) * e, v: from.v + (to.v - from.v) * e };
      this.draw();
      this.onChange(this.hex);
      if (k < 1) this.tween = requestAnimationFrame(stepFn);
    };
    stepFn();
  }

  private nudge(n: string): void {
    this.touched = true;
    const h = { ...this.hsv };
    if (n === 'v+') {
      if (h.v < 0.995) h.v += 0.035;
      else h.s -= 0.035;
    } else if (n === 'v-') h.v -= 0.035;
    else if (n === 's+') h.s += 0.04;
    else if (n === 's-') h.s -= 0.04;
    this.set(h, true);
    audio.tick(Math.round(h.v * 10));
  }

  /** mede o espaço e redesenha (chamar no resize). */
  resize(size: number): void {
    size = Math.max(120, Math.floor(size));
    this.dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    if (size === this.size && this.cv.width === Math.round(size * this.dpr)) return;
    this.size = size;
    this.cv.style.width = this.cv.style.height = size + 'px';
    this.cv.width = this.cv.height = Math.round(size * this.dpr);
    this.ring = null;
    const ls = Math.round(Math.min(110, Math.max(78, size * 0.34)));
    this.loupe.style.width = this.loupe.style.height = ls + 'px';
    this.loupe.width = this.loupe.height = Math.round(ls * this.dpr);
    this.draw();
  }

  private geo() {
    const S = this.size;
    const R = S / 2 - 3;
    const T = Math.max(16, S * 0.12);
    const half = ((R - T - 6) * Math.SQRT2) / 2;
    return { S, c: S / 2, R, T, half };
  }

  private buildRing(): HTMLCanvasElement {
    const { S, c, R, T } = this.geo();
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(S * this.dpr);
    const x = cv.getContext('2d')!;
    x.scale(this.dpr, this.dpr);
    const n = 180;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU - Math.PI / 2;
      const a1 = ((i + 1.6) / n) * TAU - Math.PI / 2;
      x.beginPath();
      x.arc(c, c, R, a0, a1);
      x.arc(c, c, R - T, a1, a0, true);
      x.closePath();
      const [r, g, b] = hsvToRgb({ h: (i / n) * 360, s: 1, v: 1 });
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fill();
    }
    x.lineWidth = 2;
    x.strokeStyle = 'rgba(30,20,50,.55)';
    x.beginPath();
    x.arc(c, c, R, 0, TAU);
    x.stroke();
    x.beginPath();
    x.arc(c, c, R - T, 0, TAU);
    x.stroke();
    return cv;
  }

  private queue(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  draw(): void {
    if (!this.size) return;
    const x = this.x;
    const { c, R, T, half } = this.geo();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!this.ring) this.ring = this.buildRing();
    x.drawImage(this.ring, 0, 0);
    x.scale(this.dpr, this.dpr);
    // quadrado S/V
    const x0 = c - half;
    const y0 = c - half;
    const w = half * 2;
    x.fillStyle = hsvHex({ h: this.hsv.h, s: 1, v: 1 });
    x.fillRect(x0, y0, w, w);
    let g = x.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(x0, y0, w, w);
    g = x.createLinearGradient(0, y0, 0, y0 + w);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, '#000');
    x.fillStyle = g;
    x.fillRect(x0, y0, w, w);
    x.lineWidth = 2;
    x.strokeStyle = 'rgba(30,20,50,.55)';
    x.strokeRect(x0, y0, w, w);
    // marcador do anel
    const a = (this.hsv.h / 360) * TAU - Math.PI / 2;
    const rm = R - T / 2;
    const kr = T * 0.62;
    this.knob(c + Math.cos(a) * rm, c + Math.sin(a) * rm, kr, hsvHex({ h: this.hsv.h, s: 1, v: 1 }), this.drag === 'ring');
    // marcador S/V
    this.knob(x0 + this.hsv.s * w, y0 + (1 - this.hsv.v) * w, Math.max(10, this.size * 0.045), this.hex, this.drag === 'sv');
    this.sw.style.background = this.hex;
  }

  private knob(px: number, py: number, r: number, col: string, active: boolean): void {
    const x = this.x;
    if (active) r *= 1.25;
    x.beginPath();
    x.arc(px, py, r + 2, 0, TAU);
    x.fillStyle = '#2b2140';
    x.fill();
    x.beginPath();
    x.arc(px, py, r, 0, TAU);
    x.fillStyle = '#fff';
    x.fill();
    x.beginPath();
    x.arc(px, py, r - 3, 0, TAU);
    x.fillStyle = col;
    x.fill();
  }

  /* ----------------------------- toque ----------------------------- */
  private local(e: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  private down = (e: PointerEvent) => {
    if (this.locked) return;
    if (this.drag) this.endDrag(); // outro dedo/ponteiro assume (nunca fica preso)
    const [px, py] = this.local(e);
    const { c, R, T, half } = this.geo();
    const d = Math.hypot(px - c, py - c);
    if (d >= R - T - 8 && d <= R + 14) this.drag = 'ring';
    else if (Math.abs(px - c) <= half + 12 && Math.abs(py - c) <= half + 12) this.drag = 'sv';
    else return;
    e.preventDefault();
    this.pid = e.pointerId;
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {
      /* ok */
    }
    this.touched = true;
    cancelAnimationFrame(this.tween);
    tap('light');
    this.apply(px, py);
  };
  private move = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.pid) return;
    e.preventDefault();
    const [px, py] = this.local(e);
    this.apply(px, py);
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    this.endDrag();
  };
  private endDrag(): void {
    if (!this.drag) return;
    try {
      if (this.pid >= 0 && this.cv.hasPointerCapture(this.pid)) this.cv.releasePointerCapture(this.pid);
    } catch {
      /* ok */
    }
    this.drag = null;
    this.pid = -1;
    this.loupe.classList.remove('on');
    this.draw();
  }

  private apply(px: number, py: number): void {
    const { c, half } = this.geo();
    const h = { ...this.hsv };
    if (this.drag === 'ring') {
      h.h = ((Math.atan2(py - c, px - c) + Math.PI / 2 + TAU) % TAU) * (180 / Math.PI);
    } else {
      h.s = clamp01((px - (c - half)) / (half * 2));
      h.v = clamp01(1 - (py - (c - half)) / (half * 2));
    }
    this.hsv = h;
    this.draw();
    this.showLoupe(px, py);
    this.onChange(this.hex);
    const now = performance.now();
    if (now - this.lastTick > 70) {
      this.lastTick = now;
      audio.tick(Math.round((this.drag === 'ring' ? h.h / 36 : h.v * 10) % 24));
    }
  }

  /** lupa: recorte ampliado 3× do canvas, posicionada acima do dedo (ou ao lado, perto da borda) */
  private showLoupe(px: number, py: number): void {
    const L = this.loupe;
    const ls = parseFloat(L.style.width) || 90;
    let lxp = px - ls / 2;
    let lyp = py - ls - 46;
    if (lyp < -ls * 0.6) {
      lyp = py - ls / 2;
      lxp = px < this.size / 2 ? px + 46 : px - ls - 46;
    }
    L.style.transform = `translate(${lxp}px,${lyp}px)`;
    L.classList.add('on');
    const x = this.lx;
    const d = this.dpr;
    const zoom = 3;
    const src = (ls / zoom) * d;
    x.save();
    x.clearRect(0, 0, L.width, L.height);
    x.beginPath();
    x.arc(L.width / 2, L.height / 2, L.width / 2, 0, TAU);
    x.clip();
    x.fillStyle = '#ddd';
    x.fillRect(0, 0, L.width, L.height);
    x.imageSmoothingEnabled = false;
    x.drawImage(this.cv, px * d - src / 2, py * d - src / 2, src, src, 0, 0, L.width, L.height);
    // centro = cor atual (grande), mira
    x.fillStyle = this.hex;
    x.beginPath();
    x.arc(L.width / 2, L.height / 2, L.width * 0.16, 0, TAU);
    x.fill();
    x.lineWidth = 2 * d;
    x.strokeStyle = '#fff';
    x.stroke();
    x.restore();
    L.style.borderColor = this.hex;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.tween);
    this.el.remove();
  }
}
