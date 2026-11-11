/* ============================================================
 *  BLOOP CINEMA — "Criar música": padrão de sequenciador (dados).
 *
 *  Uma trilha criada pela criança é só um PADRÃO compacto (poucos
 *  bytes no projeto): humor, andamento, instrumentos e uma grade de
 *  passos (melodia pentatônica — sempre soa bem —, baixo e bateria).
 *  O som é sintetizado na hora (beat.ts → Synth do Bloop Banda), no
 *  editor, na exportação de vídeo e na TV Bloop.
 *
 *  Arquivo PURO (sem DOM/WebAudio): também é usado pelo gerador dos
 *  filmes do Estúdio Bloop (tvfilms/) em Node.
 * ============================================================ */

export type Mood = 'alegre' | 'aventura' | 'suspense' | 'sono' | 'festa';
export type MelInst = 'piano' | 'chip' | 'metais' | 'sanfona' | 'violao' | 'cordas' | 'orgao';
export type BassInst = 'baixo' | 'synth' | 'contra' | 'chip';
export type KitInst = 'bateria' | 'eletro' | 'chip' | 'lofi' | 'orq';

export const MOODS: Mood[] = ['alegre', 'aventura', 'suspense', 'sono', 'festa'];
export const MEL_INSTS: MelInst[] = ['piano', 'chip', 'metais', 'sanfona', 'violao', 'cordas', 'orgao'];
export const BASS_INSTS: BassInst[] = ['baixo', 'synth', 'contra', 'chip'];
export const KIT_INSTS: KitInst[] = ['bateria', 'eletro', 'chip', 'lofi', 'orq'];

/** linhas da grade */
export const MEL_ROWS = 8;
export const BASS_ROWS = 4;
/** bateria: bumbo, caixa/palmas, chimbal */
export const DRUM_ROWS = 3;
export const BPM_MIN = 60;
export const BPM_MAX = 170;

/**
 * Padrão. Cada passo = 1 colcheia (meio tempo). 16 passos = 2 compassos.
 *  m: 1 caractere por passo — '.' pausa, '0'..'7' = linha da melodia (0 = mais grave)
 *  b: 1 caractere por passo — '.' pausa, '0'..'3' = baixo (tônica, quinta, oitava, terça do acorde)
 *  d: 3 strings de '0'/'1' (bumbo, caixa, chimbal)
 *  A cada volta da grade o acorde muda (progressão do humor), então o loop não cansa.
 */
export interface BeatPat {
  v: 1;
  mood: Mood;
  bpm: number;
  steps: 8 | 16;
  /** tônica 0..11 (0 = Dó) */
  key: number;
  mel: MelInst;
  bass: BassInst;
  kit: KitInst;
  m: string;
  b: string;
  d: [string, string, string];
}

export interface MoodDef {
  emoji: string;
  bpm: number;
  minor: boolean;
  mel: MelInst;
  bass: BassInst;
  kit: KitInst;
  /** música grátis parecida (aparelhos antigos, que não conhecem "Criar música") */
  fallback: string;
  /** progressão (semitons a partir da tônica), 1 acorde por volta */
  prog: number[];
}
export const MOOD_DEF: Record<Mood, MoodDef> = {
  alegre: { emoji: '😄', bpm: 112, minor: false, mel: 'piano', bass: 'baixo', kit: 'bateria', fallback: 'free-01', prog: [0, 7, 9, 5] },
  aventura: { emoji: '🗺️', bpm: 128, minor: false, mel: 'metais', bass: 'baixo', kit: 'orq', fallback: 'free-16', prog: [0, 5, 7, 5] },
  suspense: { emoji: '🕵️', bpm: 84, minor: true, mel: 'cordas', bass: 'synth', kit: 'lofi', fallback: 'free-13', prog: [0, 8, 3, 10] },
  sono: { emoji: '🌙', bpm: 68, minor: false, mel: 'violao', bass: 'contra', kit: 'lofi', fallback: 'free-05', prog: [0, 5, 0, 7] },
  festa: { emoji: '🎉', bpm: 126, minor: false, mel: 'chip', bass: 'synth', kit: 'eletro', fallback: 'free-04', prog: [0, 9, 5, 7] },
};

const PENT_MAJ = [0, 2, 4, 7, 9, 12, 14, 16];
const PENT_MIN = [0, 3, 5, 7, 10, 12, 15, 17];
/** semitons de cada linha da melodia (0 = mais grave) */
export const melSemis = (p: Pick<BeatPat, 'mood'>): number[] => (MOOD_DEF[p.mood].minor ? PENT_MIN : PENT_MAJ);
/** baixo: tônica, quinta, oitava, terça (do acorde da volta) */
export const BASS_SEMIS = [0, 7, 12, 4];
export const progOf = (p: Pick<BeatPat, 'mood'>): number[] => MOOD_DEF[p.mood].prog;
/** MIDI da tônica da melodia (≈ Dó4..Si4, sem ficar aguda demais) */
export const melBase = (key: number): number => 60 + (key > 6 ? key - 12 : key);
export const bassBase = (key: number): number => 36 + (key > 6 ? key - 12 : key);

