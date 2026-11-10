/* ============================================================
 *  BLOOP CINEMA — estado do editor (projeto aberto, tempo, seleção,
 *  desfazer/refazer, salvamento automático) e operações de edição.
 * ============================================================ */
import { t } from '../i18n';
import { notify } from '../ui/notify';
import { evalActors, Renderer } from './engine';
import { clone, defaultKey, projectDuration, STAGE_W, uid, type ActorKey, type ActorTrack, type CamKey, type Project, type Shot, type ShotRef } from './format';
import { maxSeconds, paywall } from './gates';
import { saveProject } from './store';

export type Tab = 'scene' | 'cast' | 'actor' | 'lines' | 'camera' | 'fx' | 'sound' | 'shot';

export interface EditorState {
  p: Project;
  r: Renderer;
  T: number;
  playing: boolean;
  sel: string | null;
  selLine: string | null;
  tab: Tab;
  hist: string[];
  hi: number;
  /** redesenhar a prévia no próximo quadro */
  dirty: boolean;
  /** UI que depende do projeto precisa ser refeita */
  uiDirty: boolean;
}

export const S: EditorState = {
  p: null as unknown as Project,
  r: null as unknown as Renderer,
  T: 0,
  playing: false,
  sel: null,
  selLine: null,
  tab: 'actor',
  hist: [],
  hi: -1,
  dirty: true,
  uiDirty: true,
};

const listeners = new Set<() => void>();
export const onChange = (f: () => void): (() => void) => (listeners.add(f), () => listeners.delete(f));
function emit(): void {
  S.dirty = true;
  S.uiDirty = true;
  listeners.forEach((f) => f());
}

export function openState(p: Project, r: Renderer): void {
  S.p = p;
  S.r = r;
  S.T = 0;
  S.playing = false;
  S.sel = p.cast[0]?.id ?? null;
  S.selLine = null;
  S.hist = [JSON.stringify(p)];
  S.hi = 0;
  S.dirty = S.uiDirty = true;
}

/* ---------------------------- salvar ---------------------------- */
let saveT = 0;
let saving: Promise<void> = Promise.resolve();
export function scheduleSave(): void {
  clearTimeout(saveT);
  saveT = window.setTimeout(flushSave, 700);
}
export function flushSave(thumb = ''): Promise<void> {
  clearTimeout(saveT);
  if (!S.p) return saving;
  const p = S.p;
  saving = saving.then(() => saveProject(p, thumb));
  return saving;
}

/* ---------------------------- edição ---------------------------- */
let lastLimitWarn = 0;
/**
 * Altera o projeto. `commit` = entra no desfazer (sliders mandam false enquanto arrastam
 * e true ao soltar). Se passar do limite de duração do plano grátis, desfaz e avisa.
 */
export function mutate(fn: (p: Project) => void, commit = true): void {
  const before = S.hist[S.hi];
  fn(S.p);
  S.r.refresh();
  if (projectDuration(S.p) > maxSeconds() + 1e-6) {
    // volta ao último estado válido
    const prev = JSON.parse(before) as Project;
    Object.assign(S.p, prev);
    S.r.setProject(S.p);
    if (Date.now() - lastLimitWarn > 1500) {
      lastLimitWarn = Date.now();
      paywall('time');
    }
    emit();
    return;
  }
  if (commit) {
    const js = JSON.stringify(S.p);
    if (js !== S.hist[S.hi]) {
      S.hist = S.hist.slice(0, S.hi + 1);
      S.hist.push(js);
      if (S.hist.length > 60) S.hist.shift();
      S.hi = S.hist.length - 1;
    }
    scheduleSave();
  }
  emit();
}

