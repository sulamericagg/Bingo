/* ============================================================
 *  GARIMPO — FRETES ("caminhão simulator"): compradores cada vez mais longe pagando
 *  mais pelo grama, composições de carreta (simples → quadritrem) e o estado da viagem.
 *  Carga = concentrado de ouro do ESTOQUE (40 g por tonelada).
 * ============================================================ */
import { t } from '../../../i18n';
import type { RIcon } from '../rp/icons';

export interface Dest {
  id: string;
  name: () => string;
  icon: RIcon;
  /** km de estrada */
  km: number;
  /** multiplica o preço do grama */
  mul: number;
  /** entregas feitas para liberar */
  need: number;
}
export const DESTS: Dest[] = [
  { id: 'vila', name: () => t('gb.haul.d.vila', 'Cooperativa Vila Rica'), icon: 'station', km: 2.6, mul: 1.25, need: 0 },
  { id: 'refinaria', name: () => t('gb.haul.d.ref', 'Refinaria Serra Azul'), icon: 'wrench', km: 4.2, mul: 1.45, need: 1 },
  { id: 'cidade', name: () => t('gb.haul.d.city', 'Pedra Branca (joalheria)'), icon: 'gold', km: 6.2, mul: 1.65, need: 3 },
  { id: 'porto', name: () => t('gb.haul.d.port', 'Porto do Rio Grande'), icon: 'flag', km: 9, mul: 1.95, need: 6 },
];

export interface Combo {
  n: number;
  name: () => string;
  /** comprimento de cada carreta (pino-rei → eixo traseiro) */
  len: number;
  /** toneladas de carga máximas */
  cap: number;
  price: number;
}
export const COMBOS: Combo[] = [
  { n: 1, name: () => t('gb.haul.c1', 'Carreta simples'), len: 10.5, cap: 25, price: 14000 },
  { n: 2, name: () => t('gb.haul.c2', 'Bitrem'), len: 8.2, cap: 40, price: 7000 },
  { n: 3, name: () => t('gb.haul.c3', 'Tritrem'), len: 7.2, cap: 55, price: 11000 },
  { n: 4, name: () => t('gb.haul.c4', 'Quadritrem'), len: 6.6, cap: 70, price: 17000 },
];
export const G_PER_T = 40;

export interface Trip {
  dest: number;
  combo: number;
  gold: number;
  /** posição na estrada (m) */
  s: number;
  dmg: number;
  /** hora/dia de saída (prazo) */
  day: number;
  hour: number;
  fuel: number;
  coupled: boolean;
  night: number;
}
export interface HaulSave {
  /** composições compradas: 0 = nenhuma (sem cavalo), 1..4 */
  owned: number;
  deliveries: number;
  earned: number;
  trip?: Trip | null;
  /** diesel no tanque do cavalo entre viagens */
  fuel?: number;
}
export const freshHaul = (): HaulSave => ({ owned: 0, deliveries: 0, earned: 0, trip: null });
export const RIG_TANK = 600;
/** prazo (h de jogo) para o bônus de pontualidade */
export const deadline = (km: number): number => 1.2 + km * 0.32;
