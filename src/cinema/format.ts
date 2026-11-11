/* ============================================================
 *  BLOOP CINEMA — formato do projeto (JSON versionado).
 *  Documentado em docs/CINEMA-FORMATO.md. Mantenha os dois em sincronia.
 *
 *  Unidades:
 *   - tempo em segundos (float), sempre relativo ao início do PLANO (shot);
 *   - palco 2D: largura 16 × altura 9 unidades; chão em y = FLOOR_Y (7.3);
 *     ator: x (0..16) da esquerda, z (-3..3; + = mais perto da câmera), y = altura do pulo;
 *   - o mesmo ator vale para 2D e 3D (no 3D, x→X, z→Z, em metros ×0.75).
 *  Nada aqui acessa DOM: é importado pelo editor, pelo player e pelo exportador.
 * ============================================================ */
import type { AvatarData } from '../game/avatar';
import { parseLook, type MakeupLook } from '../makeup/format';
import { validateStory, type StorySpec } from '../../shared/story';

export const FORMAT_ID = 'bloop-cinema';
export const FORMAT_VERSION = 1;
export const STAGE_W = 16;
export const STAGE_H = 9;
export const FLOOR_Y = 7.3;
export const MAX_CAST = 8;

export type Mode = '2d' | '3d';
export type Ease = 'linear' | 'in' | 'out' | 'inout' | 'back' | 'bounce' | 'step';

export type ExprId =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy' | 'love' | 'laughing' | 'crying' | 'thinking'
  | 'scared' | 'smug' | 'wink' | 'dizzy' | 'shy' | 'confused';

export type PoseId =
  | 'stand' | 'walk' | 'run' | 'wave' | 'point' | 'sit' | 'jump' | 'dance' | 'lie' | 'hug' | 'facepalm' | 'think'
  | 'cheer' | 'shrug' | 'bow' | 'clap' | 'scared' | 'spin' | 'flex' | 'sneak';

export type BubbleStyle = 'speech' | 'shout' | 'think' | 'whisper' | 'subtitle' | 'narration';
export type TransitionKind = 'cut' | 'fade' | 'dissolve' | 'slide' | 'zoom' | 'iris';
export type FxKind =
  | 'shake' | 'sparkles' | 'rain' | 'hearts' | 'sweat' | 'zoomlines' | 'confetti' | 'snow' | 'flash' | 'poof' | 'anger' | 'notes' | 'stars';
export type Cam3dPreset = 'wide' | 'orbit' | 'dolly' | 'closeup' | 'ots' | 'low' | 'high' | 'side';
export type VoiceFxId = 'normal' | 'chipmunk' | 'deep' | 'robot' | 'echo' | 'giant';

export interface CastMember {
  id: string;
  name: string;
  /** 'avatar' = Bloop (peças do Crie seu Bloop); 'creature' = bichinho da coleção */
  kind: 'avatar' | 'creature';
  avatar?: AvatarData;
  creature?: string;
  /** efeito de voz aplicado às falas gravadas deste personagem */
  voice: VoiceFxId;
  /** escala do personagem (0.7..1.3) */
  size?: number;
  /** maquiagem / pintura facial (Estúdio de Maquiagem — src/makeup/format.ts) */
  makeup?: MakeupLook;
}

export interface ActorKey {
  t: number;
  x: number;
  z: number;
  y: number;
  /** 2D: 1 = olhando p/ direita, -1 = esquerda. 3D: idem (vira de frente quando 0) */
  face: -1 | 0 | 1;
  pose: PoseId;
  expr: ExprId;
  ease: Ease;
}

export interface ActorTrack {
  cast: string;
  keys: ActorKey[];
}

export interface CamKey {
  t: number;
  /** 2D: centro do enquadramento (unidades do palco) e zoom (1 = palco inteiro) */
  x: number;
  y: number;
  zoom: number;
  /** segue a cabeça de um ator (2D e 3D) */
  focus?: string;
  /** 3D: preset e 2º ator (por cima do ombro) */
  p3?: Cam3dPreset;
  focus2?: string;
  /** 3D: giro extra em graus */
  yaw?: number;
  ease: Ease;
}

