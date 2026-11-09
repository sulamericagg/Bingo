/* ============================================================
 *  FÁBRICA ESTELAR — renderizador do mundo (lotes, máquinas, estrelas,
 *  personagens, partículas). Usado pela partida e pela Minha Fábrica.
 * ============================================================ */
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { fmt, t } from '../../i18n';
import { BELT_SPEED, COFRE, ITEMS, LINE_ROW, PLOT_H, PLOT_W, TURBO_INDEX } from './data';
import { BELT_ITEM, HELPER_ITEM, PAD_POS, stars, UPG_ITEM, type Plot, type SimFx } from './sim';
import { BELT_FRAMES, buildFloor, buildSky, charSprite, getSheet, ISLAND_DEPTH, ISLAND_PAD, rr, INK, STAR_TIERS, type Sheet } from './sprites';
import { drawLight, drawSoftShadow } from '../../gfx/light';

const COST_LABEL: string[] = [];
const FREE = () => t('tycoon.free', 'Grátis');
export function fmtShort(n: number): string {
  n = Math.floor(n);
  if (n < 10000) return fmt(n);
  if (n < 1e6) return (Math.floor(n / 100) / 10).toString().replace('.', ',') + 'k';
  return (Math.floor(n / 1e5) / 10).toString().replace('.', ',') + 'M';
}

const easeBack = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/* ordem de desenho dentro do lote */
function sortY(i: number): number {
  const it = ITEMS[i];
  switch (it.kind) {
    case 'belt':
      return it.y + 0.8;
    case 'dropper':
      return it.y + 1.05;
    case 'upgrader':
      return it.y + 0.85;
    case 'helper':
      return it.y + 0.6;
    case 'deco':
      return 1.3;
    case 'turbo':
      return 1.6;
  }
}
const ORDER: number[] = ITEMS.map((_, i) => i).sort((a, b) => sortY(a) - sortY(b));
const ORDER_Y = ORDER.map(sortY);
const COFRE_Y = 9.4;

/* ------------------------------ partículas ------------------------------ */
const PMAX = 160;
const P = {
  n: 0,
  x: new Float32Array(PMAX),
  y: new Float32Array(PMAX),
  vx: new Float32Array(PMAX),
  vy: new Float32Array(PMAX),
  life: new Float32Array(PMAX),
  max: new Float32Array(PMAX),
  kind: new Uint8Array(PMAX), // 0 puff, 1 spark, 2 confetti, 3 zap
  c: new Uint8Array(PMAX),
};
const TMAX = 14;
const FT = {
  x: new Float32Array(TMAX),
  y: new Float32Array(TMAX),
  life: new Float32Array(TMAX),
  s: new Array<string>(TMAX).fill(''),
  col: new Array<string>(TMAX).fill('#fff'),
  head: 0,
};

export interface ViewOpts {
  glows: boolean;
  budget: number; // 0..1
  /** leitura ao vivo das flags de luz (segue o governor) */
  fx?: () => { dynLights: boolean; softShadows: boolean };
}

const STAR_RGB = STAR_TIERS.map((h) => {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
});

export class FactoryView implements SimFx {
  ctx: CanvasRenderingContext2D;
  W = 1;
  H = 1;
  dpr = 1;
  S = 40; // px de canvas por tile em zoom 1
  sh!: Sheet;
  floors: HTMLCanvasElement[] = [];
  sky: HTMLCanvasElement | null = null;
  camX = 4;
  camY = 5;
  zoom = 1;
  time = 0;
  shake = 0;
  launchT = new Float32Array(4).fill(-1);
  /** índice do lote do jogador (recebe sons/vibração) */
  me = 0;
  showPrices = true;
  /** botões de compra (desligado na Minha Fábrica) */
  drawPads = true;
  private bankN = [-1, -1, -1, -1];
  private bankS = ['', '', '', ''];

