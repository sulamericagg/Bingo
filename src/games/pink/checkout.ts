/* ============================================================
 *  BLOOP PINK — caixa (atendimento manual): passar os itens (bip), cobrar no
 *  cartão ou no dinheiro montando o troco com notas e moedas. Ícones primeiro.
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { money, type Product } from './catalog';
import { ic } from './icons';
import { thumbUrl } from './thumb';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const MONEY = [50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1];

export interface CheckoutJob {
  items: { p: Product; price: number }[];
  /** 'card' | 'cash' */
  pay: 'card' | 'cash';
  /** leitor automático (caixa com leitor) */
  auto: boolean;
  onDone(ok: { wrongChange: number; secs: number }): void;
  onCancel(): void;
}

export class CheckoutUI {
  readonly el: HTMLDivElement;
  private scanned = 0;
  private given: number[] = [];
  private paid = 0;
  private stage: 'scan' | 'pay' = 'scan';
  private t0 = performance.now();
  private wrong = 0;
  private timer = 0;
  private total: number;
  constructor(
    parent: HTMLElement,
    private job: CheckoutJob,
  ) {
    this.total = Math.round(job.items.reduce((a, b) => a + b.price, 0) * 100) / 100;
    const d = document.createElement('div');
    d.className = 'pk-ck';
    parent.appendChild(d);
    this.el = d;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (job.pay === 'cash') {
      // cliente paga com a nota "redonda" acima do total
      const notes = [2, 5, 10, 20, 50, 100, 200];
      const n = notes.find((v) => v >= this.total && v - this.total < v * 0.9) ?? Math.ceil(this.total / 10) * 10;
      this.paid = n === this.total ? n + 5 : n;
    }
    this.render();
    if (job.auto) this.autoScan();
  }
  private autoScan(): void {
    const step = () => {
      if (this.stage !== 'scan') return;
      this.scanOne();
      if (this.stage === 'scan') this.timer = window.setTimeout(step, 260);
    };
    this.timer = window.setTimeout(step, 300);
  }
  private scanOne(): void {
    if (this.scanned >= this.job.items.length) return;
    this.scanned++;
    sfx.play('beep');
    if (this.scanned >= this.job.items.length) this.stage = 'pay';
    this.render();
  }
  private get change(): number {
    return Math.round((this.paid - this.total) * 100) / 100;
  }
  private get givenSum(): number {
    return Math.round(this.given.reduce((a, b) => a + b, 0) * 100) / 100;
  }
  private render(): void {
    const j = this.job;
    const items = j.items
      .map((it, i) => `<div class="item${i < this.scanned ? ' done' : i === this.scanned && this.stage === 'scan' && !j.auto ? ' next' : ''}" data-i="${i}" role="button" aria-label="${esc(it.p.name)}"><img src="${thumbUrl(it.p)}" width="50" height="42" alt=""></div>`)
      .join('');
    let pay = '';
    if (this.stage === 'scan') pay = `<div class="pay">${ic('hand', 22)}<b>${esc(j.auto ? t('pink.ck.auto', 'Passando...') : t('pink.ck.scan', 'Toque nos produtos para passar'))}</b></div>`;
    else if (j.pay === 'card')
      pay = `<div class="pay"><button class="pk-b g" data-a="card">${ic('card', 26)}${esc(t('pink.ck.card', 'Cobrar no cartão'))} ${esc(money(this.total))}</button></div>`;
    else {
      const ch = this.change;
      const g = this.givenSum;
      const ok = Math.abs(g - ch) < 0.001;
      pay = `<div class="chg">${ic('cash', 24)}<span>${esc(t('pink.ck.paid', 'Recebido'))} <b>${esc(money(this.paid))}</b></span><span>${esc(t('pink.ck.change', 'Troco'))} <b>${esc(money(ch))}</b></span><span class="${g > ch + 0.001 ? 'bad' : ok ? 'ok' : ''}">${ic('hand', 20)} <b>${esc(money(g))}</b></span></div>
        <div class="money">${MONEY.map((v) => `<button class="${v >= 2 ? 'bill' : 'cn'}" data-m="${v}">${v >= 1 ? v : v.toFixed(2).replace('0.', ',')}</button>`).join('')}
          <button class="pk-b w" data-a="undo" style="padding:6px 10px">${ic('rotate', 20)}</button>
          <button class="pk-b g" data-a="give" style="padding:6px 12px" ${g > 0 || ch === 0 ? '' : 'disabled'}>${ic('check', 22)}${esc(t('pink.ck.give', 'Entregar'))}</button></div>`;
    }
    this.el.innerHTML = `<div class="hd">${ic('register', 26)}<span>${esc(t('pink.ck.title', 'Caixa'))}</span><span class="tot">${esc(money(this.total))}</span>
      <button class="pk-b w" data-a="x" style="padding:4px 8px" aria-label="${esc(t('pink.cancel', 'Cancelar'))}">${ic('close', 20)}</button></div>
      <div class="items">${items}</div>${pay}`;
    this.el.querySelectorAll<HTMLElement>('.item').forEach((e) =>
      e.addEventListener('click', () => {
        if (this.stage === 'scan' && !j.auto && +e.dataset.i! === this.scanned) this.scanOne();
        else if (this.stage === 'scan' && !j.auto) {
          // toque fora de ordem também passa (criança não precisa acertar a ordem)
          this.scanOne();
        }
      }),
    );
    this.el.querySelector('[data-a=x]')?.addEventListener('click', () => this.cancel());
    this.el.querySelector('[data-a=card]')?.addEventListener('click', () => {
      sfx.play('card');
      this.finish();
    });
    this.el.querySelectorAll<HTMLElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        this.given.push(+b.dataset.m!);
        sfx.play('coin');
        this.render();
      }),
    );
    this.el.querySelector('[data-a=undo]')?.addEventListener('click', () => {
      this.given.pop();
      sfx.play('tap');
      this.render();
    });
    this.el.querySelector('[data-a=give]')?.addEventListener('click', () => {
      if (Math.abs(this.givenSum - this.change) < 0.001) this.finish();
      else {
        this.wrong++;
        sfx.play('wrong');
        this.el.animate([{ transform: 'translate(-50%,0)' }, { transform: 'translate(calc(-50% - 8px),0)' }, { transform: 'translate(calc(-50% + 8px),0)' }, { transform: 'translate(-50%,0)' }], { duration: 260 });
      }
    });
  }
  private finish(): void {
    clearTimeout(this.timer);
    sfx.play('cash');
    this.el.remove();
    this.job.onDone({ wrongChange: this.wrong, secs: (performance.now() - this.t0) / 1000 });
  }
  cancel(): void {
    clearTimeout(this.timer);
    this.el.remove();
    this.job.onCancel();
  }
  /** testes: completa tudo */
  autoComplete(): void {
    while (this.stage === 'scan') this.scanOne();
    if (this.job.pay === 'cash') this.given = [this.change];
    this.finish();
  }
}
