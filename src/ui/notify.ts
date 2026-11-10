/**
 * Avisos compactos e fora do caminho (feedback dos testadores: "as mensagens tapam a visão").
 *
 *  notify(texto, {icon})    → pílula pequena no CANTINHO superior esquerdo (abaixo do HUD), semitransparente,
 *                              máx. 2 visíveis, fila + sem duplicados, ≤ 2 linhas (corta com …), some em ~3,2 s.
 *                              setNotifyAlign('center') centraliza (para jogos com HUD no canto esquerdo).
 *  objective(texto, {icon}) → chip minúsculo e persistente (canto superior direito) com o objetivo atual;
 *                              objective(null) esconde.
 *  bigMoment(texto, {...})  → "momento grande" (subiu de nível, recorde): faixa curta no topo (≤ 1,2 s)
 *                              ou entrada pela lateral ({side:true}). Nunca no centro durante o jogo.
 *  tipChip(texto, {anchor}) → dica pequena dispensável, perto do controle (ou no topo).
 *  setNotifyTop(px)         → distância do topo (abaixo do HUD do jogo atual); resetNotifyTop() volta ao padrão.
 * Respeita safe-area (--safe-top) e não usa a parte de baixo (anúncio/--ad-bottom).
 */
import { icon, type IconName } from './icons';

export interface NotifyOptions {
  icon?: IconName;
  /** cor do realce */
  kind?: 'info' | 'good' | 'warn' | 'bad';
  /** duração (ms). Padrão 3200, limitada a 1500..4500 */
  ms?: number;
  /** chave de deduplicação (padrão: o próprio texto) */
  key?: string;
}

const CSS = `
#nt-root{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));top:calc(var(--nt-top,56px) + env(safe-area-inset-top,0px));z-index:9500;display:flex;flex-direction:column;align-items:flex-start;gap:5px;pointer-events:none;max-width:min(62vw,300px)}
#nt-root.center{left:0;right:0;max-width:none;align-items:center;padding:0 12px}
.nt{display:flex;align-items:center;gap:6px;max-width:100%;padding:4px 10px 4px 7px;border-radius:12px;background:rgba(16,6,40,.62);color:#fff;font:600 12.5px/1.25 var(--font,'Fredoka',system-ui,sans-serif);box-shadow:0 2px 6px rgba(0,0,0,.22),inset 0 0 0 1.5px var(--nt-c,rgba(255,255,255,.18));transform:translateX(-10px);opacity:0;transition:transform .18s ease-out,opacity .25s;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.nt.on{transform:none;opacity:1}
.nt.out{opacity:0;transform:translateX(-8px)}
.nt svg,.nt img{width:16px;height:16px;flex:none}
.nt-obj{position:fixed;right:calc(10px + env(safe-area-inset-right,0px));top:calc(var(--nt-top,56px) + env(safe-area-inset-top,0px));z-index:9499;display:flex;align-items:center;gap:5px;max-width:min(46vw,220px);padding:3px 9px 3px 6px;border-radius:999px;background:rgba(16,6,40,.55);color:#fff;font:600 11.5px/1.2 var(--font,'Fredoka',system-ui,sans-serif);pointer-events:none;opacity:0;transition:opacity .2s}
.nt-obj.on{opacity:1}
.nt-obj span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.nt-obj svg{width:14px;height:14px;flex:none}
.nt span{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.nt b.n{font-size:11px;opacity:.75;margin-left:2px}
.nt.good{--nt-c:#4fd67a}.nt.warn{--nt-c:#ffc94a}.nt.bad{--nt-c:#ff6b8a}
.nt-big{position:fixed;left:50%;top:calc(var(--nt-top,56px) + env(safe-area-inset-top,0px));z-index:9501;pointer-events:none;display:flex;align-items:center;gap:8px;padding:6px 18px;border-radius:999px;background:linear-gradient(90deg,#7b3cff,#ff4fa3);color:#fff;font:800 16px var(--font,'Fredoka',system-ui,sans-serif);letter-spacing:.5px;white-space:nowrap;max-width:86vw;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 14px rgba(0,0,0,.35);transform:translate(-50%,-14px) scale(.9);opacity:0;transition:transform .16s ease-out,opacity .16s}
.nt-big.on{transform:translate(-50%,0) scale(1);opacity:1}
.nt-big small{font-weight:600;font-size:12px;opacity:.85}
.nt-big svg{width:20px;height:20px}
.nt-big.side{left:auto;right:calc(8px + env(safe-area-inset-right,0px));top:calc(var(--nt-top,56px) + 44px + env(safe-area-inset-top,0px));transform:translateX(120%);border-radius:16px 0 0 16px}
.nt-big.side.on{transform:none}
.nt-chip{position:fixed;z-index:9502;display:flex;align-items:center;gap:6px;max-width:min(70vw,260px);padding:5px 6px 5px 10px;border-radius:12px;background:rgba(255,255,255,.95);color:#2a0b5c;font:600 12px/1.25 var(--font,'Fredoka',system-ui,sans-serif);box-shadow:0 3px 10px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;pointer-events:auto;touch-action:manipulation}
.nt-chip.on{opacity:1}
.nt-chip span{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.nt-chip button{font:inherit;border:0;background:#2a0b5c;color:#fff;border-radius:50%;width:28px;height:28px;flex:none;cursor:pointer;line-height:1;font-size:15px}
.nt-chip::after{content:'';position:absolute;left:var(--ax,50%);width:10px;height:10px;background:inherit;transform:translateX(-50%) rotate(45deg)}
.nt-chip.below::after{top:-5px}.nt-chip.above::after{bottom:-5px}.nt-chip.top::after{display:none}
`;