function restore(js: string): void {
  const p = JSON.parse(js) as Project;
  Object.keys(S.p).forEach((k) => delete (S.p as unknown as Record<string, unknown>)[k]);
  Object.assign(S.p, p);
  S.r.setProject(S.p);
  if (S.sel && !S.p.cast.find((c) => c.id === S.sel)) S.sel = S.p.cast[0]?.id ?? null;
  S.T = Math.min(S.T, Math.max(0, S.r.duration() - 0.01));
  scheduleSave();
  emit();
}
export const canUndo = (): boolean => S.hi > 0;
export const canRedo = (): boolean => S.hi < S.hist.length - 1;
export function undo(): void {
  if (!canUndo()) return;
  S.hi--;
  restore(S.hist[S.hi]);
}
export function redo(): void {
  if (!canRedo()) return;
  S.hi++;
  restore(S.hist[S.hi]);
}

/* ---------------------------- consultas ---------------------------- */
export function cur(): { ref: ShotRef; local: number } {
  return S.r.refAt(S.T) ?? { ref: S.r.flat[0], local: 0 };
}
export const curShot = (): Shot => cur().ref.shot;
export const castById = (id: string | null | undefined) => (id ? S.p.cast.find((c) => c.id === id) : undefined);
export const trackOf = (shot: Shot, castId: string | null): ActorTrack | undefined => (castId ? shot.actors.find((a) => a.cast === castId) : undefined);

export function setTime(T: number): void {
  S.T = Math.max(0, Math.min(T, Math.max(0, S.r.duration() - 0.001)));
  S.dirty = true;
  listeners.forEach((f) => f());
}

/** Vai para o plano gi (um pouquinho depois do início, fora da transição). */
export function gotoShot(gi: number): void {
  const r = S.r.flat[gi];
  if (!r) return;
  const tr = r.shot.transition.kind === 'cut' ? 0 : Math.min(r.shot.dur * 0.5, r.shot.transition.dur);
  setTime(r.start + tr + 0.001);
}

/* ---------------------------- chaves dos atores ---------------------------- */
const NEAR = 0.06;

/**
 * Edição "auto-chave": muda o ator no instante atual. Se já há chave ali, altera;
 * senão cria uma com o estado avaliado agora e aplica a mudança.
 */
export function editActorKey(castId: string, change: Partial<ActorKey>, commit = true): void {
  const { ref, local } = cur();
  mutate(() => {
    const shot = ref.shot;
    let tr = trackOf(shot, castId);
    if (!tr) {
      tr = { cast: castId, keys: [{ ...defaultKey(freeX(shot)), t: 0 }] };
      shot.actors.push(tr);
    }
    let k = tr.keys.find((x) => Math.abs(x.t - local) < NEAR);
    if (!k) {
      const ev = evalActors(S.p, ref, local).find((a) => a.cast.id === castId);
      const base = tr.keys.filter((x) => x.t <= local).pop() ?? tr.keys[0];
      k = { ...base, t: Math.round(local * 100) / 100, x: ev?.x ?? base.x, y: ev?.y ?? base.y, z: ev?.z ?? base.z, face: base.face };
      tr.keys.push(k);
      tr.keys.sort((a, b) => a.t - b.t);
    }
    Object.assign(k, change);
  }, commit);
}

export function deleteActorKey(castId: string): boolean {
  const { ref, local } = cur();
  const tr = trackOf(ref.shot, castId);
  if (!tr) return false;
  const i = tr.keys.findIndex((x) => Math.abs(x.t - local) < NEAR);
  if (i < 0 || tr.keys.length <= 1) return false;
  mutate(() => tr.keys.splice(i, 1));
  return true;
}

/** x livre no palco para alguém que entra no plano. */
export function freeX(shot: Shot): number {
  const used = shot.actors.map((a) => a.keys[0]?.x ?? 8);
  const spots = [5, 11, 8, 3, 13, 6.5, 9.5, 1.5, 14.5];
  return spots.find((x) => used.every((u) => Math.abs(u - x) > 1.4)) ?? 8;
}

export function addToShot(castId: string, shot = curShot()): void {
  if (trackOf(shot, castId)) return;
  const x = freeX(shot);
  mutate(() => shot.actors.push({ cast: castId, keys: [{ ...defaultKey(x), face: x < STAGE_W / 2 ? 1 : -1 }] }));
}
export function removeFromShot(castId: string, shot = curShot()): void {
  mutate(() => {
    shot.actors = shot.actors.filter((a) => a.cast !== castId);
    shot.lines.forEach((l) => l.cast === castId && (l.cast = undefined));
  });
}

