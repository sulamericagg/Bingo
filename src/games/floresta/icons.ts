/* Ícones SVG do "Lenhadores do Bosque" — mesmo estilo de src/ui/icons.ts
 * (contorno de tinta + gradientes bo-*), com dois gradientes próprios (fl-wood, fl-leaf). */
import { ensureIconDefs } from '../../ui/icons';

const INK = '#2a0b5c';
type G = 'gold' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'rock' | 'silver' | 'violet' | 'pink' | 'wood' | 'leaf';
const url = (g: G) => (g === 'wood' || g === 'leaf' ? `fl-${g}` : `bo-${g}`);
const sil = (shapes: string, g: G, w = 3): string =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="url(#${url(g)})">${shapes}</g>`;
const hl = (shapes: string, o = 0.5): string => `<g fill="#fff" opacity="${o}">${shapes}</g>`;
const ink = (shapes: string): string => `<g fill="${INK}">${shapes}</g>`;
const stroke = (d: string, color: string, w = 4): string =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export type FlIcon =
  | 'tree' | 'axe' | 'saw' | 'laser' | 'barrow' | 'truck' | 'loader' | 'train' | 'mill' | 'planer' | 'belt' | 'nursery'
  | 'bot' | 'drone' | 'planter' | 'plank' | 'log' | 'acorn' | 'leaf' | 'hammer' | 'seed' | 'shop' | 'sell' | 'emote'
  | 'heart' | 'star' | 'smile' | 'thumb' | 'wave' | 'close' | 'cam' | 'map' | 'lock' | 'cube' | 'square'
  | 'grab' | 'drop' | 'throw' | 'kick' | 'wheel';

const ICONS: Record<FlIcon, string> = {
  tree:
    sil('<rect x="20" y="28" width="8" height="16" rx="2"/>', 'wood') +
    sil('<circle cx="24" cy="18" r="13"/><circle cx="14" cy="25" r="8"/><circle cx="34" cy="25" r="8"/>', 'leaf') +
    hl('<circle cx="19" cy="13" r="4"/>', 0.55),
  axe:
    sil('<path d="M26 8L31 6L36 40L31 42Z"/>', 'wood', 2.4) +
    sil('<path d="M28 10C20 6 10 8 6 14C10 18 14 24 14 28C20 22 26 20 31 19Z"/>', 'silver') +
    hl('<path d="M10 14C14 10 20 10 24 11L23 13C19 13 15 14 12 16Z"/>', 0.7),
  saw:
    sil('<rect x="4" y="18" width="18" height="16" rx="5"/>', 'orange') +
    sil('<path d="M20 22H40A5 5 0 0 1 40 32H20Z"/>', 'silver', 2.4) +
    ink('<path d="M24 22l2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3z"/><circle cx="12" cy="26" r="3"/>') +
    hl('<rect x="7" y="20" width="9" height="3" rx="1.5"/>', 0.6),
  laser:
    sil('<rect x="4" y="20" width="22" height="12" rx="4"/>', 'violet') +
    `<path d="M26 26H44" stroke="#5af0ff" stroke-width="5" stroke-linecap="round"/><path d="M26 26H44" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` +
    sil('<circle cx="40" cy="26" r="3"/>', 'cyan', 1.5) + hl('<rect x="7" y="22" width="12" height="3" rx="1.5"/>', 0.6),
  barrow:
    sil('<path d="M6 16H34L30 30H12Z"/>', 'green') + stroke('M30 26L44 34', '#a0785a', 3) + stroke('M12 30L8 40', '#a0785a', 3) +
    sil('<circle cx="22" cy="36" r="6"/>', 'rock', 2.4) + hl('<path d="M9 18H30L29 21H10Z"/>', 0.5),
  truck:
    sil('<rect x="4" y="16" width="24" height="16" rx="3"/>', 'orange') + sil('<path d="M28 20H38L44 27V32H28Z"/>', 'cyan') +
    sil('<circle cx="13" cy="35" r="5"/><circle cx="36" cy="35" r="5"/>', 'rock', 2.4) + hl('<rect x="7" y="18" width="16" height="3" rx="1.5"/>', 0.5),
  loader:
    sil('<rect x="14" y="20" width="22" height="14" rx="3"/>', 'gold') + sil('<path d="M4 18H14V30H6Z"/>', 'silver', 2.4) +
    sil('<rect x="22" y="10" width="10" height="10" rx="2"/>', 'cyan', 2.4) +
    sil('<circle cx="19" cy="37" r="5"/><circle cx="33" cy="37" r="5"/>', 'rock', 2.4),
  train:
    sil('<rect x="6" y="14" width="16" height="20" rx="3"/><rect x="22" y="22" width="20" height="12" rx="3"/>', 'red') +
    sil('<rect x="9" y="17" width="10" height="7" rx="2"/>', 'cyan', 1.8) + sil('<rect x="28" y="12" width="5" height="10"/>', 'rock', 1.8) +
    sil('<circle cx="13" cy="38" r="4"/><circle cx="26" cy="38" r="4"/><circle cx="37" cy="38" r="4"/>', 'rock', 2),
  mill:
    sil('<path d="M4 42V20L18 10L32 20V42Z"/>', 'wood') + sil('<circle cx="34" cy="30" r="10"/>', 'silver', 2.4) +
    ink('<path d="M34 20l2 4h-4zM44 30l-4 2v-4zM34 40l-2-4h4zM24 30l4-2v4z"/><circle cx="34" cy="30" r="3"/>') + ink('<rect x="10" y="28" width="8" height="14" rx="1"/>'),
  planer:
    sil('<rect x="6" y="22" width="36" height="12" rx="3"/>', 'cyan') + sil('<path d="M12 22V14H36V22Z"/>', 'violet', 2.4) +
    sil('<rect x="4" y="34" width="40" height="5" rx="2"/>', 'wood', 2) + hl('<rect x="9" y="24" width="20" height="3" rx="1.5"/>', 0.6),
  belt:
    sil('<rect x="4" y="24" width="40" height="10" rx="5"/>', 'rock') + ink('<circle cx="10" cy="29" r="3"/><circle cx="24" cy="29" r="3"/><circle cx="38" cy="29" r="3"/>') +
    sil('<rect x="10" y="14" width="12" height="8" rx="1.5"/><rect x="26" y="14" width="12" height="8" rx="1.5"/>', 'wood', 2),
  nursery:
    sil('<path d="M10 30H38L34 44H14Z"/>', 'orange') + sil('<path d="M24 30C24 22 20 16 12 14C12 22 16 28 24 30Z"/><path d="M24 30C24 20 30 12 38 10C38 20 32 28 24 30Z"/>', 'leaf', 2.4) +
    hl('<path d="M30 14C33 12 35 12 36 12L34 15Z"/>', 0.7),
  bot:
    sil('<rect x="10" y="12" width="28" height="22" rx="7"/>', 'silver') + sil('<rect x="14" y="34" width="6" height="8" rx="2"/><rect x="28" y="34" width="6" height="8" rx="2"/>', 'rock', 2) +
    ink('<rect x="15" y="18" width="18" height="9" rx="4"/>') + `<circle cx="20" cy="22.5" r="2.4" fill="#7affc4"/><circle cx="28" cy="22.5" r="2.4" fill="#7affc4"/>` +
    sil('<circle cx="24" cy="7" r="3"/>', 'gold', 1.8),
  drone:
    sil('<ellipse cx="24" cy="28" rx="10" ry="7"/>', 'cyan') + sil('<rect x="4" y="15" width="14" height="4" rx="2"/><rect x="30" y="15" width="14" height="4" rx="2"/>', 'silver', 1.8) +
    stroke('M11 19L18 26M37 19L30 26', '#9b92bf', 2.4) + ink('<circle cx="24" cy="28" r="3"/>') + hl('<ellipse cx="20" cy="25" rx="3" ry="1.6"/>', 0.7),
  planter:
    sil('<rect x="12" y="16" width="24" height="20" rx="7"/>', 'green') + sil('<rect x="15" y="36" width="6" height="7" rx="2"/><rect x="27" y="36" width="6" height="7" rx="2"/>', 'rock', 2) +
    ink('<rect x="17" y="21" width="14" height="7" rx="3.5"/>') + sil('<path d="M24 16C24 10 20 6 15 5C15 10 18 14 24 16Z"/><path d="M24 16C24 10 28 6 33 5C33 10 30 14 24 16Z"/>', 'leaf', 1.8),
  plank:
    sil('<rect x="4" y="12" width="40" height="8" rx="2"/><rect x="4" y="22" width="40" height="8" rx="2"/><rect x="4" y="32" width="40" height="8" rx="2"/>', 'wood', 2.2) +
    hl('<rect x="7" y="14" width="22" height="2" rx="1"/><rect x="7" y="24" width="22" height="2" rx="1"/><rect x="7" y="34" width="22" height="2" rx="1"/>', 0.5),
  log:
    sil('<rect x="6" y="16" width="30" height="18" rx="9"/>', 'wood') + sil('<ellipse cx="36" cy="25" rx="7" ry="9"/>', 'gold', 2.4) +
    `<ellipse cx="36" cy="25" rx="3.5" ry="5" fill="none" stroke="#b07a3a" stroke-width="1.6"/>` + hl('<rect x="10" y="19" width="18" height="3" rx="1.5"/>', 0.45),
  acorn:
    sil('<path d="M12 22C12 34 18 42 24 44C30 42 36 34 36 22Z"/>', 'gold') + sil('<path d="M8 22C8 14 16 10 24 10S40 14 40 22Z"/>', 'wood') +
    stroke('M24 10V4', '#7a4a20', 3) + hl('<path d="M16 26C16 32 19 37 22 39L20 39C17 37 15 32 15 26Z"/>', 0.6) +
    ink('<path d="M12 18h24v1.6H12z" opacity=".3"/>'),
  leaf:
    sil('<path d="M8 40C8 20 20 8 42 6C42 28 30 40 8 40Z"/>', 'leaf') + stroke('M8 40L30 18', '#1a7a3a', 2.4) + hl('<path d="M14 30C16 20 24 13 34 11L30 14C23 17 19 23 16 31Z"/>', 0.5),
  hammer:
    sil('<rect x="21" y="18" width="7" height="26" rx="3"/>', 'wood', 2.4) + sil('<path d="M8 8H36L40 14V20H8Z"/>', 'silver') + hl('<rect x="11" y="10" width="20" height="3" rx="1.5"/>', 0.6),
  seed:
    sil('<ellipse cx="24" cy="28" rx="12" ry="15"/>', 'gold') + sil('<path d="M24 14C24 8 28 4 34 3C34 9 30 13 24 14Z"/>', 'leaf', 2) +
    hl('<ellipse cx="19" cy="24" rx="3" ry="6"/>', 0.6) + `<path d="M36 34l2 2M40 28h3M10 34l-2 2M8 28H5" stroke="#ffd34a" stroke-width="2.4" stroke-linecap="round"/>`,
  shop:
    sil('<path d="M6 18L10 8H38L42 18Z"/>', 'red') + sil('<rect x="9" y="18" width="30" height="24" rx="2"/>', 'wood') +
    ink('<rect x="20" y="28" width="8" height="14" rx="1"/>') + hl('<path d="M12 10H22L20 16H10Z"/>', 0.5),
  sell:
    sil('<circle cx="24" cy="24" r="17"/>', 'gold') + ink('<path d="M22 13h4v3c3 .5 5 2.5 5 5h-4c0-1-1-2-3-2s-3 1-3 2 1 1.6 3 2c4 .8 7 2 7 6 0 2.6-2 4.6-5 5v3h-4v-3c-3-.5-5-2.6-5-5.4h4c0 1.2 1.2 2.4 3.2 2.4s3-1 3-2-1-1.6-3-2c-4-.8-7-2-7-6 0-2.4 2-4.4 5-5z"/>') +
    hl('<path d="M14 16C16 12 20 10 23 10L22 12C19 13 17 15 16 18Z"/>', 0.6),
  emote:
    sil('<path d="M6 10H42V32H22L12 40V32H6Z"/>', 'white') + ink('<circle cx="16" cy="21" r="2.6"/><circle cx="24" cy="21" r="2.6"/><circle cx="32" cy="21" r="2.6"/>'),
  heart: sil('<path d="M24 42C10 32 4 25 4 17C4 10 10 6 15 6C19 6 22 8 24 12C26 8 29 6 33 6C38 6 44 10 44 17C44 25 38 32 24 42Z"/>', 'red') + hl('<ellipse cx="14" cy="15" rx="4" ry="3"/>', 0.6),
  star: sil('<path d="M24 4L30 17L44 18L33 27L37 42L24 34L11 42L15 27L4 18L18 17Z"/>', 'gold') + hl('<path d="M24 10L27 18L22 18Z"/>', 0.6),
  smile: sil('<circle cx="24" cy="24" r="18"/>', 'gold') + ink('<circle cx="18" cy="20" r="2.6"/><circle cx="30" cy="20" r="2.6"/><path d="M15 27C17 33 31 33 33 27C29 30 19 30 15 27Z"/>'),
  thumb:
    sil('<path d="M16 22L22 6C26 6 28 9 27 14L26 19H38C41 19 43 22 42 25L39 38C38 41 36 42 33 42H16Z"/>', 'gold') + sil('<rect x="5" y="21" width="9" height="21" rx="2"/>', 'orange', 2.4),
  wave:
    sil('<path d="M14 40C8 34 6 26 10 22L14 26V12C14 9 18 9 18 12V22V8C18 5 22 5 22 8V22V7C22 4 26 4 26 7V22V10C26 7 30 7 30 10V28L34 22C36 19 40 21 38 25L32 36C29 41 22 44 14 40Z"/>', 'gold', 2.4),
  close: stroke('M12 12L36 36M36 12L12 36', '#fff', 6),
  cam: sil('<rect x="4" y="14" width="40" height="26" rx="5"/>', 'silver') + sil('<circle cx="24" cy="27" r="9"/>', 'cyan', 2.4) + sil('<rect x="14" y="8" width="12" height="6" rx="2"/>', 'rock', 2),
  map: sil('<path d="M4 10L16 6L32 12L44 8V38L32 42L16 36L4 40Z"/>', 'green') + stroke('M16 6V36M32 12V42', '#17994a', 2),
  lock: sil('<rect x="10" y="20" width="28" height="22" rx="4"/>', 'gold') + `<path d="M16 20V14a8 8 0 0 1 16 0v6" fill="none" stroke="${INK}" stroke-width="5"/>` + ink('<circle cx="24" cy="30" r="3"/>'),
  cube:
    sil('<path d="M24 4L42 14V34L24 44L6 34V14Z"/>', 'cyan') + `<path d="M6 14L24 24L42 14M24 24V44" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
    hl('<path d="M24 8L36 14L24 20L12 14Z"/>', 0.5),
  grab:
    sil('<path d="M12 22C12 18 14 16 17 16S21 18 21 18V14C21 11 23 10 25 10S29 11 29 14V18C29 16 31 15 33 15S37 16 37 19V28C37 36 31 42 24 42S12 37 12 30Z"/>', 'gold', 2.4) +
    sil('<rect x="6" y="4" width="26" height="9" rx="4.5"/>', 'wood', 2),
  drop: sil('<rect x="10" y="30" width="28" height="10" rx="5"/>', 'wood', 2.4) + stroke('M24 4V22M16 15L24 23L32 15', '#ffd34a', 4),
  throw:
    sil('<rect x="22" y="6" width="22" height="9" rx="4.5"/>', 'wood', 2) + stroke('M6 40C10 28 18 20 30 18', '#ffd34a', 4) +
    stroke('M10 30L6 40L16 38', '#ffd34a', 3),
  kick:
    sil('<path d="M8 6H18L20 26L32 30C36 31 38 34 37 38H10Z"/>', 'red', 2.4) + sil('<rect x="34" y="20" width="12" height="8" rx="4"/>', 'wood', 2),
  wheel:
    sil('<circle cx="24" cy="24" r="18"/>', 'rock', 2.4) + sil('<circle cx="24" cy="24" r="11"/>', 'silver', 2) +
    sil('<circle cx="24" cy="24" r="4"/>', 'red', 2) + stroke('M13 24H35M24 24V35', '#5a5a6a', 3),
  square: sil('<rect x="6" y="6" width="36" height="36" rx="6"/>', 'green') + hl('<rect x="10" y="10" width="14" height="4" rx="2"/>', 0.6),
};

let defsDone = false;
function ensureDefs(): void {
  ensureIconDefs();
  if (defsDone || typeof document === 'undefined' || document.getElementById('fl-icon-defs')) return;
  defsDone = true;
  const d = document.createElement('div');
  d.innerHTML =
    '<svg id="fl-icon-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>' +
    '<linearGradient id="fl-wood" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffd8a0"/><stop offset=".5" stop-color="#c98a4a"/><stop offset="1" stop-color="#8a5228"/></linearGradient>' +
    '<linearGradient id="fl-leaf" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#d4ffb0"/><stop offset=".5" stop-color="#5cd04a"/><stop offset="1" stop-color="#22883a"/></linearGradient>' +
    '</defs></svg>';
  (document.body ?? document.documentElement).prepend(d.firstChild!);
}

/** Tira as definições SVG da página ao sair do jogo (antes ficavam no <body> para sempre). */
export function removeFlIconDefs(): void {
  document.getElementById('fl-icon-defs')?.remove();
  defsDone = false;
}

export function flIcon(name: FlIcon, size = 32): string {
  ensureDefs();
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
