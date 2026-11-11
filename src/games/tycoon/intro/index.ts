/* Abertura de Fábrica Estelar (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const tycoonIntro = defineIntro('tycoon', () => import('./film'));
