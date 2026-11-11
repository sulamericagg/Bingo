/* ============================================================
 *  BLOOP CINEMA — roteiro (StorySpec, shared/story.ts) → projeto.
 *  Cada fala vira um plano: quem fala ganha pose/expressão, entra
 *  ou sai andando; a câmera alterna geral / close / dois; efeitos e
 *  sons entram no começo da fala; música de fundo grátis.
 * ============================================================ */
import type { StoryBeat, StorySpec } from '../../shared/story';
import { clone, newProject, newShot, uid, type ActorKey, type CastMember, type ExprId, type FxKind, type Mode, type PoseId, type Project, type Scene, type Shot } from './format';
import { FX_ON_ACTOR, presetById } from './data';
import { VOICE_RATE } from './engine';
import { youCast } from './sheets';
import { clipBuffer } from './audio';

/** pose automática para a expressão (quando o roteiro não diz) */
const POSE_FOR: Partial<Record<ExprId, PoseId>> = {
  happy: 'wave',
  laughing: 'cheer',
  sad: 'stand',
  crying: 'stand',
  angry: 'point',
  surprised: 'jump',
  scared: 'scared',
  love: 'hug',
  thinking: 'think',
  confused: 'shrug',
  smug: 'flex',
  shy: 'stand',
  sleepy: 'sit',
  dizzy: 'spin',
};
/** efeito automático para a expressão */
const FX_FOR: Partial<Record<ExprId, FxKind>> = { love: 'hearts', angry: 'anger', scared: 'sweat', dizzy: 'stars', surprised: 'zoomlines' };

export function castFromRef(ref: string, name?: string): CastMember {
  if (ref === 'you') {
    const c = youCast();
    if (name) c.name = name.slice(0, 14);
    return c;
  }
  const p = presetById(ref) ?? presetById('pipoca')!;
  return { id: uid('c'), name: (name || p.name).slice(0, 14), kind: 'avatar', avatar: clone(p.av), voice: 'normal' };
}

const slots = (n: number): number[] => (n <= 1 ? [8] : n === 2 ? [5.4, 10.6] : n === 3 ? [4, 8, 12] : [3.2, 6.4, 9.6, 12.8]);

function beatDur(b: StoryBeat, cast: CastMember | undefined): number {
  const buf = b.audio ? clipBuffer(b.audio) : undefined;
  const rate = VOICE_RATE[cast?.voice ?? 'normal'] ?? 1;
  const speak = buf ? buf.duration / rate + 0.2 : Math.max(1.8, Math.min(5, b.text.length * 0.075 + 0.8));
  return speak;
}

export interface BuildOpts {
  mode?: Mode;
  /** reaproveita o elenco (re-edição: mantém maquiagem, nomes...) */
  cast?: CastMember[];
  /** projeto a atualizar (mantém id, título, datas) */
  into?: Project;
}

