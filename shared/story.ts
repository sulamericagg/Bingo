/* ============================================================
 *  HISTÓRIA (Bloop Cinema) — roteiro compacto "StorySpec".
 *
 *  Usado pelos três criadores de filme: o fluxo "Criar história"
 *  das crianças, a História Mágica (IA no servidor, /api/ai/story)
 *  e o gerador offline. O app expande o roteiro num projeto completo
 *  do Cinema (src/cinema/storybuild.ts → formato docs/CINEMA-FORMATO.md).
 *
 *  Este arquivo roda no app E no Worker: sem DOM, sem i18n.
 *  validateStory() é a fonte da verdade dos ids permitidos — tudo que
 *  vier da IA passa por aqui (ids desconhecidos caem para um padrão).
 * ============================================================ */

export const STORY_BGS = ['bedroom', 'classroom', 'park', 'beach', 'kitchen', 'space', 'castle', 'street', 'stage', 'forest', 'underwater', 'snow', 'desert', 'candy', 'haunted', 'rooftop'] as const;
export const STORY_EXPRS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy', 'love', 'laughing', 'crying', 'thinking', 'scared', 'smug', 'wink', 'dizzy', 'shy', 'confused'] as const;
export const STORY_POSES = ['stand', 'walk', 'run', 'wave', 'point', 'sit', 'jump', 'dance', 'lie', 'hug', 'facepalm', 'think', 'cheer', 'shrug', 'bow', 'clap', 'scared', 'spin', 'flex', 'sneak'] as const;
export const STORY_FX = ['shake', 'sparkles', 'rain', 'hearts', 'sweat', 'zoomlines', 'confetti', 'snow', 'flash', 'poof', 'anger', 'notes', 'stars'] as const;
export const STORY_SFX = ['boing', 'pop', 'whoosh', 'ding', 'bonk', 'rimshot', 'applause', 'magic', 'slip', 'crickets', 'knock', 'phone', 'drumroll', 'sad', 'thunder', 'steps'] as const;
/** personagens prontos do Cinema (src/cinema/data.ts PRESETS) + 'you' = o Bloop do jogador */
export const STORY_CAST = ['you', 'pipoca', 'bolota', 'trovao', 'lumi', 'zeca', 'gema', 'bolha', 'faisca', 'nina', 'robozinho'] as const;
export const STORY_CAMS = ['wide', 'close', 'two'] as const;
export const STORY_LIGHTS = ['day', 'dusk', 'night'] as const;
/** músicas grátis do Bloop Banda */
export const STORY_SONGS = Array.from({ length: 20 }, (_, i) => `free-${String(i + 1).padStart(2, '0')}`);

export type StoryBg = (typeof STORY_BGS)[number];
export type StoryExpr = (typeof STORY_EXPRS)[number];
export type StoryPose = (typeof STORY_POSES)[number];
export type StoryFx = (typeof STORY_FX)[number];

export interface StoryBeat {
  /** índice no elenco; -1 = narração */
  who: number;
  text: string;
  expr?: StoryExpr;
  pose?: StoryPose;
  /** quem fala anda até o meio ('enter'), sai ('exit') ou fica */
  move?: 'enter' | 'exit';
  fx?: StoryFx;
  sfx?: (typeof STORY_SFX)[number];
  cam?: (typeof STORY_CAMS)[number];
  /** clipe de voz gravado (só no app; a IA nunca manda) */
  audio?: string;
}
export interface StoryScene {
  bg: StoryBg;
  light?: (typeof STORY_LIGHTS)[number];
  beats: StoryBeat[];
}
export interface StorySpec {
  title: string;
  /** ids de STORY_CAST (com nome opcional) */
  cast: { ref: (typeof STORY_CAST)[number]; name?: string }[];
  scenes: StoryScene[];
  song?: string;
}

export const STORY_LIMITS = { cast: 4, scenes: 3, beats: 6, text: 90, title: 40 };

const pick = <T extends string>(v: unknown, list: readonly T[], d?: T): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
const txt = (v: unknown, n: number): string =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

