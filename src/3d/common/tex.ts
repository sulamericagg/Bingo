/* ============================================================
 *  Ajudantes de canvas compartilhados pelos modos 3D (casa, cozinha).
 *  Sem three.js: só canvas 2D e cores.
 * ============================================================ */
export const INK = '#2a0b5c';

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
/** clareia (t>0) ou escurece (t<0) uma cor #rrggbb */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (t > 0) {
    r += (255 - r) * t;
    g += (255 - g) * t;
    b += (255 - b) * t;
  } else {
    r *= 1 + t;
    g *= 1 + t;
    b *= 1 + t;
  }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
