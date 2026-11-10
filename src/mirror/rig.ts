/* ============================================================
 *  BLOOP ESPELHO — estado do rosto (0..1 / radianos) + suavização.
 *  "Esquerda" aqui é a do ESPELHO: o olho desenhado do lado esquerdo
 *  da tela acompanha o olho esquerdo do jogador (como num espelho).
 * ============================================================ */

export interface Rig {
  blinkL: number;
  blinkR: number;
  /** sobrancelha de cada lado: -1 franzida .. 1 levantada */
  browL: number;
  browR: number;
  /** meio das sobrancelhas pra cima (preocupado/surpreso) */
  browInner: number;
  jaw: number;
  smileL: number;
  smileR: number;
  frown: number;
  /** boca em "O"/bico */
  round: number;
  /** boca esticada (E/I) */
  wide: number;
  cheek: number;
  /** cabeça (rad): virar, inclinar pra frente, deitar de lado */
  yaw: number;
  pitch: number;
  roll: number;
  lookX: number;
  lookY: number;
}

export const RIG_KEYS = ['blinkL', 'blinkR', 'browL', 'browR', 'browInner', 'jaw', 'smileL', 'smileR', 'frown', 'round', 'wide', 'cheek', 'yaw', 'pitch', 'roll', 'lookX', 'lookY'] as const;
export type RigKey = (typeof RIG_KEYS)[number];

export const neutralRig = (): Rig => ({
  blinkL: 0,
  blinkR: 0,
  browL: 0,
  browR: 0,
  browInner: 0,
  jaw: 0,
  smileL: 0,
  smileR: 0,
  frown: 0,
  round: 0,
  wide: 0,
  cheek: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  lookX: 0,
  lookY: 0,
});

/** Filtro "one euro" (Casiez et al.): treme pouco parado, responde rápido em movimento. */
class OneEuro {
  private x = NaN;
  private dx = 0;
  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1,
  ) {}
  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, dt: number): number {
    if (Number.isNaN(this.x)) {
      this.x = v;
      return v;
    }
    const d = (v - this.x) / dt;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dx = this.dx + ad * (d - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x = this.x + a * (v - this.x);
    return this.x;
  }
  reset(): void {
    this.x = NaN;
    this.dx = 0;
  }
}

/** Parâmetros por canal: piscar precisa ser rápido; cabeça precisa ser estável. */
const TUNE: Record<RigKey, [number, number]> = {
  blinkL: [3, 2],
  blinkR: [3, 2],
  browL: [1.2, 0.6],
  browR: [1.2, 0.6],
  browInner: [1.2, 0.6],
  jaw: [2.5, 1.5],
  smileL: [1.2, 0.5],
  smileR: [1.2, 0.5],
  frown: [1, 0.4],
  round: [1.5, 0.8],
  wide: [1.5, 0.8],
  cheek: [1, 0.4],
  yaw: [0.8, 0.9],
  pitch: [0.8, 0.9],
  roll: [0.8, 0.9],
  lookX: [1.2, 0.8],
  lookY: [1.2, 0.8],
};

export class RigFilter {
  private f = {} as Record<RigKey, OneEuro>;
  constructor() {
    for (const k of RIG_KEYS) this.f[k] = new OneEuro(TUNE[k][0], TUNE[k][1]);
  }
  apply(raw: Rig, out: Rig, dt: number): void {
    const d = Math.max(1 / 120, Math.min(0.25, dt));
    for (const k of RIG_KEYS) out[k] = this.f[k].filter(raw[k], d);
  }
  reset(): void {
    for (const k of RIG_KEYS) this.f[k].reset();
  }
}

/** Mola criticamente amortecida (para voltar ao neutro quando o rosto some). */
export function approach(cur: number, target: number, rate: number, dt: number): number {
  return target + (cur - target) * Math.exp(-rate * dt);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const remap = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a));
