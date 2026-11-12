/* ============================================================
 *  POUSO FORÇADO — modo 2D: corte do avião visto de cima (leve).
 *  Nariz à esquerda, cauda à direita; o lado direito do avião fica
 *  para cima na tela. Mesma simulação do 3D.
 * ============================================================ */
import { gameFont } from '../../i18n/font';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS } from '../../game/skins';
import { save as globalSave } from '../../core/storage';
import { BOXES, HAT_COLS, SEATS, SPOTS, WIN_Z, type Cabin, type Livery } from './data';
import type { Ev, Sim } from './sim';

const TAU = Math.PI * 2;
const INK = '#2a0b5c';
const PAX_SKINS = ['bloop', 'mint', 'sunny', 'ocean', 'kitty', 'bee', 'devil', 'astro'];

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  r: number;
}

export class View2D {
  readonly canvas: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private W = 1;
  private H = 1;
  private k = 60;
  private camZ = 0;
  private camX = 0;
  private t = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  private puffs: Puff[] = [];
  private clouds: { x: number; y: number; r: number; s: number }[] = [];
  private shake = 0;
  private ending = 0;
  private dpr = 1;

  constructor(
    private root: HTMLElement,
    private sim: Sim,
    private o: { livery: Livery; cabin: Cabin; dprCap: number },
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'voo-canvas';
    root.appendChild(this.canvas);
    this.x = this.canvas.getContext('2d')!;
    for (let i = 0; i < 14; i++) this.clouds.push({ x: Math.random(), y: Math.random(), r: 40 + Math.random() * 90, s: 0.6 + Math.random() * 0.8 });
    this.resize();
  }
  resize(): void {
    this.dpr = Math.min(this.o.dprCap, window.devicePixelRatio || 1);
    this.W = Math.max(1, this.root.clientWidth || window.innerWidth);
    this.H = Math.max(1, this.root.clientHeight || window.innerHeight);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.k = Math.min(this.H / 5.4, this.W / 9.5);
  }
  private sx(z: number): number {
    return this.W / 2 + (z - this.camZ) * this.k;
  }
  private sy(px: number): number {
    return this.H / 2 - (px - this.camX) * this.k;
  }
  project(px: number, _y: number, z: number, out: { x: number; y: number; behind: boolean }): void {
    out.x = this.sx(z);
    out.y = this.sy(px) - _y * this.k * 0.25;
    out.behind = false;
  }

