/* ============================================================
 *  MONTA & LEVA — soluções de referência (prova de que cada fase tem saída com as peças dadas).
 *  Usado pelo modo debug (window.__montaleva.verifyAll()) e pelo verificador em Node.
 *  Carregado sob demanda: não pesa no jogo normal.
 * ============================================================ */
import { analyze, canPlace, countOf, partCost } from './design';
import { LEVELS, type LevelDef } from './levels';
import { PARTS, isButton, type PartId, type Placed } from './parts';
import { GEN_SOLUTIONS } from './solutions-data';
import { Sim, applyCmd, driveCmd, type DriveStep, type Upgrades } from './sim';

export interface Solution {
  parts: Placed[];
  /** roteiro de direção: [segundo (ou posição x com 'x', ou x relativo ao início da zona com 'z'), comandos] com F=frente R=ré B=freio J=propulsor; padrão: F */
  drive?: DriveStep[];
}

const P = (t: PartId, x: number, y: number, r = 0): Placed => ({ t, x, y, r });
const row = (t: PartId, x0: number, x1: number, y: number): Placed[] => {
  const o: Placed[] = [];
  for (let x = x0; x <= x1; x++) o.push(P(t, x, y));
  return o;
};

/** soluções das 30 fases clássicas (numeração antiga) */
export const CLASSIC_SOLUTIONS: Record<number, Solution> = {
  1: { parts: [...row('block', 1, 4, 1), P('wheelS', 1, 1), P('wheelS', 4, 1), P('motor', 2, 2)] },
  2: { parts: [...row('block', 1, 4, 1), P('wheelS', 1, 1), P('wheelS', 4, 1), P('motor', 2, 2)] },
  3: { parts: [P('beam', 0, 1, 1), P('beam', 1, 1), P('block', 4, 1), P('block', 4, 2), P('wheelS', 0, 1), P('wheelS', 4, 1), P('motor', 3, 2)] },
  4: { parts: [...row('block', 1, 5, 1), P('wheelS', 1, 1), P('wheelS', 5, 1), P('motor', 2, 2)] },
  5: { parts: [...row('block', 1, 5, 1), P('wheelL', 1, 1), P('wheelL', 5, 1), P('motor', 2, 2)] },
  6: { parts: [...row('block', 2, 4, 1), P('basket', 3, 2), P('wheelS', 2, 1), P('wheelS', 4, 1), P('motor', 2, 2)] },
  7: { parts: [...row('block', 1, 5, 2), P('wheelL', 1, 2), P('wheelL', 5, 2), P('motor', 2, 3)] },
  8: { parts: [P('beam', 1, 1), P('beam', 4, 1), P('wheelS', 1, 1), P('wheelS', 6, 1), P('motor', 2, 2), P('motor', 5, 2)] },
  9: { parts: [...row('block', 1, 2, 2), P('motor', 3, 2), ...row('block', 4, 5, 2), P('wheelL', 1, 2), P('wheelL', 5, 2)] },
  10: { parts: [P('spring', 2, 1), P('block', 3, 1), P('spring', 4, 1), P('basket', 3, 2), P('motor', 2, 2), P('wheelS', 2, 1), P('wheelS', 4, 1)] },
  11: {
    parts: [P('spring', 1, 2), P('block', 2, 2), P('motor', 3, 2), P('block', 4, 2), P('spring', 5, 2), P('block', 2, 3), P('block', 4, 3), P('wheelL', 1, 2), P('wheelL', 5, 2)],
    drive: [[0, 'F'], [0.5, 'B', 'z']],
  },
  // paredinhas em volta da caixa: a solução fica estável mesmo com arredondamentos diferentes (WebView x Node)
  12: { parts: [P('block', 1, 1), P('motor', 2, 1), P('block', 3, 1), P('motor', 4, 1), P('block', 5, 1), P('block', 2, 2), P('block', 4, 2), P('wheelG', 1, 1), P('wheelG', 5, 1)] },
  13: { parts: [P('beam', 1, 1), P('beam', 4, 1), P('motor', 2, 2), P('motor', 5, 2), P('wheelL', 1, 1), P('wheelL', 6, 1)] },
  14: { parts: [...row('block', 1, 4, 1), P('motor', 3, 2), P('wheelS', 1, 1), P('wheelS', 4, 1)] },
  15: { parts: [...row('block', 1, 2, 1), P('motor', 3, 1), ...row('block', 4, 6, 1), P('beam', 2, 2, 1), P('beam', 5, 2, 1), P('wheelS', 2, 1), P('wheelS', 5, 1)] },
  16: { parts: [...row('block', 1, 5, 1), P('motor', 2, 2), P('wheelS', 1, 1), P('wheelS', 5, 1)] },
  17: { parts: [P('block', 1, 2), P('motor', 2, 2), P('weight', 3, 2), P('weight', 4, 2), P('block', 5, 2), P('block', 6, 2), P('wheelL', 1, 2), P('wheelL', 6, 2)] },
  18: { parts: [...row('block', 1, 3, 1), P('motor', 4, 1), ...row('block', 5, 7, 1), P('block', 5, 2), P('wheelL', 2, 1), P('wheelL', 6, 1)], drive: [[0, 'F'], [0, 'B', 'z']] },
  19: { parts: [...row('block', 1, 2, 1), P('motor', 3, 1), ...row('block', 4, 5, 1), P('wheelS', 1, 1), P('wheelS', 5, 1)] },
  20: { parts: [P('block', 1, 1), P('block', 2, 1), P('motor', 3, 1), P('block', 4, 1), P('block', 5, 1), P('basket', 3, 2), P('wheelL', 1, 1), P('wheelL', 5, 1)] },
  21: {
    parts: [...row('block', 1, 4, 1), P('hinge', 5, 1), ...row('block', 6, 9, 1), P('motor', 3, 2), P('motor', 7, 2), P('tri', 1, 2, 0), P('tri', 9, 2, 1), P('wheelS', 1, 1), P('wheelS', 4, 1), P('wheelS', 6, 1), P('wheelS', 9, 1)],
    drive: [[0, 'F'], [0, 'B', 'z']],
  },
  22: {
    parts: [...row('block', 1, 2, 1), P('motor', 3, 1), ...row('block', 4, 5, 1), P('wheelS', 1, 1), P('wheelS', 5, 1), P('thruster', 2, 1, 1), P('thruster', 4, 1, 1)],
    drive: [[0, 'F'], [11.6, 'FJ', 'x'], [13.5, 'F', 'x'], [0, 'B', 'z']],
  },
  23: { parts: [...row('block', 1, 2, 1), P('motor', 3, 1), ...row('block', 4, 5, 1), P('wheelS', 2, 1), P('wheelS', 4, 1), P('balloon', 1, 1), P('balloon', 5, 1)], drive: [[0, 'F'], [0, 'B', 'z']] },
  24: { parts: [...row('block', 1, 2, 2), P('motor', 3, 2), ...row('block', 4, 5, 2), P('block', 2, 3), P('block', 4, 3), P('wheelL', 1, 2), P('wheelL', 5, 2)] },
  25: {
    parts: [P('spring', 1, 1), P('motor', 2, 1), P('block', 3, 1), P('block', 4, 1), P('motor', 5, 1), P('spring', 6, 1), P('beam', 2, 2, 1), P('beam', 5, 2, 1), P('wheelL', 1, 1), P('wheelL', 6, 1)],
    drive: [[0, 'F'], [0, 'B', 'z']],
  },
  26: { parts: [P('block', 1, 1), P('motor', 2, 1), P('block', 3, 1), P('weight', 4, 1), P('motor', 5, 1), P('block', 6, 1), P('wheelL', 1, 1), P('wheelL', 6, 1)] },
  27: {
    parts: [...row('block', 1, 2, 1), P('motor', 3, 1), ...row('block', 4, 5, 1), P('block', 2, 2), P('block', 4, 2), P('wheelS', 1, 1), P('wheelS', 5, 1), P('thruster', 2, 1, 1), P('thruster', 4, 1, 1)],
    drive: [[0, 'F'], [18.2, 'FJ', 'x'], [20.5, 'F', 'x'], [0, 'B', 'z']],
  },
  28: { parts: [P('spring', 1, 1), P('block', 2, 1), P('motor', 3, 1), P('block', 4, 1), P('spring', 5, 1), P('wheelL', 1, 1), P('wheelL', 5, 1)], drive: [[0, 'F'], [0, 'B', 'z']] },
  29: {
    parts: [P('spring', 1, 1), P('block', 2, 1), P('motor', 3, 1), ...row('block', 4, 7, 1), P('motor', 8, 1), P('block', 9, 1), P('spring', 10, 1), P('basket', 3, 2), P('wheelL', 1, 1), P('wheelL', 10, 1)],
  },
  30: {
    parts: [P('spring', 1, 1), P('block', 2, 1), P('motor', 3, 1), ...row('block', 4, 7, 1), P('motor', 8, 1), P('block', 9, 1), P('spring', 10, 1), P('block', 2, 2), P('block', 4, 2), P('basket', 6, 2), P('wheelL', 1, 1), P('wheelL', 10, 1), P('thruster', 4, 1, 1), P('thruster', 7, 1, 1)],
    drive: [[0, 'F'], [26.6, 'FJ', 'x'], [29, 'F', 'x'], [0, 'B', 'z']],
  },
};

