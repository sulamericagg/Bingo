/* ============================================================
 *  NOITES DO ACAMPAMENTO — partida: menu (sozinho / criar sala /
 *  entrar), laço, controles em 3ª pessoa, objetivos com setas,
 *  falas e o online host-autoritativo.
 * ============================================================ */
import './noites.css';
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { tap, success } from '../../core/haptics';
import { addCoins } from '../../core/economy';
import { QualityGovernor, loadMode } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { FpsControls } from '../../ui/touch';
import { bigMoment, clearNotify, notify, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { save as appSave } from '../../core/storage';
import { sfx, disposeSfx } from '../../3d/common/sfx';
import { social } from '../../social/store';
import { displayName } from '../../services/leaderboard';
import { me } from '../../social/net';
import { BENCH_BABIES, BENCH_POS, CAMP_R, DAY_LEN, GAME_ID, GOAL_NIGHTS, HATS, ITEM, NIGHT_LEN, RAW_FOOD, nightInfo, resName, TAU, type Res } from './data';
import { Sim, bagCount, type Action, type BotCmd, type Ev, type Player } from './sim';
import { NODE_GIVES, treeR } from './world';
import { View, type Focus, type Ghost } from './view';
import { Hud, esc, itemIcon, itemName, whyText } from './hud';
import { ic } from './icons';
import { setVoice, speak, stopSpeak, voiceOn } from './speak';
import { Garage } from './garage';
import { stats, vName, type VDesign } from './vehicles';
import { NightsNet, apply, encode, newSnapState, roomCode, type GuestMsg, type Peer, type SnapState } from './net';

/* ------------------------------ save ------------------------------ */
interface NSave {
  best: number;
  hat: string;
  bots: number;
  runs: number;
  tut: { chop?: boolean; feed?: boolean; craft?: boolean };
}
const SKEY = 'noites-save';
function loadSave(): NSave {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) ?? 'null');
    if (s && typeof s.best === 'number') return { best: 0, hat: 'leaf', bots: 1, runs: 0, tut: {}, ...s };
  } catch {
    /* */
  }
  return { best: 0, hat: 'leaf', bots: 1, runs: 0, tut: {} };
}
function writeSave(s: NSave): void {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* */
  }
}

type Target =
  | { k: 'tree' | 'node' | 'chest' | 'baby' | 'proc' | 'pick' | 'garage'; i: number; x: number; z: number; r: number }
  | { k: 'veh'; i: number; x: number; z: number; r: number; sub: 'enter' | 'load' | 'fuel' }
  | { k: 'fire' | 'bench'; i: -1; x: number; z: number; r: number };

const SPEED = 5.2;
const SNAP_HZ = 12;

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new NoitesGame(root, exit);
  g.showMenu();
  return g;
}