  private sprite(skin: string, worried: boolean, role: number): HTMLCanvasElement {
    const key = skin + worried + role;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d')!;
    x.translate(48, 54);
    const sk = SKINS.find((s) => s.id === skin) ?? SKINS.find((s) => s.id === globalSave.skin) ?? SKINS[0];
    const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: worried ? -0.3 : 0.1, sx: 1, sy: 1, mood: worried ? 'dead' : 'happy', lx: -0.5, ly: -0.7, still: true };
    try {
      drawPlayer(x, sk, 30, pose);
    } catch {
      x.fillStyle = sk.light;
      x.beginPath();
      x.arc(0, 0, 30, 0, TAU);
      x.fill();
    }
    if (role >= 0) drawHat(x, role, 0, -30, 30);
    this.sprites.set(key, c);
    return c;
  }

  onEv(ev: Ev): void {
    if (ev.k === 'jolt') this.shake = Math.min(1, this.shake + ev.amt * 0.25);
    else if (ev.k === 'fx') {
      const col = ev.t === 'fireOut' ? '#e8e8f0' : ev.t === 'spark' ? '#9ff4ff' : ev.t === 'calm' ? '#ff7ab8' : ev.t === 'fixed' ? '#7aff9a' : ev.t === 'glass' ? '#cfefff' : '#ffd34a';
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU;
        const sp = 0.5 + Math.random() * 1.6;
        this.puffs.push({ x: ev.z, y: ev.x, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8, max: 0.8, col, r: ev.t === 'fireOut' ? 0.25 : 0.08 });
      }
    } else if (ev.k === 'touch') this.ending = 0.001;
  }

  frame(dt: number): void {
    this.t += dt;
    const s = this.sim;
    const f = s.f;
    const x = this.x;
    const me = s.players[s.me];
    const W = this.W;
    const H = this.H;
    if (this.ending) this.ending += dt;
    // câmera segue o jogador (ou a cabine)
    const tz = me.seated ? -1.2 : me.z;
    this.camZ += (Math.max(-1.5, Math.min(17.5, tz)) - this.camZ) * Math.min(1, dt * 4);
    // sentado: sobe o avião para o painel (PFD) não cobrir a cabine
    this.camX += ((me.seated ? -(H * 0.2) / this.k : 0) - this.camX) * Math.min(1, dt * 4);
    this.shake = Math.max(0, this.shake - dt * 2);
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // chão lá embaixo / nuvens passando
    const alt = f.alt;
    const sky = x.createLinearGradient(0, 0, 0, H);
    const low = Math.max(0, Math.min(1, 1 - alt / 2400));
    sky.addColorStop(0, low > 0.7 ? '#7fb85e' : '#7aa0d8');
    sky.addColorStop(1, low > 0.7 ? '#5f9a48' : '#a8c6ea');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);
    if (alt < 800 || this.ending) {
      // campos quando baixo
      const sc = 0.05 + (1 - alt / 800) * 0.4;
      const off = (-f.z * sc) % 80;
      x.fillStyle = 'rgba(70,120,60,0.35)';
      for (let i = -2; i < W / 80 + 2; i++) for (let j = -2; j < H / 80 + 2; j++) if ((i + j) % 2 === 0) x.fillRect(i * 80 + off, j * 80 + ((f.x * sc) % 80), 78, 78);
      if (s.phase === 'final' || this.ending) {
        // pista aparecendo
        const rz = (f.z - 0) * sc;
        x.fillStyle = '#4a4b55';
        x.fillRect(W / 2 - rz - 2600 * sc, H / 2 + f.x * sc - 23 * sc, 2600 * sc, 46 * sc);
      }
    }
    for (const c of this.clouds) {
      c.x -= dt * (0.02 + f.spd / 3000) * c.s;
      if (c.x < -0.3) c.x = 1.3;
      x.fillStyle = `rgba(255,255,255,${alt > 1200 ? 0.75 : 0.35})`;
      x.beginPath();
      x.arc(c.x * W, c.y * H, c.r, 0, TAU);
      x.arc(c.x * W + c.r * 0.8, c.y * H + 10, c.r * 0.7, 0, TAU);
      x.fill();
    }
    x.save();
    if (this.shake > 0) x.translate((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 10);
    if (this.ending && s.outcome?.kind === 'crash') {
      const e = this.ending;
      x.translate(W / 2, H / 2);
      x.rotate(Math.sin(e * 6) * Math.exp(-e) * 0.2);
      x.translate(-W / 2, -H / 2 + Math.abs(Math.sin(e * 5)) * Math.exp(-e * 1.2) * -40);
    }
    this.drawPlane();
    this.drawCabin();
    x.restore();
    // vinheta de alarme
    const alarm = s.active().some((e) => e.kind !== 'turb' && e.kind !== 'panic');
    if (alarm) {
      const a = 0.12 + 0.12 * Math.sin(this.t * 7);
      const g = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${a})`);
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    }
    if (s.dizzy > 0) {
      x.fillStyle = `rgba(150,180,255,${s.dizzy * 0.15})`;
      x.fillRect(0, 0, W, H);
    }
  }

  private drawPlane(): void {
    const x = this.x;
    const l = this.o.livery;
    const k = this.k;
    // asas e motores (por baixo da fuselagem)
    x.lineJoin = 'round';
    for (const sd of [-1, 1]) {
      x.fillStyle = '#e8ecf6';
      x.strokeStyle = INK;
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(this.sx(7.6), this.sy(sd * 1.9));
      x.lineTo(this.sx(12.4), this.sy(sd * 16.5));
      x.lineTo(this.sx(13.9), this.sy(sd * 16.5));
      x.lineTo(this.sx(12.8), this.sy(sd * 1.9));
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = l.body;
      x.beginPath();
      x.roundRect(this.sx(7.3), this.sy(sd * 6) - 0.8 * k, 3.4 * k, 1.6 * k, 0.6 * k);
      x.fill();
      x.stroke();
      const eng = this.sim.f.eng[sd < 0 ? 0 : 1];
      if (eng < 0.9 && this.sim.flying) {
        for (let i = 0; i < 3; i++) {
          x.fillStyle = i % 2 ? '#ffd34a' : '#ff6a2a';
          x.beginPath();
          x.arc(this.sx(10.9 + i * 0.6 + Math.random() * 0.3), this.sy(sd * 6) + (Math.random() - 0.5) * k * 0.6, k * (0.5 - i * 0.12), 0, TAU);
          x.fill();
        }
      }
    }
    // fuselagem
    x.fillStyle = l.body;
    x.strokeStyle = INK;
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(this.sx(-6.6), this.sy(0));
    x.quadraticCurveTo(this.sx(-5.5), this.sy(2.05), this.sx(-3), this.sy(2.05));
    x.lineTo(this.sx(18), this.sy(2.05));
    x.quadraticCurveTo(this.sx(24), this.sy(1.6), this.sx(25.3), this.sy(0));
    x.quadraticCurveTo(this.sx(24), this.sy(-1.6), this.sx(18), this.sy(-2.05));
    x.lineTo(this.sx(-3), this.sy(-2.05));
    x.quadraticCurveTo(this.sx(-5.5), this.sy(-2.05), this.sx(-6.6), this.sy(0));
    x.fill();
    x.stroke();
    x.fillStyle = l.stripe;
    x.fillRect(this.sx(-3), this.sy(2.05) + 2, this.sx(18) - this.sx(-3), k * 0.12);
    x.fillRect(this.sx(-3), this.sy(-2.05) - 2 - k * 0.12, this.sx(18) - this.sx(-3), k * 0.12);
  }

  private drawCabin(): void {
    const s = this.sim;
    const x = this.x;
    const k = this.k;
    const cab = this.o.cabin;
    const r = (x0: number, x1: number, z0: number, z1: number) => [this.sx(z0), this.sy(x1), (z1 - z0) * k, (x1 - x0) * k] as const;
    // piso
    x.fillStyle = cab.carpet;
    x.fillRect(...r(-1.75, 1.75, -1.2, 16.5));
    x.fillStyle = '#3a3f5a';
    x.fillRect(...r(-1.75, 1.75, -4, -1.2));
    x.fillStyle = '#6b6f86';
    x.fillRect(...r(-1.75, 1.75, 16.5, 21));
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.fillRect(...r(-0.35, 0.35, -1.2, 16.5));
    // janelas
    for (const z of [0.15, 1.95, ...WIN_Z, 10.6])
      for (const sd of [-1, 1]) {
        const e = s.active().find((q) => q.kind === 'bird' && Math.abs(q.z - z) < 0.01 && Math.sign(q.x) === sd);
        x.fillStyle = e ? (e.stage ? '#111' : '#ffffff') : '#8fd0ff';
        x.fillRect(this.sx(z) - k * 0.17, this.sy(sd * 1.8) - k * 0.06, k * 0.34, k * 0.12);
      }
    // móveis (caixas de colisão)
    for (const b of BOXES) {
      const z0 = b[2];
      const isSeatBlock = (b[1] - b[0] < 1.4 && z0 > 6 && z0 < 15) || (z0 > -0.4 && z0 < 2.5);
      x.fillStyle = z0 > 16.4 ? '#5b5e74' : z0 < -1 ? '#2c3048' : isSeatBlock ? 'rgba(0,0,0,0.12)' : '#e3dcef';
      x.strokeStyle = INK;
      x.lineWidth = 2;
      x.beginPath();
      x.roundRect(...r(b[0], b[1], b[2], b[3]), 4);
      x.fill();
      x.stroke();
    }
    // assentos
    for (const [sx0, sz] of SEATS) {
      x.fillStyle = sz < 3 ? cab.seat : Math.round(sz * 10) % 5 === 0 ? cab.seat2 : cab.seat;
      x.beginPath();
      x.roundRect(this.sx(sz) - k * 0.24, this.sy(sx0) - k * 0.22, k * 0.5, k * 0.44, 6);
      x.fill();
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.fillRect(this.sx(sz + 0.22), this.sy(sx0) - k * 0.22, k * 0.08, k * 0.44);
    }
    // pontos especiais
    const dot = (sp: { x: number; z: number }, col: string, rad = 0.16) => {
      x.fillStyle = col;
      x.strokeStyle = INK;
      x.lineWidth = 2;
      x.beginPath();
      x.arc(this.sx(sp.z), this.sy(sp.x), rad * k, 0, TAU);
      x.fill();
      x.stroke();
    };
    dot(SPOTS.water, '#7ad8ff');
    dot(SPOTS.snack, '#ffb02e');
    dot(SPOTS.valve, '#ff3d5a', 0.14);
    dot(SPOTS.elec, '#9aa0b8', 0.14);
    dot(SPOTS.pump, '#ff7a3a', 0.14);
    dot(SPOTS.gear, '#ffd34a', 0.2);
    dot(SPOTS.pilot, '#3d405c', 0.28);
    dot(SPOTS.copilot, '#3d405c', 0.28);
    for (const d of [SPOTS.doorF, SPOTS.doorR]) {
      x.fillStyle = '#c3b6dc';
      x.fillRect(this.sx(d.z) - k * 0.45, this.sy(-1.72) - 3, k * 0.9, 8);
    }
    // emergências
    for (const e of s.active()) {
      const ex = this.sx(e.z);
      const ey = this.sy(e.x);
      if (e.kind === 'fire') {
        const n = 4 + Math.round(e.sev * 5);
        for (let i = 0; i < n; i++) {
          const a = this.t * 9 + i * 1.7;
          x.fillStyle = i % 3 === 0 ? '#ffd34a' : '#ff6a2a';
          x.beginPath();
          x.arc(ex + Math.cos(a) * k * 0.2 * e.sev, ey + Math.sin(a * 1.3) * k * 0.2 * e.sev, k * (0.12 + e.sev * 0.15) * (0.6 + 0.4 * Math.sin(a * 2)), 0, TAU);
          x.fill();
        }
      } else if (e.kind === 'spark' && Math.random() < 0.6) {
        x.strokeStyle = '#9ff4ff';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(ex, ey);
        for (let i = 0; i < 4; i++) x.lineTo(ex + (Math.random() - 0.5) * k * 0.8, ey + (Math.random() - 0.5) * k * 0.8);
        x.stroke();
      } else if (e.kind === 'leak' && e.stage === 0) {
        x.fillStyle = 'rgba(176,122,255,0.6)';
        x.beginPath();
        x.ellipse(ex - k * 0.4, ey - k * 0.4, k * (0.2 + e.age * 0.01), k * (0.15 + e.age * 0.008), 0, 0, TAU);
        x.fill();
      } else if (e.kind === 'door') {
        x.fillStyle = e.stage ? '#8fd0ff' : Math.sin(this.t * 20) > 0 ? '#ff3d5a' : '#c3b6dc';
        x.fillRect(ex - k * 0.45, this.sy(-1.72) - 3, k * 0.9, 8);
      } else if (e.kind === 'smoke' && e.stage === 0) {
        // fumaça escura saindo do forno
        for (let i = 0; i < 4; i++) {
          const a = this.t * 1.5 + i * 1.6;
          x.fillStyle = 'rgba(80,74,90,0.45)';
          x.beginPath();
          x.arc(ex - k * 0.3 * ((a % 2) + 0.2), ey + Math.sin(a) * k * 0.2, k * (0.18 + (a % 2) * 0.12), 0, TAU);
          x.fill();
        }
      }
    }
    // porta aberta para ventilar
    if (s.ventDoor) {
      x.fillStyle = '#8fd0ff';
      x.fillRect(this.sx(SPOTS[s.ventDoor as 'doorF'].z) - k * 0.45, this.sy(-1.72) - 3, k * 0.9, 8);
    }
    // véu de fumaça por cima da cabine (vista de cima)
    if (s.smoke > 0.02) {
      x.fillStyle = `rgba(110,104,122,${Math.min(0.45, s.smoke * 0.6)})`;
      x.fillRect(this.sx(-1.2), this.sy(-1.75), this.sx(16.5) - this.sx(-1.2), this.sy(1.75) - this.sy(-1.75));
    }
    // objetos
    for (const it of s.items) {
      if (!it.alive) continue;
      const ix = this.sx(it.z);
      const iy = this.sy(it.x) - it.y * k * 0.15;
      x.save();
      x.translate(ix, iy);
      x.rotate(it.rot);
      x.strokeStyle = INK;
      x.lineWidth = 2;
      x.fillStyle = it.kind === 'ext' ? '#ff3d5a' : it.kind === 'tape' ? '#c5c9d8' : it.kind === 'water' ? '#7ad8ff' : it.kind === 'snack' ? '#ffb02e' : ['#8a5cff', '#2fb6ff', '#ff7a3a'][it.id % 3];
      x.beginPath();
      if (it.kind === 'tape') x.arc(0, 0, k * 0.11, 0, TAU);
      else if (it.kind === 'bag') x.roundRect(-k * 0.25, -k * 0.12, k * 0.5, k * 0.24, 4);
      else x.roundRect(-k * 0.08, -k * 0.14, k * 0.16, k * 0.28, 5);
      x.fill();
      x.stroke();
      x.restore();
    }
    // passageiros
    const R = k * 0.42;
    for (const p of s.pax) {
      const c = this.sprite(PAX_SKINS[p.skin], p.panic > 0.55, -1);
      // sentado: preso à poltrona; de pé: pulinho lento (sem tremedeira)
      const jump = p.standing ? Math.abs(Math.sin(p.bob * 3.4)) * k * 0.06 : 0;
      const px = p.standing ? p.x : p.sx;
      const pz = p.standing ? p.z : p.sz;
      x.drawImage(c, this.sx(pz) - R, this.sy(px) - R - jump, R * 2, R * 2);
      if (p.panic > 0.7) {
        x.fillStyle = '#ff4d6a';
        x.font = gameFont(900, k * 0.35);
        x.textAlign = 'center';
        x.fillText('!', this.sx(p.standing ? p.z : p.sz), this.sy(p.standing ? p.x : p.sx) - R - jump);
      }
    }
    // comandante desmaiado
    const capC = this.sprite('chef', true, -1);
    x.drawImage(capC, this.sx(SPOTS.copilot.z) - R, this.sy(SPOTS.copilot.x) - R, R * 2, R * 2);
    // tripulação
    const RC = k * 0.5;
    for (const p of s.players) {
      const c = this.sprite(p.idx === s.me ? globalSave.skin : p.skin, p.stun > 0, p.role);
      const px = p.seated ? SPOTS.pilot.x : p.x;
      const pz = p.seated ? SPOTS.pilot.z : p.z;
      const hop = Math.abs(Math.sin(p.walk * 3.2)) * k * 0.06;
      x.save();
      x.translate(this.sx(pz), this.sy(px) - hop);
      if (p.stun > 0) x.rotate(Math.sin(this.t * 10) * 0.3);
      x.drawImage(c, -RC, -RC, RC * 2, RC * 2);
      x.restore();
      if (p.idx === s.me) {
        x.strokeStyle = '#ffd34a';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(this.sx(pz), this.sy(px), RC * 1.05, 0, TAU);
        x.stroke();
      }
      if (p.spraying) {
        for (let i = 0; i < 4; i++) {
          x.fillStyle = 'rgba(255,255,255,0.85)';
          x.beginPath();
          x.arc(this.sx(pz + Math.cos(p.yaw) * (0.5 + i * 0.35)) + (Math.random() - 0.5) * 6, this.sy(px + Math.sin(p.yaw) * (0.5 + i * 0.35)) + (Math.random() - 0.5) * 6, k * (0.06 + i * 0.03), 0, TAU);
          x.fill();
        }
      }
      if (p.stun > 0)
        for (let i = 0; i < 3; i++) {
          const a = this.t * 5 + (i * TAU) / 3;
          x.fillStyle = '#ffd34a';
          x.beginPath();
          x.arc(this.sx(pz) + Math.cos(a) * RC, this.sy(px) - RC + Math.sin(a) * RC * 0.3, 4, 0, TAU);
          x.fill();
        }
    }
    // partículas
    for (const pf of this.puffs) {
      pf.life -= 1 / 60;
      pf.x += pf.vx / 60;
      pf.y += pf.vy / 60;
      x.globalAlpha = Math.max(0, pf.life / pf.max);
      x.fillStyle = pf.col;
      x.beginPath();
      x.arc(this.sx(pf.x), this.sy(pf.y), pf.r * k, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  destroy(): void {
    this.canvas.remove();
  }
}

/** chapéu do papel desenhado em canvas (2D e retratos) */
export function drawHat(x: CanvasRenderingContext2D, role: number, cx: number, cy: number, R: number): void {
  const [a, b, c] = HAT_COLS[role] ?? HAT_COLS[0];
  x.save();
  x.translate(cx, cy);
  x.lineJoin = 'round';
  x.strokeStyle = INK;
  x.lineWidth = R * 0.08;
  if (role <= 1) {
    x.fillStyle = a;
    x.beginPath();
    x.moveTo(-R * 0.7, R * 0.05);
    x.quadraticCurveTo(-R * 0.72, -R * 0.5, 0, -R * 0.55);
    x.quadraticCurveTo(R * 0.72, -R * 0.5, R * 0.7, R * 0.05);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = b;
    x.fillRect(-R * 0.62, -R * 0.12, R * 1.24, R * 0.16);
    x.fillStyle = '#2a2f45';
    x.beginPath();
    x.ellipse(0, R * 0.08, R * 0.6, R * 0.14, 0, 0, Math.PI);
    x.fill();
    x.fillStyle = role === 0 ? b : c;
    x.beginPath();
    x.arc(0, -R * 0.3, R * 0.1, 0, TAU);
    x.fill();
  } else if (role === 2) {
    x.fillStyle = a;
    x.beginPath();
    x.ellipse(R * 0.08, -R * 0.15, R * 0.62, R * 0.24, -0.2, 0, TAU);
    x.fill();
    x.stroke();
    x.fillStyle = c;
    x.beginPath();
    x.arc(R * 0.2, -R * 0.38, R * 0.08, 0, TAU);
    x.fill();
  } else {
    x.fillStyle = a;
    x.beginPath();
    x.roundRect(-R * 0.42, -R * 0.42, R * 0.84, R * 0.4, R * 0.12);
    x.fill();
    x.stroke();
    x.fillStyle = c;
    x.fillRect(-R * 0.42, -R * 0.2, R * 0.84, R * 0.08);
  }
  x.restore();
}
