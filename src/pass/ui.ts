/* ============================================================
 *  TELA DO PASSE ESTELAR (carregada sob demanda por register.ts)
 *  Abas: Recompensas (cartelas de 10) · Desafios · Histórico · Clube
 *  Tematizada pela paleta da temporada (CSS vars --s-bg/--s-a/--s-b).
 * ============================================================ */
import './pass.css';
import { AD_FREE, CLUB, PASS } from '../config';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { detectInitialTier } from '../core/quality';
import { save } from '../core/storage';
import { SEASONS, seasonTheme, type SeasonInfo } from '../creatures/seasons';
import type { AvatarData } from '../game/avatar';
import { renderAvatarPreview } from '../game/preview';
import { fmt, t } from '../i18n';
import { adFreeMeter, clubActive, watchForAdFree } from '../services/ads';
import { buyClub, clubPriceString, manageClub } from '../services/billing';
import { icon } from '../ui/icons';
import { drawSeasonArt, mixHex } from './art';
import { creatureId, passSeason, rarityLabel, seasonItems, type PassLevel, type PassRarity, type Reward } from './catalog';
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

/* ---------------- montagem ---------------- */

function seasonForView(): { s: SeasonInfo; live: boolean } {
  const s = ensureSeason();
  if (s) return { s, live: true };
  return { s: upcomingSeason() ?? SEASONS[0], live: false };
}

export function openPassUI(startTab: Tab = 'rewards'): void {
  closePassUI();
  tab = startTab;
  const { s } = seasonForView();
  page = Math.min(4, Math.floor((passLevel() - 1) / 10));
  sel = null;
  root = h('div', 'pass-panel');
  applyTheme(root, s);
  document.body.appendChild(root);
  loadSeasonCreatureNames(s.index).then(() => root && render());
  render();
  offs = [bus.on('pass', () => render()), bus.on('wallet', () => renderWallet()), bus.on('club', () => render()), bus.on('ad-free', () => render())];
  startLoop();
  requestAnimationFrame(() => root?.classList.add('in'));
}

