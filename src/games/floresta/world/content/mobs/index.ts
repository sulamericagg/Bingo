/* ============================================================
 *  BICHOS DO MUNDO — ponto de entrada público.
 *  Uso (ver docs/MUNDO-CRIATURAS.md):
 *    const mobs = new MobManager(host, scene, renderer, tier, hudRoot);
 *    // a cada quadro:  mobs.update(dt, camera)
 *    // golpe:          mobs.hitArc(px, pz, yaw, 2.2, 0.9, dano)
 *    // tiro:           mobs.shoot(x, y, z, vx, vy, vz, dano)
 *    // usar item:      mobs.interact(mobs.pick(...)!, itemNaMao)
 * ============================================================ */
export { MobManager, angDiff } from './manager';
export type { DamageOpts, DamageResult, InteractAction, InteractResult, MobEvent, MobSave } from './manager';
export { Mob } from './mob';
export type { St } from './mob';
export { ALL_MOBS, MOB_INDEX, mobDef } from './registry';
export { ANIMALS } from './animals';
export { MONSTERS } from './monsters';
export { BOSS_DEFS, BOSS_PREP } from './bosses';
export { BossCtl, lairAt, lairProps, LAIR_CELL } from './boss';
export { MOB_ITEMS, type MobItem } from './items';
export { MobRenderer, mobTime } from './render';
export { MobFx } from './fx';
export { findPath } from './path';
export * from './types';
export type { BossView } from './bossbar';
