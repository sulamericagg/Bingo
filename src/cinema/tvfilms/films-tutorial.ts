/* Estúdio Bloop — COMO FAZER (filmes que ensinam a usar o Bloop Cinema) */
import type { FilmSpec } from './dsl';

export const TUTORIAL: FilmSpec[] = [
  {
    id: 'bloop-t03',
    title: 'Como Usar a Câmera 3D',
    genre: 'tutorial',
    mode: '3d',
    mood: 'aventura',
    tags: ['câmera', '3D', 'como fazer'],
    desc: 'Geral, close, de baixo, de cima e girar: cada câmera conta a história de um jeito.',
    cast: ['bolha', 'faisca', 'robozinho'],
    scenes: [
      {
        bg: 'stage',
        at: '8 - -',
        b: [
          '0 wave happy: Olá, cineastas! Hoje a aula é sobre a CÂMERA 3D!',
          'N: No filme 3D, toque em 🎥 Câmera e escolha um tipo de plano.',
          '1 <4 cheer happy #whoosh: Cheguei! Pode me filmar!',
          '0 point happy @wide: Este é o plano GERAL: mostra o lugar todo.',
          '1 flex smug @close: E este é o CLOSE! Olha meu sorrisão!',
          '0 happy @low: Câmera DE BAIXO deixa o herói gigante!',
          '1 flex happy !sparkles @low: Eu me sinto um super-herói!',
          '2 <12 surprised @high: E de CIMA tudo parece pequenininho!',
          '0 happy @orbit: GIRAR EM VOLTA é ótimo para começo e final!',
          '1 dance laughing @orbit !notes: Uhuuu! Tô girando sem sair do lugar!',
          '2 think thinking @ots: E por cima do ombro? Mostra uma conversa!',
          '0 bow happy @wide #applause: Misture as câmeras e seu filme fica de cinema!',
        ],
      },
    ],
  },
];
