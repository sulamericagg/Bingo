/* ============================================================
 *  MONTA & LEVA — ABERTURA (≈34 s, 2D, "Pular" sempre visível; base: src/3d/cine).
 *  Toca na primeira fase e pode ser revista pelo menu (playIntro). Estilo do jogo: limpo e plano.
 *   1. Papel azul de projeto (blueprint): a grade se desenha, o carimbo do projeto e os
 *      contornos tracejados das peças aparecem, com cotas.
 *   2. As peças de verdade voam das bordas e ENCAIXAM (clique!) uma a uma, com faísca.
 *   3. O robozinho passageiro e a caixa caem no carrinho; o papel azul vira o mundo branco
 *      do jogo (cortina) e o motor liga.
 *   4. A física do próprio jogo (Sim) leva o carrinho pela pista: lombadas e rampas.
 *   5. Chega na zona de entrega: confete, estrelas, o robô acena → título.
 *  Desenho com as funções do jogo (render.ts) — o carrinho é o mesmo da física.
 * ============================================================ */
import { t } from '../../../i18n';
import { Cine, bump, ease, easeBack, easeOut, lerp, seg, TAU, type Canvas2D } from '../../../3d/cine';
import { MLAudio } from '../audio';
import { PARTS, U, type Placed } from '../parts';
import { COL, INK, Particles, drawBackground, drawObj, drawBot, drawCargo, drawLink, drawStructCell, drawTrack, drawWater, drawWheel, drawZone, structSilhouette, wx, wy, type ObjPose, type View } from '../render';
import { DT, Sim } from '../sim';
import { resolveTrack } from '../track';
import { IC } from '../style';
import { mlSave } from '../save';
import { setPalette } from '../render';
import type { LevelDef } from '../levels';

/* ------------------------------ roteiro (s) ------------------------------ */
const T_FLY = 2.8;
const T_LOAD = 10.6;
const T_WIPE = 12.2;
const T_GO = 13.4;
/** título e fim são marcados quando o carrinho chega (a física decide); estes são limites */
const T_LATE = 40;
const T_END = 60;

const CAR: Placed[] = [
  { t: 'spring', x: 1, y: 1, r: 0 },
  { t: 'block', x: 2, y: 1, r: 0 },
  { t: 'motor', x: 3, y: 1, r: 0 },
  { t: 'block', x: 4, y: 1, r: 0 },
  { t: 'motor', x: 5, y: 1, r: 0 },
  { t: 'spring', x: 6, y: 1, r: 0 },
  { t: 'tri', x: 7, y: 1, r: 0 },
  { t: 'block', x: 2, y: 2, r: 0 },
  { t: 'tri', x: 4, y: 2, r: 1 },
  { t: 'block', x: 6, y: 2, r: 0 },
  { t: 'wheelL', x: 1, y: 1, r: 0 },
  { t: 'wheelL', x: 6, y: 1, r: 0 },
];
const LEVEL: LevelDef = {
  n: 0,
  grid: [10, 6],
  parts: {},
  cargo: [
    { t: 'bot', x: 3, y: 2 },
    { t: 'crate', x: 5, y: 2 },
  ],
  track: [
    ['f', 3],
    ['b', 3, 0.35],
    ['f', 2],
    ['seesaw', 9],
    ['f', 2],
    ['r', 3, 0.7],
    ['f', 2],
    ['r', 3, -0.7],
    ['f', 2],
    ['bridge', 6],
    ['f', 3],
    ['zone', 4],
  ],
  goals: { time: 0, parts: 0 },
};

