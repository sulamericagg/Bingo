/* ============================================================
 *  BLOOP CINEMA — gerador OFFLINE de histórias (sem rede, sem IA).
 *  Lê palavras-chave da ideia (pt/en/es) e monta um roteiro
 *  determinístico: lugar, elenco, tema (festa, susto, sumiço, magia,
 *  corrida, aventura) e 2 cenas com começo, problema e final feliz.
 *  É o plano B da História Mágica: o recurso SEMPRE funciona.
 * ============================================================ */
import { t } from '../i18n';
import { BACKGROUNDS } from './data';
import type { StoryBeat, StorySpec } from '../../shared/story';

type Theme = 'party' | 'scary' | 'lost' | 'magic' | 'race' | 'adventure';

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const PLACE_KW: [RegExp, StorySpec['scenes'][number]['bg']][] = [
  [/praia|beach|playa|mar\b|areia/, 'beach'],
  [/fundo do mar|oceano|ocean|underwater|peixe|fish|sereia|mermaid/, 'underwater'],
  [/espaco|space|espacio|lua|moon|planeta|planet|foguete|rocket|estrela|alien|astronaut/, 'space'],
  [/castelo|castle|castillo|princes|princess|rei\b|rainha|king|queen|dragao|dragon/, 'castle'],
  [/escola|school|aula|class|professor|teacher/, 'classroom'],
  [/cozinha|kitchen|cocina|bolo|cake|comida|food|pizza|biscoito|cookie/, 'kitchen'],
  [/floresta|forest|bosque|mata|selva|jungle|arvore|tree/, 'forest'],
  [/neve|snow|nieve|gelo|ice|inverno|winter|natal|christmas/, 'snow'],
  [/deserto|desert|cacto|cactus/, 'desert'],
  [/doce|candy|dulce|chocolate|sorvete|ice cream/, 'candy'],
  [/fantasma|ghost|assombr|haunted|monstro|monster|bruxa|witch|halloween/, 'haunted'],
  [/palco|stage|show|concerto|concert|musica|music|cantar|sing|banda|band/, 'stage'],
  [/rua|street|calle|cidade|city/, 'street'],
  [/telhado|rooftop|predio|noite na cidade/, 'rooftop'],
  [/quarto|bedroom|cama|bed|casa|home|house/, 'bedroom'],
  [/parque|park|jardim|garden|piquenique|picnic/, 'park'],
];
const CAST_KW: [RegExp, string][] = [
  [/robo|robot/, 'robozinho'],
  [/gat|cat\b|kitty|miau/, 'bolota'],
  [/vov|grandma|abuela|avo\b/, 'gema'],
  [/professor|teacher|cientista|scientist|doutor/, 'bolha'],
  [/fada|fairy|magica|magic|unicorn/, 'lumi'],
  [/heroi|hero|super|estrela|star/, 'faisca'],
  [/amor|love|coracao|heart|princes/, 'nina'],
  [/trovao|thunder|rock|guitarra|guitar/, 'trovao'],
  [/preguic|sono|sleep|lazy|dorminhoc/, 'zeca'],
  [/pipoca|popcorn|cachorro|dog/, 'pipoca'],
];
const THEME_KW: [RegExp, Theme][] = [
  [/festa|party|fiesta|aniversario|birthday|cumpleanos|surpresa|surprise/, 'party'],
  [/medo|scary|susto|fantasma|ghost|monstro|monster|assombr|terror|escuro|dark/, 'scary'],
  [/sumiu|perdi|perdeu|lost|missing|procura|search|tesouro|treasure|esconde/, 'lost'],
  [/magia|magic|fada|fairy|feitico|spell|varinha|wand|bruxa|witch|unicorn/, 'magic'],
  [/corrida|race|carrera|correr|run|futebol|soccer|football|jogo|game|campeonato/, 'race'],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Monta um roteiro a partir da ideia (texto livre). Determinístico. */
export function offlineStory(idea: string): StorySpec {
  const n = norm(idea);
  const h = hash(n);
  const bg = PLACE_KW.find(([re]) => re.test(n))?.[1] ?? (['park', 'bedroom', 'forest', 'beach', 'space'] as const)[h % 5];
  const theme: Theme = THEME_KW.find(([re]) => re.test(n))?.[1] ?? (bg === 'haunted' ? 'scary' : bg === 'space' || bg === 'castle' ? 'magic' : 'adventure');
  const refs = ['you'];
  for (const [re, id] of CAST_KW) if (re.test(n) && !refs.includes(id) && refs.length < 3) refs.push(id);
  const pool = ['pipoca', 'lumi', 'trovao', 'nina', 'bolota', 'faisca', 'zeca', 'robozinho'];
  for (let i = 0; refs.length < 3 && i < pool.length; i++) {
    const c = pool[(h + i * 3) % pool.length];
    if (!refs.includes(c)) refs.push(c);
  }
  const place = BACKGROUNDS.find((b) => b.id === bg)?.name ?? bg;
  const A = 0; // herói (você)
  const B = 1;
  const C = 2;
  const s1: StoryBeat[] = [
    { who: -1, text: t('cin.gen.open2', '{place}: era uma vez...', { place: `${BACKGROUNDS.find((b) => b.id === bg)?.glyph ?? ''} ${place}`.trim() }), cam: 'wide' },
    { who: A, text: t('cin.gen.hi', 'Oi, gente! Hoje vai ser um dia incrível!'), expr: 'happy', pose: 'wave', move: 'enter' },
  ];
  const s2: StoryBeat[] = [];
  let light: 'day' | 'dusk' | 'night' = 'day';
  switch (theme) {
    case 'party':
      s1.push({ who: B, text: t('cin.gen.party1', 'Psiu! Vamos fazer uma festa surpresa?'), expr: 'smug', pose: 'sneak' });
      s1.push({ who: C, text: t('cin.gen.party2', 'Eu trago os balões e o bolo!'), expr: 'laughing', pose: 'jump' });
      s2.push({ who: B, text: t('cin.gen.party3', 'SURPRESAAA!'), expr: 'laughing', pose: 'cheer', fx: 'confetti', sfx: 'applause', cam: 'wide' });
      s2.push({ who: A, text: t('cin.gen.party4', 'Uau! Para mim?! Vocês são os melhores!'), expr: 'love', pose: 'hug' });
      s2.push({ who: C, text: t('cin.gen.party5', 'Agora todo mundo dançando!'), expr: 'happy', pose: 'dance', fx: 'notes' });
      break;
    case 'scary':
      light = 'night';
      s1.push({ who: B, text: t('cin.gen.scary1', 'Vocês ouviram esse barulho?'), expr: 'scared', pose: 'scared', sfx: 'knock' });
      s1.push({ who: A, text: t('cin.gen.scary2', 'Calma... vamos ver o que é. Juntos!'), expr: 'thinking', pose: 'sneak' });
      s2.push({ who: C, text: t('cin.gen.scary3', 'BUUU!'), expr: 'smug', pose: 'jump', fx: 'shake', sfx: 'thunder', move: 'enter' });
      s2.push({ who: B, text: t('cin.gen.scary4', 'AAAAH! ...Ei, era só você de lençol!'), expr: 'surprised', pose: 'facepalm', fx: 'sweat' });
      s2.push({ who: A, text: t('cin.gen.scary5', 'Que susto! Mas foi muito engraçado!'), expr: 'laughing', pose: 'clap' });
      break;
    case 'lost':
      s1.push({ who: B, text: t('cin.gen.lost1', 'Ih! Meu tesouro sumiu!'), expr: 'crying', pose: 'facepalm', sfx: 'sad' });
      s1.push({ who: A, text: t('cin.gen.lost2', 'Não chora! A gente vai encontrar!'), expr: 'thinking', pose: 'point' });
      s2.push({ who: C, text: t('cin.gen.lost3', 'Olha só o que eu achei atrás da árvore!'), expr: 'surprised', pose: 'jump', fx: 'sparkles', sfx: 'ding', move: 'enter' });
      s2.push({ who: B, text: t('cin.gen.lost4', 'Meu tesouro! Obrigado, amigos!'), expr: 'love', pose: 'hug', fx: 'hearts' });
      s2.push({ who: A, text: t('cin.gen.lost5', 'Amigos de verdade sempre ajudam!'), expr: 'happy', pose: 'cheer' });
      break;
    case 'magic':
      light = bg === 'space' ? 'night' : 'dusk';
      s1.push({ who: B, text: t('cin.gen.magic1', 'Achei uma varinha mágica brilhante!'), expr: 'surprised', pose: 'point', fx: 'sparkles', sfx: 'magic' });
      s1.push({ who: A, text: t('cin.gen.magic2', 'Faz um feitiço! Mas com cuidado...'), expr: 'shy', pose: 'stand' });
      s2.push({ who: B, text: t('cin.gen.magic3', 'Abracadabra... POF!'), expr: 'dizzy', pose: 'spin', fx: 'poof', sfx: 'magic', cam: 'wide' });
      s2.push({ who: C, text: t('cin.gen.magic4', 'Ei! Agora tudo está brilhando!'), expr: 'laughing', pose: 'jump', fx: 'stars', move: 'enter' });
      s2.push({ who: A, text: t('cin.gen.magic5', 'A melhor mágica é a nossa amizade!'), expr: 'love', pose: 'hug', fx: 'hearts' });
      break;
    case 'race':
      s1.push({ who: B, text: t('cin.gen.race1', 'Aposto que eu chego primeiro!'), expr: 'smug', pose: 'flex' });
      s1.push({ who: A, text: t('cin.gen.race2', 'Valendo! Um, dois, três... JÁ!'), expr: 'angry', pose: 'run', sfx: 'whoosh', fx: 'zoomlines' });
      s2.push({ who: C, text: t('cin.gen.race3', 'Cuidado com a casca de banana!'), expr: 'surprised', pose: 'point', sfx: 'slip', move: 'enter' });
      s2.push({ who: B, text: t('cin.gen.race4', 'Ops! Escorreguei...'), expr: 'dizzy', pose: 'lie', fx: 'stars', sfx: 'bonk' });
      s2.push({ who: A, text: t('cin.gen.race5', 'Vem, eu te ajudo! A gente cruza a linha juntos!'), expr: 'happy', pose: 'hug', sfx: 'applause' });
      break;
    default:
      s1.push({ who: B, text: t('cin.gen.adv1', 'Vamos explorar? Dizem que tem um segredo por aqui!'), expr: 'surprised', pose: 'point' });
      s1.push({ who: C, text: t('cin.gen.adv2', 'Eu levo o mapa!'), expr: 'happy', pose: 'jump', move: 'enter' });
      s2.push({ who: A, text: t('cin.gen.adv3', 'Olhem! O mapa está brilhando!'), expr: 'surprised', pose: 'point', fx: 'sparkles', sfx: 'magic', cam: 'wide' });
      s2.push({ who: B, text: t('cin.gen.adv4', 'O segredo era... um lugar lindo para a gente brincar!'), expr: 'laughing', pose: 'cheer', fx: 'confetti' });
      s2.push({ who: C, text: t('cin.gen.adv5', 'Melhor aventura de todas!'), expr: 'love', pose: 'dance', fx: 'notes' });
  }
  s2.push({ who: -1, text: t('cin.gen.end', 'Fim! ✨'), cam: 'wide' });
  const raw = idea.trim().replace(/\s+/g, ' ');
  const title = raw ? raw.charAt(0).toUpperCase() + raw.slice(1, 38) : t('cin.gen.title', 'Minha história');
  return {
    title,
    cast: refs.map((ref) => ({ ref: ref as StorySpec['cast'][number]['ref'] })),
    scenes: [
      { bg, light: theme === 'scary' ? 'dusk' : 'day', beats: s1 },
      { bg, light, beats: s2 },
    ],
    song: `free-${String((h % 20) + 1).padStart(2, '0')}`,
  };
}
