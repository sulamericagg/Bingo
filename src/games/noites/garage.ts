/* ============================================================
 *  NOITES — GARAGEM: montar veículo encaixando peças em espaços
 *  fixos (chassi, rodas, motor, nível, assentos, caçamba, reboque,
 *  faróis, guincho, cor). Ícones grandes; cada toque fala o nome.
 *  5 modelos prontos, projetos salvos e os da sala (online).
 * ============================================================ */
import { t } from '../../i18n';
import { RES, type Res } from './data';
import type { Sim } from './sim';
import { ic } from './icons';
import { speak } from './speak';
import { esc } from './hud';
import { READY, loadDesigns, saveDesigns, stats, vName, type VDesign } from './vehicles';
import { drawVehicle2D } from './vehview';

type Row = { k: keyof VDesign; icon: string; say: () => string; opts: { v: number | string; icon: string; col?: string; say: () => string }[] };

const ROWS: Row[] = [
  {
    k: 'ch',
    icon: 'car',
    say: () => t('noites.g.ch', 'Tamanho'),
    opts: [
      { v: 0, icon: 'car', say: () => t('noites.g.ch0', 'Pequeno') },
      { v: 1, icon: 'car', say: () => t('noites.g.ch1', 'Médio') },
      { v: 2, icon: 'car', say: () => t('noites.g.ch2', 'Grande') },
    ],
  },
  {
    k: 'wh',
    icon: 'wheel',
    say: () => t('noites.g.wh', 'Rodas'),
    opts: [
      { v: 0, icon: 'wheel', say: () => t('noites.g.wh0', 'Rodas pequenas') },
      { v: 1, icon: 'wheel', col: '#8ad8ff', say: () => t('noites.g.wh1', 'Rodas grandes') },
      { v: 2, icon: 'wheel', col: '#ffcf2e', say: () => t('noites.g.wh2', 'Rodas de tração') },
    ],
  },
  {
    k: 'en',
    icon: 'engine',
    say: () => t('noites.g.en', 'Motor'),
    opts: [
      { v: 'pedal', icon: 'boots', say: () => t('noites.g.enP', 'Pedal: não gasta nada') },
      { v: 'coal', icon: 'coal', say: () => t('noites.g.enC', 'Motor a carvão') },
      { v: 'gas', icon: 'fuel', say: () => t('noites.g.enG', 'Motor a combustível') },
      { v: 'elec', icon: 'battery', say: () => t('noites.g.enE', 'Motor elétrico') },
    ],
  },
  {
    k: 'tier',
    icon: 'star',
    say: () => t('noites.g.tier', 'Força do motor'),
    opts: [1, 2, 3].map((n) => ({ v: n, icon: 'star', col: ['#ffd34a', '#9ffcff', '#ff9ff3'][n - 1], say: () => t('noites.g.tierN', 'Força {n}', { n }) })),
  },
  {
    k: 'seats',
    icon: 'seat',
    say: () => t('noites.g.seats', 'Assentos'),
    opts: [1, 2, 3, 4].map((n) => ({ v: n, icon: 'seat', say: () => t('noites.g.seatsN', '{n} assentos', { n }) })),
  },
  {
    k: 'cargo',
    icon: 'cargo',
    say: () => t('noites.g.cargo', 'Caçamba'),
    opts: [
      { v: 0, icon: 'close', col: '#2a0b5c', say: () => t('noites.g.none', 'Nenhum') },
      { v: 1, icon: 'cargo', say: () => t('noites.g.cargo1', 'Caçamba pequena') },
      { v: 2, icon: 'cargo', col: '#3ec05a', say: () => t('noites.g.cargo2', 'Caçamba grande') },
    ],
  },
  {
    k: 'trailer',
    icon: 'trailer',
    say: () => t('noites.g.trailer', 'Reboque'),
    opts: [
      { v: 0, icon: 'close', col: '#2a0b5c', say: () => t('noites.g.none', 'Nenhum') },
      { v: 1, icon: 'trailer', say: () => t('noites.g.trailer1', 'Com reboque') },
    ],
  },
  {
    k: 'lights',
    icon: 'headlight',
    say: () => t('noites.g.lights', 'Luzes'),
    opts: [
      { v: 0, icon: 'close', col: '#2a0b5c', say: () => t('noites.g.none', 'Nenhum') },
      { v: 1, icon: 'headlight', say: () => t('noites.g.lights1', 'Faróis: espantam Sombrinhas') },
      { v: 2, icon: 'lamp', col: '#fff3a0', say: () => t('noites.g.lights2', 'Holofote noturno: luz bem forte') },
    ],
  },
  {
    k: 'winch',
    icon: 'winch',
    say: () => t('noites.g.winch', 'Guincho'),
    opts: [
      { v: 0, icon: 'close', col: '#2a0b5c', say: () => t('noites.g.none', 'Nenhum') },
      { v: 1, icon: 'winch', say: () => t('noites.g.winch1', 'Guincho: puxa toras de longe') },
    ],
  },
];
const COLORS = ['#ff4f6a', '#ff8a3a', '#ffcf2e', '#3ec05a', '#3a8aff', '#8a5cff', '#ff8fd8', '#f4efff'];

