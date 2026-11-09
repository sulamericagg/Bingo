/* ============================================================
 *  TELA DO PASSE ESTELAR (carregada sob demanda por register.ts)
 *  Abas: Recompensas (cartelas de 10) · Desafios · Histórico · Clube
 *  Tematizada pela paleta da temporada (CSS vars --s-bg/--s-a/--s-b).
 * ============================================================ */
import { pushBack } from '../core/back';
import './pass.css';
import { AD_FREE, CLUB, PASS } from '../config';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { detectInitialTier } from '../core/quality';
import { save, type PassSeasonSave } from '../core/storage';
import { SEASONS, seasonTheme, type SeasonInfo } from '../creatures/seasons';
import type { AvatarData } from '../game/avatar';
import { renderAvatarPreview } from '../game/preview';
import { fmt, t } from '../i18n';
import { adFreeMeter, clubActive, watchForAdFree } from '../services/ads';
import { buyClub, clubPriceString, manageClub } from '../services/billing';
import { icon } from '../ui/icons';
import { drawSeasonArt, mixHex } from './art';
import { homeItem, homePassSeason } from './home/catalog';
import { bundleAvailable, bundleSavings, buyMonthBundle } from './bundle';
import { equipAura, equipDance, equippedAura, equippedDance } from './equip';
import {
  buyMusicPremium,
  musicCanClaim,
  musicClaim,
  musicClaimAll,
  musicClaimableCount,
  musicClaimed,
  musicHistory,
  musicLevel,
  musicLevels,
  musicLevelXp,
  musicPremium,
  musicRewardById,
  musicSkip,
  musicWeekly,
  ownsMusicItem,
  startMusicPass,
} from './mstate';
import { drawAura, ensureMusicPassRegistered, highwaySkin, instSkin, playDance, applyDancePose, drawDanceArms, drawDanceFx, stageVariant } from './music/index';
import { musicThemeName, seasonMusicText } from '../music/season-music-data';
import { drawPlayer } from '../game/character';
import { skinById } from '../game/skins';
import { drawHomeItem, drawHomeSeasonArt } from './home/draw';
import {
  buyHomePremium,
  ensureHomeSeason,
  homeCanClaim,
  homeClaim,
  homeClaimAll,
  homeClaimableCount,
  homeClaimed,
  homeHistory,
  homeLevel,
  homeLevelXp,
  homePremium,
  homeSkip,
  homeWeekly,
} from './home/state';
import { creatureId, passSeason, rarityLabel, type PassLevel, type PassRarity, type Reward } from './catalog';
import { bannerCss, drawPassEmote, frameCss } from './cosmetics';
import { creatureIcon, loadSeasonCreatureNames } from './creatures-bridge';
import { passIcon, type PassIcon } from './icons';
import { playingTrack, previewTrack, stopTrack } from './music';
import {
  buyPremium,
  canClaim,
  claim,
  claimAll,
  claimableCount,
  claimClubDaily,
  claimed,
  clubDailyAvailable,
  ensureSeason,
  hasItem,
  historyEntries,
  isPremium,
  levelXp,
  milestones,
  passLevel,
  seasonLeftMs,
  skipLevels,
  upcomingSeason,
  weekly,
  type Track,
} from './state';
import { weekEnds } from './challenges';

export const RARITY_COLOR: Record<PassRarity, string> = {
  common: '#b8c4d9',
  medio: '#5ef08a',
  rare: '#4fc3ff',
  epic: '#c77dff',
  legendary: '#ffcf2e',
};

type Tab = 'rewards' | 'weekly' | 'history' | 'club';

let root: HTMLElement | null = null;
let tab: Tab = 'rewards';
let page = 0;
let sel: { L: PassLevel; track: Track } | null = null;
let raf = 0;
let offs: (() => void)[] = [];

/* ---------------- os dois passes do mês: mesmo motor de tela ---------------- */
type PassMode = 'star' | 'home' | 'music';
let mode: PassMode = 'star';
interface Model {
  levels(i: number): PassLevel[];
  level(): number;
  levelXp(): number;
  premium(): boolean;
  canClaim(L: PassLevel, tr: Track): boolean;
  claim(L: PassLevel, tr: Track): Reward | null;
  claimAll(): Reward[];
  claimable(): number;
  claimed(lv: number, tr: Track): boolean;
  skip(): 'ok' | 'gems' | 'max';
  skipGems: number;
  price: number;
  weekly(): { def: { text: string; target: number; xp: number; game?: string }; progress: number; done: boolean }[];
  milestones(): { def: { text: string; target: number; xp: number }; progress: number; done: boolean }[];
  history(): { info: SeasonInfo; save: PassSeasonSave }[];
  items(i: number): { level: number; track: Track; r: Reward }[];
  art(x: CanvasRenderingContext2D, w: number, h: number, s: SeasonInfo, t: number): void;
  /** destaques (histórico) */
  star(it: { level: number; track: Track; r: Reward }): boolean;
}
const itemsOf = (levels: PassLevel[]) => levels.flatMap((L) => [...(L.free ? [{ level: L.level, track: 'free' as Track, r: L.free }] : []), { level: L.level, track: 'prem' as Track, r: L.prem }]);
const STAR: Model = {
  levels: (i) => passSeason(i).levels,
  level: () => passLevel(),
  levelXp: () => levelXp(),
  premium: () => isPremium(),
  canClaim,
  claim,
  claimAll,
  claimable: () => claimableCount() - (clubDailyAvailable() ? 1 : 0),
  claimed: (lv, tr) => claimed(lv, tr),
  skip: () => skipLevels(1),
  skipGems: PASS.skipGems,
  price: PASS.priceGems,
  weekly,
  milestones,
  history: historyEntries,
  items: (i) => itemsOf(passSeason(i).levels),
  art: drawSeasonArt,
  star: (it) => it.r.kind === 'creature' || (it.track === 'free' && it.level === 1),
};
const HOME: Model = {
  levels: (i) => homePassSeason(i).levels,
  level: () => homeLevel(),
  levelXp: () => homeLevelXp(),
  premium: () => homePremium(),
  canClaim: homeCanClaim,
  claim: homeClaim,
  claimAll: homeClaimAll,
  claimable: homeClaimableCount,
  claimed: (lv, tr) => homeClaimed(lv, tr),
  skip: () => homeSkip(1),
  skipGems: PASS.homeSkipGems,
  price: PASS.homePriceGems,
  weekly: homeWeekly,
  milestones: () => [],
  history: homeHistory,
  items: (i) => itemsOf(homePassSeason(i).levels),
  art: drawHomeSeasonArt,
  star: (it) => it.track === 'prem' && (it.level === 1 || it.level % 10 === 0),
};
const MUSIC: Model = {
  levels: (i) => musicLevels(i),
  level: () => musicLevel(),
  levelXp: () => musicLevelXp(),
  premium: () => musicPremium(),
  canClaim: musicCanClaim,
  claim: musicClaim,
  claimAll: musicClaimAll,
  claimable: musicClaimableCount,
  claimed: (lv, tr) => musicClaimed(lv, tr),
  skip: () => musicSkip(1),
  skipGems: PASS.musicSkipGems,
  price: PASS.musicPriceGems,
  weekly: musicWeekly,
  milestones: () => [],
  history: musicHistory,
  items: (i) => itemsOf(musicLevels(i)),
  art: drawMusicSeasonArt,
  star: (it) => it.track === 'prem' && (it.level === 1 || it.level % 10 === 0),
};
let M: Model = STAR;
function setMode(m: PassMode): void {
  mode = m;
  M = m === 'home' ? HOME : m === 'music' ? MUSIC : STAR;
  if (m === 'music') {
    ensureMusicPassRegistered();
    startMusicPass();
  }
  page = Math.min(4, Math.floor((M.level() - 1) / 10));
  sel = null;
}
const animated: { c: HTMLCanvasElement; draw: (time: number) => void }[] = [];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/* ---------------- utilidades ---------------- */

