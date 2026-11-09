/** Peças de UI do social: painel (sheet), toast, menu de contexto, miniaturas de personagem. */
import { t } from '../i18n';
import { icon, type IconName } from '../ui/icons';
import { renderAvatarPreview, renderSkinPreview } from '../game/preview';
import { skinById } from '../game/skins';
import type { AvatarData } from '../game/avatar';
import { drawEmoteIcon, ensureSocialCss } from './emotes';

export interface Sheet {
  root: HTMLDivElement;
  sheet: HTMLDivElement;
  head: HTMLDivElement;
  body: HTMLDivElement;
  close(): void;
  onClose(fn: () => void): void;
}

export function openSheet(title: string, ico: IconName, opts: { small?: boolean; id?: string } = {}): Sheet {
  ensureSocialCss();
  if (opts.id) document.getElementById(opts.id)?.remove();
  const root = document.createElement('div');
  root.className = 'sc-overlay';
  if (opts.id) root.id = opts.id;
  root.innerHTML = `<div class="sc-sheet${opts.small ? ' small' : ''}" role="dialog" aria-modal="true">
    <div class="sc-head"><h2>${icon(ico, { size: 28 })}<span></span></h2><button class="sc-x" aria-label="${t('social.close', 'Fechar')}">${icon('close', { size: 22 })}</button></div>
    <div class="sc-body"></div></div>`;
  (root.querySelector('h2 span') as HTMLElement).textContent = title;
  const closers: (() => void)[] = [];
  const close = () => {
    root.remove();
    closers.splice(0).forEach((f) => f());
  };
  root.querySelector('.sc-x')!.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  document.body.appendChild(root);
  return {
    root,
    sheet: root.querySelector('.sc-sheet') as HTMLDivElement,
    head: root.querySelector('.sc-head') as HTMLDivElement,
    body: root.querySelector('.sc-body') as HTMLDivElement,
    close,
    onClose: (fn) => closers.push(fn),
  };
}

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
export function toast(msg: string, ico: IconName = 'warning', ms = 2800): void {
  ensureSocialCss();
  toastEl?.remove();
  const el = document.createElement('div');
  el.className = 'sc-toast';
  el.innerHTML = icon(ico, { size: 22 }) + '<span></span>';
  (el.lastElementChild as HTMLElement).textContent = msg;
  document.body.appendChild(el);
  toastEl = el;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), ms);
}

/** Menu flutuante perto de (x, y). */
export function popMenu(x: number, y: number, items: { label: string; icon: IconName; danger?: boolean; run: () => void }[]): void {
  ensureSocialCss();
  document.querySelector('.sc-menu')?.remove();
  const m = document.createElement('div');
  m.className = 'sc-menu';
  for (const it of items) {
    const b = document.createElement('button');
    if (it.danger) b.className = 'danger';
    b.innerHTML = icon(it.icon, { size: 20 }) + '<span></span>';
    (b.lastElementChild as HTMLElement).textContent = it.label;
    b.onclick = (e) => {
      e.stopPropagation();
      m.remove();
      it.run();
    };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2))}px`;
  m.style.top = `${Math.max(8, Math.min(innerHeight - r.height - 8, y))}px`;
  const off = (e: Event) => {
    if (!m.contains(e.target as Node)) {
      m.remove();
      document.removeEventListener('pointerdown', off, true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
}

/* miniaturas em cache (dataURL por skin) — o chat pode ter muitas mensagens */
const thumbs = new Map<string, string>();
export function skinThumb(skin: string, size = 36, avatar?: unknown): HTMLImageElement {
  const key = `${skin}:${size}:${avatar ? JSON.stringify(avatar).length : 0}`;
  let url = thumbs.get(key);
  if (!url) {
    let c: HTMLCanvasElement;
    try {
      c =
        skin === 'custom' && avatar && typeof avatar === 'object' && (avatar as AvatarData).parts
          ? renderAvatarPreview(avatar as AvatarData, size, 0.6, { zoom: 1.05 })
          : renderSkinPreview(skinById(skin), size, 0.4, { backdrop: false });
      url = c.toDataURL();
    } catch {
      url = '';
    }
    thumbs.set(key, url);
  }
  const img = new Image(size, size);
  img.alt = '';
  img.decoding = 'async';
  if (url) img.src = url;
  return img;
}

const iconThumbs = new Map<string, string>();
export function emoteThumb(code: string, size = 22): HTMLImageElement {
  let url = iconThumbs.get(code + size);
  if (!url) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size * d);
    const x = c.getContext('2d')!;
    x.scale((size * d) / 36, (size * d) / 36);
    x.translate(18, 18);
    drawEmoteIcon(x, code, 0.1);
    url = c.toDataURL();
    iconThumbs.set(code + size, url);
  }
  const img = new Image(size, size);
  img.alt = '';
  img.src = url;
  return img;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`;
}
