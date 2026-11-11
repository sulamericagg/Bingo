/* ============================================================
 *  MINIJOGO — BUCHAS DA SUSPENSÃO.
 *  1 puxar as 4 buchas velhas (rachadas, amassadas) para a sucata → 2 prensar as novas
 *  (bombear a alavanca da prensa: a bucha entra espremendo) → 3 parafusos (toque) →
 *  4 teste: empurrar o carro para baixo e soltar (balança macio e para).
 * ============================================================ */
import { t } from '../../../../i18n';
import { tap as haptic } from '../../../../core/haptics';
import { rs } from '../sound';
import { clamp, drawIcon, drawNut, easeInOut, glow, lin, NutPaint, rad, rrect, softShadow, TAU, type C2 } from '../ui/art';
import { MiniGame, P, Pump, type MgCtx } from '../ui/overlay';

const N = 4;
export class BushingGame extends MiniGame {
  private np!: NutPaint;
  private armG!: CanvasGradient;
  private railG!: CanvasGradient;
  private rubG!: CanvasGradient;
  private oldRubG!: CanvasGradient;
  private pressG!: CanvasGradient;
  private bodyG!: CanvasGradient;
  private ay = 236;
  private ex = new Float32Array(N);
  /** velha: 1 no lugar, 0 fora; deslocamento ao arrastar */
  private oldOn = new Uint8Array(N).fill(1);
  private oldDx = new Float32Array(N);
  private oldDy = new Float32Array(N);
  private oldFly = new Float32Array(N);
  /** nova: 0..1 entrando */
  private newK = new Float32Array(N);
  private boltK = new Float32Array(N);
  private cur = 0;
  private pressX = 0;
  private pump = new Pump(90);
  private drag = -1;
  private x0 = 0;
  private y0 = 0;
  private binX = 0;
  private binY = 0;
  /** teste: mola do carro */
  private bounce = 0;
  private bv = 0;
  private pushing = false;
  private py0 = 0;
  private tested = -1;
  private pumps: number;

  constructor(ctx: MgCtx) {
    super(ctx);
    this.pumps = ctx.level >= 2 ? 3 : 2;
    this.steps = ['bush', 'press', 'bolt', 'bounce'];
    this.voice = [
      () => t('gb.rep.v.oldBush', 'Puxe as buchas velhas para fora.'),
      () => t('gb.rep.v.press', 'Bombeie a prensa para colocar as buchas novas.'),
      () => t('gb.rep.v.boltsIn', 'Toque nos furos para parafusar.'),
      () => t('gb.rep.v.bounce', 'Empurre o carro para baixo e solte!'),
    ];
  }

  setup(c: C2): void {
    const W = this.W;
    this.floorY = 352;
    const cx = W / 2 - 34;
    const sp = Math.min(165, (W - 250) / 3.3);
    for (let i = 0; i < N; i++) this.ex[i] = cx + (i - 1.5) * sp;
    this.binX = W - 70;
    this.binY = 320;
    this.np = new NutPaint(c, 10);
    this.armG = lin(c, 0, -26, 0, 26, [
      [0, '#9aa2aa'],
      [0.3, '#5f676f'],
      [1, '#2b2f35'],
    ]);
    this.railG = lin(c, 0, 0, 0, 40, [
      [0, '#4a4f56'],
      [1, '#1d2024'],
    ]);
    this.rubG = rad(c, -8, -10, 2, 0, 0, 30, [
      [0, '#5a5d64'],
      [0.6, '#24262b'],
      [1, '#0c0d0f'],
    ]);
    this.oldRubG = rad(c, -8, -10, 2, 0, 0, 30, [
      [0, '#4a3f36'],
      [0.6, '#2a221d'],
      [1, '#100c0a'],
    ]);
    this.pressG = lin(c, -30, 0, 30, 0, [
      [0, '#7e1410'],
      [0.35, '#ff5a44'],
      [1, '#6a0f0b'],
    ]);
    this.bodyG = lin(c, 0, 0, 0, 80, [
      [0, '#ffffff'],
      [0.08, this.ctx.veh.body],
      [1, this.ctx.veh.bodyD],
    ]);
    if (!this.pressX) this.pressX = this.ex[0];
  }

