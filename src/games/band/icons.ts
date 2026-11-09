/* Ícones SVG da "Bloop Banda" — mesmo estilo de src/ui/icons.ts
 * (contorno de tinta + gradientes compartilhados bo-*), viewBox 48×48. */
import { ensureIconDefs } from '../../ui/icons';

const INK = '#2a0b5c';
type G = 'gold' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'rock' | 'silver' | 'violet' | 'pink' | 'gem';
const sil = (shapes: string, g: G, w = 3): string =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="url(#bo-${g})">${shapes}</g>`;
const hl = (shapes: string, o = 0.5): string => `<g fill="#fff" opacity="${o}">${shapes}</g>`;
const ink = (shapes: string): string => `<g fill="${INK}">${shapes}</g>`;
const line = (d: string, w = 3, c = INK): string => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export type BandIcon =
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'keys'
  | 'vocals'
  | 'metronome'
  | 'mixer'
  | 'band'
  | 'search'
  | 'back'
  | 'share'
  | 'import'
  | 'plus'
  | 'trash'
  | 'note'
  | 'highway'
  | 'star'
  | 'brush'
  | 'play'
  | 'stop'
  | 'lock'
  | 'emote'
  | 'stretch';

const ICONS: Record<BandIcon, string> = {
  drums:
    sil('<ellipse cx="24" cy="30" rx="15" ry="11"/><path d="M9 30V36C9 42 39 42 39 36V30Z"/>', 'red') +
    sil('<ellipse cx="24" cy="27" rx="15" ry="7"/>', 'white', 2.4) +
    line('M8 6L20 22M40 6L28 22', 3.4) +
    sil('<circle cx="8" cy="6" r="3"/><circle cx="40" cy="6" r="3"/>', 'gold', 1.6) +
    hl('<path d="M14 26C17 23 22 22 27 22L26 24C22 24 18 25 16 27Z"/>', 0.7),
  bass:
    sil('<path d="M30 4L38 6L36 10L24 28L20 26L32 8Z"/>', 'rock', 2.2) +
    sil('<path d="M22 24C26 22 30 26 28 30C27 33 30 34 30 38C30 44 20 46 14 42C8 38 8 30 12 28C15 26 16 28 19 27Z"/>', 'cyan') +
    ink('<circle cx="19" cy="35" r="2.6"/>') +
    line('M33 7L19 33', 1.4, '#fff') +
    hl('<path d="M13 32C14 30 16 29 18 30L16 32C15 33 14 34 13 35Z"/>', 0.7),
  guitar:
    sil('<path d="M34 3L42 8L39 11L27 26L23 23L31 7Z"/>', 'rock', 2.2) +
    sil('<path d="M24 22C28 20 32 24 30 29L33 33C35 39 29 45 22 44C14 43 8 38 8 32C8 27 12 24 16 26C18 22 21 22 24 22Z"/>', 'orange') +
    ink('<circle cx="20" cy="33" r="3"/><rect x="13" y="38" width="10" height="2.6" rx="1.3" transform="rotate(-38 18 39)"/>') +
    hl('<path d="M11 31C12 28 14 27 17 28L15 30C13 31 12 32 12 34Z"/>', 0.7),
  keys:
    sil('<rect x="4" y="14" width="40" height="22" rx="4"/>', 'white') +
    ink('<rect x="11" y="14" width="4" height="12" rx="1"/><rect x="19" y="14" width="4" height="12" rx="1"/><rect x="29" y="14" width="4" height="12" rx="1"/><rect x="37" y="14" width="3.5" height="12" rx="1"/>') +
    line('M14 27V36M24 27V36M34 27V36', 1.6) +
    sil('<rect x="4" y="10" width="40" height="5" rx="2"/>', 'violet', 2),
  vocals:
    sil('<rect x="16" y="4" width="16" height="22" rx="8"/>', 'silver') +
    line('M12 20C12 30 36 30 36 20M24 28V40M16 42H32', 3.4) +
    `<g stroke="#9b92bf" stroke-width="1.6" stroke-linecap="round"><path d="M18 10H30M17 15H31M18 20H30"/></g>` +
    hl('<path d="M19 8C20 6 22 5 24 5L23 8C21 8 20 9 20 11Z"/>', 0.8),
  metronome:
    sil('<path d="M18 6H30L40 42H8Z"/>', 'orange') +
    sil('<rect x="12" y="32" width="24" height="8" rx="2"/>', 'rock', 1.8) +
    line('M24 34L32 10', 3.2) +
    sil('<circle cx="29" cy="18" r="3"/>', 'gold', 1.4),
  mixer:
    sil('<rect x="5" y="6" width="38" height="36" rx="6"/>', 'violet') +
    line('M15 12V36M24 12V36M33 12V36', 3, '#2a0b5c') +
    sil('<rect x="11" y="24" width="8" height="5" rx="2"/><rect x="20" y="14" width="8" height="5" rx="2"/><rect x="29" y="28" width="8" height="5" rx="2"/>', 'gold', 1.4),
  band:
    sil('<circle cx="15" cy="20" r="9"/>', 'pink') +
    sil('<circle cx="33" cy="20" r="9"/>', 'cyan') +
    sil('<path d="M4 42C4 32 26 32 26 42Z"/><path d="M22 42C22 32 44 32 44 42Z"/>', 'violet', 2.4) +
    ink('<circle cx="12" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/><circle cx="30" cy="19" r="1.6"/><circle cx="36" cy="19" r="1.6"/>'),
  search: sil('<circle cx="20" cy="20" r="12"/>', 'cyan') + line('M29 29L40 40', 6) + line('M29 29L40 40', 2.6, '#ffcf2e') + hl('<path d="M13 18C13 14 16 11 20 11L19 14C16 14 15 16 15 19Z"/>', 0.8),
  back: sil('<path d="M28 8L12 24L28 40L32 36L20 24L32 12Z"/>', 'white'),
  share: sil('<circle cx="12" cy="24" r="6"/><circle cx="36" cy="11" r="6"/><circle cx="36" cy="37" r="6"/>', 'cyan', 2.4) + line('M16 21L31 13M16 27L31 35', 3.4),
  import: sil('<path d="M8 28H16V36H32V28H40V42H8Z"/>', 'silver', 2.4) + sil('<path d="M20 4H28V18H35L24 30L13 18H20Z"/>', 'green', 2.4),
  plus: sil('<path d="M19 6H29V19H42V29H29V42H19V29H6V19H19Z"/>', 'green'),
  trash: sil('<path d="M10 14H38L35 42H13Z"/>', 'red') + sil('<rect x="8" y="8" width="32" height="6" rx="2"/><rect x="19" y="4" width="10" height="5" rx="2"/>', 'rock', 1.8) + line('M19 20V36M29 20V36', 2.4),
  note: sil('<path d="M18 34V8L38 4V30"/>', 'violet', 2) + sil('<ellipse cx="13" cy="35" rx="7" ry="5.5"/><ellipse cx="33" cy="31" rx="7" ry="5.5"/>', 'pink') + line('M18 10L38 6', 4.4),
  highway:
    sil('<path d="M17 4H31L44 44H4Z"/>', 'violet') +
    line('M22 4L18 44M26 4L30 44', 1.8, '#d2bdff') +
    sil('<ellipse cx="24" cy="16" rx="3.4" ry="2.2"/>', 'gold', 1.4) +
    sil('<ellipse cx="13" cy="34" rx="5" ry="3.2"/><ellipse cx="34" cy="28" rx="4.6" ry="3"/>', 'pink', 1.6),
  star: sil('<path d="M24 3L30 17L45 18L33 28L37 43L24 35L11 43L15 28L3 18L18 17Z"/>', 'gold') + hl('<path d="M24 10L27 18L22 20Z"/>', 0.7),
  brush: sil('<path d="M30 4L44 18L26 30L18 22Z"/>', 'pink') + sil('<path d="M16 24L24 32C22 40 14 44 4 44C8 40 6 30 16 24Z"/>', 'gold'),
  play: sil('<path d="M14 6L40 24L14 42Z"/>', 'green'),
  stop: sil('<rect x="9" y="9" width="30" height="30" rx="6"/>', 'red'),
  lock: sil('<rect x="9" y="20" width="30" height="22" rx="5"/>', 'gold') + line('M15 20V14C15 4 33 4 33 14V20', 5) + ink('<circle cx="24" cy="30" r="3"/><rect x="22.5" y="30" width="3" height="7" rx="1.5"/>'),
  emote: sil('<path d="M6 10C6 6 9 4 13 4H35C39 4 42 6 42 10V28C42 32 39 34 35 34H20L10 43L12 34C8 34 6 32 6 28Z"/>', 'white') + ink('<circle cx="17" cy="17" r="2.6"/><circle cx="31" cy="17" r="2.6"/>') + line('M16 24C20 28 28 28 32 24', 2.8),
  stretch: sil('<rect x="5" y="17" width="38" height="14" rx="7"/>', 'cyan') + line('M14 24H34', 2.6) + line('M30 19L35 24L30 29', 2.6),
};

export function bandIcon(name: BandIcon, size = 28): string {
  if (typeof document !== 'undefined') ensureIconDefs();
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
