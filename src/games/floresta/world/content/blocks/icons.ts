/* ============================================================
 *  BLOCOS — ícones de inventário gerados por canvas (estilo Bloop:
 *  contorno roxo-escuro, cores do próprio atlas procedural).
 *  - duros: cubinho isométrico com quinas vivas e brilho na aresta
 *  - macios: cubinho "fofo" (cantos arredondados)
 *  - plantas: o sprite com contorno
 *  - formas: as próprias caixas (tocha, cerca, porta…) em isométrico
 * ============================================================ */
import { buildAtlas, TILE } from './atlas';
import { ATLAS_COLS, block, blockDef } from './registry';
import { shapeBoxes, type Box } from './shapes';
import { Group, Render, type BlockDef } from './types';

const INK = '#2a0b5c';
const urls = new Map<string, string>();

type V3 = [number, number, number];

/** desenha o ícone do bloco em ctx (quadrado size×size com canto em x,y) */
export function drawBlockIcon(ctx: CanvasRenderingContext2D, num: number, x: number, y: number, size: number): void {
  const d = blockDef(num);
  const atlas = buildAtlas();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (d.render === Render.Cross) sprite(ctx, d, atlas.colorCanvas);
  else if (d.render === Render.Shape && d.shape && d.shape !== 'cube' && d.shape !== 'cactus') boxes(ctx, d, atlas.colorCanvas, shapeBoxes(d.shape, d.shape === 'fence' || d.shape === 'pane' ? 1 | 2 : 0));
  else cube(ctx, d, atlas.colorCanvas, d.render === Render.Soft);
  ctx.restore();
}

/** canvas do ícone (novo a cada chamada) */
export function blockIcon(idOrNum: string | number, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const n = typeof idOrNum === 'number' ? idOrNum : (block(idOrNum)?.num ?? 0);
  drawBlockIcon(c.getContext('2d')!, n, 0, 0, size);
  return c;
}

/** dataURL em cache (para <img> no inventário) */
export function blockIconURL(id: string, size = 64): string {
  const k = id + '@' + size;
  let u = urls.get(k);
  if (!u) {
    u = blockIcon(id, size).toDataURL();
    urls.set(k, u);
  }
  return u;
}

/* ------------------------------ isométrico ------------------------------ */
const K = 26; // tamanho do cubo em px (ícone 64)
const proj = (p: V3): [number, number] => [32 + (p[0] - p[2]) * K * 0.866, 33 + (p[0] + p[2] - 1) * K * 0.5 - (p[1] - 0.5) * K];

function tileXY(t: number): [number, number] {
  return [(t % ATLAS_COLS) * TILE, Math.floor(t / ATLAS_COLS) * TILE];
}

/** desenha o ladrilho t no paralelogramo origem o, eixos u (→) e v (↓) do ladrilho */
function face(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, t: number, o: V3, u: V3, v: V3, shade: number, tint: string | undefined, glass: boolean, sub?: [number, number, number, number]): void {
  const [ox, oy] = proj(o);
  const [ux, uy] = proj([o[0] + u[0], o[1] + u[1], o[2] + u[2]]);
  const [vx, vy] = proj([o[0] + v[0], o[1] + v[1], o[2] + v[2]]);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ux, uy);
    ctx.lineTo(ux + vx - ox, uy + vy - oy);
    ctx.lineTo(vx, vy);
    ctx.closePath();
  };
  ctx.save();
  path();
  ctx.clip();
  if (glass) {
    ctx.fillStyle = 'rgba(200,236,255,.45)';
    ctx.fill();
  }
  const [tx, ty] = tileXY(t);
  const [s0, s1, s2, s3] = sub ?? [0, 0, 1, 1];
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([(ux - ox) / ((s2 - s0) * TILE), (uy - oy) / ((s2 - s0) * TILE), (vx - ox) / ((s3 - s1) * TILE), (vy - oy) / ((s3 - s1) * TILE), ox, oy])));
  ctx.drawImage(img, tx + s0 * TILE, ty + s1 * TILE, (s2 - s0) * TILE, (s3 - s1) * TILE, 0, 0, (s2 - s0) * TILE, (s3 - s1) * TILE);
  ctx.restore();
  ctx.save();
  path();
  if (tint) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (shade > 0) {
    ctx.fillStyle = `rgba(20,0,50,${shade})`;
    ctx.fill();
  }
  ctx.restore();
}

