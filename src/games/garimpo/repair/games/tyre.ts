/* ============================================================
 *  MINIJOGO — TROCA DE PNEU.
 *  1 macaco (bombear a alavanca) → 2 porcas (girar com o dedo; pulam e caem na bandeja)
 *  → 3 puxar a roda murcha → 4 rolar o estepe até o cubo (encaixa sozinho)
 *  → 5 porcas de volta (toque no prisioneiro: a porca voa da bandeja; girar para apertar;
 *  em estrela ganha ⭐) → 6 soltar o macaco (toque na válvula).
 *  Caminhão: roda maior, 8 porcas e rodado duplo (a roda de dentro aparece atrás).
 * ============================================================ */
import { t } from '../../../../i18n';
import { tap as haptic } from '../../../../core/haptics';
import { rs } from '../sound';
import { clamp, drawHub, drawIcon, drawNut, drawRim, drawStud, drawTyre, easeInOut, easeOut, glow, lin, lugPos, NutPaint, rad, rrect, softShadow, springOut, TAU, WheelPaint, type C2 } from '../ui/art';
import { MiniGame, P, Pump, Twist, type MgCtx } from '../ui/overlay';

const STAR5 = [0, 2, 4, 1, 3];
const STAR8 = [0, 4, 2, 6, 1, 5, 3, 7];
const LIFT_PX = 46;

interface Fly {
  on: boolean;
  t: number;
  dur: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  a: number;
  /** índice da porca (destino no cubo ou na bandeja) */
  i: number;
  toTray: boolean;
}

export class TyreGame extends MiniGame {
  private truck: boolean;
  private n: number;
  private R: number;
  private wp!: WheelPaint;
  private sp!: WheelPaint;
  private inner!: WheelPaint;
  private np!: NutPaint;
  private body!: CanvasGradient;
  private glass!: CanvasGradient;
  private jackG!: CanvasGradient;
  private ramG!: CanvasGradient;
  private trayG!: CanvasGradient;
  private cx = 420;
  /** cubo em repouso (pneu murcho no chão) */
  private hy0 = 260;
  private lift = 0;
  private liftT = 0;
  private pump = new Pump(110);
  private tw = new Twist();
  private act = -1;
  /** porca: 0 no cubo/apertada, 1 voando, 2 na bandeja, 3 solta no prisioneiro */
  private st: Uint8Array;
  private prog: Float32Array;
  private nutA: Float32Array;
  private nutOn: Uint8Array;
  private flies: Fly[] = [];
  private inTray = 0;
  /** roda velha: deslocamento e giro; saiu rolando */
  private oldX = 0;
  private oldY = 0;
  private oldA = 0;
  private oldGone = 0;
  private oldV = 0;
  private dragOld = false;
  private dx0 = 0;
  private dy0 = 0;
  /** estepe */
  private spX = 0;
  private spY = 0;
  private spA = 0;
  private spVy = 0;
  private dragSp = false;
  private spSnap = -1;
  private spFrom = { x: 0, y: 0, a: 0 };
  private wrenchA = 0;
  private wrenchK = 0;
  /** ordem estrela */
  private order: number[] = [];
  private first = -1;
  private starOk = true;
  private lowerT = -1;
  private tight = 0;
  private flat = 1;
  private shake = 0;
  private trayX = 120;
  private trayY = 360;
  private pt = { x: 0, y: 0 };

  constructor(ctx: MgCtx) {
    super(ctx);
    this.truck = ctx.veh.heavy;
    this.n = this.truck ? 8 : 5;
    this.R = this.truck ? 124 : 112;
    this.bg = 'out';
    this.floorY = 352;
    this.steps = ['jack', 'twist', 'wheel', 'spare', 'nut', 'down'];
    this.voice = [
      () => t('gb.rep.v.jack', 'Bombeie o macaco para levantar!'),
      () => t('gb.rep.v.nuts', 'Gire as porcas para soltar.'),
      () => t('gb.rep.v.pull', 'Puxe a roda furada.'),
      () => t('gb.rep.v.spare', 'Leve o estepe até o cubo.'),
      () => t('gb.rep.v.tight', 'Aperte as porcas. Em estrela ganha bônus!'),
      () => t('gb.rep.v.lower', 'Abra a válvula para descer.'),
    ];
    const n = this.n;
    this.st = new Uint8Array(n);
    this.prog = new Float32Array(n);
    this.nutA = new Float32Array(n);
    this.nutOn = new Uint8Array(n).fill(1);
    for (let i = 0; i < 10; i++) this.flies.push({ on: false, t: 0, dur: 0.6, x0: 0, y0: 0, x1: 0, y1: 0, a: 0, i: 0, toTray: true });
    const st = this.truck ? STAR8 : STAR5;
    this.order = st.slice();
  }

