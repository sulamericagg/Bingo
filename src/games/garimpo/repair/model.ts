/* ============================================================
 *  GARIMPO BRUTO — CONSERTOS: modelo puro (sem DOM, sem three).
 *  Tipos de quebra, desgaste por máquina, tabelas por dificuldade e o save.
 *  Quem decide é o anfitrião; o convidado só recebe o retrato (bits por máquina).
 * ============================================================ */
import type { Kind } from '../machines';

/** tipos de quebra (cada um tem um minijogo) */
export type BreakKind = 'tyre' | 'brake' | 'electric' | 'part' | 'bushing';
export const BREAK_KINDS: BreakKind[] = ['tyre', 'brake', 'electric', 'part', 'bushing'];
export type Diff = 0 | 1 | 2 | 3;

/** peças da loja (id curto, entra em data-buy como "r.<id>") */
export type PartId = 'tyre' | 'bush' | 'hyd' | 'wire' | 'pad';
export const PART_IDS: PartId[] = ['tyre', 'bush', 'hyd', 'wire', 'pad'];
/** peça que cada quebra consome */
export const PART_FOR: Record<BreakKind, PartId> = { tyre: 'tyre', brake: 'pad', electric: 'wire', part: 'hyd', bushing: 'bush' };
export const PART_PRICE: Record<PartId, number> = { tyre: 320, bush: 260, hyd: 480, wire: 220, pad: 300 };
export const PART_MAX = 4;

/** estado de uma máquina (índice = posição em g.ms) */
export interface MachState {
  /** desgaste 0..100 (sobe com distância, carga, pancada, lama; revisão zera) */
  wear: number;
  /** quebra atual (null = inteira) */
  broken: BreakKind | null;
  /** roda furada (índice em spec.wheels) */
  wheel: number;
  /** metros rodados desde a última revisão (só informativo) */
  km: number;
}
export const freshMach = (): MachState => ({ wear: 0, broken: null, wheel: 0, km: 0 });

export interface RepairSave {
  v: 1;
  ms: MachState[];
  inv: Record<PartId, number>;
  /** segundos até poder quebrar de novo (qualquer máquina) */
  cd: number;
  /** consertos feitos (estatística / conquistas) */
  fixed: number;
}
export function freshSave(): RepairSave {
  return { v: 1, ms: [], inv: { tyre: 0, bush: 0, hyd: 0, wire: 0, pad: 0 }, cd: 0, fixed: 0 };
}
export function loadSave(o: RepairSave | undefined): RepairSave {
  const s = freshSave();
  if (!o || o.v !== 1) return s;
  s.ms = Array.isArray(o.ms) ? o.ms.map((m) => ({ ...freshMach(), ...m })) : [];
  for (const k of PART_IDS) s.inv[k] = Math.max(0, Math.min(PART_MAX, Math.round(o.inv?.[k] ?? 0)));
  s.cd = Math.max(0, +o.cd || 0);
  s.fixed = Math.max(0, +o.fixed || 0);
  return s;
}

/* ------------------------------ tabelas por dificuldade ------------------------------ */
export interface DiffCfg {
  /** quebras por hora de direção com desgaste zero / com desgaste 100 */
  rate0: number;
  rate100: number;
  /** pausa mínima entre quebras (s) */
  cooldown: number;
  /** peça grátis na hora do conserto */
  freeParts: boolean;
  /** multiplicador do desgaste */
  wearK: number;
  /** quantidade de fios / dificuldade dos minijogos (0..3) */
  level: number;
  /** freio: chance por hora de descida carregado (caminhão) */
  brakeRate: number;
}
export const DIFF: DiffCfg[] = [
  { rate0: 0.5, rate100: 1.0, cooldown: 1500, freeParts: true, wearK: 0.5, level: 0, brakeRate: 0.25 },
  { rate0: 0.9, rate100: 2.2, cooldown: 1000, freeParts: true, wearK: 0.8, level: 1, brakeRate: 0.5 },
  { rate0: 1.2, rate100: 3.5, cooldown: 700, freeParts: false, wearK: 1, level: 2, brakeRate: 0.8 },
  { rate0: 1.0, rate100: 7.0, cooldown: 420, freeParts: false, wearK: 1.6, level: 3, brakeRate: 1.2 },
];
/** nada quebra nos primeiros 10 minutos de jogo, nem antes do primeiro ouro (tutorial) */
export const GRACE_S = 600;

/** que quebras cada máquina pode ter */
export function kindsFor(k: Kind): BreakKind[] {
  switch (k) {
    case 'pickup':
      return ['tyre', 'tyre', 'electric', 'part', 'bushing'];
    case 'truck':
      return ['tyre', 'tyre', 'electric', 'bushing', 'part'];
    case 'excavator':
      return ['part', 'part', 'electric'];
    case 'dozer':
      return ['part', 'part', 'electric'];
    case 'heli':
      return ['electric', 'part'];
    default:
      return [];
  }
}
/** peça quebrada em "part" por máquina (arte do minijogo e nome) */
export type PartArt = 'hose' | 'pin' | 'alt' | 'rotor' | 'cyl';
export function partArt(k: Kind): PartArt {
  return k === 'excavator' ? 'hose' : k === 'dozer' ? 'pin' : k === 'pickup' ? 'alt' : k === 'heli' ? 'rotor' : 'cyl';
}

/** custo do mecânico / guincho / revisão */
export const MECH_FEE = [0, 150, 380, 600];
export const MECH_WAIT = 25;
export const TOW_FEE = [0, 250, 550, 900];
export function serviceFee(wear: number, diff: Diff): number {
  return Math.round((60 + wear * 6) * (0.6 + diff * 0.3));
}

/** desgaste por segundo dirigindo: distância × carga × pancada × lama */
export function wearRate(speed: number, loadK: number, rough: number, mud: number, k: number): number {
  const v = Math.min(25, Math.abs(speed));
  // ~100 de desgaste em ~2 h de direção normal (40 km); pancada e lama aceleram muito
  return k * (v * 0.0035 * (1 + loadK * 0.8) + rough * 0.25 + mud * v * 0.004);
}
