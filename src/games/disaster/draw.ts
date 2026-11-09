/* ============================================================
 *  DESENHO — fundo em camadas (pré-renderizado), mundo, corpos,
 *  Bloops, fantasminhas, fluidos, golpes, meteoro e partículas.
 *  Sem alocações por frame no caminho quente (pool de partículas,
 *  gradientes e camadas criados só ao mudar de rodada/tamanho).
 * ============================================================ */
import type { DisasterGame, Player } from './game';
import { drawGrade, drawLight, drawSoftShadow, drawSpecular, drawVignette } from '../../gfx/light';
import { R } from './game';
import { GROUND_Y, shade, type Body } from './world';

const TAU = Math.PI * 2;

/* ------------------------------ partículas ------------------------------ */

type PKind = 'fire' | 'spark' | 'dust' | 'puff' | 'debris' | 'drop';
const PCOL: Record<PKind, string[]> = {
  fire: ['#ffe14d', '#ff9a2e', '#ff5a1f', '#7a3a2a'],
  spark: ['#ffffff', '#fff6a0', '#9fe8ff'],
  dust: ['#c9a27a', '#a8865a', '#e0c9a8'],
  puff: ['#ffffff', '#eef3ff', '#dfe7ff'],
  debris: ['#8a6a4a', '#6a5a50', '#b08a5a', '#5a4a3c'],
  drop: ['#bfe6ff'],
};
const FLUID_COLS: Record<'water' | 'lava' | 'goo' | 'snow', [string, string, string]> = {
  water: ['rgba(40,130,240,.82)', '#d8f3ff', 'rgba(20,80,190,.6)'],
  lava: ['rgba(255,90,20,.95)', '#ffe14d', 'rgba(200,40,20,.8)'],
  goo: ['rgba(110,230,60,.88)', '#e6ff9a', 'rgba(50,160,40,.6)'],
  snow: ['rgba(244,249,255,.97)', '#ffffff', 'rgba(170,200,240,.6)'],
};
const KINDS: PKind[] = ['fire', 'spark', 'dust', 'puff', 'debris', 'drop'];

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

  step(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      const g = k === 3 ? -20 : k === 0 ? 300 : 700;
      this.vy[i] += g * dt;
      this.vx[i] *= 1 - Math.min(1, dt * (k === 3 ? 3 : 0.8));
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
  private sky: CanvasGradient | null = null;
  private far: HTMLCanvasElement | null = null;
  private mid: HTMLCanvasElement | null = null;
  private layerScale = 1;
  private rain = new Float32Array(160);

  constructor(g: DisasterGame) {
    this.g = g;
    for (let i = 0; i < this.rain.length; i++) this.rain[i] = Math.random();
  }

  onResize(): void {
    this.sky = null;
    this.far = this.mid = null;
  }
  onRound(): void {
    this.onResize();
  }

  /* --------- camadas pré-renderizadas (tile horizontal) --------- */

  private buildLayers(): void {
    const g = this.g;
    const m = g.world.map;
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
    this.far = mk((x) => {
      const k = m.farKind;
      if (k === 'peaks') {
        x.fillStyle = m.far;
        x.beginPath();
        x.moveTo(0, H);
        for (let i = 0; i <= 8; i++) {
          x.lineTo(i * 128, 200 + rnd() * 60);
          x.lineTo(i * 128 + 64, 70 + rnd() * 80);
        }
        x.lineTo(W, 230);
        x.lineTo(W, H);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,.75)';
        for (let i = 0; i < 8; i++) {
          const px = i * 128 + 64;
          x.beginPath();
          x.arc(px, 110, 20, 0, TAU);
          x.fill();
        }
      } else if (k === 'city') {
        x.fillStyle = m.far;
        for (let i = 0; i < W; i += 36 + rnd() * 20) {
          const h = 90 + rnd() * 180;
          x.fillRect(i, H - h - 60, 30 + rnd() * 20, h + 60);
        }
        x.fillStyle = 'rgba(255,255,255,.25)';
        for (let i = 0; i < 120; i++) x.fillRect(rnd() * W, 200 + rnd() * 160, 4, 6);
      } else if (k === 'dunes') wave(x, 280, 90, 2, m.far);
      else if (k === 'sea') {
        wave(x, 300, 40, 3, m.far);
        x.fillStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i < 40; i++) x.fillRect(rnd() * W, 300 + rnd() * 100, 18, 2);
      } else if (k === 'pines') {
        x.fillStyle = m.far;
        x.fillRect(0, 320, W, 100);
        for (let i = 0; i < W; i += 22) {
          const h = 80 + rnd() * 90;
          x.beginPath();
          x.moveTo(i - 18, 330);
          x.lineTo(i, 330 - h);
          x.lineTo(i + 18, 330);
          x.fill();
        }
      } else if (k === 'domes') {
        x.fillStyle = m.far;
        x.fillRect(0, 320, W, 100);
        for (let i = 0; i < 6; i++) {
          x.beginPath();
          x.arc(80 + i * 170 + rnd() * 40, 330, 50 + rnd() * 50, Math.PI, 0);
          x.fill();
        }
        // roda-gigante / antenas
        x.strokeStyle = m.far;
        x.lineWidth = 5;
        x.beginPath();
        x.arc(520, 200, 90, 0, TAU);
        x.stroke();
        for (let a = 0; a < 8; a++) {
          x.beginPath();
          x.moveTo(520, 200);
          x.lineTo(520 + Math.cos((a / 8) * TAU) * 90, 200 + Math.sin((a / 8) * TAU) * 90);
          x.stroke();
        }
      } else wave(x, 260, 110, 2, m.far);
    });
    this.mid = mk((x) => {
      wave(x, 330, 50, 3, m.mid);
      if (m.farKind !== 'city' && m.farKind !== 'domes') {
        x.fillStyle = shade(m.mid, -0.15);
        for (let i = 0; i < 14; i++) {
          const px = rnd() * W;
          x.beginPath();
          x.arc(px, 330, 16 + rnd() * 14, 0, TAU);
          x.fill();
        }
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
    if (!this.far) this.buildLayers();

    // céu
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.sky) {
      const s = x.createLinearGradient(0, 0, 0, ch);
      const sk = w.map.sky;
      s.addColorStop(0, sk[0]);
      s.addColorStop(0.6, sk[1]);
      s.addColorStop(1, sk[2]);
      this.sky = s;
    }
    x.fillStyle = this.sky;
    x.fillRect(0, 0, cw, ch);
    const storm = g.phase === 'disaster' || g.phase === 'warn' || g.phase === 'impact' || g.phase === 'end';
    if (storm) {
      x.fillStyle = 'rgba(30,36,70,0.28)';
      x.fillRect(0, 0, cw, ch);
      // nuvens pesadas no topo, horizonte mais claro (céu dramático)
      if (g.q.grade) drawGrade(x, cw, ch * 0.7, 'rgba(14,12,40,0.55)', 'rgba(14,12,40,0)', 1, 'source-over');
    } else if (g.q.dynLights && !g.night) {
      // sol de fim de tarde por trás do cenário
      drawLight(x, '255,236,190', cw * 0.8, ch * 0.16, Math.max(cw, ch) * 0.45, 0.55);
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
    if (this.far && g.q.starLayers >= 2) this.layer(this.far, 0.2, 70, left, top, refTop, w.map.far);
    if (this.mid) this.layer(this.mid, 0.45, 50, left, top, refTop, w.map.mid);

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
        x.fillStyle = m.ground;
        x.fillRect(s.x, s.y, s.w, Math.min(s.h, 400));
        x.fillStyle = m.groundTop;
        x.fillRect(s.x, s.y, s.w, 10);
        x.fillStyle = 'rgba(0,0,0,.08)';
        x.fillRect(s.x, s.y + 10, s.w, 5);
      } else if (s.kind === 'plat') {
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
      }
    }
    // escadas fixas
    for (const l of w.ladders) if (l.body < 0 && l.x > x0 && l.x < x1) this.ladder(x, l.x, l.top, 16, l.bottom - l.top);
    // árvores
    for (const t of w.trees) {
      if (t.x + t.r < x0 || t.x - t.r > x1) continue;
      x.fillStyle = m.trunk;
      x.fillRect(t.x - 7, -t.h, 14, t.h);
      x.fillStyle = shade(m.leaf, -0.2);
      x.beginPath();
      x.arc(t.x, -t.h + 6, t.r, 0, TAU);
      x.fill();
      x.fillStyle = m.leaf;
      x.beginPath();
      x.arc(t.x - t.r * 0.35, -t.h - t.r * 0.25, t.r * 0.7, 0, TAU);
      x.arc(t.x + t.r * 0.4, -t.h - t.r * 0.15, t.r * 0.65, 0, TAU);
      x.fill();
    }
    // interior das casas
    for (const h of w.houses) {
      if (h.x + h.w < x0 || h.x > x1) continue;
      const ok = w.isSheltered(h.x + h.w / 2, -2);
      if (!ok) continue;
      x.fillStyle = 'rgba(40,30,60,.35)';
      x.fillRect(h.x + 12, h.top, h.w - 24, -h.top);
      // porta
      x.fillStyle = 'rgba(40,30,60,.25)';
      x.fillRect(h.x + h.w / 2 - 12, -40, 24, 40);
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
      if (!s.on || s.flash > 0 || s.x < x0 - 40 || s.x > x1 + 40) continue;
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

    // jogadores
    for (const p of g.players) if (p.alive) this.player(x, p, 1);
    // visitantes online
    for (const pr of g.peers) {
      const px = pr.s.x ?? 0;
      const py = pr.s.y ?? 0;
      if (px < x0 || px > x1) continue;
      x.globalAlpha = 0.55;
      if (pr.s.g) this.ghost(x, px, py, '#cfe0ff', pr.s.f || 1, g.time);
      else {
        x.fillStyle = '#9fd8ff';
        x.beginPath();
        x.arc(px, py - R, R, 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
      this.tag(x, px, py - (pr.s.g ? 40 : 34), pr.name, '#5ac8ff');
    }

    if (g.tornado.on) this.tornado(x, g.tornado.x, g.tornado.r, g.time, top);
    if (g.fluid) this.fluid(x, x0, x1, top + c.vh + 20);
    // fantasminhas por cima de tudo
    for (const p of g.players) if (p.ghost) this.ghost(x, p.gx, p.gy, p.color, p.face, g.time + p.outOrder, p.self ? p.name : '');

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
      const vis = s.kind === 'bolt' ? 0 : Math.min(1, (s.T - s.t) / s.T);
      if (s.kind === 'bolt' || s.t > s.T * 0.75) continue;
      const k = 1 - s.t / (s.T * 0.75);
      const px = s.sx + (s.x - s.sx) * k;
      const py = s.sy + (s.ty - s.sy) * k - (s.kind === 'bomb' ? Math.sin(k * Math.PI) * 240 : 0);
      this.rock(x, px, py, s.kind === 'rock' ? 11 : s.kind === 'bomb' ? 12 : 15, s.kind !== 'rock', vis);
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

    // tela
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (g.night) {
      x.fillStyle = 'rgba(12,14,48,0.42)';
      x.fillRect(0, 0, cw, ch);
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
    if (g.q.grade) drawVignette(x, cw, ch, storm ? 0.55 : 0.32, storm ? '8,6,30' : '30,16,40');
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
      x.fillStyle = b.color2;
      x.fillRect(b.x + b.w * 0.3, b.y + 1, b.w * 0.4, 4);
    } else if (b.kind === 'ladder') {
      this.ladder(x, b.x, b.y, b.w, b.h);
    } else {
      x.fillStyle = ink;
      roundRect(x, b.x - 1.5, b.y - 1.5, b.w + 3, b.h + 3, 4);
      x.fill();
      x.fillStyle = b.color;
      roundRect(x, b.x, b.y, b.w, b.h, 3);
      x.fill();
      if (b.kind === 'crate') {
        x.strokeStyle = b.color2;
        x.lineWidth = 2.5;
        x.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
        x.beginPath();
        x.moveTo(b.x + 4, b.y + 4);
        x.lineTo(b.x + b.w - 4, b.y + b.h - 4);
        x.stroke();
      } else if (b.kind === 'block' && b.w > 30 && b.h > 30) {
        // janelas
        x.fillStyle = '#5a7ab8';
        const ww = b.w > b.h ? b.h : b.w;
        x.fillRect(b.x + ww * 0.2, b.y + b.h * 0.25, ww * 0.22, b.h * 0.35);
        x.fillRect(b.x + b.w - ww * 0.42, b.y + b.h * 0.25, ww * 0.22, b.h * 0.35);
        x.fillStyle = 'rgba(255,255,255,.5)';
        x.fillRect(b.x + ww * 0.2, b.y + b.h * 0.25, ww * 0.08, b.h * 0.35);
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
    } else if (g.q.starLayers >= 2 || Math.abs(p.x - g.me.x) < 120) this.tag(x, p.x, p.y - R * 2 - 10, p.name, '#ffffff');
    if (p.maxJumps > 1 && !p.onGround && p.jumps > 1) {
      x.strokeStyle = 'rgba(62,224,122,.7)';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(p.x, p.y - R, R + 5, 0, TAU);
      x.stroke();
    }
  }

  private tag(x: CanvasRenderingContext2D, px: number, py: number, name: string, col: string): void {
    x.font = '700 9px Fredoka, system-ui, sans-serif';
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

  private fluid(x: CanvasRenderingContext2D, x0: number, x1: number, bottom: number): void {
    const g = this.g;
    const f = g.fluid!;
    const step = g.tier === 0 ? 24 : 14;
    const cols = FLUID_COLS[f.kind];
    let started = false;
    let firstX = 0;
    let lastX = 0;
    x.beginPath();
    for (let px = Math.floor(x0 / step) * step; px <= x1 + step; px += step) {
      const sy = g.surfaceAt(px);
      if (sy > 5000) {
        if (started) break;
        continue;
      }
      if (!started) {
        x.moveTo(px, bottom);
        firstX = px;
        started = true;
      }
      x.lineTo(px, sy);
      lastX = px;
    }
    if (!started) return;
    x.lineTo(lastX, bottom);
    x.closePath();
    x.fillStyle = cols[0];
    x.fill();
    // faixa funda
    x.fillStyle = cols[2];
    x.fillRect(firstX, g.surfaceAt((firstX + lastX) / 2) + 40, lastX - firstX, 2000);
    // espuma
    x.beginPath();
    let s2 = false;
    for (let px = firstX; px <= lastX; px += step) {
      const sy = g.surfaceAt(px);
      if (!s2) {
        x.moveTo(px, sy);
        s2 = true;
      } else x.lineTo(px, sy);
    }
    x.strokeStyle = cols[1];
    x.lineWidth = f.kind === 'lava' ? 4 : 5;
    x.lineCap = 'round';
    x.stroke();
    if (g.q.glows && f.kind === 'lava') {
      x.strokeStyle = 'rgba(255,160,40,.35)';
      x.lineWidth = 16;
      x.stroke();
    }
    if (g.q.dynLights) {
      const t2 = g.time;
      if (f.kind === 'lava') {
        // lava emissiva: ilumina o cenário acima da superfície
        for (let px = Math.floor(firstX / 160) * 160 + 80; px <= lastX; px += 160) {
          const fl = 0.75 + 0.25 * Math.sin(t2 * 3 + px * 0.05);
          drawLight(x, '255,120,30', px, g.surfaceAt(px), 150, 0.55 * fl, 0.7);
        }
      } else if (f.kind === 'water') {
        // reflexo do céu logo abaixo da superfície + brilhos especulares
        x.strokeStyle = 'rgba(255,255,255,.22)';
        x.lineWidth = 7;
        x.save();
        x.translate(0, 9);
        x.stroke();
        x.restore();
        for (let i = 0; i < 9; i++) {
          const px = firstX + ((i * 131.7 + t2 * 18) % Math.max(1, lastX - firstX));
          const tw = Math.sin(t2 * 4 + i * 1.7);
          if (tw > 0.2) drawSpecular(x, px, g.surfaceAt(px) + 3, 7 * tw, 0.8);
        }
      }
    }
    // bolhas/espuma soltas
    const t = g.time;
    x.fillStyle = cols[1];
    for (let i = 0; i < 18; i++) {
      const px = firstX + ((i * 97.3 + t * (f.kind === 'lava' ? 12 : 30)) % Math.max(1, lastX - firstX));
      const sy = g.surfaceAt(px);
      const ph = (t * 1.5 + i * 0.37) % 1;
      x.globalAlpha = 1 - ph;
      x.beginPath();
      x.arc(px, sy + 6 + ph * 20 * (f.kind === 'goo' || f.kind === 'lava' ? -0.5 : 1), 2 + (i % 3), 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
    // crista da onda: spray
    if (f.dir !== 0 && f.crest > 10 && Math.random() < g.q.particleBudget) {
      const fx = f.front - f.dir * 50;
      if (fx > x0 && fx < x1) this.particles.burst(fx, g.surfaceAt(fx), 2, f.kind === 'snow' ? 'puff' : 'drop', 160);
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