export function closePassUI(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  stopTrack();
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
  drawSeasonArt(x, c.width / dpr, c.height / dpr, s, time);
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
  top.append(back, h('div', 'pp-title', `${passIcon('p-pass', 28)}<b>${t('pass.title', 'Passe Estelar')}</b>`), h('div', 'pp-wallet'));
  root.appendChild(top);
  renderWallet();

  const scroll = h('div', 'pp-scroll');
  root.appendChild(scroll);
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
    if (id === 'weekly' && live && weekly().some((w) => !w.done && w.progress > 0)) b.classList.add('dot');
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
  const hero = h('div', 'pp-hero');
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
  const kr: Reward = passSeason(s.index).levels[49].prem;
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
  const lv = passLevel();
  const lx = levelXp();
  const prem = isPremium();
  prog.innerHTML = `<div class="pp-lv"><small>${t('pass.level', 'Nível')}</small><b>${lv}</b></div>
    <div class="pp-bar-wrap"><div class="pp-bar"><i style="width:${(lx / PASS.xpPerLevel) * 100}%"></i></div>
    <div class="pp-bar-txt">${lv >= PASS.levels ? t('pass.maxed', 'Nível máximo!') : t('pass.xpTo', '{x}/{y} XP para o nível {n}', { x: fmt(lx), y: fmt(PASS.xpPerLevel), n: lv + 1 })}</div></div>`;
  if (live && lv < PASS.levels) {
    const sk = h('button', 'pp-skip', `${passIcon('p-skip', 18)}<span>+1</span><i class="gem"></i>${PASS.skipGems}`);
    sk.setAttribute('aria-label', t('pass.skip', 'Pular 1 nível'));
    sk.onclick = () => {
      const r = skipLevels(1);
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
    const buy = h('button', 'pp-buy', `<span>${t('pass.buy', 'Liberar Premium')}</span><b><i class="gem"></i>${fmt(PASS.priceGems)}</b>`);
    buy.onclick = () => confirmBuy(s);
    const club = h('button', 'pp-club-btn', `${passIcon('p-club', 22)}<span>${t('pass.clubCta', 'Clube Bloop')}</span>`);
    club.onclick = () => openClubSheet();
    cta.append(buy, club);
  }
  hero.appendChild(cta);
  return hero;
}

/* ---------------- aba Prêmios ---------------- */

function renderRewards(body: HTMLElement, s: SeasonInfo, live: boolean): void {
  const ps = passSeason(s.index);
  const lv = live ? passLevel() : 0;
  const prem = isPremium();
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
    const firstClaim = levels.find((L) => (prem && canClaim(L, 'prem')) || canClaim(L, 'free'));
    sel = firstClaim ? { L: firstClaim, track: prem && canClaim(firstClaim, 'prem') ? 'prem' : 'free' } : { L: levels.find((L) => L.prem.kind === 'creature') ?? levels[0], track: 'prem' };
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

  const n = live ? claimableCount() - (clubDailyAvailable() ? 1 : 0) : 0;
  if (n > 1) {
    const all = h('button', 'pp-claim-all', `${icon('gift', { size: 22 })}${t('pass.claimAll', 'Resgatar tudo ({n})', { n })}`);
    all.onclick = () => {
      const got = claimAll();
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
  const got = claimed(L.level, track);
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
  const r = claim(L, track);
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
  const got = claimed(L.level, track);
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
  else if (live && canClaim(L, track)) {
    const b = h('button', 'pp-claim', t('pass.claim', 'Resgatar'));
    b.onclick = () => doClaim(L, track);
    act.appendChild(b);
  } else if (track === 'prem' && !prem && live) {
    const b = h('button', 'pp-claim locked', `${icon('lock', { size: 16 })}${t('pass.needPrem', 'Precisa do Premium')}`);
    b.onclick = () => confirmBuy(s);
    act.appendChild(b);
  } else {
    act.appendChild(h('span', 'pp-need', t('pass.reach', 'Chegue ao nível {n}', { n: L.level })));
  }
  info.appendChild(act);
  d.appendChild(info);
  void lv;
  return d;
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
  const c = h('button', 'ps-alt', `${passIcon('p-club', 20)}${t('pass.orClub', 'Ou assine o Clube Bloop (passe incluso)')}`);
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
  for (const w of weekly()) body.appendChild(chRow(w.def.text, w.progress, w.def.target, w.def.xp, w.done, w.def.game));
  body.appendChild(h('div', 'pp-sec', `<b>${t('pass.msTitle', 'Marcos da temporada')}</b>`));
  for (const m of milestones()) body.appendChild(chRow(m.def.text, m.progress, m.def.target, m.def.xp, m.done));
  body.appendChild(h('div', 'pp-tip', `${icon('sparkle', { size: 16 })}${t('pass.xpTip', 'Toda partida em qualquer minigame dá XP. Entrar no jogo todo dia dá +{n} XP.', { n: PASS.dailyLoginXp })}`));
}

function chRow(text: string, prog: number, target: number, xp: number, done: boolean, game?: string): HTMLElement {
  const row = h('div', 'pp-ch' + (done ? ' done' : ''));
  const p = Math.min(1, prog / target);
  const ic = game === 'orbit' ? 'planet' : game === 'rally' ? 'rocket' : game === 'tycoon' ? 'coins' : game === 'tubo' ? 'target' : game === 'pet' ? 'heart' : 'star';
  row.innerHTML = `<div class="ch-ic">${done ? icon('check', { size: 26 }) : icon(ic as any, { size: 26 })}</div>
    <div class="ch-main"><div class="ch-t">${text}</div><div class="ch-bar"><i style="width:${p * 100}%"></i></div><small>${fmt(Math.floor(prog * 10) / 10)}/${fmt(target)}</small></div>
    <div class="ch-xp"><b>+${fmt(xp)}</b><small>XP</small></div>`;
  return row;
}

/* ---------------- aba Histórico ---------------- */

function renderHistory(body: HTMLElement): void {
  const list = historyEntries();
  body.appendChild(h('div', 'pp-sec', `<b>${t('pass.histTitle', 'Temporadas anteriores')}</b><small>${t('pass.histSub', 'Seus itens ficam com você para sempre')}</small>`));
  if (!list.length) {
    body.appendChild(h('div', 'pp-empty', `${passIcon('p-history', 44)}<p>${t('pass.histEmpty', 'Quando uma temporada acabar, ela aparece aqui com tudo o que você ganhou.')}</p>`));
    return;
  }
  for (const { info, save: sv } of list) {
    const items = seasonItems(info.index);
    const lvReached = Math.min(PASS.levels, Math.floor(sv.xp / PASS.xpPerLevel) + 1);
    const gotSet = new Set([...sv.free.map((l) => 'free:' + l), ...sv.prem.map((l) => 'prem:' + l)]);
    const got = items.filter((i) => gotSet.has(`${i.track}:${i.level}`));
    const card = h('div', 'pp-hist');
    card.style.setProperty('--s-a', info.palette[1]);
    card.style.setProperty('--s-b', info.palette[2]);
    card.style.setProperty('--s-bg', info.palette[0]);
    card.innerHTML = `<div class="ph-head"><div><b>${seasonTheme(info)}</b><small>${t('pass.seasonN', 'Temporada {n}', { n: info.index + 1 })} · ${t('pass.level', 'Nível')} ${lvReached}${sv.premium ? ' · Premium' : ''}</small></div><div class="ph-count">${got.length}/${items.length}</div></div>`;
    const strip = h('div', 'ph-strip');
    const highlight = items.filter((i) => i.r.kind === 'creature' || (i.track === 'free' && i.level === 1));
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
      <li>${passIcon('p-pass', 22)}${t('club.b1', 'Passe Estelar Premium de todo mês incluso')}</li>
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
      <li>${passIcon('p-pass', 22)}${t('club.b1', 'Passe Estelar Premium de todo mês incluso')}</li>
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
