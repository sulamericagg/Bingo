/* ============================================================
 *  COSMÉTICOS DO PASSE que não são peças do criador:
 *   - EMOTES ('em_sNN_k'): balãozinho animado sobre a cabeça.
 *       drawPassEmote(ctx, id, x, y, size, t) — o social/jogos podem chamar
 *       para qualquer emote cujo id comece com 'em_'.
 *   - MOLDURAS ('fr_sNN', 'fr_club') e FAIXAS ('bn_sNN') de perfil:
 *       frameCss(id) / bannerCss(id) → CSS pronto (background).
 *  Tudo derivado do id (semente) + paleta da temporada. Zero alocação por quadro.
 * ============================================================ */
import { SEASONS } from '../creatures/seasons';
import { findReward, idSeed } from './catalog';

export type EmoteSymbol = 'star' | 'heart' | 'note' | 'sparkle' | 'flower' | 'moon' | 'drop' | 'smile';
export type EmoteMotion = 'bounce' | 'spin' | 'wave' | 'pulse' | 'rise';

export interface EmoteDef {
  id: string;
  name: string;
  symbol: EmoteSymbol;
  motion: EmoteMotion;
  colors: [string, string];
}

const SYMS: EmoteSymbol[] = ['star', 'heart', 'note', 'sparkle', 'flower', 'moon', 'drop', 'smile'];
const MOTIONS: EmoteMotion[] = ['bounce', 'spin', 'wave', 'pulse', 'rise'];

const seasonOf = (id: string): number => {
  const m = /s(\d\d)/.exec(id);
  return m ? Number(m[1]) : 0;
};
const pal = (id: string) => (SEASONS[seasonOf(id)] ?? SEASONS[0]).palette;

const emCache = new Map<string, EmoteDef>();
export function passEmote(id: string): EmoteDef {
  let e = emCache.get(id);
  if (!e) {
    const h = idSeed(id);
    const [, a, b] = pal(id);
    e = { id, name: findReward(id)?.name ?? id, symbol: SYMS[h % SYMS.length], motion: MOTIONS[(h >>> 4) % MOTIONS.length], colors: h & 1 ? [a, b] : [b, a] };
    emCache.set(id, e);
  }
  return e;
}

function symbolPath(x: CanvasRenderingContext2D, s: EmoteSymbol, r: number): void {
  x.beginPath();
  switch (s) {
    case 'star':
    case 'sparkle': {
      const k = s === 'star' ? 5 : 4;
      const inner = s === 'star' ? 0.48 : 0.3;
      for (let i = 0; i < k * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / k;
        const rr = i % 2 ? r * inner : r;
        if (i) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.closePath();
      break;
    }
    case 'heart':
      x.moveTo(0, r * 0.85);
      x.bezierCurveTo(-r * 1.3, -r * 0.05, -r * 0.55, -r * 1.05, 0, -r * 0.4);
      x.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.3, -r * 0.05, 0, r * 0.85);
      break;
    case 'note':
      x.ellipse(-r * 0.25, r * 0.5, r * 0.38, r * 0.28, -0.4, 0, Math.PI * 2);
      x.rect(r * 0.05, -r * 0.85, r * 0.16, r * 1.35);
      x.rect(r * 0.05, -r * 0.85, r * 0.55, r * 0.22);
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        x.moveTo(Math.cos(a) * r * 0.5 + r * 0.42, Math.sin(a) * r * 0.5);
        x.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.42, 0, Math.PI * 2);
      }
      break;
    case 'moon':
      x.arc(0, 0, r, Math.PI * 0.3, Math.PI * 1.7);
      x.arc(r * 0.45, 0, r * 0.75, Math.PI * 1.55, Math.PI * 0.45, true);
      x.closePath();
      break;
    case 'drop':
      x.moveTo(0, -r);
      x.quadraticCurveTo(r * 0.95, r * 0.15, 0, r * 0.9);
      x.quadraticCurveTo(-r * 0.95, r * 0.15, 0, -r);
      break;
    default:
      x.arc(0, 0, r, 0, Math.PI * 2);
  }
}

/**
 * Desenha o emote centrado em (cx, cy) (base do balão), tamanho ~size px.
 * Use acima da cabeça do personagem. Sem alocações (só caminhos/cores).
 */
export function drawPassEmote(x: CanvasRenderingContext2D, id: string, cx: number, cy: number, size: number, t: number): void {
  const e = passEmote(id);
  const r = size * 0.5;
  x.save();
  x.translate(cx, cy - r);
  // balão
  x.fillStyle = 'rgba(255,255,255,.95)';
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = Math.max(1.5, size * 0.06);
  x.beginPath();
  x.arc(0, 0, r, 0, Math.PI * 2);
  x.moveTo(-r * 0.2, r * 0.92);
  x.lineTo(0, r * 1.25);
  x.lineTo(r * 0.2, r * 0.92);
  x.fill();
  x.stroke();
  // movimento
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let oy = 0;
  let ox = 0;
  switch (e.motion) {
    case 'bounce':
      oy = -Math.abs(Math.sin(t * 6)) * r * 0.2;
      sy = 1 - Math.max(0, Math.cos(t * 12)) * 0.08;
      break;
    case 'spin':
      sx = Math.cos(t * 4);
      break;
    case 'wave':
      rot = Math.sin(t * 5) * 0.4;
      break;
    case 'pulse':
      sx = sy = 1 + Math.sin(t * 7) * 0.12;
      break;
    case 'rise':
      oy = r * 0.2 - ((t * 0.8) % 1) * r * 0.4;
      ox = Math.sin(t * 3) * r * 0.12;
      break;
  }
  x.translate(ox, oy);
  x.rotate(rot);
  x.scale(sx, sy);
  symbolPath(x, e.symbol, r * 0.58);
  x.fillStyle = e.colors[0];
  x.fill();
  x.lineWidth = Math.max(1, size * 0.045);
  x.stroke();
  x.fillStyle = e.colors[1];
  x.beginPath();
  x.arc(-r * 0.18, -r * 0.18, r * 0.12, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

/* ---------------- molduras e faixas ---------------- */

/** CSS de fundo para um anel de moldura (use num elemento com padding e border-radius 50%). */
export function frameCss(id: string): string {
  if (id === 'fr_club') return 'conic-gradient(from 0deg, #ffd84a, #ff5cc8, #8a5cff, #5ef0ff, #ffd84a)';
  const [, a, b] = pal(id);
  const h = idSeed(id);
  const turn = h % 360;
  return `conic-gradient(from ${turn}deg, ${a}, ${b}, #ffffff, ${a}, ${b}, ${a})`;
}

/** CSS da faixa de perfil (retângulo largo). */
export function bannerCss(id: string): string {
  const [bg, a, b] = pal(id);
  const h = idSeed(id);
  const ang = 100 + (h % 60);
  return `radial-gradient(circle at 18% 30%, ${a}88 0 12%, transparent 13%), radial-gradient(circle at 82% 70%, ${b}77 0 10%, transparent 11%), repeating-linear-gradient(${ang}deg, ${a}22 0 10px, transparent 10px 22px), linear-gradient(${ang}deg, ${bg}, ${a}, ${b})`;
}