export function durText(ms: number): string {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const hh = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return t('pass.dur.dh', '{d}d {h}h', { d, h: hh });
  if (hh > 0) return t('pass.dur.hm', '{h}h {m}min', { h: hh, m: mm });
  return t('pass.dur.m', '{m} min', { m: Math.max(1, mm) });
}

function toast(msg: string, ic = 'check'): void {
  const el = h('div', 'pass-toast', `${icon(ic as any, { size: 22 })}<span>${msg}</span>`);
  (root ?? document.body).appendChild(el);
  setTimeout(() => el.classList.add('out'), 1900);
  setTimeout(() => el.remove(), 2300);
}

const CUTE_BASE = (): AvatarData => ({
  parts: { body: 'b_round', material: 'm_soft', pattern: 'p_none', eyes: 'e_cute', mouth: 'mo_smile', head: 'h_none', face: 'f_none', back: 'k_none', aura: 'a_none' },
  colors: { primary: '#ffc2dc', secondary: '#c2e8ff' },
});

const KIND_ICON: Partial<Record<Reward['kind'], PassIcon>> = { eyes: 'p-eyes', mouth: 'p-mouth', aura: 'p-aura', emote: 'p-emote', music: 'p-music', frame: 'p-frame', banner: 'p-banner', creature: 'p-paw' };

export function kindLabel(k: Reward['kind']): string {
  switch (k) {
    case 'creature':
      return t('pass.k.creature', 'Bichinho');
    case 'eyes':
      return t('pass.k.eyes', 'Olhos');
    case 'mouth':
      return t('pass.k.mouth', 'Boca');
    case 'aura':
      return t('pass.k.aura', 'Efeito');
    case 'emote':
      return t('pass.k.emote', 'Dancinha');
    case 'music':
      return t('pass.k.music', 'Música');
    case 'frame':
      return t('pass.k.frame', 'Moldura');
    case 'banner':
      return t('pass.k.banner', 'Faixa de perfil');
    case 'gems':
      return t('pass.k.gems', 'Gemas');
    case 'coins':
      return t('pass.k.coins', 'Moedas');
    case 'tickets':
      return t('pass.k.tickets', 'Ingressos');
    case 'home':
      return t('pass.k.home', 'Casa');
    case 'mpass':
      return t('pass.k.mpass', 'Musical');
  }
}

/** Visual de uma recompensa (card ou detalhe). `live` = anima no loop do painel. */
function rewardVisual(r: Reward, px: number, s: SeasonInfo, live = false): HTMLElement {
  const wrap = h('div', 'pv');
  wrap.style.width = wrap.style.height = px + 'px';
  switch (r.kind) {
    case 'creature': {
      wrap.innerHTML = passIcon('p-paw', px * 0.6);
      creatureIcon(r.id, px, s.palette, r.rarity).then((el) => {
        wrap.innerHTML = '';
        wrap.appendChild(el);
      });
      break;
    }
    case 'eyes':
    case 'mouth':
    case 'aura': {
      const av = CUTE_BASE();
      av.parts[r.kind] = r.id;
      // cards pequenos: zoom no rosto; detalhe: corpo inteiro
      const small = px < 80;
      const zoom = r.kind === 'aura' ? (small ? 1.05 : 0.85) : small ? 2.1 : 1.3;
      const focusY = r.kind === 'aura' ? 0 : small ? (r.kind === 'eyes' ? -0.02 : 0.3) : 0.05;
      const c = renderAvatarPreview(av, px, 0.6, { zoom, focusY });
      wrap.appendChild(c);
      if (live) animated.push({ c, draw: (time) => renderAvatarPreview(av, px, time, { zoom, target: c, focusY }) });
      break;
    }
    case 'emote': {
      const c = h('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.height = Math.round(px * dpr);
      c.style.width = c.style.height = px + 'px';
      const x = c.getContext('2d')!;
      const draw = (time: number) => {
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, px, px);
        drawPassEmote(x, r.id, px / 2, px * 0.92, px * 0.62, time);
      };
      draw(0.35);
      wrap.appendChild(c);
      if (live) animated.push({ c, draw });
      break;
    }
    case 'frame': {
      const ring = h('div', 'pv-frame');
      ring.style.background = frameCss(r.id);
      ring.innerHTML = `<div class="pv-frame-in">${icon('user', { size: px * 0.45 })}</div>`;
      wrap.appendChild(ring);
      break;
    }
    case 'banner': {
      const b = h('div', 'pv-banner');
      b.style.background = bannerCss(r.id);
      b.innerHTML = passIcon('p-pass', px * 0.4);
      wrap.appendChild(b);
      break;
    }
    case 'mpass': {
      wrap.appendChild(musicVisual(r, px, s, live));
      break;
    }
    case 'home': {
      const it = homeItem(r.id);
      if (!it) break;
      const c = h('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.height = Math.round(px * dpr);
      c.style.width = c.style.height = px + 'px';
      const x = c.getContext('2d')!;
      const draw = (time: number) => {
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, px, px);
        drawHomeItem(x, it, px, time);
      };
      draw(0.5);
      wrap.appendChild(c);
      if (live) animated.push({ c, draw });
      break;
    }
    case 'gems':
      wrap.innerHTML = icon(r.amount >= 100 ? 'gem-pile' : 'gem', { size: px * 0.8 });
      break;
    case 'coins':
      wrap.innerHTML = icon('coins', { size: px * 0.8 });
      break;
    case 'tickets':
      wrap.innerHTML = icon('ticket', { size: px * 0.8 });
      break;
    default:
      wrap.innerHTML = passIcon(KIND_ICON[r.kind] ?? 'p-pass', px * 0.75);
  }
  return wrap;
}

/* ---------------- Passe Musical: prévias ---------------- */

/** título + banda de uma música do passe ('sNN-k' / 'sNN-mega') */
function songInfo(id: string): { title: string; band: string } {
  const m = /^s(\d\d)-(\w+)$/.exec(id);
  if (!m) return { title: id, band: '' };
  const tx = seasonMusicText(Number(m[1]));
  if (m[2] === 'mega') return { title: tx.megaTitle, band: tx.megaBand };
  const k = Number(m[2]) - 1;
  return { title: tx.titles[k] ?? id, band: tx.bands[k] ?? '' };
}

let songPreviewId = '';
let songStop: (() => void) | null = null;
/** prévia de ~15 s da música do passe (carrega o sintetizador só aqui) */
function toggleSongPreview(id: string): void {
  songStop?.();
  songStop = null;
  if (songPreviewId === id) {
    songPreviewId = '';
    render();
    return;
  }
  songPreviewId = id;
  render();
  import('../music/songs').then((mod) => {
    const song = mod.songById(id);
    if (!song || songPreviewId !== id) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    const out = ctx.createGain();
    out.gain.value = 0.6;
    out.connect(ctx.destination);
    const pl = mod.createPlayer(song, ctx, out);
    pl.start(0);
    const timer = setTimeout(() => songStop?.(), 15000);
    songStop = () => {
      clearTimeout(timer);
      try {
        pl.stop();
      } catch {
        /* */
      }
      ctx.close().catch(() => {});
      if (songPreviewId === id) songPreviewId = '';
      root && render();
    };
  });
}

