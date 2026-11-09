/**
 * Estado dos bichinhos do jogador (leve: não importa o renderizador).
 * Eventos no bus: 'creature-granted' (id), 'companion-changed' (id|''), 'profile-creature-changed' (id|'').
 */
import { bus } from '../core/events';
import { persist, save } from '../core/storage';
import type { CreatureRarity } from './api';

export function ownedCreatures(): readonly string[] {
  return save.creatures;
}
export function ownsCreature(id: string): boolean {
  return save.creatures.includes(id);
}
/** Dá um bichinho ao jogador. Retorna true se for novo. */
export function grantCreature(id: string): boolean {
  if (!/^s\d\d-(common|medio|rare|epic|legendary)$/.test(id) || save.creatures.includes(id)) return false;
  save.creatures.push(id);
  if (!save.creaturesNew.includes(id)) save.creaturesNew.push(id);
  persist();
  bus.emit('creature-granted', id);
  bus.emit('hub-registry'); // atualiza o badge do painel
  return true;
}
export function markCreatureSeen(id?: string): void {
  const before = save.creaturesNew.length;
  save.creaturesNew = id ? save.creaturesNew.filter((x) => x !== id) : [];
  if (save.creaturesNew.length !== before) {
    persist();
    bus.emit('hub-registry');
  }
}
export function getCompanion(): string {
  return save.companion && ownsCreature(save.companion) ? save.companion : '';
}
export function setCompanion(id: string): void {
  save.companion = id && ownsCreature(id) ? id : '';
  persist();
  bus.emit('companion-changed', save.companion);
}
export function getProfileCreature(): string {
  return save.profileCreature && ownsCreature(save.profileCreature) ? save.profileCreature : '';
}
export function setProfileCreature(id: string): void {
  save.profileCreature = id && ownsCreature(id) ? id : '';
  persist();
  bus.emit('profile-creature-changed', save.profileCreature);
}

/**
 * Nível do Passe em que cada raridade é liberada. O agente do Passe pode trocar com
 * setCreatureLevelResolver() para refletir a trilha real de recompensas.
 */
const DEFAULT_LEVEL: Record<CreatureRarity, number> = { common: 5, medio: 15, rare: 25, epic: 40, legendary: 50 };
let resolver: (season: number, rarity: CreatureRarity) => number | null = (_s, r) => DEFAULT_LEVEL[r];
export function setCreatureLevelResolver(fn: (season: number, rarity: CreatureRarity) => number | null): void {
  resolver = fn;
}
export function creaturePassLevel(season: number, rarity: CreatureRarity): number | null {
  return resolver(season, rarity);
}
