/* ============================================================
 *  LENHADORES DO BOSQUE — entrada do jogo: escolha 2D/3D, laço,
 *  co-op por presença (anfitrião decide as quedas), recompensas.
 * ============================================================ */
import './floresta.css';
import { t } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { addCoins } from '../../core/economy';
import { audio } from '../../core/audio';
import { tap, success } from '../../core/haptics';
import { QualityGovernor, loadMode, type QualitySettings, type Tier } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import type { PeerState, PresenceSession } from '../../services/presence-api';
import { SKINS } from '../../game/skins';
import { BIOMES, BUILDS, SPECIES } from './data';
import { removeFlIconDefs } from './icons';
import { loadSave, writeSave } from './save';
import { Sim, TS, type Agent, type Remote, type Tree } from './sim';
import { Draw2D, drawTree } from './draw2d';
import { Hud, type CtxKind, type HudHost } from './hud';
import { forestSolo } from './touchcfg';
import { openStartMenu, smCanvasArt } from '../../ui/startmenu';

/** visão (2D ou 3D) */
export interface View {
  frame(dt: number): void;
  resize(): void;
  destroy(): void;
  setQuality?(q: QualitySettings): void;
  /** nível (grama, sombras de contato) */
  setTier?(tier: Tier): void;
  /** resolução dinâmica (fator no pixel ratio) */
  setResScale?(k: number): void;
  /** joystick (tela) → direção no mundo */
  toWorld?(jx: number, jy: number, out: { mx: number; mz: number }): void;
  toggleCam?(): void;
  /** 3D: entrega as toras das mãos (minigame da serra) */
  takeHeld?(): { n: number; val: number };
}

export interface LaunchOpts {
  mode?: '2d' | '3d';
  /** dev: o seu Bloop é controlado pela IA */
  auto?: boolean;
  seed?: number;
}

const WORLD_SEED = 20261109;

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void, opts: LaunchOpts = {}): Promise<MiniGameHandle> {
  const g = new FlorestaGame(root, exit, opts);
  await g.start();
  return g;
}

