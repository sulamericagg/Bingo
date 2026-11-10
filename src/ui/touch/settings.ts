/**
 * Preferências de controle (compartilhadas por todos os jogos).
 * Guardadas à parte do save principal (chave própria) para não mexer no esquema do save.
 */
import { save, persist } from '../../core/storage';

export type Sens = 'low' | 'mid' | 'high';
export type JoySize = 'S' | 'M' | 'L';

export interface ControlPrefs {
  /** sensibilidade do olhar (arrastar a câmera) */
  sens: Sens;
  /** inverter eixo vertical do olhar */
  invertY: boolean;
  /** tamanho do joystick */
  joySize: JoySize;
  /** canhoto: joystick à direita, botões à esquerda */
  lefty: boolean;
  /** mira por giroscópio (1ª pessoa) */
  gyro: boolean;
}

const KEY = 'bw-controls';
const DEF: ControlPrefs = { sens: 'mid', invertY: false, joySize: 'M', lefty: false, gyro: false };

function load(): ControlPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEF, ...(JSON.parse(raw) as Partial<ControlPrefs>) };
  } catch {
    /* sem storage */
  }
  return { ...DEF };
}

export const controls: ControlPrefs = load();
const subs = new Set<(p: ControlPrefs) => void>();

export function setControl<K extends keyof ControlPrefs>(k: K, v: ControlPrefs[K]): void {
  controls[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(controls));
  } catch {
    /* sem storage */
  }
  subs.forEach((f) => f(controls));
}

/** Avisa quando alguma preferência mudar. Retorna função para cancelar. */
export function onControlsChange(f: (p: ControlPrefs) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

export const SENS_MUL: Record<Sens, number> = { low: 0.6, mid: 1, high: 1.6 };
export const JOY_MUL: Record<JoySize, number> = { S: 0.82, M: 1, L: 1.22 };

export function hapticsOn(): boolean {
  return !!save.haptics;
}
export function setHaptics(on: boolean): void {
  save.haptics = on;
  persist();
}

/* ---------------- "Jogar sozinho" (sem bots), lembrado por jogo ---------------- */
const SOLO_KEY = 'bw-solo';
function soloMap(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SOLO_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}
/** O jogador escolheu jogar sozinho (sem bots/fantasmas) neste jogo? */
export function isSolo(game: string): boolean {
  return !!soloMap()[game];
}
export function setSolo(game: string, on: boolean): void {
  const m = soloMap();
  m[game] = on;
  try {
    localStorage.setItem(SOLO_KEY, JSON.stringify(m));
  } catch {
    /* sem storage */
  }
}
