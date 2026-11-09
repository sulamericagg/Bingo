/**
 * Catálogo de itens que podem ser dados em pacotes (usado pelo painel admin).
 * Lê direto de src/game/skins.ts — ao adicionar skins/rastros lá, o painel
 * passa a oferecê-los automaticamente no próximo deploy.
 */
import { SKINS, TRAILS } from '../src/game/skins';

export interface CatalogItem {
  id: string;
  name: string;
  colors: string[];
  rarity?: string;
}

export const CATALOG_SKINS: CatalogItem[] = SKINS.map((s) => ({ id: s.id, name: s.name, colors: [s.light, s.dark], rarity: s.rarity }));
export const CATALOG_TRAILS: CatalogItem[] = TRAILS.map((t) => ({ id: t.id, name: t.name, colors: t.colors.slice(0, 3) }));

export const CATALOG_BOOSTS: { id: 'shield' | 'magnet' | 'headstart'; name: string }[] = [
  { id: 'shield', name: 'Escudo' },
  { id: 'magnet', name: 'Ímã' },
  { id: 'headstart', name: 'Largada turbo' },
];