export class FlorestaGame implements MiniGameHandle, HudHost {
  sim: Sim;
  hud!: Hud;
  view: View | null = null;
  is3d = false;
  joy = { x: 0, y: 0 };
  chopHeld = false;
  gov: QualityGovernor;
  presence: PresenceSession | null = null;
  private wrap: HTMLDivElement;
  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;
  private keys = { l: false, r: false, u: false, d: false, c: false };
  private offs: (() => void)[] = [];
  private sendT = 0;
  private myId = '';
  private hostFell: { id: number; dx: number; dz: number }[] = [];
  private fellSeq = 0;
  private lastSeq = new Map<string, number>();
  private lastReq = new Map<string, number>();
  private humanCount = 0;
  private stepOut = { mx: 0, mz: 0 };
  private chopSfxT = 0;
  private ecoShown = false;
  private happyShown = false;
  private autoMe = false;
  private autoT = 0;

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
    private opts: LaunchOpts,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'fl-root';
    root.appendChild(this.wrap);
    this.sim = new Sim(loadSave(), opts.seed ?? WORLD_SEED);
    this.gov = new QualityGovernor({ mode: loadMode(), persist: false, emit: false, onChange: (tier, s) => {
        this.view?.setQuality?.(s);
        this.view?.setTier?.(tier);
      }, onResScale: (k) => {
        this.view?.setResScale?.(k);
      } });
    this.autoMe = !!opts.auto;
    this.sim.onFell = (tr) => this.announceFell(tr);
    this.sim.setSolo(forestSolo());
    if (location.search.includes('debug')) (window as any).__flgame = this;
  }

  async start(): Promise<void> {
    // o mundo aberto virou jogo próprio (games/mundo); aqui só 2D/3D
    let mode: '2d' | '3d' = this.opts.mode === '2d' || this.opts.mode === '3d' ? this.opts.mode : await this.chooseMode();
    if (this.destroyed) return;
    if (mode === '3d' && !webglOk()) mode = '2d';
    this.sim.s.mode = mode;
    writeSave(this.sim.s);
    if (mode === '3d') {
      try {
        const m = await import('./view3d');
        if (this.destroyed) return;
        this.sim.mode3d = true;
        this.sim.me.yaw = Math.PI / 2;
        this.is3d = true;
        this.view = await m.createView3D(this.wrap, this.sim, this.gov.tier);
      } catch (e) {
        console.warn('[floresta] 3D indisponível, usando 2D', e);
        this.sim.mode3d = false;
        this.is3d = false;
        this.view = null;
        this.wrap.querySelector('canvas')?.remove();
      }
    }
    if (!this.view) this.view = new Draw2D(this.wrap, this.sim, this.gov.settings);
    this.hud = new Hud(this.wrap, this);
    this.sim.toast = (m, k) => this.hud.toast(m, k);
    this.bindKeys();
    const ro = () => this.view?.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    void this.joinOnline();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------------ escolha de modo ------------------------------ */

  private chooseMode(): Promise<'2d' | '3d'> {
    return new Promise((resolve) => {
      const gl = webglOk();
      let mode: '2d' | '3d' = this.sim.s.mode === '2d' || !gl ? '2d' : '3d';
      const arts = { '2d': smCanvasArt((c) => previewCard(c, false, false), 320, 150), '3d': smCanvasArt((c) => previewCard(c, true, false), 320, 150) };
      const sm = openStartMenu(this.wrap, {
        game: 'floresta',
        onBack: () => {
          sm.destroy();
          this.finish();
        },
        build: (p) => {
          p.cards([
            { id: '2d', art: arts['2d'], label: '2D', say: t('floresta.mode2d', 'Visão de lado, leve e rapidinho'), sel: mode === '2d', onTap: () => ((mode = '2d'), p.refresh()) },
            { id: '3d', art: arts['3d'], label: '3D', say: t('floresta.firstPerson', 'Primeira pessoa'), sel: mode === '3d', disabled: !gl, onTap: () => ((mode = '3d'), p.refresh()) },
          ]);
          p.play({
            sub: mode === '3d' ? t('floresta.firstPerson', 'Primeira pessoa') : t('floresta.mode2dS', 'Visão de lado'),
            onTap: () => {
              sm.destroy();
              resolve(mode);
            },
          });
          p.friends({ game: 'floresta' });
        },
      });
    });
  }

  /* ------------------------------ entrada ------------------------------ */

  private bindKeys(): void {
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.keys.l = v;
      else if (k === 'arrowright' || k === 'd') this.keys.r = v;
      else if (k === 'arrowup' || k === 'w') this.keys.u = v;
      else if (k === 'arrowdown' || k === 's') this.keys.d = v;
      else if (k === ' ' || k === 'f') this.keys.c = v;
      else if (v && k === 'e') this.onAction(this.sim.nearSell() ? 'sell' : 'build');
      else return;
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => set(e, true);
    const ku = (e: KeyboardEvent) => set(e, false);
    const blur = () => {
      this.keys.l = this.keys.r = this.keys.u = this.keys.d = this.keys.c = false;
      this.chopHeld = false;
      this.joy.x = this.joy.y = 0;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    });
  }

  /* ------------------------------ laço ------------------------------ */

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const el = now - this.last;
    this.last = now;
    if (this.paused) return;
    const dt = Math.min(0.05, el / 1000);
    const w0 = performance.now();
    // entrada → sim
    let jx = this.joy.x + (this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0);
    let jy = this.joy.y + (this.keys.d ? 1 : 0) - (this.keys.u ? 1 : 0);
    let chop = this.chopHeld || this.keys.c;
    if (this.autoMe) {
      const a = this.autoInput(dt);
      jx = a.x;
      jy = 0;
      chop = a.c;
    }
    if (this.hud.modalOpen) {
      jx = jy = 0;
      chop = false;
    }
    if (this.autoMe) {
      this.stepOut.mx = jx;
      this.stepOut.mz = this.autoZ;
    } else if (this.view?.toWorld) this.view.toWorld(jx, jy, this.stepOut);
    else {
      this.stepOut.mx = jx;
      this.stepOut.mz = 0;
    }
    this.sim.input.mx = this.stepOut.mx;
    this.sim.input.mz = this.stepOut.mz;
    this.sim.input.chop = chop;
    const prevTrees = this.sim.s.trees;
    const prevCarry = this.sim.me.carry;
    this.sim.step(dt);
    this.sounds(dt, chop, prevTrees, prevCarry);
    this.view?.frame(dt);
    this.hud.update(dt);
    this.net(dt);
    this.gov.sample(el, performance.now() - w0);
  };

  /** IA para screenshots/dev: corta, carrega e entrega */
  private autoZ = 0;
  private autoInput(dt: number): { x: number; c: boolean } {
    const s = this.sim;
    const m = s.me;
    this.autoT += dt;
    this.autoZ = 0;
    if (m.carry >= s.vehicle.cap || (m.carry > 0 && !s.trees.some((tr) => tr.state === TS.Grown && tr.biome < s.s.unlocked && Math.abs(tr.x - m.x) < 30))) {
      return { x: -1, c: false };
    }
    for (const l of s.logs) if (l.on && !l.ghost && Math.abs(l.x - m.x) < 8 && l.age > 0.4) return { x: Math.sign(l.x - m.x), c: false };
    if (m.target >= 0) return { x: 0, c: true };
    let best = 1e9;
    let dir = 1;
    this.autoZ = 0;
    for (const tr of s.trees) {
      if (tr.state !== TS.Grown || tr.biome >= s.s.unlocked) continue;
      const d = Math.abs(tr.x - m.x);
      if (d < best) {
        best = d;
        dir = Math.abs(tr.x - m.x) < 1.2 ? 0 : Math.sign(tr.x - m.x);
        this.autoZ = Math.max(-1, Math.min(1, (tr.z - m.z) * 0.5));
      }
    }
    return { x: dir, c: false };
  }

  private sounds(dt: number, chop: boolean, prevTrees: number, prevCarry: number): void {
    const s = this.sim;
    this.chopSfxT -= dt;
    if (chop && s.me.swing >= 0.95 && this.chopSfxT <= 0 && s.me.target >= 0) {
      this.chopSfxT = 0.15;
      audio.tick(Math.floor(Math.random() * 3));
      tap('light');
    }
    if (s.s.trees > prevTrees) {
      audio.crack();
      tap('medium');
      if (s.s.tutorial === 0) s.s.tutorial = 1;
      if (!this.ecoShown && s.sessionTrees >= 3) {
        this.ecoShown = true;
        this.hud.toast(t('floresta.ecoTip', 'Os tocos viram mudas sozinhos. Robôs plantadores e o viveiro aceleram!'), 'eco');
      }
    }
    if (s.me.carry > prevCarry) audio.coin(s.me.carry);
    if (s.s.tutorial === 1 && s.s.planks > 0) s.s.tutorial = 2;
    if (s.happy && !this.happyShown) {
      this.happyShown = true;
      this.hud.toast(t('floresta.happy', 'Bosque feliz: vendas +25%!'), 'eco');
    } else if (!s.happy && this.happyShown && s.health < 0.6) this.happyShown = false;
  }

  /* ------------------------------ ações ------------------------------ */

  carried(): number {
    return this.is3d ? this.sim.held3d : this.sim.me.carry;
  }

  onAction(kind: CtxKind): void {
    const s = this.sim;
    if (kind === 'plant') {
      if (s.plantByHand()) {
        audio.coin(1);
        tap('light');
        this.hud.toast(t('floresta.planted', 'Muda plantada! Ela cresce rapidinho'), 'eco');
      }
      return;
    }
    if (kind === 'saw') {
      this.hud.sawGame((q) => {
        let n = 0;
        let val = 0;
        if (this.is3d && this.view?.takeHeld) ({ n, val } = this.view.takeHeld());
        else {
          n = s.me.carry;
          val = s.me.carryVal;
          s.me.carry = 0;
          s.me.carryVal = 0;
        }
        const p = s.handSaw(n, val, q);
        if (p > 0) {
          audio.record();
          success();
          this.hud.toast(t('floresta.sawDone', '+{n} tábuas serradas na mão', { n: p }), q >= 0.8 ? 'eco' : '');
          if (s.s.tutorial === 1) s.s.tutorial = 2;
        }
      });
      return;
    }
    if (kind === 'sell') {
      const v = s.sellAll();
      if (v > 0) {
        this.hud.cashFly();
        audio.cash();
        success();
        if (s.s.tutorial === 2) s.s.tutorial = 3;
      }
    } else if (kind === 'build') {
      const b = s.canBuild();
      if (b >= 0 && s.build()) {
        audio.record();
        success();
        this.hud.showBanner(BUILDS[b].name(), t('floresta.opened', '{b} aberto!', { b: BIOMES[b + 1].name() }));
      } else if (b >= 0) this.hud.toast(t('floresta.needMore', 'Faltam tábuas ou bolotas'));
    }
  }

  onEmote(code: string): void {
    this.sim.me.emote = code;
    this.sim.me.emoteT = 3;
    this.presence?.emote(code);
    audio.click();
  }

  onSolo(on: boolean): void {
    this.sim.setSolo(on);
    if (on) {
      try {
        this.presence?.leave();
      } catch {
        /* */
      }
      this.presence = null;
      this.humanCount = 0;
      this.sim.remotes = [];
    } else if (!this.presence) void this.joinOnline();
    this.hud.toast(on ? t('floresta.soloOn', 'Jogando sozinho: sem ajudantes') : t('floresta.soloOff', 'Ajudantes de volta!'));
  }

  onToggleCam(): void {
    this.view?.toggleCam?.();
  }

  onExit(): void {
    this.paused = true;
    writeSave(this.sim.s);
    const s = this.sim;
    const coins = rewardCoins(s.sessionEarned, s.sessionTrees);
    let paid = false;
    const pay = () => {
      if (paid) return;
      paid = true;
      if (coins > 0) addCoins(coins);
      reportRun({ game: 'floresta', score: Math.round(s.sessionEarned), coins, durationSec: Math.round(s.time), stats: { trees: s.sessionTrees, planks: s.sessionPlanks } });
      s.sessionEarned = 0;
      s.sessionTrees = 0;
      s.sessionPlanks = 0;
      s.time = 0;
    };
    const data = { earned: s.sessionEarned, trees: s.sessionTrees, planks: s.sessionPlanks, coins };
    pay();
    this.hud.summary(
      data,
      coins > 0,
      async () => {
        try {
          const ads = await import('../../services/ads');
          if (!ads.rewardedAvailable()) return false;
          const ok = await ads.showRewarded();
          if (ok) addCoins(coins);
          return ok;
        } catch {
          return false;
        }
      },
      () => this.finish(),
      () => {
        this.paused = false;
        this.last = performance.now();
      },
    );
  }

  /* ------------------------------ online ------------------------------ */

  playersCount(): number {
    let n = 1 + this.humanCount;
    for (const a of this.sim.agents) if (a.kind === 'friend') n++;
    return Math.min(5, n);
  }

  private async joinOnline(): Promise<void> {
    try {
      const [pres, net] = await Promise.all([import('../../services/presence'), import('../../social/net').catch(() => null)]);
      if (this.destroyed) return;
      const ses = await pres.joinPresence('floresta', { botsIfAlone: this.sim.solo ? 0 : 3, seed: WORLD_SEED });
      if (this.destroyed) return ses.leave();
      this.presence = ses;
      try {
        this.myId = (await net?.me())?.id ?? '';
      } catch {
        this.myId = '';
      }
      ses.onPeers((peers) => this.onPeers(peers));
    } catch {
      /* offline: segue sozinho */
    }
  }

  private onPeers(peers: PeerState[]): void {
    const sim = this.sim;
    const humans = peers.filter((p) => !p.bot).slice(0, 4);
    const bots = sim.solo ? [] : peers.filter((p) => p.bot).slice(0, 4 - humans.length);
    this.humanCount = humans.length;
    // anfitrião: menor id entre os humanos
    let host = true;
    for (const p of humans) if (this.myId && p.id < this.myId) host = false;
    sim.isHost = host || !this.myId;
    // remotos
    const keep: Remote[] = [];
    for (const p of humans) {
      let r = sim.remotes.find((x) => x.id === p.id);
      if (!r) r = { id: p.id, name: p.name, skin: p.skin === 'custom' ? 'bloop' : p.skin, x: p.s.x ?? 30, z: p.s.z ?? 0, tx: 30, tz: 0, face: 1, carry: 0, chop: 0, vehicle: 0, tool: 0, emote: '', emoteT: 0, walk: 0, swing: 0 };
      const s = p.s;
      if (typeof s.x === 'number') r.tx = s.x;
      if (typeof s.z === 'number') r.tz = this.sim.mode3d ? s.z : 0;
      r.carry = s.c | 0;
      r.chop = s.k | 0;
      r.vehicle = s.v | 0;
      r.tool = s.t | 0;
      if (p.emote && p.emote !== r.emote) {
        r.emote = p.emote;
        r.emoteT = 3;
      } else if (!p.emote) r.emote = '';
      // eventos de queda vindos do anfitrião
      const seq = s.fs | 0;
      if (seq && seq !== this.lastSeq.get(p.id)) {
        this.lastSeq.set(p.id, seq);
        const tr = sim.trees[(s.fe | 0) - 1];
        if (tr && tr.state === TS.Grown) sim.fell(tr, s.fx ?? 1, s.fz ?? 0, sim.reqTree === tr.id && tr.hp <= 0.02 ? 0 : 2);
      }
      // pedidos de dano (quando eu sou o anfitrião)
      if (sim.isHost) {
        const q = s.q | 0;
        const qd = s.qd ?? 0;
        const prev = this.lastReq.get(p.id) ?? qd;
        this.lastReq.set(p.id, qd);
        const tr = sim.trees[q - 1];
        if (tr && qd > prev) sim.hitTree(tr, qd - prev, r.x, r.z, 2);
      }
      keep.push(r);
    }
    sim.remotes = keep;
    // bots da presença viram amigos lenhadores (IA local)
    const friends = sim.agents.filter((a) => a.kind === 'friend');
    for (const f of friends) if (!bots.find((b) => b.name === f.name)) sim.agents.splice(sim.agents.indexOf(f), 1);
    bots.forEach((b, i) => {
      let a: Agent | undefined = sim.agents.find((x) => x.kind === 'friend' && x.name === b.name);
      if (!a) a = sim.addAgent('friend', i, b.name, SKINS.some((s) => s.id === b.skin) ? b.skin : 'bloop');
      if (b.emote && a.emote !== b.emote) {
        a.emote = b.emote;
        a.emoteT = 3;
      }
    });
  }

  private announceFell(tr: Tree): void {
    if (!this.presence?.online) return;
    this.hostFell.push({ id: tr.id, dx: tr.fdx, dz: tr.fdz });
    if (this.hostFell.length > 12) this.hostFell.shift();
  }

  private net(dt: number): void {
    const ses = this.presence;
    if (!ses) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.2;
    if (!ses.online) return;
    const s = this.sim;
    const out: Record<string, number> = {
      x: Math.round(s.me.x * 10) / 10,
      z: Math.round(s.me.z * 10) / 10,
      c: s.me.carry,
      k: this.sim.input.chop ? 1 : 0,
      v: s.s.vehicle,
      t: s.s.tool,
      q: s.reqTree + 1,
      qd: Math.round(s.reqDmg * 10) / 10,
    };
    const f = this.hostFell.shift();
    if (f && s.isHost) {
      this.fellSeq++;
      out.fe = f.id + 1;
      out.fs = this.fellSeq;
      out.fx = Math.round(f.dx * 100) / 100;
      out.fz = Math.round(f.dz * 100) / 100;
    }
    ses.send(out);
  }

  /* ------------------------------ handle ------------------------------ */

  pause(): void {
    this.paused = true;
    this.chopHeld = false;
    writeSave(this.sim.s);
  }
  resume(): void {
    if (this.hud?.modalOpen) return;
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
    writeSave(this.sim.s);
    for (const f of this.offs) f();
    try {
      this.presence?.leave();
    } catch {
      /* */
    }
    this.view?.destroy();
    this.hud?.destroy();
    this.wrap.remove();
    removeFlIconDefs();
  }
}