const ic = (h: string) => `<span style="display:block;width:28px;height:28px">${h}</span>`;
const SUBS = [
  { t: 0.7, end: T_FLY + 0.2, icons: [ic(IC.map)], text: () => t('ml.i.s1', 'Toda grande entrega começa com um projeto...') },
  { t: T_FLY + 0.5, end: T_LOAD - 0.1, icons: [ic(IC.wrench)], text: () => t('ml.i.s2', 'As peças voam e se encaixam: clique, clique, CLIQUE!') },
  { t: T_LOAD + 0.1, end: T_GO + 0.4, icons: [ic(IC.bot), ic(IC.box)], text: () => t('ml.i.s3', 'Um passageiro e uma caixa. Tudo pronto? Liga o motor!') },
  { t: T_GO + 1.2, end: 99, icons: [ic(IC.fwd)], text: () => t('ml.i.s4', 'Lá vai o carrinho: lombadas, gangorra, ponte... segura firme!') },
  { t: 99, end: 99, icons: [ic(IC.flag), ic(IC.bot)], text: () => t('ml.i.s5', 'Entregue! O robozinho adorou o passeio.') },
];

class MontaIntro {
  private c: Cine;
  private cv: Canvas2D;
  private au = new MLAudio();
  private sim: Sim;
  private tr = resolveTrack(LEVEL.track, 6.5);
  private fx = new Particles();
  private v: View = { s: 40, ox: 0, oy: 0, w: 1, h: 1 };
  private cam = { x: 2, y: 1, s: 80 };
  /** pose inicial do carrinho (para desenhar a montagem exatamente onde a física começa) */
  private g0: { x: number; y: number }[] = [];
  private w0: { x: number; y: number }[] = [];
  private cues = new Set<string>();
  private order: number[];
  private win = -1;

  constructor(root: HTMLElement) {
    setPalette(mlSave().palette);
    this.c = new Cine({
      id: 'montaleva',
      root,
      duration: T_END,
      subs: SUBS.map((x) => ({ ...x })),
      vignette: 'rgba(20,40,80,.22)',
      iconBg: '#3a4250',
      title: {
        at: 99,
        text: () => t('ml.name', 'Monta & Leva').toUpperCase(),
        tagline: () => t('ml.tagline', 'Monte o veículo. Entregue a carga.'),
        colors: ['#fff3d6', '#ffb347', '#f2711c', '#2a2f38'],
        top: '14%',
        sting: null,
      },
    });
    this.cv = this.c.canvas2d();
    this.sim = new Sim(LEVEL, CAR);
    for (const b of this.sim.groups) this.g0.push({ ...b.getPosition() });
    for (const w of this.sim.wheels) this.w0.push({ ...w.body.getPosition() });
    // ordem de chegada das peças: estrutura de baixo para cima, depois as rodas
    this.order = CAR.map((_, i) => i).sort((a, b) => (PARTS[CAR[a].t].layer === 'struct' ? 0 : 1) - (PARTS[CAR[b].t].layer === 'struct' ? 0 : 1) || CAR[a].y - CAR[b].y || CAR[a].x - CAR[b].x);
    this.au.musicOn = false;
    this.c.onFrame = (tt, dt) => this.frame(tt, dt);
    this.c.onDispose = () => {
      this.au.engine(0, 0);
      this.au.stop();
      this.sim.destroy();
    };
    if (location.search.includes('debug')) (window as unknown as { __intro: unknown }).__intro = this;
  }

  play(): Promise<void> {
    this.au.start();
    return this.c.play();
  }
  private cue(id: string, fn: () => void): void {
    if (this.cues.has(id)) return;
    this.cues.add(id);
    fn();
  }
  /** instante em que a peça i (na ordem de chegada) encaixa */
  private snapAt(k: number): number {
    return T_FLY + 0.5 + k * ((T_LOAD - T_FLY - 1.2) / CAR.length);
  }

