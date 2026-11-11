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
import { disposeSfx } from '../../3d/common/sfx';
import { ArenaMode, type ArenaResult } from './arena';
import { MATS, THEMES, themeById, type ThemeId } from './data';
import { GADGETS } from './gadgets';
import { RestoreMode, type RestoreResult } from './restore';
import { cavaSave, persist, type Diff } from './save';
import { injectCss } from './style';
import { Town } from './town';
import { World } from './world';
import { genArena, genTown } from './worldgen';
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
  const forced = /[?&]cftier=(\d)/.exec(location.search);
  const tier: Tier = forced ? (Math.min(3, +forced[1]) as Tier) : detectInitialTier();
  const vs = tier <= 1 ? 2 / 3 : 0.5;
  setNotifyTop(60); // abaixo das fichas de material (podem quebrar em 2 linhas por causa do botão de girar do hub)

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  const endWorld = () => {
    world?.dispose();
    world = null;
    restore = null;
    arena = null;
    clearNotify();
    objective(null);
  };
  const quit = () => {
    endWorld();
    setBack(null);
    exit();
  };

  /* ------------------------------ menu ------------------------------ */
  function menu(): void {
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
  async function bake(w: World, ld: { set(v: number): void }): Promise<void> {
    const tot = Math.max(1, w.T.pending);
    while (w.T.pending > 0 && !dead) {
      const t0 = performance.now();
      while (w.T.pending > 0 && performance.now() - t0 < 30) w.T.update(1, null);
      ld.set(0.25 + 0.75 * (1 - w.T.pending / tot));
      await frame();
    }
  }

  async function startRestore(themeId: ThemeId): Promise<void> {
    if (!webglOk()) {
      notify(t('cavafala.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    last = { kind: 'restore', theme: themeId };
    endWorld();
    menuEl?.remove();
    menuEl = null;
    const ld = loading();
    await frame();
    const th = themeById(themeId);
    const variant = Math.floor(Math.random() * 1000);
    const { T, L } = genTown(th, vs, tier >= 1, variant);
    ld.set(0.15);
    await frame();
    const town = new Town(th, L, th.seed * 31 + variant);
    const w = new World(el, { arena: false, theme: th, tier, T, town, spawn: L.spawn, waterY: th.sea ? 7 : -100, bounds: { x0: T.ox + 0.6, z0: T.oz + 0.6, x1: -T.ox - 0.6, z1: -T.oz - 0.6 }, onPause: pause });
    world = w;
    w.hud.show(false);
    await bake(w, ld);
    if (dead) return;
    restore = new RestoreMode(w, town, th, L, isSolo('cavafala'), (r) => resultsRestore(th.id, r));
    w.mode = restore;
    ld.el.remove();
    w.hud.show(true);
    w.start();
    setBack(pause);
  }

  async function startArena(): Promise<void> {
    if (!webglOk()) {
      notify(t('cavafala.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    last = { kind: 'arena' };
    endWorld();
    menuEl?.remove();
    menuEl = null;
    const ld = loading();
    await frame();
    const { T, topY, R } = genArena(vs, tier >= 1, Math.floor(Math.random() * 9999));
    ld.set(0.2);
    await frame();
    const w = new World(el, { arena: true, theme: null, tier, T, town: null, spawn: new THREE.Vector3(0, topY + 2, 0), waterY: -100, bounds: null, onPause: pause });
    world = w;
    w.hud.show(false);
    await bake(w, ld);
    if (dead) return;
    arena = new ArenaMode(w, { bots: sv.bots, diff: sv.diff, practice: sv.practice, R, topY }, resultsArena);
    w.mode = arena;
    ld.el.remove();
    w.hud.show(true);
    w.start();
    setBack(pause);
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
      <p>${esc(t('cavafala.help', 'Cave com CAVAR, segure FALAR e diga o que quer (ex.: “ponte”, “trampolim de ouro”, “canhão de espuma duplo”, “carrinho com foguete”). Sem microfone? Toque no teclado.'))}</p>
      <div class="cf-row">
        <button class="cf-btn g" data-a="go">${icon('play', { size: 18 })}${esc(t('cavafala.resume', 'Continuar'))}</button>
        ${restore ? `<button class="cf-btn o" data-a="top">${esc(t('cavafala.toTop', 'Voltar ao topo'))}</button>` : ''}
        <button class="cf-btn" data-a="menu">${esc(t('cavafala.menu', 'Menu'))}</button>
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
    d.querySelector('[data-a=menu]')!.addEventListener('click', menu);
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    setBack(close);
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
      startRestore: (th: ThemeId = 'pesca') => startRestore(th),
      startArena: (bots = 2, diff: Diff = 1, practice = false) => {
        sv.bots = bots;
        sv.diff = diff;
        sv.practice = practice;
        return startArena();
      },
      menu,
      say: (s: string) => world?.say(s),
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

  menu();
  return {
    destroy() {
      dead = true;
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
