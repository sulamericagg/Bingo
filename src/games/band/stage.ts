/* ============================================================
 *  PALCO — cenário em camadas (cache por palco/tamanho), plateia,
 *  luzes, pirotecnia no Modo Estrela e os membros da banda
 *  (Bloops com instrumentos desenhados no código).
 *  Sem alocações por quadro: partículas em pool, sprites em cache.
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../../game/character';
import type { Skin } from '../../game/skins';
import { gameFont } from '../../i18n/font';
import { drawEmoteBubble } from '../../social/emotes';
import type { QualitySettings } from '../../core/quality';
import type { Instrument } from './model';
import { hash32, mulberry } from './model';
import type { FxStyle } from './cosmetics';

const TAU = Math.PI * 2;
const INK = '#2a0b5c';

export interface Member {
  inst: Instrument;
  skin: Skin;
  name: string;
  me: boolean;
  bot: boolean;
  remote: boolean;
  /** id do par online (remoto) */
  pid: string;
  /** cores do instrumento [corpo, detalhe] */
  col: string[];
  hitT: number; // tempo (s, relógio do jogo) do último acerto
  missT: number;
  combo: number;
  score: number;
  star: boolean;
  emote: string;
  emoteT: number;
  /** cache */
  spr: HTMLCanvasElement | null;
  sprOops: HTMLCanvasElement | null;
  sprR: number;
  // posição calculada no layout
  x: number;
  y: number;
  R: number;
  ops: string;
  /** fontes em cache (recalculadas no layout) */
  fo?: string;
  fn?: string;
}

interface StageLook {
  sky: [string, string, string];
  floor: [string, string];
  lights: string[];
  crowd: string;
}

export const STAGE_LOOKS: Record<string, StageLook> = {
  garagem: { sky: ['#3a2a3f', '#5a3c4a', '#2a1a28'], floor: ['#6b4a35', '#3e2a1f'], lights: ['#ffd58a', '#ff9a5a'], crowd: '#24142e' },
  arena: { sky: ['#06061a', '#1a1050', '#0a0620'], floor: ['#2a2a40', '#121220'], lights: ['#5ef0ff', '#ff3ec8', '#ffd84a'], crowd: '#0c0820' },
  praia: { sky: ['#ff8a5c', '#ffcf7a', '#5ac8ff'], floor: ['#f2d49a', '#c9a35e'], lights: ['#fff1b0', '#ff8fd8'], crowd: '#5a2a3a' },
  espaco: { sky: ['#030214', '#160a3c', '#05031a'], floor: ['#4a4a6a', '#20203a'], lights: ['#c7a6ff', '#5ef0ff'], crowd: '#0b0624' },
  junina: { sky: ['#0d0a2a', '#2a1650', '#120a24'], floor: ['#8a5a2b', '#5a3a1a'], lights: ['#ffb000', '#ff4f4f', '#5ef0a0'], crowd: '#1a0e14' },
  neon: { sky: ['#0a0220', '#2a0a50', '#120030'], floor: ['#1a0a3a', '#0a0420'], lights: ['#ff3ec8', '#3ef0ff', '#b3ff3e'], crowd: '#080016' },
  floresta: { sky: ['#0b2a2a', '#1f5a3a', '#08201a'], floor: ['#5a3a1a', '#2a1a08'], lights: ['#b3ff8a', '#ffe08a'], crowd: '#08180e' },
  castelo: { sky: ['#1a1440', '#4a3a8a', '#100a28'], floor: ['#6a6a8a', '#3a3a5a'], lights: ['#ffd84a', '#ff8a3d'], crowd: '#120c26' },
  vulcao: { sky: ['#1a0505', '#5a1208', '#2a0806'], floor: ['#3a2020', '#1a0a0a'], lights: ['#ff7a2e', '#ffd23f'], crowd: '#140404' },
  mar: { sky: ['#021a2e', '#0a4a7a', '#021428'], floor: ['#d8c08a', '#8a7a4a'], lights: ['#4fd6ff', '#ff9a6b'], crowd: '#03192a' },
};
const STAGE_KEYS = Object.keys(STAGE_LOOKS);
export const stageKey = (id: string): string => (STAGE_LOOKS[id] ? id : id === 'espaço' ? 'espaco' : id === 'fundo-do-mar' || id === 'fundo do mar' ? 'mar' : id.startsWith('festa') ? 'junina' : id === 'vulcão' ? 'vulcao' : STAGE_KEYS[hash32(id) % STAGE_KEYS.length]);

interface Part {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: number;
  r: number;
}

