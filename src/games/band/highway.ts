/* ============================================================
 *  PISTA DE NOTAS em perspectiva + o Bloop que pula nas teclas.
 *  - Base da pista (textura da skin) em cache; só linhas de batida,
 *    notas (sprites em cache) e a linha de acerto são desenhadas por quadro.
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../../game/character';
import type { Skin } from '../../game/skins';
import type { CosItem, LineStyle, NoteShape } from './cosmetics';
import { LANE_CANDY } from './cosmetics';
import type { Instrument, RNote } from './model';
import { J_MISS, J_NONE } from './model';
import { heart, star } from './stage';

const TAU = Math.PI * 2;
const INK = '#2a0b5c';
const K = 2.3;
const QF = 1 / (1 + K);

export class Highway {
  L = 5;
  cx = 0;
  hy = 0;
  fy = 0;
  wb = 0;
  wt = 0;
  dpr = 1;
  look = 1.6; // segundos visíveis
  inst: Instrument = 'guitar';
  hw: CosItem | null = null;
  shape: NoteShape = 'gem';
  line: LineStyle = 'teclas';
  lanes: string[] = LANE_CANDY;
  base: HTMLCanvasElement | null = null;
  glowC: HTMLCanvasElement | null = null;
  /** [lane*3 + variante] variante 0 normal, 1 frase-estrela, 2 modo estrela */
  spr: HTMLCanvasElement[] = [];
  press = new Float32Array(5); // 1 → 0 (anim. de tecla)
  flash = new Float32Array(5); // brilho de acerto
  held = new Uint8Array(5);
  // projeção (saída de proj)
  py = 0;
  phw = 0;

  setup(cx: number, fy: number, hy: number, wb: number, wt: number, L: number, dpr: number, inst: Instrument, hw: CosItem, shape: NoteShape, line: LineStyle): void {
    const changed = cx !== this.cx || fy !== this.fy || hy !== this.hy || wb !== this.wb || L !== this.L || dpr !== this.dpr || hw !== this.hw || shape !== this.shape || inst !== this.inst;
    this.cx = cx;
    this.fy = fy;
    this.hy = hy;
    this.wb = wb;
    this.wt = wt;
    this.L = L;
    this.dpr = dpr;
    this.inst = inst;
    this.hw = hw;
    this.shape = shape;
    this.line = line;
    this.lanes = hw.lanes ?? LANE_CANDY;
    if (changed) {
      this.base = null;
      this.spr.length = 0;
    }
  }

  /** z: 0 = linha de acerto, 1 = horizonte. Saída em this.py / this.phw */
  proj(z: number): void {
    const q = (1 / (1 + K * z) - QF) / (1 - QF);
    this.py = this.fy + (this.hy - this.fy) * q;
    this.phw = (this.wt + (this.wb - this.wt) * q) * 0.5;
  }

  laneX(lane: number, halfW: number): number {
    return this.cx - halfW + ((lane + 0.5) / this.L) * halfW * 2;
  }

  /** lane pela posição x (área de toque = largura na linha de acerto) */
  laneAt(px: number): number {
    const l = Math.floor(((px - (this.cx - this.wb / 2)) / this.wb) * this.L);
    return l < 0 ? 0 : l >= this.L ? this.L - 1 : l;
  }

  /* --------------------------- caches --------------------------- */

  private buildBase(): void {
    const top = Math.floor(this.fy) - 2;
    const bot = Math.ceil(this.hy + (this.hy - this.fy) * 0.2);
    const W = Math.ceil(this.wb * 1.2);
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(W * this.dpr));
    c.height = Math.max(2, Math.round((bot - top) * this.dpr));
    const x = c.getContext('2d')!;
    x.scale(this.dpr, this.dpr);
    x.translate(W / 2 - this.cx, -top);
    const hw = this.hw!;
    const col = hw.c.length >= 3 ? hw.c : ['#1c0b45', '#3a1a7a', '#7b5cff'];
    // trapézio (prolongado um pouco abaixo da linha)
    this.proj(-0.14);
    const by = this.py;
    const bhw = this.phw;
    const path = () => {
      x.beginPath();
      x.moveTo(this.cx - this.wt / 2, this.fy);
      x.lineTo(this.cx + this.wt / 2, this.fy);
      x.lineTo(this.cx + bhw, by);
      x.lineTo(this.cx - bhw, by);
      x.closePath();
    };
    path();
    const g = x.createLinearGradient(0, this.fy, 0, by);
    g.addColorStop(0, col[0]);
    g.addColorStop(1, col[1]);
    x.fillStyle = g;
    x.fill();
    x.save();
    path();
    x.clip();
    this.texture(x, hw.tex ?? 'stripes', col, by);
    // névoa no horizonte
    const fog = x.createLinearGradient(0, this.fy, 0, this.fy + (this.hy - this.fy) * 0.3);
    fog.addColorStop(0, col[0]);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = fog;
    x.fillRect(this.cx - this.wb, this.fy, this.wb * 2, (this.hy - this.fy) * 0.3);
    x.restore();
    // divisórias das lanes
    x.strokeStyle = col[2];
    x.globalAlpha = 0.35;
    x.lineWidth = 1.5;
    for (let i = 1; i < this.L; i++) {
      x.beginPath();
      x.moveTo(this.cx - this.wt / 2 + (i / this.L) * this.wt, this.fy);
      x.lineTo(this.cx - bhw + (i / this.L) * bhw * 2, by);
      x.stroke();
    }
    x.globalAlpha = 1;
    // trilhos laterais
    x.lineWidth = 4;
    x.strokeStyle = INK;
    x.beginPath();
    x.moveTo(this.cx - this.wt / 2, this.fy);
    x.lineTo(this.cx - bhw, by);
    x.moveTo(this.cx + this.wt / 2, this.fy);
    x.lineTo(this.cx + bhw, by);
    x.stroke();
    x.lineWidth = 2;
    x.strokeStyle = col[2];
    x.stroke();
    this.base = c;
    this.baseTop = top;
    this.baseW = W;
    this.baseH = bot - top;
    // brilho do Modo Estrela (bordas)
    const gc = document.createElement('canvas');
    gc.width = c.width;
    gc.height = c.height;
    const gx = gc.getContext('2d')!;
    gx.scale(this.dpr, this.dpr);
    gx.translate(W / 2 - this.cx, -top);
    gx.lineWidth = 16;
    gx.strokeStyle = 'rgba(255,216,74,.35)';
    gx.beginPath();
    gx.moveTo(this.cx - this.wt / 2, this.fy);
    gx.lineTo(this.cx - bhw, by);
    gx.moveTo(this.cx + this.wt / 2, this.fy);
    gx.lineTo(this.cx + bhw, by);
    gx.stroke();
    gx.lineWidth = 6;
    gx.strokeStyle = 'rgba(255,250,200,.8)';
    gx.stroke();
    const sg = gx.createLinearGradient(0, this.fy, 0, by);
    sg.addColorStop(0, 'rgba(94,240,255,0)');
    sg.addColorStop(1, 'rgba(94,240,255,.28)');
    gx.fillStyle = sg;
    gx.beginPath();
    gx.moveTo(this.cx - this.wt / 2, this.fy);
    gx.lineTo(this.cx + this.wt / 2, this.fy);
    gx.lineTo(this.cx + bhw, by);
    gx.lineTo(this.cx - bhw, by);
    gx.fill();
    this.glowC = gc;
  }
  private baseTop = 0;
  private baseW = 0;
  private baseH = 0;

  private texture(x: CanvasRenderingContext2D, tex: string, col: string[], by: number): void {
    const top = this.fy;
    const h = by - top;
    const l = this.cx - this.wb * 0.6;
    const w = this.wb * 1.2;
    switch (tex) {
      case 'wood':
        x.strokeStyle = 'rgba(0,0,0,.22)';
        x.lineWidth = 1.2;
        for (let i = 0; i < 26; i++) {
          const xx = l + (i / 26) * w;
          x.beginPath();
          x.moveTo(xx, top);
          x.bezierCurveTo(xx + 6, top + h * 0.3, xx - 6, top + h * 0.6, xx + 3, by);
          x.stroke();
        }
        break;
      case 'drumhead':
        x.strokeStyle = 'rgba(255,230,190,.12)';
        x.lineWidth = 2;
        for (let i = 1; i < 9; i++) {
          x.beginPath();
          x.ellipse(this.cx, by, (this.wb / 2) * (i / 6), h * (i / 7), 0, Math.PI, TAU);
          x.stroke();
        }
        break;
      case 'keys':
        for (let i = 0; i < this.L; i++) {
          this.proj(1);
          const tx = this.cx - this.wt / 2 + (i / this.L) * this.wt;
          this.proj(-0.14);
          const bx = this.cx - this.phw + (i / this.L) * this.phw * 2;
          const bw2 = (this.phw * 2) / this.L;
          x.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)';
          x.beginPath();
          x.moveTo(tx, top);
          x.lineTo(tx + this.wt / this.L, top);
          x.lineTo(bx + bw2, by);
          x.lineTo(bx, by);
          x.fill();
        }
        break;
      case 'waves':
        x.strokeStyle = 'rgba(94,240,255,.16)';
        x.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const yy = top + (i / 14) * h;
          x.beginPath();
          for (let k = 0; k <= 20; k++) {
            const xx = l + (k / 20) * w;
            const yv = yy + Math.sin(k * 0.9 + i) * 4;
            if (k) x.lineTo(xx, yv);
            else x.moveTo(xx, yv);
          }
          x.stroke();
        }
        break;
      case 'stars': {
        x.fillStyle = 'rgba(255,255,255,.7)';
        let s = 7;
        for (let i = 0; i < 90; i++) {
          s = (s * 16807) % 2147483647;
          const xx = l + (s % 1000) / 1000 * w;
          s = (s * 16807) % 2147483647;
          const yy = top + (s % 1000) / 1000 * h;
          x.fillRect(xx, yy, 1.5, 1.5);
        }
        break;
      }
      case 'grid':
        x.strokeStyle = col[2];
        x.globalAlpha = 0.25;
        x.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
          const yy = top + Math.pow(i / 14, 1.8) * h;
          x.beginPath();
          x.moveTo(l, yy);
          x.lineTo(l + w, yy);
          x.stroke();
        }
        x.globalAlpha = 1;
        break;
      case 'rainbow': {
        const rc = ['#ff4f6a', '#ff8a3d', '#ffd23f', '#9be15d', '#48e5c2', '#4cc9f0', '#a974ff'];
        x.globalAlpha = 0.22;
        for (let i = 0; i < 7; i++) {
          x.fillStyle = rc[i];
          x.fillRect(l + (i / 7) * w, top, w / 7 + 1, h);
        }
        x.globalAlpha = 1;
        break;
      }
      case 'candy':
        x.fillStyle = 'rgba(255,255,255,.18)';
        for (let i = -10; i < 20; i++) {
          x.beginPath();
          x.moveTo(l + i * 28, top);
          x.lineTo(l + i * 28 + 14, top);
          x.lineTo(l + i * 28 + 14 + h * 0.5, by);
          x.lineTo(l + i * 28 + h * 0.5, by);
          x.fill();
        }
        break;
      case 'ice':
        x.strokeStyle = 'rgba(255,255,255,.25)';
        x.lineWidth = 1;
        for (let i = 0; i < 16; i++) {
          const xx = l + ((i * 37) % 100) / 100 * w;
          const yy = top + ((i * 53) % 100) / 100 * h;
          x.beginPath();
          x.moveTo(xx, yy);
          x.lineTo(xx + 20, yy + 14);
          x.lineTo(xx + 8, yy + 30);
          x.stroke();
        }
        break;
      case 'lava':
        x.fillStyle = 'rgba(255,122,46,.18)';
        for (let i = 0; i < 12; i++) {
          x.beginPath();
          x.ellipse(l + ((i * 41) % 100) / 100 * w, top + ((i * 67) % 100) / 100 * h, 18, 8, 0, 0, TAU);
          x.fill();
        }
        break;
      default:
        x.fillStyle = 'rgba(255,255,255,.04)';
        for (let i = 0; i < this.L; i += 2) {
          this.proj(-0.14);
          const bx = this.cx - this.phw + (i / this.L) * this.phw * 2;
          const tx = this.cx - this.wt / 2 + (i / this.L) * this.wt;
          x.beginPath();
          x.moveTo(tx, top);
          x.lineTo(tx + this.wt / this.L, top);
          x.lineTo(bx + (this.phw * 2) / this.L, by);
          x.lineTo(bx, by);
          x.fill();
        }
    }
  }

  private buildSprites(): void {
    const S = Math.round(Math.min(160, (this.wb / this.L) * this.dpr));
    for (let lane = 0; lane < this.L; lane++) {
      for (let v = 0; v < 3; v++) {
        const c = document.createElement('canvas');
        c.width = S;
        c.height = Math.round(S * 0.62);
        const x = c.getContext('2d')!;
        x.translate(S / 2, c.height / 2);
        const col = v === 2 ? (lane % 2 ? '#5ef0ff' : '#ffd84a') : this.lanes[lane % this.lanes.length];
        drawNote(x, this.shape, S * 0.44, col, v === 1, this.inst);
        this.spr.push(c);
      }
    }
  }

  /* --------------------------- quadro --------------------------- */

  draw(x: CanvasRenderingContext2D, songT: number, spb: number, notes: RNote[], first: number, starOn: boolean, now: number, dt: number, glows: boolean): void {
    if (!this.base) this.buildBase();
    if (!this.spr.length) this.buildSprites();
    const top = this.baseTop;
    x.drawImage(this.base!, this.cx - this.baseW / 2, top, this.baseW, this.baseH);
    if (starOn) {
      x.globalAlpha = 0.6 + Math.sin(now * 8) * 0.25;
      x.drawImage(this.glowC!, this.cx - this.baseW / 2, top, this.baseW, this.baseH);
      x.globalAlpha = 1;
    }
    // linhas de batida
    const look = this.look;
    let b = Math.ceil(songT / spb);
    for (; b * spb < songT + look; b++) {
      const z = (b * spb - songT) / look;
      this.proj(z);
      const measure = b % 4 === 0;
      x.fillStyle = measure ? 'rgba(255,255,255,.34)' : 'rgba(255,255,255,.12)';
      const th = (measure ? 3 : 1.5) * (0.4 + 0.6 * (1 - z));
      x.fillRect(this.cx - this.phw, this.py - th / 2, this.phw * 2, th);
    }
    // feixes de lanes seguradas / acertos
    for (let l = 0; l < this.L; l++) {
      const f = this.flash[l];
      if (f <= 0 && !this.held[l]) continue;
      const a = this.held[l] ? 0.32 : f * 0.4;
      this.proj(0.55);
      const tyy = this.py;
      const thw = this.phw;
      this.proj(0);
      x.globalAlpha = a;
      x.fillStyle = this.lanes[l % this.lanes.length];
      x.beginPath();
      x.moveTo(this.laneX(l - 0.45, thw), tyy);
      x.lineTo(this.laneX(l + 0.45, thw) - 0, tyy);
      x.lineTo(this.laneX(l + 0.5, this.phw), this.py);
      x.lineTo(this.laneX(l - 0.5, this.phw), this.py);
      x.fill();
      x.globalAlpha = 1;
      this.flash[l] = Math.max(0, f - dt * 3.5);
    }
    // notas (de trás para frente)
    let last = first;
    while (last < notes.length && notes[last].t < songT + look) last++;
    const vocal = this.inst === 'vocals';
    // linha melódica do vocal
    if (vocal) {
      x.strokeStyle = 'rgba(255,255,255,.35)';
      x.lineWidth = 2;
      x.beginPath();
      let started = false;
      for (let i = first; i < last; i++) {
        const n = notes[i];
        if (n.j !== J_NONE && !n.hold) continue;
        const z = Math.max(0, (n.t - songT) / look);
        this.proj(z);
        const nx = this.laneX(n.lane, this.phw);
        if (started) x.lineTo(nx, this.py);
        else x.moveTo(nx, this.py);
        started = true;
        const ze = Math.min(1, (n.end - songT) / look);
        if (ze > z) {
          this.proj(ze);
          x.lineTo(this.laneX(n.lane, this.phw), this.py);
        }
      }
      x.stroke();
    }
    for (let i = last - 1; i >= first; i--) {
      const n = notes[i];
      const hit = n.j !== J_NONE && n.j !== J_MISS;
      if (hit && !n.hold && n.end - n.t < 0.01) continue;
      const lc = this.lanes[n.lane % this.lanes.length];
      // cauda (nota longa)
      if (n.end > n.t + 0.01 && n.end > songT) {
        const zs = Math.max(0, (Math.max(n.t, hit ? songT : n.t) - songT) / look);
        const ze = Math.min(1, (n.end - songT) / look);
        if (ze > zs && !(hit && !n.hold)) {
          this.proj(zs);
          const y0 = this.py;
          const w0 = (this.phw * 2) / this.L * 0.2;
          const x0 = this.laneX(n.lane, this.phw);
          this.proj(ze);
          const y1 = this.py;
          const w1 = (this.phw * 2) / this.L * 0.2;
          const x1 = this.laneX(n.lane, this.phw);
          x.globalAlpha = n.j === J_MISS ? 0.3 : n.hold ? 1 : 0.8;
          x.fillStyle = starOn ? '#ffd84a' : lc;
          const wob = n.hold ? Math.sin(now * 40) * 2 : 0;
          x.beginPath();
          x.moveTo(x0 - w0 + wob, y0);
          x.lineTo(x1 - w1, y1);
          x.lineTo(x1 + w1, y1);
          x.lineTo(x0 + w0 - wob, y0);
          x.fill();
          x.fillStyle = 'rgba(255,255,255,.5)';
          x.fillRect(x1 - w1 * 0.2, y1, w0 * 0.4, y0 - y1);
          x.globalAlpha = 1;
        }
      }
      if (hit) continue;
      const z = (n.t - songT) / look;
      if (z < -0.12) continue;
      this.proj(z);
      const nw = ((this.phw * 2) / this.L) * 0.9;
      const spr = this.spr[n.lane * 3 + (starOn ? 2 : n.star ? 1 : 0)];
      if (!spr) continue;
      const nh = nw * 0.62;
      x.globalAlpha = n.j === J_MISS ? 0.35 : 1;
      x.drawImage(spr, this.laneX(n.lane, this.phw) - nw / 2, this.py - nh / 2, nw, nh);
    }
    x.globalAlpha = 1;
    this.drawHitLine(x, now, dt, glows);
  }

  private drawHitLine(x: CanvasRenderingContext2D, now: number, dt: number, glows: boolean): void {
    this.proj(0);
    const y = this.py;
    const hw = this.phw;
    const lw = (hw * 2) / this.L;
    const style = this.line;
    if (style === 'raio') {
      x.strokeStyle = '#fff6b0';
      x.lineWidth = 4;
      x.beginPath();
      for (let i = 0; i <= 24; i++) {
        const xx = this.cx - hw + (i / 24) * hw * 2;
        const yy = y + ((i % 2) * 2 - 1) * (3 + Math.sin(now * 20 + i) * 1.5);
        if (i) x.lineTo(xx, yy);
        else x.moveTo(xx, yy);
      }
      x.stroke();
    }
    for (let l = 0; l < this.L; l++) {
      const p = this.press[l];
      const lx = this.laneX(l, hw);
      const c = this.lanes[l % this.lanes.length];
      const dn = p * lw * 0.06;
      switch (style) {
        case 'aneis':
          x.lineWidth = 5;
          x.strokeStyle = INK;
          x.beginPath();
          x.ellipse(lx, y + dn, lw * 0.4, lw * 0.18, 0, 0, TAU);
          x.stroke();
          x.lineWidth = 3;
          x.strokeStyle = c;
          x.stroke();
          if (p > 0) {
            x.globalAlpha = p;
            x.fillStyle = c;
            x.fill();
            x.globalAlpha = 1;
          }
          break;
        case 'nuvem':
          x.fillStyle = p > 0 ? c : '#f4efff';
          x.strokeStyle = INK;
          x.lineWidth = 2;
          x.beginPath();
          x.arc(lx - lw * 0.18, y + dn, lw * 0.16, 0, TAU);
          x.arc(lx + lw * 0.18, y + dn, lw * 0.16, 0, TAU);
          x.arc(lx, y - lw * 0.08 + dn, lw * 0.2, 0, TAU);
          x.fill();
          x.fillStyle = c;
          x.beginPath();
          x.arc(lx, y + dn, lw * 0.08, 0, TAU);
          x.fill();
          break;
        case 'arcade':
          x.fillStyle = INK;
          x.beginPath();
          x.ellipse(lx, y + lw * 0.06, lw * 0.36, lw * 0.17, 0, 0, TAU);
          x.fill();
          x.fillStyle = c;
          x.beginPath();
          x.ellipse(lx, y - lw * 0.02 + dn * 1.6, lw * 0.3, lw * 0.13, 0, 0, TAU);
          x.fill();
          x.fillStyle = 'rgba(255,255,255,.5)';
          x.beginPath();
          x.ellipse(lx - lw * 0.08, y - lw * 0.05 + dn * 1.6, lw * 0.1, lw * 0.04, 0, 0, TAU);
          x.fill();
          break;
        case 'raio':
          x.fillStyle = c;
          x.beginPath();
          x.arc(lx, y + dn, lw * (0.12 + p * 0.06), 0, TAU);
          x.fill();
          break;
        default: {
          // teclas: bloco com face frontal (aperta para baixo)
          const kw = lw * 0.86;
          const kh = lw * 0.2;
          x.fillStyle = INK;
          x.beginPath();
          x.roundRect(lx - kw / 2, y - kh * 0.5 + dn, kw, kh * 1.7, kh * 0.4);
          x.fill();
          x.fillStyle = p > 0 ? '#ffffff' : c;
          x.beginPath();
          x.roundRect(lx - kw / 2 + 2, y - kh * 0.5 + dn + 2, kw - 4, kh - 1, kh * 0.35);
          x.fill();
          x.fillStyle = 'rgba(0,0,0,.25)';
          x.fillRect(lx - kw / 2 + 3, y + kh * 0.55 + dn, kw - 6, kh * 0.45 - dn);
        }
      }
      if (p > 0 && glows) {
        x.globalAlpha = p * 0.6;
        x.fillStyle = c;
        x.beginPath();
        x.ellipse(lx, y, lw * 0.55 * (1.4 - p * 0.4), lw * 0.22, 0, 0, TAU);
        x.fill();
        x.globalAlpha = 1;
      }
      this.press[l] = Math.max(0, p - dt * 5);
    }
  }
}

