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
  {
    id: 'bloop-c02',
    title: 'A Pizza Voadora',
    genre: 'comedia',
    mode: '3d',
    mood: 'festa',
    tags: ['cozinha', 'pizza'],
    cast: ['chef', 'trovao', 'kiki'],
    scenes: [
      {
        bg: 'kitchen',
        at: '8 - -',
        b: [
          '0 happy: Hoje o Chef Panqueca vai ensinar a girar massa de pizza!',
          '1 <4.2 run surprised #whoosh: Eu quero girar! Eu quero girar!',
          '0 smug: Calma! É só jogar pra cima bem devagarinho...',
          '1 spin laughing !zoomlines #whoosh: Assim? BEM RÁPIDO?',
          '0 scared !shake @push: Não! Ela tá subindo! Tá subindo!',
          '2 <11.8 surprised: Miau! Tem uma pizza grudada no teto!',
          '1 facepalm shy: Ops. Acho que exagerei um pouquinho.',
          '* !poof #bonk +0.5',
          '2 laughing !stars: Caiu bem na cabeça do Chef!',
          '0 dizzy: Pelo menos agora eu tenho um chapéu de pizza.',
          '1 laughing 2=laughing: Chapéu sabor calabresa!',
          '0 laughing !confetti #rimshot: Próxima aula: como NÃO girar uma pizza!',
        ],
      },
    ],
  },
  {
    id: 'bloop-c03',
    title: 'O Soluço Musical',
    genre: 'comedia',
    mood: 'alegre',
    tags: ['soluço', 'música'],
    cast: ['lumi', 'dudu'],
    scenes: [
      {
        bg: 'bedroom',
        at: '5 11',
        b: [
          '0 surprised !notes #ding: Hic! Ai não... hic! Soluço de novo!',
          '1 laughing: Seu soluço faz som de sininho!',
          '0 sad: Hic! Já tentei de tudo. Água, pulinho... hic!',
          '1 think thinking: Já sei! Um susto resolve! Fecha o olho...',
          '1 >7.5 sneak smug: (Vou fazer bem de mansinho...)',
          '1 jump surprised !shake @push #boing: BUUU!',
          '0 laughing: Hahaha! Esse foi o susto mais fofo do mundo!',
          '1 shrug shy: E aí? Passou?',
          '0 think thinking +0.8: ...',
          '0 surprised !notes #ding: Hic!',
          '1 laughing 0=laughing: Vamos montar uma banda: você faz o sininho!',
          '0 dance happy !notes: Hic-hic-hic! Tá dando ritmo!',
        ],
      },
    ],
  },
];
