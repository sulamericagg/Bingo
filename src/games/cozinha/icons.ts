/* ============================================================
 *  COZINHA MALUCA — ícones SVG próprios no estilo de src/ui/icons.ts
 *  (contorno "tinta" roxo-escuro, gradientes compartilhados bo-*, brilho branco).
 * ============================================================ */
import { ensureIconDefs } from '../../ui/icons';

const INK = '#2a0b5c';
type Grad = 'gold' | 'gem' | 'pink' | 'violet' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'rock' | 'silver';
const sil = (shapes: string, g: Grad, w = 3): string =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="url(#bo-${g})">${shapes}</g>`;
const hl = (shapes: string, o = 0.5): string => `<g fill="#fff" opacity="${o}">${shapes}</g>`;
const ink = (shapes: string): string => `<g fill="${INK}">${shapes}</g>`;

export type CzIcon = 'hat' | 'knife' | 'pot' | 'hand' | 'plate' | 'ext' | 'robot' | 'friends' | 'cart' | 'flat' | 'cube' | 'bell' | 'book';

const ICONS: Record<CzIcon, string> = {
  hat:
    sil('<circle cx="15" cy="20" r="9"/><circle cx="33" cy="20" r="9"/><circle cx="24" cy="15" r="11"/><rect x="12" y="24" width="24" height="16" rx="3"/>', 'white') +
    sil('<rect x="12" y="34" width="24" height="7" rx="2"/>', 'pink', 2) +
    hl('<ellipse cx="20" cy="11" rx="4" ry="2.5"/>', 0.8),
  knife:
    sil('<path d="M8 32L32 8Q38 6 37 13L18 34Z"/>', 'silver') + sil('<rect x="6" y="31" width="9" height="15" rx="3" transform="rotate(45 10 38)"/>', 'orange', 2.5) + hl('<path d="M14 28L31 11L33 12L16 30Z"/>', 0.7),
  pot:
    sil('<rect x="8" y="18" width="32" height="22" rx="7"/>', 'red') +
    sil('<rect x="4" y="20" width="6" height="5" rx="2"/><rect x="38" y="20" width="6" height="5" rx="2"/>', 'red', 2) +
    sil('<rect x="10" y="13" width="28" height="6" rx="3"/>', 'silver', 2) +
    hl('<rect x="12" y="22" width="5" height="12" rx="2.5"/>', 0.55) +
    '<path d="M18 9q-3-3 0-6M26 9q-3-3 0-6" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".9"/>',
  hand:
    sil('<path d="M14 24V12a3 3 0 0 1 6 0v9V8a3 3 0 0 1 6 0v13V10a3 3 0 0 1 6 0v13v-6a3 3 0 0 1 6 0v12q0 13-13 13h-3Q12 42 8 32l-3-7a3 3 0 0 1 5-3Z"/>', 'gold', 2.6) +
    hl('<ellipse cx="22" cy="28" rx="6" ry="3"/>', 0.5),
  plate:
    sil('<ellipse cx="24" cy="28" rx="20" ry="13"/>', 'white') +
    '<ellipse cx="24" cy="27" rx="13" ry="8" fill="none" stroke="#c8b9f5" stroke-width="2"/>' +
    sil('<circle cx="20" cy="24" r="5"/>', 'red', 2) +
    sil('<path d="M26 22q6-6 10 0q-4 6-10 0Z"/>', 'green', 2),
  ext:
    sil('<rect x="14" y="14" width="18" height="30" rx="8"/>', 'red') +
    sil('<rect x="18" y="7" width="10" height="8" rx="2"/>', 'silver', 2) +
    sil('<path d="M27 9H38l3 4H30Z"/>', 'silver', 2) +
    ink('<rect x="17" y="24" width="12" height="7" rx="2" opacity=".35"/>') +
    hl('<rect x="17" y="17" width="4" height="20" rx="2"/>', 0.55),
  robot:
    sil('<rect x="9" y="14" width="30" height="24" rx="9"/>', 'cyan') +
    sil('<rect x="22" y="5" width="4" height="10" rx="2"/><circle cx="24" cy="5" r="3"/>', 'gold', 2) +
    ink('<circle cx="18" cy="25" r="3.5"/><circle cx="30" cy="25" r="3.5"/><rect x="18" y="31" width="12" height="3" rx="1.5"/>') +
    hl('<ellipse cx="16" cy="18" rx="4" ry="2"/>', 0.7),
  friends:
    sil('<circle cx="16" cy="18" r="8"/><path d="M3 40q0-12 13-12t13 12Z"/>', 'pink', 2.6) +
    sil('<circle cx="33" cy="16" r="8"/><path d="M20 40q0-13 13-13t13 13Z"/>', 'violet', 2.6) +
    hl('<ellipse cx="30" cy="12" rx="3" ry="1.8"/>', 0.7),
  cart:
    sil('<path d="M4 8h7l4 22h24l4-16H14"/>', 'gold', 2.6) +
    sil('<circle cx="18" cy="38" r="4"/><circle cx="35" cy="38" r="4"/>', 'violet', 2) +
    hl('<rect x="17" y="17" width="20" height="3" rx="1.5"/>', 0.6),
  flat: sil('<rect x="5" y="9" width="38" height="30" rx="6"/>', 'green') + sil('<rect x="11" y="15" width="12" height="9" rx="2"/>', 'gold', 2) + sil('<rect x="26" y="25" width="11" height="9" rx="2"/>', 'pink', 2) + hl('<rect x="8" y="11" width="16" height="2.5" rx="1.2"/>', 0.7),
  cube:
    sil('<path d="M24 4L42 14V34L24 44L6 34V14Z"/>', 'violet') +
    '<path d="M24 24L42 14M24 24L6 14M24 24V44" stroke="#2a0b5c" stroke-width="2.5" fill="none" stroke-linejoin="round"/>' +
    '<path d="M24 5.5L40.5 14.5L24 23.5L7.5 14.5Z" fill="#fff" opacity=".35"/>',
  bell:
    sil('<path d="M8 34q0-18 16-18t16 18Z"/><rect x="4" y="34" width="40" height="6" rx="3"/>', 'gold') +
    sil('<circle cx="24" cy="12" r="4"/>', 'gold', 2) +
    hl('<path d="M13 31q1-9 8-11" stroke="#fff" stroke-width="3" fill="none"/>', 0.7),
  book:
    sil('<rect x="8" y="6" width="30" height="36" rx="4"/>', 'orange') +
    sil('<rect x="34" y="10" width="6" height="30" rx="2"/>', 'white', 2) +
    sil('<circle cx="22" cy="22" r="7"/>', 'white', 2) +
    ink('<rect x="17" y="32" width="12" height="3" rx="1.5"/>'),
};

export function czIcon(name: CzIcon, size = 24): string {
  if (typeof document !== 'undefined') ensureIconDefs();
  return `<svg class="ico cz-ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