  private frame(tt: number, dt: number): void {
    const { x, w: W, h: H, dpr } = this.cv;
    const v = this.v;
    v.w = W;
    v.h = H;
    const sim = this.sim;
    // ---------------- física (só depois de ligar) ----------------
    if (tt >= T_GO) {
      // a física acompanha o relógio da abertura (também ao pular no tempo)
      const target = tt - T_GO;
      let n = 0;
      while (sim.time < target - DT * 0.5 && n++ < 900) {
        const z = sim.track.zone;
        const f = sim.focus();
        // velocidade de cruzeiro (dá tempo de ver a pista)
        const vx = sim.main?.getLinearVelocity().x ?? 0;
        sim.input.fwd = f.x < z.x0 + 1.2 && vx < 3.4;
        sim.input.brake = f.x >= z.x0 + 1.2;
        sim.step();
      }
      for (const e of sim.fx) {
        if (e.kind === 'hit' && e.power > 0.4) this.au.hit(e.power);
      }
      sim.fx.length = 0;
      const f = sim.focus();
      const z = sim.track.zone;
      if (this.win < 0 && ((f.x > z.x0 + 0.6 && f.x < z.x1) || tt > T_LATE || sim.result)) {
        this.win = tt;
        // o roteiro do fim segue a chegada
        const o = this.c.o;
        const subs = o.subs!;
        subs[3].end = tt + 0.2;
        subs[4].t = tt + 0.3;
        subs[4].end = tt + 4.2;
        o.title!.at = tt + 2;
        o.duration = tt + 8;
        this.au.win();
        this.fx.emit(60, f.x, f.y + 1.5, { speed: 5, color: ['#ff4f6a', '#ffd34a', '#22b07d', '#5b8def', '#b07aff'], size: 0.12, life: 1.6, up: 4, grav: 6 });
      }
      const spd = Math.abs(sim.main?.getLinearVelocity().x ?? 0);
      this.au.engine(sim.input.fwd ? Math.min(1, spd / 4) : 0, sim.input.fwd ? 1 : 0);
    }
    this.fx.update(dt);
    // ---------------- câmera ----------------
    const s0 = Math.min(H / 3.4, W / 5.2);
    const sDrive = W < H ? W / 9 : H / 8.2;
    const f = tt >= T_GO ? sim.focus() : { x: this.g0[0].x + 1.75 * 1, y: this.g0[0].y + 0.8 };
    const k = ease(seg(tt, T_GO - 0.8, T_GO + 1.6));
    const tx = lerp(this.g0[0].x + 1.7, f.x + 1.6, k);
    const ty = lerp(this.g0[0].y + 0.9, f.y + 0.7, k);
    const ts = lerp(s0, sDrive, k);
    const kk = tt < 0.1 ? 1 : 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * kk;
    this.cam.y += (ty - this.cam.y) * kk;
    this.cam.s += (ts - this.cam.s) * kk;
    v.s = this.cam.s;
    v.ox = W / 2 - this.cam.x * v.s;
    v.oy = H / 2 + this.cam.y * v.s;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ---------------- fundo: mundo branco + cortina azul de projeto ----------------
    drawBackground(x, v);
    const wipe = ease(seg(tt, T_WIPE, T_GO + 0.2));
    if (tt >= T_WIPE - 0.1) {
      drawZone(x, v, this.tr, tt, 0, this.win >= 0);
      if (tt >= T_GO) this.drawObjs(tt);
      else this.drawStaticObjs(tt);
      drawTrack(x, v, this.tr);
      drawWater(x, v, this.tr, tt);
    }
    if (wipe < 1) {
      x.save();
      x.beginPath();
      x.rect(W * wipe, 0, W, H);
      x.clip();
      this.drawBlueprint(tt);
      x.restore();
      // brilho na borda da cortina
      if (wipe > 0) {
        const gx = W * wipe;
        const g = x.createLinearGradient(gx - 30, 0, gx + 6, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,.9)');
        x.fillStyle = g;
        x.fillRect(gx - 30, 0, 36, H);
      }
    }
    // ---------------- carrinho ----------------
    if (tt < T_GO) this.drawAssembly(tt);
    else this.drawSim(tt);
    this.fx.draw(x, v);
    if (tt >= T_WIPE + 0.3) this.cue('go', () => this.au.go());
  }

