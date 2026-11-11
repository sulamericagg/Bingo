/* ============================================================
 *  NOITES · CONSTRUÇÃO — ícones SVG extras (mesmo estilo de
 *  ../icons: contorno roxo-escuro, cores vivas). Cai em ic().
 * ============================================================ */
import { ic } from '../icons';

const K = '#2a0b5c';
const W = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const pick = (x: number, c: string) => `<path d="M${x - 4} 40V16l4-6 4 6v24z" fill="${c}" ${W}/>`;

const P: Record<string, (c: string) => string> = {
  build: (c) => `<rect x="6" y="28" width="36" height="12" rx="3" fill="${c || '#c08a52'}" ${W}/><path d="M12 28v12M24 28v12M36 28v12" stroke="${K}" stroke-width="2"/><path d="M30 24L16 8" stroke="#8a5228" stroke-width="6" stroke-linecap="round"/><path d="M30 24L16 8" stroke="${K}" stroke-width="1.5"/><rect x="24" y="4" width="18" height="11" rx="4" transform="rotate(42 33 9)" fill="#b8c4d8" ${W}/>`,
  bfence: (c) => `<path d="M6 22h36M6 33h36" stroke="${c || '#b07a44'}" stroke-width="5"/><path d="M6 22h36M6 33h36" stroke="${K}" stroke-width="1.2"/>${pick(12, c || '#d49a5c')}${pick(24, c || '#d49a5c')}${pick(36, c || '#d49a5c')}`,
  brfence: (c) => `${[10, 19, 28, 37].map((x) => `<path d="M${x - 4.5} 42V14l4.5-7 4.5 7v28z" fill="${c || '#8a5a30'}" ${W}/>`).join('')}<path d="M5 20h38M5 34h38" stroke="#59606e" stroke-width="4"/>`,
  bwall: (c) => `<rect x="5" y="12" width="38" height="30" rx="2" fill="${c || '#9aa0b4'}" ${W}/><path d="M5 22h38M5 32h38M16 12v10M32 12v10M10 22v10M26 22v10M40 22v10M18 32v10M34 32v10" stroke="${K}" stroke-width="2"/><path d="M5 12V6h8v6M20 12V6h8v6M35 12V6h8v6" fill="${c || '#b0b4c4'}" ${W}/>`,
  bgate: (c) => `<path d="M6 44V8M42 44V8" stroke="#7a4a26" stroke-width="6" stroke-linecap="round"/><path d="M6 8h36" stroke="#8a5a30" stroke-width="5"/><rect x="10" y="14" width="13" height="28" rx="2" fill="${c || '#e0a868'}" ${W}/><rect x="25" y="14" width="13" height="28" rx="2" fill="${c || '#e0a868'}" ${W}/><path d="M10 40l13-24M38 40L25 16" stroke="#9a6436" stroke-width="2.5"/><circle cx="21" cy="28" r="2" fill="#ffd34a"/><circle cx="27" cy="28" r="2" fill="#ffd34a"/>`,
  btower: (c) => `<path d="M24 3L6 17h36z" fill="#e0503a" ${W}/><rect x="9" y="17" width="30" height="6" fill="#b07a44" ${W}/><path d="M12 23l-3 22M36 23l3 22M12 26l24 16M36 26L12 42" stroke="#8a5a30" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="20" r="3.5" fill="${c || '#ffe39a'}" ${W}/>`,
  bspikes: (c) => `<rect x="4" y="36" width="40" height="7" rx="3" fill="#7a4e28" ${W}/>${[10, 19, 28, 37].map((x, i) => `<path d="M${x - 5} 37l5-${i % 2 ? 24 : 30} 5 ${i % 2 ? 24 : 30}z" fill="${c || '#e8c890'}" ${W}/>`).join('')}`,
  demolish: (c) => `<path d="M8 40l16-16 16 16z" fill="${c || '#c08a52'}" ${W}/><path d="M22 6l-4 12 8-2-4 12" fill="none" stroke="#ff4a5e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 10l8 8M38 10l-8 8" stroke="${K}" stroke-width="4" stroke-linecap="round"/>`,
  repair: (c) => `<path d="M10 38L26 22" stroke="#8a5228" stroke-width="6" stroke-linecap="round"/><path d="M10 38L26 22" stroke="${K}" stroke-width="1.5"/><rect x="20" y="8" width="18" height="11" rx="4" transform="rotate(45 29 13)" fill="#b8c4d8" ${W}/><path d="M36 30c-3-4-9-1-6 4l6 6 6-6c3-5-3-8-6-4z" fill="${c || '#ff5d8f'}" ${W}/>`,
  upgrade: (c) => `<rect x="8" y="26" width="32" height="16" rx="3" fill="#9aa0b4" ${W}/><path d="M8 34h32M18 26v8M30 34v8" stroke="${K}" stroke-width="2"/><path d="M24 4l11 12h-6v8h-10v-8h-6z" fill="${c || '#7ad0ff'}" ${W}/>`,
  grid: (c) => `<rect x="6" y="6" width="36" height="36" rx="4" fill="${c || '#eaffef'}" ${W}/><path d="M18 6v36M30 6v36M6 18h36M6 30h36" stroke="${K}" stroke-width="2.5"/>`,
  free: (c) => `<rect x="6" y="6" width="36" height="36" rx="4" fill="${c || '#fff3c4'}" ${W} stroke-dasharray="5 4"/><path d="M24 12v24M12 24h24" stroke="${K}" stroke-width="3"/><path d="M24 10l-4 5h8zM24 38l-4-5h8zM10 24l5-4v8zM38 24l-5-4v8z" fill="${K}"/>`,
  line: (c) => `<path d="M8 36h32" stroke="${c || '#6dffa8'}" stroke-width="6" stroke-linecap="round"/><circle cx="8" cy="36" r="5" fill="#fff" ${W}/><path d="M36 30l6 6-6 6" fill="none" ${W}/><path d="M18 26c0-10 8-16 14-12" fill="none" stroke="${K}" stroke-width="3" stroke-dasharray="3 4"/><path d="M14 12a6 6 0 1 1 8 6" fill="#ffe0c8" ${W}/>`,
  shield: (c) => `<path d="M24 4l16 6v12c0 10-7 17-16 22C15 39 8 32 8 22V10z" fill="${c || '#7ad0ff'}" ${W}/><path d="M24 12v26M14 20h20" stroke="${K}" stroke-width="2.5"/>`,
  // motivos do vermelho
  far: () => `<circle cx="16" cy="30" r="8" fill="#8ad8ff" ${W}/><path d="M28 24h14M36 18l6 6-6 6" fill="none" ${W}/><path d="M6 12h4M14 12h4M22 12h4" stroke="${K}" stroke-width="3"/>`,
  zone: () => `<path d="M24 6c-9 10-10 16-6 22h12c4-6 3-12-6-22z" fill="#ff9a2e" ${W}/><circle cx="24" cy="30" r="16" fill="none" stroke="#ff4a5e" stroke-width="4"/><path d="M12 42L36 18" stroke="#ff4a5e" stroke-width="4"/>`,
  occ: () => `<rect x="6" y="18" width="36" height="22" rx="3" fill="#c08a52" ${W}/><path d="M14 8l20 20M34 8L14 28" stroke="#ff4a5e" stroke-width="5" stroke-linecap="round"/>`,
  block: () => `<path d="M24 6l12 18h-6l8 12H10l8-12h-6z" fill="#3ec05a" ${W}/><rect x="21" y="36" width="6" height="8" fill="#8a5228" ${W}/>`,
  crowd: () => `<circle cx="24" cy="16" r="8" fill="#8ad8ff" ${W}/><path d="M10 42c0-10 6-16 14-16s14 6 14 16z" fill="#8ad8ff" ${W}/>`,
  tier: () => `<rect x="10" y="22" width="28" height="20" rx="4" fill="#ffd34a" ${W}/><path d="M16 22v-6a8 8 0 0 1 16 0v6" fill="none" ${W}/><circle cx="24" cy="31" r="3" fill="${K}"/>`,
  none: () => `<rect x="9" y="13" width="30" height="26" rx="4" fill="#e8e0ff" ${W} stroke-dasharray="5 4"/><path d="M19 22a5 5 0 1 1 7 5v3" fill="none" stroke="${K}" stroke-width="3.5" stroke-linecap="round"/><circle cx="26" cy="35" r="2" fill="${K}"/>`,
};

/** ícone da construção (ou de ../icons) */
export function bic(name: string, size = 32, col = ''): string {
  const f = P[name];
  if (!f) return ic(name, size, col);
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${f(col)}</svg>`;
}