  constructor(
    public canvas: HTMLCanvasElement,
    public opts: ViewOpts,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** baseTiles = quantos tiles cabem na largura com zoom 1 */
  resize(cssW: number, cssH: number, dprCap: number, baseTiles: number, plots: Plot[]): void {
    this.dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    this.W = Math.round(cssW * this.dpr);
    this.H = Math.round(cssH * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    const S = Math.round(Math.min(this.W / baseTiles, this.H / 9));
    if (S !== this.S || !this.sh || this.floors.length !== plots.length) {
      this.S = S;
      this.sh = getSheet(S, this.opts.glows);
      this.floors = plots.map((p) => buildFloor(S, p.color, p.name));
    }
    this.sky = buildSky(this.W, this.H, S);
  }

  rebuildFloors(plots: Plot[]): void {
    this.floors = plots.map((p) => buildFloor(this.S, p.color, p.name));
  }

  /** tela (css px) -> mundo (tiles) */
  toWorld(cssX: number, cssY: number): { x: number; y: number } {
    const k = this.zoom;
    const px = cssX * this.dpr;
    const py = cssY * this.dpr;
    return { x: (px - this.W / 2) / (this.S * k) + this.camX, y: (py - this.H / 2) / (this.S * k) + this.camY };
  }

  /* ------------------------------ efeitos ------------------------------ */
  private emit(kind: number, x: number, y: number, vx: number, vy: number, life: number, c = 0): void {
    if (P.n >= PMAX) return;
    const i = P.n++;
    P.kind[i] = kind;
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = vx;
    P.vy[i] = vy;
    P.life[i] = life;
    P.max[i] = life;
    P.c[i] = c;
  }
  burst(kind: number, wx: number, wy: number, n: number, spd: number, life: number): void {
    n = Math.max(1, Math.round(n * this.opts.budget));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.4 + Math.random() * 0.6);
      this.emit(kind, wx, wy, Math.cos(a) * s, Math.sin(a) * s - (kind === 2 ? 2 : 0), life * (0.6 + Math.random() * 0.4), (Math.random() * 5) | 0);
    }
  }
  text(wx: number, wy: number, s: string, col = '#ffd84a'): void {
    const i = FT.head;
    FT.head = (FT.head + 1) % TMAX;
    FT.x[i] = wx;
    FT.y[i] = wy;
    FT.life[i] = 1.2;
    FT.s[i] = s;
    FT.col[i] = col;
  }
  confetti(wx: number, wy: number, n = 40): void {
    this.burst(2, wx, wy, n, 5, 2.2);
  }

  built(p: Plot, i: number): void {
    const it = ITEMS[i];
    const c = PAD_POS[i];
    this.burst(0, p.ox + c.x, p.oy + c.y, 10, 2.2, 0.5);
    this.burst(1, p.ox + c.x, p.oy + c.y - 0.4, 8, 3, 0.7);
    if (i === TURBO_INDEX) this.launchT[p.idx] = this.time;
    if (p.idx !== this.me) return;
    if (it.kind === 'belt' || it.kind === 'turbo') audio.unlock2();
    else audio.perfect(2);
    tap('medium');
  }
  collected(p: Plot, amount: number): void {
    this.text(p.ox + COFRE.x, p.oy + COFRE.y - 0.9, '+' + fmtShort(amount));
    if (p.idx === this.me) {
      audio.coin(Math.min(8, Math.log2(amount + 1) | 0));
      tap('light');
      this.burst(1, p.ox + COFRE.x, p.oy + COFRE.y - 0.3, 6, 2.5, 0.6);
    }
  }
  dropped(): void {}
  zapped(p: Plot, line: number, k: number): void {
    if (this.opts.budget < 0.5) return;
    this.emit(3, p.ox + 4.5 + k, p.oy + LINE_ROW[line] + 0.3, 0, -0.6, 0.25);
  }
  delivered(): void {}

  /* ------------------------------ desenho ------------------------------ */

