/**
 * Ícones próprios do Bloop Orbit — silhuetas desenhadas à mão em SVG inline.
 * Sem fontes/bibliotecas de terceiros.
 *
 * Estilo: formas gordinhas e arredondadas, contorno "tinta" roxo-escuro (INK),
 * preenchimento com gradiente vertical suave e brilho interno branco.
 * Todos desenhados num viewBox 48×48.
 *
 * Uso:
 *   el.innerHTML = icon('gem', { size: 24 });
 *   <span data-icon="gift" data-size="40"></span>  +  hydrateIcons(document)
 *   <i class="coin"></i> / <i class="gem"></i>      (moedas inline via CSS, ver installIconCss)
 */

export type IconName =
  | 'coin'
  | 'coins'
  | 'gem'
  | 'gem-pile'
  | 'gem-heap'
  | 'gem-chest'
  | 'chest'
  | 'crown'
  | 'trophy'
  | 'star'
  | 'bag'
  | 'target'
  | 'gift'
  | 'video'
  | 'play'
  | 'pause'
  | 'home'
  | 'megaphone'
  | 'gear'
  | 'sound'
  | 'music'
  | 'vibration'
  | 'bolt'
  | 'close'
  | 'check'
  | 'lock'
  | 'refresh'
  | 'no-ads'
  | 'rocket'
  | 'shield'
  | 'magnet'
  | 'planet'
  | 'hand-tap'
  | 'ticket'
  | 'mail'
  | 'calendar'
  | 'fire'
  | 'sparkle'
  | 'warning'
  | 'asteroid'
  | 'clock'
  | 'user'
  | 'party'
  | 'comet'
  | 'arrow-up'
  | 'pencil'
  | 'link'
  | 'heart'
  | 'tag'
  | 'cloud-off'
  | 'car';

export interface IconOpts {
  /** Lado em px. Sem valor, usa 1.25em (acompanha o texto). */
  size?: number;
  class?: string;
  /** Texto acessível; sem ele o ícone é decorativo (aria-hidden). */
  title?: string;
}

/* ============================== paleta ============================== */

const INK = '#2a0b5c';

type Grad = 'gold' | 'gem' | 'pink' | 'violet' | 'cyan' | 'green' | 'red' | 'white' | 'orange' | 'rock' | 'skin' | 'silver';

const GRADS: Record<Grad, [string, string, string]> = {
  gold: ['#fff6b0', '#ffcf2e', '#e98f00'],
  gem: ['#9ffcff', '#3fb8ff', '#7b3dff'],
  pink: ['#ffc7ee', '#ff5cc8', '#c9268a'],
  violet: ['#d2bdff', '#8a5cff', '#5326cc'],
  cyan: ['#e0feff', '#5ef0ff', '#2a9be0'],
  green: ['#c9ffdc', '#3ee07a', '#17994a'],
  red: ['#ffbcc7', '#ff4f6a', '#c21d3c'],
  white: ['#ffffff', '#f4efff', '#c8b9f5'],
  orange: ['#ffe680', '#ff9a2e', '#ff3c7a'],
  rock: ['#d9c6f5', '#9a82c4', '#5a4585'],
  skin: ['#ffffff', '#ffe3f4', '#f3a9d6'],
  silver: ['#ffffff', '#dcd6f0', '#9b92bf'],
};

const PRE = 'bo-';

function defsMarkup(): string {
  return Object.entries(GRADS)
    .map(
      ([k, [a, b, c]]) =>
        `<linearGradient id="${PRE}${k}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`,
    )
    .join('');
}

/* ============================== helpers de desenho ============================== */

/** Silhueta: contorno de tinta unificado + preenchimento em gradiente (formas sem fill/stroke próprios). */
const sil = (shapes: string, g: Grad, w = 3): string =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
  `<g fill="url(#${PRE}${g})">${shapes}</g>`;

/** Brilho interno branco. */
const hl = (shapes: string, o = 0.5): string => `<g fill="#fff" opacity="${o}">${shapes}</g>`;

/** Sombra interna (tinta translúcida). */
const shade = (shapes: string, o = 0.18): string => `<g fill="${INK}" opacity="${o}">${shapes}</g>`;

/** Detalhe sólido em tinta. */
const ink = (shapes: string): string => `<g fill="${INK}">${shapes}</g>`;

/** Traço grosso com contorno (cor sólida — gradiente em linha reta não renderiza). */
const line = (d: string, color: string, w = 5, cap = 'round'): string =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 6}" stroke-linecap="${cap}" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;

const n = (v: number) => Math.round(v * 100) / 100;

