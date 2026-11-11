/* ============================================================
 *  MINIJOGO — PANE ELÉTRICA.
 *  1 abrir a portinhola do painel (arrastar) → 2 ligar cada ponta solta na tomada da mesma
 *  cor/símbolo (fios moles com folga; errado dá faísca) → 3 fechar → 4 ligar a chave
 *  (lâmpada acende). Mais fios nas dificuldades altas (3, 4, 5, 6) e tomadas embaralhadas.
 * ============================================================ */
import { t } from '../../../../i18n';
import { tap as haptic } from '../../../../core/haptics';
import { rs } from '../sound';
import { clamp, drawNut, easeInOut, glow, lin, NutPaint, rad, rrect, softShadow, springOut, TAU, type C2 } from '../ui/art';
import { MiniGame, P, type MgCtx } from '../ui/overlay';
import { RopePuzzle, shuffle } from '../ui/rope';

export class WiresGame extends MiniGame {
  private n: number;
  private pz: RopePuzzle;
  /** porta: 0 fechada .. 1 aberta */
  private door = 0;
  private doorT = 0;
  private dragDoor = false;
  private dx0 = 0;
  private d0 = 0;
  private sw = 0;
  private swT = -1;
  private bx = 0;
  private by = 64;
  private bw = 520;
  private bh = 280;
  private tangle: HTMLCanvasElement | null = null;
  private boxG!: CanvasGradient;
  private doorG!: CanvasGradient;
  private doorB!: CanvasGradient;
  private plate!: CanvasGradient;
  private np!: NutPaint;
  private built = false;
  private perm: number[];

  constructor(ctx: MgCtx) {
    super(ctx);
    this.n = [3, 4, 5, 6][clamp(ctx.level, 0, 3)];
    this.perm = shuffle(this.n, ctx.level === 0);
    this.pz = new RopePuzzle('wire', this.fx);
    this.steps = ['door', 'plug', 'door', 'power'];
    this.voice = [
      () => t('gb.rep.v.open', 'Abra o painel.'),
      () => t('gb.rep.v.wires', 'Ligue cada fio na tomada da mesma cor.'),
      () => t('gb.rep.v.close', 'Feche o painel.'),
      () => t('gb.rep.v.power', 'Ligue a chave!'),
    ];
  }

  setup(c: C2): void {
    const W = this.W;
    this.bw = Math.min(560, W - 150);
    this.bh = 288;
    this.bx = W / 2 - this.bw / 2 + 20;
    this.by = 68;
    this.floorY = 352;
    this.boxG = lin(c, 0, this.by, 0, this.by + this.bh, [
      [0, '#7d8a96'],
      [1, '#4b5661'],
    ]);
    this.doorG = lin(c, 0, this.by, 0, this.by + this.bh, [
      [0, '#a6b3bf'],
      [0.5, '#8794a1'],
      [1, '#5f6b77'],
    ]);
    this.doorB = lin(c, 0, this.by, 0, this.by + this.bh, [
      [0, '#5a6570'],
      [1, '#343c44'],
    ]);
    this.plate = rad(c, this.bx + this.bw * 0.45, this.by + this.bh * 0.4, 30, this.bx + this.bw / 2, this.by + this.bh / 2, this.bw * 0.7, [
      [0, '#2f3a44'],
      [1, '#151b21'],
    ]);
    this.np = new NutPaint(c, 7);
    this.paintTangle();
    if (!this.built) {
      this.built = true;
      const n = this.n;
      const x0 = this.bx + 22;
      const y0 = this.by + 20;
      const anchors: [number, number][] = [];
      const rest: [number, number][] = [];
      const socks: [number, number][] = [];
      // fios saem de um conduíte em cima à esquerda; pontas soltas penduradas à esquerda
      for (let i = 0; i < n; i++) {
        anchors.push([x0 + 40 + i * 14, y0 + 6]);
        rest.push([x0 + 30 + (i % 3) * 52, this.by + this.bh - 70 - Math.floor(i / 3) * 70 + (i % 2) * 18]);
      }
      const sx = this.bx + this.bw - 74;
      const span = this.bh - 70;
      for (let i = 0; i < n; i++) socks.push([sx, this.by + 44 + (n === 1 ? 0 : (i * span) / (n - 1))]);
      this.pz.build(anchors, rest, socks, this.perm);
    }
    this.hintFor();
  }

