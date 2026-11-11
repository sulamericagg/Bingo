/* ============================================================
 *  ESTÚDIO BLOOP — mini-roteiro → projeto do Bloop Cinema.
 *
 *  Os filmes oficiais da TV Bloop são escritos como roteiros curtos
 *  (uma linha por "batida") e montados aqui de forma DETERMINÍSTICA
 *  (mesmos ids e durações em qualquer máquina): o gerador em Node
 *  (scripts/tv/gen-films.mjs) grava shared/tv-films.json, que o app
 *  (TV, catálogo, Remixar) e o servidor (grade ao vivo) usam.
 *
 *  Batida:  "<quem> [tokens...]: texto"
 *   quem   N = narração · * = sem fala · 0..7 = índice no elenco
 *   tokens pose (wave, jump...) e expressão (happy, sad...) de quem fala ·
 *          >X anda até X · >L / >R sai pela esquerda/direita · < entra (até o lugar dele) · <X entra até X ·
 *          ^ pulinho · !efeito · #som · @câmera (wide close two push pan low high orbit side ots) ·
 *          %estilo (shout think whisper sub) · +S segundos a mais · fL fR fC (virar) ·
 *          2=sad · 2=sit/sleepy · 2>14 · 2>R · 2< · 2^   (comandos para OUTRO ator)
 *  Arquivo puro (sem DOM/i18n).
 * ============================================================ */
import { av, PRESETS } from '../presets';
import { hashStr, MOOD_DEF, MEL_INSTS, randomBeat, type MelInst, type Mood } from '../beatpat';
import type { AvatarData } from '../../game/avatar';
import type {
  ActorKey, BubbleStyle, Cam3dPreset, CamKey, CastMember, ExprId, FxKind, Line, PoseId, Project, Scene, Shot, TransitionKind, VoiceFxId,
} from '../format';

export type Genre = 'comedia' | 'aventura' | 'misterio' | 'escola' | 'esporte' | 'espaco' | 'fazenda' | 'festa' | 'amizade' | 'tutorial';
export const GENRES: Genre[] = ['comedia', 'aventura', 'misterio', 'escola', 'esporte', 'espaco', 'fazenda', 'festa', 'amizade', 'tutorial'];

export type CastRef = string | { id: string; name?: string; voice?: VoiceFxId; size?: number };
export interface SceneSpec {
  bg: string;
  light?: 'day' | 'dusk' | 'night';
  /** posição inicial de cada um do elenco ("4 12 -": '-' = fora de cena). Padrão: todos, espalhados. */
  at?: string;
  tr?: TransitionKind;
  b: string[];
}
export interface FilmSpec {
  id: string;
  title: string;
  genre: Genre;
  mode?: '2d' | '3d';
  tags?: string[];
  /** humor da trilha criada ("Criar música") */
  mood: Mood;
  /** usa uma música pronta (free-01..20) em vez da trilha criada */
  song?: string;
  /** instrumento da melodia (senão o do humor/sorteado) */
  mel?: MelInst;
  desc?: string;
  cast: CastRef[];
  scenes: SceneSpec[];
}

export interface OfficialMeta {
  id: string;
  title: string;
  genre: Genre;
  mode: '2d' | '3d';
  tags: string[];
  dur: number;
  mood: Mood;
  desc: string;
}