  setup(c: C2): void {
    const R = this.R;
    this.cx = clamp(this.W * 0.48, 330, this.W - 300);
    this.hy0 = this.floorY - R * 0.82;
    this.trayX = Math.max(90, this.cx - R * 2.35);
    this.trayY = this.floorY + 14;
    this.wp = new WheelPaint(c, R, this.truck ? 'white' : 'silver');
    this.sp = new WheelPaint(c, R, this.truck ? 'white' : 'silver');
    this.inner = new WheelPaint(c, R * 0.98, 'steel');
    this.np = new NutPaint(c, R * 0.075);
    this.wp.nut = this.np;
    this.sp.nut = this.np;
    const col = this.ctx.veh.body;
    const colD = this.ctx.veh.bodyD;
    this.body = lin(c, 0, this.hy0 - R * 1.9, 0, this.hy0 + R * 0.4, [
      [0, '#ffffff'],
      [0.06, col],
      [0.55, col],
      [1, colD],
    ]);
    this.glass = lin(c, 0, 0, 0, this.hy0 - R * 1.3, [
      [0, '#9cc8e6'],
      [0.6, '#3e6a88'],
      [1, '#1c3346'],
    ]);
    this.jackG = lin(c, -18, 0, 18, 0, [
      [0, '#7e1410'],
      [0.3, '#ff5a44'],
      [0.55, '#d7281c'],
      [1, '#6a0f0b'],
    ]);
    this.ramG = lin(c, -9, 0, 9, 0, [
      [0, '#6e767e'],
      [0.35, '#ffffff'],
      [0.7, '#b8c0c8'],
      [1, '#5b636b'],
    ]);
    this.trayG = lin(c, 0, -20, 0, 20, [
      [0, '#6f8fb0'],
      [1, '#2f4a66'],
    ]);
    if (!this.spX) {
      this.spX = this.W - R * 0.95;
      this.spY = this.floorY - R;
    }
    this.fx.floor = this.floorY + 6;
    this.hintFor();
  }

  /* ------------------------------ geometria ------------------------------ */
  private get hy(): number {
    return this.hy0 - this.lift * LIFT_PX;
  }
  private get jackX(): number {
    return this.cx + this.R * 1.55;
  }
  /** soleira (onde o macaco empurra) */
  private get sill(): number {
    return this.hy + this.R * (this.truck ? 0.3 : 0.36);
  }
  private grip(out: { x: number; y: number }): void {
    const a = -0.95 + this.pump.pos * 1.12;
    const px = this.jackX + 16;
    const py = this.floorY - 18;
    out.x = px + Math.cos(a) * 128;
    out.y = py + Math.sin(a) * 128;
  }
  private valve(out: { x: number; y: number }): void {
    out.x = this.jackX - 22;
    out.y = this.floorY - 9;
  }
  private trayPos(k: number, out: { x: number; y: number }): void {
    const cols = this.truck ? 4 : 3;
    out.x = this.trayX - 34 + (k % cols) * (this.truck ? 23 : 32);
    out.y = this.trayY - 6 + Math.floor(k / cols) * 14;
  }

  /* ------------------------------ dicas ------------------------------ */
  private hintFor(): void {
    const s = this.step;
    const p = this.pt;
    if (s === 0) {
      this.grip(p);
      this.setHint('pump', p.x, p.y - 10, p.x, p.y + 70);
    } else if (s === 1) {
      let i = 0;
      while (i < this.n && !this.nutOn[i]) i++;
      lugPos(this.wp, this.cx, this.hy, 0, this.n, Math.min(i, this.n - 1), p);
      this.setHint('circle', p.x, p.y, -1, 0, 26);
    } else if (s === 2) this.setHint('drag', this.cx, this.hy, this.cx - this.R * 1.6, this.hy + 10);
    else if (s === 3) this.setHint('drag', this.spX, this.spY, this.cx, this.hy);
    else if (s === 4) {
      const nx = this.nextStar();
      if (nx < 0) return this.noHint();
      lugPos(this.sp, this.cx, this.hy, this.spA, this.n, nx, p);
      if (this.st[nx] === 3) this.setHint('circle', p.x, p.y, 1, 0, 26);
      else this.setHint('tap', p.x, p.y);
    } else if (s === 5) {
      this.valve(p);
      this.setHint('tap', p.x, p.y);
    }
  }
  /** próxima porca na ordem estrela (ou qualquer uma livre) */
  private nextStar(): number {
    for (let i = 0; i < this.n; i++) if (this.st[i] === 3) return i;
    const base = this.first < 0 ? 0 : this.first;
    for (const o of this.order) {
      const i = (base + o) % this.n;
      if (!this.nutOn[i]) return i;
    }
    return -1;
  }

