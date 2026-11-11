/* ============================================================
 *  GARIMPO BRUTO — entrada do jogo (chunk sob demanda).
 *  Fluxo: espaços de save (novo / continuar / apagar, dificuldade) → mapa da semente →
 *  laço: procurar (detector) → cavar → carregar → levar até a lavadora → ouro no ESTOQUE →
 *  caminhão de exportação leva parte e paga → comprar máquinas e melhorias.
 * ============================================================ */
import './garimpo.css';
import * as THREE from 'three';
import { t } from '../../i18n';
import { addCoins } from '../../core/economy';
import { pushBack } from '../../core/back';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { QualityGovernor, loadMode, type Tier } from '../../core/quality';
import { sfx } from '../../3d/common/sfx';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { bigMoment, notify, setNotifyAlign, setNotifyTop, resetNotifyTop } from '../../ui/notify';
import { hush, speak } from '../voo/voice';
import { Driver, MinerBot, type BotHost } from './bots';
import { Fire } from './fire';
import { Underground, UG_PRICE, CS as UGCS, WALL_H, type Tool } from './underground';
import { Hud } from './hud';
import { IC, type IconKey } from './icons';
import { collide, Excavator, Heli, makeMachine, newCtl, Pickup, Truck, Worker, type Ctl, type Env, type Kind, type Machine, type Receiver } from './machines';
import { buildExportTruck } from './models';
import { setLod } from './kit';
import { natureAnisotropy } from '../../3d/nature';
import { decodeTerrain, deleteSlot, encodeTerrain, EXPORT_EVERY, FIRE_EVERY, freshSlot, GOLD_PRICE, loadMeta, loadSlot, writeSlot, type Diff, type SlotSave } from './save';
import { World } from './world';
import { WaterSystem } from './water/system';
import { ProcSystem } from './proc/system';
import { RpLayer } from './rp'; // RP: vida de garimpeiro (clima, necessidades, diesel, eventos, estrada)
import { GbNet, newCode, type Me } from './net';
import { awaitInit, KINDS, MpGuest, MpHost, PCOL, type GuestInit } from './mp';
import { fillJoin, fillLobby, inviteCard, pollInvites, type LobbyHandle } from './lobby';
import { takePendingGarimpo } from './pending';
import { consumePartySeat, partySeat } from '../../party/contract';
import { reportPlaying, stopPlaying } from '../../party/join';
import { me as socialMe } from '../../social/net';
import { displayName } from '../../services/leaderboard';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const DIFF_NAMES = () => [t('gb.d0', 'Fácil'), t('gb.d1', 'Normal'), t('gb.d2', 'Difícil'), t('gb.d3', 'Muito difícil')];

