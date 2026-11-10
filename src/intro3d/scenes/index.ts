/* Mapa id do jogo → cena da intro */
import type { SceneFn } from '../kit';
import { band } from './band';
import { casa } from './casa';
import { cor } from './cor';
import { cozinha } from './cozinha';
import { disaster } from './disaster';
import { espelho } from './espelho';
import { floresta } from './floresta';
import { orbit } from './orbit';
import { pet } from './pet';
import { rally } from './rally';
import { tubo } from './tubo';
import { tycoon } from './tycoon';
import { voo } from './voo';

export const SCENES: Record<string, SceneFn> = { orbit, tubo, rally, tycoon, disaster, band, cozinha, floresta, pet, casa, voo, cor, espelho };
