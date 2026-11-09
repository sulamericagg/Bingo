/**
 * Tela "Coleção" dos bichinhos: grade por temporada, filtros de raridade, silhuetas dos
 * que faltam e detalhe animado com "Usar como foto de perfil" / "Levar como companheiro".
 * Carregada sob demanda (register.ts → openCollectionLazy).
 */
import './collection.css';
import type { CreatureRarity } from './api';
import { CREATURES, RARITIES, creatureById, type CreatureFull } from './catalog';
import { RARITY_COLORS, clearCreatureCaches, drawCreature, renderCreatureIcon } from './render';
import { SEASONS } from './seasons';
import {
  creaturePassLevel,
  getCompanion,
  getProfileCreature,
  markCreatureSeen,
  ownsCreature,
  setCompanion,
  setProfileCreature,
} from './state';
import { getLang, t } from '../i18n';
import { icon } from '../ui/icons';
import { tap } from '../core/haptics';
import { save } from '../core/storage';
import { gameFont } from '../i18n/font';

export function rarityLabel(r: CreatureRarity): string {
  switch (r) {
    case 'common': return t('creatures.r.common', 'Comum');
    case 'medio': return t('creatures.r.medio', 'Médio');
    case 'rare': return t('creatures.r.rare', 'Raro');
    case 'epic': return t('creatures.r.epic', 'Épico');
    default: return t('creatures.r.legendary', 'Lendário');
  }
}
const creatureName = (c: CreatureFull) => t(`creature.${c.id}`, c.name);
const creatureDesc = (c: CreatureFull) => t(`creature.${c.id}.desc`, c.desc);
const themeName = (s: number) => t(`season.${SEASONS[s].id}.theme`, SEASONS[s].theme);

function monthYear(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(getLang() === 'pt' ? 'pt-BR' : getLang(), { month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso.slice(0, 7);
  }
}

let root: HTMLElement | null = null;
let io: IntersectionObserver | null = null;
let filter: CreatureRarity | 'all' = 'all';
let onlyMine = false;
let raf = 0;

const ICON_PX = 76;

function paintCell(cv: HTMLCanvasElement): void {
  const id = cv.dataset.id!;
  const locked = !ownsCreature(id);
  const src = renderCreatureIcon(id, ICON_PX, { locked });
  cv.width = src.width;
  cv.height = src.height;
  cv.getContext('2d')!.drawImage(src, 0, 0);
  cv.dataset.painted = locked ? 'l' : 'o';
}

function cellHtml(c: CreatureFull): string {
  const owned = ownsCreature(c.id);
  const isNew = save.creaturesNew.includes(c.id);
  return `<button class="crc-cell r-${c.rarity}${owned ? '' : ' locked'}" data-id="${c.id}" aria-label="${owned ? creatureName(c) : t('creatures.locked', 'Bloqueado')}">
    <canvas data-id="${c.id}" width="1" height="1" style="width:${ICON_PX}px;height:${ICON_PX}px"></canvas>
    ${owned ? '' : '<span class="crc-q">?</span>'}
    ${isNew ? `<span class="crc-new">${t('creatures.new', 'Novo')}</span>` : ''}
    <span class="crc-name">${owned ? creatureName(c) : t('creatures.seasonShort', 'Temp. {n}', { n: c.season + 1 })}</span>
  </button>`;
}

function renderList(): void {
  if (!root) return;
  const list = root.querySelector<HTMLElement>('.crc-list')!;
  let html = '';
  if (filter !== 'all') {
    // filtro de raridade: grade única com todas as temporadas
    const all = CREATURES.filter((c) => c.rarity === filter);
    const items = all.filter((c) => !onlyMine || ownsCreature(c.id));
    const got = all.filter((c) => ownsCreature(c.id)).length;
    const [rc] = RARITY_COLORS[filter];
    if (items.length)
      html = `<section class="crc-season" style="--sa:${rc};--sb:${rc};--sbg:#1a0c40">
        <header><b>${rarityLabel(filter)}</b><span></span><em>${got}/${all.length}</em></header>
        <div class="crc-grid">${items.map(cellHtml).join('')}</div>
      </section>`;
  } else for (const s of SEASONS) {
    const items = CREATURES.slice(s.index * 5, s.index * 5 + 5).filter((c) => (filter === 'all' || c.rarity === filter) && (!onlyMine || ownsCreature(c.id)));
    if (!items.length) continue;
    const got = CREATURES.slice(s.index * 5, s.index * 5 + 5).filter((c) => ownsCreature(c.id)).length;
    html += `<section class="crc-season" style="--sa:${s.palette[1]};--sb:${s.palette[2]};--sbg:${s.palette[0]}">
      <header><b>${t('creatures.season', 'Temporada {n}', { n: s.index + 1 })}</b><span>${themeName(s.index)}</span><em>${monthYear(s.start)} · ${got}/5</em></header>
      <div class="crc-grid">${items.map(cellHtml).join('')}</div>
    </section>`;
  }
  if (!html) html = `<p class="crc-empty">${t('creatures.empty', 'Nenhum bichinho aqui ainda. Jogue o Passe para ganhar!')}</p>`;
  list.innerHTML = html;
  io?.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const cv = e.target as HTMLCanvasElement;
        io!.unobserve(cv);
        paintCell(cv);
      }
    },
    { root: list, rootMargin: '200px 0px' },
  );
  list.querySelectorAll('canvas').forEach((cv) => io!.observe(cv));
}

