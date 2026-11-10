/**
 * HUB "Bloop World" — casca do menu principal.
 *
 *  - Carrossel de jogos (setas, swipe, teclado, pontinhos), com re-tema do menu
 *    inteiro a partir de MiniGameDef.theme (variáveis CSS animadas via @property).
 *  - Barra superior global (foto de perfil, nome, moedas, gemas, ajustes).
 *  - Barra inferior global montada a partir de listPanels() (navOrder).
 *  - "Game host": contêiner de tela cheia onde os minigames rodam (launch(root, exit)).
 *
 * Tudo vive dentro de <section id="menu"> (index.html), então qualquer tela que
 * esconde o menu (partida do Orbit, Corrida) esconde o hub junto.
 */
import { lockOrientation, restorePortrait } from '../core/orientation';
import './hub.css';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { save } from '../core/storage';
import { t } from '../i18n';
import { applyI18n } from '../i18n/langs';
import { hideBanner, showBanner } from '../services/ads';
import { displayName } from '../services/leaderboard';
import { renderSkinPreview } from '../game/preview';
import { skinById } from '../game/skins';
import { icon, iconDataUri, type IconName } from '../ui/icons';
import { bestLabel } from './bests';
import { listGames, listPanels, type HubTheme, type MiniGameDef, type MiniGameHandle } from './registry';

/* ============================== tipos públicos ============================== */

/** Desenha a foto de perfil (círculo) no canvas dado. Bichinhos/social podem trocar. */
export type ProfileRenderer = (canvas: HTMLCanvasElement, sizeCss: number) => void;

export interface HubOptions {
  /** nível de qualidade atual (0..3) — vitrine roda a 30 fps no nível 0 */
  getTier(): number;
  /** liga/desliga o loop de render do Orbit (canvas #game) */
  setOrbitActive(on: boolean): void;
}

/* ============================== estado ============================== */

const LAST_KEY = 'bw-hub-game';
const SOON_ID = '__soon';
const inlineGames = new Set<string>();
const extras = new Map<string, HTMLElement>();

let opts: HubOptions;
let menu: HTMLElement;
let track: HTMLElement;
let stage: HTMLElement;
let dots: HTMLElement;
let nav: HTMLElement;
let host: HTMLElement;
let hostRoot: HTMLElement;
let hostConfirm: HTMLElement;

let cards: CardView[] = [];
let idx = 0;
let hostActive = false;
let hostDef: MiniGameDef | null = null;
let handle: MiniGameHandle | null = null;
let launching = false;

let profileRenderer: ProfileRenderer = defaultProfile;
let profileClick: () => void = () => (document.querySelector('#menu [data-open="settings"]') as HTMLElement | null)?.click();

interface CardView {
  def: MiniGameDef;
  el: HTMLElement;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  w: number;
  h: number;
  /** já desenhou ao menos um quadro (cartas laterais ficam paradas) */
  drawn: boolean;
}

/* ============================== API pública ============================== */

/** Troca quem desenha a foto de perfil (ex.: bichinho escolhido). */
export function setProfileRenderer(fn: ProfileRenderer): void {
  profileRenderer = fn;
  refreshProfile();
}
/** Troca a ação ao tocar na foto de perfil (padrão: abre Ajustes). */
export function setProfileClick(fn: () => void): void {
  profileClick = fn;
}
/** Redesenha foto + nome (chame quando o perfil mudar). Também ouvido em bus 'profile'. */
export function refreshProfile(): void {
  const cv = document.getElementById('hub-ava') as HTMLCanvasElement | null;
  if (cv) {
    try {
      profileRenderer(cv, 44);
    } catch {
      /* renderer externo com erro: mantém o anterior */
    }
  }
  const nm = document.getElementById('hub-name');
  if (nm) nm.textContent = displayName() || t('hub.player', 'Jogador');
}

/**
 * Jogo "embutido": o próprio jogo cuida das telas (não usa o game host).
 * Usado pelo Bloop Orbit, que reaproveita o HUD/pausa/fim de jogo existentes.
 */
export function markInlineGame(id: string): void {
  inlineGames.add(id);
}

