/**
 * Celebração de recompensa (reutilizável): raios girando, confete, prévias dos itens,
 * som e vibração. Usada por presentes, códigos, compras e desbloqueios.
 *
 * Só MOSTRA — nunca aplica a recompensa (claimGifts/redeemCode/billing já aplicaram).
 */
import type { RewardPack } from '../../shared/reward';
import { audio } from '../core/audio';
import * as haptics from '../core/haptics';
import { renderSkinPreview, renderTrailPreview } from '../game/preview';
import { RARITY_INFO, SKINS, TRAILS, skinName, trailName } from '../game/skins';
import { esc, fmt } from './dom';
import { icon, type IconName } from './icons';
import { t } from '../i18n';

export interface CelebratePack extends RewardPack {
  coinDoubler?: boolean;
  /** itens extras com ícone (ex.: "Melhoria nível 3") */
  extras?: { icon: IconName; label: string; plate?: string }[];
}

export interface CelebrateOpts {
  title?: string;
  subtitle?: string;
  button?: string;
}

interface Tile {
  /** nó visual (canvas ou svg) */
  art: string | HTMLCanvasElement;
  amount: string;
  label: string;
  cls?: string;
  plate?: string;
}

const BOOST_LABEL = {
  shield: () => [t('boost.shield', 'Escudo'), t('boost.shield.pl', 'Escudos')],
  magnet: () => [t('boost.magnet', 'Ímã'), t('boost.magnet.pl', 'Ímãs')],
  headstart: () => [t('boost.headstart', 'Largada Turbo'), t('boost.headstart.pl', 'Largadas Turbo')],
} as const;
const BOOST_ICON: Record<'shield' | 'magnet' | 'headstart', IconName> = { shield: 'shield', magnet: 'magnet', headstart: 'rocket' };

/** Junta vários pacotes em um (para "Pegar tudo"). */
export function mergePacks(packs: RewardPack[]): CelebratePack {
  const out: CelebratePack = {};
  for (const p of packs) {
    if (p.coins) out.coins = (out.coins ?? 0) + p.coins;
    if (p.gems) out.gems = (out.gems ?? 0) + p.gems;
    if (p.skins?.length) out.skins = [...new Set([...(out.skins ?? []), ...p.skins])];
    if (p.trails?.length) out.trails = [...new Set([...(out.trails ?? []), ...p.trails])];
    if (p.noAds) out.noAds = true;
    if (p.boosts) {
      const b = (out.boosts ??= {});
      for (const k of ['shield', 'magnet', 'headstart'] as const) if (p.boosts[k]) b[k] = (b[k] ?? 0) + p.boosts[k]!;
    }
  }
  return out;
}

function tiles(p: CelebratePack, big: boolean): Tile[] {
  const out: Tile[] = [];
  const sz = big ? 96 : 40;
  for (const id of p.skins ?? []) {
    const s = SKINS.find((x) => x.id === id);
    if (!s) continue;
    out.push({ art: renderSkinPreview(s, sz, 0.4), amount: skinName(s), label: t('cel.skinOf', 'Skin {r}', { r: RARITY_INFO[s.rarity].label.toLowerCase() }), cls: `r-${s.rarity}` });
  }
  for (const id of p.trails ?? []) {
    const tl = TRAILS.find((x) => x.id === id);
    if (!tl) continue;
    out.push({ art: renderTrailPreview(tl, sz), amount: trailName(tl), label: t('cel.trailOf', 'Rastro {r}', { r: RARITY_INFO[tl.rarity].label.toLowerCase() }), cls: `r-${tl.rarity}` });
  }
  if (p.gems) out.push({ art: icon(p.gems >= 500 ? 'gem-chest' : p.gems >= 100 ? 'gem-heap' : p.gems >= 20 ? 'gem-pile' : 'gem'), amount: `+${fmt(p.gems)}`, label: t('cel.gems', 'gemas'), plate: 'violet' });
  if (p.coins) out.push({ art: icon(p.coins >= 100 ? 'coins' : 'coin'), amount: `+${fmt(p.coins)}`, label: t('cel.coins', 'moedas'), plate: 'gold' });
  for (const k of ['shield', 'magnet', 'headstart'] as const) {
    const n = p.boosts?.[k];
    if (n) out.push({ art: icon(BOOST_ICON[k]), amount: `+${n}`, label: BOOST_LABEL[k]()[n === 1 ? 0 : 1], plate: k === 'magnet' ? 'pink' : k === 'shield' ? 'cyan' : 'gold' });
  }
  if (p.coinDoubler) out.push({ art: icon('coins'), amount: '2x', label: t('cel.coinsForever', 'moedas para sempre'), plate: 'green' });
  if (p.noAds) out.push({ art: icon('no-ads'), amount: t('shop.noAds', 'Sem anúncios'), label: t('cel.forever', 'para sempre'), plate: 'violet' });
  for (const e of p.extras ?? []) out.push({ art: icon(e.icon), amount: e.label, label: '', plate: e.plate ?? 'violet' });
  return out;
}

