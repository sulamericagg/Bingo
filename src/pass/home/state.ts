/* ============================================================
 *  PASSE DA CASA — estado, XP, resgates, compra, desafios semanais.
 *
 *  EVENTOS DO BUS QUE DÃO XP (emitidos pelo construtor da casa / festa):
 *   'home-build'      { item?: string }        colocou/moveu um móvel ou peça     +40
 *   'home-paint'      { room?: string }        pintou parede/piso                  +30
 *   'home-clean'      { count?: number }       limpou sujeira (por unidade)        +25
 *   'party-host'      { guests?: number }      deu uma festa                       +300
 *   'party-join'      { hostId?: string }      foi a uma festa                     +150
 *   'home-visit-help' { kind?: 'clean'|'build'|'decorate' } ajudou a casa de um amigo +120
 *  Teto diário das atividades: PASS.homeDailyCap. Partidas: 40% do XP normal (run-end).
 *  Emitidos: 'hpass' (mudou algo), 'home-item-grant' { id, item } (construtor libera a peça).
 * ============================================================ */
import { PASS } from '../../config';
import { addCoins, addGems } from '../../core/economy';
import { bus } from '../../core/events';
import { dayNumber, emptyPassSeason, persist, persistNow, save, type PassSeasonSave } from '../../core/storage';
import { SEASONS, type SeasonInfo } from '../../creatures/seasons';
import type { RunReport } from '../../hub/registry';
import { t } from '../../i18n';
import { clubActive, setPassPremiumCheck } from '../../services/ads';
import type { PassLevel, Reward } from '../catalog';
import { isoWeek, type ChallengeDef } from '../challenges';
import { activeSeason, runXp } from '../state';
import { homeItem, homePassSeason } from './catalog';
import { rng } from '../catalog';

const H = () => save.hpass;
export type Track = 'free' | 'prem';

export function ensureHomeSeason(): SeasonInfo | null {
  const s = activeSeason();
  if (!s) return null;
  const p = H();
  if (p.season !== s.index) {
    if (p.season >= 0 && (p.cur.xp > 0 || p.cur.premium || p.cur.free.length)) p.history[SEASONS[p.season]?.id ?? `s${p.season}`] = p.cur;
    p.season = s.index;
    p.cur = emptyPassSeason();
    p.mprog = {};
    p.mdone = [];
    persist();
  }
  if (!p.cur.premium && clubActive()) {
    p.cur.premium = true; // Clube inclui os DOIS passes
    persist();
  }
  return s;
}

export const homeLevel = (xp = H().cur.xp): number => Math.min(PASS.levels, Math.floor(xp / PASS.xpPerLevel) + 1);
export const homeLevelXp = (xp = H().cur.xp): number => (homeLevel(xp) >= PASS.levels ? PASS.xpPerLevel : xp % PASS.xpPerLevel);
export const homePremium = (): boolean => H().cur.premium || clubActive();

setPassPremiumCheck(() => {
  const s = activeSeason();
  return !!s && H().season === s.index && H().cur.premium;
});

export function addHomeXp(n: number, reason = ''): void {
  if (!ensureHomeSeason() || n <= 0) return;
  const before = homeLevel();
  H().cur.xp = Math.min(PASS.levels * PASS.xpPerLevel, H().cur.xp + Math.round(n));
  persist();
  bus.emit('hpass-xp', { gained: Math.round(n), level: homeLevel(), before, reason });
  bus.emit('hpass');
}

export function grantHomeReward(r: Reward): void {
  if (r.kind === 'gems') addGems(r.amount);
  else if (r.kind === 'coins') addCoins(r.amount);
  else if (r.kind === 'home') {
    const item = homeItem(r.id);
    const ids = [r.id, ...(item?.kit?.items ?? [])];
    for (const id of ids) if (!save.homeItems.includes(id)) save.homeItems.push(id);
    bus.emit('home-item-grant', { id: r.id, item });
    bus.emit('inventory');
  }
}

