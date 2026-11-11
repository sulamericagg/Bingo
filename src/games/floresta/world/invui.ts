/* ============================================================
 *  MUNDO — interface do inventário (toque primeiro):
 *  - barra de 9 casas embaixo (toque seleciona)
 *  - mochila em grade: arrastar e soltar pilhas, OU tocar para pegar
 *    e tocar de novo para pôr; segurar = pega metade; toque duplo =
 *    manda direto para o outro lado (barra ↔ mochila ↔ baú)
 *  - grade de criar 2×2 (mochila) ou 3×3 (bancada/bigorna/oficina):
 *    o resultado aparece quando o padrão casa
 *  - livro de receitas: toque numa receita e ela se monta sozinha
 *  - fornalha: entrada, combustível e saída com chama de progresso
 *  - baú: casas do baú + mochila
 * ============================================================ */
import { t } from '../../../i18n';
import { ITEM, ITEMS, RECIPES, cost, gridOf, itemName, layout, matchGrid, stationsFor, type Cat, type Recipe, type Station } from './items';
import { iconURL } from './itemicons';
import { Furnace, HOTBAR, Inventory, Slots, maxStack, type Stack } from './inv';

const CSS = `
.mi-hot{position:absolute;left:50%;bottom:calc(var(--edgeB,10px) + 2px);transform:translateX(-50%);display:flex;gap:3px;pointer-events:auto;z-index:6;background:rgba(20,8,48,.45);padding:3px;border-radius:12px}
.mi-s{position:relative;width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;touch-action:none;-webkit-tap-highlight-color:transparent;flex:none}
.mi-s img{width:30px;height:30px;pointer-events:none;image-rendering:auto}
.mi-s b{position:absolute;right:2px;bottom:0;font-size:11px;font-weight:900;color:#fff;text-shadow:0 1px 0 #2a0b5c,0 0 3px #2a0b5c;pointer-events:none}
.mi-s i{position:absolute;left:4px;right:4px;bottom:3px;height:3px;border-radius:2px;background:#7aff8a;pointer-events:none}
.mi-s.sel{border-color:#ffd34a;background:rgba(255,211,74,.3);box-shadow:0 0 0 2px #ffd34a}
.mi-s.res{width:46px;height:46px;background:rgba(255,211,74,.25);border-color:#ffd34a}
.mi-s.res.no{opacity:.45}
.mi-s.drag{opacity:.35}
.mi-s.ghost{position:fixed;z-index:60;pointer-events:none;background:none;border:none;transform:translate(-50%,-60%) scale(1.15)}
.mi-hname{position:absolute;left:50%;bottom:calc(var(--edgeB,10px) + 72px);transform:translateX(-50%);font-weight:800;font-size:13px;color:#fff;text-shadow:0 1px 0 #2a0b5c,0 0 4px #2a0b5c;pointer-events:none;transition:opacity .4s;white-space:nowrap}
.mi-bag-btn{position:absolute;left:calc(50% + 196px);bottom:calc(var(--edgeB,10px) + 2px);width:44px;height:44px}
.mi-ov{position:absolute;inset:0;z-index:40;background:rgba(14,6,34,.8);display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;font-family:inherit;color:#fff}
.mi-card{background:linear-gradient(#4a2a8a,#2e1660);border:3px solid #2a0b5c;border-radius:18px;box-shadow:0 6px 0 #1a0638;padding:6px 8px 8px;max-width:calc(100vw - 16px);max-height:calc(100vh - 12px);display:flex;flex-direction:column;gap:5px}
.mi-head{display:flex;align-items:center;gap:8px;font-weight:900;font-size:15px}
.mi-head .sp{flex:1}
.mi-body{display:flex;gap:10px;min-height:0}
.mi-col{display:flex;flex-direction:column;gap:5px;align-items:center}
.mi-grid{display:grid;gap:3px}
.mi-row{display:flex;gap:6px;align-items:center}
.mi-arrow{font-size:20px;font-weight:900;color:#ffd34a}
.mi-lbl{font-size:10.5px;font-weight:800;opacity:.85;text-transform:uppercase;letter-spacing:.04em}
.mi-book{width:260px;display:flex;flex-direction:column;gap:4px;min-height:0}
.mi-chips{display:flex;gap:3px;flex-wrap:wrap}
.mi-chip{font:inherit;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:9px;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff}
.mi-chip.on{background:#ffd34a;color:#2a0b5c;border-color:#ffd34a}
.mi-list{overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:3px;padding-right:2px;max-height:min(300px,calc(100vh - 110px));touch-action:pan-y}
.mi-rec{display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:9px;background:rgba(255,255,255,.08);font-size:11.5px;font-weight:700;border:2px solid transparent}
.mi-rec.ok{background:rgba(122,255,138,.15);border-color:rgba(122,255,138,.35)}
.mi-rec img{width:24px;height:24px}
.mi-rec .ing{margin-left:auto;display:flex;gap:1px;align-items:center;font-size:10px;opacity:.9}
.mi-rec .ing img{width:16px;height:16px}
.mi-rec .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mi-flame{width:22px;height:22px;border-radius:50%;background:conic-gradient(#ff7a1a var(--p,0%),rgba(255,255,255,.12) 0)}
.mi-prog{width:46px;height:8px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden}
.mi-prog i{display:block;height:100%;background:#ffd34a;width:0}
.mi-x{width:34px;height:34px}
@media (max-height:380px){.mi-s{width:34px;height:34px}.mi-s img{width:27px;height:27px}.mi-book{width:230px}}
`;
let cssDone = false;
function ensureCss(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function slotHTML(st: Stack | null, ref: string, extra = ''): string {
  let inner = '';
  if (st) {
    inner = `<img src="${iconURL(st.id)}" alt="">`;
    if (st.n > 1) inner += `<b>${st.n}</b>`;
    const dur = ITEM.get(st.id)?.dur;
    if (dur && st.d) {
      const k = Math.max(0, 1 - st.d / dur);
      inner += `<i style="width:${Math.round(k * 30)}px;background:${k > 0.5 ? '#7aff8a' : k > 0.2 ? '#ffd34a' : '#ff5a6a'}"></i>`;
    }
  }
  return `<div class="mi-s ${extra}" data-s="${ref}">${inner}</div>`;
}

/* ------------------------------ barra de baixo ------------------------------ */

export class Hotbar {
  el: HTMLDivElement;
  private name: HTMLDivElement;
  private ver = '';
  private nameT = 0;
  constructor(
    root: HTMLElement,
    private inv: Inventory,
    private onSelect: (i: number) => void,
    onBag: () => void,
  ) {
    ensureCss();
    this.el = document.createElement('div');
    this.el.className = 'mi-hot';
    root.appendChild(this.el);
    this.name = document.createElement('div');
    this.name.className = 'mi-hname';
    root.appendChild(this.name);
    const bag = document.createElement('button');
    bag.className = 'fl-btn round mi-bag-btn';
    bag.setAttribute('aria-label', t('mundo.inv', 'Mochila'));
    bag.innerHTML = `<svg viewBox="0 0 48 48" width="28" height="28"><path d="M12 18h24l3 24H9z" fill="#ffb02e" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/><path d="M18 18c0-8 12-8 12 0" fill="none" stroke="#2a0b5c" stroke-width="3"/><rect x="19" y="26" width="10" height="7" rx="2" fill="#ffd34a" stroke="#2a0b5c" stroke-width="2.5"/></svg>`;
    root.appendChild(bag);
    bag.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onBag();
    });
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const s = (e.target as HTMLElement).closest('[data-s]') as HTMLElement | null;
      if (!s) return;
      const i = +s.dataset.s!.split(':')[1];
      this.onSelect(i);
    });
    this.extra = [bag];
  }
  private extra: HTMLElement[];
  /** chame com frequência: só mexe no DOM quando algo mudou */
  refresh(dt = 0): void {
    const inv = this.inv;
    let v = String(inv.sel);
    for (let i = 0; i < HOTBAR; i++) {
      const s = inv.s[i];
      v += s ? `|${s.id}:${s.n}:${s.d ?? 0}` : '|';
    }
    if (v !== this.ver) {
      const prevSel = this.ver.split('|')[0];
      const prevId = this.ver.split('|')[1 + inv.sel] ?? '';
      this.ver = v;
      let h = '';
      for (let i = 0; i < HOTBAR; i++) h += slotHTML(inv.s[i], 'hot:' + i, i === inv.sel ? 'sel' : '');
      this.el.innerHTML = h;
      const st = inv.s[inv.sel];
      if (String(inv.sel) !== prevSel || (st ? st.id : '') !== prevId.split(':')[0]) {
        this.name.textContent = st ? itemName(st.id) : '';
        this.name.style.opacity = '1';
        this.nameT = 1.6;
      }
    }
    if (this.nameT > 0) {
      this.nameT -= dt;
      if (this.nameT <= 0) this.name.style.opacity = '0';
    }
  }
  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
    for (const e of this.extra) e.style.display = on ? '' : 'none';
  }
  destroy(): void {
    this.el.remove();
    this.name.remove();
    for (const e of this.extra) e.remove();
  }
}

