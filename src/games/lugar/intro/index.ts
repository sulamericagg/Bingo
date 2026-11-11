/* Abertura de Bloop no Lugar (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const lugarIntro = defineIntro('lugar', () => import('./film'));
