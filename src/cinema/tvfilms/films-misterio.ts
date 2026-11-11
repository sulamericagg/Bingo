/* Estúdio Bloop — MISTÉRIO (leve, sem susto pesado) */
import type { FilmSpec } from './dsl';

export const MISTERIO: FilmSpec[] = [
  {
    id: 'bloop-m01',
    title: 'O Caso do Bolo Sumido',
    genre: 'misterio',
    mood: 'suspense',
    tags: ['detetive', 'bolo'],
    cast: ['lupa', 'gema', 'bolota', 'cachorro'],
    scenes: [
      {
        bg: 'kitchen',
        at: '3.3 6.4 9.6 -',
        b: [
          '1 surprised: Meu bolo de cenoura sumiu da janela!',
          '0 think thinking: Hum. Um caso para o Detetive Lupa!',
          '0 point smug: Pegadas! Pequenas e redondinhas.',
          '2 shy !sweat: Não fui eu! Eu só... cheirei de longe.',
          '0 think thinking: E esse farelo laranja no seu bigode?',
          '2 facepalm shy: É de... cenoura crua! Juro!',
          '3 <12.7 happy #pop: Au au!',
          '1 surprised: Craquinho! Com a boca cheia de cobertura!',
          '0 laughing !sparkles #ding: Caso resolvido! As pegadas eram de patinhas!',
          '3 shy: Au... desculpa. Tava cheiroso demais.',
          '1 laughing: Tudo bem. Amanhã eu faço dois: um é seu!',
        ],
      },
    ],
  },
  {
    id: 'bloop-m02',
    title: 'O Barulho do Sótão',
    genre: 'misterio',
    mode: '3d',
    mood: 'suspense',
    tags: ['casa', 'noite', 'fantasminha'],
    cast: ['nina', 'robozinho', 'bu'],
    scenes: [
      {
        bg: 'haunted',
        light: 'night',
        at: '5 11 -',
        b: [
          '* #knock +0.8',
          '0 scared: Você ouviu? Toc, toc, toc... lá em cima!',
          '1 think thinking: Meus sensores dizem: algo pequeno e redondo.',
          '0 sneak scared 1=sneak: Vamos bem devagar...',
          '* #knock +0.4',
          '2 <8 surprised !sparkles #magic: Oi! Vocês vieram brincar?',
          '0 scared 1=scared !shake: AAAH! Um fantasma!',
          '2 sad: Eu sou o Bu. Eu só estava jogando bolinha sozinho...',
          '1 happy: O barulho era a bolinha! Mistério resolvido!',
          '0 shy: Desculpa o grito, Bu. Quer brincar com a gente?',
          '2 love !hearts: Quero! Faz cem anos que ninguém me chama!',
          '1 laughing !confetti #applause: Bem-vindo à turma, Bu!',
        ],
      },
    ],
  },
];
