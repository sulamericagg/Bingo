/* ============================================================
 *  CRIE SEU BLOOP — editor de personagem (tela cheia).
 *  Prévia animada grande, abas por slot, grade de peças com miniatura
 *  NO personagem atual, provar antes de comprar, compra por moedas,
 *  gemas, vídeo, dinheiro real (Play Billing) e peças de evento.
 * ============================================================ */
import './creator.css';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import type { ProductDef } from '../config';
import { audio } from '../core/audio';
import { canAfford, spend } from '../core/economy';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { isAndroid } from '../core/platform';
import { persist, save } from '../core/storage';
import {
  avatarRarity,
  avatarStyle,
  type AvatarData,
  isFreePart,
  ownsColor,
  ownsPart,
  type Part,
  PART_PRODUCTS,
  PALETTES,
  partById,
  partName,
  partsOf,
  SLOT_LABEL,
  SLOTS,
  type Slot,
  syncCustomSkin,
} from '../game/avatar';
import type { PlayerPose } from '../game/character';
import type { Game } from '../game/game';
import { drawAvatar } from '../game/avatar';
import { drawRarityBackdrop, renderAvatarPreview } from '../game/preview';
import { RARITY_INFO, type Rarity } from '../game/skins';
import { showRewarded } from '../services/ads';
import { buy } from '../services/billing';
import { ensureIconDefs, hydrateIcons, icon, type IconName } from './icons';
import { notify } from './notify';
import { t } from '../i18n';

/* ---------------------------- ícones das abas (mesmo estilo de icons.ts) ---------------------------- */