/** Conteúdo extra mostrado dentro da carta do jogo quando ela está ativa (turbos, Corrida...). */
export function setGameExtras(id: string, el: HTMLElement): void {
  extras.set(id, el);
  const c = cards.find((x) => x.def.id === id);
  if (c && cards[idx] === c) mountExtras();
}

export function selectedGame(): MiniGameDef | null {
  const d = cards[idx]?.def;
  return d && d.id !== SOON_ID ? d : null;
}

export function isHostActive(): boolean {
  return hostActive;
}

/** O hub está visível (menu ligado e sem minigame aberto). */
export function hubVisible(): boolean {
  return !!menu && menu.classList.contains('on') && !hostActive;
}

/** Hub visível e livre (sem painel/modal por cima) — hora boa para pop-ups automáticos. */
export function hubIdle(): boolean {
  return hubVisible() && !document.querySelector(COVER_SEL + ', .ob-root, .beta-sheet-bg');
}

/** Painéis/telas que cobrem o hub: com um deles aberto a vitrine e as animações do fundo param. */
const COVER_SEL = '.mr-root, .modal-screen.on, .sc-overlay, .crc-overlay, .pass-panel, .pa-overlay, .pet-scr.on, .hm-scr.on, .rk-screen.on, .cr-root.on, #creator.on, .rank.on, .celebrate, .item-sheet, .h3';

/** Inicia o jogo selecionado (botão JOGAR / Espaço). */
export function playSelected(): void {
  const d = selectedGame();
  if (d) void launchGame(d);
}

/** Abre um minigame em tela cheia. */
export async function launchGame(def: MiniGameDef): Promise<void> {
  if (launching || hostActive) return;
  audio.unlock();
  haptics.tap('medium');
  remember(def.id);
  if (inlineGames.has(def.id)) {
    await def.launch(host, () => {});
    return;
  }
  launching = true;
  hostActive = true;
  hostDef = def;
  hideBanner();
  menu.classList.remove('on');
  host.classList.add('on');
  host.style.setProperty('--gh-accent', def.theme.accent);
  // O jogo entra na tela JÁ (alguns mostram uma escolha antes de terminar de abrir, ex.: 2D/3D);
  // o carregamento fica por cima só até o jogo desenhar algo, com botão de voltar depois de 4 s.
  const root = document.createElement('div');
  root.className = 'gh-game';
  const loader = document.createElement('div');
  loader.className = 'gh-loading';
  loader.innerHTML = `<i></i><i></i><i></i><button class="gh-load-back" hidden>${t('hub.loadBack', 'Voltar')}</button>`;
  hostRoot.innerHTML = '';
  hostRoot.append(root, loader);
  // orientação previsível: jogos 2D em pé; quando um jogo mostra uma cena 3D (canvas do three.js),
  // a tela trava deitada sozinha (ver watch3d). Nada gira no meio da partida.
  watch3d(root);

  const hideLoader = () => loader.remove();
  const mo = new MutationObserver(() => {
    if (root.childElementCount) hideLoader();
  });
  mo.observe(root, { childList: true, subtree: true });
  const backTimer = window.setTimeout(() => {
    const b = loader.querySelector<HTMLButtonElement>('.gh-load-back');
    if (b) {
      b.hidden = false;
      b.onclick = () => closeHost();
    }
  }, 4000);
  syncOrbit();
  try {
    const h = await def.launch(root, () => closeHost());
    if (!hostActive || hostDef !== def) {
      h?.destroy();
      return;
    }
    handle = h;
    hideLoader();
  } catch (e) {
    console.warn('[hub] falha ao abrir', def.id, e);
    closeHost();
    toast(t('hub.launchFail', 'Não deu para abrir o jogo agora'));
  } finally {
    if (hostDef === def || !hostActive) launching = false;
    mo.disconnect();
    clearTimeout(backTimer);
  }
}