/* ------------------------- formatos de nota ------------------------- */

export function drawNote(x: CanvasRenderingContext2D, shape: NoteShape, r: number, col: string, starPh: boolean, inst: Instrument): void {
  const ry = r * 0.5;
  x.lineJoin = 'round';
  x.lineWidth = Math.max(2, r * 0.12);
  x.strokeStyle = INK;
  x.fillStyle = col;
  const outlineFill = (): void => {
    x.fill();
    x.stroke();
  };
  switch (shape) {
    case 'pad':
      x.beginPath();
      x.ellipse(0, 0, r, ry, 0, 0, TAU);
      x.fillStyle = '#fff6e8';
      outlineFill();
      x.fillStyle = col;
      x.beginPath();
      x.ellipse(0, 0, r * 0.7, ry * 0.68, 0, 0, TAU);
      x.fill();
      break;
    case 'bar':
      x.beginPath();
      x.roundRect(-r, -ry * 0.55, r * 2, ry * 1.1, ry * 0.4);
      outlineFill();
      break;
    case 'pill':
      x.beginPath();
      x.roundRect(-r * 0.92, -ry * 0.72, r * 1.84, ry * 1.44, ry * 0.72);
      outlineFill();
      break;
    case 'blob':
      x.beginPath();
      x.ellipse(0, 0, r * 0.85, ry * 0.95, 0, 0, TAU);
      outlineFill();
      x.fillStyle = INK;
      x.beginPath();
      x.ellipse(-r * 0.25, -ry * 0.1, r * 0.08, ry * 0.2, 0, 0, TAU);
      x.ellipse(r * 0.25, -ry * 0.1, r * 0.08, ry * 0.2, 0, 0, TAU);
      x.fill();
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, r * 0.06);
      x.beginPath();
      x.arc(0, ry * 0.15, r * 0.14, 0.2, Math.PI - 0.2);
      x.stroke();
      break;
    case 'star':
      x.save();
      x.scale(1, 0.62);
      star(x, 0, 0, r, 0);
      x.stroke();
      x.restore();
      break;
    case 'heart':
      x.save();
      x.scale(1, 0.62);
      heart(x, 0, -r * 0.05, r * 0.72);
      x.stroke();
      x.restore();
      break;
    case 'diamond':
      x.beginPath();
      x.moveTo(-r, 0);
      x.lineTo(-r * 0.5, -ry);
      x.lineTo(r * 0.5, -ry);
      x.lineTo(r, 0);
      x.lineTo(0, ry);
      x.closePath();
      outlineFill();
      break;
    case 'square':
      x.beginPath();
      x.roundRect(-r * 0.75, -ry * 0.85, r * 1.5, ry * 1.7, r * 0.12);
      outlineFill();
      break;
    default:
      // joia: hexágono achatado
      x.beginPath();
      x.moveTo(-r, 0);
      x.lineTo(-r * 0.6, -ry);
      x.lineTo(r * 0.6, -ry);
      x.lineTo(r, 0);
      x.lineTo(r * 0.6, ry);
      x.lineTo(-r * 0.6, ry);
      x.closePath();
      outlineFill();
      x.fillStyle = 'rgba(0,0,0,.2)';
      x.beginPath();
      x.moveTo(-r * 0.92, r * 0.02);
      x.lineTo(r * 0.92, r * 0.02);
      x.lineTo(r * 0.6, ry * 0.92);
      x.lineTo(-r * 0.6, ry * 0.92);
      x.fill();
  }
  // brilho
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.ellipse(-r * 0.3, -ry * 0.38, r * 0.28, ry * 0.18, -0.2, 0, TAU);
  x.fill();
  if (starPh) {
    x.strokeStyle = '#fff';
    x.lineWidth = Math.max(2, r * 0.1);
    x.beginPath();
    x.ellipse(0, 0, r * 1.02, ry * 1.08, 0, 0, TAU);
    x.stroke();
    x.fillStyle = '#fff';
    star(x, 0, 0, r * 0.26, 0);
  }
  void inst;
}