/* ---------------------------- elenco extra dos filmes ---------------------------- */
const FILM_CAST: Record<string, { name: string; av: AvatarData }> = {
  tuca: { name: 'Tuca', av: av('b_square', 'm_soft', 'p_stripes', 'e_cute', 'mo_grin', 'h_cap', 'f_none', 'k_none', '#3ecf8e', '#ffffff') },
  mel: { name: 'Mel', av: av('b_drop', 'm_jelly', 'p_hearts', 'e_big', 'mo_smile', 'h_bow', 'f_blush', 'k_none', '#ffaa3b', '#ffd93b') },
  dudu: { name: 'Dudu', av: av('b_egg', 'm_plush', 'p_spots', 'e_cute', 'mo_tooth', 'h_beanie', 'f_freckles', 'k_backpack', '#4f7dff', '#9be15d') },
  kiki: { name: 'Kiki', av: av('b_cat', 'm_soft', 'p_tiger', 'e_big', 'mo_cat', 'h_none', 'f_none', 'k_tail', '#ff8f3b', '#ffe0c2') },
  estrela: { name: 'Cap. Estrela', av: av('b_round', 'm_pearl', 'p_stars', 'e_star', 'mo_smile', 'h_astro', 'f_none', 'k_jetpack', '#ffffff', '#4f7dff') },
  chef: { name: 'Chef Panqueca', av: av('b_cloud', 'm_soft', 'p_belly', 'e_cute', 'mo_mustache', 'h_pot', 'f_none', 'k_none', '#ffe0c2', '#ff5c5c') },
  bu: { name: 'Bu', av: av('b_ghost', 'm_jelly', 'p_none', 'e_dots', 'mo_smile', 'h_none', 'f_blush', 'k_none', '#eef2ff', '#9b6bff') },
  rei: { name: 'Rei Bolão', av: av('b_round', 'm_soft', 'p_belly', 'e_cute', 'mo_mustache', 'h_crown', 'f_none', 'k_cape', '#ffd93b', '#d77bff') },
  tito: { name: 'Mago Tito', av: av('b_bean', 'm_galaxy', 'p_stars', 'e_cute', 'mo_smile', 'h_wizard', 'f_glasses', 'k_cape', '#9b6bff', '#ffd93b') },
  lupa: { name: 'Detetive Lupa', av: av('b_egg', 'm_clay', 'p_none', 'e_cute', 'mo_mustache', 'h_cap', 'f_monocle', 'k_none', '#c9b8a3', '#5b5b6e') },
  dinho: { name: 'Dinho', av: av('b_blob', 'm_clay', 'p_scales', 'e_big', 'mo_fangs', 'h_none', 'f_none', 'k_dragon', '#9be15d', '#3ecf8e') },
  sol: { name: 'Sol', av: av('b_star', 'm_soft', 'p_none', 'e_cute', 'mo_grin', 'h_headphones', 'f_shades', 'k_none', '#ffd93b', '#ff5c5c') },
  nuvem: { name: 'Nuvem', av: av('b_cloud', 'm_plush', 'p_none', 'e_sleepy', 'mo_smile', 'h_none', 'f_blush', 'k_angel', '#dff3ff', '#3fc8ff') },
  bia: { name: 'Bia', av: av('b_heart', 'm_crayon', 'p_doodle', 'e_big', 'mo_smile', 'h_beanie', 'f_freckles', 'k_backpack', '#9b6bff', '#ffaa3b') },
};
/** bichinhos da coleção (ids s<temporada>-<raridade>) */
const CREATURES: Record<string, { id: string; name: string }> = {
  ovelha: { id: 's32-medio', name: 'Ovelhinha' },
  ponei: { id: 's26-medio', name: 'Poneizinho' },
  cao: { id: 's06-rare', name: 'Quadrilhito' },
  galo: { id: 's06-legendary', name: 'Galarraiá' },
  pato: { id: 's37-medio', name: 'Quaquito' },
  joaninha: { id: 's19-medio', name: 'Joaninha' },
  abelha: { id: 's45-medio', name: 'Abelhinha' },
  cabra: { id: 's14-rare', name: 'Cabrilho' },
  milho: { id: 's06-common', name: 'Milhito' },
  flor: { id: 's19-common', name: 'Florzinha' },
  sapo: { id: 's03-epic', name: 'Sapolim' },
  pinguim: { id: 's00-epic', name: 'Pingolim' },
  dino: { id: 's08-medio', name: 'Bebessauro' },
  coruja: { id: 's16-medio', name: 'Corujinho' },
  coelho: { id: 's22-rare', name: 'Coelhágico' },
  gato: { id: 's07-rare', name: 'Gatobô' },
  urso: { id: 's11-epic', name: 'Ursinevado' },
  raposa: { id: 's11-rare', name: 'Raponeve' },
  tucano: { id: 's03-rare', name: 'Tucaninho' },
  guaxinim: { id: 's20-rare', name: 'Guaxinito' },
  cachorro: { id: 's40-rare', name: 'Craquinho' },
  peixe: { id: 's02-epic', name: 'Lantejoula' },
};

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

