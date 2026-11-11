/* ============================================================
 *  NOITES — HUD (DOM). Ícones grandes; cada botão FALA o nome
 *  ao ser tocado (sem repetir demais). Texto só de apoio.
 *  Barra de itens (a mão), mochila/baú, bancada, mira em 1ª pessoa.
 * ============================================================ */
import { t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch';
import { BENCH_BABIES, CATS, FIRE_LV, FIRE_MAX_LV, HEARTS, HOT, ITEM, ITEMS, RES, catName, resName, type Cat, type ItemDef, type Res } from './data';
import { type Player, type Sim } from './sim';
import { capSlots, usedSlots, type Stack } from './items';
import { ic } from './icons';
import { speak } from './speak';

export interface HudCb {
  action(): void;
  throw(): void;
  sel(i: number): void;
  drop(i: number): void;
  place(k: 'ok' | 'rot' | 'no'): void;
  craft(id: string): void;
  bot(c: 'follow' | 'stay' | 'wood' | 'guard'): void;
  exit(): void;
  voice(): void;
  cam(): void;
  bag(): void;
  panelOpen(on: boolean): void;
  swap(i: number, j: number): void;
  store(i: number): void;
  storeAll(): void;
  unstore(id: string): void;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** ícone de um item/recurso */
export function itemIcon(id: string, size = 32): string {
  const d = ITEM[id];
  if (d) return ic(d.icon, size, d.col);
  return ic(id, size);
}
export function itemName(id: string): string {
  return ITEM[id]?.n() ?? resName(id as Res);
}
/** linha curta de atributos (machado: força/velocidade; lanterna: alcance; saco: espaços) */
export function itemStats(id: string): string {
  const d = ITEM[id];
  if (!d) return '';
  if (d.axe) return `${ic('axe', 14)}${d.axe} · ${Math.round(1 / (d.cd ?? 0.5))}/s`;
  if (d.lamp) return `${ic('light', 14)}${d.lamp[0]} m`;
  if (d.bonk) return `${ic('hammer', 14)}${d.bonk}`;
  if (d.wear?.slots) return `${ic('bag', 14)}+${d.wear.slots}`;
  return '';
}
const fmtT = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

export class Hud {
  el: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private bound: BoundButton[] = [];
  private hotBound: BoundButton[] = [];
  private last: Record<string, string> = {};
  private craftEl: HTMLDivElement | null = null;
  private invEl: HTMLDivElement | null = null;
  private cat: Cat = 'tool';
  private sel = '';
  /** espaço escolhido no painel da mochila (para trocar) */
  private pick = -1;
  private nameT = 0;
  useHeld = false;
  marker: HTMLDivElement;

  constructor(
    root: HTMLElement,
    private cb: HudCb,
  ) {
    const el = document.createElement('div');
    el.className = 'nc-hud';
    el.innerHTML = `
      <div class="nc-dark"></div><div class="nc-hurt"></div>
      <div class="nc-cross"><i></i><div class="nc-prompt" data-v="prompt"></div></div>
      <div class="nc-top">
        <button class="nc-btn round red" data-b="exit" data-say="${esc(t('noites.say.exit', 'Sair'))}">${ic('exit', 26)}</button>
        <div class="nc-stats">
          <div class="nc-hearts"></div>
          <div class="nc-meters">
            <div class="nc-meter" data-m="hunger">${ic('hunger', 20)}<div class="nc-bar"><i></i></div></div>
            <div class="nc-meter" data-m="warm">${ic('warm', 20)}<div class="nc-bar"><i style="background:#ff6a3a"></i></div></div>
          </div>
        </div>
        <div class="nc-mid">
          <div class="nc-phase"><span data-v="pIcon"></span><span data-v="pNum">1</span><div class="pbar"><i data-v="pBar"></i></div><span data-v="pSpecial"></span></div>
          <div class="nc-fire">${ic('fire', 20)}<b data-v="fireT">0:00</b><div class="nc-bar"><i data-v="fire"></i></div><span class="lv" data-v="fireLv">1</span><div class="nc-bar xp"><i data-v="fireXp"></i></div></div>
          <div class="nc-drive" data-v="drive" hidden><span data-v="dIcon">${ic('gas', 20)}</span><div class="nc-bar"><i data-v="fuel"></i></div>${ic('wood', 20)}<span data-v="load">0</span></div>
          <div class="nc-obj nc-pe" data-v="obj"><i class="arr" data-v="arr">${ic('arrow', 22)}</i><i data-v="objI"></i><span data-v="objT"></span></div>
        </div>
        <div class="nc-right">
          <div class="nc-code" data-v="code" hidden></div>
          <button class="nc-btn round" data-b="bots" hidden data-say="${esc(t('noites.say.bots', 'Ajudantes'))}">${ic('people', 28)}</button>
          <button class="nc-btn round" data-b="cam" data-say="${esc(t('noites.say.cam', 'Trocar câmera'))}"><span data-v="cam">${ic('cam', 26)}</span></button>
          <button class="nc-btn round" data-b="voice" data-say="${esc(t('noites.say.voice', 'Voz'))}"><span data-v="voice">${ic('speaker', 26, '#2a0b5c')}</span></button>
        </div>
      </div>
      <div class="nc-bots">
        <button class="nc-btn" data-bot="follow" data-say="${esc(t('noites.bot.follow', 'Ajudantes: me sigam!'))}">${ic('follow', 40)}</button>
        <button class="nc-btn" data-bot="wood" data-say="${esc(t('noites.bot.wood', 'Ajudantes: cortem lenha!'))}">${ic('axe', 40)}</button>
        <button class="nc-btn" data-bot="guard" data-say="${esc(t('noites.bot.guard', 'Ajudantes: protejam a fogueira!'))}">${ic('guard', 40)}</button>
        <button class="nc-btn" data-bot="stay" data-say="${esc(t('noites.bot.stay', 'Ajudantes: fiquem aí!'))}">${ic('stay', 40)}</button>
      </div>
      <div class="nc-hotwrap">
        <div class="nc-hname" data-v="hname"></div>
        <div class="nc-hotrow"><div class="nc-hot"></div>
          <button class="nc-btn nc-bagbtn" data-b="bag" data-say="${esc(t('noites.say.bag', 'Mochila'))}">${ic('bag', 34)}<em data-v="bagN">0</em></button>
        </div>
      </div>
      <div class="nc-place">
        <button class="nc-btn round red" data-p="no" data-say="${esc(t('noites.say.cancel', 'Cancelar'))}">${ic('close', 34)}</button>
        <button class="nc-btn round dark" data-p="rot" data-say="${esc(t('noites.say.rotate', 'Girar'))}">${ic('rotate', 34)}</button>
        <button class="nc-btn round green" data-p="ok" data-say="${esc(t('noites.say.placeHere', 'Colocar aqui'))}">${ic('check', 40, '#0a3a1a')}</button>
      </div>
      <div class="nc-act">
        <button class="nc-btn round dark nc-throw" data-b="throw" hidden data-say="${esc(t('noites.say.throw', 'Jogar'))}">${ic('throw', 36)}</button>
        <button class="nc-btn nc-use gold" data-b="use"><span data-v="useI">${ic('hand', 50)}</span><b data-v="useT"></b></button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.marker = document.createElement('div');
    this.marker.className = 'nc-mark';
    el.appendChild(this.marker);

    const btn = (b: HTMLElement, f: () => void, o: { repeat?: number } = {}) => {
      this.bound.push(
        bindButton(b, {
          onPress: () => {
            const s = b.dataset.say ?? '';
            if (s) speak(s, { cool: 5000 });
            f();
          },
          repeatMs: o.repeat,
        }),
      );
    };
    btn(this.q('[data-b="exit"]'), () => cb.exit());
    btn(this.q('[data-b="voice"]'), () => cb.voice());
    btn(this.q('[data-b="cam"]'), () => cb.cam());
    btn(this.q('[data-b="bag"]'), () => cb.bag());
    btn(this.q('[data-b="throw"]'), () => cb.throw(), { repeat: 330 });
    btn(this.q('[data-b="bots"]'), () => this.q('.nc-bots').classList.toggle('on'));
    const use = this.q('[data-b="use"]');
    this.bound.push(
      bindButton(use, {
        onPress: () => {
          this.useHeld = true;
          const s = use.dataset.say;
          if (s) speak(s, { cool: 6000 });
          cb.action();
        },
        onRelease: () => (this.useHeld = false),
        repeatMs: 340,
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-bot]').forEach((b) => btn(b, () => cb.bot(b.dataset.bot as 'follow')));
    el.querySelectorAll<HTMLElement>('[data-p]').forEach((b) => btn(b, () => cb.place(b.dataset.p as 'ok')));
  }

  private set(key: string, v: string, f: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    f();
  }

  setStats(p: Player, s: Sim): void {
    this.set('hearts', String(p.hearts), () => {
      let h = '';
      for (let i = 0; i < HEARTS; i++) h += `<span class="${i < p.hearts ? '' : 'off'}">${ic('heart', 20)}</span>`;
      this.q('.nc-hearts').innerHTML = h;
    });
    const m = (k: string, v: number) =>
      this.set('m' + k, String(Math.round(v / 4)), () => {
        const e = this.q(`[data-m="${k}"]`);
        (e.querySelector('i') as HTMLElement).style.width = Math.round(v) + '%';
        e.classList.toggle('low', v < 25);
      });
    m('hunger', p.hunger);
    m('warm', p.warmth);
    const cap = capSlots(p.wear.back, p.bot);
    const used = usedSlots(p.slots.slice(0, cap));
    this.set('bag', used + '/' + cap, () => {
      this.q('[data-v="bagN"]').textContent = `${used}/${cap}`;
      this.q('[data-b="bag"]').classList.toggle('full', used >= cap);
    });
    this.set('hurt', String(p.invT > 1.2), () => this.q('.nc-hurt').classList.toggle('on', p.invT > 1.2));
    if (this.invEl) this.renderInv(s, p, s.nearStore(p));
  }
  setPhase(s: Sim, len: number, special: string): void {
    const night = s.phase === 'night';
    this.set('ph', String(night), () => {
      this.q('.nc-phase').classList.toggle('night', night);
      this.q('[data-v="pIcon"]').innerHTML = ic(night ? 'moon' : 'sun', 28);
      (this.q('.nc-dark') as HTMLElement).style.opacity = night ? '1' : '0';
    });
    this.set('pn', String(s.night), () => (this.q('[data-v="pNum"]').textContent = String(s.night)));
    this.set('pb', String(Math.round((s.clock / len) * 50)), () => ((this.q('[data-v="pBar"]') as HTMLElement).style.width = Math.round((s.clock / len) * 100) + '%'));
    this.set('sp', special, () => (this.q('[data-v="pSpecial"]').innerHTML = special ? ic(special, 24) : ''));
    const f = s.fire;
    const left = s.fireLeft();
    this.set('fireT', fmtT(left), () => (this.q('[data-v="fireT"]').textContent = f.fuel <= 0 ? '0:00' : fmtT(left)));
    this.set('fire', String(Math.round((f.fuel / f.max) * 40)) + (left < 40), () => {
      (this.q('[data-v="fire"]') as HTMLElement).style.width = Math.round((f.fuel / f.max) * 100) + '%';
      this.q('.nc-fire').classList.toggle('low', left < 40);
    });
    const lvP = f.lv >= FIRE_MAX_LV ? 1 : (f.xp - FIRE_LV[f.lv]) / (FIRE_LV[f.lv + 1] - FIRE_LV[f.lv]);
    this.set('fireLv', f.lv + ':' + Math.round(lvP * 30), () => {
      this.q('[data-v="fireLv"]').textContent = String(f.lv);
      (this.q('[data-v="fireXp"]') as HTMLElement).style.width = Math.round(Math.max(0, Math.min(1, lvP)) * 100) + '%';
    });
  }
  setAction(icon: string, label: string, say: string, col = ''): void {
    this.set('act', icon + label + col, () => {
      const u = this.q('[data-b="use"]');
      this.q('[data-v="useI"]').innerHTML = ic(icon, 50, col);
      this.q('[data-v="useT"]').textContent = label;
      u.dataset.say = say;
      u.classList.toggle('pulse', icon !== 'hand');
      u.classList.toggle('gold', icon !== 'hand');
    });
  }
  /** mira (1ª pessoa) + texto da ação no centro */
  setCross(fp: boolean, on: boolean, icon: string, label: string): void {
    this.set('cross', fp + ':' + on + icon + label, () => {
      const c = this.q('.nc-cross');
      c.style.display = fp ? '' : 'none';
      c.classList.toggle('on', on);
      this.q('[data-v="prompt"]').innerHTML = on && label ? `${ic(icon, 20)}<span>${esc(label)}</span>` : '';
    });
  }
  showThrow(on: boolean): void {
    this.set('throw', String(on), () => (this.q('[data-b="throw"]').hidden = !on));
  }
  setCam(fp: boolean): void {
    this.q('[data-v="cam"]').innerHTML = ic(fp ? 'person' : 'cam', 26);
    this.q('[data-b="cam"]').dataset.say = fp ? t('noites.say.camTp', 'Ver de fora') : t('noites.say.camFp', 'Ver pelos olhos');
  }
  setObjective(icon: string, text: string, angle: number | null): void {
    this.set('obj', icon + text, () => {
      this.q('[data-v="objI"]').innerHTML = ic(icon, 24);
      this.q('[data-v="objT"]').textContent = text;
      const o = this.q('[data-v="obj"]');
      o.dataset.say = text;
      o.onclick = () => speak(text, { cool: 1000, urgent: true });
    });
    const a = this.q('[data-v="arr"]');
    a.style.display = angle === null ? 'none' : '';
    if (angle !== null) a.style.transform = `rotate(${Math.round(angle)}deg)`;
  }
  /** marcador na tela (ícone em cima do alvo ou seta na borda) */
  setMarker(x: number, y: number, icon: string, edge: boolean, angle: number): void {
    this.marker.classList.add('on');
    this.marker.style.left = x + 'px';
    this.marker.style.top = y + 'px';
    const k = (edge ? 'e' : 'i') + icon;
    this.set('mk', k, () => (this.marker.innerHTML = edge ? `<div style="transform:rotate(${angle}deg)">${ic('arrow', 40)}</div>` : `<div style="animation:ncPulse 1s infinite">${ic(icon, 40)}</div>`));
    if (edge) (this.marker.firstElementChild as HTMLElement).style.transform = `rotate(${Math.round(angle)}deg)`;
  }
  hideMarker(): void {
    this.marker.classList.remove('on');
  }
  /** barra de itens: 6 espaços (a mão = selecionado). Segurar = soltar no chão. */
  setHotbar(slots: (Stack | null)[], sel: number, dt = 0): void {
    const key = slots
      .slice(0, HOT)
      .map((s) => (s ? s.id + s.n : '-'))
      .join(',') + '|' + sel;
    this.nameT = Math.max(0, this.nameT - dt);
    const hn = this.q('[data-v="hname"]');
    hn.classList.toggle('on', this.nameT > 0);
    this.set('hot', key, () => {
      const h = this.q('.nc-hot');
      const prevSel = this.last.hsel;
      for (const b of this.hotBound) b.destroy();
      this.hotBound = [];
      let html = '';
      for (let i = 0; i < HOT; i++) {
        const s = slots[i];
        html += `<button class="nc-btn nc-slot ${i === sel ? 'sel' : ''} ${s ? '' : 'empty'}" data-slot="${i}" data-say="${s ? esc(itemName(s.id)) : ''}">${s ? itemIcon(s.id, 40) : ''}<em>${s && s.n > 1 ? s.n : ''}</em><u>${i + 1}</u></button>`;
      }
      h.innerHTML = html;
      h.querySelectorAll<HTMLElement>('[data-slot]').forEach((b) =>
        this.hotBound.push(
          bindButton(b, {
            onPress: () => {
              if (b.dataset.say) speak(b.dataset.say, { cool: 3000 });
              this.cb.sel(+b.dataset.slot!);
            },
            onHold: () => this.cb.drop(+b.dataset.slot!),
            holdMs: 650,
          }),
        ),
      );
      if (prevSel !== String(sel)) {
        const s = slots[sel];
        hn.innerHTML = s ? `<b>${esc(itemName(s.id))}</b>${itemStats(s.id) ? `<span>${itemStats(s.id)}</span>` : ''}` : '';
        this.nameT = s ? 1.6 : 0;
      }
      this.last.hsel = String(sel);
    });
  }
  /** modo dirigindo: combustível e carga (null = a pé) */
  setDrive(o: { fuel: number; inf: boolean; load: number; cap: number } | null): void {
    const el = this.q('[data-v="drive"]');
    el.hidden = !o;
    this.q('.nc-hotwrap').style.visibility = o || this.q('.nc-place').classList.contains('on') ? 'hidden' : '';
    if (!o) return;
    this.set('fuel', String(Math.round(o.fuel * 30)) + o.inf, () => {
      (this.q('[data-v="fuel"]') as HTMLElement).style.width = (o.inf ? 100 : Math.round(o.fuel * 100)) + '%';
      el.classList.toggle('low', !o.inf && o.fuel < 0.15);
    });
    this.set('load', o.load + '/' + o.cap, () => (this.q('[data-v="load"]').textContent = o.cap ? o.load + '/' + o.cap : '-'));
  }
  setPlacing(on: boolean): void {
    this.q('.nc-place').classList.toggle('on', on);
    this.q('.nc-hotwrap').style.visibility = on ? 'hidden' : '';
  }
  setVoice(on: boolean): void {
    this.q('[data-v="voice"]').innerHTML = ic(on ? 'speaker' : 'mute', 26, '#2a0b5c');
  }
  showBotsBtn(on: boolean): void {
    this.q('[data-b="bots"]').hidden = !on;
  }
  setCode(code: string, n: number): void {
    const c = this.q('[data-v="code"]');
    c.hidden = !code;
    this.set('code', code + n, () => (c.innerHTML = `${ic('key', 20)}${code}<span style="letter-spacing:0">${ic('people', 18)}${n}</span>`));
  }
  /** cartão do anoitecer: número da noite + quem vem hoje */
  dusk(n: number, kinds: number[]): void {
    const d = document.createElement('div');
    d.className = 'nc-dusk';
    const cols = ['#3a2a6a', '#5a3a9a', '#2a1a3a', '#7a7aa0', '#6a1a8a'];
    d.innerHTML = `<div class="n">${ic('moon', 30)}<b>${esc(t('noites.dusk.title', 'Noite {n}', { n }))}</b></div><div class="k">${kinds.length ? kinds.map((k) => ic('shadow', 30 + Math.min(k, 3) * 4, cols[k] ?? '#2a1a4a')).join('') : `${ic('star', 28)}<span>${esc(t('noites.dusk.calm', 'Noite calma'))}</span>`}</div>`;
    this.el.appendChild(d);
    setTimeout(() => d.classList.add('out'), 4200);
    setTimeout(() => d.remove(), 5000);
  }

  /* ------------------------------ mochila / baú ------------------------------ */
  get panel(): boolean {
    return !!this.craftEl || !!this.invEl;
  }
  get crafting(): boolean {
    return !!this.craftEl;
  }
  openInv(s: Sim, me: Player): void {
    if (this.invEl) return this.closeInv();
    this.closeCraft();
    const el = document.createElement('div');
    el.className = 'nc-panel nc-inv';
    this.invEl = el;
    this.pick = -1;
    this.el.parentElement!.appendChild(el);
    this.cb.panelOpen(true);
    const near = s.nearStore(me);
    speak(near ? t('noites.say.chestOpen', 'Toque num item para guardar ou pegar.') : t('noites.say.bagOpen', 'Sua mochila. Toque em dois espaços para trocar.'), { cool: 20000 });
    this.renderInv(s, me, near);
  }
  closeInv(): void {
    if (!this.invEl) return;
    this.invEl.remove();
    this.invEl = null;
    this.cb.panelOpen(false);
  }
  renderInv(s: Sim, me: Player, near: boolean): void {
    const el = this.invEl;
    if (!el) return;
    const cap = capSlots(me.wear.back, me.bot);
    const key = JSON.stringify(me.slots) + me.sel + near + JSON.stringify(near ? s.stash : 0) + this.pick + me.wear.back;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    const slot = (i: number) => {
      const st = me.slots[i];
      const lock = i >= cap;
      return `<button class="nc-islot ${i < HOT ? 'hot' : ''} ${i === this.pick ? 'pick' : ''} ${i === me.sel ? 'held' : ''} ${lock ? 'lock' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}>${lock ? ic('sack', 22, '#9a8ab0') : st ? itemIcon(st.id, 38) : ''}${st && st.n > 1 ? `<em>${st.n}</em>` : ''}</button>`;
    };
    let hot = '';
    for (let i = 0; i < HOT; i++) hot += slot(i);
    let bag = '';
    // mostra os espaços que tem + uma fileira trancada (o próximo saco)
    const MAXB = Math.min(capSlots('bag3'), cap + 4);
    for (let i = HOT; i < MAXB; i++) bag += slot(i);
    const stashIds = Object.keys(s.stash).filter((k) => (s.stash[k] ?? 0) > 0);
    stashIds.sort((a, b) => (RES.indexOf(a as Res) + 1 || 99) - (RES.indexOf(b as Res) + 1 || 99));
    const sack = me.wear.back;
    const pk = this.pick >= 0 ? me.slots[this.pick] : null;
    el.innerHTML = `
      <div class="row nc-ihead">
        <button class="nc-btn round red" data-x="close" data-say="${esc(t('noites.say.close', 'Fechar'))}">${ic('close', 30)}</button>
        <span class="nc-ititle">${ic('bag', 28)}${esc(t('noites.inv.bag', 'Mochila'))} <small>${usedSlots(me.slots.slice(0, cap))}/${cap}</small></span>
        <span class="nc-isack">${sack ? `${itemIcon(sack, 26)}<b>${esc(itemName(sack))}</b>` : `${ic('sack', 26, '#9a8ab0')}<b>${esc(t('noites.inv.noSack', 'Sem saco: ache um num baú!'))}</b>`}</span>
        <span class="sp"></span>
        ${pk ? `<button class="nc-btn red" data-x="drop" data-say="${esc(t('noites.say.drop', 'Soltar no chão'))}">${ic('drop', 26)}<span>${esc(t('noites.inv.drop', 'Soltar'))}</span></button>` : ''}
        ${near ? `<button class="nc-btn gold" data-x="all" data-say="${esc(t('noites.say.storeAll', 'Guardar tudo da mochila'))}">${ic('box', 26)}<span>${esc(t('noites.inv.storeAll', 'Guardar tudo'))}</span></button>` : ''}
      </div>
      <div class="nc-ibody">
        <div class="nc-icol">
          <div class="nc-ilab">${ic('hand', 18)}${esc(t('noites.inv.hand', 'Na mão'))}</div>
          <div class="nc-igrid hot">${hot}</div>
          <div class="nc-ilab">${ic('bag', 18)}${esc(t('noites.inv.inside', 'Dentro da mochila'))}</div>
          <div class="nc-igrid">${bag}</div>
          <div class="nc-ihint">${pk ? `${itemIcon(pk.id, 20)}<b>${esc(itemName(pk.id))}</b> ${itemStats(pk.id)} — ${esc(near ? t('noites.inv.hintStore', 'toque de novo para guardar no baú, ou em outro espaço para trocar')  : t('noites.inv.hintSwap', 'toque em outro espaço para trocar'))}` : esc(near ? t('noites.inv.hintNear', 'Toque num item da mochila para escolher; toque no baú para pegar.') : t('noites.inv.hintFar', 'Chegue perto do baú do acampamento para guardar.'))}</div>
        </div>
        ${
          near
            ? `<div class="nc-icol chest"><div class="nc-ilab">${ic('box', 18)}${esc(t('noites.inv.chest', 'Baú do acampamento'))}</div><div class="nc-igrid chest">${
                stashIds.map((k) => `<button class="nc-islot" data-c="${k}">${itemIcon(k, 38)}<em>${s.stash[k]}</em></button>`).join('') || `<div class="nc-iempty">${esc(t('noites.inv.empty', 'Vazio'))}</div>`
              }</div></div>`
            : ''
        }
      </div>`;
    el.querySelector('[data-x="close"]')!.addEventListener('click', () => this.closeInv());
    el.querySelector('[data-x="all"]')?.addEventListener('click', () => this.cb.storeAll());
    el.querySelector('[data-x="drop"]')?.addEventListener('click', () => {
      if (this.pick >= 0) this.cb.drop(this.pick);
      this.pick = -1;
    });
    el.querySelectorAll<HTMLElement>('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.dataset.i!;
        const st = me.slots[i];
        if (st) speak(itemName(st.id), { cool: 600, urgent: true });
        if (this.pick < 0) {
          if (st) this.pick = i;
        } else if (this.pick === i) {
          if (near) this.cb.store(i);
          this.pick = -1;
        } else {
          this.cb.swap(this.pick, i);
          this.pick = -1;
        }
        el.dataset.k = '';
        this.renderInv(s, me, near);
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-c]').forEach((b) =>
      b.addEventListener('click', () => {
        speak(itemName(b.dataset.c!), { cool: 600, urgent: true });
        this.cb.unstore(b.dataset.c!);
      }),
    );
  }

  /* ------------------------------ bancada ------------------------------ */
  openCraft(s: Sim, me: Player): void {
    if (this.craftEl) return;
    this.closeInv();
    const el = document.createElement('div');
    el.className = 'nc-panel nc-craft';
    this.craftEl = el;
    this.el.parentElement!.appendChild(el);
    this.cb.panelOpen(true);
    speak(t('noites.say.bench', 'Bancada! Escolha o que fazer.'), { cool: 20000 });
    this.renderCraft(s, me);
  }
  closeCraft(): void {
    if (!this.craftEl) return;
    this.craftEl.remove();
    this.craftEl = null;
    this.cb.panelOpen(false);
  }
  renderCraft(s: Sim, me: Player): void {
    const el = this.craftEl;
    if (!el) return;
    const sc = el.querySelector('.nc-grid')?.scrollTop ?? 0;
    const rs = el.querySelector('.nc-rail')?.scrollTop ?? 0;
    const have = RES.filter((r) => s.avail(r, me) > 0)
      .map((r) => `<span class="nc-chip">${ic(r, 22)}${s.avail(r, me)}</span>`)
      .join('');
    const tabs = CATS.map((c) => `<button class="nc-btn nc-tab ${c === this.cat ? 'gold on' : ''}" data-cat="${c}" data-say="${esc(catName(c))}">${ic(CAT_ICON[c], 34)}<span>${esc(catName(c))}</span></button>`).join('');
    const items = ITEMS.filter((d) => d.cat === this.cat);
    if (!ITEM[this.sel] || ITEM[this.sel].cat !== this.cat) this.sel = items.find((d) => !s.craftBlock(d, me))?.id ?? items[0]?.id ?? '';
    const cards = items.map((d) => this.card(d, s, me)).join('');
    const selD = ITEM[this.sel];
    const why = selD ? s.craftBlock(selD, me) ?? (selD.camp === 'bench' && s.benchLocked(selD.benchTo!) ? 'baby' : null) : 'none';
    const cost = selD
      ? Object.entries(selD.cost)
          .map(([k, n]) => {
            const h = s.avail(k, me);
            return `<span class="nc-cost ${h >= (n ?? 0) ? 'ok' : 'no'}">${ic(k, 22)}<b>${Math.min(h, n ?? 0)}/${n}</b></span>`;
          })
          .join('')
      : '';
    el.innerHTML = `
      <div class="row nc-chead">
        <button class="nc-btn round red" data-x="close" data-say="${esc(t('noites.say.close', 'Fechar'))}">${ic('close', 30)}</button>
        <span class="nc-ititle">${ic('bench', 28)}${s.bench}</span>
        <div class="nc-stash">${have || ic('wood', 22) + ' 0'}</div>
      </div>
      <div class="nc-cbody">
        <div class="nc-rail nc-scroll">${tabs}</div>
        <div class="nc-grid nc-scroll">${cards}</div>
        <div class="nc-side">
          ${selD ? `<div class="nc-sicon">${itemIcon(selD.id, 64)}</div><div class="nc-sname">${esc(selD.n())}</div><div class="nc-sstat">${itemStats(selD.id)}</div><div class="nc-scost">${cost}</div>` : ''}
          <div class="nc-swhy">${why && why !== 'none' && selD ? esc(whyText(why, selD, s, me)) : ''}</div>
          <button class="nc-btn nc-make ${why ? 'off' : 'green'}" data-x="make" ${selD ? '' : 'disabled'} data-say="${esc(t('noites.say.make', 'Fazer!'))}">${ic('craft', 40, why ? '#6a5a8a' : '')}<span>${esc(t('noites.make', 'Fazer'))}</span></button>
        </div>
      </div>`;
    el.querySelector('.nc-grid')!.scrollTop = sc;
    el.querySelector('.nc-rail')!.scrollTop = rs;
    el.querySelectorAll<HTMLElement>('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        this.cat = b.dataset.cat as Cat;
        speak(b.dataset.say ?? '', { cool: 800, urgent: true });
        this.renderCraft(s, me);
        el.querySelector('.nc-grid')!.scrollTop = 0;
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-it]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sel = b.dataset.it!;
        const d = ITEM[this.sel];
        const w = s.craftBlock(d, me) ?? (d.camp === 'bench' && s.benchLocked(d.benchTo!) ? 'baby' : null);
        speak(d.n() + (w ? '. ' + whyText(w, d, s, me) : ''), { cool: 300, urgent: true });
        this.renderCraft(s, me);
      }),
    );
    el.querySelector('[data-x="close"]')!.addEventListener('click', () => this.closeCraft());
    el.querySelector('[data-x="make"]')!.addEventListener('click', () => {
      if (!selD) return;
      if (why) {
        speak(whyText(why, selD, s, me), { cool: 300, urgent: true });
        return;
      }
      this.cb.craft(selD.id);
    });
    // dica de rolagem (some quando chega ao fim)
    el.querySelectorAll<HTMLElement>('.nc-scroll').forEach((sc2) => {
      const upd = () => {
        sc2.classList.toggle('more', sc2.scrollTop + sc2.clientHeight < sc2.scrollHeight - 4);
        sc2.classList.toggle('less', sc2.scrollTop > 4);
      };
      sc2.addEventListener('scroll', upd, { passive: true });
      requestAnimationFrame(upd);
    });
  }
  private card(d: ItemDef, s: Sim, me: Player): string {
    const why = s.craftBlock(d, me);
    const has = (d.wear && me.wear[d.wear.slot] === d.id) || me.slots.some((q) => q?.id === d.id) || why === 'have';
    const lockT = why === 'tier';
    const babyLock = d.camp === 'bench' && s.benchLocked(d.benchTo!);
    const cost = Object.entries(d.cost)
      .map(([k, n]) => `<span class="nc-cost sm ${s.avail(k, me) >= (n ?? 0) ? 'ok' : 'no'}">${ic(k, 16)}<b>${n}</b></span>`)
      .join('');
    const lk = lockT ? `<span class="lk">${ic('lock', 16)}${ic('bench', 16)}${d.tier}</span>` : babyLock ? `<span class="lk">${ic('lock', 16)}${ic('baby', 16)}${BENCH_BABIES[d.benchTo!]}</span>` : d.pot && !s.hasPot() ? `<span class="lk">${ic('pot', 18)}</span>` : '';
    return `<div class="nc-card ${this.sel === d.id ? 'sel' : ''} ${lockT ? 'lock' : ''} ${!why && !babyLock ? 'ok' : ''}" data-it="${d.id}">${has ? `<span class="have">${ic('check', 18)}</span>` : ''}${lk}<div class="ci">${itemIcon(d.id, 48)}</div><div class="nm">${esc(d.n())}</div><div class="cost">${cost}</div></div>`;
  }

  destroy(): void {
    for (const b of this.bound) b.destroy();
    for (const b of this.hotBound) b.destroy();
    this.craftEl?.remove();
    this.invEl?.remove();
    this.el.remove();
  }
}

const CAT_ICON: Record<Cat, string> = { tool: 'axe', light: 'lamp', build: 'fence', food: 'bowl', wear: 'scarf', camp: 'fire' };

export function whyText(w: string, d: ItemDef, s: Sim, me?: Player): string {
  switch (w) {
    case 'tier':
      return t('noites.why.tier', 'Precisa da bancada nível {n}.', { n: d.tier });
    case 'baby':
      return t('noites.why.baby', 'Resgate {n} bebês primeiro!', { n: BENCH_BABIES[d.benchTo ?? 0] - s.rescued });
    case 'pot':
      return t('noites.why.pot', 'Precisa da panela no acampamento.');
    case 'have':
      return t('noites.why.have', 'Você já tem isso!');
    case 'res': {
      const miss = Object.keys(d.cost).find((k) => s.avail(k, me) < (d.cost[k as Res] ?? 0));
      return t('noites.why.res', 'Falta {x}.', { x: miss ? itemName(miss) : '' });
    }
  }
  return '';
}

