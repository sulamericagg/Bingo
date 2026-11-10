/* ============================================================
 *  LENHADORES — preferências de controle por toque (localStorage):
 *  tamanho do analógico, sensibilidade da câmera, fixo/flutuante, canhoto.
 *  Usado pelo HUD 2D/3D e pelo Mundo Aberto.
 * ============================================================ */
import { t } from '../../i18n';

export interface TouchCfg {
  /** 0 pequeno, 1 médio, 2 grande */
  size: 0 | 1 | 2;
  /** multiplicador da câmera (0.5..2) */
  sens: number;
  floating: boolean;
  lefty: boolean;
}

const KEY = 'bw-floresta-touch';
let cur: TouchCfg | null = null;
const subs = new Set<(c: TouchCfg) => void>();

export function touchCfg(): TouchCfg {
  if (cur) return cur;
  const d: TouchCfg = { size: 1, sens: 1, floating: true, lefty: false };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') {
      if (o.size === 0 || o.size === 1 || o.size === 2) d.size = o.size;
      if (typeof o.sens === 'number' && o.sens >= 0.4 && o.sens <= 2.5) d.sens = o.sens;
      if (typeof o.floating === 'boolean') d.floating = o.floating;
      if (typeof o.lefty === 'boolean') d.lefty = o.lefty;
    }
  } catch {
    /* padrão */
  }
  cur = d;
  return d;
}
export function setTouchCfg(p: Partial<TouchCfg>): void {
  const c = Object.assign(touchCfg(), p);
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* sem espaço */
  }
  for (const f of subs) f(c);
}
export function onTouchCfg(f: (c: TouchCfg) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
/** raio do analógico (px) */
export const joyRadius = (c: TouchCfg = touchCfg()): number => [44, 56, 70][c.size];

/** zona morta 0.15 com saída reescalada (0..1) e curva leve */
export function shapeStick(dx: number, dy: number, R: number): [number, number] {
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return [0, 0];
  const m = Math.min(1, d / R);
  const k = m < 0.15 ? 0 : ((m - 0.15) / 0.85) ** 1.2;
  return [(dx / d) * k, (dy / d) * k];
}

/** painel "Controles" (modal pequeno) */
export function openControls(root: HTMLElement): void {
  const old = root.querySelector('.fl-ctlpanel');
  if (old) {
    old.remove();
    return;
  }
  const c = touchCfg();
  const m = document.createElement('div');
  m.className = 'fl-ctlpanel';
  const seg = (k: string, opts: [string, string][], val: string) =>
    `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button class="${v === val ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  m.innerHTML = `<div class="hd"><b>${t('floresta.ctl.title', 'Controles')}</b><button class="x" data-close="1">✕</button></div>
    <label>${t('floresta.ctl.size', 'Tamanho do analógico')}</label>${seg('size', [['0', t('floresta.ctl.s', 'P')], ['1', t('floresta.ctl.m', 'M')], ['2', t('floresta.ctl.l', 'G')]], String(c.size))}
    <label>${t('floresta.ctl.sens', 'Sensibilidade da câmera')}</label>${seg('sens', [['0.6', t('floresta.ctl.low', 'Baixa')], ['1', t('floresta.ctl.mid', 'Média')], ['1.5', t('floresta.ctl.high', 'Alta')]], String(c.sens))}
    <label>${t('floresta.ctl.mode', 'Analógico')}</label>${seg('floating', [['1', t('floresta.ctl.float', 'Flutuante')], ['0', t('floresta.ctl.fixed', 'Fixo')]], c.floating ? '1' : '0')}
    <label>${t('floresta.ctl.hand', 'Mão')}</label>${seg('lefty', [['0', t('floresta.ctl.right', 'Destro')], ['1', t('floresta.ctl.lefty', 'Canhoto (inverte lados)')]], c.lefty ? '1' : '0')}`;
  const stop = (e: Event) => e.stopPropagation();
  m.addEventListener('pointerdown', stop);
  m.addEventListener('click', (e) => {
    e.stopPropagation();
    const el = e.target as HTMLElement;
    if (el.closest('[data-close]')) {
      m.remove();
      return;
    }
    const b = el.closest('button[data-v]') as HTMLElement | null;
    const s = el.closest('.seg') as HTMLElement | null;
    if (!b || !s) return;
    const k = s.dataset.k!;
    const v = b.dataset.v!;
    for (const x of Array.from(s.children)) x.classList.toggle('on', x === b);
    if (k === 'size') setTouchCfg({ size: Number(v) as 0 | 1 | 2 });
    else if (k === 'sens') setTouchCfg({ sens: Number(v) });
    else if (k === 'floating') setTouchCfg({ floating: v === '1' });
    else if (k === 'lefty') setTouchCfg({ lefty: v === '1' });
  });
  root.appendChild(m);
}