function castMember(ref: CastRef, id: string): CastMember {
  const r = typeof ref === 'string' ? { id: ref } : ref;
  const cr = CREATURES[r.id];
  if (cr) return { id, name: (r.name ?? cr.name).slice(0, 20), kind: 'creature', creature: cr.id, voice: r.voice ?? 'normal', size: r.size ?? 0.9 };
  const p = PRESETS.find((x) => x.id === r.id) ?? (FILM_CAST[r.id] ? { name: FILM_CAST[r.id].name, av: FILM_CAST[r.id].av } : null);
  if (!p) throw new Error(`elenco desconhecido: ${r.id}`);
  const m: CastMember = { id, name: (r.name ?? p.name).slice(0, 20), kind: 'avatar', avatar: clone(p.av), voice: r.voice ?? 'normal' };
  if (r.size && r.size !== 1) m.size = r.size;
  return m;
}

/* ---------------------------- parser das batidas ---------------------------- */
const POSES = new Set<string>(['stand', 'walk', 'run', 'wave', 'point', 'sit', 'jump', 'dance', 'lie', 'hug', 'facepalm', 'think', 'cheer', 'shrug', 'bow', 'clap', 'scared', 'spin', 'flex', 'sneak']);
const EXPRS = new Set<string>(['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy', 'love', 'laughing', 'crying', 'thinking', 'scared', 'smug', 'wink', 'dizzy', 'shy', 'confused']);
const FXS = new Set<string>(['shake', 'sparkles', 'rain', 'hearts', 'sweat', 'zoomlines', 'confetti', 'snow', 'flash', 'poof', 'anger', 'notes', 'stars']);
const SFXS = new Set<string>(['boing', 'pop', 'whoosh', 'ding', 'bonk', 'rimshot', 'applause', 'magic', 'slip', 'crickets', 'knock', 'phone', 'drumroll', 'sad', 'thunder', 'steps']);
const CAMS = new Set<string>(['wide', 'close', 'two', 'push', 'pan', 'low', 'high', 'orbit', 'side', 'ots']);
/** efeitos presos a um ator (data.ts FX_ON_ACTOR) */
const FX_KINDS_ON_ACTOR = new Set<string>(['hearts', 'sweat', 'anger', 'notes', 'stars', 'poof', 'sparkles']);
const STICKY = new Set<PoseId>(['sit', 'lie']);

type Move = { to: number | 'L' | 'R' } | { enter: number | null };
interface Cmd {
  pose?: PoseId;
  expr?: ExprId;
  move?: Move;
  hop?: boolean;
  face?: -1 | 0 | 1;
}
interface Beat {
  who: number | 'N' | '*';
  text: string;
  me: Cmd;
  others: Map<number, Cmd>;
  fx: FxKind[];
  sfx: string[];
  cam?: string;
  style?: BubbleStyle;
  extra: number;
}