/** soluções na numeração final (1..200) */
export const SOLUTIONS: Record<number, Solution> = {};
for (const L of LEVELS) {
  const s = L.old ? CLASSIC_SOLUTIONS[L.old] : GEN_SOLUTIONS[L.n];
  if (s) SOLUTIONS[L.n] = s;
}

export const SOLUTION_UPGRADES: Upgrades = { motor: 0, grip: 0, spring: 0, pad: 0 };

export interface VerifyResult {
  n: number;
  ok: boolean;
  valid: string | null;
  time: number;
  reason?: string;
  flipped: boolean;
  parts: number;
}

/** confere se o projeto respeita a fase (peças, orçamento, células) */
export function validate(L: LevelDef, parts: Placed[]): string | null {
  const ids = Object.keys(PARTS) as PartId[];
  for (const id of ids) if (countOf(parts, id) > (L.parts[id] ?? 0)) return 'too many ' + id;
  if (L.budget && partCost(parts) > L.budget) return 'budget ' + partCost(parts);
  // coloca uma a uma (estruturas primeiro) como o jogador faria
  if (parts.some((p) => p.w && !isButton(p.t))) return 'wire on non-button';
  const an = analyze(parts);
  const nw = parts.reduce((s, p) => s + (p.w?.length ?? 0), 0);
  if (an.wires.length !== nw) return 'dangling wire';
  const order = [...parts].sort((a, b) => (PARTS[a.t].layer === 'struct' ? 0 : 1) - (PARTS[b.t].layer === 'struct' ? 0 : 1));
  const acc: Placed[] = [];
  for (const p of order) {
    const e = canPlace(L, acc, p);
    if (e) return `${e} ${p.t}@${p.x},${p.y}`;
    acc.push(p);
  }
  return null;
}

export function runSolution(n: number, sol: Solution | undefined = SOLUTIONS[n], maxT = 60, L: LevelDef = LEVELS[n - 1]): VerifyResult {
  if (!sol) return { n, ok: false, valid: 'no solution', time: 0, flipped: false, parts: 0 };
  const valid = validate(L, sol.parts);
  const sim = new Sim(L, sol.parts, SOLUTION_UPGRADES);
  while (!sim.result && sim.time < maxT) {
    applyCmd(sim, driveCmd(sol.drive, sim));
    sim.step();
  }
  const r = sim.result;
  return {
    n,
    ok: !!r && r.win && !valid,
    valid,
    time: Math.round(sim.time * 100) / 100,
    reason: r && !r.win ? r.reason : r ? undefined : 'timeout',
    flipped: sim.flipped,
    parts: sol.parts.length,
  };
}

export function verifyAll(): VerifyResult[] {
  return LEVELS.map((L) => runSolution(L.n));
}
