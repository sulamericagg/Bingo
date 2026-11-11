/* Estúdio Bloop — COMÉDIA */
import type { FilmSpec } from './dsl';

export const COMEDIA: FilmSpec[] = [
  {
    id: 'bloop-c01',
    title: 'O Espirro Gigante',
    genre: 'comedia',
    mood: 'alegre',
    tags: ['espirro', 'parque'],
    cast: ['pipoca', 'bolota', 'zeca'],
    scenes: [
      {
        bg: 'park',
        at: '4.5 9 -',
        b: [
          'N: Um dia lindo no parque...',
          '0 wave happy: Que dia perfeito pra um piquenique!',
          '1 happy: E eu trouxe sanduíche de banana!',
          '2 < sleepy: Oi, gente... acho que tô gripado.',
          '0 surprised 1=scared: Gripado? Cuidado com o...',
          '2 scared !shake @push: A... AAA... ATCHIM!!!',
          '* 0=dizzy/surprised 1=dizzy/surprised !poof #bonk +0.6',
          '1 dizzy !stars: Cadê o sanduíche? Voou longe!',
        ],
      },
      {
        bg: 'street',
        tr: 'slide',
        at: '- - -',
        b: [
          'N: Enquanto isso, três ruas depois...',
          '0 < run surprised #whoosh: Corre, Bolota! Lá vai o lanche!',
          '1 < run laughing: Ele tá voando mais rápido que a gente!',
          '2 <11.8 happy: Achei! Caiu bem no meu chapéu!',
          '0 laughing 1=laughing ^: Seu espirro é um foguete, Zeca!',
          '2 shy: Atchim... quer dizer: de nada!',
        ],
      },
    ],
  },
];