function parseBeat(src: string, nCast: number, where: string): Beat {
  const ci = src.indexOf(': ');
  const head = (ci >= 0 ? src.slice(0, ci) : src).trim();
  const text = ci >= 0 ? src.slice(ci + 2).trim() : '';
  const toks = head.split(/\s+/).filter(Boolean);
  const w = toks.shift() ?? '*';
  const who: Beat['who'] = w === 'N' ? 'N' : w === '*' ? '*' : +w;
  if (typeof who === 'number' && !(who >= 0 && who < nCast)) throw new Error(`${where}: quem inválido "${w}"`);
  if (text.length > 120) throw new Error(`${where}: fala longa demais (${text.length})`);
  const b: Beat = { who, text, me: {}, others: new Map(), fx: [], sfx: [], extra: 0 };
  const cmdTok = (c: Cmd, tk: string): boolean => {
    if (POSES.has(tk) && EXPRS.has(tk)) return (c.pose = tk as PoseId), (c.expr = tk as ExprId), true;
    if (POSES.has(tk)) return (c.pose = tk as PoseId), true;
    if (EXPRS.has(tk)) return (c.expr = tk as ExprId), true;
    if (tk === '^') return (c.hop = true), true;
    if (tk === 'fL' || tk === 'fR' || tk === 'fC') return (c.face = tk === 'fL' ? -1 : tk === 'fR' ? 1 : 0), true;
    if (tk.startsWith('>')) {
      const v = tk.slice(1);
      c.move = { to: v === 'L' || v === 'R' ? v : +v };
      if (typeof c.move.to === 'number' && isNaN(c.move.to)) throw new Error(`${where}: destino inválido ${tk}`);
      return true;
    }
    if (tk.startsWith('<')) {
      c.move = { enter: tk.length > 1 ? +tk.slice(1) : null };
      return true;
    }
    return false;
  };
  for (const tk of toks) {
    const m = /^(\d)([=><^].*)$/.exec(tk);
    if (m) {
      const i = +m[1];
      if (i >= nCast) throw new Error(`${where}: ator ${i} não existe`);
      const c = b.others.get(i) ?? {};
      const rest = m[2];
      if (rest.startsWith('=')) {
        for (const part of rest.slice(1).split('/')) if (!cmdTok(c, part)) throw new Error(`${where}: token "${tk}"`);
      } else if (!cmdTok(c, rest)) throw new Error(`${where}: token "${tk}"`);
      b.others.set(i, c);
      continue;
    }
    if (cmdTok(b.me, tk)) continue;
    if (tk.startsWith('!') && FXS.has(tk.slice(1))) b.fx.push(tk.slice(1) as FxKind);
    else if (tk.startsWith('#') && SFXS.has(tk.slice(1))) b.sfx.push(tk.slice(1));
    else if (tk.startsWith('@') && CAMS.has(tk.slice(1))) b.cam = tk.slice(1);
    else if (tk.startsWith('%')) b.style = ({ shout: 'shout', think: 'think', whisper: 'whisper', sub: 'subtitle', narr: 'narration', speech: 'speech' } as Record<string, BubbleStyle>)[tk.slice(1)];
    else if (/^\+\d+(\.\d+)?$/.test(tk)) b.extra = +tk.slice(1);
    else throw new Error(`${where}: token desconhecido "${tk}"`);
  }
  if ((who === 'N' || who === '*') && (b.me.pose || b.me.expr || b.me.move)) throw new Error(`${where}: narrador não tem pose`);
  return b;
}

/* ---------------------------- montagem ---------------------------- */
const r1 = (v: number) => Math.round(v * 100) / 100;
const speakDur = (s: string) => Math.max(1.8, Math.min(5.4, s.length * 0.062 + 1.05));
const WALK = 2.8;
const RUN = 5;
const TRS: TransitionKind[] = ['fade', 'iris', 'slide', 'dissolve', 'zoom', 'fade'];

interface AState {
  on: boolean;
  x: number;
  pose: PoseId;
  expr: ExprId;
  face: -1 | 0 | 1;
}

function slotsFor(n: number): number[] {
  return n <= 1 ? [8] : n === 2 ? [5.6, 10.4] : n === 3 ? [4.2, 8, 11.8] : n === 4 ? [3.3, 6.4, 9.6, 12.7] : [2.6, 5.3, 8, 10.7, 13.4];
}

