/* ============================================================
 *  VEÍCULOS DO MUNDO — ícones SVG (botões e peças). Ícone primeiro,
 *  texto curto depois: dá para jogar sem ler.
 * ============================================================ */
import { PART, vItemColor, type PartDef } from './parts';

const S = (body: string, vb = 24) => `<svg viewBox="0 0 ${vb} ${vb}" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const UI_ICONS = {
  brake: S('<circle cx="12" cy="12" r="9" fill="#ff4f6a" stroke="#fff"/><rect x="6.5" y="10.3" width="11" height="3.4" rx="1" fill="#fff" stroke="none"/>'),
  fuel: S('<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16z" fill="#ffd34a" stroke="#3a2a10"/><path d="M7 7h6v4H7z" fill="#fff" stroke="#3a2a10"/><path d="M15 9l3 2v7a1.5 1.5 0 0 0 3 0V8l-3-3" stroke="#3a2a10"/>'),
  wrench: S('<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" fill="#c8ccd8" stroke="#2a2e38"/>'),
  exit: S('<path d="M10 3h9v18h-9" stroke="#fff"/><path d="M14 12H3m4-4-4 4 4 4" stroke="#fff"/>'),
  horn: S('<path d="M3 9h4l9-5v16l-9-5H3z" fill="#ffd34a" stroke="#3a2a10"/><path d="M19 8c1.5 2 1.5 6 0 8" stroke="#fff"/>'),
  light: S('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="#fff4c0" stroke="#3a2a10"/>'),
  drill: S('<path d="M3 12h6l11-5v10L9 12" fill="#c8ccd8" stroke="#2a2e38"/><path d="M12 9.5l2 5M15.5 8l2 7" stroke="#ffb02e"/>'),
  blade: S('<path d="M3 19c3-1 15-1 18 0l-2-9H5z" fill="#ffcf2e" stroke="#2a2e38"/><path d="M8 10l2-6h4l2 6" stroke="#fff"/>'),
  plow: S('<path d="M4 6h16M7 6l-2 12M12 6v12M17 6l2 12" stroke="#c8ccd8"/><path d="M3 20h18" stroke="#8a5a30"/>'),
  crane: S('<path d="M5 21V8l14-4M5 8h9M14 8v6" stroke="#ffb02e"/><path d="M12 14h4v3h-4z" fill="#ffb02e" stroke="#2a2e38"/><path d="M2 21h8" stroke="#fff"/>'),
  grab: S('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4m0-1V4.5a1.5 1.5 0 0 1 3 0V10m0-4a1.5 1.5 0 0 1 3 0v5m0-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 14a1.5 1.5 0 0 1 2.6-1.5L8 14" fill="#ffd0a8" stroke="#3a2a10"/>'),
  up: S('<path d="M12 4l8 10h-5v6H9v-6H4z" fill="#3ec05a" stroke="#fff"/>'),
  down: S('<path d="M12 20l8-10h-5V4H9v6H4z" fill="#3a8aff" stroke="#fff"/>'),
  dump: S('<path d="M3 8l12-4 2 8-12 4z" fill="#8a92a0" stroke="#fff"/><circle cx="18" cy="18" r="2" fill="#9a6a3c" stroke="#fff"/><path d="M15 14l3 2" stroke="#fff"/>'),
  hitch: S('<circle cx="8" cy="12" r="4" stroke="#fff"/><circle cx="16" cy="12" r="4" stroke="#ffd34a"/>'),
  flip: S('<path d="M20 12a8 8 0 1 1-3-6.2" stroke="#fff"/><path d="M20 3v5h-5" stroke="#fff"/>'),
  rotate: S('<path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 3v5h-5"/>'),
  mirror: S('<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M9 7 3 12l6 5zM15 7l6 5-6 5z" fill="currentColor"/>'),
  eraser: S('<path d="M4 15l9-9 7 7-6 6H8z" fill="#ff8ac8" stroke="currentColor"/><path d="M9 19h11"/>'),
  save: S('<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'),
  play: S('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  close: S('<path d="M5 5l14 14M19 5L5 19"/>'),
  book: S('<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4z"/><path d="M12 5v16"/>'),
  hammer: S('<path d="M14 4l6 6-3 3-6-6zM12 9l-8 8 3 3 8-8"/>'),
  check: S('<path d="M4 12l5 5L20 6"/>'),
  weight: S('<path d="M7 8h10l3 12H4z" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="5.5" r="2.5"/>'),
  speed: S('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/>'),
  power: S('<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" fill-opacity=".25"/>'),
  log: S('<rect x="3" y="8" width="16" height="8" rx="4" fill="#9a6a3c" stroke="#5a3a1a"/><ellipse cx="19" cy="12" rx="2.5" ry="4" fill="#f3d9a8" stroke="#5a3a1a"/>'),
  mountain: S('<path d="M2 20 9 8l4 6 3-4 6 10z" fill="currentColor" fill-opacity=".25"/>'),
  heart: S('<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" fill="#ff4f6a" stroke="#fff"/>'),
  paint: S('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="7" r="1.3" fill="currentColor"/><circle cx="16" cy="8" r="1.3" fill="currentColor"/>'),
  trash: S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  key: S('<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>'),
};
export type UiIcon = keyof typeof UI_ICONS;

/** ícone de uma peça/item (desenho simples pela categoria + cores da peça) */
export function partIcon(id: string): string {
  const d: PartDef | undefined = PART.get(id);
  const c = d?.color ?? vItemColor(id);
  const c2 = d?.color2 ?? '#2a2e38';
  const k = '#2a2e38';
  if (!d) {
    if (id === 'combustivel') return S(`<path d="M6 21V7l4-4h8v18z" fill="${c}" stroke="${k}"/><path d="M10 3v4H6" stroke="${k}"/><path d="M10 13h4" stroke="#fff"/>`);
    if (id === 'bateria') return S(`<rect x="4" y="6" width="16" height="14" rx="2" fill="${c}" stroke="${k}"/><path d="M8 6V4m8 2V4M8 13h3m3 0h3m-1.5-1.5v3" stroke="#fff"/>`);
    if (id === 'kit_reparo') return S(`<rect x="3" y="7" width="18" height="13" rx="2" fill="${c}" stroke="${k}"/><path d="M9 7V4h6v3M12 10v7M8.5 13.5h7" stroke="#fff"/>`);
    return S(`<rect x="5" y="5" width="14" height="14" rx="3" fill="${c}" stroke="${k}"/>`);
  }
  switch (d.cat) {
    case 'chassis': {
      const [w, l] = d.grid!;
      const sx = 18 / Math.max(w, l);
      const W = w * sx;
      const L = l * sx;
      let g = '';
      for (let i = 1; i < w; i++) g += `<path d="M${12 - W / 2 + i * sx} ${12 - L / 2}v${L}" stroke="${c2}" stroke-width="1"/>`;
      for (let i = 1; i < l; i++) g += `<path d="M${12 - W / 2} ${12 - L / 2 + i * sx}h${W}" stroke="${c2}" stroke-width="1"/>`;
      return S(`<rect x="${12 - W / 2}" y="${12 - L / 2}" width="${W}" height="${L}" rx="1.5" fill="${c}" stroke="${k}"/>${g}`);
    }
    case 'wheel': {
      const r = 5 + d.radius! * 8;
      return S(`<circle cx="12" cy="12" r="${r}" fill="${c}" stroke="${k}"/><circle cx="12" cy="12" r="${r * 0.45}" fill="${c2}" stroke="${k}"/>`);
    }
    case 'track':
      return S(`<rect x="2" y="7" width="20" height="10" rx="5" fill="${c}" stroke="${k}"/><circle cx="7" cy="12" r="2.4" fill="${c2}"/><circle cx="12" cy="12" r="2.4" fill="${c2}"/><circle cx="17" cy="12" r="2.4" fill="${c2}"/>`);
    case 'engine':
      if (d.fuel === 'none') return S(`<circle cx="12" cy="14" r="6" fill="${c}" stroke="${k}"/><path d="M12 14l5-6M12 14l-5 6" stroke="${k}"/><rect x="15" y="5" width="5" height="3" rx="1" fill="${c2}" stroke="${k}"/>`);
      return S(`<rect x="3" y="8" width="15" height="11" rx="2" fill="${c}" stroke="${k}"/><path d="M6 8V5h6v3" stroke="${k}"/><path d="M18 11h3v5h-3" stroke="${k}"/>${d.fuel === 'carvao' ? `<path d="M14 8V3" stroke="${c2}"/>` : d.fuel === 'bateria' ? `<path d="M11 10l-2 4h3l-2 4" stroke="${c2}"/>` : `<path d="M7 12h7M7 15h7" stroke="${c2}"/>`}`);
    case 'seat':
      return S(`<path d="M7 3h4v11h7v4H7z" fill="${c}" stroke="${k}"/><path d="M8 18v3m9-3v3" stroke="${k}"/>`);
    case 'cargo':
      return S(`<path d="M3 8h18l-2 12H5z" fill="${c}" stroke="${k}"/><rect x="6" y="5" width="12" height="4" rx="2" fill="#9a6a3c" stroke="${k}"/>`);
    case 'box':
      return S(`<rect x="4" y="7" width="16" height="13" rx="1.5" fill="${c}" stroke="${k}"/><path d="M4 11h16" stroke="${k}"/><rect x="10" y="10" width="4" height="3" fill="${c2}" stroke="${k}"/>`);
    case 'tank':
      return S(`<rect x="4" y="8" width="16" height="10" rx="5" fill="${c}" stroke="${k}"/><path d="M10 8V5h4v3" stroke="${k}" fill="${c2}"/>`);
    case 'hitch':
      return S(`<path d="M3 12h11" stroke="${c}" stroke-width="4"/><circle cx="17" cy="12" r="3.5" fill="${c2}" stroke="${k}"/>`);
    case 'crane':
      return UI_ICONS.crane;
    case 'drill':
      return UI_ICONS.drill;
    case 'blade':
      return UI_ICONS.blade;
    case 'plow':
      return S(`<path d="M3 6h18" stroke="${c}" stroke-width="3"/><path d="M6 6l-1 13M12 6v13M18 6l1 13" stroke="${c2}"/>`);
    case 'float':
      return S(`<rect x="2" y="9" width="20" height="7" rx="3.5" fill="${c}" stroke="${k}"/><path d="M8 9v7M16 9v7" stroke="${c2}"/><path d="M2 20c3-2 5 2 8 0s5 2 8 0 3 0 4 0" stroke="#3a8aff"/>`);
    case 'propeller':
      return S(`<path d="M12 12 9 3c2-1 4-1 5 1zM12 12l9 3c0 2-1 4-3 4zM12 12l-8 5c-1-2-1-4 1-5z" fill="${c}" stroke="${k}"/><circle cx="12" cy="12" r="2" fill="${c2}"/>`);
    case 'rotor':
      return S(`<path d="M1 7h22" stroke="${c2}" stroke-width="3"/><path d="M12 7v8" stroke="${k}"/><rect x="8" y="14" width="8" height="6" rx="3" fill="${c}" stroke="${k}"/>`);
    case 'wing':
      return S(`<path d="M2 14l20-6v4L6 17z" fill="${c}" stroke="${k}"/><path d="M18 9.5v4" stroke="${c2}"/>`);
    case 'light':
      return S(`<rect x="3" y="8" width="8" height="8" rx="2" fill="${c2}" stroke="${k}"/><path d="M11 9l2-1v8l-2-1" fill="${c}" stroke="${k}"/><path d="M15 8l5-2M15 12h6M15 16l5 2" stroke="#ffd34a"/>`);
    case 'armor':
      return S(`<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" fill="${c}" stroke="${k}"/><path d="M8 10h8M8 14h8" stroke="${c2}"/>`);
  }
  return S(`<rect x="5" y="5" width="14" height="14" rx="3" fill="${c}" stroke="${k}"/>`);
}
