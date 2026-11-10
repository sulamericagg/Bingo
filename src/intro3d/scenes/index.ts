/* Mapa id do jogo → cena da intro */
import type { SceneFn } from '../kit';
import { band } from './band';
import { casa } from './casa';
import { cozinha } from './cozinha';
import { disaster } from './disaster';
import { floresta } from './floresta';
import { orbit } from './orbit';
import { pet } from './pet';
import { rally } from './rally';
import { tubo } from './tubo';
import { tycoon } from './tycoon';

export const SCENES: Record<string, SceneFn> = { orbit, tubo, rally, tycoon, disaster, band, cozinha, floresta, pet, casa };
