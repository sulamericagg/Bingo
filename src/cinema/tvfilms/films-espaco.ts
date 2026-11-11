/* Estúdio Bloop — ESPAÇO */
import type { FilmSpec } from './dsl';

export const ESPACO: FilmSpec[] = [
  {
    id: 'bloop-x01',
    title: 'A Lua de Queijo',
    genre: 'espaco',
    mode: '3d',
    mood: 'aventura',
    tags: ['lua', 'foguete', 'queijo'],
    cast: ['estrela', 'gato', 'robozinho'],
    scenes: [
      {
        bg: 'space',
        at: '4.2 8 11.8',
        b: [
          '0 point happy: Missão de hoje: descobrir se a lua é mesmo de queijo!',
          '1 love !hearts: Miau! Eu trouxe a faca e o pão!',
          '2 think thinking: Meus cálculos dizem: a lua é de pedra.',
          '1 sad: Pedra não combina com pão...',
          '0 surprised !sparkles #magic: Olhem! Uma cratera amarelinha!',
          '1 >9.6 run surprised #whoosh: É QUEIJO! Eu sabia!',
          '2 laughing: É uma bandeira amarela. Do último astronauta.',
          '1 facepalm sad: Nãooo...',
          '0 happy: Mas tem um bilhete: deixei um lanche no foguete.',
          '1 cheer laughing !confetti: Sanduíche de queijo espacial!',
          '2 dance happy !notes: Missão cumprida! Mais ou menos!',
        ],
      },
    ],
  },
  {
    id: 'bloop-x02',
    title: 'O Planeta Silencioso',
    genre: 'espaco',
    mood: 'sono',
    tags: ['planeta', 'estrelas', 'música'],
    cast: ['lumi', 'nuvem'],
    scenes: [
      {
        bg: 'space',
        light: 'night',
        at: '5 11',
        b: [
          'N: Num planeta bem longe, ninguém fazia barulho.',
          '0 happy %whisper: Por que aqui é tão quietinho?',
          '1 sad: Porque ninguém aqui aprendeu a cantar.',
          '0 surprised: Ninguém? Nem uma musiquinha?',
          '1 shy: Eu tenho vergonha. E se eu desafinar?',
          '0 happy !notes: Lá, lá, lá... viu? Desafinar também é bonito!',
          '1 think thinking: Lá... lá...',
          '1 happy !notes !sparkles: Lá, lá, láááá!',
          '* !stars #magic +0.6',
          'N: E as estrelas, uma por uma, começaram a piscar no ritmo.',
          '0 love !hearts: O planeta inteiro está cantando com você!',
          '1 dance love: Agora ele se chama Planeta Cantoria!',
        ],
      },
    ],
  },
];
