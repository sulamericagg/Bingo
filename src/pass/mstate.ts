/* ============================================================
 *  PASSE MUSICAL — estado, XP, resgates, compra e desafios semanais.
 *  Conteúdo (60 temporadas) vem de ./music/index (agente "canções"):
 *  musicPassSeason(i).levels, grantMusicReward(r), musicItemName(r).
 *
 *  XP: partidas do Bloop Banda (run-end com game 'band': +120, +80 se venceu)
 *      + 40% do XP de qualquer partida. Desafios semanais musicais.
 *  Emite: 'mpass' (mudou algo), 'music-item-grant' { id, kind }.
 *  Para o Bloop Banda: ownedMusicItems() / ownsMusicItem(id)
 *    (inclui o kit inicial grátis: STARTER auras/danças).
 * ============================================================ */
import { PASS } from '../config';
import { addCoins, addGems } from '../core/economy';
import { bus } from '../core/events';
import { emptyPassSeason, persist, persistNow, save, type PassSeasonSave } from '../core/storage';
import { SEASONS, type SeasonInfo } from '../creatures/seasons';
import type { RunReport } from '../hub/registry';
import { t } from '../i18n';
import { clubActive, setPassPremiumCheck } from '../services/ads';
import { rng, type PassLevel, type Reward } from './catalog';
import { isoWeek, type ChallengeDef } from './challenges';
import { activeSeason, runXp } from './state';
import { grantMusicReward, musicItemName, musicPassSeason, STARTER, type MusicReward } from './music/index';

const MP = () => save.mpass;
export type Track = 'free' | 'prem';

/* ---------------- adaptação ao formato dos níveis do passe ---------------- */

const byId = new Map<string, MusicReward>();
const levelCache = new Map<number, PassLevel[]>();

/** Converte a recompensa musical para o formato da tela (kind 'mpass' + id; moedas/gemas como estão). */
function toReward(m: MusicReward): Reward {
  if (!m.id) {
    const name =
      m.kind === 'gems'
        ? t('pass.n.gems', '{n} Gemas', { n: m.amount })
        : m.kind === 'coins'
          ? t('pass.n.coins', '{n} Moedas', { n: m.amount })
          : m.amount === 1
            ? t('pass.n.ticket', '1 Ingresso')
            : t('pass.n.tickets', '{n} Ingressos', { n: m.amount });
    return { kind: m.kind as Reward['kind'], id: '', amount: m.amount, name, rarity: m.rarity };
  }
  byId.set(m.id, m);
  return { kind: 'mpass', id: m.id, amount: m.amount, name: musicItemName(m), rarity: m.rarity };
}

export function musicLevels(i: number): PassLevel[] {
  let L = levelCache.get(i);
  if (!L) {
    L = musicPassSeason(i).levels.map((l) => ({ level: l.level, free: l.free ? toReward(l.free) : null, prem: toReward(l.prem) }));
    levelCache.set(i, L);
  }
  return L;
}

/** Recompensa musical original pelo id (para prévias: aura/dança/música/skin). */
export function musicRewardById(id: string): MusicReward | undefined {
  if (!byId.has(id)) {
    const m = /s(\d\d)/.exec(id);
    if (m) musicLevels(Number(m[1]));
  }
  return byId.get(id);
}

/* ---------------- temporada ---------------- */

export function ensureMusicSeason(): SeasonInfo | null {
  const s = activeSeason();
  if (!s) return null;
  const p = MP();
  if (p.season !== s.index) {
    if (p.season >= 0 && (p.cur.xp > 0 || p.cur.premium || p.cur.free.length)) p.history[SEASONS[p.season]?.id ?? `s${p.season}`] = p.cur;
    p.season = s.index;
    p.cur = emptyPassSeason();
    persist();
  }
  if (!p.cur.premium && clubActive()) {
    p.cur.premium = true; // Clube inclui os 3 passes
    persist();
  }
  return s;
}

export const musicLevel = (xp = MP().cur.xp): number => Math.min(PASS.levels, Math.floor(xp / PASS.xpPerLevel) + 1);
export const musicLevelXp = (xp = MP().cur.xp): number => (musicLevel(xp) >= PASS.levels ? PASS.xpPerLevel : xp % PASS.xpPerLevel);
export const musicPremium = (): boolean => MP().cur.premium || clubActive();

