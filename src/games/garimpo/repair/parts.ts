/* ============================================================
 *  CONSERTOS — peças da loja (ícones SVG coloridos, nomes pt-BR + i18n) e ícones do HUD.
 * ============================================================ */
import { t } from '../../../i18n';
import type { BreakKind, PartId } from './model';

const S = (body: string) => `<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** ícones coloridos (loja, escolha, HUD) */
export const RIC = {
  tyre: S(
    '<circle cx="24" cy="24" r="19" fill="#26272b" stroke="#0c0c0e" stroke-width="2"/><circle cx="24" cy="24" r="19" stroke="#3a3b40" stroke-width="5" stroke-dasharray="3 3.5" fill="none"/><circle cx="24" cy="24" r="11" fill="#d4dade" stroke="#646c74" stroke-width="2"/><circle cx="24" cy="24" r="3.5" fill="#9aa3ab"/><g fill="#5b636b"><circle cx="24" cy="17.5" r="1.8"/><circle cx="30.2" cy="22" r="1.8"/><circle cx="27.8" cy="29.3" r="1.8"/><circle cx="20.2" cy="29.3" r="1.8"/><circle cx="17.8" cy="22" r="1.8"/></g><path d="M12 9a19 19 0 0 1 9-4" stroke="#fff" stroke-opacity=".35" stroke-width="2.5"/>',
  ),
  flat: S(
    '<path d="M6 34a18 18 0 1 1 36 0c0 3-3 5-6 5H12c-3 0-6-2-6-5z" fill="#26272b" stroke="#0c0c0e" stroke-width="2"/><circle cx="24" cy="26" r="9" fill="#d4dade" stroke="#646c74" stroke-width="2"/><path d="M35 40l5 4M38 38l6 2" stroke="#ff5a3a" stroke-width="2.5"/><circle cx="41" cy="10" r="3" stroke="#bfe6ff" stroke-width="2"/><circle cx="35" cy="6" r="2" stroke="#bfe6ff" stroke-width="2"/>',
  ),
  bush: S(
    '<ellipse cx="24" cy="30" rx="16" ry="9" fill="#18191c"/><rect x="8" y="16" width="32" height="14" fill="#2b2c31"/><ellipse cx="24" cy="16" rx="16" ry="9" fill="#44464d" stroke="#18191c" stroke-width="2"/><ellipse cx="24" cy="16" rx="7" ry="4" fill="#c9cfd5" stroke="#646c74" stroke-width="1.5"/><ellipse cx="24" cy="16" rx="3.5" ry="2" fill="#2b2f35"/><circle cx="16" cy="13" r="1.6" fill="#ffcf2e"/>',
  ),
  hyd: S(
    '<path d="M8 30c8 0 8-14 16-14s8 14 16 14" stroke="#0e0f11" stroke-width="9"/><path d="M8 30c8 0 8-14 16-14s8 14 16 14" stroke="#34353a" stroke-width="6"/><rect x="2" y="25" width="9" height="10" rx="2" fill="#c9cfd5" stroke="#5b636b" stroke-width="1.5"/><rect x="37" y="25" width="9" height="10" rx="2" fill="#d8b048" stroke="#7a5a12" stroke-width="1.5"/><path d="M24 36c-2 3-2 5 0 6 2-1 2-3 0-6z" fill="#e8a818"/>',
  ),
  wire: S(
    '<path d="M6 10c10 0 8 14 18 14s8 14 18 14" stroke="#e53b2f" stroke-width="4"/><path d="M6 18c10 0 8 10 18 10s8 6 18 6" stroke="#2f7de0" stroke-width="4"/><path d="M6 26c10 0 8 4 18 4s10-4 18-4" stroke="#f4c31d" stroke-width="4"/><rect x="2" y="6" width="7" height="24" rx="2" fill="#2b2f35"/><rect x="38" y="22" width="8" height="16" rx="2" fill="#2b2f35"/><path d="M46 26h2M46 30h2M46 34h2" stroke="#e7a35a" stroke-width="2"/>',
  ),
  pad: S(
    '<path d="M8 30a16 16 0 0 1 32 0" stroke="#7d746a" stroke-width="10"/><path d="M10 30a14 14 0 0 1 28 0" stroke="#3a332c" stroke-width="3" stroke-dasharray="4 3"/><rect x="18" y="8" width="16" height="12" rx="3" fill="#c8321f" stroke="#6a140c" stroke-width="1.5"/><rect x="6" y="34" width="36" height="6" rx="2" fill="#9aa2aa" stroke="#4a5158" stroke-width="1.5"/>',
  ),
  service: S(
    '<rect x="5" y="22" width="38" height="20" rx="4" fill="#1f8f8a" stroke="#0f5652" stroke-width="2"/><path d="M14 22l4-10h12l4 10" fill="#5d86a0" stroke="#0f5652" stroke-width="2"/><circle cx="14" cy="42" r="4" fill="#26272b"/><circle cx="34" cy="42" r="4" fill="#26272b"/><path d="M33 3l-5 5 3 3 5-5a5 5 0 0 1-6 7L21 22l-3-3 9-9a5 5 0 0 1 6-7z" fill="#ffcf2e" stroke="#7a5a00" stroke-width="1.5"/>',
  ),
  wrench: S('<path d="M30 6l-6 6 4 4 6-6a7 7 0 0 1-9 9L12 32a4 4 0 1 1-6-6l13-13a7 7 0 0 1 11-7z" fill="#e6eaee" stroke="#4a5158" stroke-width="2"/>'),
  mech: S(
    '<circle cx="24" cy="14" r="8" fill="#e0a77a" stroke="#7a4a2a" stroke-width="2"/><path d="M15 12a9 9 0 0 1 18 0z" fill="#2f6fbf"/><path d="M8 44c0-9 7-15 16-15s16 6 16 15z" fill="#2f6fbf" stroke="#1a3f70" stroke-width="2"/><path d="M34 26l6-6 3 3-6 6" fill="#c9cfd5" stroke="#4a5158" stroke-width="1.5"/>',
  ),
  tow: S(
    '<rect x="4" y="22" width="22" height="14" rx="3" fill="#ffb21a" stroke="#7a5000" stroke-width="2"/><path d="M8 22l3-8h10l3 8" fill="#5d86a0" stroke="#7a5000" stroke-width="2"/><path d="M26 30l12-12" stroke="#2b2f35" stroke-width="3"/><path d="M38 18v10a3 3 0 1 1-3 3" stroke="#2b2f35" stroke-width="2.5"/><circle cx="11" cy="37" r="4" fill="#26272b"/><circle cx="22" cy="37" r="4" fill="#26272b"/><rect x="2" y="18" width="5" height="4" fill="#ff5a3a"/>',
  ),
  cart: S('<path d="M5 8h5l4 22h22l4-15H12" stroke="#fff" stroke-width="3.5"/><circle cx="17" cy="38" r="3.5" fill="#fff"/><circle cx="33" cy="38" r="3.5" fill="#fff"/>'),
  clock: S('<circle cx="24" cy="24" r="17" fill="#fff" stroke="#2b2f35" stroke-width="3"/><path d="M24 14v10l7 5" stroke="#2b2f35" stroke-width="3.5"/>'),
  brake: S(
    '<circle cx="24" cy="24" r="12" stroke="#ff4a2a" stroke-width="4"/><path d="M10 12a18 18 0 0 0 0 24M38 12a18 18 0 0 1 0 24" stroke="#ff4a2a" stroke-width="4"/><path d="M24 17v9" stroke="#ff4a2a" stroke-width="4"/><circle cx="24" cy="31" r="2.4" fill="#ff4a2a"/>',
  ),
  battery: S('<rect x="6" y="14" width="36" height="24" rx="3" stroke="#ff9a3a" stroke-width="3.5"/><path d="M12 14v-4h6v4M30 14v-4h6v4M12 26h8M30 26h8M34 22v8" stroke="#ff9a3a" stroke-width="3.5"/>'),
  gear: S('<circle cx="24" cy="24" r="7" stroke="#ff9a3a" stroke-width="3.5"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2" stroke="#ff9a3a" stroke-width="4"/>'),
  shock: S('<path d="M24 4v8M24 36v8" stroke="#ff9a3a" stroke-width="4"/><path d="M16 12h16l-16 6h16l-16 6h16l-16 6h16" stroke="#ff9a3a" stroke-width="3.5"/>'),
  gearDown: S('<rect x="6" y="6" width="36" height="36" rx="8" fill="#1d5fa8"/><path d="M15 14v20M24 14v20M33 14v20M15 24h18" stroke="#fff" stroke-width="3" stroke-opacity=".5"/><path d="M24 12v20M16 25l8 8 8-8" stroke="#fff" stroke-width="4.5"/>'),
  jake: S('<path d="M8 32h22a6 6 0 0 0 6-6V14" stroke="#fff" stroke-width="5"/><path d="M36 10v-4M30 8l-2-3M42 8l2-3" stroke="#fff" stroke-width="3"/><path d="M4 38c4-2 8 2 12 0s8 2 12 0" stroke="#fff" stroke-width="3"/>'),
  ramp: S('<path d="M4 40h40L44 18z" fill="#c9b07a" stroke="#fff" stroke-width="2.5"/><path d="M10 38l6-4M18 37l6-5M26 36l6-6M34 35l6-7" stroke="#8a6a3a" stroke-width="2"/><path d="M8 22l12-8M14 12l6 2-2 6" stroke="#fff" stroke-width="3.5"/>'),
};
export type RIcon = keyof typeof RIC;

/** ícone do painel para cada quebra */
export const BREAK_ICON: Record<BreakKind, RIcon> = { tyre: 'flat', brake: 'brake', electric: 'battery', part: 'gear', bushing: 'shock' };
export const PART_ICON: Record<PartId, RIcon> = { tyre: 'tyre', bush: 'bush', hyd: 'hyd', wire: 'wire', pad: 'pad' };

export function partName(id: PartId): string {
  switch (id) {
    case 'tyre':
      return t('gb.rep.p.tyre', 'Pneu estepe');
    case 'bush':
      return t('gb.rep.p.bush', 'Kit de buchas');
    case 'hyd':
      return t('gb.rep.p.hyd', 'Peça hidráulica');
    case 'wire':
      return t('gb.rep.p.wire', 'Chicote elétrico');
    default:
      return t('gb.rep.p.pad', 'Pastilha de freio');
  }
}
export function breakName(k: BreakKind): string {
  switch (k) {
    case 'tyre':
      return t('gb.rep.k.tyre', 'Pneu furado!');
    case 'brake':
      return t('gb.rep.k.brake', 'Sem freio!');
    case 'electric':
      return t('gb.rep.k.electric', 'Pane elétrica!');
    case 'part':
      return t('gb.rep.k.part', 'Peça quebrou!');
    default:
      return t('gb.rep.k.bushing', 'Buchas gastas!');
  }
}
