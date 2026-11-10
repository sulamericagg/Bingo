/* Mapa id do jogo → cena da intro */
import type { SceneFn } from '../kit';
import { orbit } from './orbit';

export const SCENES: Record<string, SceneFn> = {
  orbit,
};