const INK = '#2a0b5c';
const sil = (shapes: string, g: string, w = 3) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="${w * 2}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="url(#bo-${g})">${shapes}</g>`;
const hl = (shapes: string, o = 0.55) => `<g fill="#fff" opacity="${o}">${shapes}</g>`;
const svg = (body: string, size = 26) => `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;

const TAB_ICON: Record<Slot, string> = {
  body: sil('<path d="M10 27C9 15 19 8 27 10C37 11 41 20 39 29C37 38 29 41 22 40C14 39 11 34 10 27Z"/>', 'pink') + hl('<ellipse cx="18" cy="17" rx="5" ry="2.6" transform="rotate(-30 18 17)"/>') + `<circle cx="20" cy="26" r="2.4" fill="${INK}"/><circle cx="30" cy="25" r="2.4" fill="${INK}"/>`,
  material: sil('<path d="M24 6C24 6 11 21 11 30A13 13 0 0 0 37 30C37 21 24 6 24 6Z"/>', 'gem') + hl('<ellipse cx="18" cy="28" rx="3" ry="6" transform="rotate(20 18 28)"/>'),
  pattern: sil('<circle cx="24" cy="25" r="16"/>', 'violet') + `<g fill="#fff" opacity=".85"><circle cx="17" cy="20" r="4"/><circle cx="30" cy="30" r="5"/><circle cx="29" cy="16" r="2.5"/><circle cx="16" cy="32" r="2.5"/></g>`,
  eyes: sil('<path d="M5 25C12 13 36 13 43 25C36 37 12 37 5 25Z"/>', 'white') + `<circle cx="24" cy="25" r="8" fill="url(#bo-cyan)" stroke="${INK}" stroke-width="2.5"/><circle cx="24" cy="25" r="3.6" fill="${INK}"/><circle cx="21" cy="22" r="2.2" fill="#fff"/>`,
  mouth: sil('<path d="M8 18C18 22 30 22 40 18C39 32 31 39 24 39C17 39 9 32 8 18Z"/>', 'red') + `<path d="M15 32C20 28 28 28 33 32C30 36 18 36 15 32Z" fill="#ff9fb8"/><rect x="13" y="19" width="22" height="5" rx="2" fill="#fff"/>`,
  head: sil('<path d="M8 36L6 14L16 22L24 9L32 22L42 14L40 36Z"/>', 'gold') + `<circle cx="24" cy="29" r="3.2" fill="#ff4f6a" stroke="${INK}" stroke-width="2"/>` + hl('<path d="M11 19L14 33L12 33Z"/>', 0.6),
  face: `<path d="M4 20H44" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` + sil('<rect x="6" y="16" width="15" height="13" rx="6"/><rect x="27" y="16" width="15" height="13" rx="6"/>', 'violet') + hl('<rect x="9" y="19" width="5" height="3" rx="1.5"/><rect x="30" y="19" width="5" height="3" rx="1.5"/>', 0.7),
  back: sil('<path d="M8 38C6 24 14 10 40 8C38 16 34 18 30 19C35 20 37 21 38 24C34 27 30 27 27 27C30 29 31 31 31 33C24 36 16 36 8 38Z"/>', 'white') + `<path d="M12 33C18 24 24 18 33 13" stroke="#c8b9f5" stroke-width="2" fill="none"/>`,
  aura: sil('<path d="M24 4Q26.5 21.5 44 24Q26.5 26.5 24 44Q21.5 26.5 4 24Q21.5 21.5 24 4Z"/>', 'gold') + `<path d="M38 6Q39 11 44 12Q39 13 38 18Q37 13 32 12Q37 11 38 6Z" fill="#fff"/>`,
};

/* ---------------------------- miniatura: foco por slot ---------------------------- */

const FOCUS: Record<Slot, [number, number]> = {
  body: [0, 1],
  material: [0, 1.05],
  pattern: [0, 1.1],
  eyes: [-0.1, 1.75],
  mouth: [0.15, 1.75],
  head: [-0.5, 0.95],
  face: [0, 1.5],
  back: [-0.1, 0.92],
  aura: [0, 0.9],
};

/** Looks prontos para "provar" (vitrine de peças premium). */
const DREAM_LOOKS: { name: string; av: AvatarData }[] = [
  {
    get name() { return t('look.dragon', 'Dragão Lendário'); },
    av: { parts: { body: 'b_round', material: 'm_lava', pattern: 'p_scales', eyes: 'e_fire', mouth: 'mo_fangs', head: 'h_horns', face: 'f_none', back: 'k_dragon', aura: 'a_fire' }, colors: { primary: '#ff6a3d', secondary: '#ffe36b' } },
  },
  {
    get name() { return t('look.cosmic', 'Cósmico Mítico'); },
    av: { parts: { body: 'b_round', material: 'm_galaxy', pattern: 'p_runes', eyes: 'e_star', mouth: 'mo_smile', head: 'h_flame', face: 'f_none', back: 'k_phoenix', aura: 'a_moons' }, colors: { primary: '#7a3dff', secondary: '#00fff0' } },
  },
  {
    get name() { return t('look.royal', 'Realeza Dourada'); },
    av: { parts: { body: 'b_round', material: 'm_gold', pattern: 'p_none', eyes: 'e_big', mouth: 'mo_gold', head: 'h_crown', face: 'f_monocle', back: 'k_angel', aura: 'a_sparkle' }, colors: { primary: '#ffd23f', secondary: '#ff2e63' } },
  },
  {
    get name() { return t('look.cyber', 'Ciber Neon'); },
    av: { parts: { body: 'b_square', material: 'm_neon', pattern: 'p_circuit', eyes: 'e_visor', mouth: 'mo_robot', head: 'h_headphones', face: 'f_cyber', back: 'k_mech', aura: 'a_electric' }, colors: { primary: '#ff2bd6', secondary: '#00fff0' } },
  },
];

/* ---------------------------- estado ---------------------------- */

let game: Game | null = null;
let root: HTMLElement;
let stageCv: HTMLCanvasElement;
let tab: Slot = 'body';
let colorTarget: 'primary' | 'secondary' = 'primary';
let colorMode: 'colors' | 'finish' = 'colors';
let draft: AvatarData = clone(save.avatar);
/** última peça tocada (para a barra de compra) */
let sel: Part | null = null;
let open = false;
let raf = 0;
let clock = 0;
let lastTs = 0;
let jumpT = 0;
let happyT = 0;
let blinkT = 2;
let flyPose = false;
let dreamIdx = 0;
let exitArmed = 0;

function clone(a: AvatarData): AvatarData {
  return { parts: { ...a.parts }, colors: { ...a.colors } };
}
const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/* ============================================================
 *  INIT
 * ============================================================ */

export function initCreator(g: Game): void {
  game = g;
  syncCustomSkin();
  build();
  const btn = document.getElementById('btn-creator');
  if (btn) {
    btn.addEventListener('click', () => openCreator());
    refreshTile();
  }
  bus.on('wallet', () => open && refreshWallet());
  bus.on('purchase', (def: ProductDef) => {
    const pp = PART_PRODUCTS.find((p) => p.id === def?.id);
    if (pp) unlockPart(pp.part, true);
  });
  restoreIap();
}

export function isCreatorOpen(): boolean {
  return open;
}

export function openCreator(): void {
  if (open) return;
  open = true;
  draft = clone(save.avatar);
  sel = null;
  exitArmed = 0;
  if (!save.tips.creator) {
    save.tips.creator = 1;
    persist();
    refreshTile();
  }
  root.classList.add('on');
  audio.click();
  renderAll();
  lastTs = performance.now();
  raf = requestAnimationFrame(loop);
}

/** Fecha o editor (botão voltar do Android). Retorna true se estava aberto. */
export function closeCreator(force = true): boolean {
  if (!open) return false;
  if (!force && dirty() && performance.now() - exitArmed > 2500) {
    exitArmed = performance.now();
    toast(t('creator.unsaved', 'Alterações não salvas — toque de novo para sair'), 'warning');
    return true;
  }
  open = false;
  root.classList.remove('on');
  cancelAnimationFrame(raf);
  return true;
}

function dirty(): boolean {
  return JSON.stringify(draft) !== JSON.stringify(save.avatar);
}

/* ============================================================
 *  DOM
 * ============================================================ */

function build(): void {
  ensureIconDefs();
  root = document.createElement('section');
  root.id = 'creator';
  root.className = 'cr';
  root.innerHTML = `
    <header class="cr-top">
      <button class="icon-btn cr-close" aria-label="${t('common.close', 'Fechar')}" data-icon="close"></button>
      <h2>${t('creator.title1', 'CRIE SEU')} <b>BLOOP</b></h2>
      <div class="pill cr-pill"><i class="coin"></i><span class="cr-coins">0</span></div>
      <button class="pill cr-pill cr-gems-btn"><i class="gem"></i><span class="cr-gems">0</span></button>
    </header>
    <div class="cr-stage">
      <canvas class="cr-cv"></canvas>
      <div class="cr-rar"></div>
      <div class="cr-style"><small>${t('creator.style', 'ESTILO')}</small><div class="cr-bar"><i></i></div></div>
      <div class="cr-stage-btns">
        <button class="cr-chip cr-pose"></button>
        <button class="cr-chip cr-dream"><span data-icon="sparkle" data-size="18"></span>${t('creator.tryLook', 'Provar look')}</button>
        <button class="cr-chip cr-rand"><span data-icon="refresh" data-size="18"></span>${t('creator.random', 'Aleatório')}</button>
      </div>
      <div class="cr-tip">${t('creator.tap', 'Toque no seu Bloop!')}</div>
    </div>
    <nav class="cr-tabs"></nav>
    <div class="cr-body"></div>
    <footer class="cr-foot">
      <div class="cr-buybar hidden">
        <div class="cr-buyinfo"><b class="cr-buyname"></b><span class="cr-buyrar"></span></div>
        <button class="cr-buy"></button>
      </div>
      <button class="btn btn-green cr-save"><span data-icon="check"></span> ${t('creator.save', 'Salvar e usar')}</button>
    </footer>
    <div class="cr-toast"></div>`;
  (document.getElementById('ui') ?? document.body).appendChild(root);
  hydrateIcons(root);
  stageCv = $('.cr-cv') as HTMLCanvasElement;

  const tabs = $('.cr-tabs');
  for (const s of SLOTS) {
    const b = document.createElement('button');
    b.dataset.slot = s;
    b.innerHTML = `${svg(TAB_ICON[s])}<span>${SLOT_LABEL[s]}</span>`;
    b.onclick = () => {
      if (tab === s) return;
      tab = s;
      audio.click();
      haptics.tap();
      renderTabs();
      renderBody();
      $('.cr-body').scrollTop = 0;
    };
    tabs.appendChild(b);
  }

  $('.cr-close').onclick = () => closeCreator(false);
  $('.cr-gems-btn').onclick = () => goGemShop();
  $('.cr-save').onclick = () => saveAndUse();
  $('.cr-rand').onclick = () => randomize();
  $('.cr-dream').onclick = () => tryDream();
  $('.cr-pose').onclick = () => {
    flyPose = !flyPose;
    audio.click();
    renderPose();
  };
  $('.cr-buy').onclick = () => onBuyBar();
  stageCv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.unlock();
    if (jumpT <= 0) {
      jumpT = 0.7;
      happyT = 1.3;
      audio.jump(0);
      haptics.tap('medium');
      $('.cr-tip').classList.add('gone');
    }
  });
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') closeCreator(false);
  });
}

function renderAll(): void {
  renderTabs();
  renderBody();
  renderStageInfo();
  renderBuyBar();
  renderPose();
  refreshWallet();
}

function refreshWallet(): void {
  $('.cr-coins').textContent = String(save.coins);
  $('.cr-gems').textContent = String(save.gems);
}

function renderPose(): void {
  $('.cr-pose').innerHTML = `<span data-icon="${flyPose ? 'rocket' : 'user'}" data-size="18"></span>${flyPose ? t('creator.flying', 'Voando') : t('creator.standing', 'Parado')}`;
  hydrateIcons($('.cr-pose'));
}

function renderTabs(): void {
  root.querySelectorAll<HTMLButtonElement>('.cr-tabs button').forEach((b) => {
    const s = b.dataset.slot as Slot;
    b.classList.toggle('active', s === tab);
    const p = partById(draft.parts[s]);
    b.classList.toggle('trying', !!p && !ownsPart(p.id));
  });
}

function renderStageInfo(): void {
  const r = avatarRarity(draft);
  const info = RARITY_INFO[r];
  const el = $('.cr-rar');
  el.className = `cr-rar r-${r}`;
  el.textContent = info.label;
  const st = avatarStyle(draft);
  const bar = $('.cr-bar i');
  bar.style.width = `${Math.max(6, Math.round(st * 100))}%`;
  bar.style.background = `linear-gradient(90deg, ${info.gradient[0]}, ${info.gradient[1]})`;
}

/* ---------------------------- grade de peças ---------------------------- */

function priceHtml(p: Part): string {
  const pr = p.price;
  if (pr.event) return `<span class="cr-price ev">${icon('trophy', { size: 16 })}Evento</span>`;
  if (pr.iap) return `<span class="cr-price iap">${PART_PRODUCTS.find((x) => x.part === p.id)?.fallbackPrice ?? 'R$'}</span>`;
  if (pr.ads) return `<span class="cr-price ad">${icon('video', { size: 16 })}${save.adProgress['part:' + p.id] ?? 0}/${pr.ads}</span>`;
  if (pr.gems) return `<span class="cr-price${canAfford(pr) ? '' : ' cant'}"><i class="gem"></i>${pr.gems}</span>`;
  if (pr.coins) return `<span class="cr-price${canAfford(pr) ? '' : ' cant'}"><i class="coin"></i>${pr.coins}</span>`;
  return '';
}

function partCard(p: Part, slot: Slot): HTMLElement {
  const owned = ownsPart(p.id);
  const on = draft.parts[slot] === p.id;
  const el = document.createElement('button');
  el.className = `cr-card q-${p.rarity}${on ? ' on' : ''}${owned ? '' : ' locked'}`;
  const av = clone(draft);
  av.parts[slot] = p.id;
  const [fy, z] = FOCUS[slot];
  const cv = renderAvatarPreview(av, 84, 0.6 + (p.id.length % 5) * 0.37, { focusY: fy, zoom: z, backdrop: false });
  el.appendChild(cv);
  const status = on ? (owned ? `<span class="cr-price eq">${icon('check', { size: 16 })}${t('creator.using', 'Usando')}</span>` : `<span class="cr-price try">${t('creator.trying', 'Provando')}</span>`) : owned ? `<span class="cr-price own">${t('creator.yours', 'Seu')}</span>` : priceHtml(p);
  el.insertAdjacentHTML('beforeend', `<span class="cr-tag">${RARITY_INFO[p.rarity].label}</span><span class="cr-name">${esc(partName(p))}</span>${status}`);
  el.onclick = () => pickPart(p, slot);
  return el;
}

function renderBody(): void {
  const body = $('.cr-body');
  body.innerHTML = '';
  if (tab === 'material') {
    const seg = document.createElement('div');
    seg.className = 'cr-seg';
    for (const [k, label] of [['colors', 'Cores'], ['finish', 'Acabamento']] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = colorMode === k ? 'active' : '';
      b.onclick = () => {
        if (colorMode === k) return;
        colorMode = k;
        audio.click();
        renderBody();
      };
      seg.appendChild(b);
    }
    body.appendChild(seg);
    if (colorMode === 'colors') {
      body.appendChild(colorsSection());
      return;
    }
  }
  const grid = document.createElement('div');
  grid.className = 'cr-grid';
  for (const p of partsOf(tab)) grid.appendChild(partCard(p, tab));
  body.appendChild(grid);
  const owned = partsOf(tab).filter((p) => ownsPart(p.id)).length;
  body.insertAdjacentHTML('beforeend', `<p class="cr-count">${t('creator.count', '{n}/{total} peças de {slot} desbloqueadas', { n: owned, total: partsOf(tab).length, slot: SLOT_LABEL[tab].toLowerCase() })}</p>`);
}

function colorsSection(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cr-colors';
  const tgt = document.createElement('div');
  tgt.className = 'cr-target';
  for (const k of ['primary', 'secondary'] as const) {
    const b = document.createElement('button');
    b.className = k === colorTarget ? 'active' : '';
    b.innerHTML = `<i style="background:${draft.colors[k]}"></i>${k === 'primary' ? t('creator.color1', 'Cor principal') : t('creator.color2', 'Cor detalhe')}`;
    b.onclick = () => {
      colorTarget = k;
      audio.click();
      renderBody();
    };
    tgt.appendChild(b);
  }
  wrap.appendChild(tgt);
  for (const pal of PALETTES) {
    const owned = ownsPart(pal.id);
    const row = document.createElement('div');
    row.className = `cr-pal q-${pal.rarity}${owned ? '' : ' locked'}`;
    row.innerHTML = `<div class="cr-pal-head"><b>${esc(partName(pal))}</b>${owned ? '' : priceHtml(pal)}</div>`;
    const sw = document.createElement('div');
    sw.className = 'cr-sw';
    for (const col of pal.colors!) {
      const b = document.createElement('button');
      b.style.background = col;
      if (draft.colors[colorTarget] === col) b.className = 'on';
      b.onclick = () => {
        draft.colors[colorTarget] = col;
        sel = owned ? null : pal;
        audio.click();
        haptics.tap();
        renderBody();
        renderBuyBar();
        renderStageInfo();
      };
      sw.appendChild(b);
    }
    row.appendChild(sw);
    wrap.appendChild(row);
  }
  wrap.insertAdjacentHTML('beforeend', `<div class="cr-sec-gap"></div>`);
  return wrap;
}

function pickPart(p: Part, slot: Slot): void {
  draft.parts[slot] = p.id;
  sel = ownsPart(p.id) ? null : p;
  audio.click();
  haptics.tap();
  happyT = Math.max(happyT, 0.6);
  renderBody();
  renderTabs();
  renderStageInfo();
  renderBuyBar();
}

/* ---------------------------- barra de compra ---------------------------- */

function unownedInDraft(): Part[] {
  const out: Part[] = [];
  for (const s of SLOTS) {
    const p = partById(draft.parts[s]);
    if (p && !ownsPart(p.id)) out.push(p);
  }
  for (const k of ['primary', 'secondary'] as const) {
    if (!ownsColor(draft.colors[k])) {
      const pal = PALETTES.find((x) => x.colors!.includes(draft.colors[k]));
      if (pal && !out.includes(pal)) out.push(pal);
    }
  }
  return out;
}

function renderBuyBar(): void {
  const bar = $('.cr-buybar');
  const list = unownedInDraft();
  if (sel && (ownsPart(sel.id) || !list.includes(sel))) sel = null;
  if (!sel && list.length) sel = list[0];
  if (!sel) {
    bar.classList.add('hidden');
    $('.cr-save').classList.remove('dim');
    return;
  }
  bar.classList.remove('hidden');
  $('.cr-save').classList.toggle('dim', list.length > 0);
  const p = sel;
  const info = RARITY_INFO[p.rarity];
  $('.cr-buyname').textContent = partName(p) + (list.length > 1 ? `  +${list.length - 1}` : '');
  const rr = $('.cr-buyrar');
  rr.textContent = `${info.label} · ${SLOT_LABEL[p.slot]}`;
  rr.style.color = info.color;
  const b = $('.cr-buy');
  const pr = p.price;
  b.className = 'cr-buy';
  if (pr.event) {
    b.classList.add('ev');
    b.innerHTML = `${icon('trophy', { size: 22 })}${t('creator.eventOnly', 'Só em evento')}`;
  } else if (pr.iap) {
    b.classList.add('iap');
    b.innerHTML = `${icon('bag', { size: 22 })}${t('creator.buy', 'Comprar')} ${PART_PRODUCTS.find((x) => x.part === p.id)?.fallbackPrice ?? ''}`;
  } else if (pr.ads) {
    b.classList.add('ad');
    b.innerHTML = `${icon('video', { size: 22 })}${t('shop.watch', 'Assistir')} ${save.adProgress['part:' + p.id] ?? 0}/${pr.ads}`;
  } else if (pr.gems) {
    if (!canAfford(pr)) b.classList.add('cant');
    b.innerHTML = `${t('creator.buyEquip', 'Comprar e equipar')} <i class="gem"></i>${pr.gems}`;
  } else if (pr.coins) {
    if (!canAfford(pr)) b.classList.add('cant');
    b.innerHTML = `${t('creator.buyEquip', 'Comprar e equipar')} <i class="coin"></i>${pr.coins}`;
  }
}

async function onBuyBar(): Promise<void> {
  if (!sel) return;
  await buyPart(sel);
}

async function buyPart(p: Part): Promise<void> {
  const pr = p.price;
  if (ownsPart(p.id)) return;
  if (pr.event) {
    toast(t('creator.eventOnly', 'Exclusivo de evento — vença os desafios para ganhar!'), 'trophy');
    return;
  }
  if (pr.iap) {
    const pp = PART_PRODUCTS.find((x) => x.part === p.id);
    if (!pp) return;
    const def: ProductDef = { id: pp.id, kind: 'vip', consumable: false, gems: 0, coins: 0, fallbackPrice: pp.fallbackPrice };
    const r = await buy(def);
    if (r === 'ok') unlockPart(p.id);
    else if (r === 'pending') toast(t('shop.pending', 'Pagamento pendente — você recebe assim que confirmar'), 'clock');
    else if (r === 'unavailable') toast(t('common.androidOnly', 'Disponível no app Android'), 'bag');
    else if (r === 'error') toast(t('shop.buyError', 'Não foi possível concluir a compra'), 'warning');
    return;
  }
  if (pr.ads) {
    const ok = await showRewarded();
    if (!ok) return toast(t('ads.videoUnavailable', 'Vídeo indisponível agora'), 'video');
    const k = 'part:' + p.id;
    save.adProgress[k] = (save.adProgress[k] ?? 0) + 1;
    persist();
    if (save.adProgress[k] >= pr.ads) unlockPart(p.id);
    else {
      toast(t('shop.keepWatching', '{n}/{total} — continue assistindo!', { n: save.adProgress[k], total: pr.ads }), 'video');
      renderBuyBar();
      renderBody();
    }
    return;
  }
  if (!spend(pr)) {
    if (pr.gems) toast(t('shop.noGems', 'Gemas insuficientes'), 'gem');
    else toast(t('shop.noCoinsPlay', 'Moedas insuficientes — jogue mais ou pegue grátis'), 'coin');
    haptics.tap('heavy');
    return;
  }
  audio.cash();
  unlockPart(p.id);
}

function unlockPart(id: string, silent = false): void {
  if (!save.ownedParts.includes(id)) save.ownedParts.push(id);
  persist();
  bus.emit('inventory');
  if (silent && !open) return;
  const p = partById(id);
  audio.unlock2();
  haptics.success();
  if (p) toast(t('creator.unlocked', '{name} desbloqueado!', { name: partName(p) }), 'party');
  happyT = 1.5;
  jumpT = 0.7;
  const st = $('.cr-stage');
  st.classList.remove('pop');
  void st.offsetWidth;
  st.classList.add('pop');
  if (open) {
    sel = null;
    renderAll();
  }
}

async function restoreIap(): Promise<void> {
  if (!isAndroid) return;
  setTimeout(async () => {
    try {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
      for (const t of purchases) {
        if (t.purchaseState === '2') continue;
        const pp = PART_PRODUCTS.find((x) => x.id === t.productIdentifier);
        if (pp && !save.ownedParts.includes(pp.part)) unlockPart(pp.part, true);
      }
    } catch {
      /* sem loja */
    }
  }, 4000);
}

function goGemShop(): void {
  closeCreator(true);
  (document.querySelector('#menu .gem-pill') as HTMLElement | null)?.click();
}

/* ---------------------------- ações ---------------------------- */

function randomize(): void {
  const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
  for (const s of SLOTS) {
    const owned = partsOf(s).filter((p) => ownsPart(p.id));
    // não sorteia "nada" sempre: prefere peças de verdade quando houver
    const real = owned.filter((p) => !p.id.endsWith('_none'));
    const pool = real.length && Math.random() < 0.8 ? real : owned;
    if (pool.length) draft.parts[s] = pick(pool).id;
  }
  const cols = PALETTES.filter((p) => ownsPart(p.id)).flatMap((p) => p.colors!);
  draft.colors.primary = pick(cols);
  const rest = cols.filter((c) => c !== draft.colors.primary);
  draft.colors.secondary = pick(rest.length ? rest : cols);
  sel = null;
  audio.click();
  haptics.tap('medium');
  jumpT = 0.7;
  happyT = 1.2;
  renderAll();
}

function tryDream(): void {
  const look = DREAM_LOOKS[dreamIdx % DREAM_LOOKS.length];
  dreamIdx++;
  draft = clone(look.av);
  sel = null;
  audio.unlock2();
  haptics.tap('medium');
  jumpT = 0.7;
  happyT = 1.4;
  const missing = unownedInDraft().length;
  toast(missing ? t('creator.tryingLook', 'Provando "{name}" — {n} peças para desbloquear', { name: look.name, n: missing }) : t('creator.haveAll', '"{name}" — você já tem tudo!', { name: look.name }), 'sparkle');
  renderAll();
}

function saveAndUse(): void {
  // peças/cores não compradas voltam ao que estava salvo
  let reverted = 0;
  for (const s of SLOTS) {
    if (!ownsPart(draft.parts[s])) {
      draft.parts[s] = ownsPart(save.avatar.parts[s]) ? save.avatar.parts[s] : partsOf(s).find((p) => isFreePart(p))!.id;
      reverted++;
    }
  }
  for (const k of ['primary', 'secondary'] as const) {
    if (!ownsColor(draft.colors[k])) {
      draft.colors[k] = ownsColor(save.avatar.colors[k]) ? save.avatar.colors[k] : PALETTES[0].colors![k === 'primary' ? 0 : 1];
      reverted++;
    }
  }
  save.avatar = clone(draft);
  save.skin = 'custom';
  syncCustomSkin();
  persist();
  bus.emit('cosmetics');
  game?.refreshCosmetics();
  refreshTile();
  audio.unlock2();
  haptics.success();
  if (reverted) {
    toast(t('creator.savedTrial', 'Salvo! Peças em teste voltaram ao normal'), 'check');
    renderAll();
    return;
  }
  toast(t('creator.ready', 'Seu Bloop está pronto!'), 'party');
  setTimeout(() => closeCreator(true), 450);
}

/* ---------------------------- tile do menu ---------------------------- */

function refreshTile(): void {
  const btn = document.getElementById('btn-creator');
  if (!btn) return;
  let plate = btn.querySelector<HTMLElement>('.cr-tile-art');
  if (!plate) {
    plate = document.createElement('span');
    plate.className = 'tile-ico plate plate-violet cr-tile-art';
    btn.prepend(plate);
    btn.querySelectorAll('[data-icon]').forEach((e) => e.remove());
  }
  plate.innerHTML = '';
  const cv = renderAvatarPreview(save.avatar, 52, 0.6, { backdrop: false, zoom: 1.05, focusY: 0.1 });
  plate.appendChild(cv);
  let badge = btn.querySelector<HTMLElement>('.badge');
  if (!badge) {
    badge = document.createElement('em');
    badge.className = 'badge';
    btn.appendChild(badge);
  }
  badge.textContent = t('common.new', 'NOVO');
  badge.classList.toggle('hidden', !!save.tips.creator);
}

/* ---------------------------- toast local ---------------------------- */

/** Aviso em pílula pequena no canto (padrão do app, ui/notify). */
function toast(msg: string, ico?: IconName): void {
  notify(msg, { icon: ico });
}

/* ============================================================
 *  PRÉVIA ANIMADA
 * ============================================================ */

const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };

function loop(ts: number): void {
  if (!open) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  clock += dt;
  jumpT = Math.max(0, jumpT - dt);
  happyT = Math.max(0, happyT - dt);
  blinkT -= dt;
  if (blinkT < -0.14) blinkT = 2 + Math.random() * 2.5;
  drawStage();
}

function drawStage(): void {
  const rect = stageCv.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width));
  const H = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (stageCv.width !== Math.round(W * dpr) || stageCv.height !== Math.round(H * dpr)) {
    stageCv.width = Math.round(W * dpr);
    stageCv.height = Math.round(H * dpr);
  }
  const x = stageCv.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  const rarity: Rarity = avatarRarity(draft);
  const R = Math.min(W, H) * 0.2;
  const cx = W / 2;
  const groundY = H * 0.86;
  const S = Math.max(W, H);
  x.save();
  x.translate((W - S) / 2, (H - S) / 2);
  drawRarityBackdrop(x, rarity, S, S / 2, S / 2 - H * 0.05, clock);
  x.restore();
  // planetinha (chão)
  const pg = x.createRadialGradient(cx - W * 0.15, groundY - H * 0.05, 0, cx, groundY + W * 0.9, W * 1.05);
  pg.addColorStop(0, '#8a6bff');
  pg.addColorStop(0.5, '#4b2fb8');
  pg.addColorStop(1, '#1a0b4a');
  x.fillStyle = pg;
  x.beginPath();
  x.ellipse(cx, groundY + W * 0.95, W * 1.15, W, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(200,180,255,0.5)';
  x.lineWidth = 2;
  x.stroke();
  // pulo
  let jy = 0;
  let sx = 1;
  let sy = 1;
  if (jumpT > 0) {
    const u = 1 - jumpT / 0.7;
    jy = Math.sin(u * Math.PI) * R * 1.1;
    if (u < 0.12) {
      sx = 1.15;
      sy = 0.85;
    } else if (u > 0.9) {
      sx = 1.1;
      sy = 0.9;
    } else {
      sx = 0.92;
      sy = 1.1;
    }
  }
  const fly = flyPose;
  const hover = fly ? Math.sin(clock * 2) * R * 0.12 + R * 0.5 : 0;
  const baseY = groundY - R * 1.02 - jy - hover;
  // sombra
  const sh = Math.max(0.25, 1 - (jy + hover) / (R * 2.5));
  x.fillStyle = `rgba(10,0,30,${0.35 * sh})`;
  x.beginPath();
  x.ellipse(cx, groundY - 2, R * 0.85 * sh, R * 0.18 * sh, 0, 0, Math.PI * 2);
  x.fill();
  pose.t = clock;
  pose.blink = blinkT < 0 ? 1 : 0;
  pose.lookX = Math.sin(clock * 0.7) * 0.5;
  pose.lookY = Math.sin(clock * 0.45) * 0.25;
  pose.sx = sx;
  pose.sy = sy;
  pose.mood = fly ? 'fly' : happyT > 0 ? 'happy' : 'idle';
  x.save();
  x.translate(cx, baseY);
  if (fly) x.rotate(Math.sin(clock * 1.3) * 0.08);
  drawAvatar(x, draft, R, pose);
  x.restore();
}