  private hintFor(): void {
    const s = this.step;
    if (s === 0) {
      const i = this.oldOn.indexOf(1);
      if (i < 0) return this.noHint();
      this.setHint('drag', this.ex[i], this.ay, this.ex[i] + 30, this.ay + 100);
    } else if (s === 1) {
      const [hx, hy] = this.handle();
      this.setHint('pump', hx, hy - 10, hx, hy + 60);
    } else if (s === 2) {
      let i = 0;
      while (i < N && this.boltK[i] > 0) i++;
      if (i < N) this.setHint('tap', this.ex[i], this.ay);
      else this.noHint();
    } else if (s === 3) this.setHint('drag', this.W / 2, 92, this.W / 2, 150);
  }
  private handle(): [number, number] {
    const a = -0.7 + this.pump.pos * 0.9;
    return [this.pressX + 46 + Math.cos(a) * 92, 130 + Math.sin(a) * 92];
  }

  down(x: number, y: number): void {
    const s = this.step;
    this.x0 = x;
    this.y0 = y;
    if (s === 0) {
      for (let i = 0; i < N; i++)
        if (this.oldOn[i] && Math.hypot(x - this.ex[i], y - this.ay) < 44) {
          this.drag = i;
          rs.squish();
          break;
        }
    } else if (s === 1) {
      const [hx, hy] = this.handle();
      if (Math.hypot(x - hx, y - hy) < 70 || x > this.pressX + 20) this.pump.start(y);
    } else if (s === 2) {
      for (let i = 0; i < N; i++)
        if (this.boltK[i] === 0 && Math.hypot(x - this.ex[i], y - this.ay) < 46) {
          this.boltK[i] = 0.001;
          rs.impact(0.4);
          haptic('medium');
          break;
        }
    } else if (s === 3 && y < 190 && this.tested < 0) {
      this.pushing = true;
      this.py0 = y;
    }
  }
  move(x: number, y: number): void {
    const s = this.step;
    if (s === 0 && this.drag >= 0) {
      this.oldDx[this.drag] = clamp(x - this.x0, -90, 90);
      this.oldDy[this.drag] = clamp(y - this.y0, -40, 140);
    } else if (s === 1 && this.pump.move(y)) {
      const i = this.cur;
      this.newK[i] = Math.min(1, this.newK[i] + 1 / this.pumps);
      rs.squish();
      rs.jack(true);
      haptic('medium');
      this.fx.burst(P.dust, this.ex[i], this.ay - 20, 3, 50, 0.4, 4);
    } else if (s === 3 && this.pushing) this.bounce = clamp((y - this.py0) / 70, 0, 1) * 26;
  }
  up(): void {
    this.pump.end();
    if (this.step === 0 && this.drag >= 0) {
      const i = this.drag;
      this.drag = -1;
      if (Math.hypot(this.oldDx[i], this.oldDy[i]) > 50) {
        this.oldOn[i] = 0;
        this.oldFly[i] = 0.001;
        rs.pop();
        haptic('medium');
      }
    }
    if (this.step === 3 && this.pushing) {
      this.pushing = false;
      if (this.bounce > 12) {
        this.tested = 0;
        rs.boing();
      }
    }
  }

  update(dt: number): void {
    const s = this.step;
    this.pump.relax(dt);
    for (let i = 0; i < N; i++) {
      if (this.drag !== i && this.oldOn[i]) {
        this.oldDx[i] *= 1 - Math.min(1, dt * 12);
        this.oldDy[i] *= 1 - Math.min(1, dt * 12);
      }
      if (this.oldFly[i] > 0 && this.oldFly[i] < 1) {
        this.oldFly[i] = Math.min(1, this.oldFly[i] + dt * 2);
        if (this.oldFly[i] >= 1) rs.thud();
      }
      if (this.boltK[i] > 0 && this.boltK[i] < 1) {
        this.boltK[i] = Math.min(1, this.boltK[i] + dt / 0.45);
        if (this.boltK[i] >= 1) {
          rs.snap();
          this.fx.burst(P.star, this.ex[i], this.ay, 5, 90, 0.4, 5);
        }
      }
    }
    if (s === 0 && this.oldFly.every((v) => v >= 1)) this.next();
    if (s === 1) {
      const i = this.cur;
      if (this.newK[i] >= 1 && !this.pump.active) {
        if (i < N - 1) {
          this.cur++;
          rs.slide();
        } else this.next();
      }
      this.pressX += (this.ex[this.cur] - this.pressX) * Math.min(1, dt * 8);
    }
    if (s === 2 && this.boltK.every((v) => v >= 1)) this.next();
    if (s === 3) {
      if (!this.pushing) {
        // mola amortecida (buchas novas: macio e para logo)
        this.bv += (-this.bounce * 160 - this.bv * 7) * dt;
        this.bounce += this.bv * dt;
      }
      if (this.tested >= 0) {
        this.tested += dt;
        if (this.tested > 1.3) this.next();
      }
    }
    if (this.step < this.steps.length) this.hintFor();
  }