function canvasBox(px: number): [HTMLCanvasElement, CanvasRenderingContext2D, number] {
  const c = h('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = px + 'px';
  return [c, c.getContext('2d')!, dpr];
}

const dancePose = { t: 0, blink: 0, lookX: 0.1, lookY: 0.1, sx: 1, sy: 1, mood: 'idle' as 'idle' | 'happy', lx: -0.55, ly: -0.83, still: true };

function musicVisual(r: Reward, px: number, s: SeasonInfo, live: boolean): HTMLElement {
  const m = musicRewardById(r.id);
  const [, a, b] = s.palette;
  if (!m) return h('div', '', passIcon('p-music', px * 0.7));
  ensureMusicPassRegistered();
  const skin = skinById(save.skin === 'custom' ? 'bloop' : save.skin);
  if (m.kind === 'aura' || m.kind === 'dance') {
    const [c, x, dpr] = canvasBox(px);
    const R = px * (m.kind === 'aura' ? 0.2 : 0.24);
    const draw = (time: number) => {
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, px, px);
      x.save();
      x.translate(px / 2, px * 0.56);
      if (m.kind === 'aura') {
        drawAura(x, m.id, 0, 0, R, time);
        dancePose.sx = dancePose.sy = 1;
        dancePose.mood = 'idle';
        dancePose.t = time;
        drawPlayer(x, skin, R, dancePose);
      } else {
        const pl = playDance(m.id);
        const p = pl ? pl.frame(time % Math.max(0.5, pl.loopSec)) : null;
        if (p) {
          applyDancePose(x, p, R);
          drawDanceArms(x, p, R, skin.dark);
          dancePose.sx = p.sx;
          dancePose.sy = p.sy;
          dancePose.mood = p.mood;
        }
        dancePose.t = time;
        drawPlayer(x, skin, R, dancePose);
        x.restore();
        x.save();
        if (p) drawDanceFx(x, p, px / 2, px * 0.56, R);
      }
      x.restore();
    };
    draw(0.6);
    if (live) animated.push({ c, draw });
    return c;
  }
  const box = h('div', 'pv-music');
  if (m.kind === 'song') {
    const mega = m.id.endsWith('mega');
    box.classList.add('song');
    box.style.background = `radial-gradient(circle at 50% 50%, ${b} 0 14%, #14102a 15% 30%, #2a2240 31% 33%, #14102a 34% 60%, ${a} 61% 64%, #14102a 65%)`;
    box.innerHTML = mega ? icon('crown', { size: px * 0.32 }) : '';
  } else if (m.kind === 'instSkin') {
    const k = instSkin(m.id);
    const [c1, c2, c3] = k?.colors ?? [a, b, '#fff'];
    box.style.background = `linear-gradient(135deg, ${c1}, ${c2} 60%, ${c3})`;
    box.classList.add('inst');
    box.innerHTML = passIcon('p-music', px * 0.5);
  } else if (m.kind === 'highway') {
    const hw = highwaySkin(m.id);
    const lanes = (hw?.lanes ?? [a, b, a, b, a]).map((col, i) => `${col} ${i * 20 + 8}% ${i * 20 + 11}%`).join(', ');
    box.style.background = `linear-gradient(90deg, transparent 0 7%, ${lanes}, transparent 0), linear-gradient(180deg, ${hw?.bg[0] ?? '#111'}, ${hw?.bg[1] ?? '#333'})`;
    box.classList.add('hw');
  } else if (m.kind === 'stage') {
    const st = stageVariant(m.id);
    box.style.background = `radial-gradient(ellipse at 50% 0%, ${st?.light ?? a}cc, transparent 60%), linear-gradient(180deg, ${st?.sky[0] ?? '#123'}, ${st?.sky[1] ?? '#345'})`;
    box.classList.add('stage');
    box.innerHTML = passIcon('p-banner', px * 0.5);
  }
  box.style.width = box.style.height = px * 0.86 + 'px';
  return box;
}

/** arte do Passe Musical: palco com holofotes e equalizador na paleta da temporada */
function drawMusicSeasonArt(x: CanvasRenderingContext2D, w: number, hh: number, s: SeasonInfo, time: number): void {
  const [bg, a, b] = s.palette;
  const g = x.createLinearGradient(0, 0, 0, hh);
  g.addColorStop(0, bg);
  g.addColorStop(1, mixHex(bg, b, 0.35));
  x.fillStyle = g;
  x.fillRect(0, 0, w, hh);
  // holofotes
  for (let i = 0; i < 3; i++) {
    const sx = w * (0.55 + i * 0.18);
    const ang = Math.sin(time * 0.8 + i * 2) * 0.35;
    x.save();
    x.translate(sx, -6);
    x.rotate(ang);
    const lg = x.createLinearGradient(0, 0, 0, hh);
    lg.addColorStop(0, (i % 2 ? a : b) + 'aa');
    lg.addColorStop(1, (i % 2 ? a : b) + '00');
    x.fillStyle = lg;
    x.beginPath();
    x.moveTo(-6, 0);
    x.lineTo(6, 0);
    x.lineTo(46, hh);
    x.lineTo(-46, hh);
    x.closePath();
    x.fill();
    x.restore();
  }
  // equalizador
  const n = 22;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = 0.25 + 0.55 * Math.abs(Math.sin(time * 2.2 + i * 0.7) * Math.cos(time * 0.9 + i * 0.3));
    x.fillStyle = i % 2 ? a : b;
    x.globalAlpha = 0.55;
    x.fillRect(i * bw + 2, hh * (1 - v * 0.5), bw - 4, hh * v * 0.5);
  }
  x.globalAlpha = 1;
  // palco
  x.fillStyle = mixHex(bg, '#000000', 0.35);
  x.fillRect(0, hh * 0.86, w, hh * 0.14);
  x.fillStyle = a;
  x.fillRect(0, hh * 0.86, w, 3);
}

/* ---------------- montagem ---------------- */

function seasonForView(): { s: SeasonInfo; live: boolean } {
  const s = ensureSeason();
  if (s) return { s, live: true };
  return { s: upcomingSeason() ?? SEASONS[0], live: false };
}

export function openPassUI(startTab: Tab = 'rewards', which: PassMode = mode): void {
  closePassUI();
  tab = startTab;
  const { s } = seasonForView();
  ensureHomeSeason();
  setMode(which);
  root = h('div', 'pass-panel');
  popBackFn = pushBack(closePassUI);
  applyTheme(root, s);
  document.body.appendChild(root);
  loadSeasonCreatureNames(s.index).then(() => root && render());
  render();
  offs = [bus.on('pass', () => render()), bus.on('hpass', () => render()), bus.on('mpass', () => render()), bus.on('cosmetics', () => render()), bus.on('wallet', () => renderWallet()), bus.on('club', () => render()), bus.on('ad-free', () => render())];
  startLoop();
  requestAnimationFrame(() => root?.classList.add('in'));
}

let popBackFn: (() => void) | null = null;
export function closePassUI(): void {
  popBackFn?.();
  popBackFn = null;
  cancelAnimationFrame(raf);
  raf = 0;
  stopTrack();
  songStop?.();
  offs.forEach((f) => f());
  offs = [];
  root?.remove();
  root = null;
  animated.length = 0;
  bus.emit('pass');
}

function applyTheme(el: HTMLElement, s: SeasonInfo): void {
  const [bg, a, b] = s.palette;
  el.style.setProperty('--s-bg', bg);
  el.style.setProperty('--s-bg2', mixHex(bg, a, 0.18));
  el.style.setProperty('--s-a', a);
  el.style.setProperty('--s-b', b);
  el.style.setProperty('--s-a-dim', mixHex(a, bg, 0.55));
}

