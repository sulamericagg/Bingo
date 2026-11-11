/* Estúdio Bloop — FAZENDA */
import type { FilmSpec } from './dsl';

export const FAZENDA: FilmSpec[] = [
  {
    id: 'bloop-f01',
    title: 'A Ovelha que Não Dormia',
    genre: 'fazenda',
    mood: 'sono',
    tags: ['fazenda', 'noite', 'ovelha'],
    cast: ['ovelha', 'galo', 'gema'],
    scenes: [
      {
        bg: 'park',
        light: 'night',
        at: '4.2 11.8 8',
        b: [
          '2 sleepy: Hora de dormir, bichinhos da fazenda!',
          '0 sad: Mas eu não tenho sono nenhum!',
          '1 sleepy: Conta ovelhinhas, ué.',
          '0 shrug: Mas EU sou a ovelhinha! Vou contar o quê?',
          '2 laughing: Conta galinhos, então!',
          '0 think thinking: Um galinho... dois galinhos... três galinhos...',
          '1 surprised: Ei! Tá me contando três vezes!',
          '0 laughing: É que você fica pulando!',
          '1 sleepy sit: Então... vou ficar paradinho...',
          '0 sleepy lie: Quatro galinhos... cinco... zzz...',
          '2 love !stars #magic: Boa noite, fazenda.',
        ],
      },
    ],
  },
  {
    id: 'bloop-f02',
    title: 'A Grande Colheita',
    genre: 'fazenda',
    mode: '3d',
    mood: 'alegre',
    tags: ['fazenda', 'horta', 'trabalho em equipe'],
    cast: ['tuca', 'cabra', 'abelha', 'milho'],
    scenes: [
      {
        bg: 'park',
        at: '3.3 6.4 9.6 12.7',
        b: [
          '0 happy: Hoje é dia de colheita! Cada um ajuda um pouquinho.',
          '1 smug: Eu ajudo comendo o que cair no chão.',
          '2 happy !notes: Eu já ajudei: polinizei todas as flores!',
          '3 shy: E eu... eu sou um milho. Eu sou a colheita.',
          '0 surprised: Ah! Então você é o convidado de honra!',
          '1 laughing: Ninguém vai te comer, Milhito. Promessa de cabra.',
          '2 point happy: Olhem as abóboras! Estão enormes!',
          '0 cheer happy !sparkles #ding: A maior abóbora da história!',
          '3 happy: Vamos fazer uma festa pra ela!',
          '1 dance laughing !confetti #applause: Festa da abóbora! Com muita música!',
        ],
      },
    ],
  },
];
