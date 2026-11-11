/* ============================================================
 *  ANOMALIAS — HUD em DOM: relógio, perigo, tarefas, botões grandes
 *  (câmera, usar, caderno, monitor), visor da foto, carimbos, avisos,
 *  e os painéis (caderno de fotos, monitor de câmeras, escolher item).
 *  Ícones primeiro, texto curto: a criança não precisa ler.
 * ============================================================ */
import { t } from '../../../i18n';
import { pushBack } from '../../../core/back';
import { bindButton, type BoundButton } from '../../../ui/touch';
import type { ItemDef, RoomDef } from '../maps/types';
import { IC, itemSvg } from './icons';
import { esc } from './util';

export interface HudCb {
  camera(): void;
  shutter(): void;
  lower(): void;
  monitor(): void;
  notebook(): void;
  pause(): void;
  use(down: boolean): void;
  skipMemorize(): void;
}

export class Hud {
  readonly el: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private btns: BoundButton[] = [];
  private clockEl: HTMLElement;
  private nightEl: HTMLElement;
  private dangerEl: HTMLElement;
  private dangerBar: HTMLElement;
  private tasksEl: HTMLElement;
  private useEl: HTMLElement;
  private useIc: HTMLElement;
  private ring: SVGCircleElement;
  private carryEl: HTMLElement;
  private memEl: HTMLElement;
  private vig: HTMLElement;
  private lastTasks = '';
  private lastUse = '';
  private lastClock = '';
  private panelPop: (() => void) | null = null;
  private panel: HTMLElement | null = null;

  constructor(
    readonly root: HTMLElement,
    cb: HudCb,
  ) {
    const el = document.createElement('div');
    el.className = 'ano-hud';
    el.innerHTML = `
<div class="ano-vig"></div>
<div class="ano-tl ano-g">
  <div class="ano-clock"><i>${IC.moon()}</i><b>00:00</b><em>1</em></div>
  <div class="ano-danger"><i>${IC.bocudo()}</i><div class="bar"><b></b></div></div>
  <div class="ano-tasks"></div>
</div>
<div class="ano-tr ano-g ano-norm">
  <button class="ano-btn" data-k="book" aria-label="${esc(t('ano.notebook', 'Caderno'))}">${IC.book()}<span class="dot"></span></button>
  <button class="ano-btn" data-k="mon" aria-label="${esc(t('ano.monitor', 'Câmeras'))}">${IC.monitor()}<span class="dot"></span></button>
  <button class="ano-btn sm ano-pause" data-k="pause" aria-label="${esc(t('ano.pause', 'Pausa'))}">II</button>
</div>
<div class="ano-vf ano-ph"><i></i><i></i><i></i><i></i><span class="cross"></span><span class="rec">REC</span></div>
<div class="ano-br ano-g">
  <div class="ano-carry"></div>
  <button class="ano-btn ano-use ano-norm" data-k="use"><span class="ic"></span><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" stroke-dasharray="289" stroke-dashoffset="289"/></svg></button>
  <button class="ano-btn ano-cam ano-norm" data-k="cam" aria-label="${esc(t('ano.camera', 'Câmera'))}">${IC.camera()}</button>
  <button class="ano-btn ano-lower ano-ph" data-k="lower">${IC.down()}</button>
  <button class="ano-btn ano-shut ano-ph" data-k="shut" aria-label="${esc(t('ano.snap', 'Tirar foto'))}">${IC.shutter()}</button>
</div>
<div class="ano-mem" hidden><i>${IC.eye()}</i><span>${esc(t('ano.memorize', 'Olhe tudo com calma e lembre como as salas são!'))}</span><b>60</b><button class="ano-go" data-k="go"><i>${IC.play()}</i>${esc(t('ano.ready', 'Pronto!'))}</button></div>
<div class="ano-flash"></div>`;
    root.appendChild(el);
    this.el = el;
    this.clockEl = this.q('.ano-clock b');
    this.nightEl = this.q('.ano-clock em');
    this.dangerEl = this.q('.ano-danger');
    this.dangerBar = this.q('.ano-danger .bar b');
    this.tasksEl = this.q('.ano-tasks');
    this.useEl = this.q('[data-k="use"]');
    this.useIc = this.q('[data-k="use"] .ic');
    this.ring = this.el.querySelector('.ring circle') as SVGCircleElement;
    this.carryEl = this.q('.ano-carry');
    this.memEl = this.q('.ano-mem');
    this.vig = this.q('.ano-vig');
    const bind = (k: string, onPress: () => void, onRelease?: () => void) =>
      this.btns.push(bindButton(this.q(`[data-k="${k}"]`), { onPress: () => onPress(), onRelease: onRelease ? () => onRelease() : undefined }));
    bind('book', () => cb.notebook());
    bind('mon', () => cb.monitor());
    bind('pause', () => cb.pause());
    bind('cam', () => cb.camera());
    bind('lower', () => cb.lower());
    bind('shut', () => cb.shutter());
    bind('use', () => cb.use(true), () => cb.use(false));
    bind('go', () => cb.skipMemorize());
  }