/** Monta o projeto (determinístico) a partir do roteiro. */
export function buildFilm(f: FilmSpec): { project: Project; meta: OfficialMeta } {
  const mode = f.mode ?? '2d';
  const fid = f.id;
  let seq = 0;
  const nid = (p: string) => `${p}${fid.slice(-3)}${(seq++).toString(36)}`;
  const cast = f.cast.map((c, i) => castMember(c, `c${fid.slice(-3)}${i}`));
  const seed = hashStr(fid);
  const scenes: Scene[] = [];
  let camTurn = seed % 3;

  f.scenes.forEach((sc, si) => {
    const where = `${fid} cena ${si + 1}`;
    // posições iniciais
    const st: AState[] = cast.map(() => ({ on: false, x: 8, pose: 'stand', expr: 'happy', face: 0 }));
    const atToks = sc.at ? sc.at.trim().split(/\s+/) : null;
    if (atToks && atToks.length !== cast.length) throw new Error(`${where}: "at" precisa de ${cast.length} posições`);
    const def = slotsFor(cast.length);
    cast.forEach((_, i) => {
      const tk = atToks ? atToks[i] : String(def[i]);
      if (tk !== '-') {
        st[i].on = true;
        st[i].x = +tk;
        if (isNaN(st[i].x)) throw new Error(`${where}: posição inválida ${tk}`);
      } else st[i].x = i % 2 ? 18 : -2;
    });
    const shots: Shot[] = [];
    sc.b.forEach((raw, bi) => {
      const b = parseBeat(raw, cast.length, `${where} batida ${bi + 1}`);
      const sp = typeof b.who === 'number' ? b.who : -1;
      const keys: ActorKey[][] = cast.map(() => []);
      const k = (i: number, t: number, x: number, pose: PoseId, expr: ExprId, face: -1 | 0 | 1, ease: ActorKey['ease'] = 'inout', y = 0) =>
        keys[i].push({ t: r1(t), x: r1(x), z: 0, y, face, pose, expr, ease });

      // 1) movimentos e tempos
      let lineT = 0.3;
      let tailAfter = 0;
      const plan: { i: number; from: number; to: number; t0: number; t1: number; exitAfter: boolean; off: boolean }[] = [];
      const doMove = (i: number, c: Cmd, isSpeaker: boolean) => {
        const s = st[i];
        if (!c.move) return;
        const run = c.pose === 'run';
        const speed = run ? RUN : WALK;
        if ('enter' in c.move) {
          const target = c.move.enter ?? (s.on ? s.x : s.x < 8 ? def[i] ?? 4 : def[i] ?? 12);
          const from = s.on ? s.x : target < 8 ? -2 : 18;
          const d = Math.abs(target - from) / speed;
          plan.push({ i, from, to: target, t0: 0.15, t1: 0.15 + d, exitAfter: false, off: false });
          if (isSpeaker) lineT = 0.35 + d;
          s.on = true;
          s.x = target;
        } else {
          const to = c.move.to === 'L' ? -2.5 : c.move.to === 'R' ? 18.5 : c.move.to;
          const exit = c.move.to === 'L' || c.move.to === 'R';
          const d = Math.abs(to - s.x) / speed;
          if (isSpeaker && exit) {
            plan.push({ i, from: s.x, to, t0: -1, t1: d, exitAfter: true, off: true });
          } else {
            plan.push({ i, from: s.x, to, t0: 0.2, t1: 0.2 + d, exitAfter: false, off: exit });
            if (isSpeaker) lineT = Math.max(lineT, 0.35 + d);
          }
          s.x = to;
          if (exit) s.on = false;
          else s.on = true;
        }
      };
      if (sp >= 0) doMove(sp, b.me, true);
      for (const [i, c] of b.others) doMove(i, c, false);
      const hasText = !!b.text;
      const ld = hasText ? speakDur(b.text) : 0;
      let endMoves = 0;
      for (const p of plan) if (!p.exitAfter) endMoves = Math.max(endMoves, p.t1);
      let lineEnd = hasText ? lineT + ld : Math.max(endMoves, 0.6);
      // quem sai DEPOIS de falar
      for (const p of plan)
        if (p.exitAfter) {
          const d = p.t1;
          p.t0 = lineEnd - 0.1;
          p.t1 = p.t0 + d;
          tailAfter = Math.max(tailAfter, p.t1 - lineEnd);
        }
      if (!hasText) lineEnd = Math.max(lineEnd, ...plan.map((p) => p.t1), 1.2);
      const dur = r1(Math.max(1.6, lineEnd + Math.max(0.45, tailAfter + 0.1) + b.extra));

      // 2) atores
      const onNow = (i: number) => st[i].on || plan.some((p) => p.i === i);
      const xsEnd = cast.map((_, i) => st[i].x);
      const faceTo = (i: number, j: number): -1 | 1 => (xsEnd[j] > xsEnd[i] ? 1 : -1);
      const nOn = cast.filter((_, i) => onNow(i) && st[i].on).length;
      const nearest = (i: number): number => {
        let best = -1;
        let bd = 1e9;
        cast.forEach((_, j) => {
          if (j === i || !st[j].on) return;
          const d = Math.abs(xsEnd[j] - xsEnd[i]);
          if (d < bd) (bd = d), (best = j);
        });
        return best;
      };
      cast.forEach((_, i) => {
        const s = st[i];
        const c = i === sp ? b.me : (b.others.get(i) ?? {});
        const mv = plan.find((p) => p.i === i);
        if (!mv && !s.on) return;
        if (c.expr) s.expr = c.expr;
        const keepPose: PoseId = STICKY.has(s.pose) && !c.pose && !mv ? s.pose : 'stand';
        const pose: PoseId = c.pose && c.pose !== 'run' && c.pose !== 'walk' ? c.pose : keepPose;
        let face: -1 | 0 | 1;
        if (c.face !== undefined) face = c.face;
        else if (sp < 0) face = 0;
        else if (i === sp) {
          const n = nearest(i);
          face = nOn <= 2 && n >= 0 ? faceTo(i, n) : 0;
        } else face = st[sp].on || plan.some((p) => p.i === sp) ? faceTo(i, sp) : 0;
        if (pose === 'lie' || pose === 'sit' || pose === 'bow') face = c.face ?? (pose === 'bow' ? 0 : face);
        if (mv) {
          const dir: -1 | 1 = mv.to > mv.from ? 1 : -1;
          if (mv.exitAfter) {
            k(i, 0, mv.from, i === sp ? pose : 'stand', s.expr, face);
            k(i, mv.t0, mv.from, 'stand', s.expr, dir);
            k(i, mv.t1, mv.to, 'stand', s.expr, dir, 'linear');
          } else {
            const startX = mv.from;
            k(i, 0, startX, 'stand', s.expr, dir);
            if (mv.t0 > 0.05) k(i, mv.t0, startX, 'stand', s.expr, dir);
            k(i, mv.t1, mv.to, 'stand', s.expr, mv.off ? dir : face, mv.off ? 'linear' : 'out');
            if (!mv.off) {
              const at = i === sp ? Math.max(mv.t1 + 0.05, lineT - 0.05) : mv.t1 + 0.1;
              if (at < dur) k(i, at, mv.to, pose, s.expr, face);
            }
          }
        } else {
          k(i, 0, s.x, i === sp ? (STICKY.has(s.pose) ? s.pose : 'stand') : pose, s.expr, face);
          if (i === sp && hasText) k(i, Math.max(0.05, lineT - 0.15), s.x, pose, s.expr, face);
          else if (i !== sp && (c.pose || c.expr)) k(i, Math.min(dur - 0.1, lineT + 0.4), s.x, pose, s.expr, face);
        }
        if (c.hop) {
          const t0 = i === sp ? lineT : 0.4;
          const x = s.x;
          k(i, t0 + 0.28, x, pose, s.expr, face, 'out', 1.3);
          k(i, t0 + 0.56, x, pose, s.expr, face, 'in', 0);
        }
        keys[i].sort((a, bb) => a.t - bb.t);
        s.pose = pose;
        s.face = face;
      });

      // 3) câmera
      const onIdx = cast.map((_, i) => i).filter((i) => st[i].on || plan.some((p) => p.i === i && !p.off));
      const xs = onIdx.map((i) => xsEnd[i]).filter((x) => x > -1 && x < 17);
      const lo = xs.length ? Math.min(...xs) : 4;
      const hi = xs.length ? Math.max(...xs) : 12;
      let cam = b.cam;
      if (!cam) {
        const loud = b.me.expr === 'surprised' || b.me.expr === 'scared' || b.me.expr === 'angry' || b.style === 'shout';
        if (bi === 0 || sp < 0 || plan.length) cam = 'wide';
        else if (loud && hasText) cam = 'push';
        else cam = mode === '3d' ? (['close', 'ots', 'wide', 'close', 'low', 'two', 'high', 'close', 'side'] as const)[camTurn++ % 9] : (['close', 'two', 'close', 'wide', 'two'] as const)[camTurn++ % 5];
      }
      const other = sp >= 0 ? nearest(sp) : -1;
      const cs = sp >= 0 ? cast[sp].id : undefined;
      const co = other >= 0 ? cast[other].id : undefined;
      const mid = (lo + hi) / 2;
      const span = hi - lo;
      let ck: CamKey[];
      const K = (t: number, x: number, y: number, zoom: number, p3: Cam3dPreset, extra: Partial<CamKey> = {}): CamKey => ({ t: r1(t), x: r1(x), y: r1(y), zoom: r1(zoom), p3, ease: 'inout', ...extra });
      const wideZ = bi === 0 ? 1 : Math.max(1, Math.min(1.3, 13 / (span + 7)));
      const is3 = mode === '3d';
      // 2D: enquadramento "médio" calculado (corpo inteiro maior, com espaço para o balão acima da cabeça);
      // 3D: presets do Scene3D seguindo a cabeça de quem fala
      const CY = 5.35;
      switch (cam) {
        case 'close':
          ck =
            sp < 0
              ? [K(0, mid, 4.5, wideZ, 'wide')]
              : is3
                ? [K(0, 8, 4.6, 0.95, 'closeup', { focus: cs }), K(dur, 8, 4.6, 1.05, 'closeup', { focus: cs })]
                : [K(0, xsEnd[sp], CY, 1.7, 'closeup'), K(dur, xsEnd[sp], CY - 0.05, 1.8, 'closeup')];
          break;
        case 'push':
          ck =
            sp < 0
              ? [K(0, mid, 4.5, wideZ, 'wide')]
              : is3
                ? [K(0, 8, 4.8, 1.25, 'dolly', { focus: cs }), K(dur, 8, 4.6, 1.3, 'dolly', { focus: cs })]
                : [K(0, xsEnd[sp], 4.9, 1.15, 'dolly'), K(Math.min(dur, lineT + 0.5), xsEnd[sp], CY, 1.95, 'dolly', { ease: 'out' })];
          break;
        case 'two': {
          const a = sp >= 0 ? xsEnd[sp] : lo;
          const bx = other >= 0 ? xsEnd[other] : hi;
          const z = Math.max(1.1, Math.min(1.6, 15 / (Math.abs(a - bx) + 7.5)));
          ck = [K(0, is3 ? 8 : (a + bx) / 2, 5.0, is3 ? 1 : z, 'ots', { focus: is3 ? cs : undefined, focus2: is3 ? co : undefined }), K(dur, is3 ? 8 : (a + bx) / 2, 5.0, is3 ? 1.05 : z * 1.04, 'ots', { focus: is3 ? cs : undefined, focus2: is3 ? co : undefined })];
          break;
        }
        case 'pan':
          ck = [K(0, Math.max(5, lo), 5, 1.5, 'side'), K(dur, Math.min(11, hi), 5, 1.5, 'side')];
          break;
        case 'orbit':
          ck = [K(0, is3 ? 8 : mid, 4.6, is3 ? 1.25 : 1.1, 'orbit', { yaw: -20 }), K(dur, is3 ? 8 : mid, 4.6, is3 ? 1.3 : 1.15, 'orbit', { yaw: 20 })];
          break;
        case 'low':
        case 'high':
        case 'side':
          ck = is3
            ? [K(0, 8, 4.8, 1.25, cam, { focus: cs, yaw: cam === 'side' ? 0 : -10 }), K(dur, 8, 4.7, 1.35, cam, { focus: cs, yaw: cam === 'side' ? 0 : 10 })]
            : [K(0, sp >= 0 ? xsEnd[sp] : mid, 4.9, 1.2, cam), K(dur, sp >= 0 ? xsEnd[sp] : mid, 4.8, 1.3, cam)];
          break;
        case 'ots':
          ck = [K(0, sp >= 0 ? xsEnd[sp] : mid, 5, 1.4, 'ots', { focus: cs, focus2: co })];
          break;
        default: {
          const p3: Cam3dPreset = bi === 0 && si === 0 && is3 ? 'orbit' : 'wide';
          const cx = bi === 0 || is3 ? 8 : mid;
          const z3 = is3 ? (p3 === 'orbit' ? 1.2 : 1.35 + (wideZ - 1)) : wideZ;
          ck = [K(0, cx, 4.5 + (wideZ - 1) * 2, z3, p3, { yaw: p3 === 'orbit' ? -15 : 0 }), K(dur, cx, 4.5 + (wideZ * 1.06 - 1) * 2, z3 * 1.06, p3, { yaw: p3 === 'orbit' ? 15 : 0 })];
        }
      }
      // ninguém em cima de ninguém (filmes oficiais: personagens sempre bem posicionados)
      const onEnd = cast.map((_, i) => i).filter((i) => st[i].on);
      for (let a = 0; a < onEnd.length; a++)
        for (let c2 = a + 1; c2 < onEnd.length; c2++)
          if (Math.abs(xsEnd[onEnd[a]] - xsEnd[onEnd[c2]]) < 2) throw new Error(`${where} batida ${bi + 1}: ${cast[onEnd[a]].name} e ${cast[onEnd[c2]].name} muito perto`);

      // 4) fala, efeitos, sons
      const lines: Line[] = [];
      if (hasText) {
        let style: BubbleStyle = b.style ?? (sp < 0 ? 'narration' : 'speech');
        if (!b.style && sp >= 0) {
          const e = b.me.expr;
          if (/!$/.test(b.text) && (e === 'angry' || e === 'surprised' || e === 'scared' || b.text === b.text.toUpperCase())) style = 'shout';
          else if (/^\(.*\)$/.test(b.text)) style = 'think';
        }
        const text = style === 'think' ? b.text.replace(/^\((.*)\)$/, '$1') : b.text;
        lines.push({ id: nid('ln'), t: r1(lineT), dur: r1(ld), cast: sp >= 0 ? cast[sp].id : undefined, text, style });
      }
      const fxT = hasText ? lineT : 0.3;
      const fx = b.fx.map((kind) => ({
        id: nid('fx'),
        t: r1(fxT),
        dur: r1(['rain', 'snow', 'confetti'].includes(kind) ? Math.max(1.5, dur - fxT) : Math.min(2.4, Math.max(1, ld + 0.3))),
        kind,
        cast: FX_KINDS_ON_ACTOR.has(kind) && sp >= 0 ? cast[sp].id : undefined,
      }));
      const sfx = b.sfx.map((s) => ({ id: nid('sf'), t: r1(Math.max(0, fxT - 0.1)), sfx: s, vol: 0.8 }));
      if (!b.sfx.length && (b.me.hop || [...b.others.values()].some((c) => c.hop))) sfx.push({ id: nid('sf'), t: r1(fxT + 0.05), sfx: 'boing', vol: 0.6 });
      if (!b.sfx.length && plan.some((p) => p.t1 - p.t0 > 1.5 && !p.exitAfter)) sfx.push({ id: nid('sf'), t: 0.2, sfx: 'steps', vol: 0.45 });

      // 5) transição
      let tr: Shot['transition'] = { kind: 'cut', dur: 0.5 };
      if (bi === 0 && si > 0) {
        const kind = sc.tr ?? TRS[(seed + si) % TRS.length];
        tr = { kind, dur: kind === 'fade' || kind === 'iris' ? 0.8 : 0.5 };
      } else if (bi === 0 && si === 0) tr = { kind: 'fade', dur: 0.6 };
      else if (sp < 0 && hasText) tr = { kind: 'dissolve', dur: 0.4 };

      shots.push({
        id: nid('sh'),
        dur,
        transition: tr,
        cam: ck,
        actors: cast.map((c, i) => ({ cast: c.id, keys: keys[i] })).filter((a) => a.keys.length),
        lines,
        fx,
        sfx,
      });
    });
    scenes.push({ id: nid('sc'), name: '', bg: sc.bg, light: sc.light ?? 'day', shots });
  });

  // trilha: padrão do "Criar música" (variado por filme) ou música pronta
  const beat = randomBeat(f.mood, seed);
  const melPool: Record<Mood, MelInst[]> = {
    alegre: ['piano', 'sanfona', 'violao', 'chip'],
    aventura: ['metais', 'cordas', 'orgao'],
    suspense: ['cordas', 'piano', 'orgao'],
    sono: ['violao', 'piano', 'cordas'],
    festa: ['chip', 'sanfona', 'metais', 'piano'],
  };
  beat.mel = f.mel ?? melPool[f.mood][(seed >>> 5) % melPool[f.mood].length];
  if (!MEL_INSTS.includes(beat.mel)) beat.mel = MOOD_DEF[f.mood].mel;
  const music = f.song ? { song: f.song, offset: 8, vol: 0.5 } : { song: MOOD_DEF[f.mood].fallback, offset: 0, vol: 0.55, beat };

  const project: Project = {
    format: 'bloop-cinema',
    v: 1,
    id: fid,
    title: f.title,
    created: 1767225600000,
    updated: 1767225600000,
    mode,
    cast,
    scenes,
    music,
    mix: { music: 0.75, voice: 1, sfx: 0.8 },
    watermark: true,
    template: `tv:${fid}`,
  };
  let dur = 0;
  for (const s of scenes) for (const h of s.shots) dur += h.dur;
  return {
    project,
    meta: { id: fid, title: f.title, genre: f.genre, mode, tags: f.tags ?? [], dur: r1(dur), mood: f.mood, desc: f.desc ?? '' },
  };
}