/**
 * Valida/limita um roteiro vindo da IA, de um arquivo ou do app.
 * `clean` passa cada texto pelo filtro (moderação) — devolve null se o roteiro tiver
 * algo bloqueado (contatos/links), e o texto mascarado nos outros casos.
 */
export function validateStory(raw: unknown, clean: (s: string, n: number) => string | null = (s) => s): StorySpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const castRaw = Array.isArray(o.cast) ? o.cast.slice(0, STORY_LIMITS.cast) : [];
  const cast: StorySpec['cast'] = [];
  for (const c of castRaw) {
    const r = (c && typeof c === 'object' ? c : { ref: c }) as Record<string, unknown>;
    const ref = pick(r.ref, STORY_CAST);
    if (!ref || cast.some((x) => x.ref === ref)) continue;
    const name = r.name ? clean(txt(r.name, 14), 14) : undefined;
    if (name === null) return null;
    cast.push({ ref, name: name || undefined });
  }
  if (!cast.length) cast.push({ ref: 'you' }, { ref: 'pipoca' });
  const scenes: StoryScene[] = [];
  for (const s of (Array.isArray(o.scenes) ? o.scenes : []).slice(0, STORY_LIMITS.scenes)) {
    const so = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const beats: StoryBeat[] = [];
    for (const b of (Array.isArray(so.beats) ? so.beats : []).slice(0, STORY_LIMITS.beats)) {
      const bo = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
      const who = typeof bo.who === 'number' && Number.isInteger(bo.who) && bo.who >= -1 && bo.who < cast.length ? bo.who : -1;
      const text = clean(txt(bo.text, STORY_LIMITS.text), STORY_LIMITS.text);
      if (text === null) return null;
      const audio = typeof bo.audio === 'string' && /^clip[a-z0-9]{4,30}$/.test(bo.audio) ? bo.audio : undefined;
      if (!text && !audio) continue;
      beats.push({
        who,
        text,
        expr: pick(bo.expr, STORY_EXPRS),
        pose: pick(bo.pose, STORY_POSES),
        move: bo.move === 'enter' || bo.move === 'exit' ? bo.move : undefined,
        fx: pick(bo.fx, STORY_FX),
        sfx: pick(bo.sfx, STORY_SFX),
        cam: pick(bo.cam, STORY_CAMS),
        audio,
      });
    }
    if (beats.length) scenes.push({ bg: pick(so.bg, STORY_BGS, 'park')!, light: pick(so.light, STORY_LIGHTS), beats });
  }
  if (!scenes.length) return null;
  const title = clean(txt(o.title, STORY_LIMITS.title), STORY_LIMITS.title);
  if (title === null) return null;
  return { title: title || 'Bloop', cast, scenes, song: pick(o.song, STORY_SONGS) };
}

/** Esquema JSON descrito para a IA (texto do prompt do servidor). */
export function storySchemaText(): string {
  return `{"title": string (<= ${STORY_LIMITS.title} chars),
 "cast": [{"ref": one of ${JSON.stringify(STORY_CAST)}, "name"?: string (<= 14 chars)}] (1..${STORY_LIMITS.cast}),
 "scenes": [{"bg": one of ${JSON.stringify(STORY_BGS)}, "light"?: one of ${JSON.stringify(STORY_LIGHTS)},
   "beats": [{"who": cast index or -1 for narration, "text": string (<= ${STORY_LIMITS.text} chars),
     "expr"?: one of ${JSON.stringify(STORY_EXPRS)}, "pose"?: one of ${JSON.stringify(STORY_POSES)},
     "move"?: "enter"|"exit", "fx"?: one of ${JSON.stringify(STORY_FX)}, "sfx"?: one of ${JSON.stringify(STORY_SFX)},
     "cam"?: one of ${JSON.stringify(STORY_CAMS)}}] (1..${STORY_LIMITS.beats})}] (1..${STORY_LIMITS.scenes}),
 "song"?: one of "free-01".."free-20"}`;
}
