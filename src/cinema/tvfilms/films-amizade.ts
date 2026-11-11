/* Estúdio Bloop — AMIZADE */
import type { FilmSpec } from './dsl';

export const AMIZADE: FilmSpec[] = [
  {
    id: 'bloop-h01',
    title: 'O Guarda-Chuva Dividido',
    genre: 'amizade',
    mood: 'sono',
    tags: ['chuva', 'dividir', 'amizade'],
    cast: ['zeca', 'mel'],
    scenes: [
      {
        bg: 'street',
        light: 'dusk',
        at: '5 11',
        b: [
          '* !rain #thunder +0.5',
          '1 sad !rain: Ai, começou a chover e eu esqueci o guarda-chuva...',
          '0 think thinking: O meu é pequeno... mas cabe um pedacinho de cada um.',
          '0 >9 happy #steps: Vem! Metade pra você, metade pra mim.',
          '1 laughing: Seu ombro tá todo molhado, Zeca!',
          '0 shrug happy: E o seu também! Estamos quites.',
          '1 happy: Sabia que chuva fica mais legal com amigo do lado?',
          '0 laughing ^ #boing: E com poça pra pular!',
          '1 laughing ^ #boing: Splash! Splash!',
          '0 love !hearts: Melhor dia de chuva da vida.',
        ],
      },
    ],
  },
  {
    id: 'bloop-h02',
    title: 'O Dragão Tímido',
    genre: 'amizade',
    mode: '3d',
    mood: 'aventura',
    tags: ['dragão', 'castelo', 'timidez'],
    cast: ['rei', 'dinho', 'bia'],
    scenes: [
      {
        bg: 'castle',
        at: '4.2 - 11.8',
        b: [
          '0 scared: Socorro! Um dragão no jardim do castelo!',
          '2 think thinking: Ele não está atacando. Está... se escondendo atrás da torre?',
          '1 <8 shy: Oi... desculpa. Eu só queria um amigo.',
          '0 surprised: Um dragão... com vergonha?',
          '1 sad: Todo mundo corre quando me vê. Eu nem solto fogo! Só fumacinha.',
          '1 shy !poof #pop: Viu? Puf.',
          '2 laughing: Que fumacinha mais fofa!',
          '0 happy: Sabe o que precisa? Esquentar o chocolate da festa!',
          '1 surprised !sparkles: Eu posso ajudar? De verdade?',
          '2 cheer happy !confetti #applause: Bem-vindo ao reino, Dinho!',
          '1 love !hearts: Meu primeiro amigo. Ou melhor: meus primeiros amigos!',
        ],
      },
    ],
  },
];
