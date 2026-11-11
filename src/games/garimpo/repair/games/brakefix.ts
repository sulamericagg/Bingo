/* ============================================================
 *  MINIJOGO — CONSERTAR O FREIO (depois da emergência na descida).
 *  1 ligar as mangueiras do cilindro-mestre nas rodas (cor/símbolo; errado espirra óleo)
 *  → 2 sangrar: bombear o pedal até as bolhas de ar sumirem da mangueirinha
 *  → 3 completar o fluido: levar o frasco até o reservatório e segurar até o MAX
 *  → 4 testar: pisar no pedal (ponteiro no verde, luz de freio acende).
 * ============================================================ */
import { t } from '../../../../i18n';
import { tap as haptic } from '../../../../core/haptics';
import { rs } from '../sound';
import { clamp, drawIcon, glow, lin, rrect, softShadow, springOut, TAU, type C2 } from '../ui/art';
import { MiniGame, P, Pump, type MgCtx } from '../ui/overlay';
import { RopePuzzle, shuffle } from '../ui/rope';

export class BrakeGame extends MiniGame {
  private n: number;
  private pz: RopePuzzle;
  private pump = new Pump(90);
  private air: number;
  private air0: number;
  private bub = 0;
  private level = 0.22;
  private bottle = { x: 0, y: 0, a: 0 };
  private bHome = { x: 0, y: 0 };
  private dragB = false;
  private ox = 0;
  private oy = 0;
  private pouring = 0;
  private testT = -1;
  private mcX = 170;
  private mcY = 160;
  private cylG!: CanvasGradient;
  private resG!: CanvasGradient;
  private fluidG!: CanvasGradient;
  private bottleG!: CanvasGradient;
  private calG!: CanvasGradient;
  private built = false;
  private perm: number[];
  private pourT = 0;

  constructor(ctx: MgCtx) {
    super(ctx);
    this.n = [2, 3, 3, 4][clamp(ctx.level, 0, 3)];
    this.perm = shuffle(this.n, ctx.level === 0);
    this.air0 = this.air = [3, 4, 5, 6][clamp(ctx.level, 0, 3)];
    this.pz = new RopePuzzle('hose', this.fx);
    this.steps = ['hose', 'pedal', 'bottle', 'check'];
    this.voice = [
      () => t('gb.rep.v.hoses', 'Ligue as mangueiras do freio na roda da mesma cor.'),
      () => t('gb.rep.v.bleed', 'Bombeie o pedal até as bolhas sumirem.'),
      () => t('gb.rep.v.fluid', 'Complete o óleo de freio até a marca.'),
      () => t('gb.rep.v.pedal', 'Pise no freio para testar!'),
    ];
  }