/* ---------------------------- câmera ---------------------------- */
export function editCamKey(change: Partial<CamKey>, commit = true): void {
  const { ref, local } = cur();
  mutate(() => {
    const keys = ref.shot.cam;
    let k = keys.find((x) => Math.abs(x.t - local) < NEAR);
    if (!k) {
      const base = keys.filter((x) => x.t <= local).pop() ?? keys[0];
      k = { ...base, t: Math.round(local * 100) / 100 };
      keys.push(k);
      keys.sort((a, b) => a.t - b.t);
    }
    Object.assign(k, change);
    if (change.focus === '') delete k.focus;
  }, commit);
}

/* ---------------------------- planos ---------------------------- */
/** Novo plano depois do atual, com os atores onde terminaram (continuidade). */
export function addShotAfter(): void {
  const { ref } = cur();
  mutate((p) => {
    const sc = p.scenes[ref.si];
    const prev = ref.shot;
    const end = prev.dur - 0.001;
    const ev = evalActors(p, ref, end);
    const sh: Shot = {
      id: uid('sh'),
      dur: 4,
      transition: { kind: 'cut', dur: 0.5 },
      cam: [{ t: 0, x: 8, y: 4.5, zoom: 1, p3: 'wide', ease: 'inout' }],
      actors: ev.map((a) => ({ cast: a.cast.id, keys: [{ t: 0, x: a.x, y: 0, z: a.z, face: a.face, pose: a.pose === 'walk' || a.pose === 'run' ? 'stand' : a.pose, expr: a.expr, ease: 'inout' }] })),
      lines: [],
      fx: [],
      sfx: [],
    };
    sc.shots.splice(ref.hi + 1, 0, sh);
  });
  gotoShot(cur().ref.gi + 1);
}

export function duplicateShot(): void {
  const { ref } = cur();
  mutate((p) => {
    const c = clone(ref.shot);
    c.id = uid('sh');
    c.lines.forEach((l) => (l.id = uid('ln')));
    c.fx.forEach((f) => (f.id = uid('fx')));
    c.sfx.forEach((f) => (f.id = uid('sf')));
    p.scenes[ref.si].shots.splice(ref.hi + 1, 0, c);
  });
  gotoShot(cur().ref.gi + 1);
}

export function deleteShot(): void {
  const { ref } = cur();
  if (S.r.flat.length <= 1) {
    notify(t('cin.ed.lastShot', 'O filme precisa de pelo menos um plano.'), { kind: 'warn' });
    return;
  }
  mutate((p) => {
    const sc = p.scenes[ref.si];
    sc.shots.splice(ref.hi, 1);
    if (!sc.shots.length) p.scenes.splice(ref.si, 1);
  });
  gotoShot(Math.max(0, ref.gi - 1));
}

export function moveShot(dir: -1 | 1): void {
  const { ref } = cur();
  const sc = S.p.scenes[ref.si];
  const j = ref.hi + dir;
  if (j < 0 || j >= sc.shots.length) return;
  mutate(() => {
    const [s] = sc.shots.splice(ref.hi, 1);
    sc.shots.splice(j, 0, s);
  });
  gotoShot(ref.gi + dir);
}

export function addScene(bg: string): void {
  const { ref } = cur();
  mutate((p) => {
    const sh: Shot = { id: uid('sh'), dur: 4, transition: { kind: 'fade', dur: 0.8 }, cam: [{ t: 0, x: 8, y: 4.5, zoom: 1, p3: 'wide', ease: 'inout' }], actors: [], lines: [], fx: [], sfx: [] };
    p.scenes.splice(ref.si + 1, 0, { id: uid('sc'), name: '', bg, light: 'day', shots: [sh] });
  });
  const first = S.r.flat.find((r) => r.si === ref.si + 1);
  if (first) gotoShot(first.gi);
}
