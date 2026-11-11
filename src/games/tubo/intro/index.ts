/* Abertura de Queda Giratória (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const tuboIntro = defineIntro('tubo', () => import('./film'));
