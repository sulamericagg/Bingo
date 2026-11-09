/**
 * CONTRATO DOS BICHINHOS (criaturas colecionáveis).
 * O agente "criaturas" implementa src/creatures/catalog.ts + render.ts.
 * O Passe de Batalha usa seasonCreatures(i) para montar as recompensas de cada temporada.
 */
export type CreatureRarity = 'common' | 'medio' | 'rare' | 'epic' | 'legendary';

export interface CreatureDef {
  id: string; // único e estável para sempre, ex.: 's07-legendary'
  name: string; // nome em pt-BR (traduzível com t('creature.<id>', name))
  rarity: CreatureRarity;
  season: number; // 0..59 (0 = dezembro/2026)
  theme: string; // tema da temporada
  desc: string;
}

/** Recompensas-criatura de cada temporada (5 por temporada, todas únicas no total). */
export interface SeasonCreatures {
  common: CreatureDef;
  medio: CreatureDef;
  rare: CreatureDef;
  epic: CreatureDef;
  legendary: CreatureDef;
}
