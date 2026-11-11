/* ============================================================
 *  GARIMPO — telas da vida de garimpeiro (ícones grandes, pouco texto):
 *  MOCHILA + FORÇA (nível, barra de XP, peso, fôlego, itens que dá para usar,
 *  opções: sustos à noite e duração do dia), MERCADINHO, FRETES (destinos,
 *  composições de carreta, carga do estoque) e RESULTADO DA ENTREGA.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { pushBack } from '../../../core/back';
import { speak } from '../../voo/voice';
import { weather } from '../weather';
import { GOLD_PRICE } from '../save';
import { COMBOS, DESTS, G_PER_T, type HaulSave } from '../haul/freight';
import { RI } from './icons';
import { capKg, digMul, ITEMS, stamMax, STR_MAX, xpNeed, type ItemId } from './state';
import type { RpLayer } from './index';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number) => Math.floor(n).toLocaleString('pt-BR');

function screen(root: HTMLElement, html: string, onClose: () => void): { d: HTMLDivElement; close: () => void } {
  const d = document.createElement('div');
  d.className = 'rp-scr';
  d.setAttribute('data-touch-ignore', '');
  d.innerHTML = `<button class="rp-x" data-x>${RI.close}</button>` + html;
  root.appendChild(d);
  let pop: (() => void) | null = null;
  const close = () => {
    if (!d.isConnected) return;
    d.remove();
    pop?.();
    pop = null;
    onClose();
  };
  pop = pushBack(close);
  d.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-x]')) {
      sfx.click();
      close();
    }
  });
  return { d, close };
}

/* ---------------- mochila + força ---------------- */
export function bagScreen(root: HTMLElement, rp: RpLayer, onClose: () => void): void {
  let sc: { d: HTMLDivElement; close: () => void } | null = null;
  const draw = () => {
    const st = rp.st;
    const S = st.str;
    const n = st.needs;
    const kg = rp.kg;
    const cap = capKg(S.lvl);
    const usable: ItemId[] = ['marmita', 'lanche', 'agua', 'jerry'];
    const order: ItemId[] = ['marmita', 'lanche', 'agua', 'jerry', 'kit', 'cinta', 'lanterna', 'saco', 'pepita'];
    const need = (ic: keyof typeof RI, v: number, col: string) => `<div class="rp-stat">${RI[ic]}<div class="rp-bar"><i style="width:${Math.round(v)}%;background:${col}"></i></div></div>`;
    const sys = rp.sys;
    const html = `<h2>${RI.bag}${esc(t('gb.rp.bagTitle', 'Mochila e força'))}</h2>
      <div class="rp-cols">
        <div class="rp-box"><h4>${RI.arm}${esc(t('gb.rp.strength', 'Força'))}</h4>
          <div class="rp-lvl"><div class="rp-arm">${RI.arm}<b>${S.lvl}</b></div><div style="flex:1">
            <div class="rp-stat">${RI.star}<div class="rp-bar"><i style="width:${S.lvl >= STR_MAX ? 100 : Math.round((S.xp / xpNeed(S.lvl)) * 100)}%"></i></div></div>
            <div class="rp-stat">${RI.weight}<b>${cap} kg</b> ${RI.stamina}<b>${stamMax(S.lvl)}</b> ${RI.wrench}<b>+${Math.round((digMul(S.lvl) - 1) * 100)}%</b></div>
          </div></div>
          <div class="rp-stat" style="opacity:.8">${RI.nugget}${esc(t('gb.rp.strHint', 'Cave e carregue peso para ficar mais forte!'))}</div>
          ${sys.needs ? `<h4 style="margin-top:8px">${RI.heart}${esc(t('gb.rp.needs', 'Você'))}</h4>${need('food', n.food, '#3fbf5a')}${need('water', n.water, '#2f9be8')}${need('energy', n.energy, '#9a8cff')}${need('stamina', (n.stam / stamMax(S.lvl)) * 100, '#7ee05a')}` : ''}
        </div>
        <div class="rp-box"><h4>${RI.bag}${esc(t('gb.rp.items', 'Itens'))}</h4>
          ${sys.weight ? `<div class="rp-stat">${RI.weight}<div class="rp-bar kg ${kg > cap ? 'over' : ''}"><i style="width:${Math.min(100, Math.round((kg / cap) * 100))}%"></i></div><b>${Math.round(kg)}/${cap} kg</b></div>` : ''}
          <div class="rp-inv">${order
            .map((id) => {
              const c = st.inv[id] ?? 0;
              const it = ITEMS[id];
              const canUse = c > 0 && usable.includes(id);
              return `<button class="rp-it ${c ? '' : 'empty'} ${canUse ? 'use' : ''}" data-use="${id}">${RI[it.icon]}<b>${id === 'pepita' ? Math.round(c) + 'g' : c}</b>${esc(it.name())}</button>`;
            })
            .join('')}</div>
          <div class="rp-stat" style="opacity:.8">${RI.check}${esc(t('gb.rp.tapUse', 'Toque no item verde para usar'))}</div>
        </div>
        <div class="rp-box"><h4>${RI.gear}${esc(t('gb.rp.options', 'Opções'))}</h4>
          <div class="rp-tog ${st.opt.spooky ? 'on' : ''}" data-spooky>${RI.ghost}<span>${esc(t('gb.rp.spooky', 'Sustos à noite'))}</span><i></i></div>
          <div class="rp-tog">${RI.clock}<span>${esc(t('gb.rp.dayLen', 'Um dia dura'))}</span><div class="rp-seg">${[12, 22, 40].map((m) => `<button data-day="${m}" class="${weather.dayLen === m ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
          <div class="rp-stat">${RI.sun}<b>${esc(t('gb.rp.dayN', 'Dia {n}', { n: weather.day }))}</b> ${RI.trailer}<b>${rp.st.haul?.deliveries ?? 0}</b></div>
        </div>
      </div>`;
    if (!sc) sc = screen(root, html, onClose);
    else sc.d.innerHTML = `<button class="rp-x" data-x>${RI.close}</button>` + html;
  };
  draw();
  sc!.d.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const u = el.closest<HTMLElement>('[data-use]');
    if (u) {
      const id = u.dataset.use as ItemId;
      if ((rp.st.inv[id] ?? 0) > 0 && ['marmita', 'lanche', 'agua', 'jerry'].includes(id)) {
        rp.use(id);
        draw();
      } else sfx.knob();
      return;
    }
    if (el.closest('[data-spooky]')) {
      rp.setSpooky(!rp.st.opt.spooky);
      sfx.click();
      draw();
      return;
    }
    const dl = el.closest<HTMLElement>('[data-day]');
    if (dl) {
      rp.setDayLen(Number(dl.dataset.day));
      sfx.click();
      draw();
    }
  });
}

/* ---------------- mercadinho ---------------- */
export function shopScreen(root: HTMLElement, rp: RpLayer, buy: (id: ItemId, price: number) => boolean, onClose: () => void): void {
  const ids: ItemId[] = ['marmita', 'lanche', 'agua', 'jerry', 'kit', 'cinta', 'lanterna'];
  let sc: { d: HTMLDivElement; close: () => void } | null = null;
  const draw = () => {
    const html = `<h2>${RI.cart}${esc(t('gb.rp.shop', 'Mercadinho'))} <span style="font-size:16px;display:flex;align-items:center;gap:4px">${RI.coin.replace('<svg ', '<svg style="width:22px;height:22px" ')}${fmt(rp.sv.money)}</span></h2>
      <div class="rp-inv" style="width:min(640px,94vw);grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${ids
        .map((id) => {
          const it = ITEMS[id];
          const can = rp.sv.money >= it.price;
          return `<button class="rp-it ${can ? 'use' : 'empty'}" data-buy="${id}">${RI[it.icon]}<b>${rp.st.inv[id] ?? 0}</b>${esc(it.name())}<span style="display:flex;align-items:center;gap:2px;font-weight:800;font-size:13px">${RI.coin.replace('<svg ', '<svg style="width:16px;height:16px" ')}${it.price}</span>${rp.sys.weight ? `<small>${it.kg} kg</small>` : ''}</button>`;
        })
        .join('')}</div>`;
    if (!sc) sc = screen(root, html, onClose);
    else sc.d.innerHTML = `<button class="rp-x" data-x>${RI.close}</button>` + html;
  };
  draw();
  sc!.d.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-buy]');
    if (!b) return;
    const id = b.dataset.buy as ItemId;
    if (buy(id, ITEMS[id].price)) {
      sfx.pick();
      draw();
    }
  });
}

/* ---------------- fretes ---------------- */
export function freightScreen(root: HTMLElement, rp: RpLayer, hs: HaulSave, start: (dest: number, combo: number) => void, onClose: () => void): void {
  let dest = 0;
  let combo = Math.max(0, hs.owned - 1);
  let sc: { d: HTMLDivElement; close: () => void } | null = null;
  const draw = () => {
    const s = rp.sv;
    const cap = COMBOS[combo].cap * G_PER_T;
    const gold = Math.min(s.stock, cap);
    const pay = Math.round(gold * GOLD_PRICE[s.diff] * DESTS[dest].mul);
    const html = `<h2>${RI.truck}${esc(t('gb.haul.title', 'Fretes'))}</h2>
      <div class="rp-dests">${DESTS.map((d, i) => {
        const lock = hs.deliveries < d.need;
        return `<button class="rp-dest ${i === dest ? 'on' : ''} ${lock ? 'lock' : ''}" data-dest="${i}">${RI[lock ? 'no' : d.icon]}<b>${esc(d.name())}</b><small>${RI.road}${d.km} km</small><small>${RI.coin}×${d.mul.toFixed(2)}</small>${lock ? `<small>${RI.trailer}${d.need}</small>` : ''}</button>`;
      }).join('')}</div>
      <div class="rp-combos">${COMBOS.map((c, i) => {
        const owned = hs.owned > i;
        const next = hs.owned === i;
        if (!owned && !next) return `<div class="rp-combo" style="opacity:.35"><div class="rp-rigs">${RI.truck}${RI.trailer.repeat(c.n)}</div>${esc(c.name())}<small>${RI.no}</small></div>`;
        return `<button class="rp-combo ${owned && i === combo ? 'on' : ''} ${next ? 'buy' : ''}" data-combo="${i}"><div class="rp-rigs">${RI.truck}${RI.trailer.repeat(c.n)}</div>${esc(c.name())}<small>${owned ? `${RI.weight}${c.cap} t` : `${RI.coin}${fmt(rp.comboPrice(i))}`}</small></button>`;
      }).join('')}</div>
      ${hs.owned > 0
        ? `<div class="rp-sum"><span>${RI.gold}${fmt(gold)} g</span><span>${RI.weight}${(gold / G_PER_T).toFixed(1)} t</span><span>${RI.coin}≈ ${fmt(pay)}</span><span>${RI.clock}${DESTS[dest].km * 1.2 | 0}–${Math.ceil(DESTS[dest].km * 2)} min</span></div>
          <button class="rp-go" data-go ${gold < 20 || hs.deliveries < DESTS[dest].need ? 'disabled' : ''}>${RI.road}${esc(gold < 20 ? t('gb.haul.noGold', 'Pouco ouro no estoque') : t('gb.haul.go', 'Carregar e partir'))}</button>`
        : `<div class="rp-sum"><span>${RI.truck}${esc(t('gb.haul.needRig', 'Compre um cavalo mecânico com carreta para fazer fretes!'))}</span></div>`}`;
    if (!sc) sc = screen(root, html, onClose);
    else sc.d.innerHTML = `<button class="rp-x" data-x>${RI.close}</button>` + html;
  };
  draw();
  speak(t('gb.haul.say', 'Escolha o destino. Mais longe paga mais pelo ouro!'), { gap: 400 });
  sc!.d.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const dd = el.closest<HTMLElement>('[data-dest]');
    if (dd) {
      const i = Number(dd.dataset.dest);
      if (hs.deliveries >= DESTS[i].need) dest = i;
      else sfx.knob();
      sfx.click();
      draw();
      return;
    }
    const cb = el.closest<HTMLElement>('[data-combo]');
    if (cb) {
      const i = Number(cb.dataset.combo);
      if (hs.owned > i) combo = i;
      else if (rp.buyCombo(i)) combo = i;
      else sfx.knob();
      draw();
      return;
    }
    if (el.closest('[data-go]') && !(el.closest('[data-go]') as HTMLButtonElement).disabled) {
      sfx.click();
      const s2 = sc!;
      start(dest, combo);
      s2.close();
    }
  });
}

/* ---------------- resultado ---------------- */
export interface DeliveryResult {
  dest: string;
  gold: number;
  base: number;
  onTime: number;
  noDmg: number;
  night: number;
  dmg: number;
  boost: number;
  total: number;
  hours: number;
  stars: number;
}
export function resultScreen(root: HTMLElement, r: DeliveryResult, unlocked: string | null, done: () => void): void {
  const row = (ic: keyof typeof RI, label: string, v: number, i: number, on = true) =>
    `<div class="${on ? '' : 'no'}" style="animation-delay:${0.15 + i * 0.18}s">${RI[ic]}<span>${esc(label)}</span><b>${v >= 0 ? '+' : ''}${fmt(v)}</b></div>`;
  const html = `<h2>${RI.flag}${esc(t('gb.haul.delivered', 'Entregue em {d}!', { d: r.dest }))}</h2>
    <div class="rp-stars">${[0, 1, 2].map((i) => `<span style="animation-delay:${0.2 + i * 0.25}s">${RI.star.replace('<svg ', `<svg class="${i < r.stars ? '' : 'off'}" `)}</span>`).join('')}</div>
    <div class="rp-pay">
      ${row('gold', t('gb.haul.r.gold', '{g} g de ouro', { g: fmt(r.gold) }), r.base, 0)}
      ${row('clock', t('gb.haul.r.onTime', 'No prazo'), r.onTime, 1, r.onTime > 0)}
      ${row('shield', t('gb.haul.r.noDmg', 'Sem estragos'), r.noDmg, 2, r.noDmg > 0)}
      ${row('moon', t('gb.haul.r.night', 'Viagem de noite'), r.night, 3, r.night > 0)}
      ${r.dmg ? row('wrench', t('gb.haul.r.dmg', 'Conserto'), r.dmg, 4) : ''}
      ${r.boost ? row('coin', t('gb.haul.r.boost', 'Preço especial'), r.boost, 5) : ''}
      <div class="tot" style="animation-delay:1.3s">${RI.coin}<span>${esc(t('gb.haul.r.total', 'Total'))}</span><b>${fmt(r.total)}</b></div>
    </div>
    ${unlocked ? `<div class="rp-sum"><span>${RI.map}${esc(t('gb.haul.unlocked', 'Novo destino: {d}', { d: unlocked }))}</span></div>` : ''}
    <button class="rp-go" data-done>${RI.station}${esc(t('gb.haul.home', 'Voltar ao garimpo'))}</button>`;
  const sc = screen(root, html, done);
  sc.d.querySelector('[data-x]')?.remove();
  speak(t('gb.haul.paySay', 'Entrega feita! Você ganhou {n}.', { n: fmt(r.total) }), { urgent: true });
  sfx.yay();
  sc.d.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-done]')) {
      sfx.click();
      sc.close();
    }
  });
}