/** Fecha o minigame aberto e volta para o hub. */
export function closeHost(): void {
  // sair antes do jogo terminar de abrir (ex.: "Sair" na escolha 2D/3D) não pode travar o JOGAR
  launching = false;
  unwatch3d();
  if (!hostActive) return;
  hideConfirm();
  const h = handle;
  handle = null;
  hostActive = false;
  hostDef = null;
  try {
    h?.destroy();
  } catch (e) {
    console.warn('[hub] destroy', e);
  }
  hostRoot.innerHTML = '';
  restorePortrait();
  host.classList.remove('on');
  menu.classList.add('on');
  refreshBests();
  showBanner();
  onShow();
  kickFrame();
}

/**
 * Botão voltar (Android/Escape). true = tratado pelo hub.
 * Com minigame aberto: pausa e pergunta se quer sair.
 */
export function hubBack(): boolean {
  if (!hostActive) return false;
  if (hostConfirm.classList.contains('on')) {
    hideConfirm();
    handle?.resume?.();
    return true;
  }
  handle?.pause?.();
  hostConfirm.classList.add('on');
  return true;
}

/** App foi para segundo plano: pausa o minigame aberto. */
export function hubPause(): void {
  if (!hostActive) return;
  handle?.pause?.();
  // ao voltar o jogador vê "Pausado — Continuar / Sair" em vez de uma tela congelada
  if (handle) hostConfirm.classList.add('on');
}

/* ============================== init ============================== */

export function initHub(o: HubOptions): void {
  bindGlGuard();
  opts = o;
  menu = document.getElementById('menu')!;
  track = document.getElementById('hub-track')!;
  stage = document.getElementById('hub-stage')!;
  dots = document.getElementById('hub-dots')!;
  nav = document.getElementById('hub-nav')!;
  buildHost();
  document.title = 'Bloop World';

  (stage.querySelector('.hub-arrow.prev') as HTMLElement).onclick = () => go(idx - 1);
  (stage.querySelector('.hub-arrow.next') as HTMLElement).onclick = () => go(idx + 1);
  (document.getElementById('hub-profile') as HTMLElement).onclick = () => profileClick();
  bindSwipe();
  window.addEventListener('keydown', (e) => {
    if (!hubVisible() || document.querySelector('.modal-screen.on')) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (e.code === 'ArrowLeft') go(idx - 1);
    if (e.code === 'ArrowRight') go(idx + 1);
  });

  // orbit: canvas só roda quando o menu está escondido (partida/corrida) e sem minigame
  new MutationObserver(() => {
    syncOrbit();
    kickFrame();
  }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', kickFrame);
  syncOrbit();

  let regT = 0;
  bus.on('hub-registry', () => {
    clearTimeout(regT);
    regT = window.setTimeout(() => {
      buildCards();
      buildNav();
      refreshBests();
    }, 0);
  });
  bus.on('lang', () => {
    applyI18n(document);
    buildCards();
    refreshBests();
    buildNav();
    refreshProfile();
  });
  bus.on('hub-show', onShow);
  bus.on('quality', () => setTimeout(syncFxClass, 0));
  syncFxClass();
  bus.on('run-end', () => setTimeout(refreshBests, 0));
  bus.on('player', refreshProfile);
  bus.on('profile', refreshProfile);
  bus.on('cosmetics', refreshProfile);
  bus.on('wallet', refreshNavBadges);
  window.addEventListener('resize', () => layout(false));

  buildCards();
  buildNav();
  refreshBests();
  refreshProfile();
  kickFrame();
}

function onShow(): void {
  syncFxClass();
  refreshProfile();
  refreshBests();
  refreshNavBadges();
  layout(false);
}

/**
 * Classes de qualidade do hub:
 *  - hub-qmin (Mínimo): congela as animações decorativas (blobs gigantes custam composição);
 *  - hub-lowfx (Baixo/Mínimo): sem backdrop-filter, blobs parados, brilhos animados desligados;
 *  - hub-qhi (Alto): degradê mítico desliza liso; abaixo disso ele anda em passos (8 repinturas/s).
 */
function syncFxClass(): void {
  if (!opts) return;
  const tier = opts.getTier();
  document.body.classList.toggle('hub-qmin', tier === 0);
  document.body.classList.toggle('hub-lowfx', tier <= 1);
  document.body.classList.toggle('hub-qhi', tier >= 3);
}

function syncOrbit(): void {
  if (!opts) return;
  const on = !menu.classList.contains('on') && !hostActive;
  opts.setOrbitActive(on);
  document.body.classList.toggle('orbit-off', !on);
}

/* ============================== cartas ============================== */

function soonDef(): MiniGameDef {
  return {
    id: SOON_ID,
    name: t('hub.soon', 'Em breve'),
    tagline: t('hub.soonTag', 'Novos jogos chegando no Bloop World!'),
    icon: 'sparkle',
    theme: { bg: ['#3a1a7a', '#120838'], accent: '#8a5cff', accent2: '#ffcf2e', title: ['#ffffff', '#c9b2ff'] },
    launch: async () => ({ destroy() {} }),
  };
}

/** recorde pessoal em cada card (gancho de "quero bater meu recorde") */
export function refreshBests(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.hub-card[data-game]')) {
    const b = el.querySelector<HTMLElement>('.hc-best');
    if (!b) continue;
    const txt = bestLabel(el.dataset.game || '');
    b.innerHTML = txt ? `${icon('trophy', { size: 16 })}<span>${esc(txt)}</span>` : '';
    b.classList.toggle('on', !!txt);
  }
}

