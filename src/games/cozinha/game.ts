/* ============================================================
 *  COZINHA MALUCA — entrada do jogo (chunk sob demanda).
 *  Fluxo: escolher gráficos (2D/3D) → restaurante (saguão) →
 *  turno (dia) → resultado → melhorias → próximo dia … (infinito).
 * ============================================================ */
import { cozinhaIntro } from './intro';
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { tap } from '../../core/haptics';
import { QualityGovernor, detectInitialTier, type QualitySettings } from '../../core/quality';
import { save } from '../../core/storage';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { showRewarded, rewardedAvailable } from '../../services/ads';
import type { PeerState } from '../../services/presence-api';
import { openEmoteWheel, closeEmoteWheel } from '../../social/emotes';
import { icon } from '../../ui/icons';
import { clearNotify, notify, objective, resetNotifyTop, setNotifyAlign, setNotifyTop } from '../../ui/notify';
import { createJoystick, isSolo, setSolo } from '../../ui/touch';
import { charSprite, drawPetIcon } from './art';
import { Brain, CMDS, type Cmd } from './bots';
import { HIRE_COST, MAX_CREW, PACKS, RECIPES, ROLES, UPGRADES, dayParams, roleDesc, roleName, specialName, themeName, type Role, type Special, type Theme } from './data';
import { Tutorial, hintTarget } from './guide';
import { openStartMenu, type SmCard, type SmPage } from '../../ui/startmenu';
import { ENDLESS_AT, HELPER_AT, LEVEL_COUNT, WORLDS, dailyLevel, dayKey, level, levelNews, levelOpen, totalStars, worldStart, type Level } from './levels';
import { czIcon } from './icons';
import { Net, type HostCfg } from './net';
import { Render2D } from './render2d';
import { czSave, persistCz } from './save';
import { FX, IK, Sim, mulberry, type Player } from './sim';
import { injectCzCss } from './style';

export interface Renderer {
  me: Player | null;
  setSim(sim: Sim, decor: number): void;
  resize(w: number, h: number, dpr: number, topPad: number, botPad: number): void;
  draw(time: number, dt: number, q: QualitySettings): void;
  onFx(e: { t: FX; x: number; y: number; v: number }): void;
  destroy(): void;
  /** 3D em 1ª pessoa: o renderizador cuida da entrada do jogador local (joystick/olhar/botões próprios) */
  fps?: boolean;
  /** chamado antes de sim.step (move o chef e aplica pegar/jogar/ação) */
  preStep?(dt: number): void;
  /** ponte online do 1ª pessoa (pegar com alvo, resultado de arremesso) */
  net?: { notePick(target: number): void; noteThrow(st: number, x: number, y: number): void } | null;
  /** 3D: o passo do treino vai para objetos do mundo (nota adesiva na tela de pedidos, balão no alvo) */
  tip?(id: string, txt: string): void;
}

