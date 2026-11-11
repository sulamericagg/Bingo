/* Estúdio Bloop — ESCOLA */
import type { FilmSpec } from './dsl';

export const ESCOLA: FilmSpec[] = [
  {
    id: 'bloop-e01',
    title: 'A Feira de Ciências',
    genre: 'escola',
    mood: 'alegre',
    tags: ['escola', 'vulcão', 'ciências'],
    cast: ['bolha', 'tuca', 'mel'],
    scenes: [
      {
        bg: 'classroom',
        at: '8 4.2 11.8',
        b: [
          '0 happy: Bom dia, turma! Hoje é a Feira de Ciências!',
          '1 flex smug: Eu fiz um vulcão de verdade! Bem, de papel.',
          '2 happy: E eu fiz uma planta que dança com música!',
          '0 surprised: Que criativos! Tuca, pode começar.',
          '1 point happy: Um pouco de vinagre... um pouco de bicarbonato...',
          '* !shake !zoomlines #whoosh +0.4',
          '1 surprised: Opa! Saiu mais espuma do que eu pensei!',
          '2 laughing !confetti: Tá virando uma piscina de espuma!',
          '0 laughing: Ciência é assim: às vezes a gente se molha!',
          '1 shy: E agora? A planta da Mel também tomou banho.',
          '2 dance happy !notes: E olha: ela dançou mais ainda!',
          '0 clap happy #applause: Dez para os dois! E um rodo para a sala!',
        ],
      },
    ],
  },
  {
    id: 'bloop-e02',
    title: 'O Primeiro Dia',
    genre: 'escola',
    mode: '3d',
    mood: 'sono',
    tags: ['escola', 'amigos', 'vergonha'],
    cast: ['dudu', 'kiki', 'coruja'],
    scenes: [
      {
        bg: 'street',
        at: '6 - -',
        b: [
          '0 sad: Primeiro dia na escola nova. E se ninguém falar comigo?',
          '1 <11 wave happy: Oi! Você é novo? Sua mochila é muito legal!',
          '0 shy: Obrigado... eu sou o Dudu.',
          '1 happy: Eu sou a Kiki! Vem, eu te mostro a sala.',
        ],
      },
      {
        bg: 'classroom',
        tr: 'dissolve',
        at: '5 9 13',
        b: [
          '2 happy: Bem-vindos! Hoje cada um conta uma coisa que gosta.',
          '1 happy: Eu gosto de desenhar gatos. Muitos gatos!',
          '0 think shy !sweat: (Ai... minha vez...)',
          '0 happy: Eu... eu gosto de colecionar pedrinhas brilhantes.',
          '1 surprised: Sério? Eu tenho uma pedra que parece um coração!',
          '0 love !hearts: Você me mostra no recreio?',
          '2 happy !sparkles #ding: Viu só? O primeiro dia já rendeu uma amizade!',
        ],
      },
    ],
  },
];
