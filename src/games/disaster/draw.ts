/* ============================================================
 *  DESENHO — fundo em camadas (pré-renderizado), mundo, corpos,
 *  Bloops, fantasminhas, fluidos, golpes, meteoro e partículas.
 *  Sem alocações por frame no caminho quente (pool de partículas,
 *  gradientes e camadas criados só ao mudar de rodada/tamanho).
 * ============================================================ */
import type { DisasterGame, Player } from './game';
import { drawGrade, drawLight, drawSoftShadow, drawSpecular, drawVignette, glowSprite } from '../../gfx/light';
import { R } from './game';
import { GROUND_Y, shade, type Body } from './world';
import { artOf, cloudStrip, facadeOverlay, gradeFor, shingleOverlay, skyStrip, soilTile, starStrip, topStrip, type MapArt } from './art2d';

const TAU = Math.PI * 2;

/* ------------------------------ partículas ------------------------------ */

export type PKind = 'fire' | 'spark' | 'dust' | 'puff' | 'debris' | 'drop' | 'spray' | 'goo' | 'juice' | 'candy' | 'snow' | 'leaf' | 'ember' | 'choco' | 'jelly' | 'bubble' | 'mud';
const PCOL: Record<PKind, string[]> = {
  fire: ['#ffe14d', '#ff9a2e', '#ff5a1f', '#7a3a2a'],
  spark: ['#ffffff', '#fff6a0', '#9fe8ff'],
  dust: ['#c9a27a', '#a8865a', '#e0c9a8'],
  puff: ['#ffffff', '#eef3ff', '#dfe7ff'],
  debris: ['#8a6a4a', '#6a5a50', '#b08a5a', '#5a4a3c'],
  drop: ['#bfe6ff'],
  spray: ['#ffffff', '#e4f6ff', '#bfe6ff', '#9fd4ff'],
  goo: ['#d8ff8a', '#a6f04a', '#7bd83a'],
  juice: ['#ff5a6a', '#ff8a8a', '#3fbf5a', '#2a0b5c'],
  candy: ['#ff5aa5', '#7ad8ff', '#ffe14d', '#9b5de5', '#5ee08a'],
  snow: ['#ffffff', '#eef6ff', '#d8e8ff'],
  leaf: ['#5ab84a', '#3f9a3a', '#c9a02a', '#d9772b'],
  ember: ['#ffe680', '#ffb13a', '#ff6a1e'],
  choco: ['#7a4a2a', '#5a3218', '#a0683a'],
  jelly: ['#ff7ac8', '#ff9ad5', '#ffc6e8'],
  bubble: ['#ffffff', '#d8f4ff', '#bfe6ff'],
  mud: ['#7a5233', '#5e3d22', '#9a7048'],
};
/** gravidade de cada tipo (as fumaças/bolhas sobem) */
const PGRAV: Record<PKind, number> = { fire: 300, spark: 700, dust: 700, puff: -20, debris: 700, drop: 700, spray: 700, goo: 700, juice: 800, candy: 700, snow: 60, leaf: 90, ember: -60, choco: 700, jelly: 700, bubble: -90, mud: 750 };
/** cores da superfície por pele: linha, faixa de espuma, espuma, brilho interno */
const FSURF: Record<FSkin, [string, string, string, string]> = {
  water: ['rgba(245,253,255,.95)', 'rgba(235,250,255,.3)', 'rgba(255,255,255,.88)', 'rgba(220,245,255,.28)'],
  goo: ['#e8ffa0', 'rgba(230,255,170,.3)', 'rgba(225,255,160,.85)', 'rgba(240,255,200,.22)'],
  jelly: ['#ffe0f2', 'rgba(255,220,240,.35)', 'rgba(255,235,248,.9)', 'rgba(255,230,245,.3)'],
  choco: ['#d8a070', 'rgba(200,140,90,.3)', 'rgba(230,190,150,.75)', 'rgba(220,170,120,.18)'],
  bubble: ['#ffffff', 'rgba(255,255,255,.5)', 'rgba(255,255,255,.95)', 'rgba(255,255,255,.35)'],
  lava: ['#fff07a', '', '', ''],
  snow: ['', '', '', ''],
  mud: ['', '', '', ''],
};
/** degradê de profundidade (0 = nível médio da superfície, 1 = chão) */
type FSkin = 'water' | 'lava' | 'goo' | 'snow' | 'jelly' | 'choco' | 'bubble' | 'mud';
const FLUID_GRAD: Record<FSkin, [number, string][]> = {
  jelly: [[0, 'rgba(255,170,220,.75)'], [0.15, 'rgba(255,110,190,.8)'], [0.55, 'rgba(220,60,150,.86)'], [1, 'rgba(140,20,90,.92)']],
  choco: [[0, '#b07a4a'], [0.12, '#8a5530'], [0.5, '#5e3418'], [1, '#2e160a']],
  bubble: [[0, 'rgba(255,255,255,.9)'], [0.2, 'rgba(225,245,255,.86)'], [0.6, 'rgba(170,215,250,.85)'], [1, 'rgba(110,160,220,.9)']],
  mud: [[0, '#a07a52'], [0.3, '#7a5233'], [0.75, '#5e3d22'], [1, '#3e2614']],
  water: [[0, 'rgba(120,212,255,.6)'], [0.12, 'rgba(56,150,240,.7)'], [0.5, 'rgba(26,92,200,.8)'], [1, 'rgba(12,40,120,.9)']],
  lava: [[0, '#ffd84a'], [0.1, '#ff9a22'], [0.4, '#e8471a'], [1, '#701208']],
  goo: [[0, 'rgba(210,255,120,.8)'], [0.15, 'rgba(130,230,64,.84)'], [0.55, 'rgba(62,165,42,.9)'], [1, 'rgba(22,86,28,.95)']],
  snow: [[0, '#ffffff'], [0.3, '#eef4ff'], [0.75, '#d2def3'], [1, '#a9bcdc']],
};
const KINDS: PKind[] = ['fire', 'spark', 'dust', 'puff', 'debris', 'drop', 'spray', 'goo', 'juice', 'candy', 'snow', 'leaf', 'ember', 'choco', 'jelly', 'bubble', 'mud'];
const KGRAV = KINDS.map((k) => PGRAV[k]);
const KDRAG = KINDS.map((k) => (k === 'puff' || k === 'snow' || k === 'leaf' || k === 'bubble' || k === 'ember' ? 3 : 0.8));

export class Particles {
  n = 420;
  x = new Float32Array(this.n);
  y = new Float32Array(this.n);
  vx = new Float32Array(this.n);
  vy = new Float32Array(this.n);
  life = new Float32Array(this.n);
  max = new Float32Array(this.n);
  size = new Float32Array(this.n);
  kind = new Uint8Array(this.n);
  col = new Uint8Array(this.n);
  head = 0;
  budget = 1;

  burst(x: number, y: number, count: number, kind: PKind, speed: number): void {
    const k = KINDS.indexOf(kind);
    const c = Math.max(1, Math.round(count * this.budget));
    for (let i = 0; i < c; i++) {
      const j = this.head;
      this.head = (this.head + 1) % this.n;
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.x[j] = x + (Math.random() - 0.5) * 10;
      this.y[j] = y + (Math.random() - 0.5) * 10;
      this.vx[j] = Math.cos(a) * s;
      this.vy[j] = Math.sin(a) * s - (kind === 'puff' ? 30 : speed * 0.4);
      this.max[j] = this.life[j] = kind === 'puff' ? 0.6 + Math.random() * 0.4 : 0.5 + Math.random() * 0.8;
      this.size[j] = kind === 'puff' ? 5 + Math.random() * 6 : kind === 'debris' ? 3 + Math.random() * 5 : 2 + Math.random() * 4;
      this.kind[j] = k;
      this.col[j] = Math.floor(Math.random() * PCOL[kind].length);
    }
  }

  /** jato direcional (respingo, spray da crista): vx/vy médios ± spread */
  spray(x: number, y: number, count: number, kind: PKind, vx: number, vy: number, spread: number): void {
    const k = KINDS.indexOf(kind);
    const c = Math.max(1, Math.round(count * this.budget));
    const pc = PCOL[kind].length;
    for (let i = 0; i < c; i++) {
      const j = this.head;
      this.head = (this.head + 1) % this.n;
      this.x[j] = x + (Math.random() - 0.5) * 6;
      this.y[j] = y + (Math.random() - 0.5) * 4;
      this.vx[j] = vx * (1 + (Math.random() - 0.5) * spread * 2) + (Math.random() - 0.5) * 60 * spread;
      this.vy[j] = vy * (1 + (Math.random() - 0.5) * spread * 2);
      this.max[j] = this.life[j] = kind === 'puff' ? 0.5 + Math.random() * 0.5 : 0.45 + Math.random() * 0.6;
      this.size[j] = kind === 'puff' ? 4 + Math.random() * 6 : kind === 'spray' ? 1.2 + Math.random() * 2.4 : 1.6 + Math.random() * 2.6;
      this.kind[j] = k;
      this.col[j] = Math.floor(Math.random() * pc);
    }
  }

  step(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      this.vy[i] += KGRAV[k] * dt;
      this.vx[i] *= 1 - Math.min(1, dt * KDRAG[k]);
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  draw(x: CanvasRenderingContext2D, x0: number, x1: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0 || this.x[i] < x0 || this.x[i] > x1) continue;
      const k = KINDS[this.kind[i]];
      const f = this.life[i] / this.max[i];
      x.globalAlpha = Math.min(1, f * 1.6);
      x.fillStyle = PCOL[k][this.col[i]];
      const s = this.size[i] * (k === 'puff' ? 1.6 - f * 0.6 : 0.5 + f * 0.5);
      if (k === 'debris') x.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      else {
        x.beginPath();
        x.arc(this.x[i], this.y[i], s, 0, TAU);
        x.fill();
      }
    }
    x.globalAlpha = 1;
  }
}

/* ------------------------------ desenhista ------------------------------ */

export class Drawer {
  g: DisasterGame;
  particles = new Particles();
  private far: HTMLCanvasElement | null = null;
  private mid: HTMLCanvasElement | null = null;
  private layerScale = 1;
  private rain = new Float32Array(160);
  private fGrad: CanvasGradient | null = null;
  private fGradKind = '';
  private lavaGlow: HTMLCanvasElement | null = null;
  private near: HTMLCanvasElement | null = null;
  private art: MapArt = artOf('vila');
  private skyN: HTMLCanvasElement | null = null;
  private skyS: HTMLCanvasElement | null = null;
  private skyNight: HTMLCanvasElement | null = null;
  private clouds: HTMLCanvasElement | null = null;
  private cloudsS: HTMLCanvasElement | null = null;
  private stars: HTMLCanvasElement | null = null;
  private soilPat: CanvasPattern | null = null;
  private topPat: CanvasPattern | null = null;
  private wallPat: CanvasPattern | null = null;
  private roofPat: CanvasPattern | null = null;
  /** 0..1: tempestade/noite suavizadas */
  private stormK = 0;

  constructor(g: DisasterGame) {
    this.g = g;
    for (let i = 0; i < this.rain.length; i++) this.rain[i] = Math.random();
  }

  onResize(): void {
    this.skyN = null;
    this.far = this.mid = this.near = null;
  }
  onRound(): void {
    this.onResize();
  }

  /* --------- camadas pré-renderizadas (tile horizontal) --------- */