function updateCount(): void {
  if (!root) return;
  const n = CREATURES.filter((c) => ownsCreature(c.id)).length;
  root.querySelector('.crc-count')!.textContent = `${n}/${CREATURES.length}`;
  const bar = root.querySelector<HTMLElement>('.crc-bar i');
  if (bar) bar.style.width = `${(n / CREATURES.length) * 100}%`;
}

export function openCollection(focusId?: string): void {
  if (root) return;
  filter = 'all';
  onlyMine = false;
  root = document.createElement('div');
  root.className = 'crc-overlay';
  const chips = (['all', ...RARITIES] as const)
    .map((r) => `<button class="crc-chip${r === 'all' ? ' on' : ''}" data-f="${r}" style="--rc:${r === 'all' ? '#c6b6ff' : RARITY_COLORS[r][0]}">${r === 'all' ? t('creatures.all', 'Todos') : rarityLabel(r)}</button>`)
    .join('');
  root.innerHTML = `<div class="crc-panel" role="dialog" aria-label="${t('creatures.title', 'Coleção')}">
    <header class="crc-head">
      <h2>${icon('sparkle', { size: 26 })} ${t('creatures.title', 'Coleção')}</h2>
      <div class="crc-progress"><span class="crc-count"></span><div class="crc-bar"><i></i></div></div>
      <button class="crc-close" aria-label="${t('common.close', 'Fechar')}">${icon('close', { size: 30 })}</button>
    </header>
    <nav class="crc-filters">${chips}<button class="crc-chip crc-mine" data-mine style="--rc:#5ef0ff">${t('creatures.onlyMine', 'Só os meus')}</button></nav>
    <div class="crc-list"></div>
  </div>`;
  document.body.append(root);
  updateCount();
  renderList();
  root.querySelector('.crc-close')!.addEventListener('click', closeCollection);
  root.querySelector('.crc-filters')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    tap();
    if (b.dataset.mine !== undefined) {
      onlyMine = !onlyMine;
      b.classList.toggle('on', onlyMine);
    } else {
      filter = b.dataset.f as CreatureRarity | 'all';
      root!.querySelectorAll('.crc-chip[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    }
    renderList();
  });
  root.querySelector('.crc-list')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.crc-cell');
    if (!b) return;
    tap();
    openDetail(b.dataset.id!);
  });
  if (focusId && creatureById(focusId)) openDetail(focusId);
}

export function closeCollection(): void {
  cancelAnimationFrame(raf);
  io?.disconnect();
  io = null;
  root?.remove();
  root = null;
  markCreatureSeen();
  clearCreatureCaches();
}