/* ------------------------------ tela do inventário ------------------------------ */

export interface InvOpts {
  inv: Inventory;
  /** estação perto (define a grade e as receitas) */
  station: Station;
  chest?: Slots | null;
  furnace?: Furnace | null;
  creative?: boolean;
  title?: string;
  onClose: () => void;
  onCraft?: (r: Recipe) => void;
  /** algo mudou (para salvar/sincronizar) */
  onChange?: () => void;
}

const CATS: [Cat | 'all', () => string][] = [
  ['all', () => t('mundo.cat.all', 'Tudo')],
  ['ferr', () => t('mundo.cat.tools', 'Ferramentas')],
  ['const', () => t('mundo.cat.build', 'Construir')],
  ['movel', () => t('mundo.cat.furn', 'Móveis')],
  ['comida', () => t('mundo.cat.food', 'Comida')],
  ['maq', () => t('mundo.cat.mach', 'Máquinas')],
  ['rec', () => t('mundo.cat.mat', 'Materiais')],
];

export class InvScreen {
  el: HTMLDivElement;
  private grid: (Stack | null)[];
  private n: number;
  private cur: Stack | null = null;
  private ghost: HTMLDivElement;
  private cat: Cat | 'all' = 'all';
  private onlyOk = false;
  private down: { ref: string; x: number; y: number; t: number; pid: number; dragging: boolean; half: boolean } | null = null;
  private lastTap = { ref: '', t: 0 };
  private lpTimer = 0;
  private furnT = 0;
  private btnDown: { el: HTMLElement; x: number; y: number } | null = null;

