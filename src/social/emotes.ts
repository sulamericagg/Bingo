/**
 * ATALHOS RÁPIDOS (emotes) — balão com ícone desenhado à mão (canvas, sem emoji) + texto curto.
 *
 *   drawEmoteBubble(ctx, 'joinha', x, y, scale, t)  → desenha o balão acima de (x, y)
 *       t = segundos desde que o emote começou (anima: surge, flutua, some).
 *       Devolve false quando a animação acabou (t > EMOTE_DURATION).
 *       Sem alocações por quadro (caminhos fixos, larguras do texto em cache).
 *   openEmoteWheel(onPick)  → roda de emotes em overlay (DOM); chama onPick(code) e fecha.
 */
import { t as tr } from '../i18n';
import { tap } from '../core/haptics';
import socialCss from './social.css?inline';

export const EMOTE_CODES = ['joinha', 'vamos', 'uau', 'oi', 'gg', 'rindo', 'coracao', 'boa'] as const;
export type EmoteCode = (typeof EMOTE_CODES)[number];
export const EMOTE_DURATION = 3;

export function emoteLabel(code: string): string {
  switch (code) {
    case 'joinha':
      return tr('emote.joinha', 'Joinha!');
    case 'vamos':
      return tr('emote.vamos', 'Vamos!');
    case 'uau':
      return tr('emote.uau', 'Uau!');
    case 'oi':
      return tr('emote.oi', 'Oi!');
    case 'gg':
      return tr('emote.gg', 'Boa partida!');
    case 'rindo':
      return tr('emote.rindo', 'Haha!');
    case 'coracao':
      return tr('emote.coracao', 'Amei!');
    case 'boa':
      return tr('emote.boa', 'Mandou bem!');
  }
  return code;
}

const INK = '#2a0b5c';
const TAU = Math.PI * 2;

/* ---------------- ícones (centro 0,0; raio ~16) ---------------- */

function face(x: CanvasRenderingContext2D, fill: string): void {
  x.beginPath();
  x.arc(0, 0, 15, 0, TAU);
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = 3;
  x.strokeStyle = INK;
  x.stroke();
  // brilho
  x.beginPath();
  x.ellipse(-6, -8, 4.5, 2.4, -0.6, 0, TAU);
  x.fillStyle = 'rgba(255,255,255,0.65)';
  x.fill();
}

function cheeks(x: CanvasRenderingContext2D): void {
  x.fillStyle = 'rgba(255,60,150,0.45)';
  x.beginPath();
  x.ellipse(-9, 5, 3, 2, 0, 0, TAU);
  x.ellipse(9, 5, 3, 2, 0, 0, TAU);
  x.fill();
}

function heartPath(x: CanvasRenderingContext2D, s: number): void {
  x.beginPath();
  x.moveTo(0, 13 * s);
  x.bezierCurveTo(-18 * s, 1 * s, -15 * s, -14 * s, -6 * s, -13 * s);
  x.bezierCurveTo(-2 * s, -12.5 * s, 0, -9 * s, 0, -7 * s);
  x.bezierCurveTo(0, -9 * s, 2 * s, -12.5 * s, 6 * s, -13 * s);
  x.bezierCurveTo(15 * s, -14 * s, 18 * s, 1 * s, 0, 13 * s);
  x.closePath();
}

function starPath(x: CanvasRenderingContext2D, R: number, r: number): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    if (i) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
}

function fillInk(x: CanvasRenderingContext2D, fill: string, w = 3): void {
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = w;
  x.lineJoin = 'round';
  x.strokeStyle = INK;
  x.stroke();
}

