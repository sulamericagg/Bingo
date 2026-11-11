/* Abertura da Cozinha Maluca (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const cozinhaIntro = defineIntro('cozinha', () => import('./film'));
