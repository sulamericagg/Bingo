/* ============================================================
 *  ANOMALIAS — números do jogo: dificuldade, noites, perigo, moedas.
 *  Tudo puro (sem DOM/three) para o diretor ser determinístico.
 * ============================================================ */
import type { AnomalyKind } from '../maps/types';

export const GAME_ID = 'anomalias';
export const NIGHTS = 5;

export type Diff = 'facil' | 'normal' | 'dificil';
export const DIFFS: Diff[] = ['facil', 'normal', 'dificil'];

export interface DiffCfg {
  /** duração do turno (00:00 → 06:00) em segundos reais */
  shiftSec: number;
  /** janela para fotografar cada anomalia (s) */
  window: number;
  /** multiplica o intervalo entre anomalias */
  gapMul: number;
  /** perigo por segundo por anomalia ativa */
  dangerPerSec: number;
  /** perigo quando uma anomalia escapa (janela acabou) */
  dangerMiss: number;
  /** foto errada */
  dangerWrong: number;
  /** dica da sala depois de N s (0 = nunca) */
  hintAfter: number;
  /** setas para as tarefas */
  taskArrows: boolean;
  /** velocidade do Bocudo (m/s) */
  creatureSpeed: number;
  coinMul: number;
}

export const DIFF: Record<Diff, DiffCfg> = {
  facil: { shiftSec: 480, window: 130, gapMul: 1.35, dangerPerSec: 0.18, dangerMiss: 18, dangerWrong: 2, hintAfter: 22, taskArrows: true, creatureSpeed: 1.7, coinMul: 1 },
  normal: { shiftSec: 540, window: 95, gapMul: 1, dangerPerSec: 0.3, dangerMiss: 25, dangerWrong: 5, hintAfter: 55, taskArrows: false, creatureSpeed: 2.1, coinMul: 1.3 },
  dificil: { shiftSec: 600, window: 70, gapMul: 0.8, dangerPerSec: 0.42, dangerMiss: 32, dangerWrong: 8, hintAfter: 0, taskArrows: false, creatureSpeed: 2.5, coinMul: 1.7 },
};

/** fase de memorizar (s, antes do relógio andar); o jogador pode pular */
export const MEMORIZE_SEC = 60;
/** primeira anomalia: N s depois do turno começar */
export const FIRST_DELAY = 14;

export interface NightCfg {
  /** intervalo médio entre anomalias (s) */
  gap: number;
  /** máximo de anomalias ao mesmo tempo */
  maxActive: number;
  /** tipos liberados */
  kinds: AnomalyKind[];
  /** tarefas no turno */
  tasks: number;
  /** quedas de energia no turno */
  outages: number;
}

const K1: AnomalyKind[] = ['move', 'missing', 'extra', 'color', 'light', 'picture'];
const K2: AnomalyKind[] = [...K1, 'face', 'rotate', 'scale', 'swap', 'door'];
const K3: AnomalyKind[] = [...K2, 'sound', 'creature'];

export function nightCfg(n: number): NightCfg {
  const k = (Math.min(NIGHTS, Math.max(1, n)) - 1) / (NIGHTS - 1);
  return {
    gap: 46 - 24 * k,
    maxActive: n <= 1 ? 2 : n <= 3 ? 3 : 4,
    kinds: n <= 1 ? K1 : n === 2 ? K2 : K3,
    tasks: n <= 1 ? 3 : n <= 3 ? 4 : 5,
    outages: n >= 3 ? 1 : 0,
  };
}

/** perigo ao fotografar certo (desconto) */
export const DANGER_REPORT = -8;
/** perigo depois que o Bocudo foge do flash */
export const DANGER_AFTER_SCARE = 55;

export interface NightResult {
  map: string;
  night: number;
  diff: Diff;
  reported: number;
  missed: number;
  wrong: number;
  tasksDone: number;
  tasksTotal: number;
  survived: boolean;
  sec: number;
}

/** estrelas: ★ sobreviveu, ★ fotografou ≥ 80% das anomalias, ★ todas as tarefas */
export function starsFor(r: NightResult): number {
  if (!r.survived) return 0;
  const total = r.reported + r.missed;
  let s = 1;
  if (total === 0 || r.reported / total >= 0.8) s++;
  if (r.tasksDone >= r.tasksTotal) s++;
  return s;
}

export function coinsFor(r: NightResult): number {
  const base = r.survived ? 12 + r.night * 6 : 3;
  const c = base + r.reported * 3 + r.tasksDone * 4;
  return Math.round(c * DIFF[r.diff].coinMul);
}