function buildCards(): void {
  const prevId = readLast();
  const defs: MiniGameDef[] = [...listGames()];
  if (defs.length < 2) defs.push(soonDef());
  // move a área de extras para fora antes de recriar as cartas
  extras.forEach((el) => park().appendChild(el));
  track.innerHTML = '';
  dots.innerHTML = '';
  cards = defs.map((def, i) => {
    const el = document.createElement('article');
    const soon = def.id === SOON_ID;
    el.className = `hub-card${soon ? ' soon' : ''}`;
    el.dataset.game = def.id;
    applyTheme(el, def.theme, '--c-');
    el.innerHTML = `
      <div class="hc-show">
        <canvas></canvas>
        <span class="hc-ico">${icon(def.icon, { size: 30 })}</span>
        ${def.online ? `<span class="hc-online"><i></i>${esc(t('hub.online', 'Online'))}</span>` : ''}
      </div>
      <div class="hc-body">
        <h2 class="hc-title">${esc(def.name)}</h2>
        <p class="hc-tag">${esc(def.tagline)}</p>
        <p class="hc-best"></p>
        <div class="hc-extras"></div>
        ${
          soon
            ? `<div class="hc-soon">${icon('lock', { size: 26 })}<span>${esc(t('hub.soonBtn', 'Aguarde novidades'))}</span></div>`
            : `<button class="btn hub-play"><span>${esc(t('hub.play', 'JOGAR'))}</span>${icon('play', { size: 34 })}</button>`
        }
      </div>`;
    el.addEventListener('click', (e) => {
      if (i !== idx) {
        e.stopPropagation();
        go(i);
        return;
      }
      if ((e.target as HTMLElement).closest('.hub-play')) void launchGame(def);
    });
    track.appendChild(el);
    const d = document.createElement('button');
    d.className = 'hub-dot';
    d.setAttribute('aria-label', def.name);
    d.onclick = () => go(i);
    dots.appendChild(d);
    const cv = el.querySelector('canvas')!;
    return { def, el, cv, ctx: cv.getContext('2d'), w: 0, h: 0, drawn: false };
  });
  const found = cards.findIndex((c) => c.def.id === prevId);
  idx = found >= 0 ? found : 0;
  stage.classList.toggle('single', cards.length < 2);
  select(idx, true);
}

function go(i: number): void {
  if (!cards.length) return;
  const n = (i + cards.length) % cards.length;
  if (n === idx) return layout(true);
  audio.click();
  haptics.tap('light');
  select(n, false);
}

function select(i: number, instant: boolean): void {
  idx = i;
  const c = cards[i];
  cards.forEach((k, j) => {
    k.el.classList.toggle('active', j === i);
    k.el.classList.toggle('near', Math.abs(j - i) === 1);
    (dots.children[j] as HTMLElement)?.classList.toggle('on', j === i);
  });
  applyTheme(menu, c.def.theme, '--hub-');
  if (!instant && c.def.id !== SOON_ID) remember(c.def.id);
  mountExtras();
  menu.dataset.game = c.def.id;
  bus.emit('hub-select', c.def.id);
  layout(!instant);
}