const MAX = 2;
const MAX_CHARS = 90;
interface Item {
  key: string;
  text: string;
  o: NotifyOptions;
  el?: HTMLDivElement;
  timer?: number;
  n: number;
}
let root: HTMLDivElement | null = null;
const visible: Item[] = [];
const queue: Item[] = [];

function ensure(): HTMLDivElement {
  if (root && root.isConnected) return root;
  if (!document.getElementById('nt-css')) {
    const s = document.createElement('style');
    s.id = 'nt-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  root = document.createElement('div');
  root.id = 'nt-root';
  root.setAttribute('aria-live', 'polite');
  document.body.appendChild(root);
  return root;
}

function clip(s: string): string {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS - 1).trimEnd() + '…' : s;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function dur(o: NotifyOptions): number {
  return Math.max(1500, Math.min(4500, o.ms ?? 3200));
}

function render(it: Item): void {
  const el = it.el!;
  el.className = 'nt on' + (it.o.kind && it.o.kind !== 'info' ? ' ' + it.o.kind : '');
  el.innerHTML = (it.o.icon ? icon(it.o.icon, { size: 18 }) : '') + `<span>${esc(it.text)}</span>` + (it.n > 1 ? `<b class="n">×${it.n}</b>` : '');
}

function show(it: Item): void {
  const r = ensure();
  it.el = document.createElement('div');
  it.el.className = 'nt';
  r.appendChild(it.el);
  render(it);
  it.el.classList.remove('on');
  void it.el.offsetWidth;
  it.el.classList.add('on');
  visible.push(it);
  arm(it);
}
function arm(it: Item): void {
  clearTimeout(it.timer);
  it.timer = window.setTimeout(() => hide(it), dur(it.o));
}
function hide(it: Item): void {
  const i = visible.indexOf(it);
  if (i < 0) return;
  visible.splice(i, 1);
  clearTimeout(it.timer);
  const el = it.el!;
  el.classList.add('out');
  setTimeout(() => el.remove(), 200);
  const nx = queue.shift();
  if (nx) show(nx);
}

/** Toast compacto no topo. Retorna uma função que o fecha antes da hora. */
export function notify(text: string, o: NotifyOptions = {}): () => void {
  if (typeof document === 'undefined' || !text) return () => {};
  const t = clip(text);
  const key = o.key ?? t;
  const same = visible.find((v) => v.key === key);
  if (same) {
    // duplicado: conta e renova em vez de empilhar
    same.n++;
    same.text = t;
    render(same);
    arm(same);
    return () => hide(same);
  }
  const q = queue.find((v) => v.key === key);
  if (q) {
    q.n++;
    return () => queue.splice(queue.indexOf(q), 1);
  }
  const it: Item = { key, text: t, o, n: 1 };
  if (visible.length >= MAX) {
    // fila curta: o mais antigo sai mais cedo para dar a vez
    queue.push(it);
    if (queue.length > 4) queue.shift();
    const old = visible[0];
    clearTimeout(old.timer);
    old.timer = window.setTimeout(() => hide(old), 500);
  } else show(it);
  return () => (visible.includes(it) ? hide(it) : queue.includes(it) && queue.splice(queue.indexOf(it), 1));
}

let bigEl: HTMLDivElement | null = null;
let bigT = 0;
/** "Momento grande" (subiu de nível, recorde): faixa curta no topo ou entrada lateral. ≤ 1,2 s. */
export function bigMoment(text: string, o: { icon?: IconName; sub?: string; side?: boolean; ms?: number; color?: string } = {}): void {
  if (typeof document === 'undefined') return;
  ensure();
  bigEl?.remove();
  const el = document.createElement('div');
  el.className = 'nt-big' + (o.side ? ' side' : '');
  if (o.color) el.style.background = o.color;
  el.innerHTML = (o.icon ? icon(o.icon, { size: 20 }) : '') + `<span>${esc(clip(text))}</span>` + (o.sub ? ` <small>${esc(clip(o.sub))}</small>` : '');
  document.body.appendChild(el);
  bigEl = el;
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(bigT);
  bigT = window.setTimeout(
    () => {
      el.classList.remove('on');
      setTimeout(() => el.remove(), 200);
    },
    Math.min(1200, o.ms ?? 1100),
  );
}

const chips = new Map<string, HTMLDivElement>();
/**
 * Dica pequena e dispensável (×). Com `anchor`, aparece colada ao controle (acima se ele estiver
 * na metade de baixo da tela); sem, aparece no topo. `id` evita repetir a mesma dica.
 * Retorna função para fechar.
 */
export function tipChip(text: string, o: { anchor?: HTMLElement; id?: string; ms?: number; onClose?: () => void } = {}): () => void {
  if (typeof document === 'undefined') return () => {};
  ensure();
  const id = o.id ?? text;
  chips.get(id)?.remove();
  const el = document.createElement('div');
  el.className = 'nt-chip';
  el.innerHTML = `<span>${esc(clip(text))}</span><button type="button" aria-label="OK">×</button>`;
  document.body.appendChild(el);
  chips.set(id, el);
  let tm = 0;
  const close = () => {
    clearTimeout(tm);
    if (chips.get(id) === el) chips.delete(id);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 200);
    o.onClose?.();
  };
  el.querySelector('button')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    close();
  });
  const place = () => {
    const w = el.offsetWidth,
      h = el.offsetHeight,
      W = window.innerWidth,
      H = window.innerHeight;
    if (o.anchor && o.anchor.isConnected) {
      const r = o.anchor.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const x = Math.max(8, Math.min(W - w - 8, cx - w / 2));
      const above = r.top > H / 2;
      el.classList.add(above ? 'above' : 'below');
      el.style.left = x + 'px';
      el.style.top = (above ? r.top - h - 10 : r.bottom + 10) + 'px';
      el.style.setProperty('--ax', Math.max(12, Math.min(w - 12, cx - x)) + 'px');
    } else {
      el.classList.add('top');
      el.style.left = Math.max(8, (W - w) / 2) + 'px';
      el.style.top = `calc(var(--nt-top,56px) + 40px + env(safe-area-inset-top,0px))`;
    }
  };
  place();
  void el.offsetWidth;
  el.classList.add('on');
  tm = window.setTimeout(close, o.ms ?? 5000);
  return close;
}

