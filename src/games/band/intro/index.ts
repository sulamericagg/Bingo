/* Abertura de Bloop Banda (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const bandIntro = defineIntro('band', () => import('./film'));
