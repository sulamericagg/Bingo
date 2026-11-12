/* ============================================================
 *  BLOOP PINK — caixa (atendimento manual), o momento mais gostoso da loja:
 *  1) passar os itens (bip);
 *  2) CARTÃO: maquininha "aproxime" → bip → aprovado;  PIX: QR na tela → celular → plim;
 *  3) DINHEIRO: a nota do cliente vai para a gaveta; você toca nas notas/moedas da gaveta
 *     e elas VOAM e EMPILHAM no balcão; quando o balcão = troco, ENTREGAR.
 *     A gaveta é de verdade (conta quantas tem): às vezes falta troco → "Tem trocado?".
 *  Cartão e Pix caem na conta do banco; dinheiro vivo fica no caixa.
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { money, type Product } from './catalog';
import { ic } from './icons';
import { thumbUrl } from './thumb';
import { addTo, customerNote, DENOMS, isCoin, makeChange, type Drawer } from './money';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmtC = (c: number) => money(c / 100);
const lab = (c: number) => (c >= 100 ? String(c / 100) : (c / 100).toFixed(2).replace('0.', ','));

export type PayKind = 'card' | 'cash' | 'pix';
export interface CheckoutResult {
  wrongChange: number;
  secs: number;
  pay: PayKind;
  /** pediu trocado / sem troco */
  noChange?: boolean;
}
export interface CheckoutJob {
  items: { p: Product; price: number }[];
  pay: PayKind;
  /** leitor automático (caixa com leitor) */
  auto: boolean;
  /** gaveta do caixa (mexe nela de verdade) */
  drawer: Drawer;
  onDone(r: CheckoutResult): void;
  onCancel(): void;
}