export interface Line {
  id: string;
  t: number;
  dur: number;
  /** quem fala (bolha aponta para ele e a boca mexe); vazio = legenda/narração */
  cast?: string;
  text: string;
  style: BubbleStyle;
  /** id do clipe de voz gravado (IndexedDB 'clips') */
  audio?: string;
  /** "Gravar com o rosto": atuação facial gravada junto com a voz (mesmo relógio) */
  face?: FaceTake;
  /** corte [início, fim] em segundos DA GRAVAÇÃO (vale para a voz e o rosto) */
  cut?: [number, number];
}

/* ---------------------------- captura de rosto ---------------------------- */
/**
 * Canais da captura (ordem fixa = ordem dos bytes de cada quadro):
 *  bl/br piscar esq./dir. · bwl/bwr sobrancelha esq./dir. (-1..1) · bwi meio da sobrancelha ·
 *  op boca aberta · A/O/E vogais · sm sorriso · pk bico · yaw/pit/rol cabeça (rad, ±0,6) ·
 *  lx/ly olhar (-1..1). "Esquerda" = lado esquerdo da TELA (como no Espelho).
 */
export const FACE_CH = ['bl', 'br', 'bwl', 'bwr', 'bwi', 'op', 'A', 'O', 'E', 'sm', 'pk', 'yaw', 'pit', 'rol', 'lx', 'ly'] as const;
export type FaceCh = (typeof FACE_CH)[number];
export type FaceFrame = Record<FaceCh, number>;
/** faixa de cada canal: 0 = 0..1, 1 = -1..1, 2 = -0,6..0,6 rad */
export const FACE_RANGE: Record<FaceCh, 0 | 1 | 2> = { bl: 0, br: 0, bwl: 1, bwr: 1, bwi: 0, op: 0, A: 0, O: 0, E: 0, sm: 0, pk: 0, yaw: 2, pit: 2, rol: 2, lx: 1, ly: 1 };

export interface FaceTake {
  /** quadros por segundo (15..30) */
  hz: number;
  /** número de quadros */
  n: number;
  /** base64 de n × FACE_CH.length bytes (0..255), quadro a quadro */
  q: string;
  /** 'mouth' = usa só boca e cabeça; olhos/sobrancelhas seguem a expressão das chaves */
  only?: 'mouth';
}
export const MAX_FACE_SEC = 15;

export interface FxEvent {
  id: string;
  t: number;
  dur: number;
  kind: FxKind;
  /** preso a um ator (gota de suor, corações, raiva) */
  cast?: string;
  intensity?: number;
}

export interface SfxEvent {
  id: string;
  t: number;
  sfx: string;
  vol: number;
}

export interface Shot {
  id: string;
  dur: number;
  transition: { kind: TransitionKind; dur: number };
  cam: CamKey[];
  actors: ActorTrack[];
  lines: Line[];
  fx: FxEvent[];
  sfx: SfxEvent[];
}

/** Referência a uma Criação do Bloop Studio usada como cenário 3D. */
export interface StudioSetRef {
  name: string;
  /** JSON da criação (embutido — projetos não dependem de rede) */
  json: unknown;
}

export interface Scene {
  id: string;
  name: string;
  /** fundo 2D e cenário 3D (mesmo catálogo de ids) */
  bg: string;
  /** tom do céu/luz: dia, tarde, noite */
  light: 'day' | 'dusk' | 'night';
  studio?: StudioSetRef;
  shots: Shot[];
}

export interface MusicTrack {
  song: string;
  /** começa a música neste segundo dela */
  offset: number;
  vol: number;
}

