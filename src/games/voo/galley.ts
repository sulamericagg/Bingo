/* ============================================================
 *  POUSO FORÇADO — copa do serviço de bordo (sobreposição, o avião
 *  continua voando). Montagem por ícones, na ordem mostrada:
 *   ① bandeja → ② comida → ③ forno (macarrão) → ④ bebida (segure
 *   para encher até a faixa verde) → Pronto (vai para o carrinho).
 *  Errar não trava: a bandeja errada vira reclamação na entrega.
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../3d/common/sfx';
import { tap } from '../../core/haptics';
import { vIcon } from './icons';
import { DRINKS, MAINS, seatLabel, Sim, type Order } from './sim';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const HEAT_S = 2.2;
const FILL_S = 1.6;
const ZONE: [number, number] = [0.72, 0.95];

export function mainName(m: number): string {
  return m === 1 ? t('voo.f.sand', 'Sanduíche') : m === 2 ? t('voo.f.pasta', 'Macarrão quente') : '';
}
export function drinkName(d: number): string {
  return d === 1 ? t('voo.f.water', 'Água') : d === 2 ? t('voo.f.juice', 'Suco') : d === 3 ? t('voo.f.milk', 'Leite') : '';
}

export class Galley {
  readonly el: HTMLDivElement;
  private sel = -1;
  private tray = false;
  private main = 0;
  private drink = 0;
  private hot = 0;
  /** 0..1 aquecendo; -1 parado */
  private heat = -1;
  private fill = 0;
  private full = 0;
  private pouring = 0;
  private spill = 0;
  private sig = '';
  private nudgeT = 0;
  private offs: (() => void)[] = [];

  constructor(
    layer: HTMLElement,
    private sim: Sim,
    private done: (o: Order, main: number, drink: number, hot: number, full: number) => void,
    private close: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'voo-galley';
    this.el.innerHTML = `
      <h3>${vIcon('tray', 26)}<span>${esc(t('voo.g.title', 'Copa: monte a bandeja'))}</span><button class="voo-btn round red" data-x aria-label="${esc(t('voo.hg.exit', 'Sair'))}">${vIcon('close', 24)}</button></h3>
      <div class="vg-orders"></div>
      <div class="vg-main">
        <div class="vg-steps"></div>
        <div class="vg-tray"><div class="vg-plate"></div><div class="vg-cup"><i></i><b></b></div></div>
        <div class="vg-shelf">
          <button data-i="tray">${vIcon('tray', 34)}<small>${esc(t('voo.g.tray', 'Bandeja'))}</small></button>
          <button data-i="m1">${vIcon('sand', 34)}<small>${esc(mainName(1))}</small></button>
          <button data-i="m2">${vIcon('pasta', 34)}<small>${esc(t('voo.f.pastaS', 'Macarrão'))}</small></button>
          <button data-i="oven">${vIcon('oven', 34)}<small>${esc(t('voo.g.oven', 'Forno'))}</small><em></em></button>
          <button data-i="d1">${vIcon('water', 34)}<small>${esc(drinkName(1))}</small></button>
          <button data-i="d2">${vIcon('juice', 34)}<small>${esc(drinkName(2))}</small></button>
          <button data-i="d3">${vIcon('milk', 34)}<small>${esc(drinkName(3))}</small></button>
          <button data-i="trash">${vIcon('trash', 34)}<small>${esc(t('voo.g.trash', 'Recomeçar'))}</small></button>
        </div>
      </div>
      <div class="vg-foot"><p></p><button class="voo-btn green" data-ok>${vIcon('cart', 24)}<span>${esc(t('voo.g.ok', 'Pronto: pro carrinho'))}</span></button></div>`;
    layer.appendChild(this.el);
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, k: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(k, fn as EventListener);
      this.offs.push(() => el.removeEventListener(k, fn as EventListener));
    };
    on(this.el.querySelector('[data-x]')!, 'click', () => this.close());
    on(this.el.querySelector('[data-ok]')!, 'click', () => this.finish());
    on(this.el.querySelector('.vg-orders')!, 'click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-o]') as HTMLElement | null;
      if (!b) return;
      const id = +b.dataset.o!;
      if (id !== this.sel) {
        this.sel = id;
        this.reset();
        sfx.click();
      }
    });
    // prateleira: toque (comida/forno/bandeja) ou SEGURAR (bebida: encher até a faixa verde)
    const shelf = this.el.querySelector('.vg-shelf') as HTMLElement;
    on(shelf, 'pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (!b) return;
      e.preventDefault();
      const i = b.dataset.i!;
      if (i[0] === 'd') {
        if (!this.tray) return this.nudge(t('voo.g.needTray', 'Primeiro a bandeja!'));
        const d = +i[1];
        if (this.drink !== d) {
          this.drink = d;
          this.fill = 0;
          this.full = 0;
        }
        this.pouring = 1;
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* */
        }
        return;
      }
      this.pick(i);
    });
    const stop = () => {
      if (!this.pouring) return;
      this.pouring = 0;
      if (this.fill >= ZONE[0] && this.fill <= ZONE[1]) {
        this.full = 1;
        sfx.sparkle();
        tap('light');
      } else if (this.fill < ZONE[0]) this.nudge(t('voo.g.more', 'Encha mais: até a faixa verde'));
    };
    on(shelf, 'pointerup', stop);
    on(shelf, 'pointercancel', stop);
    on(window, 'blur', stop);
    this.render(true);
  }

  private nudge(msg: string): void {
    const p = this.el.querySelector('.vg-foot p') as HTMLElement;
    p.textContent = msg;
    p.classList.remove('shake');
    void p.offsetWidth;
    p.classList.add('shake');
    this.nudgeT = performance.now() + 1800;
    tap('light');
  }
  private reset(): void {
    this.tray = false;
    this.main = this.drink = this.hot = this.full = 0;
    this.fill = 0;
    this.heat = -1;
    this.spill = 0;
  }
  private order(): Order | undefined {
    return this.sim.orders.find((o) => o.id === this.sel);
  }
  private pick(i: string): void {
    if (i === 'trash') {
      this.reset();
      sfx.drop();
      return;
    }
    if (i === 'tray') {
      this.tray = true;
      sfx.pick();
      return;
    }
    if (!this.tray) return this.nudge(t('voo.g.needTray', 'Primeiro a bandeja!'));
    if (i === 'm1' || i === 'm2') {
      this.main = +i[1];
      this.hot = 0;
      this.heat = -1;
      sfx.pick();
      return;
    }
    if (i === 'oven') {
      if (this.main !== 2) return this.nudge(t('voo.g.ovenNo', 'O forno é para o macarrão'));
      if (this.hot || this.heat >= 0) return;
      this.heat = 0;
      sfx.click();
    }
  }
  private finish(): void {
    const o = this.order();
    if (!o) return this.nudge(t('voo.g.pickOrder', 'Escolha um pedido'));
    if (!this.tray) return this.nudge(t('voo.g.needTray', 'Primeiro a bandeja!'));
    if (this.heat >= 0) return this.nudge(t('voo.g.wait', 'Espere o forno'));
    this.done(o, this.main, this.drink, this.hot, this.full);
  }

  update(dt: number): void {
    if (this.heat >= 0) {
      this.heat += dt / HEAT_S;
      if (this.heat >= 1) {
        this.heat = -1;
        this.hot = 1;
        sfx.sparkle();
      }
    }
    if (this.pouring) {
      this.fill += dt / FILL_S;
      if (this.fill > 1.05) {
        // transbordou: limpa e começa de novo
        this.fill = 0;
        this.full = 0;
        this.pouring = 0;
        this.spill = 0.6;
        sfx.drop();
        this.nudge(t('voo.g.spill', 'Derramou! Solte na faixa verde'));
      }
    }
    this.spill = Math.max(0, this.spill - dt);
    this.render(false);
  }

  /** só redesenha o que mudou */
  private render(force: boolean): void {
    const s = this.sim;
    const open = s.orders.filter((o) => o.tray < 0 && o.bot < 0);
    if (!open.some((o) => o.id === this.sel)) {
      this.sel = open[0]?.id ?? -1;
      this.reset();
    }
    const o = this.order();
    // pedidos (abas)
    const os = open.map((x) => `${x.id}:${Math.ceil((x.t / x.tmax) * 10)}`).join(',') + '|' + this.sel;
    if (force || os !== this.sig) {
      this.sig = os;
      (this.el.querySelector('.vg-orders') as HTMLElement).innerHTML = open.length
        ? open
            .map((x) => {
              const q = s.pax[x.pax];
              const k = Math.max(0, x.t / x.tmax);
              return `<button data-o="${x.id}" class="${x.id === this.sel ? 'sel' : ''}"><b>${esc(q ? seatLabel(q.seat) : '?')}</b>${x.main ? vIcon(MAINS[x.main], 26) : ''}${x.drink ? vIcon(DRINKS[x.drink], 26) : ''}<i style="width:${Math.round(k * 100)}%;background:${k < 0.35 ? '#ff4d6a' : '#5ef08a'}"></i></button>`;
            })
            .join('')
        : `<span class="none">${esc(t('voo.g.none', 'Nenhum pedido agora'))}</span>`;
    }
    // receita (passos na ordem)
    const steps: { ico: string; ok: boolean }[] = [];
    if (o) {
      steps.push({ ico: 'tray', ok: this.tray });
      if (o.main) steps.push({ ico: MAINS[o.main], ok: this.main === o.main });
      if (o.main === 2) steps.push({ ico: 'oven', ok: !!this.hot });
      if (o.drink) steps.push({ ico: DRINKS[o.drink], ok: this.drink === o.drink && !!this.full });
    }
    const next = steps.findIndex((x) => !x.ok);
    const ss = steps.map((x, i) => `${x.ico}${x.ok ? 1 : 0}${i === next ? 'n' : ''}`).join(',');
    const stEl = this.el.querySelector('.vg-steps') as HTMLElement;
    if (force || stEl.dataset.s !== ss) {
      stEl.dataset.s = ss;
      stEl.innerHTML = steps.map((x, i) => `<span class="${x.ok ? 'ok' : ''} ${i === next ? 'next' : ''}"><em>${i + 1}</em>${vIcon(x.ico, 30)}</span>`).join('<i>›</i>');
    }
    // bandeja
    const wrongMain = !!o && !!this.main && this.main !== o.main;
    const wrongDrink = !!o && !!this.drink && this.drink !== o.drink;
    const ts = `${this.tray}|${this.main}|${this.hot}|${this.heat >= 0}|${this.drink}|${wrongMain}|${wrongDrink}`;
    const trEl = this.el.querySelector('.vg-tray') as HTMLElement;
    if (force || trEl.dataset.s !== ts) {
      trEl.dataset.s = ts;
      trEl.classList.toggle('on', this.tray);
      (this.el.querySelector('.vg-plate') as HTMLElement).innerHTML = this.main ? `<span class="${wrongMain ? 'bad' : ''} ${this.hot ? 'hot' : ''}">${vIcon(MAINS[this.main], 44)}</span>` : '';
      (this.el.querySelector('.vg-cup b') as HTMLElement).innerHTML = this.drink ? `<span class="${wrongDrink ? 'bad' : ''}">${vIcon(DRINKS[this.drink], 22)}</span>` : '';
    }
    const cup = this.el.querySelector('.vg-cup') as HTMLElement;
    cup.style.setProperty('--liq', this.drink === 1 ? '#8fe3ff' : this.drink === 3 ? '#ffffff' : '#ff9a3a');
    (cup.querySelector('i') as HTMLElement).style.height = Math.round(Math.min(1, this.fill) * 100) + '%';
    cup.classList.toggle('full', !!this.full);
    cup.classList.toggle('spill', this.spill > 0);
    cup.style.visibility = this.tray ? '' : 'hidden';
    const ov = this.el.querySelector('[data-i="oven"] em') as HTMLElement;
    ov.style.background = this.heat >= 0 ? `conic-gradient(#ff8a2a ${this.heat * 360}deg, transparent 0)` : this.hot ? '#ffb02e' : '';
    // destaque do próximo botão
    const want = next < 0 || !o ? '' : steps[next].ico;
    this.el.querySelectorAll<HTMLElement>('.vg-shelf [data-i]').forEach((b) => {
      const i = b.dataset.i!;
      const ico = i === 'tray' ? 'tray' : i === 'oven' ? 'oven' : i[0] === 'm' ? MAINS[+i[1]] : i[0] === 'd' ? DRINKS[+i[1]] : '';
      b.classList.toggle('next', !!want && ico === want);
      b.classList.toggle('pour', i[0] === 'd' && this.pouring > 0 && this.drink === +i[1]);
    });
    const okB = this.el.querySelector('[data-ok]') as HTMLButtonElement;
    const ready = !!o && this.tray && next < 0;
    okB.classList.toggle('next', ready);
    okB.disabled = !o || !this.tray;
    const p = this.el.querySelector('.vg-foot p') as HTMLElement;
    if (performance.now() > this.nudgeT) {
      p.classList.remove('shake');
      const txt = !o
        ? t('voo.g.none', 'Nenhum pedido agora')
        : this.drink && !this.full && next >= 0 && steps[next].ico === DRINKS[this.drink]
          ? t('voo.g.hold', 'Segure a bebida e solte na faixa verde')
          : ready
            ? t('voo.g.ready', 'Tudo certo! Leve para o carrinho')
            : t('voo.g.follow', 'Siga os números: toque no ícone que pisca');
      if (p.textContent !== txt) p.textContent = txt;
    }
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.el.remove();
  }
}
