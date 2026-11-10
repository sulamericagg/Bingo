/* ============================================================
 *  BLOOP CINEMA — efeitos de tela, balões de fala e marca d'água.
 *  Tudo é função do tempo (determinístico): voltar/avançar no
 *  editor mostra exatamente o mesmo quadro que sai no vídeo.
 * ============================================================ */
import { gameFont } from '../i18n/font';
import type { BubbleStyle, FxEvent, FxKind } from './format';

type X = CanvasRenderingContext2D;
const INK = '#2a0b5c';
const PI = Math.PI;

/** Posição de um ator na TELA (px), usada por balões e efeitos presos a ele. */
export interface ActorScreen {
  cast: string;
  /** pés */
  x: number;
  y: number;
  /** topo da cabeça */
  headY: number;
  /** boca (y) */
  mouthY: number;
  /** px por unidade do palco (tamanho aparente) */
  ppu: number;
  visible: boolean;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function star4(x: X, cx: number, cy: number, r: number): void {
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 - PI / 2;
    const rr = i % 2 ? r * 0.32 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
}
function heartPath(x: X, cx: number, cy: number, s: number): void {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 0.6, cy - s * 0.1, cx - s * 0.3, cy - s * 0.6, cx, cy - s * 0.25);
  x.bezierCurveTo(cx + s * 0.3, cy - s * 0.6, cx + s * 0.6, cy - s * 0.1, cx, cy + s * 0.35);
  x.closePath();
}

/** Deslocamento da câmera por "tremer" (px de tela), somado por todos os eventos ativos. */
export function shakeOffset(fx: FxEvent[], tl: number, W: number): [number, number] {
  let ox = 0;
  let oy = 0;
  for (const f of fx) {
    if (f.kind !== 'shake' || tl < f.t || tl > f.t + f.dur) continue;
    const u = tl - f.t;
    const decay = 1 - clamp01(u / f.dur) * 0.7;
    const a = W * 0.012 * (f.intensity ?? 1) * decay;
    ox += Math.sin(u * 53) * a + Math.sin(u * 31) * a * 0.5;
    oy += Math.cos(u * 47) * a;
  }
  return [ox, oy];
}

/**
 * Efeitos de tela/atores. `layer` 0 = antes dos balões (quase todos), 1 = por cima (clarão).
 */
export function drawFx(x: X, W: number, H: number, fx: FxEvent[], tl: number, actors: ActorScreen[], budget = 1): void {
  for (const f of fx) {
    if (tl < f.t || tl > f.t + f.dur || f.kind === 'shake') continue;
    const u = tl - f.t;
    const k = clamp01(u / f.dur);
    const fadeOut = clamp01((f.dur - u) / 0.3);
    const fadeIn = clamp01(u / 0.2);
    const a = Math.min(fadeOut, fadeIn);
    const act = f.cast ? actors.find((s) => s.cast === f.cast && s.visible) : undefined;
    const ax = act ? act.x : W / 2;
    const ay = act ? act.headY : H * 0.35;
    const s = act ? act.ppu : W / 16;
    x.save();
    x.globalAlpha = a;
    drawOne(x, f.kind, W, H, u, k, ax, ay, s, act, budget, f.id);
    x.restore();
  }
}