let headArt: { c: HTMLCanvasElement; s: SeasonInfo } | null = null;

function startLoop(): void {
  const tier = detectInitialTier();
  const anim = tier >= 2 && !save.lowFx && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  const t0 = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < (anim ? 33 : 120)) return; // ~30 fps no máximo; estático em aparelho fraco
    last = now;
    const time = (now - t0) / 1000;
    if (anim && headArt) paintHead(time);
    for (const a of animated) if (a.c.isConnected) a.draw(time);
  };
  raf = requestAnimationFrame(loop);
}

function paintHead(time: number): void {
  if (!headArt) return;
  const { c, s } = headArt;
  const x = c.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  M.art(x, c.width / dpr, c.height / dpr, s, time);
}

function renderWallet(): void {
  const w = root?.querySelector('.pp-wallet');
  if (w) w.innerHTML = `<span><i class="gem"></i>${fmt(save.gems)}</span><span><i class="coin"></i>${fmt(save.coins)}</span><span>${icon('ticket', { size: 18 })}${fmt(save.tickets ?? 0)}</span>`;
}

function render(): void {
  if (!root) return;
  animated.length = 0;
  const { s, live } = seasonForView();
  root.innerHTML = '';
  // topo
  const top = h('div', 'pp-top');
  const back = h('button', 'pp-back', passIcon('p-left', 22));
  back.setAttribute('aria-label', t('pass.back', 'Voltar'));
  back.onclick = () => closePassUI();
  top.append(back, h('div', 'pp-title', mode === 'home' ? `${passIcon('p-house', 28)}<b>${t('hpass.title', 'Passe da Casa')}</b>` : mode === 'music' ? `${passIcon('p-music', 28)}<b>${t('mpass.title', 'Passe Musical')}</b>` : `${passIcon('p-pass', 28)}<b>${t('pass.title', 'Passe Estelar')}</b>`), h('div', 'pp-wallet'));
  root.appendChild(top);
  renderWallet();

  const scroll = h('div', 'pp-scroll');
  root.appendChild(scroll);
  const seg = h('div', 'pp-seg');
  for (const [m, label, ic, n] of [
    ['star', t('pass.title.short', 'Estelar'), passIcon('p-pass', 20), live ? STAR.claimable() : 0],
    ['home', t('hpass.title.short', 'Casa'), passIcon('p-house', 20), live ? HOME.claimable() : 0],
    ['music', t('mpass.title.short', 'Musical'), passIcon('p-music', 20), live ? MUSIC.claimable() : 0],
  ] as [PassMode, string, string, number][]) {
    const b = h('button', 'pp-seg-b' + (mode === m ? ' on' : ''), `${ic}<span>${label}</span>${n && mode !== m ? `<i class="pp-seg-n">${n}</i>` : ''}`);
    b.onclick = () => {
      if (mode === m) return;
      setMode(m);
      audio.click();
      render();
    };
    seg.appendChild(b);
  }
  scroll.appendChild(seg);
  scroll.appendChild(renderHero(s, live));
  const tabs = h('div', 'pp-tabs');
  const tabDefs: [Tab, string, string][] = [
    ['rewards', t('pass.tab.rewards', 'Prêmios'), passIcon('p-pass', 20)],
    ['weekly', t('pass.tab.weekly', 'Desafios'), icon('target', { size: 20 })],
    ['history', t('pass.tab.history', 'Histórico'), passIcon('p-history', 20)],
    ['club', t('pass.tab.club', 'Clube'), passIcon('p-club', 20)],
  ];
  for (const [id, label, ic] of tabDefs) {
    const b = h('button', 'pp-tab' + (tab === id ? ' on' : ''), `${ic}<span>${label}</span>`);
    if (id === 'weekly' && live && M.weekly().some((w) => !w.done && w.progress > 0)) b.classList.add('dot');
    if (id === 'club' && clubDailyAvailable()) b.classList.add('dot');
    b.onclick = () => {
      tab = id;
      audio.click();
      render();
    };
    tabs.appendChild(b);
  }
  scroll.appendChild(tabs);
  const body = h('div', 'pp-body');
  scroll.appendChild(body);
  if (tab === 'rewards') renderRewards(body, s, live);
  else if (tab === 'weekly') renderWeekly(body, live);
  else if (tab === 'history') renderHistory(body);
  else renderClub(body);
}

function renderHero(s: SeasonInfo, live: boolean): HTMLElement {
  const hero = h('div', 'pp-hero' + (mode !== 'star' ? ' home' : ''));
  const c = h('canvas', 'pp-art');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.min(window.innerWidth, 720);
  const H = 170;
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.height = H + 'px';
  hero.appendChild(c);
  headArt = { c, s };
  paintHead(0);
  const king = h('div', 'pp-king');
  const kr: Reward = M.levels(s.index)[49].prem;
  king.appendChild(rewardVisual(kr, 108, s));
  king.appendChild(h('div', 'pp-king-tag', `${icon('crown', { size: 14 })}${kr.name}`));
  hero.appendChild(king);
  const months = [t('m.1', 'Janeiro'), t('m.2', 'Fevereiro'), t('m.3', 'Março'), t('m.4', 'Abril'), t('m.5', 'Maio'), t('m.6', 'Junho'), t('m.7', 'Julho'), t('m.8', 'Agosto'), t('m.9', 'Setembro'), t('m.10', 'Outubro'), t('m.11', 'Novembro'), t('m.12', 'Dezembro')];
  const d = new Date(Date.parse(s.start) + 86400000);
  const info = h('div', 'pp-hero-info');
  const left = live ? seasonLeftMs(s) : Date.parse(s.start) - Date.now();
  info.innerHTML = `<div class="pp-season">${t('pass.seasonN', 'Temporada {n}', { n: s.index + 1 })} · ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}</div>
    <div class="pp-theme">${seasonTheme(s)}</div>
    <div class="pp-count ${live && left < 3 * 86400000 ? 'hot' : ''}">${icon('clock', { size: 16 })}${live ? t('pass.endsIn', 'Termina em {t}', { t: durText(left) }) : t('pass.startsIn', 'Começa em {t}', { t: durText(left) })}</div>`;
  hero.appendChild(info);

  const prog = h('div', 'pp-prog');
  const lv = M.level();
  const lx = M.levelXp();
  const prem = M.premium();
  prog.innerHTML = `<div class="pp-lv"><small>${t('pass.level', 'Nível')}</small><b>${lv}</b></div>
    <div class="pp-bar-wrap"><div class="pp-bar"><i style="width:${(lx / PASS.xpPerLevel) * 100}%"></i></div>
    <div class="pp-bar-txt">${lv >= PASS.levels ? t('pass.maxed', 'Nível máximo!') : t('pass.xpTo', '{x}/{y} XP para o nível {n}', { x: fmt(lx), y: fmt(PASS.xpPerLevel), n: lv + 1 })}</div></div>`;
  if (live && lv < PASS.levels) {
    const sk = h('button', 'pp-skip', `${passIcon('p-skip', 18)}<span>+1</span><i class="gem"></i>${M.skipGems}`);
    sk.setAttribute('aria-label', t('pass.skip', 'Pular 1 nível'));
    sk.onclick = () => {
      const r = M.skip();
      if (r === 'gems') toast(t('pass.noGems', 'Gemas insuficientes'), 'gem');
      else if (r === 'ok') {
        audio.cash();
        haptics.tap('light');
      }
    };
    prog.appendChild(sk);
  }
  hero.appendChild(prog);

  const cta = h('div', 'pp-cta');
  if (!live) {
    cta.innerHTML = `<div class="pp-soon">${icon('calendar', { size: 20 })}${t('pass.soon', 'O primeiro Passe Estelar chega em 1º de dezembro!')}</div>`;
  } else if (prem) {
    cta.innerHTML = `<div class="pp-owned">${icon('check', { size: 20 })}${clubActive() ? t('pass.ownedClub', 'Passe Premium incluso no Clube Bloop') : t('pass.owned', 'Passe Premium ativo · sem anúncios nesta temporada')}</div>`;
  } else {
    const buy = h('button', 'pp-buy', `<span>${t('pass.buy', 'Liberar Premium')}</span><b><i class="gem"></i>${fmt(M.price)}</b>`);
    buy.onclick = () => openBuy(s);
    const club = h('button', 'pp-club-btn', `${passIcon('p-club', 22)}<span>${t('pass.clubCta', 'Clube Bloop')}</span>`);
    club.onclick = () => openClubSheet();
    cta.append(buy, club);
  }
  hero.appendChild(cta);
  return hero;
}

