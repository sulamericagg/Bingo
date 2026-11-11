/* ============================================================
 *  MINIJOGO — PEÇA QUEBRADA (mangueira hidráulica, pino da esteira, alternador,
 *  parafuso do rotor, cilindro da caçamba).
 *  1 soltar 4 parafusos da tampa (girar) → 2 tirar a tampa (arrastar) → 3 tirar a peça
 *  quebrada (vaza óleo/solta fumaça) para a sucata → 4 peça nova: girar (botão ou toque)
 *  até bater com o molde e encaixar → 5 tampa de volta → 6 parafusos (toque: parafusadeira)
 *  → 7 testar (botão verde: a peça funciona, ponteiro no verde).
 * ============================================================ */
import { t } from '../../../../i18n';
import { tap as haptic } from '../../../../core/haptics';
import type { PartArt } from '../model';
import { rs } from '../sound';
import { clamp, drawIcon, drawNut, easeInOut, easeOut, glow, lin, NutPaint, rrect, softShadow, springOut, TAU, type C2 } from '../ui/art';
import { MiniGame, P, roundBtn, Twist, type MgCtx } from '../ui/overlay';
import { drawPart, PartPaint, silhouette } from '../ui/partart';

interface Obj {
  x: number;
  y: number;
  a: number;
}