export class Stage {
  w = 0;
  h = 0;
  dpr = 1;
  key = 'garagem';
  look: StageLook = STAGE_LOOKS.garagem;
  bg: HTMLCanvasElement | null = null;
  crowd: HTMLCanvasElement | null = null;
  glow: HTMLCanvasElement | null = null;
  /** retângulo do palco na tela (css px) */
  rx = 0;
  ry = 0;
  rw = 0;
  rh = 0;
  floorY = 0;
  parts: Part[] = [];
  fx: FxStyle = 'confete';
  flash = 0;
  private fxColors = ['#ff5fa2', '#ffd23f', '#5ef0ff', '#9be15d', '#c77dff', '#ffffff'];
  private pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.2, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83, still: true };

  constructor() {
    for (let i = 0; i < 120; i++) this.parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: 0, r: 2 });
  }

  setStage(id: string): void {
    const k = stageKey(id);
    if (k === this.key && this.bg) return;
    this.key = k;
    this.look = STAGE_LOOKS[k];
    this.bg = null;
    this.crowd = null;
  }

  layout(rx: number, ry: number, rw: number, rh: number, dpr: number): void {
    if (rx !== this.rx || ry !== this.ry || rw !== this.rw || rh !== this.rh || dpr !== this.dpr) {
      this.bg = null;
      this.crowd = null;
    }
    this.rx = rx;
    this.ry = ry;
    this.rw = rw;
    this.rh = rh;
    this.dpr = dpr;
    this.floorY = ry + rh * 0.8;
  }

  /* ------------------------- cenário em cache ------------------------- */

  private buildBg(): void {
    const c = document.createElement('canvas');
    const W = Math.max(2, Math.round(this.rw * this.dpr));
    const H = Math.max(2, Math.round(this.rh * this.dpr));
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.scale(this.dpr, this.dpr);
    const w = this.rw;
    const h = this.rh;
    const L = this.look;
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, L.sky[0]);
    g.addColorStop(0.65, L.sky[1]);
    g.addColorStop(1, L.sky[2]);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const r = mulberry(hash32(this.key));
    const fy = h * 0.8;
    drawScenery(x, this.key, w, h, fy, r);
    // palco: piso de tábuas + borda
    const fg = x.createLinearGradient(0, fy, 0, h);
    fg.addColorStop(0, L.floor[0]);
    fg.addColorStop(1, L.floor[1]);
    x.fillStyle = fg;
    x.fillRect(0, fy, w, h - fy);
    x.strokeStyle = 'rgba(0,0,0,.25)';
    x.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const yy = fy + ((h - fy) * i) / 6;
      x.beginPath();
      x.moveTo(0, yy);
      x.lineTo(w, yy);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.fillRect(0, fy, w, 2);
    // treliça + refletores
    x.fillStyle = '#20182e';
    x.fillRect(0, 4, w, 7);
    x.strokeStyle = '#3a3050';
    x.lineWidth = 1.5;
    for (let i = 0; i < w; i += 14) {
      x.beginPath();
      x.moveTo(i, 4);
      x.lineTo(i + 7, 11);
      x.lineTo(i + 14, 4);
      x.stroke();
    }
    const n = Math.max(4, Math.round(w / 70));
    for (let i = 0; i < n; i++) {
      const lx = ((i + 0.5) / n) * w;
      x.fillStyle = '#1a1424';
      x.beginPath();
      x.roundRect(lx - 7, 9, 14, 12, 3);
      x.fill();
      x.fillStyle = L.lights[i % L.lights.length];
      x.beginPath();
      x.arc(lx, 21, 4, 0, TAU);
      x.fill();
    }
    // caixas de som nas laterais
    for (const sx of [0, w - Math.max(22, w * 0.07)]) {
      const sw = Math.max(22, w * 0.07);
      x.fillStyle = '#18121f';
      x.fillRect(sx, fy - sw * 1.9, sw, sw * 1.9);
      x.fillStyle = '#2e2638';
      for (let k = 0; k < 2; k++) {
        x.beginPath();
        x.arc(sx + sw / 2, fy - sw * (0.5 + k * 0.85), sw * 0.32, 0, TAU);
        x.fill();
      }
    }
    this.bg = c;
    // plateia: faixa com cabecinhas e bastões de luz (2x a largura, para balançar)
    const ch = Math.max(12, Math.round(h * 0.16));
    const cc = document.createElement('canvas');
    cc.width = Math.round(w * this.dpr);
    cc.height = Math.round(ch * 1.6 * this.dpr);
    const cx = cc.getContext('2d')!;
    cx.scale(this.dpr, this.dpr);
    const cr = mulberry(7 + hash32(this.key));
    const heads = Math.round(w / 14);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < heads; i++) {
        const hx = (i + cr() * 0.8 + row * 0.5) * (w / heads);
        const hy = ch * 0.75 + row * ch * 0.38 + cr() * 4;
        const hr = ch * (0.26 + cr() * 0.08);
        if (cr() < 0.3) {
          cx.strokeStyle = this.fxColors[Math.floor(cr() * 5)];
          cx.lineWidth = 2.5;
          cx.lineCap = 'round';
          cx.beginPath();
          cx.moveTo(hx + hr * 0.6, hy);
          cx.lineTo(hx + hr * 1.1, hy - hr * 1.8);
          cx.stroke();
        }
        cx.fillStyle = row ? L.crowd : shadeHex(L.crowd, 0.14);
        cx.beginPath();
        cx.arc(hx, hy, hr, 0, TAU);
        cx.fill();
        cx.fillRect(hx - hr * 1.1, hy + hr * 0.6, hr * 2.2, ch);
      }
    }
    this.crowd = cc;
    if (!this.glow) {
      const gc = document.createElement('canvas');
      gc.width = gc.height = 64;
      const gx = gc.getContext('2d')!;
      const rg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.35, 'rgba(255,255,255,.35)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      gx.fillStyle = rg;
      gx.fillRect(0, 0, 64, 64);
      this.glow = gc;
    }
  }

  /* ------------------------- partículas ------------------------- */

  burst(x: number, y: number, n: number, budget: number): void {
    const cnt = Math.max(1, Math.round(n * budget));
    for (let k = 0; k < cnt; k++) {
      let p: Part | null = null;
      for (const q of this.parts)
        if (!q.on) {
          p = q;
          break;
        }
      if (!p) return;
      p.on = true;
      p.x = x;
      p.y = y;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 120 + Math.random() * 260;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = 0;
      p.max = 0.9 + Math.random() * 0.8;
      p.c = Math.floor(Math.random() * this.fxColors.length);
      p.r = 2 + Math.random() * 3;
      if (this.fx === 'bolhas') {
        p.vy = -40 - Math.random() * 80;
        p.vx *= 0.25;
        p.r = 3 + Math.random() * 6;
      }
    }
  }

  private drawParts(x: CanvasRenderingContext2D, dt: number): void {
    const fx = this.fx;
    for (const p of this.parts) {
      if (!p.on) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.on = false;
        continue;
      }
      if (fx === 'bolhas') {
        p.vx += Math.sin(p.life * 6 + p.r) * 4;
      } else p.vy += 380 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      x.globalAlpha = a;
      const col = this.fxColors[p.c];
      if (fx === 'bolhas') {
        x.strokeStyle = '#d8f6ff';
        x.lineWidth = 1.5;
        x.beginPath();
        x.arc(p.x, p.y, p.r, 0, TAU);
        x.stroke();
      } else if (fx === 'estrelas') {
        x.fillStyle = col;
        star(x, p.x, p.y, p.r * 1.6, p.life * 6);
      } else if (fx === 'coracoes') {
        x.fillStyle = p.c % 2 ? '#ff5fa2' : '#ff8fd8';
        heart(x, p.x, p.y, p.r * 1.4);
      } else if (fx === 'fogos') {
        x.strokeStyle = col;
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(p.x, p.y);
        x.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        x.stroke();
      } else {
        x.fillStyle = col;
        x.save();
        x.translate(p.x, p.y);
        x.rotate(p.life * 8 + p.r);
        x.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        x.restore();
      }
    }
    x.globalAlpha = 1;
  }

  /* ------------------------- membros ------------------------- */

  private sprite(m: Member, oops: boolean): HTMLCanvasElement {
    const R = m.R;
    if (m.sprR !== R) {
      m.spr = null;
      m.sprOops = null;
      m.sprR = R;
    }
    const have = oops ? m.sprOops : m.spr;
    if (have) return have;
    const rr = R * this.dpr;
    const size = Math.ceil(rr * 3.4);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.translate(size / 2, size / 2);
    this.pose.mood = oops ? 'dead' : 'happy';
    this.pose.lookY = oops ? 0.4 : 0.1;
    try {
      drawPlayer(x, m.skin, rr, this.pose);
    } catch {
      x.fillStyle = m.skin.light;
      x.beginPath();
      x.arc(0, 0, rr, 0, TAU);
      x.fill();
    }
    if (oops) m.sprOops = c;
    else m.spr = c;
    return c;
  }

  layoutMembers(ms: Member[], landscapeSplit: number, span = 1): void {
    this.placeMembers(ms, landscapeSplit);
    if (span < 1)
      for (const m of ms) {
        m.x = this.rx + (m.x - this.rx) * span;
        m.R *= 0.85;
        m.y = this.floorY - m.R * (m.inst === 'drums' ? 1.5 : 1.08);
      }
    for (const m of ms) {
      m.fo = gameFont(700, Math.round(m.R * 0.62));
      m.fn = gameFont(700, Math.max(9, Math.round(m.R * 0.42)));
    }
  }

  private placeMembers(ms: Member[], landscapeSplit: number): void {
    // landscapeSplit > 0: membros dos dois lados da pista (largura central livre)
    const n = ms.length;
    const fy = this.floorY;
    if (landscapeSplit > 0) {
      const side = (this.rw - landscapeSplit) / 2;
      ms.forEach((m, i) => {
        const left = i % 2 === 0;
        const k = Math.floor(i / 2);
        m.R = Math.min(side * 0.17, this.rh * 0.075);
        m.x = this.rx + (left ? side * (0.32 + k * 0.42) : this.rw - side * (0.32 + k * 0.42));
        m.y = fy - m.R * (m.inst === 'drums' ? 1.4 : 1.05) - k * this.rh * 0.03;
      });
      return;
    }
    ms.forEach((m, i) => {
      m.R = Math.min(this.rw / (n * 4.2), this.rh * 0.12);
      m.x = this.rx + this.rw * ((i + 0.5) / n);
      m.y = fy - m.R * (m.inst === 'drums' ? 1.5 : 1.08);
    });
  }

  draw(x: CanvasRenderingContext2D, now: number, beat: number, ms: Member[], star: boolean, hype: number, q: QualitySettings, dt: number): void {
    if (!this.bg) this.buildBg();
    x.drawImage(this.bg!, this.rx, this.ry, this.rw, this.rh);
    const bp = beat - Math.floor(beat);
    const pulse = 1 - bp;
    // fachos de luz
    if (q.glows) {
      x.globalCompositeOperation = 'lighter';
      const n = Math.max(3, Math.round(this.rw / 110));
      const L = this.look.lights;
      for (let i = 0; i < n; i++) {
        const lx = this.rx + ((i + 0.5) / n) * this.rw;
        const sw = Math.sin(now * 0.9 + i * 1.7) * this.rw * 0.12;
        x.globalAlpha = (star ? 0.22 : 0.1) + pulse * 0.08;
        x.fillStyle = star ? (i % 2 ? '#ffd84a' : '#5ef0ff') : L[i % L.length];
        x.beginPath();
        x.moveTo(lx - 3, this.ry + 21);
        x.lineTo(lx + sw - this.rw * 0.07, this.floorY);
        x.lineTo(lx + sw + this.rw * 0.07, this.floorY);
        x.lineTo(lx + 3, this.ry + 21);
        x.fill();
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
    // membros
    for (const m of ms) this.drawMember(x, m, now, beat, star, q);
    // pirotecnia/efeitos
    if (star && q.particleBudget > 0 && Math.random() < dt * 9) this.burst(this.rx + this.rw * (0.1 + Math.random() * 0.8), this.floorY, 6, q.particleBudget);
    this.drawParts(x, dt);
    // plateia (frente) pulando no tempo
    if (this.crowd) {
      const cw = this.rw;
      const chh = this.crowd.height / this.dpr;
      const jump = (star ? 7 : 2 + hype * 4) * pulse;
      x.drawImage(this.crowd, 0, 0, this.crowd.width / 2, this.crowd.height, this.rx, this.ry + this.rh - chh * 0.72 - jump, cw / 2, chh);
      x.drawImage(this.crowd, this.crowd.width / 2, 0, this.crowd.width / 2, this.crowd.height, this.rx + cw / 2, this.ry + this.rh - chh * 0.72 - (star ? 7 : 2 + hype * 4) * (1 - ((beat + 0.5) % 1)), cw / 2, chh);
    }
    if (this.flash > 0) {
      x.globalAlpha = Math.min(1, this.flash) * 0.5;
      x.fillStyle = '#fff6c2';
      x.fillRect(this.rx, this.ry, this.rw, this.rh);
      x.globalAlpha = 1;
      this.flash -= dt * 2.5;
    }
  }

  private drawMember(x: CanvasRenderingContext2D, m: Member, now: number, beat: number, star: boolean, q: QualitySettings): void {
    const R = m.R;
    const sinceHit = now - m.hitT;
    const sinceMiss = now - m.missT;
    const oops = sinceMiss < 0.7;
    const hitK = sinceHit < 0.25 ? 1 - sinceHit / 0.25 : 0;
    const bp = beat - Math.floor(beat);
    const bob = oops ? 0 : Math.abs(Math.sin(bp * Math.PI)) * R * (m.combo > 10 ? 0.22 : 0.12);
    const shake = oops ? Math.sin(sinceMiss * 50) * R * 0.14 * (1 - sinceMiss / 0.7) : 0;
    const cx = m.x + shake;
    const cy = m.y - bob;
    const col = m.col;
    // aura do Modo Estrela / brilho de acerto
    if ((star || m.star || hitK > 0.5) && q.glows && this.glow) {
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = m.star || star ? 0.55 : hitK * 0.3;
      x.drawImage(this.glow, cx - R * 2.2, cy - R * 2.2, R * 4.4, R * 4.4);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
    // sombra
    x.fillStyle = 'rgba(0,0,0,.28)';
    x.beginPath();
    x.ellipse(m.x, this.floorY - (m.inst === 'drums' ? R * 0.35 : 0) + 2, R * 1.1, R * 0.25, 0, 0, TAU);
    x.fill();
    // instrumento atrás (bateria/teclado ficam na frente do corpo)
    if (m.inst === 'drums') this.drumKitBack(x, m.x, m.y, R, col, hitK);
    // corpo
    const spr = this.sprite(m, oops);
    const sq = 1 + hitK * 0.08;
    const sw = (spr.width / this.dpr) * (1 / sq);
    const sh = (spr.height / this.dpr) * sq;
    x.drawImage(spr, cx - sw / 2, cy - sh / 2 - (sq - 1) * R, sw, sh);
    // instrumento + braços
    x.lineCap = 'round';
    x.lineJoin = 'round';
    switch (m.inst) {
      case 'drums':
        this.drumFront(x, m.x, m.y, cx, cy, R, col, hitK, beat);
        break;
      case 'bass':
      case 'guitar':
        this.stringed(x, cx, cy, R, col, hitK, m.inst === 'bass', oops);
        break;
      case 'keys':
        this.keyboard(x, m.x, m.y, cx, cy, R, col, hitK, beat);
        break;
      default:
        this.mic(x, m.x, m.y, cx, cy, R, col, hitK);
    }
    // gota de suor + "ops"
    if (oops) {
      const k = sinceMiss / 0.7;
      x.fillStyle = '#7fd8ff';
      x.strokeStyle = INK;
      x.lineWidth = 1.5;
      const dx = cx + R * 0.85;
      const dy = cy - R * 0.7 + k * R * 0.5;
      x.beginPath();
      x.moveTo(dx, dy - R * 0.32);
      x.quadraticCurveTo(dx + R * 0.2, dy, dx, dy + R * 0.08);
      x.quadraticCurveTo(dx - R * 0.2, dy, dx, dy - R * 0.32);
      x.fill();
      x.stroke();
      x.globalAlpha = 1 - k * 0.6;
      x.font = m.fo ?? '';
      x.textAlign = 'center';
      x.lineWidth = 3;
      x.strokeStyle = INK;
      x.strokeText(m.ops, cx, cy - R * 1.45 - k * R * 0.4);
      x.fillStyle = '#ff7a8a';
      x.fillText(m.ops, cx, cy - R * 1.45 - k * R * 0.4);
      x.globalAlpha = 1;
    }
    // nome
    x.font = m.fn ?? '';
    x.textAlign = 'center';
    x.fillStyle = m.me ? '#ffe14d' : 'rgba(255,255,255,.85)';
    x.fillText(m.name, m.x, this.floorY + R * 0.62);
    if (m.emote) {
      const et = now - m.emoteT;
      if (!drawEmoteBubble(x, m.emote, cx, cy - R * 1.3, R / 22, et)) m.emote = '';
    }
  }

  private drumKitBack(x: CanvasRenderingContext2D, mx: number, my: number, R: number, _col: string[], hitK: number): void {
    // tons e prato atrás
    x.fillStyle = INK;
    x.fillRect(mx + R * 1.25, my - R * 1.3, R * 0.08, R * 2.2);
    x.save();
    x.translate(mx + R * 1.3, my - R * 1.3);
    x.rotate(-0.25 + hitK * 0.2);
    x.fillStyle = '#ffd23f';
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(0, 0, R * 0.7, R * 0.14, 0, 0, TAU);
    x.fill();
    x.stroke();
    x.restore();
  }

  private drumFront(x: CanvasRenderingContext2D, mx: number, my: number, cx: number, cy: number, R: number, col: string[], hitK: number, beat: number): void {
    const by = my + R * 0.55;
    // bumbo
    x.fillStyle = col[0];
    x.strokeStyle = INK;
    x.lineWidth = 2.2;
    x.beginPath();
    x.arc(mx, by, R * 0.72, 0, TAU);
    x.fill();
    x.stroke();
    x.fillStyle = '#fff6e8';
    x.beginPath();
    x.arc(mx, by, R * 0.5 * (1 + hitK * 0.06), 0, TAU);
    x.fill();
    x.fillStyle = col[0];
    x.beginPath();
    x.arc(mx, by, R * 0.16, 0, TAU);
    x.fill();
    // caixa e tom
    for (const s of [-1, 1]) {
      x.fillStyle = col[0];
      x.beginPath();
      x.ellipse(mx + s * R * 0.95, my + R * 0.05, R * 0.42, R * 0.15, 0, 0, TAU);
      x.fill();
      x.stroke();
      x.fillRect(mx + s * R * 0.95 - R * 0.42, my + R * 0.05, R * 0.84, R * 0.3);
      x.strokeRect(mx + s * R * 0.95 - R * 0.42, my + R * 0.05, R * 0.84, R * 0.3);
      x.fillStyle = '#fff6e8';
      x.beginPath();
      x.ellipse(mx + s * R * 0.95, my + R * 0.05, R * 0.36, R * 0.11, 0, 0, TAU);
      x.fill();
    }
    // baquetas alternadas
    const alt = Math.floor(beat * 2) % 2;
    for (const s of [-1, 1]) {
      const up = (s > 0) === (alt === 0) ? hitK : 0;
      const hx = cx + s * R * 0.75;
      const hy = cy + R * 0.25;
      const tx = mx + s * R * 0.95;
      const ty = my - R * 0.05 - up * R * 0.7;
      x.strokeStyle = INK;
      x.lineWidth = R * 0.14;
      x.beginPath();
      x.moveTo(hx, hy);
      x.lineTo(tx, ty);
      x.stroke();
      x.strokeStyle = col[1];
      x.lineWidth = R * 0.07;
      x.beginPath();
      x.moveTo(hx, hy);
      x.lineTo(tx, ty);
      x.stroke();
    }
  }

  private stringed(x: CanvasRenderingContext2D, cx: number, cy: number, R: number, col: string[], hitK: number, bass: boolean, oops: boolean): void {
    x.save();
    x.translate(cx, cy + R * 0.35);
    x.rotate(-0.42 + (oops ? 0.35 : 0) - hitK * 0.08);
    const neck = bass ? R * 2.1 : R * 1.75;
    // braço
    x.fillStyle = '#5a3a1a';
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.beginPath();
    x.roundRect(R * 0.3, -R * 0.09, neck, R * 0.18, R * 0.05);
    x.fill();
    x.stroke();
    x.fillStyle = col[1];
    x.fillRect(R * 0.3 + neck - R * 0.25, -R * 0.14, R * 0.3, R * 0.28);
    // corpo
    x.fillStyle = col[0];
    x.beginPath();
    if (bass) {
      x.ellipse(-R * 0.05, 0, R * 0.62, R * 0.5, 0, 0, TAU);
    } else {
      x.moveTo(-R * 0.7, -R * 0.15);
      x.quadraticCurveTo(-R * 0.6, -R * 0.62, -R * 0.1, -R * 0.4);
      x.quadraticCurveTo(R * 0.3, -R * 0.55, R * 0.4, -R * 0.12);
      x.lineTo(R * 0.4, R * 0.12);
      x.quadraticCurveTo(R * 0.3, R * 0.55, -R * 0.1, R * 0.42);
      x.quadraticCurveTo(-R * 0.75, R * 0.6, -R * 0.7, -R * 0.15);
    }
    x.fill();
    x.stroke();
    x.fillStyle = INK;
    x.beginPath();
    x.arc(-R * 0.08, 0, R * 0.12, 0, TAU);
    x.fill();
    // cordas
    x.strokeStyle = col[1];
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(-R * 0.35, 0);
    x.lineTo(R * 0.3 + neck, 0);
    x.stroke();
    // mão do braço (acordes) e mão da palheta
    x.fillStyle = INK;
    x.beginPath();
    x.arc(R * 0.3 + neck * 0.62, R * 0.12, R * 0.15, 0, TAU);
    x.fill();
    x.beginPath();
    x.arc(-R * 0.2, -R * 0.28 + hitK * R * 0.4, R * 0.16, 0, TAU);
    x.fill();
    x.restore();
  }

  private keyboard(x: CanvasRenderingContext2D, mx: number, my: number, cx: number, _cy: number, R: number, col: string[], hitK: number, beat: number): void {
    const ky = my + R * 0.35;
    // suporte
    x.strokeStyle = INK;
    x.lineWidth = R * 0.12;
    x.beginPath();
    x.moveTo(mx - R * 0.9, this.floorY);
    x.lineTo(mx + R * 0.9, ky + R * 0.2);
    x.moveTo(mx + R * 0.9, this.floorY);
    x.lineTo(mx - R * 0.9, ky + R * 0.2);
    x.stroke();
    x.fillStyle = col[0];
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.beginPath();
    x.roundRect(mx - R * 1.35, ky - R * 0.12, R * 2.7, R * 0.42, R * 0.08);
    x.fill();
    x.stroke();
    x.fillStyle = '#ffffff';
    x.fillRect(mx - R * 1.2, ky + R * 0.06, R * 2.4, R * 0.18);
    x.fillStyle = INK;
    for (let i = 0; i < 9; i++) if (i % 3 !== 2) x.fillRect(mx - R * 1.12 + i * R * 0.27, ky + R * 0.06, R * 0.1, R * 0.1);
    // mãos
    const alt = Math.floor(beat * 2) % 2;
    for (const s of [-1, 1]) {
      const up = (s > 0) === (alt === 0) ? hitK : 0;
      x.fillStyle = INK;
      x.beginPath();
      x.arc(cx + s * R * 0.65, ky - R * 0.02 - up * R * 0.28, R * 0.16, 0, TAU);
      x.fill();
    }
  }

  private mic(x: CanvasRenderingContext2D, mx: number, _my: number, cx: number, cy: number, R: number, col: string[], hitK: number): void {
    x.strokeStyle = INK;
    x.lineWidth = R * 0.1;
    x.beginPath();
    x.moveTo(mx + R * 0.95, this.floorY);
    x.lineTo(mx + R * 0.95, cy + R * 0.2);
    x.lineTo(cx + R * 0.55, cy + R * 0.12);
    x.stroke();
    x.fillStyle = col[0];
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(cx + R * 0.48, cy + R * 0.08, R * 0.16, R * 0.22, -0.6, 0, TAU);
    x.fill();
    x.stroke();
    // notinhas saindo quando acerta
    if (hitK > 0) {
      x.globalAlpha = hitK;
      x.fillStyle = col[1];
      const ny = cy - R * 0.8 - (1 - hitK) * R;
      x.beginPath();
      x.ellipse(cx + R * 0.9, ny, R * 0.14, R * 0.1, -0.4, 0, TAU);
      x.fill();
      x.fillRect(cx + R * 0.99, ny - R * 0.45, R * 0.05, R * 0.45);
      x.globalAlpha = 1;
    }
    // mão no microfone
    x.fillStyle = INK;
    x.beginPath();
    x.arc(cx + R * 0.32, cy + R * 0.32 - hitK * R * 0.1, R * 0.15, 0, TAU);
    x.fill();
  }
}

/* ------------------------- cenários ------------------------- */

function drawScenery(x: CanvasRenderingContext2D, key: string, w: number, _h: number, fy: number, r: () => number): void {
  const starsN = (n: number, a = 0.8) => {
    x.fillStyle = `rgba(255,255,255,${a})`;
    for (let i = 0; i < n; i++) x.fillRect(r() * w, r() * fy * 0.8, 1 + r() * 1.5, 1 + r() * 1.5);
  };
  switch (key) {
    case 'garagem': {
      x.fillStyle = 'rgba(0,0,0,.18)';
      for (let yy = 30; yy < fy; yy += 12) for (let xx = (yy / 12) % 2 ? 0 : 14; xx < w; xx += 28) x.fillRect(xx, yy, 26, 10);
      x.fillStyle = '#c9b8a0';
      x.fillRect(w * 0.3, fy * 0.3, w * 0.4, fy * 0.7);
      x.fillStyle = 'rgba(0,0,0,.15)';
      for (let i = 0; i < 8; i++) x.fillRect(w * 0.3, fy * 0.3 + i * fy * 0.088, w * 0.4, 2);
      x.fillStyle = '#ff5fa2';
      x.fillRect(w * 0.08, fy * 0.32, w * 0.13, fy * 0.3);
      x.fillStyle = '#ffd23f';
      x.beginPath();
      x.arc(w * 0.145, fy * 0.45, w * 0.035, 0, TAU);
      x.fill();
      break;
    }
    case 'arena': {
      starsN(30, 0.4);
      x.fillStyle = '#120c30';
      x.fillRect(w * 0.25, fy * 0.2, w * 0.5, fy * 0.5);
      const g = x.createLinearGradient(0, fy * 0.22, 0, fy * 0.68);
      g.addColorStop(0, '#3a1a8a');
      g.addColorStop(1, '#ff3ec8');
      x.fillStyle = g;
      x.fillRect(w * 0.27, fy * 0.23, w * 0.46, fy * 0.44);
      x.fillStyle = 'rgba(255,255,255,.25)';
      for (let i = 0; i < 6; i++) x.fillRect(w * 0.27, fy * (0.25 + i * 0.07), w * 0.46, 1);
      break;
    }
    case 'praia': {
      x.fillStyle = '#fff1b0';
      x.beginPath();
      x.arc(w * 0.7, fy * 0.55, w * 0.1, 0, TAU);
      x.fill();
      x.fillStyle = '#2a8ad8';
      x.fillRect(0, fy * 0.62, w, fy * 0.38);
      x.fillStyle = 'rgba(255,255,255,.4)';
      for (let i = 0; i < 12; i++) x.fillRect(r() * w, fy * (0.66 + r() * 0.3), 20 + r() * 30, 2);
      for (const px of [0.1, 0.9]) {
        x.strokeStyle = '#5a3a1a';
        x.lineWidth = 6;
        x.beginPath();
        x.moveTo(w * px, fy);
        x.quadraticCurveTo(w * px + 10, fy * 0.6, w * px - 4, fy * 0.35);
        x.stroke();
        x.fillStyle = '#2f9a4a';
        for (let k = 0; k < 5; k++) {
          x.beginPath();
          x.ellipse(w * px - 4, fy * 0.35, 30, 7, (k / 5) * Math.PI, 0, TAU);
          x.fill();
        }
      }
      break;
    }
    case 'espaco': {
      starsN(80);
      x.fillStyle = '#ff9a6b';
      x.beginPath();
      x.arc(w * 0.78, fy * 0.35, w * 0.09, 0, TAU);
      x.fill();
      x.strokeStyle = 'rgba(255,230,200,.7)';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(w * 0.78, fy * 0.35, w * 0.15, w * 0.035, -0.3, 0, TAU);
      x.stroke();
      x.fillStyle = 'rgba(199,166,255,.15)';
      x.beginPath();
      x.arc(w * 0.25, fy * 0.4, w * 0.2, 0, TAU);
      x.fill();
      break;
    }
    case 'junina': {
      starsN(30, 0.5);
      const cols = ['#ff4f4f', '#ffb000', '#5ef0a0', '#4cc9f0', '#ff5fa2'];
      for (let row = 0; row < 3; row++) {
        const yy = fy * (0.18 + row * 0.16);
        x.strokeStyle = '#d8c8a0';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(0, yy);
        x.quadraticCurveTo(w / 2, yy + 18, w, yy);
        x.stroke();
        for (let i = 0; i < w / 16; i++) {
          const fx = i * 16 + 4;
          const t = fx / w;
          const fyy = yy + 18 * 4 * t * (1 - t) * 0.5 + 1;
          x.fillStyle = cols[(i + row) % cols.length];
          x.beginPath();
          x.moveTo(fx, fyy);
          x.lineTo(fx + 10, fyy);
          x.lineTo(fx + 5, fyy + 10);
          x.fill();
        }
      }
      x.fillStyle = '#8a4a1a';
      x.fillRect(w * 0.08, fy - 18, 30, 8);
      x.fillStyle = '#ff8a2e';
      x.beginPath();
      x.moveTo(w * 0.08, fy - 16);
      x.lineTo(w * 0.08 + 15, fy - 50);
      x.lineTo(w * 0.08 + 30, fy - 16);
      x.fill();
      break;
    }
    case 'neon': {
      for (let i = 0; i < 9; i++) {
        const bw = w / 9;
        const bh = fy * (0.3 + r() * 0.45);
        x.fillStyle = '#14062e';
        x.fillRect(i * bw, fy - bh, bw - 3, bh);
        for (let k = 0; k < 6; k++) {
          x.fillStyle = r() < 0.5 ? '#ff3ec8' : '#3ef0ff';
          x.globalAlpha = 0.5;
          x.fillRect(i * bw + 4 + r() * (bw - 12), fy - bh + 6 + r() * (bh - 12), 4, 3);
        }
        x.globalAlpha = 1;
      }
      x.strokeStyle = '#ff3ec8';
      x.lineWidth = 3;
      x.strokeRect(w * 0.36, fy * 0.2, w * 0.28, fy * 0.18);
      break;
    }
    case 'floresta': {
      x.fillStyle = '#fff6d0';
      x.beginPath();
      x.arc(w * 0.82, fy * 0.22, w * 0.05, 0, TAU);
      x.fill();
      for (let i = 0; i < 10; i++) {
        const tx = r() * w;
        const th = fy * (0.4 + r() * 0.4);
        x.fillStyle = i % 2 ? '#0e3a24' : '#164a2e';
        x.beginPath();
        x.moveTo(tx, fy - th);
        x.lineTo(tx - 26, fy);
        x.lineTo(tx + 26, fy);
        x.fill();
      }
      x.fillStyle = '#e6ff8a';
      for (let i = 0; i < 18; i++) x.fillRect(r() * w, r() * fy, 2, 2);
      break;
    }
    case 'castelo': {
      starsN(30, 0.6);
      x.fillStyle = '#241a4a';
      x.fillRect(w * 0.15, fy * 0.35, w * 0.7, fy * 0.65);
      for (const tx of [0.12, 0.42, 0.72]) {
        x.fillRect(w * tx, fy * 0.15, w * 0.16, fy * 0.85);
        x.beginPath();
        x.moveTo(w * tx - 4, fy * 0.15);
        x.lineTo(w * (tx + 0.08), fy * 0.02);
        x.lineTo(w * (tx + 0.16) + 4, fy * 0.15);
        x.fill();
        x.fillStyle = '#ffd84a';
        x.fillRect(w * (tx + 0.065), fy * 0.3, w * 0.03, fy * 0.08);
        x.fillStyle = '#241a4a';
      }
      break;
    }
    case 'vulcao': {
      x.fillStyle = '#2a0a08';
      x.beginPath();
      x.moveTo(w * 0.1, fy);
      x.lineTo(w * 0.42, fy * 0.25);
      x.lineTo(w * 0.58, fy * 0.25);
      x.lineTo(w * 0.9, fy);
      x.fill();
      x.fillStyle = '#ff7a2e';
      x.beginPath();
      x.moveTo(w * 0.42, fy * 0.25);
      x.lineTo(w * 0.58, fy * 0.25);
      x.lineTo(w * 0.53, fy * 0.5);
      x.lineTo(w * 0.47, fy * 0.42);
      x.fill();
      x.fillStyle = 'rgba(255,120,40,.6)';
      for (let i = 0; i < 20; i++) x.fillRect(r() * w, r() * fy * 0.6, 2, 2);
      break;
    }
    case 'mar': {
      x.fillStyle = 'rgba(255,255,255,.08)';
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        const lx = r() * w;
        x.moveTo(lx, 0);
        x.lineTo(lx + 30, 0);
        x.lineTo(lx + 80, fy);
        x.lineTo(lx + 20, fy);
        x.fill();
      }
      for (let i = 0; i < 8; i++) {
        x.strokeStyle = i % 2 ? '#2f9a6a' : '#3fbf7a';
        x.lineWidth = 4;
        const sx = r() * w;
        x.beginPath();
        x.moveTo(sx, fy);
        x.quadraticCurveTo(sx + 14, fy * 0.75, sx, fy * (0.45 + r() * 0.2));
        x.stroke();
      }
      x.strokeStyle = 'rgba(220,250,255,.5)';
      x.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) {
        x.beginPath();
        x.arc(r() * w, r() * fy, 2 + r() * 4, 0, TAU);
        x.stroke();
      }
      break;
    }
  }
}

function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * k));
  return '#' + ((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

export function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
}

export function heart(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.moveTo(cx, cy + r);
  x.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.7, cy - r * 1.4, cx, cy - r * 0.45);
  x.bezierCurveTo(cx + r * 0.7, cy - r * 1.4, cx + r * 1.6, cy - r * 0.2, cx, cy + r);
  x.fill();
}
