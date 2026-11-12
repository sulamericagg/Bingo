/* ============================================================
 *  BLOOP PINK — a MARCA do jogo, num lugar só.
 *  Marca ORIGINAL (não imita marca, logo, pessoa ou embalagem reais).
 *  Para renomear: troque BRAND_NAME/BRAND_SHORT e, se quiser, o desenho de drawBrandLogo().
 * ============================================================ */
import { gameFont } from '../../i18n/font';

export const BRAND_NAME = 'Bloop Pink';
/** monograma do selo (uma letra) */
export const BRAND_SHORT = 'B';
/** "domínio" fictício do site da franquia */
export const BRAND_SITE = 'bloop.pink/franquia';

/** paleta da marca */
export const PINK = {
  rose: '#ff5fa2',
  deep: '#d63384',
  wine: '#7a1f4f',
  blush: '#ffd3e6',
  cream: '#fff4f8',
  gold: '#e8b86a',
  ink: '#3a0d2a',
};

export interface LogoOpts {
  /** só o selo (sem o nome) */
  badgeOnly?: boolean;
  /** texto claro (para fundo escuro) */
  light?: boolean;
  /** brilho/neon (placa acesa) */
  glow?: number;
  /** cor de destaque do selo */
  color?: string;
}

const TAU = Math.PI * 2;

/** selo: gota-bolha arredondada com um "B" e um coraçãozinho brilhando */
function badge(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, light: boolean): void {
  x.save();
  x.translate(cx, cy);
  // bolha (gota de cabeça para baixo, bem redonda)
  const g = x.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#ff8cc0');
  g.addColorStop(0.55, col);
  g.addColorStop(1, PINK.deep);
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(0, -r * 1.08);
  x.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.05, -r * 0.35, r * 1.0, r * 0.12);
  x.bezierCurveTo(r * 0.95, r * 0.75, r * 0.45, r * 1.02, 0, r * 1.02);
  x.bezierCurveTo(-r * 0.45, r * 1.02, -r * 0.95, r * 0.75, -r * 1.0, r * 0.12);
  x.bezierCurveTo(-r * 1.05, -r * 0.35, -r * 0.7, -r * 1.0, 0, -r * 1.08);
  x.closePath();
  x.fill();
  x.lineWidth = Math.max(1, r * 0.08);
  x.strokeStyle = light ? 'rgba(255,255,255,.85)' : PINK.wine;
  x.stroke();
  // brilho
  x.fillStyle = 'rgba(255,255,255,.45)';
  x.beginPath();
  x.ellipse(-r * 0.42, -r * 0.5, r * 0.22, r * 0.12, -0.7, 0, TAU);
  x.fill();
  // monograma
  x.fillStyle = '#fff';
  x.font = gameFont(700, Math.round(r * 1.25));
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(BRAND_SHORT, -r * 0.04, r * 0.1);
  // coraçãozinho
  const hx = r * 0.62;
  const hy = -r * 0.62;
  const hs = r * 0.26;
  x.fillStyle = PINK.gold;
  x.beginPath();
  x.moveTo(hx, hy + hs * 0.9);
  x.bezierCurveTo(hx - hs * 1.3, hy, hx - hs * 0.6, hy - hs * 0.9, hx, hy - hs * 0.25);
  x.bezierCurveTo(hx + hs * 0.6, hy - hs * 0.9, hx + hs * 1.3, hy, hx, hy + hs * 0.9);
  x.fill();
  x.restore();
}

/**
 * Desenha o logo com o centro em (cx, cy) e altura h. Devolve a largura usada.
 * Selo à esquerda + nome em duas pesagens ("Bloop" fino, "Pink" forte).
 */
/** Mercadinho usa a mesma família de marca, em verde */
let MODE: 'beauty' | 'grocery' = 'beauty';
export function setBrandMode(m: 'beauty' | 'grocery'): void {
  MODE = m;
}
export const brandName = () => (MODE === 'grocery' ? 'Bloop Mercadinho' : BRAND_NAME);
export function drawBrandLogo(x: CanvasRenderingContext2D, cx: number, cy: number, h: number, o: LogoOpts = {}): number {
  const gro = MODE === 'grocery';
  const col = o.color ?? (gro ? '#4cb050' : PINK.rose);
  const light = !!o.light;
  const r = h * 0.42;
  if (o.badgeOnly) {
    if (o.glow) {
      x.save();
      x.shadowColor = col;
      x.shadowBlur = h * 0.4 * o.glow;
      badge(x, cx, cy, r, col, light);
      x.restore();
    }
    badge(x, cx, cy, r, col, light);
    return r * 2;
  }
  const name = brandName();
  const parts = name.split(' ');
  const a = parts[0] ?? name;
  const b = parts.slice(1).join(' ');
  const fa = gameFont(500, Math.round(h * 0.56));
  const fb = gameFont(700, Math.round(h * 0.62));
  x.font = fa;
  const wa = x.measureText(a + (b ? ' ' : '')).width;
  x.font = fb;
  const wb = b ? x.measureText(b).width : 0;
  const total = r * 2 + h * 0.18 + wa + wb;
  const left = cx - total / 2;
  x.save();
  if (o.glow) {
    x.shadowColor = col;
    x.shadowBlur = h * 0.35 * o.glow;
  }
  badge(x, left + r, cy, r, col, light);
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  const tx = left + r * 2 + h * 0.18;
  x.font = fa;
  x.fillStyle = light ? '#ffffff' : PINK.ink;
  x.fillText(a + (b ? ' ' : ''), tx, cy + h * 0.04);
  if (b) {
    x.font = fb;
    const g = x.createLinearGradient(0, cy - h * 0.3, 0, cy + h * 0.3);
    g.addColorStop(0, light ? (gro ? '#d8f8c8' : '#ffd3e6') : gro ? '#6ad06a' : '#ff74b0');
    g.addColorStop(1, light ? (gro ? '#8fd16a' : '#ff8cc0') : gro ? '#2f8a3a' : PINK.deep);
    x.fillStyle = g;
    x.fillText(b, tx + wa, cy + h * 0.04);
  }
  x.restore();
  return total;
}

/** canvas pronto do logo (placas, sacolas, caixas). Retângulo transparente com o logo centralizado. */
export function brandCanvas(w: number, h: number, o: LogoOpts & { bg?: string } = {}): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  if (o.bg) {
    x.fillStyle = o.bg;
    x.fillRect(0, 0, w, h);
  }
  const lh = Math.min(h * 0.7, w / 4.6);
  drawBrandLogo(x, w / 2, h / 2, lh, o);
  return c;
}