  /** emaranhado de fundo (cache: desenhado uma vez) */
  private paintTangle(): void {
    const cv = (this.tangle ??= document.createElement('canvas'));
    const s = 2;
    cv.width = this.bw * s;
    cv.height = this.bh * s;
    const c = cv.getContext('2d')!;
    c.scale(s, s);
    let seed = 7;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cols = ['#7a2a22', '#1f4a7a', '#8a7020', '#1f6a34', '#6a6a6a', '#2a2a2a', '#9a5a1a'];
    // trilho DIN com disjuntores e relés
    c.fillStyle = '#9aa2aa';
    c.fillRect(30, this.bh * 0.5 - 6, this.bw * 0.55, 12);
    for (let i = 0; i < 6; i++) {
      const x = 40 + i * 40;
      c.fillStyle = '#e9e6dc';
      c.beginPath();
      rrect(c, x, this.bh * 0.5 - 30, 30, 60, 4);
      c.fill();
      c.fillStyle = i % 2 ? '#2f7de0' : '#d23a2a';
      c.fillRect(x + 10, this.bh * 0.5 - 12, 10, 16);
      c.fillStyle = '#5a5a5a';
      c.fillRect(x + 8, this.bh * 0.5 + 16, 14, 6);
    }
    for (let i = 0; i < 18; i++) {
      const x0 = 20 + R() * this.bw * 0.7;
      const y0 = 10 + R() * this.bh * 0.25;
      const x1 = 20 + R() * this.bw * 0.7;
      const y1 = this.bh * 0.6 + R() * this.bh * 0.35;
      const col = cols[(R() * cols.length) | 0];
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y0);
      c.bezierCurveTo(x0 + (R() - 0.5) * 200, y0 + 80 + R() * 100, x1 + (R() - 0.5) * 200, y1 - 60 - R() * 80, x1, y1);
      c.strokeStyle = 'rgba(0,0,0,.6)';
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.18)';
      c.lineWidth = 1.5;
      c.stroke();
    }
    // abraçadeiras
    for (let i = 0; i < 5; i++) {
      c.fillStyle = '#f2f2f2';
      c.fillRect(30 + R() * this.bw * 0.6, 20 + R() * this.bh * 0.7, 4, 14);
    }
    // escurece para ficar como fundo
    c.fillStyle = 'rgba(10,14,18,.45)';
    c.fillRect(0, 0, this.bw, this.bh);
  }

  private hintFor(): void {
    const s = this.step;
    const dx = this.bx + this.bw;
    if (s === 0) this.setHint('drag', dx - 40, this.by + this.bh / 2, this.bx - 60, this.by + this.bh / 2);
    else if (s === 1) {
      const w = this.pz.nextHint();
      if (!w) return this.noHint();
      const so = this.pz.sockets[w.target];
      this.setHint('drag', w.rope.ex, w.rope.ey, so.x, so.y);
    } else if (s === 2) this.setHint('drag', this.bx - 40, this.by + this.bh / 2, dx - 40, this.by + this.bh / 2);
    else if (s === 3) {
      const [x, y] = this.switchPos();
      this.setHint('tap', x, y);
    }
  }
  private switchPos(): [number, number] {
    return [this.bx + this.bw - 60, this.by + this.bh - 54];
  }

  down(x: number, y: number): void {
    const s = this.step;
    if (s === 0 || s === 2) {
      if (y > this.by - 20 && y < this.by + this.bh + 20 && x > this.bx - this.bw && x < this.bx + this.bw + 40) {
        this.dragDoor = true;
        this.dx0 = x;
        this.d0 = this.door;
        rs.tick();
      }
    } else if (s === 1) this.pz.down(x, y);
    else if (s === 3) {
      const [sx, sy] = this.switchPos();
      if (Math.hypot(x - sx, y - sy) < 50 && this.swT < 0) {
        this.swT = 0;
        rs.snap();
        haptic('heavy');
      }
    }
  }
  move(x: number, y: number): void {
    if (this.step === 1) this.pz.move(x, y);
    if (this.dragDoor) {
      // arrastar para a esquerda abre (a porta gira na dobradiça da esquerda)
      this.door = clamp(this.d0 + (this.dx0 - x) / (this.bw * 0.9), 0, 1);
    }
  }
  up(): void {
    if (this.dragDoor) {
      this.dragDoor = false;
      const want = this.step === 0 ? this.door > 0.25 : this.door > 0.75;
      this.doorT = want ? 1 : 0;
      if (this.step === 0 && want) rs.door(true);
      if (this.step === 2 && !want) rs.door(false);
    }
    if (this.step === 1) this.pz.up();
  }

  update(dt: number): void {
    const s = this.step;
    if (!this.dragDoor) this.door += (this.doorT - this.door) * Math.min(1, dt * 9);
    if (s === 0 && !this.dragDoor && this.doorT === 1 && this.door > 0.97) this.next();
    if (s === 2 && !this.dragDoor && this.doorT === 0 && this.door < 0.03) {
      this.door = 0;
      haptic('medium');
      this.next();
    }
    if (s === 1) this.doorT = 1;
    this.pz.update(dt);
    if (s === 1 && this.pz.allDone) this.next();
    if (this.swT >= 0) {
      this.swT += dt;
      this.sw = springOut(Math.min(1, this.swT * 2));
      if (this.swT > 0.25 && this.swT - dt <= 0.25) {
        rs.start();
        const [x, y] = this.lampPos();
        this.fx.burst(P.good, x, y, 16, 220, 0.8, 7);
      }
      if (this.swT > 0.9 && s === 3) this.next();
    }
    if (this.step < this.steps.length) this.hintFor();
  }
  private lampPos(): [number, number] {
    return [this.bx + this.bw - 120, this.by - 12];
  }

  draw(c: C2): void {
    const { bx, by, bw, bh } = this;
    softShadow(c, bx + bw / 2, this.floorY + 2, bw * 0.6, 14, 0.5);
    // suporte (pé) do painel
    c.fillStyle = '#3a4048';
    c.fillRect(bx + bw / 2 - 16, by + bh, 32, this.floorY - by - bh);
    c.fillStyle = '#2a2f35';
    c.fillRect(bx + bw / 2 - 50, this.floorY - 8, 100, 8);
    // caixa
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    rrect(c, bx + 6, by + 8, bw, bh, 16);
    c.fill();
    c.fillStyle = this.boxG;
    c.beginPath();
    rrect(c, bx - 10, by - 10, bw + 20, bh + 20, 16);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.lineWidth = 2;
    c.stroke();
    // lâmpada em cima
    const [lx, ly] = this.lampPos();
    const on = this.swT >= 0.25;
    c.fillStyle = '#2b2f35';
    c.beginPath();
    rrect(c, lx - 22, ly + 4, 44, 14, 4);
    c.fill();
    c.fillStyle = on ? '#8dff7a' : '#3a4a36';
    c.beginPath();
    c.arc(lx, ly + 2, 16, Math.PI, 0);
    c.fill();
    if (on) glow(c, lx, ly, 70 + 6 * Math.sin(this.t * 8), 0.8, true);
    // interior
    c.fillStyle = this.plate;
    c.beginPath();
    rrect(c, bx, by, bw, bh, 10);
    c.fill();
    if (this.tangle) c.drawImage(this.tangle, bx, by, bw, bh);
    // conduíte de onde saem os fios
    c.fillStyle = '#1d2024';
    c.beginPath();
    rrect(c, bx + 46, by - 12, this.n * 14 + 32, 26, 8);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.fillRect(bx + 50, by - 9, this.n * 14 + 24, 4);
    // régua de bornes à direita
    const sx = bx + bw - 74;
    c.fillStyle = '#d9d4c6';
    c.beginPath();
    rrect(c, sx - 28, by + 16, 76, bh - 26, 8);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,.15)';
    c.fillRect(sx + 34, by + 20, 8, bh - 34);
    this.pz.drawSockets(c, this.t, this.step === 1 ? this.pz.nextHint()?.col ?? -1 : -1);
    this.pz.drawWires(c);
    this.drawDoor(c);
    // chave liga/desliga (na porta, depois de fechar)
    if (this.step >= 3 || this.swT >= 0) this.drawSwitch(c);
  }

  private drawDoor(c: C2): void {
    const { bx, by, bw, bh } = this;
    const a = easeInOut(this.door) * Math.PI * 0.92;
    const w = Math.cos(a) * bw;
    if (Math.abs(w) < 1 && this.door > 0.5) return;
    const tilt = Math.sin(a) * 26;
    const hx = bx - 6;
    c.save();
    // quadrilátero da porta em perspectiva (dobradiça à esquerda)
    c.beginPath();
    c.moveTo(hx, by - 6);
    c.lineTo(hx + w, by - 6 - tilt);
    c.lineTo(hx + w, by + bh + 6 + tilt);
    c.lineTo(hx, by + bh + 6);
    c.closePath();
    c.fillStyle = w > 0 ? this.doorG : this.doorB;
    c.fill();
    c.strokeStyle = 'rgba(20,24,28,.7)';
    c.lineWidth = 2;
    c.stroke();
    if (w > 40) {
      c.clip();
      const k = w / bw;
      // aviso de raio + puxador + parafusos (achatados pela perspectiva)
      c.translate(hx, by + bh / 2);
      c.scale(k, 1);
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.fillRect(12, -bh / 2 + 8, bw - 30, 6);
      const tx = bw * 0.45;
      c.fillStyle = '#1d1f22';
      c.beginPath();
      c.moveTo(tx, -66);
      c.lineTo(tx + 66, 50);
      c.lineTo(tx - 66, 50);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffcf2e';
      c.beginPath();
      c.moveTo(tx, -56);
      c.lineTo(tx + 56, 43);
      c.lineTo(tx - 56, 43);
      c.closePath();
      c.fill();
      c.fillStyle = '#1d1f22';
      c.beginPath();
      c.moveTo(tx + 8, -36);
      c.lineTo(tx - 16, 10);
      c.lineTo(tx, 10);
      c.lineTo(tx - 8, 36);
      c.lineTo(tx + 18, -4);
      c.lineTo(tx + 2, -4);
      c.closePath();
      c.fill();
      // puxador
      c.fillStyle = '#2b2f35';
      c.beginPath();
      rrect(c, bw - 44, -36, 18, 72, 8);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.3)';
      c.fillRect(bw - 40, -30, 4, 60);
      c.restore();
      for (const [px, py] of [
        [hx + 16 * k, by + 12],
        [hx + w - 16 * k, by + 12 - tilt * 0.9],
        [hx + 16 * k, by + bh - 12],
        [hx + w - 16 * k, by + bh - 12 + tilt * 0.9],
      ])
        drawNut(c, this.np, px, py, 0.3, 'bolt', Math.max(0.4, k));
    } else c.restore();
    if (this.step === 0 && this.door < 0.05) glow(c, bx + bw - 30, by + bh / 2, 40 + 6 * Math.sin(this.t * 5), 0.35, true);
  }

  private drawSwitch(c: C2): void {
    const [x, y] = this.switchPos();
    c.fillStyle = 'rgba(0,0,0,.4)';
    c.beginPath();
    rrect(c, x - 30, y - 34, 64, 74, 12);
    c.fill();
    c.fillStyle = '#2b2f35';
    c.beginPath();
    rrect(c, x - 32, y - 38, 64, 74, 12);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.3)';
    c.lineWidth = 2;
    c.stroke();
    // alavanca: de baixo (desligada) para cima (ligada)
    const a = (1 - this.sw) * 0.9 - 0.45;
    const on = this.sw > 0.5;
    c.fillStyle = on ? '#5fe07a' : '#e0533c';
    c.beginPath();
    c.arc(x, y + 22, 6, 0, TAU);
    c.fill();
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = '#c9cfd5';
    c.beginPath();
    rrect(c, -7, -30, 14, 32, 6);
    c.fill();
    c.fillStyle = on ? '#3cbf5a' : '#d23a2a';
    c.beginPath();
    c.arc(0, -30, 12, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath();
    c.arc(-4, -34, 4, 0, TAU);
    c.fill();
    c.restore();
    if (this.step === 3 && this.swT < 0) glow(c, x, y - 10, 40 + 5 * Math.sin(this.t * 6), 0.4, true);
  }
}
