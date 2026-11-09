/** Utilitários de DOM compartilhados pelas telas (sem dependências do jogo). */
import { icon, type IconName } from './icons';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));

export const COIN = '<i class="coin"></i>';
export const GEM = '<i class="gem"></i>';

export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('pt-BR');

/** "05:12:09" até `ms`. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Milissegundos até a meia-noite local. */
export function msToMidnight(now = new Date()): number {
  const m = new Date(now);
  m.setHours(24, 0, 0, 0);
  return m.getTime() - now.getTime();
}

/** Placa brilhante com ícone (+ acento opcional). */
export function plate(main: IconName, color: string, accent?: IconName, cls = ''): string {
  return `<div class="p-ico plate plate-${color} ${cls}">${icon(main)}${accent ? `<span class="p-accent">${icon(accent)}</span>` : ''}</div>`;
}

/** Anima um número de `from` até `to` em `ms`. */
export function countUp(el: HTMLElement, to: number, ms = 900, from = 0, prefix = ''): void {
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = prefix + fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
