/* ============================================================
 *  PRÉ-VISUALIZAÇÕES DA LOJA — skins e rastros em canvas.
 *  Fundo com brilho pela raridade (raios girando p/ épico+, faíscas p/ mítico).
 * ============================================================ */
import { drawPlayer, type PlayerPose } from './character';
import { makeCanvas, rgba, TAU } from './math';
import { Particles } from './particles';
import { RARITY_INFO, skinById, type Rarity, type Skin, type Trail } from './skins';
import { emitTrail } from './trails';

export interface SkinPreviewOpts {
  mood?: PlayerPose['mood'];
  /** desenha o fundo de raridade (padrão: true) */
  backdrop?: boolean;
  /** reaproveita um canvas existente (animação na loja sem alocar) */
  target?: HTMLCanvasElement;
}

function setup(sizeCss: number, target?: HTMLCanvasElement): [HTMLCanvasElement, CanvasRenderingContext2D, number] {
  const d = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const px = Math.round(sizeCss * d);
  let c: HTMLCanvasElement;
  let x: CanvasRenderingContext2D;
  if (target) {
    c = target;
    if (c.width !== px || c.height !== px) {
      c.width = px;
      c.height = px;
    }
    x = c.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, px, px);
  } else [c, x] = makeCanvas(px, px);
  c.style.width = c.style.height = `${sizeCss}px`;
  x.scale(d, d);
  return [c, x, d];
}

/** Fundo por raridade. (cx, cy) = centro do brilho, S = lado em css px. */
export function drawRarityBackdrop(x: CanvasRenderingContext2D, rarity: Rarity, S: number, cx: number, cy: number, t = 0): void {
  const info = RARITY_INFO[rarity];
  const order = info.order;
  const R = S * 0.5;
  x.save();
  // halo
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, rgba(info.glow, 0.25 + order * 0.08));
  g.addColorStop(0.55, rgba(info.glow, 0.08 + order * 0.03));
  g.addColorStop(1, rgba(info.glow, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  // raios
  if (order >= 2) {
    const n = order >= 4 ? 14 : 10;
    x.save();
    x.translate(cx, cy);
    x.rotate(t * 0.25);
    for (let i = 0; i < n; i++) {
      const col = order >= 4 ? info.gradient[i % 2] : info.glow;
      const rg = x.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
      rg.addColorStop(0, rgba(col, order >= 3 ? 0.28 : 0.18));
      rg.addColorStop(1, rgba(col, 0));
      x.fillStyle = rg;
      const a = (i / n) * TAU;
      const w = TAU / n / (order >= 4 ? 2.6 : 3);
      x.beginPath();
      x.moveTo(0, 0);
      x.arc(0, 0, R, a - w, a + w);
      x.closePath();
      x.fill();
    }
    x.restore();
  }
  // faíscas
  if (order >= 3) {
    const pts = order >= 4 ? 7 : 4;
    for (let i = 0; i < pts; i++) {
      const a = i * 2.39996 + 0.7;
      const rr = R * (0.55 + ((i * 37) % 10) / 30);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.9;
      const tw = Math.max(0, Math.sin(t * 2.5 + i * 1.9));
      if (tw <= 0.05) continue;
      x.globalAlpha = tw;
      x.fillStyle = i % 2 && order >= 4 ? info.gradient[1] : '#ffffff';
      const s = S * 0.035 * (0.6 + tw * 0.6);
      x.beginPath();
      x.moveTo(px, py - s);
      x.quadraticCurveTo(px, py, px + s, py);
      x.quadraticCurveTo(px, py, px, py + s);
      x.quadraticCurveTo(px, py, px - s, py);
      x.quadraticCurveTo(px, py, px, py - s);
      x.fill();
    }
    x.globalAlpha = 1;
  }
  x.restore();
}

/**
 * Pré-visualização de uma skin. `t` controla a animação (respiração, padrões animados);
 * para animar na loja chame repetidamente com o mesmo `opts.target`.
 */
export function renderSkinPreview(skin: Skin, sizeCss: number, t = 0.4, opts: SkinPreviewOpts = {}): HTMLCanvasElement {
  const S = sizeCss;
  const [c, x] = setup(S, opts.target);
  const cx = S / 2;
  const cy = S * 0.57;
  const R = S * 0.22;
  if (opts.backdrop !== false) drawRarityBackdrop(x, skin.rarity, S, cx, cy - R * 0.2, t);
  // sombra no chão
  const sg = x.createRadialGradient(cx, cy + R * 1.08, 0, cx, cy + R * 1.08, R * 0.9);
  sg.addColorStop(0, 'rgba(0,0,0,0.35)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sg;
  x.save();
  x.translate(cx, cy + R * 1.08);
  x.scale(1, 0.3);
  x.translate(-cx, -(cy + R * 1.08));
  x.fillRect(cx - R, cy + R * 0.1, R * 2, R * 2);
  x.restore();
  x.save();
  x.translate(cx, cy);
  const blink = (t % 3.7) > 3.55 ? 1 : 0;
  drawPlayer(x, skin, R, { t, blink, lookX: 0.2 + Math.sin(t * 0.7) * 0.2, lookY: 0.1, sx: 1, sy: 1, mood: opts.mood ?? 'idle', lx: -0.55, ly: -0.83 });
  x.restore();
  return c;
}

let simFx: Particles | null = null;
let simClock = 0;

/** Pré-visualização de rastro: simula o emissor real (trails.ts) ao longo de uma curva. */
export function renderTrailPreview(trail: Trail, sizeCss: number, target?: HTMLCanvasElement): HTMLCanvasElement {
  const S = sizeCss;
  const [c, x] = setup(S, target);
  drawRarityBackdrop(x, trail.rarity, S, S / 2, S / 2, 0.6);
  if (!simFx) simFx = new Particles(500);
  const fx = simFx;
  fx.clear();
  fx.budget = 1;
  simClock += 10;
  // curva no "mundo" (px de jogo), depois escalada para caber no cartão
  const T = 0.62;
  const dt = 1 / 60;
  const pos = (u: number): [number, number] => [-72 + 128 * u, 54 - 92 * u - Math.sin(u * Math.PI) * 22];
  let px = 0;
  let py = 0;
  let vx = 0;
  let vy = 0;
  for (let k = 0; k * dt <= T; k++) {
    const u = (k * dt) / T;
    const [ax, ay] = pos(u);
    const [bx, by] = pos(Math.min(1, u + 0.01));
    vx = ((bx - ax) / (0.01 * T)) || vx;
    vy = ((by - ay) / (0.01 * T)) || vy;
    px = ax;
    py = ay;
    emitTrail(fx, trail, px, py, vx, vy, simClock + k * dt, 15);
    fx.update(dt);
  }
  const k = S / 165;
  x.save();
  x.translate(S / 2, S / 2);
  x.scale(k, k);
  fx.draw(x);
  // personagem na ponta
  x.translate(px, py);
  x.rotate(Math.atan2(vy, vx) + Math.PI / 2);
  drawPlayer(x, skinById('bloop'), 15, { t: 0.3, blink: 0, lookX: 0, lookY: -1, sx: 0.9, sy: 1.12, mood: 'fly', lx: -0.55, ly: -0.83, still: true });
  x.restore();
  fx.clear();
  return c;
}