/* ============================================================
 *  HERÓI: o Bloop que pula nas teclas
 * ============================================================ */

export class Hero {
  pos = 2; // lane (float)
  from = 2;
  to = 2;
  h0 = 0; // início do pulo (tempo da música)
  h1 = 0; // pouso
  hopH = 1;
  land = 0; // squash do pouso 1 → 0
  pressT = -9;
  pressLane = 0;
  slide = false;
  slideLane = 0;
  happyT = -9;
  missT = -9;
  blinkT = 2;
  blink = 0;
  pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.3, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };

  reset(lane: number): void {
    this.pos = this.from = this.to = lane;
    this.h0 = this.h1 = -99;
  }

  /** planeja um pulo que pousa exatamente em t1 */
  hop(to: number, t0: number, t1: number): void {
    if (to === this.to && t1 <= this.h1 + 0.001) return;
    this.from = this.pos;
    this.to = to;
    this.h0 = t0;
    this.h1 = Math.max(t0 + 0.06, t1);
    this.hopH = Math.min(1, 0.45 + Math.abs(to - this.from) * 0.22 + (this.h1 - this.h0) * 0.8);
  }

  update(songT: number, dt: number): void {
    if (songT >= this.h1) {
      if (this.pos !== this.to || (songT - this.h1 < dt * 1.5 && this.h1 > 0)) {
        if (this.pos !== this.to || this.land < 0.5) this.land = 1;
      }
      this.pos = this.to;
    } else if (songT > this.h0) {
      const k = (songT - this.h0) / (this.h1 - this.h0);
      const e = k * k * (3 - 2 * k);
      this.pos = this.from + (this.to - this.from) * e;
    }
    this.land = Math.max(0, this.land - dt * 5);
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 1;
      this.blinkT = 2 + Math.random() * 2.5;
    }
    this.blink = Math.max(0, this.blink - dt * 8);
  }

  draw(x: CanvasRenderingContext2D, hw: Highway, skin: Skin, songT: number, now: number): void {
    hw.proj(0);
    const lw = (hw.phw * 2) / hw.L;
    const R = Math.min(lw * 0.36, 34);
    const bx = hw.laneX(this.pos, hw.phw);
    let arc = 0;
    if (songT > this.h0 && songT < this.h1) {
      const k = (songT - this.h0) / (this.h1 - this.h0);
      arc = Math.sin(k * Math.PI) * R * 1.6 * this.hopH;
    }
    const pressK = Math.max(0, 1 - (now - this.pressT) / 0.22);
    const missK = Math.max(0, 1 - (now - this.missT) / 0.6);
    const slide = this.slide;
    // squash/stretch
    let sx = 1;
    let sy = 1;
    if (arc > 0) {
      sx = 0.9;
      sy = 1.12;
    }
    const sq = this.land * 0.32 + (pressK > 0 && Math.abs(this.pressLane - this.pos) < 0.5 ? pressK * 0.18 : 0);
    sx += sq;
    sy -= sq * 0.8;
    const footY = hw.py - lw * 0.08;
    const cy = footY - R * 0.86 * sy - arc;
    // sombra no teclado
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(bx, footY + 2, R * (0.9 - Math.min(0.4, arc / (R * 4))), R * 0.22, 0, 0, TAU);
    x.fill();
    // braço esticado até a tecla (flourish do dedo)
    if (pressK > 0) {
      const tx = hw.laneX(this.pressLane, hw.phw);
      const ty = hw.py - lw * 0.02;
      const side = tx >= bx ? 1 : -1;
      const sxp = bx + side * R * 0.75;
      const syp = cy + R * 0.2;
      const midx = (sxp + tx) / 2;
      const midy = Math.min(syp, ty) - R * 0.6 * pressK;
      x.lineCap = 'round';
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = R * 0.32;
      x.beginPath();
      x.moveTo(sxp, syp);
      x.quadraticCurveTo(midx, midy, tx, ty - R * 0.18 * (1 - pressK));
      x.stroke();
      x.strokeStyle = skin.light;
      x.lineWidth = R * 0.2;
      x.stroke();
      // mãozinha + dedinho
      x.fillStyle = skin.light;
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(tx, ty - R * 0.18 * (1 - pressK), R * 0.2, 0, TAU);
      x.fill();
      x.stroke();
      // estrelinha de impacto
      x.globalAlpha = pressK;
      x.fillStyle = '#fff6b0';
      star(x, tx + side * R * 0.3, ty - R * 0.35, R * 0.22 * (1.4 - pressK * 0.4), now * 4);
      x.globalAlpha = 1;
    }
    // corpo
    const p = this.pose;
    p.t = now;
    p.blink = this.blink;
    p.sx = sx;
    p.sy = sy;
    p.lookX = (this.to - this.pos) * 0.5;
    p.lookY = arc > 0 ? 0.6 : 0.3;
    p.mood = missK > 0 ? 'dead' : now - this.happyT < 0.45 || slide ? 'happy' : 'idle';
    x.save();
    x.translate(bx + (missK > 0 ? Math.sin(now * 60) * R * 0.08 * missK : 0), cy);
    let rot = (this.to - this.pos) * 0.18;
    if (slide) rot = -0.32 + Math.sin(now * 30) * 0.04;
    x.rotate(rot);
    try {
      drawPlayer(x, skin, R, p);
    } catch {
      x.fillStyle = skin.light;
      x.beginPath();
      x.arc(0, 0, R, 0, TAU);
      x.fill();
    }
    x.restore();
    // deslizando na nota longa: linhas de velocidade + faíscas
    if (slide) {
      x.strokeStyle = 'rgba(255,255,255,.75)';
      x.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const yy = cy - R * 0.4 + i * R * 0.4;
        const off = ((now * 6 + i * 0.3) % 1) * R;
        x.beginPath();
        x.moveTo(bx + R * 1.1 + off, yy);
        x.lineTo(bx + R * 1.6 + off, yy);
        x.stroke();
      }
      x.fillStyle = '#fff6b0';
      for (let i = 0; i < 3; i++) {
        const k = (now * 3 + i / 3) % 1;
        x.globalAlpha = 1 - k;
        x.fillRect(bx - R * 0.6 - k * R, footY - k * R * 0.8 - i * 3, 3, 3);
      }
      x.globalAlpha = 1;
    }
    // gotinha de suor ao errar
    if (missK > 0) {
      x.fillStyle = '#7fd8ff';
      x.strokeStyle = INK;
      x.lineWidth = 1.5;
      const dx = bx + R * 0.95;
      const dy = cy - R * 0.6 + (1 - missK) * R * 0.5;
      x.beginPath();
      x.moveTo(dx, dy - R * 0.35);
      x.quadraticCurveTo(dx + R * 0.22, dy, dx, dy + R * 0.1);
      x.quadraticCurveTo(dx - R * 0.22, dy, dx, dy - R * 0.35);
      x.fill();
      x.stroke();
    }
  }
}