export interface ShopItem {
  id: string;
  kind?: Kind;
  icon: IconKey;
  name: () => string;
  price: number[];
  max?: number;
}
export const MACHINES: ShopItem[] = [
  { id: 'pickup', kind: 'pickup', icon: 'enter', name: () => t('gb.m.pickup', 'Pickup 4x4'), price: [900], max: 2 },
  { id: 'excavator', kind: 'excavator', icon: 'dig', name: () => t('gb.m.excavator', 'Escavadeira'), price: [6500], max: 2 },
  { id: 'truck', kind: 'truck', icon: 'tip', name: () => t('gb.m.truck', 'Caminhão basculante'), price: [5000], max: 3 },
  { id: 'dozer', kind: 'dozer', icon: 'bladeDown', name: () => t('gb.m.dozer', 'Trator de esteira'), price: [9000], max: 1 },
  { id: 'heli', kind: 'heli', icon: 'water', name: () => t('gb.m.heli', 'Helicóptero com balde'), price: [16000], max: 1 },
];
export const HELPERS: ShopItem[] = [
  { id: 'driver', icon: 'tip', name: () => t('gb.h.driver', 'Motorista (caminhão)'), price: [2500, 3500, 5000] },
  { id: 'miner', icon: 'shovel', name: () => t('gb.h.miner', 'Garimpeiro ajudante'), price: [800, 1400, 2200, 3200] },
];
export const MINE: ShopItem[] = [
  { id: 'mine', icon: 'tracks', name: () => t('gb.mine.open', 'Abrir a mina subterrânea'), price: [UG_PRICE.mine] },
  { id: 'cart', icon: 'tracks', name: () => t('gb.mine.cart', 'Vagoneta'), price: [UG_PRICE.cart, UG_PRICE.cart, UG_PRICE.cart, UG_PRICE.cart] },
  { id: 'ugbot', icon: 'user', name: () => t('gb.mine.bot', 'Mineiro (mina)'), price: [UG_PRICE.bot, UG_PRICE.bot, UG_PRICE.bot, UG_PRICE.bot, UG_PRICE.bot, UG_PRICE.bot] },
];
export const UPGRADES: ShopItem[] = [
  { id: 'shovel', icon: 'shovel', name: () => t('gb.u.shovel', 'Pá melhor'), price: [180, 700, 2200] },
  { id: 'barrow', icon: 'dump', name: () => t('gb.u.barrow', 'Carrinho maior'), price: [140, 600, 1900] },
  { id: 'plant', icon: 'plant', name: () => t('gb.u.plant', 'Lavadora mais rápida'), price: [900, 3500, 11000] },
];
const SHOVEL = [1, 1.4, 1.8, 2.3];
const BARROW = [0.12, 0.18, 0.26, 0.36];
const PLANT_RATE = [0.1, 0.18, 0.3, 0.5];

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new Garimpo(root, exit);
  const code = takePendingGarimpo();
  // grupo (docs/PARTY.md) — gancho do grupo: o líder abre a sala com o código do grupo, os outros entram nela
  const seat = code ? null : partySeat('garimpo');
  if (seat) consumePartySeat('garimpo');
  if (code) g.joinRoom(code);
  else if (seat && seat.host) {
    g.partyCode = seat.code(5, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    g.menu(true);
  } else if (seat) g.joinRoom(seat.code(5, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'), 50);
  else g.menu();
  return g;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class Garimpo implements MiniGameHandle, BotHost {
  private wrap: HTMLDivElement;
  private cv: HTMLCanvasElement | null = null;
  private r: THREE.WebGLRenderer | null = null;
  w: World | null = null;
  hud: Hud | null = null;
  sv: SlotSave | null = null;
  slot = -1;
  ms: Machine[] = [];
  worker: Worker | null = null;
  cur: Machine | null = null;
  fire: Fire | null = null;
  /** água: represa, enchente, bombas (water/) */
  water: WaterSystem | null = null;
  /** beneficiamento: bateia, calhas, melhorias da lavadora, rejeitos (proc/) */
  proc: ProcSystem | null = null;
  drivers: Driver[] = [];
  ug: Underground | null = null;
  inMine = false;
  private ugBar: HTMLDivElement | null = null;
  miners: MinerBot[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private destroyed = false;
  private gov: QualityGovernor;
  private resK = 1;
  private popB: (() => void) | null = null;
  private popOv: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  time = 0;
  // câmera
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  get camYawNow(): number {
    return this.camYaw;
  }
  private lookYaw = 0;
  private lookPitch = 0;
  private lookIdle = 0;
  private camMode = 0;
  // lavadora / exportação
  private plantSpin = 0;
  get plantSpinK(): number {
    return this.plantSpin;
  }
  private tail = 0;
  private goldToast = 0;
  private goldToastT = 0;
  private exp = { st: 0 as 0 | 1 | 2 | 3, t: 0, seg: 0, d: 0, mesh: null as THREE.Group | null };
  private detOn = true;
  private detBeep = 0;
  private detV = 0;
  private saveT = 0;
  private earned = 0;
  private soldSession = 0;
  private startAt = 0;
  rainOn = false;
  private rainK = 0;
  private hintT = 0;
  private toastEl: HTMLDivElement | null = null;
  private alertEl: HTMLDivElement | null = null;
  private engineOn = false;
  env!: Env;
  /* ---------------- online ---------------- */
  /** anfitrião (roda tudo e manda retratos) ou convidado (só mostra e manda entrada) */
  mp: MpHost | MpGuest | null = null;
  /** RP: camada da vida de garimpeiro (rp/index.ts) */
  rp: RpLayer | null = null;
  private lobby: LobbyHandle | null = null;
  private netChip: HTMLDivElement | null = null;
  /** convidado: carrinhos/mineiros da mina do anfitrião (só para a loja) */
  netUg = { carts: 0, bots: 0 };
  private mineNoteT = 0;
  private meP: Promise<Me> | null = null;
  get guest(): boolean {
    return this.mp instanceof MpGuest;
  }
  get host(): MpHost | null {
    return this.mp instanceof MpHost ? this.mp : null;
  }

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'gb-root';
    root.appendChild(this.wrap);
    this.gov = new QualityGovernor({
      mode: loadMode(),
      persist: false,
      emit: false,
      onChange: (tier) => this.applyTier(tier),
      onResScale: (k) => {
        this.resK = k;
        this.applyPR();
      },
    });
    if (location.search.includes('debug')) (window as unknown as { __garimpo: Garimpo }).__garimpo = this;
  }

  /* ============================== menu de saves ============================== */
  menu(online = false): void {
    this.closeOverlays();
    const meta = loadMeta();
    const d = document.createElement('div');
    d.className = 'gb-scr gb-menu';
    const cards = meta
      .map((m, i) => {
        if (!m)
          return `<button class="gb-card empty" data-new="${i}">${IC.plus}<span>${esc(t('gb.newGame', 'Novo jogo'))}</span><small>${esc(t('gb.slot', 'Espaço {n}', { n: i + 1 }))}</small></button>`;
        const mins = Math.round(m.played / 60);
        return `<div class="gb-card" data-go="${i}" role="button">${IC.bar}<span>${esc(t('gb.slot', 'Espaço {n}', { n: i + 1 }))} · ${esc(DIFF_NAMES()[m.diff])}</span><small>${IC.coin.replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"')} ${Math.floor(m.money).toLocaleString('pt-BR')} · ${mins} min</small><button class="gb-del" data-del="${i}" aria-label="${esc(t('gb.delete', 'Apagar'))}">${IC.trash}</button></div>`;
      })
      .join('');
    d.innerHTML = online
      ? `<h1>${IC.friends}${esc(t('gb.mp.title', 'Garimpar com amigos'))}</h1><div class="gb-sub">${esc(t('gb.mp.pick', 'Escolha o garimpo: seus amigos jogam nele com você'))}</div><div class="gb-row">${cards}</div><button class="gb-btn ghost" data-solo>${esc(t('gb.back', 'Voltar'))}</button>`
      : `<h1>${esc(t('gb.name', 'Garimpo Bruto'))}</h1><div class="gb-row">${cards}</div><div class="gb-row"><button class="gb-btn ghost" data-exit>${IC.home}${esc(t('gb.back', 'Voltar'))}</button><button class="gb-btn blue" data-online>${IC.friends}${esc(t('gb.mp.withFriends', 'Com amigos'))}</button></div><div class="gb-menuinv"></div><button class="gb-codelink" data-joinui>${esc(t('fp.code', 'Entrar com código / QR'))}</button>`;
    this.wrap.appendChild(d);
    // convites de amigos chegam aqui também
    if (!online) {
      const box = d.querySelector('.gb-menuinv') as HTMLElement;
      // amigos garimpando agora: "Fulano está jogando — ENTRAR" (src/party/friends-play.ts)
      const pl = document.createElement('div');
      box.before(pl);
      void import('../../party/friends-play').then((f) => f.playingStrip(pl, 'garimpo'));
      pollInvites(
        () => this.myself().catch(() => null),
        (inv) =>
          inviteCard(box, inv, () => {
            d.remove();
            this.joinRoom(inv.code);
          }),
        () => d.isConnected && !this.sv,
      );
    }
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const del = el.closest<HTMLElement>('[data-del]');
      if (del) {
        e.stopPropagation();
        const i = Number(del.dataset.del);
        if (del.dataset.armed) {
          deleteSlot(i);
          d.remove();
          this.menu();
        } else {
          del.dataset.armed = '1';
          del.style.background = '#c21d1d';
          notify(t('gb.delConfirm', 'Toque de novo para apagar'), { icon: 'warning', kind: 'warn' });
        }
        return;
      }
      const go = el.closest<HTMLElement>('[data-go]');
      if (go) {
        sfx.click();
        const i = Number(go.dataset.go);
        const s = loadSlot(i);
        d.remove();
        if (s) void this.start(i, s).then(() => {
          if (online) void this.goOnline();
        });
        else this.menu(online);
        return;
      }
      const nw = el.closest<HTMLElement>('[data-new]');
      if (nw) {
        sfx.click();
        d.remove();
        this.newGame(Number(nw.dataset.new), online);
        return;
      }
      if (el.closest('[data-online]')) {
        sfx.click();
        d.remove();
        this.menu(true);
        return;
      }
      if (el.closest('[data-solo]')) {
        sfx.click();
        d.remove();
        this.menu();
        return;
      }
      if (el.closest('[data-joinui]')) {
        sfx.click();
        d.remove();
        this.joinUi();
        return;
      }
      if (el.closest('[data-exit]')) this.finish();
    });
  }

  private newGame(i: number, online = false): void {
    const d = document.createElement('div');
    d.className = 'gb-scr';
    let diff: Diff = 1;
    const subs = [t('gb.d0s', 'mais dinheiro'), t('gb.d1s', 'o jeito certo'), t('gb.d2s', 'ouro barato'), t('gb.d3s', 'fogo e pouco dinheiro')];
    const draw = () => {
      d.innerHTML = `<h1>${esc(t('gb.newGame', 'Novo jogo'))}</h1><div class="gb-diffs">${DIFF_NAMES()
        .map((n, k) => `<button data-d="${k}" class="${k === diff ? 'on' : ''}">${esc(n)}<small>${esc(subs[k])}</small></button>`)
        .join('')}</div><div class="gb-row"><button class="gb-btn ghost" data-back>${esc(t('gb.back', 'Voltar'))}</button><button class="gb-btn" data-start>${IC.play}${esc(t('gb.start', 'Começar'))}</button></div>`;
    };
    draw();
    this.wrap.appendChild(d);
    this.popOv = pushBack(() => {
      d.remove();
      this.menu(online);
    });
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const b = el.closest<HTMLElement>('[data-d]');
      if (b) {
        diff = Number(b.dataset.d) as Diff;
        sfx.click();
        draw();
        return;
      }
      if (el.closest('[data-back]')) {
        this.popOv?.();
        this.popOv = null;
        d.remove();
        this.menu(online);
      }
      if (el.closest('[data-start]')) {
        this.popOv?.();
        this.popOv = null;
        d.remove();
        const s = freshSlot((Math.random() * 1e9) | 0, diff);
        writeSlot(i, s);
        void this.start(i, s).then(() => {
          if (online) void this.goOnline();
        });
      }
    });
  }

  /* ============================== online ============================== */
  private myself(): Promise<Me> {
    if (!this.meP)
      this.meP = socialMe()
        .then((m) => ({ id: m.id, name: m.name || displayName() || 'Bloop', skin: m.skin }))
        .catch((e) => {
          this.meP = null;
          throw e;
        });
    return this.meP;
  }
  /** anfitrião: abre a sala com o jogo atual (o save dele) e mostra o código/QR */
  async goOnline(): Promise<void> {
    if (!this.sv || this.mp) {
      if (this.mp) this.openLobby();
      return;
    }
    const offline = () => {
      notify(t('gb.mp.offline', 'Sem internet agora: jogando sozinho'), { icon: 'cloud-off', kind: 'warn' });
    };
    let me: Me;
    try {
      me = await this.myself();
    } catch {
      return offline();
    }
    if (!me.id) return offline();
    let net: GbNet | null = null;
    for (let i = 0; i < 3 && !net; i++) {
      try {
        // grupo: 1ª tentativa com o código do grupo (os amigos já estão esperando nele)
        net = await GbNet.open(this.partyCode && i === 0 ? this.partyCode : newCode(), true, me);
      } catch (e) {
        if ((e as Error).message !== 'taken') break;
      }
    }
    if (!net) return offline();
    if (!this.sv || this.mp) {
      net.leave();
      return;
    }
    const mp = new MpHost(this, net);
    this.mp = mp;
    reportPlaying('garimpo', net.code); // amigos veem "Fulano está jogando — Entrar"
    mp.onPeers = () => this.onPeersChanged();
    this.fire!.onEvent = (k, n) => mp.event(n === undefined ? [k] : [k, Math.round(n)]);
    net.onClose(() => {
      if (this.mp !== mp) return;
      notify(t('gb.mp.lost', 'A conexão caiu: jogando sozinho'), { icon: 'cloud-off', kind: 'warn' });
      this.dropNet();
    });
    this.onPeersChanged();
    this.openLobby();
  }
  /** desliga a rede (o anfitrião continua jogando sozinho) */
  private dropNet(): void {
    stopPlaying();
    this.lobby?.dispose();
    this.lobby = null;
    if (this.fire) this.fire.onEvent = null;
    this.mp?.dispose();
    this.mp = null;
    this.onPeersChanged();
  }
  /** tela da sala (código, QR, quem está, chamar amigos) */
  openLobby(): void {
    const mp = this.mp;
    if (!mp) return;
    const d = this.overlay('', 'gb-lobbyscr');
    this.lobby?.dispose();
    this.lobby = fillLobby(d, {
      code: mp.net.code,
      host: !this.guest,
      me: mp.net.me,
      players: () => mp.list(),
      close: () => this.closeOverlays(),
      leave: () => {
        this.closeOverlays();
        this.leave();
        this.menu();
      },
    });
  }
  onPeersChanged(): void {
    this.lobby?.refresh();
    const n = this.mp ? this.mp.list().length : 0;
    if (!this.mp || !this.hud) {
      this.netChip?.remove();
      this.netChip = null;
      return;
    }
    if (!this.netChip) {
      const b = document.createElement('button');
      b.className = 'gb-chip gb-netc';
      b.setAttribute('data-touch-ignore', '');
      b.addEventListener('click', () => {
        sfx.click();
        this.openLobby();
      });
      this.hud.el.querySelector('.gb-top')?.appendChild(b);
      this.netChip = b as unknown as HTMLDivElement;
    }
    this.netChip.innerHTML = `${IC.friends}<b>${n}/4</b>`;
  }
  /** tela "entrar na sala de um amigo" */
  private joinUi(): void {
    this.closeOverlays();
    const d = document.createElement('div');
    d.className = 'gb-scr';
    this.wrap.appendChild(d);
    const pop = pushBack(() => back());
    let off = () => {};
    const back = () => {
      off();
      pop();
      d.remove();
      this.menu();
    };
    off = fillJoin(d, {
      me: () => this.myself().catch(() => null),
      join: (code) => {
        off();
        pop();
        d.remove();
        this.joinRoom(code);
      },
      back,
    });
    window.setTimeout(() => (d.querySelector('input') as HTMLInputElement | null)?.focus(), 50);
  }
  /** convidado: conecta, espera o mundo do anfitrião e entra no jogo */
  /** código do grupo (o líder abre a sala com ele; ver launch) */
  partyCode = '';
  joinRoom(code: string, tries = 1): void {
    this.closeOverlays();
    const d = document.createElement('div');
    d.className = 'gb-scr';
    d.innerHTML = `<h1>${IC.friends}${esc(t('gb.mp.joining', 'Entrando na sala {c}…', { c: code }))}</h1><div class="gb-spin"></div><button class="gb-btn ghost" data-c>${esc(t('gb.back', 'Voltar'))}</button>`;
    this.wrap.appendChild(d);
    let cancelled = false;
    let net: GbNet | null = null;
    const fail = (msg: string) => {
      if (cancelled) return;
      cancelled = true;
      net?.leave();
      d.remove();
      notify(msg, { icon: 'cloud-off', kind: 'bad' });
      this.menu();
    };
    d.querySelector('[data-c]')!.addEventListener('click', () => {
      sfx.click();
      net?.leave();
      cancelled = true;
      d.remove();
      this.menu();
    });
    void (async () => {
      let me: Me;
      try {
        me = await this.myself();
      } catch {
        return fail(t('gb.mp.offline2', 'Sem internet agora'));
      }
      if (cancelled) return;
      if (!me.id) return fail(t('gb.mp.offline2', 'Sem internet agora'));
      try {
        for (let k = 0; ; k++) {
          try {
            net = await GbNet.open(code, false, me);
            break;
          } catch (e) {
            // grupo: o líder ainda está escolhendo o jogo salvo — espera a sala abrir
            if ((e as Error).message !== 'no_room' || k >= tries - 1 || cancelled) throw e;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      } catch (e) {
        const r = (e as Error).message;
        return fail(r === 'no_room' || r === 'bad_code' ? t('gb.mp.noRoom', 'Sala não encontrada. Confira o código!') : r === 'full' ? t('gb.mp.full', 'A sala está cheia (4 garimpeiros)') : t('gb.mp.offline2', 'Sem internet agora'));
      }
      if (cancelled) {
        net.leave();
        return;
      }
      let init: GuestInit;
      try {
        init = await awaitInit(net);
      } catch {
        return fail(t('gb.mp.lost2', 'A conexão caiu'));
      }
      if (cancelled) {
        net.leave();
        return;
      }
      d.remove();
      this.startGuest(net, init);
    })();
  }
  private startGuest(net: GbNet, init: GuestInit): void {
    const s = freshSlot(init.seed, init.diff);
    s.money = init.money;
    s.upg = init.upg;
    s.terrain = init.terrain;
    s.rain = !!init.rain;
    s.fireT = 1e9;
    s.exportT = 1e9;
    s.tips = ['gold1'];
    s.machines = init.ms.filter((a) => KINDS[a[0]]).map((a) => ({ kind: KINDS[a[0]], x: a[1], z: a[2], yaw: a[3], vol: a[4], gold: a[5] }));
    s.worker = { x: init.x, z: init.z, yaw: init.yaw, vol: 0, gold: 0 };
    const mp = new MpGuest(this, net);
    this.mp = mp;
    mp.setPeers(init.peers);
    net.onClose((why) => {
      if (this.mp !== mp) return;
      notify(why === 'hostLeft' ? t('gb.mp.hostLeft', 'O anfitrião saiu') : t('gb.mp.lost2', 'A conexão caiu'), { icon: 'cloud-off', kind: 'bad', ms: 4000 });
      this.closeOverlays();
      this.leave();
      this.menu();
    });
    void this.start(-1, s, init.slot).then(() => {
      for (const [n, b] of init.burn) this.w?.burnTree(n, b);
      this.onPeersChanged();
      notify(t('gb.mp.welcome', 'Você entrou no garimpo do amigo! O dinheiro é do time.'), { icon: 'user', kind: 'good', ms: 4000 });
    });
  }
  /** convidado: o anfitrião confirmou o lugar nesta máquina */
  enterNet(m: Machine): void {
    if (this.cur !== this.worker) return;
    this.enter(m);
  }
  /** convidado: desce da máquina (send = avisa o anfitrião) */
  exitNet(send: boolean): void {
    const m = this.cur;
    if (!m || m === this.worker) return;
    if (send && m instanceof Heli && m.alt > 0.6) {
      notify(t('gb.landFirst', 'Pouse primeiro!'), { icon: 'warning', kind: 'warn' });
      return;
    }
    if (m instanceof Heli) m.alt = 0;
    if (send) (this.mp as MpGuest).action('exit');
    this.exit();
  }
  barrowCap(): number {
    return BARROW[this.sv?.upg.barrow ?? 0];
  }
  shovelPow(): number {
    return SHOVEL[this.sv?.upg.shovel ?? 0];
  }
  get hopperRecv(): Receiver {
    return this.hopper;
  }
  /** caminhão de exportação: [x, z, rumo] quando está na estrada */
  exportPose(): number[] | null {
    const e = this.exp;
    if (!e.st || !e.mesh) return null;
    const r = (v: number) => Math.round(v * 100) / 100;
    return [r(e.mesh.position.x), r(e.mesh.position.z), r(e.mesh.rotation.y)];
  }
  itemName(id: string): string {
    const it = [...MACHINES, ...HELPERS, ...UPGRADES, ...MINE].find((x) => x.id === id);
    return it ? it.name() : this.proc?.itemName(id) ?? '';
  }
  /** máquina com alguém dentro (eu ou um amigo online) */
  busy(m: Machine): boolean {
    return m === this.cur || !!this.host?.taken(m);
  }
  private nearPortalPos(): boolean {
    const p = this.w!.portal;
    const g = this.worker!.group.position;
    return Math.hypot(g.x - p.x, g.z - p.z) < 4;
  }

  /* ============================== partida ============================== */
  async start(slot: number, s: SlotSave, color = 0): Promise<void> {
    if (!webglOk()) {
      notify(t('gb.noGL', 'Este aparelho não tem 3D'), { kind: 'bad' });
      this.menu();
      return;
    }
    this.slot = slot;
    this.sv = s;
    const tier = this.gov.tier;
    const cv = document.createElement('canvas');
    cv.className = 'gb-cv';
    this.wrap.appendChild(cv);
    this.cv = cv;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: tier >= 2, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    natureAnisotropy(r);
    this.r = r;
    const w = new World();
    this.w = w;
    w.build(s.seed, tier);
    decodeTerrain(w.T, s.terrain);
    w.T.markAll();
    w.T.flush();
    this.applyTier(tier);
    this.env = {
      world: w,
      camYaw: 0,
      receiverAt: (x, y, z, self, slack, drop) => this.receiverAt(x, y, z, self, slack ?? 0, !!drop),
      sfx: (n) => this.sound(n),
      others: this.ms,
    };
    // máquinas do save
    const m = w.map;
    for (const ms of s.machines) {
      const mc = this.addMachine(ms.kind, ms.x, ms.z, ms.yaw);
      mc.cargo.vol = ms.vol;
      mc.cargo.gold = ms.gold;
    }
    setLod(tier <= 1 ? 1 : 0);
    const guest = this.guest;
    const wk = new Worker(guest ? PCOL[color] : undefined);
    wk.ghost = guest;
    this.worker = wk;
    wk.cargo.cap = BARROW[s.upg.barrow];
    wk.digPow = SHOVEL[s.upg.shovel];
    if (s.worker.x < 0) {
      const d0 = m.deposits[0];
      const a = Math.atan2(d0.x - m.camp.x, d0.z - m.camp.z);
      wk.place(m.camp.x + Math.sin(a) * 8, m.camp.z + Math.cos(a) * 8, a, w);
    }
    else wk.place(s.worker.x, s.worker.z, s.worker.yaw, w);
    wk.cargo.vol = s.worker.vol;
    wk.cargo.gold = s.worker.gold;
    w.scene.add(wk.group);
    this.cur = wk;
    if (s.driving >= 0 && this.ms[s.driving] && !guest) this.enter(this.ms[s.driving]);
    this.fire = new Fire(w, s);
    this.water = new WaterSystem(this, s);
    this.proc = new ProcSystem(this, s);
    if (!guest) {
      // convidado: mina, ajudantes e fogo rodam no anfitrião
      if (s.mineOpen) this.openMine();
      for (let i = 0; i < s.bots.drivers; i++) this.drivers.push(new Driver(this));
      for (let i = 0; i < s.bots.miners; i++) this.addMiner();
    }
    this.rainOn = s.rain;
    this.rainK = s.rain ? 1 : 0;
    // HUD
    const hud = new Hud(this.wrap, {
      pause: () => this.openPause(),
      shop: () => this.openShop(),
      enterExit: () => this.enterExit(),
      rain: () => {
        this.rainOn = !this.rainOn;
        this.hud?.setRainIcon(this.rainOn);
        sfx.click();
      },
      cam: () => {
        this.camMode = (this.camMode + 1) % 3;
        sfx.click();
      },
      mode: () => this.toggleExpert(),
      detector: () => {
        this.detOn = !this.detOn;
        sfx.click();
      },
    });
    this.hud = hud;
    this.rp = new RpLayer(this); // RP
    hud.setRainIcon(this.rainOn);
    hud.setKind(this.cur.kind, s.expert);
    setNotifyTop(96);
    setNotifyAlign('center');
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'gb-toast';
    this.wrap.appendChild(this.toastEl);
    this.wrap.addEventListener('pointerdown', this.mineTap);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
    this.resize();
    this.snapCam();
    this.popB = pushBack(() => this.openPause());
    this.startAt = performance.now();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    audio.engineStart();
    this.engineOn = true;
    if (!s.tips.includes('start')) {
      s.tips.push('start');
      window.setTimeout(() => this.say(t('gb.tip.start', 'Ache ouro com o detector, cave com a pá e leve até a lavadora!'), 'detector'), 1200);
    }
  }

  addMachine(kind: Kind, x: number, z: number, yaw: number): Machine {
    const w = this.w!;
    setLod(this.gov.tier <= 1 ? 1 : 0);
    const mc = makeMachine(kind);
    if (mc instanceof Heli) {
      mc.place(x, z, yaw, w);
      mc.attach(w.scene);
    } else mc.veh?.place(x, z, yaw, w.T);
    mc.veh && (mc.veh.onSpray = (px, py, pz, k, dx, dz) => {
      if (Math.random() < 0.35) w.clods.spawn(px, py + 0.15, pz, dx * (2 + k) + (Math.random() - 0.5), 1.5 + Math.random() * 2 * k, dz * (2 + k) + (Math.random() - 0.5), 0.06 + Math.random() * 0.08, 0.35, 0.2, 0.1);
    });
    mc.group.traverse((o) => (o.castShadow = true));
    w.scene.add(mc.group);
    mc.sync(0);
    this.ms.push(mc);
    return mc;
  }

  private addMiner(): void {
    const b = new MinerBot(this, this.miners.length);
    b.worker.cargo.cap = 0.14;
    b.place();
    this.w!.scene.add(b.worker.group);
    this.miners.push(b);
  }
  loadSpot(): { x: number; z: number; yaw: number } {
    const m = this.w!.map;
    const r1 = m.road[m.road.length - 2];
    const yaw = Math.atan2(r1.x - m.mine.x, r1.z - m.mine.z);
    return { x: m.mine.x, z: m.mine.z, yaw };
  }
  /* ---------------- mina subterrânea ---------------- */
  private openMine(): void {
    const s = this.sv!;
    setLod(this.gov.tier <= 1 ? 1 : 0);
    const ug = new Underground(s.seed);
    if (s.ug) ug.load(s.ug);
    ug.cargo.cap = BARROW[s.upg.barrow] * 1.6;
    // o que sobe pela esteira cai na baia: caminhão parado embaixo, ou um monte rico no chão
    ug.onHopper = (vol, gold) => {
      const b = this.w!.bay;
      const y = this.w!.T.heightAt(b.x, b.z) + 1.5;
      const rc = this.receiverAt(b.x, y, b.z, null, 1.0);
      let took = 0;
      if (rc && rc !== this.hopper) took = rc.take(vol, gold);
      if (took < vol) {
        this.w!.T.deposit(b.x, b.z, vol - took, 1.8, gold / vol);
        this.w!.T.relax(b.x, b.z, 3);
      }
      this.toast('+' + gold.toFixed(1) + ' g');
    };
    this.ug = ug;
  }
  private nearPortal(): boolean {
    const p = this.w!.portal;
    const g = this.worker!.group.position;
    return !!this.ug && Math.hypot(g.x - p.x, g.z - p.z) < 4;
  }
  private enterMine(): void {
    const ug = this.ug!;
    ug.enterAt();
    ug.cargo.vol = this.worker!.cargo.vol;
    ug.cargo.gold = this.worker!.cargo.gold;
    this.worker!.cargo.vol = this.worker!.cargo.gold = 0;
    this.inMine = true;
    this.camYaw = 0;
    this.mineCamera(0, true);
    sfx.door();
    this.mineBar(true);
    if (!this.sv!.tips.includes('mine')) {
      this.sv!.tips.push('mine');
      this.say(t('gb.tip.mine', 'Cave a rocha com a picareta. Ponha trilhos, vagonetas, gerador e lâmpadas!'));
    }
  }
  private leaveMine(): void {
    const ug = this.ug!;
    this.worker!.cargo.vol = Math.min(this.worker!.cargo.cap, ug.cargo.vol);
    this.worker!.cargo.gold = ug.cargo.vol > 0 ? (ug.cargo.gold * this.worker!.cargo.vol) / ug.cargo.vol : 0;
    ug.cargo.vol = ug.cargo.gold = 0;
    this.inMine = false;
    const p = this.w!.portal;
    this.worker!.place(p.x + Math.sin(p.yaw) * 3, p.z + Math.cos(p.yaw) * 3, p.yaw, this.w!);
    ug.tool = 'none';
    ug.showGhost(-1);
    this.mineBar(false);
    this.snapCam();
  }
  /** barra de ferramentas da mina: trilho, lâmpada, gerador (toque na célula = fantasma; toque de novo = coloca) */
  private mineBar(on: boolean): void {
    this.ugBar?.remove();
    this.ugBar = null;
    if (!on) return;
    const d = document.createElement('div');
    d.className = 'gb-ugbar';
    d.setAttribute('data-touch-ignore', '');
    const tools: [Tool, IconKey, number][] = [
      ['rail', 'tracks', UG_PRICE.rail],
      ['lamp', 'sun', UG_PRICE.lamp],
      ['gen', 'bolt', UG_PRICE.gen],
    ];
    d.innerHTML = tools.map(([k, ic, pr]) => `<button class="gb-b" data-tool="${k}">${IC[ic]}<span>${pr}</span></button>`).join('');
    d.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]');
      if (!b) return;
      e.stopPropagation();
      const ug = this.ug!;
      ug.tool = ug.tool === b.dataset.tool ? 'none' : (b.dataset.tool as Tool);
      d.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.tool === ug.tool));
      ug.showGhost(-1);
      sfx.click();
    });
    this.wrap.appendChild(d);
    this.ugBar = d;
  }
  /** toque na mina com ferramenta: 1º toque mostra o fantasma, 2º na mesma célula coloca */
  private mineTap = (e: PointerEvent): void => {
    const ug = this.ug;
    if (!this.inMine || !ug || ug.tool === 'none' || e.target !== this.cv) return;
    const r = this.cv!.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.w!.camera);
    const hit = _ray.ray.intersectPlane(_floor, _v);
    if (!hit) return;
    const k = ug.cellAt(hit.x, hit.z);
    if (k < 0) return;
    if (ug.ghostCell === k) {
      const price = UG_PRICE[ug.tool as 'rail' | 'lamp' | 'gen'];
      if (this.sv!.money < price) {
        notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
        return;
      }
      if (ug.place(k)) {
        this.sv!.money -= price;
        sfx.thunk();
        ug.showGhost(-1);
      } else sfx.knob();
    } else ug.showGhost(k);
  };
  /** câmera da mina: 3ª pessoa atrás do mineiro, dentro do túnel (braço-mola não entra na rocha) */
  private mineCamera(dt: number, snap = false): void {
    const ug = this.ug!;
    const cam = this.w!.camera;
    const [dYaw, dPitch] = this.hud!.look.consume(dt);
    if (dYaw || dPitch) {
      this.camYaw -= dYaw;
      this.lookPitch = Math.max(-0.3, Math.min(0.5, this.lookPitch + dPitch));
      this.lookIdle = 0;
    } else this.lookIdle += dt;
    // andando: a câmera volta devagar para trás do mineiro
    if (ug.moving && this.lookIdle > 1.2) {
      const d = Math.atan2(Math.sin(ug.yaw - this.camYaw), Math.cos(ug.yaw - this.camYaw));
      this.camYaw += d * Math.min(1, dt * 1.4);
    }
    const p = ug.pos;
    const k = [1, 1.35, 0.75][this.camMode];
    const dist = 3.7 * k;
    const tx = p.x;
    const ty = 1.4;
    const tz = p.z;
    const sx = Math.sin(this.camYaw);
    const sz = Math.cos(this.camYaw);
    const f = ug.armClamp(tx, tz, tx - sx * dist, tz - sz * dist);
    const d2 = Math.max(0.7, dist * f);
    const want = new THREE.Vector3(tx - sx * d2, Math.min(WALL_H - 0.38, ty + 0.85 + (1 - d2 / dist) * 0.7 + this.lookPitch * 1.2), tz - sz * d2);
    // aproxima suave; encolher o braço (parede chegando) é imediato
    if (snap || this.camPos.distanceTo(want) > 6) this.camPos.copy(want);
    else {
      const curD = Math.hypot(this.camPos.x - tx, this.camPos.z - tz);
      const kk = Math.min(1, dt * 7);
      this.camPos.lerp(want, kk);
      if (curD > d2 + 0.05) {
        const nd = Math.hypot(this.camPos.x - tx, this.camPos.z - tz) || 1;
        const m = Math.min(1, d2 / nd);
        this.camPos.x = tx + (this.camPos.x - tx) * m;
        this.camPos.z = tz + (this.camPos.z - tz) * m;
      }
    }
    cam.position.copy(this.camPos);
    cam.lookAt(tx, ty + 0.05, tz);
    ug.setView(cam.position, _v.set(tx, 1.1, tz));
  }

  /** onde uma máquina nova aparece (na frente da garagem, sem bater em ninguém) */
  private spawnSpot(kind: Kind): [number, number, number] {
    const m = this.w!.map;
    if (kind === 'heli') return [m.camp.x, m.camp.z, 0];
    const w = this.w!;
    // livre de outras máquinas e de prédios/árvores (a lavadora às vezes fica perto da garagem)
    const free = (x: number, z: number) => {
      if (x < 12 || z < 12 || x > 180 || z > 180) return false;
      if (!this.ms.every((o) => o.pos.distanceTo(_v.set(x, o.pos.y, z)) > 6)) return false;
      let ok = true;
      w.near(x, z, (c) => {
        if (Math.hypot(c.x - x, c.z - z) < c.r + 3.2) ok = false;
      });
      for (const b of w.blockers) if (Math.hypot(b.x - x, b.z - z) < b.r + 2.5) ok = false;
      return ok && w.waterY(x, z) < w.T.heightAt(x, z);
    };
    for (const oz of [13, 21, 29])
      for (const ox of [-6, 0, 6, -12, 12, 18, -18])
        if (free(m.garage.x + ox, m.garage.z + oz)) return [m.garage.x + ox, m.garage.z + oz, 0];
    return [m.garage.x, m.garage.z + 24, 0];
  }

  /* ---------------- moega, caçambas ---------------- */
  hopperPos(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 1.4, 6);
    return this.w!.plant.root.localToWorld(out);
  }
  private hopper: Receiver = {
    take: (vol, gold) => {
      const s = this.sv!;
      s.plantVol += vol;
      s.plantGold += gold;
      return vol;
    },
  };
  receiverAt(x: number, y: number, z: number, self: Machine | null, slack: number, drop = false): Receiver | null {
    const hp = this.hopperPos(_v2);
    if (Math.hypot(x - hp.x, z - hp.z) < 2.4 + slack && y > hp.y - 2 && y < hp.y + 7) return this.hopper;
    const pr = this.proc?.receiverAt(x, y, z, slack);
    if (pr) return pr;
    for (const m of this.ms) {
      if (m === self) continue;
      // drop: a terra cai — conta a altura da caçamba (acima ou um pouco abaixo da boca da caçamba da escavadeira)
      const py = drop ? m.pos.y + 1.2 : y;
      if ((m instanceof Truck || m instanceof Pickup) && m.inBed(_v.set(x, py, z), slack * 0.5)) {
        return {
          take: (vol, gold) => {
            const room = Math.max(0, m.cargo.cap * 1.08 - m.cargo.vol);
            const v = Math.min(vol, room);
            m.cargo.vol += v;
            m.cargo.gold += vol > 0 ? (gold * v) / vol : 0;
            return v;
          },
        };
      }
    }
    return null;
  }

  /* ---------------- entrar / sair ---------------- */
  private nearMachine(): Machine | null {
    const wk = this.worker!;
    let best: Machine | null = null;
    let bd = 1e9;
    const mp = this.mp;
    for (const m of this.ms) {
      // com amigo dentro não dá para entrar
      if (mp instanceof MpGuest ? mp.taken.has(this.ms.indexOf(m)) : mp?.taken(m)) continue;
      const d = m.pos.distanceTo(wk.group.position) - m.rad;
      if (d < 2.6 && d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
  enterExit(): void {
    if (this.mp instanceof MpGuest) {
      const mp = this.mp;
      if (this.cur === this.worker) {
        const m = this.nearMachine();
        if (m) {
          mp.asking = this.ms.indexOf(m);
          mp.action('enter', { m: mp.asking });
        } else if (this.sv!.mineOpen && this.nearPortalPos()) notify(t('gb.mp.mineHost', 'A mina subterrânea é só do anfitrião por enquanto'), { icon: 'warning' });
      } else this.exitNet(true);
      return;
    }
    if (this.inMine) {
      const ug = this.ug!;
      if (Math.hypot(ug.pos.x - ug.cx(ug.entrance), ug.pos.z - ug.cz(ug.entrance)) < UGCS * 2.3) this.leaveMine();
      return;
    }
    if (this.cur === this.worker && this.nearPortal()) {
      this.enterMine();
      return;
    }
    if (this.cur === this.worker) {
      const m = this.nearMachine();
      if (m) this.enter(m);
    } else this.exit();
  }
  private enter(m: Machine): void {
    const wk = this.worker!;
    wk.group.visible = false;
    this.cur = m;
    m.veh?.wake();
    if (m.veh) m.veh.input.hand = false;
    this.hud?.setKind(m.kind, this.sv!.expert);
    sfx.door();
    tap('light');
    this.lookYaw = 0;
    if (!this.sv!.tips.includes('k-' + m.kind)) {
      this.sv!.tips.push('k-' + m.kind);
      const tips: Partial<Record<Kind, string>> = {
        excavator: t('gb.tip.exc', 'Segure CAVAR para encher a caçamba. Gire e DESPEJE no caminhão!'),
        truck: t('gb.tip.truck', 'Leve a terra até a lavadora e levante a CAÇAMBA de ré na moega.'),
        dozer: t('gb.tip.dozer', 'Abaixe a lâmina e empurre a terra de cima para chegar no ouro.'),
        heli: t('gb.tip.heli', 'Suba, encha o balde no lago e solte a água no fogo!'),
        pickup: t('gb.tip.pickup', 'Encha a caçamba com a pá e descarregue na lavadora.'),
      };
      const tp = tips[m.kind];
      if (tp) window.setTimeout(() => this.say(tp), 400);
    }
  }
  private exit(): void {
    const m = this.cur!;
    if (m instanceof Heli && m.alt > 0.6) {
      notify(t('gb.landFirst', 'Pouse primeiro!'), { icon: 'warning', kind: 'warn' });
      return;
    }
    const wk = this.worker!;
    m.group.updateMatrixWorld();
    _v.copy(m.door);
    m.group.localToWorld(_v);
    wk.place(_v.x, _v.z, m.yaw(), this.w!);
    wk.group.visible = true;
    if (m.veh) {
      m.veh.input.gas = m.veh.input.brake = m.veh.input.steer = 0;
      m.veh.input.hand = true;
    }
    this.cur = wk;
    this.hud?.setKind('worker', this.sv!.expert);
    sfx.door();
    this.drivers.find((d) => d.truck === m)?.resume();
  }

  private toggleExpert(): void {
    const s = this.sv!;
    s.expert = !s.expert;
    this.hud?.setKind(this.cur!.kind, s.expert);
    notify(s.expert ? t('gb.expertOn', 'Modo DIFÍCIL: câmbio, 4x4, bloqueio e pneus') : t('gb.expertOff', 'Modo SIMPLES: só acelerar, frear e virar'), { icon: 'gear' });
    sfx.click();
  }

  /* ============================== laço ============================== */
  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const el = now - this.last;
    this.last = now;
    if (this.w && this.mp) this.host?.tick(Math.min(0.25, el / 1000));
    // online o mundo não para por causa de uma tela (loja, sala, pausa): só o meu controle solta
    // RP: a estrada (fase própria) toma o quadro
    if (this.w && this.r && this.rp?.takeover(Math.min(0.066, Math.max(0, el / 1000)))) return;
    if ((this.paused && !this.mp) || !this.w || !this.r) return;
    const w0 = performance.now();
    const dt = Math.min(0.066, Math.max(0, el / 1000));
    for (let i = 0; i < this.speedup; i++) this.step(dt);
    const w1 = performance.now();
    this.render();
    const w2 = performance.now();
    this.prof.step += (w1 - w0 - this.prof.step) * 0.05;
    this.prof.render += (w2 - w1 - this.prof.render) * 0.05;
    this.gov.sample(el, performance.now() - w0);
  };

  private idleCtl = newCtl();
  step(dt: number): void {
    if (this.guest) return this.stepGuest(dt);
    const w = this.w!;
    const s = this.sv!;
    const hud = this.hud!;
    this.time += dt;
    s.played += dt;
    const ctl = this.paused ? this.idleCtl : hud.read(dt);
    this.rp?.pre(dt, ctl); // RP
    this.env.camYaw = this.camYaw;
    const cur = this.cur!;
    // ferramentas e entradas (por quadro)
    if (this.inMine)
      this.ug!.step(dt, ctl, this.camYaw, (k) => {
        if (k === 'full') this.sound('full');
        else if (k === 'hit') sfx.knob();
        else if (k === 'ore') sfx.thud();
        else sfx.splat();
      });
    else this.worker!.update(dt, cur === this.worker ? ctl : null, this.env);
    this.host?.step(dt);
    for (const d of this.drivers) {
      d.claim(this.drivers);
      d.update(dt);
    }
    for (const b of this.miners) b.update(dt, this.env);
    for (const m of this.ms) {
      const seat = m === cur ? null : this.host?.seat(m) ?? null;
      const drv = m === cur || seat ? null : this.drivers.find((d) => d.truck === m);
      // amigo dirigindo: a câmera dele vale (garimpeiro/helicóptero andam relativos à tela)
      if (seat) this.env.camYaw = seat.cy;
      m.update(dt, m === cur ? ctl : seat ? seat.ctl : drv ? drv.ctl : null, this.env);
      this.env.camYaw = this.camYaw;
    }
    // física em passos fixos de 1/120 s
    this.acc += dt;
    const h = 1 / 120;
    let n = 0;
    const p0 = performance.now();
    while (this.acc >= h && n < 8) {
      for (const m of this.ms) m.physics(h, this.env, m === cur || this.drivers.some((d) => d.truck === m) || !!this.host?.seat(m));
      this.acc -= h;
      n++;
    }
    if (n >= 8) this.acc = 0;
    this.prof.phys += (performance.now() - p0 - this.prof.phys) * 0.05;
    collide(this.ms, w);
    for (const m of this.ms) m.sync(dt);
    // fuga: virou? desvira sozinho depois de 2 s
    if (cur.veh && cur.veh.flipped() && Math.abs(cur.veh.speed) < 1) {
      this.hintT += dt;
      if (this.hintT > 2) {
        this.hintT = 0;
        const v = cur.veh;
        v.place(v.pos.x, v.pos.z, v.yaw(), w.T);
        notify(t('gb.unflip', 'Desvirado!'), { icon: 'refresh' });
      }
    }
    // máquinas dos ajudantes também se desviram sozinhas
    for (const m of this.ms) {
      const v = m.veh;
      if (!v || m === cur || v.asleep) continue;
      if (v.flipped()) {
        this.flipT.set(m, (this.flipT.get(m) ?? 0) + dt);
        if ((this.flipT.get(m) ?? 0) > 2) {
          v.place(v.pos.x, v.pos.z, v.yaw(), w.T);
          this.flipT.delete(m);
        }
      }
    }
    this.plantStep(dt);
    this.proc?.step(dt);
    this.exportStep(dt);
    this.fire!.step(dt, this);
    this.rainStep(dt);
    // som do motor
    if (cur.veh) audio.engineSet(Math.max(cur.veh.input.gas, cur.veh.input.brake), Math.min(1, cur.veh.rpm));
    else if (cur instanceof Heli) audio.engineSet(0.6, 0.9);
    else audio.engineSet(0, 0);
    if (this.inMine) this.mineCamera(dt);
    else this.camera(dt);
    // pickup descarregando na moega
    if (cur instanceof Pickup && ctl.act2 && cur.pos.distanceTo(this.hopperPos(_v)) < 9) cur.unload(dt, this.hopper);
    this.present(dt);
    // autosave
    this.saveT += dt;
    if (this.saveT > 45) {
      this.saveT = 0;
      this.persist();
    }
  }

  private rainStep(dt: number): void {
    const w = this.w!;
    this.rainK += ((this.rainOn ? 1 : 0) - this.rainK) * Math.min(1, dt * 0.4);
    w.T.rain = Math.max(w.T.rain * (1 - dt * 0.01), this.rainK * Math.min(1, w.T.rain + dt * 0.02));
    if (!this.rainOn) w.T.rain = Math.max(0, w.T.rain - dt * 0.004);
    w.T.uRain.value = w.T.rain;
    w.setRain(this.rainK);
    this.sv!.rain = this.rainOn;
    this.water?.step(dt);
  }

  /** convidado: não simula — mostra o que o anfitrião manda, anda o próprio garimpeiro e manda a entrada */
  private stepGuest(dt: number): void {
    const s = this.sv!;
    const mp = this.mp as MpGuest;
    this.time += dt;
    s.played += dt;
    const ctl = this.paused ? this.idleCtl : this.hud!.read(dt);
    this.rp?.pre(dt, ctl); // RP
    this.env.camYaw = this.camYaw;
    const cur = this.cur!;
    mp.frame(dt);
    if (cur === this.worker) this.worker.update(dt, ctl, this.env);
    else if (cur instanceof Excavator) cur.cam.yawOff = cur.swing + (ctl.drive ? 0 : 0.38);
    mp.sendInput(ctl, dt);
    this.rainStep(dt);
    if (cur.veh) audio.engineSet(Math.max(ctl.gas, ctl.brake), Math.min(1, 0.25 + Math.abs(cur.veh.speed) / 9));
    else if (cur instanceof Heli) audio.engineSet(0.6, 0.9);
    else audio.engineSet(0, 0);
    this.camera(dt);
    this.plantSpin = mp.plantSpin;
    this.plantVisual(dt);
    this.proc?.step(dt);
    // a mina subterrânea é só do anfitrião nesta versão
    this.mineNoteT -= dt;
    if (s.mineOpen && cur === this.worker && this.nearPortalPos() && this.mineNoteT <= 0) {
      this.mineNoteT = 10;
      notify(t('gb.mp.mineHost', 'A mina subterrânea é só do anfitrião por enquanto'), { icon: 'warning' });
    }
    this.present(dt);
  }

  /** o que todo mundo vê: detector, seta, HUD, partículas e terreno */
  private present(dt: number): void {
    const w = this.w!;
    const s = this.sv!;
    const hud = this.hud!;
    const cur = this.cur!;
    // detector
    const det = !this.inMine && this.detOn && (cur === this.worker || cur.kind === 'excavator' || cur.kind === 'pickup') ? this.detect(cur.pos.x, cur.pos.z) : null;
    if (det !== null) {
      this.detV += (det - this.detV) * Math.min(1, dt * 4);
      this.detBeep -= dt;
      if (this.detV > 0.15 && this.detBeep <= 0) {
        this.detBeep = 1.3 - this.detV * 1.15;
        audio.tick(Math.min(4, Math.floor(this.detV * 5)));
      }
    }
    // seta para o objetivo
    let arrow: { a: number; icon: IconKey; dist: number } | null = null;
    const fp = this.mp instanceof MpGuest ? this.mp.fireTgt : this.fire!.target();
    if (fp) arrow = this.arrowTo(fp.x, fp.z, 'fire');
    else if (cur.fill > 0.9) {
      this.hopperPos(_v);
      arrow = this.arrowTo(_v.x, _v.z, 'plant');
    } else if (!s.tips.includes('gold1') && cur === this.worker) {
      // primeira vez: leva até a jazida rasa perto do acampamento
      const d0 = w.map.deposits[0];
      if (Math.hypot(d0.x - cur.pos.x, d0.z - cur.pos.z) > 5) arrow = this.arrowTo(d0.x, d0.z, 'detector');
    }
    if (!s.tips.includes('gold1') && s.stock > 0) s.tips.push('gold1');
    const hp = this.hopperPos(_v);
    const nearHopper = cur.pos.distanceTo(hp) < 9;
    hud.update({
      money: s.money,
      stock: s.stock,
      fill: this.inMine ? this.ug!.cargo.vol / this.ug!.cargo.cap : cur.fill,
      cargoGold: this.inMine ? this.ug!.cargo.gold : cur.cargo.gold,
      rpm: cur.veh ? cur.veh.rpm : 0,
      gear: cur.veh ? cur.veh.gear : 1,
      auto: cur.veh ? cur.veh.input.auto : true,
      det: det === null ? null : this.detV,
      arrow,
      canEnter: this.inMine ? Math.hypot(this.ug!.pos.x - this.ug!.cx(this.ug!.entrance), this.ug!.pos.z - this.ug!.cz(this.ug!.entrance)) < UGCS * 2.3 : cur === this.worker ? !!this.nearMachine() || this.nearPortal() : false,
      hot2: (nearHopper && cur.fill > 0.01) || (cur === this.worker && cur.fill > 0.01 && !!this.bedNear()),
      water: cur === this.worker && (this.worker!.water > 0 || this.atWater()),
    });
    // partículas, terreno
    w.clods.update(dt, w.T, w.waterY);
    w.drops.update(dt, w.T, w.waterY);
    w.rain.update(this.time, this.camPos, this.rainK);
    w.veg?.update(this.time, this.camPos.x, this.camPos.y, this.camPos.z, cur.pos.x, cur.pos.z, cur === this.worker ? 0.6 : cur.veh ? cur.rad * 1.2 : 0);
    const f0 = performance.now();
    w.T.flush();
    this.prof.flush += (performance.now() - f0 - this.prof.flush) * 0.05;
    this.rp?.post(dt); // RP
  }

  private atWater(): boolean {
    const g = this.worker!.group;
    const x = g.position.x + Math.sin(g.rotation.y) * 1.3;
    const z = g.position.z + Math.cos(g.rotation.y) * 1.3;
    return this.w!.waterY(x, z) > this.w!.T.heightAt(x, z) + 0.15;
  }
  private bedNear(): Machine | null {
    const wk = this.worker!;
    const fx = wk.group.position.x + Math.sin(wk.group.rotation.y) * 1.6;
    const fz = wk.group.position.z + Math.cos(wk.group.rotation.y) * 1.6;
    for (const m of this.ms) if ((m instanceof Truck || m instanceof Pickup) && m.inBed(_v.set(fx, wk.group.position.y + 1, fz), 0.9)) return m;
    return null;
  }

  private arrowTo(x: number, z: number, icon: IconKey): { a: number; icon: IconKey; dist: number } {
    const p = this.cur!.pos;
    const a = Math.atan2(x - p.x, z - p.z);
    const rel = a - this.camYaw;
    return { a: -rel, icon, dist: Math.hypot(x - p.x, z - p.z) };
  }

  /** sinal do detector 0..1: teor alcançável perto (fundo demais quase não apita) */
  private detect(x: number, z: number): number {
    const T = this.w!.T;
    let best = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++) {
        const px = x + a * 1.6;
        const pz = z + b * 1.6;
        const k = T.idx(px, pz);
        const dug = Math.max(0, T.h0[k] - T.h[k]);
        const reach = Math.max(0, T.oreD[k] - dug - 1.2);
        const v = T.oreR[k] * Math.exp(-(a * a + b * b) * 0.32) * Math.exp(-reach / 2.2);
        if (v > best) best = v;
      }
    return 1 - Math.exp(-best / 18);
  }

  /* ---------------- lavadora ---------------- */
  private plantStep(dt: number): void {
    const s = this.sv!;
    const w = this.w!;
    const pl = w.plant;
    if (s.plantVol > 1e-4) {
      const v0 = Math.min(s.plantVol, PLANT_RATE[s.upg.plant] * (this.proc ? this.proc.rateMul() : 1) * dt);
      const v = this.water ? this.water.wash(v0) : v0;
      const g = (s.plantGold * v) / s.plantVol;
      s.plantVol -= v;
      s.plantGold -= g;
      if (s.plantVol < 1e-4) s.plantVol = s.plantGold = 0;
      // beneficiamento: só a parte recuperada vira ouro (o resto sai no rejeito)
      const got = this.proc ? this.proc.plantFeed(v, g) : g;
      s.stock += got;
      this.goldToast += got;
      this.tail += v;
      this.plantSpin = Math.min(1, this.plantSpin + dt * 2);
      // água na calha
      if (Math.random() < 0.6) {
        _v.set(2.6, 1.3, 1.6);
        pl.root.localToWorld(_v);
        w.drops.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, 0.08, 0.6, 0.8, 1);
      }
    } else this.plantSpin = Math.max(0, this.plantSpin - dt);
    // rejeito sai pela esteira e forma um monte atrás
    if (this.tail > 0.15) {
      _v.set(0, 0, -10.2);
      pl.root.localToWorld(_v);
      w.T.deposit(_v.x, _v.z, this.tail, 1.8, this.proc ? this.proc.tailGrade(this.tail, _v.x, _v.z) : 0.05);
      w.T.relax(_v.x, _v.z, 3);
      this.tail = 0;
    }
    this.goldToastT -= dt;
    if (this.goldToast > 0.05 && this.goldToastT <= 0 && s.plantVol < 1e-3) {
      this.toast('+' + (this.goldToast < 10 ? this.goldToast.toFixed(1) : Math.round(this.goldToast)) + ' g');
      audio.coin(2);
      this.goldToast = 0;
      this.goldToastT = 1.5;
    }
    this.plantVisual(dt);
  }
  /** trommel girando, água na calha e barras no estoque (anfitrião e convidado) */
  private plantVisual(dt: number): void {
    const s = this.sv!;
    const pl = this.w!.plant;
    pl.trommel.rotation.x += dt * 2.2 * this.plantSpin;
    const wm = pl.water.material as THREE.MeshPhongMaterial;
    if (wm.map) wm.map.offset.y -= dt * (0.4 + this.plantSpin * 1.6);
    // barras no estoque
    const bars = this.w!.stock.bars;
    const n = Math.min(200, Math.ceil(s.stock / 20));
    if (n !== bars.count) {
      const m4 = new THREE.Matrix4();
      for (let i = bars.count; i < n; i++) {
        const layer = Math.floor(i / 40);
        const k = i % 40;
        m4.makeTranslation(-2.6 + (k % 10) * 0.55, 1.03 + layer * 0.15, -2.4 + Math.floor(k / 10) * 0.45);
        bars.setMatrixAt(i, m4);
      }
      bars.count = n;
      bars.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------------- caminhão de exportação ---------------- */
  private exportStep(dt: number): void {
    const s = this.sv!;
    const w = this.w!;
    const e = this.exp;
    const path = w.map.gateRoad;
    if (e.st === 0) {
      s.exportT -= dt;
      if (s.exportT <= 0) {
        s.exportT = EXPORT_EVERY[s.diff];
        if (s.stock < 0.5) return;
        e.st = 1;
        e.seg = 0;
        e.d = 0;
        if (!e.mesh) {
          e.mesh = buildExportTruck();
          w.scene.add(e.mesh);
        }
        e.mesh.visible = true;
        notify(t('gb.exportComing', 'O caminhão do ouro está chegando!'), { icon: 'bag' });
      }
      return;
    }
    const m = e.mesh!;
    const sp = 7;
    const move = (dir: 1 | -1) => {
      // anda ao longo da polilinha (ida 1, volta -1)
      const pts = dir === 1 ? path : [...path].reverse();
      const a = pts[e.seg];
      const b = pts[e.seg + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      e.d += sp * dt;
      if (e.d >= L) {
        e.d -= L;
        e.seg++;
        if (e.seg >= pts.length - 1) return true;
      }
      const a2 = pts[e.seg];
      const b2 = pts[Math.min(pts.length - 1, e.seg + 1)];
      const L2 = Math.hypot(b2.x - a2.x, b2.z - a2.z) || 1;
      const k = Math.min(1, e.d / L2);
      const x = a2.x + (b2.x - a2.x) * k;
      const z = a2.z + (b2.z - a2.z) * k;
      m.position.set(x, w.T.heightAt(x, z), z);
      m.rotation.y = Math.atan2(b2.x - a2.x, b2.z - a2.z);
      return false;
    };
    if (e.st === 1) {
      if (move(1)) {
        e.st = 2;
        e.t = 4;
      }
    } else if (e.st === 2) {
      e.t -= dt;
      if (e.t <= 0) {
        const take = s.stock <= 60 ? s.stock : Math.max(60, s.stock * 0.35);
        const pay = Math.round(take * GOLD_PRICE[s.diff]);
        s.stock -= take;
        s.sold += take;
        s.money += pay;
        this.earned += pay;
        this.soldSession += take;
        bigMoment(t('gb.sold', 'Vendido! +{n}', { n: pay.toLocaleString('pt-BR') }), { icon: 'coins', sub: Math.round(take) + ' g' });
        this.host?.event(['sold', pay, Math.round(take)]);
        audio.cash();
        this.say(t('gb.soldSay', 'O caminhão levou o ouro. Dinheiro na conta!'));
        e.st = 3;
        e.seg = 0;
        e.d = 0;
      }
    } else if (e.st === 3) {
      if (move(-1)) {
        e.st = 0;
        m.visible = false;
      }
    }
  }

  /* ---------------- câmera ---------------- */
  private snapCam(): void {
    const c = this.cur!;
    this.camYaw = c.yaw() + c.cam.yawOff;
    this.camera(1, true);
  }
  private camera(dt: number, snap = false): void {
    const w = this.w!;
    const c = this.cur!;
    const cam = w.camera;
    const [dYaw, dPitch] = this.hud!.look.consume(dt);
    if (dYaw || dPitch) {
      this.lookYaw -= dYaw;
      this.lookPitch = Math.max(-0.35, Math.min(0.6, this.lookPitch + dPitch));
      this.lookIdle = 0;
    } else this.lookIdle += dt;
    const moving = c.veh ? Math.abs(c.veh.speed) > 1.5 : c instanceof Worker ? c.speedNow > 0.5 : false;
    if (this.lookIdle > 2.5 && moving) {
      this.lookYaw *= 1 - Math.min(1, dt * 1.5);
      this.lookPitch *= 1 - Math.min(1, dt * 1.5);
    }
    // o garimpeiro e o helicóptero: câmera só segue devagar (andam relativos à tela)
    const free = c instanceof Worker || c instanceof Heli;
    let want = c.yaw() + c.cam.yawOff;
    // dando ré até a moega: câmera de lado mostra caminhão e moega juntos
    if (c instanceof Truck && c.veh && (c.veh.gear < 0 || c.tilt > 0.1) && c.pos.distanceTo(this.hopperPos(_v2)) < 22) want += 1.15;
    if (free) {
      if (!moving) want = this.camYaw - this.lookYaw;
      else want = this.camYaw - this.lookYaw + Math.atan2(Math.sin(want - this.camYaw), Math.cos(want - this.camYaw)) * 0.5;
    }
    // ré: câmera não gira para frente do caminhão de repente
    let d = want - this.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camYaw += snap ? d : d * Math.min(1, dt * (free ? 2.2 : 3));
    const yaw = this.camYaw + (free ? 0 : this.lookYaw);
    if (free) {
      this.camYaw += this.lookYaw;
      this.lookYaw = 0;
    }
    const mul = [1, 1.6, 0.72][this.camMode];
    const dist = c.cam.dist * mul;
    const hgt = c.cam.height * mul * (1 + this.lookPitch * 1.4);
    const p = c.pos;
    // a pé: mira um pouco à frente (o carrinho de mão aparece na tela)
    const fwd = c instanceof Worker ? 1.3 : 0;
    const tx = p.x + Math.sin(c.yaw()) * fwd;
    const ty = p.y + c.cam.look;
    const tz = p.z + Math.cos(c.yaw()) * fwd;
    let cx = tx - Math.sin(yaw) * dist;
    let cz = tz - Math.cos(yaw) * dist;
    let cy = ty + hgt;
    // nunca dentro do terreno: sobe acima do chão na câmera e no meio do caminho
    const T = w.T;
    for (let i = 1; i <= 3; i++) {
      const k = i / 3;
      const gx = tx + (cx - tx) * k;
      const gz = tz + (cz - tz) * k;
      const need = T.heightAt(gx, gz) + 1.1 - (ty + (cy - ty) * k);
      if (need > 0) cy += need / k;
    }
    cx = Math.max(2, Math.min(190, cx));
    cz = Math.max(2, Math.min(190, cz));
    const kk = snap ? 1 : Math.min(1, dt * 6);
    this.camPos.x += (cx - this.camPos.x) * kk;
    this.camPos.y += (cy - this.camPos.y) * kk;
    this.camPos.z += (cz - this.camPos.z) * kk;
    const floor = T.heightAt(this.camPos.x, this.camPos.z) + 0.9;
    if (this.camPos.y < floor) this.camPos.y = floor;
    // prédios: câmera não entra — encurta até a parede e, se ficar perto demais, sobe por cima do telhado
    {
      let tMin = 1;
      let roof = 0;
      const dx = this.camPos.x - tx;
      const dz = this.camPos.z - tz;
      const L2 = dx * dx + dz * dz || 1;
      for (const b of w.blockers) {
        if (this.camPos.y > b.y + 0.5) continue;
        // entrada do segmento alvo→câmera no círculo do prédio
        const fx = tx - b.x;
        const fz = tz - b.z;
        const bb = fx * dx + fz * dz;
        const cc = fx * fx + fz * fz - b.r * b.r;
        if (cc < 0) continue; // alvo já está dentro (ex.: garagem): deixa
        const disc = bb * bb - L2 * cc;
        if (disc < 0) continue;
        const t0 = (-bb - Math.sqrt(disc)) / L2;
        if (t0 > 0 && t0 < tMin) {
          tMin = t0;
          roof = b.y;
        }
      }
      if (tMin < 1) {
        const k = Math.max(0.35, tMin - 0.06);
        this.camPos.x = tx + dx * k;
        this.camPos.z = tz + dz * k;
        if (tMin < 0.5) this.camPos.y = Math.max(this.camPos.y, roof + 1);
      }
    }
    cam.position.copy(this.camPos);
    cam.lookAt(tx, ty, tz);
    if (this.camOverride) {
      const o = this.camOverride;
      cam.position.set(o[0], o[1], o[2]);
      cam.lookAt(o[3], o[4], o[5]);
    }
    w.follow(tx, tz);
    // árvores entre a câmera e o jogador somem (nunca tapam a vista)
    w.veg?.occlude(cam.position.x, cam.position.z, tx, tz);
    this.water?.camFx(cam, dt);
  }
  camOverride: number[] | null = null;
  /** testes: passos de simulação por quadro */
  speedup = 1;
  private flipT = new Map<Machine, number>();
  prof = { step: 0, render: 0, phys: 0, flush: 0 };

  private render(): void {
    if (this.mp && this.w) this.mp.tags(this.w.camera);
    this.r!.render(this.inMine && this.ug ? this.ug.scene : this.w!.scene, this.w!.camera);
  }

  /* ---------------- qualidade ---------------- */
  private applyTier(tier: Tier): void {
    this.w?.setTier(tier);
    this.water?.setTier(tier);
    this.applyPR();
  }
  private applyPR(): void {
    if (!this.r) return;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, [0.75, 0.9, 1.1, 1.5][this.gov.tier]) * this.resK);
    this.resize();
  }
  private resize(): void {
    if (!this.r || !this.w) return;
    const W = this.wrap.clientWidth || 1;
    const H = this.wrap.clientHeight || 1;
    this.r.setSize(W, H, false);
    this.w.camera.aspect = W / H;
    this.w.camera.fov = W / H < 1.2 ? 70 : 58;
    this.w.camera.updateProjectionMatrix();
  }

  /* ---------------- sons / falas / avisos ---------------- */
  private sound(n: 'dig' | 'dump' | 'splash' | 'full' | 'clank'): void {
    if (n === 'dig') sfx.thud();
    else if (n === 'dump') sfx.splat();
    else if (n === 'splash') sfx.splash();
    else if (n === 'clank') sfx.knob();
    else if (n === 'full') {
      if (this.time - this.fullAt > 4) {
        this.fullAt = this.time;
        sfx.ding();
        notify(t('gb.full', 'Cheio! Leve para a lavadora'), { icon: 'arrow-up', kind: 'good' });
      }
    }
  }
  private fullAt = -10;
  say(text: string, icon: 'detector' | 'fire' | null = null): void {
    notify(text, { icon: icon === 'fire' ? 'fire' : 'target', ms: 4500 });
    speak(text, { gap: 600 });
  }
  toast(text: string): void {
    this.host?.event(['toast', text]);
    const el = this.toastEl;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    window.setTimeout(() => el.classList.remove('on'), 900);
  }
  alert(text: string | null): void {
    if (!text) {
      this.alertEl?.remove();
      this.alertEl = null;
      return;
    }
    if (!this.alertEl) {
      this.alertEl = document.createElement('div');
      this.alertEl.className = 'gb-alert';
      this.wrap.appendChild(this.alertEl);
    }
    this.alertEl.innerHTML = IC.fire + esc(text);
  }

  /* ============================== telas por cima ============================== */
  private overlay(html: string, cls = ''): HTMLDivElement {
    this.closeOverlays();
    this.paused = true;
    this.hud?.setVisible(false);
    const d = document.createElement('div');
    d.className = 'gb-scr ' + cls;
    d.innerHTML = html;
    d.dataset.ov = '1';
    this.wrap.appendChild(d);
    this.popOv = pushBack(() => this.closeOverlays());
    return d;
  }
  private closeOverlays(): void {
    this.lobby?.dispose();
    this.lobby = null;
    this.wrap.querySelectorAll('[data-ov]').forEach((e) => e.remove());
    this.popOv?.();
    this.popOv = null;
    if (this.w && this.paused) {
      this.paused = false;
      this.last = performance.now();
      this.hud?.setVisible(true);
    }
  }
  openPause(): void {
    if (!this.sv) return;
    this.persist();
    const s = this.sv;
    const d = this.overlay(
      `<h1>${esc(t('gb.paused', 'Pausa'))}</h1>
      <div class="gb-row"><button class="gb-btn" data-c>${IC.play}${esc(t('gb.continue', 'Continuar'))}</button></div>
      <div class="gb-row"><button class="gb-btn ghost" data-m>${IC.wheel}${esc(s.expert ? t('gb.modeHard', 'Direção: DIFÍCIL') : t('gb.modeSimple', 'Direção: SIMPLES'))}</button>
      <button class="gb-btn blue" data-f>${IC.friends}${esc(this.mp ? t('gb.mp.room', 'Sala ({n}/4)', { n: this.mp.list().length }) : t('gb.mp.invite', 'Chamar amigos'))}</button>
      <button class="gb-btn ghost" data-s>${IC.home}${esc(this.guest ? t('gb.mp.leave', 'Sair da sala') : t('gb.saveExit', 'Salvar e sair'))}</button></div>`,
      'clear',
    );
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-c]')) this.closeOverlays();
      else if (el.closest('[data-m]')) {
        this.toggleExpert();
        this.openPause();
      } else if (el.closest('[data-f]')) {
        sfx.click();
        if (this.mp) this.openLobby();
        else {
          this.closeOverlays();
          void this.goOnline();
        }
      } else if (el.closest('[data-s]')) {
        this.closeOverlays();
        this.leave();
        this.menu();
      }
    });
  }

  openShop(): void {
    const s = this.sv;
    if (!s) return;
    const owned = (k: Kind) => this.ms.filter((m) => m.kind === k).length;
    const item = (it: ShopItem, isUp: boolean) => {
      const lvl = isUp ? (it.id === 'driver' ? s.bots.drivers : it.id === 'miner' ? s.bots.miners : it.id === 'mine' ? (s.mineOpen ? 1 : 0) : it.id === 'cart' ? (this.ug?.carts.length ?? this.netUg.carts) : it.id === 'ugbot' ? (this.ug?.bots.length ?? this.netUg.bots) : s.upg[it.id as 'shovel']) : owned(it.kind!);
      const max = isUp ? it.price.length : it.max ?? 1;
      const price = isUp ? it.price[lvl] : it.price[0];
      const done = lvl >= max;
      const can = !done && s.money >= price;
      const lv = isUp ? `<div class="gb-lvl">${it.price.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : lvl ? `<small>×${lvl}</small>` : '<small>&nbsp;</small>';
      return `<div class="gb-item ${done ? 'owned' : ''}"><div class="gb-ico">${IC[it.icon]}</div><span>${esc(it.name())}</span>${lv}<button class="gb-price" data-buy="${it.id}" ${can ? '' : 'disabled'}>${done ? IC.star : IC.coin}${done ? esc(t('gb.max', 'Máximo')) : price.toLocaleString('pt-BR')}</button></div>`;
    };
    const d = this.overlay(
      `<button class="gb-b gb-x" data-x>${IC.close}</button><h2>${IC.coin.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-4px"')} ${Math.floor(s.money).toLocaleString('pt-BR')}</h2>
      <div class="gb-shopgrid">${MACHINES.map((m) => item(m, false)).join('')}${HELPERS.map((u) => item(u, true)).join('')}${UPGRADES.map((u) => item(u, true)).join('')}${MINE.map((u) => item(u, true)).join('')}${this.water && !this.guest ? this.water.shopHtml(s.money) : ''}${this.proc ? this.proc.shopHtml(s.money) : ''}</div>`,
    );
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-x]')) return this.closeOverlays();
      const b = el.closest<HTMLElement>('[data-buy]');
      if (!b || (b as HTMLButtonElement).disabled) return;
      const id = b.dataset.buy!;
      if (this.buy(id)) {
        if (this.host) this.host.event(['buy', id, this.host.net.me.name]);
        else if (this.guest) {
          sfx.click();
          // o anfitrião confirma no próximo retrato; fecha a loja
          this.closeOverlays();
          return;
        }
      }
      this.openShop();
    });
  }
  buy(id: string): boolean {
    const s = this.sv!;
    if (this.mp instanceof MpGuest) {
      // convidado: pede ao anfitrião (o dinheiro é do time, no save dele)
      this.mp.action('buy', { id });
      return true;
    }
    if (this.water?.isItem(id)) return this.water.buy(id) && (this.persist(), true);
    if (this.proc?.isItem(id)) return this.proc.buy(id) && (this.persist(), true);
    const mi = MACHINES.find((m) => m.id === id);
    if (mi) {
      const n = this.ms.filter((m) => m.kind === mi.kind).length;
      if (n >= (mi.max ?? 1) || s.money < mi.price[0]) return false;
      s.money -= mi.price[0];
      const [x, z, yaw] = this.spawnSpot(mi.kind!);
      this.addMachine(mi.kind!, x, z, yaw);
      audio.cash();
      bigMoment(t('gb.bought', 'Comprou: {n}', { n: mi.name() }), { icon: 'gift' });
      this.persist();
      return true;
    }
    const mi2 = MINE.find((u) => u.id === id);
    if (mi2) {
      const lvl = id === 'mine' ? (s.mineOpen ? 1 : 0) : id === 'cart' ? (this.ug?.carts.length ?? 0) : (this.ug?.bots.length ?? 0);
      if (lvl >= mi2.price.length || s.money < mi2.price[lvl]) return false;
      if (id !== 'mine' && !this.ug) {
        notify(t('gb.needMine', 'Abra a mina primeiro'), { icon: 'warning', kind: 'warn' });
        return false;
      }
      s.money -= mi2.price[lvl];
      if (id === 'mine') {
        s.mineOpen = true;
        this.openMine();
        this.say(t('gb.mineOpen', 'A mina abriu! A entrada fica no pátio da mina, na montanha.'));
      } else if (id === 'cart') this.ug!.addCart();
      else this.ug!.addBot();
      audio.cash();
      this.persist();
      return true;
    }
    const hi = HELPERS.find((u) => u.id === id);
    if (hi) {
      const k = hi.id === 'driver' ? 'drivers' : 'miners';
      const lvl = s.bots[k];
      if (lvl >= hi.price.length || s.money < hi.price[lvl]) return false;
      if (k === 'drivers' && this.ms.filter((m) => m instanceof Truck).length <= lvl) {
        notify(t('gb.needTruck', 'Compre um caminhão para o motorista'), { icon: 'warning', kind: 'warn' });
        return false;
      }
      s.money -= hi.price[lvl];
      s.bots[k] = lvl + 1;
      if (k === 'drivers') this.drivers.push(new Driver(this));
      else this.addMiner();
      audio.cash();
      bigMoment(t('gb.hired', 'Contratou: {n}', { n: hi.name() }), { icon: 'user' });
      this.persist();
      return true;
    }
    const ui = UPGRADES.find((u) => u.id === id);
    if (ui) {
      const k = ui.id as 'shovel' | 'barrow' | 'plant';
      const lvl = s.upg[k];
      if (lvl >= ui.price.length || s.money < ui.price[lvl]) return false;
      s.money -= ui.price[lvl];
      s.upg[k] = lvl + 1;
      this.worker!.cargo.cap = BARROW[s.upg.barrow];
      this.worker!.digPow = SHOVEL[s.upg.shovel];
      this.host?.applyUpgrades();
      audio.cash();
      this.persist();
      return true;
    }
    return false;
  }

  /* ============================== save / saída ============================== */
  persist(): void {
    const s = this.sv;
    const w = this.w;
    if (!s || !w || this.slot < 0) return;
    s.machines = this.ms.map((m) => ({ kind: m.kind, x: m.pos.x, z: m.pos.z, yaw: m.yaw(), vol: m.cargo.vol, gold: m.cargo.gold }));
    const wk = this.worker!;
    s.worker = { x: wk.group.position.x, z: wk.group.position.z, yaw: wk.group.rotation.y, vol: wk.cargo.vol, gold: wk.cargo.gold };
    s.driving = this.cur && this.cur !== wk ? this.ms.indexOf(this.cur) : -1;
    if (this.inMine) {
      const p = this.w!.portal;
      s.worker = { x: p.x + Math.sin(p.yaw) * 3, z: p.z + Math.cos(p.yaw) * 3, yaw: p.yaw, vol: 0, gold: 0 };
    }
    s.terrain = encodeTerrain(w.T);
    if (this.water) s.water = this.water.save();
    if (this.proc) s.proc = this.proc.save();
    this.fire?.save(s);
    if (this.ug) s.ug = this.ug.save();
    this.rp?.save(s); // RP
    if (!writeSlot(this.slot, s)) notify(t('gb.saveFail', 'Sem espaço para salvar'), { kind: 'bad' });
  }

  /** sai da partida (volta ao menu de saves ou ao hub): salva, relata e libera tudo */
  private leave(): void {
    if (!this.sv) return;
    this.persist();
    const secs = Math.round((performance.now() - this.startAt) / 1000);
    const coins = Math.min(60, Math.floor(this.earned / 400));
    if (coins > 0) addCoins(coins);
    if (secs > 20 && !this.guest)
      reportRun({ game: 'garimpo', score: Math.round(this.soldSession), coins, durationSec: secs, stats: { sold: Math.round(this.soldSession), earned: Math.round(this.earned) } });
    this.earned = 0;
    this.soldSession = 0;
    this.teardown();
  }
  private teardown(): void {
    cancelAnimationFrame(this.raf);
    this.lobby?.dispose();
    this.lobby = null;
    const mp = this.mp;
    this.mp = null;
    mp?.dispose();
    this.netChip?.remove();
    this.netChip = null;
    this.popB?.();
    this.popB = null;
    this.alert(null);
    if (this.engineOn) audio.engineStop();
    this.engineOn = false;
    hush();
    resetNotifyTop();
    setNotifyAlign('left');
    this.ro?.disconnect();
    this.wrap.removeEventListener('pointerdown', this.mineTap);
    this.mineBar(false);
    this.ug?.dispose();
    this.ug = null;
    this.inMine = false;
    this.rp?.dispose(); // RP
    this.rp = null;
    this.hud?.destroy();
    this.hud = null;
    for (const m of this.ms) {
      if (m instanceof Heli) m.detach();
      m.dispose();
    }
    this.ms.length = 0;
    for (const b of this.miners) b.worker.dispose();
    this.miners = [];
    this.drivers = [];
    this.worker?.dispose();
    this.worker = null;
    this.cur = null;
    this.fire = null;
    this.water?.dispose();
    this.water = null;
    this.proc?.dispose();
    this.proc = null;
    this.w?.dispose();
    this.w = null;
    this.r?.dispose();
    this.r?.forceContextLoss();
    this.r = null;
    this.cv?.remove();
    this.cv = null;
    this.toastEl?.remove();
    this.sv = null;
    this.exp = { st: 0, t: 0, seg: 0, d: 0, mesh: null };
  }

  inMatch(): boolean {
    return !!this.sv;
  }
  pause(): void {
    this.paused = true;
    if (this.engineOn) audio.engineSet(0, 0);
  }
  resume(): void {
    if (this.wrap.querySelector('[data-ov]')) return;
    this.paused = false;
    this.last = performance.now();
  }
  finish(): void {
    this.destroy();
    this.exitCb();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.leave();
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.popOv?.();
    this.wrap.remove();
  }
  /** testes: atalhos */
  debug = {
    money: (n: number) => this.sv && (this.sv.money += n),
    give: (k: Kind) => {
      const [x, z, y] = this.spawnSpot(k);
      return this.addMachine(k, x, z, y);
    },
    ctl: (): Ctl => this.hud!.ctl,
    excavator: (): Excavator | undefined => this.ms.find((m) => m instanceof Excavator) as Excavator | undefined,
    tp: (x: number, z: number, yaw = 0) => {
      const c = this.cur!;
      if (c.veh) c.veh.place(x, z, yaw, this.w!.T);
      else if (c instanceof Worker) c.place(x, z, yaw, this.w!);
      else if (c instanceof Heli) c.place(x, z, yaw, this.w!);
      this.snapCam();
    },
    enter: (m: Machine) => this.enter(m),
    exit: () => this.exit(),
    exportNow: () => this.sv && (this.sv.exportT = 0),
    fireNow: () => this.sv && (this.sv.fireT = 0),
  };
}
export { FIRE_EVERY };