function openDetail(id: string): void {
  const c = creatureById(id);
  if (!c || !root) return;
  const owned = ownsCreature(id);
  const s = SEASONS[c.season];
  const [rc] = RARITY_COLORS[c.rarity];
  const lvl = creaturePassLevel(c.season, c.rarity);
  const box = document.createElement('div');
  box.className = 'crc-detail';
  box.innerHTML = `<div class="crc-card r-${c.rarity}" style="--rc:${rc};--sa:${s.palette[1]};--sbg:${s.palette[0]}">
    <button class="crc-close" aria-label="${t('common.close', 'Fechar')}">${icon('close', { size: 28 })}</button>
    <div class="crc-stage"><canvas></canvas></div>
    <span class="crc-rar">${rarityLabel(c.rarity)}</span>
    <h3>${owned ? creatureName(c) : '???'}</h3>
    <p class="crc-theme">${t('creatures.season', 'Temporada {n}', { n: c.season + 1 })} · ${themeName(c.season)}</p>
    ${
      owned
        ? `<p class="crc-desc">${creatureDesc(c)}</p>
           <div class="crc-actions">
             <button class="crc-btn" data-act="photo"></button>
             <button class="crc-btn alt" data-act="pet"></button>
           </div>`
        : `<p class="crc-desc">${icon('lock', { size: 18 })} ${
            lvl
              ? t('creatures.lockedAt', 'Recompensa do Passe da temporada {n} ({month}), nível {lvl}.', { n: c.season + 1, month: monthYear(s.start), lvl })
              : t('creatures.lockedSeason', 'Recompensa do Passe da temporada {n} ({month}).', { n: c.season + 1, month: monthYear(s.start) })
          }</p>`
    }
  </div>`;
  root.append(box);
  markCreatureSeen(id);
  const cell = root.querySelector(`.crc-cell[data-id="${id}"] .crc-new`);
  cell?.remove();

  const refresh = () => {
    const ph = box.querySelector<HTMLButtonElement>('[data-act="photo"]');
    const pe = box.querySelector<HTMLButtonElement>('[data-act="pet"]');
    if (ph) {
      const on = getProfileCreature() === id;
      ph.innerHTML = `${icon('user', { size: 20 })} ${on ? t('creatures.photoOn', 'Foto de perfil atual') : t('creatures.photo', 'Usar como foto de perfil')}`;
      ph.classList.toggle('on', on);
    }
    if (pe) {
      const on = getCompanion() === id;
      pe.innerHTML = `${icon('heart', { size: 20 })} ${on ? t('creatures.petOn', 'Companheiro atual') : t('creatures.pet', 'Levar como companheiro')}`;
      pe.classList.toggle('on', on);
    }
  };
  refresh();
  box.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'photo') {
      setProfileCreature(getProfileCreature() === id ? '' : id);
      tap('medium');
      refresh();
    } else if (act === 'pet') {
      setCompanion(getCompanion() === id ? '' : id);
      tap('medium');
      refresh();
    } else if (el === box || el.closest('.crc-close')) {
      cancelAnimationFrame(raf);
      box.remove();
    }
  });

  // palco animado (ou silhueta estática)
  const cv = box.querySelector<HTMLCanvasElement>('.crc-stage canvas')!;
  const size = 220;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = size * dpr;
  cv.style.width = cv.style.height = `${size}px`;
  const ctx = cv.getContext('2d')!;
  if (!owned) {
    ctx.setTransform(dpr, 0, 0, dpr, (size / 2) * dpr, size * 0.52 * dpr);
    drawCreature(ctx, id, size * 0.78, 0, { still: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#0d0624';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = gameFont(700, 56 * dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cv.width / 2, cv.height * 0.55);
    return;
  }
  cancelAnimationFrame(raf);
  const t0 = performance.now();
  let happyUntil = t0 + 1200;
  cv.addEventListener('click', () => {
    happyUntil = performance.now() + 1500;
    tap();
  });
  const loop = (now: number) => {
    if (!box.isConnected) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size * 0.52 * dpr);
    drawCreature(ctx, id, size * 0.78, (now - t0) / 1000, { mood: now < happyUntil ? 'happy' : 'idle' });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
