/* ============================================================
 *  JANGADA BLOOP — entrada do jogo (chunk sob demanda).
 *  Menu (continuar / nova jangada / dificuldade / amigos) → carregando →
 *  oceano. Pausa pelo botão/voltar. Moedas: missões e conchas, creditadas
 *  a cada amanhecer (reportRun) e ao sair. ?debug expõe window.__jangada.
 * ============================================================ */
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { detectInitialTier, type Tier } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { clearNotify, notify, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { me as socialMe } from '../../social/net';
import { displayName } from '../../services/leaderboard';
import { consumePartySeat, partySeat } from '../../party/contract';
import { reportPlaying, stopPlaying } from '../../party/join';
import { diffName, type Diff } from './data';
import { jIcon } from './icons';
import { icon } from '../../ui/icons';
import { fillRoom, fillStart, type RoomHandle } from './lobby';
import { CODE_ALPHA, MAX_PLAYERS, codeFromRoom, createNet, newCode, type JNet, type Me } from './net';
import { jgSave, persist } from './save';
import { injectCss } from './style';
import { enterGame } from '../../audio';
import './audio';
import { World } from './world';

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
  // pacote de sons 'jangada' (definido em ./audio): liga já, mesmo se o hub avisou antes do chunk carregar
  enterGame('jangada');
  const el = document.createElement('div');
  el.className = 'jg-root';
  root.appendChild(el);
  const sv = jgSave();
  let world: World | null = null;
  let popBack: (() => void) | null = null;
  let dead = false;
  let menuEl: HTMLDivElement | null = null;
  let pending = 0;
  let runStart = performance.now();
  const forced = /[?&]jgtier=(\d)/.exec(location.search);
  const tier: Tier = forced ? (Math.min(3, +forced[1]) as Tier) : detectInitialTier();
  setNotifyTop(54);

  interface Online {
    net: JNet;
    party: boolean;
    room: RoomHandle | null;
    started: boolean;
    partyTimer: number;
    partyAt: number;
    offs: (() => void)[];
  }
  let online: Online | null = null;
  let partyWant = 2;
  let callNext = false;
  let meP: Promise<Me> | null = null;
  const myself = (): Promise<Me> =>
    (meP ??= socialMe()
      .then((m) => ({ id: m.id, name: m.name || displayName() || 'Bloop', skin: m.skin }))
      .catch((e) => {
        meP = null;
        throw e;
      }));

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  /** credita as moedas acumuladas (amanhecer / sair) */
  const payout = (why: 'dawn' | 'quit') => {
    const w = world;
    if (!w) return;
    const coins = pending;
    pending = 0;
    if (coins > 0) addCoins(coins);
    if (coins > 0 || why === 'dawn')
      reportRun({ game: 'jangada', score: w.day * 100 + w.raft.tiles * 5 + w.stats.hooked, coins, durationSec: Math.round((performance.now() - runStart) / 1000), won: why === 'dawn', stats: { day: w.day, tiles: w.raft.tiles, hooked: w.stats.hooked, sharks: w.stats.sharks, ghosts: w.stats.ghosts, islands: w.stats.islands } });
    runStart = performance.now();
    w.coinsDay = 0;
    if (w.day > sv.bestDay) sv.bestDay = w.day;
  };
  const saveWorld = () => {
    if (!world || !world.isHost) return;
    sv.world = world.toSave();
    persist();
  };
  const endWorld = () => {
    if (world) {
      saveWorld();
      payout('quit');
      world.dispose();
      world = null;
    }
    clearNotify();
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
    audio.applySettings();
    const d = document.createElement('div');
    d.className = 'jg-menu';
    menuEl = d;
    const w = sv.world;
    d.innerHTML = `
      <div class="ttl">${jIcon('sail', 46)}${esc(t('jangada.name', 'Jangada Bloop'))}</div>
      <div class="sub">${esc(t('jangada.menu.sub', 'Pesque o que passa boiando com o gancho, aumente a jangada, cozinhe, purifique água e descubra ilhas. Cuidado com o Mordelão!'))}</div>
      <div class="jg-modes">
        ${w ? `<button class="jg-mode big" data-m="cont">${jIcon('found', 44)}${esc(t('jangada.menu.cont', 'Continuar'))}<small>${esc(t('jangada.day', 'Dia {n}', { n: w.day }))} · ${esc(diffName(sv.diff))}</small></button>` : ''}
        <button class="jg-mode${w ? '' : ' big'}" data-m="new">${jIcon('build', 44)}${esc(t('jangada.menu.new', 'Nova jangada'))}<small>${esc(w ? t('jangada.menu.newWarn', 'Começa do zero (apaga a atual)') : t('jangada.menu.newD', 'Só 4 pisos e um gancho…'))}</small></button>
        <button class="jg-mode" data-m="online">${jIcon('people', 44)}${esc(t('jangada.net.title', 'Jogar com amigos'))}<small>${esc(t('jangada.menu.onlineD', 'Até 4 na mesma jangada'))}</small></button>
      </div>
      <span class="jg-seg" data-seg="diff">${([0, 1, 2] as Diff[]).map((v) => `<button data-v="${v}" class="${sv.diff === v ? 'on' : ''}">${jIcon(['heart', 'shark', 'storm'][v], 20)}${esc(diffName(v))}</button>`).join('')}</span>
      <div class="jg-row" style="margin-top:2px">
        ${sv.bestDay ? `<span class="jg-cost">${jIcon('sun', 20)}${esc(t('jangada.best', 'Recorde: dia {n}', { n: sv.bestDay }))}</span>` : ''}
        <button class="jg-b w" data-a="exit">${icon('home', { size: 20 })}${esc(t('jangada.exit', 'Sair'))}</button>
      </div>`;
    el.appendChild(d);
    d.querySelectorAll<HTMLButtonElement>('[data-seg] button').forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        sv.diff = +b.dataset.v! as Diff;
        persist();
        d.querySelectorAll('[data-seg] button').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    d.querySelector('[data-m=cont]')?.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      void start(false);
    });
    d.querySelector('[data-m=new]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      void start(true);
    });
    d.querySelector('[data-m=online]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      onlineStart();
    });
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    setBack(quit);
  }

  function loading(): { el: HTMLDivElement; set(v: number): void } {
    const l = document.createElement('div');
    l.className = 'jg-loading';
    l.innerHTML = `${jIcon('sail', 64)}<div>${esc(t('jangada.loading', 'Içando as velas…'))}</div><div class="bar"><b></b></div>`;
    el.appendChild(l);
    return { el: l, set: (v) => ((l.querySelector('b') as HTMLElement).style.width = Math.round(v * 100) + '%') };
  }

  async function start(fresh: boolean, net: JNet | null = null): Promise<void> {
    if (!webglOk()) {
      notify(t('jangada.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    endWorld();
    menuEl?.remove();
    menuEl = null;
    online?.room?.dispose();
    if (online) online.room = null;
    const ld = loading();
    ld.set(0.2);
    await frame();
    if (dead) return;
    if (fresh && !net) sv.world = null;
    sv.plays++;
    persist();
    const data = net && !net.isHost ? null : sv.world;
    const me = net ? net.me.name : displayName() || 'Bloop';
    const w = new World({
      root: el,
      tier,
      diff: sv.diff,
      cam: sv.cam,
      data,
      net,
      myName: me,
      onPause: pause,
      onCam: (m) => {
        sv.cam = m;
        persist();
      },
      onCoins: (n) => (pending += n),
      onDawn: (day) => {
        payout('dawn');
        saveWorld();
        notify(t('jangada.dayCoins', 'Dia {n}! Moedas guardadas.', { n: day }), { icon: 'coin', kind: 'good', ms: 2400 });
      },
      onSave: saveWorld,
    });
    world = w;
    ld.set(0.7);
    w.tick(2);
    await frame();
    ld.set(1);
    await frame();
    ld.el.remove();
    if (dead) return;
    runStart = performance.now();
    w.start();
    setBack(pause);
    if (!data) {
      setTimeout(() => notify(t('jangada.tip1', 'Segure o botão amarelo e solte para jogar o gancho. Segure de novo para puxar!'), { icon: 'hand-tap', ms: 6000 }), 900);
    }
  }

  /* ------------------------------ pausa ------------------------------ */
  function pause(): void {
    const w = world;
    if (!w) return;
    if (w.hud.overlay) {
      w.hud.closePanel();
      w.setPaused(false);
      setBack(pause);
      return;
    }
    w.setPaused(true);
    const d = w.hud.panel(`
      <h2>${jIcon('sail', 30)}${esc(t('jangada.paused', 'Pausa'))}</h2>
      <p style="max-width:460px">${esc(t('jangada.help', 'Gancho: segure e solte para jogar, segure para puxar. Martelo: escolha a peça embaixo e toque em CONSTRUIR. USAR (mão azul) mexe na fogueira, purificador, baú, cama, vela e âncora.'))}</p>
      <p style="font-size:13px">${jIcon('sun', 18)} ${esc(t('jangada.day', 'Dia {n}', { n: w.day }))} · ${jIcon('found', 18)} ${w.raft.tiles} · ${jIcon('coin', 18)} +${fmt(pending)}${online ? ` · ${jIcon('people', 18)} ${online.net.peers.length}` : ''}</p>
      <div class="jg-row">
        <button class="jg-b g" data-a="go">${jIcon('jump', 22)}${esc(t('jangada.resume', 'Continuar'))}</button>
        <button class="jg-b" data-a="cam">${jIcon('eye', 22)}${esc(t('jangada.cam', 'Câmera'))}</button>
        ${online ? `<button class="jg-b w" data-a="leave">${esc(t('jangada.net.leave', 'Sair da sala'))}</button>` : `<button class="jg-b w" data-a="menu">${esc(t('jangada.menuB', 'Menu'))}</button>`}
        <button class="jg-b o" data-a="exit">${esc(t('jangada.saveExit', 'Salvar e sair'))}</button>
      </div>`);
    const close = () => {
      w.hud.closePanel();
      w.setPaused(false);
      setBack(pause);
    };
    d.querySelector('[data-a=go]')!.addEventListener('click', close);
    d.querySelector('[data-a=cam]')!.addEventListener('click', () => {
      w.cycleCam();
      close();
    });
    d.querySelector('[data-a=menu]')?.addEventListener('click', menu);
    d.querySelector('[data-a=leave]')?.addEventListener('click', menu);
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    setBack(close);
  }

  /* ------------------------------ online ------------------------------ */
  function screen(): HTMLDivElement {
    endWorld();
    menuEl?.remove();
    const d = document.createElement('div');
    d.className = 'jg-menu';
    el.appendChild(d);
    menuEl = d;
    return d;
  }
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
      click: () => audio.click(),
    });
    setBack(menu);
  }
  async function connect(code: string, how: 'create' | 'join' | 'auto', party: boolean): Promise<void> {
    leaveOnline();
    const d = screen();
    d.innerHTML = `<div class="ttl" style="font-size:24px">${esc(t('jangada.net.connecting', 'Conectando...'))}</div><div class="sub">${esc(t('jangada.net.code', 'Código da sala'))}: <b>${esc(code)}</b></div>`;
    setBack(menu);
    let net: JNet;
    try {
      const m = await myself();
      net = await createNet(code, how, m);
    } catch (e) {
      if (menuEl !== d) return;
      const why = (e as Error)?.message ?? '';
      const msg =
        why === 'no_room' || why === 'bad_code'
          ? t('jangada.net.noRoom', 'Não achei essa sala. Confira o código!')
          : why === 'full'
            ? t('jangada.net.full', 'A jangada está cheia (4 Bloops).')
            : why === 'taken'
              ? t('jangada.net.taken', 'Esse código já está em uso. Tente de novo.')
              : t('jangada.net.offline', 'Sem conexão com o servidor agora.');
      notify(msg, { icon: 'cloud-off', kind: 'bad', ms: 3600 });
      if (party) menu();
      else onlineStart();
      return;
    }
    if (menuEl !== d || dead) {
      net.close();
      return;
    }
    const o: Online = { net, party, room: null, started: false, partyTimer: 0, partyAt: Date.now(), offs: [] };
    online = o;
    reportPlaying('jangada', net.code);
    o.offs.push(
      net.onEvent((from, e) => {
        if (e.t === 'go' && from === net.hostId && !o.started) {
          o.started = true;
          void start(false, net);
        }
        if (e.t === 'lobby' && from === net.hostId) {
          if (e.busy && !o.started) {
            // a jangada já está no mar: entra direto
            o.started = true;
            void start(false, net);
          }
          o.room?.refresh();
        }
      }),
    );
    o.offs.push(
      net.onRoster((why, id) => {
        if (online !== o) return;
        const p = net.peers.find((x) => x.id === id);
        if (why === 'join') {
          audio.click();
          notify(t('jangada.net.joined', '{n} subiu na jangada!', { n: p?.name ?? 'Bloop' }), { icon: 'user', kind: 'good' });
          if (net.isHost) net.send({ t: 'lobby', busy: !!world }, id);
        } else if (why === 'leave') notify(t('jangada.net.left', 'Um amigo saiu da jangada'), { icon: 'user' });
        else if (why === 'host' && net.isHost && o.party && !o.started) partyAuto();
        o.room?.refresh();
      }),
    );
    net.onClose(() => {
      if (online !== o) return;
      online = null;
      stopPlaying();
      for (const f of o.offs) f();
      notify(t('jangada.net.lost', 'A conexão com a sala caiu.'), { icon: 'cloud-off', kind: 'bad' });
      menu();
    });
    showRoom();
    if (party && net.isHost) partyAuto();
  }
  function showRoom(): void {
    const o = online;
    if (!o) return menu();
    const d = screen();
    o.room = fillRoom(d, {
      net: o.net,
      party: o.party,
      diff: () => sv.diff,
      start: () => hostStart(),
      leave: menu,
      callNow: callNext && o.net.isHost,
      status: () => (o.party ? t('jangada.net.partyWait', 'Esperando o grupo…') : ''),
      click: () => audio.click(),
    });
    callNext = false;
    setBack(menu);
  }
  function hostStart(): void {
    const o = online;
    if (!o || !o.net.isHost || o.started) return;
    o.started = true;
    o.net.send({ t: 'go' });
    void start(false, o.net);
  }
  function partyAuto(): void {
    const o = online;
    if (!o || !o.party || !o.net.isHost) return;
    clearTimeout(o.partyTimer);
    const check = () => {
      if (online !== o || o.started) return;
      if (o.net.peers.length >= partyWant || Date.now() - o.partyAt > 9000) hostStart();
      else o.partyTimer = window.setTimeout(check, 700);
    };
    o.partyTimer = window.setTimeout(check, 1200);
  }
  function leaveOnline(): void {
    const o = online;
    if (!o) return;
    online = null;
    stopPlaying();
    clearTimeout(o.partyTimer);
    o.room?.dispose();
    for (const f of o.offs) f();
    o.net.close();
  }

  /* ------------------------------ testes (?debug) ------------------------------ */
  if (location.search.includes('debug')) {
    (window as unknown as Record<string, unknown>).__jangada = {
      world: () => world,
      dbg: () => world?.debug(),
      start: (fresh = true, diff: Diff = 1) => {
        sv.diff = diff;
        return start(fresh);
      },
      menu,
      pause,
      save: () => {
        saveWorld();
        return JSON.parse(localStorage.getItem('bw-jangada') ?? 'null');
      },
      create: () => connect(newCode(), 'create', false),
      join: (code: string) => connect(code, 'join', false),
      host: () => hostStart(),
      online: () => online && { code: online.net.code, host: online.net.isHost, peers: online.net.peers.map((p) => p.id), started: online.started },
      pending: () => pending,
    };
  }

  const seat = partySeat('jangada');
  if (seat) consumePartySeat('jangada');
  if (seat?.direct) void connect(seat.code(5, CODE_ALPHA), 'join', false);
  else if (seat) {
    partyWant = Math.max(2, Math.min(MAX_PLAYERS, seat.n));
    void connect(seat.code(5, CODE_ALPHA), 'auto', true);
  } else menu();
  void codeFromRoom;
  return {
    destroy() {
      dead = true;
      leaveOnline();
      endWorld();
      menuEl?.remove();
      setBack(null);
      resetNotifyTop();
      clearNotify();
      el.remove();
      audio.applySettings();
    },
    pause() {
      if (world && !world.paused) pause();
    },
    resume() {
      /* continua pela tela de pausa */
    },
    inMatch() {
      return !!world;
    },
  };
}