  setup(c: C2): void {
    const W = this.W;
    this.floorY = 352;
    this.mcX = Math.max(150, W * 0.22);
    this.mcY = 168;
    this.cylG = lin(c, 0, -24, 0, 24, [
      [0, '#e4e8ec'],
      [0.4, '#9aa3ab'],
      [1, '#4a5158'],
    ]);
    this.resG = lin(c, -46, 0, 46, 0, [
      [0, 'rgba(230,235,240,.18)'],
      [0.5, 'rgba(255,255,255,.38)'],
      [1, 'rgba(200,205,210,.18)'],
    ]);
    this.fluidG = lin(c, 0, 0, 0, 60, [
      [0, '#ffd75a'],
      [1, '#c88a10'],
    ]);
    this.bottleG = lin(c, -20, 0, 20, 0, [
      [0, '#b07a10'],
      [0.4, '#ffd75a'],
      [1, '#8a5a08'],
    ]);
    this.calG = lin(c, 0, -26, 0, 26, [
      [0, '#ff6a4a'],
      [0.5, '#c8321f'],
      [1, '#6a140c'],
    ]);
    this.bHome.x = W * 0.52;
    this.bHome.y = this.floorY - 44;
    if (!this.bottle.x) {
      this.bottle.x = this.bHome.x;
      this.bottle.y = this.bHome.y;
    }
    if (!this.built) {
      this.built = true;
      const n = this.n;
      const anchors: [number, number][] = [];
      const rest: [number, number][] = [];
      const socks: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        anchors.push([this.mcX + 72, this.mcY - 14 + i * 12]);
        rest.push([this.mcX + 110 + i * 40, 300 - (i % 2) * 26]);
      }
      const sx = W * 0.8;
      for (let i = 0; i < n; i++) socks.push([sx, 96 + (n === 1 ? 0 : (i * 190) / (n - 1))]);
      this.pz.build(anchors, rest, socks, this.perm);
    }
    this.fx.floor = this.floorY;
  }

  private pedalPad(): [number, number] {
    const a = 1.25 - this.pump.pos * 0.45 - (this.testT >= 0 ? 0.45 * Math.min(1, this.testT * 4) : 0);
    return [this.mcX - 60 + Math.cos(a) * 140, this.mcY + 30 + Math.sin(a) * 140];
  }
  private resTop(): [number, number] {
    return [this.mcX, this.mcY - 88];
  }

  private hintFor(): void {
    const s = this.step;
    if (s === 0) {
      const w = this.pz.nextHint();
      if (!w) return this.noHint();
      const so = this.pz.sockets[w.target];
      this.setHint('drag', w.rope.ex, w.rope.ey, so.x, so.y);
    } else if (s === 1 || s === 3) {
      const [x, y] = this.pedalPad();
      if (s === 1) this.setHint('pump', x, y - 10, x - 20, y + 50);
      else this.setHint('tap', x, y);
    } else if (s === 2) {
      const [rx, ry] = this.resTop();
      if (this.dragB) this.setHint('hold', rx + 30, ry - 50);
      else this.setHint('drag', this.bottle.x, this.bottle.y, rx + 40, ry - 60);
    }
  }

  down(x: number, y: number): void {
    const s = this.step;
    if (s === 0) this.pz.down(x, y);
    else if (s === 1) {
      const [px, py] = this.pedalPad();
      if (Math.hypot(x - px, y - py) < 70) this.pump.start(y);
    } else if (s === 2 && Math.hypot(x - this.bottle.x, y - this.bottle.y) < 60) {
      this.dragB = true;
      this.ox = this.bottle.x - x;
      this.oy = this.bottle.y - y;
      rs.tick();
    } else if (s === 3 && this.testT < 0) {
      const [px, py] = this.pedalPad();
      if (Math.hypot(x - px, y - py) < 80) {
        this.testT = 0;
        rs.snap();
        haptic('heavy');
      }
    }
  }
  move(x: number, y: number): void {
    const s = this.step;
    if (s === 0) this.pz.move(x, y);
    else if (s === 1 && this.pump.move(y)) {
      // cada pisada empurra uma bolha de ar para fora
      if (this.air > 0) {
        this.air--;
        this.bub = 1;
        for (let i = 0; i < 4; i++) window.setTimeout(() => rs.bubble(), i * 90);
      }
      rs.jack(false);
      haptic('medium');
    } else if (s === 2 && this.dragB) {
      this.bottle.x = clamp(x + this.ox, 40, this.W - 40);
      this.bottle.y = clamp(y + this.oy, 60, this.bHome.y);
    }
  }
  up(): void {
    this.pump.end();
    if (this.step === 0) this.pz.up();
    if (this.dragB) this.dragB = false;
  }

  update(dt: number): void {
    const s = this.step;
    this.pump.relax(dt);
    this.pz.update(dt);
    this.bub = Math.max(0, this.bub - dt * 0.8);
    if (s === 0 && this.pz.allDone) this.next();
    if (s === 1 && this.air <= 0 && this.bub <= 0.2 && !this.pump.active) this.next();
    if (s === 2) {
      const [rx, ry] = this.resTop();
      const over = this.dragB && Math.abs(this.bottle.x - (rx + 40)) < 60 && this.bottle.y < ry + 10;
      this.pouring += ((over ? 1 : 0) - this.pouring) * Math.min(1, dt * 8);
      this.bottle.a = this.pouring * -1.9;
      if (!this.dragB) {
        this.bottle.x += (this.bHome.x - this.bottle.x) * Math.min(1, dt * 6);
        this.bottle.y += (this.bHome.y - this.bottle.y) * Math.min(1, dt * 6);
      }
      if (this.pouring > 0.7) {
        this.level = Math.min(1, this.level + dt * 0.28);
        this.pourT -= dt;
        if (this.pourT <= 0) {
          this.pourT = 0.28;
          rs.pour(0.3);
        }
        if (this.level >= 1) {
          this.dragB = false;
          rs.snap();
          this.fx.burst(P.good, rx, ry + 30, 12, 160, 0.6, 6);
          this.next();
        }
      }
    }
    if (this.testT >= 0) {
      this.testT += dt;
      if (this.testT > 1.0 && s === 3) this.next();
    }
    if (this.step < this.steps.length) this.hintFor();
  }

  draw(c: C2): void {
    const s = this.step;
    // pinças (rodas) à direita, atrás das tomadas
    for (const so of this.pz.sockets) {
      c.save();
      c.translate(so.x + 34, so.y);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath();
      c.arc(6, 6, 34, 0, TAU);
      c.fill();
      c.fillStyle = '#6e6862';
      c.beginPath();
      c.arc(0, 0, 34, 0, TAU);
      c.fill();
      c.fillStyle = '#4a4540';
      c.beginPath();
      c.arc(0, 0, 14, 0, TAU);
      c.fill();
      c.fillStyle = this.calG;
      c.beginPath();
      rrect(c, -30, -24, 34, 48, 10);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.3)';
      c.fillRect(-26, -20, 6, 40);
      c.restore();
    }
    this.drawBleed(c);
    this.drawMaster(c);
    this.drawPedal(c);
    this.pz.drawSockets(c, this.t, s === 0 ? this.pz.nextHint()?.col ?? -1 : -1);
    this.pz.drawWires(c);
    this.drawBottle(c);
    this.drawGauge(c, this.W * 0.52, 92);
  }

  private drawMaster(c: C2): void {
    const { mcX, mcY } = this;
    // cilindro-mestre
    softShadow(c, mcX, this.floorY + 4, 120, 10, 0.4);
    c.save();
    c.translate(mcX, mcY);
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    rrect(c, -70 + 5, -24 + 6, 150, 48, 16);
    c.fill();
    c.fillStyle = this.cylG;
    c.beginPath();
    rrect(c, -70, -24, 150, 48, 16);
    c.fill();
    c.strokeStyle = '#2b2f35';
    c.lineWidth = 2;
    c.stroke();
    for (const x of [-40, 0, 40]) {
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.fillRect(x, -24, 4, 48);
    }
    // reservatório translúcido
    const rw = 92;
    const rh = 62;
    const ry = -88;
    c.fillStyle = 'rgba(30,26,20,.5)';
    c.beginPath();
    rrect(c, -rw / 2, ry, rw, rh, 10);
    c.fill();
    // fluido
    const lv = clamp(this.level, 0, 1);
    c.save();
    c.beginPath();
    rrect(c, -rw / 2, ry, rw, rh, 10);
    c.clip();
    const fh = rh * 0.85 * lv;
    c.translate(0, ry + rh - fh);
    c.fillStyle = this.fluidG;
    c.fillRect(-rw / 2, 0, rw, fh);
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.beginPath();
    c.ellipse(Math.sin(this.t * 3) * 6, 0, rw * 0.42, 3 + this.pouring * 2, 0, 0, TAU);
    c.fill();
    c.restore();
    c.fillStyle = this.resG;
    c.beginPath();
    rrect(c, -rw / 2, ry, rw, rh, 10);
    c.fill();
    c.strokeStyle = 'rgba(40,40,40,.6)';
    c.lineWidth = 2;
    c.stroke();
    // marca MAX (verde) e MIN (vermelha)
    const yMax = ry + rh - rh * 0.85;
    c.strokeStyle = '#2fb34a';
    c.lineWidth = 3;
    c.setLineDash([6, 4]);
    c.beginPath();
    c.moveTo(-rw / 2 + 4, yMax);
    c.lineTo(rw / 2 - 4, yMax);
    c.stroke();
    c.strokeStyle = '#e53b2f';
    c.beginPath();
    c.moveTo(-rw / 2 + 4, ry + rh - rh * 0.3);
    c.lineTo(rw / 2 - 4, ry + rh - rh * 0.3);
    c.stroke();
    c.setLineDash([]);
    drawIcon(c, 'check', rw / 2 + 14, yMax, 16, '#2fb34a', 3);
    // tampa
    c.fillStyle = '#1d1f22';
    c.beginPath();
    rrect(c, -28, ry - 12, 56, 14, 5);
    c.fill();
    c.restore();
  }

  private drawPedal(c: C2): void {
    const px0 = this.mcX - 60;
    const py0 = this.mcY + 30;
    const [x, y] = this.pedalPad();
    // haste do pedal até o cilindro
    c.strokeStyle = '#9aa2aa';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(px0 + Math.cos(1.25 - this.pump.pos * 0.45) * 50, py0 + Math.sin(1.25 - this.pump.pos * 0.45) * 50);
    c.lineTo(this.mcX - 70, this.mcY);
    c.stroke();
    c.lineCap = 'round';
    c.strokeStyle = '#2b2f35';
    c.lineWidth = 14;
    c.beginPath();
    c.moveTo(px0, py0);
    c.lineTo(x, y);
    c.stroke();
    c.strokeStyle = '#5b636b';
    c.lineWidth = 8;
    c.stroke();
    c.fillStyle = '#5b636b';
    c.beginPath();
    c.arc(px0, py0, 10, 0, TAU);
    c.fill();
    // sapata de borracha
    c.save();
    c.translate(x, y);
    c.rotate(0.35);
    c.fillStyle = '#1d1f22';
    c.beginPath();
    rrect(c, -34, -12, 68, 24, 8);
    c.fill();
    c.strokeStyle = '#4a4e54';
    c.lineWidth = 2;
    for (let k = -24; k <= 24; k += 8) {
      c.beginPath();
      c.moveTo(k, -8);
      c.lineTo(k, 8);
      c.stroke();
    }
    c.restore();
    if (this.step === 1 || (this.step === 3 && this.testT < 0)) glow(c, x, y, 40 + 5 * Math.sin(this.t * 5), 0.3, true);
    // bolinhas do ar restante
    if (this.step === 1)
      for (let i = 0; i < this.air0; i++) {
        const on = i < this.air;
        c.strokeStyle = on ? '#e8f6ff' : 'rgba(255,255,255,.25)';
        c.fillStyle = on ? 'rgba(160,210,255,.35)' : 'rgba(0,0,0,0)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x + 60 + i * 18, y - 10, 6, 0, TAU);
        c.fill();
        c.stroke();
      }
  }

  /** mangueirinha transparente da sangria (da primeira roda até o frasco de coleta) */
  private drawBleed(c: C2): void {
    const so = this.pz.sockets[0];
    if (!so) return;
    const x0 = so.x + 34;
    const y0 = so.y + 24;
    const bx = this.W - 50;
    const by = this.floorY - 40;
    // frasco de coleta
    c.fillStyle = 'rgba(220,235,245,.35)';
    c.beginPath();
    rrect(c, bx - 22, by - 10, 44, 54, 8);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.6)';
    c.lineWidth = 2;
    c.stroke();
    const used = 1 - this.air / this.air0;
    c.fillStyle = 'rgba(200,140,20,.75)';
    c.fillRect(bx - 18, by + 40 - used * 30, 36, used * 30);
    // mangueira
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(230,240,250,.5)';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(x0, y0);
    c.bezierCurveTo(x0 + 10, y0 + 120, bx - 30, by - 90, bx, by - 6);
    c.stroke();
    if (this.step >= 1) {
      // fluido dentro (fica âmbar quando o ar sai)
      c.strokeStyle = used >= 1 ? 'rgba(220,160,20,.85)' : 'rgba(220,160,20,.4)';
      c.lineWidth = 3.5;
      c.stroke();
      // bolhas descendo pela mangueira logo depois de pisar
      if (this.bub > 0) {
        for (let k = 0; k < 4; k++) {
          const u = clamp(1 - this.bub + k * 0.08, 0, 1);
          const iu = 1 - u;
          const X = iu * iu * iu * x0 + 3 * iu * iu * u * (x0 + 10) + 3 * iu * u * u * (bx - 30) + u * u * u * bx;
          const Y = iu * iu * iu * y0 + 3 * iu * iu * u * (y0 + 120) + 3 * iu * u * u * (by - 90) + u * u * u * (by - 6);
          c.fillStyle = '#eef8ff';
          c.beginPath();
          c.arc(X, Y, 3.2, 0, TAU);
          c.fill();
        }
        if (this.bub > 0.75 && Math.random() < 0.3) this.fx.emit(P.bubble, bx + (Math.random() - 0.5) * 20, by + 10, 0, -20, 0.8, 3);
      }
    }
  }

  private drawBottle(c: C2): void {
    const b = this.bottle;
    if (this.step > 2 && this.level >= 1) return;
    const [rx, ry] = this.resTop();
    // jato
    if (this.pouring > 0.5) {
      const mx = b.x + Math.cos(b.a - Math.PI / 2) * 46;
      const my = b.y + Math.sin(b.a - Math.PI / 2) * 46;
      c.strokeStyle = '#e8a818';
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(mx, my);
      c.quadraticCurveTo(mx - 10, my + 20, rx, ry + 8);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.5)';
      c.lineWidth = 2;
      c.stroke();
    }
    if (!this.dragB) softShadow(c, b.x, this.floorY + 4, 30, 6, 0.45);
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.a);
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath();
    rrect(c, -20 + 4, -34 + 5, 40, 74, 10);
    c.fill();
    c.fillStyle = this.bottleG;
    c.beginPath();
    rrect(c, -20, -34, 40, 74, 10);
    c.fill();
    c.fillStyle = '#d9d4c6';
    c.fillRect(-14, -46, 28, 14);
    c.fillStyle = '#c8321f';
    c.fillRect(-10, -52, 20, 8);
    // rótulo com gota
    c.fillStyle = '#f4f1e8';
    c.beginPath();
    rrect(c, -16, -12, 32, 34, 5);
    c.fill();
    c.fillStyle = '#d99a10';
    c.beginPath();
    c.moveTo(0, -6);
    c.quadraticCurveTo(9, 6, 0, 14);
    c.quadraticCurveTo(-9, 6, 0, -6);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(-15, -30, 5, 66);
    c.restore();
    if (this.step === 2 && !this.dragB) glow(c, b.x, b.y, 44 + 5 * Math.sin(this.t * 5), 0.3, true);
  }

  private drawGauge(c: C2, x: number, y: number): void {
    // manômetro + luz de freio
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    c.arc(x + 2, y + 4, 34, 0, TAU);
    c.fill();
    c.fillStyle = '#f4f1e8';
    c.beginPath();
    c.arc(x, y, 34, 0, TAU);
    c.fill();
    c.strokeStyle = '#2b2f35';
    c.lineWidth = 4;
    c.stroke();
    c.lineWidth = 7;
    c.strokeStyle = '#e0533c';
    c.beginPath();
    c.arc(x, y, 23, Math.PI * 0.8, Math.PI * 1.45);
    c.stroke();
    c.strokeStyle = '#3cbf5a';
    c.beginPath();
    c.arc(x, y, 23, Math.PI * 1.75, Math.PI * 2.2);
    c.stroke();
    const k = this.testT >= 0 ? springOut(Math.min(1, this.testT * 1.5)) : this.pump.pos * 0.25;
    const a = Math.PI * (0.85 + k * 1.25);
    c.strokeStyle = '#1d1f22';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * 27, y + Math.sin(a) * 27);
    c.stroke();
    // lâmpada de freio
    const on = this.testT > 0.2;
    c.fillStyle = on ? '#ff3a2a' : '#4a1a14';
    c.beginPath();
    rrect(c, x + 46, y - 14, 44, 28, 8);
    c.fill();
    if (on) glow(c, x + 68, y, 60, 0.7, true);
  }
}
