/* ============================================================
 *  BLOOP ESPELHO — direito de uso (regras do dono):
 *   - grátis: 3 min/dia de rosto+voz, 2 vozes (Normal, Bloop fofo);
 *     1 vídeo premiado por dia dá +2 min.
 *   - Clube Bloop ativo OU qualquer passe premium da temporada
 *     (Estelar, Casa, Musical): tempo ilimitado + todas as vozes.
 *  Usa os helpers existentes (clubActive / passPremiumActive) — nenhum produto novo.
 * ============================================================ */
import { dayNumber, persist, persistNow, save } from '../core/storage';
import { clubActive, passPremiumActive } from '../services/ads';

export const FREE_DAILY_MS = 3 * 60_000;
export const AD_BONUS_MS = 2 * 60_000;

export interface MirrorSave {
  day: number;
  usedMs: number;
  bonusMs: number;
  adDay: number;
  /** viu a explicação de privacidade da câmera */
  consent: boolean;
  voice: string;
  scene: string;
  sticker: string;
}

const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
/** só em ?debug: força o direito pago (true) / grátis (false) nos testes */
let debugUnlimited: boolean | null = null;
export function setDebugUnlimited(v: boolean | null): void {
  if (DEBUG) debugUnlimited = v;
}

export function mirrorSave(): MirrorSave {
  const s = save as unknown as { mirror?: Partial<MirrorSave> };
  const m = (s.mirror ??= {}) as MirrorSave;
  m.day ??= 0;
  m.usedMs ??= 0;
  m.bonusMs ??= 0;
  m.adDay ??= -1;
  m.consent ??= false;
  m.voice ??= 'normal';
  m.scene ??= 'quarto';
  m.sticker ??= 'none';
  const d = dayNumber();
  if (m.day !== d) {
    m.day = d;
    m.usedMs = 0;
    m.bonusMs = 0;
  }
  return m;
}

/** Clube Bloop ou passe premium vigente → sem limite e todas as vozes. */
export function mirrorUnlimited(): boolean {
  if (debugUnlimited !== null) return debugUnlimited;
  return clubActive() || passPremiumActive();
}

/** ms restantes hoje (Infinity para assinante/passe). */
export function mirrorLeftMs(): number {
  if (mirrorUnlimited()) return Infinity;
  const m = mirrorSave();
  return Math.max(0, FREE_DAILY_MS + m.bonusMs - m.usedMs);
}

let unsaved = 0;
/** Desconta tempo de uso (só conta para quem é grátis). */
export function consumeMirror(ms: number): void {
  if (mirrorUnlimited() || ms <= 0) return;
  const m = mirrorSave();
  m.usedMs = Math.min(FREE_DAILY_MS + m.bonusMs, m.usedMs + ms);
  unsaved += ms;
  if (unsaved > 5000 || mirrorLeftMs() <= 0) {
    unsaved = 0;
    persist();
  }
}

export function flushMirror(): void {
  unsaved = 0;
  persistNow();
}

/** Vídeo premiado de +2 min: 1x por dia, só para quem é grátis. */
export function canAdBonus(): boolean {
  return !mirrorUnlimited() && mirrorSave().adDay !== dayNumber();
}
export function grantAdBonus(): void {
  const m = mirrorSave();
  m.adDay = dayNumber();
  m.bonusMs += AD_BONUS_MS;
  persistNow();
}

export function setMirrorPref<K extends 'voice' | 'scene' | 'sticker' | 'consent'>(k: K, v: MirrorSave[K]): void {
  mirrorSave()[k] = v;
  persist();
}

export function fmtLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
