/* ============================================================
 *  PASSE ESTELAR — estado, XP, resgates, compra, desafios, Clube.
 *  Leve: pode ser importado na abertura (escuta 'run-end' / 'pet-care').
 *  A tela (ui.ts) é carregada sob demanda.
 *
 *  Eventos emitidos no bus:
 *   'pass'          — qualquer mudança (XP, resgate, compra)  → atualizar badges
 *   'pass-xp'       { gained, level, before, reason }
 *   'pass-challenge'{ id, text, xp }                          → toast opcional
 *   'season-theme'  { index, id, theme, palette }             → hub aplica as cores
 *   'creature-grant'{ id, source: 'pass' }                    → coleção de criaturas
 *   'inventory'     (peças do criador ganhas)
 * ============================================================ */
import { CLUB, PASS } from '../config';
import { addCoins, addGems } from '../core/economy';
import { bus } from '../core/events';
import { dayNumber, emptyPassSeason, persist, persistNow, save, type PassSeasonSave } from '../core/storage';
import { SEASONS, seasonAt, type SeasonInfo } from '../creatures/seasons';
import type { RunReport } from '../hub/registry';
import { clubActive, setPassPremiumCheck } from '../services/ads';
import { passSeason, realCreatureId, type PassLevel, type Reward } from './catalog';
import { loadSeasonCreatureNames } from './creatures-bridge';
import { isoWeek, MILESTONES, progressFrom, weeklyChallenges, type ChallengeDef } from './challenges';

const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);

/** ?debug&season=NN força a temporada (só em debug) para conferir temas. */
function forcedSeason(): number | null {
  if (!DEBUG) return null;
  const m = /[?&]season=(\d+)/.exec(location.search);
  if (!m) return null;
  return Math.max(0, Math.min(SEASONS.length - 1, Number(m[1])));
}

/** Temporada vigente (ou null antes de dez/2026). */
export function activeSeason(now = new Date()): SeasonInfo | null {
  const f = forcedSeason();
  if (f !== null) return SEASONS[f];
  return seasonAt(now);
}

/** Próxima temporada a começar (para "em breve" antes do lançamento). */
export function upcomingSeason(now = Date.now()): SeasonInfo | null {
  return SEASONS.find((s) => Date.parse(s.start) > now) ?? null;
}

/** ms até o fim da temporada vigente (no modo ?season=NN, conta como se estivesse no meio dela). */
export function seasonLeftMs(s: SeasonInfo, now = Date.now()): number {
  if (forcedSeason() !== null) {
    const m = /[?&]daysleft=(\d+)/.exec(location.search);
    return m ? Number(m[1]) * 86400000 - 3600000 : 12 * 86400000 + 5 * 3600000;
  }
  return Math.max(0, Date.parse(s.end) - now);
}

const P = () => save.pass;

/** Garante que o save está na temporada vigente; arquiva a anterior no histórico. */
export function ensureSeason(): SeasonInfo | null {
  const s = activeSeason();
  if (!s) return null;
  const p = P();
  if (p.season !== s.index) {
    if (p.season >= 0 && (p.cur.xp > 0 || p.cur.premium || p.cur.free.length)) p.history[SEASONS[p.season]?.id ?? `s${p.season}`] = p.cur;
    p.season = s.index;
    p.cur = emptyPassSeason();
    p.mprog = {};
    p.mdone = [];
    persist();
    bus.emit('season-theme', { index: s.index, id: s.id, theme: s.theme, palette: s.palette });
  }
  // Passe premium dado pelo painel admin para esta temporada (services/online.ts guarda até ela começar)
  try {
    if (localStorage.getItem('bo-pass-gift') === String(s.index)) {
      localStorage.removeItem('bo-pass-gift');
      if (!p.cur.premium) {
        p.cur.premium = true;
        persist();
      }
    }
  } catch {
    /* sem localStorage */
  }
  // Clube inclui o passe da temporada (fica seu mesmo se o Clube acabar no meio do mês)
  if (!p.cur.premium && clubActive()) {
    p.cur.premium = true;
    persist();
  }
  return s;
}

export const passLevel = (xp = P().cur.xp): number => Math.min(PASS.levels, Math.floor(xp / PASS.xpPerLevel) + 1);
/** XP dentro do nível atual (0..xpPerLevel) */
export const levelXp = (xp = P().cur.xp): number => (passLevel(xp) >= PASS.levels ? PASS.xpPerLevel : xp % PASS.xpPerLevel);

export function isPremium(): boolean {
  return P().cur.premium || clubActive();
}

/** Passe premium da temporada vigente comprado (sem anúncios intersticiais durante a temporada). */
setPassPremiumCheck(() => {
  const s = activeSeason();
  return !!s && P().season === s.index && P().cur.premium;
});

