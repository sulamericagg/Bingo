/* ============================================================
 *  AURA E DANÇA EQUIPADAS (Passe Musical) — hooks leves para quem desenha o Bloop.
 *    drawEquippedAura(ctx, x, y, R, t)  → atrás do personagem (hub e Orbit)
 *    triggerDance() / danceFrameNow()   → dança como emote (toque no Bloop do hub)
 *  O conteúdo musical (./music/index) só é carregado quando há algo equipado.
 * ============================================================ */
import { bus } from '../core/events';
import { persist, save } from '../core/storage';

type MusicMod = typeof import('./music/index');
let mod: MusicMod | null = null;
let loading = false;
function load(): MusicMod | null {
  if (mod || loading) return mod;
  loading = true;
  import('./music/index').then((m) => {
    m.ensureMusicPassRegistered();
    mod = m;
  });
  return null;
}

export const equippedAura = (): string => save.equip?.aura ?? '';
export const equippedDance = (): string => save.equip?.dance ?? '';

export function equipAura(id: string): void {
  save.equip.aura = save.equip.aura === id ? '' : id;
  persist();
  bus.emit('cosmetics');
}
export function equipDance(id: string): void {
  save.equip.dance = save.equip.dance === id ? '' : id;
  persist();
  bus.emit('cosmetics');
}

/** Desenha a aura equipada centrada em (x,y) com raio do personagem R. Nada se não houver. */
export function drawEquippedAura(c: CanvasRenderingContext2D, x: number, y: number, R: number, t: number): void {
  const id = save.equip?.aura;
  if (!id) return;
  const m = mod ?? load();
  if (m) m.drawAura(c, id, x, y, R, t);
}

let danceStart = -1;
let player: ReturnType<MusicMod['playDance']> = null;
/** Toca a dança equipada por ~1 ciclo (emote). Emite 'dance-play' (desafio semanal). */
export function triggerDance(): boolean {
  const id = save.equip?.dance;
  if (!id) return false;
  const m = mod ?? load();
  if (!m) return false;
  player = m.playDance(id);
  if (!player) return false;
  danceStart = performance.now() / 1000;
  bus.emit('dance-play', { id });
  return true;
}

/**
 * Se uma dança está tocando, aplica a pose no ctx (já transladado para o centro do Bloop),
 * desenha os bracinhos e devolve a pose para o chamador multiplicar sx/sy/mood do drawPlayer.
 * Depois do drawPlayer, chame drawDanceFxNow com a mesma pose. null = sem dança.
 */
export function danceFrameNow(c: CanvasRenderingContext2D, R: number, armColor: string): import('./music/index').DancePose | null {
  if (!player || !mod) return null;
  const tt = performance.now() / 1000 - danceStart;
  if (tt > Math.max(2, player.loopSec)) {
    player = null;
    return null;
  }
  const p = player.frame(tt);
  mod.applyDancePose(c, p, R);
  mod.drawDanceArms(c, p, R, armColor);
  return p;
}
export function drawDanceFxNow(c: CanvasRenderingContext2D, p: import('./music/index').DancePose, R: number): void {
  mod?.drawDanceFx(c, p, 0, 0, R);
}

// pré-carrega se já houver algo equipado
if (typeof window !== 'undefined' && (save.equip?.aura || save.equip?.dance)) setTimeout(load, 1500);