function drawOne(x: X, kind: FxKind, W: number, H: number, u: number, _k: number, ax: number, ay: number, s: number, act: ActorScreen | undefined, budget: number, id: string): void {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
  switch (kind) {
    case 'sparkles': {
      const n = Math.round(14 * budget) + 4;
      for (let i = 0; i < n; i++) {
        const px = act ? ax + (hash(seed + i) - 0.5) * s * 3 : hash(seed + i) * W;
        const py = act ? ay + hash(seed + i * 3) * s * 2.6 - s * 0.3 : hash(seed + i * 7) * H;
        const tw = Math.max(0, Math.sin(u * 5 + i * 1.7));
        x.fillStyle = i % 3 ? '#fff6b0' : '#ffffff';
        star4(x, px, py, s * 0.22 * tw + 1);
        x.fill();
      }
      break;
    }
    case 'rain': {
      x.fillStyle = 'rgba(30,40,90,.22)';
      x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(200,225,255,.75)';
      x.lineWidth = Math.max(1, W / 640);
      x.beginPath();
      const n = Math.round(110 * budget) + 20;
      for (let i = 0; i < n; i++) {
        const sp = 0.9 + hash(i) * 0.6;
        const px = (hash(i * 3 + 1) * W * 1.2 + u * W * 0.1) % (W * 1.2) - W * 0.1;
        const py = ((hash(i * 7) + u * sp * 1.6) % 1) * (H * 1.1) - H * 0.05;
        x.moveTo(px, py);
        x.lineTo(px - W * 0.008, py + H * 0.05);
      }
      x.stroke();
      break;
    }
    case 'snow': {
      x.fillStyle = 'rgba(255,255,255,.92)';
      const n = Math.round(80 * budget) + 15;
      for (let i = 0; i < n; i++) {
        const py = ((hash(i * 7) + u * (0.08 + hash(i) * 0.08)) % 1) * H;
        const px = hash(i * 3) * W + Math.sin(u * 1.5 + i) * W * 0.015;
        x.beginPath();
        x.arc(px, py, (1.5 + hash(i * 5) * 2.5) * (W / 1280) * 1.6, 0, PI * 2);
        x.fill();
      }
      break;
    }
    case 'hearts': {
      for (let i = 0; i < 7; i++) {
        const p = (u * 0.7 + i / 7) % 1;
        const px = ax + Math.sin(p * 6 + i) * s * 0.6 + (hash(seed + i) - 0.5) * s * 1.2;
        const py = ay + s * 0.4 - p * s * 2.4;
        x.globalAlpha *= 1 - p * 0.3;
        x.fillStyle = i % 2 ? '#ff2e63' : '#ff8fb8';
        heartPath(x, px, py, s * (0.35 + 0.25 * Math.sin(p * PI)));
        x.fill();
        x.lineWidth = Math.max(1, s * 0.04);
        x.strokeStyle = INK;
        x.stroke();
      }
      break;
    }
    case 'sweat': {
      const px = ax + s * 0.75;
      const py = ay + s * 0.35 + Math.min(1, u * 0.7) * s * 0.4;
      x.fillStyle = '#9fe3ff';
      x.beginPath();
      x.moveTo(px, py - s * 0.4);
      x.quadraticCurveTo(px + s * 0.25, py, px, py + s * 0.15);
      x.quadraticCurveTo(px - s * 0.25, py, px, py - s * 0.4);
      x.fill();
      x.lineWidth = Math.max(1, s * 0.05);
      x.strokeStyle = INK;
      x.stroke();
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(px - s * 0.06, py - s * 0.02, s * 0.05, 0, PI * 2);
      x.fill();
      break;
    }
    case 'zoomlines': {
      const cx = act ? ax : W / 2;
      const cy = act ? (act.headY + act.y) / 2 : H / 2;
      x.fillStyle = INK;
      const n = 46;
      const R0 = Math.max(W, H) * 0.95;
      const r1 = Math.min(W, H) * 0.32;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2 + hash(i + Math.floor(u * 12)) * 0.08;
        const w = 0.012 + hash(i * 3 + Math.floor(u * 12)) * 0.02;
        const rr = r1 * (0.9 + hash(i * 7 + Math.floor(u * 12)) * 0.5);
        x.beginPath();
        x.moveTo(cx + Math.cos(a - w) * R0, cy + Math.sin(a - w) * R0);
        x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        x.lineTo(cx + Math.cos(a + w) * R0, cy + Math.sin(a + w) * R0);
        x.fill();
      }
      break;
    }
    case 'confetti': {
      const cols = ['#ff5c8a', '#ffd93b', '#3fc8ff', '#9be15d', '#d77bff', '#ffaa3b'];
      const n = Math.round(90 * budget) + 20;
      for (let i = 0; i < n; i++) {
        const py = ((hash(i * 7) - 0.3 + u * (0.25 + hash(i) * 0.2)) % 1.3) * H;
        const px = hash(i * 3) * W + Math.sin(u * 2 + i) * W * 0.02;
        x.save();
        x.translate(px, py);
        x.rotate(u * (3 + hash(i) * 6) + i);
        x.fillStyle = cols[i % cols.length];
        const cw = W * 0.008;
        x.fillRect(-cw, -cw * 0.5, cw * 2, cw * Math.abs(Math.cos(u * 7 + i)) + 1);
        x.restore();
      }
      break;
    }
    case 'flash': {
      x.globalAlpha *= Math.max(0, 1 - u / 0.5) * 0.9 + (Math.sin(u * 30) > 0.7 && u < 0.6 ? 0.3 : 0);
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, W, H);
      break;
    }
    case 'poof': {
      const p = Math.min(1, u / 0.8);
      x.globalAlpha *= 1 - p;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2;
        const rr = s * (0.3 + p * 1.3);
        x.fillStyle = i % 2 ? '#ffffff' : '#e6e0f5';
        x.beginPath();
        x.arc(ax + Math.cos(a) * rr, (act ? (act.headY + act.y) / 2 : ay) + Math.sin(a) * rr * 0.7, s * (0.5 + p * 0.3), 0, PI * 2);
        x.fill();
      }
      break;
    }
    case 'anger': {
      const pulse = 1 + Math.sin(u * 12) * 0.15;
      const px = ax + s * 0.65;
      const py = ay + s * 0.15;
      x.strokeStyle = '#ff2e3a';
      x.lineWidth = s * 0.13;
      x.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        const ccx = px + Math.cos(a) * s * 0.2 * pulse;
        const ccy = py + Math.sin(a) * s * 0.2 * pulse;
        x.beginPath();
        x.arc(ccx, ccy, s * 0.14 * pulse, a + PI * 0.55, a + PI * 1.45);
        x.stroke();
      }
      break;
    }
    case 'notes': {
      x.font = gameFont(700, Math.round(s * 0.6));
      x.textAlign = 'center';
      for (let i = 0; i < 5; i++) {
        const p = (u * 0.5 + i / 5) % 1;
        x.globalAlpha = Math.sin(p * PI);
        x.fillStyle = ['#ff5c8a', '#3fc8ff', '#ffd93b', '#9b6bff', '#3ecf8e'][i];
        x.fillText(i % 2 ? '♪' : '♫', ax + s * 0.8 + Math.sin(p * 7 + i) * s * 0.4, ay + s * 0.2 - p * s * 2);
      }
      break;
    }
    case 'stars': {
      for (let i = 0; i < 5; i++) {
        const a = u * 4 + (i / 5) * PI * 2;
        const px = ax + Math.cos(a) * s * 0.8;
        const py = ay - s * 0.05 + Math.sin(a) * s * 0.22;
        x.fillStyle = '#ffe14f';
        star4(x, px, py, s * 0.2);
        x.fill();
        x.lineWidth = Math.max(1, s * 0.03);
        x.strokeStyle = INK;
        x.stroke();
      }
      break;
    }
  }
}