export function addPassXp(n: number, reason = ''): void {
  const s = ensureSeason();
  if (!s || n <= 0) return;
  const before = passLevel();
  const cap = PASS.levels * PASS.xpPerLevel;
  P().cur.xp = Math.min(cap, P().cur.xp + Math.round(n));
  persist();
  const level = passLevel();
  bus.emit('pass-xp', { gained: Math.round(n), level, before, reason });
  bus.emit('pass');
}

/* ---------------- recompensas ---------------- */

export function hasItem(id: string): boolean {
  return save.passItems.includes(id) || save.ownedParts.includes(id);
}

/** Entrega uma recompensa (permanece para sempre, mesmo trocando de temporada). */
export function grantReward(r: Reward): void {
  switch (r.kind) {
    case 'gems':
      addGems(r.amount);
      break;
    case 'coins':
      addCoins(r.amount);
      break;
    case 'tickets':
      save.tickets = (save.tickets ?? 0) + r.amount;
      bus.emit('wallet');
      break;
    case 'eyes':
    case 'mouth':
    case 'aura':
      if (!save.ownedParts.includes(r.id)) save.ownedParts.push(r.id);
      bus.emit('inventory');
      break;
    case 'creature':
      if (!save.passItems.includes(r.id)) save.passItems.push(r.id);
      bus.emit('creature-grant', { id: realCreatureId(r.id), passId: r.id, source: 'pass' });
      bus.emit('inventory');
      break;
    default:
      if (!save.passItems.includes(r.id)) save.passItems.push(r.id);
      bus.emit('inventory');
  }
}

export type Track = 'free' | 'prem';

export function claimed(level: number, track: Track, cur: PassSeasonSave = P().cur): boolean {
  return (track === 'free' ? cur.free : cur.prem).includes(level);
}

export function canClaim(L: PassLevel, track: Track): boolean {
  if (!ensureSeason()) return false;
  if (track === 'free' && !L.free) return false;
  if (track === 'prem' && !isPremium()) return false;
  return passLevel() >= L.level && !claimed(L.level, track);
}

export function claim(L: PassLevel, track: Track): Reward | null {
  if (!canClaim(L, track)) return null;
  const r = track === 'free' ? L.free! : L.prem;
  (track === 'free' ? P().cur.free : P().cur.prem).push(L.level);
  grantReward(r);
  persistNow();
  bus.emit('pass');
  return r;
}

/** Resgata tudo o que estiver liberado. */
export function claimAll(): Reward[] {
  const s = ensureSeason();
  if (!s) return [];
  const out: Reward[] = [];
  for (const L of passSeason(s.index).levels) {
    for (const tr of ['free', 'prem'] as Track[]) {
      const r = claim(L, tr);
      if (r) out.push(r);
    }
  }
  return out;
}

export function claimableCount(): number {
  const s = activeSeason();
  if (!s || P().season !== s.index) return 0;
  let n = 0;
  const lv = passLevel();
  const prem = isPremium();
  for (const L of passSeason(s.index).levels) {
    if (L.level > lv) break;
    if (L.free && !claimed(L.level, 'free')) n++;
    if (prem && !claimed(L.level, 'prem')) n++;
  }
  return n + (clubDailyAvailable() ? 1 : 0);
}

/* ---------------- compra ---------------- */

export function buyPremium(): 'ok' | 'gems' | 'owned' | 'none' {
  if (!ensureSeason()) return 'none';
  if (isPremium() && P().cur.premium) return 'owned';
  if (save.gems < PASS.priceGems) return 'gems';
  addGems(-PASS.priceGems);
  P().cur.premium = true;
  persistNow();
  bus.emit('pass');
  bus.emit('pass-bought');
  return 'ok';
}

export function skipLevels(n = 1): 'ok' | 'gems' | 'max' {
  if (!ensureSeason()) return 'max';
  const lv = passLevel();
  if (lv >= PASS.levels) return 'max';
  n = Math.min(n, PASS.levels - lv);
  const cost = n * PASS.skipGems;
  if (save.gems < cost) return 'gems';
  addGems(-cost);
  P().cur.xp = (lv - 1 + n) * PASS.xpPerLevel;
  persistNow();
  bus.emit('pass-xp', { gained: n * PASS.xpPerLevel, level: passLevel(), before: lv, reason: 'skip' });
  bus.emit('pass');
  return 'ok';
}

/* ---------------- Clube: gemas diárias ---------------- */

export function clubDailyAvailable(): boolean {
  return clubActive() && save.club.lastDrip !== dayNumber();
}
export function claimClubDaily(): number {
  if (!clubDailyAvailable()) return 0;
  save.club.lastDrip = dayNumber();
  addGems(CLUB.gemsDaily);
  persistNow();
  bus.emit('pass');
  return CLUB.gemsDaily;
}

