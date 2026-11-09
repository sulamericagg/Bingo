/* ============================================================
 *  Ícones do Passe — mesmo estilo de ui/icons.ts (viewBox 48, contorno
 *  tinta roxo-escuro, gradientes compartilhados "bo-*", brilho branco).
 *  Ficam aqui para não conflitar com ui/icons.ts; o lead pode migrar.
 * ============================================================ */
import { ensureIconDefs } from '../ui/icons';

const INK = '#2a0b5c';
type G = 'gold' | 'gem' | 'pink' | 'violet' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'silver';
const sil = (s: string, g: G, w = 3) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${s}</g><g fill="url(#bo-${g})">${s}</g>`;
const hl = (s: string, o = 0.55) => `<g fill="#fff" opacity="${o}">${s}</g>`;
const ink = (s: string) => `<g fill="${INK}">${s}</g>`;
const line = (d: string, c: string, w = 5) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export type PassIcon = 'p-pass' | 'p-eyes' | 'p-mouth' | 'p-aura' | 'p-emote' | 'p-frame' | 'p-banner' | 'p-paw' | 'p-left' | 'p-right' | 'p-history' | 'p-skip' | 'p-club' | 'p-music';

const ICONS: Record<PassIcon, string> = {
  'p-pass':
    sil('<path d="M10 30L6 44L14 40L19 46L22 33Z"/><path d="M38 30L42 44L34 40L29 46L26 33Z"/>', 'red', 2.5) +
    sil('<path d="M24 3L29.5 14L41.5 15.5L32.5 24L35 36L24 30L13 36L15.5 24L6.5 15.5L18.5 14Z"/>', 'gold') +
    hl('<path d="M24 9L27 15.5L20 16Z"/>', 0.7) +
    ink('<circle cx="20" cy="21" r="2"/><circle cx="28" cy="21" r="2"/>') +
    `<path d="M20.5 26Q24 29 27.5 26" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  'p-eyes':
    sil('<ellipse cx="15" cy="24" rx="10" ry="12"/><ellipse cx="33" cy="24" rx="10" ry="12"/>', 'white') +
    sil('<circle cx="17" cy="26" r="6"/><circle cx="35" cy="26" r="6"/>', 'gem', 1.5) +
    ink('<circle cx="17" cy="26" r="2.6"/><circle cx="35" cy="26" r="2.6"/>') +
    hl('<circle cx="14.5" cy="22.5" r="2.2"/><circle cx="32.5" cy="22.5" r="2.2"/>', 0.95),
  'p-mouth':
    sil('<path d="M7 18Q24 20 41 18Q40 40 24 40Q8 40 7 18Z"/>', 'red') +
    sil('<path d="M15 31Q24 26 33 31Q30 38 24 38Q18 38 15 31Z"/>', 'pink', 1.5) +
    hl('<rect x="13" y="19.5" width="8" height="5" rx="1.5"/><rect x="27" y="19.5" width="8" height="5" rx="1.5"/>', 0.95),
  'p-aura':
    `<ellipse cx="24" cy="26" rx="19" ry="7" fill="none" stroke="${INK}" stroke-width="8"/><ellipse cx="24" cy="26" rx="19" ry="7" fill="none" stroke="#5ef0ff" stroke-width="3.5"/>` +
    sil('<circle cx="24" cy="24" r="10"/>', 'violet') +
    sil('<path d="M40 6L42 11L47 13L42 15L40 20L38 15L33 13L38 11Z"/><path d="M8 32L9.5 35.5L13 37L9.5 38.5L8 42L6.5 38.5L3 37L6.5 35.5Z"/>', 'gold', 1.5) +
    hl('<circle cx="20.5" cy="20.5" r="3"/>', 0.7),
  'p-emote':
    sil('<path d="M8 6H40Q45 6 45 11V29Q45 34 40 34H22L12 43L14 34H8Q3 34 3 29V11Q3 6 8 6Z"/>', 'white') +
    sil('<path d="M24 10L27 17L34 17.5L28.5 22L30.5 29L24 25L17.5 29L19.5 22L14 17.5L21 17Z"/>', 'pink', 1.5) +
    hl('<rect x="8" y="9" width="10" height="2.5" rx="1.25"/>', 0.8),
  'p-frame':
    sil('<circle cx="24" cy="24" r="20"/>', 'gold') +
    sil('<circle cx="24" cy="24" r="12.5"/>', 'violet', 2) +
    sil('<circle cx="24" cy="22" r="4.5"/><path d="M15.5 33Q24 24 32.5 33Q28 36 24 36Q20 36 15.5 33Z"/>', 'white', 1) +
    hl('<path d="M10 16Q13 9 20 6.5" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>', 0.8),
  'p-banner':
    sil('<path d="M4 10H44L38 20L44 30H4L10 20Z"/>', 'cyan') +
    sil('<path d="M14 15L16 19.5L21 20L17 23L18.5 28L14 25L9.5 28L11 23L7 20L12 19.5Z" transform="translate(10 -2)"/>', 'gold', 1.2) +
    hl('<rect x="8" y="12" width="20" height="2.4" rx="1.2"/>', 0.7) +
    line('M6 38H42', '#ff5cc8', 3),
  'p-paw':
    sil('<ellipse cx="24" cy="31" rx="11" ry="9.5"/>', 'pink') +
    sil('<ellipse cx="11" cy="20" rx="4.6" ry="5.6"/><ellipse cx="19" cy="12" rx="4.6" ry="5.6"/><ellipse cx="29" cy="12" rx="4.6" ry="5.6"/><ellipse cx="37" cy="20" rx="4.6" ry="5.6"/>', 'pink', 2.5) +
    hl('<ellipse cx="20" cy="28" rx="3.5" ry="2"/>', 0.7),
  'p-left': line('M30 8L14 24L30 40', '#ffffff', 6),
  'p-right': line('M18 8L34 24L18 40', '#ffffff', 6),
  'p-history':
    sil('<circle cx="24" cy="25" r="18"/>', 'silver') +
    line('M24 15V25L31 30', '#7b3dff', 3.5) +
    sil('<path d="M4 9L12 7L10 15Z"/>', 'violet', 1.5) +
    hl('<path d="M12 15Q16 9 23 8" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>', 0.7),
  'p-skip':
    sil('<path d="M5 10L22 24L5 38Z"/><path d="M24 10L41 24L24 38Z"/>', 'cyan', 2.5) + hl('<path d="M9 16L14 20L9 21Z"/>', 0.7),
  'p-club':
    sil('<path d="M6 16L14 24L24 9L34 24L42 16L38 38H10Z"/>', 'violet') +
    sil('<rect x="9" y="36" width="30" height="7" rx="3"/>', 'gold', 2) +
    sil('<circle cx="24" cy="27" r="5"/>', 'gem', 1.5) +
    hl('<path d="M12 22L15 27L11 30Z"/>', 0.6),
  'p-music':
    sil('<rect x="15" y="11" width="4.5" height="24" rx="1"/><rect x="38" y="6" width="4.5" height="24" rx="1"/><path d="M15 11L42.5 5V12L15 18Z"/>', 'violet', 2.5) +
    sil('<ellipse cx="12" cy="35" rx="7" ry="5.5"/><ellipse cx="36" cy="30" rx="7" ry="5.5"/>', 'pink') +
    hl('<ellipse cx="10" cy="33" rx="2.5" ry="1.4"/>', 0.8),
};

export function passIcon(name: PassIcon, size = 24): string {
  ensureIconDefs();
  return `<svg class="ico ico-${name}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
