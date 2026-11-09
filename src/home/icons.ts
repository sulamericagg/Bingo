/* Ícones SVG próprios da Casa (mesmo estilo de src/ui/icons.ts: gordinhos, contorno tinta). */
const INK = '#2a0b5c';
export type HomeIcon =
  | 'house' | 'friends' | 'party' | 'cake' | 'mop' | 'sponge' | 'vacuum' | 'bag' | 'hand' | 'roller' | 'brush' | 'spray' | 'tape'
  | 'undo' | 'redo' | 'dice' | 'save' | 'flip' | 'trash' | 'up' | 'down' | 'copy' | 'cube' | 'lock' | 'build' | 'sofa' | 'planet'
  | 'key' | 'back' | 'emote' | 'plus' | 'check' | 'close' | 'search' | 'broom' | 'multi' | 'rotate' | 'template' | 'paint' | 'star' | 'coin' | 'video' | 'gem';

const P = (d: string, fill: string, w = 3) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const C = (x: number, y: number, r: number, fill: string, w = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${w}"/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, sw = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
const L = (d: string, col = INK, w = 4) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const ICONS: Record<HomeIcon, string> = {
  house: P('M8 24 24 9l16 15', '#ff7ad9') + R(12, 22, 24, 18, 3, '#fff2e0') + R(20, 28, 8, 12, 2, '#8a5cff'),
  friends: C(17, 18, 7, '#5ef0ff') + C(32, 20, 6, '#ff9ad9') + P('M5 40c1-9 7-13 12-13s11 4 12 13z', '#5ef0ff') + P('M24 40c1-7 5-11 9-11s9 4 10 11z', '#ff9ad9'),
  party: P('M10 40 18 14l16 16z', '#ffc93d') + L('M30 8l2 5M38 12l-4 3M40 22l-5 0', '#ff5c7a', 3) + C(22, 26, 2, '#ff5c7a', 1.5),
  cake: R(9, 24, 30, 16, 4, '#ffe0a3') + P('M9 28c4 4 6-2 10 2s6-2 10 2 6-2 10-2v-4H9z', '#ff7ad9') + R(22, 12, 4, 10, 2, '#5ef0ff', 2) + P('M24 6c3 3 0 5 0 5s-3-2 0-5z', '#ffc93d', 2),
  mop: L('M30 6 20 30', INK, 5) + L('M30 6 20 30', '#c89a6a', 3) + P('M10 30h18l2 10H8z', '#5ef0ff'),
  sponge: R(10, 16, 28, 18, 6, '#fff27a') + C(18, 23, 2, '#ffc93d', 1.5) + C(29, 27, 2.5, '#ffc93d', 1.5) + C(14, 38, 3, '#bff6ff', 2) + C(34, 12, 3, '#bff6ff', 2),
  vacuum: R(8, 26, 22, 14, 6, '#ff5c7a') + L('M26 26 36 8', INK, 5) + L('M26 26 36 8', '#d5d0e8', 3) + C(14, 40, 3, '#262238', 2) + C(26, 40, 3, '#262238', 2),
  bag: P('M12 18h24l-3 22H15z', '#4fd67a') + L('M18 18c0-6 12-6 12 0', INK, 3) + L('M20 12l4 4 4-4', INK, 3),
  hand: P('M16 40V20a3 3 0 0 1 6 0v-6a3 3 0 0 1 6 0v6a3 3 0 0 1 6 0v6a3 3 0 0 1 6 0v6c0 6-4 10-10 10z', '#ffe0c8'),
  roller: R(10, 8, 28, 12, 5, '#ff7ad9') + L('M38 14h4v10H24v6', INK, 3) + R(21, 30, 6, 12, 2, '#8a5cff'),
  brush: P('M30 6l8 8-12 12-8-8z', '#c89a6a') + P('M18 18l8 8c-2 6-8 14-16 14 0-8 4-18 8-22z', '#5ef0ff'),
  spray: R(14, 18, 16, 24, 4, '#8a5cff') + R(16, 10, 10, 8, 2, '#d5d0e8') + C(34, 10, 2, '#ff7ad9', 1) + C(38, 15, 2, '#ff7ad9', 1) + C(37, 6, 1.5, '#ff7ad9', 1),
  tape: C(24, 24, 15, '#5ea8ff') + C(24, 24, 6, '#fff') + P('M34 34l10 4-4 4-8-4z', '#5ea8ff', 2),
  undo: L('M18 14 10 22l8 8', INK, 5) + L('M10 22h18a10 10 0 0 1 0 20h-6', INK, 5),
  redo: L('M30 14l8 8-8 8', INK, 5) + L('M38 22H20a10 10 0 0 0 0 20h6', INK, 5),
  dice: R(8, 8, 32, 32, 8, '#fff') + C(16, 16, 3, INK, 0) + C(32, 32, 3, INK, 0) + C(24, 24, 3, INK, 0) + C(32, 16, 3, INK, 0) + C(16, 32, 3, INK, 0),
  save: R(8, 8, 32, 32, 5, '#4fd67a') + R(15, 8, 18, 11, 2, '#fff') + R(14, 26, 20, 14, 2, '#fff2e0'),
  flip: P('M22 8v32L8 34z', '#5ef0ff') + P('M26 8v32l14-6z', '#fff'),
  trash: R(12, 14, 24, 28, 4, '#ff5c7a') + R(9, 9, 30, 6, 3, '#ff9ab0') + L('M20 20v16M28 20v16', INK, 3),
  up: P('M24 8 40 26H30v14H18V26H8z', '#5ef0ff'),
  down: P('M24 40 8 22h10V8h12v14h10z', '#ffc93d'),
  copy: R(8, 14, 22, 26, 4, '#d2bdff') + R(18, 8, 22, 26, 4, '#fff'),
  cube: P('M24 6l16 9v18l-16 9-16-9V15z', '#5ef0ff') + L('M8 15l16 9 16-9M24 24v18', INK, 3),
  lock: R(10, 22, 28, 20, 5, '#ffc93d') + L('M16 22v-6a8 8 0 0 1 16 0v6', INK, 4) + C(24, 32, 3, INK, 0),
  build: P('M8 34 26 16l6 6-18 18H8z', '#ffc93d') + P('M26 16l6-8 8 8-8 6z', '#d5d0e8'),
  sofa: R(8, 18, 32, 16, 6, '#ff7ad9') + R(5, 22, 8, 16, 4, '#ff9ad9') + R(35, 22, 8, 16, 4, '#ff9ad9') + R(10, 30, 28, 8, 3, '#ffb3c7'),
  planet: C(24, 24, 13, '#5ef0ff') + L('M4 30c10 4 30-2 40-12', INK, 5) + L('M4 30c10 4 30-2 40-12', '#ffc93d', 3),
  key: C(16, 24, 8, '#ffc93d') + P('M23 22h18v5h-4v5h-5v-5h-9z', '#ffc93d'),
  back: L('M28 10 14 24l14 14', INK, 6),
  emote: C(24, 24, 16, '#fff27a') + C(18, 21, 2.5, INK, 0) + C(30, 21, 2.5, INK, 0) + L('M17 29c4 5 10 5 14 0', INK, 3),
  plus: L('M24 10v28M10 24h28', INK, 6),
  check: L('M10 25l9 9 19-20', INK, 6),
  close: L('M12 12l24 24M36 12 12 36', INK, 6),
  search: C(21, 21, 11, '#bff6ff') + L('M29 29l10 10', INK, 6),
  broom: L('M34 6 22 28', '#c89a6a', 4) + P('M14 26l14 6-6 10-14-6z', '#ffc93d'),
  multi: R(6, 6, 18, 18, 4, '#5ef0ff') + R(24, 24, 18, 18, 4, '#ff9ad9') + R(16, 16, 16, 16, 4, '#fff27a'),
  rotate: L('M36 18a14 14 0 1 0 2 12', INK, 5) + P('M40 8v12H28z', INK, 1),
  template: R(6, 8, 36, 32, 5, '#fff') + R(10, 12, 12, 10, 2, '#ff9ad9', 2) + R(26, 12, 12, 10, 2, '#5ef0ff', 2) + R(10, 26, 28, 10, 2, '#fff27a', 2),
  paint: P('M10 30c0-12 8-22 18-22s12 6 10 10-8 2-8 8 4 6 2 10-10 6-14 6-8-6-8-12z', '#fff2e0') + C(18, 22, 3, '#ff5c7a', 1.5) + C(26, 16, 3, '#5ef0ff', 1.5) + C(17, 32, 3, '#4fd67a', 1.5),
  star: P('M24 6l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z', '#ffc93d'),
  coin: C(24, 24, 15, '#ffcf2e') + C(24, 24, 9, '#fff6b0', 2),
  video: R(6, 12, 28, 24, 6, '#ff5c7a') + P('M34 20l8-5v18l-8-5z', '#ff5c7a') + P('M17 18l8 6-8 6z', '#fff', 2),
  gem: P('M12 18l6-8h12l6 8-12 20z', '#5ef0ff') + L('M12 18h24', INK, 2),
};

export function hicon(name: HomeIcon, size = 24): string {
  return `<svg class="hm-ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${ICONS[name]}</svg>`;
}
