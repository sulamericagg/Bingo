/**
 * Vitrine do hub: cano + anéis girando, Bloop quica e mergulha pela abertura em loop.
 * Leve: sprites dos 4 anéis de exemplo ficam em cache por tamanho; nada pesado por frame.
 */
import { drawPlayer, type PlayerPose } from '../../game/character';
import { skinById } from '../../game/skins';
import { save } from '../../core/storage';
import { FRONT, drawPipe, drawRingSides, drawRingTop, genRing, makeGeo, makeZoneStyle, renderRingSprite, type Geo, type Ring, type ZoneStyle } from './rings';

interface Cache {
  key: string;
  geo: Geo;
  rings: Ring[];
  styles: ZoneStyle[];
}
const caches = new WeakMap<CanvasRenderingContext2D, Cache>();
const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.3, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };
const ZSEQ = [0, 0, 2, 2];
const CYCLE = 1.5;
const SMASH_AT = 0.62;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function build(ctx: CanvasRenderingContext2D, w: number, h: number): Cache {
  const res = Math.min(2, window.devicePixelRatio || 1);
  const geo = makeGeo(Math.min(w * 0.36, h * 0.26), res);
  const rnd = seeded(7);
  const rings: Ring[] = [];
  for (let i = 0; i < 4; i++) {
    const r = genRing(9 + i, geo, rnd, ZSEQ[i]);
    r.items.length = 0;
    r.sprite = document.createElement('canvas');
    rings.push(r);
  }
  const styles = [0, 2].map((z) => makeZoneStyle(ctx, z, geo));
  rings.forEach((r) => renderRingSprite(r, geo, styles[r.zone === 0 ? 0 : 1], r.sprite!));
  return { key: `${w}x${h}`, geo, rings, styles };
}

export function drawTuboShowcase(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  let c = caches.get(ctx);
  if (!c || c.key !== `${w}x${h}`) {
    c = build(ctx, w, h);
    caches.set(ctx, c);
  }
  const { geo, rings, styles } = c;
  const n = Math.floor(t / CYCLE);
  const p = t / CYCLE - n;
  const surf = geo.k * geo.rMid;
  // câmera: pousa no anel n, cai até n+1 depois do mergulho
  const fallP = p > SMASH_AT ? Math.min(1, (p - SMASH_AT) / (1 - SMASH_AT)) : 0;
  const ease = fallP * fallP;
  const camWorld = (n + (p > SMASH_AT ? fallP * fallP * (3 - 2 * fallP) : 0)) * geo.spacing;
  const anchorY = h * 0.42;
  const cx = w / 2;

  ctx.save();
  ctx.translate(cx, anchorY - camWorld - surf);
  const yTopScreen = camWorld + surf - anchorY - 10;
  // anéis n-1 (estilhaçando) .. n+3, de baixo para cima
  for (let j = n + 3; j >= n - 1; j--) {
    const r = rings[((j % 4) + 4) % 4];
    const y = j * geo.spacing;
    const st = styles[r.zone === 0 ? 0 : 1];
    // a abertura do anel j passa na frente do personagem no momento do mergulho dele
    const tSmash = (j + SMASH_AT) * CYCLE;
    r.rot = FRONT - r.segs[0].a1 / 2 + r.speed * 0.8 * (t - tSmash);
    const passed = t > tSmash;
    const yTop = j > n - 1 ? (j - 1) * geo.spacing : yTopScreen;
    ctx.save();
    ctx.translate(0, y);
    if (!passed) {
      drawRingSides(ctx, r, geo, st);
      drawRingTop(ctx, r, geo);
    } else {
      // anel atravessado: abre e some
      const q = Math.min(1, (t - tSmash) / 0.35);
      if (q < 1) {
        ctx.globalAlpha = 1 - q;
        ctx.save();
        ctx.scale(1 + q * 0.5, 1 + q * 0.5);
        drawRingTop(ctx, r, geo);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    drawPipe(ctx, geo, st, yTop - y, 0, true);
    ctx.restore();
  }
  // personagem
  const R = geo.R;
  let foot: number;
  let sq = 0;
  if (p <= SMASH_AT) {
    const hp = (p / SMASH_AT) * 2; // 2 quiques
    const ph = hp - Math.floor(hp);
    const off = Math.sin(Math.PI * Math.min(1, ph * (p > SMASH_AT * 0.75 ? 1.6 : 1))) * R * 1.4;
    foot = n * geo.spacing + surf - off;
    sq = ph < 0.12 ? 0.25 * (1 - ph / 0.12) : 0;
    pose.mood = 'idle';
  } else {
    foot = (n + ease) * geo.spacing + surf;
    sq = -0.18;
    pose.mood = 'fly';
  }
  pose.t = t;
  pose.sx = 1 + sq;
  pose.sy = 1 - sq;
  pose.blink = t % 3.3 > 3.18 ? 1 : 0;
  ctx.save();
  ctx.translate(0, foot - R * 1.04 * pose.sy);
  drawPlayer(ctx, skinById(save.skin), R, pose);
  ctx.restore();
  ctx.restore();
}
