/* ============================================================
 *  LENHADORES DO BOSQUE — HUD em HTML (barra de cima, joystick,
 *  botão de cortar, botão de contexto, loja, emotes, resumo).
 * ============================================================ */
import { t, fmt } from '../../i18n';
import { BIOMES, BUILDS, HELPERS, MACHINES, TOOLS, VEHICLES, helperCost, machineCost, prestigeMult, short } from './data';
import { flIcon, type FlIcon } from './icons';
import type { Sim } from './sim';
import { GEAR_SVG, PAW_SVG, openControls } from './touchcfg';
import { guideStep } from './guide';
import { createJoystick, getControlPrefs, onControlPrefs, type Joystick } from '../../ui/touch';
import { bigMoment, clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../ui/notify';

export interface HudHost {
  sim: Sim;
  is3d: boolean;
  joy: { x: number; y: number };
  chopHeld: boolean;
  onExit(): void;
  onEmote(code: string): void;
  onToggleCam(): void;
  onSolo(on: boolean): void;
  onAction(kind: 'sell' | 'build'): void;
  playersCount(): number;
}

type Tab = 'tools' | 'vehicles' | 'machines' | 'helpers' | 'renew';

const EMOTES: [string, FlIcon][] = [
  ['oi', 'wave'],
  ['joinha', 'thumb'],
  ['uau', 'star'],
  ['coracao', 'heart'],
  ['vamos', 'smile'],
];

export class Hud {
  el: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private bol!: HTMLElement;
  private pl!: HTMLElement;
  private carry!: HTMLElement;
  private hbar!: HTMLElement;
  private hpct!: HTMLElement;
  private health!: HTMLElement;
  private ctx!: HTMLButtonElement;
  private chop!: HTMLButtonElement;
  private joyC: Joystick;
  private players!: HTMLElement;
  private modal: HTMLDivElement | null = null;
  private tab: Tab = 'tools';
  private last = { b: -1, p: -1, c: -1, h: -1, ctx: '', n: -1 };
  private guideKey = '\u0000';
  private lastBiome = -1;
  private offs: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    private host: HudHost,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'fl-hud';
    this.el.innerHTML = `
      <div class="fl-top">
        <button class="fl-btn round red" data-a="exit" aria-label="${t('floresta.exit', 'Sair')}">${flIcon('close', 26)}</button>
        <div class="fl-pill">${flIcon('acorn', 26)}<span data-v="bol">0</span></div>
        <div class="fl-pill">${flIcon('plank', 26)}<span data-v="pl">0</span></div>
        <div class="fl-pill">${flIcon('log', 26)}<span data-v="carry">0</span></div>
        <div class="fl-health" title="${t('floresta.health', 'Floresta saudável')}">${flIcon('leaf', 26)}<div class="bar"><i></i></div><span data-v="hp">100%</span></div>
        <div class="fl-right">
          <div class="fl-pill fl-players" data-v="players"></div>
          <button class="fl-btn round" data-a="ctl" aria-label="${t('floresta.ctl.title', 'Controles')}">${GEAR_SVG(26)}</button>
          <button class="fl-btn round" data-a="emote" aria-label="${t('floresta.emote', 'Emotes')}">${flIcon('emote', 28)}</button>
          <button class="fl-btn round gold" data-a="shop" aria-label="${t('floresta.shop', 'Loja')}">${flIcon('shop', 28)}</button>
        </div>
      </div>
      <div class="fl-emotes">${EMOTES.map(([c, i]) => `<button class="fl-btn round" data-emote="${c}">${flIcon(i, 28)}</button>`).join('')}</div>
      <div class="fl-bottom">
        <button class="fl-btn gold fl-ctx hide" data-a="ctx"></button>
        <button class="fl-btn green fl-pets hide" data-a="pets">${PAW_SVG(26)}<span>${t('floresta.petsCmd', 'Ajudantes, cortem!')}</span></button>
        <button class="fl-chop" aria-label="${t('floresta.chop', 'Cortar')}">${flIcon(TOOLS[host.sim.s.tool].kind === 'axe' ? 'axe' : TOOLS[host.sim.s.tool].kind === 'saw' ? 'saw' : 'laser', 52)}<span>${t('floresta.chop', 'Cortar')}</span></button>
      </div>`;
    root.appendChild(this.el);
    this.bol = this.q('[data-v="bol"]');
    this.pl = this.q('[data-v="pl"]');
    this.carry = this.q('[data-v="carry"]');
    this.hbar = this.q('.fl-health .bar i');
    this.hpct = this.q('[data-v="hp"]');
    this.health = this.q('.fl-health');
    this.ctx = this.q('[data-a="ctx"]');
    this.chop = this.q('.fl-chop');
    this.players = this.q('[data-v="players"]');

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-a],[data-emote]') as HTMLElement | null;
      if (!b) return;
      const a = b.dataset.a;
      if (b.dataset.emote) {
        host.onEmote(b.dataset.emote);
        this.closeEmotes();
      } else if (a === 'exit') host.onExit();
      else if (a === 'shop') this.openShop();
      else if (a === 'emote') {
        const e = this.q('.fl-emotes');
        if (e.classList.toggle('show')) {
          // logo abaixo do botão, alinhado à direita dele (longe das bordas)
          const r = b.getBoundingClientRect();
          const hr = this.el.getBoundingClientRect();
          e.style.top = r.bottom - hr.top + 6 + 'px';
          e.style.right = Math.max(0, hr.right - r.right) + 'px';
          clearTimeout(this.emoteTo);
          this.emoteTo = window.setTimeout(() => this.closeEmotes(), 3000);
        }
      }
      else if (a === 'cam') host.onToggleCam();
      else if (a === 'ctx') host.onAction(this.last.ctx as 'sell' | 'build');
      else if (a === 'ctl') openControls(this.el, (on) => host.onSolo(on));
      else if (a === 'pets') {
        const n = host.sim.commandHelpers();
        notify(n ? t('floresta.petsGo', 'Ajudantes: "Vamos lá!"') : t('floresta.petsNone', 'Você ainda não tem ajudantes'), { kind: n ? 'good' : 'info' });
      }
    });
    this.bindChop();
    // analógico flutuante compartilhado (src/ui/touch): nasce sob o polegar, metade esquerda
    this.joyC = createJoystick(root, { zoneTop: 0.2 });
    this.offs.push(() => this.joyC.destroy());
    const lefty = (p: { lefty: boolean }) => root.classList.toggle('fl-lefty', p.lefty);
    lefty(getControlPrefs());
    this.offs.push(onControlPrefs(lefty));
    const top = this.q('.fl-top');
    const setTop = () => {
      const px = top.getBoundingClientRect().bottom - this.el.getBoundingClientRect().top;
      this.el.style.setProperty('--toph', px + 'px');
      setNotifyTop(px + 4);
    };
    setTop();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(setTop);
      ro.observe(top);
      this.offs.push(() => ro.disconnect());
    }
  }

  private bindChop(): void {
    const c = this.chop;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      this.host.chopHeld = true;
      c.classList.add('on');
    };
    const up = () => {
      this.host.chopHeld = false;
      c.classList.remove('on');
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
  }




  /* ------------------------------ por quadro (barato) ------------------------------ */

  update(_dt: number): void {
    const s = this.host.sim;
    const js = this.joyC.read();
    this.host.joy.x = js.x;
    this.host.joy.y = this.host.is3d ? js.y : 0;
    const v = s.vehicle;
    const L = this.last;
    const b = Math.floor(s.s.bolotas);
    if (b !== L.b) {
      L.b = b;
      this.bol.textContent = short(b);
    }
    const p = Math.floor(s.s.planks);
    if (p !== L.p) {
      L.p = p;
      this.pl.textContent = short(p);
    }
    const c = s.me.carry * 1000 + v.cap;
    if (c !== L.c) {
      L.c = c;
      this.carry.textContent = `${s.me.carry}/${v.cap}`;
    }
    const h = Math.round(s.health * 100);
    if (h !== L.h) {
      L.h = h;
      this.hbar.style.width = h + '%';
      this.hpct.textContent = h + '%';
      this.health.classList.toggle('happy', s.happy);
    }
    const n = this.host.playersCount();
    if (n !== L.n) {
      L.n = n;
      this.players.innerHTML = flIcon('smile', 22) + `<span>${n}/5</span>`;
    }
    // botão de contexto
    let ctx = '';
    if (s.nearSell() && s.s.planks > 0) ctx = 'sell';
    else if (s.nearGate()) ctx = 'build';
    const key = ctx + (ctx === 'sell' ? Math.floor(s.s.planks * s.s.plankVal * s.saleMult) : ctx === 'build' ? s.s.planks * 7 + s.s.bolotas : 0);
    if (key !== (this as any)._ctxKey) {
      (this as any)._ctxKey = key;
      L.ctx = ctx;
      this.ctx.classList.toggle('hide', !ctx);
      if (ctx === 'sell') {
        this.ctx.innerHTML = flIcon('sell', 28) + `<span>${t('floresta.sell', 'Vender')} +${short(s.s.planks * s.s.plankVal * s.saleMult)}</span>`;
        this.ctx.disabled = false;
      } else if (ctx === 'build') {
        const B = BUILDS[s.canBuild()];
        const ok = s.s.planks >= B.planks && s.s.bolotas >= B.cost;
        this.ctx.innerHTML = flIcon('hammer', 28) + `<span>${t('floresta.build', 'Construir')}: ${B.name()}<br><small>${short(B.planks)} ${t('floresta.planks', 'tábuas')} + ${short(B.cost)}</small></span>`;
        this.ctx.disabled = !ok;
      }
    }
    const pets = !s.solo && s.helperCount() > 0 && s.s.tutorial >= 4;
    if (pets !== (this as any)._pets) {
      (this as any)._pets = pets;
      this.q('.fl-pets').classList.toggle('hide', !pets);
    }
    // bioma novo: aviso pequeno no canto
    const bi = s.biome;
    if (bi !== this.lastBiome) {
      const first = this.lastBiome < 0;
      this.lastBiome = bi;
      if (!first || bi > 0) notify(`${BIOMES[bi].name()} · ${t('floresta.biomeSub', 'Bioma {n} de {m}', { n: bi + 1, m: BIOMES.length })}`, { kind: 'good' });
    }
    this.guide();
    if (this.modal && this.tab && (this as any)._shopB !== b) {
      (this as any)._shopB = b;
      this.renderShop();
    }
  }

  private emoteTo = 0;
  private closeEmotes(): void {
    clearTimeout(this.emoteTo);
    this.q('.fl-emotes').classList.remove('show');
  }

  /** primeira sessão guiada: um objetivo por vez, um botão destacado, HUD progressivo */
  private guide(): void {
    const s = this.host.sim;
    const g = guideStep(s, this.host.is3d);
    const key = g.step + ':' + g.goal;
    if (key === this.guideKey) return;
    this.guideKey = key;
    objective(g.goal ? t('floresta.goal', 'Objetivo: {g}', { g: g.goal }) : null);
    if (g.tip) notify(g.tip, { key: 'guide' });
    // destaque no único botão relevante
    for (const el of Array.from(this.el.parentElement?.querySelectorAll('.fl-glow') ?? [])) el.classList.remove('fl-glow');
    const sel = g.button === 'chop' ? '.fl-chop' : g.button === 'ctx' ? '.fl-ctx' : g.button === 'shop' ? '[data-a="shop"]' : g.button === 'grab' ? '[data-act="grab"]' : g.button === 'throw' ? '[data-act="throw"]' : '';
    if (sel) this.el.parentElement?.querySelector(sel)?.classList.add('fl-glow');
    // HUD progressivo: loja só depois da 1ª venda; emotes/controles extras no fim do guia
    const lvl = s.s.tutorial;
    this.el.classList.toggle('g-noshop', lvl < 3);
    this.el.classList.toggle('g-basic', lvl < 4);
    this.el.parentElement?.classList.toggle('fl-guided', lvl < 4);
  }

  showBanner(title: string, sub = ''): void {
    bigMoment(title, { sub });
  }

  toast(msg: string, kind = ''): void {
    notify(msg, { kind: kind === 'eco' ? 'good' : kind === 'warn' ? 'warn' : 'info', icon: kind === 'eco' ? undefined : undefined });
  }


  setChopIcon(): void {
    const k = TOOLS[this.host.sim.s.tool].kind;
    this.chop.innerHTML = flIcon(k === 'axe' ? 'axe' : k === 'saw' ? 'saw' : 'laser', 52) + `<span>${t('floresta.chop', 'Cortar')}</span>`;
  }

  /* ------------------------------ loja ------------------------------ */

  openShop(tab: Tab = this.tab): void {
    this.tab = tab;
    this.closeModal();
    const m = document.createElement('div');
    m.className = 'fl-modal';
    m.innerHTML = `<div class="fl-card">
      <h2>${flIcon('shop', 30)}<span>${t('floresta.shop', 'Loja')}</span><span class="fl-pill" style="color:#fff;font-size:14px">${flIcon('acorn', 22)}<span data-v="sb"></span></span><button class="fl-btn round red" data-x="1">${flIcon('close', 24)}</button></h2>
      <div class="fl-tabs">
        <button data-tab="tools">${flIcon('axe', 20)}${t('floresta.tab.tools', 'Ferramentas')}</button>
        <button data-tab="vehicles">${flIcon('truck', 20)}${t('floresta.tab.vehicles', 'Veículos')}</button>
        <button data-tab="machines">${flIcon('mill', 20)}${t('floresta.tab.machines', 'Máquinas')}</button>
        <button data-tab="helpers">${flIcon('bot', 20)}${t('floresta.tab.helpers', 'Ajudantes')}</button>
        <button data-tab="renew">${flIcon('seed', 20)}${t('floresta.tab.renew', 'Renovar')}</button>
      </div>
      <div class="fl-list"></div></div>`;
    m.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el === m || el.closest('[data-x]')) return this.closeModal();
      const tb = el.closest('[data-tab]') as HTMLElement | null;
      if (tb) {
        this.tab = tb.dataset.tab as Tab;
        this.renderShop();
        return;
      }
      const buy = el.closest('[data-buy]') as HTMLElement | null;
      if (buy && !(buy as HTMLButtonElement).disabled) this.buy(buy.dataset.buy!);
    });
    this.el.appendChild(m);
    this.modal = m;
    this.renderShop();
  }

  closeModal(): void {
    this.modal?.remove();
    this.modal = null;
  }
  get modalOpen(): boolean {
    return !!this.modal;
  }

  private buy(id: string): void {
    const s = this.host.sim;
    let ok = false;
    if (id === 'tool') ok = s.buyTool();
    else if (id === 'veh') ok = s.buyVehicle();
    else if (id.startsWith('m:')) ok = s.buyMachine(id.slice(2) as any);
    else if (id.startsWith('h:')) ok = s.buyHelper(Number(id.slice(2)));
    else if (id === 'renew') {
      const g = s.renewGain();
      ok = s.renew();
      if (ok) {
        this.closeModal();
        this.showBanner(t('floresta.renewed', 'Bosque renovado!'), t('floresta.renewedSub', '+{n} sementes douradas', { n: g }));
        return;
      }
    }
    if (ok) {
      this.setChopIcon();
      this.toast(t('floresta.bought', 'Comprado!'));
      if (id === 'tool' && s.s.tutorial === 3) {
        s.s.tutorial = 4;
        bigMoment(t('floresta.guideDone', 'Você é um lenhador!'), { sub: t('floresta.guideDoneSub', 'Agora o bosque é todo seu') });
      }
    }
    this.renderShop();
  }

  private item(icon: FlIcon, name: string, desc: string, price: number | null, id: string, ownedText = ''): string {
    const s = this.host.sim;
    const can = price !== null && s.s.bolotas >= price;
    const btn =
      price === null
        ? `<button class="fl-btn" disabled>${ownedText || t('floresta.max', 'Máximo')}</button>`
        : `<button class="fl-btn ${can ? 'green' : ''}" data-buy="${id}" ${can ? '' : 'disabled'}>${flIcon('acorn', 20)}${short(price)}</button>`;
    return `<div class="fl-item">${flIcon(icon, 44)}<div class="txt"><b>${name}</b><span>${desc}</span></div>${btn}</div>`;
  }

  private renderShop(): void {
    const m = this.modal;
    if (!m) return;
    const s = this.host.sim;
    const S = s.s;
    (m.querySelector('[data-v="sb"]') as HTMLElement).textContent = short(S.bolotas);
    m.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === this.tab));
    const list = m.querySelector('.fl-list') as HTMLElement;
    let html = '';
    if (this.tab === 'tools') {
      const cur = TOOLS[S.tool];
      html += `<div class="fl-item owned">${flIcon(cur.kind === 'axe' ? 'axe' : cur.kind === 'saw' ? 'saw' : 'laser', 44)}<div class="txt"><b>${cur.name()}</b><span>${t('floresta.power', 'Força {n} · {r} golpes/s', { n: cur.dmg, r: cur.rate })}</span></div><button class="fl-btn" disabled>${t('floresta.equipped', 'Em uso')}</button></div>`;
      const nx = TOOLS[S.tool + 1];
      if (nx) html += this.item(nx.kind === 'axe' ? 'axe' : nx.kind === 'saw' ? 'saw' : 'laser', nx.name(), t('floresta.power', 'Força {n} · {r} golpes/s', { n: nx.dmg, r: nx.rate }), nx.cost, 'tool');
      for (let i = S.tool + 2; i < TOOLS.length; i++) html += `<div class="fl-item owned">${flIcon('lock', 44)}<div class="txt"><b>${TOOLS[i].name()}</b><span>${flIcon('acorn', 14)} ${short(TOOLS[i].cost)}</span></div></div>`;
    } else if (this.tab === 'vehicles') {
      const icons: FlIcon[] = ['smile', 'barrow', 'truck', 'loader', 'train'];
      const cur = VEHICLES[S.vehicle];
      html += `<div class="fl-item owned">${flIcon(icons[S.vehicle], 44)}<div class="txt"><b>${cur.name()}</b><span>${t('floresta.cap', 'Carrega {n} toras', { n: cur.cap })}</span></div><button class="fl-btn" disabled>${t('floresta.equipped', 'Em uso')}</button></div>`;
      const nx = VEHICLES[S.vehicle + 1];
      if (nx) html += this.item(icons[S.vehicle + 1], nx.name(), t('floresta.cap', 'Carrega {n} toras', { n: nx.cap }), nx.cost, 'veh');
      for (let i = S.vehicle + 2; i < VEHICLES.length; i++) html += `<div class="fl-item owned">${flIcon('lock', 44)}<div class="txt"><b>${VEHICLES[i].name()}</b><span>${flIcon('acorn', 14)} ${short(VEHICLES[i].cost)}</span></div></div>`;
    } else if (this.tab === 'machines') {
      const icons: FlIcon[] = ['mill', 'planer', 'belt', 'nursery'];
      MACHINES.forEach((mc, i) => {
        const lvl = S.mach[mc.id];
        html += this.item(icons[i], `${mc.name()} · ${t('floresta.lvl', 'nível {n}', { n: lvl + 1 })}`, mc.desc(), machineCost(mc, lvl), 'm:' + mc.id);
      });
    } else if (this.tab === 'helpers') {
      const icons: FlIcon[] = ['bot', 'drone', 'planter'];
      HELPERS.forEach((h, i) => {
        const n = S.help[h.id];
        html += this.item(icons[i], `${h.name()} (${n}/${h.max})`, h.desc(), n >= h.max ? null : helperCost(i, n), 'h:' + i);
      });
    } else {
      const g = s.renewGain();
      html += `<div class="fl-item">${flIcon('seed', 44)}<div class="txt"><b>${t('floresta.renew', 'Renovar o bosque')}</b><span>${t('floresta.renewDesc', 'Recomece com sementes douradas: todo o bosque renasce e suas vendas rendem mais para sempre.')}</span></div></div>`;
      html += `<div class="fl-item"><div class="txt"><b>${t('floresta.seeds', 'Sementes douradas: {n}', { n: S.seeds })}</b><span>${t('floresta.mult', 'Bônus de venda: x{n}', { n: prestigeMult(S.seeds).toFixed(2) })}</span></div></div>`;
      if (S.unlocked < 3) html += `<div class="fl-item owned">${flIcon('lock', 44)}<div class="txt"><b>${t('floresta.renewLock', 'Abra o {b} para renovar', { b: BIOMES[2].name() })}</b></div></div>`;
      else html += `<div class="fl-item"><div class="txt"><b>+${g} ${t('floresta.seedsShort', 'sementes')}</b><span>${t('floresta.renewKeep', 'Você mantém as sementes e as estatísticas.')}</span></div><button class="fl-btn ${g > 0 ? 'gold' : ''}" data-buy="renew" ${g > 0 ? '' : 'disabled'}>${t('floresta.renewBtn', 'Renovar')}</button></div>`;
    }
    list.innerHTML = html;
  }

  /* ------------------------------ resumo ------------------------------ */

  summary(data: { earned: number; trees: number; planks: number; coins: number }, canDouble: boolean, onDouble: () => Promise<boolean>, onLeave: () => void, onStay: () => void): void {
    this.closeModal();
    const m = document.createElement('div');
    m.className = 'fl-modal';
    m.innerHTML = `<div class="fl-card"><h2>${flIcon('tree', 32)}<span>${t('floresta.sumTitle', 'Bom trabalho, lenhador!')}</span></h2>
      <div class="fl-sum">
        <div class="row"><div>${flIcon('tree', 26)}${fmt(data.trees)}</div><div>${flIcon('plank', 26)}${fmt(data.planks)}</div><div>${flIcon('acorn', 26)}${short(data.earned)}</div></div>
        <div style="font-size:13px">${t('floresta.sumEco', 'Cada árvore cortada vira uma muda nova. O bosque continua crescendo!')}</div>
        <div class="big"><span data-v="coins">+${fmt(data.coins)}</span> <i class="coin"></i>${t('floresta.coins', 'moedas')}</div>
        ${canDouble ? `<button class="fl-btn gold" data-d="1">${flIcon('star', 24)}${t('floresta.double', 'Dobrar com vídeo')}</button>` : ''}
        <button class="fl-btn green" data-l="1">${t('floresta.leave', 'Voltar ao hub')}</button>
        <button class="fl-btn" data-s="1">${t('floresta.stay', 'Continuar cortando')}</button>
      </div></div>`;
    m.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-l]')) onLeave();
      else if (el.closest('[data-s]')) {
        this.closeModal();
        onStay();
      } else if (el.closest('[data-d]')) {
        const b = el.closest('[data-d]') as HTMLButtonElement;
        b.disabled = true;
        if (await onDouble()) {
          (m.querySelector('[data-v="coins"]') as HTMLElement).textContent = '+' + fmt(data.coins * 2);
          b.remove();
        } else b.disabled = false;
      }
    });
    this.el.appendChild(m);
    this.modal = m;
  }

  destroy(): void {
    clearTimeout(this.emoteTo);
    for (const f of this.offs) f();
    objective(null);
    clearNotify();
    resetNotifyTop();
    this.el.remove();
  }
}
