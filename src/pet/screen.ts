/* ============================================================
 *  CASA DO BLOOP — tela do bichinho (carregada sob demanda).
 *  Um único canvas (cômodo + bichinho + partículas) e uma camada
 *  HTML por cima (status, bandeja do cômodo, abas, loja de decoração).
 * ============================================================ */
import './pet.css';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import { addCoins, addGems } from '../core/economy';
import { success, tap } from '../core/haptics';
import { isNative } from '../core/platform';
import { detectInitialTier, loadMode, settingsFor, type Tier } from '../core/quality';
import { persist, save } from '../core/storage';
import { skinById } from '../game/skins';
import { fmt, t } from '../i18n';
import { rewardedAvailable, showRewarded } from '../services/ads';
import { COIN, GEM, esc } from '../ui/dom';
import { icon, installIconCss, type IconName } from '../ui/icons';
import { DECOR, FOODS, decorById, type DecorDef, type DecorKind, type FoodDef } from './catalog';
import { requestNotifPermission } from './notify';
import { notify } from '../ui/notify';
import {
  FOAM_MAX,
  Fx,
  PK,
  ROOMS,
  SPOTS,
  WET_MAX,
  drawFood,
  drawLamp,
  drawPet,
  drawTubFront,
  layoutFor,
  makeView,
  mouthPos,
  roomBg,
  sparkle,
  spotAlphaFromClean,
  type Layout,
  type Room,
} from './render';
import { sfx } from './sfx';
import {
  onVoiceState,
  petVoiceEnabled,
  pollVoice,
  setPetVoiceEnabled,
  startVoice,
  stopVoice,
  voiceMicLevel,
  voiceOutLevel,
  voiceState,
  voiceSupported,
  type VoiceState,
} from './voice';
import {
  LOW,
  STATS,
  bathed,
  buyFood,
  cheer,
  eat,
  health,
  levelInfo,
  mood,
  pantryCount,
  pet,
  petCoinBonus,
  played,
  polished,
  sleepTick,
  tick,
  type StatKey,
} from './state';

/* ---------------------------- estado da tela ---------------------------- */

let root: HTMLElement | null = null;
let cv: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let isOpen = false;
let raf = 0;
let lastTs = 0;
let frameSkip = false;
let room: Room = 'kitchen';
let prevRoom: Room | null = null;
let slideT = 1;
let slideDir = 1;
let L: Layout = layoutFor(400, 800);
let dpr = 1;
let tier: Tier = 2;
let hiFx = true;
let fps30 = false;
let unsub: (() => void)[] = [];
let tickAcc = 0;
let sleepAcc = 0;

const fx = new Fx(260);
const v = makeView();

/** ponteiro atual sobre o canvas */
const ptr = { x: 0, y: 0, down: false, sx: 0, sy: 0, moved: 0, id: -1, lastX: 0, lastY: 0, vx: 0, vy: 0, onPet: false, swipe: false, t0: 0, lt: 0 };

/* animações do bichinho */
let blinkT = 2;
let hopPhase = 0;
let squashV = 0;
let squash = 0;
let tiltV = 0;
let yawnT = 0;
let yawnCd = 6;
let rumbleT = 0;
let rumbleCd = 4;
let tearCd = 0;
let sparkCd = 0;
let happyT = 0;
let mouthOpenT = 0;
let sayT = 0;
let sayCd = 0;
let lastSay = '';

/* cozinha */
const drag = { id: '', x: 0, y: 0, on: false, fly: 0, fx: 0, fy: 0 };
let chewT = 0;
let chewFood: FoodDef | null = null;
let chewBites = 0;
let burpT = 0;
let wasHungry = false;

/* banheiro */
type BathStage = 'scrub' | 'rinse' | 'dry' | 'polish' | 'done';
let stage: BathStage = 'scrub';
let foam0 = 1;
let wet0 = 1;
const cells = new Uint8Array(64);
let cellsTotal = 1;
let cellsDone = 0;
let rubAcc = 0;
let hapT = 0;
let sndT = 0;
let toolAng = 0;

/* quarto */
let lampOn = true;
let zzzCd = 0;

/* sala */
const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 20, rot: 0, held: false, rest: true };
let tickleN = 0;
let giggleCd = 0;

/* ============================================================
 *  API
 * ============================================================ */

export function isPetOpen(): boolean {
  return isOpen;
}

export function openPet(opts: { room?: Room } = {}): void {
  installIconCss();
  if (!root) build();
  tick();
  isOpen = true;
  root!.classList.add('on');
  setRoom(opts.room ?? suggestedRoom(), false);
  resize();
  refreshHud();
  lastTs = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  unsub.push(
    bus.on('pet', refreshHud),
    bus.on('wallet', refreshHud),
    bus.on('pet-levelup', (lv: number) => {
      toast(t('pet.levelup', 'Nível {n}! Agora você ganha +{p}% de moedas em todos os jogos', { n: lv, p: Math.round(petCoinBonus() * 100) }), 'star');
      sfx.levelUp();
      success();
      fx.burst(PK.Star, L.cx, L.cy - L.R, 24, 420, 1.2, 10, 5, 120);
    }),
  );
  window.addEventListener('resize', resize);
  if (isNative && !pet().notifAsked) setTimeout(() => isOpen && askNotif(), 1200);
  if (new URLSearchParams(location.search).has('petnotif')) setTimeout(askNotif, 300);
  say(true);
}

export function closePet(): boolean {
  if (!isOpen) return false;
  const modal = root!.querySelector('.pet-modal.on');
  if (modal) {
    modal.classList.remove('on');
    return true;
  }
  isOpen = false;
  stopVoice();
  root!.classList.remove('on');
  cancelAnimationFrame(raf);
  unsub.forEach((u) => u());
  unsub = [];
  window.removeEventListener('resize', resize);
  lampOn = true;
  persist();
  bus.emit('pet-closed');
  return true;
}

function suggestedRoom(): Room {
  const p = pet();
  const k = (['food', 'clean', 'energy', 'fun'] as StatKey[]).reduce((a, b) => (p[b] < p[a] ? b : a));
  if (p[k] >= 45) return room;
  return k === 'food' ? 'kitchen' : k === 'clean' ? 'bath' : k === 'energy' ? 'bed' : 'play';
}

/* ============================================================
 *  DOM
 * ============================================================ */

const ROOM_ICON: Record<Room, IconName> = { kitchen: 'food', bath: 'bath', bed: 'bed', play: 'ball' };
const roomName = (r: Room): string =>
  r === 'kitchen' ? t('pet.room.kitchen', 'Cozinha') : r === 'bath' ? t('pet.room.bath', 'Banheiro') : r === 'bed' ? t('pet.room.bed', 'Quarto') : t('pet.room.play', 'Sala');
const STAT_ICON: Record<StatKey, IconName> = { food: 'food', clean: 'drop', fun: 'smile', energy: 'bolt' };
const statName = (k: StatKey): string =>
  k === 'food' ? t('pet.stat.food', 'Fome') : k === 'clean' ? t('pet.stat.clean', 'Limpeza') : k === 'fun' ? t('pet.stat.fun', 'Alegria') : t('pet.stat.energy', 'Energia');

function $(sel: string): HTMLElement {
  return root!.querySelector(sel) as HTMLElement;
}

