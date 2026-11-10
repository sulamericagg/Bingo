/**
 * Preferências de controle (compartilhadas por todos os jogos).
 * Guardadas à parte do save principal (chave própria) para não mexer no esquema do save.
 */
import { save, persist } from '../../core/storage';

export type JoySize = 'S' | 'M' | 'L';
export type JoyMode = 'float' | 'fixed';

export interface ControlPrefs {
  /** sensibilidade do olhar (multiplicador; 1 = padrão, 0.4..2.5) */
  lookSens: number;
  /** 'float' (padrão): a base aparece onde o polegar toca; 'fixed': base parada em joyPos */
  joyMode: JoyMode;
  /**
   * posição de descanso/fixa do joystick, em fração da tela (x medido a partir da borda do lado
   * do joystick — espelha sozinho no modo canhoto). Padrão {x:.2, y:.78}: bem dentro da tela.
   */
  joyPos: { x: number; y: number };
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
const DEF: ControlPrefs = { lookSens: 1, joyMode: 'float', joyPos: { x: 0.2, y: 0.78 }, invertY: false, joySize: 'M', lefty: false, gyro: false };

function load(): ControlPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<ControlPrefs> & { sens?: 'low' | 'mid' | 'high' };
      // versão antiga: sensibilidade em 3 degraus
      if (o.lookSens == null && o.sens) o.lookSens = { low: 0.6, mid: 1, high: 1.6 }[o.sens];
      delete o.sens;
      const p = { ...DEF, ...o };
      p.lookSens = Math.max(0.4, Math.min(2.5, Number(p.lookSens) || 1));
      if (!p.joyPos || !(p.joyPos.x >= 0 && p.joyPos.x <= 1 && p.joyPos.y >= 0 && p.joyPos.y <= 1)) p.joyPos = { ...DEF.joyPos };
      return p;
    }
  } catch {
    /* sem storage */
  }
  return { ...DEF, joyPos: { ...DEF.joyPos } };
}
export const CONTROL_DEFAULTS: Readonly<ControlPrefs> = DEF;

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

/** API simples para os jogos: lê as preferências atuais (objeto vivo — não altere). */
export function getControlPrefs(): Readonly<ControlPrefs> {
  return controls;
}
/** Igual a onControlsChange (nome alternativo citado na documentação). */
export const onControlPrefs = onControlsChange;
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