/* ---------------------------- aleatório determinístico ---------------------------- */
export function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const DRUMS: Record<Mood, [string, string, string][]> = {
  alegre: [
    ['1000000010100000', '0000100000001000', '1010101010101010'],
    ['1000001010000000', '0000100000001000', '1010101010101010'],
    ['1000000010000010', '0000100000001001', '1011101010111010'],
  ],
  aventura: [
    ['1000001010000010', '0000100000001000', '1010101010101010'],
    ['1010000010100000', '0000100100001000', '1000100010001000'],
    ['1000000110000000', '0000100000001011', '1010101010101010'],
  ],
  suspense: [
    ['1000000000000000', '0000000000001000', '0010001000100010'],
    ['1000000010000000', '0000000000000000', '0000101000001010'],
    ['1000000000100000', '0000100000000000', '0010000000100000'],
  ],
  sono: [
    ['1000000000000000', '0000000000000000', '0000100000001000'],
    ['1000000010000000', '0000000000000000', '0000000000000000'],
    ['0000000000000000', '0000000000000000', '1000100010001000'],
  ],
  festa: [
    ['1000100010001000', '0000100000001000', '0010001000100010'],
    ['1000100010001000', '0000100000001010', '1010101010101010'],
    ['1000100010101000', '0000100000001000', '0110011001100110'],
  ],
};

/** Gera um padrão gostoso de ouvir para o humor (mesma semente = mesmo padrão). */
export function randomBeat(mood: Mood, seed = Math.floor(Math.random() * 1e9), steps: 8 | 16 = 16): BeatPat {
  const r = rngOf(seed);
  const def = MOOD_DEF[mood];
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const N = steps;
  // melodia: motivo de 4 passos + resposta, terminando perto da tônica
  const density = mood === 'sono' ? 0.4 : mood === 'suspense' ? 0.35 : mood === 'festa' ? 0.7 : 0.6;
  const lo = mood === 'suspense' ? 0 : mood === 'sono' ? 2 : 1;
  const hi = mood === 'sono' ? 6 : 7;
  const motif: (number | null)[] = [];
  let cur = lo + Math.floor(r() * (hi - lo));
  for (let i = 0; i < 4; i++) {
    if (i === 0 || r() < density) {
      cur = Math.max(lo, Math.min(hi, cur + pick([-2, -1, -1, 1, 1, 2, 0])));
      motif.push(cur);
    } else motif.push(null);
  }
  const mel: (number | null)[] = [];
  const blocks = N / 4;
  for (let bk = 0; bk < blocks; bk++) {
    const last = bk === blocks - 1;
    for (let i = 0; i < 4; i++) {
      let v = motif[i];
      if (bk % 2 === 1 && v !== null) v = Math.max(lo, Math.min(hi, v + pick([-1, 0, 1, 2])));
      if (last && i === 2) v = pick([0, 2, 5].filter((x) => x >= lo && x <= hi)) ?? lo;
      if (last && i === 3) v = null;
      mel.push(v);
    }
  }
  // baixo: tônica no tempo forte, quinta/oitava no contratempo
  const bass: (number | null)[] = [];
  for (let i = 0; i < N; i++) {
    if (i % 4 === 0) bass.push(0);
    else if (mood === 'festa' && i % 2 === 0) bass.push(2);
    else if (mood !== 'sono' && mood !== 'suspense' && i % 4 === 3 && r() < 0.5) bass.push(pick([1, 3]));
    else if (mood === 'aventura' && i % 4 === 2) bass.push(1);
    else bass.push(null);
  }
  const dr = pick(DRUMS[mood]).map((s) => s.slice(0, N)) as [string, string, string];
  return {
    v: 1,
    mood,
    bpm: def.bpm + Math.round((r() - 0.5) * 10),
    steps,
    key: Math.floor(r() * 12),
    mel: def.mel,
    bass: def.bass,
    kit: def.kit,
    m: mel.map((v) => (v === null ? '.' : String(v))).join(''),
    b: bass.map((v) => (v === null ? '.' : String(v))).join(''),
    d: dr,
  };
}

export const emptyBeat = (mood: Mood, steps: 8 | 16 = 16): BeatPat => ({
  ...randomBeat(mood, 1, steps),
  m: '.'.repeat(steps),
  b: '.'.repeat(steps),
  d: ['0'.repeat(steps), '0'.repeat(steps), '0'.repeat(steps)],
});

/** Lê/valida um padrão (projeto importado, TV). null = inválido. */
export function parseBeat(raw: unknown): BeatPat | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const mood = MOODS.includes(o.mood as Mood) ? (o.mood as Mood) : null;
  if (!mood) return null;
  const steps: 8 | 16 = o.steps === 8 ? 8 : 16;
  const fit = (s: unknown, re: RegExp, fill: string) => {
    const v = typeof s === 'string' ? s.slice(0, steps) : '';
    return (v + fill.repeat(steps)).slice(0, steps).replace(re, fill);
  };
  const d = Array.isArray(o.d) ? o.d : [];
  const def = MOOD_DEF[mood];
  const bpm = typeof o.bpm === 'number' && isFinite(o.bpm) ? Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, o.bpm))) : def.bpm;
  const key = typeof o.key === 'number' && isFinite(o.key) ? ((Math.round(o.key) % 12) + 12) % 12 : 0;
  return {
    v: 1,
    mood,
    bpm,
    steps,
    key,
    mel: MEL_INSTS.includes(o.mel as MelInst) ? (o.mel as MelInst) : def.mel,
    bass: BASS_INSTS.includes(o.bass as BassInst) ? (o.bass as BassInst) : def.bass,
    kit: KIT_INSTS.includes(o.kit as KitInst) ? (o.kit as KitInst) : def.kit,
    m: fit(o.m, /[^.0-7]/g, '.'),
    b: fit(o.b, /[^.0-3]/g, '.'),
    d: [fit(d[0], /[^01]/g, '0'), fit(d[1], /[^01]/g, '0'), fit(d[2], /[^01]/g, '0')],
  };
}

/** duração de uma volta da grade (s) */
export const loopSec = (p: Pick<BeatPat, 'bpm' | 'steps'>): number => (p.steps * 30) / p.bpm;