export const homeClaimed = (level: number, track: Track, cur: PassSeasonSave = H().cur): boolean => (track === 'free' ? cur.free : cur.prem).includes(level);

export function homeCanClaim(L: PassLevel, track: Track): boolean {
  if (!ensureHomeSeason()) return false;
  if (track === 'free' && !L.free) return false;
  if (track === 'prem' && !homePremium()) return false;
  return homeLevel() >= L.level && !homeClaimed(L.level, track);
}

export function homeClaim(L: PassLevel, track: Track): Reward | null {
  if (!homeCanClaim(L, track)) return null;
  const r = track === 'free' ? L.free! : L.prem;
  (track === 'free' ? H().cur.free : H().cur.prem).push(L.level);
  grantHomeReward(r);
  persistNow();
  bus.emit('hpass');
  return r;
}

export function homeClaimAll(): Reward[] {
  const s = ensureHomeSeason();
  if (!s) return [];
  const out: Reward[] = [];
  for (const L of homePassSeason(s.index).levels)
    for (const tr of ['free', 'prem'] as Track[]) {
      const r = homeClaim(L, tr);
      if (r) out.push(r);
    }
  return out;
}

export function homeClaimableCount(): number {
  const s = activeSeason();
  if (!s || H().season !== s.index) return 0;
  let n = 0;
  const lv = homeLevel();
  const prem = homePremium();
  for (const L of homePassSeason(s.index).levels) {
    if (L.level > lv) break;
    if (L.free && !homeClaimed(L.level, 'free')) n++;
    if (prem && !homeClaimed(L.level, 'prem')) n++;
  }
  return n;
}

/** Comprar o premium da casa (800 gemas) ou o combo "Passes do Mês" (os dois por 1.450). */
export function buyHomePremium(bundle = false): 'ok' | 'gems' | 'owned' | 'none' {
  if (!ensureHomeSeason()) return 'none';
  const starP = save.pass;
  const starOwned = starP.cur.premium || clubActive();
  if (H().cur.premium && (!bundle || starOwned)) return 'owned';
  const price = bundle && !starOwned ? PASS.bundlePriceGems : PASS.homePriceGems;
  if (save.gems < price) return 'gems';
  addGems(-price);
  H().cur.premium = true;
  if (bundle && !starOwned && starP.season === H().season) starP.cur.premium = true;
  persistNow();
  bus.emit('hpass');
  bus.emit('pass');
  return 'ok';
}

export function homeSkip(n = 1): 'ok' | 'gems' | 'max' {
  if (!ensureHomeSeason()) return 'max';
  const lv = homeLevel();
  if (lv >= PASS.levels) return 'max';
  n = Math.min(n, PASS.levels - lv);
  if (save.gems < n * PASS.homeSkipGems) return 'gems';
  addGems(-n * PASS.homeSkipGems);
  H().cur.xp = (lv - 1 + n) * PASS.xpPerLevel;
  persistNow();
  bus.emit('hpass');
  return 'ok';
}

/* ---------------- desafios semanais da casa ---------------- */

interface HTpl {
  key: string;
  ev: string;
  targets: number[];
  text: (n: number) => string;
}
const POOL = (): HTpl[] => [
  { key: 'clean', ev: 'home-clean', targets: [15, 25, 40], text: (n) => t('hpass.ch.clean', 'Limpe {n} sujeiras', { n }) },
  { key: 'host', ev: 'party-host', targets: [1, 2, 3], text: (n) => t('hpass.ch.host', 'Dê {n} festas na sua casa', { n }) },
  { key: 'join', ev: 'party-join', targets: [2, 3, 5], text: (n) => t('hpass.ch.join', 'Vá a {n} festas de amigos', { n }) },
  { key: 'help', ev: 'home-visit-help', targets: [2, 3, 5], text: (n) => t('hpass.ch.help', 'Ajude {n} amigos a arrumar a casa', { n }) },
  { key: 'paint', ev: 'home-paint', targets: [5, 10, 15], text: (n) => t('hpass.ch.paint', 'Pinte {n} paredes ou pisos', { n }) },
  { key: 'build', ev: 'home-build', targets: [10, 20, 30], text: (n) => t('hpass.ch.build', 'Coloque {n} móveis ou enfeites', { n }) },
  { key: 'runs', ev: 'run-end', targets: [8, 12, 20], text: (n) => t('hpass.ch.runs', 'Jogue {n} partidas de qualquer minigame', { n }) },
];
const XP = [1500, 2000, 2500];

