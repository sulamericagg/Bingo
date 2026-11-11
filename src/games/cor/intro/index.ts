/* Abertura de Pintou, Ganhou! (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const corIntro = defineIntro('cor', () => import('./film'));
