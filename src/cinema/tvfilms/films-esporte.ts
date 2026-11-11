/* Estúdio Bloop — ESPORTE */
import type { FilmSpec } from './dsl';

export const ESPORTE: FilmSpec[] = [
  {
    id: 'bloop-s01',
    title: 'O Gol de Bicicleta',
    genre: 'esporte',
    mood: 'festa',
    tags: ['futebol', 'time'],
    cast: ['trovao', 'nina', 'gema'],
    scenes: [
      {
        bg: 'park',
        at: '4.2 11.8 8',
        b: [
          '2 happy: Último minuto! Quem fizer o gol, ganha!',
          '0 flex smug: Deixa comigo! Vou fazer um gol de bicicleta!',
          '1 think thinking: Você sabe fazer gol de bicicleta?',
          '0 shrug: Não. Mas eu sei andar de bicicleta!',
          '0 >14 run happy !zoomlines #whoosh: Lá vou eu!',
          '0 spin dizzy !stars #bonk: Uooou! Errei a bola!',
          '1 >6 run laughing #whoosh: Mas a bola bateu na sua cabeça e...',
          '* !confetti #applause +0.5',
          '2 cheer surprised: GOOOOL! De cabeça sem querer!',
          '0 dizzy happy: Eu... planejei tudo isso!',
          '1 laughing: Claro que planejou, campeão!',
        ],
      },
    ],
  },
  {
    id: 'bloop-s02',
    title: 'A Corrida da Tartaruga',
    genre: 'esporte',
    mode: '3d',
    mood: 'aventura',
    tags: ['corrida', 'paciência'],
    cast: ['faisca', 'sapo', 'coelho'],
    scenes: [
      {
        bg: 'desert',
        at: '4 8 12',
        b: [
          '0 point happy: Corrida até o cacto grande! Preparados?',
          '2 smug: Eu sou o mais rápido do deserto. Vai ser fácil!',
          '1 happy: Eu vou no meu ritmo. Pulinho por pulinho.',
          '0 cheer happy #drumroll: Três, dois, um... JÁ!',
          '2 >18.5 run laughing #whoosh: Tchauuuu!',
          '1 >10.5 happy ^ #boing: Pulinho... pulinho...',
          'N: Lá na frente, o coelho resolveu tirar um cochilo...',
          '1 >13.5 happy ^ #boing: Pulinho... e mais um pulinho!',
          '0 surprised: O sapinho chegou primeiro!',
          '2 <15.8 surprised !sweat: Ei! Eu só fechei o olho um segundo!',
          '1 happy: Bom é chegar. E chegar sorrindo!',
          '2 shy: Revanche amanhã? Sem cochilo, prometo.',
        ],
      },
    ],
  },
];