  draw(c: C2): void {
    const W = this.W;
    const ay = this.ay;
    const s = this.step;
    const bo = s === 3 ? this.bounce : 0;
    // carroceria em cima (cortada), longarina e suportes
    c.save();
    c.translate(0, bo);
    c.fillStyle = this.bodyG;
    c.beginPath();
    rrect(c, -20, 40, W + 40, 52, 0);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(-20, 86, W + 40, 6);
    c.save();
    c.translate(0, 92);
    c.fillStyle = this.railG;
    c.fillRect(-20, 0, W + 40, 40);
    c.restore();
    c.fillStyle = '#5c6168';
    for (let x = 20; x < W; x += 52) {
      c.beginPath();
      c.arc(x, 112, 3.5, 0, TAU);
      c.fill();
    }
    // suportes até os olhais 0 e 3
    for (const i of [0, 3]) {
      c.fillStyle = '#2b2f35';
      c.beginPath();
      c.moveTo(this.ex[i] - 30, 130);
      c.lineTo(this.ex[i] + 30, 130);
      c.lineTo(this.ex[i] + 22, ay - 20);
      c.lineTo(this.ex[i] - 22, ay - 20);
      c.fill();
    }
    if (s === 3 && this.tested < 0) glow(c, W / 2, 70, 60 + 6 * Math.sin(this.t * 5), 0.25, true);
    c.restore();
    // mola helicoidal entre longarina e braço (balança no teste): espiras em 3D (atrás escuro, frente claro)
    const sx = (this.ex[1] + this.ex[2]) / 2;
    const top = 134 + bo;
    const bot = this.ay - 26;
    const nC = 7;
    const hC = (bot - top) / nC;
    c.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = pass ? '#e0533c' : '#7e1a12';
      c.lineWidth = 7;
      for (let k = 0; k < nC; k++) {
        const y = top + hC * (k + 0.5);
        c.beginPath();
        if (pass) c.ellipse(sx, y, 30, 7, -0.12, 0, Math.PI);
        else c.ellipse(sx, y, 30, 7, -0.12, Math.PI, TAU);
        c.stroke();
      }
      if (pass) {
        c.strokeStyle = 'rgba(255,255,255,.45)';
        c.lineWidth = 2;
        for (let k = 0; k < nC; k++) {
          c.beginPath();
          c.ellipse(sx, top + hC * (k + 0.5) - 1.5, 30, 7, -0.12, 0.6, 1.6);
          c.stroke();
        }
      }
    }
    // pratos da mola
    c.fillStyle = '#3a3f45';
    c.fillRect(sx - 38, top - 6, 76, 8);
    c.fillRect(sx - 38, bot - 2, 76, 8);
    // braço (barra com 4 olhais)
    softShadow(c, W / 2, this.floorY + 2, W * 0.4, 12, 0.4);
    c.save();
    c.translate(0, ay);
    c.fillStyle = this.armG;
    c.beginPath();
    rrect(c, this.ex[0] - 40, -22, this.ex[3] - this.ex[0] + 80, 44, 22);
    c.fill();
    c.strokeStyle = '#1d2024';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.fillRect(this.ex[0] - 20, -18, this.ex[3] - this.ex[0] + 40, 4);
    c.restore();
    for (let i = 0; i < N; i++) {
      const x = this.ex[i];
      // olhal (anel de aço)
      c.fillStyle = '#7d858d';
      c.beginPath();
      c.arc(x, ay, 36, 0, TAU);
      c.fill();
      c.strokeStyle = '#2b2f35';
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = '#0c0d0f';
      c.beginPath();
      c.arc(x, ay, 28, 0, TAU);
      c.fill();
      // bucha velha
      if (this.oldFly[i] < 1) {
        const k = easeInOut(this.oldFly[i]);
        const ox = x + this.oldDx[i] + (this.binX - x - this.oldDx[i]) * k;
        const oy = ay + this.oldDy[i] + (this.binY - 40 - ay - this.oldDy[i]) * k - Math.sin(k * Math.PI) * 120;
        this.drawBushing(c, ox, oy, true, 1 - k * 0.3 + (this.drag === i ? 0.1 : 0), k * 6);
      }
      // bucha nova
      if (s >= 1 && (i < this.cur || (i === this.cur && s === 1) || s > 1)) {
        const k = this.newK[i];
        this.drawBushing(c, x, ay - (1 - k) * 34, false, 1 + (1 - k) * 0.35, 0);
      }
      // parafuso passante
      if (this.boltK[i] > 0) {
        const k = this.boltK[i];
        drawNut(c, this.np, x, ay, k * 30, 'bolt', 1 + (1 - k) * 0.3, 1 - k);
      } else if (s === 2) glow(c, x, ay, 30 + 4 * Math.sin(this.t * 6), 0.4, true);
    }
    if (s === 1) this.drawPress(c);
    this.drawBin(c);
  }

  private drawBushing(c: C2, x: number, y: number, old: boolean, sc: number, rot: number): void {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    if (old) c.scale(sc * 1.12, sc * 0.82);
    else c.scale(sc, sc);
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    c.arc(3, 4, 27, 0, TAU);
    c.fill();
    c.fillStyle = old ? this.oldRubG : this.rubG;
    c.beginPath();
    c.arc(0, 0, 27, 0, TAU);
    c.fill();
    // luva de metal
    c.fillStyle = '#c9cfd5';
    c.beginPath();
    c.arc(0, 0, 11, 0, TAU);
    c.fill();
    c.fillStyle = '#2b2f35';
    c.beginPath();
    c.arc(0, 0, 6, 0, TAU);
    c.fill();
    if (old) {
      // rachaduras e pedaços faltando
      c.strokeStyle = '#d8c0a0';
      c.globalAlpha = 0.55;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-20, -12);
      c.lineTo(-12, -6);
      c.lineTo(-16, 2);
      c.moveTo(14, 10);
      c.lineTo(20, 16);
      c.moveTo(6, -24);
      c.lineTo(10, -14);
      c.lineTo(4, -12);
      c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = '#0c0d0f';
      c.beginPath();
      c.arc(22, -10, 7, 0, TAU);
      c.fill();
    } else {
      c.strokeStyle = 'rgba(255,255,255,.22)';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 21, 3.5, 4.8);
      c.stroke();
      c.fillStyle = '#ffcf2e';
      c.beginPath();
      c.arc(0, -19, 3, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  private drawPress(c: C2): void {
    const x = this.pressX;
    const i = this.cur;
    const k = this.newK[i];
    // prensa em C (vermelha) por cima do olhal
    c.save();
    c.translate(x, 0);
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath();
    rrect(c, -30 + 5, 108, 60, 44, 8);
    c.fill();
    c.fillStyle = this.pressG;
    c.beginPath();
    rrect(c, -30, 104, 60, 44, 8);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.fillRect(-24, 108, 48, 4);
    // pistão descendo
    const rod = 148 + (this.ay - 34 - 148) * (0.15 + 0.85 * Math.min(1, k + this.pump.pos / this.pumps));
    c.fillStyle = '#d9dee3';
    c.fillRect(-9, 148, 18, rod - 148);
    c.fillStyle = '#5b636b';
    c.beginPath();
    rrect(c, -20, rod - 4, 40, 10, 3);
    c.fill();
    c.restore();
    // alavanca
    const [hx, hy] = this.handle();
    c.lineCap = 'round';
    c.strokeStyle = '#2f3338';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(x + 46, 130);
    c.lineTo(hx, hy);
    c.stroke();
    c.strokeStyle = '#9aa2aa';
    c.lineWidth = 5;
    c.stroke();
    c.fillStyle = '#b81f15';
    c.beginPath();
    c.arc(hx, hy, 11, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.beginPath();
    c.arc(hx - 3, hy - 3, 4, 0, TAU);
    c.fill();
    glow(c, hx, hy, 30, 0.2 + 0.15 * Math.sin(this.t * 5), true);
    // bolinhas de progresso desta bucha
    for (let j = 0; j < this.pumps; j++) {
      c.fillStyle = j < Math.round(k * this.pumps) ? '#5fe07a' : 'rgba(255,255,255,.35)';
      c.beginPath();
      c.arc(x - 12 * (this.pumps - 1) / 2 + j * 12, 96, 4.5, 0, TAU);
      c.fill();
    }
  }

  private drawBin(c: C2): void {
    const x = this.binX;
    const y = this.binY;
    softShadow(c, x, this.floorY + 6, 50, 8, 0.5);
    c.fillStyle = '#c8321f';
    c.beginPath();
    c.moveTo(x - 40, y - 36);
    c.lineTo(x + 40, y - 36);
    c.lineTo(x + 33, this.floorY);
    c.lineTo(x - 33, this.floorY);
    c.fill();
    c.fillStyle = '#4a0e08';
    c.beginPath();
    c.ellipse(x, y - 38, 42, 8, 0, 0, TAU);
    c.fill();
    drawIcon(c, 'bin', x, y - 4, 28, 'rgba(255,255,255,.85)', 2.6);
  }
}