/** extras de cartas inativas ficam aqui (no DOM, escondidos) para os ids continuarem achaveis */
let parkEl: HTMLElement | null = null;
function park(): HTMLElement {
  if (!parkEl) {
    parkEl = document.createElement('div');
    parkEl.hidden = true;
    parkEl.className = 'hub-park';
    (menu ?? document.body).appendChild(parkEl);
  }
  return parkEl;
}

function mountExtras(): void {
  const c = cards[idx];
  if (!c) return;
  const slot = c.el.querySelector('.hc-extras') as HTMLElement;
  extras.forEach((el, id) => {
    if (id === c.def.id) slot.appendChild(el);
    else park().appendChild(el);
  });
  c.el.classList.toggle('has-extras', extras.has(c.def.id));
}

function layout(animate: boolean): void {
  const c = cards[idx];
  if (!c) return;
  const vw = track.parentElement!.clientWidth;
  const cw = c.el.offsetWidth;
  if (!vw || !cw) return;
  const gap = 14;
  const x = (vw - cw) / 2 - idx * (cw + gap);
  // leituras antes das escritas (sem layout forçado em sequência)
  const boxes = cards.map((k, j) => (Math.abs(j - idx) <= 1 ? readBox(k) : null));
  if (animate) setMoving(true);
  track.classList.toggle('instant', !animate);
  track.style.transform = `translate3d(${x}px,0,0)`;
  stage.style.setProperty('--cw', `${cw}px`);
  baseX = x;
  // só a carta ativa e as vizinhas têm canvas no tamanho real (as outras nem aparecem na tela)
  cards.forEach((k, j) => {
    const b = boxes[j];
    if (b) sizeCanvas(k, b[0], b[1]);
  });
}

/** will-change só enquanto o trilho se move (arrasto/transição) — camada grande sem custo parado. */
let moveT = 0;
function setMoving(on: boolean): void {
  clearTimeout(moveT);
  if (on) {
    track.classList.add('moving');
    moveT = window.setTimeout(() => track.classList.remove('moving'), 450);
  } else track.classList.remove('moving');
}

function applyTheme(el: HTMLElement, th: HubTheme, p: string): void {
  const s = el.style;
  s.setProperty(`${p}bg1`, th.bg[0]);
  s.setProperty(`${p}bg2`, th.bg[1]);
  s.setProperty(`${p}accent`, th.accent);
  s.setProperty(`${p}accent2`, th.accent2);
  s.setProperty(`${p}title1`, th.title[0]);
  s.setProperty(`${p}title2`, th.title[1]);
}

/* ---------------- swipe ---------------- */