export class NoitesGame implements MiniGameHandle {
  private wrap: HTMLDivElement;
  private save = loadSave();
  sim: Sim | null = null;
  view: View | null = null;
  hud: Hud | null = null;
  private ctl: FpsControls | null = null;
  private gov = new QualityGovernor({ mode: loadMode(), persist: false, emit: false, onChange: (tier) => this.view?.setTier(tier) });
  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;
  private myId = 'me';
  private myName = 'Bloop';
  private net: NightsNet | null = null;
  private code = '';
  private snap: SnapState = newSnapState();
  private sendT = 0;
  private fullT = 0;
  private evSeen = 0;
  private placing: { id: string; r: number } | null = null;
  private target: Target | null = null;
  private objT = 0;
  private resultShown = false;
  private started = 0;
  private menuEl: HTMLDivElement | null = null;
  private offs: (() => void)[] = [];
  private keys = new Set<string>();
  private craftKey = '';
  private wasNight = false;
  private lastBlock = '';
  private botsN = 0;
  private garage: Garage | null = null;
  private garageKey = '';
  private camAuto = 0;
  private driveIn: [number, number] = [0, 0];

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'nc-root';
    root.appendChild(this.wrap);
    this.myName = displayName();
    if (location.search.includes('debug')) (window as unknown as { __noites: NoitesGame }).__noites = this;
    const kd = (e: KeyboardEvent) => this.onKey(e, true);
    const ku = (e: KeyboardEvent) => this.onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const rs = () => this.view?.resize();
    window.addEventListener('resize', rs);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', rs);
    });
  }

  get me(): Player | undefined {
    return this.sim?.player(this.myId);
  }
  private get isClient(): boolean {
    return !!this.net && !this.net.isHost;
  }

  /* ------------------------------ menu ------------------------------ */
  showMenu(): void {
    this.menuEl?.remove();
    const m = document.createElement('div');
    m.className = 'nc-menu';
    this.menuEl = m;
    const hats = HATS.map((h) => {
      const lock = this.save.best < h.need;
      return `<button class="nc-btn ${this.save.hat === h.id ? 'gold on' : ''}" data-hat="${h.id}" ${lock ? 'disabled' : ''} data-say="${esc(h.n())}">${lock ? ic('lock', 26) : h.id === 'none' ? ic('close', 26, '#2a0b5c') : ic(HAT_ICON[h.id] ?? 'star', 30, h.col)}${lock ? `<small>${h.need}</small>` : ''}</button>`;
    }).join('');
    m.innerHTML = `
      <button class="nc-btn round red tl" data-m="exit" data-say="${esc(t('noites.say.exit', 'Sair'))}">${ic('exit', 26)}</button>
      <h1>${ic('fire', 40)}${esc(t('noites.name', 'Noites do Acampamento'))}${ic('moon', 34)}</h1>
      <div class="rec">${ic('moon', 26)}${ic('star', 22)} ${this.save.best} / ${GOAL_NIGHTS}</div>
      <div class="big">
        <button class="nc-btn gold" data-m="solo" data-say="${esc(t('noites.menu.solo', 'Jogar sozinho'))}">${ic('play', 52)}<span>${esc(t('noites.menu.soloS', 'Sozinho'))}</span></button>
        <button class="nc-btn" data-m="host" data-say="${esc(t('noites.menu.host', 'Criar sala para amigos'))}">${ic('people', 52)}<span>${esc(t('noites.menu.hostS', 'Criar sala'))}</span></button>
        <button class="nc-btn" data-m="join" data-say="${esc(t('noites.menu.join', 'Entrar na sala de um amigo'))}">${ic('key', 52)}<span>${esc(t('noites.menu.joinS', 'Entrar'))}</span></button>
      </div>
      <div class="row" style="display:flex;gap:6px;align-items:center">${ic('people', 26)}
        ${[0, 1, 2].map((n) => `<button class="nc-btn ${this.save.bots === n ? 'gold on' : ''}" data-bots="${n}" data-say="${esc(t('noites.menu.bots', '{n} ajudantes', { n }))}" style="width:56px;height:48px">${n === 0 ? ic('close', 24, '#2a0b5c') : ic('baby', 26, '#8ad8ff').repeat(n)}</button>`).join('')}
      </div>
      <div class="hats">${hats}</div>`;
    this.wrap.appendChild(m);
    speak(t('noites.say.welcome', 'Noites do Acampamento! Toque no botão verde para jogar.'), { cool: 60000 });
    m.querySelectorAll<HTMLElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        audio.unlock();
        sfx.click();
        const say = b.dataset.say;
        if (say) speak(say, { cool: 500, urgent: true });
        if (b.dataset.hat) {
          this.save.hat = b.dataset.hat;
          writeSave(this.save);
          this.showMenu();
        } else if (b.dataset.bots) {
          this.save.bots = +b.dataset.bots;
          writeSave(this.save);
          this.showMenu();
        } else if (b.dataset.m === 'exit') this.exitCb();
        else if (b.dataset.m === 'solo') this.startSolo();
        else if (b.dataset.m === 'host') void this.startHost();
        else if (b.dataset.m === 'join') this.showJoin();
      }),
    );
  }

  private showJoin(): void {
    this.menuEl?.remove();
    const m = document.createElement('div');
    m.className = 'nc-menu';
    this.menuEl = m;
    let code = '';
    const friends = social.friends.slice(0, 8);
    m.innerHTML = `
      <button class="nc-btn round red tl" data-k="back" data-say="${esc(t('noites.say.back', 'Voltar'))}">${ic('back', 26)}</button>
      <div class="row" style="display:flex;gap:8px;align-items:center">${ic('key', 40)}<div class="nc-codebox" data-v="code"></div></div>
      <div style="display:flex;gap:16px;align-items:center">
        <div class="nc-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="nc-btn" data-k="${n}">${n}</button>`).join('')}<button class="nc-btn red" data-k="del">${ic('back', 24)}</button><button class="nc-btn" data-k="0">0</button><button class="nc-btn green" data-k="go" data-say="${esc(t('noites.say.go', 'Entrar!'))}">${ic('check', 30, '#0a3a1a')}</button></div>
        ${friends.length ? `<div style="display:flex;flex-direction:column;gap:6px;align-items:center">${ic('heart', 28)}<div class="nc-friends">${friends.map((f) => `<button class="nc-btn" data-f="${esc(f.id)}" data-say="${esc(f.name)}">${ic('people', 22)}${esc(f.name.slice(0, 12))}</button>`).join('')}</div></div>` : ''}
      </div>`;
    this.wrap.appendChild(m);
    speak(t('noites.say.code', 'Digite o código da sala do seu amigo.'), { cool: 20000 });
    const box = m.querySelector('[data-v="code"]') as HTMLElement;
    m.querySelectorAll<HTMLElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.click();
        const k = b.dataset.k;
        if (b.dataset.say) speak(b.dataset.say, { cool: 300, urgent: true });
        if (b.dataset.f) return void this.startJoin(roomCode(b.dataset.f));
        if (k === 'back') return this.showMenu();
        if (k === 'del') code = code.slice(0, -1);
        else if (k === 'go') {
          if (code.length === 6) void this.startJoin(code);
          return;
        } else if (k && code.length < 6) {
          code += k;
          speak(k, { cool: 0, urgent: true });
        }
        box.textContent = code;
      }),
    );
  }

  /* ------------------------------ início ------------------------------ */
  private startSolo(): void {
    this.menuEl?.remove();
    this.menuEl = null;
    this.net?.close();
    this.net = null;
    this.myId = 'me';
    this.newSim(Math.floor(Math.random() * 1e9));
  }
  private async me4net(): Promise<Peer | null> {
    try {
      const p = await me();
      this.myName = p.name;
      return { id: p.id, name: p.name, skin: p.skin, hat: this.save.hat };
    } catch {
      return null;
    }
  }
  private async startHost(): Promise<void> {
    const p = await this.me4net();
    const net = new NightsNet();
    const r = p ? await net.connect(roomCode(p.id), p, true) : 'offline';
    if (this.destroyed) return net.close();
    if (r !== 'ok' || !p) {
      net.close();
      this.netFail(r);
      return;
    }
    this.net = net;
    this.code = roomCode(p.id);
    this.myId = p.id;
    this.menuEl?.remove();
    this.menuEl = null;
    this.bindNet();
    this.newSim(Math.floor(Math.random() * 1e9));
    speak(t('noites.say.hosted', 'Sala criada! Seus amigos entram com o código {c}.', { c: this.code.split('').join(' ') }), { cool: 1000, urgent: true });
  }
  private async startJoin(code: string): Promise<void> {
    const p = await this.me4net();
    const net = new NightsNet();
    const r = p ? await net.connect(code, p, false) : 'offline';
    if (this.destroyed) return net.close();
    if (r !== 'ok' || !p) {
      net.close();
      this.netFail(r);
      return;
    }
    this.net = net;
    this.code = code;
    this.myId = p.id;
    this.menuEl?.remove();
    this.menuEl = null;
    this.bindNet();
    speak(t('noites.say.joined', 'Entrou! Esperando o acampamento...'), { cool: 1000, urgent: true });
  }
  private netFail(r: string): void {
    const msg =
      r === 'no_host'
        ? t('noites.net.noHost', 'Ninguém está jogando nessa sala agora.')
        : r === 'full'
          ? t('noites.net.full', 'A sala está cheia (4 jogadores).')
          : r === 'busy'
            ? t('noites.net.busy', 'Essa sala já tem um anfitrião.')
            : t('noites.net.offline', 'Sem conexão com a internet agora.');
    notify(msg, { kind: 'warn', iconHtml: ic('cloud', 18) });
    speak(msg, { cool: 500, urgent: true });
  }

  private newSim(seed: number): void {
    this.teardownRun();
    const s = new Sim(seed);
    this.sim = s;
    this.resultShown = false;
    this.started = performance.now();
    this.evSeen = 0;
    this.snap = newSnapState();
    s.addPlayer(this.myId, this.myName, appSave.skin, this.save.hat);
    this.botsN = 0;
    if (!this.net) {
      for (let i = 0; i < this.save.bots; i++) s.addPlayer('bot' + i, t('noites.botName', 'Ajudante {n}', { n: i + 1 }), 'bloop', 'none', true);
      this.botsN = this.save.bots;
    }
    this.buildScene();
    const n = nightInfo(1);
    void n;
    speak(t('noites.say.start', 'Dia 1! Corte lenha e mantenha a fogueira acesa. À noite, fique na luz!'), { cool: 1000, urgent: true });
    this.save.runs++;
    writeSave(this.save);
  }

  private buildScene(): void {
    const s = this.sim!;
    this.view = new View(this.wrap, s, this.gov.tier);
    this.ctl = new FpsControls(this.wrap, { joystick: { zoneTop: 0.22, zoneWidth: 0.42 }, keyboard: true });
    this.hud = new Hud(this.wrap, {
      action: () => this.doAction(),
      light: () => this.toggleLight(),
      bonk: () => this.doBonk(),
      slot: (id) => this.useSlot(id),
      place: (k) => this.placeCmd(k),
      craft: (id) => this.send({ a: 'craft', id }),
      bot: (c) => this.send({ a: 'cmd', c }),
      exit: () => this.askExit(),
      voice: () => {
        setVoice(!voiceOn());
        this.hud?.setVoice(voiceOn());
      },
      craftOpen: (on) => this.ctl?.show(!on),
    });
    this.hud.setVoice(voiceOn());
    this.hud.showBotsBtn(this.botsN > 0);
    const top = this.wrap.querySelector('.nc-top') as HTMLElement;
    setNotifyTop(top.getBoundingClientRect().bottom + 4);
    const me = this.me!;
    this.view.camYaw = me.yaw;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  private teardownRun(): void {
    this.view?.destroy();
    this.view = null;
    this.hud?.destroy();
    this.hud = null;
    this.ctl?.dispose();
    this.ctl = null;
    this.wrap.querySelector('.nc-result')?.remove();
    this.garage?.destroy();
    this.garage = null;
    this.placing = null;
  }

  /* ------------------------------ rede ------------------------------ */
  private bindNet(): void {
    const net = this.net!;
    net.onClose = () => {
      if (this.destroyed) return;
      const msg = t('noites.net.lost', 'A conexão caiu.');
      notify(msg, { kind: 'warn' });
      speak(msg, { cool: 500 });
      if (this.isClient) this.finish(true);
      else {
        this.net = null;
        this.hud?.setCode('', 0);
      }
    };
    net.onMsg = (m, from) => {
      if (!this.sim && m.t !== 's') return;
      if (net.isHost) {
        const s = this.sim!;
        if (m.t === 'join') {
          const p = m.p as Peer;
          s.addPlayer(p.id, p.name, p.skin, p.hat);
          this.fullT = 0;
          notify(t('noites.net.joinedP', '{n} entrou!', { n: p.name }), { kind: 'good', iconHtml: ic('people', 18) });
          sfx.catch();
        } else if (m.t === 'leave') {
          const p = s.player(String(m.id));
          if (p) notify(t('noites.net.leftP', '{n} saiu', { n: p.name }), { iconHtml: ic('people', 18) });
          s.removePlayer(String(m.id));
        } else if (from) {
          const g = m as unknown as GuestMsg;
          const p = s.player(from);
          if (!p) return;
          if (g.t === 'i') {
            if (p.seat >= 0) s.drive(from, Number(g.th) || 0, Number(g.sr) || 0);
            else if (p.faint <= 0) {
              const [x, z] = s.collide(+g.x || 0, +g.z || 0, 0.4);
              if (Math.hypot(x - p.x, z - p.z) < 6) [p.x, p.z] = [x, z];
              p.yaw = +g.yaw || 0;
              p.aim = +g.aim || 0;
              p.lightOn = !!g.l;
            }
          } else if (g.t === 'a') {
            const a = { ...(g as Record<string, unknown>) };
            delete a.t;
            if ((a as { a: string }).a !== 'cmd') s.act(from, a as unknown as Action);
          }
        }
        return;
      }
      // convidado
      if (m.t === 'end') {
        const msg = t('noites.net.hostLeft', 'O anfitrião saiu do acampamento.');
        notify(msg, { kind: 'warn' });
        speak(msg, { cool: 500 });
        this.finish(true);
        return;
      }
      if (m.t === 's') {
        const o = m as Record<string, any>;
        if (!this.sim || this.sim.seed !== o.sd) {
          this.sim = new Sim(o.sd);
          this.resultShown = false;
          apply(this.sim, o, this.myId);
          if (!this.me) this.sim.addPlayer(this.myId, this.myName, appSave.skin, this.save.hat);
          this.teardownRun();
          this.buildScene();
          this.started = performance.now();
          return;
        }
        const me = this.me;
        const keep = me ? { x: me.x, z: me.z, yaw: me.yaw, aim: me.aim, l: me.lightOn } : null;
        apply(this.sim, o, this.myId);
        for (const e of (o.ev as Ev[]) ?? []) {
          if (e.k === 'respawn' && e.p === this.myId && keep) [keep.x, keep.z] = [e.x ?? 0, e.z ?? 0];
          this.onEvent(e);
        }
        const me2 = this.me;
        if (me2 && keep && me2.seat < 0 && !(o.ev as Ev[] | undefined)?.some((e) => e.k === 'vexit' && e.p === this.myId)) [me2.x, me2.z, me2.yaw, me2.aim, me2.lightOn] = [keep.x, keep.z, keep.yaw, keep.aim, me2.faint > 0 ? false : keep.l];
      }
    };
  }
  /** ação do jogador local: direto no Sim (solo/host) ou para o host */
  private send(a: Action): void {
    if (!this.sim) return;
    if (this.isClient) this.net!.send({ t: 'a', ...a });
    else this.sim.act(this.myId, a);
  }

  /* ------------------------------ entrada ------------------------------ */
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.sim || !this.hud) return;
    if (down && !this.keys.has(e.code)) {
      if (e.code === 'KeyE' || e.code === 'Space') this.doAction();
      if (e.code === 'KeyF') this.toggleLight();
      if (e.code === 'KeyQ') this.doBonk();
      if (e.code === 'Escape' && this.hud.crafting) this.hud.closeCraft();
      if (/^Digit[1-6]$/.test(e.code)) {
        const items = this.hotItems();
        const it = items[+e.code.slice(5) - 1];
        if (it) this.useSlot(it.id);
      }
    }
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }
  private toggleLight(): void {
    const me = this.me;
    if (!me || me.faint > 0) return;
    me.lightOn = !me.lightOn;
    sfx.click();
    if (me.lightOn) speak(t('noites.say.lightOn', 'Lanterna ligada! Aponte para as Sombrinhas.'), { cool: 30000 });
  }
  private doBonk(): void {
    const me = this.me;
    const s = this.sim;
    if (!me || !s || me.bonk <= 0) return;
    let yaw = me.yaw;
    let nd = 3.5;
    for (const c of s.creatures) {
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d < nd) (nd = d), (yaw = Math.atan2(c.x - me.x, c.z - me.z));
    }
    me.yaw = yaw;
    me.swing = 0.4;
    this.send({ a: 'bonk', yaw });
    sfx.swish();
  }
  private hotItems(): { id: string; n: number }[] {
    const me = this.me;
    if (!me) return [];
    const out = Object.entries(me.inv)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n }));
    // comida crua do saco quando dá fome
    if (me.hunger < 75) {
      const raw = (Object.keys(RAW_FOOD) as Res[]).filter((r) => (me.bag[r] ?? 0) > 0 || (Math.hypot(me.x, me.z) < CAMP_R + 4 && (this.sim!.stash[r] ?? 0) > 0));
      raw.sort((a, b) => (RAW_FOOD[b] ?? 0) - (RAW_FOOD[a] ?? 0));
      if (raw[0]) out.unshift({ id: raw[0], n: (me.bag[raw[0]] ?? 0) + (this.sim!.stash[raw[0]] ?? 0) });
    }
    return out.slice(0, 6);
  }
  private useSlot(id: string): void {
    const me = this.me;
    const s = this.sim;
    if (!me || !s || me.faint > 0) return;
    const d = ITEM[id];
    if (!d || d.food) {
      this.send({ a: 'eat', id });
      return;
    }
    if (d.place) {
      this.placing = { id, r: me.yaw + Math.PI / 2 };
      this.hud?.setPlacing(true);
      speak(t('noites.say.place', 'Escolha o lugar e toque no verde.'), { cool: 15000 });
      return;
    }
    if (d.throwLight) {
      // mira: Sombrinha mais perto à frente, senão 7 m à frente
      let tx = me.x + Math.sin(this.view!.camYaw) * 7;
      let tz = me.z + Math.cos(this.view!.camYaw) * 7;
      let nd = 13;
      for (const c of s.creatures) {
        const dd = Math.hypot(c.x - me.x, c.z - me.z);
        if (dd < nd) (nd = dd), (tx = c.x), (tz = c.z);
      }
      this.send({ a: 'use', id, x: tx, z: tz, r: 0 });
      sfx.whoosh();
    }
  }
  private ghost(): Ghost | null {
    const me = this.me;
    const s = this.sim;
    if (!this.placing || !me || !s) return null;
    const f = this.view!.camYaw;
    const x = me.x + Math.sin(f) * 2.6;
    const z = me.z + Math.cos(f) * 2.6;
    const [cx, cz] = s.collide(x, z, 0.35);
    const ok = Math.hypot(cx - x, cz - z) < 0.05 && Math.hypot(x, z) > 1.8 && Math.hypot(x - BENCH_POS[0], z - BENCH_POS[1]) > 1.5;
    return { id: this.placing.id, x, z, r: this.placing.r, ok };
  }
  private placeCmd(k: 'ok' | 'rot' | 'no'): void {
    if (!this.placing) return;
    if (k === 'rot') {
      this.placing.r += Math.PI / 4;
      return;
    }
    if (k === 'ok') {
      const g = this.ghost();
      if (!g?.ok) {
        speak(t('noites.say.noSpace', 'Aqui não cabe. Tente outro lugar.'), { cool: 1500, urgent: true });
        return;
      }
      this.send({ a: 'use', id: g.id, x: g.x, z: g.z, r: g.r });
    }
    this.placing = null;
    this.hud?.setPlacing(false);
  }

  /** escolhe o que dá para usar por perto (prioridade + o que está à frente) */
  private findTarget(me: Player): Target | null {
    const s = this.sim!;
    const W = s.w;
    const fx = Math.sin(me.yaw);
    const fz = Math.cos(me.yaw);
    let best: Target | null = null;
    let bs = 1e9;
    const consider = (tg: Target, reach: number, prio: number) => {
      const dx = tg.x - me.x;
      const dz = tg.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return;
      const fwd = (dx * fx + dz * fz) / (d || 1);
      const sc = d - fwd * 0.8 - prio;
      if (sc < bs) (bs = sc), (best = tg);
    };
    s.babies.forEach((b, i) => b.st === 0 && me.carry < 0 && consider({ k: 'baby', i, x: b.x, z: b.z, r: 0.8 }, 3, 5));
    W.chests.forEach((c, i) => !s.chestOpen[i] && consider({ k: 'chest', i, x: c.x, z: c.z, r: 0.9 }, 2.8, 4));
    consider({ k: 'fire', i: -1, x: 0, z: 0, r: 1.6 }, 3.8, 3);
    consider({ k: 'bench', i: -1, x: BENCH_POS[0], z: BENCH_POS[1], r: 1.3 }, 3.2, 3);
    for (const st of s.structs) {
      const kind = ITEM[st.k]?.place?.kind;
      if (kind === 'kiln' || kind === 'still' || kind === 'charger' || kind === 'solar' || kind === 'garden' || kind === 'berrybed') consider({ k: 'proc', i: st.id, x: st.x, z: st.z, r: 1 }, 2.8, 2);
      else if (kind === 'torch' && st.burn <= 0) consider({ k: 'pick', i: st.id, x: st.x, z: st.z, r: 0.6 }, 2.4, 1);
    }
    for (const v of s.vehView) {
      const d = s.designs.get(v.dk);
      if (!d) continue;
      const st = stats(d);
      const free = !v.driver || v.riders.length < d.seats - 1;
      const sub: 'enter' | 'load' | 'fuel' = (me.bag.wood ?? 0) > 0 && st.cap > v.logs.length / 7 ? 'load' : st.energy && v.fuel < st.fuelCap * 0.6 && ((s.stash[st.energy] ?? 0) > 0 || (me.bag[st.energy] ?? 0) > 0) && (Math.hypot(v.x, v.z) < CAMP_R + 8 || !!s.nearGarage(v.x, v.z, 10)) ? 'fuel' : 'enter';
      if (sub === 'enter' && !free) continue;
      consider({ k: 'veh', i: v.id, x: v.x, z: v.z, r: st.l / 2 + 0.4, sub }, st.lt / 2 + 2.6, 3.5);
    }
    for (const st of s.structs) if (st.k === 'garage') consider({ k: 'garage', i: st.id, x: st.x, z: st.z, r: 1.8 }, 4, 2.5);
    W.each(me.x, me.z, (i) => {
      if (i >= 0) {
        if (s.treeT[i]) return;
        const tr = W.trees[i];
        consider({ k: 'tree', i, x: tr.x, z: tr.z, r: treeR(tr) + 0.5 }, treeR(tr) + 1.9, 0);
      } else if (i > -100000) {
        const n = -1 - i;
        if (!s.nodeT[n]) consider({ k: 'node', i: n, x: W.nodes[n].x, z: W.nodes[n].z, r: 0.9 }, 2.8, 1);
      }
    });
    // nós sem colisão (arbustos, capim...) não estão na grade: varre os próximos
    W.nodes.forEach((n, i) => {
      if (s.nodeT[i] || Math.abs(n.x - me.x) > 3 || Math.abs(n.z - me.z) > 3) return;
      consider({ k: 'node', i, x: n.x, z: n.z, r: 0.9 }, 2.6, 1);
    });
    return best;
  }

  private doAction(): void {
    const me = this.me;
    const s = this.sim;
    if (!me || !s || me.faint > 0 || this.hud?.crafting) return;
    if (this.placing) return this.placeCmd('ok');
    if (me.seat >= 0) {
      this.send({ a: 'vexit' });
      if (!this.isClient) this.evNote('vexit');
      return;
    }
    const tg = this.target;
    if (!tg) {
      // sem alvo: martelada se tiver, senão nada
      if (me.bonk > 0 && s.dark) this.doBonk();
      return;
    }
    me.yaw = Math.atan2(tg.x - me.x, tg.z - me.z);
    switch (tg.k) {
      case 'tree':
        me.swing = 0.35;
        this.send({ a: 'hit', i: tg.i });
        sfx.chop();
        break;
      case 'node':
        this.send({ a: 'take', i: tg.i });
        break;
      case 'chest':
        this.send({ a: 'chest', i: tg.i });
        break;
      case 'baby':
        this.send({ a: 'baby', i: tg.i });
        break;
      case 'fire':
        this.send({ a: 'feed' });
        break;
      case 'bench':
        if (!this.hud?.useHeld || !this.hud.crafting) this.hud?.openCraft(s, me);
        break;
      case 'proc':
        this.send({ a: 'proc', s: tg.i });
        break;
      case 'pick':
        this.send({ a: 'pick', s: tg.i });
        break;
      case 'veh':
        if (tg.sub === 'load') this.send({ a: 'vload', v: tg.i });
        else if (tg.sub === 'fuel') this.send({ a: 'vfuel', v: tg.i });
        else this.send({ a: 'venter', v: tg.i });
        break;
      case 'garage':
        this.openGarage();
        break;
    }
  }
  private evNote(_k: string): void {
    sfx.click();
  }
  private openGarage(): void {
    if (this.garage || !this.sim) return;
    this.ctl?.show(false);
    this.garage = new Garage(
      this.wrap,
      this.sim,
      this.myId,
      (d: VDesign) => {
        this.send({ a: 'vbuild', d });
        this.closeGarage();
      },
      () => this.closeGarage(),
    );
  }
  private closeGarage(): void {
    this.garage?.destroy();
    this.garage = null;
    this.ctl?.show(true);
  }

  /* ------------------------------ eventos ------------------------------ */
  private onEvent(e: Ev): void {
    const s = this.sim!;
    const mine = e.p === this.myId;
    const near = e.x === undefined || !this.me || Math.hypot((e.x ?? 0) - this.me.x, (e.z ?? 0) - this.me.z) < 30;
    this.view?.fx(e);
    switch (e.k) {
      case 'night': {
        const sp = e.i === 'boss' ? t('noites.ev.boss', 'Cuidado: o Rei Sombrão vem aí!') : e.i === 'fog' ? t('noites.ev.fog', 'Noite de neblina!') : e.i === 'moon' ? t('noites.ev.moon', 'Lua cheia: brilhinhos em dobro!') : t('noites.ev.nightSub', 'Fique perto da luz!');
        bigMoment(t('noites.ev.night', 'Noite {n}', { n: e.n ?? 1 }), { sub: sp, color: '#8a7aff' });
        speak(t('noites.say.night', 'A noite chegou!') + ' ' + sp, { cool: 1000, urgent: true });
        sfx.boing();
        break;
      }
      case 'dawn':
        bigMoment(t('noites.ev.dawn', 'Amanheceu!'), { sub: t('noites.ev.dawnSub', 'Vocês sobreviveram à noite {n}!', { n: e.n ?? 1 }), color: '#ffd34a', icon: 'star' });
        speak(t('noites.say.dawn', 'Amanheceu! Vocês sobreviveram à noite {n}!', { n: e.n ?? 1 }), { cool: 1000, urgent: true });
        sfx.sparkle();
        success();
        break;
      case 'win':
        bigMoment(t('noites.ev.win', '{n} noites! Vocês venceram!', { n: GOAL_NIGHTS }), { icon: 'trophy', sub: t('noites.ev.winSub', 'Continue para o modo sem fim!') });
        speak(t('noites.say.win', 'Trinta noites! Vocês são heróis do acampamento!'), { cool: 1000, urgent: true });
        break;
      case 'rescue': {
        const lv = BENCH_BABIES.findIndex((b, i) => i > 1 && b === e.n);
        bigMoment(t('noites.ev.rescue', 'Bebê resgatado!'), { sub: `${e.n}/${s.babies.length}`, color: '#ff8fd8', icon: 'heart' });
        speak(t('noites.say.rescue', 'Bebê resgatado! Que fofo!') + (lv > 1 ? ' ' + t('noites.say.unlock', 'Nova bancada liberada!') : ''), { cool: 500, urgent: true });
        sfx.sparkle();
        success();
        break;
      }
      case 'pickbaby':
        if (mine) speak(t('noites.say.carry', 'Ele vai te seguir! Leve o bebê até a fogueira.'), { cool: 3000, urgent: true });
        sfx.catch();
        break;
      case 'babylost':
        if (mine) speak(t('noites.say.babyLost', 'O bebê se assustou e voltou para o esconderijo.'), { cool: 3000 });
        break;
      case 'chest':
        if (mine) {
          notify(itemName(e.i ?? ''), { iconHtml: itemIcon(e.i ?? '', 18), kind: 'good' });
          speak(t('noites.say.chest', 'Baú aberto! Você ganhou {x}.', { x: itemName(e.i ?? '') }), { cool: 1500 });
        }
        if (near) sfx.fix();
        break;
      case 'craft':
        if (mine) {
          speak(t('noites.say.crafted', 'Pronto! {x}.', { x: itemName(e.i ?? '') }), { cool: 500, urgent: true });
          notify(itemName(e.i ?? ''), { iconHtml: itemIcon(e.i ?? '', 18), kind: 'good' });
          this.tut('craft');
          const d = ITEM[e.i ?? ''];
          if (d?.place || d?.throwLight || d?.food) speak(t('noites.say.inBar', 'Está nos seus itens, embaixo.'), { cool: 30000 });
        }
        sfx.fix();
        break;
      case 'need':
        if (mine) {
          const w = e.i ?? '';
          const msg =
            w === 'wood'
              ? t('noites.need.wood', 'Precisa de lenha! Corte árvores.')
              : w === 'space'
                ? t('noites.say.noSpace', 'Aqui não cabe. Tente outro lugar.')
                : w === 'grow'
                  ? t('noites.need.grow', 'Ainda está crescendo. Volte amanhã!')
                  : w === 'sun'
                    ? t('noites.need.sun', 'O painel carrega com o sol.')
                    : w === 'seat'
                    ? t('noites.need.seat', 'Não tem lugar livre.')
                    : w === 'camp'
                    ? t('noites.need.camp', 'Abasteça perto do acampamento ou da garagem.')
                    : w === 'carry'
                    ? t('noites.need.carry', 'Leve o bebê a pé até a fogueira.')
                    : w === 'garage'
                    ? t('noites.need.garage', 'Fique perto da garagem.')
                    : w === 'tier' || w === 'pot' || w === 'baby' || w === 'have'
                      ? whyText(w, ITEM.bench2, s)
                      : t('noites.why.res', 'Falta {x}.', { x: resName(w as Res) });
          speak(msg, { cool: 2500, urgent: true });
          sfx.bump();
        }
        break;
      case 'bagfull':
        if (mine) speak(t('noites.say.bagFull', 'Mochila cheia! O resto foi para o acampamento.'), { cool: 20000 });
        break;
      case 'firelow':
        speak(t('noites.say.fireLow', 'A fogueira está fraquinha! Ponha lenha!'), { cool: 25000 });
        break;
      case 'fireout':
        speak(t('noites.say.fireOut', 'A fogueira apagou! Ponha lenha rápido!'), { cool: 3000, urgent: true });
        bigMoment(t('noites.ev.fireOut', 'A fogueira apagou!'), { color: '#ff6a4a', icon: 'warning' });
        break;
      case 'hurt':
        if (mine) {
          tap('heavy');
          sfx.bump();
          if (e.i === 'cold') speak(t('noites.say.cold', 'Brrr, que frio! Volte para a fogueira.'), { cool: 15000 });
          else if (e.i === 'hungry') speak(t('noites.say.hungry', 'Que fome! Coma alguma coisa.'), { cool: 15000 });
          else speak(t('noites.say.hurt', 'Ai! Use a lanterna nas Sombrinhas!'), { cool: 12000 });
        }
        break;
      case 'faint':
        if (mine) speak(t('noites.say.faint', 'Você desmaiou de susto... voltando ao acampamento.'), { cool: 3000, urgent: true });
        break;
      case 'boss':
        speak(t('noites.say.boss', 'O Rei Sombrão chegou! Todos com as lanternas nele!'), { cool: 3000, urgent: true });
        bigMoment(t('noites.ev.bossCome', 'Rei Sombrão!'), { color: '#c08aff', icon: 'warning' });
        break;
      case 'bossdown':
        bigMoment(t('noites.ev.bossDown', 'O Rei Sombrão virou brilhinhos!'), { color: '#ffd34a', icon: 'sparkle' });
        speak(t('noites.say.bossDown', 'Conseguimos! O Rei Sombrão virou brilhinhos!'), { cool: 1000, urgent: true });
        sfx.sparkle();
        break;
      case 'bell':
        sfx.click();
        speak(t('noites.say.bell', 'O sininho tocou: Sombrinhas chegando!'), { cool: 15000 });
        break;
      case 'poof':
        if (near) sfx.poof();
        break;
      case 'chop':
        if (mine) this.tut('chop');
        break;
      case 'fell':
        if (near) sfx.thud();
        break;
      case 'take':
      case 'collect':
        if (mine || near) sfx.pick();
        break;
      case 'feed':
        if (mine) this.tut('feed');
        sfx.fire();
        break;
      case 'eat':
        if (mine) sfx.eat();
        break;
      case 'place':
        if (near) sfx.drop();
        break;
      case 'think':
        this.view?.bubble(e.p ?? '', 'think', 1.5);
        break;
      case 'ok':
        this.view?.bubble(e.p ?? '', BOT_ICON[e.i as BotCmd] ?? 'check', 2.5);
        sfx.catch();
        break;
      case 'deposit':
        if (mine) speak(t('noites.say.deposit', 'Guardado no acampamento!'), { cool: 40000 });
        break;
      case 'over':
        break;
      case 'bonk':
        if (near) sfx.boing();
        break;
      case 'trap':
        sfx.sparkle();
        break;
      case 'heal':
        if (mine) sfx.fix();
        break;
      case 'vbuild':
        if (mine) speak(t('noites.say.vbuild', 'Veículo montado! Chegue perto e toque para entrar.'), { cool: 1000, urgent: true });
        sfx.fix();
        break;
      case 'venter':
        if (mine) speak(t('noites.say.venter', 'Empurre o controle para frente para andar!'), { cool: 30000 });
        sfx.boing();
        break;
      case 'vload':
      case 'vlog':
        if (mine) speak(t('noites.say.vload', 'As toras foram para a caçamba!'), { cool: 20000 });
        sfx.thud();
        break;
      case 'unload':
        if (e.p === this.myId || near) speak(t('noites.say.unload', '{n} toras entregues no acampamento!', { n: e.n ?? 0 }), { cool: 4000 });
        sfx.sparkle();
        break;
      case 'nofuel':
        if (e.p === this.myId) speak(t('noites.say.nofuel', 'Sem combustível! Abasteça no acampamento.'), { cool: 8000, urgent: true });
        break;
      case 'vfuel':
        if (mine) speak(t('noites.say.vfuel', 'Tanque abastecido!'), { cool: 3000 });
        sfx.catch();
        break;
      case 'logfall':
        if (near) sfx.thud();
        break;
    }
  }
  private tut(k: 'chop' | 'feed' | 'craft'): void {
    if (this.save.tut[k]) return;
    this.save.tut[k] = true;
    writeSave(this.save);
  }

  /* ------------------------------ objetivo ------------------------------ */
  private objective(me: Player): { icon: string; text: string; x: number; z: number } | null {
    const s = this.sim!;
    const fr = s.fireR();
    const dF = Math.hypot(me.x, me.z);
    const nearestTree = () => {
      let b = -1;
      let bd = 1e9;
      s.w.trees.forEach((tr, i) => {
        if (s.treeT[i]) return;
        const d = Math.hypot(tr.x - me.x, tr.z - me.z);
        if (d < bd) (bd = d), (b = i);
      });
      return b >= 0 ? s.w.trees[b] : null;
    };
    const wood = (me.bag.wood ?? 0) + (s.stash.wood ?? 0);
    if (me.carry >= 0) return { icon: 'baby', text: t('noites.obj.carry', 'Leve o bebê para a fogueira'), x: 0, z: 0 };
    if (s.phase === 'night' && dF > Math.max(fr, 4) + 4 && s.litAt(me.x, me.z) <= 0) return { icon: 'fire', text: t('noites.obj.back', 'Volte para a luz!'), x: 0, z: 0 };
    if (s.fire.fuel < s.fire.max * 0.35) {
      if (wood > 0) return { icon: 'fire', text: t('noites.obj.feed', 'Ponha lenha na fogueira'), x: 0, z: 0 };
      const tr = nearestTree();
      if (tr) return { icon: 'axe', text: t('noites.obj.chop', 'Corte árvores para pegar lenha'), x: tr.x, z: tr.z };
    }
    if (!this.save.tut.chop) {
      const tr = nearestTree();
      if (tr) return { icon: 'axe', text: t('noites.obj.chop', 'Corte árvores para pegar lenha'), x: tr.x, z: tr.z };
    }
    if (!this.save.tut.feed && wood > 0) return { icon: 'fire', text: t('noites.obj.feed', 'Ponha lenha na fogueira'), x: 0, z: 0 };
    if (!this.save.tut.craft && (s.stash.wood ?? 0) >= 2) return { icon: 'craft', text: t('noites.obj.craft', 'Use a bancada para fazer coisas'), x: BENCH_POS[0], z: BENCH_POS[1] };
    if (s.phase === 'day') {
      // bebê perdido: o mais perto (com bússola, sempre; sem ela, só até 45 m)
      let bi = -1;
      let bd = 1e9;
      s.babies.forEach((b, i) => {
        if (b.st !== 0) return;
        const d = Math.hypot(b.x - me.x, b.z - me.z);
        if (d < bd) (bd = d), (bi = i);
      });
      if (bi >= 0 && (s.compass || bd < 45 || bi === s.babies.findIndex((b) => b.st === 0))) {
        const b = s.babies[bi];
        return { icon: 'baby', text: t('noites.obj.baby', 'Encontre o bebê perdido'), x: b.x, z: b.z };
      }
      let ci = -1;
      let cd = 50;
      s.w.chests.forEach((c, i) => {
        if (s.chestOpen[i]) return;
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        if (d < cd) (cd = d), (ci = i);
      });
      if (ci >= 0) return { icon: 'chest', text: t('noites.obj.chest', 'Abra o baú'), x: s.w.chests[ci].x, z: s.w.chests[ci].z };
      return { icon: 'wood', text: t('noites.obj.gather', 'Junte lenha e coisas para a noite'), x: 0, z: 0 };
    }
    return { icon: 'light', text: t('noites.obj.defend', 'Proteja a fogueira com a lanterna'), x: 0, z: 0 };
  }

  /* ------------------------------ laço ------------------------------ */
  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const el = now - this.last;
    this.last = now;
    if (this.paused && !this.net) return;
    const dt = Math.min(0.05, el / 1000);
    const w0 = performance.now();
    try {
      this.step(dt);
    } catch (e) {
      console.error('[noites]', e);
    }
    this.view?.render();
    this.gov.sample(el, performance.now() - w0);
  };

  private step(dt: number): void {
    const s = this.sim;
    const v = this.view;
    const hud = this.hud;
    const ctl = this.ctl;
    if (!s || !v || !hud || !ctl) return;
    const me = this.me;
    // olhar
    const [dy, dp] = ctl.consumeLook(dt);
    v.camYaw -= dy;
    v.camPitch = Math.max(0.05, Math.min(1.2, v.camPitch + dp * 0.8));
    // dirigir
    const vNow = me && me.seat >= 0 ? s.vehView.find((q) => q.id === me.seat) : undefined;
    if (me && vNow) {
      const [rx, fw] = this.garage ? [0, 0] : ctl.dir();
      const thr = Math.abs(fw) > 0.12 ? fw : 0;
      const steer = Math.abs(rx) > 0.1 ? rx : 0;
      this.driveIn = [thr, steer];
      if (!this.isClient) s.drive(this.myId, thr, steer);
      // câmera volta para trás do veículo quando ninguém mexe
      const vy = Math.atan2(2 * (vNow.q[1] * vNow.q[3] + vNow.q[0] * vNow.q[2]), 1 - 2 * (vNow.q[1] * vNow.q[1] + vNow.q[0] * vNow.q[0]));
      this.camAuto = dy || dp ? 1.5 : this.camAuto - dt;
      if (this.camAuto <= 0 && Math.abs(vNow.speed) > 1) v.camYaw += Math.atan2(Math.sin(vy - v.camYaw), Math.cos(vy - v.camYaw)) * Math.min(1, dt * 2.5);
      const d = s.designs.get(vNow.dk);
      const st = d ? stats(d) : null;
      hud.setDrive(st ? { fuel: st.fuelCap ? vNow.fuel / st.fuelCap : 1, inf: !st.energy, load: vNow.logs.length / 7, cap: st.cap } : null);
    } else hud.setDrive(null);
    // andar
    if (me && me.faint <= 0 && !hud.crafting && !vNow && !this.garage) {
      const [rx, fw] = ctl.dir();
      const yaw = v.camYaw;
      const mx = Math.sin(yaw) * fw - Math.cos(yaw) * rx;
      const mz = Math.cos(yaw) * fw + Math.sin(yaw) * rx;
      const m = Math.hypot(mx, mz);
      const boots = me.wear.feet ? ITEM[me.wear.feet].wear!.speed ?? 0 : 0;
      const sp = SPEED * (1 + boots) * (me.carry >= 0 ? 0.9 : 1);
      if (m > 0.05) {
        [me.x, me.z] = s.collide(me.x + mx * sp * dt, me.z + mz * sp * dt, 0.4);
        if (!me.lightOn) me.yaw = Math.atan2(mx, mz);
      }
      // mira da lanterna: câmera, com ajuda para a Sombrinha mais perto
      if (me.lightOn) {
        let aim = yaw;
        const [range] = s.lamp(me);
        let bd = 0.65;
        for (const c of s.creatures) {
          const d = Math.hypot(c.x - me.x, c.z - me.z);
          if (d > range + 2) continue;
          let da = Math.atan2(c.x - me.x, c.z - me.z) - yaw;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < bd) (bd = Math.abs(da)), (aim = yaw + da);
        }
        me.aim += Math.atan2(Math.sin(aim - me.aim), Math.cos(aim - me.aim)) * Math.min(1, dt * 10);
        me.yaw = me.aim;
      } else me.aim = me.yaw;
      if (me.swing > 0 && this.isClient) me.swing = Math.max(0, me.swing - dt);
    }
    // simulação
    if (!this.isClient) {
      s.step(dt);
      for (const e of s.events) if (e.s > this.evSeen) this.onEvent(e);
      this.evSeen = s.evHead;
      if (this.net?.isHost) {
        this.sendT -= dt;
        this.fullT -= dt;
        if (this.sendT <= 0) {
          this.sendT = 1 / SNAP_HZ;
          const full = this.fullT <= 0;
          if (full) this.fullT = 3;
          this.net.send(encode(s, this.snap, full));
        }
      }
    } else if (me) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / SNAP_HZ;
        this.net!.send({ t: 'i', x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, yaw: Math.round(me.yaw * 100) / 100, aim: Math.round(me.aim * 100) / 100, l: me.lightOn ? 1 : 0, th: Math.round(this.driveIn[0] * 100) / 100, sr: Math.round(this.driveIn[1] * 100) / 100 });
      }
    }
    if (this.net) hud.setCode(this.code, s.players.length);
    // alvo e botão de ação
    this.target = me && me.faint <= 0 && me.seat < 0 ? this.findTarget(me) : null;
    this.updAction(me);
    // câmera
    if (me && vNow) v.placeCamera(vNow.x, vNow.z, dt, vNow.y - 0.6, 9.5);
    else if (me) v.placeCamera(me.x, me.z, dt, s.w.height(me.x, me.z));
    const focus: Focus | null = this.target ? { x: this.target.x, z: this.target.z, r: this.target.r } : null;
    v.update(dt, me ?? null, focus, this.ghost(), me?.x ?? 0, me?.z ?? 0);
    // HUD
    if (me) {
      hud.setStats(me, s);
      const ni = nightInfo(s.night);
      hud.setPhase(s, s.phase === 'day' ? DAY_LEN : NIGHT_LEN, s.phase === 'night' ? (ni.boss ? 'warning' : ni.fog ? 'think' : ni.moon ? 'star' : '') : '');
      hud.setHotbar(this.hotItems());
      this.objT -= dt;
      if (this.objT <= 0) {
        this.objT = 0.25;
        this.updObjective(me);
      }
      if (hud.crafting) {
        const key = JSON.stringify(s.stash) + s.bench + JSON.stringify(me.wear) + me.axe + me.lampId + me.bonk + s.rescued;
        if (key !== this.craftKey) {
          this.craftKey = key;
          hud.renderCraft(s, me);
        }
        if (Math.hypot(me.x - BENCH_POS[0], me.z - BENCH_POS[1]) > 5) hud.closeCraft();
      }
    }
    if (this.garage) {
      const gk = JSON.stringify(s.stash) + s.bench + s.designs.size;
      if (gk !== this.garageKey) {
        this.garageKey = gk;
        this.garage.refresh();
      }
      if (me && !s.nearGarage(me.x, me.z, 7)) this.closeGarage();
    }
    s.logCap = [20, 30, 45, 60][this.gov.tier];
    if (s.veh) s.veh.maxLogs = s.logCap;
    if (s.phase === 'night' !== this.wasNight) {
      this.wasNight = s.phase === 'night';
      audio.setIntensity(this.wasNight ? 0.6 : 0);
    }
    if (s.over && !this.resultShown) this.showResult();
  }

  private updAction(me: Player | undefined): void {
    const hud = this.hud!;
    const tg = this.target;
    const s = this.sim!;
    if (me && me.seat >= 0) return hud.setAction('exit', t('noites.do.vexit', 'Descer'), t('noites.do.vexitS', 'Descer do veículo'), '#2a0b5c');
    if (!me || !tg) {
      if (me && me.bonk > 0 && s.dark) hud.setAction('hammer', '', t('noites.say.bonk', 'Martelada!'));
      else hud.setAction('hand', '', '');
      return;
    }
    switch (tg.k) {
      case 'tree':
        return hud.setAction('axe', t('noites.do.chop', 'Cortar'), t('noites.do.chopS', 'Cortar a árvore'));
      case 'node': {
        const n = s.w.nodes[tg.i];
        const r = Object.keys(NODE_GIVES[n.k])[0] as Res;
        return hud.setAction(r, t('noites.do.take', 'Pegar'), t('noites.do.takeS', 'Pegar {x}', { x: resName(r) }));
      }
      case 'chest':
        return hud.setAction('chest', t('noites.do.chest', 'Abrir'), t('noites.do.chestS', 'Abrir o baú'));
      case 'baby':
        return hud.setAction('baby', t('noites.do.baby', 'Resgatar'), t('noites.do.babyS', 'Resgatar o bebê'));
      case 'fire':
        return hud.setAction('wood', t('noites.do.feed', 'Lenha'), t('noites.do.feedS', 'Pôr lenha na fogueira'), (me.bag.wood ?? 0) + (s.stash.wood ?? 0) > 0 ? '' : '#9a9aa0');
      case 'bench':
        return hud.setAction('craft', t('noites.do.bench', 'Bancada'), t('noites.do.benchS', 'Abrir a bancada'));
      case 'proc': {
        const st = s.structs.find((q) => q.id === tg.i);
        return hud.setAction(st ? ITEM[st.k].icon : 'hand', t('noites.do.use', 'Usar'), st ? t('noites.do.useS', 'Usar {x}', { x: ITEM[st.k].n() }) : '', st ? ITEM[st.k].col : '');
      }
      case 'pick':
        return hud.setAction('pick', t('noites.do.pick', 'Guardar'), t('noites.do.pickS', 'Pegar de volta'));
      case 'garage':
        return hud.setAction('garage', t('noites.do.garage', 'Garagem'), t('noites.do.garageS', 'Abrir a garagem'));
      case 'veh': {
        const v = s.vehView.find((q) => q.id === tg.i);
        const d = v && s.designs.get(v.dk);
        const nm = d ? vName(d) : '';
        if (tg.sub === 'load') return hud.setAction('cargo', t('noites.do.vload', 'Carregar'), t('noites.do.vloadS', 'Pôr a lenha na caçamba'));
        if (tg.sub === 'fuel') return hud.setAction('gas', t('noites.do.vfuel', 'Abastecer'), t('noites.do.vfuelS', 'Abastecer o veículo'));
        return hud.setAction('car', t('noites.do.venter', 'Entrar'), t('noites.do.venterS', 'Entrar: {x}', { x: nm }), d?.col);
      }
    }
  }

  private updObjective(me: Player): void {
    const hud = this.hud!;
    const v = this.view!;
    const o = this.objective(me);
    if (!o) {
      hud.setObjective('star', '', null);
      hud.hideMarker();
      return;
    }
    const dx = o.x - me.x;
    const dz = o.z - me.z;
    const d = Math.hypot(dx, dz);
    let rel = Math.atan2(dx, dz) - v.camYaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const deg = (-rel * 180) / Math.PI;
    hud.setObjective(o.icon, o.text, d > 3 ? deg : null);
    if (o.text !== this.lastBlock) {
      this.lastBlock = o.text;
      speak(o.text, { cool: 20000 });
    }
    if (d < 3) return hud.hideMarker();
    const p = v.project(o.x, 2.2, o.z);
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    if (p.front && p.x > 40 && p.x < w - 40 && p.y > 70 && p.y < h - 40) hud.setMarker(p.x, p.y, o.icon, false, 0);
    else {
      const a = (deg * Math.PI) / 180;
      hud.setMarker(w / 2 + Math.sin(a) * (w / 2 - 70), h / 2 - Math.cos(a) * (h / 2 - 70), o.icon, true, deg);
    }
  }

  /* ------------------------------ fim ------------------------------ */
  private coinsFor(s: Sim): number {
    const base = s.survived * 12 + s.rescued * 15 + Math.floor(s.poofs / 3);
    const pet = (window as unknown as { petCoinBonus?: (c: number) => number }).petCoinBonus;
    const c = Math.min(500, base);
    return c + (pet ? pet(c) : 0);
  }
  private showResult(): void {
    const s = this.sim!;
    this.resultShown = true;
    const coins = this.coinsFor(s);
    const rec = s.survived > this.save.best;
    const newHats = HATS.filter((h) => h.need > this.save.best && h.need <= s.survived);
    if (rec) this.save.best = s.survived;
    writeSave(this.save);
    if (coins > 0) addCoins(coins);
    reportRun({ game: GAME_ID, score: s.survived, coins, durationSec: Math.round((performance.now() - this.started) / 1000), won: s.survived >= GOAL_NIGHTS, stats: { nights: s.survived, babies: s.rescued, poofs: s.poofs } });
    audio.cash();
    const r = document.createElement('div');
    r.className = 'nc-result';
    r.innerHTML = `
      <div class="num">${ic('moon', 64)}${s.survived}</div>
      ${rec ? `<div class="row">${ic('star', 34)}${esc(t('noites.res.record', 'Novo recorde!'))}</div>` : ''}
      <div class="row"><span>${ic('baby', 34)} ${s.rescued}</span><span>${ic('spark', 34)} ${s.poofs}</span><span>${ic('coin', 34, '#ffcf2e')} +${coins}</span></div>
      ${newHats.length ? `<div class="row">${newHats.map((h) => ic(HAT_ICON[h.id] ?? 'star', 40, h.col)).join('')}</div>` : ''}
      <div class="row">
        <button class="nc-btn red round" data-r="exit" style="width:72px;height:72px" data-say="${esc(t('noites.say.exit', 'Sair'))}">${ic('exit', 34)}</button>
        ${this.isClient ? '' : `<button class="nc-btn green round" data-r="again" style="width:88px;height:88px" data-say="${esc(t('noites.say.again', 'Jogar de novo'))}">${ic('rotate', 44, '#0a3a1a')}</button>`}
      </div>`;
    this.wrap.appendChild(r);
    speak(t('noites.say.over', 'A fogueira apagou. Vocês sobreviveram {n} noites!', { n: s.survived }) + (rec ? ' ' + t('noites.res.record', 'Novo recorde!') : ''), { cool: 1000, urgent: true });
    r.querySelectorAll<HTMLElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.click();
        if (b.dataset.r === 'exit') this.finish(false);
        else this.newSim(Math.floor(Math.random() * 1e9));
      }),
    );
  }
  private askExit(): void {
    const s = this.sim;
    if (s && !s.over && !this.resultShown && s.survived > 0 && !this.isClient) {
      s.over = true; // registra o que conseguiu
      return;
    }
    this.finish(false);
  }
  /** volta ao menu do jogo (ou ao hub) */
  private finish(toMenu: boolean): void {
    cancelAnimationFrame(this.raf);
    this.net?.close();
    this.net = null;
    this.sim = null;
    this.teardownRun();
    clearNotify();
    resetNotifyTop();
    stopSpeak();
    if (toMenu) this.showMenu();
    else this.exitCb();
  }

  inMatch(): boolean {
    return !!this.sim && !this.sim.over;
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.net?.close();
    this.teardownRun();
    for (const f of this.offs) f();
    clearNotify();
    resetNotifyTop();
    stopSpeak();
    audio.setIntensity(0);
    disposeSfx();
    this.wrap.remove();
  }
}

const HAT_ICON: Record<string, string> = { leaf: 'fiber', acorn: 'pumpkin', mush: 'mush', star: 'star', crown: 'spark', moon: 'moon', sun: 'sun' };
const BOT_ICON: Record<BotCmd, string> = { follow: 'follow', stay: 'stay', wood: 'axe', guard: 'guard' };
void bagCount;
void TAU;
