/* ============================================================
 *  DESAFIOS SEMANAIS (giram toda semana ISO, iguais para todo mundo)
 *  + MARCOS DA TEMPORADA. Progresso vem de bus 'run-end' (RunReport)
 *  e bus 'pet-care' ({ action }).
 *
 *  Chaves de estatística esperadas dos jogos (RunReport.stats):
 *   orbit:  perfects, planets      rally: distance (metros)
 *   tubo:   rings                  tycoon: won (RunReport.won)
 *  Pet: 'pet-care' { action: 'bath' | 'feed' | 'play' | 'pet' | 'sleep' }
 * ============================================================ */
import type { RunReport } from '../hub/registry';
import { t } from '../i18n';
import { rng } from './catalog';

export type Metric =
  | { on: 'run'; game?: string; stat?: string; per?: 'run' | 'win' | 'podium' | 'minutes' | 'score'; div?: number }
  | { on: 'pet'; action: string };

export interface ChallengeDef {
  id: string;
  text: string;
  target: number;
  xp: number;
  metric: Metric;
  /** jogo relacionado (ícone/atalho) */
  game?: string;
}

interface Tpl {
  key: string;
  targets: number[];
  metric: Metric;
  game?: string;
  text: (n: number) => string;
}

const POOL = (): Tpl[] => [
  { key: 'orbit-perf', game: 'orbit', targets: [20, 30, 45], metric: { on: 'run', game: 'orbit', stat: 'perfects' }, text: (n) => t('pass.ch.orbitPerf', 'Faça {n} pousos perfeitos no Orbit', { n }) },
  { key: 'orbit-planets', game: 'orbit', targets: [150, 250, 400], metric: { on: 'run', game: 'orbit', stat: 'planets' }, text: (n) => t('pass.ch.orbitPlanets', 'Pule em {n} planetas no Orbit', { n }) },
  { key: 'rally-km', game: 'rally', targets: [3, 5, 8], metric: { on: 'run', game: 'rally', stat: 'distance', div: 1000 }, text: (n) => t('pass.ch.rallyKm', 'Percorra {n} km no Rally', { n }) },
  { key: 'rally-podium', game: 'rally', targets: [3, 5, 8], metric: { on: 'run', game: 'rally', per: 'podium' }, text: (n) => t('pass.ch.rallyPodium', 'Termine {n} corridas no pódio do Rally', { n }) },
  { key: 'tycoon-win', game: 'tycoon', targets: [2, 3, 5], metric: { on: 'run', game: 'tycoon', per: 'win' }, text: (n) => t('pass.ch.tycoonWin', 'Vença {n} partidas no Tycoon', { n }) },
  { key: 'tubo-rings', game: 'tubo', targets: [200, 350, 500], metric: { on: 'run', game: 'tubo', stat: 'rings' }, text: (n) => t('pass.ch.tuboRings', 'Quebre {n} anéis na Queda Giratória', { n }) },
  { key: 'pet-bath', targets: [3, 5, 7], metric: { on: 'pet', action: 'bath' }, text: (n) => t('pass.ch.petBath', 'Dê {n} banhos no seu bichinho', { n }) },
  { key: 'pet-feed', targets: [5, 8, 12], metric: { on: 'pet', action: 'feed' }, text: (n) => t('pass.ch.petFeed', 'Dê comida ao seu bichinho {n} vezes', { n }) },
  { key: 'pet-play', targets: [3, 5, 8], metric: { on: 'pet', action: 'play' }, text: (n) => t('pass.ch.petPlay', 'Brinque com seu bichinho {n} vezes', { n }) },
  { key: 'any-runs', targets: [15, 25, 40], metric: { on: 'run', per: 'run' }, text: (n) => t('pass.ch.anyRuns', 'Jogue {n} partidas de qualquer minigame', { n }) },
  { key: 'any-min', targets: [20, 40, 60], metric: { on: 'run', per: 'minutes' }, text: (n) => t('pass.ch.anyMin', 'Jogue {n} minutos no total', { n }) },
  { key: 'any-win', targets: [3, 6, 10], metric: { on: 'run', per: 'win' }, text: (n) => t('pass.ch.anyWin', 'Vença {n} partidas em qualquer minigame', { n }) },
];

/** Semana ISO 'YYYY-Www' (segunda a domingo). */
export function isoWeek(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((x.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

/** Fim da semana atual (próxima segunda 00:00 local). */
export function weekEnds(d = new Date()): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay() || 7;
  x.setDate(x.getDate() + (8 - day));
  return x.getTime();
}

const XP = [1500, 2200, 3000];

/** 7 desafios da semana (sempre: 2 fáceis, 3 médios, 2 difíceis; sem repetir modelo). */
export function weeklyChallenges(week = isoWeek()): ChallengeDef[] {
  const seed = [...week].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  const r = rng(seed >>> 0);
  const pool = POOL();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const tiers = [0, 0, 1, 1, 1, 2, 2];
  return tiers.map((tier, i) => {
    const p = pool[i];
    const target = p.targets[tier];
    return { id: `${week}:${p.key}`, text: p.text(target), target, xp: XP[tier], metric: p.metric, game: p.game };
  });
}

/** Quanto um evento avança uma métrica (0 = não conta). */
export function progressFrom(m: Metric, ev: { run?: RunReport; pet?: string }): number {
  if (m.on === 'pet') return ev.pet === m.action ? 1 : 0;
  const r = ev.run;
  if (!r) return 0;
  if (m.game && r.game !== m.game) return 0;
  if (m.stat) return (r.stats?.[m.stat] ?? 0) / (m.div ?? 1);
  switch (m.per) {
    case 'win':
      return r.won || r.place === 1 ? 1 : 0;
    case 'podium':
      return r.place && r.place <= 3 ? 1 : 0;
    case 'minutes':
      return Math.max(0, r.durationSec) / 60;
    case 'score':
      return r.score;
    default:
      return 1;
  }
}

/** Marcos da temporada (progresso acumulado em pass.mprog). */
export interface Milestone {
  id: string;
  text: string;
  target: number;
  xp: number;
}
export const MILESTONES = (): Milestone[] => [
  { id: 'runs', text: t('pass.ms.runs', 'Jogue 100 partidas nesta temporada'), target: 100, xp: 5000 },
  { id: 'days', text: t('pass.ms.days', 'Entre no jogo em 20 dias diferentes'), target: 20, xp: 5000 },
  { id: 'weekly', text: t('pass.ms.weekly', 'Complete 15 desafios semanais'), target: 15, xp: 8000 },
  { id: 'games', text: t('pass.ms.games', 'Jogue 3 minigames diferentes'), target: 3, xp: 3000 },
  { id: 'pet', text: t('pass.ms.pet', 'Cuide do seu bichinho 30 vezes'), target: 30, xp: 4000 },
];