export class PartGame extends MiniGame {
  private art: PartArt;
  private pp!: PartPaint;
  private np!: NutPaint;
  private bodyG!: CanvasGradient;
  private coverG!: CanvasGradient;
  private cavG!: CanvasGradient;
  private benchG!: CanvasGradient;
  private mx = 360;
  private my = 205;
  private cw = 300;
  private ch = 160;
  private tw = new Twist();
  private bolt = new Float32Array(4);
  private boltA = new Float32Array(4);
  /** 1 no lugar, 0 fora, 2 entrando (parafusadeira) */
  private boltOn = new Uint8Array(4).fill(1);
  private boltIn = new Float32Array(4);
  private act = -1;
  private flies: { on: boolean; t: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  private inTray = 0;
  private cover: Obj = { x: 0, y: 0, a: 0 };
  private coverHome = { x: 0, y: 0 };
  private coverAside = { x: 0, y: 0 };
  private coverTo: Obj | null = null;
  private old: Obj = { x: 0, y: 0, a: 0 };
  private oldGone = 0;
  private nw: Obj = { x: 0, y: 0, a: 0 };
  private rot = 2;
  private rotA = Math.PI;
  private nwHome = { x: 0, y: 0 };
  private nwBack = 0;
  private nwSnap = -1;
  private flash = 0;
  private drag: 'cover' | 'old' | 'new' | null = null;
  private ox = 0;
  private oy = 0;
  private moved = 0;
  private testT = -1;
  private btnP = 0;
  private trayX = 90;
  private trayY = 360;
  private binX = 600;
  private binY = 330;
  private spin = 0;

  constructor(ctx: MgCtx) {
    super(ctx);
    this.art = ctx.veh.art;
    this.rot = ctx.level >= 2 ? (Math.random() < 0.5 ? 1 : 3) : 2;
    this.rotA = (this.rot * Math.PI) / 2;
    this.steps = ['bolt', 'cover', 'part', 'rotate', 'cover', 'bolt', 'key'];
    this.voice = [
      () => t('gb.rep.v.bolts', 'Gire os parafusos para soltar a tampa.'),
      () => t('gb.rep.v.cover', 'Tire a tampa.'),
      () => t('gb.rep.v.broken', 'Tire a peça quebrada e jogue na sucata.'),
      () => t('gb.rep.v.newpart', 'Gire a peça nova até encaixar no molde.'),
      () => t('gb.rep.v.coverBack', 'Coloque a tampa de volta.'),
      () => t('gb.rep.v.boltsIn', 'Toque nos furos para parafusar.'),
      () => t('gb.rep.v.test', 'Agora teste a máquina!'),
    ];
    for (let i = 0; i < 4; i++) this.flies.push({ on: false, t: 0, x0: 0, y0: 0, x1: 0, y1: 0 });
  }

  setup(c: C2): void {
    const W = this.W;
    this.floorY = 340;
    this.mx = clamp(W * 0.36, 250, W - 450);
    this.my = 196;
    this.trayX = Math.max(80, this.mx - 250);
    this.trayY = 362;
    this.binX = this.mx + 272;
    this.binY = 318;
    this.pp = new PartPaint(c);
    this.np = new NutPaint(c, 11);
    const col = this.ctx.veh.body;
    this.bodyG = lin(c, 0, this.my - 150, 0, this.my + 150, [
      [0, '#ffffff'],
      [0.05, col],
      [0.6, col],
      [1, this.ctx.veh.bodyD],
    ]);
    this.coverG = lin(c, -this.cw / 2, -this.ch / 2, this.cw / 2, this.ch / 2, [
      [0, '#d9dee3'],
      [0.45, '#9ea7b0'],
      [1, '#5f6870'],
    ]);
    this.cavG = lin(c, 0, this.my - 80, 0, this.my + 80, [
      [0, '#0c0e10'],
      [1, '#2a2f35'],
    ]);
    this.benchG = lin(c, 0, 0, 0, 30, [
      [0, '#a8784c'],
      [1, '#6b4426'],
    ]);
    this.coverHome.x = this.mx;
    this.coverHome.y = this.my;
    this.coverAside.x = Math.max(110, this.mx - 175);
    this.coverAside.y = this.floorY - 6;
    if (this.step === 0 && this.cover.x === 0) {
      this.cover.x = this.mx;
      this.cover.y = this.my;
      this.old.x = this.mx;
      this.old.y = this.my;
    }
    this.nwHome.x = W - Math.max(120, W * 0.15);
    this.nwHome.y = 226;
    if (this.nw.x === 0) {
      this.nw.x = this.nwHome.x;
      this.nw.y = this.nwHome.y;
    }
    this.fx.floor = this.floorY + 10;
  }

  /* ------------------------------ geometria ------------------------------ */
  private boltPos(i: number): [number, number] {
    const x = this.cover.x + (i % 2 ? 1 : -1) * (this.cw / 2 - 20);
    const y = this.cover.y + (i < 2 ? -1 : 1) * (this.ch / 2 - 20);
    return [x, y];
  }
  private rotBtn(): [number, number] {
    return [this.nwHome.x, this.nwHome.y + 92];
  }
  private testBtn(): [number, number] {
    return [this.mx + 200, this.my - 100];
  }
  private trayPos(k: number): [number, number] {
    return [this.trayX - 30 + k * 20, this.trayY - 4];
  }

  private hintFor(): void {
    const s = this.step;
    if (s === 0 || s === 5) {
      let i = 0;
      while (i < 4 && (s === 0 ? !this.boltOn[i] : this.boltOn[i] === 1)) i++;
      if (i >= 4) return this.noHint();
      const [x, y] = this.boltPos(i);
      if (s === 0) this.setHint('circle', x, y, -1, 0, 24);
      else this.setHint('tap', x, y);
    } else if (s === 1) this.setHint('drag', this.cover.x + 60, this.cover.y, this.coverAside.x, this.coverAside.y);
    else if (s === 2) this.setHint('drag', this.old.x, this.old.y, this.binX, this.binY - 30);
    else if (s === 3) {
      if (this.rot !== 0) {
        const [x, y] = this.rotBtn();
        this.setHint('tap', x, y);
      } else this.setHint('drag', this.nw.x, this.nw.y, this.mx, this.my);
    } else if (s === 4) this.setHint('drag', this.cover.x, this.cover.y, this.mx, this.my);
    else if (s === 6) {
      const [x, y] = this.testBtn();
      this.setHint('tap', x, y);
    }
  }

  /* ------------------------------ toques ------------------------------ */
  down(x: number, y: number): void {
    const s = this.step;
    this.moved = 0;
    if (s === 0) {
      let best = -1;
      let bd = 50;
      for (let i = 0; i < 4; i++) {
        if (!this.boltOn[i]) continue;
        const [bx, by] = this.boltPos(i);
        const d = Math.hypot(x - bx, y - by);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        this.act = best;
        const [bx, by] = this.boltPos(best);
        this.tw.reset();
        this.tw.start(bx, by, x, y);
      }
    } else if ((s === 1 || s === 4) && Math.abs(x - this.cover.x) < this.cw / 2 + 10 && Math.abs(y - this.cover.y) < this.ch / 2 + 10) {
      this.drag = 'cover';
      this.coverTo = null;
    } else if (s === 2 && Math.hypot(x - this.old.x, y - this.old.y) < 110) this.drag = 'old';
    else if (s === 3) {
      const [rx, ry] = this.rotBtn();
      if (Math.hypot(x - rx, y - ry) < 40) return this.rotate();
      if (Math.hypot(x - this.nw.x, y - this.nw.y) < 110 && this.nwSnap < 0) {
        this.drag = 'new';
        this.nwBack = 0;
      }
    } else if (s === 5) {
      for (let i = 0; i < 4; i++) {
        if (this.boltOn[i] !== 0) continue;
        const [bx, by] = this.boltPos(i);
        if (Math.hypot(x - bx, y - by) < 46) {
          this.boltOn[i] = 2;
          this.boltIn[i] = 0;
          this.inTray = Math.max(0, this.inTray - 1);
          rs.impact(0.45);
          haptic('medium');
          break;
        }
      }
    } else if (s === 6) {
      const [bx, by] = this.testBtn();
      if (Math.hypot(x - bx, y - by) < 50 && this.testT < 0) {
        this.testT = 0;
        this.btnP = 1;
        rs.start();
        haptic('heavy');
      }
    }
    if (this.drag) {
      const o = this.drag === 'cover' ? this.cover : this.drag === 'old' ? this.old : this.nw;
      this.ox = o.x - x;
      this.oy = o.y - y;
      rs.slide();
    }
  }
  private rotate(): void {
    this.rot = (this.rot + 1) % 4;
    rs.tick();
    rs.slide();
    haptic('light');
  }
  move(x: number, y: number): void {
    if (this.act >= 0 && this.step === 0) {
      const d = this.tw.move(x, y);
      this.boltA[this.act] += d;
      return;
    }
    if (!this.drag) return;
    const o = this.drag === 'cover' ? this.cover : this.drag === 'old' ? this.old : this.nw;
    const nx = clamp(x + this.ox, 40, this.W - 40);
    const ny = clamp(y + this.oy, 70, this.floorY);
    this.moved += Math.abs(nx - o.x) + Math.abs(ny - o.y);
    o.x = nx;
    o.y = ny;
  }
  up(): void {
    this.tw.end();
    this.act = -1;
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d === 'cover') {
      if (this.step === 1 && Math.hypot(this.cover.x - this.mx, this.cover.y - this.my) > 90) {
        this.coverTo = { x: this.coverAside.x, y: this.coverAside.y, a: -0.25 };
        rs.thud();
      } else if (this.step === 4 && Math.hypot(this.cover.x - this.mx, this.cover.y - this.my) < 80) {
        this.coverTo = { x: this.mx, y: this.my, a: 0 };
        rs.snap();
        haptic('heavy');
      } else this.coverTo = this.step === 1 ? { x: this.mx, y: this.my, a: 0 } : { x: this.coverAside.x, y: this.coverAside.y, a: -0.25 };
    } else if (d === 'old') {
      if (Math.hypot(this.old.x - this.mx, this.old.y - this.my) > 120) {
        this.oldGone = 0.001;
        rs.slide();
      }
    } else if (d === 'new') {
      if (this.moved < 8) return this.rotate();
      const near = Math.hypot(this.nw.x - this.mx, this.nw.y - this.my) < 70;
      if (near && this.rot === 0) {
        this.nwSnap = 0;
        rs.snap();
        haptic('heavy');
      } else {
        if (near) {
          // orientação errada: o molde pisca e o botão de girar chama
          this.flash = 1;
          rs.nope();
          haptic('medium');
        }
        this.nwBack = 1;
      }
    }
  }

