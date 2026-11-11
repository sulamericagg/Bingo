/* Estúdio Bloop — AVENTURA */
import type { FilmSpec } from './dsl';

export const AVENTURA: FilmSpec[] = [
  {
    id: 'bloop-a01',
    title: 'O Mapa da Floresta',
    genre: 'aventura',
    mood: 'aventura',
    tags: ['mapa', 'tesouro', 'floresta'],
    cast: ['trovao', 'bia', 'tucano'],
    scenes: [
      {
        bg: 'forest',
        at: '4.5 9 -',
        b: [
          'N: No meio da floresta, um mapa velhinho...',
          '1 point surprised: Olha! O X fica perto da árvore torta!',
          '0 flex smug: Deixa comigo. Eu sou ótimo com mapas!',
          '0 >12 happy #steps: Por aqui! Tenho certeza!',
          '1 think thinking: Trovão... você está segurando o mapa de cabeça pra baixo.',
          '0 shy !sweat: Ah. Eu sabia. Era um teste!',
          '2 <14.5 happy #pop: Piu! Eu vi a árvore torta lá de cima!',
          '1 cheer happy: Um tucano guia! Vamos!',
        ],
      },
      {
        bg: 'forest',
        light: 'dusk',
        tr: 'iris',
        at: '4 8 12',
        b: [
          '2 point happy: Aqui! Debaixo das raízes!',
          '0 surprised !sparkles #magic: Um baú! Um baú de verdade!',
          '1 surprised: O que tem dentro? Ouro? Diamante?',
          '0 laughing: Sementes! E um bilhete: plante e espere crescer.',
          '1 love !hearts: O tesouro é uma floresta nova!',
          '2 dance happy !notes: Piu piu! Mais árvores pra mim!',
        ],
      },
    ],
  },
  {
    id: 'bloop-a02',
    title: 'A Ponte de Gelo',
    genre: 'aventura',
    mode: '3d',
    mood: 'aventura',
    tags: ['neve', 'montanha', 'coragem'],
    cast: ['estrela', 'pinguim', 'urso'],
    scenes: [
      {
        bg: 'snow',
        at: '4.2 8 11.8',
        b: [
          '0 point happy: Do outro lado da ponte de gelo fica a Caverna Brilhante!',
          '1 scared: Essa ponte balança! Eu sou só um pinguim pequeno!',
          '2 happy: Eu vou na frente. Sou pesado, mas sou devagar.',
          '2 >13.5 sneak thinking #steps: Um passinho... outro passinho...',
          '* !shake #thunder +0.4',
          '1 crying !sweat: Rachou! Rachou!',
          '0 think thinking: Calma! A gente desliza de barriga. Fica leve!',
          '1 surprised: De barriga? Isso eu sei fazer!',
          '1 >10 laughing !zoomlines #whoosh: Uiiiii! Que gostoso!',
          '0 >6.5 laughing #whoosh: Esperem por mim!',
          '2 cheer happy !sparkles #ding: Chegamos! Olhem a caverna!',
          '1 love !stars: Tudo brilhando! Valeu a coragem!',
        ],
      },
    ],
  },
  {
    id: 'bloop-a03',
    title: 'Piratas do Lago',
    genre: 'aventura',
    mood: 'aventura',
    tags: ['piratas', 'praia', 'barco'],
    cast: ['zeca', 'mel', 'sapo'],
    scenes: [
      {
        bg: 'beach',
        at: '4.2 8 -',
        b: [
          '0 flex smug: Argh! Eu sou o Capitão Zeca, terror dos sete laguinhos!',
          '1 laughing: Seu navio é uma banheira de plástico.',
          '0 shrug: Todo grande pirata começa pequeno!',
          '2 <12 surprised #pop: Croac! Quem está no meu lago?',
          '0 scared !sweat: Um monstro marinho! Todos a bordo!',
          '1 laughing: É um sapinho, Zeca.',
          '2 happy: Se vocês dividirem o lanche, eu mostro a ilha secreta.',
          '0 surprised: Ilha secreta? Fechado!',
        ],
      },
      {
        bg: 'beach',
        light: 'dusk',
        tr: 'slide',
        at: '4.2 8 11.8',
        b: [
          'N: A ilha secreta era uma pedra com uma bandeirinha...',
          '2 point happy: Daqui dá pra ver o pôr do sol mais bonito.',
          '1 love !hearts: Que lindo...',
          '0 bow happy: Capitão Zeca declara: este é o melhor tesouro!',
          '2 laughing ^ #boing: E o lanche estava ótimo também!',
        ],
      },
    ],
  },
];
