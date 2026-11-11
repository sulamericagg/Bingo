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
import { QualityGovernor, detectInitialTier, loadMode } from '../../core/quality';
import { save as globalSave } from '../../core/storage';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { displayName } from '../../services/leaderboard';
import { sfx } from '../../3d/common/sfx';
import { BOT_NAMES, BOT_SKINS, CABINS, CITIES, LIVERIES, SPOTS } from './data';
import { bigMoment, notify } from '../../ui/notify';
import { openHangar, type HangarHandle } from './hangar';
import { takePendingVoo } from './pending';
import { hush, speak } from './voice';
import { briefing, endReport, titleCard, type CrewLine } from './dossier';
import { Hud, type HudHost } from './hud';
import type { FlightKind } from './hangar';
import { vIcon } from './icons';
import { FlightNet, HostSync, InputOut, LocalNet, SnapSync, newCode, type Me, type NetMsg, type VooNet } from './net';
import { inviteCard, openRoom, pollInvites, type RoomHandle, type StartCrew } from './room';
import { me as socialMe } from '../../social/net';
import { cabinOf, dayIndex, liveryOf, loadSave, writeSave, type VooSave } from './save';
import { Sim, mulberry } from './sim';
import { View2D } from './view2d';
import type { View3D } from './view3d';
import { consumePartySeat, partySeat } from '../../party/contract';
import { reportPlaying, stopPlaying } from '../../party/join';

/** passo fixo da simulação (s) */
const STEP = 1 / 60;