export function buildFromSpec(spec: StorySpec, o: BuildOpts = {}): Project {
  const p = o.into ?? newProject(spec.title, o.mode ?? '2d');
  p.title = o.into ? p.title : spec.title;
  const cast = spec.cast.map((c, i) => o.cast?.[i] ?? castFromRef(c.ref, c.name));
  p.cast = cast;
  const xs = slots(cast.length);
  const scenes: Scene[] = [];
  spec.scenes.forEach((sc, si) => {
    const shots: Shot[] = [];
    let camTurn = 0;
    sc.beats.forEach((b, bi) => {
      const sp = b.who >= 0 ? cast[b.who] : undefined;
      const enter = b.move === 'enter' && sp;
      const exit = b.move === 'exit' && sp;
      const lineT = enter ? 1.2 : 0.3;
      const ld = beatDur(b, sp);
      const dur = Math.round((lineT + ld + (exit ? 1.4 : 0.5)) * 10) / 10;
      const h = newShot(dur);
      if (bi === 0 && si > 0) h.transition = { kind: 'fade', dur: 0.8 };
      else if (bi > 0 && b.cam === 'wide') h.transition = { kind: 'dissolve', dur: 0.4 };
      const expr: ExprId = (b.expr as ExprId) ?? (sp ? 'happy' : 'neutral');
      // atores
      h.actors = cast.map((c, ci) => {
        const x = xs[ci];
        const isSp = c === sp;
        const face: -1 | 0 | 1 = sp && !isSp ? (xs[b.who] > x ? 1 : -1) : x < 8 ? 1 : x > 8 ? -1 : 0;
        const listenExpr: ExprId = expr === 'sad' || expr === 'crying' ? 'sad' : expr === 'scared' ? 'scared' : expr === 'laughing' ? 'happy' : expr === 'angry' ? 'surprised' : 'neutral';
        const k = (t: number, kx: number, pose: PoseId, e: ExprId, f: -1 | 0 | 1): ActorKey => ({ t, x: kx, y: 0, z: 0, face: f, pose, expr: e, ease: 'inout' });
        if (!isSp) return { cast: c.id, keys: [k(0, x, 'stand', listenExpr, face)] };
        const pose: PoseId = (b.pose as PoseId) ?? POSE_FOR[expr] ?? 'stand';
        const keys: ActorKey[] = [];
        if (enter) {
          const from = x < 8 ? -1.5 : 17.5;
          keys.push(k(0, from, 'stand', expr, from < x ? 1 : -1), k(1.1, x, 'stand', expr, 0), k(lineT, x, pose, expr, 0));
        } else keys.push(k(0, x, 'stand', expr, 0), k(lineT, x, pose, expr, 0));
        if (exit) {
          const to = x < 8 ? -1.5 : 17.5;
          keys.push(k(dur - 1.2, x, 'stand', expr, 0), k(dur, to, 'stand', expr, to < x ? -1 : 1));
        }
        return { cast: c.id, keys };
      });
      // câmera
      const cam = b.cam ?? (bi === 0 ? 'wide' : sp ? (['close', 'two', 'close', 'wide'] as const)[camTurn++ % 4] : 'wide');
      if (cam === 'close' && sp) h.cam = [{ t: 0, x: xs[b.who], y: 4.6, zoom: 2.1, focus: sp.id, p3: 'closeup', ease: 'inout' }];
      else if (cam === 'two' && sp) {
        const other = xs[(b.who + 1) % cast.length];
        h.cam = [
          { t: 0, x: (xs[b.who] + other) / 2, y: 4.8, zoom: 1.35, p3: 'ots', focus2: cast[(b.who + 1) % cast.length].id, ease: 'inout' },
          { t: dur, x: (xs[b.who] + other) / 2, y: 4.7, zoom: 1.5, p3: 'ots', focus2: cast[(b.who + 1) % cast.length].id, ease: 'inout' },
        ];
      } else h.cam = [{ t: 0, x: 8, y: 4.5, zoom: 1, p3: 'wide', ease: 'inout' }, { t: dur, x: 8, y: 4.6, zoom: 1.08, p3: 'wide', ease: 'inout' }];
      // fala
      h.lines = [{ id: uid('ln'), t: lineT, dur: Math.round(ld * 10) / 10, cast: sp?.id, text: b.text, style: sp ? (expr === 'angry' || expr === 'surprised' ? 'shout' : expr === 'thinking' ? 'think' : 'speech') : 'narration', audio: b.audio }];
      const fx = (b.fx as FxKind | undefined) ?? FX_FOR[expr];
      if (fx) h.fx = [{ id: uid('fx'), t: lineT, dur: Math.min(2.2, ld + 0.4), kind: fx, cast: FX_ON_ACTOR.has(fx) ? sp?.id : undefined }];
      if (b.sfx) h.sfx = [{ id: uid('sf'), t: Math.max(0, lineT - 0.1), sfx: b.sfx, vol: 0.85 }];
      shots.push(h);
    });
    if (shots.length) scenes.push({ id: uid('sc'), name: '', bg: sc.bg, light: sc.light ?? 'day', shots });
  });
  if (scenes.length) p.scenes = scenes;
  p.music = { song: spec.song ?? 'free-02', offset: 8, vol: 0.45 };
  p.story = clone(spec);
  p.updated = Date.now();
  return p;
}
