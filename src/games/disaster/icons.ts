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

export type DzIcon =
  | DisasterId
  | 'house'
  | 'bunker'
  | 'ghost'
  | 'wave'
  | 'combo'
  | 'geleia'
  | 'lama'
  | 'chocolate'
  | 'bolhas'
  | 'chaolava'
  | 'granizo'
  | 'doces'
  | 'melancias'
  | 'pianos'
  | 'boliche'
  | 'bolaneve'
  | 'furacao'
  | 'gelo'
  | 'vento'
  | 'lua'
  | 'shade'
  | 'fire'
  | 'dice'
  | 'book'
  | 'mystery';

const ICONS: Record<Exclude<DzIcon, 'bolas'>, string> & { bolas?: string } = {
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
  geleia: sil('<path d="M4 40C4 24 14 10 28 10C37 10 44 15 44 21C38 17 31 18 30 25C35 24 38 28 36 31H44V42H4Z"/>', 'pink') + hl('<path d="M10 31C12 22 18 15 26 13L25 15C19 18 15 23 13 31Z"/>', 0.7) + ink('<circle cx="18" cy="32" r="2"/><circle cx="28" cy="34" r="2"/>') + `<path d="M19 37Q23 40 27 37" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  lama: sil('<path d="M2 42L16 12L26 22L34 14L46 42Z"/>', 'rock') + sil('<path d="M8 42C12 34 18 32 24 34S34 36 40 30L44 42Z"/>', 'orange', 2) + sil('<circle cx="32" cy="36" r="4"/><circle cx="20" cy="38" r="3"/>', 'rock', 2),
  chocolate: sil('<path d="M8 6H40V28C40 30 38 30 37 28V24C37 22 35 22 35 24V34C35 36 32 36 32 34V24C32 22 30 22 30 24V30C30 32 27 32 27 30V24H8Z"/>', 'orange') + sil('<path d="M4 38C10 34 14 42 20 38S30 42 36 38S42 38 44 38V44H4Z"/>', 'orange', 2) + ink('<path d="M14 10H22V16H14ZM26 10H34V16H26Z" opacity=".35"/>'),
  bolhas: sil('<circle cx="16" cy="30" r="10"/><circle cx="32" cy="18" r="8"/><circle cx="34" cy="36" r="6"/><circle cx="14" cy="10" r="4"/>', 'cyan', 2.4) + hl('<circle cx="12" cy="26" r="3"/><circle cx="29" cy="15" r="2.4"/><circle cx="32" cy="34" r="1.6"/>', 0.9),
  chaolava: sil('<path d="M4 34C10 30 14 36 20 32S30 30 36 34S42 32 44 32V44H4Z"/>', 'orange', 2.4) + sil('<rect x="8" y="14" width="12" height="6" rx="2"/><rect x="28" y="8" width="12" height="6" rx="2"/>', 'rock', 2) + sil('<circle cx="24" cy="26" r="4"/>', 'gold', 2),
  granizo: sil('<path d="M12 18C8 18 6 15 6 12S9 6 13 7C14 4 18 2 22 3C26 2 30 5 31 8C35 7 40 9 40 13S37 18 34 18Z"/>', 'silver', 2.6) + sil('<circle cx="14" cy="28" r="4"/><circle cx="26" cy="32" r="5"/><circle cx="36" cy="26" r="3.6"/><circle cx="20" cy="42" r="3.4"/><circle cx="34" cy="41" r="3"/>', 'white', 2),
  doces: sil('<path d="M14 24L4 16L6 32ZM34 24L44 16L42 32Z"/>', 'pink', 2.4) + sil('<circle cx="24" cy="24" r="11"/>', 'red') + `<path d="M17 19C21 25 27 17 31 25M17 27C21 33 27 25 31 30" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  melancias: sil('<path d="M4 18A20 20 0 0 0 44 18Z"/>', 'green') + `<path d="M8 18A16 16 0 0 0 40 18Z" fill="#ff5a6a"/>` + ink('<ellipse cx="16" cy="24" rx="1.4" ry="2.2"/><ellipse cx="24" cy="28" rx="1.4" ry="2.2"/><ellipse cx="32" cy="24" rx="1.4" ry="2.2"/><ellipse cx="20" cy="31" rx="1.2" ry="2"/><ellipse cx="28" cy="31" rx="1.2" ry="2"/>'),
  pianos: sil('<path d="M6 12H28C36 12 42 18 42 26V34H6Z"/>', 'violet') + sil('<rect x="6" y="28" width="36" height="8"/>', 'white', 1.8) + ink('<rect x="10" y="28" width="3" height="5"/><rect x="17" y="28" width="3" height="5"/><rect x="24" y="28" width="3" height="5"/><rect x="31" y="28" width="3" height="5"/><rect x="9" y="36" width="3" height="8"/><rect x="36" y="36" width="3" height="8"/>'),
  boliche: sil('<path d="M36 6C40 6 41 10 39 14C38 17 42 22 42 30C42 38 39 42 36 42S30 38 30 30C30 22 34 17 33 14C31 10 32 6 36 6Z"/>', 'white', 2.4) + `<path d="M33 16H39" stroke="#ff3355" stroke-width="2.4"/>` + sil('<circle cx="18" cy="30" r="14"/>', 'violet') + ink('<circle cx="14" cy="24" r="2"/><circle cx="20" cy="22" r="2"/><circle cx="18" cy="28" r="2"/>') + hl('<circle cx="12" cy="34" r="3"/>', 0.4),
  bolaneve: sil('<circle cx="22" cy="26" r="17"/>', 'white') + sil('<path d="M38 42H46V46H38Z"/>', 'white', 1.6) + `<g fill="none" stroke="#9fc8ff" stroke-width="2" stroke-linecap="round"><path d="M12 18C16 22 14 30 18 34M28 12C26 18 32 24 30 32"/></g>` + hl('<circle cx="15" cy="17" r="4"/>', 0.8),
  furacao: sil('<path d="M24 4C34 4 42 10 42 18C42 20 40 21 39 19C36 13 30 11 25 12C33 13 37 19 36 25C35 31 30 34 24 34C30 33 33 28 31 23C29 19 25 18 22 19C26 20 28 24 26 27C24 31 18 32 14 28C16 30 20 30 22 27C14 28 8 22 8 15C8 8 15 4 24 4Z"/>', 'silver') + sil('<path d="M10 40C16 36 22 44 28 40S38 40 42 40V44H10Z"/>', 'cyan', 2),
  gelo: sil('<path d="M4 20H44V42H4Z"/>', 'cyan') + `<path d="M24 20L20 28L27 32L22 42M24 20L32 26L38 24M20 28L10 30" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` + hl('<path d="M6 22H40V24H6Z"/>', 0.8) + sil('<path d="M16 6L20 14M30 4L28 14M38 8L34 15"/>', 'white', 1.4),
  vento: sil('<path d="M4 16H28C34 16 36 8 30 6C26 5 24 9 26 11M4 26H36C44 26 44 36 36 36C32 36 31 32 33 30M4 36H18"/>', 'cyan', 2.2) + sil('<path d="M34 10C38 8 42 12 40 16C38 14 36 12 34 10Z"/>', 'green', 1.6),
  lua: sil('<circle cx="24" cy="24" r="15"/>', 'silver') + ink('<circle cx="18" cy="20" r="3.4"/><circle cx="29" cy="28" r="4.4"/><circle cx="26" cy="15" r="2"/>') + `<ellipse cx="24" cy="26" rx="22" ry="6" fill="none" stroke="#b69cff" stroke-width="3" transform="rotate(-18 24 26)"/>` + hl('<circle cx="17" cy="16" r="3"/>', 0.6),
  gravidade: sil('<circle cx="24" cy="30" r="10"/>', 'pink') + ink('<circle cx="20" cy="28" r="1.8"/><circle cx="28" cy="28" r="1.8"/>') + sil('<path d="M10 16L14 6L18 16ZM30 16L34 6L38 16ZM20 10L24 2L28 10Z"/>', 'violet', 2) + `<path d="M8 44H40" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/>`,
  buraco: `<circle cx="24" cy="24" r="21" fill="${INK}"/><g fill="none" stroke-linecap="round" stroke-width="3.2"><path d="M24 6C36 6 42 16 40 24" stroke="#b69cff"/><path d="M42 26C40 38 30 42 22 40" stroke="#7a4dff"/><path d="M20 42C10 38 6 30 8 22" stroke="#b69cff"/><path d="M8 20C10 10 18 6 26 8" stroke="#7a4dff"/><path d="M24 14C31 14 34 20 32 26" stroke="#ffd3ff"/><path d="M31 29C28 34 20 34 17 30" stroke="#ffd3ff"/></g><circle cx="24" cy="24" r="6" fill="#000"/>`,
  abducao: `<path d="M16 22L8 44H40L32 22Z" fill="#9dffb0" opacity=".55"/>` + sil('<ellipse cx="24" cy="18" rx="20" ry="6"/>', 'silver') + sil('<path d="M14 16C14 8 18 4 24 4S34 8 34 16Z"/>', 'cyan', 2) + sil('<circle cx="24" cy="36" r="5"/>', 'pink', 2) + ink('<circle cx="12" cy="19" r="1.6"/><circle cx="24" cy="21" r="1.6"/><circle cx="36" cy="19" r="1.6"/>'),
  laser: sil('<ellipse cx="14" cy="14" rx="11" ry="4"/>', 'silver', 2.4) + sil('<path d="M8 13C8 8 10 6 14 6S20 8 20 13Z"/>', 'cyan', 1.8) + `<path d="M20 18L44 40" stroke="#ff4fd8" stroke-width="5" stroke-linecap="round"/><path d="M20 18L44 40" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` + sil('<path d="M4 44H44"/>', 'rock', 1.6),
  pisao: sil('<path d="M10 6H30V24C38 24 44 28 44 34V40H6V24C6 18 8 14 10 12Z"/>', 'orange') + ink('<rect x="6" y="38" width="38" height="4" rx="2"/>') + sil('<circle cx="14" cy="38" r="3"/><circle cx="22" cy="38" r="3"/><circle cx="30" cy="38" r="3"/><circle cx="38" cy="38" r="3"/>', 'white', 1.4) + hl('<path d="M12 8H16V22H12Z"/>', 0.4),
  calor: sil('<circle cx="24" cy="24" r="10"/>', 'gold') + sil('<path d="M24 2V9M24 39V46M2 24H9M39 24H46M8 8L13 13M35 35L40 40M40 8L35 13M13 35L8 40"/>', 'orange', 1.8) + ink('<circle cx="20" cy="22" r="1.6"/><circle cx="28" cy="22" r="1.6"/>') + `<path d="M19 28Q24 31 29 28" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  incendio: sil('<path d="M6 44H42L36 30L30 34L28 22L22 28L18 18L14 30L10 26Z"/>', 'orange') + sil('<path d="M16 44C14 38 18 34 20 30C22 36 26 34 26 30C30 34 32 40 28 44Z"/>', 'gold', 2) + sil('<path d="M36 4L42 18H30Z"/><rect x="34" y="18" width="4" height="8"/>', 'green', 1.8),
  nevasca: sil('<path d="M24 4V44M6 14L42 34M42 14L6 34"/>', 'cyan', 2.4) + sil('<path d="M18 6L24 12L30 6M18 42L24 36L30 42M5 22L11 19L9 12M43 26L37 29L39 36M43 22L37 19L39 12M5 26L11 29L9 36"/>', 'white', 1.6) + sil('<circle cx="24" cy="24" r="4"/>', 'white', 1.6),
  geiser: sil('<path d="M18 44C20 30 18 20 14 12C18 10 20 6 24 4C28 6 30 10 34 12C30 20 28 30 30 44Z"/>', 'cyan') + sil('<path d="M4 44C8 40 14 40 18 42H30C34 40 40 40 44 44Z"/>', 'rock', 2) + hl('<path d="M22 12C21 18 22 26 22 32L20 32C20 24 19 18 20 12Z"/>', 0.8) + sil('<circle cx="10" cy="10" r="3"/><circle cx="38" cy="8" r="2.6"/>', 'white', 1.4),
  fantasma: `<rect x="2" y="30" width="44" height="14" rx="7" fill="#cfd8ff" opacity=".7"/>` + sil('<path d="M12 24C12 14 17 7 24 7S36 14 36 24V40L32 36L28 40L24 36L20 40L16 36L12 40Z"/>', 'white') + ink('<ellipse cx="20" cy="21" rx="2.4" ry="3.4"/><ellipse cx="28" cy="21" rx="2.4" ry="3.4"/>') + `<path d="M20 29Q24 32 28 29" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` + `<g fill="#ff9ad5" opacity=".7"><circle cx="16" cy="27" r="2"/><circle cx="32" cy="27" r="2"/></g>`,
  abelhas: sil('<ellipse cx="24" cy="28" rx="14" ry="11"/>', 'gold') + `<g fill="${INK}"><path d="M17 18.5C19 22 19 34 17 37.5L21 39C23 34 23 22 21 17.5Z"/><path d="M27 17.5C29 22 29 34 27 38.5L31 37.5C33 33 33 23 31 18.5Z"/></g>` + sil('<ellipse cx="18" cy="12" rx="7" ry="5" transform="rotate(-25 18 12)"/><ellipse cx="31" cy="12" rx="7" ry="5" transform="rotate(25 31 12)"/>', 'white', 2) + ink('<circle cx="35" cy="26" r="2"/>') + `<path d="M10 28L4 28" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  shade: sil('<path d="M4 22C4 12 13 6 24 6S44 12 44 22Z"/>', 'red') + sil('<path d="M23 22H25V40C25 44 19 44 19 40"/>', 'rock', 1.6) + `<ellipse cx="24" cy="44" rx="14" ry="3" fill="${INK}" opacity=".35"/>`,
  fire: sil('<path d="M24 4C26 12 36 16 36 28C36 36 31 42 24 42S12 36 12 28C12 22 16 18 18 14C20 20 22 22 24 22C24 16 22 10 24 4Z"/>', 'orange') + sil('<path d="M24 24C26 28 30 30 30 34C30 38 27 40 24 40S18 38 18 34C18 30 22 28 24 24Z"/>', 'gold', 1.6),
  dice: sil('<rect x="6" y="6" width="36" height="36" rx="8"/>', 'white') + ink('<circle cx="16" cy="16" r="3.4"/><circle cx="32" cy="16" r="3.4"/><circle cx="24" cy="24" r="3.4"/><circle cx="16" cy="32" r="3.4"/><circle cx="32" cy="32" r="3.4"/>'),
  book: sil('<path d="M6 8C12 6 18 6 24 10C30 6 36 6 42 8V40C36 38 30 38 24 42C18 38 12 38 6 40Z"/>', 'orange') + `<path d="M24 10V42" stroke="${INK}" stroke-width="2.4"/>` + sil('<path d="M10 14H20M10 20H20M28 14H38M28 20H38"/>', 'white', 1),
  mystery: sil('<rect x="6" y="6" width="36" height="36" rx="10"/>', 'violet') + `<text x="24" y="35" text-anchor="middle" font-family="Fredoka,system-ui,sans-serif" font-weight="800" font-size="28" fill="#fff" stroke="${INK}" stroke-width="2" paint-order="stroke">?</text>`,
  combo: sil('<circle cx="17" cy="24" r="12"/>', 'orange') + sil('<circle cx="31" cy="24" r="12"/>', 'red') + `<path d="M20 18L28 30M28 18L20 30" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>` + hl('<circle cx="13" cy="19" r="3"/>', 0.7),
};