/** moedas do hub pela sessão (curva suave, com teto) */
export function rewardCoins(earned: number, trees: number): number {
  if (earned <= 0 && trees <= 0) return 0;
  return Math.min(300, Math.round(4 + Math.sqrt(Math.max(0, earned)) * 1.2 + trees * 0.8));
}

/** miniatura dos cartões da escolha de modo */
function previewCard(c: HTMLCanvasElement, three: boolean, last: boolean): void {
  const x = c.getContext('2d');
  if (!x) return;
  const W = c.width;
  const H = c.height;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, three ? '#9fd8ff' : '#7cc8ff');
  g.addColorStop(1, '#eaffd9');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  if (three) {
    // chão em perspectiva
    x.fillStyle = '#6cc24a';
    x.beginPath();
    x.moveTo(0, H);
    x.lineTo(W * 0.35, H * 0.55);
    x.lineTo(W * 0.65, H * 0.55);
    x.lineTo(W, H);
    x.fill();
    x.fillStyle = '#d8b880';
    x.beginPath();
    x.moveTo(W * 0.4, H);
    x.lineTo(W * 0.48, H * 0.55);
    x.lineTo(W * 0.52, H * 0.55);
    x.lineTo(W * 0.6, H);
    x.fill();
    const pos = [
      [0.15, 0.95, 1],
      [0.85, 0.95, 1],
      [0.3, 0.7, 0.55],
      [0.7, 0.7, 0.55],
      [0.42, 0.6, 0.35],
      [0.58, 0.6, 0.35],
    ];
    for (const [px, py, s] of pos) {
      x.save();
      x.translate(W * px, H * py);
      drawTree(x, SPECIES[(px * 10) % 2 > 1 ? 1 : 0], 0, 9 * s);
      x.restore();
    }
    // primeira pessoa: machado na mão, no canto
    x.save();
    x.translate(W * 0.8, H * 0.98);
    x.rotate(-0.5);
    x.lineJoin = 'round';
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 4;
    x.fillStyle = '#a8743c';
    x.beginPath();
    x.roundRect(-6, -78, 12, 80, 5);
    x.fill();
    x.stroke();
    x.fillStyle = '#e0e8f4';
    x.beginPath();
    x.moveTo(-4, -76);
    x.quadraticCurveTo(-40, -86, -44, -58);
    x.quadraticCurveTo(-24, -60, -4, -52);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#ffcf2e';
    x.beginPath();
    x.ellipse(0, -14, 20, 17, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.restore();
    // mira
    x.strokeStyle = '#fff';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(W / 2, H * 0.55, 7, 0, Math.PI * 2);
    x.stroke();
  } else {
    x.fillStyle = '#6fae6a';
    x.beginPath();
    x.moveTo(0, H * 0.7);
    x.quadraticCurveTo(W * 0.3, H * 0.45, W * 0.6, H * 0.65);
    x.quadraticCurveTo(W * 0.8, H * 0.5, W, H * 0.62);
    x.lineTo(W, H);
    x.lineTo(0, H);
    x.fill();
    x.fillStyle = '#7a5a3a';
    x.fillRect(0, H * 0.82, W, H);
    x.fillStyle = '#6cc24a';
    x.fillRect(0, H * 0.8, W, 5);
    for (let i = 0; i < 4; i++) {
      x.save();
      x.translate(W * (0.15 + i * 0.25), H * 0.84);
      if (i === 2) x.rotate(0.9);
      drawTree(x, SPECIES[i % 2], i === 3 ? 1 : 0, 11);
      x.restore();
    }
  }
  if (last) {
    x.fillStyle = 'rgba(42,11,92,.8)';
    x.fillRect(0, 0, W, 22);
    x.fillStyle = '#fff';
    x.font = gameFont(700, 14);
    x.textAlign = 'center';
    x.fillText(t('floresta.lastMode', 'Último usado'), W / 2, 16);
  }
}