let baseX = 0;
/** arrastando o carrossel agora: a vitrine não redesenha (o quadro todo fica para o compositor) */
let dragActive = false;
let dragRaf = 0;
function bindSwipe(): void {
  const vp = track.parentElement!;
  let sx = 0;
  let sy = 0;
  let st = 0;
  let tracking = false;
  let dragging = false;
  let pid = -1;
  let dx = 0;
  let swallow = false;
  vp.addEventListener('pointerdown', (e) => {
    if (cards.length < 2) return;
    tracking = true;
    dragging = false;
    sx = e.clientX;
    sy = e.clientY;
    st = performance.now();
    pid = e.pointerId;
    dx = 0;
    // prepara a camada do trilho já no toque (o arrasto começa sem re-rasterizar)
    clearTimeout(moveT);
    track.classList.add('moving');
  });
  vp.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== pid) return;
    dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!dragging) {
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        dragging = true;
        try {
          vp.setPointerCapture(pid);
        } catch {
          /* */
        }
        track.classList.add('instant');
        clearTimeout(moveT);
        track.classList.add('moving');
        dragActive = true;
      } else if (Math.abs(dy) > 14) tracking = false;
      return;
    }
    // um write de transform por quadro, nada mais (sem layout nem redesenho durante o arrasto)
    if (!dragRaf)
      dragRaf = requestAnimationFrame(() => {
        dragRaf = 0;
        if (dragActive) track.style.transform = `translate3d(${baseX + dx}px,0,0)`;
      });
  });
  const end = (e: PointerEvent) => {
    if (!tracking || e.pointerId !== pid) return;
    tracking = false;
    if (!dragging) {
      setMoving(true); // solta a camada daqui a pouco
      // toque simples na vitrine (canvas) → emote/dança do Bloop (Passe Musical)
      if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') bus.emit('showcase-tap', cards[idx]?.def.id);
      return;
    }
    dragging = false;
    dragActive = false;
    if (dragRaf) cancelAnimationFrame(dragRaf);
    dragRaf = 0;
    swallow = true;
    setTimeout(() => (swallow = false), 0);
    const v = dx / Math.max(1, performance.now() - st);
    const w = cards[idx].el.offsetWidth;
    if (dx < -w * 0.18 || v < -0.45) go(idx + 1);
    else if (dx > w * 0.18 || v > 0.45) go(idx - 1);
    else layout(true);
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  // depois de arrastar, o "click" não deve abrir nada
  vp.addEventListener(
    'click',
    (e) => {
      if (swallow) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}

/* ============================== vitrine animada ============================== */

let last = 0;
let acc = 0;
let covered = false;
let coverT = 0;

function readBox(c: CardView): [number, number] {
  const box = c.cv.parentElement!;
  return [Math.max(1, box.clientWidth), Math.max(1, box.clientHeight)];
}

function sizeCanvas(c: CardView, w: number, h: number): void {
  if (w === c.w && h === c.h) return;
  const tier = opts.getTier();
  // teto de resolução por nível (a vitrine é decorativa: 1,25–1,5x já fica nítida no celular)
  const dpr = Math.min(window.devicePixelRatio || 1, tier >= 3 ? 2 : tier >= 2 ? 1.5 : tier >= 1 ? 1.25 : 1);
  c.cv.width = Math.round(w * dpr);
  c.cv.height = Math.round(h * dpr);
  c.w = w;
  c.h = h;
  c.drawn = false;
  c.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let rafId = 0;
/** (re)liga o loop da vitrine — ele dorme sozinho quando o hub some (minigame/partida/2º plano). */
function kickFrame(): void {
  if (rafId || coverT) return;
  rafId = requestAnimationFrame(frame);
}

/** Algum painel/tela cobre o hub? Atualiza a classe que pausa as animações CSS do fundo. */
function checkCovered(): boolean {
  const c = !!document.querySelector(COVER_SEL);
  if (c !== covered) {
    covered = c;
    document.body.classList.toggle('hub-covered', c);
  }
  return c;
}

/** Quadros por segundo da vitrine: Alto 60, Médio/Baixo 30, Mínimo 24. */
function showcaseStep(): number {
  const tier = opts.getTier();
  return tier >= 3 ? 0 : tier >= 1 ? 1 / 31 : 1 / 25;
}

let lastCheck = 0;
function frame(now: number): void {
  rafId = 0;
  if (!hubVisible() || document.hidden) {
    last = 0;
    if (covered) {
      covered = false;
      document.body.classList.remove('hub-covered');
    }
    return;
  }
  // coberto por painel: a vitrine dorme de vez (nada de rAF); confere de novo a cada 300 ms
  if (now - lastCheck > 250 || covered) {
    lastCheck = now;
    if (checkCovered()) {
      last = 0;
      coverT = window.setTimeout(() => {
        coverT = 0;
        kickFrame();
      }, 300);
      return;
    }
  }
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  // durante o arrasto do carrossel o quadro é só do compositor
  if (dragActive) return;
  acc += dt;
  if (acc < showcaseStep()) return;
  acc = 0;
  const ts = now / 1000;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const active = i === idx;
    // cartas vizinhas: um quadro só (sem custo contínuo); as distantes nem são desenhadas
    if (!active && (c.drawn || Math.abs(i - idx) > 1)) continue;
    if (!c.ctx || !c.w) continue;
    drawCard(c, active ? ts : 1.3);
    c.drawn = true;
  }
}

function drawCard(c: CardView, ts: number): void {
  const x = c.ctx!;
  x.clearRect(0, 0, c.w, c.h);
  try {
    if (c.def.drawShowcase) c.def.drawShowcase(x, c.w, c.h, ts);
    else defaultShowcase(x, c.w, c.h, ts, c.def);
  } catch (e) {
    console.warn('[hub] vitrine', c.def.id, e);
    c.def.drawShowcase = undefined;
  }
}

/* ---- vitrine padrão: bolhas nas cores do tema + ícone do jogo flutuando ---- */

const iconImgs = new Map<string, HTMLImageElement>();
const BUBBLES = Array.from({ length: 14 }, (_, i) => ({
  x: ((i * 0.6180339) % 1) * 1.1 - 0.05,
  r: 0.04 + ((i * 0.37) % 1) * 0.09,
  sp: 0.05 + ((i * 0.73) % 1) * 0.08,
  ph: (i * 1.7) % 1,
  c: i % 3,
}));

function iconImg(name: IconName): HTMLImageElement {
  let im = iconImgs.get(name);
  if (!im) {
    im = new Image();
    im.src = iconDataUri(name);
    iconImgs.set(name, im);
  }
  return im;
}

export function defaultShowcase(x: CanvasRenderingContext2D, w: number, h: number, ts: number, def: MiniGameDef): void {
  const th = def.theme;
  const cols = [th.accent, th.accent2, th.title[1]];
  const m = Math.min(w, h);
  x.globalAlpha = 0.55;
  for (const b of BUBBLES) {
    const y = 1.1 - ((ts * b.sp + b.ph) % 1.2);
    x.fillStyle = cols[b.c];
    x.beginPath();
    x.arc(b.x * w + Math.sin(ts + b.ph * 6) * 6, y * h, b.r * m, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const s = m * 0.52;
  const bob = Math.sin(ts * 2) * m * 0.03;
  x.fillStyle = 'rgba(0,0,0,0.22)';
  x.beginPath();
  x.ellipse(w / 2, h / 2 + s * 0.55, s * 0.38 * (1 - bob / m), s * 0.08, 0, 0, Math.PI * 2);
  x.fill();
  const im = iconImg(def.icon);
  if (im.complete && im.naturalWidth) x.drawImage(im, w / 2 - s / 2, h / 2 - s / 2 + bob - s * 0.05, s, s);
}

/* ============================== perfil ============================== */

function defaultProfile(cv: HTMLCanvasElement, size: number): void {
  renderSkinPreview(skinById(save.skin), size, 0.6, { target: cv, backdrop: false });
}

/* ============================== barra inferior ============================== */

function buildNav(): void {
  const ps = listPanels()
    .filter((p) => p.navOrder !== undefined)
    .slice()
    .sort((a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0));
  nav.innerHTML = ps
    .map(
      (p) => `<button class="hn-item" data-panel="${esc(p.id)}" aria-label="${esc(p.label)}">
        <span class="hn-ico">${icon(p.icon, { size: 30 })}</span><span class="hn-lbl">${esc(p.label)}</span><em class="badge hidden"></em></button>`,
    )
    .join('');
  nav.classList.toggle('many', ps.length > 5);
  // dica de rolagem: esmaece a borda enquanto houver itens escondidos à direita
  const edge = () => nav.classList.toggle('more', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
  nav.onscroll = edge;
  requestAnimationFrame(edge);
  window.addEventListener('resize', edge);
  nav.querySelectorAll<HTMLElement>('[data-panel]').forEach((b) => {
    b.onclick = () => {
      const p = listPanels().find((x) => x.id === b.dataset.panel);
      if (!p) return;
      haptics.tap('light');
      p.open();
    };
  });
  refreshNavBadges();
}

export function refreshNavBadges(): void {
  if (!nav) return;
  nav.querySelectorAll<HTMLElement>('[data-panel]').forEach((b) => {
    const p = listPanels().find((x) => x.id === b.dataset.panel);
    const em = b.querySelector('.badge') as HTMLElement;
    let v: number | string = 0;
    try {
      v = p?.badge?.() ?? 0;
    } catch {
      v = 0;
    }
    em.classList.toggle('hidden', !v);
    em.textContent = v ? String(v) : '';
  });
}

/* ============================== game host ============================== */

function buildHost(): void {
  host = document.createElement('div');
  host.id = 'game-host';
  host.className = 'game-host';
  host.innerHTML = `
    <div class="gh-root"></div>
    <div class="gh-confirm" role="dialog" aria-modal="true">
      <div class="panel gh-panel">
        <div class="panel-art plate plate-violet round">${icon('pause')}</div>
        <h2 data-i18n="hub.exitTitle">Sair do jogo?</h2>
        <p class="muted" data-i18n="hub.exitMsg">O progresso desta partida pode ser perdido.</p>
        <button class="btn btn-play small" data-gh="resume"><span data-i18n="hub.resume">CONTINUAR</span></button>
        <button class="btn btn-ghost" data-gh="exit"><span data-i18n="hub.exitBtn">Sair para o menu</span></button>
      </div>
    </div>`;
  document.body.appendChild(host);
  hostRoot = host.querySelector('.gh-root')!;
  hostConfirm = host.querySelector('.gh-confirm')!;
  host.querySelector<HTMLElement>('[data-gh="resume"]')!.onclick = () => {
    audio.click();
    hideConfirm();
    handle?.resume?.();
  };
  host.querySelector<HTMLElement>('[data-gh="exit"]')!.onclick = () => {
    audio.click();
    closeHost();
  };
  applyI18n(host);
}

function hideConfirm(): void {
  hostConfirm?.classList.remove('on');
}

/* ============================== util ============================== */

function remember(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* */
  }
}
function readLast(): string {
  try {
    return localStorage.getItem(LAST_KEY) || 'orbit';
  } catch {
    return 'orbit';
  }
}
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function toast(msg: string): void {
  bus.emit('toast', msg);
}

export { defaultProfile };

/* ---------------- tela desligada / 3D perdido ----------------
 * Ao desligar a tela, o Android pode jogar fora o contexto WebGL dos jogos 3D
 * e a cena volta só com o fundo (tela verde/escura, HUD por cima). Detectamos
 * a perda em qualquer canvas do jogo aberto e, ao voltar, reabrimos o jogo
 * (o progresso já fica salvo pelos próprios jogos). */
let glLost = false;
function bindGlGuard(): void {
  document.addEventListener(
    'webglcontextlost',
    (e) => {
      if (!hostActive || !(e.target as HTMLElement)?.closest?.('.gh-game')) return;
      e.preventDefault(); // permite o navegador tentar restaurar
      glLost = true;
    },
    true,
  );
  const recover = () => {
    if (!glLost || document.hidden) return;
    glLost = false;
    const d = hostDef;
    if (!d || !hostActive) return;
    closeHost();
    window.setTimeout(() => void launchGame(d), 60);
  };
  document.addEventListener('visibilitychange', () => window.setTimeout(recover, 250));
  window.addEventListener('focus', () => window.setTimeout(recover, 250));
  bus.on('app-resume', () => window.setTimeout(recover, 250));
}

/* ---------------- orientação automática por cena ---------------- */
let o3d: MutationObserver | null = null;
let o3dTimer = 0;
let o3dState: 'portrait' | 'landscape' = 'portrait';
function watch3d(root: HTMLElement): void {
  unwatch3d();
  o3dState = 'portrait';
  const check = () => {
    o3dTimer = 0;
    const cv = root.querySelector<HTMLCanvasElement>('canvas[data-engine^="three"]');
    const want = cv && cv.isConnected && cv.offsetWidth > 0 ? 'landscape' : 'portrait';
    if (want === o3dState) return;
    o3dState = want;
    void lockOrientation(want);
  };
  o3d = new MutationObserver(() => {
    if (!o3dTimer) o3dTimer = window.setTimeout(check, 120);
  });
  o3d.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  check();
}
function unwatch3d(): void {
  o3d?.disconnect();
  o3d = null;
  if (o3dTimer) clearTimeout(o3dTimer);
  o3dTimer = 0;
}