function build(): void {
  root = document.createElement('div');
  root.className = 'pet-scr';
  root.innerHTML = `
    <canvas class="pet-cv"></canvas>
    <div class="pet-top">
      <button class="pet-btn pet-back" aria-label="${esc(t('pet.back', 'Voltar'))}">${icon('home', { size: 26 })}</button>
      <div class="pet-lv">
        <b class="pet-lv-n"></b>
        <span class="pet-lv-bar"><i></i></span>
        <small class="pet-lv-perk"></small>
      </div>
      <div class="pet-wallet"><span class="pet-coins"></span><span class="pet-gems"></span></div>
    </div>
    <div class="pet-stats">${STATS.map(
      (k) => `<div class="pet-stat" data-k="${k}">${icon(STAT_ICON[k], { size: 22 })}<span class="pet-stat-bar"><i></i></span><small>${esc(statName(k))}</small></div>`,
    ).join('')}</div>
    <div class="pet-say"></div>
    <div class="pet-tray"></div>
    <nav class="pet-tabs">${ROOMS.map(
      (r) => `<button class="pet-tab" data-room="${r}">${icon(ROOM_ICON[r], { size: 30 })}<span>${esc(roomName(r))}</span></button>`,
    ).join('')}<button class="pet-tab pet-tab-decor">${icon('paint', { size: 30 })}<span>${esc(t('pet.decorate', 'Decorar'))}</span></button></nav>
    <div class="pet-modal pet-decor"><div class="pet-card"></div></div>
    <div class="pet-modal pet-ask"><div class="pet-card"></div></div>
    <button class="pet-mic" aria-label="${esc(t('pet.voice.btn', 'Falar'))}">${micSvg()}<span>${esc(t('pet.voice.btn', 'Falar'))}</span></button>
    <div class="pet-modal pet-vask"><div class="pet-card"></div></div>
    <div class="pet-toast"></div>`;
  document.body.appendChild(root);
  cv = $('.pet-cv') as HTMLCanvasElement;
  ctx = cv.getContext('2d', { alpha: false })!;
  $('.pet-back').addEventListener('click', () => {
    sfx.click();
    closePet();
  });
  root.querySelectorAll<HTMLElement>('.pet-tab[data-room]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.click();
      tap('light');
      setRoom(b.dataset.room as Room, true);
    }),
  );
  $('.pet-mic').addEventListener('click', onMicButton);
  onVoiceState(onVoice);
  $('.pet-tab-decor').addEventListener('click', () => {
    sfx.click();
    openDecor('wall');
  });
  cv.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  const mode = loadMode();
  tier = mode === 'auto' ? detectInitialTier() : mode;
  const qs = settingsFor(tier);
  fx.budget = qs.particleBudget;
  hiFx = tier >= 2;
  fps30 = qs.fpsCap === 30;
  dpr = Math.min(qs.dprCap, window.devicePixelRatio || 1);
}

function resize(): void {
  if (!root) return;
  const W = Math.max(280, root.clientWidth);
  const H = Math.max(420, root.clientHeight);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  L = layoutFor(W, H);
  fx.floorY = L.floorY + 6;
  ball.r = Math.round(L.R * 0.3);
  if (ball.rest || ball.x === 0) {
    ball.x = L.W * 0.82;
    ball.y = L.floorY + 4 - ball.r;
  }
  const say = $('.pet-say');
  say.style.top = `${Math.max(150, L.cy - L.R * 2.05)}px`;
  $('.pet-mic').style.top = `${Math.round(L.floorY - 64)}px`;
}

/* ---------------------------- HUD ---------------------------- */

function refreshHud(): void {
  if (!root || !isOpen) return;
  const p = pet();
  for (const k of STATS) {
    const el = root.querySelector<HTMLElement>(`.pet-stat[data-k="${k}"]`)!;
    const val = Math.round(p[k]);
    el.style.setProperty('--v', `${val}%`);
    el.classList.toggle('low', val < LOW);
    el.classList.toggle('mid', val >= LOW && val < 60);
  }
  const li = levelInfo();
  $('.pet-lv-n').textContent = t('pet.level', 'Nível {n}', { n: li.level });
  $('.pet-lv-bar i').style.width = `${Math.round((li.cur / li.need) * 100)}%`;
  $('.pet-lv-perk').innerHTML = `${COIN} +${Math.round(petCoinBonus() * 100)}% ${esc(t('pet.perk', 'em todos os jogos'))}`;
  $('.pet-coins').innerHTML = `${COIN}${fmt(save.coins)}`;
  $('.pet-gems').innerHTML = `${GEM}${fmt(save.gems)}`;
  if (room === 'kitchen') refreshShelf();
}

/** Aviso em pílula pequena no canto (padrão do app, ui/notify) — antes era uma faixa grande no meio da tela. */
function toast(msg: string, ico?: IconName): void {
  notify(msg, { icon: ico });
}

/** Balão de fala do bichinho (o que ele quer agora). */
function say(force = false, text?: string): void {
  const m = mood();
  let s = text ?? '';
  if (!s) {
    if (lampOn === false) s = '';
    else if (m.hungry) s = room === 'kitchen' ? t('pet.say.hungryK', 'Arrasta a comida até a minha boca!') : t('pet.say.hungry', 'Estou com fome!');
    else if (room === 'bath' && stage === 'rinse') s = t('pet.say.rinse', 'Agora a água! Que gostoso!');
    else if (room === 'bath' && stage === 'dry') s = t('pet.say.dry', 'Brrr! Me seca?');
    else if (m.dirty) s = room === 'bath' ? t('pet.say.dirtyB', 'Esfrega a esponja em mim!') : t('pet.say.dirty', 'Tô sujinho, me dá um banho?');
    else if (m.tired) s = room === 'bed' ? t('pet.say.tiredB', 'Apaga a luz pra eu dormir?') : t('pet.say.tired', 'Tô com soninho...');
    else if (m.sad) s = room === 'play' ? t('pet.say.sadP', 'Joga a bola pra mim!') : t('pet.say.sad', 'Vem brincar comigo!');
    else if (m.happy) s = Math.random() < 0.5 ? t('pet.say.happy1', 'Te adoro!') : t('pet.say.happy2', 'Que dia lindo!');
  }
  if (!s || (!force && s === lastSay)) return;
  lastSay = s;
  const el = $('.pet-say');
  el.textContent = s;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  sayT = 3.6;
  sayCd = 12;
}

/* ---------------------------- cômodos ---------------------------- */

function setRoom(r: Room, animate: boolean): void {
  if (r !== room && animate) {
    prevRoom = room;
    slideDir = ROOMS.indexOf(r) > ROOMS.indexOf(room) ? 1 : -1;
    slideT = 0;
  }
  if (room === 'bed' && r !== 'bed') lampOn = true;
  room = r;
  root!.querySelectorAll<HTMLElement>('.pet-tab[data-room]').forEach((b) => b.classList.toggle('on', b.dataset.room === r));
  root!.dataset.room = r;
  drag.on = false;
  if (r === 'bath') resetBath();
  buildTray();
  say(true);
}

function buildTray(): void {
  const tray = $('.pet-tray');
  if (room === 'kitchen') {
    tray.innerHTML = `<div class="pet-shelf">${FOODS.map(
      (f) => `<div class="pet-food" data-id="${f.id}"><canvas width="96" height="96"></canvas><em class="pet-cnt"></em>
        <button class="pet-buy">${f.coins ? COIN + f.coins : GEM + f.gems}</button></div>`,
    ).join('')}</div>`;
    tray.querySelectorAll<HTMLElement>('.pet-food').forEach((el) => {
      const f = FOODS.find((x) => x.id === el.dataset.id)!;
      const c = el.querySelector('canvas')!;
      const x = c.getContext('2d')!;
      drawFood(x, f.shape, 48, 50, 64);
      c.addEventListener('pointerdown', (e) => startFoodDrag(e, f));
      el.querySelector('.pet-buy')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (buyFood(f.id)) {
          sfx.coin();
          tap('light');
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        } else {
          toast(t('pet.noMoney', 'Moedas insuficientes. Jogue um minigame para ganhar mais!'), 'coin');
          tap('medium');
        }
        refreshShelf();
      });
    });
    refreshShelf();
  } else if (room === 'bath') {
    const steps: [BathStage, IconName, string][] = [
      ['scrub', 'sponge', t('pet.bath.scrub', 'Esfregar')],
      ['rinse', 'shower', t('pet.bath.rinse', 'Enxaguar')],
      ['dry', 'towel', t('pet.bath.dry', 'Secar')],
      ['polish', 'cloth', t('pet.bath.polish', 'Polir')],
    ];
    tray.innerHTML = `<div class="pet-steps">${steps
      .map(([s, ic, label], i) => `<div class="pet-step" data-s="${s}"><b>${i + 1}</b>${icon(ic, { size: 34 })}<span>${esc(label)}</span></div>`)
      .join('')}</div><div class="pet-prog"><i></i></div><p class="pet-hint"></p>
      <button class="pet-btn pet-big pet-again">${icon('refresh', { size: 22 })}${esc(t('pet.bath.again', 'Outro banho'))}</button>`;
    tray.querySelector('.pet-again')!.addEventListener('click', () => {
      sfx.click();
      resetBath(true);
    });
    refreshBathTray();
  } else if (room === 'bed') {
    tray.innerHTML = `<button class="pet-btn pet-big pet-lamp">${icon('lamp', { size: 30 })}<span></span></button><p class="pet-hint"></p>`;
    tray.querySelector('.pet-lamp')!.addEventListener('click', toggleLamp);
    refreshBedTray();
  } else {
    tray.innerHTML = `<p class="pet-hint">${esc(t('pet.play.hint', 'Faça cócegas esfregando o dedo nele, ou chute a bola!'))}</p>
      <div class="pet-row"><button class="pet-btn pet-kick">${icon('ball', { size: 26 })}${esc(t('pet.play.ball', 'Bola!'))}</button>
      <button class="pet-btn pet-big pet-games">${icon('play', { size: 26 })}${esc(t('pet.play.games', 'Jogar minigames'))}</button></div>`;
    tray.querySelector('.pet-kick')!.addEventListener('click', () => kickBall((Math.random() - 0.5) * 500, -1100));
    tray.querySelector('.pet-games')!.addEventListener('click', () => {
      sfx.click();
      closePet();
      bus.emit('pet-play-games');
    });
  }
}