/** Chips pequenos de prévia (lista de presentes / desafios). */
export function packChips(p: RewardPack): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chips';
  for (const t of tiles(p, false)) {
    const c = document.createElement('span');
    c.className = `chip ${t.cls ?? ''}`;
    if (typeof t.art === 'string') c.insertAdjacentHTML('beforeend', t.art);
    else c.appendChild(t.art);
    c.insertAdjacentHTML('beforeend', `<b>${esc(t.amount)}</b>`);
    wrap.appendChild(c);
  }
  if (!wrap.children.length) wrap.innerHTML = `<span class="chip">${icon('gift')}<b>${t('cel.surprise', 'Surpresa')}</b></span>`;
  return wrap;
}

/* ============================== modal ============================== */

const queue: { pack: CelebratePack; opts: CelebrateOpts; done: () => void }[] = [];
let active = false;

/** Mostra a celebração (enfileira se já houver uma aberta). Resolve ao fechar. */
export function celebrate(pack: CelebratePack, opts: CelebrateOpts = {}): Promise<void> {
  return new Promise((done) => {
    queue.push({ pack, opts, done });
    if (!active) next();
  });
}

export const celebrating = (): boolean => active;

function next(): void {
  const job = queue.shift();
  if (!job) {
    active = false;
    return;
  }
  active = true;
  open(job.pack, job.opts, () => {
    job.done();
    next();
  });
}

function open(pack: CelebratePack, opts: CelebrateOpts, onClose: () => void): void {
  const root = document.createElement('div');
  root.className = 'celebrate';
  const list = tiles(pack, true);
  const one = list.length === 1;
  root.innerHTML = `
    <canvas class="cel-confetti"></canvas>
    <div class="cel-box">
      <div class="cel-rays"></div>
      <div class="cel-glow"></div>
      <div class="cel-title">${esc(opts.title ?? t('cel.won', 'VOCÊ GANHOU!'))}</div>
      ${opts.subtitle ? `<div class="cel-sub">${esc(opts.subtitle)}</div>` : ''}
      <div class="cel-items ${one ? 'one' : ''}"></div>
      <button class="btn btn-play small cel-ok">${esc(opts.button ?? t('cel.ok', 'OBA!'))}</button>
    </div>`;
  const items = root.querySelector<HTMLElement>('.cel-items')!;
  list.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = `cel-item ${t.cls ?? ''}`;
    el.style.animationDelay = `${0.25 + i * 0.12}s`;
    const art = document.createElement('div');
    art.className = t.plate ? `cel-art plate plate-${t.plate}` : 'cel-art';
    if (typeof t.art === 'string') art.innerHTML = t.art;
    else art.appendChild(t.art);
    el.appendChild(art);
    el.insertAdjacentHTML('beforeend', `<b>${esc(t.amount)}</b>${t.label ? `<small>${esc(t.label)}</small>` : ''}`);
    items.appendChild(el);
  });
  if (!list.length) items.innerHTML = `<div class="cel-item"><div class="cel-art plate plate-gold">${icon('gift')}</div><b>${t('inbox.gift', 'Presente')}</b></div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('on'));

  audio.unlock2();
  setTimeout(() => audio.cash(), 260);
  haptics.success();

  const stop = confetti(root.querySelector('canvas')!);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stop();
    root.classList.remove('on');
    root.classList.add('off');
    setTimeout(() => {
      root.remove();
      onClose();
    }, 220);
  };
  root.querySelector<HTMLButtonElement>('.cel-ok')!.onclick = (e) => {
    e.stopPropagation();
    close();
  };
  // fecha tocando fora depois de um instante (evita fechar sem querer)
  setTimeout(() => {
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
  }, 700);
}

/** Confete em canvas por ~3,5 s. Retorna função para parar. */
function confetti(c: HTMLCanvasElement): () => void {
  const d = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  c.width = W * d;
  c.height = H * d;
  const x = c.getContext('2d')!;
  x.scale(d, d);
  const cols = ['#ff5cc8', '#5ef0ff', '#ffcf2e', '#3ee07a', '#8a5cff', '#ffffff'];
  const parts = Array.from({ length: 110 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -10 : W + 10,
      y: H * (0.35 + Math.random() * 0.3),
      vx: (fromLeft ? 1 : -1) * (180 + Math.random() * 420),
      vy: -(380 + Math.random() * 520),
      r: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      c: cols[i % cols.length],
      delay: Math.random() * 0.35,
    };
  });
  let raf = 0;
  let last = performance.now();
  const t0 = last;
  const tick = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const age = (t - t0) / 1000;
    x.clearRect(0, 0, W, H);
    for (const p of parts) {
      if (age < p.delay) continue;
      p.vy += 900 * dt;
      p.vx *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      x.save();
      x.globalAlpha = Math.max(0, Math.min(1, 4 - age));
      x.translate(p.x, p.y);
      x.rotate(p.r);
      x.scale(1, Math.cos(p.r * 1.7));
      x.fillStyle = p.c;
      x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      x.restore();
    }
    if (age < 4) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
