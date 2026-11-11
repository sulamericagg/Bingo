/* ============================================================
 *  BLOOP CINEMA — MODO FÁCIL: quadro de cenas ("story board").
 *  Cada cena = fundo + personagens parados (lugar, pose, rosto) +
 *  até 3 falas. Daqui sai o filme completo (cenas → planos) com
 *  câmera e transições automáticas: uma fala = um plano; a câmera
 *  alterna geral / perto de quem fala; troca de cena = esmaecer.
 *  Sem DOM (só o `youCast` do elenco).
 * ============================================================ */
import { t } from '../i18n';
import { VOICE_RATE } from './engine';
import {
  BOARD_MAX_CHARS,
  newProject,
  STAGE_W,
  uid,
  type ActorKey,
  type BoardChar,
  type BoardLine,
  type BoardScene,
  type CamKey,
  type CastMember,
  type ExprId,
  type Line,
  type PoseId,
  type Project,
  type Scene,
  type Shot,
} from './format';
import { castFromRef } from './storybuild';

/** posições automáticas para n personagens */
export const SLOTS = (n: number): number[] => (n <= 1 ? [8] : n === 2 ? [5.2, 10.8] : n === 3 ? [3.8, 8, 12.2] : [3, 6.3, 9.7, 13]);

/** Tempo de fala (s) de uma linha do quadro, sem a velocidade da voz. */
export function lineSpeech(l: BoardLine, cast?: CastMember): number {
  const rate = VOICE_RATE[cast?.voice ?? 'normal'] ?? 1;
  if (l.audio && l.cut) return Math.max(0.4, (l.cut[1] - l.cut[0]) / rate) + 0.15;
  if (!l.text.trim()) return 1.8; // improviso ainda sem voz: um espacinho
  return textPace(l.text);
}
/** Ritmo de leitura do texto (o teleprompter usa o mesmo). */
export const textPace = (text: string): number => Math.max(1.6, Math.min(7, text.trim().length * 0.075 + 0.8));

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export const scenesSig = (p: Project): string => hash(JSON.stringify(p.scenes));

/** O modo avançado mexeu nas cenas depois do último "montar"? */
export const boardDetached = (p: Project): boolean => !!p.board?.sig && p.board.sig !== scenesSig(p);

const key = (t0: number, c: BoardChar, pose: PoseId, expr: ExprId, face: -1 | 0 | 1): ActorKey => ({ t: t0, x: c.x, y: 0, z: c.z, face, pose, expr, ease: 'inout' });

/** quem fala olha para os outros; quem escuta olha para quem fala */
function faceFor(c: BoardChar, sp: BoardChar | undefined): -1 | 0 | 1 {
  if (c.face !== 0) return c.face;
  if (sp && sp !== c) return sp.x > c.x ? 1 : -1;
  return c.x < STAGE_W / 2 - 0.5 ? 1 : c.x > STAGE_W / 2 + 0.5 ? -1 : 0;
}