  private buildLayers(): void {
    const g = this.g;
    const m = g.world.map;
    this.art = artOf(m.id);
    const ctx = g.ctx;
    this.soilPat = ctx.createPattern(soilTile(this.art.ground, m), 'repeat');
    this.topPat = ctx.createPattern(topStrip(this.art.ground, m), 'repeat-x');
    this.wallPat = ctx.createPattern(facadeOverlay(this.art.facade), 'repeat');
    this.roofPat = ctx.createPattern(shingleOverlay(), 'repeat');
    this.skyN = skyStrip(m.sky, false, false);
    this.skyS = skyStrip(m.sky, true, false);
    this.skyNight = skyStrip(m.sky, false, true);
    this.clouds = cloudStrip(false, g.sc.seed);
    this.cloudsS = cloudStrip(true, g.sc.seed + 7);
    this.stars = starStrip(g.sc.seed);
    const ps = Math.min(1.5, g.cam.ps);
    this.layerScale = ps;
    const W = 1024;
    const H = 420;
    const mk = (draw: (x: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * ps);
      c.height = Math.round(H * ps);
      const x = c.getContext('2d')!;
      x.scale(ps, ps);
      draw(x);
      return c;
    };
    let seed = g.sc.seed;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed & 0xffff) / 0x10000;
    };
    const wave = (x: CanvasRenderingContext2D, base: number, amp: number, f: number, col: string) => {
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i <= W; i += 16) x.lineTo(i, base - amp * (0.5 + 0.5 * Math.sin((i / W) * TAU * f + 1.3)) - amp * 0.3 * Math.sin((i / W) * TAU * f * 3));
      x.lineTo(W, H);
      x.fill();
    };
    const haze = this.art.haze;
    // perspectiva aérea: mistura a cor com a névoa do horizonte
    const hz = (c: string, k: number) => mixHex(c, haze, k);
    this.far = mk((x) => {
      const k = m.farKind;
      const col = hz(m.far, 0.35);
      if (k === 'peaks') {
        // cordilheira com neve e encostas sombreadas
        const pts: [number, number][] = [];
        for (let i = 0; i <= 10; i++) pts.push([i * 102.4, 120 + rnd() * 90]);
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(0, H);
        for (let i = 0; i < pts.length; i++) {
          const [px, py] = pts[i];
          x.lineTo(px - 51, py + 70 + rnd() * 30);
          x.lineTo(px, py);
        }
        x.lineTo(W, H);
        x.fill();
        for (const [px, py] of pts) {
          x.fillStyle = 'rgba(30,40,80,.12)';
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px + 40, py + 90);
          x.lineTo(px + 6, py + 120);
          x.fill();
          x.fillStyle = 'rgba(255,255,255,.92)';
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px - 16, py + 26);
          x.lineTo(px - 6, py + 22);
          x.lineTo(px, py + 30);
          x.lineTo(px + 8, py + 22);
          x.lineTo(px + 18, py + 28);
          x.fill();
        }
      } else if (k === 'city') {
        // horizonte de prédios com janelas e antenas
        for (let i = -10; i < W; i += 30 + rnd() * 26) {
          const bw = 26 + rnd() * 30;
          const h = 90 + rnd() * 200;
          x.fillStyle = shade(col, (rnd() - 0.5) * 0.12);
          x.fillRect(i, H - h - 40, bw, h + 40);
          x.fillStyle = 'rgba(255,255,255,.22)';
          x.fillRect(i, H - h - 40, 3, h + 40);
          for (let wy = H - h - 30; wy < H - 50; wy += 12)
            for (let wx = i + 5; wx < i + bw - 5; wx += 8) {
              x.fillStyle = rnd() < 0.12 ? 'rgba(255,236,160,.85)' : 'rgba(40,60,110,.25)';
              x.fillRect(wx, wy, 4, 6);
            }
          if (rnd() < 0.3) {
            x.fillStyle = col;
            x.fillRect(i + bw / 2 - 1, H - h - 64, 2, 24);
          }
        }
      } else if (k === 'dunes') {
        wave(x, 280, 90, 2, col);
        x.fillStyle = 'rgba(255,255,255,.18)';
        wave(x, 284, 90, 2, 'rgba(255,255,255,.0)');
      } else if (k === 'sea') {
        // mar com brilhos e veleiros ao longe
        wave(x, 300, 22, 3, col);
        x.fillStyle = 'rgba(255,255,255,.45)';
        for (let i = 0; i < 60; i++) x.fillRect(rnd() * W, 300 + rnd() * 110, 10 + rnd() * 16, 1.5);
        for (let i = 0; i < 3; i++) {
          const bx = rnd() * W;
          x.fillStyle = 'rgba(255,255,255,.85)';
          x.beginPath();
          x.moveTo(bx, 294);
          x.lineTo(bx + 10, 268);
          x.lineTo(bx + 12, 294);
          x.fill();
          x.fillStyle = shade(col, -0.2);
          x.fillRect(bx - 6, 294, 22, 4);
        }
        // ilhas
        x.fillStyle = hz(m.mid, 0.4);
        x.beginPath();
        x.ellipse(rnd() * W, 300, 120, 26, 0, Math.PI, TAU);
        x.fill();
      } else if (k === 'pines') {
        x.fillStyle = col;
        x.fillRect(0, 320, W, 100);
        for (let i = 0; i < W; i += 18) {
          const h = 80 + rnd() * 90;
          x.fillStyle = shade(col, (rnd() - 0.5) * 0.1);
          x.beginPath();
          x.moveTo(i - 16, 332);
          x.lineTo(i, 332 - h);
          x.lineTo(i + 16, 332);
          x.fill();
        }
      } else if (k === 'domes') {
        x.fillStyle = col;
        x.fillRect(0, 320, W, 100);
        for (let i = 0; i < 6; i++) {
          x.beginPath();
          x.arc(80 + i * 170 + rnd() * 40, 330, 50 + rnd() * 50, Math.PI, 0);
          x.fill();
        }
        x.strokeStyle = col;
        x.lineWidth = 5;
        x.beginPath();
        x.arc(520, 200, 90, 0, TAU);
        x.stroke();
        for (let a2 = 0; a2 < 8; a2++) {
          x.beginPath();
          x.moveTo(520, 200);
          x.lineTo(520 + Math.cos((a2 / 8) * TAU) * 90, 200 + Math.sin((a2 / 8) * TAU) * 90);
          x.stroke();
          x.fillStyle = ['#ff7ac8', '#7ad8ff', '#ffe14d', '#9b5de5'][a2 % 4];
          x.fillRect(520 + Math.cos((a2 / 8) * TAU) * 90 - 6, 200 + Math.sin((a2 / 8) * TAU) * 90, 12, 10);
        }
      } else wave(x, 260, 110, 2, col);
    });
    this.mid = mk((x) => {
      const col = hz(m.mid, 0.15);
      wave(x, 330, 46, 3, col);
      if (m.farKind !== 'city' && m.farKind !== 'domes') {
        // árvores redondas no morro (luz de cima)
        for (let i = 0; i < 26; i++) {
          const px = rnd() * W;
          const r = 12 + rnd() * 16;
          const py = 338 - r * 0.4;
          x.fillStyle = shade(col, -0.18);
          x.beginPath();
          x.arc(px, py, r, 0, TAU);
          x.fill();
          x.fillStyle = shade(col, 0.08);
          x.beginPath();
          x.arc(px - r * 0.25, py - r * 0.25, r * 0.6, 0, TAU);
          x.fill();
        }
      } else {
        // casinhas/prédios baixos
        for (let i = 0; i < W; i += 60 + rnd() * 40) {
          const bw = 40 + rnd() * 30;
          const bh = 40 + rnd() * 60;
          x.fillStyle = shade(col, (rnd() - 0.5) * 0.15);
          x.fillRect(i, 350 - bh, bw, bh + 70);
          x.fillStyle = 'rgba(255,240,200,.4)';
          for (let wy = 360 - bh; wy < 340; wy += 14) x.fillRect(i + 6, wy, bw - 12, 4);
        }
      }
    });
    this.near = mk((x) => {
      // fileira de arbustos/cerca na frente do horizonte
      const col = this.art.ground === 'snow' ? '#e8f0ff' : this.art.ground === 'sand' ? '#e8c27a' : this.art.ground === 'candy' ? '#ffb4dc' : this.art.ground === 'metal' ? '#3a4470' : this.art.ground === 'city' ? '#8a92a8' : shade(m.groundTop, -0.15);
      x.fillStyle = col;
      x.fillRect(0, 392, W, 40);
      for (let i = 0; i < W; i += 22 + rnd() * 26) {
        const r = 10 + rnd() * 14;
        x.fillStyle = shade(col, -0.1);
        x.beginPath();
        x.arc(i, 396 - r * 0.3, r, Math.PI, 0);
        x.fill();
        x.fillStyle = shade(col, 0.1);
        x.beginPath();
        x.arc(i - r * 0.2, 394 - r * 0.45, r * 0.55, Math.PI, 0);
        x.fill();
      }
    });
  }

  /* ------------------------------ frame ------------------------------ */

  frame(): void {
    const g = this.g;
    const x = g.ctx;
    const c = g.cam;
    const w = g.world;
    const cw = g.canvas.width;
    const ch = g.canvas.height;
    this.particles.budget = g.q.particleBudget;
    if (!this.far || !this.skyN) this.buildLayers();

    // céu: degradê + (tempestade cruzando) + sol/lua + estrelas + nuvens em 2 planos
    x.setTransform(1, 0, 0, 1, 0, 0);
    const storm = g.phase === 'disaster' || g.phase === 'warn' || g.phase === 'impact' || g.phase === 'end';
    const A = g.active;
    const clearSky = A.has('calor') || A.has('gravidade') || A.has('laser') || A.has('abducao') || A.has('buraco') || A.has('pisao') || A.has('bolas') || A.has('geiser') || A.has('sumidouro');
    const stormy = storm && !clearSky;
    this.stormK += ((stormy ? 1 : 0) - this.stormK) * Math.min(1, 0.02 + 1 / 60);
    if (this.skyN) {
      x.drawImage(g.night ? this.skyNight! : this.skyN, 0, 0, cw, ch);
      if (this.stormK > 0.01 && !g.night) {
        x.globalAlpha = this.stormK;
        x.drawImage(this.skyS!, 0, 0, cw, ch);
        x.globalAlpha = 1;
      }
    }
    const sunX = cw * (this.art.warm ? 0.78 : 0.82) - c.x * 0.02 * c.ps;
    const sunY = ch * (this.art.warm ? 0.32 : 0.14);
    if (g.night) {
      if (this.stars) {
        const sw = this.stars.width * g.dpr;
        const ox = -((c.x * 0.03 * c.ps) % sw);
        for (let px = ox - sw; px < cw; px += sw) x.drawImage(this.stars, px, 0, sw, this.stars.height * g.dpr);
      }
      x.fillStyle = '#fff6d8';
      x.beginPath();
      x.arc(sunX, ch * 0.16, 22 * g.dpr, 0, TAU);
      x.fill();
      x.fillStyle = 'rgba(12,16,52,1)';
      x.beginPath();
      x.arc(sunX + 9 * g.dpr, ch * 0.16 - 6 * g.dpr, 19 * g.dpr, 0, TAU);
      x.fill();
      if (g.q.dynLights) drawLight(x, '200,210,255', sunX, ch * 0.16, 140 * g.dpr, 0.35);
    } else if (this.stormK < 0.95) {
      const sa = 1 - this.stormK;
      if (g.q.dynLights) drawLight(x, this.art.warm ? '255,190,120' : '255,240,200', sunX, sunY, Math.max(cw, ch) * 0.5, 0.6 * sa);
      x.globalAlpha = sa;
      x.fillStyle = this.art.warm ? '#ffd28a' : '#fff6d0';
      x.beginPath();
      x.arc(sunX, sunY, 26 * g.dpr * (A.has('calor') ? 1.6 : 1), 0, TAU);
      x.fill();
      x.globalAlpha = 1;
    }
    {
      const cl = this.clouds;
      const cs = this.cloudsS;
      const drawC = (img: HTMLCanvasElement, f: number, y: number, a: number) => {
        const iw = img.width * g.dpr * 0.9;
        const ih = img.height * g.dpr * 0.9;
        let ox = -((c.x * f * c.ps + g.time * 8 * g.dpr) % iw);
        if (ox > 0) ox -= iw;
        x.globalAlpha = a;
        for (let px = ox; px < cw; px += iw) x.drawImage(img, px, y, iw, ih);
        x.globalAlpha = 1;
      };
      if (cl && this.stormK < 0.98) drawC(cl, 0.04, -10 * g.dpr, (1 - this.stormK) * (g.night ? 0.25 : 0.95));
      if (cs && this.stormK > 0.02) drawC(cs, 0.06, -20 * g.dpr, this.stormK);
    }

    let sx = 0;
    let sy = 0;
    if (g.shake > 0 && g.q.shake) {
      sx = (Math.random() - 0.5) * g.shake * 14;
      sy = (Math.random() - 0.5) * g.shake * 10;
    }
    const left = c.x - c.vw / 2 + sx;
    const top = c.y - c.vh / 2 + sy;

    // parallax
    const refTop = 150 - c.vh;
    if (this.far && g.q.starLayers >= 2) this.layer(this.far, 0.15, 70, left, top, refTop, mixHex(w.map.far, this.art.haze, 0.35));
    if (this.mid) this.layer(this.mid, 0.35, 50, left, top, refTop, mixHex(w.map.mid, this.art.haze, 0.15));
    if (this.near && g.q.starLayers >= 2) this.layer(this.near, 0.6, 28, left, top, refTop, shade(w.map.ground, -0.05));
    // névoa leve entre o fundo e o jogo (profundidade)
    if (g.q.grade) {
      x.fillStyle = g.night ? 'rgba(20,24,70,.18)' : 'rgba(255,255,255,.08)';
      x.fillRect(0, 0, cw, ch);
    }

    // mundo
    const ps = c.ps;
    x.setTransform(ps, 0, 0, ps, -left * ps, -top * ps);
    const x0 = left - 60;
    const x1 = left + c.vw + 60;

    if (g.active.has('vulcao') || w.map.id === 'ilha') this.volcano(x, w.W * 0.86, g.active.has('vulcao'));

    // sólidos
    const m = w.map;
    for (const s of w.solids) {
      if (s.x + s.w < x0 || s.x > x1) continue;
      if (s.kind === 'ground') {
        const gx0 = Math.max(s.x, x0);
        const gx1 = Math.min(s.x + s.w, x1);
        const hh = Math.min(s.h, 400);
        x.fillStyle = this.soilPat ?? m.ground;
        x.fillRect(gx0, s.y, gx1 - gx0, hh);
        // mais escuro para baixo (profundidade)
        const dg = x.createLinearGradient(0, s.y + 8, 0, s.y + 200);
        dg.addColorStop(0, 'rgba(0,0,0,0)');
        dg.addColorStop(1, 'rgba(10,0,20,.35)');
        x.fillStyle = dg;
        x.fillRect(gx0, s.y + 8, gx1 - gx0, Math.min(hh, 220));
        if (this.topPat) {
          x.save();
          x.translate(0, s.y - 6);
          x.fillStyle = this.topPat;
          x.fillRect(gx0, 0, gx1 - gx0, 28);
          x.restore();
        }
      } else if (s.kind === 'plat') {
        if (s.gone && (s.fallY ?? 0) > 360) continue;
        const shk = (s.crumble ?? 0) > 0 ? Math.sin(g.time * 60) * 2 : 0;
        x.save();
        if (s.gone) {
          x.globalAlpha = Math.max(0, 1 - (s.fallY ?? 0) / 360);
          x.translate(s.x + s.w / 2, s.y + (s.fallY ?? 0));
          x.rotate((s.fallY ?? 0) * 0.004);
          x.translate(-s.x - s.w / 2, -s.y);
        } else x.translate(shk, 0);
        x.fillStyle = '#6a4a2a';
        roundRect(x, s.x, s.y, s.w, s.h + 2, 4);
        x.fill();
        x.fillStyle = '#b8864f';
        roundRect(x, s.x, s.y, s.w, s.h - 3, 4);
        x.fill();
        // cordas/suportes
        x.strokeStyle = 'rgba(90,60,30,.5)';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(s.x + 8, s.y + s.h);
        x.lineTo(s.x + 14, s.y + s.h + 14);
        x.moveTo(s.x + s.w - 8, s.y + s.h);
        x.lineTo(s.x + s.w - 14, s.y + s.h + 14);
        x.stroke();
        if ((s.crumble ?? 0) > 0) this.cracks(x, s.x, s.y, s.w, s.h, g.time);
        x.restore();
      }
    }
    // buracos no chão (rachadura piscando → buraco escuro)
    for (const h of w.holes) {
      if (!h.on || h.x + h.w < x0 || h.x > x1) continue;
      if (h.warn > 0) {
        const blink = Math.sin(g.time * 22) > 0;
        x.strokeStyle = blink ? '#ff3355' : '#2a1a3a';
        x.lineWidth = 3;
        x.beginPath();
        const n = Math.max(3, Math.round(h.w / 14));
        for (let i = 0; i <= n; i++) {
          const px = h.x + (h.w * i) / n;
          const py = GROUND_Y + 2 + (i % 2 ? 5 : 0);
          if (i === 0) x.moveTo(px, py);
          else x.lineTo(px, py);
        }
        x.stroke();
        x.fillStyle = `rgba(255,51,85,${0.15 + 0.15 * (blink ? 1 : 0)})`;
        x.fillRect(h.x, GROUND_Y - 3, h.w, 6);
      } else {
        x.fillStyle = '#140c1c';
        x.beginPath();
        x.moveTo(h.x - 3, GROUND_Y);
        x.lineTo(h.x + h.w + 3, GROUND_Y);
        x.lineTo(h.x + h.w - 8, GROUND_Y + 300);
        x.lineTo(h.x + 8, GROUND_Y + 300);
        x.fill();
        x.fillStyle = 'rgba(90,60,40,.9)';
        x.fillRect(h.x - 4, GROUND_Y, 6, 26);
        x.fillRect(h.x + h.w - 2, GROUND_Y, 6, 26);
      }
    }
    // escadas fixas
    for (const l of w.ladders) if (l.body < 0 && l.x > x0 && l.x < x1) this.ladder(x, l.x, l.top, 16, l.bottom - l.top);
    // árvores
    for (const t of w.trees) {
      if (t.x + t.r < x0 || t.x - t.r > x1) continue;
      this.tree(x, t, m, g);
    }
    // interior das casas
    for (const h of w.houses) {
      if (h.x + h.w < x0 || h.x > x1) continue;
      const ok = w.isSheltered(h.x + h.w / 2, -2);
      if (!ok) continue;
      this.facade(x, h, g);
    }
    // bunker
    if (w.bunker) this.bunker(x, w.bunker);
    // corpos
    for (const b of w.bodies) {
      if (!b.alive || b.x + b.w + b.h < x0 || b.x - b.h > x1) continue;
      this.body(x, b);
    }
    // power-ups
    for (const k of w.pickups) {
      if (k.taken || k.x < x0 || k.x > x1) continue;
      const by = k.y + Math.sin(g.time * 3) * 4;
      if (g.q.glows) {
        x.fillStyle = 'rgba(120,255,170,.25)';
        x.beginPath();
        x.arc(k.x, by, 18, 0, TAU);
        x.fill();
      }
      x.fillStyle = '#2a0b5c';
      x.beginPath();
      x.arc(k.x, by, 12, 0, TAU);
      x.fill();
      x.fillStyle = '#3ee07a';
      x.beginPath();
      x.arc(k.x, by, 9.5, 0, TAU);
      x.fill();
      x.strokeStyle = '#fff';
      x.lineWidth = 2.6;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(k.x - 5, by + 1);
      x.lineTo(k.x, by - 4);
      x.lineTo(k.x + 5, by + 1);
      x.moveTo(k.x - 5, by + 6);
      x.lineTo(k.x, by + 1);
      x.lineTo(k.x + 5, by + 6);
      x.stroke();
    }
    // fogo no chão
    for (const fi of g.fires) {
      if (!fi.on || fi.x + fi.r < x0 || fi.x - fi.r > x1) continue;
      const fade = Math.min(1, fi.t);
      x.fillStyle = `rgba(255,120,30,${0.35 * fade})`;
      x.beginPath();
      x.ellipse(fi.x, fi.y, fi.r * 1.15, 7, 0, 0, TAU);
      x.fill();
      x.fillStyle = `rgba(255,190,60,${0.9 * fade})`;
      const n = Math.max(3, Math.round(fi.r / 7));
      x.beginPath();
      for (let i = 0; i < n; i++) {
        const fx = fi.x - fi.r + ((i + 0.5) * fi.r * 2) / n;
        const fh = 12 + 8 * Math.sin(g.time * 14 + i * 2.1);
        x.moveTo(fx - 5, fi.y);
        x.quadraticCurveTo(fx - 2, fi.y - fh * 0.6, fx, fi.y - fh);
        x.quadraticCurveTo(fx + 2, fi.y - fh * 0.6, fx + 5, fi.y);
      }
      x.fill();
    }
    // moedas do desastre
    for (const c of g.coins) {
      if (!c.on || c.x < x0 || c.x > x1) continue;
      const cy = c.y + Math.sin(g.time * 4 + c.x) * 3;
      const sw = Math.abs(Math.cos(g.time * 4 + c.x * 0.1));
      x.globalAlpha = c.t < 1.5 ? 0.5 + 0.5 * Math.sin(g.time * 20) : 1;
      x.fillStyle = '#2a0b5c';
      x.beginPath();
      x.ellipse(c.x, cy, 10 * sw + 2, 12, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#ffd34a';
      x.beginPath();
      x.ellipse(c.x, cy, 8 * sw + 1, 10, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#fff3b0';
      x.fillRect(c.x - 1.5 * sw, cy - 6, 3 * sw, 12);
      x.globalAlpha = 1;
    }
    // sombras de alerta (corpos caindo)
    for (const b of w.bodies) {
      if (!b.alive || !b.awake || b.vy < 60 || b.x + b.w < x0 || b.x > x1) continue;
      const cx = b.x + b.w / 2;
      const sy2 = w.surfaceBelow(cx, b.y + b.h + 2);
      if (sy2 > 300) continue;
      const near = Math.max(0.2, 1 - (sy2 - b.y) / 400);
      x.fillStyle = `rgba(220,30,60,${0.25 + near * 0.35})`;
      x.beginPath();
      x.ellipse(cx, sy2, b.w * 0.55, 4 + near * 3, 0, 0, TAU);
      x.fill();
    }
    // marcadores dos golpes
    for (const s of g.strikes) {
      if (!s.on || s.flash > 0) continue;
      if (s.kind === 'ball' || s.kind === 'gust') {
        // aviso: faixa na altura por onde vai passar (pisca), com seta na borda da tela
        if (!s.live) {
          const a = 0.25 + 0.25 * Math.sin(g.time * 16);
          x.fillStyle = s.kind === 'ball' ? `rgba(160,210,255,${a})` : `rgba(255,170,60,${a})`;
          x.fillRect(x0, s.ty - s.r, x1 - x0, s.r * 2);
          const ex = s.vx < 0 ? x1 - 80 : x0 + 80;
          this.edgeArrow(x, ex, s.ty, s.vx < 0 ? -1 : 1, s.kind === 'ball' ? '#e6f2ff' : '#ffb03a');
        }
        continue;
      }
      if (s.x < x0 - 40 || s.x > x1 + 40) continue;
      const p = 1 - s.t / s.T;
      const pulse = 0.6 + 0.4 * Math.sin(g.time * 18);
      if (s.kind === 'bolt') {
        x.fillStyle = `rgba(255,240,120,${0.12 + p * 0.25})`;
        x.fillRect(s.x - s.r, top, s.r * 2, s.ty - top);
      }
      x.strokeStyle = s.kind === 'bolt' ? '#ffe14d' : '#ff3355';
      x.lineWidth = 2.5;
      x.globalAlpha = 0.5 + 0.5 * pulse;
      x.beginPath();
      x.ellipse(s.x, s.ty, s.r, s.r * 0.28, 0, 0, TAU);
      x.stroke();
      x.fillStyle = s.kind === 'bolt' ? 'rgba(255,225,77,.35)' : 'rgba(255,51,85,.3)';
      x.beginPath();
      x.ellipse(s.x, s.ty, s.r * p, s.r * 0.28 * p, 0, 0, TAU);
      x.fill();
      x.globalAlpha = 1;
    }

    g.ex.drawBack(x, x0, x1, top);
    // jogadores (etiquetas de nome não se sobrepõem: a primeira que ocupa o lugar fica)
    this.tagBoxes.length = 0;
    for (const p of g.players) if (p.alive) this.player(x, p, p.shield > 0 && Math.sin(g.time * 30) > 0 ? 0.45 : 1);
    // visitantes online
    for (const pr of g.peers) {
      const px = pr.s.x ?? 0;
      const py = pr.s.y ?? 0;
      if (px < x0 || px > x1) continue;
      x.globalAlpha = 0.55;
      if (pr.s.g) this.ghost(x, px, py, '#cfe0ff', pr.s.f || 1, g.time);
      else {
        // amigo online com o Bloop DELE (skin ou "Meu Bloop")
        x.globalAlpha = 1;
        const img = g.peerSprite(pr);
        const size = img.width / g.cam.ps;
        x.save();
        x.translate(px, py);
        x.scale(pr.s.f || 1, 1);
        x.drawImage(img, -size / 2, -R * 1.04 - size / 2, size, size);
        x.restore();
      }
      x.globalAlpha = 1;
      this.tag(x, px, py - (pr.s.g ? 40 : 34), pr.name, '#5ac8ff');
    }

    if (g.tornado.on) this.tornado(x, g.tornado.x, g.tornado.r, g.time, top);
    if (g.tornado2.on) this.tornado(x, g.tornado2.x, g.tornado2.r, g.time * 1.1 + 2, top);
    if (g.fluid) this.fluid(x, x0, x1, top + c.vh + 20);
    g.ex.drawFront(x, x0, x1, top);
    // treino: seta verde pulando sobre o lugar seguro (presa na borda se estiver fora da tela)
    if (g.safe) this.safeArrow(x, g.safe.x, g.safe.y, x0, x1, g.time);
    // fantasminhas por cima de tudo
    for (const p of g.players) if (p.ghost) this.ghost(x, p.gx, p.gy, p.color, p.face, g.time + p.outOrder, p.self ? p.name : '');
    // bolhas de resgate (encoste para salvar) — a sua aparece para os amigos online
    for (const p of g.players) if (!p.alive && p.bubble > 0 && !p.rescued && p.bx > x0 && p.bx < x1) this.bubble(x, p, g.time);
    for (const pr of g.peers) if (pr.s.bb && (pr.s.bx ?? -999) > x0 && (pr.s.bx ?? 0) < x1) this.peerBubble(x, pr.s.bx ?? 0, pr.s.by ?? 0, g.time);

    // projéteis
    for (const s of g.strikes) {
      if (!s.on) continue;
      if (s.flash > 0) {
        if (s.kind === 'bolt') {
          this.bolt(x, s.x, top, s.ty);
          if (g.q.dynLights) drawLight(x, '220,230,255', s.x, s.ty - 60, 420, Math.min(1, s.flash * 2.2), 1.1);
        }
        else {
          x.fillStyle = s.kind === 'rock' ? 'rgba(200,170,130,.5)' : 'rgba(255,200,80,.55)';
          x.beginPath();
          x.arc(s.x, s.ty - 6, s.r * (1.3 - s.flash), 0, TAU);
          x.fill();
        }
        continue;
      }
      if (s.kind === 'ball' || s.kind === 'gust') {
        if (!s.live) continue;
        const bs = g.sc.tune?.ball;
        if (s.kind === 'ball' && (bs === 'bowling' || bs === 'boulder')) this.bigBall(x, s.x, s.ty, s.r, s.x / s.r, bs);
        else if (s.kind === 'ball') this.snowball(x, s.x, s.ty, s.r, s.x * 0.05);
        else this.plank(x, s.x, s.ty, g.time * 9 * Math.sign(s.vx));
        continue;
      }
      const vis = s.kind === 'bolt' ? 0 : Math.min(1, (s.T - s.t) / s.T);
      if (s.kind === 'bolt' || s.t > s.T * 0.75) continue;
      if (s.kind === 'drop') {
        const k2 = 1 - s.t / (s.T * 0.75);
        const dy = s.sy + (s.ty - s.sy) * k2 * k2;
        x.fillStyle = '#2a0b5c';
        x.beginPath();
        x.ellipse(s.x, dy, 9, 13, 0, 0, TAU);
        x.fill();
        x.fillStyle = '#8af04a';
        x.beginPath();
        x.ellipse(s.x, dy, 7, 11, 0, 0, TAU);
        x.fill();
        continue;
      }
      const k = 1 - s.t / (s.T * 0.75);
      const px = s.sx + (s.x - s.sx) * k;
      const py = s.sy + (s.ty - s.sy) * k - (s.kind === 'bomb' ? Math.sin(k * Math.PI) * 240 : 0);
      const sk = s.kind === 'meteor' && !g.finale ? g.sc.tune?.strike : undefined;
      if (sk && sk !== 'meteor') this.skinned(x, sk, px, py, s.r, vis, g.time);
      else this.rock(x, px, py, s.kind === 'rock' ? 11 : s.kind === 'bomb' ? 12 : 15 * Math.max(0.8, Math.min(1.6, s.r / 40)), s.kind !== 'rock', vis);
    }

    // meteoro gigante
    const mt = g.meteor;
    if (mt.t >= 0 && mt.t < 1.75) {
      const k = Math.min(1, mt.t / 1.7);
      const px = mt.x - 900 * (1 - k);
      const py = GROUND_Y - 900 * (1 - k) - 20;
      this.rock(x, px, py, 70, true, 1);
    }
    if (mt.ring >= 0 && mt.ring < 3000) {
      x.strokeStyle = `rgba(255,240,200,${Math.max(0, 0.8 - mt.ring / 2600)})`;
      x.lineWidth = 26;
      x.beginPath();
      x.ellipse(mt.x, GROUND_Y, mt.ring, mt.ring * 0.35, 0, Math.PI, TAU);
      x.stroke();
      x.fillStyle = `rgba(120,80,60,${Math.max(0, 0.5 - mt.ring / 3000)})`;
      x.beginPath();
      x.arc(mt.x, GROUND_Y - 40, 60 + mt.ring * 0.18, 0, TAU);
      x.fill();
      if (Math.random() < g.q.particleBudget) this.particles.burst(mt.x + (Math.random() - 0.5) * mt.ring, GROUND_Y - 30, 2, 'debris', 500);
    }

    this.particles.draw(x, x0, x1);
    // fôlego de quem está nadando (barrinha sobre a cabeça)
    for (const p of g.players) {
      if (!p.alive || !p.swim || p.x < x0 || p.x > x1) continue;
      const bw = p.self ? 34 : 22;
      const by = p.y - R * 2 - (p.self ? 30 : 22);
      x.fillStyle = 'rgba(30,15,60,.75)';
      roundRect(x, p.x - bw / 2 - 2, by - 2, bw + 4, 8, 4);
      x.fill();
      x.fillStyle = p.air > 0.35 ? '#5ac8ff' : Math.sin(g.time * 18) > 0 ? '#ff3355' : '#ffb03a';
      roundRect(x, p.x - bw / 2, by, bw * Math.max(0, p.air), 4, 2);
      x.fill();
    }

    g.ex.drawMeters(x, x0, x1);

    // tela
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (g.night) {
      x.fillStyle = 'rgba(12,14,48,0.42)';
      x.fillRect(0, 0, cw, ch);
    }
    g.ex.drawScreen(x, cw, ch, ((g.me.ghost ? g.me.gx : g.me.x) - left) * ps, ((g.me.ghost ? g.me.gy : g.me.y) - 14 - top) * ps, ps);
    // cinzas do vulcão / areia: tela escurece aos poucos (o seu Bloop continua visível: brilho em volta)
    if (g.haze > 0.02 || g.gust.vis > 0.02) {
      x.fillStyle = g.gust.vis > g.haze ? `rgba(196,140,80,${g.gust.vis})` : `rgba(58,46,48,${g.haze})`;
      x.fillRect(0, 0, cw, ch);
      if (g.me.alive) {
        const mx = (g.me.x - left) * ps;
        const my = (g.me.y - 14 - top) * ps;
        drawLight(x, '255,240,210', mx, my, 90 * ps, 0.35);
      }
    }
    const raining = g.night || g.active.has('enchente') || g.active.has('tornado') || g.sc.mod === 'vento';
    if (raining && storm) this.rainFx(x, cw, ch);
    if (g.phase === 'warn' || (g.phase === 'prepare' && g.phaseDur - g.phaseT < 3)) {
      const a = 0.12 + 0.12 * Math.sin(g.time * 12);
      x.fillStyle = `rgba(255,40,40,${a})`;
      x.fillRect(0, 0, cw, ch);
      // luzes de sirene nos cantos
      const r2 = cw * 0.5;
      x.fillStyle = Math.sin(g.time * 12) > 0 ? 'rgba(255,60,60,.35)' : 'rgba(60,140,255,.35)';
      x.beginPath();
      x.arc(0, 0, r2 * 0.5, 0, TAU);
      x.arc(cw, 0, r2 * 0.5, 0, TAU);
      x.fill();
    }
    for (const s of g.strikes) {
      if (s.on && s.kind === 'bolt' && s.flash > 0.12) {
        x.fillStyle = 'rgba(255,255,230,.35)';
        x.fillRect(0, 0, cw, ch);
        break;
      }
    }
    if (mt.flash > 0) {
      x.fillStyle = `rgba(255,250,235,${Math.min(1, mt.flash * 1.2)})`;
      x.fillRect(0, 0, cw, ch);
    }
    // cor por desastre (gradação suave) — cada desastre com a sua "luz"
    const gr = storm ? gradeFor(g.active, g.night) : null;
    if (gr && g.q.grade) {
      drawGrade(x, cw, ch, gr.top, gr.bottom, gr.a);
      x.fillStyle = gr.tint;
      x.fillRect(0, 0, cw, ch);
    }
    if (g.q.grade) drawVignette(x, cw, ch, storm ? 0.5 : 0.28, storm ? '8,6,30' : '30,16,40');
    if (g.timeScale < 0.8) {
      x.fillStyle = `rgba(0,0,0,${(0.8 - g.timeScale) * 0.4})`;
      x.fillRect(0, 0, cw, ch * 0.08);
      x.fillRect(0, ch * 0.92, cw, ch * 0.08);
    }
  }

  /** camada de fundo com parallax; y0 = base da camada no mundo (com a câmera no chão) */
  private layer(img: HTMLCanvasElement, f: number, y0: number, left: number, top: number, refTop: number, fill: string): void {
    const g = this.g;
    const x = g.ctx;
    const k = g.cam.scale * g.dpr;
    const iw = (img.width / this.layerScale) * k;
    const ih = (img.height / this.layerScale) * k;
    let ox = -((left * f * k) % iw);
    if (ox > 0) ox -= iw;
    const oy = (y0 - 420 - refTop - (top - refTop) * f) * k;
    const cw = g.canvas.width;
    for (let px = ox; px < cw; px += iw) x.drawImage(img, px, oy, iw + 1, ih);
    if (oy + ih < g.canvas.height) {
      x.fillStyle = fill;
      x.fillRect(0, oy + ih - 1, cw, g.canvas.height - oy - ih + 1);
    }
  }

  /* ------------------------------ peças ------------------------------ */

  private body(x: CanvasRenderingContext2D, b: Body): void {
    x.save();
    const sk = this.g.soakOf(b.id);
    if (sk > 0.55 && !b.awake && !b.tip) x.translate(Math.sin(this.g.time * 40 + b.id) * (sk - 0.5) * 4, 0);
    if (b.tip) {
      const px = b.tip > 0 ? b.x + b.w : b.x;
      const py = b.y + b.h;
      const e = b.tipT * b.tipT;
      x.translate(px, py);
      x.rotate(b.tip * e * Math.PI * 0.5);
      x.translate(-px, -py);
    } else if (b.ang) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      x.translate(cx, cy);
      x.rotate(b.ang);
      x.translate(-cx, -cy);
    }
    const ink = '#2a1a3a';
    if (b.kind === 'roof') {
      x.fillStyle = ink;
      x.beginPath();
      x.moveTo(b.x - 6, b.y + b.h + 2);
      x.lineTo(b.x + b.w * 0.28, b.y - 2);
      x.lineTo(b.x + b.w * 0.72, b.y - 2);
      x.lineTo(b.x + b.w + 6, b.y + b.h + 2);
      x.fill();
      x.fillStyle = b.color;
      x.beginPath();
      x.moveTo(b.x - 3, b.y + b.h);
      x.lineTo(b.x + b.w * 0.3, b.y + 1);
      x.lineTo(b.x + b.w * 0.7, b.y + 1);
      x.lineTo(b.x + b.w + 3, b.y + b.h);
      x.fill();
      if (this.roofPat) {
        x.fillStyle = this.roofPat;
        x.beginPath();
        x.moveTo(b.x - 3, b.y + b.h);
        x.lineTo(b.x + b.w * 0.3, b.y + 1);
        x.lineTo(b.x + b.w * 0.7, b.y + 1);
        x.lineTo(b.x + b.w + 3, b.y + b.h);
        x.fill();
      }
      // beiral claro + sombra embaixo
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillRect(b.x + b.w * 0.3, b.y + 1, b.w * 0.4, 3);
      x.fillStyle = 'rgba(0,0,0,.18)';
      x.fillRect(b.x - 3, b.y + b.h - 3, b.w + 6, 3);
    } else if (b.kind === 'ladder') {
      this.ladder(x, b.x, b.y, b.w, b.h);
    } else {
      x.fillStyle = ink;
      roundRect(x, b.x - 1.5, b.y - 1.5, b.w + 3, b.h + 3, 4);
      x.fill();
      x.fillStyle = b.color;
      roundRect(x, b.x, b.y, b.w, b.h, 3);
      x.fill();
      if ((b.kind === 'wall' || b.kind === 'block' || b.kind === 'slab') && this.wallPat) {
        x.fillStyle = this.wallPat;
        x.fillRect(b.x, b.y, b.w, b.h);
        // luz de cima / sombra embaixo (volume)
        x.fillStyle = 'rgba(255,255,255,.14)';
        x.fillRect(b.x, b.y, b.w, Math.min(5, b.h * 0.2));
        x.fillStyle = 'rgba(20,0,40,.12)';
        x.fillRect(b.x, b.y + b.h * 0.75, b.w, b.h * 0.25);
      }
      if (b.kind === 'crate') {
        x.strokeStyle = b.color2;
        x.lineWidth = 2.5;
        x.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
        x.beginPath();
        x.moveTo(b.x + 4, b.y + 4);
        x.lineTo(b.x + b.w - 4, b.y + b.h - 4);
        x.stroke();
      } else if (b.kind === 'block' && b.w > 30 && b.h > 30) {
        // janelas com moldura e brilho (acesas de noite)
        const ww = b.w > b.h ? b.h : b.w;
        const lit = this.g.night || this.stormK > 0.6;
        for (const wx of [b.x + ww * 0.17, b.x + b.w - ww * 0.45]) {
          x.fillStyle = '#fff7ea';
          x.fillRect(wx - 2, b.y + b.h * 0.22 - 2, ww * 0.28 + 4, b.h * 0.42 + 4);
          x.fillStyle = lit && (b.id + Math.round(wx)) % 3 ? '#ffd88a' : '#5a8ad0';
          x.fillRect(wx, b.y + b.h * 0.22, ww * 0.28, b.h * 0.42);
          x.fillStyle = 'rgba(255,255,255,.45)';
          x.fillRect(wx, b.y + b.h * 0.22, ww * 0.1, b.h * 0.42);
          x.fillStyle = '#fff7ea';
          x.fillRect(wx + ww * 0.13, b.y + b.h * 0.22, 2, b.h * 0.42);
        }
      } else if (b.kind === 'wall' && b.h > b.w) {
        x.fillStyle = 'rgba(0,0,0,.1)';
        x.fillRect(b.x + b.w - 4, b.y, 4, b.h);
      } else if (b.kind === 'slab' || b.kind === 'cap') {
        x.fillStyle = 'rgba(255,255,255,.3)';
        x.fillRect(b.x + 2, b.y + 1, b.w - 4, 3);
      }
      if (b.wet) {
        x.fillStyle = 'rgba(40,90,180,.18)';
        x.fillRect(b.x, b.y + b.h * 0.5, b.w, b.h * 0.5);
      }
      if (sk > 0.55 && !b.awake) this.cracks(x, b.x, b.y, b.w, b.h, this.g.time);
    }
    x.restore();
  }

  private ladder(x: CanvasRenderingContext2D, lx: number, ly: number, w: number, h: number): void {
    x.fillStyle = '#7a4f2a';
    x.fillRect(lx, ly, 3, h);
    x.fillRect(lx + w - 3, ly, 3, h);
    x.fillStyle = '#c98a4a';
    for (let y = ly + 6; y < ly + h; y += 12) x.fillRect(lx, y, w, 3);
  }

  private bunker(x: CanvasRenderingContext2D, b: { x: number; w: number; doorX: number; closed: number }): void {
    x.fillStyle = '#2a1a3a';
    roundRect(x, b.x - 4, -122, b.w + 8, 126, 18);
    x.fill();
    x.fillStyle = '#7d8aa8';
    roundRect(x, b.x, -118, b.w, 118, 15);
    x.fill();
    x.fillStyle = '#5f6b88';
    x.fillRect(b.x + 20, -80, b.w - 30, 80);
    // listras de alerta
    x.fillStyle = '#ffc93f';
    x.fillRect(b.x, -118, b.w, 10);
    x.fillStyle = '#2a1a3a';
    for (let i = 0; i < b.w; i += 20) {
      x.beginPath();
      x.moveTo(b.x + i, -108);
      x.lineTo(b.x + i + 10, -118);
      x.lineTo(b.x + i + 18, -118);
      x.lineTo(b.x + i + 8, -108);
      x.fill();
    }
    // placa com seta
    x.fillStyle = '#3ee07a';
    roundRect(x, b.x - 70, -150, 56, 30, 8);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(b.x - 58, -140);
    x.lineTo(b.x - 34, -140);
    x.lineTo(b.x - 34, -146);
    x.lineTo(b.x - 22, -135);
    x.lineTo(b.x - 34, -124);
    x.lineTo(b.x - 34, -130);
    x.lineTo(b.x - 58, -130);
    x.fill();
    x.fillStyle = '#6a5a50';
    x.fillRect(b.x - 44, -120, 6, 120);
    // porta (fecha de cima para baixo)
    const dh = 80 * Math.min(1, b.closed);
    x.fillStyle = '#2a1a3a';
    x.fillRect(b.doorX - 3, -80, 22, dh);
    x.fillStyle = '#b8c4ee';
    x.fillRect(b.doorX, -80, 16, dh);
  }

  private player(x: CanvasRenderingContext2D, p: Player, alpha: number): void {
    const g = this.g;
    const img = g.spriteFor(p);
    const ps = g.cam.ps;
    const size = img.width / ps;
    const run = p.onGround && Math.abs(p.vx) > 20 ? Math.abs(Math.sin(p.runT * 3)) : 0;
    const sq = p.sq + run * 0.08;
    const sxs = 1 + sq * 0.6;
    const sys = 1 - sq * 0.6;
    const bob = run * 3;
    x.globalAlpha = alpha;
    // sombra de contato
    drawSoftShadow(x, p.x, p.y, 11, 3.4, g.q.softShadows ? 0.3 : 0.18, g.q.softShadows);
    x.save();
    x.translate(p.x, p.y);
    x.scale(p.face * sxs, sys);
    const tilt = p.onGround ? p.vx * 0.0009 : p.vx * 0.0006;
    x.rotate(tilt * p.face);
    x.drawImage(img, -size / 2, -R * 1.04 - size / 2 - bob, size, size);
    x.restore();
    x.globalAlpha = 1;
    if (p.self) {
      x.fillStyle = '#ffe14d';
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 2;
      const ay = p.y - R * 2 - 16 + Math.sin(g.time * 5) * 2;
      x.beginPath();
      x.moveTo(p.x - 6, ay - 6);
      x.lineTo(p.x + 6, ay - 6);
      x.lineTo(p.x, ay + 2);
      x.closePath();
      x.stroke();
      x.fill();
      this.tagBoxes.push(p.x - 10, ay - 8, p.x + 10, ay + 4);
    } else if (g.q.starLayers >= 2 || Math.abs(p.x - g.me.x) < 120) this.tag(x, p.x, p.y - R * 2 - 10, p.name, '#ffffff');
    if (p.maxJumps > 1 && !p.onGround && p.jumps > 1) {
      x.strokeStyle = 'rgba(62,224,122,.7)';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(p.x, p.y - R, R + 5, 0, TAU);
      x.stroke();
    }
  }

  private safeArrow(x: CanvasRenderingContext2D, sx: number, sy: number, x0: number, x1: number, time: number): void {
    const off = sx < x0 + 75 || sx > x1 - 75; // x0/x1 têm 60 de margem fora da tela
    const ax = Math.max(x0 + 84, Math.min(x1 - 84, sx));
    const bob = Math.abs(Math.sin(time * 5)) * 10;
    const ay = (off ? this.g.me.y - 40 : sy - 46) - bob;
    x.save();
    x.translate(ax, ay);
    if (off) x.rotate(sx < x0 ? Math.PI / 2 : -Math.PI / 2);
    x.fillStyle = '#3ee07a';
    x.strokeStyle = '#1a5a32';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-9, -22);
    x.lineTo(9, -22);
    x.lineTo(9, -6);
    x.lineTo(18, -6);
    x.lineTo(0, 12);
    x.lineTo(-18, -6);
    x.lineTo(-9, -6);
    x.closePath();
    x.stroke();
    x.fill();
    x.restore();
  }

  /** retângulos (x0,y0,x1,y1) das etiquetas já desenhadas neste quadro */
  private tagBoxes: number[] = [];

  private tag(x: CanvasRenderingContext2D, px: number, py: number, name: string, col: string): void {
    x.font = '700 9px Fredoka, system-ui, sans-serif';
    const hw = x.measureText(name).width / 2 + 2;
    const bx = this.tagBoxes;
    const hits = (y: number) => {
      for (let i = 0; i < bx.length; i += 4) if (px + hw > bx[i] && px - hw < bx[i + 2] && y + 6 > bx[i + 1] && y - 6 < bx[i + 3]) return true;
      return false;
    };
    if (hits(py)) {
      if (hits(py - 12)) return; // amontoado: some a etiqueta (o Bloop continua visível)
      py -= 12;
    }
    bx.push(px - hw, py - 6, px + hw, py + 6);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(30,15,60,.75)';
    x.strokeText(name, px, py);
    x.fillStyle = col;
    x.fillText(name, px, py);
  }

  ghost(x: CanvasRenderingContext2D, gx: number, gy: number, col: string, face: number, t: number, label = ''): void {
    const wob = Math.sin(t * 3) * 3;
    const a = x.globalAlpha;
    x.globalAlpha = a * 0.85;
    x.save();
    x.translate(gx, gy + wob);
    x.scale(face || 1, 1);
    x.fillStyle = '#2a0b5c';
    this.ghostPath(x, 15.5, t);
    x.fill();
    x.fillStyle = '#f4f7ff';
    this.ghostPath(x, 13.5, t);
    x.fill();
    x.fillStyle = col;
    x.globalAlpha = a * 0.35;
    x.beginPath();
    x.arc(0, -4, 9, 0, TAU);
    x.fill();
    x.globalAlpha = a * 0.9;
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.ellipse(-4, -5, 2.2, 3, 0, 0, TAU);
    x.ellipse(5, -5, 2.2, 3, 0, 0, TAU);
    x.fill();
    x.beginPath();
    x.arc(0.5, 1.5, 2, 0, TAU);
    x.fill();
    x.restore();
    x.globalAlpha = a;
    if (label) this.tag(x, gx, gy - 24 + wob, label, '#cfe0ff');
  }

  private ghostPath(x: CanvasRenderingContext2D, r: number, t: number): void {
    x.beginPath();
    x.arc(0, -3, r, Math.PI, 0);
    const bottom = r * 0.95;
    x.lineTo(r, bottom);
    const n = 4;
    for (let i = n; i > 0; i--) {
      const xx = -r + ((i - 0.5) / n) * 2 * r;
      x.quadraticCurveTo(xx, bottom - 5 + Math.sin(t * 6 + i) * 2, xx - r / n, bottom);
    }
    x.closePath();
  }

  /** rachaduras vermelhas piscando (algo vai ceder) */
  private cracks(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, t: number): void {
    x.strokeStyle = Math.sin(t * 20) > 0 ? '#ff3355' : '#2a1a3a';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx + w * 0.2, cy);
    x.lineTo(cx + w * 0.3, cy + h);
    x.moveTo(cx + w * 0.55, cy);
    x.lineTo(cx + w * 0.48, cy + h * 0.6);
    x.lineTo(cx + w * 0.62, cy + h);
    x.moveTo(cx + w * 0.8, cy);
    x.lineTo(cx + w * 0.74, cy + h);
    x.stroke();
  }

  /** seta grande na borda da tela: algo vem daquele lado nessa altura */
  private edgeArrow(x: CanvasRenderingContext2D, ex: number, ey: number, dir: number, col: string): void {
    const s = 1 + 0.12 * Math.sin(this.g.time * 14);
    x.save();
    x.translate(ex, ey);
    x.scale(dir * s, s);
    x.fillStyle = col;
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-26, -9);
    x.lineTo(4, -9);
    x.lineTo(4, -20);
    x.lineTo(26, 0);
    x.lineTo(4, 20);
    x.lineTo(4, 9);
    x.lineTo(-26, 9);
    x.closePath();
    x.stroke();
    x.fill();
    x.fillStyle = '#ff3355';
    x.font = '900 18px Fredoka, system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.scale(dir, 1);
    x.fillText('!', -dir * 40, 1);
    x.restore();
  }

  private snowball(x: CanvasRenderingContext2D, px: number, py: number, r: number, a: number): void {
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(px, py, r + 2, 0, TAU);
    x.fill();
    x.fillStyle = '#f4f8ff';
    x.beginPath();
    x.arc(px, py, r, 0, TAU);
    x.fill();
    x.fillStyle = '#c8d6f0';
    x.beginPath();
    x.arc(px + Math.cos(a) * r * 0.45, py + Math.sin(a) * r * 0.45, r * 0.28, 0, TAU);
    x.arc(px + Math.cos(a + 2.4) * r * 0.5, py + Math.sin(a + 2.4) * r * 0.5, r * 0.2, 0, TAU);
    x.fill();
  }

  /** destroço voando (tábua girando) */
  /** árvore com volume: tronco com casca e raízes, copa em lóbulos (sombra embaixo, brilho em cima) */
  private tree(x: CanvasRenderingContext2D, t: { x: number; h: number; r: number; solid: number }, m: { leaf: string; trunk: string; id: string }, g: DisasterGame): void {
    const w = g.world;
    const ink = '#2a1a3a';
    // tronco
    x.fillStyle = ink;
    x.beginPath();
    x.moveTo(t.x - 10, 2);
    x.lineTo(t.x - 6, -t.h);
    x.lineTo(t.x + 6, -t.h);
    x.lineTo(t.x + 10, 2);
    x.fill();
    x.fillStyle = m.trunk;
    x.beginPath();
    x.moveTo(t.x - 8, 1);
    x.lineTo(t.x - 4.5, -t.h);
    x.lineTo(t.x + 4.5, -t.h);
    x.lineTo(t.x + 8, 1);
    x.fill();
    x.fillStyle = 'rgba(0,0,0,.18)';
    x.fillRect(t.x + 1.5, -t.h, 3, t.h);
    x.strokeStyle = 'rgba(40,20,10,.25)';
    x.lineWidth = 1;
    for (let k = 1; k < 5; k++) {
      x.beginPath();
      x.moveTo(t.x - 3, -t.h * (k / 5));
      x.lineTo(t.x + 2, -t.h * (k / 5) - 4);
      x.stroke();
    }
    const ls = w.solids[t.solid];
    const fy = ls?.gone ? (ls.fallY ?? 0) : 0;
    if (fy > 380) return;
    const lk = ls && (ls.crumble ?? 0) > 0 ? Math.sin(g.time * 50) * 2.5 : 0;
    x.save();
    if (fy) x.globalAlpha = Math.max(0, 1 - fy / 380);
    x.translate(lk + Math.sin(g.time * 1.3 + t.x) * (g.wind ? 2 : 0.6), fy);
    const cx = t.x;
    const cy = -t.h - 4;
    const R = t.r;
    const lobes: [number, number, number][] = [
      [-0.55, 0.15, 0.62],
      [0.55, 0.12, 0.6],
      [-0.2, -0.35, 0.7],
      [0.28, -0.4, 0.62],
      [0, 0.1, 0.8],
    ];
    const burnt = g.active.has('incendio') && g.ex?.burningAt(t.x);
    const leaf = burnt ? '#7a4a2a' : m.leaf;
    x.fillStyle = ink;
    x.beginPath();
    for (const [lx, ly, lr] of lobes) {
      x.moveTo(cx + lx * R + lr * R + 2.5, cy + ly * R);
      x.arc(cx + lx * R, cy + ly * R, lr * R + 2.5, 0, TAU);
    }
    x.fill();
    x.fillStyle = shade(leaf, -0.22);
    x.beginPath();
    for (const [lx, ly, lr] of lobes) {
      x.moveTo(cx + lx * R + lr * R, cy + ly * R);
      x.arc(cx + lx * R, cy + ly * R, lr * R, 0, TAU);
    }
    x.fill();
    x.fillStyle = leaf;
    x.beginPath();
    for (const [lx, ly, lr] of lobes) {
      x.moveTo(cx + lx * R + lr * R * 0.78, cy + ly * R - lr * R * 0.18);
      x.arc(cx + lx * R - lr * R * 0.06, cy + ly * R - lr * R * 0.18, lr * R * 0.78, 0, TAU);
    }
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.22)';
    x.beginPath();
    x.arc(cx - R * 0.3, cy - R * 0.55, R * 0.28, 0, TAU);
    x.fill();
    if (m.id === 'polo') {
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.ellipse(cx - R * 0.2, cy - R * 0.8, R * 0.55, R * 0.22, 0, 0, TAU);
      x.ellipse(cx + R * 0.35, cy - R * 0.62, R * 0.4, R * 0.18, 0, 0, TAU);
      x.fill();
    } else if (m.id !== 'doces' && !burnt) {
      // frutinhas/flores
      x.fillStyle = m.id === 'fazenda' ? '#ff4a4a' : '#ffffff';
      for (let k = 0; k < 4; k++) {
        x.beginPath();
        x.arc(cx + Math.sin(k * 2.3 + t.x) * R * 0.7, cy + Math.cos(k * 1.7) * R * 0.4, 2.2, 0, TAU);
        x.fill();
      }
    }
    if (lk) this.cracks(x, cx - R * 0.6, cy - 2, R * 1.2, 10, g.time);
    x.restore();
  }

  /** parede do fundo da casa (entre as duas paredes): reboco/tijolo, janelas, porta e luminária */
  private facade(x: CanvasRenderingContext2D, h: { x: number; w: number; top: number; wallL: number }, g: DisasterGame): void {
    const w = g.world;
    const wb = w.bodies[h.wallL];
    const col = wb ? wb.color : '#ffe9c9';
    const fx = h.x + 12;
    const fw = h.w - 24;
    const fy = h.top;
    const fh = -h.top;
    x.fillStyle = shade(col, -0.12);
    x.fillRect(fx, fy, fw, fh);
    if (this.wallPat) {
      x.fillStyle = this.wallPat;
      x.fillRect(fx, fy, fw, fh);
    }
    // sombra do teto (casa tem profundidade)
    const sg = x.createLinearGradient(0, fy, 0, fy + 26);
    sg.addColorStop(0, 'rgba(20,0,40,.35)');
    sg.addColorStop(1, 'rgba(20,0,40,0)');
    x.fillStyle = sg;
    x.fillRect(fx, fy, fw, 26);
    const lit = g.night || this.stormK > 0.6;
    // janelas
    const ww = Math.min(22, fw * 0.22);
    for (const wx of [fx + fw * 0.18, fx + fw * 0.82 - ww]) {
      x.fillStyle = '#fff7ea';
      x.fillRect(wx - 2, fy + 16, ww + 4, 22);
      x.fillStyle = lit ? '#ffd88a' : '#6a9ad8';
      x.fillRect(wx, fy + 18, ww, 18);
      x.fillStyle = 'rgba(255,255,255,.4)';
      x.fillRect(wx + 2, fy + 18, 5, 18);
      x.fillStyle = '#fff7ea';
      x.fillRect(wx + ww / 2 - 1, fy + 18, 2, 18);
      // floreira
      x.fillStyle = '#8a5a3a';
      x.fillRect(wx - 3, fy + 38, ww + 6, 4);
      x.fillStyle = ['#ff7ac8', '#ffe14d', '#ff5a5a'][(h.wallL + Math.round(wx)) % 3];
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.arc(wx + 3 + k * (ww / 2.4), fy + 37, 2.6, 0, TAU);
        x.fill();
      }
      if (lit && g.q.dynLights) drawLight(x, '255,210,120', wx + ww / 2, fy + 27, 40, 0.35);
    }
    // porta
    const dw = 22;
    const dx = fx + fw / 2 - dw / 2;
    x.fillStyle = '#2a1a3a';
    roundRect(x, dx - 2, -42, dw + 4, 42, 6);
    x.fill();
    x.fillStyle = '#9a5a3a';
    roundRect(x, dx, -40, dw, 40, 5);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.fillRect(dx + 3, -36, dw - 6, 14);
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.arc(dx + dw - 5, -20, 2, 0, TAU);
    x.fill();
    // chão de dentro (tapete)
    x.fillStyle = 'rgba(255,90,90,.35)';
    x.fillRect(dx - 10, -3, dw + 20, 3);
  }

  /** objetos que caem do céu (catálogo): granizo, bala, melancia, piano, estrela */
  private skinned(x: CanvasRenderingContext2D, sk: string, px: number, py: number, r: number, a: number, time: number): void {
    x.globalAlpha = a;
    x.save();
    x.translate(px, py);
    const s = Math.max(7, r * 0.42);
    if (sk === 'hail') {
      x.fillStyle = '#2a0b5c';
      x.beginPath();
      x.arc(0, 0, s * 0.62 + 2, 0, TAU);
      x.fill();
      x.fillStyle = '#e8f6ff';
      x.beginPath();
      x.arc(0, 0, s * 0.62, 0, TAU);
      x.fill();
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(-s * 0.2, -s * 0.2, s * 0.22, 0, TAU);
      x.fill();
    } else if (sk === 'candy') {
      x.rotate(time * 4);
      x.fillStyle = '#2a0b5c';
      x.beginPath();
      x.moveTo(-s * 1.7, -s * 0.7);
      x.lineTo(-s * 0.8, 0);
      x.lineTo(-s * 1.7, s * 0.7);
      x.moveTo(s * 1.7, -s * 0.7);
      x.lineTo(s * 0.8, 0);
      x.lineTo(s * 1.7, s * 0.7);
      x.fill();
      x.fillStyle = '#ff9ad5';
      x.beginPath();
      x.moveTo(-s * 1.5, -s * 0.5);
      x.lineTo(-s * 0.8, 0);
      x.lineTo(-s * 1.5, s * 0.5);
      x.moveTo(s * 1.5, -s * 0.5);
      x.lineTo(s * 0.8, 0);
      x.lineTo(s * 1.5, s * 0.5);
      x.fill();
      x.fillStyle = '#2a0b5c';
      x.beginPath();
      x.arc(0, 0, s + 2, 0, TAU);
      x.fill();
      x.fillStyle = '#ff3d8b';
      x.beginPath();
      x.arc(0, 0, s, 0, TAU);
      x.fill();
      x.strokeStyle = '#fff';
      x.lineWidth = s * 0.25;
      x.beginPath();
      x.arc(0, 0, s * 0.55, 0, Math.PI * 1.3);
      x.stroke();
    } else if (sk === 'melon') {
      x.rotate(time * 2);
      x.fillStyle = '#2a0b5c';
      x.beginPath();
      x.ellipse(0, 0, s * 1.35 + 2, s + 2, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#3fbf5a';
      x.beginPath();
      x.ellipse(0, 0, s * 1.35, s, 0, 0, TAU);
      x.fill();
      x.strokeStyle = '#1f7a35';
      x.lineWidth = s * 0.22;
      for (const o of [-0.5, 0, 0.5]) {
        x.beginPath();
        x.ellipse(0, 0, s * 1.3 * Math.max(0.15, 1 - Math.abs(o) * 1.5), s, 0, -Math.PI / 2, Math.PI / 2, o < 0);
        x.stroke();
      }
    } else if (sk === 'piano') {
      const w = s * 2.6;
      const h = s * 1.5;
      x.rotate(Math.sin(time * 3) * 0.2);
      x.fillStyle = '#2a0b5c';
      roundRect(x, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 6);
      x.fill();
      x.fillStyle = '#1b1b2c';
      roundRect(x, -w / 2, -h / 2, w, h, 5);
      x.fill();
      x.fillStyle = '#fff';
      x.fillRect(-w / 2 + 4, h * 0.05, w - 8, h * 0.3);
      x.fillStyle = '#1b1b2c';
      for (let i = 1; i < 8; i++) x.fillRect(-w / 2 + 4 + (i * (w - 8)) / 8 - 1, h * 0.05, 2.4, h * 0.18);
      x.fillStyle = '#3a3a5a';
      x.fillRect(-w / 2 + 6, h / 2, 4, h * 0.35);
      x.fillRect(w / 2 - 10, h / 2, 4, h * 0.35);
    } else {
      // estrela cadente
      x.rotate(time * 3);
      x.fillStyle = '#2a0b5c';
      this.star(x, s * 1.25 + 3);
      x.fill();
      x.fillStyle = '#ffe14d';
      this.star(x, s * 1.25);
      x.fill();
      x.fillStyle = '#fff6b0';
      this.star(x, s * 0.6);
      x.fill();
    }
    x.restore();
    x.globalAlpha = 1;
  }
  private star(x: CanvasRenderingContext2D, r: number): void {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      if (i) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
  }
  /** bola de boliche / pedregulho rolando */
  private bigBall(x: CanvasRenderingContext2D, px: number, py: number, r: number, a: number, k: string): void {
    x.save();
    x.translate(px, py);
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(0, 0, r + 3, 0, TAU);
    x.fill();
    const gr = x.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r);
    if (k === 'bowling') {
      gr.addColorStop(0, '#9aa6ff');
      gr.addColorStop(0.5, '#4a4ad8');
      gr.addColorStop(1, '#1e1a7a');
    } else {
      gr.addColorStop(0, '#c8b8a0');
      gr.addColorStop(0.6, '#8a7a68');
      gr.addColorStop(1, '#4a3e34');
    }
    x.fillStyle = gr;
    x.beginPath();
    x.arc(0, 0, r, 0, TAU);
    x.fill();
    x.rotate(a);
    x.fillStyle = k === 'bowling' ? '#120e40' : 'rgba(60,46,36,.6)';
    if (k === 'bowling') {
      for (const [hx, hy] of [
        [-0.25, -0.35],
        [0.12, -0.42],
        [-0.05, -0.12],
      ]) {
        x.beginPath();
        x.arc(hx * r, hy * r, r * 0.12, 0, TAU);
        x.fill();
      }
    } else {
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.arc(Math.cos(i * 1.7) * r * 0.5, Math.sin(i * 2.3) * r * 0.5, r * (0.12 + (i % 2) * 0.08), 0, TAU);
        x.fill();
      }
    }
    x.restore();
  }

  private plank(x: CanvasRenderingContext2D, px: number, py: number, a: number): void {
    x.save();
    x.translate(px, py);
    x.rotate(a);
    x.fillStyle = '#2a0b5c';
    x.fillRect(-16, -6, 32, 12);
    x.fillStyle = '#b8864f';
    x.fillRect(-14, -4, 28, 8);
    x.fillStyle = '#8a5a2a';
    x.fillRect(-6, -4, 3, 8);
    x.restore();
  }

  /** bolha de resgate de um bot: o Bloop dentro, anel de tempo, "toque para salvar" */
  private bubble(x: CanvasRenderingContext2D, p: Player, t: number): void {
    const g = this.g;
    const by = p.by + Math.sin(t * 3 + p.outOrder) * 3;
    const img = g.spriteFor(p);
    const size = img.width / g.cam.ps;
    x.globalAlpha = 0.85;
    x.drawImage(img, p.bx - size * 0.35, by - size * 0.35, size * 0.7, size * 0.7);
    x.globalAlpha = 1;
    x.strokeStyle = 'rgba(200,240,255,.9)';
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(p.bx, by, 19, 0, TAU);
    x.stroke();
    x.fillStyle = 'rgba(160,220,255,.18)';
    x.fill();
    x.strokeStyle = '#3ee07a';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(p.bx, by, 23, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, p.bubble / 10));
    x.stroke();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(p.bx - 7, by - 8, 3, 0, TAU);
    x.fill();
  }

  private peerBubble(x: CanvasRenderingContext2D, bx: number, by: number, t: number): void {
    x.strokeStyle = 'rgba(200,240,255,.9)';
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(bx, by + Math.sin(t * 3) * 3, 19, 0, TAU);
    x.stroke();
    x.fillStyle = 'rgba(62,224,122,.25)';
    x.fill();
  }

  private rock(x: CanvasRenderingContext2D, px: number, py: number, r: number, fire: boolean, a: number): void {
    x.globalAlpha = Math.max(0.3, a);
    if (fire) {
      x.fillStyle = 'rgba(255,150,40,.45)';
      x.beginPath();
      x.moveTo(px - r * 0.8, py - r * 0.6);
      x.lineTo(px - r * 4.5, py - r * 4.5);
      x.lineTo(px + r * 0.6, py - r * 0.9);
      x.fill();
      if (this.g.q.glows) {
        x.fillStyle = 'rgba(255,200,80,.35)';
        x.beginPath();
        x.arc(px, py, r * 1.6, 0, TAU);
        x.fill();
      }
    }
    x.fillStyle = '#2a1a3a';
    x.beginPath();
    x.arc(px, py, r + 2, 0, TAU);
    x.fill();
    x.fillStyle = fire ? '#a0482a' : '#8a7a6a';
    x.beginPath();
    x.arc(px, py, r, 0, TAU);
    x.fill();
    x.fillStyle = fire ? '#ffb03a' : '#b0a090';
    x.beginPath();
    x.arc(px - r * 0.3, py - r * 0.3, r * 0.35, 0, TAU);
    x.fill();
    x.globalAlpha = 1;
  }

  private bolt(x: CanvasRenderingContext2D, bx: number, top: number, ty: number): void {
    x.strokeStyle = '#fffbd0';
    x.lineWidth = 5;
    x.lineJoin = 'round';
    x.beginPath();
    let px = bx + (Math.random() - 0.5) * 20;
    x.moveTo(px, top);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const yy = top + ((ty - top) * i) / steps;
      px = i === steps ? bx : bx + (Math.random() - 0.5) * 34;
      x.lineTo(px, yy);
    }
    x.stroke();
    x.strokeStyle = '#ffe14d';
    x.lineWidth = 2;
    x.stroke();
  }

  private tornado(x: CanvasRenderingContext2D, tx: number, r: number, t: number, top: number): void {
    const h = GROUND_Y - Math.max(top - 40, -720);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const y = GROUND_Y - k * h;
      const rw = r * (0.25 + k * 1.6);
      const off = Math.sin(t * 5 + k * 6) * (8 + k * 30);
      x.fillStyle = i % 2 ? 'rgba(120,130,160,.55)' : 'rgba(160,170,200,.5)';
      x.beginPath();
      x.ellipse(tx + off, y, rw, 10 + k * 14, 0, 0, TAU);
      x.fill();
    }
    x.strokeStyle = 'rgba(255,255,255,.35)';
    x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.8 + i * 0.25) % 1);
      const y = GROUND_Y - k * h;
      const rw = r * (0.25 + k * 1.6);
      x.beginPath();
      x.ellipse(tx + Math.sin(t * 5 + k * 6) * (8 + k * 30), y, rw, 8 + k * 10, 0, 0.2, Math.PI - 0.2);
      x.stroke();
    }
  }

  private volcano(x: CanvasRenderingContext2D, vx: number, erupting: boolean): void {
    const g = this.g;
    const top = -330;
    x.fillStyle = '#8a6a78';
    x.beginPath();
    x.moveTo(vx - 300, GROUND_Y);
    x.lineTo(vx - 50, top);
    x.lineTo(vx + 50, top);
    x.lineTo(vx + 300, GROUND_Y);
    x.fill();
    x.fillStyle = '#9d7d8a';
    x.beginPath();
    x.moveTo(vx - 50, top);
    x.lineTo(vx + 5, top);
    x.lineTo(vx - 90, GROUND_Y);
    x.lineTo(vx - 220, GROUND_Y);
    x.fill();
    if (erupting) {
      x.fillStyle = '#ff7a1f';
      x.beginPath();
      x.moveTo(vx - 44, top);
      x.lineTo(vx + 44, top);
      x.lineTo(vx + 30, top + 70);
      x.lineTo(vx + 8, top + 40);
      x.lineTo(vx - 14, top + 110);
      x.lineTo(vx - 30, top + 30);
      x.fill();
      if (Math.random() < 0.3 * g.q.particleBudget) this.particles.burst(vx, top - 8, 2, 'fire', 220);
      x.fillStyle = 'rgba(90,80,90,.45)';
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.arc(vx + Math.sin(g.time + i) * 24 - i * 16, top - 40 - i * 40 - ((g.time * 24) % 40), 30 + i * 10, 0, TAU);
        x.fill();
      }
    }
  }

  /**
   * Fluido: corpo com degradê de profundidade (transparente sobre o que afundou), faixa de
   * espuma e carneirinhos onde a água mexe, reflexos de luz andando por baixo da superfície,
   * bolhas, crista enrolando do tsunami, nuvem rolando da avalanche, crosta e brilho da lava.
   * Caminhos montados direto das colunas visíveis; nada alocado por quadro.
   */
  private fluid(x: CanvasRenderingContext2D, x0: number, x1: number, _bottom: number): void {
    const g = this.g;
    const f = g.fluid!;
    const s = g.sim;
    if (!s) return;
    const pk = f.kind;
    const ts = g.sc.tune?.fluid;
    // pele (catálogo) por cima da física: gelatina/chocolate/espuma são "água"; lama é "neve"
    const sk: FSkin = ts && ((pk === 'water' && (ts === 'jelly' || ts === 'choco' || ts === 'bubble')) || (pk === 'snow' && ts === 'mud')) ? ts : pk;
    const kind: 'water' | 'lava' | 'goo' | 'snow' = pk === 'water' || pk === 'goo' ? pk : pk;
    const t = g.time;
    const tier = g.tier;
    const dx = s.dx;
    const sx0 = s.x0;
    const rest = s.rest;
    const dd = s.d;
    const wet = s.wet;
    const i0 = Math.max(0, Math.floor((x0 - sx0) / dx));
    const i1 = Math.min(s.n - 1, Math.ceil((x1 - sx0) / dx));
    const bottom = GROUND_Y + 6;

    // ---- corpo ----
    let any = false;
    let run = false;
    let lastX = 0;
    x.beginPath();
    for (let i = i0; i <= i1; i++) {
      const px = sx0 + i * dx;
      if (wet[i]) {
        const py = GROUND_Y - rest[i] - dd[i];
        if (!run) {
          x.moveTo(px, bottom);
          run = true;
          any = true;
        }
        x.lineTo(px, py);
        lastX = px;
      } else if (run) {
        x.lineTo(lastX, bottom);
        x.closePath();
        run = false;
      }
    }
    if (run) {
      x.lineTo(lastX, bottom);
      x.closePath();
    }
    if (!any) return;
    if (!this.fGrad || this.fGradKind !== sk) {
      // degradê em coordenadas 0..1 (escalado na hora de pintar): criado uma vez por tipo
      const gr = x.createLinearGradient(0, 0, 0, 1);
      for (const [o, c] of FLUID_GRAD[sk]) gr.addColorStop(o, c);
      this.fGrad = gr;
      this.fGradKind = sk;
    }
    const SC = FSURF[sk];
    const lvl = Math.max(26, f.level);
    x.save();
    x.translate(0, GROUND_Y - lvl - 6);
    x.scale(1, lvl + 6);
    x.fillStyle = this.fGrad;
    x.fill();
    x.restore();

    // ---- reflexos de luz andando por baixo da superfície (água e gosma) ----
    if (kind === 'water' || kind === 'goo') {
      const ns = tier === 0 ? 4 : tier === 1 ? 6 : tier === 2 ? 9 : 12;
      const span = x1 - x0;
      x.beginPath();
      for (let k = 0; k < ns; k++) {
        const sp = (k & 1 ? 1 : -0.7) * (10 + (k % 3) * 8);
        let px = (k * 157.3 + t * sp) % span;
        if (px < 0) px += span;
        px += x0;
        const len = 14 + ((k * 13) % 24);
        const depth = 7 + ((k * 29) % 46);
        const ya = s.surf(px - len * 0.5);
        const yb = s.surf(px + len * 0.5);
        const ym = s.surf(px);
        if (ya > 5000 || yb > 5000 || ym > 5000) continue;
        const wob = Math.sin(t * 1.9 + k * 2.3) * 2.5;
        if (Math.max(ya, yb, ym) + depth + 4 > GROUND_Y || Math.abs(ya - yb) > len) continue;
        x.moveTo(px - len * 0.5, ya + depth + wob);
        x.quadraticCurveTo(px, ym + depth - 2 + wob, px + len * 0.5, yb + depth + wob);
      }
      x.strokeStyle = SC[3];
      x.lineWidth = 2.2;
      x.lineCap = 'round';
      x.stroke();
    }

    // ---- linha da superfície (montada uma vez, pintada em camadas) ----
    x.lineCap = 'round';
    x.lineJoin = 'round';
    if (kind === 'water' || kind === 'goo') {
      // faixa de espuma macia logo abaixo + linha clara na superfície
      this.surfPath(x, i0, i1, 4);
      x.strokeStyle = SC[1];
      x.lineWidth = sk === 'bubble' ? 12 : 7;
      x.stroke();
      this.surfPath(x, i0, i1, 0);
      x.strokeStyle = SC[0];
      x.lineWidth = 2.6;
      x.stroke();
      // carneirinhos: espuma onde a água mexe (crista, respingos, frente)
      const fo = s.foam;
      const st = tier === 0 ? 3 : 2;
      x.beginPath();
      for (let i = i0 - (i0 % st); i <= i1; i += st) {
        if (i < 0 || !wet[i]) continue;
        const a = fo[i];
        if (a < 0.12 || i + 1 >= s.n) continue;
        // na face íngreme da onda a espuma vira cortina (riscos), não bolinhas empilhadas
        const sl = rest[i + 1] + dd[i + 1] - rest[i] - dd[i];
        if (sl > dx * 1.6 || sl < -dx * 1.6) continue;
        const h = Math.sin(i * 12.9898) * 43758.5453;
        const j = h - Math.floor(h);
        const r = (1.3 + a * 3.4) * (0.7 + j * 0.6);
        const px = sx0 + i * dx + (j - 0.5) * dx * 2;
        const py = GROUND_Y - rest[i] - dd[i] + r * 0.35 + j * a * 5;
        x.moveTo(px + r, py);
        x.arc(px, py, r, 0, TAU);
      }
      x.fillStyle = SC[2];
      x.fill();
      if (sk === 'bubble') {
        // espuma: bolhas grandes na superfície
        x.beginPath();
        for (let i = i0 - (i0 % 3); i <= i1; i += 3) {
          if (i < 0 || !wet[i]) continue;
          const h = Math.sin(i * 7.31) * 43758.5453;
          const j = h - Math.floor(h);
          const r = 5 + j * 9;
          const px = sx0 + i * dx;
          const py = GROUND_Y - rest[i] - dd[i] + 2 + Math.sin(t * 2 + i) * 2;
          x.moveTo(px + r, py);
          x.arc(px, py, r, 0, TAU);
        }
        x.fillStyle = 'rgba(255,255,255,.55)';
        x.fill();
        x.strokeStyle = 'rgba(160,210,255,.7)';
        x.lineWidth = 1.2;
        x.stroke();
      }
    } else if (kind === 'lava') {
      this.surfPath(x, i0, i1, 0);
      if (g.q.glows) {
        x.globalCompositeOperation = 'lighter';
        x.strokeStyle = 'rgba(255,140,30,.28)';
        x.lineWidth = 18;
        x.stroke();
        x.globalCompositeOperation = 'source-over';
      }
      x.strokeStyle = '#fff07a';
      x.lineWidth = 3.2;
      x.stroke();
      // crosta escura derivando devagar
      const span = x1 - x0;
      const nc = Math.ceil(span / 46);
      x.beginPath();
      for (let k = 0; k < nc; k++) {
        let px = (k * 61.7 + t * (5 + (k % 3) * 2)) % span;
        px += x0;
        const py = s.surf(px);
        if (py > 5000) continue;
        const w = 7 + (k % 4) * 4;
        x.moveTo(px + w, py + 4);
        x.ellipse(px, py + 4, w, 2.4, 0, 0, TAU);
      }
      x.fillStyle = 'rgba(80,16,6,.55)';
      x.fill();
    } else {
      // neve: superfície granulosa (montinhos) + sombra azulada logo abaixo
      this.surfPath(x, i0, i1, 5);
      x.strokeStyle = sk === 'mud' ? 'rgba(60,36,20,.5)' : 'rgba(150,175,215,.45)';
      x.lineWidth = 6;
      x.stroke();
      const st = tier === 0 ? 3 : 2;
      x.beginPath();
      for (let i = i0 - (i0 % st); i <= i1; i += st) {
        if (i < 0 || !wet[i]) continue;
        const h = Math.sin(i * 12.9898) * 43758.5453;
        const j = h - Math.floor(h);
        const r = 2.2 + j * 3.6;
        const px = sx0 + i * dx;
        const py = GROUND_Y - rest[i] - dd[i] + r * 0.45;
        x.moveTo(px + r, py);
        x.arc(px, py, r, 0, TAU);
      }
      x.fillStyle = sk === 'mud' ? '#a07a52' : '#ffffff';
      x.fill();
    }

    // ---- bolhas ----
    if (kind !== 'snow') {
      x.beginPath();
      for (let k = 0; k < s.NB; k++) {
        if (s.bl[k] <= 0) continue;
        const bx = s.bx[k];
        if (bx < x0 || bx > x1) continue;
        const r = s.br[k];
        x.moveTo(bx + r, s.by[k]);
        x.arc(bx, s.by[k], r, 0, TAU);
      }
      if (kind === 'lava') {
        x.fillStyle = 'rgba(255,215,90,.8)';
        x.fill();
      } else {
        x.strokeStyle = sk === 'goo' ? 'rgba(235,255,180,.75)' : sk === 'choco' ? 'rgba(220,170,120,.7)' : 'rgba(235,250,255,.7)';
        x.lineWidth = 1.2;
        x.stroke();
      }
    }

    // ---- frente: crista enrolando (tsunami) / nuvem rolando (avalanche) ----
    if (f.dir !== 0 && f.crest > 8) {
      const D = f.dir;
      const C = Math.max(0.25, Math.min(1.35, f.crest / 90));
      const xc = f.front - D * 46;
      const yc = s.surf(xc);
      if (yc < 5000 && xc > x0 - 120 && xc < x1 + 120) {
        if (kind === 'water') {
          const w = Math.sin(t * 4.2) * 0.12;
          const bxp = xc - D * 34 * C;
          const byp = s.surf(bxp);
          const tipX = xc + D * (54 + 10 * w) * C;
          const tipY = yc + 8 * C;
          const fx = xc + D * 24 * C;
          const fy = s.surf(fx);
          // corpo do lábio
          x.beginPath();
          x.moveTo(bxp, byp < 5000 ? byp : yc);
          x.quadraticCurveTo(xc - D * 6 * C, yc - 26 * C, xc + D * 22 * C, yc - 22 * C);
          x.quadraticCurveTo(xc + D * (60 + 8 * w) * C, yc - 18 * C, tipX, tipY);
          x.quadraticCurveTo(xc + D * 40 * C, yc - 6 * C, xc + D * 30 * C, yc + 10 * C);
          x.lineTo(fx, fy < 5000 ? fy : yc + 20 * C);
          x.lineTo(xc, yc + 6);
          x.closePath();
          x.fillStyle = sk === 'jelly' ? 'rgba(255,120,200,.9)' : sk === 'choco' ? 'rgba(140,85,48,.95)' : sk === 'bubble' ? 'rgba(230,245,255,.92)' : 'rgba(70,170,250,.88)';
          x.fill();
          // tubo (sombra dentro do enrolado)
          x.beginPath();
          x.ellipse(xc + D * 36 * C, yc + 10 * C, 13 * C, 9 * C, 0, 0, TAU);
          x.fillStyle = 'rgba(12,50,140,.42)';
          x.fill();
          // borda de espuma por cima e na ponta
          x.beginPath();
          x.moveTo(bxp, byp < 5000 ? byp : yc);
          x.quadraticCurveTo(xc - D * 6 * C, yc - 26 * C, xc + D * 22 * C, yc - 22 * C);
          x.quadraticCurveTo(xc + D * (60 + 8 * w) * C, yc - 18 * C, tipX, tipY);
          x.strokeStyle = 'rgba(255,255,255,.95)';
          x.lineWidth = 4.5;
          x.stroke();
          x.beginPath();
          for (let k = 0; k < 7; k++) {
            const a = k / 6;
            const px = xc + D * (4 + a * 52) * C + Math.sin(t * 9 + k * 2) * 2;
            const py = yc - 22 * C + a * a * 28 * C + Math.cos(t * 7 + k) * 2;
            const r = (3.2 + (k % 3) * 1.4) * C;
            x.moveTo(px + r, py);
            x.arc(px, py, r, 0, TAU);
          }
          x.fillStyle = '#ffffff';
          x.fill();
        } else if (kind === 'snow') {
          x.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = t * 3.2 + k * 1.05;
            const px = f.front - D * (18 + k * 16 + 10 * Math.cos(a)) * C;
            const sy = s.surf(px);
            if (sy > 5000) continue;
            const r = (10 + (k % 3) * 5) * C;
            const py = sy - r * 0.2 + 6 * Math.sin(a) * C;
            x.moveTo(px + r, py);
            x.arc(px, py, r, 0, TAU);
          }
          x.fillStyle = sk === 'mud' ? 'rgba(140,100,64,.95)' : 'rgba(255,255,255,.92)';
          x.fill();
        }
      }
    }

    // ---- luz ----
    if (g.q.dynLights) {
      if (kind === 'lava') {
        // lava emissiva: ilumina o cenário acima da superfície (sprite em cache: sem string por quadro)
        const spr = this.lavaGlow || (this.lavaGlow = glowSprite('255,120,30'));
        x.globalCompositeOperation = 'lighter';
        for (let px = Math.floor(x0 / 160) * 160 + 80; px <= x1; px += 160) {
          const py = s.surf(px);
          if (py > 5000) continue;
          x.globalAlpha = 0.55 * (0.75 + 0.25 * Math.sin(t * 3 + px * 0.05));
          x.drawImage(spr, px - 150, py - 105, 300, 210);
        }
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
      } else if (kind === 'water') {
        for (let i = 0; i < 7; i++) {
          const px = x0 + ((i * 131.7 + t * 18) % (x1 - x0));
          const tw = Math.sin(t * 4 + i * 1.7);
          const py = s.surf(px);
          if (tw > 0.25 && py < 5000) drawSpecular(x, px, py + 3, 6 * tw, 0.75);
        }
      }
    }
  }

  /** caminho da linha da superfície (colunas molhadas visíveis), deslocado em y */
  private surfPath(x: CanvasRenderingContext2D, i0: number, i1: number, off: number): void {
    const s = this.g.sim!;
    const wet = s.wet;
    x.beginPath();
    let r = false;
    for (let i = i0; i <= i1; i++) {
      if (!wet[i]) {
        r = false;
        continue;
      }
      const px = s.x0 + i * s.dx;
      const py = GROUND_Y - s.rest[i] - s.d[i] + off;
      if (!r) {
        x.moveTo(px, py);
        r = true;
      } else x.lineTo(px, py);
    }
  }

  private rainFx(x: CanvasRenderingContext2D, cw: number, ch: number): void {
    const g = this.g;
    const n = Math.round(this.rain.length * g.q.particleBudget);
    const wind = g.wind * 0.003 + (g.tornado.on ? 0.25 : 0.08);
    x.strokeStyle = 'rgba(200,220,255,.45)';
    x.lineWidth = 1.5 * g.dpr;
    x.beginPath();
    const len = 18 * g.dpr;
    for (let i = 0; i < n; i++) {
      const r = this.rain[i];
      const px = ((r * 7919 + g.time * (200 + wind * 400)) % 1) * cw;
      const py = ((r * 104729 + g.time * (1.2 + r)) % 1) * ch;
      x.moveTo(px, py);
      x.lineTo(px - wind * len, py + len);
    }
    x.stroke();
  }
}

/** mistura duas cores #rrggbb (k = 0 → a, 1 → b) */
export function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const m = (s2: number) => Math.round(((pa >> s2) & 255) * (1 - k) + ((pb >> s2) & 255) * k);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

export function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(rx + rr, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, rr);
  x.arcTo(rx + w, ry + h, rx, ry + h, rr);
  x.arcTo(rx, ry + h, rx, ry, rr);
  x.arcTo(rx, ry, rx + w, ry, rr);
  x.closePath();
}
