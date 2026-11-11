/* ============================================================
 *  UI comum dos modos: camada de HUD, painel com "voltar" do Android,
 *  avisos (toast), carimbo, ícones extras (porta, mão, escudo, U-turn,
 *  seta, lupa, lanterna, UV, balão, crachá, lista) — tudo ícone primeiro.
 * ============================================================ */
import { pushBack } from '../../../core/back';
import { IC } from '../core/icons';
import { esc } from '../core/util';

const INK = '#1d0b3a';
const svg = (b: string) => `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">${b}</svg>`;

export const MI = {
  door: (open = true) =>
    svg(
      `<rect x="14" y="6" width="36" height="54" rx="4" fill="#8a5a3a" stroke="${INK}" stroke-width="4"/>` +
        (open ? `<path d="M18 10 L40 16 L40 58 L18 56 Z" fill="#ffe680" stroke="${INK}" stroke-width="3"/><circle cx="35" cy="36" r="3" fill="${INK}"/>` : `<circle cx="42" cy="34" r="4" fill="#ffd34a" stroke="${INK}" stroke-width="2"/>`),
    ),
  stop: () =>
    svg(
      `<path d="M22 4 H42 L60 22 V42 L42 60 H22 L4 42 V22 Z" fill="#ff4f6a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M20 32 H44" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`,
    ),
  shield: () =>
    svg(
      `<path d="M32 4 L56 12 V30 C56 46 44 56 32 60 C20 56 8 46 8 30 V12 Z" fill="#4d7bff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M32 16 L36 26 L47 27 L39 34 L41 45 L32 39 L23 45 L25 34 L17 27 L28 26 Z" fill="#ffd34a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
    ),
  card: () =>
    svg(
      `<rect x="4" y="12" width="56" height="40" rx="6" fill="#fff" stroke="${INK}" stroke-width="4"/><rect x="4" y="12" width="56" height="10" rx="5" fill="#5ad1ff" stroke="${INK}" stroke-width="4"/><circle cx="20" cy="36" r="8" fill="#ff8fb0" stroke="${INK}" stroke-width="3"/><path d="M34 32 H52 M34 40 H48" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    ),
  list: () =>
    svg(
      `<rect x="12" y="8" width="40" height="50" rx="5" fill="#fff8e0" stroke="${INK}" stroke-width="4"/><rect x="22" y="4" width="20" height="9" rx="3" fill="#b98b5e" stroke="${INK}" stroke-width="3"/><circle cx="22" cy="26" r="4" fill="#ff5a7a"/><circle cx="22" cy="38" r="4" fill="#53d36b"/><circle cx="22" cy="50" r="4" fill="#5ad1ff"/><path d="M30 26 H44 M30 38 H44 M30 50 H40" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    ),
  light: (on = false) =>
    svg(
      (on ? `<path d="M36 22 L62 6 V58 L36 42 Z" fill="#fff6b0" opacity=".8"/>` : '') +
        `<rect x="4" y="24" width="26" height="16" rx="4" fill="#4a4a58" stroke="${INK}" stroke-width="4"/><path d="M30 20 L40 16 V48 L30 44 Z" fill="#ffd34a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
    ),
  zoom: () =>
    svg(
      `<circle cx="26" cy="26" r="17" fill="#bfeaff" stroke="${INK}" stroke-width="5"/><circle cx="21" cy="21" r="5" fill="#fff"/><path d="M39 39 L56 56" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M39 39 L56 56" stroke="#ff8a4a" stroke-width="4" stroke-linecap="round"/>`,
    ),
  ask: () =>
    svg(
      `<path d="M8 10 H56 V42 H30 L16 54 V42 H8 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M26 20 C26 13 38 13 38 20 C38 25 32 25 32 31" fill="none" stroke="#7b3dff" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="37" r="3" fill="#7b3dff"/>`,
    ),
  uv: (on = false) =>
    svg(
      (on ? `<path d="M36 22 L62 6 V58 L36 42 Z" fill="#b36bff" opacity=".75"/>` : '') +
        `<rect x="4" y="24" width="26" height="16" rx="4" fill="#2e1650" stroke="${INK}" stroke-width="4"/><path d="M30 20 L40 16 V48 L30 44 Z" fill="#b36bff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="17" cy="32" r="3" fill="#b6ff3a"/>`,
    ),
  angry: () =>
    svg(
      `<circle cx="32" cy="32" r="26" fill="#ff8a4a" stroke="${INK}" stroke-width="4"/><path d="M18 22 L28 27 M46 22 L36 27" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="31" r="3.5" fill="${INK}"/><circle cx="40" cy="31" r="3.5" fill="${INK}"/><path d="M22 46 C26 40 38 40 42 46" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    ),
  fwd: () => svg(`<path d="M32 58 V18 M14 32 L32 10 L50 32" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`),
  uturn: () => svg(`<path d="M18 58 V28 C18 12 46 12 46 28 V44 M34 34 L46 48 L58 34" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  help: () => svg(`<circle cx="32" cy="32" r="26" fill="#5ad1ff" stroke="${INK}" stroke-width="4"/><path d="M24 24 C24 14 40 14 40 24 C40 31 32 31 32 39" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="48" r="4" fill="#fff"/>`),
  tv: () => IC.monitor(),
  exit: () =>
    svg(
      `<rect x="6" y="14" width="52" height="36" rx="6" fill="#1fae5b" stroke="${INK}" stroke-width="4"/><circle cx="22" cy="24" r="4" fill="#fff"/><path d="M22 28 L20 38 L14 44 M20 38 L26 44 M21 31 L28 34" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M36 32 H52 M46 26 L52 32 L46 38" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    ),
};

/** desenho de um acessório (crachá) */
export function accSvg(kind: string, col: string): string {
  const st = `fill="${col}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
  switch (kind) {
    case 'cap':
      return svg(`<path d="M10 40 C10 18 46 14 48 38 Z" ${st}/><path d="M44 38 L60 42 L44 44 Z" ${st}/>`);
    case 'beanie':
      return svg(`<path d="M10 46 C10 20 54 20 54 46 Z" ${st}/><rect x="8" y="42" width="48" height="10" rx="4" ${st}/><circle cx="32" cy="16" r="6" fill="#fff" stroke="${INK}" stroke-width="3"/>`);
    case 'bow':
      return svg(`<path d="M32 32 L8 16 V48 Z" ${st}/><path d="M32 32 L56 16 V48 Z" ${st}/><circle cx="32" cy="32" r="7" ${st}/>`);
    case 'chef':
      return svg(`<rect x="16" y="34" width="32" height="20" rx="3" ${st}/><circle cx="20" cy="28" r="10" ${st}/><circle cx="44" cy="28" r="10" ${st}/><circle cx="32" cy="20" r="12" ${st}/>`);
    case 'crown':
      return svg(`<path d="M8 50 L10 18 L22 32 L32 12 L42 32 L54 18 L56 50 Z" ${st}/>`);
    case 'flower':
      return svg(
        [0, 72, 144, 216, 288].map((a) => `<circle cx="${32 + Math.cos((a * Math.PI) / 180) * 14}" cy="${32 + Math.sin((a * Math.PI) / 180) * 14}" r="10" ${st}/>`).join('') +
          `<circle cx="32" cy="32" r="8" fill="#ffd34a" stroke="${INK}" stroke-width="3"/>`,
      );
    case 'glasses':
      return svg(`<circle cx="18" cy="34" r="12" fill="#bfeaff" stroke="${INK}" stroke-width="5"/><circle cx="46" cy="34" r="12" fill="#bfeaff" stroke="${INK}" stroke-width="5"/><path d="M30 32 H34" stroke="${INK}" stroke-width="5"/>`);
    case 'scarf':
      return svg(`<path d="M8 22 C20 30 44 30 56 22 L56 34 C44 42 20 42 8 34 Z" ${st}/><path d="M40 36 L46 58 L36 58 L32 38 Z" ${st}/>`);
    case 'bag':
      return svg(`<path d="M20 22 C20 8 44 8 44 22" fill="none" stroke="${INK}" stroke-width="5"/><rect x="10" y="22" width="44" height="34" rx="6" ${st}/>`);
  }
  return svg('');
}

export function stampSvg(shape: string, col: string, size = 64): string {
  const st = `fill="${col}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
  let s = '';
  if (shape === 'star') s = `<path d="M32 5 L40 23 L59 24 L44 37 L49 57 L32 46 L15 57 L20 37 L5 24 L24 23 Z" ${st}/>`;
  else if (shape === 'heart') s = `<path d="M32 56 C10 40 4 28 10 18 C16 9 28 10 32 20 C36 10 48 9 54 18 C60 28 54 40 32 56 Z" ${st}/>`;
  else if (shape === 'circle') s = `<circle cx="32" cy="32" r="24" ${st}/>`;
  else if (shape === 'square') s = `<rect x="9" y="9" width="46" height="46" rx="6" ${st}/>`;
  else s = `<path d="M32 6 L58 54 L6 54 Z" ${st}/>`;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${s}</svg>`;
}

/** camada de HUD de um modo */
export class ModeUi {
  readonly el: HTMLDivElement;
  private panel: HTMLElement | null = null;
  private pop: (() => void) | null = null;
  constructor(
    readonly root: HTMLElement,
    cls: string,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'ano-hud ' + cls;
    root.appendChild(this.el);
  }
  get panelOpen(): boolean {
    return !!this.panel;
  }
  open(html: string, onClose?: () => void, cls = 'ano-panel'): HTMLElement {
    this.close();
    const p = document.createElement('div');
    p.className = cls;
    p.setAttribute('data-touch-ignore', '');
    p.innerHTML = html;
    (p as HTMLElement & { _c?: () => void })._c = onClose;
    this.root.appendChild(p);
    this.panel = p;
    this.pop = pushBack(() => {
      this.pop = null;
      this.close();
    });
    p.querySelectorAll<HTMLElement>('[data-x]').forEach((b) => b.addEventListener('click', () => this.close()));
    return p;
  }
  card(html: string, onClose?: () => void, closable = true, extra = ''): HTMLElement {
    return this.open(`<div class="ano-card ano-res ${extra}">${closable ? `<button class="ano-x" data-x>${IC.close()}</button>` : ''}${html}</div>`, onClose);
  }
  close(): void {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    this.pop?.();
    this.pop = null;
    const f = (p as HTMLElement & { _c?: () => void })._c;
    p.remove();
    f?.();
  }
  toast(text: string, icon = '', warn = false): void {
    this.el.querySelectorAll('.ano-toast').forEach((e) => e.remove());
    const s = document.createElement('div');
    s.className = 'ano-toast' + (warn ? ' warn' : '');
    s.innerHTML = `<span class="ic">${icon.startsWith('<svg') ? icon : esc(icon)}</span><span>${esc(text)}</span>`;
    this.el.appendChild(s);
    setTimeout(() => s.remove(), 3300);
  }
  stamp(ok: boolean, text: string): void {
    this.el.querySelectorAll('.ano-stamp').forEach((e) => e.remove());
    const s = document.createElement('div');
    s.className = 'ano-stamp ' + (ok ? 'ok' : 'no');
    s.innerHTML = `<i>${ok ? IC.check() : IC.cross()}</i>${esc(text)}`;
    this.el.appendChild(s);
    setTimeout(() => s.remove(), 1700);
  }
  shake(): void {
    this.root.classList.remove('ano-shake');
    void this.root.offsetWidth;
    this.root.classList.add('ano-shake');
  }
  dispose(): void {
    this.close();
    this.el.remove();
  }
}

/** "data" do crachá: calendário com o número da noite */
export function dateSvg(n: number, size = 40): string {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect x="6" y="10" width="52" height="48" rx="7" fill="#fff" stroke="${INK}" stroke-width="4"/><rect x="6" y="10" width="52" height="14" rx="6" fill="#ff4f6a" stroke="${INK}" stroke-width="4"/><path d="M20 4 V16 M44 4 V16" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><text x="32" y="51" text-anchor="middle" font-family="Fredoka,Arial,sans-serif" font-weight="700" font-size="26" fill="${INK}">${n}</text></svg>`;
}
