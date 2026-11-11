/* Abertura de Desenha e Vira! (filme em ./film.ts, carregado sob demanda). Ver docs/INTROS.md. */
import { defineIntro } from '../../_intro2/once';

export const desenhoIntro = defineIntro('desenho', () => import('./film'));