export function homeWeeklyDefs(week = isoWeek()): (ChallengeDef & { ev: string })[] {
  const seed = [...('home' + week)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  const r = rng(seed >>> 0);
  const pool = POOL();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [0, 1, 1, 2, 2].map((tier, i) => {
    const p = pool[i];
    return { id: `h${week}:${p.key}`, text: p.text(p.targets[tier]), target: p.targets[tier], xp: XP[tier], metric: { on: 'run' }, ev: p.ev, game: 'home' };
  });
}

function ensureWeek() {
  const w = isoWeek();
  if (H().week !== w) {
    H().week = w;
    H().wprog = {};
    H().wdone = [];
    persist();
  }
  return homeWeeklyDefs(w);
}

export function homeWeekly() {
  return ensureWeek().map((def) => ({ def, progress: Math.min(def.target, H().wprog[def.id] ?? 0), done: H().wdone.includes(def.id) }));
}

function feed(ev: string, by: number): void {
  for (const c of ensureWeek()) {
    if (c.ev !== ev || H().wdone.includes(c.id)) continue;
    H().wprog[c.id] = (H().wprog[c.id] ?? 0) + by;
    if (H().wprog[c.id] >= c.target) {
      H().wdone.push(c.id);
      addHomeXp(c.xp, 'weekly');
      bus.emit('pass-challenge', { id: c.id, text: c.text, xp: c.xp, pass: 'home' });
    }
  }
  persist();
}

/** XP de atividade da casa respeitando o teto diário. */
function activity(ev: string, units = 1): void {
  if (!ensureHomeSeason()) return;
  const p = H();
  const today = dayNumber();
  if (p.mprog.capDay !== today) {
    p.mprog.capDay = today;
    p.mprog.capXp = 0;
  }
  const want = (PASS.homeXp[ev] ?? 0) * units;
  const give = Math.max(0, Math.min(want, PASS.homeDailyCap - (p.mprog.capXp ?? 0)));
  p.mprog.capXp = (p.mprog.capXp ?? 0) + give;
  if (give) addHomeXp(give, ev);
  feed(ev, units);
}

let started = false;
export function startHomePass(): void {
  if (started) return;
  started = true;
  for (const ev of Object.keys(PASS.homeXp))
    bus.on(ev, (e?: { count?: number }) => activity(ev, ev === 'home-clean' ? Math.max(1, Math.min(50, Math.round(e?.count ?? 1))) : 1));
  bus.on('run-end', (r: RunReport) => {
    if (!ensureHomeSeason()) return;
    addHomeXp(runXp(r) * PASS.homeRunShare, 'run');
    feed('run-end', 1);
  });
  bus.on('club', () => {
    ensureHomeSeason();
    bus.emit('hpass');
  });
  ensureHomeSeason();
}

export function homeHistory(): { info: SeasonInfo; save: PassSeasonSave }[] {
  const out: { info: SeasonInfo; save: PassSeasonSave }[] = [];
  for (const s of SEASONS) {
    const h = H().history[s.id];
    if (h) out.push({ info: s, save: h });
  }
  return out.reverse();
}

/** Construtor da casa: o jogador ganhou este item exclusivo? */
export const ownsHomePassItem = (id: string): boolean => save.homeItems.includes(id);