/** Desenha o ícone do emote centrado em (0,0), ~32px. `k` 0..1 anima detalhes. */
export function drawEmoteIcon(x: CanvasRenderingContext2D, code: string, k = 0): void {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  switch (code) {
    case 'joinha': {
      // mão fechada com polegar para cima
      x.save();
      x.rotate(Math.sin(k * TAU) * 0.12);
      x.beginPath();
      x.moveTo(-12, -1);
      x.quadraticCurveTo(-12, -4, -8, -4);
      x.lineTo(-3, -4);
      x.lineTo(-3, -13);
      x.quadraticCurveTo(-3, -17, 1, -17);
      x.quadraticCurveTo(5, -17, 5, -12);
      x.lineTo(4, -4);
      x.lineTo(11, -4);
      x.quadraticCurveTo(15, -4, 14, 0);
      x.lineTo(12, 11);
      x.quadraticCurveTo(11, 14, 7, 14);
      x.lineTo(-8, 14);
      x.quadraticCurveTo(-12, 14, -12, 10);
      x.closePath();
      fillInk(x, '#ffd56a');
      x.strokeStyle = 'rgba(42,11,92,0.55)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(-3, 2);
      x.lineTo(12, 2);
      x.moveTo(-3, 7.5);
      x.lineTo(11, 7.5);
      x.stroke();
      x.restore();
      break;
    }
    case 'vamos': {
      // duas setas para frente (raio de velocidade)
      const off = Math.sin(k * TAU) * 2;
      for (let i = 0; i < 2; i++) {
        x.beginPath();
        const ox = -9 + i * 10 + off;
        x.moveTo(ox - 5, -12);
        x.lineTo(ox + 6, 0);
        x.lineTo(ox - 5, 12);
        x.strokeStyle = INK;
        x.lineWidth = 10;
        x.stroke();
        x.strokeStyle = i ? '#3ee07a' : '#5ef0ff';
        x.lineWidth = 5;
        x.stroke();
      }
      break;
    }
    case 'uau': {
      face(x, '#ffd56a');
      x.fillStyle = INK;
      x.beginPath();
      x.ellipse(-5.5, -3, 2.4, 3.4, 0, 0, TAU);
      x.ellipse(5.5, -3, 2.4, 3.4, 0, 0, TAU);
      x.fill();
      x.beginPath();
      x.ellipse(0, 7, 3.2, 4 + Math.sin(k * TAU) * 0.8, 0, 0, TAU);
      x.fill();
      cheeks(x);
      break;
    }
    case 'oi': {
      // mão aberta acenando
      x.save();
      x.rotate(Math.sin(k * TAU * 2) * 0.35);
      x.beginPath();
      x.roundRect(-10, -3, 19, 17, 7);
      fillInk(x, '#ffd56a');
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.roundRect(-9.5 + i * 4.8, -16 + Math.abs(i - 1.5) * 1.8, 4.6, 16, 2.3);
        fillInk(x, '#ffd56a', 2.4);
      }
      x.beginPath();
      x.roundRect(6, 0, 10, 4.6, 2.3);
      fillInk(x, '#ffd56a', 2.4);
      x.beginPath();
      x.roundRect(-8.5, -1, 16, 11, 5);
      x.fillStyle = '#ffd56a';
      x.fill();
      x.restore();
      break;
    }
    case 'gg': {
      x.beginPath();
      x.roundRect(-17, -12, 34, 24, 8);
      fillInk(x, '#8a5cff');
      x.font = '900 17px Fredoka, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 4;
      x.strokeStyle = INK;
      x.strokeText('GG', 0, 1);
      x.fillStyle = '#fff';
      x.fillText('GG', 0, 1);
      break;
    }
    case 'rindo': {
      face(x, '#ffd56a');
      x.strokeStyle = INK;
      x.lineWidth = 2.6;
      x.beginPath();
      x.moveTo(-9, -3);
      x.lineTo(-5, -6);
      x.lineTo(-1.5, -3);
      x.moveTo(1.5, -3);
      x.lineTo(5, -6);
      x.lineTo(9, -3);
      x.stroke();
      x.beginPath();
      x.moveTo(-8, 3);
      x.quadraticCurveTo(0, 15 + Math.sin(k * TAU * 2) * 1.5, 8, 3);
      x.closePath();
      x.fillStyle = INK;
      x.fill();
      x.beginPath();
      x.ellipse(0, 8.5, 3.6, 2, 0, 0, TAU);
      x.fillStyle = '#ff5c8a';
      x.fill();
      cheeks(x);
      break;
    }
    case 'coracao': {
      const s = 1 + Math.sin(k * TAU * 2) * 0.08;
      heartPath(x, s);
      fillInk(x, '#ff5cc8');
      x.beginPath();
      x.ellipse(-6, -6, 3, 1.8, -0.6, 0, TAU);
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.fill();
      break;
    }
    case 'boa':
    default: {
      x.save();
      x.rotate(k * 0.6);
      starPath(x, 16, 7);
      fillInk(x, '#ffcf2e');
      x.restore();
      x.beginPath();
      x.ellipse(-4, -5, 3, 1.6, -0.6, 0, TAU);
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.fill();
      break;
    }
  }
}

/* ---------------- balão ---------------- */

const FONT = '700 15px Fredoka, system-ui, sans-serif';
const widthCache = new Map<string, number>();

