/* Ícones SVG do "Pouso Forçado" — mesmo estilo de src/ui/icons.ts (tinta + gradientes bo-*). */
import { ensureIconDefs } from '../../ui/icons';
import { HAT_COLS } from './data';

const INK = '#2a0b5c';
type G = 'gold' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'rock' | 'silver' | 'violet' | 'pink';
const sil = (shapes: string, g: G, w = 3): string =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="url(#bo-${g})">${shapes}</g>`;
const hl = (shapes: string, o = 0.5): string => `<g fill="#fff" opacity="${o}">${shapes}</g>`;
const ink = (shapes: string): string => `<g fill="${INK}">${shapes}</g>`;
const stroke = (d: string, color: string, w = 4): string =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export type VIcon =
  | 'fire' | 'leak' | 'fuel' | 'spark' | 'pressure' | 'door' | 'turb' | 'panic' | 'bird' | 'gear' | 'check' | 'info' | 'warn' | 'yoke'
  | 'down' | 'runway' | 'ext' | 'tape' | 'water' | 'snack' | 'bag' | 'close' | 'hand' | 'throw' | 'drop' | 'cube' | 'square' | 'star'
  | 'starOff' | 'crew' | 'follow' | 'stay' | 'calm' | 'cam' | 'flaps' | 'plane' | 'up' | 'clock' | 'calendar' | 'school' | 'trophy' | 'coin';

const ICONS: Record<VIcon, string> = {
  fire:
    sil('<path d="M24 4C28 12 38 16 38 28C38 37 31 44 24 44C17 44 10 37 10 28C10 20 16 18 17 10C20 14 21 18 22 20C24 14 24 9 24 4Z"/>', 'orange') +
    sil('<path d="M24 22C27 27 31 29 31 34C31 38 28 41 24 41C20 41 17 38 17 34C17 30 21 28 24 22Z"/>', 'gold', 1.5),
  leak:
    sil('<rect x="8" y="10" width="26" height="22" rx="5"/>', 'silver') + sil('<path d="M34 26C34 26 42 34 42 38C42 41 40 43 37 43C34 43 32 41 32 38C32 34 34 26 34 26Z"/>', 'violet', 2) + hl('<rect x="12" y="13" width="12" height="4" rx="2"/>'),
  fuel:
    sil('<rect x="8" y="8" width="24" height="34" rx="5"/>', 'red') + sil('<rect x="12" y="13" width="16" height="10" rx="2"/>', 'white', 1.5) + stroke('M32 16L40 22V36C40 39 37 39 37 36V28', '#c9c9d9', 3),
  spark: sil('<path d="M27 3L9 27H22L18 45L39 18H26Z"/>', 'gold') + hl('<path d="M25 8L14 24H20Z"/>', 0.6),
  pressure:
    sil('<circle cx="24" cy="26" r="17"/>', 'white') + ink('<circle cx="24" cy="26" r="3"/>') + stroke('M24 26L33 17', '#ff4d6a', 3) + stroke('M14 33A12 12 0 0 1 14 19', '#3fe06c', 3) + sil('<rect x="20" y="3" width="8" height="6" rx="2"/>', 'silver', 1.5),
  door: sil('<rect x="11" y="4" width="26" height="40" rx="6"/>', 'silver') + sil('<circle cx="24" cy="18" r="6"/>', 'cyan', 1.5) + sil('<rect x="28" y="26" width="8" height="5" rx="2"/>', 'red', 1.5),
  turb: stroke('M5 15C12 9 17 21 24 15S36 9 43 15', '#7ad8ff', 4) + stroke('M5 26C12 20 17 32 24 26S36 20 43 26', '#ffffff', 4) + stroke('M5 37C12 31 17 43 24 37S36 31 43 37', '#7ad8ff', 4),
  panic:
    sil('<circle cx="24" cy="26" r="17"/>', 'pink') + ink('<circle cx="18" cy="23" r="3.6"/><circle cx="30" cy="23" r="3.6"/><ellipse cx="24" cy="34" rx="4" ry="5"/>') +
    sil('<path d="M40 4C40 4 45 11 45 14C45 16 43 18 41 18C39 18 37 16 37 14C37 11 40 4 40 4Z"/>', 'cyan', 1.5),
  bird:
    sil('<path d="M6 30C10 18 22 14 30 18L42 12L38 22C40 32 30 40 18 38C12 37 8 34 6 30Z"/>', 'white') + ink('<circle cx="31" cy="22" r="2.4"/>') +
    sil('<path d="M38 22L46 24L38 27Z"/>', 'gold', 1.5) + stroke('M14 30L20 26L24 31', '#7ad8ff', 2.5),
  gear:
    sil('<circle cx="24" cy="24" r="16"/>', 'rock') + sil('<circle cx="24" cy="24" r="8"/>', 'silver', 2) + ink('<circle cx="24" cy="24" r="3"/>') + stroke('M24 4V12M24 36V44M4 24H12M36 24H44', '#9aa0b4', 3),
  check: sil('<circle cx="24" cy="24" r="19"/>', 'green') + stroke('M14 24L21 31L34 17', '#ffffff', 5),
  info: sil('<circle cx="24" cy="24" r="19"/>', 'cyan') + stroke('M24 22V34', '#fff', 5) + ink('<circle cx="24" cy="14" r="3.5"/>'),
  warn: sil('<path d="M24 4L45 41H3Z"/>', 'gold') + stroke('M24 17V29', INK, 3) + ink('<circle cx="24" cy="35" r="2.6"/>'),
  yoke:
    sil('<path d="M6 16C6 12 9 10 12 10H18L20 16H28L30 10H36C39 10 42 12 42 16V24C42 28 39 30 36 30H12C9 30 6 28 6 24Z"/>', 'rock') + sil('<rect x="20" y="28" width="8" height="16" rx="3"/>', 'silver', 2) + hl('<rect x="10" y="13" width="7" height="3" rx="1.5"/>'),
  down: sil('<circle cx="24" cy="24" r="19"/>', 'violet') + stroke('M24 12V34M15 26L24 35L33 26', '#fff', 4),
  up: sil('<circle cx="24" cy="24" r="19"/>', 'violet') + stroke('M24 36V14M15 22L24 13L33 22', '#fff', 4),
  runway:
    sil('<path d="M16 4H32L42 44H6Z"/>', 'rock') + stroke('M24 10V15M24 21V27M24 33V40', '#fff', 3) + ink('<circle cx="10" cy="38" r="2"/><circle cx="38" cy="38" r="2"/>'),
  ext:
    sil('<rect x="14" y="14" width="18" height="30" rx="7"/>', 'red') + sil('<rect x="18" y="6" width="10" height="9" rx="2"/>', 'silver', 2) + stroke('M28 9H38L42 15', '#2a2f45', 3) + hl('<rect x="17" y="18" width="4" height="18" rx="2"/>'),
  tape: sil('<circle cx="24" cy="24" r="17"/>', 'silver') + sil('<circle cx="24" cy="24" r="8"/>', 'white', 2) + sil('<path d="M38 30L46 34L42 40L35 36Z"/>', 'silver', 1.5),
  water: sil('<path d="M18 6H30V12C34 14 36 18 36 22V40C36 43 34 44 31 44H17C14 44 12 43 12 40V22C12 18 14 14 18 12Z"/>', 'cyan') + hl('<rect x="16" y="22" width="4" height="16" rx="2"/>') + sil('<rect x="17" y="3" width="14" height="5" rx="2"/>', 'violet', 1.5),
  snack: sil('<path d="M8 14L40 10L42 36L10 40Z"/>', 'orange') + sil('<circle cx="22" cy="25" r="6"/>', 'gold', 1.5) + hl('<path d="M12 18L36 15L36 18L12 21Z"/>'),
  bag: sil('<rect x="8" y="14" width="32" height="28" rx="6"/>', 'violet') + stroke('M18 14V9C18 7 19 6 21 6H27C29 6 30 7 30 9V14', '#c9c9d9', 3) + hl('<rect x="12" y="18" width="10" height="4" rx="2"/>'),
  close: sil('<circle cx="24" cy="24" r="19"/>', 'red') + stroke('M16 16L32 32M32 16L16 32', '#fff', 5),
  hand: sil('<path d="M14 24V12C14 9 18 9 18 12V22V8C18 5 22 5 22 8V22V7C22 4 26 4 26 7V22V10C26 7 30 7 30 10V28C34 22 39 23 37 28C35 33 31 42 22 42C16 42 14 36 14 30Z"/>', 'pink'),
  throw: sil('<circle cx="34" cy="14" r="8"/>', 'violet') + stroke('M8 40C14 28 22 22 30 20', '#fff', 4) + stroke('M10 30L6 40L16 38', '#ffd34a', 3),
  drop: sil('<rect x="14" y="8" width="20" height="16" rx="4"/>', 'violet') + stroke('M24 28V42M17 35L24 42L31 35', '#fff', 4),
  cube: sil('<path d="M24 4L42 14V34L24 44L6 34V14Z"/>', 'cyan') + stroke('M6 14L24 24L42 14M24 24V44', INK, 1.5) + hl('<path d="M10 15L24 7L37 14L24 21Z"/>', 0.45),
  square: sil('<rect x="6" y="6" width="36" height="36" rx="6"/>', 'green') + hl('<rect x="10" y="10" width="14" height="4" rx="2"/>', 0.6),
  star: sil('<path d="M24 4L30 17L44 18L33 27L37 42L24 34L11 42L15 27L4 18L18 17Z"/>', 'gold') + hl('<path d="M20 15L24 8L27 16Z"/>', 0.6),
  starOff: `<g opacity=".35">${sil('<path d="M24 4L30 17L44 18L33 27L37 42L24 34L11 42L15 27L4 18L18 17Z"/>', 'rock')}</g>`,
  crew: sil('<circle cx="16" cy="28" r="11"/>', 'pink') + sil('<circle cx="32" cy="28" r="11"/>', 'cyan') + ink('<circle cx="13" cy="26" r="2"/><circle cx="19" cy="26" r="2"/><circle cx="29" cy="26" r="2"/><circle cx="35" cy="26" r="2"/>') + sil('<rect x="9" y="12" width="14" height="6" rx="3"/>', 'violet', 1.5) + sil('<rect x="25" y="12" width="14" height="6" rx="3"/>', 'white', 1.5),
  follow: sil('<circle cx="16" cy="18" r="9"/>', 'cyan') + stroke('M14 38H38M30 30L38 38L30 46', '#fff', 4),
  stay: sil('<rect x="8" y="8" width="32" height="32" rx="10"/>', 'red') + stroke('M18 18V30M30 18V30', '#fff', 5),
  calm: sil('<path d="M24 42C10 32 4 24 4 16C4 10 9 6 14 6C18 6 22 9 24 12C26 9 30 6 34 6C39 6 44 10 44 16C44 24 38 32 24 42Z"/>', 'pink') + hl('<ellipse cx="14" cy="15" rx="4" ry="3"/>'),
  cam: sil('<rect x="6" y="14" width="36" height="26" rx="6"/>', 'violet') + sil('<circle cx="24" cy="27" r="8"/>', 'cyan', 2) + sil('<rect x="16" y="8" width="14" height="7" rx="2"/>', 'violet', 1.5),
  flaps: sil('<path d="M4 20C14 14 34 14 42 20L42 24L4 26Z"/>', 'silver') + sil('<path d="M18 26L42 25L38 36L20 32Z"/>', 'gold', 2),
  plane:
    sil('<path d="M22 4C24 2 26 4 26 8V18L44 28V32L26 26V38L32 42V45L24 43L16 45V42L22 38V26L4 32V28L22 18V8C22 6 22 5 22 4Z"/>', 'white') + hl('<rect x="23" y="7" width="2" height="12" rx="1"/>', 0.8),
  clock: sil('<circle cx="24" cy="24" r="19"/>', 'white') + stroke('M24 12V24L32 29', INK, 2.5),
  calendar: sil('<rect x="6" y="10" width="36" height="32" rx="6"/>', 'white') + sil('<rect x="6" y="10" width="36" height="10" rx="5"/>', 'red', 1.5) + ink('<rect x="13" y="25" width="6" height="5" rx="1"/><rect x="21" y="25" width="6" height="5" rx="1"/><rect x="29" y="25" width="6" height="5" rx="1"/><rect x="13" y="32" width="6" height="5" rx="1"/>'),
  school: sil('<path d="M4 18L24 8L44 18L24 28Z"/>', 'violet') + sil('<path d="M12 23V33C16 38 32 38 36 33V23L24 29Z"/>', 'cyan', 2) + stroke('M40 20V34', '#ffd34a', 3),
  trophy: sil('<path d="M14 6H34V16C34 24 30 28 24 28C18 28 14 24 14 16Z"/>', 'gold') + sil('<rect x="18" y="36" width="12" height="8" rx="2"/>', 'gold', 2) + sil('<rect x="22" y="28" width="4" height="9"/>', 'gold', 1.5),
  coin: sil('<circle cx="24" cy="24" r="18"/>', 'gold') + stroke('M24 14V34', '#b36b00', 3) + hl('<circle cx="17" cy="16" r="4"/>', 0.6),
};

export function vIcon(name: string, size = 32): string {
  ensureIconDefs();
  const body = ICONS[name as VIcon] ?? ICONS.info;
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** chapéu de cada papel (SVG original): quepes, boina e chapeuzinho */
export function hatIcon(role: number, size = 32): string {
  const [a, b, c] = HAT_COLS[role] ?? HAT_COLS[0];
  let s = '';
  if (role <= 1) {
    // quepe: copa + aba + faixa + emblema
    s =
      `<path d="M6 26C6 16 14 10 24 10C34 10 42 16 42 26Z" fill="${a}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<rect x="8" y="24" width="32" height="7" rx="3" fill="${b}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M10 31C16 38 32 38 38 31Z" fill="#2a2f45" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      (role === 0
        ? `<path d="M14 18L22 20L24 16L26 20L34 18L26 23H22Z" fill="${b}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
        : `<circle cx="24" cy="19" r="4" fill="${c}" stroke="${INK}" stroke-width="1.5"/><path d="M14 27H34" stroke="${c}" stroke-width="2"/>`);
  } else if (role === 2) {
    // boina inclinada + laço do lenço
    s =
      `<ellipse cx="22" cy="22" rx="17" ry="9" fill="${a}" stroke="${INK}" stroke-width="3" transform="rotate(-12 22 22)"/>` +
      `<circle cx="26" cy="12" r="3" fill="${c}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M16 34L24 38L32 34L30 44L24 40L18 44Z" fill="${b}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  } else {
    // chapeuzinho redondo (pillbox) + lenço
    s =
      `<path d="M10 26V16C10 12 16 10 24 10C32 10 38 12 38 16V26Z" fill="${a}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<rect x="10" y="20" width="28" height="5" fill="${c}"/>` +
      `<path d="M14 32L24 37L34 32L33 42L24 38L15 42Z" fill="${b}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${s}</svg>`;
}