export interface Project {
  format: typeof FORMAT_ID;
  v: number;
  id: string;
  title: string;
  created: number;
  updated: number;
  mode: Mode;
  cast: CastMember[];
  scenes: Scene[];
  music: MusicTrack | null;
  mix: { music: number; voice: number; sfx: number };
  watermark: boolean;
  /** modelo de origem (remix) */
  template?: string;
  /** roteiro de origem ("Criar história" / História Mágica) — permite re-editar no modo simples */
  story?: StorySpec;
  /** Modo fácil (quadro de cenas): fonte da verdade das cenas — `scenes` é gerado dele (board.ts) */
  board?: Board;
}

/* ---------------------------- modo fácil: quadro de cenas ---------------------------- */
export const BOARD_MAX_SCENES = 12;
export const BOARD_MAX_LINES = 3;
export const BOARD_MAX_CHARS = 4;

/** Personagem parado na cena (arrastar = x; perto/longe = z). */
export interface BoardChar {
  cast: string;
  x: number;
  z: number;
  face: -1 | 0 | 1;
  pose: PoseId;
  expr: ExprId;
}
/** Fala da cena (até 3). Texto vazio = improviso na dublagem (a duração segue a gravação). */
export interface BoardLine {
  id: string;
  /** quem fala (id do elenco); vazio = narrador */
  cast?: string;
  text: string;
  audio?: string;
  /** corte [início, fim] da gravação (s) */
  cut?: [number, number];
}
export interface BoardScene {
  id: string;
  bg: string;
  light: 'day' | 'dusk' | 'night';
  chars: BoardChar[];
  lines: BoardLine[];
}
export interface Board {
  v: 1;
  scenes: BoardScene[];
  /** assinatura de `scenes` gerado (detecta mudanças feitas no modo avançado) */
  sig?: string;
}

/* ---------------------------- utilidades ---------------------------- */