function refreshShelf(): void {
  if (room !== 'kitchen' || !root) return;
  root.querySelectorAll<HTMLElement>('.pet-food').forEach((el) => {
    const id = el.dataset.id!;
    const n = pantryCount(id);
    const f = FOODS.find((x) => x.id === id)!;
    el.classList.toggle('empty', n <= 0);
    el.querySelector('.pet-cnt')!.textContent = n > 0 ? `x${n}` : '';
    el.querySelector('.pet-buy')!.classList.toggle('poor', f.coins ? save.coins < f.coins : save.gems < (f.gems ?? 0));
  });
}

/* ============================================================
 *  COZINHA
 * ============================================================ */

function startFoodDrag(e: PointerEvent, f: FoodDef): void {
  audio.unlock();
  if (chewT > 0 || drag.fly > 0) return;
  if (pantryCount(f.id) <= 0) {
    toast(t('pet.buyHint', 'Toque no preço para comprar.'), 'coin');
    tap('light');
    return;
  }
  e.preventDefault();
  drag.id = f.id;
  drag.on = true;
  drag.x = e.clientX;
  drag.y = e.clientY - 30;
  drag.fx = e.clientX;
  drag.fy = e.clientY;
  ptr.id = e.pointerId;
  ptr.down = true;
  ptr.sx = e.clientX;
  ptr.sy = e.clientY;
  ptr.moved = 0;
  tap('light');
}

function dropFood(x: number, y: number, tapOnly: boolean): void {
  const [mx, my] = mouthPos(L, v);
  const near = Math.hypot(x - mx, y - my) < L.R * 0.9;
  if (near || tapOnly) {
    // voa até a boca (toque) ou come direto (soltou na boca)
    drag.fly = near ? 0.001 : 0.35;
    drag.x = x;
    drag.y = y;
  } else {
    drag.on = false;
    sfx.pop();
  }
}

function startChew(): void {
  const p = pet();
  wasHungry = p.food < 60;
  const f = eat(drag.id);
  drag.on = false;
  drag.fly = 0;
  if (!f) return;
  chewFood = f;
  chewT = 1.35;
  chewBites = 0;
  refreshShelf();
}

function updateKitchen(dt: number): void {
  const [mx, my] = mouthPos(L, v);
  if (drag.on && drag.fly > 0) {
    drag.fly -= dt;
    const k = Math.min(1, dt * 12);
    drag.x += (mx - drag.x) * k;
    drag.y += (my - drag.y) * k;
    if (drag.fly <= 0 || Math.hypot(drag.x - mx, drag.y - my) < 8) startChew();
  }
  if (chewT > 0) {
    const before = chewT;
    chewT -= dt;
    const biteEvery = 0.33;
    const b = Math.floor((1.35 - chewT) / biteEvery);
    if (b > chewBites && b <= 3) {
      chewBites = b;
      sfx.chomp();
      tap('light');
      squashV -= 3;
      fx.burst(PK.Crumb, mx, my, 6, 220, 0.9, 4, 2, 140);
    }
    mouthOpenT = Math.sin((1.35 - chewT) * 19) > 0 ? 0.1 : 0;
    if (chewT <= 0 && before > 0) {
      sfx.yum();
      happyT = 1.6;
      if (wasHungry) for (let i = 0; i < 6; i++) fx.emit(PK.Heart, L.cx + (Math.random() - 0.5) * L.R, L.cy - L.R * 0.6, (Math.random() - 0.5) * 60, -120 - Math.random() * 60, 1.4, 9, 4);
      if (Math.random() < 0.4) burpT = 0.55;
      chewFood = null;
      say(true, wasHungry ? t('pet.say.yum', 'Hummm, que delícia!') : t('pet.say.full', 'Tô cheinho!'));
    }
  }
  if (burpT > 0) {
    burpT -= dt;
    if (burpT <= 0) {
      sfx.burp();
      squashV += 5;
      for (let i = 0; i < 5; i++) fx.emit(PK.Puff, mx + 10, my, 40 + Math.random() * 60, -40 - Math.random() * 40, 0.8, 10 + i * 2, 9);
    }
  }
}

/* ============================================================
 *  BANHEIRO
 * ============================================================ */

function resetBath(fresh = false): void {
  stage = 'scrub';
  v.foamN = 0;
  v.wetN = 0;
  v.polish = 0;
  cells.fill(0);
  cellsDone = 0;
  spotAlphaFromClean(pet().clean, v.spotA);
  if (fresh) for (let i = 0; i < v.spotA.length; i += 3) v.spotA[i] = Math.max(v.spotA[i], 0.5);
  // células do polimento dentro do corpo (grade 8x8 em [-1,1])
  cellsTotal = 0;
  for (let i = 0; i < 64; i++) {
    const gx = ((i % 8) + 0.5) / 4 - 1;
    const gy = (Math.floor(i / 8) + 0.5) / 4 - 1;
    if (gx * gx + gy * gy < 0.8) cellsTotal++;
    else cells[i] = 2; // fora
  }
  if (root && room === 'bath') refreshBathTray();
}

const STAGE_ORDER: BathStage[] = ['scrub', 'rinse', 'dry', 'polish', 'done'];

function bathProgress(): number {
  if (stage === 'scrub') return Math.min(1, v.foamN / 24);
  if (stage === 'rinse') return 1 - foamLeft() / foam0;
  if (stage === 'dry') return 1 - wetLeft() / wet0;
  if (stage === 'polish') return cellsDone / cellsTotal;
  return 1;
}

function refreshBathTray(): void {
  if (!root || room !== 'bath' || !root.querySelector('.pet-steps')) return;
  const si = STAGE_ORDER.indexOf(stage);
  root.querySelectorAll<HTMLElement>('.pet-step').forEach((el) => {
    const i = STAGE_ORDER.indexOf(el.dataset.s as BathStage);
    el.classList.toggle('on', i === si);
    el.classList.toggle('done', i < si);
  });
  const hint =
    stage === 'scrub'
      ? t('pet.bath.h1', 'Esfregue a esponja nele até fazer muita espuma!')
      : stage === 'rinse'
        ? t('pet.bath.h2', 'Passe o chuveirinho para tirar a espuma.')
        : stage === 'dry'
          ? t('pet.bath.h3', 'Seque as gotinhas com a toalha.')
          : stage === 'polish'
            ? t('pet.bath.h4', 'Agora polir! Esfregue o paninho até brilhar.')
            : t('pet.bath.h5', 'Brilhando de limpinho!');
  $('.pet-hint').textContent = hint;
  root.querySelector('.pet-tray')!.classList.toggle('done', stage === 'done');
}

function foamLeft(): number {
  let n = 0;
  for (let i = 0; i < v.foamN; i++) if (v.foam[i * 3 + 2] > 0.02) n++;
  return n;
}
function wetLeft(): number {
  let n = 0;
  for (let i = 0; i < v.wetN; i++) if (v.wet[i * 2] < 1e5) n++;
  return n;
}

function nextStage(): void {
  const i = STAGE_ORDER.indexOf(stage);
  stage = STAGE_ORDER[Math.min(4, i + 1)];
  sfx.pop();
  tap('medium');
  if (stage === 'rinse') {
    for (let k = 0; k < v.spotA.length; k++) v.spotA[k] = 0;
    foam0 = Math.max(1, foamLeft());
    say(true);
  } else if (stage === 'dry') {
    v.foamN = 0;
    v.wetN = WET_MAX;
    for (let k = 0; k < WET_MAX; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.82;
      v.wet[k * 2] = Math.cos(a) * r;
      v.wet[k * 2 + 1] = Math.sin(a) * r;
    }
    wet0 = WET_MAX;
    say(true);
  } else if (stage === 'polish') {
    v.wetN = 0;
    bathed();
    happyT = 1.5;
    fx.burst(PK.Bubble, L.cx, L.cy, 14, 260, 1.4, 10, 0, 80);
    say(true, t('pet.say.clean', 'Que cheirinho bom!'));
  } else if (stage === 'done') {
    polished();
    v.polish = 1;
    happyT = 3;
    sfx.shine();
    success();
    fx.burst(PK.Sparkle, L.cx, L.cy, 30, 520, 1.3, 14, 0, 60);
    fx.burst(PK.Star, L.cx, L.cy, 16, 380, 1.4, 9, 5, 120);
    say(true, t('pet.say.shiny', 'Tô brilhando!'));
  }
  refreshBathTray();
}