/* ---------------- desafios ---------------- */

function ensureWeek(): ChallengeDef[] {
  const w = isoWeek();
  const p = P();
  if (p.week !== w) {
    p.week = w;
    p.wprog = {};
    p.wdone = [];
    persist();
  }
  return weeklyChallenges(w);
}

export function weekly(): { def: ChallengeDef; progress: number; done: boolean }[] {
  const defs = ensureWeek();
  return defs.map((def) => ({ def, progress: Math.min(def.target, P().wprog[def.id] ?? 0), done: P().wdone.includes(def.id) }));
}

export function milestones() {
  return MILESTONES().map((m) => ({ def: m, progress: Math.min(m.target, P().mprog[m.id] ?? 0), done: P().mdone.includes(m.id) }));
}

function bumpMilestone(id: string, by: number): void {
  const p = P();
  if (p.mdone.includes(id)) return;
  p.mprog[id] = (p.mprog[id] ?? 0) + by;
  const def = MILESTONES().find((m) => m.id === id);
  if (def && p.mprog[id] >= def.target) {
    p.mdone.push(id);
    addPassXp(def.xp, 'milestone');
    bus.emit('pass-challenge', { id, text: def.text, xp: def.xp });
  }
}

function feedChallenges(ev: { run?: RunReport; pet?: string }): void {
  if (!ensureSeason()) return;
  const p = P();
  for (const c of ensureWeek()) {
    if (p.wdone.includes(c.id)) continue;
    const inc = progressFrom(c.metric, ev);
    if (inc <= 0) continue;
    p.wprog[c.id] = (p.wprog[c.id] ?? 0) + inc;
    if (p.wprog[c.id] >= c.target) {
      p.wdone.push(c.id);
      addPassXp(c.xp, 'weekly');
      bumpMilestone('weekly', 1);
      bus.emit('pass-challenge', { id: c.id, text: c.text, xp: c.xp });
    }
  }
  persist();
}

/** XP de uma partida (duração + vitória + pódio). Exportado para a tela de fim de partida mostrar "+XP". */
export function runXp(r: RunReport): number {
  const X = PASS.runXp;
  let xp = X.base + Math.min(X.maxDur, Math.max(0, r.durationSec)) * X.perSec;
  if (r.won) xp += X.win;
  if (r.place && r.place <= 3) xp += X.podium[r.place] ?? 0;
  return Math.round(xp);
}

function onRun(r: RunReport): void {
  if (!ensureSeason()) return;
  addPassXp(runXp(r), 'run');
  bumpMilestone('runs', 1);
  const gk = 'g:' + r.game;
  if (!P().mprog[gk]) {
    P().mprog[gk] = 1;
    bumpMilestone('games', 1);
  }
  feedChallenges({ run: r });
}

function onPet(e: { action?: string } | undefined): void {
  if (!ensureSeason() || !e?.action) return;
  bumpMilestone('pet', 1);
  feedChallenges({ pet: e.action });
}

/** Login diário: +XP e marco de dias. */
export function dailyLogin(): boolean {
  if (!ensureSeason()) return false;
  const today = dayNumber();
  if (P().loginDay === today) return false;
  P().loginDay = today;
  addPassXp(PASS.dailyLoginXp, 'login');
  bumpMilestone('days', 1);
  persist();
  return true;
}

let started = false;
/** Liga os ouvintes (idempotente). Chamado por registerPass(). */
export function startPass(): void {
  if (started) return;
  started = true;
  bus.on('run-end', onRun);
  bus.on('pet-care', onPet);
  bus.on('club', () => {
    ensureSeason();
    bus.emit('pass');
  });
  const s = ensureSeason();
  const theme = s ?? upcomingSeason();
  if (theme) loadSeasonCreatureNames(theme.index);
  if (theme) bus.emit('season-theme', { index: theme.index, id: theme.id, theme: theme.theme, palette: theme.palette });
  dailyLogin();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') dailyLogin();
  });
}

/** Tema atual (para quem carregar depois do evento inicial). */
export function currentTheme(): SeasonInfo | null {
  return activeSeason() ?? upcomingSeason();
}

/** Histórico: temporadas passadas com o que foi resgatado. */
export function historyEntries(): { info: SeasonInfo; save: PassSeasonSave }[] {
  const out: { info: SeasonInfo; save: PassSeasonSave }[] = [];
  for (const s of SEASONS) {
    const h = P().history[s.id];
    if (h) out.push({ info: s, save: h });
  }
  return out.reverse();
}

/** Debug: dá XP (só com ?debug). */
export function debugXp(n: number): void {
  if (DEBUG) addPassXp(n, 'debug');
}
export const isDebug = () => DEBUG;