export function uid(p = ''): string {
  return p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export function projectDuration(p: Project): number {
  let d = 0;
  for (const s of p.scenes) for (const sh of s.shots) d += sh.dur;
  return d;
}

export interface ShotRef {
  scene: Scene;
  shot: Shot;
  si: number;
  hi: number;
  /** índice global do plano */
  gi: number;
  start: number;
}

export function flatShots(p: Project): ShotRef[] {
  const out: ShotRef[] = [];
  let start = 0;
  let gi = 0;
  p.scenes.forEach((scene, si) =>
    scene.shots.forEach((shot, hi) => {
      out.push({ scene, shot, si, hi, gi: gi++, start });
      start += shot.dur;
    }),
  );
  return out;
}

export function shotAt(p: Project, T: number, flat = flatShots(p)): { ref: ShotRef; local: number } | null {
  if (!flat.length) return null;
  for (const r of flat) if (T < r.start + r.shot.dur) return { ref: r, local: Math.max(0, T - r.start) };
  const last = flat[flat.length - 1];
  return { ref: last, local: last.shot.dur };
}

export function defaultKey(x: number, t = 0): ActorKey {
  return { t, x, z: 0, y: 0, face: 0, pose: 'stand', expr: 'neutral', ease: 'inout' };
}

export function newShot(dur = 4): Shot {
  return {
    id: uid('sh'),
    dur,
    transition: { kind: 'cut', dur: 0.5 },
    cam: [{ t: 0, x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1, p3: 'wide', ease: 'inout' }],
    actors: [],
    lines: [],
    fx: [],
    sfx: [],
  };
}

export function newScene(bg = 'bedroom'): Scene {
  return { id: uid('sc'), name: '', bg, light: 'day', shots: [newShot()] };
}

export function newProject(title: string, mode: Mode = '2d'): Project {
  const now = Date.now();
  return {
    format: FORMAT_ID,
    v: FORMAT_VERSION,
    id: uid('pj'),
    title,
    created: now,
    updated: now,
    mode,
    cast: [],
    scenes: [newScene()],
    music: null,
    mix: { music: 0.7, voice: 1, sfx: 0.8 },
    watermark: true,
  };
}

/* ---------------------------- validação / migração ---------------------------- */

const num = (v: unknown, d: number, lo = -1e6, hi = 1e6): number => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, d = '', max = 200): string => (typeof v === 'string' ? v.slice(0, max) : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Lê qualquer JSON (arquivo importado, IndexedDB antigo) e devolve um Project válido,
 * ou null se não for um projeto do Bloop Cinema. Corrige campos faltando e limites.
 */
export function parseProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== FORMAT_ID) return null;
  const v = num(o.v, 1);
  if (v > FORMAT_VERSION) return null; // de uma versão mais nova do app
  // (migrações futuras: if (v < 2) { ... })
  const p = newProject(str(o.title, 'Filme', 60), o.mode === '3d' ? '3d' : '2d');
  p.id = str(o.id, p.id, 40) || p.id;
  p.created = num(o.created, p.created);
  p.updated = num(o.updated, p.updated);
  p.watermark = o.watermark !== false;
  p.template = typeof o.template === 'string' ? o.template : undefined;
  p.story = o.story ? (validateStory(o.story) ?? undefined) : undefined;
  p.board = parseBoard(o.board);
  const mix = (o.mix ?? {}) as Record<string, unknown>;
  p.mix = { music: num(mix.music, 0.7, 0, 1), voice: num(mix.voice, 1, 0, 1), sfx: num(mix.sfx, 0.8, 0, 1) };
  const m = o.music as Record<string, unknown> | null;
  p.music = m && typeof m.song === 'string' ? { song: m.song, offset: num(m.offset, 0, 0, 600), vol: num(m.vol, 0.7, 0, 1) } : null;
  p.cast = arr<Record<string, unknown>>(o.cast)
    .slice(0, MAX_CAST)
    .map((c) => ({
      id: str(c.id, uid('c'), 40),
      name: str(c.name, 'Bloop', 20),
      kind: c.kind === 'creature' ? 'creature' : 'avatar',
      avatar: c.avatar as AvatarData | undefined,
      creature: typeof c.creature === 'string' ? c.creature : undefined,
      voice: (['normal', 'chipmunk', 'deep', 'robot', 'echo', 'giant'].includes(c.voice as string) ? c.voice : 'normal') as VoiceFxId,
      size: num(c.size, 1, 0.6, 1.4),
      makeup: c.makeup ? (parseLook(c.makeup) ?? undefined) : undefined,
    }));
  p.scenes = arr<Record<string, unknown>>(o.scenes).map((s) => ({
    id: str(s.id, uid('sc'), 40),
    name: str(s.name, '', 40),
    bg: str(s.bg, 'bedroom', 40),
    light: s.light === 'night' || s.light === 'dusk' ? s.light : 'day',
    studio: s.studio && typeof s.studio === 'object' ? (s.studio as StudioSetRef) : undefined,
    shots: arr<Record<string, unknown>>(s.shots).map((h) => {
      const tr = (h.transition ?? {}) as Record<string, unknown>;
      const shot: Shot = {
        id: str(h.id, uid('sh'), 40),
        dur: num(h.dur, 4, 0.5, 60),
        transition: { kind: (str(tr.kind, 'cut') as TransitionKind) || 'cut', dur: num(tr.dur, 0.5, 0.1, 3) },
        cam: arr<CamKey>(h.cam).map((k) => ({ ...k, t: num(k.t, 0, 0, 60), x: num(k.x, 8), y: num(k.y, 4.5), zoom: num(k.zoom, 1, 0.3, 6), ease: k.ease ?? 'inout' })),
        actors: arr<ActorTrack>(h.actors).map((a) => ({
          cast: str(a.cast, '', 40),
          keys: arr<ActorKey>(a.keys).map((k) => ({ ...defaultKey(8), ...k, t: num(k.t, 0, 0, 60), x: num(k.x, 8, -4, 20), z: num(k.z, 0, -4, 4), y: num(k.y, 0, -2, 8) })),
        })),
        lines: arr<Line>(h.lines).map((l) => ({
          ...l,
          id: str(l.id, uid('ln'), 40),
          t: num(l.t, 0, 0, 60),
          dur: num(l.dur, 2, 0.3, 30),
          text: str(l.text, '', 140),
          style: l.style ?? 'speech',
          face: parseFaceTake(l.face),
          cut: Array.isArray(l.cut) && l.cut.length === 2 ? [num(l.cut[0], 0, 0, 60), num(l.cut[1], 60, 0, 60)] : undefined,
        })),
        fx: arr<FxEvent>(h.fx).map((f) => ({ ...f, id: str(f.id, uid('fx'), 40), t: num(f.t, 0, 0, 60), dur: num(f.dur, 1, 0.1, 60) })),
        sfx: arr<SfxEvent>(h.sfx).map((f) => ({ ...f, id: str(f.id, uid('sf'), 40), t: num(f.t, 0, 0, 60), vol: num(f.vol, 1, 0, 1) })),
      };
      if (!shot.cam.length) shot.cam = newShot().cam;
      return shot;
    }),
  }));
  p.scenes = p.scenes.filter((s) => s.shots.length);
  if (!p.scenes.length) p.scenes = [newScene()];
  return p;
}

