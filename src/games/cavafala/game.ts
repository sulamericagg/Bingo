/* ============================================================
 *  CAVA & FALA — entrada do jogo (chunk sob demanda).
 *  Menu (modo, vila, opções da arena) → carregando (gera o mapa e as
 *  malhas aos poucos) → partida → resultado. Pausa pelo botão/voltar.
 *  ?debug expõe window.__cavafala para testes automatizados.
 * ============================================================ */
import * as THREE from 'three';
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { detectInitialTier, type Tier } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { icon } from '../../ui/icons';
import { clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { isSolo, soloToggle } from '../../ui/touch';
import { disposeSfx, sfx } from '../../3d/common/sfx';
import { tap } from '../../core/haptics';
import { me as socialMe } from '../../social/net';
import { displayName } from '../../services/leaderboard';
import { ArenaMode, COLS, HATS, NAMES, type ArenaOnline, type ArenaResult } from './arena';
import type { Hat } from './bloop';
import { MATS, THEMES, themeById, type ThemeId } from './data';
import { fillRoom, fillStart, type RoomHandle, type RoomMode } from './lobby';
import { CODE_ALPHA, codeFromRoom, createNet, MAX_PLAYERS, newCode, type CavaNet, type Me, type NetEvent } from './net';
import { Binder, BOT_KS, PCOLS, PHATS, type RoundInit } from './online';
import { takePendingCava } from './pending';
import { consumePartySeat, partySeat } from '../../party/contract';
import { reportPlaying, stopPlaying } from '../../party/join';
import { parseBest } from './parser';
import { introGate } from '../../3d/cine/gate';
import { GADGETS } from './gadgets';
import { RestoreMode, type RestoreOnline, type RestoreResult } from './restore';
import { cavaSave, persist, type Diff } from './save';
import { injectCss } from './style';
import { Town } from './town';
import { World } from './world';
import { genArena, genTown, TOWN_WALK_R } from './worldgen';
import { voiceKind } from './voice';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectCss();
  const el = document.createElement('div');
  el.className = 'cf-root';
  root.appendChild(el);
  const sv = cavaSave();
  let world: World | null = null;
  let restore: RestoreMode | null = null;
  let arena: ArenaMode | null = null;
  let popBack: (() => void) | null = null;
  let dead = false;
  let menuEl: HTMLDivElement | null = null;
  let last: { kind: 'restore'; theme: ThemeId } | { kind: 'arena' } = { kind: 'restore', theme: sv.lastTheme };
  /** cada partida nova invalida a carga anterior (online: o anfitrião pode recomeçar no meio) */
  let gen = 0;
  /* ------------------------------ online ------------------------------ */
  interface Online {
    net: CavaNet;
    party: boolean;
    pick: RoomMode;
    round: number;
    init: RoundInit | null;
    /** o anfitrião já deu a largada desta rodada */
    go: boolean;
    ready: Set<string>;
    readyTimer: number;
    partyTimer: number;
    partyAt: number;
    binder: Binder | null;
    room: RoomHandle | null;
    busy: boolean;
    offs: (() => void)[];
  }
  let online: Online | null = null;
  /** grupo: quantos do grupo devem chegar antes da Arena começar sozinha */
  let partyWant = 2;
  /** abrir "Chamar amigos" assim que a sala abrir */
  let callNext = false;
  let meP: Promise<Me> | null = null;
  const myself = (): Promise<Me> =>
    (meP ??= socialMe()
      .then((m) => ({ id: m.id, name: m.name || displayName() || 'Bloop', skin: m.skin }))
      .catch((e) => {
        meP = null;
        throw e;
      }));
  const forced = /[?&]cftier=(\d)/.exec(location.search);
  const tier: Tier = forced ? (Math.min(3, +forced[1]) as Tier) : detectInitialTier();
  const vs = tier <= 1 ? 2 / 3 : 0.5;
  setNotifyTop(60); // abaixo das fichas de material (podem quebrar em 2 linhas por causa do botão de girar do hub)

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  const endWorld = () => {
    online?.binder?.dispose();
    if (online) online.binder = null;
    world?.dispose();
    world = null;
    restore = null;
    arena = null;
    clearNotify();
    objective(null);
  };
  const quit = () => {
    leaveOnline();
    endWorld();
    setBack(null);
    exit();
  };

  /* ------------------------------ menu ------------------------------ */
  function menu(): void {
    leaveOnline();
    endWorld();
    menuEl?.remove();
    const d = document.createElement('div');
    d.className = 'cf-menu';
    menuEl = d;
    const tb = (th: (typeof THEMES)[number]) => {
      const st = sv.towns[th.id]?.stars ?? 0;
      return `<button class="cf-town${sv.lastTheme === th.id ? ' on' : ''}" data-town="${th.id}" title="${esc(th.desc())}" style="--a:${th.card[0]};--b:${th.card[1]}"><b>${esc(th.name())}</b><small>${st ? '<span class="cf-st">' + '★'.repeat(st) + '</span>' : esc(t('cavafala.menu.new', 'nova!'))}</small></button>`;
    };
    const seg = (name: string, vals: [string, string][], cur: string) => `<span class="cf-seg" data-seg="${name}">${vals.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</span>`;
    const vk = voiceKind();
    d.innerHTML = `
      <div class="cf-title">${esc(t('cavafala.name', 'Cava & Fala'))}</div>
      <div class="cf-sub">${esc(t('cavafala.menu.sub', 'Cave a terra, junte materiais e FALE o que quer criar: a engenhoca é montada na hora!'))}${vk === 'none' ? '<br><small>' + esc(t('cavafala.menu.noVoice', 'Sem voz neste aparelho: você pode digitar ou escolher no círculo.')) + '</small>' : ''}</div>
      <div class="cf-modes">
        <button class="cf-mode" data-m="restore" style="--a:#5ec86a;--b:#2a7a4a"><b>${esc(t('cavafala.mode.restore', 'Restaurar a Vila'))}</b><small>${esc(t('cavafala.mode.restoreD', 'Desenterre uma vilinha soterrada e devolva a alegria aos moradores antes do anoitecer.'))}</small></button>
        <button class="cf-mode" data-m="arena" style="--a:#ff8a3a;--b:#c8326a"><b>${esc(t('cavafala.mode.arena', 'Arena Cava-Cava'))}</b><small>${esc(t('cavafala.mode.arenaD', 'Ilha flutuante que encolhe! Empurre os rivais com espuma, bolhas e ventiladores.'))}</small>${sv.arenaWins ? `<span class="cf-star">🏆 ${sv.arenaWins}</span>` : ''}</button>
      </div>
      <div class="cf-towns"><span class="cf-lab">${esc(t('cavafala.menu.town', 'Vila:'))}</span>${THEMES.map(tb).join('')}</div>
      <div class="cf-tdesc">${esc(themeById(sv.lastTheme).desc())}</div>
      <div class="cf-opts">
        <span>${esc(t('cavafala.opt.bots', 'Rivais'))}</span>${seg('bots', [['1', '1'], ['2', '2'], ['3', '3']], String(sv.bots))}
        <span>${esc(t('cavafala.opt.diff', 'Bots'))}</span>${seg('diff', [['0', t('cavafala.diff.0', 'Fácil')], ['1', t('cavafala.diff.1', 'Normal')], ['2', t('cavafala.diff.2', 'Difícil')]], String(sv.diff))}
        ${seg('practice', [['0', t('cavafala.opt.match', 'Partida')], ['1', t('cavafala.opt.practice', 'Treino')]], sv.practice ? '1' : '0')}
      </div>
      <div class="cf-row" style="margin-top:0">
        <button class="cf-btn p" data-a="online">${icon('party', { size: 20 })}${esc(t('cavafala.net.title', 'Jogar com amigos'))}</button>
        <span class="cf-solo-slot"></span>
        <button class="cf-btn w" data-a="exit">${icon('home', { size: 20 })}${esc(t('cavafala.exit', 'Sair'))}</button>
      </div>`;
    el.appendChild(d);
    d.querySelector('.cf-solo-slot')!.appendChild(soloToggle('cavafala', undefined, t('cavafala.solo.sub', 'sem ajudantes na vila')));
    d.querySelectorAll<HTMLButtonElement>('[data-town]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        sv.lastTheme = b.dataset.town as ThemeId;
        persist();
        d.querySelectorAll('[data-town]').forEach((x) => x.classList.toggle('on', x === b));
        d.querySelector('.cf-tdesc')!.textContent = themeById(sv.lastTheme).desc();
      }),
    );
    d.querySelectorAll<HTMLElement>('[data-seg]').forEach((sg) =>
      sg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          audio.click();
          sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          const v = +b.dataset.v!;
          if (sg.dataset.seg === 'bots') sv.bots = v;
          if (sg.dataset.seg === 'diff') sv.diff = v as Diff;
          if (sg.dataset.seg === 'practice') sv.practice = v === 1;
          persist();
        }),
      ),
    );
    d.querySelector('[data-m=restore]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      void startRestore(sv.lastTheme);
    });
    d.querySelector('[data-m=arena]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      void startArena();
    });
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    d.querySelector('[data-a=online]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      onlineStart();
    });
    setBack(quit);
  }

  /* ------------------------------ carregando ------------------------------ */
  function loading(): { el: HTMLDivElement; set(v: number): void } {
    const l = document.createElement('div');
    l.className = 'cf-loading';
    l.innerHTML = `<div>${esc(t('cavafala.loading', 'Cavando o mapa...'))}</div><div class="bar"><b></b></div>`;
    el.appendChild(l);
    return { el: l, set: (v) => ((l.querySelector('b') as HTMLElement).style.width = Math.round(v * 100) + '%') };
  }
  async function bake(w: World, ld: { set(v: number): void }, g: number): Promise<void> {
    const tot = Math.max(1, w.T.pending);
    while (w.T.pending > 0 && !dead && g === gen) {
      const t0 = performance.now();
      while (w.T.pending > 0 && performance.now() - t0 < 30) w.T.update(1, null);
      ld.set(0.25 + 0.75 * (1 - w.T.pending / tot));
      await frame();
    }
  }

  async function startRestore(themeId: ThemeId, init: RoundInit | null = null): Promise<void> {
    if (!webglOk()) {
      notify(t('cavafala.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    // abertura (docs/INTROS.md): só na primeira partida, sozinho
    if (!init && !online) await introGate('cavafala', () => import('./intro/cinematic').then((m) => m.playIntro(el)));
    if (dead) return;
    last = { kind: 'restore', theme: themeId };
    const g = ++gen;
    endWorld();
    menuEl?.remove();
    menuEl = null;
    online?.room?.dispose();
    const ld = loading();
    await frame();
    if (g !== gen) return ld.el.remove();
    const th = themeById(themeId);
    const variant = init ? (init.variant ?? 0) : Math.floor(Math.random() * 1000);
    const { T, L } = genTown(th, vs, tier >= 1, variant);
    ld.set(0.15);
    await frame();
    const town = new Town(th, L, th.seed * 31 + variant);
    const w = new World(el, { arena: false, theme: th, tier, T, town, spawn: L.spawn, waterY: th.sea ? 7 : -100, bounds: { x0: T.ox + 0.6, z0: T.oz + 0.6, x1: -T.ox - 0.6, z1: -T.oz - 0.6, r: TOWN_WALK_R }, onPause: pause });
    world = w;
    w.hud.show(false);
    await bake(w, ld, g);
    ld.el.remove();
    if (dead || g !== gen) return;
    const on = init && online ? online : null;
    let ro: RestoreOnline | null = null;
    if (on && init) {
      w.me.nid = on.net.me.id;
      w.me.color = playersOf(init, on.net).find((p) => p.nid === on.net.me.id)?.col ?? w.me.color;
      ro = {
        host: on.net.isHost,
        players: playersOf(init, on.net).filter((p) => p.nid !== on.net.me.id),
        send: (e) => on.net.send(e),
      };
    }
    restore = new RestoreMode(w, town, th, L, on ? true : isSolo('cavafala'), (r) => resultsRestore(th.id, r), ro);
    w.mode = restore;
    if (on) on.binder = new Binder(on.net, w, { arena: null, restore });
    w.hud.show(true);
    w.start();
    setBack(pause);
  }

  async function startArena(init: RoundInit | null = null): Promise<void> {
    if (!webglOk()) {
      notify(t('cavafala.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    // abertura (docs/INTROS.md): só na primeira partida, sozinho
    if (!init && !online) await introGate('cavafala', () => import('./intro/cinematic').then((m) => m.playIntro(el)));
    if (dead) return;
    last = { kind: 'arena' };
    const g = ++gen;
    endWorld();
    menuEl?.remove();
    menuEl = null;
    online?.room?.dispose();
    const ld = loading();
    await frame();
    if (g !== gen) return ld.el.remove();
    const { T, topY, R } = genArena(vs, tier >= 1, init ? init.seed : Math.floor(Math.random() * 9999));
    ld.set(0.2);
    await frame();
    const w = new World(el, { arena: true, theme: null, tier, T, town: null, spawn: new THREE.Vector3(0, topY + 2, 0), waterY: -100, bounds: null, onPause: pause });
    world = w;
    w.hud.show(false);
    await bake(w, ld, g);
    ld.el.remove();
    if (dead || g !== gen) return;
    const on = init && online ? online : null;
    let ao: ArenaOnline | null = null;
    if (on && init) {
      const myId = on.net.me.id;
      ao = {
        host: on.net.isHost,
        myId,
        slots: [
          ...playersOf(init, on.net).map((p) => ({ nid: p.nid, name: p.name, col: p.col, hat: p.hat, kind: p.nid === myId ? ('me' as const) : ('remote' as const) })),
          ...init.bots.map((b) => ({ nid: b.id, name: NAMES[b.k % NAMES.length], col: COLS[b.k % COLS.length], hat: HATS[b.k % HATS.length], kind: 'bot' as const, k: b.k })),
        ],
        send: (e) => on.net.send(e),
      };
    }
    arena = new ArenaMode(w, { bots: sv.bots, diff: on ? ((init?.diff ?? 1) as Diff) : sv.diff, practice: on ? false : sv.practice, R, topY }, resultsArena, ao);
    w.mode = arena;
    if (on) {
      on.binder = new Binder(on.net, w, { arena, restore: null });
      if (on.go) arena.netGo();
      else if (!on.net.isHost) on.net.send({ t: 'ready', round: on.round });
      else checkReady();
    }
    w.hud.show(true);
    w.start();
    setBack(pause);
  }

  /* ------------------------------ online: sala ------------------------------ */
  /** jogadores da rodada (nomes vêm da sala, que passou pelo servidor) */
  function playersOf(init: RoundInit, net: CavaNet): { nid: string; name: string; col: string; hat: Hat }[] {
    return init.players.map((p, i) => ({
      nid: p.id,
      name: net.peers.find((x) => x.id === p.id)?.name ?? 'Bloop',
      col: /^#[0-9a-f]{6}$/i.test(p.col) ? p.col : PCOLS[i % PCOLS.length],
      hat: (PHATS.includes(p.hat as Hat) ? p.hat : '') as Hat,
    }));
  }

  function screen(): HTMLDivElement {
    endWorld();
    menuEl?.remove();
    const d = document.createElement('div');
    d.className = 'cf-menu';
    el.appendChild(d);
    menuEl = d;
    return d;
  }

  /** "Jogar com amigos": criar sala ou entrar numa */
  function onlineStart(): void {
    leaveOnline();
    const d = screen();
    fillStart(d, {
      create: () => {
        callNext = true;
        void connect(newCode(), 'create', false);
      },
      join: (code) => void connect(code, 'join', false),
      back: menu,
    });
    setBack(menu);
  }

  async function connect(code: string, how: 'create' | 'join' | 'auto', party: boolean): Promise<void> {
    leaveOnline();
    const d = screen();
    d.innerHTML = `<div class="cf-title" style="font-size:24px">${esc(t('cavafala.net.connecting', 'Conectando...'))}</div><div class="cf-sub">${esc(t('cavafala.net.code', 'Código da sala'))}: <b>${esc(code)}</b></div>`;
    setBack(menu);
    let net: CavaNet;
    try {
      const me = await myself();
      net = await createNet(code, how, me);
    } catch (e) {
      if (menuEl !== d) return;
      const why = (e as Error)?.message ?? '';
      const msg =
        why === 'no_room' || why === 'bad_code'
          ? t('cavafala.net.noRoom', 'Não achei essa sala. Confira o código!')
          : why === 'full'
            ? t('cavafala.net.full', 'A sala está cheia (4 Bloops).')
            : why === 'taken'
              ? t('cavafala.net.taken', 'Esse código já está em uso. Tente de novo.')
              : t('cavafala.net.offline', 'Sem conexão com o servidor agora.');
      notify(msg, { icon: 'cloud-off', kind: 'bad', ms: 3600 });
      if (party) menu();
      else onlineStart();
      return;
    }
    if (menuEl !== d || dead) {
      net.close();
      return;
    }
    const o: Online = {
      net,
      party,
      pick: { mode: party ? 'arena' : 'arena', theme: sv.lastTheme, bots: MAX_PLAYERS - 1 },
      round: 0,
      init: null,
      go: false,
      ready: new Set(),
      readyTimer: 0,
      partyTimer: 0,
      partyAt: Date.now(),
      binder: null,
      room: null,
      busy: false,
      offs: [],
    };
    online = o;
    reportPlaying('cavafala', net.code); // amigos veem "Fulano está jogando — ENTRAR"
    o.offs.push(net.onEvent((from, e) => onNet(from, e)));
    o.offs.push(
      net.onRoster((why, id) => {
        if (online !== o) return;
        if (why === 'join') {
          tap('light');
          sfx.pop();
          const p = net.peers.find((x) => x.id === id);
          nameOf(id);
          if (world) notify(t('cavafala.net.joinedLate', '{n} entrou na sala (joga na próxima rodada)', { n: p?.name ?? 'Bloop' }), { icon: 'user' });
          else notify(t('cavafala.net.joined', '{n} entrou na sala!', { n: p?.name ?? 'Bloop' }), { icon: 'user', kind: 'good' });
          if (net.isHost) sendLobby(id);
        } else if (why === 'leave') {
          const nm = o.init ? 'Bloop' : '';
          o.binder?.left(id, nameOf(id) || nm || 'Bloop');
          if (!o.binder) notify(t('cavafala.net.left', '{n} saiu da sala', { n: nameOf(id) || 'Bloop' }), { icon: 'user' });
          if (net.isHost) checkReady();
        } else if (why === 'host') {
          const old = o.init?.players[0]?.id ?? '';
          o.binder?.hostChanged(old);
          if (net.isHost && !o.binder) notify(t('cavafala.net.nowHost', 'Agora você é o anfitrião da sala!'), { icon: 'star', kind: 'good' });
          if (net.isHost && o.party && !world) partyAuto();
        }
        o.room?.refresh();
      }),
    );
    net.onClose(() => {
      if (online !== o) return;
      online = null;
      stopPlaying();
      for (const f of o.offs) f();
      notify(t('cavafala.net.lost', 'A conexão com a sala caiu.'), { icon: 'cloud-off', kind: 'bad' });
      if (world) {
        // segue jogando sozinho? não: a partida dependia dos outros — volta ao menu
        menu();
      } else menu();
    });
    showRoom();
    if (party && net.isHost) partyAuto();
  }
  const peersNameCache = new Map<string, string>();
  function nameOf(id: string): string {
    const p = online?.net.peers.find((x) => x.id === id);
    if (p) peersNameCache.set(id, p.name);
    return p?.name ?? peersNameCache.get(id) ?? '';
  }

  function showRoom(): void {
    const o = online;
    if (!o) return menu();
    gen++;
    o.room?.dispose();
    o.init = null;
    const d = screen();
    for (const p of o.net.peers) peersNameCache.set(p.id, p.name);
    o.room = fillRoom(d, {
      net: o.net,
      party: o.party,
      pick: () => o.pick,
      setPick: (p) => {
        Object.assign(o.pick, p);
        if (p.theme) {
          sv.lastTheme = p.theme;
          persist();
        }
        sendLobby();
      },
      start: () => hostStart(),
      callNow: callNext && o.net.isHost,
      leave: () => {
        leaveOnline();
        menu();
      },
      status: () => (o.busy && !o.net.isHost ? t('cavafala.net.busy', 'Partida em andamento: você entra na próxima!') : o.party ? (o.net.isHost ? t('cavafala.net.partyStart', 'A Arena começa assim que o grupo chegar…') : t('cavafala.net.partyWait', 'Esperando o grupo…')) : ''),
    });
    callNext = false;
    if (o.net.isHost) sendLobby();
    setBack(() => {
      leaveOnline();
      menu();
    });
  }

  function sendLobby(to?: string): void {
    const o = online;
    if (!o || !o.net.isHost) return;
    o.net.send({ t: 'lobby', mode: o.pick.mode, theme: o.pick.theme, bots: o.pick.bots, busy: !!world }, to);
  }

  /** grupo (party): o anfitrião começa a Arena quando o grupo chegou (ou depois de alguns segundos) */
  function partyAuto(): void {
    const o = online;
    if (!o || !o.party || !o.net.isHost) return;
    clearTimeout(o.partyTimer);
    const check = async () => {
      if (online !== o || world || o.init) return;
      const want = partyWant;
      if (o.net.peers.length >= want || Date.now() - o.partyAt > 9000) hostStart();
      else o.partyTimer = window.setTimeout(() => void check(), 700);
    };
    o.partyTimer = window.setTimeout(() => void check(), 1200);
  }

  function leaveOnline(): void {
    const o = online;
    if (!o) return;
    online = null;
    stopPlaying();
    clearTimeout(o.readyTimer);
    clearTimeout(o.partyTimer);
    o.binder?.dispose();
    o.room?.dispose();
    for (const f of o.offs) f();
    o.net.close();
  }

  /** anfitrião: monta a rodada e manda para todos */
  function hostStart(): void {
    const o = online;
    if (!o || !o.net.isHost) return;
    const ps = o.net.peers.slice(0, MAX_PLAYERS);
    const mode = o.party ? 'arena' : o.pick.mode;
    const nb = mode === 'arena' ? Math.max(ps.length < 2 ? 1 : 0, Math.min(o.pick.bots, MAX_PLAYERS - ps.length)) : 0;
    const ks: number[] = [];
    while (ks.length < nb) {
      const k = BOT_KS[Math.floor(Math.random() * BOT_KS.length)];
      if (!ks.includes(k)) ks.push(k);
    }
    const init: RoundInit = {
      t: 'init',
      mode,
      seed: Math.floor(Math.random() * 9999),
      theme: o.pick.theme,
      variant: Math.floor(Math.random() * 1000),
      diff: sv.diff,
      players: ps.map((p, i) => ({ id: p.id, col: PCOLS[i], hat: PHATS[i] })),
      bots: ks.map((k, i) => ({ id: 'b' + i, k })),
      round: o.round + 1,
    };
    o.net.send(init);
    beginRound(init);
  }

  function beginRound(init: RoundInit): void {
    const o = online;
    if (!o) return;
    if (!init.players.some((p) => p.id === o.net.me.id)) {
      // entrou depois: espera a próxima rodada na sala
      o.busy = true;
      o.room?.refresh();
      return;
    }
    o.busy = false;
    o.round = init.round;
    o.go = false;
    o.ready = new Set();
    clearTimeout(o.readyTimer);
    o.room?.dispose();
    o.room = null;
    if (init.mode === 'restore') {
      const th = THEMES.some((x) => x.id === init.theme) ? (init.theme as ThemeId) : sv.lastTheme;
      void startRestore(th, init).then(() => {
        if (online === o) o.init = init;
      });
      o.init = init;
    } else {
      o.init = init;
      void startArena(init);
      if (o.net.isHost) o.readyTimer = window.setTimeout(() => sendGo(), 20000);
    }
  }
  /** anfitrião: todos carregaram? larga */
  function checkReady(): void {
    const o = online;
    if (!o || !o.net.isHost || !o.init || o.go || o.init.mode !== 'arena' || !arena) return;
    const want = o.init.players.filter((p) => p.id !== o.net.me.id && o.net.peers.some((x) => x.id === p.id));
    if (want.every((p) => o.ready.has(p.id))) sendGo();
  }
  function sendGo(): void {
    const o = online;
    if (!o || !o.net.isHost || o.go || !o.init) return;
    o.go = true;
    clearTimeout(o.readyTimer);
    o.net.send({ t: 'go', round: o.round });
    arena?.netGo();
  }

  /** mensagens da sala que não são da partida em si (essas ficam no Binder) */
  function onNet(from: string, e: NetEvent): void {
    const o = online;
    if (!o) return;
    const fromHost = from === o.net.hostId;
    switch (e.t) {
      case 'init':
        if (fromHost && Array.isArray(e.players) && Array.isArray(e.bots)) beginRound(e);
        break;
      case 'lobby':
        if (!fromHost) break;
        o.pick.mode = e.mode === 'restore' ? 'restore' : 'arena';
        if (THEMES.some((x) => x.id === e.theme)) o.pick.theme = e.theme as ThemeId;
        o.pick.bots = Math.max(0, Math.min(3, Number(e.bots) | 0));
        o.busy = !!e.busy && !o.init;
        o.room?.refresh();
        break;
      case 'menu':
        if (fromHost) showRoom();
        break;
      case 'ready':
        if (o.net.isHost && e.round === o.round) {
          o.ready.add(from);
          checkReady();
        }
        break;
      case 'go':
        if (fromHost && e.round === o.round) o.go = true;
        break;
    }
  }

  /* ------------------------------ pausa / fim ------------------------------ */
  function pause(): void {
    const w = world;
    if (!w) return;
    if (w.hud.overlay) {
      w.hud.closePanel();
      w.setPaused(false);
      return;
    }
    w.setPaused(true);
    const d = w.hud.panel(`<div class="cf-card" style="text-align:center">
      <h2>${esc(t('cavafala.paused', 'Pausa'))}</h2>
      <p>${esc(t('cavafala.help2', 'Cave com CAVAR e FALE o que quer criar (ex.: “ponte”, “trampolim de ouro”, “canhão de espuma duplo”). Sem microfone? CRIAR abre as receitas.'))}</p>
      <div class="cf-row" style="margin-top:6px"><span class="cf-lab" style="color:#2a0b5c">${esc(t('cavafala.mic.mode', 'Microfone:'))}</span><span class="cf-seg cf-seg2" data-seg="mic"><button data-v="toggle" class="${(sv.micMode ?? 'toggle') === 'toggle' ? 'on' : ''}">${esc(t('cavafala.mic.toggle', 'Toque liga/desliga'))}</button><button data-v="hold" class="${sv.micMode === 'hold' ? 'on' : ''}">${esc(t('cavafala.mic.hold', 'Segurar para falar'))}</button></span><button class="cf-btn w" data-a="mictest">${esc(t('cavafala.mt.title', 'Testar microfone'))}</button></div>
      <div class="cf-row">
        <button class="cf-btn g" data-a="go">${icon('play', { size: 18 })}${esc(t('cavafala.resume', 'Continuar'))}</button>
        ${restore ? `<button class="cf-btn o" data-a="top">${esc(t('cavafala.toTop', 'Voltar ao topo'))}</button>` : ''}
        ${online ? `<button class="cf-btn" data-a="room">${esc(online.net.isHost ? t('cavafala.net.toRoom', 'Voltar à sala') : t('cavafala.net.leave', 'Sair da sala'))}</button>` : `<button class="cf-btn" data-a="menu">${esc(t('cavafala.menu', 'Menu'))}</button>`}
        <button class="cf-btn w" data-a="exit">${icon('home', { size: 18 })}${esc(t('cavafala.exit', 'Sair'))}</button>
      </div></div>`);
    const close = () => {
      w.hud.closePanel();
      w.setPaused(false);
      setBack(pause);
    };
    d.querySelector('[data-a=go]')!.addEventListener('click', close);
    d.querySelector('[data-a=top]')?.addEventListener('click', () => {
      restore?.respawn();
      close();
    });
    d.querySelector('[data-a=menu]')?.addEventListener('click', menu);
    d.querySelector('[data-a=room]')?.addEventListener('click', toRoomOrLeave);
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    d.querySelectorAll<HTMLButtonElement>('[data-seg=mic] button').forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        sv.micMode = b.dataset.v as 'toggle' | 'hold';
        persist();
        d.querySelectorAll('[data-seg=mic] button').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    d.querySelector('[data-a=mictest]')!.addEventListener('click', () => {
      audio.unlock();
      w.micTest(() => pause());
    });
    setBack(close);
  }
  /** online: anfitrião leva todos de volta à sala; convidado sai */
  function toRoomOrLeave(): void {
    const o = online;
    if (!o) return menu();
    if (o.net.isHost) {
      o.net.send({ t: 'menu' });
      showRoom();
    } else {
      leaveOnline();
      menu();
    }
  }

  function resultsRestore(theme: ThemeId, r: RestoreResult): void {
    const w = world;
    if (!w) return;
    const prev = sv.towns[theme] ?? { best: 0, stars: 0 };
    sv.towns[theme] = { best: Math.max(prev.best, r.restored), stars: Math.max(prev.stars, r.stars) };
    persist();
    addCoins(r.coins);
    reportRun({ game: 'cavafala', score: r.restored * 100, coins: r.coins, durationSec: Math.round(r.time), won: r.win, stats: { restored: r.restored, gadgets: w.created } });
    setTimeout(() => showEnd(r.win ? t('cavafala.end.win', 'A vila voltou a sorrir!') : t('cavafala.end.night', 'Anoiteceu!'), r.stars, [
      [t('cavafala.end.restored', 'Prédios restaurados'), `${r.restored}/${r.total}`],
      [t('cavafala.end.gadgets', 'Engenhocas criadas'), String(w.created)],
      [t('cavafala.end.coins', 'Moedas'), '+' + fmt(r.coins)],
    ]), r.win ? 600 : 50);
  }
  function resultsArena(r: ArenaResult): void {
    const w = world;
    if (!w) return;
    sv.arenaPlays++;
    if (r.win && !sv.practice) sv.arenaWins++;
    persist();
    addCoins(r.coins);
    reportRun({ game: 'cavafala', score: (r.total - r.place + 1) * 100 + r.kos * 50, coins: r.coins, durationSec: Math.round(r.time), won: r.win, place: r.place, stats: { kos: r.kos, gadgets: w.created } });
    setTimeout(() => showEnd(r.win ? t('cavafala.end.arenaWin', 'Último Bloop de pé: VOCÊ!') : t('cavafala.end.arenaLose', '{n}º lugar', { n: r.place }), r.win ? 3 : r.place === 2 ? 1 : 0, [
      [t('cavafala.end.place', 'Colocação'), `${r.place}/${r.total}`],
      [t('cavafala.end.kos', 'Empurrões para fora'), String(r.kos)],
      [t('cavafala.end.coins', 'Moedas'), '+' + fmt(r.coins)],
    ]), 400);
  }
  function showEnd(title: string, stars: number, rows: [string, string][]): void {
    const w = world;
    if (!w || dead) return;
    w.setPaused(true);
    const o = online;
    if (o) {
      const host = o.net.isHost;
      const d = w.hud.panel(`<div class="cf-card" style="text-align:center;min-width:280px">
      <h2>${esc(title)}</h2>
      <div class="cf-stars">${'★'.repeat(stars)}<span style="opacity:.25">${'★'.repeat(3 - stars)}</span></div>
      <div class="cf-res">${rows.map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join('')}</div>
      <div class="cf-row">${
        host
          ? `<button class="cf-btn g" data-a="again">${icon('refresh', { size: 18 })}${esc(t('cavafala.again', 'Jogar de novo'))}</button><button class="cf-btn" data-a="room">${esc(t('cavafala.net.toRoom', 'Voltar à sala'))}</button>`
          : `<span class="cf-note" style="color:#2a0b5c;opacity:.75;font-weight:700">${esc(t('cavafala.net.waitAgain', 'Esperando o anfitrião escolher a próxima…'))}</span><button class="cf-btn" data-a="room">${esc(t('cavafala.net.leave', 'Sair da sala'))}</button>`
      }<button class="cf-btn w" data-a="exit">${icon('home', { size: 18 })}${esc(t('cavafala.exit', 'Sair'))}</button></div></div>`);
      d.querySelector('[data-a=again]')?.addEventListener('click', () => hostStart());
      d.querySelector('[data-a=room]')!.addEventListener('click', toRoomOrLeave);
      d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
      setBack(toRoomOrLeave);
      return;
    }
    const d = w.hud.panel(`<div class="cf-card" style="text-align:center;min-width:280px">
      <h2>${esc(title)}</h2>
      <div class="cf-stars">${'★'.repeat(stars)}<span style="opacity:.25">${'★'.repeat(3 - stars)}</span></div>
      <div class="cf-res">${rows.map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join('')}</div>
      <div class="cf-row">
        <button class="cf-btn g" data-a="again">${icon('refresh', { size: 18 })}${esc(t('cavafala.again', 'Jogar de novo'))}</button>
        <button class="cf-btn" data-a="menu">${esc(t('cavafala.menu', 'Menu'))}</button>
        <button class="cf-btn w" data-a="exit">${icon('home', { size: 18 })}${esc(t('cavafala.exit', 'Sair'))}</button>
      </div></div>`);
    d.querySelector('[data-a=again]')!.addEventListener('click', () => {
      endWorld();
      if (last.kind === 'arena') void startArena();
      else void startRestore(last.theme);
    });
    d.querySelector('[data-a=menu]')!.addEventListener('click', menu);
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    setBack(menu);
  }

  /* ------------------------------ testes (?debug) ------------------------------ */
  if (location.search.includes('debug')) {
    (window as unknown as Record<string, unknown>).__cavafala = {
      world: () => world,
      restore: () => restore,
      arena: () => arena,
      startRestore: (th: ThemeId = 'pesca', variant?: number) => startRestore(th, variant != null ? ({ variant } as RoundInit) : null),
      startArena: (bots = 2, diff: Diff = 1, practice = false, seed?: number) => {
        sv.bots = bots;
        sv.diff = diff;
        sv.practice = practice;
        return startArena(seed != null ? ({ seed, players: [], bots: [] } as unknown as RoundInit) : null);
      },
      /** câmera de cima (testes de terreno) */
      topView: (h = 60) => {
        const w = world;
        if (!w) return;
        w.me.body.p.set(0, h, 0.01);
        w.me.body.v.set(0, 0, 0);
        w.me.yaw = 0;
        w.me.pitch = -1.45;
      },
      menu,
      online: () => online && { code: online.net.code, host: online.net.isHost, peers: online.net.peers.map((p) => p.id), round: online.round, go: online.go, me: online.net.me.id },
      host: (mode: 'arena' | 'restore' = 'arena', bots = 0, theme?: ThemeId) => {
        if (!online) return;
        online.pick.mode = mode;
        online.pick.bots = bots;
        if (theme) online.pick.theme = theme;
        hostStart();
      },
      create: () => connect(newCode(), 'create', false),
      join: (code: string) => connect(code, 'join', false),
      party: (room: string) => connect(codeFromRoom(room), 'auto', true),
      leave: () => {
        leaveOnline();
        menu();
      },
      say: (s: string) => world?.say(s),
      /** objeto falado (criação livre) */
      make: (s: string) => world?.objs.make(s, 'type'),
      objs: () => world?.objs.state() ?? null,
      gallery: () => world?.objs.openGallery(),
      keep: () => world?.objs.keep(),
      redo: () => world?.objs.redo(),
      ride: () => world?.objs.mountNear(),
      /** aplaina um terreiro (fotos de teste): corta acima de y0 e enche abaixo */
      flatten: (x: number, z: number, R = 10, y0?: number) => {
        const w = world;
        if (!w) return;
        const y = y0 ?? w.T.groundY(x, z, 80, -40);
        for (let dx = -R; dx <= R; dx += 1.5)
          for (let dz = -R; dz <= R; dz += 1.5) {
            if (dx * dx + dz * dz > R * R) continue;
            for (let h = 1.2; h < 12; h += 1.6) w.T.dig(x + dx, y + h, z + dz, 1.4, null, 9);
          }
        w.T.add(x, y - 2, z, { hx: R, hy: 2, hz: R }, 1);
        for (let i = 0; i < 400 && w.T.pending > 0; i++) w.T.update(50, w.cam.position);
      },
      getOff: () => world?.objs.dismount(),
      mic: (on?: boolean) => {
        const w = world;
        if (!w) return null;
        if (on === true) void w.micStart();
        if (on === false) w.micOff();
        return w.micOn;
      },
      pause: () => pause(),
      card: (k: 'ask' | 'denied' | 'none' | 'slow') => {
        const w = world as unknown as { permCard(m: string): void; noVoiceCard(m: string): void } | null;
        if (k === 'ask' || k === 'denied') w?.permCard(k);
        else w?.noVoiceCard(k);
      },
      parse: (s: string) => {
        const p = parseBest([s]);
        return { g: p.g?.id ?? null, score: +p.score.toFixed(2), sure: p.sure, mods: p.mods, suggest: p.suggest.map((g) => g.id) };
      },
      give: (n = 200) => {
        if (world) for (const m of MATS) world.me.inv[m] = (world.me.inv[m] ?? 0) + n;
      },
      tp: (x: number, y: number, z: number) => world && (world.me.body.p.set(x, y, z), world.me.body.v.set(0, 0, 0)),
      look: (yaw: number, pitch: number) => world && ((world.me.yaw = yaw), (world.me.pitch = pitch)),
      tick: (n = 30) => world?.tick(n),
      /** cava em volta de um prédio (pontos de amostra) */
      uncover: (i: number, frac = 1) => {
        const w = world;
        const b = w?.town?.list[i];
        if (!w || !b) return;
        const s = b.samples;
        const N = s.length / 3;
        for (let k = 0; k < N * frac; k++) w.T.dig(s[k * 3], s[k * 3 + 1], s[k * 3 + 2], 0.9, w.me.inv);
      },
      state: () => {
        const w = world;
        if (!w) return null;
        return {
          inv: { ...w.me.inv },
          slots: w.me.slots.map((s) => s.g.id),
          created: w.created,
          last: w.lastCreated,
          parsed: w.lastParsed ? { g: w.lastParsed.g?.id ?? null, mods: w.lastParsed.mods, heard: w.lastParsed.heard } : null,
          structs: w.structs.map((s) => s.g.id),
          buildings: w.town?.list.map((b) => ({ i: b.i, kind: b.kind, name: b.name, x: b.x, y: b.y, z: b.z, unc: +b.uncovered.toFixed(2), restored: b.restored, puzzle: b.puzzle, done: b.puzzleDone })),
          actors: w.actors.map((a) => ({ name: a.name, alive: a.alive, pct: Math.round(a.pct), x: +a.body.p.x.toFixed(1), y: +a.body.p.y.toFixed(1), z: +a.body.p.z.toFixed(1) })),
          me: { x: w.me.body.p.x, y: w.me.body.p.y, z: w.me.body.p.z, yaw: w.me.yaw },
          pending: w.T.pending,
          overlay: !!w.hud.overlay,
          gadgets: GADGETS.length,
        };
      },
    };
  }

  // link/QR (?cava=) · grupo (o líder apertou JOGAR) · "Fulano está jogando — ENTRAR" (docs/PARTY.md)
  const pend = takePendingCava();
  const seat = pend ? null : partySeat('cavafala');
  if (seat) consumePartySeat('cavafala');
  if (pend?.party) void connect(codeFromRoom(pend.party), 'auto', true);
  else if (pend?.code) void connect(pend.code, 'join', false);
  else if (seat?.direct) void connect(seat.code(5, CODE_ALPHA), 'join', false);
  else if (seat) {
    partyWant = Math.max(2, Math.min(MAX_PLAYERS, seat.n));
    void connect(seat.code(5, CODE_ALPHA), 'auto', true);
  } else menu();
  return {
    destroy() {
      dead = true;
      leaveOnline();
      endWorld();
      menuEl?.remove();
      setBack(null);
      resetNotifyTop();
      clearNotify();
      disposeSfx();
      el.remove();
    },
    pause() {
      if (world && !world.paused) pause();
    },
    resume() {
      /* continua pela tela de pausa */
    },
  };
}
