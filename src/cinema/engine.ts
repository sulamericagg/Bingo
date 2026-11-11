/* ============================================================
 *  BLOOP CINEMA — motor: avalia a linha do tempo num instante T
 *  (atores, câmera, falas, efeitos) e desenha o quadro (2D ou 3D)
 *  com transições, balões e marca d'água. Puro: o mesmo T sempre
 *  gera o mesmo quadro (editor, reprodução e exportação).
 * ============================================================ */
import { t } from '../i18n';
import { BG_H, BG_W, BG_X0, BG_Y0, drawBg } from './bg2d';
import { FLOOR_Y, flatShots, STAGE_H, STAGE_W, type ActorKey, type CamKey, type CastMember, type Ease, type FaceFrame, type ExprId, type PoseId, type Project, type Shot, type ShotRef, type VoiceFxId } from './format';
import { drawBubbles, drawFx, drawWatermark, shakeOffset, type ActorScreen, type BubbleIn } from './fx2d';
import { blendRig, blinkAt, drawActor2D, restRig, type Rig } from './rig2d';
import { sampleTake } from './facetake';

/* ---------------------------- easing ---------------------------- */
export function ease(e: Ease, u: number): number {
  u = Math.max(0, Math.min(1, u));
  switch (e) {
    case 'linear':
      return u;
    case 'in':
      return u * u * u;
    case 'out':
      return 1 - Math.pow(1 - u, 3);
    case 'back': {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
    }
    case 'bounce': {
      const n = 7.5625;
      const d = 2.75;
      if (u < 1 / d) return n * u * u;
      if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
      if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
      return n * (u -= 2.625 / d) * u + 0.984375;
    }
    case 'step':
      return u < 1 ? 0 : 1;
    default:
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const VOICE_RATE: Record<VoiceFxId, number> = { normal: 1, chipmunk: 1.45, deep: 0.78, robot: 1, echo: 1, giant: 0.62 };

/* ---------------------------- envelopes de voz ---------------------------- */
export interface VoiceEnv {
  /** volume 0..1 a 50 Hz (na velocidade original) */
  env: Float32Array;
  dur: number;
}
const envs = new Map<string, VoiceEnv>();
export const setVoiceEnv = (id: string, e: VoiceEnv): void => void envs.set(id, e);
export const voiceEnv = (id: string): VoiceEnv | undefined => envs.get(id);

/* ---------------------------- atores ---------------------------- */
export interface ActorEval {
  cast: CastMember;
  x: number;
  y: number;
  z: number;
  face: -1 | 0 | 1;
  pose: PoseId;
  prevPose: PoseId;
  poseW: number;
  expr: ExprId;
  talk: number;
  blink: number;
  /** tempo de animação (global, contínuo entre cortes) */
  at: number;
  moving: boolean;
  seed: number;
  /** captura de rosto tocando agora (sobrepõe só os canais do rosto) */
  cap?: FaceFrame | null;
  /** captura só da boca + cabeça (olhos seguem a expressão) */
  capMouth?: boolean;
}

/** Captura de rosto de `castId` no tempo local `tl` (fala com `face`). */
function faceAt(shot: Shot, castId: string, tl: number, cast: CastMember): { f: FaceFrame; mouth: boolean } | null {
  for (const l of shot.lines) {
    if (!l.face || l.cast !== castId || tl < l.t || tl > l.t + l.dur) continue;
    const rate = VOICE_RATE[cast.voice] ?? 1;
    const s = (tl - l.t) * rate + (l.cut?.[0] ?? 0);
    if (l.cut && s > l.cut[1]) return null;
    const f = sampleTake(l.face, s);
    return f ? { f, mouth: l.face.only === 'mouth' } : null;
  }
  return null;
}

const POSE_BLEND = 0.35;

function keyIndex(keys: ActorKey[] | CamKey[], tl: number): number {
  let i = 0;
  for (let k = 0; k < keys.length; k++) if (keys[k].t <= tl + 1e-6) i = k;
  return i;
}

function talkLevel(shot: Shot, castId: string, tl: number, cast: CastMember): number {
  for (const l of shot.lines) {
    if (l.cast !== castId || tl < l.t || tl > l.t + l.dur) continue;
    const u = tl - l.t;
    if (l.audio) {
      const e = envs.get(l.audio);
      if (e) {
        const rate = VOICE_RATE[cast.voice] ?? 1;
        const src = u * rate + (l.cut?.[0] ?? 0);
        if (l.cut && src > l.cut[1]) return 0;
        const i = Math.floor(src * 50);
        if (i >= e.env.length) return 0;
        return Math.min(1, e.env[i] * 1.6);
      }
    }
    // sem gravação: boca "silabada" pelo texto (pausa em espaços/pontuação)
    const speakDur = Math.min(l.dur, Math.max(0.6, l.text.length * 0.065));
    if (u > speakDur) return 0;
    const ci = Math.floor((u / speakDur) * l.text.length);
    const ch = l.text[ci] ?? ' ';
    if (/[\s.,!?…]/.test(ch)) return 0.05;
    return 0.25 + Math.abs(Math.sin(u * 15 + ci)) * 0.7;
  }
  return 0;
}

export function evalActors(p: Project, ref: ShotRef, tl: number): ActorEval[] {
  const out: ActorEval[] = [];
  const shot = ref.shot;
  const T = ref.start + tl;
  shot.actors.forEach((tr, idx) => {
    const cast = p.cast.find((c) => c.id === tr.cast);
    if (!cast || !tr.keys.length) return;
    const keys = tr.keys;
    const i = keyIndex(keys, tl);
    const k = keys[i];
    const n = keys[i + 1];
    let x = k.x;
    let y = k.y;
    let z = k.z;
    let moving = false;
    let face = k.face;
    let pose = k.pose;
    if (n && tl >= k.t) {
      const u = ease(n.ease, (tl - k.t) / Math.max(0.01, n.t - k.t));
      x = lerp(k.x, n.x, u);
      y = lerp(k.y, n.y, u);
      z = lerp(k.z, n.z, u);
      const dist = Math.hypot(n.x - k.x, n.z - k.z);
      if (dist > 0.05 && n.ease !== 'step') {
        moving = true;
        const speed = dist / Math.max(0.01, n.t - k.t);
        if (pose === 'stand') pose = speed > 3.2 ? 'run' : 'walk';
        if (face === 0 && Math.abs(n.x - k.x) > 0.05) face = n.x > k.x ? 1 : -1;
      }
    }
    // pose anterior (para misturar)
    let prevPose: PoseId = pose;
    let poseW = 1;
    const since = tl - k.t;
    const prevK = keys[i - 1];
    if (prevK && since < POSE_BLEND) {
      // pose "efetiva" do trecho anterior (andando se estava se movendo)
      let pp = prevK.pose;
      if (pp === 'stand' && Math.hypot(k.x - prevK.x, k.z - prevK.z) > 0.05 && k.ease !== 'step') pp = 'walk';
      prevPose = pp;
      poseW = Math.max(0, since / POSE_BLEND);
    }
    // ao parar de andar no meio do trecho
    if (n && moving && n.t - tl < 0.18 && n.pose !== pose) {
      prevPose = pose;
      pose = n.pose;
      poseW = 1 - (n.t - tl) / 0.18;
    }
    const seed = idx * 7 + cast.id.length * 3 + (cast.id.charCodeAt(cast.id.length - 1) || 0);
    const fc = cast.kind === 'avatar' ? faceAt(shot, cast.id, tl, cast) : null;
    out.push({
      cap: fc?.f ?? null,
      capMouth: fc?.mouth,
      cast,
      x,
      y,
      z,
      face,
      pose,
      prevPose,
      poseW,
      expr: k.expr,
      talk: talkLevel(shot, cast.id, tl, cast),
      blink: k.expr === 'neutral' || k.expr === 'surprised' || k.expr === 'sad' || k.expr === 'angry' ? blinkAt(T, seed) : 0,
      at: T,
      moving,
      seed,
    });
  });
  return out;
}

/* ---------------------------- câmera 2D ---------------------------- */
export interface Cam2 {
  cx: number;
  cy: number;
  zoom: number;
}
const ACTOR_H = 2.45;
export const floorOf = (z: number): number => FLOOR_Y + z * 0.45;
export const actorH = (z: number): number => ACTOR_H * (1 + z * 0.11);

function camKeyPos(k: CamKey, actors: ActorEval[]): Cam2 {
  if (k.focus) {
    const a = actors.find((s) => s.cast.id === k.focus);
    if (a) {
      const fy = floorOf(a.z) - a.y - actorH(a.z) * 0.62;
      return { cx: a.x + (k.x - STAGE_W / 2) * 0.15, cy: fy, zoom: k.zoom };
    }
  }
  return { cx: k.x, cy: k.y, zoom: k.zoom };
}

export function evalCam2(shot: Shot, tl: number, actors: ActorEval[]): Cam2 {
  const keys = shot.cam;
  if (!keys.length) return { cx: STAGE_W / 2, cy: STAGE_H / 2, zoom: 1 };
  const i = keyIndex(keys, tl);
  const a = camKeyPos(keys[i], actors);
  const n = keys[i + 1];
  let c = a;
  if (n && tl >= keys[i].t) {
    const b = camKeyPos(n, actors);
    const u = ease(n.ease, (tl - keys[i].t) / Math.max(0.01, n.t - keys[i].t));
    c = { cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), zoom: lerp(a.zoom, b.zoom, u) };
  }
  // limites do cenário
  const zoom = Math.max(0.85, Math.min(5, c.zoom));
  const hw = STAGE_W / 2 / zoom;
  const hh = STAGE_H / 2 / zoom;
  const cx = Math.max(BG_X0 + hw, Math.min(BG_X0 + BG_W - hw, c.cx));
  const cy = Math.max(BG_Y0 + hh, Math.min(BG_Y0 + BG_H - hh, c.cy));
  return { cx, cy, zoom };
}

/* ---------------------------- 3D (plugável) ---------------------------- */
export interface Renderer3D {
  /** desenha o plano em 3D no contexto 2D (W×H) e devolve onde estão os atores na tela */
  render(ctx: CanvasRenderingContext2D, W: number, H: number, p: Project, ref: ShotRef, tl: number, actors: ActorEval[], shakeX: number, shakeY: number): ActorScreen[];
  dispose(): void;
}

/* ---------------------------- render ---------------------------- */
export interface DrawOpts {
  watermark?: boolean;
  /** destaca o ator selecionado (editor) */
  selected?: string | null;
  /** 0..1 — densidade de partículas */
  budget?: number;
  /** escala de qualidade do bitmap do cenário */
  bgScale?: number;
  /** sem balões (miniaturas) */
  noBubbles?: boolean;
}

const rigTmp: Rig = restRig();

export class Renderer {
  p: Project;
  flat: ShotRef[];
  r3d: Renderer3D | null = null;
  private bufA: HTMLCanvasElement | null = null;
  private bufB: HTMLCanvasElement | null = null;
  /** última avaliação (para toques no editor) */
  lastScreens: ActorScreen[] = [];
  lastCam: Cam2 = { cx: 8, cy: 4.5, zoom: 1 };

  constructor(p: Project) {
    this.p = p;
    this.flat = flatShots(p);
  }

  setProject(p: Project): void {
    this.p = p;
    this.flat = flatShots(p);
  }
  refresh(): void {
    this.flat = flatShots(this.p);
  }
  duration(): number {
    const l = this.flat[this.flat.length - 1];
    return l ? l.start + l.shot.dur : 0;
  }
  refAt(T: number): { ref: ShotRef; local: number } | null {
    const f = this.flat;
    if (!f.length) return null;
    for (const r of f) if (T < r.start + r.shot.dur - 1e-6) return { ref: r, local: Math.max(0, T - r.start) };
    const last = f[f.length - 1];
    return { ref: last, local: Math.max(0, last.shot.dur - 1e-3) };
  }

  private buf(which: 'a' | 'b', W: number, H: number): HTMLCanvasElement {
    let c = which === 'a' ? this.bufA : this.bufB;
    if (!c) {
      c = document.createElement('canvas');
      if (which === 'a') this.bufA = c;
      else this.bufB = c;
    }
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    return c;
  }

  /** Desenha o quadro do instante T do filme. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, T: number, o: DrawOpts = {}): void {
    const at = this.refAt(T);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!at) {
      ctx.fillStyle = '#1a0c3a';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    const { ref, local } = at;
    const trn = ref.shot.transition;
    const prev = ref.gi > 0 ? this.flat[ref.gi - 1] : null;
    if (trn.kind !== 'cut' && local < trn.dur && (prev || trn.kind === 'fade' || trn.kind === 'iris')) {
      const k = local / trn.dur;
      const A = this.buf('a', W, H);
      const B = this.buf('b', W, H);
      const ax = A.getContext('2d')!;
      const bx = B.getContext('2d')!;
      if (prev) this.renderShot(ax, W, H, prev, prev.shot.dur - 0.001, o);
      else {
        ax.fillStyle = '#000';
        ax.fillRect(0, 0, W, H);
      }
      this.renderShot(bx, W, H, ref, local, o);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      switch (trn.kind) {
        case 'fade':
          if (k < 0.5) {
            ctx.globalAlpha = 1 - k * 2;
            ctx.drawImage(A, 0, 0);
          } else {
            ctx.globalAlpha = (k - 0.5) * 2;
            ctx.drawImage(B, 0, 0);
          }
          break;
        case 'dissolve':
          ctx.drawImage(A, 0, 0);
          ctx.globalAlpha = k;
          ctx.drawImage(B, 0, 0);
          break;
        case 'slide': {
          const e = ease('inout', k);
          ctx.drawImage(A, -e * W, 0);
          ctx.drawImage(B, (1 - e) * W, 0);
          break;
        }
        case 'zoom': {
          const e = ease('inout', k);
          ctx.save();
          ctx.globalAlpha = 1 - e;
          ctx.translate(W / 2, H / 2);
          ctx.scale(1 + e * 1.6, 1 + e * 1.6);
          ctx.drawImage(A, -W / 2, -H / 2);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = e;
          ctx.translate(W / 2, H / 2);
          ctx.scale(0.4 + e * 0.6, 0.4 + e * 0.6);
          ctx.drawImage(B, -W / 2, -H / 2);
          ctx.restore();
          break;
        }
        case 'iris': {
          const diag = Math.hypot(W, H) / 2;
          const img = k < 0.5 ? A : B;
          const r = k < 0.5 ? (1 - k * 2) * diag : (k - 0.5) * 2 * diag;
          ctx.save();
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, Math.max(0.5, r), 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          break;
        }
      }
      ctx.globalAlpha = 1;
    } else {
      this.renderShot(ctx, W, H, ref, local, o);
    }
    if (o.watermark) drawWatermark(ctx, W, H, t('cin.watermark', 'Feito no Bloop World'));
    ctx.restore();
  }

  /** Um plano completo (cenário + atores + efeitos + balões) em (0,0,W,H). */
  renderShot(ctx: CanvasRenderingContext2D, W: number, H: number, ref: ShotRef, tl: number, o: DrawOpts): void {
    const p = this.p;
    const shot = ref.shot;
    const actors = evalActors(p, ref, tl);
    const [shx, shy] = shakeOffset(shot.fx, tl, W);
    let screens: ActorScreen[];
    if (p.mode === '3d' && this.r3d) {
      screens = this.r3d.render(ctx, W, H, p, ref, tl, actors, shx, shy);
    } else {
      screens = this.render2D(ctx, W, H, ref, tl, actors, shx, shy, o);
    }
    this.lastScreens = screens;
    drawFx(ctx, W, H, shot.fx, tl, screens, o.budget ?? 1);
    if (o.selected) {
      const s = screens.find((a) => a.cast === o.selected);
      if (s && s.visible) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffe14f';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.ppu * 1.2, s.ppu * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (!o.noBubbles) {
      const list: BubbleIn[] = [];
      for (const l of shot.lines) {
        if (tl < l.t || tl > l.t + l.dur || !l.text.trim()) continue;
        const cast = l.cast ? p.cast.find((c) => c.id === l.cast) : undefined;
        const sp = cast ? screens.find((s) => s.cast === cast.id && s.visible) : undefined;
        list.push({
          text: l.text,
          style: l.style,
          age: tl - l.t,
          left: l.t + l.dur - tl,
          speaker: l.style === 'subtitle' || l.style === 'narration' ? undefined : sp,
          name: cast && (l.style === 'subtitle' || !sp) ? cast.name : undefined,
          color: cast?.avatar?.colors.primary ?? '#ffd93b',
        });
      }
      if (list.length) drawBubbles(ctx, W, H, list);
    }
  }

  private render2D(ctx: CanvasRenderingContext2D, W: number, H: number, ref: ShotRef, tl: number, actors: ActorEval[], shx: number, shy: number, o: DrawOpts): ActorScreen[] {
    const cam = evalCam2(ref.shot, tl, actors);
    this.lastCam = cam;
    const ppu = (W / STAGE_W) * cam.zoom;
    const T = ref.start + tl;
    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(ppu, ppu);
    ctx.translate(-cam.cx, -cam.cy);
    drawBg(ctx, ref.scene.bg, ref.scene.light, T, (W / STAGE_W) * (o.bgScale ?? 1.4));
    ctx.restore();
    const toX = (wx: number) => (wx - cam.cx) * ppu + W / 2 + shx;
    const toY = (wy: number) => (wy - cam.cy) * ppu + H / 2 + shy;
    const order = actors.slice().sort((a, b) => a.z - b.z);
    const screens: ActorScreen[] = [];
    for (const a of order) {
      const sx = toX(a.x);
      const fy = floorOf(a.z);
      const sy = toY(fy - Math.max(0, a.y));
      const hpx = actorH(a.z) * ppu;
      blendRig(a.prevPose, a.pose, a.poseW, a.at + a.seed * 0.13, rigTmp);
      if (a.face !== 0) rigTmp.lookX += 0.45;
      const visible = sx > -hpx && sx < W + hpx && sy > -hpx * 0.2 && sy < H + hpx * 2;
      let head = { headY: -hpx, mouthY: -hpx * 0.5 };
      if (visible) {
        ctx.save();
        ctx.translate(sx, sy);
        head = drawActor2D(ctx, a.cast, hpx, { rig: rigTmp, expr: a.expr, talk: a.talk, t: a.at + a.seed * 0.13, face: a.face, blink: a.blink, cap: a.cap, capMouth: a.capMouth });
        ctx.restore();
      }
      screens.push({ cast: a.cast.id, x: sx, y: sy, headY: sy + head.headY, mouthY: sy + head.mouthY, ppu, visible });
    }
    return screens;
  }

  /** Ator sob o toque (px de tela) — o mais à frente. */
  hit(px: number, py: number): string | null {
    let best: string | null = null;
    for (const s of this.lastScreens) {
      if (!s.visible) continue;
      const w = s.ppu * 1.2;
      if (px > s.x - w && px < s.x + w && py > s.headY - s.ppu * 0.3 && py < s.y + s.ppu * 0.3) best = s.cast;
    }
    return best;
  }

  /** Tela → palco (x, z do chão) para arrastar atores em 2D. */
  screenToStage(px: number, W: number): number {
    const cam = this.lastCam;
    const ppu = (W / STAGE_W) * cam.zoom;
    return (px - W / 2) / ppu + cam.cx;
  }

  dispose(): void {
    this.r3d?.dispose();
    this.r3d = null;
    this.bufA = this.bufB = null;
  }
}
