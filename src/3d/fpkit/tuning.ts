/* ============================================================
 *  FPKIT — números do "feel" de 1ª pessoa. Um objeto simples (sem classe), copiável e
 *  ajustável por quadro (ex.: tema "espaço" troca accel/bounce na hora).
 *  Presets: cozinha (referência — anda bonito), survival (mais pesado, pulo/gravidade),
 *  indoor (casa/cabine: passos curtos, balanço discreto).
 * ============================================================ */

export interface FpTuning {
  /* ---- movimento (FpController) ---- */
  /** velocidade de andar (m/s) */
  speed: number;
  /** resposta com o direcional apertado (1/s): v += (alvo - v) · min(1, dt·accel) */
  accel: number;
  /** resposta soltando o direcional (1/s) — frenagem/atrito */
  decel: number;
  /** multiplicador de velocidade com `sprint` */
  sprintMul: number;
  /** raio do corpo (m) */
  radius: number;
  /** batida na parede: v *= -bounce no eixo bloqueado (0 = para; 0.4 = "gravidade zero") */
  bounce: number;
  /** empurrão suave entre jogadores: distância (m) e força (fração da sobreposição por quadro) */
  pushRadius: number;
  pushK: number;
  /** gravidade (m/s²). 0 = chão plano fixo (sem eixo Y) */
  gravity: number;
  /** velocidade do pulo (m/s). 0 = sem pulo */
  jumpV: number;
  /** controle no ar (0..1 da resposta normal) */
  airControl: number;
  /* ---- câmera (FpCamera) ---- */
  /** altura dos olhos acima dos pés (m) */
  eye: number;
  pitchMin: number;
  pitchMax: number;
  /** fase do balanço anda bobRate·speedK rad/s; vertical = sin(2·fase)·bobAmp·speedK */
  bobRate: number;
  bobAmp: number;
  /** rolagem do passo = cos(fase)·rollAmp·speedK */
  rollAmp: number;
  /** tremor: decai shakeDecay/s; amplitude ±shakeAmp/2 · shake */
  shakeDecay: number;
  shakeAmp: number;
  /** tranco (recoil): decai recoilDecay/s; afunda sin(π·recoil)·recoilAmp */
  recoilDecay: number;
  recoilAmp: number;
  /** folga da câmera para a parede/móvel (m) — maior que meio plano near com FOV largo */
  camMargin: number;
  /** suavização vertical do olho (1/s) ao subir degraus/rampas. 0 = segue os pés na hora */
  eyeSmooth: number;
  /** >0: o olho suaviza também no ar (pulo/queda sem "pulo" de câmera) e nunca fica mais longe
   *  que isto dos pés (teleporte/queda longa puxam junto). 0 = desligado (comportamento original) */
  eyeLag: number;
}

/** Cozinha Maluca — a referência ("anda bonito"). Valores IDÊNTICOS ao render3d original. */
export const FP_COZINHA: Readonly<FpTuning> = Object.freeze({
  speed: 3.3,
  accel: 10,
  decel: 14,
  sprintMul: 1,
  radius: 0.3,
  bounce: 0,
  pushRadius: 0.55,
  pushK: 0.5,
  gravity: 0,
  jumpV: 0,
  airControl: 1,
  eye: 1.45,
  pitchMin: -1.3,
  pitchMax: 1.1,
  bobRate: 9,
  bobAmp: 0.025,
  rollAmp: 0.008,
  shakeDecay: 1.6,
  shakeAmp: 0.12,
  recoilDecay: 7,
  recoilAmp: 0.012,
  camMargin: 0.34,
  eyeSmooth: 0,
  eyeLag: 0,
});

/** Sobrevivência/exploração ao ar livre: mais massa (acelera e freia devagar), corrida, pulo, gravidade. */
export const FP_SURVIVAL: Readonly<FpTuning> = Object.freeze({
  ...FP_COZINHA,
  speed: 3.0,
  accel: 6,
  decel: 8,
  sprintMul: 1.6,
  radius: 0.35,
  gravity: 18,
  jumpV: 5.4,
  airControl: 0.35,
  eye: 1.6,
  pitchMin: -1.45,
  pitchMax: 1.45,
  bobRate: 8,
  bobAmp: 0.035,
  rollAmp: 0.012,
  camMargin: 0.3,
  eyeSmooth: 14,
});

/** Interiores (casa, cabine, quarto): passos curtos e responsivos, balanço discreto. */
export const FP_INDOOR: Readonly<FpTuning> = Object.freeze({
  ...FP_COZINHA,
  speed: 2.4,
  accel: 12,
  decel: 16,
  radius: 0.28,
  eye: 1.5,
  bobRate: 8.5,
  bobAmp: 0.018,
  rollAmp: 0.005,
  camMargin: 0.3,
});

export const FP_PRESETS = { cozinha: FP_COZINHA, survival: FP_SURVIVAL, indoor: FP_INDOOR } as const;
export type FpPresetName = keyof typeof FP_PRESETS;

/** cópia mutável de um preset (+ ajustes) */
export function fpTuning(base: FpPresetName | Readonly<FpTuning> = 'cozinha', over: Partial<FpTuning> = {}): FpTuning {
  const b = typeof base === 'string' ? FP_PRESETS[base] : base;
  return { ...b, ...over };
}