setPassPremiumCheck(() => {
  const s = activeSeason();
  return !!s && MP().season === s.index && MP().cur.premium;
});

export function addMusicXp(n: number, reason = ''): void {
  if (!ensureMusicSeason() || n <= 0) return;
  const before = musicLevel();
  MP().cur.xp = Math.min(PASS.levels * PASS.xpPerLevel, MP().cur.xp + Math.round(n));
  persist();
  bus.emit('mpass-xp', { gained: Math.round(n), level: musicLevel(), before, reason });
  bus.emit('mpass');
}

/* ---------------- itens ---------------- */

/** Tudo o que o jogador tem do Passe Musical (+ kit inicial grátis). Para o Bloop Banda. */
export function ownedMusicItems(): string[] {
  return [...STARTER.auras, ...STARTER.dances, ...save.musicItems];
}
export function ownsMusicItem(id: string): boolean {
  return STARTER.auras.includes(id) || STARTER.dances.includes(id) || save.musicItems.includes(id);
}

function grantReward(r: Reward): void {
  if (r.kind === 'gems') addGems(r.amount);
  else if (r.kind === 'coins') addCoins(r.amount);
  else if (r.kind === 'tickets') {
    save.tickets = (save.tickets ?? 0) + r.amount;
    bus.emit('wallet');
  } else {
    const m = musicRewardById(r.id);
    const g = m ? grantMusicReward(m) : null;
    if (g && !save.musicItems.includes(g.id)) save.musicItems.push(g.id);
    bus.emit('music-item-grant', { id: r.id, kind: g?.inventory });
    bus.emit('inventory');
  }
}

export const musicClaimed = (level: number, track: Track, cur: PassSeasonSave = MP().cur): boolean => (track === 'free' ? cur.free : cur.prem).includes(level);

export function musicCanClaim(L: PassLevel, track: Track): boolean {
  if (!ensureMusicSeason()) return false;
  if (track === 'free' && !L.free) return false;
  if (track === 'prem' && !musicPremium()) return false;
  return musicLevel() >= L.level && !musicClaimed(L.level, track);
}

export function musicClaim(L: PassLevel, track: Track): Reward | null {
  if (!musicCanClaim(L, track)) return null;
  const r = track === 'free' ? L.free! : L.prem;
  (track === 'free' ? MP().cur.free : MP().cur.prem).push(L.level);
  grantReward(r);
  persistNow();
  bus.emit('mpass');
  return r;
}

export function musicClaimAll(): Reward[] {
  const s = ensureMusicSeason();
  if (!s) return [];
  const out: Reward[] = [];
  for (const L of musicLevels(s.index))
    for (const tr of ['free', 'prem'] as Track[]) {
      const r = musicClaim(L, tr);
      if (r) out.push(r);
    }
  return out;
}

export function musicClaimableCount(): number {
  const s = activeSeason();
  if (!s || MP().season !== s.index) return 0;
  let n = 0;
  const lv = musicLevel();
  const prem = musicPremium();
  for (const L of musicLevels(s.index)) {
    if (L.level > lv) break;
    if (L.free && !musicClaimed(L.level, 'free')) n++;
    if (prem && !musicClaimed(L.level, 'prem')) n++;
  }
  return n;
}

export function buyMusicPremium(): 'ok' | 'gems' | 'owned' | 'none' {
  if (!ensureMusicSeason()) return 'none';
  if (musicPremium()) return 'owned';
  if (save.gems < PASS.musicPriceGems) return 'gems';
  addGems(-PASS.musicPriceGems);
  MP().cur.premium = true;
  persistNow();
  bus.emit('mpass');
  return 'ok';
}

export function musicSkip(n = 1): 'ok' | 'gems' | 'max' {
  if (!ensureMusicSeason()) return 'max';
  const lv = musicLevel();
  if (lv >= PASS.levels) return 'max';
  n = Math.min(n, PASS.levels - lv);
  if (save.gems < n * PASS.musicSkipGems) return 'gems';
  addGems(-n * PASS.musicSkipGems);
  MP().cur.xp = (lv - 1 + n) * PASS.xpPerLevel;
  persistNow();
  bus.emit('mpass');
  return 'ok';
}

/* ---------------- desafios semanais musicais ---------------- */

