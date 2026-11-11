/* Estúdio Bloop — FESTA */
import type { FilmSpec } from './dsl';

export const FESTA: FilmSpec[] = [
  {
    id: 'bloop-p01',
    title: 'A Festa Quase Surpresa',
    genre: 'festa',
    mood: 'festa',
    tags: ['aniversário', 'surpresa'],
    cast: ['pipoca', 'lumi', 'trovao'],
    scenes: [
      {
        bg: 'bedroom',
        at: '5 11 -',
        b: [
          '0 smug %whisper: Psiu! A festa do Trovão é surpresa. Ninguém conta!',
          '1 happy: Eu trouxe os balões!',
          '2 <8 happy #steps: Oi, gente! O que vocês estão fazendo?',
          '0 scared 1=scared !sweat: NADA! Nada mesmo!',
          '1 shy: A gente estava... é... contando balões. Quer dizer, nuvens!',
          '2 think confused: Dentro do quarto?',
          '0 point surprised: Olha lá fora! Um passarinho de chapéu!',
          '2 >R happy #whoosh: Onde? Quero ver!',
        ],
      },
      {
        bg: 'bedroom',
        light: 'dusk',
        tr: 'fade',
        at: '4.2 11.8 -',
        b: [
          'N: Dez minutos de muito corre-corre depois...',
          '2 <8 confused: Não achei passarinho nenhum...',
          '0 cheer laughing 1=cheer/laughing !confetti #applause: SURPRESAAA!',
          '2 surprised !sparkles: Uma festa! Pra mim?!',
          '1 love !hearts: Feliz aniversário, Trovão!',
          '2 crying love: Vocês são os melhores amigos do universo!',
          '0 dance happy !notes: Agora todo mundo dançando!',
        ],
      },
    ],
  },
  {
    id: 'bloop-p02',
    title: 'Baile no Fundo do Mar',
    genre: 'festa',
    mode: '3d',
    mood: 'festa',
    tags: ['mar', 'dança', 'baile'],
    cast: ['peixe', 'nina', 'pato'],
    scenes: [
      {
        bg: 'underwater',
        at: '4.2 8 11.8',
        b: [
          '0 happy !sparkles: Bem-vindos ao Baile das Bolhas! Eu acendo a pista!',
          '1 surprised: Uau! Você brilha igual uma bola de discoteca!',
          '2 shy: Eu não sei dançar debaixo d\'água...',
          '0 laughing: Ninguém sabe! A gente só balança!',
          '1 dance laughing !notes: Balança pra lá... balança pra cá!',
          '2 dance happy !notes #boing: Quack! Assim?',
          '0 cheer happy !confetti: Isso! Agora a dança da bolha!',
          '* !sparkles #pop +0.5',
          '1 laughing: Todo mundo soltando bolhinhas ao mesmo tempo!',
          '2 love !hearts: Melhor festa de todos os mares!',
        ],
      },
    ],
  },
];