export class CheckoutUI {
  readonly el: HTMLDivElement;
  private scanned = 0;
  /** peças tiradas da gaveta (no balcão) */
  private given: number[] = [];
  private paid: number[] = [];
  private stage: 'scan' | 'pay' = 'scan';
  private t0 = performance.now();
  private wrong = 0;
  private timer = 0;
  private total: number;
  private pay: PayKind;
  private askedChange = false;
  private noChange = false;
  private cardStep = 0;
  constructor(
    parent: HTMLElement,
    private job: CheckoutJob,
  ) {
    this.total = Math.round(job.items.reduce((a, b) => a + b.price, 0) * 100);
    this.pay = job.pay;
    const d = document.createElement('div');
    d.className = 'pk-ck';
    parent.appendChild(d);
    this.el = d;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (this.pay === 'cash') this.paid = customerNote(this.total);
    this.render();
    if (job.auto) this.autoScan();
  }
  private get paidSum(): number {
    return this.paid.reduce((a, b) => a + b, 0);
  }
  private get change(): number {
    return this.paidSum - this.total;
  }
  private get givenSum(): number {
    return this.given.reduce((a, b) => a + b, 0);
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
    if (this.scanned >= this.job.items.length) {
      this.stage = 'pay';
      if (this.pay === 'cash') {
        // a nota do cliente entra na gaveta
        sfx.play('drawer');
        for (const n of this.paid) addTo(this.job.drawer, n);
      }
    }
    this.render();
  }
  private money1(c: number, cls = ''): string {
    return isCoin(c) ? `<i class="cn c${c} ${cls}">${lab(c)}</i>` : `<i class="bill b${c} ${cls}">${lab(c)}</i>`;
  }
  private render(): void {
    const j = this.job;
    const items = j.items
      .map((it, i) => `<div class="item${i < this.scanned ? ' done' : i === this.scanned && this.stage === 'scan' && !j.auto ? ' next' : ''}" data-i="${i}" role="button" aria-label="${esc(it.p.name)}"><img src="${thumbUrl(it.p)}" width="50" height="42" alt=""></div>`)
      .join('');
    let body = '';
    if (this.stage === 'scan') body = `<div class="items">${items}</div><div class="pay">${ic('hand', 22)}<b>${esc(j.auto ? t('pink.ck.auto', 'Passando...') : t('pink.ck.scan', 'Toque nos produtos para passar'))}</b></div>`;
    else if (this.pay === 'card')
      body = `<div class="pos"><div class="mach ${this.cardStep ? 'ok' : ''}"><div class="scr">${this.cardStep ? ic('check', 30) : `<b>${esc(fmtC(this.total))}</b>`}</div><div class="keys">${'<i></i>'.repeat(9)}</div></div>
        <button class="pk-b g big" data-a="card">${ic('card', 30)}${esc(t('pink.ck.tap', 'Aproximar o cartão'))}</button></div>`;
    else if (this.pay === 'pix')
      body = `<div class="pos"><div class="qr ${this.cardStep ? 'ok' : ''}">${this.cardStep ? ic('check', 44) : qrSvg(this.total)}</div><div class="pixv">${ic('pix', 26)}<b>${esc(fmtC(this.total))}</b></div>
        <button class="pk-b g big" data-a="card">${ic('pix', 26)}${esc(t('pink.ck.pix', 'Mostrar o QR do Pix'))}</button></div>`;
    else {
      const ch = this.change;
      const g = this.givenSum;
      const ok = g === ch;
      const can = !!makeChange(j.drawer, ch - g) || ok;
      // pilhas por valor: moedas sobem em torre, notas fazem leque
      const piles = new Map<number, number>();
      for (const c of this.given) piles.set(c, (piles.get(c) ?? 0) + 1);
      const lastC = this.given[this.given.length - 1];
      const stack = [...piles.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([c, n]) => `<span class="pile${isCoin(c) ? ' coins' : ''}">${Array.from({ length: n }, (_, i) => this.money1(c, i === n - 1 && c === lastC ? 'last' : '').replace('<i ', `<i style="--k:${i}" `)).join('')}</span>`)
        .join('');
      body = `<div class="cash">
        <div class="cl"><div class="lbl">${ic('note', 20)}${esc(t('pink.ck.paid', 'Recebido'))}</div><div class="rcv">${this.paid.map((c) => this.money1(c)).join('')}</div><div class="lbl">${esc(t('pink.ck.change', 'Troco'))} <b class="big">${esc(fmtC(ch))}</b></div></div>
        <div class="counter ${g > ch ? 'bad' : ok ? 'ok' : ''}"><div class="stk">${stack}</div><b>${esc(fmtC(g))}</b></div>
        <div class="acts"><button class="pk-b w" data-a="undo" aria-label="${esc(t('pink.ck.undo', 'Devolver'))}">${ic('rotate', 22)}</button>
          <button class="pk-b g" data-a="give" ${g > 0 || ch === 0 ? '' : 'disabled'}>${ic('check', 24)}${esc(t('pink.ck.give', 'Entregar'))}</button></div></div>
        <div class="drawer">${DENOMS.map((c) => {
          const n = j.drawer[c] ?? 0;
          return `<button class="tray${n ? '' : ' empty'}" data-m="${c}" aria-label="${esc(fmtC(c))}">${this.money1(c)}<small>${n}</small></button>`;
        }).join('')}${!can && !this.askedChange ? `<button class="pk-b o nochg" data-a="ask">${ic('question', 22)}${esc(t('pink.ck.ask', 'Sem troco! Tem trocado?'))}</button>` : ''}</div>`;
    }
    this.el.innerHTML = `<div class="hd">${ic('register', 26)}<span>${esc(t('pink.ck.title', 'Caixa'))}</span>${this.stage === 'pay' ? `<span class="pk-paytag">${ic(this.pay === 'cash' ? 'cash' : this.pay, 20)}</span>` : ''}<span class="tot">${esc(fmtC(this.total))}</span>
      <button class="pk-b w" data-a="x" style="padding:4px 8px" aria-label="${esc(t('pink.cancel', 'Cancelar'))}">${ic('close', 20)}</button></div>${body}`;
    this.bind();
  }
  private bind(): void {
    const j = this.job;
    this.el.querySelectorAll<HTMLElement>('.item').forEach((e) =>
      e.addEventListener('click', () => {
        if (this.stage === 'scan' && !j.auto) this.scanOne();
      }),
    );
    this.el.querySelector('[data-a=x]')?.addEventListener('click', () => this.cancel());
    this.el.querySelector('[data-a=card]')?.addEventListener('click', () => {
      if (this.cardStep) return;
      this.cardStep = 1;
      sfx.play(this.pay === 'pix' ? 'sparkle' : 'card');
      this.render();
      this.timer = window.setTimeout(() => this.finish(), 650);
    });
    this.el.querySelectorAll<HTMLElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = +b.dataset.m!;
        if (!(j.drawer[c] > 0)) {
          sfx.play('wrong');
          b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 200 });
          return;
        }
        j.drawer[c]--;
        this.given.push(c);
        sfx.play(isCoin(c) ? 'coinDrop' : 'note', { rate: 0.9 + Math.min(0.6, this.given.length * 0.05) });
        const from = b.getBoundingClientRect();
        this.render();
        this.fly(from);
      }),
    );
    this.el.querySelector('[data-a=undo]')?.addEventListener('click', () => {
      const c = this.given.pop();
      if (c === undefined) return;
      addTo(j.drawer, c);
      sfx.play('tap');
      this.render();
    });
    this.el.querySelector('[data-a=ask]')?.addEventListener('click', () => this.askSmall());
    this.el.querySelector('[data-a=give]')?.addEventListener('click', () => {
      if (this.givenSum === this.change) this.finish();
      else {
        this.wrong++;
        sfx.play('wrong');
        const cnt = this.el.querySelector('.counter') as HTMLElement | null;
        cnt?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      }
    });
  }
  /** a peça voa da gaveta e cai no topo da pilha do balcão */
  private fly(from: DOMRect): void {
    const last = this.el.querySelector('.stk i.last') as HTMLElement | null;
    if (!last) return;
    const to = last.getBoundingClientRect();
    last.animate(
      [
        { transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(1.25) rotate(-20deg)`, offset: 0 },
        { transform: `translate(${(from.left - to.left) * 0.4}px,${(from.top - to.top) * 0.4 - 50}px) scale(1.2) rotate(10deg)`, offset: 0.55 },
        { transform: 'translate(0,0) scale(1) rotate(0)', offset: 1 },
      ],
      { duration: 330, easing: 'cubic-bezier(.3,.7,.4,1)' },
    );
  }
  /** "tem trocado?": às vezes o cliente acha moedinhas, às vezes passa no cartão */
  private askSmall(): void {
    this.askedChange = true;
    this.noChange = true;
    // devolve o que estava no balcão
    for (const c of this.given) addTo(this.job.drawer, c);
    this.given = [];
    const r = Math.random();
    if (r < 0.5) {
      // dá certinho: a nota volta para ele e ele paga trocado
      for (const n of this.paid) this.job.drawer[n] = Math.max(0, (this.job.drawer[n] ?? 0) - 1);
      const exact: number[] = [];
      let rem = this.total;
      for (const k of DENOMS) while (rem >= k) (rem -= k), exact.push(k);
      this.paid = exact;
      for (const n of this.paid) addTo(this.job.drawer, n);
      sfx.play('coinDrop');
    } else {
      for (const n of this.paid) this.job.drawer[n] = Math.max(0, (this.job.drawer[n] ?? 0) - 1);
      this.paid = [];
      this.pay = r < 0.8 ? 'card' : 'pix';
      sfx.play('tap');
    }
    this.render();
  }
  private finish(): void {
    clearTimeout(this.timer);
    sfx.play('cash');
    this.el.remove();
    this.job.onDone({ wrongChange: this.wrong, secs: (performance.now() - this.t0) / 1000, pay: this.pay, noChange: this.noChange });
  }
  cancel(): void {
    clearTimeout(this.timer);
    // desfaz o que mexeu na gaveta
    for (const c of this.given) addTo(this.job.drawer, c);
    if (this.stage === 'pay' && this.pay === 'cash') for (const n of this.paid) this.job.drawer[n] = Math.max(0, (this.job.drawer[n] ?? 0) - 1);
    this.el.remove();
    this.job.onCancel();
  }
  /** testes: completa tudo */
  autoComplete(): void {
    while (this.stage === 'scan') this.scanOne();
    if (this.pay === 'cash') {
      const ch = makeChange(this.job.drawer, this.change);
      if (ch) {
        for (const c of ch) this.job.drawer[c]--;
        this.given = ch;
      } else this.pay = 'card';
    }
    this.finish();
  }
  /** testes: tira peças da gaveta (como tocar) */
  tapMoney(c: number): void {
    const b = this.el.querySelector(`[data-m="${c}"]`) as HTMLElement | null;
    b?.click();
  }
}

/** QR "de mentirinha" (desenho estável a partir do valor) */
function qrSvg(seed: number): string {
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  let r = '';
  const N = 15;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const fin = (x < 4 && y < 4) || (x > N - 5 && y < 4) || (x < 4 && y > N - 5);
      if (fin) continue;
      if (R() < 0.48) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  const finder = (x: number, y: number) => `<rect x="${x}" y="${y}" width="3.4" height="3.4" fill="none" stroke="#111" stroke-width=".8"/><rect x="${x + 1}" y="${y + 1}" width="1.4" height="1.4"/>`;
  return `<svg viewBox="-1 -1 ${N + 2} ${N + 2}" width="92" height="92"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/><g fill="#111">${r}${finder(0, 0)}${finder(N - 3.4, 0)}${finder(0, N - 3.4)}</g></svg>`;
}
