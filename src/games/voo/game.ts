/* ============================================================
 *  POUSO FORÇADO — entrada do jogo (chunk sob demanda).
 *  Fluxo: hangar (2D/3D, tipo de voo, papel, ajudantes, pintura)
 *  → dossiê da missão → abertura (decolagem + comandante desmaia)
 *  → voo com emergências → pouso → relatório em dossiê.
 * ============================================================ */
import './voo.css';
import { t } from '../../i18n';
import { addCoins } from '../../core/economy';
import { pushBack } from '../../core/back';
import { audio } from '../../core/audio';
import { tap, success } from '../../core/haptics';
import { lockOrientation, restorePortrait } from '../../core/orientation';
import { QualityGovernor, detectInitialTier, loadMode } from '../../core/quality';
import { save as globalSave } from '../../core/storage';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { displayName } from '../../services/leaderboard';
import { sfx } from '../../3d/common/sfx';
import { BOT_NAMES, BOT_SKINS, CABINS, CITIES, LIVERIES, roleName } from './data';
import { briefing, endReport, titleCard, type CrewLine } from './dossier';
import { Hud, type HudHost } from './hud';
import { hatIcon, vIcon } from './icons';
import { LocalNet, type VooNet } from './net';
import { cabinOf, dayIndex, liveryOf, loadSave, writeSave, type VooSave } from './save';
import { Sim, mulberry } from './sim';
import { View2D } from './view2d';
import type { View3D } from './view3d';

export interface LaunchOpts {
  mode?: '2d' | '3d';
  flight?: 'normal' | 'daily' | 'training';
  bots?: number;
  role?: number;
  seed?: number;
  /** pula dossiê e abertura (testes) */
  quick?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void, opts: LaunchOpts = {}): Promise<MiniGameHandle> {
  const g = new VooGame(root, exit, opts);
  void g.start();
  return g;
}

type FlightKind = 'normal' | 'daily' | 'training';