/* ============================================================
 *  BALÕES
 * ============================================================ */
export interface BubbleIn {
  text: string;
  style: BubbleStyle;
  /** tempo desde que a fala começou / quanto falta para acabar */
  age: number;
  left: number;
  speaker?: ActorScreen;
  name?: string;
  color?: string;
}

function wrap(x: X, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const tryS = cur ? cur + ' ' + w : w;
    if (x.measureText(tryS).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = tryS;
  }
  if (cur) lines.push(cur);
  // palavra gigante sem espaço: quebra por letra
  const out: string[] = [];
  for (const l of lines) {
    if (x.measureText(l).width <= maxW * 1.05) {
      out.push(l);
      continue;
    }
    let s = '';
    for (const ch of l) {
      if (x.measureText(s + ch).width > maxW) {
        out.push(s);
        s = ch;
      } else s += ch;
    }
    if (s) out.push(s);
  }
  return out.slice(0, 5);
}

const easeBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawBubbles(x: X, W: number, H: number, list: BubbleIn[]): void {
  const placed: Rect[] = [];
  let subN = 0;
  for (const b of list) {
    const pop = easeBack(clamp01(b.age / 0.18));
    const out = clamp01(b.left / 0.15);
    if (pop * out < 0.04 && b.style !== 'subtitle' && b.style !== 'narration') continue;
    const reveal = Math.min(b.text.length, Math.floor(b.age * 45) + 1);
    const shown = b.text.slice(0, reveal);
    if (b.style === 'subtitle' || (!b.speaker && b.style !== 'narration')) {
      const fs = Math.round(H * 0.046);
      x.font = gameFont(700, fs);
      const lines = wrap(x, (b.name ? b.name + ': ' : '') + b.text, W * 0.8);
      const lh = fs * 1.25;
      const bh = lines.length * lh + fs * 0.6;
      const by = H - bh - H * 0.05 - subN * (bh + 6);
      subN++;
      x.save();
      x.globalAlpha = Math.min(1, b.age / 0.15) * out;
      x.fillStyle = 'rgba(10,4,30,.66)';
      let mw = 0;
      for (const l of lines) mw = Math.max(mw, x.measureText(l).width);
      x.beginPath();
      x.roundRect(W / 2 - mw / 2 - fs * 0.6, by, mw + fs * 1.2, bh, fs * 0.4);
      x.fill();
      x.textAlign = 'center';
      x.textBaseline = 'top';
      let shownLeft = reveal + (b.name ? b.name.length + 2 : 0);
      lines.forEach((l, i) => {
        const vis = l.slice(0, Math.max(0, shownLeft));
        shownLeft -= l.length + 1;
        x.fillStyle = '#ffffff';
        if (b.name && i === 0 && b.color) {
          // nome colorido
          const nm = b.name + ': ';
          const full = x.measureText(l).width;
          const sx = W / 2 - full / 2;
          x.textAlign = 'left';
          x.fillStyle = b.color;
          x.fillText(nm.slice(0, vis.length), sx, by + fs * 0.3);
          x.fillStyle = '#ffffff';
          x.fillText(vis.slice(nm.length), sx + x.measureText(nm).width, by + fs * 0.3);
          x.textAlign = 'center';
        } else x.fillText(vis, W / 2, by + fs * 0.3 + i * lh);
      });
      x.restore();
      continue;
    }
    if (b.style === 'narration') {
      const fs = Math.round(H * 0.042);
      x.font = gameFont(600, fs);
      const lines = wrap(x, b.text, W * 0.6);
      const lh = fs * 1.25;
      let mw = 0;
      for (const l of lines) mw = Math.max(mw, x.measureText(l).width);
      const bw = mw + fs * 1.2;
      const bh = lines.length * lh + fs * 0.7;
      const bx = W * 0.03;
      const by = H * 0.04;
      x.save();
      x.globalAlpha = Math.min(1, b.age / 0.2) * out;
      x.translate(bx, by);
      x.rotate(-0.012);
      x.fillStyle = '#fff3b0';
      x.strokeStyle = INK;
      x.lineWidth = Math.max(2, H * 0.005);
      x.beginPath();
      x.rect(0, 0, bw, bh);
      x.fill();
      x.stroke();
      x.fillStyle = INK;
      x.textBaseline = 'top';
      let left = reveal;
      lines.forEach((l, i) => {
        x.fillText(l.slice(0, Math.max(0, left)), fs * 0.6, fs * 0.35 + i * lh);
        left -= l.length + 1;
      });
      x.restore();
      continue;
    }
    // balões presos ao personagem
    const sp = b.speaker!;
    const shout = b.style === 'shout';
    const whisper = b.style === 'whisper';
    const think = b.style === 'think';
    const fs = Math.round(H * (shout ? 0.05 : whisper ? 0.036 : 0.043));
    x.font = gameFont(shout ? 700 : whisper ? 500 : 600, fs);
    const txt = shout ? b.text.toUpperCase() : b.text;
    const lines = wrap(x, txt, W * 0.3);
    const lh = fs * 1.2;
    let mw = 0;
    for (const l of lines) mw = Math.max(mw, x.measureText(l).width);
    const padX = fs * (shout ? 1.0 : think ? 0.95 : 0.7);
    const padY = fs * (shout ? 0.8 : think ? 0.7 : 0.45);
    const bw = mw + padX * 2;
    const bh = lines.length * lh + padY * 2 - (lh - fs);
    let bx = sp.x - bw / 2 + (sp.x < W / 2 ? bw * 0.15 : -bw * 0.15);
    let by = sp.headY - bh - H * 0.06;
    bx = Math.max(W * 0.02, Math.min(W * 0.98 - bw, bx));
    if (by < H * 0.02) by = H * 0.02;
    // evita sobrepor balões anteriores
    for (let guard = 0; guard < 4; guard++) {
      const hit = placed.find((r) => bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y);
      if (!hit) break;
      if (hit.y - bh - 8 > H * 0.01) by = hit.y - bh - 8;
      else bx = hit.x + hit.w + 8 > W - bw ? hit.x - bw - 8 : hit.x + hit.w + 8;
    }
    placed.push({ x: bx, y: by, w: bw, h: bh });
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const tx = Math.max(bx + bw * 0.15, Math.min(bx + bw * 0.85, sp.x));
    const tipX = sp.x + (sp.x < cx ? 1 : -1) * Math.min(8, Math.abs(sp.x - cx) * 0.1);
    const tipY = Math.min(sp.headY - H * 0.008, by + bh + H * 0.07);
    x.save();
    x.translate(cx, by + bh);
    x.scale(pop * out + (1 - out) * 0.9, pop * out + (1 - out) * 0.9);
    x.translate(-cx, -(by + bh));
    x.globalAlpha = out;
    if (shout) x.translate(Math.sin(b.age * 60) * fs * 0.04, 0);
    x.lineWidth = Math.max(2, H * (shout ? 0.0075 : 0.0055));
    x.strokeStyle = INK;
    x.fillStyle = whisper ? 'rgba(255,255,255,.88)' : shout ? '#fff6b0' : '#ffffff';
    if (whisper) x.setLineDash([fs * 0.35, fs * 0.25]);
    x.beginPath();
    if (shout) {
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        const rr = i % 2 ? 1 : 1.18 + hash(i) * 0.12;
        x.lineTo(cx + Math.cos(a) * (bw / 2) * rr * 1.05, cy + Math.sin(a) * (bh / 2) * rr * 1.1);
      }
      x.closePath();
      x.fill();
      x.stroke();
      // rabinho espetado
      x.beginPath();
      x.moveTo(tx - fs * 0.5, by + bh * 0.95);
      x.lineTo(tipX, tipY);
      x.lineTo(tx + fs * 0.4, by + bh * 0.9);
      x.fill();
      x.stroke();
    } else if (think) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        const px = cx + Math.cos(a) * bw * 0.5;
        const py = cy + Math.sin(a) * bh * 0.52;
        x.moveTo(px + bh * 0.32, py);
        x.arc(px, py, bh * 0.32, 0, PI * 2);
      }
      x.fill();
      x.stroke();
      x.beginPath();
      x.ellipse(cx, cy, bw * 0.5, bh * 0.52, 0, 0, PI * 2);
      x.fill();
      // bolinhas
      for (let i = 0; i < 3; i++) {
        const k = (i + 1) / 4;
        const px = tx + (tipX - tx) * k;
        const py = by + bh + (tipY - by - bh) * k + bh * 0.2;
        x.beginPath();
        x.arc(px, py, fs * (0.32 - i * 0.08), 0, PI * 2);
        x.fill();
        x.stroke();
      }
    } else {
      x.roundRect(bx, by, bw, bh, Math.min(bh / 2, fs * 0.9));
      x.fill();
      x.stroke();
      // rabinho
      x.beginPath();
      x.moveTo(tx - fs * 0.45, by + bh - x.lineWidth);
      x.quadraticCurveTo(tx, by + bh + (tipY - by - bh) * 0.4, tipX, tipY);
      x.quadraticCurveTo(tx + fs * 0.1, by + bh + (tipY - by - bh) * 0.3, tx + fs * 0.45, by + bh - x.lineWidth);
      x.fill();
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = x.fillStyle as string;
      x.beginPath();
      x.rect(tx - fs * 0.42, by + bh - x.lineWidth * 2.2, fs * 0.84, x.lineWidth * 2);
      x.fillStyle = whisper ? 'rgba(255,255,255,.88)' : '#ffffff';
      x.fill();
    }
    x.setLineDash([]);
    x.fillStyle = whisper ? '#5a4a80' : INK;
    x.textAlign = 'center';
    x.textBaseline = 'top';
    let left = shown.length;
    lines.forEach((l, i) => {
      const vis = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      if (!vis) return;
      // alinha à esquerda dentro da linha (revelação estável)
      const full = x.measureText(l).width;
      x.textAlign = 'left';
      x.fillText(vis, cx - full / 2, by + padY + i * lh);
    });
    x.restore();
  }
}