/** Esfrega no ponto (x,y) em px de tela. */
function bathRub(x: number, y: number, dist: number): void {
  const R = L.R;
  const lx = (x - L.cx) / R;
  const ly = (y - (L.cy - v.hop)) / R;
  const inBody = lx * lx + ly * ly < 1.1;
  const now = performance.now();
  if (stage === 'scrub' && inBody) {
    rubAcc += dist;
    if (rubAcc < 7) return;
    rubAcc = 0;
    for (let i = 0; i < SPOTS.length; i++) {
      const dx = SPOTS[i][0] - lx;
      const dy = SPOTS[i][1] - ly;
      if (dx * dx + dy * dy < 0.09) v.spotA[i] = Math.max(0, v.spotA[i] - 0.2);
    }
    // espuma: cresce a mais próxima ou cria nova
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < v.foamN; i++) {
      const dx = v.foam[i * 3] - lx;
      const dy = v.foam[i * 3 + 1] - ly;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if ((best < 0 || bd > 0.03) && v.foamN < FOAM_MAX) {
      const i = v.foamN++;
      const k = Math.min(0.92, Math.hypot(lx, ly));
      const a = Math.atan2(ly, lx);
      v.foam[i * 3] = Math.cos(a) * k + (Math.random() - 0.5) * 0.08;
      v.foam[i * 3 + 1] = Math.sin(a) * k + (Math.random() - 0.5) * 0.08;
      v.foam[i * 3 + 2] = 0.1 + Math.random() * 0.06;
      if (Math.random() < 0.5) sfx.pop();
    } else if (best >= 0) v.foam[best * 3 + 2] = Math.min(0.24, v.foam[best * 3 + 2] + 0.015);
    if (Math.random() < 0.35) fx.emit(PK.Bubble, x, y, (Math.random() - 0.5) * 80, -60 - Math.random() * 80, 1.2, 4 + Math.random() * 7, 0);
    if (now - sndT > 70) {
      sndT = now;
      sfx.scrub();
    }
    if (now - hapT > 90) {
      hapT = now;
      tap('light');
    }
    squashV += 0.6;
    tiltV += (Math.random() - 0.5) * 0.4;
    if (bathProgress() >= 1) nextStage();
  } else if (stage === 'dry' && inBody) {
    let hit = false;
    for (let i = 0; i < v.wetN; i++) {
      const dx = v.wet[i * 2] - lx;
      const dy = v.wet[i * 2 + 1] - ly;
      if (dx * dx + dy * dy < 0.07) {
        v.wet[i * 2] = 1e6;
        hit = true;
      }
    }
    if (hit && now - sndT > 60) {
      sndT = now;
      sfx.squeak();
      tap('light');
    }
    if (now - hapT > 120) {
      hapT = now;
      tiltV += (Math.random() - 0.5) * 0.3;
    }
    if (bathProgress() >= 1) nextStage();
  } else if (stage === 'polish' && inBody) {
    const gx = Math.floor((lx + 1) * 4);
    const gy = Math.floor((ly + 1) * 4);
    for (let oy = -1; oy <= 0; oy++)
      for (let ox = -1; ox <= 0; ox++) {
        const cx = gx + ox;
        const cy = gy + oy;
        if (cx < 0 || cy < 0 || cx > 7 || cy > 7) continue;
        const i = cy * 8 + cx;
        if (cells[i]) continue;
        cells[i] = 1;
        cellsDone++;
        sparkle4(x, y);
        if (now - sndT > 50) {
          sndT = now;
          sfx.squeak();
        }
        tap('light');
      }
    v.polish = (cellsDone / cellsTotal) * 0.8;
    if (cellsDone >= cellsTotal * 0.92) nextStage();
  }
}

function sparkle4(x: number, y: number): void {
  for (let i = 0; i < 3; i++) fx.emit(PK.Sparkle, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 90, -40 - Math.random() * 60, 0.7, 7 + Math.random() * 6, Math.random() < 0.5 ? 0 : 5);
}

function updateBath(dt: number): void {
  if (stage === 'rinse' && ptr.down && !ptr.swipe) {
    const hx = ptr.x;
    const hy = Math.min(ptr.y, L.cy - L.R * 1.2);
    const n = hiFx ? 4 : 2;
    for (let i = 0; i < n; i++) fx.emit(PK.Water, hx + (Math.random() - 0.5) * L.R * 0.5, hy + 14, (Math.random() - 0.5) * 60, 300 + Math.random() * 200, 0.9, 3 + Math.random() * 2, 3);
    const R = L.R;
    const lx = (hx - L.cx) / R;
    for (let i = 0; i < v.foamN; i++) {
      const dx = v.foam[i * 3] - lx;
      if (Math.abs(dx) < 0.35 && v.foam[i * 3 + 2] > 0) {
        v.foam[i * 3 + 2] = Math.max(0, v.foam[i * 3 + 2] - dt * 0.35);
        v.foam[i * 3 + 1] += dt * 0.5; // escorre
        if (v.foam[i * 3 + 2] <= 0.02 && v.foam[i * 3 + 2] > 0) {
          v.foam[i * 3 + 2] = 0;
          fx.emit(PK.Bubble, L.cx + v.foam[i * 3] * R, L.cy + v.foam[i * 3 + 1] * R, (Math.random() - 0.5) * 80, -60, 1, 6, 0);
        }
      }
    }
    const now = performance.now();
    if (now - sndT > 220) {
      sndT = now;
      sfx.water();
      tap('light');
    }
    if (foamLeft() === 0) nextStage();
  }
}

