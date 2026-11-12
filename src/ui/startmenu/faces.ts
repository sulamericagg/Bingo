/* Carinhas de dificuldade (Bloop): 0 fácil (sorriso) · 1 normal · 2 difícil (bravo) · 3 muito difícil (furioso).
 * SVG puro, sem texto — a criança escolhe pela cara. */
const INK = '#2a0b5c';
export const FACE_COLORS: [string, string][] = [
  ['#c9ffdc', '#3ee07a'],
  ['#fff6b0', '#ffcf2e'],
  ['#ffd9b0', '#ff8a2e'],
  ['#ffc0cc', '#ff3c5a'],
];

export function faceSvg(level: number, size = 64): string {
  const L = Math.max(0, Math.min(3, level | 0));
  const [c1, c2] = FACE_COLORS[L];
  const id = `smf${L}`;
  const eyes =
    L === 0
      ? `<path d="M19 28q4-5 8 0M37 28q4-5 8 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`
      : L === 1
        ? `<ellipse cx="23" cy="27" rx="3.6" ry="4.6" fill="${INK}"/><ellipse cx="41" cy="27" rx="3.6" ry="4.6" fill="${INK}"/><circle cx="24.3" cy="25.4" r="1.4" fill="#fff"/><circle cx="42.3" cy="25.4" r="1.4" fill="#fff"/>`
        : `<ellipse cx="23" cy="29" rx="3.6" ry="4" fill="${INK}"/><ellipse cx="41" cy="29" rx="3.6" ry="4" fill="${INK}"/><path d="M16 ${L === 3 ? 19 : 21}l12 ${L === 3 ? 6 : 4}M48 ${L === 3 ? 19 : 21}l-12 ${L === 3 ? 6 : 4}" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`;
  const mouth =
    L === 0
      ? `<path d="M22 38q10 12 20 0z" fill="${INK}"/><path d="M27 44q5 3 10 0" fill="none" stroke="#ff7aa8" stroke-width="3" stroke-linecap="round"/>`
      : L === 1
        ? `<path d="M24 39q8 7 16 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`
        : L === 2
          ? `<path d="M25 43q7-5 14 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`
          : `<path d="M22 45q10-11 20 0z" fill="${INK}"/><path d="M26 43l3-3 3 3 3-3 3 3 3-2" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`;
  const extra =
    L === 0
      ? `<ellipse cx="15" cy="36" rx="4.5" ry="3" fill="#ff8ab8" opacity=".7"/><ellipse cx="49" cy="36" rx="4.5" ry="3" fill="#ff8ab8" opacity=".7"/>`
      : L === 2
        ? `<path d="M52 12q3 5 0 7q-3-2 0-7z" fill="#7ad8ff" stroke="${INK}" stroke-width="1.6"/>`
        : L === 3
          ? `<path d="M8 10l4 5M14 6l2 6M50 6l-2 6M56 10l-4 5" stroke="#ff3c5a" stroke-width="3" stroke-linecap="round"/>`
          : '';
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><path d="M32 6c15 0 26 10 26 26 0 16-11 26-26 26S6 48 6 32C6 16 17 6 32 6z" fill="url(#${id})" stroke="${INK}" stroke-width="3.5"/><ellipse cx="22" cy="15" rx="7" ry="3.5" fill="#fff" opacity=".55" transform="rotate(-20 22 15)"/>${eyes}${mouth}${extra}</svg>`;
}