export class Garage {
  el: HTMLDivElement;
  private d: VDesign;
  private tab: 'ready' | 'mine' | 'room' = 'ready';
  private mine = loadDesigns();

  constructor(
    parent: HTMLElement,
    private sim: Sim,
    private myId: string,
    private onBuild: (d: VDesign) => void,
    private onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'nc-panel nc-garage';
    parent.appendChild(this.el);
    this.d = { ...READY[0] };
    speak(t('noites.say.garage', 'Garagem! Escolha um carro pronto ou monte o seu.'), { cool: 20000 });
    this.render();
  }

  private render(): void {
    const s = this.sim;
    const d = this.d;
    const st = stats(d);
    const stash = RES.filter((r) => (s.stash[r] ?? 0) > 0)
      .map((r) => `<span class="nc-chip">${ic(r, 20)}${s.stash[r]}</span>`)
      .join('');
    const list = this.tab === 'ready' ? READY : this.tab === 'mine' ? this.mine : [...new Map([...s.designs].filter(([k]) => !k.endsWith('@' + this.myId)).map(([, v]) => [JSON.stringify({ ...v, id: '' }), v])).values()].slice(0, 8);
    const cards = list.map((q, i) => `<button class="nc-btn nc-vcard ${q.id === d.id ? 'gold' : ''}" data-pick="${i}" data-say="${esc(vName(q))}"><canvas width="120" height="64" data-cv="${i}"></canvas></button>`).join('');
    const rows = ROWS.map(
      (r) =>
        `<div class="nc-vrow"><span class="nc-vlab" data-say="${esc(r.say())}">${ic(r.icon, 26)}</span>${r.opts
          .map((o, i) => `<button class="nc-btn nc-vopt ${d[r.k] === o.v ? 'gold' : ''}" data-row="${r.k}" data-opt="${i}" data-say="${esc(o.say())}">${ic(o.icon, r.k === 'ch' ? [20, 26, 32][i] : 26, o.col)}${r.k === 'tier' || r.k === 'seats' ? `<small>${o.v}</small>` : ''}</button>`)
          .join('')}</div>`,
    ).join('');
    const cols = COLORS.map((c) => `<button class="nc-btn nc-vcol ${d.col === c ? 'on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('');
    const miss = Object.entries(st.cost).filter(([k, n]) => (s.stash[k as Res] ?? 0) < (n ?? 0));
    const lock = s.bench < st.bench;
    const cost = Object.entries(st.cost)
      .map(([k, n]) => `<span class="nc-chip ${(s.stash[k as Res] ?? 0) < (n ?? 0) ? 'no' : ''}">${ic(k, 18)}${n}</span>`)
      .join('');
    const bars = (n: number, max: number) => '▮'.repeat(Math.max(1, Math.round((n / max) * 5)));
    this.el.innerHTML = `
      <div class="row">
        <button class="nc-btn round red" data-x="close" data-say="${esc(t('noites.say.close', 'Fechar'))}">${ic('close', 28)}</button>
        <span class="nc-chip" style="font-size:18px">${ic('garage', 28)}</span>
        <div class="nc-stash">${stash}</div>
      </div>
      <div class="row" style="flex:1;min-height:0;align-items:stretch;gap:8px">
        <div class="nc-vlist">
          <div class="nc-tabs">
            <button class="nc-btn ${this.tab === 'ready' ? 'gold' : ''}" data-tab="ready" data-say="${esc(t('noites.g.ready', 'Prontos'))}">${ic('star', 26)}</button>
            <button class="nc-btn ${this.tab === 'mine' ? 'gold' : ''}" data-tab="mine" data-say="${esc(t('noites.g.mine', 'Meus veículos'))}">${ic('save', 26)}</button>
            <button class="nc-btn ${this.tab === 'room' ? 'gold' : ''}" data-tab="room" data-say="${esc(t('noites.g.room', 'Dos amigos'))}">${ic('share', 26)}</button>
          </div>
          <div class="nc-vcards">${cards || ic('car', 40, '#5a5a7a')}</div>
        </div>
        <div class="nc-vbuild">${rows}<div class="nc-vrow">${ic('paint', 26)}${cols}</div></div>
        <div class="nc-vside">
          <canvas class="nc-vprev" width="260" height="120"></canvas>
          <div class="nc-vstats"><span>${ic('gauge', 20)}${bars(st.vmax, 17)}</span><span>${ic('gas', 20)}${st.energy ? bars(st.fuelCap, 120) : '∞'}</span><span>${ic('wood', 20)}${st.cap}</span></div>
          <div class="cost">${cost}</div>
          ${lock ? `<div class="nc-chip no">${ic('lock', 18)}${ic('bench', 18)}${st.bench}</div>` : ''}
          <div class="row">
            <button class="nc-btn round" data-x="save" data-say="${esc(t('noites.g.save', 'Guardar projeto'))}">${ic('save', 28)}</button>
            <button class="nc-btn nc-make ${miss.length || lock ? '' : 'green'}" data-x="build" data-say="${esc(t('noites.g.build', 'Montar!'))}">${ic('craft', 40)}<span>${esc(t('noites.g.buildS', 'Montar'))}</span></button>
          </div>
        </div>
      </div>`;
    const pv = this.el.querySelector('.nc-vprev') as HTMLCanvasElement;
    drawVehicle2D(pv.getContext('2d')!, d, pv.width, pv.height);
    this.el.querySelectorAll<HTMLCanvasElement>('[data-cv]').forEach((cv) => drawVehicle2D(cv.getContext('2d')!, list[+cv.dataset.cv!], cv.width, cv.height));
    const say = (e: HTMLElement) => e.dataset.say && speak(e.dataset.say, { cool: 300, urgent: true });
    this.el.querySelectorAll<HTMLElement>('button, .nc-vlab').forEach((b) =>
      b.addEventListener('click', () => {
        say(b);
        if (b.dataset.x === 'close') return this.onClose();
        if (b.dataset.x === 'save') {
          const nd = { ...this.d, id: 'c' + Date.now().toString(36).slice(-6), name: '' };
          this.mine = [nd, ...this.mine.filter((q) => JSON.stringify({ ...q, id: '' }) !== JSON.stringify({ ...nd, id: '' }))].slice(0, 12);
          saveDesigns(this.mine);
          this.d = nd;
          this.tab = 'mine';
        } else if (b.dataset.x === 'build') {
          if (lock) speak(t('noites.why.tier', 'Precisa da bancada nível {n}.', { n: st.bench }), { cool: 300, urgent: true });
          else if (miss.length) speak(t('noites.why.res', 'Falta {x}.', { x: miss.map(([k]) => k).join(', ') }), { cool: 300, urgent: true });
          else this.onBuild(this.d);
          return;
        } else if (b.dataset.tab) this.tab = b.dataset.tab as 'ready';
        else if (b.dataset.pick) this.d = { ...list[+b.dataset.pick] };
        else if (b.dataset.row) {
          const r = ROWS.find((q) => q.k === b.dataset.row)!;
          (this.d as unknown as Record<string, unknown>)[r.k] = r.opts[+b.dataset.opt!].v;
          if (READY.some((q) => q.id === this.d.id)) this.d.id = 'c' + Date.now().toString(36).slice(-6);
        } else if (b.dataset.col) this.d.col = b.dataset.col;
        else return;
        this.render();
      }),
    );
  }
  refresh(): void {
    this.render();
  }
  destroy(): void {
    this.el.remove();
  }
}
