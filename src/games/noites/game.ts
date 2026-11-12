/* ============================================================
 *  NOITES DO ACAMPAMENTO — partida: menu (sozinho / criar sala /
 *  entrar, ajudantes, dificuldade), laço, 1ª pessoa (padrão) ou
 *  3ª pessoa, mira no centro, barra de itens, arremesso, objetivos
 *  com setas, falas, salvamento e o online host-autoritativo.
 * ============================================================ */
import * as THREE from 'three';
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
import { BENCH_BABIES, BENCH_POS, CAMP_R, CHEST_POS, CK, DAY_LEN, GAME_ID, FIRE_TIME, GOAL_NIGHTS, HATS, HOT, ITEM, NIGHT_LEN, RAW_FOOD, RELIGHT, resName, type Res } from './data';
import { FIRE_MOUTH, Sim, type Action, type BotCmd, type Ev, type Player, type RunSave } from './sim';
import { NODE_GIVES, NK, treeR } from './world';
import { CUT_Y, View, type Focus, type Ghost } from './view';
import { Hud, esc, itemIcon, itemName, whyText } from './hud';
import { ic } from './icons';
import { setVoice, speak, stopSpeak, voiceOn } from './speak';
import { Garage } from './garage';
import { stats, vName, type VDesign } from './vehicles';
import { NightsNet, apply, encode, guestLoot, newSnapState, roomCode, type GuestMsg, type Peer, type SnapState } from './net';
import { bestAxe, countOf, heldKind, isRes } from './items';
import { BuildController } from './build/controller'; // BUILD
import { CamView } from '../../3d/camview';
import { PIECE } from './build/pieces'; // BUILD
import { consumePartySeat, partyRoomFor, partySeat } from '../../party/contract';
import { joinStr, reportPlaying, stopPlaying } from '../../party/join';
import { openStartMenu, type SmPage } from '../../ui/startmenu';

/* ------------------------------ save ------------------------------ */
interface NSave {
  best: number;
  hat: string;
  /** ajudantes escolhidos no menu (0 = sozinho, padrão) */
  helpers: number;
  /** câmera: 1ª pessoa (padrão) ou 3ª */
  cam: 'fp' | 'tp';
  /** dificuldade 0 fácil / 1 normal / 2 difícil */
  diff: number;
  runs: number;
  tut: { chop?: boolean; feed?: boolean; craft?: boolean; pick?: boolean };
}
const SKEY = 'noites-save';
const RKEY = 'noites-run';
function loadSave(): NSave {
  const def: NSave = { best: 0, hat: 'leaf', helpers: 0, cam: 'fp', diff: 1, runs: 0, tut: {} };
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) ?? 'null');
    // `bots` antigo é ignorado: ajudantes nunca vêm por padrão
    if (s && typeof s.best === 'number') return { ...def, ...s, helpers: typeof s.helpers === 'number' ? Math.max(0, Math.min(4, s.helpers)) : 0, cam: s.cam === 'tp' ? 'tp' : 'fp' };
  } catch {
    /* */
  }
  return def;
}
function writeSave(s: NSave): void {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* */
  }
}
function loadRun(): RunSave | null {
  try {
    const r = JSON.parse(localStorage.getItem(RKEY) ?? 'null');
    if (r && r.v === 1 && typeof r.seed === 'number') return r as RunSave;
  } catch {
    /* */
  }
  return null;
}
function clearRun(): void {
  try {
    localStorage.removeItem(RKEY);
  } catch {
    /* */
  }
}

type TK = 'tree' | 'node' | 'chest' | 'baby' | 'proc' | 'pick' | 'garage' | 'loot' | 'felled' | 'store' | 'haul' | 'veh' | 'fire' | 'bench';
interface Target {
  k: TK;
  i: number;
  x: number;
  z: number;
  /** raio do contorno no chão */
  r: number;
  sub?: 'enter' | 'load' | 'fuel';
}
/** candidato a alvo: cilindro vertical (x,z,raio) entre y0 e y1, alcance e prioridade */
interface Cand {
  tg: Target;
  y0: number;
  y1: number;
  rr: number;
  reach: number;
  prio: number;
}