  /* ------------------------------ estado ------------------------------ */
  setClock(min: number, night: number): void {
    const h = Math.floor(min / 60),
      m = Math.floor(min % 60);
    const s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (s + night === this.lastClock) return;
    this.lastClock = s + night;
    this.clockEl.textContent = s;
    this.nightEl.textContent = String(night);
  }
  setDanger(k: number, hunt: boolean): void {
    this.dangerBar.style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`;
    this.dangerEl.classList.toggle('hot', k > 0.7);
    this.dangerEl.classList.toggle('hunt', hunt);
    this.vig.classList.toggle('red', hunt || k > 0.85);
  }
  setTasks(list: { icon: string; done: boolean; item?: ItemDef }[]): void {
    const key = list.map((x) => x.icon + x.done + (x.item?.id ?? '')).join('|');
    if (key === this.lastTasks) return;
    this.lastTasks = key;
    this.tasksEl.innerHTML = list.map((x) => `<div class="ano-task${x.done ? ' done' : ''}">${esc(x.icon)}${x.item ? `<span class="it">${itemSvg(x.item)}</span>` : ''}</div>`).join('');
  }
  setCarry(it: ItemDef | null): void {
    this.carryEl.classList.toggle('on', !!it);
    this.carryEl.innerHTML = it ? itemSvg(it) : '';
  }
  /** botão usar: ícone (emoji ou svg), bloqueado (cinza) e progresso 0..1 */
  setUse(icon: string | null, blocked = false, prog = 0): void {
    const key = (icon ?? '') + blocked;
    if (key !== this.lastUse) {
      this.lastUse = key;
      this.useEl.classList.toggle('on', !!icon);
      this.useEl.classList.toggle('no', blocked);
      this.useIc.innerHTML = icon ? (icon.startsWith('<svg') ? icon : esc(icon)) : '';
    }
    this.ring.style.strokeDashoffset = String(289 * (1 - Math.max(0, Math.min(1, prog))));
  }
  setPhoto(on: boolean): void {
    this.el.classList.toggle('photo', on);
  }
  setMonitorMode(on: boolean): void {
    this.el.classList.toggle('mon', on);
  }
  alert(k: 'book' | 'mon', on: boolean): void {
    this.q(`[data-k="${k}"]`).classList.toggle('alert', on);
  }
  glow(k: 'book' | 'mon' | 'cam', on: boolean): void {
    this.q(`[data-k="${k}"]`).classList.toggle('glow', on);
  }
  memorize(sec: number | null): void {
    this.memEl.hidden = sec == null;
    if (sec != null) this.q('.ano-mem b').textContent = String(Math.ceil(sec));
  }

  /* ------------------------------ efeitos ------------------------------ */
  flash(): void {
    const f = this.q('.ano-flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
  polaroid(url: string, ok: boolean): void {
    const p = document.createElement('div');
    p.className = 'ano-polar';
    p.innerHTML = `<img src="${url}" alt=""><i>${ok ? IC.check() : IC.cross()}</i>`;
    this.el.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
  stamp(ok: boolean, text: string): void {
    this.el.querySelectorAll('.ano-stamp').forEach((e) => e.remove());
    const s = document.createElement('div');
    s.className = 'ano-stamp ' + (ok ? 'ok' : 'no');
    s.innerHTML = `<i>${ok ? IC.check() : IC.cross()}</i>${esc(text)}`;
    this.el.appendChild(s);
    setTimeout(() => s.remove(), 1700);
  }
  toast(text: string, icon = '', warn = false): void {
    this.el.querySelectorAll('.ano-toast').forEach((e) => e.remove());
    const s = document.createElement('div');
    s.className = 'ano-toast' + (warn ? ' warn' : '');
    s.innerHTML = `<span class="ic">${icon.startsWith('<svg') ? icon : esc(icon)}</span><span>${esc(text)}</span>`;
    this.el.appendChild(s);
    setTimeout(() => s.remove(), 3300);
  }
  shake(): void {
    this.root.classList.remove('ano-shake');
    void this.root.offsetWidth;
    this.root.classList.add('ano-shake');
  }

  /* ------------------------------ painéis ------------------------------ */
  get panelOpen(): boolean {
    return !!this.panel;
  }
  closePanel(): void {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    this.panelPop?.();
    this.panelPop = null;
    const f = (p as HTMLElement & { _onClose?: () => void })._onClose;
    p.remove();
    f?.();
  }
  private openPanel(html: string, onClose?: () => void, cls = 'ano-panel'): HTMLElement {
    this.closePanel();
    const p = document.createElement('div');
    p.className = cls;
    p.setAttribute('data-touch-ignore', '');
    p.innerHTML = html;
    (p as HTMLElement & { _onClose?: () => void })._onClose = onClose;
    this.root.appendChild(p);
    this.panel = p;
    this.panelPop = pushBack(() => {
      this.panelPop = null;
      this.closePanel();
    });
    p.querySelectorAll<HTMLElement>('[data-x]').forEach((b) => b.addEventListener('click', () => this.closePanel()));
    return p;
  }

  /** caderno: fotos de referência de cada sala (tocar = ampliar) */
  notebook(rooms: RoomDef[], shots: Map<string, string>, roomName: (r: RoomDef) => string, onClose?: () => void, focus?: string): void {
    const rot = (i: number) => ((i * 37) % 7) - 3;
    const list = rooms.filter((r) => shots.has(r.id));
    const pol = (r: RoomDef, i: number) =>
      `<button class="ano-pol" data-r="${esc(r.id)}" style="--r:${rot(i)}deg"><img src="${shots.get(r.id)}" alt=""><div><em>${esc(r.icon ?? '🚪')}</em>${esc(roomName(r))}</div></button>`;
    const p = this.openPanel(
      `<div class="ano-card ano-book"><button class="ano-x" data-x>${IC.close()}</button><div class="ano-h"><i>${IC.book()}</i>${esc(t('ano.bookTitle', 'Como tudo deve ser'))}</div><div class="ano-pol-grid">${list.map(pol).join('')}</div></div>`,
      onClose,
    );
    const open = (id: string) => {
      const r = rooms.find((x) => x.id === id);
      if (!r) return;
      p.querySelector('.ano-big')?.remove();
      const b = document.createElement('div');
      b.className = 'ano-big';
      b.innerHTML = `<button class="ano-x" data-y>${IC.close()}</button><div class="ano-pol"><img src="${shots.get(id)}" alt=""><div><em>${esc(r.icon ?? '🚪')}</em>${esc(roomName(r))}</div></div>`;
      b.addEventListener('click', () => b.remove());
      p.appendChild(b);
    };
    p.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.addEventListener('click', () => open(b.dataset.r!)));
    if (focus) open(focus);
  }

  /**
   * monitor de câmeras: o turno desenha a imagem no canvas; aqui só moldura e botões.
   * `cams` = lista achatada (sala + índice); `pick(i)` troca; `alertRooms` ganham ponto vermelho.
   */
  monitor(cams: { room: RoomDef; k: number }[], idx: number, roomName: (r: RoomDef) => string, ref: (roomId: string) => string | undefined, pick: (i: number) => void, onClose: () => void, alertRooms: Set<string>): (i: number) => void {
    const p = this.openPanel(
      `<div class="bezel"></div><div class="lbl"><em></em><span></span><b>REC</b></div>
<button class="ano-btn nav l" data-d="-1">${IC.left()}</button><button class="ano-btn nav r" data-d="1">${IC.right()}</button>
<button class="ref" data-ref hidden><img alt=""><div><i>${IC.book()}</i>${esc(t('ano.before', 'Antes'))}</div></button>
<div class="tabs">${cams.map((c, i) => `<button class="tab" data-i="${i}">${esc(c.room.icon ?? '🚪')}${alertRooms.has(c.room.id) ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
<button class="ano-btn close" data-x>${IC.close()}</button>`,
      onClose,
      'ano-mon',
    );
    let cur = idx;
    const show = (i: number) => {
      cur = (i + cams.length) % cams.length;
      const c = cams[cur];
      (p.querySelector('.lbl em') as HTMLElement).textContent = c.room.icon ?? '🚪';
      (p.querySelector('.lbl span') as HTMLElement).textContent = `CAM ${cur + 1} · ${roomName(c.room)}`;
      p.querySelectorAll('.tab').forEach((b, j) => b.classList.toggle('on', j === cur));
      p.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
      const r = ref(c.room.id);
      const rb = p.querySelector('[data-ref]') as HTMLElement;
      rb.hidden = !r || c.k !== 0;
      if (r) (rb.querySelector('img') as HTMLImageElement).src = r;
      pick(cur);
    };
    p.querySelectorAll<HTMLElement>('[data-d]').forEach((b) => bindButton(b, { onPress: () => show(cur + Number(b.dataset.d)) }));
    p.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i))));
    p.querySelector('[data-ref]')!.addEventListener('click', () => {
      const c = cams[cur];
      const r = ref(c.room.id);
      if (!r) return;
      const big = document.createElement('div');
      big.className = 'ano-big';
      big.innerHTML = `<div class="ano-pol"><img src="${r}" alt=""><div><em>${esc(c.room.icon ?? '🚪')}</em>${esc(roomName(c.room))}</div></div>`;
      big.addEventListener('click', () => big.remove());
      p.appendChild(big);
    });
    show(idx);
    return show;
  }

  /** escolher 1 item (armário de remédios...) — `want` mostra o pedido em fácil */
  choose(items: ItemDef[], onPick: (id: string) => boolean, title: string, icon: string, want?: ItemDef | null): void {
    const p = this.openPanel(
      `<div class="ano-card"><button class="ano-x" data-x>${IC.close()}</button><div class="ano-h"><i style="font-size:26px;line-height:30px;text-align:center">${esc(icon)}</i>${esc(title)}</div>${
        want ? `<div class="ano-want">${esc(t('ano.needs', 'Pedido:'))}<i>${itemSvg(want)}</i></div>` : ''
      }<div class="ano-choose">${items.map((it) => `<button class="ano-opt" data-o="${esc(it.id)}">${itemSvg(it)}</button>`).join('')}</div></div>`,
    );
    p.querySelectorAll<HTMLElement>('[data-o]').forEach((b) =>
      b.addEventListener('click', () => {
        if (onPick(b.dataset.o!)) this.closePanel();
        else {
          b.classList.remove('bad');
          void b.offsetWidth;
          b.classList.add('bad');
        }
      }),
    );
  }

  /** painel genérico (pausa / resultado); devolve o elemento */
  card(html: string, onClose?: () => void, closable = true): HTMLElement {
    return this.openPanel(`<div class="ano-card ano-res">${closable ? `<button class="ano-x" data-x>${IC.close()}</button>` : ''}${html}</div>`, onClose);
  }

  dispose(): void {
    this.closePanel();
    for (const b of this.btns) b.destroy();
    this.el.remove();
  }
}