const qs = new URLSearchParams(location.search);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    (g?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return !!g;
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectCzCss();
  const el = document.createElement('div');
  el.className = 'cz-root';
  root.appendChild(el);
  const sv = czSave();
  if (!sv.staff.length && !sv.days) {
    sv.staff = ['cook']; // primeiro ajudante é grátis
    persistCz();
  }
  const SOLO = () => isSolo('cozinha');
  if (sv.solo) {
    setSolo('cozinha', true); // migra a opção antiga
    sv.solo = false;
    persistCz();
  }
  const gov = new QualityGovernor({ emit: false, persist: false });
  let dead = false;
  let raf = 0;
  let popBack: (() => void) | null = null;
  let mode: '2d' | '3d' = sv.mode === '3d' ? '3d' : '2d';
  const net = new Net();
  let netCode = sv.code || '';
  let onShift: boolean[] = sv.staff.map(() => true);
  let hostGo = 0;
  let cleanup: (() => void) | null = null;
  let pauseHook: (() => void) | null = null;

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  const clear = () => {
    cleanup?.();
    cleanup = null;
    cancelAnimationFrame(raf);
    el.innerHTML = '';
    closeEmoteWheel();
  };
  const ov = (center = false): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = 'cz-ov' + (center ? ' cz-center' : '');
    el.appendChild(d);
    return d;
  };
  const bind = (root2: HTMLElement, sel: string, fn: (b: HTMLElement) => void) =>
    root2.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        fn(b);
      }),
    );

  /* ======================= 1) tela de início (2D/3D + fases) ======================= */
  function chooser(): void {
    map();
  }

  /** aviso pequeno no topo (compartilhado: src/ui/notify) */
  function banner(txt: string, sub = '', ms = 1800): void {
    notify(sub ? txt + ' · ' + sub : txt, { ms: Math.max(1400, ms) });
  }

  /* ======================= 1b) mapa de fases ======================= */
  const litStars = (n: number, size = 12) => `<span class="cz-ministars">${Array.from({ length: n }, () => `<i class="on">${icon('star', { size })}</i>`).join('')}</span>`;
  const starsRow = (n: number, size = 14) => [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}">${icon('star', { size })}</i>`).join('');
  const helpersFor = (lv: Level | null): number => {
    if (SOLO()) return 0;
    if (!lv) return -1; // modo sem fim: equipe contratada
    if (lv.tutorial) return 0;
    if (lv.n === 0) return 1;
    return HELPER_AT.filter((a) => lv.n >= a).length;
  };
  const endlessOpen = () => (sv.lvStars[ENDLESS_AT] ?? 0) > 0 || sv.days > 2;
  function map(): void {
    clear();
    curLvN = 0;
    const gl = webglOk();
    const tier = detectInitialTier();
    const ts = totalStars(sv.lvStars);
    let next = 1;
    while (next < LEVEL_COUNT && (sv.lvStars[next] ?? 0) > 0) next++;
    const today = dayKey();
    const dDone = sv.daily.key === today ? sv.daily.stars : 0;
    const setMode = (m: '2d' | '3d') => {
      if (m === '3d' && !gl) {
        banner(t('cozinha.no3d', '3D não disponível neste aparelho. Abrindo em 2D.'));
        m = '2d';
      }
      mode = m;
      sv.mode = mode;
      persistCz();
    };
    const levels = (p: SmPage) => {
      WORLDS.forEach((W, w) => {
        const a = worldStart(w);
        const b = w + 1 < WORLDS.length ? worldStart(w + 1) - 1 : LEVEL_COUNT;
        const lockedW = ts < W.stars;
        p.label(W.name() + (lockedW ? ` · ★ ${W.stars}` : ''), lockedW ? icon('lock', { size: 18 }) : icon('star', { size: 18 }));
        const cards: SmCard[] = [];
        for (let n = a; n <= b; n++) {
          const st = sv.lvStars[n] ?? 0;
          const open = levelOpen(n, sv.lvStars);
          cards.push({
            id: 'lv' + n,
            icon: `<span class="sm-emoji">${n}</span>`,
            color: W.col[0],
            label: st ? '★'.repeat(st) + '☆'.repeat(3 - st) : open ? t('cozinha.newLv', 'Nova!') : '',
            say: t('cozinha.playLv', 'Jogar fase {n}', { n }),
            lock: !open,
            hot: open && st === 0,
            onTap: () => levelSheet(level(n)),
          });
        }
        p.cards(cards, { scroll: true });
      });
    };
    const sm = openStartMenu(el, {
      game: 'cozinha',
      chips: [
        { icon: icon('star', { size: 20 }), text: `${ts}/${LEVEL_COUNT * 3}` },
        { icon: icon('coin', { size: 20 }), text: fmt(sv.cash) },
      ],
      onBack: () => quit(),
      settings: (p) => {
        p.toggle({ icon: czIcon('robot', 30), label: t('cozinha.soloS', 'Sem ajudantes'), say: t('cozinha.solo', 'Jogar sozinho (sem ajudantes)'), value: SOLO(), onChange: (v) => setSolo('cozinha', v) });
        p.cards([{ icon: czIcon('hat', 40), label: t('cozinha.tutorial', 'Treino'), color: '#ffe6a8', onTap: () => playLevel(level(1)) }], { size: 'small', cols: 1 });
      },
      build: (p) => {
        p.cards([
          { id: '2d', icon: czIcon('flat', 60), label: '2D', say: t('cozinha.mode2dD', 'Leve e rápido, roda em qualquer celular'), sub: t('cozinha.mode2d', 'Desenhado'), color: '#ffd9a8', sel: mode === '2d', onTap: () => (setMode('2d'), p.refresh()) },
          { id: '3d', icon: czIcon('cube', 60), label: '3D', say: t('cozinha.mode3dFps', 'Primeira pessoa — caos total!'), sub: !gl ? t('cozinha.no3dShort', 'Indisponível neste aparelho') : tier <= 1 ? t('cozinha.mode3dWeakS', 'Pode pesar') : t('cozinha.mode3dS', 'Primeira pessoa'), color: '#c8b0ff', sel: mode === '3d', disabled: !gl, onTap: () => (setMode('3d'), p.refresh()) },
        ]);
        if (!sv.tutDone) p.play({ sub: t('cozinha.tutorial', 'Treino'), onTap: () => playLevel(level(1)) });
        else p.play({ sub: t('cozinha.playLv', 'Jogar fase {n}', { n: next }), onTap: () => levelSheet(level(next)) });
        p.friends({ game: 'cozinha', onTap: () => friends() });
        p.cards(
          [
            { id: 'lv', icon: czIcon('book', 40), label: t('cozinha.levels', 'Fases'), color: '#ffe6a8', onTap: () => sm.push(levels, t('cozinha.levels', 'Fases')) },
            { id: 'daily', icon: icon('calendar', { size: 40 }), label: t('cozinha.dailyS', 'Do dia'), say: t('cozinha.daily', 'Desafio do dia'), sub: dDone ? '★'.repeat(dDone) : '', color: '#ffc0d8', onTap: () => levelSheet(dailyLevel()) },
            { id: 'endless', icon: icon('refresh', { size: 40 }), label: t('cozinha.endlessS', 'Sem fim'), say: endlessOpen() ? t('cozinha.endless', 'Modo sem fim') : t('cozinha.endlessLock', 'Termine a fase {n} para liberar', { n: ENDLESS_AT }), lock: !endlessOpen(), color: '#c0f0ff', onTap: () => lobby() },
            { id: 'shop', icon: czIcon('cart', 40), label: t('cozinha.shopS', 'Loja'), say: t('cozinha.shop', 'Melhorias'), color: '#fff0a0', onTap: () => shop('up') },
          ],
          { size: 'small', cols: 2 },
        );
      },
    });
    setBack(() => sm.back());
    if (net.ses) {
      let last = performance.now();
      const tick = (ms: number) => {
        raf = requestAnimationFrame(tick);
        followHost((ms - last) / 1000);
        last = ms;
      };
      raf = requestAnimationFrame(tick);
    }
  }

  /** ficha da fase: cardápio, novidades, metas de estrelas */
  function levelSheet(lv: Level): void {
    const sh = document.createElement('div');
    sh.className = 'cz-sheet';
    const daily = lv.n === 0;
    const news = daily || lv.tutorial ? { recipes: [], procs: [] } : levelNews(lv.n);
    const procName = (p: string) =>
      p === 'chop' ? t('cozinha.st.board', 'Tábua') : p === 'boil' ? t('cozinha.st.pot', 'Panela') : p === 'fry' ? t('cozinha.st.pan', 'Frigideira') : p === 'bake' ? t('cozinha.st.oven', 'Forno') : t('cozinha.st.blender', 'Liquidificador');
    const best = daily ? (sv.daily.key === dayKey() ? sv.daily.stars : 0) : sv.lvStars[lv.n] ?? 0;
    const hp = helpersFor(lv);
    const g = lv.p.goal;
    sh.innerHTML = `<div class="cz-card">
      <div class="cz-row"><b class="cz-grow cz-sheett">${daily ? t('cozinha.daily', 'Desafio do dia') + (sv.daily.streak > 1 ? ' · ' + t('cozinha.streak', '{n} dias seguidos', { n: sv.daily.streak }) : '') : lv.tutorial ? t('cozinha.tutorialN', 'Treino {n}/3', { n: lv.tutorial }) : t('cozinha.levelN', 'Fase {n}', { n: lv.n })}</b><span class="cz-ministars">${starsRow(best, 16)}</span></div>
      <div class="cz-note" style="text-align:left">${esc(WORLDS[lv.world].name())}${lv.special !== 'none' ? ' · ' + esc(specialName(lv.special)) : ''}</div>
      <div class="cz-menu-list">${lv.menu.map((r) => `<span${news.recipes.includes(r) ? ' class="cz-new"' : ''}>${esc(RECIPES[r].name())}</span>`).join('')}</div>
      ${news.recipes.length || news.procs.length ? `<div class="cz-newrow">${t('cozinha.new', 'Novo!')} ${news.procs.map((p) => esc(procName(p))).join(', ')}</div>` : ''}
      ${lv.tutorial ? `<div class="cz-note">${t('cozinha.tutNote', 'Sem relógio: siga a seta verde e as dicas no topo.')}</div>` : `<div class="cz-goals"><span>${litStars(1)} ${fmt(g[0])}</span><span>${litStars(2)} ${fmt(g[1])}</span><span>${litStars(3)} ${fmt(g[2])}</span></div>`}
      <div class="cz-note">${hp === 0 ? (SOLO() ? t('cozinha.soloOn', 'Sozinho: sem ajudantes') : t('cozinha.noHelpers', 'Sem ajudantes nesta fase')) : t('cozinha.helpersN', 'Ajudantes: {n} (toque neles e dê ordens)', { n: hp })}</div>
      <div class="cz-row"><button class="cz-btn cz-grow" data-a="close">${t('cozinha.back', 'Voltar')}</button><button class="cz-btn cz-green cz-big cz-grow" data-a="go">${icon('play', { size: 22 })}${t('cozinha.play', 'Jogar')}</button></div>
    </div>`;
    el.appendChild(sh);
    const close = () => {
      sh.remove();
      setBack(() => quit());
    };
    sh.addEventListener('click', (e) => {
      if (e.target === sh) close();
    });
    bind(sh, '[data-a=close]', close);
    bind(sh, '[data-a=go]', () => playLevel(lv));
    setBack(close);
  }

  function playLevel(lv: Level): void {
    curLvN = lv.n === 0 ? -1 : lv.n;
    hostGo++;
    void startDay(hostCfg(), false);
  }

  /* ======================= 2) restaurante (saguão) ======================= */
  function crewList(): Role[] {
    if (SOLO()) return [];
    const humans = net.online ? net.humans.length : 0;
    const out: Role[] = [];
    sv.staff.forEach((r, i) => {
      if (onShift[i] && out.length + 1 + humans < MAX_CREW) out.push(r);
    });
    return out;
  }
  function wage(n: number): number {
    return n * (6 + sv.day * 2);
  }
  function hostCfg(): HostCfg {
    return { day: sv.day, seed: (sv.day * 7919 + sv.days * 31) >>> 0, crew: 1 + crewList().length + (net.online ? net.humans.length : 0), ups: sv.ups, packs: sv.packs, portrait: window.innerHeight > window.innerWidth, go: hostGo, lv: curLvN };
  }
  /** fase em jogo: >0 campanha, -1 desafio do dia, 0 modo sem fim */
  let curLvN = 0;

  function lobby(): void {
    clear();
    const d = ov();
    const p = dayParams(sv.day, sv.ups);
    const sim = new Sim({ day: sv.day, seed: hostCfg().seed, ups: sv.ups, packs: sv.packs, crew: 1 + crewList().length, portrait: window.innerHeight > window.innerWidth });
    const crew = crewList();
    const isClient = net.online && !net.isHost();
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.endless', 'Modo sem fim')}</div>
      <div class="cz-row"><span class="cz-pill">${czIcon('hat', 22)}${t('cozinha.day', 'Dia {n}', { n: sv.day })}</span><span class="cz-pill">${icon('coin', { size: 20 })}${fmt(sv.cash)}</span>${sv.bestDay ? `<span class="cz-pill">${icon('trophy', { size: 20 })}${sv.bestDay}</span>` : ''}</div>
      <div class="cz-card">
        <div class="cz-sub" style="margin:0 auto">${themeName(sim.theme)} · ${t('cozinha.goal', 'Meta: {a}', { a: fmt(p.goal[0]) })}</div>
        <div class="cz-note">${t('cozinha.menuToday', 'Cardápio de hoje')}</div>
        <div class="cz-menu-list">${sim.menu.map((r) => `<span>${esc(RECIPES[r].name())}</span>`).join('')}</div>
        <div class="cz-note">${t('cozinha.crew', 'Equipe')} (${1 + crew.length + (net.online ? net.humans.length : 0)}/${MAX_CREW})</div>
        <div class="cz-crew" data-crew></div>
        ${crew.length ? `<div class="cz-note">${t('cozinha.wage', 'Salário dos ajudantes: {n}', { n: wage(crew.length) })}</div>` : ''}
        ${isClient ? `<div class="cz-sub">${t('cozinha.waitingHost', 'Esperando o anfitrião abrir o restaurante...')}</div>` : `<button class="cz-btn cz-green cz-big" data-a="open">${icon('play', { size: 26 })}${t('cozinha.open', 'Abrir restaurante')}</button>`}
        <div class="cz-row">
          <button class="cz-btn cz-gold cz-grow" data-a="shop">${czIcon('cart', 22)}${t('cozinha.shop', 'Melhorias')}</button>
          <button class="cz-btn cz-pink cz-grow" data-a="friends">${czIcon('friends', 22)}${t('cozinha.friends', 'Com amigos')}</button>
        </div>
        <div class="cz-row">
          <button class="cz-btn cz-grow" data-a="gfx">${mode === '3d' ? czIcon('cube', 20) : czIcon('flat', 20)}${t('cozinha.graphics', 'Gráficos')}: ${mode.toUpperCase()}</button>
          <button class="cz-btn cz-grow" data-a="map">${icon('star', { size: 20 })}${t('cozinha.map', 'Mapa')}</button>
        </div>
        ${net.online ? `<div class="cz-note">${t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length })}${netCode ? ' · #' + esc(netCode) : ''}</div>` : ''}
      </div>`;
    // equipe (slots com retrato)
    const crewEl = d.querySelector<HTMLElement>('[data-crew]')!;
    const slot = (skin: string, role: Role, label: string, on: boolean, idx: number) => {
      const s = document.createElement('div');
      s.className = 'cz-slot' + (on ? ' cz-on' : '');
      const c = charSprite(skin, role, 88);
      const cc = document.createElement('canvas');
      cc.width = 88;
      cc.height = 110;
      cc.getContext('2d')!.drawImage(c, 0, 0);
      s.appendChild(cc);
      s.insertAdjacentHTML('beforeend', `<span>${esc(label)}</span>`);
      if (idx >= 0)
        s.addEventListener('click', () => {
          audio.click();
          onShift[idx] = !onShift[idx];
          lobby();
        });
      crewEl.appendChild(s);
    };
    slot(save.skin, 'cook', t('cozinha.you', 'Você'), true, -1);
    for (const h of net.online ? net.humans : []) slot(h.skin === 'custom' ? 'bloop' : h.skin, 'cook', h.name, true, -1);
    sv.staff.forEach((r, i) => slot(BOT_SKINS[i % BOT_SKINS.length], r, roleName(r) + (onShift[i] ? '' : ' (' + t('cozinha.off', 'folga') + ')'), !!onShift[i], i));
    bind(d, '[data-a=open]', () => {
      hostGo++;
      startDay(hostCfg(), false);
    });
    bind(d, '[data-a=shop]', () => shop('up'));
    bind(d, '[data-a=friends]', () => friends());
    bind(d, '[data-a=gfx]', () => chooser());
    bind(d, '[data-a=map]', () => map());
    setBack(() => map());
    // online: mantém presença viva e segue o host
    let last = performance.now();
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (ms - last) / 1000;
      last = ms;
      followHost(dt);
    };
    raf = requestAnimationFrame(tick);
    net.onChange = () => {
      // atualiza a contagem sem recriar a tela a cada pacote
      const n = d.querySelector('.cz-note:last-child');
      if (n && net.online) n.textContent = t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length }) + (netCode ? ' · #' + netCode : '');
    };
  }
  let lastSeenGo = -1;
  /** online: mantém presença viva e segue o anfitrião (do saguão ou do mapa) */
  function followHost(dt: number): void {
    if (!net.ses) return;
    net.sendLobby(net.isHost() ? hostCfg() : null, dt);
    const hs = net.hostState;
    if (hs && !net.isHost()) {
      const cfg = Net.readCfg(hs);
      if (cfg && cfg.go !== lastSeenGo && hs.T !== undefined) {
        lastSeenGo = cfg.go;
        curLvN = cfg.lv ?? 0;
        void startDay(cfg, true);
      }
    }
  }

  function friends(): void {
    clear();
    const d = ov(true);
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.friends', 'Com amigos')}</div>
      <div class="cz-sub">${t('cozinha.codeHint', 'Amigos com o mesmo código cozinham juntos (até 5). Sem código, você entra na cozinha aberta.')}</div>
      <div class="cz-card">
        <input class="cz-input" maxlength="6" inputmode="numeric" placeholder="1234" value="${esc(netCode)}" aria-label="${t('cozinha.code', 'Código da cozinha')}">
        <button class="cz-btn cz-green cz-big" data-a="go">${czIcon('friends', 24)}${t('cozinha.connect', 'Entrar')}</button>
        <div class="cz-note" data-st>${net.online ? t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length }) : ''}</div>
        <button class="cz-btn" data-a="back">${t('cozinha.back', 'Voltar')}</button>
      </div>`;
    const inp = d.querySelector('input')!;
    bind(d, '[data-a=go]', async () => {
      netCode = inp.value.replace(/[^0-9a-z]/gi, '').slice(0, 6);
      sv.code = netCode;
      persistCz();
      const stEl = d.querySelector('[data-st]')!;
      stEl.textContent = '...';
      net.ses?.leave();
      net.ses = null;
      net.closed = false;
      const ok = await net.connect(netCode);
      if (dead) return;
      stEl.textContent = ok ? t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length }) : t('cozinha.offline', 'Sem internet: só ajudantes robôs');
      if (ok) setTimeout(() => !dead && map(), 600);
    });
    bind(d, '[data-a=back]', () => map());
    setBack(() => map());
  }

  /* ======================= 3) loja / melhorias ======================= */
  function shop(tab: 'up' | 'rec' | 'staff'): void {
    clear();
    const d = ov();
    const head = `<div class="cz-title">${t('cozinha.shop', 'Melhorias')}</div>
      <span class="cz-pill">${icon('coin', { size: 20 })}${fmt(sv.cash)}</span>
      <div class="cz-tabs">
        <button class="cz-btn${tab === 'up' ? ' cz-on' : ''}" data-t="up">${czIcon('pot', 18)}${t('cozinha.upgrades', 'Cozinha')}</button>
        <button class="cz-btn${tab === 'rec' ? ' cz-on' : ''}" data-t="rec">${czIcon('book', 18)}${t('cozinha.recipes', 'Receitas')}</button>
        <button class="cz-btn${tab === 'staff' ? ' cz-on' : ''}" data-t="staff">${czIcon('robot', 18)}${t('cozinha.staff', 'Ajudantes')}</button>
      </div>`;
    let body = '';
    if (tab === 'up') {
      for (const u of UPGRADES) {
        const lv = sv.ups[u.id];
        const cost = Math.round(u.cost(lv));
        const max = lv >= u.max;
        body += `<div class="cz-item"><div class="cz-grow"><b>${esc(u.name())}</b><small>${esc(u.desc())}</small><div class="cz-lv">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="cz-btn cz-gold" data-u="${u.id}" ${max || sv.cash < cost ? 'disabled' : ''}>${max ? t('cozinha.max', 'Máximo') : icon('coin', { size: 18 }) + fmt(cost)}</button></div>`;
      }
    } else if (tab === 'rec') {
      PACKS.forEach((p, i) => {
        const owned = sv.packs.includes(i);
        const locked = sv.day < p.minDay;
        const list = RECIPES.filter((r) => r.pack === i)
          .map((r) => esc(r.name()))
          .join(', ');
        body += `<div class="cz-item"><div class="cz-grow"><b>${esc(p.name())}</b><small>${list}</small></div>
          ${owned ? `<span class="cz-pill">${icon('check', { size: 18 })}</span>` : locked ? `<span class="cz-pill">${icon('lock', { size: 18 })}${t('cozinha.locked', 'Dia {n}', { n: p.minDay })}</span>` : `<button class="cz-btn cz-gold" data-p="${i}" ${sv.cash < p.cost ? 'disabled' : ''}>${icon('coin', { size: 18 })}${fmt(p.cost)}</button>`}</div>`;
      });
    } else {
      body += `<div class="cz-note">${t('cozinha.staffNote2', 'Ajudantes só fazem o que você mandar: no jogo, toque neles e escolha uma tarefa. No saguão, toque para dar folga.')}</div>`;
      for (const r of ROLES) {
        const have = sv.staff.filter((x) => x === r).length;
        const cost = HIRE_COST(sv.staff.length);
        const full = sv.staff.length >= MAX_CREW - 1;
        body += `<div class="cz-item"><canvas width="66" height="82" data-r="${r}" style="width:44px;height:55px"></canvas><div class="cz-grow"><b>${esc(roleName(r))}${have ? ' x' + have : ''}</b><small>${esc(roleDesc(r))}</small></div>
          <button class="cz-btn cz-gold" data-h="${r}" ${full || sv.cash < cost ? 'disabled' : ''}>${full ? t('cozinha.max', 'Máximo') : icon('coin', { size: 18 }) + fmt(cost)}</button></div>`;
      }
    }
    d.innerHTML = head + `<div class="cz-card">${body}</div><button class="cz-btn cz-big" style="width:min(380px,94vw)" data-a="back">${t('cozinha.back', 'Voltar')}</button>`;
    d.querySelectorAll<HTMLCanvasElement>('canvas[data-r]').forEach((c) => c.getContext('2d')!.drawImage(charSprite('mint', c.dataset.r as Role, 66), 0, 0));
    bind(d, '[data-t]', (b) => shop(b.dataset.t as 'up' | 'rec' | 'staff'));
    bind(d, '[data-u]', (b) => {
      const u = UPGRADES.find((x) => x.id === b.dataset.u)!;
      const cost = Math.round(u.cost(sv.ups[u.id]));
      if (sv.cash < cost || sv.ups[u.id] >= u.max) return;
      sv.cash -= cost;
      sv.ups[u.id]++;
      persistCz();
      audio.cash();
      tap('medium');
      shop('up');
    });
    bind(d, '[data-p]', (b) => {
      const i = Number(b.dataset.p);
      if (sv.cash < PACKS[i].cost) return;
      sv.cash -= PACKS[i].cost;
      sv.packs.push(i);
      persistCz();
      audio.cash();
      shop('rec');
    });
    bind(d, '[data-h]', (b) => {
      const cost = HIRE_COST(sv.staff.length);
      if (sv.cash < cost || sv.staff.length >= MAX_CREW - 1) return;
      sv.cash -= cost;
      sv.staff.push(b.dataset.h as Role);
      onShift.push(true);
      persistCz();
      audio.cash();
      shop('staff');
    });
    bind(d, '[data-a=back]', () => map());
    setBack(() => map());
  }

  /* ======================= 4) o turno ======================= */
  async function startDay(cfg: HostCfg, client: boolean): Promise<void> {
    clear();
    net.onChange = null;
    // abertura (1º turno, só jogando sozinho): src/games/cozinha/intro
    if (!client && !net.online && cozinhaIntro.due()) {
      await cozinhaIntro.once(root);
      if (dead) return;
    }
    const lv: Level | null = (cfg.lv ?? 0) > 0 ? level(cfg.lv!) : cfg.lv === -1 ? dailyLevel() : null;
    const opts = { day: lv ? Math.max(1, lv.n) : cfg.day, seed: lv ? lv.seed : cfg.seed, ups: cfg.ups, packs: cfg.packs, crew: cfg.crew, portrait: cfg.portrait, client, level: lv ?? undefined } as ConstructorParameters<typeof Sim>[0];
    const forceTheme = qs.get('cztheme') as Theme | null;
    const forceEv = qs.get('czev') as Special | null;
    if (forceTheme) opts.theme = forceTheme;
    if (forceEv) opts.special = forceEv;
    const sim = new Sim(opts);
    const me = sim.addPlayer(1, t('cozinha.you', 'Você'), save.skin, false, 'cook');
    me.hid = net.h;
    const brains: Brain[] = [];
    const remotes = new Map<number, Player>();
    const lastPick = new Map<number, number>();
    const others = new Map<string, Player>();
    if (!client) {
      if (net.online) for (const h of net.humans) {
        const p = sim.addPlayer(100 + remotes.size, h.name, h.skin === 'custom' ? 'bloop' : h.skin, false, 'cook', true);
        p.hid = h.s.h ?? 0;
        remotes.set(p.hid, p);
      }
      const nbots = Number(qs.get('czbots') ?? -1);
      const hp = helpersFor(lv);
      const roles: Role[] =
        nbots >= 0
          ? (['chopper', 'washer', 'server', 'cook', 'chopper'] as Role[]).slice(0, nbots)
          : hp >= 0
            ? (['chopper', 'washer', 'server', 'cook'] as Role[]).slice(0, Math.max(0, Math.min(hp, MAX_CREW - 1 - (net.online ? net.humans.length : 0))))
            : crewList();
      roles.forEach((r, i) => {
        const p = sim.addPlayer(10 + i, roleName(r), BOT_SKINS[i % BOT_SKINS.length], true, r);
        const b = new Brain(sim, p, mulberry(cfg.seed + i * 977));
        b.pet = true;
        b.owner = me;
        b.slow = net.online && net.humans.length ? 1.25 : 1;
        b.onBark = (q, k) => {
          if (k === 'oops') {
            audio.fail();
            banner(t('cozinha.cmd.oops', '{n} se atrapalhou um pouquinho!', { n: q.name }), '', 1600);
          } else if (k === 'no') audio.fail();
          else if (k === '!') audio.tick(2);
          else if (k === 'ok') audio.coin(1);
          else audio.click();
        };
        brains.push(b);
      });
      if (qs.has('czauto')) brains.push(new Brain(sim, me, mulberry(5)));
    } else {
      sim.clientPick = () => net.notePick();
    }
    const pets = brains.filter((b) => b.pet);
    const tut = lv && lv.tutorial ? new Tutorial(lv.tutorial, sim) : null;
    // depuração/screenshots: turno curto e incêndio forçado
    const dlen = Number(qs.get('czlen') ?? 0);
    if (dlen > 0) (sim.p as { len: number }).len = dlen;
    if (qs.has('czfire')) {
      const pans = sim.st.filter((s) => (s.fx || s.fy) && (s.k === 'pan' || s.k === 'pot' || s.k === 'counter'));
      setTimeout(() => pans.slice(0, 2).forEach((s) => sim.ignite(s)), 4000);
    }
    const mkBot = (i: number, role: Role) => sim.addPlayer(10 + i, roleName(role), BOT_SKINS[i % BOT_SKINS.length], true, role, true);
    const mkHuman = (p: PeerState) => sim.addPlayer(200 + others.size, p.name, p.skin === 'custom' ? 'bloop' : p.skin, false, 'cook', true);

    // canvas + renderizador
    const cv = document.createElement('canvas');
    cv.className = 'cz-cv';
    el.appendChild(cv);
    let rend: Renderer;
    if (mode === '3d') {
      try {
        const m = await import('./render3d');
        if (dead) return;
        rend = await m.createRender3D(el, cv, sim, sv.ups.decor);
      } catch (err) {
        console.warn('[cozinha] 3D falhou', err);
        mode = '2d';
        sv.mode = '2d';
        persistCz();
        banner(t('cozinha.no3d', '3D não disponível neste aparelho. Abrindo em 2D.'));
        const r2 = new Render2D(cv);
        rend = Object.assign(r2, {}) as unknown as Renderer;
      }
    } else rend = new Render2D(cv) as unknown as Renderer;
    rend.me = me;
    rend.setSim(sim, cfg.ups.decor);
    if (rend.fps && net.online) rend.net = { notePick: (tg) => net.notePick(tg), noteThrow: (st, x, y) => net.noteThrow(st, x, y) };

    // HUD
    const hud = document.createElement('div');
    hud.className = 'cz-hud';
    hud.innerHTML = `
      <div class="cz-top">
        <button class="cz-btn cz-ic" data-a="pause">${icon('pause', { size: 24 })}</button>
        <span class="cz-pill">${czIcon('hat', 20)}<span data-day></span></span>
        <span class="cz-pill" data-clock${tut ? ' style="display:none"' : ''}>${icon('clock', { size: 20 })}<span></span></span>
        <button class="cz-skip" data-a="skip" style="display:none">${tut ? t('cozinha.skipTut', 'Pular treino') : t('cozinha.skip', 'Pular')} ›</button>
        <span class="cz-sp"></span>
        ${lv && !tut ? `<span class="cz-pill cz-goal" data-goal><span class="cz-ministars"></span><span></span></span>` : ''}
        <span class="cz-pill">${icon('coin', { size: 20 })}<span data-cash>0</span></span>
        <button class="cz-btn cz-ic" data-a="emote">${icon('smile', { size: 24 })}</button>
      </div>
      <div class="cz-pets"></div>
      <div class="cz-acts">
        <button class="cz-act cz-pick" data-b="pick">${czIcon('hand', 34)}<small data-pl>${t('cozinha.pick', 'Pegar')}</small></button>
        <button class="cz-act cz-do" data-b="act">${czIcon('knife', 46)}<small data-al>${t('cozinha.act', 'Ação')}</small></button>
      </div>`;
    el.appendChild(hud);
    const dayEl = hud.querySelector<HTMLElement>('[data-day]')!;
    const clockPill = hud.querySelector<HTMLElement>('[data-clock]')!;
    const clockEl = clockPill.querySelector<HTMLElement>('span')!;
    const cashEl = hud.querySelector<HTMLElement>('[data-cash]')!;
    const actBtn = hud.querySelector<HTMLElement>('[data-b=act]')!;
    const pickBtn = hud.querySelector<HTMLElement>('[data-b=pick]')!;
    const actLabel = hud.querySelector<HTMLElement>('[data-al]')!;
    const pickLabel = hud.querySelector<HTMLElement>('[data-pl]')!;
    dayEl.textContent = lv ? (lv.n === 0 ? t('cozinha.dailyShort', 'Desafio') : lv.tutorial ? t('cozinha.tutorialN', 'Treino {n}/3', { n: lv.tutorial }) : t('cozinha.levelN', 'Fase {n}', { n: lv.n })) : t('cozinha.day', 'Dia {n}', { n: cfg.day });
    const goalEl = hud.querySelector<HTMLElement>('[data-goal]');
    const skipEl = hud.querySelector<HTMLElement>('.cz-skip')!;
    const petsEl = hud.querySelector<HTMLElement>('.cz-pets')!;

    /* ---------- ajudantes: fichas no canto + menu de ordens ---------- */
    const CMD_LABEL: Record<Cmd, () => string> = {
      chop: () => t('cozinha.cmd.chop', 'Cortar'),
      cook: () => t('cozinha.cmd.cook', 'Cozinhar'),
      wash: () => t('cozinha.cmd.wash', 'Lavar'),
      serve: () => t('cozinha.cmd.serve', 'Entregar'),
      fetch: () => t('cozinha.cmd.fetch', 'Buscar ingrediente'),
      fire: () => t('cozinha.cmd.fire', 'Apagar fogo'),
      follow: () => t('cozinha.cmd.follow', 'Seguir'),
      stay: () => t('cozinha.cmd.stay', 'Ficar'),
    };
    const CMD_ICON: Record<Cmd, string> = { chop: 'chop', cook: 'cook', wash: 'wash', serve: 'serve', fetch: 'fetch', fire: 'fire', follow: 'follow', stay: 'stay' };
    const petIconCanvas = (kind: string, size: number): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = c.height = size * 2;
      const x = c.getContext('2d')!;
      x.scale(2, 2);
      drawPetIcon(x, kind, size / 2, size / 2 - size * 0.08, size * 0.36, 0);
      return c;
    };
    const chipState: string[] = [];
    let menuEl: HTMLElement | null = null;
    let menuFor = -1;
    let menuT = 0;
    let petTutOn = false;
    const closeMenu = () => {
      menuEl?.remove();
      menuEl = null;
      menuFor = -1;
      if (rend instanceof Render2D) rend.selected = null;
    };
    const openMenu = (i: number) => {
      closeMenu();
      const b = pets[i];
      if (!b) return;
      menuFor = i;
      menuT = 0;
      if (rend instanceof Render2D) rend.selected = b.p;
      const m = document.createElement('div');
      m.className = 'cz-cmd';
      m.dataset.touchIgnore = '';
      m.innerHTML = `<div class="cz-cmdh">${esc(b.p.name)}: ${t('cozinha.cmd.what', 'o que fazer?')}</div><div class="cz-cmdg">${CMDS.map((c) => `<button class="cz-cmdb${b.available(c) ? '' : ' cz-dim'}" data-c="${c}"><canvas></canvas><span>${esc(CMD_LABEL[c]())}</span></button>`).join('')}<button class="cz-cmdb cz-sm" data-c="${b.idleMode === 'follow' ? 'stay' : 'follow'}"><canvas></canvas><span>${esc(CMD_LABEL[b.idleMode === 'follow' ? 'stay' : 'follow']())}</span></button></div>`;
      m.querySelectorAll<HTMLElement>('[data-c]').forEach((btn) => {
        const c = btn.dataset.c as Cmd;
        const cv2 = btn.querySelector('canvas')!;
        cv2.replaceWith(petIconCanvas(CMD_ICON[c], 30));
        btn.addEventListener('pointerdown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          tap('light');
          const ok = b.command(c);
          if (!ok) {
            banner(b.why === 'tired' ? t('cozinha.cmd.tired', '{n} está cansado: faça você um pouco!', { n: b.p.name }) : t('cozinha.cmd.nothing', 'Nada para {x} agora', { x: CMD_LABEL[c]().toLowerCase() }), '', 1500);
          } else if (petTutOn) {
            petTutOn = false;
            petsEl.classList.remove('cz-teach');
            sv.petTut = true;
            persistCz();
            banner(t('cozinha.cmd.good', 'Isso! Ele obedece com um pouquinho de atraso.'), '', 2200);
          }
          closeMenu();
        });
      });
      hud.appendChild(m);
      menuEl = m;
    };
    pets.forEach((b, i) => {
      const c = document.createElement('button');
      c.className = 'cz-chip';
      const face = document.createElement('canvas');
      face.width = 66;
      face.height = 82;
      face.getContext('2d')!.drawImage(charSprite(b.p.skin, b.p.role, 66), 0, 0);
      face.className = 'cz-chipface';
      c.appendChild(face);
      const st = document.createElement('i');
      c.appendChild(st);
      c.addEventListener('pointerdown', (e) => e.stopPropagation());
      c.addEventListener('click', () => {
        audio.click();
        if (menuFor === i) closeMenu();
        else openMenu(i);
      });
      petsEl.appendChild(c);
      chipState.push('');
    });
    const updateChips = () => {
      for (let i = 0; i < pets.length; i++) {
        const k = pets[i].p.pet || '';
        if (k === chipState[i]) continue;
        chipState[i] = k;
        const slot = petsEl.children[i]?.querySelector('i');
        if (slot) {
          slot.innerHTML = '';
          if (k) slot.appendChild(petIconCanvas(k, 26));
        }
        petsEl.children[i]?.classList.toggle('cz-busy', !!pets[i].task);
      }
    };
    let tipId = '';
    /** objetivo atual: UM por vez, chip pequeno no canto (src/ui/notify) */
    const setTip = (id: string, txt: string) => {
      if (id === tipId) return;
      tipId = id;
      // 3D: a dica é diegética (nota na tela de pedidos); o chip só no 2D
      if (rend.fps && rend.tip) {
        rend.tip(id, txt);
        objective(null);
      } else objective(txt || null, { icon: 'target' });
      skipEl.style.display = txt ? '' : 'none';
    };
    bind(hud, '[data-a=skip]', () => {
      if (tut) {
        sv.tutDone = true;
        persistCz();
        skipTut = true;
        sim.ended = true;
      } else if (petTutOn) {
        petTutOn = false;
        petsEl.classList.remove('cz-teach');
        sv.petTut = true;
        persistCz();
        setTip('', '');
      }
    });
    let skipTut = false;
    if (!tut && pets.length && !sv.petTut) {
      petTutOn = true;
      petsEl.classList.add('cz-teach');
    }

    // tamanho
    const portraitNow = () => window.innerHeight >= window.innerWidth;
    const fit = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      const dpr = Math.min(gov.settings.dprCap, window.devicePixelRatio || 1);
      rend.resize(w, h, dpr, 52, portraitNow() ? 150 : 8);
    };
    fit();
    window.addEventListener('resize', fit);

    // entrada: joystick (metade esquerda) + botões
    const keys = new Set<string>();
    // joystick flutuante compartilhado (src/ui/touch): mesma zona/curva/mola de todos os jogos
    const joyCtl = createJoystick(el, { zoneTop: 0.22, zoneWidth: 0.45 });
    let joyOn = true;
    let actTouch = false;
    let pickPress = false;
    // toque curto (sem arrastar) = tocar num ajudante (2D)
    let tapId = -1;
    let tx0 = 0;
    let ty0 = 0;
    let tT0 = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button,.cz-cmd')) return;
      if (menuEl) closeMenu();
      if (rend.fps) return;
      if (tapId < 0) {
        tapId = e.pointerId;
        tx0 = e.clientX;
        ty0 = e.clientY;
        tT0 = performance.now();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === tapId && Math.hypot(e.clientX - tx0, e.clientY - ty0) > 14) tapId = -1;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === tapId) {
        tapId = -1;
        if (performance.now() - tT0 < 450 && rend instanceof Render2D) {
          const r = el.getBoundingClientRect();
          const p = rend.pickPlayer(e.clientX - r.left, e.clientY - r.top);
          const i = p ? pets.findIndex((b) => b.p === p) : -1;
          if (i >= 0) {
            audio.click();
            openMenu(i);
          }
        }
      }
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const press = (b: HTMLElement, on: boolean) => b.classList.toggle('cz-down', on);
    actBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      actTouch = true;
      press(actBtn, true);
      tap('light');
    });
    const actOff = () => {
      actTouch = false;
      press(actBtn, false);
    };
    actBtn.addEventListener('pointerup', actOff);
    actBtn.addEventListener('pointerleave', actOff);
    actBtn.addEventListener('pointercancel', actOff);
    pickBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pickPress = true;
      press(pickBtn, true);
      tap('light');
    });
    pickBtn.addEventListener('pointerup', () => press(pickBtn, false));
    pickBtn.addEventListener('pointercancel', () => press(pickBtn, false));
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyK') pickPress = true;
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const blur = () => {
      keys.clear();
      actTouch = false;
      joyCtl.reset();
      if (document.visibilityState === 'hidden' || !document.hasFocus()) togglePause(true);
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);

    let paused = false;
    let pauseEl: HTMLElement | null = null;
    const togglePause = (on: boolean) => {
      paused = on && !(net.online && net.humans.length);
      if (on && !pauseEl) {
        pauseEl = document.createElement('div');
        pauseEl.className = 'cz-pause';
        pauseEl.innerHTML = `<div class="cz-title">${t('cozinha.pause', 'Pausado')}</div>
          <button class="cz-btn cz-green cz-big" style="width:240px" data-a="resume">${icon('play', { size: 24 })}${t('cozinha.resume', 'Continuar')}</button>
          <button class="cz-btn cz-big" style="width:240px" data-a="quitday">${t('cozinha.quitDay', 'Encerrar o dia')}</button>
          <button class="cz-btn cz-big" style="width:240px" data-a="exitgame">${icon('home', { size: 22 })}${t('cozinha.exit', 'Sair')}</button>`;
        el.appendChild(pauseEl);
        bind(pauseEl, '[data-a=resume]', () => togglePause(false));
        bind(pauseEl, '[data-a=exitgame]', () => quit());
        bind(pauseEl, '[data-a=quitday]', () => {
          sim.ended = true;
          togglePause(false);
        });
      } else if (!on && pauseEl) {
        pauseEl.remove();
        pauseEl = null;
        paused = false;
      }
    };
    bind(hud, '[data-a=pause]', () => togglePause(!pauseEl));
    pauseHook = () => togglePause(true);
    bind(hud, '[data-a=emote]', () =>
      openEmoteWheel((code) => {
        me.emote = code;
        me.emoteT = 3;
        net.emote(code);
      }),
    );
    setBack(() => togglePause(!pauseEl));

    setNotifyTop(58);
    setNotifyAlign('center');
    cleanup = () => {
      objective(null);
      clearNotify();
      resetNotifyTop();
      setNotifyAlign('left');
      joyCtl.destroy();
      window.removeEventListener('resize', fit);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
      pauseHook = null;
      rend.destroy();
    };

    // contagem
    if (!tut) banner(dayEl.textContent ?? '', lv ? (lv.special !== 'none' ? specialName(lv.special) : '') : sim.theme !== 'classic' ? themeName(sim.theme) : '', 2000);
    let countdown = qs.has('czfast') || tut ? 0 : 1.6;
    let guideT = 0;
    let tutEndT = 0;
    let goalShown = -1;
    let last = performance.now();
    let clockShown = -1;
    let cashShown = -1;
    let actShown = '';
    let endT = 0;
    live = { sim, client, startMs: performance.now(), done: false };
    const fps = { lim: 0 };
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      const q = gov.settings;
      if (q.fpsCap === 30 && ms - fps.lim < 31) return;
      const frameMs = ms - last;
      fps.lim = ms;
      let dt = frameMs / 1000;
      last = ms;
      if (dt > 0.1) dt = 0.1;
      const w0 = performance.now();
      // entrada
      if (joyOn === !!rend.fps) {
        joyOn = !rend.fps;
        joyCtl.setEnabled(joyOn);
      }
      const js = joyOn ? joyCtl.read() : null;
      let mx = js ? js.x : 0;
      let my = js ? js.y : 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1;
      if (hud.classList.contains('cz-fpsmode') !== !!rend.fps) hud.classList.toggle('cz-fpsmode', !!rend.fps);
      if (!qs.has('czauto') && !rend.fps) {
        me.in.mx = mx;
        me.in.my = my;
        me.in.pick = pickPress;
        me.in.act = actTouch || keys.has('KeyJ') || keys.has('KeyE');
      }
      pickPress = false;
      if (!paused) rend.preStep?.(dt);
      if (!paused && countdown <= 0) {
        if (client) net.applyHost(sim, me, others, mkBot, mkHuman);
        else if (net.online) net.applyRemotes(sim, remotes, lastPick);
        for (const b of brains) b.update(dt);
        sim.step(dt);
        net.sendGame(sim, me, cfg, dt);
      } else if (countdown > 0 && !paused) countdown -= dt;
      // efeitos/sons
      sim.drainFx((e) => {
        rend.onFx(e);
        switch (e.t) {
          case FX.Serve:
            audio.cash();
            tap('medium');
            break;
          case FX.Wrong:
          case FX.Expire:
            audio.fail();
            break;
          case FX.Fire:
            audio.hit();
            tap('heavy');
            break;
          case FX.Done:
            audio.coin(2);
            break;
          case FX.Pick:
          case FX.Place:
            audio.tick(e.v ? 2 : 0);
            break;
          case FX.Chop:
            audio.tick(1);
            break;
          case FX.Order:
            audio.click();
            break;
          case FX.Event:
            banner(specialName(sim.special), '', 2200);
            audio.siren(1.6);
            break;
        }
      });
      // guia: treino (seta + dica no topo) ou brilho de dica nas primeiras fases
      guideT -= dt;
      if (guideT <= 0 && !client) {
        guideT = 0.15;
        const g = rend as unknown as { guide?: { st: number; strong: boolean } | null };
        if (tut) {
          const stp = tut.step(me);
          g.guide = stp.st >= 0 ? { st: stp.st, strong: stp.strong } : null;
          setTip(stp.id, stp.txt);
          // destaca só o botão que resolve o passo
          const hold = /chop|wash|spray/.test(stp.id);
          const aim = stp.st >= 0 && (me.target === stp.st || hold);
          actBtn.classList.toggle('cz-glow', aim && hold && !rend.fps);
          pickBtn.classList.toggle('cz-glow', aim && !hold && !rend.fps);
        } else if (lv && lv.n > 0 && lv.n <= 12) {
          const hst = hintTarget(sim, me);
          g.guide = hst >= 0 ? { st: hst, strong: false } : null;
        }
        if (petTutOn && !tut) setTip('pet', t('cozinha.petTip3', 'Toque no ajudante: dê ordens'));
        else if (!tut && tipId === 'pet') setTip('', '');
      }
      if (tut && tut.finished && !sim.ended) {
        tutEndT += dt;
        if (tutEndT > 1.6) sim.ended = true;
      }
      if (pets.length) updateChips();
      if (menuEl) {
        menuT += dt;
        if (menuT > 7) closeMenu();
      }
      if (goalEl) {
        const g = sim.p.goal;
        const st = sim.stars();
        if (st !== goalShown) {
          goalShown = st;
          goalEl.firstElementChild!.innerHTML = starsRow(st, 13);
        }
        const nextG = st >= 3 ? g[2] : g[st];
        const txt = st >= 3 ? '' : '/' + fmt(nextG);
        const sp = goalEl.lastElementChild as HTMLElement;
        if (sp.textContent !== txt) sp.textContent = txt;
      }
      rend.draw(ms / 1000, paused ? 0 : dt, q);
      // HUD barato (só muda texto quando muda)
      const left = Math.max(0, Math.ceil(sim.p.len - sim.time));
      if (left !== clockShown) {
        clockShown = left;
        clockEl.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        clockPill.classList.toggle('cz-hurry', left <= 15);
      }
      if (sim.cash !== cashShown) {
        cashShown = sim.cash;
        cashEl.textContent = fmt(sim.cash);
      }
      const ctxAct = contextAct(sim, me);
      if (ctxAct !== actShown) {
        actShown = ctxAct;
        actLabel.textContent = ctxAct === 'chop' ? t('cozinha.fps.chopIt', 'Cortar') : ctxAct === 'wash' ? t('cozinha.wash', 'Lavar') : ctxAct === 'spray' ? t('cozinha.spray', 'Apagar') : t('cozinha.act', 'Ação');
        actBtn.classList.toggle('cz-off', !ctxAct);
        actBtn.innerHTML = czIcon(ctxAct === 'wash' ? 'plate' : ctxAct === 'spray' ? 'ext' : 'knife', 46) + actLabel.outerHTML;
        pickLabel.textContent = me.hold ? t('cozinha.drop', 'Soltar') : t('cozinha.pick', 'Pegar');
      }
      const pl = me.hold ? t('cozinha.drop', 'Soltar') : t('cozinha.pick', 'Pegar');
      if (pickLabel.textContent !== pl) pickLabel.textContent = pl;
      gov.sample(frameMs, performance.now() - w0);
      if (sim.ended) {
        endT += dt;
        if (endT === dt && !tut) banner(t('cozinha.timeUp', 'Fim do turno!'), '', 1600);
        if (endT > 1.4 || qs.has('czfast') || skipTut) {
          cancelAnimationFrame(raf);
          if (skipTut) {
            live = null;
            sv.lvStars[1] = Math.max(1, sv.lvStars[1] ?? 0);
            sv.lvStars[2] = Math.max(1, sv.lvStars[2] ?? 0);
            sv.lvStars[3] = Math.max(1, sv.lvStars[3] ?? 0);
            persistCz();
            map();
          } else results(sim, lv, !!tut && tut.finished);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __cz?: unknown }).__cz = { sim, me, brains, pets, tut, openMenu, rend };
  }

  function contextAct(sim: Sim, me: Player): '' | 'chop' | 'wash' | 'spray' {
    if (me.hold?.k === IK.Ext) return 'spray';
    if (me.hold) return '';
    if (me.target < 0) return '';
    const s = sim.st[me.target];
    if (s.k === 'board' && s.item && sim.nextProc(s.item) === 'chop') return 'chop';
    if (s.k === 'sink' && s.n > 0) return 'wash';
    return '';
  }

  /* ======================= 5) resultado ======================= */
  /** turno em andamento (para creditar uma única vez, mesmo saindo no meio) */
  let live: { sim: Sim; client: boolean; startMs: number; done: boolean } | null = null;
  interface Settled {
    stars: number;
    w: number;
    net$: number;
    coins: number;
    rec: boolean;
  }
  /** credita moedas/caixa e chama reportRun UMA vez. partial = saiu no meio do dia (não avança o dia). */
  function settle(partial: boolean): Settled | null {
    if (!live || live.done) return null;
    live.done = true;
    const { sim, client } = live;
    const lv = sim.lv;
    const dur = (performance.now() - live.startMs) / 1000;
    const stars = partial ? 0 : sim.stars();
    const helpers = lv ? 0 : sim.players.filter((p) => p.bot && !p.remote).length; // na campanha os ajudantes são de graça
    const w = client ? 0 : Math.min(partial ? Math.round(wage(helpers) * Math.min(1, sim.time / sim.p.len)) : wage(helpers), Math.floor(sim.cash * 0.4));
    const net$ = Math.max(0, sim.cash - w);
    let coins = partial ? Math.round(sim.cash / 8) : Math.max(3, Math.round(sim.cash / 8) + stars * 5);
    let rec = false;
    if (lv && !partial) {
      if (lv.n > 0) {
        const prev = sv.lvStars[lv.n] ?? 0;
        rec = stars > prev || sim.cash > (sv.lvBest[lv.n] ?? 0);
        if (!client) {
          sv.lvStars[lv.n] = Math.max(prev, stars);
          sv.lvBest[lv.n] = Math.max(sv.lvBest[lv.n] ?? 0, sim.cash);
          if (lv.n >= 3 && stars > 0) sv.tutDone = true;
        }
      } else {
        // desafio do dia
        const today = dayKey();
        if (sv.daily.key !== today) sv.daily = { ...sv.daily, key: today, best: 0, stars: 0 };
        rec = sim.cash > sv.daily.best;
        const first = sv.daily.stars === 0 && stars > 0;
        sv.daily.best = Math.max(sv.daily.best, sim.cash);
        sv.daily.stars = Math.max(sv.daily.stars, stars);
        if (first) {
          const y = new Date();
          y.setDate(y.getDate() - 1);
          sv.daily.streak = sv.daily.last === dayKey(y) ? sv.daily.streak + 1 : 1;
          sv.daily.last = today;
          coins += 20 + Math.min(10, sv.daily.streak) * 5; // bônus do dia (1x)
        }
      }
    } else rec = !partial && (sim.day > sv.bestDay || net$ > sv.bestCash);
    if (!client) {
      sv.cash += net$;
      if (!partial && !lv) {
        sv.stars[sim.day] = Math.max(sv.stars[sim.day] ?? 0, stars);
        sv.day = sim.day + 1; // infinito: sempre avança
      }
    }
    if (!partial) {
      sv.days++;
      if (!lv) sv.bestDay = Math.max(sv.bestDay, sim.day);
    }
    sv.dishes += sim.served;
    if (!lv) sv.bestCash = Math.max(sv.bestCash, net$);
    persistCz();
    if (coins > 0) addCoins(coins);
    reportRun({ game: 'cozinha', score: sim.cash, coins, durationSec: Math.round(dur), won: stars > 0, stats: { dishes: sim.served, days: partial ? 0 : 1, stars, fires: sim.fires, level: lv ? lv.n : 0 } });
    return { stars, w, net$, coins, rec };
  }

  function results(sim: Sim, lv: Level | null = null, tutDone = false): void {
    const r = settle(false);
    clear();
    if (!r) return lv ? map() : lobby();
    const { stars, w, net$, coins, rec } = r;
    if (lv && lv.tutorial) {
      // treino: segue direto para o próximo passo (sem tela de números)
      if (tutDone && lv.tutorial < 3) {
        banner(t('cozinha.tutNext', 'Muito bem! Próximo treino...'), '', 1600);
        return playLevel(level(lv.n + 1));
      }
      if (tutDone) {
        sv.tutDone = true;
        persistCz();
      }
    }
    if (lv) return levelResults(sim, lv, r);
    const d = ov(true);
    const starHtml = [0, 1, 2].map((i) => `<span style="animation-delay:${0.2 + i * 0.25}s;${i < stars ? '' : 'filter:grayscale(1) brightness(.6)'}">${icon('star', { size: 54 })}</span>`).join('');
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.results', 'Fim do dia {n}', { n: sim.day })}</div>
      <div class="cz-stars">${starHtml}</div>
      ${rec ? `<div class="cz-sub" style="color:#ffe14a;font-weight:700">${t('cozinha.record', 'Novo recorde!')}</div>` : ''}
      <div class="cz-card">
        <div class="cz-stat"><span>${t('cozinha.served', 'Pratos servidos')}</span><b>${sim.served}</b></div>
        <div class="cz-stat"><span>${t('cozinha.tips', 'Gorjetas')}</span><b>${fmt(sim.tips)}</b></div>
        <div class="cz-stat"><span>${t('cozinha.missed', 'Clientes que foram embora')}</span><b>${sim.missed}</b></div>
        <div class="cz-stat"><span>${t('cozinha.fires', 'Incêndios')}</span><b>${sim.fires}</b></div>
        ${w ? `<div class="cz-stat"><span>${t('cozinha.wages', 'Salários')}</span><b>-${fmt(w)}</b></div>` : ''}
        <div class="cz-stat"><span>${t('cozinha.earned', 'Caixa do dia')}</span><b>${icon('coin', { size: 18 })}${fmt(net$)}</b></div>
        <div class="cz-stat"><span>${t('cozinha.coins', 'Moedas ganhas')}</span><b>${icon('coins', { size: 18 })}${fmt(coins)}</b></div>
        ${rewardedAvailable() ? `<button class="cz-btn cz-pink" data-a="ad">${icon('video', { size: 22 })}${t('cozinha.double', 'Dobrar moedas com vídeo')}</button>` : ''}
        <button class="cz-btn cz-green cz-big" data-a="next">${icon('play', { size: 24 })}${t('cozinha.next', 'Próximo dia')}</button>
        <button class="cz-btn cz-gold" data-a="shop">${czIcon('cart', 22)}${t('cozinha.shop', 'Melhorias')}</button>
      </div>`;
    audio.record();
    bind(d, '[data-a=ad]', async (b) => {
      b.setAttribute('disabled', '');
      if (await showRewarded()) {
        addCoins(coins);
        audio.cash();
        b.innerHTML = icon('check', { size: 22 }) + '+' + fmt(coins);
      } else b.removeAttribute('disabled');
    });
    bind(d, '[data-a=next]', () => lobby());
    bind(d, '[data-a=shop]', () => shop('up'));
    setBack(() => lobby());
  }

  function levelResults(sim: Sim, lv: Level, r: Settled): void {
    const { stars, coins, rec } = r;
    const d = ov(true);
    const starHtml = [0, 1, 2].map((i) => `<span style="animation-delay:${0.2 + i * 0.25}s;${i < stars ? '' : 'filter:grayscale(1) brightness(.6)'}">${icon('star', { size: 50 })}</span>`).join('');
    const g = sim.p.goal;
    const daily = lv.n === 0;
    const hasNext = !daily && lv.n < LEVEL_COUNT && levelOpen(lv.n + 1, sv.lvStars);
    const share = Math.round(sim.botShare * 100);
    const unlockedEndless = lv.n === ENDLESS_AT && stars > 0;
    d.innerHTML = `
      <div class="cz-title">${daily ? t('cozinha.daily', 'Desafio do dia') : stars ? t('cozinha.lvClear', 'Fase {n} completa!', { n: lv.n }) : t('cozinha.lvFail', 'Quase! Fase {n}', { n: lv.n })}</div>
      <div class="cz-stars">${starHtml}</div>
      ${rec ? `<div class="cz-sub" style="color:#ffe14a;font-weight:700">${t('cozinha.record', 'Novo recorde!')}</div>` : ''}
      <div class="cz-card">
        <div class="cz-stat"><span>${t('cozinha.score', 'Pontos (caixa)')}</span><b>${icon('coin', { size: 18 })}${fmt(sim.cash)}</b></div>
        <div class="cz-goals">${[0, 1, 2].map((i) => `<span class="${sim.cash >= g[i] ? 'on' : ''}">${litStars(i + 1, 11)} ${fmt(g[i])}</span>`).join('')}</div>
        <div class="cz-stat"><span>${t('cozinha.served', 'Pratos servidos')}</span><b>${sim.served}</b></div>
        <div class="cz-stat"><span>${t('cozinha.missed', 'Clientes que foram embora')}</span><b>${sim.missed}</b></div>
        ${sim.workBot ? `<div class="cz-stat"><span>${t('cozinha.youDid', 'Feito por você')}</span><b>${100 - share}%</b></div>` : ''}
        <div class="cz-stat"><span>${t('cozinha.coins', 'Moedas ganhas')}</span><b>${icon('coins', { size: 18 })}${fmt(coins)}</b></div>
        ${unlockedEndless ? `<div class="cz-newrow">${t('cozinha.endlessUnlocked', 'Modo sem fim liberado!')}</div>` : ''}
        ${daily ? `<div class="cz-note">${t('cozinha.dailyBest', 'Melhor de hoje: {n}', { n: fmt(sv.daily.best) })} · ${t('cozinha.dailyAgain', 'Um novo desafio amanhã!')}</div>` : ''}
        ${!stars && !daily ? `<div class="cz-note">${t('cozinha.lvHint', 'Dica: segure o prato pronto e entregue rápido; peça ajuda aos ajudantes nas tarefas chatas.')}</div>` : ''}
        ${rewardedAvailable() && coins > 0 ? `<button class="cz-btn cz-pink" data-a="ad">${icon('video', { size: 22 })}${t('cozinha.double', 'Dobrar moedas com vídeo')}</button>` : ''}
        ${hasNext ? `<button class="cz-btn cz-green cz-big" data-a="next">${icon('play', { size: 24 })}${t('cozinha.nextLv', 'Próxima fase')}</button>` : ''}
        <div class="cz-row">
          <button class="cz-btn cz-grow${hasNext ? '' : ' cz-green'}" data-a="again">${icon('refresh', { size: 20 })}${t('cozinha.again', 'Jogar de novo')}</button>
          <button class="cz-btn cz-grow" data-a="map">${icon('star', { size: 20 })}${t('cozinha.map', 'Mapa')}</button>
        </div>
      </div>`;
    if (stars) audio.record();
    else audio.fail();
    bind(d, '[data-a=ad]', async (b) => {
      b.setAttribute('disabled', '');
      if (await showRewarded()) {
        addCoins(coins);
        audio.cash();
        b.innerHTML = icon('check', { size: 22 }) + '+' + fmt(coins);
      } else b.removeAttribute('disabled');
    });
    bind(d, '[data-a=next]', () => levelSheet(level(lv.n + 1)));
    bind(d, '[data-a=again]', () => playLevel(daily ? dailyLevel() : level(lv.n)));
    bind(d, '[data-a=map]', () => map());
    setBack(() => map());
  }

  function quit(): void {
    handle.destroy();
    exit();
  }

  const handle: MiniGameHandle = {
    destroy() {
      if (dead) return;
      settle(true); // saiu no meio do turno: credita o que ganhou (uma vez só)
      dead = true;
      clear();
      setBack(null);
      net.leave();
      el.remove();
    },
    pause() {
      pauseHook?.();
    },
    resume() {
      /* a tela atual recomeça no próximo toque; o turno fica pausado */
    },
  };

  // atalhos de depuração/screenshots: ?czmode=2d|3d&czday=N&czscreen=shop|results|lobby
  const fm = qs.get('czmode');
  const fd = Number(qs.get('czday') ?? 0);
  if (fd > 0) {
    sv.day = fd;
    sv.packs = PACKS.map((_, i) => i).filter((i) => PACKS[i].minDay <= fd);
    if (qs.has('czrich')) sv.cash = Math.max(sv.cash, 5000);
  }
  if (fm === '2d' || fm === '3d') {
    mode = fm;
    const scr = qs.get('czscreen');
    const flv = Number(qs.get('czlv') ?? 0);
    if (scr === 'shop') shop((qs.get('cztab') as 'up' | 'rec' | 'staff') ?? 'up');
    else if (scr === 'lobby') lobby();
    else if (scr === 'map') map();
    else if (flv > 0) playLevel(level(flv));
    else if (flv < 0) playLevel(dailyLevel());
    else {
      hostGo++;
      void startDay(hostCfg(), false);
    }
  } else chooser();
  return handle;
}

const BOT_SKINS = ['mint', 'sunny', 'capy', 'ocean', 'kitty'];