function drawBathTool(c: CanvasRenderingContext2D): void {
  if (stage === 'done') return;
  const active = ptr.down && !ptr.swipe && !drag.on;
  let x = active ? ptr.x : L.cx + L.R * 1.45;
  let y = active ? ptr.y : L.cy + Math.sin(v.t * 2) * 6;
  c.save();
  c.lineJoin = 'round';
  c.strokeStyle = '#2a0b5c';
  c.lineWidth = 3;
  if (stage === 'rinse') {
    y = active ? Math.min(ptr.y, L.cy - L.R * 1.2) : L.cy - L.R * 1.5;
    if (!active) x = L.cx + L.R * 1.2;
    c.translate(x, y);
    c.fillStyle = '#dcd6f0';
    c.beginPath();
    c.moveTo(-L.R * 0.3, 0);
    c.lineTo(L.R * 0.3, 0);
    c.lineTo(L.R * 0.2, -L.R * 0.16);
    c.lineTo(-L.R * 0.2, -L.R * 0.16);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(-L.R * 0.06, -L.R * 0.45, L.R * 0.12, L.R * 0.3, 5);
    c.fill();
    c.stroke();
  } else {
    c.translate(x, y);
    toolAng += (ptr.vx * 0.0006 - toolAng) * 0.2;
    c.rotate(toolAng);
    const s = L.R * 0.42;
    if (stage === 'scrub') {
      c.fillStyle = '#ffd36b';
      c.beginPath();
      c.roundRect(-s * 0.7, -s * 0.45, s * 1.4, s * 0.9, s * 0.25);
      c.fill();
      c.stroke();
      c.fillStyle = '#e9a83a';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(-s * 0.4 + i * s * 0.2, ((i * 37) % 5) * s * 0.12 - s * 0.2, s * 0.06, 0, Math.PI * 2);
        c.fill();
      }
    } else if (stage === 'dry') {
      c.fillStyle = '#ff9ec7';
      c.beginPath();
      c.roundRect(-s * 0.7, -s * 0.55, s * 1.4, s * 1.1, s * 0.2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      c.fillRect(-s * 0.7 + 2, s * 0.25, s * 1.4 - 4, s * 0.14);
    } else {
      c.fillStyle = '#b79bff';
      c.beginPath();
      c.moveTo(-s * 0.7, s * 0.2);
      c.quadraticCurveTo(-s * 0.6, -s * 0.5, 0, -s * 0.45);
      c.quadraticCurveTo(s * 0.75, -s * 0.4, s * 0.6, s * 0.25);
      c.quadraticCurveTo(0, s * 0.55, -s * 0.7, s * 0.2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      sparkle(c, s * 0.45, -s * 0.5, s * 0.18 * (0.6 + Math.sin(v.t * 6) * 0.4));
    }
  }
  c.restore();
}

/* ============================================================
 *  QUARTO
 * ============================================================ */

function toggleLamp(): void {
  audio.unlock();
  lampOn = !lampOn;
  if (!lampOn) stopVoice();
  sfx.click();
  tap('light');
  if (lampOn) {
    sleepTick(sleepAcc);
    sleepAcc = 0;
    squashV -= 4;
    happyT = pet().energy > 80 ? 1.5 : 0;
    say(true, pet().energy > 80 ? t('pet.say.awake', 'Dormi tão bem!') : t('pet.say.still', 'Ainda tô com sono...'));
  } else {
    $('.pet-say').classList.remove('show');
  }
  refreshBedTray();
}

function refreshBedTray(): void {
  if (!root || room !== 'bed') return;
  const b = root.querySelector('.pet-lamp span');
  if (b) b.textContent = lampOn ? t('pet.bed.off', 'Apagar a luz') : t('pet.bed.on', 'Acender a luz');
  $('.pet-hint').textContent = lampOn ? t('pet.bed.h1', 'Com a luz apagada ele dorme e recupera energia rapidinho.') : t('pet.bed.h2', 'Shhh... recarregando energia.');
  root.classList.toggle('night', !lampOn);
}

/* ============================================================
 *  SALA
 * ============================================================ */

function kickBall(vx: number, vy: number): void {
  audio.unlock();
  ball.vx = vx;
  ball.vy = vy;
  ball.rest = false;
  sfx.boing();
  tap('light');
}

function updateBall(dt: number): void {
  if (ball.held) return;
  if (ball.rest) return;
  ball.vy += 2000 * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.rot += (ball.vx * dt) / ball.r;
  const fl = L.floorY + 4 - ball.r;
  if (ball.y > fl) {
    ball.y = fl;
    if (Math.abs(ball.vy) > 160) {
      ball.vy *= -0.62;
      tap('light');
    } else {
      ball.vy = 0;
    }
    ball.vx *= 0.9;
    if (Math.abs(ball.vx) < 8 && ball.vy === 0) ball.rest = true;
  }
  if (ball.x < ball.r) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.8;
  } else if (ball.x > L.W - ball.r) {
    ball.x = L.W - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.8;
  }
  if (ball.y < ball.r + 60) {
    ball.y = ball.r + 60;
    ball.vy = Math.abs(ball.vy) * 0.5;
  }
  // bate no bichinho
  const px = L.cx;
  const py = L.cy - v.hop;
  const dx = ball.x - px;
  const dy = ball.y - py;
  const d = Math.hypot(dx, dy);
  const minD = L.R * 0.95 + ball.r;
  if (d < minD && d > 0) {
    const nx = dx / d;
    const ny = dy / d;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= 1.9 * vn * nx;
      ball.vy -= 1.9 * vn * ny;
      ball.vy -= 260;
      ball.x = px + nx * minD;
      ball.y = py + ny * minD;
      squashV += 6;
      tiltV += nx * -1.2;
      happyT = 1.2;
      if (giggleCd <= 0) {
        sfx.giggle();
        giggleCd = 0.4;
      }
      sfx.boing();
      tap('medium');
      for (let i = 0; i < 3; i++) fx.emit(PK.Note, px + nx * L.R, py + ny * L.R, nx * 80 + (Math.random() - 0.5) * 40, -100, 1.2, 12, i % 2 ? 4 : 6);
      played(3, 1);
    }
  }
}