function starPts(cx: number, cy: number, R: number, r: number, k = 5, rot = -90): string {
  const out: string[] = [];
  for (let i = 0; i < k * 2; i++) {
    const a = ((rot + (i * 180) / k) * Math.PI) / 180;
    const rr = i % 2 ? r : R;
    out.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  return out.join(' ');
}

/** Brilho em losango de 4 pontas (estrelinha). */
const twinkle = (cx: number, cy: number, s: number, color = '#fff'): string =>
  `<path d="M${cx} ${cy - s}Q${n(cx + s * 0.18)} ${n(cy - s * 0.18)} ${cx + s} ${cy}Q${n(cx + s * 0.18)} ${n(cy + s * 0.18)} ${cx} ${cy + s}Q${n(cx - s * 0.18)} ${n(cy + s * 0.18)} ${cx - s} ${cy}Q${n(cx - s * 0.18)} ${n(cy - s * 0.18)} ${cx} ${cy - s}Z" fill="${color}"/>`;

const at = (cx: number, cy: number, k: number, body: string): string =>
  `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(k)})">${body}</g>`;

/** Moeda — igual ao sprite do jogo (buildCoin): anel dourado, miolo âmbar, estrela creme. Centro 0,0 raio 19. */
const COIN =
  sil('<circle r="19"/>', 'gold') +
  '<circle r="13" fill="#ffb400" stroke="#d98a00" stroke-width="2"/>' +
  `<polygon points="${starPts(0, 0.6, 9, 4)}" fill="#fff3a0" stroke="#fff3a0" stroke-width="1.6" stroke-linejoin="round"/>` +
  '<ellipse cx="-9" cy="-10" rx="5.5" ry="2.6" transform="rotate(-40 -9 -10)" fill="#fff" opacity=".8"/>';

/** Gema — igual ao sprite do jogo (buildGem): pentágono lapidado ciano→violeta. Centro 0,0 raio 19. */
const GEM_P = '-10.45,-19 10.45,-19 19,-5.7 0,19 -19,-5.7';
const GEM =
  sil(`<polygon points="${GEM_P}"/>`, 'gem') +
  '<polygon points="-10.45,-19 10.45,-19 0,-5.7" fill="#fff" opacity=".14"/>' +
  '<polygon points="-10.45,-19 0,-5.7 -19,-5.7" fill="#fff" opacity=".6"/>' +
  '<polygon points="10.45,-19 0,-5.7 19,-5.7" fill="#fff" opacity=".28"/>' +
  '<polygon points="0,-5.7 19,-5.7 0,19" fill="#2a0b8a" opacity=".2"/>';

const coinAt = (cx: number, cy: number, r: number) => at(cx, cy, r / 19, COIN);
const gemAt = (cx: number, cy: number, r: number) => at(cx, cy, r / 19, GEM);

/** Baú (corpo + aro + faixas + fechadura) — tampa fica a cargo de quem chama. */
const CHEST_FRONT =
  sil('<rect x="6" y="21" width="36" height="21" rx="4"/>', 'violet') +
  shade('<rect x="6" y="34" width="36" height="8" rx="4"/>', 0.16) +
  sil('<rect x="11.5" y="23" width="5" height="19"/><rect x="31.5" y="23" width="5" height="19"/>', 'gold', 1.5) +
  sil('<rect x="4.5" y="18.5" width="39" height="5.5" rx="2.75"/>', 'gold', 2) +
  sil('<rect x="19" y="17" width="10" height="12.5" rx="3"/>', 'gold', 2) +
  ink('<circle cx="24" cy="22.2" r="1.9"/><rect x="23.1" y="22.5" width="1.8" height="4" rx=".9"/>') +
  hl('<rect x="8" y="19.6" width="16" height="1.6" rx=".8"/>', 0.6);

/* ============================== ícones ============================== */

const ICONS: Record<IconName, string> = {
  coin: at(24, 24, 1, COIN),

  coins:
    [38, 31, 24]
      .map(
        (y) =>
          sil(`<path d="M5 ${y}v5a12 5 0 0 0 24 0v-5z"/><ellipse cx="17" cy="${y}" rx="12" ry="5"/>`, 'gold', 2.5) +
          `<ellipse cx="17" cy="${y}" rx="7.5" ry="2.6" fill="#ffb400"/>` +
          hl(`<rect x="8" y="${y + 3}" width="2.5" height="4" rx="1.2"/>`, 0.5),
      )
      .join('') + coinAt(33, 22, 12.5),

  gem: at(24, 25, 1, GEM) + twinkle(40, 8, 5),

  'gem-pile': gemAt(13.5, 22, 10) + gemAt(34.5, 22, 10) + gemAt(24, 29, 14) + twinkle(41, 7, 4.5) + twinkle(6, 10, 3),

  'gem-heap':
    gemAt(24, 12, 9) +
    gemAt(16, 24, 9) +
    gemAt(32, 24, 9) +
    gemAt(9, 36, 8.5) +
    gemAt(24, 36, 9.5) +
    gemAt(39, 36, 8.5) +
    twinkle(41, 9, 5) +
    twinkle(7, 15, 3.5),

  'gem-chest':
    sil('<path d="M8 21L10.5 6.5Q11.2 3 15 3H33Q36.8 3 37.5 6.5L40 21Z"/>', 'violet') +
    shade('<path d="M8 21L10.5 6.5Q11.2 3 15 3H33Q36.8 3 37.5 6.5L40 21Z"/>', 0.28) +
    ink('<rect x="8" y="17" width="32" height="5"/>') +
    gemAt(15, 16, 7.5) +
    gemAt(33, 16, 7.5) +
    gemAt(24, 13, 9) +
    CHEST_FRONT +
    twinkle(44, 6, 4) +
    twinkle(4, 9, 3),

  chest:
    sil('<path d="M6 21V16Q6 8 14 8H34Q42 8 42 16V21Z"/>', 'violet') +
    sil('<rect x="11.5" y="10" width="5" height="10"/><rect x="31.5" y="10" width="5" height="10"/>', 'gold', 1.5) +
    hl('<ellipse cx="24" cy="12" rx="6" ry="1.8"/>', 0.45) +
    CHEST_FRONT,

  crown:
    sil(
      '<path d="M9 34L6 14L16.5 23L24 9L31.5 23L42 14L39 34Z"/><circle cx="6" cy="13" r="3.4"/><circle cx="24" cy="8" r="3.6"/><circle cx="42" cy="13" r="3.4"/>',
      'gold',
    ) +
    sil('<rect x="8" y="31" width="32" height="9" rx="3.5"/>', 'gold') +
    sil('<circle cx="24" cy="35.5" r="3.2"/>', 'pink', 1.5) +
    sil('<circle cx="15" cy="35.5" r="2.2"/><circle cx="33" cy="35.5" r="2.2"/>', 'cyan', 1.5) +
    hl('<path d="M10 30L8.6 18.5L13 22.5Z"/><circle cx="23" cy="6.8" r="1.3"/>', 0.55),

  trophy:
    line('M14 12H8.5Q6.5 12 6.5 15Q6.5 22 15 24.5M34 12H39.5Q41.5 12 41.5 15Q41.5 22 33 24.5', '#ffcf2e', 3.5) +
    sil('<path d="M13 6H35V17Q35 30 24 30Q13 30 13 17Z"/><rect x="20.5" y="28" width="7" height="8"/>', 'gold') +
    sil('<rect x="13" y="35" width="22" height="8" rx="3"/>', 'violet') +
    `<polygon points="${starPts(24, 17, 6, 2.6)}" fill="#fff6c8" stroke="#fff6c8" stroke-width="1.2" stroke-linejoin="round"/>` +
    hl('<path d="M16 9H19V19Q19 24 21 26.5Q16 24.5 16 17Z"/>', 0.5) +
    hl('<rect x="16" y="37" width="8" height="1.8" rx=".9"/>', 0.45),

  star:
    sil(`<polygon points="${starPts(24, 26, 21, 10)}"/>`, 'gold') +
    `<polygon points="${starPts(24, 27, 11, 5.2)}" fill="#fff3a0" opacity=".55"/>` +
    hl('<ellipse cx="17" cy="20" rx="4" ry="2" transform="rotate(-30 17 20)"/>', 0.8),

  bag:
    line('M17 18V13Q17 6 24 6Q31 6 31 13V18', '#ffe0f6', 3.5) +
    sil('<path d="M9 17H39L37.5 39Q37.3 43 33.5 43H14.5Q10.7 43 10.5 39Z"/>', 'pink') +
    shade('<path d="M10.2 35H37.8L37.5 39Q37.3 43 33.5 43H14.5Q10.7 43 10.5 39Z"/>', 0.14) +
    sil('<rect x="7.5" y="15" width="33" height="6" rx="3"/>', 'violet', 2) +
    `<polygon points="${starPts(24, 31, 7.5, 3.4)}" fill="#ffe680" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    ink('<circle cx="17" cy="18" r="1.6"/><circle cx="31" cy="18" r="1.6"/>') +
    hl('<path d="M13 24H16L15.2 36H13.6Z"/>', 0.45),

  target:
    sil('<circle cx="22" cy="26" r="19"/>', 'red') +
    '<circle cx="22" cy="26" r="13" fill="#fff"/>' +
    '<circle cx="22" cy="26" r="7.5" fill="#ff4f6a"/>' +
    '<circle cx="22" cy="26" r="2.6" fill="#fff"/>' +
    hl('<ellipse cx="13" cy="14" rx="4" ry="2" transform="rotate(-35 13 14)"/>', 0.7) +
    line('M22.5 25.5L39 9', '#8a5cff', 3) +
    sil('<path d="M36 6L41 3L42 8L45 12L39 13.5L36 11Z"/>', 'cyan', 2),

  gift:
    sil('<rect x="8" y="22" width="32" height="21" rx="3.5"/>', 'pink') +
    shade('<rect x="8" y="35" width="32" height="8" rx="3.5"/>', 0.14) +
    sil('<path d="M24 16C19 4 7 6 12 15ZM24 16C29 4 41 6 36 15Z"/>', 'gold', 2.5) +
    sil('<rect x="6" y="15" width="36" height="9" rx="3.5"/>', 'pink') +
    '<rect x="21" y="15" width="6" height="28" fill="#ffcf2e"/>' +
    `<path d="M21 15V43M27 15V43" stroke="${INK}" stroke-width="1.6"/>` +
    sil('<circle cx="24" cy="16" r="3.6"/>', 'gold', 2) +
    hl('<rect x="9" y="17" width="9" height="2" rx="1"/><rect x="11" y="26" width="2.4" height="9" rx="1.2"/>', 0.55),

  video:
    `<g transform="rotate(-14 7 17)">` +
    sil('<rect x="6" y="9" width="36" height="8" rx="2.5"/>', 'white', 2.5) +
    ink('<path d="M12 9H17L13 17H8ZM23 9H28L24 17H19ZM34 9H39L35 17H30Z"/>') +
    `</g>` +
    sil('<rect x="6" y="18" width="36" height="25" rx="5"/>', 'violet') +
    `<path d="M20 24.5L31 30.5L20 36.5Z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>` +
    hl('<rect x="9" y="21" width="12" height="2" rx="1"/>', 0.5),

  play:
    sil('<path d="M14 9L39 24L14 39Z"/>', 'green', 3.5) +
    hl('<path d="M17.5 15L22 17.6L17.5 25Z"/>', 0.6),

  pause:
    sil('<rect x="11" y="8" width="10" height="32" rx="4"/><rect x="27" y="8" width="10" height="32" rx="4"/>', 'white') +
    hl('<rect x="13.5" y="11" width="2.4" height="10" rx="1.2"/><rect x="29.5" y="11" width="2.4" height="10" rx="1.2"/>', 0.9),

  home:
    sil('<rect x="32" y="8" width="6" height="11" rx="1.5"/>', 'pink', 2.5) +
    sil('<rect x="10" y="21" width="28" height="22" rx="3.5"/>', 'white') +
    sil('<rect x="19.5" y="28" width="9" height="15" rx="4.5"/>', 'violet', 2) +
    sil('<path d="M4 25L24 7L44 25Z"/>', 'pink', 3) +
    hl('<path d="M9.5 22L24 9.5L22 13.5L12 22.5Z"/>', 0.5) +
    '<circle cx="26.3" cy="36" r="1.2" fill="#ffe680"/>',

  megaphone:
    line('M37 17Q41 24 37 31M42 12Q48.5 24 42 36', '#5ef0ff', 3) +
    sil('<rect x="11" y="27" width="7" height="13" rx="3" transform="rotate(-14 14 33)"/>', 'violet', 2.5) +
    sil('<path d="M8 18L31 7V41L8 30Z"/>', 'cyan') +
    sil('<rect x="4" y="17" width="8" height="14" rx="3"/>', 'pink', 2.5) +
    sil('<ellipse cx="31" cy="24" rx="4.5" ry="17"/>', 'pink', 2.5) +
    hl('<path d="M12 18.5L27 11.5V15L12 21.5Z"/>', 0.55),

  gear: (() => {
    const pts: string[] = [];
    const teeth = 8;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const w = 0.2;
      for (const [da, r] of [[-w * 1.35, 15.5], [-w * 0.75, 21], [w * 0.75, 21], [w * 1.35, 15.5]] as const) {
        pts.push(`${n(24 + Math.cos(a + da) * r)},${n(24 + Math.sin(a + da) * r)}`);
      }
    }
    return (
      sil(`<polygon points="${pts.join(' ')}"/>`, 'silver', 3) +
      `<circle cx="24" cy="24" r="12" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>` +
      sil('<circle cx="24" cy="24" r="6.5"/>', 'violet', 2.5) +
      hl('<ellipse cx="15" cy="13.5" rx="3.5" ry="1.8" transform="rotate(-40 15 13.5)"/>', 0.9)
    );
  })(),

  sound:
    line('M31 18Q35 24 31 30M36.5 12.5Q44 24 36.5 35.5', '#5ef0ff', 3.5) +
    sil('<path d="M6 18H14L26 8V40L14 30H6Z"/>', 'white') +
    shade('<rect x="6" y="18" width="8" height="12"/>', 0.12) +
    hl('<path d="M16 19L23 13.5V18L16 22Z"/>', 0.9),

  music:
    sil(
      '<path d="M17 11L40 5.5V12L17 17.5Z"/><rect x="15" y="12" width="4.5" height="24"/><rect x="35.5" y="7" width="4.5" height="24"/>' +
        '<ellipse cx="12" cy="36" rx="7" ry="5.5" transform="rotate(-20 12 36)"/><ellipse cx="32.5" cy="31" rx="7" ry="5.5" transform="rotate(-20 32.5 31)"/>',
      'pink',
    ) +
    hl(
      '<ellipse cx="9.5" cy="34" rx="2.5" ry="1.3" transform="rotate(-25 9.5 34)"/><ellipse cx="30" cy="29" rx="2.5" ry="1.3" transform="rotate(-25 30 29)"/><path d="M19 12.5L37 8.2V9.6L19 14Z"/>',
      0.7,
    ),

  vibration:
    line('M9 13L5 17.5L9 22L5 26.5L9 31L5 35.5M39 13L43 17.5L39 22L43 26.5L39 31L43 35.5', '#ff5cc8', 2.5) +
    sil('<rect x="14" y="5" width="20" height="38" rx="5.5"/>', 'violet') +
    sil('<rect x="17.5" y="10" width="13" height="23" rx="2.5"/>', 'cyan', 1.5) +
    '<circle cx="24" cy="37.8" r="2" fill="#fff"/>' +
    hl('<path d="M19.5 12H23L19.5 20Z"/>', 0.7),

  bolt:
    sil('<path d="M28 3L9 27H22L18.5 45L39 19H26Z"/>', 'gold', 3) +
    hl('<path d="M25 8L14 24H18Z"/>', 0.65),

  close: line('M14 14L34 34M34 14L14 34', '#fff', 6.5),

  check: line('M10 25L20 35L39 13', '#3ee07a', 7) + `<path d="M11.5 24L19 31.5" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>`,

  lock:
    line('M15 22V15Q15 7 24 7Q33 7 33 15V22', '#e8e2ff', 4) +
    sil('<rect x="8.5" y="20" width="31" height="23" rx="6"/>', 'gold') +
    ink('<circle cx="24" cy="29.5" r="3.3"/><path d="M22.4 30.5L21.4 37.5H26.6L25.6 30.5Z"/>') +
    hl('<rect x="11.5" y="23" width="10" height="2.2" rx="1.1"/>', 0.65),

  refresh:
    line('M38 19A15 15 0 0 0 12 15', '#5ef0ff', 5) +
    sil('<path d="M5 13.5L19 13.5L11 23Z"/>', 'cyan', 2.5) +
    line('M10 29A15 15 0 0 0 36 33', '#ff5cc8', 5) +
    sil('<path d="M29 34.5L43 34.5L37 25Z"/>', 'pink', 2.5),

  'no-ads':
    sil('<rect x="7" y="12" width="34" height="25" rx="5.5"/>', 'white') +
    `<path d="M13.5 31.5L18 18.5L22.5 31.5M15 27H21M26.5 18.5V31.5H29Q35 31.5 35 25Q35 18.5 29 18.5Z" fill="none" stroke="#8a5cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="24" cy="24.5" r="18.5" fill="none" stroke="${INK}" stroke-width="10"/>` +
    `<path d="M11 11.5L37 37.5" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    `<circle cx="24" cy="24.5" r="18.5" fill="none" stroke="#ff4f6a" stroke-width="4.5"/>` +
    `<path d="M11 11.5L37 37.5" stroke="#ff4f6a" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M10.5 18A15 15 0 0 1 17.5 10.5" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>`,

  rocket:
    `<g transform="rotate(40 24 24)">` +
    sil('<path d="M18 34Q24 50 30 34Z"/>', 'orange', 2.5) +
    '<path d="M21 34Q24 43 27 34Z" fill="#ffe680"/>' +
    sil('<path d="M16.5 24L9 33L10 40L17 35Z"/><path d="M31.5 24L39 33L38 40L31 35Z"/>', 'violet', 2.5) +
    sil('<path d="M24 3C33 10 35 22 32 35H16C13 22 15 10 24 3Z"/>', 'white') +
    '<path d="M24 3C28.6 6.6 30.8 10.8 31.6 14H16.4C17.2 10.8 19.4 6.6 24 3Z" fill="#ff5cc8"/>' +
    `<path d="M16.4 14H31.6" stroke="${INK}" stroke-width="2"/>` +
    sil('<circle cx="24" cy="22.5" r="5"/>', 'cyan', 2) +
    hl('<circle cx="22.4" cy="20.8" r="1.6"/><path d="M19 17Q18 24 19 31H20.5Q19.8 24 20.5 17Z"/>', 0.8) +
    `</g>`,

  shield:
    sil('<path d="M24 4L41 10.5V22C41 33 34 40.5 24 44.5C14 40.5 7 33 7 22V10.5Z"/>', 'cyan') +
    '<path d="M24 8.5L37 13.5V22C37 30.5 31.8 36.5 24 40Z" fill="#2a3fd0" opacity=".2"/>' +
    `<polygon points="${starPts(24, 24, 9, 4)}" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>` +
    hl('<path d="M11 13.5L18 11V14.5L11 17Z"/>', 0.7),

  magnet:
    line('M13 12V26A11 11 0 0 0 35 26V12', '#ff4f6a', 10, 'butt') +
    sil('<rect x="7" y="5" width="12" height="9" rx="2"/><rect x="29" y="5" width="12" height="9" rx="2"/>', 'silver', 2.5) +
    `<path d="M10.5 18V26A13 13 0 0 0 14 35" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>` +
    twinkle(44, 22, 4, '#5ef0ff') +
    twinkle(4, 23, 3, '#5ef0ff'),

  planet:
    `<g transform="rotate(-20 24 24)"><ellipse cx="24" cy="24" rx="22" ry="7" fill="none" stroke="${INK}" stroke-width="9.5"/><ellipse cx="24" cy="24" rx="22" ry="7" fill="none" stroke="#ff8fd8" stroke-width="3.5"/></g>` +
    sil('<circle cx="24" cy="24" r="13.5"/>', 'violet') +
    '<path d="M11.5 27Q24 22 36.5 27Q35.7 30 34.5 32Q24 27 13.5 32Q12.2 29.8 11.5 27Z" fill="#c4a8ff" opacity=".55"/>' +
    `<g transform="rotate(-20 24 24)"><path d="M2 24A22 7 0 0 0 46 24" fill="none" stroke="${INK}" stroke-width="9.5" stroke-linecap="round"/><path d="M2 24A22 7 0 0 0 46 24" fill="none" stroke="#ff8fd8" stroke-width="3.5" stroke-linecap="round"/></g>` +
    hl('<ellipse cx="18" cy="16" rx="4" ry="2.2" transform="rotate(-35 18 16)"/>', 0.75),

  'hand-tap':
    `<path d="M13 7.5L16.5 10.5M23.5 2.5V6.5M34 7.5L30.5 10.5" stroke="#5ef0ff" stroke-width="3" stroke-linecap="round"/>` +
    sil(
      '<rect x="19" y="10" width="9" height="24" rx="4.5"/><rect x="27.2" y="22" width="7.6" height="11" rx="3.8"/><rect x="33.6" y="24.5" width="7.4" height="10" rx="3.7"/>' +
        '<path d="M13 28H39Q41 28 41 31V37Q41 46 31 46H22Q13 46 13 38Z"/><ellipse cx="13.5" cy="33" rx="4.6" ry="7.5" transform="rotate(-35 13.5 33)"/>',
      'skin',
    ) +
    `<path d="M27.6 27V31M34 29V32.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>` +
    '<rect x="20.8" y="11.5" width="5.4" height="4" rx="2" fill="#ffc2e6"/>' +
    hl('<rect x="20.5" y="17" width="2.2" height="12" rx="1.1"/>', 0.9),

  ticket:
    `<g transform="rotate(-14 24 24)">` +
    sil('<path d="M5 14H43V20.5A3.6 3.6 0 0 0 43 27.5V34H5V27.5A3.6 3.6 0 0 0 5 20.5Z"/>', 'gold') +
    `<path d="M16 16V32" stroke="${INK}" stroke-width="2" stroke-dasharray="2.6 2.6" stroke-linecap="round"/>` +
    `<polygon points="${starPts(30, 24.5, 7, 3)}" fill="#ff5cc8" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
    hl('<rect x="8" y="16.5" width="5" height="2" rx="1"/><rect x="20" y="16.5" width="12" height="2" rx="1"/>', 0.6) +
    `</g>`,

  mail:
    sil('<rect x="5" y="11" width="38" height="27" rx="4.5"/>', 'white') +
    `<path d="M7 36.5L19 25M41 36.5L29 25" stroke="#b9a6ee" stroke-width="2" stroke-linecap="round"/>` +
    sil('<path d="M6 12.5L24 27.5L42 12.5Z"/>', 'pink', 2) +
    sil('<circle cx="24" cy="26" r="4.5"/>', 'gold', 2) +
    hl('<path d="M11 14.5H17L13 17.5Z"/>', 0.55),

  calendar:
    sil('<rect x="6" y="9" width="36" height="34" rx="5.5"/>', 'white') +
    sil('<path d="M6 15Q6 9 11.5 9H36.5Q42 9 42 15V19H6Z"/>', 'pink', 2) +
    sil('<rect x="13" y="4" width="5" height="10" rx="2.5"/><rect x="30" y="4" width="5" height="10" rx="2.5"/>', 'violet', 2) +
    `<g fill="#c9b7f5">${[24, 31.5]
      .flatMap((y) => [11, 18.5, 26, 33.5].map((x) => `<rect x="${x}" y="${y}" width="4.5" height="4.5" rx="1.4"/>`))
      .join('')}</g>` +
    `<polygon points="${starPts(35.8, 33.8, 5.5, 2.4)}" fill="#ffcf2e" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    hl('<rect x="9.5" y="11.5" width="2.2" height="5" rx="1.1"/>', 0.7),

  fire:
    sil(
      '<path d="M24 3C28 11 39 16 39 29C39 38 32.5 45 24 45C15.5 45 9 38 9 29C9 22 13 17.5 16.5 13.5C16.5 19.5 18.5 22.5 21.5 23.5C20.5 15.5 21.5 8.5 24 3Z"/>',
      'orange',
    ) +
    '<path d="M24 21C27.5 27 31.5 30 31.5 35.5C31.5 40.5 28 44 24 44C20 44 16.5 40.5 16.5 35.5C16.5 30.5 21 28 24 21Z" fill="#ffe680"/>' +
    '<path d="M24 31C25.6 34 27 35.4 27 38C27 40 25.6 41.5 24 41.5C22.4 41.5 21 40 21 38C21 35.4 22.6 34 24 31Z" fill="#fff"/>' +
    hl('<path d="M13 27Q13 22 16 18.5Q15 24 15.5 30Z"/>', 0.55),

  sparkle:
    sil('<path d="M24 3C25.8 16.5 31.5 22.2 45 24C31.5 25.8 25.8 31.5 24 45C22.2 31.5 16.5 25.8 3 24C16.5 22.2 22.2 16.5 24 3Z"/>', 'cyan', 2.5) +
    hl('<path d="M24 10C24.8 17 27 21 31 23.2C26 22.6 24.6 20 24 10Z"/>', 0.85) +
    twinkle(40, 8, 4.5, '#ffe680'),

  warning:
    sil('<path d="M24 5L44 40H4Z"/>', 'gold', 3.5) +
    ink('<rect x="21.4" y="15.5" width="5.2" height="14" rx="2.6"/><circle cx="24" cy="34.5" r="2.9"/>') +
    hl('<path d="M21.5 11L11.5 29H14Z"/>', 0.55),

  asteroid:
    `<path d="M34 34L44 44M38 29L45 35M29 38L35 45" stroke="#ff8fd8" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>` +
    sil(
      '<path d="M13 9C19 3 29 4 34.5 8.5C41 13 42.5 21 40 28.5C37 37 29 41 20.5 39.5C12 38 5.5 31.5 6 23C6.5 17 8.5 12.5 13 9Z"/>',
      'rock',
    ) +
    '<ellipse cx="27" cy="16.5" rx="5" ry="4" fill="#5a4585" opacity=".55"/><ellipse cx="27.6" cy="15.6" rx="4" ry="3" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>' +
    '<ellipse cx="17" cy="28" rx="6" ry="4.5" fill="#5a4585" opacity=".55"/><ellipse cx="17.6" cy="27" rx="5" ry="3.4" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>' +
    '<circle cx="32" cy="30" r="2.6" fill="#5a4585" opacity=".55"/>' +
    hl('<ellipse cx="14" cy="15" rx="3.5" ry="2" transform="rotate(-40 14 15)"/>', 0.7),

  clock:
    `<path d="M14 39L10.5 44M34 39L37.5 44" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>` +
    sil('<path d="M5 15A8 8 0 0 1 17 6Z"/><path d="M43 15A8 8 0 0 0 31 6Z"/><rect x="21.5" y="5" width="5" height="5" rx="1.5"/>', 'gold', 2.5) +
    sil('<circle cx="24" cy="26" r="16"/>', 'pink') +
    sil('<circle cx="24" cy="26" r="11.5"/>', 'white', 1.5) +
    `<path d="M24 26V18.5M24 26L29.5 29" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` +
    '<circle cx="24" cy="26" r="2.2" fill="#ff5cc8"/>' +
    hl('<ellipse cx="15" cy="15.5" rx="3.5" ry="1.8" transform="rotate(-40 15 15.5)"/>', 0.7),

  user:
    sil('<path d="M7 33C7 17.5 14.5 7 24 7C33.5 7 41 17.5 41 33C41 40 37 42.5 31 41.5C27.5 41 26 40 24 40C22 40 20.5 41 17 41.5C11 42.5 7 40 7 33Z"/>', 'pink') +
    '<ellipse cx="18" cy="24" rx="4.4" ry="5.4" fill="#fff"/><ellipse cx="30" cy="24" rx="4.4" ry="5.4" fill="#fff"/>' +
    ink('<circle cx="19" cy="25" r="2.6"/><circle cx="31" cy="25" r="2.6"/>') +
    '<circle cx="18.2" cy="23.6" r="1" fill="#fff"/><circle cx="30.2" cy="23.6" r="1" fill="#fff"/>' +
    '<ellipse cx="12.5" cy="31" rx="2.8" ry="1.8" fill="#ff2f9a" opacity=".45"/><ellipse cx="35.5" cy="31" rx="2.8" ry="1.8" fill="#ff2f9a" opacity=".45"/>' +
    `<path d="M21.5 31.5Q24 34 26.5 31.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` +
    hl('<ellipse cx="16" cy="13.5" rx="4.5" ry="2.2" transform="rotate(-30 16 13.5)"/>', 0.7),

  party:
    `<path d="M26 13Q30 6 26 2M33 22Q40 19 44 23" fill="none" stroke="#5ef0ff" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M30 16Q37 9 40 12" fill="none" stroke="#ff5cc8" stroke-width="2.6" stroke-linecap="round"/>` +
    sil('<path d="M5 43L15 15L33 33Z"/>', 'gold') +
    '<path d="M11.2 25.6L22.4 36.8L18 38.6L9.6 30.2Z" fill="#ff5cc8"/><path d="M14 18L28.2 32.2L24.6 34.4L12.6 22.2Z" fill="#8a5cff" opacity=".85"/>' +
    `<path d="M15 15L33 33" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
    '<rect x="35" y="5" width="4" height="7" rx="1.5" fill="#ffcf2e" transform="rotate(30 37 8.5)"/>' +
    '<rect x="39" y="30" width="4" height="7" rx="1.5" fill="#3ee07a" transform="rotate(-25 41 33.5)"/>' +
    '<circle cx="21" cy="6" r="2.3" fill="#ff5cc8"/><circle cx="44" cy="14" r="2" fill="#5ef0ff"/>' +
    twinkle(34, 26, 3, '#fff') +
    hl('<path d="M8 38L14.5 20L15.5 22Z"/>', 0.6),

  comet:
    `<path d="M27 21L5 43" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M24 16L6 28M32 24L20 42" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M27 21L5 43" stroke="#ff8fd8" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M24 16L6 28" stroke="#8a5cff" stroke-width="2.5" stroke-linecap="round"/>` +
    `<path d="M32 24L20 42" stroke="#5ef0ff" stroke-width="2.5" stroke-linecap="round"/>` +
    sil('<circle cx="31" cy="17" r="10.5"/>', 'cyan') +
    hl('<ellipse cx="27.5" cy="13" rx="3.6" ry="2" transform="rotate(-40 27.5 13)"/>', 0.85) +
    twinkle(43, 5, 3.5, '#ffe680'),
  'arrow-up':
    sil('<path d="M24 4L42 22H32V40Q32 44 28 44H20Q16 44 16 40V22H6Z"/>', 'green') +
    hl('<path d="M24 9L12 19.5H17L24 13Z"/><rect x="19.5" y="24" width="3" height="15" rx="1.5"/>', 0.6) +
    twinkle(41, 36, 4, '#ffe680'),

  pencil:
    `<g transform="rotate(45 24 24)">` +
    sil('<rect x="17" y="3" width="14" height="8" rx="3"/>', 'pink', 2.5) +
    sil('<rect x="17" y="11" width="14" height="23"/>', 'gold', 2.5) +
    sil('<path d="M17 34H31L24 45Z"/>', 'skin', 2.5) +
    ink('<path d="M22.2 41.4H25.8L24 45Z"/>') +
    hl('<rect x="19" y="12.5" width="3" height="20" rx="1.5"/>', 0.55) +
    `</g>`,

  link:
    sil('<rect x="6" y="12" width="30" height="30" rx="7"/>', 'violet') +
    `<path d="M15 33L32 16" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M15 33L32 16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` +
    sil('<path d="M26 5H43V22L37 16L31 22L26 17L32 11Z"/>', 'cyan', 2.5) +
    hl('<rect x="9" y="15" width="8" height="2.5" rx="1.25"/>', 0.6),

  heart:
    sil('<path d="M24 43C24 43 5 31 5 17.5C5 10.5 10.5 6 16 6C20 6 22.6 8.4 24 11C25.4 8.4 28 6 32 6C37.5 6 43 10.5 43 17.5C43 31 24 43 24 43Z"/>', 'pink') +
    hl('<ellipse cx="14" cy="15" rx="4.5" ry="3" transform="rotate(-30 14 15)"/>', 0.8) +
    twinkle(38, 9, 3.5),

  tag:
    `<g transform="rotate(-30 24 24)">` +
    sil('<path d="M14 9H38Q42 9 42 13V35Q42 39 38 39H14L4 24Z"/>', 'red') +
    sil('<circle cx="13" cy="24" r="3.4"/>', 'white', 1.5) +
    `<path d="M22 31L34 17" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="18.5" r="2.6" fill="#fff"/><circle cx="32" cy="29.5" r="2.6" fill="#fff"/>` +
    hl('<rect x="16" y="11.5" width="18" height="2.4" rx="1.2"/>', 0.55) +
    `</g>`,

  car:
    sil('<path d="M5 30Q5 22 12 21L17 13Q19 10 23 10H31Q35 10 37 14L40 21Q44 22 44 27V31Q44 34 41 34H8Q5 34 5 30Z"/>', 'orange') +
    `<path d="M20 14H26V21H16Z M29 14H33L36 21H29Z" fill="#bff3ff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    sil('<circle cx="14" cy="35" r="6.5"/><circle cx="35" cy="35" r="6.5"/>', 'cyan', 2.5) +
    ink('<circle cx="14" cy="35" r="2.2"/><circle cx="35" cy="35" r="2.2"/>') +
    hl('<rect x="9" y="24" width="12" height="2.4" rx="1.2"/>', 0.6),

  'cloud-off':
    sil('<path d="M13 38C7.5 38 4 34 4 29.5C4 25 7.5 21.5 12 21.5C12.5 14 18 9 25 9C31.5 9 36.5 13.5 37.5 19.5C42 20 45 24 45 28.5C45 33.5 41 38 36 38Z"/>', 'silver') +
    line('M10 6L40 44', '#ff4f6a', 4.5) +
    hl('<ellipse cx="20" cy="15" rx="5" ry="2.4" transform="rotate(-20 20 15)"/>', 0.7),

};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/* ============================== API ============================== */

const DEFS_ID = 'bo-icon-defs';

/** Injeta (uma vez) os gradientes compartilhados no documento. */
export function ensureIconDefs(doc: Document = document): void {
  if (doc.getElementById(DEFS_ID)) return;
  const holder = doc.createElement('div');
  holder.innerHTML = `<svg id="${DEFS_ID}" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${defsMarkup()}</defs></svg>`;
  (doc.body ?? doc.documentElement).prepend(holder.firstChild!);
}

/** Retorna o SVG do ícone como string, pronto para innerHTML. */
export function icon(name: IconName, opts: IconOpts = {}): string {
  if (typeof document !== 'undefined') ensureIconDefs();
  const body = ICONS[name] ?? ICONS.star;
  const s = opts.size ? `${opts.size}` : '1.25em';
  const cls = `ico ico-${name}${opts.class ? ' ' + opts.class : ''}`;
  const a11y = opts.title ? `role="img" aria-label="${opts.title}"` : 'aria-hidden="true"';
  return `<svg class="${cls}" viewBox="0 0 48 48" width="${s}" height="${s}" ${a11y} focusable="false">${body}</svg>`;
}

/** SVG autônomo (com seus próprios gradientes) — para data-URI, canvas ou arquivo. */
export function iconStandalone(name: IconName, size = 48): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}"><defs>${defsMarkup()}</defs>${ICONS[name] ?? ICONS.star}</svg>`;
}

export function iconDataUri(name: IconName): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconStandalone(name))}`;
}

let cssInstalled = false;
/** Define --ico-coin / --ico-gem para os <i class="coin|gem"> inline do CSS. */
export function installIconCss(): void {
  if (cssInstalled || typeof document === 'undefined') return;
  cssInstalled = true;
  const st = document.documentElement.style;
  st.setProperty('--ico-coin', `url("${iconDataUri('coin')}")`);
  st.setProperty('--ico-gem', `url("${iconDataUri('gem')}")`);
}

/**
 * Preenche todo elemento com [data-icon="nome"] (opcional [data-size="px"]) com o SVG.
 * Idempotente: elementos já hidratados são ignorados.
 */
export function hydrateIcons(root: ParentNode = document): void {
  ensureIconDefs();
  installIconCss();
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone === el.dataset.icon) return;
    const size = el.dataset.size ? Number(el.dataset.size) : undefined;
    el.innerHTML = icon(el.dataset.icon as IconName, { size });
    el.dataset.iconDone = el.dataset.icon;
  });
}