interface MTpl {
  key: string;
  targets: number[];
  count: (r: RunReport | null, ev: string) => number;
  text: (n: number) => string;
}
const band = (r: RunReport | null) => !!r && r.game === 'band';
const POOL = (): MTpl[] => [
  { key: 'songs', targets: [5, 10, 15], count: (r) => (band(r) ? 1 : 0), text: (n) => t('mpass.ch.songs', 'Toque {n} músicas no Bloop Banda', { n }) },
  { key: 'wins', targets: [2, 4, 6], count: (r) => (band(r) && (r!.won || r!.place === 1) ? 1 : 0), text: (n) => t('mpass.ch.wins', 'Vença {n} batalhas de banda', { n }) },
  { key: 'notes', targets: [500, 1000, 2000], count: (r) => (band(r) ? (r!.stats?.notes ?? 0) : 0), text: (n) => t('mpass.ch.notes', 'Acerte {n} notas no Bloop Banda', { n }) },
  { key: 'perfect', targets: [100, 250, 400], count: (r) => (band(r) ? (r!.stats?.perfects ?? 0) : 0), text: (n) => t('mpass.ch.perfect', 'Faça {n} notas perfeitas', { n }) },
  { key: 'dance', targets: [3, 5, 10], count: (_r, ev) => (ev === 'dance' ? 1 : 0), text: (n) => t('mpass.ch.dance', 'Dance {n} vezes no menu (toque no seu Bloop)', { n }) },
  { key: 'runs', targets: [8, 12, 20], count: (r) => (r ? 1 : 0), text: (n) => t('mpass.ch.runs', 'Jogue {n} partidas de qualquer minigame', { n }) },
];
const XP = [1500, 2000, 2500];

export function musicWeeklyDefs(week = isoWeek()): (ChallengeDef & { key: string })[] {
  const seed = [...('music' + week)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  const r = rng(seed >>> 0);
  const pool = POOL();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [0, 1, 1, 2, 2].map((tier, i) => ({ id: `m${week}:${pool[i].key}`, key: pool[i].key, text: pool[i].text(pool[i].targets[tier]), target: pool[i].targets[tier], xp: XP[tier], metric: { on: 'run' }, game: 'band' }));
}

function ensureWeek() {
  const w = isoWeek();
  if (MP().week !== w) {
    MP().week = w;
    MP().wprog = {};
    MP().wdone = [];
    persist();
  }
  return musicWeeklyDefs(w);
}

export function musicWeekly() {
  return ensureWeek().map((def) => ({ def, progress: Math.min(def.target, MP().wprog[def.id] ?? 0), done: MP().wdone.includes(def.id) }));
}

function feed(r: RunReport | null, ev: string): void {
  if (!ensureMusicSeason()) return;
  const pool = POOL();
  for (const c of ensureWeek()) {
    if (MP().wdone.includes(c.id)) continue;
    const inc = pool.find((p) => p.key === c.key)!.count(r, ev);
    if (inc <= 0) continue;
    MP().wprog[c.id] = (MP().wprog[c.id] ?? 0) + inc;
    if (MP().wprog[c.id] >= c.target) {
      MP().wdone.push(c.id);
      addMusicXp(c.xp, 'weekly');
      bus.emit('pass-challenge', { id: c.id, text: c.text, xp: c.xp, pass: 'music' });
    }
  }
  persist();
}

let started = false;
export function startMusicPass(): void {
  if (started) return;
  started = true;
  bus.on('run-end', (r: RunReport) => {
    if (!ensureMusicSeason()) return;
    let xp = runXp(r) * PASS.musicRunShare;
    if (r.game === 'band') xp += PASS.bandXp.base + (r.won || r.place === 1 ? PASS.bandXp.win : 0);
    addMusicXp(xp, 'run');
    feed(r, 'run');
  });
  bus.on('dance-play', () => feed(null, 'dance'));
  bus.on('club', () => {
    ensureMusicSeason();
    bus.emit('mpass');
  });
  ensureMusicSeason();
}

export function musicHistory(): { info: SeasonInfo; save: PassSeasonSave }[] {
  const out: { info: SeasonInfo; save: PassSeasonSave }[] = [];
  for (const s of SEASONS) {
    const h = MP().history[s.id];
    if (h) out.push({ info: s, save: h });
  }
  return out.reverse();
}