  constructor(
    root: HTMLElement,
    private o: InvOpts,
  ) {
    ensureCss();
    this.n = o.chest || o.furnace ? 0 : gridOf(o.station);
    this.grid = new Array(this.n * this.n).fill(null);
    const el = document.createElement('div');
    el.className = 'mi-ov';
    root.appendChild(el);
    this.el = el;
    this.ghost = document.createElement('div');
    this.ghost.className = 'mi-s ghost';
    this.ghost.style.display = 'none';
    el.appendChild(this.ghost);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    // o jogo escuta toques na raiz (olhar/joystick): nada daqui pode vazar para lá
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel'] as const) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev.startsWith('touch') || ev === 'wheel' });
    el.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      this.btnDown = b ? { el: b, x: e.clientX, y: e.clientY } : null;
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.btnDown;
      this.btnDown = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
      const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (b !== d.el && !(b && d.el.contains(b))) {
        const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-a]');
        if (under !== d.el) return;
      }
      const a = d.el.dataset.a!;
      if (a === 'x') this.close();
      else if (a.startsWith('cat:')) {
        this.cat = a.slice(4) as Cat | 'all';
        this.render();
      } else if (a === 'ok') {
        this.onlyOk = !this.onlyOk;
        this.render();
      } else if (a.startsWith('rec:')) this.autofill(+a.slice(4));
      else if (a.startsWith('give:')) this.giveCreative(a.slice(5));
    });
    this.render();
  }

  /* ---------- acesso às casas ---------- */
  private get(ref: string): Stack | null {
    const [k, i] = ref.split(':');
    const n = +i;
    if (k === 'inv' || k === 'hot') return this.o.inv.s[n];
    if (k === 'arm') return this.o.inv.armor.s[n];
    if (k === 'grid') return this.grid[n];
    if (k === 'chest') return this.o.chest?.s[n] ?? null;
    if (k === 'fin') return this.o.furnace?.inp ?? null;
    if (k === 'ffuel') return this.o.furnace?.fuel ?? null;
    if (k === 'fout') return this.o.furnace?.out ?? null;
    return null;
  }
  private set(ref: string, st: Stack | null): void {
    const [k, i] = ref.split(':');
    const n = +i;
    if (st && st.n <= 0) st = null;
    if (k === 'inv' || k === 'hot') this.o.inv.s[n] = st;
    else if (k === 'arm') this.o.inv.armor.s[n] = st;
    else if (k === 'grid') this.grid[n] = st;
    else if (k === 'chest' && this.o.chest) this.o.chest.s[n] = st;
    else if (k === 'fin' && this.o.furnace) this.o.furnace.inp = st;
    else if (k === 'ffuel' && this.o.furnace) this.o.furnace.fuel = st;
    else if (k === 'fout' && this.o.furnace) this.o.furnace.out = st;
  }
  /** a casa aceita este item? */
  private accepts(ref: string, st: Stack): boolean {
    const [k, i] = ref.split(':');
    if (k === 'arm') return ITEM.get(st.id)?.armor?.slot === +i;
    if (k === 'ffuel') return !!ITEM.get(st.id)?.fuel;
    if (k === 'fout' || k === 'res') return false;
    return true;
  }

  /* ---------- toque / arrastar ---------- */
  private slotAt(x: number, y: number): string | null {
    const e = document.elementFromPoint(x, y) as HTMLElement | null;
    const s = e?.closest('[data-s]') as HTMLElement | null;
    return s && this.el.contains(s) ? s.dataset.s! : null;
  }
  private onDown = (e: PointerEvent): void => {
    const ref = this.slotAt(e.clientX, e.clientY);
    if (!ref) return;
    e.preventDefault();
    this.down = { ref, x: e.clientX, y: e.clientY, t: performance.now(), pid: e.pointerId, dragging: false, half: false };
    clearTimeout(this.lpTimer);
    if (!this.cur && this.get(ref))
      this.lpTimer = window.setTimeout(() => {
        if (this.down && !this.down.dragging) {
          this.down.half = true;
          this.takeFrom(ref, true);
          this.down.dragging = true;
          this.moveGhost(this.down.x, this.down.y);
        }
      }, 380);
  };
  private onMove = (e: PointerEvent): void => {
    if (this.cur) this.moveGhost(e.clientX, e.clientY);
    const d = this.down;
    if (!d || d.pid !== e.pointerId || d.dragging) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 9 && !this.cur && this.get(d.ref) && d.ref !== 'res:0') {
      clearTimeout(this.lpTimer);
      d.dragging = true;
      this.takeFrom(d.ref, false);
      this.moveGhost(e.clientX, e.clientY);
    }
  };
  private onUp = (e: PointerEvent): void => {
    clearTimeout(this.lpTimer);
    const d = this.down;
    this.down = null;
    if (!d || d.pid !== e.pointerId) return;
    const target = this.slotAt(e.clientX, e.clientY);
    if (d.dragging) {
      if (target && target !== d.ref) this.dropOn(target);
      else if (target === d.ref && d.half) {
        /* segurou: fica com a metade no cursor */
      } else if (target === d.ref) this.dropOn(d.ref);
      this.render();
      return;
    }
    if (!target) return;
    const now = performance.now();
    if (target === 'res:0') {
      this.craft();
      this.render();
      return;
    }
    // toque duplo: envia direto
    if (!this.cur && this.lastTap.ref === target && now - this.lastTap.t < 320) {
      this.quickMove(target);
      this.lastTap.ref = '';
      this.render();
      return;
    }
    this.lastTap = { ref: target, t: now };
    if (this.cur) this.dropOn(target);
    else if (this.get(target)) this.takeFrom(target, false);
    this.render();
    if (this.cur) this.moveGhost(e.clientX, e.clientY);
  };
  private takeFrom(ref: string, half: boolean): void {
    const st = this.get(ref);
    if (!st) return;
    if (half && st.n > 1) {
      const k = Math.ceil(st.n / 2);
      this.cur = { id: st.id, n: k, ...(st.d ? { d: st.d } : {}) };
      st.n -= k;
    } else {
      this.cur = st;
      this.set(ref, null);
    }
    this.render();
  }
  private dropOn(ref: string): void {
    const c = this.cur;
    if (!c) return;
    if (!this.accepts(ref, c)) return;
    const st = this.get(ref);
    const mx = ref.startsWith('arm') ? 1 : maxStack(c.id);
    if (!st) {
      if (c.n > mx) {
        this.set(ref, { ...c, n: mx });
        c.n -= mx;
      } else {
        this.set(ref, c);
        this.cur = null;
      }
    } else if (st.id === c.id && mx > 1) {
      const k = Math.min(c.n, mx - st.n);
      st.n += k;
      c.n -= k;
      if (c.n <= 0) this.cur = null;
    } else if (c.n <= mx) {
      this.set(ref, c);
      this.cur = st;
    }
    this.o.onChange?.();
  }
  private quickMove(ref: string): void {
    const st = this.get(ref);
    if (!st) return;
    const [k, i] = ref.split(':');
    const inv = this.o.inv;
    let left = st.n;
    if (k === 'chest' || k === 'grid' || k === 'arm' || k === 'fout' || k === 'fin' || k === 'ffuel') left = inv.give(st.id, st.n, st.d);
    else if (this.o.chest) left = this.o.chest.add(st.id, st.n, st.d);
    else if (this.o.furnace) {
      const it = ITEM.get(st.id);
      const f = this.o.furnace;
      if (it?.fuel && (!f.fuel || f.fuel.id === st.id) && !this.isSmeltable(st.id)) {
        if (!f.fuel) {
          f.fuel = st;
          left = 0;
        }
      } else if (!f.inp) {
        f.inp = st;
        left = 0;
      }
    } else if (ITEM.get(st.id)?.armor && k !== 'arm') {
      const s = ITEM.get(st.id)!.armor!.slot;
      if (!inv.armor.s[s]) {
        inv.armor.s[s] = st;
        left = 0;
      }
    } else {
      // barra ↔ mochila
      const n = +i;
      left = n < HOTBAR ? inv.add(st.id, st.n, st.d, HOTBAR) : inv.add(st.id, st.n, st.d, 0, HOTBAR);
    }
    if (left === st.n && left > 0) return;
    if (left > 0) st.n = left;
    else if (st.n > 0 && left === 0) this.set(ref, this.get(ref) === st ? null : this.get(ref));
    this.o.onChange?.();
  }
  private isSmeltable(id: string): boolean {
    return RECIPES.some((r) => r.st === 'fornalha' && r.ing![0][0] === id);
  }
  private moveGhost(x: number, y: number): void {
    const g = this.ghost;
    if (!this.cur) {
      g.style.display = 'none';
      return;
    }
    g.style.display = 'flex';
    g.style.left = x + 'px';
    g.style.top = y + 'px';
  }

  /* ---------- criar ---------- */
  private match(): Recipe | null {
    if (!this.n) return null;
    return matchGrid(
      this.grid.map((s) => (s ? s.id : '')),
      this.n,
      this.o.station,
    );
  }
  private craft(): void {
    const r = this.match();
    if (!r) return;
    const c = this.cur;
    if (c && (c.id !== r.out || c.n + r.n > maxStack(r.out))) return;
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (!s) continue;
      s.n--;
      if (s.n <= 0) this.grid[i] = null;
    }
    if (c) c.n += r.n;
    else this.cur = { id: r.out, n: r.n };
    this.o.onCraft?.(r);
    this.o.onChange?.();
  }
  private clearGrid(): void {
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (s) this.o.inv.give(s.id, s.n, s.d);
      this.grid[i] = null;
    }
  }
  /** livro: monta o padrão da receita com itens da mochila */
  private autofill(ri: number): void {
    const r = RECIPES[ri];
    if (!r) return;
    const inv = this.o.inv;
    if (r.st === 'fornalha') {
      const f = this.o.furnace;
      if (!f) return;
      const id = r.ing![0][0];
      if (f.inp && f.inp.id !== id) {
        inv.give(f.inp.id, f.inp.n);
        f.inp = null;
      }
      const have = inv.count(id);
      if (!have) return;
      const k = Math.min(have, maxStack(id) - (f.inp?.n ?? 0));
      inv.remove(id, k);
      if (f.inp) f.inp.n += k;
      else f.inp = { id, n: k };
      this.render();
      return;
    }
    if (!this.n) return;
    this.clearGrid();
    const need = cost(r);
    for (const [id, k] of need) if (inv.count(id) < k && !this.o.creative) return this.render();
    const g = layout(r, this.n);
    for (let i = 0; i < g.length; i++) {
      if (!g[i]) continue;
      if (!this.o.creative) inv.remove(g[i], 1);
      this.grid[i] = { id: g[i], n: 1 };
    }
    this.o.onChange?.();
    this.render();
  }
  private giveCreative(id: string): void {
    this.cur = { id, n: maxStack(id) };
    this.render();
  }

  /* ---------- desenho ---------- */
  render(): void {
    const o = this.o;
    const inv = o.inv;
    const r = this.match();
    let left = '';
    if (o.chest) {
      const cols = 9;
      let g = '';
      for (let i = 0; i < o.chest.s.length; i++) g += slotHTML(o.chest.s[i], 'chest:' + i);
      left = `<div class="mi-col"><div class="mi-lbl">${o.title ?? t('mundo.chest', 'Baú')}</div><div class="mi-grid" style="grid-template-columns:repeat(${cols},auto);max-height:${o.chest.s.length > 27 ? '170px' : 'none'};overflow-y:auto">${g}</div></div>`;
    } else if (o.furnace) {
      const f = o.furnace;
      const rr = f.inp ? RECIPES.find((x) => x.st === 'fornalha' && x.ing![0][0] === f.inp!.id) : null;
      const p = rr ? Math.min(1, f.prog / (rr.time ?? 6)) : 0;
      left = `<div class="mi-col"><div class="mi-lbl">${t('mundo.i.fornalha', 'Fornalha')}</div>
        <div class="mi-row">${slotHTML(f.inp, 'fin:0')}<div class="mi-prog"><i style="width:${Math.round(p * 100)}%"></i></div>${slotHTML(f.out, 'fout:0', 'res')}</div>
        <div class="mi-row"><div class="mi-flame" style="--p:${f.burnMax ? Math.round((f.burn / f.burnMax) * 100) : 0}%"></div>${slotHTML(f.fuel, 'ffuel:0')}</div>
        <div class="mi-lbl" style="max-width:150px;text-align:center;text-transform:none">${t('mundo.furnHint', 'Minério ou comida em cima, combustível embaixo')}</div></div>`;
    } else {
      let g = '';
      for (let i = 0; i < this.grid.length; i++) g += slotHTML(this.grid[i], 'grid:' + i);
      const res = r ? { id: r.out, n: r.n } : null;
      let arm = '';
      if (o.station === 'mao') for (let i = 0; i < 4; i++) arm += slotHTML(inv.armor.s[i], 'arm:' + i);
      left = `<div class="mi-col"><div class="mi-lbl">${o.station === 'mao' ? t('mundo.craft2', 'Criar') : o.title ?? ''}</div>
        <div class="mi-row"><div class="mi-grid" style="grid-template-columns:repeat(${this.n},auto)">${g}</div><span class="mi-arrow">➜</span>${slotHTML(res, 'res:0', 'res' + (r ? '' : ' no'))}</div>
        ${arm ? `<div class="mi-lbl">${t('mundo.armor', 'Roupa')} · ${t('mundo.def', 'defesa')} ${Math.round(inv.defense())}</div><div class="mi-row">${arm}</div>` : ''}</div>`;
    }
    let bag = '';
    for (let i = HOTBAR; i < inv.s.length; i++) bag += slotHTML(inv.s[i], 'inv:' + i);
    let hot = '';
    for (let i = 0; i < HOTBAR; i++) hot += slotHTML(inv.s[i], 'hot:' + i, i === inv.sel ? 'sel' : '');
    const center = `<div class="mi-col"><div class="mi-lbl">${t('mundo.inv', 'Mochila')}</div><div class="mi-grid" style="grid-template-columns:repeat(9,auto)">${bag}</div><div class="mi-grid" style="grid-template-columns:repeat(9,auto);margin-top:4px">${hot}</div></div>`;
    // livro / catálogo
    let list = '';
    if (o.creative) {
      for (const it of ITEMS) {
        if (this.cat !== 'all' && it.cat !== this.cat && !(this.cat === 'ferr' && (it.cat === 'arma' || it.cat === 'armad'))) continue;
        list += `<div class="mi-rec ok" data-a="give:${it.id}"><img src="${iconURL(it.id)}" alt=""><span class="nm">${it.name()}</span><span class="ing">∞</span></div>`;
      }
    } else {
      const ok = stationsFor(o.station);
      const here = o.furnace ? ['fornalha'] : ok;
      const seen = new Set<string>();
      for (let i = 0; i < RECIPES.length; i++) {
        const rc = RECIPES[i];
        if (!here.includes(rc.st) && !(this.onlyOk === false && !o.furnace && !o.chest)) continue;
        if (o.chest) break;
        const it = ITEM.get(rc.out);
        if (!it) continue;
        if (this.cat !== 'all' && it.cat !== this.cat && !(this.cat === 'ferr' && (it.cat === 'arma' || it.cat === 'armad'))) continue;
        const can = here.includes(rc.st);
        const need = cost(rc);
        let have = can;
        let ing = '';
        for (const [id, k] of need) {
          const enough = inv.count(id) >= k;
          if (!enough) have = false;
          ing += `<img src="${iconURL(id)}" alt="" style="${enough ? '' : 'opacity:.4'}">${k > 1 ? k : ''}`;
        }
        if (this.onlyOk && !have) continue;
        const key = rc.out + ':' + rc.st + ':' + ing;
        if (seen.has(key)) continue;
        seen.add(key);
        const where = can ? '' : ` <small style="opacity:.7">(${this.stName(rc.st)})</small>`;
        list += `<div class="mi-rec ${have ? 'ok' : ''}" data-a="rec:${i}"><img src="${iconURL(rc.out)}" alt=""><span class="nm">${it.name()}${rc.n > 1 ? ' ×' + rc.n : ''}${where}</span><span class="ing">${ing}</span></div>`;
      }
    }
    const chips = CATS.map(([k, nm]) => `<button class="mi-chip ${this.cat === k ? 'on' : ''}" data-a="cat:${k}">${nm()}</button>`).join('') + (o.creative || o.chest ? '' : `<button class="mi-chip ${this.onlyOk ? 'on' : ''}" data-a="ok">✓ ${t('mundo.canMake', 'Dá pra fazer')}</button>`);
    const book = o.chest ? '' : `<div class="mi-book"><div class="mi-lbl">${o.creative ? t('mundo.catalog', 'Catálogo (criativo)') : t('mundo.book', 'Receitas — toque para montar')}</div><div class="mi-chips">${chips}</div><div class="mi-list">${list || `<div style="opacity:.7;font-size:12px">${t('mundo.noRec', 'Nada aqui ainda')}</div>`}</div></div>`;
    const title = o.title ?? (o.station === 'mao' ? t('mundo.inv', 'Mochila') : this.stName(o.station));
    const scroll = (this.el.querySelector('.mi-list') as HTMLElement | null)?.scrollTop ?? 0;
    this.el.innerHTML = `<div class="mi-card"><div class="mi-head"><span>${title}</span><span class="sp"></span><button class="fl-btn round red mi-x" data-a="x" aria-label="${t('floresta.exit', 'Sair')}">✕</button></div><div class="mi-body">${left}${center}${book}</div></div>`;
    this.el.appendChild(this.ghost);
    const L = this.el.querySelector('.mi-list') as HTMLElement | null;
    if (L) L.scrollTop = scroll;
    this.ghost.innerHTML = this.cur ? slotHTML(this.cur, 'cur').replace(/^<div[^>]*>|<\/div>$/g, '') : '';
    if (!this.cur) this.ghost.style.display = 'none';
  }
  private stName(s: Station): string {
    return s === 'bancada' ? t('mundo.i.bancada', 'Bancada') : s === 'bigorna' ? t('mundo.i.bigorna', 'Bigorna') : s === 'oficina' ? t('mundo.i.oficina', 'Oficina de Máquinas') : s === 'fornalha' ? t('mundo.i.fornalha', 'Fornalha') : t('mundo.inv', 'Mochila');
  }

  /** a fornalha anda enquanto a tela está aberta */
  tick(dt: number): void {
    if (!this.o.furnace) return;
    this.furnT += dt;
    if (this.furnT > 0.25) {
      this.furnT = 0;
      if (!this.cur && !this.down) this.render();
    }
  }

  close(): void {
    const inv = this.o.inv;
    if (this.cur) {
      const left = inv.give(this.cur.id, this.cur.n, this.cur.d);
      if (left && this.o.chest) this.o.chest.add(this.cur.id, left);
      this.cur = null;
    }
    this.clearGrid();
    this.el.remove();
    this.o.onChange?.();
    this.o.onClose();
  }
}