function drawBall(c: CanvasRenderingContext2D): void {
  const r = ball.r;
  c.fillStyle = 'rgba(42,11,92,0.18)';
  c.beginPath();
  c.ellipse(ball.x, L.floorY + 6, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(ball.x, ball.y);
  c.rotate(ball.rot);
  c.fillStyle = '#ff9a2e';
  c.strokeStyle = '#2a0b5c';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.strokeStyle = '#ffffff';
  c.lineWidth = r * 0.16;
  c.beginPath();
  c.moveTo(-r * 0.85, -r * 0.35);
  c.quadraticCurveTo(0, r * 0.15, r * 0.85, -r * 0.35);
  c.moveTo(-r * 0.8, r * 0.45);
  c.quadraticCurveTo(0, -r * 0.05, r * 0.8, r * 0.45);
  c.stroke();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.ellipse(ball.x - r * 0.35, ball.y - r * 0.4, r * 0.25, r * 0.13, -0.6, 0, Math.PI * 2);
  c.fill();
}

/* ============================================================
 *  PONTEIRO
 * ============================================================ */

function local(e: PointerEvent): [number, number] {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function onPet(x: number, y: number, k = 1.1): boolean {
  const dx = (x - L.cx) / L.R;
  const dy = (y - (L.cy - v.hop)) / L.R;
  return dx * dx + dy * dy < k * k;
}

function onDown(e: PointerEvent): void {
  audio.unlock();
  // segundo dedo não rouba o gesto do primeiro
  if (ptr.down && e.pointerId !== ptr.id) return;
  const [x, y] = local(e);
  ptr.down = true;
  ptr.id = e.pointerId;
  ptr.x = ptr.sx = ptr.lastX = x;
  ptr.y = ptr.sy = ptr.lastY = y;
  ptr.moved = 0;
  ptr.vx = ptr.vy = 0;
  ptr.t0 = ptr.lt = performance.now();
  ptr.onPet = onPet(x, y);
  ptr.swipe = false;
  if (room === 'play' && Math.hypot(x - ball.x, y - ball.y) < ball.r * 1.5) {
    ball.held = true;
    ball.rest = false;
  }
  if (room === 'bath' && stage === 'rinse') ptr.onPet = true;
}

function onMove(e: PointerEvent): void {
  if (!isOpen) return;
  const [x, y] = local(e);
  if (drag.on && drag.fly === 0 && e.pointerId === ptr.id) {
    drag.x = x;
    drag.y = y - 30;
    ptr.moved += Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 6 ? 1 : 0;
    return;
  }
  if (!ptr.down || e.pointerId !== ptr.id) return;
  const dx = x - ptr.lastX;
  const dy = y - ptr.lastY;
  const dist = Math.hypot(dx, dy);
  const now = performance.now();
  const dt = Math.max(0.008, Math.min(0.05, (now - ptr.lt) / 1000));
  ptr.lt = now;
  ptr.vx = ptr.vx * 0.5 + (dx / dt) * 0.5;
  ptr.vy = ptr.vy * 0.5 + (dy / dt) * 0.5;
  ptr.x = x;
  ptr.y = y;
  ptr.lastX = x;
  ptr.lastY = y;
  ptr.moved += dist;
  if (ball.held) {
    ball.x = x;
    ball.y = Math.min(y, L.floorY + 4 - ball.r);
    return;
  }
  if (room === 'bath') bathRub(x, y, dist);
  else if (ptr.onPet && room === 'play' && dist > 2) tickle(dist);
  else if (ptr.onPet && room !== 'bed' && dist > 3 && ptr.moved > 30) tickle(dist * 0.5);
}

function onUp(e: PointerEvent): void {
  if (!isOpen) return;
  if (e.type === 'pointercancel' && e.pointerId === ptr.id) {
    // o navegador assumiu o gesto (ex.: rolar a prateleira)
    if (drag.fly === 0) drag.on = false;
    ptr.down = false;
    ball.held = false;
    return;
  }
  if (drag.on && drag.fly === 0 && e.pointerId === ptr.id) {
    const [x, y] = local(e);
    ptr.down = false;
    const tapOnly = ptr.moved === 0 || Math.hypot(e.clientX - drag.fx, e.clientY - drag.fy) < 12;
    dropFood(tapOnly ? x : drag.x, tapOnly ? y : drag.y, tapOnly);
    return;
  }
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  if (ball.held) {
    ball.held = false;
    const quick = performance.now() - ptr.t0 < 220 && ptr.moved < 10;
    if (quick) kickBall((L.cx > ball.x ? 1 : -1) * (200 + Math.random() * 250), -1150);
    else kickBall(Math.max(-1800, Math.min(1800, ptr.vx)), Math.max(-2000, Math.min(600, ptr.vy)));
    return;
  }
  if (trySwipe(e)) return;
  if (ptr.moved < 10 && ptr.onPet && !(room === 'bath' && stage !== 'done')) boop();
}

/** Troca de cômodo só com um "peteleco" rápido e decidido, começando longe do
 *  bichinho, e nunca no meio do banho (esfregar não pode trocar de cômodo). */
function trySwipe(e: PointerEvent): boolean {
  if (ptr.onPet) return false;
  if (room === 'bath' && stage !== 'done') return false;
  const [x, y] = local(e);
  const ddx = x - ptr.sx;
  const ddy = y - ptr.sy;
  const ms = performance.now() - ptr.t0;
  const fast = Math.abs(ddx) / Math.max(1, ms) > 0.6; // px/ms
  if (ms > 450 || Math.abs(ddx) < Math.min(140, L.W * 0.3) || Math.abs(ddx) < 2.5 * Math.abs(ddy) || !fast) return false;
  const i = ROOMS.indexOf(room) + (ddx < 0 ? 1 : -1);
  if (i < 0 || i >= ROOMS.length) return false;
  ptr.swipe = true;
  setRoom(ROOMS[i], true);
  tap('light');
  return true;
}

/* ============================================================
 *  FALA (microfone)
 * ============================================================ */

function micSvg(): string {
  return `<svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true"><g stroke="#2a0b5c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="16" y="5" width="16" height="25" rx="8" fill="#ff7ab8"/><path d="M10 22Q10 36 24 36Q38 36 38 22" fill="none"/><path d="M24 36V43M16 43H32" fill="none"/></g>
    <rect x="19.5" y="9" width="3.5" height="10" rx="1.75" fill="#fff" opacity=".7"/></svg>`;
}

function onVoice(st: VoiceState): void {
  if (!root) return;
  const b = $('.pet-mic');
  b.dataset.st = st;
  b.querySelector('span')!.textContent = st === 'off' ? t('pet.voice.btn', 'Falar') : t('pet.voice.stop', 'Parar');
  if (st === 'listening') say(true, t('pet.voice.listen', 'Fala alguma coisa! Tô ouvindo...'));
  else if (st === 'capturing' || st === 'playing') {
    $('.pet-say').classList.remove('show');
    sayT = 0;
    sayCd = 30;
  }
}

async function onMicButton(): Promise<void> {
  audio.unlock();
  sfx.click();
  tap('light');
  if (voiceState() !== 'off') {
    stopVoice();
    say(true, t('pet.voice.bye', 'Foi divertido conversar!'));
    return;
  }
  if (!voiceSupported()) {
    toast(t('pet.voice.unsupported', 'Aqui não dá para usar o microfone. No app do celular funciona!'), 'sound');
    return;
  }
  if (!pet().voiceAsked || !petVoiceEnabled()) {
    askVoice();
    return;
  }
  await beginVoice();
}

async function beginVoice(): Promise<void> {
  if (room === 'bed' && !lampOn) toggleLamp();
  const err = await startVoice(() => isOpen);
  if (err === 'denied') toast(t('pet.voice.denied', 'Sem permissão do microfone. Dá para liberar nas configurações do aparelho.'), 'warning');
  else if (err === 'nosound') toast(t('pet.voice.nosound', 'Ligue o som do jogo para ouvir a vozinha!'), 'sound');
  else if (err) toast(t('pet.voice.failed', 'Não consegui abrir o microfone agora.'), 'warning');
}

function askVoice(): void {
  const m = $('.pet-vask');
  const on = petVoiceEnabled();
  m.querySelector('.pet-card')!.innerHTML = `
    <div class="pet-ask-ico">${micSvg().replace('width="30" height="30"', 'width="64" height="64"')}</div>
    <h3>${esc(t('pet.voice.askTitle', 'Vamos conversar?'))}</h3>
    <p>${esc(t('pet.voice.askText', 'Fale perto do celular e seu bichinho repete com uma vozinha engraçada! Para isso ele precisa usar o microfone.'))}</p>
    <p class="pet-priv">${icon('shield', { size: 22 })}<span>${esc(t('pet.voice.privacy', 'Sua voz fica só na memória do aparelho: não é gravada, guardada nem enviada para ninguém. O microfone só fica ligado enquanto o botão Falar está ativo.'))}</span></p>
    <label class="pet-switch"><input type="checkbox" ${on ? 'checked' : ''}><i></i><span>${esc(t('pet.voice.setting', 'Bichinho repete o que você fala'))}</span></label>
    <div class="pet-row"><button class="pet-btn pet-no">${esc(t('pet.voice.no', 'Agora não'))}</button>
    <button class="pet-btn pet-big pet-yes">${icon('check', { size: 22 })}${esc(t('pet.voice.yes', 'Vamos!'))}</button></div>`;
  m.classList.add('on');
  const cb = m.querySelector<HTMLInputElement>('input')!;
  m.querySelector('.pet-no')!.addEventListener('click', () => {
    pet().voiceAsked = true;
    setPetVoiceEnabled(cb.checked);
    m.classList.remove('on');
  });
  m.querySelector('.pet-yes')!.addEventListener('click', () => {
    pet().voiceAsked = true;
    m.classList.remove('on');
    setPetVoiceEnabled(true);
    void beginVoice();
  });
}

function boop(): void {
  if (room === 'bed' && !lampOn) {
    squashV += 2;
    fx.emit(PK.Zzz, L.cx + L.R * 0.6, L.cy - L.R * 0.8, 20, -50, 1.5, 22, 6);
    return;
  }
  squashV -= 5;
  hopPhase = 0.001;
  if (voiceState() !== 'playing') Math.random() < 0.6 ? sfx.chirp() : sfx.giggle();
  tap('light');
  happyT = Math.max(happyT, 0.9);
  fx.emit(PK.Heart, L.cx, L.cy - L.R * 1.1, (Math.random() - 0.5) * 80, -140, 1.2, 10, 4);
  played(1);
}

function tickle(dist: number): void {
  tickleN += dist;
  tiltV += (Math.random() - 0.5) * 0.6;
  happyT = Math.max(happyT, 0.6);
  if (giggleCd <= 0) {
    giggleCd = 0.35;
    sfx.giggle();
    tap('light');
    fx.emit(PK.Heart, ptr.x, ptr.y - 10, (Math.random() - 0.5) * 120, -120 - Math.random() * 60, 1.1, 8 + Math.random() * 4, 4);
  }
  if (tickleN > 160) {
    tickleN = 0;
    played(1.5, 1);
  }
}

/* ============================================================
 *  LAÇO
 * ============================================================ */

function loop(ts: number): void {
  if (!isOpen) return;
  raf = requestAnimationFrame(loop);
  if (fps30) {
    frameSkip = !frameSkip;
    if (frameSkip) return;
  }
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  update(dt);
  render();
}

function update(dt: number): void {
  v.t += dt;
  tickAcc += dt;
  if (tickAcc > 5) {
    tickAcc = 0;
    tick();
  }
  const p = pet();
  v.m = mood();
  if (happyT > 0) {
    happyT -= dt;
    v.m.happy = true;
    v.m.sad = false;
  }
  if (slideT < 1) slideT = Math.min(1, slideT + dt / 0.32);
  giggleCd -= dt;
  v.sleeping = room === 'bed' && !lampOn;
  if (v.sleeping) {
    sleepAcc += dt;
    if (sleepAcc >= 1) {
      sleepTick(sleepAcc);
      sleepAcc = 0;
    }
  }

  // ---------- pose ----------
  const pose = v.pose;
  pose.t = v.t;
  blinkT -= dt;
  if (blinkT < -0.13) blinkT = 1.8 + Math.random() * 2.6;
  let blink = blinkT < 0 ? 1 : 0;
  if (v.m.tired) blink = Math.max(blink, 0.45);
  // olhar
  let tx = Math.sin(v.t * 0.5) * 0.4;
  let ty = 0.1;
  if (drag.on) {
    tx = (drag.x - L.cx) / (L.R * 2);
    ty = (drag.y - L.cy) / (L.R * 2);
  } else if (room === 'play' && !ball.rest) {
    tx = (ball.x - L.cx) / (L.R * 2);
    ty = (ball.y - L.cy) / (L.R * 2);
  } else if (ptr.down) {
    tx = (ptr.x - L.cx) / (L.R * 2);
    ty = (ptr.y - L.cy) / (L.R * 2);
  } else if (v.m.sad) ty = 0.7;
  pose.lookX += (Math.max(-1, Math.min(1, tx)) - pose.lookX) * Math.min(1, dt * 8);
  pose.lookY += (Math.max(-1, Math.min(1, ty)) - pose.lookY) * Math.min(1, dt * 8);

  // bocejo
  yawnCd -= dt;
  if (v.m.tired && !v.sleeping && yawnCd <= 0 && yawnT <= 0 && chewT <= 0) {
    yawnT = 1.3;
    yawnCd = 7 + Math.random() * 4;
    sfx.yawn();
  }
  if (yawnT > 0) yawnT -= dt;
  // ronco da barriga
  rumbleCd -= dt;
  if (v.m.hungry && rumbleCd <= 0 && chewT <= 0) {
    rumbleT = 0.7;
    rumbleCd = 5 + Math.random() * 3;
    if (!v.sleeping) sfx.rumble();
  }
  if (rumbleT > 0) rumbleT -= dt;
  v.rumble = rumbleT > 0 ? Math.sin((rumbleT / 0.7) * Math.PI) : 0;

  const [mx, my] = mouthPos(L, v);
  const foodNear = drag.on && Math.hypot(drag.x - mx, drag.y - my) < L.R * 1.8;
  let m: typeof pose.mood = 'idle';
  if (v.m.happy && !v.sleeping) m = 'happy';
  if (foodNear || mouthOpenT > 0 || (yawnT > 0 && yawnT < 1.1)) m = 'fly';
  if (chewT > 0) m = mouthOpenT > 0 ? 'fly' : 'happy';
  if (yawnT > 0 && yawnT < 1.1) blink = Math.max(blink, 0.75);
  if (v.sleeping) {
    blink = 1;
    m = 'idle';
  }
  // fala: escuta (mão na orelha) e repete com a boca no ritmo do áudio
  pollVoice();
  const vs = voiceState();
  const listening = vs === 'listening' || vs === 'capturing';
  v.listen += ((listening ? 1 : 0) - v.listen) * Math.min(1, dt * 10);
  v.mic += (voiceMicLevel() - v.mic) * Math.min(1, dt * 15);
  if (listening) {
    pose.lookX += (0.8 - pose.lookX) * Math.min(1, dt * 6);
    v.tilt += (0.12 - v.tilt) * Math.min(1, dt * 6);
    m = 'idle';
    blink = Math.min(blink, 0.2);
  }
  if (vs === 'playing') {
    const lv = voiceOutLevel();
    m = lv > 0.12 ? 'fly' : 'happy';
    squashV -= lv * 1.5;
    v.tilt += (Math.sin(v.t * 9) * 0.06 * lv - v.tilt) * Math.min(1, dt * 12);
    blink = 0;
  }
  pose.mood = m;
  pose.blink = blink;
  v.drool = v.m.hungry || foodNear ? Math.min(1, v.drool + dt * 2) : Math.max(0, v.drool - dt * 3);
  v.thinkFood = v.m.hungry && !drag.on && chewT <= 0 && !v.sleeping ? (Math.floor(v.t / 4) % 2 ? 'cake' : 'apple') : null;

  // pulinhos quando feliz
  if (v.m.happy && !v.sleeping) {
    hopPhase += dt * 3.2;
    if (hopPhase > Math.PI * 1.6) hopPhase = 0;
  } else if (hopPhase > 0) {
    hopPhase += dt * 4;
    if (hopPhase > Math.PI) hopPhase = 0;
  }
  const hopK = hopPhase > 0 && hopPhase < Math.PI ? Math.sin(hopPhase) : 0;
  v.hop = hopK * L.R * (v.m.weak ? 0.06 : 0.16);
  if (hopPhase > 0 && hopPhase < 0.12) squashV += 0.4;

  // mola squash & stretch
  squashV += -squash * 180 * dt - squashV * 10 * dt;
  squash += squashV * dt;
  const sadK = v.m.sad || v.m.weak ? 0.04 : 0;
  const sleepK = v.sleeping ? Math.sin(v.t * 1.4) * 0.03 : 0;
  v.sx = 1 + squash * 0.06 + sadK * 0.5 + sleepK;
  v.sy = 1 - squash * 0.06 - sadK - sleepK + hopK * 0.04;
  tiltV += (-v.tilt * 60 - tiltV * 6) * dt;
  v.tilt += tiltV * dt;
  if (v.m.sad && !v.sleeping) v.tilt += (Math.sin(v.t * 0.8) * 0.04 - v.tilt) * dt;

  // ---------- partículas de estado ----------
  if (v.m.sad && !v.sleeping && pose.mood !== 'happy') {
    tearCd -= dt;
    if (tearCd <= 0) {
      tearCd = 0.8 + Math.random() * 0.6;
      const s = Math.random() < 0.5 ? -1 : 1;
      fx.emit(PK.Tear, L.cx + s * L.R * 0.4 * v.sx, L.cy - v.hop + L.R * 0.08, s * 40, -30, 1.3, L.R * 0.075, 3);
    }
  }
  if (v.m.happy && !v.sleeping) {
    sparkCd -= dt;
    if (sparkCd <= 0) {
      sparkCd = hiFx ? 0.25 : 0.5;
      const a = Math.random() * Math.PI * 2;
      fx.emit(PK.Sparkle, L.cx + Math.cos(a) * L.R * 1.3, L.cy - v.hop + Math.sin(a) * L.R * 1.1, 0, -20, 0.9, 6 + Math.random() * 6, Math.random() < 0.5 ? 5 : 0);
    }
  }
  if (v.sleeping) {
    zzzCd -= dt;
    if (zzzCd <= 0) {
      zzzCd = 1.1;
      fx.emit(PK.Zzz, L.cx + L.R * 0.55, L.cy - L.R * 0.75, 30, -60, 2.2, L.R * 0.3, 6);
    }
  }
  if (room !== 'bath') spotAlphaFromClean(p.clean, v.spotA);
  if (room === 'kitchen') updateKitchen(dt);
  else if (room === 'bath') updateBath(dt);
  else if (room === 'play') updateBall(dt);
  fx.update(dt);
  if (room === 'bath' && stage !== 'done' && root) {
    const bar = root.querySelector<HTMLElement>('.pet-prog i');
    if (bar) bar.style.width = `${Math.round(bathProgress() * 100)}%`;
  }

  // balão de fala
  if (sayT > 0) {
    sayT -= dt;
    if (sayT <= 0) $('.pet-say').classList.remove('show');
  } else if (!v.sleeping) {
    sayCd -= dt;
    if (sayCd <= 0) say(true);
  }
  mouthOpenT = Math.max(0, mouthOpenT - dt);
  if (voiceState() === 'playing') v.hop += voiceOutLevel() * L.R * 0.06;
}

let moonGlow: CanvasGradient | null = null;
let moonR = 0;

function render(): void {
  const c = ctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // fundo (desliza entre cômodos)
  const dec = pet().decor;
  if (slideT < 1 && prevRoom) {
    const e = 1 - Math.pow(1 - slideT, 3);
    const off = e * L.W * slideDir;
    c.drawImage(roomBg(prevRoom, L, dec, dpr), -off, 0, L.W, L.H);
    c.drawImage(roomBg(room, L, dec, dpr), L.W * slideDir - off, 0, L.W, L.H);
  } else c.drawImage(roomBg(room, L, dec, dpr), 0, 0, L.W, L.H);

  if (room === 'bed') drawLamp(c, L, lampOn, hiFx);
  if (room === 'play') drawBall(c);

  drawPet(c, skinById(save.skin), L, v, hiFx);

  if (room === 'bath') drawTubFront(c, L, v.t);
  if (room === 'kitchen') {
    if (chewFood && chewT > 0) {
      const [mx, my] = mouthPos(L, v);
      drawFood(c, chewFood.shape, mx, my + L.R * 0.12, L.R * 0.5 * (1 - chewBites * 0.22), chewBites);
    } else if (drag.on) {
      const f = FOODS.find((x) => x.id === drag.id);
      if (f) drawFood(c, f.shape, drag.x, drag.y, L.R * 0.62);
    }
  }
  fx.draw(c);
  if (room === 'bath') drawBathTool(c);

  // noite: escurece tudo e acende estrelinhas
  if (v.sleeping) {
    c.fillStyle = 'rgba(14,8,48,0.62)';
    c.fillRect(0, 0, L.W, L.H);
    c.fillStyle = '#fff6b0';
    for (let i = 0; i < 18; i++) {
      const k = Math.sin(v.t * 1.5 + i * 2.1);
      if (k < 0) continue;
      sparkle(c, (i * 89.7) % L.W, ((i * 47.3) % (L.floorY * 0.75)) + 70, 2 + k * 4);
    }
    // luz de lua suave sobre o bichinho (gradiente cacheado por tamanho)
    if (hiFx) {
      if (!moonGlow || moonR !== L.R) {
        moonR = L.R;
        moonGlow = c.createRadialGradient(0, 0, L.R * 0.3, 0, 0, L.R * 1.8);
        moonGlow.addColorStop(0, 'rgba(255,230,160,0.22)');
        moonGlow.addColorStop(1, 'rgba(255,230,160,0)');
      }
      c.save();
      c.translate(L.cx, L.cy);
      c.fillStyle = moonGlow;
      c.fillRect(-L.R * 1.8, -L.R * 1.8, L.R * 3.6, L.R * 3.6);
      c.restore();
    }
    fx.draw(c);
  }
}

/* ============================================================
 *  NOTIFICAÇÕES — pedido educado
 * ============================================================ */

function askNotif(): void {
  const m = $('.pet-ask');
  m.querySelector('.pet-card')!.innerHTML = `
    <div class="pet-ask-ico">${icon('mail', { size: 64 })}</div>
    <h3>${esc(t('pet.notif.askTitle', 'Posso te chamar?'))}</h3>
    <p>${esc(t('pet.notif.askText', 'Quando eu ficar com fome, sujinho ou com saudade, eu mando um lembrete. No máximo 2 por dia, e nunca à noite!'))}</p>
    <div class="pet-row"><button class="pet-btn pet-no">${esc(t('pet.notif.no', 'Agora não'))}</button>
    <button class="pet-btn pet-big pet-yes">${icon('check', { size: 22 })}${esc(t('pet.notif.yes', 'Pode sim!'))}</button></div>`;
  m.classList.add('on');
  m.querySelector('.pet-no')!.addEventListener('click', () => {
    pet().notifAsked = true;
    persist();
    m.classList.remove('on');
  });
  m.querySelector('.pet-yes')!.addEventListener('click', async () => {
    m.classList.remove('on');
    const ok = await requestNotifPermission();
    if (ok) toast(t('pet.notif.ok', 'Combinado! Eu te aviso.'), 'check');
  });
}

/* ============================================================
 *  LOJA DE DECORAÇÃO
 * ============================================================ */

let decorTab: DecorKind = 'wall';

function decorState(d: DecorDef): 'equipped' | 'owned' | 'level' | 'buy' | 'ad' {
  const p = pet();
  const owned = p.owned.includes(d.id) || (d.level !== undefined && Math.max(p.bestLevel, levelInfo().level) >= d.level) || (!d.coins && !d.gems && !d.ads && d.level === undefined);
  if (owned) {
    const on = d.kind === 'wall' ? p.decor.wall === d.id : d.kind === 'floor' ? p.decor.floor === d.id : p.decor.items.includes(d.id);
    return on ? 'equipped' : 'owned';
  }
  if (d.level !== undefined) return 'level';
  return d.ads ? 'ad' : 'buy';
}

function openDecor(kind: DecorKind): void {
  decorTab = kind;
  const m = $('.pet-decor');
  const card = m.querySelector('.pet-card')!;
  const tabs: [DecorKind, string][] = [
    ['wall', t('pet.decor.walls', 'Paredes')],
    ['floor', t('pet.decor.floors', 'Pisos')],
    ['item', t('pet.decor.items', 'Enfeites')],
  ];
  card.innerHTML = `<div class="pet-decor-top"><h3>${icon('paint', { size: 28 })}${esc(t('pet.decorate', 'Decorar'))}</h3>
    <button class="pet-btn pet-x">${icon('close', { size: 22 })}</button></div>
    <div class="pet-seg">${tabs.map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
    <div class="pet-grid">${DECOR.filter((d) => d.kind === kind)
      .map((d) => {
        const st = decorState(d);
        const p = pet();
        const label =
          st === 'equipped'
            ? d.kind === 'item'
              ? t('pet.decor.remove', 'Tirar')
              : t('pet.decor.using', 'Em uso')
            : st === 'owned'
              ? d.kind === 'item'
                ? t('pet.decor.place', 'Colocar')
                : t('pet.decor.use', 'Usar')
              : st === 'level'
                ? t('pet.decor.lvl', 'Nível {n}', { n: d.level ?? 0 })
                : st === 'ad'
                  ? `${icon('video', { size: 18 })} ${p.adViews[d.id] ?? 0}/${d.ads}`
                  : d.coins
                    ? COIN + fmt(d.coins)
                    : GEM + fmt(d.gems ?? 0);
        const [a, b, e] = d.colors;
        return `<div class="pet-dc ${st}" data-id="${d.id}">
          <div class="pet-sw" style="--a:${a};--b:${b};--e:${e}" data-kind="${d.kind}">${st === 'level' ? icon('lock', { size: 26 }) : ''}</div>
          <span>${esc(d.name())}</span><button class="pet-btn">${st === 'level' || st === 'ad' || st === 'buy' ? label : esc(label)}</button></div>`;
      })
      .join('')}</div>`;
  m.classList.add('on');
  card.querySelector('.pet-x')!.addEventListener('click', () => m.classList.remove('on'));
  m.onclick = (e) => {
    if (e.target === m) m.classList.remove('on');
  };
  card.querySelectorAll<HTMLElement>('.pet-seg button').forEach((b) => b.addEventListener('click', () => openDecor(b.dataset.k as DecorKind)));
  card.querySelectorAll<HTMLElement>('.pet-dc').forEach((el) => el.querySelector('button')!.addEventListener('click', () => decorAction(decorById(el.dataset.id!)!)));
}

async function decorAction(d: DecorDef): Promise<void> {
  const p = pet();
  const st = decorState(d);
  sfx.click();
  if (st === 'level') {
    toast(t('pet.decor.needLvl', 'Cuide do seu bichinho até o nível {n} para ganhar!', { n: d.level ?? 0 }), 'lock');
    return;
  }
  if (st === 'buy') {
    if (d.coins ? save.coins < d.coins : save.gems < (d.gems ?? 0)) {
      toast(d.coins ? t('pet.noMoney', 'Moedas insuficientes. Jogue um minigame para ganhar mais!') : t('pet.noGems', 'Gemas insuficientes.'), d.coins ? 'coin' : 'gem');
      return;
    }
    if (d.coins) addCoins(-d.coins);
    else addGems(-(d.gems ?? 0));
    p.owned.push(d.id);
    sfx.coin();
    success();
  } else if (st === 'ad') {
    if (!rewardedAvailable()) {
      toast(t('pet.noAd', 'Nenhum vídeo disponível agora. Tente mais tarde!'), 'video');
      return;
    }
    const ok = await showRewarded();
    if (!ok) return;
    p.adViews[d.id] = (p.adViews[d.id] ?? 0) + 1;
    if (p.adViews[d.id] < (d.ads ?? 1)) {
      persist();
      openDecor(decorTab);
      return;
    }
    p.owned.push(d.id);
    success();
  }
  // equipar/alternar
  if (d.kind === 'wall') p.decor.wall = d.id;
  else if (d.kind === 'floor') p.decor.floor = d.id;
  else {
    const i = p.decor.items.indexOf(d.id);
    if (i >= 0) p.decor.items.splice(i, 1);
    else p.decor.items.push(d.id);
  }
  persist();
  bus.emit('pet');
  tap('light');
  openDecor(decorTab);
}

/* utilitário para a página de testes */
export const __petDebug = {
  setRoom: (r: Room) => setRoom(r, false),
  view: v,
  fx,
  forceStage(s: BathStage): void {
    while (STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(s)) nextStage();
  },
  rub(x: number, y: number, d: number) {
    ptr.down = true;
    ptr.x = x;
    ptr.y = y;
    bathRub(x, y, d);
  },
  release() {
    ptr.down = false;
  },
  feed(id: string) {
    drag.id = id;
    drag.on = true;
    drag.fly = 0.35;
    drag.x = L.W / 2;
    drag.y = L.H * 0.85;
  },
  mic: onMicButton,
  hold(id: string, x: number, y: number) {
    drag.id = id;
    drag.on = true;
    drag.fly = 0;
    drag.x = x;
    drag.y = y;
  },
  lamp: toggleLamp,
  kick: () => kickBall(-300, -1100),
  layout: () => L,
  health,
  cheer,
};