  private pose: ObjPose = { o: null as unknown as ObjPose['o'], bodies: [] };
  /** obstáculos da pista (gangorra, ponte) na física */
  private drawObjs(tt: number): void {
    const op = this.pose;
    for (const so of this.sim.objs) {
      op.o = so.o;
      op.bodies = so.bodies.map((b) => ({ ...b.getPosition(), a: b.getAngle() }));
      drawObj(this.cv.x, this.v, op, tt);
    }
  }
  private drawStaticObjs(tt: number): void {
    this.drawObjs(tt);
  }

  /** papel azul de projeto: grade, carimbo, contornos tracejados e cotas */
  private drawBlueprint(tt: number): void {
    const { x, w: W, h: H } = this.cv;
    const v = this.v;
    x.fillStyle = '#1d4f9a';
    x.fillRect(0, 0, W, H);
    // grade (se desenha de baixo para cima)
    const gk = easeOut(seg(tt, 0, 1.6));
    const step = v.s * U;
    const x0 = v.ox % step;
    const y0 = v.oy % step;
    x.lineWidth = 1;
    for (let i = 0; x0 + i * step < W; i++) {
      const gx = x0 + i * step;
      const major = Math.round((gx - v.ox) / step) % 4 === 0;
      x.strokeStyle = major ? 'rgba(160,200,255,.45)' : 'rgba(120,170,240,.22)';
      x.beginPath();
      x.moveTo(gx, H);
      x.lineTo(gx, H - H * gk);
      x.stroke();
    }
    for (let j = 0; y0 + j * step < H; j++) {
      const gy = y0 + j * step;
      const major = Math.round((gy - v.oy) / step) % 4 === 0;
      x.strokeStyle = major ? 'rgba(160,200,255,.45)' : 'rgba(120,170,240,.22)';
      x.beginPath();
      x.moveTo(0, gy);
      x.lineTo(W * gk, gy);
      x.stroke();
    }
    // carimbo do projeto (canto)
    const sk = ease(seg(tt, 0.6, 1.6));
    if (sk > 0) {
      x.globalAlpha = sk;
      const bw = Math.min(250, W * 0.3);
      const bh = 56;
      const bx = W - bw - 16;
      const by = H * 0.91 - bh - 50;
      x.strokeStyle = 'rgba(230,240,255,.85)';
      x.lineWidth = 2;
      x.strokeRect(bx, by, bw, bh);
      x.beginPath();
      x.moveTo(bx, by + 24);
      x.lineTo(bx + bw, by + 24);
      x.stroke();
      x.fillStyle = 'rgba(230,240,255,.9)';
      x.font = `700 13px ui-monospace, 'Courier New', monospace`;
      x.textAlign = 'left';
      x.fillText(t('ml.i.stamp', 'PROJETO Nº 1 — CARRINHO DE ENTREGA'), bx + 8, by + 17, bw - 16);
      x.font = `600 11px ui-monospace, 'Courier New', monospace`;
      x.fillText('MONTA & LEVA · 1:10 · ✓', bx + 8, by + 43, bw - 16);
      x.globalAlpha = 1;
    }
    // contornos tracejados de cada peça (o plano)
    const lw = 1.6 / (v.s * U);
    x.save();
    this.cellSpace(this.g0[0].x, this.g0[0].y, 0);
    x.setLineDash([0.12, 0.1]);
    x.strokeStyle = 'rgba(235,245,255,.9)';
    x.lineWidth = lw * 1.2;
    this.order.forEach((i, kk) => {
      const p = CAR[i];
      const a = ease(seg(tt, 1.0 + kk * 0.12, 1.4 + kk * 0.12)) * (1 - ease(seg(tt, this.snapAt(kk), this.snapAt(kk) + 0.3)));
      if (a <= 0) return;
      x.globalAlpha = a;
      if (PARTS[p.t].layer === 'struct') {
        x.beginPath();
        structSilhouette(x, p);
        x.stroke();
      } else {
        const r = (PARTS[p.t].radius ?? 0.4) / U;
        x.beginPath();
        x.arc(p.x + 0.5, p.y + 0.5, r, 0, TAU);
        x.stroke();
      }
    });
    x.setLineDash([]);
    x.globalAlpha = 1;
    x.restore();
    // cotas (setinhas com medidas)
    const ck = ease(seg(tt, 1.6, 2.4)) * (1 - ease(seg(tt, T_LOAD, T_WIPE)));
    if (ck > 0) {
      x.globalAlpha = ck;
      x.strokeStyle = 'rgba(235,245,255,.85)';
      x.fillStyle = 'rgba(235,245,255,.95)';
      x.lineWidth = 1.5;
      const g = this.g0[0];
      const ax = wx(v, g.x + 1 * U);
      const bx = wx(v, g.x + 7 * U);
      const y = wy(v, g.y + 0.2 * U) + 34;
      const arrow = (x1: number, y1: number, x2: number, y2: number) => {
        x.beginPath();
        x.moveTo(x1, y1);
        x.lineTo(x2, y2);
        x.stroke();
        for (const [px, py, d] of [
          [x1, y1, 1],
          [x2, y2, -1],
        ] as [number, number, number][]) {
          const ang = Math.atan2(y2 - y1, x2 - x1);
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px + d * Math.cos(ang - 0.4) * 8, py + d * Math.sin(ang - 0.4) * 8);
          x.lineTo(px + d * Math.cos(ang + 0.4) * 8, py + d * Math.sin(ang + 0.4) * 8);
          x.closePath();
          x.fill();
        }
      };
      arrow(ax, y, bx, y);
      x.font = `700 12px ui-monospace, 'Courier New', monospace`;
      x.textAlign = 'center';
      x.fillText(`${(6 * U).toFixed(1).replace('.', t('ml.decimal', ','))} m`, (ax + bx) / 2, y - 6);
      const hx = wx(v, g.x + 7.4 * U);
      arrow(hx, wy(v, g.y + 1 * U), hx, wy(v, g.y + 3 * U));
      x.globalAlpha = 1;
    }
  }

  private cellSpace(px: number, py: number, a: number): void {
    const x = this.cv.x;
    const v = this.v;
    x.translate(wx(v, px), wy(v, py));
    x.rotate(-a);
    x.scale(v.s * U, -v.s * U);
  }

  /** montagem: as peças voam das bordas e encaixam (na mesma pose em que a física começa) */
  private drawAssembly(tt: number): void {
    const x = this.cv.x;
    const v = this.v;
    const lw = 1.6 / (v.s * U);
    const g = this.g0[0];
    // fora da tela (em células, relativo ao carrinho)
    const W = this.cv.w / (v.s * U);
    const H = this.cv.h / (v.s * U);
    this.order.forEach((i, kk) => {
      const p = CAR[i];
      const t1 = this.snapAt(kk);
      const k = seg(tt, t1 - 0.55, t1);
      if (k <= 0) return;
      const side = kk % 4;
      const fromX = side === 0 ? -W * 0.6 : side === 1 ? W * 0.9 : side === 2 ? p.x + 2 : p.x - 3;
      const fromY = side === 0 ? p.y + 3 : side === 1 ? p.y + 1 : side === 2 ? H * 0.8 : -H * 0.6;
      const e = easeBack(k, 1.4);
      const ox = lerp(fromX - p.x, 0, e);
      const oy = lerp(fromY - p.y, 0, e);
      const rot = (1 - easeOut(k)) * (kk % 2 ? 2.2 : -2.2);
      const pop = tt >= t1 ? 1 + bump(seg(tt, t1, t1 + 0.25)) * 0.12 : 1;
      x.save();
      this.cellSpace(g.x, g.y, 0);
      x.translate(p.x + 0.5 + ox, p.y + 0.5 + oy);
      x.rotate(rot);
      x.scale(pop, pop);
      x.translate(-p.x - 0.5, -p.y - 0.5);
      if (PARTS[p.t].layer === 'struct') {
        if (this.cv.w > 0) {
          x.save();
          x.translate(0.07, -0.09);
          x.fillStyle = COL.shadow;
          x.beginPath();
          structSilhouette(x, p);
          x.fill();
          x.restore();
        }
        drawStructCell(x, p, lw);
      } else drawWheel(x, p.t, p.x + 0.5, p.y + 0.5, rot * 3, lw, p.t !== 'wheelS' && tt > T_GO - 0.6);
      x.globalAlpha = 1;
      x.restore();
      if (tt >= t1) {
        this.cue('snap' + kk, () => {
          this.au.snap(kk % 3);
          const wpt = { x: g.x + (p.x + 0.5) * U, y: g.y + (p.y + 0.5) * U };
          this.fx.emit(10, wpt.x, wpt.y, { speed: 2.5, color: ['#ffffff', '#ffd34a', '#7fd0ff'], size: 0.06, life: 0.45, up: 1.2, grav: 2, shape: 2 });
        });
      }
    });
    // passageiro e caixa caem no carrinho
    this.sim.cargo.forEach((c, ci) => {
      const b = c.bodies[0];
      const p = b.getPosition();
      const t0 = T_LOAD + ci * 0.45;
      const k = seg(tt, t0, t0 + 0.6);
      if (k <= 0) return;
      const drop = (1 - easeOut(k)) * 4 - bump(seg(tt, t0 + 0.6, t0 + 0.9)) * 0.08;
      if (c.def.t === 'bot') drawBot(x, v, p.x, p.y + drop, 0, k >= 1 ? 2 : 1, 0, k >= 1 ? bump(seg(tt, t0 + 0.6, t0 + 0.9)) * 0.12 : 0, tt, 1);
      else drawCargo(x, v, c.def.t, p.x, p.y + drop, 0);
      if (k >= 1) this.cue('land' + ci, () => this.au.bot(ci));
    });
    // faísca do motor ao ligar
    if (tt >= T_GO - 0.7) this.cue('spark', () => this.fx.emit(16, g.x + 3.5 * U, g.y + 1.5 * U, { speed: 3, color: ['#ffd34a', '#ff8a3a'], size: 0.07, life: 0.5, up: 2, shape: 2 }));
  }

  /** o carrinho na física (mesmo desenho do jogo, simplificado) */
  private drawSim(tt: number): void {
    const x = this.cv.x;
    const v = this.v;
    const sim = this.sim;
    const lw = 1.6 / (v.s * U);
    const parts = sim.parts;
    const an = sim.an;
    sim.groups.forEach((b, gi) => {
      const p = b.getPosition();
      x.save();
      this.cellSpace(p.x, p.y, b.getAngle());
      x.save();
      x.translate(0.07, -0.09);
      x.fillStyle = COL.shadow;
      x.beginPath();
      for (const i of sim.members[gi]) structSilhouette(x, parts[i]);
      x.fill();
      x.restore();
      for (const i of sim.members[gi]) drawStructCell(x, parts[i], lw);
      an.links.forEach((l, k) => {
        if (sim.linkOn[k] && sim.partBody[l.i] === b) drawLink(x, l.x, l.y, lw);
      });
      x.restore();
    });
    // amortecedores (linha + molinha) e rodas
    for (const w of sim.wheels) {
      const p = w.body.getPosition();
      if (w.spring) {
        const bp = w.base.getPosition();
        const a = w.base.getAngle();
        const c = Math.cos(a);
        const s = Math.sin(a);
        const lx = w.lx;
        const ly = w.ly + Math.max(U * 0.5, w.r + U * 0.14);
        const ax = bp.x + lx * c - ly * s;
        const ay = bp.y + lx * s + ly * c;
        x.strokeStyle = '#ffd45c';
        x.lineWidth = Math.max(2.2, v.s * U * 0.07);
        x.beginPath();
        const n = 10;
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const side = i % 2 ? 1 : -1;
          const px = lerp(ax, p.x, u) + side * U * 0.14 * c;
          const py = lerp(ay, p.y, u) + side * U * 0.14 * s;
          if (i === 0) x.moveTo(wx(v, px), wy(v, py));
          else x.lineTo(wx(v, px), wy(v, py));
        }
        x.stroke();
      }
      x.save();
      this.cellSpace(p.x, p.y, 0);
      drawWheel(x, parts[w.idx].t, 0, 0, w.body.getAngle(), lw, w.powered > 0);
      x.globalAlpha = 1;
      x.restore();
    }
    // carga + o robozinho (acena no fim)
    sim.cargo.forEach((c) => {
      const b = c.bodies[0];
      const p = b.getPosition();
      if (c.def.t === 'bot') {
        const happy = this.win >= 0 || tt < T_GO + 1.5;
        drawBot(x, v, p.x, p.y, b.getAngle(), happy ? 2 : 0, 0, 0, tt, 1);
        if (this.win >= 0) this.drawWave(p.x, p.y, b.getAngle(), tt);
        return;
      }
      c.bodies.forEach((bb) => {
        const q = bb.getPosition();
        drawCargo(x, v, c.def.t, q.x, q.y, bb.getAngle());
      });
    });
    // estrelinhas da entrega
    if (this.win >= 0) {
      const f = sim.focus();
      for (let i = 0; i < 3; i++) {
        const k = seg(tt, this.win + 0.4 + i * 0.25, this.win + 0.9 + i * 0.25);
        if (k <= 0) continue;
        if (k > 0) this.cue('star' + i, () => this.au.star(i));
        const sx = wx(v, f.x + (i - 1) * 0.55);
        const sy = wy(v, f.y + 1.9 + (i === 1 ? 0.25 : 0));
        star(x, sx, sy, v.s * 0.22 * easeBack(k, 2.4), '#ffd34a');
      }
    }
  }

  /** bracinho acenando do robô passageiro */
  private drawWave(px: number, py: number, a: number, tt: number): void {
    const x = this.cv.x;
    const v = this.v;
    const s = v.s;
    x.save();
    x.translate(wx(v, px), wy(v, py));
    x.rotate(-a);
    const sx = 0.17 * s;
    const sy = -0.42 * s;
    const ang = -1.2 + Math.sin(tt * 9) * 0.45;
    const L = 0.22 * s;
    const ex = sx + Math.cos(ang) * L;
    const ey = sy + Math.sin(ang) * L;
    x.lineCap = 'round';
    x.strokeStyle = '#3b2a6b';
    x.lineWidth = Math.max(3, s * 0.07);
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(ex, ey);
    x.stroke();
    x.fillStyle = '#ffffff';
    x.lineWidth = Math.max(1.4, s * 0.03);
    x.beginPath();
    x.arc(ex, ey, Math.max(3, s * 0.055), 0, TAU);
    x.fill();
    x.stroke();
    x.restore();
  }
}

function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  if (r <= 0.5) return;
  x.save();
  x.translate(cx, cy);
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  x.fillStyle = col;
  x.strokeStyle = INK;
  x.lineWidth = Math.max(1.5, r * 0.12);
  x.lineJoin = 'round';
  x.fill();
  x.stroke();
  x.restore();
}

/** toca a abertura por cima de `root` (resolve no fim, ao Pular ou no voltar) */
export function playIntro(root: HTMLElement): Promise<void> {
  return new MontaIntro(root).play();
}