function labelWidth(x: CanvasRenderingContext2D, label: string): number {
  let w = widthCache.get(label);
  if (w === undefined) {
    x.font = FONT;
    w = x.measureText(label).width;
    widthCache.set(label, w);
  }
  return w;
}

const ease = (v: number) => 1 - (1 - v) * (1 - v);

/**
 * Balão de emote sobre a cabeça. (x, y) = ponta do balão (logo acima da cabeça).
 * `scale` = tamanho (1 ≈ 44 px de altura). Devolve false quando terminou.
 */
export function drawEmoteBubble(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, scale: number, t: number): boolean {
  if (t < 0 || t > EMOTE_DURATION) return false;
  const label = emoteLabel(code);
  const lw = labelWidth(ctx, label);
  // surge com "pop", flutua e some
  const pop = t < 0.25 ? ease(t / 0.25) * 1.15 : t < 0.4 ? 1.15 - ((t - 0.25) / 0.15) * 0.15 : 1;
  const alpha = t > EMOTE_DURATION - 0.4 ? (EMOTE_DURATION - t) / 0.4 : 1;
  const W = 44 + lw + 12;
  const Hh = 40;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y - t * 6 * scale);
  ctx.scale(scale * pop, scale * pop);
  // corpo + ponta num único caminho (contorno contínuo)
  const L = -W / 2;
  const R = W / 2;
  const T = -Hh - 9;
  const Bm = -9;
  const r = 18;
  ctx.beginPath();
  ctx.moveTo(L + r, T);
  ctx.lineTo(R - r, T);
  ctx.arcTo(R, T, R, T + r, r);
  ctx.arcTo(R, Bm, R - r, Bm, r);
  ctx.lineTo(8, Bm);
  ctx.lineTo(0, 1);
  ctx.lineTo(-8, Bm);
  ctx.lineTo(L + r, Bm);
  ctx.arcTo(L, Bm, L, Bm - r, r);
  ctx.arcTo(L, T, L + r, T, r);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // ícone
  ctx.save();
  ctx.translate(-W / 2 + 24, -Hh / 2 - 9);
  ctx.scale(0.85, 0.85);
  drawEmoteIcon(ctx, code, t);
  ctx.restore();
  // texto
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(label, -W / 2 + 44, -Hh / 2 - 8);
  ctx.restore();
  return true;
}

/* ---------------- roda de emotes ---------------- */

let wheel: HTMLDivElement | null = null;

/** Abre a roda (overlay). Tocar fora fecha sem escolher. */
export function openEmoteWheel(onPick: (code: EmoteCode) => void): void {
  closeEmoteWheel();
  const d = Math.min(2, window.devicePixelRatio || 1);
  const el = document.createElement('div');
  el.className = 'sc-wheel';
  el.innerHTML = `<div class="sc-wheel-ring" role="menu" aria-label="${tr('emote.wheel', 'Atalhos rápidos')}"></div>`;
  const ring = el.firstElementChild as HTMLDivElement;
  EMOTE_CODES.forEach((code, i) => {
    const a = -Math.PI / 2 + (i * TAU) / EMOTE_CODES.length;
    const b = document.createElement('button');
    b.className = 'sc-wheel-btn';
    b.setAttribute('role', 'menuitem');
    b.style.setProperty('--dx', `${Math.cos(a) * 108}px`);
    b.style.setProperty('--dy', `${Math.sin(a) * 108}px`);
    b.style.setProperty('--i', String(i));
    const c = document.createElement('canvas');
    c.width = c.height = 44 * d;
    c.style.width = c.style.height = '44px';
    const x = c.getContext('2d')!;
    x.scale(d, d);
    x.translate(22, 22);
    drawEmoteIcon(x, code, 0.1);
    b.appendChild(c);
    const s = document.createElement('span');
    s.textContent = emoteLabel(code);
    b.appendChild(s);
    b.onclick = (e) => {
      e.stopPropagation();
      tap('light');
      closeEmoteWheel();
      onPick(code);
    };
    ring.appendChild(b);
  });
  el.onclick = () => closeEmoteWheel();
  ensureSocialCss();
  document.body.appendChild(el);
  wheel = el;
  requestAnimationFrame(() => el.classList.add('on'));
}

export function closeEmoteWheel(): void {
  wheel?.remove();
  wheel = null;
}

/* CSS do social é injetado sob demanda (a roda funciona sozinha, sem o painel). */
let cssDone = false;
export function ensureSocialCss(): void {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'sc-css';
  st.textContent = socialCss;
  document.head.appendChild(st);
}