  /* ------------------------------ lógica ------------------------------ */
  update(dt: number): void {
    const s = this.step;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.btnP = Math.max(0, this.btnP - dt * 4);
    // ângulo da peça nova acompanha o giro (com mola)
    let want = (this.rot * Math.PI) / 2;
    while (want - this.rotA > Math.PI) want -= TAU;
    while (want - this.rotA < -Math.PI) want += TAU;
    this.rotA += (want - this.rotA) * Math.min(1, dt * 12);
    this.nw.a = this.rotA;
    if (s === 0 && this.act >= 0) {
      const k = Math.abs(this.tw.acc) / (TAU * 0.9);
      this.bolt[this.act] = Math.min(1, k);
      if (k >= 1) {
        const i = this.act;
        this.boltOn[i] = 0;
        const [bx, by] = this.boltPos(i);
        const [tx, ty] = this.trayPos(this.inTray++);
        const f = this.flies[i];
        Object.assign(f, { on: true, t: 0, x0: bx, y0: by, x1: tx, y1: ty });
        rs.pop();
        haptic('medium');
        this.act = -1;
        this.tw.reset();
        if (!this.boltOn.some((v) => v)) this.next();
      }
    }
    for (const f of this.flies) {
      if (!f.on) continue;
      f.t += dt / 0.7;
      if (f.t >= 1) {
        f.on = false;
        rs.clink();
      }
    }
    if (this.coverTo) {
      const k = Math.min(1, dt * 9);
      this.cover.x += (this.coverTo.x - this.cover.x) * k;
      this.cover.y += (this.coverTo.y - this.cover.y) * k;
      this.cover.a += (this.coverTo.a - this.cover.a) * k;
      if (Math.hypot(this.cover.x - this.coverTo.x, this.cover.y - this.coverTo.y) < 1.5) {
        this.cover.x = this.coverTo.x;
        this.cover.y = this.coverTo.y;
        if (s === 1 && this.coverTo.x !== this.mx) this.next();
        if (s === 4 && this.coverTo.x === this.mx) {
          this.cover.a = 0;
          this.next();
        }
        this.coverTo = null;
      }
    }
    // peça velha vazando / voando para a sucata
    if (s <= 2 && !this.oldGone) {
      if (this.art === 'hose' || this.art === 'cyl') {
        if (Math.random() < dt * 5) this.fx.emit(P.drop, (s === 2 ? this.old.x : this.mx) + 6, (s === 2 ? this.old.y : this.my + this.ch / 2) + 12, 0, 40, 1.6, 3.5, 1);
      } else if (this.art === 'alt' && Math.random() < dt * 4) this.fx.emit(P.smoke, (s === 2 ? this.old.x : this.mx) + 10, (s === 2 ? this.old.y : this.my) - 20, (Math.random() - 0.5) * 20, -30, 1.4, 9);
    }
    if (this.oldGone > 0 && this.oldGone < 1) {
      this.oldGone = Math.min(1, this.oldGone + dt * 2.2);
      if (this.oldGone >= 1) {
        rs.thud();
        this.fx.burst(P.dust, this.binX, this.binY - 40, 8, 80, 0.7, 7);
        this.next();
      }
    }
    if (s === 3) {
      if (this.nwBack > 0) {
        this.nwBack = Math.max(0, this.nwBack - dt * 3);
        const k = 1 - this.nwBack;
        this.nw.x += (this.nwHome.x - this.nw.x) * easeOut(k) * 0.3;
        this.nw.y += (this.nwHome.y - this.nw.y) * easeOut(k) * 0.3;
      }
      if (this.nwSnap >= 0) {
        this.nwSnap += dt * 2.5;
        this.nw.x += (this.mx - this.nw.x) * Math.min(1, dt * 14);
        this.nw.y += (this.my - this.nw.y) * Math.min(1, dt * 14);
        if (this.nwSnap >= 1) {
          this.nw.x = this.mx;
          this.nw.y = this.my;
          this.fx.burst(P.star, this.mx, this.my, 14, 240, 0.7, 8);
          this.next();
        }
      }
    }
    if (s === 5) {
      for (let i = 0; i < 4; i++) {
        if (this.boltOn[i] !== 2) continue;
        this.boltIn[i] += dt / 0.45;
        this.boltA[i] += dt * 40;
        if (this.boltIn[i] >= 1) {
          this.boltOn[i] = 1;
          rs.snap();
          const [bx, by] = this.boltPos(i);
          this.fx.burst(P.star, bx, by, 5, 90, 0.4, 5);
        }
      }
      if (this.boltOn.every((v) => v === 1)) this.next();
    }
    if (this.testT >= 0) {
      this.testT += dt;
      this.spin += dt * 6 * Math.min(1, this.testT);
      if (this.testT > 1.1 && s === 6) this.next();
    }
    if (this.step < this.steps.length) this.hintFor();
  }