function cube(ctx: CanvasRenderingContext2D, d: BlockDef, img: HTMLCanvasElement, soft: boolean): void {
  const glass = d.group === Group.Glass;
  // sombra no chão
  ctx.fillStyle = 'rgba(42,11,92,.18)';
  ctx.beginPath();
  ctx.ellipse(32, 58, 24, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const pts = ([[0, 1, 0], [1, 1, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 1]] as V3[]).map(proj);
  const outline = () => {
    ctx.beginPath();
    if (soft) {
      // cantos fofos (arcTo entre os pontos médios)
      const n = pts.length;
      const mid = (i: number) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
      const m0 = mid(n - 1);
      ctx.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) {
        const m = mid(i);
        ctx.arcTo(pts[i][0], pts[i][1], m[0], m[1], 9);
      }
    } else pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
  };
  ctx.save();
  if (soft) {
    outline();
    ctx.clip();
  }
  const ti = d.tiles;
  face(ctx, img, ti.top, [0, 1, 0], [1, 0, 0], [0, 0, 1], 0, d.tint, glass);
  face(ctx, img, d.render === Render.Shape ? ti.front : ti.side, [0, 1, 1], [1, 0, 0], [0, -1, 0], 0.16, d.tint, glass);
  face(ctx, img, ti.side, [1, 1, 1], [0, 0, -1], [0, -1, 0], 0.32, d.tint, glass);
  ctx.restore();
  // brilho nas arestas de cima
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 2;
  const [a, b, c] = ([[0, 1, 1], [1, 1, 1], [1, 1, 0]] as V3[]).map(proj);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.moveTo(b[0], b[1]);
  const bot = proj([1, 0, 1]);
  ctx.lineTo(b[0] + (bot[0] - b[0]) * 0.25, b[1] + (bot[1] - b[1]) * 0.25);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = soft ? 4 : 3;
  outline();
  ctx.stroke();
  if (d.light >= 8) glow(ctx, d.lightColor, 32, 32, 30);
}

function boxes(ctx: CanvasRenderingContext2D, d: BlockDef, img: HTMLCanvasElement, bxs: Box[]): void {
  ctx.fillStyle = 'rgba(42,11,92,.18)';
  ctx.beginPath();
  ctx.ellipse(32, 58, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (d.light >= 8) glow(ctx, d.lightColor, 32, 26, 26);
  // de trás para a frente
  const order = [...bxs].sort((a, b) => a.a[0] + a.a[2] + a.a[1] * 0.2 - (b.a[0] + b.a[2] + b.a[1] * 0.2));
  const glass = d.group === Group.Glass;
  for (const b of order) {
    const [x0, y0, z0] = b.a;
    const [x1, y1, z1] = b.b;
    const tk = b.topK ?? 1;
    const bk = b.botK ?? 1;
    const ti = d.tiles;
    const tTop = b.tile === 1 ? ti.side : b.tile === 3 ? ti.front : ti.top;
    const tSide = b.tile === 2 ? ti.top : b.tile === 3 ? ti.front : ti.side;
    const tFront = b.tile === 0 ? ti.front : tSide;
    if (tk !== 1 || bk !== 1) {
      // pontas (estalactite, cristal): pirâmide chapada
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const hx = (x1 - x0) / 2;
      const hz = (z1 - z0) / 2;
      const ring = (y: number, k: number) => ([[cx - hx * k, y, cz + hz * k], [cx + hx * k, y, cz + hz * k], [cx + hx * k, y, cz - hz * k]] as V3[]).map(proj);
      const lo = ring(y0, bk);
      const hi = ring(y1, tk);
      const avg = buildAtlas().avg;
      const col = `rgb(${avg[tSide * 4] | 0},${avg[tSide * 4 + 1] | 0},${avg[tSide * 4 + 2] | 0})`;
      for (const [i, sh] of [
        [0, 0.12],
        [1, 0.3],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(lo[i][0], lo[i][1]);
        ctx.lineTo(lo[i + 1][0], lo[i + 1][1]);
        ctx.lineTo(hi[i + 1][0], hi[i + 1][1]);
        ctx.lineTo(hi[i][0], hi[i][1]);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
        ctx.fillStyle = `rgba(20,0,50,${sh})`;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      continue;
    }
    face(ctx, img, tTop, [x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], 0, d.tint, glass, [x0, z0, x1, z1]);
    face(ctx, img, tFront, [x0, y1, z1], [x1 - x0, 0, 0], [0, y0 - y1, 0], 0.16, d.tint, glass, [x0, 1 - y1, x1, 1 - y0]);
    face(ctx, img, tSide, [x1, y1, z1], [0, 0, z0 - z1], [0, y0 - y1, 0], 0.32, d.tint, glass, [1 - z1, 1 - y1, 1 - z0, 1 - y0]);
    const pts = ([[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z1]] as V3[]).map(proj);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function sprite(ctx: CanvasRenderingContext2D, d: BlockDef, img: HTMLCanvasElement): void {
  const [tx, ty] = tileXY(d.tiles.side);
  // silhueta de contorno: o sprite pintado de tinta, deslocado em volta
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const sx = s.getContext('2d')!;
  sx.imageSmoothingEnabled = false;
  sx.drawImage(img, tx, ty, TILE, TILE, 4, 2, 56, 56);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = INK;
  sx.fillRect(0, 0, 64, 64);
  if (d.light >= 4) glow(ctx, d.lightColor, 32, 30, 26);
  for (const [ox, oy] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ])
    ctx.drawImage(s, ox, oy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, tx, ty, TILE, TILE, 4, 2, 56, 56);
}

function glow(ctx: CanvasRenderingContext2D, col: string, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col + 'aa');
  g.addColorStop(1, col + '00');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
