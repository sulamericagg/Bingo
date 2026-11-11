/* ============================================================
 *  BICHOS — catálogo único (índice = espécie no desenho).
 * ============================================================ */
import { ANIMALS } from './animals';
import { MONSTERS } from './monsters';
import { BOSS_DEFS } from './bosses';
import type { MobDef } from './types';

export const ALL_MOBS: MobDef[] = [...ANIMALS, ...MONSTERS, ...BOSS_DEFS];
export const MOB_INDEX = new Map<string, number>(ALL_MOBS.map((d, i) => [d.id, i]));
export function mobDef(id: string): MobDef | undefined {
  const i = MOB_INDEX.get(id);
  return i === undefined ? undefined : ALL_MOBS[i];
}