  /* ------------------------------ desenho ------------------------------ */
  draw(c: C2): void {
    const { mx, my, cw, ch } = this;
    const s = this.step;
    // corpo da máquina (chapa pintada com rebites e faixa de aviso)
    softShadow(c, mx, this.floorY + 4, 280, 14, 0.5);
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    rrect(c, mx - 222 + 6, my - 136 + 8, 444, 280, 26);
    c.fill();
    c.fillStyle = this.bodyG;
    c.beginPath();
    rrect(c, mx - 222, my - 136, 444, 280, 26);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(mx - 200, my - 126, 400, 5);
    c.fillStyle = '#5b636b';
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.arc(mx - 200 + i * 50, my + 128, 3.5, 0, TAU);
      c.arc(mx - 200 + i * 50, my - 116, 3.5, 0, TAU);
      c.fill();
    }
    // faixa zebrada embaixo
    c.save();
    c.beginPath();
    c.rect(mx - 222, my + 104, 444, 14);
    c.clip();
    c.fillStyle = '#1d1f22';
    c.fillRect(mx - 222, my + 104, 444, 14);
    c.fillStyle = '#ffcf2e';
    for (let x = mx - 240; x < mx + 240; x += 22) {
      c.beginPath();
      c.moveTo(x, my + 118);
      c.lineTo(x + 11, my + 104);
      c.lineTo(x + 20, my + 104);
      c.lineTo(x + 9, my + 118);
      c.fill();
    }
    c.restore();
    // compartimento
    c.fillStyle = this.cavG;
    c.beginPath();
    rrect(c, mx - cw / 2 + 8, my - ch / 2 + 8, cw - 16, ch - 16, 12);
    c.fill();
    // molde (silhueta) da peça
    c.save();
    c.translate(mx, my);
    silhouette(c, this.art, 'rgba(0,0,0,.5)', null);
    if (s >= 2 && s <= 3) {
      c.globalAlpha = clamp(0.45 + 0.35 * Math.sin(this.t * 5) + this.flash * 0.5, 0, 1);
      silhouette(c, this.art, 'rgba(0,0,0,0)', '#ffdc5a', 3);
      c.globalAlpha = 1;
    }
    if (s === 3) {
      c.setLineDash([8, 7]);
      c.lineDashOffset = -this.t * 20;
      silhouette(c, this.art, 'rgba(0,0,0,0)', this.flash > 0 ? '#ff5a3a' : 'rgba(255,240,170,.95)', 2.5);
      c.setLineDash([]);
    }
    c.restore();
    // medidor (pressão/carga) no painel
    this.drawGauge(c, mx - 170, my - 90);
    // peça velha
    if (this.oldGone < 1) {
      const k = easeInOut(this.oldGone);
      const x = this.old.x + (this.binX - this.old.x) * k;
      const y = this.old.y + (this.binY - 40 - this.old.y) * k - Math.sin(k * Math.PI) * 120;
      c.save();
      c.translate(x, y);
      c.rotate(this.old.a + k * 3);
      const sc = 1 - k * 0.45;
      c.scale(sc, sc);
      drawPart(c, this.pp, this.art, true, this.t);
      c.restore();
    }
    // peça nova (encaixada fica no compartimento)
    if (s >= 3) this.drawNew(c);
    // bancada, sucata e bandeja
    this.drawBench(c);
    this.drawBin(c);
    this.drawTray(c);
    // tampa
    this.drawCover(c);
    // parafusos voando
    for (const f of this.flies) {
      if (!f.on) continue;
      const k = f.t;
      drawNut(c, this.np, f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 110, k * 12, 'bolt', 1 + Math.sin(k * Math.PI) * 0.4, Math.sin(k * Math.PI));
    }
    // botão de teste
    if (s >= 6 || this.testT >= 0) {
      const [bx, by] = this.testBtn();
      roundBtn(c, bx, by, 34, 'key', '#3cbf5a', '#1d7a35', this.btnP, this.testT < 0 ? 0.5 + 0.5 * Math.sin(this.t * 6) : 0);
    }
    // anel de progresso do parafuso
    if (this.act >= 0 && s === 0) {
      const [bx, by] = this.boltPos(this.act);
      c.strokeStyle = 'rgba(0,0,0,.4)';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(bx, by, 26, 0, TAU);
      c.stroke();
      c.strokeStyle = '#ffcf2e';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(bx, by, 26, -Math.PI / 2, -Math.PI / 2 + TAU * this.bolt[this.act]);
      c.stroke();
    }
  }

  private drawNew(c: C2): void {
    const n = this.nw;
    const s = this.step;
    if (s === 3 && this.nwSnap < 0) {
      // botão de girar ao lado
      const [rx, ry] = this.rotBtn();
      roundBtn(c, rx, ry, 26, 'rotate', '#3a9be6', '#1d5fa8', 0, this.rot !== 0 ? 0.5 + 0.5 * Math.sin(this.t * 6) + this.flash : 0);
    }
    c.save();
    c.translate(n.x, n.y);
    c.rotate(n.a);
    const lift = this.drag === 'new' ? 1.06 : 1;
    c.scale(lift, lift);
    drawPart(c, this.pp, this.art, false, this.t, this.spin);
    c.restore();
    // brilho de "peça nova"
    if (s === 3 && this.nwSnap < 0) {
      const k = (this.t * 0.7) % 1;
      glow(c, n.x - 90 + k * 180, n.y - 10, 22, 0.5 * Math.sin(k * Math.PI), true);
    }
  }

  private drawCover(c: C2): void {
    const o = this.cover;
    const { cw, ch } = this;
    c.save();
    c.translate(o.x, o.y);
    c.rotate(o.a);
    // longe do lugar: encolhe (deitada no chão, mais longe da câmera)
    const away = clamp(Math.hypot(o.x - this.mx, o.y - this.my) / 160, 0, 1);
    const sc = 1 - away * 0.38;
    c.scale(sc, sc);
    const lifted = this.drag === 'cover' ? 1 : 0;
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    rrect(c, -cw / 2 + 5 + lifted * 6, -ch / 2 + 7 + lifted * 8, cw, ch, 14);
    c.fill();
    c.fillStyle = this.coverG;
    c.beginPath();
    rrect(c, -cw / 2, -ch / 2, cw, ch, 14);
    c.fill();
    c.strokeStyle = 'rgba(30,34,38,.7)';
    c.lineWidth = 2;
    c.stroke();
    // chapa xadrez (antiderrapante)
    c.strokeStyle = 'rgba(255,255,255,.22)';
    c.lineWidth = 2.5;
    for (let y = -ch / 2 + 26; y < ch / 2 - 16; y += 18)
      for (let x = -cw / 2 + 40; x < cw / 2 - 30; x += 22) {
        c.beginPath();
        const d = ((x + y) / 2) % 2 ? 1 : -1;
        c.moveTo(x - 5, y - 4 * d);
        c.lineTo(x + 5, y + 4 * d);
        c.stroke();
      }
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(-cw / 2 + 14, -ch / 2 + 6, cw - 28, 3);
    c.restore();
    // parafusos (só presos na tampa)
    for (let i = 0; i < 4; i++) {
      const [bx, by] = this.boltPos(i);
      if (this.boltOn[i] === 1) {
        const lift = this.step === 0 && this.act === i ? this.bolt[i] : 0;
        drawNut(c, this.np, bx, by, this.boltA[i], 'bolt', 1 + lift * 0.2, lift);
      } else if (this.boltOn[i] === 2) {
        const k = 1 - this.boltIn[i];
        drawNut(c, this.np, bx, by, this.boltA[i], 'bolt', 1 + k * 0.25, k);
      } else if (this.step >= 4 && this.cover.x === this.mx) {
        c.fillStyle = '#121416';
        c.beginPath();
        c.arc(bx, by, 7, 0, TAU);
        c.fill();
        if (this.step === 5) glow(c, bx, by, 22 + 3 * Math.sin(this.t * 6), 0.5, true);
      }
    }
  }

  private drawBench(c: C2): void {
    const x = this.nwHome.x;
    const y = this.nwHome.y + 40;
    softShadow(c, x, this.floorY + 4, 120, 10, 0.5);
    c.fillStyle = '#3a3f45';
    c.fillRect(x - 100, y + 18, 12, this.floorY - y - 18);
    c.fillRect(x + 88, y + 18, 12, this.floorY - y - 18);
    c.save();
    c.translate(x - 118, y);
    c.fillStyle = this.benchG;
    c.beginPath();
    rrect(c, 0, 0, 236, 24, 5);
    c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.2)';
    c.fillRect(x - 114, y + 3, 228, 3);
  }

  private drawBin(c: C2): void {
    const x = this.binX;
    const y = this.binY;
    softShadow(c, x, this.floorY + 6, 50, 8, 0.5);
    c.fillStyle = '#7e1a12';
    c.beginPath();
    c.moveTo(x - 44, y - 40);
    c.lineTo(x + 44, y - 40);
    c.lineTo(x + 36, this.floorY + 4);
    c.lineTo(x - 36, this.floorY + 4);
    c.fill();
    c.fillStyle = '#c8321f';
    c.beginPath();
    c.moveTo(x - 40, y - 36);
    c.lineTo(x + 40, y - 36);
    c.lineTo(x + 33, this.floorY);
    c.lineTo(x - 33, this.floorY);
    c.fill();
    c.fillStyle = '#4a0e08';
    c.beginPath();
    c.ellipse(x, y - 40, 44, 8, 0, 0, TAU);
    c.fill();
    drawIcon(c, 'bin', x, y - 6, 30, 'rgba(255,255,255,.85)', 2.6);
    if (this.step === 2) glow(c, x, y - 40, 50 + 6 * Math.sin(this.t * 5), 0.3, true);
  }

  private drawTray(c: C2): void {
    const x = this.trayX;
    const y = this.trayY;
    c.fillStyle = '#22364c';
    c.beginPath();
    c.ellipse(x, y + 5, 52, 14, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#3c556e';
    c.beginPath();
    c.ellipse(x, y, 52, 14, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#16212d';
    c.beginPath();
    c.ellipse(x, y + 1, 44, 9, 0, 0, TAU);
    c.fill();
    for (let k = 0; k < this.inTray; k++) {
      let flying = false;
      for (const f of this.flies) if (f.on) flying = true;
      if (flying && k === this.inTray - 1) continue;
      const [tx, ty] = this.trayPos(k);
      drawNut(c, this.np, tx, ty, k, 'bolt', 0.75);
    }
  }

  /** ponteiro: vermelho (quebrado) → verde (testado) */
  private drawGauge(c: C2, x: number, y: number): void {
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    c.arc(x + 2, y + 4, 30, 0, TAU);
    c.fill();
    c.fillStyle = '#f4f1e8';
    c.beginPath();
    c.arc(x, y, 30, 0, TAU);
    c.fill();
    c.strokeStyle = '#2b2f35';
    c.lineWidth = 4;
    c.stroke();
    c.lineWidth = 7;
    c.strokeStyle = '#e0533c';
    c.beginPath();
    c.arc(x, y, 20, Math.PI * 0.8, Math.PI * 1.3);
    c.stroke();
    c.strokeStyle = '#ffcf2e';
    c.beginPath();
    c.arc(x, y, 20, Math.PI * 1.3, Math.PI * 1.7);
    c.stroke();
    c.strokeStyle = '#3cbf5a';
    c.beginPath();
    c.arc(x, y, 20, Math.PI * 1.7, Math.PI * 2.2);
    c.stroke();
    const k = this.testT >= 0 ? springOut(Math.min(1, this.testT * 1.2)) : 0.05 + Math.sin(this.t * 9) * 0.03;
    const a = Math.PI * (0.85 + k * 1.2);
    c.strokeStyle = '#1d1f22';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24);
    c.stroke();
    c.fillStyle = '#1d1f22';
    c.beginPath();
    c.arc(x, y, 4, 0, TAU);
    c.fill();
  }
}
