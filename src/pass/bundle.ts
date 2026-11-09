/* ============================================================
 *  COMBO "PASSES DO MÊS": Estelar + Casa + Musical com desconto.
 *  Só aparece quando o jogador ainda não tem NENHUM dos três premium
 *  da temporada (e não é do Clube, que já inclui os três).
 * ============================================================ */
import { PASS } from '../config';
import { addGems } from '../core/economy';
import { bus } from '../core/events';
import { persistNow, save } from '../core/storage';
import { clubActive } from '../services/ads';
import { ensureHomeSeason } from './home/state';
import { ensureMusicSeason } from './mstate';
import { ensureSeason } from './state';

export const bundleFullPrice = (): number => PASS.priceGems + PASS.homePriceGems + PASS.musicPriceGems;
export const bundleSavings = (): number => bundleFullPrice() - PASS.bundlePriceGems;

export function bundleAvailable(): boolean {
  if (!ensureSeason() || clubActive()) return false;
  ensureHomeSeason();
  ensureMusicSeason();
  return !save.pass.cur.premium && !save.hpass.cur.premium && !save.mpass.cur.premium;
}

export function buyMonthBundle(): 'ok' | 'gems' | 'owned' {
  if (!bundleAvailable()) return 'owned';
  if (save.gems < PASS.bundlePriceGems) return 'gems';
  addGems(-PASS.bundlePriceGems);
  save.pass.cur.premium = save.hpass.cur.premium = save.mpass.cur.premium = true;
  persistNow();
  bus.emit('pass');
  bus.emit('hpass');
  bus.emit('mpass');
  return 'ok';
}