/* ============================================================
 *  MARCA D'ÁGUA
 * ============================================================ */
export function drawWatermark(x: X, W: number, H: number, label: string): void {
  const fs = Math.max(11, Math.round(H * 0.028));
  x.save();
  x.font = gameFont(700, fs);
  const tw = x.measureText(label).width;
  const pad = fs * 0.5;
  const bw = tw + pad * 2 + fs * 1.2;
  const bh = fs * 1.7;
  const bx = W - bw - H * 0.025;
  const by = H - bh - H * 0.025;
  x.globalAlpha = 0.78;
  x.fillStyle = 'rgba(20,6,50,.55)';
  x.beginPath();
  x.roundRect(bx, by, bw, bh, bh / 2);
  x.fill();
  // mini bloop
  const r = fs * 0.48;
  const gx = bx + pad + r;
  const gy = by + bh / 2;
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(gx, gy, r, 0, PI * 2);
  x.fill();
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(gx - r * 0.35, gy - r * 0.1, r * 0.16, 0, PI * 2);
  x.arc(gx + r * 0.35, gy - r * 0.1, r * 0.16, 0, PI * 2);
  x.fill();
  x.fillStyle = '#ffffff';
  x.textBaseline = 'middle';
  x.fillText(label, gx + r + pad * 0.6, gy + 1);
  x.restore();
}