export function parseFaceTake(raw: unknown): FaceTake | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const hz = num(o.hz, 20, 10, 30);
  const q = typeof o.q === 'string' && /^[A-Za-z0-9+/=]*$/.test(o.q) ? o.q : '';
  const maxN = Math.ceil(hz * MAX_FACE_SEC) + 2;
  const n = Math.min(maxN, Math.floor(num(o.n, 0, 0, maxN)), Math.floor((q.length * 3) / 4 / FACE_CH.length));
  if (n < 2) return undefined;
  return { hz, n, q, only: o.only === 'mouth' ? 'mouth' : undefined };
}

const POSE_IDS = new Set(['stand', 'walk', 'run', 'wave', 'point', 'sit', 'jump', 'dance', 'lie', 'hug', 'facepalm', 'think', 'cheer', 'shrug', 'bow', 'clap', 'scared', 'spin', 'flex', 'sneak']);
const EXPR_IDS = new Set(['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy', 'love', 'laughing', 'crying', 'thinking', 'scared', 'smug', 'wink', 'dizzy', 'shy', 'confused']);

export function parseBoard(raw: unknown): Board | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const scenes = arr<Record<string, unknown>>(o.scenes)
    .slice(0, BOARD_MAX_SCENES)
    .map((s) => ({
      id: str(s.id, uid('sc'), 40) || uid('sc'),
      bg: str(s.bg, 'park', 40) || 'park',
      light: (s.light === 'night' || s.light === 'dusk' ? s.light : 'day') as BoardScene['light'],
      chars: arr<Record<string, unknown>>(s.chars)
        .slice(0, BOARD_MAX_CHARS)
        .map((c) => ({
          cast: str(c.cast, '', 40),
          x: num(c.x, 8, -1, 17),
          z: num(c.z, 0, -3, 3),
          face: (c.face === 1 || c.face === -1 ? c.face : 0) as -1 | 0 | 1,
          pose: (POSE_IDS.has(c.pose as string) ? c.pose : 'stand') as PoseId,
          expr: (EXPR_IDS.has(c.expr as string) ? c.expr : 'happy') as ExprId,
        }))
        .filter((c) => c.cast),
      lines: arr<Record<string, unknown>>(s.lines)
        .slice(0, BOARD_MAX_LINES)
        .map((l) => ({
          id: str(l.id, uid('ln'), 40) || uid('ln'),
          cast: typeof l.cast === 'string' && l.cast ? l.cast.slice(0, 40) : undefined,
          text: str(l.text, '', 140),
          audio: typeof l.audio === 'string' && l.audio ? l.audio.slice(0, 40) : undefined,
          cut: Array.isArray(l.cut) && l.cut.length === 2 ? ([num(l.cut[0], 0, 0, 60), num(l.cut[1], 60, 0, 60)] as [number, number]) : undefined,
        })),
    }));
  if (!scenes.length) return undefined;
  return { v: 1, scenes, sig: typeof o.sig === 'string' ? o.sig.slice(0, 40) : undefined };
}
