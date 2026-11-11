/* Ícones SVG do "Sobreviva aos Desastres" — mesmo estilo de src/ui/icons.ts
 * (contorno de tinta + gradientes compartilhados bo-*). */
import { ensureIconDefs } from '../../ui/icons';
import type { DisasterId } from './scenarios';

const INK = '#2a0b5c';
type G = 'gold' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'rock' | 'silver' | 'violet' | 'pink';
const sil = (shapes: string, g: G, w = 3): string =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="url(#bo-${g})">${shapes}</g>`;
const hl = (shapes: string, o = 0.5): string => `<g fill="#fff" opacity="${o}">${shapes}</g>`;
const ink = (shapes: string): string => `<g fill="${INK}">${shapes}</g>`;

export type DzIcon = DisasterId | 'house' | 'bunker' | 'ghost' | 'wave' | 'combo';

const ICONS: Record<DzIcon, string> = {
  house: sil('<path d="M6 24L24 8L42 24Z"/><rect x="11" y="22" width="26" height="20" rx="2"/>', 'orange') + ink('<rect x="20" y="30" width="8" height="12" rx="2"/>') + hl('<path d="M12 22L24 11L26 12L14 23Z"/>', 0.5),
  bunker: sil('<path d="M4 40C4 22 13 14 24 14S44 22 44 40Z"/>', 'silver') + ink('<rect x="18" y="26" width="12" height="14" rx="2"/>') + sil('<path d="M8 32H16M32 32H40"/>', 'gold', 1.6) + hl('<path d="M10 30C12 22 17 18 22 17L21 19C17 21 14 24 12 31Z"/>', 0.6),
  ghost: sil('<path d="M10 24C10 14 16 7 24 7S38 14 38 24V42L33 38L28 42L24 38L20 42L15 38L10 42Z"/>', 'white') + ink('<ellipse cx="19" cy="22" rx="2.6" ry="3.6"/><ellipse cx="29" cy="22" rx="2.6" ry="3.6"/><circle cx="24" cy="30" r="2.4"/>') + hl('<path d="M14 18C15 13 18 11 21 10L20 12C18 13 16 15 15 19Z"/>', 0.8),
  tsunami: sil('<path d="M4 40C4 22 16 8 30 8C38 8 44 13 44 19C38 15 30 16 28 24C34 22 38 26 36 30H44V42H4Z"/>', 'cyan') + hl('<path d="M10 30C12 20 19 12 28 11L27 13C20 15 15 21 13 30Z"/>', 0.6),
  enchente: sil('<path d="M24 5C24 5 12 19 12 27A12 12 0 0 0 36 27C36 19 24 5 24 5Z"/>', 'cyan') + sil('<path d="M4 40C10 36 14 44 20 40S30 44 36 40S42 40 44 40V44H4Z"/>', 'cyan', 2) + hl('<path d="M17 25C17 21 20 16 22 13L21 20C20 23 19 25 19 27Z"/>', 0.6),
  vulcao: sil('<path d="M4 42L18 16H30L44 42Z"/>', 'rock') + sil('<path d="M18 16C18 10 22 6 24 4C26 8 30 10 30 16L26 26L23 20L20 27Z"/>', 'orange', 2.4) + hl('<path d="M20 14C21 10 23 8 24 7L23 12Z"/>', 0.7),
  terremoto: sil('<path d="M4 26H44V42H4Z"/>', 'rock') + `<path d="M24 26L20 32L26 35L21 42" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` + sil('<path d="M10 8L16 20M32 6L36 18M22 4V14"/>', 'gold', 1.5),
  tornado: sil('<path d="M6 8H42C40 14 32 16 30 20C28 24 34 26 30 32C27 36 24 38 24 44C20 38 22 34 20 30C18 26 14 24 16 20C10 18 6 14 6 8Z"/>', 'silver') + `<g fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" opacity=".55"><path d="M12 12H36M16 19H30M20 27H30"/></g>`,
  meteoros: sil('<circle cx="30" cy="30" r="10"/>', 'orange') + sil('<circle cx="14" cy="14" r="5"/>', 'orange', 2.4) + `<path d="M22 22L8 8M36 22L42 14M22 38L12 44" stroke="#ffb03a" stroke-width="3" stroke-linecap="round"/>` + hl('<circle cx="27" cy="26" r="3"/>', 0.7),
  meteoro: sil('<circle cx="28" cy="28" r="15"/>', 'red') + `<path d="M16 16L4 4M22 12L14 2M12 22L2 14" stroke="#ff9a2e" stroke-width="3.4" stroke-linecap="round"/>` + ink('<circle cx="24" cy="30" r="3"/><circle cx="33" cy="24" r="2.4"/>') + hl('<circle cx="22" cy="22" r="4"/>', 0.6),
  avalanche: sil('<path d="M2 42L20 10L30 24L36 16L46 42Z"/>', 'silver') + sil('<path d="M14 22L20 10L26 20L22 18L18 23Z"/>', 'white', 1.5) + sil('<circle cx="36" cy="36" r="5"/><circle cx="26" cy="38" r="4"/>', 'white', 2),
  raios: sil('<path d="M12 18C8 18 6 15 6 12S9 6 13 7C14 4 18 2 22 3C26 2 30 5 31 8C35 7 40 9 40 13S37 18 34 18Z"/>', 'silver', 2.6) + sil('<path d="M24 18L16 32H23L19 45L32 27H25L29 18Z"/>', 'gold', 2.6),
  acido: sil('<path d="M4 30C10 26 14 30 20 28S30 24 34 28S42 30 44 28V44H4Z"/>', 'green') + sil('<circle cx="16" cy="18" r="4"/><circle cx="28" cy="12" r="5"/><circle cx="36" cy="20" r="3"/>', 'green', 2) + hl('<circle cx="26" cy="10" r="1.8"/><circle cx="14" cy="16" r="1.4"/>', 0.8),
  sumidouro: sil('<path d="M4 22H44V42H4Z"/>', 'rock') + ink('<ellipse cx="24" cy="30" rx="13" ry="7"/>') + `<path d="M8 22L14 16M40 22L34 15M24 22V14" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` + hl('<path d="M8 26H20V28H8Z"/>', 0.5),
  areia: sil('<path d="M4 14H30C36 14 38 8 34 6M4 24H40C46 24 46 32 40 32M4 34H26C32 34 32 42 26 42"/>', 'orange', 2.2) + sil('<rect x="36" y="10" width="8" height="8" rx="2" transform="rotate(20 40 14)"/>', 'rock', 2),
  wave: sil('<path d="M4 40C4 26 14 14 26 14C34 14 40 19 40 25C35 21 28 22 27 28C32 27 35 30 34 33H44V42H4Z"/>', 'cyan') + hl('<path d="M10 32C12 24 18 18 25 17L24 19C19 21 15 26 13 32Z"/>', 0.6),
  combo: sil('<circle cx="17" cy="24" r="12"/>', 'orange') + sil('<circle cx="31" cy="24" r="12"/>', 'red') + `<path d="M20 18L28 30M28 18L20 30" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>` + hl('<circle cx="13" cy="19" r="3"/>', 0.7),
};

export function dzIcon(name: DzIcon, size = 48): string {
  if (typeof document !== 'undefined') ensureIconDefs();
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
