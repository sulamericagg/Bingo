/* Abertura de Rally Lunar (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const rallyIntro = defineIntro('rally', () => import('./film'));
