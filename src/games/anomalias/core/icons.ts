/* ANOMALIAS — ícones SVG do jogo (traço grosso, legíveis para criança, sem texto). */
import type { ItemDef } from '../maps/types';

const INK = '#1d0b3a';
const svg = (body: string, vb = 64) => `<svg viewBox="0 0 ${vb} ${vb}" width="100%" height="100%" aria-hidden="true">${body}</svg>`;

export const IC = {
  camera: () =>
    svg(
      `<rect x="6" y="18" width="52" height="36" rx="9" fill="#ffd34a" stroke="${INK}" stroke-width="4"/><rect x="20" y="10" width="20" height="12" rx="4" fill="#ffd34a" stroke="${INK}" stroke-width="4"/><circle cx="32" cy="36" r="12" fill="#5ad1ff" stroke="${INK}" stroke-width="4"/><circle cx="28" cy="32" r="4" fill="#fff"/><circle cx="49" cy="26" r="3" fill="#ff4f6a"/>`,
    ),
  shutter: () => svg(`<circle cx="32" cy="32" r="26" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="32" cy="32" r="17" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/>`),
  down: () => svg(`<path d="M16 24 L32 42 L48 24" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  monitor: () =>
    svg(
      `<rect x="6" y="10" width="52" height="36" rx="6" fill="#3a4a66" stroke="${INK}" stroke-width="4"/><rect x="12" y="16" width="40" height="24" rx="3" fill="#7dffb0"/><path d="M14 30 L22 30 L26 22 L31 36 L35 28 L50 28" fill="none" stroke="#11663a" stroke-width="3"/><rect x="26" y="46" width="12" height="6" fill="${INK}"/><rect x="18" y="52" width="28" height="5" rx="2" fill="${INK}"/>`,
    ),
  book: () =>
    svg(
      `<rect x="10" y="8" width="44" height="50" rx="5" fill="#ff8fb0" stroke="${INK}" stroke-width="4"/><rect x="18" y="16" width="30" height="20" rx="2" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="26" cy="24" r="3" fill="#ffd34a"/><path d="M19 34 L28 27 L34 31 L40 25 L47 34" fill="#7dc2ff"/><path d="M10 50 L54 50" stroke="${INK}" stroke-width="3"/>`,
    ),
  hand: () =>
    svg(
      `<path d="M22 54 C14 46 10 38 12 34 C14 30 18 32 20 36 L22 40 L22 14 C22 9 29 9 29 14 L29 30 L30 10 C30 5 37 5 37 10 L37 30 L38 13 C38 8 45 8 45 13 L45 32 L46 20 C46 16 52 16 52 21 L52 40 C52 50 46 56 38 56 Z" fill="#ffe3c9" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
    ),
  moon: () => svg(`<path d="M40 8 A24 24 0 1 0 56 40 A18 18 0 1 1 40 8 Z" fill="#ffe680" stroke="${INK}" stroke-width="4"/>`),
  sun: () =>
    svg(
      `<g stroke="${INK}" stroke-width="4" stroke-linecap="round"><path d="M32 4 V12 M32 52 V60 M4 32 H12 M52 32 H60 M12 12 L18 18 M46 46 L52 52 M12 52 L18 46 M46 18 L52 12"/></g><circle cx="32" cy="32" r="14" fill="#ffd34a" stroke="${INK}" stroke-width="4"/>`,
    ),
  eye: () =>
    svg(
      `<path d="M4 32 C16 12 48 12 60 32 C48 52 16 52 4 32 Z" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="32" cy="32" r="11" fill="#5ad1ff" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="32" r="5" fill="${INK}"/><circle cx="29" cy="29" r="2.5" fill="#fff"/>`,
    ),
  check: () => svg(`<circle cx="32" cy="32" r="27" fill="#3ee07a" stroke="${INK}" stroke-width="4"/><path d="M19 33 L28 42 L46 22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
  cross: () => svg(`<circle cx="32" cy="32" r="27" fill="#ff4f6a" stroke="${INK}" stroke-width="4"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`),
  close: () => svg(`<path d="M18 18 L46 46 M46 18 L18 46" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`),
  left: () => svg(`<path d="M40 14 L22 32 L40 50" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  right: () => svg(`<path d="M24 14 L42 32 L24 50" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  play: () => svg(`<path d="M20 12 L52 32 L20 52 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`),
  star: (on = true) =>
    svg(
      `<path d="M32 5 L40 23 L59 24 L44 37 L49 57 L32 46 L15 57 L20 37 L5 24 L24 23 Z" fill="${on ? '#ffd34a' : '#4a3a6a'}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
    ),
  lock: () =>
    svg(`<rect x="12" y="28" width="40" height="30" rx="6" fill="#c8b9f5" stroke="${INK}" stroke-width="4"/><path d="M20 28 V20 A12 12 0 0 1 44 20 V28" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="32" cy="42" r="4" fill="${INK}"/>`),
  speaker: (on = true) =>
    svg(
      `<path d="M8 24 H18 L32 12 V52 L18 40 H8 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        (on ? `<path d="M40 22 C46 28 46 36 40 42 M46 16 C56 26 56 38 46 48" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` : `<path d="M40 24 L54 40 M54 24 L40 40" stroke="#ff4f6a" stroke-width="5" stroke-linecap="round"/>`),
    ),
  task: () =>
    svg(
      `<rect x="12" y="8" width="40" height="50" rx="5" fill="#fff" stroke="${INK}" stroke-width="4"/><rect x="22" y="4" width="20" height="10" rx="3" fill="#7dc2ff" stroke="${INK}" stroke-width="3"/><path d="M20 26 L24 30 L30 22 M20 42 L24 46 L30 38" fill="none" stroke="#3ee07a" stroke-width="4" stroke-linecap="round"/><path d="M34 27 H44 M34 43 H44" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    ),
  /** carinha do Bocudo (medidor de perigo) */
  bocudo: () =>
    svg(
      `<circle cx="32" cy="34" r="26" fill="#4b2a7a" stroke="${INK}" stroke-width="4"/><path d="M14 12 L20 24 L24 14 Z M50 12 L44 24 L40 14 Z" fill="#2e1650"/><circle cx="23" cy="26" r="5" fill="#ffe14a"/><circle cx="41" cy="26" r="5" fill="#ffe14a"/><rect x="22" y="23" width="2" height="6" fill="${INK}"/><rect x="40" y="23" width="2" height="6" fill="${INK}"/><ellipse cx="32" cy="44" rx="15" ry="10" fill="#33061a"/><ellipse cx="32" cy="49" rx="8" ry="4" fill="#ff6f91"/><path d="M24 35 L27 43 L29 35 Z M40 35 L37 43 L35 35 Z" fill="#fff"/>`,
    ),
  footsteps: () =>
    svg(`<ellipse cx="22" cy="40" rx="8" ry="12" fill="#fff" stroke="${INK}" stroke-width="3"/><ellipse cx="42" cy="22" rx="8" ry="12" fill="#fff" stroke="${INK}" stroke-width="3"/>`),
};

/** desenho de um item (remédio, mamadeira...) — forma + cor */
export function itemSvg(it: ItemDef | undefined): string {
  if (!it) return svg(`<circle cx="32" cy="32" r="20" fill="#888" stroke="${INK}" stroke-width="4"/>`);
  const c = it.color;
  const st = `fill="${c}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
  let s = '';
  switch (it.shape) {
    case 'circle':
      s = `<circle cx="32" cy="32" r="22" ${st}/>`;
      break;
    case 'square':
      s = `<rect x="11" y="11" width="42" height="42" rx="7" ${st}/>`;
      break;
    case 'triangle':
      s = `<path d="M32 7 L58 54 L6 54 Z" ${st}/>`;
      break;
    case 'star':
      s = `<path d="M32 5 L40 23 L59 24 L44 37 L49 57 L32 46 L15 57 L20 37 L5 24 L24 23 Z" ${st}/>`;
      break;
    case 'heart':
      s = `<path d="M32 56 C10 40 4 28 10 18 C16 9 28 10 32 20 C36 10 48 9 54 18 C60 28 54 40 32 56 Z" ${st}/>`;
      break;
    case 'drop':
      s = `<path d="M32 5 C40 20 52 30 52 42 A20 20 0 0 1 12 42 C12 30 24 20 32 5 Z" ${st}/>`;
      break;
    case 'moon':
      s = `<path d="M40 6 A26 26 0 1 0 58 42 A19 19 0 1 1 40 6 Z" ${st}/>`;
      break;
  }
  return svg(s + `<ellipse cx="24" cy="22" rx="6" ry="4" fill="#fff" opacity=".55"/>`);
}

/** desenha um item num canvas 2D (balões 3D de pedido) */
export function drawItem(x: CanvasRenderingContext2D, it: ItemDef | undefined, cx: number, cy: number, r: number): void {
  x.save();
  x.translate(cx, cy);
  x.scale(r / 26, r / 26);
  x.translate(-32, -32);
  x.lineWidth = 4;
  x.lineJoin = 'round';
  x.strokeStyle = INK;
  x.fillStyle = it?.color ?? '#888';
  const p = new Path2D(
    !it || it.shape === 'circle'
      ? 'M54 32 A22 22 0 1 1 10 32 A22 22 0 1 1 54 32 Z'
      : it.shape === 'square'
        ? 'M11 11 H53 V53 H11 Z'
        : it.shape === 'triangle'
          ? 'M32 7 L58 54 L6 54 Z'
          : it.shape === 'star'
            ? 'M32 5 L40 23 L59 24 L44 37 L49 57 L32 46 L15 57 L20 37 L5 24 L24 23 Z'
            : it.shape === 'heart'
              ? 'M32 56 C10 40 4 28 10 18 C16 9 28 10 32 20 C36 10 48 9 54 18 C60 28 54 40 32 56 Z'
              : it.shape === 'drop'
                ? 'M32 5 C40 20 52 30 52 42 A20 20 0 0 1 12 42 C12 30 24 20 32 5 Z'
                : 'M40 6 A26 26 0 1 0 58 42 A19 19 0 1 1 40 6 Z',
  );
  x.fill(p);
  x.stroke(p);
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.ellipse(24, 22, 6, 4, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
}