  draw(plots: Plot[], dt: number, now: number): void {
    const x = this.ctx;
    const S = this.S;
    this.time += dt;
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (this.sky) x.drawImage(this.sky, 0, 0);
    else {
      x.fillStyle = '#20104a';
      x.fillRect(0, 0, this.W, this.H);
    }
    const k = this.zoom;
    let sx = 0,
      sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      sx = (Math.random() - 0.5) * this.shake * S * 0.2;
      sy = (Math.random() - 0.5) * this.shake * S * 0.2;
    }
    const tx = Math.round(this.W / 2 - this.camX * S * k + sx);
    const ty = Math.round(this.H / 2 - this.camY * S * k + sy);
    x.setTransform(k, 0, 0, k, tx, ty);
    // retângulo visível em tiles
    const vx0 = this.camX - this.W / 2 / (S * k) - 1;
    const vx1 = this.camX + this.W / 2 / (S * k) + 1;
    const vy0 = this.camY - this.H / 2 / (S * k) - 3;
    const vy1 = this.camY + this.H / 2 / (S * k) + 1;
    for (let pi = 0; pi < plots.length; pi++) {
      const p = plots[pi];
      if (p.ox + PLOT_W < vx0 || p.ox > vx1 || p.oy + PLOT_H + ISLAND_DEPTH < vy0 || p.oy > vy1) continue;
      this.drawPlot(p, now);
    }
    this.drawParticles(dt);
  }

  private drawPlot(p: Plot, now: number): void {
    const x = this.ctx;
    const S = this.S;
    const sh = this.sh;
    const ox = p.ox * S;
    const oy = p.oy * S;
    const fl = this.floors[p.idx];
    if (fl) x.drawImage(fl, ox - ISLAND_PAD * S, oy - ISLAND_PAD * S);
    // tubo dourado dos coletores até o cofre
    let lowest = -1;
    for (let l = 0; l < 3; l++) if (p.built[BELT_ITEM[l]]) lowest = l;
    if (lowest >= 0) {
      const tx0 = ox + 6.62 * S;
      const top = oy + (LINE_ROW[0] + 0.9) * S;
      const bot = oy + (COFRE.y - 0.1) * S;
      x.fillStyle = INK;
      rr(x, tx0 - S * 0.17, top, S * 0.34, bot - top, S * 0.12);
      x.fill();
      x.fillStyle = '#ffcf2e';
      rr(x, tx0 - S * 0.11, top + S * 0.05, S * 0.22, bot - top - S * 0.1, S * 0.08);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.5)';
      x.fillRect(tx0 - S * 0.07, top + S * 0.1, S * 0.05, bot - top - S * 0.2);
    }
    let charDrawn = false;
    let cofreDrawn = false;
    for (let o = 0; o < ORDER.length; o++) {
      const sy = ORDER_Y[o];
      if (!charDrawn && p.cy < sy) {
        this.drawChar(p);
        charDrawn = true;
      }
      if (!cofreDrawn && COFRE_Y < sy) {
        this.drawCofre(p);
        cofreDrawn = true;
      }
      const i = ORDER[o];
      const it = ITEMS[i];
      if (p.built[i]) {
        const age = now - p.builtAt[i];
        const pop = age < 0.45 ? easeBack(Math.max(0.01, age / 0.45)) : 1;
        switch (it.kind) {
          case 'belt':
            this.drawLine(p, it.line, pop, now);
            break;
          case 'dropper': {
            const s = it.line * 3 + it.x - 1;
            const q = p.squash[s];
            const img = sh.dropper[it.line];
            const w = img.width * pop * (1 + q * 0.1);
            const h = img.height * pop * (1 - q * 0.12);
            x.drawImage(img, ox + (it.x + 0.5) * S - w / 2, oy + (it.y + 1.15) * S - h, w, h);
            break;
          }
          case 'helper':
            if (it.v === 0) {
              const img = sh.dock;
              x.drawImage(img, ox + (it.x + 0.5) * S - img.width / 2, oy + (it.y + 0.75) * S - img.height);
            } else {
              const img = sh.booster;
              const w = img.width * pop;
              const h = img.height * pop * (1 + Math.sin(this.time * 8) * 0.03);
              x.drawImage(img, ox + (it.x + 0.5) * S - w / 2, oy + (it.y + 0.95) * S - h, w, h);
            }
            break;
          case 'deco': {
            const img = it.v === 0 ? sh.garden : sh.fountain;
            const w = img.width * pop;
            const h = img.height * pop;
            x.drawImage(img, ox + (it.x + 0.5) * S - w / 2, oy + 1.5 * S - h, w, h);
            break;
          }
          case 'turbo':
            this.drawRocket(p, true);
            break;
          default:
            break; // polidores são desenhados com a esteira
        }
      } else if (it.kind === 'turbo') {
        this.drawRocket(p, false);
        if (this.drawPads && p.available(i)) this.drawPad(p, i);
      } else if (this.drawPads && p.available(i)) this.drawPad(p, i);
    }
    if (!cofreDrawn) this.drawCofre(p);
    if (!charDrawn) this.drawChar(p);
    // drone ajudante (voa por cima de tudo)
    if (p.built[HELPER_ITEM[0]]) {
      const img = sh.drone;
      const f = p.helperFly;
      const ph = f > 0 ? Math.sin((1 - f) * Math.PI) : 0;
      const dx = 1.5 + (COFRE.x - 1.5) * ph;
      const dy = 7.9 + (COFRE.y - 0.8 - 7.9) * ph - 0.5 + Math.sin(this.time * 3) * 0.12;
      x.drawImage(img, ox + dx * S - img.width / 2, oy + dy * S - img.height / 2);
    }
  }

  private drawLine(p: Plot, l: number, pop: number, now: number): void {
    const x = this.ctx;
    const S = this.S;
    const sh = this.sh;
    const ox = p.ox * S;
    const oy = p.oy * S;
    const row = LINE_ROW[l];
    const f = (Math.floor(Math.max(0, this.time) * (BELT_SPEED / 0.5) * BELT_FRAMES) % BELT_FRAMES) | 0;
    const belt = sh.belt[f];
    const by = oy + (row + 0.5) * S - S * 0.36;
    if (pop < 1) {
      x.save();
      x.globalAlpha = Math.min(1, pop);
      x.drawImage(belt, ox + 1 * S - 2, by, belt.width * Math.min(1, pop), belt.height);
      x.restore();
    } else x.drawImage(belt, ox + 1 * S - 2, by);
    // coletor
    const col = sh.collector[l];
    const cf = p.colFlash[l];
    const cw = col.width * (1 + cf * 0.06);
    const chh = col.height * (1 - cf * 0.05);
    const fx = this.opts.fx?.();
    if (fx?.softShadows) drawSoftShadow(x, ox + 6.6 * S, oy + (row + 1.0) * S - S * 0.04, cw * 0.46, S * 0.12, 0.35, true);
    x.drawImage(col, ox + 6.6 * S - cw / 2, oy + (row + 1.0) * S - chh, cw, chh);
    // estrelas desta linha
    const glows = this.opts.glows;
    const yy = oy + (row + 0.42) * S;
    const lit = !!fx?.dynLights;
    for (let i = 0; i < stars.n; i++) {
      if (stars.plot[i] !== p.idx || stars.line[i] !== l) continue;
      const tier = stars.tier[i];
      const img = glows && tier >= 1 ? sh.starGlow[tier] : sh.star[tier];
      const sxp = ox + stars.x[i] * S;
      const bob = Math.sin(stars.spin[i]) * S * 0.04;
      // a estrela ilumina a esteira embaixo dela (poça de luz achatada)
      if (lit) drawLight(x, STAR_RGB[tier], sxp, yy + S * 0.36, S * (0.55 + tier * 0.06), 0.55, 0.38);
      x.drawImage(img, sxp - img.width / 2, yy - img.height / 2 + bob);
    }
    // polidores
    for (let k = 0; k < 2; k++) {
      const ui = UPG_ITEM[l * 2 + k];
      if (!p.built[ui]) continue;
      const age = now - p.builtAt[ui];
      const pp = age < 0.45 ? easeBack(Math.max(0.01, age / 0.45)) : 1;
      const img = sh.upgrader;
      const cx = ox + (4.5 + k) * S;
      const z = p.zap[l * 2 + k];
      if (z > 0) {
        const g = sh.upgGlow;
        x.globalAlpha = z;
        x.drawImage(g, cx - g.width / 2, oy + (row + 0.3) * S - g.height / 2);
        x.globalAlpha = 1;
      }
      const w = img.width * pp;
      const h = img.height * pp;
      if (fx?.softShadows) drawSoftShadow(x, cx, oy + (row + 0.95) * S - S * 0.03, w * 0.42, S * 0.1, 0.3 * pp, true);
      x.drawImage(img, cx - w / 2, oy + (row + 0.95) * S - h, w, h);
    }
  }

  private drawPad(p: Plot, i: number): void {
    const x = this.ctx;
    const S = this.S;
    const sh = this.sh;
    const it = ITEMS[i];
    const c = PAD_POS[i];
    const ok = p.wallet >= it.cost;
    const img = it.kind === 'turbo' ? sh.padTurbo : ok ? sh.padOn : sh.padOff;
    const px = (p.ox + c.x) * S;
    const py = (p.oy + c.y) * S;
    const bounce = ok ? Math.abs(Math.sin(this.time * 4 + i)) * S * 0.05 : 0;
    x.drawImage(img, px - img.width / 2, py - img.height * 0.55 - bounce);
    const ic = sh.padIcon[it.kind];
    x.drawImage(ic, px - ic.width / 2, py - img.height * 0.5 - ic.height * 0.32 - bounce);
    // progresso de compra
    if (p.padItem === i && p.padHold > 0) {
      x.strokeStyle = '#ffffff';
      x.lineWidth = S * 0.08;
      x.beginPath();
      x.arc(px, py - S * 0.1, S * 0.5, -Math.PI / 2, -Math.PI / 2 + (p.padHold / 0.3) * Math.PI * 2);
      x.stroke();
    }
    if (!this.showPrices && p.idx !== this.me) return;
    const label = COST_LABEL[i] || (COST_LABEL[i] = it.cost === 0 ? FREE() : fmtShort(it.cost));
    x.font = `700 ${Math.round(S * 0.27)}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = S * 0.08;
    x.strokeStyle = INK;
    x.lineJoin = 'round';
    const ty = py + S * 0.3;
    x.strokeText(label, px + S * 0.1, ty);
    x.fillStyle = ok ? '#fff36b' : '#e8e2ff';
    x.fillText(label, px + S * 0.1, ty);
    if (it.cost === 0) return;
    const st = sh.star[0];
    const tw = x.measureText(label).width;
    x.drawImage(st, px + S * 0.1 - tw / 2 - st.width * 0.75, ty - st.height / 2, st.width * 0.7, st.height * 0.7);
  }

  private drawCofre(p: Plot): void {
    const x = this.ctx;
    const S = this.S;
    const img = this.sh.cofre;
    const f = p.cofreFlash;
    const w = img.width * (1 + f * 0.12);
    const h = img.height * (1 - f * 0.08);
    const cx = (p.ox + COFRE.x) * S;
    const cy = (p.oy + COFRE.y) * S;
    x.drawImage(img, cx - w / 2, cy - h * 0.55, w, h);
    if (p.bank >= 1) {
      const b = Math.floor(p.bank);
      if (b !== this.bankN[p.idx]) {
        this.bankN[p.idx] = b;
        this.bankS[p.idx] = fmtShort(b);
      }
      const s = this.bankS[p.idx];
      x.font = `700 ${Math.round(S * 0.3)}px Fredoka, system-ui, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const tw = x.measureText(s).width + S * 0.3;
      x.fillStyle = 'rgba(42,11,92,0.82)';
      rr(x, cx - tw / 2, cy - S * 0.95, tw, S * 0.4, S * 0.2);
      x.fill();
      x.fillStyle = '#ffe680';
      x.fillText(s, cx, cy - S * 0.75);
    }
  }

  private drawRocket(p: Plot, built: boolean): void {
    const x = this.ctx;
    const S = this.S;
    const sh = this.sh;
    const cx = (p.ox + 4) * S;
    const base = (p.oy + 1.55) * S;
    const b = sh.rocketBase;
    x.drawImage(b, cx - b.width / 2, base - b.height * 0.7);
    const r = sh.rocket;
    let lift = 0;
    if (built) {
      const lt = this.launchT[p.idx];
      const age = lt >= 0 ? this.time - lt : 0;
      if (lt >= 0 && age > 0.6) lift = Math.pow(age - 0.6, 2) * S * 4;
      if (lt >= 0) {
        const fl = sh.flame;
        const fh = fl.height * (0.8 + Math.random() * 0.4);
        x.drawImage(fl, cx - fl.width / 2, base - S * 0.25 - lift, fl.width, fh);
      }
    } else x.globalAlpha = 0.28;
    x.drawImage(r, cx - r.width / 2, base - r.height - lift + S * 0.1);
    x.globalAlpha = 1;
  }

  private drawChar(p: Plot): void {
    const x = this.ctx;
    const S = this.S;
    const sh = this.sh;
    const R = S * 0.36;
    const img = charSprite(p.skin, R, p.face);
    const px = (p.ox + p.cx) * S;
    const py = (p.oy + p.cy) * S;
    x.drawImage(sh.shadow, px - sh.shadow.width * 0.4, py - sh.shadow.height * 0.4, sh.shadow.width * 0.8, sh.shadow.height * 0.8);
    let hop = 0;
    let sq = 0;
    if (p.moving) {
      const ph = p.walkT * 11;
      hop = Math.abs(Math.sin(ph)) * S * 0.12;
      sq = Math.cos(ph * 2) * 0.05;
    } else if (p.happyT > 0) {
      hop = Math.sin((0.8 - p.happyT) * Math.PI * 2.5) * S * 0.15;
      if (hop < 0) hop = -hop;
    } else sq = Math.sin(this.time * 2.6 + p.idx) * 0.03;
    const w = img.width * (1 + sq);
    const h = img.height * (1 - sq);
    const footY = py - hop;
    // sprite: personagem centrado em (w/2, h*0.54); pés ~ R abaixo do centro
    x.drawImage(img, px - w / 2, footY - R * 0.95 - h * 0.54, w, h);
    if (p.idx === this.me && this.zoom < 0.8) {
      // setinha "você"
      const ay = footY - R * 2.7 - Math.abs(Math.sin(this.time * 4)) * S * 0.15;
      x.fillStyle = '#fff36b';
      x.strokeStyle = INK;
      x.lineWidth = S * 0.06;
      x.beginPath();
      x.moveTo(px - S * 0.22, ay - S * 0.25);
      x.lineTo(px + S * 0.22, ay - S * 0.25);
      x.lineTo(px, ay);
      x.closePath();
      x.stroke();
      x.fill();
    }
    if (p.bubbleT > 0) {
      const by = footY - R * 3.1;
      x.fillStyle = '#ffffff';
      x.strokeStyle = INK;
      x.lineWidth = S * 0.05;
      rr(x, px - S * 0.3, by - S * 0.28, S * 0.6, S * 0.5, S * 0.2);
      x.stroke();
      x.fill();
      const tier = p.bubble === 'heart' ? 2 : p.bubble === 'sparkle' ? 1 : p.bubble === 'party' ? 4 : 0;
      const st = sh.star[tier];
      x.drawImage(st, px - st.width / 2, by - S * 0.03 - st.height / 2);
    }
  }

  private drawParticles(dt: number): void {
    const x = this.ctx;
    const S = this.S;
    const sh = this.sh;
    let i = 0;
    while (i < P.n) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        const j = --P.n;
        P.x[i] = P.x[j];
        P.y[i] = P.y[j];
        P.vx[i] = P.vx[j];
        P.vy[i] = P.vy[j];
        P.life[i] = P.life[j];
        P.max[i] = P.max[j];
        P.kind[i] = P.kind[j];
        P.c[i] = P.c[j];
        continue;
      }
      const kd = P.kind[i];
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      if (kd === 2) {
        P.vy[i] += 6 * dt;
        P.vx[i] *= 0.98;
      } else {
        P.vx[i] *= 0.92;
        P.vy[i] *= 0.92;
      }
      const a = P.life[i] / P.max[i];
      const img = kd === 0 ? sh.puff : kd === 1 ? sh.spark : kd === 3 ? sh.zap : sh.confetti[P.c[i]];
      const sc = kd === 0 ? 1.4 - a * 0.6 : kd === 3 ? 1.2 - a * 0.4 : 1;
      x.globalAlpha = kd === 2 ? Math.min(1, a * 3) : a;
      const w = img.width * sc;
      const h = img.height * sc;
      x.drawImage(img, P.x[i] * S - w / 2, P.y[i] * S - h / 2, w, h);
      i++;
    }
    x.globalAlpha = 1;
    // textos flutuantes
    x.font = `700 ${Math.round(S * 0.42)}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = S * 0.1;
    x.strokeStyle = INK;
    for (let k = 0; k < TMAX; k++) {
      if (FT.life[k] <= 0) continue;
      FT.life[k] -= dt;
      FT.y[k] -= dt * 0.8;
      x.globalAlpha = Math.min(1, FT.life[k] * 2);
      x.strokeText(FT.s[k], FT.x[k] * S, FT.y[k] * S);
      x.fillStyle = FT.col[k];
      x.fillText(FT.s[k], FT.x[k] * S, FT.y[k] * S);
    }
    x.globalAlpha = 1;
  }

  clearFx(): void {
    P.n = 0;
    for (let k = 0; k < TMAX; k++) FT.life[k] = 0;
  }
}
