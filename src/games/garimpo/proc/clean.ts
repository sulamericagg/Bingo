/* ============================================================
 *  GARIMPO BRUTO — LIMPEZA DA CALHA (mini-interação, 2D por cima do jogo).
 *  1. levantar a grade de riffles (arrastar para cima);
 *  2. lavar o tapete esfregando (vai-e-vem): o concentrado (areia preta + ouro) desce
 *     para o balde no fim da calha;
 *  3. escolher: bateia (mais ouro, você mesmo) ou mandar para a lavadora (automático).
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { tap } from '../../../core/haptics';
import { speak } from '../../voo/voice';
import { PIC } from './icons';
import { bucketArt, causticTile, flakeSprite, glintSprite, grainSprite, handPath, riverBg, rng } from './panart';

const NG = 260;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class CleanGame {
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private W = 1;
  private H = 1;
  private k = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private dead = false;
  private st = 0;
  private stT = 0;
  private trayY = 0;
  private trayV = 0;
  private down = false;
  private pid = -1;
  private mx = 0;
  private my = 0;
  private y0 = 0;
  private idle = 0;
  private energy = 0;
  private gx = new Float32Array(NG);
  private gy = new Float32Array(NG);
  private gs = new Uint8Array(NG);
  private gt = new Uint8Array(NG);
  private gf = new Float32Array(NG);
  private prog = 0;
  private hand = handPath();
  private black: HTMLCanvasElement[] = [];
  private flake: HTMLCanvasElement[] = [];
  private glint!: HTMLCanvasElement;
  private bucket!: HTMLCanvasElement;
  private caus!: HTMLCanvasElement;
  private bg!: HTMLCanvasElement;
  private swT = 0;
  /* layout: calha */
  private x0 = 0;
  private x1 = 0;
  private cy = 0;
  private hh = 0;
  private bx = 0;
  private by = 0;
  private bR = 0;

  constructor(
    root: HTMLElement,
    private grams: number,
    private tier: number,
    private done: (choice: 'pan' | 'plant' | 'cancel') => void,
  ) {
    const el = document.createElement('div');
    el.className = 'gbp-pan gbp-clean';
    el.setAttribute('data-touch-ignore', '');
    el.innerHTML = `<canvas></canvas><div class="gbp-ptop"><button class="gbp-b gbp-x">${PIC.close}</button></div>
      <div class="gbp-choice" hidden><button class="gbp-b go" data-c="pan">${PIC.pan}</button><button class="gbp-b" data-c="plant">${PIC.toPlant}</button></div>`;
    root.appendChild(el);
    this.el = el;
    this.cv = el.querySelector('canvas')!;
    this.x = this.cv.getContext('2d', { alpha: false })!;
    el.querySelector('.gbp-x')!.addEventListener('click', () => this.end(this.st >= 2 ? 'plant' : 'cancel'));
    el.querySelector('.gbp-choice')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (b) this.end(b.dataset.c as 'pan' | 'plant');
    });
    this.cv.addEventListener('pointerdown', this.pDown);
    this.cv.addEventListener('pointermove', this.pMove);
    this.cv.addEventListener('pointerup', this.pUp);
    this.cv.addEventListener('pointercancel', this.pUp);
    window.addEventListener('resize', this.layout);
    const r = rng(31337);
    for (let i = 0; i < 3; i++) this.black.push(grainSprite(5 + r() * 2, [30 + r() * 12, 30 + r() * 12, 36 + r() * 12], 0.9));
    for (let i = 0; i < 5; i++) this.flake.push(flakeSprite(r, 7 + r() * 4));
    this.glint = glintSprite(30);
    this.caus = causticTile(256, r);
    this.layout();
    // concentrado preso atrás dos riffles (mais na cabeça)
    const nGold = clamp(Math.round(6 + grams * 4), 6, 40);
    for (let i = 0; i < NG; i++) {
      const rib = Math.floor((r() * r()) * 10);
      // concentrado fica no remanso logo atrás de cada riffle
      this.gx[i] = 0.06 + rib * 0.09 + 0.05 - r() * r() * 0.045;
      this.gy[i] = (r() - 0.5) * 0.86;
      this.gt[i] = i < nGold ? 1 : 0;
      this.gs[i] = (r() * 5) | 0;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    speak(t('gb.clean.v.lift', 'Levante a grade da calha!'), { gap: 600 });
  }

  private layout = (): void => {
    const W = this.el.clientWidth || window.innerWidth;
    const H = this.el.clientHeight || window.innerHeight;
    this.k = Math.min(window.devicePixelRatio || 1, this.tier >= 2 ? 1.5 : 1);
    this.W = W;
    this.H = H;
    this.cv.width = Math.round(W * this.k);
    this.cv.height = Math.round(H * this.k);
    this.x0 = W * 0.08;
    this.x1 = W * 0.76;
    this.cy = H * 0.46;
    this.hh = H * 0.36;
    this.bR = H * 0.17;
    this.bx = W * 0.87;
    this.by = H * 0.66;
    this.bucket = bucketArt(this.bR, '#3b6f86');
    this.bg = riverBg(W, H, rng(99));
    // calha e barra de riffle pré-desenhadas (nada de gradiente por quadro)
    const L = this.x1 - this.x0;
    const hh = this.hh;
    const tr = document.createElement('canvas');
    tr.width = Math.ceil(L + 30);
    tr.height = Math.ceil(hh + 40);
    const x = tr.getContext('2d')!;
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fillRect(16, 22, L, hh);
    const g = x.createLinearGradient(0, 0, 0, hh + 24);
    g.addColorStop(0, '#dfe5ea');
    g.addColorStop(0.5, '#8d979f');
    g.addColorStop(1, '#c7cfd6');
    x.fillStyle = g;
    x.fillRect(0, 0, L + 16, hh + 24);
    x.fillStyle = '#2f6b3a';
    x.fillRect(8, 12, L, hh);
    x.strokeStyle = 'rgba(20,50,25,.6)';
    x.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const px = 8 + ((i + 0.5) / 46) * L;
      x.beginPath();
      x.moveTo(px, 12);
      x.lineTo(px, 12 + hh);
      x.stroke();
    }
    this.trough = tr;
    const bar = document.createElement('canvas');
    bar.width = 10;
    bar.height = Math.ceil(hh);
    const y = bar.getContext('2d')!;
    const rg = y.createLinearGradient(0, 0, 10, 0);
    rg.addColorStop(0, '#f2f5f7');
    rg.addColorStop(1, '#5d666e');
    y.fillStyle = rg;
    y.fillRect(0, 0, 10, hh);
    this.bar = bar;
  };
  private trough!: HTMLCanvasElement;
  private bar!: HTMLCanvasElement;

  private loop = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.stT += dt;
    if (!this.down) this.idle += dt;
    this.step(dt);
    this.draw();
  };

  private step(dt: number): void {
    if (this.st === 0) {
      if (!this.down) {
        this.trayV += (-this.trayY * 50 - this.trayV * 8) * dt;
        this.trayY += this.trayV * dt;
      }
    } else if (this.st === 1) {
      // bandeja voa embora
      this.trayY += (this.H * 2 - this.trayY) * Math.min(1, dt * 4);
      this.energy *= Math.exp(-dt * 3);
      let inB = 0;
      for (let i = 0; i < NG; i++) {
        if (this.gf[i] >= 1) {
          inB++;
          continue;
        }
        if (this.gf[i] > 0) {
          this.gf[i] = Math.min(1, this.gf[i] + dt * 2.5);
          continue;
        }
        // água leva para a cauda com a esfregada (ouro é mais preguiçoso)
        const sp = this.energy * (this.gt[i] ? 0.55 : 1) * (0.6 + ((i * 7) % 5) * 0.12);
        this.gx[i] += sp * dt * 0.5;
        this.gy[i] *= 1 - dt * sp * 0.6;
        if (this.gx[i] >= 1) this.gf[i] = 0.01;
      }
      this.prog = inB / NG;
      if (this.prog > 0.97) {
        for (let i = 0; i < NG; i++) this.gf[i] = 1;
        this.st = 2;
        this.stT = 0;
        sfx.ding();
        (this.el.querySelector('.gbp-choice') as HTMLElement).hidden = false;
        speak(t('gb.clean.v.choose', 'Bateia ou lavadora?'), { gap: 600 });
      }
      this.swT -= dt;
      if (this.energy > 0.4 && this.swT <= 0) {
        this.swT = 0.25;
        sfx.water();
      }
    }
  }

  private pDown = (e: PointerEvent): void => {
    if (this.pid >= 0) return;
    this.pid = e.pointerId;
    this.cv.setPointerCapture?.(e.pointerId);
    const b = this.cv.getBoundingClientRect();
    this.mx = e.clientX - b.left;
    this.my = e.clientY - b.top;
    this.y0 = this.my;
    this.down = true;
    this.idle = 0;
  };
  private pMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid) return;
    const b = this.cv.getBoundingClientRect();
    const nx = e.clientX - b.left;
    const ny = e.clientY - b.top;
    const dx = nx - this.mx;
    this.mx = nx;
    this.my = ny;
    this.idle = 0;
    if (this.st === 0) this.trayY = Math.max(0, this.y0 - ny);
    else if (this.st === 1) this.energy = Math.min(3, this.energy + (Math.abs(dx) / this.W) * 2.6);
  };
  private pUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid) return;
    this.pid = -1;
    this.down = false;
    if (this.st === 0 && this.trayY > this.hh * 0.45) {
      this.st = 1;
      this.stT = 0;
      sfx.thunk();
      tap('medium');
      speak(t('gb.clean.v.rinse', 'Esfregue o tapete! O ouro desce para o balde.'), { gap: 600 });
    }
  };

  private draw(): void {
    const x = this.x;
    const W = this.W;
    const H = this.H;
    x.setTransform(this.k, 0, 0, this.k, 0, 0);
    // beira do rio (a calha está na correnteza rasa)
    x.drawImage(this.bg, 0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = 0.06;
    const o = (this.time * 30) % 256;
    for (let yy = -256; yy < H; yy += 256) for (let xx = o - 256; xx < W; xx += 256) x.drawImage(this.caus, xx, yy);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    const x0 = this.x0;
    const x1 = this.x1;
    const cy = this.cy;
    const hh = this.hh;
    // calha (chapa + tapete)
    x.drawImage(this.trough, x0 - 8, cy - hh / 2 - 12);
    // concentrado
    const L = x1 - x0;
    for (let i = 0; i < NG; i++) {
      if (this.gf[i] > 0) continue;
      const sx = x0 + this.gx[i] * L;
      const sy = cy + this.gy[i] * hh * 0.5;
      const sp = this.gt[i] ? this.flake[this.gs[i] % 5] : this.black[this.gs[i] % 3];
      x.drawImage(sp, sx - sp.width / 2, sy - sp.height / 2);
    }
    // água correndo
    x.globalAlpha = 0.22 + this.energy * 0.08;
    x.fillStyle = '#9ad8ff';
    x.fillRect(x0, cy - hh / 2, L, hh);
    x.globalAlpha = 0.4;
    x.strokeStyle = '#ffffff';
    x.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const u = (this.time * (0.35 + this.energy * 0.2) + i * 0.137) % 1;
      const yy = cy + (((i * 0.383) % 1) - 0.5) * hh * 0.9;
      x.beginPath();
      x.moveTo(x0 + u * L, yy);
      x.lineTo(x0 + u * L + 22, yy);
      x.stroke();
    }
    x.globalAlpha = 1;
    // brilhos do ouro
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NG; i++) {
      if (!this.gt[i] || this.gf[i] > 0) continue;
      const a = Math.max(0, Math.sin(this.time * 4 + i * 2.3)) ** 6;
      if (a < 0.05) continue;
      x.globalAlpha = a;
      x.drawImage(this.glint, x0 + this.gx[i] * L - 15, cy + this.gy[i] * hh * 0.5 - 15);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    // balde
    const b = this.bucket;
    x.drawImage(b, this.bx - b.width / 2, this.by - b.height / 2);
    // concentrado caindo / no balde
    for (let i = 0; i < NG; i++) {
      const f = this.gf[i];
      if (f <= 0) continue;
      const sx0 = x1;
      const sy0 = cy + this.gy[i] * hh * 0.5;
      const ex = this.bx + Math.sin(i * 7.1) * this.bR * 0.5;
      const ey = this.by + Math.cos(i * 3.7) * this.bR * 0.5;
      const sx = sx0 + (ex - sx0) * f;
      const sy = sy0 + (ey - sy0) * f;
      const sp = this.gt[i] ? this.flake[this.gs[i] % 5] : this.black[this.gs[i] % 3];
      x.drawImage(sp, sx - sp.width / 2, sy - sp.height / 2);
    }
    // grade de riffles (bandeja)
    if (this.trayY < H * 1.5) {
      const ty = -this.trayY;
      x.fillStyle = 'rgba(0,0,0,.3)';
      for (let i = 0; i < 10; i++) {
        const px = x0 + 0.06 * L + i * 0.09 * L + 0.05 * L;
        x.fillRect(px + 6, cy - hh / 2 + ty + 8, 10, hh);
      }
      for (let i = 0; i < 10; i++) {
        const px = x0 + 0.06 * L + i * 0.09 * L + 0.05 * L;
        x.drawImage(this.bar, px, cy - hh / 2 + ty);
      }
      x.fillStyle = '#4d5257';
      x.fillRect(x0, cy - hh / 2 - 6 + ty, L, 8);
      x.fillRect(x0, cy + hh / 2 - 2 + ty, L, 8);
    }
    // progresso
    if (this.st === 1) {
      x.strokeStyle = 'rgba(0,0,0,.35)';
      x.lineWidth = 9;
      x.beginPath();
      x.arc(this.bx, this.by, this.bR + 10, 0, Math.PI * 2);
      x.stroke();
      x.strokeStyle = '#ffd23a';
      x.lineWidth = 6;
      x.lineCap = 'round';
      x.beginPath();
      x.arc(this.bx, this.by, this.bR + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.prog);
      x.stroke();
    }
    // gramas no balde
    if (this.st === 2) {
      x.font = '900 30px Fredoka, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 6;
      x.strokeStyle = '#5a2c00';
      const txt = '≈ ' + (this.grams < 10 ? this.grams.toFixed(1).replace('.', ',') : Math.round(this.grams)) + ' g';
      x.strokeText(txt, this.bx, this.by - this.bR - 26);
      x.fillStyle = '#ffd23a';
      x.fillText(txt, this.bx, this.by - this.bR - 26);
    }
    // mão
    if (this.idle > 0.6 && this.st < 2) {
      const T = this.time;
      let hx: number;
      let hy: number;
      if (this.st === 0) {
        const f = (T * 0.8) % 1;
        hx = (x0 + x1) / 2;
        hy = cy + hh * 0.2 - f * hh * 0.6;
      } else {
        hx = (x0 + x1) / 2 + Math.sin(T * 6) * L * 0.25;
        hy = cy + hh * 0.1;
      }
      x.save();
      x.translate(hx, hy);
      const s = (Math.min(W, H) / 390) * 0.95;
      x.scale(s, s);
      x.rotate(-0.35);
      x.fillStyle = '#fff3e0';
      x.strokeStyle = '#4a2a10';
      x.lineWidth = 3;
      x.fill(this.hand);
      x.stroke(this.hand);
      x.restore();
    }
  }

  private end(c: 'pan' | 'plant' | 'cancel'): void {
    if (this.dead) return;
    sfx.click();
    this.dispose();
    this.done(c);
  }
  /** testes */
  info(): Record<string, number> {
    return { st: this.st, prog: this.prog, tray: this.trayY };
  }
  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.layout);
    this.el.remove();
  }
}