const SPEED = 5.2;
const SNAP_HZ = 12;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _h = new THREE.Vector3();

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new NoitesGame(root, exit);
  g.showMenu();
  // grupo (docs/PARTY.md): o líder cria a sala (código = o dele) e os outros entram sozinhos
  const seat = partySeat('noites');
  if (seat) {
    consumePartySeat('noites');
    void g.partyStart(seat.host, seat.leader, seat.direct ? seat.code() : '');
  }
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
  private menuEl: HTMLElement | null = null;
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
  private saveT = 0;
  private lastLook: [number, number] = [0, 0];
  private walkSpeed = 0;
  private bobT = 0;
  private stepT = 0;
  private runSave: RunSave | null = null;
  /** construção em grade (API para o inventário: build.enterPlacement/rotate/place/cancel...) */
  build: BuildController | null = null; // BUILD

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
    const vis = () => document.hidden && this.autosave();
    document.addEventListener('visibilitychange', vis);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', rs);
      document.removeEventListener('visibilitychange', vis);
    });
  }

  get me(): Player | undefined {
    return this.sim?.player(this.myId);
  }
  private get isClient(): boolean {
    return !!this.net && !this.net.isHost;
  }
  /** câmera compartilhada (src/3d/camview.ts): 1ª → 3ª atrás → 3ª de frente; lembrada por jogo */
  private camv = new CamView('noites', loadSave().cam === 'tp' ? 'tp' : 'fp');
  private get fp(): boolean {
    return this.camv.mode === 'fp';
  }

  /* ------------------------------ menu ------------------------------ */
  showMenu(): void {
    this.menuEl?.remove();
    const run = loadRun();
    const diffs = [t('noites.diff.easy', 'Fácil'), t('noites.diff.normal', 'Normal'), t('noites.diff.hard', 'Difícil')];
    const sm = openStartMenu(this.wrap, {
      game: 'noites',
      chips: [{ icon: ic('moon', 20), text: `${this.save.best}/${GOAL_NIGHTS}` }],
      onBack: () => this.exitCb(),
      settings: (p) => this.menuSettings(p, () => sm.refresh()),
      build: (p) => {
        const H = this.save.helpers;
        const sum = [diffs[this.save.diff] ?? '', H ? t('noites.menu.bots', '{n} ajudantes', { n: H }) : t('noites.menu.aloneS', 'Sozinho')].join(' · ');
        if (run)
          p.play({
            label: t('noites.menu.contS', 'Continuar'),
            sub: t('noites.menu.nightN', 'Noite {n}', { n: run.night }) + ' · ' + sum,
            tone: 'green',
            say: t('noites.menu.cont', 'Continuar a partida'),
            onTap: () => {
              this.runSave = loadRun();
              this.startSolo();
            },
          });
        p.faces(
          diffs.map((n, k) => ({ id: k, level: k, label: n })),
          this.save.diff,
          (id) => {
            this.save.diff = +id;
            writeSave(this.save);
            sm.refresh();
          },
        );
        const fresh = () => {
          clearRun();
          this.runSave = null;
          this.startSolo();
        };
        if (run) p.cards([{ icon: ic('plus', 40), label: t('noites.menu.newS', 'Nova partida'), say: t('noites.menu.solo', 'Jogar sozinho'), color: '#ffcf6b', onTap: fresh }], { size: 'small', cols: 1 });
        else p.play({ sub: sum, say: t('noites.menu.solo', 'Jogar sozinho'), onTap: fresh });
        p.friends({ game: 'noites', say: t('noites.menu.friends', 'Jogar com amigos'), onTap: () => void this.startHost() });
        p.link(t('fp.code', 'Entrar com código / QR'), () => this.showJoin());
      },
    });
    this.menuEl = sm.el;
    speak(t('noites.say.welcome', 'Noites do Acampamento! Toque no botão amarelo para jogar.'), { cool: 60000 });
  }

  /** folha de ajustes do menu: ajudantes e chapéu */
  private menuSettings(p: SmPage, again: () => void): void {
    const H = this.save.helpers;
    p.label(t('noites.menu.helpers', 'Com ajudantes'), ic('baby', 20, '#8ad8ff'));
    p.cards(
      [0, 1, 2, 3, 4].map((n) => ({
        label: n ? String(n) : t('noites.menu.aloneS', 'Sozinho'),
        icon: n ? ic('baby', 40, '#8ad8ff') : ic('person', 40),
        say: n ? t('noites.menu.bots', '{n} ajudantes', { n }) : t('noites.menu.alone', 'Sozinho, sem ajudantes'),
        sel: H === n,
        onTap: () => {
          this.save.helpers = n;
          writeSave(this.save);
          p.refresh();
          again();
        },
      })),
      { cols: 5 },
    );
    p.label(t('noites.menu.hat', 'Chapéu'), ic('star', 20));
    p.cards(
      HATS.map((h) => {
        const lock = this.save.best < h.need;
        return {
          label: h.n(),
          icon: h.id === 'none' ? ic('close', 40, '#2a0b5c') : ic(HAT_ICON[h.id] ?? 'star', 44, h.col),
          lock: lock ? ic('moon', 14) + h.need : false,
          sel: this.save.hat === h.id,
          onTap: () => {
            this.save.hat = h.id;
            writeSave(this.save);
            p.refresh();
          },
        };
      }),
      { cols: 4 },
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
    this.newSim(this.runSave?.seed ?? Math.floor(Math.random() * 1e9));
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
  /** grupo: anfitrião = líder; convidados tentam por ~30 s até o líder abrir a sala */
  async partyStart(host: boolean, leader: string, direct = ''): Promise<void> {
    if (host || (!leader && !direct)) return this.startHost();
    const code = direct || roomCode(leader);
    for (let i = 0; i < 25 && !this.destroyed && !this.net; i++) {
      const p = await this.me4net();
      const net = new NightsNet();
      const r = p ? await net.connect(code, p, false) : 'offline';
      if (r === 'ok' && p) return this.startJoin(code, { net, p });
      net.close();
      if (r !== 'no_host') return this.netFail(r);
      await new Promise((res) => setTimeout(res, 1200));
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
    this.runSave = null;
    this.newSim(Math.floor(Math.random() * 1e9));
    speak(t('noites.say.hostedF', 'Sala criada! Chame seus amigos.'), { cool: 1000, urgent: true });
    reportPlaying('noites', this.code);
    // grupo: ninguém precisa chamar (já vem todo mundo); sozinho: abre a lista de amigos com "Chamar"
    if (!partyRoomFor('noites'))
      void import('../../party/friends-play').then((f) => {
        if (!this.destroyed) void f.openCallFriends({ game: 'noites', j: joinStr('noites', this.code), root: this.wrap });
      });
  }
  private async startJoin(code: string, ready?: { net: NightsNet; p: Peer }): Promise<void> {
    const p = ready ? ready.p : await this.me4net();
    const net = ready ? ready.net : new NightsNet();
    const r = ready ? 'ok' : p ? await net.connect(code, p, false) : 'offline';
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
    s.diff = this.save.diff;
    s.addPlayer(this.myId, this.myName, appSave.skin, this.save.hat);
    // ajudantes só se o jogador pediu (o anfitrião escolhe também no online)
    const res = this.runSave;
    const nb = res ? res.helpers : this.save.helpers;
    s.helpers = nb;
    for (let i = 0; i < nb; i++) s.addPlayer('bot' + i, t('noites.botName', 'Ajudante {n}', { n: i + 1 }), 'bloop', 'none', true);
    this.botsN = nb;
    if (res && res.seed === seed) {
      s.loadSave(res, this.myId);
      speak(t('noites.say.resume', 'Bem-vindo de volta! Noite {n}.', { n: s.night }), { cool: 1000, urgent: true });
    } else speak(t('noites.say.start2', 'Dia 1! Corte árvores, pegue as toras e jogue na fogueira. À noite, fique na luz!'), { cool: 1000, urgent: true });
    this.runSave = null;
    this.buildScene();
    this.save.runs++;
    writeSave(this.save);
  }

  private buildScene(): void {
    const s = this.sim!;
    this.view = new View(this.wrap, s, this.gov.tier);
    this.view.firstPerson = this.fp;
    this.view.onFallHit = (x, z) => this.near(x, z) && sfx.thud();
    this.ctl = new FpsControls(this.wrap, { joystick: { zoneTop: 0.22, zoneWidth: 0.42 }, keyboard: true });
    this.hud = new Hud(this.wrap, {
      action: () => this.doAction(),
      throw: () => this.doThrow(),
      sel: (i) => this.select(i),
      drop: (i) => this.send({ a: 'drop', s: i }),
      place: (k) => this.placeCmd(k),
      craft: (id) => this.send({ a: 'craft', id }),
      bot: (c) => this.send({ a: 'cmd', c }),
      exit: () => this.askExit(),
      voice: () => {
        setVoice(!voiceOn());
        this.hud?.setVoice(voiceOn());
      },
      bag: () => this.me && this.sim && this.hud?.openInv(this.sim, this.me),
      panelOpen: (on) => this.ctl?.show(!on),
      swap: (i, j) => this.send({ a: 'swap', i, j }),
      store: (i) => this.send({ a: 'store', s: i }),
      storeAll: () => this.send({ a: 'storeall' }),
      unstore: (id) => this.send({ a: 'unstore', id }),
    });
    this.hud.setVoice(voiceOn());
    // botão de câmera no topo (componente compartilhado)
    this.camv.onChange = () => this.camChanged();
    const right = this.wrap.querySelector('.nc-right') as HTMLElement;
    const cb = this.camv.mountButton(right, { cls: 'nc-btn round nc-cam', label: t('noites.say.cam', 'Trocar câmera') });
    right.insertBefore(cb, right.querySelector('[data-b="voice"]'));
    this.hud.showBotsBtn(this.botsN > 0 || s.players.some((p) => p.bot));
    // BUILD: modo construção
    this.build = new BuildController({
      wrap: this.wrap,
      sim: () => this.sim,
      view: () => this.view,
      me: () => this.me,
      send: (a) => this.send(a),
      busy: () => !this.me || this.me.faint > 0 || this.me.seat >= 0 || !!this.hud?.panel || !!this.garage || !!this.placing,
    });
    const top = this.wrap.querySelector('.nc-top') as HTMLElement;
    setNotifyTop(top.getBoundingClientRect().bottom + 4);
    const me = this.me!;
    this.view.camYaw = me.yaw;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }
  private toggleCam(): void {
    this.camv.cycle();
  }
  /** colisão da câmera de 3ª pessoa: encosta antes de árvores/pedras (fração livre 0..1) */
  private camBlock(x0: number, z0: number, x1: number, z1: number): number {
    const s = this.sim!;
    for (let i = 1; i <= 8; i++) {
      const k = i / 8;
      const x = x0 + (x1 - x0) * k;
      const z = z0 + (z1 - z0) * k;
      const [cx, cz] = s.collide(x, z, 0.3);
      if (Math.hypot(cx - x, cz - z) > 0.05) return Math.max(0.15, (i - 1) / 8);
    }
    return 1;
  }
  /** a câmera mudou (botão do topo ou tecla C) */
  private camChanged(): void {
    if (this.view) this.view.firstPerson = this.fp;
    const m = this.camv.mode;
    speak(m === 'fp' ? t('noites.say.camFp', 'Ver pelos olhos') : m === 'tp' ? t('noites.say.camTp', 'Ver de fora') : t('noites.say.camFront', 'Ver de frente'), { cool: 500, urgent: true });
    sfx.click();
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
    this.build?.dispose(); // BUILD
    this.build = null;
  }
  /** salva a partida (solo/anfitrião) para continuar depois */
  private autosave(): void {
    const s = this.sim;
    if (!s || this.isClient || s.over || this.resultShown) return;
    try {
      localStorage.setItem(RKEY, JSON.stringify(s.toSave(this.myId)));
    } catch {
      /* */
    }
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
              [p.x, p.z] = [x, z];
              p.yaw = +g.yaw || 0;
              p.aim = +g.aim || 0;
              const h = (Number(g.h) | 0) % HOT;
              if (h >= 0) p.sel = h;
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
        const keep = me ? { x: me.x, z: me.z, yaw: me.yaw, aim: me.aim } : null;
        apply(this.sim, o, this.myId);
        for (const e of (o.ev as Ev[]) ?? []) {
          if (e.k === 'respawn' && e.p === this.myId && keep) [keep.x, keep.z] = [e.x ?? 0, e.z ?? 0];
          this.onEvent(e);
        }
        const me2 = this.me;
        if (me2 && keep && me2.seat < 0 && !(o.ev as Ev[] | undefined)?.some((e) => e.k === 'vexit' && e.p === this.myId)) [me2.x, me2.z, me2.yaw, me2.aim] = [keep.x, keep.z, keep.yaw, keep.aim];
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
      if (e.code === 'KeyG' && !this.build?.active) this.doThrow();
      if (e.code === 'KeyC') this.toggleCam();
      if (e.code === 'KeyQ' && this.me) this.send({ a: 'drop', s: this.me.sel });
      // BUILD: B construir, R girar, G grade/livre, X desmontar, Esc sair
      if (e.code === 'KeyB') this.build?.toggle();
      if (this.build?.active) {
        if (e.code === 'KeyR') this.build.rotate();
        if (e.code === 'KeyG') this.build.toggleFree();
        if (e.code === 'KeyX') this.build.tool('del');
        if (e.code === 'Escape') this.build.cancel();
      }
      if (e.code === 'Tab' || e.code === 'KeyI') {
        e.preventDefault();
        if (this.me) this.hud.openInv(this.sim, this.me);
      }
      if (e.code === 'Escape') {
        this.hud.closeCraft();
        this.hud.closeInv();
      }
      if (/^Digit[1-6]$/.test(e.code)) this.select(+e.code.slice(5) - 1);
    }
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }
  /** troca o que está na mão (barra) */
  private select(i: number): void {
    const me = this.me;
    if (!me || i < 0 || i >= HOT) return;
    if (this.placing) this.placeCmd('no');
    me.sel = i;
    if (!this.isClient) this.sim!.act(this.myId, { a: 'sel', i });
    const id = me.slots[i]?.id;
    if (heldKind(id) === 'lamp') speak(t('noites.say.lightOn', 'Lanterna ligada! Aponte para as Sombrinhas.'), { cool: 30000 });
    sfx.click();
  }
  /** escolhe na barra o primeiro que serve (machado, lenha...) */
  private selectWhere(f: (id: string) => boolean): boolean {
    const me = this.me!;
    if (me.slots[me.sel] && f(me.slots[me.sel]!.id)) return true;
    for (let i = 0; i < HOT; i++) {
      const s = me.slots[i];
      if (s && f(s.id)) {
        this.select(i);
        return true;
      }
    }
    return false;
  }
  private heldId(): string | undefined {
    const me = this.me;
    return me ? me.slots[me.sel]?.id : undefined;
  }
  private yawNow(): number {
    return this.fp ? this.view!.camYaw : this.me!.yaw;
  }
  /** mira assistida: fogueira à frente, ou um amigo; senão para onde olha */
  private aimPoint(): { tx?: number; ty?: number; tz?: number; yaw: number; pitch: number } {
    const me = this.me!;
    const s = this.sim!;
    const yaw = this.yawNow();
    const pitch = this.fp ? this.view!.fpPitch : 0.15;
    const ang = (x: number, z: number) => Math.abs(Math.atan2(Math.sin(Math.atan2(x - me.x, z - me.z) - yaw), Math.cos(Math.atan2(x - me.x, z - me.z) - yaw)));
    const dF = Math.hypot(me.x, me.z);
    const id = this.heldId() ?? '';
    if (FIRE_TIME[id] && dF < 13 && (ang(0, 0) < (this.fp ? 0.55 : 1.1) || dF < 3)) return { tx: (Math.random() - 0.5) * 0.3, ty: 0.6, tz: (Math.random() - 0.5) * 0.3, yaw, pitch };
    let best: Player | null = null;
    let bd = 0.28;
    for (const p of s.players) {
      if (p.id === me.id || p.faint > 0) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d > 12 || d < 1) continue;
      const a = ang(p.x, p.z);
      if (a < bd) (bd = a), (best = p);
    }
    if (best) return { tx: best.x - Math.sin(yaw) * 0.6, ty: s.w.height(best.x, best.z) + 1.1, tz: best.z - Math.cos(yaw) * 0.6, yaw, pitch };
    return { yaw, pitch };
  }
  private doThrow(): void {
    const me = this.me;
    const s = this.sim;
    if (!me || !s || me.faint > 0 || me.seat >= 0 || this.hud?.panel) return;
    const id = this.heldId();
    const k = heldKind(id);
    if (!id || k === 'axe' || k === 'lamp' || k === 'bonk' || k === 'none') return;
    if (k === 'flare') return this.useFlare(id);
    const a = this.aimPoint();
    me.yaw = a.yaw;
    this.send({ a: 'throw', ...a });
    this.view?.fp.throwIt();
    sfx.throw();
    if (FIRE_TIME[id] && a.tx !== undefined) this.tut('feed');
  }
  private useFlare(id: string): void {
    const me = this.me!;
    const s = this.sim!;
    const yaw = this.yawNow();
    let tx = me.x + Math.sin(yaw) * 7;
    let tz = me.z + Math.cos(yaw) * 7;
    let nd = 13;
    for (const c of s.creatures) {
      const dd = Math.hypot(c.x - me.x, c.z - me.z);
      if (dd < nd) (nd = dd), (tx = c.x), (tz = c.z);
    }
    this.send({ a: 'use', id, x: tx, z: tz, r: 0 });
    this.view?.fp.throwIt();
    sfx.whoosh();
  }
  private ghost(): Ghost | null {
    const me = this.me;
    const s = this.sim;
    if (!this.placing || !me || !s) return null;
    const f = this.yawNow();
    const x = me.x + Math.sin(f) * 2.6;
    const z = me.z + Math.cos(f) * 2.6;
    const [cx, cz] = s.collide(x, z, 0.35);
    const ok = Math.hypot(cx - x, cz - z) < 0.05 && Math.hypot(x, z) > 1.8 && Math.hypot(x - BENCH_POS[0], z - BENCH_POS[1]) > 1.5 && Math.hypot(x - CHEST_POS[0], z - CHEST_POS[1]) > 1.3;
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

  /* ------------------------------ alvos ------------------------------ */
  /** tudo que dá para usar por perto */
  private cands(me: Player): Cand[] {
    const s = this.sim!;
    const W = s.w;
    const out: Cand[] = [];
    const H = (x: number, z: number) => W.height(x, z);
    const add = (tg: Target, rr: number, y0: number, y1: number, reach: number, prio: number) => {
      if (Math.abs(tg.x - me.x) > reach + rr + 1 || Math.abs(tg.z - me.z) > reach + rr + 1) return;
      out.push({ tg, rr, y0, y1, reach, prio });
    };
    s.babies.forEach((b, i) => b.st === 0 && me.carry < 0 && add({ k: 'baby', i, x: b.x, z: b.z, r: 0.8 }, 0.6, H(b.x, b.z), H(b.x, b.z) + 1, 3, 5));
    W.chests.forEach((c, i) => !s.chestOpen[i] && add({ k: 'chest', i, x: c.x, z: c.z, r: 0.9 }, 0.7, H(c.x, c.z), H(c.x, c.z) + 1, 2.8, 4));
    add({ k: 'fire', i: -1, x: 0, z: 0, r: 1.6 }, 1.1, 0, 2.2, 4.5, 3);
    add({ k: 'bench', i: -1, x: BENCH_POS[0], z: BENCH_POS[1], r: 1.3 }, 1, 0, 1.4, 3.2, 3);
    add({ k: 'store', i: -1, x: CHEST_POS[0], z: CHEST_POS[1], r: 1.1 }, 0.8, 0, 1.2, 3.2, 3);
    for (const l of s.loot) if (l.d <= 0 && (l.rest || !l.fire)) add({ k: 'loot', i: l.id, x: l.x, z: l.z, r: 0.45 }, 0.45, l.y - 0.25, l.y + 0.45, 3.2, 4.5);
    for (const f of s.felled) {
      if (f.age < 1) continue;
      const tr = W.trees[f.i];
      const h = 4.6 * tr.s;
      // o tronco deitado: vários pontos ao longo dele
      for (const k of [0.15, 0.35, 0.55]) {
        const x = tr.x + Math.sin(f.a) * h * k;
        const z = tr.z + Math.cos(f.a) * h * k;
        add({ k: 'felled', i: f.id, x, z, r: 0.6 }, 0.5 + tr.s * 0.25, H(x, z), H(x, z) + 1.2, 2.6, 2);
      }
    }
    for (const bp of s.build.pieces) if (bp.k === PIECE.chest.idx) add({ k: 'store', i: -1, x: bp.x, z: bp.z, r: 0.9 }, 0.7, 0, 1, 3, 3); // BUILD: baú construído = baú do acampamento
    for (const bp of s.build.pieces) if (bp.k === PIECE.bench.idx) add({ k: 'bench', i: -1, x: bp.x, z: bp.z, r: 1.2 }, 1, 0, 1.4, 3.2, 3); // BUILD: bancada extra
    for (const st of s.structs) {
      const d = ITEM[st.k]?.place;
      const kind = d?.kind;
      const y = H(st.x, st.z);
      if (kind === 'kiln' || kind === 'still' || kind === 'charger' || kind === 'solar' || kind === 'garden' || kind === 'berrybed') add({ k: 'proc', i: st.id, x: st.x, z: st.z, r: 1 }, 0.8, y, y + 1.4, 2.8, 2);
      else if (kind === 'torch' && st.burn <= 0) add({ k: 'pick', i: st.id, x: st.x, z: st.z, r: 0.6 }, 0.4, y, y + 1.8, 2.4, 1);
      else if (d?.shows) add({ k: 'store', i: st.id, x: st.x, z: st.z, r: 1 }, 0.8, y, y + 1.5, 3, 3);
      else if (d?.haul && st.by !== me.id && !st.by) add({ k: 'haul', i: st.id, x: st.x, z: st.z, r: 1 }, 0.8, y, y + 1.1, 2.8, 3);
      else if (st.k === 'garage') add({ k: 'garage', i: st.id, x: st.x, z: st.z, r: 1.8 }, 1.6, y, y + 2.4, 4, 2.5);
    }
    for (const v of s.vehView) {
      const d = s.designs.get(v.dk);
      if (!d) continue;
      const st = stats(d);
      const free = !v.driver || v.riders.length < d.seats - 1;
      const wood = countOf(me.slots, 'wood');
      const sub: 'enter' | 'load' | 'fuel' = wood > 0 && st.cap > v.logs.length / 7 ? 'load' : st.energy && v.fuel < st.fuelCap * 0.6 && s.avail(st.energy, me) > 0 && (Math.hypot(v.x, v.z) < CAMP_R + 8 || !!s.nearGarage(v.x, v.z, 10)) ? 'fuel' : 'enter';
      if (sub === 'enter' && !free) continue;
      add({ k: 'veh', i: v.id, x: v.x, z: v.z, r: st.l / 2 + 0.4, sub }, st.l / 2, v.y - 0.5, v.y + 1.5, st.lt / 2 + 2.6, 3.5);
    }
    W.each(me.x, me.z, (i) => {
      if (i >= 0) {
        if (s.treeT[i]) return;
        const tr = W.trees[i];
        const y = H(tr.x, tr.z);
        add({ k: 'tree', i, x: tr.x, z: tr.z, r: treeR(tr) + 0.5 }, treeR(tr), y, y + 4 * tr.s, treeR(tr) + 2.1, 0);
      } else if (i > -100000) {
        const n = -1 - i;
        if (!s.nodeT[n]) add({ k: 'node', i: n, x: W.nodes[n].x, z: W.nodes[n].z, r: 0.9 }, 0.8, H(W.nodes[n].x, W.nodes[n].z), H(W.nodes[n].x, W.nodes[n].z) + 1, 2.8, 1);
      }
    });
    // nós sem colisão (arbustos, capim...) não estão na grade
    W.nodes.forEach((n, i) => {
      if (s.nodeT[i] || Math.abs(n.x - me.x) > 3.4 || Math.abs(n.z - me.z) > 3.4) return;
      const y = H(n.x, n.z);
      add({ k: 'node', i, x: n.x, z: n.z, r: 0.9 }, 0.7, y - 0.2, y + 0.9, 2.8, 1);
    });
    return out;
  }
  /** 1ª pessoa: o que está na mira (raio do olho); senão algo bem na frente e perto */
  private findTarget(me: Player): Target | null {
    const C = this.cands(me);
    if (!C.length) return null;
    const v = this.view!;
    if (this.fp) {
      _o.copy(v.camera.position);
      v.lookDir(_d);
      let best: Cand | null = null;
      let bt = 1e9;
      for (const c of C) {
        // distância raio ↔ segmento vertical (x, y0..y1, z)
        const ox = c.tg.x - _o.x;
        const oz = c.tg.z - _o.z;
        const dh = Math.hypot(_d.x, _d.z) || 1e-4;
        let tt = (ox * _d.x + oz * _d.z) / (dh * dh);
        tt = Math.max(0, tt);
        let py = _o.y + _d.y * tt;
        // olhando muito para baixo (coisas no chão): usa o ponto onde o raio chega na altura do alvo
        if (py < c.y0 && _d.y < -0.05) {
          tt = (c.y0 + 0.15 - _o.y) / _d.y;
          py = c.y0 + 0.15;
        } else if (py > c.y1 && _d.y > 0.05) continue;
        const px = _o.x + _d.x * tt;
        const pz = _o.z + _d.z * tt;
        const miss = Math.hypot(px - c.tg.x, pz - c.tg.z);
        const tol = c.rr + (c.tg.k === 'loot' ? 0.35 : 0.25);
        const flat = Math.hypot(c.tg.x - me.x, c.tg.z - me.z) - c.rr;
        if (miss > tol || flat > c.reach || py < c.y0 - 0.5 || py > c.y1 + 0.3) continue;
        const sc = tt - c.prio * 0.05 + miss * 0.8;
        if (sc < bt) (bt = sc), (best = c);
      }
      if (best) return best.tg;
      // ajuda para crianças: algo bem perto e à frente conta mesmo fora da mira
      return this.nearTarget(me, C, 0.7, 1.6);
    }
    return this.nearTarget(me, C, -1, 0);
  }
  private nearTarget(me: Player, C: Cand[], minFwd: number, maxD: number): Target | null {
    const yaw = this.yawNow();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let best: Target | null = null;
    let bs = 1e9;
    for (const c of C) {
      const dx = c.tg.x - me.x;
      const dz = c.tg.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d - c.rr > (maxD || c.reach)) continue;
      const fwd = (dx * fx + dz * fz) / (d || 1);
      if (fwd < minFwd && d > c.rr + 0.6) continue;
      const sc = d - fwd * 0.8 - c.prio;
      if (sc < bs) (bs = sc), (best = c.tg);
    }
    return best;
  }

  /** golpe local imediato (resposta na hora; o host confirma) */
  private swingFx(hit: boolean, strong = 1): void {
    const me = this.me!;
    if (this.isClient) me.swing = 0.35;
    this.view?.fp.swing(hit, strong);
    if (hit) sfx.chop();
    else sfx.swish();
  }
  private doAction(): void {
    const me = this.me;
    const s = this.sim;
    if (!me || !s || me.faint > 0 || this.hud?.panel) return;
    if (this.build?.active) return this.build.place(); // BUILD
    if (this.placing) return this.placeCmd('ok');
    if (me.seat >= 0) {
      this.send({ a: 'vexit' });
      if (!this.isClient) sfx.click();
      return;
    }
    const tg = this.target;
    const held = this.heldId();
    const hk = heldKind(held);
    const cart = s.hauling(me);
    if (cart && (!tg || !['tree', 'felled', 'node', 'loot'].includes(tg.k))) {
      const dF = Math.hypot(cart.x, cart.z);
      if (dF < 5.5 || s.nearStore(me) || (hk === 'res' && cart)) return this.send({ a: 'cargo', s: cart.id });
      return this.send({ a: 'haul', s: cart.id });
    }
    if (!tg) {
      // sem alvo: usa o que está na mão
      if (hk === 'food') return this.send({ a: 'eat', id: held! });
      if (hk === 'place') {
        this.placing = { id: held!, r: me.yaw + Math.PI / 2 };
        this.hud?.setPlacing(true);
        speak(t('noites.say.place', 'Escolha o lugar e toque no verde.'), { cool: 15000 });
        return;
      }
      if (hk === 'flare') return this.useFlare(held!);
      if (hk === 'res') return this.doThrow();
      if (hk === 'bonk' || hk === 'axe') {
        this.swingFx(false);
        if (hk === 'bonk') this.send({ a: 'bonk', yaw: this.yawNow() });
      }
      return;
    }
    if (!this.fp) me.yaw = Math.atan2(tg.x - me.x, tg.z - me.z);
    const axeIt = () => {
      if (hk !== 'axe') this.selectWhere((id) => !!ITEM[id]?.axe);
      const ax = bestAxe(me.slots.slice(0, HOT));
      return ax.pow;
    };
    switch (tg.k) {
      case 'tree': {
        const pow = axeIt();
        this.swingFx(true, 0.8 + pow * 0.15);
        this.send({ a: 'hit', i: tg.i });
        this.tut('chop');
        break;
      }
      case 'felled':
        axeIt();
        this.swingFx(true);
        this.send({ a: 'log', id: tg.i });
        break;
      case 'node': {
        const n = s.w.nodes[tg.i];
        if (n.k === NK.Rock || n.k === NK.Junk) {
          axeIt();
          this.swingFx(true);
        }
        this.send({ a: 'take', i: tg.i });
        break;
      }
      case 'loot':
        this.send({ a: 'grab', id: tg.i });
        break;
      case 'chest':
        this.send({ a: 'chest', i: tg.i });
        break;
      case 'baby':
        this.send({ a: 'baby', i: tg.i });
        break;
      case 'fire': {
        if (s.fire.fuel <= 0) return this.send({ a: 'relight' });
        if (held && FIRE_TIME[held]) return this.doThrow();
        if (this.selectWhere((id) => !!FIRE_TIME[id])) {
          speak(t('noites.say.throwIt', 'Agora jogue na fogueira!'), { cool: 8000 });
          return;
        }
        speak(s.avail('wood') > 0 ? t('noites.say.getWood', 'Pegue lenha no baú do acampamento.') : t('noites.need.wood2', 'Precisa de lenha! Corte árvores e pegue as toras.'), { cool: 4000, urgent: true });
        break;
      }
      case 'store':
        this.hud?.openInv(s, me);
        break;
      case 'bench':
        if (!this.hud?.crafting) this.hud?.openCraft(s, me);
        break;
      case 'proc':
        this.send({ a: 'proc', s: tg.i });
        break;
      case 'pick':
        this.send({ a: 'pick', s: tg.i });
        break;
      case 'haul':
        this.send({ a: 'haul', s: tg.i });
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
  private near(x?: number, z?: number, d = 30): boolean {
    const me = this.me;
    return x === undefined || !me || Math.hypot((x ?? 0) - me.x, (z ?? 0) - me.z) < d;
  }
  private onEvent(e: Ev): void {
    const s = this.sim!;
    const mine = e.p === this.myId;
    const near = this.near(e.x, e.z);
    this.view?.fx(e);
    this.build?.onEvent(e, this.myId); // BUILD
    switch (e.k) {
      case 'dusk': {
        const kinds = (e.i ?? '').split(',').filter(Boolean).map(Number);
        this.hud?.dusk(e.n ?? 1, s.nightNow(e.n ?? 1).shy ? [] : kinds);
        speak(t('noites.say.dusk', 'Vai anoitecer! Noite {n}. Encha a fogueira!', { n: e.n ?? 1 }), { cool: 5000, urgent: true });
        break;
      }
      case 'night': {
        const sp = e.i === 'boss' ? t('noites.ev.boss', 'Cuidado: o Rei Sombrão vem aí!') : e.i === 'fog' ? t('noites.ev.fog', 'Noite de neblina!') : e.i === 'moon' ? t('noites.ev.moon', 'Lua cheia: brilhinhos em dobro!') : e.i === 'calm' ? t('noites.ev.calm', 'Noite calma: aproveite para juntar coisas.') : t('noites.ev.nightSub', 'Fique perto da luz!');
        bigMoment(t('noites.ev.night', 'Noite {n}', { n: e.n ?? 1 }), { sub: sp, color: '#8a7aff' });
        speak(t('noites.say.night', 'A noite chegou!') + ' ' + sp, { cool: 1000, urgent: true });
        sfx.boing();
        break;
      }
      case 'newc':
        setTimeout(() => bigMoment(t('noites.ev.newc', 'Nova criatura!'), { sub: creatureName(e.n ?? 0), color: '#5a2a9a', icon: 'warning' }), 2600);
        setTimeout(() => speak(t('noites.say.newc', 'Cuidado, uma criatura nova: {x}!', { x: creatureName(e.n ?? 0) }), { cool: 2000, urgent: true }), 2700);
        break;
      case 'dawn':
        bigMoment(t('noites.ev.dawn', 'Amanheceu!'), { sub: t('noites.ev.dawnSub', 'Vocês sobreviveram à noite {n}!', { n: e.n ?? 1 }), color: '#ffd34a', icon: 'star' });
        speak(t('noites.say.dawn', 'Amanheceu! Vocês sobreviveram à noite {n}!', { n: e.n ?? 1 }), { cool: 1000, urgent: true });
        sfx.sparkle();
        success();
        this.autosave();
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
        if (mine) speak(t('noites.say.chest2', 'Baú aberto! Pegue as coisas do chão.'), { cool: 6000 });
        if (near) sfx.fix();
        break;
      case 'pickup': {
        const v = this.view;
        if (v && this.near(e.x, e.z, 25)) {
          const p = s.player(e.p ?? '');
          const tgt = new THREE.Vector3();
          const cart = e.a !== undefined ? s.structs.find((q) => q.id === e.a) : undefined;
          v.loot.fly(e.i ?? 'wood', e.x ?? 0, e.y ?? 0, e.z ?? 0, () => (cart ? tgt.set(cart.x, s.w.height(cart.x, cart.z) + 0.9, cart.z) : mine && this.fp ? v.fp.handWorld(v.camera, tgt) : tgt.set(p?.x ?? 0, s.w.height(p?.x ?? 0, p?.z ?? 0) + 0.8, p?.z ?? 0)));
        }
        if (mine) {
          sfx.pop();
          tap('light');
          this.view?.fp.pickBump();
          this.tut('pick');
        } else if (near) sfx.pick();
        break;
      }
      case 'throw':
        if (!mine && near) sfx.throw();
        break;
      case 'burn':
        if (this.near(0, 0, 25)) {
          sfx.fire();
          sfx.catch();
        }
        if (mine) {
          notify(`+${fmtS(e.n ?? 0)}`, { iconHtml: ic('fire', 18), kind: 'good', key: 'burn' });
          this.tut('feed');
        }
        break;
      case 'firelv':
        bigMoment(t('noites.ev.firelv', 'Fogueira nível {n}!', { n: e.n ?? 2 }), { sub: t('noites.ev.firelvSub', 'Maior e mais quente (gasta mais lenha)'), color: '#ff8a30', icon: 'star' });
        speak(t('noites.say.firelv', 'A fogueira cresceu! Nível {n}!', { n: e.n ?? 2 }), { cool: 1000, urgent: true });
        sfx.sparkle();
        break;
      case 'relight':
        speak(t('noites.say.relight', 'Fogo aceso de novo!'), { cool: 1000, urgent: true });
        sfx.fire();
        break;
      case 'bagfull':
        if (mine) {
          const msg = t('noites.say.bagFull', 'Mochila cheia! O resto foi para o acampamento.');
          notify(msg, { iconHtml: ic('bag', 18), kind: 'warn', key: 'bagfull' });
          speak(msg, { cool: 15000 });
        }
        break;
      case 'wear':
        if (mine) {
          const d = ITEM[e.i ?? ''];
          if (d?.wear?.slots) {
            bigMoment(t('noites.ev.sack', 'Saco novo!'), { sub: t('noites.ev.sackSub', '+{n} espaços na mochila', { n: d.wear.slots }), color: '#c08a52', icon: 'star' });
            speak(t('noites.say.sack', '{x}! Agora cabe mais coisa na mochila.', { x: d.n() }), { cool: 1000, urgent: true });
          }
          sfx.fix();
        }
        break;
      case 'store':
        if (mine) sfx.drop();
        break;
      case 'unstore':
        if (mine) sfx.pick();
        break;
      case 'drop':
        if (mine) sfx.drop();
        break;
      case 'haul':
        if (mine) speak(t('noites.say.haul', 'Empurre o carrinho! As coisas que você pega vão para ele.'), { cool: 30000 });
        sfx.thunk();
        break;
      case 'dump':
        if (mine) speak(e.i === 'fire' ? t('noites.say.dumpFire', 'Tudo na fogueira!') : t('noites.say.dumpStore', 'Guardado no baú!'), { cool: 3000 });
        sfx.thud();
        break;
      case 'cargo':
        if (mine) sfx.drop();
        break;
      case 'ask': {
        const p = s.player(e.p ?? '');
        this.view?.bubble(e.p ?? '', 'help', 8);
        if (p) {
          notify(t('noites.ev.ask', '{n} está com medo! Vá ajudar.', { n: p.name }), { iconHtml: ic('help', 18), kind: 'warn' });
          speak(t('noites.say.ask', '{n} está com medo no escuro! Vá até lá ajudar.', { n: p.name }), { cool: 8000, urgent: true });
        }
        break;
      }
      case 'craft':
        if (mine) {
          speak(t('noites.say.crafted', 'Pronto! {x}.', { x: itemName(e.i ?? '') }), { cool: 500, urgent: true });
          notify(itemName(e.i ?? ''), { iconHtml: itemIcon(e.i ?? '', 18), kind: 'good' });
          this.tut('craft');
          const d = ITEM[e.i ?? ''];
          if (d && !d.camp && !d.wear) speak(t('noites.say.inBar', 'Está nos seus itens, embaixo.'), { cool: 30000 });
        }
        sfx.fix();
        break;
      case 'need':
        if (mine) {
          const w = e.i ?? '';
          const msg =
            w === 'wood'
              ? t('noites.need.wood2', 'Precisa de lenha! Corte árvores e pegue as toras.')
              : w === 'space'
                ? t('noites.say.noSpace', 'Aqui não cabe. Tente outro lugar.')
                : w === 'room'
                  ? t('noites.say.bagFullShort', 'Mochila cheia!')
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
                                : t('noites.why.res', 'Falta {x}.', { x: itemName(w) });
          speak(msg, { cool: 2500, urgent: true });
          sfx.bump();
        }
        break;
      case 'firelow':
        speak(t('noites.say.fireLow2', 'A fogueira está acabando! Jogue lenha nela!'), { cool: 25000 });
        break;
      case 'fireout':
        speak(t('noites.say.fireOut2', 'A fogueira apagou! Acenda de novo com galhos e fibra.'), { cool: 3000, urgent: true });
        bigMoment(t('noites.ev.fireOut', 'A fogueira apagou!'), { color: '#ff6a4a', icon: 'warning' });
        break;
      case 'hurt':
        if (mine) {
          tap('heavy');
          sfx.bump();
          if (e.i === 'cold') speak(t('noites.say.cold', 'Brrr, que frio! Volte para a fogueira.'), { cool: 15000 });
          else if (e.i === 'hungry') speak(t('noites.say.hungry', 'Que fome! Coma alguma coisa.'), { cool: 15000 });
          else speak(t('noites.say.hurt2', 'Ai! Segure a lanterna e aponte para as Sombrinhas!'), { cool: 12000 });
        }
        break;
      case 'faint':
        if (mine) speak(t('noites.say.faint2', 'Você desmaiou de susto... parte da mochila caiu no chão.'), { cool: 3000, urgent: true });
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
        if (mine) {
          this.view?.fp.swing(true, 0.8 + (e.y ?? 0) * 0.6);
          if ((e.y ?? 0) > 0.6) sfx.thunk();
        } else if (near) sfx.chop();
        break;
      case 'logchop':
      case 'nodehit':
        if (!mine && near) sfx.chop();
        break;
      case 'fell':
        if (near) sfx.crash();
        if (mine) speak(t('noites.say.fell', 'Madeira! Bata no tronco caído para fazer toras.'), { cool: 25000 });
        break;
      case 'split':
        if (near) sfx.pop();
        if (mine) speak(t('noites.say.split', 'Toras! Passe perto para pegar.'), { cool: 25000 });
        break;
      case 'take':
      case 'collect':
        if (mine || near) sfx.pick();
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
  private tut(k: keyof NSave['tut']): void {
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
    const nearestLoot = (f: (k: string) => boolean, max = 30) => {
      let b = null as { x: number; z: number } | null;
      let bd = max;
      for (const l of s.loot) {
        if (l.d > 0 || !f(l.k)) continue;
        const d = Math.hypot(l.x - me.x, l.z - me.z);
        if (d < bd) (bd = d), (b = l);
      }
      return b;
    };
    const nearestFelled = () => {
      let b = null as { x: number; z: number } | null;
      let bd = 30;
      for (const f of s.felled) {
        const tr = s.w.trees[f.i];
        const h = 4.6 * tr.s;
        const x = tr.x + Math.sin(f.a) * h * 0.35;
        const z = tr.z + Math.cos(f.a) * h * 0.35;
        const d = Math.hypot(x - me.x, z - me.z);
        if (d < bd) (bd = d), (b = { x, z });
      }
      return b;
    };
    const fuelHand = countOf(me.slots, 'wood') + countOf(me.slots, 'twig') + countOf(me.slots, 'coal');
    const left = s.fireLeft();
    if (me.carry >= 0) return { icon: 'baby', text: t('noites.obj.carry', 'Leve o bebê para a fogueira'), x: 0, z: 0 };
    if (s.fire.fuel <= 0) return { icon: 'fire', text: t('noites.obj.relight', 'Acenda a fogueira de novo!'), x: 0, z: 0 };
    if (s.phase === 'night' && dF > Math.max(fr, 4) + 4 && s.litAt(me.x, me.z) <= 0) return { icon: 'fire', text: t('noites.obj.back', 'Volte para a luz!'), x: 0, z: 0 };
    const getWood = () => {
      if (fuelHand > 0) return { icon: 'throw', text: t('noites.obj.throw', 'Jogue a lenha na fogueira'), x: 0, z: 0 };
      const l = nearestLoot((k) => k === 'wood' || k === 'twig');
      if (l) return { icon: 'wood', text: t('noites.obj.pick', 'Pegue as toras do chão'), x: l.x, z: l.z };
      const f = nearestFelled();
      if (f) return { icon: 'axe', text: t('noites.obj.split', 'Bata no tronco caído'), x: f.x, z: f.z };
      if (s.avail('wood') > 0 && dF < 14) return { icon: 'box', text: t('noites.obj.stash', 'Pegue lenha no baú'), x: CHEST_POS[0], z: CHEST_POS[1] };
      const tr = nearestTree();
      return tr ? { icon: 'axe', text: t('noites.obj.chop', 'Corte árvores para pegar lenha'), x: tr.x, z: tr.z } : null;
    };
    if (left < 70 || !this.save.tut.feed) {
      const o = getWood();
      if (o) return o;
    }
    if (!this.save.tut.craft && s.avail('twig', me) >= 2) return { icon: 'craft', text: t('noites.obj.craft', 'Use a bancada para fazer coisas'), x: BENCH_POS[0], z: BENCH_POS[1] };
    if (s.phase === 'day') {
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
      return getWood() ?? { icon: 'wood', text: t('noites.obj.gather', 'Junte lenha e coisas para a noite'), x: 0, z: 0 };
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
    this.lastLook = [dy, dp];
    v.camYaw -= dy;
    v.fpPitch = Math.max(-1.25, Math.min(1.05, v.fpPitch - dp));
    v.camPitch = Math.max(0.05, Math.min(1.2, v.camPitch + dp * 0.8));
    // dirigir
    const vNow = me && me.seat >= 0 ? s.vehView.find((q) => q.id === me.seat) : undefined;
    if (me && vNow) {
      const [rx, fw] = this.garage ? [0, 0] : ctl.dir();
      const thr = Math.abs(fw) > 0.12 ? fw : 0;
      const steer = Math.abs(rx) > 0.1 ? rx : 0;
      this.driveIn = [thr, steer];
      if (!this.isClient) s.drive(this.myId, thr, steer);
      const vy = Math.atan2(2 * (vNow.q[1] * vNow.q[3] + vNow.q[0] * vNow.q[2]), 1 - 2 * (vNow.q[1] * vNow.q[1] + vNow.q[0] * vNow.q[0]));
      this.camAuto = dy || dp ? 1.5 : this.camAuto - dt;
      if (this.camAuto <= 0 && Math.abs(vNow.speed) > 1) v.camYaw += Math.atan2(Math.sin(vy - v.camYaw), Math.cos(vy - v.camYaw)) * Math.min(1, dt * 2.5);
      const d = s.designs.get(vNow.dk);
      const st = d ? stats(d) : null;
      hud.setDrive(st ? { fuel: st.fuelCap ? vNow.fuel / st.fuelCap : 1, inf: !st.energy, load: vNow.logs.length / 7, cap: st.cap } : null);
    } else hud.setDrive(null);
    // andar
    this.walkSpeed = 0;
    if (me && me.faint <= 0 && !hud.panel && !vNow && !this.garage) {
      const [rx, fw] = ctl.dir();
      const yaw = v.camYaw;
      const mx = Math.sin(yaw) * fw - Math.cos(yaw) * rx;
      const mz = Math.cos(yaw) * fw + Math.sin(yaw) * rx;
      const m = Math.hypot(mx, mz);
      const boots = me.wear.feet ? ITEM[me.wear.feet].wear!.speed ?? 0 : 0;
      const heavy = this.heldId() === 'wood' ? 0.92 : 1;
      const sp = SPEED * (1 + boots) * (me.carry >= 0 ? 0.9 : 1) * heavy * (s.hauling(me) ? 0.85 : 1);
      if (m > 0.05) {
        const ox = me.x;
        const oz = me.z;
        [me.x, me.z] = s.collide(me.x + mx * sp * dt, me.z + mz * sp * dt, 0.4);
        this.walkSpeed = Math.hypot(me.x - ox, me.z - oz) / dt;
        if (!this.fp && !me.lightOn) me.yaw = Math.atan2(mx, mz);
      }
      if (this.fp) me.yaw = yaw;
      // lanterna na mão: liga sozinha; mira na câmera, com ajuda para a Sombrinha mais perto
      if (this.isClient) me.lightOn = heldKind(this.heldId()) === 'lamp';
      if (me.lightOn) {
        let aim = this.fp ? yaw : me.yaw;
        const [range] = s.lamp(me);
        let bd = 0.65;
        for (const c of s.creatures) {
          const d = Math.hypot(c.x - me.x, c.z - me.z);
          if (d > range + 2) continue;
          let da = Math.atan2(c.x - me.x, c.z - me.z) - aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < bd) (bd = Math.abs(da)), (aim += da);
        }
        me.aim += Math.atan2(Math.sin(aim - me.aim), Math.cos(aim - me.aim)) * Math.min(1, dt * 10);
        if (!this.fp) me.yaw = me.aim;
      } else me.aim = me.yaw;
      if (me.swing > 0 && this.isClient) me.swing = Math.max(0, me.swing - dt);
      // passos
      if (this.walkSpeed > 1) {
        this.stepT -= dt * this.walkSpeed;
        if (this.stepT <= 0) {
          this.stepT = 2.2;
          if (this.fp) sfx.step();
        }
      }
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
      this.saveT -= dt;
      if (this.saveT <= 0) {
        this.saveT = 20;
        this.autosave();
      }
    } else if (me) {
      guestLoot(s, dt);
      s.fire.flare = Math.max(0, s.fire.flare - dt * 1.2);
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / SNAP_HZ;
        this.net!.send({ t: 'i', x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, yaw: Math.round(me.yaw * 100) / 100, aim: Math.round(me.aim * 100) / 100, l: me.lightOn ? 1 : 0, th: Math.round(this.driveIn[0] * 100) / 100, sr: Math.round(this.driveIn[1] * 100) / 100, h: me.sel });
      }
    }
    if (this.net) hud.setCode(this.code, s.players.length);
    // câmera (antes da mira: o raio sai do olho)
    const fpNow = this.fp && !vNow;
    v.firstPerson = fpNow;
    if (this.build) {
      // BUILD: em 1ª pessoa a mira é o centro da tela e a construção não mexe na câmera
      this.build.camAssist = !fpNow;
      if (fpNow) this.build.aimY = 0;
    }
    if (me && vNow) v.placeCamera(vNow.x, vNow.z, dt, vNow.y - 0.6, 9.5);
    else if (me && fpNow) {
      this.bobT += dt * Math.min(this.walkSpeed, 6) * 1.9;
      v.placeCameraFP(me.x, me.z, s.w.height(me.x, me.z), Math.abs(Math.sin(this.bobT)) * 0.045 * Math.min(1, this.walkSpeed / 4));
    } else if (me) this.camv.pose({ x: me.x, y: s.w.height(me.x, me.z), z: me.z, yaw: v.camYaw, pitch: v.fpPitch, eye: 1.25, dist: 5.2, smooth: 0.08, dt, block: (x0, _y0, z0, x1, _y1, z1) => this.camBlock(x0, z0, x1, z1) }, v.camera);
    v.camera.updateMatrixWorld();
    // alvo e botão de ação
    this.target = me && me.faint <= 0 && me.seat < 0 && !hud.panel ? this.findTarget(me) : null;
    this.updAction(me);
    this.build?.update(dt); // BUILD: fantasma (antes da vista desenhar)
    const focus: Focus | null = this.target && !this.build?.active && (!fpNow || this.target.k !== 'tree') ? { x: this.target.x, z: this.target.z, r: this.target.r } : null;
    v.update(dt, me ?? null, focus, this.ghost(), me?.x ?? 0, me?.z ?? 0);
    // mão em 1ª pessoa
    if (me) {
      const h = me.slots[me.sel];
      const fireNear = Math.max(0, 1 - Math.hypot(me.x, me.z) / 9) * (s.fire.fuel > 0 ? 1 : 0);
      v.fp.update(dt, me.faint > 0 ? undefined : h?.id, h?.n ?? 0, this.walkSpeed, this.lastLook, { hemi: v.hemi, fire: fireNear });
    }
    // HUD
    if (me) {
      hud.setStats(me, s);
      const ni = s.nightNow();
      hud.setPhase(s, s.phase === 'day' ? DAY_LEN : NIGHT_LEN, s.phase === 'night' ? (ni.boss ? 'warning' : ni.fog ? 'think' : ni.moon ? 'star' : '') : '');
      hud.setHotbar(me.slots, me.sel, dt);
      const hk = heldKind(this.heldId());
      hud.showThrow((hk === 'res' || hk === 'food') && me.seat < 0);
      this.objT -= dt;
      if (this.objT <= 0) {
        this.objT = 0.25;
        this.updObjective(me);
      }
      if (hud.crafting) {
        const key = JSON.stringify(s.stash) + JSON.stringify(me.slots) + s.bench + JSON.stringify(me.wear) + s.rescued;
        if (key !== this.craftKey) {
          this.craftKey = key;
          hud.renderCraft(s, me);
        }
        if (Math.hypot(me.x - BENCH_POS[0], me.z - BENCH_POS[1]) > 5 && !s.build.benchNear(me.x, me.z, 5)) hud.closeCraft(); // BUILD: bancada extra
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
    const fp = this.fp && !(me && me.seat >= 0);
    const A = (icon: string, label: string, say: string, col = '') => {
      hud.setAction(icon, label, say, col);
      hud.setCross(fp, !!tg, icon, label);
    };
    if (me && me.seat >= 0) return A('exit', t('noites.do.vexit', 'Descer'), t('noites.do.vexitS', 'Descer do veículo'), '#2a0b5c');
    if (!me) return A('hand', '', '');
    const held = this.heldId();
    const hk = heldKind(held);
    const cart = s.hauling(me);
    if (cart && (!tg || !['tree', 'felled', 'node', 'loot'].includes(tg.k))) {
      if (Math.hypot(cart.x, cart.z) < 5.5) return A('fire', t('noites.do.dumpFire', 'Despejar'), t('noites.do.dumpFireS', 'Despejar o carrinho na fogueira'));
      if (s.nearStore(me)) return A('box', t('noites.do.dumpStore', 'Guardar'), t('noites.do.dumpStoreS', 'Guardar a carga no baú'));
      if (hk === 'res') return A('cart', t('noites.do.cargo', 'Pôr'), t('noites.do.cargoS', 'Pôr no carrinho'));
      return A('cart', t('noites.do.unhaul', 'Soltar'), t('noites.do.unhaulS', 'Soltar o carrinho'));
    }
    if (!tg) {
      if (hk === 'food') return A('eat', t('noites.do.eat', 'Comer'), t('noites.do.eatS', 'Comer {x}', { x: itemName(held!) }));
      if (hk === 'place') return A(ITEM[held!].icon, t('noites.do.place', 'Colocar'), t('noites.do.placeS', 'Colocar {x}', { x: itemName(held!) }), ITEM[held!].col);
      if (hk === 'res' || hk === 'flare') return A('throw', t('noites.do.throw', 'Jogar'), t('noites.do.throwS', 'Jogar {x}', { x: itemName(held!) }), '#c03a00');
      if (hk === 'bonk') return A('hammer', '', t('noites.say.bonk', 'Martelada!'));
      return A('hand', '', '');
    }
    switch (tg.k) {
      case 'tree': {
        const hp = s.w.trees[tg.i].hp;
        const h = s.treeHit.get(tg.i) ?? 0;
        return A('axe', h ? `${t('noites.do.chop', 'Cortar')} ${Math.round((h / hp) * 100)}%` : t('noites.do.chop', 'Cortar'), t('noites.do.chopS', 'Cortar a árvore'));
      }
      case 'felled':
        return A('axe', t('noites.do.split', 'Rachar'), t('noites.do.splitS', 'Rachar o tronco em toras'));
      case 'node': {
        const n = s.w.nodes[tg.i];
        const r = Object.keys(NODE_GIVES[n.k])[0] as Res;
        if (n.k === NK.Rock || n.k === NK.Junk) return A('axe', t('noites.do.break', 'Quebrar'), t('noites.do.breakS', 'Quebrar: {x}', { x: resName(r) }));
        return A(r, t('noites.do.take', 'Pegar'), t('noites.do.takeS', 'Pegar {x}', { x: resName(r) }));
      }
      case 'loot': {
        const l = s.loot.find((q) => q.id === tg.i);
        return A(l ? (ITEM[l.k]?.icon ?? l.k) : 'hand', t('noites.do.take', 'Pegar'), t('noites.do.takeS', 'Pegar {x}', { x: l ? itemName(l.k) : '' }), l && ITEM[l.k] ? ITEM[l.k].col : '');
      }
      case 'chest':
        return A('chest', t('noites.do.chest', 'Abrir'), t('noites.do.chestS', 'Abrir o baú'));
      case 'baby':
        return A('baby', t('noites.do.baby', 'Resgatar'), t('noites.do.babyS', 'Resgatar o bebê'));
      case 'fire': {
        if (s.fire.fuel <= 0) {
          const ok = Object.keys(RELIGHT).every((k) => s.avail(k, me) >= (RELIGHT[k as Res] ?? 0));
          return A('fire', t('noites.do.relight', 'Acender'), t('noites.do.relightS', 'Acender a fogueira (3 galhos e 1 fibra)'), ok ? '' : '#9a9aa0');
        }
        const can = !!(held && FIRE_TIME[held]) || me.slots.slice(0, HOT).some((q) => q && FIRE_TIME[q.id]);
        return A('throw', t('noites.do.feed2', 'Jogar lenha'), t('noites.do.feedS2', 'Jogar lenha na fogueira'), can ? '#c03a00' : '#9a9aa0');
      }
      case 'store':
        return A('box', t('noites.do.store', 'Baú'), t('noites.do.storeS', 'Abrir o baú do acampamento'));
      case 'bench':
        return A('craft', t('noites.do.bench', 'Bancada'), t('noites.do.benchS', 'Abrir a bancada'));
      case 'proc': {
        const st = s.structs.find((q) => q.id === tg.i);
        return A(st ? ITEM[st.k].icon : 'hand', t('noites.do.use', 'Usar'), st ? t('noites.do.useS', 'Usar {x}', { x: ITEM[st.k].n() }) : '', st ? ITEM[st.k].col : '');
      }
      case 'pick':
        return A('pick', t('noites.do.pick', 'Guardar'), t('noites.do.pickS', 'Pegar de volta'));
      case 'haul': {
        const st = s.structs.find((q) => q.id === tg.i);
        return A(st ? ITEM[st.k].icon : 'cart', t('noites.do.haul', 'Puxar'), t('noites.do.haulS', 'Pegar o {x}', { x: st ? ITEM[st.k].n() : '' }));
      }
      case 'garage':
        return A('garage', t('noites.do.garage', 'Garagem'), t('noites.do.garageS', 'Abrir a garagem'));
      case 'veh': {
        const vv = s.vehView.find((q) => q.id === tg.i);
        const d = vv && s.designs.get(vv.dk);
        const nm = d ? vName(d) : '';
        if (tg.sub === 'load') return A('cargo', t('noites.do.vload', 'Carregar'), t('noites.do.vloadS', 'Pôr a lenha na caçamba'));
        if (tg.sub === 'fuel') return A('gas', t('noites.do.vfuel', 'Abastecer'), t('noites.do.vfuelS', 'Abastecer o veículo'));
        return A('car', t('noites.do.venter', 'Entrar'), t('noites.do.venterS', 'Entrar: {x}', { x: nm }), d?.col);
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
      // seta na borda, longe da barra de baixo e dos botões
      hud.setMarker(w / 2 + Math.sin(a) * (w / 2 - 70), Math.min(h - 150, h / 2 - Math.cos(a) * (h / 2 - 70)), o.icon, true, deg);
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
    clearRun();
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
    this.autosave();
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
    this.autosave();
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.net?.isHost) stopPlaying();
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
const fmtS = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)} s`);
function creatureName(k: number): string {
  switch (k) {
    case CK.Hopper:
      return t('noites.c.hopper', 'Sombrinha Pula-Pula');
    case CK.Big:
      return t('noites.c.big', 'Sombrona');
    case CK.Mist:
      return t('noites.c.mist', 'Sombrinha de Neblina');
    case CK.King:
      return t('noites.c.king', 'Rei Sombrão');
    default:
      return t('noites.c.small', 'Sombrinha');
  }
}
void RAW_FOOD;
void isRes;
void FIRE_MOUTH;
void CUT_Y;
void _h;