/** Distância (px) do topo para os avisos — use a altura do HUD do jogo. */
export function setNotifyTop(px: number): void {
  document.documentElement.style.setProperty('--nt-top', Math.round(px) + 'px');
}
export function resetNotifyTop(): void {
  document.documentElement.style.removeProperty('--nt-top');
}
/** Fecha tudo (ao sair de um jogo). */
export function clearNotify(): void {
  queue.length = 0;
  [...visible].forEach(hide);
  chips.forEach((c) => c.remove());
  chips.clear();
  bigEl?.remove();
  objEl?.remove();
  objEl = null;
  root?.classList.remove('center');
}

/** Alinhamento dos avisos: 'left' (padrão, cantinho) ou 'center'. */
export function setNotifyAlign(a: 'left' | 'center'): void {
  ensure().classList.toggle('center', a === 'center');
}

let objEl: HTMLDivElement | null = null;
/** Chip pequeno e persistente com o objetivo atual (canto superior direito). `null` esconde. */
export function objective(text: string | null, o: { icon?: IconName } = {}): void {
  if (typeof document === 'undefined') return;
  if (!text) {
    objEl?.classList.remove('on');
    return;
  }
  ensure();
  if (!objEl || !objEl.isConnected) {
    objEl = document.createElement('div');
    objEl.className = 'nt-obj';
    document.body.appendChild(objEl);
  }
  objEl.innerHTML = (o.icon ? icon(o.icon, { size: 14 }) : '') + `<span>${esc(clip(text))}</span>`;
  void objEl.offsetWidth;
  objEl.classList.add('on');
}
