/* Abertura do Caça Bloop (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../games/_intro2/once';

export const cacaIntro = defineIntro('caca', () => import('./film'));
