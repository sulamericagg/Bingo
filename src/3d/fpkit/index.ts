/* ============================================================
 *  FPKIT — kit compartilhado de 1ª pessoa (o "andar" da Cozinha Maluca, para todos).
 *  Ver docs/FPKIT.md.
 *    FpController — entrada → velocidade (accel/decel) → colisão (grade | sweep) [+ pulo/gravidade/chão]
 *    FpCamera     — olhar, balanço, rolagem, tremor, tranco, altura do olho, camClamp
 *    FpAim        — raio do centro + pick só quando precisa
 *    HeldItem     — viewmodel de objeto na mão (atraso, passo, golpe)
 *    GridCollider / AabbCollider / HeightGround / presets
 * ============================================================ */
export { FpController, type FpMoveInput } from './controller';
export { FpCamera, type FpBodyView } from './camera';
export { FpAim } from './aim';
export { HeldItem, Spring, type HeldItemOptions, type HeldSwing } from './held';
export { GridCollider, AabbCollider, combineColliders, type FpCollider, type FpBox, type SweepResult } from './collide';
export { HeightGround, type FpGroundOptions, type FpGroundBody } from './ground';
export { FP_COZINHA, FP_SURVIVAL, FP_INDOOR, FP_PRESETS, fpTuning, type FpTuning, type FpPresetName } from './tuning';
