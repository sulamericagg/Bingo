/* ============================================================
 *  BLOOP STUDIO — "Ferramentas Pro" e limites.
 *  Pro = assinante do Clube Bloop OU dono de um passe premium da temporada
 *  (Estelar, Casa ou Musical). Nenhum produto novo de compra: o paywall só
 *  leva ao Clube/Passe que já existem.
 * ============================================================ */
import { clubActive } from '../services/ads';
import { isPremium } from '../pass/state';
import { musicPremium } from '../pass/mstate';
import { homePremium } from '../pass/home/state';
import type { Tier } from '../core/quality';

let debugPro: boolean | null = null;
/** só para testes (?debug): força Pro ligado/desligado (null = real) */
export function setDebugPro(v: boolean | null): void {
  debugPro = v;
}

export function isPro(): boolean {
  if (debugPro !== null) return debugPro;
  try {
    return clubActive() || isPremium() || musicPremium() || homePremium();
  } catch {
    return clubActive();
  }
}

export type ProFeature = 'logic' | 'joints' | 'pen' | 'maps' | 'parts' | 'publish';

/** Limites de peças por nível de qualidade do aparelho (0 Mínimo … 3 Alto). */
const PARTS_FREE: Record<Tier, number> = { 0: 80, 1: 120, 2: 160, 3: 200 };
const PARTS_PRO: Record<Tier, number> = { 0: 220, 1: 400, 2: 700, 3: 1000 };

export const FREE = {
  /** juntas + motores grátis por criação */
  joints: 2,
  /** mapas salvos */
  maps: 3,
  /** publicações por dia */
  publishPerDay: 1,
} as const;
export const PRO = { joints: 64, maps: 200, publishPerDay: 10 } as const;

export function partLimit(tier: Tier, pro = isPro()): number {
  return (pro ? PARTS_PRO : PARTS_FREE)[tier] ?? 120;
}
export const jointLimit = (pro = isPro()): number => (pro ? PRO.joints : FREE.joints);
export const mapLimit = (pro = isPro()): number => (pro ? PRO.maps : FREE.maps);
export const publishLimit = (pro = isPro()): number => (pro ? PRO.publishPerDay : FREE.publishPerDay);