export interface LaunchOpts {
  mode?: '2d' | '3d';
  flight?: 'normal' | 'daily' | 'training';
  bots?: number;
  role?: number;
  seed?: number;
  /** pula dossiê e abertura (testes) */
  quick?: boolean;
  /** força o tutorial guiado */
  tutorial?: boolean;
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
    this.gov = new QualityGovernor({ mode: loadMode(), persist: false, emit: false, onChange: (tier) => this.view && 'setTier' in this.view && (this.view as View3D).setTier(tier), onResScale: (k) => this.view && 'setResScale' in this.view && (this.view as View3D).setResScale(k) });
    this.bots = opts.bots ?? this.sv.bots;
    this.role = opts.role ?? this.sv.role ?? 0;
    if (location.search.includes('debug')) (window as unknown as { __voo: VooGame }).__voo = this;
  }

  async start(): Promise<void> {
    if (this.opts.quick) {
      this.flightKind = this.opts.flight ?? 'normal';
      await this.begin(this.opts.mode ?? '3d');
      return;
    }
    // aberto por link/QR de sala (?voo=K7Q2M): entra direto
    const code = takePendingVoo();
    if (code) return void this.joinRoom(code, this.sv.mode === '2d' ? '2d' : '3d');
    // grupo (docs/PARTY.md): o líder abre a sala com o código do grupo e os outros entram nela
    const seat = partySeat('voo');
    if (seat) {
      consumePartySeat('voo');
      const mode = this.sv.mode === '2d' ? '2d' : '3d';
      const pc = seat.code(5, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
      return void (seat.host ? this.friends(mode, pc) : this.joinRoom(pc, mode, 25));
    }
    this.lobby();
  }

  /* ============================== hangar (lobby) ============================== */

  private hangar: HangarHandle | null = null;
  private lobby(): void {
    const sv = this.sv;
    // voltar no hangar: com a folha de Ajustes aberta fecha a folha; sem ela vale o "Sair do jogo?" do hub
    // (antes saía do jogo direto, sem perguntar)
    const h = openHangar(this.wrap, {
      sv,
      gl: webglOk(),
      weak: detectInitialTier() <= 1,
      dailyBonus: 25,
      onSheet: (open) => {
        if (open) this.setBack(() => h.back());
        else {
          this.popBack?.();
          this.popBack = null;
        }
      },
    });
    this.hangar = h;
    this.popBack?.();
    this.popBack = null;
    this.listenInvites(h);
    void h.done.then((pick) => {
      this.hangar = null;
      if (this.destroyed) return;
      if (pick.kind === 'exit') return this.finish();
      this.role = sv.role;
      this.bots = sv.bots;
      if (pick.kind === 'friends') return void this.friends(pick.mode);
      this.flightKind = pick.flight;
      void this.brief(pick.mode);
    });
  }

  /* ============================== online ============================== */

  private meP: Promise<Me> | null = null;
  private myself(): Promise<Me> {
    if (!this.meP) {
      this.meP = socialMe().then((m) => ({ id: m.id, name: m.name || displayName() || 'Bloop', skin: m.skin }));
      this.meP.catch(() => (this.meP = null));
    }
    return this.meP;
  }
  private room: RoomHandle | null = null;
  private hostSync: HostSync | null = null;
  private snapSync: SnapSync | null = null;
  private inOut: InputOut | null = null;
  private crewOverride: CrewLine[] | null = null;

  /** convites de amigos enquanto estou no hangar */
  private listenInvites(h: HangarHandle): void {
    pollInvites(
      () => this.myself().catch(() => null),
      (inv) =>
        inviteCard(this.wrap, inv, () => {
          if (this.hangar !== h) return;
          h.destroy();
          this.hangar = null;
          void this.joinRoom(inv.code, this.sv.mode === '2d' ? '2d' : '3d');
        }),
      () => this.hangar === h && !this.destroyed,
    );
  }

  /** "Voar com amigos": cria a sala na hora (um toque) */
  private async friends(mode: '2d' | '3d', partyCode = ''): Promise<void> {
    const wait = this.waiting(t('voo.r.creating', 'Abrindo a sala…'));
    try {
      const me = await this.myself();
      let net: FlightNet | null = null;
      for (let k = 0; k < 3 && !net; k++) {
        try {
          net = await FlightNet.open(partyCode && k === 0 ? partyCode : newCode(), true, me);
        } catch (e) {
          if ((e as Error).message !== 'taken') throw e;
        }
      }
      wait();
      if (!net || this.destroyed) return void net?.leave();
      this.inRoom(net, me, mode);
    } catch {
      wait();
      if (this.destroyed) return;
      notify(t('voo.r.offline', 'Sem internet agora: voe com os ajudantes!'), { icon: 'cloud-off', kind: 'bad' });
      this.lobby();
    }
  }
  private async joinRoom(code: string, mode: '2d' | '3d', tries = 1): Promise<void> {
    const wait = this.waiting(t('voo.r.joining', 'Entrando na sala {c}…', { c: code }));
    try {
      const me = await this.myself();
      let net: FlightNet | null = null;
      // grupo: o líder pode demorar um pouco para abrir a sala — tenta de novo
      for (let i = 0; !net; i++) {
        try {
          net = await FlightNet.open(code, false, me);
        } catch (e) {
          if ((e as Error).message !== 'no_room' || i >= tries - 1 || this.destroyed) throw e;
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      wait();
      if (this.destroyed) return net.leave();
      this.inRoom(net, me, mode);
    } catch (e) {
      wait();
      if (this.destroyed) return;
      const why = (e as Error).message;
      notify(
        why === 'no_room' ? t('voo.r.noRoom', 'Sala {c} não encontrada', { c: code }) : why === 'started' ? t('voo.r.started', 'Esse voo já decolou') : why === 'full' ? t('voo.r.full', 'A sala está cheia (4)') : t('voo.r.offline', 'Sem internet agora: voe com os ajudantes!'),
        { icon: 'warning', kind: 'bad' },
      );
      this.lobby();
    }
  }
  private inRoom(net: FlightNet, me: Me, mode: '2d' | '3d'): void {
    const r = openRoom(this.wrap, { net, me, role: this.sv.role, mode });
    this.room = r;
    if (net.isHost) reportPlaying('voo', net.code); // amigos veem "Fulano está jogando — Entrar"
    void r.done.then(() => stopPlaying());
    this.setBack(() => r.back());
    void r.done.then((res) => {
      this.room = null;
      if (this.destroyed) return net.leave();
      if (res.kind === 'start') return void this.beginOnline(net, me, res.start, mode);
      net.leave();
      if (res.kind === 'join') return void this.joinRoom(res.code, mode);
      this.lobby();
    });
  }
  private waiting(txt: string): () => void {
    const d = document.createElement('div');
    d.className = 'voo-scr vr-wait';
    d.innerHTML = `<div>${vIcon('plane', 56)}<b>${txt.replace(/[&<>]/g, '')}</b></div>`;
    this.wrap.appendChild(d);
    return () => d.remove();
  }

  private async beginOnline(net: FlightNet, me: Me, start: NetMsg, mode: '2d' | '3d'): Promise<void> {
    this.net = net;
    this.flightKind = 'normal';
    this.seedCache = (+start.seed | 0) || 1;
    const crew = ((start.crew ?? []) as StartCrew[]).slice(0, 4).sort((a, b) => a.r - b.r);
    this.crewOverride = crew.map((c) => ({ name: String(c.name).slice(0, 24), role: c.r, bot: !!c.bot, me: c.id === me.id, skin: c.bot ? c.skin : c.id === me.id ? globalSave.skin : c.skin, id: c.id }));
    const mine = crew.find((c) => c.id === me.id);
    if (mine) this.role = mine.r;
    const rnd = mulberry(this.seed());
    const a = Math.floor(rnd() * CITIES.length);
    const b = (a + 1 + Math.floor(rnd() * (CITIES.length - 1))) % CITIES.length;
    this.route = [CITIES[a], CITIES[b]];
    this.flightNo = 'BL-' + (100 + Math.floor(rnd() * 900));
    this.weather = Math.floor(rnd() * 3);
    net.onClose((why) => {
      if (this.destroyed || this.reported) return;
      this.netEnded(why === 'hostLeft' ? t('voo.r.hostLeftF', 'O anfitrião saiu: o voo acabou') : t('voo.r.lost', 'Conexão perdida'));
    });
    await this.begin(mode);
    if (this.destroyed || !this.sim) return;
    const s = this.sim;
    if (net.isHost) {
      this.hostSync = new HostSync(s, net, crew.map((c) => (c.bot ? '' : c.id)), (i) => {
        const p = s.players[i];
        this.hud?.toast(t('voo.r.leftBot', '{n} saiu: um ajudante assumiu', { n: p.name }), 'crew', 'info');
        this.hud?.rebuildCrew();
      });
    } else {
      s.client = true;
      this.snapSync = new SnapSync(s);
      this.inOut = new InputOut(s, net);
      s.proxy = (a) => this.inOut?.push(a);
      net.on('snap', (m) => this.snapSync?.apply(m));
    }
  }

  private leaveNet(): void {
    this.hostSync?.dispose();
    this.hostSync = null;
    this.snapSync = null;
    this.inOut = null;
    this.crewOverride = null;
    this.net.leave();
    this.net = new LocalNet();
  }

  /** voo online interrompido (anfitrião saiu ou caiu a conexão) */
  private netEnded(msg: string): void {
    this.paused = true;
    audio.engineStop();
    const d = document.createElement('div');
    d.className = 'voo-scr';
    d.style.background = 'rgba(20,8,48,.7)';
    d.innerHTML = `<div class="voo-lcard" style="width:min(380px,100%);grid-template-columns:1fr;text-align:center"><h2 style="justify-content:center">${vIcon('crew', 34)}${esc(msg)}</h2><div class="voo-go" style="justify-content:center"><button class="voo-btn green" data-ok>${vIcon('plane', 22)}${esc(t('voo.r.backHangar', 'Voltar ao hangar'))}</button></div></div>`;
    this.wrap.appendChild(d);
    speak(msg, { urgent: true });
    d.querySelector('[data-ok]')!.addEventListener('click', () => {
      d.remove();
      this.restart();
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
    // voltar na pasta de missão: o "Sair do jogo?" do hub (antes saía do jogo direto, sem perguntar)
    this.popBack?.();
    this.popBack = null;
    const id = await briefing(this.wrap, { flight: this.flightNo, from: this.route[0], to: this.route[1], weather: this.weather, mode: this.flightKind, crew: this.crewLines() });
    if (this.destroyed) return;
    void id;
    await this.begin(mode);
  }

  /* ============================== voo ============================== */

  private async begin(mode: '2d' | '3d'): Promise<void> {
    const sv = this.sv;
    const crew = this.crewOverride ?? this.crewLines();
    const rnd = mulberry(this.seed() ^ 99);
    const skins = BOT_SKINS.slice().sort(() => rnd() - 0.5);
    const tier = this.gov.tier;
    this.sim = new Sim({
      seed: this.seed(),
      mode: this.flightKind,
      crew: crew.map((c, i) => ({ name: c.name, skin: c.me ? globalSave.skin : c.skin ?? skins[i % skins.length], bot: c.bot, local: c.me })),
      maxBags: [3, 5, 8, 12][tier],
    });
    // os papéis certos (crewLines já está em ordem de papel)
    this.sim.players.forEach((p, i) => (p.role = crew[i].role as 0));
    if (this.weather === 1) this.sim.warnTurb(9);
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
    // primeiro voo: tutorial guiado (um objetivo por vez + seta)
    if (((!sv.tutDone && this.flightKind === 'normal') || this.opts.tutorial) && !this.net.online) {
      this.tut = 0;
      this.tutT = 0;
      this.sim.paused = true;
      const me = this.sim.players[this.sim.me];
      me.x = 0.1;
      me.z = -1.7;
    }
    sv.flights++;
    writeSave(sv);
    if (!this.opts.quick && !this.net.online) this.startCutscene();
    else {
      this.cut = -1;
      if (this.net.online) this.hud?.showBanner(t('voo.go.title', 'Alguém no manche!'), t('voo.go.sub', 'Siga a seta rosa até a pista'), 3);
    }
    this.startT = performance.now();
    this.last = performance.now();
    audio.engineStart();
    this.raf = requestAnimationFrame(this.loop);
  }
  private offs: (() => void)[] = [];
  private tut = -1;
  private tutT = 0;
  private tutFire = -1;

  /** tutorial do primeiro voo: um passo de cada vez, com seta amarela até o alvo */
  private tutorial(dt: number): void {
    const s = this.sim;
    const hud = this.hud!;
    const me = s.players[s.me];
    this.tutT += dt;
    const next = () => {
      this.tut++;
      this.tutT = 0;
      sfx.swish();
    };
    const P = SPOTS.pilot;
    if (s.phase !== 'cruise' && this.tut < 7) this.tut = 7; // passou do cruzeiro: encerra o tutorial
    switch (this.tut) {
      case 0:
        hud.tutText = t('voo.tut.sit', 'Sente no manche: vá até a cadeira da esquerda e toque em Pilotar');
        hud.tutTarget = { x: P.x, y: 1.0, z: P.z };
        if (me.seated) next();
        break;
      case 1:
        hud.tutText = this.is3d ? t('voo.tut.fly', 'Arraste no lado esquerdo para mexer o manche. Siga a seta rosa!') : t('voo.tut.fly2d', 'Arraste no lado esquerdo para mexer o manche. Siga a seta rosa!');
        hud.tutTarget = null;
        if (this.tutT > 7) {
          const e = s.startEmer('fire', 'oven');
          if (e) (e.sev = 0.4), (this.tutFire = e.id);
          next();
        }
        break;
      case 2:
        hud.tutText = t('voo.tut.stand', 'Fogo na copa! Toque em Levantar');
        hud.tutTarget = null;
        if (!me.seated) next();
        break;
      case 3: {
        hud.tutText = t('voo.tut.ext', 'Pegue o extintor vermelho');
        const ext = s.items.filter((i) => i.alive && i.kind === 'ext' && i.held < 0).sort((a, b) => Math.abs(a.z - me.z) - Math.abs(b.z - me.z))[0];
        hud.tutTarget = ext ? { x: ext.x, y: ext.y + 0.3, z: ext.z } : null;
        if (s.item(me.hold)?.kind === 'ext') next();
        break;
      }
      case 4: {
        const f = s.emer(this.tutFire);
        hud.tutText = t('voo.tut.spray', 'Chegue perto do fogo e SEGURE o botão Apagar');
        hud.tutTarget = f ? { x: f.x, y: f.y + 0.5, z: f.z } : null;
        if (!f) next();
        break;
      }
      case 5:
        hud.tutText = t('voo.tut.back', 'Muito bem! Volte ao manche antes que o avião desvie');
        hud.tutTarget = { x: P.x, y: 1.0, z: P.z };
        if (me.seated) {
          next();
          if (!s.players.some((p) => p.bot)) this.tut = 7;
          else s.startEmer('spark', 'elec');
        }
        break;
      case 6:
        hud.tutText = t('voo.tut.bots', 'Pane elétrica! Toque no retrato de um ajudante e mande consertar');
        hud.tutTarget = null;
        if (s.players.some((p) => p.bot && p.cmd)) next();
        break;
      case 7:
        hud.tutText = '';
        hud.tutTarget = null;
        bigMoment(t('voo.tut.done', 'Treinamento feito! Agora é pra valer'), { icon: 'star' });
        s.paused = false;
        this.tut = -1;
        this.sv.tutDone = true;
        writeSave(this.sv);
        break;
    }
    // mãozinha apontando para o controle certo (sem precisar ler)
    const k = this.tut;
    hud.tutPoint = k < 0 || k >= 7 ? '' : k === 1 ? 'stick' : k === 2 ? 'stand' : k === 6 ? 'mate' : s.lastCtx.kind ? 'act' : '';
  }

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
    this.hud!.readInput(dt);
    if (this.tut >= 0) this.tutorial(dt);
    if (this.snapSync) {
      // convidado: só o meu boneco anda aqui; o resto vem do anfitrião (já suavizado por quadro)
      s.savePose();
      s.stepClient(dt);
      this.snapSync.smooth(dt);
      this.inOut?.tick(dt);
      s.lerpK = 1;
      s.input.tap = false;
    } else if (!this.simHeld) {
      // passo FIXO de 1/60 s (estável e igual em qualquer celular); a vista interpola entre passos
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 6) {
        s.step(STEP);
        this.acc -= STEP;
        n++;
        s.input.tap = false;
      }
      if (n >= 6) this.acc = 0;
      s.lerpK = Math.min(1, this.acc / STEP);
    } else s.input.tap = false;
    this.events();
    this.hostSync?.tick(dt);
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
        // emergência nova: fala o nome (crianças que ainda não leem)
        if (ev.tone === 'bad' && ev.emer !== undefined) speak(ev.msg, { gap: 2500 });
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
    this.hostSync?.capture(s.ev);
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
    if (!this.sim.players[this.sim.me].seated) return void (v.camMode = 0);
    const m = v.cycleCam();
    sfx.click();
    this.hud?.toast(m === 0 ? t('voo.cam.fp', 'Câmera: cabine') : m === 1 ? t('voo.cam.chase', 'Câmera: atrás do avião') : t('voo.cam.orbit', 'Câmera: órbita livre (arraste e use a pinça)'), 'info', 'info');
  }
  extCam(): boolean {
    return this.is3d && (this.view as View3D).extCam;
  }
  camMode(): number {
    return this.is3d ? (this.view as View3D).camMode : 0;
  }
  orbit(dx: number, dy: number): void {
    if (this.is3d) (this.view as View3D).orbit(dx, dy);
  }
  zoom(k: number): void {
    if (this.is3d) (this.view as View3D).zoom(k);
  }
  onAP(): void {
    const s = this.sim;
    s.setAP(!s.f.ap);
  }
  holdSim(on: boolean): void {
    if (this.net.online) return;
    this.simHeld = on;
    if (!on) this.last = performance.now();
  }
  private simHeld = false;
  /** sobra de tempo do passo fixo */
  private acc = 0;

  /* ------------------------------ fim ------------------------------ */

  private async finishFlight(): Promise<void> {
    this.reported = true;
    this.hostSync?.tick(0, true);
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
    this.leaveNet();
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
    this.hangar?.destroy();
    this.room?.back();
    this.leaveNet();
    for (const f of this.offs) f();
    audio.engineStop();
    hush();
    this.net.leave();
    this.view?.destroy();
    this.hud?.destroy();
    this.wrap.remove();
  }
}