ICONS.bolas = ICONS.boliche;

export function dzIcon(name: DzIcon | string, size = 48): string {
  if (typeof document !== 'undefined') ensureIconDefs();
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${(ICONS as Record<string, string>)[name] ?? ICONS.mystery}</svg>`;
}

/** selo dos modificadores (canto do ícone) */
const BADGE: Record<string, string> = {
  noite: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M41 4A7 7 0 1 0 43 15A6 6 0 0 1 41 4Z" fill="#ffe680"/>`,
  rapido: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M40 3L33 11H38L35 18L43 9H38Z" fill="#ffe14d"/>`,
  gigante: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M38 3L44 11H40V17H36V11H32Z" fill="#ff7a59"/>`,
  mini: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M38 17L44 9H40V3H36V9H32Z" fill="#7ad8ff"/>`,
  vento: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M32 8H40C43 8 43 4 40 4M32 12H42C45 12 45 16 42 16" fill="none" stroke="#a8e0c8" stroke-width="2.2" stroke-linecap="round"/>`,
  chuva: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M35 5L33 10M40 5L38 10M37 11L35 16M42 11L40 16" stroke="#7ad8ff" stroke-width="2.2" stroke-linecap="round"/>`,
  neblina: `<circle cx="38" cy="10" r="9" fill="${INK}"/><path d="M32 7H44M31 11H45M32 15H43" stroke="#e0e6ff" stroke-width="2.2" stroke-linecap="round"/>`,
};

/** ícone de um desastre do catálogo: perigo + (combo) 2º perigo menor + selo do modificador */
export function dzEntryIcon(hz: string[], mods: string[], size = 48): string {
  if (typeof document !== 'undefined') ensureIconDefs();
  const a = ICONS[hz[0] as DzIcon] ?? ICONS.mystery;
  let body = a;
  if (hz[1]) {
    const b = ICONS[hz[1] as DzIcon] ?? ICONS.mystery;
    body = `<g transform="translate(-2,-2) scale(.78)">${a}</g><g transform="translate(19,19) scale(.6)"><circle cx="24" cy="24" r="23" fill="#fff" opacity=".9"/>${b}</g>`;
  }
  const badge = mods.length ? (BADGE[mods[0]] ?? '') : '';
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}${badge}</svg>`;
}