/* ---------------- aba Prêmios ---------------- */

function renderRewards(body: HTMLElement, s: SeasonInfo, live: boolean): void {
  const ps = { levels: M.levels(s.index) };
  const lv = live ? M.level() : 0;
  const prem = M.premium();
  const nav = h('div', 'pp-pager');
  const prev = h('button', 'pp-arrow', passIcon('p-left', 22));
  const next = h('button', 'pp-arrow', passIcon('p-right', 22));
  prev.disabled = page === 0;
  next.disabled = page === 4;
  prev.setAttribute('aria-label', t('pass.prev', 'Cartela anterior'));
  next.setAttribute('aria-label', t('pass.next', 'Próxima cartela'));
  prev.onclick = () => {
    page = Math.max(0, page - 1);
    sel = null;
    render();
  };
  next.onclick = () => {
    page = Math.min(4, page + 1);
    sel = null;
    render();
  };
  const dots = Array.from({ length: 5 }, (_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('');
  nav.append(prev, h('div', 'pp-pager-mid', `<b>${t('pass.page', 'Cartela {p} de 5', { p: page + 1 })}</b><small>${t('pass.pageLv', 'Níveis {a}–{b}', { a: page * 10 + 1, b: page * 10 + 10 })}</small><span class="pp-dots">${dots}</span>`), next);
  body.appendChild(nav);

  const legend = h('div', 'pp-legend', `<span class="lg-prem">${passIcon('p-pass', 16)}${t('pass.trackPrem', 'Premium')}</span><span class="lg-free">${t('pass.trackFree', 'Grátis')}</span>`);
  body.appendChild(legend);

  const grid = h('div', 'pp-grid');
  const levels = ps.levels.slice(page * 10, page * 10 + 10);
  if (!sel) {
    const firstClaim = levels.find((L) => (prem && M.canClaim(L, 'prem')) || M.canClaim(L, 'free'));
    sel = firstClaim ? { L: firstClaim, track: prem && M.canClaim(firstClaim, 'prem') ? 'prem' : 'free' } : { L: levels.find((L) => L.prem.kind === 'creature') ?? levels[0], track: 'prem' };
  }
  for (const L of levels) {
    const cell = h('div', 'pp-cell' + (L.level <= lv ? ' reached' : '') + (L.level === lv ? ' current' : ''));
    cell.appendChild(h('div', 'pp-num', String(L.level)));
    cell.appendChild(card(L, 'prem', s, lv, prem));
    if (L.free) cell.appendChild(card(L, 'free', s, lv, prem));
    else cell.appendChild(h('div', 'pp-card free empty'));
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  // detalhe do selecionado
  if (sel) body.appendChild(detail(sel.L, sel.track, s, live, lv, prem));

  const n = live ? M.claimable() - (clubDailyAvailable() ? 1 : 0) : 0;
  if (n > 1) {
    const all = h('button', 'pp-claim-all', `${icon('gift', { size: 22 })}${t('pass.claimAll', 'Resgatar tudo ({n})', { n })}`);
    all.onclick = () => {
      const got = M.claimAll();
      if (got.length) {
        audio.cash();
        haptics.tap('medium');
        toast(t('pass.gotN', '{n} prêmios resgatados!', { n: got.length }), 'gift');
      }
    };
    body.appendChild(all);
  }
}

function card(L: PassLevel, track: Track, s: SeasonInfo, lv: number, prem: boolean): HTMLElement {
  const r = track === 'free' ? L.free! : L.prem;
  const got = M.claimed(L.level, track);
  const locked = track === 'prem' && !prem;
  const ready = !got && L.level <= lv && !locked;
  const el = h('button', `pp-card ${track} r-${r.rarity}${got ? ' got' : ''}${ready ? ' ready' : ''}${locked ? ' locked' : ''}${r.kind === 'creature' ? ' creature' : ''}`);
  el.style.setProperty('--rc', RARITY_COLOR[r.rarity]);
  el.appendChild(rewardVisual(r, track === 'prem' ? 46 : 30, s));
  if (r.amount && (r.kind === 'gems' || r.kind === 'coins' || r.kind === 'tickets')) el.appendChild(h('span', 'pp-amt', fmt(r.amount)));
  if (got) el.appendChild(h('span', 'pp-badge ok', icon('check', { size: 14 })));
  else if (locked) el.appendChild(h('span', 'pp-badge lock', icon('lock', { size: 14 })));
  if (sel && sel.L.level === L.level && sel.track === track) el.classList.add('sel');
  el.setAttribute('aria-label', `${r.name} — ${t('pass.level', 'Nível')} ${L.level}`);
  el.onclick = () => {
    sel = { L, track };
    if (ready) doClaim(L, track);
    else render();
  };
  return el;
}

function doClaim(L: PassLevel, track: Track): void {
  const r = M.claim(L, track);
  if (!r) return;
  audio.cash();
  haptics.tap('medium');
  toast(t('pass.got', 'Você ganhou: {n}', { n: r.name }), r.kind === 'creature' ? 'heart' : 'gift');
}

function detail(L: PassLevel, track: Track, s: SeasonInfo, live: boolean, lv: number, prem: boolean): HTMLElement {
  const r = track === 'free' ? L.free! : L.prem;
  const d = h('div', `pp-detail r-${r.rarity}`);
  d.style.setProperty('--rc', RARITY_COLOR[r.rarity]);
  const vis = h('div', 'pp-detail-vis');
  vis.appendChild(rewardVisual(r, 112, s, true));
  d.appendChild(vis);
  const info = h('div', 'pp-detail-info');
  const exclusive = r.kind !== 'gems' && r.kind !== 'coins' && r.kind !== 'tickets';
  info.innerHTML = `<div class="pp-rar" style="color:${RARITY_COLOR[r.rarity]}">${rarityLabel(r.rarity)} · ${kindLabel(r.kind)}</div>
    <div class="pp-dname">${r.name}</div>
    <div class="pp-dsub">${t('pass.lvTrack', 'Nível {n} · trilha {tr}', { n: L.level, tr: track === 'prem' ? t('pass.trackPrem', 'Premium') : t('pass.trackFree', 'Grátis') })}${exclusive ? ` · <b>${t('pass.exclusive', 'Exclusivo do passe')}</b>` : ''}</div>`;
  const act = h('div', 'pp-dact');
  const got = M.claimed(L.level, track);
  if (r.kind === 'mpass') {
    const m = musicRewardById(r.id);
    if (m?.kind === 'song') {
      const si = songInfo(r.id);
      info.querySelector('.pp-dsub')!.insertAdjacentHTML('afterbegin', `<b class="pp-band">${si.band}</b> · `);
      const on = songPreviewId === r.id;
      const pb = h('button', 'pp-play', `${icon(on ? 'pause' : 'play', { size: 18 })}${on ? t('pass.stop', 'Parar') : t('pass.listen', 'Ouvir')}`);
      pb.onclick = () => toggleSongPreview(r.id);
      act.appendChild(pb);
    }
    if ((m?.kind === 'aura' || m?.kind === 'dance') && ownsMusicItem(r.id)) {
      const isOn = m.kind === 'aura' ? equippedAura() === r.id : equippedDance() === r.id;
      const eb = h('button', 'pp-play' + (isOn ? ' on' : ''), `${icon(isOn ? 'check' : 'user', { size: 18 })}${isOn ? t('pass.equipped', 'Equipado') : t('pass.equip', 'Equipar')}`);
      eb.onclick = () => (m.kind === 'aura' ? equipAura(r.id) : equipDance(r.id));
      act.appendChild(eb);
    }
  }
  if (r.kind === 'music') {
    const on = playingTrack() === r.id;
    const pb = h('button', 'pp-play', `${icon(on ? 'pause' : 'play', { size: 18 })}${on ? t('pass.stop', 'Parar') : t('pass.listen', 'Ouvir')}`);
    pb.onclick = () => {
      if (playingTrack() === r.id) stopTrack();
      else previewTrack(r.id, () => root && render());
      render();
    };
    act.appendChild(pb);
  }
  if (got || (exclusive && hasItem(r.id) && r.kind !== 'creature')) act.appendChild(h('span', 'pp-have', `${icon('check', { size: 18 })}${t('pass.have', 'É seu')}`));
  else if (live && M.canClaim(L, track)) {
    const b = h('button', 'pp-claim', t('pass.claim', 'Resgatar'));
    b.onclick = () => doClaim(L, track);
    act.appendChild(b);
  } else if (track === 'prem' && !prem && live) {
    const b = h('button', 'pp-claim locked', `${icon('lock', { size: 16 })}${t('pass.needPrem', 'Precisa do Premium')}`);
    b.onclick = () => openBuy(s);
    act.appendChild(b);
  } else {
    act.appendChild(h('span', 'pp-need', t('pass.reach', 'Chegue ao nível {n}', { n: L.level })));
  }
  info.appendChild(act);
  d.appendChild(info);
  void lv;
  return d;
}

function openBuy(s: SeasonInfo): void {
  if (mode === 'home') confirmHomeBuy(s);
  else if (mode === 'music') confirmMusicBuy(s);
  else confirmBuy(s);
}

/** Botão do combo "Passes do Mês" (os 3 passes) — só se nenhum premium foi comprado. */
function appendBundle(sh: { box: HTMLElement; close: () => void }): void {
  if (!bundleAvailable()) return;
  const bb = h('button', 'pp-buy big bundle', `<span>${t('pass.bundle3', 'Passes do Mês (os 3)')}<small>${t('hpass.bundleSave', 'economize {n} gemas', { n: fmt(bundleSavings()) })}</small></span><b><i class="gem"></i>${fmt(PASS.bundlePriceGems)}</b>`);
  bb.onclick = () => {
    const r = buyMonthBundle();
    if (r === 'gems') return toast(t('pass.needGems', 'Faltam {n} gemas — veja a loja ou o Clube', { n: fmt(PASS.bundlePriceGems - save.gems) }), 'gem');
    sh.close();
    if (r === 'ok') {
      audio.cash();
      haptics.tap('heavy');
      sel = null;
      toast(t('pass.bundleOk', 'Os 3 passes do mês liberados!'), 'crown');
    }
    render();
  };
  sh.box.appendChild(bb);
}

function confirmMusicBuy(s: SeasonInfo): void {
  const sh = sheet();
  const L = musicLevels(s.index);
  sh.box.innerHTML = `<div class="ps-head">${passIcon('p-music', 44)}<div><b>${t('mpass.buyTitle', 'Passe Musical Premium')}</b><small>${musicThemeName(s.index)}</small></div></div>
    <ul class="ps-list">
      <li>${passIcon('p-music', 22)}${t('mpass.b1', 'Músicas novas para o Bloop Banda + a MEGA música no nível 50')}</li>
      <li>${passIcon('p-aura', 22)}${t('mpass.b2', 'Auras animadas e dancinhas para usar no menu')}</li>
      <li>${passIcon('p-emote', 22)}${t('mpass.b3', 'Skins de instrumento, pista de notas e palco')}</li>
    </ul>`;
  const row = h('div', 'ps-creatures');
  for (const lv of [0, 19, 29, 39, 49]) row.appendChild(rewardVisual(L[lv].prem, 52, s));
  sh.box.appendChild(row);
  const b = h('button', 'pp-buy big', `<span>${t('mpass.buyOnly', 'Só o Passe Musical')}</span><b><i class="gem"></i>${fmt(PASS.musicPriceGems)}</b>`);
  b.onclick = () => {
    const r = buyMusicPremium();
    if (r === 'gems') return toast(t('pass.needGems', 'Faltam {n} gemas — veja a loja ou o Clube', { n: fmt(PASS.musicPriceGems - save.gems) }), 'gem');
    sh.close();
    if (r === 'ok') {
      audio.cash();
      haptics.tap('heavy');
      sel = null;
      toast(t('mpass.welcome', 'Passe Musical liberado!'), 'music');
    }
    render();
  };
  sh.box.appendChild(b);
  appendBundle(sh);
  const c = h('button', 'ps-alt', `${passIcon('p-club', 20)}${t('pass.orClub3', 'Ou assine o Clube Bloop (os 3 passes inclusos)')}`);
  c.onclick = () => {
    sh.close();
    openClubSheet();
  };
  sh.box.appendChild(c);
}

function confirmHomeBuy(s: SeasonInfo): void {
  const sh = sheet();
  const L = homePassSeason(s.index).levels;
  sh.box.innerHTML = `<div class="ps-head">${passIcon('p-house', 44)}<div><b>${t('hpass.buyTitle', 'Passe da Casa Premium')}</b><small>${seasonTheme(s)}</small></div></div>
    <ul class="ps-list">
      <li>${passIcon('p-house', 22)}${t('hpass.b1', 'Móveis, tintas especiais, papéis de parede, pisos e enfeites do planeta')}</li>
      <li>${icon('party', { size: 22 })}${t('hpass.b2', 'Kit de cômodo completo e kit de festa com bolo temático')}</li>
      <li>${icon('crown', { size: 22 })}${t('hpass.b3', 'Peça-mestra no nível 50: {n}', { n: L[49].prem.name })}</li>
      <li>${icon('gem', { size: 22 })}${t('hpass.b4', '600 gemas de volta ao longo do passe')}</li>
    </ul>`;
  const row = h('div', 'ps-creatures');
  for (const lv of [0, 19, 29, 39, 49]) row.appendChild(rewardVisual(L[lv].prem, 52, s));
  sh.box.appendChild(row);
  const done = (r: ReturnType<typeof buyHomePremium>, price: number) => {
    if (r === 'gems') return toast(t('pass.needGems', 'Faltam {n} gemas — veja a loja ou o Clube', { n: fmt(price - save.gems) }), 'gem');
    sh.close();
    if (r === 'ok') {
      audio.cash();
      haptics.tap('heavy');
      sel = null;
      toast(t('hpass.welcome', 'Passe da Casa liberado! Resgate seu primeiro móvel'), 'home');
    }
    render();
  };
  const b = h('button', 'pp-buy big', `<span>${t('hpass.buyHouse', 'Só o Passe da Casa')}</span><b><i class="gem"></i>${fmt(PASS.homePriceGems)}</b>`);
  b.onclick = () => done(buyHomePremium(false), PASS.homePriceGems);
  sh.box.appendChild(b);
  appendBundle(sh);
  const c = h('button', 'ps-alt', `${passIcon('p-club', 20)}${t('pass.orClub3', 'Ou assine o Clube Bloop (os 3 passes inclusos)')}`);
  c.onclick = () => {
    sh.close();
    openClubSheet();
  };
  sh.box.appendChild(c);
}

function confirmBuy(s: SeasonInfo): void {
  const sh = sheet();
  const ps = passSeason(s.index);
  const creatures = ps.levels.filter((L) => L.prem.kind === 'creature').map((L) => L.prem);
  sh.box.innerHTML = `<div class="ps-head">${passIcon('p-pass', 44)}<div><b>${t('pass.buyTitle', 'Passe Estelar Premium')}</b><small>${seasonTheme(s)}</small></div></div>
    <ul class="ps-list">
      <li>${passIcon('p-paw', 22)}${t('pass.b1', '5 bichinhos exclusivos (o primeiro já no nível 1!)')}</li>
      <li>${passIcon('p-emote', 22)}${t('pass.b2', 'Dancinhas, olhos, bocas, efeitos e músicas')}</li>
      <li>${icon('gem', { size: 22 })}${t('pass.b3', '1.000 gemas de volta ao longo do passe')}</li>
      <li>${icon('no-ads', { size: 22 })}${t('pass.b4', 'Sem anúncios até o fim da temporada')}</li>
    </ul>`;
  const row = h('div', 'ps-creatures');
  for (const c of creatures) row.appendChild(rewardVisual(c, 52, s));
  sh.box.appendChild(row);
  const b = h('button', 'pp-buy big', `<span>${t('pass.buyFor', 'Comprar por')}</span><b><i class="gem"></i>${fmt(PASS.priceGems)}</b>`);
  b.onclick = () => {
    const r = buyPremium();
    if (r === 'gems') {
      toast(t('pass.needGems', 'Faltam {n} gemas — veja a loja ou o Clube', { n: fmt(PASS.priceGems - save.gems) }), 'gem');
      return;
    }
    sh.close();
    if (r === 'ok') {
      audio.cash();
      haptics.tap('heavy');
      page = 0;
      sel = null;
      toast(t('pass.welcome', 'Premium liberado! Resgate seu primeiro bichinho'), 'heart');
    }
    render();
  };
  sh.box.appendChild(b);
  appendBundle(sh);
  const c = h('button', 'ps-alt', `${passIcon('p-club', 20)}${t('pass.orClub3', 'Ou assine o Clube Bloop (os 3 passes inclusos)')}`);
  c.onclick = () => {
    sh.close();
    openClubSheet();
  };
  sh.box.appendChild(c);
}

function sheet(): { box: HTMLElement; close: () => void } {
  const ov = h('div', 'ps-overlay');
  const box = h('div', 'ps-sheet');
  const x = h('button', 'ps-x', icon('close', { size: 22 }));
  ov.append(box);
  const close = () => {
    ov.classList.add('out');
    setTimeout(() => ov.remove(), 200);
  };
  x.onclick = close;
  ov.onclick = (e) => e.target === ov && close();
  (root ?? document.body).appendChild(ov);
  queueMicrotask(() => box.prepend(x));
  return { box, close };
}

/* ---------------- aba Desafios ---------------- */

function renderWeekly(body: HTMLElement, live: boolean): void {
  if (!live) {
    body.appendChild(h('div', 'pp-empty', `${icon('calendar', { size: 40 })}<p>${t('pass.wSoon', 'Os desafios semanais começam junto com o primeiro passe.')}</p>`));
    return;
  }
  body.appendChild(h('div', 'pp-sec', `<b>${t('pass.weekTitle', 'Desafios da semana')}</b><small>${icon('clock', { size: 14 })}${t('pass.renews', 'Renova em {t}', { t: durText(weekEnds() - Date.now()) })}</small>`));
  for (const w of M.weekly()) body.appendChild(chRow(w.def.text, w.progress, w.def.target, w.def.xp, w.done, w.def.game));
  const ms = M.milestones();
  if (ms.length) body.appendChild(h('div', 'pp-sec', `<b>${t('pass.msTitle', 'Marcos da temporada')}</b>`));
  for (const m of ms) body.appendChild(chRow(m.def.text, m.progress, m.def.target, m.def.xp, m.done));
  body.appendChild(
    h(
      'div',
      'pp-tip',
      `${icon('sparkle', { size: 16 })}${
        mode === 'home'
          ? t('hpass.xpTip', 'Construir, pintar, limpar, dar festas e ajudar amigos dá XP da casa. Partidas também contam um pouco.')
          : t('pass.xpTip', 'Toda partida em qualquer minigame dá XP. Entrar no jogo todo dia dá +{n} XP.', { n: PASS.dailyLoginXp })
      }`,
    ),
  );
}

function chRow(text: string, prog: number, target: number, xp: number, done: boolean, game?: string): HTMLElement {
  const row = h('div', 'pp-ch' + (done ? ' done' : ''));
  const p = Math.min(1, prog / target);
  const ic = game === 'orbit' ? 'planet' : game === 'rally' ? 'rocket' : game === 'tycoon' ? 'coins' : game === 'tubo' ? 'target' : game === 'pet' ? 'heart' : game === 'home' ? 'home' : 'star';
  row.innerHTML = `<div class="ch-ic">${done ? icon('check', { size: 26 }) : icon(ic as any, { size: 26 })}</div>
    <div class="ch-main"><div class="ch-t">${text}</div><div class="ch-bar"><i style="width:${p * 100}%"></i></div><small>${fmt(Math.floor(prog * 10) / 10)}/${fmt(target)}</small></div>
    <div class="ch-xp"><b>+${fmt(xp)}</b><small>XP</small></div>`;
  return row;
}

/* ---------------- aba Histórico ---------------- */

function renderHistory(body: HTMLElement): void {
  const list = M.history();
  body.appendChild(h('div', 'pp-sec', `<b>${t('pass.histTitle', 'Temporadas anteriores')}</b><small>${t('pass.histSub', 'Seus itens ficam com você para sempre')}</small>`));
  if (!list.length) {
    body.appendChild(h('div', 'pp-empty', `${passIcon('p-history', 44)}<p>${t('pass.histEmpty', 'Quando uma temporada acabar, ela aparece aqui com tudo o que você ganhou.')}</p>`));
    return;
  }
  for (const { info, save: sv } of list) {
    const items = M.items(info.index);
    const lvReached = Math.min(PASS.levels, Math.floor(sv.xp / PASS.xpPerLevel) + 1);
    const gotSet = new Set([...sv.free.map((l) => 'free:' + l), ...sv.prem.map((l) => 'prem:' + l)]);
    const got = items.filter((i) => gotSet.has(`${i.track}:${i.level}`));
    const card = h('div', 'pp-hist');
    card.style.setProperty('--s-a', info.palette[1]);
    card.style.setProperty('--s-b', info.palette[2]);
    card.style.setProperty('--s-bg', info.palette[0]);
    card.innerHTML = `<div class="ph-head"><div><b>${seasonTheme(info)}</b><small>${t('pass.seasonN', 'Temporada {n}', { n: info.index + 1 })} · ${t('pass.level', 'Nível')} ${lvReached}${sv.premium ? ' · Premium' : ''}</small></div><div class="ph-count">${got.length}/${items.length}</div></div>`;
    const strip = h('div', 'ph-strip');
    const highlight = items.filter((i) => M.star(i));
    for (const it of highlight) {
      const have = gotSet.has(`${it.track}:${it.level}`);
      const cell = h('div', 'ph-item' + (have ? '' : ' missed'));
      cell.appendChild(rewardVisual(it.r, 44, info));
      cell.appendChild(h('small', '', have ? t('pass.gotShort', 'Ganhou') : t('pass.missed', 'Perdeu')));
      strip.appendChild(cell);
    }
    card.appendChild(strip);
    body.appendChild(card);
  }
}

/* ---------------- aba Clube + medidor sem anúncios ---------------- */

function renderClub(body: HTMLElement): void {
  const on = clubActive();
  const c = h('div', 'pp-clubcard' + (on ? ' on' : ''));
  c.innerHTML = `<div class="pc-head">${passIcon('p-club', 48)}<div><b>${t('club.name', 'Clube Bloop')}</b><small>${on ? t('club.activeUntil', 'Ativo · renova em {t}', { t: durText(save.club.expires - Date.now()) }) : clubPriceString()}</small></div></div>
    <ul class="ps-list">
      <li>${passIcon('p-pass', 22)}${t('club.b1all', 'Os 3 passes do mês inclusos: Estelar, Casa e Musical')}</li>
      <li>${icon('no-ads', { size: 22 })}${t('club.b2', 'Zero anúncios enquanto for membro')}</li>
      <li>${icon('gem-pile', { size: 22 })}${t('club.b3', '{n} gemas por mês + {d} gemas todo dia', { n: CLUB.gemsOnRenew, d: CLUB.gemsDaily })}</li>
      <li>${passIcon('p-frame', 22)}${t('club.b4', 'Moldura de perfil exclusiva do Clube')}</li>
    </ul>`;
  const frame = h('div', 'pc-frame');
  frame.appendChild(rewardVisual({ kind: 'frame', id: CLUB.frame, amount: 0, name: '', rarity: 'legendary' }, 64, seasonForView().s));
  c.appendChild(frame);
  if (on) {
    if (clubDailyAvailable()) {
      const b = h('button', 'pp-claim', `${icon('gem', { size: 18 })}${t('club.daily', 'Pegar {n} gemas de hoje', { n: CLUB.gemsDaily })}`);
      b.onclick = () => {
        const n = claimClubDaily();
        if (n) {
          audio.cash();
          toast(t('club.gotDaily', '+{n} gemas do Clube', { n }), 'gem');
        }
      };
      c.appendChild(b);
    } else c.appendChild(h('div', 'pp-have', `${icon('check', { size: 18 })}${t('club.dailyDone', 'Gemas de hoje já pegas')}`));
    const m = h('button', 'ps-alt', t('club.manage', 'Gerenciar assinatura'));
    m.onclick = () => manageClub();
    c.appendChild(m);
  } else {
    const b = h('button', 'pp-buy big', `<span>${t('club.join', 'Assinar o Clube')}</span><b>${clubPriceString()}</b>`);
    b.onclick = () => openClubSheet();
    c.appendChild(b);
  }
  body.appendChild(c);
  mountAdFreeMeter(body);
}

export function openClubSheet(): void {
  const sh = sheet();
  sh.box.classList.add('club');
  sh.box.innerHTML = `<div class="ps-head">${passIcon('p-club', 52)}<div><b>${t('club.name', 'Clube Bloop')}</b><small>${t('club.sub', 'Assinatura mensal · cancele quando quiser')}</small></div></div>
    <ul class="ps-list">
      <li>${passIcon('p-pass', 22)}${t('club.b1all', 'Os 3 passes do mês inclusos: Estelar, Casa e Musical')}</li>
      <li>${icon('no-ads', { size: 22 })}${t('club.b2', 'Zero anúncios enquanto for membro')}</li>
      <li>${icon('gem-pile', { size: 22 })}${t('club.b3', '{n} gemas por mês + {d} gemas todo dia', { n: CLUB.gemsOnRenew, d: CLUB.gemsDaily })}</li>
      <li>${passIcon('p-frame', 22)}${t('club.b4', 'Moldura de perfil exclusiva do Clube')}</li>
    </ul>
    <p class="ps-legal">${t('club.legal', 'Renova automaticamente todo mês pelo Google Play. Peça ajuda a um adulto responsável antes de assinar. Cancele a qualquer momento em Google Play > Assinaturas.')}</p>`;
  const b = h('button', 'pp-buy big', `<span>${t('club.join', 'Assinar o Clube')}</span><b>${clubPriceString()}</b>`);
  b.onclick = async () => {
    const r = await buyClub();
    if (r === 'ok') {
      sh.close();
      ensureSeason();
      audio.cash();
      toast(t('club.welcome', 'Bem-vindo ao Clube Bloop!'), 'crown');
      render();
    } else if (r === 'unavailable') toast(t('club.android', 'Assinatura disponível no app Android'), 'bag');
    else if (r === 'pending') toast(t('club.pending', 'Pagamento pendente — liberamos assim que confirmar'), 'clock');
    else if (r === 'error') toast(t('club.error', 'Não foi possível assinar agora'), 'warning');
  };
  sh.box.appendChild(b);
}

/**
 * Medidor "assista X vídeos = 30 min sem anúncios". Pode ser montado na loja:
 *   import('./pass/ui').then(m => m.mountAdFreeMeter(el))
 */
export function mountAdFreeMeter(parent: HTMLElement): HTMLElement {
  const box = h('div', 'pp-adfree');
  parent.appendChild(box);
  const paint = () => {
    const m = adFreeMeter();
    const covered = save.noAds || clubActive() || isPremium();
    const pips = Array.from({ length: m.need }, (_, i) => `<i class="${i < m.videos ? 'on' : ''}">${icon('video', { size: 16 })}</i>`).join('');
    box.innerHTML = `<div class="af-head">${icon('no-ads', { size: 34 })}<div><b>${t('adfree.title', 'Tempo sem anúncios')}</b><small>${t('adfree.sub', 'Assista {n} vídeos e fique {m} min sem anúncios (até {x}h)', { n: AD_FREE.videos, m: AD_FREE.minutes, x: AD_FREE.maxMinutes / 60 })}</small></div></div>
      <div class="af-row"><div class="af-pips">${pips}</div><div class="af-left">${m.leftMs > 0 ? `${icon('clock', { size: 16 })}${durText(m.leftMs)}` : t('adfree.none', 'Sem tempo ativo')}</div></div>
      <div class="af-bar"><i style="width:${Math.min(100, (m.leftMs / (AD_FREE.maxMinutes * 60000)) * 100)}%"></i></div>`;
    const b = h('button', 'af-btn', `${icon('video', { size: 20 })}${covered ? t('adfree.covered', 'Você já está sem anúncios') : m.maxed ? t('adfree.max', 'Tempo máximo acumulado') : t('adfree.watch', 'Assistir vídeo ({a}/{b})', { a: m.videos, b: m.need })}`);
    b.disabled = covered || m.maxed;
    b.onclick = async () => {
      b.disabled = true;
      const r = await watchForAdFree();
      if (r === 'blocked') toast(t('adfree.got', '+{m} min sem anúncios!', { m: AD_FREE.minutes }), 'no-ads');
      else if (r === 'fail') toast(t('adfree.fail', 'Vídeo indisponível agora'), 'video');
      paint();
    };
    box.appendChild(b);
  };
  paint();
  return box;
}

void creatureId;