export class VooGame implements MiniGameHandle, HudHost {
  sim!: Sim;
  hud: Hud | null = null;
  view: View3D | View2D | null = null;
  is3d = false;
  joy = { x: 0, y: 0 };
  actHeld = false;
  net: VooNet = new LocalNet();
  private wrap: HTMLDivElement;
  private sv: VooSave;
  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;
  private gov: QualityGovernor;
  private popBack: (() => void) | null = null;
  private cut = -1;
  private cutEls: HTMLElement[] = [];
  private flightKind: FlightKind = 'normal';
  private role = 0;
  private bots = 3;
  private flightNo = '';
  private route: [string, string] = ['', ''];
  private weather = 0;
  private reported = false;
  private alarmT = 0;
  private startT = 0;

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
    private opts: LaunchOpts,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'voo-root';
    root.appendChild(this.wrap);
    this.sv = loadSave();
    this.gov = new QualityGovernor({ mode: loadMode(), persist: false, emit: false, onChange: (tier) => this.view && 'setTier' in this.view && (this.view as View3D).setTier(tier) });
    this.bots = opts.bots ?? this.sv.bots;
    this.role = opts.role ?? 0;
    void lockOrientation('landscape');
  }

  async start(): Promise<void> {
    if (this.opts.quick) {
      this.flightKind = this.opts.flight ?? 'normal';
      await this.begin(this.opts.mode ?? '3d');
      return;
    }
    this.lobby();
  }

  /* ============================== hangar (lobby) ============================== */

  private lobby(): void {
    this.setBack(() => this.finish());
    const sv = this.sv;
    const gl = webglOk();
    const tier = detectInitialTier();
    let mode: '2d' | '3d' = sv.mode === '2d' || !gl ? '2d' : '3d';
    const d = document.createElement('div');
    d.className = 'voo-scr voo-lobby';
    const today = dayIndex();
    const dailyDone = sv.daily.day === today;
    const render = () => {
      d.innerHTML = `<div class="voo-lcard">
        <h2>${vIcon('plane', 36)}${esc(t('voo.name', 'Pouso Forçado'))}<small>${esc(t('voo.lobby.sub', 'O comandante desmaiou. Pousem esse avião!'))}</small><button class="voo-btn round red" data-x>${vIcon('close', 26)}</button></h2>
        <div class="voo-sec"><b>${vIcon('cube', 20)}${esc(t('voo.lobby.view', 'Visão'))}</b><div class="voo-row">
          <button class="voo-opt ${mode === '3d' ? 'sel' : ''}" data-m="3d" ${gl ? '' : 'disabled'}>${vIcon('cube', 22)}<span>3D<small>${esc(gl ? (tier <= 1 ? t('voo.lobby.3dWeak', 'Primeira pessoa (pode pesar aqui)') : t('voo.lobby.3d', 'Primeira pessoa, dentro do avião')) : t('voo.lobby.no3d', 'Indisponível neste aparelho'))}</small></span></button>
          <button class="voo-opt ${mode === '2d' ? 'sel' : ''}" data-m="2d">${vIcon('square', 22)}<span>2D<small>${esc(t('voo.lobby.2d', 'Vista de cima, leve'))}</small></span></button>
        </div></div>
        <div class="voo-sec"><b>${vIcon('calendar', 20)}${esc(t('voo.lobby.flight', 'Voo'))}</b><div class="voo-row">
          <button class="voo-opt ${this.flightKind === 'normal' ? 'sel' : ''}" data-f="normal">${vIcon('plane', 22)}<span>${esc(t('voo.mode.normal', 'Voo normal'))}<small>${esc(t('voo.lobby.normal', 'Emergências aleatórias'))}</small></span></button>
          <button class="voo-opt ${this.flightKind === 'daily' ? 'sel' : ''}" data-f="daily">${vIcon('calendar', 22)}<span>${esc(t('voo.mode.daily', 'Voo do dia'))}<small>${esc(dailyDone ? t('voo.lobby.dailyDone', 'Feito hoje: {s} estrela(s)', { s: sv.daily.stars }) : t('voo.lobby.daily', 'Igual para todos hoje · bônus'))}</small></span></button>
          <button class="voo-opt ${this.flightKind === 'training' ? 'sel' : ''}" data-f="training">${vIcon('school', 22)}<span>${esc(t('voo.mode.training', 'Treino de pouso'))}<small>${esc(t('voo.lobby.training', 'Só a final, sem emergências'))}</small></span></button>
        </div></div>
        <div class="voo-sec"><b>${hatIcon(this.role, 20)}${esc(t('voo.lobby.role', 'Seu papel'))}</b><div class="voo-row">
          ${[0, 1, 2, 3].map((r) => `<button class="voo-opt ${this.role === r ? 'sel' : ''}" data-r="${r}">${hatIcon(r, 26)}<span>${esc(roleName(r))}</span></button>`).join('')}
        </div><div class="voo-note">${esc(t('voo.lobby.roleNote', 'Todo mundo pode fazer tudo — o papel muda o chapéu e onde você começa.'))}</div></div>
        <div class="voo-sec"><b>${vIcon('crew', 20)}${esc(t('voo.lobby.helpers', 'Ajudantes Bloop'))}</b><div class="voo-row">
          ${[0, 1, 2, 3].map((n) => `<button class="voo-opt ${this.bots === n ? 'sel' : ''}" data-b="${n}">${n === 0 ? esc(t('voo.lobby.solo', 'Sozinho')) : n}</button>`).join('')}
        </div><div class="voo-note">${esc(t('voo.lobby.botsNote', 'Eles só agem quando você manda, e demoram um pouco. Pilotar e pousar é com você!'))}</div></div>
        <div class="voo-sec"><b>${vIcon('star', 20)}${esc(t('voo.lobby.livery', 'Pintura do avião'))}</b><div class="voo-row">
          ${LIVERIES.map((l) => `<button class="voo-opt ${liveryOf(sv).id === l.id ? 'sel' : ''}" data-l="${l.id}" ${sv.stars >= l.stars ? '' : 'disabled'}><span class="sw" style="background:linear-gradient(135deg,${l.body} 40%,${l.stripe} 40% 60%,${l.tail} 60%)"></span>${esc(l.name())}${sv.stars >= l.stars ? '' : ` <small>${vIcon('star', 12)}${l.stars}</small>`}</button>`).join('')}
        </div></div>
        <div class="voo-sec"><b>${vIcon('calm', 20)}${esc(t('voo.lobby.cabin', 'Cabine'))}</b><div class="voo-row">
          ${CABINS.map((c) => `<button class="voo-opt ${cabinOf(sv).id === c.id ? 'sel' : ''}" data-c="${c.id}" ${sv.perfects >= c.perfect ? '' : 'disabled'}><span class="sw" style="background:linear-gradient(135deg,${c.seat} 50%,${c.seat2} 50%)"></span>${esc(c.name())}${sv.perfects >= c.perfect ? '' : ` <small>${esc(t('voo.lobby.perfects', '{n} pousos perfeitos', { n: c.perfect }))}</small>`}</button>`).join('')}
        </div></div>
        <div class="voo-stats"><span>${vIcon('trophy', 18)}${esc(t('voo.lobby.best', 'Recorde {n}', { n: sv.best }))}</span><span>${vIcon('star', 18)}${sv.stars}</span><span>${vIcon('runway', 18)}${esc(t('voo.lobby.landings', '{n} pousos', { n: sv.landings }))}</span><span>${vIcon('check', 18)}${esc(t('voo.lobby.perfectN', '{n} perfeitos', { n: sv.perfects }))}</span></div>
        <div class="voo-go"><button class="voo-btn green" data-go>${vIcon('plane', 26)}${esc(t('voo.lobby.go', 'Abrir o dossiê'))}</button></div>
      </div>`;
    };
    render();
    this.wrap.appendChild(d);
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      audio.click();
      if (b.dataset.x !== undefined) return this.finish();
      if (b.dataset.m) mode = b.dataset.m as '2d' | '3d';
      if (b.dataset.f) this.flightKind = b.dataset.f as FlightKind;
      if (b.dataset.r) this.role = +b.dataset.r;
      if (b.dataset.b) this.bots = +b.dataset.b;
      if (b.dataset.l) sv.livery = b.dataset.l;
      if (b.dataset.c) sv.cabin = b.dataset.c;
      if (b.dataset.go !== undefined) {
        sv.mode = mode;
        sv.bots = this.bots;
        writeSave(sv);
        d.remove();
        void this.brief(mode);
        return;
      }
      render();
    });
  }

  private crewLines(): CrewLine[] {
    const me = displayName() || t('voo.you', 'Você');
    const out: CrewLine[] = [];
    const rnd = mulberry(this.seed() ^ 77);
    const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
    let nb = 0;
    for (let r = 0; r < 4; r++) {
      if (r === this.role) out.push({ name: me, role: r, bot: false, me: true });
      else if (nb < this.bots) out.push({ name: names[nb++], role: r, bot: true, me: false });
    }
    return out;
  }
  private seed(): number {
    if (this.opts.seed) return this.opts.seed;
    if (this.flightKind === 'daily') return 777 + dayIndex() * 7919;
    return this.seedCache || (this.seedCache = (Math.random() * 1e9) | 0);
  }
  private seedCache = 0;

  private async brief(mode: '2d' | '3d'): Promise<void> {
    const rnd = mulberry(this.seed());
    const a = Math.floor(rnd() * CITIES.length);
    const b = (a + 1 + Math.floor(rnd() * (CITIES.length - 1))) % CITIES.length;
    this.route = [CITIES[a], CITIES[b]];
    this.flightNo = 'BL-' + (100 + Math.floor(rnd() * 900));
    this.weather = Math.floor(rnd() * 3);
    this.setBack(() => this.finish());
    const id = await briefing(this.wrap, { flight: this.flightNo, from: this.route[0], to: this.route[1], weather: this.weather, mode: this.flightKind, crew: this.crewLines() });
    if (this.destroyed) return;
    void id;
    await this.begin(mode);
  }

  /* ============================== voo ============================== */

  private async begin(mode: '2d' | '3d'): Promise<void> {
    const sv = this.sv;
    const crew = this.crewLines();
    const rnd = mulberry(this.seed() ^ 99);
    const skins = BOT_SKINS.slice().sort(() => rnd() - 0.5);
    const tier = this.gov.tier;
    this.sim = new Sim({
      seed: this.seed(),
      mode: this.flightKind,
      crew: crew.map((c, i) => ({ name: c.name, skin: c.me ? globalSave.skin : skins[i % skins.length], bot: c.bot, local: c.me })),
      maxBags: [3, 5, 8, 12][tier],
    });
    // os papéis certos (crewLines já está em ordem de papel)
    this.sim.players.forEach((p, i) => (p.role = crew[i].role as 0));
    if (this.weather === 1) this.sim.startEmer('turb', 'pilot');
    if (this.weather === 2) this.sim.wind *= 1.6;
    if (mode === '3d' && webglOk()) {
      try {
        const m = await import('./view3d');
        if (this.destroyed) return;
        this.is3d = true;
        this.hud = new Hud(this.wrap, this);
        this.view = await m.createView3D(this.wrap, this.sim, tier, { livery: liveryOf(sv), cabin: cabinOf(sv), pfd: this.hud.pfd, nav: this.hud.nav, mySkin: globalSave.skin });
        this.wrap.insertBefore(this.view.canvas, this.wrap.firstChild);
      } catch (e) {
        console.warn('[voo] 3D indisponível, usando 2D', e);
        this.is3d = false;
        this.hud?.destroy();
        this.hud = null;
        this.view = null;
      }
    }
    if (!this.view) {
      this.is3d = false;
      this.hud = new Hud(this.wrap, this);
      this.view = new View2D(this.wrap, this.sim, { livery: liveryOf(sv), cabin: cabinOf(sv), dprCap: this.gov.settings.dprCap });
      this.wrap.insertBefore(this.view.canvas, this.wrap.firstChild);
    }
    const ro = () => this.view?.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    this.setBack(() => this.onExit());
    sv.flights++;
    writeSave(sv);
    if (!this.opts.quick) this.startCutscene();
    else this.cut = -1;
    this.startT = performance.now();
    this.last = performance.now();
    audio.engineStart();
    this.raf = requestAnimationFrame(this.loop);
  }
  private offs: (() => void)[] = [];

  private startCutscene(): void {
    this.cut = 0;
    this.hud!.hidden = true;
    const skip = document.createElement('button');
    skip.className = 'voo-btn ghost voo-skip';
    skip.innerHTML = vIcon('throw', 22) + esc(t('voo.d.skip', 'Pular'));
    skip.onclick = () => this.endCutscene();
    const l1 = document.createElement('div');
    l1.className = 'voo-letter';
    l1.style.top = '0';
    const l2 = document.createElement('div');
    l2.className = 'voo-letter';
    l2.style.bottom = '0';
    const fade = document.createElement('div');
    fade.className = 'voo-fade';
    this.wrap.append(skip, l1, l2, fade);
    this.cutEls = [skip, l1, l2, fade];
    if (!this.is3d) this.cut = 8.6; // 2D: só o cartão de título
  }
  private endCutscene(): void {
    if (this.cut < 0) return;
    this.cut = -1;
    for (const e of this.cutEls) e.remove();
    this.cutEls = [];
    if (this.view && 'cut' in this.view) this.view.cut = -1;
    if (this.hud) this.hud.hidden = false;
    this.hud?.showBanner(t('voo.go.title', 'Alguém no manche!'), t('voo.go.sub', 'Siga a seta rosa até a pista'), 3);
    this.last = performance.now();
  }
  private stepCutscene(dt: number): void {
    const prev = this.cut;
    this.cut += dt;
    const v = this.view as View3D;
    if (this.is3d) v.cut = this.cut;
    const fade = this.cutEls[3];
    const k = this.cut;
    if (fade) fade.classList.toggle('on', (k > 5.75 && k < 6.05) || k > 11.2);
    if (prev < 8.4 && k >= 8.4) {
      sfx.boing();
      audio.siren(1.6);
    }
    if (prev < 6.0 && k >= 6.0) sfx.whoosh();
    if (prev < 8.9 && k >= 8.9) {
      const tc = titleCard(this.wrap);
      this.cutEls.push(tc);
      sfx.crash();
      tap('heavy');
    }
    if (k > 11.5) this.endCutscene();
  }

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const el = now - this.last;
    this.last = now;
    if (this.paused) return;
    const dt = Math.min(0.05, Math.max(0, el / 1000));
    const w0 = performance.now();
    const s = this.sim;
    if (this.cut >= 0) {
      this.stepCutscene(dt);
      this.view!.frame(dt);
      this.gov.sample(el, performance.now() - w0);
      return;
    }
    this.hud!.readInput();
    // passos menores para o voo ficar estável
    const n = dt > 0.025 ? 2 : 1;
    for (let i = 0; i < n; i++) s.step(dt / n);
    s.input.tap = false;
    this.events();
    this.view!.frame(dt);
    this.hud!.update(dt);
    this.sounds(dt);
    this.gov.sample(el, performance.now() - w0);
    if (s.phase === 'done' && !this.reported) void this.finishFlight();
  }

  private events(): void {
    const s = this.sim;
    for (const ev of s.ev) {
      this.view?.onEv(ev);
      if (ev.k === 'toast') {
        this.hud?.toast(ev.msg, ev.ico, ev.tone);
        if (ev.tone === 'bad') tap('medium');
      } else if (ev.k === 'say') this.hud?.say(ev.who, ev.msg);
      else if (ev.k === 'sfx') this.sfx(ev.s);
      else if (ev.k === 'touch') {
        this.hud?.closeMini(false);
        this.hud!.hidden = true;
        const o = ev.out;
        if (o.kind === 'crash') {
          sfx.crash();
          sfx.bump();
          tap('heavy');
        } else {
          sfx.thud();
          if (o.kind === 'perfect') sfx.sparkle();
          success();
        }
      }
    }
    for (const p of s.players) if (p.bot && p.sayT > 2.35 && p.say) this.hud?.say(p.idx, p.say);
    s.ev.length = 0;
  }

  private sfx(n: string): void {
    switch (n) {
      case 'alarm':
        audio.siren(0.9);
        break;
      case 'glass':
        sfx.crash();
        break;
      case 'rumble':
        sfx.bump();
        break;
      case 'wind':
        sfx.whoosh();
        break;
      case 'fixed':
        sfx.fix();
        break;
      case 'calm':
        sfx.sparkle();
        break;
      case 'pick':
        sfx.pick();
        break;
      case 'drop':
        sfx.drop();
        break;
      case 'throw':
        sfx.throw();
        break;
      case 'thud':
        sfx.thud();
        break;
      case 'seat':
        sfx.click();
        break;
    }
  }

  private sounds(dt: number): void {
    const s = this.sim;
    audio.engineSet(s.f.thr * (s.f.fuel > 0 ? 1 : 0), Math.min(1, s.f.spd / 160));
    this.alarmT -= dt;
    if (s.f.stall && this.alarmT <= 0) {
      this.alarmT = 0.6;
      audio.tick(2);
    }
    const me = s.players[s.me];
    if (me.spraying && Math.random() < dt * 8) sfx.spray();
    if (s.active().some((e) => e.kind === 'fire') && Math.random() < dt * 1.5) sfx.fire();
  }

  /* ------------------------------ entrada (HudHost) ------------------------------ */

  look(dx: number, dy: number): void {
    if (this.is3d) (this.view as View3D).look(dx, dy);
  }
  facing(): [number, number] {
    if (this.is3d) return (this.view as View3D).facing();
    return this.hud?.face2d ?? [0, -1];
  }
  project(x: number, y: number, z: number, out: { x: number; y: number; behind: boolean }): void {
    this.view?.project(x, y, z, out);
  }
  onTap(): void {
    const s = this.sim;
    if (!s) return;
    audio.unlock();
    s.input.tap = true;
  }
  onThrow(): void {
    const s = this.sim;
    const me = s.players[s.me];
    if (me.hold < 0) return;
    if (this.is3d) {
      const [fx, fz] = this.facing();
      me.yaw = Math.atan2(fx, fz);
    }
    s.drop(me, true);
  }
  onStand(): void {
    const s = this.sim;
    s.standUp(s.players[s.me]);
    if (this.is3d) (this.view as View3D).extCam = false;
  }
  onCam(): void {
    if (!this.is3d) return;
    const v = this.view as View3D;
    v.extCam = !v.extCam && this.sim.players[this.sim.me].seated;
  }
  extCam(): boolean {
    return this.is3d && (this.view as View3D).extCam;
  }

  /* ------------------------------ fim ------------------------------ */

  private async finishFlight(): Promise<void> {
    this.reported = true;
    const s = this.sim;
    const sv = this.sv;
    const o = s.outcome!;
    audio.engineStop();
    const prevStars = sv.stars;
    const prevPerf = sv.perfects;
    const daily = this.flightKind === 'daily';
    const firstDaily = daily && sv.daily.day !== dayIndex();
    let coins = this.flightKind === 'training' ? Math.min(5, o.stars * 2) : Math.round(8 + o.stars * 14 + s.fixedCount * 3 + o.score / 600);
    if (firstDaily && o.stars > 0) coins += 25;
    coins = Math.min(160, Math.max(0, coins));
    const newBest = this.flightKind !== 'training' && o.score > sv.best;
    if (newBest) sv.best = o.score;
    if (this.flightKind !== 'training') {
      if (o.kind === 'crash') sv.crashes++;
      else sv.landings++;
      if (o.kind === 'perfect') sv.perfects++;
      // estrelas acumuladas: só conta a melhoria do voo do dia / cada voo normal
      if (daily) {
        if (sv.daily.day !== dayIndex()) sv.daily = { day: dayIndex(), best: 0, stars: 0 };
        sv.stars += Math.max(0, o.stars - sv.daily.stars);
        sv.daily.stars = Math.max(sv.daily.stars, o.stars);
        sv.daily.best = Math.max(sv.daily.best, o.score);
      } else sv.stars += o.stars;
    }
    writeSave(sv);
    if (coins > 0) addCoins(coins);
    reportRun({
      game: 'voo',
      score: o.score,
      coins,
      durationSec: Math.round((performance.now() - this.startT) / 1000),
      won: o.kind !== 'crash',
      stats: { stars: o.stars, fixes: s.fixedCount, perfect: o.kind === 'perfect' ? 1 : 0, crash: o.kind === 'crash' ? 1 : 0 },
    });
    const unlocks: string[] = [];
    for (const l of LIVERIES) if (prevStars < l.stars && sv.stars >= l.stars) unlocks.push(t('voo.u.livery', 'Pintura "{n}"', { n: l.name() }));
    for (const c of CABINS) if (prevPerf < c.perfect && sv.perfects >= c.perfect) unlocks.push(t('voo.u.cabin', 'Cabine "{n}"', { n: c.name() }));
    const crew: CrewLine[] = s.players.map((p) => ({ name: p.name, role: p.role, bot: p.bot, me: p.idx === s.me, stats: p.stats }));
    this.paused = true;
    const id = await endReport(this.wrap, {
      kind: o.kind, reason: o.reason, stars: o.stars, score: o.score, best: sv.best, newBest, coins, vs: o.vs, spd: o.spd, off: o.off, crew, unlocks, daily: firstDaily, flight: this.flightNo || 'BL-101',
    });
    if (this.destroyed) return;
    if (id === 'again') this.restart();
    else this.finish();
  }

  private restart(): void {
    cancelAnimationFrame(this.raf);
    this.view?.destroy();
    this.hud?.destroy();
    for (const f of this.offs) f();
    this.offs = [];
    this.view = null;
    this.hud = null;
    this.reported = false;
    this.paused = false;
    this.seedCache = 0;
    this.wrap.innerHTML = '';
    this.lobby();
  }

  onExit(): void {
    if (!this.sim || this.reported) return this.finish();
    // pergunta rápida: sair conta como desistência (sem moedas)
    this.paused = true;
    const d = document.createElement('div');
    d.className = 'voo-scr';
    d.style.background = 'rgba(20,8,48,.6)';
    d.innerHTML = `<div class="voo-lcard" style="width:min(380px,100%);grid-template-columns:1fr;text-align:center"><h2 style="justify-content:center">${vIcon('warn', 30)}${esc(t('voo.quit.title', 'Abandonar o voo?'))}</h2><div class="voo-note">${esc(t('voo.quit.text', 'O voo não conta e você não ganha moedas.'))}</div><div class="voo-go" style="justify-content:center"><button class="voo-btn ghost" data-q>${esc(t('voo.quit.yes', 'Sair'))}</button><button class="voo-btn green" data-c>${esc(t('voo.quit.no', 'Continuar voando'))}</button></div></div>`;
    this.wrap.appendChild(d);
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      d.remove();
      if (b.dataset.q !== undefined) this.finish();
      else {
        this.paused = false;
        this.last = performance.now();
      }
    });
  }

  private setBack(fn: () => void): void {
    this.popBack?.();
    this.popBack = pushBack(fn);
  }

  pause(): void {
    this.paused = true;
    this.actHeld = false;
  }
  resume(): void {
    if (this.reported) return;
    this.paused = false;
    this.last = performance.now();
  }
  finish(): void {
    this.destroy();
    this.exitCb();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.popBack?.();
    for (const f of this.offs) f();
    audio.engineStop();
    this.net.leave();
    this.view?.destroy();
    this.hud?.destroy();
    this.wrap.remove();
    restorePortrait();
  }
}