/** Monta `p.scenes` a partir de `p.board` (câmera e transições automáticas). */
export function buildFromBoard(p: Project): Project {
  const b = p.board;
  if (!b) return p;
  const castOk = new Set(p.cast.map((c) => c.id));
  const scenes: Scene[] = [];
  b.scenes.forEach((bs, si) => {
    const chars = bs.chars.filter((c) => castOk.has(c.cast));
    const shots: Shot[] = [];
    const lines = bs.lines.length ? bs.lines : [null];
    let turn = 0;
    lines.forEach((l, li) => {
      const sp = l?.cast ? chars.find((c) => c.cast === l.cast) : undefined;
      const cast = l?.cast ? p.cast.find((c) => c.id === l.cast) : undefined;
      const first = li === 0;
      const lineT = first && si > 0 ? 0.8 : first ? 0.4 : 0.25;
      const speech = l ? lineSpeech(l, cast) : 2.6;
      const dur = Math.round((lineT + speech + 0.45) * 10) / 10;
      const h: Shot = {
        id: 'sh' + (l?.id ?? bs.id),
        dur,
        transition: first && si > 0 ? { kind: 'fade', dur: 0.7 } : { kind: 'cut', dur: 0.5 },
        cam: [],
        actors: chars.map((c) => {
          const isSp = c === sp;
          const f = faceFor(c, sp);
          // quem fala dá um "pulinho" de atenção: começa em pé e vai para a pose escolhida
          const keys = isSp && c.pose !== 'stand' && c.pose !== 'sit' && c.pose !== 'lie' ? [key(0, c, 'stand', c.expr, f), key(Math.max(0.1, lineT - 0.1), c, c.pose, c.expr, f)] : [key(0, c, c.pose, c.expr, f)];
          return { cast: c.cast, keys };
        }),
        lines: [],
        fx: [],
        sfx: [],
      };
      // câmera automática
      const wide = (z0: number, z1: number): CamKey[] => [
        { t: 0, x: chars.length === 1 ? chars[0].x : 8, y: 4.5, zoom: z0, p3: 'wide', ease: 'inout' },
        { t: dur, x: chars.length === 1 ? chars[0].x : 8, y: 4.6, zoom: z1, p3: 'wide', ease: 'inout' },
      ];
      const style = first ? 'wide' : sp && chars.length > 1 ? (['close', 'two', 'close', 'wide'] as const)[turn++ % 4] : 'wide';
      if (chars.length === 1) h.cam = wide(1.3, 1.4);
      else if (style === 'close' && sp) h.cam = [{ t: 0, x: sp.x, y: 4.7, zoom: 1.9, focus: sp.cast, p3: 'closeup', ease: 'inout' }, { t: dur, x: sp.x, y: 4.7, zoom: 2.05, focus: sp.cast, p3: 'closeup', ease: 'inout' }];
      else if (style === 'two' && sp) {
        const other = chars.filter((c) => c !== sp).sort((a, c) => Math.abs(a.x - sp.x) - Math.abs(c.x - sp.x))[0];
        const cx = other ? (sp.x + other.x) / 2 : sp.x;
        h.cam = [
          { t: 0, x: cx, y: 4.8, zoom: 1.35, p3: 'ots', focus2: other?.cast, ease: 'inout' },
          { t: dur, x: cx, y: 4.7, zoom: 1.45, p3: 'ots', focus2: other?.cast, ease: 'inout' },
        ];
      } else h.cam = wide(1, 1.06);
      if (l) {
        const ln: Line = {
          id: l.id,
          t: lineT,
          dur: Math.round(speech * 10) / 10,
          cast: sp ? sp.cast : undefined,
          text: l.text,
          style: sp ? (/!$/.test(l.text.trim()) && l.text.trim().length < 30 ? 'shout' : 'speech') : 'narration',
        };
        if (l.audio) ln.audio = l.audio;
        if (l.audio && l.cut) ln.cut = l.cut;
        h.lines = [ln];
      }
      shots.push(h);
    });
    scenes.push({ id: bs.id, name: '', bg: bs.bg, light: bs.light, shots });
  });
  if (scenes.length) p.scenes = scenes;
  b.sig = scenesSig(p);
  return p;
}

/* ---------------------------- edição do quadro ---------------------------- */

export function newBoardScene(p: Project, after?: BoardScene): BoardScene {
  const bgs = ['park', 'bedroom', 'beach', 'kitchen', 'space', 'castle', 'street', 'stage', 'forest', 'classroom'];
  const bg = after ? bgs[(bgs.indexOf(after.bg) + 1) % bgs.length] : 'park';
  const chars: BoardChar[] = after
    ? after.chars.map((c) => ({ ...c, pose: 'stand', expr: 'happy' }))
    : p.cast.slice(0, 2).map((c, i, a) => ({ cast: c.id, x: SLOTS(a.length)[i], z: 0, face: 0, pose: 'stand', expr: 'happy' }));
  return { id: uid('sc'), bg, light: 'day', chars, lines: [] };
}

/** Lugar livre para quem entra na cena. */
export function freeSlot(sc: BoardScene): number {
  const used = sc.chars.map((c) => c.x);
  return [5.2, 10.8, 8, 3, 13, 6.5, 9.5].find((x) => used.every((u) => Math.abs(u - x) > 1.6)) ?? 8;
}

export function addChar(sc: BoardScene, castId: string): boolean {
  if (sc.chars.length >= BOARD_MAX_CHARS || sc.chars.some((c) => c.cast === castId)) return false;
  sc.chars.push({ cast: castId, x: freeSlot(sc), z: 0, face: 0, pose: 'stand', expr: 'happy' });
  return true;
}

/** Acha uma fala (do quadro) pelo id. */
export function boardLine(p: Project, id: string): { sc: BoardScene; l: BoardLine } | null {
  for (const sc of p.board?.scenes ?? []) {
    const l = sc.lines.find((x) => x.id === id);
    if (l) return { sc, l };
  }
  return null;
}

export interface LineAudio {
  audio: string;
  cut: [number, number];
}

/**
 * Liga (ou tira, com null) uma gravação de voz a uma fala — no quadro (e remonta) ou direto no filme
 * (projetos do modo avançado / histórias prontas). Devolve true se achou a fala.
 */
export function applyLineAudio(p: Project, lineId: string, a: LineAudio | null): boolean {
  const bl = boardLine(p, lineId);
  if (bl && !boardDetached(p)) {
    if (a) {
      bl.l.audio = a.audio;
      bl.l.cut = a.cut;
    } else {
      delete bl.l.audio;
      delete bl.l.cut;
    }
    buildFromBoard(p);
    return true;
  }
  for (const s of p.scenes)
    for (const h of s.shots) {
      const l = h.lines.find((x) => x.id === lineId);
      if (!l) continue;
      if (a) {
        const rate = VOICE_RATE[p.cast.find((c) => c.id === l.cast)?.voice ?? 'normal'] ?? 1;
        l.audio = a.audio;
        l.cut = a.cut;
        delete l.face;
        l.dur = Math.max(0.5, Math.round(((a.cut[1] - a.cut[0]) / rate + 0.15) * 10) / 10);
        if (l.t + l.dur > h.dur) h.dur = Math.min(60, Math.ceil((l.t + l.dur + 0.3) * 10) / 10);
      } else {
        delete l.audio;
        delete l.cut;
        delete l.face;
      }
      if (bl) {
        // fala também existe no quadro (desligado): mantém os dois iguais
        if (a) Object.assign(bl.l, a);
        else {
          delete bl.l.audio;
          delete bl.l.cut;
        }
      }
      return true;
    }
  return false;
}