  /* ------------------------------ toques ------------------------------ */
  down(x: number, y: number): void {
    const s = this.step;
    const p = this.pt;
    if (s === 0) {
      this.grip(p);
      if (Math.hypot(x - p.x, y - p.y) < 70 || (x > this.jackX && y > this.hy - 40)) this.pump.start(y);
    } else if (s === 1) {
      let best = -1;
      let bd = 52;
      for (let i = 0; i < this.n; i++) {
        if (!this.nutOn[i]) continue;
        lugPos(this.wp, this.cx, this.hy, 0, this.n, i, p);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      // tocou no meio da roda: pega a primeira porca que falta
      if (best < 0 && Math.hypot(x - this.cx, y - this.hy) < this.R * 0.7) for (let i = 0; i < this.n && best < 0; i++) if (this.nutOn[i]) best = i;
      if (best >= 0) {
        this.act = best;
        lugPos(this.wp, this.cx, this.hy, 0, this.n, best, p);
        this.tw.reset();
        this.tw.start(p.x, p.y, x, y);
      }
    } else if (s === 2) {
      if (Math.hypot(x - this.cx - this.oldX, y - this.hy - this.oldY) < this.R) {
        this.dragOld = true;
        this.dx0 = x - this.oldX;
        this.dy0 = y - this.oldY;
      }
    } else if (s === 3) {
      if (this.spSnap < 0 && Math.hypot(x - this.spX, y - this.spY) < this.R * 1.05) {
        this.dragSp = true;
        this.dx0 = x - this.spX;
        this.dy0 = y - this.spY;
        rs.roll();
      }
    } else if (s === 4) {
      let best = -1;
      let bd = 50;
      for (let i = 0; i < this.n; i++) {
        if (this.st[i] === 0 && this.nutOn[i]) continue;
        lugPos(this.sp, this.cx, this.hy, this.spA, this.n, i, p);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      // porca solta tem preferência (continua girando)
      for (let i = 0; i < this.n; i++) if (this.st[i] === 3) {
        lugPos(this.sp, this.cx, this.hy, this.spA, this.n, i, p);
        if (Math.hypot(x - p.x, y - p.y) < 70) best = i;
      }
      if (best < 0) return;
      if (this.st[best] === 2) {
        // ainda não tem porca: voa uma da bandeja
        if (this.inTray <= 0) return;
        for (let i = 0; i < this.n; i++) if (this.st[i] === 3 && i !== best) return; // uma de cada vez
        this.inTray--;
        this.trayPos(this.inTray, p);
        const f = this.fly();
        lugPos(this.sp, this.cx, this.hy, this.spA, this.n, best, this.pt);
        Object.assign(f, { on: true, t: 0, dur: 0.42, x0: p.x, y0: p.y, x1: this.pt.x, y1: this.pt.y, a: 0, i: best, toTray: false });
        this.st[best] = 1;
        this.prog[best] = 0;
        rs.pop();
      }
      this.act = best;
      lugPos(this.sp, this.cx, this.hy, this.spA, this.n, best, p);
      this.tw.reset();
      this.tw.start(p.x, p.y, x, y);
    } else if (s === 5) {
      this.valve(p);
      if (Math.hypot(x - p.x, y - p.y) < 50 && this.lowerT < 0) {
        this.lowerT = 0;
        rs.hiss(1.3);
        haptic('medium');
      }
    }
  }
  move(x: number, y: number): void {
    const s = this.step;
    if (s === 0 && this.pump.move(y)) {
      this.liftT = Math.min(1, this.liftT + (this.truck ? 1 / 6 : 1 / 5));
      rs.jack(true);
      haptic('medium');
      this.fx.burst(P.dust, this.jackX, this.floorY - 2, 3, 40, 0.6, 5);
    } else if ((s === 1 || s === 4) && this.act >= 0) {
      const d = this.tw.move(x, y);
      this.nutA[this.act] += d;
      this.wrenchA += d;
      this.idle = 0;
    } else if (s === 2 && this.dragOld) {
      this.oldX = clamp(x - this.dx0, -this.W, this.W);
      this.oldY = clamp(y - this.dy0, -20, 16);
      this.oldA = this.oldX / this.R;
    } else if (s === 3 && this.dragSp) {
      const nx = clamp(x - this.dx0, this.R * 0.5, this.W - this.R * 0.4);
      this.spA += (nx - this.spX) / this.R;
      this.spX = nx;
      this.spY = clamp(y - this.dy0, this.hy - 30, this.floorY - this.R);
      this.spVy = 0;
    }
  }
  up(): void {
    const s = this.step;
    this.pump.end();
    this.tw.end();
    if (s === 2 && this.dragOld) {
      this.dragOld = false;
      if (Math.abs(this.oldX) > this.R * 0.55) {
        this.oldV = Math.sign(this.oldX) * 900;
        rs.roll();
      }
    }
    if (s === 3 && this.dragSp) {
      this.dragSp = false;
      if (Math.hypot(this.spX - this.cx, this.spY - this.hy) < this.R * 0.55) {
        this.spSnap = 0;
        this.spFrom.x = this.spX;
        this.spFrom.y = this.spY;
        this.spFrom.a = this.spA;
        // alinha os furos com os prisioneiros (múltiplo de 2π/n mais perto)
        const st = TAU / this.n;
        this.spA = Math.round(this.spA / st) * st;
        rs.snap();
        haptic('heavy');
      }
    }
  }

  private fly(): Fly {
    for (const f of this.flies) if (!f.on) return f;
    return this.flies[0];
  }

  /* ------------------------------ lógica ------------------------------ */
  update(dt: number): void {
    const s = this.step;
    this.pump.relax(dt);
    this.lift += (this.liftT - this.lift) * Math.min(1, dt * 7);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.wrenchK += ((this.tw.active && this.act >= 0 ? 1 : 0) - this.wrenchK) * Math.min(1, dt * 10);
    if (s === 0 && this.liftT >= 1 && this.lift > 0.97) this.next();
    if (s === 1 && this.act >= 0) {
      const i = this.act;
      const k = Math.abs(this.tw.acc) / (TAU * 1.2);
      this.prog[i] = Math.min(1, k);
      if (k >= 1) {
        // a porca pula da rosca e cai na bandeja
        this.nutOn[i] = 0;
        this.st[i] = 1;
        const p = this.pt;
        lugPos(this.wp, this.cx, this.hy, 0, this.n, i, p);
        const f = this.fly();
        const slot = this.inTray++;
        Object.assign(f, { on: true, t: 0, dur: 0.75, x0: p.x, y0: p.y, a: this.nutA[i], i: slot, toTray: true });
        this.trayPos(slot, p);
        f.x1 = p.x;
        f.y1 = p.y;
        rs.pop();
        haptic('medium');
        this.act = -1;
        this.tw.reset();
        if (this.nutOn.every((v) => !v)) {
          this.st.fill(2);
          this.next();
        }
      }
    }
    if (s === 4 && this.act >= 0 && (this.st[this.act] === 3 || this.st[this.act] === 1)) {
      const i = this.act;
      const k = Math.abs(this.tw.acc) / (TAU * 0.8);
      this.prog[i] = Math.min(1, k);
      if (k >= 1 && this.st[i] === 3) {
        this.st[i] = 0;
        this.nutOn[i] = 1;
        this.tight++;
        if (this.first < 0) this.first = i;
        else {
          const exp = (this.first + this.order[this.tight - 1]) % this.n;
          if (exp !== i) this.starOk = false;
        }
        const p = this.pt;
        lugPos(this.sp, this.cx, this.hy, this.spA, this.n, i, p);
        rs.snap();
        haptic('heavy');
        this.fx.burst(P.star, p.x, p.y, 6, 120, 0.5, 6);
        this.act = -1;
        this.tw.reset();
        if (this.tight >= this.n) {
          if (this.starOk) {
            this.bonus = 1;
            rs.star();
          }
          this.next();
        }
      }
    }
    // roda velha saindo rolando
    if (s === 2) {
      if (this.oldV) {
        this.oldX += this.oldV * dt;
        this.oldA = this.oldX / this.R;
        this.oldY = Math.min(this.oldY + dt * 120, this.floorY - this.R * 0.82 - this.hy);
        if (Math.abs(this.oldX) > this.W) {
          this.oldGone = 1;
          rs.thud();
          this.next();
        }
      } else if (!this.dragOld) {
        this.oldX *= 1 - Math.min(1, dt * 10);
        this.oldY *= 1 - Math.min(1, dt * 10);
        this.oldA = this.oldX / this.R;
      }
    }
    // estepe: cai até o chão se largar no ar; encaixe com mola
    if (s === 3) {
      if (this.spSnap >= 0) {
        this.spSnap += dt * 2.2;
        const k = springOut(Math.min(1, this.spSnap));
        this.spX = this.spFrom.x + (this.cx - this.spFrom.x) * k;
        this.spY = this.spFrom.y + (this.hy - this.spFrom.y) * k;
        if (this.spSnap >= 1) {
          this.spX = this.cx;
          this.spY = this.hy;
          this.fx.burst(P.star, this.cx, this.hy, 10, 200, 0.6, 7);
          this.next();
        }
      } else if (!this.dragSp) {
        const g = this.floorY - this.R;
        if (this.spY < g) {
          this.spVy += 1500 * dt;
          this.spY = Math.min(g, this.spY + this.spVy * dt);
          if (this.spY >= g) {
            if (this.spVy > 300) rs.thud();
            this.spVy = 0;
          }
        }
      }
    }
    // macaco descendo
    if (s === 5 && this.lowerT >= 0) {
      this.lowerT += dt / 1.3;
      this.liftT = Math.max(0, 1 - easeInOut(Math.min(1, this.lowerT)));
      this.lift = this.liftT;
      if (this.lowerT >= 1) {
        this.shake = 1;
        rs.thud();
        this.fx.burst(P.dust, this.cx - this.R * 0.6, this.floorY, 8, 90, 0.8, 7);
        this.fx.burst(P.dust, this.cx + this.R * 0.6, this.floorY, 8, 90, 0.8, 7);
        this.lowerT = -2;
        this.next();
      }
    }
    // porcas voando
    for (const f of this.flies) {
      if (!f.on) continue;
      f.t += dt / f.dur;
      if (f.t >= 1) {
        f.on = false;
        if (f.toTray) {
          rs.clink();
          this.fx.burst(P.star, f.x1, f.y1, 3, 60, 0.3, 4);
        } else {
          this.st[f.i] = 3;
          rs.clink(0.6);
        }
      }
    }
    if (this.step < this.steps.length) this.hintFor();
  }

  /* ------------------------------ desenho ------------------------------ */
  draw(c: C2): void {
    const R = this.R;
    const cx = this.cx;
    const hy = this.hy;
    const sh = this.shake * Math.sin(this.t * 60) * 3;
    c.save();
    c.translate(0, sh);
    // sombra do carro
    softShadow(c, cx + R * 0.3, this.floorY + 4, R * 3.4, 18, 0.5);
    this.drawBody(c);
    // rodado duplo: roda de dentro (caminhão)
    if (this.truck) {
      c.save();
      c.globalAlpha = 1;
      drawTyre(c, this.inner, cx - 9, hy - 7, 0, 0);
      drawRim(c, this.inner, cx - 9, hy - 7, 0, this.n, null, null);
      c.fillStyle = 'rgba(0,0,0,.45)';
      c.beginPath();
      c.arc(cx - 9, hy - 7, R, 0, TAU);
      c.fill();
      c.restore();
    }
    const s = this.step;
    // roda velha (passos 0-2) ou cubo + estepe
    if (s <= 2 && !this.oldGone) {
      if (s === 2 || this.oldX !== 0) drawHub(c, this.wp, cx, hy, this.n, '#c8321f');
      const ox = cx + this.oldX;
      const oy = hy + this.oldY;
      // pneu murcho encosta no chão: o achatamento diminui quando o carro sobe
      const touch = clamp((this.floorY - (oy + R * 0.82)) / LIFT_PX, 0, 1);
      this.flat = 1 - touch * 0.75;
      drawTyre(c, this.wp, ox, oy, this.oldA, this.flat);
      this.drawFlatMark(c, ox, oy);
      drawRim(c, this.wp, ox, oy, this.oldA, this.n, this.nutA, this.nutOn, true);
      // prisioneiros do cubo aparecem pelos furos (e ficam quando a roda sai)
      for (let i = 0; i < this.n; i++) {
        if (this.nutOn[i]) continue;
        lugPos(this.wp, cx, hy, 0, this.n, i, this.pt);
        drawStud(c, this.np, this.pt.x, this.pt.y, this.np.r * 0.55, 1);
      }
    } else {
      drawHub(c, this.wp, cx, hy, this.n, '#c8321f');
      for (let i = 0; i < this.n; i++) {
        lugPos(this.wp, cx, hy, this.spSnap >= 1 || s > 3 ? this.spA : 0, this.n, i, this.pt);
        if (s === 3 && this.spSnap < 1) drawStud(c, this.np, this.pt.x, this.pt.y, this.np.r * 0.55, 1);
      }
    }
    // estepe
    if (s >= 3 || this.oldGone) this.drawSpare(c);
    // porcas soltas/girando no estepe
    if (s >= 4) {
      for (let i = 0; i < this.n; i++) {
        if (this.st[i] !== 3) continue;
        lugPos(this.sp, cx, hy, this.spA, this.n, i, this.pt);
        const lift = 1 - this.prog[i];
        drawNut(c, this.np, this.pt.x, this.pt.y, this.nutA[i], 'lug', 1 + lift * 0.18, lift);
      }
      // estrela na próxima da ordem
      const nx = this.nextStar();
      if (nx >= 0 && this.st[nx] !== 3 && this.starOk) {
        lugPos(this.sp, cx, hy, this.spA, this.n, nx, this.pt);
        const k = 0.8 + 0.2 * Math.sin(this.t * 6);
        glow(c, this.pt.x, this.pt.y, 26 * k, 0.6, true);
        drawIcon(c, 'star', this.pt.x, this.pt.y - 24, 18 * k, '#ffcf2e', 1.5, true);
      }
    }
    // porca ativa no passo 1: levanta conforme gira
    this.drawJack(c);
    this.drawTray(c);
    // porcas voando (por cima de tudo)
    for (const f of this.flies) {
      if (!f.on) continue;
      const k = f.t;
      const x = f.x0 + (f.x1 - f.x0) * k;
      const arc = f.toTray ? -110 : -70;
      const y = f.y0 + (f.y1 - f.y0) * k + arc * 4 * k * (1 - k);
      drawNut(c, this.np, x, y, f.a + k * 14, 'lug', 1 + Math.sin(k * Math.PI) * 0.45, Math.sin(k * Math.PI));
    }
    this.drawWrench(c);
    c.restore();
  }

  private drawFlatMark(c: C2, x: number, y: number): void {
    // prego espetado + bolhas de ar saindo enquanto ainda está no carro
    const R = this.R;
    const a = this.oldA + 2.2;
    const px = x + Math.cos(a) * R * 0.93;
    const py = y + Math.sin(a) * R * 0.93;
    c.save();
    c.translate(px, py);
    c.rotate(a);
    c.fillStyle = '#9aa2aa';
    c.fillRect(-2, -2.5, 14, 5);
    c.fillStyle = '#d7dce1';
    c.beginPath();
    c.ellipse(12, 0, 3, 7, 0, 0, TAU);
    c.fill();
    c.restore();
    if (this.step < 2 && Math.random() < 0.08) this.fx.emit(P.bubble, px + 10, py, 20 + Math.random() * 20, -30, 0.8, 2 + Math.random() * 3);
  }

  private drawSpare(c: C2): void {
    const x = this.spX;
    const y = this.spY;
    const R = this.R;
    if (this.spSnap < 0) softShadow(c, x, this.floorY + 2, R * 0.9, 9, 0.45);
    drawTyre(c, this.sp, x, y, this.spA, 0);
    // pneu novo: brilho que passa
    const k = (this.t * 0.5) % 1;
    c.save();
    c.beginPath();
    c.arc(x, y, R, 0, TAU);
    c.clip();
    c.globalAlpha = 0.18;
    c.fillStyle = '#fff';
    c.translate(x - R * 1.4 + k * R * 2.8, y);
    c.rotate(0.5);
    c.fillRect(-8, -R * 1.4, 16, R * 2.8);
    c.restore();
    if (this.step >= 4) drawRim(c, this.sp, x, y, this.spA, this.n, this.nutA, this.nutOn);
    else {
      // furos dos prisioneiros (vazios)
      drawRim(c, this.sp, x, y, this.spA, this.n, null, this.nutOn, true);
    }
    if (this.step === 3 && this.spSnap < 0) {
      // alvo no cubo: anel pulsando
      const pk = 0.5 + 0.5 * Math.sin(this.t * 5);
      c.strokeStyle = 'rgba(255,230,120,.9)';
      c.lineWidth = 4;
      c.setLineDash([10, 8]);
      c.beginPath();
      c.arc(this.cx, this.hy, R * (0.98 + pk * 0.04), this.t, this.t + TAU);
      c.stroke();
      c.setLineDash([]);
    }
  }

  private drawBody(c: C2): void {
    const R = this.R;
    const cx = this.cx;
    const hy = this.hy;
    const W = this.W;
    const sill = this.sill;
    const archR = R * (this.truck ? 1.12 : 1.16);
    // caixa de roda (escura)
    c.fillStyle = rad(c, cx, hy - R * 0.2, R * 0.3, cx, hy, archR, [
      [0, '#3a3430'],
      [1, '#0e0c0b'],
    ]);
    c.beginPath();
    c.arc(cx, hy + 4, archR, Math.PI, 0);
    c.lineTo(cx + archR, sill);
    c.lineTo(cx - archR, sill);
    c.fill();
    // suspensão (mola) dentro da caixa
    c.strokeStyle = '#5b636b';
    c.lineWidth = 6;
    c.beginPath();
    for (let k = 0; k <= 8; k++) c.lineTo(cx - 14 + (k % 2) * 28, hy - archR + 14 + k * ((archR - R * 0.5) / 8));
    c.stroke();
    // lataria com recorte do para-lama
    const dy = sill - (hy + 4);
    const ix = Math.sqrt(Math.max(0, archR * archR - dy * dy));
    c.beginPath();
    c.moveTo(-20, -20);
    c.lineTo(W + 20, -20);
    c.lineTo(W + 20, sill);
    c.lineTo(cx + ix, sill);
    c.arc(cx, hy + 4, archR, Math.atan2(dy, ix), Math.atan2(dy, -ix), true);
    c.lineTo(-20, sill);
    c.closePath();
    if (this.truck) {
      // caminhão: caçamba laranja em cima, longarina preta, para-lama de borracha
      c.fillStyle = '#26282c';
      c.fill();
      const top = hy - R * 1.32;
      c.fillStyle = this.body;
      c.fillRect(-20, -20, W + 40, top + 20);
      c.fillStyle = 'rgba(0,0,0,.18)';
      for (let x = cx - R * 3; x < W; x += R * 0.62) c.fillRect(x, -20, 10, top + 20);
      c.fillStyle = 'rgba(255,255,255,.25)';
      c.fillRect(-20, top - 12, W + 40, 4);
      c.fillStyle = '#18191b';
      c.fillRect(-20, top, W + 40, R * 0.3);
      c.fillStyle = '#3a3d42';
      c.fillRect(-20, top + 4, W + 40, 3);
      // parafusos da longarina
      for (let x = 20; x < W; x += 46) {
        c.fillStyle = '#5c6168';
        c.beginPath();
        c.arc(x, top + R * 0.17, 3.2, 0, TAU);
        c.fill();
      }
      // para-lama de borracha
      c.strokeStyle = '#111214';
      c.lineWidth = R * 0.12;
      c.beginPath();
      c.arc(cx, hy + 4, archR + R * 0.04, Math.PI * 1.02, -0.02);
      c.stroke();
      // apoio do macaco (suporte pendurado)
      c.fillStyle = '#2b2d31';
      c.fillRect(this.jackX - 22, top + R * 0.3, 44, sill - top - R * 0.3);
      c.fillStyle = '#4a4e54';
      c.fillRect(this.jackX - 26, sill - 8, 52, 8);
      // lameiro atrás da roda
      c.fillStyle = '#141416';
      c.beginPath();
      rrect(c, cx + archR + 26, hy - R * 0.6, 22, this.floorY - (hy - R * 0.6) - 14 + this.lift * LIFT_PX * 0.3, 4);
      c.fill();
      c.fillStyle = '#e8b41c';
      c.fillRect(cx + archR + 29, hy - R * 0.3, 16, 6);
    } else {
      c.fillStyle = this.body;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)';
      c.lineWidth = 2;
      c.stroke();
      // vidro (para-brisa/janela) em cima, porta, vinco, maçaneta
      const hood = hy - R * 1.28;
      c.fillStyle = this.glass;
      c.beginPath();
      c.moveTo(cx + R * 1.05, hood);
      c.lineTo(cx + R * 1.85, -20);
      c.lineTo(W + 20, -20);
      c.lineTo(W + 20, hood);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.22)';
      c.beginPath();
      c.moveTo(cx + R * 1.6, hood);
      c.lineTo(cx + R * 2.15, -20);
      c.lineTo(cx + R * 2.45, -20);
      c.lineTo(cx + R * 1.9, hood);
      c.fill();
      c.fillStyle = this.ctx.veh.bodyD;
      c.fillRect(cx + R * 1.05, hood - 3, W, 6);
      c.strokeStyle = 'rgba(0,0,0,.4)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(cx + R * 1.5, hood);
      c.lineTo(cx + R * 1.5, sill - 2);
      c.stroke();
      c.fillStyle = '#c9cfd5';
      c.beginPath();
      rrect(c, cx + R * 1.7, hy - R * 0.92, R * 0.36, 9, 4);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.4)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-20, hy - R * 0.62);
      c.lineTo(cx - archR - 6, hy - R * 0.62);
      c.moveTo(cx + archR + 6, hy - R * 0.62);
      c.lineTo(W + 20, hy - R * 0.62);
      c.stroke();
      // para-choque e farol à esquerda
      const fx = cx - R * 2.15;
      c.fillStyle = lin(c, 0, hy - R * 0.5, 0, sill, [
        [0, '#e9edf1'],
        [0.5, '#9aa2aa'],
        [1, '#4f565d'],
      ]);
      c.beginPath();
      rrect(c, fx - 60, hy - R * 0.5, 60, sill - (hy - R * 0.5) + 6, 10);
      c.fill();
      c.fillStyle = '#ffe9a8';
      c.beginPath();
      rrect(c, fx - 30, hood + 10, 30, R * 0.32, 6);
      c.fill();
      glow(c, fx - 15, hood + 10 + R * 0.16, 30, 0.35);
      // lama do garimpo na lataria
      c.fillStyle = 'rgba(122,62,28,.55)';
      for (let i = 0; i < 14; i++) {
        const mx = cx - archR - 40 + ((i * 53) % (archR * 2 + 80));
        if (Math.abs(mx - cx) < archR + 4) continue;
        c.beginPath();
        c.arc(mx, sill - 6 - ((i * 7) % 22), 3 + (i % 4) * 2, 0, TAU);
        c.fill();
      }
      // soleira de plástico
      c.fillStyle = '#23252a';
      c.fillRect(-20, sill - 9, cx - ix + 20, 9);
      c.fillRect(cx + ix, sill - 9, W, 9);
    }
    // embaixo do carro: sombra
    c.fillStyle = lin(c, 0, sill, 0, this.floorY, [
      [0, 'rgba(0,0,0,.55)'],
      [1, 'rgba(0,0,0,.1)'],
    ]);
    c.fillRect(-20, sill, cx - archR + 20, this.floorY - sill);
    c.fillRect(cx + archR, sill, W, this.floorY - sill);
  }

  private drawJack(c: C2): void {
    const jx = this.jackX;
    const fy = this.floorY;
    const sill = this.sill;
    softShadow(c, jx, fy + 2, 46, 7, 0.5);
    // base
    c.fillStyle = '#5a1410';
    c.beginPath();
    rrect(c, jx - 34, fy - 10, 68, 10, 3);
    c.fill();
    // corpo (garrafa)
    const bodyTop = fy - 40;
    c.fillStyle = this.jackG;
    c.save();
    c.translate(jx, 0);
    c.beginPath();
    rrect(c, -18, bodyTop, 36, 32, 6);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(-11, bodyTop + 4, 4, 24);
    // pistão (cromado) até a soleira
    const ramTop = sill + 7;
    c.fillStyle = this.ramG;
    c.fillRect(-9, ramTop, 18, bodyTop - ramTop + 2);
    // sela serrilhada
    c.fillStyle = '#2b2d31';
    c.beginPath();
    rrect(c, -14, sill - 1, 28, 9, 2);
    c.fill();
    c.restore();
    // válvula (destaque no passo 6)
    const p = this.pt;
    this.valve(p);
    if (this.step === 5 && this.lowerT < 0) glow(c, p.x, p.y, 26 + 4 * Math.sin(this.t * 6), 0.8, true);
    c.fillStyle = '#c9cfd5';
    c.beginPath();
    c.arc(p.x, p.y, 7, 0, TAU);
    c.fill();
    c.strokeStyle = '#3a3f45';
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(p.x - 5, p.y);
    c.lineTo(p.x + 5, p.y);
    c.stroke();
    // alavanca
    const a = -0.95 + this.pump.pos * 1.12;
    const px = jx + 16;
    const py = fy - 18;
    const gx = px + Math.cos(a) * 128;
    const gy = py + Math.sin(a) * 128;
    c.lineCap = 'round';
    c.strokeStyle = '#2f3338';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(gx, gy);
    c.stroke();
    c.strokeStyle = '#9aa2aa';
    c.lineWidth = 5;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(px, py - 2);
    c.lineTo(gx, gy - 2);
    c.stroke();
    // manopla vermelha
    c.save();
    c.translate(gx, gy);
    c.rotate(a);
    c.fillStyle = '#b81f15';
    c.beginPath();
    rrect(c, -30, -8, 40, 16, 8);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.fillRect(-26, -5, 32, 4);
    c.restore();
    if (this.step === 0) glow(c, gx, gy, 34, 0.25 + 0.15 * Math.sin(this.t * 5), true);
    // medidor de altura (setinhas subindo)
    if (this.step === 0) {
      const k = this.liftT;
      for (let i = 0; i < 5; i++) {
        const on = i < Math.round(k * 5);
        drawIcon(c, 'down', jx - 54, fy - 30 - i * 16, 14, on ? '#5fe07a' : 'rgba(255,255,255,.35)', 3);
      }
    }
  }

  private drawTray(c: C2): void {
    const x = this.trayX;
    const y = this.trayY;
    const w = this.truck ? 112 : 104;
    softShadow(c, x, y + 10, w * 0.6, 8, 0.5);
    c.save();
    c.translate(x, y);
    c.fillStyle = '#22364c';
    c.beginPath();
    c.ellipse(0, 6, w / 2, 16, 0, 0, TAU);
    c.fill();
    c.fillStyle = this.trayG;
    c.beginPath();
    c.ellipse(0, 0, w / 2, 16, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(10,20,30,.55)';
    c.beginPath();
    c.ellipse(0, 1, w / 2 - 7, 11, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.45)';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 0, w / 2, 16, 0, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.restore();
    // porcas dentro
    const p = this.pt;
    for (let k = 0; k < this.inTray; k++) {
      let flying = false;
      for (const f of this.flies) if (f.on && f.toTray && f.i === k) flying = true;
      if (flying) continue;
      this.trayPos(k, p);
      drawNut(c, this.np, p.x, p.y, k * 1.3, 'lug', 0.85);
    }
  }

  /** chave de roda em cruz por cima da porca que está girando */
  private drawWrench(c: C2): void {
    if (this.wrenchK < 0.02 || this.act < 0) return;
    const p = this.pt;
    if (this.step === 1) lugPos(this.wp, this.cx, this.hy, 0, this.n, this.act, p);
    else lugPos(this.sp, this.cx, this.hy, this.spA, this.n, this.act, p);
    const L = 62;
    c.save();
    c.globalAlpha = this.wrenchK;
    c.translate(p.x + 6, p.y + 8);
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath();
    c.arc(0, 0, 14, 0, TAU);
    c.fill();
    c.translate(-6, -8);
    c.rotate(this.wrenchA);
    c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      c.strokeStyle = k ? '#c9cfd5' : '#2f3338';
      c.lineWidth = k ? 7 : 11;
      c.beginPath();
      c.moveTo(-L, 0);
      c.lineTo(L, 0);
      c.moveTo(0, -L);
      c.lineTo(0, L);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-L, -2);
    c.lineTo(L, -2);
    c.stroke();
    for (let k = 0; k < 4; k++) {
      c.rotate(TAU / 4);
      c.fillStyle = '#7d858d';
      c.beginPath();
      rrect(c, L - 4, -8, 14, 16, 4);
      c.fill();
    }
    c.fillStyle = '#5b636b';
    c.beginPath();
    c.arc(0, 0, 12, 0, TAU);
    c.fill();
    c.strokeStyle = '#2a2e33';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
    // anel de progresso
    const k = this.prog[this.act];
    c.strokeStyle = 'rgba(0,0,0,.4)';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(p.x, p.y, 30, 0, TAU);
    c.stroke();
    c.strokeStyle = this.step === 1 ? '#ffcf2e' : '#5fe07a';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * easeOut(k));
    c.stroke();
  }
}
