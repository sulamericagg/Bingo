/* Abertura do Sobreviva aos Desastres (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const disasterIntro = defineIntro('disaster', () => import('./film'));
