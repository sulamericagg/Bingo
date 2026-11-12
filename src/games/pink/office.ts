/* ============================================================
 *  BLOOP PINK — escritório (financeiro) e gestor de estoque.
 *  Mesa do escritório: computador com a tela de FINANÇAS (lucro, custos, aluguel,
 *  salários, conta, caixa, gráfico) e atalho para PEDIDOS.
 *  Financeiro: senta na mesa e de tempos em tempos dá um alerta curto ("compre X",
 *  "muito dinheiro no caixa", "loja suja", "preço alto", "prejuízo").
 *  Gestor de estoque: leva caixas largadas no salão para os fundos e, toda manhã,
 *  pede o que está acabando.
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { money, PROD } from './catalog';
import { capOf, STAFF } from './data';
import { ic } from './icons';
import { drawerTotal } from './money';
import { rentOf } from './grow';
import type { Loose } from './phys';
import type { Shop, Staff } from './shop';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Alert {
  icon: string;
  txt: string;
}

export class Office {
  alerts: Alert[] = [];
  private alertT = 25;
  constructor(private sh: Shop) {}

  /** dicas do financeiro (as mais importantes primeiro) */
  advice(): Alert[] {
    const sh = this.sh;
    const s = sh.s;
    const out: Alert[] = [];
    const till = drawerTotal(s.till) / 100;
    if (till > 600) out.push({ icon: 'bank', txt: t('pink.of.till', 'Muito dinheiro no caixa ({v})! Leve ao banco.', { v: money(till) }) });
    const low: string[] = [];
    for (const f of sh.furn)
      for (const v of f.sv.s) if (v && PROD[v[0]] && v[1] <= Math.max(1, capOf(PROD[v[0]].shape) * 0.2) && !low.includes(v[0])) low.push(v[0]);
    for (const id of low.slice(0, 2)) if (sh.stockOf(id) <= 3) out.push({ icon: 'cart', txt: t('pink.of.buy', 'Compre {p}! Está acabando.', { p: PROD[id].name }) });
    const last = s.hist.slice(-3);
    if (last.length >= 2 && last.every((d) => d.prof < 0)) out.push({ icon: 'sad', txt: t('pink.of.loss', 'Prejuízo nos últimos dias: venda mais ou corte gastos.') });
    for (const [id, m] of Object.entries(s.prices)) if (m > 1.3 && PROD[id] && sh.stockOf(id) > 0) {
      out.push({ icon: 'expensive', txt: t('pink.of.price', '{p} está caro demais, os clientes reclamam.', { p: PROD[id].name }) });
      break;
    }
    if (sh.scores.clean < 50) out.push({ icon: 'mop', txt: t('pink.of.dirty', 'A loja está suja: limpe ou contrate faxina.') });
    if (s.sec < 2 && s.day > 5 && drawerTotal(s.till) > 80000) out.push({ icon: 'cctv', txt: t('pink.of.sec', 'Instale câmeras: menos furtos e assaltos.') });
    return out;
  }
  staffUpdate(st: Staff, dt: number): void {
    const sh = this.sh;
    const w = st.w;
    st.t += dt;
    if (st.k === 'finance') {
      const desk = sh.furn.find((f) => f.sv.k === 'desk');
      const [x, z] = desk ? sh.frontOf(desk, 0.62) : sh.backSpot();
      if (st.st !== 'desk' && w.arrived) {
        if (Math.hypot(w.x - x, w.z - z) > 0.3) w.go(sh.nav, x, z);
        else st.st = 'desk';
      }
      if (st.st === 'desk') {
        if (desk) w.face(desk.sv.x, desk.sv.z);
        w.act = desk ? (st.t * 1.4) % 1 : -1;
        if (Math.hypot(w.x - x, w.z - z) > 0.5) st.st = 'idle';
      }
      // alerta curto de tempos em tempos (loja aberta)
      this.alertT -= dt;
      if (this.alertT <= 0 && sh.phase !== 'summary') {
        this.alertT = 50 + Math.random() * 30;
        const a = this.advice();
        this.alerts = a;
        if (a.length) {
          sh.say(st, 'adv' + Math.floor(st.t), a[0].icon, '', '', 2500);
          sh.hud.banner('office', `${st.name}: ${a[0].txt}`, 3000);
          sfx.play('ding', { db: -6 });
        }
      }
      return;
    }
    // gestor de estoque: caixa largada no salão → fundos
    const lb = st as Staff & { lb?: Loose | null };
    if (st.st === 'idle' && st.t > 2) {
      st.t = 0;
      const zB = sh.stageZB;
      const l = sh.e.phys.items.find((x) => x.kind === 'box' && x.mesh.position.z > zB && x.mesh.position.z < 3.8 && !x.data.bag);
      if (l) {
        lb.lb = l;
        sh.e.phys.remove(l);
        st.box = l;
        st.st = 'toBox';
        w.go(sh.nav, l.mesh.position.x, l.mesh.position.z);
      } else if (w.arrived) w.go(sh.nav, ...sh.backSpot());
    } else if (st.st === 'toBox' && w.arrived) {
      st.st = 'haul';
      w.go(sh.nav, ...sh.backSpot());
    } else if (st.st === 'haul') {
      if (st.box) {
        st.box.mesh.position.set(w.x, 1.05, w.z);
        st.box.mesh.rotation.set(0, w.yaw, 0);
      }
      if (w.arrived) {
        sh.staffDropBox(st);
        st.st = 'idle';
      }
    }
  }
  /** toda manhã: o gestor pede o que está acabando (paga da conta) */
  morningOrder(): void {
    const sh = this.sh;
    if (!sh.staff.some((x) => x.k === 'stockMgr')) return;
    const cart: Record<string, number> = {};
    for (const f of sh.furn) for (const v of f.sv.s) if (v && PROD[v[0]] && v[1] <= 2 && sh.stockOf(v[0]) <= 4) cart[v[0]] = 1;
    if (Object.keys(cart).length) sh.order(cart);
  }

  /** computador do escritório: finanças */
  openPanel(): void {
    const sh = this.sh;
    const s = sh.s;
    sfx.play('click');
    const wages = s.staff.reduce((a, m) => a + STAFF[m.k].wage, 0);
    const rent = rentOf(s.renov, s.lvl);
    const last = s.hist.slice(-7);
    const rev7 = last.reduce((a, d) => a + d.rev, 0);
    const prof7 = last.reduce((a, d) => a + d.prof, 0);
    const adv = this.advice();
    const d = sh.hud.panel(`<div class="pk-office"><h2>${ic('office', 30)}${esc(t('pink.of.title', 'Escritório — Finanças'))}</h2>
      <div class="pk-stats">
        <div class="pk-stat">${ic('card', 26)}<span>${esc(t('pink.bank.acc', 'Conta da loja'))}<b>${esc(money(s.money))}</b></span></div>
        <div class="pk-stat">${ic('register', 26)}<span>${esc(t('pink.bank.till', 'No caixa da loja'))}<b>${esc(money(drawerTotal(s.till) / 100))}</b></span></div>
        <div class="pk-stat">${ic('cash', 26)}<span>${esc(t('pink.of.today', 'Vendas hoje'))}<b>${esc(money(sh.day.rev))}</b></span></div>
        <div class="pk-stat">${ic('up', 26)}<span>${esc(t('pink.of.week', 'Lucro 7 dias'))}<b style="color:${prof7 >= 0 ? '#2fa35a' : '#e8336f'}">${esc(money(prof7))}</b></span></div>
      </div>
      <canvas class="pk-chart" width="600" height="120"></canvas>
      <div class="pk-of-rows">
        <div>${ic('house', 20)}${esc(t('pink.t.rent', 'Aluguel'))}<b>${s.renov.own ? '—' : esc(money(rent))}/${esc(t('pink.t.dayShort', 'dia'))}</b></div>
        <div>${ic('people', 20)}${esc(t('pink.of.wages', 'Salários'))}<b>${esc(money(wages))}/${esc(t('pink.t.dayShort', 'dia'))}</b></div>
        <div>${ic('chart', 20)}${esc(t('pink.of.rev7', 'Vendas 7 dias'))}<b>${esc(money(rev7))}</b></div>
        <div>${ic('thief', 20)}${esc(t('pink.of.stolen', 'Furtos hoje'))}<b>${sh.day.stolen} · ${ic('guard', 16)}${sh.day.caught}</b></div>
      </div>
      ${adv.length ? `<div class="pk-sec">${ic('think', 20)}${esc(t('pink.of.tips', 'Dicas'))}</div>${adv.slice(0, 3).map((a) => `<div class="pk-note">${ic(a.icon, 20)}${esc(a.txt)}</div>`).join('')}` : ''}
      <div class="pk-row"><button class="pk-b g" data-a="ord">${ic('cart', 24)}${esc(t('pink.t.shop', 'Pedidos'))}</button><button class="pk-b w" data-a="x">${ic('close', 22)}</button></div></div>`);
    d.querySelector('[data-a=x]')!.addEventListener('click', () => sh.hud.closePanel());
    d.querySelector('[data-a=ord]')!.addEventListener('click', () => {
      sh.hud.closePanel();
      sh.openTablet('shop');
    });
    // gráfico: barras de vendas (claro) e lucro (escuro) por dia
    const c = d.querySelector('canvas') as HTMLCanvasElement;
    const x = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    if (!last.length) return;
    const max = Math.max(10, ...last.map((q) => Math.max(q.rev, Math.abs(q.prof))));
    const bw = (W - 30) / last.length;
    const base = H - 30;
    last.forEach((q, i) => {
      const h1 = (q.rev / max) * (H - 40);
      x.fillStyle = '#ffc6de';
      x.fillRect(20 + i * bw + 4, base - h1, bw - 8, h1);
      const h2 = (Math.abs(q.prof) / max) * (H - 40);
      x.fillStyle = q.prof >= 0 ? '#3ac48a' : '#e8336f';
      x.fillRect(20 + i * bw + bw * 0.3, q.prof >= 0 ? base - h2 : base, bw * 0.4, Math.min(h2, 28));
      x.fillStyle = '#7a5a6a';
      x.font = 'bold 12px sans-serif';
      x.textAlign = 'center';
      x.fillText(String(q.d), 20 + i * bw + bw / 2, H - 4);
    });
  }
}