/* ---------------------------- começos prontos (1º uso) ---------------------------- */

export interface Starter {
  id: string;
  emoji: string;
  readonly name: string;
  build(): Project;
}

type SL = [who: 0 | 1 | -1, text: string];
interface StarterDef {
  id: string;
  emoji: string;
  name: () => string;
  friend: string;
  scenes: { bg: string; light?: 'day' | 'dusk' | 'night'; poses: [PoseId, ExprId][]; lines: () => SL[] }[];
}

const DEFS: StarterDef[] = [
  {
    id: 'picnic',
    emoji: '🧺',
    name: () => t('cin.easy.st.picnic', 'Piquenique'),
    friend: 'pipoca',
    scenes: [
      { bg: 'park', poses: [['wave', 'happy'], ['stand', 'happy']], lines: () => [[0, t('cin.easy.st.picnic1', 'Que dia lindo para um piquenique!')], [1, t('cin.easy.st.picnic2', 'Eu trouxe um bolo gigante!')]] },
      { bg: 'park', light: 'dusk', poses: [['facepalm', 'surprised'], ['dance', 'laughing']], lines: () => [[0, t('cin.easy.st.picnic3', 'Ué... cadê o bolo?')], [1, t('cin.easy.st.picnic4', 'Hehe... eu comi tudo!')]] },
    ],
  },
  {
    id: 'space',
    emoji: '🚀',
    name: () => t('cin.easy.st.space', 'Missão no espaço'),
    friend: 'robozinho',
    scenes: [
      { bg: 'space', poses: [['point', 'surprised'], ['stand', 'happy']], lines: () => [[0, t('cin.easy.st.space1', 'Olha! Um planeta novo!')], [1, t('cin.easy.st.space2', 'Bip bop! Vamos pousar?')]] },
      { bg: 'forest', poses: [['jump', 'happy'], ['dance', 'laughing']], lines: () => [[0, t('cin.easy.st.space3', 'Esse planeta tem árvores gigantes!')], [1, t('cin.easy.st.space4', 'Bip! Hora de dançar!')]] },
    ],
  },
  {
    id: 'show',
    emoji: '🎤',
    name: () => t('cin.easy.st.show', 'Show de talentos'),
    friend: 'lumi',
    scenes: [
      { bg: 'stage', light: 'night', poses: [['wave', 'happy'], ['clap', 'happy']], lines: () => [[-1, t('cin.easy.st.show1', 'Bem-vindos ao show de talentos!')], [0, t('cin.easy.st.show2', 'Eu vou cantar uma música!')]] },
      { bg: 'stage', light: 'night', poses: [['bow', 'laughing'], ['cheer', 'love']], lines: () => [[1, t('cin.easy.st.show3', 'Bravo! Foi incrível!')], [0, t('cin.easy.st.show4', 'Obrigado, galera!')]] },
    ],
  },
];

function fromDef(d: StarterDef | null): Project {
  const p = newProject(d ? d.name() : t('cin.easy.untitled', 'Minha história'), '2d');
  const me = castFromRef('you');
  const friend = castFromRef(d?.friend ?? 'pipoca');
  p.cast = [me, friend];
  const xs = SLOTS(2);
  const scenes: BoardScene[] = (d?.scenes ?? [{ bg: 'park', poses: [['wave', 'happy'], ['stand', 'happy']] as [PoseId, ExprId][], lines: () => [[0, '']] as SL[] }]).map((s) => ({
    id: uid('sc'),
    bg: s.bg,
    light: s.light ?? 'day',
    chars: [me, friend].map((c, i) => ({ cast: c.id, x: xs[i], z: 0, face: 0, pose: s.poses[i][0], expr: s.poses[i][1] })),
    lines: s.lines().map(([who, text]) => ({ id: uid('ln'), cast: who >= 0 ? [me, friend][who].id : undefined, text })),
  }));
  p.board = { v: 1, scenes };
  p.music = { song: 'free-02', offset: 8, vol: 0.4 };
  return buildFromBoard(p);
}

export const STARTERS: Starter[] = DEFS.map((d) => ({
  id: d.id,
  emoji: d.emoji,
  get name() {
    return d.name();
  },
  build: () => fromDef(d),
}));

/** Começo "do zero": uma cena no parque com você + Pipoca e uma fala vazia. */
export const blankBoard = (): Project => fromDef(null);
